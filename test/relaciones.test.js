/* Relaciones entre personajes (js/claquedraw/relaciones.js): la relación de un esquema de personaje se refleja en los
   demás esquemas donde los dos personajes tienen carril (Leo, 16-09-2026: ya no hay un tablero por personaje). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/relaciones.js');

function elenco() {
  const d = new C.Documentos(null);
  const lestat = d.crearPersonaje('Lestat').personaje, louis = d.crearPersonaje('Louis').personaje, claudia = d.crearPersonaje('Claudia').personaje;
  return { d, lestat, louis, claudia };
}
/* Un esquema de personaje con un carril por personaje (el primero, el de partida que crea app.js). */
function esquema(d, ...ps) {
  const t = T.inicial();
  t.lineas = [Object.assign({}, t.lineas[0], { nombre: ps[0].nombre, personaje: ps[0].id })];
  t.puntos = []; t.saltos = []; t.notas = [];
  const e = d.crearEsquemaPersonaje(t, ps[0].nombre).esquema;
  const m = new T.Modelo(e.datos);
  ps.slice(1).forEach(p => { const l = m.nuevaLinea('secundaria').linea; m.editarLinea(l.id, { personaje: p.id, nombre: p.nombre }); });
  d.guardarEsquema(e.id, m.toJSON());
  return e.id;
}
const abrir = (d, eid) => new T.Modelo(d.esquema(eid).esquema.datos);
const carril = (m, pid) => m.datos.lineas.find(l => l.personaje === pid);
let n = 0; const marca = () => 'rel' + (++n);

test('una relación aparece al final de los demás esquemas donde los dos personajes tienen carril', () => {
  const { d, lestat, louis } = elenco();
  const eA = esquema(d, lestat, louis), eB = esquema(d, louis, lestat);
  /* el esquema B ya tiene algo en su línea del tiempo */
  const mB = abrir(d, eB);
  mB.nuevoPunto(mB.lineaPrincipal().id, mB.datos.actos[0].id, 9, { titulo: 'Se convierte' }); d.guardarEsquema(eB, mB.toJSON());
  /* en A, una relación en la celda 4 entre Lestat y Louis */
  const m = abrir(d, eA);
  const ev = m.nuevoPunto(carril(m, lestat.id).id, m.datos.actos[0].id, 4, { titulo: 'Lo muerde' }).punto;
  m.crearSalto(ev.id, carril(m, louis.id).id, 'cuadro');
  assert.deepEqual(C.relaciones.reflejar(d, T, m, eA, { marca }), [eB]);
  const rel = m.datos.saltos[0].rel; assert.ok(rel, 'la relación de A queda marcada');
  const mB2 = abrir(d, eB);
  const reflejo = mB2.datos.saltos.find(s => s.rel === rel); assert.ok(reflejo);
  const de = mB2.punto(reflejo.deId), a = mB2.punto(reflejo.aId);
  assert.equal(mB2.linea(de.lineaId).personaje, lestat.id);
  assert.equal(mB2.linea(a.lineaId).personaje, louis.id);
  assert.equal(de.titulo, 'Lo muerde');
  assert.equal(mB2.cg(de), 11, 'al final: detrás de lo último (9) con un hueco');
  d.guardarEsquema(eA, m.toJSON());                            // como volcar() en app.js: A se guarda con su marca
  /* guardar otra vez no duplica, y guardar B no la rebota a A */
  assert.deepEqual(C.relaciones.reflejar(d, T, m, eA, { marca }), []);
  assert.deepEqual(C.relaciones.reflejar(d, T, mB2, eB, { marca }), []);
  assert.equal(abrir(d, eA).datos.saltos.length, 1);
  assert.equal(abrir(d, eB).datos.saltos.filter(s => s.rel === rel).length, 1);
});

test('solo se refleja donde los dos ya tienen carril: no se inventan carriles ni esquemas', () => {
  const { d, lestat, louis, claudia } = elenco();
  const eA = esquema(d, lestat, louis, claudia);               // aquí nace la relación Louis ↔ Claudia
  const eB = esquema(d, louis, claudia);                       // los dos están: la recibe
  const eC = esquema(d, louis, lestat);                        // falta Claudia: no la recibe
  const m = abrir(d, eA);
  const ev = m.nuevoPunto(carril(m, louis.id).id, m.datos.actos[0].id, 6, { titulo: 'La adoptan' }).punto;
  m.crearSalto(ev.id, carril(m, claudia.id).id, 'cuadro');
  assert.deepEqual(C.relaciones.reflejar(d, T, m, eA, { marca }), [eB]);
  const mB = abrir(d, eB), s = mB.datos.saltos[0];
  assert.ok(s && s.rel === m.datos.saltos[0].rel);
  assert.equal(mB.linea(mB.punto(s.deId).lineaId).personaje, louis.id);
  assert.equal(mB.linea(mB.punto(s.aId).lineaId).personaje, claudia.id);
  assert.equal(mB.cg(mB.punto(s.deId)), 2, 'esquema sin nodos: en la celda 2');
  assert.equal(abrir(d, eC).datos.saltos.length, 0);
  assert.equal(abrir(d, eC).datos.lineas.length, 2, 'y no se le añade un carril');
});

