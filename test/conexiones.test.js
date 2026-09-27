/* Conexiones esquema ↔ biblioteca y fragmentos (1.1.57, js/claquedraw/documentos.js). Leo, 27-09-2026: «Anteriormente tenía la
   posibilidad de conectar esquemas con bibliotecas, varios a la vez […] dividir el guion en fragmentos más pequeños que vivan en
   notas de segmentos». Modelo puro: se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
const T = require('../js/tramas/modelo.js');

function nuevo(datos) {
  let t = 1000, n = 0;
  return new C.Documentos(datos, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
}
function proyecto() {
  const d = nuevo();
  const { contenedor: cap, sub: bib } = d.crearContenedor('Capítulo');
  const m = new T.Modelo(T.inicial());
  const l = m.datos.lineas[0];
  const p1 = m.nuevoPunto(l.id, 1, { titulo: 'Llega' }).punto, p2 = m.nuevoPunto(l.id, 3, { titulo: 'Se va' }).punto;
  const e1 = d.crearEsquema(cap.id, m.toJSON(), 'Piloto').esquema;
  const e2 = d.crearEsquema(cap.id, T.inicial(), 'Episodio 2').esquema;
  const otra = d.crearSub(cap.id, 'Fragmentos').sub;
  return { d, cap, bib, otra, e1, e2, p1, p2 };
}
const ids = xs => xs.map(x => (x.sub || x.esquema).id);

test('conectar y desconectar: de muchos a muchos, sin repetir, y en los dos sentidos', () => {
  const { d, bib, otra, e1, e2 } = proyecto();
  assert.deepEqual(d.bibliotecasDe(e1.id), []);
  assert.ok(d.conectar(e1.id, bib.id).cambio);
  assert.ok(d.conectar(e1.id, otra.id).ok);
  assert.ok(d.conectar(e2.id, otra.id).ok);
  assert.equal(d.conectar(e1.id, bib.id).cambio, false);                       // ya estaba
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id, otra.id]);
  assert.deepEqual(ids(d.esquemasConectados(otra.id)), [e1.id, e2.id]);
  assert.ok(d.conectado(e2.id, otra.id));
  const r = d.desconectar(e1.id, bib.id);
  assert.ok(r.cambio); assert.equal(r.pos, 0);
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [otra.id]);
  d.conectar(e1.id, bib.id, { pos: r.pos });                                  // el «Deshacer» la devuelve a su sitio
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id, otra.id]);
  d.desconectar(e1.id, bib.id);
  assert.ok(d.desconectar(e1.id, otra.id).ok);
  assert.equal(d.esquema(e1.id).esquema.bibliotecas, undefined);              // sin conexiones, sin la clave
  assert.equal(d.desconectar(e1.id, otra.id).cambio, false);
});

test('no se conectan la biblioteca de los guiones, la de las plantillas ni la de un personaje', () => {
  const { d, e1 } = proyecto();
  const gs = d.bibliotecaGuiones(e1.id);
  assert.equal(d.conectar(e1.id, gs.id).ok, false);
  d.asegurarPlantillas();
  assert.equal(d.conectar(e1.id, C.ID_BIB_PLANTILLAS).ok, false);
  const p = d.crearPersonaje('Mara').personaje, sp = d.bibliotecaPersonaje(p.id, 'Mara');
  assert.equal(d.conectar(e1.id, sp.id).ok, false);
  assert.equal(d.conectable(sp.id), false);
  assert.equal(d.conectar('nada', gs.id).ok, false);
  /* un esquema de personaje sí puede conectarse con una biblioteca normal */
  const ep = d.crearEsquemaPersonaje(T.inicial(), 'Mara').esquema;
  const b = d.crearSub(d.datos.contenedores.find(c => !c.oculto).id, 'Notas de Mara').sub;
  assert.ok(d.conectar(ep.id, b.id).ok);
});

