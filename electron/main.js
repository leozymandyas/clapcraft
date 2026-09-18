/* Proceso principal de Electron: ventana + diálogos nativos de abrir/guardar */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'ClapCraft',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false /* el corrector propio (js/spell.js) evita el doble subrayado */
    }
  });
  /* La app abre ClapCraft (claquedraw.html: esquema de pasos + editor); el editor va dentro, en su marco */
  win.loadFile(path.join(__dirname, '..', 'claquedraw.html'));
  ventana = win;
  win.on('closed', () => { if (ventana === win) ventana = null; });

  /* Los enlaces externos se abren en el navegador del sistema */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* Abrir un .clapcraft desde el Finder (doble clic o «Abrir con»): macOS avisa con open-file, a veces antes
   de que exista la ventana; Windows/Linux pasan la ruta en los argumentos. */
let ventana = null, rutaPendiente = null;
function abrirRuta(p) {
  if (!p || !/\.clapcraft$/i.test(p)) return;
  if (ventana && !ventana.webContents.isLoading()) ventana.webContents.send('abrir-ruta', p);
  else rutaPendiente = p;
}
app.on('open-file', (e, p) => { e.preventDefault(); abrirRuta(p); });

/* Menú de la aplicación: Archivo, Edición y Ver mandan órdenes al renderer (canal 'menu'); así los
   botones de guardar, abrir o modo oscuro no hace falta tenerlos en la barra de la página. Deshacer y
   Rehacer no llevan rol nativo: el tablero tiene su propio historial y el editor el suyo. En Ver solo
   va el modo oscuro (Leo): las vistas se cambian desde la barra de documentos y con los atajos de la
   página (Ctrl+Shift+G/F/K/T/B), que en Electron llegan porque el menú ya no los captura. */
