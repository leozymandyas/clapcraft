/* Versiones de un documento (js/claquedraw/versiones.js): la comparación, párrafo a párrafo. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/versiones.js');
const V = C.versiones;

test('bloques: el texto de cada párrafo, sin etiquetas ni vacíos', () => {
  const html = '<p class="sp-scene">EXT. PUERTO – NOCHE</p><p></p><p>Se&nbsp;embarcan.</p><p><br></p><h2>II</h2>';
  assert.deepEqual(V.bloques(html), ['EXT. PUERTO – NOCHE', 'Se embarcan.', 'II']);
  assert.deepEqual(V.bloques(''), []);
  assert.deepEqual(V.bloques('<p>&amp; y &lt;esto&gt;</p>'), ['& y <esto>']);
});

test('comparar: lo igual, lo que se quitó y lo que se añadió, en orden', () => {
  const a = '<p>Uno</p><p>Dos</p><p>Tres</p>';
  const b = '<p>Uno</p><p>Dos y medio</p><p>Tres</p><p>Cuatro</p>';
  assert.deepEqual(V.comparar(a, b), [
    { tipo: 'igual', texto: 'Uno' },
    { tipo: 'menos', texto: 'Dos' },
    { tipo: 'mas', texto: 'Dos y medio' },
    { tipo: 'igual', texto: 'Tres' },
    { tipo: 'mas', texto: 'Cuatro' }
  ]);
  assert.deepEqual(V.resumen(V.comparar(a, b)), { igual: 2, mas: 2, menos: 1 });
});

test('comparar: sin diferencias, todo igual; y con uno vacío, todo nuevo o todo quitado', () => {
  const a = '<p>Uno</p><p>Dos</p>';
  assert.deepEqual(V.resumen(V.comparar(a, a)), { igual: 2, mas: 0, menos: 0 });
  assert.deepEqual(V.resumen(V.comparar('', a)), { igual: 0, mas: 2, menos: 0 });
  assert.deepEqual(V.resumen(V.comparar(a, '')), { igual: 0, mas: 0, menos: 2 });
});

test('comparar: un párrafo movido sale como quitado y añadido, no como cambiado', () => {
  const filas = V.comparar('<p>A</p><p>B</p><p>C</p>', '<p>C</p><p>A</p><p>B</p>');
  assert.deepEqual(V.resumen(filas), { igual: 2, mas: 1, menos: 1 });
  assert.equal(filas[0].texto, 'C');
});
