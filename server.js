require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTROL_PANEL_PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
let NIM_API_KEY = process.env.NIM_API_KEY;

let config = {
  showReasoning: false,
  enableThinking: false,
  logRequests: true,
  maxTokens: 4096,
  temperature: 0.7,
  streamingEnabled: true,
  currentModel: 'deepseek-ai/deepseek-v3.2'
};

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
    status: 'ok', service: 'NIM API Proxy', model: config.currentModel,
    api_key_configured: !!NIM_API_KEY, config, stats: usageStats,
    tunnel: { url: tunnelState.url, status: tunnelState.status },
    uptime: Math.floor((Date.now() - serverStartTime) / 1000)
  });
});

app.get('/', (req, res) => res.json({ message: 'NIM API Proxy', endpoints: { health: '/health', models: '/v1/models', chat: '/v1/chat/completions' } }));

app.get('/v1/models', (req, res) => {
  res.json({ object: 'list', data: [] });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      usageStats.errorCount++;
      usageStats.errorLog.unshift({ timestamp: new Date().toISOString(), message: 'API key not configured', code: 500 });
      if (usageStats.errorLog.length > 50) usageStats.errorLog.pop();
      return res.status(500).json({ error: { message: 'NIM_API_KEY not configured.', type: 'configuration_error', code: 500 } });
    }

    const { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty } = req.body;
    const nimModel = config.currentModel || MODEL_MAPPING[model] || 'deepseek-ai/deepseek-v3.2';
    if (config.logRequests) console.log(`[Proxy] ${model} -> ${nimModel}`);

    const nimRequest = { model: nimModel, messages, temperature: temperature ?? config.temperature, max_tokens: max_tokens || config.maxTokens, stream: stream ?? config.streamingEnabled };
    if (top_p !== undefined) nimRequest.top_p = top_p;
    if (frequency_penalty !== undefined) nimRequest.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) nimRequest.presence_penalty = presence_penalty;
    if (config.enableThinking) nimRequest.extra_body = { chat_template_kwargs: { thinking: true } };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json', timeout: 120000
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
      response.data.on('end', () => { if (config.logRequests) console.log('[Proxy] Done'); res.end(); });
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
      if (config.logRequests) console.log('[Proxy] Done');
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
  console.log(`🚀 NIM API Proxy on port ${PORT}`);
  console.log(`🎛️  Control Panel: http://localhost:${CONTROL_PANEL_PORT}`);
});

// Control Panel
const controlApp = express();
controlApp.use(cors());
controlApp.use(express.json());

