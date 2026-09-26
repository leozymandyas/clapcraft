/* Proceso principal de Electron: ventana + diálogos nativos de abrir/guardar */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');

/* **Una ventana por proyecto** (1.1.33, Leo: «que los proyectos se abran en nuevas ventanas y pueda tener varios abiertos a la
   vez»). Cada ventana carga claquedraw.html con su proyecto en la dirección (`?p=<id>`; o `?nuevo`, `?ruta` para crear o abrir
   uno ahí) y le dice aquí cuál lleva y con qué archivo (`ventana:proyecto`). Con eso: abrir un archivo que ya tiene una
   ventana la trae delante en lugar de abrirlo otra vez, y **al salir de la app se recuerdan las ventanas con su proyecto**
   (`ventanas.json` en los datos de la app) para abrirlas igual la próxima vez. Cerrar una ventana es cerrar su proyecto:
   el botón rojo se lo pregunta antes a la página (escribe su archivo o pide confirmación si no tiene), y salir de la app no
   pregunta ni las olvida. */
const fsSync = require('fs');
const ventanas = new Map();   // webContents.id → { win, proyecto, ruta, nuevo, cerrable }
let saliendo = false, listo = false, pendientes = [];
let claude = null;                                             // el puente con Claude (electron/claude.js), desde que la app está lista
const SESION = () => path.join(app.getPath('userData'), 'ventanas.json');
function guardarSesion() {
  if (saliendo) return;                                  // saliendo de la app, las ventanas que se cierran no se olvidan
  const lista = [...ventanas.values()].filter(v => v.proyecto && !v.win.isDestroyed()).map(v => ({ p: v.proyecto, bounds: v.win.getBounds() }));
  try { fsSync.writeFileSync(SESION(), JSON.stringify(lista)); } catch (_) {}
}
function leerSesion() {
  try { const l = JSON.parse(fsSync.readFileSync(SESION(), 'utf8')); return Array.isArray(l) ? l.filter(x => x && typeof x.p === 'string') : []; } catch (_) { return []; }
}
function enfocar(win) { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
/* una ventana nueva, un poco más abajo y a la derecha que la de delante */
function cascada() {
  const w = BrowserWindow.getFocusedWindow() || [...ventanas.values()].map(v => v.win).filter(x => !x.isDestroyed()).pop();
  if (!w) return null;
  const b = w.getBounds(); return { x: b.x + 28, y: b.y + 28, width: b.width, height: b.height };
}
function createWindow(q, bounds) {
  const win = new BrowserWindow(Object.assign({
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
  }, bounds || {}));
  const id = win.webContents.id;
  const v = { win, proyecto: (q && q.p) || null, ruta: (q && q.ruta) || null, nuevo: !!(q && q.nuevo), cerrable: false };
  ventanas.set(id, v);
  /* La app abre ClapCraft (claquedraw.html: esquema de pasos + editor); el editor va dentro, en su marco */
  win.loadFile(path.join(__dirname, '..', 'claquedraw.html'), q && Object.keys(q).length ? { query: q } : undefined);
  /* el botón rojo: con un proyecto, primero la página (que escribe lo pendiente o pregunta) y ella la cierra */
  win.on('close', e => {
    if (saliendo || v.cerrable || !v.proyecto || win.webContents.isLoading() || win.webContents.isCrashed()) return;
    e.preventDefault();
    win.webContents.send('menu', 'cerrarVentana');
  });
  win.on('closed', () => { ventanas.delete(id); if (!saliendo) guardarSesion(); if (claude) claude.alCambiarVentanas(); });
  win.on('focus', () => { if (claude) claude.enfocada(id); });   // «el que está delante», para Claude
  let t = null; const recolocada = () => { clearTimeout(t); t = setTimeout(guardarSesion, 400); };
  win.on('resize', recolocada); win.on('move', recolocada);

  /* Los enlaces externos se abren en el navegador del sistema */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    else if (/^clapcraft:\/\//i.test(url)) abrirEnlace(url);   // un enlace de ClapCraft dentro de un documento (Cmd+clic, 1.1.52): a su sitio
    return { action: 'deny' };
  });
  return win;
}
app.on('before-quit', () => { guardarSesion(); saliendo = true; });

/* Abrir un .clapcraft desde el Finder (doble clic o «Abrir con»): si ya tiene ventana, esa; si hay una ventana sin proyecto
   (en «Sin proyectos»), ahí; si no, una nueva. macOS avisa con open-file, a veces antes de que la app esté lista; Windows y
   Linux pasan la ruta en los argumentos. */
