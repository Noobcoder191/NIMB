require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTROL_PANEL_PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
let NIM_API_KEY = process.env.NIM_API_KEY || '';

// Use user's home directory for settings - always writable
const SETTINGS_DIR = path.join(os.homedir(), '.nimb');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure settings directory exists
try {
    if (!fs.existsSync(SETTINGS_DIR)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
} catch (e) {
    console.error('Failed to create settings dir:', e.message);
}

console.log('=== NIMB Settings ===');
console.log('Settings directory:', SETTINGS_DIR);
console.log('Settings file:', SETTINGS_FILE);

// Load settings from file
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            console.log('Loaded settings from:', SETTINGS_FILE);
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load settings:', e.message);
    }
    return null;
}

// Save settings to file
function saveSettings() {
    try {
        const data = {
            apiKey: NIM_API_KEY,
            ...config,
            setupComplete: true
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
        console.log('Settings saved to:', SETTINGS_FILE);
        return true;
    } catch (e) {
        console.error('Failed to save settings:', e.message);
        return false;
    }
}

// Initialize config
const savedSettings = loadSettings();
let config = {
    showReasoning: savedSettings?.showReasoning ?? false,
    enableThinking: savedSettings?.enableThinking ?? false,
    logRequests: savedSettings?.logRequests ?? true,
    maxTokens: savedSettings?.maxTokens ?? 4096,
    temperature: savedSettings?.temperature ?? 0.7,
    streamingEnabled: savedSettings?.streamingEnabled ?? true,
    currentModel: savedSettings?.currentModel ?? 'deepseek-ai/deepseek-v3.2'
};

if (savedSettings?.apiKey) {
    NIM_API_KEY = savedSettings.apiKey;
}

let tunnelState = { url: null, status: 'stopped', process: null };
const serverStartTime = Date.now();

let usageStats = {
    messageCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    errorCount: 0,
    lastRequestTime: null,
    startTime: new Date().toISOString(),
    errorLog: []
};

const MODEL_MAPPING = {
    'gpt-4o': 'deepseek-ai/deepseek-v3.2',
    'gpt-4': 'deepseek-ai/deepseek-v3.2',
    'gpt-4-turbo': 'deepseek-ai/deepseek-v3.2',
    'deepseek-chat': 'deepseek-ai/deepseek-v3.2',
    'deepseek-v3.2': 'deepseek-ai/deepseek-v3.2'
};

app.get('/health', (req, res) => {
    res.json({
        status: 'ok', service: 'NIMB', model: config.currentModel,
        api_key_configured: !!NIM_API_KEY, config, stats: usageStats,
        tunnel: { url: tunnelState.url, status: tunnelState.status },
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        setupComplete: !!savedSettings?.setupComplete || !!NIM_API_KEY
    });
});

app.get('/', (req, res) => res.json({ message: 'NIMB API Proxy', endpoints: { health: '/health', models: '/v1/models', chat: '/v1/chat/completions' } }));

app.get('/v1/models', (req, res) => {
    res.json({ object: 'list', data: [] });
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        if (!NIM_API_KEY) {
            usageStats.errorCount++;
            usageStats.errorLog.unshift({ timestamp: new Date().toISOString(), message: 'API key not configured', code: 500 });
            if (usageStats.errorLog.length > 50) usageStats.errorLog.pop();
            return res.status(500).json({ error: { message: 'API key not configured.', type: 'configuration_error', code: 500 } });
        }

        const { model, messages, ...clientParams } = req.body;
        const nimModel = config.currentModel || MODEL_MAPPING[model] || 'deepseek-ai/deepseek-v3.2';
        if (config.logRequests) console.log(`[NIMB] ${model} -> ${nimModel}`);

        // Build request: client params override NIMB defaults
        const nimRequest = {
            model: nimModel,
            messages,
            // Use client values if provided, otherwise fall back to NIMB config
            temperature: clientParams.temperature ?? config.temperature,
            max_tokens: clientParams.max_tokens || config.maxTokens,
            stream: clientParams.stream ?? config.streamingEnabled
        };

        // Pass through all supported OpenAI/NIM parameters
        const passthroughParams = [
            'top_p', 'top_k', 'frequency_penalty', 'presence_penalty',
            'repetition_penalty', 'min_p', 'seed', 'stop', 'logit_bias',
            'n', 'user', 'response_format'
        ];
        passthroughParams.forEach(param => {
            if (clientParams[param] !== undefined) {
                nimRequest[param] = clientParams[param];
            }
        });

        // Handle extra_body for thinking mode (merge client + NIMB config)
        if (clientParams.extra_body || config.enableThinking) {
            nimRequest.extra_body = {
                ...(clientParams.extra_body || {}),
                ...(config.enableThinking ? { chat_template_kwargs: { thinking: true } } : {})
            };
        }

        const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
            headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
            responseType: nimRequest.stream ? 'stream' : 'json', timeout: 120000
        });

        usageStats.messageCount++;
        usageStats.lastRequestTime = new Date().toISOString();

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            let buffer = '';
            response.data.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        if (line.includes('[DONE]')) { res.write(line + '\n\n'); return; }
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.choices?.[0]?.delta?.reasoning_content) {
                                if (config.showReasoning) {
                                    const r = data.choices[0].delta.reasoning_content;
                                    data.choices[0].delta.content = data.choices[0].delta.content ? `<think>${r}</think>\n\n${data.choices[0].delta.content}` : `<think>${r}</think>`;
                                }
                                delete data.choices[0].delta.reasoning_content;
                            }
                            if (data.usage) {
                                usageStats.promptTokens += data.usage.prompt_tokens || 0;
                                usageStats.completionTokens += data.usage.completion_tokens || 0;
                                usageStats.totalTokens += data.usage.total_tokens || 0;
                            }
                            res.write(`data: ${JSON.stringify(data)}\n\n`);
                        } catch (e) { res.write(line + '\n\n'); }
                    }
                });
            });
            response.data.on('end', () => { if (config.logRequests) console.log('[NIMB] Done'); res.end(); });
            response.data.on('error', (err) => {
                usageStats.errorCount++;
                usageStats.errorLog.unshift({ timestamp: new Date().toISOString(), message: err.message, code: 500 });
                if (usageStats.errorLog.length > 50) usageStats.errorLog.pop();
                res.end();
            });
        } else {
            const openaiResponse = {
                id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
                choices: response.data.choices.map(choice => {
                    let content = choice.message.content || '';
                    if (config.showReasoning && choice.message?.reasoning_content) content = `<think>\n${choice.message.reasoning_content}\n</think>\n\n${content}`;
                    return { index: choice.index, message: { role: choice.message.role, content }, finish_reason: choice.finish_reason };
                }),
                usage: response.data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            };
            if (response.data.usage) {
                usageStats.promptTokens += response.data.usage.prompt_tokens || 0;
                usageStats.completionTokens += response.data.usage.completion_tokens || 0;
                usageStats.totalTokens += response.data.usage.total_tokens || 0;
            }
            if (config.logRequests) console.log('[NIMB] Done');
            res.json(openaiResponse);
        }
    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        const code = error.response?.status || 500;
        usageStats.errorCount++;
        usageStats.errorLog.unshift({ timestamp: new Date().toISOString(), message: msg, code });
        if (usageStats.errorLog.length > 50) usageStats.errorLog.pop();
        res.status(code).json({ error: { message: msg, type: 'api_error', code } });
    }
});

