/* Pruebas del modelo de Tramas: los criterios de aceptación de spec-tramas.md (apartado 10)
   que no dependen del DOM. Se ejecutan con `node --test test/` (Node 18 o superior). */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');

/* Tablero mínimo: principal (l1), secundaria (l2), alternativa (l3); un acto de 60 celdas para que
   celda local = celda global. */
function base() {
  return new T.Modelo({
    actos: [{ id: 'a1', nombre: 'Acto I', celdas: 60, fondo: null }],
    lineas: [
      { id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul' },
      { id: 'l2', nombre: 'Romance', tipo: 'secundaria', color: 'violeta' },
      { id: 'l3', nombre: 'Alterna', tipo: 'alterna', color: 'ambar' }
    ],
    puntos: [], saltos: [], notas: []
  });
}
/* como base(), pero con un acto de 20 celdas: base() ya está en el máximo y no admite columnas nuevas */
const corto = () => { const m = base(); m.acto('a1').celdas = 20; return m; };
const P = (m, id, lineaId, celda, extra) => m.datos.puntos.push(Object.assign(
  { id, lineaId, actoId: 'a1', celda, titulo: id, descripcion: '', color: null, cortado: false }, extra));
const S = (m, id, deId, aId, tipo) => m.datos.saltos.push({ id, deId, aId, tipo: tipo || 'cuadro' });

/* Principal sale en 18 hacia Romance y vuelve en 30. */
function conIdaYVuelta() {
  const m = base();
  P(m, 'p5', 'l1', 5); P(m, 'q1', 'l1', 18); P(m, 'p24', 'l1', 24); P(m, 'q2', 'l1', 30); P(m, 'p40', 'l1', 40);
  P(m, 'r6', 'l2', 6); P(m, 'q3', 'l2', 18); P(m, 'r22', 'l2', 22); P(m, 'q4', 'l2', 30); P(m, 'r41', 'l2', 41);
  S(m, 's1', 'q1', 'q3'); S(m, 's2', 'q4', 'q2');
  return m;
}

/* ---------- presencia en escena ---------- */
test('1. principal: los nodos entre la salida y la vuelta quedan fuera de escena', () => {
  const m = conIdaYVuelta(), pres = m.presencia();
  assert.equal(pres.fuera(m.punto('p24')), true);
  assert.equal(pres.fuera(m.punto('p5')), false);
  assert.equal(pres.fuera(m.punto('p40')), false);
});

test('2. secundaria: fuera antes de la entrada y después de la salida', () => {
  const m = conIdaYVuelta(), pres = m.presencia();
  assert.equal(pres.fuera(m.punto('r6')), true);
  assert.equal(pres.fuera(m.punto('r22')), false);
  assert.equal(pres.fuera(m.punto('r41')), true);
  assert.equal(pres.tramoFuera('l2', 18, 22), false);
  assert.equal(pres.tramoFuera('l2', 6, 18), true);
});

test('3. secundaria sin saltos: ningún nodo se apaga', () => {
  const m = base();
  P(m, 'x1', 'l2', 3); P(m, 'x2', 'l2', 40);
  const pres = m.presencia();
  assert.equal(pres.lineaEnFlujo('l2'), false);
  assert.equal(pres.fuera(m.punto('x1')), false);
  assert.equal(pres.tramoFuera('l2', 3, 40), false);
});

test('4. secundaria con salida antes que su entrada: la salida se ve apagada', () => {
  const m = base();
  P(m, 'a', 'l1', 10); P(m, 'b', 'l2', 10);     // salida de Romance en 10
  P(m, 'c', 'l1', 20); P(m, 'd', 'l2', 20);     // entrada a Romance en 20
  S(m, 's1', 'b', 'a'); S(m, 's2', 'c', 'd');
  const pres = m.presencia();
  assert.equal(pres.fuera(m.punto('b')), true);
  assert.equal(pres.fuera(m.punto('d')), false);
});

test('5. los extremos de un salto nunca se apagan por ese mismo salto', () => {
  const m = conIdaYVuelta(), pres = m.presencia();
  ['q1', 'q2', 'q3', 'q4'].forEach(id => assert.equal(pres.fuera(m.punto(id)), false, id));
});

/* ---------- saltos ---------- */
test('6. un cuadro no llega a una trama alternativa; un rombo sí', () => {
  const m = conIdaYVuelta();
  const r = m.moverPunto('q3', { actoId: 'a1', celda: 18, lineaId: 'l3' });
  assert.equal(r.ok, false);
  assert.equal(m.punto('q3').lineaId, 'l2');
  m.datos.saltos[0].tipo = 'rombo';
  assert.equal(m.moverPunto('q3', { actoId: 'a1', celda: 18, lineaId: 'l3' }).ok, true);
  assert.equal(m.punto('q3').lineaId, 'l3');
  // tampoco al crearlo
  P(m, 'z', 'l1', 50);
  assert.equal(m.crearSalto('z', 'l3', 'cuadro').ok, false);
  assert.equal(m.crearSalto('z', 'l3').ok, true);
  assert.equal(m.saltoDe('z').tipo, 'rombo');
});

test('7. convertir una trama a alternativa transforma sus cuadros en rombos sin perder saltos', () => {
  const m = conIdaYVuelta();
  const r = m.fijarTipo('l2', 'alterna');
  assert.equal(r.ok, true);
  assert.equal(m.datos.saltos.length, 2);
  assert.ok(m.datos.saltos.every(s => s.tipo === 'rombo'));
  assert.equal(m.convertirSalto('s1', 'cuadro').ok, false);
});

test('8. eliminar un salto quita sus dos nodos y las notas que los usaban', () => {
  const m = conIdaYVuelta();
  m.datos.notas.push({ id: 'n1', deId: 'q1', aId: 'p24', texto: 'x' });
  assert.equal(m.borrarSalto('s1').ok, true);
  assert.equal(m.punto('q1'), undefined);
  assert.equal(m.punto('q3'), undefined);
  assert.equal(m.datos.notas.length, 0);
  assert.equal(m.datos.saltos.length, 1);
  // y borrar un extremo se lleva a su pareja y al salto
  assert.equal(m.borrarPunto('q4').ok, true);
  assert.equal(m.punto('q2'), undefined);
  assert.equal(m.datos.saltos.length, 0);
});

test('9. mover cualquiera de los dos extremos deja a ambos en la misma celda', () => {
  const m = conIdaYVuelta();
  m.moverPunto('q3', { actoId: 'a1', celda: 20 });
  assert.equal(m.punto('q1').celda, 20);
  m.moverSalto('s1', 'a1', 15);
  assert.equal(m.punto('q1').celda, 15);
  assert.equal(m.punto('q3').celda, 15);
});

test('10. un nodo que ya es extremo de un salto no admite un segundo', () => {
  const m = conIdaYVuelta();
  assert.equal(m.crearSalto('q1', 'l3').ok, false);
  P(m, 'w', 'l1', 30);                                  // otro nodo en la celda del destino ocupado
  assert.equal(m.crearSalto('w', 'l2').ok, false);      // el destino (q4 en 30) ya es extremo
});

test('12. extremos de salto no se descartan; un descartado deja de estarlo al ser extremo', () => {
  const m = conIdaYVuelta();
  assert.equal(m.descartarPunto('q1').ok, false);
  P(m, 'k', 'l1', 45, { cortado: true });
  m.crearSalto('k', 'l2');
  assert.equal(m.punto('k').cortado, false);
});

/* ---------- notas ---------- */
test('11. crear un nodo dentro del tramo de una nota la reancla al primer medio tramo', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: 'lento' });
  const r = m.nuevoPunto('l1', 'a1', 8);
  assert.equal(m.nota('n1').deId, 'a');
  assert.equal(m.nota('n1').aId, r.punto.id);
});

