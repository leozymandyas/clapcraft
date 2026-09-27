/* Prueba de las plantillas de nota con la app de verdad (Electron): `electron pruebas/plantillas-electron.js`.
   1.1.56, lo que vino de ClapBook: las plantillas son notas de una biblioteca especial, «Plantillas», que se abre desde su lugar
   al pie del menú (Contenedores · Personajes · Plantillas · Papelera); de ellas salen notas nuevas con sus variables rellenas.
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos y **el portapapeles del sistema
   sustituido por uno de mentira**: el de verdad es el de Leo), crea un proyecto en blanco con archivo, lo llena con el servidor MCP
   (arrancado como lo arranca Claude) y, con **el ratón y el teclado de verdad** (`webContents.sendInputEvent`, la ventana enfocada),
   comprueba:
   a) «Plantillas» en el pie del menú, entre Personajes y Papelera, con su cuenta;
   b) su tablero: el chip «Plantillas» sin contenedor, el aviso y «Nueva plantilla»; la pestaña con su icono;
   c) crear una plantilla y escribir en ella (en su ventana) texto con variables; otra en el editor con elementos de guion;
   d) «Guardar como plantilla…» desde el ⋯ de una nota y soltar una nota arrastrándola sobre «Plantillas» (una copia);
   e) «Desde plantilla» en una biblioteca: el menú, elegir, el nombre que se pide si el texto usa {{titulo}}, la nota arriba con
      las variables rellenas, en su ventana con el cursor donde decía {{cursor}};
   f) «Usar» en la tarjeta y en la ventana de una plantilla;
   g) Cmd+Alt+N con el foco en la página (con un segmento expandido: nace en él) y en el editor;
   h) «/plantilla» en el editor: se pone donde está el cursor, un solo paso en Deshacer, el cursor en la marca;
   i) las órdenes del menú de la app (Archivo › Nueva nota desde plantilla…, Insertar plantilla…, Guardar la nota como
      plantilla…; Ver › Plantillas);
   j) tirar una plantilla y restaurarla desde la papelera: vuelve a Plantillas;
   k) una plantilla con personajes no sale en las apariciones ni pone a nadie en el elenco (la nota que sale de ella, sí);
   l) el archivo guardado lleva las plantillas y, abierto en otra ventana, siguen ahí;
   m) la pestaña del tablero de plantillas y ‹ › del historial;
   n) la página no suelta ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-plantillas-'));
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
/* el portapapeles, de mentira (el de verdad es el de Leo) */
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);

const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 900)));
}
function mcp() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, errores = '';
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', d => { errores += d; });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return { error: !!r.result.isError, texto: r.result.content[0].text }; };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}
const leerArchivo = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));

/* las fechas como las pone plantillas.js */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const dd = n => String(n).padStart(2, '0');

