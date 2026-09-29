/* Prueba del equipo de duendes del asistente (1.1.68) en la app de verdad, con el ratón y el teclado de verdad y **sin gastar**: un
   servidor falso compatible con OpenAI (http local, `CLAPCRAFT_IA_URL`) hace de maestro (en streaming, con herramientas) y de cada
   duende del equipo (los reconoce por su prompt de sistema). `electron pruebas/equipo-electron.js`.
   Comprueba: la cabecera nombra al duende maestro; de partida contesta solo el maestro (sin la herramienta del equipo) y al pasar a
   «Equipo» se elige el formateador; elegir un especial con el ratón y que se
   congele (su ficha cambia después y la conversación sigue con la de entonces, con «como al elegirlo»); el maestro llama a
   `trabajar_en_equipo`, el equipo hace sus llamadas con sus modelos (coordinador deepseek-v4-pro, lector y escritora flash), el paso del
   equipo sale con sus eventos y el enojo, `{{equipo:…}}` escribe el texto en el guion; «Ver trabajar» abre el taller (un solo marco)
   y le llegan los eventos; la mascota (el maestro siempre a la vista: saluda, sigue al asistente, dice cada respuesta y los duendes
   dicen sus eventos); el sonido apagado de partida, encendido y apagado (solo suena encendido, y no dos veces); una conversación
   nueva vuelve al formateador; «Duendes del asistente…» y Cmd+W; los duendes de una operación del lienzo van delante.
   Arranca electron/main.js tal cual con el almacenamiento en una carpeta temporal, los diálogos sustituidos, el portapapeles de
   mentira y el Llavero sustituido. No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-equipo-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.CAPTURAS_EQUIPO || null;          // una carpeta: ahí van unas capturas para mirarlas
const PUERTO = 47800 + (process.pid % 700);
process.env.CLAPCRAFT_IA_URL = 'http://127.0.0.1:' + PUERTO + '/v1';
delete process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO;
const CLAVE = 'sk-prueba-FALSA-' + Math.random().toString(36).slice(2, 10) + 'Q7w2';
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
let llaveroFalso = false;
try {
  const cifrar = s => Buffer.from([...Buffer.from(String(s), 'utf8')].map(b => b ^ 0x5a)).reverse();
  safeStorage.isEncryptionAvailable = () => true;
  safeStorage.encryptString = s => Buffer.concat([Buffer.from('FALSO1'), cifrar(s)]);
  safeStorage.decryptString = b => Buffer.from([...Buffer.from(b).subarray(6)].reverse().map(x => x ^ 0x5a)).toString('utf8');
  llaveroFalso = safeStorage.encryptString('a').length === 7;
} catch (_) {}
require('../electron/main.js');
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);
electron.shell.openExternal = async () => true;

/* ---------- el servidor falso ----------
   El maestro (con `stream`) sigue la cola `S.maestro`; el equipo (sin `stream`) contesta por su papel, que se reconoce en su prompt de
   sistema. El coordinador rechaza la primera versión de cada encargo (así hay enojo y otra ronda) y aprueba la segunda. */
const S = { maestro: [], peticiones: [], equipo: [], mesa: [], serie: 0, rechazos: 0, lentitud: 0 };
const ESCENA_1 = 'INT. ESTACIÓN - NOCHE\n\nMara baja del tren con la maleta.\n\nMARA\nPor fin en casa.';
const ESCENA_2 = 'INT. ESTACIÓN - NOCHE\n\nMara baja del tren con la maleta. Llueve.\n\nMARA\nPor fin en casa.';
const ESCENA_F = 'INT. ESTACIÓN - NOCHE\n\nMara baja del tren con la maleta. Llueve.\n\nMARA\n(en voz baja)\nPor fin en casa.';
function papelDe(b) {
  const sis = String(((b.messages || [])[0] || {}).content || '');
  if (/el lector del equipo de duendes/.test(sis)) return 'lector';
  if (/la escritora del equipo de duendes/.test(sis)) return 'escritor';
  if (/acaba de transformar el TEXTO ANTERIOR/.test(sis)) return 'coordinador-cambio';
  if (/el coordinador del equipo de duendes de ClapCraft: el que veta/.test(sis)) return 'coordinador';
  if (/un duende especial del equipo/.test(sis)) return /Tu trabajo ahora: TRANSFORMAR/.test(sis) ? 'transformar' : 'revisar';
  return 'otro';
}
function respuestaEquipo(b) {
  const p = papelDe(b), sis = String(((b.messages || [])[0] || {}).content || '');
  const nombre = (/Eres «([^»]+)»/.exec(sis) || [])[1] || '';
  S.equipo.push({ papel: p, modelo: b.model, stream: !!b.stream, nombre, sistema: sis });
  if (p === 'lector') return { texto: JSON.stringify({ hechos: [{ texto: 'Mara llega a la estación de noche', fuente: 'Esquema', cita: 'Mara llega a la estación' }], personajes: [{ nombre: 'Mara', rasgos: 'vuelve a casa', fuente: 'Esquema' }], lugares: [{ nombre: 'la estación', fuente: 'Esquema' }], reglas: [], falta: [], base: [] }) };
  if (p === 'escritor') {
    const correccion = (b.messages || []).some(m => m.role === 'assistant');
    return { texto: correccion ? ESCENA_2 : ESCENA_1 };
  }
  if (p === 'coordinador') {
    S.rechazos++;
    if (S.rechazos % 2 === 1) return { texto: JSON.stringify({ aprobado: false, problemas: [{ texto: 'Falta la lluvia que da el esquema: «Llueve».', motivo: 'falta', fuente: 'Esquema' }] }) };
    return { texto: JSON.stringify({ aprobado: true, problemas: [] }) };
  }
  if (p === 'coordinador-cambio') return { texto: JSON.stringify({ aprobado: true, problemas: [] }) };
  if (p === 'transformar') return { texto: ESCENA_F };
  if (p === 'revisar') return { texto: JSON.stringify({ aprobado: true, problemas: [] }) };
  return { texto: '(¿quién eres?)' };
}
function responder(req, res, b, r) {
  const usage = r.usage || { prompt_tokens: 800, completion_tokens: 150, total_tokens: 950 };
  const llamadas = (r.llamadas || []).map((c, i) => ({ id: 'call_' + (++S.serie) + '_' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
  const base = { id: 'chatcmpl-falso', object: 'chat.completion.chunk', created: 1, model: b.model || 'deepseek-v4-flash' };
  if (!b.stream) {
    const m = { role: 'assistant', content: r.texto || null }; if (llamadas.length) m.tool_calls = llamadas;
    const fin = () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: b.model, choices: [{ index: 0, message: m, finish_reason: llamadas.length ? 'tool_calls' : 'stop' }], usage })); };
    if (r.antes) setTimeout(fin, r.antes); else fin();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const trozos = [];
  const empezar = () => siguiente();
  (String(r.texto || '').match(/[\s\S]{1,12}/g) || []).forEach(p => trozos.push({ choices: [{ index: 0, delta: { content: p }, finish_reason: null }] }));
  llamadas.forEach((c, i) => {
    const a = c.function.arguments, mitad = Math.floor(a.length / 2);
    trozos.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.function.name, arguments: a.slice(0, mitad) } }] }, finish_reason: null }] });
    trozos.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: a.slice(mitad) } }] }, finish_reason: null }] });
  });
  trozos.push({ choices: [{ index: 0, delta: {}, finish_reason: llamadas.length ? 'tool_calls' : 'stop' }] });
  trozos.push({ choices: [], usage });
  let i = 0, cerrado = false;
  res.on('close', () => { if (!res.writableEnded) cerrado = true; });
  const siguiente = () => {
    if (cerrado) return;
    if (i >= trozos.length) { res.write('data: [DONE]\n\n'); res.end(); return; }
    res.write('data: ' + JSON.stringify(Object.assign({}, base, trozos[i++])) + '\n\n');
    setTimeout(siguiente, r.pausa || 10);
  };
  if (r.antes) setTimeout(empezar, r.antes); else empezar();
}
const servidor = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', d => { cuerpo += d; });
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
    S.peticiones.push({ url: req.url, auth: req.headers.authorization || '', cuerpo: b });
    if (/balance$/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ remain_balance: S.saldo == null ? 9.5 : S.saldo, used_balance: 0.5, success: true, unlimited_quota: true })); return; }
    /* §16: errores del servicio para las llamadas del maestro (402 sin saldo, 429 saturado) */
    if (b.stream && (S.fallos || []).length) { const f = S.fallos.shift(); res.writeHead(f.estado, Object.assign({ 'Content-Type': 'application/json' }, f.cabeceras || {})); res.end(JSON.stringify(f.cuerpo || { error: { message: 'error' } })); return; }
    const ultimo = (b.messages || []).slice(-1)[0] || {};
    if ((b.tools || []).some(t => t.function && t.function.name === 'decir_hora')) { responder(req, res, b, { llamadas: [{ name: 'decir_hora', args: {} }] }); return; }
    if (/Contesta solo con la palabra: listo/.test(ultimo.content || '')) { responder(req, res, b, { texto: 'listo' }); return; }
    const sis0 = String(((b.messages || [])[0] || {}).content || '');
    /* un personaje en la mesa (§15): contesta en su papel */
    if (/un personaje de «/.test(sis0)) {
      const nombre = (/Eres «([^»]+)»/.exec(sis0) || [])[1] || '?';
      S.pj = (S.pj || []).concat([{ nombre, modelo: b.model, temperatura: b.temperature, sistema: sis0, tools: (b.tools || []).length }]);
      responder(req, res, b, { texto: 'La lluvia me quita el faro, y eso no se perdona. ⟦tono:calmado⟧', pausa: 8 });
      return;
    }
    /* §17: el coordinador invitado a la mesa verifica lo dicho (con `S.verificaTexto`: lo que no se sostiene) */
    if (/te invitó a la mesa para VERIFICAR/.test(sis0)) {
      S.orden = (S.orden || []).concat(['VERIFICA']);
      S.verifica = (S.verifica || []).concat([{ modelo: b.model, temperatura: b.temperature, usuario: String(((b.messages || [])[1] || {}).content || ''), tools: (b.tools || []).map(t => t.function && t.function.name) }]);
      responder(req, res, b, { texto: S.verificaTexto || 'Todo lo dicho se sostiene.', pausa: 8 });
      return;
    }
    /* la mesa (§13): cada duende en su turno y el maestro que resume (por su prompt de sistema) */
    if (/un duende de la mesa de duendes/.test(sis0) || /moderas la mesa de duendes/.test(sis0)) {
      const nombre = (/Eres «([^»]+)»/.exec(sis0) || [])[1] || '?', resumen = /moderas la mesa/.test(sis0);
      const usuario = String(((b.messages || [])[1] || {}).content || '');
      S.mesa.push({ nombre, resumen, modelo: b.model, sistema: sis0, usuario, tools: (b.tools || []).map(t => t.function && t.function.name) });
      S.orden = (S.orden || []).concat([resumen ? 'RESUMEN' : nombre]);
      const n = S.mesa.filter(x => x.nombre === nombre).length;
      /* §14: con `S.furia`, contestan furiosos (la marca oculta de su tono) y se pelean */
      const texto = resumen ? 'Resumen: los dos están de acuerdo en que la lluvia sobra.' + (S.furia ? ' Discutieron fuerte.' : '')
        : S.furia ? '¡NO estoy de acuerdo! ¡Te equivocas por completo, ' + nombre + ' lo dice claro! ⟦tono:furioso⟧' : 'Soy ' + nombre + ' y digo mi opinión número ' + n + ' sobre la estación. ⟦tono:calmado⟧';
      responder(req, res, b, { texto, pausa: 8 });
      return;
    }
    /* el equipo (por su prompt de sistema; el transporte puede pedirlo con o sin streaming) */
    if (papelDe(b) !== 'otro') { const r = respuestaEquipo(b); r.antes = S.lentitud; responder(req, res, b, r); return; }
    let r = S.maestro.length ? S.maestro.shift() : { texto: '(el guion de la prueba se acabó)' };
    if (typeof r === 'function') r = r(b);
    responder(req, res, b, r || { texto: '' });
  });
});

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  const d = detalle === undefined ? '' : String(detalle).split(CLAVE).join('«la clave»');
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !d ? '' : '\n      ' + d.slice(0, 1500)));
}
/* la referencia que devolvió trabajar_en_equipo (en el último mensaje «tool» que la lleva) */
const refDe = b => { const m = [...(b.messages || [])].reverse().find(x => x.role === 'tool' && /\{\{equipo:[^}]+\}\}/.test(x.content || '')); const k = m && /\{\{equipo:([^}\s]+)\}\}/.exec(m.content); return k ? '{{equipo:' + k[1] + '}}' : null; };

