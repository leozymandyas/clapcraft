/* Pruebas del gestor de documentos de Claquedraw (contenedores, subcontenedores, esquemas, etiquetas,
   notas y papelera): reglas que no dependen del DOM. Se ejecutan con `npm test` (Node 18 o superior). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');

function nuevo(datos) {
  let t = 1000, n = 0;
  return new C.Documentos(datos, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
}
/* Un esquema con su biblioteca agrupada a mano: `crearEsquema` ya no la crea (Leo, 16-09-2026). */
function conBiblioteca(d, cid, datos, nombre, nombreSub) {
  const e = d.crearEsquema(cid, datos, nombre).esquema;
  const sub = d.crearSub(cid, nombreSub || e.nombre).sub;
  d.crearGrupo(cid, [e.id, sub.id], e.nombre);
  return { esquema: e, sub, contenedor: d.contenedor(cid) };
}
const nombres = xs => xs.map(x => x.nombre || x.titulo);
const TABLERO = { actos: [{ id: 'a1', nombre: 'Acto I', celdas: 10 }], lineas: [{ id: 'l1', tipo: 'principal' }], puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 2, titulo: 'Inicio' }], saltos: [], notas: [] };

test('contenedores: crear (con un «Documentos» dentro) con nombre libre, renombrar, fijar, mover y eliminar con lo suyo', () => {
  const d = nuevo();
  const a = d.crearContenedor('Amanecer');                       // x1 = contenedor, x2 = su subcontenedor
  assert.equal(a.contenedor.nombre, 'Amanecer'); assert.equal(a.sub.nombre, C.NOMBRE_SUB); assert.equal(d.subsDe('x1').length, 1);
  assert.equal(d.crearContenedor('amanecer').contenedor.nombre, 'amanecer 2');   // x3 / x4
  assert.equal(d.crearContenedor('').contenedor.nombre, 'Contenedor');          // x5 / x6
  assert.equal(d.renombrarContenedor('x1', ' ').ok, false);
  assert.equal(d.renombrarContenedor('x1', 'AMANECER 2').ok, false);
  assert.equal(d.renombrarContenedor('x1', 'El faro').ok, true);
  d.fijarContenedor('x5', true);
  let L = d.contenedores({ orden: 'manual' });
  assert.deepEqual(nombres(L.fijados), ['Contenedor']); assert.deepEqual(nombres(L.sueltos), ['El faro', 'amanecer 2']);
  assert.equal(d.moverContenedor('x1', 1).ok, true);
  assert.deepEqual(nombres(d.contenedores({ orden: 'manual' }).sueltos), ['amanecer 2', 'El faro']);
  assert.equal(d.moverContenedor('x1', 1).ok, false);
  assert.deepEqual(nombres(d.contenedores({ orden: 'az' }).sueltos), ['amanecer 2', 'El faro']);
  const e = d.crearEtiqueta('x2', 'Acto I').etiqueta; d.crearNota('x2', e.id, 'Puerto'); d.crearNota('x2', null, 'Tono');
  const r = d.eliminarContenedor('x1');
  assert.equal(r.notas, 2);
  assert.equal(d.datos.etiquetas.length, 0); assert.equal(d.datos.notas.length, 0);
  assert.equal(d.papelera().length, 2);                                        // sus notas van a la papelera
  assert.equal(d.papelera()[0].origenNombre, 'El faro › Biblioteca');
  assert.equal(d.contenedores({}).total, 2);
});

test('subcontenedores: crear con nombre libre, renombrar, ordenar y mover a otro contenedor, eliminar con lo suyo', () => {
  const d = nuevo();
  d.crearContenedor('A'); d.crearContenedor('B');                // x1(x2) y x3(x4)
  const s = d.crearSub('x1', 'Personajes').sub;                  // x5
  assert.equal(d.crearSub('x1', 'personajes').sub.nombre, 'personajes 2');
  assert.equal(d.crearSub('zz', 'Nada').ok, false);
  assert.deepEqual(nombres(d.subsDe('x1')), ['Biblioteca', 'Personajes', 'personajes 2']);
  assert.equal(d.renombrarSub(s.id, 'biblioteca').ok, false);
  assert.equal(d.renombrarSub(s.id, 'Fichas').ok, true);
  assert.equal(d.sub(s.id).contenedor.id, 'x1');
  assert.equal(d.colocarSub(s.id, 'x2').ok, true);               // delante de «Documentos»
  assert.deepEqual(nombres(d.subsDe('x1')), ['Fichas', 'Biblioteca', 'personajes 2']);
  assert.equal(d.colocarSub(s.id, null).ok, true);               // al final del suyo
  assert.deepEqual(nombres(d.subsDe('x1')), ['Biblioteca', 'personajes 2', 'Fichas']);
  const r = d.colocarSub(s.id, null, 'x3');                      // a otro contenedor, al final
  assert.equal(r.movido, true); assert.deepEqual(nombres(d.subsDe('x3')), ['Biblioteca', 'Fichas']); assert.equal(d.subsDe('x1').length, 2);
  assert.equal(d.colocarSub('x2', 'x4').ok, true);               // delante de un sub de otro contenedor: se va allí y se renombra si choca
  assert.deepEqual(nombres(d.subsDe('x3')), ['Biblioteca 2', 'Biblioteca', 'Fichas']); assert.equal(d.subsDe('x1').length, 1);
  assert.equal(d.colocarSub(s.id, 'nada').ok, false);
  const e = d.crearEtiqueta(s.id, 'Lugares').etiqueta; d.crearNota(s.id, e.id, 'Faro'); d.crearNota(s.id, null, 'Tono');
  const x = d.eliminarSub(s.id);
  assert.equal(x.notas, 2); assert.equal(d.sub(s.id), null); assert.equal(d.etiqueta(e.id), null); assert.equal(d.papelera().length, 2);
  assert.equal(d.papelera()[0].origenNombre, 'B › Fichas');
});

test('etiquetas: nombre y color libres por subcontenedor, orden, color a mano y eliminar manda a la bandeja', () => {
  const d = nuevo();
  d.crearContenedor('A'); d.crearContenedor('B');                // subs x2 y x4
  const e1 = d.crearEtiqueta('x2').etiqueta, e2 = d.crearEtiqueta('x2').etiqueta, e3 = d.crearEtiqueta('x4').etiqueta;
  assert.deepEqual([e1.nombre, e2.nombre, e3.nombre], ['Segmento', 'Segmento 2', 'Segmento']);
  assert.deepEqual([e1.color, e2.color, e3.color], [0, 1, 0]);             // el color libre más bajo del subcontenedor
  assert.equal(d.crearEtiqueta('x2', 'Acto I', 5).etiqueta.color, 5);
  assert.equal(d.crearEtiqueta('zz').ok, false);
  assert.equal(d.renombrarEtiqueta(e1.id, 'segmento 2').ok, false);
  assert.equal(d.renombrarEtiqueta(e1.id, 'Apertura').ok, true);
  assert.equal(d.colorearEtiqueta(e1.id, 99).etiqueta.color, 0);
  assert.equal(d.moverEtiqueta(e2.id, -1).ok, true);
  assert.deepEqual(nombres(d.etiquetasDe('x2')), ['Segmento 2', 'Apertura', 'Acto I']);
  assert.equal(d.moverEtiqueta(e2.id, -1).ok, false);
  d.crearNota('x2', e1.id, 'Una'); d.crearNota('x2', e1.id, 'Dos');
  const r = d.eliminarEtiqueta(e1.id);
  assert.equal(r.sueltas, 2);
  assert.equal(d.notasDe('x2', null).length, 2);
  assert.equal(d.etiqueta(e1.id), null);
});

test('notas: crear en etiqueta o bandeja, mover (también a otro subcontenedor), renombrar, guardar solo si cambia, buscar', () => {
  const d = nuevo();
  d.crearContenedor('A'); d.crearContenedor('B');                // subs x2 y x4
  const e = d.crearEtiqueta('x2', 'Acto I').etiqueta;
  const n1 = d.crearNota('x2', e.id).nota, n2 = d.crearNota('x2', null).nota;
  assert.deepEqual([n1.titulo, n2.titulo], ['Sin título', 'Sin título 2']);
  assert.equal(d.crearNota('x2', 'no-existe').ok, false);
  assert.equal(d.crearNota('x4', e.id).ok, false);                             // etiqueta de otro subcontenedor
  assert.equal(d.notasDe('x2', e.id).length, 1); assert.equal(d.notasDe('x2', null).length, 1);
  assert.equal(d.moverNota(n2.id, e.id).ok, true); assert.equal(d.notasDe('x2', e.id).length, 2);
  assert.equal(d.moverNota(n2.id, null, 'x4').ok, true); assert.equal(d.nota(n2.id).subId, 'x4');
  assert.equal(d.moverNota(n2.id, e.id).ok, false);                            // ahora está en B
  assert.equal(d.renombrarNota(n1.id, '  ').ok, false);
  assert.equal(d.renombrarNota(n1.id, 'Puerto').ok, true);
  assert.equal(d.guardarNota(n1.id, { title: 'Puerto', html: '<p>hola</p>', characters: {} }).cambio, true);
  assert.equal(d.guardarNota(n1.id, { title: 'Puerto', html: '<p>hola</p>', characters: {} }).cambio, false);
  assert.equal(d.guardarNota(n1.id, { title: 'Muelle', html: '<p>hola</p>', characters: {} }).cambio, true);
  assert.equal(d.nota(n1.id).titulo, 'Muelle');
  assert.equal(d.guardarNota(n1.id, { title: 'x' }).ok, false);
  assert.deepEqual(nombres(d.buscarNotas('x2', 'MUE')), ['Muelle']);
  assert.deepEqual(nombres(d.buscarNotas('x2', 'zzz')), []);
  assert.equal(d.notasContenedor('x1').length, 1); assert.equal(d.notasContenedor('x3').length, 1);
  assert.equal(d.contenedores({ texto: 'muelle' }).sueltos.length, 1);          // busca dentro de las notas
  assert.equal(d.contenedores({ texto: 'biblioteca' }).sueltos.length, 2);      // y en los nombres de los subcontenedores
});

