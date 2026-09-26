/* Tramas · modelo
   Cinco colecciones planas (actos, lineas, puntos, saltos, notas), las invariantes y los dos
   cálculos derivados (presencia en escena y recorrido). No toca el DOM ni conoce píxeles: todo se
   mide en celdas. Se puede cargar en Node para probarlo (test/tramas.test.js).

   Cada operación devuelve { ok, aviso? , ... }: `ok:false` significa que la invariante la rechazó
   y `aviso` es el texto que hay que enseñar al usuario. */
(function (raiz) {
  const T = raiz.Tramas = raiz.Tramas || {};

  /* ---------- constantes de dominio ---------- */
  /* Veinticuatro tonos para tramas, nodos y notas (Leo, 15-09-2026, docs/diseno/rediseno-9/), en el orden de la escala;
     cada uno tiene su trazo `--t-<id>` y su fondo pálido `--f-<id>`. Los seis de antes conservan su id. */
  const PALETA = [
    { id: 'rojo', label: 'Rojo', c: '#c62828' },
    { id: 'ladrillo', label: 'Ladrillo', c: '#d14a1f' },
    { id: 'cobre', label: 'Cobre', c: '#d2691e' },
    { id: 'ambar', label: 'Ámbar', c: '#c98a00' },
    { id: 'oro', label: 'Oro', c: '#9a7b0a' },
    { id: 'lima', label: 'Lima', c: '#6e9a16' },
    { id: 'oliva', label: 'Oliva', c: '#4f7a1e' },
    { id: 'verde', label: 'Verde', c: '#16803c' },
    { id: 'esmeralda', label: 'Esmeralda', c: '#0a8a5c' },
    { id: 'teal', label: 'Teal', c: '#0b8b82' },
    { id: 'turquesa', label: 'Turquesa', c: '#0e8aa8' },
    { id: 'cielo', label: 'Cielo', c: '#0378c0' },
    { id: 'azul', label: 'Azul', c: '#1a63d0' },
    { id: 'marino', label: 'Marino', c: '#17417e' },
    { id: 'pizarra', label: 'Pizarra', c: '#3e4a5c' },
    { id: 'indigo', label: 'Índigo', c: '#4b34cc' },
    { id: 'violeta', label: 'Violeta', c: '#6d28d9' },
    { id: 'uva', label: 'Uva', c: '#8a2bc4' },
    { id: 'ciruela', label: 'Ciruela', c: '#a21caf' },
    { id: 'magenta', label: 'Magenta', c: '#bf1b8a' },
    { id: 'rosa', label: 'Rosa', c: '#d31a6b' },
    { id: 'vino', label: 'Vino', c: '#96153f' },
    { id: 'salvia', label: 'Salvia', c: '#5a7a63' },
    { id: 'gris', label: 'Gris', c: '#5d5d68' }
  ];
  /* el color de una trama nueva: el primero libre de este orden (tonos separados entre sí) */
  const ORDEN_NUEVAS = ['azul', 'violeta', 'verde', 'ambar', 'rojo', 'teal', 'rosa', 'cobre', 'indigo', 'oliva', 'cielo', 'ciruela',
    'oro', 'esmeralda', 'magenta', 'ladrillo', 'marino', 'uva', 'lima', 'turquesa', 'vino', 'pizarra', 'salvia', 'gris'];
  /* Fondo de un acto: un color, «ninguno» (sin fondo, elegido a mano) o null: el automático por su
     posición (FONDOS_AUTO, en ciclo), como en el diseño de ClapCraft. */
  const FONDOS = [
    { id: 'ninguno', label: 'Sin fondo', c: 'transparent' },
    { id: 'azul',    label: 'Azul',    c: '#dfe9ff' },
    { id: 'violeta', label: 'Violeta', c: '#ebe0ff' },
    { id: 'verde',   label: 'Verde',   c: '#d9f5e2' },
    { id: 'ambar',   label: 'Ámbar',   c: '#fff2d0' },
    { id: 'rojo',    label: 'Rojo',    c: '#ffe2e2' },
    { id: 'gris',    label: 'Gris',    c: '#e9e7ee' }
  ];
  const FONDOS_AUTO = ['azul', 'ambar', 'verde', 'violeta', 'rojo', 'gris'];
  const TIPOS = ['principal', 'secundaria', 'alterna'];
  const ETIQUETA = { principal: 'Principal', secundaria: 'Secundaria', alterna: 'Alternativa' };
  const FORMA = { cuadro: 'Cambio de escena', rombo: 'Salto alternativo' };
  /* Un acto (un momento, en Personajes) puede quedarse en **una sola columna** (Leo, 16-09-2026: «lo mínimo que puede
     tener un acto es 7; debe ser 1»): el mínimo manda en la barra del panel, en el divisor y en los actos que se crean
     al alargar el tablero. */
  const MIN_CELDAS = 1, MAX_CELDAS = 60, ANCHO_ACTO = 15;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = id => (PALETA.find(p => p.id === id) || PALETA[0]).c;
  const fondoDe = id => (FONDOS.find(f => f.id === id) || FONDOS[0]).c;
  /* El fondo que se ve en el acto de la posición `i`: el elegido o el automático. */
  const fondoEfectivo = (a, i) => (a && a.fondo) || FONDOS_AUTO[i % FONDOS_AUTO.length];
  const romano = k => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k] || String(k);
  const clonar = d => JSON.parse(JSON.stringify(d));
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});

  /* ---------- saneado al cargar ----------
     Red de seguridad para JSON que venga de fuera: rellena valores por defecto, quita referencias
     rotas y deja el tablero cumpliendo las invariantes. */
  function normalizar(entrada) {
    const d = { columnas: 1, actos: [], lineas: [], puntos: [], saltos: [], notas: [], anchos: {} };
    const e = entrada && typeof entrada === 'object' ? entrada : {};
    const lista = x => Array.isArray(x) ? x : [];

    /* **Las columnas existen sin depender de los actos** (Leo, 18-09-2026: «que las líneas verticales existan sin depender de
       un acto, que pueda mover los actos sin que se muevan las líneas, para poder definir qué tan largo es un acto solamente,
       y pueden haber o no más de uno»). El tablero tiene sus `columnas`; un acto es un tramo de ellas (`desde`, `celdas`) que
       no pisa a otro, puede dejar columnas fuera y puede no haber ninguno. Los nodos y las notas de raya van en una columna
       global (`col`). Lo guardado antes —actos seguidos que hacían las columnas, nodos con `actoId` y `celda`— se pasa a esta
       forma al abrirlo. */
    const antiguo = !(e.columnas !== undefined && lista(e.actos).every(a => !a || a.desde !== undefined));
    const viejos = new Map();                                     // en lo antiguo, dónde empezaba cada acto
    let seguidas = 0;
    lista(e.actos).forEach((a, i) => {
      if (!a || !a.id) return;
      const celdas = Math.max(1, Math.round(+a.celdas || ANCHO_ACTO));
      const desde = antiguo ? seguidas : Math.max(0, Math.round(+a.desde || 0));
      if (antiguo) { viejos.set(String(a.id), { desde, celdas }); seguidas += celdas; }
      d.actos.push({ id: String(a.id), nombre: String(a.nombre ?? ('Acto ' + romano(i + 1))), desde, celdas,
        fondo: FONDOS.some(f => f.id === a.fondo) ? a.fondo : null });
    });
    if (!d.actos.length && antiguo) { d.actos.push({ id: 'a1', nombre: 'Acto I', desde: 0, celdas: ANCHO_ACTO, fondo: null }); seguidas = ANCHO_ACTO; }
    d.actos.sort((a, b) => a.desde - b.desde);
    let finAnterior = 0;
    d.actos.forEach(a => { if (a.desde < finAnterior) a.desde = finAnterior; finAnterior = a.desde + a.celdas; });   // sin pisarse
    /* la columna de un nodo o de una nota de raya, esté guardada como sea */
    const colDe = x => {
      if (x.col !== undefined && x.col !== null && Number.isFinite(+x.col)) return Math.max(0, Math.round(+x.col));
      const v = viejos.get(x.actoId); if (!v) return null;
      return v.desde + clamp(Math.round(+x.celda || 0), 0, v.celdas - 1);
    };

    lista(e.lineas).forEach((l, i) => {
      if (!l || !l.id) return;
      d.lineas.push({ id: String(l.id), nombre: String(l.nombre ?? ('Trama ' + (i + 1))),
        tipo: TIPOS.includes(l.tipo) ? l.tipo : 'secundaria',
        color: PALETA.some(c => c.id === l.color) ? l.color : PALETA[i % PALETA.length].id,
        cortada: !!l.cortada, ...(l.oculta ? { oculta: true } : {}),                                    // oculta: como una fila escondida de Excel (1.1.40)
        ...(+l.alto > 0 && Math.abs(+l.alto - 1) > 0.01 ? { alto: clamp(+l.alto, 0.5, 8) } : {}),        // su alto propio (1.1.41)
        ...(typeof l.personaje === 'string' && l.personaje ? { personaje: l.personaje } : {}) });   // en ClapCraft, el personaje del carril
    });
    if (!d.lineas.length) d.lineas.push({ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul', cortada: false });
    if (d.lineas.length && !d.lineas.some(l => !l.oculta)) delete d.lineas[0].oculta;        // siempre queda una a la vista
    /* al menos una principal; caben las que sean (Leo, 18-09-2026: «quita esa regla de que solo puede haber una trama
       principal»). La historia sale de la primera (`lineaPrincipal`). */
    if (!d.lineas.some(l => l.tipo === 'principal')) d.lineas[0].tipo = 'principal';

    const lineaIds = new Set(d.lineas.map(l => l.id));
    lista(e.puntos).forEach(p => {
      if (!p || !p.id || !lineaIds.has(p.lineaId)) return;
      const col = colDe(p); if (col === null) return;
      d.puntos.push({ id: String(p.id), lineaId: p.lineaId, col,
        titulo: String(p.titulo ?? ''), descripcion: String(p.descripcion ?? p.nota ?? ''),
        color: PALETA.some(c => c.id === p.color) ? p.color : null, cortado: !!p.cortado,
        /* el color del enlace que sale de este nodo hacia el siguiente de su trama (Leo, 16-09-2026); sin él, el de la trama */
        ...(PALETA.some(c => c.id === p.colorEnlace) ? { colorEnlace: p.colorEnlace } : {}) });
    });

    const puntoIds = new Set(d.puntos.map(p => p.id));
    const punto = id => d.puntos.find(p => p.id === id), linea = id => d.lineas.find(l => l.id === id);
    const usados = new Set();
    lista(e.saltos).forEach(s => {
      if (!s || !s.id || !puntoIds.has(s.deId) || !puntoIds.has(s.aId) || s.deId === s.aId) return;
      const a = punto(s.deId), b = punto(s.aId);
      if (a.lineaId === b.lineaId) return;                         // un salto une tramas distintas
      if (usados.has(a.id) || usados.has(b.id)) return;            // un nodo, como mucho un salto
      usados.add(a.id); usados.add(b.id);
      const alterna = linea(a.lineaId).tipo === 'alterna' || linea(b.lineaId).tipo === 'alterna';
      d.saltos.push({ id: String(s.id), deId: s.deId, aId: s.aId,
        tipo: (s.tipo === 'rombo' || alterna) ? 'rombo' : 'cuadro',
        ...(typeof s.rel === 'string' && s.rel ? { rel: s.rel } : {}) });   // en ClapCraft, la relación entre personajes que refleja (misma `rel` en los dos tableros)
      b.col = a.col;                                               // misma columna, siempre
      a.cortado = false; b.cortado = false;                        // un extremo no se descarta
    });

    /* Una nota va en un tramo (entre dos nodos consecutivos) o **en un nodo** (`aId: null`), y **caben varias**
       (Leo, 16-09-2026: «quiero poder agregar varias notas apiladas… también agregar notas por nodo»). */
    /* el escalón propio de una nota (1.1.46), si lo tiene */
    const nivelDe = n => (+n.nivel > 0 ? { nivel: clamp(Math.round(+n.nivel), 1, 40) } : {});
    lista(e.notas).forEach(n => {
      if (!n || !n.id) return;
      const tono = PALETA.some(c => c.id === n.color) ? { color: n.color } : {};
      /* **nota de una raya** (Leo, 17-09-2026: «velo como rayas: las rayas son enlaces, los puntos son los nodos»): cuelga de la
         raya de su trama que va de la columna `col` a la siguiente, haya nodos o no. Las de la 1.1.6 colgaban de un nodo
         (`deId`): pasan a la raya que sale de él. */
      if (n.abierta) {
        const p = puntoIds.has(n.deId) ? punto(n.deId) : null;
        const lid = lineaIds.has(n.lineaId) ? n.lineaId : p ? p.lineaId : null; if (!lid) return;
        let col = colDe(n); if (col === null) col = p ? p.col : 0;
        d.notas.push({ id: String(n.id), deId: null, aId: null, abierta: true, lineaId: lid, col, texto: String(n.texto ?? ''), ...tono, ...nivelDe(n) });
        return;
      }
      if (!puntoIds.has(n.deId)) return;
      const suelta = !n.aId || n.aId === n.deId;                   // nota de un nodo
      if (!suelta && (!puntoIds.has(n.aId) || punto(n.deId).lineaId !== punto(n.aId).lineaId)) return;
      d.notas.push({ id: String(n.id), deId: n.deId, aId: suelta ? null : n.aId, texto: String(n.texto ?? ''), ...(PALETA.some(c => c.id === n.color) ? { color: n.color } : {}), ...nivelDe(n) });
    });
    /* las columnas: las que diga, y al menos las que usan los actos, los nodos y las notas */
    const usadas = Math.max(0, ...d.puntos.map(p => p.col + 1), ...d.notas.filter(n => n.abierta).map(n => n.col + 1));
    d.columnas = Math.max(1, antiguo ? seguidas : Math.round(+e.columnas) || 1, finAnterior, usadas);
    /* los anchos propios de las columnas (1.1.41): solo los de columnas que existen y distintos del normal */
    if (e.anchos && typeof e.anchos === 'object') Object.keys(e.anchos).forEach(k => {
      const c = Math.round(+k), f = +e.anchos[k];
      if (Number.isFinite(c) && c >= 0 && c < d.columnas && f > 0 && Math.abs(f - 1) > 0.01) d.anchos[c] = clamp(f, 0.3, 8);
    });
    return d;
  }

  /* ====================================================================
     Modelo
     ==================================================================== */
  class Modelo {
    constructor(datos) { this.datos = normalizar(datos); }

    /* ---------- serialización ---------- */
    toJSON() { return clonar(this.datos); }
    cargar(datos) { this.datos = normalizar(datos); return this; }
    static desde(datos) { return new Modelo(datos); }

    /* ---------- consultas ---------- */
    acto(id) { return this.datos.actos.find(a => a.id === id); }
    linea(id) { return this.datos.lineas.find(l => l.id === id); }
    punto(id) { return this.datos.puntos.find(p => p.id === id); }
    salto(id) { return this.datos.saltos.find(s => s.id === id); }
    nota(id) { return this.datos.notas.find(n => n.id === id); }
    lineaPrincipal() { return this.datos.lineas.find(l => l.tipo === 'principal'); }   // la primera: de ella sale la historia
    /* la única principal que queda: esa no se borra ni deja de serlo (tiene que quedar al menos una) */
    ultimaPrincipal(id) { const l = this.linea(id); return !!l && l.tipo === 'principal' && this.datos.lineas.filter(x => x.tipo === 'principal').length === 1; }
    saltoDe(puntoId) { return this.datos.saltos.find(s => s.deId === puntoId || s.aId === puntoId); }
    esExtremo(puntoId) { return !!this.saltoDe(puntoId); }
    formaDe(puntoId) { const s = this.saltoDe(puntoId); return s ? s.tipo : null; }
    parejaDe(puntoId) {
      const s = this.saltoDe(puntoId);
      return s ? this.punto(s.deId === puntoId ? s.aId : s.deId) : null;
    }
    puntosDe(lineaId) {
      return this.datos.puntos.filter(p => p.lineaId === lineaId).sort((a, b) => this.cg(a) - this.cg(b));
    }
    notaDe(deId, aId) { return this.notasDe(deId, aId)[0] || null; }
    /* Las notas de un tramo (dos nodos) o, con `aId` null, las de un nodo. Caben varias (Leo, 16-09-2026). */
    notasDe(deId, aId) {
      if (!aId) return this.datos.notas.filter(n => !n.aId && !n.abierta && n.deId === deId);
      return this.datos.notas.filter(n => n.aId && ((n.deId === deId && n.aId === aId) || (n.deId === aId && n.aId === deId)));
    }
    /* Todas las notas de una trama, en el orden del tiempo (las de nodo, en el nodo). */
    notasDeLinea(lineaId) {
      const x = n => { const a = this.punto(n.deId), b = n.aId && this.punto(n.aId);
        if (n.abierta) return this.colNota(n) + .5;
        return a ? Math.min(this.cg(a), b ? this.cg(b) : Infinity) : Infinity; };
      return this.datos.notas.filter(n => this.lineaDeNota(n) === lineaId).sort((p, q) => x(p) - x(q));
    }
    /* La trama de una nota: la de su nodo o, en la de una raya, la suya. */
    lineaDeNota(n) {
      if (!n) return null;
      if (n.abierta) return this.linea(n.lineaId) ? n.lineaId : null;
      const a = this.punto(n.deId); return a ? a.lineaId : null;
    }
    /* La columna global donde empieza la raya de una nota de raya (va de ahí a la siguiente). */
    colNota(n) { return clamp(Math.round(+n.col || 0), 0, this.totalCeldas() - 1); }
    /* Las notas de la raya que empieza en la columna `cg` de la trama `lineaId`. */
    notasAbiertas(lineaId, cg) {
      return this.datos.notas.filter(n => n.abierta && n.lineaId === lineaId && this.colNota(n) === cg);
    }
    /* ¿Un salto entre estas dos tramas sería rombo o cuadro? */
    formaEntre(lineaA, lineaB) {
      const a = this.linea(lineaA), b = this.linea(lineaB);
      return (a && a.tipo === 'alterna') || (b && b.tipo === 'alterna') ? 'rombo' : 'cuadro';
    }

    /* ---------- cuadrícula: columnas (las líneas verticales), independientes de los actos ---------- */
    totalCeldas() { return this.datos.columnas; }
    celdasAntes(actoId) { const a = this.acto(actoId); return a ? a.desde : 0; }   // la columna donde empieza un acto
    cg(p) { return clamp(Math.round(+p.col || 0), 0, this.totalCeldas() - 1); }   // la columna de un punto
    columna(c) { return clamp(Math.round(+c || 0), 0, this.totalCeldas() - 1); }  // una columna que exista
    /* el acto que cubre una columna, o null si no está en ninguno */
    actoEn(c) { return this.datos.actos.find(a => c >= a.desde && c < a.desde + a.celdas) || null; }
    finActo(a) { return a.desde + a.celdas; }
    _ordenarActos() { this.datos.actos.sort((a, b) => a.desde - b.desde); }

    /* ---------- ids ---------- */
    _nid(prefijo) {
      const d = this.datos; let n = 0;
      [d.actos, d.lineas, d.puntos, d.saltos, d.notas].forEach(col => col.forEach(x => {
        const m = /(\d+)$/.exec(x.id); if (m) n = Math.max(n, +m[1]);
      }));
      return prefijo + (n + 1);
    }

    /* ====================================================================
       Puntos
       ==================================================================== */
    /* El nodo que ocupa una celda de una trama (sin contar los que se indiquen). Una celda es de un
       solo nodo: ni al crear ni al mover se ponen unos sobre otros. */
    ocupante(lineaId, col, salvo) {
      const fuera = new Set(salvo || []);
      return this.datos.puntos.find(q => q.lineaId === lineaId && q.col === col && !fuera.has(q.id)) || null;
    }

    /* un nodo nuevo en la columna `col` de una trama */
    nuevoPunto(lineaId, col, props) {
      const l = this.linea(lineaId); if (!l) return no('Esa trama no existe');
      const p = Object.assign({
        id: this._nid('p'), lineaId, col: this.columna(col),
        titulo: '', descripcion: '', color: null, cortado: false      // sin nombre propuesto (1.1.42): sin texto no se guarda
      }, props || {});
      const ocupada = this.ocupante(lineaId, p.col);
      if (ocupada) return no(`Ahí ya está «${ocupada.titulo || 'un nodo'}»: elige una celda libre`);
      this.datos.puntos.push(p);
      this._reanclarNotas(p);
      return si({ punto: p });
    }

    /* Mueve un nodo de celda y, si se pide, de trama. Los socios de salto lo siguen (misma celda).
       Ni el nodo ni su pareja pueden caer sobre otro nodo: necesitan la celda libre, salvo con
       `op.intercambiar` (el tablero al soltar un nodo encima de otro, Leo 15-09-2026): si lo que hay es un
       solo nodo, los dos se cambian de lugar (`intercambiarPuntos`). */
    moverPunto(id, destino, op) {
      const p = this.punto(id); if (!p) return no('Ese nodo no existe');
      const nueva = destino.lineaId || p.lineaId;
      const pareja = this.parejaDe(p.id);
      const cambio = this._puedeCambiarTrama(p, nueva); if (!cambio.ok) return cambio;
      const col = this.columna(destino.col);
      const salvo = [p.id].concat(pareja ? [pareja.id] : []);
      const ocupada = this.ocupante(nueva, col, salvo) || (pareja && this.ocupante(pareja.lineaId, col, salvo));
      if (ocupada && op && op.intercambiar) {
        const otra = pareja && this.ocupante(pareja.lineaId, col, salvo);
        const enMia = this.ocupante(nueva, col, salvo);
        if (enMia && otra && enMia !== otra) return no(`Ahí ya están «${enMia.titulo || 'un nodo'}» y «${otra.titulo || 'un nodo'}»: no se puede intercambiar con los dos`);
        /* el que cae encima de otro es el nodo arrastrado, o su pareja si lo que hay está en la trama de la pareja */
        return enMia ? this.intercambiarPuntos(p.id, enMia.id, nueva) : this.intercambiarPuntos(pareja.id, otra.id);
      }
      if (ocupada) return no(`Ahí ya está «${ocupada.titulo || 'un nodo'}»: necesita una celda libre`);
      p.col = col;
      this._sincronizarSalto(p);
      const cambioTrama = nueva !== p.lineaId;
      if (cambioTrama) p.lineaId = nueva;
      /* **Las notas de enlace se recolocan** (1.1.48): si el nodo se metió en medio del tramo de una nota, esa nota pasa a ir
         de su nodo a este (como cuando se crea uno ahí); y si el que se fue —a otra celda o a otra trama— era uno de sus
         extremos, la nota se queda en su tramo con el nodo que siga, o colgada del que no se movió. Antes se quedaba entre
         dos nodos que ya no eran consecutivos y, si eran de tramas distintas, **se perdía al guardar y volver a abrir**
         (`normalizar` descarta una nota cuyos extremos no comparten trama). */
      this._repararNotas(p.id);
      return si({ punto: p, cambioTrama });
    }

    /* ¿Puede el nodo pasar a la trama `nueva`? Un extremo de salto no termina en la trama de su pareja y un cuadro no llega a
       una alternativa. */
    _puedeCambiarTrama(p, nueva) {
      if (nueva === p.lineaId) return si({});
      const l = this.linea(nueva); if (!l) return no('Esa trama no existe');
      const pareja = this.parejaDe(p.id);
      if (pareja && pareja.lineaId === nueva)
        return no('Un cambio de escena no puede terminar en la misma trama de la que sale');
      if (pareja && this.formaDe(p.id) === 'cuadro' && l.tipo === 'alterna')
        return no('Un cuadro no llega a una trama alternativa. Para eso está el rombo.');
      return si({});
    }

    /* Intercambia el lugar de dos nodos (Leo, 15-09-2026: arrastrar un nodo encima de otro): cada uno pasa a la celda y a la
       trama del otro. Un extremo de salto se lleva a su pareja a la misma celda (su pareja se queda en su trama). Si al
       cambiarse algo caería sobre un tercer nodo, o un salto quedaría mal (en la trama de su pareja, un cuadro en una
       alternativa), no se hace. `lineaP`: la trama a la que va `idP` (de partida, la de `idQ`). */
    intercambiarPuntos(idP, idQ, lineaP) {
      const P = this.punto(idP), Q = this.punto(idQ);
      if (!P || !Q) return no('Ese nodo no existe');
      if (P === Q) return si({ punto: P, intercambio: null });
      const Pp = this.parejaDe(P.id), Qp = this.parejaDe(Q.id);
      if (Pp === Q) return no('Son los dos extremos del mismo salto');
      const destP = { lineaId: lineaP || Q.lineaId, col: Q.col };
      const destQ = { lineaId: destP.lineaId === Q.lineaId ? P.lineaId : Q.lineaId, col: P.col };
      const cP = this._puedeCambiarTrama(P, destP.lineaId); if (!cP.ok) return cP;
      const cQ = this._puedeCambiarTrama(Q, destQ.lineaId); if (!cQ.ok) return cQ;
      /* dónde queda cada uno de los que se mueven; nadie puede caer sobre un nodo que no se mueve, ni dos en la misma celda */
      const mueven = [[P, destP], [Q, destQ]];
      if (Pp) mueven.push([Pp, { lineaId: Pp.lineaId, col: destP.col }]);
      if (Qp) mueven.push([Qp, { lineaId: Qp.lineaId, col: destQ.col }]);
      const ids = mueven.map(([x]) => x.id), vistas = new Set();
      for (const [x, d] of mueven) {
        const clave = d.lineaId + '|' + d.col;
        const tercero = this.ocupante(d.lineaId, d.col, ids);
        if (tercero || vistas.has(clave)) return no(`No caben: «${x.titulo || 'un nodo'}» caería sobre ${tercero ? '«' + (tercero.titulo || 'un nodo') + '»' : 'otro nodo'}`);
        vistas.add(clave);
      }
      mueven.forEach(([x, d]) => { x.lineaId = d.lineaId; x.col = d.col; });
      /* **las notas de un nodo se van con él** (Leo, 16-09-2026: «si una nota está relacionada a un nodo, al mover el nodo se
         debe mover con todo y sus notas»); las de un enlace se quedan en su tramo: la que iba de P a otro nodo va ahora del
         que ocupa el lugar de P (Q), y al revés */
      const cambia = id => id === P.id ? Q.id : id === Q.id ? P.id : id;
      this.datos.notas.forEach(n => {
        if (!n.aId) return;
        if (![n.deId, n.aId].some(id => id === P.id || id === Q.id)) return;
        n.deId = cambia(n.deId); if (n.aId) n.aId = cambia(n.aId);
        const de = this.punto(n.deId), a = n.aId && this.punto(n.aId);
        if (de && a && this.cg(de) > this.cg(a)) [n.deId, n.aId] = [n.aId, n.deId];
      });
      this._repararNotas();                                     // y lo que se moviera con ellos (la pareja de un salto) no deja notas a medias
      return si({ punto: P, cambioTrama: false, intercambio: Q, aviso: `«${P.titulo || 'Nodo'}» y «${Q.titulo || 'Nodo'}» intercambiaron su lugar` });
    }

    /* Mueve un bloque de nodos (Leo, 15-09-2026: seleccionarlos arrastrando el cursor y llevarlos a otro sitio) `dc` celdas
       en el tiempo y `dl` tramas hacia abajo (negativo: arriba). Los extremos de un salto van siempre juntos: si se elige uno,
       entra su pareja. Si faltan tramas por abajo se añaden secundarias; si faltan columnas al final, nacen. Si el bloque cae sobre otros nodos, se abre sitio en el tiempo: todo lo que no va en
       el bloque desde su primera celda de destino se corre a la derecha el ancho del bloque, en todas las tramas (así los
       saltos y el orden de la historia se conservan). Las notas que quedan fuera de un tramo válido se recolocan. */
    moverBloque(ids, dc, dl) {
      const set = new Set((ids || []).filter(id => this.punto(id)));
      [...set].forEach(id => { const q = this.parejaDe(id); if (q) set.add(q.id); });
      if (!set.size) return no('No hay nada elegido');
      dc = Math.round(+dc || 0); dl = Math.round(+dl || 0);
      if (!dc && !dl) return si({ movidos: 0 });
      const lineas = this.datos.lineas, fila = id => lineas.findIndex(l => l.id === id);
      const bloque = [...set].map(id => this.punto(id));
      const destino = new Map(bloque.map(p => [p.id, { fila: fila(p.lineaId) + dl, cg: this.cg(p) + dc }]));
      const filas = [...destino.values()].map(x => x.fila), celdas = [...destino.values()].map(x => x.cg);
      if (Math.min(...filas) < 0) return no('No hay más ' + this.nombre('linea').toLowerCase() + 's por arriba');
      if (Math.min(...celdas) < 0) return no('El bloque no cabe antes del principio');
      const nuevas = Math.max(0, Math.max(...filas) - (lineas.length - 1));
      const tipoFila = i => i < lineas.length ? lineas[i].tipo : 'secundaria';
      for (const sa of this.datos.saltos) {
        if (!set.has(sa.deId) || sa.tipo !== 'cuadro') continue;
        if ([sa.deId, sa.aId].some(id => tipoFila(destino.get(id).fila) === 'alterna'))
          return no('Un cuadro no llega a una trama alternativa. Para eso está el rombo.');
      }
      /* ¿choca con algo que no va en el bloque? entonces se abre sitio desde la primera celda de destino */
      const otros = this.datos.puntos.filter(p => !set.has(p.id)), cgOtro = new Map(otros.map(p => [p.id, this.cg(p)]));
      const ocupadas = new Set([...destino.values()].map(x => x.fila + '|' + x.cg));
      const choca = otros.some(p => ocupadas.has(fila(p.lineaId) + '|' + cgOtro.get(p.id)));
      const desde = Math.min(...celdas), ancho = Math.max(...celdas) - desde + 1;
      const final = new Map(otros.map(p => [p.id, cgOtro.get(p.id) + (choca && cgOtro.get(p.id) >= desde ? ancho : 0)]));
      const ultima = Math.max(...celdas, ...final.values());
      /* hacer sitio: tramas y celdas */
      const creadas = [];
      for (let i = 0; i < nuevas; i++) creadas.push(this.nuevaLinea('secundaria').linea);
      this.asegurarCeldas(ultima);
      const colocar = (p, c) => { p.col = c; };
      otros.forEach(p => colocar(p, final.get(p.id)));
      bloque.forEach(p => { const d = destino.get(p.id); p.lineaId = lineas[d.fila].id; colocar(p, d.cg); });
      this._repararNotas();
      return si({ movidos: bloque.length, desplazados: choca ? otros.filter(p => cgOtro.get(p.id) >= desde).length : 0, tramasNuevas: creadas.length,
        aviso: `${bloque.length} ${bloque.length === 1 ? 'nodo movido' : 'nodos movidos'}` + (choca ? ' · lo que había se corrió a la derecha' : '')
          + (creadas.length ? ` · ${creadas.length} ${creadas.length === 1 ? 'trama nueva' : 'tramas nuevas'}` : '') });
    }

    /* Que exista la columna `ultima`: nacen las que falten al final (los actos no cambian). */
    /* **Filas y columnas con su propio tamaño** (1.1.41, Leo: «quiero poder hacer más largas las filas y columnas del esquema, de
       manera individual… debe poder restablecerse el tamaño de todas las filas y columnas que se hayan modificado»). Se guarda un
       **factor** sobre el tamaño de la vista —`linea.alto` y `datos.anchos[columna]`—, así que cambiar las escalas los respeta.
       `anchoCol(c)` y `altoLinea(id)` valen 1 cuando no se han tocado. */
    anchoCol(c) { const f = this.datos.anchos && this.datos.anchos[this.columna(c)]; return f > 0 ? f : 1; }
    altoLinea(id) { const l = this.linea(id); return l && l.alto > 0 ? l.alto : 1; }
    fijarAnchoCol(c, factor) {
      const col = this.columna(c); if (!Number.isFinite(col)) return no('Esa columna no existe');
      const f = clamp(+factor || 1, 0.3, 8);
      if (!this.datos.anchos) this.datos.anchos = {};
      if (Math.abs(f - 1) < 0.01) delete this.datos.anchos[col]; else this.datos.anchos[col] = Math.round(f * 100) / 100;
      return si({ columna: col, ancho: this.anchoCol(col) });
    }
    fijarAltoLinea(id, factor) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      const f = clamp(+factor || 1, 0.5, 8);
      if (Math.abs(f - 1) < 0.01) delete l.alto; else l.alto = Math.round(f * 100) / 100;
      return si({ linea: l, alto: this.altoLinea(l.id) });
    }
    /* cuántas filas y columnas se han tocado a mano (para encender el botón de restablecer) */
    tamanosPropios() {
      const cols = Object.keys(this.datos.anchos || {}).length;
      const filas = this.datos.lineas.filter(l => l.alto > 0 && Math.abs(l.alto - 1) > 0.01).length;
      return { cols, filas, total: cols + filas };
    }
    restablecerTamanos() {
      const antes = this.tamanosPropios().total;
      this.datos.anchos = {};
      this.datos.lineas.forEach(l => { delete l.alto; });
      return si({ restablecidos: antes });
    }
    /* los anchos siguen a sus columnas cuando se insertan, se borran o se mueven */
    _mapearAnchos(fn) {
      const viejo = this.datos.anchos || {}, nuevo = {};
      Object.keys(viejo).forEach(k => { const c = fn(+k); if (c !== null && c !== undefined && c >= 0) nuevo[c] = viejo[k]; });
      this.datos.anchos = nuevo;
    }

    asegurarCeldas(ultima) {
      const n = Math.round(+ultima) + 1;
      if (Number.isFinite(n) && n > this.datos.columnas) this.datos.columnas = n;
      return si({});
    }

    /* ====================================================================
       Columnas (las celdas de la cuadrícula, a lo ancho de todas las tramas)
       Leo, 16-09-2026: «como en Excel web»: insertar a la izquierda o a la derecha, varias de una vez, y
       eliminar las elegidas. Insertar dentro de un acto lo alarga (los de detrás se corren) y eliminar las de un
       acto lo acorta; un acto que se queda sin columnas desaparece.
       ==================================================================== */
    /* Mete `cuantas` columnas vacías junto a la columna global `cg` (`lado`: 'izquierda' por defecto o
       'derecha'). Lo que había desde ahí se corre a la derecha, en todas las tramas a la vez. */
    insertarColumnas(cg, cuantas, lado) {
      const total = this.totalCeldas();
      cg = clamp(Math.round(+cg || 0), 0, total - 1);
      const n = clamp(Math.round(+cuantas || 1), 1, 999);
      const desde = cg + (lado === 'derecha' ? 1 : 0), suyo = this.actoEn(cg);
      this.datos.puntos.forEach(p => { if (p.col >= desde) p.col += n; });
      this.datos.notas.forEach(x => { if (x.abierta && x.col >= desde) x.col += n; });   // las de una raya, igual
      this.datos.actos.forEach(a => { if (a === suyo) a.celdas += n; else if (a.desde >= desde) a.desde += n; });
      this._mapearAnchos(c => (c >= desde ? c + n : c));
      this.datos.columnas += n;
      return si({ insertadas: n, desde, aviso: (n === 1 ? '1 columna nueva' : n + ' columnas nuevas') + (suyo ? ` en «${suyo.nombre}»` : '') });
    }

    /* Qué se llevaría eliminar esas columnas: además de los nodos (como `resumenBorrado`), cuántos actos
       se quedarían sin ninguna. */
    resumenColumnas(cgs) {
      const cs = this._columnas(cgs), set = new Set(cs);
      const ids = this.datos.puntos.filter(p => set.has(this.cg(p))).map(p => p.id);
      const r = this.resumenBorrado(ids);
      const actos = this.datos.actos.filter(a => cs.filter(c => c >= a.desde && c < a.desde + a.celdas).length >= a.celdas);
      return Object.assign(r, { columnas: cs.length, actos: actos.length, nombresActos: actos.map(a => a.nombre) });
    }

    /* Elimina las columnas elegidas: sus nodos se van (con los saltos y las notas que los usaban) y lo que
       quedaba a la derecha se corre a la izquierda. */
    borrarColumnas(cgs) {
      const cs = this._columnas(cgs);
      if (!cs.length) return no('No hay columnas elegidas');
      if (cs.length >= this.totalCeldas()) return no('Tiene que quedar al menos una columna');
      const set = new Set(cs);
      const ids = this.datos.puntos.filter(p => set.has(this.cg(p))).map(p => p.id);
      const r = ids.length ? this.borrarPuntos(ids) : null;
      /* lo de detrás se corre tantas columnas como se quitaron antes de ello; una nota de una raya que se quita pasa a la de al lado */
      const antes = c => cs.filter(x => x < c).length;
      this.datos.puntos.forEach(p => { p.col -= antes(p.col); });
      this.datos.notas.forEach(x => { if (x.abierta) x.col = Math.max(0, x.col - antes(x.col)); });
      this.datos.actos.forEach(a => {
        const dentro = cs.filter(c => c >= a.desde && c < a.desde + a.celdas).length;
        a.desde -= antes(a.desde); a.celdas -= dentro;
      });
      const vacios = this.datos.actos.filter(a => a.celdas < 1);
      this.datos.actos = this.datos.actos.filter(a => a.celdas >= 1);
      this._mapearAnchos(c => (set.has(c) ? null : c - antes(c)));
      this.datos.columnas -= cs.length;
      this._repararNotas();
      const partes = [cs.length === 1 ? '1 columna eliminada' : cs.length + ' columnas eliminadas'];
      if (r && r.borrados) partes.push(r.borrados === 1 ? '1 elemento borrado' : r.borrados + ' elementos borrados');
      if (vacios.length) partes.push(vacios.length === 1 ? `«${vacios[0].nombre}» se quedó sin columnas` : `${vacios.length} ${this.nombre('acto').toLowerCase()}s se quedaron sin columnas`);
      return si({ columnas: cs.length, borrados: (r && r.borrados) || 0, actos: vacios.length, aviso: partes.join(' · ') });
    }

    /* Mueve las columnas elegidas `delta` posiciones (con lo que haya dentro), como se arrastra una columna en Excel:
       se sacan de la cuadrícula y se meten otra vez `delta` más allá, y lo demás conserva su orden. Si se eligieron
       columnas sueltas, quedan juntas en el destino. Los actos no se mueven: lo que cambia de sitio es el contenido
       (un nodo puede pasar de un acto a otro). */
    moverColumnas(cgs, delta) {
      const cs = this._columnas(cgs);
      if (!cs.length) return no('No hay columnas elegidas');
      delta = Math.round(+delta || 0);
      const total = this.totalCeldas();
      if (cs.length >= total) return no('No hay a dónde moverlas');
      const set = new Set(cs), resto = [];
      for (let c = 0; c < total; c++) if (!set.has(c)) resto.push(c);
      const inicio = clamp(cs[0] + delta, 0, resto.length);
      if (!delta || (inicio === cs[0] && cs[cs.length - 1] - cs[0] + 1 === cs.length)) return si({ movidas: 0 });
      const orden = [...resto.slice(0, inicio), ...cs, ...resto.slice(inicio)];
      const mapa = new Map(); orden.forEach((viejo, nuevo) => mapa.set(viejo, nuevo));
      const dest = new Map(this.datos.puntos.map(p => [p.id, mapa.get(this.cg(p))]));
      const destN = new Map(this.datos.notas.filter(x => x.abierta).map(x => [x.id, mapa.get(this.colNota(x))]));
      this.datos.puntos.forEach(p => { p.col = dest.get(p.id); });
      this.datos.notas.filter(x => x.abierta).forEach(x => { x.col = destN.get(x.id); });
      this._mapearAnchos(c => (mapa.has(c) ? mapa.get(c) : c));      // el ancho viaja con su columna
      this._repararNotas();
      return si({ movidas: cs.length, desde: inicio,
        aviso: (cs.length === 1 ? '1 columna movida' : cs.length + ' columnas movidas') + ' a la posición ' + (inicio + 1) });
    }

    /* Columnas globales válidas, sin repetir y de menor a mayor. */
    _columnas(cgs) {
      const total = this.totalCeldas();
      return [...new Set((cgs || []).map(c => Math.round(+c)))].filter(c => Number.isFinite(c) && c >= 0 && c < total).sort((x, y) => x - y);
    }

    /* Tras mover varios nodos: una nota cuyos extremos ya no son dos nodos consecutivos de la misma trama pasa al tramo que
       empieza (o, si no, acaba) en su primer extremo; si no hay ninguno libre, se queda en el que tenga libre el otro extremo, y
       si tampoco, se elimina (no se puede leer ni guardar). */
    /* `evitar`: el nodo que acaba de moverse. Una nota de enlace **se queda en su tramo**, no se va con él (Leo, 16-09-2026),
       así que al buscarle sitio se mira primero el extremo que no se movió. */
    _repararNotas(evitar) {
      const d = this.datos;
      const vecinos = p => { const l = this.puntosDe(p.lineaId), i = l.findIndex(x => x.id === p.id); return [l[i + 1], l[i - 1]].filter(Boolean); };
      d.notas = d.notas.filter(n => {
        if (n.abierta) {                                           // la de una raya: con su trama, y en una columna que exista
          if (!this.linea(n.lineaId)) return false;
          n.col = this.colNota(n);
          return true;
        }
        const a = this.punto(n.deId), b = n.aId && this.punto(n.aId);
        if (a && !n.aId) return true;                              // nota de un nodo: le basta con su nodo
        if (a && b && !this._tramoValido(n.deId, n.aId)) { if (this.cg(a) > this.cg(b)) [n.deId, n.aId] = [n.aId, n.deId]; return true; }
        const orden = [a, b].filter(Boolean);
        if (evitar && orden.length > 1 && orden[0].id === evitar) orden.reverse();
        for (const x of orden) {
          for (const v of vecinos(x)) {
            if (!this._tramoValido(x.id, v.id)) { [n.deId, n.aId] = this.cg(x) <= this.cg(v) ? [x.id, v.id] : [v.id, x.id]; return true; }
          }
          n.deId = x.id; n.aId = null; return true;                // sin tramo válido, se queda colgada de su nodo
        }
        return false;
      });
    }

    editarPunto(id, cambios) {
      const p = this.punto(id); if (!p) return no('Ese nodo no existe');
      if ('titulo' in cambios) p.titulo = String(cambios.titulo);
      if ('descripcion' in cambios) p.descripcion = String(cambios.descripcion);
      if ('color' in cambios) p.color = PALETA.some(c => c.id === cambios.color) ? cambios.color : null;
      return si({ punto: p });
    }

    /* **El color de un enlace** (Leo, 16-09-2026): el tramo que va de este nodo al siguiente de su trama. Vive en el nodo de
       salida (`colorEnlace`), así que sigue a ese nodo si se mueve; null vuelve al color de la trama. */
    colorearEnlace(deId, color) {
      const p = this.punto(deId); if (!p) return no('Ese enlace no existe');
      if (color && PALETA.some(c => c.id === color)) p.colorEnlace = color; else delete p.colorEnlace;
      return si({ punto: p });
    }
    /* El nodo que sigue a este en su trama (el otro extremo de su enlace), o null si es el último. */
    siguienteEnTrama(id) {
      const p = this.punto(id); if (!p) return null;
      const lista = this.puntosDe(p.lineaId), i = lista.indexOf(p);
      return i >= 0 ? lista[i + 1] || null : null;
    }

    descartarPunto(id, valor) {
      const p = this.punto(id); if (!p) return no('Ese nodo no existe');
      if (this.esExtremo(id)) return no('Un cambio de escena no se descarta: es estructura, no material');
      p.cortado = valor === undefined ? !p.cortado : !!valor;
      return si({ punto: p });
    }

    /* Si el nodo es extremo de un salto, se va con su pareja y con el salto. */
    borrarPunto(id) {
      if (!this.punto(id)) return no('Ese nodo no existe');
      const juntos = new Set([id]);
      this.datos.saltos.filter(s => s.deId === id || s.aId === id).forEach(s => { juntos.add(s.deId); juntos.add(s.aId); });
      this._quitarPuntos(juntos);
      return si({ aviso: juntos.size > 1 ? 'Salto eliminado' : 'Nodo eliminado' });
    }

    /* Borra varios nodos a la vez (Leo, 15-09-2026: borrado masivo de lo elegido): con los extremos de sus saltos, los saltos y
       las notas que los usaban. */
    borrarPuntos(ids) {
      const juntos = new Set((ids || []).filter(id => this.punto(id)));
      if (!juntos.size) return no('No hay nada elegido');
      const saltos = this.datos.saltos.filter(s => juntos.has(s.deId) || juntos.has(s.aId));
      saltos.forEach(s => { juntos.add(s.deId); juntos.add(s.aId); });
      this._quitarPuntos(juntos);
      return si({ borrados: juntos.size, saltos: saltos.length, aviso: juntos.size === 1 ? 'Nodo eliminado' : juntos.size + ' elementos eliminados' });
    }
    /* Qué se llevaría borrar esos nodos: nodos sueltos, saltos (cada uno con sus dos extremos) y notas. */
    resumenBorrado(ids) {
      const juntos = new Set((ids || []).filter(id => this.punto(id)));
      const saltos = this.datos.saltos.filter(s => juntos.has(s.deId) || juntos.has(s.aId));
      saltos.forEach(s => { juntos.add(s.deId); juntos.add(s.aId); });
      const enSalto = new Set(saltos.flatMap(s => [s.deId, s.aId]));
      return { nodos: [...juntos].filter(id => !enSalto.has(id)).length, saltos: saltos.length,
               notas: this.datos.notas.filter(n => !n.abierta && (juntos.has(n.deId) || (n.aId && juntos.has(n.aId)))).length, total: juntos.size };
    }

    _quitarPuntos(ids) {
      const d = this.datos;
      d.saltos = d.saltos.filter(s => !ids.has(s.deId) && !ids.has(s.aId));
      d.notas = d.notas.filter(n => n.abierta || (!ids.has(n.deId) && !(n.aId && ids.has(n.aId))));
      d.puntos = d.puntos.filter(p => !ids.has(p.id));
    }

    /* Un nodo nuevo que parte el tramo de una nota: la nota se queda con la primera mitad. */
    _reanclarNotas(p) {
      const c = this.cg(p);
      this.datos.notas.forEach(nt => {
        const a = this.punto(nt.deId), b = nt.aId && this.punto(nt.aId);
        if (!a || !b || a.lineaId !== p.lineaId || b.lineaId !== p.lineaId) return;
        const ca = this.cg(a), cb = this.cg(b);
        if (c > Math.min(ca, cb) && c < Math.max(ca, cb)) { nt.deId = (ca < cb ? a : b).id; nt.aId = p.id; }
      });
    }

    /* Los dos extremos de un salto ocupan siempre la misma celda global. */
    _sincronizarSalto(p) {
      const q = this.parejaDe(p.id);
      if (q) q.col = p.col;
    }

    /* ====================================================================
       Tramas
       ==================================================================== */
    nuevaLinea(tipo) {
      tipo = TIPOS.includes(tipo) ? tipo : 'secundaria';     // también principal: caben las que sean (Leo, 18-09-2026)
      const usados = this.datos.lineas.map(l => l.color);
      const libre = ORDEN_NUEVAS.find(c => !usados.includes(c)) || ORDEN_NUEVAS[this.datos.lineas.length % ORDEN_NUEVAS.length];
      const l = { id: this._nid('l'), nombre: ((this.nombres && this.nombres.linea) || 'Trama') + ' ' + (this.datos.lineas.length + 1), tipo, color: libre, cortada: false };
      this.datos.lineas.push(l);
      return si({ linea: l });
    }

    editarLinea(id, cambios) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if ('nombre' in cambios) l.nombre = String(cambios.nombre);
      if ('color' in cambios && PALETA.some(c => c.id === cambios.color)) l.color = cambios.color;
      if ('personaje' in cambios) { if (cambios.personaje) l.personaje = String(cambios.personaje); else delete l.personaje; }
      return si({ linea: l });
    }

    /* Cualquier trama puede ser principal, secundaria o alternativa (Leo, 18-09-2026: caben varias principales), mientras
       quede al menos una principal. */
    fijarTipo(id, tipo) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if (l.tipo === tipo) return si({ linea: l });
      if (!TIPOS.includes(tipo)) return no('Tipo desconocido');
      if (this.ultimaPrincipal(id)) return no('Tiene que quedar al menos una trama principal');
      let cambiados = 0;
      if (tipo === 'alterna') {
        const suyos = new Set(this.datos.puntos.filter(p => p.lineaId === id).map(p => p.id));
        this.datos.saltos.forEach(s => {
          if ((suyos.has(s.deId) || suyos.has(s.aId)) && s.tipo !== 'rombo') { s.tipo = 'rombo'; cambiados++; }
        });
      }
      l.tipo = tipo;
      return si({ linea: l, aviso: cambiados ? `${cambiados} cambio(s) de escena pasaron a rombo` : undefined });
    }

    /* **Ocultar una trama** (1.1.40, Leo: «que se puedan ocultar tramas, como cuando se ocultan filas de Excel; no las elimina,
       solo las oculta… se ocultan con todo y sus elementos»): `linea.oculta`. No se borra nada —sus nodos, saltos y notas siguen
       en el modelo— y tiene que quedar siempre una a la vista. Solo el esquema las devuelve (`mostrarLinea`). */
    ocultarLinea(id, valor) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      const v = valor === undefined ? !l.oculta : !!valor;
      if (v && this.lineasVisibles().length <= 1) return no('Tiene que quedar una trama a la vista');
      if (v) l.oculta = true; else delete l.oculta;
      return si({ linea: l, oculta: v });
    }
    mostrarLinea(id) { return this.ocultarLinea(id, false); }
    mostrarTodasLasLineas() { this.datos.lineas.forEach(l => { delete l.oculta; }); return si({}); }
    lineasVisibles() { return this.datos.lineas.filter(l => !l.oculta); }

    descartarLinea(id, valor) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      l.cortada = valor === undefined ? !l.cortada : !!valor;
      return si({ linea: l });
    }

    /* Cambia el orden de las tramas (Leo, 15-09-2026: reordenarlas arrastrando): la trama pasa a la posición `indice` (0 arriba).
       Nada más cambia: los saltos siguen yendo de su trama de salida a la de llegada, así que la flecha que sube o baja se dibuja
       según el nuevo orden. */
    moverLinea(id, indice) {
      const ls = this.datos.lineas, i = ls.findIndex(l => l.id === id);
      if (i < 0) return no('Esa trama no existe');
      const j = clamp(Math.round(+indice || 0), 0, ls.length - 1);
      if (i === j) return si({ linea: ls[i], movida: false });
      const [l] = ls.splice(i, 1); ls.splice(j, 0, l);
      return si({ linea: l, movida: true });
    }

    borrarLinea(id) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if (this.datos.lineas.length <= 1) return no('Tiene que quedar al menos una trama');
      if (this.ultimaPrincipal(id)) return no('Tiene que quedar al menos una trama principal');
      this._quitarPuntos(new Set(this.datos.puntos.filter(p => p.lineaId === id).map(p => p.id)));
      this.datos.lineas = this.datos.lineas.filter(x => x.id !== id);
      this.datos.notas = this.datos.notas.filter(n => !(n.abierta && n.lineaId === id));
      /* **siempre queda una a la vista** (1.1.48): con las demás ocultas, borrar la única visible dejaba el esquema sin
         ninguna fila —solo la franja de ocultas— hasta volver a abrir el proyecto (`normalizar` sí lo arreglaba) */
      if (!this.lineasVisibles().length) delete this.datos.lineas[0].oculta;
      return si({ aviso: 'Trama eliminada' });
    }

    /* ====================================================================
       Actos
       ==================================================================== */
    /* `nombres` (opcional) cambia cómo se llaman las piezas: en Personajes de ClapCraft, «Momento»,
       «Personaje», «Evento» (nodo) y «Relación» (cuadro) */
    nombre(pieza) { return (this.nombres && this.nombres[pieza]) || { acto: 'Acto', linea: 'Trama', punto: 'Punto nuevo', nodo: 'Nodo' }[pieza]; }
    forma(tipo) { return (this.nombres && this.nombres[tipo]) || FORMA[tipo]; }
    /* concordancia: «Relación eliminada», «esta relación» (`nombres.femeninos`: las piezas en femenino) */
    femenino(tipo) { return !!(this.nombres && (this.nombres.femeninos || []).includes(tipo)); }
    /* Un acto nuevo empieza donde acaba el último (o en la primera columna, si no hay ninguno); si no cabe, nacen columnas. */
    nuevoActo() {
      const fin = this.datos.actos.reduce((m, x) => Math.max(m, x.desde + x.celdas), 0);
      const a = { id: this._nid('a'), nombre: ((this.nombres && this.nombres.acto) || 'Acto') + ' ' + romano(this.datos.actos.length + 1), desde: fin, celdas: ANCHO_ACTO, fondo: null };
      this.datos.actos.push(a); this._ordenarActos();
      this.asegurarCeldas(a.desde + a.celdas - 1);
      return si({ acto: a });
    }

    editarActo(id, cambios) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      if ('nombre' in cambios) a.nombre = String(cambios.nombre);
      if ('fondo' in cambios) a.fondo = FONDOS.some(f => f.id === cambios.fondo) ? cambios.fondo : null;
      return si({ acto: a });
    }

    /* **Lo que dura un acto** (Leo, 18-09-2026: «que pueda mover los actos sin que se muevan las líneas, para poder definir qué
       tan largo es un acto solamente»): mover su borde derecho cambia dónde acaba y nada más —ni columnas ni nodos—. Si el
       siguiente empieza justo ahí, el borde es de los dos y se reparten el sitio; si no, el acto no pasa del siguiente. Pasado
       el final del tablero, nacen columnas. `fin` es la columna donde ya no llega. */
    moverBorde(id, fin) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      const sig = this.datos.actos[this.datos.actos.indexOf(a) + 1];
      const pegado = !!sig && sig.desde === a.desde + a.celdas;
      const tope = sig ? (pegado ? sig.desde + sig.celdas - MIN_CELDAS : sig.desde) : Infinity;
      const f = clamp(Math.round(+fin || 0), a.desde + MIN_CELDAS, tope);
      if (f === a.desde + a.celdas) return si({ acto: a, cambio: false });
      if (pegado) { const finSig = sig.desde + sig.celdas; sig.desde = f; sig.celdas = finSig - f; }
      a.celdas = f - a.desde;
      this.asegurarCeldas(f - 1);
      return si({ acto: a, cambio: true });
    }
    /* el ancho más grande que puede tener (el panel del acto): hasta el siguiente o, pegado a él, hasta dejarle una columna */
    anchoMaximo(id) {
      const a = this.acto(id); if (!a) return MIN_CELDAS;
      const sig = this.datos.actos[this.datos.actos.indexOf(a) + 1];
      if (!sig) return Math.max(MAX_CELDAS, a.celdas + 20);
      return (sig.desde === a.desde + a.celdas ? sig.desde + sig.celdas - MIN_CELDAS : sig.desde) - a.desde;
    }
    fijarAncho(id, celdas) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      return this.moverBorde(id, a.desde + Math.round(+celdas || MIN_CELDAS));
    }
    crecerActo(id) { const a = this.acto(id); if (!a) return no('Ese acto no existe'); const r = this.moverBorde(id, a.desde + a.celdas + 1); return r.ok && !r.cambio ? no('No cabe más: ahí empieza el siguiente') : r; }
    encogerActo(id) { const a = this.acto(id); if (!a) return no('Ese acto no existe'); const r = this.moverBorde(id, a.desde + a.celdas - 1); return r.ok && !r.cambio ? no('No se puede comprimir más') : r; }
    /* **Mover un acto entero** por las columnas, con su largo (Leo, 18-09-2026): no pasa por encima de sus vecinos; pasado el final
       del tablero nacen columnas. Los nodos no se mueven: cambia de qué acto son. */
    moverActo(id, desde) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      const i = this.datos.actos.indexOf(a), ant = this.datos.actos[i - 1], sig = this.datos.actos[i + 1];
      const min = ant ? ant.desde + ant.celdas : 0, max = sig ? sig.desde - a.celdas : Infinity;
      const d = clamp(Math.round(+desde || 0), min, Math.max(min, max));
      if (d === a.desde) return si({ acto: a, movido: false });
      a.desde = d;
      this.asegurarCeldas(a.desde + a.celdas - 1);
      return si({ acto: a, movido: true });
    }

    /* ====================================================================
       Copiar, pegar y duplicar (Leo, 17-09-2026: «copiar y pegar nodos y notas… duplicarlos… con contenido y color»)
       ==================================================================== */
    /* Lo que se lleva copiar unos nodos: cada uno con su contenido y su color y dónde está respecto al primero (columnas y
       tramas), los saltos cuyos dos extremos van (un extremo suelto se lleva a su pareja, como al mover un bloque) y las notas
       que cuelgan solo de ellos (de nodo, o de un enlace entre dos que van). Sin identificadores del tablero: vale en otro. */
    copiar(ids) {
      const set = new Set((ids || []).filter(id => this.punto(id)));
      if (!set.size) return null;
      this.datos.saltos.forEach(sa => { if (set.has(sa.deId) || set.has(sa.aId)) { set.add(sa.deId); set.add(sa.aId); } });
      const orden = this.datos.lineas.map(l => l.id), pts = this.datos.puntos.filter(p => set.has(p.id));
      /* las notas de las rayas (sin enlace) que van con lo elegido (Leo, 18-09-2026: «no copia las de enlace»): las que quedan
         entre dos nodos elegidos de la misma trama y, si el último (o el primero) de la trama va, las de detrás (o delante) */
      const abiertas = this.datos.notas.filter(n => {
        if (!n.abierta) return false;
        const props = this.puntosDe(n.lineaId), c = this.colNota(n);
        const antes = props.filter(p => this.cg(p) <= c).pop(), despues = props.find(p => this.cg(p) > c);
        return antes && despues ? set.has(antes.id) && set.has(despues.id) : !!((antes && set.has(antes.id)) || (despues && set.has(despues.id)));
      });
      const c0 = Math.min(...pts.map(p => this.cg(p)), ...abiertas.map(n => this.colNota(n))), f0 = Math.min(...pts.map(p => orden.indexOf(p.lineaId)));
      return {
        tipo: 'puntos', c0, f0,
        puntos: pts.map(p => ({ ref: p.id, dc: this.cg(p) - c0, df: orden.indexOf(p.lineaId) - f0, titulo: p.titulo, descripcion: p.descripcion,
          color: p.color || null, cortado: !!p.cortado, ...(p.colorEnlace ? { colorEnlace: p.colorEnlace } : {}) })),
        saltos: this.datos.saltos.filter(sa => set.has(sa.deId) && set.has(sa.aId)).map(sa => ({ de: sa.deId, a: sa.aId, tipo: sa.tipo })),
        notas: this.datos.notas.filter(n => !n.abierta && set.has(n.deId) && (!n.aId || set.has(n.aId)))
          .map(n => ({ de: n.deId, a: n.aId || null, texto: n.texto, ...(n.color ? { color: n.color } : {}) }))
          .concat(abiertas.map(n => ({ abierta: true, dc: this.colNota(n) - c0, df: orden.indexOf(n.lineaId) - f0, texto: n.texto, ...(n.color ? { color: n.color } : {}) })))
      };
    }
    /* Pega lo copiado con su primer nodo en la columna `c0` y la trama número `f0` (por abajo nacen las tramas que falten y por
       la derecha las columnas). Si algo caería sobre otro nodo, todo se corre a la derecha hasta el primer sitio libre. */
    pegar(clip, c0, f0) {
      if (!clip || clip.tipo !== 'puntos' || !clip.puntos.length) return no('No hay nada que pegar');
      c0 = Math.max(0, Math.round(c0)); f0 = Math.max(0, Math.round(f0));
      const L = this.datos.lineas;
      while (L.length <= f0 + Math.max(...clip.puntos.map(x => x.df))) this.nuevaLinea('secundaria');
      const lineaDe = x => L[f0 + x.df].id;
      /* lo pegado no se mete entre nodos que ya hay: en cada trama, de su primer nodo al último, el sitio tiene que estar libre
         (si no, un enlace pegado quedaba cortado por otro nodo y su nota pasaba a ser de nodo; antes solo se miraban sus celdas) */
      const tramos = new Map();
      clip.puntos.forEach(x => { const t = tramos.get(x.df) || [Infinity, -Infinity]; tramos.set(x.df, [Math.min(t[0], x.dc), Math.max(t[1], x.dc)]); });
      const colsDe = new Map([...tramos.keys()].map(df => [df, this.datos.puntos.filter(p => p.lineaId === L[f0 + df].id).map(p => this.cg(p))]));
      const choca = dx => [...tramos].some(([df, [a, b]]) => colsDe.get(df).some(c => c >= c0 + a + dx && c <= c0 + b + dx));
      let dx = 0;
      while (choca(dx) && dx < 2000) dx++;
      const ancho = Math.max(...clip.puntos.map(x => x.dc), ...clip.notas.filter(n => n.abierta).map(n => n.dc));
      this.asegurarCeldas(c0 + ancho + dx);
      const mapa = new Map(), extremosA = new Set(clip.saltos.map(sa => sa.a));
      const vestir = (p, x) => { Object.assign(p, { titulo: x.titulo, descripcion: x.descripcion, color: x.color, cortado: x.cortado }); if (x.colorEnlace) p.colorEnlace = x.colorEnlace; };
      const poner = x => {
        const r = this.nuevoPunto(lineaDe(x), c0 + x.dc + dx);
        if (r.ok) { vestir(r.punto, x); mapa.set(x.ref, r.punto.id); }
      };
      clip.puntos.filter(x => !extremosA.has(x.ref)).forEach(poner);
      clip.saltos.forEach(sa => {
        const de = mapa.get(sa.de), xa = clip.puntos.find(x => x.ref === sa.a); if (!xa) return;
        const r = de ? this.crearSalto(de, lineaDe(xa), sa.tipo) : no('');
        if (r.ok) { const b = this.punto(r.salto.aId); vestir(b, xa); b.cortado = false; this.punto(de).cortado = false; mapa.set(sa.a, b.id); }
        else poner(xa);                                              // si el salto no cabe ahí, su extremo va como nodo suelto
      });
      const notas = [];
      clip.notas.forEach(n => {
        if (n.abierta) {                                             // la de una raya, en su sitio respecto a lo pegado
          while (L.length <= f0 + n.df) this.nuevaLinea('secundaria');
          const r = this.crearNotaAbierta(L[f0 + n.df].id, c0 + n.dc + dx, n.texto);
          if (r.ok) { if (n.color) r.nota.color = n.color; notas.push(r.nota.id); }
          return;
        }
        const de = mapa.get(n.de), a = n.a ? mapa.get(n.a) : null; if (!de) return;
        let r = this.crearNota(de, a, n.texto); if (!r.ok && a) r = this.crearNota(de, null, n.texto);
        if (r.ok) { if (n.color) r.nota.color = n.color; notas.push(r.nota.id); }
      });
      const ids = [...mapa.values()];
      this._repararNotas();                                     // un nodo pegado en medio del tramo de una nota la recoloca (1.1.48)
      return si({ ids, notas, aviso: ids.length === 1 ? '1 nodo pegado' : ids.length + ' nodos pegados' });
    }
    /* Copiar notas: su texto, su color y dónde estaban (por si se pegan sin elegir otro sitio). */
    copiarNotas(ids) {
      const ns = this.datos.notas.filter(n => (ids || []).includes(n.id));
      if (!ns.length) return null;
      return { tipo: 'notas', notas: ns.map(n => ({ texto: n.texto, ...(n.color ? { color: n.color } : {}),
        sitio: n.abierta ? { abierta: true, lineaId: n.lineaId, cg: this.colNota(n) } : { deId: n.deId, aId: n.aId || null } })) };
    }
    /* Pega las notas en `destino` —un nodo `{ deId }`, un enlace `{ deId, aId }` o una raya `{ lineaId, cg }`— o, sin él, donde
       estaban las copiadas (si ese sitio ya no existe, se saltan). */
    pegarNotas(clip, destino) {
      if (!clip || clip.tipo !== 'notas') return no('No hay notas que pegar');
      const ids = [];
      clip.notas.forEach(n => {
        const d = destino || n.sitio;
        const r = d.abierta || (d.lineaId && d.cg !== undefined) ? this.crearNotaAbierta(d.lineaId, d.cg, n.texto) : this.crearNota(d.deId, d.aId || null, n.texto);
        if (r.ok) { if (n.color) r.nota.color = n.color; ids.push(r.nota.id); }
      });
      if (!ids.length) return no('Ahí no se pueden pegar');
      return si({ ids, aviso: ids.length === 1 ? '1 nota pegada' : ids.length + ' notas pegadas' });
    }

    /* Quitar un acto no toca nada más: sus columnas, con lo que tengan, se quedan (Leo, 18-09-2026). Puede no quedar ninguno. */
    borrarActo(id) {
      const actos = this.datos.actos, i = actos.findIndex(a => a.id === id);
      if (i < 0) return no('Ese acto no existe');
      actos.splice(i, 1);
      return si({ aviso: this.nombre('acto') + ' eliminado · sus columnas se quedan' });
    }

    /* ====================================================================
       Saltos
       ==================================================================== */
    /* Crea el salto desde un nodo hacia otra trama. Si en la celda de destino ya hay un nodo, lo
       reutiliza; si no, crea el extremo de llegada. La forma se elige sola si no se indica. */
    crearSalto(deId, lineaDestino, tipo) {
      const a = this.punto(deId); if (!a) return no('Ese nodo no existe');
      const destino = this.linea(lineaDestino); if (!destino) return no('Esa trama no existe');
      if (a.lineaId === lineaDestino) return no('El salto va hacia otra trama');
      const forma = this.formaEntre(a.lineaId, lineaDestino);
      tipo = tipo || forma;
      if (tipo === 'cuadro' && forma === 'rombo')
        return no('Un cuadro no llega a una trama alternativa. Para eso está el rombo.');
      if (this.esExtremo(a.id)) return no('Ese nodo ya es parte de un salto');
      /* El otro extremo nace en la misma celda de la trama de destino. Si ahí ya hay un nodo no se
         toca: un salto nunca convierte un nodo existente en cuadro o rombo. */
      const ocupada = this.ocupante(lineaDestino, a.col);
      if (ocupada) return no(`En esa celda de ${destino.nombre} ya está «${ocupada.titulo || 'un nodo'}»: el salto necesita la celda libre`);
      const b = this.nuevoPunto(lineaDestino, a.col, { titulo: a.titulo }).punto;
      a.cortado = false; b.cortado = false;
      const s = { id: this._nid('s'), deId: a.id, aId: b.id, tipo };
      this.datos.saltos.push(s);
      return si({ salto: s, creado: true,
        aviso: `${this.forma(tipo)}: ${this.linea(a.lineaId).nombre} → ${destino.nombre}` });
    }

    convertirSalto(id, tipo) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      if (tipo !== 'cuadro' && tipo !== 'rombo') return no('Forma desconocida');
      const a = this.punto(s.deId), b = this.punto(s.aId);
      if (tipo === 'cuadro' && this.formaEntre(a.lineaId, b.lineaId) === 'rombo')
        return no('No puede ser un salto trama: uno de sus extremos está en una trama alternativa');
      s.tipo = tipo;
      return si({ salto: s, aviso: tipo === 'rombo' ? 'Ahora es un salto alternativo' : 'Ahora es un salto trama' });
    }

    invertirSalto(id) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      const x = s.deId; s.deId = s.aId; s.aId = x;
      return si({ salto: s });
    }

    /* Mueve el salto completo (sus dos extremos) a otra columna. */
    moverSalto(id, col, op) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      const a = this.punto(s.deId); if (!a) return no('Ese salto está roto');
      return this.moverPunto(a.id, { col }, op);
    }

    /* Un cuadro o un rombo existe para ser un salto: sin la unión, sus dos extremos se van. */
    borrarSalto(id) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      const forma = this.forma(s.tipo);
      this._quitarPuntos(new Set([s.deId, s.aId]));
      return si({ aviso: forma + (this.femenino(s.tipo) ? ' eliminada' : ' eliminado') });
    }

    /* ====================================================================
       Notas
       ==================================================================== */
    /* Entre dos nodos consecutivos de la misma trama, o en un nodo (`aId` null). Caben varias en el mismo sitio. */
    _tramoValido(deId, aId) {
      const a = this.punto(deId);
      if (!a) return 'Esa nota no tiene nodo';
      if (!aId) return null;                                       // nota de un nodo
      const b = this.punto(aId);
      if (!b || a.id === b.id) return 'Una nota va entre dos nodos';
      if (a.lineaId !== b.lineaId) return 'Una nota va entre dos nodos de la misma trama';
      const ca = this.cg(a), cb = this.cg(b), lo = Math.min(ca, cb), hi = Math.max(ca, cb);
      const enMedio = this.datos.puntos.some(p => p.lineaId === a.lineaId && p.id !== a.id && p.id !== b.id
        && this.cg(p) > lo && this.cg(p) < hi);
      if (enMedio) return 'Una nota va entre dos nodos consecutivos';
      return null;
    }

    /* `aId` null (o igual que `deId`): la nota cuelga de ese nodo. */
    crearNota(deId, aId, texto) {
      const problema = this._tramoValido(deId, aId === deId ? null : aId);
      if (problema) return no(problema);
      const a = this.punto(deId), b = aId && aId !== deId ? this.punto(aId) : null;
      const [de, hasta] = !b ? [a, null] : (this.cg(a) <= this.cg(b) ? [a, b] : [b, a]);
      const n = { id: this._nid('n'), deId: de.id, aId: hasta ? hasta.id : null, texto: String(texto ?? 'Nota nueva') };
      this.datos.notas.push(n);
      return si({ nota: n });
    }

    /* Una nota en una raya (Leo, 17-09-2026): la de la trama `lineaId` que va de la columna global `cg` a la siguiente, haya
       nodos o no. */
    crearNotaAbierta(lineaId, cg, texto) {
      if (!this.linea(lineaId)) return no('Esa trama no existe');
      const n = { id: this._nid('n'), deId: null, aId: null, abierta: true, lineaId, col: this.columna(cg), texto: String(texto ?? 'Nota nueva') };
      this.datos.notas.push(n);
      return si({ nota: n });
    }
    moverNotaAbierta(id, lineaId, cg) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      if (!this.linea(lineaId)) return no('Esa trama no existe');
      const col = this.columna(cg);
      if (n.abierta && n.lineaId === lineaId && n.col === col) return si({ nota: n, movida: false });
      Object.assign(n, { deId: null, aId: null, abierta: true, lineaId, col });
      return si({ nota: n, movida: true });
    }

    /* **Reordenar notas apiladas** (Leo, 16-09-2026: «déjame reordenar notas, una encima o debajo de otras… y que no
       importe si es del nodo o del enlace»): el orden en que se apilan es el de la lista, así que basta con recolocar
       la nota delante de otra (`antesDe`) o al final. Solo entre las que comparten sitio. */
    /* **Una nota puede bajarse más de lo que le tocaría** (1.1.46, Leo: «quiero poder poner más abajo notas… sin que eso haga que
       deje de estar relacionada a su nodo, solo es para mejorar la organización visual»): `nota.nivel` es el escalón donde se
       quiere, contando desde el carril; sigue colgando de su nodo o de su tramo, solo baja. Sin él, se apila como siempre. */
    fijarNivelNota(id, nivel) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      const v = Math.round(+nivel || 0);
      if (v > 0) n.nivel = clamp(v, 1, 40); else delete n.nivel;
      return si({ nota: n, nivel: n.nivel || 0 });
    }
    colocarNota(id, antesDe) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      const lista = this.datos.notas, i = lista.indexOf(n); if (i < 0) return no('Esa nota no existe');
      const ref = antesDe ? this.nota(antesDe) : null;
      if (ref === n) return si({ nota: n, movida: false });
      /* La referencia puede ser **cualquier nota de la misma trama**, de nodo o de enlace: en el tablero se apilan
         juntas y Leo quiere ordenarlas entre sí (16-09-2026). De otra trama, no: ahí no se ven una al lado de otra. */
      if (ref) {
        const suya = this.lineaDeNota(ref), mia = this.lineaDeNota(n);
        if (!suya || !mia || suya !== mia) return no('Esa nota está en otra trama');
      }
      lista.splice(i, 1);
      const j = ref ? lista.indexOf(ref) : lista.length;
      lista.splice(j < 0 ? lista.length : j, 0, n);
      return si({ nota: n, movida: lista.indexOf(n) !== i });
    }

    editarNota(id, texto) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      n.texto = String(texto ?? '');
      return si({ nota: n });
    }

    /* El color de una nota: un tono de la paleta, o null para el papel de nota de siempre. */
    colorearNota(id, color) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      if (color && PALETA.some(c => c.id === color)) n.color = color; else delete n.color;
      return si({ nota: n });
    }

    /* Salta de tramo en tramo (o a un nodo, `aId` null): donde caiga se apila con las que ya haya (Leo, 16-09-2026). */
    moverNota(id, deId, aId) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      const destino = aId === deId ? null : (aId || null);
      if (!n.abierta && n.deId === deId && (n.aId || null) === destino) return si({ nota: n, movida: false });
      if (destino && n.deId === destino && n.aId === deId) return si({ nota: n, movida: false });
      const problema = this._tramoValido(deId, destino);
      if (problema) return no(problema);
      const a = this.punto(deId), b = destino ? this.punto(destino) : null;
      const [de, hasta] = !b ? [a, null] : (this.cg(a) <= this.cg(b) ? [a, b] : [b, a]);
      n.deId = de.id; n.aId = hasta ? hasta.id : null;
      delete n.abierta; delete n.lineaId; delete n.col;
      return si({ nota: n, movida: true });
    }

    /* Dos notas se cambian de tramo (de la misma trama o de tramas distintas). */
    intercambiarNotas(idA, idB) {
      const A = this.nota(idA), B = this.nota(idB);
      if (!A || !B) return no('Esa nota no existe');
      if (A === B) return si({ nota: A, movida: false });
      [A.deId, B.deId] = [B.deId, A.deId]; [A.aId, B.aId] = [B.aId, A.aId];
      ['abierta', 'lineaId', 'col'].forEach(k => { [A[k], B[k]] = [B[k], A[k]]; });
      [A, B].forEach(x => { if (!x.abierta) ['abierta', 'lineaId', 'col'].forEach(k => delete x[k]); });
      return si({ nota: A, movida: true, intercambio: B });
    }

    /* Varias notas a la vez (Leo, 16-09-2026: elegidas con Mayús). */
    borrarNotas(ids) {
      const quitar = new Set((ids || []).filter(id => this.nota(id)));
      if (!quitar.size) return no('No hay nada elegido');
      this.datos.notas = this.datos.notas.filter(n => !quitar.has(n.id));
      return si({ borradas: quitar.size, aviso: quitar.size === 1 ? 'Nota eliminada' : quitar.size + ' notas eliminadas' });
    }

    borrarNota(id) {
      if (!this.nota(id)) return no('Esa nota no existe');
      this.datos.notas = this.datos.notas.filter(n => n.id !== id);
      return si({ aviso: 'Nota eliminada' });
    }

    /* ====================================================================
       Cálculos derivados
       ==================================================================== */

    /* 5.1 Presencia en escena: cada trama se lee por sus propios saltos. Un extremo de entrada
       (el `aId`) enciende; uno de salida (el `deId`) apaga. Las principales empiezan encendidas. */
    presencia() {
      const d = this.datos, activos = {}, enFlujo = new Set();
      d.lineas.forEach(l => {
        const marcas = d.puntos.filter(p => p.lineaId === l.id && this.esExtremo(p.id))
          .map(p => ({ c: this.cg(p), entra: this.saltoDe(p.id).aId === p.id }))
          .sort((x, y) => x.c - y.c);
        if (!marcas.length) return;                  // sin saltos: no se apaga nunca
        const tramos = [];
        let dentro = l.tipo === 'principal', ini = -Infinity;
        marcas.forEach(m => {
          if (m.entra && !dentro) { dentro = true; ini = m.c; }
          else if (!m.entra && dentro) { tramos.push([ini, m.c]); dentro = false; }
        });
        if (dentro) tramos.push([ini, Infinity]);
        if (!tramos.length) return;                  // montaje incompleto: no lo empeores apagándolo todo
        enFlujo.add(l.id); activos[l.id] = tramos;
      });
      const cg = p => this.cg(p);
      return {
        activos,
        lineaEnFlujo: id => enFlujo.has(id),
        fuera: p => enFlujo.has(p.lineaId) && !activos[p.lineaId].some(([a, b]) => cg(p) >= a && cg(p) <= b),
        tramoFuera: (lineaId, ca, cb) => enFlujo.has(lineaId) && !activos[lineaId].some(([a, b]) => ca >= a && cb <= b)
      };
    }

    /* El orden en que la historia visita las tramas, siguiendo los saltos desde la principal. */
    flujo() {
      const pr = this.lineaPrincipal(); if (!pr) return [];
      const viajes = this.datos.saltos.map(s => ({ s, a: this.punto(s.deId), b: this.punto(s.aId) }))
        .filter(v => v.a && v.b && v.a.lineaId !== v.b.lineaId)
        .sort((p, q) => this.cg(p.a) - this.cg(q.a));
      const orden = [];
      let actual = pr.id, inicio = -Infinity;
      viajes.forEach(v => {
        if (v.a.lineaId !== actual) return;          // ese salto no le toca a la historia ahora
        const c = this.cg(v.a);
        orden.push({ lineaId: actual, desde: inicio, hasta: c, saltoId: v.s.id });
        actual = v.b.lineaId; inicio = c;
      });
      orden.push({ lineaId: actual, desde: inicio, hasta: Infinity, saltoId: null });
      return orden;
    }

    /* El hilo: todos los nodos por los que pasa la historia, en el orden en que los visita
       (siguiendo el flujo de trama en trama). Los nodos fuera de escena no están en él. */
    hilo() {
      const orden = [], vistos = new Set();
      this.flujo().forEach(t => {
        this.puntosDe(t.lineaId).forEach(p => {
          const c = this.cg(p);
          if (c >= t.desde && c <= t.hasta && !vistos.has(p.id)) { vistos.add(p.id); orden.push(p.id); }
        });
      });
      return orden;
    }

    /* Vecinos de un nodo para recorrerlo con flechas: por el hilo si está en él; si no (nodo fuera
       de escena o trama sin saltos), por su propia trama de izquierda a derecha. */
    vecinos(puntoId) {
      const p = this.punto(puntoId); if (!p) return null;
      let lista = this.hilo(), enHilo = true;
      if (!lista.includes(puntoId)) { lista = this.puntosDe(p.lineaId).map(q => q.id); enHilo = false; }
      const i = lista.indexOf(puntoId);
      return { anterior: lista[i - 1] || null, siguiente: lista[i + 1] || null, indice: i, total: lista.length, enHilo };
    }

    /* 5.2 Recorrido hasta un nodo: el camino que siguió la historia para llegar a él.
       Devuelve null si el nodo está fuera de escena (no hay camino). */
    recorrido(puntoId, pres) {
      const p = this.punto(puntoId); if (!p) return null;
      const c = this.cg(p), flujo = this.flujo();
      const i = flujo.findIndex(t => t.lineaId === p.lineaId && c >= t.desde && c <= t.hasta);
      let tramos, saltos;
      if (i < 0) {
        if ((pres || this.presencia()).lineaEnFlujo(p.lineaId)) return null;
        tramos = [{ lineaId: p.lineaId, desde: -Infinity, hasta: c, saltoId: null }];
        saltos = new Set();
      } else {
        tramos = flujo.slice(0, i + 1).map((t, k) => Object.assign({}, t, { hasta: k === i ? c : t.hasta }));
        saltos = new Set(flujo.slice(0, i).map(t => t.saltoId).filter(Boolean));
      }
      return { tramos, saltos,
        incluye: (lineaId, ca, cb) => tramos.some(t => t.lineaId === lineaId && ca >= t.desde && cb <= t.hasta) };
    }
  }

  /* ====================================================================
     Historial: instantáneas completas, con tope. Quien lo usa decide cuándo registrar
     (un arrastre entero cuenta como un solo paso).
     ==================================================================== */
  class Historial {
    constructor(limite) { this.limite = limite || 80; this.pasado = []; this.futuro = []; this.ultimo = null; }
    reiniciar(json) { this.pasado = []; this.futuro = []; this.ultimo = json; }
    registrar(json) {
      if (this.ultimo === null) { this.ultimo = json; return false; }
      if (json === this.ultimo) return false;
      this.pasado.push(this.ultimo);
      if (this.pasado.length > this.limite) this.pasado.shift();
      this.futuro.length = 0;
      this.ultimo = json;
      return true;
    }
    puedeDeshacer() { return this.pasado.length > 0; }
    puedeRehacer() { return this.futuro.length > 0; }
    deshacer() {
      if (!this.pasado.length) return null;
      this.futuro.push(this.ultimo);
      this.ultimo = this.pasado.pop();
      return this.ultimo;
    }
    rehacer() {
      if (!this.futuro.length) return null;
      this.pasado.push(this.ultimo);
      this.ultimo = this.futuro.pop();
      return this.ultimo;
    }
  }

  /* ---------- tableros de partida ----------
     `inicial()` es lo que ve el guionista la primera vez y al pulsar «Nuevo»: tres actos y **solo la trama
     principal, vacía** (Leo, 16-09-2026: ni el nodo «Inicio» ni la secundaria de antes, que había que borrar
     siempre). `ejemplo()` es el tablero de muestra del prototipo, usado en las pruebas. */
  function inicial() {
    return {
      columnas: 51,
      actos: [{ id: 'a1', nombre: 'Acto I', desde: 0, celdas: 14, fondo: null },
              { id: 'a2', nombre: 'Acto II', desde: 14, celdas: 22, fondo: null },
              { id: 'a3', nombre: 'Acto III', desde: 36, celdas: 15, fondo: null }],
      lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul', cortada: false }],
      puntos: [], saltos: [], notas: []
    };
  }

  function ejemplo() {
    const P = (id, l, a, c, t, descripcion, color) =>
      ({ id, lineaId: l, actoId: a, celda: c, titulo: t, descripcion: descripcion || '', color: color || null, cortado: false });
    return {
      actos: [{ id: 'a1', nombre: 'Acto I', celdas: 14, fondo: null },
              { id: 'a2', nombre: 'Acto II', celdas: 22, fondo: null },
              { id: 'a3', nombre: 'Acto III', celdas: 15, fondo: null }],
      lineas: [
        { id: 'l1', nombre: 'Principal',         tipo: 'principal',  color: 'azul',    cortada: false },
        { id: 'l2', nombre: 'Romance',           tipo: 'secundaria', color: 'violeta', cortada: false },
        { id: 'l3', nombre: 'Investigación',     tipo: 'secundaria', color: 'verde',   cortada: false },
        { id: 'l4', nombre: 'Final alternativo', tipo: 'alterna',    color: 'ambar',   cortada: false }],
      puntos: [
        P('p1', 'l1', 'a1', 2, 'Mundo ordinario', 'Marta cierra el taller un jueves cualquiera.'),
        P('p2', 'l1', 'a1', 8, 'Detonante', 'Llega la carta del juzgado.', 'rojo'),
        P('p3', 'l1', 'a1', 13, 'Primer giro', 'Decide ir a la casa del padre.'),
        P('q1', 'l1', 'a2', 4, 'Corta a Romance', ''),
        P('p4', 'l1', 'a2', 8, 'Punto medio', 'Descubre que la casa ya se vendió.'),
        P('p5', 'l1', 'a2', 12, 'Crisis', 'Pierde el documento que la respalda.'),
        P('q2', 'l1', 'a2', 16, 'Vuelve a Principal', ''),
        P('p6', 'l1', 'a3', 11, 'Clímax', 'Confronta al notario delante de todos.'),
        P('p7', 'l1', 'a3', 14, 'Resolución', 'Se queda con el taller, no con la casa.', 'verde'),
        P('p16', 'l2', 'a1', 6, 'Se cruzan sin verse', 'Pasa antes, pero la historia todavía no está aquí.'),
        P('q3', 'l2', 'a2', 4, 'Entra Romance', ''),
        P('p8', 'l2', 'a2', 8, 'Se conocen', 'Vera la atiende en el registro civil.'),
        P('p9', 'l2', 'a2', 12, 'Primer beso', 'En el estacionamiento, bajo la lluvia.'),
        P('q4', 'l2', 'a2', 16, 'Sale de Romance', ''),
        P('p12', 'l3', 'a2', 2, 'Expediente incompleto', 'Falta una firma del 98.'),
        P('p13', 'l3', 'a2', 18, 'La testigo', '¿Aporta o distrae del clímax?'),
        P('r1', 'l1', 'a3', 2, 'Salta al final alternativo', ''),
        P('r2', 'l4', 'a3', 2, 'Entra el alternativo', ''),
        P('p15', 'l4', 'a3', 5, '¿Y si se queda con la casa?', 'Vende el taller y se muda. ¿Aguanta la película?'),
        P('r3', 'l4', 'a3', 8, 'Sale del alternativo', ''),
        P('r4', 'l1', 'a3', 8, 'Vuelve a Principal', '')
      ],
      saltos: [{ id: 's1', deId: 'q1', aId: 'q3', tipo: 'cuadro' },
               { id: 's2', deId: 'q4', aId: 'q2', tipo: 'cuadro' },
               { id: 's3', deId: 'r1', aId: 'r2', tipo: 'rombo' },
               { id: 's4', deId: 'r3', aId: 'r4', tipo: 'rombo' }],
      notas: [{ id: 'n1', deId: 'p1', aId: 'p2', texto: 'Arranca lento a propósito' },
              { id: 'n2', deId: 'p8', aId: 'p9', texto: 'Aquí conviene el salto de tiempo' }]
    };
  }

  Object.assign(T, { Modelo, Historial, normalizar, inicial, ejemplo,
    PALETA, FONDOS, FONDOS_AUTO, fondoEfectivo, TIPOS, ETIQUETA, FORMA, MIN_CELDAS, MAX_CELDAS, ANCHO_ACTO,
    hex, fondoDe, clamp, romano });

  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