test('12b. crear un nodo fuera de ese tramo no toca la nota', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: 'lento' });
  m.nuevoPunto('l1', 'a1', 20); m.nuevoPunto('l2', 'a1', 8);
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId], ['a', 'b']);
});

test('13. en un tramo caben varias notas apiladas (Leo, 16-09-2026)', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12); P(m, 'c', 'l1', 20);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: '1' }, { id: 'n2', deId: 'b', aId: 'c', texto: '2' });
  assert.equal(m.moverNota('n1', 'b', 'c').ok, true);              // el tramo ya tiene otra: se apila
  assert.deepEqual(m.notasDe('b', 'c').map(n => n.id), ['n1', 'n2']);
  assert.equal(m.crearNota('b', 'c', 'tercera').ok, true);
  assert.equal(m.notasDe('b', 'c').length, 3);
  // y también entre tramas
  P(m, 'x', 'l2', 1); P(m, 'y', 'l2', 9);
  assert.equal(m.moverNota('n1', 'x', 'y').ok, true);
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId], ['x', 'y']);
});

test('notas de un nodo: varias, y se van con él (Leo, 16-09-2026)', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12);
  assert.equal(m.crearNota('a', null, 'una').ok, true);
  assert.equal(m.crearNota('a', 'a', 'otra').ok, true);            // `aId` igual al nodo: también es suya
  assert.deepEqual(m.notasDe('a', null).map(n => n.texto), ['una', 'otra']);
  assert.equal(m.notasDe('a', 'b').length, 0);
  assert.equal(m.notasDeLinea('l1').length, 2);
  const n0 = m.notasDe('a', null)[0];
  assert.equal(m.moverNota(n0.id, 'a', 'b').ok, true);             // de un nodo a un tramo
  assert.deepEqual([m.nota(n0.id).deId, m.nota(n0.id).aId], ['a', 'b']);
  assert.equal(m.moverNota(n0.id, 'b', null).ok, true);            // y de vuelta a un nodo
  assert.equal(m.nota(n0.id).aId, null);
  const copia = new T.Modelo(JSON.parse(JSON.stringify(m.toJSON())));
  assert.equal(copia.notasDe('b', null).length, 1, 'viaja en los datos');
  assert.equal(m.borrarPunto('a').ok, true);
  assert.equal(m.datos.notas.filter(n => n.deId === 'a').length, 0, 'las notas de un nodo se van con él');
});

