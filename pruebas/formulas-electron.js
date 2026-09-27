/* Prueba de las fórmulas con la app de verdad (Electron): `electron pruebas/formulas-electron.js`.
   1.1.60, Leo: «Agrega una sección en el menú (como Plantillas) que se llame "Fórmulas"… notas que solo tengan texto y sirvan como
   prompts reutilizables en los bloques del lienzo que llaman a la IA», y «que también se puedan usar las fórmulas en el asistente IA».
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos, **el portapapeles del sistema
   sustituido** —el de verdad es el de Leo—, el Llavero de mentira y **un servidor falso compatible con OpenAI**: nada de la API de
   verdad), crea un proyecto en blanco con archivo y, con **el ratón y el teclado de verdad** (`webContents.sendInputEvent`, la
   ventana enfocada), comprueba:
   a) «Fórmulas» en el pie del menú, entre Plantillas y Papelera, con su cuenta;
   b) su tablero: el chip «Fórmulas» sin contenedor, el aviso y «Nueva fórmula»; la pestaña con su icono;
   c) crear fórmulas y escribir en su ventana: texto plano (Cmd+B, «**», «# » y pegar con formato no dejan formato), sin ⤢, el
      clic derecho sin formato, el doble clic no la lleva al editor; un segmento en Fórmulas y una fórmula en él;
   d) «Guardar como fórmula…» desde el ⋯ de una nota (su texto, sin formato) y soltar una nota sobre «Fórmulas»;
   e) en un lienzo: el selector «Fórmula» de una operación (lista agrupada por segmento, dos elegidas en orden, chips), escribir en
      «Qué escribir», ▶ «Pedir a Claude» copia el encargo con las fórmulas; una operación solo con fórmula también se pide;
   f) ejecutar_nodo (Claude) trae la instrucción compuesta; completar_nodo; cambiar el texto de una fórmula (desde su chip, en su
      ventana) deja la operación desactualizada;
   g) tirar una fórmula elegida: el chip, roto (y ▶ sigue); restaurarla lo arregla;
   h) «Nueva fórmula desde lo escrito…» la crea y la elige;
   i) enlaces: el de «Fórmulas» y el de una fórmula llevan a su sitio; Ver › Fórmulas;
   j) Plantillas sigue igual (Markdown vivo y ⤢ en su ventana; su ⋯);
   k) el asistente: «Fórmulas» junto al campo, activar una (chip), «/» al principio, insertar su texto, y la petición al modelo
      lleva su texto; se guarda con la conversación;
   l) capturas (PRUEBA_CAPTURAS=<carpeta>): el tablero de Fórmulas y una operación con fórmulas, en Claro y Synthwave;
   m) la página no suelta ningún error.
   No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-formulas-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.PRUEBA_CAPTURAS || null;
const PUERTO = 47900 + (process.pid % 700);
process.env.CLAPCRAFT_IA_URL = 'http://127.0.0.1:' + PUERTO + '/v1';
delete process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO;
const CLAVE = 'sk-prueba-FALSA-' + Math.random().toString(36).slice(2, 10) + 'Fx7q';
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
/* el Llavero, de mentira */
let llaveroFalso = false;
try {
  const cifrar = s => Buffer.from([...Buffer.from(String(s), 'utf8')].map(b => b ^ 0x5a)).reverse();
  safeStorage.isEncryptionAvailable = () => true;
  safeStorage.encryptString = s => Buffer.concat([Buffer.from('FALSO1'), cifrar(s)]);
  safeStorage.decryptString = b => Buffer.from([...Buffer.from(b).subarray(6)].reverse().map(x => x ^ 0x5a)).toString('utf8');
  llaveroFalso = safeStorage.encryptString('a').length === 7;
} catch (_) {}
require('../electron/main.js');
/* el portapapeles, de mentira (el de verdad es el de Leo) */
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);

/* ---------- el servidor falso compatible con OpenAI (sin streaming de herramientas: solo texto) ---------- */
const S = { peticiones: [] };
const servidor = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', d => { cuerpo += d; });
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
    S.peticiones.push({ url: req.url, cuerpo: b });
    const texto = 'Hecho, con tus fórmulas.';
    const usage = { prompt_tokens: 900, completion_tokens: 20, total_tokens: 920 };
    if (!b.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: b.model, choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason: 'stop' }], usage }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const base = { id: 'chatcmpl-falso', object: 'chat.completion.chunk', created: 1, model: b.model || 'deepseek-v4-flash' };
    res.write('data: ' + JSON.stringify(Object.assign({}, base, { choices: [{ index: 0, delta: { content: texto }, finish_reason: null }] })) + '\n\n');
    res.write('data: ' + JSON.stringify(Object.assign({}, base, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })) + '\n\n');
    res.write('data: ' + JSON.stringify(Object.assign({}, base, { choices: [], usage })) + '\n\n');
    res.write('data: [DONE]\n\n'); res.end();
  });
});

const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  const d = detalle === undefined ? '' : String(detalle).split(CLAVE).join('«la clave»');
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !d ? '' : '\n      ' + d.slice(0, 900)));
}
function mcp() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'claude', 'servidor.js')], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', CLAPCRAFT_PUENTE: path.join(DATOS, 'puente.json') }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, errores = '';
  const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', d => { errores += d; });
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return { error: !!r.result.isError, texto: (r.result.content.find(c => c.type === 'text') || {}).text || '' }; };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}
const leerArchivo = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));