test('«Ver biblioteca» y «Ver esquema» (enlace) van primero por las conexiones y, sin ellas, por el grupo', () => {
  const { d, cap, bib, otra, e1 } = proyecto();
  d.crearGrupo(cap.id, [e1.id, bib.id], 'Piloto');
  assert.equal(d.enlace(e1.id).sub.id, bib.id);                              // por el grupo
  assert.equal(d.enlace(otra.id), null);
  d.conectar(e1.id, otra.id);
  const x = d.enlace(e1.id);
  assert.equal(x.sub.id, otra.id); assert.ok(x.conectado);
  assert.equal(d.enlace(otra.id).esquema.id, e1.id);
  assert.equal(d.enlace(bib.id).esquema.id, e1.id);                          // la del grupo sigue yendo al esquema
});

test('papelera: una biblioteca tirada sigue conectada y vuelve con su conexión; eliminada del todo, se va', () => {
  const { d, bib, otra, e1, e2 } = proyecto();
  d.conectar(e1.id, bib.id); d.conectar(e1.id, otra.id); d.conectar(e2.id, otra.id);
  d.eliminarSub(otra.id);
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id]);                    // no se ve…
  assert.deepEqual(d.esquema(e1.id).esquema.bibliotecas, [bib.id, otra.id]);  // …pero sigue
  const d2 = nuevo(d.toJSON());                                               // y sobrevive al guardar y abrir
  assert.deepEqual(d2.esquema(e1.id).esquema.bibliotecas, [bib.id, otra.id]);
  d.restaurarPieza(otra.id);
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id, otra.id]);
  assert.deepEqual(ids(d.esquemasConectados(otra.id)), [e1.id, e2.id]);
  d.eliminarSub(otra.id); d.eliminarDefinitivo(otra.id);
  assert.deepEqual(d.esquema(e1.id).esquema.bibliotecas, [bib.id]);
  assert.equal(d.esquema(e2.id).esquema.bibliotecas, undefined);
  /* un esquema tirado se lleva sus conexiones y vuelve con ellas */
  d.eliminarEsquema(e1.id);
  assert.deepEqual(ids(d.esquemasConectados(bib.id)), []);
  d.restaurarPieza(e1.id);
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id]);
  /* vaciar la papelera poda lo que se iba */
  d.eliminarSub(bib.id); d.vaciarPapelera();
  assert.equal(d.esquema(e1.id).esquema.bibliotecas, undefined);
});

test('duplicar: la copia de una biblioteca queda conectada con los mismos esquemas, y la de un esquema con las mismas bibliotecas', () => {
  const { d, bib, e1, e2 } = proyecto();
  d.conectar(e1.id, bib.id); d.conectar(e2.id, bib.id);
  const copia = d.duplicarSub(bib.id).sub;
  assert.deepEqual(ids(d.esquemasConectados(copia.id)), [e1.id, e2.id]);
  const ce = d.duplicarEsquema(e1.id).esquema;
  assert.deepEqual(ids(d.bibliotecasDe(ce.id)), [bib.id, copia.id]);
});

test('normalizar poda las conexiones a lo que no existe y lo guardado vuelve idéntico', () => {
  const { d, bib, e1 } = proyecto();
  d.conectar(e1.id, bib.id);
  const datos = d.toJSON();
  datos.contenedores[0].esquemas[0].bibliotecas.push('no-existe', bib.id, 42);
  const d2 = nuevo(datos);
  assert.deepEqual(d2.esquema(e1.id).esquema.bibliotecas, [bib.id]);
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());
  assert.equal(JSON.stringify(C.normalizarDocumentos(d.toJSON())), JSON.stringify(d.toJSON()));
});