test('soltar un nodo sobre otro los intercambia (Leo, 15-09-2026)', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12); P(m, 'c', 'l2', 20);
  let r = m.moverPunto('a', { actoId: 'a1', celda: 12 }, { intercambiar: true });   // misma trama
  assert.equal(r.ok, true); assert.equal(r.intercambio.id, 'b');
  assert.deepEqual([m.punto('a').celda, m.punto('b').celda], [12, 4]);
  r = m.moverPunto('a', { actoId: 'a1', celda: 20, lineaId: 'l2' }, { intercambiar: true });   // otra trama: cada uno a la del otro
  assert.equal(r.ok, true);
  assert.deepEqual([m.punto('a').lineaId, m.punto('a').celda, m.punto('c').lineaId, m.punto('c').celda], ['l2', 20, 'l1', 12]);
  assert.equal(m.moverPunto('b', { actoId: 'a1', celda: 12 }).ok, false);                 // sin intercambiar, sigue sin poder
});

test('al intercambiar dos nodos las notas se quedan en su tramo', () => {
  const m = base();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 6); P(m, 'c', 'l1', 10);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: '1' }, { id: 'n2', deId: 'b', aId: 'c', texto: '2' });
  assert.equal(m.moverPunto('a', { actoId: 'a1', celda: 6 }, { intercambiar: true }).ok, true);   // a ↔ b
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId], ['b', 'a']);                   // sigue en 2–6
  assert.deepEqual([m.nota('n2').deId, m.nota('n2').aId], ['a', 'c']);                   // sigue en 6–10
  assert.equal(m._tramoValido('a', 'c', 'n2'), null);
});

test('intercambio con un salto: sus dos extremos van juntos y cada uno sigue en su trama', () => {
  const m = base();
  P(m, 'q', 'l1', 10); m.crearSalto('q', 'l2');                              // extremos en 10 (l1 y l2)
  const s = m.datos.saltos[0], otro = s.aId;
  P(m, 'x', 'l1', 30); P(m, 'y', 'l2', 30); P(m, 'z', 'l2', 40);
  /* el extremo de l1 sobre x: y está en la otra trama en la misma celda, así que no caben los dos */
  assert.equal(m.moverPunto('q', { actoId: 'a1', celda: 30 }, { intercambiar: true }).ok, false);
  /* el salto sobre z (en la trama de la pareja): el salto va a 40 y z a 10 */
  const r = m.moverSalto(s.id, 'a1', 40, { intercambiar: true });
  assert.equal(r.ok, true);
  assert.deepEqual([m.punto('q').celda, m.punto(otro).celda, m.punto('z').celda, m.punto('z').lineaId], [40, 40, 10, 'l2']);
  /* un nodo suelto sobre un extremo: el salto entero se va a su celda (si la pareja cabe allí) */
  assert.equal(m.moverPunto('x', { actoId: 'a1', celda: 40 }, { intercambiar: true }).ok, false);   // la pareja caería sobre y (l2, 30)
  P(m, 'w', 'l1', 50);
  assert.equal(m.moverPunto('w', { actoId: 'a1', celda: 40 }, { intercambiar: true }).ok, true);
  assert.deepEqual([m.punto('w').celda, m.punto('q').celda, m.punto(otro).celda], [40, 50, 50]);
  /* los dos extremos del mismo salto no se intercambian */
  assert.equal(m.intercambiarPuntos('q', otro).ok, false);
});

test('una nota solo va entre dos nodos consecutivos de la misma trama', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12); P(m, 'c', 'l1', 20); P(m, 'z', 'l2', 5);
  assert.equal(m.crearNota('a', 'c').ok, false);
  assert.equal(m.crearNota('a', 'z').ok, false);
  assert.equal(m.crearNota('b', 'a').ok, true);
  assert.deepEqual([m.datos.notas[0].deId, m.datos.notas[0].aId], ['a', 'b']);
  assert.equal(m.crearNota('a', 'b').ok, true);            // caben varias (Leo, 16-09-2026)
});

/* ---------- recorrido ---------- */
test('18. seleccionar un nodo de una secundaria ilumina principal → salto → secundaria hasta él', () => {
  const m = conIdaYVuelta();
  const r = m.recorrido('r22');
  assert.ok(r);
  assert.deepEqual(r.tramos.map(t => [t.lineaId, t.desde, t.hasta]), [['l1', -Infinity, 18], ['l2', 18, 22]]);
  assert.deepEqual([...r.saltos], ['s1']);
  assert.equal(r.incluye('l1', 5, 18), true);
  assert.equal(r.incluye('l1', 18, 24), false);
  assert.equal(r.incluye('l2', 22, 30), false);
});

test('19. seleccionar un nodo fuera de escena no ilumina nada', () => {
  const m = conIdaYVuelta();
  assert.equal(m.recorrido('p24'), null);
  assert.equal(m.recorrido('r41'), null);
});

test('20. un nodo de una trama sin saltos ilumina su propio carril hasta él', () => {
  const m = conIdaYVuelta();
  P(m, 'i1', 'l3', 3); P(m, 'i2', 'l3', 25);
  const r = m.recorrido('i2');
  assert.deepEqual(r.tramos.map(t => [t.lineaId, t.desde, t.hasta]), [['l3', -Infinity, 25]]);
  assert.equal(r.saltos.size, 0);
});

