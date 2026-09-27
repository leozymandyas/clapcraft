/* Prueba de los recuadros (prompt y avisos) con la app de verdad (Electron): `electron pruebas/recuadros-electron.js`.
   1.1.57, de ClapBook (js/recuadros.js): el bloque de prompt (con «Copiar» y los `[huecos]` realzados) y los avisos (Nota, Info,
   Consejo…), en el editor y en la ventana de una nota. Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal,
   diálogos sustituidos, **el portapapeles de mentira**: el de verdad es el de Leo) y, con el ratón y el teclado de verdad
   (`webContents.sendInputEvent`, la ventana enfocada), comprueba en dos partes:
   · **la app**: Claude (el servidor MCP, arrancado con el Node de Electron) escribe una nota con ```prompt y ```aviso:info y la lee
     como vallas; la ventana de la nota los pinta con su cabecera; «Copiar»; escribir dentro, Enter y Enter para salir, Retroceso
     que no une; el menú de la cabecera de un aviso (tipo y color); el clic derecho; exportar a texto, Markdown, Word y PDF (y
     «ocultar las notas»); un PDF largo con tantas páginas como cuenta el maquetador y sin hojas desbordadas; y ⤢ al editor;
   · **el editor** (index.html solo, en otra ventana): «/prompt», Enter dentro y fuera, los huecos, «Copiar», el menú de la
     cabecera (título y color), Retroceso y Supr en los bordes, borrar y escribir sobre una selección que cruza, «/info», pegar
     dentro, el clic derecho, el asa (convertir y Deshacer), Markdown de ida y vuelta, el contador de páginas, el modo guion, el
     corrector, `normalizar` y las listas dentro.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const FUENTES = pathToFileURL(path.join(REPO, 'fonts')).href + '/';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-recuadros-'));
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
/* Electron vuelve a escribir su almacenamiento al cerrarse, después del rmSync del final: se borra también un poco después */
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function ok(nombre, v, detalle) {
  resultados.push({ nombre, ok: !!v });
  console.log((v ? '  ✔ ' : '  ✖ ') + nombre + (v || detalle === undefined ? '' : '\n      ' + String(detalle).slice(0, 1400)));
}
function mcp() {
  const p = spawn(process.execPath, [path.join(REPO, 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, errores = '';
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', d => { errores += d; });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return { error: !!r.result.isError, texto: r.result.content[0].text }; };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}

/* las manos sobre una ventana: JavaScript, el ratón y el teclado de verdad */
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
  const centro = async expr => { const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); await W(60); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, r: b.right, t: b.top, b: b.bottom });`); return r ? JSON.parse(r) : null; };
  return { js, hasta, clic, tecla, escribir, centro };
}

/* ---------- la app: la ventana de una nota, Claude y exportar ---------- */
async function parteApp(errores) {
  let win = null;
  for (let i = 0; i < 200 && !win; i++) { await espera(50); win = BrowserWindow.getAllWindows().find(x => /claquedraw\.html/.test(x.webContents.getURL() || '')); }
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const { js, hasta, clic, tecla, escribir, centro } = manos(win, errores);
  win.setBounds({ x: 40, y: 40, width: 1280, height: 900 }); win.show(); win.focus(); win.webContents.focus();
  await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
  console.log('\nClapCraft · prueba de los recuadros en ' + TMP + '\n\n  La app\n');
  const D = `Claquedraw.gestor.documentos()`, CAPA = `document.querySelector('.gd-modal-capa')`, CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
  const M = mcp();
  try {
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Recuadros', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Fragmentos' }] });
    ok('Claude crea la biblioteca', !r.error, r.texto);
    const contenido = 'Fragmento de la escena 1.\n\n```prompt Plano 1 {.azul}\nUna [ciudad] de **noche**, cámara lenta.\nEstilo: [estilo]\n```\n\n```aviso:info Duración\n0:00–0:15 · 15 s\n```\n\nDespués.';
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [{ op: 'crear_nota', titulo: 'F1', contenido }] });
    ok('Claude escribe una nota con un prompt y un aviso', !r.error, r.texto);
    await espera(500);
    const ids = JSON.parse(await js(`const d = ${D}, s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Fragmentos'); return JSON.stringify({ sid: s.id, nid: d.notasDe(s.id).find(n => n.titulo === 'F1').id });`));
    let h = await js(`return ${D}.nota('${ids.nid}').html;`);
    ok('en la nota hay un recuadro de verdad (prompt y aviso)', /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano 1" data-color="azul"><p>Una \[ciudad\] de <b>noche<\/b>, cámara lenta\.<br>Estilo: \[estilo\]<\/p><\/div><div class="rc rc-aviso" data-rc="aviso" data-tipo="info" data-titulo="Duración"><p>0:00–0:15 · 15 s<\/p><\/div>/.test(h), h);
    r = await M.llamar('leer_documento', { nota: 'F1' });
    ok('y Claude lo lee como vallas', /```prompt Plano 1 \{\.azul\}\nUna \[ciudad\] de \*\*noche\*\*, cámara lenta\.\nEstilo: \[estilo\]\n```/.test(r.texto) && /```aviso:info Duración/.test(r.texto), r.texto);

    /* la ventana de la nota */
    await js(`Claquedraw.gestor.abrirSub('${ids.sid}'); await W(500); return 1;`);
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${ids.nid}"]');`);
    const t = await centro(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.nid}"] > span:first-child')`);
    await clic(t, { tras: 700 });
    ok('la nota se abre en su ventana', await hasta(`const c = ${CAPA}; return !!c && !c.hidden && !!c.querySelector('[data-gd-lado-texto] > .rc-prompt');`, 3000));
    const cab = await js(`const p = ${CAMPO}.querySelector('.rc-prompt'), a = ${CAMPO}.querySelector('.rc-aviso'); return getComputedStyle(p, '::before').content + ' | ' + getComputedStyle(p, '::after').content + ' | ' + getComputedStyle(a, '::before').content + ' | ' + getComputedStyle(a, '::after').content + ' | ' + getComputedStyle(p).borderTopStyle;`);
    ok('los recuadros se ven con su cabecera', /Plano 1/.test(cab) && /Copiar/.test(cab) && /"i"/.test(cab) && /Duración/.test(cab) && /solid/.test(cab), cab);
    /* «Copiar» */
    const rp = await centro(`${CAMPO}.querySelector('.rc-prompt')`);
    await clic({ x: rp.r - 45, y: rp.t + 20 }, { tras: 400 });
    ok('«Copiar» en la ventana', portapapeles === 'Una [ciudad] de noche, cámara lenta.\nEstilo: [estilo]', JSON.stringify(portapapeles));
    /* escribir dentro: vuelve al documento con el recuadro intacto */
    await js(`const p = ${CAMPO}.querySelector('.rc-prompt > p'); ${CAMPO}.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1;`);
    await escribir(' Lluvia');
    await espera(700);
    h = await js(`return ${D}.nota('${ids.nid}').html;`);
    ok('lo escrito dentro del prompt se guarda y el recuadro vuelve intacto', /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano 1" data-color="azul"><p>Una \[ciudad\] de <b>noche<\/b>, cámara lenta\.<br>Estilo: \[estilo\] Lluvia<\/p><\/div><div class="rc rc-aviso" data-rc="aviso" data-tipo="info" data-titulo="Duración">/.test(h), h);
    /* Enter y Enter: fuera */
    await tecla('Enter'); await tecla('Enter', [], 200); await escribir('Fuera');
    await espera(700);
    h = await js(`return ${D}.nota('${ids.nid}').html;`);
    ok('en la ventana, Enter en la línea vacía del final sale del prompt', /Lluvia<\/p><\/div><p>Fuera<\/p><div class="rc rc-aviso"/.test(h), h);
    /* Retroceso al principio de lo de fuera no se une */
    await tecla('Home'); for (let i = 0; i < 6; i++) await tecla('ArrowLeft', [], 30);
    await js(`const p = [...${CAMPO}.children].find(x => x.textContent === 'Fuera'); const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1;`);
    await tecla('Backspace', [], 200);
    ok('en la ventana, Retroceso no une un párrafo con el recuadro', await js(`return !![...${CAMPO}.children].find(x => x.tagName === 'P' && x.textContent === 'Fuera') && /Lluvia$/.test(${CAMPO}.querySelector('.rc-prompt').textContent);`));
    /* la cabecera del aviso: su menú (tipo y color) */
    const ra = await centro(`${CAMPO}.querySelector('.rc-aviso')`);
    await clic({ x: ra.l + 60, y: ra.t + 18 }, { tras: 400 });
    ok('un clic en la cabecera del aviso abre su menú', await js(`return !!document.querySelector('.gd-pop .rc-menu-lado');`));
    const tip = await centro(`document.querySelector('.gd-pop [data-rc-tipo="tip"]')`); await clic(tip, { tras: 200 });
    const col = await centro(`document.querySelector('.gd-pop [data-rc-color="rosa"]')`); await clic(col, { tras: 200 });
    await tecla('Escape', [], 200);
    await espera(700);
    h = await js(`return ${D}.nota('${ids.nid}').html;`);
    ok('su tipo y su color se guardan', /<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip" data-titulo="Duración" data-color="rosa">/.test(h), h);
    /* el clic derecho dentro */
    const pa = await centro(`${CAMPO}.querySelector('.rc-prompt > p')`);
    await clic({ x: pa.l + 20, y: pa.y }, { boton: 'right', tras: 400 });
    ok('el clic derecho dentro de un prompt lo ofrece', await js(`return [...document.querySelectorAll('.gd-pop button')].some(b => /Copiar el texto del prompt/.test(b.textContent)) && [...document.querySelectorAll('.gd-pop button')].some(b => /Quitar el recuadro/.test(b.textContent));`));
    await tecla('Escape', [], 200);

    /* exportar */
    const ex = JSON.parse(await js(`const html = ${D}.nota('${ids.nid}').html, E = Claquedraw.exportar;
      const docx = new TextDecoder().decode(E.docx(html)); const imp = E.aImprimible(html, 'F1');
      return JSON.stringify({ txt: E.aTexto(html), md: E.aMarkdown(html), docx: /Plano 1/.test(docx) && /w:pBdr/.test(docx) && /Duración/.test(docx), imp: /data-cab="✦ Plano 1"/.test(imp) && /\\.rc::before/.test(imp),
        sin: (localStorage.setItem('guiones.claquedraw.exportar.sinNotas', '1'), E.preparar(html)) });`));
    await js(`localStorage.removeItem('guiones.claquedraw.exportar.sinNotas'); return 1;`);
    ok('exportar a texto: un recuadro sencillo', /┌ ✦ Plano 1\n│ Una \[ciudad\] de noche, cámara lenta\.\n│ Estilo: \[estilo\] Lluvia\n└/.test(ex.txt) && /┌ ✧ Duración/.test(ex.txt), ex.txt);
    ok('exportar a Markdown: las vallas', /```prompt Plano 1 \{\.azul\}\nUna \[ciudad\] de \*\*noche\*\*, cámara lenta\.  \nEstilo: \[estilo\] Lluvia\n```/.test(ex.md) && /```aviso:tip Duración \{\.rosa\}/.test(ex.md), ex.md);
    ok('exportar a Word: con borde y su cabecera', ex.docx);
    ok('exportar a PDF: la cabecera escrita y el estilo', ex.imp);
    ok('«Ocultar las notas y los recuadros» los quita', !/data-rc/.test(ex.sin) && /Fragmento de la escena/.test(ex.sin), ex.sin);

    /* el PDF: tantas páginas como cuenta el maquetador, con muchos recuadros */
    const largo = JSON.parse(await js(`const R = Claquedraw.conversor.RECUADROS; let h = '';
      for (let i = 0; i < 18; i++) h += '<p class="sp-action">Acción número ' + i + ' con algo de texto para ocupar un par de renglones en la hoja impresa del guion.</p>'
        + R.html({ rc: i % 2 ? 'aviso' : 'prompt', tipo: 'info', titulo: 'F' + i }, '<p>' + 'palabra '.repeat(20 + i) + '</p><ul><li>uno</li><li>dos</li></ul>');
      const t = document.createElement('div'); t.innerHTML = h; const M = Claquedraw.maquetar; const b = M.bloquesDe(M.elementos(t.children)).bloques;
      return JSON.stringify({ imp: Claquedraw.exportar.aImprimible(h, 'Largo', '${FUENTES}'), paginas: M.paginar(b).length });`));
    const pw = new BrowserWindow({ show: false });
    const archivoPdf = path.join(TMP, 'largo.html'); fs.writeFileSync(archivoPdf, largo.imp);
    await pw.loadFile(archivoPdf); await espera(600);
    const hojas = await pw.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('.hoja')].map(h => h.scrollHeight > h.clientHeight + 2))`);
    const pdf = await pw.webContents.printToPDF({ pageSize: 'Letter', preferCSSPageSize: true });
    const nPdf = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    pw.destroy();
    ok('PDF: las páginas del maquetador y las del PDF coinciden, y ninguna hoja se desborda', nPdf === largo.paginas && !JSON.parse(hojas).some(Boolean), 'pdf ' + nPdf + ' maquetador ' + largo.paginas + ' desbordes ' + hojas);
    /* al editor (⤢): el recuadro sigue ahí */
    await clic(await centro(`${CAPA}.querySelector('[data-gd-lado-abrir]')`), { tras: 1200 });
    const ed = await js(`const w = document.getElementById('editorMarco').contentWindow; return w.Ed.document.get().html;`);
    ok('en el editor, los mismos recuadros', /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano 1" data-color="azul">/.test(ed) && /data-tipo="tip"/.test(ed), ed);
  } finally {
    const e = M.errores().replace(/servidor MCP listo[^\n]*\n?/, '');
    ok('el servidor MCP no soltó errores', !/Error|error:/.test(e), e);
    M.cerrar();
  }
}

/* ---------- el editor, solo (index.html) ---------- */
async function parteEditor(errores) {
  console.log('\n  El editor\n');
  const win = new BrowserWindow({ width: 1100, height: 950, show: true, webPreferences: { backgroundThrottling: false } });
  const { js, clic, tecla, escribir } = manos(win, errores);
  await win.loadFile(path.join(REPO, 'index.html'));
  win.focus(); win.webContents.focus();
  const html = () => js(`return Ed.document.get().html;`);

  /* el portapapeles, de mentira */
  await js(`localStorage.removeItem('guiones.editor.doc'); window.__copiado = null; navigator.clipboard.writeText = t => { window.__copiado = t; return Promise.resolve(); }; Ed.document.set({ html: '<p><br></p>' }); return 1;`);
  await espera(300);
  const p0 = JSON.parse(await js(`const r = document.querySelector('#editor > p').getBoundingClientRect(); return JSON.stringify({ x: r.left + 10, y: r.top + r.height / 2 });`));
  await clic(p0);

  /* 1. «/prompt» */
  await escribir('Hola'); await tecla('Enter'); await escribir('/prompt');
  const menu = await js(`const m = document.querySelector('.slash-menu'); return m && !m.hidden ? m.textContent : '';`);
  ok('1) «/prompt» ofrece el Prompt', /Prompt/.test(menu), menu);
  await tecla('Enter', [], 300);
  let h = await html();
  ok('1) nace un recuadro de prompt con una línea vacía, y una línea detrás', /^<p>Hola<\/p><div class="rc rc-prompt" data-rc="prompt"><p><br><\/p><\/div><p><br><\/p>$/.test(h), h);
  ok('1) el cursor, dentro', await js(`const r = getSelection().getRangeAt(0); return !!Ed.recuadros.de(r.startContainer);`));

  /* 2. escribir, Enter sigue dentro, los huecos */
  await escribir('Una [ciudad] de noche'); await tecla('Enter'); await escribir('segunda');
  h = await html();
  ok('2) Enter sigue dentro', /<div class="rc rc-prompt" data-rc="prompt"><p>Una \[ciudad\] de noche<\/p><p>segunda<\/p><\/div>/.test(h), h);
  await espera(100);
  ok('2) el [hueco] se realza (Highlight)', await js(`const hl = CSS.highlights.get('rc-hueco'); return !!hl && hl.size === 1 && [...hl][0].toString() === '[ciudad]';`));

  /* 3. dos Enter en líneas vacías: fuera */
  await tecla('Enter'); await tecla('Enter', [], 200);
  h = await html();
  ok('3) Enter en la línea vacía del final sale (y la quita)', /<p>segunda<\/p><\/div><p><br><\/p>$/.test(h), h);
  ok('3) el cursor, fuera', await js(`const r = getSelection().getRangeAt(0); return !Ed.recuadros.de(r.startContainer) && r.startContainer.closest ? true : !Ed.recuadros.de(r.startContainer);`));
  await escribir('fuera');
  h = await html();
  ok('3) lo escrito va detrás', /<\/div><p>fuera<\/p>$/.test(h), h);

  /* 4. «Copiar» */
  const cab = JSON.parse(await js(`const r = document.querySelector('#editor > .rc').getBoundingClientRect(); return JSON.stringify({ l: r.left, r: r.right, t: r.top });`));
  await clic({ x: cab.r - 45, y: cab.t + 20 }, { tras: 400 });
  ok('4) «Copiar» se lleva el texto sin marcas, con una línea en blanco entre párrafos', (await js(`return window.__copiado;`)) === 'Una [ciudad] de noche\n\nsegunda', await js(`return JSON.stringify(window.__copiado);`));
  ok('4) y avisa', await js(`return !!document.querySelector('.rc-toast');`));
  ok('4) el clic no movió el cursor al recuadro', await js(`const r = getSelection().getRangeAt(0); return !Ed.recuadros.de(r.startContainer);`));

  /* 5. la cabecera: el menú, el título y el color */
  await clic({ x: cab.l + 40, y: cab.t + 20 }, { tras: 300 });
  ok('5) un clic en la cabecera abre su menú', await js(`const m = document.querySelector('.rc-menu'); return !!m && !m.hidden && document.activeElement.matches('[data-rc-titulo]');`));
  await escribir('Plano uno');
  ok('5) el título se escribe al momento', await js(`return document.querySelector('#editor > .rc').getAttribute('data-titulo') === 'Plano uno';`));
  const sw = JSON.parse(await js(`const b = document.querySelector('.rc-menu [data-rc-op="color"][data-v="verde"]').getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`));
  await clic(sw);
  ok('5) el color', await js(`return document.querySelector('#editor > .rc').getAttribute('data-color') === 'verde';`));
  await tecla('Escape', [], 200);
  ok('5) Esc cierra el menú', await js(`return document.querySelector('.rc-menu').hidden;`));
  const pintado = await js(`const r = document.querySelector('#editor > .rc'); return getComputedStyle(r, '::before').content + ' | ' + getComputedStyle(r, '::after').content;`);
  ok('5) la cabecera pinta el título y «Copiar»', /Plano uno/.test(pintado) && /Copiar/.test(pintado), pintado);

  /* 6. Retroceso al principio del bloque de detrás: no se une */
  await js(`const p = document.querySelector('#editor > .rc').nextElementSibling; Ed.setCaret(p.firstChild, 0); document.getElementById('editor').focus(); return 1;`);
  await tecla('Backspace');
  h = await html();
  ok('6) Retroceso tras un recuadro no lo une con él', /<p>segunda<\/p><\/div><p>fuera<\/p>/.test(h), h);
  ok('6) y el cursor pasa al final del recuadro', await js(`const r = getSelection().getRangeAt(0); return !!Ed.recuadros.de(r.startContainer);`));
  /* Supr al final del recuadro: tampoco trae lo de debajo */
  await tecla('Delete');
  ok('6) Supr al final del recuadro no trae lo de debajo', /<p>segunda<\/p><\/div><p>fuera<\/p>/.test(await html()), await html());
  /* Retroceso al principio del recuadro: no se sale ni se une con «Hola» */
  await js(`const p = document.querySelector('#editor > .rc > p'); Ed.setCaret(p.firstChild, 0); return 1;`);
  await tecla('Backspace');
  h = await html();
  ok('6) Retroceso al principio del recuadro no lo une con lo de antes', /^<p>Hola<\/p><div class="rc rc-prompt"[^>]*><p>Una/.test(h), h);

  /* 7. una selección que cruza el borde se borra por tramos */
  await js(`const a = [...document.querySelectorAll('#editor > .rc p')][1].firstChild, b = document.querySelector('#editor > .rc').nextElementSibling.firstChild;
    const r = document.createRange(); r.setStart(a, 3); r.setEnd(b, 2); Ed.restoreSelection(r); return 1;`);
  await tecla('Backspace', [], 200);
  h = await html();
  ok('7) borrar una selección que cruza: el recuadro se queda y lo de fuera también', /<p>seg<\/p><\/div><p>era<\/p>/.test(h), h);
  /* escribir encima de una selección que cruza */
  await js(`const a = [...document.querySelectorAll('#editor > .rc p')][1].firstChild, b = document.querySelector('#editor > .rc').nextElementSibling.firstChild;
    const r = document.createRange(); r.setStart(a, 1); r.setEnd(b, 1); Ed.restoreSelection(r); return 1;`);
  await escribir('X');
  h = await html();
  ok('7) escribir sobre ella: en el primer tramo', /<p>sXg<\/p><\/div><p>ra<\/p>/.test(h) || /<p>sX<\/p><\/div><p>ra<\/p>/.test(h), h);

  /* 8. «/info» (un tipo de aviso) en una línea nueva, y Retroceso en un recuadro vacío lo quita */
  await js(`const p = document.getElementById('editor').lastElementChild; const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); Ed.restoreSelection(r); return 1;`);
  await tecla('Enter'); await escribir('/inf');
  const m2 = await js(`const m = document.querySelector('.slash-menu'); return m && !m.hidden ? m.textContent : '';`);
  ok('8) «/inf» ofrece «Aviso: Info»', /Aviso: Info/.test(m2), m2);
  await tecla('Enter', [], 300);
  await escribir('Dato');
  h = await html();
  ok('8) nace un aviso de tipo info', /<div class="rc rc-aviso" data-rc="aviso" data-tipo="info"><p>Dato<\/p><\/div>/.test(h), h);
  const pint2 = await js(`const r = document.querySelector('#editor > .rc-aviso'); return getComputedStyle(r, '::before').content + ' | ' + getComputedStyle(r, '::after').content;`);
  ok('8) su cabecera: el icono y «Info»', /"i"/.test(pint2) && /Info/.test(pint2), pint2);
  await tecla('Backspace'); await tecla('Backspace'); await tecla('Backspace'); await tecla('Backspace'); await tecla('Backspace', [], 250);
  h = await html();
  ok('8) Retroceso en un aviso vacío lo quita (queda una línea vacía)', !/rc-aviso/.test(h) && /<\/div><p>ra<\/p><p><br><\/p>/.test(h), h);

  /* 9. pegar dentro entra como texto */
  await js(`const p = document.querySelector('#editor > .rc > p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); Ed.restoreSelection(r);
    const dt = new DataTransfer(); dt.setData('text/html', '<h1 style="color:red">Título</h1><p>b</p>'); dt.setData('text/plain', 'Título\\nb');
    document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await W(150); return 1;`);
  h = await html();
  ok('9) pegar dentro de un prompt: texto, un párrafo por renglón', /<p>Una \[ciudad\] de nocheTítulo<\/p><p>b<\/p><p>sXg<\/p>/.test(h) || /<p>Una \[ciudad\] de nocheTítulo<\/p><p>b<\/p><p>sX<\/p>/.test(h), h);

  /* 10. el clic derecho, dentro */
  const pp = JSON.parse(await js(`const r = document.querySelector('#editor > .rc > p').getBoundingClientRect(); return JSON.stringify({ x: r.left + 20, y: r.top + r.height / 2 });`));
  await clic(pp, { boton: 'right', tras: 300 });
  ok('10) el clic derecho ofrece lo del recuadro', await js(`const s = document.getElementById('ctxRc'); return !document.getElementById('ctxMenu').hidden && !s.hidden && /Copiar el texto del prompt/.test(s.textContent) && /Quitar el recuadro/.test(s.textContent);`));
  await tecla('Escape', [], 150);
  await js(`document.getElementById('ctxMenu').hidden = true; return 1;`);

  /* 11. el asa: envolver un párrafo en un aviso y quitarlo */
  const hola = JSON.parse(await js(`const p = document.querySelector('#editor > p'); Ed.setCaret(p.firstChild, 2); document.dispatchEvent(new Event('selectionchange')); await W(150);
    const g = document.querySelector('.blk-grip').getBoundingClientRect(); return JSON.stringify({ x: g.left + g.width / 2, y: g.top + g.height / 2 });`));
  await clic(hola, { tras: 300 });
  const conv = await js(`const b = [...document.querySelectorAll('.blk-menu [data-op="convert"]')].find(x => x.dataset.arg === 'rc:aviso'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); await W(80); const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`);
  ok('11) el asa ofrece «Aviso»', !!conv);
  if (conv) await clic(JSON.parse(conv), { tras: 300 });
  h = await html();
  ok('11) el párrafo queda dentro de un aviso', /^<div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>Hola<\/p><\/div><div class="rc rc-prompt"/.test(h), h);
  await js(`document.execCommand('undo'); await W(150); return 1;`);
  h = await html();
  ok("11) y entra en Deshacer (un paso)", /^<p( class="")?>Hola<\/p><div class="rc rc-prompt"/.test(h), h);
  await js(`document.execCommand('redo'); await W(150); return 1;`);
  await js(`Ed.recuadros.quitar(document.querySelector('#editor > .rc-aviso')); await W(100); return 1;`);
  h = await html();
  ok("11) «Quitar el recuadro» deja el texto en su sitio", /^<p( class="")?>Hola<\/p><div class="rc rc-prompt"/.test(h), h);

  /* 12. Markdown: ida y vuelta */
  const md = await js(`return Ed.md.fromHtml(document.getElementById('editor'));`);
  ok('12) a Markdown: ```prompt Título {.color}', /```prompt Plano uno \{\.verde\}\nUna \[ciudad\] de nocheTítulo\n\nb\n\ns/.test(md), md);
  const vuelta = await js(`return Ed.md.toHtml(${JSON.stringify(md)});`);
  ok('12) y de vuelta, el mismo recuadro', /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano uno" data-color="verde"><p>Una \[ciudad\] de nocheTítulo<\/p><p>b<\/p>/.test(vuelta), vuelta);

  /* 13. páginas: cuenta sin romperse; con «sin notas», menos renglones */
  const pags = await js(`Ed.paginas.recalcular(); const M = Claquedraw.maquetar; const els = M.elementos(document.getElementById('editor').children);
    const a = M.bloquesDe(els).bloques, b = M.bloquesDe(els, { sinNotas: true }).bloques; return JSON.stringify({ total: Ed.paginas.total(), a: a.map(x => x.tipo), b: b.map(x => x.tipo), lineas: a.find(x => x.tipo === 'recuadro').lineas });`);
  ok('13) el contador de páginas cuenta el recuadro (y sin notas, no)', /recuadro/.test(JSON.parse(pags).a.join()) && !/recuadro/.test(JSON.parse(pags).b.join()), pags);

  /* 14. modo guion: «/» ofrece Prompt y Aviso; el corrector no entra en el prompt */
  await js(`Ed.page.setOption('script', true); const p = document.getElementById('editor').lastElementChild; const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); Ed.restoreSelection(r); return 1;`);
  await tecla('Enter'); await escribir('/');
  const m3 = await js(`const m = document.querySelector('.slash-menu'); return m && !m.hidden ? m.textContent : '';`);
  ok('14) en modo guion, «/» ofrece Prompt y Aviso (y no los tipos)', /Prompt/.test(m3) && /Aviso/.test(m3) && !/Aviso: Info/.test(m3) && /Acción/.test(m3), m3);
  await tecla('Escape', [], 150);
  await js(`Ed.page.setOption('script', false); return 1;`);
  const spell = await js(`if (!Ed.spell) return 'sin corrector'; Ed.spell.setEnabled(true); await W(1200); const hl = CSS.highlights.get('spell-error'); const rs = hl ? [...hl] : []; return JSON.stringify(rs.map(r => r.toString()));`);
  ok('14) el corrector no marca nada dentro del prompt', !/ciudad|noche|Título/.test(spell), spell);
  await js(`Ed.spell && Ed.spell.setEnabled(false); return 1;`);

  /* 15. normalizar: un recuadro con la clase perdida y texto suelto se repara */
  await js(`Ed.document.set({ html: '<div data-rc="aviso" data-tipo="Consejo" data-color="rojo">suelto<p class="sp-action">acción</p></div>' }); await W(200); return 1;`);
  h = await html();
  ok('15) normalizar: la clase, el tipo, el color, lo suelto a un párrafo, sin clases de guion y una línea detrás',
    h === '<div data-rc="aviso" data-tipo="tip" data-color="coral" class="rc rc-aviso"><p>suelto</p><p>acción</p></div><p><br></p>', h);

  /* 16. listas dentro de un prompt, y salir de ellas; Deshacer quita el recuadro recién creado */
  await js(`Ed.document.set({ html: '<p>arriba</p><p><br></p>' }); await W(150); const p = document.getElementById('editor').lastElementChild; Ed.setCaret(p, 0); document.getElementById('editor').focus(); return 1;`);
  await escribir('/prompt'); await tecla('Enter', [], 300);
  await escribir('- uno'); await tecla('Enter'); await escribir('dos');
  h = await html();
  ok('16) «- » hace una lista dentro del prompt', /<div class="rc rc-prompt" data-rc="prompt"><ul><li>uno<\/li><li>dos<\/li><\/ul><\/div>/.test(h), h);
  await tecla('Enter'); await tecla('Enter', [], 200);
  h = await html();
  ok('16) Enter en un elemento vacío sale de la lista (sigue en el prompt)', /<ul><li>uno<\/li><li>dos<\/li><\/ul><p><br><\/p><\/div>/.test(h), h);
  await tecla('Enter', [], 200); await escribir('fuera');
  h = await html();
  ok('16) y otro Enter sale del prompt', /<\/ul><\/div><p>fuera<\/p>$/.test(h), h);
  ok('16) textoDe de la lista', (await js(`return Ed.recuadros.textoDe(document.querySelector('#editor > .rc'));`)) === '- uno\n- dos');
  await js(`Ed.document.set({ html: '<p>arriba</p><p><br></p>' }); await W(150); const p = document.getElementById('editor').lastElementChild; Ed.setCaret(p, 0); document.getElementById('editor').focus(); return 1;`);
  await escribir('/aviso'); await tecla('Enter', [], 300);
  ok('16) «/aviso» crea una nota', /data-tipo="note"/.test(await html()), await html());
  await js(`document.execCommand('undo'); await W(200); return 1;`);
  h = await html();
  ok('16) Deshacer quita el recuadro recién creado', !/data-rc/.test(h), h);

  await js(`localStorage.removeItem('guiones.editor.doc'); return 1;`);
  win.destroy();
}

app.whenReady().then(async () => {
  const errores = [];
  try { await parteApp(errores); } catch (e) { ok('la app, sin excepciones', false, e && e.stack); }
  try { await parteEditor(errores); } catch (e) { ok('el editor, sin excepciones', false, e && e.stack); }
  ok('la página no soltó ningún error', !errores.length, errores.join('\n'));
  const mal = resultados.filter(x => !x.ok).length;
  console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
  if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
  app.exit(mal ? 1 : 0);
});