test('normalizar descarta huérfanos y repetidos, manda a la bandeja las notas sin etiqueta válida, y entiende lo antiguo', () => {
  const d = nuevo({
    contenedores: [{ id: 'c1', nombre: 'A', subs: [{ id: 's1', nombre: 'Docs' }] }, { id: 'c1', nombre: 'repetido' }, { nombre: 'sin id' }],
    etiquetas: [{ id: 'e1', subId: 's1', nombre: 'X', color: 40 }, { id: 'e2', subId: 'nada', nombre: 'huérfana' }],
    notas: [{ id: 'n1', subId: 's1', etiquetaId: 'e1', titulo: 'ok' }, { id: 'n2', subId: 's1', etiquetaId: 'e2', titulo: 'a la bandeja' }, { id: 'n3', subId: 'nada' }]
  });
  assert.equal(d.datos.contenedores.length, 1);
  assert.deepEqual(d.datos.etiquetas.map(e => [e.id, e.color]), [['e1', 0]]);
  assert.deepEqual(d.datos.notas.map(n => [n.id, n.etiquetaId]), [['n1', 'e1'], ['n2', null]]);
  /* la forma anterior: etiquetas y notas colgadas del contenedor pasan a un «Documentos» nuevo */
  const viejo = nuevo({ contenedores: [{ id: 'c', nombre: 'Viejo' }], etiquetas: [{ id: 'e', contenedorId: 'c', nombre: 'Lugares' }, { id: 'p', contenedorId: 'c', nombre: 'Ana', personaje: 'Ana' }],
    notas: [{ id: 'n', contenedorId: 'c', etiquetaId: 'e', titulo: 'Faro' }, { id: 'm', contenedorId: 'c', etiquetaId: 'p', titulo: 'Ficha' }] });
  assert.deepEqual(nombres(viejo.subsDe('c')), ['Biblioteca']);
  const sid = viejo.subsDe('c')[0].id;
  assert.equal(viejo.etiqueta('p'), null);                                       // los «Personajes» de antes se descartan
  assert.deepEqual(viejo.datos.notas.map(n => [n.subId, n.etiquetaId]), [[sid, 'e'], [sid, null]]);
  assert.equal(nuevo(viejo.toJSON()).subsDe('c').length, 1);
});

test('orden manual: una nota queda delante de otra al soltarla, y los segmentos se colocan', () => {
  const d = nuevo();
  d.crearContenedor('A');                                        // sub x2
  const e = d.crearEtiqueta('x2', 'Acto I').etiqueta;
  const a = d.crearNota('x2', e.id, 'a').nota, b = d.crearNota('x2', e.id, 'b').nota, c = d.crearNota('x2', e.id, 'c').nota;
  assert.equal(d.moverNota(c.id, e.id, null, a.id).ok, true);
  assert.deepEqual(nombres(d.notasDe('x2', e.id)), ['c', 'a', 'b']);
  assert.equal(d.moverNota(a.id, e.id).ok, true);                              // sin antesDe: al final
  assert.deepEqual(nombres(d.notasDe('x2', e.id)), ['c', 'b', 'a']);
  assert.equal(d.moverNota(b.id, null, null, a.id).ok, true);                  // a la bandeja: antesDe de otro sitio no cuenta
  assert.deepEqual(nombres(d.notasDe('x2', null)), ['b']);
  const e2 = d.crearEtiqueta('x2', 'Acto II').etiqueta, e3 = d.crearEtiqueta('x2', 'Acto III').etiqueta;
  assert.equal(d.colocarEtiqueta(e3.id, e.id).ok, true);
  assert.deepEqual(nombres(d.etiquetasDe('x2')), ['Acto III', 'Acto I', 'Acto II']);
  assert.equal(d.colocarEtiqueta(e.id, null).ok, true);
  assert.deepEqual(nombres(d.etiquetasDe('x2')), ['Acto III', 'Acto II', 'Acto I']);
  d.crearContenedor('B');                                        // x9, sub x10
  assert.equal(d.colocarEtiqueta(e2.id, d.crearEtiqueta(d.subsDe('x9')[0].id, 'Otra').etiqueta.id).ok, false);
});

test('papelera: tirar, restaurar al origen o a otro sitio, eliminar del todo, vaciar y purgar a los 30 días', () => {
  const d = nuevo();
  d.crearContenedor('A'); d.crearContenedor('B');                // subs x2 y x4
  const e = d.crearEtiqueta('x2', 'Acto I').etiqueta;
  const n = d.crearNota('x2', e.id, 'Puerto').nota, m = d.crearNota('x2', null, 'Tono').nota;
  assert.equal(d.tirarNota(n.id).ok, true);
  assert.equal(d.nota(n.id), null); assert.equal(d.enPapelera(n.id).origenNombre, 'A › Biblioteca');
  assert.equal(d.tirarNota(n.id).ok, false);
  assert.equal(d.restaurarNota(n.id).sub.id, 'x2');                            // al origen, a la bandeja
  assert.equal(d.nota(n.id).etiquetaId, null);
  d.tirarNota(n.id); assert.equal(d.restaurarNota(n.id, 'x4').contenedor.nombre, 'B');   // a otro subcontenedor
  d.tirarNota(n.id); assert.equal(d.restaurarNota(n.id, 'x3').sub.id, 'x4');            // un contenedor vale: su primer subcontenedor
  d.tirarNota(n.id); d.eliminarContenedor('x1'); d.eliminarContenedor('x3');
  assert.equal(d.restaurarNota(n.id).ok, false);                                // no queda dónde
  d.crearContenedor('C');
  assert.equal(d.restaurarNota(n.id).contenedor.nombre, 'C');                    // al primero que haya
  d.tirarNota(n.id);
  assert.equal(d.eliminarDefinitivo(n.id).ok, true); assert.equal(d.enPapelera(n.id), null); assert.equal(d.eliminarDefinitivo(n.id).ok, false);
  assert.equal(d.papelera().length, 1);                                          // «Tono», de eliminar A
  assert.equal(d.vaciarPapelera().eliminadas, 1); assert.equal(d.vaciarPapelera().eliminadas, 0);
  /* purga: una nota tirada hace más de 30 días desaparece; una reciente se queda */
  const sub = d.subsDe(d.datos.contenedores[0].id)[0].id;
  const viejo = d.crearNota(sub, null, 'Vieja').nota; d.tirarNota(viejo.id);
  d.enPapelera(viejo.id).eliminadoEn -= 31 * 864e5;
  const nuevo2 = d.crearNota(sub, null, 'Reciente').nota; d.tirarNota(nuevo2.id);
  assert.equal(d.purgarPapelera(30).purgadas, 1);
  assert.deepEqual(d.papelera().map(x => x.nota.titulo), ['Reciente']);
  assert.equal(nuevo(d.toJSON()).papelera().length, 1);                          // viaja en los datos
});