test('el hilo lista los nodos en el orden en que la historia los visita', () => {
  const m = conIdaYVuelta();
  assert.deepEqual(m.hilo(), ['p5', 'q1', 'q3', 'r22', 'q4', 'q2', 'p40']);
  assert.deepEqual(m.vecinos('r22'), { anterior: 'q3', siguiente: 'q4', indice: 3, total: 7, enHilo: true });
  assert.equal(m.vecinos('p5').anterior, null);
  assert.equal(m.vecinos('p40').siguiente, null);
  // fuera de escena: se recorre su propia trama
  assert.deepEqual(m.vecinos('p24'), { anterior: 'q1', siguiente: 'q2', indice: 2, total: 5, enHilo: false });
  // trama sin saltos: su propio carril
  P(m, 'i1', 'l3', 3); P(m, 'i2', 'l3', 25);
  assert.deepEqual(m.vecinos('i1'), { anterior: null, siguiente: 'i2', indice: 0, total: 2, enHilo: false });
});

test('el flujo sigue los saltos en orden desde la principal', () => {
  const m = conIdaYVuelta();
  assert.deepEqual(m.flujo().map(t => [t.lineaId, t.hasta]), [['l1', 18], ['l2', 30], ['l1', Infinity]]);
});

/* ---------- tramas y actos ---------- */
test('la trama principal no se elimina ni cambia de tipo, y no se promueve otra', () => {
  const m = base();
  assert.equal(m.borrarLinea('l1').ok, false);
  assert.equal(m.fijarTipo('l1', 'secundaria').ok, false);
  assert.equal(m.fijarTipo('l2', 'principal').ok, false);
  assert.equal(m.nuevaLinea('principal').linea.tipo, 'secundaria');
  assert.equal(m.datos.lineas.filter(l => l.tipo === 'principal').length, 1);
});

test('eliminar un acto muda sus nodos al vecino con la celda recortada', () => {
  const m = new T.Modelo({ actos: [{ id: 'a1', celdas: 10 }, { id: 'a2', celdas: 20 }],
    lineas: [{ id: 'l1', tipo: 'principal' }],
    puntos: [{ id: 'p', lineaId: 'l1', actoId: 'a2', celda: 15 }] });
  const r = m.borrarActo('a2');
  assert.equal(r.mudados, 1);
  assert.deepEqual([m.punto('p').actoId, m.punto('p').celda], ['a1', 9]);
  assert.equal(m.borrarActo('a1').ok, false);
});

test('reducir el ancho de un acto recorta la celda sin borrar nodos y mantiene los saltos alineados', () => {
  const m = base();
  P(m, 'a', 'l1', 50); P(m, 'b', 'l2', 50); S(m, 's', 'a', 'b');
  m.fijarAncho('a1', 20);
  assert.equal(m.punto('a').celda, 19);
  assert.equal(m.punto('b').celda, 19);
});

test('la celda global y ubicarCelda son inversas entre actos', () => {
  const m = new T.Modelo(T.ejemplo());
  assert.equal(m.cg(m.punto('p4')), 14 + 8);
  assert.deepEqual(m.ubicarCelda(22), { actoId: 'a2', celda: 8 });
  assert.deepEqual(m.ubicarCelda(500), { actoId: 'a3', celda: 14 });
});

/* ---------- saneado e historial ---------- */
test('normalizar deja un JSON ajeno cumpliendo las invariantes', () => {
  const m = new T.Modelo({
    lineas: [{ id: 'l1', tipo: 'secundaria' }, { id: 'l2', tipo: 'alterna' }],
    actos: [{ id: 'a1', celdas: 2 }],
    puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 99, cortado: true },
             { id: 'p2', lineaId: 'l2', actoId: 'a1', celda: 0 },
             { id: 'p3', lineaId: 'nope', actoId: 'a1', celda: 0 }],
    saltos: [{ id: 's1', deId: 'p1', aId: 'p2', tipo: 'cuadro' }, { id: 's2', deId: 'p1', aId: 'p3' }],
    notas: [{ id: 'n1', deId: 'p1', aId: 'p3', texto: 'rota' }]
  });
  assert.equal(m.lineaPrincipal().id, 'l1');
  assert.equal(m.acto('a1').celdas, 2);                   // el ancho se respeta desde 1 celda (eliminar columnas puede dejarlo así)
  assert.equal(m.datos.puntos.length, 2);
  assert.equal(m.datos.saltos.length, 1);
  assert.equal(m.datos.saltos[0].tipo, 'rombo');          // toca una alternativa
  assert.equal(m.punto('p1').cortado, false);             // es extremo
  assert.equal(m.punto('p2').celda, m.punto('p1').celda); // misma celda
  assert.equal(m.datos.notas.length, 0);
});

