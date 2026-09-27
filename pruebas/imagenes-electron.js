/* Prueba de las imágenes con la app de verdad (Electron): `./node_modules/.bin/electron pruebas/imagenes-electron.js`.
   1.1.57, de ClapBook (js/imagenes.js, js/anotar.js): poner, cambiar el tamaño y marcar o recortar una imagen del documento.
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos, el portapapeles de mentira),
   crea un proyecto en blanco con archivo, una nota con una imagen (por el servidor MCP, como Claude) y, con **el ratón y el
   teclado de verdad** (`webContents.sendInputEvent`, la ventana enfocada), comprueba:
   a) pegar y soltar una imagen en el editor (el mismo camino que el portapapeles y el Finder);
   b) un clic la elige: marco con seis asas y su barra, la selección es la imagen, y elegirla no cambia el documento;
   c) arrastrar un asa cambia el ancho (`width`), con la proporción; un paso de Deshacer; doble clic en un asa, el suyo;
   d) Esc la suelta y lo que se teclea con una elegida va detrás, sin borrarla;
   e) doble clic: el visor en la ventana de la app (tapa el marco); «Editar», dibujar un rectángulo, Guardar: la imagen marcada
      en `src` y la original, las formas en `data-original` / `data-anotaciones`; un paso de Deshacer;
   f) volver a editar trae las formas; recortar (C) y guardar deja `data-recorte` y una imagen más pequeña;
   g) «Volver al original» (con su pregunta) devuelve la original sin los atributos;
   h) las teclas no salen de la ventana (Esc no cierra nada de debajo, Supr no borra la imagen del documento);
   i) «/imagen» está en el menú de «/»;
   j) la ventana de una nota: doble clic en su imagen abre el visor y lo guardado llega a la nota;
   k) Word lleva la imagen (word/media, con su ancho) y el PDF su `width`;
   l) el archivo guarda las imágenes con sus atributos y un documento con imágenes abierto y guardado sin tocar queda igual;
   m) la página no suelta ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-imagenes-'));
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
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
/* un PNG de W × H hecho a mano: mitad izquierda roja, derecha azul y una franja verde arriba */
function png(W, H) {
  const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const cab = Buffer.alloc(13); cab.writeUInt32BE(W, 0); cab.writeUInt32BE(H, 4); cab[8] = 8; cab[9] = 2;
  const filas = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = y * (W * 3 + 1) + 1 + x * 3, c = y < H / 5 ? [40, 170, 80] : x < W / 2 ? [220, 50, 40] : [40, 90, 220];
    filas[o] = c[0]; filas[o + 1] = c[1]; filas[o + 2] = c[2];
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', cab), trozo('IDAT', zlib.deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}
const PNG = 'data:image/png;base64,' + png(400, 240).toString('base64');

app.whenReady().then(async () => {
  let win = null, M = null;
  const errores = [];
  const jsEn = (w, code) => w.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const js = code => jsEn(win, code);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: op.n || 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 200 : op.tras);
  }
  async function dobleClic(p, tras) { await clic(p, { tras: 120 }); await clic(p, { n: 2, tras: tras === undefined ? 400 : tras }); }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => m === 'meta' || m === 'cmd' || m === 'control' || m === 'alt')) ev({ type: 'char', keyCode: k, modifiers });
    else if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras);
  }
  async function escribir(texto) {
    for (const ch of texto) {
      const simple = /^[a-z0-9 ]$/i.test(ch), mods = /[A-Z]/.test(ch) ? ['shift'] : [];
      if (simple) ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      ev({ type: 'char', keyCode: ch, modifiers: mods });
      if (simple) ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      await espera(30);
    }
    await espera(100);
  }
  async function arrastrar(a, b, pasos, op) {
    pasos = pasos || 14; op = op || {};
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) {
      const x = a.x + (b.x - a.x) * i / pasos, y = a.y + (b.y - a.y) * i / pasos;
      ev({ type: 'mouseMove', x: R(x), y: R(y), modifiers: ['leftButtonDown'] }); await espera(30);
    }
    await espera(op.antesDeSoltar || 120);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(400);
  }
  async function centro(expr, op) {
    op = op || {};
    const r = await js(`const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect();
      return JSON.stringify({ x: b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: b.top + ${op.dy === undefined ? 'b.height / 2' : op.dy}, w: b.width, h: b.height, l: b.left, t: b.top });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr, op); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  /* un elemento del marco del editor, en coordenadas de la ventana */
  const MARCO = `document.getElementById('editorMarco')`, FW = `${MARCO}.contentWindow`, FD = `${MARCO}.contentDocument`;
  async function enMarco(expr, op) {
    op = op || {};
    const r = await js(`const f = ${MARCO}, w = f.contentWindow, d = w.document, el = ${expr}; if (!el) return null;
      if (${!op.sinTraer}) { el.scrollIntoView({ block: 'center' }); await W(120); }
      const m = f.getBoundingClientRect(), b = el.getBoundingClientRect();
      return JSON.stringify({ x: m.left + b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: m.top + b.top + ${op.dy === undefined ? 'b.height / 2' : op.dy}, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const html = () => js(`return ${FW}.Ed.document.get().html;`);
  const imgs = () => js(`return JSON.stringify([...${FD}.querySelectorAll('#editor img')].map(i => ({ w: i.getAttribute('width'), alt: i.getAttribute('alt'), src: i.getAttribute('src').slice(0, 40), largo: i.getAttribute('src').length, orig: !!i.getAttribute('data-original'), an: i.getAttribute('data-anotaciones'), rc: i.getAttribute('data-recorte'), nw: i.naturalWidth, nh: i.naturalHeight, cw: i.getBoundingClientRect().width })));`).then(JSON.parse);
  const CAPA_AN = `document.querySelector('.an-capa')`;
  const deshacer = () => js(`${FD}.execCommand('undo'); await W(250); return true;`);
  const rehacer = () => js(`${FD}.execCommand('redo'); await W(250); return true;`);
  const D = `Claquedraw.gestor.documentos()`, G = `Claquedraw.gestor`;

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); } });
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ x: 40, y: 40, width: 1280, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de las imágenes en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Las imágenes', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const RUTA = path.join(TMP, 'las-imagenes.clapcraft');
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Fotos' }] });
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Fotos', operaciones: [
      { op: 'crear_nota', titulo: 'Con imagen', contenido: 'Antes de la foto.\n\n![foto de prueba](' + PNG + ')\n\nDespués de la foto.' },
      { op: 'crear_nota', titulo: 'Para el editor', contenido: 'Aquí se pegan imágenes.\n\nSegundo párrafo.' }] });
    comprobar('Claude crea la biblioteca «Fotos» con una nota con imagen', !r.error, r.texto);
    await espera(500);
    const ids = JSON.parse(await js(`const d = ${D}, s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Fotos'); const n = t => d.notasDe(s.id).find(x => x.titulo === t).id;
      return JSON.stringify({ sid: s.id, con: n('Con imagen'), ed: n('Para el editor') });`));
    comprobar('la nota lleva la imagen como <img src="data:…">', await js(`return /<img src="data:image\\/png;base64,/.test(${D}.nota('${ids.con}').html);`));

    /* ---------- abrir «Para el editor» en el editor ---------- */
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${ids.ed}"]');`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.ed}"] > span:first-child')`, { tras: 500 });
    await aClic(`document.querySelector('.gd-modal-capa [data-gd-lado-abrir]')`, { tras: 900 });
    comprobar('la nota se abre en el editor', await hasta(`return document.body.classList.contains('nota-abierta') && ${G}.notaAbierta() === '${ids.ed}' && !!${FW}.Ed.imagenes;`, 5000));

    /* ---------- a) pegar y soltar ---------- */
    await js(`const w = ${FW}, p = w.document.querySelector('#editor > p'); w.Ed.setCaret(p.firstChild, p.firstChild.length); w.document.getElementById('editor').focus(); return true;`);
    await js(`const w = ${FW}, d = w.document, bin = atob(${JSON.stringify(PNG.split(',')[1])}), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dt = new w.DataTransfer(); dt.items.add(new w.File([u8], 'pegada.png', { type: 'image/png' }));
      d.getElementById('editor').dispatchEvent(new w.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await W(600); return true;`);
    let im = await imgs();
    comprobar('a) pegar una imagen la pone en el documento (con el nombre del archivo)', im.length === 1 && im[0].alt === 'pegada.png' && /^data:image\/png/.test(im[0].src), JSON.stringify(im));
    const pSeg = await enMarco(`[...d.querySelectorAll('#editor > p')].find(p => /Segundo/.test(p.textContent))`, { dx: 'b.width - 4' });
    await js(`const w = ${FW}, d = w.document, bin = atob(${JSON.stringify(PNG.split(',')[1])}), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const f = ${MARCO}.getBoundingClientRect(), dt = new w.DataTransfer(); dt.items.add(new w.File([u8], 'soltada.png', { type: 'image/png' }));
      d.getElementById('editor').dispatchEvent(new w.DragEvent('drop', { dataTransfer: dt, clientX: ${pSeg.x} - f.left, clientY: ${pSeg.y} - f.top, bubbles: true, cancelable: true })); await W(600); return true;`);
    im = await imgs();
    comprobar('a) soltar una imagen la pone donde cae', im.length === 2 && im[1].alt === 'soltada.png' && await js(`return [...${FD}.querySelectorAll('#editor > p')].find(p => /Segundo/.test(p.textContent)).querySelector('img') !== null;`), JSON.stringify(im));

    /* ---------- b) elegir con un clic ---------- */
    const IMG0 = `d.querySelectorAll('#editor img')[0]`;
    const antesClic = await html();
    const pImg = await enMarco(IMG0);
    await clic(pImg, { tras: 300 });
    const sel = JSON.parse(await js(`const w = ${FW}, d = w.document, s = w.getSelection(), r = s.rangeCount && s.getRangeAt(0), c = d.querySelector('.img-sel');
      return JSON.stringify({ caja: !!c && !c.hidden, asas: c ? c.querySelectorAll('[data-asa]').length : 0, barra: !!(c && c.querySelector('.img-barra')), soloImg: !!r && !r.collapsed && r.cloneContents().querySelectorAll('img').length === 1 && !r.toString().trim(), elegida: w.Ed.imagenes.elegida() === ${IMG0} });`));
    comprobar('b) un clic la elige: el marco con seis asas y su barra, la selección es la imagen', sel.caja && sel.asas === 6 && sel.barra && sel.soloImg && sel.elegida, JSON.stringify(sel));
    comprobar('b) elegirla no toca el documento', await html() === antesClic);
    const marcoCaja = JSON.parse(await js(`const d = ${FD}, c = d.querySelector('.img-sel').getBoundingClientRect(), i = ${IMG0.replace(/^d\./, 'd.')}.getBoundingClientRect(); return JSON.stringify({ dl: Math.abs(c.left - i.left), dt: Math.abs(c.top - i.top), dw: Math.abs(c.width - i.width) });`));
    comprobar('b) el marco va sobre la imagen', marcoCaja.dl < 1.5 && marcoCaja.dt < 1.5 && marcoCaja.dw < 1.5, JSON.stringify(marcoCaja));

    /* ---------- c) cambiar el tamaño ---------- */
    const w0 = (await imgs())[0].cw;
    const asaSE = await enMarco(`d.querySelector('.img-sel [data-asa="se"]')`, { sinTraer: true });
    await arrastrar(asaSE, { x: asaSE.x - 150, y: asaSE.y - 40 }, 16);
    im = await imgs();
    const ancho1 = +im[0].w;
    comprobar('c) arrastrar la esquina achica la imagen (width en el documento)', ancho1 > 0 && im[0].cw < w0 - 60, JSON.stringify({ w0, im: im[0] }));
    comprobar('c) sin estilos de más y con la proporción (alto automático)', await js(`const i = ${FD}.querySelectorAll('#editor img')[0], b = i.getBoundingClientRect(); return !i.getAttribute('style') && Math.abs(b.width / b.height - 400 / 240) < 0.03;`));
    comprobar('c) sigue elegida tras soltar', await js(`return ${FW}.Ed.imagenes.elegida() === ${FD}.querySelectorAll('#editor img')[0] && !${FD}.querySelector('.img-sel').hidden;`));
    await deshacer();
    im = await imgs();
    comprobar('c) Deshacer lo devuelve de un paso', !im[0].w && im.length === 2, JSON.stringify(im));
    await rehacer();
    im = await imgs();
    comprobar('c) y Rehacer lo repite', +im[0].w === ancho1, JSON.stringify(im));
    /* el asa de la izquierda, hacia fuera: crece */
    await clic(await enMarco(IMG0), { tras: 250 });
    const asaW = await enMarco(`d.querySelector('.img-sel [data-asa="w"]')`, { sinTraer: true });
    await arrastrar(asaW, { x: asaW.x - 60, y: asaW.y }, 10);
    im = await imgs();
    comprobar('c) el asa de la izquierda hacia fuera la agranda', +im[0].w > ancho1, JSON.stringify(im[0]));
    await clic(await enMarco(IMG0), { tras: 250 });
    const asaE = await enMarco(`d.querySelector('.img-sel [data-asa="e"]')`, { sinTraer: true });
    await dobleClic(asaE, 400);
    im = await imgs();
    comprobar('c) doble clic en un asa: su tamaño (sin width)', !im[0].w, JSON.stringify(im[0]));

    /* ---------- d) Esc y teclear con una elegida ---------- */
    await clic(await enMarco(IMG0), { tras: 250 });
    await tecla('Escape', [], 250);
    const trasEsc = JSON.parse(await js(`const w = ${FW}, s = w.getSelection(), r = s.getRangeAt(0); return JSON.stringify({ col: r.collapsed, suelta: !w.Ed.imagenes.elegida(), caja: w.document.querySelector('.img-sel').hidden, bloques: w.document.querySelectorAll('.bl-sel, .block-selected').length });`));
    comprobar('d) Esc la suelta y deja el cursor (no elige el bloque)', trasEsc.col && trasEsc.suelta && trasEsc.caja && !trasEsc.bloques, JSON.stringify(trasEsc));
    await clic(await enMarco(IMG0), { tras: 250 });
    await escribir('xyz');
    comprobar('d) lo que se teclea con una elegida va detrás y la imagen se queda', (await imgs()).length === 2 && await js(`const i = ${FD}.querySelectorAll('#editor img')[0]; let t = i.nextSibling; return !!t && t.nodeType === 3 && t.nodeValue.startsWith('xyz');`), await html());
    await deshacer();

    /* ---------- e) el visor y las marcas ---------- */
    const srcOriginal = await js(`return ${FD}.querySelectorAll('#editor img')[0].getAttribute('src');`);
    await dobleClic(await enMarco(IMG0), 700);
    const visor = JSON.parse(await js(`const c = ${CAPA_AN}; return JSON.stringify(c ? { vista: !!c.querySelector('.an-vista'), editar: !!c.querySelector('[data-an-editar]'), enApp: c.ownerDocument === document, tapa: c.getBoundingClientRect().width >= window.innerWidth - 2, nombre: c.querySelector('.an-vista-nombre').textContent, original: !!c.querySelector('[data-an-original]') } : null);`));
    comprobar('e) doble clic: el visor, en la ventana de la app y tapándola entera', visor && visor.vista && visor.enApp && visor.tapa && visor.nombre === 'pegada.png' && !visor.original, JSON.stringify(visor));
    await hasta(`return !${CAPA_AN}.querySelector('[data-an-editar]').disabled;`, 3000);
    await aClic(`${CAPA_AN}.querySelector('[data-an-editar]')`, { tras: 600 });
    comprobar('e) «Editar»: las herramientas (rectángulo por defecto)', await hasta(`const c = ${CAPA_AN}; return !!c && !!c.querySelector('.an-svg') && !!c.querySelector('[data-an-herr="rect"].on');`, 3000));
    const svg = await centro(`${CAPA_AN}.querySelector('.an-svg')`);
    await arrastrar({ x: svg.l + svg.w * 0.2, y: svg.t + svg.h * 0.25 }, { x: svg.l + svg.w * 0.6, y: svg.t + svg.h * 0.7 }, 12);
    comprobar('e) se dibuja un rectángulo', await js(`return ${CAPA_AN}.querySelectorAll('.an-svg [data-i]').length === 1;`));
    /* h) Supr y Esc no salen de la ventana */
    await tecla('Escape', [], 200);
    comprobar('h) Esc suelta la forma elegida sin cerrar la ventana', await js(`return !!${CAPA_AN} && !${CAPA_AN}.querySelector('.an-sel');`));
    await aClic(`${CAPA_AN}.querySelector('[data-an-guardar]')`, { tras: 1200 });
    await hasta(`return !${CAPA_AN} && !!${FD}.querySelectorAll('#editor img')[0].getAttribute('data-original');`, 4000);
    im = await imgs();
    comprobar('e) Guardar: la marcada en src, la original en data-original y la forma en data-anotaciones', im.length === 2 && im[0].orig && im[0].src !== srcOriginal.slice(0, 40) || (im[0].orig && im[0].largo !== srcOriginal.length),
      JSON.stringify(im[0]));
    const an = JSON.parse(im[0].an || '[]');
    comprobar('e) las formas van en coordenadas de la imagen (400 × 240)', an.length === 1 && an[0].tipo === 'rect' && an[0].x > 60 && an[0].x < 100 && an[0].w > 140 && an[0].w < 180, im[0].an);
    comprobar('e) la original, tal cual', await js(`return ${FD}.querySelectorAll('#editor img')[0].getAttribute('data-original');`) === srcOriginal);
    comprobar('e) y sigue elegida en el editor', await js(`return ${FW}.Ed.imagenes.elegida() === ${FD}.querySelectorAll('#editor img')[0];`));
    await deshacer();
    comprobar('e) Deshacer quita las marcas de un paso', await js(`const i = ${FD}.querySelectorAll('#editor img')[0]; return i.getAttribute('src') === ${JSON.stringify(srcOriginal)} && !i.getAttribute('data-original');`));
    await rehacer();
    comprobar('e) Rehacer las vuelve a poner', await js(`return !!${FD}.querySelectorAll('#editor img')[0].getAttribute('data-anotaciones');`));

    /* ---------- f) volver a editar y recortar ---------- */
    await clic(await enMarco(IMG0), { tras: 250 });
    await clic(await enMarco(`d.querySelector('.img-barra [data-img="editar"]')`, { sinTraer: true }), { tras: 10 });
    comprobar('f) «Editar» de la barra abre las herramientas con las formas de antes', await hasta(`const c = ${CAPA_AN}; return !!c && !!c.querySelector('.an-svg') && c.querySelectorAll('.an-svg [data-i]').length === 1 && !!c.querySelector('[data-an-herr="mover"].on');`, 4000));
    await tecla('c', [], 400);
    comprobar('f) C: recortar (la tira de proporciones y el marco)', await js(`const c = ${CAPA_AN}; return !c.querySelector('[data-an-rc-barra]').hidden && !!c.querySelector('.an-rc');`));
    const s2 = await centro(`${CAPA_AN}.querySelector('.an-svg')`);
    await arrastrar({ x: s2.l + s2.w - 1, y: s2.t + s2.h - 1 }, { x: s2.l + s2.w * 0.5, y: s2.t + s2.h * 0.5 }, 12);
    await tecla('Enter', [], 400);
    await aClic(`${CAPA_AN}.querySelector('[data-an-guardar]')`, { tras: 1200 });
    await hasta(`return !${CAPA_AN} && !!${FD}.querySelectorAll('#editor img')[0].getAttribute('data-recorte');`, 4000);
    im = await imgs();
    const rc = JSON.parse(im[0].rc || 'null');
    comprobar('f) Guardar deja data-recorte y la imagen recortada, más pequeña', rc && rc.x === 0 && rc.y === 0 && rc.w > 150 && rc.w < 260 && im[0].nw === rc.w && im[0].nh === rc.h && im[0].an, JSON.stringify(im[0]));
    comprobar('f) la original sigue siendo la primera', await js(`return ${FD}.querySelectorAll('#editor img')[0].getAttribute('data-original');`) === srcOriginal);

    /* ---------- h) Deshacer del menú con la ventana abierta ---------- */
    await dobleClic(await enMarco(IMG0), 700);
    await hasta(`return !!${CAPA_AN} && !${CAPA_AN}.querySelector('[data-an-editar]').disabled;`, 3000);
    const antesMenu = await html();
    Menu.getApplicationMenu().items.find(i => i.label === 'Edición').submenu.items.find(i => i.label === 'Deshacer').click();
    await espera(400);
    comprobar('h) Edición › Deshacer con el visor abierto no deshace el documento de debajo', await html() === antesMenu, 'el documento cambió: app.js historia() no mira Anotar.abierto()');
    if (await html() !== antesMenu) await rehacer();

    /* ---------- g) volver al original ---------- */
    comprobar('g) el visor de una imagen editada ofrece «Volver al original»', await js(`return !!${CAPA_AN}.querySelector('[data-an-original]');`));
    await aClic(`${CAPA_AN}.querySelector('[data-an-original]')`, { tras: 400 });
    comprobar('g) pregunta antes', await js(`return !!${CAPA_AN}.querySelector('.an-pregunta');`));
    await aClic(`${CAPA_AN}.querySelector('.an-pregunta [data-si]')`, { tras: 800 });
    const vuelta = JSON.parse(await js(`const i = ${FD}.querySelectorAll('#editor img')[0]; return JSON.stringify({ capa: !!${CAPA_AN}, src: i.getAttribute('src') === ${JSON.stringify(srcOriginal)}, attrs: [...i.attributes].map(a => a.name) });`));
    comprobar('g) la original, sin data-original ni data-anotaciones ni data-recorte', !vuelta.capa && vuelta.src && !vuelta.attrs.some(a => /^data-/.test(a)), JSON.stringify(vuelta));

    /* ---------- h) Supr en el visor no borra la imagen de debajo ---------- */
    await dobleClic(await enMarco(IMG0), 700);
    await hasta(`return !!${CAPA_AN};`, 2000);
    await tecla('Delete', [], 200); await tecla('Backspace', [], 200);
    await tecla('Escape', [], 300);
    comprobar('h) Supr y Retroceso en el visor no llegan al documento; Esc lo cierra', !(await js(`return !!${CAPA_AN};`)) && (await imgs()).length === 2 && await js(`return document.body.classList.contains('nota-abierta');`));

    /* ---------- i) «/imagen» ---------- */
    await js(`const w = ${FW}, ps = [...w.document.querySelectorAll('#editor > p')], p = ps[ps.length - 1]; const t = p.lastChild && p.lastChild.nodeType === 3 ? p.lastChild : null; if (t) w.Ed.setCaret(t, t.length); else w.Ed.setCaret(p, p.childNodes.length); w.document.getElementById('editor').focus(); return true;`);
    await tecla('Enter', [], 200);
    await escribir('/imag');
    await espera(300);
    const slash = await js(`const w = ${FW}, m = w.document.querySelector('.slash-menu'); return w.Ed.slash.open && m ? m.textContent : '';`);
    comprobar('i) «/imagen» está en el menú de «/»', /Imagen/.test(slash), slash);
    /* elegirla abre el selector de archivos (se sustituye el clic del input) */
    await js(`const w = ${FW}; w.__abierto = 0; const c = w.HTMLInputElement.prototype.click; w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') { w.__abierto++; w.__accept = this.accept; return; } return c.call(this); }; return true;`);
    await tecla('Enter', [], 300);
    comprobar('i) y elegirla abre el selector de imágenes', await js(`return ${FW}.__abierto === 1 && ${FW}.__accept === 'image/*';`));
    await js(`${FD}.querySelectorAll('input[type=file]').forEach(x => x.remove()); return true;`);

    /* ---------- j) la ventana de una nota ---------- */
    await js(`${G}.cerrarNota && ${G}.cerrarNota(); await W(300); ${G}.abrirSub('${ids.sid}'); await W(600); return true;`);
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${ids.con}"]');`, 4000);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.con}"] > span:first-child')`, { tras: 800 });
    comprobar('j) la nota con imagen, en su ventana (la imagen se ve)', await hasta(`const c = document.querySelector('.gd-modal-capa'); return !!c && !c.hidden && !!c.querySelector('.gd-lado-img img');`, 3000));
    const origNota = await js(`return document.querySelector('.gd-modal-capa .gd-lado-img img').getAttribute('src');`);
    await dobleClic(await centro(`document.querySelector('.gd-modal-capa .gd-lado-img')`), 700);
    comprobar('j) doble clic en su imagen: el visor (encima de la ventana de la nota), no el editor', await js(`const c = ${CAPA_AN}; return !!c && !c.querySelector('.an-caja').hidden && !document.body.classList.contains('nota-abierta') && +getComputedStyle(c).zIndex > +getComputedStyle(document.querySelector('.gd-modal-capa')).zIndex;`));
    await hasta(`return !${CAPA_AN}.querySelector('[data-an-editar]').disabled;`, 3000);
    await aClic(`${CAPA_AN}.querySelector('[data-an-editar]')`, { tras: 600 });
    await hasta(`return !!${CAPA_AN}.querySelector('.an-svg');`, 3000);
    await tecla('a', [], 200);                                             // la flecha
    const s3 = await centro(`${CAPA_AN}.querySelector('.an-svg')`);
    await arrastrar({ x: s3.l + s3.w * 0.1, y: s3.t + s3.h * 0.9 }, { x: s3.l + s3.w * 0.8, y: s3.t + s3.h * 0.2 }, 10);
    await tecla('Escape', [], 150);
    await aClic(`${CAPA_AN}.querySelector('[data-an-guardar]')`, { tras: 1200 });
    const nota = JSON.parse(await js(`await W(300); const h = ${D}.nota('${ids.con}').html, t = document.createElement('template'); t.innerHTML = h; const i = t.content.querySelector('img');
      return JSON.stringify({ capa: !!${CAPA_AN}, ventana: !document.querySelector('.gd-modal-capa').hidden, orig: i && i.getAttribute('data-original'), an: i && i.getAttribute('data-anotaciones'), src: i && i.getAttribute('src').slice(0, 30), texto: /Antes de la foto/.test(h) && /Después de la foto/.test(h) });`));
    comprobar('j) lo guardado llega a la nota (la marcada y la original) y la ventana sigue abierta', !nota.capa && nota.ventana && nota.orig === origNota && /flecha/.test(nota.an || '') && nota.texto, JSON.stringify(nota).slice(0, 400));
    comprobar('j) y la ventana enseña la marcada', await js(`return document.querySelector('.gd-modal-capa .gd-lado-img img').getAttribute('src') !== ${JSON.stringify(origNota)};`));
    await js(`${G}.cerrarVentana(); await W(300); return true;`);

    /* ---------- k) Word y PDF ---------- */
    const conAncho = `<p>Hola</p><p><img src="${PNG}" alt="foto" width="200"></p><p>Adiós <img src="${PNG}" alt="otra"></p>`;
    const docx = JSON.parse(await js(`const h = ${JSON.stringify(conAncho)}, m = await Claquedraw.exportar.mediosDocx(h), b = Claquedraw.exportar.docx(h, m);
      let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      const ext = s.match(/<wp:extent cx="(\\d+)" cy="(\\d+)"/g) || [];
      return JSON.stringify({ media: /word\\/media\\/imagen1\\.png/.test(s), una: !/imagen2\\.png/.test(s), dibujos: (s.match(/<w:drawing>/g) || []).length, rel: /Target="media\\/imagen1\\.png"/.test(s), tipo: /Extension="png" ContentType="image\\/png"/.test(s), ext, png: s.indexOf('\\x89PNG') > 0 });`));
    comprobar('k) Word: la imagen en word/media (una vez aunque salga dos), su relación y su tipo', docx.media && docx.una && docx.rel && docx.tipo && docx.png, JSON.stringify(docx));
    comprobar('k) Word: cada imagen en su renglón con su ancho (200 px = 1905000 EMU; sin ancho, la suya)', docx.dibujos === 2 && /cx="1905000" cy="1143000"/.test(docx.ext[0]) && /cx="3810000" cy="2286000"/.test(docx.ext[1]), JSON.stringify(docx.ext));
    const sinImg = await js(`const b = Claquedraw.exportar.docx('<p>Hola</p>'); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return !/word\\/media|<w:drawing>/.test(s) && /Hola/.test(s);`);
    comprobar('k) Word sin imágenes, como antes', sinImg);
    comprobar('k) el PDF (HTML imprimible) conserva el ancho', await js(`return /<img[^>]*width="200"/.test(Claquedraw.exportar.aImprimible(${JSON.stringify(conAncho)}, 'x'));`));

    /* ---------- l) el archivo ---------- */
    await js(`await Claquedraw.app.guardar(); await W(1500); return true;`);
    await espera(1500);
    const arch = leerArchivo(RUTA);
    const todas = [];
    const recorrer = x => { if (x && typeof x === 'object') { if (typeof x.html === 'string') todas.push(x.html); Object.values(x).forEach(recorrer); } };
    recorrer(arch.documentos);
    const hEd = todas.find(h => /Aquí se pegan/.test(h)) || '', hCon = todas.find(h => /Antes de la foto/.test(h)) || '';
    comprobar('l) el archivo lleva las imágenes del editor (2) y la marcada de la nota con sus atributos', (hEd.match(/<img /g) || []).length === 2 && /data-original="data:image/.test(hCon) && /data-anotaciones="\[/.test(hCon), hEd.slice(0, 200));
    /* abrir y guardar sin tocar: igual (la nota en el editor: elegir una imagen y soltarla no cambia nada) */
    const bytes0 = fs.readFileSync(RUTA);
    await js(`${G}.abrirSub('${ids.sid}'); await W(400); return true;`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.ed}"] > span:first-child')`, { tras: 500 });
    await aClic(`document.querySelector('.gd-modal-capa [data-gd-lado-abrir]')`, { tras: 1000 });
    await hasta(`return ${G}.notaAbierta() === '${ids.ed}' && ${FD}.querySelectorAll('#editor img').length === 2;`, 4000);
    const h0 = await html();
    await clic(await enMarco(IMG0), { tras: 250 }); await tecla('Escape', [], 200);
    await clic(await enMarco(`d.querySelectorAll('#editor img')[1]`), { tras: 250 }); await tecla('ArrowRight', [], 200);
    comprobar('l) elegir y soltar imágenes no cambia el documento', await html() === h0);
    await js(`await Claquedraw.app.guardar(); await W(1500); return true;`);
    await espera(1200);
    comprobar('l) guardar sin tocar no reescribe el archivo', Buffer.compare(bytes0, fs.readFileSync(RUTA)) === 0);

    comprobar('m) la página no soltó ningún error', !errores.length, errores.join(' | '));
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
