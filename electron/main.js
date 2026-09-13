/* Proceso principal de Electron: ventana + diálogos nativos de abrir/guardar */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Claquedraw',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false /* el corrector propio (js/spell.js) evita el doble subrayado */
    }
  });
  /* La app abre Claquedraw (esquema de pasos + editor); el editor va dentro, en su marco */
  win.loadFile(path.join(__dirname, '..', 'claquedraw.html'));
  ventana = win;
  win.on('closed', () => { if (ventana === win) ventana = null; });

  /* Los enlaces externos se abren en el navegador del sistema */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* Abrir un .cld desde el Finder (doble clic o «Abrir con»): macOS avisa con open-file, a veces antes
   de que exista la ventana; Windows/Linux pasan la ruta en los argumentos. */
let ventana = null, rutaPendiente = null;
function abrirRuta(p) {
  if (!p || !/\.(cld|json)$/i.test(p)) return;
  if (ventana && !ventana.webContents.isLoading()) ventana.webContents.send('abrir-ruta', p);
  else rutaPendiente = p;
}
app.on('open-file', (e, p) => { e.preventDefault(); abrirRuta(p); });

app.whenReady().then(() => {
  createWindow();
  const arg = process.argv.slice(1).find(a => /\.(cld|json)$/i.test(a));
  if (arg) rutaPendiente = arg;
  ventana.webContents.on('did-finish-load', () => { if (rutaPendiente) { const p = rutaPendiente; rutaPendiente = null; ventana.webContents.send('abrir-ruta', p); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('file:save', async (event, { defaultPath, content, filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath, filters });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
});

/* Escritura y lectura sin diálogo, para el autoguardado de Claquedraw en el archivo ya elegido */
ipcMain.handle('file:write', async (event, { path: p, content }) => {
  await fs.writeFile(p, content, 'utf8');
  return p;
});
ipcMain.handle('file:read', async (event, { path: p }) => fs.readFile(p, 'utf8'));

ipcMain.handle('file:open', async (event, { filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (canceled || !filePaths[0]) return null;
  const p = filePaths[0];
  return { path: p, name: path.basename(p), content: await fs.readFile(p, 'utf8') };
});