test('16-17. el historial deshace en un paso y actuar después descarta la rama rehacer', () => {
  const h = new T.Historial(3);
  h.registrar('A'); h.registrar('B'); h.registrar('C');
  assert.equal(h.deshacer(), 'B');
  assert.equal(h.puedeRehacer(), true);
  h.registrar('D');
  assert.equal(h.puedeRehacer(), false);
  assert.equal(h.deshacer(), 'B');
  assert.equal(h.deshacer(), 'A');
  assert.equal(h.deshacer(), null);
  assert.equal(h.rehacer(), 'B');
});

test('un salto no se crea sobre un nodo existente: la celda de destino tiene que estar libre', () => {
  const m = base();
  P(m, 'a', 'l1', 10); P(m, 'b', 'l2', 10); P(m, 'c', 'l1', 20);
  const r = m.crearSalto('a', 'l2');
  assert.equal(r.ok, false);
  assert.match(r.aviso, /ya está/);
  assert.equal(m.esExtremo('b'), false);                  // el nodo de destino no se convierte en cuadro
  assert.equal(m.datos.saltos.length, 0);
  const ok = m.crearSalto('c', 'l2');                     // celda libre: nace el otro extremo
  assert.equal(ok.ok, true); assert.equal(ok.creado, true);
  assert.equal(m.datos.puntos.filter(p => p.lineaId === 'l2').length, 2);
});

test('una celda es de un solo nodo: ni crear ni mover ponen un nodo sobre otro', () => {
  const m = base();
  P(m, 'a', 'l1', 10); P(m, 'b', 'l1', 20); P(m, 'c', 'l2', 20);
  assert.equal(m.nuevoPunto('l1', 'a1', 10).ok, false);                      // crear encima
  assert.equal(m.nuevoPunto('l1', 'a1', 11).ok, true);                       // al lado sí
  assert.equal(m.moverPunto('a', { actoId: 'a1', celda: 20 }).ok, false);    // mover encima (misma trama)
  assert.equal(m.punto('a').celda, 10);
  assert.equal(m.moverPunto('a', { actoId: 'a1', celda: 20, lineaId: 'l2' }).ok, false); // encima en otra trama
  assert.equal(m.punto('a').lineaId, 'l1');
  assert.equal(m.moverPunto('a', { actoId: 'a1', celda: 10 }).ok, true);     // quedarse donde está
  assert.equal(m.moverPunto('a', { actoId: 'a1', celda: 30, lineaId: 'l2' }).ok, true);
});

test('un salto no se mueve a una celda donde cualquiera de sus dos extremos caería sobre un nodo', () => {
  const m = base();
  P(m, 'q', 'l1', 10); m.crearSalto('q', 'l2');                              // extremos en 10 (l1 y l2)
  P(m, 'x', 'l1', 30); P(m, 'y', 'l2', 40);
  const s = m.datos.saltos[0];
  assert.equal(m.moverSalto(s.id, 'a1', 30).ok, false);                      // choca en l1
  assert.equal(m.moverSalto(s.id, 'a1', 40).ok, false);                      // choca en l2
  assert.equal(m.moverSalto(s.id, 'a1', 35).ok, true);
  assert.equal(m.punto(s.deId).celda, 35); assert.equal(m.punto(s.aId).celda, 35);
  assert.equal(m.moverSalto(s.id, 'a1', 35).ok, true);                       // sobre sí mismo: no choca
});

test('paleta de 24 tonos: las notas tienen color, que se guarda; los colores antiguos siguen valiendo', () => {
  assert.equal(T.PALETA.length, 24);
  ['azul', 'violeta', 'verde', 'ambar', 'rojo', 'gris'].forEach(c => assert.ok(T.PALETA.some(p => p.id === c), c));
  const m = base();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 9);
  const n = m.crearNota('a', 'b', 'Ojo').nota;
  assert.equal(n.color, undefined);                                           // sin color: el papel de nota
  assert.equal(m.colorearNota(n.id, 'cobre').ok, true);
  assert.equal(m.nota(n.id).color, 'cobre');
  const copia = new T.Modelo(JSON.parse(JSON.stringify(m.toJSON())));
  assert.equal(copia.nota(n.id).color, 'cobre');
  m.colorearNota(n.id, 'no-existe'); assert.equal('color' in m.nota(n.id), false);   // un color que no es de la paleta lo quita
  assert.equal(m.colorearNota('zz', 'rojo').ok, false);
  const l = m.nuevaLinea('secundaria').linea;                                // una trama nueva toma un tono libre
  assert.ok(!['azul', 'violeta', 'ambar'].includes(l.color));
});

test('mover un bloque de nodos: tiempo y tramas, con su salto entero (Leo, 15-09-2026)', () => {
  const m = base();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 4); P(m, 'q', 'l1', 6); m.crearSalto('q', 'l2');   // salto en 6 (l1 → l2)
  const otro = m.parejaDe('q').id;
  P(m, 'z', 'l2', 30);
  const r = m.moverBloque(['a', 'b', 'q'], 10, 0);                          // la pareja entra sola
  assert.equal(r.ok, true); assert.equal(r.movidos, 4);
  assert.deepEqual(['a', 'b', 'q', otro].map(id => m.punto(id).celda), [12, 14, 16, 16]);
  assert.equal(m.punto('z').celda, 30, 'sin choque nada más se mueve');
  assert.equal(m.moverBloque(['a'], 0, -1).ok, false, 'no hay tramas por arriba');
  assert.equal(m.moverBloque(['a'], -40, 0).ok, false, 'no cabe antes del principio');
});