test('la marca de la relación sobrevive al guardado del tablero', () => {
  const m = new T.Modelo({ actos: [{ id: 'a1', nombre: 'A', celdas: 20 }], lineas: [{ id: 'l1', nombre: 'P', tipo: 'principal', color: 'azul' }, { id: 'l2', nombre: 'S', tipo: 'secundaria', color: 'rojo' }],
    puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 3 }, { id: 'p2', lineaId: 'l2', actoId: 'a1', celda: 3 }], saltos: [{ id: 's1', deId: 'p1', aId: 'p2', tipo: 'cuadro', rel: 'rel9' }], notas: [] });
  assert.equal(new T.Modelo(JSON.parse(JSON.stringify(m.toJSON()))).datos.saltos[0].rel, 'rel9');
});

test('borrar la relación en un esquema la borra en el otro (Leo, 15-09-2026)', () => {
  const { d, lestat, louis } = elenco();
  const eA = esquema(d, lestat, louis), eB = esquema(d, louis, lestat);
  const m = abrir(d, eA);
  const ev = m.nuevoPunto(carril(m, lestat.id).id, m.datos.actos[0].id, 4, { titulo: 'Lo muerde' }).punto;
  m.crearSalto(ev.id, carril(m, louis.id).id, 'cuadro');
  C.relaciones.reflejar(d, T, m, eA, { marca });
  d.guardarEsquema(eA, m.toJSON());
  assert.equal(abrir(d, eB).datos.saltos.length, 1);
  /* se borra en B: al guardar B, desaparece de A */
  const mB = abrir(d, eB); mB.borrarSalto(mB.datos.saltos[0].id);
  assert.deepEqual(C.relaciones.borrarReflejos(d, T, mB, eB), [eA]);
  d.guardarEsquema(eB, mB.toJSON());
  const mA = abrir(d, eA);
  assert.equal(mA.datos.saltos.length, 0); assert.equal(mA.datos.puntos.length, 0, 'con sus dos extremos');
  /* y no vuelve a crearse al guardar A */
  assert.deepEqual(C.relaciones.reflejar(d, T, mA, eA, { marca }), []);
  assert.equal(abrir(d, eB).datos.saltos.length, 0);
});

test('renombrar la relación después de crearla llega al reflejo, y renombrar el reflejo llega al original', () => {
  const { d, lestat, louis } = elenco();
  const eA = esquema(d, lestat, louis), eB = esquema(d, louis, lestat);
  const m = abrir(d, eA);
  const ev = m.nuevoPunto(carril(m, lestat.id).id, m.datos.actos[0].id, 4, { titulo: 'Relación' }).punto;
  m.crearSalto(ev.id, carril(m, louis.id).id, 'cuadro');
  /* primer guardado automático: aún con el nombre propuesto */
  C.relaciones.borrarReflejos(d, T, m, eA); C.relaciones.renombrarReflejos(d, T, m, eA);
  C.relaciones.reflejar(d, T, m, eA, { marca }); d.guardarEsquema(eA, m.toJSON());
  const nombreEnB = () => { const x = abrir(d, eB), s = x.datos.saltos[0]; return [x.punto(s.deId).titulo, x.punto(s.aId).titulo]; };
  assert.deepEqual(nombreEnB(), ['Relación', 'Relación']);
  /* se escribe el nombre en sitio (los dos extremos) y se guarda otra vez */
  const s0 = m.datos.saltos[0]; m.editarPunto(s0.deId, { titulo: 'Lo muerde' }); m.editarPunto(s0.aId, { titulo: 'Lo muerde' });
  assert.deepEqual(C.relaciones.renombrarReflejos(d, T, m, eA), [eB]);
  C.relaciones.reflejar(d, T, m, eA, { marca }); d.guardarEsquema(eA, m.toJSON());
  assert.deepEqual(nombreEnB(), ['Lo muerde', 'Lo muerde']);
  /* al revés: se renombra en B */
  const mB = abrir(d, eB), sl = mB.datos.saltos[0];
  mB.editarPunto(sl.deId, { titulo: 'Lo convierte' });
  assert.deepEqual(C.relaciones.renombrarReflejos(d, T, mB, eB), [eA]);
  const mA = abrir(d, eA), se = mA.datos.saltos[0];
  assert.deepEqual([mA.punto(se.deId).titulo, mA.punto(se.aId).titulo], ['Lo convierte', 'Lo convierte']);
});
