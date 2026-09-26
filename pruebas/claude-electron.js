/* Prueba de Claude con la app de verdad (Electron + disco): `npm run test:claude`.
   Arranca electron/main.js tal cual (con su propio almacenamiento en una carpeta temporal y los diálogos de guardar sustituidos),
   crea un proyecto con archivo y arranca el servidor MCP como lo arranca Claude: con el Node de la propia app
   (ELECTRON_RUN_AS_NODE) y hablándole por stdio. Comprueba:
   1. el puente: listar_proyectos y ver_proyecto ven el proyecto abierto, delante, y lo que hay en pantalla;
   2. editar_esquema en vivo: el tablero montado lo enseña al momento, el aviso lo dice, el archivo se escribe solo, el «Deshacer»
      del aviso lo devuelve todo y el Deshacer del tablero también sirve;
   3. escribir_documento con el documento abierto en el editor: el editor lo enseña, se guarda «Antes de Claude» y los personajes
      nuevos entran en el elenco;
   4. mostrar_en_clapcraft lleva la ventana al esquema con el nodo elegido;
   5. con la conexión apagada (menú Claude) no se escribe el proyecto abierto; encendida otra vez, sí;
   4c. con una nota de biblioteca abierta en su ventana (1.1.54): ver_proyecto la da en pantalla, Claude lee lo que se acaba de
      escribir en ella y lo que escribe Claude se ve en su campo;
   6. con el proyecto cerrado, Claude escribe su archivo y al volver a abrirlo desde recientes está lo de Claude;
   7. si el archivo cambia fuera con el proyecto abierto, la ventana lo relee; y si cambia con la ventana cerrada, al volver a
      abrirla se carga el del archivo, no lo que quedó en este equipo (la firma de lo último escrito).
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-claude-'));
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');

const espera = ms => new Promise(r => setTimeout(r, ms));
/* Electron vuelve a escribir su almacenamiento (`datos/`) al cerrarse, después del rmSync del final, y la carpeta temporal se
   quedaba: se borra también un poco después, desde un proceso aparte que sobrevive a la app */
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 600)));
}
const leerArchivo = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const escribirArchivo = (p, d) => fs.writeFileSync(p, zlib.gzipSync(JSON.stringify(d)));

/* el servidor MCP, arrancado como en el plugin: el binario de la app en modo Node */
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

