/* Mono del esquema: una sesión larga de clics, arrastres y teclas **al azar pero reproducibles** sobre el
   tablero de la app de verdad (Electron, `sendInputEvent`), comprobando cada diez gestos las invariantes del
   modelo, que el DOM cuadra con él, que nada se perdería al guardar y que la página no ha soltado ningún error.
   Nació del debugueo del 20-09-2026 (1.1.48). Se ejecuta con `npm run test:esquema` (o
   `electron pruebas/mono-esquema.js <semilla> <gestos>`); trabaja en un proyecto nuevo, en una carpeta temporal,
   así que no toca nada de lo que haya en el equipo. Una semilla que falle se repite tal cual para depurarla. */
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-mono-'));
app.setPath('userData', path.join(TMP, 'datos'));
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(TMP, 'x.clapcraft') });
/* Con `MONO_ARCHIVO=<ruta.clapcraft>` el mono trabaja sobre **una copia** de ese proyecto (los datos de verdad
   tienen formas que un proyecto recién creado no tiene); el original no se toca. */
const ORIGEN = process.env.MONO_ARCHIVO || '';
const COPIA = ORIGEN ? path.join(TMP, path.basename(ORIGEN)) : '';
if (ORIGEN) { fs.copyFileSync(ORIGEN, COPIA); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [COPIA] }); }
require(path.join(REPO, 'electron/main.js'));
const espera = ms => new Promise(r => setTimeout(r, ms));
let semilla = +process.argv[2] || 1;
const GESTOS = +process.argv[3] || 120;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const ent = n => Math.floor(rnd() * n);
let fallos = 0;
setTimeout(() => { console.log('\n✖ se colgó'); app.exit(2); }, 600000);

const INV = `window.__inv = function () {
  const m = Tramas.tablero.modelo(), d = m.datos, f = [];
  const L = new Map(d.lineas.map(l => [l.id, l])), P = new Map(d.puntos.map(p => [p.id, p]));
  if (d.columnas < 1) f.push('columnas < 1');
  if (!d.lineas.length) f.push('sin tramas');
  if (!d.lineas.some(l => l.tipo === 'principal')) f.push('sin trama principal');
  if (!d.lineas.some(l => !l.oculta)) f.push('todas las tramas ocultas');
  let fin = 0;
  d.actos.forEach(a => { if (a.celdas < 1) f.push('acto de ' + a.celdas + ' celdas');
    if (a.desde < fin) f.push('actos que se pisan'); fin = a.desde + a.celdas;
    if (fin > d.columnas) f.push('acto fuera de las columnas'); });
  const cel = new Set();
  d.puntos.forEach(p => { if (!L.has(p.lineaId)) f.push('nodo sin trama');
    if (!(p.col >= 0 && p.col < d.columnas)) f.push('nodo fuera de las columnas');
    const k = p.lineaId + '|' + p.col; if (cel.has(k)) f.push('dos nodos en la misma celda'); cel.add(k); });
  const ext = new Set();
  d.saltos.forEach(s => { const a = P.get(s.deId), b = P.get(s.aId);
    if (!a || !b) { f.push('salto con un extremo que no existe'); return; }
    if (a.lineaId === b.lineaId) f.push('salto dentro de la misma trama');
    if (a.col !== b.col) f.push('salto con extremos en columnas distintas');
    if (ext.has(a.id) || ext.has(b.id)) f.push('un nodo en dos saltos'); ext.add(a.id); ext.add(b.id);
    const alt = (L.get(a.lineaId)||{}).tipo === 'alterna' || (L.get(b.lineaId)||{}).tipo === 'alterna';
    if (alt && s.tipo === 'cuadro') f.push('cuadro tocando una alternativa'); });
  d.notas.forEach(n => {
    if (n.abierta) { if (!L.has(n.lineaId)) f.push('nota de raya sin trama');
      if (!(n.col >= 0 && n.col < d.columnas)) f.push('nota de raya fuera de las columnas'); return; }
    const a = P.get(n.deId); if (!a) { f.push('nota sin nodo'); return; }
    if (n.aId) { const b = P.get(n.aId); if (!b) { f.push('nota con aId inexistente'); return; }
      if (a.lineaId !== b.lineaId) f.push('nota entre tramas distintas (se perdería al guardar)');
      else { const sig = m.siguienteEnTrama(a.id); if (!sig || sig.id !== b.id) f.push('nota entre nodos no consecutivos'); } } });
  const copia = new Tramas.Modelo(JSON.parse(JSON.stringify(m.toJSON())));
  if (copia.datos.notas.length !== d.notas.length) f.push('al guardar se perderían ' + (d.notas.length - copia.datos.notas.length) + ' notas');
  if (copia.datos.puntos.length !== d.puntos.length) f.push('al guardar se perderían ' + (d.puntos.length - copia.datos.puntos.length) + ' nodos');
  if (copia.datos.saltos.length !== d.saltos.length) f.push('al guardar se perderían saltos');
  const vis = d.lineas.filter(l => !l.oculta);
  const filas = document.querySelectorAll('#rows .row[data-linea]').length;
  if (filas !== vis.length) f.push('filas en pantalla ' + filas + ' ≠ tramas visibles ' + vis.length);
  return f;
}`;

