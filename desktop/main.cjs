const { join } = require('node:path');
const { app, BrowserWindow, dialog, protocol } = require('electron');
const { gameAssetResponse } = require('./assets.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: 'righty',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

app.setName('Righty Tighty 99');

async function openGame() {
  const assets = join(app.getAppPath(), 'dist');
  protocol.handle('righty', request => gameAssetResponse(request, assets));

  const window = new BrowserWindow({
    title: 'Righty Tighty 99',
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    backgroundColor: '#171719',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('righty://game/')) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  await window.loadURL('righty://game/');
}

app.whenReady().then(openGame).catch(error => {
  dialog.showErrorBox('Righty Tighty 99 无法启动', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
