/* Prueba EN VIVO del equipo de duendes del asistente (1.1.68): la app de verdad, con el ratón y el teclado de verdad, contra **la API
   de verdad** (DeepSeek por APIMart) con la clave de Leo. `electron pruebas/equipo-vivo-electron.js` (`npm run test:equipo-vivo-GASTA`).
   · La clave se lee de CLAPCRAFT_IA_CLAVE_ARCHIVO o de ~/.clapcraft-apimart-clave (si no existe, se salta y lo dice) y **nunca se
     imprime**: todo lo que sale pasa por `L()`.
   · Solo `deepseek-v4-flash` (el maestro, el lector y la escritora) y `deepseek-v4-pro` (el coordinador y los especiales). El `fetch`
     del proceso principal va espiado: cuenta lo que se gasta de verdad (el `usage` × el precio del motor, el de horario punta: el
     real puede ser la mitad) por caso y por duende, y **se niega a hacer otra petición** si el gasto llega a 0,27 USD (tope de la
     prueba: 0,30 USD, sumando lo de otras ejecuciones si `VIVO_GASTO` apunta a un archivo).
   · Tres casos: (a) «Maestro»: una pregunta corta, contesta solo el maestro; (b) «Equipo»: la escena de un nodo en el guion (lector,
     escritora, coordinador con v4-pro y su veredicto JSON, el formateador) escrita con `{{equipo:…}}`, y qué nombres o lugares
     aparecen que no estén en el proyecto; (c) «Mesa»: una crítica exigente (creada aquí) y el lector, una ronda y el resumen.
   · «[modelo]» marca lo que depende de lo que conteste el modelo. Sale con 0 si todo pasa, 2 si solo fallaron cosas del modelo y 1 si
     falló el producto. `VIVO_CAPTURAS=<carpeta>` guarda capturas del panel.
   Arranca electron/main.js tal cual con el almacenamiento en una carpeta temporal, los diálogos sustituidos, el portapapeles de
   mentira, `ia:abrirWeb` sustituido y el Llavero sustituido. No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ARCHIVO_CLAVE = process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO || path.join(os.homedir(), '.clapcraft-apimart-clave');
if (!fs.existsSync(ARCHIVO_CLAVE)) {
  console.log('Sin clave en ' + ARCHIVO_CLAVE + ': la prueba en vivo se salta.');
  app.whenReady().then(() => app.exit(0));
  return;
}
const CLAVE = (() => { try { return fs.readFileSync(ARCHIVO_CLAVE, 'utf8').trim(); } catch (_) { return ''; } })();
if (CLAVE.length < 8) { console.log('La clave de ' + ARCHIVO_CLAVE + ' está vacía: la prueba en vivo se salta.'); app.whenReady().then(() => app.exit(0)); return; }
const L = t => String(t == null ? '' : t).split(CLAVE).join('«la clave»').split(CLAVE.slice(0, 16)).join('«la clave»').replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-••••');

const MODELOS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const TOPE_PRUEBA = 0.30, PARAR_EN = 0.27;
const LIBRO = process.env.VIVO_GASTO || '';
const gastoPrevio = (() => { try { return +JSON.parse(fs.readFileSync(LIBRO, 'utf8')).usd || 0; } catch (_) { return 0; } })();
const CAPTURAS = process.env.VIVO_CAPTURAS || '';
const CASOS = process.env.VIVO_CASOS || 'abcd';                 // qué casos se corren (p. ej. VIVO_CASOS=d)

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-equipo-vivo-'));
const DATOS = path.join(TMP, 'datos');
process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO = ARCHIVO_CLAVE;
delete process.env.CLAPCRAFT_IA_URL;
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

/* ---------- el espía del fetch del proceso principal ---------- */
const { asistenteMotor: MOTOR } = require('../js/claquedraw/asistente-motor.js');
const G = { usd: 0, llamadas: [], negadas: 0, caso: 'preparar' };
const gastoTotal = () => gastoPrevio + G.usd;
function apuntarLibro() { if (!LIBRO) return; try { fs.writeFileSync(LIBRO, JSON.stringify({ usd: gastoTotal(), fecha: new Date().toISOString() })); } catch (_) {} }
function leerRespuesta(txt) {
  const out = { usage: null, texto: '', herramientas: [] };
  const trozos = [];
  if (/^\s*data:/m.test(txt)) {
    txt.split(/\r?\n/).forEach(l => { const m = /^data:\s*(.*)$/.exec(l); if (m && m[1] && m[1] !== '[DONE]') { try { trozos.push(JSON.parse(m[1])); } catch (_) {} } });
  } else { try { trozos.push(JSON.parse(txt)); } catch (_) {} }
  const tc = [];
  trozos.forEach(x => {
    const o = x && x.data && x.data.choices ? x.data : x;
    if (!o) return;
    if (o.usage) out.usage = o.usage;
    (o.choices || []).forEach(c => {
      const d = c.delta || c.message || {};
      if (typeof d.content === 'string') out.texto += d.content;
      (d.tool_calls || []).forEach((t, k) => {
        const i = t.index != null ? t.index : k;
        tc[i] = tc[i] || { nombre: '', args: '' };
        if (t.function && t.function.name) tc[i].nombre += t.function.name;
        if (t.function && t.function.arguments) tc[i].args += t.function.arguments;
      });
    });
  });
  out.herramientas = tc.filter(Boolean);
  return out;
}
/* quién hace la petición, por su prompt de sistema (el de equipo.js y el de la mesa de asistente-motor.js) */
function quienDe(cuerpo) {
  const sis = String(((cuerpo.messages || [])[0] || {}).content || '');
  const nombre = (/Eres «([^»]+)»/.exec(sis) || [])[1] || '';
  if (/el lector del equipo de duendes/.test(sis)) return 'lector';
  if (/la escritora del equipo de duendes/.test(sis)) return 'escritora';
  if (/acaba de transformar el TEXTO ANTERIOR/.test(sis)) return 'coordinador (comprueba al especial)';
  if (/el coordinador del equipo de duendes de ClapCraft: el que veta/.test(sis)) return 'coordinador';
  if (/un duende especial del equipo/.test(sis)) return 'especial «' + nombre + '»';
  if (/un personaje de «/.test(sis)) return 'personaje «' + nombre + '»';
  if (/moderas la mesa de duendes/.test(sis)) return 'maestro (resume la mesa)';
  if (/un duende de la mesa de duendes/.test(sis)) return 'mesa «' + nombre + '»';
  return 'maestro';
}
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function (url, init) {
  if (/\/v1\/(user\/)?balance(\?|$)/.test(String(url))) return fetchDeVerdad(url, init);
  let cuerpo = {}; try { cuerpo = JSON.parse((init && init.body) || '{}'); } catch (_) {}
  if (cuerpo.model && !MODELOS.includes(cuerpo.model)) { G.negadas++; throw new Error('La prueba solo usa ' + MODELOS.join(' y ') + ' (pidió ' + cuerpo.model + ')'); }
  if (gastoTotal() >= PARAR_EN) { G.negadas++; throw new Error('Tope de gasto de la prueba alcanzado'); }
  const reg = { caso: G.caso, quien: quienDe(cuerpo), modelo: cuerpo.model, stream: !!cuerpo.stream, herrOfrecidas: (cuerpo.tools || []).map(t => t.function && t.function.name),
    mensajes: cuerpo.messages || [], estado: 0, usage: null, usd: 0, texto: '', herramientas: [] };
  reg.base = JSON.stringify(cuerpo.tools || []).length + String(((cuerpo.messages || [])[0] || {}).content || '').length;   // el envío base (sistema + herramientas)
  reg.reintentoJson = reg.mensajes.some(m => m.role === 'user' && /no era un JSON válido/.test(String(m.content || '')));
  reg.prueba = reg.herrOfrecidas.includes('decir_hora') || /Contesta solo con la palabra/.test(String((reg.mensajes.slice(-1)[0] || {}).content || ''));
  G.llamadas.push(reg);
  const res = await fetchDeVerdad(url, init);
  reg.estado = res.status;
  reg.lista = res.clone().text().then(t => {
    const r = leerRespuesta(t);
    reg.usage = r.usage; reg.texto = r.texto; reg.herramientas = r.herramientas;
    reg.usd = r.usage ? MOTOR.costeDe(r.usage, reg.modelo) : 0;
    G.usd += reg.usd; apuntarLibro();
    if (!r.usage && res.status === 200) reg.sinUsage = true;
    if (res.status !== 200) reg.error = t.slice(0, 300);
  }).catch(() => { reg.cortada = true; });
  return res;
};

