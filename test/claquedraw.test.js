/* Pruebas de la biblioteca de Claquedraw (la lista de guiones de la barra lateral): reglas que no
   dependen del DOM. Se ejecutan con `node --test test/` (Node 18 o superior). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/biblioteca.js');

/* Reloj y generador de ids deterministas. */
function nueva(datos) {
  let t = 1000, n = 0;
  const b = new C.Biblioteca(datos, { ahora: () => (t += 10), idNuevo: () => 'g' + (++n) });
  b.avanzar = ms => { t += ms; };
  return b;
}
const tablero = extra => Object.assign({ actos: [], lineas: [{ id: 'l1', tipo: 'principal' }], puntos: [], saltos: [], notas: [] }, extra || {});
const nombres = xs => xs.map(g => g.nombre);

test('crear numera «Capítulo N» sin repetir y deja el nuevo activo', () => {
  const b = nueva();
  assert.equal(b.crear().guion.nombre, 'Capítulo 1');
  assert.equal(b.crear().guion.nombre, 'Capítulo 2');
  b.eliminar('g1');
  assert.equal(b.crear().guion.nombre, 'Capítulo 3');          // el 2 sigue ocupado: salta al 3
  assert.equal(b.activo().id, 'g3');
  assert.equal(b.crear({ activar: false }).ok, true);
  assert.equal(b.activo().id, 'g3');
});

test('nombreLibre con base: la base, o «base 2», «base 3»… sin distinguir acentos ni mayúsculas', () => {
  const b = nueva();
  b.crear({ nombre: 'Piloto' });
  assert.equal(b.nombreLibre('piloto'), 'piloto 2');
  b.crear({ nombre: 'Piloto 2' });
  assert.equal(b.nombreLibre('PILOTO'), 'PILOTO 3');
  assert.equal(b.nombreLibre('Final'), 'Final');
});

test('crear rechaza datos que no son un tablero y guarda una copia de los válidos', () => {
  const b = nueva();
  assert.equal(b.crear({ datos: { hola: 1 } }).ok, false);
  const d = tablero();
  const r = b.crear({ datos: d });
  d.lineas.push({ id: 'l2' });
  assert.equal(r.guion.datos.lineas.length, 1);
});

test('renombrar: vacío y repetido se rechazan; el cambio cuenta como modificación', () => {
  const b = nueva();
  b.crear({ nombre: 'Uno' }); b.crear({ nombre: 'Dos' });
  assert.equal(b.renombrar('g1', '   ').ok, false);
  assert.equal(b.renombrar('g1', 'dós').ok, false);
  assert.equal(b.renombrar('g1', 'Uno').ok, true);            // mismo nombre: no hace nada
  const antes = b.guion('g1').modificado;
  assert.equal(b.renombrar('g1', ' Tres ').ok, true);
  assert.equal(b.guion('g1').nombre, 'Tres');
  assert.ok(b.guion('g1').modificado > antes);
  assert.equal(b.renombrar('zz', 'x').ok, false);
});

test('fijar reparte la lista en dos sin perder el orden manual', () => {
  const b = nueva();
  ['A', 'B', 'C', 'D'].forEach(n => b.crear({ nombre: n }));
  b.fijar('g3', true); b.fijar('g1', true);
  const L = b.lista({ orden: 'manual' });
  assert.deepEqual(nombres(L.fijados), ['A', 'C']);
  assert.deepEqual(nombres(L.guiones), ['B', 'D']);
  assert.equal(L.totalFijados, 2); assert.equal(L.totalGuiones, 2);
  b.fijar('g3', false);
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).guiones), ['B', 'C', 'D']);
});

test('lista: orden por nombre (numérico, sin acentos), por modificado y filtro de búsqueda', () => {
  const b = nueva();
  ['Capítulo 10', 'capítulo 2', 'Épico', 'Final'].forEach(n => b.crear({ nombre: n }));
  assert.deepEqual(nombres(b.lista({ orden: 'az' }).guiones), ['capítulo 2', 'Capítulo 10', 'Épico', 'Final']);
  assert.deepEqual(nombres(b.lista({ orden: 'za' }).guiones), ['Final', 'Épico', 'Capítulo 10', 'capítulo 2']);
  b.guardarDatos('g2', tablero());
  assert.equal(nombres(b.lista({ orden: 'modificado' }).guiones)[0], 'capítulo 2');
  const f = b.lista({ orden: 'manual', texto: 'CAPI' });
  assert.deepEqual(nombres(f.guiones), ['Capítulo 10', 'capítulo 2']);
  assert.equal(f.totalGuiones, 4);                                // los totales no dependen del filtro
  assert.deepEqual(nombres(b.lista({ texto: 'epi' }).guiones), ['Épico']);
});

