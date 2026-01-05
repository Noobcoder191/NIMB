package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Config holds the app configuration
type Config struct {
	ShowReasoning    bool    `json:"showReasoning"`
	EnableThinking   bool    `json:"enableThinking"`
	LogRequests      bool    `json:"logRequests"`
	ContextSize      int     `json:"contextSize"`
	MaxTokens        int     `json:"maxTokens"`
	Temperature      float64 `json:"temperature"`
	StreamingEnabled bool    `json:"streamingEnabled"`
	CurrentModel     string  `json:"currentModel"`
	APIKey           string  `json:"apiKey,omitempty"`
}

// Stats holds usage statistics
type Stats struct {
	MessageCount     int         `json:"messageCount"`
	PromptTokens     int         `json:"promptTokens"`
	CompletionTokens int         `json:"completionTokens"`
	TotalTokens      int         `json:"totalTokens"`
	ErrorCount       int         `json:"errorCount"`
	LastRequestTime  string      `json:"lastRequestTime"`
	StartTime        string      `json:"startTime"`
	ErrorLog         []ErrorItem `json:"errorLog"`
}

// ErrorItem represents an error log entry
type ErrorItem struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
	Code      int    `json:"code"`
}

// TunnelState holds cloudflare tunnel state
type TunnelState struct {
	URL     string `json:"url"`
	Status  string `json:"status"`
	process *exec.Cmd
	mu      sync.Mutex
}

// App struct
type App struct {
	ctx         context.Context
	config      Config
	stats       Stats
	tunnel      TunnelState
	startTime   time.Time
	settingsDir string
	mu          sync.RWMutex
}

// NewApp creates a new App
func NewApp() *App {
	homeDir, _ := os.UserHomeDir()
	settingsDir := filepath.Join(homeDir, ".nimb")
	os.MkdirAll(settingsDir, 0755)

	app := &App{
		startTime:   time.Now(),
		settingsDir: settingsDir,
		config: Config{
			ShowReasoning:    false,
			EnableThinking:   false,
			LogRequests:      true,
			ContextSize:      128000,
			MaxTokens:        0,
			Temperature:      0.7,
			StreamingEnabled: true,
			CurrentModel:     "deepseek-ai/deepseek-v3.2",
		},
		stats: Stats{
			StartTime: time.Now().Format(time.RFC3339),
			ErrorLog:  []ErrorItem{},
		},
		tunnel: TunnelState{
			Status: "stopped",
		},
	}

	app.loadSettings()
	return app
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.StopTunnel()
}

// Settings persistence
func (a *App) loadSettings() {
	path := filepath.Join(a.settingsDir, "settings.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var saved Config
	if err := json.Unmarshal(data, &saved); err != nil {
		return
	}

	a.mu.Lock()
	a.config = saved
	a.mu.Unlock()
	log.Println("Loaded settings from:", path)
}

func (a *App) saveSettings() error {
	a.mu.RLock()
	data, err := json.MarshalIndent(a.config, "", "  ")
	a.mu.RUnlock()
	if err != nil {
		return err
	}

	path := filepath.Join(a.settingsDir, "settings.json")
	return os.WriteFile(path, data, 0644)
}

// Wails-exposed methods (called from frontend)

// GetHealth returns current health status
func (a *App) GetHealth() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return map[string]interface{}{
		"status":             "ok",
		"service":            "NIMB",
		"model":              a.config.CurrentModel,
		"api_key_configured": a.config.APIKey != "",
		"config":             a.config,
		"stats":              a.stats,
		"tunnel": map[string]string{
			"url":    a.tunnel.URL,
			"status": a.tunnel.Status,
		},
		"uptime":        int(time.Since(a.startTime).Seconds()),
		"setupComplete": a.config.APIKey != "",
	}
}

// GetConfig returns current config
func (a *App) GetConfig() Config {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.config
}

// SaveConfig saves config
func (a *App) SaveConfig(cfg Config) bool {
	a.mu.Lock()
	// Preserve API key if not provided
	if cfg.APIKey == "" {
		cfg.APIKey = a.config.APIKey
	}
	a.config = cfg
	a.mu.Unlock()

	if err := a.saveSettings(); err != nil {
		log.Println("Failed to save settings:", err)
		return false
	}
	return true
}

