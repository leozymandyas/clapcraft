/* El plugin de ClapCraft para Claude (Cowork y Claude Code): las instrucciones (skills/clapcraft) y el servidor MCP, que se
   arranca con claude/plugin/lanzar.sh (busca la app instalada y usa su servidor, así va siempre a la par de ella). En el
   repositorio las carpetas y archivos con punto van sin él (`claude-plugin/`, `mcp.json`: electron-builder puede dejar fuera
   lo que empieza por punto) y aquí se les pone. `archivos()` da la lista para el .zip; `plugin()`, el .plugin entero. */
'use strict';
const fs = require('fs');
const path = require('path');
const { zip } = require('./zip');

const DIR = path.join(__dirname, 'plugin');
const DESTINO = { 'claude-plugin': '.claude-plugin', 'mcp.json': '.mcp.json' };
function recorrer(dir, pre, out) {
  fs.readdirSync(dir).sort().forEach(n => {
    if (n === '.DS_Store') return;
    const f = path.join(dir, n), rel = pre ? pre + '/' + n : n;
    if (fs.statSync(f).isDirectory()) recorrer(f, rel, out); else out.push({ rel, f });
  });
  return out;
}
/* [{ nombre, datos }] con la versión de la app en plugin.json */
function archivos(version) {
  return recorrer(DIR, '', []).map(({ rel, f }) => {
    const partes = rel.split('/'); partes[0] = DESTINO[partes[0]] || partes[0];
    let datos = fs.readFileSync(f);
    if (rel === 'claude-plugin/plugin.json' && version) { const j = JSON.parse(datos.toString('utf8')); j.version = version; datos = Buffer.from(JSON.stringify(j, null, 2) + '\n'); }
    return { nombre: partes.join('/'), datos, modo: /\.sh$/.test(rel) ? 0o755 : 0o644 };
  });
}
const plugin = version => zip(archivos(version));
module.exports = { archivos, plugin, DIR };
