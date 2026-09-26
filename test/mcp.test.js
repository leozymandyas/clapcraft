/* Pruebas del servidor MCP de ClapCraft (claude/servidor.js) de punta a punta: se arranca como lo arranca Claude (por stdio) y
   se le habla en JSON-RPC. Con el proyecto «cerrado» trabaja sobre su archivo; con un puente de mentira que hace de la app
   abierta (un socket y su puente.json), le pasa las peticiones a ella y no toca el archivo; con la conexión apagada, no escribe
   un archivo que la app tiene abierto. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const { spawn } = require('child_process');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/enlaces.js');
const C = require('../js/claquedraw/herramientas.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');

const SERVIDOR = path.join(__dirname, '..', 'claude', 'servidor.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-mcp-'));
const PUENTE = path.join(dir, 'puente.json');
const SOCKET = path.join('/tmp', 'cc-mcp-' + process.pid + '.sock');
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} try { fs.unlinkSync(SOCKET); } catch (_) {} });

function archivo(nombre) {
  const docs = new C.Documentos(null);
  const c = docs.crearContenedor('Temporada 1').contenedor;
  docs.crearEsquema(c.id, T.inicial(), 'Piloto');
  const ruta = path.join(dir, nombre + '.clapcraft');
  fs.writeFileSync(ruta, zlib.gzipSync(JSON.stringify({ app: 'clapcraft', formato: 2, nombre, documentos: docs.datos })));
  return ruta;
}
const leer = ruta => JSON.parse(zlib.gunzipSync(fs.readFileSync(ruta)).toString('utf8'));

/* un cliente MCP por stdio */
function cliente() {
  const p = spawn(process.execPath, [SERVIDOR], { env: Object.assign({}, process.env, { CLAPCRAFT_PUENTE: PUENTE }), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0; const esperas = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = esperas.get(m.id); if (f) { esperas.delete(m.id); f(m); } } });
  p.stderr.on('data', () => {});
  const pedir = (method, params) => new Promise(r => { const k = ++id; esperas.set(k, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args }); return { error: !!r.result.isError, texto: r.result.content[0].text }; };
  return { pedir, llamar, cerrar: () => new Promise(r => { p.on('exit', r); p.stdin.end(); }) };
}

/* la app de mentira: un socket que contesta como electron/claude.js y ejecuta las herramientas sobre su propio proyecto */
function appFalsa(ruta, op) {
  op = op || {};
  const d = leer(ruta), docs = new C.Documentos(d.documentos), recibidas = [];
  const srv = net.createServer(s => {
    let buf = '';
    s.setEncoding('utf8');
    s.on('data', x => {
      buf += x; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        recibidas.push(m);
        let r;
        if (m.tipo === 'proyectos') r = { ok: true, abiertos: [{ id: 'g1', nombre: d.nombre, ruta, enlaces: op.enlaces || [] }], delante: 'g1', recientes: op.recientes || [] };
        else if (m.tipo === 'herramienta') r = { ok: true, resultado: C.herramientas.ejecutar({ docs, proyecto: { nombre: d.nombre, vivo: true }, cambio() {} }, m.nombre, m.args) };
        else r = { ok: false, error: 'no' };
        s.write(JSON.stringify(Object.assign({ id: m.id }, r)) + '\n');
      }
    });
  });
  return new Promise(res => srv.listen(SOCKET, () => {
    fs.writeFileSync(PUENTE, JSON.stringify({ pid: process.pid, activo: true, socket: SOCKET, abiertos: [{ id: 'g1', nombre: d.nombre, ruta, enlaces: op.enlaces || [] }] }));
    res({ docs, recibidas, cerrar: () => new Promise(r => { fs.unlinkSync(PUENTE); srv.close(r); }) });
  }));
}

