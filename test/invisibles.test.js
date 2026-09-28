/* Ningún carácter invisible literal en el código (CLAUDE.md, «Reglas que cuestan descubrir»): el espacio duro, los de ancho cero,
   las marcas combinantes, los de uso privado (los marcadores de `sinIds` en historial.js) y el BOM van escapados como \uXXXX.
   Literales no se ven al leer ni en una revisión, y alguna herramienta de escribir archivos convierte los escapes en el carácter
   (revisión del port a ClapBook: quedaban en js/mdvivo.js y js/claquedraw/historial.js). Se ejecuta con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CARPETAS = ['js', 'js/claquedraw', 'js/tramas', 'claude', 'electron', 'test', 'pruebas'];
const INVISIBLE = /[\u00A0\u0300-\u036F\u200B-\u200F\u2028\u2029\u2060\uE000-\uF8FF\uFEFF]/;

test('ningún carácter invisible literal en el código (van escapados como \\uXXXX)', () => {
  const malos = [];
  CARPETAS.forEach(c => {
    const dir = path.join(RAIZ, c);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
        const m = INVISIBLE.exec(l);
        if (m) malos.push(c + '/' + f + ':' + (i + 1) + ' U+' + m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
      });
    });
  });
  assert.deepEqual(malos, []);
});