function enviar(accion) { const w = BrowserWindow.getFocusedWindow() || ventana; if (w) w.webContents.send('menu', accion); }
let temaOscuro = false;
ipcMain.on('tema', (_e, oscuro) => { temaOscuro = !!oscuro; montarMenu(); });   // el rótulo del menú sigue al tema
function montarMenu() {
  const mac = process.platform === 'darwin';
  const plantilla = [
    ...(mac ? [{ label: app.name, submenu: [
      { role: 'about', label: 'Acerca de ClapCraft' }, { type: 'separator' },
      { role: 'hide', label: 'Ocultar ClapCraft' }, { role: 'hideOthers', label: 'Ocultar otros' }, { role: 'unhide', label: 'Mostrar todo' },
      { type: 'separator' }, { role: 'quit', label: 'Salir de ClapCraft' }] }] : []),
    { label: 'Archivo', submenu: [
      { label: 'Nuevo proyecto…', accelerator: 'CmdOrCtrl+N', click: () => enviar('nuevo') },
      { label: 'Abrir proyecto…', accelerator: 'CmdOrCtrl+O', click: () => enviar('abrir') },
      { type: 'separator' },
      { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => enviar('guardar') },
      { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => enviar('guardarComo') },
      { type: 'separator' },
      { label: 'Renombrar proyecto…', click: () => enviar('renombrar') },   // el archivo se sigue llamando igual (18-09-2026)
      { label: 'Cerrar proyecto', accelerator: 'CmdOrCtrl+W', click: () => enviar('cerrar') },
      ...(mac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Salir' }]) ] },
    { label: 'Edición', submenu: [
      { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => enviar('deshacer') },
      { label: 'Rehacer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => enviar('rehacer') },
      { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' } ] },
    { label: 'Ver', submenu: [
      { label: temaOscuro ? 'Modo claro' : 'Modo oscuro', accelerator: 'CmdOrCtrl+Shift+D', click: () => enviar('tema') } ] },
    { role: 'window', label: 'Ventana', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' }, ...(mac ? [{ type: 'separator' }, { role: 'front', label: 'Traer todo al frente' }] : [{ role: 'close', label: 'Cerrar' }])] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

app.whenReady().then(() => {
  montarMenu();
  createWindow();
  const arg = process.argv.slice(1).find(a => /\.clapcraft$/i.test(a));
  if (arg) rutaPendiente = arg;
  ventana.webContents.on('did-finish-load', () => { if (rutaPendiente) { const p = rutaPendiente; rutaPendiente = null; ventana.webContents.send('abrir-ruta', p); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* El contenido puede ser texto (tramas.html) o bytes (los .clapcraft van comprimidos con gzip); al leer,
   `binario` devuelve los bytes tal cual. */
const escribir = (p, content) => typeof content === 'string' ? fs.writeFile(p, content, 'utf8') : fs.writeFile(p, Buffer.from(content));
const leer = (p, binario) => binario ? fs.readFile(p).then(b => new Uint8Array(b)) : fs.readFile(p, 'utf8');
ipcMain.handle('file:save', async (event, { defaultPath, content, filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath, filters });
  if (canceled || !filePath) return null;
  await escribir(filePath, content);
  return filePath;
});

/* Escritura y lectura sin diálogo, para el autoguardado de Claquedraw en el archivo ya elegido */
ipcMain.handle('file:write', async (event, { path: p, content }) => {
  await escribir(p, content);
  return p;
});
ipcMain.handle('file:read', async (event, { path: p, binario }) => leer(p, binario));

/* Exportar a PDF (Claquedraw): el HTML imprimible se carga en una ventana escondida y se imprime a un archivo. Las fuentes
   (Courier Prime) se piden a la carpeta fonts/ de la app: el renderer escribe «FUENTES/» y aquí se cambia por su ruta. */
ipcMain.handle('pdf:save', async (event, { html, defaultPath }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath, filters: [{ name: 'Documento PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return null;
  const os = require('os'), { pathToFileURL } = require('url');
  const fuentes = pathToFileURL(path.join(__dirname, '..', 'fonts') + path.sep).href;
  const tmp = path.join(os.tmpdir(), 'clapcraft-exportar-' + Date.now() + '.html');
  await fs.writeFile(tmp, String(html).split('FUENTES/').join(fuentes), 'utf8');
  const oculta = new BrowserWindow({ show: false });
  try {
    await oculta.loadFile(tmp);
    await oculta.webContents.executeJavaScript('document.fonts.ready.then(() => true)');   // que carguen las fuentes
    const pdf = await oculta.webContents.printToPDF({ pageSize: 'Letter', printBackground: false, preferCSSPageSize: true });
    await fs.writeFile(filePath, pdf);
  } finally {
    oculta.destroy(); fs.unlink(tmp).catch(() => {});
  }
  return filePath;
});

ipcMain.handle('file:open', async (event, { filters, binario }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (canceled || !filePaths[0]) return null;
  const p = filePaths[0];
  return { path: p, name: path.basename(p), content: await leer(p, binario) };
});

/* Nuevo proyecto (ClapCraft, Leo 18-09-2026): «Crear proyecto» pide el archivo con el diálogo de guardar del sistema, con el
   nombre que propone la página («anio-nuevo.clapcraft») en la última carpeta usada, o en ~/Documents/ClapCraft si existe, o
   en Documentos. Solo elige: el archivo lo escribe después la página, como el autoguardado. */
const esCarpeta = p => fs.stat(p).then(s => s.isDirectory(), () => false);
ipcMain.handle('proyecto:elegirArchivo', async (event, { nombre, carpeta, filters } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const propia = path.join(app.getPath('documents'), 'ClapCraft');
  const dir = carpeta && await esCarpeta(carpeta) ? carpeta : await esCarpeta(propia) ? propia : app.getPath('documents');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Crear proyecto', message: 'Elige el nombre del archivo y dónde se guarda el proyecto', buttonLabel: 'Crear',
    nameFieldLabel: 'Archivo:', defaultPath: path.join(dir, path.basename(String(nombre || 'proyecto.clapcraft'))), filters,
    properties: ['createDirectory', 'showOverwriteConfirmation'], showsTagField: false });
  return canceled || !filePath ? null : filePath;
});
ipcMain.handle('app:version', () => app.getVersion());