test('guardarDatos solo cuenta como modificación cuando el tablero cambió', () => {
  const b = nueva();
  b.crear({ datos: tablero() });
  const t0 = b.guion('g1').modificado;
  assert.equal(b.guardarDatos('g1', tablero()).cambio, false);
  assert.equal(b.guion('g1').modificado, t0);
  assert.equal(b.guardarDatos('g1', tablero({ notas: [{ id: 'n1' }] })).cambio, true);
  assert.ok(b.guion('g1').modificado > t0);
  assert.equal(b.guardarDatos('g1', 'no').ok, false);
});

test('eliminar el activo pasa al vecino de su lista; sin nadie, a la otra lista; y al final a null', () => {
  const b = nueva();
  ['A', 'B', 'C'].forEach(n => b.crear({ nombre: n }));
  b.fijar('g3', true);                                            // fijados: C · guiones: A, B
  b.activar('g1');
  assert.equal(b.eliminar('g1').activo, 'g2');                    // siguiente en su lista
  assert.equal(b.eliminar('g2').activo, 'g3');                    // la lista quedó vacía: a la otra
  assert.equal(b.eliminar('g3').activo, null);
  assert.equal(b.total(), 0);
  assert.equal(b.eliminar('g3').ok, false);
});

test('eliminar uno que no es el activo no cambia el activo; el anterior sirve si no hay siguiente', () => {
  const b = nueva();
  ['A', 'B', 'C'].forEach(n => b.crear({ nombre: n }));          // activo: C
  assert.equal(b.eliminar('g1').activo, 'g3');
  assert.equal(b.eliminar('g3').activo, 'g2');                    // C era el último: pasa al anterior
});

test('mover sube y baja dentro de su lista y avisa en el extremo', () => {
  const b = nueva();
  ['A', 'B', 'C', 'D'].forEach(n => b.crear({ nombre: n }));
  b.fijar('g2', true);                                            // fijados: B · guiones: A, C, D
  assert.equal(b.mover('g1', -1).ok, false);
  assert.equal(b.mover('g1', 1).ok, true);
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).guiones), ['C', 'A', 'D']);
  assert.equal(b.mover('g4', 1).ok, false);
  assert.equal(b.mover('g2', 1).ok, false);                       // única fijada
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).fijados), ['B']);
});

test('colocar: cambia de lista y queda antes del indicado o al final', () => {
  const b = nueva();
  ['A', 'B', 'C', 'D'].forEach(n => b.crear({ nombre: n }));
  b.fijar('g1', true);                                            // fijados: A · guiones: B, C, D
  let r = b.colocar('g4', { fijado: true, antesDe: 'g1' });       // D pasa a fijados, antes de A
  assert.equal(r.cambioLista, true);
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).fijados), ['D', 'A']);
  r = b.colocar('g2', { fijado: false });                         // B al final de guiones
  assert.equal(r.cambioLista, false);
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).guiones), ['C', 'B']);
  b.colocar('g1', { fijado: false, antesDe: 'g3' });              // A deja de estar fijado, antes de C
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).fijados), ['D']);
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).guiones), ['A', 'C', 'B']);
  b.colocar('g1', { fijado: true, antesDe: 'g3' });               // antesDe de otra lista: al final
  assert.deepEqual(nombres(b.lista({ orden: 'manual' }).fijados), ['D', 'A']);
});

test('normalizar descarta entradas rotas o repetidas y corrige el activo', () => {
  const b = nueva({ activo: 'nadie', guiones: [
    { id: 'x', nombre: '  ', fijado: 1, creado: 5, datos: { lineas: [] } },
    { id: 'x', nombre: 'repetido' },
    null, 'texto', { nombre: 'sin id' },
    { id: 'y', nombre: 'Y', datos: 'roto' }
  ] });
  assert.equal(b.total(), 2);
  assert.equal(b.guion('x').nombre, 'Capítulo');
  assert.equal(b.guion('x').fijado, true);
  assert.equal(b.guion('x').modificado, 5);
  assert.equal(b.guion('y').datos, null);
  assert.equal(b.activo().id, 'x');
  assert.equal(nueva({ guiones: [] }).activo(), null);
  assert.equal(nueva({ activo: 'y', guiones: [{ id: 'x' }, { id: 'y' }] }).activo().id, 'y');
});

