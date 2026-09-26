/* Prueba de los enlaces con la app de verdad (Electron + disco): `npm run test:enlaces`.
   Leo, 25-09-2026: «Pon unos "puntos" o "links" a bibliotecas, segmentos, notas, personajes, esquemas, etc. Para facilitar el
   decirle a Claude a qué puntos me refiero cuando le hablo de algo». Arranca electron/main.js tal cual (almacenamiento en una
   carpeta temporal, diálogos sustituidos y **el portapapeles del sistema sustituido por uno de mentira**: la prueba no toca el de
   Leo), crea un proyecto con archivo, lo llena con el servidor MCP (arrancado como lo arranca Claude) y comprueba:
   1. «Copiar enlace para Claude» en el clic derecho de un nodo, de unas columnas y de una nota del tablero, en el panel flotante (lo
      suyo y cada nota), en el ⋯ del árbol y de una nota de biblioteca, en la ventana de una nota (1.1.54), en el botón de las
      cabeceras y con Cmd+Shift+C (menú Claude): lo copiado es Markdown con su nombre y su clapcraft://;
   2. en el editor, el clic derecho y Cmd+Shift+C con una selección copian el tramo (?b=…&h=…);
   3. Claude lee lo pegado con ver_enlace (en vivo, sin decir el proyecto) y lo usa en lugar del id;
   4. abrir un enlace lleva a su sitio: el del portapapeles (Claude › Ir al enlace copiado), uno que llega del sistema (open-url)
      y mostrar_en_clapcraft con un enlace —un nodo, una nota de biblioteca, un tramo del guion, un segmento, una trama, una raya—;
   5. el de otro proyecto (cerrado, en recientes) se abre en su ventana y va a su sitio;
   6. si el archivo cambia de nombre —con el proyecto abierto, con ClapCraft cerrado o con el proyecto cerrado—, el proyecto se da
      cuenta, corrige los enlaces que hay dentro y los de antes siguen llevando a él; una copia no se toma por un renombrado.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-enlaces-'));
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
/* Electron vuelve a escribir su almacenamiento (`datos/`) al cerrarse, después del rmSync del final, y la carpeta temporal se
   quedaba: se borra también un poco después, desde un proceso aparte que sobrevive a la app */
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 700)));
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