app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await espera(50);
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  const errores = [];
  win.webContents.on('console-message', (ev) => { const n = ev.level ?? ev.params?.level, msg = ev.message ?? ev.params?.message;
    if (n === 'error' || n === 3) errores.push(msg); });
  win.webContents.setBackgroundThrottling(false);
  win.setSize(1500, 950); win.show(); win.focus(); win.webContents.focus();
  const js = c => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${c} })()`, true);
  const ev = (o) => win.webContents.sendInputEvent(o);
  const raton = async (t, x, y, e2) => { ev(Object.assign({ type: t, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }, e2 || {})); await espera(25); };
  const tecla = async (k, mods) => { ev({ type: 'keyDown', keyCode: k, modifiers: mods || [] });
    if (k.length === 1) ev({ type: 'char', keyCode: k, modifiers: mods || [] });
    ev({ type: 'keyUp', keyCode: k, modifiers: mods || [] }); await espera(50); };

  if (COPIA) {
    await js(`for (let i = 0; i < 100 && !(window.Claquedraw && Claquedraw.app); i++) await W(50); await W(600);
      await Claquedraw.app.abrirArchivo(); await W(2500); Claquedraw.app.vista('esquema'); await W(800); ${INV}; return true;`);
    const cuales = await js(`const d = Claquedraw.gestor.documentos(); const cs = d.contenedores();
      const out = []; (cs.fijados || []).concat(cs.sueltos || []).forEach(c => d.esquemasDe(c.id).forEach(e => out.push({ id: e.id, nombre: e.nombre })));
      return out;`);
    const cual = cuales[+process.argv[4] || 0] || cuales[0];
    if (cual) await js(`Claquedraw.app.montarEsquema(${JSON.stringify(cual.id)}); Claquedraw.app.vista('esquema'); await W(900); return true;`);
    console.log('  sobre una copia de ' + path.basename(ORIGEN) + (cual ? ' · esquema «' + cual.nombre + '»' : ''));
  } else await js(`for (let i = 0; i < 100 && !(window.Claquedraw && Claquedraw.app); i++) await W(50);
    if (!Claquedraw.biblioteca.total()) { Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Mono', plantilla: 'blanco' }); }
    await W(900); Claquedraw.app.vista('esquema'); await W(500);
    const m = Tramas.tablero.modelo(); m.asegurarCeldas(16);
    const ls = [m.datos.lineas[0].id];
    ls.push(m.nuevaLinea('secundaria').linea.id, m.nuevaLinea('alterna').linea.id);
    const ps = [];
    for (let i = 0; i < 9; i++) ps.push(m.nuevoPunto(ls[i % 3], 1 + Math.floor(i / 3) * 4 + (i % 3), { titulo: 'Nodo ' + i }).punto);
    m.crearNota(ps[0].id, null, 'nota A'); m.crearNota(ps[3].id, null, 'nota B');
    m.crearNotaAbierta(ls[1], 9, 'nota de raya');
    m.crearSalto(ps[1].id, ls[1], 'cuadro');
    Tramas.tablero.render(); await W(400); ${INV}; return true;`);

  const caja = await js(`const b = document.getElementById('board').getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };`);
  const dentro = () => ({ x: caja.x + 60 + ent(Math.max(50, caja.w - 120)), y: caja.y + 30 + ent(Math.max(50, caja.h - 60)) });
  const historia = [];
  for (let i = 0; i < GESTOS; i++) {
    const a = ent(12);
    const p1 = dentro(), p2 = dentro();
    historia.push(a); if (historia.length > 10) historia.shift();
    if (a <= 2) { await raton('mouseMove', p1.x, p1.y); await raton('mouseDown', p1.x, p1.y); await raton('mouseUp', p1.x, p1.y); }
    else if (a <= 5) {                                    // arrastre
      await raton('mouseMove', p1.x, p1.y); await raton('mouseDown', p1.x, p1.y);
      for (let k = 1; k <= 6; k++) await raton('mouseMove', p1.x + (p2.x - p1.x) * k / 6, p1.y + (p2.y - p1.y) * k / 6, { buttons: 1 });
      await raton('mouseUp', p2.x, p2.y);
    }
    else if (a === 6) { await raton('mouseMove', p1.x, p1.y); ev({ type: 'mouseDown', x: Math.round(p1.x), y: Math.round(p1.y), button: 'right', clickCount: 1 });
      ev({ type: 'mouseUp', x: Math.round(p1.x), y: Math.round(p1.y), button: 'right', clickCount: 1 }); await espera(150); }
    else if (a === 7) await tecla(['Escape', 'Delete', 'Backspace'][ent(3)]);
    else if (a === 8) await tecla(['z', 'c', 'v', 'd'][ent(4)], ['cmd']);
    else if (a === 9) { await raton('mouseMove', p1.x, p1.y); await espera(200); }        // pasar el ratón (hover)
    else if (a === 10) await js(`Tramas.tablero.vista(${(0.6 + ent(20) / 10).toFixed(2)}); await W(150); return true;`);
    else await js(`document.getElementById('board').scrollLeft += ${ent(600) - 200}; await W(80); return true;`);
    /* un modal abierto se cierra para no atascar la sesión */
    await js(`const dl = document.querySelector('dialog[open]'); if (dl) { const b = dl.querySelector('button'); if (b) b.click(); else dl.close(); await W(150); } return true;`);
    if (i % 10 === 9) {
      const f = await js(`return window.__inv();`);
      if (f.length) { console.log(`  ✖ gesto ${i}: ${JSON.stringify(f)}\n      últimos gestos: ${historia.join(',')}`); fallos++; break; }
      if (errores.length) { console.log(`  ✖ gesto ${i}: error en la página: ${errores[0]}\n      últimos gestos: ${historia.join(',')}`); fallos++; errores.length = 0; }
    }
  }
  const fin = await js(`const m = Tramas.tablero.modelo(), d = m.datos;
    return { nodos: d.puntos.length, notas: d.notas.length, tramas: d.lineas.length, cols: d.columnas };`);
  console.log(`  semilla ${process.argv[2] || 1}: ${GESTOS} gestos · queda ${JSON.stringify(fin)}`);
  if (errores.length) { console.log('  ✖ errores en la página: ' + errores.slice(0, 3).join(' | ')); fallos++; }
  console.log(fallos ? `✖ ${fallos} fallos` : '✔ sin fallos');
  fs.rmSync(TMP, { recursive: true, force: true });
  app.exit(fallos ? 1 : 0);
});
