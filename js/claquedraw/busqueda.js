/* Claquedraw · buscar, filtrar y ordenar las notas de una biblioteca
   Viene de ClapBook (js/clapbook/busqueda.js y el motor de filtros de su gestor.js), con el **color de la nota** en lugar de las
   etiquetas: ClapCraft no tiene marcas y el color (uno de C.TONOS_NOTA) es lo que Leo le pone a mano a cualquier nota.
   · **La consulta** de la caja de buscar: palabras sueltas (tienen que estar todas), "frases entre comillas", `titulo:palabra`
     (solo en el título; también `title:`) y `-palabra` (que no esté). Sin mayúsculas ni acentos: «cancion» encuentra «Canción».
     El texto de una nota es su HTML del editor pasado a texto (C.conversor.textoPlano), guardado por id mientras el html no
     cambie; los nombres de los personajes van en sus bloques (p.sp-character), así que también se encuentran.
   · **Los órdenes** (`ORDENES`; en un segmento, además, el manual: `ORDENES_SEG`) y el filtro por color (`filtrar`).
   · **El filtro efectivo** (`efectivo`): una biblioteca tiene su filtro general y cada segmento el suyo. En la biblioteca manda el
     general; en el segmento expandido, el del segmento; lo que no pone el que manda, lo pone el otro. «Poner» es tener la clave,
     aunque sea '' («todas las notas») u 'manual': así un segmento puede mandar sobre el general.
   Modelo puro, sin DOM: se carga en Node (test/busqueda.test.js) y en la página (después de conversor.js y documentos.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const req = typeof require === 'function' ? require : null;
  const V = () => C.conversor || (req && req('./conversor.js').conversor);
  const tonosDe = t => t || C.TONOS_NOTA || (req && req('./documentos.js').TONOS_NOTA) || [];

  /* el texto sin acentos ni mayúsculas y, para cada carácter de ese texto, su posición en el original */
  function normal(s) {
    const t = String(s || ''); let out = ''; const mapa = [];
    for (let i = 0; i < t.length; i++) {
      const c = t[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (let k = 0; k < c.length; k++) { out += c[k]; mapa.push(i); }
    }
    mapa.push(t.length);
    return { t: out, mapa };
  }
  const plano = s => normal(s).t;

  /* la consulta, por partes */
  function analizar(q) {
    const c = { terminos: [], frases: [], titulo: [], excluir: [] };
    const re = /(-?)(?:(titulo|title):)?(?:"([^"]*)"|(\S+))/gi;
    let m;
    while ((m = re.exec(String(q || '')))) {
      const neg = !!m[1], campo = (m[2] || '').toLowerCase(), frase = m[3] !== undefined, v = (frase ? m[3] : m[4]) || '';
      if (!v.trim()) continue;
      const p = plano(v);
      if (neg) c.excluir.push(p);
      else if (campo) c.titulo.push(p);
      else if (frase) c.frases.push(p);
      else c.terminos.push(p);
    }
    c.vacia = !c.terminos.length && !c.frases.length && !c.titulo.length;
    return c;
  }

  /* el texto plano de una nota, entero (el textoDe de gestor.js recorta a 320 caracteres para las tarjetas); se guarda por id y
     se vuelve a sacar si su html es otro */
  const cache = new Map();
  function textoDe(n) {
    if (!n) return '';
    const html = n.html || '';
    if (n.id == null) return V().textoPlano(html);
    const hay = cache.get(n.id);
    if (hay && hay.html === html) return hay.t;
    const t = V().textoPlano(html);
    cache.set(n.id, { html, t });
    return t;
  }

  /* ¿casa una nota? (título y texto) y con qué fuerza: 0 si no casa; el título pesa más */
  function puntuar(n, c) {
    if (!c || c.vacia) return 0;
    const tit = plano(n.titulo), cuerpo = plano(textoDe(n)), todo = tit + '\n' + cuerpo;
    if (c.excluir.some(x => todo.includes(x))) return 0;
    if (!c.titulo.every(x => tit.includes(x))) return 0;
    if (!c.terminos.every(x => todo.includes(x)) || !c.frases.every(x => todo.includes(x))) return 0;
    let p = 1;
    [...c.terminos, ...c.frases, ...c.titulo].forEach(x => { if (tit.includes(x)) p += tit.startsWith(x) ? 12 : 8; p += Math.min(5, cuerpo.split(x).length - 1); });
    return p;
  }

  /* ---------- órdenes ---------- */
  const ORDENES = [['modificada', 'Modificadas recientemente'], ['creada', 'Creadas recientemente'], ['antigua', 'Creadas hace más tiempo'],
    ['titulo', 'Por título (A–Z)'], ['color', 'Por color']];
  const ORDENES_SEG = [['manual', 'Orden manual (arrastrando)'], ...ORDENES];
  const cmp = (a, b) => (a > b) - (a < b);
  const porTitulo = (a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es', { sensitivity: 'base', numeric: true });
  /* una copia ordenada (el sort es estable: a igualdad, el orden de entrada); 'manual' o uno que no existe, tal cual */
  function ordenar(notas, orden, tonos) {
    const xs = (notas || []).slice();
    if (orden === 'modificada') return xs.sort((a, b) => cmp(b.modificado || 0, a.modificado || 0));
    if (orden === 'creada') return xs.sort((a, b) => cmp(b.creado || 0, a.creado || 0));
    if (orden === 'antigua') return xs.sort((a, b) => cmp(a.creado || 0, b.creado || 0));
    if (orden === 'titulo') return xs.sort(porTitulo);
    if (orden === 'color') {
      /* en el orden de la paleta; un tono que no está en ella, detrás de los suyos, y las notas sin color al final */
      const ts = tonosDe(tonos), pos = n => (!n.color ? ts.length + 1 : ts.includes(n.color) ? ts.indexOf(n.color) : ts.length);
      return xs.sort((a, b) => pos(a) - pos(b));
    }
    return xs;
  }

  /* ---------- el filtro general y el del segmento ----------
     g: el de la biblioteca; sg: el del segmento. Cada uno { color?, orden? }: color es un tono, 'sin' (sin color) o '' (todas,
     puesto a propósito); orden, una clave de ORDENES_SEG. Devuelve { color (null = todas), orden, heredado (en el expandido: lo
     que viene del general), propio (en la biblioteca: el segmento lleva algo suyo que el general no pisa), propioColor y
     propioOrden (cuál de las dos es suya: la marca de la tarjeta solo enseña esas; lo demás lo pone el general) }. */
  const tiene = (f, k) => f[k] !== undefined;
  function efectivo(g, sg, enExpandido) {
    g = g || {}; sg = sg || {};
    const [a, b] = enExpandido ? [sg, g] : [g, sg];
    const color = tiene(a, 'color') ? a.color : tiene(b, 'color') ? b.color : '';
    const orden = tiene(a, 'orden') ? a.orden : tiene(b, 'orden') ? b.orden : 'manual';
    const propioColor = !enExpandido && !g.color && !!sg.color;
    const propioOrden = !enExpandido && !g.orden && !!sg.orden && sg.orden !== 'manual';
    return {
      color: color || null, orden: orden || 'manual',
      heredado: {
        color: !!enExpandido && !tiene(sg, 'color') && !!g.color,
        orden: !!enExpandido && !tiene(sg, 'orden') && !!g.orden && g.orden !== 'manual'
      },
      propio: propioColor || propioOrden, propioColor, propioOrden
    };
  }
  /* las notas que casan con el color del filtro, en su orden */
  function filtrar(notas, f, tonos) {
    f = f || {};
    const xs = (notas || []).filter(n => !f.color || (f.color === 'sin' ? !n.color : n.color === f.color));
    return ordenar(xs, f.orden, tonos);
  }
  /* la fecha que se enseña de una nota: la de creación si se ordena por ella (`fecha`: el formato de gestor.js) */
  const fechaSegun = (n, orden, fecha) => (orden === 'creada' || orden === 'antigua' ? 'creada ' + fecha(n.creado || n.modificado) : fecha(n.modificado));

  C.busqueda = { normal, plano, analizar, textoDe, puntuar, ORDENES, ORDENES_SEG, ordenar, efectivo, filtrar, fechaSegun };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