app.all('*', (req, res) => res.status(404).json({ error: { message: `Endpoint ${req.path} not found.`, type: 'invalid_request_error', code: 404 } }));

app.listen(PORT, () => {
    console.log(`🚀 NIMB Proxy on port ${PORT}`);
});

// Control Panel
const controlApp = express();
controlApp.use(cors());
controlApp.use(express.json());

controlApp.use(express.static(path.join(__dirname, 'public')));

// Health endpoint for the control panel
controlApp.get('/health', (req, res) => {
    res.json({
        status: 'ok', service: 'NIMB', model: config.currentModel,
        api_key_configured: !!NIM_API_KEY, config, stats: usageStats,
        tunnel: { url: tunnelState.url, status: tunnelState.status },
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        setupComplete: !!NIM_API_KEY
    });
});

// Check if setup is complete
controlApp.get('/setup-status', (req, res) => {
    res.json({ setupComplete: !!NIM_API_KEY, hasApiKey: !!NIM_API_KEY });
});

// Complete setup
controlApp.post('/setup', (req, res) => {
    console.log('Setup request received:', req.body);
    const { apiKey, model } = req.body;
    if (apiKey) NIM_API_KEY = apiKey.trim();
    if (model) config.currentModel = model.trim();
    const saved = saveSettings();
    console.log('Setup save result:', saved);
    res.json({ success: saved });
});

