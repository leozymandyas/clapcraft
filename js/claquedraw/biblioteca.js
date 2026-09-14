/* Claquedraw · biblioteca
   La lista de guiones. Cada guion es un esquema de pasos (un tablero de Tramas) con nombre, si está
   fijado y cuándo se tocó por última vez. Modelo puro, sin DOM: no sabe nada de Tramas más allá de
   guardar sus datos tal cual, y se puede cargar en Node (test/claquedraw.test.js).

   Cada operación devuelve { ok, aviso?, ... }: `ok:false` significa que se rechazó y `aviso` es el
   texto que hay que enseñar. El orden manual es el orden del arreglo `guiones`; los fijados y los
   demás son dos vistas del mismo arreglo, así que fijar no pierde la posición relativa. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  const FORMATO = 1;                       // formato de la biblioteca guardada
  const NOMBRE = 'Capítulo';               // base del nombre de un guion nuevo
  const ORDENES = ['manual', 'az', 'za', 'modificado'];

  const clonar = d => JSON.parse(JSON.stringify(d));
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});
  /* Texto sin acentos ni mayúsculas, para buscar y comparar nombres. */
  const plano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

  /* Un tablero de Tramas serializado: basta con que traiga la colección de tramas. */
  const esTablero = d => !!d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.lineas);

  /* Las notas del editor de texto de un guion: una por nodo del tablero, con la clave del punto y
     la forma que da `Ed.document.get()` ({ title, html, characters }). Lo que no tenga html se tira. */
  const esNota = n => !!n && typeof n === 'object' && typeof n.html === 'string';
  function sanearNotas(obj) {
    const notas = {};
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) Object.keys(obj).forEach(k => {
      const n = obj[k];
      if (esNota(n)) notas[k] = { title: String(n.title || ''), html: n.html,
                                  characters: n.characters && typeof n.characters === 'object' ? clonar(n.characters) : {} };
    });
    return notas;
  }

  /* Sanea lo que venga de localStorage o de un archivo: entradas rotas o repetidas se descartan,
     el activo se corrige si ya no existe. */
  function normalizar(datos) {
    const d = { formato: FORMATO, guiones: [], activo: null };
    const vistos = new Set();
    if (datos && Array.isArray(datos.guiones)) datos.guiones.forEach(g => {
      if (!g || typeof g !== 'object') return;
      const id = String(g.id || '');
      if (!id || vistos.has(id)) return;
      vistos.add(id);
      const creado = +g.creado || 0;
      d.guiones.push({
        id,
        nombre: String(g.nombre || '').trim() || NOMBRE,
        fijado: !!g.fijado,
        creado,
        modificado: +g.modificado || creado,
        datos: esTablero(g.datos) ? clonar(g.datos) : null,
        notas: sanearNotas(g.notas),
        notaActual: typeof g.notaActual === 'string' && g.notaActual ? g.notaActual : null,
        /* el gestor de documentos (contenedores, etiquetas, notas): lo sanea C.Documentos al usarse */
        documentos: g.documentos && typeof g.documentos === 'object' && !Array.isArray(g.documentos) ? clonar(g.documentos) : { contenedores: [], etiquetas: [], notas: [] }
      });
    });
    const activo = datos && String(datos.activo || '');
    d.activo = vistos.has(activo) ? activo : (d.guiones[0] ? d.guiones[0].id : null);
    return d;
  }

  class Biblioteca {
    /* opciones.ahora e idNuevo se inyectan en las pruebas. */
    constructor(datos, opciones) {
      const o = opciones || {};
      this.ahora = o.ahora || (() => Date.now());
      this.idNuevo = o.idNuevo || (() => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      this.datos = normalizar(datos);
    }

    /* ---------- serialización ---------- */
    toJSON() { return clonar(this.datos); }
    cargar(datos) { this.datos = normalizar(datos); return this; }

    /* ---------- consultas ---------- */
    guion(id) { return this.datos.guiones.find(g => g.id === id) || null; }
    activo() { return this.guion(this.datos.activo); }
    total() { return this.datos.guiones.length; }

    /* Nombre que no choca con ninguno de la lista. Sin base: «Capítulo N», con N a partir del
       siguiente al total; con base (un archivo importado): la base, o «base 2», «base 3»… */
    nombreLibre(base) {
      const usados = new Set(this.datos.guiones.map(g => plano(g.nombre)));
      const b = String(base || '').trim();
      if (!b) {
        let n = this.total() + 1;
        while (usados.has(plano(NOMBRE + ' ' + n))) n++;
        return NOMBRE + ' ' + n;
      }
      if (!usados.has(plano(b))) return b;
      let n = 2;
      while (usados.has(plano(b + ' ' + n))) n++;
      return b + ' ' + n;
    }

    /* Las dos listas que enseña la barra, ya filtradas por `texto` y ordenadas según `orden`
       ('manual' | 'az' | 'za' | 'modificado'). Los totales no dependen del filtro. */
    lista(opciones) {
      const o = opciones || {};
      const q = plano(o.texto);
      const cmp = {
        az: (a, b) => comparar(a.nombre, b.nombre),
        za: (a, b) => comparar(b.nombre, a.nombre),
        modificado: (a, b) => b.modificado - a.modificado
      }[o.orden];
      const preparar = xs => {
        const f = q ? xs.filter(g => plano(g.nombre).includes(q)) : xs.slice();
        return cmp ? f.sort(cmp) : f;
      };
      const fijados = this.datos.guiones.filter(g => g.fijado);
      const sueltos = this.datos.guiones.filter(g => !g.fijado);
      return { fijados: preparar(fijados), guiones: preparar(sueltos),
               totalFijados: fijados.length, totalGuiones: sueltos.length };
    }

    /* ---------- operaciones ---------- */
    /* Crea un guion al final de la lista. opciones: { nombre?, datos?, notas?, activar? (true) }. */
    crear(opciones) {
      const o = opciones || {};
      if (o.datos !== undefined && o.datos !== null && !esTablero(o.datos)) return no('Eso no es un esquema de pasos válido');
      const t = this.ahora();
      const g = { id: this.idNuevo(), nombre: this.nombreLibre(o.nombre), fijado: false,
                  creado: t, modificado: t, datos: o.datos ? clonar(o.datos) : null,
                  notas: sanearNotas(o.notas), notaActual: null,
                  documentos: o.documentos && typeof o.documentos === 'object' && !Array.isArray(o.documentos) ? clonar(o.documentos) : { contenedores: [], etiquetas: [], notas: [] } };
      this.datos.guiones.push(g);
      if (o.activar !== false) this.datos.activo = g.id;
      return si({ guion: g });
    }

    activar(id) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      this.datos.activo = id;
      return si({ guion: g });
    }

    renombrar(id, nombre) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      const n = String(nombre || '').trim();
      if (!n) return no('El nombre no puede quedar vacío');
      if (n === g.nombre) return si({ guion: g });
      if (this.datos.guiones.some(x => x !== g && plano(x.nombre) === plano(n))) return no('Ya hay un guion con ese nombre');
      g.nombre = n; g.modificado = this.ahora();
      return si({ guion: g });
    }

    fijar(id, fijado) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      g.fijado = !!fijado;
      return si({ guion: g });
    }

    /* Guarda el tablero de un guion. Solo cuenta como modificación si cambió de verdad, así
       volcar el tablero al cambiar de guion no altera el orden «Modificado». */
    guardarDatos(id, datos) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      if (!esTablero(datos)) return no('Eso no es un esquema de pasos válido');
      if (JSON.stringify(g.datos) === JSON.stringify(datos)) return si({ guion: g, cambio: false });
      g.datos = clonar(datos); g.modificado = this.ahora();
      return si({ guion: g, cambio: true });
    }

    /* Algo del guion cambió fuera de la biblioteca (p. ej. sus documentos): cuenta como modificación. */
    marcar(id) { const g = this.guion(id); if (!g) return no('Ese guion ya no existe'); g.modificado = this.ahora(); return si({ guion: g }); }

    /* ---------- notas del editor de texto (una por nodo del tablero) ---------- */
    nota(id, puntoId) { const g = this.guion(id); return (g && g.notas[puntoId]) || null; }

    /* Guarda lo que devuelve `Ed.document.get()` como nota del nodo. Solo cuenta como modificación
       si cambió de verdad (volcar el editor al cambiar de nota no altera «Modificado»). */
    guardarNota(id, puntoId, doc) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      if (!puntoId || !esNota(doc)) return no('Eso no es una nota válida');
      const n = sanearNotas({ [puntoId]: doc })[puntoId];
      if (JSON.stringify(g.notas[puntoId]) === JSON.stringify(n)) return si({ nota: n, cambio: false });
      g.notas[puntoId] = n; g.modificado = this.ahora();
      return si({ nota: n, cambio: true });
    }

    /* La nota que se abre al volver al editor (no exige que ya tenga texto). */
    fijarNotaActual(id, puntoId) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      g.notaActual = puntoId || null;
      return si({ guion: g });
    }

    /* Quita las notas de nodos que ya no existen en el tablero. Se llama al dejar un guion, cuando
       el historial del tablero ya no puede resucitarlos. */
    podarNotas(id, vivos) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      const set = new Set(vivos || []);
      let podadas = 0;
      Object.keys(g.notas).forEach(k => { if (!set.has(k)) { delete g.notas[k]; podadas++; } });
      if (g.notaActual && !set.has(g.notaActual)) g.notaActual = null;
      return si({ podadas });
    }

    /* Quita un guion. Si era el activo, el activo pasa a su vecino en la misma lista (el siguiente,
       si no el anterior), y si no queda nadie ahí, al primero de la otra; `activo` puede ser null. */
    eliminar(id) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      const todos = this.datos.guiones;
      const grupo = todos.filter(x => x.fijado === g.fijado), i = grupo.indexOf(g);
      const otro = todos.filter(x => x.fijado !== g.fijado);
      const vecino = grupo[i + 1] || grupo[i - 1] || otro[0] || null;
      this.datos.guiones = todos.filter(x => x !== g);
      if (this.datos.activo === id) this.datos.activo = vecino ? vecino.id : null;
      return si({ guion: g, activo: this.datos.activo });
    }

    /* Sube (salto -1) o baja (+1) un guion dentro de su lista, en el orden manual. */
    mover(id, salto) {
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      const todos = this.datos.guiones;
      const grupo = todos.filter(x => x.fijado === g.fijado);
      const i = grupo.indexOf(g), j = i + (salto < 0 ? -1 : 1);
      if (j < 0 || j >= grupo.length) return no('Ya está en el extremo');
      const a = todos.indexOf(g), b = todos.indexOf(grupo[j]);
      todos[a] = grupo[j]; todos[b] = g;             // intercambiar dos del mismo grupo = moverlo un puesto
      return si({ guion: g });
    }

    /* Soltar tras arrastrar: cambia de lista si hace falta y queda antes de `antesDe` (o al final
       de esa lista). opciones: { fijado, antesDe? }. */
    colocar(id, opciones) {
      const o = opciones || {};
      const g = this.guion(id); if (!g) return no('Ese guion ya no existe');
      const fijado = !!o.fijado;
      const resto = this.datos.guiones.filter(x => x !== g);
      const ref = o.antesDe && o.antesDe !== id ? resto.find(x => x.id === o.antesDe && x.fijado === fijado) : null;
      let idx;
      if (ref) idx = resto.indexOf(ref);
      else { idx = 0; resto.forEach((x, k) => { if (x.fijado === fijado) idx = k + 1; }); }
      const cambioLista = g.fijado !== fijado;
      g.fijado = fijado;
      resto.splice(idx, 0, g);
      this.datos.guiones = resto;
      return si({ guion: g, cambioLista });
    }
  }

  Object.assign(C, { Biblioteca, normalizar, esTablero, plano, FORMATO, NOMBRE, ORDENES });

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