test('bloque: si faltan tramas se añaden secundarias; si choca, lo de después se corre a la derecha', () => {
  const m = base();                                                          // l1 principal, l2 secundaria, l3 alterna
  P(m, 'a', 'l2', 2); P(m, 'b', 'l3', 3);
  P(m, 'x', 'l1', 20); P(m, 'y', 'l1', 25); P(m, 'w', 'l2', 10);
  m.datos.notas.push({ id: 'n1', deId: 'x', aId: 'y', texto: 'entre x e y' });
  const r = m.moverBloque(['a', 'b'], 18, 1);                                // a → l3 (20), b → trama nueva (21)
  assert.equal(r.ok, true); assert.equal(r.tramasNuevas, 1);
  assert.equal(m.datos.lineas.length, 4); assert.equal(m.datos.lineas[3].tipo, 'secundaria');
  assert.deepEqual([m.punto('a').lineaId, m.cg(m.punto('a')), m.punto('b').lineaId, m.cg(m.punto('b'))], ['l3', 20, m.datos.lineas[3].id, 21]);
  assert.equal(m.cg(m.punto('x')), 20, 'sin choque (otra trama) no se corre');
  /* ahora sobre x: el bloque cae en l1 20-21 → x e y se corren 2 */
  const r2 = m.moverBloque(['a', 'b'], 0, -2);
  assert.equal(r2.ok, true); assert.ok(r2.desplazados >= 2);
  assert.deepEqual([m.cg(m.punto('x')), m.cg(m.punto('y')), m.cg(m.punto('w'))], [22, 27, 10]);
  assert.equal(m.nota('n1').deId, 'x'); assert.equal(m.nota('n1').aId, 'y');
  const ocupadas = m.datos.puntos.map(p => p.lineaId + '|' + m.cg(p));
  assert.equal(new Set(ocupadas).size, ocupadas.length, 'nunca dos nodos en la misma celda');
});

test('bloque: si no cabe al final se alarga el último acto; un cuadro no baja a una alternativa', () => {
  const m = base();                                                          // un acto de 60 celdas
  P(m, 'a', 'l1', 55);
  assert.equal(m.moverBloque(['a'], 20, 0).ok, true);
  assert.equal(m.cg(m.punto('a')), 75); assert.ok(m.totalCeldas() >= 76);
  P(m, 'q', 'l1', 5); m.crearSalto('q', 'l2');                              // cuadro l1 → l2
  assert.equal(m.moverBloque(['q'], 0, 1).ok, false, 'l2 → l3 (alterna) con un cuadro');
});

test('bloque: una nota que queda entre nodos no consecutivos se recoloca', () => {
  const m = base();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 10); P(m, 'c', 'l2', 5);
  m.datos.notas.push({ id: 'n', deId: 'a', aId: 'b', texto: 'nota' });
  assert.equal(m.moverBloque(['c'], 0, -1).ok, true);                        // c cae en l1 5, entre a y b
  const n = m.nota('n'); assert.ok(n);
  assert.equal(m._tramoValido(n.deId, n.aId, n.id), null);
});

test('borrado masivo: lo elegido, con los extremos de sus saltos y sus notas', () => {
  const m = base();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 6); P(m, 'c', 'l1', 10); P(m, 'q', 'l1', 14); m.crearSalto('q', 'l2');
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: 'x' }, { id: 'n2', deId: 'b', aId: 'c', texto: 'y' });
  const r = m.resumenBorrado(['a', 'q']);
  assert.deepEqual([r.nodos, r.saltos, r.notas, r.total], [1, 1, 1, 3]);
  const b = m.borrarPuntos(['a', 'q']);
  assert.equal(b.ok, true); assert.equal(b.borrados, 3);
  assert.deepEqual(m.datos.puntos.map(p => p.id).sort(), ['b', 'c']);
  assert.equal(m.datos.saltos.length, 0); assert.deepEqual(m.datos.notas.map(n => n.id), ['n2']);
  assert.equal(m.borrarPuntos([]).ok, false);
});

test('reordenar tramas: cambia la posición y la flecha del salto se lee al revés (Leo, 15-09-2026)', () => {
  const m = base();                                                          // l1, l2, l3
  P(m, 'q', 'l1', 5); m.crearSalto('q', 'l2');
  const fila = id => m.datos.lineas.findIndex(l => l.id === id);
  const s = m.datos.saltos[0], sube = () => fila(m.punto(s.aId).lineaId) < fila(m.punto(s.deId).lineaId);
  assert.equal(sube(), false, 'de l1 baja a l2');
  const r = m.moverLinea('l2', 0);
  assert.equal(r.ok, true); assert.equal(r.movida, true);
  assert.deepEqual(m.datos.lineas.map(l => l.id), ['l2', 'l1', 'l3']);
  assert.equal(sube(), true, 'ahora sube');
  assert.deepEqual([s.deId, m.punto(s.deId).lineaId], ['q', 'l1'], 'el salto no cambia: sale de la misma trama');
  assert.equal(m.moverLinea('l3', 99).movida, false, 'ya es la última');
  assert.equal(m.moverLinea('nada', 0).ok, false);
  assert.equal(m.lineaPrincipal().id, 'l1', 'la principal sigue siéndolo');
});

