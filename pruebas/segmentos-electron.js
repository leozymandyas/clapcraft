/* Prueba de los segmentos y las bibliotecas con la app de verdad (Electron): `npm run test:segmentos`.
   1.1.54, lo que vino de ClapBook: la ventana de una nota (como en Notion) en lugar del panel lateral, buscar, filtrar y ordenar en
   la biblioteca y en el segmento expandido, el formato en el campo de la ventana y unas cuantas correcciones (la papelera que
   recuerda el segmento y el sitio, lo que se oye en el tablero de tramas escondido…). Arranca electron/main.js tal cual
   (almacenamiento en una carpeta temporal, diálogos sustituidos y **el portapapeles del sistema sustituido por uno de mentira**: el de
   verdad es el de Leo), crea un proyecto en blanco con archivo, lo llena con el servidor MCP (arrancado como lo arranca Claude) y, con
   **el ratón y el teclado de verdad** (`webContents.sendInputEvent`, la ventana enfocada y ~180 ms entre los clics de un doble clic),
   comprueba:
   a) un clic en una tarjeta abre su ventana con su nombre y el documento con su formato; el doble clic la lleva al editor y
      «Contraer» la devuelve a la ventana;
   b) un clic en el fondo la cierra, uno dentro no; Esc y ×; ‹ › por las notas del segmento («2/4»); en la última, «＋» crea otra al
      final con el nombre elegido, que se escribe y Enter lo pone; lo escrito en el campo llega a la nota; cada nota recuerda su
      desplazamiento y su cursor;
   c) el color y el ⋯ de la ventana abren su menú encima de ella y elegir un tono no la cierra; la papelera pregunta y el diálogo
      no la cierra hasta confirmar;
   d) los filtros: el orden y el color generales de la biblioteca, el del segmento expandido (heredado y propio), que se recuerdan
      al recargar; buscar (n de N, Enter abre la primera, Esc limpia) y Cmd+F;
   e) el formato en el campo: el clic derecho, un resaltado, Cmd+Shift+X, Cmd+E y Cmd+K, sin \u200B en lo guardado;
   f) con el esquema montado y un nodo elegido, Supr y las flechas en la ventana no tocan el esquema;
   g) cambiar de pestaña y de vista con la ventana abierta y volver la reabren con la misma nota;
   h) tirar una nota de un segmento y «Deshacer» la devuelve a su segmento y a su sitio;
   i) la página no suelta ningún error;
   y lo que arregló la revisión de la 1.1.54 (se comprueba antes de i):
   j) dos clics rápidos en › o en «＋», o un doble clic en el campo o el nombre justo después, no llevan la nota al editor (solo el
      doble clic en la tarjeta);
   k) con «Modificadas recientemente», escribir en una nota y pulsar › no vuelve a la anterior: se llega a todas;
   l) con una sección contraída, la cuenta de la búsqueda no cuenta sus notas y Enter no abre una de ellas;
   m) Esc en el menú del clic derecho y en el cuadro del enlace devuelve el foco al campo con lo elegido;
   n) Claude renombra la nota (editar_biblioteca) con el título enfocado: al salir del título no vuelve el nombre viejo;
   o) Claude añade al documento (escribir_documento) con el cursor en el campo: lo siguiente va donde estaba el cursor;
   p) tras abrir una nota de una biblioteca y pasar a otra por el árbol, Cmd+Shift+C (menú Claude) copia la otra;
   q) Claude › «Ir al enlace copiado» de un segmento con la ventana abierta la cierra y enseña el segmento expandido.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-segmentos-'));
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
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 700)));
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
  const NOMBRES = { Esc: 'Escape', Escape: 'Escape', Enter: 'Enter', Delete: 'Delete', Backspace: 'Backspace', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Tab: 'Tab', End: 'End', Home: 'Home' };
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => m === 'meta' || m === 'cmd' || m === 'control')) ev({ type: 'char', keyCode: k, modifiers });
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
  /* el centro de un elemento (una expresión que lo da), traído a la vista */
  async function centro(expr, op) {
    op = op || {};
    const r = await js(`const el = ${expr}; if (!el) return null; ${op.sinTraer ? '' : "el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);"}
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: b.top + ${op.dy === undefined ? 'b.height / 2' : op.dy}, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr, op); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  /* un tramo de texto de un párrafo del campo: su centro (para el doble clic en una palabra o el clic derecho) */
  async function palabra(expr, texto) {
    const r = await js(`const el = ${expr}; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) { const i = n.nodeValue.indexOf(${JSON.stringify(texto)}); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${texto.length});
        const b = r.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 }); } }
      return null;`);
    return r ? JSON.parse(r) : null;
  }
  const CAPA = `document.querySelector('.gd-modal-capa')`;
  const abierta = () => js(`const c = ${CAPA}; return !!c && !c.hidden && getComputedStyle(c).display !== 'none';`);
  const enVentana = () => js(`const c = ${CAPA}; return c && !c.hidden ? c.querySelector('[data-gd-lado-titulo]').value : null;`);
  const posNav = () => js(`const c = ${CAPA}, p = c && c.querySelector('.gd-nav-pos'); return p ? p.textContent : '';`);
  const G = `Claquedraw.gestor`, D = `Claquedraw.gestor.documentos()`;
  const tarjeta = id => `document.querySelector('#gdMain .gd-nota[data-nota="${id}"] > span:first-child')`;
  const tarjetaExp = id => `document.querySelector('#gdMain .gd-exp-nota[data-nota="${id}"] .gd-exp-tit')`;
  const FONDO = { x: 40, y: 430 };                             // lejos de la ventana (920 px en el centro de 1280)
  const menuClaude = texto => Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items.find(i => i.label === texto);
  const cerrarSiAbierta = async () => { if (await abierta()) { await js(`${G}.cerrarVentana(); await W(100); return true;`); } };

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1280, height: 860 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de los segmentos y las bibliotecas en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Los segmentos', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    /* la biblioteca: dos segmentos y varias notas, algunas con color (el orden manual no es el alfabético) */
    const largo = Array.from({ length: 45 }, (_, i) => 'Párrafo ' + (i + 1) + ' de la nota larga, con texto para que la ventana se desplace.').join('\n\n');
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas' }] });
    comprobar('Claude crea la biblioteca', !r.error, r.texto);
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_segmento', ref: 'e', nombre: 'Escenas', color: 'Azul' },
      { op: 'crear_segmento', ref: 'p', nombre: 'Personas', color: 'Verde' },
      { op: 'crear_nota', segmento: '$e', titulo: 'Delta', contenido: 'uno dos tres cuatro cinco seis siete ocho' },
      { op: 'crear_nota', segmento: '$e', titulo: 'Bravo', color: 'rojo', contenido: 'La nota roja.' },
      { op: 'crear_nota', segmento: '$e', titulo: 'Alfa', contenido: '## Plan\n\n- primero\n- segundo\n\n' + largo },
      { op: 'crear_nota', segmento: '$e', titulo: 'Charlie', color: 'azul', contenido: 'La nota azul.' },
      { op: 'crear_nota', segmento: '$p', titulo: 'Foxtrot', color: 'verde', contenido: 'Un personaje.' },
      { op: 'crear_nota', segmento: '$p', titulo: 'Eco', contenido: 'Otro personaje, el único eco de la biblioteca.' }] });
    comprobar('y dos segmentos con seis notas', !r.error, r.texto);
    await espera(400);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], s = c.subs.find(x => x.nombre === 'Ideas');
      const e = d.etiquetasDe(s.id).find(x => x.nombre === 'Escenas'), p = d.etiquetasDe(s.id).find(x => x.nombre === 'Personas');
      const n = t => d.notasDe(s.id).find(x => x.titulo === t).id;
      return JSON.stringify({ sid: s.id, eid: c.esquemas[0].id, e: e.id, p: p.id, delta: n('Delta'), bravo: n('Bravo'), alfa: n('Alfa'), charlie: n('Charlie'), fox: n('Foxtrot'), eco: n('Eco') });`));
    const ordenEscenas = () => js(`return JSON.stringify(${D}.notasDe('${ids.sid}', '${ids.e}').map(x => x.titulo));`);
    comprobar('el orden manual del segmento es el de creación', await ordenEscenas() === '["Delta","Bravo","Alfa","Charlie"]', await ordenEscenas());
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    comprobar('la biblioteca, a la vista', await hasta(`return document.body.classList.contains('vista-documentos') && !!${tarjeta(ids.alfa)};`));

    /* ---------- a) un clic abre la ventana; el doble clic, el editor; «Contraer» la devuelve ---------- */
    await aClic(tarjeta(ids.alfa));
    comprobar('a) un clic en una tarjeta abre su ventana (la capa, a la vista)', await abierta() && await enVentana() === 'Alfa', await enVentana());
    comprobar('a) con el documento y su formato: el título es un <h2> y la lista, una lista', await js(`const c = ${CAPA}.querySelector('[data-gd-lado-texto]');
      const h = c.querySelector('h2'), li = c.querySelectorAll('ul > li');
      return !!h && h.textContent === 'Plan' && li.length === 2 && li[0].textContent === 'primero' && getComputedStyle(li[0]).display === 'list-item' && parseFloat(getComputedStyle(h).fontSize) > parseFloat(getComputedStyle(c.querySelector('p')).fontSize);`));
    comprobar('a) el cuerpo lo sabe (con-ventana) y nada de la ventana lleva data-nota', await js(`return document.body.classList.contains('con-ventana') && !${CAPA}.querySelector('[data-nota]');`));
    await espera(450);
    await clic(FONDO, { tras: 300 });
    comprobar('b) un clic en el fondo (pasados 350 ms) la cierra', !(await abierta()));
    /* el doble clic en la tarjeta: al editor */
    await dobleClic(await centro(tarjeta(ids.charlie)), 600);
    comprobar('a) el doble clic en una tarjeta la abre en el editor', await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${ids.charlie}';`, 4000) && !(await abierta()),
      await js(`return JSON.stringify({ abierta: ${G}.notaAbierta(), clase: document.body.className });`));
    await hasta(`return !!document.querySelector('#migas [data-gd-contraer-nota]');`, 3000);
    await aClic(`document.querySelector('#migas [data-gd-contraer-nota]')`, { tras: 400 });
    comprobar('a) «Contraer» en la cabecera del editor la devuelve a su ventana', await abierta() && await enVentana() === 'Charlie' && !(await js(`return document.body.classList.contains('nota-abierta');`)),
      await js(`return JSON.stringify({ tit: ${CAPA}.querySelector('[data-gd-lado-titulo]').value, clase: document.body.className });`));

    /* ---------- b) cerrar, navegar, «＋», escribir, recordar dónde se dejó ---------- */
    await espera(400);
    await aClic(`${CAPA}.querySelector('.gd-modal-cab .spacer')`);
    await aClic(`${CAPA}.querySelector('.gd-modal-titulo')`);
    comprobar('b) un clic dentro de la ventana no la cierra', await abierta());
    await tecla('Escape');
    comprobar('b) Esc la cierra', !(await abierta()));
    await aClic(tarjeta(ids.delta));
    await aClic(`${CAPA}.querySelector('[data-gd-lado-cerrar]')`);
    comprobar('b) × la cierra', !(await abierta()));
    await aClic(tarjeta(ids.delta));
    comprobar('b) ‹ n/N ›: la primera del segmento es «1/4» y ‹ va apagada', await posNav() === '1/4' && await js(`return ${CAPA}.querySelector('[data-gd-nota-mover="-1"]').disabled;`), await posNav());
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`);
    comprobar('b) › pasa a la siguiente: «Bravo», «2/4»', await enVentana() === 'Bravo' && await posNav() === '2/4', (await enVentana()) + ' ' + (await posNav()));
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`);
    comprobar('b) y otra: «Alfa», «3/4»', await enVentana() === 'Alfa' && await posNav() === '3/4', (await enVentana()) + ' ' + (await posNav()));
    /* dónde se deja una nota: el desplazamiento (la rueda) y el cursor (un clic en un párrafo) */
    const hoja = await centro(`${CAPA}.querySelector('.gd-modal-hoja')`, { sinTraer: true });
    ev({ type: 'mouseMove', x: R(hoja.x), y: R(hoja.y) }); await espera(40);
    for (let i = 0; i < 4; i++) { ev({ type: 'mouseWheel', x: R(hoja.x), y: R(hoja.y), deltaX: 0, deltaY: -150, canScroll: true }); await espera(40); }
    await espera(300);
    const scroll0 = await js(`return ${CAPA}.querySelector('.gd-modal-hoja').scrollTop;`);
    /* el párrafo que queda en medio de la ventana, y un clic en una de sus palabras */
    const enMedio = await js(`const h = ${CAPA}.querySelector('.gd-modal-hoja').getBoundingClientRect(), x = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
      const p = x && x.closest('p'); if (!p) return null; p.dataset.pruebaMedio = '1'; return p.textContent.slice(0, 12);`);
    const pMedio = enMedio && await palabra(`${CAPA}.querySelector('[data-prueba-medio]')`, 'nota larga');
    await js(`const p = ${CAPA}.querySelector('[data-prueba-medio]'); if (p) delete p.dataset.pruebaMedio; return true;`);
    if (pMedio) await clic(pMedio, { tras: 250 });
    const cursor0 = await js(`const s = getSelection(), n = s.anchorNode, p = n && (n.nodeType === 3 ? n.parentElement : n).closest('p'); return p ? p.textContent.slice(0, 12) + '@' + s.anchorOffset : '';`);
    const scroll1 = await js(`return ${CAPA}.querySelector('.gd-modal-hoja').scrollTop;`);
    comprobar('b) la rueda desplaza la ventana y un clic deja el cursor en un párrafo', scroll0 > 200 && !!enMedio && cursor0.startsWith(enMedio + '@'), scroll0 + ' ' + enMedio + ' ' + cursor0);
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`);
    comprobar('b) en la última del segmento, «＋» en lugar de ›: «4/4»', await enVentana() === 'Charlie' && await posNav() === '4/4' && await js(`return !!${CAPA}.querySelector('[data-gd-nota-nueva]') && !${CAPA}.querySelector('[data-gd-nota-mover="1"]');`), await posNav());
    comprobar('b) una nota abre arriba del todo', await js(`return ${CAPA}.querySelector('.gd-modal-hoja').scrollTop;`) === 0);
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="-1"]')`, { tras: 350 });
    const vuelta = await js(`const s = getSelection(), n = s.anchorNode, p = n && (n.nodeType === 3 ? n.parentElement : n).closest('p');
      return JSON.stringify({ tit: ${CAPA}.querySelector('[data-gd-lado-titulo]').value, scroll: ${CAPA}.querySelector('.gd-modal-hoja').scrollTop, cursor: p ? p.textContent.slice(0, 12) + '@' + s.anchorOffset : '', foco: ${CAPA}.querySelector('[data-gd-lado-texto]').contains(document.activeElement) || document.activeElement === ${CAPA}.querySelector('[data-gd-lado-texto]') });`);
    const v = JSON.parse(vuelta);
    comprobar('b) al volver a una nota, su desplazamiento y su cursor están donde se dejaron', v.tit === 'Alfa' && Math.abs(v.scroll - scroll1) <= 2 && v.cursor === cursor0 && v.foco, vuelta + ' antes: ' + scroll1 + ' ' + cursor0);
    /* escribir en el campo, con teclas de verdad: llega a la nota */
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`);
    const fin = await palabra(`${CAPA}.querySelector('[data-gd-lado-texto] p')`, 'azul.');
    await clic({ x: fin.x + 40, y: fin.y }, { tras: 150 });
    await tecla('End');
    await escribir(' Y algo escrito');
    const t0 = Date.now();
    const llego = await hasta(`return /algo escrito/.test(${D}.nota('${ids.charlie}').html);`, 2000);
    comprobar('b) lo escrito en el campo (teclas de verdad) llega a la nota enseguida', llego && Date.now() - t0 < 1200, await js(`return ${D}.nota('${ids.charlie}').html;`));
    /* «＋»: una nota nueva al final del segmento, con el nombre elegido */
    const antesN = await js(`return ${D}.notasDe('${ids.sid}', '${ids.e}').length;`);
    await aClic(`${CAPA}.querySelector('[data-gd-nota-nueva]')`, { tras: 350 });
    const nueva = JSON.parse(await js(`const xs = ${D}.notasDe('${ids.sid}', '${ids.e}'), t = ${CAPA}.querySelector('[data-gd-lado-titulo]');
      return JSON.stringify({ n: xs.length, ultima: xs[xs.length - 1].titulo, id: xs[xs.length - 1].id, foco: document.activeElement === t, sel: t.selectionStart === 0 && t.selectionEnd === t.value.length && t.value.length > 0, pos: (${CAPA}.querySelector('.gd-nav-pos') || {}).textContent });`));
    comprobar('b) «＋» crea una nota al final del segmento, abierta con el nombre elegido', nueva.n === antesN + 1 && nueva.foco && nueva.sel && nueva.pos === '5/5' && await abierta(), JSON.stringify(nueva));
    await escribir('Golf');
    await tecla('Enter', [], 200);
    comprobar('b) se escribe el nombre y Enter lo pone', await js(`return ${D}.nota('${nueva.id}').titulo;`) === 'Golf' && await abierta() && await js(`return !!${CAPA}.querySelector('[data-gd-lado-texto]').contains(document.activeElement) || document.activeElement === ${CAPA}.querySelector('[data-gd-lado-texto]');`),
      await js(`return ${D}.nota('${nueva.id}').titulo + ' ' + (document.activeElement && document.activeElement.className);`));
    comprobar('b) y su tarjeta, en la biblioteca, al final de su segmento', await js(`const xs = [...document.querySelectorAll('#gdMain .gd-etq[data-etq="${ids.e}"] .gd-nota > span:first-child')].map(x => x.textContent); return xs[xs.length - 1] === 'Golf';`));

    /* ---------- c) el color, el ⋯ y la papelera de la ventana ---------- */
    await cerrarSiAbierta();
    await aClic(tarjeta(ids.delta));
    await aClic(`${CAPA}.querySelector('[data-gd-lado-color]')`);
    const encima = sel => js(`const p = document.querySelector('.gd-pop'); if (!p) return false; const b = p.getBoundingClientRect(), x = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!x && p.contains(x) && !!p.querySelector('${sel}');`);
    comprobar('c) el color de la ventana abre la paleta encima de ella', await encima('.gd-paleta'));
    await aClic(`[...document.querySelectorAll('.gd-pop .gd-paleta button')].find(b => b.title === 'Violeta')`);
    comprobar('c) elegir un tono lo aplica y la ventana sigue abierta', await js(`return ${D}.nota('${ids.delta}').color;`) === 'violeta' && await abierta()
      && await js(`return ${CAPA}.querySelector('.gd-modal').classList.contains('con-color') && !document.querySelector('.gd-pop');`), await js(`return ${D}.nota('${ids.delta}').color;`));
    await aClic(`${CAPA}.querySelector('[data-gd-menu="nota"]')`);
    comprobar('c) el ⋯ de la ventana abre su menú encima de ella', await encima('button'));
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent === 'Color…')`);
    comprobar('c) su «Color…» abre la paleta encima', await encima('.gd-paleta') && await abierta());
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent === 'Sin color')`);
    comprobar('c) y quitar el color desde ahí no cierra la ventana', await js(`return ${D}.nota('${ids.delta}').color == null;`) && await abierta());
    await aClic(`${CAPA}.querySelector('[data-gd-lado-tirar]')`, { tras: 300 });
    comprobar('c) la papelera pregunta (#dlg) y la ventana sigue abierta detrás', await js(`return document.getElementById('dlg').open;`) && await abierta());
    await aClic(`document.getElementById('dlgCancel')`, { tras: 300 });
    comprobar('c) «Cancelar» no tira nada ni cierra la ventana', await js(`return !document.getElementById('dlg').open && !!${D}.nota('${ids.delta}') && !${D}.enPapelera('${ids.delta}');`) && await abierta() && await enVentana() === 'Delta');

    /* ---------- h) tirar una nota de un segmento y «Deshacer» ---------- */
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`);            // «Bravo», la segunda del segmento
    const antesTirar = await ordenEscenas();
    await aClic(`${CAPA}.querySelector('[data-gd-lado-tirar]')`, { tras: 300 });
    await aClic(`document.getElementById('dlgOk')`, { tras: 400 });
    comprobar('c) confirmar la tira y cierra la ventana', await js(`return !!${D}.enPapelera('${ids.bravo}');`) && !(await abierta()));
    comprobar('h) el aviso lleva «Deshacer»', await js(`const a = document.getElementById('aviso'); return a.classList.contains('show') && !!a.querySelector('.aviso-accion');`));
    await aClic(`document.querySelector('#aviso .aviso-accion')`, { tras: 400 });
    comprobar('h) «Deshacer» la devuelve a su segmento y a su sitio', await js(`const n = ${D}.nota('${ids.bravo}'); return !!n && !${D}.enPapelera('${ids.bravo}') && n.etiquetaId === '${ids.e}';`) && await ordenEscenas() === antesTirar,
      (await ordenEscenas()) + ' / antes ' + antesTirar);
    comprobar('h) y su tarjeta vuelve a su sitio en la biblioteca', await js(`return JSON.stringify([...document.querySelectorAll('#gdMain .gd-etq[data-etq="${ids.e}"] .gd-nota > span:first-child')].map(x => x.textContent));`) === antesTirar);

    /* ---------- e) el formato en el campo de la ventana ---------- */
    await aClic(tarjeta(ids.delta));
    await espera(800);                                                             // pasado el doble clic de «al editor» (700 ms)
    const P0 = `${CAPA}.querySelector('[data-gd-lado-texto] p')`;
    await dobleClic(await palabra(P0, 'dos'));
    comprobar('e) el doble clic elige una palabra en el campo (y no lleva la nota al editor)', await js(`return getSelection().toString().trim();`) === 'dos' && await abierta());
    const pDos = await palabra(P0, 'dos');
    await clic(pDos, { boton: 'right', tras: 350 });
    comprobar('e) el clic derecho de verdad sobre lo elegido abre el menú de formato (barra y tonos)', await js(`const p = document.querySelector('.gd-pop'); return !!p && !!p.querySelector('.gd-fmt-barra') && p.querySelectorAll('.gd-fmt-tonos').length === 2;`) && await encima('.gd-fmt-barra'));
    await aClic(`document.querySelector('.gd-pop .gd-fmt-tonos button:nth-child(3)')`, { tras: 200 });
    comprobar('e) un tono de «Resaltar» deja el fondo en la nota', await hasta(`return /<span style="background-color[^"]*">dos<\\/span>/.test(${D}.nota('${ids.delta}').html);`, 2000), await js(`return ${D}.nota('${ids.delta}').html;`));
    await dobleClic(await palabra(P0, 'cuatro'));
    await tecla('X', ['meta', 'shift'], 150);
    comprobar('e) Cmd+Shift+X tacha (<strike>)', await hasta(`return /<strike>cuatro<\\/strike>/.test(${D}.nota('${ids.delta}').html);`, 2000), await js(`return ${D}.nota('${ids.delta}').html;`));
    await dobleClic(await palabra(P0, 'seis'));
    await tecla('E', ['meta'], 150);
    comprobar('e) Cmd+E, código (<code>)', await hasta(`return /<code>seis<\\/code>/.test(${D}.nota('${ids.delta}').html);`, 2000), await js(`return ${D}.nota('${ids.delta}').html;`));
    await dobleClic(await palabra(P0, 'ocho'));
    await tecla('K', ['meta'], 250);
    comprobar('e) Cmd+K abre el cuadro del enlace con el foco en la dirección', await js(`const f = document.querySelector('.gd-enlace-cuadro'); return !!f && document.activeElement === f.elements.url && f.elements.texto.value === 'ocho';`));
    await escribir('https://ejemplo.com/faro');
    await tecla('Enter', [], 300);
    comprobar('e) al añadir la dirección queda un <a href>', await hasta(`return /<a href="https:\\/\\/ejemplo\\.com\\/faro">ocho<\\/a>/.test(${D}.nota('${ids.delta}').html);`, 2000) && !(await js(`return !!document.querySelector('.gd-enlace-cuadro');`)), await js(`return ${D}.nota('${ids.delta}').html;`));
    /* un enlace sin nada elegido (Cmd+K con el cursor en un párrafo nuevo): el caso del \u200B */
    await clic(await palabra(P0, 'siete'), { tras: 120 });
    await tecla('End'); await tecla('Enter', [], 150);
    await escribir('ver ');
    comprobar('e) Enter al final abre un párrafo nuevo en el campo', await js(`const ps = ${CAPA}.querySelectorAll('[data-gd-lado-texto] p'); return ps.length === 2 && ps[1].textContent.replace(/\\u200B/g, '').replace(/\\u00a0/g, ' ').trim() === 'ver';`),
      await js(`return ${CAPA}.querySelector('[data-gd-lado-texto]').innerHTML;`));
    await tecla('K', ['meta'], 250);
    comprobar('e) Cmd+K sin nada elegido: el cuadro, vacío y con el foco en la dirección', await js(`const f = document.querySelector('.gd-enlace-cuadro'); return !!f && document.activeElement === f.elements.url && !f.elements.url.value && !f.elements.texto.value;`));
    await escribir('https://b.org'); await tecla('Enter', [], 300);
    await escribir(' y fin');
    await espera(700);
    comprobar('e) queda el enlace con su dirección de texto, se sigue escribiendo detrás y ningún \\u200B en el html guardado', await js(`const h = ${D}.nota('${ids.delta}').html; return /<a href="https:\\/\\/b\\.org">https:\\/\\/b\\.org<\\/a>( |&nbsp;)y fin<\\/p>/.test(h) && !/\\u200B/.test(h);`), await js(`return JSON.stringify(${D}.nota('${ids.delta}').html);`));
    await cerrarSiAbierta();

    /* ---------- d) filtrar y ordenar, buscar ---------- */
    const titulosSeg = etq => js(`return [...document.querySelectorAll('#gdMain .gd-etq[data-etq="${etq}"] .gd-nota:not([hidden]) > span:first-child')].map(x => x.textContent).join(',');`);
    const cuentaSeg = etq => js(`const c = document.querySelector('#gdMain .gd-etq[data-etq="${etq}"] .gd-cuenta'); return c ? c.textContent : '';`);
    await aClic(`document.querySelector('#gdMain [data-gd-menu="ordenBib"]')`);
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /^Por título/.test(b.textContent))`, { tras: 300 });
    comprobar('d) el orden general «Por título» ordena las tarjetas de cada segmento', await titulosSeg(ids.e) === 'Alfa,Bravo,Charlie,Delta,Golf' && await titulosSeg(ids.p) === 'Eco,Foxtrot'
      && await js(`return document.querySelector('#gdMain .gd-etq[data-etq="${ids.e}"] .gd-etq-body').classList.contains('ordenada');`), (await titulosSeg(ids.e)) + ' | ' + (await titulosSeg(ids.p)));
    comprobar('d) y no cambia el orden manual guardado', await ordenEscenas() === '["Delta","Bravo","Alfa","Charlie","Golf"]', await ordenEscenas());
    await aClic(`document.querySelector('#gdMain [data-gd-menu="colorBib"]')`);
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /^Rojo/.test(b.textContent))`, { tras: 300 });
    comprobar('d) el color general rojo deja «1/5» en Escenas (y «0/2» en Personas)', await cuentaSeg(ids.e) === '1/5' && await titulosSeg(ids.e) === 'Bravo' && await cuentaSeg(ids.p) === '0/2', (await cuentaSeg(ids.e)) + ' ' + (await titulosSeg(ids.e)) + ' ' + (await cuentaSeg(ids.p)));
    /* el segmento expandido: el filtro heredado, y el suyo */
    await aClic(`document.querySelector('#gdMain .gd-etq[data-etq="${ids.e}"] [data-gd-expandir]')`, { tras: 400 });
    comprobar('d) en el segmento expandido, el filtro de la biblioteca sale heredado (.heredado)', await js(`const b = document.querySelector('#gdMain [data-gd-menu="colorSeg"]'); return !!b && b.classList.contains('heredado') && document.querySelectorAll('#gdMain .gd-exp-nota[data-nota]').length === 1;`));
    await aClic(`document.querySelector('#gdMain [data-gd-menu="colorSeg"]')`);
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent === 'Todas las notas')`, { tras: 400 });
    const expTit = () => js(`return [...document.querySelectorAll('#gdMain .gd-exp-nota[data-nota] .gd-exp-tit')].map(x => x.textContent).join(',');`);
    comprobar('d) «Todas las notas» en el segmento las enseña todas ahí (con el orden heredado)', await expTit() === 'Alfa,Bravo,Charlie,Delta,Golf'
      && !(await js(`return document.querySelector('#gdMain [data-gd-menu="colorSeg"]').classList.contains('heredado');`)) && await js(`return document.querySelector('#gdMain [data-gd-menu="ordenSeg"]').classList.contains('heredado');`), await expTit());
    await aClic(`document.querySelector('#gdMain .gd-exp-banda [data-gd-contraer]')`, { tras: 400 });
    comprobar('d) y la biblioteca sigue filtrada', await cuentaSeg(ids.e) === '1/5' && await titulosSeg(ids.e) === 'Bravo', (await cuentaSeg(ids.e)) + ' ' + (await titulosSeg(ids.e)));
    /* recargar la ventana: los filtros se recuerdan */
    await espera(600);
    win.webContents.reload();
    await new Promise(res => win.webContents.once('did-finish-load', res));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.abiertoId());`, 8000);
    await hasta(`return !!document.querySelector('#gdMain .gd-etq[data-etq="${ids.e}"]');`, 6000);
    if (!(await js(`return !!document.querySelector('#gdMain .gd-etq[data-etq="${ids.e}"]') && document.body.classList.contains('vista-documentos');`))) { await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`); }
    comprobar('d) tras recargar, la biblioteca sigue filtrada y ordenada', await cuentaSeg(ids.e) === '1/5' && await titulosSeg(ids.e) === 'Bravo'
      && await js(`return /Por título/.test(document.querySelector('#gdMain [data-gd-menu="ordenBib"]').textContent);`), (await cuentaSeg(ids.e)) + ' ' + (await titulosSeg(ids.e)));
    await aClic(`document.querySelector('#gdMain .gd-etq[data-etq="${ids.e}"] [data-gd-expandir]')`, { tras: 400 });
    comprobar('d) y el segmento expandido recuerda el suyo', await expTit() === 'Alfa,Bravo,Charlie,Delta,Golf', await expTit());
    await aClic(`document.querySelector('#gdMain .gd-exp-banda [data-gd-contraer]')`, { tras: 400 });
    await aClic(`document.querySelector('#gdMain [data-gd-quitar-color-bib]')`, { tras: 300 });
    comprobar('d) quitar el color general las vuelve a enseñar', await cuentaSeg(ids.e) === '5');
    /* buscar */
    await aClic(`document.querySelector('#gdMain [data-gd-buscar-vista]')`);
    await escribir('eco');
    await espera(250);
    const cuentaB = await js(`return document.querySelector('#gdMain .gd-buscar-cuenta').textContent;`);
    comprobar('d) buscar esconde las que no casan y dice «n de N»', cuentaB === '1 de 7' && await titulosSeg(ids.p) === 'Eco' && await titulosSeg(ids.e) === '', cuentaB + ' | ' + (await titulosSeg(ids.p)) + ' | ' + (await titulosSeg(ids.e)));
    await tecla('Enter', [], 300);
    comprobar('d) Enter abre la primera que casa en su ventana', await abierta() && await enVentana() === 'Eco');
    await tecla('Escape', [], 200);
    await aClic(`document.querySelector('#gdMain [data-gd-buscar-vista]')`);
    await tecla('Escape', [], 200);
    comprobar('d) Esc en la caja la limpia', await js(`return document.querySelector('#gdMain [data-gd-buscar-vista]').value;`) === '' && await titulosSeg(ids.e) === 'Alfa,Bravo,Charlie,Delta,Golf');
    await tecla('Escape', [], 150);                                   // vacía, la deja
    await aClic(`document.querySelector('#gdMain .esq-cab .esq-titulo')`, { tras: 150 });
    await js(`if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return true;`);
    await tecla('F', ['meta'], 200);
    comprobar('d) Cmd+F con la biblioteca delante enfoca su caja de buscar', await js(`return document.activeElement === document.querySelector('#gdMain [data-gd-buscar-vista]');`));
    await tecla('Escape', [], 150);

    /* ---------- f) el esquema montado, con un nodo elegido: la ventana no lo toca ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(400); const m = Tramas.tablero.modelo(); m.asegurarCeldas(8);
      const l = m.datos.lineas[0].id; m.nuevoPunto(l, 2, { titulo: 'Uno' }); m.nuevoPunto(l, 4, { titulo: 'Dos' }); Tramas.tablero.render(); await W(300); return true;`);
    const nodo = await js(`return Tramas.tablero.modelo().datos.puntos.find(p => p.titulo === 'Uno').id;`);
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    /* al dejar el esquema se suelta lo elegido (el panel flotante se cierra): se elige con la biblioteca delante, como lo dejaría
       un enlace o Claude, para que Supr y las flechas tengan algo que tocar si llegaran al tablero */
    await js(`Tramas.tablero.ir({ tipo: 'punto', id: '${nodo}' }); await W(300); return true;`);
    const esqAntes = await js(`return JSON.stringify(Tramas.tablero.modelo().datos.puntos.map(p => [p.id, p.lineaId, Tramas.tablero.modelo().cg(p), p.titulo]));`);
    const selAntes = await js(`const s = Tramas.tablero.seleccion(); return s ? s.tipo + ':' + s.id : '';`);
    await aClic(tarjeta(ids.eco));
    for (const k of ['Delete', 'Backspace', 'Left', 'Right', 'Up', 'Down']) await tecla(k, [], 80);
    await tecla('Tab', [], 80); await tecla('Tab', [], 80);                    // el foco, en los botones de la cabecera
    const focoBoton = await js(`return document.activeElement && document.activeElement.tagName === 'BUTTON' && ${CAPA}.contains(document.activeElement);`);
    for (const k of ['Delete', 'Backspace', 'Left', 'Right']) await tecla(k, [], 80);
    await espera(300);
    const esqDespues = await js(`return JSON.stringify(Tramas.tablero.modelo().datos.puntos.map(p => [p.id, p.lineaId, Tramas.tablero.modelo().cg(p), p.titulo]));`);
    const selDespues = await js(`const s = Tramas.tablero.seleccion(); return s ? s.tipo + ':' + s.id : '';`);
    const dlg = await js(`return document.getElementById('dlg').open;`);
    comprobar('f) con un nodo elegido en el esquema montado, Supr y las flechas en la ventana (y en sus botones) no lo tocan', selAntes === 'punto:' + nodo && focoBoton && esqDespues === esqAntes && selDespues === selAntes && !dlg
      && await abierta() && await js(`return !!${D}.nota('${ids.eco}') && document.body.classList.contains('vista-documentos');`),
      JSON.stringify({ selAntes, selDespues, dlg, focoBoton, esqAntes, esqDespues }));
    await cerrarSiAbierta();

    /* ---------- g) otra pestaña y otra vista con la ventana abierta ---------- */
    await aClic(tarjeta(ids.charlie));
    const pest0 = await js(`return Claquedraw.app.pestanas().activa;`);
    await js(`Claquedraw.app.abrirEnPestana({ tipo: 'esquema', id: '${ids.eid}' }); await W(600); return true;`);
    comprobar('g) otra pestaña (el esquema): la ventana se cierra', !(await abierta()) && await js(`return Claquedraw.app.pestanas().activa !== '${pest0}';`));
    await js(`Claquedraw.app.cambiarPestana('${pest0}'); await W(700); return true;`);
    comprobar('g) al volver a la pestaña, la ventana se reabre con la misma nota', await hasta(`const c = ${CAPA}; return !!c && !c.hidden && c.querySelector('[data-gd-lado-titulo]').value === 'Charlie';`, 3000), await enVentana());
    await tecla('G', ['meta', 'shift'], 900);
    comprobar('g) Cmd+Shift+G (otra vista) la cierra', !(await abierta()) && !(await js(`return document.body.classList.contains('vista-documentos');`)));
    const focoTrasG = await js(`const a = document.activeElement; return a ? a.tagName + (a.id ? '#' + a.id : '') : '';`);
    await tecla('F', ['meta', 'shift'], 700);
    const conF = await js(`return document.body.classList.contains('vista-documentos');`);
    if (!conF) {
      console.log('      (Cmd+Shift+F con el foco en ' + focoTrasG + ' no cambió de vista; se prueba con el foco en la página)');
      await js(`const f = document.getElementById('editorMarco'); if (f && f.contentWindow) f.contentWindow.document.activeElement && f.contentWindow.document.activeElement.blur(); document.activeElement && document.activeElement.blur(); return true;`);
      await tecla('F', ['meta', 'shift'], 700);
    }
    comprobar('g) Cmd+Shift+F desde el editor de la vista Texto (el foco en ' + focoTrasG + ') vuelve a la biblioteca', conF);
    comprobar('g) y Cmd+Shift+F, al volver, la reabre', await hasta(`const c = ${CAPA}; return document.body.classList.contains('vista-documentos') && !!c && !c.hidden && c.querySelector('[data-gd-lado-titulo]').value === 'Charlie';`, 3000), await enVentana());
    await cerrarSiAbierta();

    /* ---------- j) el doble clic lleva al editor solo si la ventana se abrió con un clic en su tarjeta (revisión [1]) ----------
       Dos clics rápidos en › o en «＋»: Chromium (Electron 36) no da el dblclick si el botón se repintó entre los dos clics
       (comprobado aparte), así que ahí se mira el resultado; el doble clic que sí llega es el de una palabra del campo o del
       título en los 700 ms siguientes a navegar o a «＋», que antes también la llevaba al editor. */
    const CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
    const conEditor = () => js(`return document.body.classList.contains('nota-abierta');`);
    /* cuántos dblclick llegan (si no llega ninguno, la comprobación no probaría nada) */
    await js(`window.__dobles = 0; if (!window.__oyeDobles) { window.__oyeDobles = true; document.addEventListener('dblclick', () => { window.__dobles++; }, true); } return true;`);
    const dobles = () => js(`const n = window.__dobles; window.__dobles = 0; return n;`);
    await aClic(tarjeta(ids.alfa));
    await espera(800);                                                             // pasado el doble clic de la tarjeta (700 ms)
    const pos1 = await posNav();
    await dobleClic(await centro(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`), 600);
    comprobar('j) dos clics rápidos en › saltan dos notas («Charlie», «3/5») y no la llevan al editor', pos1 === '1/5' && await enVentana() === 'Charlie' && await posNav() === '3/5' && await abierta() && !(await conEditor()),
      JSON.stringify({ pos1, tit: await enVentana(), pos: await posNav(), editor: await conEditor() }));
    /* › y, enseguida, doble clic en una palabra del campo */
    await dobles();
    const tNav = Date.now();
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`, { tras: 40 });
    await dobleClic(await palabra(P0, 'tres'), 0);
    const msNav = Date.now() - tNav, doblesNav = await dobles();
    await espera(400);
    comprobar('j) tras ›, un doble clic en una palabra del campo (antes de 700 ms) la elige y no lleva la nota al editor', doblesNav >= 1 && msNav < 700 && await enVentana() === 'Delta' && await abierta() && !(await conEditor())
      && await js(`return getSelection().toString().trim();`) === 'tres', JSON.stringify({ doblesNav, msNav, tit: await enVentana(), editor: await conEditor(), sel: await js(`return getSelection().toString();`) }));
    await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`, { tras: 450 });
    const antesMas = JSON.parse(await js(`return JSON.stringify(${D}.notasDe('${ids.sid}', '${ids.e}').map(x => x.id));`));
    const enUltima = await posNav();
    await dobleClic(await centro(`${CAPA}.querySelector('[data-gd-nota-nueva]')`), 0);
    const tMas = Date.now();
    const trasMas = JSON.parse(await js(`return JSON.stringify(${D}.notasDe('${ids.sid}', '${ids.e}').map(x => x.id));`));
    /* y, enseguida, doble clic en el nombre (elegido para escribir encima) de la segunda */
    await dobles();
    await dobleClic(await centro(`${CAPA}.querySelector('[data-gd-lado-titulo]')`, { dx: '20' }), 0);
    const msMas = Date.now() - tMas, doblesMas = await dobles();
    await espera(400);
    comprobar('j) dos clics rápidos en «＋» crean dos notas; la segunda sigue en su ventana, también con un doble clic en su nombre enseguida',
      doblesMas >= 1 && msMas < 700 && enUltima === '5/5' && trasMas.length === antesMas.length + 2 && await abierta() && !(await conEditor()) && await posNav() === '7/7',
      JSON.stringify({ doblesMas, msMas, enUltima, antes: antesMas.length, despues: trasMas.length, pos: await posNav(), editor: await conEditor() }));
    await cerrarSiAbierta();
    if (await conEditor()) await js(`${G}.cerrarNota(); await W(200); return true;`);
    await js(`const d = ${D}; ${JSON.stringify(trasMas.filter(x => !antesMas.includes(x)))}.forEach(id => { d.tirarNota(id); d.eliminarDefinitivo(id); }); ${G}.render(); await W(300); return true;`);

    /* ---------- k) «Modificadas recientemente»: escribir en una nota y › no vuelve a la de antes (revisión [5]) ---------- */
    await aClic(`document.querySelector('#gdMain [data-gd-menu="ordenBib"]')`);
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /^Modificadas recientemente/.test(b.textContent))`, { tras: 400 });
    const visto = JSON.parse(await js(`return JSON.stringify([...document.querySelectorAll('#gdMain .gd-etq[data-etq="${ids.e}"] .gd-nota:not([hidden])')].map(x => x.dataset.nota));`));
    const titDe = id => js(`return ${D}.nota('${id}').titulo;`);
    const L = []; for (const id of visto) L.push(await titDe(id));
    await aClic(tarjeta(visto[0]));
    const visitadas = [await enVentana()], posiciones = [await posNav()];
    for (let i = 0; i < visto.length - 1; i++) {
      /* un clic en el primer bloque del campo (o en el campo, si está vacío), al final y unas letras: la nota se guarda (sube) */
      await aClic(`(() => { const c = ${CAMPO}; return c.firstElementChild || c; })()`, { dx: '6', dy: 'Math.min(b.height / 2, 12)', tras: 150 });
      await tecla('End');
      await escribir(' vuelta');
      await espera(550);
      await aClic(`${CAPA}.querySelector('[data-gd-nota-mover="1"]')`, { tras: 350 });
      visitadas.push(await enVentana()); posiciones.push(await posNav());
    }
    const primeraAhora = await js(`const xs = ${D}.notasDe('${ids.sid}', '${ids.e}').slice().sort((a, b) => (b.modificado || 0) - (a.modificado || 0)); return xs[0].titulo;`);
    comprobar('k) con «Modificadas recientemente», escribir en cada nota y pulsar › recorre todas en el orden de las tarjetas, sin volver a la anterior',
      visto.length === 5 && visitadas.join(',') === L.join(',') && posiciones.join(',') === '1/5,2/5,3/5,4/5,5/5' && primeraAhora === L[L.length - 2] && primeraAhora !== L[0],
      JSON.stringify({ tarjetas: L, visitadas, posiciones, primeraAhora }));
    comprobar('k) y lo escrito llegó a cada una', await js(`return ${JSON.stringify(visto.slice(0, -1))}.every(id => /vuelta/.test(${D}.nota(id).html));`));
    await cerrarSiAbierta();
    await aClic(`document.querySelector('#gdMain [data-gd-menu="ordenBib"]')`);
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /^Cada segmento/.test(b.textContent))`, { tras: 400 });

    /* ---------- l) buscar con una sección contraída: ni la cuenta ni Enter la tienen en cuenta (revisión [6]) ---------- */
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_seccion', ref: 's', nombre: 'Lugares y cosas' },
      { op: 'crear_segmento', ref: 'l', nombre: 'Lugares', color: 'Teal', seccion: '$s' },
      { op: 'crear_nota', segmento: '$l', titulo: 'Faro', contenido: 'Un faro de zafiro.' },
      { op: 'crear_nota', segmento: 'Personas', titulo: 'Hotel', contenido: 'Tiene una ventana de zafiro.' }] });
    comprobar('l) Claude crea otra sección con una nota, y otra nota en la de partida', !r.error, r.texto);
    const faro = await js(`return (${D}.notasDe('${ids.sid}').find(x => x.titulo === 'Faro') || {}).id;`);
    await hasta(`return !!${tarjeta(faro)} && document.querySelectorAll('#gdMain .gd-bloque').length === 2;`, 3000);
    const BUSCAR = `document.querySelector('#gdMain [data-gd-buscar-vista]')`, CUENTA = `document.querySelector('#gdMain .gd-buscar-cuenta').textContent`;
    await aClic(BUSCAR);
    await escribir('zafiro');
    await espera(250);
    const cuentaDos = await js(`return ${CUENTA};`);
    await aClic(`document.querySelector('#gdMain [data-gd-plegar-seccion="segmentos"]')`, { tras: 300 });
    const plegada = await js(`const b = document.querySelector('#gdMain .gd-bloque[data-seccion="segmentos"]'); return JSON.stringify({ plegada: b.classList.contains('plegada'), marca: b.classList.contains('con-coincidencias') });`);
    const cuentaUna = await js(`return ${CUENTA};`);
    comprobar('l) con «Segmentos» contraída, la cuenta ya no cuenta sus notas («2 de N» → «1 de N») y la sección dice que hay algo',
      /^2 de \d+$/.test(cuentaDos) && /^1 de \d+$/.test(cuentaUna) && cuentaDos.split(' de ')[1] === cuentaUna.split(' de ')[1] && plegada === '{"plegada":true,"marca":true}', cuentaDos + ' → ' + cuentaUna + ' ' + plegada);
    await aClic(BUSCAR);
    await tecla('Enter', [], 350);
    comprobar('l) Enter abre la que se ve («Faro»), no la de la sección contraída («Hotel»)', await abierta() && await enVentana() === 'Faro', await enVentana());
    await tecla('Escape', [], 200);
    await aClic(BUSCAR); await tecla('Escape', [], 200); await tecla('Escape', [], 150);
    await aClic(`document.querySelector('#gdMain [data-gd-plegar-seccion="segmentos"]')`, { tras: 300 });
    comprobar('l) desplegada otra vez y sin búsqueda', await js(`return !document.querySelector('#gdMain .gd-bloque[data-seccion="segmentos"]').classList.contains('plegada') && !${BUSCAR}.value;`));

    /* ---------- m) Esc en el menú del clic derecho y en el cuadro del enlace: el foco y lo elegido, al campo (revisión [15]) ---------- */
    await aClic(tarjeta(ids.delta));
    await espera(800);
    const enCampo = `(document.activeElement === ${CAMPO})`;
    await dobleClic(await palabra(P0, 'cinco'));
    await clic(await palabra(P0, 'cinco'), { boton: 'right', tras: 350 });
    const menuAbierto = await js(`return !!document.querySelector('.gd-pop .gd-fmt-barra');`);
    await tecla('Escape', [], 200);
    const trasEsc = await js(`return JSON.stringify({ pop: !!document.querySelector('.gd-pop'), foco: ${enCampo}, sel: getSelection().toString().trim() });`);
    comprobar('m) Esc en el menú del clic derecho lo cierra y devuelve el foco al campo con la palabra elegida', menuAbierto && trasEsc === '{"pop":false,"foco":true,"sel":"cinco"}' && await abierta(), menuAbierto + ' ' + trasEsc);
    await escribir('quince');
    await espera(600);
    comprobar('m) y lo que se teclea después entra en la nota, en su sitio', await js(`const h = ${D}.nota('${ids.delta}').html; return /quince/.test(h) && !/cinco/.test(h);`), await js(`return ${D}.nota('${ids.delta}').html;`));
    await dobleClic(await palabra(P0, 'tres'));
    await tecla('K', ['meta'], 300);
    const cuadro = await js(`const f = document.querySelector('.gd-enlace-cuadro'); return !!f && document.activeElement === f.elements.url;`);
    await tecla('Escape', [], 200);
    const trasEscK = await js(`return JSON.stringify({ cuadro: !!document.querySelector('.gd-enlace-cuadro'), foco: ${enCampo}, sel: getSelection().toString().trim() });`);
    comprobar('m) Esc en el cuadro del enlace lo cierra y devuelve el foco al campo con la palabra elegida', cuadro && trasEscK === '{"cuadro":false,"foco":true,"sel":"tres"}' && await abierta(), cuadro + ' ' + trasEscK);
    await escribir('trece');
    await espera(600);
    comprobar('m) y lo que se teclea después entra en la nota', await js(`const h = ${D}.nota('${ids.delta}').html; return /trece/.test(h) && !/tres/.test(h);`), await js(`return ${D}.nota('${ids.delta}').html;`));
    await cerrarSiAbierta();

    /* ---------- n) Claude renombra la nota con el título enfocado: salir del título no devuelve el nombre viejo (revisión [0]) ---------- */
    await aClic(tarjeta(ids.eco));
    await espera(800);
    await aClic(`${CAPA}.querySelector('[data-gd-lado-titulo]')`, { tras: 200 });
    const titFoco = await js(`return document.activeElement === ${CAPA}.querySelector('[data-gd-lado-titulo]');`);
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [{ op: 'editar_nota', nota: ids.eco, titulo: 'Eco de Claude' }] });
    const titAlDia = await hasta(`return ${D}.nota('${ids.eco}').titulo === 'Eco de Claude' && ${CAPA}.querySelector('[data-gd-lado-titulo]').value === 'Eco de Claude';`, 3000);
    comprobar('n) con el título enfocado, lo que Claude le pone se ve en el campo', !r.error && titFoco && titAlDia && await js(`return document.activeElement === ${CAPA}.querySelector('[data-gd-lado-titulo]');`),
      JSON.stringify({ error: r.error, titFoco, tit: await js(`return ${CAPA}.querySelector('[data-gd-lado-titulo]').value;`), modelo: await titDe(ids.eco) }));
    await clic(await palabra(`${CAMPO}.querySelector('p')`, 'personaje'), { tras: 500 });
    comprobar('n) y un clic en el documento (el título pierde el foco) no le devuelve el nombre viejo', await titDe(ids.eco) === 'Eco de Claude' && await enVentana() === 'Eco de Claude' && await js(`return ${enCampo};`),
      JSON.stringify({ modelo: await titDe(ids.eco), campo: await enVentana() }));
    await cerrarSiAbierta();

    /* ---------- o) Claude cambia el documento con el cursor en el campo: lo siguiente va donde estaba el cursor (revisión [4]) ---------- */
    await aClic(tarjeta(ids.fox));
    await espera(800);
    await clic(await palabra(`${CAMPO}.querySelector('p')`, 'personaje'), { tras: 150 });
    await tecla('Home'); await tecla('Right'); await tecla('Right', [], 150);
    const antesDelCursor = `(() => { const s = getSelection(), n = s.anchorNode; return n && n.nodeType === 3 ? n.nodeValue.slice(0, s.anchorOffset) : '#' + (n && n.nodeName) + '@' + s.anchorOffset; })()`;
    const cursorAntes = await js(`return ${antesDelCursor};`);
    r = await M.llamar('escribir_documento', { biblioteca: 'Ideas', nota: ids.fox, como: 'prosa', modo: 'anadir', contenido: 'Otro párrafo que añade Claude.' });
    const campoAlDia = await hasta(`return /añade Claude/.test(${CAMPO}.textContent);`, 3000);
    const cursorDespues = await js(`return JSON.stringify({ foco: ${enCampo}, antes: ${antesDelCursor} });`);
    comprobar('o) Claude añade un párrafo con el cursor en el campo: el campo se pone al día y el cursor sigue donde estaba', !r.error && cursorAntes === 'Un' && campoAlDia && cursorDespues === '{"foco":true,"antes":"Un"}',
      JSON.stringify({ error: r.error, texto: r.texto.slice(0, 200), cursorAntes, campoAlDia, cursorDespues }));
    await escribir('ZZ');
    await espera(600);
    comprobar('o) y lo siguiente que se teclea va ahí, no al principio del documento', await js(`const h = ${D}.nota('${ids.fox}').html; return /UnZZ personaje/.test(h) && /añade Claude/.test(h);`), await js(`return ${D}.nota('${ids.fox}').html;`));
    await cerrarSiAbierta();

    /* ---------- p) de una nota de la biblioteca X a la biblioteca Y por el árbol: Cmd+Shift+C copia Y (revisión [3]) ---------- */
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Otra' }] });
    const otra = await js(`return (${D}.datos.contenedores[0].subs.find(x => x.nombre === 'Otra') || {}).id;`);
    const filaOtra = `[...document.querySelectorAll('.gd-sub[data-sub]')].find(x => x.dataset.sub.endsWith('/${otra}'))`;
    await hasta(`return !!${filaOtra};`, 3000);
    await aClic(tarjeta(ids.delta));
    await aClic(`${CAPA}.querySelector('[data-gd-lado-abrir]')`, { tras: 400 });
    const enEditor = await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${ids.delta}';`, 3000);
    const marcadaAntes = await js(`return ${G}.notaMarcada();`);
    await aClic(filaOtra, { tras: 500 });
    const enOtra = await hasta(`const a = ${G}.subActual(); return !document.body.classList.contains('nota-abierta') && document.body.classList.contains('vista-documentos') && !!a && a.id === '${otra}';`, 3000);
    portapapeles = '';
    menuClaude('Copiar enlace para Claude').click();
    for (let i = 0; i < 30 && !portapapeles; i++) await espera(100);
    const copiadoOtra = portapapeles;
    comprobar('p) abierta una nota de «Ideas» en el editor y pulsada «Otra» en el árbol, Cmd+Shift+C copia la biblioteca «Otra», no la nota',
      !r.error && enEditor && marcadaAntes === ids.delta && enOtra && new RegExp('^\\[Biblioteca «Otra»\\]\\(clapcraft://[^/]+/biblioteca/' + otra + '\\)$').test(copiadoOtra) && !(await js(`return ${G}.notaMarcada();`)),
      JSON.stringify({ error: r.error, enEditor, marcadaAntes, enOtra, copiadoOtra }));

    /* ---------- q) Claude › «Ir al enlace copiado» de un segmento con la ventana abierta: la cierra y enseña el segmento (revisión [2]) ---------- */
    const proy = (/clapcraft:\/\/([^/]+)\//.exec(copiadoOtra) || [])[1] || 'los-segmentos';
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    await hasta(`return !!${tarjeta(ids.charlie)};`, 3000);
    await aClic(tarjeta(ids.charlie));
    const conVentana = await abierta() && await enVentana() === 'Charlie';
    portapapeles = 'clapcraft://' + proy + '/biblioteca/' + ids.sid + '/segmento/' + ids.e;
    menuClaude('Ir al enlace copiado').click();
    const alSegmento = await hasta(`const x = ${G}.expandidoActual(), g = document.querySelector('#gdMain .gd-exp'), c = ${CAPA};
      return !!x && x.subId === '${ids.sid}' && x.clave === 'etq:${ids.e}' && !!g && g.offsetParent !== null && (!c || c.hidden);`, 4000);
    const notasExp = await js(`const d = ${D}; const xs = [...document.querySelectorAll('#gdMain .gd-exp-nota[data-nota]')]; return xs.length > 0 && xs.every(x => d.nota(x.dataset.nota).etiquetaId === '${ids.e}');`);
    const encima2 = await js(`const g = document.querySelector('#gdMain .gd-exp-grid'); if (!g) return false; const b = g.getBoundingClientRect(), x = document.elementFromPoint(b.left + 30, b.top + 30); return !!x && g.contains(x);`);
    comprobar('q) Claude › «Ir al enlace copiado» de un segmento con la ventana abierta la cierra y el segmento expandido queda a la vista',
      conVentana && alSegmento && notasExp && encima2 && !(await abierta()), JSON.stringify({ conVentana, alSegmento, notasExp, encima2, abierta: await abierta(), exp: await js(`return JSON.stringify(${G}.expandidoActual());`) }));
    await aClic(`document.querySelector('#gdMain .gd-exp-banda [data-gd-contraer]')`, { tras: 400 });

    /* ---------- i) sin errores ---------- */
    comprobar('i) la página no soltó ningún error', !errores.length, errores.join(' | '));
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
