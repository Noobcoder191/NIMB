// NIMB Frontend Application

// Toast notifications (replacing browser alerts)
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

// Confirmation modal (replacing browser confirm)
function showConfirm(message) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'setup-overlay';
        overlay.innerHTML = `
            <div class="setup-modal" style="max-width: 400px; padding: 32px;">
                <h2 style="font-family: var(--font-display); margin-bottom: 16px;">Confirm Action</h2>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">${message}</p>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
                    <button class="btn btn-danger" id="confirmOk">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirmCancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };
        overlay.querySelector('#confirmOk').onclick = () => {
            overlay.remove();
            resolve(true);
        };
    });
}

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'success');
    } catch (err) {
        showToast('Failed to copy', 'error');
    }
}

// Navigation
function switchPage(pageId) {
    document.querySelectorAll('section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

    const title = document.getElementById('pageTitle');
    title.style.animation = 'none';
    title.offsetHeight;
    title.style.animation = 'fadeSlide 0.4s var(--ease-out)';
    title.textContent = pageId.charAt(0).toUpperCase() + pageId.slice(1);
}

// Formatting
function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function formatUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
}

// Data Fetching
async function fetchData() {
    try {
        const res = await fetch('/health');
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        updateUI(data);
        setOnlineStatus(true);
    } catch (e) {
        setOnlineStatus(false);
    }
}

function setOnlineStatus(isOnline) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (isOnline) {
        dot.style.background = 'var(--success)';
        dot.style.animation = 'pulse 2s infinite';
        text.textContent = 'Online';
    } else {
        dot.style.background = 'var(--error)';
        dot.style.animation = 'none';
        text.textContent = 'Offline';
    }
}

function updateUI(data) {
    // Stats
    document.getElementById('totalReq').innerText = data.stats.messageCount;
    document.getElementById('errCount').innerText = data.stats.errorCount;

    const rate = data.stats.messageCount > 0
        ? ((data.stats.errorCount / data.stats.messageCount) * 100).toFixed(2)
        : '0.00';
    const errorRateEl = document.getElementById('errorRate');
    errorRateEl.innerText = rate + '%';
    errorRateEl.className = 'stat-value ' + (parseFloat(rate) > 5 ? 'error' : '');

    document.getElementById('tokenUsage').innerText = formatNum(data.stats.totalTokens);
    document.getElementById('promptTok').innerText = data.stats.promptTokens.toLocaleString();
    document.getElementById('compTok').innerText = data.stats.completionTokens.toLocaleString();
    document.getElementById('totalTok').innerText = data.stats.totalTokens.toLocaleString();

    document.getElementById('uptimeDisplay').innerText = formatUptime(data.uptime);
    document.getElementById('uptimeStat').innerText = Math.floor(data.uptime / 3600) + 'h';

    document.getElementById('lastReq').innerText = data.stats.lastRequestTime
        ? new Date(data.stats.lastRequestTime).toLocaleString()
        : '-';
    document.getElementById('sessionStart').innerText = data.stats.startTime
        ? new Date(data.stats.startTime).toLocaleString()
        : '-';

    // Model & Settings
    if (document.activeElement.id !== 'modelName') {
        document.getElementById('modelName').value = data.config.currentModel || '';
    }
    document.getElementById('currentModelDisplay').innerText = data.model || '-';

    // Sync settings toggles only if not interacting
    const activeEl = document.activeElement;
    if (activeEl.type !== 'checkbox' && activeEl.type !== 'range' && activeEl.type !== 'number') {
        document.getElementById('showReasoning').checked = data.config.showReasoning;
        document.getElementById('enableThinking').checked = data.config.enableThinking;
        document.getElementById('logRequests').checked = data.config.logRequests;
        document.getElementById('streamingEnabled').checked = data.config.streamingEnabled;
        document.getElementById('maxTokens').value = data.config.maxTokens;
        document.getElementById('maxTokensSlider').value = data.config.maxTokens;
        document.getElementById('temperature').value = data.config.temperature;
        document.getElementById('tempVal').innerText = data.config.temperature;
    }

    // Tunnel
    updateTunnelUI(data.tunnel.status, data.tunnel.url);

    // Error Log
    updateErrorLog(data.stats.errorLog);
}

function updateTunnelUI(status, url) {
    const dot = document.getElementById('tunnelDot');
    const statusText = document.getElementById('tunnelStatus');
    const urlEl = document.getElementById('tunnelUrl');
    const startBtn = document.getElementById('startTunnelBtn');
    const stopBtn = document.getElementById('stopTunnelBtn');

    if (status === 'running' && url) {
        dot.style.background = 'var(--success)';
        dot.style.animation = 'pulse 2s infinite';
        statusText.textContent = 'Running';
        urlEl.textContent = url + '/v1/chat/completions';
        urlEl.classList.remove('hidden');
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else if (status === 'starting') {
        dot.style.background = 'var(--warning)';
        dot.style.animation = 'pulse 1s infinite';
        statusText.textContent = 'Starting...';
        urlEl.classList.add('hidden');
    } else {
        dot.style.background = 'var(--text-muted)';
        dot.style.animation = 'none';
        statusText.textContent = 'Stopped';
        urlEl.classList.add('hidden');
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

function updateErrorLog(logs) {
    const container = document.getElementById('errorLog');
    document.getElementById('errLogCount').innerText = logs.length;

    if (logs.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">No errors recorded</div>';
        return;
    }

    const html = logs.slice(0, 15).map(e => `
        <div class="log-item">
            <span class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
            <span class="log-code">${e.code}</span>
            <span class="log-msg">${e.message}</span>
        </div>
    `).join('');

    container.innerHTML = html;
}

// Actions
document.getElementById('temperature').addEventListener('input', (e) => {
    document.getElementById('tempVal').innerText = e.target.value;
});

// Sync maxTokens slider and input
document.getElementById('maxTokensSlider').addEventListener('input', (e) => {
    document.getElementById('maxTokens').value = e.target.value;
});
document.getElementById('maxTokens').addEventListener('input', (e) => {
    const val = Math.min(131072, Math.max(256, parseInt(e.target.value) || 4096));
    document.getElementById('maxTokensSlider').value = val;
});

async function saveSettings() {
    const config = {
        showReasoning: document.getElementById('showReasoning').checked,
        enableThinking: document.getElementById('enableThinking').checked,
        logRequests: document.getElementById('logRequests').checked,
        streamingEnabled: document.getElementById('streamingEnabled').checked,
        maxTokens: parseInt(document.getElementById('maxTokens').value),
        temperature: parseFloat(document.getElementById('temperature').value)
    };

    try {
        await fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        showToast('Settings saved', 'success');
        fetchData();
    } catch (e) {
        showToast('Failed to save settings', 'error');
    }
}

async function saveModel() {
    const model = document.getElementById('modelName').value.trim();
    if (!model) {
        showToast('Please enter a model name', 'error');
        return;
    }

    try {
        await fetch('/model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model })
        });
        showToast('Model updated', 'success');
        fetchData();
    } catch (e) {
        showToast('Failed to update model', 'error');
    }
}

async function saveApiKey() {
    const key = document.getElementById('apiKey').value.trim();
    if (!key) {
        showToast('Please enter an API key', 'error');
        return;
    }

    try {
        await fetch('/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key })
        });
        showToast('API Key updated', 'success');
        document.getElementById('apiKey').value = '';
    } catch (e) {
        showToast('Failed to update API key', 'error');
    }
}

async function startTunnel() {
    updateTunnelUI('starting', null);
    try {
        await fetch('/tunnel/start', { method: 'POST' });
        showToast('Starting tunnel...', 'info');
    } catch (e) {
        showToast('Failed to start tunnel', 'error');
    }
}

async function stopTunnel() {
    try {
        await fetch('/tunnel/stop', { method: 'POST' });
        showToast('Tunnel stopped', 'info');
        fetchData();
    } catch (e) {
        showToast('Failed to stop tunnel', 'error');
    }
}

async function resetStats() {
    const confirmed = await showConfirm('Are you sure you want to reset all statistics?');
    if (!confirmed) return;

    try {
        await fetch('/stats/reset', { method: 'POST' });
        showToast('Statistics reset', 'success');
        fetchData();
    } catch (e) {
        showToast('Failed to reset stats', 'error');
    }
}

function refreshData() {
    fetchData();
    showToast('Data refreshed', 'info');
}

// Version Update Checker
const CURRENT_VERSION = '1.0.0';
const GITHUB_REPO = 'Noobcoder191/JanitorxNim';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

async function checkForUpdates() {
    try {
        const res = await fetch(GITHUB_API);
        if (!res.ok) return;

        const release = await res.json();
        const latestVersion = release.tag_name.replace(/^v/, '');

        // Compare versions
        if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
            showUpdateModal(latestVersion, release.body || 'No release notes available.', release.html_url);
        }
    } catch (e) {
        console.log('Update check failed:', e.message);
    }
}

function isNewerVersion(latest, current) {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
        const l = latestParts[i] || 0;
        const c = currentParts[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
}

function showUpdateModal(version, releaseNotes, releaseUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'setup-overlay';
    overlay.id = 'updateModal';
    overlay.innerHTML = `
        <div class="update-modal">
            <div class="update-header">
                <span class="update-icon">✦</span>
                <h2>Update Available</h2>
            </div>
            <p class="update-version">Version ${version} is now available</p>
            <div class="update-notes">
                <h3>What's New</h3>
                <div class="update-notes-content">${formatReleaseNotes(releaseNotes)}</div>
            </div>
            <div class="update-actions">
                <button class="update-ignore" onclick="dismissUpdate()">Ignore</button>
                <button class="update-btn" onclick="window.open('${releaseUrl}', '_blank'); dismissUpdate();">Update</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function formatReleaseNotes(notes) {
    // Basic markdown to HTML conversion for release notes
    return notes
        .replace(/^### (.+)$/gm, '<strong>$1</strong>')
        .replace(/^## (.+)$/gm, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '• $1')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function dismissUpdate() {
    const modal = document.getElementById('updateModal');
    if (modal) modal.remove();
}

// Init
const NIM_MODELS = [
    // DeepSeek
    "deepseek-ai/deepseek-v3.2",
    "deepseek-ai/deepseek-v3.1-terminus",
    "deepseek-ai/deepseek-v3.1",
    "deepseek-ai/deepseek-r1",
    "deepseek-ai/deepseek-r1-0528",
    "deepseek-ai/deepseek-r1-distill-llama-8b",
    "deepseek-ai/deepseek-r1-distill-qwen-32b",
    "deepseek-ai/deepseek-r1-distill-qwen-14b",
    "deepseek-ai/deepseek-r1-distill-qwen-7b",

    // Mistral / Mixtral
    "mistralai/mistral-large-3-675b-instruct-2512",
    "mistralai/mistral-medium-3-instruct",
    "mistralai/mistral-small-3.1-24b-instruct-2503",
    "mistralai/mistral-small-24b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
    "mistralai/mistral-7b-instruct-v0.2",
    "mistralai/mixtral-8x22b-instruct-v0.1",
    "mistralai/mixtral-8x7b-instruct-v0.1",
    "mistralai/ministral-14b-instruct-2512",
    "mistralai/magistral-small-2506",
    "mistralai/devstral-2-123b-instruct-2512",
    "mistralai/mamba-codestral-7b-v0.1",

    // NVIDIA (NIM / Nemotron)
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
    "nvidia/mistral-nemotron",
    "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/nemotron-nano-12b-v2-vl",
    "nvidia/nvidia-nemotron-nano-9b-v2",
    "nvidia/nemotron-mini-4b-instruct",
    "nvidia/nemotron-4-mini-hindi-4b-instruct",
    "nvidia/usdcode",

    // Meta (Llama & Derivados)
    "meta/llama-4-maverick-17b-128e-instruct",
    "meta/llama-4-scout-17b-16e-instruct",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.2-90b-vision-instruct",
    "meta/llama-3.2-11b-vision-instruct",
    "meta/llama-3.2-3b-instruct",
    "meta/llama-3.2-1b-instruct",
    "meta/llama-3.1-405b-instruct",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "meta/llama-3.1-swallow-70b-instruct-v0.1",
    "meta/llama-3.1-swallow-8b-instruct-v0.1",
    "meta/llama-3-70b-instruct",
    "meta/llama-3-8b-instruct",
    "meta/llama-3-taiwan-70b-instruct",
    "meta/llama-3-swallow-70b-instruct-v0.1",
    "meta/llama3-chatqa-1.5-8b",
    "dracarys/dracarys-llama-3.1-70b-instruct",

    // Google (Gemma)
    "google/gemma-3-27b-it",
    "google/gemma-3-1b-it",
    "google/gemma-3n-e4b-it",
    "google/gemma-3n-e2b-it",
    "google/gemma-2-27b-it",
    "google/gemma-2-9b-it",
    "google/gemma-2-2b-it",
    "google/gemma-7b",
    "google/gemma-2-9b-cpt-sahabatai-instruct",

    // Microsoft (Phi)
    "microsoft/phi-4-mini-flash-reasoning",
    "microsoft/phi-4-mini-instruct",
    "microsoft/phi-4-multimodal-instruct",
    "microsoft/phi-3.5-mini-instruct",
    "microsoft/phi-3-medium-128k-instruct",
    "microsoft/phi-3-medium-4k-instruct",
    "microsoft/phi-3-small-128k-instruct",
    "microsoft/phi-3-small-8k-instruct",
    "microsoft/phi-3-mini-128k-instruct",
    "microsoft/phi-3-mini-4k-instruct",

    // Qwen / Kimi / Modelos Asiáticos
    "qwen/qwen3-coder-480b-a35b-instruct",
    "qwen/qwen3-next-80b-a3b-instruct",
    "qwen/qwen3-next-80b-a3b-thinking",
    "qwen/qwen3-235b-a22b",
    "qwen/qwq-32b",
    "qwen/qwen2.5-coder-32b-instruct",
    "qwen/qwen2.5-coder-7b-instruct",
    "qwen/qwen2.5-7b-instruct",
    "qwen/qwen2-7b-instruct",
    "moonshotai/kimi-k2-thinking",
    "moonshotai/kimi-k2-instruct",
    "moonshotai/kimi-k2-instruct-0905",
    "minimaxai/minimax-m2",
    "baichuan-inc/baichuan2-13b-chat",
    "thudm/chatglm3-6b",

    // Outros
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "opengpt-x/teuken-7b-instruct-commercial-v0.4",
    "sarvamai/sarvam-m",
    "stockmark/stockmark-2-100b-instruct",
    "bielik/bielik-11b-v2.6-instruct",
    "seed-oss/seed-oss-36b-instruct",
    "ibm/granite-3.3-8b-instruct",
    "ai21labs/jamba-1.5-mini-instruct",
    "mediatek/breeze-7b-instruct",
    "rakuten/rakutenai-7b-instruct",
    "rakuten/rakutenai-7b-chat",
    "cyberagent/marin-8b-instruct",
    "utter-project/eurollm-9b-instruct",
    "colosseum/colosseum_355b_instruct_16k",
    "tiiuae/falcon3-7b-instruct",
    "italia/italia_10b_instruct_16k"
];

// Custom dropdown functionality
function initModelDropdown() {
    const input = document.getElementById('modelName');
    const list = document.getElementById('modelList');
    let highlightedIndex = -1;

    // Populate dropdown
    function renderList(filter = '') {
        const filterLower = filter.toLowerCase();
        const filtered = NIM_MODELS.filter(m => m.toLowerCase().includes(filterLower));

        list.innerHTML = filtered.map((m, i) =>
            `<div class="dropdown-item" data-value="${m}" data-index="${i}">${m}</div>`
        ).join('');

        highlightedIndex = -1;
    }

    // Show dropdown
    function showDropdown() {
        renderList(input.value);
        list.classList.add('show');
    }

    // Hide dropdown
    function hideDropdown() {
        list.classList.remove('show');
        highlightedIndex = -1;
    }

    // Select item
    function selectItem(value) {
        input.value = value;
        hideDropdown();
    }

    // Event listeners
    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', () => renderList(input.value));

    input.addEventListener('blur', (e) => {
        // Delay to allow click on item
        setTimeout(() => hideDropdown(), 150);
    });

    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.dropdown-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            const item = items[highlightedIndex];
            if (item) selectItem(item.dataset.value);
        } else if (e.key === 'Escape') {
            hideDropdown();
        }

        // Update highlight
        items.forEach((item, i) => {
            item.classList.toggle('highlighted', i === highlightedIndex);
            if (i === highlightedIndex) item.scrollIntoView({ block: 'nearest' });
        });
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) selectItem(item.dataset.value);
    });

    // Initial render
    renderList();
}

setInterval(fetchData, 2000);
fetchData();
initModelDropdown();
checkForUpdates();
