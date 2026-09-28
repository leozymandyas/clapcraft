/* ClapCraft · los mods del teatro, de todos los proyectos (1.1.64)
   Leo, 28-09-2026: «La utilería generada (los mods) se comparten en todos los proyectos con el fin de poder reutilizarlos». Viven en
   `teatro-mods.json`, en los datos de la app (los de puente.json). Los leen y escriben la app (electron/main.js, IPC `teatro:leer` y
   `teatro:escribir`) y el servidor de Claude con el proyecto cerrado (claude/servidor.js); siempre saneados
   (js/claquedraw/teatro-mods.js) y escritos de una vez (claude/atomico.js). Solo mods: las obras y los duendes de los personajes son
   de cada proyecto. */
'use strict';
const fs = require('fs');
const path = require('path');
const atomico = require('./atomico');

function crear(dir, Tm) {
  const archivo = path.join(dir, 'teatro-mods.json');
  return {
    archivo,
    leer() { try { return Tm.soloMods(JSON.parse(fs.readFileSync(archivo, 'utf8'))); } catch (_) { return {}; } },
    escribir(t) {
      const x = Tm.soloMods(t);
      fs.mkdirSync(dir, { recursive: true });
      atomico.escribirSync(archivo, JSON.stringify(x), 0o644);
      return x;
    }
  };
}
module.exports = { crear };
