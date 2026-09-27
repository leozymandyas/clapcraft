/* Prueba de las conexiones esquema ↔ biblioteca y de los fragmentos con la app de verdad (Electron):
   `electron pruebas/conexiones-electron.js`.
   1.1.57 (Leo: «dividir el guion en fragmentos más pequeños que vivan en notas de segmentos […] para que IAs como Seedance puedan
   generar mis guiones»). Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos y el
   portapapeles de mentira: el de verdad es el de Leo), crea un proyecto en blanco con archivo y lo llena con el servidor MCP
   (arrancado como lo arranca Claude: con el Node de la app, ELECTRON_RUN_AS_NODE): un esquema con dos tramas, tres nodos y su guion
   (tres escenas con diálogo), y una biblioteca. Con **el ratón de verdad** (`webContents.sendInputEvent`, la ventana enfocada)
   comprueba:
   a) conectar desde el ⋯ del árbol («Conectar con biblioteca…» y la biblioteca), con la cuenta en el menú;
   b) los chips: en la cabecera del esquema (la biblioteca) y en la de la biblioteca (el esquema); el chip lleva a su sitio;
   c) la × de un chip desconecta y el «Deshacer» del aviso la devuelve;
   d) preparar_fragmentos en vivo: no escribe nada, tramos de 15 s como mucho, con sus nodos y bloques, y dice la biblioteca
      conectada;
   e) Claude crea con editar_biblioteca un segmento por acto y una nota por fragmento, con ```aviso y ```prompt y `fragmento`;
   f) en la biblioteca, cada tarjeta lleva su etiqueta «Fragmento · N s»; en su ventana, los recuadros y la etiqueta entera;
   g) un clic en la etiqueta lleva al nodo, elegido, en el esquema;
   h) borrar el nodo deja el fragmento huérfano (se ve y se dice), sin errores;
   i) el historial de Claude lo revierte (el nodo vuelve) y revierte las notas (y su «Deshacer» las devuelve);
   j) el archivo guarda las conexiones y los fragmentos y, cerrado y vuelto a abrir, siguen ahí (con sus chips);
   k) la página y el servidor no sueltan ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-conexiones-'));
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
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args || {} }); return { error: !!r.result.isError, texto: r.result.content[0].text }; };
  return { pedir, llamar, errores: () => errores, cerrar: () => { try { p.stdin.end(); p.kill(); } catch (_) {} } };
}
const leerArchivo = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));

/* el guion: tres escenas con diálogo, y cada una nombra su nodo (así preparar_fragmentos los asocia por el título) */
const GUION = [
  'INT. ESTACIÓN - NOCHE', '',
  'La llegada: MARA baja del tren con una maleta roja. La lluvia cae sobre el andén vacío y los faroles parpadean sobre los charcos.', '',
  'MARA', '(para sí)', 'Otra vez aquí. Nada ha cambiado en diez años, ni siquiera el olor a hierro mojado. Ni el reloj, que sigue parado en las doce.', '',
  'EXT. PUENTE - NOCHE', '',
  'El encuentro: LEO la espera en mitad del puente, fumando, con el cuello del abrigo levantado.', '',
  'LEO', 'Pensé que no vendrías.', '',
  'MARA', 'Yo también lo pensé. Hasta el último momento estuve a punto de quedarme en el tren y seguir hasta el final de la línea, donde nadie me conoce.', '',
  'INT. CAFÉ - AMANECER', '',
  'La despedida: se sientan frente a frente con dos tazas frías. Afuera, la ciudad empieza a despertar.', '',
  'LEO', '¿Te quedas?', '',
  'MARA', 'No.', '',
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
    ev({ type: 'mouseDown', x, y, button, clickCount: 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: 1, modifiers }); await espera(op.tras === undefined ? 250 : op.tras);
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
  const G = `Claquedraw.gestor`, D = `Claquedraw.gestor.documentos()`;
  const CAPA = `document.querySelector('.gd-modal-capa')`, CAMPO = `${CAPA}.querySelector('[data-gd-lado-texto]')`;
  const opcionPop = t => `[...document.querySelectorAll('.gd-pop button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  const accionAviso = t => `[...document.querySelectorAll('#aviso .aviso-accion')].find(b => b.textContent === ${JSON.stringify(t)})`;
  const avisoTxt = () => js(`return document.getElementById('aviso').textContent;`);
  const menuClaude = texto => Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items.find(i => i.label === texto);
  const filaArbol = (tipo, nombre) => `[...document.querySelectorAll('#gdSide .gd-sub--${tipo}')].find(f => f.querySelector('.gd-sub-nom').textContent === ${JSON.stringify(nombre)})`;
  const chipsEsq = () => js(`return JSON.stringify([...document.querySelectorAll('#conexionesEsq .cx-chip')].map(c => c.textContent.trim()));`).then(JSON.parse);
  const chipsBib = () => js(`return JSON.stringify([...document.querySelectorAll('#gdMain .esq-cab .cx-chip')].map(c => c.textContent.trim()));`).then(JSON.parse);

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1360, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de las conexiones y los fragmentos en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Corto de lluvia', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const RUTA = path.join(TMP, fs.readdirSync(TMP).find(f => /\.clapcraft$/.test(f)) || 'x.clapcraft');
    comprobar('el proyecto nace con su archivo', fs.existsSync(RUTA), fs.readdirSync(TMP).join());

    /* ---------- el esquema, su guion y la biblioteca (Claude, en vivo) ---------- */
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [
      { op: 'crear_trama', ref: 'b', nombre: 'Recuerdos', color: 'rosa' },
      { op: 'crear_nodo', trama: 'Trama', columna: 2, titulo: 'La llegada', descripcion: 'Mara vuelve a la ciudad.' },
      { op: 'crear_nodo', trama: 'Trama', columna: 4, titulo: 'El encuentro', descripcion: 'Leo la espera en el puente.' },
      { op: 'crear_nodo', trama: 'Trama', columna: 6, titulo: 'La despedida', descripcion: 'Se dicen adiós.' },
      { op: 'crear_nodo', trama: '$b', columna: 3, titulo: 'El reloj parado' }] });
    comprobar('Claude crea las tramas y los nodos del esquema', !r.error, r.texto);
    r = await M.llamar('escribir_documento', { esquema: 'Esquema', contenido: GUION });
    comprobar('y escribe su guion (tres escenas con diálogo)', !r.error, r.texto);
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Fragmentos' }, { op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas' }] });
    comprobar('y dos bibliotecas', !r.error, r.texto);
    await espera(500);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas.find(x => x.nombre === 'Esquema');
      const b = n => c.subs.find(x => x.nombre === n).id; const p = t => e.datos.puntos.find(x => x.titulo === t).id;
      return JSON.stringify({ eid: e.id, sid: b('Fragmentos'), ideas: b('Ideas'), llegada: p('La llegada'), encuentro: p('El encuentro'), despedida: p('La despedida') });`));
    comprobar('el guion llega al documento del esquema', await js(`const n = ${D}.documentoEsquema('${ids.eid}'); return !!n && /sp-scene/.test(n.html) && /sp-dialogue/.test(n.html) && (n.html.match(/sp-scene/g) || []).length === 3;`));

    /* ---------- a) conectar desde el ⋯ del árbol, con el ratón ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    comprobar('sin conexiones, la cabecera del esquema ofrece «Conectar»', await js(`const b = document.querySelector('#conexionesEsq .cx-mas'); return !!b && /Conectar/.test(b.textContent) && !document.querySelector('#conexionesEsq .cx-chip');`));
    await aClic(`${filaArbol('esquema', 'Esquema')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    comprobar('a) el ⋯ del esquema ofrece «Conectar con biblioteca…»', await js(`return !!${opcionPop('Conectar con biblioteca')};`), await js(`return [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent).join(' | ');`));
    await aClic(opcionPop('Conectar con biblioteca'), { tras: 300 });
    const lista = JSON.parse(await js(`return JSON.stringify({ tit: (document.querySelector('.gd-pop .gd-pop-tit') || {}).textContent, xs: [...document.querySelectorAll('.gd-pop button')].map(b => b.textContent.trim()) });`));
    comprobar('a) el menú lista las bibliotecas que se pueden conectar (no la oculta del guion ni la de las plantillas)', /Conectar «Esquema» con/.test(lista.tit || '') && lista.xs.includes('Fragmentos') && lista.xs.includes('Ideas') && lista.xs.length === 2, JSON.stringify(lista));
    await aClic(opcionPop('Fragmentos'), { tras: 400 });
    comprobar('a) un clic la conecta', await js(`return ${D}.conectado('${ids.eid}', '${ids.sid}');`));
    comprobar('a) y el aviso lo dice, con «Deshacer»', /conectado con la biblioteca «Fragmentos»/.test(await avisoTxt()) && await js(`return !!${accionAviso('Deshacer')};`), await avisoTxt());
    await aClic(`${filaArbol('esquema', 'Esquema')}.querySelector('[data-gd-menu="hijo"]')`, { tras: 300 });
    comprobar('a) el ⋯ del esquema cuenta ya una conexión', await js(`const b = ${opcionPop('Conectar con biblioteca')}; return !!b && (b.querySelector('kbd') || {}).textContent === '1';`));
    await tecla('Escape', [], 200);

    /* ---------- b) los chips ---------- */
    comprobar('b) la cabecera del esquema lleva el chip de la biblioteca conectada', JSON.stringify(await chipsEsq()) === '["Fragmentos"]', JSON.stringify(await chipsEsq()));
    comprobar('b) y ya no «Ver biblioteca» (mandan las conexiones)', await js(`return document.getElementById('verDocumentos').hidden;`));
    await aClic(`document.querySelector('#conexionesEsq [data-cx-ir]')`, { tras: 600 });
    comprobar('b) el chip lleva a la biblioteca', await hasta(`return document.body.classList.contains('vista-documentos') && (${G}.subActual() || {}).id === '${ids.sid}';`, 3000));
    comprobar('b) la cabecera de la biblioteca lleva el chip del esquema', JSON.stringify(await chipsBib()) === '["Esquema"]', JSON.stringify(await chipsBib()));
    await aClic(`document.querySelector('#gdMain .esq-cab [data-cx-ir]')`, { tras: 600 });
    comprobar('b) y su chip lleva al esquema', await hasta(`return !document.body.classList.contains('vista-documentos') && !document.body.classList.contains('vista-texto');`, 3000));

    /* ---------- c) la × desconecta y el «Deshacer» del aviso la devuelve ---------- */
    await aClic(`document.querySelector('#conexionesEsq [data-cx-quitar]')`, { tras: 300 });
    comprobar('c) la × del chip desconecta', await js(`return !${D}.conectado('${ids.eid}', '${ids.sid}') && !document.querySelector('#conexionesEsq .cx-chip');`));
    comprobar('c) el aviso lo dice', /ya no está conectado con «Fragmentos»/.test(await avisoTxt()), await avisoTxt());
    await aClic(accionAviso('Deshacer'), { tras: 400 });
    comprobar('c) «Deshacer» la devuelve, con su chip', await js(`return ${D}.conectado('${ids.eid}', '${ids.sid}');`) && JSON.stringify(await chipsEsq()) === '["Fragmentos"]', JSON.stringify(await chipsEsq()));
    /* y otra más, para ver que son de muchos a muchos */
    await aClic(`document.querySelector('#conexionesEsq [data-cx-conectar]')`, { tras: 300 });
    await aClic(opcionPop('Ideas'), { tras: 400 });
    comprobar('c) «Conectar» de la cabecera suma otra (de muchos a muchos)', JSON.stringify(await chipsEsq()) === '["Fragmentos","Ideas"]', JSON.stringify(await chipsEsq()));
    await aClic(`[...document.querySelectorAll('#conexionesEsq .cx-chip')].find(c => /Ideas/.test(c.textContent)).querySelector('[data-cx-quitar]')`, { tras: 300 });
    comprobar('c) y se quita la que sobra', JSON.stringify(await chipsEsq()) === '["Fragmentos"]', JSON.stringify(await chipsEsq()));
    r = await M.llamar('ver_proyecto');
    comprobar('ver_proyecto dice la conexión', !r.error && /Fragmentos/.test(r.texto) && /conectad/i.test(r.texto), r.texto);

    /* ---------- d) preparar_fragmentos, en vivo ---------- */
    const antesPrep = await js(`return JSON.stringify(${D}.datos);`);
    const histAntes = await js(`return (${D}.datos.historialClaude || []).length;`);
    r = await M.llamar('preparar_fragmentos', { esquema: 'Esquema' });
    comprobar('d) preparar_fragmentos contesta en vivo con su propuesta', !r.error && /FRAGMENTOS PROPUESTOS/.test(r.texto) && /Bibliotecas conectadas[^\n]*«Fragmentos»/.test(r.texto), r.texto.slice(0, 1500));
    r = await M.llamar('preparar_fragmentos', { esquema: 'Esquema', formato: 'json' });
    let prop = null; try { prop = JSON.parse(r.texto); } catch (_) {}
    const frags = prop ? prop.fragmentos : [];
    comprobar('d) desde el guion, con la biblioteca conectada', prop && prop.fuente === 'guion' && JSON.stringify(prop.bibliotecas) === JSON.stringify([ids.sid]), r.texto.slice(0, 800));
    comprobar('d) varios fragmentos, ninguno de más de 15 s', frags.length >= 3 && frags.every(f => f.segundos > 0 && f.segundos <= 15), JSON.stringify(frags));
    comprobar('d) cada uno con sus nodos, sus bloques y su puesto', frags.every((f, i) => f.orden === i + 1 && f.nodos.length >= 1 && Array.isArray(f.bloques) && f.bloques[0] <= f.bloques[1]), JSON.stringify(frags));
    comprobar('d) los nodos, los de su escena (por el título que nombra el guion)', frags.some(f => f.nodos.includes(ids.llegada)) && frags.some(f => f.nodos.includes(ids.encuentro)) && frags.some(f => f.nodos.includes(ids.despedida))
      && frags.filter(f => f.escena === 1).every(f => JSON.stringify(f.nodos) === JSON.stringify([ids.llegada])), JSON.stringify(frags));
    comprobar('d) y no escribe nada (ni el proyecto ni el historial)', await js(`return JSON.stringify(${D}.datos);`) === antesPrep && await js(`return (${D}.datos.historialClaude || []).length;`) === histAntes);

    /* ---------- e) Claude escribe una nota por fragmento ---------- */
    const segmentos = [...new Set(frags.map(f => f.segmento || 'Secuencia'))];
    const ops = segmentos.map((s, i) => ({ op: 'crear_segmento', ref: 's' + i, nombre: s, color: i }));
    frags.forEach(f => ops.push({ op: 'crear_nota', titulo: 'Fragmento ' + String(f.orden).padStart(2, '0'), segmento: '$s' + segmentos.indexOf(f.segmento || 'Secuencia'),
      contenido: '```aviso:info Duración\n≈ ' + String(f.segundos).replace('.', ',') + ' s · bloques ' + f.bloques[0] + '–' + f.bloques[1] + '\n```\n\n```prompt Plano ' + f.orden + ' {.azul}\nLluvia de noche en una [ciudad], cámara lenta, luz de neón.\nEstilo: [estilo]\n```',
      fragmento: { esquema: 'Esquema', nodos: f.nodos, segundos: f.segundos, orden: f.orden, bloques: f.bloques } }));
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: ops });
    comprobar('e) Claude crea un segmento por acto y una nota por fragmento', !r.error, r.texto);
    await espera(500);
    const notas = JSON.parse(await js(`const d = ${D}; return JSON.stringify(d.fragmentosDe('${ids.eid}').map(n => ({ id: n.id, titulo: n.titulo, f: n.fragmento, html: n.html, etq: n.etiquetaId })));`));
    comprobar('e) las notas son fragmentos del esquema, en su orden', notas.length === frags.length && notas.every((n, i) => n.f.eid === ids.eid && n.f.orden === i + 1 && n.f.segundos === frags[i].segundos
      && JSON.stringify(n.f.nodos) === JSON.stringify(frags[i].nodos) && JSON.stringify(n.f.bloques) === JSON.stringify(frags[i].bloques)), JSON.stringify(notas.map(n => n.f)));
    comprobar('e) con el aviso y el prompt como recuadros de verdad', notas.every(n => /<div class="rc rc-aviso" data-rc="aviso" data-tipo="info" data-titulo="Duración">/.test(n.html) && /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano \d+" data-color="azul">/.test(n.html)), notas[0] && notas[0].html);
    comprobar('e) y cada una en el segmento de su acto', notas.every(n => !!n.etq) && await js(`const d = ${D}; return d.etiquetasDe('${ids.sid}').length === ${segmentos.length};`));
    r = await M.llamar('leer_biblioteca', { biblioteca: 'Fragmentos' });
    comprobar('leer_biblioteca dice el esquema conectado y los fragmentos', !r.error && /Esquema/.test(r.texto) && /FRAGMENTO/i.test(r.texto), r.texto.slice(0, 1200));

    /* ---------- f) las tarjetas y la ventana ---------- */
    await aClic(`document.querySelector('#conexionesEsq [data-cx-ir]')`, { tras: 700 });
    await hasta(`return document.querySelectorAll('#gdMain .gd-nota[data-nota]').length >= ${notas.length};`, 3000);
    const tarjetas = JSON.parse(await js(`return JSON.stringify([...document.querySelectorAll('#gdMain .gd-nota[data-nota]')].map(t => { const f = t.querySelector('.cx-frag');
      return { id: t.dataset.nota, frag: !!f, corta: f && f.classList.contains('corta'), txt: f && f.textContent.trim(), tit: f && f.getAttribute('title'), huerfano: f && f.classList.contains('huerfano') }; }));`));
    const porId = Object.fromEntries(tarjetas.map(t => [t.id, t]));
    comprobar('f) cada tarjeta lleva su etiqueta de fragmento con sus segundos', notas.every(n => { const t = porId[n.id]; return t && t.frag && t.corta && !t.huerfano && t.txt === String(n.f.segundos).replace('.', ',') + ' s'; }), JSON.stringify(tarjetas));
    comprobar('f) y dice «Fragmento nº N de «Esquema» · N s · nodos»', notas.every(n => { const t = porId[n.id]; return t && new RegExp('^Fragmento nº ' + n.f.orden + ' de «Esquema» · ' + String(n.f.segundos).replace('.', ',') + ' s · \\d+ nodos? · clic: ir a sus nodos').test(t.tit); }), JSON.stringify(tarjetas.map(t => t.tit)));
    const n0 = notas[0];
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${n0.id}"] > span:first-child')`, { tras: 700 });
    comprobar('f) su ventana enseña los recuadros', await hasta(`const c = ${CAPA}; return !!c && !c.hidden && !!${CAMPO}.querySelector('.rc-prompt') && !!${CAMPO}.querySelector('.rc-aviso');`, 3000),
      await js(`const c = ${CAPA}; return c ? c.querySelector('[data-gd-lado-texto]').innerHTML.slice(0, 600) : 'sin ventana';`));
    const cabRc = await js(`const p = ${CAMPO}.querySelector('.rc-prompt'), a = ${CAMPO}.querySelector('.rc-aviso'); return getComputedStyle(p, '::before').content + ' | ' + getComputedStyle(a, '::before').content + ' | ' + getComputedStyle(a, '::after').content;`);
    comprobar('f) con su cabecera (el título del prompt, el del aviso)', /Plano 1/.test(cabRc) && /Duración/.test(cabRc), cabRc);
    const etqVentana = await js(`const f = ${CAPA}.querySelector('.gd-modal-ruta .cx-frag'); return f ? f.textContent.trim() : null;`);
    comprobar('f) y en su ruta, la etiqueta «Fragmento · N s · Esquema»', etqVentana === 'Fragmento · ' + String(n0.f.segundos).replace('.', ',') + ' s · Esquema', etqVentana);
    await tecla('Escape', [], 300);
    comprobar('f) Esc cierra la ventana', await hasta(`const c = ${CAPA}; return !c || c.hidden;`, 2000));
    const tocado = await js(`return ${D}.nota('${n0.id}').html;`);
    comprobar('f) abrirla y cerrarla no toca la nota', tocado === n0.html, tocado);

    /* ---------- g) la etiqueta lleva al nodo ---------- */
    const uno = notas.find(n => n.f.nodos.length === 1 && n.f.nodos[0] === ids.encuentro) || notas.find(n => n.f.nodos.length === 1);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${uno.id}"] .cx-frag')`, { tras: 800 });
    comprobar('g) un clic en la etiqueta lleva al esquema con su nodo elegido', await hasta(`const s = Tramas.tablero.seleccion(); return !document.body.classList.contains('vista-documentos') && !!s && s.id === '${uno.f.nodos[0]}';`, 3000),
      await js(`return JSON.stringify({ sel: Tramas.tablero.seleccion(), body: document.body.className });`));
    comprobar('g) y la ventana de la nota no se quedó abierta', await js(`const c = ${CAPA}; return !c || c.hidden;`));

    /* ---------- h) borrar el nodo: el fragmento se queda huérfano ---------- */
    const deLaDespedida = notas.filter(n => JSON.stringify(n.f.nodos) === JSON.stringify([ids.despedida]));
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'borrar_nodo', nodo: 'La despedida' }] });
    comprobar('h) Claude borra el nodo «La despedida»', !r.error && deLaDespedida.length >= 1, r.texto + ' · fragmentos suyos: ' + deLaDespedida.length);
    await espera(400);
    const est = JSON.parse(await js(`const d = ${D}; return JSON.stringify(${JSON.stringify(deLaDespedida.map(n => n.id))}.map(id => d.estadoFragmento(id)).map(x => x && { h: x.huerfano, p: x.perdidos, n: x.nodos.length }));`));
    comprobar('h) sus fragmentos se quedan huérfanos (la nota sigue ahí)', est.length && est.every(x => x && x.h && x.p.length === 1 && x.n === 0), JSON.stringify(est));
    comprobar('h) los demás, no', await js(`const d = ${D}; return d.fragmentosDe('${ids.eid}').filter(n => !${JSON.stringify(deLaDespedida.map(n => n.id))}.includes(n.id)).every(n => !d.estadoFragmento(n).huerfano);`));
    await aClic(`document.querySelector('#conexionesEsq [data-cx-ir]')`, { tras: 700 });
    const huerf = deLaDespedida[0];
    await hasta(`return !!document.querySelector('#gdMain .gd-nota[data-nota="${huerf.id}"]');`, 3000);
    const th = await js(`const f = document.querySelector('#gdMain .gd-nota[data-nota="${huerf.id}"] .cx-frag'); return f ? f.className + ' | ' + f.getAttribute('title') : null;`);
    comprobar('h) su tarjeta lo enseña apagada y lo dice', /huerfano/.test(th || '') && /huérfano: sus nodos ya no están/.test(th || ''), th);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${huerf.id}"] .cx-frag')`, { tras: 900 });
    comprobar('h) un clic en la etiqueta huérfana avisa y lleva a su tramo del guion', /Sus nodos ya no están en el esquema/.test(await avisoTxt()) && await hasta(`return document.body.classList.contains('vista-texto');`, 3000), await avisoTxt());
    r = await M.llamar('leer_biblioteca', { biblioteca: 'Fragmentos' });
    comprobar('h) Claude lo lee sin errores', !r.error, r.texto);

    /* ---------- i) el historial de Claude lo revierte ---------- */
    const entrada = herr => js(`const h = (${D}.datos.historialClaude || []).slice().reverse(); const e = h.find(x => x.herramienta === ${JSON.stringify(herr)} && !x.revertido); return e ? e.id : null;`);
    const revertir = async hid => {
      await js(`const b = document.querySelector('.hc-entrada[data-hc="${hid}"] [data-hc-revertir]'); if (b) b.click(); await W(500); return true;`);
      const choque = await js(`const d = document.getElementById('dlg'); return d && d.open ? d.textContent : null;`);
      if (choque) await js(`document.getElementById('dlgOk').click(); await W(500); return true;`);
      return choque;
    };
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    menuClaude('Historial de cambios…').click();
    await hasta(`return !!document.querySelector('.hc-capa .hc-entrada');`);
    const hBorrar = await entrada('editar_esquema'), hNotas = await entrada('editar_biblioteca');
    comprobar('i) el historial lista el borrado y las notas de Claude', !!hBorrar && !!hNotas && await js(`return !!document.querySelector('.hc-entrada[data-hc="${hBorrar}"]') && !!document.querySelector('.hc-entrada[data-hc="${hNotas}"]');`));
    let choque = await revertir(hBorrar);
    comprobar('i) revertir el borrado devuelve el nodo, sin choques', !choque && await js(`return Tramas.tablero.modelo().datos.puntos.some(p => p.id === '${ids.despedida}' && p.titulo === 'La despedida');`), choque);
    comprobar('i) y el fragmento deja de ser huérfano', await js(`const x = ${D}.estadoFragmento('${huerf.id}'); return !!x && !x.huerfano && x.nodos.length === 1;`));
    choque = await revertir(hNotas);
    comprobar('i) revertir las notas de Claude las quita (y sus segmentos), sin choques', !choque && await js(`const d = ${D}; return d.fragmentosDe('${ids.eid}').length === 0 && d.etiquetasDe('${ids.sid}').length === 0;`), choque);
    comprobar('i) la conexión, que no fue de Claude, se queda', await js(`return ${D}.conectado('${ids.eid}', '${ids.sid}');`));
    await hasta(`return !!${accionAviso('Deshacer')};`, 2000);
    await js(`${accionAviso('Deshacer')}.click(); await W(400); return true;`);
    comprobar('i) «Deshacer» de lo revertido las devuelve, con su fragmento', await js(`const d = ${D}, ns = d.fragmentosDe('${ids.eid}'); return ns.length === ${notas.length} && ns.every(n => !d.estadoFragmento(n).huerfano);`));
    await js(`const b = document.querySelector('[data-hc-cerrar]'); if (b) b.click(); await W(200); return true;`);

    /* ---------- j) guardar y volver a abrir ---------- */
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 6000);
    await espera(600);
    const f = leerArchivo(RUTA).documentos, fe = f.contenedores[0].esquemas.find(x => x.id === ids.eid);
    const fn = f.notas.filter(n => n.fragmento && n.fragmento.eid === ids.eid);
    comprobar('j) el archivo guarda la conexión del esquema', fe && JSON.stringify(fe.bibliotecas) === JSON.stringify([ids.sid]), JSON.stringify(fe && fe.bibliotecas));
    comprobar('j) y los fragmentos, con sus nodos, segundos, puesto y bloques', fn.length === notas.length && fn.every(n => { const o = notas.find(x => x.id === n.id); return o && JSON.stringify(n.fragmento) === JSON.stringify(o.f); }), JSON.stringify(fn.map(n => n.fragmento)));
    await js(`await Claquedraw.app.cerrar(); await W(700); return true;`);
    await js(`await Claquedraw.app.abrirReciente(${JSON.stringify(RUTA)}); await W(1000); return true;`);
    await hasta(`return !!Claquedraw.app.abiertoId() && !!${D} && !!${D}.esquema('${ids.eid}');`, 6000);
    comprobar('j) vuelto a abrir, siguen la conexión y los fragmentos', await js(`const d = ${D}; return d.bibliotecasDe('${ids.eid}').map(x => x.sub.id).join() === '${ids.sid}' && d.fragmentosDe('${ids.eid}').length === ${notas.length}
      && d.fragmentosDe('${ids.eid}').every(n => !d.estadoFragmento(n).huerfano);`));
    await js(`Claquedraw.app.vista('esquema'); await W(400); return true;`);
    await js(`${G}.abrirEsquema ? ${G}.abrirEsquema('${ids.eid}') : null; await W(400); return true;`);
    comprobar('j) y la cabecera del esquema vuelve a llevar su chip', await hasta(`return [...document.querySelectorAll('#conexionesEsq .cx-chip')].map(c => c.textContent.trim()).join() === 'Fragmentos';`, 3000), JSON.stringify(await chipsEsq()));

    /* ---------- k) sin errores ---------- */
    comprobar('k) la página no soltó ningún error', !errores.length, errores.join(' | '));
    comprobar('k) el servidor MCP no soltó errores', !/Error|error:/.test(M.errores().replace(/servidor MCP listo[^\n]*/, '')), M.errores());
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
