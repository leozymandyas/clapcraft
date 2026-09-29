/* Prueba de regresión del editor de texto con la app de verdad (Electron): `npm run test:editor`
   (`electron pruebas/editor-electron.js [filtro]`: con un filtro solo corren los grupos cuyo nombre lo contiene).
   29-09-2026, revisión del editor. Leo: «cuando hay algo escrito e intento editar, se borran cosas que no quiero o luego no
   puedo hacer Command+Z; cuando selecciono bloques para eliminarlos, a veces borra otras cosas».
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos, **el portapapeles de
   mentira**: el de verdad es el de Leo; copiar y cortar van por ClipboardEvent sintéticos), crea un proyecto en blanco, abre el
   documento del esquema («Abrir documento») y, con el ratón y el teclado de verdad (`webContents.sendInputEvent`, la ventana
   enfocada), sobre un guion realista (escena, acción, personaje con (V.O.), paréntesis, diálogo, transición, nota, diálogo doble,
   aviso, lista y párrafos) comprueba:
   · **selección de texto**: arrastrar, triple clic y clic + Mayús+clic entre bloques siguen siendo texto; Supr, Retroceso y
     escribir encima borran solo lo elegido; Cmd+B actúa; triple clic + escribir no se funde con el bloque de abajo;
   · **bloques**: Esc, el asa (Eliminar, Duplicar, Convertir, arrastrar), Cmd+D, Cmd+Shift+↑/↓ y cortar hacen lo suyo, Deshacer
     devuelve el HTML idéntico en un paso y Rehacer lo repite; tras Deshacer, Retroceso no borra un bloque viejo; Esc + letra
     escribe donde estaba el cursor; Esc en un `li` elige el `li`; `Ed.document.get()` no lleva `blk-selected`;
   · **Deshacer del guion**: escena, acción, personaje y diálogo deshechos paso a paso hasta el principio sin duplicados y
     rehechos hasta el final; Tab, Mayús+Tab y Ctrl+1…6 de uno en uno; los atajos «- », «> » y «# »; el personaje soltado con
     doble espacio y con «.»; «/» tras Enter en una línea vacía; lo tecleado con un menú de sugerencias abierto (transición,
     escena, personaje) o escribiendo despacio se deshace de una vez, no letra a letra;
   · **no se pierde texto**: espacio, «.» y «(» en medio de un nombre; «)» y «]»; Retroceso con una línea vacía encima; Enter Enter
     no abre el selector de imagen; las sugerencias de lugar no se comen el Enter; un clic bajo una lista final;
   · **clics** en el margen y en el gris al lado de la hoja: el cursor va a esa altura y la vista no salta;
   · **ClapCraft**: ir al esquema y volver, un cambio de Claude y `recargar`, Buscar, el menú de Versiones y el tablero escondido.
   Deshacer y Rehacer en la app van por el `click()` del MenuItem «Deshacer»/«Rehacer» del menú (con `sendInputEvent` los
   aceleradores no saltan, y así llega de verdad en Electron: la orden `deshacer` de app.js). Después, lo que tiene sentido fuera
   de ClapCraft se repite en **index.html solo** (otra ventana), con el Cmd+Z nativo.
   Para no quitarle el foco a Leo: `NODE_OPTIONS="--require <archivo que cambie show por showInactive y focus por
   webContents.focus()>"`; sin eso también funciona.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-editor-'));
app.setPath('userData', path.join(TMP, 'datos'));
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showMessageBox = async () => ({ response: 2 });
/* el portapapeles, de mentira (el de verdad es el de Leo) */
let clip = { text: '', html: '' };
try {
  clipboard.writeText = t => { clip.text = String(t); }; clipboard.readText = () => clip.text;
  clipboard.writeHTML = h => { clip.html = String(h); }; clipboard.readHTML = () => clip.html;
  clipboard.write = o => { if (o.text != null) clip.text = o.text; if (o.html != null) clip.html = o.html; };
  clipboard.clear = () => { clip = { text: '', html: '' }; };
} catch (_) {}
require('../electron/main.js');
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { clip.text = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => clip.text);

const FILTRO = process.argv.slice(2).find(a => !a.startsWith('-') && !/\.js$/.test(a)) || '';
const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
let lugar = '';
function ok(nombre, v, detalle) {
  resultados.push({ nombre: lugar + nombre, ok: !!v });
  console.log((v ? '  ✔ ' : '  ✖ ') + nombre + (v || detalle === undefined ? '' : '\n      ' + String(detalle).slice(0, 2500).replace(/\n/g, '\n      ')));
}
function menuItem(label) {
  const busca = items => { for (const it of items) { if (it.label === label) return it; if (it.submenu) { const x = busca(it.submenu.items); if (x) return x; } } return null; };
  return busca(Menu.getApplicationMenu().items);
}
const lista = xs => xs.map((x, i) => (i + 1) + ': ' + x).join('\n');
/* lo que cambia entre dos HTML: desde el primer carácter distinto, con algo de contexto */
const dif = (a, b) => { if (a === b) return '(igual)'; let i = 0; while (i < a.length && a[i] === b[i]) i++; let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++; return '…' + a.slice(Math.max(0, i - 80), a.length - j + 40) + '\n   ⟶ …' + b.slice(Math.max(0, i - 80), b.length - j + 40); };

/* el guion de partida */
const DOC = [
  '<p class="sp-scene">INT. COCINA - NOCHE</p>',
  '<p class="sp-action">Mara entra con una bolsa de pan.</p>',
  '<p class="sp-character">MARA&nbsp;&nbsp;(V.O.)</p>',
  '<p class="sp-paren">en voz baja</p>',
  '<p class="sp-dialogue">Donde esta todo el mundo hoy.</p>',
  '<p class="sp-transition">CORTE A:</p>',
  '<p class="sp-scene">EXT. PUERTO - DIA</p>',
  '<p class="sp-note">revisar esta escena</p>',
  '<div class="sp-doble"><div class="sp-col"><p class="sp-character">LUIS</p><p class="sp-dialogue">Aqui.</p></div><div class="sp-col"><p class="sp-character">ANA</p><p class="sp-dialogue">Y aqui.</p></div></div>',
  '<p>Parrafo normal uno con bastante texto.</p>',
  '<p>Parrafo normal dos con otro texto.</p>',
  '<ul><li>Primero</li><li>Segundo</li><li>Tercero</li></ul>',
  '<div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>Texto del aviso.</p><p>Segunda del aviso.</p></div>',
  '<p>Final del documento.</p>'
].join('');
const CH = { MARA: { name: 'MARA', color: 0 }, LUIS: { name: 'LUIS', color: 1 }, ANA: { name: 'ANA', color: 2 } };
/* un guion largo (para los clics con desplazamiento y los saltos de página) */
function guionLargo(escenas) {
  const lugares = ['CASA DE MARA', 'COMISARIA', 'PUERTO', 'COCHE DE DANIEL', 'BAR EL FARO', 'AZOTEA'];
  const pj = ['MARA', 'DANIEL', 'LUCIA', 'TERE'];
  const acc = ['La lluvia golpea los cristales. Mara revisa unos papeles viejos sobre la mesa, con la mirada perdida en la ventana.',
    'Daniel entra sin llamar. Trae el abrigo empapado y una caja de carton bajo el brazo. La deja sobre la mesa con cuidado.',
    'Silencio. Un telefono suena en otra habitacion y nadie se mueve para contestar.'];
  const dia = ['No tenias que venir. Te dije que esto lo iba a resolver sola, y lo dije en serio.',
    'Y que querias que hiciera. Quedarme en casa esperando a que me llamaras. Llevas tres dias sin contestar.',
    'Porque no hay nada que contar todavia. Cuando lo haya, seras el primero en saberlo.'];
  let h = '';
  for (let i = 0; i < escenas; i++) {
    h += `<p class="sp-scene">${i % 2 ? 'EXT.' : 'INT.'} ${lugares[i % lugares.length]} - ${i % 3 ? 'NOCHE' : 'DIA'}</p><p class="sp-action">${acc[i % 3]}</p>`;
    for (let k = 0; k < 4; k++) h += `<p class="sp-character">${pj[(i + k) % pj.length]}</p>` + (k === 2 ? '<p class="sp-paren">en voz baja</p>' : '') + `<p class="sp-dialogue">${dia[(i + k) % dia.length]}</p>`;
    if (i % 4 === 3) h += '<p class="sp-transition">CORTE A:</p>';
  }
  return h;
}

