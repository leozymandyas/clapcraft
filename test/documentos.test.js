/* Pruebas del gestor de documentos de Claquedraw (contenedores, subcontenedores, esquemas, etiquetas,
   notas y papelera): reglas que no dependen del DOM. Se ejecutan con `npm test` (Node 18 o superior). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');

function nuevo(datos) {
  let t = 1000, n = 0;
  return new C.Documentos(datos, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
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
  assert.deepEqual(nombres(d.subsDe(r.contenedor.id)), ['Esquema de pasos']);   // el «Capítulo» nuevo trae solo el esquema y su biblioteca enlazada
  assert.equal(d.enlace(r.esquema.id).sub.nombre, 'Esquema de pasos');
  assert.equal(!!d.enlace(r.esquema.id).sub.segmentosPrimero, false);                            // la cronología arriba por defecto
  assert.equal(d.ordenarSecciones(d.enlace(r.esquema.id).sub.id, false).ok, true); assert.equal(nuevo(d.toJSON()).enlace(r.esquema.id).sub.segmentosPrimero, true);
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
  const r = d.crearEsquema('x1', TABLERO, 'Flashbacks');
  assert.equal(r.sub.nombre, 'Flashbacks'); assert.equal(r.esquema.subId, r.sub.id);
  assert.deepEqual(nombres(d.subsDe('x1')), ['Biblioteca', 'Flashbacks']);
  assert.equal(d.enlace(r.esquema.id).sub, r.sub); assert.equal(d.enlace(r.sub.id).esquema, r.esquema); assert.equal(d.enlace('x2'), null);
  assert.equal(d.crearEsquema('x1', TABLERO, 'Biblioteca').sub.nombre, 'Biblioteca 2');   // choca con otro subcontenedor: nombre libre
  assert.equal(d.renombrarSub(r.sub.id, 'Fichas').ok, true); assert.equal(r.esquema.nombre, 'Flashbacks');
  assert.equal(d.renombrarEsquema(r.esquema.id, 'Pasos').ok, true); assert.equal(r.sub.nombre, 'Fichas');
  /* mover el esquema se lleva su documentos, y al revés */
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x3').ok, true);
  assert.equal(d.enlace(r.sub.id).contenedor.id, 'x3'); assert.deepEqual(nombres(d.subsDe('x3')), ['Biblioteca', 'Fichas']);
  assert.equal(d.colocarSub(r.sub.id, null, 'x1').ok, true);
  assert.deepEqual(nombres(d.esquemasDe('x1')), ['Biblioteca', 'Pasos']); assert.equal(d.esquemasDe('x3').length, 0);
  assert.equal(nuevo(d.toJSON()).enlace(r.esquema.id).sub.id, r.sub.id);                   // viaja en los datos
  /* un enlace roto o repetido se descarta al cargar */
  const j = d.toJSON(); j.contenedores[0].esquemas[0].subId = r.sub.id;
  assert.equal(nuevo(j).esquemasDe('x1').filter(e => e.subId === r.sub.id).length, 1);
  /* quitar el enlace: los dos se quedan, sueltos */
  assert.equal(d.quitarEnlace(r.sub.id).ok, true); assert.equal(d.enlace(r.esquema.id), null); assert.equal(d.quitarEnlace(r.esquema.id).ok, false);
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x3').ok, true); assert.equal(d.sub(r.sub.id).contenedor.id, 'x1');
  /* enlazar a mano: uno con uno y dentro del mismo contenedor */
  const suelto = d.crearSub('x1', 'Notas').sub;
  assert.equal(d.enlazar(r.esquema.id, suelto.id).ok, false);                              // el esquema está en x3, los documentos en x1
  assert.equal(d.colocarEsquema(r.esquema.id, null, 'x1').ok, true);
  assert.equal(d.enlazar(r.esquema.id, suelto.id).ok, true); assert.equal(d.enlace(suelto.id).esquema, r.esquema);
  assert.equal(d.enlazar(r.esquema.id, r.sub.id).ok, false);                               // ya tiene enlace
  const otro = d.crearEsquema('x1', TABLERO, 'Otro esquema').esquema;
  assert.equal(d.enlazar(otro.id, suelto.id).ok, false);                                   // esos documentos ya tienen esquema
  /* eliminar el documentos enlazado deja el esquema suelto */
  const r2 = d.crearEsquema('x3', TABLERO, 'Otro');
  assert.equal(d.eliminarSub(r2.sub.id).ok, true); assert.equal(d.esquema(r2.esquema.id).esquema.subId, null);
});

