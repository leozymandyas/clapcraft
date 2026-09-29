/* El almacén de los duendes del asistente (1.1.68, electron/equipo.js): leer y escribir `equipo-duendes.json` en una carpeta
   temporal, con permisos 0600, de una vez, uno detrás de otro, el tope de 1 MB, lo que no se entiende (se aparta, no se pierde) y
   los canales `equipo:leer` / `equipo:escribir` con un ipcMain de mentira: solo las ventanas de la app, y el aviso `equipo:cambio` a
   las demás. Se ejecuta con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const E = require('../electron/equipo.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-equipo-'));
const EQ = { version: 1, modo: 'fiel', rondas: 2, sembrado: ['formateador'], duendes: [{ id: 'maestro', papel: 'maestro', fijo: true, nombre: 'El duende maestro' }] };

test('sin archivo, leer da null; escribir lo crea con 0600 y leer lo devuelve', async () => {
  const dir = tmp(), a = E.crearAlmacen(dir);
  assert.equal(a.leer(), null);
  const r = await a.escribir(EQ);
  assert.deepEqual(r, { ok: true });
  assert.equal(a.archivo, path.join(dir, 'equipo-duendes.json'));
  assert.equal(fs.statSync(a.archivo).mode & 0o777, 0o600);
  assert.deepEqual(a.leer(), EQ);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), [], 'no quedan temporales');
});

test('crea la carpeta si no existe', async () => {
  const dir = path.join(tmp(), 'no', 'existe'), a = E.crearAlmacen(dir);
  assert.deepEqual(await a.escribir(EQ), { ok: true });
  assert.deepEqual(a.leer(), EQ);
});

test('solo objetos: ni listas, ni nada, ni lo que no se puede pasar a JSON', async () => {
  const a = E.crearAlmacen(tmp());
  for (const x of [null, undefined, [], 'hola', 3]) assert.equal((await a.escribir(x)).ok, false, String(x));
  const ciclo = {}; ciclo.yo = ciclo;
  assert.equal((await a.escribir(ciclo)).ok, false);
  assert.equal(a.leer(), null, 'nada se escribió');
});

test('más de 1 MB no se escribe (y lo que había se queda)', async () => {
  const a = E.crearAlmacen(tmp());
  await a.escribir(EQ);
  const r = await a.escribir({ grande: 'x'.repeat(E.MAX + 10) });
  assert.equal(r.ok, false); assert.match(r.error, /1 MB/);
  assert.deepEqual(a.leer(), EQ);
});

test('un archivo que no se entiende da null y se aparta como .roto (no se pierde)', () => {
  const dir = tmp(), a = E.crearAlmacen(dir);
  fs.writeFileSync(a.archivo, '{ esto no es JSON');
  assert.equal(a.leer(), null);
  assert.equal(fs.readFileSync(path.join(dir, 'equipo-duendes.roto.json'), 'utf8'), '{ esto no es JSON');
  fs.writeFileSync(a.archivo, '[1, 2]');
  assert.equal(a.leer(), null, 'una lista tampoco vale');
});

test('las escrituras van una detrás de otra: la última manda', async () => {
  const a = E.crearAlmacen(tmp());
  const rs = await Promise.all([1, 2, 3, 4, 5].map(n => a.escribir(Object.assign({}, EQ, { rondas: n }))));
  assert.ok(rs.every(r => r.ok));
  assert.equal(a.leer().rondas, 5);
});

test('iniciar: los canales, solo para las ventanas de la app, y el aviso a las demás', async () => {
  const dir = tmp(), h = {};
  const ipcMain = { handle: (k, fn) => { h[k] = fn; } };
  const wc = n => ({ n, enviados: [], datos: [], send(k, x) { this.enviados.push(k); this.datos.push(x); } });
  const a1 = wc(1), a2 = wc(2), a3 = wc(3), fuera = wc(9);
  const win = w => ({ webContents: w, isDestroyed: () => false });
  const ventanas = new Map([[1, { win: win(a1) }], [2, { win: win(a2) }], [3, { win: win(a3) }]]);
  const esVentana = w => [a1, a2, a3].includes(w);
  const alm = E.iniciar({ app: { getPath: () => dir }, ipcMain, ventanas, esVentana });
  assert.deepEqual(Object.keys(h).sort(), ['equipo:escribir', 'equipo:leer']);
  assert.equal(await h['equipo:leer']({ sender: a1 }), null);
  assert.deepEqual(await h['equipo:escribir']({ sender: a1 }, EQ), { ok: true });
  assert.deepEqual(a1.enviados, [], 'la que escribe no se avisa a sí misma');
  assert.deepEqual(a2.enviados, ['equipo:cambio']);
  assert.deepEqual(a3.enviados, ['equipo:cambio']);
  assert.deepEqual(a2.datos[0], EQ, 'el aviso lleva lo escrito');
  assert.deepEqual(await h['equipo:leer']({ sender: a2 }), EQ);
  /* una ventana que no es de la app: ni lee ni escribe */
  assert.equal(await h['equipo:leer']({ sender: fuera }), null);
  const r = await h['equipo:escribir']({ sender: fuera }, { version: 1, duendes: [] });
  assert.equal(r.ok, false);
  assert.deepEqual(alm.leer(), EQ);
  /* lo que no se escribe no avisa */
  await h['equipo:escribir']({ sender: a1 }, []);
  assert.deepEqual(a2.enviados, ['equipo:cambio']);
});
