/* Pruebas de «Revisar guión» (js/claquedraw/guion.js): las secciones de un tablero en el orden del tiempo, el estado del
   guion (fuera, orden de lectura, palabras) y el documento plano que se genera. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
const T = require('../js/tramas/modelo.js');

function montaje() {
  let t = 1000, n = 0;
  const d = new C.Documentos(undefined, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
  const cap = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const tm = new T.Modelo(T.inicial());
  const [pr, sec] = tm.datos.lineas, [a1, a2] = tm.datos.actos;
  const duda = tm.nuevoPunto(sec.id, a1.id, 1, { titulo: 'Duda' }).punto;      // antes que «Inicio» (celda 2)
  const enc = tm.nuevoPunto(pr.id, a1.id, 6, { titulo: 'Encuentro' }).punto;
  const salto = tm.nuevoPunto(pr.id, a2.id, 3, { titulo: 'Cambio' }).punto; tm.crearSalto(salto.id, sec.id, 'cuadro');
  const e = d.crearEsquema(cap.id, tm.toJSON(), 'Escaleta').esquema;
  const inicio = tm.datos.puntos.find(p => p.titulo === 'Inicio');
  d.guardarNotaEsquema(e.id, inicio.id, { title: 'Inicio', html: '<p class="sp-scene">EXT. FERRY - AMANECER</p><p>Ana baja del ferry.</p>', characters: {} });
  d.guardarNotaEsquema(e.id, duda.id, { title: 'Duda', html: '<p>No sabe si volver.</p>', characters: {} });
  d.guardarNotaEsquema(e.id, enc.id, { title: 'Encuentro', html: '<p class="sp-character">ANA</p><p class="sp-dialogue">No pensaba volver.</p>', characters: { ana: { name: 'ANA', color: 2 } } });
  return { d, tm, e, inicio, duda, enc };
}

test('secciones: en el orden del tiempo, sin extremos de salto', () => {
  const { tm, inicio, duda, enc } = montaje();
  assert.deepEqual(C.guion.secciones(tm).map(p => p.titulo), ['Duda', 'Inicio', 'Encuentro']);
  assert.ok(C.guion.secciones(tm, true).some(p => p.titulo === 'Cambio'));           // en el tablero de un personaje, el salto sí
  assert.equal(C.guion.palabras('<p>Ana baja <b>del</b> ferry.</p>'), 4);
  assert.equal(C.guion.enLista(['Duda', 'Huida', 'Puerto']), 'Duda, Huida y Puerto');
  assert.ok([inicio, duda, enc].every(Boolean));
});

test('estado y documento plano: fuera no se copia, se sigue el orden de lectura, sin cabeceras', () => {
  const { d, tm, e, inicio, duda, enc } = montaje();
  d.sacarDelGuion(e.id, [duda.id]);
  d.ordenarGuion(e.id, [enc.id, duda.id, inicio.id]);
  const x = C.guion.estado(d, e.id, tm);
  assert.deepEqual(x.filas.map(f => [f.titulo, f.fuera]), [['Encuentro', false], ['Duda', true], ['Inicio', false]]);
  assert.equal(x.dentro.length, 2);
  assert.equal(x.palabras, 4 + 7);
  const doc = C.guion.componer(d, e.id, tm, false, { proyecto: 'El puerto', titulo: 'Guion final v1' });
  assert.match(doc.html, /^<p style="text-align: center;"><b>EL PUERTO<\/b><\/p><p style="text-align: center;">Guion final v1<\/p><hr>/);
  assert.ok(doc.html.indexOf('No pensaba volver') < doc.html.indexOf('Ana baja del ferry'));   // Encuentro antes que Inicio
  assert.equal(/No sabe si volver/.test(doc.html), false);                                   // Duda está fuera
  assert.deepEqual(Object.keys(doc.characters), ['ana']);
});