test('esquemas de un contenedor: varios, con nombre libre; crear, guardar, notas de sus nodos, podar, mover y eliminar', () => {
  const d = nuevo();
  d.crearContenedor('Investigación'); d.crearContenedor('Otro');   // x1 y x3
  assert.deepEqual(d.esquemasDe('x1'), []);
  assert.equal(d.crearEsquema('x1', { hola: 1 }).ok, false);
  const e1 = d.crearEsquema('x1', TABLERO).esquema, e2 = d.crearEsquema('x1', TABLERO, 'Esquema').esquema;
  assert.deepEqual(nombres(d.esquemasDe('x1')), ['Esquema', 'Esquema 2']);
  assert.equal(d.renombrarEsquema(e2.id, 'esquema').ok, false); assert.equal(d.renombrarEsquema(e2.id, 'Flashbacks').ok, true);
  assert.equal(d.esquema(e1.id).contenedor.id, 'x1'); assert.equal(d.esquema('nada'), null);
  assert.equal(d.guardarEsquema(e1.id, TABLERO).cambio, false);
  const t2 = JSON.parse(JSON.stringify(TABLERO)); t2.puntos.push({ id: 'p2', lineaId: 'l1', actoId: 'a1', celda: 5, titulo: 'Dos' });
  assert.equal(d.guardarEsquema(e1.id, t2).cambio, true);
  assert.equal(d.guardarNotaEsquema(e1.id, 'p1', { title: 'Inicio', html: '<p>a</p>' }).cambio, true);
  assert.equal(d.guardarNotaEsquema(e1.id, 'p1', { title: 'Inicio', html: '<p>a</p>' }).cambio, false);
  assert.ok(d.notaEsquema(e1.id, 'p1').modificado > 0);                                  // cuándo se escribió (la fecha en la cronología)
  assert.equal(nuevo(d.toJSON()).esquema(e1.id).esquema.notas.p1.modificado, d.notaEsquema(e1.id, 'p1').modificado);
  assert.equal(d.notaEsquema(e1.id, 'p1').html, '<p>a</p>'); assert.equal(d.notaEsquema(e2.id, 'p1'), null);
  d.guardarNotaEsquema(e1.id, 'p9', { html: 'x' });
  assert.equal(d.podarNotasEsquema(e1.id, ['p1', 'p2']).podadas, 1);
  const j = nuevo(d.toJSON()); assert.equal(j.esquema(e1.id).esquema.datos.puntos.length, 2); assert.equal(j.notaEsquema(e1.id, 'p1').html, '<p>a</p>');
  /* ordenar y mover a otro contenedor */
  assert.equal(d.colocarEsquema(e2.id, e1.id).ok, true); assert.deepEqual(nombres(d.esquemasDe('x1')), ['Flashbacks', 'Esquema']);
  assert.equal(d.colocarEsquema(e2.id, null).ok, true); assert.deepEqual(nombres(d.esquemasDe('x1')), ['Esquema', 'Flashbacks']);
  assert.equal(d.colocarEsquema(e2.id, null, 'x3').movido, true); assert.deepEqual(nombres(d.esquemasDe('x3')), ['Flashbacks']); assert.equal(d.esquemasDe('x1').length, 1);
  const e3 = d.crearEsquema('x3', TABLERO, 'Esquema').esquema;
  assert.equal(d.colocarEsquema(e1.id, e3.id).ok, true);           // delante de uno de otro contenedor: se va allí y se renombra si choca
  assert.deepEqual(nombres(d.esquemasDe('x3')), ['Flashbacks', 'Esquema 2', 'Esquema']); assert.equal(d.esquemasDe('x1').length, 0);
  assert.equal(d.colocarEsquema(e1.id, 'nada').ok, false);
  /* la forma anterior (un `esquema` por contenedor) se convierte en una lista */
  const viejo = nuevo({ contenedores: [{ id: 'c', esquema: { datos: TABLERO, notas: { p1: { html: 'h' } } } }, { id: 'r', esquema: { datos: 'roto' } }] });
  assert.equal(viejo.esquemasDe('c').length, 1); assert.equal(viejo.notaEsquema(viejo.esquemasDe('c')[0].id, 'p1').html, 'h'); assert.equal(viejo.esquemasDe('r').length, 0);
  assert.equal(d.eliminarEsquema(e1.id).ok, true); assert.deepEqual(nombres(d.esquemasDe('x3')), ['Flashbacks', 'Esquema']);
  assert.equal(d.eliminarEsquema(e1.id).ok, false);
  assert.equal(d.eliminarContenedor('x3').esquemas, 2);
});

test('migrar el esquema antiguo del guion: al primer contenedor (o «Trama global» nuevo), con sus notas, y solo una vez', () => {
  const d = nuevo();
  const r = d.migrarEsquema(TABLERO, { p1: { title: 'Inicio', html: '<p>hola</p>' } });
  assert.equal(r.cambio, true); assert.equal(r.contenedor.nombre, C.NOMBRE_GLOBAL); assert.equal(r.esquema.nombre, 'Esquema de pasos');
  assert.deepEqual(nombres(d.subsDe(r.contenedor.id)), ['Biblioteca']);         // el «Capítulo» nuevo trae su biblioteca; el esquema ya no estrena una
  assert.equal(d.enlace(r.esquema.id), null);
  assert.equal(d.notaEsquema(r.esquema.id, 'p1').html, '<p>hola</p>');
  assert.equal(d.migrarEsquema(TABLERO).cambio, false);                          // ya migrado
  assert.equal(nuevo(d.toJSON()).datos.migrado, true);
  /* nada es especial: el contenedor y el esquema se renombran y se eliminan */
  assert.equal(d.renombrarContenedor(r.contenedor.id, 'Mi guion').ok, true);
  assert.equal(d.eliminarEsquema(r.esquema.id).ok, true);
  assert.equal(d.eliminarContenedor(r.contenedor.id).ok, true); assert.equal(d.datos.contenedores.length, 0);
  const d2 = nuevo(); d2.crearContenedor('Ya había');
  assert.equal(d2.migrarEsquema(TABLERO, {}).contenedor.nombre, 'Ya había');       // al primero que exista
  assert.equal(nuevo().migrarEsquema(null).esquema, null);                          // sin tablero: solo marca
});

test('enlace esquema ↔ documentos: nacen juntos con el mismo nombre, se renombran por separado, se mueven juntos y el enlace se quita', () => {
  const d = nuevo();
  d.crearContenedor('Uno'); d.crearContenedor('Dos');                                      // x1 (x2) y x3 (x4)
  const r = conBiblioteca(d, 'x1', TABLERO, 'Flashbacks');
  assert.equal(r.sub.nombre, 'Flashbacks'); assert.deepEqual(d.grupoDe(r.esquema.id).grupo.items, [r.esquema.id, r.sub.id]);
  assert.deepEqual(nombres(d.subsDe('x1')), ['Biblioteca', 'Flashbacks']);
  assert.equal(d.enlace(r.esquema.id).sub, r.sub); assert.equal(d.enlace(r.sub.id).esquema, r.esquema); assert.equal(d.enlace('x2'), null);
  assert.equal(conBiblioteca(d, 'x1', TABLERO, 'Otro', 'Biblioteca').sub.nombre, 'Biblioteca 2');   // choca con otro subcontenedor: nombre libre
  assert.equal(d.renombrarSub(r.sub.id, 'Fichas').ok, true); assert.equal(r.esquema.nombre, 'Flashbacks');
  assert.equal(d.renombrarEsquema(r.esquema.id, 'Pasos').ok, true); assert.equal(r.sub.nombre, 'Fichas');
  /* mover el esquema se lleva su documentos, y al revés */
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x3').ok, true);
  assert.equal(d.enlace(r.sub.id).contenedor.id, 'x3'); assert.deepEqual(nombres(d.subsDe('x3')), ['Biblioteca', 'Fichas']);
  assert.equal(d.colocarSub(r.sub.id, null, 'x1').ok, true);
  assert.deepEqual(nombres(d.esquemasDe('x1')), ['Otro', 'Pasos']); assert.equal(d.esquemasDe('x3').length, 0);
  assert.equal(nuevo(d.toJSON()).enlace(r.esquema.id).sub.id, r.sub.id);                   // viaja en los datos
  /* un enlace roto o repetido se descarta al cargar */
  const j = d.toJSON(); j.contenedores[0].grupos = [{ id: 'gx', nombre: 'Grupo', color: 'ambar', items: [r.esquema.id, r.sub.id, r.sub.id] }];
  assert.deepEqual(nuevo(j).grupoDe(r.esquema.id).grupo.items, [r.esquema.id, r.sub.id]);   // sin repetidos
  /* quitar el enlace: los dos se quedan, sueltos */
  assert.equal(d.quitarEnlace(r.sub.id).ok, true); assert.equal(d.enlace(r.esquema.id), null);
  assert.equal(d.quitarEnlace(r.esquema.id).ok, true, 'el grupo se queda con uno y de ahí también se sale');
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x3').ok, true); assert.equal(d.sub(r.sub.id).contenedor.id, 'x1');
  /* agrupar a mano: dentro del mismo contenedor, y un grupo admite más de dos (Leo, 16-09-2026) */
  const suelto = d.crearSub('x1', 'Notas').sub;
  assert.equal(d.enlazar(r.esquema.id, suelto.id).ok, false);                              // el esquema está en x3, la biblioteca en x1
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x1').ok, true);
  assert.equal(d.enlazar(r.esquema.id, suelto.id).ok, true);
  assert.equal(d.grupoDe(suelto.id).grupo.items.length, 2, 'un grupo nuevo con los dos');
  assert.equal(d.enlace(suelto.id).esquema, r.esquema);
  assert.equal(d.enlazar(r.sub.id, suelto.id).ok, true);                                   // un tercero entra en ese grupo
  assert.equal(d.grupoDe(r.sub.id).grupo.items.length, 3);
  const otro = d.crearEsquema('x1', TABLERO, 'Otro esquema').esquema;
  assert.equal(d.enlazar(otro.id, suelto.id).ok, true);                                    // se puede juntar con lo que sea
  assert.equal(d.grupoDe(otro.id).grupo.items.length, 4);
  assert.equal(d.quitarEnlace(otro.id).ok, true); assert.equal(d.grupoDe(otro.id), null);
  /* eliminar el documentos enlazado deja el esquema suelto */
  const r2 = conBiblioteca(d, 'x3', TABLERO, 'Otro');
  assert.equal(d.eliminarSub(r2.sub.id).ok, true);
  assert.deepEqual(d.nivelGrupo(d.grupoDe(r2.esquema.id).grupo.id).map(x => x.id), [r2.esquema.id]);   // el grupo se queda con él solo
});

