const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// Set settings path for server.js BEFORE requiring it
// Use the directory where the exe is located
process.env.NIMB_DATA_PATH = path.dirname(process.execPath);
console.log('NIMB Data Path:', process.env.NIMB_DATA_PATH);

// Run server inline
require('./server.js');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0d1117',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Wait for server to be ready
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3001');
    }, 1500);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Window controls via IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow?.close());

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