test('fragmentos: marcar una nota, su orden, cómo está y huérfano al borrar nodos o el esquema', () => {
  const { d, bib, e1, p1, p2 } = proyecto();
  d.conectar(e1.id, bib.id);
  const etq = d.crearEtiqueta(bib.id, 'Acto I').etiqueta;
  const a = d.crearNota(bib.id, etq.id, 'Fragmento 2').nota, b = d.crearNota(bib.id, etq.id, 'Fragmento 1').nota;
  assert.equal(d.fijarFragmento(a.id, { eid: e1.id, nodos: [p2.id], segundos: 12.34, orden: 2 }).cambio, true);
  d.fijarFragmento(b.id, { eid: e1.id, nodos: [p1.id, p1.id, p2.id], segundos: 9, orden: 1, bloques: [5, 2] });
  assert.deepEqual(d.nota(a.id).fragmento, { eid: e1.id, nodos: [p2.id], segundos: 12.3, orden: 2 });
  assert.deepEqual(d.nota(b.id).fragmento, { eid: e1.id, nodos: [p1.id, p2.id], segundos: 9, orden: 1, bloques: [2, 5] });
  assert.deepEqual(d.fragmentosDe(e1.id).map(n => n.id), [b.id, a.id]);
  assert.equal(d.fijarFragmento(a.id, { eid: 'nada', nodos: [] }).ok, false);
  assert.equal(d.fijarFragmento(a.id, { nodos: [] }).ok, false);
  let s = d.estadoFragmento(b.id);
  assert.equal(s.nombre, 'Piloto'); assert.equal(s.huerfano, false);
  assert.deepEqual(s.nodos.map(x => [x.id, x.titulo, x.col]), [[p1.id, 'Llega', 1], [p2.id, 'Se va', 3]]);
  /* ida y vuelta idéntica, también en la papelera */
  d.tirarNota(a.id);
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());
  assert.deepEqual(d.enPapelera(a.id).nota.fragmento.nodos, [p2.id]);
  d.restaurarNota(a.id);
  /* se borra un nodo: el fragmento lo dice, no se rompe */
  const m = new T.Modelo(d.esquema(e1.id).esquema.datos); m.borrarPunto(p2.id); d.guardarEsquema(e1.id, m.toJSON());
  s = d.estadoFragmento(b.id);
  assert.deepEqual(s.perdidos, [p2.id]); assert.equal(s.huerfano, false);
  assert.equal(d.estadoFragmento(a.id).huerfano, true);                      // su único nodo ya no está
  /* el esquema a la papelera: huérfano, pero se sabe cuál era */
  d.eliminarEsquema(e1.id);
  s = d.estadoFragmento(b.id);
  assert.equal(s.huerfano, true); assert.equal(s.enPapelera, true); assert.equal(s.nombre, 'Piloto');
  assert.deepEqual(d.fragmentosDe(e1.id).map(n => n.id), [b.id, a.id]);      // las notas siguen siendo fragmentos suyos
  d.eliminarDefinitivo(e1.id);
  assert.equal(d.estadoFragmento(b.id).nombre, '');
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());                  // y nada se cae al guardar
  /* quitar la marca */
  assert.ok(d.fijarFragmento(b.id, null).cambio);
  assert.equal(d.nota(b.id).fragmento, undefined);
  assert.equal(d.estadoFragmento(b.id), null);
});

test('una plantilla no es un fragmento, y guardar como plantilla o usarla no copia la marca', () => {
  const { d, bib, e1 } = proyecto();
  const n = d.crearNota(bib.id, null, 'Fragmento').nota;
  d.fijarFragmento(n.id, { eid: e1.id, nodos: [] });
  const pl = d.guardarComoPlantilla(n.id).nota;
  assert.equal(pl.fragmento, undefined);
  assert.equal(d.fijarFragmento(pl.id, { eid: e1.id, nodos: [] }).ok, false);
  const x = d.crearDesdePlantilla(pl.id, bib.id, null).nota;
  assert.equal(x.fragmento, undefined);
});

test('duplicar una biblioteca: las copias de sus fragmentos no son fragmentos (si no, contarían dos veces)', () => {
  const { d, bib, e1, p1 } = proyecto();
  d.conectar(e1.id, bib.id);
  const n = d.crearNota(bib.id, null, 'Fragmento 1').nota;
  d.fijarFragmento(n.id, { eid: e1.id, nodos: [p1.id], segundos: 10, orden: 1 });
  const copia = d.duplicarSub(bib.id).sub;
  assert.deepEqual(ids(d.bibliotecasDe(e1.id)), [bib.id, copia.id], 'la copia, conectada con el mismo esquema');
  const notas = d.notasDe(copia.id);
  assert.equal(notas.length, 1);
  assert.equal(notas[0].fragmento, undefined);
  assert.deepEqual(d.fragmentosDe(e1.id).map(x => x.id), [n.id], 'el fragmento, una sola vez');
  assert.ok(d.nota(n.id).fragmento, 'el original lo sigue siendo');
});