test('personajes: dos contenedores ocultos, la biblioteca de cada uno y los esquemas de personaje', () => {
  const d = nuevo(); d.crearContenedor('Capítulo');
  assert.equal(d.personajes(), null); assert.equal(d.esquemasPersonajes(), null);        // no existen hasta que se crean
  const p = d.personajes(true);
  assert.equal(p.oculto, true); assert.equal(d.personajes(true), p);                     // una sola vez
  const le = d.crearPersonaje('Lestat').personaje, lo = d.crearPersonaje('Louis').personaje;
  /* un esquema de personaje: documento suelto del contenedor «Esquemas», con su primera trama */
  const t = { actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal', nombre: 'Lestat', personaje: le.id }], puntos: [], saltos: [], notas: [] };
  const r = d.crearEsquemaPersonaje(t, 'Lestat');
  assert.equal(r.ok, true); assert.equal(r.contenedor.id, C.ID_ESQUEMAS_PERSONAJE); assert.equal(r.contenedor.oculto, true);
  assert.equal(r.contenedor.subs.length, 0);                                             // ahí no nacen bibliotecas
  assert.equal(d.esEsquemaPersonaje(r.esquema.id), true);
  const r2 = d.crearEsquemaPersonaje(t, 'Lestat');                                       // se pueden tener varios del mismo
  assert.equal(r2.esquema.nombre, 'Lestat 2'); assert.notEqual(r2.esquema.id, r.esquema.id);
  assert.equal(d.eliminarEsquema(r2.esquema.id).ok, true);                               // y se eliminan como cualquiera
  /* ahí también hay carpetas y orden */
  const k = d.crearCarpeta(C.ID_ESQUEMAS_PERSONAJE, 'Secundarios', 'azul').carpeta;
  assert.equal(d.moverACarpeta('esquema', r.esquema.id, k.id).ok, true);
  assert.equal(d.nivelArbol(C.ID_ESQUEMAS_PERSONAJE, k.id).map(x => x.id).join(), r.esquema.id);
  assert.equal(d.eliminarPersonaje(lo.id).ok, true);
  assert.equal(d.contenedores({}).total, 1); assert.deepEqual(nombres(d.contenedores({}).sueltos), ['Capítulo']);   // ninguno sale en el árbol
  const b = d.bibliotecaPersonaje(le.id, 'Lestat');
  assert.equal(b.nombre, 'Lestat'); assert.equal(d.bibliotecaPersonaje(le.id, 'Lestat de Lioncourt'), b); assert.equal(b.nombre, 'Lestat de Lioncourt');
  d.crearNota(b.id, null, 'Voz del narrador');
  const j = nuevo(d.toJSON());
  assert.equal(j.contenedor('personajes').oculto, true); assert.equal(j.bibliotecaPersonaje(le.id).id, b.id); assert.equal(j.notasDe(b.id).length, 1);
  assert.equal(j.esEsquemaPersonaje(r.esquema.id), true);
  const k2 = nuevo(); k2.personajes(true);
  assert.equal(k2.migrarEsquema(TABLERO).contenedor.nombre, C.NOMBRE_GLOBAL);            // la migración no usa los ocultos
});

test('los tableros por personaje de antes se mudan al contenedor «Esquemas»; los vacíos se descartan', () => {
  const d = nuevo(); d.personajes(true); d.crearPersonaje('Lestat'); d.crearPersonaje('Louis');
  const le = d.elenco()[0].id, lo = d.elenco()[1].id;
  const conNodo = { actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal', nombre: 'Lestat', personaje: le }],
                    puntos: [{ id: 'p1', lineaId: 'l1', actoId: TABLERO.actos[0].id, celda: 0, titulo: 'Inicio' }], saltos: [], notas: [] };
  const vacio = { actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal', nombre: 'Louis', personaje: lo }], puntos: [], saltos: [], notas: [] };
  const datos = d.toJSON();
  const per = datos.contenedores.find(c => c.id === 'personajes');
  per.esquemas = [{ id: 'personajes:esquema:' + le, nombre: 'Lestat', datos: conNodo, notas: {} },
                  { id: 'personajes:esquema:' + lo, nombre: 'Louis', datos: vacio, notas: {} }];
  const j = nuevo(datos);
  assert.equal(j.contenedor('personajes').esquemas.length, 0);
  const c = j.contenedor(C.ID_ESQUEMAS_PERSONAJE);
  assert.deepEqual(c.esquemas.map(e => e.nombre), ['Lestat']);                            // el vacío no se queda
  assert.equal(c.oculto, true); assert.equal(j.esEsquemaPersonaje(c.esquemas[0].id), true);
});

test('elenco: personajes del editor y de Personajes; renombrar y recolorear reescribe las notas; no se elimina si lo nombran', () => {
  const d = nuevo();
  const c = d.crearContenedor('Capítulo').contenedor, sub = c.subs[0].id;
  const n = d.crearNota(sub, null, 'Escena 1').nota;
  const html = '<p class="sp-scene">INT. CAFÉ</p><p class="sp-character" data-ch="0">Ana</p><p class="sp-dialogue">Hola.</p><p class="sp-character">ANA (V.O.)</p><p class="sp-character">Marco</p>';
  d.guardarNota(n.id, { title: 'Escena 1', html, characters: { ana: { name: 'Ana', color: 0 }, marco: { name: 'Marco', color: 3 } } });
  assert.deepEqual(d.elenco().map(p => p.nombre), ['Ana', 'Marco']);                    // guardar una nota enseña sus personajes al elenco
  assert.equal(d.crearPersonaje('ana').ok, false);                                       // mismo nombre sin mayúsculas
  const lu = d.crearPersonaje('Lucía', 5).personaje; assert.equal(lu.color, 5);
  const ana = d.elenco().find(p => p.nombre === 'Ana');
  assert.deepEqual(d.menciones(ana.id).map(m => [m.titulo, m.ruta]), [['Escena 1', 'Capítulo › Biblioteca']]);
  assert.equal(d.menciones(lu.id).length, 0);
  /* también en las notas de los nodos de un esquema */
  const e = d.crearEsquema(c.id, TABLERO, 'Pasos').esquema;
  d.guardarNotaEsquema(e.id, 'p1', { title: 'Inicio', html: '<p class="sp-character">Ana</p>', characters: { ana: { name: 'Ana', color: 0 } } });
  assert.deepEqual(d.menciones(ana.id).map(m => m.tipo), ['nota', 'nodo']);
  /* renombrar: bloques (con su extensión) y registros, en todas las notas */
  assert.equal(d.renombrarPersonaje(ana.id, 'Marco').ok, false);
  const r = d.renombrarPersonaje(ana.id, 'Anabel');
  assert.equal(r.ok, true); assert.equal(r.notas, 2);
  assert.match(d.nota(n.id).html, /data-ch="0">Anabel<\/p>/); assert.match(d.nota(n.id).html, />Anabel \(V\.O\.\)<\/p>/); assert.match(d.nota(n.id).html, />Marco<\/p>/);
  assert.deepEqual(Object.keys(d.nota(n.id).characters).sort(), ['anabel', 'marco']);
  assert.equal(d.notaEsquema(e.id, 'p1').html, '<p class="sp-character">Anabel</p>');
  /* recolorear: los registros de las notas */
  d.colorearPersonaje(ana.id, 7); assert.equal(d.nota(n.id).characters.anabel.color, 7); assert.equal(d.notaEsquema(e.id, 'p1').characters.anabel.color, 7);
  /* eliminar: no mientras lo nombren; sí cuando no, y su carril queda sin personaje */
  assert.equal(d.eliminarPersonaje(ana.id).ok, false);
  const pj = d.crearEsquemaPersonaje({ actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal' }, { id: 'l2', tipo: 'secundaria', personaje: lu.id, nombre: 'Lucía' }], puntos: [], saltos: [], notas: [] }, 'Ana').esquema;
  d.renombrarPersonaje(lu.id, 'Lucía Pérez'); assert.equal(pj.datos.lineas[1].nombre, 'Lucía Pérez');
  assert.equal(d.eliminarPersonaje(lu.id).ok, true); assert.equal(pj.datos.lineas[1].personaje, undefined);
  /* una errata que llegó al elenco desde una nota sale cuando ya no la nombra ninguna; lo creado a mano se queda */
  const n2 = d.crearNota(sub, null, 'Escena 2').nota;
  d.guardarNota(n2.id, { title: 'Escena 2', html: '<p class="sp-character">Cl</p>', characters: { cl: { name: 'Cl', color: 2 } } });
  assert.ok(d.elenco().some(p => p.nombre === 'Cl'));
  d.guardarNota(n2.id, { title: 'Escena 2', html: '<p class="sp-character">Claudia</p>', characters: { claudia: { name: 'Claudia', color: 2 } } });
  assert.ok(!d.elenco().some(p => p.nombre === 'Cl')); assert.ok(d.elenco().some(p => p.nombre === 'Claudia'));
  const manual = d.crearPersonaje('Sin notas').personaje; d.guardarNota(n2.id, { title: 'Escena 2', html: '<p>nada</p>', characters: {} });
  assert.ok(d.personaje(manual.id)); assert.ok(!d.elenco().some(p => p.nombre === 'Claudia'));
  d.eliminarPersonaje(manual.id);
  /* el elenco viaja en los datos y se reconstruye con los registros de las notas */
  assert.deepEqual(nuevo(d.toJSON()).elenco().map(p => p.nombre).sort(), ['Anabel', 'Marco']);
  const sinElenco = d.toJSON(); delete sinElenco.elenco;
  assert.deepEqual(nuevo(sinElenco).elenco().map(p => p.nombre).sort(), ['Anabel', 'Marco']);
});

test('orden manual de contenedores (dentro de su grupo)', () => {
  const d = nuevo();
  d.crearContenedor('A'); d.crearContenedor('B'); d.crearContenedor('C'); d.fijarContenedor('x5', true);   // x1, x3, x5
  assert.equal(d.colocarContenedor('x3', 'x1').ok, true);
  assert.deepEqual(nombres(d.contenedores({ orden: 'manual' }).sueltos), ['B', 'A']);
  assert.equal(d.colocarContenedor('x3', null).ok, true);                                    // al final de los sueltos
  assert.deepEqual(nombres(d.contenedores({ orden: 'manual' }).sueltos), ['A', 'B']);
  assert.equal(d.colocarContenedor('x1', 'x5').ok, true);                                    // delante de uno fijado: pasa a fijados
  assert.equal(d.contenedor('x1').fijado, true); assert.deepEqual(nombres(d.contenedores({ orden: 'manual' }).fijados), ['A', 'C']);
});

test('orden propio de actos y documentos en una biblioteca (no toca la línea de tiempo)', () => {
  const d = nuevo(); const c = d.crearContenedor('Capítulo').contenedor, sub = c.subs[0].id;
  assert.deepEqual(d.ordenActos(sub, ['a1', 'a2', 'a3']), ['a1', 'a2', 'a3']);             // sin orden guardado, el natural
  d.colocarActo(sub, 'a3', 'a1', ['a1', 'a2', 'a3']);
  assert.deepEqual(d.ordenActos(sub, ['a1', 'a2', 'a3']), ['a3', 'a1', 'a2']);
  assert.deepEqual(d.ordenActos(sub, ['a1', 'a2', 'a4', 'a3']), ['a3', 'a1', 'a2', 'a4']);  // uno nuevo entra detrás de su vecino
  assert.deepEqual(d.ordenActos(sub, ['a0', 'a1', 'a3']), ['a0', 'a3', 'a1']);              // y uno sin vecino anterior, delante de todo
  d.colocarNodoActo(sub, 'a1', 'p2', null, ['p1', 'p2', 'p3']);
  d.colocarNodoActo(sub, 'a1', 'p3', 'p1', ['p1', 'p3', 'p2']);
  assert.deepEqual(d.ordenNodos(sub, 'a1', ['p1', 'p2', 'p3']), ['p3', 'p1', 'p2']);
  assert.equal(d.colocarNodoActo(sub, 'a1', 'p9', null, ['p1']).ok, false);                // solo dentro de su segmento
  assert.deepEqual(nuevo(d.toJSON()).ordenNodos(sub, 'a1', ['p1', 'p2', 'p3']), ['p3', 'p1', 'p2']);   // viaja en los datos
  /* el carrusel de un personaje: momentos y segmentos en un mismo orden */
  const nat = ['apariciones', 'bandeja', 'acto:a1', 'acto:a2', 'etq:e1', 'etq:e2'];
  d.colocarSegmento(sub, 'etq:e2', 'acto:a1', nat);
  d.colocarSegmento(sub, 'bandeja', null, d.ordenSegmentos(sub, nat));                        // la bandeja y las apariciones también se mueven
  assert.deepEqual(d.ordenSegmentos(sub, nat), ['apariciones', 'etq:e2', 'acto:a1', 'acto:a2', 'etq:e1', 'bandeja']);
  assert.deepEqual(d.ordenSegmentos(sub, nat.concat('etq:e3')), ['apariciones', 'etq:e2', 'acto:a1', 'acto:a2', 'etq:e1', 'bandeja', 'etq:e3']);   // un segmento nuevo, al final
  assert.deepEqual(nuevo(d.toJSON()).ordenSegmentos(sub, nat), ['apariciones', 'etq:e2', 'acto:a1', 'acto:a2', 'etq:e1', 'bandeja']);
});

test('carpetas: crear anidadas, meter esquemas (con su biblioteca) y bibliotecas, contar, plegar, renombrar y colorear', () => {
  const d = nuevo();
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true });
  const e = conBiblioteca(d, c.id, TABLERO, 'Esquema 1');
  const suelta = d.crearSub(c.id, 'Lugares').sub;
  const t1 = d.crearCarpeta(c.id, 'Temporada 1', 'azul').carpeta;
  const cap = d.crearCarpeta(c.id, 'Capítulo I', 'violeta', t1.id).carpeta;
  assert.equal(d.crearCarpeta(c.id, 'capítulo i', 'rojo', t1.id).carpeta.nombre, 'capítulo i 2');   // entre hermanas, sin repetir
  assert.equal(d.crearCarpeta(c.id, 'X', 'fucsia').carpeta.color, 'gris');                           // color desconocido: gris
  assert.equal(d.crearCarpeta(c.id, 'Y', 'azul', 'no-existe').ok, false);
  assert.deepEqual(d.hijasDe(c.id, t1.id).map(k => k.nombre), ['Capítulo I', 'capítulo i 2']);
  assert.equal(d.moverACarpeta('esquema', e.esquema.id, cap.id).ok, true);
  assert.equal(d.esquema(e.esquema.id).esquema.carpetaId, cap.id);
  assert.equal(d.sub(e.sub.id).sub.carpetaId, cap.id);                                             // la biblioteca enlazada va con él
  d.moverACarpeta('sub', suelta.id, t1.id);
  assert.equal(d.cuentaCarpeta(t1.id), 3); assert.equal(d.cuentaCarpeta(cap.id), 2);
  assert.equal(d.moverACarpeta('carpeta', t1.id, cap.id).ok, false);                               // no dentro de sí misma
  assert.equal(d.plegarCarpeta(cap.id).carpeta.plegada, true); assert.equal(d.plegarCarpeta(cap.id).carpeta.plegada, undefined);
  assert.equal(d.renombrarCarpeta(cap.id, 'Episodio').ok, true);
  assert.equal(d.renombrarCarpeta(cap.id, 'EPISODIO').ok, true);                                   // la misma, en mayúsculas
  assert.equal(d.renombrarCarpeta(cap.id, 'capítulo i 2').ok, false);
  assert.equal(d.colorearCarpeta(cap.id, 'verde').carpeta.color, 'verde');
  /* soltar un esquema delante de otro lo deja en su carpeta; sobre el contenedor, en la raíz */
  const e2 = conBiblioteca(d, c.id, TABLERO, 'Esquema 2');
  d.colocarEsquema(e2.esquema.id, e.esquema.id);
  assert.equal(d.esquema(e2.esquema.id).esquema.carpetaId, cap.id);
  d.colocarEsquema(e2.esquema.id, null, c.id);
  assert.equal(d.esquema(e2.esquema.id).esquema.carpetaId, undefined);
  assert.equal(d.sub(e2.sub.id).sub.carpetaId, undefined);
});

test('carpetas: eliminar sube lo suyo un nivel; mudar una carpeta a otro contenedor se lleva todo; se guardan y se sanean', () => {
  const d = nuevo();
  const { contenedor: a } = d.crearContenedor('A', { vacio: true }), { contenedor: b } = d.crearContenedor('B', { vacio: true });
  const t = d.crearCarpeta(a.id, 'Temporada', 'azul').carpeta, k = d.crearCarpeta(a.id, 'Capítulo', 'violeta', t.id).carpeta;
  const e = conBiblioteca(d, a.id, TABLERO, 'Esquema').esquema; d.moverACarpeta('esquema', e.id, k.id);
  const s = d.crearSub(a.id, 'Notas').sub; d.moverACarpeta('sub', s.id, t.id);
  /* mudar «Temporada» a B: sus carpetas, el esquema con su biblioteca y la biblioteca suelta */
  assert.equal(d.moverACarpeta('carpeta', t.id, null, b.id).ok, true);
  assert.deepEqual(a.carpetas, []); assert.equal(b.carpetas.length, 2);
  assert.equal(d.esquema(e.id).contenedor, b); assert.equal(d.esquema(e.id).esquema.carpetaId, k.id);
  assert.equal(d.enlace(e.id).contenedor, b); assert.equal(d.sub(s.id).sub.carpetaId, t.id);
  /* eliminar «Temporada»: «Capítulo» y la biblioteca suben a la raíz, nada se pierde */
  d.eliminarCarpeta(t.id);
  assert.equal(d.carpeta(k.id).carpeta.padreId, null); assert.equal(d.sub(s.id).sub.carpetaId, undefined);
  assert.equal(d.esquema(e.id).esquema.carpetaId, k.id);
  /* en Personajes hay carpetas propias (Leo, 16-09-2026: vuelven) y ahí van los personajes */
  const v = d.crearCarpeta(C.ELENCO_CARPETAS, 'Vampiros', 'violeta');
  assert.equal(v.ok, true);
  const lestat = d.crearPersonaje('Lestat').personaje;
  assert.equal(d.moverACarpeta('personaje', lestat.id, k.id).ok, false);           // no en las de un contenedor
  assert.equal(d.moverACarpeta('personaje', lestat.id, v.carpeta.id).ok, true);
  assert.equal(d.cuentaCarpeta(v.carpeta.id), 1);
  /* guardado y saneado: padres que no existen y ciclos van a la raíz; carpetaId roto se quita */
  const x = nuevo(d.toJSON());
  assert.deepEqual(x.toJSON(), d.toJSON());
  const roto = d.toJSON(); const cb = roto.contenedores.find(y => y.id === b.id);
  cb.carpetas.push({ id: 'c1', nombre: 'Uno', color: 'azul', padreId: 'c2' }, { id: 'c2', nombre: 'Dos', color: 'azul', padreId: 'c1' }, { id: 'c3', nombre: 'Tres', padreId: 'nada' });
  cb.esquemas[0].carpetaId = 'no-existe';
  const y = nuevo(roto), cy = y.contenedor(b.id);
  assert.equal(cy.carpetas.find(z => z.id === 'c3').padreId, null);
  assert.ok(['c1', 'c2'].some(id => cy.carpetas.find(z => z.id === id).padreId === null));
  /* un `carpetaId` roto lo arregla su grupo: sus piezas viven donde el grupo (Leo, 16-09-2026) */
  const gy = y.grupoDe(cy.esquemas[0].id).grupo;
  assert.equal(cy.esquemas[0].carpetaId, gy.carpetaId); assert.equal(y.enlace(cy.esquemas[0].id).sub.carpetaId, gy.carpetaId);
});

test('árbol: carpetas, grupos y piezas sueltas se ordenan mezclados en su nivel; también personajes', () => {
  const d = nuevo();
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true }), { contenedor: c2 } = d.crearContenedor('Otro', { vacio: true });
  const e = conBiblioteca(d, c.id, TABLERO, 'Esquema'), suelta = d.crearSub(c.id, 'Lugares').sub, k = d.crearCarpeta(c.id, 'Temporada', 'azul').carpeta;
  const g = d.grupoDe(e.esquema.id).grupo;
  const nivel = (amb, kid) => d.nivelArbol(amb, kid).map(x => x.tipo + ':' + (x.obj.nombre || x.obj.titulo));
  /* sin orden guardado: carpetas, grupos y lo suelto; lo del grupo va dentro de él */
  assert.deepEqual(nivel(c.id), ['carpeta:Temporada', 'grupo:' + g.nombre, 'sub:Lugares']);
  assert.equal(d.colocarEnArbol(suelta.id, g.id).ok, true);                                        // una biblioteca encima del grupo
  assert.deepEqual(nivel(c.id), ['carpeta:Temporada', 'sub:Lugares', 'grupo:' + g.nombre]);
  assert.equal(d.colocarEnArbol(k.id, g.id, true).ok, true);                                       // la carpeta, detrás del grupo
  assert.deepEqual(nivel(c.id), ['sub:Lugares', 'grupo:' + g.nombre, 'carpeta:Temporada']);
  /* delante de algo de otra carpeta: entra en ella (y sale de su grupo, porque ahí vive lo otro) */
  const dentro = d.crearSub(c.id, 'Dentro').sub; d.moverACarpeta('sub', dentro.id, k.id);
  assert.equal(d.colocarEnArbol(e.esquema.id, dentro.id).ok, true);
  assert.deepEqual(nivel(c.id, k.id), ['esquema:Esquema', 'sub:Dentro']);
  assert.equal(d.grupoDe(e.esquema.id), null); assert.equal(d.sub(e.sub.id).sub.carpetaId, undefined);
  /* el grupo entero a una carpeta: se lleva lo suyo */
  const g3 = d.crearGrupo(c.id, [suelta.id, dentro.id], 'Bloque').grupo;
  assert.equal(d.moverACarpeta('grupo', g3.id, k.id).ok, true);
  assert.equal(d.sub(suelta.id).sub.carpetaId, k.id);
  /* y a otro contenedor, delante de lo suyo */
  const alla = d.crearSub(c2.id, 'Allá').sub;
  assert.equal(d.colocarEnArbol(e.sub.id, alla.id).ok, true);
  assert.deepEqual(nivel(c2.id), ['sub:Esquema', 'sub:Allá']);
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());                                        // se guarda
  /* personajes: se ordenan entre ellos y no se mezclan con los contenedores */
  const a = d.crearPersonaje('Lestat').personaje, b = d.crearPersonaje('Louis').personaje;
  assert.equal(d.colocarEnArbol(b.id, a.id).ok, true);
  assert.deepEqual(nivel(C.ELENCO_CARPETAS), ['personaje:Louis', 'personaje:Lestat']);
  assert.equal(d.colocarEnArbol(a.id, e.esquema.id).ok, false);                                    // un personaje no va entre esquemas
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());
});

