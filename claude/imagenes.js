/* ClapCraft · las imágenes que el servidor MCP le da a Claude (1.1.58)
   `ejecutar_nodo` (js/claquedraw/herramientas.js) devuelve, además del texto, las imágenes de lo que entra en un nodo de un lienzo
   —las de sus notas y los nodos de imagen— como `{ data (base64), mimeType, nombre }`. Aquí se preparan para MCP
   (`{ type: 'image', data, mimeType }`): **reducidas a 1024 px de lado largo** como mucho (Claude no necesita más para leerlas y el
   mensaje pesa mucho menos) y **pocas**: `MAX` (8) por respuesta. Sin dependencias: se miden leyendo su cabecera (PNG, JPEG, GIF,
   WebP) y se reducen con `sips` de macOS (a JPEG, o a PNG si la original lleva transparencia). Donde no hay `sips`, una que ya es
   pequeña va tal cual y una grande (más de `MAX_BYTES_SIN_REDUCIR`) se deja fuera y se dice. Pasa lo mismo en vivo y sobre el
   archivo: las dos respuestas acaban en el servidor. Pruebas: test/lienzo-claude.test.js y test/mcp.test.js. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const LADO = 1024, MAX = 8, MAX_BYTES_SIN_REDUCIR = 1.5e6, BYTES_PEQUENA = 400e3;
/* el tiempo que se deja a sips para todas las imágenes de una respuesta: las que no caben, se nombran sin adjuntar */
const TIEMPO_TOTAL = 20000;
const TIPOS = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
/* el tipo de verdad, el de su cabecera (una data URL puede decir «image/png» de un JPEG) */
const MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/* ancho y alto (y si lleva transparencia) de una imagen, leyendo su cabecera; null si no se entiende */
function medidas(b) {
  if (!b || b.length < 24) return null;
  /* PNG: IHDR */
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const tipoColor = b[25];
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), formato: 'png', alfa: tipoColor === 4 || tipoColor === 6 || hayTrns(b) };
  }
  /* GIF */
  if (b.toString('ascii', 0, 3) === 'GIF') return { ancho: b.readUInt16LE(6), alto: b.readUInt16LE(8), formato: 'gif', alfa: true };
  /* WebP: VP8 (con pérdida), VP8L (sin pérdida), VP8X (extendido) */
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const k = b.toString('ascii', 12, 16);
    if (k === 'VP8 ' && b.length >= 30) return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff, formato: 'webp', alfa: false };
    if (k === 'VP8L' && b.length >= 25) { const v = b.readUInt32LE(21); return { ancho: (v & 0x3fff) + 1, alto: ((v >> 14) & 0x3fff) + 1, formato: 'webp', alfa: !!((v >> 28) & 1) }; }
    if (k === 'VP8X' && b.length >= 30) return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3), formato: 'webp', alfa: !!(b[20] & 0x10) };
    return null;
  }
  /* JPEG: el primer SOFn */
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const largo = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), formato: 'jpeg', alfa: false };
      i += 2 + largo;
    }
    return null;
  }
  return null;
}
/* un PNG de paleta con tRNS también lleva transparencia */
function hayTrns(b) { const i = b.indexOf('tRNS', 8, 'ascii'); const j = b.indexOf('IDAT', 8, 'ascii'); return i > 0 && (j < 0 || i < j); }

const sips = (args, ms) => new Promise(r => execFile('/usr/bin/sips', args, { timeout: Math.max(1, Math.round(ms || 20000)) }, e => r(!e)));
/* Reduce una imagen a `lado` px de lado largo con sips (con `ms` como mucho). Devuelve { data, mimeType, ancho, alto } o null. */
async function reducir(buf, m, lado, ms) {
  if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/sips')) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-img-'));
  try {
    const ext = { png: '.png', gif: '.gif', webp: '.webp', jpeg: '.jpg' }[m.formato] || '.img';
    const entra = path.join(dir, 'entra' + ext), png = !!m.alfa, sale = path.join(dir, 'sale' + (png ? '.png' : '.jpg'));
    fs.writeFileSync(entra, buf);
    const args = ['-Z', String(lado), '-s', 'format', png ? 'png' : 'jpeg'].concat(png ? [] : ['-s', 'formatOptions', '80']).concat([entra, '--out', sale]);
    if (!(await sips(args, ms)) || !fs.existsSync(sale)) return null;
    const b = fs.readFileSync(sale), mm = medidas(b);
    if (!mm) return null;
    return { data: b.toString('base64'), mimeType: png ? 'image/png' : 'image/jpeg', ancho: mm.ancho, alto: mm.alto };
  } catch (_) { return null; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

/* Prepara la lista de imágenes de una respuesta: { contenido: [{ type: 'image', data, mimeType }], avisos: [texto] }.
   `op.lado` (1024), `op.max` (8) y `op.tiempo` (TIEMPO_TOTAL ms para todas las reducciones) para las pruebas. */
async function preparar(lista, op) {
  op = op || {};
  const lado = op.lado || LADO, max = op.max || MAX, contenido = [], avisos = [], sinTiempo = [];
  const hasta = Date.now() + (op.tiempo || TIEMPO_TOTAL);
  const l = Array.isArray(lista) ? lista : [];
  for (let i = 0; i < l.length; i++) {
    const x = l[i] || {}, nombre = x.nombre || 'imagen ' + (i + 1);
    if (contenido.length >= max) { avisos.push('(' + (l.length - i) + (l.length - i === 1 ? ' imagen más no va' : ' imágenes más no van') + ' en esta respuesta: como mucho ' + max + '. Si hacen falta, pídelas leyendo esas notas con leer_documento o mira el lienzo en ClapCraft.)'); break; }
    let buf; try { buf = Buffer.from(String(x.data || ''), 'base64'); } catch (_) { buf = null; }
    const m = buf && medidas(buf);
    const mime = m && MIME[m.formato];
    if (!m || !TIPOS.has(mime)) { avisos.push('(' + nombre + ': no se puede enseñar, no es PNG, JPEG, GIF ni WebP)'); continue; }
    if (Math.max(m.ancho, m.alto) <= lado && buf.length <= BYTES_PEQUENA) { contenido.push({ type: 'image', data: x.data, mimeType: mime }); continue; }
    const queda = hasta - Date.now();
    if (queda < 250) { sinTiempo.push(nombre); continue; }
    const r = await reducir(buf, m, Math.min(lado, Math.max(m.ancho, m.alto)), queda);
    if (r) { contenido.push({ type: 'image', data: r.data, mimeType: r.mimeType }); continue; }
    if (Date.now() >= hasta - 50 && process.platform === 'darwin') { sinTiempo.push(nombre); continue; }   // sips se cortó por tiempo
    if (buf.length <= MAX_BYTES_SIN_REDUCIR) { contenido.push({ type: 'image', data: x.data, mimeType: mime }); continue; }
    avisos.push('(' + nombre + ': demasiado grande para enseñarla aquí y no se pudo reducir)');
  }
  if (sinTiempo.length) avisos.push('(No dio tiempo a reducir ' + (sinTiempo.length === 1 ? 'esta imagen, que no va: ' : 'estas imágenes, que no van: ') + sinTiempo.join('; ') + '. Si hacen falta, léelas con leer_documento de su nota o mira el lienzo en ClapCraft.)');
  return { contenido, avisos };
}

module.exports = { medidas, reducir, preparar, LADO, MAX, TIEMPO_TOTAL };
