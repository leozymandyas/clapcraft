/* Prueba de la ventana de una nota (1.1.60, js/claquedraw/ventana.js) con la app de verdad (Electron):
   `./node_modules/.bin/electron pruebas/ventana-electron.js`.
   Leo: «Necesito que los bloques de prompt y avisos funcionen en el modal de texto, con uso del /. Además agrega las funcionalidades
   de zoom y typewriter que se tienen en ClapBook para estos modales», y «poder citar textos para mandarlos al asistente». Arranca
   electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos, **el portapapeles de mentira**: el de
   verdad es el de Leo; la IA no se llama nunca) y, con el ratón y el teclado de verdad (`webContents.sendInputEvent`, la ventana
   enfocada), comprueba:
   a) «/prompt» y «/info» en la ventana crean recuadros que vuelven al documento y se ven igual en el editor (⤢); uno envuelve el
      renglón con texto; Enter dentro, dos Enter para salir; los huecos del prompt realzados;
   b) el menú «/»: flechas, Esc y un clic fuera (quitan lo escrito), y los demás comandos (títulos, listas, cita, código,
      separador, tabla, imagen), cada uno como lo que es en el documento;
   c) el zoom del texto: botones, Cmd + − 0, el pellizco (Ctrl + rueda) anclado a la línea bajo el gesto, la longitud de línea, que
      se recuerda y que no toca el zoom del esquema;
   d) typewriter: centra la línea del cursor al moverlo y al escribir, y se apaga;
   e) citar en el asistente desde la ventana (clic derecho y Cmd+Shift+A) y desde el editor (clic derecho y Cmd+Shift+A): el chip de
      cita con el texto y el enlace de su tramo;
   f) la página no suelta ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ventana-'));
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
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function ok(nombre, v, detalle) {
  resultados.push({ nombre, ok: !!v });
  console.log((v ? '  ✔ ' : '  ✖ ') + nombre + (v || detalle === undefined ? '' : '\n      ' + String(detalle).slice(0, 1400)));
}
function mcp() {
  const p = spawn(process.execPath, [path.join(REPO, 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0;
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return { error: !!r.result.isError, texto: r.result.content[0].text }; };
  return { pedir, llamar, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}

function manos(win, errores) {
  win.webContents.on('console-message', ev => {
    const nivel = ev.level ?? ev.params?.level, msg = ev.message ?? ev.params?.message;
    if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); }
  });
  win.webContents.setBackgroundThrottling(false);
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ev = o => win.webContents.sendInputEvent(o);
  const R = Math.round;
  async function clic(p, op) {
    op = op || {}; const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30); ev({ type: 'mouseDown', x, y, button, clickCount: 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: 1, modifiers }); await espera(op.tras === undefined ? 300 : op.tras);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => /meta|cmd|control|alt/.test(m))) ev({ type: 'char', keyCode: k, modifiers });
    else if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 90 : tras);
  }
  async function escribir(t) {
    for (const ch of t) {
      const s = /^[a-z0-9 ]$/i.test(ch), mods = /[A-Z]/.test(ch) ? ['shift'] : [];
      if (s) ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      ev({ type: 'char', keyCode: ch, modifiers: mods });
      if (s) ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      await espera(30);
    }
    await espera(150);
  }
  const rueda = (x, y, dy, mods) => ev({ type: 'mouseWheel', x: R(x), y: R(y), deltaX: 0, deltaY: dy, modifiers: mods || [] });
  const centro = async expr => { const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); await W(60); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, r: b.right, t: b.top, b: b.bottom });`); return r ? JSON.parse(r) : null; };
  return { js, hasta, clic, tecla, escribir, centro, rueda, ev };
}

app.whenReady().then(async () => {
  const errores = [];
  let win = null;
  for (let i = 0; i < 200 && !win; i++) { await espera(50); win = BrowserWindow.getAllWindows().find(x => /claquedraw\.html/.test(x.webContents.getURL() || '')); }
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const { js, hasta, clic, tecla, escribir, centro, rueda, ev } = manos(win, errores);
  win.setBounds({ x: 40, y: 40, width: 1280, height: 900 }); win.show(); win.focus(); win.webContents.focus();
  await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
  console.log('\nClapCraft · prueba de la ventana de una nota en ' + TMP + '\n');
  const D = `Claquedraw.gestor.documentos()`, CAPA = `document.querySelector('.gd-modal-capa')`, CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
  const MENU = `document.querySelector('.vt-slash')`;
  const M = mcp();
  try {
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'La ventana', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas' }] });
    ok('Claude crea la biblioteca', !r.error, r.texto);
    const largo = Array.from({ length: 40 }, (_, i) => 'Párrafo ' + (i + 1) + ' de la nota larga, con texto de sobra para que la hoja de la ventana se desplace.').join('\n\n');
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_nota', titulo: 'Uno', contenido: 'Primera línea de la nota.\n\nSegunda línea, la que se cita en el asistente.' },
      { op: 'crear_nota', titulo: 'Larga', contenido: largo },
      { op: 'crear_nota', titulo: 'Listas', contenido: 'Intro.\n\n- uno\n- dos\n  - sub a\n  - sub b\n- tres\n\nFin.' }] });
    ok('y dos notas', !r.error, r.texto);
    await espera(500);
    const ids = JSON.parse(await js(`const d = ${D}, s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Ideas'); const n = t => d.notasDe(s.id).find(x => x.titulo === t).id; return JSON.stringify({ sid: s.id, uno: n('Uno'), larga: n('Larga'), listas: n('Listas') });`));
    const html = id => js(`return ${D}.nota('${id || ids.uno}').html;`);
    const abrirNota = async id => {
      await js(`const c = ${CAPA}; if (c && !c.hidden) { c.querySelector('[data-gd-lado-cerrar]').click(); await W(250); } return 1;`);
      await js(`Claquedraw.gestor.abrirSub('${ids.sid}'); await W(400); return 1;`);
      await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${id}"]');`);
      const t = await centro(`document.querySelector('#gdMain .gd-nota[data-nota="${id}"] > span:first-child')`);
      await clic(t, { tras: 700 });
      return hasta(`const c = ${CAPA}; return !!c && !c.hidden && ${CAMPO}.textContent.length > 0;`, 3000);
    };
    /* al final del campo, en un renglón nuevo (un clic en la cola y Enter) */
    const alFinal = async () => {
      const cola = await centro(`${CAPA}.querySelector('[data-gd-modal-cola]')`);
      await clic({ x: cola.x, y: cola.t + 6 }, { tras: 200 });
      await js(`const c = ${CAMPO}, u = c.lastElementChild; c.focus(); const r = document.createRange(); r.selectNodeContents(u); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1;`);
      const vacio = await js(`const u = ${CAMPO}.lastElementChild; return u.tagName === 'P' && !u.textContent.trim();`);
      if (!vacio) await tecla('Enter', [], 150);
    };
    const guardado = async () => { await espera(650); return html(); };

    /* ---------- a) los recuadros con «/» ---------- */
    console.log('\n  a) «/prompt» y «/info»\n');
    ok('la nota se abre en su ventana', await abrirNota(ids.uno));
    ok('el pie de la ventana: typewriter, línea legible y zoom', await js(`const p = ${CAPA}.querySelector('.vt-pie'); return !!p && !!p.querySelector('[data-vt-typewriter]') && !!p.querySelector('[data-vt-legible]') && p.querySelector('.vt-zoom-valor').textContent === '100 %';`));
    await alFinal();
    await escribir('/');
    ok('«/» abre el menú con buscador', await hasta(`const m = ${MENU}; return !!m && !m.hidden && /Prompt/.test(m.textContent) && /Título 1/.test(m.textContent) && !/Aviso: Info/.test(m.textContent);`, 1500),
      await js(`const m = ${MENU}; return m ? m.hidden + ' ' + m.textContent : 'sin menú';`));
    await escribir('prompt');
    ok('buscar «prompt» deja el prompt', await js(`const b = ${MENU}.querySelectorAll('button'); return b.length >= 1 && b[0].textContent.startsWith('Prompt');`), await js(`return ${MENU}.textContent;`));
    await tecla('Enter', [], 300);
    ok('Enter lo elige: el menú se cierra', await js(`return ${MENU}.hidden;`));
    await escribir('Una [ciudad] de noche');
    let h = await guardado();
    ok('«/prompt» crea un prompt de verdad en el documento', /<div class="rc rc-prompt" data-rc="prompt"><p>Una \[ciudad\] de noche<\/p><\/div>/.test(h) && !/\/prompt/.test(h), h);
    ok('los huecos del prompt, realzados', await js(`const x = CSS.highlights.get('rc-hueco'); return !!x && x.size === 1 && [...x][0].toString() === '[ciudad]';`), await js(`const x = CSS.highlights.get('rc-hueco'); return x ? x.size : 'nada';`));
    await tecla('Enter'); await escribir('segunda');
    h = await guardado();
    ok('Enter dentro: otro párrafo del prompt', /data-rc="prompt"><p>Una \[ciudad\] de noche<\/p><p>segunda<\/p><\/div>/.test(h), h);
    await tecla('Enter'); await tecla('Enter', [], 200);
    await escribir('/info');
    ok('«/info» ofrece el aviso Info (solo al buscarlo)', await js(`return ${MENU}.querySelector('button.on').textContent.startsWith('Aviso: Info');`), await js(`return ${MENU}.textContent;`));
    await tecla('Enter', [], 300);
    await escribir('Dura quince segundos');
    h = await guardado();
    ok('dos Enter salen del prompt y «/info» crea un aviso Info', /<p>segunda<\/p><\/div><div class="rc rc-aviso" data-rc="aviso" data-tipo="info"><p>Dura quince segundos<\/p><\/div>/.test(h), h);
    await tecla('Enter'); await tecla('Enter', [], 200);
    await escribir('Texto que se envuelve /aviso');
    await tecla('Enter', [], 300);
    h = await guardado();
    ok('en un renglón con texto, «/aviso» lo envuelve en una nota', /<div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>Texto que se envuelve\s*<\/p><\/div>/.test(h), h);
    /* dentro de un recuadro, «/consejo» lo cambia de tipo */
    await escribir(' /consejo'); await tecla('Enter', [], 300);
    h = await guardado();
    ok('dentro de uno, «/consejo» lo cambia de tipo', /<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip"><p>Texto que se envuelve\s*<\/p><\/div>/.test(h), h);
    ok('detrás del último recuadro queda un renglón', await js(`const u = ${CAMPO}.lastElementChild; return u.tagName === 'P' && u.previousElementSibling.matches('div[data-rc]');`));
    /* Deshacer quita el recuadro recién creado (un solo insertHTML) */
    await alFinal();
    await escribir('/prompt'); await tecla('Enter', [], 300);
    const antesDeshacer = await js(`return ${CAMPO}.querySelectorAll(':scope > div[data-rc]').length;`);
    await js(`${CAMPO}.focus(); return 1;`);
    require('electron').Menu.getApplicationMenu().items.find(x => x.label === 'Edición').submenu.items.find(x => x.label === 'Deshacer').click();
    await espera(300);
    ok('Cmd+Z quita el recuadro recién creado', (await js(`return ${CAMPO}.querySelectorAll(':scope > div[data-rc]').length;`)) === antesDeshacer - 1, antesDeshacer);
    /* y se ve igual en el editor */
    await js(`${CAPA}.querySelector('[data-gd-lado-abrir]').click(); return 1;`);
    const enEditor = await hasta(`const f = document.querySelector('#texto iframe'), e = f && f.contentDocument && f.contentDocument.getElementById('editor'); return !!e && !!e.querySelector(':scope > .rc-prompt') && !!e.querySelector(':scope > .rc-aviso[data-tipo="info"]');`, 5000);
    ok('⤢: en el editor se ven el prompt y los avisos', enEditor);
    ok('con su cabecera y su texto', await js(`const e = document.querySelector('#texto iframe').contentDocument.getElementById('editor'), p = e.querySelector('.rc-prompt'); return p.textContent === 'Una [ciudad] de nochesegunda' && getComputedStyle(p, '::after').content.includes('Copiar') && e.querySelector('.rc-aviso[data-tipo="tip"]').textContent.startsWith('Texto que se envuelve');`),
      await js(`const e = document.querySelector('#texto iframe').contentDocument.getElementById('editor'); return e.innerHTML;`));
    await js(`document.querySelector('[data-gd-contraer-nota]').click(); return 1;`);
    ok('«Contraer» la devuelve a su ventana', await hasta(`const c = ${CAPA}; return !!c && !c.hidden;`, 3000));

    /* ---------- b) el menú y los demás comandos ---------- */
    console.log('\n  b) el menú y los demás comandos\n');
    await alFinal();
    await escribir('/ti');
    ok('el menú, abierto con «/ti»', await js(`return !${MENU}.hidden;`));
    await tecla('Escape', [], 250);
    ok('Esc lo cierra, quita «/ti» y no cierra la ventana', await js(`return ${MENU}.hidden && !${CAPA}.hidden && !/\\/ti/.test(${CAMPO}.textContent);`), await js(`return ${CAMPO}.innerHTML.slice(-200);`));
    await escribir('/li');
    const tit = await centro(`${CAPA}.querySelector('[data-gd-lado-titulo]')`);
    await clic(tit, { tras: 250 });
    ok('un clic fuera lo cierra y quita «/li»', await js(`return ${MENU}.hidden && !/\\/li/.test(${CAMPO}.textContent);`), await js(`return ${CAMPO}.innerHTML.slice(-200);`));
    await alFinal();
    await escribir('/');
    await tecla('Down'); await tecla('Down');
    ok('las flechas recorren el menú', await js(`return ${MENU}.querySelector('button.on').textContent.startsWith('Título 2');`), await js(`return ${MENU}.querySelector('button.on').textContent;`));
    await tecla('Tab', [], 250);
    await escribir('Cabecera');
    h = await guardado();
    ok('Tab elige: un título 2', /<h2>Cabecera<\/h2>/.test(h), h.slice(-300));
    await tecla('Enter'); await escribir('/lista con'); await tecla('Enter', [], 250); await escribir('uno');
    await tecla('Enter'); await tecla('Enter', [], 200);
    await escribir('/numerada'); await tecla('Enter', [], 250); await escribir('primero');
    await tecla('Enter'); await tecla('Enter', [], 200);
    await escribir('/cita'); await tecla('Enter', [], 250); await escribir('citado');
    await tecla('Enter'); await tecla('Enter', [], 200);
    await escribir('/codigo'); await tecla('Enter', [], 250); await escribir('x = 1');
    h = await guardado();
    ok('lista con viñetas, numerada, cita y código', /<ul><li>uno<\/li><\/ul>/.test(h) && /<ol><li>primero<\/li><\/ol>/.test(h) && /<blockquote><p>citado<\/p><\/blockquote>/.test(h) && /<pre>x = 1<\/pre>/.test(h), h.slice(-500));
    await alFinal();
    await escribir('/separador'); await tecla('Enter', [], 300);
    await escribir('tras la raya');
    await tecla('Enter');
    await escribir('/tabla'); await tecla('Enter', [], 300);
    await escribir('celda');
    h = await guardado();
    ok('separador y tabla, como lo que son', /<hr><p>tras la raya<\/p>/.test(h) && /<table><tbody><tr><th>celda<\/th><th><br><\/th><\/tr><tr><td><br><\/td><td><br><\/td><\/tr><\/tbody><\/table>/.test(h), h.slice(-400));
    /* la imagen: el selector de archivos, sustituido (le da un PNG) */
    await js(`window.__clicArchivo = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type !== 'file') return window.__clicArchivo.call(this);
      const c = document.createElement('canvas'); c.width = 8; c.height = 6; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 8, 6);
      c.toBlob(b => { const dt = new DataTransfer(); dt.items.add(new File([b], 'punto.png', { type: 'image/png' })); this.files = dt.files; this.dispatchEvent(new Event('change')); }); }; return 1;`);
    await alFinal();
    await escribir('/imagen'); await tecla('Enter', [], 900);
    await js(`HTMLInputElement.prototype.click = window.__clicArchivo; return 1;`);
    h = await guardado();
    ok('«/imagen» elige un archivo y la imagen entra en el documento', /<p><img src="data:image\/png;base64,[^"]+" alt="punto.png"><\/p>/.test(h) && !/<p><p/.test(h) && !(await js(`return !!${CAMPO}.querySelector('p p, p div');`)) && await js(`return !!${CAMPO}.querySelector('.gd-lado-img img');`), h.slice(-300));
    ok('en una fórmula o dentro de código no sale', await (async () => {
      await js(`const p = ${CAMPO}.querySelector('pre'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ${CAMPO}.focus(); return 1;`);
      await escribir(' /'); const cerrado = await js(`return ${MENU}.hidden;`); await tecla('Backspace'); await tecla('Backspace'); return cerrado;
    })());

    /* una fórmula es texto plano: ahí «/» es una barra y nada más */
    const fid = await js(`return Claquedraw.gestor.crearFormula ? Claquedraw.gestor.crearFormula('Tono', 'Escribe con humor.') : null;`);
    if (fid) {
      await js(`const c = ${CAPA}; if (c && !c.hidden) { c.querySelector('[data-gd-lado-cerrar]').click(); await W(250); } Claquedraw.gestor.abrirFormula('${fid}'); return 1;`);
      ok('la fórmula, en su ventana (texto plano)', await hasta(`return !${CAPA}.hidden && ${CAMPO}.classList.contains('plano');`, 3000));
      await js(`const c = ${CAMPO}; c.focus(); const r = document.createRange(); r.selectNodeContents(c.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return 1;`);
      await escribir(' /prompt');
      const menuF = await js(`return !document.querySelector('.vt-slash') || document.querySelector('.vt-slash').hidden;`), txtF = await js(`return ${CAMPO}.textContent;`);
      ok('en una fórmula, «/» no abre el menú (se queda como texto)', menuF && /\/prompt/.test(txtF), menuF + ' ' + txtF);
      await js(`${CAPA}.querySelector('[data-gd-lado-cerrar]').click(); await W(200); return 1;`);
      ok('la nota Uno, otra vez', await abrirNota(ids.uno));
    } else console.log('  (sin fórmulas en esta versión: no se prueba)');

    /* ---------- c) el zoom ---------- */
    console.log('\n  c) el zoom del texto\n');
    const tam = () => js(`return parseFloat(getComputedStyle(${CAMPO}).fontSize);`);
    const zEsq = () => js(`return getComputedStyle(document.documentElement).getPropertyValue('--zoom-esq') + '|' + (Claquedraw.app && JSON.parse(localStorage.getItem('guiones.claquedraw.vista') || '{}').zoomEsq);`);
    const esq0 = await zEsq();
    ok('a 100 %, el texto a 15 px', (await tam()) === 15, await tam());
    const mas = await centro(`${CAPA}.querySelector('[data-vt-zoom="1"]')`);
    await clic(mas, { tras: 150 });
    ok('«+» lo amplía a 110 %', (await tam()) === 16.5 && (await js(`return ${CAPA}.querySelector('.vt-zoom-valor').textContent;`)) === '110 %', await tam());
    await js(`${CAMPO}.focus(); return 1;`);
    await tecla('=', ['meta'], 150);
    ok('Cmd+= a 120 %', (await tam()) === 18, await tam());
    await tecla('-', ['meta'], 150); await tecla('-', ['meta'], 150); await tecla('-', ['meta'], 150);
    ok('Cmd+− a 90 %', Math.abs((await tam()) - 13.5) < .01, await tam());
    await tecla('0', ['meta'], 150);
    ok('Cmd+0 al 100 %', (await tam()) === 15, await tam());
    ok('el zoom del esquema no se movió', (await zEsq()) === esq0, esq0 + ' → ' + await zEsq());
    /* el pellizco (Chromium lo da como rueda con Ctrl), anclado a la línea bajo el gesto */
    await clic(await centro(`${CAPA}.querySelector('.gd-modal-cola')`), { tras: 100 });
    const larga0 = await abrirNota(ids.larga);
    ok('la nota larga, en su ventana', larga0);
    await js(`${CAPA}.querySelector('.gd-modal-hoja').scrollTop = 600; await W(100); return 1;`);
    const p20 = await centro(`[...${CAMPO}.children].find(p => p.textContent.startsWith('Párrafo 20 '))`);
    const antesY = p20.t;
    for (let i = 0; i < 6; i++) { rueda(p20.x, p20.y, 40, ['control']); await espera(40); }
    await espera(450);
    const tamP = await tam(), despues = await js(`const p = [...${CAMPO}.children].find(p => p.textContent.startsWith('Párrafo 20 ')); return p.getBoundingClientRect().top;`);
    ok('el pellizco amplía el texto', tamP > 15.5, tamP);
    ok('y la línea bajo el gesto se queda donde estaba', Math.abs(despues - antesY) < p20.b - p20.t, antesY + ' → ' + despues);
    ok('el pellizco no toca el zoom del esquema', (await zEsq()) === esq0);
    await espera(250);
    const guardadaZ = await js(`return JSON.parse(localStorage.getItem('guiones.claquedraw.vista')).zoomTexto;`);
    ok('se recuerda en la vista (zoomTexto)', guardadaZ > 100 && guardadaZ === Claro(await js(`return Claquedraw.ventana.zoom();`)), guardadaZ);
    function Claro(x) { return x; }
    await clic(await centro(`${CAPA}.querySelector('.vt-zoom-valor')`), { tras: 150 });
    ok('el porcentaje vuelve al 100 % y la clave se va', (await tam()) === 15 && (await js(`return 'zoomTexto' in JSON.parse(localStorage.getItem('guiones.claquedraw.vista'));`)) === false);
    const ancho0 = await js(`return ${CAPA}.querySelector('.gd-modal-papel').getBoundingClientRect().width;`);
    await clic(await centro(`${CAPA}.querySelector('[data-vt-legible]')`), { tras: 150 });
    const ancho1 = await js(`return ${CAPA}.querySelector('.gd-modal-papel').getBoundingClientRect().width;`);
    ok('sin «Línea legible» el papel se ensancha', ancho1 > ancho0 + 100 && (await js(`return JSON.parse(localStorage.getItem('guiones.claquedraw.vista')).lineaLegible;`)) === false, ancho0 + ' → ' + ancho1);
    await clic(await centro(`${CAPA}.querySelector('[data-vt-legible]')`), { tras: 150 });
    ok('y vuelve', Math.abs((await js(`return ${CAPA}.querySelector('.gd-modal-papel').getBoundingClientRect().width;`)) - ancho0) < 1);

    /* ---------- d) typewriter ---------- */
    console.log('\n  d) typewriter\n');
    ok('typewriter, de serie encendido', await js(`return Claquedraw.ventana.typewriter() && ${CAPA}.classList.contains('typewriter') && ${CAPA}.querySelector('[data-vt-typewriter]').classList.contains('on');`));
    const desvio = () => js(`const s = getSelection(), r = s.getRangeAt(0).cloneRange(); r.collapse(true); const q = r.getClientRects()[0] || r.getBoundingClientRect(), h = ${CAPA}.querySelector('.gd-modal-hoja'), hr = h.getBoundingClientRect(); return Math.round((q.top + q.bottom) / 2 - (hr.top + h.clientHeight / 2));`);
    await js(`${CAPA}.querySelector('.gd-modal-hoja').scrollTop = 0; await W(80); return 1;`);
    const p3 = await centro(`[...${CAMPO}.children].find(p => p.textContent.startsWith('Párrafo 3 '))`);
    await clic({ x: p3.l + 30, y: p3.t + 4 }, { tras: 200 });
    for (let i = 0; i < 6; i++) await tecla('Down', [], 60);
    await espera(200);
    let dv = await desvio();
    ok('al mover el cursor con las flechas, su línea va al centro de la hoja', Math.abs(dv) < 14, dv);
    await escribir(' escrito');
    dv = await desvio();
    ok('y al escribir, también', Math.abs(dv) < 14, dv);
    /* la última línea también llega al centro */
    await js(`const c = ${CAMPO}, u = [...c.children].filter(p => p.textContent.trim()).pop(); const r = document.createRange(); r.selectNodeContents(u); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1;`);
    await tecla('Left', [], 150);
    dv = await desvio();
    ok('la última línea también llega al centro (la cola mide media hoja)', Math.abs(dv) < 14, dv);
    await clic(await centro(`${CAPA}.querySelector('[data-vt-typewriter]')`), { tras: 150 });
    ok('se apaga desde el pie y se recuerda', !(await js(`return Claquedraw.ventana.typewriter();`)) && (await js(`return JSON.parse(localStorage.getItem('guiones.claquedraw.vista')).typewriter;`)) === false);
    await js(`${CAPA}.querySelector('.gd-modal-hoja').scrollTop = 0; await W(80); return 1;`);
    await clic({ x: p3.l + 30, y: p3.t + 4 }, { tras: 200 });
    const st0 = await js(`return ${CAPA}.querySelector('.gd-modal-hoja').scrollTop;`);
    await tecla('Down', [], 150);
    ok('apagado, la hoja no se mueve', (await js(`return ${CAPA}.querySelector('.gd-modal-hoja').scrollTop;`)) === st0);
    await clic(await centro(`${CAPA}.querySelector('[data-vt-typewriter]')`), { tras: 150 });
    ok('y se vuelve a encender', await js(`return Claquedraw.ventana.typewriter() && !('typewriter' in JSON.parse(localStorage.getItem('guiones.claquedraw.vista')));`));

    /* ---------- e) citar en el asistente ---------- */
    console.log('\n  e) citar en el asistente\n');
    ok('el asistente está (C.asistente.citar)', await js(`return !!(Claquedraw.asistente && typeof Claquedraw.asistente.citar === 'function');`));
    await js(`${CAPA}.querySelector('[data-gd-lado-cerrar]').click(); await W(200); return 1;`);
    ok('la nota Uno otra vez', await abrirNota(ids.uno));
    /* se elige «la que se cita» en el segundo párrafo */
    const elegirEn = async (doc, sel, texto) => js(`const d = ${doc}, p = [...d.querySelectorAll('${sel}')].find(x => x.textContent.includes(${JSON.stringify(texto)})); const tw = d.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode()) && !n.nodeValue.includes(${JSON.stringify(texto)})); const i = n.nodeValue.indexOf(${JSON.stringify(texto)}); const r = d.createRange(); r.setStart(n, i); r.setEnd(n, i + ${texto.length}); p.scrollIntoView({ block: 'center' }); await W(80); const s = (d.defaultView || window).getSelection(); s.removeAllRanges(); s.addRange(r); const b = r.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`).then(JSON.parse);
    let pt = await elegirEn('document', '.gd-modal-capa [data-gd-lado-texto] p', 'la que se cita');
    await clic(pt, { boton: 'right', tras: 300 });
    const opc = await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent).join(' | ');`);
    ok('el clic derecho con texto elegido ofrece «Citar en el asistente»', /Citar en el asistente/.test(opc), opc);
    const bc = await centro(`[...document.querySelectorAll('.gd-pop button')].find(b => /Citar en el asistente/.test(b.textContent))`);
    if (bc) await clic(bc, { tras: 500 });
    const chips = () => js(`return JSON.stringify([...document.querySelectorAll('#asistente [data-as-campo] .as-chip-cita')].map(c => ({ t: c.dataset.cita, u: c.dataset.citaUrl || '', e: c.dataset.etiqueta || '' })));`).then(JSON.parse);
    let cs = await chips();
    ok('va al panel del asistente: el chip de cita con el texto', await js(`return Claquedraw.asistente.abierto();`) && cs.length === 1 && cs[0].t === 'la que se cita', JSON.stringify(cs));
    ok('con el enlace de su tramo (la nota, bloque 2)', cs[0] && new RegExp('/nota/' + ids.uno + '\\?b=2(&|$)').test(cs[0].u) && /nota «Uno»/i.test(cs[0].e), JSON.stringify(cs));
    ok('la ventana sigue abierta', await js(`return !${CAPA}.hidden;`));
    pt = await elegirEn('document', '.gd-modal-capa [data-gd-lado-texto] p', 'Primera línea');
    await tecla('a', ['meta', 'shift'], 400);
    cs = await chips();
    ok('Cmd+Shift+A cita lo elegido en la ventana (bloque 1)', cs.length === 2 && cs[1].t === 'Primera línea' && /\?b=1(&|$)/.test(cs[1].u), JSON.stringify(cs));
    /* en el editor */
    await js(`${CAPA}.querySelector('[data-gd-lado-abrir]').click(); return 1;`);
    const MARCO = `document.querySelector('#texto iframe').contentDocument`;
    ok('la nota en el editor', await hasta(`const f = document.querySelector('#texto iframe'); return !!f && !!f.contentDocument.getElementById('editor') && f.contentDocument.getElementById('editor').textContent.includes('Segunda línea') && !document.querySelector('#texto').hidden;`, 5000));
    await espera(500);
    pt = await elegirEn(MARCO, '#editor p', 'Segunda línea');
    const off = await js(`const b = document.querySelector('#texto iframe').getBoundingClientRect(); return JSON.stringify({ x: b.left, y: b.top });`).then(JSON.parse);
    await clic({ x: off.x + pt.x, y: off.y + pt.y }, { boton: 'right', tras: 300 });
    ok('en el editor, el clic derecho ofrece «Citar en el asistente»', await js(`const b = ${MARCO}.getElementById('cdCitar'); return !!b && !b.hidden && !${MARCO}.getElementById('ctxMenu').hidden;`), await js(`const b = ${MARCO}.getElementById('cdCitar'); return b ? 'hidden=' + b.hidden : 'no está';`));
    const bce = await js(`const b = ${MARCO}.getElementById('cdCitar').getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`).then(JSON.parse);
    await clic({ x: off.x + bce.x, y: off.y + bce.y }, { tras: 500 });
    cs = await chips();
    ok('y lo manda al panel con el enlace de su tramo', cs.length === 3 && cs[2].t === 'Segunda línea' && /\?b=2(&|$)/.test(cs[2].u), JSON.stringify(cs));
    pt = await elegirEn(MARCO, '#editor p', 'Primera');
    await js(`document.querySelector('#texto iframe').contentWindow.focus(); ${MARCO}.getElementById('editor').focus(); return 1;`);
    await elegirEn(MARCO, '#editor p', 'Primera');
    await tecla('a', ['meta', 'shift'], 400);
    cs = await chips();
    ok('Cmd+Shift+A en el editor, también', cs.length === 4 && cs[3].t === 'Primera' && /\?b=1(&|$)/.test(cs[3].u), JSON.stringify(cs));
    ok('ni «Mandar» ni el asistente llamaron a la IA', await js(`return !Claquedraw.asistente.trabajando();`));

    /* ---------- g) las viñetas (1.1.60) ----------
       Leo: «en las notas, cuando uso viñetas ya no puedo quitarlas, ni siquiera borrando; deben quitarse y dejarme escribir normal
       cuando dé Enter a una viñeta vacía» y «solo me pasó una vez, cuando le di Enter a un texto que pertenecía a una viñeta». El
       atajo `**esto**` deja un \u200B detrás; un clic al final del renglón pone el cursor delante de él y el Enter se lo llevaba a la
       viñeta nueva, que parecía vacía y no lo estaba: Enter abría otra encima y Retroceso la volvía a unir (MdVivo.lista). */
    console.log('\n  g) las viñetas\n');
    /* primero en el editor (la nota Uno sigue abierta ahí): Retroceso al principio de una viñeta con texto le quita la viñeta */
    const ED = `document.querySelector('#texto iframe').contentDocument.getElementById('editor')`;
    const alFinalEd = () => js(`const f = document.querySelector('#texto iframe'); f.contentWindow.focus(); const e = ${ED}; e.focus(); const d = f.contentDocument, r = d.createRange(); r.selectNodeContents(e.lastElementChild); r.collapse(false); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); return 1;`);
    const edHtml = () => js(`return ${ED}.innerHTML;`);
    await alFinalEd(); await tecla('Enter', [], 150);
    await escribir('- uno'); await tecla('Enter', [], 500); await tecla('Enter', [], 300);
    let eh = await edHtml();
    ok('editor: Enter en una viñeta vacía sale de la lista', /<ul><li>uno<\/li><\/ul><p><br><\/p>$/.test(eh), eh.slice(-200));
    await escribir('- '); await escribir(' ');
    const conEspacio = await edHtml();
    await tecla('Enter', [], 300);
    eh = await edHtml();
    ok('editor: una viñeta con solo un espacio también sale con Enter', /<li>(&nbsp;| )<\/li>/.test(conEspacio) && /<ul><li>uno<\/li><\/ul><p><br><\/p>$/.test(eh), conEspacio.slice(-120) + ' → ' + eh.slice(-200));
    await escribir('- dos'); await tecla('Home', [], 150); await tecla('Backspace', [], 300);
    eh = await edHtml();
    ok('editor: Retroceso al principio de una viñeta con texto le quita la viñeta (sin <span style>)', /<ul><li>uno<\/li><\/ul><p>dos<\/p>$/.test(eh), eh.slice(-200));
    await js(`document.querySelector('[data-gd-contraer-nota]').click(); return 1;`);
    await hasta(`const c = ${CAPA}; return !!c && !c.hidden;`, 3000);

    /* en la ventana de una nota */
    ok('la nota Listas en su ventana', await abrirNota(ids.listas));
    ok('la sublista de Markdown se ve como en el documento', await js(`return !!${CAMPO}.querySelector('li > ul > li');`), await js(`return ${CAMPO}.innerHTML;`));
    const lis = () => js(`return JSON.stringify([...${CAMPO}.querySelectorAll('li')].map(li => [...li.childNodes].filter(n => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map(n => n.textContent).join('')));`).then(JSON.parse);
    const invisibles = () => js(`return [...${CAMPO}.querySelectorAll('li')].some(li => !li.textContent.replace(/[\\s\\u200B\\u00A0]/g, '') && /[\\u200B\\u00A0]/.test(li.textContent));`);
    const cursorEn = (sel, alFin) => js(`const c = ${CAMPO}; c.focus(); const el = [...c.querySelectorAll('li, p')].find(x => [...x.childNodes].some(n => n.nodeType === 3 && n.nodeValue.startsWith(${JSON.stringify(sel)})));
      const t = [...el.childNodes].find(n => n.nodeType === 3 && n.nodeValue.startsWith(${JSON.stringify(sel)})); const r = document.createRange(); r.setStart(t, ${alFin ? 't.nodeValue.length' : '0'}); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); return 1;`);
    /* el caso de Leo: una viñeta que acaba en **negrita**, un clic al final del renglón, Enter y Enter en la «vacía» */
    await cursorEn('Fin.', true); await tecla('Enter', [], 200);
    await escribir('- ver **esto**');
    const li0 = await centro(`[...${CAMPO}.querySelectorAll('li')].pop()`);
    await clic({ x: li0.l + 30, y: li0.y }, { tras: 200 });               // fuera del renglón y vuelta: el clic de verdad al final
    await clic({ x: li0.r - 6, y: li0.y }, { tras: 250 });
    const antesDelEnter = await js(`const r = getSelection().getRangeAt(0); return r.startContainer.nodeType === 3 ? JSON.stringify(r.startContainer.nodeValue) + '@' + r.startOffset : r.startContainer.nodeName;`);
    await tecla('Enter', [], 500);
    await tecla('Enter', [], 500);
    let h2 = await js(`return ${CAMPO}.innerHTML;`);
    ok('Enter en la viñeta nueva sale de la lista aunque le quede el \\u200B del atajo', /<li>(\u200B)?ver <b>esto<\/b>(\u200B)?<\/li><\/ul><p>(<br>|\u200B)*<\/p>$/.test(h2) && !(await invisibles()), antesDelEnter + ' · ' + h2.slice(-220));
    await escribir('normal');
    await espera(600); h2 = await html(ids.listas);
    ok('y lo escrito es un párrafo normal (también en el documento)', /<ul><li>ver <b>esto<\/b><\/li><\/ul><p>normal<\/p>$/.test(h2), h2.slice(-200));
    /* Retroceso en una viñeta vacía (esperando a que se guarde entre una tecla y otra) */
    await tecla('Enter', [], 200); await escribir('- a'); await tecla('Enter', [], 600);
    await tecla('Backspace', [], 600);
    h2 = await js(`return ${CAMPO}.innerHTML;`);
    ok('Retroceso en una viñeta vacía la quita: un párrafo en su sitio', /<ul><li>a<\/li><\/ul><p><br><\/p>$/.test(h2), h2.slice(-200));
    await escribir('sin viñeta');
    ok('y se escribe en él', /<ul><li>a<\/li><\/ul><p>sin viñeta<\/p>$/.test(await js(`return ${CAMPO}.innerHTML;`)));
    /* Retroceso al principio de una viñeta con texto */
    await cursorEn('tres', false); await tecla('Backspace', [], 500);
    h2 = await js(`return ${CAMPO}.innerHTML;`);
    ok('Retroceso al principio de «tres»: pierde la viñeta, no se une a la de antes', /<\/ul><p[^>]*>tres<\/p><p[^>]*>Fin\.<\/p>/.test(h2) && (await lis()).includes('dos') && !/<span style/.test(h2), h2);
    await cursorEn('uno', false); await tecla('Backspace', [], 500);
    h2 = await js(`return ${CAMPO}.innerHTML;`);
    ok('en la primera («uno»): sale de la lista, no se une a «Intro.»', /<p[^>]*>Intro\.<\/p><p>uno<\/p><ul[^>]*><li[^>]*>dos/.test(h2), h2);
    /* Deshacer lo devuelve (outdent + formatBlock: dos pasos) */
    const deshacer = () => require('electron').Menu.getApplicationMenu().items.find(x => x.label === 'Edición').submenu.items.find(x => x.label === 'Deshacer').click();
    await js(`${CAMPO}.focus(); return 1;`); deshacer(); await espera(150); deshacer(); await espera(300);
    ok('Deshacer devuelve la viñeta a «uno»', (await lis())[0] === 'uno' && /<p[^>]*>Intro\.<\/p><ul/.test(await js(`return ${CAMPO}.innerHTML;`)), await js(`return ${CAMPO}.innerHTML;`));
    /* anidadas: Retroceso al principio sube un nivel; Tab y Mayús+Tab */
    await cursorEn('sub b', false); await tecla('Backspace', [], 500);
    ok('Retroceso al principio de una subviñeta la sube un nivel', await js(`const li = [...${CAMPO}.querySelectorAll('li')].find(x => x.textContent.startsWith('sub b')); return !!li && !li.parentNode.closest('li, ul ul, ol ol, ul ol, ol ul') && !${CAMPO}.querySelector('li > li');`), await js(`return ${CAMPO}.innerHTML;`));
    await tecla('Tab', [], 400);
    ok('Tab la vuelve a anidar (y el foco se queda en el campo)', await js(`const li = [...${CAMPO}.querySelectorAll('li')].find(x => x.textContent.startsWith('sub b')); return !!li.parentNode.closest('li, ul ul, ol ol') && document.activeElement === ${CAMPO};`), await js(`return ${CAMPO}.innerHTML + ' · ' + document.activeElement.className;`));
    await tecla('Tab', ['shift'], 400);
    ok('Mayús+Tab la sube', await js(`const li = [...${CAMPO}.querySelectorAll('li')].find(x => x.textContent.startsWith('sub b')); return !li.parentNode.closest('li, ul ul, ol ol') && document.activeElement === ${CAMPO};`), await js(`return ${CAMPO}.innerHTML;`));
    await cursorEn('sub a', true); await tecla('Enter', [], 400); await tecla('Enter', [], 400);
    ok('Enter en una subviñeta vacía sube un nivel (sigue siendo viñeta)', await js(`const c = ${CAMPO}, r = getSelection().getRangeAt(0), n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer, li = n.closest('li'); return !!li && !li.parentNode.closest('li, ul ul, ol ol');`), await js(`return ${CAMPO}.innerHTML;`));
    await tecla('Enter', [], 400);
    ok('y otro Enter sale de la lista', await js(`const r = getSelection().getRangeAt(0), n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; return !n.closest('li') && n.closest('p') && n.closest('p').parentNode === ${CAMPO};`), await js(`return ${CAMPO}.innerHTML;`));
    await espera(600);
    const hl = await html(ids.listas);
    ok('el documento guarda listas bien formadas (ningún <li> dentro de otro ni viñetas invisibles)', !/<li>(\u200B|&nbsp;|\s)*<\/li>/.test(hl) && !/<li[^>]*>[^<]*<li/.test(hl), hl);

    /* ---------- h) las versiones de la nota (1.1.60) ----------
       Leo: «en las notas sería bueno que [lo que reemplaza la IA] se pusiera como nueva versión, aprovechando la funcionalidad;
       rescátala en el modal como lo haces ya en ClapBook». «Versiones» en el pie de la ventana: guardar, cargar, comparar; y lo que
       reemplaza Claude (o el asistente) queda como versión «Antes de Claude» / «Antes de DeepSeek». */
    console.log('\n  h) las versiones de la nota\n');
    const BV = `${CAPA}.querySelector('[data-vt-versiones]')`, MV = `document.querySelector('.vs-menu')`;
    const rotV = () => js(`return ${BV}.textContent.trim();`);
    const abrirVersiones = async () => { await clic(await centro(BV), { tras: 350 }); return hasta(`return !!${MV};`, 2000); };
    const filaV = async t => centro(`[...document.querySelectorAll('.vs-menu .vs-fila')].find(f => f.querySelector('.vs-nom').textContent.startsWith(${JSON.stringify(t)}))`);
    ok('el pie de la ventana lleva «Versiones»', (await rotV()) === 'Versiones');
    ok('su menú: aún ninguna', await abrirVersiones() && /Aún no has guardado/.test(await js(`return ${MV}.textContent;`)));
    await clic(await centro(`[...document.querySelectorAll('.vs-menu .vs-opcion')].find(b => /Guardar versión/.test(b.textContent))`), { tras: 400 });
    ok('«Guardar versión…» pide el nombre (propone v1)', await hasta(`const d = document.getElementById('dlgNombre'); return d.open && d.querySelector('input').value === 'v1';`, 2000));
    await tecla('a', ['meta'], 80); await escribir('Primer borrador'); await tecla('Enter', [], 500);
    ok('guardada: el botón lleva su nombre (es lo que hay ahora)', (await rotV()) === 'Primer borrador' && (await js(`return (${D}.nota('${ids.listas}').versiones || []).length;`)) === 1, await rotV());
    const textoV1 = await js(`return ${D}.nota('${ids.listas}').html;`);
    await js(`const c = ${CAMPO}; c.focus(); const r = document.createRange(); r.selectNodeContents(c.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return 1;`);
    await tecla('Enter', [], 100); await escribir('Un renglón de después');
    await espera(600);
    ok('al escribir, el botón vuelve a «Versiones» (lo de ahora ya no es esa)', (await rotV()) === 'Versiones', await rotV());
    await abrirVersiones();
    await clic(await filaV('Primer borrador'), { tras: 400 });
    ok('cargar una con lo de ahora sin guardar pregunta antes', await hasta(`const d = document.getElementById('dlg'); return d.open && /Cargar «Primer borrador»/.test(d.textContent);`, 2000));
    await clic(await centro(`document.getElementById('dlgOk')`), { tras: 500 });
    ok('y la carga en la ventana (sin lo de después) con su nombre en el botón', !/Un renglón de después/.test(await js(`return ${CAMPO}.textContent;`)) && (await js(`return ${D}.nota('${ids.listas}').html;`)) === textoV1 && (await rotV()) === 'Primer borrador' && await js(`return !${CAPA}.hidden;`));
    /* Claude reemplaza la nota: lo de antes queda como versión «Antes de Claude» y la ventana enseña lo nuevo */
    await tecla('Enter', [], 100); await escribir('Lo que Leo escribió antes de Claude'); await espera(700);
    r = await M.llamar('escribir_documento', { nota: ids.listas, contenido: 'Todo nuevo, de Claude.', como: 'prosa' });
    ok('Claude reemplaza la nota y dice que lo de antes quedó como versión', !r.error && /quedó guardado como versión «Antes de Claude · [^»]+»/.test(r.texto) && /ventana de la nota/.test(r.texto), r.texto);
    ok('la ventana enseña lo nuevo', await hasta(`return /Todo nuevo, de Claude/.test(${CAMPO}.textContent);`, 3000));
    await abrirVersiones();
    ok('en «Versiones» está «Antes de Claude · …»', /Antes de Claude · /.test(await js(`return ${MV}.textContent;`)), await js(`return ${MV}.textContent;`));
    const filaC = await filaV('Antes de Claude');                         // sus botones salen al pasar el ratón por la fila
    ev({ type: 'mouseMove', x: Math.round(filaC.x), y: Math.round(filaC.y) }); await espera(200);
    await clic(await centro(`[...document.querySelectorAll('.vs-menu .vs-fila')].find(f => /^Antes de Claude/.test(f.querySelector('.vs-nom').textContent)).querySelector('[data-vs-comparar]')`), { tras: 500 });
    ok('su comparación: lo de Leo quitado y lo de Claude añadido', await hasta(`const c = document.querySelector('.vs-capa'); return !!c && /Antes de Claude/.test(c.textContent) && [...c.querySelectorAll('.vs-menos')].some(p => /antes de Claude/.test(p.textContent)) && [...c.querySelectorAll('.vs-mas')].some(p => /Todo nuevo/.test(p.textContent));`, 2000),
      await js(`const c = document.querySelector('.vs-capa'); return c ? c.innerHTML.slice(0, 600) : 'sin comparación';`));
    await tecla('Escape', [], 300);
    ok('Esc cierra la comparación y la ventana sigue', await js(`return !document.querySelector('.vs-capa') && !${CAPA}.hidden;`));
    await abrirVersiones();
    await clic(await filaV('Antes de Claude'), { tras: 400 });
    if (await js(`return document.getElementById('dlg').open;`)) await clic(await centro(`document.getElementById('dlgOk')`), { tras: 500 });
    ok('cargar «Antes de Claude» devuelve lo de Leo', await hasta(`return /Lo que Leo escribió antes de Claude/.test(${CAMPO}.textContent) && !/Todo nuevo/.test(${CAMPO}.textContent);`, 2000));
    /* el asistente (DeepSeek) en vivo: su versión dice quién fue (antes, un cambio de Leo: si lo de ahora ya es la última versión, no se repite) */
    await js(`const c = ${CAMPO}; c.focus(); const r = document.createRange(); r.selectNodeContents(c.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return 1;`);
    await tecla('Enter', [], 100); await escribir('Y un cambio de Leo'); await espera(700);
    const ds = JSON.parse(await js(`const r = Claquedraw.app.ejecutarEnVivo('escribir_documento', { nota: '${ids.listas}', contenido: 'Lo de DeepSeek.', como: 'prosa' }, { origen: 'DeepSeek · deepseek-v4-flash', avisar: false }); await W(300); return JSON.stringify({ texto: r.texto || r.error, vs: (${D}.nota('${ids.listas}').versiones || []).map(v => v.nombre) });`));
    ok('lo que reemplaza el asistente queda como «Antes de DeepSeek · …»', /quedó guardado como versión «Antes de DeepSeek · /.test(ds.texto) && ds.vs.some(v => /^Antes de DeepSeek · /.test(v)), JSON.stringify(ds));
    await abrirVersiones();
    ok('y sale en «Versiones» de la ventana', /Antes de DeepSeek · /.test(await js(`return ${MV}.textContent;`)));
    await tecla('Escape', [], 300);
  } catch (e) { ok('sin excepciones', false, e && e.stack); }
  M.cerrar();
  ok('f) la página no soltó ningún error', !errores.length, errores.join('\n'));
  const mal = resultados.filter(x => !x.ok).length;
  console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
  if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
  app.exit(mal ? 1 : 0);
});
