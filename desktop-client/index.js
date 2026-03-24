const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow;
let tray;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'GSTD Sovereign Node',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // We assume the Node OS / Dashboard is running via the standard CLI command on port 8080.
    // In a full bundled version, we would spawn the node backend process here.
    mainWindow.loadURL('http://localhost:8080').catch(err => {
        mainWindow.loadFile('offline.html');
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

const startNodeBackend = () => {
    // This executes the bash node runner for GSTD node
    exec('curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash', (err, stdout, stderr) => {
        if (err) console.error("Failed to start node:", err);
    });
};

app.whenReady().then(() => {
    startNodeBackend();
    createWindow();

    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Dashboard', click: () => mainWindow.show() },
        { label: 'Quit', click: () => {
            app.isQuiting = true;
            app.quit();
        }}
    ]);
    tray.setToolTip('GSTD Node OS');
    tray.setContextMenu(contextMenu);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