servidor.listen(PUERTO, '127.0.0.1');
app.whenReady().then(async () => {
  let win = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button: 'left', clickCount: 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button: 'left', clickCount: 1, modifiers }); await espera(op.tras === undefined ? 250 : op.tras);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras);
  }
  async function centro(expr) {
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      let b = el.getBoundingClientRect();
      for (let i = 0; i < 20; i++) { await W(50); const c = el.getBoundingClientRect(); if (c.top === b.top && c.left === b.left) break; b = c; }
      return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const escribir = async t => { win.webContents.insertText(t); await espera(120); };
  const D = `Claquedraw.gestor.documentos()`;
  const A = `Claquedraw.asistente`;
  const menuItem = texto => { let x = null; const buscar = items => (items || []).forEach(i => { if (x) return; if (i.label === texto) x = i; else if (i.submenu) buscar(i.submenu.items); }); buscar(Menu.getApplicationMenu().items); return x; };
  const items = () => js(`return JSON.stringify(${A}._estado().items);`).then(JSON.parse);
  const hastaLibre = ms => hasta(`return !${A}.trabajando();`, ms || 20000);
  const chips = () => js(`return JSON.stringify([...document.querySelectorAll('#asistente [data-as-dn] .as-dn-chip')].map(c => c.textContent.trim()));`).then(JSON.parse);
  async function mandar(texto) {
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir(texto);
    await tecla('Enter', [], 200);
  }
  /* apunta las llamadas a `Duendes[fn]` de un marco (la mascota o el taller) sin cambiar lo que hace */
  const espiar = (sel, fn) => js(`const f = document.querySelector(${JSON.stringify(sel)}); if (!f) return false;
    for (let i = 0; i < 60 && !(f.contentWindow && f.contentWindow.Duendes && f.contentWindow.Duendes[${JSON.stringify(fn)}]); i++) await W(100);
    const Dn = f.contentWindow.Duendes; if (!Dn || typeof Dn[${JSON.stringify(fn)}] !== 'function') return false;
    const w = f.contentWindow; w.__espia = w.__espia || {}; if (w.__espia[${JSON.stringify(fn)}]) return true;
    const h = Dn[${JSON.stringify(fn)}]; w.__espia[${JSON.stringify(fn)}] = []; Dn[${JSON.stringify(fn)}] = function (op) { w.__espia[${JSON.stringify(fn)}].push(JSON.parse(JSON.stringify(op === undefined ? null : op, (k, v) => (k === 'duende' ? undefined : v)))); return h.apply(this, arguments); }; return true;`);
  const llamadas = (sel, fn) => js(`const f = document.querySelector(${JSON.stringify(sel)}); try { return JSON.stringify((f && f.contentWindow.__espia && f.contentWindow.__espia[${JSON.stringify(fn)}]) || []); } catch (_) { return '[]'; }`).then(JSON.parse);
  const MASCOTA = '#asistente .as-mascota iframe.as-mascota-marco', TALLER = '.as-taller iframe.as-taller-marco';
  const captura = async nombre => { if (!CAPTURAS) return; fs.mkdirSync(CAPTURAS, { recursive: true }); await win.webContents.capturePage().then(img => fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG())).catch(() => {}); };

  try {
    await new Promise(r => (servidor.listening ? r() : servidor.once('listening', r)));
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + String(msg).split(CLAVE).join('«la clave»')); } });
    win.webContents.setBackgroundThrottling(false);
    const webs = [];
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', (_e, u) => { webs.push(String(u)); return true; });
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.asistente && Claquedraw.equipo);`);
    console.log('\nClapCraft · el equipo de duendes del asistente en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);
    comprobar('están el equipo, su gestión y el asistente', await js(`return !!(Claquedraw.equipo.trabajar && Claquedraw.equipoUI && Claquedraw.asistenteMotor.herramientaEquipo);`));

    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Lluvia', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas[0];
      await Claquedraw.app.ejecutarEnVivo('editar_esquema', { esquema: e.id, operaciones: [{ op: 'crear_nodo', trama: e.datos.lineas[0].nombre, columna: 2, titulo: 'Mara llega a la estación', descripcion: 'De noche. Llueve.' }] }, { origen: 'Claude', avisar: false });
      return JSON.stringify({ cid: c.id, eid: e.id });`));
    const r0 = await js(`const r = await window.editorAPI.ia.guardarClave(${JSON.stringify(CLAVE)}); return JSON.stringify(r);`);
    comprobar('la clave (falsa) queda guardada', /"ok":true|true/.test(r0), r0);

    /* un especial más en el equipo: «La crítica», revisa y puede vetar */
    const creada = JSON.parse(await js(`const E = Claquedraw.equipo; const eq = await Claquedraw.equipoUI.leer();
      const r = E.crearEspecial(eq, { nombre: 'La crítica', personalidad: 'Exigente con el ritmo: corta lo que sobra.', rol: 'revisar', veto: true });
      if (!r.ok) return JSON.stringify({ error: r.error });
      await window.editorAPI.equipo.escribir(r.equipo); await Claquedraw.equipoUI.recargar(); await W(200);
      return JSON.stringify({ id: r.duende.id, n: E.especiales(Claquedraw.equipoUI.equipo()).length });`));
    comprobar('un especial nuevo en el equipo («La crítica»)', creada.id && creada.n === 2, JSON.stringify(creada));

    /* ---------- el panel: el duende maestro y el formateador de partida ---------- */
    /* de ClapBook: la mascota se monta la primera vez que se abre el panel (duendes.html pide sus fuentes a Google en cada carga) */
    comprobar('con el panel cerrado, la mascota aún no está montada (su marco no se carga al arrancar)', await js(`return !${A}.abierto() && !document.querySelector('#asistente iframe.as-mascota-marco');`));
    await aClic(`document.querySelector('#rows .row .track')`, { tras: 150 });
    await tecla('I', ['meta', 'shift'], 500);
    comprobar('Cmd+Shift+I abre el panel', await hasta(`return ${A}.abierto();`, 3000));
    comprobar('la cabecera nombra al duende maestro', await hasta(`const m = document.querySelector('#asistente [data-as-maestro]'); return !!m && /duende maestro/i.test(m.textContent);`, 3000),
      await js(`return (document.querySelector('#asistente .as-cab') || {}).textContent;`));
    comprobar('la mascota: un recuadro bajo la cabecera con un solo marco (el duende maestro)', await hasta(`const c = document.querySelector('#asistente .as-mascota'), f = c && c.querySelector('iframe.as-mascota-marco'); const r = c && c.getBoundingClientRect();
      return !!f && /mascota=1/.test(f.getAttribute('src')) && r.height >= 60 && r.height <= 130 && document.querySelectorAll('#asistente iframe').length === 1 && !document.querySelector('#asistente [data-as-trabajo] iframe');`, 4000));
    comprobar('la mascota tiene el motor con su API (mascota, decir, mascotaEstado)', await hasta(`const f = document.querySelector('${MASCOTA}'); const Dn = f && f.contentWindow && f.contentWindow.Duendes; return !!Dn && typeof Dn.decir === 'function' && typeof Dn.mascota === 'function' && typeof Dn.mascotaEstado === 'function';`, 8000));
    /* de ClapBook: el tema de la mascota sigue al de la app (antes solo se ponía al día al salir la franja del duende trabajando) */
    await espiar(MASCOTA, 'tema');
    const tema0 = await js(`return document.documentElement.dataset.theme || '';`), temaOtro = tema0 === 'dark' ? 'light' : 'dark';
    await js(`document.documentElement.dataset.theme = ${JSON.stringify(temaOtro)}; await W(300); return true;`);
    comprobar('cambiar el tema de la app con el panel abierto cambia el de la mascota', (await llamadas(MASCOTA, 'tema')).includes(temaOtro), JSON.stringify(await llamadas(MASCOTA, 'tema')));
    await js(`if (${JSON.stringify(tema0)}) document.documentElement.dataset.theme = ${JSON.stringify(tema0)}; else delete document.documentElement.dataset.theme; await W(200); return true;`);
    await espiar(MASCOTA, 'decir'); await espiar(MASCOTA, 'mascotaEstado');
    await aClic(`document.querySelector('#asistente .as-mascota')`, { tras: 400 });
    comprobar('un clic en la mascota la hace saludar', (await llamadas(MASCOTA, 'decir')).some(x => x && x.emo === 'saluda' && /Hola/.test(x.texto)), JSON.stringify(await llamadas(MASCOTA, 'decir')));
    comprobar('el sonido, apagado de partida', await js(`const b = document.querySelector('#asistente [data-as-sonido]'); return !!b && b.getAttribute('aria-pressed') === 'false' && !${A}.sonido();`));
    /* ---------- §13: de partida contesta solo el maestro ---------- */
    comprobar('de partida, «Maestro» (el control Maestro · Equipo · Mesa sobre el campo), sin duendes elegidos ni botón «Duendes»', await hasta(`const m = document.querySelector('#asistente [data-as-modos]'); return !!m && !m.hidden && m.querySelector('[data-as-modo="maestro"]').classList.contains('on') && !document.querySelector('#asistente [data-as-dn] .as-dn-chip') && document.querySelector('#asistente [data-as-dn-abrir]').hidden;`, 3000),
      JSON.stringify(await chips()));
    S.maestro.push({ texto: 'Te contesto yo solo, sin equipo.' });
    let antesM = S.peticiones.length;
    await mandar('¿Quién contesta?');
    await hastaLibre();
    let pm = S.peticiones.slice(antesM).filter(p => p.cuerpo && p.cuerpo.stream && Array.isArray(p.cuerpo.tools));
    comprobar('en «Maestro» no se le ofrece trabajar_en_equipo al modelo', pm.length === 1 && !pm[0].cuerpo.tools.some(t => t.function && t.function.name === 'trabajar_en_equipo'), pm.length + '');
    await aClic(`document.querySelector('#asistente [data-as-modo="equipo"]')`, { tras: 300 });
    comprobar('al pasar a «Equipo», se elige el formateador (un chip sobre el campo) y sale el botón «Duendes»', await hasta(`const c = [...document.querySelectorAll('#asistente [data-as-dn] .as-dn-chip')]; return c.length === 1 && /formateador/i.test(c[0].textContent) && !document.querySelector('#asistente [data-as-dn-abrir]').hidden;`, 3000),
      JSON.stringify(await chips()));

    /* ---------- elegir «La crítica» con el ratón ---------- */
    await aClic(`document.querySelector('#asistente [data-as-dn-abrir]')`, { tras: 300 });
    comprobar('«Duendes» abre la lista de los especiales, con el formateador marcado', await hasta(`const p = document.querySelector('#asistente .as-dn-pop'); return !!p && p.querySelectorAll('[data-as-dn-op]').length === 2 && p.querySelector('[data-as-dn-op="formateador"]').classList.contains('on');`, 2000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="${creada.id}"]')`, { tras: 300 });
    comprobar('marcar «La crítica» la añade detrás (2.º)', await hasta(`const b = document.querySelector('#asistente .as-dn-pop [data-as-dn-op="${creada.id}"]'); return b.classList.contains('on') && b.querySelector('small').textContent === '2';`, 2000));
    await tecla('Escape', [], 250);
    comprobar('Esc cierra la lista', await js(`return !document.querySelector('#asistente .as-dn-pop');`));
    let ch = await chips();
    comprobar('dos chips, en orden: el formateador y la crítica', ch.length === 2 && /formateador/i.test(ch[0]) && /crítica/i.test(ch[1]), JSON.stringify(ch));

    /* su ficha cambia después: esta conversación sigue con la de entonces */
    await js(`const E = Claquedraw.equipo; const eq = Claquedraw.equipoUI.equipo(); const r = E.editarDuende(eq, ${JSON.stringify(creada.id)}, { personalidad: 'Ahora es amable y lo aprueba todo.' });
      await window.editorAPI.equipo.escribir(r.equipo); await Claquedraw.equipoUI.recargar(); await W(300); return true;`);
    comprobar('su chip dice «como al elegirlo»', await hasta(`const c = [...document.querySelectorAll('#asistente [data-as-dn] .as-dn-chip')][1]; return !!c && /como al elegirlo/.test(c.textContent) && c.classList.contains('cambiado');`, 3000),
      JSON.stringify(await chips()));

    /* ---------- el maestro encarga al equipo y escribe con {{equipo:…}} ---------- */
    S.lentitud = 450;                                             // el equipo tarda: se ve trabajar
    S.maestro.push(
      { texto: 'Le pido la escena a mi equipo. ', llamadas: [{ name: 'trabajar_en_equipo', args: { instruccion: 'Escribe la escena de la llegada de Mara a la estación', fuentes: [ids.eid], formato: 'guion' } }] },
      b => { const ref = refDe(b); S.refVista = ref; return { llamadas: [{ name: 'escribir_documento', args: { esquema: ids.eid, contenido: ref || '(sin referencia)' } }] }; },
      { texto: 'Listo: mi equipo escribió la escena de la llegada de Mara y la puse en el guion.', pausa: 20 }
    );
    const antes = S.peticiones.length;
    await mandar('Escribe la escena de la llegada de Mara');
    comprobar('mientras el equipo trabaja, la franja dice quién hace qué (y «Ver trabajar» ya no va en ella: va en la mascota y en el paso)', await hasta(`const c = document.querySelector('#asistente [data-as-trabajo]'); return !c.hidden && /:/.test(c.querySelector('[data-as-trabajo-txt]').textContent) && !c.querySelector('[data-as-ver-taller]');`, 8000),
      await js(`return document.querySelector('#asistente [data-as-trabajo]').textContent;`));
    comprobar('el paso del equipo, en curso, con «Ver trabajar»', await hasta(`const p = document.querySelector('#asistente .as-paso-equipo.trabajando'); return !!p && !!p.querySelector('[data-as-ver-taller]') && /trabajando/i.test(p.textContent);`, 4000));
    comprobar('«Ver trabajar» también en la mascota, mientras trabaja el equipo', await js(`const b = document.querySelector('#asistente .as-mascota .as-mascota-ver'); return !!b && !b.hidden;`));
    comprobar('la mascota sigue al asistente: trabajando', await hasta(`return ${A}._equipo().estado === 'trabajando';`, 3000) && (await llamadas(MASCOTA, 'mascotaEstado')).includes('trabajando'), JSON.stringify(await llamadas(MASCOTA, 'mascotaEstado')));
    /* «Ver trabajar»: el taller */
    await aClic(`document.querySelector('#asistente .as-mascota [data-as-ver-taller]')`, { tras: 400 });
    comprobar('«Ver trabajar» abre el taller: una ventana flotante con la escena de los duendes', await hasta(`const t = document.querySelector('.as-taller'); const f = t && t.querySelector('iframe'); return !!t && !t.hidden && !!f && /taller=1/.test(f.getAttribute('src')) && t.getBoundingClientRect().width >= 320;`, 3000));
    comprobar('el taller carga la escena (Duendes.taller) y le llegan los eventos', await hasta(`const f = document.querySelector('${TALLER}'); const Dn = f && f.contentWindow && f.contentWindow.Duendes; if (!Dn || !Dn.tallerInfo) return false; const i = Dn.tallerInfo(); return (Array.isArray(i.eventos) ? i.eventos.length : +i.eventos) > 0;`, 10000),
      await js(`const f = document.querySelector('${TALLER}'); try { return JSON.stringify(f.contentWindow.Duendes.tallerInfo()).slice(0, 600); } catch (e) { return String(e); }`));
    await espiar(TALLER, 'hablar');
    await espera(1500); await captura('taller-trabajando');
    comprobar('y el maestro termina', await hastaLibre(40000));
    const pets = S.peticiones.slice(antes).filter(p => /chat\/completions/.test(p.url));
    const eqs = S.equipo.slice();
    const modelo = p => [...new Set(eqs.filter(x => x.papel === p).map(x => x.modelo))].join(',');
    comprobar('el equipo hizo sus llamadas: lector, escritora, coordinador y los especiales', eqs.length >= 6 && ['lector', 'escritor', 'coordinador', 'transformar', 'revisar'].every(p => eqs.some(x => x.papel === p)),
      JSON.stringify(eqs.map(x => x.papel + ':' + x.modelo)));
    comprobar('el coordinador con deepseek-v4-pro; el lector y la escritora con deepseek-v4-flash', modelo('coordinador') === 'deepseek-v4-pro' && modelo('lector') === 'deepseek-v4-flash' && modelo('escritor') === 'deepseek-v4-flash',
      JSON.stringify({ c: modelo('coordinador'), l: modelo('lector'), e: modelo('escritor') }));
    comprobar('los especiales con el suyo (deepseek-v4-pro de partida)', modelo('transformar') === 'deepseek-v4-pro' && modelo('revisar') === 'deepseek-v4-pro', JSON.stringify({ t: modelo('transformar'), r: modelo('revisar') }));
    const revisora = eqs.find(x => x.papel === 'revisar');
    comprobar('la crítica trabajó con la personalidad de cuando se eligió (congelada), no con la nueva', !!revisora && /Exigente con el ritmo/.test(revisora.sistema) && !/Ahora es amable/.test(revisora.sistema) && /no la cambies/.test(revisora.sistema),
      revisora && revisora.sistema.slice(0, 400));
    comprobar('el coordinador rechazó la primera versión: dos rondas de la escritora', eqs.filter(x => x.papel === 'escritor').length === 2, eqs.map(x => x.papel).join(' '));
    comprobar('en «Equipo», la herramienta trabajar_en_equipo se ofreció al maestro', pets.some(p => p.cuerpo.stream && (p.cuerpo.tools || []).some(t => t.function && t.function.name === 'trabajar_en_equipo')));
    comprobar('el maestro recibió la referencia {{equipo:…}} y la usó', !!S.refVista, S.refVista);
    comprobar('{{equipo:…}} escribió el texto del equipo (el del formateador) en el guion', await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return !!n && /Mara baja del tren con la maleta\\. Llueve\\./.test(n.html) && /en voz baja/.test(n.html) && !/equipo:/.test(n.html);`),
      await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.html.slice(0, 500) : 'sin documento';`));
    let its = await items();
    const paso = its.find(i => i.tipo === 'paso' && i.nombre === 'trabajar_en_equipo');
    comprobar('el paso del equipo guarda sus eventos, con el enojo del coordinador', !!paso && paso.equipo && paso.equipo.eventos.length >= 8 && paso.equipo.eventos.some(e => e.accion === 'enojo' && e.quien === 'coordinador'),
      JSON.stringify(paso && paso.equipo && paso.equipo.eventos.map(e => e.quien + ':' + e.accion)));
    comprobar('su cabecera: «El equipo trabajó (2 rondas · … corrección…)»', await js(`const p = document.querySelector('#asistente .as-paso-equipo'); return !!p && /El equipo trabajó \\(2 rondas · \\d+ correcci/.test(p.querySelector('.as-paso-tit').textContent);`),
      await js(`const p = document.querySelector('#asistente .as-paso-equipo'); return p ? p.textContent : 'sin paso';`));
    await aClic(`document.querySelector('#asistente .as-paso-equipo [data-as-paso-plegar]')`, { tras: 300 });
    comprobar('desplegado: una línea por evento con el chip del duende; el enojo en rojo', await js(`const p = document.querySelector('#asistente .as-paso-equipo'); const evs = p.querySelectorAll('.as-eq-ev'); const e = p.querySelector('.as-eq-ev.enojo');
      return evs.length >= 8 && !!e && getComputedStyle(e.querySelector('.as-eq-txt')).color !== getComputedStyle(p.querySelector('.as-eq-ev.leer .as-eq-txt, .as-eq-ev .as-eq-txt')).color && /coordinador/i.test(e.textContent) && !!p.querySelector('.as-eq-chip');`),
      await js(`const p = document.querySelector('#asistente .as-paso-equipo'); return p.innerText.slice(0, 600);`));
    await captura('paso-equipo');
    comprobar('lo que escriben los duendes no sale como respuesta del maestro en el chat', !its.some(i => i.tipo === 'ia' && /Mara baja del tren|"hechos"|"aprobado"/.test(i.texto || '')),
      JSON.stringify(its.filter(i => i.tipo === 'ia').map(i => i.texto.slice(0, 80))));
    comprobar('el gasto del equipo se suma al de la conversación', await js(`const e = ${A}._estado(); return e.coste.usd > 0.004;`), await js(`return JSON.stringify(${A}._estado().coste);`));
    let dm = await llamadas(MASCOTA, 'decir');
    comprobar('en la mascota, los duendes del equipo dicen sus eventos (el coordinador, enojado)', dm.some(x => x.quien === 'coordinador' && x.emo === 'enojado') && dm.some(x => x.quien === 'lector'), JSON.stringify(dm.map(x => x.quien + ':' + (x.emo || '') + ':' + x.sonido)));
    comprobar('al terminar, el maestro dice su respuesta en la mascota (globo y boca, sin sonido)', dm.some(x => x.quien === 'maestro' && /mi equipo escribió la escena/.test(x.texto) && x.sonido === false), JSON.stringify(dm.slice(-3)));
    comprobar('la mascota: contenta al terminar', (await llamadas(MASCOTA, 'mascotaEstado')).includes('contento'));
    comprobar('con el sonido apagado, nada suena (ni en el taller ni en la mascota)', !(await llamadas(TALLER, 'hablar')).length && dm.every(x => !x.sonido), JSON.stringify(dm.filter(x => x.sonido)));

    /* ---------- el sonido: encenderlo con el ratón; el maestro habla en el taller (abierto) ---------- */
    await aClic(`document.querySelector('#asistente [data-as-sonido]')`, { tras: 300 });
    comprobar('🔊 enciende el sonido (y se recuerda)', await js(`const b = document.querySelector('#asistente [data-as-sonido]'); return b.getAttribute('aria-pressed') === 'true' && ${A}.sonido() && JSON.parse(localStorage.getItem('guiones.claquedraw.asistente')).sonido === true;`));
    comprobar('el taller tiene el sonido encendido', await hasta(`const f = document.querySelector('${TALLER}'); return !!f.contentWindow.Duendes.tallerInfo().sonido;`, 2000));
    S.maestro.push({ texto: 'Hola, soy el duende maestro y te escucho con atención.' });
    await mandar('Hola');
    await hastaLibre();
    comprobar('al terminar la respuesta, con el taller abierto, el maestro habla allí, en su voz, con sus primeras palabras', await hasta(`const f = document.querySelector('${TALLER}'); return (f.contentWindow.__espia.hablar || []).length === 1;`, 2000) && /duende maestro/.test((await llamadas(TALLER, 'hablar'))[0].texto) && !!(await llamadas(TALLER, 'hablar'))[0].voz,
      JSON.stringify(await llamadas(TALLER, 'hablar')));
    dm = await llamadas(MASCOTA, 'decir');
    comprobar('y la mascota lo dice sin sonido (para que no suene dos veces)', /duende maestro/.test((dm[dm.length - 1] || {}).texto) && dm[dm.length - 1].sonido === false, JSON.stringify(dm.slice(-1)));
    /* Esc con el foco en el taller lo cierra; el mismo marco al volver a abrirlo */
    await js(`window.__marcoTaller = document.querySelector('${TALLER}'); return true;`);
    await aClic(`document.querySelector('.as-taller .as-taller-cab')`, { tras: 200 });
    await tecla('Escape', [], 300);
    comprobar('Esc cierra el taller', await js(`return document.querySelector('.as-taller').hidden;`));
    comprobar('y se recuerda cerrado', await js(`return JSON.parse(localStorage.getItem('guiones.claquedraw.asistente')).taller.abierto === false;`));
    S.maestro.push({ texto: 'Ahora hablo en la franja, sin el taller abierto.' });
    await mandar('¿Y ahora?');
    await hastaLibre();
    dm = await llamadas(MASCOTA, 'decir');
    comprobar('con el taller cerrado, suena la mascota (el maestro dice su respuesta con sonido)', /hablo en la franja|sin el taller/.test((dm[dm.length - 1] || {}).texto) && dm[dm.length - 1].sonido === true, JSON.stringify(dm.slice(-1)));
    comprobar('y el taller no', (await llamadas(TALLER, 'hablar')).length === 1);
    await aClic(`document.querySelector('#asistente [data-as-sonido]')`, { tras: 300 });
    comprobar('otro clic lo apaga (se deshace)', await js(`return !${A}.sonido() && document.querySelector('#asistente [data-as-sonido]').getAttribute('aria-pressed') === 'false';`));
    S.maestro.push({ texto: 'Esto ya no suena.' });
    await mandar('¿Suena?');
    await hastaLibre();
    await espera(300);
    dm = await llamadas(MASCOTA, 'decir');
    comprobar('apagado, la mascota lo dice sin sonido y el taller calla', /ya no suena/.test((dm[dm.length - 1] || {}).texto) && dm[dm.length - 1].sonido === false && (await llamadas(TALLER, 'hablar')).length === 1, JSON.stringify(dm.slice(-1)));

    /* ---------- el taller otra vez: el mismo marco ---------- */
    await js(`${A}.abrirTaller(); await W(300); return true;`);
    comprobar('reabierto, el taller usa el mismo marco (uno solo)', await js(`return document.querySelectorAll('.as-taller iframe').length === 1 && document.querySelector('${TALLER}') === window.__marcoTaller && document.querySelectorAll('.as-taller').length === 1;`));
    const cerrar = menuItem('Cerrar pestaña') || menuItem('Cerrar');
    if (cerrar) { cerrar.click(); await espera(300); }
    comprobar('Cmd+W (Cerrar pestaña) cierra el taller antes que nada', !!cerrar && await js(`return document.querySelector('.as-taller').hidden && !!Claquedraw.app.abiertoId();`));

    /* ---------- los especiales se guardan con la conversación (congelados) ---------- */
    await js(`await ${A}.recargar(); await W(400); return true;`);
    ch = await chips();
    comprobar('al recargar la conversación, vuelven sus especiales (con la personalidad de entonces)', ch.length === 2 && /crítica/i.test(ch[1]) && await js(`const x = ${A}.especialesActivos().find(s => /crítica/i.test(s.nombre)); return !!x && /Exigente/.test(x.personalidad);`), JSON.stringify(ch));

    comprobar('y el modo «Equipo» sigue en la conversación recargada', await js(`return document.querySelector('#asistente [data-as-modo="equipo"]').classList.contains('on');`));
    /* ---------- quitar el formateador; una conversación nueva vuelve al maestro solo ---------- */
    await aClic(`document.querySelector('#asistente [data-as-dn] [data-as-dn-quitar="formateador"]')`, { tras: 300 });
    ch = await chips();
    comprobar('la × quita un especial de la conversación', ch.length === 1 && /crítica/i.test(ch[0]), JSON.stringify(ch));
    await aClic(`document.querySelector('#asistente [data-as-nueva]')`, { tras: 400 });
    ch = await chips();
    comprobar('una conversación nueva vuelve a «Maestro», sin duendes elegidos', !ch.length && await js(`return document.querySelector('#asistente [data-as-modo="maestro"]').classList.contains('on');`), JSON.stringify(ch));

    /* ---------- «Duendes del asistente…» (menú Claude) y Cmd+W ---------- */
    const md = menuItem('Duendes del asistente…');
    comprobar('el menú Claude lleva «Duendes del asistente…»', !!md);
    if (md) {
      md.click();
      comprobar('abre la gestión de los duendes', await hasta(`return Claquedraw.equipoUI.abierto();`, 3000));
      const cp = menuItem('Cerrar pestaña');
      if (cp) { cp.click(); await espera(400); }
      comprobar('Cmd+W la cierra (y no el proyecto)', await js(`return !Claquedraw.equipoUI.abierto() && !!Claquedraw.app.abiertoId();`));
    }
    await aClic(`document.querySelector('#asistente [data-as-modo="equipo"]')`, { tras: 300 });
    await aClic(`document.querySelector('#asistente [data-as-dn-abrir]')`, { tras: 300 });
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-admin]')`, { tras: 400 });
    comprobar('«Administrar duendes…» de la lista también la abre', await hasta(`return Claquedraw.equipoUI.abierto();`, 3000));
    await js(`Claquedraw.equipoUI.cerrar(); await W(200); return true;`);

    /* ---------- §13: la mesa ---------- */
    await aClic(`document.querySelector('#asistente [data-as-modo="mesa"]')`, { tras: 500 });
    comprobar('«Mesa» abre la lista de quiénes se sientan: los especiales, los fijos y el maestro', await hasta(`const p = document.querySelector('#asistente .as-dn-pop'); return !!p && !!p.querySelector('[data-as-dn-op="lector"]') && !!p.querySelector('[data-as-dn-op="maestro"]') && !!p.querySelector('[data-as-dn-op="${creada.id}"]');`, 3000));
    comprobar('con rondas (2 de partida) y «El maestro resume» marcado', await js(`const p = document.querySelector('#asistente .as-dn-pop'); return p.querySelector('[data-as-mesa-rondas="2"]').classList.contains('on') && p.querySelector('[data-as-mesa-resumen]').checked;`));
    /* de ClapBook: `.gd-pop button` da `width: 100%` y el ✓ de `.on` a todo botón de un menú; solo se veía el «1» */
    comprobar('los tres botones de «Rondas» caben en el menú (y el elegido no lleva el ✓ de los menús)', await js(`const p = document.querySelector('#asistente .as-dn-pop'), r = p.getBoundingClientRect(), bs = [...p.querySelectorAll('[data-as-mesa-rondas]')];
      return bs.length === 3 && bs.every(b => { const x = b.getBoundingClientRect(); return x.width > 0 && x.width < 60 && x.left >= r.left && x.right <= r.right; }) && getComputedStyle(bs[1], '::after').content === 'none';`),
      await js(`const p = document.querySelector('#asistente .as-dn-pop'); return JSON.stringify([p.getBoundingClientRect()].concat([...p.querySelectorAll('[data-as-mesa-rondas]')].map(b => b.getBoundingClientRect())).map(x => [Math.round(x.left), Math.round(x.width)]));`));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="${creada.id}"]')`, { tras: 250 });
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="lector"]')`, { tras: 250 });
    await tecla('Escape', [], 250);
    ch = await chips();
    comprobar('dos a la mesa, en orden: la crítica y el lector', ch.length === 2 && /crítica/i.test(ch[0]) && /lector/i.test(ch[1]) && await js(`return /Mesa/.test(document.querySelector('#asistente [data-as-dn] .as-fx-rot').textContent);`), JSON.stringify(ch));
    const htmlAntes = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.html : '';`);
    const histAntes = await js(`return Claquedraw.historial.lista(${D}).length;`);
    let antesMesa = S.mesa.length;
    await mandar('¿Qué os parece la escena de la estación?');
    comprobar('la mesa termina', await hastaLibre(30000));
    let turnos = S.mesa.slice(antesMesa);
    comprobar('dos rondas por turnos, en el orden de los chips, y al final el maestro resume', turnos.map(t => t.resumen ? 'R' : /crítica/i.test(t.nombre) ? 'C' : /lector/i.test(t.nombre) ? 'L' : '?').join('') === 'CLCLR', JSON.stringify(turnos.map(t => t.nombre + (t.resumen ? '(resumen)' : ''))));
    comprobar('cada duende con su modelo (la crítica deepseek-v4-pro, el lector deepseek-v4-flash)', turnos.filter(t => /crítica/i.test(t.nombre)).every(t => t.modelo === 'deepseek-v4-pro') && turnos.filter(t => /lector/i.test(t.nombre)).every(t => t.modelo === 'deepseek-v4-flash'), JSON.stringify(turnos.map(t => t.nombre + ':' + t.modelo)));
    comprobar('la crítica, con su personalidad congelada (la de cuando se eligió en esta conversación)', turnos.filter(t => /crítica/i.test(t.nombre)).every(t => /Exigente con el ritmo|Ahora es amable/.test(t.sistema)));
    comprobar('cada uno ve lo que dijeron los anteriores', /Soy La crítica y digo mi opinión número 1/.test(turnos[1] && turnos[1].usuario) && /Soy El lector y digo mi opinión número 1/.test(turnos[2] && turnos[2].usuario), (turnos[2] || {}).usuario);
    comprobar('en la mesa solo se lee (ninguna herramienta que escriba)', turnos.every(t => t.tools.every(n => !/^(editar_|escribir_|completar_|revertir_|trabajar_en_equipo|recordar_|olvidar_)/.test(n))), JSON.stringify([...new Set(turnos.flatMap(t => t.tools))]));
    comprobar('en el chat, una burbuja por turno con el nombre y el color de cada duende (y la del resumen)', await js(`const b = [...document.querySelectorAll('#asistente .as-msg.as-mesa')].slice(-5); return b.length === 5 && /crítica/i.test(b[0].querySelector('.as-mesa-quien').textContent) && /lector/i.test(b[1].querySelector('.as-mesa-quien').textContent) && /resume/.test(b[4].textContent) && /Resumen: los dos/.test(b[4].textContent) && !!b[0].querySelector('.as-eq-chip');`),
      await js(`return [...document.querySelectorAll('#asistente .as-msg.as-mesa')].map(x => x.innerText.slice(0, 60)).join(' | ');`));
    await captura('mesa');
    dm = await llamadas(MASCOTA, 'decir');
    comprobar('en la mascota, cada duende de la mesa entra y dice lo suyo', dm.some(x => x.quien === creada.id && /opinión/.test(x.texto)) && dm.some(x => x.quien === 'lector' && /opinión/.test(x.texto)), JSON.stringify(dm.slice(-6).map(x => x.quien + ':' + x.texto.slice(0, 30))));
    comprobar('la mesa no escribe nada en el proyecto (ni el guion ni el historial)', await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return (n ? n.html : '') === ${JSON.stringify(htmlAntes)} && Claquedraw.historial.lista(${D}).length === ${histAntes};`));
    antesMesa = S.mesa.length;
    await mandar('@La crítica ¿y tú qué cambiarías?');
    await hastaLibre(20000);
    turnos = S.mesa.slice(antesMesa);
    comprobar('«@Nombre» al principio: solo contesta ese (y sin resumen)', turnos.length === 1 && /crítica/i.test(turnos[0].nombre) && !turnos[0].resumen, JSON.stringify(turnos.map(t => t.nombre)));
    /* ---------- §14: la pelea ---------- */
    comprobar('las marcas de tono no se ven en el chat', await js(`return !/⟦tono/.test(document.getElementById('asistente').innerText);`));
    const conPelea = await espiar(MASCOTA, 'pelea');
    S.furia = true;
    await mandar('Decidid de una vez: ¿llueve o no llueve?');
    await hastaLibre(30000);
    S.furia = false;
    let pl = await llamadas(MASCOTA, 'pelea');
    comprobar('furiosos los dos en la misma ronda: se pelean en la mascota (Duendes.pelea con los dos)', conPelea && pl.some(x => x && Array.isArray(x.entre) && x.entre.length === 2 && x.entre.some(e => e.id === creada.id) && x.entre.some(e => e.id === 'lector')), JSON.stringify(pl));
    comprobar('y la mascota lo sabe (mascotaInfo().pelea)', await js(`const f = document.querySelector('${MASCOTA}'); const i = f.contentWindow.Duendes.mascotaInfo ? f.contentWindow.Duendes.mascotaInfo() : {}; return !!i.pelea;`));
    comprobar('en el chat, la línea «💥 «La crítica» y «El lector» se pelean»', await js(`const l = [...document.querySelectorAll('#asistente .as-pelea')]; return l.length === 1 && /La crítica/.test(l[0].textContent) && /El lector/.test(l[0].textContent) && /se pelean/.test(l[0].textContent);`),
      await js(`return [...document.querySelectorAll('#asistente .as-pelea')].map(x => x.textContent).join(' | ');`));
    comprobar('sin las marcas de tono en las burbujas ni en lo que ven los demás', await js(`return !/⟦tono/.test(document.getElementById('asistente').innerText);`) && S.mesa.slice(-4).every(t => !/⟦tono/.test(t.usuario)), (S.mesa.slice(-2)[0] || {}).usuario);
    await captura('pelea');
    await js(`await ${A}.recargar(); await W(600); return true;`);
    await espiar(MASCOTA, 'pelea');
    pl = await llamadas(MASCOTA, 'pelea');
    comprobar('al recargar la conversación, la pelea vuelve', pl.length && pl[pl.length - 1] && Array.isArray(pl[pl.length - 1].entre) && pl[pl.length - 1].entre.length === 2, JSON.stringify(pl.slice(-2)));
    ch = await chips();
    comprobar('al recargar, la conversación sigue en «Mesa» con sus duendes y sus burbujas', await js(`return document.querySelector('#asistente [data-as-modo="mesa"]').classList.contains('on') && document.querySelectorAll('#asistente .as-msg.as-mesa').length >= 6;`) && ch.length === 2, JSON.stringify(ch));
    antesMesa = S.mesa.length;
    await mandar('Tranquilos. ¿Qué proponéis?');
    await hastaLibre(30000);
    pl = await llamadas(MASCOTA, 'pelea');
    comprobar('el siguiente mensaje de Leo para la pelea (Duendes.pelea(null))', pl.length && pl[pl.length - 1] === null && await hasta(`const f = document.querySelector('${MASCOTA}'); const i = f.contentWindow.Duendes.mascotaInfo ? f.contentWindow.Duendes.mascotaInfo() : {}; return !i.pelea || i.pelea.fase === 'fin';`, 4000), JSON.stringify(pl.slice(-2)));
    /* ---------- §17: el coordinador invitado a la mesa (Leo: «que se pueda invitar al coordinador a la mesa») ---------- */
    await aClic(`document.querySelector('#asistente [data-as-dn-abrir]')`, { tras: 400 });
    comprobar('§17 · en el menú de la mesa, la casilla «Invitar al coordinador (revisa lo que se dice)», sin marcar', await hasta(`const c = document.querySelector('#asistente .as-dn-pop [data-as-mesa-coord]'); return !!c && !c.checked && /Invitar al coordinador/.test(c.parentElement.textContent);`, 3000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-mesa-coord]')`, { tras: 300 });
    ch = await chips();
    comprobar('§17 · marcarla lo sienta a la mesa, al final (y en la lista sale elegido)', ch.length === 3 && /coordinador/i.test(ch[2]) && await js(`return document.querySelector('#asistente .as-dn-pop [data-as-dn-op="coordinador"]').classList.contains('on');`), JSON.stringify(ch));
    await tecla('Escape', [], 250);
    const decirAntes = (await llamadas(MASCOTA, 'decir')).length;
    S.orden = []; S.verifica = [];
    S.verificaTexto = '- «El lector» dijo que en la estación no llueve: el nodo dice «Llueve».';
    await mandar('¿Cómo empieza la escena?');
    comprobar('§17 · la mesa con el coordinador termina', await hastaLibre(30000));
    comprobar('§17 · el coordinador habla el último de cada ronda (y el maestro resume al final)', S.orden.join(',') === 'La crítica,El lector,VERIFICA,La crítica,El lector,VERIFICA,RESUMEN', JSON.stringify(S.orden));
    comprobar('§17 · verifica con deepseek-v4-pro y con lo que dijeron los demás en esa ronda', S.verifica.length === 2 && S.verifica.every(v => v.modelo === 'deepseek-v4-pro') && /opinión/.test(S.verifica[0].usuario), JSON.stringify(S.verifica.map(v => v.modelo)));
    const burbC = JSON.parse(await js(`return JSON.stringify([...document.querySelectorAll('#asistente .as-msg.as-mesa')].filter(b => /coordinador/i.test(b.querySelector('.as-mesa-quien').textContent)).slice(-2).map(b => ({ cls: b.className, rol: (b.querySelector('.as-mesa-revisa') || {}).textContent || '', rolCls: (b.querySelector('.as-mesa-revisa') || {}).className || '', color: getComputedStyle(b).borderLeftColor })));`));
    comprobar('§17 · sus burbujas llevan «revisa» y, con lo que no se sostiene, van en ámbar («revisa · 1»)', burbC.length === 2 && burbC.every(b => /revisa/.test(b.cls) && /con-problemas/.test(b.cls) && /revisa · 1/i.test(b.rol) && /con-problemas/.test(b.rolCls)), JSON.stringify(burbC));
    let dmC = (await llamadas(MASCOTA, 'decir')).slice(decirAntes);
    comprobar('§17 · en la mascota entra enojado a decir la primera corrección', dmC.some(x => x.quien === 'coordinador' && x.emo === 'enojado' && /El lector/.test(x.texto) && !/^-/.test(x.texto)), JSON.stringify(dmC.map(x => x.quien + ':' + x.emo + ':' + x.texto.slice(0, 40))));
    await captura('mesa-coordinador');
    const decirAntes2 = (await llamadas(MASCOTA, 'decir')).length;
    S.verificaTexto = 'Todo lo dicho se sostiene.';
    const nOrden = S.orden.length;
    await mandar('@El coordinador ¿se sostiene lo último?');
    await hastaLibre(20000);
    const ultC = JSON.parse(await js(`const b = [...document.querySelectorAll('#asistente .as-msg.as-mesa')].pop(); return JSON.stringify({ quien: b.querySelector('.as-mesa-quien').textContent, cls: b.className });`));
    comprobar('§17 · «@El coordinador»: solo él revisa lo último (una vez, sin resumen); sin problemas, «revisa» sin ámbar', /coordinador/i.test(ultC.quien) && /revisa/.test(ultC.cls) && !/con-problemas/.test(ultC.cls) && S.orden.slice(nOrden).join(',') === 'VERIFICA', JSON.stringify({ ultC, orden: S.orden.slice(nOrden) }));
    dmC = (await llamadas(MASCOTA, 'decir')).slice(decirAntes2);
    comprobar('§17 · y sin problemas no entra enojado', !dmC.some(x => x.quien === 'coordinador' && x.emo === 'enojado'), JSON.stringify(dmC.map(x => x.quien + ':' + x.emo)));
    await js(`await ${A}.recargar(); await W(600); return true;`);
    comprobar('§17 · al recargar, sus burbujas siguen marcadas', await js(`return [...document.querySelectorAll('#asistente .as-msg.as-mesa.revisa')].length >= 3 && document.querySelectorAll('#asistente .as-msg.as-mesa.revisa.con-problemas').length >= 2;`));
    await aClic(`document.querySelector('#asistente [data-as-dn-abrir]')`, { tras: 400 });
    comprobar('§17 · con él en la mesa, la casilla sale marcada', await hasta(`const c = document.querySelector('#asistente .as-dn-pop [data-as-mesa-coord]'); return !!c && c.checked;`, 3000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-mesa-coord]')`, { tras: 300 });
    await tecla('Escape', [], 250);
    ch = await chips();
    comprobar('§17 · desmarcarla lo levanta de la mesa', ch.length === 2 && !ch.some(x => /coordinador/i.test(x)), JSON.stringify(ch));
    /* ---------- §15: un personaje en la mesa (una entrevista) ---------- */
    const pj = JSON.parse(await js(`const d = ${D}; let p = d.elenco().find(x => x.nombre.toLowerCase() === 'mara');
      if (!p) { const r = d.crearPersonaje('Mara'); p = r.personaje; }
      const s = d.bibliotecaPersonaje(p.id, p.nombre), e = d.etiquetasDe(s.id).find(x => /hoja/i.test(x.nombre));
      const n = d.crearNota(s.id, e ? e.id : null, 'Quién es').nota;
      d.guardarNota(n.id, { html: '<p>Mara es farera, odia la lluvia y habla con refranes.</p>', title: 'Quién es' });
      Claquedraw.biblioteca.marcar(Claquedraw.app.abiertoId()); return JSON.stringify({ id: p.id });`));
    await aClic(`document.querySelector('#asistente [data-as-nueva]')`, { tras: 400 });
    await aClic(`document.querySelector('#asistente [data-as-modo="mesa"]')`, { tras: 500 });
    comprobar('la lista de la mesa ofrece los personajes del proyecto en su sección', await hasta(`const p = document.querySelector('#asistente .as-dn-pop'); return !!p && !!p.querySelector('[data-as-dn-op="pj:${pj.id}"]') && /Personajes/.test(p.textContent);`, 3000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="pj:${pj.id}"]')`, { tras: 300 });
    await tecla('Escape', [], 250);
    ch = await chips();
    comprobar('su chip con su nombre y su modelo de partida (v4-flash)', ch.length === 1 && /Mara/.test(ch[0]) && /v4-flash/.test(ch[0]), JSON.stringify(ch));
    S.pj = [];
    let antesPj = S.mesa.length;
    await mandar('Mara, ¿por qué odias la lluvia?');
    await hastaLibre(20000);
    comprobar('con un personaje basta: contesta él, en una ronda y sin resumen', (S.pj || []).length === 1 && S.mesa.length === antesPj, JSON.stringify((S.pj || []).map(x => x.nombre)));
    const pj0 = (S.pj || [])[0] || {};
    comprobar('en su sistema van su hoja y lo que el proyecto dice de él (y no hay herramientas)', /farera/.test(pj0.sistema || '') && /Por fin en casa/.test(pj0.sistema || '') && !pj0.tools, (pj0.sistema || '').slice(0, 900));
    comprobar('con su modelo (deepseek-v4-flash) y su temperatura (0,8)', pj0.modelo === 'deepseek-v4-flash' && Math.abs(pj0.temperatura - 0.8) < 1e-6, JSON.stringify({ m: pj0.modelo, t: pj0.temperatura }));
    comprobar('su burbuja lleva su nombre', await js(`const b = [...document.querySelectorAll('#asistente .as-msg.as-mesa')].pop(); return !!b && /Mara/.test(b.querySelector('.as-mesa-quien').textContent) && /faro/.test(b.textContent);`));
    dm = await llamadas(MASCOTA, 'decir');
    comprobar('y en la mascota entra y lo dice', dm.some(x => x.quien === 'pj:' + pj.id && /faro/.test(x.texto)), JSON.stringify(dm.slice(-2)));
    await aClic(`document.querySelector('#asistente [data-as-pj-menu="pj:${pj.id}"]')`, { tras: 300 });
    comprobar('un clic en su chip abre el menú de su modelo y su temperatura', await hasta(`const p = document.querySelector('#asistente .as-pj-pop'); return !!p && !!p.querySelector('[data-as-pj-modelo="deepseek-v4-pro"]') && !!p.querySelector('[data-as-pj-temp]');`, 2000));
    await aClic(`document.querySelector('#asistente .as-pj-pop [data-as-pj-modelo="deepseek-v4-pro"]')`, { tras: 300 });
    ch = await chips();
    comprobar('elegir deepseek-v4-pro lo cambia en su chip', /v4-pro/.test(ch[0] || ''), JSON.stringify(ch));
    await mandar('@Mara ¿y el faro?');
    await hastaLibre(20000);
    comprobar('y contesta con ese modelo (también con @Mara)', (S.pj || []).length === 2 && S.pj[1].modelo === 'deepseek-v4-pro', JSON.stringify((S.pj || []).map(x => x.modelo)));
    await aClic(`document.querySelector('#asistente [data-as-dn] [data-as-dn-quitar="pj:${pj.id}"]')`, { tras: 300 });
    await aClic(`document.querySelector('#asistente [data-as-dn-abrir]')`, { tras: 300 });
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="pj:${pj.id}"]')`, { tras: 300 });
    await tecla('Escape', [], 250);
    ch = await chips();
    comprobar('su modelo se recuerda: al volver a llamarlo sale con v4-pro', ch.length === 1 && /v4-pro/.test(ch[0]), JSON.stringify(ch));
    await aClic(`document.querySelector('#asistente [data-as-nueva]')`, { tras: 400 });
    comprobar('una conversación nueva, otra vez «Maestro»', await js(`return document.querySelector('#asistente [data-as-modo="maestro"]').classList.contains('on') && !document.querySelector('#asistente [data-as-dn] .as-dn-chip');`));

    /* ---------- §16: las escenas de los estados ---------- */
    const estados = async () => (await llamadas(MASCOTA, 'mascotaEstado'));
    S.fallos = [{ estado: 402, cuerpo: { error: { message: 'Insufficient balance', type: 'insufficient_quota' } } }];
    await mandar('¿Seguimos?');
    await hastaLibre(15000);
    comprobar('sin saldo (402): la mascota se pone en huelga', await hasta(`return ${A}._equipo().escena === 'huelga';`, 3000) && (await estados()).includes('huelga'), JSON.stringify({ e: await js(`return ${A}._equipo().escena;`), est: (await estados()).slice(-4) }));
    /* de ClapBook: con el error, la mascota pasaba a «error» y la huelga se perdía al momento */
    comprobar('y la mascota se queda en la huelga (el error no la tapa)', await js(`return ${A}._equipo().estado === 'huelga';`) && (await estados()).slice(-1)[0] === 'huelga', JSON.stringify({ e: await js(`return ${A}._equipo().estado;`), est: (await estados()).slice(-4) }));
    comprobar('y la línea del error en el chat, como siempre', await js(`const e = [...document.querySelectorAll('#asistente .as-error')].pop(); return !!e && /saldo/i.test(e.textContent);`));
    comprobar('con la huelga, «Recargar saldo» en la mascota', await js(`const b = document.querySelector('#asistente .as-mascota .as-mascota-recargar'); return !!b && !b.hidden;`));
    await aClic(`document.querySelector('#asistente .as-mascota .as-mascota-recargar')`, { tras: 300 });
    comprobar('que abre las recargas de APIMart', webs.some(u => /apimart\.ai\/billing/.test(u)), webs.join(' '));
    await js(`${A}.abrirTaller(); await W(500); return true;`);
    comprobar('el taller, abierto, también está en huelga (Duendes.escena)', await hasta(`const f = document.querySelector('${TALLER}'); const i = f.contentWindow.Duendes.tallerInfo(); return JSON.stringify(i).includes('huelga');`, 3000));
    await js(`${A}.cerrarTaller(); return true;`);
    S.maestro.push({ texto: 'Ya volví.' });
    await mandar('¿Y ahora?');
    await hastaLibre(15000);
    comprobar('la siguiente respuesta buena levanta la huelga', await hasta(`return ${A}._equipo().escena === null;`, 3000) && await js(`return document.querySelector('#asistente .as-mascota .as-mascota-recargar').hidden;`));
    S.fallos = [0, 1, 2].map(() => ({ estado: 429, cabeceras: { 'Retry-After': '0' }, cuerpo: { error: { message: 'Too many requests' } } }));
    await mandar('Otra vez');
    await hastaLibre(15000);
    comprobar('429 (el servicio pide esperar): «saturado»', await hasta(`return ${A}._equipo().escena === 'saturado';`, 3000) && (await estados()).includes('saturado'), await js(`return ${A}._equipo().escena;`));
    S.fallos = [];
    S.saldo = 0;
    await aClic(`document.querySelector('#asistente [data-as-saldo]')`, { tras: 800 });
    comprobar('con el saldo de APIMart a 0, la huelga sale sola (sin ningún error)', await hasta(`return ${A}._equipo().escena === 'huelga' && ${A}._equipo().huelgaSaldo;`, 3000), await js(`return JSON.stringify(${A}._equipo());`));
    S.saldo = 5;
    await aClic(`document.querySelector('#asistente [data-as-saldo]')`, { tras: 800 });
    comprobar('y se levanta al volver el saldo', await hasta(`return ${A}._equipo().escena === null && !${A}._equipo().huelgaSaldo;`, 3000), await js(`return JSON.stringify(${A}._equipo());`));

    /* ---------- §11: los duendes de una operación del lienzo van delante de los de la conversación ---------- */
    const lz = JSON.parse(await js(`Claquedraw.app.ejecutarEnVivo('editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: ${JSON.stringify(ids.cid)}, nombre: 'Con duendes' }] }, { origen: 'Claude', avisar: false });
      const l = (${D}.datos.contenedores[0].lienzos || []).find(y => y.nombre === 'Con duendes');
      Claquedraw.app.ejecutarEnVivo('editar_lienzo', { lienzo: l.id, operaciones: [{ op: 'crear_nodo', tipo: 'texto', texto: 'Mara vuelve a casa.', ref: 't', x: 0, y: 0 },
        { op: 'crear_nodo', tipo: 'reescribir', titulo: 'Más corto', instruccion: 'Más corto', ref: 'g', x: 420, y: 0 }, { op: 'conectar', de: '$t', a: '$g' }] }, { origen: 'Claude', avisar: false });
      const l2 = ${D}.lienzo(l.id).lienzo, g = l2.nodos.find(n => n.tipo !== 'texto');
      const E = Claquedraw.equipo, eq = Claquedraw.equipoUI.equipo(), cr = E.especiales(eq).find(x => x.nombre === 'La crítica');
      g.datos = Object.assign({}, g.datos, { duendes: [E.instantanea(cr)] });
      return JSON.stringify({ lid: l.id, gid: g.id, cr: cr.id });`));
    const orden = JSON.parse(await js(`${A}.activarEspeciales([Claquedraw.equipo.instantanea(Claquedraw.equipo.especiales(Claquedraw.equipoUI.equipo()).find(x => x.nombre === 'La crítica'))]); const E = Claquedraw.equipo, t0 = E.trabajar; let visto = null;
      E.trabajar = async op => { visto = (op.especiales || []).map(s => s.id); return { ok: true, texto: 'X', formato: 'prosa', informe: { rondas: 1, problemas: [] }, gasto: { coste: 0 } }; };
      try { await ${A}.ejecutarEquipo({ instruccion: 'Más corto', fuentes: [{ lienzo: ${JSON.stringify(lz.lid)}, nodo: ${JSON.stringify(lz.gid)} }] }, {}); } finally { E.trabajar = t0; }
      return JSON.stringify(visto);`));
    comprobar('los duendes de la operación del lienzo van delante (sin repetir) de los de la conversación', Array.isArray(orden) && orden[0] === lz.cr && new Set(orden).size === orden.length, JSON.stringify(orden));

    comprobar('todas las llamadas llevaron la clave solo en la cabecera', S.peticiones.filter(p => /chat/.test(p.url)).every(p => p.auth === 'Bearer ' + CLAVE && !JSON.stringify(p.cuerpo).includes(CLAVE)));
    comprobar('la página no soltó errores', !errores.length, errores.join('\n'));
  } catch (e) {
    comprobar('la prueba no se rompió', false, e && e.stack);
  }
  const mal = resultados.filter(r => !r.ok);
  console.log('\n' + (mal.length ? mal.length + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron'));
  servidor.close();
  borrarDespues(TMP);
  app.exit(mal.length ? 1 : 0);
});
