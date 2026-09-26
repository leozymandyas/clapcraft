/* Escribir un archivo de una vez (1.1.55): a un temporal junto a él, `fsync` y renombrarlo encima. Así nunca queda a medias: ni
   al salir de la app a mitad de la escritura, ni si el disco se llena o se va la luz, ni para quien lo lea mientras (Claude,
   iCloud, Dropbox). Antes la app escribía encima con `fs.writeFile`, que primero lo deja vacío: un proyecto grande quedaba
   cortado al salir con Cmd+Q. Lo usan electron/main.js, electron/claude.js y el servidor de Claude (claude/servidor.js).
   - Si el archivo es un enlace simbólico, se escribe en su destino (el enlace sigue siendo enlace).
   - Conserva los permisos del archivo que había (o los que se pidan, `modo`), y uno de solo lectura no se escribe (con `rename`
     se podría: la carpeta es la que manda; se respeta el del archivo, como antes).
   - `limpiar(ruta)`: los temporales que dejó una escritura cortada (la app se cerró a la fuerza a mitad), si su proceso ya no vive.
   - `mismoArchivo(a, b)`: la misma ruta, o el mismo archivo por su identidad (dispositivo e inodo): una ruta con otras mayúsculas
     en un disco que no las distingue, o por un enlace. */
const fs = require('fs');
const path = require('path');

function destinoReal(ruta) {
  try { if (fs.lstatSync(ruta).isSymbolicLink()) return fs.realpathSync(ruta); } catch (_) {}
  return ruta;
}
const temporalDe = destino => path.join(path.dirname(destino), '.' + path.basename(destino) + '.' + process.pid + '-' + Math.random().toString(36).slice(2, 8) + '.tmp');
const modoDe = destino => { try { return fs.statSync(destino).mode & 0o7777; } catch (_) { return 0o644; } };
const aBuffer = datos => typeof datos === 'string' ? Buffer.from(datos, 'utf8') : Buffer.isBuffer(datos) ? datos : Buffer.from(datos);

function sePuedeEscribir(destino) {
  try { fs.accessSync(destino, fs.constants.W_OK); }
  catch (e) { if (e.code !== 'ENOENT') { const x = new Error('EACCES: el archivo es de solo lectura, ' + destino); x.code = 'EACCES'; throw x; } }
}
async function escribir(ruta, datos, modo) {
  const destino = destinoReal(ruta), tmp = temporalDe(destino), buf = aBuffer(datos);
  sePuedeEscribir(destino);
  const fsp = fs.promises;
  let h = null;
  try {
    h = await fsp.open(tmp, 'wx', modo || modoDe(destino));
    await h.writeFile(buf);
    await h.sync();
    await h.close(); h = null;
    await fsp.rename(tmp, destino);
  } catch (e) {
    if (h) { try { await h.close(); } catch (_) {} }
    try { await fsp.unlink(tmp); } catch (_) {}
    throw e;
  }
  sincronizarCarpeta(destino);
}
function escribirSync(ruta, datos, modo) {
  const destino = destinoReal(ruta), tmp = temporalDe(destino), buf = aBuffer(datos);
  sePuedeEscribir(destino);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', modo || modoDe(destino));
    fs.writeFileSync(fd, buf);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tmp, destino);
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  sincronizarCarpeta(destino);
}
/* que el renombrado también quede en el disco (en macOS y Linux; en Windows no se puede abrir una carpeta) */
function sincronizarCarpeta(destino) {
  if (process.platform === 'win32') return;
  let fd = null;
  try { fd = fs.openSync(path.dirname(destino), 'r'); fs.fsyncSync(fd); } catch (_) {}
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} } }
}

/* la identidad de un archivo y lo que se sabe de su última versión: si otro lo cambia, cambia (tamaño, fecha o inodo) */
function huella(ruta) {
  try { const st = fs.statSync(ruta); return st.dev + ':' + st.ino + ':' + st.size + ':' + st.mtimeMs; } catch (_) { return null; }
}
function mismoArchivo(a, b) {
  if (!a || !b) return false;
  if (path.resolve(a) === path.resolve(b)) return true;
  try { const x = fs.statSync(a), y = fs.statSync(b); return x.dev === y.dev && x.ino === y.ino; } catch (_) { return false; }
}

const vive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function limpiar(ruta) {
  let n = 0;
  try {
    const destino = destinoReal(ruta), dir = path.dirname(destino), base = '.' + path.basename(destino) + '.';
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(base) || !f.endsWith('.tmp')) continue;
      const m = /^(\d+)-[a-z0-9]+\.tmp$/.exec(f.slice(base.length)) || /^claude-(\d+)\.tmp$/.exec(f.slice(base.length));   // el segundo, del servidor antes de la 1.1.55
      const pid = m && Number(m[1]);
      if (!pid || pid === process.pid || vive(pid)) continue;  // uno de un proceso vivo puede estar escribiéndose ahora
      try { fs.unlinkSync(path.join(dir, f)); n++; } catch (_) {}
    }
  } catch (_) {}
  return n;
}

module.exports = { escribir, escribirSync, huella, mismoArchivo, destinoReal, limpiar };
