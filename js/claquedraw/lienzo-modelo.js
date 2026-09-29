/* Claquedraw · lienzo de nodos (modelo)
   Leo, 27-09-2026: «En páginas web (como Dreamina) hay una funcionalidad llamada "Space", que es un lienzo donde se conectan
   imágenes, textos y otros elementos… Quiero algo similar en ClapCraft, un lienzo con nodos donde se conecten notas, notas con
   imágenes y esquemas; en lugar de generar videos, nosotros generamos guiones y también los partimos». Y: «También déjame incluir
   segmentos y personajes».
   Un lienzo es una pieza del árbol (como un esquema o una biblioteca; su sitio lo lleva documentos.js) con **nodos** y **cables**:
   · **Entradas** (texto, imagen, nota, segmento, biblioteca, esquema, personaje): no tienen puertos de entrada; apuntan a algo del
     proyecto (por id: si eso ya no está, la entrada está «rota», se dice y no se borra nada) o lo llevan dentro (texto, imagen).
   · **Operaciones** (generar, partir, escaleta, resumir, reescribir, traducir, prompt): tienen puertos de entrada y las **ejecuta
     Claude** desde Cowork o Claude Code (la app no llama a ninguna IA). Su salida es un objeto real de ClapCraft (el documento de un
     esquema, las notas de una biblioteca, un esquema, una nota) que Claude escribe con las demás herramientas y apunta aquí con
     `completar`.
   Un nodo: `{ id, tipo, x, y, w?, titulo?, datos: {…}, estado?, salida?, error?, pedido?, hecho?, huella? }` (las entradas no
   llevan estado). Un cable: `{ id, de, a, puerto }`: de la salida de `de` al puerto de entrada `puerto` de `a`.
   **Qué lleva cada cable**: cada tipo dice qué da su salida (`da`, una o varias **clases**: texto, imagen, nota, segmento,
   biblioteca, esquema, guion, personaje, fragmentos) y cada puerto qué acepta (`acepta`); un cable vale si comparten alguna. Nada
   entra en una entrada, no hay ciclos, y un puerto «uno» lleva un cable como mucho (conectar otro **lo sustituye**, como en
   ComfyUI; con `{ reemplazar: false }` se rechaza).
   **Estado de una operación**: 'nuevo' (sin ejecutar) → 'pendiente' (Leo pulsó ▶: `pedido` = fecha) → 'hecho' (`salida`, `hecho`
   = fecha) o 'error' (`error`, el texto). **Desactualizada no es un estado guardado: se calcula**. Al completarse se guarda su
   `huella` = { datos, entradas, contenido?, formulas? }: la huella de sus datos (instrucción, fórmulas, opciones, destino), la de sus cables con lo que
   traen (los datos de cada entrada; de cada operación anterior, su salida y cuándo se hizo) y, si se da una `firma` (documentos.js,
   `firmaEntrada`), la del contenido de lo que apuntan las entradas (una nota que se reescribe) y, si elige fórmulas (1.1.60), la de
   lo que dicen (`firma` de la operación misma). Una operación hecha está
   desactualizada si alguna de esas huellas ya no casa (`motivo`: 'instruccion' —también si cambió el texto de una de sus
   fórmulas—, 'entradas' o 'contenido') o si una operación de
   la que depende no está hecha o está desactualizada ('cadena'). El contenido solo cuenta si se guardó con firma y se pregunta con
   firma.
   Modelo puro, sin DOM: se carga en Node (test/lienzo.test.js). Cada operación devuelve { ok, aviso?, … }. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  const clonar = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});
  const cadena = (v, max) => (typeof v === 'string' ? (max ? v.slice(0, max) : v) : '');
  const idDe = v => (typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' && isFinite(v) ? String(v) : null));
  const entero = (v, d) => { const n = Math.round(+v); return isFinite(n) ? n : d; };
  const comillas = s => '«' + s + '»';

  /* ---------- huellas: FNV-1a sobre el JSON con las claves ordenadas ---------- */
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (esObj(x)) return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36) + '.' + s.length.toString(36);
  }
  const huellaDe = x => fnv(canon(x));

  /* ---------- el catálogo ---------- */
  /* Las clases de lo que va por un cable. `tono`: uno de los 24 de las tramas (var(--t-<tono>)), por si la interfaz lo quiere. */
  const CLASES = {
    texto: { nombre: 'Texto', tono: 'pizarra' },
    imagen: { nombre: 'Imagen', tono: 'rosa' },
    nota: { nombre: 'Nota', tono: 'ambar' },
    segmento: { nombre: 'Segmento', tono: 'oro' },
    biblioteca: { nombre: 'Biblioteca', tono: 'azul' },
    esquema: { nombre: 'Esquema', tono: 'violeta' },
    guion: { nombre: 'Guion', tono: 'indigo' },
    personaje: { nombre: 'Personaje', tono: 'teal' },
    fragmentos: { nombre: 'Fragmentos', tono: 'verde' }
  };
  const TODAS = Object.keys(CLASES);
  /* lo que se puede leer como texto (una fuente para resumir, reescribir o traducir) */
  const TEXTUALES = ['texto', 'nota', 'guion', 'esquema', 'segmento', 'biblioteca', 'fragmentos', 'personaje'];
  const FAMILIAS = { entrada: { nombre: 'Entradas' }, operacion: { nombre: 'Operaciones' } };

  /* Los campos de `datos` de cada tipo: [clase de valor, valor de partida]. 'texto' (una cadena), 'imagen' (una data:image/…; otra cosa, vacía), 'id' (una id o null),
     'numero' (positivo), 'modo:a|b' (uno de esos), 'destino' (ver `sanearDestino`), 'ids' (una lista de ids sin repetir; la clave
     **solo si hay alguna**, así lo guardado antes de tenerla sigue igual).
     `formulas` (1.1.60): las fórmulas elegidas en una operación, en su orden (ids de notas de la biblioteca «Fórmulas»,
     documentos.js; prompts reutilizables que se combinan con la instrucción, js/claquedraw/formulas.js).
     `duendes` (1.1.68, Leo: «Que los duendes se puedan seleccionar en los bloques de IA del lienzo para salidas con la personalidad
     del duende»): los duendes especiales del asistente elegidos en una operación, en su orden, como **instantáneas** (la copia de su
     ficha al elegirlos, `C.equipo.instantanea` sin su aspecto): { id, nombre, personalidad, rol, veto, modelo, temperatura, voz,
     fijadaEn }. Viajan en el archivo (Claude por MCP también los ve) y la personalidad no cambia aunque Leo edite después la ficha;
     cambiarlos (añadir, quitar, reordenar, actualizar una) cambia la huella de los datos: la operación queda desactualizada
     ('instruccion'). Seis como mucho; la clave, solo si hay alguno. */
  const INSTR = ['texto', ''], DEST = ['destino', null], FORM = ['ids', null], DUEN = ['duendes', null];
  const MAX_FORMULAS = 20;
  const MAX_DUENDES = 6, MAX_PERSONALIDAD = 4000, MAX_NOMBRE_DUENDE = 60;
  /* los duendes fijos del equipo (el maestro, el lector, la escritora y el coordinador) no se eligen: solo los especiales */
  const DUENDES_FIJOS = ['maestro', 'lector', 'escritor', 'coordinador'];
  /* texto plano: sin etiquetas HTML ni caracteres de control (salvo el salto de renglón y el tabulador), recortado */
  const plano = (v, max) => (typeof v === 'string' ? v : '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  /* Una instantánea de duende saneada (la que llega de la interfaz, de Claude o del archivo), o null si no vale: solo sus campos,
     en ese orden, sin HTML y recortados. Un id fijo, vacío o raro no vale. */
  function sanearDuende(x) {
    if (!esObj(x)) return null;
    const id = typeof x.id === 'string' ? x.id.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || DUENDES_FIJOS.includes(id)) return null;
    const rol = x.rol === 'transformar' ? 'transformar' : 'revisar';
    const t = x.temperatura, temp = t !== null && t !== '' && typeof t !== 'boolean' && isFinite(+t) ? Math.round(Math.max(0, Math.min(2, +t)) * 100) / 100 : null;
    const voces = raiz.Claquedraw && raiz.Claquedraw.teatroMods && Array.isArray(raiz.Claquedraw.teatroMods.VOCES) ? raiz.Claquedraw.teatroMods.VOCES : null;
    const voz = typeof x.voz === 'string' && /^[a-z][a-z_-]{0,23}$/.test(x.voz.trim()) && (!voces || voces.includes(x.voz.trim())) ? x.voz.trim() : null;
    return {
      id, nombre: plano(x.nombre, MAX_NOMBRE_DUENDE).replace(/\s+/g, ' ') || 'Duende especial',
      personalidad: plano(x.personalidad, MAX_PERSONALIDAD), rol, veto: rol === 'revisar' && x.veto === true,
      modelo: typeof x.modelo === 'string' && /^[\w.:/@+-]{1,100}$/.test(x.modelo.trim()) ? x.modelo.trim() : null,
      temperatura: temp, voz, fijadaEn: +x.fijadaEn > 0 ? Math.round(+x.fijadaEn) : 0
    };
  }
  /* la lista: saneadas, sin repetir id (se queda la primera), seis como mucho */
  function sanearDuendes(v) {
    const res = [];
    (Array.isArray(v) ? v : []).forEach(x => { const d = sanearDuende(x); if (d && !res.some(y => y.id === d.id) && res.length < MAX_DUENDES) res.push(d); });
    return res;
  }
  const puerto = (id, nombre, acepta, op) => Object.assign({ id, nombre, acepta, uno: false, obligatorio: false }, op || {});
  const contexto = () => puerto('contexto', 'Contexto', TODAS.slice());
  const fuente = acepta => puerto('fuente', 'Fuente', acepta, { uno: true, obligatorio: true });
  const entrada = (nombre, letra, da, campos, descripcion) => ({ nombre, icono: '', letra, familia: 'entrada', puertos: [], da, campos, descripcion });
  const operacion = (nombre, letra, puertos, da, campos, extra) => Object.assign({ nombre, icono: '', letra, familia: 'operacion', puertos, da, campos }, extra);
  const TIPOS = {
    texto: entrada('Texto', 'T', ['texto'], { md: ['texto', ''] }, 'Texto libre, una idea o una instrucción (Markdown)'),
    imagen: entrada('Imagen', 'I', ['imagen'], { src: ['imagen', ''], alt: ['texto', ''] }, 'Una imagen suelta'),
    nota: entrada('Nota', 'N', ['nota'], { notaId: ['id', null] }, 'Una nota de una biblioteca: su texto y sus imágenes'),
    segmento: entrada('Segmento', 'S', ['segmento'], { subId: ['id', null], etiquetaId: ['id', null] }, 'Todas las notas de un segmento (sin segmento: la bandeja)'),
    biblioteca: entrada('Biblioteca', 'B', ['biblioteca'], { subId: ['id', null] }, 'Toda una biblioteca: sus segmentos y sus notas'),
    esquema: entrada('Esquema', 'E', ['esquema', 'guion'], { eid: ['id', null] }, 'Un esquema: su tablero (la estructura) y su guion'),
    personaje: entrada('Personaje', 'P', ['personaje'], { personajeId: ['id', null] }, 'Un personaje: su nombre, su hoja y sus apariciones'),
    generar: operacion('Generar guion', 'G', [contexto(), puerto('esquema', 'Esquema', ['esquema'], { uno: true })], ['guion'],
      { instruccion: INSTR, modo: ['modo:guion|prosa', 'guion'], destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['eid', 'nuevo'], nuevoEs: 'esquema', salidas: ['documento'], descripcion: 'Escribe el guion (o la prosa) con lo conectado y lo deja como documento de un esquema' }),
    partir: operacion('Partir en fragmentos', 'F', [puerto('guion', 'Guion', ['guion', 'esquema'], { uno: true, obligatorio: true }), contexto()], ['fragmentos'],
      { segundos_max: ['numero', 15], destino: DEST, instruccion: INSTR, formulas: FORM, duendes: DUEN },
      { destinos: ['subId', 'nuevo'], nuevoEs: 'biblioteca', salidas: ['fragmentos'], descripcion: 'Parte un guion en fragmentos cortos, una nota por fragmento' }),
    escaleta: operacion('Sacar escaleta', 'Es', [fuente(['guion', 'esquema', 'texto', 'nota']), contexto()], ['esquema'],
      { instruccion: INSTR, destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['eid', 'nuevo'], nuevoEs: 'esquema', salidas: ['esquema'], descripcion: 'Saca los beats de un guion o de un texto como nodos de un esquema' }),
    resumir: operacion('Resumir', 'R', [fuente(TEXTUALES.slice()), contexto()], ['texto'],
      { instruccion: INSTR, destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['subId', 'enSitio', 'nuevo'], nuevoEs: 'biblioteca', salidas: ['nota', 'documento'], descripcion: 'Resume la fuente en una nota' }),
    reescribir: operacion('Reescribir', 'Re', [fuente(TEXTUALES.slice()), contexto()], ['texto', 'guion'],
      { tono: ['texto', ''], instruccion: INSTR, destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['subId', 'enSitio', 'nuevo'], nuevoEs: 'biblioteca', salidas: ['nota', 'documento'], descripcion: 'Reescribe la fuente con otro tono (en una nota o, en su sitio, como versión nueva del guion)' }),
    traducir: operacion('Traducir', 'Tr', [fuente(TEXTUALES.slice()), contexto()], ['texto', 'guion'],
      { idioma: ['texto', ''], instruccion: INSTR, destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['subId', 'enSitio', 'nuevo'], nuevoEs: 'biblioteca', salidas: ['nota', 'documento'], descripcion: 'Traduce la fuente a otro idioma' }),
    prompt: operacion('Instrucción libre', '?', [contexto()], ['texto', 'guion'],
      { instruccion: INSTR, destino: DEST, formulas: FORM, duendes: DUEN },
      { destinos: ['subId', 'eid', 'enSitio', 'nuevo'], nuevoEs: 'biblioteca', salidas: ['nota', 'documento'], descripcion: 'Lo que se le pida a Claude con lo conectado' })
  };
  Object.keys(TIPOS).forEach(k => { TIPOS[k].id = k; TIPOS[k].icono = 'lz-' + k; });
  const ENTRADAS = Object.keys(TIPOS).filter(k => TIPOS[k].familia === 'entrada');
  const OPERACIONES = Object.keys(TIPOS).filter(k => TIPOS[k].familia === 'operacion');
  const ESTADOS = ['nuevo', 'pendiente', 'hecho', 'error'];
  const esOp = n => !!n && !!TIPOS[n.tipo] && TIPOS[n.tipo].familia === 'operacion';

  /* Un destino: { eid } (un esquema que existe), { subId, etiquetaId? } (una biblioteca, y su segmento), { nuevo: { cid?, nombre } }
     (uno nuevo: un esquema o una biblioteca según el tipo, `nuevoEs`, en ese contenedor) o { enSitio: true } (sobre la fuente
     misma: una versión nueva del guion). Solo los que admite el tipo; si no vale, null (sin destino: lo decide Claude). */
  function sanearDestino(d, permitidos) {
    if (!esObj(d)) return null;
    const p = k => permitidos.includes(k);
    if (d.enSitio && p('enSitio')) return { enSitio: true };
    if (idDe(d.eid) && p('eid')) return { eid: idDe(d.eid) };
    if (idDe(d.subId) && p('subId')) return Object.assign({ subId: idDe(d.subId) }, idDe(d.etiquetaId) ? { etiquetaId: idDe(d.etiquetaId) } : {});
    if (esObj(d.nuevo) && p('nuevo')) return { nuevo: Object.assign(idDe(d.nuevo.cid) ? { cid: idDe(d.nuevo.cid) } : {}, { nombre: cadena(d.nuevo.nombre, 200).trim() }) };
    return null;
  }
  /* Los datos de un nodo, con los campos de su tipo (los que falten, con su valor de partida; los que no son suyos, fuera). */
  function sanearDatos(tipo, d) {
    const t = TIPOS[tipo], src = esObj(d) ? d : {}, res = {};
    Object.keys(t.campos).forEach(k => {
      const [clase, defecto] = t.campos[k], v = src[k];
      if (clase === 'texto') res[k] = typeof v === 'string' ? v : defecto;
      /* una imagen, solo incrustada (data:image/…): una dirección de fuera se pediría sola al pintarla (revisión del port a ClapBook) */
      else if (clase === 'imagen') res[k] = typeof v === 'string' && /^\s*data:image\//i.test(v) ? v : defecto;
      else if (clase === 'id') res[k] = idDe(v);
      else if (clase === 'numero') { const n = +v; res[k] = isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : defecto; }
      else if (clase.startsWith('modo:')) res[k] = clase.slice(5).split('|').includes(v) ? v : defecto;
      else if (clase === 'destino') res[k] = sanearDestino(v, t.destinos || []);
      else if (clase === 'ids') { const l = [...new Set((Array.isArray(v) ? v : []).map(idDe).filter(Boolean))].slice(0, MAX_FORMULAS); if (l.length) res[k] = l; }
      else if (clase === 'duendes') { const l = sanearDuendes(v); if (l.length) res[k] = l; }
    });
    return res;
  }
  /* La salida de una operación: el objeto de ClapCraft que la tiene. `mensaje`: una línea de Claude, si la dejó. */
  function sanearSalida(tipo, s) {
    const t = TIPOS[tipo]; if (!t || t.familia !== 'operacion' || !esObj(s) || !(t.salidas || []).includes(s.tipo)) return null;
    let r = null;
    if (s.tipo === 'documento' && idDe(s.eid)) r = Object.assign({ tipo: 'documento', eid: idDe(s.eid) }, idDe(s.versionId) ? { versionId: idDe(s.versionId) } : {});
    else if (s.tipo === 'esquema' && idDe(s.eid)) r = { tipo: 'esquema', eid: idDe(s.eid) };
    else if (s.tipo === 'nota' && idDe(s.notaId)) r = Object.assign({ tipo: 'nota', notaId: idDe(s.notaId) }, idDe(s.subId) ? { subId: idDe(s.subId) } : {});
    else if (s.tipo === 'fragmentos' && idDe(s.subId)) {
      const notas = [...new Set((Array.isArray(s.notas) ? s.notas : []).map(idDe).filter(Boolean))];
      r = Object.assign({ tipo: 'fragmentos', subId: idDe(s.subId), notas }, idDe(s.etiquetaId) ? { etiquetaId: idDe(s.etiquetaId) } : {}, idDe(s.eid) ? { eid: idDe(s.eid) } : {});
    }
    if (r && typeof s.mensaje === 'string' && s.mensaje.trim()) r.mensaje = s.mensaje.trim().slice(0, 1000);
    return r;
  }
  const sanearHuella = h => (esObj(h) && typeof h.datos === 'string' && typeof h.entradas === 'string'
    ? Object.assign({ datos: h.datos, entradas: h.entradas }, typeof h.contenido === 'string' ? { contenido: h.contenido } : {},
      typeof h.formulas === 'string' ? { formulas: h.formulas } : {}) : null);
  /* Un nodo saneado, con sus claves siempre en el mismo orden (así lo creado y lo abierto dan el mismo texto). null si no vale. */
  function sanearNodo(n, id) {
    if (!esObj(n) || !TIPOS[n.tipo]) return null;
    const x = { id, tipo: n.tipo, x: entero(n.x, 0), y: entero(n.y, 0) };
    if (+n.w > 0) x.w = Math.max(120, Math.min(1200, entero(n.w, 0)));
    const titulo = cadena(n.titulo, 300).trim(); if (titulo) x.titulo = titulo;
    x.datos = sanearDatos(n.tipo, n.datos);
    if (!esOp(x)) return x;
    const salida = sanearSalida(n.tipo, n.salida);
    let estado = ESTADOS.includes(n.estado) ? n.estado : 'nuevo';
    if (estado === 'hecho' && !salida) estado = 'nuevo';
    const error = cadena(n.error, 2000).trim();
    if (estado === 'error' && !error) estado = salida ? 'hecho' : 'nuevo';
    x.estado = estado;
    if (salida) x.salida = salida;
    if (estado === 'error') x.error = error;
    if (estado === 'pendiente') x.pedido = +n.pedido || 0;
    if (salida && +n.hecho) x.hecho = +n.hecho;
    const h = salida && sanearHuella(n.huella); if (h) x.huella = h;
    return x;
  }
  /* ¿Lo que da `n` entra en ese puerto? La clase que llevaría (la primera que el puerto prefiere: un esquema en «Guion» lleva su
     guion), o null. */
  function claseEntre(n, puertoDef) {
    const t = n && TIPOS[n.tipo]; if (!t || !puertoDef) return null;
    return puertoDef.acepta.find(k => t.da.includes(k)) || null;
  }
  const puertoDe = (n, pid) => (n && TIPOS[n.tipo] ? TIPOS[n.tipo].puertos.find(p => p.id === pid) || null : null);
  /* ¿Llega `desde` a `hasta` siguiendo los cables? */
  function llega(cables, desde, hasta) {
    const vistos = new Set([desde]), cola = [desde];
    while (cola.length) {
      const x = cola.shift(); if (x === hasta) return true;
      cables.forEach(c => { if (c.de === x && !vistos.has(c.a)) { vistos.add(c.a); cola.push(c.a); } });
    }
    return false;
  }
  /* Los datos de un lienzo saneados: nodos con id único y tipo conocido; cables entre nodos que están, a un puerto que existe y
     que acepta lo que llega, sin repetir, sin pasar de uno en los puertos «uno» (se queda el primero) y sin cerrar un ciclo.
     `vista` ({ x, y, zoom }) se conserva si viene. Es idempotente. */
  function sanear(datos) {
    const src = esObj(datos) ? datos : {}, ids = new Set(), nodos = [], cables = [];
    (Array.isArray(src.nodos) ? src.nodos : []).forEach(n => {
      const id = n && idDe(n.id); if (!id || ids.has(id)) return;
      const x = sanearNodo(n, id); if (!x) return;
      ids.add(id); nodos.push(x);
    });
    const porId = new Map(nodos.map(n => [n.id, n]));
    (Array.isArray(src.cables) ? src.cables : []).forEach(c => {
      const id = c && idDe(c.id); if (!id || ids.has(id)) return;
      const de = porId.get(idDe(c.de)), a = porId.get(idDe(c.a)), p = puertoDe(a, c.puerto);
      if (!de || !a || de === a || !p || !claseEntre(de, p)) return;
      if (cables.some(k => k.de === de.id && k.a === a.id && k.puerto === p.id)) return;
      if (p.uno && cables.some(k => k.a === a.id && k.puerto === p.id)) return;
      if (llega(cables, a.id, de.id)) return;
      ids.add(id); cables.push({ id, de: de.id, a: a.id, puerto: p.id });
    });
    const res = { nodos, cables };
    const v = src.vista;
    if (esObj(v) && isFinite(+v.x) && isFinite(+v.y)) res.vista = { x: Math.round(+v.x), y: Math.round(+v.y), zoom: Math.max(0.1, Math.min(4, +v.zoom || 1)) };
    return res;
  }

  class Lienzo {
    /* `datos`: { nodos, cables, vista? } (o la pieza del lienzo entera: se toman esas claves). `op`: { ahora, idNuevo }. */
    constructor(datos, op) {
      const o = op || {};
      this.ahora = o.ahora || (() => Date.now());
      this.idNuevo = o.idNuevo || (pre => (pre || 'n') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      this.datos = sanear(datos);
    }
    toJSON() { return clonar(this.datos); }
    _id(pre) { let id; do { id = this.idNuevo(pre); } while (this.nodo(id) || this.cable(id)); return id; }

    /* ---------- consultas ---------- */
    nodo(id) { return this.datos.nodos.find(n => n.id === id) || null; }
    cable(id) { return this.datos.cables.find(c => c.id === id) || null; }
    nodos() { return this.datos.nodos.slice(); }
    cables() { return this.datos.cables.slice(); }
    esEntrada(id) { const n = this.nodo(id); return !!n && TIPOS[n.tipo].familia === 'entrada'; }
    esOperacion(id) { return esOp(this.nodo(id)); }
    /* El nombre que se lee: su título o el de su tipo. */
    nombre(id) { const n = typeof id === 'string' ? this.nodo(id) : id; return n ? (n.titulo || TIPOS[n.tipo].nombre) : ''; }
    /* Lo que entra en un nodo, por puerto (en el orden de sus puertos): { puerto: [{ cable, nodo, clase }] }. Dentro de un puerto
       de varios, en el orden en que se ven: de arriba abajo y de izquierda a derecha (mover un nodo cambia el orden del contexto). */
    entradasDe(id) {
      const n = this.nodo(id), res = {}; if (!n) return res;
      TIPOS[n.tipo].puertos.forEach(p => {
        res[p.id] = this.datos.cables.filter(c => c.a === id && c.puerto === p.id).map(c => ({ cable: c, nodo: this.nodo(c.de), clase: claseEntre(this.nodo(c.de), p) }))
          .sort((u, v) => u.nodo.y - v.nodo.y || u.nodo.x - v.nodo.x);
      });
      return res;
    }
    /* Adónde va su salida: [{ cable, nodo, puerto }]. */
    salidasDe(id) { return this.datos.cables.filter(c => c.de === id).map(c => ({ cable: c, nodo: this.nodo(c.a), puerto: c.puerto })); }
    /* Lo que lleva un cable (su clase: 'texto', 'guion'…), para pintarlo de su color. */
    claseCable(cid) { const c = this.cable(cid); return c ? claseEntre(this.nodo(c.de), puertoDe(this.nodo(c.a), c.puerto)) : null; }
    /* Las operaciones de las que depende (directa o indirectamente), sin ella. */
    previas(id) {
      const res = [], vistos = new Set([id]), cola = [id];
      while (cola.length) {
        const x = cola.shift();
        this.datos.cables.forEach(c => { if (c.a === x && !vistos.has(c.de)) { vistos.add(c.de); cola.push(c.de); if (esOp(this.nodo(c.de))) res.push(c.de); } });
      }
      return res;
    }
    /* Las que dependen de ella. */
    siguientes(id) {
      const res = [], vistos = new Set([id]), cola = [id];
      while (cola.length) {
        const x = cola.shift();
        this.datos.cables.forEach(c => { if (c.de === x && !vistos.has(c.a)) { vistos.add(c.a); cola.push(c.a); if (esOp(this.nodo(c.a))) res.push(c.a); } });
      }
      return res;
    }
    /* Las operaciones en orden topológico (cada una detrás de las que le dan algo); a igualdad, de izquierda a derecha y de
       arriba abajo. Con `ids`, solo esas (en ese orden). */
    orden(ids) {
      const ops = this.datos.nodos.filter(esOp), quedan = new Set(ops.map(n => n.id)), res = [];
      const antes = new Map(ops.map(n => [n.id, new Set(this.previas(n.id))]));
      const cmp = (a, b) => a.x - b.x || a.y - b.y || this.datos.nodos.indexOf(a) - this.datos.nodos.indexOf(b);
      while (quedan.size) {
        const listas = ops.filter(n => quedan.has(n.id) && [...antes.get(n.id)].every(p => !quedan.has(p))).sort(cmp);
        if (!listas.length) break;                                 // no pasa: no hay ciclos
        quedan.delete(listas[0].id); res.push(listas[0].id);
      }
      return ids ? res.filter(x => ids.includes(x)) : res;
    }
    /* Las pendientes, en el orden en que hay que hacerlas. */
    pendientes() { return this.orden().filter(id => this.nodo(id).estado === 'pendiente'); }
    /* Lo que le falta a una operación para poder hacerse: [{ que: 'puerto' | 'dato' | 'previa', aviso, puerto?, nodo? }].
       'previa': una operación de la que depende que no está hecha ni pedida (si está pedida, se hará antes). */
    faltan(id) {
      const n = this.nodo(id); if (!esOp(n)) return [];
      const res = [], ent = this.entradasDe(id), d = n.datos;
      TIPOS[n.tipo].puertos.forEach(p => { if (p.obligatorio && !ent[p.id].length) res.push({ que: 'puerto', puerto: p.id, aviso: 'Falta conectar ' + comillas(p.nombre) }); });
      /* una fórmula elegida cuenta como instrucción (1.1.60): «que se pueda escribir normalmente… o seleccionar directamente la
         Fórmula para que se ejecute la acción»; una que ya no existe tampoco lo impide (la interfaz y Claude avisan) */
      const hay = Object.values(ent).some(l => l.length), instr = String(d.instruccion || '').trim() || ((d.formulas || []).length ? 'formulas' : '');
      if (n.tipo === 'prompt' && !instr) res.push({ que: 'dato', aviso: 'Falta la instrucción' });
      if (n.tipo === 'generar' && !hay && !instr) res.push({ que: 'dato', aviso: 'Conecta algo o escribe una instrucción' });
      if (n.tipo === 'traducir' && !String(d.idioma || '').trim()) res.push({ que: 'dato', aviso: 'Falta el idioma' });
      /* en reescribir, un duende que transforma el texto hace de tono (1.1.68: «con la personalidad del duende») */
      const transforma = (d.duendes || []).some(x => x.rol === 'transformar');
      if (n.tipo === 'reescribir' && !String(d.tono || '').trim() && !instr && !transforma) res.push({ que: 'dato', aviso: 'Falta el tono o una instrucción' });
      this.previas(id).forEach(p => { const q = this.nodo(p); if (q.estado !== 'hecho' && q.estado !== 'pendiente') res.push({ que: 'previa', nodo: p, aviso: 'Antes hay que hacer ' + comillas(this.nombre(q)) }); });
      return res;
    }
    /* El estado que se ve: el guardado o, si está hecha y ya no casa, 'desactualizado'. null en una entrada. */
    estadoVisible(id, firma) { const n = this.nodo(id); if (!esOp(n)) return null; return n.estado === 'hecho' && this.desactualizado(id, firma) ? 'desactualizado' : n.estado; }

    /* ---------- nodos ---------- */
    crearNodo(tipo, x, y, datos, op) {
      if (!TIPOS[tipo]) return no('Ese tipo de nodo no existe');
      const o = op || {};
      const n = sanearNodo({ tipo, x, y, w: o.w, titulo: o.titulo, datos }, o.id && !this.nodo(o.id) && !this.cable(o.id) ? String(o.id) : this._id('n'));
      this.datos.nodos.push(n);
      return si({ nodo: n });
    }
    moverNodos(ids, dx, dy) {
      const ns = [...new Set(ids || [])].map(id => this.nodo(id)).filter(Boolean);
      const x = entero(dx, 0), y = entero(dy, 0);
      if (!ns.length || (!x && !y)) return si({ cambio: false });
      ns.forEach(n => { n.x += x; n.y += y; });
      return si({ cambio: true, nodos: ns });
    }
    colocarNodo(id, x, y) { const n = this.nodo(id); if (!n) return no('Ese nodo ya no existe'); return this.moverNodos([id], entero(x, n.x) - n.x, entero(y, n.y) - n.y); }
    /* `cambios`: { titulo, w, x, y, datos } (los datos se mezclan con los de ahora). No cambia el estado: si una operación hecha
       cambia su instrucción, se ve desactualizada (se calcula). */
    editarNodo(id, cambios) {
      const n = this.nodo(id); if (!n) return no('Ese nodo ya no existe');
      const c = esObj(cambios) ? cambios : {};
      const antes = JSON.stringify(n);
      const base = Object.assign({}, n, c.x !== undefined ? { x: c.x } : {}, c.y !== undefined ? { y: c.y } : {},
        c.w !== undefined ? { w: c.w } : {}, c.titulo !== undefined ? { titulo: c.titulo } : {},
        esObj(c.datos) ? { datos: Object.assign({}, n.datos, c.datos) } : {});
      const x = sanearNodo(base, n.id);
      Object.keys(n).forEach(k => delete n[k]); Object.assign(n, x);
      return si({ nodo: n, cambio: JSON.stringify(n) !== antes });
    }
    /* Con sus cables. Devuelve lo quitado. */
    borrarNodos(ids) {
      const set = new Set(ids || []);
      const nodos = this.datos.nodos.filter(n => set.has(n.id)); if (!nodos.length) return no('Esos nodos ya no están');
      const cables = this.datos.cables.filter(c => set.has(c.de) || set.has(c.a));
      this.datos.nodos = this.datos.nodos.filter(n => !set.has(n.id));
      this.datos.cables = this.datos.cables.filter(c => !cables.includes(c));
      return si({ nodos, cables, aviso: nodos.length === 1 ? comillas(this.nombre(nodos[0])) + ' eliminado' : nodos.length + ' nodos eliminados' });
    }

    /* ---------- cables ---------- */
    /* ¿Se puede? Sin cambiar nada: { ok, aviso?, clase?, reemplaza? } (la interfaz apaga los puertos que no valen al arrastrar). */
    puedeConectar(de, a, puertoId, op) {
      const x = this.nodo(de), y = this.nodo(a);
      if (!x || !y) return no('Ese nodo ya no existe');
      if (x === y) return no('Un nodo no se conecta consigo mismo');
      if (!esOp(y)) return no('A una entrada no llega nada: solo da');
      const p = puertoDe(y, puertoId); if (!p) return no(comillas(this.nombre(y)) + ' no tiene ese puerto');
      const clase = claseEntre(x, p);
      if (!clase) return no(comillas(p.nombre) + ' de ' + comillas(this.nombre(y)) + ' no acepta ' + TIPOS[x.tipo].da.map(k => CLASES[k].nombre.toLowerCase()).join(' ni '));
      if (this.datos.cables.some(c => c.de === de && c.a === a && c.puerto === p.id)) return no('Ya están conectados');
      if (llega(this.datos.cables, a, de)) return no('Así se cerraría un círculo: ' + comillas(this.nombre(x)) + ' ya depende de ' + comillas(this.nombre(y)));
      const ocupado = p.uno ? this.datos.cables.find(c => c.a === a && c.puerto === p.id) : null;
      if (ocupado && op && op.reemplazar === false) return no(comillas(p.nombre) + ' ya tiene un cable');
      return si(Object.assign({ clase }, ocupado ? { reemplaza: ocupado.id } : {}));
    }
    /* Los puertos donde puede ir la salida de un nodo: [{ nodo, puerto, reemplaza? }]. */
    compatibles(de) {
      const res = [];
      this.datos.nodos.forEach(n => { if (esOp(n)) TIPOS[n.tipo].puertos.forEach(p => { const r = this.puedeConectar(de, n.id, p.id); if (r.ok) res.push(Object.assign({ nodo: n.id, puerto: p.id }, r.reemplaza ? { reemplaza: r.reemplaza } : {})); }); });
      return res;
    }
    /* En un puerto «uno» ocupado, el cable nuevo sustituye al que había (`quitado`), salvo con `{ reemplazar: false }`. */
    conectar(de, a, puertoId, op) {
      const r = this.puedeConectar(de, a, puertoId, op); if (!r.ok) return r;
      const o = op || {};
      let quitado = null;
      if (r.reemplaza) { quitado = this.cable(r.reemplaza); this.datos.cables = this.datos.cables.filter(c => c !== quitado); }
      const c = { id: o.id && !this.nodo(o.id) && !this.cable(o.id) ? String(o.id) : this._id('k'), de, a, puerto: puertoId };
      this.datos.cables.push(c);
      return si(Object.assign({ cable: c, clase: r.clase }, quitado ? { quitado, aviso: 'El cable de antes a ' + comillas(TIPOS[this.nodo(a).tipo].puertos.find(p => p.id === puertoId).nombre) + ' se sustituye' } : {}));
    }
    desconectar(cid) {
      const c = this.cable(cid); if (!c) return no('Ese cable ya no existe');
      this.datos.cables = this.datos.cables.filter(x => x !== c);
      return si({ cable: c });
    }

    /* ---------- estado de las operaciones ---------- */
    /* La huella de lo que usa una operación: { datos, entradas, contenido?, formulas? } (ver arriba). `firma(nodo)`: la del contenido
       de lo que apunta una entrada y, llamada con la operación misma, la de sus fórmulas (documentos.js, `firmaEntrada`); sin ella no
       hay `contenido` ni `formulas`. */
    huella(id, firma) {
      const n = this.nodo(id); if (!esOp(n)) return null;
      const ent = this.entradasDe(id), lista = [], apuntadas = [];
      Object.keys(ent).forEach(p => ent[p].forEach(e => {
        const q = e.nodo;
        lista.push({ p, de: q.id, t: q.tipo, d: esOp(q) ? undefined : q.datos, s: esOp(q) ? { salida: q.salida || null, hecho: q.hecho || 0 } : undefined });
        if (!esOp(q)) apuntadas.push(q);
      }));
      const h = { datos: huellaDe(n.datos), entradas: huellaDe(lista) };
      if (typeof firma === 'function') h.contenido = huellaDe(apuntadas.map(q => [q.id, firma(q) ?? null]));
      /* con fórmulas, lo que dicen (la firma de la operación misma: el título y el texto de cada una, documentos.js) */
      if (typeof firma === 'function' && (n.datos.formulas || []).length) { const f = firma(n); if (typeof f === 'string') h.formulas = f; }
      return h;
    }
    /* Por qué una operación hecha está desactualizada: 'instruccion' (cambiaron sus datos), 'entradas' (sus cables o lo que
       traen), 'contenido' (lo que apuntan sus entradas, solo con `firma`), 'cadena' (una de la que depende no está hecha o está
       desactualizada); null si está al día, si no está hecha o si se hizo sin huella. */
    desactualizado(id, firma, _memo) {
      const memo = _memo || new Map(); if (memo.has(id)) return memo.get(id);
      const n = this.nodo(id); let r = null;
      if (esOp(n) && n.estado === 'hecho' && n.huella) {
        const h = this.huella(id, firma);
        if (h.datos !== n.huella.datos) r = 'instruccion';
        else if (h.formulas !== undefined && n.huella.formulas !== undefined && h.formulas !== n.huella.formulas) r = 'instruccion';   // cambió el texto de una fórmula
        else if (h.entradas !== n.huella.entradas) r = 'entradas';
        else if (h.contenido !== undefined && n.huella.contenido !== undefined && h.contenido !== n.huella.contenido) r = 'contenido';
        else if (this.datos.cables.some(c => c.a === id && esOp(this.nodo(c.de)) && (this.nodo(c.de).estado !== 'hecho' || this.desactualizado(c.de, firma, memo)))) r = 'cadena';
      }
      memo.set(id, r);
      return r;
    }
    /* Las desactualizadas, en orden topológico. */
    desactualizadas(firma) { const memo = new Map(); return this.orden().filter(id => this.desactualizado(id, firma, memo)); }
    /* ▶ de un nodo: la deja pendiente y, con ella, las operaciones de las que depende que no estén hechas y al día (así «▶» en
       partir pide también el generar que le da el guion). No se pide si le falta un puerto o un dato. Devuelve `ids`, en orden. */
    pedir(id, firma) {
      const n = this.nodo(id); if (!n) return no('Ese nodo ya no existe');
      if (!esOp(n)) return no('Solo se piden las operaciones');
      const propias = this.faltan(id).filter(f => f.que !== 'previa');
      if (propias.length) return no(propias[0].aviso);
      const memo = new Map();
      const previas = this.previas(id).filter(p => { const q = this.nodo(p); return q.estado === 'nuevo' || q.estado === 'error' || (q.estado === 'hecho' && this.desactualizado(p, firma, memo)); });
      const malas = previas.find(p => this.faltan(p).some(f => f.que !== 'previa'));
      if (malas) return no('Antes hay que completar ' + comillas(this.nombre(malas)) + ': ' + this.faltan(malas).find(f => f.que !== 'previa').aviso.toLowerCase());
      const t = this.ahora(), ids = this.orden([id, ...previas]);
      ids.forEach(x => this._pendiente(this.nodo(x), t));
      return si({ ids, aviso: ids.length === 1 ? comillas(this.nombre(n)) + ' queda pendiente' : ids.length + ' operaciones quedan pendientes' });
    }
    _pendiente(n, t) { n.estado = 'pendiente'; n.pedido = t; delete n.error; }
    /* «Pedir todo»: las que no están hechas y al día (nuevas, con error o desactualizadas) y las que dependen de ellas; las que
       ya estaban pendientes siguen igual. Se saltan (`saltadas`) las que no pueden hacerse (les falta un puerto o un dato, o
       dependen de una saltada). */
    pedirTodo(firma) {
      const memo = new Map(), t = this.ahora(), marcadas = new Set(), saltadas = [];
      this.orden().forEach(id => {
        const n = this.nodo(id), previas = this.previas(id);
        const toca = n.estado === 'nuevo' || n.estado === 'error' || (n.estado === 'hecho' && this.desactualizado(id, firma, memo))
          || (n.estado !== 'pendiente' && previas.some(p => marcadas.has(p)));
        if (!toca) return;
        if (this.faltan(id).some(f => f.que !== 'previa') || previas.some(p => saltadas.includes(p))) { saltadas.push(id); return; }
        marcadas.add(id);
      });
      const ids = this.orden([...marcadas]);
      ids.forEach(id => this._pendiente(this.nodo(id), t));
      const total = this.pendientes().length;
      return si({ ids, saltadas, pendientes: this.pendientes(),
        aviso: (ids.length ? ids.length + (ids.length === 1 ? ' operación pedida' : ' operaciones pedidas') : 'No hay nada nuevo que pedir')
          + (total > ids.length ? ' · ' + total + ' pendientes en total' : '') + (saltadas.length ? ' · ' + saltadas.length + ' no se pueden hacer aún' : '') });
    }
    /* Deja de estar pendiente: vuelve a hecha si tenía salida, si no a nueva. */
    cancelar(id) {
      const n = this.nodo(id); if (!esOp(n)) return no('Solo se piden las operaciones');
      if (n.estado !== 'pendiente') return si({ nodo: n, cambio: false });
      n.estado = n.salida ? 'hecho' : 'nuevo'; delete n.pedido;
      if (!n.salida) delete n.hecho;
      return si({ nodo: n, cambio: true });
    }
    /* La salida ya escrita por Claude: { tipo: 'documento', eid, versionId? } | { tipo: 'fragmentos', subId, notas, eid?,
       etiquetaId? } | { tipo: 'esquema', eid } | { tipo: 'nota', notaId, subId? }, con `mensaje` opcional. `op.firma`: la de
       documentos.js, para que la huella cuente también el contenido de las entradas. */
    completar(id, salida, op) {
      const n = this.nodo(id); if (!n) return no('Ese nodo ya no existe');
      if (!esOp(n)) return no('Solo las operaciones tienen salida');
      const s = sanearSalida(n.tipo, salida);
      if (!s) return no(comillas(TIPOS[n.tipo].nombre) + ' da ' + TIPOS[n.tipo].salidas.join(' o ') + ': esa salida no vale');
      n.estado = 'hecho'; n.salida = s; n.hecho = this.ahora(); delete n.error; delete n.pedido;
      n.huella = this.huella(id, op && op.firma);
      return si({ nodo: n, aviso: comillas(this.nombre(n)) + ' hecho' });
    }
    fallar(id, error) {
      const n = this.nodo(id); if (!n) return no('Ese nodo ya no existe');
      if (!esOp(n)) return no('Solo las operaciones se ejecutan');
      const e = cadena(String(error ?? ''), 2000).trim() || 'No se pudo hacer';
      n.estado = 'error'; n.error = e; delete n.pedido;
      return si({ nodo: n });
    }

    /* ---------- copiar, pegar y duplicar ---------- */
    /* Un portapapeles sin ids del lienzo: los nodos con su sitio relativo a la esquina de lo copiado (`x0`, `y0` la guardan) y los
       cables entre ellos. Una operación copiada es **nueva**: su salida es del original (no se reclama dos veces lo creado). */
    copiar(ids) {
      const set = new Set(ids || []), ns = this.datos.nodos.filter(n => set.has(n.id));
      if (!ns.length) return null;
      const x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y));
      const nodos = ns.map(n => {
        const c = clonar(n); c.ref = c.id; delete c.id; c.x -= x0; c.y -= y0;
        if (esOp(c)) { c.estado = 'nuevo'; ['salida', 'error', 'pedido', 'hecho', 'huella'].forEach(k => delete c[k]); }
        return c;
      });
      const cables = this.datos.cables.filter(c => set.has(c.de) && set.has(c.a)).map(c => ({ de: c.de, a: c.a, puerto: c.puerto }));
      return { tipo: 'lienzo', x0, y0, nodos, cables };
    }
    /* Con su esquina en (x, y); sin ellos, donde estaba más 30 px. Devuelve los nodos y cables nuevos. */
    pegar(clip, x, y) {
      if (!clip || clip.tipo !== 'lienzo' || !Array.isArray(clip.nodos) || !clip.nodos.length) return no('No hay nodos que pegar');
      const bx = isFinite(+x) && x !== null && x !== undefined ? entero(x, 0) : entero(clip.x0, 0) + 30;
      const by = isFinite(+y) && y !== null && y !== undefined ? entero(y, 0) : entero(clip.y0, 0) + 30;
      const mapa = new Map(), nodos = [], cables = [];
      clip.nodos.forEach(c => {
        const n = sanearNodo(Object.assign({}, c, { x: entero(c.x, 0) + bx, y: entero(c.y, 0) + by }), this._id('n')); if (!n) return;
        if (esOp(n)) { n.estado = 'nuevo'; ['salida', 'error', 'pedido', 'hecho', 'huella'].forEach(k => delete n[k]); }
        this.datos.nodos.push(n); nodos.push(n); mapa.set(c.ref, n.id);
      });
      (clip.cables || []).forEach(c => {
        const de = mapa.get(c.de), a = mapa.get(c.a); if (!de || !a) return;
        const r = this.conectar(de, a, c.puerto, { reemplazar: false }); if (r.ok) cables.push(r.cable);
      });
      return si({ nodos, cables, ids: nodos.map(n => n.id) });
    }
    duplicar(ids) { const clip = this.copiar(ids); return clip ? this.pegar(clip) : no('No hay nodos que duplicar'); }
  }

  Object.assign(Lienzo, { TIPOS, CLASES, FAMILIAS, ENTRADAS, OPERACIONES, ESTADOS, MAX_DUENDES, sanear, sanearSalida, sanearDatos, sanearDuende, sanearDuendes, huellaDe });
  C.Lienzo = Lienzo;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
