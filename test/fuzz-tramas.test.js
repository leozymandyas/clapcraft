/* Fuzz del modelo de esquemas (Tramas): miles de operaciones al azar —crear, mover, intercambiar, copiar,
   pegar, ocultar, borrar nodos, saltos, notas, tramas, actos y columnas— comprobando **después de cada una**
   las invariantes de la spec y que lo guardado vuelve igual al abrirlo.
   Nació del debugueo del 20-09-2026 (1.1.48), que así encontró tres fallos: una nota de enlace entre nodos
   que dejaban de ser consecutivos, una nota que quedaba entre dos tramas y desaparecía al guardar, y el
   esquema sin ninguna trama a la vista. Las semillas son fijas: un fallo se reproduce con `node --test`.
   Se ejecuta con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');

/* azar reproducible */
function azar(semilla) {
  let s = semilla;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return { r, ent: n => Math.floor(r() * n), uno: a => (a.length ? a[Math.floor(r() * a.length)] : null) };
}
const tablero = () => new T.Modelo({
  columnas: 12,
  actos: [{ id: 'a1', nombre: 'Acto I', desde: 0, celdas: 6, fondo: null },
          { id: 'a2', nombre: 'Acto II', desde: 6, celdas: 6, fondo: null }],
  lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul' },
           { id: 'l2', nombre: 'B', tipo: 'secundaria', color: 'violeta' },
           { id: 'l3', nombre: 'C', tipo: 'alterna', color: 'ambar' }],
  puntos: [], saltos: [], notas: []
});

/* con las claves ordenadas: el orden en que se escriben no cuenta (así compara también el guardado) */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/* Las invariantes de la spec: lo que tiene que cumplirse siempre, haga lo que haga la interfaz. */
function revisar(m) {
  const d = m.datos, mal = [];
  const F = (c, msg) => { if (!c) mal.push(msg); };
  const lineas = new Map(d.lineas.map(l => [l.id, l]));
  const puntos = new Map(d.puntos.map(p => [p.id, p]));

  F(d.columnas >= 1, 'el tablero se quedó sin columnas');
  F(d.lineas.length >= 1, 'el tablero se quedó sin tramas');
  F(d.lineas.some(l => l.tipo === 'principal'), 'no queda ninguna trama principal');
  F(d.lineas.some(l => !l.oculta), 'no queda ninguna trama a la vista');

  let fin = 0;
  d.actos.forEach(a => {
    F(a.celdas >= 1, `el acto ${a.id} mide ${a.celdas} celdas`);
    F(a.desde >= fin, `los actos se pisan en ${a.id}`);
    fin = a.desde + a.celdas;
    F(fin <= d.columnas, `el acto ${a.id} acaba en ${fin} y solo hay ${d.columnas} columnas`);
  });

  const celdas = new Set();
  d.puntos.forEach(p => {
    F(lineas.has(p.lineaId), `el nodo ${p.id} está en una trama que no existe`);
    F(Number.isInteger(p.col) && p.col >= 0 && p.col < d.columnas, `el nodo ${p.id} está en la columna ${p.col} de ${d.columnas}`);
    const k = p.lineaId + '|' + p.col;
    F(!celdas.has(k), 'dos nodos en la misma celda');
    celdas.add(k);
  });

  const enSalto = new Set();
  d.saltos.forEach(s => {
    const a = puntos.get(s.deId), b = puntos.get(s.aId);
    F(!!a && !!b, `el salto ${s.id} tiene un extremo que no existe`);
    if (!a || !b) return;
    F(a.lineaId !== b.lineaId, `el salto ${s.id} va dentro de la misma trama`);
    F(a.col === b.col, `el salto ${s.id} tiene sus extremos en columnas distintas`);
    F(!enSalto.has(a.id) && !enSalto.has(b.id), 'un nodo en dos saltos');
    enSalto.add(a.id); enSalto.add(b.id);
    const alterna = (lineas.get(a.lineaId) || {}).tipo === 'alterna' || (lineas.get(b.lineaId) || {}).tipo === 'alterna';
    F(!(alterna && s.tipo === 'cuadro'), 'un cuadro tocando una trama alternativa');
    F(!a.cortado && !b.cortado, 'un extremo de salto descartado');
  });

  d.notas.forEach(n => {
    if (n.abierta) {
      F(lineas.has(n.lineaId), `la nota de raya ${n.id} está en una trama que no existe`);
      F(Number.isInteger(n.col) && n.col >= 0 && n.col < d.columnas, `la nota de raya ${n.id} está en la columna ${n.col} de ${d.columnas}`);
      return;
    }
    const a = puntos.get(n.deId);
    F(!!a, `la nota ${n.id} cuelga de un nodo que no existe`);
    if (!a) return;
    if (n.aId) {
      const b = puntos.get(n.aId);
      F(!!b, `la nota ${n.id} apunta a un nodo que no existe`);
      if (!b) return;
      F(a.lineaId === b.lineaId, 'una nota entre nodos de tramas distintas (se perdería al guardar)');
      const sig = m.siguienteEnTrama(a.id);
      F(!!sig && sig.id === b.id, 'una nota entre nodos que no son consecutivos');
    }
    F(n.nivel === undefined || (n.nivel >= 1 && n.nivel <= 40), `la nota ${n.id} tiene el escalón ${n.nivel}`);
  });

  Object.keys(d.anchos || {}).forEach(k => {
    const c = +k;
    F(Number.isInteger(c) && c >= 0 && c < d.columnas, `un ancho propio en la columna ${k}, fuera de las ${d.columnas}`);
  });

  /* lo guardado, abierto otra vez, es lo mismo (si no, el archivo de Leo cambiaría solo al abrirlo) */
  const guardado = m.toJSON();
  F(canonico(guardado) === canonico(new T.Modelo(JSON.parse(JSON.stringify(guardado))).toJSON()),
    'lo guardado no vuelve igual al abrirlo');
  return mal;
}