app.whenReady().then(async () => {
  let win = null, M = null;
  const jsEn = (w, code) => w.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const js = code => jsEn(win, code);
  const hasta = async (code, ms, w) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await jsEn(w || win, code)) return true; await espera(100); } return false; };
  const preparar = w => {
    w.webContents.on('console-message', ev => { const nivel = ev.level ?? ev.params?.level; if (nivel === 'error' || nivel === 3) console.log('    [página] ' + (ev.message ?? ev.params?.message)); });
    w.webContents.setBackgroundThrottling(false);
  };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  const ventanaNueva = async (salvo) => {
    for (let i = 0; i < 200; i++) {
      const w = ventanas().find(x => !(salvo || []).includes(x));
      if (w) { if (w.webContents.isLoading()) await new Promise(r => w.webContents.once('did-finish-load', r)); return w; }
      await espera(50);
    }
    throw new Error('no hay ventana');
  };
  const menuClaude = texto => Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items.find(i => i.label === texto);
  const copiado = async (accion, ms) => { portapapeles = ''; await accion(); for (let t = 0; t < (ms || 2000) && !portapapeles; t += 50) await espera(50); return portapapeles; };
  try {
    win = await ventanaNueva(); preparar(win);
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de los enlaces en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'El faro', plantilla: 'blanco' }); await W(900); return true;`);
    const RUTA = path.join(TMP, 'el-faro.clapcraft');
    await hasta(`return !!document.querySelector('#rows .row');`);
    M = mcp();
    await M.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    /* el proyecto, lleno por Claude */
    let r = await M.llamar('editar_esquema', { esquema: 'Esquema', operaciones: [
      { op: 'crear_trama', ref: 'b', nombre: 'Romance', color: 'rosa' },
      { op: 'crear_nodo', ref: 'n1', trama: 'Trama', columna: 2, titulo: 'La tormenta', descripcion: 'El faro se queda sin luz.' },
      { op: 'crear_nodo', ref: 'n2', trama: 'Trama', columna: 5, titulo: 'El naufragio' },
      { op: 'crear_nodo', ref: 'n3', trama: '$b', columna: 3, titulo: 'Se conocen' },
      { op: 'crear_nota', nodo: '$n1', texto: 'TH de Mara' },
      { op: 'crear_nota', entre: ['$n1', '$n2'], texto: 'Por lo tanto' },
      { op: 'crear_nota', trama: '$b', columna: 8, texto: 'Aquí falta el final' }] });
    comprobar('Claude llena el esquema en vivo', !r.error, r.texto);
    r = await M.llamar('escribir_documento', { esquema: 'Esquema', contenido: 'INT. FARO - NOCHE\n\nLa lámpara gira.\n\nMARA\nNo hay nadie.\n\nUn trueno.' });
    comprobar('y escribe el guion', !r.error, r.texto);
    r = await M.llamar('editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: 'Contenedor', nombre: 'Ideas', ref: 'i' }] });
    r = await M.llamar('editar_biblioteca', { biblioteca: 'Ideas', operaciones: [
      { op: 'crear_segmento', ref: 'g', nombre: 'Leyendas', color: 'Azul' },
      { op: 'crear_nota', segmento: '$g', titulo: 'El farero', contenido: 'Dicen que el farero **nunca** duerme.\n\nY que habla con el mar.' }] });
    comprobar('y una biblioteca con un segmento y una nota', !r.error, r.texto);
    await espera(300);
    const ids = JSON.parse(await js(`const d = Claquedraw.gestor.documentos(), e = d.datos.contenedores[0].esquemas[0], m = Tramas.tablero.modelo();
      const s = d.datos.contenedores[0].subs.find(x => x.nombre === 'Ideas'), g = d.etiquetasDe(s.id)[0], n = d.notasDe(s.id)[0];
      const p = t => m.datos.puntos.find(x => x.titulo === t).id;
      return JSON.stringify({ eid: e.id, p1: p('La tormenta'), p2: p('El naufragio'), p3: p('Se conocen'), l2: m.datos.lineas[1].id,
        nNodo: m.datos.notas.find(x => x.texto === 'TH de Mara').id, sid: s.id, gid: g.id, nid: n.id, doc: d.documentoEsquema(e.id).id });`));
    const U = 'clapcraft://el-faro/esquema/' + ids.eid;

    /* ---------- 1. copiar enlaces ---------- */
    await js(`Claquedraw.app.vista('esquema'); await W(300); return true;`);
    let t = await copiado(() => js(`const el = document.querySelector('#board [data-punto="${ids.p1}"] .dot'), r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 })); await W(100);
      const b = [...document.querySelectorAll('#menu [data-extra]')].find(x => x.textContent === 'Copiar enlace para Claude'); if (b) b.click(); return !!b;`));
    comprobar('clic derecho en un nodo › «Copiar enlace para Claude»', t === '[Nodo «La tormenta» · esquema «Esquema»](' + U + '/nodo/' + ids.p1 + ')', t);
    comprobar('el aviso lo dice', await js(`return /Enlace copiado: Nodo «La tormenta» · esquema «Esquema»\. Pégalo en Claude\./.test(document.getElementById('aviso').textContent);`));
    /* con el ratón de verdad (1.1.52: el botón derecho empezaba a arrastrar el nodo y el menú no salía) */
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); Tramas.tablero.soltar(); await W(100); return true;`);
    const pos = JSON.parse(await js(`const r = document.querySelector('#board [data-punto="${ids.p2}"] .dot').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });`));
    win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y }); await espera(60);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'right', clickCount: 1 }); await espera(50);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'right', clickCount: 1 }); await espera(450);
    comprobar('con el ratón de verdad, el clic derecho en un nodo abre su menú (no lo arrastra) y el panel no lo tapa', await js(`const b = document.querySelector('#menu.show [data-extra]'); if (!b) return false;
      const r = b.getBoundingClientRect(), x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!x && b.contains(x) && Tramas.tablero.seleccion().id === '${ids.p2}';`));
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); Tramas.tablero.soltar(); await W(100); return true;`);
    t = await copiado(() => js(`const el = document.querySelector('#axis .col[data-col="2"]'), r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 })); await W(100);
      const b = document.querySelector('#menu [data-extra]'); if (b) b.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return !!b;`));
    comprobar('clic derecho en la cabecera de una columna', t === '[Columna 3 · esquema «Esquema»](' + U + '/columna/3)', t);
    await js(`Tramas.tablero.soltar(); await W(50); return true;`);
    t = await copiado(() => js(`const el = document.querySelector('#board .nota[data-nota="${ids.nNodo}"]'), r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 3, clientY: r.top + 3 })); await W(100);
      const b = document.querySelector('#menu [data-extra]'); if (b) b.click(); return !!b;`));
    comprobar('clic derecho en una nota del tablero', t === '[Nota «TH de Mara» (en el nodo «La tormenta») · esquema «Esquema»](' + U + '/nota/' + ids.nNodo + ')', t);
    /* el panel flotante: lo suyo y cada nota */
    await js(`Tramas.tablero.ir({ tipo: 'punto', id: '${ids.p1}' }); await W(250); return true;`);
    comprobar('Tramas.tablero.ir elige el nodo y abre su panel', await js(`return Tramas.tablero.seleccion().id === '${ids.p1}' && !!document.querySelector('.hilo-flot [data-flot-enlace]');`));
    t = await copiado(() => js(`document.querySelector('.hilo-flot [data-flot-enlace]').click(); return true;`));
    comprobar('el botón de enlace del panel flotante', t === '[Nodo «La tormenta» · esquema «Esquema»](' + U + '/nodo/' + ids.p1 + ')', t);
    t = await copiado(() => js(`document.querySelector('.hilo-flot [data-flot-enlace-nota]').click(); return true;`));
    comprobar('y el de una de sus notas', t === '[Nota «TH de Mara» (en el nodo «La tormenta») · esquema «Esquema»](' + U + '/nota/' + ids.nNodo + ')', t);
    /* Cmd+Shift+C (el menú Claude): lo elegido */
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('Cmd+Shift+C (menú Claude) con un nodo elegido: su enlace', t === '[Nodo «La tormenta» · esquema «Esquema»](' + U + '/nodo/' + ids.p1 + ')', t);
    comprobar('el menú Claude lleva Cmd+Shift+C', menuClaude('Copiar enlace para Claude').accelerator === 'CmdOrCtrl+Shift+C');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); Tramas.tablero.soltar(); await W(100); return true;`);
    /* la cabecera: lo que se ve */
    t = await copiado(() => js(`const b = [...document.querySelectorAll('[data-enlace-cab]')].find(x => x.offsetParent); if (b) b.click(); return !!b;`));
    comprobar('el botón de enlace de la cabecera del esquema', t === '[Esquema «Esquema»](' + U + ')', t);
    /* el ⋯ del árbol */
    t = await copiado(() => js(`const f = [...document.querySelectorAll('#gdSide .gd-sub')].find(x => x.textContent.includes('Ideas')); f.querySelector('[data-gd-menu="hijo"]').click(); await W(150);
      const b = [...document.querySelectorAll('.gd-pop button')].find(x => x.textContent === 'Copiar enlace para Claude'); if (b) b.click(); return !!b;`));
    comprobar('el ⋯ de una biblioteca del árbol', t === '[Biblioteca «Ideas»](clapcraft://el-faro/biblioteca/' + ids.sid + ')', t);

    /* ---------- 2. el editor: un tramo ---------- */
    await js(`Claquedraw.app.vista('texto'); await W(1200); return true;`);
    await hasta(`const E = document.getElementById('editorMarco').contentWindow.Ed; return !!(E && E.document && Claquedraw.texto.enDocumento() && /MARA|Mara/.test(E.document.get().html));`);
    await js(`const w = document.getElementById('editorMarco').contentWindow, d = w.document, ed = d.getElementById('editor'), ps = ed.children;
      const r = d.createRange(); r.setStart(ps[2], 0); r.setEnd(ps[3], ps[3].childNodes.length);
      const s = w.getSelection(); s.removeAllRanges(); s.addRange(r); await W(60); return true;`);
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('Cmd+Shift+C con texto seleccionado: el tramo (sus bloques y la huella del primero)', /^\[«(MARA|Mara) No hay nadie\.» · guion de «Esquema», bloques 3–4\]\(clapcraft:\/\/el-faro\/esquema\/\S+\/documento\?b=3-4&h=[0-9a-z]+\)$/.test(t), t);
    const tramo34 = t;
    r = await M.llamar('ver_enlace', { enlace: tramo34 });
    comprobar('Claude lo lee: esos bloques, numerados, con uno de contexto a cada lado', !r.error && /TRAMO de el guion de «Esquema» \(nota \S+\) · bloques 3–4 de 5/.test(r.texto) && /\[2\] La lámpara gira\./.test(r.texto) && /\[3\] MARA\n\[4\] No hay nadie\./.test(r.texto) && /\[5\] Un trueno\./.test(r.texto), r.texto);
    /* el clic derecho del editor: el párrafo del cursor */
    t = await copiado(() => js(`const w = document.getElementById('editorMarco').contentWindow, d = w.document, p = d.getElementById('editor').children[1];
      const r = d.createRange(); r.setStart(p.firstChild, 3); r.collapse(true); const s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
      const b = p.getBoundingClientRect(); p.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 30, clientY: b.top + 6 })); await W(80);
      const it = d.getElementById('cdEnlace'); if (!it || it.hidden || d.getElementById('ctxMenu').hidden) return false; it.click(); return true;`));
    comprobar('clic derecho en el editor › «Copiar enlace para Claude»: el párrafo', /^\[«La lámpara gira\.» · guion de «Esquema», bloque 2\]\(clapcraft:\/\/el-faro\/esquema\/\S+\/documento\?b=2&h=[0-9a-z]+\)$/.test(t), t);
    t = await copiado(() => js(`const w = document.getElementById('editorMarco').contentWindow, ed = w.document.getElementById('editor');
      const x = w.Ed.blocks.extras.find(e => e.id === 'enlace'); x.ejecutar([ed.children[4]]); return true;`));
    comprobar('el asa de bloques (su menú) copia el de los bloques elegidos', /^\[«Un trueno\.» · guion de «Esquema», bloque 5\]\(clapcraft:\/\/el-faro\/esquema\/\S+\/documento\?b=5&h=[0-9a-z]+\)$/.test(t), t);
    t = await copiado(() => js(`const b = [...document.querySelectorAll('[data-enlace-cab]')].find(x => x.offsetParent); if (b) b.click(); return !!b;`));
    comprobar('el botón de la cabecera del editor: el guion entero', t === '[Guion de «Esquema»](' + U + '/documento)', t);

    /* ---------- bibliotecas ---------- */
    await js(`Claquedraw.gestor.abrirSub('${ids.sid}'); await W(400); return true;`);
    t = await copiado(() => js(`const n = document.querySelector('#gdMain [data-nota="${ids.nid}"] [data-gd-menu="nota"]'); n.click(); await W(120);
      const b = [...document.querySelectorAll('.gd-pop button')].find(x => x.textContent === 'Copiar enlace para Claude'); if (b) b.click(); return !!b;`));
    comprobar('el ⋯ de una nota de biblioteca', t === '[Nota «El farero» · biblioteca «Ideas» › «Leyendas»](clapcraft://el-faro/nota/' + ids.nid + ')', t);
    const notaEnlace = t;
    t = await copiado(() => js(`const e = document.querySelector('#gdMain [data-etq="${ids.gid}"] [data-gd-menu="etiqueta"]'); e.click(); await W(120);
      const b = [...document.querySelectorAll('.gd-pop button')].find(x => x.textContent === 'Copiar enlace para Claude'); if (b) b.click(); return !!b;`));
    comprobar('el menú de un segmento', t === '[Segmento «Leyendas» · biblioteca «Ideas»](clapcraft://el-faro/biblioteca/' + ids.sid + '/segmento/' + ids.gid + ')', t);
    const segEnlace = t;
    t = await copiado(() => js(`const b = [...document.querySelectorAll('[data-enlace-cab]')].find(x => x.offsetParent); if (b) b.click(); return !!b;`));
    comprobar('el botón de la cabecera de la biblioteca', t === '[Biblioteca «Ideas»](clapcraft://el-faro/biblioteca/' + ids.sid + ')', t);
    /* un clic en la nota la abre en su ventana (1.1.54): Cmd+Shift+C y el botón de enlace de la ventana copian el de su nota */
    await js(`const n = document.querySelector('#gdMain [data-nota="${ids.nid}"]'); n.click(); await W(350); return true;`);
    comprobar('un clic en la nota la abre en su ventana', await js(`const c = document.querySelector('.gd-modal-capa'); return !!c && !c.hidden && Claquedraw.gestor.notaElegida() === '${ids.nid}' && document.querySelector('.gd-modal-titulo').value === 'El farero';`));
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('Cmd+Shift+C con la nota en su ventana: la nota', t === notaEnlace, t);
    t = await copiado(() => js(`const b = document.querySelector('.gd-modal-capa [data-gd-lado-enlace]'); if (b) b.click(); return !!b;`));
    comprobar('el botón de enlace de la ventana de la nota', t === notaEnlace, t);
    await js(`document.querySelector('.gd-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await W(150); return true;`);
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('Esc cierra la ventana y suelta la nota: Cmd+Shift+C copia lo que se ve, la biblioteca', await js(`return document.querySelector('.gd-modal-capa').hidden && !Claquedraw.gestor.notaMarcada();`) && t === '[Biblioteca «Ideas»](clapcraft://el-faro/biblioteca/' + ids.sid + ')', t);

    /* ---------- 3. Claude: lo pegado, en vivo y sin decir el proyecto ---------- */
    const nodoEnlace = '[Nodo «La tormenta» · esquema «Esquema»](' + U + '/nodo/' + ids.p1 + ')';
    r = await M.llamar('ver_enlace', { enlace: 'Mira esto ' + nodoEnlace + ' y esta nota ' + notaEnlace + '\n' + segEnlace });
    comprobar('ver_enlace con varios enlaces pegados: qué es cada uno y lo que tiene', !r.error && /NODO p\d+ «La tormenta» · «Trama»/.test(r.texto) && /El faro se queda sin luz\./.test(r.texto) && /- nota n\d+: TH de Mara/.test(r.texto)
      && /«El farero» · nota de Contenedor › Ideas › Leyendas/.test(r.texto) && /nunca/.test(r.texto) && /SEGMENTO \S+ «Leyendas»/.test(r.texto), r.texto);
    r = await M.llamar('editar_esquema', { operaciones: [{ op: 'crear_nota', nodo: nodoEnlace, texto: 'Pero el faro sigue apagado' }] });
    comprobar('un enlace vale en lugar del id (sin decir esquema ni proyecto)', !r.error && await hasta(`return Tramas.tablero.modelo().datos.notas.some(n => n.texto === 'Pero el faro sigue apagado' && n.deId === '${ids.p1}');`, 3000), r.texto);

    /* ---------- 4. abrir un enlace ---------- */
    portapapeles = notaEnlace;
    menuClaude('Ir al enlace copiado').click();
    comprobar('Claude › Ir al enlace copiado: una nota de biblioteca, abierta en el editor', await hasta(`return Claquedraw.gestor.notaAbierta() === '${ids.nid}' && document.body.classList.contains('nota-abierta');`, 5000));
    /* «Contraer» en la cabecera del editor la devuelve a su ventana (1.1.54), y con ella abierta Cmd+Shift+C sigue dando la nota */
    await js(`const b = document.querySelector('#migas [data-gd-contraer-nota]'); if (b) b.click(); await W(350); return true;`);
    comprobar('«Contraer» lleva la nota del editor a su ventana, encima de su biblioteca', await js(`const c = document.querySelector('.gd-modal-capa');
      return !!c && !c.hidden && !Claquedraw.gestor.notaAbierta() && !document.body.classList.contains('nota-abierta') && Claquedraw.gestor.notaElegida() === '${ids.nid}';`));
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('y Cmd+Shift+C con ella en su ventana copia su enlace', t === notaEnlace, t);
    await js(`document.querySelector('.gd-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await W(150); return true;`);
    app.emit('open-url', { preventDefault() {} }, U + '/nodo/' + ids.p2);
    comprobar('un enlace que llega del sistema (open-url): el nodo, elegido en su esquema y con su panel', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.tipo === 'punto' && s.id === '${ids.p2}' && !document.body.classList.contains('vista-texto') && !document.body.classList.contains('vista-documentos') && !document.body.classList.contains('nota-abierta') && !!document.querySelector('.hilo-flot:not([hidden])');`, 5000));
    app.emit('open-url', { preventDefault() {} }, tramo34.replace(/^.*\]\(|\)$/g, ''));
    comprobar('un tramo del guion: el editor abierto con esos bloques seleccionados', await hasta(`const w = document.getElementById('editorMarco').contentWindow, s = w.getSelection();
      return document.body.classList.contains('vista-texto') && /No hay nadie/.test(s.toString()) && !/lámpara/.test(s.toString());`, 6000));
    r = await M.llamar('mostrar_en_clapcraft', { enlace: segEnlace });
    comprobar('mostrar_en_clapcraft con el enlace de un segmento: expandido', !r.error && await hasta(`const x = Claquedraw.gestor.expandidoActual(); return !!x && x.subId === '${ids.sid}' && x.clave === 'etq:${ids.gid}';`, 4000), r.texto);
    app.emit('open-url', { preventDefault() {} }, U + '/trama/' + ids.l2);
    comprobar('una trama: elegida', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.tipo === 'linea' && s.id === '${ids.l2}';`, 4000));
    r = await M.llamar('mostrar_en_clapcraft', { enlace: U + '/raya/' + ids.l2 + '/8' });
    comprobar('una raya (mostrar_en_clapcraft): elegida', !r.error && await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.tipo === 'raya' && s.id === '${ids.l2}|7';`, 4000), r.texto);
    app.emit('open-url', { preventDefault() {} }, U + '/enlace/' + ids.p1 + '/' + ids.p2);
    comprobar('un enlace entre dos nodos: elegido', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.tipo === 'enlace' && s.id === '${ids.p1}';`, 4000));
    app.emit('open-url', { preventDefault() {} }, U + '/nodo/p999');
    comprobar('uno que ya no está: lo dice', await hasta(`return /Ese nodo ya no está en el esquema «Esquema»/.test(document.getElementById('aviso').textContent);`, 4000));
    const cid = await js(`return Claquedraw.gestor.documentos().datos.contenedores[0].id;`);
    app.emit('open-url', { preventDefault() {} }, 'clapcraft://el-faro/contenedor/' + cid);
    comprobar('un contenedor: su fila del árbol, marcada', await hasta(`const f = document.querySelector('#gdSide .gd-cont[data-id="${cid}"]'); return !!f && f.classList.contains('gd-aterriza');`, 3000));

    /* ---------- 5. el de otro proyecto: en su ventana ---------- */
    await js(`Claquedraw.app.nuevo(); return true;`);
    const w2 = await ventanaNueva([win]); preparar(w2);
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`, 8000, w2);
    await jsEn(w2, `await Claquedraw.app.crearProyecto({ nombre: 'La isla', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!Claquedraw.app.abiertoId() && !!document.querySelector('#rows .row');`, 8000, w2);
    const isla = JSON.parse(await jsEn(w2, `const m = Tramas.tablero.modelo(); m.nuevoPunto(m.datos.lineas[0].id, 3, { titulo: 'La cueva' }); Tramas.tablero.render(); await W(1600);
      const d = Claquedraw.gestor.documentos(); return JSON.stringify({ eid: d.datos.contenedores[0].esquemas[0].id, pid: m.datos.puntos[0].id });`));
    await Promise.race([jsEn(w2, `await Claquedraw.app.cerrar(); return true;`), new Promise(res => w2.once('closed', res))]);
    await espera(600);
    comprobar('la otra ventana se cerró (su proyecto, a recientes)', w2.isDestroyed() && fs.existsSync(path.join(TMP, 'la-isla.clapcraft')));
    app.emit('open-url', { preventDefault() {} }, 'clapcraft://la-isla/esquema/' + isla.eid + '/nodo/' + isla.pid);
    let w3 = null;
    for (let i = 0; i < 100 && !w3; i++) { await espera(100); w3 = ventanas().find(x => x !== win); }
    if (w3) { preparar(w3); if (w3.webContents.isLoading()) await new Promise(res => w3.webContents.once('did-finish-load', res)); }
    comprobar('un enlace de otro proyecto (cerrado): se abre en su ventana', !!w3);
    comprobar('y va a su sitio', !!w3 && await hasta(`const s = window.Tramas && Tramas.tablero.seleccion(); return !!s && s.id === '${isla.pid}' && /La isla/.test(document.title);`, 8000, w3));
    /* ---------- 6. el archivo cambia de nombre (Leo: «que se haga una comprobación y corrección de los enlaces si es que cambié el nombre») ---------- */
    const leerArchivo = p => JSON.parse(require('zlib').gunzipSync(fs.readFileSync(p)).toString('utf8'));
    const aviso = w => jsEn(w || win, `return document.getElementById('aviso').textContent;`);
    comprobar('el proyecto lleva dentro el nombre con que se hacen sus enlaces (se sella al escribirse)', (leerArchivo(RUTA).documentos.enlace || {}).proyecto === 'el-faro', JSON.stringify(leerArchivo(RUTA).documentos.enlace));
    r = await M.llamar('escribir_documento', { nota: ids.nid, contenido: 'Dicen que el farero **nunca** duerme.\n\nVer [La tormenta](clapcraft://el-faro/esquema/' + ids.eid + '/nodo/' + ids.p1 + ') y [la isla](clapcraft://la-isla/esquema/x).' });
    comprobar('Claude escribe enlaces dentro de una nota y se quedan como enlaces', !r.error && /href="clapcraft:\/\/el-faro\/esquema\/[^"]+\/nodo\//.test(await js(`return Claquedraw.gestor.documentos().nota('${ids.nid}').html;`)), r.texto);
    /* Cmd+clic en uno, dentro del editor: a su sitio */
    portapapeles = notaEnlace; menuClaude('Ir al enlace copiado').click();
    await hasta(`return Claquedraw.gestor.notaAbierta() === '${ids.nid}' && !!document.getElementById('editorMarco').contentWindow.document.querySelector('#editor a[href^="clapcraft://el-faro"]');`, 5000);
    await js(`Tramas.tablero.soltar(); const w = document.getElementById('editorMarco').contentWindow, a = w.document.querySelector('#editor a[href^="clapcraft://el-faro"]');
      a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })); return true;`);
    comprobar('Cmd+clic en un enlace de ClapCraft dentro del editor lleva a su sitio', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.id === '${ids.p1}' && !document.body.classList.contains('nota-abierta');`, 5000));
    /* 6a. con el proyecto abierto: el archivo se renombra en el Finder */
    await espera(2600);                                          // pasados los 2 s de «lo acaba de escribir la app»
    const RUTA2 = path.join(TMP, 'faro-final.clapcraft');
    fs.renameSync(RUTA, RUTA2);
    comprobar('renombrado con el proyecto abierto: la ventana sigue con el archivo nuevo', await hasta(`const a = Claquedraw.app.archivo(); return !!a && a.ruta === ${JSON.stringify(RUTA2)};`, 8000));
    comprobar('y dice qué pasó con los enlaces', /El archivo ahora se llama «faro-final\.clapcraft»: sus enlaces pasan a decir «faro-final» \(1 corregido dentro del proyecto\) y los que ya habías copiado siguen llevando aquí/.test(await aviso()), await aviso());
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 6000); await espera(500);
    const f2 = leerArchivo(RUTA2), n2 = f2.documentos.notas.find(x => x.id === ids.nid);
    comprobar('el archivo nuevo lleva el nombre nuevo y el de antes', JSON.stringify(f2.documentos.enlace) === JSON.stringify({ proyecto: 'faro-final', antes: ['el-faro'] }), JSON.stringify(f2.documentos.enlace));
    comprobar('los enlaces de dentro del proyecto están corregidos (y el de otro proyecto no se toca)', /clapcraft:\/\/faro-final\/esquema\//.test(n2.html) && !/clapcraft:\/\/el-faro\//.test(n2.html) && /clapcraft:\/\/la-isla\/esquema\/x/.test(n2.html), n2.html);
    comprobar('y el archivo con el nombre de antes no vuelve a aparecer', !fs.existsSync(RUTA));
    await js(`Claquedraw.app.vista('esquema'); Tramas.tablero.ir({ tipo: 'punto', id: '${ids.p2}' }); await W(200); return true;`);
    t = await copiado(async () => { menuClaude('Copiar enlace para Claude').click(); });
    comprobar('los enlaces que se copian ahora llevan el nombre nuevo', t === '[Nodo «El naufragio» · esquema «Esquema»](clapcraft://faro-final/esquema/' + ids.eid + '/nodo/' + ids.p2 + ')', t);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); Tramas.tablero.soltar(); await W(100); return true;`);
    app.emit('open-url', { preventDefault() {} }, U + '/nodo/' + ids.p3);
    comprobar('un enlace con el nombre de antes sigue llevando aquí', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.id === '${ids.p3}';`, 5000));
    r = await M.llamar('ver_enlace', { enlace: U + '/nodo/' + ids.p1 });
    comprobar('y Claude lo sigue leyendo (y sabe que es un nombre de antes)', !r.error && /El enlace lleva un nombre de antes del archivo, «el-faro»: ahora el proyecto es «faro-final»/.test(r.texto) && /NODO p\d+ «La tormenta»/.test(r.texto), r.texto);
    /* 6b. con ClapCraft cerrado (la ventana se vuelve a abrir con su proyecto): se le encuentra por su identidad */
    const pidF = await js(`return Claquedraw.app.abiertoId();`);
    await espera(1500);
    await win.webContents.loadURL('about:blank'); await espera(500);
    const RUTA3 = path.join(TMP, 'faro-3.clapcraft');
    fs.renameSync(RUTA2, RUTA3); await espera(900);
    await win.loadFile(path.join(__dirname, '..', 'claquedraw.html'), { query: { p: pidF } });
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.abiertoId());`, 8000);
    comprobar('renombrado con ClapCraft cerrado: al volver, la ventana lo encuentra (su inodo) y sigue con él', await hasta(`const a = Claquedraw.app.archivo(); return !!a && a.ruta === ${JSON.stringify(RUTA3)};`, 8000));
    comprobar('y corrige sus enlaces', await hasta(`return /clapcraft:\\/\\/faro-3\\/esquema\\//.test(Claquedraw.gestor.documentos().nota('${ids.nid}').html);`, 5000));
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 6000); await espera(500);
    comprobar('con todos sus nombres de antes', JSON.stringify(leerArchivo(RUTA3).documentos.enlace) === JSON.stringify({ proyecto: 'faro-3', antes: ['faro-final', 'el-faro'] }), JSON.stringify(leerArchivo(RUTA3).documentos.enlace));
    /* 6c. con el proyecto cerrado: se renombra y luego se abre */
    await Promise.race([jsEn(w3, `await Claquedraw.app.cerrar(); return true;`), new Promise(res => w3.once('closed', res))]);
    await espera(500);
    const ISLA = path.join(TMP, 'la-isla.clapcraft'), ISLA2 = path.join(TMP, 'isla-2.clapcraft');
    fs.renameSync(ISLA, ISLA2);
    await js(`await Claquedraw.app.abrirRuta(${JSON.stringify(ISLA2)}); return true;`);
    let w4 = null;
    for (let i = 0; i < 100 && !w4; i++) { await espera(100); w4 = ventanas().find(x => x !== win); }
    if (w4) { preparar(w4); if (w4.webContents.isLoading()) await new Promise(res => w4.webContents.once('did-finish-load', res)); }
    comprobar('renombrado con el proyecto cerrado: al abrirlo, se da cuenta y se pone al día', !!w4 && await hasta(`return /El archivo ahora se llama «isla-2\\.clapcraft»/.test(document.getElementById('aviso').textContent);`, 8000, w4));
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 6000, w4); await espera(600);
    comprobar('su archivo, con el nombre nuevo y el de antes', JSON.stringify(leerArchivo(ISLA2).documentos.enlace) === JSON.stringify({ proyecto: 'isla-2', antes: ['la-isla'] }), JSON.stringify(leerArchivo(ISLA2).documentos.enlace));
    app.emit('open-url', { preventDefault() {} }, 'clapcraft://la-isla/esquema/' + isla.eid + '/nodo/' + isla.pid);
    comprobar('el enlace viejo a ese proyecto (el que quedó en la nota de El faro) lleva a su ventana', !!w4 && await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.id === '${isla.pid}';`, 6000, w4));
    /* 6d. una copia no es un renombrado */
    const COPIA = path.join(TMP, 'faro-copia.clapcraft');
    fs.copyFileSync(RUTA3, COPIA); const bytesCopia = fs.readFileSync(COPIA);
    await js(`await Claquedraw.app.abrirRuta(${JSON.stringify(COPIA)}); return true;`);
    let w5 = null;
    for (let i = 0; i < 100 && !w5; i++) { await espera(100); w5 = ventanas().find(x => x !== win && x !== w4); }
    if (w5) { preparar(w5); if (w5.webContents.isLoading()) await new Promise(res => w5.webContents.once('did-finish-load', res)); }
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.abiertoId());`, 8000, w5);
    await espera(2500);
    comprobar('una copia abierta (el original sigue ahí) no se toma por un renombrado ni se reescribe', !!w5 && fs.readFileSync(COPIA).equals(bytesCopia) && !/ahora se llama/.test(await aviso(w5)));
    await jsEn(w5, `const m = Tramas.tablero.modelo(); m.editarPunto(m.datos.puntos[0].id, { titulo: 'Cambiado en la copia' }); Tramas.tablero.render(); await W(100); await Claquedraw.app.guardar(); await W(400); return true;`);
    const fc = leerArchivo(COPIA);
    comprobar('al escribirse, la copia toma su propio nombre (los del original, de reserva) y sus enlaces siguen apuntando al original', JSON.stringify(fc.documentos.enlace) === JSON.stringify({ proyecto: 'faro-copia', antes: ['faro-3', 'faro-final', 'el-faro'] }) && /clapcraft:\/\/faro-3\//.test(fc.documentos.notas.find(x => x.id === ids.nid).html), JSON.stringify(fc.documentos.enlace));
    app.emit('open-url', { preventDefault() {} }, 'clapcraft://faro-3/esquema/' + ids.eid + '/nodo/' + ids.p2);
    comprobar('con el original ahí, sus enlaces siguen yendo al original (no a la copia)', await hasta(`const s = Tramas.tablero.seleccion(); return !!s && s.id === '${ids.p2}';`, 6000) && !(await jsEn(w5, `const s = Tramas.tablero.seleccion(); return !!s && s.id === '${ids.p2}';`)));
    /* 6e. desde «Recientes»: el proyecto se cerró, su archivo se renombró y se vuelve a abrir desde su entrada */
    await Promise.race([jsEn(w5, `await Claquedraw.app.cerrar(); return true;`), new Promise(res => w5.once('closed', res))]);
    await espera(500);
    const COPIA2 = path.join(TMP, 'faro-copia-2.clapcraft');
    fs.renameSync(COPIA, COPIA2);
    comprobar('los recientes recuerdan la identidad del archivo', await js(`const r = Claquedraw.app.recientes().find(x => x.ruta === ${JSON.stringify(COPIA)}); return !!(r && r.ino);`));
    await js(`await Claquedraw.app.abrirReciente(${JSON.stringify(COPIA)}); return true;`);
    let w6 = null;
    for (let i = 0; i < 100 && !w6; i++) { await espera(100); w6 = ventanas().find(x => x !== win && x !== w4); }
    if (w6) { preparar(w6); if (w6.webContents.isLoading()) await new Promise(res => w6.webContents.once('did-finish-load', res)); }
    comprobar('abrir un reciente cuyo archivo se renombró: se encuentra y se pone al día', !!w6 && await hasta(`const a = Claquedraw.app.archivo(); return !!a && a.ruta === ${JSON.stringify(COPIA2)} && /El archivo ahora se llama «faro-copia-2\.clapcraft»/.test(document.getElementById('aviso').textContent);`, 8000, w6));
    /* 6f. un proyecto de antes (sin sello) que se renombra con él abierto: su nombre de antes es el del archivo que se renombró */
    const Tm = require('../js/tramas/modelo.js'); require('../js/claquedraw/documentos.js');
    const dv = new globalThis.Claquedraw.Documentos(null), cv = dv.crearContenedor('Viejo').contenedor; dv.crearEsquema(cv.id, Tm.inicial(), 'Esquema');
    const VIEJO = path.join(TMP, 'proyecto-viejo.clapcraft'), NUEVO = path.join(TMP, 'proyecto-nuevo.clapcraft');
    fs.writeFileSync(VIEJO, require('zlib').gzipSync(JSON.stringify({ app: 'clapcraft', formato: 2, nombre: 'Proyecto viejo', documentos: dv.datos })));
    const bytesViejo = fs.readFileSync(VIEJO);
    await js(`await Claquedraw.app.abrirRuta(${JSON.stringify(VIEJO)}); return true;`);
    let w7 = null;
    for (let i = 0; i < 100 && !w7; i++) { await espera(100); w7 = ventanas().find(x => x !== win && x !== w4 && x !== w6); }
    if (w7) { preparar(w7); if (w7.webContents.isLoading()) await new Promise(res => w7.webContents.once('did-finish-load', res)); }
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.app.archivo());`, 8000, w7);
    await espera(2600);
    comprobar('un proyecto de antes (sin sello) no se reescribe al abrirlo', fs.readFileSync(VIEJO).equals(bytesViejo));
    fs.renameSync(VIEJO, NUEVO);
    comprobar('renombrado con él abierto, la ventana sigue con el archivo', !!w7 && await hasta(`const a = Claquedraw.app.archivo(); return !!a && a.ruta === ${JSON.stringify(NUEVO)};`, 8000, w7));
    await hasta(`return document.getElementById('estadoGuardado').className.includes('ok');`, 6000, w7); await espera(600);
    comprobar('y su nombre de antes, el del archivo que se renombró, queda de reserva', JSON.stringify(leerArchivo(NUEVO).documentos.enlace) === JSON.stringify({ proyecto: 'proyecto-nuevo', antes: ['proyecto-viejo'] }), JSON.stringify(leerArchivo(NUEVO).documentos.enlace));
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
