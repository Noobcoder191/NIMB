package main

import (
	"embed"
	"log"
	"net/http"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create the app
	app := NewApp()

	// Start the proxy server in background
	go func() {
		mux := http.NewServeMux()

		// Health endpoint
		mux.HandleFunc("/health", app.handleHealth)

		// Models endpoint
		mux.HandleFunc("/v1/models", app.handleModels)

		// Chat completions endpoint
		mux.HandleFunc("/v1/chat/completions", app.handleChatCompletions)

		// Root endpoint
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"message":"NIMB API Proxy","endpoints":{"health":"/health","models":"/v1/models","chat":"/v1/chat/completions"}}`))
		})

		log.Println("🚀 NIMB Proxy on port 3000")
		if err := http.ListenAndServe(":3000", corsMiddleware(mux)); err != nil {
			log.Printf("Proxy server error: %v", err)
		}
	}()

	// Run Wails app
	err := wails.Run(&options.App{
		Title:            "NIMB",
		Width:            1200,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		DisableResize:    false,
		Frameless:        true,
		BackgroundColour: &options.RGBA{R: 13, G: 17, B: 23, A: 255},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
	})

	if err != nil {
		log.Fatal("Error:", err.Error())
	}
}

// CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
