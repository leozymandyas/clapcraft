/* Prueba de la integración de los lienzos en la app (1.1.58), con el ratón de verdad: `electron pruebas/lienzo-app-electron.js`.
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos y el portapapeles de mentira: el
   de verdad es el de Leo). Árbol (fila «L», ⋯ del contenedor → «Nuevo lienzo…», renombrar con doble clic, color, duplicar,
   arrastrar en el árbol, papelera con «Deshacer» y restaurar), la vista lienzo, pestañas y ‹ ›, arrastrar un esquema, una
   biblioteca y un personaje del árbol al lienzo, «Añadir al lienzo…» de una nota y de un segmento, enlaces (copiar e ir),
   Edición › Deshacer / Rehacer del menú, Claude en vivo (el servidor MCP con el Node de la app), Archivo › Nuevo lienzo…,
   «Nuevo lienzo…» en carpetas y grupos, y volver a la última pantalla al recargar.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lienzo-app-'));
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 1200)));
}
function mcp() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, errores = '';
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', d => { errores += d; });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return r.error ? { error: true, texto: JSON.stringify(r.error) } : { error: !!r.result.isError, texto: (r.result.content.find(c => c.type === 'text') || {}).text || '' }; };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}

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
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: op.n || 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 250 : op.tras);
  }
  async function dobleClic(p) { await clic(p, { tras: 120 }); await clic(p, { n: 2, tras: 400 }); }
  async function arrastrar(a, b) {
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(40);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= 14; i++) { const x = a.x + (b.x - a.x) * i / 14, y = a.y + (b.y - a.y) * i / 14; ev({ type: 'mouseMove', x: R(x), y: R(y), button: 'left', modifiers: ['leftButtonDown'] }); await espera(30); }
    await espera(80);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(500);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras);
  }
  async function centro(expr) {
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const D = `Claquedraw.gestor.documentos()`;
  const opcionPop = t => `[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  const accionAviso = t => `[...document.querySelectorAll('#aviso .aviso-accion')].find(b => b.textContent === ${JSON.stringify(t)})`;
  const avisoTxt = () => js(`return document.getElementById('aviso').textContent;`);
  const menu = (grupo, texto) => Menu.getApplicationMenu().items.find(i => i.label === grupo).submenu.items.find(i => i.label === texto);
  const filaArbol = (tipo, nombre) => `[...document.querySelectorAll('#gdSide .gd-sub--${tipo}')].find(f => f.querySelector('.gd-sub-nom').textContent === ${JSON.stringify(nombre)})`;
  const lienzo = nombre => js(`const c = ${D}.datos.contenedores[0]; return JSON.stringify((c.lienzos || []).find(l => l.nombre === ${JSON.stringify(nombre)}) || null);`).then(JSON.parse);
  const escribir = async t => { win.webContents.insertText(t); await espera(120); };

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1400, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · la integración de los lienzos en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Lluvia', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    /* una biblioteca con una nota y un segmento, por el modelo */
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0];
      const b = d.crearSub(c.id, 'Ideas').sub; const e = d.crearEtiqueta(b.id, 'Escenas', 3).etiqueta; const n = d.crearNota(b.id, e.id, 'La llegada').nota;
      Claquedraw.biblioteca.marcar(Claquedraw.app.abiertoId()); Claquedraw.gestor.render();
      return JSON.stringify({ cid: c.id, eid: c.esquemas[0].id, sub: b.id, etq: e.id, nota: n.id });`));
    comprobar('el proyecto tiene esquema, biblioteca, segmento y nota', ids.eid && ids.sub && ids.nota, JSON.stringify(ids));

    /* ---------- crear un lienzo desde el ⋯ del contenedor ---------- */
    await aClic(`document.querySelector('#gdSide .gd-cont [data-gd-menu="contenedor"]')`, { tras: 300 });
    comprobar('el ⋯ del contenedor ofrece «Nuevo lienzo…»', await js(`return !!${opcionPop('Nuevo lienzo')};`), await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent).join(' | ');`));
    await aClic(opcionPop('Nuevo lienzo'), { tras: 400 });
    comprobar('pide el nombre en el diálogo', await js(`const d = document.getElementById('dlgNombre'); return d.open && /lienzo/i.test(d.textContent);`));
    await escribir('Del guion a los fragmentos'); await tecla('Enter', [], 900);
    let L = await lienzo('Del guion a los fragmentos');
    comprobar('lo crea en el contenedor', !!L, JSON.stringify(L));
    comprobar('y lo abre: vista lienzo con la sección #lienzo', await hasta(`return document.body.classList.contains('vista-lienzo') && Claquedraw.app.modo() === 'lienzo' && !!document.getElementById('lienzo') && document.getElementById('lienzo').offsetWidth > 200;`, 3000));
    comprobar('el esquema no se ve', await js(`return document.getElementById('esquema').offsetParent === null;`));
    comprobar('su fila en el árbol, con «L» y activa', await js(`const f = ${filaArbol('lienzo', 'Del guion a los fragmentos')}; return !!f && f.querySelector('.gd-chip').textContent === 'L' && f.classList.contains('activo');`));
    comprobar('la pestaña dice «L» y el nombre', await js(`const t = document.querySelector('.pestana.activa'); return !!t && t.dataset.tipo === 'lienzo' && /Del guion/.test(t.textContent);`), await js(`return (document.querySelector('.pestana.activa') || {}).outerHTML;`));
    comprobar('la cabecera lleva ‹ › y el botón de enlace', await js(`const c = document.querySelector('#lienzo .esq-titulo'); return !!c && !!c.previousElementSibling && c.previousElementSibling.matches('.nav-hist') && !!c.nextElementSibling && c.nextElementSibling.matches('[data-enlace-cab]');`));

    /* ---------- arrastrar un esquema y una biblioteca desde el árbol ---------- */
    const lz = await centro(`document.getElementById('lienzo')`);
    let a = await centro(filaArbol('esquema', 'Esquema'));
    await arrastrar(a, { x: lz.x - 150, y: lz.y - 60 });
    L = await lienzo('Del guion a los fragmentos');
    comprobar('un esquema soltado en el lienzo es un nodo de entrada', L && L.nodos.some(n => n.tipo === 'esquema' && n.datos.eid === ids.eid), JSON.stringify(L && L.nodos));
    a = await centro(filaArbol('sub', 'Ideas'));
    await arrastrar(a, { x: lz.x + 150, y: lz.y + 80 });
    L = await lienzo('Del guion a los fragmentos');
    comprobar('y una biblioteca también', L && L.nodos.some(n => n.tipo === 'biblioteca' && n.datos.subId === ids.sub), JSON.stringify(L && L.nodos));
    comprobar('el árbol no se desordenó', await js(`return ${D}.datos.contenedores[0].esquemas.length === 1 && !!${filaArbol('esquema', 'Esquema')};`));

    /* ---------- Deshacer del menú, en el lienzo ---------- */
    const antes = L.nodos.length;
    menu('Edición', 'Deshacer').click(); await espera(500);
    L = await lienzo('Del guion a los fragmentos');
    comprobar('Edición › Deshacer deshace en el lienzo', L.nodos.length === antes - 1, antes + ' → ' + L.nodos.length);
    menu('Edición', 'Rehacer').click(); await espera(500);
    L = await lienzo('Del guion a los fragmentos');
    comprobar('y Rehacer lo rehace', L.nodos.length === antes, antes + ' → ' + L.nodos.length);

    /* ---------- enlaces ---------- */
    menu('Claude', 'Copiar enlace para Claude').click(); await espera(400);
    comprobar('Cmd+Shift+C sin nada elegido copia el enlace del lienzo', new RegExp('clapcraft://[^/]+/lienzo/' + L.id + '\\)').test(portapapeles), portapapeles);

    /* ---------- «Añadir al lienzo…» de una nota, desde la biblioteca ---------- */
    await aClic(filaArbol('sub', 'Ideas'), { tras: 700 });
    comprobar('pulsar la biblioteca deja el lienzo', await hasta(`return document.body.classList.contains('vista-documentos') && !document.body.classList.contains('vista-lienzo');`, 3000));
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.nota}"] [data-gd-menu="nota"]')`, { tras: 300 });
    comprobar('el ⋯ de la nota ofrece «Añadir al lienzo…»', await js(`return !!${opcionPop('Añadir al lienzo')};`));
    await aClic(opcionPop('Añadir al lienzo'), { tras: 300 });
    await aClic(opcionPop('Del guion a los fragmentos'), { tras: 500 });
    L = await lienzo('Del guion a los fragmentos');
    const nNota = L.nodos.find(n => n.tipo === 'nota' && n.datos.notaId === ids.nota);
    comprobar('la nota entra en el lienzo sin abrirlo', !!nNota && await js(`return document.body.classList.contains('vista-documentos');`), JSON.stringify(L.nodos));
    comprobar('el aviso trae «Abrir»', /Añadido al lienzo/.test(await avisoTxt()) && await js(`return !!${accionAviso('Abrir')};`), await avisoTxt());
    await aClic(`[...document.querySelectorAll('#gdMain .gd-etq[data-etq="${ids.etq}"] [data-gd-menu="etiqueta"]')][0]`, { tras: 300 });
    await aClic(opcionPop('Añadir al lienzo'), { tras: 300 });
    await aClic(opcionPop('Del guion a los fragmentos'), { tras: 500 });
    L = await lienzo('Del guion a los fragmentos');
    comprobar('y un segmento, desde el ⋯ de su tarjeta', L.nodos.some(n => n.tipo === 'segmento' && n.datos.subId === ids.sub && n.datos.etiquetaId === ids.etq), JSON.stringify(L.nodos.map(n => [n.tipo, n.datos])));
    await aClic(accionAviso('Abrir'), { tras: 700 });
    comprobar('«Abrir» lleva al lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo';`, 3000));

    /* ---------- ‹ › y pestañas ---------- */
    await aClic(`document.querySelector('#lienzo .nav-hist [data-hist="-1"]')`, { tras: 700 });
    comprobar('‹ vuelve a la biblioteca', await hasta(`return Claquedraw.app.modo() === 'documentos';`, 3000));
    await aClic(`document.querySelector('#gdMain .nav-hist [data-hist="1"]')`, { tras: 700 });
    comprobar('› vuelve al lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${L.id}';`, 3000));
    await aClic(filaArbol('esquema', 'Esquema'), { tras: 700 });
    await aClic(`${filaArbol('lienzo', 'Del guion a los fragmentos')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    const opciones = await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent.trim()).join(' | ');`);
    comprobar('el ⋯ del lienzo lleva lo de una pieza', ['Abrir lienzo', 'Abrir en pestaña', 'Copiar enlace para Claude', 'Renombrar', 'Duplicar', 'Mover a carpeta', 'Cambiar color', 'Agrupar con', 'Mover a la papelera'].every(t => opciones.includes(t)), opciones);
    await aClic(opcionPop('Abrir en pestaña'), { tras: 700 });
    comprobar('«Abrir en pestaña» abre otra pestaña con el lienzo', await hasta(`const p = Claquedraw.app.pestanas(); return p.lista.length === 2 && Claquedraw.app.modo() === 'lienzo';`, 3000), await js(`return JSON.stringify(Claquedraw.app.pestanas());`));
    await aClic(`[...document.querySelectorAll('.pestana')].find(t => !t.classList.contains('activa'))`, { tras: 700 });
    comprobar('la otra pestaña sigue en el esquema', await hasta(`return Claquedraw.app.modo() === 'esquema';`, 3000));
    await aClic(`[...document.querySelectorAll('.pestana')].find(t => t.dataset.tipo === 'lienzo')`, { tras: 700 });
    comprobar('y la del lienzo, en el lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo';`, 3000));

    /* ---------- renombrar con doble clic, color, duplicar ---------- */
    await dobleClic(await centro(`${filaArbol('lienzo', 'Del guion a los fragmentos')}.querySelector('.gd-sub-nom')`));
    comprobar('el doble clic abre el campo de renombrar', await js(`return !!document.querySelector('#gdSide input.gd-edit');`));
    await js(`const i = document.querySelector('#gdSide input.gd-edit'); i.select(); return true;`);
    await escribir('Fragmentos del piloto'); await tecla('Enter', [], 600);
    L = await lienzo('Fragmentos del piloto');
    comprobar('y lo renombra', !!L);
    comprobar('la pestaña sigue al nombre', await js(`return /Fragmentos del piloto/.test(document.querySelector('.pestana.activa').textContent);`));
    await aClic(`${filaArbol('lienzo', 'Fragmentos del piloto')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    await aClic(opcionPop('Cambiar color'), { tras: 300 });
    await aClic(`document.querySelectorAll('.gd-pop .gd-paleta button')[4]`, { tras: 500 });
    L = await lienzo('Fragmentos del piloto');
    comprobar('«Cambiar color» le pone el suyo (chip con su par)', L.color === 4 && await js(`return ${filaArbol('lienzo', 'Fragmentos del piloto')}.querySelector('.gd-chip').classList.contains('per-chip');`));
    await aClic(`${filaArbol('lienzo', 'Fragmentos del piloto')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    await aClic(opcionPop('Duplicar'), { tras: 600 });
    comprobar('«Duplicar» deja la copia detrás, con sus nodos', !!(await js(`return !!${filaArbol('lienzo', 'Fragmentos del piloto (copia)')};`)) && (await lienzo('Fragmentos del piloto (copia)')).nodos.length === L.nodos.length);

    /* ---------- arrastrar el lienzo en el árbol: delante del esquema ---------- */
    a = await centro(filaArbol('lienzo', 'Fragmentos del piloto (copia)'));
    const b = await centro(filaArbol('esquema', 'Esquema'));
    await arrastrar(a, { x: b.x, y: b.y - b.h / 2 + 3 });
    comprobar('se arrastra en el árbol como un esquema (queda delante)', await js(`const xs = ${D}.nivelArbol(${D}.datos.contenedores[0].id, null).map(x => x.obj.nombre); return xs.indexOf('Fragmentos del piloto (copia)') < xs.indexOf('Esquema');`),
      await js(`return JSON.stringify(${D}.nivelArbol(${D}.datos.contenedores[0].id, null).map(x => x.obj.nombre));`));

    /* ---------- papelera ---------- */
    await aClic(`${filaArbol('lienzo', 'Fragmentos del piloto (copia)')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    await aClic(opcionPop('Mover a la papelera'), { tras: 600 });
    comprobar('a la papelera, con «Deshacer»', !(await lienzo('Fragmentos del piloto (copia)')) && await js(`return !!${accionAviso('Deshacer')};`), await avisoTxt());
    await aClic(accionAviso('Deshacer'), { tras: 600 });
    comprobar('«Deshacer» lo devuelve', !!(await lienzo('Fragmentos del piloto (copia)')));
    await aClic(`${filaArbol('lienzo', 'Fragmentos del piloto (copia)')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    await aClic(opcionPop('Mover a la papelera'), { tras: 600 });
    await aClic(`document.querySelector('#gdSide .gd-cont.papelera[data-id="papelera"]')`, { tras: 700 });
    comprobar('la papelera lo enseña con su «L» y sus nodos', await hasta(`const p = [...document.querySelectorAll('#gdMain .gd-pieza')].find(x => /Fragmentos del piloto \\(copia\\)/.test(x.textContent)); return !!p && p.querySelector('.gd-chip').textContent === 'L' && /nodos/.test(p.textContent);`, 3000),
      await js(`return (document.querySelector('#gdMain .gd-papelera--piezas') || {}).textContent;`));
    await dobleClic(await centro(`[...document.querySelectorAll('#gdMain .gd-pieza')].find(x => /Fragmentos del piloto \\(copia\\)/.test(x.textContent))`));
    comprobar('y el doble clic lo restaura', !!(await lienzo('Fragmentos del piloto (copia)')));

    /* ---------- enlaces a un nodo ---------- */
    const lid = (await lienzo('Fragmentos del piloto')).id, nid = (await lienzo('Fragmentos del piloto')).nodos[0].id;
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    portapapeles = `[Nodo](clapcraft://lluvia/lienzo/${lid}/nodo/${nid})`;
    menu('Claude', 'Ir al enlace copiado').click(); await espera(800);
    comprobar('ir al enlace de un nodo del lienzo lo abre y lo elige', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${lid}' && Claquedraw.lienzoUI.elegidos().includes('${nid}');`, 3000),
      await avisoTxt());
    menu('Claude', 'Copiar enlace para Claude').click(); await espera(400);
    comprobar('con un nodo elegido, Cmd+Shift+C copia el enlace del nodo', portapapeles.includes('/lienzo/' + lid + '/nodo/' + nid), portapapeles);

    /* ---------- Claude, en vivo ---------- */
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    const n0 = (await lienzo('Fragmentos del piloto')).nodos.length;
    let r = await M.llamar('editar_lienzo', { lienzo: lid, operaciones: [{ op: 'crear_nodo', tipo: 'texto', x: 40, y: 40, datos: { md: 'Tono: melancólico' } }] });
    comprobar('Claude añade un nodo al lienzo abierto', !r.error, r.texto);
    await espera(600);
    comprobar('y el lienzo lo enseña al momento', (await lienzo('Fragmentos del piloto')).nodos.length === n0 + 1 && await js(`return document.querySelectorAll('#lienzo [data-nodo], #lienzo .lz-nodo').length >= ${n0 + 1};`),
      await js(`return document.querySelectorAll('#lienzo [data-nodo], #lienzo .lz-nodo').length;`));

    /* ---------- un personaje desde el árbol de Personajes (el pie solo cambia el árbol: el lienzo sigue delante) ---------- */
    const pid = await js(`const r = ${D}.crearPersonaje('MARA', 2); Claquedraw.gestor.render(); return r.personaje.id;`);
    await aClic(`document.querySelector('#gdSide [data-gd-ir-personajes]')`, { tras: 500 });
    comprobar('el pie «Personajes» no cambia de pantalla', await js(`return Claquedraw.app.modo() === 'lienzo';`));
    const n1 = (await lienzo('Fragmentos del piloto')).nodos.length;
    const lz2 = await centro(`document.getElementById('lienzo')`);
    await arrastrar(await centro(`document.querySelector('#gdSide .gd-per[data-personaje="${pid}"]')`), { x: lz2.x + 60, y: lz2.y + 160 });
    const Lp = await lienzo('Fragmentos del piloto');
    comprobar('un personaje soltado en el lienzo es su entrada', Lp.nodos.length === n1 + 1 && Lp.nodos.some(n => n.tipo === 'personaje' && n.datos.personajeId === pid), JSON.stringify(Lp.nodos.map(n => n.tipo)));
    comprobar('y el elenco no se movió', await js(`return ${D}.elenco().length === 1;`));
    await aClic(`document.querySelector('#gdSide [data-gd-ir-contenedores]')`, { tras: 500 });

    /* ---------- Archivo › Nuevo lienzo…, y «Nuevo lienzo…» en carpetas y grupos ---------- */
    menu('Archivo', 'Nuevo lienzo…').click(); await espera(500);
    comprobar('Archivo › Nuevo lienzo… pide el nombre', await js(`return document.getElementById('dlgNombre').open;`));
    await escribir('Escaleta'); await tecla('Enter', [], 900);
    comprobar('y lo crea en el contenedor de delante, abierto', !!(await lienzo('Escaleta')) && await js(`return Claquedraw.app.modo() === 'lienzo' && ${D}.lienzo(Claquedraw.app.lienzoMontado()).lienzo.nombre === 'Escaleta';`));
    await js(`const d = ${D}, c = d.datos.contenedores[0]; d.crearCarpeta(c.id, 'Pruebas', 'verde', null); d.crearGrupo(c.id, [], 'Juntos', 'azul'); Claquedraw.gestor.render(); return true;`);
    await aClic(`document.querySelector('#gdSide .gd-carpeta [data-gd-menu="carpeta"]')`, { tras: 300 });
    comprobar('el ⋯ de una carpeta ofrece «Nuevo lienzo…»', await js(`return !!${opcionPop('Nuevo lienzo')};`));
    await aClic(opcionPop('Nuevo lienzo'), { tras: 400 }); await escribir('En carpeta'); await tecla('Enter', [], 900);
    comprobar('y nace dentro de ella', await js(`const r = ${D}.lienzo(Claquedraw.app.lienzoMontado()); return !!r && r.lienzo.nombre === 'En carpeta' && !!r.lienzo.carpetaId;`));
    await aClic(`document.querySelector('#gdSide .gd-arb-marca .gd-arb-mas')`, { tras: 300 });
    comprobar('el ⋯ de un grupo ofrece «Nuevo lienzo…»', await js(`return !!${opcionPop('Nuevo lienzo')};`), await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent).join(' | ');`));
    await aClic(opcionPop('Nuevo lienzo'), { tras: 400 }); await escribir('En grupo'); await tecla('Enter', [], 900);
    comprobar('y nace dentro del grupo', await js(`const id = Claquedraw.app.lienzoMontado(), g = ${D}.grupoDe(id); return !!g && g.grupo.nombre === 'Juntos';`));
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(300); return true;`);

    /* ---------- volver a la última pantalla al recargar ---------- */
    await js(`Claquedraw.app.guardar && await Claquedraw.app.guardar(); return true;`);
    win.webContents.reload();
    await new Promise(r2 => win.webContents.once('did-finish-load', r2));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.modo);`);
    comprobar('al recargar, vuelve al lienzo', await hasta(`return Claquedraw.app.modo() === 'lienzo' && Claquedraw.app.lienzoMontado() === '${lid}';`, 5000), await js(`return Claquedraw.app.modo();`));
  } catch (e) {
    comprobar('la prueba termina sin excepciones', false, e && e.stack);
  }
  comprobar('la página no suelta errores', !errores.length, errores.join('\n'));
  if (M) { const e = M.errores(); M.cerrar(); if (e.trim()) console.log('    [servidor] ' + e.slice(0, 600)); }
  comprobar('el servidor MCP no suelta errores', !M || !/Error|error:/.test(M.errores().replace(/servidor MCP listo[^\n]*/, '')), M && M.errores());
  const mal = resultados.filter(x => !x.ok).length;
  console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
  if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
  app.exit(mal ? 1 : 0);
});