// SetModel sets the current model
func (a *App) SetModel(model string) bool {
	a.mu.Lock()
	a.config.CurrentModel = model
	a.mu.Unlock()
	return a.saveSettings() == nil
}

// SetAPIKey sets the API key
func (a *App) SetAPIKey(key string) bool {
	a.mu.Lock()
	a.config.APIKey = key
	a.mu.Unlock()
	return a.saveSettings() == nil
}

// GetStats returns usage stats
func (a *App) GetStats() Stats {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.stats
}

// ResetStats resets usage stats
func (a *App) ResetStats() bool {
	a.mu.Lock()
	a.stats = Stats{
		StartTime: time.Now().Format(time.RFC3339),
		ErrorLog:  []ErrorItem{},
	}
	a.mu.Unlock()
	return true
}

// StartTunnel starts cloudflare tunnel
func (a *App) StartTunnel() map[string]interface{} {
	a.tunnel.mu.Lock()
	defer a.tunnel.mu.Unlock()

	if a.tunnel.Status == "running" {
		return map[string]interface{}{
			"success": true,
			"url":     a.tunnel.URL,
			"status":  "running",
		}
	}

	// Find cloudflared.exe
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)
	cfPath := filepath.Join(exeDir, "cloudflared.exe")

	if _, err := os.Stat(cfPath); os.IsNotExist(err) {
		return map[string]interface{}{
			"success": false,
			"error":   "cloudflared.exe not found. Place it next to NIMB.exe",
		}
	}

	a.tunnel.Status = "starting"

	cmd := exec.Command(cfPath, "tunnel", "--url", "http://localhost:3000")
	// Hide console window on Windows
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		a.tunnel.Status = "stopped"
		return map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
	}

	a.tunnel.process = cmd

	// Read tunnel URL from stderr
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stderr.Read(buf)
			if err != nil {
				break
			}
			output := string(buf[:n])
			log.Println("Cloudflared:", output)

			// Look for tunnel URL
			if strings.Contains(output, "trycloudflare.com") {
				start := strings.Index(output, "https://")
				if start != -1 {
					end := strings.Index(output[start:], " ")
					if end == -1 {
						end = len(output) - start
					}
					url := strings.TrimSpace(output[start : start+end])
					if strings.HasSuffix(url, ".") {
						url = url[:len(url)-1]
					}
					a.tunnel.mu.Lock()
					a.tunnel.URL = url
					a.tunnel.Status = "running"
					a.tunnel.mu.Unlock()
				}
			}
		}
	}()

	// Wait for process to exit
	go func() {
		cmd.Wait()
		a.tunnel.mu.Lock()
		a.tunnel.Status = "stopped"
		a.tunnel.URL = ""
		a.tunnel.process = nil
		a.tunnel.mu.Unlock()
	}()

	return map[string]interface{}{
		"success": true,
		"status":  "starting",
	}
}

// StopTunnel stops cloudflare tunnel
func (a *App) StopTunnel() bool {
	a.tunnel.mu.Lock()
	defer a.tunnel.mu.Unlock()

	if a.tunnel.process != nil {
		a.tunnel.process.Process.Kill()
		a.tunnel.process = nil
	}
	a.tunnel.Status = "stopped"
	a.tunnel.URL = ""
	return true
}

// GetTunnelStatus returns tunnel status
func (a *App) GetTunnelStatus() map[string]string {
	a.tunnel.mu.Lock()
	defer a.tunnel.mu.Unlock()
	return map[string]string{
		"url":    a.tunnel.URL,
		"status": a.tunnel.Status,
	}
}

// Window controls
func (a *App) Minimize() {
	runtime.WindowMinimise(a.ctx)
}

func (a *App) Maximize() {
	if runtime.WindowIsMaximised(a.ctx) {
		runtime.WindowUnmaximise(a.ctx)
	} else {
		runtime.WindowMaximise(a.ctx)
	}
}

func (a *App) Close() {
	runtime.Quit(a.ctx)
}

// HTTP Handlers for the proxy server

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.GetHealth())
}

