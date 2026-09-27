/* Prueba de punta a punta de los lienzos de nodos con Claude (1.1.58), con la app de verdad (Electron):
   `electron pruebas/lienzo-claude-electron.js`.
   Leo (27-09-2026): «un lienzo con nodos donde se conecten notas, notas con imágenes y esquemas; en lugar de generar videos,
   nosotros generamos guiones y también los partimos», y «también déjame incluir segmentos y personajes». ClapCraft no llama a
   ninguna IA: el ▶ deja el nodo pendiente y copia su encargo, y Claude (Cowork o Claude Code) lo ejecuta por MCP en vivo.
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos y el portapapeles de mentira:
   el de verdad es el de Leo) y el servidor MCP como lo arranca Claude (con el Node de la app, ELECTRON_RUN_AS_NODE). Con **el
   ratón y el teclado de verdad** (`webContents.sendInputEvent`, la ventana enfocada):
   a) un proyecto con una biblioteca (una nota con texto y una imagen, un segmento), un personaje con su hoja y un esquema con
      guion (este, escrito por Claude);
   b) crear un lienzo desde el ⋯ del contenedor; arrastrar desde el árbol el esquema y el personaje; «Añadir al lienzo…» de la
      nota y del segmento;
   c) «Generar guion» y «Partir en fragmentos» desde el menú del lienzo (doble clic en el fondo), sus destinos y los cables con
      el ratón;
   d) ▶ «Pedir a Claude»: los dos quedan pendientes y el encargo, con los enlaces de sus nodos, va al portapapeles;
   e) Claude: leer_lienzo (las pendientes en orden), ejecutar_nodo de generar (la imagen de la nota llega como contenido de imagen),
      crea el esquema destino, escribe el guion y completar_nodo; en la app, «Hecho» con la ficha que lleva al documento;
   f) ejecutar_nodo de partir → preparar_fragmentos → editar_biblioteca con notas-fragmento → completar_nodo; el nodo enseña los
      fragmentos;
   g) cambiar la instrucción de generar lo deja desactualizado y a partir, desactualizado por la cadena;
   h) revertir desde el historial de Claude (y su «Deshacer»);
   i) el archivo guarda el lienzo; cerrado y vuelto a abrir siguen sus nodos, cables, estados y salidas; la pestaña del lienzo
      vuelve al recargar;
   j) el enlace de un nodo lleva a él; el lienzo a la papelera y de vuelta;
   k) los cuatro temas, sin errores (con `PRUEBA_CAPTURAS=<carpeta>`, la captura de cada uno);
   l) la página y el servidor no sueltan ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lienzo-claude-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.PRUEBA_CAPTURAS || null;
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
/* el portapapeles, de mentira (el de verdad es el de Leo) */
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 1400)));
}
/* el servidor MCP, arrancado como lo arranca Claude; `llamar` devuelve el texto y todas las piezas de contenido */
function mcp() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, errores = '';
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', d => { errores += d; });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => {
    const r = await pedir('tools/call', { name, arguments: args || {} });
    if (r.error) return { error: true, texto: JSON.stringify(r.error), contenido: [] };
    const c = r.result.content || [];
    return { error: !!r.result.isError, texto: c.filter(x => x.type === 'text').map(x => x.text).join('\n'), contenido: c };
  };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}
const leerArchivo = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
/* una imagen PNG pequeña de verdad (un degradado con un círculo), hecha en la página */
const IMG_JS = `(() => { const k = document.createElement('canvas'); k.width = 160; k.height = 100; const x = k.getContext('2d');
  const g = x.createLinearGradient(0, 0, 160, 100); g.addColorStop(0, '#f90'); g.addColorStop(1, '#223'); x.fillStyle = g; x.fillRect(0, 0, 160, 100);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(50, 50, 20, 0, 7); x.fill(); return k.toDataURL('image/png'); })()`;

/* el guion de partida del esquema, y el que «genera» Claude */
const GUION_BASE = ['INT. AZOTEA - ATARDECER', '', 'Mara ajusta el celular sobre un tinaco y respira hondo antes de grabar.', '',
  'MARA', 'Hola a todos. Hoy les cuento algo que nunca le he contado a nadie.'].join('\n');
const GUION_NUEVO = [
  'INT. AZOTEA - ATARDECER', '',
  'La luz naranja de las cinco cae sobre los tinacos. MARA SOLÍS acomoda el celular en un tripié torcido y se mira en la pantalla.', '',
  'MARA', '(a la cámara)', 'Hola a todos. Hoy no traigo baile ni reto. Hoy traigo una historia que me da miedo contar.', '',
  'Se sienta en el sillón viejo. Las antenas crujen con el viento.', '',
  'MARA', 'Hace un año dejé de hablar con mi hermana. Y nadie en internet lo sabe, porque aquí todo se ve bonito.', '',
  'EXT. CALLE DE LA ROMA - NOCHE', '',
  'Mara baja las escaleras de servicio con el celular todavía grabando. Un vecino la saluda desde la ventana.', '',
  'MARA', 'Voy a buscarla. Si sale mal, lo van a ver en vivo.', '',
  'FUNDIDO A NEGRO.'].join('\n');