/* ---------- las manos: JavaScript de la página y del editor, el ratón y el teclado de verdad ---------- */
function manos(win, errores, op) {
  win.webContents.on('console-message', e => {
    const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message;
    if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); }
  });
  win.webContents.setBackgroundThrottling(false);
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  /* el editor: dentro del marco en ClapCraft, la propia página en index.html */
  const PRE = op.marco
    ? `const M = document.getElementById('editorMarco'), w = M.contentWindow, d = w.document, ed = d.getElementById('editor'), Ed = w.Ed, O = M.getBoundingClientRect();`
    : `const w = window, d = document, ed = d.getElementById('editor'), Ed = w.Ed, O = { left: 0, top: 0 };`;
  const ejs = code => js(PRE + code);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ev = o => win.webContents.sendInputEvent(o);
  const R = Math.round;
  async function clic(p, o) {
    o = o || {}; const x = R(p.x), y = R(p.y), modifiers = o.mods || [], n = o.veces || 1;
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    for (let c = 1; c <= n; c++) { ev({ type: 'mouseDown', x, y, button: 'left', clickCount: c, modifiers }); await espera(40); ev({ type: 'mouseUp', x, y, button: 'left', clickCount: c, modifiers }); await espera(60); }
    await espera(o.tras === undefined ? 300 : o.tras);
  }
  async function arrastrar(a, b, pasos) {
    pasos = pasos || 12;
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) { ev({ type: 'mouseMove', x: R(a.x + (b.x - a.x) * i / pasos), y: R(a.y + (b.y - a.y) * i / pasos), modifiers: ['leftButtonDown'] }); await espera(25); }
    await espera(80);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(350);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => /meta|cmd|control|alt/.test(m))) ev({ type: 'char', keyCode: k, modifiers });
    else if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 150 : tras);
  }
  async function escribir(t, cada) {
    for (const ch of t) {
      const s = /^[a-z0-9 ]$/i.test(ch), mods = /[A-Z]/.test(ch) ? ['shift'] : [];
      if (s) ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      ev({ type: 'char', keyCode: ch, modifiers: mods });
      if (s) ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      await espera(cada || 45);
    }
    await espera(200);
  }
  /* coordenadas (de la ventana) del carácter `off` del primer nodo de texto de un elemento del editor; lo trae a la vista */
  async function enTexto(expr, off, lado, traer) {
    const r = await ejs(`const el = ${expr}; if (!el) return null;
      { const ws = d.getElementById('workspace').getBoundingClientRect(), eb = el.getBoundingClientRect(); if (${!!traer} || eb.top < ws.top + 110 || eb.bottom > ws.bottom - 60) { el.scrollIntoView({ block: 'center' }); await W(200); } }
      const tw = d.createTreeWalker(el, 4); const t = tw.nextNode(); const rg = d.createRange(); const o = Math.min(${off}, t.length);
      rg.setStart(t, o); rg.setEnd(t, Math.min(o + 1, t.length)); const b = rg.getBoundingClientRect();
      return JSON.stringify({ x: O.left + b.left + ${lado === 'der' ? 'b.width' : '1'}, y: O.top + b.top + b.height / 2 });`);
    return r ? JSON.parse(r) : null;
  }
  /* coordenadas de un elemento del editor (o de su documento), con un desplazamiento opcional (expresiones sobre b) */
  async function enEl(expr, dx, dy, traer) {
    const r = await ejs(`const el = ${expr}; if (!el) return null;
      { const ws = d.getElementById('workspace').getBoundingClientRect(), eb = el.getBoundingClientRect(); if (el.closest('#editor') && (${!!traer} || eb.top < ws.top + 110 || eb.top > ws.bottom - 60)) { el.scrollIntoView({ block: 'center' }); await W(200); } }
      const b = el.getBoundingClientRect();
      return JSON.stringify({ x: O.left + b.left + ${dx === undefined ? 'b.width / 2' : dx}, y: O.top + b.top + ${dy === undefined ? 'b.height / 2' : dy} });`);
    return r ? JSON.parse(r) : null;
  }
  /* un elemento de la página de fuera (ClapCraft) */
  const centro = async expr => { const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); await W(60); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`); return r ? JSON.parse(r) : null; };
  const html = () => ejs(`return ed.innerHTML.replace(/ class="blk-selected"/g, '').replace(/ blk-selected/g, '');`);
  const limpio = async () => (await html()).replace(/ style="[^"]*"/g, '').replace(/ data-ch="\d+"/g, '');
  const docHtml = () => ejs(`return Ed.document.get().html;`);
  const sel = () => ejs(`return Ed.blocks.selected().map(b => b.tagName.toLowerCase() + ':' + b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 25)).join(' | ');`);
  /* dónde está el cursor: el texto de su bloque, el desplazamiento dentro de él y lo elegido */
  const cursor = () => ejs(`const s = w.getSelection(); if (!s.rangeCount) return JSON.stringify({ txt: '', off: -1, len: 0, sel: '', t: 'ninguno' }); const r = s.getRangeAt(0);
    const b = Ed.closestBlock(r.startContainer, ed); let off = -1, txt = '';
    if (b) { const x = d.createRange(); x.setStart(b, 0); x.setEnd(r.startContainer, r.startOffset); off = x.toString().length; txt = b.textContent; }
    const foco = d.activeElement && (d.activeElement.id || d.activeElement.tagName);
    return JSON.stringify({ txt, off, len: txt.length, clase: b ? (b.className || b.tagName.toLowerCase()) : '', sel: r.collapsed ? '' : s.toString(), foco, t: txt.slice(0, 30) + '@' + off + (r.collapsed ? '' : ' «' + s.toString() + '»') + ' foco:' + foco });`).then(JSON.parse);
  /* pone el cursor (por la página, sin ratón) en el carácter `pos` del texto de un bloque ('fin' = al final) */
  const caret = (expr, pos) => ejs(`w.focus(); ed.focus(); const el = ${expr}; const tw = d.createTreeWalker(el, 4); let t, p = ${JSON.stringify(pos)}, hecho = false; const ns = []; while ((t = tw.nextNode())) ns.push(t);
    const tot = ns.reduce((a, x) => a + x.nodeValue.length, 0); if (p === 'fin') p = tot;
    for (const x of ns) { if (p <= x.nodeValue.length) { const r = d.createRange(); r.setStart(x, p); r.collapse(true); w.getSelection().removeAllRanges(); w.getSelection().addRange(r); hecho = true; break; } p -= x.nodeValue.length; }
    if (!hecho) { const r = d.createRange(); r.selectNodeContents(el); r.collapse(p === 0); w.getSelection().removeAllRanges(); w.getSelection().addRange(r); }
    await W(150); return 1;`);
  const poner = async (h, chars) => { await ejs(`if (Ed.blocks) Ed.blocks.clear(); Ed.document.set({ title: 'Prueba', html: ${JSON.stringify(h)}, characters: ${JSON.stringify(chars || {})} }); await W(450); return 1;`); };
  const copiarEvento = tipo => ejs(`const dt = new w.DataTransfer(); const e = new w.ClipboardEvent('${tipo}', { clipboardData: dt, bubbles: true, cancelable: true }); d.dispatchEvent(e); return JSON.stringify({ prevenido: e.defaultPrevented, html: dt.getData('text/html'), texto: dt.getData('text/plain') });`).then(JSON.parse);
  /* qué hay bajo un punto de la ventana (para los mensajes) */
  const queHay = p => ejs(`const el = d.elementFromPoint(${p.x} - O.left, ${p.y} - O.top); return el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().replace(/\\s+/g, '.') : '')) : 'nada';`);
  const Pt = t => `[...d.querySelectorAll('#editor p, #editor li')].find(p => p.textContent.includes(${JSON.stringify(t)}))`;
  const m = { win, js, ejs, hasta, ev, queHay, clic, arrastrar, tecla, escribir, enTexto, enEl, centro, html, limpio, docHtml, sel, cursor, caret, poner, copiarEvento, Pt };
  m.deshacer = async () => { await op.deshacer(m); await espera(350); };
  m.rehacer = async () => { await op.rehacer(m); await espera(350); };
  /* el guion de partida con historial real de Deshacer: «XYZ» tecleado al final del último párrafo */
  m.cargar = async (doc, chars) => {
    await poner(doc || DOC, chars || CH);
    await clic(await enTexto(`[...d.querySelectorAll('#editor > p')].pop()`, 999, 'der', true), { tras: 200 });
    await tecla('End', [], 60);
    await escribir('XYZ');
  };
  /* una operación entra en Deshacer como un paso (el HTML vuelve idéntico) y Rehacer la repite */
  m.conDeshacer = async (nombre, hacer, esperar) => {
    const antes = await html();
    const r = await hacer();
    await espera(250);
    const tras = await html();
    if (esperar) ok(nombre + ' · hace lo esperado', esperar(tras, antes, r), dif(antes, tras));
    ok(nombre + ' · cambió algo', tras !== antes, tras);
    await m.deshacer();
    const des = await html();
    ok(nombre + ' · Deshacer lo devuelve idéntico (un paso)', des === antes, dif(antes, des));
    await m.rehacer();
    const re = await html();
    ok(nombre + ' · Rehacer lo repite', re === tras, dif(tras, re));
    return { antes, tras };
  };
  /* deshace (o rehace) hasta llegar a `meta` (con el HTML limpio), apuntando cada paso */
  m.hastaQue = async (fn, meta, max) => { const pasos = []; for (let i = 0; i < (max || 30); i++) { await fn(); const h = await limpio(); pasos.push(h); if (h === meta) break; } return pasos; };
  return m;
}

/* ============================== los grupos ============================== */

/* 1. la selección de texto que cruza bloques sigue siendo de texto */
async function seleccionTexto(m) {
  const { Pt } = m;
  await m.cargar();
  await m.arrastrar(await m.enTexto(Pt('Parrafo normal uno'), 14), await m.enTexto(Pt('Parrafo normal dos'), 8));
  ok('1a arrastrar por dos párrafos no elige bloques', !(await m.sel()), await m.sel());
  ok('1a y queda la selección de texto', /bastante texto/.test((await m.cursor()).sel), (await m.cursor()).t);
  await m.tecla('Delete', [], 300);
  ok('1a Supr borra solo el texto elegido', /<p>Parrafo normalnormal dos con otro texto\.<\/p><ul>/.test(await m.html()), await m.html());
  await m.deshacer();
  ok('1a y Deshacer lo devuelve', /Parrafo normal uno con bastante texto\.<\/p><p>Parrafo normal dos con otro texto\./.test(await m.html()), await m.html());

  await m.cargar();
  await m.arrastrar(await m.enTexto(Pt('Mara entra'), 10), await m.enTexto(Pt('Donde esta'), 6));
  await m.tecla('Backspace', [], 300);
  const h1 = await m.limpio();
  ok('1b arrastrar de la acción al diálogo + Retroceso: solo lo elegido (la escena y lo de detrás siguen)', /<p class="sp-scene">INT\. COCINA - NOCHE<\/p><p class="sp-action">Mara entraesta todo el mundo hoy\.<\/p><p class="sp-transition">CORTE A:<\/p>/.test(h1), h1);
  await m.deshacer();
  ok('1b y Deshacer devuelve la acción, el personaje, el paréntesis y el diálogo', /Mara entra con una bolsa de pan\.<\/p><p class="sp-character">(<span class="ch-nom">)?MARA/.test(await m.limpio()) && /en voz baja<\/p><p class="sp-dialogue">Donde esta todo el mundo hoy\./.test(await m.limpio()), await m.limpio());

  await m.cargar();
  await m.arrastrar(await m.enTexto(Pt('Parrafo normal uno'), 14), await m.enTexto(Pt('Parrafo normal dos'), 8));
  await m.escribir('q');
  ok('1c escribir encima de una selección de dos párrafos la sustituye', /<p>Parrafo normalqnormal dos con otro texto\.<\/p>/.test(await m.html()) && !(await m.sel()), await m.html());

  await m.cargar();
  await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 5), { tras: 400 });
  await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 5), { veces: 3, tras: 400 });
  const c3 = await m.cursor();
  ok('1d triple clic: selección de texto, sin bloques', !(await m.sel()) && /Parrafo normal uno/.test(c3.sel), (await m.sel()) + ' / ' + c3.t);
  await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 });
  await m.clic(await m.enTexto(Pt('Parrafo normal dos'), 6), { tras: 300, mods: ['shift'] });
  const c4 = await m.cursor();
  ok('1e clic y Mayús+clic en otro párrafo: selección de texto, sin bloques', !(await m.sel()) && /^afo normal uno con bastante texto\.\s+Parraf$/.test(c4.sel), (await m.sel()) + ' / ' + c4.t);
  await m.tecla('b', ['meta'], 300);
  ok('1f Cmd+B con texto de dos párrafos pone negrita', /<b>|font-weight/.test(await m.html()), await m.html());
  await m.deshacer();
  ok('1f y Deshacer la quita', !/<b>|font-weight/.test(await m.html()), await m.html());

  /* triple clic + escribir, Retroceso o pegar: la acción no se funde con el personaje de debajo ni toma su tipo */
  await m.cargar();
  await m.clic(await m.enTexto(Pt('Mara entra'), 5), { veces: 3, tras: 400 });
  await m.escribir('Nueva accion');
  ok('1g triple clic en una acción + escribir: sustituye y el personaje de debajo sigue', /<p class="sp-action">Nueva accion<\/p><p class="sp-character">(<span class="ch-nom">)?MARA/.test(await m.limpio()), await m.limpio());
  await m.deshacer();
  ok('1g y Deshacer', /Mara entra con una bolsa de pan\.<\/p><p class="sp-character"/.test(await m.limpio()), await m.limpio());
  await m.clic(await m.enTexto(Pt('Mara entra'), 5), { veces: 3, tras: 400 });
  await m.tecla('Backspace', [], 300);
  ok('1h triple clic + Retroceso: la acción se queda vacía y el personaje intacto', /<p class="sp-action">(<br>)?<\/p><p class="sp-character">(<span class="ch-nom">)?MARA/.test(await m.limpio()), await m.limpio());
  await m.deshacer();
  await m.clic(await m.enTexto(Pt('Mara entra'), 5), { veces: 3, tras: 400 });
  await m.ejs(`const dt = new w.DataTransfer(); dt.setData('text/plain', 'Pegado aqui'); ed.dispatchEvent(new w.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await W(250); return 1;`);
  ok('1i triple clic + pegar texto: la acción cambia y el personaje sigue', /<p class="sp-action">Pegado aqui<\/p><p class="sp-character">(<span class="ch-nom">)?MARA/.test(await m.limpio()), await m.limpio());
}

/* 2. las operaciones de bloques */
async function bloques(m, op) {
  const { Pt } = m;
  const grip = () => m.enEl(`d.querySelector('.blk-grip')`);
  const menuOp = async (sel) => { await m.clic(await grip(), { tras: 300 }); await m.clic(await m.enEl(`d.querySelector('.blk-menu ${sel}')`), { tras: 350 }); };
  await m.cargar();
  await m.conDeshacer('2a Esc + Supr en la acción', async () => { await m.clic(await m.enTexto(Pt('Mara entra'), 4), { tras: 200 }); await m.tecla('Escape', [], 200); await m.tecla('Delete', [], 300); }, t => !/Mara entra/.test(t) && /INT\. COCINA/.test(t) && /MARA/.test(t));
  await m.cargar();
  await m.conDeshacer('2b asa › Eliminar el diálogo doble', async () => { await m.clic(await m.enTexto(Pt('Y aqui'), 2), { tras: 250 }); await menuOp('[data-op="del"]'); },
    t => !/sp-doble/.test(t) && /revisar esta escena<\/p><p>Parrafo normal uno/.test(t));
  await m.cargar();
  await m.conDeshacer('2c asa › Eliminar un párrafo entre el doble y otro párrafo', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 3), { tras: 250 }); await menuOp('[data-op="del"]'); },
    t => !/normal uno/.test(t) && /<\/div><\/div><p>Parrafo normal dos/.test(t));
  await m.cargar();
  await m.conDeshacer('2d asa › Duplicar el aviso', async () => { await m.clic(await m.enTexto(Pt('Segunda del aviso'), 2), { tras: 250 }); await m.tecla('Escape', [], 200); await m.tecla('Escape', [], 200); await menuOp('[data-op="dup"]'); },
    t => (t.match(/data-rc="aviso"/g) || []).length === 2);
  await m.tecla('Escape', [], 200);
  await m.cargar();
  await m.conDeshacer('2e Cmd+D en el texto duplica el párrafo', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 }); await m.tecla('d', ['meta'], 400); }, t => (t.match(/Parrafo normal uno/g) || []).length === 2);
  await m.cargar();
  await m.conDeshacer('2f Cmd+Shift+↓ mueve el párrafo', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 }); await m.tecla('Down', ['meta', 'shift'], 400); const c = await m.cursor(); ok('2f el cursor sigue en su sitio', /^Parrafo normal uno/.test(c.txt) && c.off === 4, c.t); },
    t => t.indexOf('normal dos') < t.indexOf('normal uno'));
  await m.cargar();
  await m.conDeshacer('2g Cmd+Shift+↑ en un elemento de la lista', async () => { await m.clic(await m.enTexto(Pt('Tercero'), 3), { tras: 200 }); await m.tecla('Up', ['meta', 'shift'], 400); const c = await m.cursor(); ok('2g el cursor sigue en «Tercero»', c.txt === 'Tercero' && c.off === 3, c.t); },
    t => /<li>Primero<\/li><li>Tercero<\/li><li>Segundo<\/li>/.test(t));
  await m.cargar();
  await m.conDeshacer('2h Cmd+Shift+↑ sube el personaje con (V.O.) por encima de la acción', async () => { await m.clic(await m.enTexto(Pt('en voz baja'), 3), { tras: 200 }); await m.tecla('Up', ['meta', 'shift'], 400); },
    t => /<p class="sp-paren">en voz baja<\/p><p class="sp-character"/.test(t));
  await m.cargar();
  await m.conDeshacer('2i asa › Convertir la lista en Texto', async () => { await m.clic(await m.enTexto(Pt('Segundo'), 2), { tras: 250 }); await m.clic(await grip(), { tras: 300 }); await m.ejs(`d.querySelector('.blk-menu [data-op="convert"][data-arg="p"]').click(); await W(300); return 1;`); },
    t => /<p>Primero<\/p><p>Segundo<\/p><p>Tercero<\/p>/.test(t));
  await m.cargar();
  await m.conDeshacer('2j asa › Convertir un párrafo en Encabezado de escena', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal dos'), 2), { tras: 250 }); await m.clic(await grip(), { tras: 300 }); await m.ejs(`d.querySelector('.blk-menu [data-op="convert"][data-arg="sp-scene"]').click(); await W(300); return 1;`); },
    t => /<p class="sp-scene">Parrafo normal dos/.test(t));
  await m.cargar();
  await m.conDeshacer('2k dos bloques elegidos (Esc + Mayús+↓) › Convertir en Lista con viñetas', async () => {
    await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 2), { tras: 200 });
    await m.tecla('Escape', [], 200); await m.tecla('Down', ['shift'], 200);
    await m.clic(await grip(), { tras: 300 });
    await m.ejs(`d.querySelector('.blk-menu [data-op="convert"][data-arg="ul"]').click(); await W(300); return 1;`);
    ok('2k y siguen elegidos los dos', (await m.sel()).split('|').length === 2, await m.sel());
  }, t => /<ul><li>Parrafo normal uno[^<]*<\/li><\/ul><ul><li>Parrafo normal dos/.test(t) || /<ul><li>Parrafo normal uno[^<]*<\/li><li>Parrafo normal dos/.test(t));
  await m.tecla('Escape', [], 200);
  await m.cargar();
  await m.conDeshacer('2l arrastrar por el asa al final de la lista', async () => {
    await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 250 });
    await m.arrastrar(await grip(), await m.enEl(`d.querySelector('#editor > ul')`, undefined, 'b.height - 3'), 14);
  }, t => t.indexOf('Tercero') < t.indexOf('normal uno') && t.indexOf('normal uno') < t.indexOf('Texto del aviso'));
  await m.cargar();
  await m.conDeshacer('2m Esc + Mayús+↓ (dos bloques) + Cmd+D', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 }); await m.tecla('Escape', [], 200); await m.tecla('Down', ['shift'], 200); await m.tecla('d', ['meta'], 400); ok('2m y quedan elegidas las copias', /normal uno.*\|.*normal dos/.test(await m.sel()), await m.sel()); },
    t => (t.match(/Parrafo normal uno/g) || []).length === 2 && (t.match(/Parrafo normal dos/g) || []).length === 2);
  await m.tecla('Escape', [], 200);
  await m.cargar();
  await m.conDeshacer('2n Esc + Supr en un párrafo del aviso', async () => { await m.clic(await m.enTexto(Pt('Segunda del aviso'), 3), { tras: 200 }); await m.tecla('Escape', [], 200); await m.tecla('Delete', [], 300); },
    t => /data-rc="aviso"[^>]*><p>Texto del aviso\.<\/p><\/div>/.test(t));
  await m.cargar();
  await m.conDeshacer('2o Esc + cortar (evento cut)', async () => { await m.clic(await m.enTexto(Pt('Parrafo normal dos'), 4), { tras: 200 }); await m.tecla('Escape', [], 200); const c = await m.copiarEvento('cut'); ok('2o lo cortado lleva el bloque', c.prevenido && /Parrafo normal dos/.test(c.html), JSON.stringify(c)); },
    t => !/Parrafo normal dos/.test(t));

  /* tras Deshacer, Retroceso no borra un bloque viejo; Esc + letra; Esc en un li */
  await m.cargar();
  await m.clic(await m.enTexto(Pt('Parrafo normal dos'), 4), { tras: 200 });
  await m.tecla('Escape', [], 200);
  await m.deshacer();
  ok('2p Esc y Deshacer: nada elegido', !(await m.sel()), await m.sel());
  await m.tecla('Backspace', [], 300);
  ok('2p y Retroceso no borra el bloque de antes', /Parrafo normal dos con otro texto/.test(await m.html()), await m.html());
  await m.cargar();
  await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 7), { tras: 200 });
  await m.tecla('Escape', [], 200);
  ok('2q Esc elige el bloque', /normal uno/.test(await m.sel()), await m.sel());
  await m.escribir('q');
  ok('2q una letra tras Esc se escribe donde estaba el cursor', /Parrafoq normal uno/.test(await m.html()) && !(await m.sel()), await m.html());
  await m.cargar();
  await m.clic(await m.enTexto(Pt('Segundo'), 3), { tras: 200 });
  await m.tecla('Escape', [], 200);
  ok('2r Esc en un elemento de la lista elige solo ese elemento', /^li:Segundo$/.test(await m.sel()), await m.sel());
  ok('2r con un bloque elegido, Ed.document.get() no lleva «blk-selected»', !/blk-selected/.test(await m.docHtml()), await m.docHtml());
  const c = await m.copiarEvento('copy');
  ok('2r copiar el elemento: dentro de su lista y sin «blk-selected»', /^<ul><li>Segundo<\/li><\/ul>$/.test(c.html) && c.prevenido, JSON.stringify(c));
  await m.tecla('Delete', [], 300);
  ok('2r y Supr quita solo ese elemento', /<ul><li>Primero<\/li><li>Tercero<\/li><\/ul>/.test(await m.html()), await m.html());
  await m.deshacer();
  ok('2r Deshacer lo devuelve', /<ul><li>Primero<\/li><li>Segundo<\/li><li>Tercero<\/li><\/ul>/.test(await m.html()), await m.html());
  if (op && op.cmdX) {
    await m.cargar();
    await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 });
    await m.tecla('Escape', [], 200);
    await m.tecla('x', ['meta'], 400);
    ok('2s Cmd+X con el bloque elegido lo corta', !/Parrafo normal uno/.test(await m.html()), await m.html());
    await m.deshacer();
    ok('2s y Deshacer lo devuelve', /Parrafo normal uno con bastante texto/.test(await m.html()), await m.html());
  }
}

/* 3. Deshacer del guion */
async function deshacerGuion(m) {
  const G = i => `ed.children[${i}]`;
  const hayDup = h => /MARA.*MARA|Hola\..*Hola\.|Mara entra\..*Mara entra\.|INT\..*INT\./.test(h.replace(/<[^>]+>/g, ' '));
  /* escribir escena, acción, personaje y diálogo; deshacer hasta el principio y rehacer hasta el final */
  const ini = '<p class="sp-scene"><br></p>';
  await m.poner(ini);
  await m.caret(G(0), 0);
  await m.escribir('INT. CASA - NOCHE');
  await m.tecla('Enter', [], 400);
  await m.escribir('Mara entra.');
  await m.tecla('Tab', [], 400);
  await m.escribir('MARA');
  await m.tecla('Enter', [], 400);
  await m.escribir('Hola.');
  await espera(1500);                                            // pasa el autoguardado
  const fin = await m.limpio();
  ok('3a escena, Enter, acción, Tab, personaje, Enter, diálogo', /^<p class="sp-scene">INT\. CASA - NOCHE<\/p><p class="sp-action">Mara entra\.<\/p><p class="sp-character">MARA<\/p><p class="sp-dialogue">Hola\.<\/p>$/.test(fin.replace(/&nbsp;/g, ' ')), fin);
  const atras = await m.hastaQue(m.deshacer, ini, 30);
  console.log('    (' + atras.length + ' pasos de Deshacer hasta el principio)' + (process.env.DETALLE ? '\n' + lista(atras) : ''));
  ok('3a deshacer paso a paso llega al principio', atras[atras.length - 1] === ini, lista(atras));
  ok('3a sin duplicados («MARAMARA») por el camino', !atras.some(hayDup), lista(atras));
  const adelante = await m.hastaQue(m.rehacer, fin, 30);
  ok('3a rehacer paso a paso llega al final', adelante[adelante.length - 1] === fin, 'fin: ' + fin + '\n' + lista(adelante));
  ok('3a sin duplicados al rehacer', !adelante.some(hayDup), lista(adelante));

  /* Tab, Mayús+Tab y Ctrl+1…6: cada uno un paso, sin mover el cursor */
  const ini2 = '<p class="sp-action">Texto de accion</p><p class="sp-dialogue">Hola.</p>';
  await m.poner(ini2);
  await m.caret(G(0), 3);
  const estados = [await m.limpio()];
  const teclas = [['Tab', []], ['Tab', ['shift']], ['1', ['control']], ['3', ['control']], ['4', ['control']], ['6', ['control']], ['5', ['control']], ['2', ['control']]];
  for (const [k, mods] of teclas) { await m.tecla(k, mods, 300); estados.push(await m.limpio()); }
  const clases = estados.map(h => (h.match(/^<p class="([^"]+)"/) || [])[1]);
  ok('3b Tab, Mayús+Tab y Ctrl+1, 3, 4, 6, 5, 2 cambian el tipo', clases.join(',') === 'sp-action,sp-character,sp-action,sp-scene,sp-character,sp-paren,sp-transition,sp-dialogue,sp-action', clases.join(','));
  const c = await m.cursor();
  ok('3b sin mover el cursor', c.off === 3 && /^Texto de accion/i.test(c.txt), c.t);
  let bien = true; const vistos = [];
  for (let i = estados.length - 2; i >= 0; i--) { await m.deshacer(); const h = await m.limpio(); vistos.push(h); if (h !== estados[i]) bien = false; }
  ok('3b cada cambio de tipo se deshace solo, de uno en uno, hasta el principio', bien && vistos[vistos.length - 1] === ini2, lista(vistos) + '\nesperado:\n' + lista(estados.slice(0, -1).reverse()));
  bien = true; const re = [];
  for (let i = 1; i < estados.length; i++) { await m.rehacer(); const h = await m.limpio(); re.push(h); if (h !== estados[i]) bien = false; }
  ok('3b y se rehacen de uno en uno', bien, lista(re));

  /* los atajos Markdown */
  for (const [txt, re1] of [['- item', /<ul><li>item<\/li><\/ul>/], ['> cita', /<blockquote><p>cita<\/p><\/blockquote>/], ['# Titulo', /<h1>Titulo<\/h1>/]]) {
    const i3 = '<p>Uno</p><p><br></p>';
    await m.poner(i3);
    await m.caret(G(1), 0); await m.escribir(txt);
    const h = await m.limpio();
    const at = await m.hastaQue(m.deshacer, i3, 6);
    ok(`3c «${txt}» se convierte y Deshacer vuelve atrás sin dejar la lista, la cita o el título`, re1.test(h) && at.some(x => /<p>[-#>][^<]*<\/p>$/.test(x.replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>'))) && !/<(ul|ol|blockquote|h1)/.test(at[at.length - 1]), h + '\n' + lista(at));
  }

  /* el personaje soltado con doble espacio, y con «.» (lo que pone macOS con el doble espacio) */
  const i4 = '<p class="sp-character"><br></p>';
  await m.poner(i4);
  await m.caret(G(0), 0);
  await m.escribir('MARA'); await m.escribir(' '); await m.escribir(' ');
  const suelto = await m.limpio();
  ok('3d «MARA» + doble espacio suelta al personaje', /<span class="ch-nom">MARA<\/span>/.test(suelto), suelto);
  await m.tecla('Enter', [], 400);
  await m.escribir('Hola.');
  const f4 = await m.limpio();
  ok('3d y Enter lleva al diálogo con el nombre solo', /<p class="sp-character">(<span class="ch-nom">)?MARA(<\/span>)?(&nbsp;| )*<\/p><p class="sp-dialogue">Hola\.<\/p>/.test(f4), f4);
  const a4 = await m.hastaQue(m.deshacer, i4, 12);
  ok('3d deshacer llega al principio sin «MARAMARA»', a4[a4.length - 1] === i4 && !a4.some(hayDup), lista(a4));
  const r4 = await m.hastaQue(m.rehacer, f4, 12);
  ok('3d y rehacer vuelve a lo escrito', r4[r4.length - 1] === f4, lista(r4));
  await m.poner(i4);
  await m.caret(G(0), 0);
  await m.escribir('ANA'); await m.escribir(' '); await m.escribir('.');
  const p5 = await m.limpio();
  ok('3e «ANA» + espacio + «.»: suelta al personaje y no escribe el punto', /<span class="ch-nom">ANA<\/span>/.test(p5) && !/ANA\./.test(p5.replace(/<[^>]+>/g, '')), p5);
  await m.escribir('(V.O.)');
  await m.tecla('Enter', [], 400);
  await m.escribir('Si.');
  const f5 = await m.limpio();
  ok('3e la anotación se queda detrás del nombre', /ANA(<\/span>)?(&nbsp;| )+\(V\.O\.\)<\/p><p class="sp-dialogue">Si\.<\/p>/.test(f5), f5);
  const a5 = await m.hastaQue(m.deshacer, i4, 14);
  ok('3e deshacer llega al principio sin «ANAANA»', a5[a5.length - 1] === i4 && !a5.some(h => /ANA.*ANA/.test(h.replace(/<[^>]+>/g, ' '))), lista(a5));

  /* «/» tras Enter en una línea vacía y elegir Personaje: deshacer no deja «/personaje» */
  const i6 = '<p class="sp-dialogue">Hola.</p>';
  await m.poner(i6);
  await m.caret(G(0), 'fin'); await m.tecla('Enter', [], 300); await m.tecla('Enter', [], 300);
  await m.escribir('personaje'); await m.tecla('Enter', [], 400);
  const h6 = await m.limpio();
  await m.escribir('LUIS');
  const a6 = await m.hastaQue(m.deshacer, i6, 8);
  ok('3f «/» → Personaje: un personaje, y deshacer no deja «/» ni «personaje»', /sp-character/.test(h6) && a6[a6.length - 1] === i6 && !a6.some(h => /personaj|\//.test(h.replace(/<[^>]+>/g, ''))), h6 + '\n' + lista(a6));

  /* **Lo tecleado es un solo paso de Deshacer aunque haya un menú de sugerencias abierto** (29-09-2026): los menús se repintaban
     con innerHTML en cada tecla y Chrome, al quitarse cualquier nodo de la página fuera de un execCommand, cerraba la agrupación
     de lo tecleado: «CORTE A» eran seis pasos de Deshacer, uno por letra (lo mismo el contador de páginas, que se reescribía con
     textContent a los 120 ms de cada pausa: escribiendo despacio, cada letra se deshacía sola). */
  const txt = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  const i7 = '<p class="sp-transition"><br></p>';
  await m.poner(i7);
  await m.caret(G(0), 0);
  await m.escribir('CORTE A');
  const abierto7 = await m.ejs(`return Ed.formato.abierto();`);
  const h7 = await m.limpio();
  await m.deshacer();
  const d7 = await m.limpio();
  ok('3g «CORTE A» en una transición, con las sugerencias abiertas: un solo Deshacer lo quita entero', abierto7 && txt(h7) === 'CORTE A' && /^<p class="sp-transition">/.test(d7) && txt(d7) === '', 'menú ' + abierto7 + ' · ' + h7 + ' ⟶ ' + d7);
  await m.tecla('Escape', [], 150);
  const i8 = '<p class="sp-scene">INT. CASA DE MARA - DIA</p><p class="sp-action">Algo.</p><p class="sp-scene"><br></p>';
  await m.poner(i8);
  await m.caret(G(2), 0);
  await m.escribir('INT. CAS');
  const abierto8 = await m.ejs(`return Ed.formato.abierto();`);
  await m.escribir('A - NOC');
  const abierto8b = await m.ejs(`return Ed.formato.abierto();`);
  await m.escribir('HE');
  const h8 = await m.limpio();
  const a8 = await m.hastaQue(m.deshacer, i8, 8);
  const ult = h => txt(h).replace(/^INT\. CASA DE MARA - DIAAlgo\./, '');
  /* «int.» → «INT.» es su propio paso (la conversión sustituye lo tecleado); lo de antes y lo de después, uno cada uno */
  ok('3g «INT. CASA - NOCHE» con las sugerencias de lugar y de momento abiertas: Deshacer quita «CASA - NOCHE» de una vez, luego la conversión y luego «INT»',
    abierto8 && abierto8b && ult(h8) === 'INT. CASA - NOCHE' && a8.length === 3 && ult(a8[0]) === 'INT.' && ult(a8[2]) === '' && a8[2] === i8,
    'menú ' + abierto8 + '/' + abierto8b + ' · ' + h8 + '\n' + lista(a8.map(ult)));
  await m.tecla('Escape', [], 150);
  /* el menú de personajes, igual */
  const i9 = '<p class="sp-character">MARTA</p><p class="sp-dialogue">Hola.</p><p class="sp-character"><br></p>';
  await m.poner(i9, { MARTA: { name: 'MARTA', color: 3 } });
  await m.caret(G(2), 0);
  await m.escribir('MAR');
  const abierto9 = await m.ejs(`return Ed.characters.isOpen();`);
  const h9 = await m.limpio();
  await m.deshacer();
  const d9 = await m.limpio();
  ok('3g «MAR» en un personaje, con sus sugerencias abiertas: un solo Deshacer lo quita entero', abierto9 && /<p class="sp-character">MAR<\/p>$/.test(h9) && d9 === i9, 'menú ' + abierto9 + ' · ' + h9 + ' ⟶ ' + d9);
  await m.tecla('Escape', [], 150);
  /* escribiendo despacio (pausas de más de 120 ms: el cálculo de páginas corre entre letra y letra) */
  const i10 = '<p class="sp-scene">INT. COCINA - NOCHE</p><p class="sp-action"><br></p>';
  await m.poner(i10);
  await m.caret(G(1), 0);
  await m.escribir('Mara entra.', 220);
  const h10 = await m.limpio();
  await m.deshacer();
  const d10 = await m.limpio();
  ok('3g escribiendo despacio una acción, un solo Deshacer la quita entera', /Mara entra\.<\/p>$/.test(h10) && d10 === i10, h10 + ' ⟶ ' + d10);
}

/* 4. no se pierde texto */
async function noSePierde(m, op) {
  const G = i => `ed.children[${i}]`;
  await m.poner('<p class="sp-character">ANA LUZ</p>');
  await m.caret(G(0), 4); await m.escribir(' ');
  const a = await m.limpio();
  await m.poner('<p class="sp-character">ANA LUZ</p>');
  await m.caret(G(0), 4); await m.escribir('.');
  const b = await m.limpio();
  await m.poner('<p class="sp-character">MARA (V.O.)</p>');
  await m.caret(G(0), 5); await m.escribir('(');
  const c = await m.limpio();
  ok('4a en medio de un nombre, espacio, «.» y «(» no borran lo de detrás', /LUZ/.test(a) && /LUZ/.test(b) && /V\.O\./.test(c), [a, b, c].join('\n'));

  await m.poner('<p class="sp-paren"><br></p><p class="sp-action">x</p>');
  await m.caret(G(0), 0); await m.escribir('mira (a Juan)');
  const p1 = await m.limpio();
  await m.escribir(')');
  const p2 = await m.limpio();
  await m.caret(G(1), 'fin'); await espera(300);
  const p3 = await m.limpio();
  await m.poner('<p class="sp-note"><br></p>');
  await m.caret(G(0), 0); await m.escribir('ver [escena 3]]');
  const n1 = await m.limpio();
  ok('4b «)» y «]» se escriben si cierran uno abierto, y no si sobran', /mira \(a Juan\)<\/p>/.test(p1) && p1 === p2 && /ver \[escena 3\]<\/p>/.test(n1), [p1, p2, n1].join('\n'));
  ok('4b al salir del paréntesis, «mira (a Juan)» se queda entero', /mira \(a Juan\)<\/p>/.test(p3), p3);

  for (const [nombre, ini, esperado, clase] of [
    ['una acción vacía encima de una escena', '<p class="sp-action">Algo.</p><p class="sp-action"><br></p><p class="sp-scene">INT. CASA - DIA</p>', '<p class="sp-action">Algo.</p><p class="sp-scene">INT. CASA - DIA</p>', 'sp-scene'],
    ['una línea vacía sin clase encima de un personaje', '<p class="sp-dialogue">Hola.</p><p><br></p><p class="sp-character">JULIO</p>', '<p class="sp-dialogue">Hola.</p><p class="sp-character">JULIO</p>', 'sp-character']]) {
    await m.poner(ini);
    await m.caret(G(2), 0); await m.tecla('Backspace', [], 300);
    const h = await m.limpio(), cu = await m.cursor();
    ok('4c Retroceso con ' + nombre + ': se va la línea vacía y el bloque conserva su tipo', h === esperado && cu.clase === clase && cu.off === 0, h + ' · ' + cu.t);
    await m.deshacer();
    ok('4c y Deshacer la devuelve', (await m.limpio()) === ini, await m.limpio());
  }

  await m.ejs(`w.__archivo = 0; if (!w.__archivoParcheado) { w.__archivoParcheado = 1; const c = w.HTMLInputElement.prototype.click; w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') { w.__archivo++; return; } return c.call(this); }; } return 1;`);
  const menuSlash = () => m.ejs(`const mm = Array.from(d.querySelectorAll('.slash-menu')).find(x => !x.hidden); return mm ? (mm.querySelector('.active') || {}).textContent || '(sin marca)' : null;`);
  await m.poner('<p class="sp-dialogue">Hola.</p>');
  await m.caret(G(0), 'fin');
  await m.tecla('Enter', [], 300);
  await m.tecla('Enter', [], 300);
  const marca = await menuSlash(), h1 = await m.limpio();
  await m.tecla('Enter', [], 400);
  const h2 = await m.limpio(), abierto = await menuSlash(), arch = await m.ejs(`return w.__archivo;`);
  ok('4d Enter en una línea vacía: el menú «/» con «Acción» marcada y sin «/» en el texto', /Acción/.test(marca || '') && !/\//.test(h1.replace(/<[^>]+>/g, '')), marca + '\n' + h1);
  ok('4d otro Enter: se cierra, la línea queda vacía y no se abre el selector de imagen', !abierto && arch === 0 && /Hola\.<\/p><p( class="sp-action")?><br><\/p>$/.test(h2), h2 + ' · menú ' + abierto + ' · selector de archivo abierto ' + arch + ' veces');

  const menuSug = () => m.ejs(`const mm = Array.from(d.querySelectorAll('.sug-menu')).find(x => !x.hidden); return mm ? mm.textContent : null;`);
  await m.poner('<p class="sp-scene">INT. CASA DE MARA - NOCHE</p><p class="sp-scene"><br></p>');
  await m.caret(G(1), 0); await m.escribir('int casa');
  const m1 = await menuSug();
  await m.tecla('Enter', [], 400);
  const s1 = await m.limpio();
  ok('4e «int casa» + Enter sin elegir con las flechas: no acepta la sugerencia, pasa a la acción', !!m1 && /INT\. casa<\/p><p class="sp-action"><br><\/p>/.test(s1), 'menú: ' + m1 + '\n' + s1);
  await m.poner('<p class="sp-scene">INT. CASA DE MARA - NOCHE</p><p class="sp-scene"><br></p>');
  await m.caret(G(1), 0); await m.escribir('int casa');
  await m.tecla('Down', [], 150); await m.tecla('Up', [], 150); await m.tecla('Enter', [], 400);
  const s2 = await m.limpio();
  ok('4e con las flechas + Enter sí la acepta', /INT\. CASA DE MARA -(&nbsp;| )/.test(s2.split('</p>')[1] || ''), s2);

  /* un clic bajo una lista final: la línea nueva va detrás de la lista, no dentro */
  await m.poner('<p>Uno</p><ul><li>Primero</li><li>Ultimo</li></ul>');
  await m.clic(await m.enTexto(m.Pt('Uno'), 1), { tras: 200 });
  await m.escribir('k');
  const bajo = await m.enEl(`d.querySelector('#editor > ul')`, '20', 'b.height + 70');
  await m.conDeshacer('4f clic bajo la lista final', async () => { await m.clic(bajo, { tras: 300 }); }, t => /<\/ul><p><br><\/p>/.test(t) && !/<li>[^<]*<p>/.test(t));
  await m.clic(bajo, { tras: 300 });
  await m.escribir('fin');
  ok('4f lo escrito va detrás de la lista', /<\/ul>(<p><br><\/p>)*<p>fin<\/p>$/.test(await m.html()), await m.html());
}

/* 5. clics fuera del texto */
async function clics(m) {
  const { Pt } = m;
  await m.cargar();
  await m.clic(await m.enTexto(Pt('Parrafo normal uno'), 4), { tras: 200 });
  const pj = await m.enEl(`[...d.querySelectorAll('#editor > p.sp-character')][0]`, '-40', undefined, true);
  const bajo = await m.queHay(pj);
  await m.clic(pj, { tras: 300 });
  const c1 = await m.cursor();
  ok('5a clic en el margen a la izquierda del personaje: el cursor va a ese bloque', /^MARA/.test(c1.txt) && c1.off === 0, c1.t + ' · bajo el puntero: ' + bajo);
  await m.escribir('Q');
  ok('5a y lo escrito va ahí', /QMARA/.test(await m.ejs(`return ed.textContent;`)), await m.html());
  await m.cargar();
  const pj2 = await m.enEl(`[...d.querySelectorAll('#editor > p.sp-character')][0]`, 'b.width + 120', undefined, true);
  await m.clic(pj2, { tras: 300 });
  const c2 = await m.cursor();
  ok('5b clic a la derecha de una línea estrecha: al final de ese bloque', /^MARA/.test(c2.txt) && c2.off === c2.len, c2.t);
  const gris = JSON.parse(await m.ejs(`const p = [...d.querySelectorAll('#editor > p.sp-dialogue')][0], b = p.getBoundingClientRect(), hoja = ed.getBoundingClientRect(), ws = d.getElementById('workspace').getBoundingClientRect();
    return JSON.stringify({ x: O.left + Math.max(ws.left + 4, hoja.left - 12), y: O.top + b.top + b.height / 2, hay: hoja.left - ws.left });`));
  if (gris.hay > 10) {
    await m.clic(gris, { tras: 300 });
    const c3 = await m.cursor();
    ok('5c clic en el gris a la izquierda de la hoja, a la altura del diálogo: el cursor va a ese bloque', /^Donde esta/.test(c3.txt) && c3.off === 0, c3.t);
  } else ok('5c (sin gris a los lados de la hoja: no se prueba)', true);

  /* con un guion largo, a media hoja: el cursor va a esa altura, lo escrito va ahí y la vista no salta */
  await m.poner(guionLargo(14));
  await m.hasta(`return true;`);
  await espera(900);
  const r = JSON.parse(await m.ejs(`const ps = [...ed.querySelectorAll(':scope > p.sp-dialogue')]; const p = ps[Math.floor(ps.length / 2)]; p.id = 'objetivo'; p.scrollIntoView({ block: 'center' }); await W(400);
    const ws = d.getElementById('workspace'), b = p.getBoundingClientRect(), hoja = ed.getBoundingClientRect(), wr = ws.getBoundingClientRect();
    return JSON.stringify({ margen: { x: O.left + hoja.left + 8, y: O.top + b.top + b.height / 2 }, gris: { x: O.left + Math.max(wr.left + 4, hoja.left - 12), y: O.top + b.top + b.height / 2 }, hay: hoja.left - wr.left, top: ws.scrollTop, txt: p.textContent });`));
  for (const [nombre, punto] of [['el margen izquierdo de la hoja', r.margen], ['el gris al lado de la hoja', r.gris]]) {
    if (nombre.startsWith('el gris') && r.hay <= 10) { ok('5d (sin gris a los lados de la hoja)', true); continue; }
    await m.ejs(`const p = d.getElementById('objetivo'); p.scrollIntoView({ block: 'center' }); await W(300); return 1;`);
    const top0 = await m.ejs(`return d.getElementById('workspace').scrollTop;`);
    await m.clic(punto, { tras: 400 });
    const cu = await m.cursor(), top1 = await m.ejs(`return d.getElementById('workspace').scrollTop;`);
    ok('5d clic en ' + nombre + ' a media hoja: el cursor va a ese diálogo y la vista no salta', cu.txt === r.txt && Math.abs(top1 - top0) < 60, cu.t + ' · desplazamiento ' + top0 + ' → ' + top1);
    await m.escribir('W');
    const donde = await m.ejs(`return [...ed.children].findIndex(x => x.textContent.includes('W'));`), idx = await m.ejs(`return [...ed.children].indexOf(d.getElementById('objetivo'));`);
    const top2 = await m.ejs(`return d.getElementById('workspace').scrollTop;`);
    ok('5d y lo escrito va a ese diálogo, sin saltar al final', donde === idx && Math.abs(top2 - top0) < 80, 'W en el bloque ' + donde + ' (objetivo ' + idx + ') · desplazamiento ' + top0 + ' → ' + top2);
    await m.tecla('Backspace', [], 200);
  }
  const salto = await m.ejs(`const ps = [...ed.querySelectorAll(':scope > p')]; const p = ps.find(x => parseFloat(getComputedStyle(x).marginTop) > 40); if (!p) return null; p.scrollIntoView({ block: 'center' }); await W(300); const b = p.getBoundingClientRect(); return JSON.stringify({ x: O.left + b.left + 30, y: O.top + b.top - 30, t: p.textContent });`);
  if (salto) {
    const s = JSON.parse(salto);
    await m.clic(s, { tras: 300 });
    const cu = await m.cursor();
    ok('5e clic en el hueco de un salto de página: el cursor va a un bloque de al lado', cu.off >= 0 && cu.txt.length > 0, cu.t + ' (bloque tras el salto: ' + s.t + ')');
  } else ok('5e hay un salto de página en el guion largo', false, 'no se encontró un bloque con margen de salto');
}

/* 6. ClapCraft: cambiar de vista, Claude, recargar, Buscar, Versiones y el tablero escondido */
async function clapcraft(m, errores) {
  const G = i => `ed.children[${i}]`;
  const foco = () => m.js(`const F = document.getElementById('editorMarco'); return document.activeElement === F ? 'marco/' + (F.contentDocument.activeElement.id || F.contentDocument.activeElement.tagName) : (document.activeElement.id || document.activeElement.className || document.activeElement.tagName);`);
  const clicFin = async i => { await m.clic(await m.enTexto(G(i), 999, 'der', true), { tras: 250 }); };

  /* al esquema y de vuelta */
  await m.poner('<p class="sp-action">Antes.</p><p class="sp-action">Otra.</p>');
  await clicFin(0);
  await m.escribir(' Nuevo');
  await espera(1300);
  await m.js(`Claquedraw.app.vista('esquema'); await W(500); Claquedraw.app.vista('texto'); await W(1300); return 1;`);
  await clicFin(1);
  const a = await m.limpio();
  await m.deshacer();
  const b = await m.limpio();
  ok('6a tras ir al esquema y volver, Deshacer (menú) aún deshace lo escrito', /Nuevo/.test(a) && !/Nuevo/.test(b) && /Antes\./.test(b), a + '\n' + b);
  await m.rehacer();
  ok('6a y Rehacer lo devuelve', /Antes\. Nuevo/.test((await m.limpio()).replace(/&nbsp;/g, ' ')), await m.limpio());

  /* recargar el documento (un personaje renombrado, una versión): Deshacer sigue */
  await m.poner('<p class="sp-action">Recarga.</p>');
  await clicFin(0);
  await m.escribir(' Escrito');
  await espera(1300);
  await m.js(`const id = Claquedraw.texto.clave(); const n = Claquedraw.gestor.documentos().nota(id); Claquedraw.texto.recargar({ titulo: n.titulo, html: n.html, characters: n.characters }); await W(600); return 1;`);
  const r0 = await m.limpio();
  await m.deshacer();
  const r1 = await m.limpio();
  ok('6b tras recargar el documento, Deshacer aún deshace lo escrito', /Escrito/.test(r0) && !/Escrito/.test(r1), r0 + '\n' + r1);

  /* Claude cambia el documento: su cambio se deshace como un paso y después lo de Leo */
  await m.poner('<p class="sp-action">Primero.</p><p class="sp-action">Segundo.</p><p class="sp-action">Tercero.</p>');
  await clicFin(1);
  await m.escribir(' abc');
  await espera(1300);
  const rc = await m.js(`const r = await Claquedraw.app.ejecutarEnVivo('escribir_documento', { esquema: 'Esquema', modo: 'anadir', contenido: 'Todo termina aqui.' }); await W(900); return JSON.stringify(r).slice(0, 200);`);
  const c0 = await m.limpio();
  ok('6c lo de Claude está en el editor y el foco sigue en él', /termina aqui/.test(c0) && /marco\/editor/.test(await foco()), rc + '\n' + c0 + ' · foco ' + (await foco()));
  await m.escribir('Q');
  ok('6c lo que se escribe va donde estaba el cursor', /Segundo\. abcQ/.test((await m.limpio()).replace(/&nbsp;/g, ' ')), await m.limpio());
  await m.deshacer();
  ok('6c Deshacer quita la Q', !/abcQ/.test(await m.limpio()) && /abc/.test(await m.limpio()), await m.limpio());
  await m.deshacer();
  const c2 = await m.limpio();
  ok('6c Deshacer otra vez quita lo de Claude (un paso)', !/termina aqui/.test(c2) && /abc/.test(c2), c2);
  await m.deshacer();
  ok('6c y otra, lo escrito por Leo', !/abc/.test(await m.limpio()) && /Segundo\./.test(await m.limpio()), await m.limpio());

  /* Buscar: el primer Deshacer no se gasta en vacío */
  await m.poner('<p>Texto base.</p>');
  await clicFin(0);
  await m.escribir(' dos');
  await m.tecla('f', ['meta'], 400);
  await m.escribir('zz');
  await m.tecla('Escape', [], 300);
  await clicFin(0);
  await m.deshacer();
  ok('6d tras escribir en Buscar, el primer Deshacer deshace el editor', !/dos/.test(await m.limpio()) && /Texto base\./.test(await m.limpio()), await m.limpio());

  /* el menú de Versiones: tras cerrarlo con Esc, lo tecleado llega al editor */
  await m.poner('<p class="sp-action">Uno.</p><p class="sp-action">Dos.</p><p class="sp-action">Tres.</p>');
  await clicFin(1);
  await m.clic(await m.enEl(`d.getElementById('cdVersiones')`), { tras: 500 });
  const abierto = await m.js(`return !!document.querySelector('.gd-pop');`);
  await m.tecla('Escape', [], 400);
  ok('6e Versiones + Esc: el menú se cierra y el foco vuelve al editor', abierto && !(await m.js(`return !!document.querySelector('.gd-pop:not([hidden])');`)) && /marco\/editor/.test(await foco()), 'abierto ' + abierto + ' · foco ' + (await foco()));
  await m.escribir('VV');
  ok('6e y lo tecleado va al bloque del cursor', /Dos\.VV<\/p>/.test(await m.limpio()), await m.limpio());

  /* el tablero escondido no oye Supr ni Retroceso */
  const T = `Claquedraw.gestor.documentos().esquema(Claquedraw.app.esquemaMontado()).esquema.datos`;
  const nodos = () => m.js(`return ${T}.puntos.length;`);
  const dlg = () => m.js(`const d = document.querySelector('#dlg'); const o = !!(d && d.open); if (o) { const b = [...d.querySelectorAll('button')].find(x => /cancel/i.test(x.textContent)) || d.querySelector('button'); b.click(); } return o;`);
  const rc2 = await m.js(`const t = ${T}.lineas[0].id; const r = await Claquedraw.app.ejecutarEnVivo('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: t, columna: 2, titulo: 'Nodo uno' }, { op: 'crear_nodo', trama: t, columna: 4, titulo: 'Nodo dos' }] }); await W(600); return JSON.stringify(r).slice(0, 200);`);
  await m.js(`Claquedraw.app.vista('esquema'); await W(700); return 1;`);
  const n0 = await nodos();
  const p1 = await m.centro(`document.querySelectorAll('#board .pt .dot')[0]`), p2 = await m.centro(`document.querySelectorAll('#board .pt .dot')[1]`);
  if (p1 && p2) { await m.clic(p1, { tras: 500 }); await m.clic(p2, { tras: 500, mods: ['shift'] }); }
  const elegidos = await m.js(`return Tramas.tablero.elegidos ? Tramas.tablero.elegidos().nodos.length : -1;`);
  await m.js(`Claquedraw.app.vista('texto'); await W(1300); return 1;`);
  ok('6f (hay dos nodos en el tablero y alguno elegido)', n0 === 2 && elegidos >= 1, rc2 + ' · nodos ' + n0 + ' · elegidos ' + elegidos);
  await clicFin(0);
  await m.tecla('Escape', [], 200);
  await m.tecla('Delete', [], 400);
  const d1 = await dlg();
  ok('6f con el editor delante, Esc + Supr borra el bloque del editor y no toca el tablero', !d1 && (await nodos()) === 2 && !/Uno\./.test(await m.limpio()), 'diálogo ' + d1 + ' · nodos ' + (await nodos()) + ' · ' + (await m.limpio()));
  await clicFin(0);
  await m.tecla('Delete', [], 300); await m.tecla('Backspace', [], 300);
  const d2 = await dlg();
  ok('6f Supr y Retroceso escribiendo no llegan al tablero', !d2 && (await nodos()) === 2, 'diálogo ' + d2 + ' · nodos ' + (await nodos()));
  await m.js(`document.activeElement.blur(); document.getElementById('editorMarco').blur(); return 1;`);
  await m.tecla('Backspace', [], 500); await m.tecla('Delete', [], 500);
  const d3 = await dlg();
  ok('6f con el foco suelto en la vista Texto, Supr y Retroceso no piden borrar nodos del tablero escondido', !d3 && (await nodos()) === 2, 'diálogo ' + d3 + ' · nodos ' + (await nodos()));
}

/* ============================== en marcha ============================== */
async function correr(nombre, fn) {
  if (FILTRO && !nombre.includes(FILTRO)) return;
  console.log('\n  · ' + nombre);
  try { await fn(); } catch (e) { ok(nombre + ' sin excepciones', false, e && e.stack); }
}

async function parteApp(errores) {
  let win = null;
  for (let i = 0; i < 300 && !win; i++) { await espera(50); win = BrowserWindow.getAllWindows().find(x => /claquedraw\.html/.test(x.webContents.getURL() || '')); }
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const m = manos(win, errores, {
    marco: true,
    deshacer: async () => { menuItem('Deshacer').click(); },
    rehacer: async () => { menuItem('Rehacer').click(); }
  });
  win.setBounds({ x: 40, y: 40, width: 1300, height: 950 }); win.show(); win.focus(); win.webContents.focus();
  lugar = 'ClapCraft · ';
  console.log('\nClapCraft · prueba del editor en ' + TMP + '\n\n  ClapCraft (el documento de un esquema)');
  await m.hasta(`return !!(window.Claquedraw && Claquedraw.app);`, 15000);
  await m.js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Editor', plantilla: 'blanco' }); await W(900); return true;`);
  await m.hasta(`return !!document.querySelector('#rows .row');`, 10000);
  await m.js(`Claquedraw.app.vista('esquema'); await W(300); document.querySelector('#abrirDoc').click(); await W(1200); return 1;`);
  const listo = await m.hasta(`const f = document.getElementById('editorMarco'); return document.body.classList.contains('vista-texto') && !!(f && f.contentWindow && f.contentWindow.Ed && f.contentWindow.Ed.blocks && f.offsetWidth > 100);`, 10000);
  ok('«Abrir documento» abre el documento del esquema en la vista Texto', listo);
  /* el portapapeles del marco, de mentira: execCommand('copy'/'cut') lanza un ClipboardEvent sintético */
  await m.ejs(`const o = d.execCommand.bind(d); d.execCommand = (c, a, v) => { if (c === 'copy' || c === 'cut') { const dt = new w.DataTransfer(); const e = new w.ClipboardEvent(c, { clipboardData: dt, bubbles: true, cancelable: true }); (d.activeElement || d.body).dispatchEvent(e); w.__copiado = { html: dt.getData('text/html'), texto: dt.getData('text/plain') }; return true; } return o(c, a, v); };
    if (w.navigator.clipboard) { w.navigator.clipboard.writeText = t => { w.__copiado = { texto: t }; return Promise.resolve(); }; w.navigator.clipboard.write = () => Promise.resolve(); } return 1;`);
  await correr('1 selección de texto', () => seleccionTexto(m));
  await correr('2 bloques', () => bloques(m, { cmdX: true }));
  await correr('3 deshacer del guion', () => deshacerGuion(m));
  await correr('4 no se pierde texto', () => noSePierde(m));
  await correr('5 clics', () => clics(m));
  await correr('6 clapcraft', () => clapcraft(m, errores));
  await m.js(`Claquedraw.app.vista('texto'); return 1;`).catch(() => {});
}

async function parteEditor(errores) {
  const win = new BrowserWindow({ x: 60, y: 60, width: 1280, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  const m = manos(win, errores, {
    marco: false,
    /* index.html solo: lo que hace el Cmd+Z de Chrome en el navegador (en Electron, sin el menú de la app, el Cmd+Z de
       sendInputEvent no llega a deshacer: en el Mac lo resuelve el menú nativo) */
    deshacer: async () => { win.webContents.undo(); },
    rehacer: async () => { win.webContents.redo(); }
  });
  await win.loadFile(path.join(REPO, 'index.html'));
  win.show(); win.focus(); win.webContents.focus();
  lugar = 'index.html · ';
  console.log('\n  El editor solo (index.html)');
  await m.hasta(`return !!(window.Ed && Ed.document && Ed.blocks);`, 10000);
  await m.js(`localStorage.removeItem('guiones.editor.doc'); const o = document.execCommand.bind(document); document.execCommand = (c, a, v) => { if (c === 'copy' || c === 'cut') { const dt = new DataTransfer(); const e = new ClipboardEvent(c, { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(e); window.__copiado = { html: dt.getData('text/html') }; return true; } return o(c, a, v); };
    if (navigator.clipboard) { navigator.clipboard.writeText = t => { window.__copiado = { texto: t }; return Promise.resolve(); }; navigator.clipboard.write = () => Promise.resolve(); } return 1;`);
  await correr('1 selección de texto', () => seleccionTexto(m));
  await correr('2 bloques', () => bloques(m, { cmdX: true }));
  await correr('3 deshacer del guion', () => deshacerGuion(m));
  await correr('4 no se pierde texto', () => noSePierde(m));
  await correr('5 clics', () => clics(m));
  await m.js(`Ed.document.set({ title: '', html: '<p><br></p>', characters: {} }); localStorage.removeItem('guiones.editor.doc'); return 1;`).catch(() => {});
  win.destroy();
}

app.whenReady().then(async () => {
  const errores = [];
  const t0 = Date.now();
  const parte = process.env.PARTE || '';                    // PARTE=app o PARTE=editor para correr solo una
  if (parte !== 'editor') try { await parteApp(errores); } catch (e) { ok('ClapCraft, sin excepciones', false, e && e.stack); }
  if (parte !== 'app') try { await parteEditor(errores); } catch (e) { ok('index.html, sin excepciones', false, e && e.stack); }
  lugar = '';
  ok('la página no soltó ningún error', !errores.length, errores.join('\n'));
  const mal = resultados.filter(x => !x.ok);
  console.log('\n' + (mal.length ? mal.length + ' de ' + resultados.length + ' comprobaciones fallaron:\n' + mal.map(x => '  ✖ ' + x.nombre).join('\n') : 'Las ' + resultados.length + ' comprobaciones pasaron')
    + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s\n');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  borrarDespues(TMP);
  app.exit(mal.length ? 1 : 0);
});