func (a *App) handleModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"object":"list","data":[]}`))
}

func (a *App) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	a.mu.RLock()
	apiKey := a.config.APIKey
	config := a.config
	a.mu.RUnlock()

	if apiKey == "" {
		a.logError("API key not configured", 500)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		w.Write([]byte(`{"error":{"message":"API key not configured","type":"configuration_error","code":500}}`))
		return
	}

	// Parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		a.logError(err.Error(), 400)
		http.Error(w, err.Error(), 400)
		return
	}

	var reqBody map[string]interface{}
	if err := json.Unmarshal(body, &reqBody); err != nil {
		a.logError(err.Error(), 400)
		http.Error(w, err.Error(), 400)
		return
	}

	// Build NIM request
	nimReq := map[string]interface{}{
		"model":    config.CurrentModel,
		"messages": reqBody["messages"],
	}

	// Use client values if provided, otherwise use config
	if temp, ok := reqBody["temperature"].(float64); ok {
		nimReq["temperature"] = temp
	} else {
		nimReq["temperature"] = config.Temperature
	}

	if maxTok, ok := reqBody["max_tokens"].(float64); ok {
		nimReq["max_tokens"] = int(maxTok)
	} else {
		nimReq["max_tokens"] = config.MaxTokens
	}

	if stream, ok := reqBody["stream"].(bool); ok {
		nimReq["stream"] = stream
	} else {
		nimReq["stream"] = config.StreamingEnabled
	}

	// Passthrough params from client (forward to NVIDIA as-is)
	passthroughParams := []string{"top_p", "top_k", "frequency_penalty", "presence_penalty", "repetition_penalty", "min_p", "seed", "stop", "n", "context_length", "context_window", "truncate"}
	for _, p := range passthroughParams {
		if v, ok := reqBody[p]; ok {
			nimReq[p] = v
		}
	}

	if config.LogRequests {
		log.Printf("[NIMB] %v -> %s", reqBody["model"], config.CurrentModel)
	}

	// Make request to NIM
	nimBody, _ := json.Marshal(nimReq)
	client := &http.Client{Timeout: 120 * time.Second}
	nimReqHTTP, _ := http.NewRequest("POST", "https://integrate.api.nvidia.com/v1/chat/completions", bytes.NewReader(nimBody))
	nimReqHTTP.Header.Set("Authorization", "Bearer "+apiKey)
	nimReqHTTP.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(nimReqHTTP)
	if err != nil {
		a.logError(err.Error(), 500)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": err.Error(),
				"type":    "api_error",
				"code":    500,
			},
		})
		return
	}
	defer resp.Body.Close()

	// Update stats
	a.mu.Lock()
	a.stats.MessageCount++
	a.stats.LastRequestTime = time.Now().Format(time.RFC3339)
	a.mu.Unlock()

	isStream := nimReq["stream"].(bool)

	if isStream {
		// Stream response
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", 500)
			return
		}

		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
				flusher.Flush()
			}
			if err != nil {
				break
			}
		}
	} else {
		// Non-streaming response
		respBody, _ := io.ReadAll(resp.Body)

		var nimResp map[string]interface{}
		json.Unmarshal(respBody, &nimResp)

		// Update token stats
		if usage, ok := nimResp["usage"].(map[string]interface{}); ok {
			a.mu.Lock()
			if pt, ok := usage["prompt_tokens"].(float64); ok {
				a.stats.PromptTokens += int(pt)
			}
			if ct, ok := usage["completion_tokens"].(float64); ok {
				a.stats.CompletionTokens += int(ct)
			}
			if tt, ok := usage["total_tokens"].(float64); ok {
				a.stats.TotalTokens += int(tt)
			}
			a.mu.Unlock()
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(respBody)
	}

	if config.LogRequests {
		log.Println("[NIMB] Done")
	}
}

func (a *App) logError(msg string, code int) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.stats.ErrorCount++
	a.stats.ErrorLog = append([]ErrorItem{{
		Timestamp: time.Now().Format(time.RFC3339),
		Message:   msg,
		Code:      code,
	}}, a.stats.ErrorLog...)

	if len(a.stats.ErrorLog) > 50 {
		a.stats.ErrorLog = a.stats.ErrorLog[:50]
	}
}
