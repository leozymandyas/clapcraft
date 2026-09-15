/* Relaciones entre personajes (js/claquedraw/relaciones.js): la relación de un tablero se refleja en el del otro personaje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/relaciones.js');

function tablero(p) {                                          // como datosPersonajes de app.js
  const t = T.inicial();
  t.lineas = [Object.assign({}, t.lineas[0], { nombre: p.nombre, personaje: p.id })];
  t.puntos = []; t.saltos = []; t.notas = [];
  return t;
}
function elenco() {
  const d = new C.Documentos(null);
  d.personajes(true);
  const lestat = d.crearPersonaje('Lestat').personaje, louis = d.crearPersonaje('Louis').personaje, claudia = d.crearPersonaje('Claudia').personaje;
  return { d, lestat, louis, claudia };
}
let n = 0; const marca = () => 'rel' + (++n);

test('una relación en el tablero de Lestat aparece al final del tablero de Louis, con su carril', () => {
  const { d, lestat, louis } = elenco();
  /* Louis ya tiene algo en su línea del tiempo */
  const eL = d.esquemaPersonaje(louis.id, tablero(louis)), mL = new T.Modelo(eL.datos);
  mL.nuevoPunto(mL.lineaPrincipal().id, mL.datos.actos[0].id, 9, { titulo: 'Se convierte' }); d.guardarEsquema(eL.id, mL.toJSON());
  /* en el de Lestat: carril de Louis y una relación en la celda 4 */
  const e = d.esquemaPersonaje(lestat.id, tablero(lestat)), m = new T.Modelo(e.datos);
  const carril = m.nuevaLinea('secundaria').linea; m.editarLinea(carril.id, { personaje: louis.id, nombre: 'Louis' });
  const ev = m.nuevoPunto(m.lineaPrincipal().id, m.datos.actos[0].id, 4, { titulo: 'Lo muerde' }).punto;
  m.crearSalto(ev.id, carril.id, 'cuadro');
  const cambiados = C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca });
  assert.deepEqual(cambiados, [louis.id]);
  const rel = m.datos.saltos[0].rel; assert.ok(rel, 'la relación de Lestat queda marcada');
  const mL2 = new T.Modelo(d.esquemaPersonaje(louis.id).datos);
  const reflejo = mL2.datos.saltos.find(s => s.rel === rel); assert.ok(reflejo);
  const de = mL2.punto(reflejo.deId), a = mL2.punto(reflejo.aId);
  assert.equal(mL2.linea(de.lineaId).tipo, 'principal');
  assert.equal(mL2.linea(a.lineaId).personaje, lestat.id, 'un carril de Lestat en el tablero de Louis');
  assert.equal(de.titulo, 'Lo muerde');
  assert.equal(mL2.cg(de), 11, 'al final: detrás de lo último (9) con un hueco');
  d.guardarEsquema(e.id, m.toJSON());                          // como volcar() en app.js: el tablero de Lestat se guarda con su marca
  /* guardar otra vez no duplica, y guardar el tablero de Louis no la rebota al de Lestat */
  assert.deepEqual(C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca }), []);
  assert.deepEqual(C.relaciones.reflejar(d, T, mL2, louis.id, tablero, { marca }), []);
  assert.equal(new T.Modelo(d.esquemaPersonaje(lestat.id).datos).datos.saltos.length, 1);
  assert.equal(new T.Modelo(d.esquemaPersonaje(louis.id).datos).datos.saltos.filter(s => s.rel === rel).length, 1);
});

test('una relación entre dos carriles ajenos se refleja en los tableros de los dos; si no lo tenían, se crea', () => {
  const { d, lestat, louis, claudia } = elenco();
  const e = d.esquemaPersonaje(lestat.id, tablero(lestat)), m = new T.Modelo(e.datos);
  const c1 = m.nuevaLinea('secundaria').linea; m.editarLinea(c1.id, { personaje: louis.id, nombre: 'Louis' });
  const c2 = m.nuevaLinea('secundaria').linea; m.editarLinea(c2.id, { personaje: claudia.id, nombre: 'Claudia' });
  const ev = m.nuevoPunto(c1.id, m.datos.actos[0].id, 6, { titulo: 'La adoptan' }).punto;
  m.crearSalto(ev.id, c2.id, 'cuadro');
  const cambiados = C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca });
  assert.deepEqual(cambiados.sort(), [louis.id, claudia.id].sort());
  for (const [yo, otro] of [[louis, claudia], [claudia, louis]]) {
    const mx = new T.Modelo(d.esquemaPersonaje(yo.id).datos);
    const s = mx.datos.saltos[0]; assert.ok(s && s.rel === m.datos.saltos[0].rel, yo.nombre);
    assert.equal(mx.linea(mx.punto(s.aId).lineaId).personaje, otro.id);
    assert.equal(mx.cg(mx.punto(s.deId)), 2, 'tablero vacío: en la celda 2');
  }
});

