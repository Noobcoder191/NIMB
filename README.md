<p align="center">
  <img src="https://img.shields.io/badge/✦-NIMB-2dd4bf?style=for-the-badge&labelColor=0d1117" alt="NIMB"/>
</p>

<h1 align="center">NIMB</h1>

<p align="center">
  <strong>from gooners, to gooners</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NVIDIA-NIM_API-76B900?logo=nvidia&logoColor=white" alt="NVIDIA"/>
  <img src="https://img.shields.io/badge/Built_with-Wails-00acd7?logo=go&logoColor=white" alt="Wails"/>
  <img src="https://img.shields.io/badge/License-Public_Domain-blue" alt="License"/>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| � **OpenAI Compatible** | Works with any OpenAI API client |
| 🌐 **Cloudflare Tunnel** | One-click external access |
| 🌊 **Streaming** | Real-time response streaming |
| 🧠 **Thinking Mode** | Optional reasoning output |
| 📊 **Usage Stats** | Track requests, tokens, errors |

---

## 🚀 Quick Start

### Download

1. Go to [**Releases**](https://github.com/Noobcoder191/JanitorxNim/releases)
2. Download `NIMB X.X.X.zip`
3. Extract and run `NIMB.exe`

### Requirements

- **Windows 10/11** (64-bit)
- [Cloudflared (if you're gonna build from source)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) — place `cloudflared.exe` next to `NIMB.exe`
- [NVIDIA NIM API Key](https://build.nvidia.com/)

---

## 🎛️ Control Panel

The app opens a control panel with:

| Page | What it does |
|------|--------------|
| **Dashboard** | Status, tunnel control, current model |
| **Statistics** | Request/token counts, error log |
| **Settings** | Toggle reasoning, streaming, etc. |
| **Configuration** | Set model name and API key |

---

## 🔌 API Endpoints

Use NIMB as a proxy for your favorite tools (SillyTavern, Janitor AI etc.):

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Chat completions |
| `GET /v1/models` | List available models |
| `GET /health` | Health check + stats |

**Proxy URL:** `http://localhost:3000`

### Example

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-ai/deepseek-r1-0528", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## ⚙️ Default Settings

```json
{
  "showReasoning": false,
  "enableThinking": false,
  "logRequests": true,
  "streamingEnabled": true,
  "maxTokens": 4096,
  "temperature": 0.7,
  "currentModel": "deepseek-ai/deepseek-v3.2"
}
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't start | Make sure you have WebView2 runtime installed |
| Tunnel not starting | Place `cloudflared.exe` in the same folder as the exe |
| Settings not saving | Run the app from a folder you have write access to |
| API errors | Check your API key in Configuration |

---

## 🧑‍💻 Building from Source

```bash
# Clone
git clone https://github.com/Noobcoder191/JanitorxNim.git
cd JanitorxNim

# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Run in dev mode
wails dev

# Build portable exe
wails build
```

Output: `build/bin/NIMB.exe` (~11MB)

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
