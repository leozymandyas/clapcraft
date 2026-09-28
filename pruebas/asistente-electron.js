/* Prueba del asistente con otra IA (1.1.59) en la app de verdad, con el ratón y el teclado de verdad y **sin gastar**: un servidor
   falso compatible con OpenAI (http local, `CLAPCRAFT_IA_URL`) contesta con un guion —texto en streaming, llamadas a herramientas
   que leen un esquema, crean un nodo y escriben el guion, un 402 (sin saldo), una respuesta larga que se detiene a mitad y la
   ejecución de un nodo de un lienzo—. `electron pruebas/asistente-electron.js` (o `npm run test:asistente`).
   Arranca electron/main.js tal cual con el almacenamiento en una carpeta temporal, los diálogos sustituidos, el portapapeles de
   mentira (el de verdad es el de Leo) y el Llavero sustituido por un cifrado de mentira (así no pide permiso al sistema): configura
   una clave falsa por el diálogo y comprueba que no aparece en la página, en el localStorage, en el .clapcraft ni en ia.json.
   No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-asistente-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.CAPTURAS_ASISTENTE || path.join(TMP, 'capturas');   // 1.1.67: las del duende trabajando
fs.mkdirSync(CAPTURAS, { recursive: true });
const PUERTO = 47100 + (process.pid % 700);
process.env.CLAPCRAFT_IA_URL = 'http://127.0.0.1:' + PUERTO + '/v1';
delete process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO;               // la clave, la del diálogo (nunca la de verdad)
const CLAVE = 'sk-prueba-FALSA-' + Math.random().toString(36).slice(2, 10) + 'Z9q7';
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
/* el Llavero, de mentira: la clave no queda en claro en ia.json y no se le pide nada al sistema */
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
/* nada de abrir el navegador del sistema desde una prueba (el canal lo registra electron/ia.js al arrancar: se sustituye después) */
const webs = [];
/* ni lo que abre `setWindowOpenHandler` (main.js): se apunta (1.1.61, el clic central de un enlace de una respuesta) */
const externos = [];
electron.shell.openExternal = async u => { externos.push(String(u)); return true; };

