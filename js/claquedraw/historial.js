/* Claquedraw · historial de Claude
   Leo, 25-09-2026: «¿Se pueden revertir los cambios hechos con IA? Necesito que exista una especie de historial para ver los
   cambios que ha hecho la IA». Cada vez que Claude cambia un proyecto —en vivo o sobre su archivo, js/claquedraw/herramientas.js,
   `ejecutar`— queda una entrada en `documentos.historialClaude`, que viaja con el proyecto: cuándo, desde dónde (Cowork, Claude
   Code), con qué herramienta, un título, el detalle que devolvió y **el parche** para deshacerlo.
   · **El parche** es la diferencia entre el proyecto de antes y el de después: por claves en los objetos y, en las listas de cosas
     con id (nodos, notas, tramas, esquemas, notas de biblioteca…), elemento a elemento: qué se quitó (con su valor, para volver
     a ponerlo en su sitio), qué se puso (su huella) y qué cambió dentro. De lo de después solo guarda **la huella**, para saber
     si alguien lo volvió a tocar.
   · **Revertir un cambio no pisa lo que vino después**: se deshace lo que hizo Claude donde nadie lo ha vuelto a tocar; si algo
     se tocó después, se dice qué (un «choque») y no se hace nada, salvo que se pida revertir de todos modos (`forzar`). Se revierte
     sobre el mismo objeto (en la app el gestor guarda la referencia) y los esquemas tocados pasan por `normalizar` de Tramas.
   · Las fechas de modificación y el número de columnas se ponen solos: ni cuentan como choque ni se revierten.
   · **Tope**: los últimos 150 cambios; los parches más viejos se quitan (la entrada se queda como registro) cuando pasan de
     1,5 MB, porque el proyecto también vive en el almacenamiento de la app, que es pequeño. Los 3 últimos conservan siempre el suyo.
   El núcleo no toca el DOM y se carga en Node (test/historial.test.js); en la página va además el panel (`abrirPanel`). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const CLAVE = 'historialClaude', MAX = 150, MAX_BYTES = 1.5e6, MIN_CON_PARCHE = 3;
  const NO_CUENTAN = new Set(['modificado', 'columnas']);
  const clonar = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const no = aviso => ({ ok: false, aviso });

  /* ---------- huellas: el contenido sin mirar el orden de las claves ---------- */
  /* sin lo que se pone solo (las fechas de modificación, el número de columnas): cambia sin que nadie toque nada y no se revierte */
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (esObj(x)) return '{' + Object.keys(x).filter(k => x[k] !== undefined && !NO_CUENTAN.has(k)).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function huella(x) {
    const s = canon(x); let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  }
  /* la clave de un elemento de lista: su id (en la papelera, el de lo que guarda) */
  function claveDe(x) {
    if (!esObj(x)) return null;
    if (typeof x.id === 'string' || typeof x.id === 'number') return 'i:' + x.id;
    for (const [k, p] of [['nota', 'n'], ['esquema', 'e'], ['sub', 's'], ['personaje', 'p'], ['lienzo', 'l']]) if (esObj(x[k]) && x[k].id) return p + ':' + x[k].id;
    return null;
  }
  const claves = l => { const ks = l.map(claveDe); return ks.every(k => k !== null) && new Set(ks).size === ks.length ? ks : null; };
  /* el proyecto sin su historial. **Las listas que solo están si tienen algo** (los lienzos de un contenedor, la memoria de estilo del
     proyecto) van en la foto siempre, vacías si no hay (revisión del port a ClapBook: con la clave ausente en un lado, el parche
     guardaba la lista entera como un valor, y revertir a la fuerza el primer lienzo o la primera regla de Claude se llevaba lo que
     Leo añadió después; así va elemento a elemento, por su id). En el proyecto no se escriben vacías: `sinVacias`. */
  const OPCIONALES = ['memoriaEstilo'], OPCIONALES_CONTENEDOR = ['lienzos'];
  function foto(datos) {
    const x = clonar(datos) || {}; delete x[CLAVE];
    OPCIONALES.forEach(k => { if (x[k] === undefined) x[k] = []; });
    if (x.teatro === undefined) x.teatro = {};                    // los mods del teatro (1.1.63), tipo por tipo y mod por mod
    if (Array.isArray(x.contenedores)) x.contenedores.forEach(c => { if (esObj(c)) OPCIONALES_CONTENEDOR.forEach(k => { if (c[k] === undefined) c[k] = []; }); });
    return x;
  }
  function sinVacias(x) {
    if (!esObj(x)) return x;
    OPCIONALES.forEach(k => { if (Array.isArray(x[k]) && !x[k].length) delete x[k]; });
    if (esObj(x.teatro)) { Object.keys(x.teatro).forEach(k => { if (Array.isArray(x.teatro[k]) && !x.teatro[k].length) delete x.teatro[k]; }); if (!Object.keys(x.teatro).length) delete x.teatro; }
    if (Array.isArray(x.contenedores)) x.contenedores.forEach(c => { if (esObj(c)) OPCIONALES_CONTENEDOR.forEach(k => { if (Array.isArray(c[k]) && !c[k].length) delete c[k]; }); });
    return x;
  }

  /* ---------- la diferencia ---------- */
  const tipoDe = x => (Array.isArray(x) ? 'arr' : esObj(x) ? 'obj' : 'val');
  const valor = (a, b) => ({ t: 'v', a: clonar(a), h: huella(b) });
  function diferencia(a, b) {
    if (a === b) return null;
    const ta = tipoDe(a);
    if (ta !== tipoDe(b)) return valor(a, b);
    if (ta === 'obj') {
      const k = {};
      new Set([...Object.keys(a), ...Object.keys(b)]).forEach(key => {
        if (NO_CUENTAN.has(key)) return;
        const hayA = a[key] !== undefined, hayB = b[key] !== undefined;
        if (!hayA && !hayB) return;
        if (!hayA) k[key] = { t: 'v', na: 1, h: huella(b[key]) };
        else if (!hayB) k[key] = { t: 'v', a: clonar(a[key]), h: '-' };
        else { const d = diferencia(a[key], b[key]); if (d) k[key] = d; }
      });
      return Object.keys(k).length ? { t: 'o', k } : null;
    }
    if (ta === 'arr') {
      const ka = claves(a), kb = claves(b);
      if (!ka || !kb) return canon(a) === canon(b) ? null : valor(a, b);
      const ia = new Map(ka.map((x, i) => [x, i])), ib = new Map(kb.map((x, i) => [x, i]));
      const q = {}, p = {}, c = {};
      ka.forEach((x, i) => { if (!ib.has(x)) q[x] = { v: clonar(a[i]), ant: ka.slice(Math.max(0, i - 3), i).reverse() }; });
      kb.forEach((x, i) => { if (!ia.has(x)) p[x] = huella(b[i]); else { const d = diferencia(a[ia.get(x)], b[i]); if (d) c[x] = d; } });
      const comA = ka.filter(x => ib.has(x)), comB = kb.filter(x => ia.has(x));
      const d = { t: 'l' };
      if (Object.keys(q).length) d.q = q;
      if (Object.keys(p).length) d.p = p;
      if (Object.keys(c).length) d.c = c;
      if (comA.join('\u0001') !== comB.join('\u0001')) d.o = { a: comA, b: comB };
      return d.q || d.p || d.c || d.o ? d : null;
    }
    return valor(a, b);
  }

  /* ---------- revertir un parche sobre lo de ahora ---------- */
  /* Devuelve el valor revertido; en `choques` apunta la ruta de lo que se tocó después (con `forzar`, se revierte igual). */
  function revertir(c, d, ruta, choques, forzar) {
    if (d.t === 'v') {
      if ((c === undefined ? '-' : huella(c)) !== d.h) { choques.push(ruta); if (!forzar) return c; }
      return d.na ? undefined : clonar(d.a);
    }
    if (d.t === 'o') {
      if (!esObj(c)) { choques.push(ruta); return c; }
      const out = Object.assign({}, c);
      Object.keys(d.k).forEach(key => {
        const x = revertir(c[key], d.k[key], ruta.concat(key), choques, forzar);
        if (x === undefined) delete out[key]; else out[key] = x;
      });
      return out;
    }
    if (!Array.isArray(c)) { choques.push(ruta); return c; }
    const l = c.slice(), pos = k => l.findIndex(x => claveDe(x) === k);
    /* lo que puso el cambio, fuera (si nadie lo tocó después) */
    Object.keys(d.p || {}).forEach(k => {
      const i = pos(k); if (i < 0) return;
      if (huella(l[i]) !== d.p[k]) { choques.push(ruta.concat(k)); if (!forzar) return; }
      l.splice(i, 1);
    });
    /* lo que cambió dentro, de vuelta */
    Object.keys(d.c || {}).forEach(k => {
      const i = pos(k); if (i < 0) { choques.push(ruta.concat(k)); return; }
      l[i] = revertir(l[i], d.c[k], ruta.concat(k), choques, forzar);
    });
    /* el orden de antes (de lo que estaba antes y después), si nadie lo ha vuelto a cambiar; antes de reponer lo quitado, que va
       detrás de su vecino de antes */
    if (d.o) {
      const enA = new Set(d.o.a), sitios = [], ks = [];
      l.forEach((x, i) => { const k = claveDe(x); if (enA.has(k)) { sitios.push(i); ks.push(k); } });
      const tras = d.o.b.filter(k => ks.includes(k));
      if (ks.join('\u0001') !== tras.join('\u0001')) { choques.push(ruta.concat('(orden)')); if (!forzar) ks.length = 0; }
      if (ks.length) {
        const quiero = d.o.a.filter(k => ks.includes(k)), porClave = new Map(sitios.map(i => [claveDe(l[i]), l[i]]));
        sitios.forEach((i, n) => { l[i] = porClave.get(quiero[n]); });
      }
    }
    /* lo que quitó, otra vez en su sitio: detrás del que tenía delante (en el orden de antes) */
    Object.keys(d.q || {}).forEach(k => {
      if (pos(k) >= 0) return;
      const x = d.q[k]; let i = 0;
      for (const a of x.ant || []) { const j = pos(a); if (j >= 0) { i = j + 1; break; } }
      l.splice(i, 0, clonar(x.v));
    });
    return l;
  }

  /* ---------- las entradas ---------- */
  const lista = docs => ((docs && docs.datos && docs.datos[CLAVE]) || []).slice();
  const entrada = (docs, id) => lista(docs).find(e => e.id === id) || null;
  let ultimoId = '';
  function nuevoId(t) {
    let id = 'c' + Math.floor(t || Date.now()).toString(36) + Math.random().toString(36).slice(2, 5);
    while (id === ultimoId) id += Math.random().toString(36).slice(2, 3);
    return (ultimoId = id);
  }
  function recortar(l) {
    while (l.length > MAX) l.shift();
    let bytes = 0;
    for (let i = l.length - 1, n = 0; i >= 0; i--) {
      const e = l[i]; if (!e.parche) continue;
      n++; bytes += JSON.stringify(e.parche).length;
      if (n > MIN_CON_PARCHE && bytes > MAX_BYTES) { e.parche = null; e.sinParche = 1; }
    }
  }
  /* Apunta un cambio. `x.antes`: la foto de antes (null si no se puede deshacer, como crear un proyecto). Devuelve la entrada, o
     null si no cambió nada. */
  function anotar(docs, x) {
    const parche = x.antes ? diferencia(x.antes, foto(docs.datos)) : null;
    if (x.antes && !parche && !x.nombreProyecto) return null;
    const l = docs.datos[CLAVE] || (docs.datos[CLAVE] = []);
    const e = { id: nuevoId(x.ahora), fecha: Math.floor(x.ahora || Date.now()), herramienta: String(x.herramienta || ''), titulo: String(x.titulo || x.herramienta || 'Cambio') };
    if (x.donde) e.donde = clonar(x.donde);
    if (x.texto) e.detalle = String(x.texto).slice(0, 4000);
    if (x.origen) e.origen = String(x.origen);
    if (x.modo) e.modo = x.modo === 'vivo' ? 'vivo' : 'archivo';
    if (x.nombreProyecto) e.nombreProyecto = { a: x.nombreProyecto.a, b: x.nombreProyecto.b };
    e.parche = parche;
    if (!x.antes) e.sinParche = 1;
    l.push(e);
    recortar(l);
    return e;
  }
  /* Lo que queda en el proyecto de cada entrada al abrirlo (documentos.js, `normalizar`) */
  function sanear(l) {
    const ids = new Set();
    const out = (Array.isArray(l) ? l : []).filter(e => e && typeof e === 'object' && typeof e.id === 'string' && e.id && !ids.has(e.id) && (ids.add(e.id), true) && +e.fecha > 0)
      .map(e => {
        const x = { id: e.id, fecha: +e.fecha, herramienta: String(e.herramienta || ''), titulo: String(e.titulo || e.herramienta || 'Cambio') };
        ['donde', 'detalle', 'origen', 'modo', 'nombreProyecto', 'revertido', 'sinParche'].forEach(k => { if (e[k] !== undefined && e[k] !== null) x[k] = clonar(e[k]); });
        x.parche = e.parche && typeof e.parche === 'object' && e.parche.t ? clonar(e.parche) : null;
        return x;
      });
    recortar(out);
    return out;
  }

  /* ---------- revertir una entrada ---------- */
  /* Los esquemas que cambiaron pasan por `normalizar` de Tramas (una nota que colgaba de un nodo que ya no está, fuera); se dice
     si algo se cae. */
  function limpiarEsquemas(antes, nuevo) {
    const T = raiz.Tramas, avisos = [];
    if (!T || !T.normalizar) return avisos;
    const previos = new Map();
    (antes.contenedores || []).forEach(c => (c.esquemas || []).forEach(e => previos.set(e.id, canon(e.datos))));
    (nuevo.contenedores || []).forEach(c => (c.esquemas || []).forEach(e => {
      if (!e.datos || previos.get(e.id) === canon(e.datos)) return;
      const n = T.normalizar(e.datos), quitadas = (e.datos.notas || []).length - n.notas.length, saltos = (e.datos.saltos || []).length - n.saltos.length;
      if (quitadas > 0) avisos.push('en «' + e.nombre + '» se quitan ' + quitadas + (quitadas === 1 ? ' nota que colgaba' : ' notas que colgaban') + ' de lo que se deshace');
      if (saltos > 0) avisos.push('en «' + e.nombre + '» se quitan ' + saltos + (saltos === 1 ? ' salto' : ' saltos'));
      e.datos = n;
    }));
    return avisos;
  }
  function calcular(docs, e, forzar) {
    const actual = foto(docs.datos), choques = [];
    let nuevo = e.parche ? revertir(actual, e.parche, [], choques, forzar) : clonar(actual);
    const avisos = limpiarEsquemas(actual, nuevo);
    if (C.normalizarDocumentos) nuevo = C.normalizarDocumentos(nuevo);
    sinVacias(nuevo);
    delete nuevo[CLAVE];
    return { actual, nuevo, choques, avisos };
  }
  function comprobar(docs, id) {
    const e = entrada(docs, id);
    if (!e) return no('Ese cambio ya no está en el historial');
    if (e.revertido) return no('Ese cambio ya está revertido');
    if (!e.parche && !e.nombreProyecto) return no(e.herramienta === 'crear_proyecto' ? 'Crear el proyecto no se revierte desde aquí' : 'Ese cambio es antiguo y ya no guarda cómo deshacerlo');
    return { ok: true, e };
  }
  /* ¿Se puede revertir limpio? { ok, choques: [texto…] } sin tocar nada */
  function probar(docs, id) {
    const x = comprobar(docs, id); if (!x.ok) return x;
    const r = calcular(docs, x.e, false);
    return { ok: !r.choques.length, choques: r.choques.map(ruta => describir(docs, ruta)), avisos: r.avisos, aviso: r.choques.length ? 'Después de este cambio se tocaron algunas de las mismas cosas' : '' };
  }
  /* Revierte la entrada en los documentos (en el mismo objeto). `op.forzar` revierte aunque haya choques; `op.por`, quién.
     Devuelve { ok, antes (para deshacerlo con `reponer`), choques, avisos, nombreProyecto (el de antes, si el cambio lo renombró) }. */
  function revertirEntrada(docs, id, op) {
    op = op || {};
    const x = comprobar(docs, id); if (!x.ok) return x;
    const r = calcular(docs, x.e, !!op.forzar);
    if (r.choques.length && !op.forzar) return { ok: false, choques: r.choques.map(ruta => describir(docs, ruta)), aviso: 'Después de este cambio se tocaron algunas de las mismas cosas' };
    const antes = JSON.stringify(r.actual), choques = r.choques.map(ruta => describir(docs, ruta));
    Object.keys(docs.datos).forEach(k => { if (k !== CLAVE) delete docs.datos[k]; });
    Object.assign(docs.datos, r.nuevo);
    x.e.revertido = Object.assign({ fecha: Math.floor(op.ahora || Date.now()) }, op.por ? { por: String(op.por) } : {}, choques.length ? { forzado: choques.length } : {});
    return { ok: true, entrada: x.e, antes, choques, avisos: r.avisos, nombreProyecto: x.e.nombreProyecto ? x.e.nombreProyecto.a : undefined };
  }
  /* Deshace una reversión: vuelve lo de antes (todo menos el historial) y la entrada deja de estar revertida. */
  function reponer(docs, antes, id) {
    const x = sinVacias(JSON.parse(antes));
    Object.keys(docs.datos).forEach(k => { if (k !== CLAVE) delete docs.datos[k]; });
    Object.assign(docs.datos, x);
    const e = entrada(docs, id); if (e) delete e.revertido;
    return e;
  }
  /* Cómo estaba lo que tocó un cambio (para enseñarlo al lado de lo de ahora): lo de ahora con ese cambio deshecho a la fuerza. */
  function antesDe(docs, id) {
    const e = entrada(docs, id); if (!e || (!e.parche && !e.nombreProyecto)) return null;
    return calcular(docs, e, true).nuevo;
  }

  /* ---------- una ruta del parche, en palabras ---------- */
  const COLECCION = { contenedores: 'contenedor', esquemas: 'esquema', subs: 'biblioteca', etiquetas: 'segmento', lineas: 'trama', actos: 'acto',
    puntos: 'nodo', saltos: 'salto', elenco: 'personaje', carpetas: 'carpeta', carpetasElenco: 'carpeta', grupos: 'grupo', gruposElenco: 'grupo',
    versiones: 'versión', secciones: 'sección', papelera: 'papelera', lienzos: 'lienzo', nodos: 'nodo del lienzo', cables: 'cable' };
  const CAMPO = { titulo: 'título', descripcion: 'descripción', html: 'texto', texto: 'texto', nombre: 'nombre', color: 'color', col: 'columna', lineaId: 'trama',
    tipo: 'tipo', etiquetaId: 'segmento', subId: 'biblioteca', characters: 'personajes', desde: 'inicio', celdas: 'largo', fondo: 'fondo', ordenArbol: 'orden',
    items: 'lo de dentro', cortado: 'descartado', oculta: 'oculta', '(orden)': 'orden', deId: 'sitio', aId: 'sitio', nivel: 'escalón',
    x: 'posición', y: 'posición', estado: 'estado', salida: 'salida', instruccion: 'instrucción', md: 'texto', puerto: 'puerto' };
  const corto = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 40 ? t.slice(0, 39) + '…' : t; };
  function describir(docs, ruta) {
    const partes = []; let x = docs.datos;
    for (let i = 0; i < ruta.length; i++) {
      const seg = ruta[i], previo = ruta[i - 1];
      if (/^[inespl]:/.test(seg) && Array.isArray(x)) {
        const item = x.find(y => claveDe(y) === seg), id = seg.slice(2);
        const nombre = item ? item.nombre || item.titulo || (item.texto && corto(item.texto)) || (item.nota && item.nota.titulo) || id : id;
        const tipo = previo === 'notas' ? (item && item.titulo !== undefined ? 'nota' : 'nota del esquema') : COLECCION[previo] || previo;
        partes.push(tipo + ' «' + nombre + '»'); x = item; continue;
      }
      x = x && typeof x === 'object' ? x[seg] : undefined;
      if (i === ruta.length - 1 && !COLECCION[seg] && seg !== 'notas' && seg !== 'datos') partes.push(CAMPO[seg] || seg);
    }
    return partes.join(' › ') || 'el proyecto';
  }

  /* Lo que devuelven las herramientas lleva los ids (Claude los necesita para nombrar las cosas); para Leo son ruido: aquí se
     quitan, sin tocar nada de lo que va entre «». «nodo p5 «Bagre»» → «nodo «Bagre»», «[dmu…, Azul]» → «[Azul]». */
  const ID = '(?:[plnasc]\\d+|x\\d+|[dc](?=[a-z0-9]*\\d)[a-z0-9]{8,}|[a-z]+(?::[a-z0-9]+)+)';
  function sinIds(t) {
    const guardados = [];
    let x = String(t || '').replace(/«[^»]*»/g, m => { guardados.push(m); return '\uE001' + (guardados.length - 1) + '\uE002'; });
    x = x.replace(new RegExp('\\b' + ID + '\\s+(?=\\uE001)', 'g'), '')
      .replace(new RegExp('\\s*\\(' + ID + '\\)', 'g'), '')
      .replace(/\s*\(extremos [^)]*\)/g, '')
      .replace(new RegExp('\\s*·\\s*id\\s+' + ID, 'g'), '')
      .replace(new RegExp('\\[' + ID + ',\\s*', 'g'), '[')
      .replace(new RegExp('([▢◇])\\s+' + ID + '\\s+', 'g'), '$1 ')
      .replace(new RegExp('\\b(nota|salto|nodo|trama|acto|segmento|sección|biblioteca|esquema|contenedor|carpeta|grupo|personaje)\\s+' + ID + '(?=[\\s:,.)]|$)', 'g'), '$1');
    return x.replace(/\uE001(\d+)\uE002/g, (m, i) => guardados[+i]);
  }

  C.historial = { CLAVE, foto, diferencia, revertir, huella, anotar, sanear, lista, entrada, probar, revertirEntrada, reponer, antesDe, describir, sinIds, MAX, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (typeof document === 'undefined') return;

  /* ====================================================================
     El panel «Historial de Claude» (en la página)
     ==================================================================== */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dos = n => String(n).padStart(2, '0');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function dia(ts) {
    const f = new Date(ts), hoy = new Date(), ayer = new Date(hoy.getTime() - 864e5), mismo = (a, b) => a.toDateString() === b.toDateString();
    return mismo(f, hoy) ? 'Hoy' : mismo(f, ayer) ? 'Ayer' : f.getDate() + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][f.getMonth()] + (f.getFullYear() !== hoy.getFullYear() ? ' de ' + f.getFullYear() : '');
  }
  const hora = ts => { const f = new Date(ts); return dos(f.getHours()) + ':' + dos(f.getMinutes()); };
  const cuando = ts => { const d = dia(ts); return (d === 'Hoy' || d === 'Ayer' ? d.toLowerCase() : new Date(ts).getDate() + ' ' + MES[new Date(ts).getMonth()]) + ' ' + hora(ts); };
  const ICO = {
    claude: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 2.2v2.4M8 11.4v2.4M2.2 8h2.4M11.4 8h2.4M3.9 3.9l1.7 1.7M10.4 10.4l1.7 1.7M3.9 12.1l1.7-1.7M10.4 5.6l1.7-1.7"/></svg>',
    ir: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h6.5V10"/><path d="M12.5 3.5 4 12"/></svg>',
    ver: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.4" y="3" width="11.2" height="10" rx="1.6"/><path d="M8 3v10"/></svg>',
    revertir: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 6.2h6.4a3.4 3.4 0 0 1 0 6.8H6"/><path d="M5.8 3.4 3 6.2 5.8 9"/></svg>'
  };
  let capa = null, ganchos = null, abiertas = new Set();
  function cerrar() { if (capa) { capa.remove(); capa = null; document.removeEventListener('keydown', alTeclado, true); } }
  /* Esc cierra el panel, salvo que encima haya una comparación («Ver cambios») o una confirmación: primero se cierran esas */
  function alTeclado(e) { if (e.key === 'Escape' && capa && !document.querySelector('#dlg[open], .vs-capa')) { e.preventDefault(); e.stopPropagation(); cerrar(); } }
  /* `g`: { proyecto: () => nombre, entradas: () => [...] (la más nueva primero), revertir(id) → Promise, ir(e), ver(e) } */
  function abrirPanel(g) {
    cerrar(); ganchos = g; abiertas = new Set();
    capa = document.createElement('div');
    capa.className = 'hc-capa';
    capa.innerHTML = '<div class="hc-caja" role="dialog" aria-label="Historial de Claude"><header class="hc-cab"></header><div class="hc-cuerpo"></div>'
      + '<footer class="hc-pie">Los cambios de Claude se guardan con el proyecto (los últimos ' + MAX + '). Revertir uno deshace solo lo suyo: lo que hiciste después se queda.</footer></div>';
    capa.addEventListener('click', alClic);
    document.body.appendChild(capa);
    document.addEventListener('keydown', alTeclado, true);
    pintar();
  }
  function pintar() {
    if (!capa || !ganchos) return;
    const es = ganchos.entradas(), vivos = es.filter(e => !e.revertido).length;
    capa.querySelector('.hc-cab').innerHTML = '<span class="hc-ic">' + ICO.claude + '</span><span class="hc-cab-tit">Historial de Claude</span>'
      + '<span class="hc-proyecto">' + esc(ganchos.proyecto()) + '</span><span class="spacer"></span>'
      + '<span class="hc-cuenta">' + es.length + (es.length === 1 ? ' cambio' : ' cambios') + (es.length !== vivos ? ' · ' + (es.length - vivos) + (es.length - vivos === 1 ? ' revertido' : ' revertidos') : '') + '</span>'
      + '<button type="button" class="btn" data-hc-cerrar>Cerrar</button>';
    const cuerpo = capa.querySelector('.hc-cuerpo');
    if (!es.length) { cuerpo.innerHTML = '<div class="hc-vacio"><b>Claude aún no ha cambiado nada en este proyecto.</b><span>Cuando lo haga, cada cambio saldrá aquí con lo que hizo, y podrás verlo y revertirlo.</span></div>'; return; }
    let html = '', diaActual = '';
    es.forEach(e => {
      const d = dia(e.fecha);
      if (d !== diaActual) { diaActual = d; html += '<div class="hc-dia">' + esc(d) + '</div>'; }
      /* el detalle que devolvió la herramienta, sin lo técnico (las referencias, dónde se escribió) */
      const detalle = String(e.detalle || '').split('\n').filter(l => l.trim()).filter(l => !/^\(Escrito en |^\(Queda en el historial|^Creados: |^\(nada cambió\)/.test(l));
      const cabecera = detalle.length && /operaci(ón|ones) hechas?\.$|:$/.test(detalle[0]) ? detalle.slice(1) : detalle;
      const abierta = abiertas.has(e.id), visibles = abierta ? cabecera : cabecera.slice(0, 3);
      html += '<article class="hc-entrada' + (e.revertido ? ' revertida' : '') + '" data-hc="' + esc(e.id) + '">'
        + '<div class="hc-fila"><span class="hc-hora">' + esc(hora(e.fecha)) + '</span><span class="hc-tit">' + esc(e.titulo) + '</span>'
        + (e.origen ? '<span class="hc-chip">' + esc(e.origen) + '</span>' : '')
        + '<span class="hc-chip hc-chip--modo" title="' + (e.modo === 'archivo' ? 'Con el proyecto cerrado, sobre su archivo' : 'Con el proyecto abierto en ClapCraft') + '">' + (e.modo === 'archivo' ? 'en el archivo' : 'en vivo') + '</span>'
        + (e.revertido ? '<span class="hc-revertido" title="' + esc('Revertido ' + cuando(e.revertido.fecha) + (e.revertido.por ? ' por ' + e.revertido.por : '') + (e.revertido.forzado ? ' (de todos modos)' : '')) + '">Revertido ' + esc(cuando(e.revertido.fecha)) + '</span>' : '')
        + '</div>'
        + (visibles.length ? '<ul class="hc-detalle">' + visibles.map(l => '<li>' + esc(sinIds(l.replace(/^\d+\.\s*/, ''))) + '</li>').join('') + '</ul>' : '')
        + (cabecera.length > 3 ? '<button type="button" class="hc-mas" data-hc-mas>' + (abierta ? 'Menos' : (cabecera.length - 3) + ' más…') + '</button>' : '')
        + '<div class="hc-acc">'
        + (e.donde && e.donde.tipo !== 'proyecto' ? '<button type="button" class="hc-boton" data-hc-ir title="Llevarme ahí">' + ICO.ir + '<span>Ir</span></button>' : '')
        + (e.parche && !e.revertido ? '<button type="button" class="hc-boton" data-hc-ver title="Cómo estaba antes y cómo está ahora">' + ICO.ver + '<span>Ver cambios</span></button>' : '')
        + (e.parche && !e.revertido ? '<button type="button" class="hc-boton hc-boton--revertir" data-hc-revertir>' + ICO.revertir + '<span>Revertir</span></button>'
          : !e.revertido ? '<span class="hc-nota">' + (e.herramienta === 'crear_proyecto' ? 'Claude creó el proyecto' : 'Muy antiguo: ya no se puede revertir') + '</span>' : '')
        + '</div></article>';
    });
    cuerpo.innerHTML = html;
  }
  async function alClic(e) {
    if (e.target === capa || e.target.closest('[data-hc-cerrar]')) { cerrar(); return; }
    const art = e.target.closest('[data-hc]'); if (!art || !ganchos) return;
    const x = ganchos.entradas().find(y => y.id === art.dataset.hc); if (!x) return;
    if (e.target.closest('[data-hc-mas]')) { if (abiertas.has(x.id)) abiertas.delete(x.id); else abiertas.add(x.id); pintar(); return; }
    if (e.target.closest('[data-hc-ir]')) { cerrar(); ganchos.ir(x); return; }
    if (e.target.closest('[data-hc-ver]')) { ganchos.ver(x); return; }
    const b = e.target.closest('[data-hc-revertir]');
    if (b) { b.disabled = true; try { await ganchos.revertir(x.id); } finally { pintar(); } }
  }
  Object.assign(C.historial, { abrirPanel, cerrarPanel: cerrar, repintarPanel: pintar, abierto: () => !!capa, cuando });
})(typeof window !== 'undefined' ? window : globalThis);