test('notas de biblioteca con color: uno de los 24 tonos o ninguno, sin tocar la fecha, y viaja al normalizar', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo').contenedor, sub = d.subsDe(cont.id)[0];
  const n = d.crearNota(sub.id, null, 'Auvernia').nota, fecha = n.modificado;
  assert.equal(C.TONOS_NOTA.length, 24);
  assert.equal(d.colorearNota(n.id, 'cielo').ok, true);
  assert.equal(d.nota(n.id).color, 'cielo');
  assert.equal(d.nota(n.id).modificado, fecha);
  assert.equal(d.colorearNota(n.id, 'fucsia').ok, false);
  const copia = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.equal(copia.nota(n.id).color, 'cielo');
  assert.equal(d.colorearNota(n.id, null).ok, true);
  assert.equal('color' in d.nota(n.id), false);
  const otra = nuevo(Object.assign(JSON.parse(JSON.stringify(d.datos)), { notas: [Object.assign({}, d.nota(n.id), { color: 'fucsia' })] }));
  assert.equal('color' in otra.nota(n.id), false);                             // un color que no es de la paleta se descarta
});

test('el guion de un esquema: secciones fuera, orden propio y plegadas, y su documento aparte de la biblioteca', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const { esquema: e, sub } = conBiblioteca(d, cont.id, TABLERO, 'Escaleta');
  assert.deepEqual(d.guionEsquema(e.id), { fuera: [], orden: [], plegadas: [] });
  assert.equal('guion' in d.esquema(e.id).esquema, false);                    // vacío no se guarda
  d.sacarDelGuion(e.id, ['p2', 'p4', 'p2']);
  assert.deepEqual(d.guionEsquema(e.id).fuera, ['p2', 'p4']);
  d.devolverAlGuion(e.id, ['p4']);
  assert.deepEqual(d.guionEsquema(e.id).fuera, ['p2']);
  d.plegarSeccion(e.id, 'p2', true);
  d.ordenarGuion(e.id, ['p3', 'p1', 'p2']);
  assert.deepEqual(d.ordenGuion(e.id, ['p1', 'p2', 'p3', 'p5']), ['p3', 'p1', 'p2', 'p5']);   // lo nuevo detrás de su vecino
  const copia = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.deepEqual(copia.guionEsquema(e.id), { fuera: ['p2'], orden: ['p3', 'p1', 'p2'], plegadas: ['p2'] });
  d.podarGuion(e.id, ['p1', 'p3']);
  assert.deepEqual(d.guionEsquema(e.id), { fuera: [], orden: ['p3', 'p1'], plegadas: [] });

  d.crearNota(sub.id, null, 'Ideas');
  const g = d.crearGuion(e.id, 'Guion final v1', { html: '<p>Hola</p>', characters: {} }).nota;
  assert.deepEqual(g.guion, { eid: e.id, generado: g.creado, principal: true });   // el primero es el documento del esquema
  assert.deepEqual(nombres(d.guionesDe(e.id)), ['Guion final v1']);
  assert.deepEqual(nombres(d.notasDe(sub.id, null)), ['Ideas']);           // el guion no está en la biblioteca
  assert.equal(d.notasDe(sub.id).length, 1);
  const gsub = d.bibliotecaGuiones(e.id);
  assert.equal(d.esGuiones(gsub.id), true);
  assert.deepEqual(nombres(d.subsDe(d.esquema(e.id).contenedor.id)), ['Escaleta']);   // la de guiones no sale en el árbol
  const ajena = d.crearSub(d.esquema(e.id).contenedor.id, 'Otra').sub;
  assert.equal(d.moverNota(g.id, null, ajena.id).ok, false);               // un guion no sale de su esquema
  /* un esquema tiene un documento: al abrir el archivo, los demás pasan a ser versiones suyas (Leo, 16-09-2026) */
  assert.equal(d.crearGuion(e.id, 'Guion final v1', { html: '<p>Otro</p>' }).nota.titulo, 'Guion final v1 2');
  const otra = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.equal(otra.guionesDe(e.id).length, 1);
  assert.deepEqual(otra.versionesDe(g.id).map(v => v.nombre), ['Guion final v1 2']);
});