require('../electron/main.js');
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);
electron.shell.openExternal = async () => true;

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle, modelo) {
  resultados.push({ nombre, ok: !!ok, modelo: !!modelo });
  const d = detalle === undefined ? '' : L(detalle);
  console.log((ok ? '  ✔ ' : '  ✖ ') + (modelo ? '[modelo] ' : '') + nombre + (ok || !d ? '' : '\n      ' + d.slice(0, 1500)));
  return !!ok;
}
const corto = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > (n || 160) ? s.slice(0, n || 160) + '…' : s; };
const plano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* un objeto JSON dentro de un texto (como lo lee el motor: sin cerca, del primer «{» al último «}») */
function jsonDe(t) {
  let s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  return null;
}
async function gastoPor(caso) {
  const ls = G.llamadas.filter(l => l.caso === caso);
  await Promise.all(ls.map(l => l.lista));
  const por = {};
  ls.forEach(l => { const k = l.quien + ' · ' + l.modelo; por[k] = por[k] || { n: 0, usd: 0, entrada: 0, salida: 0 }; por[k].n++; por[k].usd += l.usd;
    por[k].entrada += l.usage ? +l.usage.prompt_tokens || 0 : 0; por[k].salida += l.usage ? +l.usage.completion_tokens || 0 : 0; });
  const total = ls.reduce((s, l) => s + l.usd, 0);
  const m0 = ls.find(l => l.quien === 'maestro');
  console.log('    gasto del caso «' + caso + '»: ' + total.toFixed(6) + ' USD en ' + ls.length + ' peticiones' + (m0 ? ' · envío base del maestro: ' + m0.base + ' caracteres' : ''));
  Object.keys(por).forEach(k => console.log('      · ' + k + ': ' + por[k].n + ' × → ' + por[k].usd.toFixed(6) + ' USD (' + por[k].entrada + ' → ' + por[k].salida + ' tokens)'));
  return { total, por, ls };
}

