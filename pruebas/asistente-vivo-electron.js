/* Prueba EN VIVO del asistente con otra IA (1.1.59): la app de verdad, con el ratón y el teclado de verdad, contra **la API de
   verdad** (DeepSeek por APIMart) con la clave de Leo. `electron pruebas/asistente-vivo-electron.js`.
   · La clave se lee de CLAPCRAFT_IA_CLAVE_ARCHIVO o de ~/.clapcraft-apimart-clave (si no existe, se salta y lo dice) y **nunca se
     imprime**: todo lo que sale pasa por `L()`, y la prueba no enseña el diálogo de configuración en las capturas.
   · Solo `deepseek-v4-flash`. Tope de la conversación, 0,10 USD (puesto en el diálogo con el teclado). El `fetch` del proceso
     principal va espiado: cuenta lo que se gasta de verdad (el `usage` de cada respuesta × el precio del motor) y **se niega a hacer
     otra petición** si el gasto llega a 0,17 USD (el de esta ejecución más el de `VIVO_GASTO`, un archivo que suma entre ejecuciones:
     el tope de la prueba es 0,20 USD en total).
   · Cada comprobación dice si depende del modelo («[modelo]»: los modelos no son deterministas; una respuesta mala no es un fallo
     del producto) o del producto. Sale con 0 si todo pasa, 2 si solo fallaron cosas del modelo (se puede repetir) y 1 si falló el
     producto.
   · `VIVO_CAPTURAS=<carpeta>` guarda capturas del panel con la conversación.
   Arranca electron/main.js tal cual con el almacenamiento en una carpeta temporal, los diálogos sustituidos, el portapapeles de
   mentira, `ia:abrirWeb` sustituido y el Llavero sustituido. No forma parte de la aplicación ni del instalador. */