app.whenReady().then(async () => {
  let win = null, M = null;
  const errores = [];
  const jsEn = (w, code) => w.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const js = code => jsEn(win, code);
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
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 200 : op.tras);
  }
  async function dobleClic(p, tras) { await clic(p, { tras: 180 }); await clic(p, { n: 2, tras: tras === undefined ? 300 : tras }); }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => m === 'meta' || m === 'cmd' || m === 'control' || m === 'alt')) ev({ type: 'char', keyCode: k, modifiers });
    else if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 60 : tras);
  }
  async function escribir(texto) {
    for (const ch of texto) {
      const simple = /^[a-z0-9 ]$/i.test(ch);
      const mods = /[A-Z]/.test(ch) ? ['shift'] : [];
      if (simple) ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      ev({ type: 'char', keyCode: ch, modifiers: mods });
      if (simple) ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      await espera(25);
    }
    await espera(80);
  }
  /* un arrastre con el botón apretado, en pasos */
  async function arrastrar(a, b, pasos) {
    pasos = pasos || 14;
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) {
      const x = a.x + (b.x - a.x) * i / pasos, y = a.y + (b.y - a.y) * i / pasos;
      ev({ type: 'mouseMove', x: R(x), y: R(y), modifiers: ['leftButtonDown'] }); await espera(35);
    }
    await espera(150);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(400);
  }
  /* el centro de un elemento (una expresión que lo da), traído a la vista */
  async function centro(expr, op) {
    op = op || {};
    const r = await js(`const el = ${expr}; if (!el) return null; ${op.sinTraer ? '' : "el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);"}
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: b.top + ${op.dy === undefined ? 'b.height / 2' : op.dy}, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr, op); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  /* el centro de un elemento del editor (dentro del marco), en coordenadas de la ventana */
  async function centroEnMarco(expr, op) {
    op = op || {};
    const r = await js(`const f = document.getElementById('editorMarco'), w = f.contentWindow, d = w.document, el = ${expr}; if (!el) return null;
      el.scrollIntoView({ block: 'nearest' }); await W(80);
      const m = f.getBoundingClientRect(), b = el.getBoundingClientRect();
      return JSON.stringify({ x: m.left + b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: m.top + b.top + b.height / 2 });`);
    return r ? JSON.parse(r) : null;
  }
  const CAPA = `document.querySelector('.gd-modal-capa')`;
  const CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
  const abierta = () => js(`const c = ${CAPA}; return !!c && !c.hidden && getComputedStyle(c).display !== 'none';`);
  const enVentana = () => js(`const c = ${CAPA}; return c && !c.hidden ? c.querySelector('[data-gd-lado-titulo]').value : null;`);
  const G = `Claquedraw.gestor`, D = `Claquedraw.gestor.documentos()`;
  const tarjeta = id => `document.querySelector('#gdMain .gd-nota[data-nota="${id}"] > span:first-child')`;
  const tarjetaTitulo = t => `[...document.querySelectorAll('#gdMain .gd-nota[data-nota]')].find(x => x.firstElementChild && x.firstElementChild.textContent === ${JSON.stringify(t)})`;
  const opcionPop = t => `[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  const hayPop = () => js(`return !!document.querySelector('.gd-pop');`);
  const cerrarSiAbierta = async () => { if (await abierta()) { await js(`${G}.cerrarVentana(); await W(120); return true;`); } };
  const menuApp = (menu, texto) => Menu.getApplicationMenu().items.find(i => i.label === menu).submenu.items.find(i => i.label === texto);
  const PIE = `[...document.querySelectorAll('.gd-pie > .gd-cont, [data-gd-lista="papelera"] > .gd-cont')]`;
  const filaPl = `document.querySelector('[data-gd-plantillas]')`;
  const plantillas = () => js(`return JSON.stringify(${D}.plantillas().map(n => n.titulo));`).then(JSON.parse);
  /* el texto de delante del cursor en su bloque (de la ventana o del editor) */
  const antesDelCursor = (win) => `(() => { const s = ${win || 'window'}.getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0), n = r.startContainer;
      const el = n.nodeType === 1 ? n : n.parentElement, b = el.closest('p, h1, h2, h3, li, blockquote, div[data-l]') || el; const x = r.cloneRange(); x.setStart(b, 0);
      return x.toString(); })()`;
  const ahora = new Date();
  const HOY = dd(ahora.getDate()) + '/' + dd(ahora.getMonth() + 1) + '/' + ahora.getFullYear();
  const DIA_LARGO = DIAS[ahora.getDay()] + ' ' + ahora.getDate() + ' de ' + MESES[ahora.getMonth()];
  const MANANA = (() => { const m = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1); return m.getFullYear() + '-' + dd(m.getMonth() + 1) + '-' + dd(m.getDate()); })();

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1280, height: 860 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de las plantillas de nota en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Las plantillas', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const RUTA = path.join(TMP, 'las-plantillas.clapcraft');
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas' }, { op: 'crear_personaje', nombre: 'MARA', color: 3 }] });
    comprobar('Claude crea la biblioteca «Ideas» y el personaje MARA', !r.error, r.texto);
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_segmento', ref: 'e', nombre: 'Escenas', color: 'Azul' },
      { op: 'crear_nota', segmento: '$e', titulo: 'Delta', contenido: 'uno dos tres cuatro.' },
      { op: 'crear_nota', titulo: 'Reunión base', color: 'rojo', contenido: 'Orden del día.\n\nAcuerdos.' },
      { op: 'crear_nota', titulo: 'Para arrastrar', contenido: 'Una nota que se suelta sobre Plantillas.' }] });
    comprobar('con un segmento y tres notas', !r.error, r.texto);
    await espera(400);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], s = c.subs.find(x => x.nombre === 'Ideas');
      const e = d.etiquetasDe(s.id).find(x => x.nombre === 'Escenas');
      const n = t => d.notasDe(s.id).find(x => x.titulo === t).id;
      return JSON.stringify({ sid: s.id, e: e.id, delta: n('Delta'), reunion: n('Reunión base'), arrastrar: n('Para arrastrar'), mara: d.elenco().find(p => p.nombre === 'MARA').id });`));
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    await hasta(`return document.body.classList.contains('vista-documentos') && !!${tarjeta(ids.delta)};`);
    comprobar('aún no hay biblioteca de plantillas (nace cuando hace falta)', await js(`return !${D}.bibliotecaPlantillas();`));

    /* ---------- a) «Plantillas» en el pie del menú ---------- */
    const pie = JSON.parse(await js(`return JSON.stringify(${PIE}.map(f => f.querySelector('[data-gd-nombre]').textContent));`));
    comprobar('a) el pie del menú: Contenedores · Personajes · Plantillas · Fórmulas (1.1.60) · Papelera', JSON.stringify(pie) === '["Contenedores","Personajes","Plantillas","Fórmulas","Papelera"]', JSON.stringify(pie));
    comprobar('a) sin plantillas, «Plantillas» no lleva cuenta', await js(`return !${filaPl}.querySelector('.gd-cont-num');`));

    /* ---------- b) su tablero ---------- */
    await aClic(`${filaPl}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    comprobar('b) un clic en «Plantillas» abre su tablero (y crea su biblioteca)', await hasta(`return ${G}.esPlantillas() && !!${D}.bibliotecaPlantillas() && document.body.classList.contains('vista-documentos');`, 3000));
    const cab = JSON.parse(await js(`const m = document.getElementById('gdMain'), h = m.querySelector('.esq-cab');
      return JSON.stringify({ chip: !!h && !!h.querySelector('.gd-chip--plantillas'), chipTxt: h && (h.querySelector('.gd-chip--plantillas') || {}).textContent,
        cont: h ? [...h.querySelectorAll('.esq-cont')].map(x => x.textContent.trim()).join('|') : null, aviso: !!m.querySelector('.gd-plantillas-aviso'),
        nueva: !!m.querySelector('[data-gd-nueva-plantilla]'), desde: !!m.querySelector('[data-gd-desde-plantilla]'), activo: ${filaPl}.classList.contains('activo') });`));
    comprobar('b) cabecera con el chip «Plantillas», sin contenedor', cab.chip && /Plantillas/.test(cab.chipTxt) && !/Contenedor/.test(cab.cont || ''), JSON.stringify(cab));
    comprobar('b) el aviso de cómo se usan y «Nueva plantilla» (no «Desde plantilla»)', cab.aviso && cab.nueva && !cab.desde, JSON.stringify(cab));
    comprobar('b) su fila del pie, activa', cab.activo, JSON.stringify(cab));
    const pest = JSON.parse(await js(`const p = document.querySelector('.pestana.activa'); return JSON.stringify(p ? { tipo: p.dataset.tipo, nom: p.querySelector('.pestana-nom').textContent, icono: !!p.querySelector('.pestana-tipo svg') } : null);`));
    comprobar('m) la pestaña de delante es la de las plantillas, con su icono', pest && pest.tipo === 'plantillas' && pest.nom === 'Plantillas' && pest.icono, JSON.stringify(pest));
    comprobar('las plantillas no salen en el árbol ni en «Recientes» ni entre las bibliotecas', await js(`const d = ${D};
      return !document.querySelector('.gd-arbol [data-id="plantillas"]') && !d.todasLasBibliotecas().some(b => b.sub.id === 'plantillas:biblioteca')
        && !/2 CONTENEDORES/.test(Claquedraw.plantillas.estructura(d.datos)) && !d.contenedores().sueltos.concat(d.contenedores().fijados).some(c => c.especial);`));

    /* ---------- c) una plantilla nueva, escrita en su ventana ---------- */
    await aClic(`document.querySelector('#gdMain [data-gd-nueva-plantilla]')`, { tras: 400 });
    const tNueva = JSON.parse(await js(`const t = ${CAPA} && ${CAPA}.querySelector('[data-gd-lado-titulo]'); return JSON.stringify({ tit: t && t.value, foco: document.activeElement === t, n: ${D}.plantillas().length });`));
    comprobar('c) «Nueva plantilla» la crea y la abre en su ventana con el nombre elegido', await abierta() && tNueva.foco && tNueva.n === 1, JSON.stringify(tNueva));
    await escribir('Acta {{fecha:DD/MM/YYYY}}');
    await tecla('Enter', [], 250);
    await escribir('Acta de {{titulo}} para {{proyecto}}'); await tecla('Enter', [], 120);
    await escribir('Día: {{fecha:dddd D [de] MMMM}}'); await tecla('Enter', [], 120);
    await escribir('Notas: {{cursor}}'); await tecla('Enter', [], 120);
    await escribir('Mañana es {{mañana}} y {{otra}} se queda');
    await espera(700);
    const actaId = await js(`return ${D}.plantillas().find(n => /^Acta/.test(n.titulo)).id;`);
    const actaHtml = await js(`return ${D}.nota('${actaId}').html;`);
    comprobar('c) lo escrito (título y texto con variables) llega a la plantilla', await js(`return ${D}.nota('${actaId}').titulo;`) === 'Acta {{fecha:DD/MM/YYYY}}'
      && /Acta de \{\{titulo\}\} para \{\{proyecto\}\}/.test(actaHtml) && /\{\{cursor\}\}/.test(actaHtml) && /\{\{mañana\}\}/.test(actaHtml) && (actaHtml.match(/<p>/g) || []).length === 4, actaHtml);
    comprobar('c) su tarjeta, con «Usar» en lugar de la fecha', await js(`const c = document.querySelector('#gdMain .gd-nota[data-nota="${actaId}"]'); return !!c && !!c.querySelector('[data-gd-usar]') && !c.querySelector('.gd-nota-meta');`));
    comprobar('c) y la ventana de una plantilla lleva «Usar» y la ruta «Plantillas»', await js(`const c = ${CAPA}; return !!c.querySelector('.gd-lado-usar') && !!c.querySelector('.gd-modal-ruta .gd-chip--plantillas');`));
    comprobar('a) ahora «Plantillas» cuenta 1', await hasta(`const n = ${filaPl}.querySelector('.gd-cont-num'); return !!n && n.textContent === '1';`, 2000), await js(`return ${filaPl}.textContent;`));
    await tecla('Escape', [], 250);

    /* la segunda, en el editor, con elementos de guion (y un personaje nuevo, ZOE) */
    await aClic(`document.querySelector('#gdMain [data-gd-nueva-plantilla]')`, { tras: 400 });
    await escribir('Escena');
    await tecla('Enter', [], 250);
    const escenaId = await js(`return ${D}.plantillas().find(n => n.titulo === 'Escena').id;`);
    await aClic(`${CAPA}.querySelector('[data-gd-lado-abrir]')`, { tras: 900 });
    const enEditor = await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${escenaId}' && Claquedraw.texto.enDocumento();`, 4000);
    comprobar('c) una plantilla se abre en el editor (⤢), con su cabecera «Plantillas»', enEditor && await js(`return !!document.querySelector('#migas .gd-chip--plantillas') && !document.querySelector('#migas [data-gd-miga-cont]');`),
      await js(`return document.getElementById('migas').innerHTML.slice(0, 400);`));
    const p0 = await centroEnMarco(`d.querySelector('#editor > :first-child')`, { dx: 'Math.min(b.width - 4, 60)' });
    await clic(p0, { tras: 200 });
    /* el clic cae en el hueco de la hoja (el párrafo vacío mide poco): el cursor, dentro del primer párrafo */
    await js(`const w = document.getElementById('editorMarco').contentWindow, p = w.document.querySelector('#editor > p'); w.Ed.setCaret(p, 0); return true;`);
    await tecla('1', ['control'], 200);
    await escribir('int casa - noche');
    await tecla('Enter', [], 200);
    await escribir('{{titulo}} entra.');
    await tecla('Tab', [], 250);
    await escribir('ZOE');
    await tecla('Enter', [], 250);
    await escribir('Hola, {{cursor}}.');
    await espera(1500);
    const escHtml = await js(`const w = document.getElementById('editorMarco').contentWindow; return w.Ed.document.get().html;`);
    comprobar('c) en el editor: escena, acción, personaje y diálogo con sus variables', /class="sp-scene"[^>]*>[^<]*(INT|int)/.test(escHtml) && /class="sp-action"[^>]*>\{\{titulo\}\} entra\./.test(escHtml)
      && /class="sp-character"[^>]*data-ch/.test(escHtml) && /ZOE/.test(escHtml) && /class="sp-dialogue"[^>]*>Hola, \{\{cursor\}\}\./.test(escHtml), escHtml);
    await aClic(`document.querySelector('#migas [data-gd-volver]')`, { tras: 700 });
    await hasta(`return !document.body.classList.contains('nota-abierta') && ${G}.esPlantillas();`, 3000);
    const escGuardada = JSON.parse(await js(`const n = ${D}.nota('${escenaId}'); return JSON.stringify({ html: n.html, ch: Object.keys(n.characters || {}) });`));
    comprobar('c) y se guarda en la plantilla, con ZOE en sus personajes', /sp-dialogue/.test(escGuardada.html) && /ZOE/.test(escGuardada.html) && escGuardada.ch.some(k => /zoe/i.test(k)), JSON.stringify(escGuardada));
    comprobar('k) una plantilla con un personaje nuevo no lo pone en el elenco', await js(`return !${D}.elenco().some(p => /zoe/i.test(p.nombre));`), await js(`return JSON.stringify(${D}.elenco().map(p => p.nombre));`));
    comprobar('k) ni sale en el árbol de Personajes', await js(`${G}.render(); await W(100); return ![...document.querySelectorAll('.gd-per')].some(x => /ZOE/i.test(x.textContent));`));

    /* una tercera, con MARA (un personaje que ya existe), escrita por Claude en el guion */
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [{ op: 'crear_nota', ref: 'm', titulo: 'Con Mara' }] });
    const maraPl = await js(`return (${D}.plantillas().find(n => n.titulo === 'Con Mara') || {}).id;`);
    const r2 = await M.llamar('escribir_documento', { nota: maraPl, como: 'guion', modo: 'reemplazar', contenido: 'MARA\nHola, {{titulo}}.' });
    comprobar('k) Claude crea una plantilla y le escribe a MARA', !r.error && !r2.error && !!maraPl, r.texto + ' / ' + r2.texto);
    await espera(300);
    comprobar('k) la plantilla con MARA no sale en sus apariciones', await js(`const d = ${D}; return /MARA/.test(d.nota('${maraPl}').html) && !d.menciones('${ids.mara}').some(x => x.id === '${maraPl}');`),
      await js(`return JSON.stringify(${D}.menciones('${ids.mara}'));`));

    /* ---------- d) «Guardar como plantilla…» y soltar una nota sobre «Plantillas» ---------- */
    await aClic(`[...document.querySelectorAll('.gd-sub[data-sub]')].find(x => x.dataset.sub.endsWith('/${ids.sid}'))`, { tras: 600 });
    await hasta(`return !!${tarjeta(ids.reunion)};`, 3000);
    const antesD = (await plantillas()).length;
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.reunion}"] .gd-nota-acc')`, { tras: 250 });
    comprobar('d) el ⋯ de una nota ofrece «Guardar como plantilla…»', !!(await js(`return !!${opcionPop('Guardar como plantilla')};`)));
    await aClic(opcionPop('Guardar como plantilla'), { tras: 250 });
    comprobar('d) que pregunta dónde: la bandeja de las plantillas', await js(`const p = document.querySelector('.gd-pop'); return !!p && /como plantilla en/.test(p.textContent) && !!${opcionPop('Bandeja')};`));
    await aClic(opcionPop('Bandeja'), { tras: 500 });
    const copia = JSON.parse(await js(`const d = ${D}, o = d.nota('${ids.reunion}'), c = d.plantillas().find(n => n.titulo === 'Reunión base');
      return JSON.stringify({ c: !!c, html: c && c.html === o.html, color: c && c.color, orig: o.subId === '${ids.sid}', n: d.plantillas().length });`));
    comprobar('d) la guarda como plantilla: una copia con su texto y su color, y la nota se queda', copia.c && copia.html && copia.color === 'rojo' && copia.orig && copia.n === antesD + 1, JSON.stringify(copia));
    comprobar('d) con su aviso', await js(`const a = document.getElementById('aviso'); return a.classList.contains('show') && /plantilla/i.test(a.textContent);`), await js(`return document.getElementById('aviso').textContent;`));
    const desde = await centro(tarjeta(ids.arrastrar)), hacia = await centro(`${filaPl}.querySelector('[data-gd-nombre]')`);
    await arrastrar(desde, hacia);
    const soltada = JSON.parse(await js(`const d = ${D}; return JSON.stringify({ c: d.plantillas().some(n => n.titulo === 'Para arrastrar'), orig: d.nota('${ids.arrastrar}').subId === '${ids.sid}', tarjeta: !!document.querySelector('#gdMain .gd-nota[data-nota="${ids.arrastrar}"]'), n: d.plantillas().length });`));
    comprobar('d) soltar una nota sobre «Plantillas» guarda una copia (y la nota vuelve a su sitio)', soltada.c && soltada.orig && soltada.tarjeta && soltada.n === antesD + 2, JSON.stringify(soltada));
    comprobar('a) la cuenta del pie sube con ellas', await hasta(`const n = ${filaPl}.querySelector('.gd-cont-num'); return !!n && n.textContent === String(${D}.plantillas().length);`, 2000));

    /* ---------- e) «Desde plantilla» en una biblioteca ---------- */
    await aClic(`document.querySelector('#gdMain [data-gd-desde-plantilla]')`, { tras: 300 });
    const lista = JSON.parse(await js(`const p = document.querySelector('.gd-pop'); return JSON.stringify(p ? { tit: (p.querySelector('.gd-pop-tit') || {}).textContent, ops: [...p.querySelectorAll('.gd-pop-lista button')].map(b => b.dataset.plTitulo), admin: /Administrar plantillas/.test(p.textContent) } : null);`));
    comprobar('e) «Desde plantilla» abre la lista de plantillas y «Administrar plantillas…»', lista && lista.ops.length === (await plantillas()).length && lista.ops.includes('Acta {{fecha:DD/MM/YYYY}}') && lista.admin, JSON.stringify(lista));
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo.startsWith('Acta'))`, { tras: 600 });
    const acta = JSON.parse(await js(`const d = ${D}, n = d.notasDe('${ids.sid}', null)[0]; return JSON.stringify({ id: n.id, tit: n.titulo, html: n.html, sub: n.subId, pl: d.esPlantilla(n) });`));
    comprobar('e) la nota nace arriba de la bandeja de la biblioteca, con el título relleno', acta.tit === 'Acta ' + HOY && acta.sub === ids.sid && !acta.pl, JSON.stringify(acta));
    comprobar('e) con las variables rellenas ({{titulo}}, {{proyecto}}, {{fecha:…}}, {{mañana}}; la desconocida, tal cual; {{cursor}} fuera)',
      acta.html.includes('Acta de Acta ' + HOY + ' para Las plantillas') && acta.html.includes('Día: ' + DIA_LARGO) && acta.html.includes('Mañana es ' + MANANA) && acta.html.includes('{{otra}}') && !/\{\{(titulo|proyecto|fecha|cursor|mañana)/.test(acta.html), acta.html);
    const curActa = JSON.parse(await js(`return JSON.stringify({ abierta: !!${CAPA} && !${CAPA}.hidden, tit: ${CAPA}.querySelector('[data-gd-lado-titulo]').value, foco: ${CAMPO}.contains(document.activeElement) || document.activeElement === ${CAMPO}, antes: ${antesDelCursor()} });`));
    comprobar('e) y se abre en su ventana con el cursor donde decía {{cursor}}', curActa.abierta && curActa.tit === acta.tit && curActa.foco && curActa.antes && curActa.antes.trim() === 'Notas:', JSON.stringify(curActa));
    await escribir('primero');
    await espera(700);
    comprobar('e) y lo que se escribe va ahí', await js(`return /Notas: ?primero/.test(${D}.nota('${acta.id}').html.replace(/&nbsp;/g, ' '));`), await js(`return ${D}.nota('${acta.id}').html;`));
    await tecla('Escape', [], 250);
    /* con {{titulo}} en el texto y sin variables en el nombre: pide el nombre antes */
    await aClic(`document.querySelector('#gdMain [data-gd-desde-plantilla]')`, { tras: 300 });
    const antesEsc = await js(`return ${D}.notasDe('${ids.sid}').length;`);
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo === 'Escena')`, { tras: 400 });
    const pide = JSON.parse(await js(`const d = document.getElementById('dlgNombre'); return JSON.stringify({ open: d.open, ceja: d.querySelector('[data-dlg-ceja]').textContent, n: ${D}.notasDe('${ids.sid}').length });`));
    comprobar('e) una plantilla con {{titulo}} en el texto pide el nombre antes de crear la nota', pide.open && /Escena/.test(pide.ceja) && pide.n === antesEsc, JSON.stringify(pide));
    await escribir('Llegada');
    await tecla('Enter', [], 700);
    const llegada = JSON.parse(await js(`const d = ${D}, n = d.notasDe('${ids.sid}', null)[0]; return JSON.stringify({ id: n.id, tit: n.titulo, html: n.html, ch: Object.keys(n.characters || {}) });`));
    comprobar('e) nace con ese nombre y su texto lo lleva ({{titulo}} → Llegada); guion intacto', llegada.tit === 'Llegada' && /class="sp-action"[^>]*>Llegada entra\./.test(llegada.html) && /sp-scene/.test(llegada.html) && /sp-character/.test(llegada.html), JSON.stringify(llegada));
    const curEsc = JSON.parse(await js(`return JSON.stringify({ tit: ${CAPA}.querySelector('[data-gd-lado-titulo]').value, antes: ${antesDelCursor()}, foco: ${CAMPO}.contains(document.activeElement) });`));
    comprobar('e) y su ventana, con el cursor en el diálogo, tras «Hola, »', curEsc.tit === 'Llegada' && curEsc.foco && curEsc.antes === 'Hola, ', JSON.stringify(curEsc));
    comprobar('k) la nota que sale de una plantilla sí pone a ZOE en el elenco (ya es del guion)', await js(`return ${D}.elenco().some(p => /zoe/i.test(p.nombre));`) && llegada.ch.some(k => /zoe/i.test(k)), await js(`return JSON.stringify(${D}.elenco().map(p => p.nombre));`));
    await tecla('Escape', [], 250);

    /* ---------- f) «Usar» en la tarjeta y en la ventana de una plantilla ---------- */
    await aClic(`${filaPl}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    await hasta(`return ${G}.esPlantillas() && !!document.querySelector('#gdMain [data-gd-usar]');`, 3000);
    const antesUsar = await js(`return ${D}.notasDe('${ids.sid}').length;`);
    const reunionPl = await js(`return ${D}.plantillas().find(n => n.titulo === 'Reunión base').id;`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${reunionPl}"] [data-gd-usar]')`, { tras: 700 });
    const usada = JSON.parse(await js(`const d = ${D}, n = d.notasDe('${ids.sid}', null)[0], a = ${G}.subActual(); return JSON.stringify({ n: d.notasDe('${ids.sid}').length, tit: n.titulo, color: n.color, en: a && a.id, vent: ${CAPA} && !${CAPA}.hidden ? ${CAPA}.querySelector('[data-gd-lado-titulo]').value : null, pls: d.notasDe('plantillas:biblioteca').length });`));
    comprobar('f) «Usar» en la tarjeta crea la nota en la última biblioteca normal («Ideas»), no en las plantillas, y la abre', usada.n === antesUsar + 1 && usada.en === ids.sid && usada.tit === 'Sin título' && usada.color === 'rojo' && usada.vent === 'Sin título', JSON.stringify(usada));
    comprobar('f) sin {{cursor}} ni nombre, con el nombre elegido para escribir encima', await js(`const t = ${CAPA}.querySelector('[data-gd-lado-titulo]'); return document.activeElement === t && t.selectionStart === 0 && t.selectionEnd === t.value.length;`));
    await tecla('Escape', [], 250);
    await aClic(`${filaPl}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    await hasta(`return ${G}.esPlantillas() && !!${tarjeta(reunionPl)};`, 3000);
    await aClic(tarjeta(reunionPl), { tras: 400 });
    const antesUsar2 = await js(`return ${D}.notasDe('${ids.sid}').length;`);
    comprobar('f) una plantilla abierta en su ventana', await abierta() && await enVentana() === 'Reunión base');
    await aClic(`${CAPA}.querySelector('.gd-lado-usar')`, { tras: 700 });
    comprobar('f) «Usar» en la ventana también crea una nota en «Ideas» y la abre', await js(`return ${D}.notasDe('${ids.sid}').length;`) === antesUsar2 + 1 && await abierta() && await js(`return ${D}.nota(${G}.notaElegida()).subId === '${ids.sid}' && ${G}.subActual().id === '${ids.sid}';`),
      await js(`return JSON.stringify({ n: ${D}.notasDe('${ids.sid}').length, sel: ${G}.notaElegida(), a: ${G}.subActual() });`));
    await tecla('Escape', [], 250);
    await aClic(tarjeta(ids.reunion), { tras: 400 });
    await aClic(`${CAPA}.querySelector('[data-gd-menu="nota"]')`, { tras: 250 });
    comprobar('f) una nota normal no lleva «Usar» (su ⋯: «Guardar como plantilla…»)', await js(`return !${CAPA}.querySelector('.gd-lado-usar') && !!${opcionPop('Guardar como plantilla')} && !${opcionPop('Nueva nota con esta plantilla')};`));
    await tecla('Escape', [], 200);
    await cerrarSiAbierta();

    /* ---------- g) Cmd+Alt+N: con el foco en la página (un segmento expandido: nace en él) y en el editor ---------- */
    await js(`${G}.expandir('${ids.sid}', 'etq:${ids.e}'); await W(400); document.activeElement && document.activeElement.blur(); return true;`);
    await hasta(`return !!document.querySelector('#gdMain .gd-exp');`, 2000);
    await tecla('N', ['meta', 'alt'], 400);
    comprobar('g) Cmd+Alt+N (la página) abre la lista de plantillas', await hayPop() && await js(`return /Nueva nota desde plantilla/.test(document.querySelector('.gd-pop').textContent);`));
    const antesSeg = await js(`return ${D}.notasDe('${ids.sid}', '${ids.e}').length;`);
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo === 'Reunión base')`, { tras: 700 });
    comprobar('g) y la nota nace arriba del segmento expandido', await js(`const xs = ${D}.notasDe('${ids.sid}', '${ids.e}'); return xs.length === ${antesSeg} + 1 && xs[0].color === 'rojo' && xs[0].id === ${G}.notaElegida();`) && await abierta(),
      await js(`return JSON.stringify(${D}.notasDe('${ids.sid}', '${ids.e}').map(n => n.titulo));`));
    await tecla('Escape', [], 250);
    await js(`${G}.contraer(); ${G}.abrirSub('${ids.sid}'); await W(400); return true;`);
    /* en el editor */
    await dobleClic(await centro(tarjeta(ids.delta)), 800);
    await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${ids.delta}';`, 4000);
    const pd = await centroEnMarco(`d.querySelector('#editor > p')`, { dx: 'b.width - 4' });
    await clic(pd, { tras: 200 });
    comprobar('g) el foco, en el editor', await js(`return document.activeElement === document.getElementById('editorMarco') && document.getElementById('editorMarco').contentDocument.activeElement.id === 'editor';`));
    await tecla('N', ['meta', 'alt'], 400);
    comprobar('g) Cmd+Alt+N (en el editor) abre la lista de plantillas', await hayPop() && await js(`return /Nueva nota desde plantilla/.test(document.querySelector('.gd-pop').textContent);`));
    const antesEd = await js(`return ${D}.notasDe('${ids.sid}').length;`);
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo === 'Reunión base')`, { tras: 800 });
    comprobar('g) y crea la nota: el editor se cierra y la nueva se abre en su ventana, en «Ideas»', await js(`return ${D}.notasDe('${ids.sid}').length === ${antesEd} + 1 && !document.body.classList.contains('nota-abierta');`) && await abierta(),
      await js(`return JSON.stringify({ n: ${D}.notasDe('${ids.sid}').length, clase: document.body.className });`));
    await tecla('Escape', [], 250);

    /* ---------- h) «/plantilla» en el editor ---------- */
    await dobleClic(await centro(tarjeta(ids.delta)), 800);
    await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${ids.delta}' && Claquedraw.texto.enDocumento();`, 4000);
    const ph = await centroEnMarco(`d.querySelector('#editor > p')`, { dx: 'b.width - 4' });
    await clic(ph, { tras: 200 });
    await tecla('End', [], 80);
    await tecla('Enter', [], 150);
    await escribir('/plantill');
    const slash = await js(`const d = document.getElementById('editorMarco').contentDocument; const w = document.getElementById('editorMarco').contentWindow, m = w.document.querySelector('.slash-menu'); return w.Ed.slash.open && m ? m.textContent : '';`);
    comprobar('h) «/plantill» ofrece «Insertar plantilla…» en el menú «/»', /Insertar plantilla/.test(slash), slash);
    await tecla('Enter', [], 400);
    comprobar('h) Enter la elige y sale la lista de plantillas (en la página)', await hayPop() && await js(`return /Insertar plantilla/.test(document.querySelector('.gd-pop').textContent);`));
    const htmlAntes = await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`);
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo.startsWith('Acta'))`, { tras: 500 });
    const ins = JSON.parse(await js(`const w = document.getElementById('editorMarco').contentWindow; return JSON.stringify({ html: w.Ed.document.get().html, antes: ${antesDelCursor('w')}, foco: w.document.activeElement && w.document.activeElement.id, marca: !!w.document.querySelector('[data-cursor-plantilla]') });`));
    comprobar('h) la plantilla se pone donde estaba el cursor, con {{titulo}} = el de la nota («Delta») y sin la «/plantill»',
      /uno dos tres cuatro\./.test(ins.html) && ins.html.includes('Acta de Delta para Las plantillas') && ins.html.includes('Día: ' + DIA_LARGO) && !/\/plantill/.test(ins.html) && !/\{\{cursor/.test(ins.html) && ins.html.indexOf('uno dos') < ins.html.indexOf('Acta de Delta'), ins.html);
    comprobar('h) el cursor, donde decía {{cursor}}, y sin la marca', ins.foco === 'editor' && ins.antes && ins.antes.trim() === 'Notas:' && !ins.marca, JSON.stringify(ins));
    /* Cmd+Z es el acelerador del menú (Edición › Deshacer, que en el editor va a su execCommand): sendInputEvent no pasa por el menú */
    menuApp('Edición', 'Deshacer').click(); await espera(400);
    const trasDeshacer = await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`);
    comprobar('h) un solo Cmd+Z la quita entera', trasDeshacer === htmlAntes, 'antes: ' + htmlAntes + '\n      después: ' + trasDeshacer);
    menuApp('Edición', 'Rehacer').click(); await espera(400);
    comprobar('h) y Rehacer la devuelve', await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`) === ins.html);

    /* una de varios bloques con elementos de guion, con el cursor a mitad de un párrafo con texto: va detrás de él, que queda
       intacto, y los elementos conservan su clase (Chrome une el primer y el último bloque con el párrafo donde cae) */
    const pDos = await js(`const f = document.getElementById('editorMarco'), w = f.contentWindow, p = w.document.querySelector('#editor > p'), t = p.firstChild, r = w.document.createRange();
      r.setStart(t, 5); r.setEnd(t, 6); const b = r.getBoundingClientRect(), m = f.getBoundingClientRect(); return JSON.stringify({ x: m.left + b.left, y: m.top + b.top + b.height / 2 });`).then(JSON.parse);
    await clic(pDos, { tras: 200 });
    const htmlAntes2 = await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`);
    menuApp('Archivo', 'Insertar plantilla…').click();
    await espera(400);
    if (await hayPop()) await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo === 'Escena')`, { tras: 500 });
    const ins2 = JSON.parse(await js(`const w = document.getElementById('editorMarco').contentWindow; return JSON.stringify({ html: w.Ed.document.get().html, antes: ${antesDelCursor('w')} });`));
    comprobar('h) con el cursor a mitad de un párrafo, una plantilla de guion va detrás de él (intacto) con sus clases',
      /^<p>uno dos tres cuatro\.<\/p><p class="sp-scene">INT\. casa - noche<\/p><p class="sp-action">Delta entra\.<\/p><p class="sp-character"[^>]*>ZOE<\/p><p class="sp-dialogue">Hola, \.<\/p>/.test(ins2.html) && ins2.antes === 'Hola, ', JSON.stringify(ins2));
    menuApp('Edición', 'Deshacer').click(); await espera(400);
    comprobar('h) y también se deshace de una vez', await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`) === htmlAntes2,
      'antes: ' + htmlAntes2 + '\n      después: ' + await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`));

    /* ---------- i) las órdenes del menú de la app ---------- */
    menuApp('Archivo', 'Insertar plantilla…').click();
    await espera(400);
    comprobar('i) Archivo › Insertar plantilla… (con el editor delante) abre la lista', await hayPop() && await js(`return /Insertar plantilla/.test(document.querySelector('.gd-pop').textContent);`));
    await tecla('Escape', [], 200); await js(`${G}.cerrarPop(); return true;`);
    const antesMenuG = (await plantillas()).length;
    menuApp('Archivo', 'Guardar la nota como plantilla…').click();
    await espera(400);
    comprobar('i) Archivo › Guardar la nota como plantilla… (la del editor) pregunta dónde', await hayPop() && await js(`return /Guardar «Delta» como plantilla/.test(document.querySelector('.gd-pop').textContent);`), await js(`return (document.querySelector('.gd-pop') || {}).textContent;`));
    if (await hayPop()) await aClic(opcionPop('Bandeja'), { tras: 500 });
    comprobar('i) y la guarda, con lo que había en el editor', (await plantillas()).length === antesMenuG + 1 && await js(`const p = ${D}.plantillas().find(n => n.titulo === 'Delta'); return !!p && /Acta de Delta/.test(p.html);`));
    await js(`${G}.cerrarNota(); await W(300); return true;`);
    menuApp('Archivo', 'Nueva nota desde plantilla…').click();
    await espera(400);
    comprobar('i) Archivo › Nueva nota desde plantilla… abre la lista', await hayPop() && await js(`return /Nueva nota desde plantilla/.test(document.querySelector('.gd-pop').textContent);`));
    await js(`${G}.cerrarPop(); return true;`);
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    menuApp('Ver', 'Plantillas').click();
    comprobar('i) Ver › Plantillas abre su tablero (desde el esquema)', await hasta(`return ${G}.esPlantillas() && document.body.classList.contains('vista-documentos');`, 3000));

    /* ---------- j) tirar una plantilla y restaurarla ---------- */
    const delPl = await js(`return ${D}.plantillas().find(n => n.titulo === 'Delta').id;`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${delPl}"] .gd-nota-acc')`, { tras: 250 });
    comprobar('j) el ⋯ de una plantilla ofrece «Nueva nota con esta plantilla» y no «Guardar como plantilla…»', await js(`return !!${opcionPop('Nueva nota con esta plantilla')} && !${opcionPop('Guardar como plantilla')};`));
    await aClic(opcionPop('Mover a la papelera'), { tras: 300 });
    await aClic(`document.getElementById('dlgOk')`, { tras: 500 });
    comprobar('j) una plantilla se tira a la papelera', await js(`return ${D}.enPapelera('${delPl}') && !${D}.plantillas().some(n => n.id === '${delPl}');`));
    await aClic(`document.querySelector('.gd-cont.papelera[data-id="papelera"] [data-gd-nombre]')`, { tras: 500 });
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${delPl}"]');`, 3000);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${delPl}"] .gd-nota-acc')`, { tras: 250 });
    const rest = await js(`const b = ${opcionPop('Restaurar')}; return b ? b.textContent : null;`);
    comprobar('j) en la papelera, «Restaurar en «Plantillas»»', rest && /Plantillas/.test(rest), rest);
    await aClic(opcionPop('Restaurar'), { tras: 500 });
    comprobar('j) y restaurada vuelve a las plantillas', await js(`return !${D}.enPapelera('${delPl}') && ${D}.esPlantilla('${delPl}') && ${D}.plantillas().some(n => n.id === '${delPl}');`));

    /* ---------- m) la pestaña y ‹ › ---------- */
    await aClic(`${filaPl}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    await hasta(`return ${G}.esPlantillas();`, 2000);
    await aClic(`[...document.querySelectorAll('.gd-sub[data-sub]')].find(x => x.dataset.sub.endsWith('/${ids.sid}'))`, { tras: 600 });
    await hasta(`const a = ${G}.subActual(); return !!a && a.id === '${ids.sid}';`, 2000);
    await aClic(`document.querySelector('#gdMain .nav-hist [data-hist="-1"]')`, { tras: 600 });
    comprobar('m) ‹ vuelve de «Ideas» al tablero de las plantillas', await hasta(`return ${G}.esPlantillas() && !!document.querySelector('#gdMain .gd-plantillas-aviso');`, 2000)
      && await js(`const p = document.querySelector('.pestana.activa'); return p.dataset.tipo === 'plantillas';`), await js(`return JSON.stringify(${G}.subActual());`));
    await aClic(`document.querySelector('#gdMain .nav-hist [data-hist="1"]')`, { tras: 600 });
    comprobar('m) y › vuelve a «Ideas»', await hasta(`const a = ${G}.subActual(); return !!a && a.id === '${ids.sid}';`, 2000));
    const nPest = await js(`return document.querySelectorAll('.pestana[data-id]').length;`);
    await aClic(`${filaPl}.querySelector('[data-gd-menu="plantillas"]')`, { tras: 250 });
    await aClic(opcionPop('Abrir en pestaña'), { tras: 600 });
    comprobar('m) «Abrir en pestaña» (⋯ de Plantillas) abre otra pestaña con ellas', await js(`const p = document.querySelector('.pestana.activa'); return document.querySelectorAll('.pestana[data-id]').length === ${nPest} + 1 && p.dataset.tipo === 'plantillas';`) && await js(`return ${G}.esPlantillas();`),
      await js(`return JSON.stringify([...document.querySelectorAll('.pestana[data-id]')].map(p => p.dataset.tipo + ':' + p.textContent.trim()));`));

    /* al volver a abrir la ventana (recargar), la pestaña de las plantillas vuelve a su tablero; y Cmd+Alt+N desde él, sin haber
       visto aún ninguna biblioteca, crea la nota en una del árbol (nunca en las plantillas) */
    await js(`window.dispatchEvent(new Event('beforeunload')); return true;`);
    await espera(300);
    win.webContents.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await hasta(`return !!(window.Claquedraw && Claquedraw.gestor && Claquedraw.gestor.documentos());`, 8000);
    comprobar('m) recargada la ventana, la pestaña de delante vuelve al tablero de las plantillas', await hasta(`const p = document.querySelector('.pestana.activa'); return ${G}.esPlantillas() && !!p && p.dataset.tipo === 'plantillas' && !!document.querySelector('#gdMain .gd-plantillas-aviso');`, 5000),
      await js(`return JSON.stringify({ a: ${G}.subActual(), modo: Claquedraw.app.modo(), p: (document.querySelector('.pestana.activa') || {}).textContent });`));
    win.focus(); win.webContents.focus();
    await js(`document.activeElement && document.activeElement.blur(); return true;`);
    const antesRec = JSON.parse(await js(`return JSON.stringify({ i: ${D}.notasDe('${ids.sid}').length, p: ${D}.plantillas().length });`));
    await tecla('N', ['meta', 'alt'], 400);
    if (await hayPop()) await aClic(`[...document.querySelectorAll('.gd-pop .gd-pop-lista button')].find(b => b.dataset.plTitulo === 'Reunión base')`, { tras: 700 });
    comprobar('g) Cmd+Alt+N con el tablero de las plantillas delante: la nota va a una biblioteca del árbol, no a las plantillas', await js(`return ${D}.notasDe('${ids.sid}').length === ${antesRec.i} + 1 && ${D}.plantillas().length === ${antesRec.p} && ${G}.subActual().id === '${ids.sid}';`) && await abierta(),
      await js(`return JSON.stringify({ i: ${D}.notasDe('${ids.sid}').length, p: ${D}.plantillas().length, a: ${G}.subActual() });`));
    await tecla('Escape', [], 250);

    /* ---------- l) el archivo ---------- */
    await js(`await Claquedraw.app.guardar(); await W(600); return true;`);
    for (let i = 0; i < 40 && !(fs.existsSync(RUTA) && leerArchivo(RUTA).documentos.notas.some(n => n.subId === 'plantillas:biblioteca' && n.titulo === 'Delta')); i++) await espera(150);
    const f = leerArchivo(RUTA), fd = f.documentos;
    const enArchivo = fd.notas.filter(n => n.subId === 'plantillas:biblioteca').map(n => n.titulo).sort();
    const enApp = (await plantillas()).slice().sort();
    comprobar('l) el archivo lleva el contenedor especial y las plantillas', fd.contenedores.some(c => c.id === 'plantillas' && c.especial === 'plantillas' && c.oculto && c.subs.some(s => s.id === 'plantillas:biblioteca'))
      && JSON.stringify(enArchivo) === JSON.stringify(enApp), JSON.stringify({ enArchivo, enApp }));
    /* una copia con otro nombre, abierta en otra ventana */
    const COPIA = path.join(TMP, 'copia-plantillas.clapcraft');
    fs.writeFileSync(COPIA, zlib.gzipSync(JSON.stringify(Object.assign(f, { nombre: 'Copia de las plantillas' }))));
    const antesV = ventanas().length;
    await js(`await Claquedraw.app.abrirRuta(${JSON.stringify(COPIA)}); return true;`);
    let otra = null;
    for (let i = 0; i < 100 && !otra; i++) { await espera(100); otra = ventanas().find(w => w !== win && ventanas().length > antesV); }
    if (otra) {
      preparar(otra);
      if (otra.webContents.isLoading()) await new Promise(r => otra.webContents.once('did-finish-load', r));
      let pl2 = null;
      for (let i = 0; i < 60; i++) {
        pl2 = await jsEn(otra, `const G = window.Claquedraw && Claquedraw.gestor, d = G && G.documentos(); return d && Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre === 'Copia de las plantillas' ? JSON.stringify(d.plantillas().map(n => n.titulo).sort()) : null;`).catch(() => null);
        if (pl2) break; await espera(150);
      }
      comprobar('l) abierto en otra ventana, el proyecto conserva sus plantillas', pl2 === JSON.stringify(enApp), pl2);
      const fila2 = await jsEn(otra, `const n = document.querySelector('[data-gd-plantillas] .gd-cont-num'); return n ? n.textContent : null;`);
      comprobar('l) y su «Plantillas» cuenta las mismas', fila2 === String(enApp.length), fila2);
      await jsEn(otra, `await Claquedraw.app.cerrar(); return true;`).catch(() => {});
      await espera(600);
    } else comprobar('l) abierto en otra ventana, el proyecto conserva sus plantillas', false, 'no se abrió la ventana');

    /* ---------- n) sin errores ---------- */
    comprobar('n) la página no soltó ningún error', !errores.length, errores.join(' | '));
    comprobar('el servidor MCP no soltó errores', !/Error|error:/.test(M.errores().replace(/servidor MCP listo/, '')), M.errores());
  } catch (e) {
    comprobar('sin excepciones', false, e && e.stack);
  } finally {
    if (M) M.cerrar();
    const mal = resultados.filter(x => !x.ok).length;
    console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
    if (!mal) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    app.exit(mal ? 1 : 0);
  }
});