/* ---------- el servidor falso compatible con OpenAI ---------- */
const S = { cola: [], peticiones: [], cortadas: 0 };
function responder(req, res, b, r) {
  if (r.estado) { res.writeHead(r.estado, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.cuerpo || { error: { message: 'error' } })); return; }
  const usage = r.usage || { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 };
  const llamadas = (r.llamadas || []).map((c, i) => ({ id: 'call_' + (++S.serie) + '_' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
  const base = { id: 'chatcmpl-falso', object: 'chat.completion.chunk', created: 1, model: b.model || 'deepseek-v4-flash' };
  if (!b.stream) {
    const m = { role: 'assistant', content: r.texto || null }; if (llamadas.length) m.tool_calls = llamadas;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: b.model, choices: [{ index: 0, message: m, finish_reason: llamadas.length ? 'tool_calls' : 'stop' }], usage }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  let cerrado = false;
  res.on('close', () => { if (!res.writableEnded) { cerrado = true; S.cortadas++; } });
  const trozos = [];
  /* 1.1.67: un razonamiento (`reasoning_content`, como DeepSeek) en trozos de `r.trozo` letras, antes del texto */
  const rz = new RegExp('[\\s\\S]{1,' + (r.trozo || 10) + '}', 'g');
  (String(r.razon || '').match(rz) || []).forEach(p => trozos.push({ choices: [{ index: 0, delta: { reasoning_content: p }, finish_reason: null }] }));
  (String(r.texto || '').match(/[\s\S]{1,10}/g) || []).forEach(p => trozos.push({ choices: [{ index: 0, delta: { content: p }, finish_reason: null }] }));
  llamadas.forEach((c, i) => {
    const a = c.function.arguments, mitad = Math.floor(a.length / 2);   // los argumentos llegan troceados, como en DeepSeek
    trozos.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.function.name, arguments: a.slice(0, mitad) } }] }, finish_reason: null }] });
    trozos.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: a.slice(mitad) } }] }, finish_reason: null }] });
  });
  trozos.push({ choices: [{ index: 0, delta: {}, finish_reason: llamadas.length ? 'tool_calls' : 'stop' }] });
  trozos.push({ choices: [], usage });
  let i = 0;
  const siguiente = () => {
    if (cerrado) return;
    if (i >= trozos.length) { res.write('data: [DONE]\n\n'); res.end(); return; }
    res.write('data: ' + JSON.stringify(Object.assign({}, base, trozos[i++])) + '\n\n');
    setTimeout(siguiente, r.pausa || 12);
  };
  if (r.antes) setTimeout(siguiente, r.antes); else siguiente();   // `antes`: lo que tarda en llegar el primer trozo
}
S.serie = 0;
const servidor = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', d => { cuerpo += d; });
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
    S.peticiones.push({ url: req.url, auth: req.headers.authorization || '', cuerpo: b });
    /* el saldo de APIMart (1.1.60): la forma real (medida el 27-09-2026): el de la cuenta en /user/balance y el de la clave en /balance */
    if (/\/user\/balance$/.test(req.url)) { S.saldos = (S.saldos || 0) + 1; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(S.saldo || { remain_balance: 9.91, remain_credits: 99.1, success: true, used_balance: 0.09, used_credits: 0.9 })); return; }
    if (/\/v1\/balance$/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ remain_balance: -1, used_balance: 0, unlimited_quota: true, success: true })); return; }
    /* el modelo de visión (1.1.60): una imagen en `image_url`, sin stream; no gasta del guion de la prueba */
    const conImagen = (b.messages || []).some(m => Array.isArray(m.content) && m.content.some(c => c && c.type === 'image_url'));
    if (conImagen) { S.visiones = (S.visiones || []).concat([b]); responder(req, res, b, { texto: 'Un cuadrado de colores sobre fondo blanco. TEXTO: «BOCETO 1».', usage: { prompt_tokens: 650, completion_tokens: 60 } }); return; }
    const ultimo = (b.messages || []).slice(-1)[0] || {};
    let r;
    /* «Probar conexión»: la llamada mínima y la de la herramienta de prueba */
    if ((b.tools || []).some(t => t.function && t.function.name === 'decir_hora')) r = { llamadas: [{ name: 'decir_hora', args: { zona: 'Europe/Madrid' } }], usage: { prompt_tokens: 60, completion_tokens: 10 } };
    else if (/Contesta solo con la palabra: listo/.test(ultimo.content || '')) r = { texto: 'listo', usage: { prompt_tokens: 12, completion_tokens: 2 } };
    else r = S.cola.length ? S.cola.shift() : { texto: '(el guion de la prueba se acabó)' };
    if (typeof r === 'function') r = r(b);
    responder(req, res, b, r || { texto: '' });
  });
});

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  const d = detalle === undefined ? '' : String(detalle).split(CLAVE).join('«la clave»');   // nunca se imprime la clave
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !d ? '' : '\n      ' + d.slice(0, 1200)));
}

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
    const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: 1, modifiers }); await espera(op.tras === undefined ? 250 : op.tras);
  }
  /* un arrastre con el botón apretado (elegir texto con el ratón) */
  async function arrastrar(a, b, pasos) {
    pasos = pasos || 10;
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= pasos; i++) { ev({ type: 'mouseMove', x: R(a.x + (b.x - a.x) * i / pasos), y: R(a.y + (b.y - a.y) * i / pasos), modifiers: ['leftButtonDown'] }); await espera(30); }
    ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1 }); await espera(250);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras);
  }
  async function centro(expr) {
    /* espera a que su sitio se quede quieto: el panel sigue desplazándose solo (suave) cuando aparece algo nuevo, y un clic medido
       a mitad caía donde ya no estaba el botón (la tarjeta de permiso, de vez en cuando) */
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      let b = el.getBoundingClientRect();
      for (let i = 0; i < 20; i++) { await W(50); const c = el.getBoundingClientRect(); if (c.top === b.top && c.left === b.left) break; b = c; }
      return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const escribir = async t => { win.webContents.insertText(t); await espera(120); };
  const D = `Claquedraw.gestor.documentos()`;
  const A = `Claquedraw.asistente`;
  const menu = (grupo, texto) => Menu.getApplicationMenu().items.find(i => i.label === grupo).submenu.items.find(i => i.label === texto);
  const panelTxt = () => js(`return document.getElementById('asistente').innerText;`);
  const items = () => js(`return JSON.stringify(${A}._estado().items);`).then(JSON.parse);
  const trabajando = () => js(`return ${A}.trabajando();`);
  const hastaLibre = ms => hasta(`return !${A}.trabajando();`, ms || 15000);
  /* un mensaje escrito en el campo del panel, con el teclado, y Enter */
  async function mandar(texto) {
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir(texto);
    await tecla('Enter', [], 200);
  }
  /* la clave no está en la página, en el localStorage, en el .clapcraft ni en ia.json (se busca entera y su principio) */
  async function sinClave(donde) {
    const pagina = await js(`let t = document.documentElement.outerHTML; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k + (localStorage.getItem(k) || ''); } return t;`);
    const marco = await js(`const f = document.getElementById('editorMarco'); try { return f && f.contentDocument ? f.contentDocument.documentElement.outerHTML : ''; } catch (_) { return ''; }`);
    const cabo = CLAVE.slice(0, 20);
    comprobar('la clave no está en la página ni en el localStorage (' + donde + ')', !pagina.includes(CLAVE) && !pagina.includes(cabo) && !marco.includes(cabo));
  }

  try {
    await new Promise(r => (servidor.listening ? r() : servidor.once('listening', r)));
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + String(msg).split(CLAVE).join('«la clave»')); } });
    win.webContents.setBackgroundThrottling(false);
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', (_e, u) => { webs.push(String(u)); return true; });
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.asistente);`);
    console.log('\nClapCraft · el asistente con otra IA en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);
    comprobar('el menú Claude lleva «Asistente con otra IA…», «Configurar IA…» y «Tutorial de la IA…»', !!menu('Claude', 'Asistente con otra IA…') && !!menu('Claude', 'Configurar IA…') && !!menu('Claude', 'Tutorial de la IA…'));

    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Lluvia', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas[0];
      return JSON.stringify({ cid: c.id, eid: e.id, trama: e.datos.lineas[0].nombre, ruta: Claquedraw.app.archivo().ruta });`));
    comprobar('un proyecto con su esquema y su archivo', ids.eid && ids.ruta && fs.existsSync(ids.ruta), JSON.stringify(ids));

    /* ---------- configurar: Claude › Configurar IA…, la clave con el teclado, Probar conexión ---------- */
    menu('Claude', 'Configurar IA…').click();
    comprobar('Configurar IA… abre su diálogo', await hasta(`const d = document.getElementById('dlgIA'); return !!d && d.open && !!d.querySelector('[data-ia-clave]');`, 4000));
    await aClic(`document.querySelector('#dlgIA [data-ia-clave]')`, { tras: 150 });
    await escribir(CLAVE);
    await aClic(`document.querySelector('#dlgIA [data-ia-guardar-clave]')`, { tras: 600 });
    comprobar('la clave queda guardada: solo se ven sus cuatro últimos caracteres', await hasta(`const d = document.getElementById('dlgIA'); return !!d.querySelector('.as-clave-hay') && d.querySelector('.as-clave-hay').textContent.includes('••••${CLAVE.slice(-4)}');`, 4000),
      await js(`return document.getElementById('dlgIA').innerText;`));
    const iaJson = fs.readFileSync(path.join(DATOS, 'ia.json'), 'utf8');
    comprobar('ia.json la guarda cifrada (no en claro), con su servicio', !iaJson.includes(CLAVE) && !iaJson.includes(CLAVE.slice(0, 20)) && /"api\.apimart\.ai"/.test(iaJson));
    const cfgPagina = await js(`return JSON.stringify(await window.editorAPI.ia.config());`);
    comprobar('la página no la recibe: config() dice que la hay y su final', !cfgPagina.includes(CLAVE) && /"hayClave":true/.test(cfgPagina) && cfgPagina.includes(CLAVE.slice(-4)));
    const antesProbar = S.peticiones.length;
    await aClic(`document.querySelector('#dlgIA [data-ia-probar]')`, { tras: 300 });
    comprobar('«Probar conexión» dice que funciona y que admite herramientas', await hasta(`const r = document.querySelector('#dlgIA [data-ia-res]'); return !!r && /Funciona/.test(r.textContent) && /herramientas/.test(r.textContent);`, 8000),
      await js(`return (document.querySelector('#dlgIA [data-ia-res]') || {}).textContent;`));
    const probadas = S.peticiones.slice(antesProbar);
    comprobar('y llama al servidor con la clave en la cabecera, sin más (dos al chat y, 1.1.60, las del saldo)', probadas.filter(p => /chat\/completions/.test(p.url)).length === 2 && probadas.every(p => /chat\/completions|balance/.test(p.url)) && probadas.every(p => p.auth === 'Bearer ' + CLAVE), probadas.map(p => p.url).join(', '));
    await aClic(`[...document.querySelectorAll('#dlgIA [data-ia-cerrar]')].pop()`, { tras: 300 });
    comprobar('«Listo» cierra el diálogo', await js(`return !document.getElementById('dlgIA').open;`));
    await sinClave('tras configurar');

    /* ---------- abrir el asistente con Cmd+Shift+I ---------- */
    await aClic(`document.querySelector('#rows .row .track')`, { tras: 150 });   // el foco en la página, fuera de un campo
    await tecla('I', ['meta', 'shift'], 400);
    comprobar('Cmd+Shift+I abre el panel del asistente', await hasta(`return ${A}.abierto() && document.getElementById('asistente').offsetWidth > 200;`, 3000));
    comprobar('sin el tutorial (ya hay clave)', await js(`return !document.getElementById('dlgTutorialIA').open;`));
    comprobar('el botón de la franja está encendido', await js(`const b = document.getElementById('asistenteBtn'); return !!b && b.classList.contains('on');`));

    /* ---------- un mensaje: lee el esquema, crea un nodo, escribe el guion; el texto llega en streaming ---------- */
    const TITULO = 'Mara llega a la estación';
    S.cola.push(
      { texto: 'Voy a mirar el esquema. ', llamadas: [{ name: 'leer_esquema', args: { esquema: ids.eid } }] },
      { llamadas: [{ name: 'editar_esquema', args: { esquema: ids.eid, operaciones: [{ op: 'crear_nodo', trama: ids.trama, columna: 2, titulo: TITULO }] } }] },
      { llamadas: [{ name: 'escribir_documento', args: { esquema: ids.eid, contenido: 'INT. ESTACIÓN - NOCHE\n\nMara baja del tren. Llueve.' } }] },
      { texto: 'Listo: creé el nodo «' + TITULO + '» en la columna 2 y escribí la primera escena del guion. Si quieres, sigo con la siguiente escena, con más detalle, con el diálogo y con la llegada a casa de su madre.', pausa: 90, usage: { prompt_tokens: 42000, completion_tokens: 900 } }
    );
    const antesMsg = S.peticiones.length;
    await mandar('Lee el esquema, crea un nodo con la llegada de Mara y escribe la primera escena');
    comprobar('el mensaje sale en el panel y se pone a trabajar', await hasta(`return ${A}._estado().items.some(i => i.tipo === 'yo' && /llegada de Mara/.test(i.texto)) && ${A}.trabajando();`, 3000));
    comprobar('el nodo se ve en el tablero mientras aún contesta (al momento)', await hasta(`return ${A}.trabajando() && [...document.querySelectorAll('#board .pt')].some(p => p.textContent.includes(${JSON.stringify(TITULO)}));`, 8000));
    comprobar('el texto llega a trozos (streaming)', await hasta(`const t = document.getElementById('asistente').innerText; return ${A}.trabajando() && /Listo: creé/.test(t) && !/llegada a casa de su madre/.test(t);`, 8000));
    comprobar('y termina', await hastaLibre());
    let txt = await panelTxt();
    comprobar('el texto entero queda en el panel', /llegada a casa de su madre/.test(txt), txt.slice(-400));
    let its = await items();
    const pasos = its.filter(i => i.tipo === 'paso');
    comprobar('tres pasos visibles: leyó, cambió y escribió', pasos.length === 3 && pasos.every(p => p.estado === 'hecho') && /Ley/.test(pasos[0].titulo || '') , JSON.stringify(pasos.map(p => [p.nombre, p.estado, p.titulo])));
    comprobar('los que cambian algo llevan «Deshacer» y «Ver»', await js(`return [...document.querySelectorAll('#asistente .as-paso.escribe')].length === 2 && [...document.querySelectorAll('#asistente .as-paso.escribe')].every(p => p.querySelector('[data-as-deshacer]') && p.querySelector('[data-as-ver]'));`));
    const pets = S.peticiones.slice(antesMsg);
    comprobar('cuatro llamadas al modelo, con las herramientas de Claude y el prompt de ClapCraft', pets.length === 4 && pets[0].cuerpo.tools.some(t => t.function.name === 'editar_esquema') && /ClapCraft/.test(pets[0].cuerpo.messages[0].content) && pets[0].cuerpo.stream === true,
      pets.length + ' · ' + (pets[0] ? (pets[0].cuerpo.tools || []).length : 0));
    comprobar('el prompt dice lo que hay en pantalla y el proyecto', /Esquema montado/.test(pets[0].cuerpo.messages[0].content) && /Lluvia/.test(pets[0].cuerpo.messages[0].content));
    const tool1 = (pets[1].cuerpo.messages || []).find(m => m.role === 'tool');
    comprobar('el resultado de leer_esquema vuelve como mensaje «tool»', !!tool1 && tool1.content.includes('ESQUEMA «') && tool1.content.includes(ids.eid) && !!tool1.tool_call_id, JSON.stringify(tool1).slice(0, 300));
    const modelo = JSON.parse(await js(`const r = ${D}.esquema(${JSON.stringify(ids.eid)}); return JSON.stringify(r.esquema.datos.puntos.map(p => p.titulo));`));
    comprobar('el nodo está en el esquema', modelo.includes(TITULO), JSON.stringify(modelo));
    comprobar('y el guion escrito', await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return !!n && /Mara baja del tren/.test(n.html);`));
    const hist = JSON.parse(await js(`return JSON.stringify(Claquedraw.historial.lista(${D}).map(e => ({ id: e.id, origen: e.origen, herramienta: e.herramienta, modo: e.modo })));`));
    comprobar('los dos cambios quedan en el historial de Claude con su origen (DeepSeek)', hist.length === 2 && hist.every(e => /DeepSeek/.test(e.origen || '') && e.modo === 'vivo'), JSON.stringify(hist));
    comprobar('con el panel abierto no salen avisos de cada cambio', !/DeepSeek/.test(await js(`return document.getElementById('aviso').textContent;`)));
    const coste = JSON.parse(await js(`return JSON.stringify(${A}._estado().coste);`));
    comprobar('el coste de la conversación (tokens × precio) en la cabecera', coste.usd > 0.01 && coste.usd < 0.05 && /\$|USD/.test(await js(`return document.querySelector('#asistente [data-as-coste]').textContent;`)),
      JSON.stringify(coste) + ' · ' + await js(`return document.querySelector('#asistente [data-as-coste]').textContent;`));

    /* ---------- Deshacer del paso que creó el nodo ---------- */
    await aClic(`[...document.querySelectorAll('#asistente .as-paso.escribe')].find(p => p.querySelector('[data-as-deshacer]') && /esquema/i.test(p.textContent) && !/documento/i.test(p.textContent)).querySelector('[data-as-deshacer]')`, { tras: 700 });
    comprobar('«Deshacer» del paso quita el nodo del esquema y del tablero', await hasta(`const r = ${D}.esquema(${JSON.stringify(ids.eid)}); return !r.esquema.datos.puntos.some(p => p.titulo === ${JSON.stringify(TITULO)}) && ![...document.querySelectorAll('#board .pt')].some(p => p.textContent.includes(${JSON.stringify(TITULO)}));`, 4000));
    comprobar('el guion se queda (solo se deshizo ese paso)', await js(`return /Mara baja del tren/.test(${D}.documentoEsquema(${JSON.stringify(ids.eid)}).html);`));
    comprobar('el paso dice «Deshecho» y la entrada del historial, revertida', await js(`return !!document.querySelector('#asistente .as-paso.deshecho') && Claquedraw.historial.lista(${D}).some(e => e.revertido && e.herramienta === 'editar_esquema');`));

    /* ---------- «Ver» del paso del guion: la comparación ---------- */
    await aClic(`[...document.querySelectorAll('#asistente .as-paso.escribe')].find(p => p.querySelector('[data-as-ver]') && !p.classList.contains('deshecho')).querySelector('[data-as-ver]')`, { tras: 600 });
    comprobar('«Ver» abre la comparación de cómo estaba y cómo está', await hasta(`return !!document.querySelector('.vs-capa') && /Antes de Claude/.test(document.querySelector('.vs-capa').textContent);`, 3000));
    await tecla('Escape', [], 400);
    comprobar('Esc la cierra', await hasta(`return !document.querySelector('.vs-capa');`, 2000));

    /* ---------- el historial de cambios, con su origen ---------- */
    menu('Claude', 'Historial de cambios…').click();
    comprobar('el historial de Claude enseña los cambios del asistente con su origen', await hasta(`const c = document.querySelector('.hc-capa'); return !!c && /DeepSeek/.test(c.textContent);`, 3000),
      await js(`return (document.querySelector('.hc-capa') || {}).textContent;`));
    await tecla('Escape', [], 400);
    await hasta(`return !document.querySelector('.hc-capa');`, 2000);

    /* ---------- las teclas del panel no llegan al tablero: Supr con un nodo elegido ---------- */
    const nodoSel = JSON.parse(await js(`const r = await Claquedraw.app.ejecutarEnVivo('editar_esquema', { esquema: ${JSON.stringify(ids.eid)}, operaciones: [{ op: 'crear_nodo', trama: ${JSON.stringify(ids.trama)}, columna: 4, titulo: 'Nodo elegido' }] }, { origen: 'Claude', avisar: false });
      await W(300); const p = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.find(x => x.titulo === 'Nodo elegido'); return JSON.stringify(p ? p.id : null);`));
    const pt = await centro(`[...document.querySelectorAll('#board .pt')].find(p => p.textContent.includes('Nodo elegido')).querySelector('.dot')`);
    if (pt) await clic(pt, { tras: 300 });
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir('abc');
    await tecla('Backspace', [], 120); await tecla('Delete', [], 120); await tecla('Escape', [], 200);
    comprobar('Retroceso, Supr y Esc en el campo no borran el nodo elegido del tablero', await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.some(p => p.id === ${JSON.stringify(nodoSel)});`) && !await js(`return !!document.querySelector('#dlg[open]');`));
    await js(`const c = document.querySelector('#asistente [data-as-campo]'); c.value = ''; c.dispatchEvent(new Event('input')); return true;`);

    /* ---------- sin saldo (402): el error en español ---------- */
    S.cola.push({ estado: 402, cuerpo: { error: { message: 'Insufficient balance', type: 'insufficient_quota' } } });
    await mandar('Resume el primer acto');
    await hastaLibre();
    its = await items();
    txt = await panelTxt();
    comprobar('un 402 dice en español que no queda saldo, y cómo arreglarlo', its.some(i => i.tipo === 'error') && /saldo/i.test(txt) && /APIMart/.test(txt), txt.slice(-500));
    comprobar('con «Reintentar» y «Abrir APIMart»', await js(`const e = [...document.querySelectorAll('#asistente .as-error')].pop(); return !!e && !!e.querySelector('[data-as-reintentar]') && !!e.querySelector('[data-as-web="panel"]');`));
    await aClic(`[...document.querySelectorAll('#asistente .as-error')].pop().querySelector('[data-as-web="panel"]')`, { tras: 300 });
    comprobar('«Abrir APIMart» va al navegador del sistema (apimart.ai)', webs.some(u => /^https:\/\/apimart\.ai\//.test(u)), webs.join(' '));

    /* ---------- Detener a mitad ---------- */
    S.cola.push({ texto: 'Esta respuesta es larguísima y va muy despacio: '.repeat(40), pausa: 120 });
    const cortadasAntes = S.cortadas;
    await mandar('Escríbeme algo largo');
    comprobar('mientras trabaja sale «Detener»', await hasta(`const b = document.querySelector('#asistente [data-as-detener]'); return ${A}.trabajando() && !!b && !b.hidden && /larguísima/.test(document.getElementById('asistente').innerText);`, 5000));
    await aClic(`document.querySelector('#asistente [data-as-detener]')`, { tras: 500 });
    comprobar('«Detener» lo para', await hastaLibre(3000));
    comprobar('y corta la petición en el servidor', await (async () => { for (let i = 0; i < 30; i++) { if (S.cortadas > cortadasAntes) return true; await espera(100); } return false; })());
    txt = await panelTxt();
    comprobar('el panel dice que se detuvo', /Detenido/.test(txt), txt.slice(-300));

    /* ---------- 1.1.67: el razonamiento se deja leer mientras llega, y el duende trabajando ---------- */
    const RAZON = Array.from({ length: 110 }, (_, i) => 'Paso ' + (i + 1) + ' del razonamiento: pienso en Mara, en la lluvia y en la estación.\n').join('');
    S.cola.push({ antes: 2600, razon: RAZON, trozo: 40, pausa: 70, texto: 'Ya lo pensé: la escena empieza con la lluvia.' });
    await js(`window.__primerYo = document.querySelector('#asistente .as-cuerpo .as-yo'); return true;`);
    await mandar('Piensa despacio en la escena de la estación');
    comprobar('1.1.67 · antes de que salga el duende, los tres puntos', await hasta(`return ${A}.trabajando() && !!document.querySelector('#asistente .as-pensando') && document.querySelector('#asistente [data-as-trabajo]').hidden;`, 1200));
    comprobar('1.1.67 · si tarda, sale el duende trabajando con «Pensando…» (y los puntos se van)', await hasta(`const c = document.querySelector('#asistente [data-as-trabajo]'); return !c.hidden && /Pensando/.test(c.textContent) && !!c.querySelector('iframe.as-duende-marco') && !document.querySelector('#asistente .as-pensando');`, 2600));
    const marco = JSON.parse(await js(`const f = document.querySelector('#asistente iframe.as-duende-marco'); window.__marcoDuende = f;
      for (let i = 0; i < 40 && !(f.contentWindow && f.contentWindow.Duendes); i++) await W(100);
      try { f.contentWindow.__marca = 1; } catch (_) {}
      const r = f.getBoundingClientRect(), fondo = getComputedStyle(f.contentDocument.body).backgroundColor, htmlF = getComputedStyle(f.contentDocument.documentElement).backgroundColor;
      return JSON.stringify({ n: document.querySelectorAll('#asistente iframe').length, w: r.width, h: r.height, src: f.getAttribute('src'), motor: !!f.contentWindow.Duendes, fondo, htmlF, dentro: !!f.closest('.as-cuerpo') });`));
    comprobar('1.1.67 · un solo marco, pequeño (64–96 px), fuera de la conversación, con el motor del teatro en modo trabajo', marco.n === 1 && marco.w >= 64 && marco.w <= 96 && marco.h >= 64 && marco.h <= 96 && !marco.dentro && marco.motor && /retrato=1/.test(marco.src) && /trabajo=1/.test(marco.src), JSON.stringify(marco));
    comprobar('1.1.67 · el marco del duende, con fondo transparente', /rgba\(0, 0, 0, 0\)|transparent/.test(marco.fondo) && /rgba\(0, 0, 0, 0\)|transparent/.test(marco.htmlF), JSON.stringify(marco));
    await espera(300);
    await win.webContents.capturePage().then(img => fs.writeFileSync(path.join(CAPTURAS, 'duende-pensando.png'), img.toPNG())).catch(() => {});
    comprobar('1.1.67 · llega el razonamiento: abierto y el duende se va (tras un momento)', await hasta(`const d = [...document.querySelectorAll('#asistente .as-razon')].pop(); return !!d && d.open && document.querySelector('#asistente [data-as-trabajo]').hidden;`, 4000));
    comprobar('1.1.67 · el razonamiento pasa de su alto y la caja lo sigue al final', await hasta(`const d = [...document.querySelectorAll('#asistente .as-razon > div')].pop(); return !!d && d.scrollHeight > d.clientHeight + 120 && d.scrollHeight - d.scrollTop - d.clientHeight < 8;`, 6000),
      await js(`const d = [...document.querySelectorAll('#asistente .as-razon > div')].pop(); return d ? [d.scrollHeight, d.scrollTop, d.clientHeight].join(' ') : 'sin razonamiento';`));
    await js(`window.__cajaRazon = [...document.querySelectorAll('#asistente .as-razon > div')].pop(); return true;`);
    /* la rueda de verdad sobre la caja del razonamiento: hacia arriba (deltaY positivo, en Electron) */
    const pr = JSON.parse(await js(`const r = window.__cajaRazon.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`));
    ev({ type: 'mouseMove', x: R(pr.x), y: R(pr.y) }); await espera(40);
    ev({ type: 'mouseWheel', x: R(pr.x), y: R(pr.y), deltaX: 0, deltaY: 50, canScroll: true });
    await espera(450);                                               // el desplazamiento suave de Chromium, hasta el final
    const subio = JSON.parse(await js(`const d = window.__cajaRazon; return JSON.stringify({ top: d.scrollTop, max: d.scrollHeight - d.clientHeight, igual: d === [...document.querySelectorAll('#asistente .as-razon > div')].pop(), vivo: ${A}.trabajando() });`));
    comprobar('1.1.67 · la rueda sube en el razonamiento mientras llega', subio.igual && subio.vivo && subio.top > 20 && subio.top < subio.max - 60, JSON.stringify(subio));
    await espera(700);                                               // ≥ 15 repintados
    const quieto = JSON.parse(await js(`const d = window.__cajaRazon; return JSON.stringify({ top: d.scrollTop, max: d.scrollHeight - d.clientHeight, igual: d === [...document.querySelectorAll('#asistente .as-razon > div')].pop(), mismoYo: window.__primerYo === document.querySelector('#asistente .as-cuerpo .as-yo') });`));
    comprobar('1.1.67 · y se queda donde lo dejó Leo (la misma caja, sin volver arriba ni abajo) mientras siguen llegando trozos', quieto.igual && Math.abs(quieto.top - subio.top) < 2 && quieto.max > subio.max, JSON.stringify({ subio, quieto }));
    comprobar('1.1.67 · lo de antes de la conversación no se rehace (el mismo nodo)', quieto.mismoYo);
    for (let i = 0; i < 12; i++) {
      const q = JSON.parse(await js(`const r = window.__cajaRazon.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`));
      ev({ type: 'mouseWheel', x: R(q.x), y: R(q.y), deltaX: 0, deltaY: -120, canScroll: true }); await espera(40);
    }
    await espera(500);
    comprobar('1.1.67 · bajando hasta el final, vuelve a seguir lo que llega', await js(`const d = window.__cajaRazon; return ${A}.trabajando() ? d.scrollHeight - d.scrollTop - d.clientHeight < 8 : true;`),
      await js(`const d = window.__cajaRazon; return [d.scrollHeight, d.scrollTop, d.clientHeight, ${A}.trabajando()].join(' ');`));
    /* la conversación: la rueda hacia arriba fuera del razonamiento la suelta del final, y no se la arrastra abajo */
    const cuerpoAntes = JSON.parse(await js(`const c = document.querySelector('#asistente .as-cuerpo'); return JSON.stringify({ top: c.scrollTop, max: c.scrollHeight - c.clientHeight });`));
    if (cuerpoAntes.max > 40) {
      const pc = JSON.parse(await js(`const c = document.querySelector('#asistente .as-cuerpo'), r = c.getBoundingClientRect(); return JSON.stringify({ x: r.left + 40, y: r.top + 30 });`));
      ev({ type: 'mouseWheel', x: R(pc.x), y: R(pc.y), deltaX: 0, deltaY: 60, canScroll: true });
      await espera(450);
      const c1 = JSON.parse(await js(`const c = document.querySelector('#asistente .as-cuerpo'); return JSON.stringify({ top: c.scrollTop, vivo: ${A}.trabajando() });`));
      await espera(600);
      const c2 = JSON.parse(await js(`const c = document.querySelector('#asistente .as-cuerpo'); return JSON.stringify({ top: c.scrollTop });`));
      comprobar('1.1.67 · la conversación sube con la rueda y no salta abajo con cada trozo', c1.vivo && c1.top < cuerpoAntes.top - 20 && c1.top > 0 && Math.abs(c2.top - c1.top) < 2, JSON.stringify({ cuerpoAntes, c1, c2 }));
      /* y bajando hasta el final se vuelve a enganchar */
      for (let i = 0; i < 8; i++) { ev({ type: 'mouseWheel', x: R(pc.x), y: R(pc.y), deltaX: 0, deltaY: -120, canScroll: true }); await espera(40); }
      await espera(700);
      comprobar('1.1.67 · y bajando al final, la conversación vuelve a seguir lo que llega', await js(`const c = document.querySelector('#asistente .as-cuerpo'); return !${A}.trabajando() || c.scrollHeight - c.scrollTop - c.clientHeight < 6;`),
        await js(`const c = document.querySelector('#asistente .as-cuerpo'); return [c.scrollHeight, c.scrollTop, c.clientHeight].join(' ');`));
    } else comprobar('1.1.67 · (la conversación aún no se desplaza: sin comprobar la rueda en ella)', true);
    /* cerrarlo a mano: se queda cerrado aunque siga llegando */
    if (await trabajando()) {
      await aClic(`[...document.querySelectorAll('#asistente .as-razon > summary')].pop()`, { tras: 500 });
      comprobar('1.1.67 · cerrado a mano, el razonamiento se queda cerrado mientras llega', await js(`const d = [...document.querySelectorAll('#asistente .as-razon')].pop(); return !d.open;`));
      await aClic(`[...document.querySelectorAll('#asistente .as-razon > summary')].pop()`, { tras: 300 });
    }
    comprobar('1.1.67 · termina', await hastaLibre(20000));
    comprobar('1.1.67 · abierto a mano, sigue abierto cuando llega la respuesta', await js(`const d = [...document.querySelectorAll('#asistente .as-razon')].pop(); return !!d && d.open && /empieza con la lluvia/.test(d.parentNode.textContent);`));
    comprobar('1.1.67 · al acabar no hay duende', await js(`return document.querySelector('#asistente [data-as-trabajo]').hidden;`));

    /* un paso lento: el duende dice qué hace, con palabras (no el nombre de la herramienta) */
    S.cola.push({ llamadas: [{ name: 'leer_esquema', args: { esquema: ids.eid } }], pausa: 2200 }, { texto: 'Leído.' });
    await mandar('Mira el esquema');
    comprobar('1.1.67 · con un paso en curso, el duende dice lo que hace («Leyendo el esquema…»)', await hasta(`const c = document.querySelector('#asistente [data-as-trabajo]'); return !c.hidden && /Leyendo el esquema…/.test(c.textContent) && !/leer_esquema/.test(c.textContent);`, 3000),
      await js(`return document.querySelector('#asistente [data-as-trabajo]').textContent;`));
    await espera(200);
    await win.webContents.capturePage().then(img => fs.writeFileSync(path.join(CAPTURAS, 'duende-paso.png'), img.toPNG())).catch(() => {});
    comprobar('1.1.67 · y se va al terminar', await hastaLibre(12000) && await hasta(`return document.querySelector('#asistente [data-as-trabajo]').hidden;`, 1500));
    const reusa = JSON.parse(await js(`const f = document.querySelector('#asistente iframe.as-duende-marco'); let marca = null; try { marca = f.contentWindow.__marca; } catch (_) {}
      return JSON.stringify({ n: document.querySelectorAll('#asistente iframe').length, igual: f === window.__marcoDuende, marca });`));
    comprobar('1.1.67 · el marco del duende no se recrea ni se recarga (el mismo, con su marca)', reusa.n === 1 && reusa.igual && reusa.marca === 1, JSON.stringify(reusa));

    /* ---------- un lienzo: «Ejecutar con IA» en una operación ---------- */
    const lz = JSON.parse(await js(`const x = Claquedraw.app.ejecutarEnVivo('editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: ${JSON.stringify(ids.cid)}, nombre: 'Del texto al guion', ref: 'l' }] }, { origen: 'Claude', avisar: false });
      const l = (${D}.datos.contenedores[0].lienzos || []).find(y => y.nombre === 'Del texto al guion');
      if (!l) return JSON.stringify({ error: x.error || x.texto });
      const y = Claquedraw.app.ejecutarEnVivo('editar_lienzo', { lienzo: l.id, operaciones: [
        { op: 'crear_nodo', tipo: 'texto', texto: 'Mara vuelve a una ciudad donde nunca deja de llover.', ref: 't', x: 0, y: 0 },
        { op: 'crear_nodo', tipo: 'generar', titulo: 'La escena', instruccion: 'Una escena corta', destino: { esquema: ${JSON.stringify(ids.eid)} }, ref: 'g', x: 420, y: 0 },
        { op: 'conectar', de: '$t', a: '$g' }] }, { origen: 'Claude', avisar: false });
      const l2 = ${D}.lienzo(l.id).lienzo, g = l2.nodos.find(n => n.tipo === 'generar');
      return JSON.stringify({ lid: l.id, gid: g && g.id, error: y.ok === false ? y.error : null });`));
    comprobar('un lienzo con un texto conectado a «Generar guion»', lz.lid && lz.gid && !lz.error, JSON.stringify(lz));
    await js(`Claquedraw.app.abrirLienzo(${JSON.stringify(lz.lid)}); await W(600); return true;`);
    const selIA = `document.querySelector('#lzNodos [data-lz-nodo="${lz.gid}"] [data-lz-ia]')`;
    comprobar('la operación lleva «Ejecutar con IA» junto a «Pedir a Claude»', await hasta(`const b = ${selIA}; return !!b && /Ejecutar con IA/.test(b.getAttribute('aria-label') || '') && b.textContent.trim() === 'IA' && !!b.parentElement.querySelector('[data-lz-pedir]');`, 4000));
    comprobar('y el pie, «Ejecutar todo con IA»', await js(`const b = document.querySelector('#lienzo [data-lz-ia-todo]'); return !!b && !b.hidden && /Ejecutar todo con IA/.test(b.textContent);`));
    S.cola.push(
      { llamadas: [{ name: 'ejecutar_nodo', args: { lienzo: lz.lid, nodo: lz.gid } }], pausa: 60 },
      { llamadas: [{ name: 'escribir_documento', args: { esquema: ids.eid, contenido: 'INT. CIUDAD - NOCHE\n\nLlueve sobre Mara, que no lleva paraguas.' } }], pausa: 60 },
      { llamadas: [{ name: 'completar_nodo', args: { lienzo: lz.lid, nodo: lz.gid, salida: { tipo: 'documento', esquema: ids.eid }, mensaje: 'Una escena bajo la lluvia' } }], pausa: 60 },
      { texto: 'Hecho: escribí la escena bajo la lluvia y marqué el nodo.', pausa: 40 }
    );
    const antesLz = S.peticiones.length;
    await aClic(selIA, { tras: 100 });
    /* el guion del esquema ya tiene texto: reemplazarlo pide permiso (revisión), también desde un lienzo */
    comprobar('reemplazar un guion con texto pide permiso en el panel', await hasta(`const c = [...document.querySelectorAll('#asistente .as-permiso')].pop(); return !!c && /reemplazar todo el texto/.test(c.textContent) && !!c.querySelector('[data-as-permiso="si"]');`, 8000),
      await panelTxt().then(t => t.slice(-400)));
    comprobar('mientras espera, el guion no se ha tocado', await js(`return !/Llueve sobre Mara/.test(${D}.documentoEsquema(${JSON.stringify(ids.eid)}).html);`));
    await aClic(`[...document.querySelectorAll('#asistente .as-permiso')].pop().querySelector('[data-as-permiso="si"]')`, { tras: 100 });
    comprobar('mientras corre, el nodo está pendiente y dice «Con IA…» (con su pulso)', await hasta(`const el = document.querySelector('#lzNodos [data-lz-nodo="${lz.gid}"]'); const e = el && el.querySelector('.lz-estado.pendiente'); return !!e && /Con IA/.test(e.textContent) && ${D}.lienzo(${JSON.stringify(lz.lid)}).lienzo.nodos.find(n => n.id === ${JSON.stringify(lz.gid)}).estado === 'pendiente';`, 4000));
    comprobar('el panel enseña el encargo', await hasta(`return ${A}._estado().items.some(i => i.tipo === 'yo' && /La escena/.test(i.texto));`, 3000));
    await hastaLibre(15000);
    const nodoG = JSON.parse(await js(`return JSON.stringify(${D}.lienzo(${JSON.stringify(lz.lid)}).lienzo.nodos.find(n => n.id === ${JSON.stringify(lz.gid)}));`));
    comprobar('al acabar queda «hecho» con su salida (el guion del esquema)', nodoG.estado === 'hecho' && nodoG.salida && nodoG.salida.tipo === 'documento' && nodoG.salida.eid === ids.eid, JSON.stringify(nodoG).slice(0, 400));
    comprobar('y el lienzo lo enseña: «Hecho» y la ficha de su salida', await hasta(`const el = document.querySelector('#lzNodos [data-lz-nodo="${lz.gid}"]'); return !!el && !!el.querySelector('.lz-estado.hecho') && !!el.querySelector('.lz-sal') && !/Con IA/.test(el.textContent);`, 4000),
      await js(`const el = document.querySelector('#lzNodos [data-lz-nodo="${lz.gid}"]'); return el ? el.querySelector('.lz-npie').innerText : 'sin nodo';`));
    const petsLz = S.peticiones.slice(antesLz);
    const toolEnc = petsLz[1] && (petsLz[1].cuerpo.messages || []).filter(m => m.role === 'tool').pop();
    comprobar('el modelo recibió el encargo del nodo (ejecutar_nodo) con lo que le entra', !!toolEnc && /ENCARGO/.test(toolEnc.content) && /nunca deja de llover/.test(toolEnc.content), toolEnc ? toolEnc.content.slice(0, 300) : 'sin tool');
    comprobar('el guion lo escribió en el esquema', await js(`return /Llueve sobre Mara/.test(${D}.documentoEsquema(${JSON.stringify(ids.eid)}).html);`));
    comprobar('la tarjeta dice «Permitido»', await js(`return /Permitido/.test([...document.querySelectorAll('#asistente .as-permiso')].pop().textContent);`));
    comprobar('la cabecera de la operación dice «IA · …», no «Claude · …»', await js(`const el = document.querySelector('#lzNodos [data-lz-nodo="${lz.gid}"] .lz-clase'); return !!el && /^IA · /.test(el.textContent);`));

    /* ---------- con el panel cerrado a mitad: un solo aviso por respuesta ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    S.cola.push(
      { texto: 'Voy a crear los dos nodos que me pides, uno detrás de otro. ', pausa: 90, llamadas: [{ name: 'editar_esquema', args: { esquema: ids.eid, operaciones: [{ op: 'crear_nodo', trama: ids.trama, columna: 6, titulo: 'Uno' }] } }] },
      { llamadas: [{ name: 'editar_esquema', args: { esquema: ids.eid, operaciones: [{ op: 'crear_nodo', trama: ids.trama, columna: 7, titulo: 'Dos' }] } }] },
      { texto: 'Dos nodos.' }
    );
    await mandar('Crea dos nodos');
    await hasta(`return ${A}.trabajando();`, 3000);
    await aClic(`document.querySelector('#asistente [data-as-cerrar]')`, { tras: 100 });
    comprobar('× cierra el panel (mientras trabaja)', await js(`return !${A}.abierto();`));
    await hastaLibre();
    await espera(1600);
    const aviso = await js(`return document.getElementById('aviso').textContent;`);
    comprobar('los cambios de una respuesta con el panel cerrado dan un solo aviso («DeepSeek hizo 2 cambios»)', /DeepSeek hizo 2 cambios/.test(aviso), aviso);
    comprobar('y los dos nodos están', await js(`const ps = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.map(p => p.titulo); return ps.includes('Uno') && ps.includes('Dos');`));

    /* ---------- «Mandar al asistente» en el botón de enlace de la cabecera ---------- */
    await js(`${A}.abrir(); await W(200); return true;`);
    await aClic(`[...document.querySelectorAll('[data-enlace-cab]')].find(b => b.offsetParent)`, { tras: 300 });
    comprobar('con el panel abierto, el botón de enlace ofrece «Mandar al asistente»', await js(`return [...document.querySelectorAll('.gd-pop button')].some(b => /Mandar al asistente/.test(b.textContent));`));
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /Mandar al asistente/.test(b.textContent))`, { tras: 300 });
    comprobar('y deja el enlace en el campo del panel, sin mandarlo', await js(`const v = document.querySelector('#asistente [data-as-campo]').value; return /clapcraft:\\/\\//.test(v) && !${A}.trabajando();`),
      await js(`return document.querySelector('#asistente [data-as-campo]').value;`));
    await js(`const c = document.querySelector('#asistente [data-as-campo]'); c.value = ''; c.dispatchEvent(new Event('input')); return true;`);

    /* ---------- «Mandar al asistente» en el clic derecho del editor (el párrafo del cursor) ---------- */
    await js(`Claquedraw.app.montarEsquema(${JSON.stringify(ids.eid)}); Claquedraw.app.vista('esquema'); await W(300); return true;`);
    await aClic(`document.getElementById('abrirDoc')`, { tras: 1200 });
    const enMarco = await hasta(`const f = document.getElementById('editorMarco'), d = f && f.contentDocument; return !!d && [...d.querySelectorAll('#editor p')].some(p => /Llueve sobre Mara/.test(p.textContent));`, 6000);
    comprobar('«Abrir documento» enseña el guion en el editor', enMarco);
    const pP = JSON.parse(await js(`const f = document.getElementById('editorMarco'), d = f.contentDocument, p = [...d.querySelectorAll('#editor p')].find(x => /Llueve sobre Mara/.test(x.textContent));
      p.scrollIntoView({ block: 'center' }); await W(100); const a = f.getBoundingClientRect(), b = p.getBoundingClientRect(), z = parseFloat(getComputedStyle(d.querySelector('.page-wrap') || d.body).zoom) || 1;
      return JSON.stringify({ x: a.left + (b.left + 20) * z, y: a.top + (b.top + b.height / 2) * z });`));
    await clic(pP, { tras: 200 });
    await clic(pP, { boton: 'right', tras: 400 });
    comprobar('el clic derecho del editor ofrece «Mandar al asistente»', await js(`const d = document.getElementById('editorMarco').contentDocument, b = d.getElementById('cdAsistente'), m = d.getElementById('ctxMenu'); return !!b && !b.hidden && !!m && !m.hidden;`));
    const pM = JSON.parse(await js(`const f = document.getElementById('editorMarco'), d = f.contentDocument, b = d.getElementById('cdAsistente'), a = f.getBoundingClientRect(), r = b.getBoundingClientRect(), z = parseFloat(getComputedStyle(d.querySelector('.page-wrap') || d.body).zoom) || 1;
      return JSON.stringify({ x: a.left + (r.left + r.width / 2), y: a.top + (r.top + r.height / 2) });`));
    await clic(pM, { tras: 400 });
    comprobar('y deja el enlace de ese párrafo (con su tramo) en el campo', await js(`const v = document.querySelector('#asistente [data-as-campo]').value; return /clapcraft:\\/\\/[^)]*documento\\?b=/.test(v);`),
      await js(`return document.querySelector('#asistente [data-as-campo]').value;`));
    await js(`const c = document.querySelector('#asistente [data-as-campo]'); c.value = ''; c.dispatchEvent(new Event('input')); Claquedraw.app.vista('esquema'); await W(300); return true;`);

    /* ---------- 1.1.60: el panel con la ventana de una nota, con el editor delante y con lo que se abre encima ----------
       Leo: «Tampoco puedo abrir el asistente de IA [con] un modal de una nota, verifica que no ocurra lo mismo en el editor de
       documentos». Con el ratón y el teclado de verdad. */
    const CAPA_N = `document.querySelector('.gd-modal-capa')`, CAMPO_N = `${CAPA_N}.querySelector('[data-gd-lado-texto]')`, CAMPO_P = `document.querySelector('#asistente [data-as-campo]')`;
    const ventanaN = () => js(`const c = ${CAPA_N}; return !!c && !c.hidden;`);
    const notaN = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], s = d.crearSub(c.id, 'Ideas').sub, n = d.crearNota(s.id, null, 'Una nota').nota;
      d.guardarNota(n.id, { title: n.titulo, html: '<p>Texto de la nota.</p>', characters: {} }); Claquedraw.gestor.render(); return JSON.stringify({ sid: s.id, nid: n.id });`));
    await js(`${A}.cerrar(); Claquedraw.gestor.abrirSub('${notaN.sid}'); await W(600); return true;`);
    await aClic(`document.querySelector('#gdMain .gd-nota[data-nota="${notaN.nid}"] > span:first-child')`, { tras: 600 });
    comprobar('1.1.60 · la ventana de una nota abierta', await ventanaN());
    await aClic(`document.getElementById('asistenteBtn')`, { tras: 500 });
    const junto = JSON.parse(await js(`const c = ${CAPA_N}.getBoundingClientRect(), p = document.getElementById('asistente').getBoundingClientRect(), q = ${CAMPO_P}.getBoundingClientRect();
      const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return JSON.stringify({ abierto: ${A}.abierto(), ventana: !${CAPA_N}.hidden, capaDer: Math.round(c.right), panelIzq: Math.round(p.left), encima: !!el && !!el.closest('#asistente') });`));
    comprobar('1.1.60 · con la ventana de una nota, el botón «Asistente» de la franja abre el panel y la ventana sigue', junto.abierto && junto.ventana, JSON.stringify(junto));
    comprobar('1.1.60 · el panel va junto a la ventana (la capa le deja su sitio) y se puede pulsar', junto.capaDer <= junto.panelIzq + 1 && junto.encima, JSON.stringify(junto));
    const notaAntes = await js(`return ${D}.nota('${notaN.nid}').html;`);
    await aClic(CAMPO_P, { tras: 150 });
    await escribir('hola panel');
    await tecla('Escape', [], 250);
    comprobar('1.1.60 · se escribe en el panel (no en la nota) y Esc en el panel no cierra la ventana', /hola panel/.test(await js(`return ${CAMPO_P}.value;`)) && await ventanaN() && await js(`return ${D}.nota('${notaN.nid}').html;`) === notaAntes && !/hola panel/.test(await js(`return ${CAMPO_N}.textContent;`)));
    await aClic(`${CAMPO_N}.querySelector('p')`, { tras: 150 });
    await tecla('End', [], 80);
    await escribir(' Más.');
    await espera(600);
    comprobar('1.1.60 · un clic en la nota no cierra el panel, y lo escrito va a la nota', await js(`return ${A}.abierto();`) && /Más\./.test(await js(`return ${D}.nota('${notaN.nid}').html;`)) && !/Más/.test(await js(`return ${CAMPO_P}.value;`)));
    await tecla('I', ['meta', 'shift'], 400);
    comprobar('1.1.60 · Cmd+Shift+I con el foco en la nota cierra el panel (la ventana sigue)', !(await js(`return ${A}.abierto();`)) && await ventanaN());
    await tecla('I', ['meta', 'shift'], 500);
    comprobar('1.1.60 · y lo vuelve a abrir', await js(`return ${A}.abierto();`) && await ventanaN());
    await js(`const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);
    await clic(await centro(`${CAPA_N}.querySelector('[data-gd-lado-enlace]')`), { boton: 'right', tras: 300 });
    comprobar('1.1.60 · el botón de enlace de la ventana ofrece «Mandar al asistente»', await js(`return [...document.querySelectorAll('.gd-pop button')].some(b => /Mandar al asistente/.test(b.textContent));`));
    await aClic(`[...document.querySelectorAll('.gd-pop button')].find(b => /Mandar al asistente/.test(b.textContent))`, { tras: 400 });
    comprobar('1.1.60 · y pone el enlace de la nota en el campo, como chip (la ventana sigue)', await js(`const c = ${CAMPO_P}, ch = c.querySelector('.as-chip-campo'); return !!ch && /Una nota/.test(ch.textContent) && c.value.includes('/nota/');`) && await ventanaN(),
      await js(`return ${CAMPO_P}.value;`));
    await js(`const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);
    /* el historial de Claude también le deja sitio; con el panel plegado, el riel */
    menu('Claude', 'Historial de cambios…').click(); await espera(600);
    const hc = JSON.parse(await js(`const h = document.querySelector('.hc-capa'), p = document.getElementById('asistente').getBoundingClientRect(); return JSON.stringify(h ? { der: Math.round(h.getBoundingClientRect().right), izq: Math.round(p.left) } : null);`));
    comprobar('1.1.60 · el historial de Claude se abre junto al panel', hc && hc.der <= hc.izq + 1, JSON.stringify(hc));
    await tecla('Escape', [], 400);
    await js(`${A}.plegar(true); await W(200); return true;`);
    comprobar('1.1.60 · con el panel plegado, la ventana deja libre su riel', await js(`const c = ${CAPA_N}.getBoundingClientRect(), p = document.getElementById('asistente').getBoundingClientRect(); return Math.round(c.right) <= Math.round(p.left) + 1 && p.width < 60;`));
    await js(`${A}.plegar(false); await W(200); return true;`);
    /* el editor de documentos: con el foco dentro del marco */
    await aClic(`${CAPA_N}.querySelector('[data-gd-lado-abrir]')`, { tras: 1000 });
    comprobar('1.1.60 · la nota, en el editor', await hasta(`return document.body.classList.contains('nota-abierta') && Claquedraw.texto.enDocumento();`, 4000));
    await js(`${A}.cerrar(); await W(200); return true;`);
    const anchoSolo = await js(`return document.getElementById('editorMarco').getBoundingClientRect().width;`);
    const pE = JSON.parse(await js(`const f = document.getElementById('editorMarco'), d = f.contentDocument, p = d.querySelector('#editor p'); const a = f.getBoundingClientRect(), b = p.getBoundingClientRect();
      return JSON.stringify({ x: a.left + b.left + 30, y: a.top + b.top + b.height / 2 });`));
    await clic(pE, { tras: 200 });
    await tecla('I', ['meta', 'shift'], 600);
    comprobar('1.1.60 · Cmd+Shift+I con el foco en el editor abre el panel', await hasta(`return ${A}.abierto();`, 2000));
    const anchoCon = await js(`return document.getElementById('editorMarco').getBoundingClientRect().width;`);
    comprobar('1.1.60 · y la hoja se estrecha para dejarle sitio', anchoCon < anchoSolo - 200, anchoSolo + ' → ' + anchoCon);
    const docAntes = await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`);
    await aClic(CAMPO_P, { tras: 150 });
    await escribir('desde el panel');
    await tecla('Backspace', [], 80);
    comprobar('1.1.60 · lo que se escribe en el panel no va al editor', await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`) === docAntes && /desde el pane$/.test(await js(`return ${CAMPO_P}.value;`)));
    const pE2 = JSON.parse(await js(`const f = document.getElementById('editorMarco'), d = f.contentDocument, p = d.querySelector('#editor p'); const a = f.getBoundingClientRect(), b = p.getBoundingClientRect();
      return JSON.stringify({ x: a.left + b.left + 30, y: a.top + b.top + b.height / 2 });`));   // (la hoja se estrechó: el párrafo se movió)
    await clic(pE2, { tras: 200 });
    await escribir('Z');
    await espera(300);
    comprobar('1.1.60 · y lo del editor no va al panel', /Z/.test(await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`)) && !/Z/.test(await js(`return ${CAMPO_P}.value;`)));
    await aClic(`document.getElementById('asistenteBtn')`, { tras: 400 });
    comprobar('1.1.60 · el botón de la franja lo cierra con el editor delante', !(await js(`return ${A}.abierto();`)));
    await aClic(`document.getElementById('asistenteBtn')`, { tras: 400 });
    comprobar('1.1.60 · y lo abre', await js(`return ${A}.abierto();`));
    await js(`const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); Claquedraw.gestor.cerrarNota && Claquedraw.gestor.cerrarNota(); Claquedraw.app.vista('esquema'); await W(400); return true;`);

    /* ---------- 1.1.60: citar (Leo: «Necesito poder citar textos para mandarlos al asistente») ---------- */
    await js(`if (!${A}.abierto()) ${A}.abrir(); const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); await W(200); return true;`);
    await js(`${A}.cerrar(); return true;`);
    comprobar('1.1.60 · C.asistente.citar abre el panel y deja un chip de cita en el campo',
      await js(`return ${A}.citar({ texto: 'Línea uno\\nLínea dos', enlace: 'clapcraft://lluvia/nota/xyz', etiqueta: 'Nota «Una nota»' }) === true && ${A}.abierto();`)
      && await js(`const ch = ${CAMPO_P}.querySelector('.as-chip-cita'); return !!ch && ch.getAttribute('contenteditable') === 'false' && /Línea uno/.test(ch.textContent) && /Una nota/.test(ch.textContent) && /Línea uno\\nLínea dos/.test(ch.title);`),
      await js(`return ${CAMPO_P}.innerHTML;`));
    await escribir('¿Qué opinas?');
    let vc = await js(`return ${CAMPO_P}.value;`);
    comprobar('1.1.60 · se serializa como cita de Markdown con su origen, y lo escrito debajo', vc === '> Línea uno\n> Línea dos\n> — [Nota «Una nota»](clapcraft://lluvia/nota/xyz)\n¿Qué opinas?', JSON.stringify(vc));
    await js(`${A}.citar({ texto: 'Otra cosa' }); return true;`);
    comprobar('1.1.60 · caben varias citas en un mensaje', await js(`return ${CAMPO_P}.querySelectorAll('.as-chip-cita').length === 2;`));
    await tecla('Backspace', [], 80); await tecla('Backspace', [], 200);
    comprobar('1.1.60 · Retroceso junto a una cita la borra entera', await js(`return ${CAMPO_P}.querySelectorAll('.as-chip-cita').length === 1 && !/Otra cosa/.test(${CAMPO_P}.value);`), await js(`return ${CAMPO_P}.value;`));
    await js(`${A}.citar({ texto: 'palabra '.repeat(1200), enlace: 'clapcraft://lluvia/esquema/abc/documento?b=1-40', etiqueta: 'Guion' }); return true;`);
    const larga = JSON.parse(await js(`const ch = [...${CAMPO_P}.querySelectorAll('.as-chip-cita')].pop(); return JSON.stringify({ n: ch.dataset.cita.length, fin: ch.dataset.cita.slice(-30) });`));
    comprobar('1.1.60 · una cita enorme se recorta, con «…» y el enlace para el resto', larga.n <= 6030 && /… \(sigue en el enlace\)$/.test(larga.fin), JSON.stringify(larga));
    await tecla('Backspace', [], 80); await tecla('Backspace', [], 200);
    S.cola.push({ texto: 'Me gusta la **segunda línea**, que es muy breve y seca.' });
    const antesC = S.peticiones.length;
    await tecla('Enter', [], 300);
    await hastaLibre();
    const pc = S.peticiones.slice(antesC).find(p => p.url === '/v1/chat/completions'), uc = pc ? (pc.cuerpo.messages || []).filter(m => m.role === 'user').pop() : null;
    comprobar('1.1.60 · lo que llega al modelo lleva la cita en su sitio', !!uc && /> Línea uno\n> Línea dos\n> — \[Nota «Una nota»\]\(clapcraft:\/\/lluvia\/nota\/xyz\)\n¿Qué opinas\?/.test(uc.content), uc && uc.content);
    comprobar('1.1.60 · y el mensaje enviado la enseña como cita', await js(`const y = [...document.querySelectorAll('#asistente .as-yo')].pop(); return !!y && !!y.querySelector('blockquote.as-cita') && /Línea uno/.test(y.querySelector('blockquote.as-cita').textContent) && !/^>/.test(y.textContent.trim());`));
    /* «Citar» sobre lo elegido de una respuesta, con el ratón */
    const sel = JSON.parse(await js(`const p = [...document.querySelectorAll('#asistente .as-ia .as-md p')].pop(), t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(8, t.length));
      const a = r.getBoundingClientRect(); r.setStart(p.lastChild.nodeType === 3 ? p.lastChild : p, 0); const b = p.getBoundingClientRect(); return JSON.stringify({ x0: a.left + 1, y: a.top + a.height / 2, x1: b.right - 4 });`));
    await arrastrar({ x: sel.x0, y: sel.y }, { x: sel.x1, y: sel.y }, 10);
    comprobar('1.1.60 · elegir texto de una respuesta ofrece «Citar»', await hasta(`const b = document.querySelector('#asistente .as-citar-flot'); return !!b && !b.hidden;`, 2000));
    await aClic(`document.querySelector('#asistente .as-citar-flot')`, { tras: 300 });
    comprobar('1.1.60 · y lo pone en el campo como cita de la respuesta', await js(`const ch = ${CAMPO_P}.querySelector('.as-chip-cita'); return !!ch && /Respuesta del asistente/.test(ch.textContent) && /seca/.test(ch.dataset.cita);`), await js(`return ${CAMPO_P}.value;`));
    await js(`const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);

    /* ---------- 1.1.60: imágenes adjuntas (la visión la pone otro: aquí, el campo y lo que se le pasa al motor) ---------- */
    await js(`window.__envios = []; const P = Claquedraw.asistenteMotor.Conversacion.prototype; if (!P.__espiado) { const o = P.enviar; P.enviar = function (t, op) { window.__envios.push({ t, imgs: op && op.imagenes ? op.imagenes.map(x => ({ n: x.nombre, m: x.mimeType, d: (x.data || '').length })) : null }); return o.call(this, t, op); }; P.__espiado = true; } return true;`);
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mNk+M9Qz0AEYBxVSF+FjAwM/xkYGBgYGYhUOKqQvgpHFdJXIQBR3xAR4q3ndwAAAABJRU5ErkJggg==';
    await aClic(CAMPO_P, { tras: 120 });
    await escribir('¿Qué ves? ');
    await js(`const c = ${CAMPO_P}, b = Uint8Array.from(atob('${PNG}'), x => x.charCodeAt(0)), f = new File([b], 'boceto.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(f); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
    comprobar('1.1.60 · pegar una imagen la adjunta: un chip con su miniatura en el campo', await hasta(`const ch = ${CAMPO_P}.querySelector('.as-chip-img'); return !!ch && ch.getAttribute('contenteditable') === 'false' && /^data:image/.test(ch.querySelector('img').src) && /boceto/.test(ch.textContent);`, 3000));
    comprobar('1.1.60 · el campo no la cuenta como texto', await js(`return ${CAMPO_P}.value.trim() === '¿Qué ves?';`), await js(`return ${CAMPO_P}.value;`));
    comprobar('1.1.60 · junto al campo, 📎 para adjuntar', await js(`return !!document.querySelector('#asistente [data-as-adjuntar]');`));
    await aClic(`${CAMPO_P}.querySelector('.as-chip-img')`, { tras: 500 });
    comprobar('1.1.60 · un clic en la imagen adjunta la abre en el visor', await hasta(`return !!document.querySelector('.an-capa');`, 2000));
    await tecla('Escape', [], 400);
    comprobar('1.1.60 · Esc cierra el visor (el panel y la imagen siguen)', await js(`return !document.querySelector('.an-capa') && ${A}.abierto() && !!${CAMPO_P}.querySelector('.as-chip-img');`));
    S.cola.push({ texto: 'Veo un cuadrado.' });
    await js(`const c = ${CAMPO_P}; c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true;`);
    await tecla('Enter', [], 300);
    await hastaLibre();
    const envio = JSON.parse(await js(`return JSON.stringify(window.__envios.pop() || null);`));
    comprobar('1.1.60 · al mandar, la imagen va al motor junto al texto (enviar(texto, { imagenes }))', !!envio && envio.t === '¿Qué ves?' && envio.imgs && envio.imgs.length === 1 && envio.imgs[0].m === 'image/png' && envio.imgs[0].d > 50 && /boceto/.test(envio.imgs[0].n), JSON.stringify(envio));
    comprobar('1.1.60 · y el mensaje enviado enseña su miniatura', await js(`const y = [...document.querySelectorAll('#asistente .as-yo')].pop(); return !!y && !!y.querySelector('.as-yo-imgs img');`));
    /* la visión delegada: el modelo de imágenes la describe y DeepSeek recibe la descripción, no la imagen */
    const vis = (S.visiones || []).slice(-1)[0], alTexto = S.peticiones.filter(p => p.cuerpo && p.cuerpo.stream && /Veo|BOCETO|Imagen «/.test(JSON.stringify(p.cuerpo.messages || []))).pop();
    comprobar('1.1.60 · la imagen la describe el modelo de visión (qwen3.7-flash, sin razonar, sin stream, en image_url)', !!vis && vis.model === 'qwen3.7-flash' && vis.enable_thinking === false && vis.stream === false && /^data:image\//.test(vis.messages[0].content.find(c => c.type === 'image_url').image_url.url), vis ? JSON.stringify({ model: vis.model, et: vis.enable_thinking, stream: vis.stream }) : 'no hubo petición de visión');
    comprobar('1.1.60 · y DeepSeek recibe la descripción (con su texto transcrito), no la imagen', !!alTexto && /\[Imagen «[^»]*boceto[^»]*»: Un cuadrado de colores[^\]]*«BOCETO 1»/.test(JSON.stringify(alTexto.cuerpo.messages)) && !JSON.stringify(alTexto.cuerpo.messages).includes(PNG.slice(0, 40)) && alTexto.cuerpo.model !== 'qwen3.7-flash',
      alTexto ? JSON.stringify(alTexto.cuerpo.messages.filter(m => m.role === 'user').slice(-1)).slice(0, 600) : 'sin petición');
    comprobar('1.1.60 · una sola petición al modelo de visión por la imagen', (S.visiones || []).length === 1, String((S.visiones || []).length));
    await js(`${A}.citar({ texto: 'Un pie de foto', etiqueta: 'Nota', imagen: { src: 'data:image/png;base64,${PNG}', nombre: 'Foto de la nota' } }); await W(600); return true;`);
    comprobar('1.1.60 · citar con una imagen la adjunta (y la cita, detrás)', await js(`const c = ${CAMPO_P}; return !!c.querySelector('.as-chip-img') && /Foto de la nota/.test(c.querySelector('.as-chip-img').textContent) && !!c.querySelector('.as-chip-cita');`));
    await tecla('Backspace', [], 80); await tecla('Backspace', [], 80); await tecla('Backspace', [], 80); await tecla('Backspace', [], 200);
    comprobar('1.1.60 · Retroceso quita la imagen adjunta', await js(`return !${CAMPO_P}.querySelector('.as-chip-img, .as-chip-cita');`), await js(`return ${CAMPO_P}.innerHTML;`));
    await js(`const c = ${CAMPO_P}; c.value = ''; c.dispatchEvent(new Event('input')); return true;`);

    comprobar('1.1.60 · la cabecera del panel lleva «Memoria de estilo» (abre su diálogo si está, o lo dice)', await js(`const b = document.querySelector('#asistente [data-as-memoria]'); return !!b && /Memoria de estilo/.test(b.title);`));
    await aClic(`document.querySelector('#asistente [data-as-memoria]')`, { tras: 500 });
    comprobar('1.1.60 · y pulsarla no suelta errores', await js(`return !!(Claquedraw.memoriaUI) || /memoria de estilo/i.test(document.getElementById('aviso').textContent);`));
    await tecla('Escape', [], 300);
    await js(`document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} }); return true;`);

    /* ---------- 1.1.60: el saldo de APIMart en la cabecera (si el transporte ya lo sabe pedir) ---------- */
    comprobar('1.1.60 · el transporte sabe pedir el saldo (editorAPI.ia.saldo)', await js(`return typeof window.editorAPI.ia.saldo === 'function';`));
    {
      await js(`${A}.cerrar(); await W(100); ${A}.abrir(); await W(100); return true;`);
      comprobar('1.1.60 · el saldo de APIMart en la cabecera del panel (1.1.61: la cifra en el chip, «Saldo … USD» en el globo)', await hasta(`const b = document.querySelector('#asistente [data-as-saldo]'); return !!b && !b.hidden && b.textContent === '$9,91' && /^Saldo 9,91 USD/.test(b.title) && b.getAttribute('aria-label') === 'Saldo 9,91 USD' && /usados 0,09/.test(b.title);`, 4000),
        await js(`const b = document.querySelector('#asistente [data-as-saldo]'); return b ? b.outerHTML : null;`));
      /* 1.1.61 (revisión de ClapBook): con «Saldo 9,91 USD» y el chip sin encoger, el modelo se cortaba en «deepseek…» */
      const cab = JSON.parse(await js(`const b = document.querySelector('#asistente [data-as-saldo]'), m = document.querySelector('#asistente .as-modelo'), p = document.getElementById('asistente');
        return JSON.stringify({ ancho: p.offsetWidth, modelo: m.textContent, cabeM: m.scrollWidth <= m.clientWidth + 1, cabeS: b.scrollWidth <= b.clientWidth + 1, mw: m.scrollWidth + '/' + m.clientWidth, sw: b.scrollWidth + '/' + b.clientWidth });`));
      comprobar('1.1.61 · con el ancho de partida, ni el modelo ni el chip del saldo se cortan', cab.cabeM && cab.cabeS && /deepseek-v4-flash|V4 Flash/i.test(cab.modelo), JSON.stringify(cab));
      S.saldo = { remain_balance: 0.15, remain_credits: 1.5, success: true, used_balance: 9.85, used_credits: 98.5 };
      await aClic(`document.querySelector('#asistente [data-as-saldo]')`, { tras: 800 });
      comprobar('1.1.60 · un clic lo vuelve a mirar; por debajo de 0,20 USD, en rojo', await hasta(`const b = document.querySelector('#asistente [data-as-saldo]'); return /0,15/.test(b.textContent) && b.classList.contains('critico');`, 4000),
        await js(`return document.querySelector('#asistente [data-as-saldo]').outerHTML;`));
      S.saldo = null;
    }

    /* ---------- 1.1.61: el clic central en un enlace de una respuesta pregunta como el clic (no sale solo por setWindowOpenHandler) ---------- */
    {
      await js(`if (!${A}.abierto()) ${A}.abrir(); await W(200); return true;`);
      S.cola.push({ texto: 'Mira [la guía](https://ejemplo.com/guia) antes de seguir.' });
      await mandar('Dame un enlace');
      await hastaLibre();
      const selA = `[...document.querySelectorAll('#asistente a[href]')].find(a => /ejemplo\\.com/.test(a.getAttribute('href')))`;
      comprobar('1.1.61 · la respuesta trae el enlace', await hasta(`return !!${selA};`, 3000), await panelTxt());
      const nVentanas = BrowserWindow.getAllWindows().length;
      await aClic(selA, { boton: 'middle', tras: 500 });
      comprobar('1.1.61 · el clic central pregunta antes de salir (el mismo aviso que el clic)', await hasta(`const d = document.getElementById('dlg'); return d.open && /ejemplo\\.com\\/guia/.test(d.textContent) && /Abrir fuera de ClapCraft/.test(d.textContent);`, 3000)
        && !externos.length && BrowserWindow.getAllWindows().length === nVentanas, JSON.stringify({ externos, dlg: await js(`return document.getElementById('dlg').textContent;`) }));
      await aClic(`document.getElementById('dlgCancel')`, { tras: 400 });
      comprobar('1.1.61 · «Cancelar» no abre nada', !externos.length && !(await js(`return document.getElementById('dlg').open;`)), JSON.stringify(externos));
      await aClic(selA, { boton: 'middle', tras: 500 });
      await hasta(`return document.getElementById('dlg').open;`, 3000);
      await aClic(`document.getElementById('dlgOk')`, { tras: 600 });
      comprobar('1.1.61 · y aceptando, va al navegador del sistema (una vez)', externos.length === 1 && externos[0] === 'https://ejemplo.com/guia', JSON.stringify(externos));
      externos.length = 0;
    }

    /* ---------- revisión: lo que borra pide permiso; «No» no lo hace ---------- */
    await js(`if (!${A}.abierto()) ${A}.abrir(); await W(200); return true;`);
    const idUno = await js(`const p = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.find(x => x.titulo === 'Uno'); return p ? p.id : null;`);
    S.cola.push({ llamadas: [{ name: 'editar_esquema', args: { esquema: ids.eid, operaciones: [{ op: 'borrar_nodo', nodo: idUno }] } }] },
      b => ({ texto: /NO SE HIZO: Leo no dio permiso/.test(JSON.stringify(b.messages.slice(-1))) ? 'Vale, no lo borro.' : 'MAL: no supe que no' }));
    await mandar('Borra el nodo «Uno»');
    comprobar('borrar un nodo pide permiso', await hasta(`const c = [...document.querySelectorAll('#asistente .as-permiso')].pop(); return !!c && /borrar nodo/.test(c.textContent) && !!c.querySelector('[data-as-permiso="no"]');`, 6000));
    await aClic(`[...document.querySelectorAll('#asistente .as-permiso')].pop().querySelector('[data-as-permiso="no"]')`, { tras: 100 });
    await hastaLibre();
    comprobar('con «No» el nodo se queda, y el modelo lo sabe', await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.some(p => p.id === ${JSON.stringify(idUno)});`) && /Vale, no lo borro/.test(await panelTxt()));

    /* ---------- revisión: «Reintentar» no repite el mensaje ni lo ya hecho ---------- */
    const TXT_R = 'Crea el nodo del reintento';
    S.cola.push({ llamadas: [{ name: 'editar_esquema', args: { esquema: ids.eid, operaciones: [{ op: 'crear_nodo', trama: ids.trama, columna: 9, titulo: 'Reintento' }] } }] },
      { estado: 400, cuerpo: { error: { message: 'algo raro pasó' } } });
    await mandar(TXT_R);
    await hastaLibre();
    comprobar('un error a mitad sale con «Reintentar»', await js(`const e = [...document.querySelectorAll('#asistente .as-error')].pop(); return !!e && !!e.querySelector('[data-as-reintentar]');`));
    S.cola.push({ texto: 'Ya estaba creado; sigo.' });
    const antesR = S.peticiones.length;
    await aClic(`[...document.querySelectorAll('#asistente .as-error')].pop().querySelector('[data-as-reintentar]')`, { tras: 200 });
    await hastaLibre();
    const petR = S.peticiones[antesR];
    const vecesR = petR ? petR.cuerpo.messages.filter(m => m.role === 'user' && (m.content || '').includes(TXT_R)).length : -1;
    comprobar('«Reintentar» vuelve a llamar sin repetir el mensaje (y con la nota de seguir)', !!petR && vecesR === 1 && /continúa donde lo dejaste/.test(petR.cuerpo.messages[0].content), 'veces: ' + vecesR);
    comprobar('ni lo ya hecho (un solo nodo «Reintento»), ni otra burbuja de Leo', await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.filter(p => p.titulo === 'Reintento').length === 1 && ${A}._estado().items.filter(i => i.tipo === 'yo' && i.texto === ${JSON.stringify(TXT_R)}).length === 1 && !${A}._estado().items.some(i => i.tipo === 'error');`));

    /* ---------- 1.1.60: los ids, por su nombre ----------
       Leo: «el asistente de IA me da el ID de la nota en lugar del nombre» (la tarjeta del permiso decía «Escribió en la nota
       «dmukdx664rd82g»»). El permiso y los pasos dicen el nombre; y un id que se cuela en la respuesta es un chip con su nombre que
       lleva a su sitio (no en un bloque de código). */
    const notaI = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], s = d.crearSub(c.id, 'Guiones sueltos').sub, n = d.crearNota(s.id, null, 'Nota del bar').nota;
      d.guardarNota(n.id, { title: n.titulo, html: '<p>Mara entra al bar.</p>', characters: {} }); Claquedraw.gestor.render(); return JSON.stringify({ sid: s.id, nid: n.id });`));
    const NID = notaI.nid;
    S.cola.push({ llamadas: [{ name: 'escribir_documento', args: { nota: NID, contenido: 'Mara sale del bar.' } }] },
      { texto: 'Listo: reescribí la nota ' + NID + ' como pediste. Para las herramientas es:\n\n```\n' + NID + '\n```\n\nY la biblioteca `' + notaI.sid + '`. Otra palabra: a1.' });
    await mandar('Reescribe la nota del bar');
    comprobar('1.1.60 · la tarjeta del permiso nombra la nota por su título, no por su id', await hasta(`const c = [...document.querySelectorAll('#asistente .as-permiso')].pop(); return !!c && /Escribió en la nota «Nota del bar»/.test(c.textContent) && /la nota «Nota del bar»/.test(c.textContent) && !c.textContent.includes(${JSON.stringify(NID)});`, 6000),
      await js(`const c = [...document.querySelectorAll('#asistente .as-permiso')].pop(); return c ? c.textContent : 'sin tarjeta';`));
    await aClic(`[...document.querySelectorAll('#asistente .as-permiso')].pop().querySelector('[data-as-permiso="si"]')`, { tras: 100 });
    await hastaLibre();
    comprobar('1.1.60 · y el paso también', await js(`const t = [...document.querySelectorAll('#asistente .as-paso-tit')].pop().textContent; return /Nota del bar/.test(t) && !t.includes(${JSON.stringify(NID)});`),
      await js(`return [...document.querySelectorAll('#asistente .as-paso-tit')].pop().textContent;`));
    const resp = JSON.parse(await js(`const m = [...document.querySelectorAll('#asistente .as-ia .as-md')].pop(), chips = [...m.querySelectorAll('a.as-chip-id')];
      return JSON.stringify({ chips: chips.map(a => [a.textContent, a.getAttribute('href')]), pre: m.querySelector('pre') ? m.querySelector('pre').textContent : '', fuera: m.innerText.replace(m.querySelector('pre') ? m.querySelector('pre').innerText : '', '') });`));
    comprobar('1.1.60 · un id en la respuesta se pinta como chip con su nombre (y la biblioteca en `código`, también)',
      resp.chips.length === 2 && resp.chips[0][0] === 'Nota del bar' && /^clapcraft:\/\/[^/]+\/nota\//.test(resp.chips[0][1]) && resp.chips[1][0] === 'Guiones sueltos' && !resp.fuera.includes(NID) && !resp.fuera.includes(notaI.sid) && /reescribí la nota Nota del bar/.test(resp.fuera), JSON.stringify(resp));
    comprobar('1.1.60 · lo de un bloque de código y lo que solo parece un id («a1») no se tocan', resp.pre.trim() === NID && /Otra palabra: a1\./.test(resp.fuera), JSON.stringify(resp));
    await aClic(`[...document.querySelectorAll('#asistente .as-ia .as-md a.as-chip-id')].find(a => a.textContent === 'Nota del bar')`, { tras: 300 });
    comprobar('1.1.60 · el clic en el chip lleva a la nota', await hasta(`return Claquedraw.gestor.notaAbierta() === ${JSON.stringify(NID)} || (Claquedraw.gestor.notaElegida && Claquedraw.gestor.notaElegida() === ${JSON.stringify(NID)});`, 4000));

    /* ---------- revisión: una clave pegada en el chat no se manda ---------- */
    const antesK = S.peticiones.length;
    await mandar('usa esta: sk-' + 'q'.repeat(30));
    await espera(300);
    comprobar('una clave pegada en el chat no se manda ni queda en la conversación', S.peticiones.length === antesK && !(await items()).some(i => /sk-q{10}/.test(i.texto || '')) && !/sk-q{10}/.test(await js(`return document.querySelector('#asistente [data-as-campo]').value;`)));
    await js(`const c = document.querySelector('#asistente [data-as-campo]'); c.value = ''; c.dispatchEvent(new Event('input')); return true;`);

    /* ---------- revisión: la clave va con su servicio; direcciones privadas, no ---------- */
    menu('Claude', 'Configurar IA…').click();
    await hasta(`const d = document.getElementById('dlgIA'); return !!d && d.open;`, 3000);
    await aClic(`document.querySelector('#dlgIA [data-ia-proveedor="otro"]')`, { tras: 400 });
    const priv = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.guardarConfig({ url: 'https://192.168.1.20/v1' }));`));
    comprobar('una dirección de la red privada no vale', priv.ok === false, JSON.stringify(priv));
    await js(`await window.editorAPI.ia.guardarConfig({ url: 'https://api.otro-servicio.example/v1' }); return true;`);
    await aClic(`document.querySelector('#dlgIA [data-ia-proveedor="otro"]')`, { tras: 400 });
    const cOtro = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`));
    comprobar('con otro proveedor, la clave de APIMart no se usa (y el diálogo pide otra)', cOtro.hayClave === false && cOtro.otrasClaves.includes('api.apimart.ai') && await js(`return !!document.querySelector('#dlgIA [data-ia-clave]') && /Cada clave va con su servicio/.test(document.getElementById('dlgIA').textContent);`), JSON.stringify({ hayClave: cOtro.hayClave, otras: cOtro.otrasClaves }));
    comprobar('y sin su precio no llama', /precio/i.test(await js(`return document.getElementById('dlgIA').textContent;`)) && (await js(`return JSON.stringify(await window.editorAPI.ia.chat({ mensajes: [{ role: 'user', content: 'hola' }] }));`)).includes('sinPrecio'));
    await aClic(`document.querySelector('#dlgIA [data-ia-proveedor="apimart"]')`, { tras: 400 });
    comprobar('de vuelta a APIMart, su clave', JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`)).hayClave === true);
    await aClic(`[...document.querySelectorAll('#dlgIA [data-ia-cerrar]')].pop()`, { tras: 300 });

    /* ---------- revisión: el tope diario lo lleva el proceso principal ---------- */
    const hoy0 = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`)).gastoHoy;
    comprobar('el proceso principal lleva el gasto del día', hoy0 > 0.01, String(hoy0));
    await js(`await window.editorAPI.ia.guardarConfig({ topeDiario: ${(hoy0 + 0.05).toFixed(3)} }); return true;`);
    S.cola.push({ texto: 'Una respuesta muy cara.', usage: { prompt_tokens: 200000, completion_tokens: 1000 } });
    await mandar('Algo que gaste mucho');
    await hastaLibre();
    const antesT = S.peticiones.length;
    await mandar('Y otra cosa');
    await hastaLibre();
    txt = await panelTxt();
    comprobar('al pasar el tope del día, no llama más y lo dice', S.peticiones.length === antesT && /tope de gasto de hoy/.test(txt), txt.slice(-300));
    await js(`await window.editorAPI.ia.guardarConfig({ topeDiario: 2 }); return true;`);

    /* ---------- la conversación se guarda en este equipo y vuelve al reabrir el proyecto ---------- */
    const nItems = (await items()).length;
    const guardada = await js(`return Object.keys(localStorage).filter(k => k.startsWith('guiones.claquedraw.asistente.') && k !== 'guiones.claquedraw.asistente').join('|');`);
    comprobar('la conversación ya no está en el localStorage', !guardada, guardada);
    const dirConv = path.join(DATOS, 'asistente');
    const enDisco = fs.existsSync(dirConv) ? fs.readdirSync(dirConv).map(f => fs.readFileSync(path.join(dirConv, f), 'utf8')) : [];
    comprobar('sino en los datos de la app (userData/asistente/), un archivo por proyecto, con su ruta', enDisco.length === 1 && enDisco[0].includes(JSON.stringify(ids.ruta).slice(1, -1)) && /llegada de Mara/.test(enDisco[0]),
      enDisco.length + ' archivos');
    comprobar('con tope (lo guardado, de menos de 300 KB) y sin la clave', enDisco.every(t => t.length < 320000 && !t.includes(CLAVE)));
    await sinClave('con la conversación');
    await js(`await Claquedraw.app.cerrar(); await W(800); return true;`);
    comprobar('cerrar el proyecto deja la ventana sin proyectos', await hasta(`return document.body.classList.contains('sin-proyectos');`, 4000));
    const buf = fs.readFileSync(ids.ruta);
    let archivo = ''; try { archivo = zlib.gunzipSync(buf).toString('utf8'); } catch (_) { archivo = buf.toString('utf8'); }
    comprobar('el .clapcraft no lleva la clave ni la conversación', archivo.length > 100 && !archivo.includes(CLAVE) && !archivo.includes(CLAVE.slice(0, 20)) && !archivo.includes('Escríbeme algo largo'));
    await js(`const r = Claquedraw.app.recientes().find(x => x.ruta === ${JSON.stringify(ids.ruta)}); await Claquedraw.app.abrirReciente(r.clave); await W(1200); return true;`);
    comprobar('se vuelve a abrir desde recientes', await hasta(`return !document.body.classList.contains('sin-proyectos') && !!Claquedraw.app.abiertoId();`, 5000));
    await js(`if (!${A}.abierto()) ${A}.abrir(); await W(500); return true;`);
    its = await items();
    comprobar('y la conversación sigue ahí', its.length === nItems && its.some(i => i.tipo === 'yo' && /llegada de Mara/.test(i.texto)) && /llegada a casa de su madre/.test(await panelTxt()), its.length + ' de ' + nItems);
    S.cola.push({ texto: 'Sí, me acuerdo.' });
    const antesSigue = S.peticiones.length;
    await mandar('¿Te acuerdas de lo que hicimos?');
    await hastaLibre();
    const sigue = S.peticiones[antesSigue];
    comprobar('y el modelo recibe lo de antes (la conversación sigue)', !!sigue && sigue.cuerpo.messages.some(m => m.role === 'user' && /llegada de Mara/.test(m.content || '')));
    await sinClave('al final');
    comprobar('todas las llamadas llevaron la clave solo en la cabecera', S.peticiones.every(p => p.auth === 'Bearer ' + CLAVE && !JSON.stringify(p.cuerpo).includes(CLAVE)));
    /* una conversación de antes (en el localStorage) se muda a los datos de la app la próxima vez que se carga */
    await js(`localStorage.setItem('guiones.claquedraw.asistente.p:de-antes', JSON.stringify({ version: 1, vista: [{ tipo: 'yo', texto: 'de antes' }] })); await ${A}.recargar(); await W(300); return true;`);
    const dirC = path.join(DATOS, 'asistente');
    comprobar('lo que hubiera en el localStorage se muda a userData y se borra de ahí', await js(`return localStorage.getItem('guiones.claquedraw.asistente.p:de-antes') === null;`)
      && fs.readdirSync(dirC).some(f => /de antes/.test(fs.readFileSync(path.join(dirC, f), 'utf8'))));
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