app.whenReady().then(async () => {
  let win = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 150) { if (await js(code)) return true; await espera(150); } return false; };
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
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(80);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const escribir = async t => { win.webContents.insertText(t); await espera(120); };
  const D = `Claquedraw.gestor.documentos()`;
  const A = `Claquedraw.asistente`;
  const items = () => js(`return JSON.stringify(${A}._estado().items);`).then(JSON.parse);
  const hastaLibre = ms => hasta(`return !${A}.trabajando();`, ms || 240000);
  const chips = () => js(`return JSON.stringify([...document.querySelectorAll('#asistente [data-as-dn] .as-dn-chip')].map(c => c.textContent.trim()));`).then(JSON.parse);
  async function mandar(texto) {
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir(texto);
    await tecla('Enter', [], 300);
  }
  const vivo = (nombre, args) => js(`const r = await Claquedraw.app.ejecutarEnVivo(${JSON.stringify(nombre)}, ${JSON.stringify(args)}, { origen: 'Claude', avisar: false }); await W(150);
    return JSON.stringify({ ok: r && r.ok !== false, error: r && (r.error || (r.ok === false ? r.texto : null)) });`).then(JSON.parse);
  async function captura(nombre) {
    if (!CAPTURAS) return;
    try { fs.mkdirSync(CAPTURAS, { recursive: true }); await espera(250); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); }
    catch (e) { console.log('    (no se pudo capturar ' + nombre + ': ' + L(e.message) + ')'); }
  }
  const tramoDesde = (its, re) => { const i = its.map((x, k) => (x.tipo === 'yo' && re.test(x.texto || '') ? k : -1)).filter(k => k >= 0).pop(); return i == null ? [] : its.slice(i); };
  const gastos = {};

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(L(msg)); console.log('    [página] ' + L(msg)); } });
    win.webContents.setBackgroundThrottling(false);
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', () => true);
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.asistente && Claquedraw.equipo && Claquedraw.equipoUI);`, 10000);
    console.log('\nClapCraft · el equipo de duendes EN VIVO (APIMart) en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)')
      + (gastoPrevio ? ' · gastado antes: ' + gastoPrevio.toFixed(6) + ' USD' : '') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);
    const cfg0 = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`));
    comprobar('la clave de pruebas está puesta y el maestro usa deepseek-v4-flash', cfg0.hayClave === true && cfg0.modelo === 'deepseek-v4-flash', JSON.stringify({ hayClave: cfg0.hayClave, modelo: cfg0.modelo }));

    /* ---------- el proyecto: «Piloto» con 4 nodos, dos personajes (Mara y Tomás) y el principio del guion ---------- */
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Andén', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas[0];
      return JSON.stringify({ cid: c.id, eid: e.id, nPrincipal: e.datos.lineas[0].nombre });`));
    const r1 = await vivo('editar_proyecto', { operaciones: [
      { op: 'renombrar_esquema', esquema: ids.eid, nombre: 'Piloto' },
      { op: 'crear_personaje', nombre: 'Mara', color: 'azul' },
      { op: 'crear_personaje', nombre: 'Tomás', color: 'verde' }] });
    const r2 = await vivo('editar_esquema', { esquema: ids.eid, operaciones: [
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 1, titulo: 'Mara llega en el último tren', descripcion: 'De noche, en la estación del pueblo. Llueve. Mara baja con una maleta vieja; nadie la espera.' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 2, titulo: 'Tomás en el andén', descripcion: 'Tomás, su hermano, llega tarde con un paraguas roto. Se miran sin saber qué decir. Mara le reprocha que no contestara sus cartas; Tomás le dice que su madre está enferma. Terminan compartiendo el paraguas.' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 3, titulo: 'El camino a casa', descripcion: 'Caminan en silencio por la calle mayor mojada.' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 4, titulo: 'La casa a oscuras', descripcion: 'La casa familiar tiene la luz cortada.' }] });
    const r3 = await vivo('escribir_documento', { esquema: ids.eid, contenido: 'EXT. ESTACIÓN DEL PUEBLO - NOCHE\n\nLlueve sobre el andén vacío. El último tren se detiene. MARA baja con una maleta vieja. Mira alrededor: nadie la espera.' });
    const nP = await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.length;`);
    const elenco = JSON.parse(await js(`return JSON.stringify((${D}.datos.elenco || []).map(p => p.nombre));`));
    comprobar('el proyecto de la prueba: «Piloto» con 4 nodos, Mara y Tomás, y el principio del guion', r1.ok && r2.ok && r3.ok && nP === 4 && elenco.includes('Mara') && elenco.includes('Tomás'),
      JSON.stringify({ r1, r2, r3, nP, elenco }));
    await js(`Claquedraw.app.montarEsquema(${JSON.stringify(ids.eid)}); Claquedraw.app.vista('esquema'); await W(400); return true;`);

    /* la crítica exigente: un especial con personalidad marcada, en el almacén global de esta prueba */
    const critica = JSON.parse(await js(`const E = Claquedraw.equipo; const eq = await Claquedraw.equipoUI.leer();
      const r = E.crearEspecial(eq, { nombre: 'La crítica exigente', personalidad: 'Eres una crítica de cine exigente, seca y un poco gruñona. Te fijas en el ritmo, en los diálogos que explican demasiado y en los clichés; siempre señalas al menos un defecto concreto y propones cómo arreglarlo. Nunca elogias sin un pero.', rol: 'revisar', veto: true });
      if (!r.ok) return JSON.stringify({ error: r.error });
      await window.editorAPI.equipo.escribir(r.equipo); await Claquedraw.equipoUI.recargar(); await W(200);
      const d = E.duendeDe(Claquedraw.equipoUI.equipo(), r.duende.id); return JSON.stringify({ id: r.duende.id, modelo: d && d.modelo });`));
    comprobar('«La crítica exigente» en el equipo, con deepseek-v4-pro', critica.id && critica.modelo === 'deepseek-v4-pro', JSON.stringify(critica));

    /* el panel */
    await aClic(`document.querySelector('#rows .row .track')`, { tras: 150 });
    await tecla('I', ['meta', 'shift'], 500);
    comprobar('Cmd+Shift+I abre el panel', await hasta(`return ${A}.abierto();`, 3000));

    let its = [], tramo = [];
    /* ---------- (a) Maestro ---------- */
    if (CASOS.includes('a')) {
    console.log('\n(a) Modo «Maestro»');
    G.caso = 'maestro';
    comprobar('de partida, «Maestro»', await hasta(`const b = document.querySelector('#asistente [data-as-modo="maestro"]'); return !!b && b.classList.contains('on');`, 3000));
    await mandar('En una sola frase: ¿qué hace un guionista?');
    comprobar('termina', await hastaLibre(90000));
    its = await items();
    tramo = tramoDesde(its, /guionista/);
    const respA = tramo.filter(i => i.tipo === 'ia').map(i => i.texto || '').join('\n');
    const gA = await gastoPor('maestro');
    gastos.maestro = gA;
    comprobar('sin error en el panel', !tramo.some(i => i.tipo === 'error'), JSON.stringify(tramo.filter(i => i.tipo === 'error')));
    comprobar('contesta solo el maestro (con deepseek-v4-flash), sin la herramienta del equipo', gA.ls.length >= 1 && gA.ls.every(l => l.quien === 'maestro' && l.modelo === 'deepseek-v4-flash' && !l.herrOfrecidas.includes('trabajar_en_equipo')),
      JSON.stringify(gA.ls.map(l => [l.quien, l.modelo, l.herrOfrecidas.includes('trabajar_en_equipo')])));
    comprobar('y contesta algo', respA.trim().length > 10, respA, true);
    console.log('    respuesta: «' + L(corto(respA, 300)) + '»');
    await captura('a-maestro');
    }

    /* ---------- (b) Equipo ---------- */
    if (CASOS.includes('b')) {
    console.log('\n(b) Modo «Equipo»');
    G.caso = 'equipo';
    await aClic(`document.querySelector('#asistente [data-as-modo="equipo"]')`, { tras: 400 });
    comprobar('«Equipo»: el formateador elegido de partida', await hasta(`const c = [...document.querySelectorAll('#asistente [data-as-dn] .as-dn-chip')]; return c.length === 1 && /formateador/i.test(c[0].textContent);`, 3000), JSON.stringify(await chips()));
    const htmlAntes = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.html : '';`);
    await mandar('Escribe en el guion del esquema «Piloto» la escena del nodo «Tomás en el andén» y añádela al final del guion (después de lo que ya hay).');
    comprobar('termina', await hastaLibre(420000));
    its = await items();
    tramo = tramoDesde(its, /Tomás en el andén/);
    const gB = await gastoPor('equipo');
    gastos.equipo = gB;
    const pasoEq = tramo.find(i => i.tipo === 'paso' && i.nombre === 'trabajar_en_equipo');
    const pasosB = tramo.filter(i => i.tipo === 'paso').map(p => [p.nombre, p.estado]);
    comprobar('sin error en el panel', !tramo.some(i => i.tipo === 'error'), JSON.stringify(tramo.filter(i => i.tipo === 'error')));
    comprobar('el maestro encargó el texto al equipo (trabajar_en_equipo)', !!pasoEq, JSON.stringify(pasosB), true);
    const quienes = new Set(gB.ls.map(l => l.quien));
    comprobar('la cadena entera: lector, escritora, coordinador y el formateador', ['lector', 'escritora', 'coordinador'].every(q => quienes.has(q)) && [...quienes].some(q => /formateador/i.test(q)),
      JSON.stringify([...quienes]), true);
    const modeloDe = q => [...new Set(gB.ls.filter(l => l.quien === q).map(l => l.modelo))].join(',');
    comprobar('los modelos: coordinador deepseek-v4-pro; lector y escritora deepseek-v4-flash; el formateador deepseek-v4-pro',
      (!quienes.has('coordinador') || modeloDe('coordinador') === 'deepseek-v4-pro') && (!quienes.has('lector') || modeloDe('lector') === 'deepseek-v4-flash')
        && (!quienes.has('escritora') || modeloDe('escritora') === 'deepseek-v4-flash') && gB.ls.filter(l => /formateador/i.test(l.quien)).every(l => l.modelo === 'deepseek-v4-pro'),
      JSON.stringify(gB.ls.map(l => l.quien + ':' + l.modelo)));
    const coords = gB.ls.filter(l => /^coordinador/.test(l.quien));
    comprobar('APIMart acepta deepseek-v4-pro (todas sus peticiones con 200 y usage)', coords.length > 0 && coords.every(l => l.estado === 200 && l.usage), JSON.stringify(coords.map(l => [l.estado, !!l.usage, l.error])));
    const veredictos = coords.map(l => ({ quien: l.quien, v: jsonDe(l.texto), crudo: l.texto, reintento: l.reintentoJson }));
    comprobar('el veredicto JSON del coordinador se entiende (aprobado y problemas)', veredictos.length > 0 && veredictos.filter(v => !v.reintento).every(v => v.v && typeof v.v.aprobado !== 'undefined'),
      JSON.stringify(veredictos.map(v => v.crudo.slice(0, 300))), true);
    veredictos.forEach((v, k) => console.log('    veredicto ' + (k + 1) + ' (' + v.quien + (v.reintento ? ', tras pedir el JSON otra vez' : '') + '): ' + L(corto(v.crudo, 400))));
    if (pasoEq && pasoEq.equipo) {
      console.log('    el paso: ' + (pasoEq.equipo.rondas || 0) + ' rondas · ' + (pasoEq.equipo.problemas ?? '?') + ' correcciones · ' + (pasoEq.equipo.huecos || 0) + ' huecos · coste ' + (+pasoEq.equipo.coste || 0).toFixed(6) + ' USD');
      (pasoEq.equipo.eventos || []).forEach(e => console.log('      ' + (e.nombre || e.quien) + ' · ' + e.accion + (e.texto ? ': ' + L(corto(e.texto, 140)) : '')));
    }
    /* lo que devolvió la herramienta al maestro (el resumen y la referencia) */
    gB.ls.filter(l => l.quien === 'maestro').flatMap(l => l.herramientas).forEach(h => console.log('    el maestro pidió ' + h.nombre + ' ' + L(corto(h.args, 400))));
    if (pasoEq && pasoEq.equipo && (pasoEq.equipo.faltan || []).length) console.log('    fuentes que no se pudieron leer: ' + L(JSON.stringify(pasoEq.equipo.faltan)));
    const lectorPidio = gB.ls.find(l => l.quien === 'lector');
    comprobar('el lector recibió fuentes (el esquema y su guion)', !!lectorPidio && /La casa a oscuras/.test(JSON.stringify(lectorPidio.mensajes)) && /último tren se detiene/.test(JSON.stringify(lectorPidio.mensajes)),
      lectorPidio ? corto(JSON.stringify(lectorPidio.mensajes.slice(1)), 600) : 'sin lector', true);
    const toolMsg = (() => { for (const l of gB.ls) for (const m of l.mensajes) if (m.role === 'tool' && /\{\{equipo:/.test(String(m.content || ''))) return String(m.content); return ''; })();
    if (toolMsg) console.log('    lo que le devolvió al maestro: ' + L(corto(toolMsg, 500)));
    const escrito = gB.ls.flatMap(l => l.herramientas).filter(h => h.nombre === 'escribir_documento');
    comprobar('el maestro escribió con {{equipo:…}}', escrito.some(h => /\{\{equipo:[^}]+\}\}/.test(h.args)), JSON.stringify(escrito.map(h => corto(h.args, 200))), true);
    const htmlDespues = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.html : '';`);
    const textoDespues = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? Claquedraw.conversor.aTexto ? Claquedraw.conversor.aTexto(n.html, { modo: 'guion' }) : n.html.replace(/<[^>]+>/g, '\\n') : '';`).catch(() => '');
    const plain = htmlDespues.replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    comprobar('el guion cambió y lleva la escena, sin la referencia suelta', htmlDespues !== htmlAntes && !/\{\{equipo:/.test(htmlDespues) && /Tom[aá]s|TOM[AÁ]S/.test(plain), corto(plain, 600), true);
    comprobar('lo de antes sigue en el guion (se añadió, no se reemplazó)', /último tren se detiene/.test(plain), corto(plain, 400), true);
    console.log('    el guion ahora:\n' + L(plain.split('\n').filter(s => s.trim()).map(s => '      | ' + s).join('\n')).slice(0, 4000));
    /* ¿inventa? personajes (los bloques de personaje) y lugares (encabezados) que no están en el proyecto */
    const personajesGuion = JSON.parse(await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); const d = document.createElement('div'); d.innerHTML = n ? n.html : '';
      return JSON.stringify({ ch: [...d.querySelectorAll('p.sp-character')].map(p => p.textContent.trim()), esc: [...d.querySelectorAll('p.sp-scene')].map(p => p.textContent.trim()), huecos: (d.textContent.match(/\\[hueco[^\\]]*\\]/gi) || []), marcas: (d.textContent.match(/⟦[^⟧]*⟧/g) || []) });`));
    const conocidos = ['mara', 'tomas'];
    const nuevosPj = [...new Set(personajesGuion.ch.map(n => plano(n).replace(/\(.*$/, '').replace(/\s{2,}.*$/, '').trim()).filter(n => n && !conocidos.includes(n)))];
    const lugaresOk = ['estacion', 'anden', 'pueblo', 'calle', 'casa'];
    const nuevosLug = personajesGuion.esc.filter(s => !lugaresOk.some(l => plano(s).includes(l)));
    const mayus = [...new Set((plain.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b/g) || []).filter(w => !/^(Mara|Tomás|Tomas|Llueve|Mira|Nadie|El|La|Los|Las|Un|Una|No|Sí|Si|Se|Lo|Le|Me|Te|Qué|Que|Por|Pero|Y|Ya|Es|Está|Hay|Con|Sin|Del|Al|En|De|Su|Sus|Mi|Tu|Tú|Yo|Él|Ella|Eso|Esto|Esa|Ese|Aquí|Allí|Cuando|Como|Cómo|Dónde|Nunca|Siempre|Solo|Sólo|Bueno|Vamos|Mamá|Madre|Hermano|Hermana)$/.test(w)))];
    console.log('    personajes con bloque: ' + JSON.stringify(personajesGuion.ch) + ' · encabezados: ' + JSON.stringify(personajesGuion.esc));
    console.log('    huecos [hueco: …]: ' + JSON.stringify(personajesGuion.huecos) + ' · marcas ⟦…⟧: ' + JSON.stringify(personajesGuion.marcas));
    console.log('    otras palabras con mayúscula (para mirar si hay nombres inventados): ' + JSON.stringify(mayus.slice(0, 40)));
    comprobar('no aparecen personajes que no estén en el proyecto', !nuevosPj.length, JSON.stringify(nuevosPj), true);
    comprobar('los encabezados son de lugares del proyecto (estación, andén, pueblo, calle, casa)', !nuevosLug.length, JSON.stringify(nuevosLug), true);
    await captura('b-equipo');
    const respB = tramo.filter(i => i.tipo === 'ia').map(i => i.texto || '').join('\n');
    console.log('    respuesta del maestro: «' + L(corto(respB, 400)) + '»');
    }

    /* ---------- (c) Mesa ---------- */
    if (CASOS.includes('c')) {
    console.log('\n(c) Modo «Mesa»');
    G.caso = 'mesa';
    await aClic(`document.querySelector('#asistente [data-as-modo="mesa"]')`, { tras: 500 });
    comprobar('«Mesa» abre la lista de quiénes se sientan', await hasta(`const p = document.querySelector('#asistente .as-dn-pop'); return !!p && !!p.querySelector('[data-as-dn-op="lector"]') && !!p.querySelector('[data-as-dn-op="${critica.id}"]');`, 3000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="${critica.id}"]')`, { tras: 250 });
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="lector"]')`, { tras: 250 });
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-mesa-rondas="1"]')`, { tras: 250 });
    const resumenOn = await js(`const c = document.querySelector('#asistente .as-dn-pop [data-as-mesa-resumen]'); return !!c && c.checked;`);
    if (!resumenOn) await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-mesa-resumen]')`, { tras: 250 });
    comprobar('una ronda y «El maestro resume»', await js(`const p = document.querySelector('#asistente .as-dn-pop'); return p.querySelector('[data-as-mesa-rondas="1"]').classList.contains('on') && p.querySelector('[data-as-mesa-resumen]').checked;`));
    await tecla('Escape', [], 250);
    const ch = await chips();
    comprobar('dos a la mesa: la crítica y el lector', ch.length === 2 && /crítica/i.test(ch[0]) && /lector/i.test(ch[1]), JSON.stringify(ch));
    const histAntes = await js(`return Claquedraw.historial.lista(${D}).length;`);
    const htmlMesa = await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return n ? n.html : '';`);
    await mandar('¿Qué os parece la escena del andén que acaba de escribir el equipo? Sed breves.');
    comprobar('la mesa termina', await hastaLibre(300000));
    const gC = await gastoPor('mesa');
    gastos.mesa = gC;
    const turnos = gC.ls.filter(l => /^mesa|resume/.test(l.quien));
    const orden = [];
    turnos.forEach(l => { if (orden[orden.length - 1] !== l.quien) orden.push(l.quien); });
    comprobar('los turnos: la crítica, el lector y el maestro que resume', orden.length === 3 && /crítica/i.test(orden[0]) && /lector/i.test(orden[1]) && /resume/.test(orden[2]), JSON.stringify(orden));
    comprobar('cada uno con su modelo (la crítica v4-pro, el lector v4-flash)', turnos.filter(l => /crítica/i.test(l.quien)).every(l => l.modelo === 'deepseek-v4-pro') && turnos.filter(l => /lector/i.test(l.quien)).every(l => l.modelo === 'deepseek-v4-flash'),
      JSON.stringify(turnos.map(l => l.quien + ':' + l.modelo)));
    comprobar('en la mesa solo se lee', turnos.every(l => l.herrOfrecidas.every(n => !/^(editar_|escribir_|completar_|revertir_|trabajar_en_equipo|recordar_|olvidar_)/.test(n))), JSON.stringify([...new Set(turnos.flatMap(l => l.herrOfrecidas))]));
    comprobar('la mesa no escribió nada en el proyecto', await js(`const n = ${D}.documentoEsquema(${JSON.stringify(ids.eid)}); return (n ? n.html : '') === ${JSON.stringify(htmlMesa)} && Claquedraw.historial.lista(${D}).length === ${histAntes};`));
    its = await items();
    /* las burbujas de la mesa desde el mensaje de Leo (un duende que lee antes de contestar deja una burbuja antes y otra después) */
    const burbujas = tramoDesde(its, /escena del andén/).filter(i => i.tipo === 'ia' && i.quien);
    burbujas.forEach(b => console.log('    ' + (b.nombre || b.quien) + (b.resumen ? ' (resume)' : '') + (b.tono ? ' [' + b.tono + ']' : '') + ': «' + L(corto(b.texto, 500)) + '»'));
    comprobar('burbujas en el chat de la crítica, del lector y el resumen al final', burbujas.some(b => /crítica/i.test(b.nombre || '')) && burbujas.some(b => /lector/i.test(b.nombre || '')) && burbujas[burbujas.length - 1].resumen && burbujas.every(b => (b.texto || '').trim().length > 10),
      JSON.stringify(burbujas.map(b => [b.nombre, !!b.resumen, (b.texto || '').length])), true);
    const dCritica = burbujas.filter(b => /crítica/i.test(b.nombre || '')).map(b => b.texto).join('\n') ? { texto: burbujas.filter(b => /crítica/i.test(b.nombre || '')).map(b => b.texto).join('\n') } : null;
    comprobar('la crítica habla con su personalidad (señala un defecto)', !!dCritica && /(defecto|flojo|clich|sobra|explica|ritmo|pero|mejor|falta|débil|previsible|arregl)/i.test(dCritica.texto || ''), dCritica && dCritica.texto, true);
    await captura('c-mesa');
    }

    /* ---------- (d) Mesa con un personaje: una entrevista de una pregunta (§15) ---------- */
    if (CASOS.includes('d')) {
    console.log('\n(d) Mesa con un personaje (entrevista)');
    G.caso = 'personaje';
    const pj = JSON.parse(await js(`const d = ${D}; const p = d.elenco().find(x => x.nombre === 'Mara');
      const s = d.bibliotecaPersonaje(p.id, p.nombre), e = d.etiquetasDe(s.id).find(x => /hoja/i.test(x.nombre));
      const n = d.crearNota(s.id, e ? e.id : null, 'Quién es').nota;
      d.guardarNota(n.id, { html: '<p>Mara tiene treinta y cinco años, es fotógrafa en la ciudad y se fue del pueblo hace diez años tras pelearse con su madre. Habla poco y con ironía; no llora delante de nadie.</p>', title: 'Quién es' });
      Claquedraw.biblioteca.marcar(Claquedraw.app.abiertoId()); return JSON.stringify({ id: p.id });`));
    await aClic(`document.querySelector('#asistente [data-as-nueva]')`, { tras: 400 });
    await aClic(`document.querySelector('#asistente [data-as-modo="mesa"]')`, { tras: 500 });
    comprobar('la lista de la mesa ofrece a Mara en «Personajes»', await hasta(`const p = document.querySelector('#asistente .as-dn-pop'); return !!p && !!p.querySelector('[data-as-dn-op="pj:${pj.id}"]');`, 3000));
    await aClic(`document.querySelector('#asistente .as-dn-pop [data-as-dn-op="pj:${pj.id}"]')`, { tras: 300 });
    await tecla('Escape', [], 250);
    const chPj = await chips();
    comprobar('su chip, con deepseek-v4-flash', chPj.length === 1 && /Mara/.test(chPj[0]) && /v4-flash/.test(chPj[0]), JSON.stringify(chPj));
    await mandar('Mara, ¿por qué no volviste en diez años? Contéstame en dos frases.');
    comprobar('la entrevista termina', await hastaLibre(120000));
    const gD = await gastoPor('personaje');
    gastos.personaje = gD;
    comprobar('contesta solo Mara (una llamada, deepseek-v4-flash, sin herramientas; sin resumen)', gD.ls.length === 1 && /personaje «Mara»/.test(gD.ls[0].quien) && gD.ls[0].modelo === 'deepseek-v4-flash' && !gD.ls[0].herrOfrecidas.length,
      JSON.stringify(gD.ls.map(l => [l.quien, l.modelo, l.herrOfrecidas.length])));
    comprobar('en su sistema va su hoja', gD.ls[0] && /fotógrafa/.test(String((gD.ls[0].mensajes[0] || {}).content || '')));
    its = await items();
    const bPj = tramoDesde(its, /diez años/).filter(i => i.tipo === 'ia' && i.quien);
    const respD = bPj.map(b => b.texto).join('\n');
    console.log('    Mara: «' + L(corto(respD, 500)) + '»');
    comprobar('contesta en primera persona, con su hoja (su madre, el pueblo)', /\b(me|mi|yo|volví|fui|me fui)\b/i.test(respD) && /(madre|mamá|pueblo|pelea|discut)/i.test(respD), respD, true);
    await captura('d-personaje');
    }

    /* el coste del panel frente al usage */
    await Promise.all(G.llamadas.map(l => l.lista));
    const conv = G.llamadas.filter(l => !l.prueba && l.caso !== 'preparar');
    const esperado = conv.reduce((s, l) => s + l.usd, 0);
    const coste = JSON.parse(await js(`return JSON.stringify(${A}._estado().coste);`));
    comprobar('el coste del panel cuadra con el usage × el precio (' + esperado.toFixed(6) + ' USD)', Math.abs(coste.usd - esperado) <= Math.max(1e-6, esperado * 0.02), 'panel ' + coste.usd + ' · usage ' + esperado);
    comprobar('ninguna petición negada', !G.negadas, 'negadas ' + G.negadas);
    const pagina = await js(`let t = document.documentElement.outerHTML; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k + (localStorage.getItem(k) || ''); } return t;`);
    comprobar('la clave no está en la página ni en el localStorage', !pagina.includes(CLAVE) && !pagina.includes(CLAVE.slice(0, 16)));
    comprobar('la página no soltó errores', !errores.length, errores.join('\n'));
  } catch (e) {
    comprobar('la prueba no se rompió', false, e && e.stack);
  }
  await Promise.all(G.llamadas.map(l => l.lista)).catch(() => {});
  apuntarLibro();
  /* por modelo */
  const porModelo = {};
  G.llamadas.forEach(l => { porModelo[l.modelo] = (porModelo[l.modelo] || 0) + l.usd; });
  console.log('\nGasto por modelo: ' + Object.keys(porModelo).map(m => m + ' ' + porModelo[m].toFixed(6) + ' USD').join(' · '));
  console.log('Gasto por caso: ' + Object.keys(gastos).map(k => k + ' ' + gastos[k].total.toFixed(6) + ' USD').join(' · '));
  const mal = resultados.filter(r => !r.ok), malProducto = mal.filter(r => !r.modelo), malModelo = mal.filter(r => r.modelo);
  console.log('Gasto de esta ejecución: ' + G.usd.toFixed(6) + ' USD en ' + G.llamadas.length + ' peticiones (precio de horario punta)'
    + (gastoPrevio ? ' · con las anteriores: ' + gastoTotal().toFixed(6) + ' USD' : '') + ' · tope de la prueba ' + TOPE_PRUEBA + ' USD');
  console.log(mal.length ? mal.length + ' de ' + resultados.length + ' comprobaciones fallaron (' + malProducto.length + ' del producto, ' + malModelo.length + ' del modelo)'
    : 'Las ' + resultados.length + ' comprobaciones pasaron');
  borrarDespues(TMP);
  app.exit(malProducto.length ? 1 : malModelo.length ? 2 : 0);
});