/* Un tablero ya crecido: lo que multiplica tramas y columnas (pegar, mover bloques) se deja de hacer, para que
   las semillas sigan siendo rápidas y del tamaño de un esquema de verdad. */
const grande = m => m.datos.lineas.length > 12 || m.totalCeldas() > 120 || m.datos.puntos.length > 120;

/* Las operaciones, con su peso: se crea más de lo que se borra para que el tablero no se quede vacío. */
function operaciones(z) {
  const { r, ent, uno } = z;
  return [
    [8, 'nuevoPunto', m => { if (m.datos.puntos.length > 120) return null; const l = uno(m.datos.lineas); return l && m.nuevoPunto(l.id, ent(m.totalCeldas()), { titulo: 'n' + ent(99) }); }],
    [8, 'moverPunto', m => { const p = uno(m.datos.puntos), l = uno(m.datos.lineas); return p && m.moverPunto(p.id, { col: ent(m.totalCeldas()), lineaId: r() < .5 ? l.id : p.lineaId }, { intercambiar: r() < .5 }); }],
    [2, 'moverBloque', m => { if (grande(m)) return null; const ids = m.datos.puntos.filter(() => r() < .3).map(p => p.id); return ids.length ? m.moverBloque(ids, ent(5) - 2, ent(3) - 1) : null; }],
    [1, 'borrarPunto', m => { const p = uno(m.datos.puntos); return p && m.borrarPunto(p.id); }],
    [1, 'borrarPuntos', m => { const ids = m.datos.puntos.filter(() => r() < .2).map(p => p.id); return ids.length ? m.borrarPuntos(ids) : null; }],
    [2, 'descartarPunto', m => { const p = uno(m.datos.puntos); return p && m.descartarPunto(p.id, r() < .5); }],
    [4, 'crearSalto', m => { const p = uno(m.datos.puntos), l = uno(m.datos.lineas); return p && l && m.crearSalto(p.id, l.id, r() < .5 ? 'cuadro' : 'rombo'); }],
    [2, 'convertirSalto', m => { const s = uno(m.datos.saltos); return s && m.convertirSalto(s.id, r() < .5 ? 'cuadro' : 'rombo'); }],
    [2, 'invertirSalto', m => { const s = uno(m.datos.saltos); return s && m.invertirSalto(s.id); }],
    [3, 'moverSalto', m => { const s = uno(m.datos.saltos); return s && m.moverSalto(s.id, ent(m.totalCeldas()), { intercambiar: r() < .5 }); }],
    [1, 'borrarSalto', m => { const s = uno(m.datos.saltos); return s && m.borrarSalto(s.id); }],
    [5, 'crearNota', m => { if (m.datos.notas.length > 300) return null; const p = uno(m.datos.puntos); if (!p) return null;
      const sig = m.siguienteEnTrama(p.id); return m.crearNota(p.id, r() < .5 && sig ? sig.id : null, 'x' + ent(99)); }],
    [3, 'crearNotaAbierta', m => { if (m.datos.notas.length > 300) return null; const l = uno(m.datos.lineas); return l && m.crearNotaAbierta(l.id, ent(m.totalCeldas()), 'r' + ent(99)); }],
    [2, 'moverNota', m => { const n = uno(m.datos.notas), p = uno(m.datos.puntos); if (!n || !p) return null;
      const sig = m.siguienteEnTrama(p.id); return m.moverNota(n.id, p.id, r() < .5 && sig ? sig.id : null); }],
    [2, 'moverNotaAbierta', m => { const n = uno(m.datos.notas), l = uno(m.datos.lineas); return n && l && m.moverNotaAbierta(n.id, l.id, ent(m.totalCeldas())); }],
    [2, 'colocarNota', m => { const n = uno(m.datos.notas), o = uno(m.datos.notas); return n && m.colocarNota(n.id, o && o.id !== n.id ? o.id : null); }],
    [2, 'fijarNivelNota', m => { const n = uno(m.datos.notas); return n && m.fijarNivelNota(n.id, ent(45) - 2); }],
    [1, 'intercambiarNotas', m => { const a = uno(m.datos.notas), b = uno(m.datos.notas); return a && b && a.id !== b.id ? m.intercambiarNotas(a.id, b.id) : null; }],
    [1, 'borrarNota', m => { const n = uno(m.datos.notas); return n && m.borrarNota(n.id); }],
    [2, 'nuevaLinea', m => (m.datos.lineas.length > 10 ? null : m.nuevaLinea(uno(['secundaria', 'alterna', 'principal'])))],
    [2, 'fijarTipo', m => { const l = uno(m.datos.lineas); return l && m.fijarTipo(l.id, uno(['principal', 'secundaria', 'alterna'])); }],
    [2, 'moverLinea', m => { const l = uno(m.datos.lineas); return l && m.moverLinea(l.id, ent(m.datos.lineas.length + 1)); }],
    [2, 'ocultarLinea', m => { const l = uno(m.datos.lineas); return l && m.ocultarLinea(l.id, r() < .6); }],
    [1, 'mostrarTodas', m => m.mostrarTodasLasLineas()],
    [1, 'borrarLinea', m => { const l = uno(m.datos.lineas); return l && m.borrarLinea(l.id); }],
    [2, 'nuevoActo', m => (m.datos.actos.length > 8 ? null : m.nuevoActo())],
    [2, 'moverActo', m => { const a = uno(m.datos.actos); return a && m.moverActo(a.id, ent(m.totalCeldas() + 3)); }],
    [2, 'moverBorde', m => { const a = uno(m.datos.actos); return a && m.moverBorde(a.id, ent(m.totalCeldas() + 4)); }],
    [1, 'borrarActo', m => { const a = uno(m.datos.actos); return a && m.borrarActo(a.id); }],
    [2, 'insertarColumnas', m => (m.totalCeldas() > 80 ? null : m.insertarColumnas(ent(m.totalCeldas()), 1 + ent(3), r() < .5 ? 'izquierda' : 'derecha'))],
    [1, 'borrarColumnas', m => { const cs = []; for (let c = 0; c < m.totalCeldas(); c++) if (r() < .2) cs.push(c); return cs.length ? m.borrarColumnas(cs) : null; }],
    [2, 'moverColumnas', m => { const cs = []; for (let c = 0; c < m.totalCeldas(); c++) if (r() < .15) cs.push(c); return cs.length ? m.moverColumnas(cs, ent(7) - 3) : null; }],
    [2, 'tamaños', m => { const l = uno(m.datos.lineas); m.fijarAnchoCol(ent(m.totalCeldas()), [0.5, 1, 2, 3][ent(4)]); return l && m.fijarAltoLinea(l.id, [0.5, 1, 2, 4][ent(4)]); }],
    [1, 'restablecerTamaños', m => m.restablecerTamanos()],
    [3, 'copiar y pegar', m => { if (grande(m)) return null; const ids = m.datos.puntos.filter(() => r() < .4).map(p => p.id); if (!ids.length) return null;
      const clip = m.copiar(ids); return clip && m.pegar(clip, ent(m.totalCeldas()), ent(m.datos.lineas.length)); }],
    [1, 'pegar de otro esquema', m => {                       // el portapapeles del tablero es común a todos
      if (grande(m)) return null;
      const otro = tablero();
      const a = otro.nuevoPunto('l1', 1, { titulo: 'X' }).punto;
      otro.nuevoPunto('l2', 4, { titulo: 'Y' });
      otro.crearNota(a.id, null, 'nota suya'); otro.crearSalto(a.id, 'l3', 'rombo');
      const clip = otro.copiar(otro.datos.puntos.map(p => p.id));
      return clip && m.pegar(clip, ent(m.totalCeldas()), ent(m.datos.lineas.length));
    }],
    [1, 'copiar y pegar notas', m => { if (m.datos.notas.length > 300) return null;
      const ids = m.datos.notas.filter(() => r() < .4).map(n => n.id); if (!ids.length) return null;
      const clip = m.copiarNotas(ids), p = uno(m.datos.puntos);
      return clip && m.pegarNotas(clip, r() < .5 && p ? { deId: p.id } : null); }],
    [2, 'presencia, flujo e hilo', m => { m.presencia(); m.flujo(); m.hilo(); const p = uno(m.datos.puntos); if (p) { m.recorrido(p.id); m.vecinos(p.id); } return null; }]
  ];
}

for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`fuzz del esquema: 400 operaciones al azar (semilla ${semilla}) no rompen ninguna invariante`, () => {
    const z = azar(semilla), m = tablero();
    const bolsa = [];
    operaciones(z).forEach(([peso, nombre, fn]) => { for (let i = 0; i < peso; i++) bolsa.push([nombre, fn]); });
    const ultimas = [];
    for (let i = 0; i < 400; i++) {
      const [nombre, fn] = bolsa[z.ent(bolsa.length)];
      ultimas.push(nombre); if (ultimas.length > 10) ultimas.shift();
      const r = fn(m);
      assert.ok(r === null || r === false || (r && typeof r === 'object' && 'ok' in r),
        `${nombre} devolvió algo que no es { ok }`);
      const mal = revisar(m);
      assert.equal(mal.length, 0, `${nombre}: ${mal.join(' · ')}\n    últimas operaciones: ${ultimas.join(' → ')}`);
    }
  });
}
