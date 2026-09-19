// Quando VS Code o altri tool impostano ELECTRON_RUN_AS_NODE=1, Electron gira come Node.js puro.
// In quel caso require('electron') restituisce il path all'eseguibile — usiamolo per rilanciare
// senza la variabile problematica.
if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  const { spawn } = require('child_process');
  // In dev: require('electron') restituisce il path a electron.exe (dal pacchetto npm)
  // In app packaged: non c'è node_modules, usiamo process.execPath direttamente
  let exePath, exeArgs;
  try {
    exePath = require('electron');
    exeArgs = [__dirname];
  } catch {
    exePath = process.execPath;
    exeArgs = [];
  }
  spawn('cmd', ['/c', 'start', '', exePath, ...exeArgs], {
    detached: true,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '0' })
  }).unref();
  process.exit(0);
}

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 768,
    minHeight: 600,
    title: 'Finanze Personali',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  mainWindow.loadFile('dashboard.html');

  // Mostra la finestra solo quando è pronta (evita flash bianco)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Apri i link esterni nel browser di sistema invece che in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
