<p align="center">
  <img src="https://img.shields.io/badge/✦-NIMB-2dd4bf?style=for-the-badge&labelColor=0d1117" alt="NIMB"/>
</p>

<h1 align="center">NIMB</h1>

<p align="center">
  <strong>from gooners, to gooners</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-Portable_EXE-0078D6?logo=windows&logoColor=white" alt="Windows"/>
  <img src="https://img.shields.io/badge/NVIDIA-NIM_API-76B900?logo=nvidia&logoColor=white" alt="NVIDIA"/>
  <img src="https://img.shields.io/badge/License-Public_Domain-blue" alt="License"/>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Standalone EXE** | Single portable executable, no installation needed |
| 🔄 **OpenAI Compatible** | Works with any OpenAI API client |
| 🎛️ **Modern Control Panel** | Sleek dark UI for runtime configuration |
| 🌐 **Cloudflare Tunnel** | One-click external access |
| 🌊 **Streaming** | Real-time response streaming |
| 🧠 **Thinking Mode** | Optional reasoning output |
| 📊 **Usage Stats** | Track requests, tokens, errors |
| 🔔 **Update Notifier** | Auto-checks for new releases |

---

## 🚀 Quick Start

### Download

1. Go to [**Releases**](https://github.com/Noobcoder191/JanitorxNim/releases)
2. Download `NIMB.zip`
3. Extract and run `NIMB 1.0.0.exe`

### Requirements

- **Windows 10/11** (64-bit)
- [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (for tunneling) — place `cloudflared.exe` next to `NIMB 1.0.0.exe`
- [NVIDIA NIM API Key](https://build.nvidia.com/) (free)

---

## 🎛️ Control Panel

The app opens a modern control panel with:

| Page | What it does |
|------|--------------|
| **Dashboard** | Status, tunnel control, current model |
| **Statistics** | Request/token counts, error log |
| **Settings** | Toggle reasoning, streaming, etc. |
| **Configuration** | Set model name and API key |

> **Tip:** Settings are saved automatically and persist across restarts.

---

## 🔌 API Endpoints

Use NIMB as a proxy for your favorite tools (SillyTavern, etc.):

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Chat completions (OpenAI format) |
| `GET /v1/models` | List available models |
| `GET /health` | Health check + stats |

**Proxy URL:** `http://localhost:3000`

### Example

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## ⚙️ Default Settings

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
| App won't start | Make sure you extracted the zip, don't run from inside |
| Tunnel not starting | Place `cloudflared.exe` in the same folder as the exe |
| Settings not saving | Run the app from a folder you have write access to |
| API errors | Check your API key in Configuration |

---

## 🧑‍💻 Building from Source

```bash
# Clone
git clone https://github.com/Noobcoder191/JanitorxNim.git
cd JanitorxNim

# Install dependencies
npm install

# Run in dev mode
npm start

# Build portable exe
npm run build
```

---

## 📁 Project Structure

```
JanitorxNim/
├── main.js             # Electron main process
├── server.js           # Backend server
├── public/             # Frontend (HTML/CSS/JS)
├── assets/             # Icons and images
├── dist/               # Built executables (gitignored)
└── README.md
```

---

## 📜 License

**NIMB** is released into the Public Domain — use it however you want.

### Third-Party Software

This distribution includes [cloudflared](https://github.com/cloudflare/cloudflared), the Cloudflare Tunnel client.

**cloudflared** is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0):
- Copyright © Cloudflare, Inc.
- Source: https://github.com/cloudflare/cloudflared
- License: https://github.com/cloudflare/cloudflared/blob/master/LICENSE

---

<p align="center">
  <sub>Built with ✦ by gooners</sub>
</p>