test('el documento de un esquema vive con él, en su biblioteca oculta (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const { esquema: e, sub } = conBiblioteca(d, cont.id, TABLERO, 'Escaleta');
  const lugares = d.crearEtiqueta(sub.id, 'Lugares').etiqueta;
  const doc = d.crearDocumentoEsquema(e.id, 'Escaleta', { html: '<p>x</p>' }).nota;
  const gsub = d.bibliotecaGuiones(e.id);
  assert.equal(d.esGuiones(gsub.id), true);
  assert.equal(d.documentoEsquema(e.id).id, doc.id);
  assert.deepEqual(nombres(d.subsDe(cont.id)), ['Escaleta']);                      // la de guiones no sale en el árbol
  const nota = d.crearNota(sub.id, null, 'Ideas').nota;
  assert.equal(d.moverNota(doc.id, lugares.id, sub.id).ok, false);                 // el documento no sale a la biblioteca
  assert.equal(d.moverNota(nota.id, null, gsub.id).ok, false);                     // ni entra una nota
  /* quitar el enlace con la biblioteca no toca el documento (por eso vive con el esquema) */
  assert.equal(d.quitarEnlace(e.id).ok, true);
  assert.equal(d.documentoEsquema(e.id).id, doc.id);
  /* y al eliminar el esquema se va con él a la papelera */
  d.eliminarEsquema(e.id);
  assert.equal(d.documentoEsquema(e.id), null);
  assert.equal(d.papelera().length, 1);
});