/* Columnas (Leo, 16-09-2026, «como en Excel web»): insertar a un lado o a otro, varias de una vez, y
   eliminar las elegidas con lo que hubiera dentro. */
test('columnas: insertar a la izquierda y a la derecha corre lo que hay', () => {
  const m = corto();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 9); P(m, 'c', 'l2', 4);
  const r = m.insertarColumnas(4, 2, 'izquierda');
  assert.equal(r.ok, true); assert.equal(r.insertadas, 2); assert.equal(r.desde, 4);
  assert.deepEqual([m.cg(m.punto('a')), m.cg(m.punto('b')), m.cg(m.punto('c'))], [6, 11, 6], 'todo lo de la columna 4 en adelante, y en todas las tramas');
  assert.equal(m.acto('a1').celdas, 22, 'el acto que las recibe crece');
  const d = m.insertarColumnas(6, 1, 'derecha');
  assert.equal(d.desde, 7, 'entra detrás de esa columna');
  assert.deepEqual([m.cg(m.punto('a')), m.cg(m.punto('b'))], [6, 12], 'la de la izquierda no se mueve');
});

test('columnas: eliminar se lleva lo que hay dentro y corre el resto', () => {
  const m = corto();
  P(m, 'a', 'l1', 2); P(m, 'q', 'l1', 5); m.crearSalto('q', 'l2');           // el salto ocupa la columna 5 en dos tramas
  P(m, 'z', 'l1', 9);
  m.datos.notas.push({ id: 'n', deId: 'a', aId: 'q', texto: 'x' });
  const res = m.resumenColumnas([5]);
  assert.deepEqual([res.columnas, res.saltos, res.notas, res.actos], [1, 1, 1, 0]);
  const r = m.borrarColumnas([5]);
  assert.equal(r.ok, true); assert.equal(r.columnas, 1);
  assert.equal(m.datos.saltos.length, 0); assert.equal(m.datos.notas.length, 0);
  assert.deepEqual(m.datos.puntos.map(p => p.id).sort(), ['a', 'z']);
  assert.deepEqual([m.cg(m.punto('a')), m.cg(m.punto('z'))], [2, 8], 'lo de la derecha se corre; lo de la izquierda no');
  assert.equal(m.acto('a1').celdas, 19);
});

test('columnas: varias a la vez, el acto que se queda sin ninguna desaparece y siempre queda una', () => {
  const m = new T.Modelo({
    actos: [{ id: 'a1', nombre: 'Acto I', celdas: 2, fondo: null }, { id: 'a2', nombre: 'Acto II', celdas: 3, fondo: null }],
    lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul' }], puntos: [], saltos: [], notas: []
  });
  P(m, 'p', 'l1', 1, { actoId: 'a2' });                                      // celda global 3
  assert.equal(m.resumenColumnas([0, 1]).actos, 1, 'Acto I se quedaría sin columnas');
  const r = m.borrarColumnas([0, 1, 0, 99]);                                 // repetidas y fuera de rango no cuentan
  assert.equal(r.ok, true); assert.equal(r.columnas, 2); assert.equal(r.actos, 1);
  assert.deepEqual(m.datos.actos.map(a => a.id), ['a2']);
  assert.equal(m.cg(m.punto('p')), 1);
  assert.equal(m.borrarColumnas([0, 1, 2]).ok, false, 'tiene que quedar al menos una columna');
  assert.equal(m.borrarColumnas([]).ok, false);
});

test('columnas: moverlas con su contenido, varias a la vez (Leo, 16-09-2026)', () => {
  const m = corto();
  P(m, 'a', 'l1', 2); P(m, 'b', 'l1', 3); P(m, 'c', 'l1', 9); P(m, 'q', 'l2', 3);
  const cg = id => m.cg(m.punto(id));
  const r = m.moverColumnas([2, 3], 5);                                    // las dos columnas, cinco más allá
  assert.equal(r.ok, true); assert.equal(r.movidas, 2);
  assert.deepEqual([cg('a'), cg('b'), cg('q')], [7, 8, 8], 'se van juntas, y lo de la misma columna con ellas');
  assert.equal(cg('c'), 9, 'lo que estaba más allá del destino no se mueve');
  assert.deepEqual(m.datos.actos.map(x => x.celdas), [20], 'los actos no cambian de ancho');
  assert.equal(m.moverColumnas([7, 8], -5).ok, true);
  assert.deepEqual([cg('a'), cg('b'), cg('q')], [2, 3, 3], 'y vuelven');
  assert.equal(m.moverColumnas([2], 0).movidas, 0);                        // sin mover, no pasa nada
  assert.equal(m.moverColumnas([], 3).ok, false);
});

test('columnas: moverlas al principio y al final, sin salirse', () => {
  const m = corto();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 0);
  assert.equal(m.moverColumnas([4], -99).ok, true);
  assert.deepEqual([m.cg(m.punto('a')), m.cg(m.punto('b'))], [0, 1], 'a la primera posición; lo que había se corre');
  assert.equal(m.moverColumnas([0], 99).ok, true);
  assert.equal(m.cg(m.punto('a')), m.totalCeldas() - 1, 'y a la última');
});