test('toJSON es una copia independiente', () => {
  const b = nueva();
  b.crear({ nombre: 'A', datos: tablero() });
  const j = b.toJSON();
  j.guiones[0].nombre = 'Z'; j.guiones[0].datos.lineas.length = 0;
  assert.equal(b.guion('g1').nombre, 'A');
  assert.equal(b.guion('g1').datos.lineas.length, 1);
  assert.equal(j.formato, C.FORMATO);
});

test('notas: se guardan por nodo, solo cuentan como modificación si cambian, y se podan las huérfanas', () => {
  const b = nueva();
  b.crear({ datos: tablero() });
  assert.equal(b.nota('g1', 'p1'), null);
  assert.equal(b.guardarNota('g1', 'p1', { html: 'x' }).ok, true);
  const t0 = b.guion('g1').modificado;
  assert.equal(b.guardarNota('g1', 'p1', { html: 'x' }).cambio, false);              // igual: no cuenta
  assert.equal(b.guion('g1').modificado, t0);
  const r = b.guardarNota('g1', 'p1', { title: 'Inicio', html: '<p>hola</p>', characters: { a: 1 } });
  assert.equal(r.cambio, true);
  assert.deepEqual(b.nota('g1', 'p1'), { title: 'Inicio', html: '<p>hola</p>', characters: { a: 1 } });
  assert.equal(b.guardarNota('g1', 'p1', { title: 'x' }).ok, false);                  // sin html no es nota
  assert.equal(b.guardarNota('g1', '', { html: '' }).ok, false);
  b.guardarNota('g1', 'p2', { html: '<p>dos</p>' });
  b.fijarNotaActual('g1', 'p2');
  assert.equal(b.podarNotas('g1', ['p1']).podadas, 1);
  assert.equal(b.nota('g1', 'p2'), null);
  assert.equal(b.guion('g1').notaActual, null);
  assert.equal(b.nota('g1', 'p1').html, '<p>hola</p>');
});

test('notas: crear las acepta, normalizar las sanea y toJSON las copia', () => {
  const b = nueva();
  b.crear({ datos: tablero(), notas: { p1: { html: '<p>a</p>' }, malo: 'texto', otro: { title: 'sin html' } } });
  assert.deepEqual(Object.keys(b.guion('g1').notas), ['p1']);
  assert.deepEqual(b.nota('g1', 'p1'), { title: '', html: '<p>a</p>', characters: {} });
  const j = b.toJSON();
  j.guiones[0].notas.p1.html = 'z';
  assert.equal(b.nota('g1', 'p1').html, '<p>a</p>');
  const c = nueva({ guiones: [{ id: 'x', notas: { n1: { html: 'h', characters: 'no' } }, notaActual: 'n1' },
                              { id: 'y', notas: [1, 2], notaActual: 7 }] });
  assert.deepEqual(c.guion('x').notas, { n1: { title: '', html: 'h', characters: {} } });
  assert.equal(c.guion('x').notaActual, 'n1');
  assert.deepEqual(c.guion('y').notas, {});
  assert.equal(c.guion('y').notaActual, null);
});

test('nombreArchivo: el nombre de archivo que se propone para un proyecto (sin espacios, acentos ni ñ)', () => {
  assert.equal(C.nombreArchivo('Año nuevo'), 'anio-nuevo');                    // el ejemplo de Leo
  assert.equal(C.nombreArchivo('Amor tiktoker'), 'amor-tiktoker');
  assert.equal(C.nombreArchivo('La Ñusta: capítulo 1'), 'la-niusta-capitulo-1');
  assert.equal(C.nombreArchivo('  ¿Quién mató a Laura?  '), 'quien-mato-a-laura');
  assert.equal(C.nombreArchivo('Canción   de  cuna'), 'cancion-de-cuna');
  assert.equal(C.nombreArchivo('O\u2019Brien'), 'obrien');
  assert.equal(C.nombreArchivo('an\u0303o'), 'anio');                          // la ñ escrita con su tilde aparte
  assert.equal(C.nombreArchivo('がっこう の 話'), 'がっこう-の-話');             // lo que no es latino se queda
  assert.equal(C.nombreArchivo(''), 'proyecto');
  assert.equal(C.nombreArchivo('«»'), 'proyecto');
  assert.ok(C.nombreArchivo('palabra '.repeat(30)).length <= 80);
  assert.ok(!/-$/.test(C.nombreArchivo('palabra '.repeat(30))));
});
