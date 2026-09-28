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
require('../js/claquedraw/lienzo-modelo.js');
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
test('MCP: la memoria de estilo en el archivo (1.1.60) — recordar, la general va al proyecto, ver_proyecto, el encargo, olvidar y revertir', async () => {
  const ruta = archivo('Estilo'), c = cliente();
  try {
    await c.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    let r = await c.llamar('recordar_estilo', { proyecto: ruta, regla: 'Diálogos secos, sin muletillas', ejemplo: { antes: 'Bueno, pues, no sé.', despues: 'No sé.' } });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /Aprendido: «Diálogos secos, sin muletillas» · memoria de estilo del proyecto/);
    const id1 = /historial de Claude como (\S+):/.exec(r.texto)[1];
    r = await c.llamar('recordar_estilo', { proyecto: ruta, regla: 'Tutea al lector', ambito: 'general' });
    assert.match(r.texto, /solo existe dentro de la app de ClapCraft: la apunté en la del proyecto/);
    r = await c.llamar('recordar_estilo', { proyecto: ruta, regla: 'diálogos muy secos y sin muletillas' });
    assert.match(r.texto, /Ya estaba \(ahora 2 veces\)/);
    let d = leer(ruta).documentos;
    assert.deepEqual(d.memoriaEstilo.map(x => [x.texto, x.veces, x.origen]), [['diálogos muy secos y sin muletillas', 2, 'chat'], ['Tutea al lector', 1, 'chat']]);
    assert.equal(d.memoriaEstilo[0].ejemplo.despues, 'No sé.');
    r = await c.llamar('ver_proyecto', { proyecto: ruta });
    assert.match(r.texto, /MEMORIA DE ESTILO[^\n]*:\n  - \S+ \[proyecto, 2 veces\] diálogos muy secos y sin muletillas\n  - \S+ \[proyecto\] Tutea al lector/);
    r = await c.llamar('leer_documento', { proyecto: ruta, esquema: 'Piloto' });
    await c.llamar('escribir_documento', { proyecto: ruta, esquema: 'Piloto', contenido: 'INT. FARO - NOCHE\n\nMara sube.' });
    r = await c.llamar('leer_documento', { proyecto: ruta, esquema: 'Piloto' });
    assert.match(r.texto, /Memoria de estilo: 2 reglas de cómo quiere Leo que suene/);
    /* el encargo de una operación del lienzo la lleva */
    await c.llamar('editar_proyecto', { proyecto: ruta, operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Taller' }] });
    await c.llamar('editar_lienzo', { proyecto: ruta, lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'generar', instruccion: 'la escena', destino: { esquema: 'Piloto' }, ref: 'g' }] });
    d = leer(ruta).documentos;
    r = await c.llamar('ejecutar_nodo', { proyecto: ruta, lienzo: 'Taller', nodo: d.contenedores[0].lienzos[0].nodos[0].id });
    assert.match(r.texto, /ESTILO DE LEO[^\n]*\n  │ Reglas:\n  │ - diálogos muy secos y sin muletillas \(p\. ej\. «Bueno, pues, no sé\.» → «No sé\.»\)\n  │ - Tutea al lector/);
    r = await c.llamar('olvidar_estilo', { proyecto: ruta, regla: 'tutea al lector' });
    assert.match(r.texto, /Olvidado: «Tutea al lector»/);
    r = await c.llamar('olvidar_estilo', { proyecto: ruta, regla: 'nada de esto' });
    assert.equal(r.error, true);
    r = await c.llamar('ver_historial', { proyecto: ruta });
    assert.match(r.texto, /Olvidó una regla de estilo: «tutea al lector»/);
    assert.match(r.texto, /Aprendió: «Diálogos secos, sin muletillas»/);
    /* revertir lo primero: la regla vuelve a como estaba antes de ese cambio (se tocó después: con forzar) */
    r = await c.llamar('revertir_cambio', { proyecto: ruta, cambio: id1, forzar: true });
    assert.equal(r.error, false, r.texto);
    d = leer(ruta).documentos;
    assert.ok(!d.memoriaEstilo || !d.memoriaEstilo.some(x => /secos/.test(x.texto)), 'revertida: ' + JSON.stringify(d.memoriaEstilo));
  } finally { await c.cerrar(); }
});
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
  const llamar = async (name, args) => { const r = await pedir('tools/call', { name, arguments: args }); return { error: !!r.result.isError, texto: r.result.content[0].text, contenido: r.result.content }; };
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
      'leer_biblioteca', 'editar_biblioteca', 'editar_proyecto', 'preparar_fragmentos', 'leer_lienzo', 'editar_lienzo', 'ejecutar_nodo', 'completar_nodo', 'buscar', 'ver_enlace', 'ver_historial', 'revertir_cambio', 'usar_formula', 'recordar_estilo', 'olvidar_estilo', 'preparar_obra', 'dirigir_obra', 'duende_personaje', 'leer_teatro', 'editar_teatro', 'mostrar_en_clapcraft', 'crear_proyecto']);
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
    assert.equal(guardado.app, 'clapcraft'); assert.equal(guardado.formato, 4); assert.equal(guardado.nombre, 'Faro');
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