test('MCP: saludo, lista de herramientas y, con el proyecto cerrado, lectura y escritura sobre su archivo', async () => {
  const ruta = archivo('Faro'), c = cliente();
  try {
    const ini = await c.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    assert.equal(ini.result.protocolVersion, '2025-06-18');
    assert.equal(ini.result.serverInfo.name, 'clapcraft');
    assert.match(ini.result.instructions, /ClapCraft es el programa de Leo/);
    const lista = (await c.pedir('tools/list', {})).result.tools;
    assert.deepEqual(lista.map(t => t.name), ['listar_proyectos', 'ver_proyecto', 'leer_esquema', 'editar_esquema', 'leer_documento', 'escribir_documento',
      'leer_biblioteca', 'editar_biblioteca', 'editar_proyecto', 'buscar', 'ver_enlace', 'ver_historial', 'revertir_cambio', 'mostrar_en_clapcraft', 'crear_proyecto']);
    assert.equal(lista.find(t => t.name === 'leer_esquema').annotations.readOnlyHint, true);
    assert.equal(lista.find(t => t.name === 'editar_esquema').annotations.destructiveHint, true);
    assert.equal((await c.pedir('ping', {})).result && true, true);
    assert.equal((await c.pedir('volar', {})).error.code, -32601);

    let r = await c.llamar('ver_proyecto', { proyecto: ruta });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /PROYECTO «Faro» · archivo .*Faro\.clapcraft · cerrado/);
    r = await c.llamar('editar_esquema', { proyecto: ruta, esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'La tormenta' }] });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /\(Escrito en .*Faro\.clapcraft\. ClapCraft lo verá al abrirlo\.\)/);
    const guardado = leer(ruta);
    assert.equal(guardado.app, 'clapcraft'); assert.equal(guardado.formato, 2); assert.equal(guardado.nombre, 'Faro');
    assert.equal(guardado.documentos.contenedores[0].esquemas[0].datos.puntos[0].titulo, 'La tormenta');
    assert.deepEqual(fs.readdirSync(dir).filter(f => f.includes('.tmp')), [], 'no quedan temporales');
    /* el historial de Claude va en el archivo, con quién y cómo */
    const h = guardado.documentos.historialClaude;
    assert.equal(h.length, 1);
    assert.deepEqual([h[0].titulo, h[0].origen, h[0].modo], ['Cambió el esquema «Piloto»', 'Claude Code', 'archivo']);
    r = await c.llamar('ver_historial', { proyecto: ruta });
    assert.match(r.texto, /· Claude Code · en el archivo · Cambió el esquema «Piloto»\n    1\. nodo p\d+ «La tormenta»/);
    r = await c.llamar('revertir_cambio', { proyecto: ruta, cambio: h[0].id });
    assert.equal(r.error, false, r.texto);
    const revertido = leer(ruta);
    assert.equal(revertido.documentos.contenedores[0].esquemas[0].datos.puntos.length, 0, 'revertido en el archivo');
    assert.equal(revertido.documentos.historialClaude[0].revertido.por, 'Claude Code');
    r = await c.llamar('editar_esquema', { proyecto: ruta, esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'La tormenta' }] });
    r = await c.llamar('editar_esquema', { proyecto: ruta, esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'Otra' }] });
    assert.equal(r.error, true);
    assert.match(r.texto, /Ahí ya está «La tormenta»/);
    r = await c.llamar('leer_esquema', { proyecto: 'Faro' });
    assert.equal(r.error, true, 'sin esquema no hay nada que leer');
    /* un enlace (1.1.52): ver_enlace lo lee y vale en lugar del id */
    const eid = revertido.documentos.contenedores[0].esquemas[0].id;
    r = await c.llamar('ver_enlace', { proyecto: ruta, enlace: 'Este: [Esquema «Piloto»](clapcraft://faro/esquema/' + eid + ')' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /^ENLACE clapcraft:\/\/faro\/esquema\/\S+\nEsquema «Piloto» · contenedor «Temporada 1»\nESQUEMA «Piloto»/);
    r = await c.llamar('leer_esquema', { proyecto: ruta, esquema: 'clapcraft://faro/esquema/' + eid + '/nodo/p1' });
    assert.match(r.texto, /Enlace: clapcraft:\/\/faro\/esquema\//);
    r = await c.llamar('ver_proyecto', { proyecto: path.join(dir, 'nada.clapcraft') });
    assert.match(r.texto, /No existe/);
    r = await c.llamar('crear_proyecto', { nombre: 'Año nuevo', plantilla: 'largo', ruta: dir, abrir: false });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /Proyecto «Año nuevo» creado con la plantilla «Largometraje» en .*anio-nuevo\.clapcraft/);
    assert.equal(leer(path.join(dir, 'anio-nuevo.clapcraft')).nombre, 'Año nuevo');
    assert.match(leer(path.join(dir, 'anio-nuevo.clapcraft')).documentos.historialClaude[0].titulo, /^Creó el proyecto con la plantilla «Largometraje»/);
  } finally { await c.cerrar(); }
});