test('versiones de un documento: guardar, cargar, renombrar y eliminar (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const e = d.crearEsquema(cont.id, TABLERO, 'Escaleta').esquema;
  const doc = d.crearDocumentoEsquema(e.id, 'Escaleta', { html: '<p>Primera</p>' }).nota;
  assert.deepEqual(d.versionesDe(doc.id), []);
  const v1 = d.guardarVersion(doc.id, 'v1').version;
  assert.equal(v1.html, '<p>Primera</p>');
  d.guardarNota(doc.id, { title: 'Escaleta', html: '<p>Segunda</p>', characters: {} });
  const v2 = d.guardarVersion(doc.id, 'v1').version;                               // nombre repetido: se hace libre
  assert.equal(v2.nombre, 'v1 2');
  assert.deepEqual(d.versionesDe(doc.id).map(v => v.nombre), ['v1', 'v1 2']);
  assert.equal(d.guardarVersion(doc.id).version.nombre, 'v3');                     // sin nombre, el que toca
  /* cargar una versión deja su texto en el documento */
  assert.equal(d.cargarVersion(doc.id, v1.id).ok, true);
  assert.equal(d.nota(doc.id).html, '<p>Primera</p>');
  assert.equal(d.renombrarVersion(doc.id, v1.id, 'Borrador').ok, true);
  assert.equal(d.version(doc.id, v1.id).nombre, 'Borrador');
  /* viaja en los datos */
  const copia = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.deepEqual(copia.versionesDe(doc.id).map(v => v.nombre), ['Borrador', 'v1 2', 'v3']);
  assert.equal(copia.version(doc.id, v1.id).html, '<p>Primera</p>');
  assert.equal(d.eliminarVersion(doc.id, v1.id).ok, true);
  assert.deepEqual(d.versionesDe(doc.id).map(v => v.nombre), ['v1 2', 'v3']);
});

test('secciones de una biblioteca: agrupan segmentos y la de partida lleva la bandeja (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const sub = d.crearSub(cont.id, 'Biblioteca').sub;
  const lugares = d.crearEtiqueta(sub.id, 'Lugares').etiqueta;
  const k = d.crearSeccion(sub.id, 'Investigación').seccion;
  const k2 = d.crearSeccion(sub.id, 'Investigación').seccion;                       // nombre libre
  assert.equal(k2.nombre, 'Investigación 2');
  const fichas = d.crearEtiqueta(sub.id, 'Fichas', null, { seccionId: k.id }).etiqueta;
  assert.deepEqual(nombres(d.etiquetasDe(sub.id, null)), ['Lugares']);
  assert.deepEqual(nombres(d.etiquetasDe(sub.id, k.id)), ['Fichas']);
  assert.deepEqual(nombres(d.etiquetasDe(sub.id)), ['Lugares', 'Fichas']);          // todas
  assert.equal(d.cambiarSeccion(lugares.id, k.id).ok, true);
  assert.deepEqual(nombres(d.etiquetasDe(sub.id, k.id)), ['Lugares', 'Fichas']);
  assert.deepEqual(nombres(d.etiquetasDe(sub.id, null)), []);
  assert.equal(d.renombrarSeccion(k.id, 'Investigación 2').ok, false);              // ya hay otra así
  assert.equal(d.colocarSeccion(k2.id, k.id).ok, true);
  assert.deepEqual(nombres(d.seccionesDe(sub.id)), ['Investigación 2', 'Investigación']);
  const copia = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.deepEqual(nombres(copia.seccionesDe(sub.id)), ['Investigación 2', 'Investigación']);
  assert.deepEqual(nombres(copia.etiquetasDe(sub.id, k.id)), ['Lugares', 'Fichas']);
  d.eliminarSeccion(k.id);                                                          // sus segmentos vuelven a la de partida
  assert.deepEqual(nombres(d.etiquetasDe(sub.id, null)), ['Lugares', 'Fichas']);
  assert.deepEqual(nombres(d.seccionesDe(sub.id)), ['Investigación 2']);
});

test('la biblioteca de un personaje estrena «Hoja de personaje» una sola vez (Leo, 15-09-2026)', () => {
  const d = new C.Documentos(null);
  d.personajes(true);
  const p = d.crearPersonaje('Claudia', 5).personaje;
  const b = d.bibliotecaPersonaje(p.id, 'Claudia');
  const hojas = () => d.etiquetasDe(b.id).filter(e => e.nombre === C.HOJA_PERSONAJE);
  assert.equal(hojas().length, 1); assert.equal(hojas()[0].color, 5, 'con el color del personaje');
  d.bibliotecaPersonaje(p.id, 'Claudia');
  assert.equal(hojas().length, 1, 'no se duplica');
  d.eliminarEtiqueta(hojas()[0].id);
  d.bibliotecaPersonaje(p.id, 'Claudia');
  assert.equal(hojas().length, 0, 'borrada, no vuelve');
  const j = new C.Documentos(JSON.parse(JSON.stringify(d.toJSON())));
  j.bibliotecaPersonaje(p.id, 'Claudia');
  assert.equal(j.etiquetasDe(b.id).filter(e => e.nombre === C.HOJA_PERSONAJE).length, 0, 'tampoco al abrir el archivo');
});