app.whenReady().then(async () => {
  let win = null, M = null;
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const preparar = w => {
    w.webContents.on('console-message', ev => { const nivel = ev.level ?? ev.params?.level; if (nivel === 'error' || nivel === 3) console.log('    [página] ' + (ev.message ?? ev.params?.message)); });
    w.webContents.setBackgroundThrottling(false);
  };
  const ventanaNueva = async () => {
    for (let i = 0; i < 200; i++) {
      const w = BrowserWindow.getAllWindows().find(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
      if (w) { if (w.webContents.isLoading()) await new Promise(r => w.webContents.once('did-finish-load', r)); return w; }
      await espera(50);
    }
    throw new Error('no hay ventana');
  };
  try {
    win = await ventanaNueva(); preparar(win);
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de Claude en ' + TMP + '\n');
    /* ---------- un proyecto con archivo ---------- */
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'El faro', plantilla: 'blanco' }); await W(900); return true;`);
    const RUTA = path.join(TMP, 'el-faro.clapcraft');
    comprobar('el proyecto nace con su archivo', fs.existsSync(RUTA));
    await hasta(`return !!document.querySelector('#rows .row');`);
    const puente = JSON.parse(fs.readFileSync(path.join(DATOS, 'puente.json'), 'utf8'));
    comprobar('la app anuncia su puente (encendido, con el proyecto abierto y su archivo)', puente.activo && puente.socket && puente.abiertos.length === 1 && puente.abiertos[0].ruta === RUTA && puente.abiertos[0].nombre === 'El faro', JSON.stringify(puente));
    comprobar('el socket es solo del usuario', (fs.statSync(puente.socket).mode & 0o777) === 0o600, (fs.statSync(puente.socket).mode & 0o777).toString(8));

    M = mcp();
    const ini = await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    comprobar('el servidor MCP arranca con el Node de la app y saluda', ini.result && ini.result.serverInfo.name === 'clapcraft', JSON.stringify(ini) + M.errores());

    /* ---------- 1. el puente ---------- */
    let r = await M.llamar('listar_proyectos');
    comprobar('listar_proyectos: el proyecto abierto, delante', /ABIERTOS EN CLAPCRAFT\n- «El faro» · .*el-faro\.clapcraft · delante/.test(r.texto), r.texto);
    r = await M.llamar('ver_proyecto');
    comprobar('ver_proyecto sin decir cuál: el de delante, en vivo, con lo que hay en pantalla', /PROYECTO «El faro».*abierto en ClapCraft/.test(r.texto) && /EN PANTALLA: vista Esquema · esquema montado «Esquema»/.test(r.texto), r.texto);

    /* ---------- 2. editar_esquema en vivo ---------- */
    const antesArchivo = fs.readFileSync(RUTA);
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [
      { op: 'crear_trama', ref: 'b', nombre: 'Romance', color: 'rosa' },
      { op: 'crear_nodo', ref: 'n1', trama: 'Trama', columna: 2, titulo: 'La tormenta' },
      { op: 'crear_nodo', ref: 'n2', trama: '$b', columna: 4, titulo: 'Se conocen' },
      { op: 'crear_nota', nodo: '$n1', texto: '¿Muy pronto?', color: 'ambar' },
      { op: 'crear_salto', desde: 'Trama', hacia: '$b', columna: 6, titulo: 'Corta a Romance' }] });
    comprobar('editar_esquema en vivo contesta sin escribir el archivo él mismo', !r.error && !/Escrito en/.test(r.texto), r.texto);
    const enTablero = await js(`const d = Tramas.tablero.modelo().datos; return JSON.stringify({ tramas: d.lineas.map(l => l.nombre), nodos: d.puntos.map(p => p.titulo), notas: d.notas.map(n => n.texto), saltos: d.saltos.length, dom: [...document.querySelectorAll('#rows .pt')].length });`);
    const t0 = JSON.parse(enTablero);
    comprobar('el tablero montado lo enseña al momento', t0.tramas.join() === 'Trama,Romance' && t0.nodos.includes('La tormenta') && t0.nodos.includes('Se conocen') && t0.notas[0] === '¿Muy pronto?' && t0.saltos === 1 && t0.dom >= 4, enTablero);
    comprobar('el aviso dice lo que hizo Claude y trae «Deshacer» e «Historial»', await js(`const a = document.getElementById('aviso'); return /Claude: cambió el esquema «Esquema» \\(5 cambios\\)/.test(a.textContent) && [...a.querySelectorAll('.aviso-accion')].map(b => b.textContent).join() === 'Deshacer,Historial';`));
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 5000);
    await espera(400);
    const f1 = leerArchivo(RUTA), e1 = f1.documentos.contenedores[0].esquemas[0];
    comprobar('el archivo se escribe solo, como cualquier cambio', !fs.readFileSync(RUTA).equals(antesArchivo) && e1.datos.puntos.some(p => p.titulo === 'La tormenta'), JSON.stringify(e1.datos.puntos.map(p => p.titulo)));
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Trama', columna: 8, titulo: 'Para deshacer' }] });
    await js(`document.querySelector('#aviso .aviso-accion').click(); await W(300); return true;`);
    comprobar('el «Deshacer» del aviso devuelve el proyecto a como estaba', await js(`return !Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'Para deshacer') && Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'La tormenta');`));
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Trama', columna: 9, titulo: 'Con Cmd+Z' }] });
    await js(`Tramas.tablero.deshacer(); await W(200); return true;`);
    comprobar('el Deshacer del tablero también deshace lo de Claude (un paso)', await js(`const ps = Tramas.tablero.modelo().datos.puntos.map(p => p.titulo); return !ps.includes('Con Cmd+Z') && ps.includes('La tormenta');`));
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Trama', columna: 2, titulo: 'Choca' }] });
    comprobar('un lote que no se puede no toca nada y dice por qué', r.error && /Ahí ya está «La tormenta»/.test(r.texto), r.texto);

    /* ---------- 3. escribir_documento con el editor abierto ---------- */
    await js(`Claquedraw.app.vista('texto'); await W(1200); return true;`);
    await hasta(`const E = document.getElementById('editorMarco').contentWindow.Ed; return !!(E && E.document);`);
    await js(`const E = document.getElementById('editorMarco').contentWindow.Ed; E.document.set({ title: 'Esquema', html: '<p class="sp-action">Lo que había escrito Leo.</p>', characters: {} }); E.afterChange && E.afterChange(); await W(900); return true;`);
    r = await M.llamar('escribir_documento', { esquema: 'Esquema', contenido: 'INT. FARO - NOCHE\n\nLa lámpara gira.\n\nMARA\n(susurrando)\nNo hay nadie.' });
    comprobar('escribir_documento en vivo', !r.error && /reemplazado · 5 bloques nuevos/.test(r.texto) && /Antes de Claude/.test(r.texto) && /Personajes nuevos en el elenco: Mara/.test(r.texto), r.texto);
    await espera(300);
    const html = await js(`return document.getElementById('editorMarco').contentWindow.Ed.document.get().html;`);
    comprobar('el editor abierto enseña lo que escribió Claude', /INT\. FARO - NOCHE/.test(html) && /class="sp-character"[^>]*>Mara/.test(html) && !/Lo que había escrito Leo/.test(html), html);
    comprobar('lo de antes quedó como versión «Antes de Claude» y Mara está en el elenco', await js(`const d = Claquedraw.gestor.documentos(), eid = d.datos.contenedores[0].esquemas[0].id, n = d.documentoEsquema(eid);
      return (n.versiones || []).length === 1 && /^Antes de Claude/.test(n.versiones[0].nombre) && /Lo que había escrito Leo/.test(n.versiones[0].html) && d.elenco().some(p => p.nombre === 'Mara');`));
    r = await M.llamar('leer_documento', { esquema: 'Esquema', numerar: true });
    comprobar('leer_documento lee lo del editor', /\[1\] INT\. FARO - NOCHE\n\n\[2\] La lámpara gira\.\n\n\[3\] MARA\n\[4\] \(susurrando\)/.test(r.texto), r.texto);

    /* ---------- 4. mostrar_en_clapcraft ---------- */
    const idNodo = await js(`return Tramas.tablero.modelo().datos.puntos.find(p => p.titulo === 'Se conocen').id;`);
    r = await M.llamar('mostrar_en_clapcraft', { esquema: 'Esquema', nodo: 'Se conocen' });
    await espera(400);
    comprobar('mostrar_en_clapcraft: la vista Esquema con el nodo elegido', !r.error && await js(`const s = Tramas.tablero.seleccion(); return document.body.classList.contains('vista-texto') === false && !!s && s.id === '${idNodo}';`), r.texto);

    /* ---------- 4b. el historial de Claude ---------- */
    const menuClaude = texto => Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items.find(i => i.label === texto);
    menuClaude('Historial de cambios…').click();
    await hasta(`return !!document.querySelector('.hc-capa .hc-entrada');`);
    const hist = JSON.parse(await js(`return JSON.stringify([...document.querySelectorAll('.hc-entrada')].map(a => ({ tit: a.querySelector('.hc-tit').textContent, rev: a.classList.contains('revertida'), chips: [...a.querySelectorAll('.hc-chip')].map(c => c.textContent) })));`));
    comprobar('el panel del historial (menú Claude) lista los cambios, del más nuevo al más viejo (lo que falla y «mostrar» no cuentan)', hist.length === 4 && hist[0].tit === 'Escribió en el documento de «Esquema»' && hist[3].tit === 'Cambió el esquema «Esquema» (5 cambios)' && hist[3].chips.join() === 'Claude,en vivo', JSON.stringify(hist));
    comprobar('lo deshecho desde el aviso sale revertido', hist.find(h => /\(1 cambio|Cambió el esquema «Esquema»$/.test(h.tit) && h.rev) !== undefined || hist.filter(h => h.rev).length === 1, JSON.stringify(hist));
    await js(`document.querySelectorAll('.hc-entrada')[0].querySelector('[data-hc-ver]').click(); await W(300); return true;`);
    comprobar('«Ver cambios» enseña antes y ahora (la comparación de versiones)', await js(`const c = document.querySelector('.vs-capa'); return !!c && /Antes de Claude/.test(c.textContent) && c.querySelectorAll('.vs-mas').length > 0 && c.querySelectorAll('.vs-menos').length > 0;`));
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await W(150); return true;`);
    comprobar('Esc cierra primero la comparación y el panel se queda', await js(`return !document.querySelector('.vs-capa') && !!document.querySelector('.hc-capa');`));
    /* revertir el primero (el de las 5 operaciones): lo de después (el documento) se queda */
    await js(`const es = [...document.querySelectorAll('.hc-entrada')]; es[es.length - 1].querySelector('[data-hc-revertir]').click(); await W(500); return true;`);
    comprobar('revertir desde el panel: fuera la trama, los nodos, la nota y el salto de Claude', await js(`const d = Tramas.tablero.modelo().datos; return d.lineas.length === 1 && !d.puntos.some(p => p.titulo === 'La tormenta' || p.titulo === 'Se conocen') && !d.notas.length && !d.saltos.length;`));
    comprobar('y el documento que escribió después sigue', await js(`return /INT\\. FARO - NOCHE/.test(document.getElementById('editorMarco').contentWindow.Ed.document.get().html + Claquedraw.gestor.documentos().documentoEsquema(Claquedraw.gestor.documentos().datos.contenedores[0].esquemas[0].id).html);`));
    comprobar('la entrada queda revertida y el aviso trae «Deshacer»', await js(`const es = [...document.querySelectorAll('.hc-entrada')]; return es[es.length - 1].classList.contains('revertida') && /Revertido: Cambió el esquema/.test(document.getElementById('aviso').textContent);`));
    await js(`document.querySelector('#aviso .aviso-accion').click(); await W(300); return true;`);
    comprobar('«Deshacer» de lo revertido lo devuelve', await js(`return Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'Se conocen') && ![...document.querySelectorAll('.hc-entrada')].pop().classList.contains('revertida');`));
    /* un choque: Claude crea un nodo, «Leo» lo retoca, y revertir pregunta */
    await js(`document.querySelector('[data-hc-cerrar]').click(); return true;`);
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Trama', columna: 14, titulo: 'De Claude' }] });
    await js(`const m = Tramas.tablero.modelo(), p = m.datos.puntos.find(x => x.titulo === 'De Claude'); m.editarPunto(p.id, { titulo: 'De Claude, retocado por Leo' }); Tramas.tablero.render(); await W(500); return true;`);
    menuClaude('Historial de cambios…').click();
    await hasta(`return !!document.querySelector('.hc-capa .hc-entrada');`);
    await js(`document.querySelector('.hc-entrada [data-hc-revertir]').click(); await W(300); return true;`);
    comprobar('con un choque, revertir pregunta y dice qué se tocó', await js(`const d = document.getElementById('dlg'); return d.open && /se tocaron algunas de las mismas cosas \\(contenedor «Contenedor» › esquema «Esquema» › nodo «De Claude, retocado por Leo»\\)/.test(d.textContent);`));
    await js(`document.getElementById('dlgOk').click(); await W(500); return true;`);
    comprobar('«Revertir de todos modos» lo quita', await js(`return !Tramas.tablero.modelo().datos.puntos.some(p => /De Claude/.test(p.titulo)) && document.querySelector('.hc-entrada').classList.contains('revertida');`));
    await js(`document.querySelector('[data-hc-cerrar]').click(); return true;`);
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 5000);
    await espera(400);
    const hArchivo = leerArchivo(RUTA).documentos.historialClaude;
    comprobar('el historial va en el archivo del proyecto', Array.isArray(hArchivo) && hArchivo.length === 5 && hArchivo.filter(e => e.revertido).length === 2, JSON.stringify((hArchivo || []).map(e => [e.titulo, !!e.revertido])));

    /* ---------- 4c. una nota de biblioteca abierta en su ventana (1.1.54, de ClapBook: la ventana sustituye al panel lateral) ---------- */
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas', ref: 'i' }] });
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [{ op: 'crear_nota', titulo: 'El farero', contenido: 'Dicen que nunca duerme.' }] });
    const nid = await js(`const d = Claquedraw.gestor.documentos(), s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Ideas'); return s ? (d.notasDe(s.id)[0] || {}).id : null;`);
    comprobar('Claude crea una biblioteca con una nota', !r.error && !!nid, r.texto);
    await js(`const d = Claquedraw.gestor.documentos(), s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Ideas');
      Claquedraw.app.vista('documentos'); Claquedraw.gestor.abrirSub(s.id); await W(400);
      document.querySelector('#gdMain [data-nota="${nid}"]').click(); await W(350); return true;`);
    comprobar('un clic en su tarjeta la abre en su ventana', await js(`const c = document.querySelector('.gd-modal-capa'); return !!c && !c.hidden && /Dicen que nunca duerme\\./.test(c.querySelector('[data-gd-lado-texto]').textContent);`));
    r = await M.llamar('ver_proyecto');
    comprobar('ver_proyecto dice que en pantalla está esa nota, en su ventana', !r.error && new RegExp('EN PANTALLA: vista Documentos \\(una nota en su ventana\\).* · documento abierto «El farero» \\(nota ' + nid + '\\)').test(r.texto), r.texto);
    /* lo que Leo escribe en la ventana lo lee Claude al momento (sin esperar al guardado de 400 ms) */
    await js(`const c = document.querySelector('.gd-modal-capa [data-gd-lado-texto]'); c.focus();
      const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(c); rg.collapse(false); s.removeAllRanges(); s.addRange(rg);
      document.execCommand('insertText', false, ' Y habla con el mar.'); return true;`);
    r = await M.llamar('leer_documento', { nota: nid });
    comprobar('leer_documento lee lo que se acaba de escribir en la ventana', !r.error && /Y habla con el mar\./.test(r.texto), r.texto);
    /* y lo que escribe Claude se ve en el campo de la ventana abierta (con el foco en la ventana, fuera del campo) */
    await js(`document.querySelector('.gd-modal').focus(); await W(100); return true;`);
    r = await M.llamar('escribir_documento', { nota: nid, contenido: 'El farero apaga la luz **a medianoche**.', como: 'prosa' });
    comprobar('escribir_documento sobre la nota de la ventana abierta', !r.error, r.texto);
    comprobar('la ventana enseña lo que escribió Claude, con su formato', await hasta(`const c = document.querySelector('.gd-modal-capa'); const f = c.querySelector('[data-gd-lado-texto]');
      return !c.hidden && /El farero apaga la luz a medianoche\\./.test(f.textContent) && !!f.querySelector('strong, b') && !/Dicen que nunca duerme/.test(f.textContent);`, 3000),
      await js(`return document.querySelector('.gd-modal-capa [data-gd-lado-texto]').innerHTML;`));
    await js(`document.querySelector('.gd-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await W(200);
      Claquedraw.app.vista('esquema'); await W(300); return true;`);
    comprobar('Esc cierra la ventana y la nota sigue con lo de Claude', await js(`const d = Claquedraw.gestor.documentos(); return document.querySelector('.gd-modal-capa').hidden && /a medianoche/.test(d.nota('${nid}').html);`));

    /* ---------- 5. la conexión, apagada y encendida ---------- */
    const item = () => Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items[0];
    comprobar('el menú Claude trae la conexión encendida', item().type === 'checkbox' && item().checked);
    item().click();                                              // como un clic de verdad: la casilla se alterna sola
    await espera(300);
    comprobar('apagada: puente.json lo dice y no hay socket', !JSON.parse(fs.readFileSync(path.join(DATOS, 'puente.json'), 'utf8')).activo && !fs.existsSync(puente.socket));
    r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Trama', columna: 12, titulo: 'No' }] });
    comprobar('apagada: no se escribe el proyecto abierto', r.error && /conexión con Claude está apagada/.test(r.texto), r.texto);
    r = await M.llamar('leer_esquema', { esquema: 'Esquema', proyecto: RUTA });
    comprobar('apagada: se puede leer del archivo, con aviso', !r.error && /^\(Leído del archivo/.test(r.texto), r.texto);
    item().click();
    await espera(300);
    r = await M.llamar('ver_proyecto');
    comprobar('encendida otra vez, en vivo', !r.error && /abierto en ClapCraft/.test(r.texto), r.texto);

    /* ---------- 6. con el proyecto cerrado, sobre su archivo ---------- */
    await js(`await Claquedraw.app.cerrar(); await W(600); return true;`);
    comprobar('cerrado: la app ya no lo anuncia', JSON.parse(fs.readFileSync(path.join(DATOS, 'puente.json'), 'utf8')).abiertos.length === 0);
    r = await M.llamar('editar_esquema', { proyecto: RUTA, esquema: 'Esquema', operaciones: [{ op: 'crear_nodo', trama: 'Romance', columna: 10, titulo: 'Escrito en el archivo' }] });
    comprobar('cerrado: Claude escribe su archivo', !r.error && /Escrito en/.test(r.texto) && leerArchivo(RUTA).documentos.contenedores[0].esquemas[0].datos.puntos.some(p => p.titulo === 'Escrito en el archivo'), r.texto);
    await js(`await Claquedraw.app.abrirReciente(${JSON.stringify(RUTA)}); await W(900); return true;`);
    await hasta(`return !!Claquedraw.app.abiertoId();`);
    comprobar('al volver a abrirlo desde recientes está lo de Claude', await js(`return Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'Escrito en el archivo');`));
    comprobar('y avisa de lo que hizo Claude con el proyecto cerrado', await hasta(`return /Claude hizo un cambio en «El faro» con el proyecto cerrado/.test(document.getElementById('aviso').textContent) && /Ver/.test(document.getElementById('aviso').textContent);`, 3000));
    await js(`[...document.querySelectorAll('#aviso .aviso-accion')].find(b => b.textContent === 'Ver').click(); await W(300); return true;`);
    comprobar('«Ver» abre el historial con ese cambio, marcado «en el archivo»', await js(`const a = document.querySelector('.hc-entrada'); return !!a && /Cambió el esquema «Esquema»/.test(a.textContent) && /en el archivo/i.test(a.textContent);`));
    await js(`document.querySelector('[data-hc-cerrar]').click(); return true;`);

    /* ---------- 7. el archivo cambia fuera ---------- */
    const conNodo = titulo => { const d = leerArchivo(RUTA), m = d.documentos.contenedores[0].esquemas[0].datos; const c = Math.max(0, ...m.puntos.map(p => p.col)) + 2; m.columnas = Math.max(m.columnas || 1, c + 1); m.puntos.push({ id: 'p' + (900 + m.puntos.length), lineaId: m.lineas[0].id, col: c, titulo, descripcion: '', color: null, cortado: false }); escribirArchivo(RUTA, d); };
    await espera(2600);                                          // pasados los 2 s de «lo acaba de escribir la app»
    conNodo('Cambiado fuera, abierto');
    comprobar('abierto: la ventana relee el archivo cambiado fuera', await hasta(`return Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'Cambiado fuera, abierto');`, 8000));
    comprobar('y lo dice', await js(`return /Cargados los cambios de el-faro\\.clapcraft hechos fuera de ClapCraft/.test(document.getElementById('aviso').textContent);`));
    const pid = await js(`return Claquedraw.app.abiertoId();`);
    await espera(1500);
    await win.webContents.loadURL('about:blank');                // «cerrada»: la página se va sin olvidar su proyecto
    await espera(400);
    conNodo('Cambiado con la app cerrada');
    await win.loadFile(path.join(__dirname, '..', 'claquedraw.html'), { query: { p: pid } });
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.abiertoId());`);
    comprobar('al volver a abrir la ventana se carga el archivo cambiado fuera, no lo que quedó en este equipo', await hasta(`return Tramas.tablero.modelo().datos.puntos.some(p => p.titulo === 'Cambiado con la app cerrada');`, 8000));
    comprobar('y el archivo no se pisa', await hasta(`return true;`) && leerArchivo(RUTA).documentos.contenedores[0].esquemas[0].datos.puntos.some(p => p.titulo === 'Cambiado con la app cerrada'));
    comprobar('el servidor MCP no soltó errores', !/Error|error:/.test(M.errores().replace(/servidor MCP listo/, '')), M.errores());
  } catch (e) {
    comprobar('sin excepciones', false, e && e.stack);
  } finally {
    if (M) M.cerrar();
    const mal = resultados.filter(x => !x.ok).length;
    console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    borrarDespues(TMP);
    app.exit(mal ? 1 : 0);
  }
});
