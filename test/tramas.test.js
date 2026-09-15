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

test('13. arrastrar una nota a un tramo que ya tiene otra la deja donde estaba', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12); P(m, 'c', 'l1', 20);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: '1' }, { id: 'n2', deId: 'b', aId: 'c', texto: '2' });
  assert.equal(m.moverNota('n1', 'b', 'c').ok, false);
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId], ['a', 'b']);
  // sin nota en el destino sí se mueve, y también entre tramas
  P(m, 'x', 'l2', 1); P(m, 'y', 'l2', 9);
  assert.equal(m.moverNota('n1', 'x', 'y').ok, true);
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId], ['x', 'y']);
});

test('soltar una nota sobre otra las intercambia (Leo, 15-09-2026), también entre tramas', () => {
  const m = base();
  P(m, 'a', 'l1', 4); P(m, 'b', 'l1', 12); P(m, 'c', 'l1', 20); P(m, 'x', 'l2', 1); P(m, 'y', 'l2', 9);
  m.datos.notas.push({ id: 'n1', deId: 'a', aId: 'b', texto: '1' }, { id: 'n2', deId: 'b', aId: 'c', texto: '2' }, { id: 'n3', deId: 'x', aId: 'y', texto: '3' });
  const r = m.moverNota('n1', 'b', 'c', { intercambiar: true });
  assert.equal(r.ok, true); assert.equal(r.intercambio.id, 'n2');
  assert.deepEqual([m.nota('n1').deId, m.nota('n1').aId, m.nota('n2').deId, m.nota('n2').aId], ['b', 'c', 'a', 'b']);
  assert.equal(m.moverNota('n1', 'x', 'y', { intercambiar: true }).ok, true);
  assert.deepEqual([m.nota('n1').deId, m.nota('n3').deId], ['x', 'b']);
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
  assert.equal(m.crearNota('a', 'b').ok, false);           // ya hay una
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
  assert.equal(m.acto('a1').celdas, T.MIN_CELDAS);
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
