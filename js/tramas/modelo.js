/* Tramas · modelo
   Cinco colecciones planas (actos, lineas, puntos, saltos, notas), las invariantes y los dos
   cálculos derivados (presencia en escena y recorrido). No toca el DOM ni conoce píxeles: todo se
   mide en celdas. Se puede cargar en Node para probarlo (test/tramas.test.js).

   Cada operación devuelve { ok, aviso? , ... }: `ok:false` significa que la invariante la rechazó
   y `aviso` es el texto que hay que enseñar al usuario. */
(function (raiz) {
  const T = raiz.Tramas = raiz.Tramas || {};

  /* ---------- constantes de dominio ---------- */
  const PALETA = [
    { id: 'azul',    label: 'Azul',    c: '#26417f' },
    { id: 'violeta', label: 'Violeta', c: '#563180' },
    { id: 'verde',   label: 'Verde',   c: '#2c5730' },
    { id: 'ambar',   label: 'Ámbar',   c: '#7a5410' },
    { id: 'rojo',    label: 'Rojo',    c: '#8f3a2c' },
    { id: 'gris',    label: 'Gris',    c: '#5c584f' }
  ];
  const FONDOS = [
    { id: '',        label: 'Sin fondo', c: 'transparent' },
    { id: 'azul',    label: 'Azul',    c: '#dfe8ff' },
    { id: 'violeta', label: 'Violeta', c: '#ede0f7' },
    { id: 'verde',   label: 'Verde',   c: '#e2f0e0' },
    { id: 'ambar',   label: 'Ámbar',   c: '#fbf0d2' },
    { id: 'rojo',    label: 'Rojo',    c: '#fde2dc' },
    { id: 'gris',    label: 'Gris',    c: '#e4e4e2' }
  ];
  const TIPOS = ['principal', 'secundaria', 'alterna'];
  const ETIQUETA = { principal: 'Principal', secundaria: 'Secundaria', alterna: 'Alternativa' };
  const FORMA = { cuadro: 'Cambio de escena', rombo: 'Salto alternativo' };
  const MIN_CELDAS = 6, MAX_CELDAS = 60, ANCHO_ACTO = 15;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = id => (PALETA.find(p => p.id === id) || PALETA[0]).c;
  const fondoDe = id => (FONDOS.find(f => f.id === (id || '')) || FONDOS[0]).c;
  const romano = k => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k] || String(k);
  const clonar = d => JSON.parse(JSON.stringify(d));
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});

  /* ---------- saneado al cargar ----------
     Red de seguridad para JSON que venga de fuera: rellena valores por defecto, quita referencias
     rotas y deja el tablero cumpliendo las invariantes. */
  function normalizar(entrada) {
    const d = { actos: [], lineas: [], puntos: [], saltos: [], notas: [] };
    const e = entrada && typeof entrada === 'object' ? entrada : {};
    const lista = x => Array.isArray(x) ? x : [];

    lista(e.actos).forEach((a, i) => {
      if (!a || !a.id) return;
      d.actos.push({ id: String(a.id), nombre: String(a.nombre ?? ('Acto ' + romano(i + 1))),
        celdas: clamp(Math.round(+a.celdas || ANCHO_ACTO), MIN_CELDAS, MAX_CELDAS),
        fondo: FONDOS.some(f => f.id === a.fondo && f.id) ? a.fondo : null });
    });
    if (!d.actos.length) d.actos.push({ id: 'a1', nombre: 'Acto I', celdas: ANCHO_ACTO, fondo: null });

    lista(e.lineas).forEach((l, i) => {
      if (!l || !l.id) return;
      d.lineas.push({ id: String(l.id), nombre: String(l.nombre ?? ('Trama ' + (i + 1))),
        tipo: TIPOS.includes(l.tipo) ? l.tipo : 'secundaria',
        color: PALETA.some(c => c.id === l.color) ? l.color : PALETA[i % PALETA.length].id,
        cortada: !!l.cortada });
    });
    if (!d.lineas.length) d.lineas.push({ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul', cortada: false });
    // exactamente una principal
    let vista = false;
    d.lineas.forEach(l => { if (l.tipo === 'principal') { if (vista) l.tipo = 'secundaria'; vista = true; } });
    if (!vista) d.lineas[0].tipo = 'principal';

    const actoIds = new Set(d.actos.map(a => a.id)), lineaIds = new Set(d.lineas.map(l => l.id));
    lista(e.puntos).forEach(p => {
      if (!p || !p.id || !lineaIds.has(p.lineaId) || !actoIds.has(p.actoId)) return;
      const a = d.actos.find(x => x.id === p.actoId);
      d.puntos.push({ id: String(p.id), lineaId: p.lineaId, actoId: p.actoId,
        celda: clamp(Math.round(+p.celda || 0), 0, a.celdas - 1),
        titulo: String(p.titulo ?? ''), descripcion: String(p.descripcion ?? p.nota ?? ''),
        color: PALETA.some(c => c.id === p.color) ? p.color : null, cortado: !!p.cortado });
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
        tipo: (s.tipo === 'rombo' || alterna) ? 'rombo' : 'cuadro' });
      b.actoId = a.actoId; b.celda = a.celda;                      // misma celda global, siempre
      a.cortado = false; b.cortado = false;                        // un extremo no se descarta
    });

    const vistos = new Set();
    lista(e.notas).forEach(n => {
      if (!n || !n.id || !puntoIds.has(n.deId) || !puntoIds.has(n.aId) || n.deId === n.aId) return;
      if (punto(n.deId).lineaId !== punto(n.aId).lineaId) return;
      const clave = [n.deId, n.aId].sort().join('|');
      if (vistos.has(clave)) return;                               // una nota por tramo
      vistos.add(clave);
      d.notas.push({ id: String(n.id), deId: n.deId, aId: n.aId, texto: String(n.texto ?? '') });
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
    lineaPrincipal() { return this.datos.lineas.find(l => l.tipo === 'principal'); }
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
    notaDe(deId, aId) {
      return this.datos.notas.find(n => (n.deId === deId && n.aId === aId) || (n.deId === aId && n.aId === deId));
    }
    /* ¿Un salto entre estas dos tramas sería rombo o cuadro? */
    formaEntre(lineaA, lineaB) {
      const a = this.linea(lineaA), b = this.linea(lineaB);
      return (a && a.tipo === 'alterna') || (b && b.tipo === 'alterna') ? 'rombo' : 'cuadro';
    }

    /* ---------- cuadrícula (solo celdas) ---------- */
    totalCeldas() { return this.datos.actos.reduce((s, a) => s + a.celdas, 0); }
    celdasAntes(actoId) {
      let acc = 0;
      for (const a of this.datos.actos) { if (a.id === actoId) return acc; acc += a.celdas; }
      return acc;
    }
    cg(p) {                                                      // celda global de un punto
      const a = this.acto(p.actoId); if (!a) return 0;
      return this.celdasAntes(p.actoId) + clamp(p.celda, 0, a.celdas - 1);
    }
    ubicarCelda(c) {                                             // celda global → { actoId, celda }
      const actos = this.datos.actos;
      c = clamp(Math.round(c), 0, this.totalCeldas() - 1);
      let acc = 0;
      for (let i = 0; i < actos.length; i++) {
        const a = actos[i];
        if (c < acc + a.celdas || i === actos.length - 1)
          return { actoId: a.id, celda: clamp(c - acc, 0, a.celdas - 1) };
        acc += a.celdas;
      }
      return { actoId: actos[0].id, celda: 0 };
    }

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
    ocupante(lineaId, actoId, celda, salvo) {
      const fuera = new Set(salvo || []);
      return this.datos.puntos.find(q => q.lineaId === lineaId && q.actoId === actoId && q.celda === celda && !fuera.has(q.id)) || null;
    }

    nuevoPunto(lineaId, actoId, celda, props) {
      const l = this.linea(lineaId); if (!l) return no('Esa trama no existe');
      const a = this.acto(actoId) || this.datos.actos[0];
      const p = Object.assign({
        id: this._nid('p'), lineaId, actoId: a.id,
        celda: clamp(Math.round(celda ?? Math.floor(a.celdas / 2)), 0, a.celdas - 1),
        titulo: 'Punto nuevo', descripcion: '', color: null, cortado: false
      }, props || {});
      const ocupada = this.ocupante(lineaId, a.id, p.celda);
      if (ocupada) return no(`Ahí ya está «${ocupada.titulo || 'un nodo'}»: elige una celda libre`);
      this.datos.puntos.push(p);
      this._reanclarNotas(p);
      return si({ punto: p });
    }

    /* Mueve un nodo de celda y, si se pide, de trama. Los socios de salto lo siguen (misma celda).
       Ni el nodo ni su pareja pueden caer sobre otro nodo: necesitan la celda libre. */
    moverPunto(id, destino) {
      const p = this.punto(id); if (!p) return no('Ese nodo no existe');
      const a = this.acto(destino.actoId); if (!a) return no('Ese acto no existe');
      const nueva = destino.lineaId || p.lineaId;
      const pareja = this.parejaDe(p.id);
      if (nueva !== p.lineaId) {
        const l = this.linea(nueva); if (!l) return no('Esa trama no existe');
        if (pareja && pareja.lineaId === nueva)
          return no('Un cambio de escena no puede terminar en la misma trama de la que sale');
        if (pareja && this.formaDe(p.id) === 'cuadro' && l.tipo === 'alterna')
          return no('Un cuadro no llega a una trama alternativa. Para eso está el rombo.');
      }
      const celda = clamp(Math.round(destino.celda), 0, a.celdas - 1);
      const salvo = [p.id].concat(pareja ? [pareja.id] : []);
      const ocupada = this.ocupante(nueva, a.id, celda, salvo) || (pareja && this.ocupante(pareja.lineaId, a.id, celda, salvo));
      if (ocupada) return no(`Ahí ya está «${ocupada.titulo || 'un nodo'}»: necesita una celda libre`);
      p.actoId = a.id; p.celda = celda;
      this._sincronizarSalto(p);
      const cambioTrama = nueva !== p.lineaId;
      if (cambioTrama) p.lineaId = nueva;
      return si({ punto: p, cambioTrama });
    }

    editarPunto(id, cambios) {
      const p = this.punto(id); if (!p) return no('Ese nodo no existe');
      if ('titulo' in cambios) p.titulo = String(cambios.titulo);
      if ('descripcion' in cambios) p.descripcion = String(cambios.descripcion);
      if ('color' in cambios) p.color = PALETA.some(c => c.id === cambios.color) ? cambios.color : null;
      return si({ punto: p });
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

    _quitarPuntos(ids) {
      const d = this.datos;
      d.saltos = d.saltos.filter(s => !ids.has(s.deId) && !ids.has(s.aId));
      d.notas = d.notas.filter(n => !ids.has(n.deId) && !ids.has(n.aId));
      d.puntos = d.puntos.filter(p => !ids.has(p.id));
    }

    /* Un nodo nuevo que parte el tramo de una nota: la nota se queda con la primera mitad. */
    _reanclarNotas(p) {
      const c = this.cg(p);
      this.datos.notas.forEach(nt => {
        const a = this.punto(nt.deId), b = this.punto(nt.aId);
        if (!a || !b || a.lineaId !== p.lineaId || b.lineaId !== p.lineaId) return;
        const ca = this.cg(a), cb = this.cg(b);
        if (c > Math.min(ca, cb) && c < Math.max(ca, cb)) { nt.deId = (ca < cb ? a : b).id; nt.aId = p.id; }
      });
    }

    /* Los dos extremos de un salto ocupan siempre la misma celda global. */
    _sincronizarSalto(p) {
      const q = this.parejaDe(p.id);
      if (q) { q.actoId = p.actoId; q.celda = p.celda; }
    }

    /* ====================================================================
       Tramas
       ==================================================================== */
    nuevaLinea(tipo) {
      tipo = TIPOS.includes(tipo) ? tipo : 'secundaria';
      if (tipo === 'principal' && this.lineaPrincipal()) tipo = 'secundaria';
      const usados = this.datos.lineas.map(l => l.color);
      const libre = PALETA.find(c => !usados.includes(c.id)) || PALETA[this.datos.lineas.length % PALETA.length];
      const l = { id: this._nid('l'), nombre: 'Trama ' + (this.datos.lineas.length + 1), tipo, color: libre.id, cortada: false };
      this.datos.lineas.push(l);
      return si({ linea: l });
    }

    editarLinea(id, cambios) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if ('nombre' in cambios) l.nombre = String(cambios.nombre);
      if ('color' in cambios && PALETA.some(c => c.id === cambios.color)) l.color = cambios.color;
      return si({ linea: l });
    }

    /* El tipo solo alterna entre secundaria y alterna: la principal se fija al crearla. */
    fijarTipo(id, tipo) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if (l.tipo === tipo) return si({ linea: l });
      if (l.tipo === 'principal') return no('La trama principal no cambia de tipo');
      if (tipo === 'principal') return no('Ya hay una trama principal');
      if (!TIPOS.includes(tipo)) return no('Tipo desconocido');
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

    descartarLinea(id, valor) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      l.cortada = valor === undefined ? !l.cortada : !!valor;
      return si({ linea: l });
    }

    borrarLinea(id) {
      const l = this.linea(id); if (!l) return no('Esa trama no existe');
      if (l.tipo === 'principal') return no('La trama principal no se elimina');
      if (this.datos.lineas.length <= 1) return no('Tiene que quedar al menos una trama');
      this._quitarPuntos(new Set(this.datos.puntos.filter(p => p.lineaId === id).map(p => p.id)));
      this.datos.lineas = this.datos.lineas.filter(x => x.id !== id);
      return si({ aviso: 'Trama eliminada' });
    }

    /* ====================================================================
       Actos
       ==================================================================== */
    nuevoActo() {
      const a = { id: this._nid('a'), nombre: 'Acto ' + romano(this.datos.actos.length + 1), celdas: ANCHO_ACTO, fondo: null };
      this.datos.actos.push(a);
      return si({ acto: a });
    }

    editarActo(id, cambios) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      if ('nombre' in cambios) a.nombre = String(cambios.nombre);
      if ('fondo' in cambios) a.fondo = FONDOS.some(f => f.id === cambios.fondo && f.id) ? cambios.fondo : null;
      return si({ acto: a });
    }

    /* Reducir el ancho recorta la celda de los nodos que quedan fuera; no los elimina. */
    fijarAncho(id, celdas) {
      const a = this.acto(id); if (!a) return no('Ese acto no existe');
      a.celdas = clamp(Math.round(celdas), MIN_CELDAS, MAX_CELDAS);
      this.datos.puntos.filter(p => p.actoId === id).forEach(p => { p.celda = clamp(p.celda, 0, a.celdas - 1); });
      this.datos.saltos.forEach(s => { const x = this.punto(s.deId); if (x) this._sincronizarSalto(x); });
      return si({ acto: a });
    }

    /* Sus nodos pasan al acto vecino conservando la celda, recortada al nuevo ancho. */
    borrarActo(id) {
      const actos = this.datos.actos, i = actos.findIndex(a => a.id === id);
      if (i < 0) return no('Ese acto no existe');
      if (actos.length <= 1) return no('Tiene que quedar al menos un acto');
      const vecino = actos[i + 1] || actos[i - 1];
      const mudados = this.datos.puntos.filter(p => p.actoId === id);
      mudados.forEach(p => { p.actoId = vecino.id; p.celda = clamp(p.celda, 0, vecino.celdas - 1); });
      actos.splice(i, 1);
      return si({ mudados: mudados.length, aviso: mudados.length
        ? `Acto eliminado · ${mudados.length} punto(s) pasaron a ${vecino.nombre}` : 'Acto eliminado' });
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
      const ocupada = this.datos.puntos.find(q => q.lineaId === lineaDestino && q.actoId === a.actoId && q.celda === a.celda);
      if (ocupada) return no(`En esa celda de ${destino.nombre} ya está «${ocupada.titulo || 'un nodo'}»: el salto necesita la celda libre`);
      const b = this.nuevoPunto(lineaDestino, a.actoId, a.celda, { titulo: a.titulo }).punto;
      a.cortado = false; b.cortado = false;
      const s = { id: this._nid('s'), deId: a.id, aId: b.id, tipo };
      this.datos.saltos.push(s);
      return si({ salto: s, creado: true,
        aviso: `${FORMA[tipo]}: ${this.linea(a.lineaId).nombre} → ${destino.nombre}` });
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

    /* Mueve el salto completo (sus dos extremos) a otro momento. */
    moverSalto(id, actoId, celda) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      const a = this.punto(s.deId); if (!a) return no('Ese salto está roto');
      return this.moverPunto(a.id, { actoId, celda });
    }

    /* Un cuadro o un rombo existe para ser un salto: sin la unión, sus dos extremos se van. */
    borrarSalto(id) {
      const s = this.salto(id); if (!s) return no('Ese salto no existe');
      const forma = FORMA[s.tipo];
      this._quitarPuntos(new Set([s.deId, s.aId]));
      return si({ aviso: forma + ' eliminado' });
    }

    /* ====================================================================
       Notas
       ==================================================================== */
    /* Solo entre dos nodos consecutivos de la misma trama, y una por tramo. */
    _tramoValido(deId, aId, salvoNota) {
      const a = this.punto(deId), b = this.punto(aId);
      if (!a || !b || a.id === b.id) return 'Una nota va entre dos nodos';
      if (a.lineaId !== b.lineaId) return 'Una nota va entre dos nodos de la misma trama';
      const ca = this.cg(a), cb = this.cg(b), lo = Math.min(ca, cb), hi = Math.max(ca, cb);
      const enMedio = this.datos.puntos.some(p => p.lineaId === a.lineaId && p.id !== a.id && p.id !== b.id
        && this.cg(p) > lo && this.cg(p) < hi);
      if (enMedio) return 'Una nota va entre dos nodos consecutivos';
      const otra = this.notaDe(deId, aId);
      if (otra && otra.id !== salvoNota) return 'Ese tramo ya tiene una nota';
      return null;
    }

    crearNota(deId, aId, texto) {
      const problema = this._tramoValido(deId, aId);
      if (problema) return no(problema);
      const a = this.punto(deId), b = this.punto(aId);
      const [de, hasta] = this.cg(a) <= this.cg(b) ? [a, b] : [b, a];
      const n = { id: this._nid('n'), deId: de.id, aId: hasta.id, texto: String(texto ?? 'Nota nueva') };
      this.datos.notas.push(n);
      return si({ nota: n });
    }

    editarNota(id, texto) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      n.texto = String(texto ?? '');
      return si({ nota: n });
    }

    /* Salta de tramo en tramo; si el destino ya tiene nota, se queda donde estaba. */
    moverNota(id, deId, aId) {
      const n = this.nota(id); if (!n) return no('Esa nota no existe');
      if ((n.deId === deId && n.aId === aId) || (n.deId === aId && n.aId === deId)) return si({ nota: n, movida: false });
      const problema = this._tramoValido(deId, aId, id);
      if (problema) return no(problema);
      const a = this.punto(deId), b = this.punto(aId);
      const [de, hasta] = this.cg(a) <= this.cg(b) ? [a, b] : [b, a];
      n.deId = de.id; n.aId = hasta.id;
      return si({ nota: n, movida: true });
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
       (el `aId`) enciende; uno de salida (el `deId`) apaga. La principal empieza encendida. */
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
     `inicial()` es lo que ve el guionista la primera vez y al pulsar «Nuevo»: tres actos, la trama
     principal con su primer nodo, y una secundaria lista para usar. `ejemplo()` es el tablero de
     muestra del prototipo, usado en las pruebas. */
  function inicial() {
    return {
      actos: [{ id: 'a1', nombre: 'Acto I', celdas: 14, fondo: null },
              { id: 'a2', nombre: 'Acto II', celdas: 22, fondo: null },
              { id: 'a3', nombre: 'Acto III', celdas: 15, fondo: null }],
      lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul', cortada: false },
               { id: 'l2', nombre: 'Secundaria', tipo: 'secundaria', color: 'violeta', cortada: false }],
      puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 2, titulo: 'Inicio', descripcion: '', color: null, cortado: false }],
      saltos: [], notas: []
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
    PALETA, FONDOS, TIPOS, ETIQUETA, FORMA, MIN_CELDAS, MAX_CELDAS, ANCHO_ACTO,
    hex, fondoDe, clamp, romano });

  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
