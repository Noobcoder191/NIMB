<p align="center">
  <img src="https://img.shields.io/badge/⚡-NIM_PROXY-76b900?style=for-the-badge&labelColor=0a0b0d" alt="NIM Proxy"/>
</p>

<h1 align="center">NIM Proxy</h1>

<p align="center">
  <strong>A lightweight OpenAI-compatible proxy for NVIDIA NIM API</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24_LTS-339933?logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/NVIDIA-NIM_API-76B900?logo=nvidia&logoColor=white" alt="NVIDIA"/>
  <img src="https://img.shields.io/badge/License-Public_Domain-blue" alt="License"/>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔄 **OpenAI Compatible** | Works with any OpenAI API client |
| 🎛️ **Web Control Panel** | Modern UI for runtime configuration |
| 🌐 **Cloudflare Tunnel** | One-click external access |
| 🌊 **Streaming** | Real-time response streaming |
| 🧠 **Thinking Mode** | Optional reasoning output |
| 📊 **Usage Stats** | Track requests, tokens, errors |
| ⏱️ **Uptime Monitor** | Live server uptime display |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v24 LTS+
- [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (for tunneling)
- [NVIDIA NIM API Key](https://build.nvidia.com/)

### Installation

```bash
# Clone the repo or download it
git clone https://github.com/yourusername/nim-proxy.git
cd nim-proxy

# Install dependencies
npm install

# Rename the cloudflared executable to "cloudflared.exe" and place it in the project folder
```

### Running

**Windows:** Double-click `start-proxy.bat`

**Linux/Mac:**
```bash
npm start
# In another terminal:
cloudflared tunnel --url http://localhost:3000
```

---

## 🎛️ Control Panel

Access at **http://localhost:3001**

### Pages

| Page | What it does |
|------|--------------|
| **Dashboard** | Status, tunnel, current model |
| **Statistics** | Request/token counts, errors |
| **Settings** | Toggle reasoning, streaming, etc. |
| **Configuration** | Set model name and API key |

---

## 🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Chat completions (OpenAI format) |
| `GET /health` | Health check + stats |

### Example Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## ⚙️ Default Config

```javascript
{
  showReasoning: false,    // Show <think> tags
  enableThinking: false,   // Extended computation
  logRequests: true,       // Console logging
  streamingEnabled: true,  // Stream responses
  maxTokens: 4096,
  temperature: 0.7,
  currentModel: 'deepseek-ai/deepseek-v3.2'
}
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| API key not working | Set it in Control Panel → Configuration |
| Port in use | Run `stop-proxy.bat` or kill processes on 3000/3001 |
| Tunnel not starting | Make sure `cloudflared.exe` is in project folder |
| Request timeout | Check internet connection and API key |

## 📜 License

Public Domain — use it however you want.

---

<p align="center">
  <sub>Built with ⚡ for NVIDIA NIM</sub>
</p>