test('la marca de la relación sobrevive al guardado del tablero', () => {
  const m = new T.Modelo({ actos: [{ id: 'a1', nombre: 'A', celdas: 20 }], lineas: [{ id: 'l1', nombre: 'P', tipo: 'principal', color: 'azul' }, { id: 'l2', nombre: 'S', tipo: 'secundaria', color: 'rojo' }],
    puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 3 }, { id: 'p2', lineaId: 'l2', actoId: 'a1', celda: 3 }], saltos: [{ id: 's1', deId: 'p1', aId: 'p2', tipo: 'cuadro', rel: 'rel9' }], notas: [] });
  assert.equal(new T.Modelo(JSON.parse(JSON.stringify(m.toJSON()))).datos.saltos[0].rel, 'rel9');
});

test('borrar la relación en un tablero la borra en el otro (Leo, 15-09-2026)', () => {
  const { d, lestat, louis } = elenco();
  const e = d.esquemaPersonaje(lestat.id, tablero(lestat)), m = new T.Modelo(e.datos);
  const carril = m.nuevaLinea('secundaria').linea; m.editarLinea(carril.id, { personaje: louis.id, nombre: 'Louis' });
  const ev = m.nuevoPunto(m.lineaPrincipal().id, m.datos.actos[0].id, 4, { titulo: 'Lo muerde' }).punto;
  m.crearSalto(ev.id, carril.id, 'cuadro');
  C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca });
  d.guardarEsquema(e.id, m.toJSON());
  const deLouis = () => new T.Modelo(d.esquemaPersonaje(louis.id).datos);
  assert.equal(deLouis().datos.saltos.length, 1);
  /* se borra en el de Louis: al guardar el suyo, desaparece del de Lestat */
  const mL = deLouis(); mL.borrarSalto(mL.datos.saltos[0].id);
  assert.equal(C.relaciones.borrarReflejos(d, T, mL, louis.id).length, 1);
  d.guardarEsquema(d.esquemaPersonaje(louis.id).id, mL.toJSON());
  const mLestat = new T.Modelo(d.esquemaPersonaje(lestat.id).datos);
  assert.equal(mLestat.datos.saltos.length, 0); assert.equal(mLestat.datos.puntos.length, 0, 'con sus dos extremos');
  /* y no vuelve a crearse al guardar el de Lestat */
  assert.deepEqual(C.relaciones.reflejar(d, T, mLestat, lestat.id, tablero, { marca }), []);
  assert.equal(deLouis().datos.saltos.length, 0);
});

test('renombrar la relación después de crearla llega al reflejo, y renombrar el reflejo llega al original', () => {
  const { d, lestat, louis } = elenco();
  const e = d.esquemaPersonaje(lestat.id, tablero(lestat)), m = new T.Modelo(e.datos);
  const carril = m.nuevaLinea('secundaria').linea; m.editarLinea(carril.id, { personaje: louis.id, nombre: 'Louis' });
  const ev = m.nuevoPunto(m.lineaPrincipal().id, m.datos.actos[0].id, 4, { titulo: 'Relación' }).punto;
  m.crearSalto(ev.id, carril.id, 'cuadro');
  /* primer guardado automático: aún con el nombre propuesto */
  C.relaciones.borrarReflejos(d, T, m, lestat.id); C.relaciones.renombrarReflejos(d, T, m, lestat.id);
  C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca }); d.guardarEsquema(e.id, m.toJSON());
  const nombreEnLouis = () => { const x = new T.Modelo(d.esquemaPersonaje(louis.id).datos), s = x.datos.saltos[0]; return [x.punto(s.deId).titulo, x.punto(s.aId).titulo]; };
  assert.deepEqual(nombreEnLouis(), ['Relación', 'Relación']);
  /* se escribe el nombre en sitio (los dos extremos) y se guarda otra vez */
  const s0 = m.datos.saltos[0]; m.editarPunto(s0.deId, { titulo: 'Lo muerde' }); m.editarPunto(s0.aId, { titulo: 'Lo muerde' });
  assert.equal(C.relaciones.renombrarReflejos(d, T, m, lestat.id).length, 1);
  C.relaciones.reflejar(d, T, m, lestat.id, tablero, { marca }); d.guardarEsquema(e.id, m.toJSON());
  assert.deepEqual(nombreEnLouis(), ['Lo muerde', 'Lo muerde']);
  /* al revés: se renombra en el tablero de Louis */
  const mL = new T.Modelo(d.esquemaPersonaje(louis.id).datos), sl = mL.datos.saltos[0];
  mL.editarPunto(sl.deId, { titulo: 'Lo convierte' });
  assert.equal(C.relaciones.renombrarReflejos(d, T, mL, louis.id).length, 1);
  const mLe = new T.Modelo(d.esquemaPersonaje(lestat.id).datos), se = mLe.datos.saltos[0];
  assert.deepEqual([mLe.punto(se.deId).titulo, mLe.punto(se.aId).titulo], ['Lo convierte', 'Lo convierte']);
});
