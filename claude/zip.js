/* Un .zip sin dependencias (deflate de zlib y CRC32 propio): el plugin de ClapCraft para Claude (clapcraft.plugin) se arma con
   esto al construir la app (claude/empaquetar.js) y desde el menú Claude › Conectar con Claude… (electron/claude.js). */
'use strict';
const zlib = require('zlib');

const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/* `entradas`: [{ nombre: 'carpeta/archivo', datos: Buffer | string }]. Devuelve el .zip entero. */
function zip(entradas) {
  const locales = [], centrales = [];
  let desplazamiento = 0;
  const ahora = new Date(), hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  entradas.forEach(e => {
    const datos = Buffer.isBuffer(e.datos) ? e.datos : Buffer.from(String(e.datos), 'utf8');
    const nombre = Buffer.from(e.nombre.replace(/\\/g, '/'), 'utf8');
    const comprimido = zlib.deflateRawSync(datos, { level: 9 }), crc = crc32(datos);
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6); cab.writeUInt16LE(8, 8);
    cab.writeUInt16LE(hora, 10); cab.writeUInt16LE(dia, 12); cab.writeUInt32LE(crc, 14);
    cab.writeUInt32LE(comprimido.length, 18); cab.writeUInt32LE(datos.length, 22); cab.writeUInt16LE(nombre.length, 26); cab.writeUInt16LE(0, 28);
    locales.push(cab, nombre, comprimido);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(0x031e, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comprimido.length, 20);
    cen.writeUInt32LE(datos.length, 24); cen.writeUInt16LE(nombre.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(((e.modo || 0o644) << 16) >>> 0, 38); cen.writeUInt32LE(desplazamiento, 42);
    centrales.push(cen, nombre);
    desplazamiento += cab.length + nombre.length + comprimido.length;
  });
  const central = Buffer.concat(centrales), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, central, fin]);
}

module.exports = { zip, crc32 };