controlApp.get('/config', (req, res) => res.json(config));
controlApp.post('/config', (req, res) => {
    const c = req.body;
    if (typeof c.showReasoning === 'boolean') config.showReasoning = c.showReasoning;
    if (typeof c.enableThinking === 'boolean') config.enableThinking = c.enableThinking;
    if (typeof c.logRequests === 'boolean') config.logRequests = c.logRequests;
    if (typeof c.streamingEnabled === 'boolean') config.streamingEnabled = c.streamingEnabled;
    if (typeof c.maxTokens === 'number' && c.maxTokens > 0) config.maxTokens = c.maxTokens;
    if (typeof c.temperature === 'number' && c.temperature >= 0 && c.temperature <= 1) config.temperature = c.temperature;
    saveSettings();
    res.json({ success: true, config });
});

controlApp.get('/model', (req, res) => res.json({ model: config.currentModel }));
controlApp.post('/model', (req, res) => {
    const { model } = req.body;
    if (model && typeof model === 'string') {
        config.currentModel = model.trim();
        saveSettings();
        res.json({ success: true, model: config.currentModel });
    }
    else res.status(400).json({ error: 'Invalid model' });
});

controlApp.post('/apikey', (req, res) => {
    const { apiKey } = req.body;
    if (apiKey && typeof apiKey === 'string') {
        NIM_API_KEY = apiKey.trim();
        saveSettings();
        res.json({ success: true });
    }
    else res.status(400).json({ error: 'Invalid key' });
});

controlApp.get('/stats', (req, res) => res.json(usageStats));
controlApp.post('/stats/reset', (req, res) => {
    usageStats = { messageCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errorCount: 0, lastRequestTime: null, startTime: new Date().toISOString(), errorLog: [] };
    res.json({ success: true });
});

controlApp.get('/tunnel', (req, res) => res.json({ url: tunnelState.url, status: tunnelState.status }));
controlApp.post('/tunnel/start', (req, res) => {
    if (tunnelState.status === 'running') return res.json({ success: true, url: tunnelState.url, status: 'running' });
    tunnelState.status = 'starting';

    // Find cloudflared.exe: check exe directory (from env), then resources
    const exeDir = process.env.NIMB_DATA_PATH || __dirname;
    let cfPath = path.join(exeDir, 'cloudflared.exe');
    if (!fs.existsSync(cfPath) && process.resourcesPath) {
        cfPath = path.join(process.resourcesPath, 'cloudflared.exe');
    }
    console.log('Looking for cloudflared at:', cfPath, 'Exists:', fs.existsSync(cfPath));

    if (!fs.existsSync(cfPath)) {
        tunnelState.status = 'stopped';
        return res.json({ success: false, error: 'cloudflared.exe not found. Place it next to NIMB.exe' });
    }

    const cf = spawn(cfPath, ['tunnel', '--url', `http://localhost:${PORT}`], { shell: true, windowsHide: true });
    tunnelState.process = cf;
    cf.stderr.on('data', (d) => {
        const output = d.toString();
        console.log('Cloudflared:', output);
        const m = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) { tunnelState.url = m[0]; tunnelState.status = 'running'; }
    });
    cf.on('error', (err) => {
        console.error('Cloudflared error:', err);
        tunnelState.status = 'stopped';
    });
    cf.on('close', () => { tunnelState.status = 'stopped'; tunnelState.url = null; tunnelState.process = null; });
    res.json({ success: true, status: 'starting' });
});
controlApp.post('/tunnel/stop', (req, res) => {
    if (tunnelState.process) { tunnelState.process.kill(); tunnelState.process = null; tunnelState.status = 'stopped'; tunnelState.url = null; }
    res.json({ success: true, status: 'stopped' });
});

controlApp.listen(CONTROL_PANEL_PORT, () => console.log(`🎛️  NIMB Control Panel: http://localhost:${CONTROL_PANEL_PORT}`));
