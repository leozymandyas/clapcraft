/* Prueba de la memoria de estilo (1.1.60) en la app de verdad, con el ratón y el teclado de verdad y **sin gastar**: el mismo servidor
   falso compatible con OpenAI que pruebas/asistente-electron.js (http local, `CLAPCRAFT_IA_URL`, el Llavero sustituido). El asistente
   recuerda una regla desde el chat (la del proyecto y la general, con su «Deshacer»); la IA escribe un guion, Leo lo corrige en el
   editor con el teclado y salen los pares; «Aprender ahora» los manda al modelo barato (respuesta falsa) y añade reglas; el diálogo
   edita, apaga, pasa de una memoria a otra, añade y borra; la petición siguiente al modelo lleva la memoria; lo automático con cinco
   correcciones; apagado y sin clave no se manda nada; el .clapcraft lleva la del proyecto y no los pares.
   `electron pruebas/memoria-electron.js`. No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-memoria-'));
const DATOS = path.join(TMP, 'datos');
const PUERTO = 47900 + (process.pid % 700);
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

/* ---------- el servidor falso compatible con OpenAI ---------- */
const S = { cola: [], peticiones: [], cortadas: 0 };
/* lo que manda la memoria de estilo para aprender: el modelo barato, sin herramientas, con su prompt; contesta lo que diga la prueba */
const APRENDE = b => b.model === 'deepseek-v3.2' && !(b.tools || []).length && /aprende el ESTILO/.test(((b.messages || [])[0] || {}).content || '');
const APRENDIDAS = [];
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
  siguiente();
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
    else if (APRENDE(b)) r = { texto: APRENDIDAS.shift() || '{"reglas":[]}', usage: { prompt_tokens: 1800, completion_tokens: 120 } };   // el modelo barato de la memoria
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
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height });`);
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

  const MU = `Claquedraw.memoriaUI`;
  const dlgAbierto = () => js(`const d = document.getElementById('dlgMemoria'); return !!d && d.open;`);
  const dlgTxt = () => js(`const d = document.getElementById('dlgMemoria'); return d ? d.innerText : '';`);
  const reglasP = () => js(`return JSON.stringify(${D}.memoriaEstilo());`).then(JSON.parse);
  const general = () => js(`return JSON.stringify(${MU}._estado().est.general);`).then(JSON.parse);
  const leerDatos = nombre => { try { return JSON.parse(fs.readFileSync(path.join(DATOS, nombre), 'utf8')); } catch (_) { return null; } };
  const peticionesAprender = () => S.peticiones.filter(p => APRENDE(p.cuerpo));

  try {
    await new Promise(r => (servidor.listening ? r() : servidor.once('listening', r)));
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + String(msg).split(CLAVE).join('«la clave»')); } });
    win.webContents.setBackgroundThrottling(false);
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', (_e, u) => { webs.push(String(u)); return true; });
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.asistente && Claquedraw.memoriaUI);`);
    console.log('\nClapCraft · la memoria de estilo en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);
    comprobar('el menú Claude lleva «Memoria de estilo…»', !!menu('Claude', 'Memoria de estilo…'));

    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Lluvia', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas[0];
      return JSON.stringify({ cid: c.id, eid: e.id, ruta: Claquedraw.app.archivo().ruta });`));
    comprobar('un proyecto con su esquema y su archivo', ids.eid && ids.ruta && fs.existsSync(ids.ruta), JSON.stringify(ids));
    await js(`await window.editorAPI.ia.guardarClave(${JSON.stringify(CLAVE)}); return true;`);

    /* ---------- el menú abre el diálogo (vacío), Esc lo cierra ---------- */
    menu('Claude', 'Memoria de estilo…').click();
    comprobar('Claude › Memoria de estilo… abre el diálogo', await hasta(`const d = document.getElementById('dlgMemoria'); return !!d && d.open && /De este proyecto/i.test(d.innerText) && /Lluvia/.test(d.innerText);`, 3000), await dlgTxt());
    comprobar('vacío, con sus dos memorias y «Aprender ahora (0…)» apagado', /Aún no hay reglas de este proyecto/.test(await dlgTxt()) && /Aún no hay reglas generales/.test(await dlgTxt())
      && await js(`return document.querySelector('#dlgMemoria [data-me-ahora]').disabled;`));
    comprobar('dice qué cuesta aprender y con qué modelo', await hasta(`return /deepseek-v3\\.2/.test(document.getElementById('dlgMemoria').innerText) && /USD cada vez/.test(document.getElementById('dlgMemoria').innerText);`, 3000), await dlgTxt());
    await tecla('Escape', [], 300);
    comprobar('Esc lo cierra', !(await dlgAbierto()));

    /* ---------- el asistente recuerda una regla desde el chat ---------- */
    await js(`${A}.abrir(); await W(300); return true;`);
    S.cola.push(
      { llamadas: [{ name: 'recordar_estilo', args: { regla: 'Diálogos secos, sin muletillas', ambito: 'proyecto', ejemplo: { antes: 'Bueno, pues, no sé.', despues: 'No sé.' } } }] },
      { llamadas: [{ name: 'recordar_estilo', args: { regla: 'Tutea al lector', ambito: 'general' } }] },
      { texto: 'Apuntado: diálogos secos, y tutearte.' });
    await mandar('Así no: más seco, sin muletillas. Y tutéame siempre.');
    await hastaLibre();
    let its = await items();
    const pasosM = its.filter(i => i.tipo === 'paso' && i.nombre === 'recordar_estilo');
    comprobar('dos pasos «Aprendió: …»', pasosM.length === 2 && pasosM.every(p => p.estado === 'hecho') && /^Aprendió: «Diálogos secos, sin muletillas»/.test(pasosM[0].titulo || '') && /^Aprendió: «Tutea al lector»/.test(pasosM[1].titulo || ''),
      JSON.stringify(pasosM.map(p => [p.titulo, p.estado, p.entrada])));
    comprobar('los dos con «Deshacer»', await js(`return [...document.querySelectorAll('#asistente .as-paso.escribe')].filter(p => /Aprendió/.test(p.textContent) && p.querySelector('[data-as-deshacer]')).length === 2;`));
    let rp = await reglasP();
    comprobar('la del proyecto, en el proyecto (con su ejemplo)', rp.length === 1 && rp[0].texto === 'Diálogos secos, sin muletillas' && rp[0].ejemplo && rp[0].ejemplo.despues === 'No sé.', JSON.stringify(rp));
    comprobar('y en el historial de Claude', await js(`return Claquedraw.historial.lista(${D}).some(e => e.herramienta === 'recordar_estilo' && /Aprendió/.test(e.titulo));`));
    comprobar('la general, en los datos de la app', await hasta(`return ${MU}._estado().est.general.some(r => r.texto === 'Tutea al lector');`, 2000)
      && await (async () => { await espera(500); const x = leerDatos('memoria-estilo.json'); return !!x && x.general.some(r => r.texto === 'Tutea al lector'); })());
    /* Deshacer del paso de la general */
    await aClic(`[...document.querySelectorAll('#asistente .as-paso.escribe')].find(p => /Tutea/.test(p.textContent)).querySelector('[data-as-deshacer]')`, { tras: 500 });
    comprobar('«Deshacer» del paso quita la general (y dice «Deshecho»)', (await general()).length === 0 && await js(`return [...document.querySelectorAll('#asistente .as-paso.deshecho')].some(p => /Tutea/.test(p.textContent));`));
    /* la siguiente petición lleva la memoria */
    S.cola.push({ texto: 'Vale.' });
    let antes = S.peticiones.length;
    await mandar('¿Qué tal?');
    await hastaLibre();
    let sis = ((S.peticiones[antes] || {}).cuerpo || { messages: [{}] }).messages[0].content || '';
    comprobar('la siguiente petición lleva la memoria en el sistema', /## ESTILO DE LEO[\s\S]*- Diálogos secos, sin muletillas \(p\. ej\. «Bueno, pues, no sé\.» → «No sé\.»\)/.test(sis) && !/Tutea al lector/.test(sis), sis.slice(sis.indexOf('ESTILO') - 10, sis.indexOf('ESTILO') + 300));
    comprobar('y las herramientas recordar_estilo / olvidar_estilo', ['recordar_estilo', 'olvidar_estilo'].every(n => S.peticiones[antes].cuerpo.tools.some(t => t.function.name === n)));

    /* ---------- la IA escribe un guion; Leo lo corrige en el editor con el teclado ---------- */
    const GUION = 'INT. COCINA - NOCHE\n\nMara entra lentamente en la cocina, visiblemente cansada.\n\nMARA\nBueno, pues, la verdad es que no sé qué decirte.\n\nPedro se sienta despacio en la silla, claramente nervioso.\n\nAfuera llueve con fuerza.';
    S.cola.push({ llamadas: [{ name: 'escribir_documento', args: { esquema: ids.eid, contenido: GUION, como: 'guion' } }] }, { texto: 'Escrita la escena.' });
    await mandar('Escribe la escena de la cocina');
    await hastaLibre();
    const nid = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.id : null;`);
    comprobar('la IA escribió el guion', !!nid && await js(`return /visiblemente cansada/.test(${D}.nota(${JSON.stringify(nid)}).html);`));
    comprobar('lo que escribió se sigue (por bloques, en los datos de la app)', await js(`const x = ${MU}._estado().escritos.docs[${JSON.stringify(nid)}]; return !!x && x.registro.bloques.length === 6 && x.registro.bloques.some(b => b.quien === 'Mara');`)
      && await (async () => { await espera(500); const x = leerDatos('memoria-escritos.json'); return !!x && !!x.docs[nid]; })());
    await js(`${A}.cerrar(); await W(200); return true;`);
    const r0 = await js(`return JSON.stringify(await Claquedraw.app.ejecutarEnVivo('mostrar_en_clapcraft', { esquema: ${JSON.stringify(ids.eid)}, documento: true }));`);
    comprobar('el guion se abre en el editor', await hasta(`const f = document.getElementById('editorMarco'); const d = f && f.contentDocument; return !!d && /visiblemente cansada/.test((d.getElementById('editor') || {}).innerHTML || '');`, 6000), r0);
    /* elegir el texto de un bloque en el editor (como con un triple clic) y escribir encima con el teclado */
    async function corregir(buscar, nuevo) {
      const ok = await js(`const f = document.getElementById('editorMarco'), w = f.contentWindow, d = w.document, ed = d.getElementById('editor');
        const p = [...ed.children].find(x => x.textContent.includes(${JSON.stringify(buscar)})); if (!p) return false;
        w.focus(); ed.focus(); const r = d.createRange(); r.selectNodeContents(p); const s = w.getSelection(); s.removeAllRanges(); s.addRange(r); return true;`);
      if (!ok) return false;
      win.webContents.focus(); await espera(60);
      win.webContents.insertText(nuevo); await espera(200);
      return true;
    }
    comprobar('Leo corrige tres bloques con el teclado', await corregir('visiblemente cansada', 'Mara entra. Cansada.') && await corregir('Bueno, pues', 'No sé qué decirte.')
      && await corregir('claramente nervioso', 'Pedro se sienta. Nervioso.') && await corregir('llueve con fuerza', 'Afuera llueve con fuerzaa.'));
    comprobar('y se guarda en el documento', await hasta(`const h = ${D}.nota(${JSON.stringify(nid)}).html; return /Mara entra\\. Cansada\\./.test(h) && /Pedro se sienta\\. Nervioso\\./.test(h) && /No sé qué decirte/.test(h) && !/Bueno, pues/.test(h);`, 6000),
      await js(`return ${D}.nota(${JSON.stringify(nid)}).html;`));
    const nPend = await js(`return ${MU}.pendientes(false);`);
    comprobar('salen tres correcciones (la errata no cuenta) y ninguna es «madura» todavía', nPend === 3 && await js(`return ${MU}.pendientes(true);`) === 0, String(nPend));
    comprobar('lo automático no manda nada antes de 5 (ni con documentos que se acaban de tocar)', !(await js(`return ${MU}.revisar();`)) && !peticionesAprender().length);

    /* ---------- el diálogo desde el botón del panel del asistente; «Aprender ahora» ---------- */
    await js(`${A}.abrir(); await W(300); return true;`);
    await aClic(`document.querySelector('#asistente [data-as-memoria]')`, { tras: 500 });
    comprobar('el botón de la cabecera del asistente abre la memoria', await hasta(`const d = document.getElementById('dlgMemoria'); return !!d && d.open;`, 3000));
    comprobar('con la regla del proyecto y «Aprender ahora (3 correcciones pendientes)»', await hasta(`const t = document.getElementById('dlgMemoria').innerText; return /Diálogos secos, sin muletillas/.test(t) && /Aprender ahora \\(3 correcciones pendientes\\)/.test(t) && !document.querySelector('#dlgMemoria [data-me-ahora]').disabled;`, 3000), await dlgTxt());
    await aClic(`document.querySelector('#dlgMemoria .me-pares summary')`, { tras: 200 });
    comprobar('las correcciones pendientes se ven (lo de la IA → lo de Leo)', /Mara entra lentamente[\s\S]*→[\s\S]*Mara entra\. Cansada\./.test(await dlgTxt()));
    APRENDIDAS.push(JSON.stringify({ reglas: [{ texto: 'Acotaciones cortas, sin adverbios', ambito: 'proyecto', ejemplo: { antes: 'Mara entra lentamente en la cocina', despues: 'Mara entra.' } }, { texto: 'Frases cortas, a veces de una palabra', ambito: 'general' }, { texto: 'Diálogos muy secos y sin muletillas', ambito: 'proyecto' }] }));
    antes = S.peticiones.length;
    await aClic(`document.querySelector('#dlgMemoria [data-me-ahora]')`, { tras: 300 });
    comprobar('«Aprender ahora» avisa «Aprendí 2 cosas de tu estilo»', await hasta(`return /Aprendí 2 cosas de tu estilo/.test(document.getElementById('aviso').textContent);`, 6000), await js(`return document.getElementById('aviso').textContent;`));
    const pa = S.peticiones.slice(antes).find(p => APRENDE(p.cuerpo));
    comprobar('una sola llamada, al modelo barato (deepseek-v3.2), sin herramientas y con la clave solo en la cabecera', S.peticiones.slice(antes).length === 1 && !!pa && pa.auth === 'Bearer ' + CLAVE && !JSON.stringify(pa.cuerpo).includes(CLAVE),
      JSON.stringify(S.peticiones.slice(antes).map(p => p.cuerpo.model)));
    const um = pa ? pa.cuerpo.messages[1].content : '';
    comprobar('con las reglas que ya hay y los tres pares (el de MARA, con su nombre)', /\[proyecto\] Diálogos secos, sin muletillas/.test(um) && (um.match(/\n\d+\. \[/g) || []).length === 3 && /\[diálogo de Mara\]\n   IA:  «Bueno, pues, la verdad es que no sé qué decirte\.»\n   Leo: «No sé qué decirte\.»/.test(um) && !/fuerzaa/.test(um), um);
    rp = await reglasP();
    comprobar('la nueva del proyecto entra; la parecida cuenta una vez más', rp.length === 2 && rp.some(r => r.texto === 'Acotaciones cortas, sin adverbios' && r.origen === 'correccion') && rp.some(r => /Diálogos muy secos/.test(r.texto) && r.veces === 2), JSON.stringify(rp.map(r => [r.texto, r.veces, r.origen])));
    comprobar('la general, en la general', (await general()).some(r => r.texto === 'Frases cortas, a veces de una palabra' && r.origen === 'correccion'));
    comprobar('las correcciones ya no están pendientes (se borran al aprender)', await js(`return ${MU}.pendientes(false);`) === 0 && await hasta(`return /Aprender ahora \\(0 correcciones pendientes\\)/.test(document.getElementById('dlgMemoria').innerText);`, 2000));
    comprobar('y dice lo que costó', /Última vez:[\s\S]*2 reglas nuevas · (?:0,0\d+|<0,001) USD/.test(await dlgTxt()), (await dlgTxt()).slice(-400));

    /* ---------- el diálogo: editar con doble clic, apagar, pasar a general, añadir y borrar ---------- */
    const pRegla = (texto, dentro) => `[...document.querySelectorAll('#dlgMemoria [data-me-regla]')].find(li => li.querySelector('.me-texto, .me-edit') && (li.querySelector('.me-texto') ? li.querySelector('.me-texto').textContent : li.querySelector('.me-edit').value).includes(${JSON.stringify(texto)}))${dentro ? '.querySelector(' + JSON.stringify(dentro) + ')' : ''}`;
    await espera(300);
    const pt = await centro(pRegla('Acotaciones cortas', '.me-texto'));
    ev({ type: 'mouseMove', x: R(pt.x), y: R(pt.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(pt.x), y: R(pt.y), button: 'left', clickCount: 1 }); await espera(40); ev({ type: 'mouseUp', x: R(pt.x), y: R(pt.y), button: 'left', clickCount: 1 }); await espera(120);
    ev({ type: 'mouseDown', x: R(pt.x), y: R(pt.y), button: 'left', clickCount: 2 }); await espera(40); ev({ type: 'mouseUp', x: R(pt.x), y: R(pt.y), button: 'left', clickCount: 2 }); await espera(300);
    comprobar('doble clic en una regla la deja editar', await hasta(`return !!document.querySelector('#dlgMemoria [data-me-edit]') && document.activeElement === document.querySelector('#dlgMemoria [data-me-edit]');`, 2000));
    await tecla('a', ['meta'], 60);
    await escribir('Acotaciones en presente y de una línea');
    await tecla('Enter', [], 300);
    rp = await reglasP();
    comprobar('Enter la guarda (y pasa a ser «A mano»)', rp.some(r => r.texto === 'Acotaciones en presente y de una línea' && r.origen === 'manual') && !(await js(`return !!document.querySelector('#dlgMemoria [data-me-edit]');`)), JSON.stringify(rp.map(r => [r.texto, r.origen])));
    comprobar('y el diálogo sigue abierto', await dlgAbierto());
    await aClic(pRegla('Diálogos muy secos', '[data-me-on]'), { tras: 300 });
    rp = await reglasP();
    comprobar('la casilla la apaga (se tacha)', rp.some(r => /Diálogos muy secos/.test(r.texto) && r.apagada) && await js(`return ${pRegla('Diálogos muy secos')}.classList.contains('apagada');`));
    await aClic(pRegla('Acotaciones en presente', '[data-me-mover]'), { tras: 300 });
    comprobar('«A general» la pasa a la general', !(await reglasP()).some(r => /Acotaciones en presente/.test(r.texto)) && (await general()).some(r => /Acotaciones en presente/.test(r.texto)));
    await aClic(`document.querySelector('#dlgMemoria [data-me-nueva="proyecto"]')`, { tras: 100 });
    await escribir('Mara nunca dice «vale»');
    await tecla('Enter', [], 300);
    comprobar('escribir una regla y Enter la añade «A mano»', (await reglasP()).some(r => r.texto === 'Mara nunca dice «vale»' && r.origen === 'manual'));
    await aClic(pRegla('Frases cortas', '[data-me-borrar]'), { tras: 300 });
    comprobar('la papelera la borra', !(await general()).some(r => /Frases cortas/.test(r.texto)));
    await aClic(`document.querySelector('#dlgMemoria [data-me-cerrar]')`, { tras: 300 });
    comprobar('«Listo»/× cierra', !(await dlgAbierto()));
    /* las teclas no salen del diálogo: Supr con un nodo elegido en el tablero no lo borra */
    const rn = await js(`const e = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema; return JSON.stringify(Claquedraw.app.ejecutarEnVivo('editar_esquema', { esquema: ${JSON.stringify(ids.eid)}, operaciones: [{ op: 'crear_nodo', trama: e.datos.lineas[0].id, columna: 2, titulo: 'Mara llega' }] }, { avisar: false }));`);
    comprobar('un nodo en el esquema', /"ok":true/.test(rn), rn);
    const pid = await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos[0].id;`);
    await js(`await Claquedraw.app.ejecutarEnVivo('mostrar_en_clapcraft', { esquema: ${JSON.stringify(ids.eid)}, nodo: ${JSON.stringify(pid)} }, { avisar: false }); await W(400); return true;`);
    menu('Claude', 'Memoria de estilo…').click();
    await hasta(`const d = document.getElementById('dlgMemoria'); return !!d && d.open;`, 3000);
    await tecla('Delete', [], 200); await tecla('Backspace', [], 200);
    comprobar('Supr y Retroceso con el diálogo delante no borran el nodo elegido del tablero', await dlgAbierto() && await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.some(p => p.id === ${JSON.stringify(pid)});`));
    await tecla('Escape', [], 300);
    comprobar('y Esc cierra el diálogo sin soltar lo elegido en el tablero', !(await dlgAbierto()) && await js(`return !!document.querySelector('#board .pt.sel');`));

    /* ---------- la petición siguiente lleva la memoria editada ---------- */
    S.cola.push({ texto: 'Entendido.' });
    antes = S.peticiones.length;
    await mandar('Sigue con la escena');
    await hastaLibre();
    sis = ((S.peticiones[antes] || {}).cuerpo || { messages: [{}] }).messages[0].content || '';
    comprobar('la siguiente petición lleva lo editado: la del proyecto y la general, sin la apagada ni la borrada',
      /De este proyecto:\n- Mara nunca dice «vale»/.test(sis) && /Siempre \(de Leo, en todos sus proyectos\):\n- Acotaciones en presente y de una línea/.test(sis) && !/Diálogos muy secos/.test(sis) && !/Frases cortas/.test(sis),
      sis.slice(sis.indexOf('## ESTILO'), sis.indexOf('## ESTILO') + 500));

    /* ---------- lo automático: con cinco correcciones de un documento que ya no se toca ---------- */
    const GUION2 = ['Mara abre la puerta lentamente.', 'Pedro mira hacia fuera, visiblemente asustado.', 'Mara camina despacio hasta la ventana.', 'La lluvia golpea suavemente el cristal.', 'Pedro respira profundamente.', 'Mara cierra la ventana con cuidado.'].join('\n\n');
    const nota2 = await js(`return ${D}.crearSub(${JSON.stringify(ids.cid)}, 'Borradores').sub.id;`);
    S.cola.push({ llamadas: [{ name: 'editar_biblioteca', args: { biblioteca: nota2, operaciones: [{ op: 'crear_nota', titulo: 'Borrador', contenido: GUION2 }] } }] }, { texto: 'Hecho.' });
    await mandar('Escribe un borrador en la biblioteca');
    await hastaLibre();
    const n2 = await js(`const n = ${D}.datos.notas.find(x => x.titulo === 'Borrador'); return n ? n.id : null;`);
    comprobar('la IA crea una nota y se sigue lo que escribió', !!n2 && await js(`const x = ${MU}._estado().escritos.docs[${JSON.stringify(n2)}]; return !!x && x.registro.bloques.length === 6;`));
    await js(`const d = ${D}, n = d.nota(${JSON.stringify(n2)});
      d.guardarNota(n.id, { title: n.titulo, html: '<p>Mara abre la puerta.</p><p>Pedro mira fuera. Asustado.</p><p>Mara camina hasta la ventana.</p><p>La lluvia golpea el cristal.</p><p>Pedro respira.</p><p>Mara cierra la ventana con cuidado.</p>', characters: {} });
      n.modificado = Date.now() - 5 * 60 * 1000; return true;`);
    comprobar('cinco correcciones maduras', await js(`return ${MU}.pendientes(true);`) === 5, String(await js(`return ${MU}.pendientes(true);`)));
    await js(`await window.editorAPI.ia.borrarClave(); return true;`);
    comprobar('sin clave, lo automático no manda nada', !(await js(`return ${MU}.revisar(); `)) || await (async () => { await espera(600); return peticionesAprender().length === 1; })());
    await js(`await window.editorAPI.ia.guardarClave(${JSON.stringify(CLAVE)}); ${MU}.alProyecto(); return true;`);
    APRENDIDAS.push(JSON.stringify({ reglas: [{ texto: 'Nada de adverbios en -mente', ambito: 'general' }] }));
    comprobar('con clave, al mirar (cada 30 s) aprende solo', await js(`return ${MU}.revisar();`) && await hasta(`return /Aprendí una cosa de tu estilo/.test(document.getElementById('aviso').textContent);`, 6000) && peticionesAprender().length === 2);
    comprobar('lo aprendido solo, en la general', (await general()).some(r => r.texto === 'Nada de adverbios en -mente'));
    /* «Deshacer» del aviso */
    await aClic(`[...document.querySelectorAll('#aviso button')].find(b => /Deshacer/.test(b.textContent))`, { tras: 400 });
    comprobar('«Deshacer» del aviso lo quita', !(await general()).some(r => r.texto === 'Nada de adverbios en -mente'));

    /* ---------- apagado: ni se apunta ni se manda ---------- */
    menu('Claude', 'Memoria de estilo…').click();
    await hasta(`const d = document.getElementById('dlgMemoria'); return !!d && d.open;`, 3000);
    await aClic(`document.querySelector('#dlgMemoria [data-me-aprender]')`, { tras: 300 });
    comprobar('el interruptor «Aprender de mis correcciones» se apaga y se guarda', await js(`return ${MU}._estado().est.aprender === false;`) && await (async () => { await espera(500); const x = leerDatos('memoria-estilo.json'); return !!x && x.aprender === false; })(), await js(`const c = document.querySelector('#dlgMemoria [data-me-aprender]'); return JSON.stringify({ abierto: document.getElementById('dlgMemoria').open, c: c && c.checked, est: ${MU}._estado().est.aprender, r: c && JSON.stringify(c.getBoundingClientRect()) });`));
    await tecla('Escape', [], 300);
    S.cola.push({ llamadas: [{ name: 'escribir_documento', args: { esquema: ids.eid, contenido: 'EXT. CALLE - DÍA\n\nMara corre desesperadamente bajo la lluvia.', modo: 'anadir' } }] }, { texto: 'Añadido.' });
    await mandar('Añade una escena');
    await hastaLibre();
    comprobar('apagado, lo que escribe la IA no se apunta', await js(`const x = ${MU}._estado().escritos.docs[${JSON.stringify(nid)}]; return !x || !x.registro.bloques.some(b => /desesperadamente/.test(b.t));`));
    comprobar('ni se aprende solo', !(await js(`return ${MU}.revisar();`)) && peticionesAprender().length === 2);

    /* ---------- el archivo lleva la del proyecto, no lo de este equipo ---------- */
    await js(`await Claquedraw.app.guardar(); await W(1500); return true;`);
    const buf = fs.readFileSync(ids.ruta);
    let archivo = ''; try { archivo = zlib.gunzipSync(buf).toString('utf8'); } catch (_) { archivo = buf.toString('utf8'); }
    const docsA = JSON.parse(archivo).documentos;
    comprobar('el .clapcraft lleva la memoria del proyecto', Array.isArray(docsA.memoriaEstilo) && docsA.memoriaEstilo.some(r => r.texto === 'Mara nunca dice «vale»'), JSON.stringify(docsA.memoriaEstilo));
    comprobar('y no la general, los pares ni lo escrito por la IA (ni la clave)', !archivo.includes('Acotaciones en presente y de una línea') && !archivo.includes('"registro"') && !archivo.includes(CLAVE));
    const ea = leerDatos('memoria-estilo.json');
    comprobar('memoria-estilo.json: la general y las opciones, sin la clave', !!ea && ea.general.some(r => /Acotaciones en presente/.test(r.texto)) && !JSON.stringify(ea).includes(CLAVE)
      && (fs.statSync(path.join(DATOS, 'memoria-estilo.json')).mode & 0o077) === 0);
    await sinClave('al final');
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