function abrirRuta(p) {
  if (!p || !/\.clapcraft$/i.test(p)) return;
  if (!listo) { pendientes.push(p); return; }
  const ya = [...ventanas.values()].find(v => v.ruta === p);
  if (ya) { enfocar(ya.win); return; }
  const vacia = [...ventanas.values()].find(v => !v.proyecto && !v.nuevo && !v.win.webContents.isLoading());
  if (vacia) { vacia.win.webContents.send('abrir-ruta', p); enfocar(vacia.win); return; }
  createWindow({ ruta: p }, cascada());
}
app.on('open-file', (e, p) => { e.preventDefault(); abrirRuta(p); });

/* **Enlaces clapcraft://** (1.1.52): el sistema le pasa a ClapCraft los que se abren fuera (un clic en uno que escribió Claude, si
   su app los deja abrir); van a la ventana de su proyecto —abriéndolo si hace falta— y ahí, a su sitio (electron/claude.js). El
   Info.plist los declara (package.json, build.protocols); hacerla la app por defecto, solo empaquetada (en desarrollo se
   llevaría los enlaces del ClapCraft instalado). */
let enlacesPendientes = [];
function abrirEnlace(url) {
  if (!/^clapcraft:\/\//i.test(String(url || ''))) return;
  if (!listo || !claude) { enlacesPendientes.push(url); return; }
  claude.irAEnlace(url);
}
app.on('open-url', (e, url) => { e.preventDefault(); abrirEnlace(url); });
if (app.isPackaged) { try { app.setAsDefaultProtocolClient('clapcraft'); } catch (_) {} }
ipcMain.handle('portapapeles:escribir', (_e, t) => { clipboard.writeText(String(t || '')); return true; });
ipcMain.handle('portapapeles:leer', () => clipboard.readText());
ipcMain.on('enlace:ir', (_e, url) => abrirEnlace(String(url || '')));
/* cuando el archivo de un proyecto cambia de nombre (1.1.52, electron/claude.js) */
ipcMain.handle('archivo:id', async (_e, ruta) => { try { const st = await fs.stat(ruta); return { ino: st.ino }; } catch (_) { return null; } });
ipcMain.handle('archivo:buscar', async (_e, q) => (claude && q ? claude.buscarPorInodo(q.ruta, q.ino) : null));
ipcMain.handle('proyecto:hay', async (_e, q) => (claude && q ? claude.hayProyecto(q.slug, q.salvo, q.rutas) : false));

ipcMain.on('ventana:proyecto', (e, info) => {
  const v = ventanas.get(e.sender.id); if (!v) return;
  v.proyecto = (info && info.id) || null; v.ruta = (info && info.ruta) || null; v.nuevo = !!(info && info.nuevo);
  v.nombre = (info && info.nombre) || null;
  v.enlaces = Array.isArray(info && info.enlaces) ? info.enlaces.filter(x => typeof x === 'string').slice(0, 24) : [];   // cómo se le llama en sus enlaces (1.1.52)
  guardarSesion();
  if (claude) claude.alCambiarVentanas();
});
/* otra ventana: si ese proyecto o ese archivo ya tienen la suya, se trae delante */
ipcMain.handle('ventana:abrir', (e, q) => {
  q = q || {};
  const v0 = ventanas.get(e.sender.id);
  const ya = [...ventanas.values()].find(v => v !== v0 && ((q.p && v.proyecto === q.p) || (q.ruta && v.ruta === q.ruta)));
  if (ya) { enfocar(ya.win); return { ya: true }; }
  const limpio = {}; ['p', 'ruta', 'nuevo', 'h', 't'].forEach(k => { if (q[k]) limpio[k] = String(q[k]); });
  createWindow(limpio, cascada());
  return { ok: true };
});
/* ¿quién tiene ese archivo? 'aqui', 'otra' (y se trae delante, si `enfocarla`) o null */
ipcMain.handle('ventana:buscarRuta', (e, { ruta, enfocarla } = {}) => {
  const v0 = ventanas.get(e.sender.id);
  if (v0 && ruta && v0.ruta === ruta) return 'aqui';
  const ya = ruta && [...ventanas.values()].find(v => v !== v0 && v.ruta === ruta);
  if (!ya) return null;
  if (enfocarla !== false) enfocar(ya.win);
  return 'otra';
});
/* cierra la ventana que lo pide; sin `forzar`, no si es la única (se queda en «Sin proyectos») */
ipcMain.handle('ventana:cerrar', (e, { forzar } = {}) => {
  const v = ventanas.get(e.sender.id); if (!v) return false;
  if (!forzar && ventanas.size <= 1) return false;
  v.cerrable = true; v.proyecto = null; guardarSesion();
  setImmediate(() => { if (!v.win.isDestroyed()) v.win.close(); });
  return true;
});

/* Menú de la aplicación: Archivo, Edición y Ver mandan órdenes al renderer (canal 'menu'); así los
   botones de guardar, abrir o modo oscuro no hace falta tenerlos en la barra de la página. Deshacer y
   Rehacer no llevan rol nativo: el tablero tiene su propio historial y el editor el suyo. En Ver solo
   va el modo oscuro (Leo): las vistas se cambian desde la barra de documentos y con los atajos de la
   página (Ctrl+Shift+G/F/K/T/B), que en Electron llegan porque el menú ya no los captura. */
function enviar(accion) { const w = BrowserWindow.getFocusedWindow() || [...ventanas.values()].map(v => v.win).find(x => !x.isDestroyed()); if (w) w.webContents.send('menu', accion); }
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
      { type: 'separator' },
      /* Cmd+W cierra la pestaña de delante (con la última, el proyecto, como un navegador); cerrar el proyecto cierra su ventana */
      { label: 'Pestaña nueva', accelerator: 'CmdOrCtrl+T', click: () => enviar('nuevaPestana') },
      { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => enviar('cerrarPestana') },
      { label: 'Cerrar proyecto', accelerator: 'CmdOrCtrl+Shift+W', click: () => enviar('cerrar') },
      ...(mac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Salir' }]) ] },
    { label: 'Edición', submenu: [
      { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => enviar('deshacer') },
      { label: 'Rehacer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => enviar('rehacer') },
      { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' } ] },
    { label: 'Ver', submenu: [
      { label: temaOscuro ? 'Modo claro' : 'Modo oscuro', accelerator: 'CmdOrCtrl+Shift+D', click: () => enviar('tema') } ] },
    /* Claude (1.1.49, electron/claude.js): la conexión se puede apagar; apagada, Claude solo toca los proyectos cerrados */
    { label: 'Claude', submenu: [
      { label: 'Permitir que Claude acceda', type: 'checkbox', checked: !!(claude && claude.activo()), click: m => { if (claude) claude.alternar(m.checked); } },
      { type: 'separator' },
      /* enlaces (1.1.52): el de lo elegido (o de lo que se ve) para pegarlo en Claude, e ir al que se copió (uno que dio Claude) */
      { label: 'Copiar enlace para Claude', accelerator: 'CmdOrCtrl+Shift+C', click: () => enviar('copiarEnlace') },
      { label: 'Ir al enlace copiado', click: () => enviar('irEnlace') },
      { type: 'separator' },
      { label: 'Historial de cambios…', click: () => enviar('historialClaude') },   // lo que ha hecho Claude, y revertirlo (1.1.50)
      { label: 'Conectar con Claude…', click: () => { if (claude) claude.conectar(BrowserWindow.getFocusedWindow()); } } ] },
    { role: 'window', label: 'Ventana', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' }, ...(mac ? [{ type: 'separator' }, { role: 'front', label: 'Traer todo al frente' }] : [{ role: 'close', label: 'Cerrar' }])] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

app.whenReady().then(() => {
  claude = require('./claude')({ app, ipcMain, dialog, shell, clipboard, ventanas, enfocar, abrirRuta, alCambiar: () => montarMenu(), nuevaVentana: () => createWindow() });
  montarMenu();
  listo = true;
  /* las ventanas de la última vez, cada una con su proyecto; si no había, una vacía */
  leerSesion().forEach(x => createWindow({ p: x.p }, x.bounds || undefined));
  const arg = process.argv.slice(1).find(a => /\.clapcraft$/i.test(a));
  if (arg) pendientes.push(arg);
  const rutas = pendientes; pendientes = [];
  if (!ventanas.size && !rutas.length && !enlacesPendientes.length) createWindow();
  rutas.forEach(abrirRuta);
  const enlaces = enlacesPendientes; enlacesPendientes = [];
  enlaces.forEach(abrirEnlace);
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
  if (claude) claude.escrito(filePath);
  await escribir(filePath, content);
  if (claude) claude.escrito(filePath);
  return filePath;
});

/* Escritura y lectura sin diálogo, para el autoguardado de Claquedraw en el archivo ya elegido */
ipcMain.handle('file:write', async (event, { path: p, content }) => {
  if (claude) claude.escrito(p);                                 // lo que escribe la app no cuenta como cambio de fuera
  await escribir(p, content);
  if (claude) claude.escrito(p);
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