app.whenReady().then(async () => {
  let win = null, M = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const preparar = w => {
    w.webContents.on('console-message', ev => {
      const nivel = ev.level ?? ev.params?.level, msg = ev.message ?? ev.params?.message;
      if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); }
    });
    w.webContents.setBackgroundThrottling(false);
  };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  /* ---------- el ratón y el teclado de verdad ---------- */
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: op.n || 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 250 : op.tras);
  }
  async function dobleClic(p) { await clic(p, { tras: 180 }); await clic(p, { n: 2, tras: 400 }); }
  async function arrastrar(a, b, op) {
    op = op || {};
    const pasos = op.pasos || 14;
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(40);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) { const x = a.x + (b.x - a.x) * i / pasos, y = a.y + (b.y - a.y) * i / pasos; ev({ type: 'mouseMove', x: R(x), y: R(y), button: 'left', modifiers: ['leftButtonDown'] }); await espera(30); }
    await espera(100);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(op.tras || 500);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras);
  }
  async function escribir(t) { for (const ch of t) { ev({ type: 'char', keyCode: ch }); await espera(18); } await espera(120); }
  async function centro(expr, sinDesplazar) {
    const r = await js(`const el = ${expr}; if (!el) return null; ${sinDesplazar ? '' : `el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);`}
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, l: b.left, t: b.top });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  /* lo que hay bajo un punto es de ese elemento (para no arrastrar desde otro nodo que lo tape) */
  const libre = (expr, p) => js(`const el = ${expr}, x = document.elementFromPoint(${R(p.x)}, ${R(p.y)}); return !!el && !!x && (el === x || el.contains(x));`);
  const D = `Claquedraw.gestor.documentos()`;
  const opcionPop = t => `[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  const accionAviso = t => `[...document.querySelectorAll('#aviso .aviso-accion')].find(b => b.textContent === ${JSON.stringify(t)})`;
  const avisoTxt = () => js(`return document.getElementById('aviso').textContent;`);
  const menu = (grupo, texto) => Menu.getApplicationMenu().items.find(i => i.label === grupo).submenu.items.find(i => i.label === texto);
  const filaArbol = (tipo, nombre) => `[...document.querySelectorAll('#gdSide .gd-sub--${tipo}')].find(f => f.querySelector('.gd-sub-nom').textContent === ${JSON.stringify(nombre)})`;
  const nodoEl = id => `document.querySelector('#lzNodos [data-lz-nodo="${id}"]')`;
  const LIENZO = 'Del guion al vídeo';
  const datosL = () => js(`const c = ${D}.datos.contenedores[0]; return JSON.stringify((c.lienzos || []).find(l => l.nombre === ${JSON.stringify(LIENZO)}) || null);`).then(JSON.parse);
  const itemsTema = () => Menu.getApplicationMenu().items.find(i => i.label === 'Ver').submenu.items.find(i => i.label === 'Tema').submenu.items;
  /* un hueco del fondo del lienzo (sin nodos alrededor), buscando de derecha a izquierda y de arriba abajo */
  const hueco = () => js(`const b = document.getElementById('lzCuerpo').getBoundingClientRect(), nodos = [...document.querySelectorAll('#lzNodos .lz-nodo')].map(n => n.getBoundingClientRect());
    for (let x = b.right - 190; x > b.left + 60; x -= 40) for (let y = b.top + 60; y < b.bottom - 260; y += 40) {
      if (nodos.some(r => x > r.left - 330 && x < r.right + 30 && y > r.top - 300 && y < r.bottom + 40)) continue;
      return JSON.stringify({ x, y }); }
    return null;`).then(x => x && JSON.parse(x));
  const encajar = () => js(`Claquedraw.lienzoUI.encajar(); await W(450); return true;`);

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1440, height: 920 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · el lienzo de punta a punta con Claude en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Amor en la azotea', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const RUTA = path.join(TMP, fs.readdirSync(TMP).find(f => /\.clapcraft$/.test(f)) || 'x.clapcraft');
    comprobar('a) el proyecto nace con su archivo', fs.existsSync(RUTA), fs.readdirSync(TMP).join());

    /* ---------- a) el esquema y su guion (Claude, en vivo), las bibliotecas y el personaje ---------- */
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [
      { op: 'renombrar_esquema', esquema: 'Esquema', nombre: 'Piloto' },
      { op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Referencias' },
      { op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Fragmentos' },
      { op: 'crear_personaje', nombre: 'Mara Solís', color: 5 }] });
    comprobar('a) Claude crea las bibliotecas y el personaje, y renombra el esquema', !r.error, r.texto);
    r = await M.llamar('editar_esquema', { esquema: 'Piloto', operaciones: [
      { op: 'crear_nodo', trama: 'Trama', columna: 2, titulo: 'El video', descripcion: 'Mara graba en la azotea.' },
      { op: 'crear_nodo', trama: 'Trama', columna: 4, titulo: 'La confesión', descripcion: 'Cuenta lo de su hermana.' }] });
    comprobar('a) y los nodos del esquema', !r.error, r.texto);
    r = await M.llamar('escribir_documento', { esquema: 'Piloto', contenido: GUION_BASE });
    comprobar('a) y su guion', !r.error, r.texto);
    await espera(400);
    /* la nota con texto e imagen, el segmento y la hoja del personaje: por el modelo, como si Leo los hubiera escrito */
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], img = ${IMG_JS};
      const sub = n => c.subs.find(x => x.nombre === n);
      const s = sub('Referencias'), e = d.crearEtiqueta(s.id, 'Locaciones', 6).etiqueta;
      const n = d.crearNota(s.id, e.id, 'La azotea de Mara').nota;
      n.html = '<p>Una azotea en la colonia Roma al atardecer: tinacos, antenas y un sillón viejo. Mara graba aquí porque nadie la interrumpe.</p><p><img src="' + img + '" alt="La azotea"></p>';
      const n2 = d.crearNota(s.id, e.id, 'La escalera de servicio').nota; n2.html = '<p>Escalera de caracol oxidada que baja a la calle.</p>';
      const p = d.elenco().find(x => x.nombre === 'Mara Solís');
      const bp = d.bibliotecaPersonaje(p.id, p.nombre), hoja = d.etiquetasDe(bp.id)[0];
      const h = d.crearNota(bp.id, hoja.id, 'Mara').nota; h.html = '<p>Veintiséis años. Influencer de bailes que nunca habla de su familia. Ríe cuando tiene miedo.</p>';
      Claquedraw.biblioteca.marcar(Claquedraw.app.abiertoId()); Claquedraw.gestor.render(); await W(100);
      const eq = c.esquemas.find(x => x.nombre === 'Piloto');
      return JSON.stringify({ cid: c.id, eid: eq.id, ref: s.id, etq: e.id, nota: n.id, frag: sub('Fragmentos').id, per: p.id, hojaSub: bp.id, hoja: hoja.nombre });`));
    comprobar('a) la nota con su imagen, el segmento y la hoja del personaje', ids.nota && ids.etq && ids.per && ids.hoja === 'Hoja de personaje', JSON.stringify(ids));

    /* ---------- b) el lienzo, desde el ⋯ del contenedor ---------- */
    await aClic(`document.querySelector('#gdSide .gd-cont [data-gd-menu="contenedor"]')`, { tras: 300 });
    await aClic(opcionPop('Nuevo lienzo'), { tras: 400 });
    comprobar('b) «Nuevo lienzo…» del ⋯ del contenedor pide el nombre', await js(`const d = document.getElementById('dlgNombre'); return d.open;`));
    win.webContents.insertText(LIENZO); await espera(150); await tecla('Enter', [], 900);
    let L = await datosL();
    comprobar('b) crea el lienzo y lo abre', !!L && await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${L && L.id}';`, 3000), JSON.stringify(L));
    const lid = L.id;
    /* el esquema desde el árbol */
    let lz = await centro(`document.getElementById('lzCuerpo')`);
    await arrastrar(await centro(filaArbol('esquema', 'Piloto')), { x: lz.l + 160, y: lz.t + 120 });
    L = await datosL();
    const nEsq = (L.nodos.find(n => n.tipo === 'esquema' && n.datos.eid === ids.eid) || {}).id;
    comprobar('b) arrastrar el esquema desde el árbol lo pone en el lienzo', !!nEsq, JSON.stringify(L.nodos));
    comprobar('b) su vista previa: la miniatura y el guion', !!nEsq && await js(`const el = ${nodoEl(nEsq)}; return !!el && !!el.querySelector('svg.lz-mini-esq') && /Guion/.test((el.querySelector('.lz-guion') || {}).textContent || '');`));
    /* el personaje, desde el árbol de Personajes (el pie solo cambia el árbol) */
    await aClic(`document.querySelector('#gdSide [data-gd-ir-personajes]')`, { tras: 500 });
    await arrastrar(await centro(`document.querySelector('#gdSide .gd-per[data-personaje="${ids.per}"]')`), { x: lz.l + 160, y: lz.t + 470 });
    await aClic(`document.querySelector('#gdSide [data-gd-ir-contenedores]')`, { tras: 500 });
    L = await datosL();
    const nPer = (L.nodos.find(n => n.tipo === 'personaje' && n.datos.personajeId === ids.per) || {}).id;
    comprobar('b) y el personaje, desde el árbol de Personajes', !!nPer && await js(`return Claquedraw.app.modo() === 'lienzo';`), JSON.stringify(L.nodos.map(n => n.tipo)));
    comprobar('b) el personaje enseña su chip y su hoja', !!nPer && await js(`const el = ${nodoEl(nPer)}; return !!el && el.querySelector('.per-chip').textContent === 'MS' && /Hoja|hoja/.test(el.textContent);`), await js(`const el = ${nodoEl(nPer)}; return el ? el.textContent : 'sin nodo';`));
    /* «Añadir al lienzo…» de la nota y del segmento, desde la biblioteca */
    await aClic(filaArbol('sub', 'Referencias'), { tras: 700 });
    await hasta(`return document.body.classList.contains('vista-documentos');`, 3000);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.nota}"] [data-gd-menu="nota"]')`, { tras: 300 });
    await aClic(opcionPop('Añadir al lienzo'), { tras: 300 });
    await aClic(opcionPop(LIENZO), { tras: 500 });
    await aClic(`document.querySelector('#gdMain .gd-etq[data-etq="${ids.etq}"] [data-gd-menu="etiqueta"]')`, { tras: 300 });
    await aClic(opcionPop('Añadir al lienzo'), { tras: 300 });
    await aClic(opcionPop(LIENZO), { tras: 500 });
    L = await datosL();
    const nNota = (L.nodos.find(n => n.tipo === 'nota' && n.datos.notaId === ids.nota) || {}).id;
    const nSeg = (L.nodos.find(n => n.tipo === 'segmento' && n.datos.subId === ids.ref && n.datos.etiquetaId === ids.etq) || {}).id;
    comprobar('b) «Añadir al lienzo…» de la nota y del segmento', !!nNota && !!nSeg, JSON.stringify(L.nodos.map(n => [n.tipo, n.datos])));
    await aClic(accionAviso('Abrir'), { tras: 700 });
    comprobar('b) «Abrir» del aviso vuelve al lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${lid}';`, 3000));
    comprobar('b) la nota enseña su extracto y la miniatura de su imagen; el segmento, sus dos notas', await js(`const a = ${nodoEl(nNota)}, b = ${nodoEl(nSeg)};
      return !!a && a.querySelectorAll('.lz-minis img').length === 1 && /azotea/i.test(a.textContent) && !!b && /2 notas/.test(b.textContent);`),
      await js(`return (${nodoEl(nNota)} || {}).textContent + ' || ' + (${nodoEl(nSeg)} || {}).textContent;`));

    /* ---------- c) las dos operaciones con el menú del lienzo ---------- */
    await encajar();
    let h = await hueco();
    if (!h) { await js(`const v = Claquedraw.lienzoUI.vista(); Claquedraw.lienzoUI.vista({ x: v.x - 300, y: v.y, zoom: Math.min(v.zoom, 0.8) }); await W(300); return true;`); h = await hueco(); }
    await dobleClic(h);
    comprobar('c) doble clic en el fondo abre «Añadir nodo»', await js(`return !!document.querySelector('.gd-pop.lz-menu');`));
    await aClic(`[...document.querySelectorAll('.gd-pop.lz-menu button')].find(b => /Generar guion/.test(b.textContent))`, { tras: 400 });
    L = await datosL();
    const nGen = (L.nodos.find(n => n.tipo === 'generar') || {}).id;
    comprobar('c) nace «Generar guion»', !!nGen);
    await escribir('La primera escena del piloto, agridulce, con la azotea como refugio');
    await espera(600);
    await clic({ x: h.x, y: h.y + 400 > lz.t + lz.h - 20 ? lz.t + lz.h - 20 : h.y + 400 });   // fuera: suelta el foco
    await clic({ x: lz.l + 20, y: lz.t + lz.h - 20 });
    /* su destino: un esquema nuevo (el control de la página: un <select> nativo no se abre con el ratón simulado) */
    await js(`const s = ${nodoEl(nGen)}.querySelector('[data-lz-destino]'); s.value = 'nuevo'; s.dispatchEvent(new Event('change', { bubbles: true })); await W(250); return true;`);
    await aClic(`${nodoEl(nGen)}.querySelector('[data-lz-nuevo-nombre]')`, { tras: 150 });
    await escribir('Piloto (Claude)'); await espera(600);
    await clic({ x: lz.l + 20, y: lz.t + lz.h - 20 });
    L = await datosL();
    let g = L.nodos.find(n => n.id === nGen);
    comprobar('c) su instrucción y su destino (un esquema nuevo) se guardan', /agridulce/.test(g.datos.instruccion) && g.datos.destino && g.datos.destino.nuevo && g.datos.destino.nuevo.nombre === 'Piloto (Claude)' && g.datos.destino.nuevo.cid === ids.cid, JSON.stringify(g.datos));
    /* partir */
    h = await hueco();
    if (!h) { await js(`const v = Claquedraw.lienzoUI.vista(); Claquedraw.lienzoUI.vista({ x: v.x - 360, y: v.y, zoom: v.zoom }); await W(300); return true;`); h = await hueco(); }
    await dobleClic(h);
    await aClic(`[...document.querySelectorAll('.gd-pop.lz-menu button')].find(b => /Partir en fragmentos/.test(b.textContent))`, { tras: 400 });
    L = await datosL();
    const nPar = (L.nodos.find(n => n.tipo === 'partir') || {}).id;
    comprobar('c) nace «Partir en fragmentos», de 15 s como mucho', !!nPar && L.nodos.find(n => n.id === nPar).datos.segundos_max === 15, JSON.stringify(L.nodos.find(n => n.id === nPar)));
    await clic({ x: lz.l + 20, y: lz.t + lz.h - 20 });
    await js(`const s = ${nodoEl(nPar)}.querySelector('[data-lz-destino]'); s.value = 'b:${ids.frag}'; s.dispatchEvent(new Event('change', { bubbles: true })); await W(250); return true;`);
    comprobar('c) su destino, la biblioteca «Fragmentos»', (await datosL()).nodos.find(n => n.id === nPar).datos.destino.subId === ids.frag);
    /* los cables, con el ratón */
    await encajar();
    const conectar = async (de, a, puerto) => {
      const s = `${nodoEl(de)}.querySelector('[data-lz-out] .lz-dot')`, e = `${nodoEl(a)}.querySelector('[data-lz-in="${puerto}"] .lz-dot')`;
      const p1 = await centro(s, true), p2 = await centro(e, true);
      if (!p1 || !p2) return 'sin puerto';
      if (!(await libre(s, p1))) return 'la salida de ' + de + ' está tapada';
      await arrastrar(p1, p2);
      return (await datosL()).cables.some(c => c.de === de && c.a === a && c.puerto === puerto) ? true : 'no conectó';
    };
    const cab = [await conectar(nNota, nGen, 'contexto'), await conectar(nSeg, nGen, 'contexto'), await conectar(nPer, nGen, 'contexto'), await conectar(nEsq, nGen, 'esquema'), await conectar(nGen, nPar, 'guion')];
    comprobar('c) cinco cables con el ratón (nota, segmento y personaje al contexto; el esquema a «Esquema»; generar a «Guion»)', cab.every(x => x === true), JSON.stringify(cab));
    comprobar('c) y se dibujan', await js(`return document.querySelectorAll('.lz-cable-g').length === 5;`), await js(`return document.querySelectorAll('.lz-cable-g').length;`));
    await encajar();
    if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); fs.writeFileSync(path.join(CAPTURAS, 'lienzo-e2e-armado.png'), (await win.webContents.capturePage()).toPNG()); }

    /* ---------- d) ▶ «Pedir a Claude» ---------- */
    portapapeles = '';
    await aClic(`${nodoEl(nPar)}.querySelector('[data-lz-pedir]')`, { tras: 500 });
    L = await datosL();
    comprobar('d) ▶ en «Partir» deja pendientes las dos operaciones', ['generar', 'partir'].every(t => L.nodos.find(n => n.tipo === t).estado === 'pendiente'), JSON.stringify(L.nodos.map(n => n.tipo + ':' + (n.estado || ''))));
    const enlaceNodo = id => new RegExp('clapcraft://[^/\\s)]+/lienzo/' + lid + '/nodo/' + id + '\\b');
    comprobar('d) el encargo va al portapapeles (de mentira) con los enlaces de los dos nodos, en orden', enlaceNodo(nGen).test(portapapeles) && enlaceNodo(nPar).test(portapapeles)
      && portapapeles.search(enlaceNodo(nGen)) < portapapeles.search(enlaceNodo(nPar)), portapapeles);
    comprobar('d) el aviso dice que se pegue en Claude', /Pégalo en Claude/.test(await avisoTxt()), await avisoTxt());
    comprobar('d) los nodos se ven pendientes', await js(`return [${JSON.stringify(nGen)}, ${JSON.stringify(nPar)}].every(id => !!document.querySelector('#lzNodos [data-lz-nodo="' + id + '"] .lz-estado.pendiente'));`));
    const encargo = portapapeles;

    /* ---------- e) Claude ejecuta «Generar guion» ---------- */
    r = await M.llamar('leer_lienzo', { lienzo: (encargo.match(/clapcraft:\/\/[^\s)]+\/lienzo\/[^\s/)]+/) || [lid])[0] });
    const lin = (r.texto.split('\n').find(x => /^PENDIENTES/.test(x)) || '');
    comprobar('e) leer_lienzo (por el enlace del encargo): las pendientes en orden, generar antes que partir', !r.error && lin.indexOf(nGen) >= 0 && lin.indexOf(nGen) < lin.indexOf(nPar), r.texto.slice(0, 1500));
    comprobar('e) y lo que apunta cada entrada', /La azotea de Mara/.test(r.texto) && /Mara Solís/.test(r.texto) && /Piloto/.test(r.texto) && /Locaciones/.test(r.texto), r.texto.slice(0, 1500));
    r = await M.llamar('ejecutar_nodo', { lienzo: lid, nodo: nPar });
    comprobar('e) ejecutar_nodo de partir antes de tiempo dice que falta generar', !r.error && /ANTES:/.test(r.texto), r.texto.slice(0, 600));
    const antesEj = await js(`return JSON.stringify(${D}.datos);`);
    r = await M.llamar('ejecutar_nodo', { lienzo: (encargo.match(enlaceNodo(nGen)) || [])[0] });
    const imgs = r.contenido.filter(c => c.type === 'image');
    comprobar('e) ejecutar_nodo de generar (por el enlace de su nodo): el encargo entero', !r.error && /ENCARGO · GENERAR GUION/.test(r.texto) && /agridulce/.test(r.texto), r.texto.slice(0, 1200));
    comprobar('e) con la nota, el segmento, la hoja del personaje y la estructura y el guion del esquema', /Una azotea en la colonia Roma/.test(r.texto) && /Escalera de caracol/.test(r.texto) && /HOJA DE PERSONAJE/.test(r.texto) && /Ríe cuando tiene miedo/.test(r.texto)
      && /ESTRUCTURA/.test(r.texto) && /La confesión/.test(r.texto) && /GUION/.test(r.texto) && /nunca le he contado/.test(r.texto), r.texto.slice(0, 3000));
    const png = imgs[0] ? Buffer.from(imgs[0].data, 'base64') : null;
    /* la nota entra dos veces (sola y dentro de su segmento), así que su imagen puede ir dos veces: basta con que vaya y sea la suya */
    comprobar('e) la imagen de la nota llega como contenido de imagen de MCP (un PNG de verdad, 160 × 100)', imgs.length >= 1 && imgs.every(i => i.data === imgs[0].data) && imgs[0].mimeType === 'image/png' && !!png && png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 160 && png.readUInt32BE(20) === 100 && /IMAGEN 1 \(nota «La azotea de Mara»/.test(r.texto),
      JSON.stringify(r.contenido.map(c => c.type === 'image' ? { type: c.type, mimeType: c.mimeType, bytes: c.data.length } : { type: c.type })));
    comprobar('e) y dice cómo escribir la salida (crear el esquema, escribir_documento, completar_nodo)', /crear_esquema/.test(r.texto) && /escribir_documento/.test(r.texto) && /completar_nodo/.test(r.texto), r.texto.slice(-1500));
    comprobar('e) ejecutar_nodo no escribe nada', await js(`return JSON.stringify(${D}.datos);`) === antesEj);
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_esquema', contenedor: ids.cid, nombre: 'Piloto (Claude)' }] });
    comprobar('e) Claude crea el esquema destino', !r.error, r.texto);
    r = await M.llamar('escribir_documento', { esquema: 'Piloto (Claude)', contenido: GUION_NUEVO, como: 'guion' });
    comprobar('e) y escribe el guion en él', !r.error, r.texto);
    const eidNuevo = await js(`return ${D}.datos.contenedores[0].esquemas.find(e => e.nombre === 'Piloto (Claude)').id;`);
    r = await M.llamar('completar_nodo', { lienzo: lid, nodo: nGen, salida: { tipo: 'documento', esquema: eidNuevo }, mensaje: 'Escribí la azotea y la bajada a la calle.' });
    comprobar('e) completar_nodo: hecho, y dice que queda partir', !r.error && /HECHO/.test(r.texto) && new RegExp('Quedan pendientes: ' + nPar).test(r.texto), r.texto);
    comprobar('e) en la app, «Hecho» con la ficha del guion y el mensaje', await hasta(`const el = ${nodoEl(nGen)}; return !!el && !!el.querySelector('.lz-estado.hecho') && /Guion de «Piloto \\(Claude\\)»/.test((el.querySelector('.lz-sal[data-lz-abrir]') || {}).textContent || '') && /la bajada a la calle/.test(el.textContent);`, 4000),
      await js(`const el = ${nodoEl(nGen)}; return el ? el.querySelector('.lz-npie').innerHTML : 'sin nodo';`));
    comprobar('e) y el aviso de Claude', /Claude/.test(await avisoTxt()), await avisoTxt());
    await aClic(`${nodoEl(nGen)}.querySelector('.lz-sal[data-lz-abrir]')`, { tras: 900 });
    comprobar('e) la ficha lleva al documento del esquema nuevo', await hasta(`return Claquedraw.app.modo() === 'texto' && /Hace un año dejé de hablar con mi hermana/.test(document.getElementById('editorMarco').contentDocument.getElementById('editor').textContent);`, 4000),
      await js(`return Claquedraw.app.modo();`));
    await aClic(filaArbol('lienzo', LIENZO), { tras: 800 });
    comprobar('e) y el árbol vuelve al lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${lid}';`, 3000));

    /* ---------- f) «Partir en fragmentos» ---------- */
    r = await M.llamar('ejecutar_nodo', { lienzo: lid, nodo: nPar });
    comprobar('f) ejecutar_nodo de partir: el guion que dio generar y los pasos (preparar_fragmentos)', !r.error && /ENCARGO · PARTIR/.test(r.texto) && /Hace un año dejé de hablar/.test(r.texto) && new RegExp('preparar_fragmentos \\{ esquema: "' + eidNuevo + '"').test(r.texto) && !/ANTES:/.test(r.texto), r.texto.slice(0, 2500));
    r = await M.llamar('preparar_fragmentos', { esquema: eidNuevo, segundos_max: 15, formato: 'json' });
    let prop = null; try { prop = JSON.parse(r.texto); } catch (_) {}
    const frags = prop ? prop.fragmentos : [];
    comprobar('f) preparar_fragmentos propone tramos de 15 s como mucho', frags.length >= 2 && frags.every(f => f.segundos > 0 && f.segundos <= 15), r.texto.slice(0, 900));
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'conectar', esquema: eidNuevo, biblioteca: ids.frag }] });
    comprobar('f) Claude conecta el esquema con «Fragmentos»', !r.error, r.texto);
    const ops = [{ op: 'crear_segmento', ref: 's', nombre: 'Piloto', color: 2 }];
    frags.forEach(f => ops.push({ op: 'crear_nota', titulo: 'Fragmento ' + String(f.orden).padStart(2, '0'), segmento: '$s',
      contenido: '```prompt Plano ' + f.orden + '\nAzotea de la colonia Roma al atardecer, luz naranja, cámara en mano.\n```',
      fragmento: { esquema: eidNuevo, nodos: f.nodos, segundos: f.segundos, orden: f.orden, bloques: f.bloques } }));
    r = await M.llamar('editar_biblioteca', { biblioteca: ids.frag, operaciones: ops });
    comprobar('f) y escribe una nota-fragmento por tramo', !r.error, r.texto);
    r = await M.llamar('completar_nodo', { lienzo: lid, nodo: nPar, salida: { tipo: 'fragmentos', biblioteca: ids.frag, esquema: eidNuevo } });
    comprobar('f) completar_nodo de partir: hecho, sin pendientes', !r.error && /HECHO/.test(r.texto) && /No quedan pendientes/.test(r.texto), r.texto);
    L = await datosL();
    const pa = L.nodos.find(n => n.id === nPar);
    comprobar('f) su salida: los fragmentos, su biblioteca y su esquema', pa.estado === 'hecho' && pa.salida.tipo === 'fragmentos' && pa.salida.subId === ids.frag && pa.salida.eid === eidNuevo && pa.salida.notas.length === frags.length, JSON.stringify(pa.salida));
    comprobar('f) el nodo enseña los fragmentos', await hasta(`const el = ${nodoEl(nPar)}; return !!el.querySelector('.lz-estado.hecho') && new RegExp('${frags.length} fragmentos en «Fragmentos»').test(el.textContent) && /Fragmento 01/.test(el.textContent);`, 4000),
      await js(`return ${nodoEl(nPar)}.querySelector('.lz-npie').textContent;`));
    r = await M.llamar('leer_lienzo', { lienzo: lid });
    comprobar('f) leer_lienzo: sin pendientes y con las dos salidas', !r.error && /Sin operaciones pendientes/.test(r.texto) && /Piloto \(Claude\)/.test(r.texto) && /fragmento/i.test(r.texto), r.texto.slice(0, 1500));
    await encajar();
    if (CAPTURAS) fs.writeFileSync(path.join(CAPTURAS, 'lienzo-e2e-hecho.png'), (await win.webContents.capturePage()).toPNG());

    /* ---------- g) cambiar la instrucción de generar: desactualizados ---------- */
    await aClic(`${nodoEl(nGen)}.querySelector('.lz-instr')`, { tras: 150 });
    await tecla('End'); await escribir(' y un final abierto'); await espera(700);
    await clic({ x: lz.l + 20, y: lz.t + lz.h - 20 });
    comprobar('g) «Generar» se ve desactualizado (cambió su instrucción)', await hasta(`const e = ${nodoEl(nGen)}.querySelector('.lz-estado.viejo'); return !!e && /instrucción/.test(e.title);`, 2000),
      await js(`return ${nodoEl(nGen)}.querySelector('.lz-npie').innerHTML.slice(0, 400);`));
    comprobar('g) y «Partir», desactualizado por la cadena', await js(`const e = ${nodoEl(nPar)}.querySelector('.lz-estado.viejo'); return !!e && /operación anterior/.test(e.title);`)
      && await js(`const d = ${D}, m = d.modeloLienzo('${lid}'); return m.desactualizado('${nGen}', d.firma ? d.firma() : undefined) === 'instruccion' && m.desactualizado('${nPar}', d.firma ? d.firma() : undefined) === 'cadena';`),
      await js(`const d = ${D}, m = d.modeloLienzo('${lid}'); return JSON.stringify([m.desactualizado('${nGen}'), m.desactualizado('${nPar}')]);`));
    r = await M.llamar('leer_lienzo', { lienzo: lid });
    comprobar('g) leer_lienzo lo dice', !r.error && /DESACTUALIZADAS/.test(r.texto) && (r.texto.split('\n').find(x => /^DESACTUALIZADAS/.test(x)) || '').includes(nPar), r.texto.slice(0, 800));

    /* ---------- h) revertir desde el historial de Claude ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    await aClic(filaArbol('lienzo', LIENZO), { tras: 800 });
    menu('Claude', 'Historial de cambios…').click();
    await hasta(`return !!document.querySelector('.hc-capa .hc-entrada');`);
    const hid = await js(`const h = (${D}.datos.historialClaude || []).slice().reverse(); const e = h.find(x => x.herramienta === 'completar_nodo' && !x.revertido); return e ? e.id : null;`);
    comprobar('h) el historial lista el último completar_nodo', !!hid && await js(`return !!document.querySelector('.hc-entrada[data-hc="${hid}"]');`));
    await aClic(`document.querySelector('.hc-entrada[data-hc="${hid}"] [data-hc-revertir]')`, { tras: 700 });
    const choque = await js(`const d = document.getElementById('dlg'); return d && d.open ? d.textContent : null;`);
    if (choque) await js(`document.getElementById('dlgOk').click(); await W(500); return true;`);
    L = await datosL();
    comprobar('h) revertirlo devuelve «Partir» a pendiente, sin choques (lo de Leo era otro nodo)', !choque && L.nodos.find(n => n.id === nPar).estado === 'pendiente' && !L.nodos.find(n => n.id === nPar).salida, (choque || '') + JSON.stringify(L.nodos.find(n => n.id === nPar)));
    comprobar('h) la instrucción que cambió Leo se queda', /final abierto/.test(L.nodos.find(n => n.id === nGen).datos.instruccion));
    await hasta(`return !!${accionAviso('Deshacer')};`, 2000);
    await aClic(accionAviso('Deshacer'), { tras: 600 });
    L = await datosL();
    comprobar('h) «Deshacer» de lo revertido lo devuelve hecho, con sus fragmentos', L.nodos.find(n => n.id === nPar).estado === 'hecho' && L.nodos.find(n => n.id === nPar).salida.notas.length === frags.length, JSON.stringify(L.nodos.find(n => n.id === nPar)));
    await js(`const b = document.querySelector('[data-hc-cerrar]'); if (b) b.click(); await W(300); return true;`);
    comprobar('h) el lienzo de delante lo enseña', await hasta(`const el = ${nodoEl(nPar)}; return !!el && /fragmentos en «Fragmentos»/.test(el.textContent);`, 3000));

    /* ---------- i) el archivo, cerrar y volver a abrir, recargar ---------- */
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 8000);
    await espera(700);
    const fl = ((leerArchivo(RUTA).documentos.contenedores[0] || {}).lienzos || []).find(x => x.id === lid);
    const antes = await datosL();
    const resumen = l => JSON.stringify({ nodos: l.nodos.map(n => [n.id, n.tipo, n.estado || null, n.salida || null, n.datos]), cables: l.cables });
    comprobar('i) el archivo guarda el lienzo: nodos, cables, estados y salidas', !!fl && resumen(fl) === resumen(antes), fl ? resumen(fl).slice(0, 600) : 'sin lienzo en el archivo');
    comprobar('i) la vista del lienzo (desplazamiento y zoom) no viaja en el archivo', !!fl && fl.vista === undefined, fl && JSON.stringify(fl.vista));
    await js(`await Claquedraw.app.cerrar(); await W(700); return true;`);
    await js(`await Claquedraw.app.abrirReciente(${JSON.stringify(RUTA)}); await W(1200); return true;`);
    await hasta(`return !!Claquedraw.app.abiertoId() && !!${D} && !!${D}.lienzo('${lid}');`, 6000);
    comprobar('i) vuelto a abrir, el lienzo sigue igual', resumen(await datosL()) === resumen(antes));
    await aClic(filaArbol('lienzo', LIENZO), { tras: 900 });
    comprobar('i) y se ve: cinco cables, generar desactualizado con su ficha, partir con sus fragmentos', await hasta(`const g = ${nodoEl(nGen)}, p = ${nodoEl(nPar)};
      return Claquedraw.app.modo() === 'lienzo' && document.querySelectorAll('.lz-cable-g').length === 5 && !!g && !!g.querySelector('.lz-estado.viejo') && /Piloto \\(Claude\\)/.test(g.textContent)
        && !!p && /fragmentos en «Fragmentos»/.test(p.textContent);`, 4000));
    comprobar('i) las entradas no se rompieron (nota con su miniatura, personaje, esquema, segmento)', await js(`return ![${[nNota, nSeg, nPer, nEsq].map(x => JSON.stringify(x)).join()}].some(id => { const el = document.querySelector('#lzNodos [data-lz-nodo="' + id + '"]'); return !el || el.classList.contains('roto'); }) && ${nodoEl(nNota)}.querySelectorAll('.lz-minis img').length === 1;`));
    await js(`Claquedraw.app.guardar && await Claquedraw.app.guardar(); return true;`);
    await espera(400);
    win.webContents.reload();
    await new Promise(r2 => win.webContents.once('did-finish-load', r2));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.modo);`);
    comprobar('i) al recargar vuelve la pestaña del lienzo', await hasta(`const t = document.querySelector('.pestana.activa'); return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${lid}' && !!t && t.dataset.tipo === 'lienzo' && document.querySelectorAll('#lzNodos .lz-nodo').length === 6;`, 6000),
      await js(`return Claquedraw.app.modo() + ' ' + (document.querySelector('.pestana.activa') || {}).outerHTML;`));

    /* ---------- j) el enlace de un nodo, y la papelera ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    portapapeles = (encargo.match(enlaceNodo(nGen)) || [''])[0];
    menu('Claude', 'Ir al enlace copiado').click(); await espera(900);
    comprobar('j) «Ir al enlace copiado» con el de un nodo abre el lienzo y lo elige', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.lienzoUI.elegidos().join() === '${nGen}';`, 3000), await avisoTxt());
    r = await M.llamar('ver_enlace', { enlace: portapapeles });
    comprobar('j) ver_enlace dice qué nodo es', !r.error && /Generar guion/.test(r.texto), r.texto.slice(0, 600));
    await aClic(`${filaArbol('lienzo', LIENZO)}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    await aClic(opcionPop('Mover a la papelera'), { tras: 800 });
    comprobar('j) a la papelera: se va del árbol y de la vista', !(await datosL()) && !(await js(`return !!${filaArbol('lienzo', LIENZO)};`)) && await js(`return Claquedraw.app.modo() !== 'lienzo';`), await js(`return Claquedraw.app.modo();`));
    await aClic(`document.querySelector('#gdSide .gd-cont.papelera[data-id="papelera"]')`, { tras: 700 });
    await hasta(`return [...document.querySelectorAll('#gdMain .gd-pieza')].some(x => x.textContent.includes(${JSON.stringify(LIENZO)}));`, 3000);
    await dobleClic(await centro(`[...document.querySelectorAll('#gdMain .gd-pieza')].find(x => x.textContent.includes(${JSON.stringify(LIENZO)}))`));
    comprobar('j) restaurado, vuelve igual (nodos, cables, estados y salidas)', !!(await datosL()) && resumen(await datosL()) === resumen(antes), JSON.stringify(await datosL()).slice(0, 400));
    await aClic(filaArbol('lienzo', LIENZO), { tras: 900 });
    comprobar('j) y se abre con sus estados', await hasta(`return Claquedraw.app.modo() === 'lienzo' && !!${nodoEl(nPar)} && /fragmentos en «Fragmentos»/.test(${nodoEl(nPar)}.textContent);`, 3000));

    /* ---------- k) los cuatro temas ---------- */
    await encajar();
    const fondos = {};
    for (const t of ['Oscuro', 'Synthwave', 'Vaporwave', 'Claro']) {
      itemsTema().find(i => i.label === t).click();
      await espera(600);
      fondos[t] = JSON.parse(await js(`const c = document.getElementById('lzCuerpo'), p = document.querySelector('.lz-cable-g .lz-cable'), n = document.querySelector('#lzNodos .lz-nodo');
        return JSON.stringify({ estilo: document.documentElement.dataset.estilo || null, fondo: getComputedStyle(c).backgroundColor + ' ' + getComputedStyle(c).backgroundImage.slice(0, 60), cable: p ? getComputedStyle(p).stroke : null, nodo: n ? getComputedStyle(n).backgroundColor : null });`));
      if (CAPTURAS) fs.writeFileSync(path.join(CAPTURAS, 'lienzo-e2e-' + t.toLowerCase() + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    comprobar('k) cada tema pinta el lienzo a su manera (fondo y nodos)', new Set(Object.values(fondos).map(f => f.fondo + '|' + f.nodo)).size === 4 && fondos.Synthwave.estilo === 'synthwave' && fondos.Vaporwave.estilo === 'vaporwave', JSON.stringify(fondos));
    comprobar('k) y los cables siguen pintados en todos', Object.values(fondos).every(f => f.cable && f.cable !== 'none'), JSON.stringify(fondos));

    /* ---------- l) sin errores ---------- */
    comprobar('l) la página no soltó ningún error', !errores.length, errores.join(' | '));
    comprobar('l) el servidor MCP no soltó errores', !/Error|error:/.test(M.errores().replace(/servidor MCP listo[^\n]*/, '')), M.errores());
  } catch (e) {
    comprobar('sin excepciones', false, e && e.stack);
  } finally {
    if (M) M.cerrar();
    const mal = resultados.filter(x => !x.ok).length;
    console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
    if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
    app.exit(mal ? 1 : 0);
  }
});