test('personajes: contenedor oculto con un tablero y una biblioteca por personaje', () => {
  const d = nuevo(); d.crearContenedor('Capítulo');
  assert.equal(d.personajes(), null);                                                   // no existe hasta que se crea
  const p = d.personajes(true);
  assert.equal(p.oculto, true); assert.equal(d.personajes(true), p);                     // una sola vez
  const le = d.crearPersonaje('Lestat').personaje, lo = d.crearPersonaje('Louis').personaje;
  assert.equal(d.esquemaPersonaje(le.id), null);                                         // sin tablero de partida no lo crea
  const t = { actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal', nombre: 'Sin personaje' }, { id: 'l2', tipo: 'secundaria', nombre: 'Lestat', personaje: le.id }], puntos: [], saltos: [], notas: [] };
  const e = d.esquemaPersonaje(le.id, t);
  assert.equal(e.id, 'personajes:esquema:' + le.id); assert.deepEqual([e.datos.lineas[0].personaje, e.datos.lineas[0].nombre], [le.id, 'Lestat']);   // el principal es el personaje
  assert.equal(e.datos.lineas[1].personaje, undefined);                                   // y no se repite en otro carril
  assert.equal(d.esquemaPersonaje(le.id, t), e); assert.notEqual(d.esquemaPersonaje(lo.id, t), e);   // uno por personaje
  e.datos.lineas[0].nombre = 'Otro'; assert.equal(d.esquemaPersonaje(le.id).datos.lineas[0].nombre, 'Lestat');   // el principal no se cambia
  e.datos.lineas[1].personaje = lo.id; d.renombrarPersonaje(le.id, 'Lestat de L.');
  assert.equal(e.nombre, 'Lestat de L.'); assert.equal(e.datos.lineas[0].nombre, 'Lestat de L.');
  assert.equal(d.eliminarPersonaje(lo.id).ok, true); assert.equal(e.datos.lineas[1].personaje, undefined);
  assert.equal(p.esquemas.some(x => x.id === 'personajes:esquema:' + lo.id), false);         // su tablero se va con él
  assert.equal(d.contenedores({}).total, 1); assert.deepEqual(nombres(d.contenedores({}).sueltos), ['Capítulo']);   // no sale en el árbol
  const b = d.bibliotecaPersonaje('l1', 'Lestat');
  assert.equal(b.nombre, 'Lestat'); assert.equal(d.bibliotecaPersonaje('l1', 'Lestat de Lioncourt'), b); assert.equal(b.nombre, 'Lestat de Lioncourt');
  d.crearNota(b.id, null, 'Voz del narrador');
  const j = nuevo(d.toJSON());
  assert.equal(j.contenedor('personajes').oculto, true); assert.equal(j.bibliotecaPersonaje('l1').id, b.id); assert.equal(j.notasDe(b.id).length, 1);
  const k = nuevo(); k.personajes(true);
  assert.equal(k.migrarEsquema(TABLERO).contenedor.nombre, C.NOMBRE_GLOBAL);             // la migración no usa el oculto
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
  const pj = d.esquemaPersonaje(ana.id, { actos: TABLERO.actos, lineas: [{ id: 'l1', tipo: 'principal' }, { id: 'l2', tipo: 'secundaria', personaje: lu.id, nombre: 'Lucía' }], puntos: [], saltos: [], notas: [] });
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
  const e = d.crearEsquema(c.id, TABLERO, 'Esquema 1');
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
  const e2 = d.crearEsquema(c.id, TABLERO, 'Esquema 2').esquema;
  d.colocarEsquema(e2.id, e.esquema.id);
  assert.equal(d.esquema(e2.id).esquema.carpetaId, cap.id);
  d.colocarEsquema(e2.id, null, c.id);
  assert.equal(d.esquema(e2.id).esquema.carpetaId, undefined);
  assert.equal(d.sub(e2.subId).sub.carpetaId, undefined);
});

test('carpetas: eliminar sube lo suyo un nivel; mudar una carpeta a otro contenedor se lleva todo; se guardan y se sanean', () => {
  const d = nuevo();
  const { contenedor: a } = d.crearContenedor('A', { vacio: true }), { contenedor: b } = d.crearContenedor('B', { vacio: true });
  const t = d.crearCarpeta(a.id, 'Temporada', 'azul').carpeta, k = d.crearCarpeta(a.id, 'Capítulo', 'violeta', t.id).carpeta;
  const e = d.crearEsquema(a.id, TABLERO, 'Esquema').esquema; d.moverACarpeta('esquema', e.id, k.id);
  const s = d.crearSub(a.id, 'Notas').sub; d.moverACarpeta('sub', s.id, t.id);
  /* mudar «Temporada» a B: sus carpetas, el esquema con su biblioteca y la biblioteca suelta */
  assert.equal(d.moverACarpeta('carpeta', t.id, null, b.id).ok, true);
  assert.deepEqual(a.carpetas, []); assert.equal(b.carpetas.length, 2);
  assert.equal(d.esquema(e.id).contenedor, b); assert.equal(d.esquema(e.id).esquema.carpetaId, k.id);
  assert.equal(d.sub(e.subId).contenedor, b); assert.equal(d.sub(s.id).sub.carpetaId, t.id);
  /* eliminar «Temporada»: «Capítulo» y la biblioteca suben a la raíz, nada se pierde */
  d.eliminarCarpeta(t.id);
  assert.equal(d.carpeta(k.id).carpeta.padreId, null); assert.equal(d.sub(s.id).sub.carpetaId, undefined);
  assert.equal(d.esquema(e.id).esquema.carpetaId, k.id);
  /* personajes */
  const vamp = d.crearCarpeta(C.ELENCO_CARPETAS, 'Vampiros', 'violeta').carpeta;
  const lestat = d.crearPersonaje('Lestat').personaje;
  assert.equal(d.moverACarpeta('personaje', lestat.id, vamp.id).ok, true);
  assert.equal(d.cuentaCarpeta(vamp.id), 1);
  assert.equal(d.moverACarpeta('esquema', e.id, vamp.id).ok, false);
  /* guardado y saneado: padres que no existen y ciclos van a la raíz; carpetaId roto se quita */
  const x = nuevo(d.toJSON());
  assert.deepEqual(x.toJSON(), d.toJSON());
  const roto = d.toJSON(); const cb = roto.contenedores.find(y => y.id === b.id);
  cb.carpetas.push({ id: 'c1', nombre: 'Uno', color: 'azul', padreId: 'c2' }, { id: 'c2', nombre: 'Dos', color: 'azul', padreId: 'c1' }, { id: 'c3', nombre: 'Tres', padreId: 'nada' });
  cb.esquemas[0].carpetaId = 'no-existe';
  const y = nuevo(roto), cy = y.contenedor(b.id);
  assert.equal(cy.carpetas.find(z => z.id === 'c3').padreId, null);
  assert.ok(['c1', 'c2'].some(id => cy.carpetas.find(z => z.id === id).padreId === null));
  assert.equal(cy.esquemas[0].carpetaId, undefined); assert.equal(y.sub(cy.esquemas[0].subId).sub.carpetaId, undefined);
});

test('árbol: carpetas, esquemas (con su biblioteca) y bibliotecas sueltas se ordenan mezclados en su nivel; también personajes', () => {
  const d = nuevo();
  const { contenedor: c } = d.crearContenedor('Capítulo', { vacio: true }), { contenedor: c2 } = d.crearContenedor('Otro', { vacio: true });
  const e = d.crearEsquema(c.id, TABLERO, 'Esquema'), suelta = d.crearSub(c.id, 'Lugares').sub, k = d.crearCarpeta(c.id, 'Temporada', 'azul').carpeta;
  const nivel = (amb, kid) => d.nivelArbol(amb, kid).map(x => x.tipo + ':' + (x.obj.nombre || x.obj.titulo));
  assert.deepEqual(nivel(c.id), ['carpeta:Temporada', 'esquema:Esquema', 'sub:Lugares']);          // sin orden guardado: carpetas, esquemas, sueltas
  assert.equal(d.colocarEnArbol(suelta.id, e.esquema.id).ok, true);                                 // una biblioteca encima de la pareja
  assert.deepEqual(nivel(c.id), ['carpeta:Temporada', 'sub:Lugares', 'esquema:Esquema']);
  assert.equal(d.colocarEnArbol(k.id, e.sub.id, true).ok, true);                                    // la biblioteca enlazada cuenta como su esquema
  assert.deepEqual(nivel(c.id), ['sub:Lugares', 'esquema:Esquema', 'carpeta:Temporada']);
  /* delante de algo de otra carpeta: entra en ella; la pareja nunca se separa */
  const dentro = d.crearSub(c.id, 'Dentro').sub; d.moverACarpeta('sub', dentro.id, k.id);
  assert.equal(d.colocarEnArbol(e.esquema.id, dentro.id).ok, true);
  assert.deepEqual(nivel(c.id, k.id), ['esquema:Esquema', 'sub:Dentro']);
  assert.equal(d.sub(e.sub.id).sub.carpetaId, k.id);
  /* y a otro contenedor, delante de lo suyo */
  const alla = d.crearSub(c2.id, 'Allá').sub;
  assert.equal(d.colocarEnArbol(suelta.id, alla.id).ok, true);
  assert.deepEqual(nivel(c2.id), ['sub:Lugares', 'sub:Allá']);
  assert.deepEqual(nuevo(d.toJSON()).toJSON(), d.toJSON());                                         // se guarda
  /* personajes y sus carpetas */
  const a = d.crearPersonaje('Lestat').personaje, b = d.crearPersonaje('Louis').personaje, v = d.crearCarpeta(C.ELENCO_CARPETAS, 'Vampiros', 'rojo').carpeta;
  assert.equal(d.colocarEnArbol(b.id, a.id).ok, true);
  assert.equal(d.colocarEnArbol(v.id, a.id, true).ok, true);
  assert.deepEqual(nivel(C.ELENCO_CARPETAS), ['personaje:Louis', 'personaje:Lestat', 'carpeta:Vampiros']);
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

test('revisar guión: secciones fuera, orden propio y plegadas por esquema; guiones generados aparte de la bandeja', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const e = d.crearEsquema(cont.id, TABLERO, 'Escaleta').esquema, sub = d.enlace(e.id).sub;
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
  const g = d.crearGuion(sub.id, e.id, 'Guion final v1', { html: '<p>Hola</p>', characters: {} }).nota;
  assert.deepEqual(g.guion, { eid: e.id, generado: g.creado });
  assert.deepEqual(nombres(d.guionesDe(sub.id)), ['Guion final v1']);
  assert.deepEqual(nombres(d.notasDe(sub.id, null)), ['Ideas']);           // no está en la bandeja
  assert.equal(d.notasDe(sub.id).length, 2);
  const ajena = d.crearSub(d.enlace(e.id).contenedor.id, 'Otra').sub;
  assert.equal(d.moverNota(g.id, null, ajena.id).ok, false);               // no sale de su biblioteca
  assert.equal(d.crearGuion(sub.id, e.id, 'Guion final v1', { html: '' }).nota.titulo, 'Guion final v1 2');
  const otra = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.equal(otra.guionesDe(sub.id).length, 2);
});

test('sección «Guiones generados»: segmentos negros con su bandeja y su orden; cada documento en su sección', () => {
  const d = nuevo();
  const cont = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  const e = d.crearEsquema(cont.id, TABLERO, 'Escaleta').esquema, sub = d.enlace(e.id).sub;
  const lugares = d.crearEtiqueta(sub.id, 'Lugares').etiqueta;
  const versiones = d.crearEtiqueta(sub.id, 'Versiones', null, { guiones: true }).etiqueta;
  assert.equal(versiones.guiones, true);
  assert.deepEqual(nombres(d.etiquetasDe(sub.id)), ['Lugares']);                    // los de guiones no son segmentos normales
  assert.deepEqual(nombres(d.guionesSegmentosDe(sub.id)), ['Versiones']);
  const g = d.crearGuion(sub.id, e.id, 'Guion final v1', { html: '<p>x</p>' }).nota;
  const nota = d.crearNota(sub.id, null, 'Ideas').nota;
  assert.deepEqual(nombres(d.notasDe(sub.id, C.SEGMENTO_GUIONES)), ['Guion final v1']);   // cae en la bandeja de guiones
  assert.equal(d.moverNota(g.id, versiones.id, sub.id).ok, true);
  assert.deepEqual(nombres(d.notasDe(sub.id, versiones.id)), ['Guion final v1']);
  assert.equal(d.notasDe(sub.id, C.SEGMENTO_GUIONES).length, 0);
  assert.equal(d.moverNota(g.id, lugares.id, sub.id).ok, false);                    // no a un segmento normal
  assert.equal(d.moverNota(nota.id, versiones.id, sub.id).ok, false);               // una nota no entra en guiones
  assert.equal(d.moverNota(g.id, null, sub.id).ok, true);                           // de vuelta a la bandeja de guiones
  assert.deepEqual(nombres(d.notasDe(sub.id, C.SEGMENTO_GUIONES)), ['Guion final v1']);
  assert.deepEqual(nombres(d.notasDe(sub.id, null)), ['Ideas']);
  const hecho = d.crearNota(sub.id, versiones.id, 'Guion a mano').nota;               // «＋ documento» en un segmento de guiones
  assert.deepEqual(hecho.guion, { eid: null, generado: 0 });
  d.colocarSegmentoGuiones(sub.id, 'etq:' + versiones.id, 'bandeja', ['bandeja', 'etq:' + versiones.id]);
  assert.deepEqual(d.ordenGuiones(sub.id, ['bandeja', 'etq:' + versiones.id]), ['etq:' + versiones.id, 'bandeja']);
  const copia = nuevo(JSON.parse(JSON.stringify(d.datos)));
  assert.deepEqual(nombres(copia.guionesSegmentosDe(sub.id)), ['Versiones']);
  assert.deepEqual(copia.nota(hecho.id).guion, { eid: null, generado: 0 });
  assert.deepEqual(copia.ordenGuiones(sub.id, ['bandeja', 'etq:' + versiones.id]), ['etq:' + versiones.id, 'bandeja']);
  d.eliminarEtiqueta(versiones.id);                                                 // sus documentos vuelven a la bandeja de guiones
  assert.deepEqual(nombres(d.notasDe(sub.id, C.SEGMENTO_GUIONES)).sort(), ['Guion a mano', 'Guion final v1']);
});
