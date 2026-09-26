/* ClapCraft · los proyectos del equipo
   Los `.clapcraft` que hay en este Mac: las carpetas de siempre y, en macOS, Spotlight (sin las copias de las carpetas temporales
   ni de la papelera). Lo usan el servidor MCP (claude/servidor.js: listar_proyectos, y un proyecto por su nombre o por un enlace) y
   la app (electron/claude.js: abrir un enlace clapcraft:// de un proyecto que no está abierto). */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const TEMPORALES = /^(\/private)?\/(tmp|var\/folders)\//;
function buscarArchivos() {
  return new Promise(resolver => {
    const encontrados = new Set();
    const carpetas = [path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Documents', 'ClapCraft'), path.join(os.homedir(), 'Documents', 'Guiones'),
      path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')];
    carpetas.forEach(d => { try { fs.readdirSync(d).forEach(f => { if (/\.clapcraft$/i.test(f)) encontrados.add(path.join(d, f)); }); } catch (_) {} });
    if (process.platform !== 'darwin') return resolver([...encontrados]);
    execFile('mdfind', ['-name', '.clapcraft'], { timeout: 6000, maxBuffer: 4 << 20 }, (err, out) => {
      String(out || '').split('\n').forEach(l => { const f = l.trim(); if (/\.clapcraft$/i.test(f) && !/\/(\.Trash|dist|node_modules)\//.test(f) && !TEMPORALES.test(f) && !path.basename(f).startsWith('.')) encontrados.add(f); });
      resolver([...encontrados]);
    });
  });
}
/* El sello de enlaces de un archivo (1.1.52): cómo se llamaba el proyecto en sus enlaces y cómo antes —`documentos.enlace`—, y el
   nombre que lleva dentro. Se lee el archivo (gzip) y se recuerda mientras no cambie. */
const zlib = require('zlib');
const sellos = new Map();
function sellosDe(ruta) {
  try {
    const st = fs.statSync(ruta), k = st.mtimeMs + ':' + st.size, c = sellos.get(ruta);
    if (c && c.k === k) return c.v;
    const b = fs.readFileSync(ruta), texto = b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8');
    const d = JSON.parse(texto), e = d && d.documentos && d.documentos.enlace;
    const v = { nombre: d && typeof d.nombre === 'string' ? d.nombre : null, enlaces: e && e.proyecto ? [e.proyecto].concat(Array.isArray(e.antes) ? e.antes : []) : [] };
    sellos.set(ruta, { k, v });
    return v;
  } catch (_) { return null; }
}
/* Los archivos de un <proyecto> de enlace, del que mejor casa al que menos (C.enlaces.rangoNombre: el nombre del archivo, su sello,
   uno de antes) y, a la par, el que se tocó último. `rutas`: otras que mirar primero (los recientes). */
async function buscarPorEnlace(s, rutas) {
  const E = require('../js/claquedraw/enlaces.js').enlaces;
  const todas = [...new Set((rutas || []).concat(await buscarArchivos()))].filter(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } });
  return todas.map(f => {
    let r = E.rangoNombre(s, { ruta: f, enlaces: [] });
    if (r === null) { const x = sellosDe(f); r = x ? E.rangoNombre(s, { ruta: f, enlaces: x.enlaces }) : null; if (r === null && x && x.nombre && E.slug(x.nombre) === s) r = 3; }   // 3: por el nombre del proyecto
    let t = 0; try { t = fs.statSync(f).mtimeMs; } catch (_) {}
    return { ruta: f, rango: r, t };
  }).filter(x => x.rango !== null).sort((a, b) => a.rango - b.rango || b.t - a.t);
}
module.exports = { buscarArchivos, sellosDe, buscarPorEnlace, TEMPORALES };