test('grupos del árbol: juntan lo que sea, se anidan y se entra y se sale arrastrando (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true });
  const e = conBiblioteca(d, c.id, TABLERO, 'Esquema');                            // agrupado a mano con su biblioteca
  const g = d.grupoDe(e.esquema.id).grupo;
  assert.deepEqual(g.items, [e.esquema.id, e.sub.id]);
  const a = d.crearSub(c.id, 'Lugares').sub, b = d.crearSub(c.id, 'Tono').sub;
  const nivel = (kid) => d.nivelArbol(c.id, kid).map(x => x.tipo + ':' + (x.obj.nombre || ''));
  assert.deepEqual(nivel(), ['grupo:' + g.nombre, 'sub:Lugares', 'sub:Tono']);      // lo del grupo no sale suelto
  assert.deepEqual(d.nivelGrupo(g.id).map(x => x.tipo), ['esquema', 'sub']);
  /* entrar: soltarla junto a una pieza del grupo (va a donde vive esa pieza) */
  assert.equal(d.colocarEnArbol(a.id, e.esquema.id, true).ok, true);
  assert.equal(d.grupoDe(a.id).grupo.id, g.id);
  assert.equal(d.nivelGrupo(g.id).length, 3);
  /* salir: soltarla junto a algo que está fuera */
  assert.equal(d.colocarEnArbol(a.id, b.id).ok, true);
  assert.equal(d.grupoDe(a.id), null);
  /* grupos dentro de grupos (Leo): el de dentro se arrastra como una pieza más */
  const g2 = d.crearGrupo(c.id, [a.id, b.id], 'Bloque').grupo;
  assert.equal(d.colocarEnArbol(g2.id, e.esquema.id).ok, true);                     // el grupo entero, dentro del otro
  assert.equal(d.grupo(g2.id).grupo.padreId, g.id);
  assert.deepEqual(d.nivelGrupo(g.id).map(x => x.tipo).sort(), ['esquema', 'grupo', 'sub']);
  assert.deepEqual(nivel(), ['grupo:' + g.nombre]);                                 // arriba solo queda el grupo de fuera
  assert.equal(d.colocarEnArbol(g.id, g2.id).ok, false, 'un grupo no entra en uno suyo');
  assert.equal(nuevo(d.toJSON()).grupo(g2.id).grupo.padreId, g.id);                 // viaja en los datos
  /* sacar el grupo de dentro y deshacerlo: lo suyo sube */
  assert.equal(d.sacarDeGrupo(g2.id).ok, true); assert.equal(d.grupo(g2.id).grupo.padreId, null);
  assert.equal(d.deshacerGrupo(g2.id).ok, true); assert.equal(d.grupo(g2.id), null);
  assert.equal(d.grupoDe(a.id), null);
  /* renombrar y colorear */
  assert.equal(d.renombrarGrupo(g.id, 'Bloque I').ok, true);
  assert.equal(d.colorearGrupo(g.id, 'verde').ok, true); assert.equal(d.grupo(g.id).grupo.color, 'verde');
  /* un grupo de uno vale, y **uno vacío también** (Leo, 16-09-2026: «quiero poder crear grupos vacíos») */
  assert.equal(d.quitarEnlace(e.sub.id).ok, true);
  assert.equal(d.grupoDe(e.esquema.id).grupo.id, g.id); assert.equal(d.gruposDe(c.id).length, 1);
  assert.equal(d.crearGrupo(c.id, [e.sub.id], 'Solo').ok, true, 'un grupo con un solo elemento');
  assert.equal(d.nivelGrupo(d.grupoDe(e.sub.id).grupo.id).length, 1);
  assert.equal(nuevo(d.toJSON()).grupoDe(e.sub.id).grupo.nombre, 'Solo', 'y sigue ahí al volver a abrir el archivo');
  assert.equal(d.quitarEnlace(e.esquema.id).ok, true);
  assert.equal(d.grupo(g.id).grupo.items.length, 0, 'vacío, el grupo se queda');
  assert.equal(nuevo(d.toJSON()).grupo(g.id).grupo.nombre, 'Bloque I', 'y sobrevive al archivo');
  assert.equal(d.deshacerGrupo(g.id).ok, true); assert.equal(d.grupo(g.id), null, 'solo «Deshacer el grupo» lo quita');
  /* uno creado de cero, sin nada dentro, listo para llenarlo */
  const vacio = d.crearGrupo(c.id, [], 'En blanco', 'verde');
  assert.equal(vacio.ok, true); assert.equal(vacio.grupo.items.length, 0);
  assert.equal(d.aGrupo(vacio.grupo.id, e.esquema.id).ok, true);
  assert.deepEqual(d.nivelGrupo(vacio.grupo.id).map(x => x.obj.nombre), ['Esquema']);
});

test('un doble espacio suelta al personaje: «MARA  (V.O.)» y «MARA  CONT\u2019D» son MARA (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const c = d.crearContenedor('Capítulo').contenedor, sub = c.subs[0].id;
  const n = d.crearNota(sub, null, 'Escena').nota;
  const html = '<p class="sp-character">MARA</p><p class="sp-character">MARA\u00a0 (V.O.)</p><p class="sp-character">MARA  CONT\u2019D</p>';
  d.guardarNota(n.id, { title: 'Escena', html, characters: { mara: { name: 'MARA', color: 0 } } });
  assert.deepEqual(d.elenco().map(p => p.nombre), ['MARA']);                       // uno solo, no tres
  const mara = d.elenco()[0];
  assert.equal(d.menciones(mara.id).length, 1);
  assert.equal(d.renombrarPersonaje(mara.id, 'Marina').ok, true);
  const h = d.nota(n.id).html;
  assert.match(h, />Marina<\/p>/);
  assert.match(h, />Marina\u00a0 \(V\.O\.\)<\/p>/, 'la anotación se queda tal cual');
  assert.match(h, />Marina {2}CONT\u2019D<\/p>/);
});

test('grupos y carpetas en Personajes (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const a = d.crearPersonaje('Lestat').personaje, b = d.crearPersonaje('Louis').personaje, e = d.crearPersonaje('Claudia').personaje;
  const g = d.crearGrupo(C.ELENCO_CARPETAS, [a.id, b.id], 'Vampiros', 'rojo').grupo;
  assert.equal(d.grupoDe(a.id).grupo.id, g.id);
  const nivel = () => d.nivelArbol(C.ELENCO_CARPETAS, null).map(x => x.tipo + ':' + (x.obj.nombre || ''));
  assert.deepEqual(nivel(), ['grupo:Vampiros', 'personaje:Claudia']);
  assert.equal(d.colocarEnArbol(e.id, a.id, true).ok, true); assert.equal(d.grupoDe(e.id).grupo.id, g.id);
  assert.deepEqual(d.nivelGrupo(g.id).map(x => x.obj.nombre), ['Lestat', 'Claudia', 'Louis']);
  const k = d.crearCarpeta(C.ELENCO_CARPETAS, 'Mortales', 'azul').carpeta;          // y carpetas propias (Leo, 16-09-2026)
  const copia = nuevo(d.toJSON());
  assert.equal(copia.grupoDe(e.id).grupo.nombre, 'Vampiros');                       // viaja en los datos
  assert.deepEqual(copia.datos.carpetasElenco.map(x => x.nombre), ['Mortales']);
  assert.equal(copia.moverACarpeta('personaje', b.id, k.id).ok, true);              // un personaje del grupo se lleva al grupo entero
  assert.deepEqual(copia.nivelArbol(C.ELENCO_CARPETAS, k.id).map(x => x.tipo), ['grupo']);
});

test('color propio en la etiqueta de un esquema o una biblioteca (Leo, 16-09-2026)', () => {
  const d = nuevo();
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true });
  const e = conBiblioteca(d, c.id, TABLERO, 'Esquema');
  assert.equal(e.esquema.color, undefined);                                        // sin color: el de siempre
  assert.equal(d.colorearHijo(e.esquema.id, 3).ok, true); assert.equal(d.esquema(e.esquema.id).esquema.color, 3);
  assert.equal(d.colorearHijo(e.sub.id, 99).ok, true); assert.equal(d.sub(e.sub.id).sub.color, 0);   // fuera de la paleta: el primero
  assert.equal(nuevo(d.toJSON()).esquema(e.esquema.id).esquema.color, 3);
  assert.equal(d.colorearHijo(e.esquema.id, null).ok, true); assert.equal(d.esquema(e.esquema.id).esquema.color, undefined);
});

test('los esquemas donde el personaje tiene carril (Leo, 16-09-2026: «Esquemas relacionados»)', () => {
  const d = nuevo();
  const le = d.crearPersonaje('Lestat').personaje, lo = d.crearPersonaje('Louis').personaje;
  const claudia = d.crearPersonaje('Claudia').personaje;
  const carriles = (...ps) => ({ actos: TABLERO.actos, puntos: [], saltos: [], notas: [],
    lineas: ps.map((p, i) => ({ id: 'l' + (i + 1), tipo: i ? 'secundaria' : 'principal', nombre: p.nombre, personaje: p.id })) });
  const suyo = d.crearEsquemaPersonaje(carriles(le, lo), 'Lestat').esquema;             // el de Lestat: Louis también sale
  const deLouis = d.crearEsquemaPersonaje(carriles(lo), 'Louis').esquema;
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true });
  const normal = d.crearEsquema(c.id, carriles(lo), 'Roadmap').esquema;                 // y un esquema normal con su carril

  const deLo = d.esquemasDePersonaje(lo.id);
  assert.deepEqual(deLo.map(x => x.nombre), ['Louis', 'Lestat', 'Roadmap']);            // delante el suyo, al final los normales
  assert.deepEqual(deLo.map(x => x.eid), [deLouis.id, suyo.id, normal.id]);
  assert.deepEqual(deLo.map(x => x.personaje), [true, true, false]);                    // cuál es un esquema de personaje
  assert.deepEqual(deLo.map(x => x.principal), [true, false, false]);                   // «el suyo»: su primer carril
  assert.equal(deLo[2].contenedor, 'Capítulo');

  assert.deepEqual(d.esquemasDePersonaje(le.id).map(x => x.nombre), ['Lestat']);
  assert.deepEqual(d.esquemasDePersonaje(claudia.id), []);                              // sin carril en ninguno
  assert.deepEqual(d.esquemasDePersonaje(''), []);
  /* deja de salir en cuanto pierde el carril */
  const m = d.esquema(normal.id).esquema;
  m.datos.lineas = m.datos.lineas.filter(l => l.personaje !== lo.id);
  d.guardarEsquema(normal.id, m.datos);
  assert.deepEqual(d.esquemasDePersonaje(lo.id).map(x => x.nombre), ['Louis', 'Lestat']);
});