controlApp.get('/', (req, res) => res.send(getHTML()));
controlApp.get('/config', (req, res) => res.json(config));
controlApp.post('/config', (req, res) => {
  const c = req.body;
  if (typeof c.showReasoning === 'boolean') config.showReasoning = c.showReasoning;
  if (typeof c.enableThinking === 'boolean') config.enableThinking = c.enableThinking;
  if (typeof c.logRequests === 'boolean') config.logRequests = c.logRequests;
  if (typeof c.streamingEnabled === 'boolean') config.streamingEnabled = c.streamingEnabled;
  if (typeof c.maxTokens === 'number' && c.maxTokens > 0) config.maxTokens = c.maxTokens;
  if (typeof c.temperature === 'number' && c.temperature >= 0 && c.temperature <= 1) config.temperature = c.temperature;
  res.json({ success: true, config });
});
controlApp.get('/model', (req, res) => res.json({ model: config.currentModel }));
controlApp.post('/model', (req, res) => {
  const { model } = req.body;
  if (model && typeof model === 'string') { config.currentModel = model.trim(); res.json({ success: true, model: config.currentModel }); }
  else res.status(400).json({ error: 'Invalid model' });
});
controlApp.post('/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (apiKey && typeof apiKey === 'string') { NIM_API_KEY = apiKey.trim(); res.json({ success: true }); }
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
  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { shell: true });
  tunnelState.process = cf;
  cf.stderr.on('data', (d) => { const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) { tunnelState.url = m[0]; tunnelState.status = 'running'; } });
  cf.on('close', () => { tunnelState.status = 'stopped'; tunnelState.url = null; tunnelState.process = null; });
  res.json({ success: true, status: 'starting' });
});
controlApp.post('/tunnel/stop', (req, res) => {
  if (tunnelState.process) { tunnelState.process.kill(); tunnelState.process = null; tunnelState.status = 'stopped'; tunnelState.url = null; }
  res.json({ success: true, status: 'stopped' });
});
controlApp.listen(CONTROL_PANEL_PORT, () => console.log(`🎛️  Control Panel: http://localhost:${CONTROL_PANEL_PORT}`));

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NIM Proxy</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0a0b0d;--bg2:#0f1012;--bg3:#151619;--card:rgba(20,21,24,0.95);--accent:#76b900;--accent2:#8bc34a;--blue:#60a5fa;--text:#e4e4e7;--text2:#71717a;--text3:#3f3f46;--border:rgba(255,255,255,0.05);--success:#22c55e;--error:#ef4444;--warn:#f59e0b}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}
    .sidebar{width:220px;background:var(--bg2);border-right:1px solid var(--border);padding:20px 0;display:flex;flex-direction:column}
    .logo{padding:0 20px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}
    .logo-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--accent),#5a8f00);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
    .logo-text{font-weight:700;font-size:15px}
    .logo-text span{color:var(--text2);font-weight:400}
    .nav{flex:1;padding:16px 0}
    .nav-item{display:flex;align-items:center;gap:10px;padding:12px 20px;color:var(--text2);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;border-left:2px solid transparent}
    .nav-item:hover{background:rgba(118,185,0,0.05);color:var(--text)}
    .nav-item.active{background:rgba(118,185,0,0.08);color:var(--accent);border-left-color:var(--accent)}
    .nav-icon{font-size:16px}
    .sidebar-footer{padding:16px 20px;border-top:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text3)}
    .sidebar-footer div{margin-bottom:4px}
    .sidebar-footer .val{color:var(--accent)}
    .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .header-left{display:flex;align-items:center;gap:16px}
    .page-title{font-size:18px;font-weight:600;font-family:'JetBrains Mono',monospace;text-transform:lowercase}
    .status-badge{display:flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:4px;font-size:11px;font-weight:600;color:var(--success);text-transform:uppercase}
    .status-badge::before{content:'';width:6px;height:6px;background:var(--success);border-radius:50%;animation:blink 2s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
    .header-right{display:flex;align-items:center;gap:16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2)}
    .uptime{color:var(--accent)}
    .content{flex:1;overflow-y:auto;padding:20px 24px}
    .page{display:none;animation:fadeIn 0.2s}
    .page.active{display:block}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .stat-box{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
    .stat-label{font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .stat-value{font-size:24px;font-weight:700;font-family:'JetBrains Mono',monospace}
    .stat-value.green{color:var(--accent)}
    .stat-value.blue{color:var(--blue)}
    .stat-value.red{color:var(--error)}
    .stat-sub{font-size:10px;color:var(--text2);margin-top:2px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px}
    .card-title{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;display:flex;align-items:center;gap:6px}
    .card-title::before{content:'';width:3px;height:12px;background:var(--accent);border-radius:2px}
    .setting-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--border)}
    .setting-row:last-child{border-bottom:none}
    .setting-info h4{font-size:13px;font-weight:500;margin-bottom:2px}
    .setting-info p{font-size:11px;color:var(--text2)}
    .toggle{position:relative;width:40px;height:22px}
    .toggle input{opacity:0;width:0;height:0}
    .toggle-track{position:absolute;cursor:pointer;inset:0;background:var(--bg3);border-radius:22px;transition:0.2s}
    .toggle-track::before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:var(--text2);border-radius:50%;transition:0.2s}
    input:checked+.toggle-track{background:var(--accent)}
    input:checked+.toggle-track::before{transform:translateX(18px);background:#fff}
    .input-row{margin-bottom:14px}
    .input-label{display:block;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .input-field{width:100%;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:inherit}
    .input-field:focus{outline:none;border-color:var(--accent)}
    .slider-row{display:flex;align-items:center;gap:12px}
    .slider{flex:1;height:4px;-webkit-appearance:none;background:var(--bg3);border-radius:2px}
    .slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:var(--accent);border-radius:50%;cursor:pointer}
    .slider-val{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);min-width:40px;text-align:right}
    .btn{padding:8px 16px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s}
    .btn-primary{background:var(--accent);color:#000}
    .btn-primary:hover{background:var(--accent2)}
    .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text2)}
    .btn-ghost:hover{border-color:var(--accent);color:var(--text)}
    .btn-danger{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:var(--error)}
    .btn-group{display:flex;gap:8px;margin-top:16px}
    .tunnel-box{background:rgba(96,165,250,0.05);border:1px solid rgba(96,165,250,0.15);border-radius:6px;padding:12px}
    .tunnel-status{display:flex;align-items:center;gap:8px;font-size:12px}
    .tunnel-dot{width:8px;height:8px;border-radius:50%;background:var(--text3)}
    .tunnel-dot.on{background:var(--success)}
    .tunnel-dot.starting{background:var(--warn)}
    .tunnel-url{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--blue);margin-top:8px;padding:8px;background:rgba(0,0,0,0.3);border-radius:4px;word-break:break-all}
    .model-box{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);padding:10px;background:rgba(118,185,0,0.05);border:1px solid rgba(118,185,0,0.15);border-radius:6px}
    .error-log{max-height:180px;overflow-y:auto}
    .error-item{background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.1);border-radius:4px;padding:8px;margin-bottom:6px;font-size:11px}
    .error-time{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text3)}
    .error-code{display:inline-block;background:rgba(239,68,68,0.15);padding:1px 5px;border-radius:3px;margin-left:6px;font-size:9px;color:var(--error)}
    .error-msg{color:var(--text2);margin-top:4px}
    .toast{position:fixed;top:16px;right:16px;padding:10px 16px;background:var(--card);border:1px solid var(--accent);border-radius:6px;font-size:12px;transform:translateX(200%);transition:0.2s;z-index:100}
    .toast.show{transform:translateX(0)}
    @media(max-width:900px){.sidebar{display:none}.stats-row{grid-template-columns:1fr 1fr}}
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="logo"><div class="logo-icon">⚡</div><div class="logo-text">NIM <span>PROXY</span></div></div>
    <nav class="nav">
      <div class="nav-item active" data-page="dashboard"><span class="nav-icon">📊</span>Dashboard</div>
      <div class="nav-item" data-page="statistics"><span class="nav-icon">📈</span>Statistics</div>
      <div class="nav-item" data-page="settings"><span class="nav-icon">⚙️</span>Settings</div>
      <div class="nav-item" data-page="config"><span class="nav-icon">🔧</span>Configuration</div>
    </nav>
    <div class="sidebar-footer">
      <div>VERSION <span class="val">1.0.0</span></div>
      <div>STATUS <span class="val" id="footerStatus">ONLINE</span></div>
    </div>
  </aside>
  <main class="main">
    <header class="header">
      <div class="header-left">
        <h1 class="page-title" id="pageTitle">dashboard</h1>
        <div class="status-badge">Online</div>
      </div>
      <div class="header-right">
        <div>UPTIME <span class="uptime" id="uptimeDisplay">0h 0m 0s</span></div>
      </div>
    </header>
    <div class="content">
      <!-- Dashboard -->
      <div class="page active" id="dashboard">
        <div class="stats-row">
          <div class="stat-box"><div class="stat-label">Total Requests</div><div class="stat-value green" id="totalReq">0</div></div>
          <div class="stat-box"><div class="stat-label">Error Rate</div><div class="stat-value" id="errorRate">0.00%</div><div class="stat-sub"><span id="errCount">0</span> failed</div></div>
          <div class="stat-box"><div class="stat-label">Token Usage</div><div class="stat-value blue" id="tokenUsage">0</div><div class="stat-sub">Input + Output</div></div>
          <div class="stat-box"><div class="stat-label">System Uptime</div><div class="stat-value green" id="uptimeStat">0h</div><div class="stat-sub">Since last reboot</div></div>
        </div>
        <div class="card">
          <div class="card-title">Cloudflare Tunnel</div>
          <div class="tunnel-box">
            <div class="tunnel-status"><span class="tunnel-dot" id="tunnelDot"></span><span id="tunnelStatus">Stopped</span></div>
            <div class="tunnel-url" id="tunnelUrl" style="display:none"></div>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary" id="startBtn" onclick="startTunnel()">Start Tunnel</button>
            <button class="btn btn-danger" id="stopBtn" onclick="stopTunnel()" style="display:none">Stop Tunnel</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Current Model</div>
          <div class="model-box" id="currentModel">-</div>
        </div>
      </div>
      <!-- Statistics -->
      <div class="page" id="statistics">
        <div class="stats-row">
          <div class="stat-box"><div class="stat-label">Total Requests</div><div class="stat-value green" id="statReq">0</div></div>
          <div class="stat-box"><div class="stat-label">Prompt Tokens</div><div class="stat-value blue" id="promptTok">0</div></div>
          <div class="stat-box"><div class="stat-label">Completion Tokens</div><div class="stat-value blue" id="compTok">0</div></div>
          <div class="stat-box"><div class="stat-label">Total Tokens</div><div class="stat-value green" id="totalTok">0</div></div>
        </div>
        <div class="card">
          <div class="card-title">Session Info</div>
          <div class="setting-row"><div class="setting-info"><h4>Last Request</h4></div><div style="font-size:12px;color:var(--text2)" id="lastReq">-</div></div>
          <div class="setting-row"><div class="setting-info"><h4>Session Started</h4></div><div style="font-size:12px;color:var(--text2)" id="sessionStart">-</div></div>
          <div class="btn-group"><button class="btn btn-ghost" onclick="refresh()">Refresh</button><button class="btn btn-danger" onclick="resetStats()">Reset Stats</button></div>
        </div>
        <div class="card">
          <div class="card-title">Errors (<span id="errLogCount">0</span>)</div>
          <div class="error-log" id="errorLog"><p style="color:var(--text3);font-size:11px">No errors recorded</p></div>
        </div>
      </div>
      <!-- Settings -->
      <div class="page" id="settings">
        <div class="card">
          <div class="card-title">Behavioral Toggles</div>
          <div class="setting-row"><div class="setting-info"><h4>Reasoning Chains</h4><p>Expose internal thought process</p></div><label class="toggle"><input type="checkbox" id="showReasoning"><span class="toggle-track"></span></label></div>
          <div class="setting-row"><div class="setting-info"><h4>Deep Thinking</h4><p>Extended computation for complex queries</p></div><label class="toggle"><input type="checkbox" id="enableThinking"><span class="toggle-track"></span></label></div>
          <div class="setting-row"><div class="setting-info"><h4>Request Logging</h4><p>Log requests to console</p></div><label class="toggle"><input type="checkbox" id="logRequests"><span class="toggle-track"></span></label></div>
          <div class="setting-row"><div class="setting-info"><h4>Streaming</h4><p>Stream tokens as generated</p></div><label class="toggle"><input type="checkbox" id="streamingEnabled"><span class="toggle-track"></span></label></div>
        </div>
        <div class="card">
          <div class="card-title">AI Parameters</div>
          <div class="input-row"><label class="input-label">Temperature</label><div class="slider-row"><input type="range" class="slider" id="temperature" min="0" max="1" step="0.1"><span class="slider-val" id="tempVal">0.7</span></div></div>
          <div class="input-row"><label class="input-label">Max Tokens</label><input type="number" class="input-field" id="maxTokens" min="1" max="8192"></div>
          <div class="btn-group"><button class="btn btn-primary" onclick="saveSettings()">Save Settings</button></div>
        </div>
      </div>
      <!-- Config -->
      <div class="page" id="config">
        <div class="card">
          <div class="card-title">Model Configuration</div>
          <div class="input-row"><label class="input-label">Model Name</label><input type="text" class="input-field" id="modelName" placeholder="deepseek-ai/deepseek-v3.2"></div>
          <div class="btn-group"><button class="btn btn-primary" onclick="saveModel()">Save Model</button></div>
        </div>
        <div class="card">
          <div class="card-title">API Key</div>
          <div class="input-row"><label class="input-label">NIM API Key</label><input type="password" class="input-field" id="apiKey" placeholder="nvapi-..."></div>
          <p style="font-size:10px;color:var(--text3);margin-bottom:12px">Stored in memory only. Resets on restart.</p>
          <div class="btn-group"><button class="btn btn-primary" onclick="saveApiKey()">Save Key</button></div>
        </div>
      </div>
    </div>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>{
      document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
      n.classList.add('active');
      document.getElementById(n.dataset.page).classList.add('active');
      document.getElementById('pageTitle').textContent=n.dataset.page;
    }));
    function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
    function formatUptime(s){const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;return h+'h '+m+'m '+sec+'s';}
    function formatNum(n){if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return n.toString();}
    async function load(){
      try{
        const r=await fetch('http://localhost:${PORT}/health');
        const d=await r.json();
        document.getElementById('totalReq').textContent=d.stats.messageCount;
        document.getElementById('statReq').textContent=d.stats.messageCount;
        document.getElementById('tokenUsage').textContent=formatNum(d.stats.totalTokens);
        document.getElementById('errCount').textContent=d.stats.errorCount;
        const rate=d.stats.messageCount>0?((d.stats.errorCount/d.stats.messageCount)*100).toFixed(2):'0.00';
        document.getElementById('errorRate').textContent=rate+'%';
        document.getElementById('errorRate').className='stat-value'+(parseFloat(rate)>5?' red':'');
        document.getElementById('promptTok').textContent=d.stats.promptTokens.toLocaleString();
        document.getElementById('compTok').textContent=d.stats.completionTokens.toLocaleString();
        document.getElementById('totalTok').textContent=d.stats.totalTokens.toLocaleString();
        document.getElementById('lastReq').textContent=d.stats.lastRequestTime?new Date(d.stats.lastRequestTime).toLocaleString():'-';
        document.getElementById('sessionStart').textContent=d.stats.startTime?new Date(d.stats.startTime).toLocaleString():'-';
        document.getElementById('currentModel').textContent=d.model||'-';
        document.getElementById('modelName').value=d.config.currentModel||'';
        document.getElementById('showReasoning').checked=d.config.showReasoning;
        document.getElementById('enableThinking').checked=d.config.enableThinking;
        document.getElementById('logRequests').checked=d.config.logRequests;
        document.getElementById('streamingEnabled').checked=d.config.streamingEnabled;
        document.getElementById('maxTokens').value=d.config.maxTokens;
        document.getElementById('temperature').value=d.config.temperature;
        document.getElementById('tempVal').textContent=d.config.temperature;
        const el=document.getElementById('errorLog');
        document.getElementById('errLogCount').textContent=d.stats.errorLog.length;
        if(d.stats.errorLog.length){el.innerHTML=d.stats.errorLog.slice(0,15).map(e=>'<div class="error-item"><span class="error-time">'+new Date(e.timestamp).toLocaleString()+'</span><span class="error-code">'+e.code+'</span><div class="error-msg">'+e.message+'</div></div>').join('');}else{el.innerHTML='<p style="color:var(--text3);font-size:11px">No errors</p>';}
        if(d.tunnel){updateTunnel(d.tunnel.status,d.tunnel.url);}
        const up=d.uptime||0;
        document.getElementById('uptimeDisplay').textContent=formatUptime(up);
        document.getElementById('uptimeStat').textContent=Math.floor(up/3600)+'h';
      }catch(e){document.getElementById('footerStatus').textContent='OFFLINE';}
    }
    function updateTunnel(s,u){
      const dot=document.getElementById('tunnelDot'),st=document.getElementById('tunnelStatus'),url=document.getElementById('tunnelUrl'),startB=document.getElementById('startBtn'),stopB=document.getElementById('stopBtn');
      if(s==='running'&&u){dot.className='tunnel-dot on';st.textContent='Running';url.textContent=u;url.style.display='block';startB.style.display='none';stopB.style.display='inline-block';}
      else if(s==='starting'){dot.className='tunnel-dot starting';st.textContent='Starting...';url.style.display='none';}
      else{dot.className='tunnel-dot';st.textContent='Stopped';url.style.display='none';startB.style.display='inline-block';stopB.style.display='none';}
    }
    async function startTunnel(){updateTunnel('starting',null);await fetch('http://localhost:${CONTROL_PANEL_PORT}/tunnel/start',{method:'POST'});toast('Starting tunnel...');setTimeout(load,3000);setTimeout(load,6000);}
    async function stopTunnel(){await fetch('http://localhost:${CONTROL_PANEL_PORT}/tunnel/stop',{method:'POST'});toast('Tunnel stopped');load();}
    document.getElementById('temperature').addEventListener('input',e=>{document.getElementById('tempVal').textContent=e.target.value;});
    async function saveSettings(){
      const c={showReasoning:document.getElementById('showReasoning').checked,enableThinking:document.getElementById('enableThinking').checked,logRequests:document.getElementById('logRequests').checked,streamingEnabled:document.getElementById('streamingEnabled').checked,maxTokens:parseInt(document.getElementById('maxTokens').value),temperature:parseFloat(document.getElementById('temperature').value)};
      await fetch('http://localhost:${CONTROL_PANEL_PORT}/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});toast('Settings saved');
    }
    async function saveModel(){
      const m=document.getElementById('modelName').value.trim();if(!m){toast('Enter model');return;}
      await fetch('http://localhost:${CONTROL_PANEL_PORT}/model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:m})});
      toast('Model saved');document.getElementById('currentModel').textContent=m;
    }
    async function saveApiKey(){
      const k=document.getElementById('apiKey').value.trim();if(!k){toast('Enter key');return;}
      await fetch('http://localhost:${CONTROL_PANEL_PORT}/apikey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:k})});
      toast('Key saved');document.getElementById('apiKey').value='';
    }
    function refresh(){load();toast('Refreshed');}
    async function resetStats(){if(!confirm('Reset?'))return;await fetch('http://localhost:${CONTROL_PANEL_PORT}/stats/reset',{method:'POST'});toast('Reset');load();}
    load();setInterval(load,5000);
  </script>
</body>
</html>`;
}