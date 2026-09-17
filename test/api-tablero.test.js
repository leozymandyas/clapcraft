/* La API pública del tablero (js/tramas/tablero.js) contra lo que ClapCraft le pide.
   Leo, 16-09-2026: `panelPlegado` estaba escrita pero no exportada; como app.js la llama al arrancar (para devolver el
   panel contraído como se dejó), la excepción cortaba el módulo entero y la app salía vacía, sin pestañas ni nada.
   tablero.js necesita DOM, así que aquí se lee el archivo y se comprueba el objeto exportado tal cual está escrito. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

/* Lo que sale en `T.tablero = { … }` (el último objeto del archivo). */
function exportados() {
  const src = leer('js/tramas/tablero.js');
  const i = src.lastIndexOf('T.tablero = {');
  assert.ok(i > 0, 'tablero.js tiene que exportar T.tablero');
  const bloque = src.slice(i)
    .replace(/\/\*[\s\S]*?\*\//g, '')                      // los comentarios traen nombres que no son entradas
    .replace(/(^|\s)\/\/.*$/gm, '$1');                     // también los de final de línea (traen paréntesis sueltos)
  const nombres = new Set();
  /* una entrada va detrás de `{` o de una coma (varias caben en la misma línea): `nombre,` (atajo), `nombre:` (valor)
     o `nombre(…) {` (método). Las comas de dentro de un valor no cuentan: solo se mira el primer nivel de llaves. */
  let nivel = 0, esperando = false;
  for (let i = 0; i < bloque.length; i++) {
    const c = bloque[i];
    if (c === '{') { nivel++; if (nivel === 1) esperando = true; continue; }
    if (c === '}') { nivel--; continue; }
    if (c === '(' || c === '[') { nivel++; continue; }
    if (c === ')' || c === ']') { nivel--; continue; }
    if (c === ',' && nivel === 1) { esperando = true; continue; }
    if (!esperando || /\s/.test(c)) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*[,:(]/.exec(bloque.slice(i));
    if (m) nombres.add(m[1]);
    esperando = false;
  }
  return nombres;
}

/* Todo lo que los módulos de ClapCraft llaman como `T.tablero.algo`. */
function usados() {
  const nombres = new Map();
  fs.readdirSync(path.join(raiz, 'js/claquedraw')).filter(f => f.endsWith('.js')).forEach(f => {
    const src = leer('js/claquedraw/' + f);
    for (const m of src.matchAll(/T\.tablero\.([A-Za-z_$][\w$]*)/g)) if (!nombres.has(m[1])) nombres.set(m[1], f);
  });
  return nombres;
}

test('todo lo que ClapCraft le pide al tablero está exportado', () => {
  const api = exportados(), piden = usados();
  const faltan = [...piden].filter(([n]) => !api.has(n)).map(([n, f]) => n + ' (js/claquedraw/' + f + ')');
  assert.deepEqual(faltan, [], 'sin exportar: ' + faltan.join(', '));
  assert.ok(piden.size > 5, 'la prueba tiene que estar leyendo llamadas de verdad');
});

test('el panel de abajo se controla entero desde fuera', () => {
  const api = exportados();
  ['panelAbajo', 'panelAlto', 'panelPlegado'].forEach(n => assert.ok(api.has(n), n + ' tiene que salir en T.tablero'));
});
