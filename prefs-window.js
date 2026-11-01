// The Settings window: a normal, focusable window (the island itself never takes focus).
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const log = require('./log');

let win = null;

function open() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: '#070708',
    title: 'Nova Island Settings',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'prefs', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'prefs', 'index.html'));
  const reveal = () => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', () => { log.info('settings ready'); reveal(); });
  win.webContents.on('did-fail-load', (_e, code, message) => console.error('[settings-load]', code, message));
  win.webContents.on('console-message', e=>{
    if(e.message?.startsWith('[glass-worker]'))log.info('settings '+e.message);
    else if(e.level==='error')console.error('[settings-renderer]',e.message);
  });
  win.on('closed', () => { win = null; });
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

ipcMain.on('prefs-window', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w !== win) return;
  if (action === 'close') w.close();
  else if (action === 'minimize') w.minimize();
});

module.exports = { open, send };