servidor.listen(PUERTO, '127.0.0.1');
app.whenReady().then(async () => {
  let win = null, M = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  /* ---------- el ratón y el teclado de verdad ---------- */
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: op.n || 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 220 : op.tras);
  }
  async function dobleClic(p, tras) { await clic(p, { tras: 180 }); await clic(p, { n: 2, tras: tras === undefined ? 400 : tras }); }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => m === 'meta' || m === 'cmd' || m === 'control' || m === 'alt')) ev({ type: 'char', keyCode: k, modifiers });
    else if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 70 : tras);
  }
  async function escribir(texto) {
    for (const ch of texto) {
      const simple = /^[a-z0-9 ]$/i.test(ch);
      const mods = /[A-Z]/.test(ch) ? ['shift'] : [];
      if (simple) ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      ev({ type: 'char', keyCode: ch, modifiers: mods });
      if (simple) ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch, modifiers: mods });
      await espera(22);
    }
    await espera(80);
  }
  async function arrastrar(a, b, pasos) {
    pasos = pasos || 14;
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) {
      const x = a.x + (b.x - a.x) * i / pasos, y = a.y + (b.y - a.y) * i / pasos;
      ev({ type: 'mouseMove', x: R(x), y: R(y), modifiers: ['leftButtonDown'] }); await espera(35);
    }
    await espera(150);
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(450);
  }
  async function centro(expr, op) {
    op = op || {};
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + ${op.dx === undefined ? 'b.width / 2' : op.dx}, y: b.top + ${op.dy === undefined ? 'b.height / 2' : op.dy}, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr, op); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const G = `Claquedraw.gestor`, D = `Claquedraw.gestor.documentos()`;
  const CAPA = `document.querySelector('.gd-modal-capa')`;
  const CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
  const abierta = () => js(`const c = ${CAPA}; return !!c && !c.hidden && getComputedStyle(c).display !== 'none';`);
  const opcionPop = t => `[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  const menuApp = (menu, texto) => Menu.getApplicationMenu().items.find(i => i.label === menu).submenu.items.find(i => i.label === texto);
  const itemsTema = () => menuApp('Ver', 'Tema').submenu.items;
  const PIE = `[...document.querySelectorAll('.gd-pie > .gd-cont, [data-gd-lista="papelera"] > .gd-cont')]`;
  const filaFx = `document.querySelector('[data-gd-formulas]')`;
  const formulas = () => js(`return JSON.stringify(${D}.formulas().map(n => n.titulo));`).then(JSON.parse);
  const fxId = t => js(`const n = ${D}.formulas().find(n => n.titulo === ${JSON.stringify(t)}); return n ? n.id : null;`);
  const cerrarVentana = async () => { if (await abierta()) { await tecla('Escape', [], 300); if (await abierta()) await js(`${G}.cerrarVentana(); await W(150); return true;`); } };
  const nodoEl = id => `document.querySelector('#lzNodos [data-lz-nodo="${id}"]')`;
  const chipsNodo = id => js(`const el = ${nodoEl(id)}; return JSON.stringify(el ? [...el.querySelectorAll('.lz-fx-chip')].map(c => (c.classList.contains('roto') ? '!' : '') + c.textContent.trim()) : null);`).then(JSON.parse);
  const avisoTxt = () => js(`const a = document.getElementById('aviso'); return a ? a.textContent : '';`);
  const captura = async nombre => { if (!CAPTURAS) return; fs.mkdirSync(CAPTURAS, { recursive: true }); await espera(350); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), (await win.webContents.capturePage()).toPNG()); };

  try {
    await new Promise(r => (servidor.listening ? r() : servidor.once('listening', r)));
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); } });
    win.webContents.setBackgroundThrottling(false);
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', () => true);
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.gestor);`);
    console.log('\nClapCraft · prueba de las fórmulas en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);
    if (CAPTURAS) { itemsTema().find(i => i.label === 'Claro').click(); await espera(400); }   // las capturas «claro», en Claro (no el del sistema)
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Las fórmulas', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const RUTA = path.join(TMP, 'las-formulas.clapcraft');
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas' }] });
    comprobar('Claude crea la biblioteca «Ideas»', !r.error, r.texto);
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_nota', titulo: 'Nota rica', contenido: 'Hablar **siempre** en _presente_.\n\n- Sin flashbacks\n- Diálogos cortos' },
      { op: 'crear_nota', titulo: 'Para soltar', contenido: 'Todo en *una* noche.' }] });
    comprobar('con dos notas con formato', !r.error, r.texto);
    await espera(400);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], s = c.subs.find(x => x.nombre === 'Ideas');
      const n = t => d.notasDe(s.id).find(x => x.titulo === t).id;
      return JSON.stringify({ cid: c.id, eid: c.esquemas[0].id, sid: s.id, rica: n('Nota rica'), soltar: n('Para soltar') });`));
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    await hasta(`return document.body.classList.contains('vista-documentos') && !!document.querySelector('#gdMain .gd-nota[data-nota="${ids.rica}"]');`);
    comprobar('aún no hay biblioteca de fórmulas (nace cuando hace falta)', await js(`return !${D}.bibliotecaFormulas();`));

    /* ---------- a) «Fórmulas» en el pie del menú ---------- */
    const pie = JSON.parse(await js(`return JSON.stringify(${PIE}.map(f => f.querySelector('[data-gd-nombre]').textContent));`));
    comprobar('a) el pie: Contenedores · Personajes · Plantillas · Fórmulas · Papelera', JSON.stringify(pie) === '["Contenedores","Personajes","Plantillas","Fórmulas","Papelera"]', JSON.stringify(pie));
    comprobar('a) con su matraz y sin cuenta (aún no hay fórmulas)', await js(`const f = ${filaFx}; return !!f.querySelector('use[href="#ic-formula"]') && !f.querySelector('.gd-cont-num');`));

    /* ---------- b) su tablero ---------- */
    await aClic(`${filaFx}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    comprobar('b) un clic en «Fórmulas» abre su tablero (y crea su biblioteca)', await hasta(`return ${G}.esFormulas() && !!${D}.bibliotecaFormulas() && document.body.classList.contains('vista-documentos');`, 3000));
    const cab = JSON.parse(await js(`const m = document.getElementById('gdMain'), h = m.querySelector('.esq-cab');
      return JSON.stringify({ chip: !!h && !!h.querySelector('.gd-chip--formulas'), chipTxt: h && (h.querySelector('.gd-chip--formulas') || {}).textContent,
        cont: h ? [...h.querySelectorAll('.esq-cont')].map(x => x.textContent.trim()).join('|') : null, aviso: (m.querySelector('.gd-formulas-aviso') || {}).textContent || '',
        nueva: !!m.querySelector('[data-gd-nueva-formula]'), desde: !!m.querySelector('[data-gd-desde-plantilla]'), plNueva: !!m.querySelector('[data-gd-nueva-plantilla]'), activo: ${filaFx}.classList.contains('activo'),
        otra: document.querySelector('[data-gd-plantillas]').classList.contains('activo') });`));
    comprobar('b) cabecera con el chip «Fórmulas», sin contenedor', cab.chip && /Fórmulas/.test(cab.chipTxt) && !/Contenedor/.test(cab.cont || ''), JSON.stringify(cab));
    comprobar('b) el aviso dice para qué sirven ({{instruccion}}, el lienzo) y «Nueva fórmula» (ni «Desde plantilla» ni «Nueva plantilla»)', /lienzos/.test(cab.aviso) && /\{\{instruccion\}\}/.test(cab.aviso) && cab.nueva && !cab.desde && !cab.plNueva, JSON.stringify(cab));
    comprobar('b) su fila del pie, activa (y la de Plantillas, no)', cab.activo && !cab.otra, JSON.stringify(cab));
    const pest = JSON.parse(await js(`const p = document.querySelector('.pestana.activa'); return JSON.stringify(p ? { tipo: p.dataset.tipo, nom: p.querySelector('.pestana-nom').textContent, icono: !!p.querySelector('.pestana-tipo use[href="#ic-formula"]') } : null);`));
    comprobar('b) la pestaña de delante es la de las fórmulas, con su matraz', pest && pest.tipo === 'formulas' && pest.nom === 'Fórmulas' && pest.icono, JSON.stringify(pest));
    comprobar('las fórmulas no salen en el árbol ni entre las bibliotecas', await js(`const d = ${D}; return !document.querySelector('.gd-arbol [data-id="formulas"]') && !d.todasLasBibliotecas().some(b => b.sub.id === 'formulas:biblioteca');`));

    /* ---------- c) una fórmula nueva, escrita en su ventana: texto plano ---------- */
    await aClic(`document.querySelector('#gdMain [data-gd-nueva-formula]')`, { tras: 400 });
    const tNueva = JSON.parse(await js(`const t = ${CAPA} && ${CAPA}.querySelector('[data-gd-lado-titulo]'); return JSON.stringify({ foco: document.activeElement === t, n: ${D}.formulas().length });`));
    comprobar('c) «Nueva fórmula» la crea y la abre en su ventana con el nombre elegido', await abierta() && tNueva.foco && tNueva.n === 1, JSON.stringify(tNueva));
    await escribir('Tono noir');
    await tecla('Enter', [], 250);
    const vent = JSON.parse(await js(`const c = ${CAPA}, f = ${CAMPO}; return JSON.stringify({ plano: f.classList.contains('plano'), expandir: !c.querySelector('[data-gd-lado-abrir]').hidden, foco: document.activeElement === f, ruta: !!c.querySelector('.gd-modal-ruta .gd-chip--formulas'), usar: !!c.querySelector('.gd-lado-usar') });`));
    comprobar('c) su campo va en modo texto, sin ⤢ ni «Usar», con la ruta «Fórmulas»', vent.plano && !vent.expandir && vent.ruta && !vent.usar && vent.foco, JSON.stringify(vent));
    await escribir('Frases cortas y secas.'); await tecla('Enter', [], 120);
    await escribir('**Narrador** en off: {{instruccion}}'); await tecla('Enter', [], 120);
    await escribir('# Sin titulos'); await espera(300);
    /* Cmd+B con la primera palabra elegida */
    await js(`const f = ${CAMPO}, p = f.querySelector('p'), t = p.firstChild, rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); return true;`);
    await tecla('b', ['meta'], 200); await tecla('i', ['meta'], 200); await tecla('e', ['meta'], 200);
    /* pegar algo con formato: entra como texto */
    await js(`const f = ${CAMPO}, u = f.lastElementChild, rg = document.createRange(); rg.selectNodeContents(u); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
      const dt = new DataTransfer(); dt.setData('text/html', '<p><b>Pegado</b> con <i>formato</i></p>'); dt.setData('text/plain', ' Pegado con formato');
      f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
    await espera(700);
    const noirId = await fxId('Tono noir');
    const noir = JSON.parse(await js(`const f = ${CAMPO}; return JSON.stringify({ campo: f.innerHTML, html: ${D}.nota('${noirId}').html, texto: ${D}.textoFormula('${noirId}') });`));
    comprobar('c) nada de formato en el campo: ni Cmd+B/I/E, ni «**», ni «# », ni lo pegado', !/<(b|strong|i|em|code|h\d|mark|span style)/i.test(noir.campo) && /\*\*Narrador\*\*/.test(noir.campo) && /# Sin titulos/.test(noir.campo) && /Pegado con formato/.test(noir.campo), noir.campo);
    comprobar('c) y la fórmula se guarda como párrafos simples, en texto plano', /^(<p>[^<]*<\/p>|<p><br><\/p>)+$/.test(noir.html) && noir.texto === 'Frases cortas y secas.\n**Narrador** en off: {{instruccion}}\n# Sin titulos Pegado con formato', JSON.stringify(noir));
    /* el clic derecho: sin formato */
    const pc = await centro(`${CAMPO}.querySelector('p')`);
    await clic(pc, { boton: 'right', tras: 300 });
    const ctx = JSON.parse(await js(`const p = document.querySelector('.gd-pop'); return JSON.stringify(p ? { barra: !!p.querySelector('.gd-fmt-barra'), tonos: !!p.querySelector('.gd-fmt-tonos'), txt: p.textContent } : null);`));
    comprobar('c) el clic derecho en una fórmula no ofrece formato (sí pegar y el enlace)', ctx && !ctx.barra && !ctx.tonos && /Pegar/.test(ctx.txt) && /Copiar enlace/.test(ctx.txt) && !/Insertar plantilla/.test(ctx.txt), JSON.stringify(ctx));
    await tecla('Escape', [], 250);
    await cerrarVentana();
    comprobar('c) la fila del pie cuenta 1', await hasta(`const n = ${filaFx}.querySelector('.gd-cont-num'); return !!n && n.textContent === '1';`, 2000));
    /* el doble clic en su tarjeta no la lleva al editor */
    await dobleClic(await centro(`document.querySelector('#gdMain .gd-nota[data-nota="${noirId}"] > span:first-child')`), 700);
    comprobar('c) el doble clic en la tarjeta de una fórmula no la abre en el editor (se queda en su ventana)', await js(`return !document.body.classList.contains('nota-abierta') && !${G}.notaAbierta();`) && await abierta());
    await cerrarVentana();
    /* un segmento en Fórmulas (⋯ del pie › Nuevo segmento) y una fórmula en él */
    await aClic(`${filaFx}.querySelector('[data-gd-menu="formulas"]')`, { tras: 300 });
    const menuFx = await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent.trim()).join(' | ');`);
    comprobar('c) el ⋯ de «Fórmulas»: Nueva fórmula, Nuevo segmento, Abrir en pestaña, Copiar enlace', /Nueva fórmula/.test(menuFx) && /Nuevo segmento/.test(menuFx) && /pestaña/.test(menuFx) && /Copiar enlace/.test(menuFx), menuFx);
    await aClic(opcionPop('Nuevo segmento'), { tras: 300 });
    await aClic(`document.querySelector('.gd-pop .gd-paleta button:nth-child(5)')`, { tras: 500 });
    await tecla('a', ['meta'], 80); await escribir('Estilo'); await tecla('Enter', [], 400);
    const estilo = await js(`const r = ${D}.bibliotecaFormulas(); const e = ${D}.etiquetasDe(r.sub.id).find(x => x.nombre === 'Estilo'); return e ? e.id : null;`);
    comprobar('c) un segmento «Estilo» en Fórmulas', !!estilo, await js(`return JSON.stringify(${D}.etiquetasDe(${D}.bibliotecaFormulas().sub.id).map(e => e.nombre));`));
    await aClic(`document.querySelector('#gdMain [data-clave="etq:${estilo}"] [data-gd-crear-nota]')`, { tras: 400 });
    await escribir('Formato corto'); await tecla('Enter', [], 250);
    await escribir('Máximo tres escenas.'); await espera(600);
    await cerrarVentana();
    const cortoId = await fxId('Formato corto');
    comprobar('c) «Formato corto» vive en el segmento «Estilo»', !!cortoId && await js(`return ${D}.nota('${cortoId}').etiquetaId === '${estilo}' && ${D}.textoFormula('${cortoId}') === 'Máximo tres escenas.';`));
    await captura('formulas-tablero-claro');

    /* ---------- d) «Guardar como fórmula…» y soltar sobre «Fórmulas» ---------- */
    await js(`${G}.abrirSub('${ids.sid}'); await W(500); return true;`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.rica}"] .gd-nota-acc')`, { tras: 250 });
    const menuNota = await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent.trim()).join(' | ');`);
    comprobar('d) el ⋯ de una nota normal ofrece «Guardar como plantilla…» y «Guardar como fórmula…»', /Guardar como plantilla/.test(menuNota) && /Guardar como fórmula/.test(menuNota), menuNota);
    await aClic(opcionPop('Guardar como fórmula'), { tras: 300 });
    comprobar('d) pregunta dónde: la bandeja o un segmento de Fórmulas', await js(`return !!${opcionPop('Bandeja')} && !!${opcionPop('Estilo')};`));
    await aClic(opcionPop('Estilo'), { tras: 500 });
    const ricaFx = await fxId('Nota rica');
    comprobar('d) la copia, en «Estilo», con su texto sin formato', !!ricaFx && await js(`const n = ${D}.nota('${ricaFx}'); return n.etiquetaId === '${estilo}' && !/<(strong|b|em|i|ul|li)\\b/.test(n.html) && ${D}.textoFormula('${ricaFx}') === 'Hablar siempre en presente.\\n- Sin flashbacks\\n- Diálogos cortos';`),
      await js(`return ${D}.nota('${ricaFx}') && ${D}.textoFormula('${ricaFx}');`));
    comprobar('d) y la nota de verdad no cambia', await js(`return /<(strong|b)>siempre<\\/(strong|b)>/.test(${D}.nota('${ids.rica}').html);`), await js(`return ${D}.nota('${ids.rica}').html;`));
    await arrastrar(await centro(`document.querySelector('#gdMain .gd-nota[data-nota="${ids.soltar}"] > span:first-child')`), await centro(`${filaFx}.querySelector('[data-gd-nombre]')`));
    comprobar('d) soltar una nota sobre «Fórmulas» guarda su texto como fórmula', await hasta(`const n = ${D}.formulas().find(x => x.titulo === 'Para soltar'); return !!n && ${D}.textoFormula(n.id) === 'Todo en una noche.' && ${D}.nota('${ids.soltar}').subId === '${ids.sid}';`, 3000),
      await avisoTxt());

    /* ---------- e) el lienzo: el selector «Fórmula» ---------- */
    const lid = await js(`const r = ${D}.crearLienzo('${ids.cid}', 'Pruebas de fórmulas', { datos: { nodos: [
        { id: 'g1', tipo: 'generar', x: 80, y: 60, datos: {} }, { id: 'g2', tipo: 'generar', x: 480, y: 60, datos: {} }], cables: [] } });
      Claquedraw.gestor.render(); return r.lienzo.id;`);
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(700); return true;`);
    await hasta(`return Claquedraw.app.modo() === 'lienzo' && !!${nodoEl('g1')};`, 4000);
    await js(`Claquedraw.lienzoUI.encajar && Claquedraw.lienzoUI.encajar(false); await W(200); return true;`);
    comprobar('e) cada operación lleva el botón «Fórmula» bajo «Qué escribir»', await js(`const el = ${nodoEl('g1')}, b = el.querySelector('[data-lz-fx-elegir]'), t = el.querySelector('.lz-instr'); return !!b && !!t && !!(t.compareDocumentPosition(b) & 4);`));
    await aClic(`${nodoEl('g1')}.querySelector('[data-lz-fx-elegir]')`, { tras: 400 });
    const lista = JSON.parse(await js(`const m = document.querySelector('.lz-fx-menu'); return JSON.stringify(m ? { buscar: !!m.querySelector('input[type=search]'), grupos: [...m.querySelectorAll('[data-lz-fx-grupo]')].map(g => g.textContent.trim()), ops: [...m.querySelectorAll('[data-lz-fx-op] b')].map(b => b.textContent), foco: document.activeElement === m.querySelector('input') } : null);`));
    comprobar('e) la lista, con buscador y agrupada por segmento', lista && lista.buscar && lista.foco && JSON.stringify(lista.grupos) === '["Bandeja","Estilo"]' && lista.ops.includes('Tono noir') && lista.ops.includes('Formato corto'), JSON.stringify(lista));
    await escribir('noir'); await espera(200);
    comprobar('e) el buscador filtra', await js(`const m = document.querySelector('.lz-fx-menu'); return [...m.querySelectorAll('[data-lz-fx-op]')].filter(b => !b.hidden).map(b => b.querySelector('b').textContent).join() === 'Tono noir';`));
    await tecla('Enter', [], 300);
    for (let i = 0; i < 4; i++) await tecla('Backspace', [], 60);
    await espera(150);
    await aClic(`[...document.querySelectorAll('.lz-fx-menu [data-lz-fx-op]')].find(b => b.textContent.includes('Formato corto'))`, { tras: 400 });
    comprobar('e) se eligen dos sin cerrar la lista, con su puesto', await js(`const m = document.querySelector('.lz-fx-menu'); return !!m && [...m.querySelectorAll('[data-lz-fx-op].on')].map(b => b.querySelector('small').textContent + b.querySelector('b').textContent).join() === '1Tono noir,2Formato corto';`));
    await tecla('Escape', [], 300);
    comprobar('e) Esc cierra la lista', await js(`return !document.querySelector('.lz-fx-menu');`));
    comprobar('e) dos chips en orden, y en el modelo', JSON.stringify(await chipsNodo('g1')) === '["Tono noir","Formato corto"]' && await js(`const l = ${D}.lienzo('${lid}').lienzo, n = l.nodos.find(x => x.id === 'g1'); return JSON.stringify(n.datos.formulas) === JSON.stringify(['${noirId}', '${cortoId}']);`),
      JSON.stringify(await chipsNodo('g1')));
    await aClic(`${nodoEl('g1')}.querySelector('.lz-instr')`, { tras: 150 });
    await escribir('Una escena en la azotea');
    await espera(600);
    comprobar('e) lo escrito en «Qué escribir» se guarda', await js(`return ${D}.lienzo('${lid}').lienzo.nodos.find(x => x.id === 'g1').datos.instruccion === 'Una escena en la azotea';`));
    portapapeles = '';
    await aClic(`${nodoEl('g1')}.querySelector('[data-lz-pedir]')`, { tras: 600 });
    comprobar('e) ▶ «Pedir a Claude» copia el encargo con las fórmulas, en orden y con sus enlaces', /Fórmulas de «[^»]+», en este orden: «Tono noir», «Formato corto»/.test(portapapeles) && (portapapeles.match(/clapcraft:\/\//g) || []).length >= 3, portapapeles);
    comprobar('e) y la deja pendiente', await hasta(`return !!${nodoEl('g1')}.querySelector('.lz-estado.pendiente');`, 2000));
    await captura('formulas-lienzo-claro');
    /* solo con una fórmula, sin nada escrito ni conectado, también se pide */
    await aClic(`${nodoEl('g2')}.querySelector('[data-lz-fx-elegir]')`, { tras: 400 });
    await aClic(`[...document.querySelectorAll('.lz-fx-menu [data-lz-fx-op]')].find(b => b.textContent.includes('Tono noir'))`, { tras: 300 });
    await tecla('Escape', [], 300);
    comprobar('e) una operación solo con fórmula no dice que le falte nada', await js(`return !${nodoEl('g2')}.querySelector('.lz-falta');`), await js(`return ${nodoEl('g2')}.innerText;`));
    await aClic(`${nodoEl('g2')}.querySelector('[data-lz-pedir]')`, { tras: 600 });
    comprobar('e) y se pide', await hasta(`return !!${nodoEl('g2')}.querySelector('.lz-estado.pendiente');`, 2000) && /Tono noir/.test(portapapeles), portapapeles);

    /* ---------- f) Claude la ejecuta; cambiar una fórmula la desactualiza ---------- */
    r = await M.llamar('ejecutar_nodo', { lienzo: lid, nodo: 'g1' });
    comprobar('f) ejecutar_nodo trae la instrucción compuesta (fórmulas y lo escrito en su hueco)', !r.error && /Frases cortas y secas/.test(r.texto) && /Máximo tres escenas/.test(r.texto) && /en off: Una escena en la azotea/.test(r.texto), r.texto.slice(0, 1500));
    r = await M.llamar('escribir_documento', { esquema: ids.eid, contenido: 'INT. AZOTEA - NOCHE\n\nLlueve.' });
    r = await M.llamar('completar_nodo', { lienzo: lid, nodo: 'g1', salida: { tipo: 'documento', esquema: ids.eid } });
    comprobar('f) completar_nodo la deja hecha', !r.error && await hasta(`return !!${nodoEl('g1')}.querySelector('.lz-estado.hecho');`, 3000), r.texto);
    await aClic(`${nodoEl('g1')}.querySelector('[data-lz-fx-abrir="${cortoId}"]')`, { tras: 800 });
    comprobar('f) un clic en el chip abre la fórmula en su ventana, sobre «Fórmulas»', await hasta(`return document.body.classList.contains('vista-documentos') && ${G}.esFormulas() && ${G}.notaElegida() === '${cortoId}';`, 3000) && await abierta(),
      await js(`return JSON.stringify({ modo: Claquedraw.app.modo(), sel: ${G}.notaElegida() });`));
    await aClic(`${CAPA}.querySelector('[data-gd-modal-cola]')`, { tras: 200 });
    await escribir(' Sin epilogo.'); await espera(700);
    await cerrarVentana();
    comprobar('f) lo escrito llega a la fórmula', await js(`return ${D}.textoFormula('${cortoId}') === 'Máximo tres escenas. Sin epilogo.';`), await js(`return ${D}.textoFormula('${cortoId}');`));
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(700); return true;`);
    comprobar('f) cambiar el texto de una fórmula elegida deja la operación desactualizada (por su instrucción)', await hasta(`const e = ${nodoEl('g1')}.querySelector('.lz-estado.viejo'); return !!e && /instrucci/.test(e.title);`, 3000),
      await js(`return ${nodoEl('g1')}.querySelector('.lz-npie').innerHTML.slice(0, 300);`));

    /* ---------- g) tirar una fórmula elegida: el chip, roto ---------- */
    await js(`Claquedraw.app.vista('documentos'); await W(200); return true;`);
    await aClic(`${filaFx}.querySelector('[data-gd-nombre]')`, { tras: 500 });
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${cortoId}"] .gd-nota-acc')`, { tras: 250 });
    const menuF = await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent.trim()).join(' | ');`);
    comprobar('g) el ⋯ de una fórmula: ni «Guardar como…» ni «Añadir al lienzo…»', !/Guardar como/.test(menuF) && !/Añadir al lienzo/.test(menuF) && /Mover a la papelera/.test(menuF), menuF);
    await aClic(opcionPop('Mover a la papelera'), { tras: 300 });
    await aClic(`document.getElementById('dlgOk')`, { tras: 500 });
    comprobar('g) la fórmula se va a la papelera', await js(`return !!${D}.enPapelera('${cortoId}');`));
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(700); return true;`);
    const rotos = await chipsNodo('g1');
    comprobar('g) su chip se ve roto (y el otro, bien)', rotos && rotos[0] === 'Tono noir' && /^!/.test(rotos[1]) && /Formato corto/.test(rotos[1]), JSON.stringify(rotos));
    portapapeles = '';
    await aClic(`${nodoEl('g1')}.querySelector('[data-lz-pedir]')`, { tras: 400 });
    comprobar('g) y no impide pedirla (el encargo lo dice)', /ya no existe/.test(portapapeles) && await hasta(`return !!${nodoEl('g1')}.querySelector('.lz-estado.pendiente');`, 2000), portapapeles);
    comprobar('g) el aviso dice que va sin ella', await hasta(`return /ya no está.*sin ella/.test(document.getElementById('aviso').textContent);`, 5000), await avisoTxt());
    await js(`Claquedraw.app.vista('documentos'); await W(200); return true;`);
    await aClic(`document.querySelector('.gd-cont.papelera[data-id="papelera"] [data-gd-nombre]')`, { tras: 500 });
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${cortoId}"]');`, 3000);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${cortoId}"] .gd-nota-acc')`, { tras: 250 });
    const rest = await js(`const b = ${opcionPop('Restaurar')}; return b ? b.textContent : null;`);
    comprobar('g) en la papelera, «Restaurar en «Fórmulas»»', rest && /Fórmulas/.test(rest), rest);
    await aClic(opcionPop('Restaurar'), { tras: 500 });
    comprobar('g) restaurada vuelve a Fórmulas, a su segmento', await js(`return !${D}.enPapelera('${cortoId}') && ${D}.esFormula('${cortoId}') && ${D}.nota('${cortoId}').etiquetaId === '${estilo}';`));
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(700); return true;`);
    comprobar('g) y su chip vuelve a estar bien', JSON.stringify(await chipsNodo('g1')) === '["Tono noir","Formato corto"]', JSON.stringify(await chipsNodo('g1')));

    /* ---------- h) «Nueva fórmula desde lo escrito…» ---------- */
    await aClic(`${nodoEl('g2')}.querySelector('.lz-instr')`, { tras: 150 });
    await escribir('Todo en presente y en voz baja');
    await espera(500);
    await aClic(`${nodoEl('g2')}.querySelector('[data-lz-fx-elegir]')`, { tras: 400 });
    await aClic(`[...document.querySelectorAll('.lz-fx-menu button')].find(b => /desde lo escrito/.test(b.textContent))`, { tras: 400 });
    const propuesto = await js(`const i = document.querySelector('.lz-fx-nueva input'); return i ? i.value : null;`);
    comprobar('h) pide el nombre, con el principio de lo escrito', propuesto === 'Todo en presente y en voz baja', propuesto);
    await tecla('a', ['meta'], 80); await escribir('Voz baja'); await tecla('Enter', [], 600);
    const vozId = await fxId('Voz baja');
    comprobar('h) la crea en «Fórmulas» con ese texto y la elige (detrás de las que había)', !!vozId && await js(`return ${D}.textoFormula('${vozId}') === 'Todo en presente y en voz baja';`) && JSON.stringify(await chipsNodo('g2')) === '["Tono noir","Voz baja"]',
      JSON.stringify({ vozId, chips: await chipsNodo('g2') }));
    /* quitar un chip con su × */
    await aClic(`${nodoEl('g2')}.querySelectorAll('.lz-fx-x')[1]`, { tras: 400 });
    comprobar('h) la × de un chip la quita', JSON.stringify(await chipsNodo('g2')) === '["Tono noir"]', JSON.stringify(await chipsNodo('g2')));
    /* Synthwave: la operación con fórmulas, y el tablero */
    if (CAPTURAS) {
      itemsTema().find(i => i.label === 'Synthwave').click(); await espera(700);
      await captura('formulas-lienzo-synthwave');
    }

    /* ---------- i) enlaces, pestaña y Ver › Fórmulas ---------- */
    await js(`Claquedraw.app.vista('documentos'); await W(200); return true;`);
    await aClic(`${filaFx}.querySelector('[data-gd-menu="formulas"]')`, { tras: 300 });
    portapapeles = '';
    await aClic(opcionPop('Copiar enlace'), { tras: 400 });
    comprobar('i) el ⋯ de «Fórmulas» copia su enlace', /clapcraft:\/\/[^)\s]+\/biblioteca\/formulas:biblioteca/.test(portapapeles) && /Fórmulas/.test(portapapeles), portapapeles);
    const enlaceFx = portapapeles;
    if (CAPTURAS) { await aClic(`${filaFx}.querySelector('[data-gd-nombre]')`, { tras: 500 }); await captura('formulas-tablero-synthwave'); }
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    portapapeles = enlaceFx;
    menuApp('Claude', 'Ir al enlace copiado').click(); await espera(900);
    comprobar('i) ir al enlace de «Fórmulas» abre su tablero', await hasta(`return ${G}.esFormulas() && document.body.classList.contains('vista-documentos');`, 3000), await avisoTxt());
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${noirId}"] > span:first-child')`, { tras: 500 });
    portapapeles = '';
    await aClic(`${CAPA}.querySelector('[data-gd-lado-enlace]')`, { tras: 400 });
    const enlaceNoir = portapapeles;
    comprobar('i) la ventana de una fórmula copia su enlace', /clapcraft:\/\//.test(enlaceNoir) && /Tono noir/.test(enlaceNoir), enlaceNoir);
    await cerrarVentana();
    await js(`Claquedraw.app.abrirLienzo('${lid}'); await W(500); return true;`);
    portapapeles = enlaceNoir;
    menuApp('Claude', 'Ir al enlace copiado').click(); await espera(900);
    comprobar('i) ir al enlace de una fórmula la abre en su ventana, sobre «Fórmulas»', await hasta(`return ${G}.esFormulas() && ${G}.notaElegida() === '${noirId}' && !${G}.notaAbierta();`, 3000) && await abierta(),
      JSON.stringify({ aviso: await avisoTxt(), modo: await js(`return Claquedraw.app.modo();`) }));
    await cerrarVentana();
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    menuApp('Ver', 'Fórmulas').click();
    comprobar('i) Ver › Fórmulas abre su tablero (desde el esquema)', await hasta(`return ${G}.esFormulas() && document.body.classList.contains('vista-documentos');`, 3000));
    await aClic(`${filaFx}.querySelector('[data-gd-menu="formulas"]')`, { tras: 300 });
    const nPest = await js(`return document.querySelectorAll('.pestana').length;`);
    await aClic(opcionPop('Abrir en pestaña'), { tras: 500 });
    comprobar('i) «Abrir en pestaña» no la duplica (ya es la de delante) o abre otra con ella', await js(`const p = document.querySelector('.pestana.activa'); return !!p && p.dataset.tipo === 'formulas';`) && await js(`return document.querySelectorAll('.pestana').length;`) <= nPest + 1);

    /* ---------- j) Plantillas, igual que antes ---------- */
    await aClic(`document.querySelector('[data-gd-plantillas] [data-gd-nombre]')`, { tras: 500 });
    comprobar('j) «Plantillas» sigue abriendo su tablero, con su aviso y «Nueva plantilla»', await hasta(`return ${G}.esPlantillas();`, 2000) && await js(`const m = document.getElementById('gdMain'); return !!m.querySelector('.gd-plantillas-aviso:not(.gd-formulas-aviso)') && !!m.querySelector('[data-gd-nueva-plantilla]') && !m.querySelector('[data-gd-nueva-formula]') && !!m.querySelector('.esq-cab .gd-chip--plantillas');`));
    await aClic(`document.querySelector('#gdMain [data-gd-nueva-plantilla]')`, { tras: 400 });
    await escribir('Acta'); await tecla('Enter', [], 250);
    await escribir('**hola** y');
    await espera(400);
    const pl = JSON.parse(await js(`const c = ${CAPA}, f = ${CAMPO}; return JSON.stringify({ plano: f.classList.contains('plano'), expandir: !c.querySelector('[data-gd-lado-abrir]').hidden, html: f.innerHTML, usar: !!c.querySelector('.gd-lado-usar') });`));
    comprobar('j) la ventana de una plantilla sigue con Markdown vivo, ⤢ y «Usar»', !pl.plano && pl.expandir && pl.usar && /<(strong|b)>hola<\/(strong|b)>/.test(pl.html), JSON.stringify(pl));
    await cerrarVentana();

    /* ---------- k) el asistente ---------- */
    await js(`await window.editorAPI.ia.guardarClave(${JSON.stringify(CLAVE)}); return true;`);
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    await aClic(`document.querySelector('#rows .row .track')`, { tras: 150 });
    await tecla('I', ['meta', 'shift'], 500);
    comprobar('k) el panel del asistente se abre', await hasta(`return Claquedraw.asistente.abierto() && document.getElementById('asistente').offsetWidth > 200;`, 3000));
    await hasta(`return !document.querySelector('#asistente [data-as-campo]').disabled;`, 3000);
    comprobar('k) «Fórmulas» junto al campo', await js(`return !!document.querySelector('#asistente .as-campo-fila [data-as-fx-abrir]');`));
    await aClic(`document.querySelector('#asistente [data-as-fx-abrir]')`, { tras: 400 });
    const lstA = JSON.parse(await js(`const p = document.querySelector('#asistente .as-fx-pop'); return JSON.stringify(p ? { grupos: [...p.querySelectorAll('[data-as-fx-grupo]')].map(g => g.textContent), ops: [...p.querySelectorAll('[data-as-fx-op] b')].map(b => b.textContent), foco: document.activeElement === p.querySelector('input') } : null);`));
    comprobar('k) su lista, con buscador y agrupada por segmento', lstA && lstA.foco && lstA.grupos.includes('Bandeja') && lstA.grupos.includes('Estilo') && lstA.ops.includes('Tono noir'), JSON.stringify(lstA));
    await aClic(`[...document.querySelectorAll('#asistente [data-as-fx-op]')].find(b => b.textContent.includes('Tono noir'))`, { tras: 300 });
    await tecla('Escape', [], 300);
    comprobar('k) activarla pone su chip encima del campo', await js(`const c = [...document.querySelectorAll('#asistente .as-fx-chip')].map(x => x.textContent.trim()); return JSON.stringify(c) === '["Tono noir"]' && JSON.stringify(Claquedraw.asistente.formulasActivas()) === JSON.stringify(['${noirId}']);`),
      await js(`return document.querySelector('#asistente [data-as-fx]').outerHTML.slice(0, 400);`));
    /* «/» al principio: la lista; su «+» inserta el texto */
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir('/');
    comprobar('k) «/» al principio de un mensaje vacío abre la lista (y la «/» no se queda)', await hasta(`return !!document.querySelector('#asistente .as-fx-pop') && document.querySelector('#asistente [data-as-campo]').value === '';`, 2000));
    await aClic(`document.querySelector('#asistente [data-as-fx-ins="${vozId}"]')`, { tras: 300 });
    comprobar('k) el «+» de una fórmula pone su texto en el mensaje', await js(`return document.querySelector('#asistente [data-as-campo]').value.includes('Todo en presente y en voz baja') && !document.querySelector('#asistente .as-fx-pop');`));
    await escribir('Escribe un logline.');
    const antes = S.peticiones.length;
    await tecla('Enter', [], 300);
    await hasta(`return !Claquedraw.asistente.trabajando() && Claquedraw.asistente._estado().items.some(i => i.tipo === 'ia');`, 10000);
    const pet = S.peticiones.slice(antes).find(p => p.url === '/v1/chat/completions');
    const sis = pet ? (pet.cuerpo.messages || []).find(m => m.role === 'system') : null, usu = pet ? (pet.cuerpo.messages || []).filter(m => m.role === 'user').pop() : null;
    comprobar('k) la petición al modelo lleva el texto de la fórmula activa (en el sistema)', !!sis && /FÓRMULAS ACTIVAS/.test(sis.content) && /Frases cortas y secas/.test(sis.content), sis ? sis.content.slice(-1200) : JSON.stringify(S.peticiones.slice(antes).map(p => p.url)));
    comprobar('k) y el mensaje, el texto insertado', !!usu && /Todo en presente y en voz baja/.test(usu.content) && /logline/.test(usu.content), usu && usu.content);
    await js(`await Claquedraw.asistente.recargar(); await W(600); return true;`);
    comprobar('k) las fórmulas activas se guardan con la conversación', await hasta(`return JSON.stringify(Claquedraw.asistente.formulasActivas()) === JSON.stringify(['${noirId}']) && document.querySelectorAll('#asistente .as-fx-chip').length === 1;`, 3000),
      await js(`return JSON.stringify(Claquedraw.asistente.formulasActivas());`));
    await aClic(`document.querySelector('#asistente .as-fx-x')`, { tras: 300 });
    comprobar('k) la × la desactiva', await js(`return !Claquedraw.asistente.formulasActivas().length && document.querySelector('#asistente [data-as-fx]').hidden;`));

    /* ---------- k2) el campo del mensaje: los enlaces de ClapCraft, como chips (Leo: «que se vea como un chip para que no se
       confunda con el texto») ---------- */
    const CAMPO_A = `document.querySelector('#asistente [data-as-campo]')`;
    const valorA = () => js(`return ${CAMPO_A}.value;`);
    await js(`const c = ${CAMPO_A}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);
    await aClic(`[...document.querySelectorAll('[data-enlace-cab]')].find(b => b.offsetParent)`, { tras: 300 });
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /Mandar al asistente/.test(b.textContent))`, { tras: 400 });
    const chipA = JSON.parse(await js(`const c = ${CAMPO_A}, ch = [...c.querySelectorAll('.as-chip-campo')]; return JSON.stringify({ n: ch.length, txt: c.textContent, et: ch[0] && ch[0].textContent, ce: ch[0] && ch[0].getAttribute('contenteditable'), ico: !!(ch[0] && ch[0].querySelector('use[href="#ic-board"]')), fila: !document.querySelector('#asistente [data-as-enlaces]') || document.querySelector('#asistente [data-as-enlaces]').hidden });`));
    comprobar('k2) «Mandar al asistente» pone un chip en el campo (con su icono y su etiqueta), no el texto crudo, y sin fila de chips encima',
      chipA.n === 1 && !/clapcraft:\/\//.test(chipA.txt) && /Esquema «/.test(chipA.et) && chipA.ce === 'false' && chipA.ico && chipA.fila, JSON.stringify(chipA));
    await escribir('revisa esto');
    await tecla('Home', [], 120);
    await escribir('Mira: ');
    let va = await valorA();
    comprobar('k2) se escribe antes y después del chip, y el valor lleva el enlace en su sitio', /^Mira: \[Esquema «[^\]]+\]\(clapcraft:\/\/[^)]+\) revisa esto$/.test(va), va);
    await tecla('End', [], 100);
    for (let i = 0; i < 12; i++) await tecla('Left', [], 40);
    await tecla('Backspace', [], 250);
    va = await valorA();
    comprobar('k2) Retroceso junto al chip lo borra entero (de una vez)', !/clapcraft/.test(va) && /^Mira: +revisa esto$/.test(va) && await js(`return !${CAMPO_A}.querySelector('.as-chip-campo');`), va);
    await tecla('End', [], 100);
    await tecla('Enter', ['shift'], 120);
    await escribir('y');
    comprobar('k2) Mayús+Enter salta de renglón', /revisa esto\ny$/.test(await valorA()), await valorA());
    /* pegar un texto con enlaces: los de ClapCraft, chips; el resto, texto */
    await js(`const c = ${CAMPO_A}; c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      const dt = new DataTransfer(); dt.setData('text/html', '<b>no</b>'); dt.setData('text/plain', ' con [Nota «Delta»](clapcraft://las-formulas/nota/abc) y clapcraft://las-formulas/esquema/zz fin');
      c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
    await espera(200);
    const pegado = JSON.parse(await js(`const c = ${CAMPO_A}; return JSON.stringify({ n: c.querySelectorAll('.as-chip-campo').length, v: c.value, b: !!c.querySelector('b') });`));
    comprobar('k2) pegar: los enlaces de ClapCraft (con nombre o sueltos) entran como chips y lo demás como texto', pegado.n === 2 && !pegado.b && /y con \[Nota «Delta»\]\(clapcraft:\/\/las-formulas\/nota\/abc\) y \[[^\]]+\]\(clapcraft:\/\/las-formulas\/esquema\/zz\) fin$/.test(pegado.v), JSON.stringify(pegado));
    await js(`const c = ${CAMPO_A}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);
    comprobar('k2) vacío, enseña su texto de ayuda', await js(`const c = ${CAMPO_A}; return c.classList.contains('vacio') && /Pídele/.test(getComputedStyle(c, '::before').content);`));
    /* mandar con un chip: al modelo le llega el enlace en markdown, en su sitio */
    await aClic(CAMPO_A, { tras: 120 });
    await escribir('Resume ');
    await aClic(`[...document.querySelectorAll('[data-enlace-cab]')].find(b => b.offsetParent)`, { tras: 300 });
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /Mandar al asistente/.test(b.textContent))`, { tras: 400 });
    await escribir('en dos frases');
    const antes2 = S.peticiones.length;
    await tecla('Enter', [], 300);
    await hasta(`return !Claquedraw.asistente.trabajando() && ${CAMPO_A}.value === '';`, 10000);
    const pet2 = S.peticiones.slice(antes2).find(p => p.url === '/v1/chat/completions'), usu2 = pet2 ? (pet2.cuerpo.messages || []).filter(m => m.role === 'user').pop() : null;
    comprobar('k2) lo que llega al modelo lleva el enlace en markdown, en su sitio del texto', !!usu2 && /Resume \[Esquema «[^\]]+\]\(clapcraft:\/\/[^)]+\) en dos frases/.test(usu2.content), usu2 && usu2.content);
    comprobar('k2) y el mensaje enviado lo enseña como chip', await js(`const y = [...document.querySelectorAll('#asistente .as-yo')].pop(); return !!y && !!y.querySelector('.as-chip-enlace') && !/clapcraft:/.test(y.textContent);`));
    await js(`Claquedraw.asistente.cerrar(); return true;`);
    if (CAPTURAS) { itemsTema().find(i => i.label === 'Claro').click(); await espera(400); }

    /* ---------- el archivo ---------- */
    await js(`await Claquedraw.app.guardar(); await W(600); return true;`);
    for (let i = 0; i < 40 && !(fs.existsSync(RUTA) && leerArchivo(RUTA).documentos.notas.some(n => n.subId === 'formulas:biblioteca' && n.titulo === 'Voz baja')); i++) await espera(150);
    const fd = leerArchivo(RUTA).documentos;
    const lf = (fd.contenedores.find(c => c.id === ids.cid).lienzos || []).find(l => l.id === lid);
    comprobar('el archivo lleva la biblioteca de las fórmulas y las fórmulas de cada operación', fd.contenedores.some(c => c.id === 'formulas' && c.especial === 'formulas' && c.oculto)
      && fd.notas.filter(n => n.subId === 'formulas:biblioteca').length === 5 && !!lf && JSON.stringify(lf.nodos.find(n => n.id === 'g1').datos.formulas) === JSON.stringify([noirId, cortoId]) && JSON.stringify(lf.nodos.find(n => n.id === 'g2').datos.formulas) === JSON.stringify([noirId]),
      JSON.stringify({ n: fd.notas.filter(n => n.subId === 'formulas:biblioteca').map(n => n.titulo), l: lf && lf.nodos.map(n => n.datos.formulas) }));

    /* ---------- m) sin errores ---------- */
    comprobar('m) la página no soltó ningún error', !errores.length, errores.join(' | '));
    comprobar('el servidor MCP no soltó errores', !/Error|error:/.test(M.errores().replace(/servidor MCP listo[^\n]*/, '')), M.errores());
  } catch (e) {
    comprobar('sin excepciones', false, e && e.stack);
  } finally {
    if (M) M.cerrar();
    try { servidor.close(); } catch (_) {}
    const mal = resultados.filter(x => !x.ok).length;
    console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
    if (!mal) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    app.exit(mal ? 1 : 0);
  }
});