const electron = require('electron');
const { app, dialog, BrowserWindow, ipcMain, Menu, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const ARCHIVO_CLAVE = process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO || path.join(os.homedir(), '.clapcraft-apimart-clave');
if (!fs.existsSync(ARCHIVO_CLAVE)) {
  console.log('Sin clave en ' + ARCHIVO_CLAVE + ': la prueba en vivo se salta.');
  app.whenReady().then(() => app.exit(0));
  return;
}
const CLAVE = (() => { try { return fs.readFileSync(ARCHIVO_CLAVE, 'utf8').trim(); } catch (_) { return ''; } })();
if (CLAVE.length < 8) { console.log('La clave de ' + ARCHIVO_CLAVE + ' está vacía: la prueba en vivo se salta.'); app.whenReady().then(() => app.exit(0)); return; }
/* lo que sale, sin la clave (ni entera, ni su principio, ni nada que parezca una clave) */
const L = t => String(t == null ? '' : t).split(CLAVE).join('«la clave»').split(CLAVE.slice(0, 16)).join('«la clave»').replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-••••');

const MODELO = 'deepseek-v4-flash';
const TOPE_CONV = 0.10;                                           // el de la conversación (en la app)
const TOPE_PRUEBA = 0.20, PARAR_EN = 0.17;                        // el de la prueba entera (con lo de otras ejecuciones)
const LIBRO = process.env.VIVO_GASTO || '';
const gastoPrevio = (() => { try { return +JSON.parse(fs.readFileSync(LIBRO, 'utf8')).usd || 0; } catch (_) { return 0; } })();
const CAPTURAS = process.env.VIVO_CAPTURAS || '';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-asistente-vivo-'));
const DATOS = path.join(TMP, 'datos');
process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO = ARCHIVO_CLAVE;          // electron/ia.js la lee de ahí (la página no la ve)
delete process.env.CLAPCRAFT_IA_URL;                             // la API de verdad (APIMart)
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

/* ---------- el espía del fetch del proceso principal: lo que se gasta de verdad y el tope de la prueba ---------- */
const { asistenteMotor: MOTOR } = require('../js/claquedraw/asistente-motor.js');
const G = { usd: 0, llamadas: [], negadas: 0 };
const gastoTotal = () => gastoPrevio + G.usd;
function apuntarLibro() { if (!LIBRO) return; try { fs.writeFileSync(LIBRO, JSON.stringify({ usd: gastoTotal(), fecha: new Date().toISOString() })); } catch (_) {} }
/* una respuesta (SSE o JSON, plana o envuelta { code, data }) → { usage, texto, herramientas: [{ nombre, args }] } */
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
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function (url, init) {
  /* las consultas de saldo (GET /v1/user/balance y /v1/balance, 1.1.60) son gratis y no llevan modelo: no cuentan como peticiones */
  if (/\/v1\/(user\/)?balance(\?|$)/.test(String(url))) return fetchDeVerdad(url, init);
  let cuerpo = {}; try { cuerpo = JSON.parse((init && init.body) || '{}'); } catch (_) {}
  if (cuerpo.model && cuerpo.model !== MODELO) { G.negadas++; throw new Error('La prueba solo usa ' + MODELO + ' (pidió ' + cuerpo.model + ')'); }
  if (gastoTotal() >= PARAR_EN) { G.negadas++; throw new Error('Tope de gasto de la prueba alcanzado'); }
  const reg = { url: String(url), modelo: cuerpo.model, mensajes: (cuerpo.messages || []).length, conHerramientas: (cuerpo.tools || []).map(t => t.function && t.function.name),
    ultimo: cuerpo.messages ? cuerpo.messages[cuerpo.messages.length - 1] : null, estado: 0, usage: null, usd: 0, texto: '', herramientas: [] };
  reg.prueba = reg.conHerramientas.includes('decir_hora') || /Contesta solo con la palabra/.test((reg.ultimo && reg.ultimo.content) || '');
  G.llamadas.push(reg);
  const res = await fetchDeVerdad(url, init);
  reg.estado = res.status;
  const copia = res.clone();
  reg.lista = copia.text().then(t => {
    const r = leerRespuesta(t);
    reg.usage = r.usage; reg.texto = r.texto; reg.herramientas = r.herramientas;
    reg.usd = r.usage ? MOTOR.costeDe(r.usage, MODELO) : 0;
    G.usd += reg.usd; apuntarLibro();
    if (!r.usage && res.status === 200) reg.sinUsage = true;
  }).catch(() => { reg.cortada = true; });
  return res;
};

require('../electron/main.js');
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);
const webs = [];

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
/* `modelo`: la comprobación depende de lo que conteste el modelo (no del producto) */
function comprobar(nombre, ok, detalle, modelo) {
  resultados.push({ nombre, ok: !!ok, modelo: !!modelo });
  const d = detalle === undefined ? '' : L(detalle);
  console.log((ok ? '  ✔ ' : '  ✖ ') + (modelo ? '[modelo] ' : '') + nombre + (ok || !d ? '' : '\n      ' + d.slice(0, 1500)));
  return !!ok;
}
const corto = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > (n || 160) ? s.slice(0, n || 160) + '…' : s; };
/* lo que hizo el modelo en las llamadas desde `desde`: herramientas con sus argumentos y el texto */
async function resumenLlamadas(desde) {
  const ls = G.llamadas.slice(desde);
  await Promise.all(ls.map(l => l.lista));
  return ls.map((l, i) => '      ' + (i + 1) + '. [' + l.estado + '] ' + (l.usage ? (l.usage.prompt_tokens + '→' + l.usage.completion_tokens + ' tok, ' + (l.usage.prompt_cache_hit_tokens != null ? l.usage.prompt_cache_hit_tokens : ((l.usage.prompt_tokens_details || {}).cached_tokens || 0)) + ' en caché, ' + MOTOR.dinero(l.usd)) : 'sin usage')
    + (l.herramientas.length ? ' · pide ' + l.herramientas.map(h => h.nombre + ' ' + corto(h.args, 140)).join(' | ') : '')
    + (l.texto.trim() ? ' · dice «' + corto(l.texto, 220) + '»' : '')).map(L).join('\n');
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
  const escribir = async t => { win.webContents.insertText(t); await espera(120); };
  const D = `Claquedraw.gestor.documentos()`;
  const A = `Claquedraw.asistente`;
  const menu = (grupo, texto) => Menu.getApplicationMenu().items.find(i => i.label === grupo).submenu.items.find(i => i.label === texto);
  const panelTxt = () => js(`return document.getElementById('asistente').innerText;`);
  const items = () => js(`return JSON.stringify(${A}._estado().items);`).then(JSON.parse);
  const hastaLibre = ms => hasta(`return !${A}.trabajando();`, ms || 150000);
  async function mandar(texto) {
    await aClic(`document.querySelector('#asistente [data-as-campo]')`, { tras: 150 });
    await escribir(texto);
    await tecla('Enter', [], 300);
  }
  const vivo = (nombre, args) => js(`const r = await Claquedraw.app.ejecutarEnVivo(${JSON.stringify(nombre)}, ${JSON.stringify(args)}, { origen: 'Claude', avisar: false }); await W(150);
    return JSON.stringify({ ok: r && r.ok !== false, error: r && (r.error || (r.ok === false ? r.texto : null)) });`).then(JSON.parse);
  async function captura(nombre) {
    if (!CAPTURAS) return;
    try {
      fs.mkdirSync(CAPTURAS, { recursive: true });
      /* nada de la configuración a la vista: el diálogo cerrado */
      await js(`const d = document.getElementById('dlgIA'); if (d && d.open) d.close(); return true;`);
      await espera(250);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG());
    } catch (e) { console.log('    (no se pudo capturar ' + nombre + ': ' + L(e.message) + ')'); }
  }
  async function sinClave(donde) {
    const pagina = await js(`let t = document.documentElement.outerHTML; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k + (localStorage.getItem(k) || ''); } return t;`);
    comprobar('la clave no está en la página ni en el localStorage (' + donde + ')', !pagina.includes(CLAVE) && !pagina.includes(CLAVE.slice(0, 16)));
  }

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(L(msg)); console.log('    [página] ' + L(msg)); } });
    win.webContents.setBackgroundThrottling(false);
    ipcMain.removeHandler('ia:abrirWeb'); ipcMain.handle('ia:abrirWeb', (_e, u) => { webs.push(String(u)); return true; });
    win.setBounds({ x: 40, y: 40, width: 1440, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.asistente);`);
    console.log('\nClapCraft · el asistente EN VIVO (' + MODELO + ' por APIMart) en ' + TMP + (llaveroFalso ? ' (Llavero de mentira)' : ' (¡el Llavero de verdad!)')
      + (gastoPrevio ? ' · gastado antes: ' + MOTOR.dinero(gastoPrevio) : '') + '\n');
    comprobar('el Llavero está sustituido', llaveroFalso);

    /* ---------- el proyecto: un esquema «Piloto» (2 tramas, 4 nodos, una escena de guion) y un lienzo con «Resumir» ---------- */
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Vivo', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    let ids = JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0], e = c.esquemas[0];
      return JSON.stringify({ cid: c.id, eid: e.id, principal: e.datos.lineas[0].id, nPrincipal: e.datos.lineas[0].nombre, ruta: Claquedraw.app.archivo().ruta });`));
    const r1 = await vivo('editar_proyecto', { operaciones: [
      { op: 'renombrar_esquema', esquema: ids.eid, nombre: 'Piloto' },
      { op: 'crear_biblioteca', contenedor: ids.cid, nombre: 'Resúmenes', ref: 'b' },
      { op: 'crear_lienzo', contenedor: ids.cid, nombre: 'Taller', ref: 'l' }] });
    const r2 = await vivo('editar_esquema', { esquema: ids.eid, operaciones: [
      { op: 'crear_trama', nombre: 'Familia', tipo: 'secundaria', ref: 'f' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 1, titulo: 'Despertar' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 2, titulo: 'La carta' },
      { op: 'crear_nodo', trama: ids.nPrincipal, columna: 3, titulo: 'El viaje' },
      { op: 'crear_nodo', trama: '$f', columna: 2, titulo: 'La madre llama' }] });
    const r3 = await vivo('escribir_documento', { esquema: ids.eid, contenido: 'INT. COCINA - DÍA\n\nMARA lee una carta junto a la ventana.\n\nMARA\nNo puede ser.' });
    Object.assign(ids, JSON.parse(await js(`const d = ${D}, c = d.datos.contenedores[0];
      const sub = (c.subs || []).find(s => s.nombre === 'Resúmenes'), l = (c.lienzos || []).find(x => x.nombre === 'Taller');
      return JSON.stringify({ subId: sub && sub.id, lid: l && l.id });`)));
    const r4 = ids.lid ? await vivo('editar_lienzo', { lienzo: ids.lid, operaciones: [
      { op: 'crear_nodo', tipo: 'texto', texto: 'Mara recibe una carta de su madre y decide volver al pueblo donde creció, después de diez años sin hablarle.', ref: 't', x: 0, y: 0 },
      { op: 'crear_nodo', tipo: 'resumir', titulo: 'Resumen', instruccion: 'En una sola frase corta.', destino: { biblioteca: ids.subId }, ref: 'r', x: 420, y: 0 },
      { op: 'conectar', de: '$t', a: '$r' }] }) : { ok: false, error: 'sin lienzo' };
    Object.assign(ids, JSON.parse(await js(`const l = ${D}.lienzo(${JSON.stringify(ids.lid || '')}); const n = l && l.lienzo.nodos.find(x => x.tipo === 'resumir'); return JSON.stringify({ rid: n && n.id });`)));
    const nPuntos = await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.length;`);
    comprobar('el proyecto de la prueba: «Piloto» con 2 tramas y 4 nodos, su guion, una biblioteca y un lienzo con «Resumir»',
      r1.ok && r2.ok && r3.ok && r4.ok && nPuntos === 4 && ids.subId && ids.rid, JSON.stringify({ r1, r2, r3, r4, nPuntos, ids }));
    await js(`Claquedraw.app.montarEsquema(${JSON.stringify(ids.eid)}); Claquedraw.app.vista('esquema'); await W(400); return true;`);

    /* ---------- Configurar IA…: la clave de pruebas, el tope de la conversación con el teclado y «Probar conexión» ---------- */
    menu('Claude', 'Configurar IA…').click();
    comprobar('Configurar IA… abre su diálogo, con la clave de pruebas', await hasta(`const d = document.getElementById('dlgIA'); return !!d && d.open && !!d.querySelector('.as-clave-hay');`, 4000));
    const cfg0 = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`));
    comprobar('la página no recibe la clave: config() solo dice que la hay', !JSON.stringify(cfg0).includes(CLAVE) && cfg0.hayClave === true && cfg0.claveDePrueba === true && cfg0.modelo === MODELO,
      JSON.stringify({ hayClave: cfg0.hayClave, modelo: cfg0.modelo, claveDePrueba: cfg0.claveDePrueba }));
    await aClic(`document.querySelector('#dlgIA [data-ia-tope]')`, { tras: 120 });
    await tecla('End', [], 60);
    for (let i = 0; i < 8; i++) await tecla('Backspace', [], 40);
    await escribir(String(TOPE_CONV));
    await tecla('Tab', [], 600);
    const cfg1 = JSON.parse(await js(`return JSON.stringify(await window.editorAPI.ia.config());`));
    comprobar('el tope de la conversación queda en ' + TOPE_CONV + ' USD', Math.abs(cfg1.tope - TOPE_CONV) < 1e-9, 'tope: ' + cfg1.tope);
    const antesProbar = G.llamadas.length;
    await aClic(`document.querySelector('#dlgIA [data-ia-probar]')`, { tras: 300 });
    const probo = await hasta(`const r = document.querySelector('#dlgIA [data-ia-res]'); return !!r && /Funciona|funciona|No se pudo|no /.test(r.textContent) && !/Probando/.test(r.textContent) && r.textContent.trim().length > 20;`, 90000);
    const resProbar = await js(`return (document.querySelector('#dlgIA [data-ia-res]') || {}).textContent || '';`);
    comprobar('«Probar conexión» dice que funciona y que admite herramientas', probo && /funciona/i.test(resProbar) && /Admite herramientas/.test(resProbar), resProbar);
    console.log(await resumenLlamadas(antesProbar));
    comprobar('lo que se ve no tiene la clave', !L(resProbar).includes('«la clave»') && !resProbar.includes(CLAVE));
    await aClic(`[...document.querySelectorAll('#dlgIA [data-ia-cerrar]')].pop()`, { tras: 300 });
    comprobar('«Listo» cierra el diálogo', await js(`return !document.getElementById('dlgIA').open;`));

    /* ---------- el panel: Cmd+Shift+I ---------- */
    await aClic(`document.querySelector('#rows .row .track')`, { tras: 150 });
    await tecla('I', ['meta', 'shift'], 500);
    comprobar('Cmd+Shift+I abre el panel del asistente (sin tutorial: ya hay clave)', await hasta(`return ${A}.abierto() && document.getElementById('asistente').offsetWidth > 200 && !document.getElementById('dlgTutorialIA').open;`, 3000));

    /* ---------- 1) leer: «¿cuántos nodos tiene?» ---------- */
    const antes1 = G.llamadas.length;
    await mandar('Lee el esquema «Piloto» y dime cuántos nodos tiene');
    comprobar('el mensaje sale en el panel y se pone a trabajar', await hasta(`return ${A}._estado().items.some(i => i.tipo === 'yo' && /Piloto/.test(i.texto)) && ${A}.trabajando();`, 4000));
    const fin1 = await hastaLibre();
    comprobar('termina (sin quedarse colgado)', fin1);
    let its = await items();
    const desde1 = its.findIndex(i => i.tipo === 'yo' && /cuántos nodos/.test(i.texto));
    const tramo1 = its.slice(desde1);
    const pasos1 = tramo1.filter(i => i.tipo === 'paso');
    const texto1 = tramo1.filter(i => i.tipo === 'ia' || i.tipo === 'asistente' || i.tipo === 'texto').map(i => i.texto || '').join('\n') || (await panelTxt()).split('cuántos nodos tiene').pop();
    console.log('    lo que hizo el modelo (mensaje 1):\n' + await resumenLlamadas(antes1));
    { const u = (G.llamadas[antes1] || {}).usage; console.log('    el usage tal como llega (mensaje 1, primera llamada): ' + L(JSON.stringify(u))); }
    comprobar('sin error en el panel', !tramo1.some(i => i.tipo === 'error'), JSON.stringify(tramo1.filter(i => i.tipo === 'error')));
    comprobar('usa leer_esquema', pasos1.some(p => p.nombre === 'leer_esquema' && p.estado === 'hecho'), JSON.stringify(pasos1.map(p => [p.nombre, p.estado])), true);
    const plano1 = texto1.replace(/[*_]/g, '');
    comprobar('y contesta con el número correcto (4)', /\b(4|cuatro)\s+nodos\b/i.test(plano1) && !/tiene\s+(3|5|6|tres|cinco|seis)\s+nodos/i.test(plano1), corto(texto1, 400), true);
    comprobar('no cambió nada (solo leer)', await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.length;`) === 4);
    await captura('1-leer-esquema');

    /* ---------- 2) cambiar: «Añade un nodo «Llegada»…» ---------- */
    const antes2 = G.llamadas.length;
    const histAntes = await js(`return Claquedraw.historial.lista(${D}).length;`);
    await mandar('Añade un nodo «Llegada» en la trama principal, en la columna 5');
    comprobar('se pone a trabajar', await hasta(`return ${A}.trabajando();`, 4000));
    const fin2 = await hastaLibre();
    comprobar('termina', fin2);
    console.log('    lo que hizo el modelo (mensaje 2):\n' + await resumenLlamadas(antes2));
    its = await items();
    const tramo2 = its.slice(its.findIndex(i => i.tipo === 'yo' && /Llegada/.test(i.texto)));
    const pasos2 = tramo2.filter(i => i.tipo === 'paso');
    comprobar('sin error en el panel', !tramo2.some(i => i.tipo === 'error'), JSON.stringify(tramo2.filter(i => i.tipo === 'error')));
    const usoEditar = comprobar('usa editar_esquema', pasos2.some(p => p.nombre === 'editar_esquema' && p.estado === 'hecho'), JSON.stringify(pasos2.map(p => [p.nombre, p.estado, p.titulo])), true);
    const nodo = JSON.parse(await js(`const e = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema; const p = e.datos.puntos.find(x => /llegada/i.test(x.titulo || ''));
      return JSON.stringify(p ? { id: p.id, titulo: p.titulo, col: p.col, lineaId: p.lineaId } : null);`));
    const bienPuesto = !!nodo && nodo.lineaId === ids.principal && nodo.col === 4;
    comprobar('el nodo «Llegada» está en el esquema, en la trama principal y en la columna 5', bienPuesto, JSON.stringify(nodo), true);
    if (nodo) {
      comprobar('y se ve en el tablero (al momento, sin recargar)', await hasta(`return [...document.querySelectorAll('#board .pt')].some(p => /Llegada/i.test(p.textContent));`, 4000));
      comprobar('el paso que lo cambió lleva «Deshacer» y «Ver»', await js(`return [...document.querySelectorAll('#asistente .as-paso.escribe')].some(p => p.querySelector('[data-as-deshacer]') && p.querySelector('[data-as-ver]'));`));
      const hist = JSON.parse(await js(`return JSON.stringify(Claquedraw.historial.lista(${D}).map(e => ({ origen: e.origen, herramienta: e.herramienta, modo: e.modo, revertido: !!e.revertido })));`));
      const nuevas = hist.slice(0, Math.max(0, hist.length - histAntes)).concat(hist.slice(histAntes));
      comprobar('el historial de Claude lo apunta con su origen (DeepSeek), en vivo', hist.some(e => e.herramienta === 'editar_esquema' && /DeepSeek/.test(e.origen || '') && e.modo === 'vivo'), JSON.stringify(nuevas));
      await captura('2-nodo-llegada');
      await aClic(`[...document.querySelectorAll('#asistente .as-paso.escribe')].filter(p => p.querySelector('[data-as-deshacer]') && !p.classList.contains('deshecho')).pop().querySelector('[data-as-deshacer]')`, { tras: 800 });
      comprobar('«Deshacer» lo quita del esquema y del tablero', await hasta(`const e = ${D}.esquema(${JSON.stringify(ids.eid)}).esquema; return !e.datos.puntos.some(p => /llegada/i.test(p.titulo || '')) && ![...document.querySelectorAll('#board .pt')].some(p => /Llegada/i.test(p.textContent));`, 5000));
      comprobar('y deja los 4 de antes', await js(`return ${D}.esquema(${JSON.stringify(ids.eid)}).esquema.datos.puntos.length;`) === 4);
      comprobar('el paso dice «Deshecho» y la entrada del historial queda revertida', await js(`return !!document.querySelector('#asistente .as-paso.deshecho') && Claquedraw.historial.lista(${D}).some(e => e.revertido && e.herramienta === 'editar_esquema' && /DeepSeek/.test(e.origen || ''));`));
    } else if (usoEditar) comprobar('(editar_esquema se usó pero no hay nodo «Llegada»: ver arriba lo que pidió)', false, '', true);

    /* ---------- 3) un lienzo: «Ejecutar con IA» en «Resumir» ---------- */
    const antes3 = G.llamadas.length;
    await js(`Claquedraw.app.abrirLienzo(${JSON.stringify(ids.lid)}); await W(700); return true;`);
    const selIA = `document.querySelector('#lzNodos [data-lz-nodo="${ids.rid}"] [data-lz-ia]')`;
    comprobar('la operación «Resumir» lleva «Ejecutar con IA»', await hasta(`const b = ${selIA}; return !!b && /Ejecutar con IA/.test(b.textContent);`, 4000));
    await aClic(selIA, { tras: 200 });
    comprobar('mientras corre, el nodo está pendiente («Con IA…»)', await hasta(`const el = document.querySelector('#lzNodos [data-lz-nodo="${ids.rid}"]'); const e = el && el.querySelector('.lz-estado.pendiente'); return !!e && /Con IA/.test(e.textContent);`, 6000));
    const fin3 = await hastaLibre(200000);
    comprobar('termina', fin3);
    console.log('    lo que hizo el modelo (lienzo):\n' + await resumenLlamadas(antes3));
    const nodoR = JSON.parse(await js(`return JSON.stringify(${D}.lienzo(${JSON.stringify(ids.lid)}).lienzo.nodos.find(n => n.id === ${JSON.stringify(ids.rid)}));`));
    const notas = JSON.parse(await js(`return JSON.stringify((${D}.notasDe(${JSON.stringify(ids.subId)}) || []).map(n => ({ id: n.id, titulo: n.titulo, texto: (n.html || '').replace(/<[^>]+>/g, ' ').slice(0, 300) })));`));
    its = await items();
    const tramo3 = its.slice(its.map(i => i.tipo === 'yo').lastIndexOf(true));
    const pasos3 = tramo3.filter(i => i.tipo === 'paso');
    comprobar('usó ejecutar_nodo y completar_nodo', pasos3.some(p => p.nombre === 'ejecutar_nodo') && pasos3.some(p => p.nombre === 'completar_nodo'), JSON.stringify(pasos3.map(p => [p.nombre, p.estado])), true);
    comprobar('el nodo queda «hecho» con su salida', nodoR && nodoR.estado === 'hecho' && !!nodoR.salida, JSON.stringify(nodoR && { estado: nodoR.estado, salida: nodoR.salida, error: nodoR.error }), true);
    comprobar('con su nota creada en la biblioteca «Resúmenes»', notas.length >= 1 && (!nodoR || !nodoR.salida || !nodoR.salida.nota || notas.some(n => n.id === nodoR.salida.nota)), JSON.stringify(notas).slice(0, 600), true);
    if (nodoR && nodoR.estado === 'hecho') comprobar('y el lienzo lo enseña: «Hecho» y su salida', await hasta(`const el = document.querySelector('#lzNodos [data-lz-nodo="${ids.rid}"]'); return !!el && !!el.querySelector('.lz-estado.hecho') && !/Con IA/.test(el.textContent);`, 5000));
    else comprobar('si no quedó «hecho», al menos no se queda «Con IA…» colgado', await js(`const el = document.querySelector('#lzNodos [data-lz-nodo="${ids.rid}"]'); return !!el && !/Con IA/.test(el.textContent);`));
    if (notas[0]) console.log('    la nota: «' + L(corto(notas[0].titulo, 80)) + '» — ' + L(corto(notas[0].texto, 240)));
    await captura('3-lienzo-resumir');

    /* ---------- el coste: lo que enseña el panel frente al usage de verdad ---------- */
    await Promise.all(G.llamadas.map(l => l.lista));
    const conv = G.llamadas.filter(l => !l.prueba);
    const esperado = conv.reduce((s, l) => s + l.usd, 0);
    const coste = JSON.parse(await js(`return JSON.stringify(${A}._estado().coste);`));
    const costeTxt = await js(`return document.querySelector('#asistente [data-as-coste]').textContent;`);
    comprobar('todas las respuestas traen su usage', conv.every(l => l.usage || l.cortada || l.estado !== 200), conv.filter(l => !l.usage).length + ' sin usage');
    comprobar('el coste de la conversación cuadra con el usage × el precio (' + MOTOR.dinero(esperado) + ')', Math.abs(coste.usd - esperado) <= Math.max(1e-7, esperado * 0.01),
      'panel ' + coste.usd + ' · usage ' + esperado);
    comprobar('y la cabecera lo enseña («' + costeTxt + '»)', /\d/.test(costeTxt) && /\$|USD/.test(costeTxt) && coste.usd < TOPE_CONV, costeTxt);
    comprobar('los tokens del panel son los del usage', coste.entrada != null && coste.salida != null
      && Math.abs((coste.entrada + (coste.cache || 0)) - conv.reduce((s, l) => s + (l.usage ? +l.usage.prompt_tokens || 0 : 0), 0)) <= 1
      && Math.abs(coste.salida - conv.reduce((s, l) => s + (l.usage ? +l.usage.completion_tokens || 0 : 0), 0)) <= 1, JSON.stringify(coste));
    comprobar('todas las peticiones fueron a ' + MODELO + ' (ninguna negada)', G.llamadas.every(l => l.modelo === MODELO) && !G.negadas, JSON.stringify(G.llamadas.map(l => l.modelo)) + ' · negadas ' + G.negadas);

    await sinClave('al final');
    const iaJson = (() => { try { return fs.readFileSync(path.join(DATOS, 'ia.json'), 'utf8'); } catch (_) { return ''; } })();
    comprobar('ia.json no lleva la clave (la de pruebas no se guarda)', !iaJson.includes(CLAVE) && !iaJson.includes(CLAVE.slice(0, 16)));
    await js(`await Claquedraw.app.guardar?.(); await W(1500); return true;`).catch(() => true);
    try {
      const buf = fs.readFileSync(ids.ruta); let archivo = ''; try { archivo = zlib.gunzipSync(buf).toString('utf8'); } catch (_) { archivo = buf.toString('utf8'); }
      comprobar('el .clapcraft no lleva la clave', archivo.length > 100 && !archivo.includes(CLAVE) && !archivo.includes(CLAVE.slice(0, 16)));
    } catch (e) { comprobar('el .clapcraft se puede leer', false, e.message); }
    comprobar('la página no soltó errores', !errores.length, errores.join('\n'));
  } catch (e) {
    comprobar('la prueba no se rompió', false, e && e.stack);
  }
  await Promise.all(G.llamadas.map(l => l.lista)).catch(() => {});
  apuntarLibro();
  const mal = resultados.filter(r => !r.ok), malProducto = mal.filter(r => !r.modelo), malModelo = mal.filter(r => r.modelo);
  console.log('\nGasto de esta ejecución: ' + MOTOR.dinero(G.usd) + ' (' + G.usd.toFixed(6) + ' USD) en ' + G.llamadas.length + ' peticiones'
    + (gastoPrevio ? ' · con las anteriores: ' + gastoTotal().toFixed(6) + ' USD' : '') + ' · tope de la prueba ' + TOPE_PRUEBA + ' USD');
  console.log(mal.length ? mal.length + ' de ' + resultados.length + ' comprobaciones fallaron (' + malProducto.length + ' del producto, ' + malModelo.length + ' del modelo)'
    : 'Las ' + resultados.length + ' comprobaciones pasaron');
  borrarDespues(TMP);
  app.exit(malProducto.length ? 1 : malModelo.length ? 2 : 0);
});
