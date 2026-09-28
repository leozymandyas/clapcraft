/* Escribir de una vez (claude/atomico.js, 1.1.55): la app, el vigía y el servidor de Claude escriben los .clapcraft así. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../claude/atomico');

const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-atomico-'));
const temporales = dir => fs.readdirSync(dir).filter(f => f.endsWith('.tmp'));

test('escribe entero, sustituye lo que había y no deja temporales', async () => {
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft');
  await A.escribir(f, Buffer.from('uno'));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'uno');
  await A.escribir(f, new Uint8Array([100, 111, 115]));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'dos');
  A.escribirSync(f, 'tres');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'tres');
  assert.deepStrictEqual(temporales(dir), []);
});

test('conserva los permisos del archivo y pone los que se pidan a uno nuevo', async () => {
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft'), g = path.join(dir, 'puente.json');
  fs.writeFileSync(f, 'x'); fs.chmodSync(f, 0o640);
  await A.escribir(f, 'y');
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o640);
  A.escribirSync(g, '{}', 0o600);
  assert.strictEqual(fs.statSync(g).mode & 0o777, 0o600);
});

test('un enlace simbólico sigue siéndolo y se escribe su destino', async () => {
  const dir = carpeta(), real = path.join(dir, 'real.clapcraft'), enlace = path.join(dir, 'enlace.clapcraft');
  fs.writeFileSync(real, 'antes'); fs.symlinkSync(real, enlace);
  await A.escribir(enlace, 'después');
  assert.ok(fs.lstatSync(enlace).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(real, 'utf8'), 'después');
});

test('si no se puede escribir, lo que había queda intacto y sin temporales', async () => {
  if (process.getuid && process.getuid() === 0) return;        // root escribe en todas partes
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft');
  fs.writeFileSync(f, 'bueno');
  fs.chmodSync(dir, 0o555);
  try {
    await assert.rejects(A.escribir(f, 'nuevo'));
    assert.throws(() => A.escribirSync(f, 'nuevo'));
    assert.strictEqual(fs.readFileSync(f, 'utf8'), 'bueno');
    assert.deepStrictEqual(temporales(dir), []);
  } finally { fs.chmodSync(dir, 0o755); }
});

test('la huella cambia con cada escritura (otro inodo) y es null si no existe', async () => {
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft');
  assert.strictEqual(A.huella(f), null);
  await A.escribir(f, 'uno'); const h1 = A.huella(f);
  await A.escribir(f, 'uno'); const h2 = A.huella(f);
  assert.ok(h1 && h2 && h1 !== h2);
  assert.strictEqual(A.huella(f), h2);
});

test('mismoArchivo: la misma ruta, por un enlace o con otras mayúsculas si el disco no las distingue', () => {
  const dir = carpeta(), f = path.join(dir, 'Proyecto.clapcraft'), otro = path.join(dir, 'otro.clapcraft'), enlace = path.join(dir, 'enlace.clapcraft');
  fs.writeFileSync(f, 'x'); fs.writeFileSync(otro, 'y'); fs.symlinkSync(f, enlace);
  assert.ok(A.mismoArchivo(f, path.join(dir, '.', 'Proyecto.clapcraft')));
  assert.ok(A.mismoArchivo(f, enlace));
  assert.ok(!A.mismoArchivo(f, otro));
  assert.ok(!A.mismoArchivo(f, null));
  const mayus = path.join(dir, 'PROYECTO.clapcraft');
  if (fs.existsSync(mayus)) assert.ok(A.mismoArchivo(f, mayus));   // APFS por defecto
});

test('un archivo de solo lectura no se escribe, aunque la carpeta deje', async () => {
  if (process.getuid && process.getuid() === 0) return;
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft');
  fs.writeFileSync(f, 'bueno'); fs.chmodSync(f, 0o444);
  await assert.rejects(A.escribir(f, 'nuevo'), /EACCES/);
  assert.throws(() => A.escribirSync(f, 'nuevo'), /EACCES/);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'bueno');
  assert.deepStrictEqual(temporales(dir), []);
});

test('limpiar quita los temporales de una escritura cortada, no los de un proceso vivo ni los de otros archivos', () => {
  const dir = carpeta(), f = path.join(dir, 'a.clapcraft');
  fs.writeFileSync(f, 'x');
  const muerto = 2 ** 22 + 12345;                                // un pid que no existe
  const cortado = '.a.clapcraft.' + muerto + '-abc123.tmp', antiguo = '.a.clapcraft.claude-' + muerto + '.tmp';
  const vivo = '.a.clapcraft.' + process.ppid + '-def456.tmp', ajeno = '.b.clapcraft.' + muerto + '-abc123.tmp';
  [cortado, antiguo, vivo, ajeno].forEach(n => fs.writeFileSync(path.join(dir, n), 'medio'));
  assert.strictEqual(A.limpiar(f), 2);
  assert.deepStrictEqual(temporales(dir).sort(), [ajeno, vivo].sort());
});

test('revisión del port · los permisos no pasan por el umask: un 0664 sigue siendo 0664 y el modo pedido es ese', async () => {
  if (process.platform === 'win32') return;
  const dir = carpeta(), f = path.join(dir, 'grupo.clapcraft'), g = path.join(dir, 'nuevo.clapcraft');
  const antes = process.umask(0o077);
  try {
    fs.writeFileSync(f, 'uno'); fs.chmodSync(f, 0o664);
    A.escribirSync(f, 'dos');
    assert.strictEqual(fs.statSync(f).mode & 0o777, 0o664, 'escribirSync');
    await A.escribir(f, 'tres');
    assert.strictEqual(fs.statSync(f).mode & 0o777, 0o664, 'escribir');
    await A.escribir(g, 'x', 0o644);
    assert.strictEqual(fs.statSync(g).mode & 0o777, 0o644, 'el modo pedido');
  } finally { process.umask(antes); fs.rmSync(dir, { recursive: true, force: true }); }
});