test('MCP: con el proyecto abierto en la app, las peticiones van por el puente y el archivo no se toca', async () => {
  const ruta = archivo('Vivo'), antes = fs.readFileSync(ruta), app = await appFalsa(ruta), c = cliente();
  try {
    await c.pedir('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await c.llamar('listar_proyectos', {});
    assert.match(r.texto, /ABIERTOS EN CLAPCRAFT\n- «Vivo» · .*Vivo\.clapcraft · delante · id g1/);
    r = await c.llamar('editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 1, titulo: 'En vivo' }] });   // sin proyecto: el de delante
    assert.equal(r.error, false, r.texto);
    assert.doesNotMatch(r.texto, /Escrito en/);
    assert.ok(app.recibidas.some(m => m.tipo === 'herramienta' && m.nombre === 'editar_esquema' && m.proyecto.id === 'g1'));
    assert.equal(app.docs.datos.contenedores[0].esquemas[0].datos.puntos[0].titulo, 'En vivo', 'lo hizo la app');
    assert.deepEqual(fs.readFileSync(ruta), antes, 'el archivo lo escribe la app, no el servidor');
    r = await c.llamar('ver_proyecto', { proyecto: ruta });
    assert.match(r.texto, /abierto en ClapCraft/);
    assert.match(r.texto, /Enlaces: clapcraft:\/\/vivo\/…/);
    /* un enlace sin decir el proyecto: el de su archivo, abierto en la app */
    const eid = app.docs.datos.contenedores[0].esquemas[0].id, pid = app.docs.datos.contenedores[0].esquemas[0].datos.puntos[0].id;
    r = await c.llamar('ver_enlace', { enlace: '[Nodo «En vivo»](clapcraft://vivo/esquema/' + eid + '/nodo/' + pid + ')' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /NODO p\d+ «En vivo» · «Principal»/);
    assert.ok(app.recibidas.some(m => m.tipo === 'herramienta' && m.nombre === 'ver_enlace' && m.proyecto.id === 'g1'), 'lo leyó la app');
    r = await c.llamar('editar_esquema', { operaciones: [{ op: 'editar_nodo', nodo: 'clapcraft://vivo/esquema/' + eid + '/nodo/' + pid, titulo: 'En vivo, por su enlace' }] });
    assert.equal(r.error, false, r.texto);
    assert.equal(app.docs.datos.contenedores[0].esquemas[0].datos.puntos[0].titulo, 'En vivo, por su enlace', 'sin esquema ni proyecto: los del enlace');
  } finally { await c.cerrar(); await app.cerrar(); }
});

test('MCP: con la conexión apagada, un proyecto abierto en la app se lee del archivo pero no se escribe', async () => {
  const ruta = archivo('Apagado'), antes = fs.readFileSync(ruta), c = cliente();
  fs.writeFileSync(PUENTE, JSON.stringify({ pid: process.pid, activo: false, socket: null, abiertos: [{ id: 'g9', nombre: 'Apagado', ruta }] }));
  try {
    await c.pedir('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await c.llamar('leer_esquema', { proyecto: ruta, esquema: 'Piloto' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /^\(Leído del archivo: ClapCraft lo tiene abierto con la conexión apagada/);
    r = await c.llamar('editar_esquema', { proyecto: ruta, esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 1, titulo: 'No' }] });
    assert.equal(r.error, true);
    assert.match(r.texto, /la conexión con Claude está apagada/);
    assert.deepEqual(fs.readFileSync(ruta), antes);
    r = await c.llamar('listar_proyectos', {});
    assert.match(r.texto, /la conexión con Claude está APAGADA/);
  } finally { await c.cerrar(); fs.unlinkSync(PUENTE); }
});

test('MCP: un enlace con el nombre de antes del archivo (1.1.52) encuentra su proyecto, abierto o cerrado', async () => {
  /* cerrado: el archivo se renombró («Viejo» → «Nuevo») y su sello aún dice «viejo»; la app (de mentira) lo tiene en recientes */
  const rutaNuevo = archivo('Nuevo'), dN = leer(rutaNuevo);
  dN.documentos.enlace = { proyecto: 'viejo' };
  fs.writeFileSync(rutaNuevo, zlib.gzipSync(JSON.stringify(dN)));
  const eid = dN.documentos.contenedores[0].esquemas[0].id;
  const rutaAbierto = archivo('Abierto'), app = await appFalsa(rutaAbierto, { enlaces: ['abierto', 'de-antes'], recientes: [{ nombre: 'Nuevo', ruta: rutaNuevo }] }), c = cliente();
  try {
    await c.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    let r = await c.llamar('ver_enlace', { enlace: 'clapcraft://viejo/esquema/' + eid });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /ESQUEMA «Piloto»/);
    assert.match(r.texto, /El enlace lleva un nombre de antes del archivo, «viejo»: ahora el proyecto es «nuevo»/);
    /* abierto: la ventana anuncia los nombres de antes de su proyecto */
    const eidA = app.docs.datos.contenedores[0].esquemas[0].id;
    r = await c.llamar('ver_enlace', { enlace: 'clapcraft://de-antes/esquema/' + eidA });
    assert.equal(r.error, false, r.texto);
    assert.ok(app.recibidas.some(m => m.tipo === 'herramienta' && m.nombre === 'ver_enlace'), 'lo leyó la app abierta');
    r = await c.llamar('ver_enlace', { enlace: 'clapcraft://no-existe-en-ningun-sitio/esquema/x' });
    assert.equal(r.error, true);
    assert.match(r.texto, /No encuentro el proyecto del enlace/);
  } finally { await c.cerrar(); await app.cerrar(); }
});
