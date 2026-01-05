// NIMB Frontend Application - Wails Version

// Toast notifications
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

// Confirmation modal
function showConfirm(message) {
    return new Promise((resolve) => {
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

// Data Fetching - Uses Wails Go bindings
async function fetchData() {
    try {
        // Call Go backend via Wails
        const data = await window.go.main.App.GetHealth();
        updateUI(data);
        setOnlineStatus(true);
    } catch (e) {
        console.error('fetchData error:', e);
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
        document.getElementById('contextSize').value = data.config.contextSize || 128000;
        document.getElementById('contextSizeSlider').value = data.config.contextSize || 128000;
        document.getElementById('maxTokens').value = data.config.maxTokens || 0;
        document.getElementById('maxTokensSlider').value = data.config.maxTokens || 0;
        document.getElementById('temperature').value = data.config.temperature;
        document.getElementById('tempVal').innerText = data.config.temperature;
    }

    // Tunnel
    updateTunnelUI(data.tunnel.status, data.tunnel.url);

    // Error Log
    updateErrorLog(data.stats.errorLog || []);
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

// Sync contextSize slider and input
document.getElementById('contextSizeSlider').addEventListener('input', (e) => {
    document.getElementById('contextSize').value = e.target.value;
});
document.getElementById('contextSize').addEventListener('input', (e) => {
    const val = Math.min(128000, Math.max(0, parseInt(e.target.value) || 128000));
    document.getElementById('contextSizeSlider').value = val;
});

// Sync maxTokens slider and input
document.getElementById('maxTokensSlider').addEventListener('input', (e) => {
    document.getElementById('maxTokens').value = e.target.value;
});
document.getElementById('maxTokens').addEventListener('input', (e) => {
    const val = Math.min(1000, Math.max(0, parseInt(e.target.value) || 0));
    document.getElementById('maxTokensSlider').value = val;
});

async function saveSettings() {
    const config = {
        showReasoning: document.getElementById('showReasoning').checked,
        enableThinking: document.getElementById('enableThinking').checked,
        logRequests: document.getElementById('logRequests').checked,
        streamingEnabled: document.getElementById('streamingEnabled').checked,
        contextSize: parseInt(document.getElementById('contextSize').value) || 128000,
        maxTokens: parseInt(document.getElementById('maxTokens').value) || 0,
        temperature: parseFloat(document.getElementById('temperature').value)
    };

    try {
        const success = await window.go.main.App.SaveConfig(config);
        if (success) {
            showToast('Settings saved', 'success');
            fetchData();
        } else {
            showToast('Failed to save settings', 'error');
        }
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
        const success = await window.go.main.App.SetModel(model);
        if (success) {
            showToast('Model updated', 'success');
            fetchData();
        } else {
            showToast('Failed to update model', 'error');
        }
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
        const success = await window.go.main.App.SetAPIKey(key);
        if (success) {
            showToast('API Key updated', 'success');
            document.getElementById('apiKey').value = '';
        } else {
            showToast('Failed to update API key', 'error');
        }
    } catch (e) {
        showToast('Failed to update API key', 'error');
    }
}

async function startTunnel() {
    updateTunnelUI('starting', null);
    try {
        const result = await window.go.main.App.StartTunnel();
        if (result.success) {
            showToast('Starting tunnel...', 'info');
        } else {
            showToast(result.error || 'Failed to start tunnel', 'error');
            updateTunnelUI('stopped', null);
        }
    } catch (e) {
        showToast('Failed to start tunnel', 'error');
        updateTunnelUI('stopped', null);
    }
}

async function stopTunnel() {
    try {
        await window.go.main.App.StopTunnel();
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
        await window.go.main.App.ResetStats();
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

// Window controls - Wails
function minimize() {
    window.go.main.App.Minimize();
}

function maximize() {
    window.go.main.App.Maximize();
}

function closeWindow() {
    window.go.main.App.Close();
}

// Version Update Checker
const CURRENT_VERSION = '2.0.1';
const GITHUB_REPO = 'Noobcoder191/JanitorxNim';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

async function checkForUpdates() {
    try {
        const res = await fetch(GITHUB_API);
        if (!res.ok) return;

        const release = await res.json();
        const latestVersion = release.tag_name.replace(/^v/, '');

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

// NIM Models list
const NIM_MODELS = [
    "deepseek-ai/deepseek-v3.2",
    "deepseek-ai/deepseek-v3.1-terminus",
    "deepseek-ai/deepseek-v3.1",
    "deepseek-ai/deepseek-r1",
    "deepseek-ai/deepseek-r1-0528",
    "deepseek-ai/deepseek-r1-distill-llama-8b",
    "deepseek-ai/deepseek-r1-distill-qwen-32b",
    "deepseek-ai/deepseek-r1-distill-qwen-14b",
    "deepseek-ai/deepseek-r1-distill-qwen-7b",
    "mistralai/mistral-large-3-675b-instruct-2512",
    "mistralai/mistral-medium-3-instruct",
    "mistralai/mistral-small-3.1-24b-instruct-2503",
    "mistralai/mistral-small-24b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
    "mistralai/mixtral-8x22b-instruct-v0.1",
    "mistralai/mixtral-8x7b-instruct-v0.1",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.2-90b-vision-instruct",
    "meta/llama-3.1-405b-instruct",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "google/gemma-3-27b-it",
    "google/gemma-2-27b-it",
    "google/gemma-2-9b-it",
    "microsoft/phi-4-mini-instruct",
    "microsoft/phi-3.5-mini-instruct",
    "qwen/qwen3-235b-a22b",
    "qwen/qwq-32b",
    "qwen/qwen2.5-coder-32b-instruct",
    "moonshotai/kimi-k2-instruct"
];

// Custom dropdown functionality
function initModelDropdown() {
    const input = document.getElementById('modelName');
    const list = document.getElementById('modelList');
    let highlightedIndex = -1;

    function renderList(filter = '') {
        const filterLower = filter.toLowerCase();
        const filtered = NIM_MODELS.filter(m => m.toLowerCase().includes(filterLower));

        list.innerHTML = filtered.map((m, i) =>
            `<div class="dropdown-item" data-value="${m}" data-index="${i}">${m}</div>`
        ).join('');

        highlightedIndex = -1;
    }

    function showDropdown() {
        renderList(input.value);
        list.classList.add('show');
    }

    function hideDropdown() {
        list.classList.remove('show');
        highlightedIndex = -1;
    }

    function selectItem(value) {
        input.value = value;
        hideDropdown();
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', () => renderList(input.value));

    input.addEventListener('blur', (e) => {
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

        items.forEach((item, i) => {
            item.classList.toggle('highlighted', i === highlightedIndex);
            if (i === highlightedIndex) item.scrollIntoView({ block: 'nearest' });
        });
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) selectItem(item.dataset.value);
    });

    renderList();
}

// Initialize
setInterval(fetchData, 2000);
fetchData();
initModelDropdown();
checkForUpdates();