test('notas apiladas: se reordenan una encima o debajo de otra (Leo, 16-09-2026)', () => {
  const m = new T.Modelo(T.inicial());
  const l = m.datos.lineas[0].id, a = m.datos.actos[0].id;
  const p1 = m.nuevoPunto(l, a, 2).punto, p2 = m.nuevoPunto(l, a, 6).punto;
  const n1 = m.crearNota(p1.id, null, 'A').nota, n2 = m.crearNota(p1.id, null, 'B').nota, n3 = m.crearNota(p1.id, null, 'C').nota;
  const t1 = m.crearNota(p1.id, p2.id, 'T1').nota, t2 = m.crearNota(p1.id, p2.id, 'T2').nota;
  const enNodo = () => m.notasDe(p1.id, null).map(x => x.texto);
  const enTramo = () => m.notasDe(p1.id, p2.id).map(x => x.texto);

  assert.deepEqual(enNodo(), ['A', 'B', 'C']);
  assert.equal(m.colocarNota(n3.id, n1.id).ok, true);          // la última, la primera
  assert.deepEqual(enNodo(), ['C', 'A', 'B']);
  assert.equal(m.colocarNota(n3.id, null).ok, true);           // al final
  assert.deepEqual(enNodo(), ['A', 'B', 'C']);
  assert.equal(m.colocarNota(n2.id, n2.id).movida, false, 'delante de sí misma no hace nada');

  /* también las de un tramo (el enlace entre dos nodos), sin mezclarse con las del nodo */
  assert.deepEqual(enTramo(), ['T1', 'T2']);
  assert.equal(m.colocarNota(t2.id, t1.id).ok, true);
  assert.deepEqual(enTramo(), ['T2', 'T1']);
  assert.deepEqual(enNodo(), ['A', 'B', 'C'], 'las del nodo no se tocan');
  /* y se mezclan: una de enlace puede ponerse encima de una de nodo, que en el tablero se apilan juntas */
  assert.equal(m.colocarNota(t1.id, n1.id).ok, true, 'una de enlace, delante de una de nodo');
  assert.deepEqual(m.datos.notas.map(x => x.texto), ['T1', 'A', 'B', 'T2', 'C']);
  assert.deepEqual(enNodo(), ['A', 'B', 'C']); assert.deepEqual(enTramo(), ['T1', 'T2'], 'cada una sigue en su sitio');
  /* pero no contra una nota de otra trama, que no se ve al lado */
  const l2 = m.nuevaLinea('secundaria').linea;
  const q1 = m.nuevoPunto(l2.id, a, 4).punto;
  const otra = m.crearNota(q1.id, null, 'Otra trama').nota;
  assert.equal(m.colocarNota(n1.id, otra.id).ok, false);
  assert.equal(m.colocarNota('n-no-existe', null).ok, false);
  /* el orden viaja en los datos */
  assert.deepEqual(new T.Modelo(JSON.parse(JSON.stringify(m.toJSON()))).notasDe(p1.id, p2.id).map(x => x.texto), ['T1', 'T2']);
});

test('el enlace entre dos nodos tiene color propio y admite varias notas; varias notas se borran de una vez (Leo, 16-09-2026)', () => {
  const m = base();
  const p1 = m.nuevoPunto('l1', 'a1', 2).punto, p2 = m.nuevoPunto('l1', 'a1', 6).punto, p3 = m.nuevoPunto('l1', 'a1', 9).punto;
  assert.equal(m.siguienteEnTrama(p1.id), p2); assert.equal(m.siguienteEnTrama(p3.id), null);
  assert.equal(m.colorearEnlace(p1.id, 'rojo').ok, true);
  assert.equal(m.punto(p1.id).colorEnlace, 'rojo');
  assert.equal(m.colorearEnlace(p1.id, 'no-es-un-tono').ok, true);
  assert.equal('colorEnlace' in m.punto(p1.id), false, 'un tono que no existe vuelve al de la trama');
  m.colorearEnlace(p2.id, 'verde');
  const copia = new T.Modelo(JSON.parse(JSON.stringify(m.toJSON())));
  assert.equal(copia.punto(p2.id).colorEnlace, 'verde', 'viaja en los datos');
  assert.equal('colorEnlace' in copia.punto(p1.id), false, 'y sin él no se añade nada');
  const a = m.crearNota(p1.id, p2.id, 'Uno').nota, b = m.crearNota(p1.id, p2.id, 'Dos').nota, c = m.crearNota(p2.id, p3.id, 'Tres').nota;
  assert.equal(m.notasDe(p1.id, p2.id).length, 2, 'caben varias en el mismo enlace');
  const r = m.borrarNotas([a.id, c.id, 'no-existe']);
  assert.equal(r.ok, true); assert.equal(r.borradas, 2);
  assert.deepEqual(m.datos.notas.map(n => n.id), [b.id]);
  assert.equal(m.borrarNotas([]).ok, false);
});