/* un PNG de verdad (RGB), para ver que la imagen de una nota llega a Claude como contenido de imagen, reducida */
function png(ancho, alto) {
  const crc = b => { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const trozo = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(ancho, 0); ih.writeUInt32BE(alto, 4); ih[8] = 8; ih[9] = 2;
  const fila = Buffer.alloc(1 + ancho * 3); for (let x = 0; x < ancho; x++) fila[1 + x * 3] = x % 256;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ih), trozo('IDAT', zlib.deflateSync(Buffer.concat(Array(alto).fill(fila)))), trozo('IEND', Buffer.alloc(0))]);
}
test('MCP: ejecutar_nodo de un lienzo devuelve el encargo y las imágenes de sus notas como contenido de imagen (1.1.58)', async () => {
  const docs = new C.Documentos(null);
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const e = docs.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const b = docs.crearSub(c.id, 'Ideas').sub, n = docs.crearNota(b.id, null, 'Referencia').nota;
  docs.guardarNota(n.id, { title: 'Referencia', html: '<p>Así es la playa.</p><p><img src="data:image/png;base64,' + png(1800, 900).toString('base64') + '" alt="playa"></p>', characters: {} });
  const l = docs.crearLienzo(c.id, 'Taller').lienzo, m = docs.modeloLienzo(l.id);
  const nn = m.crearNodo('nota', 0, 0, { notaId: n.id }).nodo, g = m.crearNodo('generar', 400, 0, { instruccion: 'Escribe', destino: { eid: e.id } }, { titulo: 'Escena' }).nodo;
  m.conectar(nn.id, g.id, 'contexto'); m.pedir(g.id); docs.guardarLienzo(l.id, m);
  const ruta = path.join(dir, 'Lienzo.clapcraft');
  fs.writeFileSync(ruta, zlib.gzipSync(JSON.stringify({ app: 'clapcraft', formato: 2, nombre: 'Lienzo', documentos: docs.datos })));
  const antes = fs.readFileSync(ruta), c2 = cliente();
  try {
    await c2.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    let r = await c2.llamar('leer_lienzo', { proyecto: ruta, lienzo: 'Taller' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /PENDIENTES, en el orden en que se ejecutan: \S+ «Escena»/);
    r = await c2.llamar('ejecutar_nodo', { proyecto: ruta, lienzo: 'Taller', nodo: 'Escena' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /^ENCARGO · GENERAR GUION/);
    assert.match(r.texto, /IMAGEN 1 \(nota «Referencia», bloque 2\) · descripción: «playa» → va adjunta/);
    assert.equal(r.contenido.length, 2);
    assert.equal(r.contenido[1].type, 'image');
    if (process.platform === 'darwin') {
      const b2 = Buffer.from(r.contenido[1].data, 'base64');
      assert.equal(r.contenido[1].mimeType, 'image/jpeg');
      assert.deepEqual([b2[0], b2[1]], [0xff, 0xd8], 'un JPEG');
      assert.ok(b2.length < 200e3, 'reducida');
    }
    assert.deepEqual(fs.readFileSync(ruta), antes, 'leer y ejecutar_nodo no escriben');
    /* completar_nodo escribe en el archivo, con su historial */
    r = await c2.llamar('escribir_documento', { proyecto: ruta, esquema: 'Piloto', contenido: 'INT. PLAYA - DÍA\n\nMara camina.' });
    r = await c2.llamar('completar_nodo', { proyecto: ruta, lienzo: 'Taller', nodo: 'Escena', salida: { tipo: 'documento', esquema: 'Piloto' } });
    assert.equal(r.error, false, r.texto);
    const d = leer(ruta).documentos, lz = d.contenedores[0].lienzos[0];
    assert.equal(lz.nodos.find(x => x.titulo === 'Escena').estado, 'hecho');
    assert.match(d.historialClaude[d.historialClaude.length - 1].titulo, /^Completó «Escena» del lienzo «Taller»$/);
  } finally { await c2.cerrar(); }
  /* en vivo: la app devuelve las imágenes por el puente y el servidor las reduce igual */
  const app = await appFalsa(ruta), c3 = cliente();
  try {
    await c3.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    const r = await c3.llamar('ejecutar_nodo', { lienzo: 'Taller', nodo: 'Escena' });
    assert.equal(r.error, false, r.texto);
    assert.ok(app.recibidas.some(m => m.tipo === 'herramienta' && m.nombre === 'ejecutar_nodo'), 'lo hizo la app');
    assert.equal(r.contenido.length, 2);
    assert.equal(r.contenido[1].type, 'image');
    if (process.platform === 'darwin') assert.equal(r.contenido[1].mimeType, 'image/jpeg');
  } finally { await c3.cerrar(); await app.cerrar(); }
});

/* las fórmulas (1.1.60) por MCP, con el proyecto cerrado: crear una aplana el Markdown en el archivo, usar_formula da su texto y
   ejecutar_nodo compone la instrucción de una operación con sus fórmulas en su orden (y avisa de la rota) */
test('MCP: fórmulas en el archivo — crear (aplanada), usar_formula y el encargo compuesto de un nodo generar', async () => {
  const ruta = archivo('Formulas'), c = cliente();
  try {
    await c.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    let r = await c.llamar('editar_biblioteca', { proyecto: ruta, biblioteca: 'Fórmulas', operaciones: [
      { op: 'crear_nota', titulo: 'Noir', contenido: '## Tono **noir**\n\n{{instruccion}}\n\n*Frases cortas.*', ref: 'a' },
      { op: 'crear_nota', titulo: 'Final', contenido: 'Termina con una pregunta.', ref: 'b' },
      { op: 'crear_nota', titulo: 'Borrada', contenido: 'Nada.', ref: 'c' }] });
    assert.equal(r.error, false, r.texto);
    let d = leer(ruta).documentos;
    const noir = d.notas.find(n => n.titulo === 'Noir');
    assert.equal(noir.subId, 'formulas:biblioteca');
    assert.equal(noir.html, '<p>Tono noir</p><p><br></p><p>{{instruccion}}</p><p><br></p><p>Frases cortas.</p>', 'aplanada a párrafos simples');
    r = await c.llamar('usar_formula', { proyecto: ruta, formula: 'noir' });
    assert.match(r.texto, /^FÓRMULA «Noir» · id \S+\n.*\{\{instruccion\}\}[\s\S]*\n\nTono noir\n\n\{\{instruccion\}\}\n\nFrases cortas\.$/);
    r = await c.llamar('editar_proyecto', { proyecto: ruta, operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Taller' }] });
    r = await c.llamar('editar_lienzo', { proyecto: ruta, lienzo: 'Taller', operaciones: [
      { op: 'crear_nodo', tipo: 'texto', texto: 'Mara vuelve al faro.', ref: 't' },
      { op: 'crear_nodo', tipo: 'generar', instruccion: 'la escena del faro', formulas: ['Final', 'Noir', 'Borrada'], destino: { esquema: 'Piloto' }, ref: 'g' },
      { op: 'conectar', de: '$t', a: '$g' }] });
    assert.equal(r.error, false, r.texto);
    await c.llamar('editar_biblioteca', { proyecto: ruta, biblioteca: 'Fórmulas', operaciones: [{ op: 'tirar_nota', nota: 'Borrada' }] });
    d = leer(ruta).documentos;
    const g = d.contenedores[0].lienzos[0].nodos.find(n => n.tipo === 'generar');
    r = await c.llamar('ejecutar_nodo', { proyecto: ruta, lienzo: 'Taller', nodo: g.id });
    assert.equal(r.error, false, r.texto);
    const t = r.texto, k = s => t.indexOf(s);
    assert.ok(k('Fórmula «Final»') > 0 && k('Fórmula «Final»') < k('Termina con una pregunta.') && k('Termina con una pregunta.') < k('Fórmula «Noir»')
      && k('Fórmula «Noir»') < k('la escena del faro') && k('la escena del faro') < k('Frases cortas.') && k('Frases cortas.') < k('ENTRADAS'), 'en su orden, lo escrito dentro de «Noir»');
    assert.ok(!t.includes('Instrucción de Leo'));
    assert.match(t, /OJO: una fórmula elegida ya no está \(\S+ «Borrada» ROTA: está en la papelera\)/);
  } finally { await c.cerrar(); }
});

test('revisión del port · MCP: escribe con el formato 4, y un proyecto de una versión más nueva se lee pero no se reescribe', async () => {
  try { fs.unlinkSync(PUENTE); } catch (_) {}
  const ruta = archivo('Futuro'), c = cliente();
  try {
    await c.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    let r = await c.llamar('escribir_documento', { proyecto: ruta, esquema: 'Piloto', contenido: 'INT. FARO - NOCHE\n\nMara sube.' });
    assert.equal(r.error, false, r.texto);
    assert.equal(leer(ruta).formato, 4, 'lo que escribe el servidor va con el formato de esta versión');
    /* lo escribe una versión más nueva (formato 5, con algo que esta no conoce) */
    const x = leer(ruta); x.formato = 5; x.documentos.algoNuevo = { de: 'la 1.2' };
    fs.writeFileSync(ruta, zlib.gzipSync(JSON.stringify(x)));
    const antes = fs.readFileSync(ruta);
    r = await c.llamar('escribir_documento', { proyecto: ruta, esquema: 'Piloto', contenido: 'Otra cosa.' });
    assert.equal(r.error, true);
    assert.match(r.texto, /versión más nueva de ClapCraft/);
    r = await c.llamar('editar_proyecto', { proyecto: ruta, operaciones: [{ op: 'crear_contenedor', nombre: 'Otro' }] });
    assert.equal(r.error, true);
    assert.ok(fs.readFileSync(ruta).equals(antes), 'el archivo no se tocó');
    r = await c.llamar('leer_documento', { proyecto: ruta, esquema: 'Piloto' });
    assert.equal(r.error, false, r.texto);
    assert.match(r.texto, /versión más nueva de ClapCraft: lo lees con lo que esta versión conoce/);
    assert.match(r.texto, /Mara sube/);
  } finally { await c.cerrar(); }
});
