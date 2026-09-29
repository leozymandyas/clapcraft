/* Claquedraw · herramientas para Claude
   Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o
   no) puedas acceder al contenido de la aplicación, tanto texto y muy principalmente la gestión de esquemas». Aquí viven las
   herramientas con que Claude lee y cambia un proyecto: su árbol, los **esquemas** (tramas, actos, columnas, nodos, saltos y
   notas, con las mismas reglas del tablero: js/tramas/modelo.js), los **documentos** (el guion de cada esquema y las notas de
   las bibliotecas, en texto: js/claquedraw/conversor.js), las bibliotecas, los personajes y la búsqueda.
   No saben dónde está el proyecto: se ejecutan sobre un **contexto** (`ctx`) que da el modelo de documentos (`ctx.docs`,
   C.Documentos) y avisa de los cambios (`ctx.cambio()`).
   · En Node, el servidor MCP (claude/servidor.js) abre el `.clapcraft`, ejecuta y escribe el archivo: el proyecto cerrado.
   · En la app (js/claquedraw/app.js, «Claude»), sobre el proyecto abierto: antes se vuelca el tablero y el editor, y después
     el tablero montado y el editor abierto se ponen al día, así el cambio se ve al momento, entra en Deshacer y se guarda solo.
   Todo lo que cambia va **entero o nada**: un lote de operaciones que falla en la quinta no deja las cuatro primeras hechas.
   Las columnas se cuentan **desde 1**, como en la cabecera del tablero. Modelo puro, sin DOM: test/herramientas.test.js. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const Tr = () => raiz.Tramas;
  const V = () => C.conversor;

  /* ---------- utilidades ---------- */
  const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const clonar = x => JSON.parse(JSON.stringify(x));
  const dos = n => String(n).padStart(2, '0');
  const fecha = ts => { if (!ts) return ''; const d = new Date(ts); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()); };
  const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const corto = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const comillas = s => '«' + s + '»';
  class Falla extends Error {}
  const falla = msg => { throw new Falla(msg); };
  const ok = r => { if (!r || !r.ok) falla((r && r.aviso) || 'No se pudo'); return r; };
  const texto = (v, defecto) => (v === undefined || v === null ? (defecto ?? '') : String(v));
  const entero = (v, que) => { const n = Math.round(+v); if (!Number.isFinite(n)) falla((que || 'Ese número') + ' no es un número: ' + JSON.stringify(v)); return n; };
  const lista = v => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
  const ahoraDe = ctx => (ctx.ahora ? ctx.ahora() : Date.now());
  /* **El nombre de una operación de un lote** tal como lo entiende su herramienta: `op` (o `operacion`) sin mayúsculas ni acentos,
     los espacios como «_», y en editar_lienzo sus alias. Lo usan los cuatro lotes y el permiso del asistente (asistente-motor.js,
     `destructivo`): antes cada lote leía `op` a su manera y el permiso miraba `op` tal cual, así que «Tirar Nota» o
     { operacion: "borrar" } se hacían sin preguntar a Leo (revisión del port a ClapBook). */
  const ALIAS_LIENZO = { borrar_nodo: 'borrar', borrar_nodos: 'borrar', mover_nodo: 'mover', mover_nodos: 'mover' };
  const opCruda = o => (o && (o.op !== undefined && o.op !== null && o.op !== '' ? o.op : o.operacion)) || '';
  function nombreOperacion(herramienta, o) {
    if (!o || typeof o !== 'object') return '';
    const k = plano(opCruda(o)).replace(/\s+/g, '_');
    return herramienta === 'editar_lienzo' ? ALIAS_LIENZO[k] || k : k;
  }
  /* Deshace un cambio a medias dejando el mismo objeto (en la app, el gestor sigue teniendo la misma referencia) */
  function reponerEnSitio(obj, json) {
    const x = JSON.parse(json);
    Object.keys(obj).forEach(k => { delete obj[k]; });
    Object.assign(obj, x);
  }

  /* ====================================================================
     Encontrar las cosas por id o por nombre
     ==================================================================== */
  /* `candidatos`: [{ id, nombre, obj }]. Por id exacto; si no, por nombre (sin mayúsculas ni acentos) si es uno solo. */
  function encontrar(candidatos, valor, que) {
    if (valor === undefined || valor === null || valor === '') falla('Falta ' + que);
    if (esEnlace(valor)) {                                     // un enlace de ClapCraft vale en lugar del id (1.1.52)
      const id = idDeEnlace(valor, que), x = candidatos.find(c => c.id === id);
      if (x) return x.obj;
      falla('No encuentro ' + que + ' de ese enlace (' + id + '): ya no está en el proyecto');
    }
    const v = String(valor).trim();
    const porId = candidatos.find(x => x.id === v); if (porId) return porId.obj;
    const iguales = candidatos.filter(x => plano(x.nombre) === plano(v));
    if (iguales.length === 1) return iguales[0].obj;
    if (iguales.length > 1) falla('Hay ' + iguales.length + ' con el nombre ' + comillas(v) + ' (' + que + '): usa su id — ' + iguales.map(x => x.id).join(', '));
    const parecidos = candidatos.filter(x => plano(x.nombre).includes(plano(v)));
    if (parecidos.length === 1) return parecidos[0].obj;
    const muestra = (parecidos.length ? parecidos : candidatos).slice(0, 12).map(x => x.id + ' ' + comillas(x.nombre)).join(', ');
    falla('No encuentro ' + que + ' ' + comillas(v) + (muestra ? '. ' + (parecidos.length ? 'Se parecen: ' : 'Hay: ') + muestra : ''));
  }
  /* **Enlaces** (1.1.52, js/claquedraw/enlaces.js): lo que Leo copia en ClapCraft («Copiar enlace para Claude») y pega en la
     conversación. Vale en lugar del id en cualquier herramienta: de un enlace se toma lo que se busca (de uno de un nodo, su
     esquema si se pide el esquema, y el nodo si se pide el nodo). */
  /* un enlace suelto o en Markdown ([Nodo «X»](clapcraft://…)), tal como lo pegó Leo */
  const esEnlace = v => !!C.enlaces && typeof v === 'string' && /clapcraft:\/\//i.test(v) && C.enlaces.extraer(v).length === 1;
  const DE_ENLACE = {
    'el esquema': x => (x.tipo === 'esquema' ? x.id : x.esquema), 'la biblioteca': x => (x.tipo === 'biblioteca' ? x.id : x.biblioteca),
    'el contenedor': x => (x.tipo === 'contenedor' ? x.id : null), 'la nota': x => (x.tipo === 'nota' && !x.esquema ? x.id : null),
    'el personaje': x => (x.tipo === 'personaje' ? x.id : null), 'la trama': x => (x.tipo === 'trama' ? x.id : x.tipo === 'raya' ? x.trama : null),
    'el acto': x => (x.tipo === 'acto' ? x.id : null), 'el nodo': x => (x.tipo === 'nodo' ? x.id : null), 'la sección': x => (x.tipo === 'seccion' ? x.id : null),
    'el segmento': x => (x.tipo === 'segmento' ? x.id : null), 'la carpeta': x => (x.tipo === 'carpeta' ? x.id : null),
    'la plantilla': x => (x.tipo === 'nota' && !x.esquema ? x.id : null), 'la fórmula': x => (x.tipo === 'nota' && !x.esquema ? x.id : null),
    'el lienzo': x => (x.tipo === 'lienzo' ? x.id : null)       // de un lienzo o de uno de sus nodos (1.1.58)
  };
  function leerEnlace(v) { const x = C.enlaces.leer(C.enlaces.extraer(v)[0] || v); if (!x) falla('Ese enlace no se entiende: ' + String(v).trim()); return x; }
  function idDeEnlace(valor, que) {
    const x = leerEnlace(valor), f = DE_ENLACE[que], id = f && f(x);
    if (!id) falla('Ese enlace es de ' + deQue(x) + ', no de ' + que.replace(/^(el|la) /, '') + ' (' + x.url + ')');
    return id;
  }
  const NOMBRE_TIPO = { proyecto: 'un proyecto', contenedor: 'un contenedor', carpeta: 'una carpeta', grupo: 'un grupo', personaje: 'un personaje', biblioteca: 'una biblioteca',
    seccion: 'una sección', segmento: 'un segmento', nota: 'una nota', esquema: 'un esquema', documento: 'un documento', nodo: 'un nodo', salto: 'un salto', trama: 'una trama',
    acto: 'un acto', enlace: 'un enlace entre nodos', raya: 'una raya', columnas: 'unas columnas', lienzo: 'un lienzo' };
  const deQue = x => (x.tipo === 'nota' && x.esquema ? 'una nota del esquema' : x.tipo === 'lienzo' && x.nodo ? 'un nodo de un lienzo' : NOMBRE_TIPO[x.tipo] || 'otra cosa');
  /* lo de un esquema por su enlace: que sea de ese esquema (los ids de nodos, notas o tramas solo valen dentro del suyo) */
  function enlaceDelEsquema(m, v, tipos) {
    if (!esEnlace(v)) return null;
    const x = leerEnlace(v);
    if (!tipos.includes(x.tipo) || !x.esquema) falla('Ese enlace es de ' + deQue(x) + ', no de ' + tipos.map(t => NOMBRE_TIPO[t]).join(' ni ') + ' (' + x.url + ')');
    if (m._eid && x.esquema !== m._eid) falla('Ese enlace es de otro esquema (' + x.esquema + '), no del que se está leyendo o cambiando (' + m._eid + ')');
    return x;
  }
  const esquemasTodos = docs => docs.datos.contenedores.flatMap(c => c.esquemas.map(e => ({ id: e.id, nombre: e.nombre, obj: { contenedor: c, esquema: e } })));
  const esquemaDe = (docs, v) => encontrar(esquemasTodos(docs), v, 'el esquema');
  /* las bibliotecas del árbol y las de los personajes (con el nombre del personaje); no las ocultas de los guiones */
  const bibliotecasTodas = docs => docs.datos.contenedores.flatMap(c => c.subs.filter(s => !s.guionEid).map(s => ({ id: s.id, nombre: s.nombre, obj: { contenedor: c, sub: s } })));
  /* **Las bibliotecas especiales**, fuera del árbol, con una sola biblioteca de id fijo: las **plantillas de nota** (1.1.56, de
     ClapBook), «Plantillas» (id plantillas:biblioteca), y las **fórmulas** (1.1.60), «Fórmulas» (id formulas:biblioteca): prompts
     reutilizables para las operaciones de IA de los lienzos, solo texto. Se nombran por su nombre y, con `crear`, se hacen si aún
     no existen (para guardar la primera). */
  const ESPECIALES = [
    { clave: 'plantillas', id: () => C.ID_BIB_PLANTILLAS || 'plantillas:biblioteca', nombre: 'Plantillas', nombres: ['plantillas', 'plantilla'], cual: 'la de las plantillas',
      bib: 'bibliotecaPlantillas', asegurar: 'asegurarPlantillas',
      sinCrear: 'Aún no hay plantillas en este proyecto: se guarda una con editar_proyecto › guardar_como_plantilla, o se crea con editar_biblioteca { biblioteca: "Plantillas" } › crear_nota' },
    { clave: 'formulas', id: () => C.ID_BIB_FORMULAS || 'formulas:biblioteca', nombre: 'Fórmulas', nombres: ['formulas', 'formula'], cual: 'la de las fórmulas',
      bib: 'bibliotecaFormulas', asegurar: 'asegurarFormulas',
      sinCrear: 'Aún no hay fórmulas en este proyecto: se crea una con editar_biblioteca { biblioteca: "Fórmulas" } › crear_nota { titulo, contenido }' }
  ];
  /* la especial de una biblioteca (su entrada de ESPECIALES), o null si es normal */
  const especialDe = s => (s ? ESPECIALES.find(E => s.id === E.id()) || null : null);
  const esBibPlantillas = s => !!s && s.id === ESPECIALES[0].id();
  const esBibFormulas = s => !!s && s.id === ESPECIALES[1].id();
  /* la biblioteca especial si ya existe ({ contenedor, sub }), o null */
  function bibEspecial(docs, E) {
    if (typeof docs[E.bib] === 'function') return docs[E.bib]() || null;
    const r = docs.sub && docs.sub(E.id()); return r && r.contenedor.especial === E.clave ? r : null;
  }
  const hayEspecial = (docs, E) => typeof docs[E.bib] === 'function' || typeof docs[E.asegurar] === 'function';
  /* Por su id siempre es la especial; por su nombre («Plantillas», «plantilla», «Fórmulas», «formula»), solo si ninguna biblioteca
     normal se llama así (una biblioteca de Leo que se llame «Plantillas» manda; si también existe la especial, se piden los ids). */
  const normalesLlamadas = (docs, v) => bibliotecasTodas(docs).filter(x => !especialDe(x.obj.sub) && plano(x.nombre) === plano(v));
  const nombraEspecial = v => (typeof v === 'string' ? ESPECIALES.find(E => E.nombres.includes(plano(v))) || null : null);
  /* ¿se pide una especial? (por su id, o por su nombre sin ninguna normal que se llame así): su entrada de ESPECIALES, o null */
  function pideEspecial(v, docs) {
    if (typeof v !== 'string') return null;
    const porId = ESPECIALES.find(E => v === E.id()); if (porId) return porId;
    const E = nombraEspecial(v);
    return E && !(docs && normalesLlamadas(docs, v).length) ? E : null;
  }
  function bibliotecaDe(docs, v, crear) {
    if (typeof v === 'string') {
      const E = ESPECIALES.find(x => v === x.id()) || nombraEspecial(v);
      if (E && hayEspecial(docs, E)) {
        const especial = () => bibEspecial(docs, E) || (crear && docs[E.asegurar] ? docs[E.asegurar]() : null);
        if (v === E.id()) { const r = especial(); if (r) return r; falla(E.sinCrear); }
        const normales = normalesLlamadas(docs, v), pl = bibEspecial(docs, E);
        if (!normales.length) { const r = especial(); if (r) return r; falla(E.sinCrear); }
        if (normales.length === 1 && !pl) return normales[0].obj;
        falla('Hay ' + (normales.length + (pl ? 1 : 0)) + ' con el nombre ' + comillas(v) + ' (la biblioteca): usa su id — '
          + normales.map(x => x.id + ' (en ' + comillas(x.obj.contenedor.nombre) + ')').concat(pl ? [E.id() + ' (' + E.cual + ')'] : []).join(', '));
      }
    }
    return encontrar(bibliotecasTodas(docs), v, 'la biblioteca');
  }
  /* las variables de una plantilla, como las rellena plantillas.js al crear una nota con ella (y al insertarla en el editor) */
  const VARIABLES_TEXTO = 'Variables (se rellenan al crear una nota con la plantilla): {{titulo}} (el de la nota), {{fecha}}, {{hora}}, {{ayer}}, {{mañana}} (con formato tras «:», p. ej. {{fecha:dddd D [de] MMMM}}: YYYY YY MMMM MMM MM M dddd ddd DD D HH H mm ss y [texto] tal cual), {{proyecto}} (el nombre del proyecto) y {{cursor}} (dónde se queda el cursor). Una que no se conoce se queda como está.';
  /* cómo se usan las fórmulas (1.1.60), para leer_biblioteca de «Fórmulas» */
  const FORMULAS_TEXTO = 'Cómo se usan: en una operación de IA de un lienzo (generar, partir, escaleta, resumir, reescribir, traducir, instrucción libre) se eligen una o varias, en orden (editar_lienzo › crear_nodo / editar_nodo { formulas: [ids, títulos o enlaces] }). Van en ese orden, cada una con su título; lo escrito en «Qué escribir» va donde una diga {{instruccion}} y, si ninguna lo dice, detrás, como «Instrucción de Leo». ejecutar_nodo las da ya compuestas. Son solo texto (el Markdown se aplana); el texto de una que ya existe se cambia con escribir_documento { nota }.';
  /* las plantillas, para elegir una (por id, título o enlace) */
  const plantillaDe = (docs, v) => encontrar((docs.plantillas ? docs.plantillas() : []).map(n => ({ id: n.id, nombre: n.titulo, obj: n })), v, 'la plantilla');
  /* las especiales no se mueven, ni se renombran, ni se duplican, ni se tiran: viven fuera del árbol */
  const bibNormal = s => {
    if (esBibPlantillas(s)) falla('La biblioteca de las plantillas no se puede cambiar de sitio, renombrar, colorear, duplicar, agrupar ni tirar (sus plantillas sí se tiran, una a una)');
    if (esBibFormulas(s)) falla('La biblioteca de las fórmulas no se puede cambiar de sitio, renombrar, colorear, duplicar, agrupar ni tirar (sus fórmulas sí se tiran, una a una)');
    return s;
  };
  /* **Fórmulas** (1.1.60): notas de solo texto en «Fórmulas» que Leo elige en una operación de IA del lienzo (varias, en orden) para
     darle formato, tono o reglas, como una skill. `{{instruccion}}` dentro de una dice dónde va lo escrito en «Qué escribir». */
  const ID_BIB_FORMULAS = () => ESPECIALES[1].id();
  const esFormulaN = (docs, n) => !!n && (docs.esFormula ? docs.esFormula(n) : n.subId === ID_BIB_FORMULAS());
  const formulasTodas = docs => (docs.formulas ? docs.formulas() : docs.datos.notas.filter(n => n.subId === ID_BIB_FORMULAS()));
  /* el texto plano de una fórmula (el que va a la IA) */
  const textoFormula = (docs, n) => String((docs.textoFormula ? docs.textoFormula(n.id) : null) ?? Fm().textoDeHtml(n.html || ''));
  /* una fórmula por id, título o enlace (de una fórmula, o nota/<id>) */
  const formulaDe = (docs, v) => encontrar(formulasTodas(docs).map(n => ({ id: n.id, nombre: n.titulo, obj: n })), v, 'la fórmula');
  /* el texto plano ↔ HTML de párrafos y el aplanado del Markdown viven en js/claquedraw/formulas.js (en Node, se pide aquí) */
  const Fm = () => C.formulas || (typeof require === 'function' ? require('./formulas.js').formulas : null);
  /* el HTML de una fórmula desde lo que escriba Claude: el Markdown aplanado, un párrafo simple por renglón */
  const htmlFormula = md => Fm().htmlDeTexto(Fm().aplanar(md)) || '<p><br></p>';
  const contenedorDe = (docs, v) => encontrar(docs.datos.contenedores.filter(c => !c.oculto).map(c => ({ id: c.id, nombre: c.nombre, obj: c })), v, 'el contenedor');
  function notaDe(docs, v, subId) {
    const ns = docs.datos.notas.filter(n => !subId || n.subId === subId);
    return encontrar(ns.map(n => ({ id: n.id, nombre: n.titulo, obj: n })), v, 'la nota');
  }
  const personajeDe = (docs, v) => encontrar(docs.datos.elenco.map(p => ({ id: p.id, nombre: p.nombre, obj: p })), v, 'el personaje');
  /* dónde vive una nota: «Contenedor › Biblioteca › Segmento» o el documento de un esquema */
  function lugarDeNota(docs, n) {
    const r = docs.sub(n.subId); if (!r) return '';
    if (r.sub.guionEid) { const e = docs.esquema(r.sub.guionEid); return 'documento del esquema ' + comillas(e ? e.esquema.nombre : '?'); }
    const E = especialDe(r.sub);
    if (E) { const e = n.etiquetaId && docs.etiqueta(n.etiquetaId); return E.nombre + ' › ' + (e ? e.nombre : 'sin segmento'); }
    const per = r.sub.lineaId && docs.personaje(r.sub.lineaId);
    const e = n.etiquetaId && docs.etiqueta(n.etiquetaId);
    return (per ? 'Personajes › ' + per.nombre : r.contenedor.nombre + ' › ' + r.sub.nombre) + ' › ' + (e ? e.nombre : 'sin segmento');
  }

  /* ====================================================================
     Colores, tipos y formas
     ==================================================================== */
  const NADA = ['', 'ninguno', 'ninguna', 'sin color', 'sin', 'trama', 'papel', 'nada', 'null', 'none', 'auto', 'automatico', 'por defecto'];
  /* un tono de los 24 (tramas, nodos, notas del esquema, notas de biblioteca); con `obligatorio`, no vale «ninguno» */
  function tono(v, obligatorio) {
    if (v === null || v === undefined || NADA.includes(plano(v))) { if (obligatorio) falla('Ese color no vale aquí: elige uno de ' + Tr().PALETA.map(c => c.id).join(', ')); return null; }
    const c = Tr().PALETA.find(x => x.id === plano(v) || plano(x.label) === plano(v));
    if (!c) falla('No conozco el color ' + comillas(v) + '. Colores: ' + Tr().PALETA.map(x => x.id).join(', '));
    return c.id;
  }
  function fondo(v) {
    if (v === null || v === undefined || ['', 'auto', 'automatico', 'por defecto', 'null'].includes(plano(v))) return null;
    if (['ninguno', 'sin fondo', 'sin', 'nada', 'none'].includes(plano(v))) return 'ninguno';
    const f = Tr().FONDOS.find(x => x.id === plano(v) || plano(x.label) === plano(v));
    if (!f) falla('No conozco el fondo ' + comillas(v) + '. Fondos: auto, ninguno, ' + Tr().FONDOS.filter(x => x.id !== 'ninguno').map(x => x.id).join(', '));
    return f.id;
  }
  /* los 16 colores de etiqueta (segmentos, personajes, esquemas y bibliotecas en el árbol): índice o nombre */
  function colorEtiqueta(v) {
    const pal = C.PALETA_ETIQUETAS;
    if (v === null || v === undefined || v === '') return null;
    if (/^\d+$/.test(String(v).trim())) { const i = +v; if (i >= 0 && i < pal.length) return i; }
    const i = pal.findIndex(t => plano(t[0]) === plano(v));
    if (i < 0) falla('No conozco el color ' + comillas(v) + '. Colores: ' + pal.map((t, k) => k + ' ' + t[0]).join(', '));
    return i;
  }
  const nombreColorEtiqueta = i => (C.PALETA_ETIQUETAS[i] || ['?'])[0];
  function tipoTrama(v) {
    const t = plano(v);
    if (t === 'principal') return 'principal';
    if (t === 'secundaria' || t === 'secundario') return 'secundaria';
    if (['alterna', 'alternativa', 'alternativo', 'alternativas'].includes(t)) return 'alterna';
    falla('Tipo de trama desconocido ' + comillas(v) + ': principal, secundaria o alternativa');
  }
  const TIPO_TEXTO = { principal: 'principal', secundaria: 'secundaria', alterna: 'alternativa' };
  function formaDe(v) {
    const t = plano(v);
    if (['cuadro', 'cambio de escena', 'salto trama', 'cuadrado'].includes(t)) return 'cuadro';
    if (['rombo', 'salto alternativo', 'alternativo'].includes(t)) return 'rombo';
    falla('Forma de salto desconocida ' + comillas(v) + ': cuadro (cambio de escena) o rombo (salto alternativo)');
  }
  const FORMA_TEXTO = { cuadro: 'cambio de escena (cuadro)', rombo: 'salto alternativo (rombo)' };

  /* ====================================================================
     Esquemas: lectura
     ==================================================================== */
  const NOMBRES_PERSONAJE = { acto: 'Momento', linea: 'Personaje', punto: 'Evento', nodo: 'Evento', cuadro: 'Relación', femeninos: ['cuadro'] };
  function modeloDe(docs, r) {
    const m = new (Tr().Modelo)(r.esquema.datos);
    if (docs.esEsquemaPersonaje(r.esquema.id)) m.nombres = NOMBRES_PERSONAJE;
    m._eid = r.esquema.id;                                      // para no tomar el nodo p3 de otro esquema por un enlace
    return m;
  }
  const col1 = c => c + 1;
  const rango = (a, b) => (a === b ? 'columna ' + col1(a) : 'columnas ' + col1(a) + '–' + col1(b));
  /* dónde cuelga una nota del esquema, en palabras y en datos */
  function sitioNota(m, n) {
    if (n.abierta) return { texto: 'en la raya de ' + comillas((m.linea(n.lineaId) || {}).nombre) + ' entre las columnas ' + col1(m.colNota(n)) + ' y ' + (col1(m.colNota(n)) + 1),
                            datos: { trama: n.lineaId, columna: col1(m.colNota(n)) }, col: m.colNota(n) + 0.5, linea: n.lineaId };
    const a = m.punto(n.deId), b = n.aId && m.punto(n.aId);
    const tit = p => (p && p.titulo ? ' «' + p.titulo + '»' : '');
    if (!b) return { texto: 'en el nodo ' + n.deId + tit(a), datos: { nodo: n.deId }, col: a ? m.cg(a) : 0, linea: a && a.lineaId, nodo: n.deId };
    return { texto: 'en el enlace entre ' + n.deId + tit(a) + ' y ' + n.aId + tit(b), datos: { entre: [n.deId, n.aId] }, col: (m.cg(a) + m.cg(b)) / 2, linea: a.lineaId, enlace: n.deId };
  }
  function datosEsquema(docs, r, m) {
    const e = r.esquema, d = m.datos, per = docs.esEsquemaPersonaje(e.id);
    const actoDe = c => { const a = m.actoEn(c); return a ? a.id : null; };
    const g = docs.grupoDe(e.id), doc = docs.documentoEsquema(e.id);
    return {
      id: e.id, nombre: e.nombre, contenedor: r.contenedor.oculto ? null : r.contenedor.nombre, grupo: g ? g.grupo.nombre : null,
      personaje: per || undefined,
      bibliotecas: docs.bibliotecasDe(e.id).map(x => ({ id: x.sub.id, nombre: x.sub.nombre, contenedor: x.contenedor.nombre })),   // conectadas (1.1.57)
      fragmentos: docs.fragmentosDe(e.id).length,
      documento: doc ? { nota: doc.id, titulo: doc.titulo, palabras: V().palabras(doc.html), versiones: (doc.versiones || []).length } : null,
      columnas: m.totalCeldas(),
      actos: d.actos.map(a => ({ id: a.id, nombre: a.nombre, desde: col1(a.desde), hasta: a.desde + a.celdas, columnas: a.celdas, fondo: a.fondo || 'auto' })),
      tramas: d.lineas.map((l, i) => Object.assign({ id: l.id, nombre: l.nombre, posicion: i + 1, tipo: TIPO_TEXTO[l.tipo], color: l.color, nodos: m.puntosDe(l.id).length },
        l.oculta ? { oculta: true } : {}, l.cortada ? { descartada: true } : {}, l.personaje ? { personaje: (docs.personaje(l.personaje) || {}).nombre || l.personaje } : {})),
      nodos: d.puntos.slice().sort((p, q) => m.cg(p) - m.cg(q) || d.lineas.findIndex(l => l.id === p.lineaId) - d.lineas.findIndex(l => l.id === q.lineaId)).map(p => {
        const s = m.saltoDe(p.id);
        return Object.assign({ id: p.id, trama: p.lineaId, columna: col1(m.cg(p)), acto: actoDe(m.cg(p)), titulo: p.titulo },
          p.descripcion ? { descripcion: p.descripcion } : {}, p.color ? { color: p.color } : {}, p.cortado ? { descartado: true } : {},
          p.colorEnlace ? { color_enlace: p.colorEnlace } : {},
          s ? { salto: { id: s.id, forma: s.tipo, papel: s.deId === p.id ? 'salida' : 'llegada', pareja: s.deId === p.id ? s.aId : s.deId } } : {});
      }),
      saltos: d.saltos.map(s => { const a = m.punto(s.deId), b = m.punto(s.aId);
        return { id: s.id, forma: s.tipo, columna: a ? col1(m.cg(a)) : null, de: s.deId, a: s.aId, de_trama: a && a.lineaId, a_trama: b && b.lineaId, titulo: (a && a.titulo) || '' }; }),
      notas: d.notas.map(n => Object.assign({ id: n.id, texto: n.texto }, n.color ? { color: n.color } : {}, n.nivel ? { nivel: n.nivel } : {}, sitioNota(m, n).datos))
    };
  }
  /* El esquema en texto: tramas, actos y la línea del tiempo columna a columna, con las notas debajo de su sitio. */
  function textoEsquema(docs, r, m, op) {
    op = op || {};
    const x = datosEsquema(docs, r, m), d = m.datos, L = [];
    const nomL = id => (m.linea(id) || {}).nombre || id;
    L.push('ESQUEMA ' + comillas(x.nombre) + ' · id ' + x.id + (x.personaje ? ' · esquema de personaje' : '') + (x.contenedor ? ' · contenedor ' + comillas(x.contenedor) : '') + (x.grupo ? ' · grupo ' + comillas(x.grupo) : ''));
    L.push(plural(x.columnas, 'columna', 'columnas') + ' · ' + plural(x.actos.length, 'acto', 'actos') + ' · ' + plural(x.tramas.length, 'trama', 'tramas') + ' · '
      + plural(x.nodos.filter(n => !n.salto).length, 'nodo', 'nodos') + ' · ' + plural(x.saltos.length, 'salto', 'saltos') + ' · ' + plural(x.notas.length, 'nota', 'notas'));
    L.push(x.bibliotecas.length ? 'Bibliotecas conectadas: ' + x.bibliotecas.map(b => comillas(b.nombre) + ' (' + b.id + (b.contenedor !== x.contenedor ? ', en ' + comillas(b.contenedor) : '') + ')').join(', ')
      + (x.fragmentos ? ' · ' + plural(x.fragmentos, 'nota es fragmento', 'notas son fragmentos') + ' de este esquema (leer_biblioteca las lista)' : '')
      : 'Bibliotecas conectadas: ninguna (editar_proyecto › conectar { esquema, biblioteca })' + (x.fragmentos ? ' · ' + plural(x.fragmentos, 'nota es fragmento', 'notas son fragmentos') + ' de este esquema' : ''));
    if (x.documento) L.push('Documento: ' + comillas(x.documento.titulo) + ' (' + miles(x.documento.palabras) + ' palabras' + (x.documento.versiones ? ', ' + plural(x.documento.versiones, 'versión', 'versiones') : '') + ') — léelo con leer_documento { esquema }');
    else if (!x.personaje) L.push('Documento: aún no tiene (escribir_documento { esquema } lo crea)');
    L.push('', 'TRAMAS (de arriba abajo)');
    x.tramas.forEach(t => L.push('- ' + t.id + ' ' + comillas(t.nombre) + ' · ' + t.tipo + ' · ' + t.color + ' · ' + plural(t.nodos, 'nodo', 'nodos')
      + (t.personaje ? ' · personaje ' + t.personaje : '') + (t.oculta ? ' · OCULTA' : '') + (t.descartada ? ' · descartada' : '')));
    L.push('', 'ACTOS');
    if (!x.actos.length) L.push('- (ninguno: las columnas no están en ningún acto)');
    x.actos.forEach(a => L.push('- ' + a.id + ' ' + comillas(a.nombre) + ' · ' + rango(a.desde - 1, a.hasta - 1) + (a.fondo !== 'auto' ? ' · fondo ' + a.fondo : '')));
    L.push('', 'LÍNEA DEL TIEMPO (col = columna del tablero, desde 1; los nodos en el orden del tiempo)');
    /* cada cosa con su columna: nodos (un salto, una vez), notas de raya y, bajo cada nodo, sus notas y las del enlace que sale de él */
    const items = [];
    const vistos = new Set();
    d.puntos.forEach(p => {
      if (vistos.has(p.id)) return;
      const s = m.saltoDe(p.id);
      if (s) { vistos.add(s.deId); vistos.add(s.aId); items.push({ col: m.cg(p), fila: Math.min(...[s.deId, s.aId].map(id => d.lineas.findIndex(l => l.id === (m.punto(id) || {}).lineaId))), salto: s }); }
      else { vistos.add(p.id); items.push({ col: m.cg(p), fila: d.lineas.findIndex(l => l.id === p.lineaId), punto: p }); }
    });
    d.notas.filter(n => n.abierta).forEach(n => items.push({ col: m.colNota(n) + 0.5, fila: d.lineas.findIndex(l => l.id === n.lineaId), raya: n }));
    items.sort((a, b) => a.col - b.col || a.fila - b.fila);
    const notasDe = (id, deEnlace) => d.notas.filter(n => !n.abierta && n.deId === id && (deEnlace ? !!n.aId : !n.aId));
    const linNota = (n, pre) => '    ' + pre + 'nota ' + n.id + (n.color ? ' [' + n.color + ']' : '') + ': ' + String(n.texto).trim().replace(/\s*\n\s*/g, ' / ');
    const desc = p => (op.descripciones === false || !p.descripcion ? [] : String(p.descripcion).split('\n').filter(l => l.trim()).map(l => '    │ ' + l));
    const hasta = n => { const b = m.punto(n.aId); return n.aId + (b && b.titulo ? ' «' + b.titulo + '»' : ''); };
    let actoActual;
    items.forEach(it => {
      const c = Math.floor(it.col), a = m.actoEn(c);
      if ((a && a.id) !== actoActual) { actoActual = a && a.id; L.push(a ? '— ' + a.nombre + ' (' + rango(a.desde, a.desde + a.celdas - 1) + ')' : '— Fuera de los actos'); }
      if (it.raya) { const n = it.raya; L.push('  col ' + col1(m.colNota(n)) + '–' + (col1(m.colNota(n)) + 1) + ' · ' + nomL(n.lineaId) + ' · raya: nota ' + n.id + (n.color ? ' [' + n.color + ']' : '') + ': ' + String(n.texto).trim().replace(/\s*\n\s*/g, ' / ')); return; }
      if (it.salto) {
        const s = it.salto, a1 = m.punto(s.deId), b1 = m.punto(s.aId);
        L.push('  col ' + col1(c) + ' · ' + (s.tipo === 'rombo' ? '◇ ' : '▢ ') + s.id + ' ' + FORMA_TEXTO[s.tipo] + (a1.titulo ? ' ' + comillas(a1.titulo) : '') + ': sale de '
          + comillas(nomL(a1.lineaId)) + ' (' + a1.id + ') y llega a ' + comillas(nomL(b1.lineaId)) + ' (' + b1.id + ')');
        [a1, b1].forEach(p => { desc(p).forEach(l => L.push(l)); notasDe(p.id, false).forEach(n => L.push(linNota(n, ''))); notasDe(p.id, true).forEach(n => L.push(linNota(n, '→ enlace hasta ' + hasta(n) + ': '))); });
        return;
      }
      const p = it.punto;
      L.push('  col ' + col1(c) + ' · ' + nomL(p.lineaId) + ' · ' + p.id + ' ' + comillas(p.titulo || '(sin título)') + (p.color ? ' [' + p.color + ']' : '') + (p.cortado ? ' (descartado)' : '') + (p.colorEnlace ? ' (enlace ' + p.colorEnlace + ')' : ''));
      desc(p).forEach(l => L.push(l));
      notasDe(p.id, false).forEach(n => L.push(linNota(n, '')));
      notasDe(p.id, true).forEach(n => L.push(linNota(n, '→ enlace hasta ' + hasta(n) + ': ')));
    });
    if (!items.length) L.push('  (vacío: ningún nodo todavía)');
    return L.join('\n');
  }
  function leerEsquema(ctx, args) {
    const docs = ctx.docs, r = esquemaDe(docs, args.esquema), m = modeloDe(docs, r);
    if (args.formato === 'json') return { texto: JSON.stringify(datosEsquema(docs, r, m), null, 1) };
    const u = enlaceDe(ctx, { tipo: 'esquema', id: r.esquema.id });
    return { texto: textoEsquema(docs, r, m, { descripciones: args.descripciones !== false }) + (u ? '\n\nEnlace: ' + u + ' (de un nodo: ' + u + '/nodo/<id>; de una nota: …/nota/<id>)' : '') };
  }

  /* ====================================================================
     Esquemas: editar (un lote de operaciones, entero o nada)
     ==================================================================== */
  const REF = /^\$(.+)$/;
  function guardarRef(refs, ref, tipo, id) {
    if (ref === undefined || ref === null || ref === '') return;
    const k = String(ref).replace(/^\$/, '');
    if (refs.has(k)) falla('La referencia «$' + k + '» ya se usó en esta lista');
    refs.set(k, { tipo, id });
  }
  function deRef(refs, v, tipo) {
    const r = REF.exec(String(v)); if (!r) return null;
    const x = refs.get(r[1]);
    if (!x) falla('«$' + r[1] + '» no es nada creado antes en esta lista (las referencias se crean con "ref")');
    if (tipo && x.tipo !== tipo) falla('«$' + r[1] + '» es un ' + x.tipo + ', no un ' + tipo);
    return x.id;
  }
  const porEnlace = (m, v, tipos, dar) => { const x = enlaceDelEsquema(m, v, tipos); if (!x) return null; const o = dar(x); if (!o) falla('Eso ya no está en el esquema (' + x.url + ')'); return o; };
  const tramaDe = (m, v, refs) => { const e = porEnlace(m, v, ['trama', 'raya'], x => m.linea(x.tipo === 'raya' ? x.trama : x.id)); if (e) return e; const id = deRef(refs, v, 'trama'); if (id) return m.linea(id); return encontrar(m.datos.lineas.map(l => ({ id: l.id, nombre: l.nombre, obj: l })), v, 'la trama'); };
  const actoDe = (m, v, refs) => { const e = porEnlace(m, v, ['acto'], x => m.acto(x.id)); if (e) return e; const id = deRef(refs, v, 'acto'); if (id) return m.acto(id); return encontrar(m.datos.actos.map(a => ({ id: a.id, nombre: a.nombre, obj: a })), v, 'el acto'); };
  const nodoDe = (m, v, refs) => {
    const e = porEnlace(m, v, ['nodo', 'salto'], x => (x.tipo === 'salto' ? (s => s && m.punto(s.deId))(m.salto(x.id)) : m.punto(x.id))); if (e) return e;
    const x = REF.exec(String(v)) && refs.get(REF.exec(String(v))[1]);
    if (x && x.tipo === 'salto') { const s = m.salto(x.id); return m.punto(s.deId); }
    const id = deRef(refs, v, 'nodo'); if (id) return m.punto(id);
    return encontrar(m.datos.puntos.map(p => ({ id: p.id, nombre: p.titulo, obj: p })), v, 'el nodo');
  };
  const notaEsqDe = (m, v, refs) => { const e = porEnlace(m, v, ['nota'], x => m.nota(x.id)); if (e) return e; const id = deRef(refs, v, 'nota'); if (id) return m.nota(id); return encontrar(m.datos.notas.map(n => ({ id: n.id, nombre: n.texto, obj: n })), v, 'la nota'); };
  const saltoDe = (m, v, refs) => {
    const e = porEnlace(m, v, ['salto', 'nodo'], x => (x.tipo === 'salto' ? m.salto(x.id) : m.saltoDe(x.id))); if (e) return e;
    const id = deRef(refs, v, null); if (id && m.salto(id)) return m.salto(id);
    if (id && m.saltoDe(id)) return m.saltoDe(id);
    const s = m.salto(String(v)) || m.saltoDe(String(v)); if (s) return s;
    const p = m.datos.puntos.filter(q => m.saltoDe(q.id) && plano(q.titulo) === plano(v));
    if (p.length) return m.saltoDe(p[0].id);
    falla('No encuentro el salto ' + comillas(v) + '. Saltos: ' + (m.datos.saltos.map(s2 => s2.id).join(', ') || 'ninguno'));
  };
  const columna = (v, que) => { const n = entero(v, que || 'La columna'); if (n < 1) falla((que || 'La columna') + ' empieza en 1'); return n - 1; };
  const columnasDe = o => {
    if (o.columnas !== undefined) return lista(o.columnas).map(v => columna(v));
    if (o.desde !== undefined) { const a = columna(o.desde, 'desde'), b = o.hasta !== undefined ? columna(o.hasta, 'hasta') : a; const out = []; for (let c = Math.min(a, b); c <= Math.max(a, b); c++) out.push(c); return out; }
    if (o.columna !== undefined) return [columna(o.columna)];
    falla('Faltan las columnas');
  };
  const tituloDe = p => comillas(p.titulo || '(sin título)');
  /* el sitio de una nota: nodo, enlace entre dos nodos o raya de una trama */
  function ponerNota(m, o, refs, idNota) {
    if (o.nodo !== undefined) { const p = nodoDe(m, o.nodo, refs); return idNota ? ok(m.moverNota(idNota, p.id, null)) : { deId: p.id, aId: null }; }
    if (o.entre !== undefined) {
      const e = lista(o.entre); if (e.length !== 2) falla('"entre" lleva dos nodos consecutivos de la misma trama');
      const a = nodoDe(m, e[0], refs), b = nodoDe(m, e[1], refs);
      return idNota ? ok(m.moverNota(idNota, a.id, b.id)) : { deId: a.id, aId: b.id };
    }
    if (o.trama !== undefined && o.columna !== undefined) {
      const l = tramaDe(m, o.trama, refs), c = columna(o.columna); m.asegurarCeldas(c + 1);
      return idNota ? ok(m.moverNotaAbierta(idNota, l.id, c)) : { lineaId: l.id, cg: c };
    }
    falla('Di dónde va la nota: "nodo", "entre" [nodo, nodo] o "trama" y "columna" (la raya que va de esa columna a la siguiente)');
  }
  const OPS_ESQUEMA = {
    crear_trama(m, o, refs) {
      const r = ok(m.nuevaLinea(o.tipo ? tipoTrama(o.tipo) : 'secundaria')), l = r.linea;
      if (o.nombre !== undefined && texto(o.nombre).trim()) ok(m.editarLinea(l.id, { nombre: texto(o.nombre).trim() }));
      if (o.color !== undefined) ok(m.editarLinea(l.id, { color: tono(o.color, true) }));
      if (o.posicion !== undefined) ok(m.moverLinea(l.id, entero(o.posicion, 'La posición') - 1));
      guardarRef(refs, o.ref, 'trama', l.id);
      return 'trama ' + l.id + ' ' + comillas(l.nombre) + ' (' + TIPO_TEXTO[l.tipo] + ', ' + l.color + ', posición ' + (m.datos.lineas.indexOf(l) + 1) + ')';
    },
    editar_trama(m, o, refs) {
      const l = tramaDe(m, o.trama, refs), hecho = [];
      if (o.nombre !== undefined) { const n = texto(o.nombre).trim(); if (!n) falla('El nombre de la trama no puede quedar vacío'); ok(m.editarLinea(l.id, { nombre: n })); hecho.push('nombre'); }
      if (o.color !== undefined) { ok(m.editarLinea(l.id, { color: tono(o.color, true) })); hecho.push('color ' + l.color); }
      if (o.tipo !== undefined) { const r = ok(m.fijarTipo(l.id, tipoTrama(o.tipo))); hecho.push(TIPO_TEXTO[l.tipo] + (r.aviso ? ' (' + r.aviso + ')' : '')); }
      if (o.oculta !== undefined) { ok(m.ocultarLinea(l.id, !!o.oculta)); hecho.push(o.oculta ? 'oculta' : 'a la vista'); }
      if (o.descartada !== undefined) { ok(m.descartarLinea(l.id, !!o.descartada)); hecho.push(o.descartada ? 'descartada' : 'en uso'); }
      if (o.posicion !== undefined) { ok(m.moverLinea(l.id, entero(o.posicion, 'La posición') - 1)); hecho.push('posición ' + (m.datos.lineas.indexOf(l) + 1)); }
      return 'trama ' + l.id + ' ' + comillas(l.nombre) + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    borrar_trama(m, o, refs) {
      const l = tramaDe(m, o.trama, refs), n = m.puntosDe(l.id).length;
      ok(m.borrarLinea(l.id));
      return 'trama ' + l.id + ' ' + comillas(l.nombre) + ' eliminada' + (n ? ' con ' + plural(n, 'nodo', 'nodos') : '');
    },
    crear_acto(m, o, refs) {
      const T = Tr(), fin = m.datos.actos.reduce((x, a) => Math.max(x, a.desde + a.celdas), 0);
      const desde = o.desde !== undefined ? columna(o.desde, 'desde') : fin;
      const celdas = o.columnas !== undefined ? Math.max(1, entero(o.columnas, 'columnas')) : T.ANCHO_ACTO;
      const choca = m.datos.actos.find(a => desde < a.desde + a.celdas && a.desde < desde + celdas);
      if (choca) falla(rango(desde, desde + celdas - 1) + ' se pisan con ' + comillas(choca.nombre) + ' (' + rango(choca.desde, choca.desde + choca.celdas - 1) + '): los actos no se pisan');
      const a = ok(m.nuevoActo()).acto;
      a.desde = desde; a.celdas = celdas; m._ordenarActos(); m.asegurarCeldas(desde + celdas - 1);
      if (o.nombre !== undefined && texto(o.nombre).trim()) ok(m.editarActo(a.id, { nombre: texto(o.nombre).trim() }));
      if (o.fondo !== undefined) ok(m.editarActo(a.id, { fondo: fondo(o.fondo) }));
      guardarRef(refs, o.ref, 'acto', a.id);
      return 'acto ' + a.id + ' ' + comillas(a.nombre) + ' · ' + rango(a.desde, a.desde + a.celdas - 1);
    },
    editar_acto(m, o, refs) {
      const a = actoDe(m, o.acto, refs), hecho = [];
      if (o.nombre !== undefined) { const n = texto(o.nombre).trim(); if (!n) falla('El nombre del acto no puede quedar vacío'); ok(m.editarActo(a.id, { nombre: n })); hecho.push('nombre'); }
      if (o.fondo !== undefined) { ok(m.editarActo(a.id, { fondo: fondo(o.fondo) })); hecho.push('fondo ' + (a.fondo || 'auto')); }
      if (o.desde !== undefined) {
        const pedido = columna(o.desde, 'desde'); ok(m.moverActo(a.id, pedido));
        hecho.push(a.desde === pedido ? 'empieza en la columna ' + col1(a.desde) : 'no cabe desde la ' + col1(pedido) + ' (sus vecinos no se pisan): empieza en la ' + col1(a.desde));
      }
      if (o.columnas !== undefined) {
        const pedido = Math.max(1, entero(o.columnas, 'columnas')); ok(m.fijarAncho(a.id, pedido));
        hecho.push(a.celdas === pedido ? plural(a.celdas, 'columna', 'columnas') : 'no caben ' + pedido + ' columnas (sus vecinos no se pisan): se queda con ' + a.celdas);
      }
      return 'acto ' + a.id + ' ' + comillas(a.nombre) + ' · ' + rango(a.desde, a.desde + a.celdas - 1) + (hecho.length ? ': ' + hecho.join(', ') : '');
    },
    borrar_acto(m, o, refs) { const a = actoDe(m, o.acto, refs); ok(m.borrarActo(a.id)); return 'acto ' + a.id + ' ' + comillas(a.nombre) + ' eliminado (sus columnas y lo que hay en ellas se quedan)'; },
    insertar_columnas(m, o) {
      const c = columna(o.columna), n = Math.max(1, entero(o.cantidad === undefined ? 1 : o.cantidad, 'cantidad'));
      m.asegurarCeldas(c);
      const r = ok(m.insertarColumnas(c, n, plano(o.lado) === 'derecha' ? 'derecha' : 'izquierda'));
      return r.aviso + ' (desde la columna ' + col1(r.desde) + '; lo de detrás se corrió ' + plural(n, 'columna', 'columnas') + ')';
    },
    borrar_columnas(m, o) { const r = ok(m.borrarColumnas(columnasDe(o))); return r.aviso; },
    mover_columnas(m, o) {
      const cs = columnasDe(o).sort((x, y) => x - y);
      const delta = o.delta !== undefined ? entero(o.delta, 'delta') : o.destino !== undefined ? columna(o.destino, 'destino') - cs[0] : falla('Falta "destino" (dónde queda la primera) o "delta"');
      const r = ok(m.moverColumnas(cs, delta)); return r.aviso || 'columnas sin mover';
    },
    crear_nodo(m, o, refs) {
      const l = tramaDe(m, o.trama, refs);
      let c;
      if (o.columna === undefined || o.columna === null || o.columna === '') { const ps = m.puntosDe(l.id); c = ps.length ? m.cg(ps[ps.length - 1]) + 1 : 0; }
      else c = columna(o.columna);
      m.asegurarCeldas(c);
      const titulo = texto(o.titulo).trim();
      if (!titulo) falla('Un nodo necesita título (en la app, un nodo sin texto no se guarda)');
      const props = { titulo };
      if (o.descripcion !== undefined) props.descripcion = texto(o.descripcion);
      if (o.color !== undefined) props.color = tono(o.color);
      const p = ok(m.nuevoPunto(l.id, c, props)).punto;
      if (o.descartado) ok(m.descartarPunto(p.id, true));
      guardarRef(refs, o.ref, 'nodo', p.id);
      return 'nodo ' + p.id + ' ' + tituloDe(p) + ' en ' + comillas(l.nombre) + ', columna ' + col1(p.col);
    },
    editar_nodo(m, o, refs) {
      const p = nodoDe(m, o.nodo, refs), cambios = {}, hecho = [];
      if (o.titulo !== undefined) { cambios.titulo = texto(o.titulo).trim(); if (!cambios.titulo && !m.saltoDe(p.id)) falla('El título de un nodo no puede quedar vacío'); hecho.push('título'); }
      if (o.descripcion !== undefined) { cambios.descripcion = texto(o.descripcion); hecho.push('descripción'); }
      if (o.color !== undefined) { cambios.color = tono(o.color); hecho.push('color ' + (cambios.color || 'de la trama')); }
      ok(m.editarPunto(p.id, cambios));
      /* el nombre de un salto va en sus dos extremos (como al renombrarlo en su trazo) */
      if (cambios.titulo !== undefined && m.parejaDe(p.id)) m.parejaDe(p.id).titulo = cambios.titulo;
      if (o.descartado !== undefined) { ok(m.descartarPunto(p.id, !!o.descartado)); hecho.push(o.descartado ? 'descartado' : 'en escena'); }
      if (o.color_enlace !== undefined) { ok(m.colorearEnlace(p.id, tono(o.color_enlace))); hecho.push('color del enlace'); }
      return 'nodo ' + p.id + ' ' + tituloDe(p) + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    mover_nodo(m, o, refs) {
      const p = nodoDe(m, o.nodo, refs), antes = { col: m.cg(p), linea: p.lineaId };
      const dest = { col: o.columna !== undefined ? columna(o.columna) : m.cg(p) };
      if (o.trama !== undefined) dest.lineaId = tramaDe(m, o.trama, refs).id;
      m.asegurarCeldas(dest.col);
      const r = ok(m.moverPunto(p.id, dest, { intercambiar: !!o.intercambiar }));
      if (r.intercambio) return r.aviso;
      return 'nodo ' + p.id + ' ' + tituloDe(p) + ': de ' + comillas((m.linea(antes.linea) || {}).nombre) + ' col ' + col1(antes.col) + ' a ' + comillas((m.linea(p.lineaId) || {}).nombre) + ' col ' + col1(m.cg(p));
    },
    mover_nodos(m, o, refs) {
      const ids = lista(o.nodos).map(v => nodoDe(m, v, refs).id);
      return ok(m.moverBloque(ids, entero(o.columnas || 0, 'columnas'), entero(o.tramas || 0, 'tramas'))).aviso || 'nada que mover';
    },
    borrar_nodo(m, o, refs) {
      const p = nodoDe(m, o.nodo, refs), s = m.saltoDe(p.id), notas = m.datos.notas.filter(n => !n.abierta && (n.deId === p.id || n.aId === p.id)).length;
      ok(m.borrarPunto(p.id));
      return (s ? 'salto ' + s.id + ' eliminado con sus dos extremos' : 'nodo ' + p.id + ' ' + tituloDe(p) + ' eliminado') + (notas ? ' (y ' + plural(notas, 'nota', 'notas') + ')' : '');
    },
    crear_salto(m, o, refs) {
      const origen = tramaDe(m, o.desde !== undefined ? o.desde : o.trama, refs), destino = tramaDe(m, o.hacia, refs);
      if (o.columna === undefined) falla('Falta la columna del salto');
      const c = columna(o.columna); m.asegurarCeldas(c);
      const titulo = texto(o.titulo).trim();
      const a = ok(m.nuevoPunto(origen.id, c, { titulo })).punto;          // el extremo de salida nace en la celda, como arrastrando el «+»
      const r = ok(m.crearSalto(a.id, destino.id, o.forma !== undefined ? formaDe(o.forma) : undefined));
      m.punto(r.salto.aId).titulo = titulo;
      guardarRef(refs, o.ref, 'salto', r.salto.id);
      return FORMA_TEXTO[r.salto.tipo] + ' ' + r.salto.id + (titulo ? ' ' + comillas(titulo) : '') + ': de ' + comillas(origen.nombre) + ' a ' + comillas(destino.nombre) + ', columna ' + col1(c) + ' (extremos ' + r.salto.deId + ' y ' + r.salto.aId + ')';
    },
    editar_salto(m, o, refs) {
      const s = saltoDe(m, o.salto, refs), hecho = [];
      if (o.forma !== undefined) { ok(m.convertirSalto(s.id, formaDe(o.forma))); hecho.push(FORMA_TEXTO[s.tipo]); }
      if (o.invertir) { ok(m.invertirSalto(s.id)); hecho.push('invertido: ahora sale de ' + s.deId); }
      if (o.columna !== undefined) { const c = columna(o.columna); m.asegurarCeldas(c); ok(m.moverSalto(s.id, c)); hecho.push('columna ' + col1(c)); }
      if (o.titulo !== undefined) { const t = texto(o.titulo).trim(); m.punto(s.deId).titulo = t; m.punto(s.aId).titulo = t; hecho.push('título'); }
      return 'salto ' + s.id + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    borrar_salto(m, o, refs) { const s = saltoDe(m, o.salto, refs); ok(m.borrarSalto(s.id)); return 'salto ' + s.id + ' eliminado con sus dos extremos'; },
    crear_nota(m, o, refs) {
      const t = texto(o.texto).trim(); if (!t) falla('Una nota necesita texto (en la app, una nota vacía no se guarda)');
      const sitio = ponerNota(m, o, refs, null);
      const n = ok(sitio.lineaId ? m.crearNotaAbierta(sitio.lineaId, sitio.cg, t) : m.crearNota(sitio.deId, sitio.aId, t)).nota;
      if (o.color !== undefined) ok(m.colorearNota(n.id, tono(o.color)));
      if (o.nivel !== undefined) ok(m.fijarNivelNota(n.id, entero(o.nivel, 'nivel')));
      guardarRef(refs, o.ref, 'nota', n.id);
      return 'nota ' + n.id + ' ' + sitioNota(m, n).texto;
    },
    editar_nota(m, o, refs) {
      const n = notaEsqDe(m, o.nota, refs), hecho = [];
      if (o.texto !== undefined) { const t = texto(o.texto).trim(); if (!t) falla('El texto de una nota no puede quedar vacío (para quitarla, borrar_nota)'); ok(m.editarNota(n.id, t)); hecho.push('texto'); }
      if (o.color !== undefined) { ok(m.colorearNota(n.id, tono(o.color))); hecho.push('color ' + (n.color || 'papel')); }
      if (o.nivel !== undefined) { ok(m.fijarNivelNota(n.id, entero(o.nivel || 0, 'nivel'))); hecho.push('nivel ' + (n.nivel || 'normal')); }
      return 'nota ' + n.id + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    mover_nota(m, o, refs) {
      const n = notaEsqDe(m, o.nota, refs);
      if (o.nodo !== undefined || o.entre !== undefined || o.trama !== undefined) ponerNota(m, o, refs, n.id);
      if (o.antes_de !== undefined) ok(m.colocarNota(n.id, o.antes_de ? notaEsqDe(m, o.antes_de, refs).id : null));
      return 'nota ' + n.id + ' ' + sitioNota(m, n).texto;
    },
    borrar_nota(m, o, refs) { const n = notaEsqDe(m, o.nota, refs); ok(m.borrarNota(n.id)); return 'nota ' + n.id + ' eliminada'; }
  };
  /* Aplica el lote a una copia; si todo va bien, la copia pasa al esquema (con las relaciones reflejadas, si es de personaje). */
  function editarEsquema(ctx, args) {
    const docs = ctx.docs, T = Tr(), r = esquemaDe(docs, args.esquema), eid = r.esquema.id;
    const ops = args.operaciones;
    if (!Array.isArray(ops) || !ops.length) falla('Faltan las operaciones (una lista)');
    const m = modeloDe(docs, { esquema: { id: eid, datos: clonar(r.esquema.datos) } });
    const refs = new Map(), hechos = [];
    ops.forEach((o, i) => {
      const nombre = nombreOperacion('editar_esquema', o);
      const fn = OPS_ESQUEMA[nombre];
      try {
        if (!fn) falla('no conozco la operación ' + comillas(opCruda(o)) + '. Operaciones: ' + Object.keys(OPS_ESQUEMA).join(', '));
        hechos.push((i + 1) + '. ' + fn(m, o, refs));
      } catch (e) {
        if (e instanceof Falla) falla('La operación ' + (i + 1) + ' (' + (opCruda(o) || '?') + ') no se pudo: ' + e.message + '. No se cambió nada del esquema.');
        throw e;
      }
    });
    const per = docs.esEsquemaPersonaje(eid);
    if (per && C.relaciones) { C.relaciones.borrarReflejos(docs, T, m, eid); C.relaciones.renombrarReflejos(docs, T, m, eid); C.relaciones.reflejar(docs, T, m, eid); }
    const g = ok(docs.guardarEsquema(eid, m.toJSON()));
    docs.podarNotasEsquema(eid, m.datos.puntos.map(p => p.id));
    if (g.cambio) ctx.cambio({ esquema: eid });
    const creados = [...refs].map(([k, x]) => '$' + k + ' = ' + x.id);
    return { texto: 'Esquema ' + comillas(r.esquema.nombre) + ': ' + plural(ops.length, 'operación hecha', 'operaciones hechas') + '.\n' + hechos.join('\n')
      + (creados.length ? '\nCreados: ' + creados.join(', ') : '') + (g.cambio ? '' : '\n(nada cambió)'), datos: { refs: Object.fromEntries([...refs].map(([k, x]) => [k, x.id])) } };
  }

  /* ====================================================================
     Documentos: el de un esquema (su guion) o una nota de biblioteca, en texto
     ==================================================================== */
  function crearDocumento(ctx, r) {
    const docs = ctx.docs, eid = r.esquema.id;
    if (docs.esEsquemaPersonaje(eid)) falla('Un esquema de personaje no lleva documento');
    /* como `documentoDe` de app.js: lo que hubiera escrito en los nodos (hasta la 1.0.59) pasa al documento nuevo */
    const partes = [], chars = {};
    if (C.guion) C.guion.estado(docs, eid, new (Tr().Modelo)(r.esquema.datos), false).filas.forEach(f => {
      if (f.html && (f.palabras || /(<img|<table|<hr)/i.test(f.html))) { partes.push(f.html); Object.assign(chars, f.characters); }
    });
    const x = ok(docs.crearDocumentoEsquema(eid, r.esquema.nombre, { html: V().conLineaFinal(partes.join('')), characters: chars }));
    if (partes.length) docs.podarNotasEsquema(eid, []);
    ctx.cambio({ nota: x.nota.id });
    return x.nota;
  }
  function documentoDe(ctx, args, crear) {
    const docs = ctx.docs;
    /* un enlace al guion de un esquema o a una nota, venga en «esquema» o en «nota» (1.1.52) */
    const enl = [args.nota, args.esquema].find(esEnlace);
    if (enl) {
      const x = leerEnlace(enl);
      if (x.tipo === 'nota' && x.esquema) falla('Ese enlace es de una nota del esquema (un papelito del tablero), no de un documento: su texto sale en ver_enlace o leer_esquema');
      if (x.tipo === 'nota') args = Object.assign({}, args, { nota: x.id, esquema: undefined });
      else if (x.esquema || x.tipo === 'esquema') args = Object.assign({}, args, { esquema: x.tipo === 'esquema' ? x.id : x.esquema, nota: undefined });
      else falla('Ese enlace es de ' + deQue(x) + ', no de un documento (' + x.url + ')');
    }
    if (args.esquema !== undefined && args.esquema !== null && args.esquema !== '') {
      const r = esquemaDe(docs, args.esquema);
      let n = docs.documentoEsquema(r.esquema.id);
      if (!n && crear) n = crearDocumento(ctx, r);
      return { nota: n, esquema: r, que: 'documento del esquema ' + comillas(r.esquema.nombre) };
    }
    if (args.nota !== undefined && args.nota !== null && args.nota !== '') {
      const sub = args.biblioteca ? bibliotecaDe(docs, args.biblioteca).sub.id : null;
      const n = notaDe(docs, args.nota, sub);
      const r = docs.sub(n.subId), eid = r && r.sub.guionEid;
      return { nota: n, esquema: eid ? docs.esquema(eid) : null, formula: esFormulaN(docs, n), que: (docs.esPlantilla && docs.esPlantilla(n) ? 'plantilla en ' : esFormulaN(docs, n) ? 'fórmula en ' : 'nota de ') + lugarDeNota(docs, n) };
    }
    falla('Di qué documento: "esquema" (su guion) o "nota" (de una biblioteca)');
  }
  const comoDe = (v, x, html) => (v === 'guion' || v === 'prosa' ? v : x.esquema || V().esGuion(html) ? 'guion' : 'prosa');
  function versionDe(n, v) {
    const vs = n.versiones || [];
    const x = vs.find(y => y.id === String(v)) || vs.filter(y => plano(y.nombre) === plano(v))[0];
    if (!x) falla('Ese documento no tiene la versión ' + comillas(v) + '. Versiones: ' + (vs.map(y => comillas(y.nombre)).join(', ') || 'ninguna'));
    return x;
  }
  function leerDocumento(ctx, args) {
    const docs = ctx.docs, x = documentoDe(ctx, args, false);
    if (!x.nota) return { texto: 'El esquema ' + comillas(x.esquema.esquema.nombre) + ' aún no tiene documento. escribir_documento { esquema } lo crea.' };
    const n = x.nota, v = args.version !== undefined && args.version !== null && args.version !== '' ? versionDe(n, args.version) : null;
    const html = v ? v.html : n.html, bs = V().bloques(html), como = comoDe(args.como, x, html);
    const pers = Object.values((v ? v.characters : n.characters) || {}).map(p => p.name);
    const L = [comillas(n.titulo) + ' · ' + x.que + ' · nota ' + n.id + (v ? ' · VERSIÓN ' + comillas(v.nombre) + ' (' + fecha(v.guardada) + ')' : ''),
      miles(V().palabras(html)) + ' palabras · ' + plural(bs.length, 'bloque', 'bloques') + ' · leído como ' + como + ' · modificado ' + fecha(n.modificado)];
    if ((n.versiones || []).length && !v) L.push('Versiones: ' + n.versiones.map(y => comillas(y.nombre) + ' (' + fecha(y.guardada) + ')').join(', '));
    if (pers.length) L.push('Personajes: ' + pers.join(', '));
    if (n.fragmento) L.push('Es un' + fragmentoTexto(docs, n).replace(/^ · FRAGMENTO/, ' fragmento'));   // 1.1.57
    /* la memoria de estilo (1.1.60): si hay, se avisa (el asistente de la app ya la lleva en su prompt) */
    if (!x.formula && !ctx.memoriaEnPrompt && Me()) { const m = estiloDe(ctx), nn = Me().activas(m.proyecto).length + Me().activas(m.general).length; if (nn) L.push('Memoria de estilo: ' + plural(nn, 'regla', 'reglas') + ' de cómo quiere Leo que suene (ver_proyecto las da): respétalas si escribes aquí.'); }
    L.push('');
    const op = { modo: como, numerar: !!args.numerar, desde: args.desde, hasta: args.hasta };
    if (x.formula && !v && args.formato !== 'bloques' && args.formato !== 'html') {   // una fórmula es solo texto (1.1.60)
      L.splice(L.length - 1, 0, 'Es una FÓRMULA: solo texto (sin formato); {{instruccion}} marca dónde va lo que Leo escribe en «Qué escribir».');
      L.push((op.numerar || op.desde || op.hasta ? bs.map((b, i) => ({ k: i + 1, t: V().textoPlano(b.html) })).filter(y => y.k >= (+op.desde || 1) && y.k <= (+op.hasta || bs.length)).map(y => (op.numerar ? '[' + y.k + '] ' : '') + y.t).join('\n')
        : textoFormula(docs, n)) || '(vacía)');
    }
    else if (args.formato === 'bloques') L.push(JSON.stringify(V().aJson(html, op), null, 1));
    else if (args.formato === 'html') L.push(op.desde || op.hasta ? bs.slice(Math.max(0, (+op.desde || 1) - 1), +op.hasta || bs.length).map(b => b.html).join('\n') : html);
    else L.push(V().aTexto(html, op) || '(vacío)');
    return { texto: L.join('\n') };
  }
  /* Antes de reemplazar lo que Claude cambia se guarda como versión («Antes de Claude»), una por sesión de trabajo: si la última
     ya es de quien escribe y de hace menos de 20 minutos, no se repite (así queda lo de antes de empezar, no cada paso). Vale para el
     guion de un esquema y para una nota de biblioteca, y **dice quién fue** (1.1.60, Leo: «lo que reemplaza la IA… que se pusiera
     como nueva versión»): «Antes de Claude» (también Claude Code y Cowork) o «Antes de DeepSeek» (el asistente de la app; su origen
     es «DeepSeek · deepseek-v4-flash»). Se recupera en «Versiones» del editor y de la ventana de la nota. */
  const MINUTOS_VERSION = 20;
  function quienEscribe(origen) {
    const o = String(origen || '').trim();
    if (!o || /claude|cowork/i.test(o)) return 'Claude';
    if (/deepseek/i.test(o)) return 'DeepSeek';
    return o.replace(/\s*\(.*\)$/, '').split(' · ')[0].trim() || 'la IA';
  }
  function versionPrevia(ctx, n) {
    const docs = ctx.docs, vs = n.versiones || [], ultima = vs[vs.length - 1], t = ahoraDe(ctx);
    if (!n.html || !V().palabras(n.html)) return null;
    if (ultima && ultima.html === n.html) return null;
    const prefijo = 'Antes de ' + quienEscribe(ctx.origen) + ' · ';
    if (ultima && ultima.nombre.startsWith(prefijo) && t - ultima.guardada < MINUTOS_VERSION * 60e3) return null;
    const r = docs.guardarVersion(n.id, prefijo + fecha(t));
    return r.ok ? r.version.nombre : null;
  }
  /* Limpia HTML que llega de fuera: solo etiquetas y atributos del editor, sin scripts ni manejadores. */
  const PERMITIDAS = new Set(['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'code', 'pre', 'sup', 'sub', 'a', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
  const ATRIBUTOS = new Set(['class', 'style', 'href', 'src', 'alt', 'data-ch', 'data-izq', 'data-portada', 'contenteditable', 'colspan', 'rowspan', 'start', 'data-rc', 'data-tipo', 'data-titulo', 'data-color', 'width', 'data-original', 'data-anotaciones', 'data-recorte']);   // y los de los recuadros (prompt y avisos) y las imágenes editadas
  function limpiarHtml(html) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escA = s => esc(s).replace(/"/g, '&quot;');
    const out = n => {
      if (n.t === 'tx') return esc(n.v);
      const dentro = n.hijos.map(out).join('');
      if (!PERMITIDAS.has(n.tag)) return ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'].includes(n.tag) ? '' : dentro;
      /* sin direcciones que ejecutan; la imagen original de una editada (data-original), solo una imagen incrustada; el src de
         una imagen, tampoco un data: que no sea una imagen */
      const at = Object.entries(n.at).filter(([k, v]) => ATRIBUTOS.has(k) && !((k === 'href' || k === 'src') && /^\s*(javascript|vbscript):/i.test(v))
        && !(k === 'data-original' && !/^data:image\//i.test(String(v).trim())) && !(k === 'src' && /^\s*data:/i.test(v) && !/^\s*data:image\//i.test(v))
        && !/expression\(|url\(\s*['"]?\s*javascript:/i.test(v));
      const a = at.map(([k, v]) => ' ' + k + '="' + escA(v) + '"').join('');
      return ['br', 'hr', 'img'].includes(n.tag) ? '<' + n.tag + a + '>' : '<' + n.tag + a + '>' + dentro + '</' + n.tag + '>';
    };
    return V().parsear(html).hijos.map(out).join('');
  }
  function escribirDocumento(ctx, args) {
    const docs = ctx.docs, x = documentoDe(ctx, args, true), n = x.nota;
    if (args.contenido === undefined || args.contenido === null) falla('Falta el contenido');
    const originales = V().bloques(n.html), como = comoDe(args.como, x, n.html);
    const op = { modo: como, originales, elenco: docs.elenco().map(p => ({ nombre: p.nombre, color: p.color })), characters: n.characters };
    const formato = args.formato || 'texto';
    let nuevos;
    if (x.formula) {                                            // una fórmula es solo texto: lo que venga (Markdown, HTML, bloques) se aplana (1.1.60)
      let t = args.contenido;
      if (formato === 'bloques') { if (typeof t === 'string') { try { t = JSON.parse(t); } catch (_) { falla('Con formato "bloques", el contenido es una lista JSON de { tipo, texto }'); } } t = lista(t).map(b => (b && typeof b === 'object' ? texto(b.texto) : texto(b))).join('\n'); }
      else if (formato === 'html') t = V().bloques(limpiarHtml(texto(t))).map(b => V().textoPlano(b.html)).join('\n');
      nuevos = { bloques: V().bloques(htmlFormula(t)).map(b => b.html), personajes: null };
    } else if (formato === 'bloques') {
      let l = args.contenido;
      if (typeof l === 'string') { try { l = JSON.parse(l); } catch (_) { falla('Con formato "bloques", el contenido es una lista JSON de { tipo, texto }'); } }
      nuevos = V().deJson(l, op);
    } else if (formato === 'html') nuevos = { bloques: V().bloques(limpiarHtml(texto(args.contenido))).map(b => b.html), personajes: V().Personajes(op) };
    else nuevos = V().deTexto(texto(args.contenido), op);
    /* la línea vacía que el conversor deja detrás de un recuadro final solo vale al final del documento (se repone abajo) */
    if (nuevos.lineaFinal) nuevos.bloques = nuevos.bloques.slice(0, -1);
    const modo = plano(args.modo || 'reemplazar').replace('ñ', 'n');
    let partes = originales.map(b => b.html), que;
    const pos = (v, que2, max) => { const k = entero(v, que2); if (k < 1 || k > max) falla(que2 + ' va de 1 a ' + max + ' (el documento tiene ' + plural(originales.length, 'bloque', 'bloques') + ')'); return k; };
    if (modo === 'reemplazar') { partes = nuevos.bloques; que = 'reemplazado'; }
    else if (modo === 'anadir' || modo === 'agregar' || modo === 'al final') { partes = partes.concat(nuevos.bloques); que = 'añadido al final'; }
    else if (modo === 'insertar') {
      const k = args.antes_de === undefined ? originales.length + 1 : pos(args.antes_de, 'antes_de', originales.length + 1);
      partes.splice(k - 1, 0, ...nuevos.bloques); que = 'insertado antes del bloque ' + k;
    } else if (modo === 'sustituir') {
      if (args.desde === undefined) falla('Para sustituir hacen falta "desde" y "hasta" (los números de bloque de leer_documento con numerar)');
      const a = pos(args.desde, 'desde', originales.length), b = args.hasta === undefined ? a : pos(args.hasta, 'hasta', originales.length);
      if (b < a) falla('"hasta" no puede ir antes que "desde"');
      partes.splice(a - 1, b - a + 1, ...nuevos.bloques); que = 'bloques ' + a + '–' + b + ' sustituidos';
    } else falla('Modo desconocido ' + comillas(args.modo) + ': reemplazar, anadir, insertar o sustituir');
    const html = V().conLineaFinal(partes.join('')) || '<p><br></p>';   // detrás de un recuadro final, dónde escribir (js/recuadros.js)
    const characters = x.formula ? {} : V().registroDe(html, nuevos.personajes, n.characters);
    const titulo = args.titulo !== undefined && texto(args.titulo).trim() ? texto(args.titulo).trim() : n.titulo;
    if (html === n.html && titulo === n.titulo) return { texto: comillas(n.titulo) + ': sin cambios (el contenido ya era ese)' };
    const version = modo === 'reemplazar' || modo === 'sustituir' ? versionPrevia(ctx, n) : null;
    const elencoAntes = new Set(docs.elenco().map(p => p.id));
    ok(docs.guardarNota(n.id, { title: titulo, html, characters }));
    ctx.cambio({ nota: n.id });
    const nuevosPj = docs.elenco().filter(p => !elencoAntes.has(p.id)).map(p => p.nombre);
    return { texto: comillas(n.titulo) + ' (' + x.que + '): ' + que + ' · ' + plural(V().bloques(nuevos.bloques.join('')).length, 'bloque nuevo', 'bloques nuevos') + ' · ' + miles(V().palabras(html)) + ' palabras en total'
      + (version ? '\nLo de antes quedó guardado como versión ' + comillas(version) + ' (se recupera en «Versiones» del editor' + (x.esquema ? '' : ' o de la ventana de la nota') + ').' : '')
      + (nuevosPj.length ? '\nPersonajes nuevos en el elenco: ' + nuevosPj.join(', ') : '') };
  }

  /* ====================================================================
     Bibliotecas
     ==================================================================== */
  function segmentosEnOrden(docs, sub, seccionId) {
    const etqs = docs.etiquetasDe(sub.id, seccionId === undefined ? null : seccionId);
    if (seccionId) return etqs;
    const orden = docs.ordenSegmentos(sub.id, ['bandeja', ...etqs.map(e => 'etq:' + e.id)]);
    return orden.map(k => (k === 'bandeja' ? null : etqs.find(e => 'etq:' + e.id === k))).filter(x => x !== undefined);
  }
  /* un documento vacío de verdad: sin bloques, o solo párrafos en blanco (`<p><br></p>`) */
  const htmlVacio = h => !String(h || '').replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '').trim();
  /* « · FRAGMENTO nº 3 de «Piloto» (d1) · 12,5 s · nodos p1 «Llega», p2 · bloques 4–9» de una nota que es fragmento (1.1.57) */
  function fragmentoTexto(docs, n) {
    const x = docs.estadoFragmento && docs.estadoFragmento(n); if (!x) return '';
    const nodos = x.nodos.map(p => p.id + (p.titulo ? ' ' + comillas(p.titulo) : ''));
    return ' · FRAGMENTO' + (x.orden ? ' nº ' + x.orden : '') + ' de ' + (x.nombre ? comillas(x.nombre) + ' (' + x.eid + ')' : 'un esquema que ya no existe (' + x.eid + ')') + (x.enPapelera ? ' [en la papelera]' : '')
      + (x.segundos ? ' · ' + seg(x.segundos) : '') + (nodos.length ? ' · nodos ' + nodos.join(', ') : '') + (x.perdidos.length ? ' · ya no están: ' + x.perdidos.join(', ') : '')
      + (x.bloques ? ' · bloques ' + (x.bloques[0] === x.bloques[1] ? x.bloques[0] : x.bloques[0] + '–' + x.bloques[1]) : '') + (x.huerfano ? ' · HUÉRFANO' : '');
  }
  function lineaNota(docs, n, contenido) {
    const fo = esFormulaN(docs, n), t = fo ? textoFormula(docs, n) : V().textoPlano(n.html), L = ['  - nota ' + n.id + ' ' + comillas(n.titulo) + ' · ' + miles(V().palabras(n.html)) + ' palabras · ' + fecha(n.modificado)
      + (n.color ? ' · [' + n.color + ']' : '') + ((n.versiones || []).length ? ' · ' + plural(n.versiones.length, 'versión', 'versiones') : '')
      + fragmentoTexto(docs, n) + (!contenido && t ? ' — ' + corto(t, 160) : '')];
    if (contenido) { const cuerpo = (fo ? t : V().aTexto(n.html)) || '(vacía)'; L.push(cuerpo.split('\n').map(l => '      ' + l).join('\n')); }
    return L.join('\n');
  }
  function leerBiblioteca(ctx, args) {
    const docs = ctx.docs, r = bibliotecaDe(docs, args.biblioteca), s = r.sub;
    const per = s.lineaId && docs.personaje(s.lineaId), pl = esBibPlantillas(s), fo = esBibFormulas(s);
    const L = [pl ? 'PLANTILLAS · id ' + s.id + ' · ' + plural(docs.notasDe(s.id).length, 'plantilla', 'plantillas') + ' (cada nota es una plantilla: con editar_biblioteca › crear_nota { plantilla } sale una nota nueva de ella en otra biblioteca)'
      : fo ? 'FÓRMULAS · id ' + s.id + ' · ' + plural(docs.notasDe(s.id).length, 'fórmula', 'fórmulas') + ' (cada nota es una fórmula: un prompt reutilizable, solo texto, para las operaciones de IA de los lienzos)'
      : 'BIBLIOTECA ' + comillas(s.nombre) + ' · id ' + s.id + (per ? ' · biblioteca del personaje ' + comillas(per.nombre) : ' · contenedor ' + comillas(r.contenedor.nombre))
      + ' · ' + plural(docs.notasDe(s.id).length, 'nota', 'notas')];
    if (pl) L.push(VARIABLES_TEXTO);
    if (fo) L.push(FORMULAS_TEXTO);
    const g = docs.grupoDe(s.id); if (g) L.push('Grupo ' + comillas(g.grupo.nombre));
    if (!pl && !fo) {
      const es = docs.esquemasConectados(s.id);
      L.push('Esquemas conectados: ' + (es.length ? es.map(x => comillas(x.esquema.nombre) + ' (' + x.esquema.id + ')').join(', ') : 'ninguno') + ' (se conectan con editar_proyecto › conectar)');
    }
    const seccion = (nombre, id, seccionId) => {
      L.push('', 'SECCIÓN ' + comillas(nombre) + (id ? ' · id ' + id : ' (la de partida)'));
      const segs = segmentosEnOrden(docs, s, seccionId);
      if (!segs.length) L.push('  (sin segmentos)');
      segs.forEach(e => {
        const ns = docs.notasDe(s.id, e ? e.id : null);
        L.push(e ? 'SEGMENTO ' + e.id + ' ' + comillas(e.nombre) + ' · color ' + nombreColorEtiqueta(e.color) + ' · ' + plural(ns.length, 'nota', 'notas') : 'SIN SEGMENTO (bandeja) · ' + plural(ns.length, 'nota', 'notas'));
        ns.forEach(n => L.push(lineaNota(docs, n, !!args.contenido)));
      });
    };
    seccion('Segmentos', null, null);
    docs.seccionesDe(s.id).forEach(k => seccion(k.nombre, k.id, k.id));
    if (per) {
      const ap = docs.menciones(per.id);
      L.push('', 'APARICIONES de ' + per.nombre + ' (donde se le nombra con «/»): ' + (ap.length ? ap.map(a => comillas(a.titulo) + ' (' + a.ruta + ')').join('; ') : 'ninguna'));
      const eq = docs.esquemasDePersonaje(per.id);
      if (eq.length) L.push('ESQUEMAS con carril suyo: ' + eq.map(e => comillas(e.nombre) + ' (' + e.eid + ')').join(', '));
    }
    return { texto: L.join('\n') };
  }
  const OPS_BIBLIOTECA = {
    crear_seccion(docs, s, o, refs) { const k = ok(docs.crearSeccion(s.id, texto(o.nombre).trim() || 'Sección')).seccion; guardarRef(refs, o.ref, 'seccion', k.id); return 'sección ' + k.id + ' ' + comillas(k.nombre); },
    renombrar_seccion(docs, s, o, refs) { const k = seccionDe(docs, s, o.seccion, refs); ok(docs.renombrarSeccion(k.id, texto(o.nombre))); return 'sección ' + k.id + ' → ' + comillas(k.nombre); },
    borrar_seccion(docs, s, o, refs) { const k = seccionDe(docs, s, o.seccion, refs); return ok(docs.eliminarSeccion(k.id)).aviso; },
    crear_segmento(docs, s, o, refs) {
      const seccionId = o.seccion !== undefined && o.seccion !== null ? seccionDe(docs, s, o.seccion, refs).id : null;
      const e = ok(docs.crearEtiqueta(s.id, texto(o.nombre).trim() || 'Segmento', o.color !== undefined ? colorEtiqueta(o.color) : null, { seccionId })).etiqueta;
      guardarRef(refs, o.ref, 'segmento', e.id);
      return 'segmento ' + e.id + ' ' + comillas(e.nombre) + ' (' + nombreColorEtiqueta(e.color) + ')';
    },
    editar_segmento(docs, s, o, refs) {
      const e = segmentoDe(docs, s, o.segmento, refs), hecho = [];
      if (o.nombre !== undefined) { ok(docs.renombrarEtiqueta(e.id, texto(o.nombre))); hecho.push('nombre'); }
      if (o.color !== undefined) { ok(docs.colorearEtiqueta(e.id, colorEtiqueta(o.color))); hecho.push('color ' + nombreColorEtiqueta(e.color)); }
      if (o.seccion !== undefined) { ok(docs.cambiarSeccion(e.id, o.seccion ? seccionDe(docs, s, o.seccion, refs).id : null)); hecho.push('sección'); }
      return 'segmento ' + e.id + ' ' + comillas(e.nombre) + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    borrar_segmento(docs, s, o, refs) { const e = segmentoDe(docs, s, o.segmento, refs); return ok(docs.eliminarEtiqueta(e.id)).aviso; },
    crear_nota(docs, s, o, refs, ctx) {
      const etq = o.segmento !== undefined && o.segmento !== null ? segmentoDe(docs, s, o.segmento, refs).id : null;
      const tit = texto(o.titulo).trim(), hayContenido = o.contenido !== undefined && texto(o.contenido).trim();
      const leer = () => V().deTexto(texto(o.contenido), { modo: o.como === 'guion' ? 'guion' : 'prosa', elenco: docs.elenco().map(p => ({ nombre: p.nombre, color: p.color })) });
      let n, de = null;
      /* **desde una plantilla** (1.1.56): su texto con las variables rellenas, sus personajes y su color; lo de «contenido», detrás */
      if (esBibFormulas(s)) {                                   // una fórmula es solo texto: el Markdown se aplana (1.1.60)
        if (o.plantilla !== undefined && o.plantilla !== null && o.plantilla !== '') falla('Una fórmula no sale de una plantilla: es solo texto (escríbelo en "contenido")');
        if (o.fragmento !== undefined && o.fragmento !== null) falla('Una fórmula no es un fragmento');
        n = ok(docs.crearNota(s.id, etq, tit || 'Sin título', { arriba: !!o.arriba })).nota;
        if (hayContenido) ok(docs.guardarNota(n.id, { title: n.titulo, html: htmlFormula(o.contenido), characters: {} }));
      } else if (o.plantilla !== undefined && o.plantilla !== null && o.plantilla !== '') {
        if (esBibPlantillas(s)) falla('En las plantillas no se crea una nota desde otra plantilla: crea la nota en una biblioteca normal (una plantilla nueva es crear_nota sin "plantilla")');
        de = plantillaDe(docs, o.plantilla);
        /* el título que se pide manda (y es el que rellena {{titulo}}); sin él, el de la plantilla */
        n = ok(docs.crearDesdePlantilla(de.id, s.id, etq, { titulo: tit || undefined, proyecto: (ctx && ctx.proyecto && ctx.proyecto.nombre) || '', arriba: !!o.arriba })).nota;
        if (hayContenido) {
          /* lo de la plantilla se queda aunque no lleve palabras (una tabla por llenar, una imagen); solo se descarta si está vacía */
          const r = leer(), html = V().conLineaFinal((htmlVacio(n.html) ? '' : n.html) + r.bloques.join(''));
          ok(docs.guardarNota(n.id, { title: n.titulo, html: html || '<p><br></p>', characters: V().registroDe(html, r.personajes, n.characters || {}) }));
        }
      } else {
        n = ok(docs.crearNota(s.id, etq, tit || 'Sin título', { arriba: !!o.arriba })).nota;
        if (hayContenido) {
          const r = leer(), html = r.bloques.join('') || '<p><br></p>';
          ok(docs.guardarNota(n.id, { title: n.titulo, html, characters: V().registroDe(html, r.personajes, {}) }));
        }
      }
      if (o.color !== undefined) ok(docs.colorearNota(n.id, tono(o.color)));
      const fr = o.fragmento !== undefined && o.fragmento !== null ? ponerFragmento(docs, n, o.fragmento) : '';
      guardarRef(refs, o.ref, 'nota', n.id);
      return (fr ? 'fragmento ' : esBibPlantillas(s) ? 'plantilla ' : esBibFormulas(s) ? 'fórmula ' : 'nota ') + n.id + ' ' + comillas(n.titulo) + ' en ' + lugarDeNota(docs, n) + (de ? ' (desde la plantilla ' + comillas(de.titulo) + ')' : '');
    },
    editar_nota(docs, s, o, refs) {
      const n = notaBibDe(docs, s, o.nota, refs), hecho = [];
      if (o.titulo !== undefined) { ok(docs.renombrarNota(n.id, texto(o.titulo))); hecho.push('título'); }
      if (o.color !== undefined) { ok(docs.colorearNota(n.id, tono(o.color))); hecho.push('color'); }
      if (o.segmento !== undefined) { ok(docs.moverNota(n.id, o.segmento ? segmentoDe(docs, s, o.segmento, refs).id : null)); hecho.push('segmento'); }
      if (o.fragmento !== undefined) hecho.push(o.fragmento === null || o.fragmento === false ? (ok(docs.fijarFragmento(n.id, null)), 'ya no es fragmento') : 'fragmento (' + ponerFragmento(docs, n, o.fragmento) + ')');
      return 'nota ' + n.id + ' ' + comillas(n.titulo) + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    mover_nota(docs, s, o, refs) {
      const n = notaBibDe(docs, s, o.nota, refs);
      const destino = o.biblioteca !== undefined ? bibliotecaDe(docs, o.biblioteca).sub : docs.sub(n.subId).sub;
      const etq = o.segmento ? segmentoDe(docs, destino, o.segmento, refs).id : null;
      const antes = o.antes_de ? notaBibDe(docs, destino, o.antes_de, refs).id : null;
      ok(docs.moverNota(n.id, etq, destino.id, antes));
      return 'nota ' + n.id + ' ' + comillas(n.titulo) + ' → ' + lugarDeNota(docs, n);
    },
    tirar_nota(docs, s, o, refs) { const n = notaBibDe(docs, s, o.nota, refs); return ok(docs.tirarNota(n.id)).aviso + ' (se restaura con editar_proyecto › restaurar)'; }
  };
  /* **Fragmento** (1.1.57): { esquema, nodos (ids, títulos o enlaces de ese esquema), segundos, orden, bloques: [desde, hasta] }.
     Los nodos tienen que estar en el esquema; lo que no se da y ya tenía, se conserva (así se cambia solo la duración). */
  function ponerFragmento(docs, n, f) {
    if (typeof f !== 'object') falla('"fragmento" es { esquema, nodos, segundos, orden, bloques }');
    if (esBibPlantillas(docs.sub(n.subId) && docs.sub(n.subId).sub)) falla('Una plantilla no es un fragmento');
    if (esBibFormulas(docs.sub(n.subId) && docs.sub(n.subId).sub)) falla('Una fórmula no es un fragmento');
    const antes = n.fragmento || {};
    const v = f.esquema !== undefined && f.esquema !== null && f.esquema !== '' ? f.esquema : antes.eid;
    if (!v) falla('El fragmento necesita su "esquema"');
    const r = esquemaDe(docs, v), m = modeloDe(docs, r), mismo = r.esquema.id === antes.eid;
    const nodos = f.nodos !== undefined ? lista(f.nodos).map(x => nodoDe(m, x, new Map()).id) : mismo ? antes.nodos || [] : [];
    const num = (x, que) => { if (x === undefined || x === null || x === '') return undefined; const k = +x; if (!Number.isFinite(k) || k < 0) falla(que + ' no es un número válido: ' + JSON.stringify(x)); return k; };
    const segundos = num(f.segundos, 'segundos'), orden = num(f.orden, 'orden');
    const bloques = f.bloques !== undefined ? lista(f.bloques).map(x => entero(x, 'Un bloque')) : mismo ? antes.bloques : undefined;
    ok(docs.fijarFragmento(n.id, { eid: r.esquema.id, nodos, segundos: segundos !== undefined ? segundos : mismo ? antes.segundos : 0,
      orden: orden !== undefined ? orden : mismo ? antes.orden : 0, bloques }));
    const x = n.fragmento;
    return 'de ' + comillas(r.esquema.nombre) + (x.orden ? ', nº ' + x.orden : '') + (x.segundos ? ', ' + seg(x.segundos) : '') + (x.nodos.length ? ', nodos ' + x.nodos.join(', ') : ', sin nodos');
  }
  function seccionDe(docs, s, v, refs) { const id = deRef(refs, v, 'seccion'); if (id) return docs.seccion(id).seccion; return encontrar(docs.seccionesDe(s.id).map(k => ({ id: k.id, nombre: k.nombre, obj: k })), v, 'la sección'); }
  function segmentoDe(docs, s, v, refs) { const id = deRef(refs, v, 'segmento'); if (id) return docs.etiqueta(id); return encontrar(docs.etiquetasDe(s.id).map(e => ({ id: e.id, nombre: e.nombre, obj: e })), v, 'el segmento'); }
  function notaBibDe(docs, s, v, refs) { const id = deRef(refs, v, 'nota'); if (id) return docs.nota(id); return notaDe(docs, v, s ? s.id : null); }
  /* un lote sobre los documentos del proyecto: si una falla, lo hecho se deshace (en su mismo objeto) */
  function lote(ctx, ops, fn) {
    if (!Array.isArray(ops) || !ops.length) falla('Faltan las operaciones (una lista)');
    const docs = ctx.docs, antes = JSON.stringify(docs.datos), refs = new Map(), hechos = [];
    try {
      ops.forEach((o, i) => {
        try { hechos.push((i + 1) + '. ' + fn(o, refs)); }
        catch (e) { if (e instanceof Falla) falla('La operación ' + (i + 1) + ' (' + (opCruda(o) || '?') + ') no se pudo: ' + e.message + '. No se cambió nada.'); throw e; }
      });
    } catch (e) { reponerEnSitio(docs.datos, antes); throw e; }
    const cambio = JSON.stringify(docs.datos) !== antes;
    if (cambio) ctx.cambio({});
    const creados = [...refs].map(([k, x]) => '$' + k + ' = ' + x.id);
    return { hechos, cambio, refs, creados };
  }
  function editarBiblioteca(ctx, args) {
    const docs = ctx.docs;
    /* las especiales (plantillas, fórmulas) aún sin crear: nacen dentro del lote (si falla, se deshace con él) */
    const E = pideEspecial(args.biblioteca, docs), nace = E && docs[E.asegurar] && !bibEspecial(docs, E);
    let s = nace ? null : bibliotecaDe(docs, args.biblioteca).sub;
    const r = lote(ctx, args.operaciones, (o, refs) => {
      if (!s) s = docs[E.asegurar]().sub;
      const nombre = nombreOperacion('editar_biblioteca', o), fn = OPS_BIBLIOTECA[nombre];
      if (!fn) falla('no conozco la operación ' + comillas(opCruda(o)) + '. Operaciones: ' + Object.keys(OPS_BIBLIOTECA).join(', '));
      return fn(docs, s, o, refs, ctx);
    });
    return { texto: (especialDe(s) ? especialDe(s).nombre : 'Biblioteca ' + comillas(s.nombre)) + ':\n' + r.hechos.join('\n') + (r.creados.length ? '\nCreados: ' + r.creados.join(', ') : '') + (r.cambio ? '' : '\n(nada cambió)'),
             datos: { refs: Object.fromEntries([...r.refs].map(([k, x]) => [k, x.id])) } };
  }

  /* **usar_formula** (1.1.60): el texto de una fórmula, para seguirla en lo que Leo pide (como una skill: el asistente y Claude
     ven la lista de títulos y cargan la que venga a cuento). Solo lectura. */
  /* **Los mods del teatro de duendes** (1.1.63, js/claquedraw/teatro-mods.js): escenarios, vestuarios, objetos de utilería, máscaras
     y músicas que el teatro no trae, para que la obra se parezca al guion. **Solo Claude** (Cowork o Claude Code): el asistente de la
     app no las tiene (`soloClaude`) y, si le llegara, se niega. Son datos que el teatro valida y dibuja; nunca código. */
  const Tm = () => C.teatroMods || (typeof require === 'function' ? (() => { try { return require('./teatro-mods.js').teatroMods; } catch (_) { return null; } })() : null);
  /* el asistente de la app (una IA por API) marca `ctx.ia`: su `origen` es el nombre del modelo, que puede decir «claude» (un modelo
     de Anthropic en OpenRouter) sin ser Claude con el guion leído */
  const esClaude = ctx => !ctx.ia && (!ctx.origen || /claude|cowork/i.test(String(ctx.origen)));
  /* **Los mods son de todos los proyectos** (1.1.64): `ctx.teatroGlobal` ({ leer, escribir }) los da (la app, su copia; el servidor,
     teatro-mods.json en los datos de la app). Sin él (pruebas, el navegador sin app), en el proyecto como en la 1.1.63. Lo que un
     proyecto de la 1.1.63 guardaba dentro se muda a los de todos (`mudarMods`). */
  const globalDe = ctx => ctx.teatroGlobal || { leer: () => Tm().soloMods(ctx.docs.teatro()), escribir: t => { ctx.docs.fijarTeatro(Object.assign(Tm().soloProyecto(ctx.docs.teatro()), Tm().soloMods(t))); ctx.cambio({ proyecto: true }); } };
  function mudarMods(ctx) {
    if (!ctx.teatroGlobal) return;
    const t = ctx.docs.teatro(); if (!Tm().tieneMods(t)) return;
    ctx.teatroGlobal.escribir(Tm().mezclar(ctx.teatroGlobal.leer(), t));
    if (ctx.docs.fijarTeatro(Tm().soloProyecto(t))) ctx.cambio({ proyecto: true });
  }
  const modsDe = ctx => Tm().mezclar(globalDe(ctx).leer(), ctx.docs.teatro());
  function leerTeatro(ctx) {
    if (!Tm()) falla('Esta versión de ClapCraft no trae los mods del teatro');
    const t = ctx.docs.teatro(), du = t.duendes || {};
    const L = ['TEATRO DE DUENDES (el botón «Teatro» del editor). Los MODS son de todos los proyectos de Leo: reutilízalos.', '', Tm().resumen(modsDe(ctx))];
    const pjs = ctx.docs.elenco().filter(p => du[p.id]);
    L.push('', 'DUENDES DE LOS PERSONAJES de este proyecto: ' + (pjs.length ? pjs.map(p => p.nombre + ' (' + p.id + ')' + ({ humano: ', humano', nino: ', niño' }[du[p.id].cuerpo] || '') + (du[p.id].descripcion ? ': ' + corto(du[p.id].descripcion, 120) : '')).join('; ') : '(ninguno; se hacen con duende_personaje)'));
    if (Tm().resumenRasgos) L.push('', 'RASGOS DEL DUENDE DE UN PERSONAJE (duende_personaje; por defecto un duende, o cuerpo humano/niño):', Tm().resumenRasgos(modsDe(ctx)));
    const conAjustes = Object.entries(t.obras || {}).filter(([, o]) => o && o.ajustes && Object.keys(o.ajustes.escenas || {}).length);
    if (conAjustes.length) L.push('', 'AJUSTES DE LEO (escenarios que eligió a mano en el teatro; mandan sobre la dirección y preparar_obra los detalla): '
      + conAjustes.map(([id, o]) => comillas(o.titulo || (ctx.docs.nota(id) || {}).titulo || id) + ' (' + plural(Object.keys(o.ajustes.escenas).length, 'escena', 'escenas') + ')').join(', '));
    return { texto: L.join('\n'), datos: { mods: modsDe(ctx), duendes: clonar(du) } };
  }
  function editarTeatro(ctx, args) {
    if (!esClaude(ctx)) falla('Los mods del teatro solo los hace Claude (Cowork o Claude Code)');
    if (!Tm()) falla('Esta versión de ClapCraft no trae los mods del teatro');
    mudarMods(ctx);
    const G = globalDe(ctx), r = Tm().editar(G.leer(), args.operaciones);
    if (!r.ok) falla(r.error);
    G.escribir(r.teatro);
    return { texto: r.hechos.join('\n') + '\nSon de todos los proyectos de Leo (no van en el historial de este proyecto: para deshacer, quítalos o cámbialos con editar_teatro). Se verán la próxima vez que se abra el teatro.' };
  }
  /* **El duende de un personaje** (1.1.64): cómo es en el teatro, siempre que sale en una obra. Solo Claude, a partir de su descripción
     (y preguntando lo que falte). **Versión 2** (1.1.67): cuerpo de duende (por defecto), humano o niño, y muchos más rasgos
     (C.teatroMods.RASGOS); `ver` da la hoja, el duende de ahora, los rasgos y las imágenes de su biblioteca (y la de `imagen`) como
     contenido de imagen de MCP, para hacerlo a partir de una foto o un dibujo. Leo también lo hace a mano en el creador de duendes. */
  const META_DUENDE = ['nombre', 'fecha', 'fuente'];
  function verDuende(ctx, p, args) {
    const docs = ctx.docs, du = (ctx.docs.teatro().duendes || {})[p.id], imgs = { lista: [], fuera: 0 }, L = [];
    L.push('EL DUENDE DE ' + comillas(p.nombre) + ' (personaje ' + p.id + ')');
    if (du) {
      const x = Object.fromEntries(Object.entries(du).filter(([k]) => !META_DUENDE.includes(k)));
      L.push('Ahora: ' + JSON.stringify(x) + (du.fecha ? ' · hecho el ' + fecha(du.fecha) : '') + (du.fuente && docs.nota(du.fuente) ? ' · a partir de ' + comillas(docs.nota(du.fuente).titulo) : ''));
    } else L.push('Aún no tiene duende: en las obras sale con el vestuario que elija la dirección.');
    const h = docs.hojaPersonaje(p.id);
    L.push('');
    if (h.notas.length) {
      L.push('HOJA DE PERSONAJE (su biblioteca' + (h.hoja ? ', «' + h.hoja.nombre + '» primero' : '') + '):');
      notasConTope(docs, h.notas, imgs, '  ', { conImagenes: true }).forEach(x => L.push(x));
    } else L.push('Sin hoja de personaje escrita (no inventes cómo es: pregúntaselo a Leo o pídele una imagen).');
    if (args.imagen) {
      const n = notaDe(docs, args.imagen);
      L.push('', 'LA IMAGEN QUE DIO LEO (nota ' + comillas(n.titulo) + ', ' + n.id + '):');
      const im = recogerImagenes(n.html, 'nota ' + comillas(corto(n.titulo, 40)), imgs);
      if (im.length) im.forEach(t => L.push('  ' + t)); else L.push('  (esa nota no tiene ninguna imagen)');
    }
    L.push('', 'RASGOS (duende_personaje { personaje, duende: { … } }; los ids tal cual, colores #rrggbb):', Tm().resumenRasgos(modsDe(ctx)));
    L.push('', 'CÓMO: por defecto es un DUENDE (cuerpo: "duende"). Si Leo da una imagen de una persona o lo pide, cuerpo: "humano" (o "nino") con sus rasgos '
      + 'característicos: peinado y hairCol, vello y beardCol, lentes, complexion, altura, la ropa que suele llevar (prenda y cloth/cloth2, bajo y pants, calzado y shoes), '
      + 'marcas y accesorios. Un animal: animal (su cara) y cola, o el vestuario de ese animal. Lo que no se vea en la imagen ni diga la hoja, pregúntaselo a Leo.');
    if (imgs.lista.length) L.push('', (imgs.lista.length === 1 ? 'Va adjunta 1 imagen' : 'Van adjuntas ' + imgs.lista.length + ' imágenes') + ' (reducidas a 1024 px de lado largo como mucho)'
      + (imgs.fuera ? '; ' + plural(imgs.fuera, 'otra no va', 'otras no van') + ' (tope de ' + MAX_IMAGENES + ')' : '') + '.');
    return { texto: L.join('\n'), imagenes: imgs.lista };
  }
  function duendePersonaje(ctx, args) {
    if (!esClaude(ctx)) falla('Los duendes de los personajes solo los hace Claude (Cowork o Claude Code)');
    if (!Tm()) falla('Esta versión de ClapCraft no trae el teatro');
    const p = personajeDe(ctx.docs, args.personaje);
    const ver = args.ver === true || /^ver$/i.test(String(args.operacion || args.op || '')) || (args.imagen && !args.duende && args.quitar !== true);
    if (ver) return verDuende(ctx, p, args);
    mudarMods(ctx);
    const t = ctx.docs.teatro(), du = Object.assign({}, t.duendes || {});
    if (args.quitar === true) {
      if (!du[p.id]) return { texto: comillas(p.nombre) + ' no tenía duende.' };
      delete du[p.id];
      if (ctx.docs.fijarTeatro(Object.assign({}, t, { duendes: du }))) ctx.cambio({ proyecto: true });
      return { texto: 'Quitado el duende de ' + comillas(p.nombre) + ': en las obras vuelve a elegirse su vestuario.' };
    }
    if (!args.duende || typeof args.duende !== 'object') falla('Falta el duende: { rasgos y piezas } (para mirar su hoja y sus imágenes antes: ver: true)');
    const mods = modsDe(ctx), r = Tm().validarDuende(Object.assign({}, args.cambiar === true && du[p.id] ? du[p.id] : {}, args.duende),
      { mascaras: (mods.mascaras || []).map(m => m.id), vestuarios: (mods.vestuarios || []).map(v => v.id) });
    if (!r.ok) falla(r.error);
    const fuente = args.fuente ? notaDe(ctx.docs, args.fuente).id : args.imagen ? notaDe(ctx.docs, args.imagen).id : (du[p.id] && du[p.id].fuente) || null;
    du[p.id] = Object.assign(r.dato, { nombre: p.nombre, fecha: ahoraDe(ctx) }, fuente ? { fuente } : {});
    if (ctx.docs.fijarTeatro(Object.assign({}, t, { duendes: du }))) ctx.cambio({ proyecto: true });
    const cuerpo = { humano: ' (cuerpo humano)', nino: ' (cuerpo de niño)' }[r.dato.cuerpo] || '';
    return { texto: (args.cambiar ? 'Cambiado' : 'Hecho') + ' el duende de ' + comillas(p.nombre) + cuerpo + '. Leo lo ve en su personaje (Personajes › ' + p.nombre + ', tarjeta «Duende», donde también puede retocarlo en el creador) y sale así en todas las obras.' };
  }
  /* **Las obras del teatro** (1.1.63): Claude lee el guion con preparar_obra y guarda su puesta en escena con dirigir_obra. */
  const Dn = () => C.duendes || (typeof require === 'function' ? (() => { try { return require('./duendes.js').duendes; } catch (_) { return null; } })() : null);
  function obraDe(ctx, args) {
    if (!Dn() || !Tm()) falla('Esta versión de ClapCraft no trae el teatro');
    const x = documentoDe(ctx, args, false);
    if (!x.nota) falla('Ese esquema aún no tiene guion');
    const n = x.nota, d = ctx.docs;
    const elenco = d.elenco().map(p => ({ nombre: p.nombre, color: p.color })).concat(Object.values(n.characters || {}).map(r => ({ nombre: r && r.name, color: r && r.color })));
    const g = Dn().guionDe(n.html, { elenco });
    if (!g.guion) falla(comillas(n.titulo) + ' no es un guion (no tiene escenas ni diálogos): el teatro lo lee tal cual, sin dirección');
    mudarMods(ctx);
    const t = d.teatro(), cat = Dn().catalogoDe(modsDe(ctx));
    const resumen = { personajes: g.hablan.map(q => ({ clave: Dn().claveTeatro(q), nombre: q })), eventos: g.eventos };
    return { n, g, t, cat, resumen };
  }
  /* los ajustes de Leo de una obra, en palabras: «escena 3 «INT. COCINA» → escenario «playa» (Playa al atardecer), de noche» */
  function ajustesTexto(o, g, cat) {
    const es = (o && o.ajustes && o.ajustes.escenas) || {}, L = [];
    for (const [firma, a] of Object.entries(es)) {
      const e = g.eventos.find(x => x.firma === firma), bd = a.bd && cat.escenarios.find(x => x.id === a.bd);
      const que = [a.bd ? 'escenario ' + comillas(a.bd) + (bd && bd.n !== a.bd ? ' (' + bd.n + ')' : bd ? '' : ' (ya no existe)') : '', a.noche === true ? 'de noche' : a.noche === false ? 'de día' : ''].filter(Boolean).join(', ');
      /* `scene||`: lo de antes del primer encabezado (una obra que empieza sin escena) */
      const antesDe = firma === 'scene||';
      L.push('- ' + (e ? 'escena ' + e.i + ' ' + comillas(e.texto) : antesDe ? 'el principio (lo de antes del primer encabezado de escena)' : 'una escena que ya no está en el guion (' + corto(firma.split('|').pop(), 50) + ')') + ' → ' + que);
    }
    return L;
  }
  function prepararObra(ctx, args) {
    if (!esClaude(ctx)) falla('Las obras del teatro solo las dirige Claude (Cowork o Claude Code)');
    const { n, g, t, cat } = obraDe(ctx, args), o = (t.obras || {})[n.id];
    const lista = l => l.map(x => x.id === x.n ? x.id : x.id + ' = ' + x.n).join('; ');
    const L = ['OBRA: ' + comillas(n.titulo) + ' · nota ' + n.id + ' · ' + plural(g.eventos.length, 'evento', 'eventos'),
      o && o.fecha ? 'Ya la dirigiste el ' + fecha(o.fecha) + (o.huella === g.huella ? ' (el guion no ha cambiado).' : ' y el guion CAMBIÓ desde entonces: vuelve a dirigirla.') : 'Aún no está dirigida.',
      '', 'CÓMO DIRIGIR', Dn().REGLAS, '',
      'ESCENARIOS: ' + lista(cat.escenarios), 'VESTUARIOS: ' + lista(cat.vestuarios), 'MÁSCARAS: ' + lista(cat.mascaras),
      'MÚSICAS: ' + lista(cat.musicas), 'OBJETOS (utilería): ' + (cat.objetos.length ? lista(cat.objetos) : '(ninguno; créalos con editar_teatro solo si son clave)'),
      'GESTOS: ' + lista(cat.gestos), '',
      'PERSONAJES QUE HABLAN: ' + (g.hablan.join(', ') || '(ninguno)'),
      'PERSONAJES CON DUENDE PROPIO (sale siempre así: no les elijas vestuario ni máscara; sí gestos, tamaño si hace falta y dónde están): ' + (ctx.docs.elenco().filter(p => (t.duendes || {})[p.id]).map(p => p.nombre).join(', ') || '(ninguno)'),
      'GESTOS CLAVE: si un momento clave necesita una acción que no está en GESTOS (arrancar algo con los dientes, cargar a alguien), créala con editar_teatro { tipo: "gesto" } y úsala.'];
    const aj = ajustesTexto(o, g, cat);
    if (aj.length) L.push('', 'AJUSTES DE LEO — respétalos (los eligió él en el teatro y mandan sobre tu dirección; no los cambies salvo que te lo pida):', ...aj);
    L.push('', 'EVENTOS:');
    for (const e of g.eventos) {
      if (e.tipo === 'escena') L.push(e.i + ' ESCENA: ' + e.texto);
      else if (e.tipo === 'linea') L.push(e.i + ' LÍNEA ' + e.quien + (e.paren ? ' (' + e.paren + ')' : '') + ': ' + e.texto);
      else L.push(e.i + ' ACOTACIÓN: ' + e.texto);
    }
    L.push('', 'Cuando lo tengas: dirigir_obra { nota o esquema (el mismo de aquí), plan: { escenas: [{ i, escenario, noche, musica, presentes, objetos, cartel }], personajes: [{ nombre, vestuario, mascara, tamano, voz }], lineas: [{ i, gesto }], acotaciones: [{ i, quienes, movimiento, gesto, objetos, cartel }] } }.');
    return { texto: L.join('\n') };
  }
  function dirigirObra(ctx, args) {
    if (!esClaude(ctx)) falla('Las obras del teatro solo las dirige Claude (Cowork o Claude Code)');
    const { n, g, t, cat, resumen } = obraDe(ctx, args);
    if (!args.plan || typeof args.plan !== 'object') falla('Falta el plan: { escenas, personajes, lineas, acotaciones }');
    const r = Dn().leerDireccion(args.plan, resumen, cat);
    if (!r.ok) falla(r.error);
    /* lo que no se pudo usar, para que Claude lo corrija (ids que no existen, números de evento que no son de ese tipo) */
    const avisos = [], ids = k => new Set(cat[k].map(x => x.id)), pl = args.plan;
    const mirar = (l, campo, k, que) => (Array.isArray(l) ? l : []).forEach(x => { const v = x && x[campo]; if (v && !ids(k).has(String(v).toLowerCase()) && !cat[k].some(y => y.n === v)) avisos.push(que + ' «' + v + '» no existe (usa uno del catálogo o créalo con editar_teatro)'); });
    mirar(pl.escenas, 'escenario', 'escenarios', 'El escenario'); mirar(pl.escenas, 'musica', 'musicas', 'La música');
    mirar(pl.personajes, 'vestuario', 'vestuarios', 'El vestuario'); mirar(pl.personajes, 'mascara', 'mascaras', 'La máscara');
    const obras = Object.assign({}, t.obras || {});
    const antes = obras[n.id];                                     // los ajustes de Leo (el escenario que eligió a mano) se quedan
    obras[n.id] = Object.assign({ huella: g.huella, fecha: ahoraDe(ctx), titulo: n.titulo, plan: Dn().aFirmas(r.plan, g.eventos) }, antes && antes.ajustes ? { ajustes: clonar(antes.ajustes) } : {});
    if (ctx.docs.fijarTeatro(Object.assign({}, t, { obras }))) ctx.cambio({ proyecto: true });
    const c = r.cuenta;
    return { texto: 'Obra ' + comillas(n.titulo) + ' dirigida: ' + [plural(c.escenas, 'escenario', 'escenarios'), plural(c.vestuarios, 'vestuario', 'vestuarios'),
      plural(c.gestos, 'gesto', 'gestos'), plural(c.extras, 'personaje que no habla', 'personajes que no hablan'), plural(c.carteles, 'cartel', 'carteles')].join(', ') + '.'
      + (avisos.length ? '\nNO SE USÓ: ' + [...new Set(avisos)].slice(0, 12).join('; ') + '.' : '')
      + (antes && antes.ajustes ? '\nLos ajustes de Leo (' + plural(Object.keys(antes.ajustes.escenas || {}).length, 'escena', 'escenas') + ' con el escenario que eligió él) se conservan y mandan sobre esta dirección.' : '')
      + '\nLeo la verá con el botón «Teatro» del editor.' };
  }
  function usarFormula(ctx, args) {
    const docs = ctx.docs, fs = formulasTodas(docs);
    if (!fs.length) falla('Este proyecto aún no tiene fórmulas (viven en la biblioteca «Fórmulas»; se crean con editar_biblioteca { biblioteca: "Fórmulas" } › crear_nota)');
    const n = formulaDe(docs, args.formula), e = n.etiquetaId && docs.etiqueta(n.etiquetaId), t = textoFormula(docs, n);
    const hueco = !!(Fm() && Fm().tieneHueco ? Fm().tieneHueco(t) : /\{\{\s*instrucci[oó]n\s*\}\}/i.test(t));
    return { texto: 'FÓRMULA ' + comillas(n.titulo) + ' · id ' + n.id + (e ? ' · segmento ' + comillas(e.nombre) : '')
      + '\nAplícala a lo que Leo te pide en esta conversación: dice cómo hacerlo (tono, formato, reglas), no encarga nada por sí sola' + (hueco ? '; donde dice {{instruccion}} va lo que pide Leo' : '') + '.\n\n' + (t || '(vacía)') };
  }

  /* ====================================================================
     El proyecto: árbol, estructura y búsqueda
     ==================================================================== */
  function cuentaEsquema(docs, e) {
    const d = e.datos || {}, puntos = d.puntos || [], saltos = d.saltos || [];
    const doc = docs.documentoEsquema(e.id);
    return plural((d.lineas || []).length, 'trama', 'tramas') + ' · ' + plural(puntos.length - saltos.length * 2, 'nodo', 'nodos')
      + (saltos.length ? ' · ' + plural(saltos.length, 'salto', 'saltos') : '') + ' · ' + plural((d.notas || []).length, 'nota', 'notas')
      + (doc ? ' · documento ' + comillas(doc.titulo) + ' (' + miles(V().palabras(doc.html)) + ' palabras)' : '');
  }
  /* las conexiones de un esquema o de una biblioteca (1.1.57), para el árbol: « · ↔ biblioteca «X» (id)» */
  function conexionesTexto(docs, id, tipo) {
    const l = tipo === 'esquema' ? docs.bibliotecasDe(id).map(x => 'biblioteca ' + comillas(x.sub.nombre) + ' (' + x.sub.id + ')')
      : docs.esquemasConectados(id).map(x => 'esquema ' + comillas(x.esquema.nombre) + ' (' + x.esquema.id + ')');
    return l.length ? ' · conectado con ' + l.join(', ') : '';
  }
  /* una pieza del árbol (y lo que lleva dentro, si es una carpeta o un grupo) */
  function piezaTexto(docs, ambito, x, p, L) {
    if (x.tipo === 'carpeta') { L.push(p + 'CARPETA ' + x.id + ' ' + comillas(x.obj.nombre)); arbolTexto(docs, ambito, x.id, p + '  ', L); return; }
    if (x.tipo === 'grupo') { L.push(p + 'GRUPO ' + x.id + ' ' + comillas(x.obj.nombre)); docs.nivelGrupo(x.id).forEach(y => piezaTexto(docs, ambito, y, p + '  ', L)); return; }
    if (x.tipo === 'esquema') { L.push(p + 'ESQUEMA ' + x.id + ' ' + comillas(x.obj.nombre) + ' · ' + cuentaEsquema(docs, x.obj) + conexionesTexto(docs, x.id, 'esquema')); return; }
    if (x.tipo === 'sub') { const n = docs.notasDe(x.id).length, k = docs.etiquetasDe(x.id).length; L.push(p + 'BIBLIOTECA ' + x.id + ' ' + comillas(x.obj.nombre) + ' · ' + plural(k, 'segmento', 'segmentos') + ' · ' + plural(n, 'nota', 'notas') + conexionesTexto(docs, x.id, 'sub')); return; }
    if (x.tipo === 'personaje') L.push(p + 'PERSONAJE ' + x.id + ' ' + comillas(x.obj.nombre));
    if (x.tipo === 'lienzo') L.push(p + 'LIENZO ' + x.id + ' ' + comillas(x.obj.nombre) + ' · ' + cuentaLienzo(x.obj));
  }
  /* un lienzo en el árbol (1.1.58): « · 6 nodos · 2 pendientes» */
  function cuentaLienzo(l) {
    const ns = l.nodos || [], ops = ns.filter(n => OPERACIONES.includes(n.tipo) || (Lz() && Lz().TIPOS[n.tipo] && Lz().TIPOS[n.tipo].familia === 'operacion'));
    const pend = ops.filter(n => n.estado === 'pendiente').length, err = ops.filter(n => n.estado === 'error').length;
    return plural(ns.length, 'nodo', 'nodos') + ' (' + plural(ops.length, 'operación', 'operaciones') + ')' + (pend ? ' · ' + plural(pend, 'pendiente', 'pendientes') + ' (leer_lienzo)' : '') + (err ? ' · ' + plural(err, 'con error', 'con error') : '');
  }
  function arbolTexto(docs, ambito, carpetaId, pre, L) {
    docs.nivelArbol(ambito, carpetaId).forEach(x => piezaTexto(docs, ambito, x, pre, L));
  }
  function verProyecto(ctx) {
    const docs = ctx.docs, P = ctx.proyecto || {}, L = [];
    L.push('PROYECTO ' + comillas(P.nombre || '?') + (P.ruta ? ' · archivo ' + P.ruta : '') + (P.vivo ? ' · abierto en ClapCraft (los cambios se ven al momento)' : P.ruta ? ' · cerrado (se trabaja sobre el archivo)' : ''));
    if (C.enlaces) {
      const ahora = C.enlaces.proyectoDe(ctx.proyecto || {}), viejos = C.enlaces.nombres(docs.datos).filter(x => x !== ahora);
      L.push('Enlaces: ' + enlaceDe(ctx, { tipo: 'proyecto' }) + '/… (esquema/<id>, esquema/<id>/nodo/<id>, biblioteca/<id>, nota/<id>, personaje/<id>, lienzo/<id>/nodo/<id>…; ver_enlace los lee)'
        + (viejos.length ? ' · su archivo se llamó antes ' + viejos.map(v => '«' + v + '»').join(', ') + ': los enlaces con ese nombre también llevan aquí' : ''));
    }
    const visibles = docs.datos.contenedores.filter(c => !c.oculto);
    if (!visibles.length) L.push('(sin contenedores)');
    visibles.forEach(c => { L.push('', 'CONTENEDOR ' + c.id + ' ' + comillas(c.nombre) + (c.fijado ? ' · fijado' : '')); arbolTexto(docs, c.id, null, '  ', L); });
    const elenco = docs.elenco();
    L.push('', 'PERSONAJES (' + elenco.length + ')' + (elenco.length ? ': ' + elenco.map(p => p.nombre + ' [' + p.id + ', ' + nombreColorEtiqueta(p.color) + ']').join(', ') : ''));
    const bp = docs.contenedor(C.ID_PERSONAJES);
    if (bp) bp.subs.filter(s => docs.notasDe(s.id).length).forEach(s => L.push('  BIBLIOTECA ' + s.id + ' de ' + comillas(s.nombre) + ' · ' + plural(docs.notasDe(s.id).length, 'nota', 'notas')));
    const ep = docs.contenedor(C.ID_ESQUEMAS_PERSONAJE);
    if (ep && ep.esquemas.length) { L.push('ESQUEMAS DE PERSONAJE'); ep.esquemas.forEach(e => L.push('  ESQUEMA ' + e.id + ' ' + comillas(e.nombre) + ' · ' + cuentaEsquema(docs, e) + conexionesTexto(docs, e.id, 'esquema'))); }
    /* las plantillas de nota (1.1.56): su biblioteca especial, fuera del árbol */
    const pl = docs.plantillas ? docs.plantillas() : [];
    L.push('', 'PLANTILLAS' + (docs.bibliotecaPlantillas && docs.bibliotecaPlantillas() ? ' (biblioteca ' + C.ID_BIB_PLANTILLAS + ', «Plantillas»; crear_nota { plantilla } hace una nota con una)' : '') + ': '
      + (pl.length ? pl.map(n => comillas(n.titulo) + ' (' + n.id + ')').join(', ') : 'ninguna (se guarda una con editar_proyecto › guardar_como_plantilla)'));
    /* las fórmulas (1.1.60): su biblioteca especial, fuera del árbol */
    const fs = formulasTodas(docs), bf = bibEspecial(docs, ESPECIALES[1]);
    const segDe = n => { const e = n.etiquetaId && docs.etiqueta(n.etiquetaId); return e ? e.nombre : 'sin segmento'; };
    /* sin ninguna, ni se nombran (el asistente carga lo de las fórmulas en cuanto las ve nombradas) */
    if (bf || fs.length) L.push('', 'FÓRMULAS (biblioteca ' + ID_BIB_FORMULAS() + ', «Fórmulas»: prompts reutilizables de Leo, solo texto, como skills; se eligen en las operaciones de IA de los lienzos con editar_lienzo › crear_nodo / editar_nodo { formulas }, y usar_formula da el texto de una): '
      + (fs.length ? fs.map(n => comillas(n.titulo) + ' (' + n.id + ', ' + segDe(n) + ')').join(', ') : 'ninguna (se crea una con editar_biblioteca { biblioteca: "Fórmulas" } › crear_nota)'));
    const est = estiloTexto(ctx);
    if (est.length) L.push('', ...est);
    const pap = docs.papelera();
    const enPap = x => (x.nota ? 'nota ' + x.nota.id : x.tipo + ' ' + ((x.esquema || x.sub || x.personaje || x.lienzo || {}).id || '?'));
    L.push('', 'PAPELERA: ' + (pap.length ? pap.map(x => enPap(x) + ' ' + comillas(C.nombreEnPapelera ? C.nombreEnPapelera(x) : '')).join(', ') : 'vacía'));
    if (ctx.estado) {
      const e = ctx.estado();
      if (e) L.push('', 'EN PANTALLA: vista ' + e.vista + (e.esquema ? ' · esquema montado ' + comillas(e.esquema.nombre) + ' (' + e.esquema.id + ')' : '')
        + (e.documento ? ' · documento abierto ' + comillas(e.documento.titulo) + ' (nota ' + e.documento.id + ')' : '') + (e.seleccion ? ' · elegido: ' + e.seleccion : ''));
    }
    return { texto: L.join('\n') };
  }
  const NUEVO_ESQUEMA = () => Tr().inicial();
  const OPS_PROYECTO = {
    /* el nombre del proyecto no vive en los documentos: se apunta y se pone al final, si el lote entero salió bien */
    renombrar_proyecto(ctx, o, refs) {
      const n = texto(o.nombre).trim(); if (!n) falla('El nombre no puede quedar vacío');
      /* el mismo nombre no es un fallo (revisión: la app lo daba por fallido con lo demás del lote ya hecho, y la IA lo repetía) */
      if (ctx.proyecto && n === ctx.proyecto.nombre) { delete refs.nombreProyecto; return 'proyecto ' + comillas(n) + ' (ya se llamaba así)'; }
      refs.nombreProyecto = n;
      return 'proyecto ' + comillas(n) + ' (el archivo se sigue llamando igual)';
    },
    crear_contenedor(ctx, o, refs) { const r = ok(ctx.docs.crearContenedor(texto(o.nombre).trim() || 'Contenedor', { vacio: !!o.vacio })); guardarRef(refs, o.ref, 'contenedor', r.contenedor.id); return 'contenedor ' + r.contenedor.id + ' ' + comillas(r.contenedor.nombre) + (r.sub ? ' (con su biblioteca ' + comillas(r.sub.nombre) + ')' : ''); },
    renombrar_contenedor(ctx, o, refs) { const c = contRef(ctx, o.contenedor, refs); ok(ctx.docs.renombrarContenedor(c.id, texto(o.nombre))); return 'contenedor ' + c.id + ' → ' + comillas(c.nombre); },
    eliminar_contenedor(ctx, o, refs) { const c = contRef(ctx, o.contenedor, refs); return ok(ctx.docs.eliminarContenedor(c.id)).aviso; },
    crear_esquema(ctx, o, refs) {
      const c = contRef(ctx, o.contenedor, refs), datos = NUEVO_ESQUEMA();
      const r = ok(ctx.docs.crearEsquema(c.id, datos, texto(o.nombre).trim() || 'Esquema'));
      if (o.carpeta) ok(ctx.docs.moverACarpeta('esquema', r.esquema.id, carpetaRef(ctx, o.carpeta, refs).id));
      guardarRef(refs, o.ref, 'esquema', r.esquema.id);
      return 'esquema ' + r.esquema.id + ' ' + comillas(r.esquema.nombre) + ' en ' + comillas(c.nombre) + ' (tres actos y la trama Principal; se llena con editar_esquema)';
    },
    renombrar_esquema(ctx, o, refs) { const e = esqRef(ctx, o.esquema, refs); ok(ctx.docs.renombrarEsquema(e.id, texto(o.nombre))); return 'esquema ' + e.id + ' → ' + comillas(e.nombre); },
    duplicar_esquema(ctx, o, refs) { const e = esqRef(ctx, o.esquema, refs), r = ok(ctx.docs.duplicarEsquema(e.id)); guardarRef(refs, o.ref, 'esquema', r.esquema.id); return r.aviso + ' (' + r.esquema.id + ')'; },
    mover_esquema(ctx, o, refs) {
      const e = esqRef(ctx, o.esquema, refs);
      if (o.carpeta !== undefined) ok(ctx.docs.moverACarpeta('esquema', e.id, o.carpeta ? carpetaRef(ctx, o.carpeta, refs).id : null, o.contenedor ? contRef(ctx, o.contenedor, refs).id : undefined));
      else if (o.contenedor !== undefined) ok(ctx.docs.colocarEsquema(e.id, null, contRef(ctx, o.contenedor, refs).id));
      const r = ctx.docs.esquema(e.id); return 'esquema ' + e.id + ' en ' + comillas(r.contenedor.nombre) + (e.carpetaId ? ', carpeta ' + e.carpetaId : '');
    },
    tirar_esquema(ctx, o, refs) { const e = esqRef(ctx, o.esquema, refs); return ok(ctx.docs.eliminarEsquema(e.id)).aviso + ' (restaurar lo devuelve)'; },
    crear_biblioteca(ctx, o, refs) {
      const c = contRef(ctx, o.contenedor, refs), r = ok(ctx.docs.crearSub(c.id, texto(o.nombre).trim() || C.NOMBRE_SUB));
      if (o.carpeta) ok(ctx.docs.moverACarpeta('sub', r.sub.id, carpetaRef(ctx, o.carpeta, refs).id));
      guardarRef(refs, o.ref, 'biblioteca', r.sub.id);
      return 'biblioteca ' + r.sub.id + ' ' + comillas(r.sub.nombre) + ' en ' + comillas(c.nombre);
    },
    renombrar_biblioteca(ctx, o, refs) { const s = bibNormal(bibRef(ctx, o.biblioteca, refs)); ok(ctx.docs.renombrarSub(s.id, texto(o.nombre))); return 'biblioteca ' + s.id + ' → ' + comillas(s.nombre); },
    duplicar_biblioteca(ctx, o, refs) { const s = bibNormal(bibRef(ctx, o.biblioteca, refs)), r = ok(ctx.docs.duplicarSub(s.id)); guardarRef(refs, o.ref, 'biblioteca', r.sub.id); return r.aviso + ' (' + r.sub.id + ')'; },
    mover_biblioteca(ctx, o, refs) {
      const s = bibNormal(bibRef(ctx, o.biblioteca, refs));
      if (o.carpeta !== undefined) ok(ctx.docs.moverACarpeta('sub', s.id, o.carpeta ? carpetaRef(ctx, o.carpeta, refs).id : null, o.contenedor ? contRef(ctx, o.contenedor, refs).id : undefined));
      else if (o.contenedor !== undefined) ok(ctx.docs.colocarSub(s.id, null, contRef(ctx, o.contenedor, refs).id));
      return 'biblioteca ' + s.id + ' en ' + comillas(ctx.docs.sub(s.id).contenedor.nombre);
    },
    /* conexiones esquema ↔ biblioteca (1.1.57): de muchos a muchos; ahí deja Claude los fragmentos de un esquema */
    conectar(ctx, o, refs) {
      const e = esqRef(ctx, o.esquema, refs), s = bibNormal(bibRef(ctx, o.biblioteca, refs));
      const r = ok(ctx.docs.conectar(e.id, s.id));
      return r.cambio ? 'esquema ' + e.id + ' ' + comillas(e.nombre) + ' ↔ biblioteca ' + s.id + ' ' + comillas(s.nombre) : r.aviso;
    },
    desconectar(ctx, o, refs) {
      const e = esqRef(ctx, o.esquema, refs), s = bibRef(ctx, o.biblioteca, refs);
      const r = ok(ctx.docs.desconectar(e.id, s.id));
      return r.cambio ? 'esquema ' + e.id + ' ' + comillas(e.nombre) + ' ya no está conectado con ' + comillas(s.nombre) : 'no estaban conectados';
    },
    tirar_biblioteca(ctx, o, refs) { const s = bibNormal(bibRef(ctx, o.biblioteca, refs)); return ok(ctx.docs.eliminarSub(s.id)).aviso + ' (restaurar la devuelve)'; },
    /* lienzos de nodos (1.1.58): como los esquemas; se llenan con editar_lienzo */
    crear_lienzo(ctx, o, refs) {
      const c = contRef(ctx, o.contenedor, refs), docs = ctx.docs;
      if (!docs.crearLienzo) falla('Esta versión de ClapCraft no trae los lienzos');
      const r = ok(docs.crearLienzo(c.id, texto(o.nombre).trim() || 'Lienzo')), l = r.lienzo;
      if (o.carpeta) ok(docs.moverACarpeta('lienzo', l.id, carpetaRef(ctx, o.carpeta, refs).id));
      guardarRef(refs, o.ref, 'lienzo', l.id);
      return 'lienzo ' + l.id + ' ' + comillas(l.nombre) + ' en ' + comillas(c.nombre) + ' (vacío: se arma con editar_lienzo)';
    },
    renombrar_lienzo(ctx, o, refs) { const l = lzRef(ctx, o.lienzo, refs); ok(ctx.docs.renombrarLienzo(l.id, texto(o.nombre))); return 'lienzo ' + l.id + ' → ' + comillas(l.nombre); },
    duplicar_lienzo(ctx, o, refs) { const l = lzRef(ctx, o.lienzo, refs), r = ok(ctx.docs.duplicarLienzo(l.id)); guardarRef(refs, o.ref, 'lienzo', r.lienzo.id); return (r.aviso || 'lienzo duplicado') + ' (' + r.lienzo.id + ')'; },
    mover_lienzo(ctx, o, refs) {
      const l = lzRef(ctx, o.lienzo, refs), docs = ctx.docs;
      if (o.carpeta !== undefined) ok(docs.moverACarpeta('lienzo', l.id, o.carpeta ? carpetaRef(ctx, o.carpeta, refs).id : null, o.contenedor ? contRef(ctx, o.contenedor, refs).id : undefined));
      else if (o.contenedor !== undefined) ok(docs.colocarLienzo ? docs.colocarLienzo(l.id, null, contRef(ctx, o.contenedor, refs).id) : docs.moverACarpeta('lienzo', l.id, null, contRef(ctx, o.contenedor, refs).id));
      const r = docs.lienzo(l.id); return 'lienzo ' + l.id + ' en ' + comillas(r.contenedor.nombre) + (r.lienzo.carpetaId ? ', carpeta ' + r.lienzo.carpetaId : '');
    },
    tirar_lienzo(ctx, o, refs) { const l = lzRef(ctx, o.lienzo, refs); return ok(ctx.docs.eliminarLienzo(l.id)).aviso + ' (restaurar lo devuelve)'; },
    crear_carpeta(ctx, o, refs) {
      const padre = o.dentro_de ? carpetaRef(ctx, o.dentro_de, refs) : null;
      const ambito = padre ? ctx.docs.carpeta(padre.id).ambito : contRef(ctx, o.contenedor, refs).id;
      const col = o.color === undefined || o.color === null ? 'gris' : C.COLORES_CARPETA.includes(plano(o.color)) ? plano(o.color) : falla('Color de carpeta: ' + C.COLORES_CARPETA.join(', '));
      const k = ok(ctx.docs.crearCarpeta(ambito, texto(o.nombre).trim() || 'Carpeta', col, padre ? padre.id : null)).carpeta;
      guardarRef(refs, o.ref, 'carpeta', k.id);
      return 'carpeta ' + k.id + ' ' + comillas(k.nombre);
    },
    renombrar_carpeta(ctx, o, refs) { const k = carpetaRef(ctx, o.carpeta, refs); ok(ctx.docs.renombrarCarpeta(k.id, texto(o.nombre))); return 'carpeta ' + k.id + ' → ' + comillas(k.nombre); },
    eliminar_carpeta(ctx, o, refs) { const k = carpetaRef(ctx, o.carpeta, refs); return ok(ctx.docs.eliminarCarpeta(k.id)).aviso + ' (lo de dentro sube un nivel)'; },
    agrupar(ctx, o, refs) {
      const ids = lista(o.elementos).map(v => deRef(refs, v, null) || String(v));
      if (ids.some(id => id === C.ID_BIB_PLANTILLAS || id === C.ID_PLANTILLAS)) falla('Las plantillas no se agrupan: viven fuera del árbol');
      if (ids.some(id => id === ID_BIB_FORMULAS() || id === (C.ID_FORMULAS || 'formulas'))) falla('Las fórmulas no se agrupan: viven fuera del árbol');
      const amb = ids.length ? ctx.docs._ambitoDe(ids[0]) : (o.contenedor ? contRef(ctx, o.contenedor, refs).id : null);
      if (!amb) falla('No encuentro ' + comillas(ids[0] || '') + ' (usa ids de esquemas, bibliotecas o grupos del mismo contenedor)');
      const col = o.color && C.COLORES_CARPETA.includes(plano(o.color)) ? plano(o.color) : undefined;
      const g = ok(ctx.docs.crearGrupo(amb, ids, texto(o.nombre).trim() || undefined, col)).grupo;
      guardarRef(refs, o.ref, 'grupo', g.id);
      return 'grupo ' + g.id + ' ' + comillas(g.nombre) + ' con ' + plural(ids.length, 'elemento', 'elementos');
    },
    desagrupar(ctx, o, refs) { const id = deRef(refs, o.grupo, 'grupo') || String(o.grupo); return ok(ctx.docs.deshacerGrupo(id)).aviso; },
    crear_personaje(ctx, o, refs) {
      const p = ok(ctx.docs.crearPersonaje(texto(o.nombre), o.color !== undefined ? colorEtiqueta(o.color) : undefined)).personaje;
      guardarRef(refs, o.ref, 'personaje', p.id);
      return 'personaje ' + p.id + ' ' + comillas(p.nombre) + ' (' + nombreColorEtiqueta(p.color) + ')';
    },
    renombrar_personaje(ctx, o, refs) {
      const p = persRef(ctx, o.personaje, refs), r = ok(ctx.docs.renombrarPersonaje(p.id, texto(o.nombre)));
      return 'personaje ' + p.id + ' → ' + comillas(p.nombre) + (r.notas ? ' (reescrito en ' + plural(r.notas, 'documento', 'documentos') + ')' : '');
    },
    colorear_personaje(ctx, o, refs) { const p = persRef(ctx, o.personaje, refs); ok(ctx.docs.colorearPersonaje(p.id, colorEtiqueta(o.color))); return 'personaje ' + p.id + ' ' + comillas(p.nombre) + ': ' + nombreColorEtiqueta(p.color); },
    /* una copia de una nota en las plantillas (1.1.56): en su bandeja o en uno de sus segmentos */
    guardar_como_plantilla(ctx, o, refs) {
      const docs = ctx.docs, id = deRef(refs, o.nota, 'nota');
      const n = id ? docs.nota(id) : esEnlace(o.nota) || docs.nota(String(o.nota)) ? notaDe(docs, o.nota)
        : encontrar(docs.notasNormales().map(x => ({ id: x.id, nombre: x.titulo, obj: x })), o.nota, 'la nota');   // por título, entre las que no son plantillas
      if (!n) falla('No encuentro la nota ' + comillas(o.nota) + ' (¿se tiró antes en esta lista?): se guarda como plantilla una nota de una biblioteca');
      if (docs.esPlantilla(n)) falla(comillas(n.titulo) + ' ya es una plantilla');
      const pl = docs.bibliotecaPlantillas();
      const etq = o.segmento !== undefined && o.segmento !== null && o.segmento !== '' ? (pl ? segmentoDe(docs, pl.sub, o.segmento, refs).id : falla('Las plantillas aún no tienen segmentos: guárdala sin "segmento" (en su bandeja)')) : null;
      const r = ok(docs.guardarComoPlantilla(n.id, etq));
      guardarRef(refs, o.ref, 'nota', r.nota.id);
      return 'plantilla ' + r.nota.id + ' ' + comillas(r.nota.titulo) + ' en ' + lugarDeNota(docs, r.nota) + ' (una copia de la nota ' + n.id + ', que no cambia)';
    },
    restaurar(ctx, o) {
      const id = String(o.elemento || o.nota || o.id || '');
      if (ctx.docs.enPapelera(id)) return ok(ctx.docs.restaurarNota(id)).aviso;
      if (ctx.docs.piezaEnPapelera(id)) return ok(ctx.docs.restaurarPieza(id)).aviso;
      falla(comillas(id) + ' no está en la papelera');
    }
  };
  const contRef = (ctx, v, refs) => { const id = deRef(refs, v, 'contenedor'); if (id) return ctx.docs.contenedor(id); return contenedorDe(ctx.docs, v); };
  const esqRef = (ctx, v, refs) => { const id = deRef(refs, v, 'esquema'); if (id) return ctx.docs.esquema(id).esquema; return esquemaDe(ctx.docs, v).esquema; };
  const bibRef = (ctx, v, refs) => { const id = deRef(refs, v, 'biblioteca'); if (id) return ctx.docs.sub(id).sub; return bibliotecaDe(ctx.docs, v).sub; };
  const lzRef = (ctx, v, refs) => { const id = deRef(refs, v, 'lienzo'); if (id) return ctx.docs.lienzo(id).lienzo; return lienzoDe(ctx.docs, v).lienzo; };
  const persRef = (ctx, v, refs) => { const id = deRef(refs, v, 'personaje'); if (id) return ctx.docs.personaje(id); return personajeDe(ctx.docs, v); };
  function carpetaRef(ctx, v, refs) {
    const id = deRef(refs, v, 'carpeta'); if (id) return ctx.docs.carpeta(id).carpeta;
    const todas = ctx.docs.datos.contenedores.flatMap(c => c.carpetas).concat(ctx.docs.datos.carpetasElenco);
    return encontrar(todas.map(k => ({ id: k.id, nombre: k.nombre, obj: k })), v, 'la carpeta');
  }
  function editarProyecto(ctx, args) {
    const antes = JSON.stringify(ctx.docs.datos);
    const r = lote(ctx, args.operaciones, (o, refs) => {
      const nombre = nombreOperacion('editar_proyecto', o), fn = OPS_PROYECTO[nombre];
      if (!fn) falla('no conozco la operación ' + comillas(opCruda(o)) + '. Operaciones: ' + Object.keys(OPS_PROYECTO).join(', '));
      return fn(ctx, o, refs);
    });
    const nombre = r.refs.nombreProyecto;
    if (nombre) {
      /* el nombre va al final, fuera del lote: si no se puede (otro proyecto abierto ya se llama así), se deshace el lote entero
         (revisión: fallaba con lo demás ya hecho, y la IA lo reintentaba y lo duplicaba) */
      const rn = ctx.renombrarProyecto ? ctx.renombrarProyecto(nombre) : { ok: true };
      if (!rn || !rn.ok) { reponerEnSitio(ctx.docs.datos, antes); falla(((rn && rn.aviso) || 'No se pudo renombrar el proyecto') + '. No se cambió nada.'); }
      if (ctx.proyecto) ctx.proyecto.nombre = nombre;
      ctx.cambio({ proyecto: true });
    }
    return { texto: r.hechos.join('\n') + (r.creados.length ? '\nCreados: ' + r.creados.join(', ') : ''), datos: { refs: Object.fromEntries([...r.refs].map(([k, x]) => [k, x.id])) } };
  }

  function buscar(ctx, args) {
    const docs = ctx.docs, q = plano(args.texto), max = Math.max(1, Math.min(200, +args.limite || 40));
    if (!q) falla('Escribe qué buscar');
    const res = [], casa = s => plano(s).includes(q);
    const extracto = t => { const s = String(t || '').replace(/\s+/g, ' '), i = plano(s).indexOf(q); if (i < 0) return corto(s, 120); const a = Math.max(0, i - 50); return (a ? '…' : '') + s.slice(a, a + 140) + (a + 140 < s.length ? '…' : ''); };
    docs.datos.contenedores.forEach(c => c.esquemas.forEach(e => {
      const m = new (Tr().Modelo)(e.datos), donde = 'esquema ' + comillas(e.nombre) + ' (' + e.id + ')';
      if (casa(e.nombre)) res.push('- ' + donde + ': el nombre');
      m.datos.lineas.forEach(l => { if (casa(l.nombre)) res.push('- trama ' + l.id + ' ' + comillas(l.nombre) + ' en ' + donde); });
      m.datos.actos.forEach(a => { if (casa(a.nombre)) res.push('- acto ' + a.id + ' ' + comillas(a.nombre) + ' en ' + donde); });
      m.datos.puntos.forEach(p => {
        if (casa(p.titulo) || casa(p.descripcion)) res.push('- nodo ' + p.id + ' ' + comillas(p.titulo) + ' en ' + donde + ', ' + comillas((m.linea(p.lineaId) || {}).nombre) + ' col ' + col1(m.cg(p)) + (casa(p.descripcion) && !casa(p.titulo) ? ' — ' + extracto(p.descripcion) : ''));
      });
      m.datos.notas.forEach(n => { if (casa(n.texto)) res.push('- nota ' + n.id + ' en ' + donde + ' ' + sitioNota(m, n).texto + ' — ' + extracto(n.texto)); });
    }));
    bibliotecasTodas(docs).forEach(x => { if (casa(x.nombre)) res.push('- biblioteca ' + x.id + ' ' + comillas(x.nombre)); });
    docs.datos.etiquetas.forEach(e => { if (casa(e.nombre)) res.push('- segmento ' + e.id + ' ' + comillas(e.nombre) + ' de ' + comillas((docs.sub(e.subId) || { sub: {} }).sub.nombre || '?')); });
    docs.datos.notas.forEach(n => {
      const t = V().textoPlano(n.html);
      if (casa(n.titulo) || casa(t)) res.push('- ' + (docs.esPlantilla && docs.esPlantilla(n) ? 'plantilla ' : esFormulaN(docs, n) ? 'fórmula ' : 'documento ') + n.id + ' ' + comillas(n.titulo) + ' (' + lugarDeNota(docs, n) + ')' + (casa(t) ? ' — ' + extracto(t) : ''));
    });
    docs.datos.elenco.forEach(p => { if (casa(p.nombre)) res.push('- personaje ' + p.id + ' ' + comillas(p.nombre)); });
    lienzosTodos(docs).forEach(x => {
      const l = x.obj.lienzo, donde = 'lienzo ' + comillas(l.nombre) + ' (' + l.id + ')';
      if (casa(l.nombre)) res.push('- ' + donde + ': el nombre');
      (l.nodos || []).forEach(n => { const d = n.datos || {}, t = [n.titulo, d.md, d.instruccion].filter(Boolean).join(' · '); if (casa(t)) res.push('- nodo ' + n.id + ' ' + comillas(nombreNodoL(n)) + ' en ' + donde + ' — ' + extracto(t)); });
    });
    return { texto: res.length ? plural(res.length, 'resultado', 'resultados') + ' para ' + comillas(args.texto) + (res.length > max ? ' (los primeros ' + max + ')' : '') + ':\n' + res.slice(0, max).join('\n') : 'Nada con ' + comillas(args.texto) };
  }

  /* ====================================================================
     Enlaces (1.1.52): lo que Leo copia en ClapCraft para decir de qué habla
     ==================================================================== */
  /* Leo, 25-09-2026: «Pon unos "puntos" o "links" a bibliotecas, segmentos, notas, personajes, esquemas, etc. Para facilitar el
     decirle a Claude a qué puntos me refiero cuando le hablo de algo». Cada cosa de ClapCraft tiene su enlace (clapcraft://…,
     js/claquedraw/enlaces.js) y ver_enlace dice qué es cada uno, dónde está y lo que tiene, con los ids para cambiarlo. */
  const nodoCorto = (m, p) => p.id + ' ' + tituloDe(p) + ' (col ' + col1(m.cg(p)) + ')';
  const lineaNotaEsq = (n, pre) => (pre || '  ') + '- nota ' + n.id + (n.color ? ' [' + n.color + ']' : '') + ': ' + (String(n.texto || '').trim().replace(/\s*\n\s*/g, ' / ') || '(vacía)');
  function textoNodo(docs, R, m, p) {
    const L = [], l = m.linea(p.lineaId), c = m.cg(p), a = m.actoEn(c), d = m.datos;
    L.push(m.nombre('nodo').toUpperCase() + ' ' + p.id + ' ' + tituloDe(p) + ' · ' + comillas(l ? l.nombre : '?') + ' (' + p.lineaId + ') · columna ' + col1(c)
      + (a ? ' · ' + m.nombre('acto').toLowerCase() + ' ' + comillas(a.nombre) + ' (' + a.id + ')' : ' · fuera de los actos') + (p.color ? ' · color ' + p.color : '') + (p.cortado ? ' · DESCARTADO' : ''));
    if (p.descripcion) { L.push('Descripción:'); String(p.descripcion).split('\n').forEach(x => L.push('  │ ' + x)); } else L.push('Sin descripción.');
    const suyas = d.notas.filter(n => !n.abierta && n.deId === p.id && !n.aId);
    L.push(suyas.length ? 'Notas del nodo:' : 'Sin notas en el nodo.'); suyas.forEach(n => L.push(lineaNotaEsq(n)));
    const ps = m.puntosDe(p.lineaId), i = ps.findIndex(q => q.id === p.id), antes = ps[i - 1], despues = ps[i + 1];
    const enlace = (x, y) => d.notas.filter(n => !n.abierta && n.deId === x.id && n.aId === y.id);
    if (antes) { L.push('Antes, en su trama: ' + nodoCorto(m, antes)); enlace(antes, p).forEach(n => L.push(lineaNotaEsq(n, '  (enlace) '))); }
    else L.push('Es el primero de su trama.');
    if (despues) { L.push('Después: ' + nodoCorto(m, despues) + (p.colorEnlace ? ' · enlace ' + p.colorEnlace : '')); enlace(p, despues).forEach(n => L.push(lineaNotaEsq(n, '  (enlace) '))); }
    else L.push('Es el último de su trama.');
    const otros = d.puntos.filter(q => q.id !== p.id && m.cg(q) === c);
    if (otros.length) L.push('En la misma columna: ' + otros.map(q => { const s = m.saltoDe(q.id); return (s ? (s.tipo === 'rombo' ? '◇ ' : '▢ ') : '') + q.id + ' ' + tituloDe(q) + ' en ' + comillas((m.linea(q.lineaId) || {}).nombre || '?'); }).join('; '));
    L.push('(Cambiarlo: editar_esquema { esquema: "' + R.esquema.id + '", operaciones: [{ op: "editar_nodo", nodo: "' + p.id + '", … }] }; una sugerencia, mejor como nota: crear_nota { nodo: "' + p.id + '" }.)');
    return L;
  }
  function textoSalto(docs, R, m, s) {
    const L = [], a = m.punto(s.deId), b = m.punto(s.aId), nomL = id => comillas((m.linea(id) || {}).nombre || '?');
    L.push(m.forma(s.tipo).toUpperCase() + ' ' + s.id + (a && a.titulo ? ' ' + comillas(a.titulo) : ' (sin título)') + ' · columna ' + (a ? col1(m.cg(a)) : '?')
      + ': sale de ' + nomL(a && a.lineaId) + ' (' + s.deId + ') y llega a ' + nomL(b && b.lineaId) + ' (' + s.aId + ')');
    [a, b].filter(Boolean).forEach((p, k) => {
      if (p.descripcion) { L.push((k ? 'Descripción de la llegada:' : 'Descripción:')); String(p.descripcion).split('\n').forEach(x => L.push('  │ ' + x)); }
      m.datos.notas.filter(n => !n.abierta && n.deId === p.id && !n.aId).forEach(n => L.push(lineaNotaEsq(n)));
    });
    L.push('(Cambiarlo: editar_esquema con editar_salto { salto: "' + s.id + '" } —forma, titulo, columna, invertir— o borrar_salto.)');
    return L;
  }
  function textoTrama(docs, R, m, l) {
    const L = [], ps = m.puntosDe(l.id), d = m.datos;
    L.push(m.nombre('linea').toUpperCase() + ' ' + l.id + ' ' + comillas(l.nombre) + ' · ' + (TIPO_TEXTO[l.tipo] || l.tipo) + ' · ' + l.color + ' · posición ' + (d.lineas.indexOf(l) + 1) + ' de ' + d.lineas.length
      + (l.oculta ? ' · OCULTA' : '') + (l.cortada ? ' · descartada' : '') + (l.personaje ? ' · personaje ' + comillas((docs.personaje(l.personaje) || {}).nombre || l.personaje) : ''));
    if (!ps.length) L.push('Sin nodos.');
    ps.forEach(p => {
      const s = m.saltoDe(p.id), nn = d.notas.filter(n => !n.abierta && n.deId === p.id).length;
      L.push('  col ' + col1(m.cg(p)) + ' · ' + (s ? (s.tipo === 'rombo' ? '◇ ' : '▢ ') + s.id + ' ' : '') + p.id + ' ' + tituloDe(p) + (p.color ? ' [' + p.color + ']' : '') + (p.cortado ? ' (descartado)' : '') + (nn ? ' · ' + plural(nn, 'nota', 'notas') : ''));
    });
    const rayas = d.notas.filter(n => n.abierta && m.lineaDeNota(n) === l.id);
    if (rayas.length) { L.push('Notas en sus rayas:'); rayas.forEach(n => L.push('  col ' + col1(m.colNota(n)) + '–' + (col1(m.colNota(n)) + 1) + ': nota ' + n.id + ': ' + String(n.texto || '').trim().replace(/\s*\n\s*/g, ' / '))); }
    L.push('(Léela entera en el esquema con leer_esquema { esquema: "' + R.esquema.id + '" }.)');
    return L;
  }
  /* los nodos de unas columnas (de 0), por trama */
  function nodosEnColumnas(m, a, b) {
    const L = [];
    m.datos.lineas.forEach(l => {
      const ps = m.puntosDe(l.id).filter(p => m.cg(p) >= a && m.cg(p) <= b);
      if (ps.length) L.push('  ' + comillas(l.nombre) + ' (' + l.id + '): ' + ps.map(p => nodoCorto(m, p)).join(', '));
    });
    return L.length ? L : ['  (ningún nodo)'];
  }
  function textoActo(docs, R, m, a) {
    const L = [m.nombre('acto').toUpperCase() + ' ' + a.id + ' ' + comillas(a.nombre) + ' · ' + rango(a.desde, a.desde + a.celdas - 1) + ' · fondo ' + (a.fondo || 'auto')
      + ' · ' + (m.datos.actos.indexOf(a) + 1) + ' de ' + m.datos.actos.length];
    L.push('Sus nodos:'); nodosEnColumnas(m, a.desde, a.desde + a.celdas - 1).forEach(x => L.push(x));
    return L;
  }
  function textoEnlace(docs, R, m, x) {
    const a = x.de, b = x.a, l = m.linea(a.lineaId), d = m.datos, ca = m.cg(a), cb = m.cg(b);
    const L = ['ENLACE de ' + nodoCorto(m, a) + ' a ' + nodoCorto(m, b) + ' en ' + comillas(l ? l.nombre : '?') + (a.colorEnlace ? ' · color ' + a.colorEnlace : '')];
    if (!x.seguidos) L.push('(Ya no van seguidos en su trama: entre medias hay otros nodos o uno de los dos cambió de trama.)');
    const suyas = d.notas.filter(n => !n.abierta && n.deId === a.id && n.aId === b.id), rayas = d.notas.filter(n => n.abierta && m.lineaDeNota(n) === a.lineaId && m.colNota(n) >= Math.min(ca, cb) && m.colNota(n) < Math.max(ca, cb));
    L.push(suyas.length ? 'Notas del enlace:' : 'Sin notas en el enlace.'); suyas.forEach(n => L.push(lineaNotaEsq(n)));
    rayas.forEach(n => L.push(lineaNotaEsq(n, '  (en la raya de la columna ' + col1(m.colNota(n)) + ') ')));
    L.push('(Una nota aquí: editar_esquema con crear_nota { entre: ["' + a.id + '", "' + b.id + '"], texto }.)');
    return L;
  }
  function textoRaya(docs, R, m, l, col) {
    const d = m.datos, ps = m.puntosDe(l.id), antes = ps.filter(p => m.cg(p) <= col).pop(), despues = ps.find(p => m.cg(p) > col), ac = m.actoEn(col);
    const L = ['RAYA de ' + comillas(l.nombre) + ' (' + l.id + ') entre las columnas ' + col1(col) + ' y ' + (col1(col) + 1) + (ac ? ' · ' + m.nombre('acto').toLowerCase() + ' ' + comillas(ac.nombre) : '')];
    if (col >= m.totalCeldas()) L.push('(Esas columnas aún no existen en el esquema: tiene ' + m.totalCeldas() + '.)');
    L.push('Nodo de antes: ' + (antes ? nodoCorto(m, antes) : 'ninguno') + ' · de después: ' + (despues ? nodoCorto(m, despues) : 'ninguno'));
    const ns = d.notas.filter(n => n.abierta && m.lineaDeNota(n) === l.id && m.colNota(n) === col);
    L.push(ns.length ? 'Notas en la raya:' : 'Sin notas en la raya.'); ns.forEach(n => L.push(lineaNotaEsq(n)));
    L.push('(Una nota aquí: crear_nota { trama: "' + l.id + '", columna: ' + col1(col) + ', texto }; un nodo: crear_nodo { trama: "' + l.id + '", columna: … }.)');
    return L;
  }
  function textoColumnas(docs, R, m, a, b) {
    const L = [(a === b ? 'COLUMNA ' + col1(a) : 'COLUMNAS ' + col1(a) + '–' + col1(b)) + ' · de ' + m.totalCeldas() + ' que tiene el esquema'];
    const actos = m.datos.actos.filter(x => x.desde <= b && x.desde + x.celdas - 1 >= a);
    L.push(actos.length ? 'En ' + actos.map(x => m.nombre('acto').toLowerCase() + ' ' + comillas(x.nombre) + ' (' + x.id + ')').join(', ') : 'Fuera de los actos');
    L.push('Nodos:'); nodosEnColumnas(m, a, b).forEach(x => L.push(x));
    return L;
  }
  function textoNotaEsq(docs, R, m, n) {
    return ['NOTA ' + n.id + ' del esquema' + (n.color ? ' · color ' + n.color : ' · papel') + ' · ' + sitioNota(m, n).texto, 'Texto:', ...String(n.texto || '').split('\n').map(x => '  │ ' + x),
      '(Cambiarla: editar_esquema con editar_nota { nota: "' + n.id + '", texto } o mover_nota.)'];
  }
  /* un documento entero o un tramo, con su número de bloque */
  function textoDocumento(ctx, x, nota, esq, ref) {
    const html = nota.html, como = esq || V().esGuion(html) ? 'guion' : 'prosa';
    if (!ref.bloques) {
      const r = leerDocumento(ctx, esq ? { esquema: esq.id, numerar: true } : { nota: nota.id, numerar: true });
      return [r.texto];
    }
    const t = C.enlaces.tramo(html, ref), L = [];
    L.push('TRAMO de ' + (esq ? 'el guion de ' + comillas(esq.nombre) : 'la nota ' + comillas(nota.titulo)) + ' (nota ' + nota.id + ') · ' + (t.desde === t.hasta ? 'bloque ' + t.desde : 'bloques ' + t.desde + '–' + t.hasta) + ' de ' + t.total);
    if (t.movido) L.push('(Se movió: al copiar el enlace eran ' + (t.antes[0] === t.antes[1] ? 'el ' + t.antes[0] : 'los ' + t.antes[0] + '–' + t.antes[1]) + '.)');
    if (t.perdido) L.push('(El texto de ese tramo cambió desde que se copió el enlace: estos son los bloques que ahora ocupan su sitio; confírmalo con Leo.)');
    L.push('Con uno de contexto a cada lado ([N] = número de bloque; escribir_documento { modo: "sustituir", desde: ' + t.desde + ', hasta: ' + t.hasta + ' } lo cambia):', '');
    L.push(V().aTexto(html, { modo: como, numerar: true, desde: Math.max(1, t.desde - 1), hasta: Math.min(t.total, t.hasta + 1) }) || '(vacío)');
    return L;
  }
  function textoPersonaje(docs, p) {
    const L = ['PERSONAJE ' + p.id + ' ' + comillas(p.nombre) + ' · color ' + nombreColorEtiqueta(p.color)];
    const bp = docs.contenedor(C.ID_PERSONAJES), s = bp && bp.subs.find(x => x.lineaId === p.id);
    if (s) {
      const ns = docs.notasDe(s.id);
      L.push('Su biblioteca: ' + s.id + ' · ' + plural(ns.length, 'nota', 'notas') + (ns.length ? ' (' + ns.slice(0, 8).map(n => comillas(n.titulo)).join(', ') + (ns.length > 8 ? '…' : '') + ')' : '') + ' — léela con leer_biblioteca { biblioteca: "' + s.id + '", contenido: true }');
    } else L.push('Aún no tiene biblioteca.');
    const ap = docs.menciones(p.id);
    L.push(ap.length ? 'Aparece (con «/») en ' + plural(ap.length, 'documento', 'documentos') + ': ' + ap.map(a => comillas(a.titulo) + ' (' + a.ruta + ')').join('; ') : 'No aparece en ningún documento.');
    const eq = docs.esquemasDePersonaje(p.id);
    if (eq.length) L.push('Esquemas con carril suyo: ' + eq.map(e => comillas(e.nombre) + ' (' + e.eid + (e.principal ? ', el suyo' : e.personaje ? ', de personaje' : ', ' + comillas(e.contenedor)) + ')').join(', '));
    return L;
  }
  function textoSeccion(docs, R) {
    const s = R.sub, k = R.seccion, L = ['SECCIÓN ' + k.id + ' ' + comillas(k.nombre) + ' de la biblioteca ' + comillas(s.nombre) + ' (' + s.id + ')'];
    const segs = docs.etiquetasDe(s.id, k.id);
    if (!segs.length) L.push('  (sin segmentos)');
    segs.forEach(e => { const ns = docs.notasDe(s.id, e.id); L.push('SEGMENTO ' + e.id + ' ' + comillas(e.nombre) + ' · ' + plural(ns.length, 'nota', 'notas')); ns.forEach(n => L.push(lineaNota(docs, n, false))); });
    return L;
  }
  function textoSegmento(docs, R) {
    const s = R.sub, e = R.segmento, ns = docs.notasDe(s.id, e ? e.id : null);
    const L = [(e ? 'SEGMENTO ' + e.id + ' ' + comillas(e.nombre) + ' · color ' + nombreColorEtiqueta(e.color) : 'NOTAS SIN SEGMENTO (la bandeja)') + ' · biblioteca ' + comillas(s.nombre) + ' (' + s.id + ') · ' + plural(ns.length, 'nota', 'notas')];
    ns.forEach(n => L.push(lineaNota(docs, n, false)));
    L.push('(El texto de cada nota: leer_documento { nota }.)');
    return L;
  }
  /* un enlace, en texto: qué es, dónde está y lo que tiene */
  function textoEnlace1(ctx, url) {
    const docs = ctx.docs, x = C.enlaces.leer(url);
    if (!x) return ['ENLACE ' + url, 'No se entiende: no es un enlace de ClapCraft.'];
    const R = C.enlaces.resolver(docs, x, { proyecto: ctx.proyecto && ctx.proyecto.nombre });
    const L = ['ENLACE ' + x.url];
    const ahora = C.enlaces.proyectoDe({ ruta: ctx.proyecto && ctx.proyecto.ruta, nombre: ctx.proyecto && ctx.proyecto.nombre });
    const propios = [ahora], viejos = C.enlaces.nombres(docs.datos);                // con archivo, su nombre; sin él, el del proyecto
    if (ctx.proyecto && x.proyecto && !propios.includes(x.proyecto)) {
      if (viejos.includes(x.proyecto)) L.push('(El enlace lleva un nombre de antes del archivo, «' + x.proyecto + '»: ahora el proyecto es «' + ahora + '». Los enlaces que des, con el de ahora.)');
      else L.push('(El enlace dice «' + x.proyecto + '» y se leyó en el proyecto ' + comillas(ctx.proyecto.nombre) + ': si no es este, pásalo con "proyecto".)');
    }
    if (!R.ok) { L.push(R.aviso + '.'); return L; }
    L.push(R.etiqueta + (R.contenedor && !R.contenedor.oculto ? ' · contenedor ' + comillas(R.contenedor.nombre) : ''));
    const eid = R.esquema && R.esquema.id, m = R.modelo;
    switch (x.tipo) {
      case 'proyecto': L.push(verProyecto(ctx).texto); break;
      case 'contenedor': arbolTexto(docs, R.contenedor.id, null, '  ', L); break;
      case 'carpeta': L.push('CARPETA ' + R.carpeta.id + ' ' + comillas(R.carpeta.nombre) + ' · color ' + R.carpeta.color); arbolTexto(docs, R.ambito, R.carpeta.id, '  ', L); break;
      case 'grupo': L.push('GRUPO ' + R.grupo.id + ' ' + comillas(R.grupo.nombre)); docs.nivelGrupo(R.grupo.id).forEach(y => piezaTexto(docs, R.ambito, y, '  ', L)); break;
      case 'personaje': textoPersonaje(docs, R.personaje).forEach(y => L.push(y)); break;
      case 'biblioteca': L.push(leerBiblioteca(ctx, { biblioteca: R.sub.id }).texto); break;
      case 'seccion': textoSeccion(docs, R).forEach(y => L.push(y)); break;
      case 'segmento': textoSegmento(docs, R).forEach(y => L.push(y)); break;
      case 'esquema': L.push(textoEsquema(docs, { contenedor: R.contenedor, esquema: R.esquema }, m || modeloDe(docs, { esquema: R.esquema }))); break;
      case 'documento': case 'nota':
        if (x.tipo === 'nota' && x.esquema) { textoNotaEsq(docs, R, m, R.nota).forEach(y => L.push(y)); break; }
        if (!R.nota) { L.push('Aún no tiene documento: escribir_documento { esquema: "' + eid + '" } lo crea.'); break; }
        textoDocumento(ctx, x, R.nota, R.esquema || null, x).forEach(y => L.push(y)); break;
      case 'nodo': (R.salto ? textoSalto(docs, R, m, R.salto) : textoNodo(docs, R, m, R.punto)).forEach(y => L.push(y)); break;
      case 'salto': textoSalto(docs, R, m, R.salto).forEach(y => L.push(y)); break;
      case 'trama': textoTrama(docs, R, m, R.linea).forEach(y => L.push(y)); break;
      case 'acto': textoActo(docs, R, m, R.acto).forEach(y => L.push(y)); break;
      case 'enlace': textoEnlace(docs, R, m, R).forEach(y => L.push(y)); break;
      case 'raya': textoRaya(docs, R, m, R.linea, R.col).forEach(y => L.push(y)); break;
      case 'columnas': textoColumnas(docs, R, m, x.desde - 1, x.hasta - 1).forEach(y => L.push(y)); break;
      case 'lienzo': (x.nodo ? textoNodoLienzo(ctx, R) : [textoLienzo(ctx, { contenedor: R.contenedor, lienzo: R.lienzo }, modeloLienzo(R.lienzo, ctx))]).forEach(y => L.push(y)); break;
    }
    return L;
  }
  function verEnlace(ctx, args) {
    const urls = C.enlaces.extraer(lista(args.enlace).concat(lista(args.enlaces)).join('\n'));
    if (!urls.length) falla('No veo ningún enlace de ClapCraft: empiezan por clapcraft://');
    const max = 12, partes = urls.slice(0, max).map(u => textoEnlace1(ctx, u).join('\n'));
    return { texto: partes.join('\n\n———\n\n') + (urls.length > max ? '\n\n(Solo los ' + max + ' primeros de ' + urls.length + ': pide los demás aparte.)' : '') };
  }
  /* el enlace de algo (para decírselo a Leo: en ClapCraft lleva a su sitio) */
  const enlaceDe = (ctx, ref) => C.enlaces ? C.enlaces.crear(C.enlaces.proyectoDe(ctx.proyecto || {}), ref) : null;

  /* ====================================================================
     Fragmentos para vídeo (1.1.57): el guion de un esquema partido en tramos cortos
     ==================================================================== */
  /* Leo, 27-09-2026: «que los esquemas que vaya generando se puedan adaptar con skills de Claude para que me den pedazos del guion,
     con tiempos y todo, para que IAs como Seedance puedan generar mis guiones». `preparar_fragmentos` **no escribe nada**: lee el
     guion del esquema (o, si no tiene, sus nodos), lo parte en escenas y beats en orden, estima cuánto dura cada uno y propone
     cortes de `segundos_max` como mucho; luego Claude escribe una nota por fragmento en una biblioteca conectada.
     **La estimación** (una guía, no un cronómetro; se dice en la respuesta):
     · diálogo: 2,5 palabras por segundo (unas 150 por minuto, el ritmo hablado en español) y 0,5 s de pausa por intervención;
       un diálogo doble dura lo de su columna más larga;
     · acción y montaje: 1,1 s por renglón de guion (60 caracteres; 54 renglones son una página y una página, un minuto: los
       renglones de `Claquedraw.maquetar`, los del PDF); como mínimo 1,5 s;
     · transición: 0,5 s; encabezados (escena, secundario, toma, acto), notas y lo que no es texto: 0 s (van con lo que sigue);
     · sin guion, cada nodo del esquema es una escena y dura 0,4 s por palabra de su título y su descripción, entre 3 y 60 s.
     Un beat más largo que el máximo se parte por oraciones. Un fragmento no cruza de una escena a otra; el último de una escena, si
     queda por debajo de `segundos_min`, se une al anterior cuando cabe. Los nodos de cada escena salen de los enlaces clapcraft://
     que lleve su texto, de los títulos de nodo que nombre y, si no hay nada de eso y hay tantas escenas como nodos, por su orden. */
  const PALABRAS_POR_SEGUNDO = 2.5, PAUSA_DIALOGO = 0.5, SEG_RENGLON = 60 / 54, SEG_TRANSICION = 0.5, SEG_PALABRA_NODO = 0.4;
  const FORMATO_MAQ = { escena: 'scene', subescena: 'subscene', accion: 'action', personaje: 'character', parentesis: 'paren', dialogo: 'dialogue',
    transicion: 'transition', toma: 'shot', acto: 'act', nota: 'note', montaje: 'montage' };
  const maquetar = () => { if (C.maquetar) return C.maquetar; try { return require('./maquetar.js'); } catch (_) { return null; } };
  /* renglones de un texto como los pinta el PDF (sin maquetar.js, a 60 caracteres por renglón) */
  function renglonesDe(tipo, t) {
    const M = maquetar(), s = String(t || '');
    if (M && M.renglones) return M.renglones(FORMATO_MAQ[tipo] || 'action', s);
    return s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 60)), 0);
  }
  const palabrasDe = t => (String(t || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const redondo = s => Math.round(s * 10) / 10;
  const seg = s => String(redondo(s)).replace('.', ',') + ' s';
  const duracion = s => { const t = Math.round(s); return t < 60 ? t + ' s' : Math.floor(t / 60) + ' min ' + (t % 60 ? (t % 60) + ' s' : '').trim(); };
  const oraciones = t => String(t || '').split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);
  /* segundos de un bloque del guion ({ tipo, texto }); los encabezados y lo que no es texto no cuentan */
  function segundosBloque(b) {
    if (b.tipo === 'dialogo') return Math.max(1, palabrasDe(b.texto) / PALABRAS_POR_SEGUNDO);
    if (b.tipo === 'parentesis' || b.tipo === 'personaje') return 0;
    if (b.tipo === 'transicion') return SEG_TRANSICION;
    if (b.tipo === 'doble') return Math.max(0, ...b.columnas.map(c => c.filter(x => x.tipo === 'dialogo').reduce((s, x) => s + palabrasDe(x.texto), 0) / PALABRAS_POR_SEGUNDO + PAUSA_DIALOGO));
    if (['accion', 'montaje', 'parrafo', 'cita', 'lista'].includes(b.tipo)) {
      const t = b.tipo === 'lista' ? b.md : b.texto;
      return palabrasDe(t) ? Math.max(1.5, renglonesDe(b.tipo, t) * SEG_RENGLON) : 0;
    }
    return 0;
  }
  const ENCABEZADO = new Set(['escena', 'subescena', 'toma', 'acto']);
  /* Los beats del guion: [{ desde, hasta (bloques, desde 1), segundos, escena, acto, texto, parte? }]; un diálogo (personaje,
     paréntesis y lo dicho) es un beat. `escenas`: [{ n, titulo, acto, desde, hasta }]. */
  function beatsDeGuion(html) {
    const bs = V().bloques(html), beats = [], escenas = [];
    let acto = null, escena = null, pendiente = null;          // `pendiente`: el primer bloque de encabezados que van con el beat siguiente
    const nuevaEscena = (titulo, i) => { escena = { n: escenas.length + 1, titulo, acto, desde: i + 1, hasta: i + 1 }; escenas.push(escena); };
    const poner = (desde, hasta, s, texto) => {
      if (!escena) nuevaEscena('', (pendiente || desde) - 1);
      beats.push({ desde: pendiente || desde, hasta, segundos: s, escena: escena.n, acto, texto });
      pendiente = null; escena.hasta = hasta;
    };
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.tipo === 'portada' || (b.tipo !== 'doble' && b.tipo !== 'separador' && b.tipo !== 'otro' && !String(b.texto || b.md || '').trim())) continue;
      if (b.tipo === 'acto') { acto = String(b.texto).trim(); escena = null; pendiente = pendiente || i + 1; continue; }
      if (b.tipo === 'escena') { nuevaEscena(String(b.texto).trim(), i); pendiente = pendiente || i + 1; continue; }   // lo de antes (un # ACTO, un recuadro) va con ella
      if (ENCABEZADO.has(b.tipo) || ['nota', 'otro', 'separador', 'recuadro'].includes(b.tipo)) { if (!pendiente) pendiente = i + 1; if (escena) escena.hasta = i + 1; continue; }   // un prompt o un aviso tampoco suman
      if (b.tipo === 'transicion' && beats.length && escena) {  // va con lo anterior
        const u = beats[beats.length - 1]; if (u.escena === escena.n) { u.hasta = i + 1; u.segundos += SEG_TRANSICION; escena.hasta = i + 1; continue; }
      }
      if (b.tipo === 'personaje') {
        let j = i, s = 0, dicho = [];
        while (j + 1 < bs.length && ['parentesis', 'dialogo'].includes(bs[j + 1].tipo)) { j++; if (bs[j].tipo === 'dialogo') { s += segundosBloque(bs[j]); dicho.push(bs[j].texto); } }
        poner(i + 1, j + 1, s + PAUSA_DIALOGO, dicho.join(' '));
        i = j; continue;
      }
      poner(i + 1, i + 1, segundosBloque(b), b.tipo === 'lista' ? b.md : b.texto || '');
    }
    return { bloques: bs, beats, escenas };
  }
  /* Parte los beats más largos que el máximo por oraciones (cada trozo, su parte de los segundos). */
  function trocear(beats, max) {
    const out = [];
    beats.forEach(b => {
      if (b.segundos <= max) { out.push(b); return; }
      const os = oraciones(b.texto), total = os.reduce((s, o) => s + Math.max(1, palabrasDe(o)), 0);
      if (os.length < 2) { out.push(Object.assign({}, b, { largo: true })); return; }
      const trozos = [];
      let trozo = [], sT = 0;
      const cerrar = () => { if (trozo.length) trozos.push(Object.assign({}, b, { segundos: sT, texto: trozo.join(' ') })); trozo = []; sT = 0; };
      os.forEach(o => { const s = b.segundos * Math.max(1, palabrasDe(o)) / total; if (trozo.length && sT + s > max) cerrar(); trozo.push(o); sT += s; });
      cerrar();
      trozos.forEach((x, k) => { if (trozos.length > 1) x.parte = (k + 1) + '/' + trozos.length; if (x.segundos > max) x.largo = true; out.push(x); });
    });
    return out;
  }
  /* Los cortes: por escena, se llena cada fragmento hasta el máximo; el último, si es corto y cabe, se une al anterior. */
  function empaquetar(beats, max, min) {
    const frags = [];
    let actual = null;
    beats.forEach(b => {
      if (!actual || actual.escena !== b.escena || actual.segundos + b.segundos > max) { actual = { escena: b.escena, acto: b.acto, beats: [], segundos: 0 }; frags.push(actual); }
      actual.beats.push(b); actual.segundos += b.segundos;
    });
    for (let i = frags.length - 1; i > 0; i--) {
      const f = frags[i], a = frags[i - 1];
      if (f.segundos < min && a.escena === f.escena && a.segundos + f.segundos <= max) { a.beats.push(...f.beats); a.segundos += f.segundos; frags.splice(i, 1); }
    }
    frags.forEach(f => { f.desde = Math.min(...f.beats.map(b => b.desde)); f.hasta = Math.max(...f.beats.map(b => b.hasta)); });
    return frags;
  }
  /* Los nodos del esquema en el orden del tiempo (columna y, dentro, de arriba abajo), sin tramas ocultas ni lo descartado; un salto,
     una vez (su extremo de salida). */
  function nodosEnOrden(m) {
    const d = m.datos, fila = id => d.lineas.findIndex(l => l.id === id), vistos = new Set(), res = [];
    d.puntos.slice().sort((p, q) => m.cg(p) - m.cg(q) || fila(p.lineaId) - fila(q.lineaId)).forEach(p => {
      if (vistos.has(p.id)) return;
      const l = m.linea(p.lineaId); if (!l || l.oculta || l.cortada || p.cortado) return;
      const s = m.saltoDe(p.id); if (s) { vistos.add(s.deId); vistos.add(s.aId); const a = m.punto(s.deId); if (a) res.push(a); return; }
      vistos.add(p.id); res.push(p);
    });
    return res;
  }
  /* Qué nodos van con cada escena del guion (ver arriba): { porEscena: Map(n → [{ id, bloque?, como }]), como } */
  function nodosDeEscenas(m, eid, bs, escenas) {
    const nodos = nodosEnOrden(m), porEscena = new Map(escenas.map(e => [e.n, []])), ids = new Set(m.datos.puntos.map(p => p.id));
    const escenaDe = i => escenas.find(e => i + 1 >= e.desde && i + 1 <= e.hasta);
    const poner = (e, id, bloque, como) => { if (!e) return; const l = porEscena.get(e.n); if (!l.some(x => x.id === id)) l.push({ id, bloque, como }); };
    let usados = 0;
    /* los enlaces clapcraft:// a nodos de este esquema que lleve el texto */
    if (C.enlaces) bs.forEach((b, i) => C.enlaces.extraer(b.html).forEach(u => { const x = C.enlaces.leer(u); if (x && x.tipo === 'nodo' && x.esquema === eid && ids.has(x.id)) { poner(escenaDe(i), x.id, i + 1, 'enlace'); usados++; } }));
    /* los títulos de nodo que nombra (de cuatro letras o más, sin mayúsculas ni acentos) */
    nodos.forEach(p => {
      const t = plano(p.titulo); if (t.length < 4) return;
      const i = bs.findIndex(b => plano(V().textoPlano(b.html)).includes(t));
      if (i >= 0) { poner(escenaDe(i), p.id, i + 1, 'título'); usados++; }
    });
    if (!usados && nodos.length && nodos.length === escenas.length) { escenas.forEach((e, k) => poner(e, nodos[k].id, null, 'orden')); return { porEscena, como: 'orden' }; }
    return { porEscena, como: usados ? 'texto' : null };
  }
  function prepararFragmentos(ctx, args) {
    const docs = ctx.docs, r = esquemaDe(docs, args.esquema), m = modeloDe(docs, r), eid = r.esquema.id;
    const max = Math.max(3, Math.min(120, +args.segundos_max || 15)), min = Math.max(0, Math.min(max, args.segundos_min === undefined ? 4 : +args.segundos_min || 0));
    const doc = docs.documentoEsquema(eid), conGuion = !!(doc && V().palabras(doc.html));
    if (args.fuente === 'guion' && !conGuion) falla('El esquema ' + comillas(r.esquema.nombre) + ' aún no tiene guion escrito: usa fuente "esquema" (sus nodos) o escríbelo antes');
    /* un guion con palabras pero sin nada que dure (solo encabezados, notas o recuadros) no se puede medir: entonces, sus nodos */
    const g = conGuion && args.fuente !== 'esquema' ? beatsDeGuion(doc.html) : null, medible = !!(g && g.beats.length);
    if (args.fuente === 'guion' && !medible) falla('El guion de ' + comillas(r.esquema.nombre) + ' no tiene nada que medir (solo encabezados, notas o recuadros): usa fuente "esquema" (sus nodos) o escríbelo antes');
    const fuente = medible ? 'guion' : 'esquema';
    const nomNodo = id => { const p = m.punto(id); return id + (p && p.titulo ? ' ' + comillas(p.titulo) : ''); };
    const enlaceNodo = id => enlaceDe(ctx, { tipo: 'nodo', esquema: eid, id });
    let frags = [], escenas = [], como = null;
    if (fuente === 'guion') {
      escenas = g.escenas;
      frags = empaquetar(trocear(g.beats, max), max, min);
      const a = nodosDeEscenas(m, eid, g.bloques, escenas); como = a.como;
      /* los nodos de un fragmento: los de su escena que caen en sus bloques (uno que cae fuera de todos, al último de su escena) y
         los que no tienen bloque (por orden), en todos los de su escena */
      frags.forEach(f => { f.nodos = []; });
      escenas.forEach(e => {
        const fs = frags.filter(f => f.escena === e.n); if (!fs.length) return;
        (a.porEscena.get(e.n) || []).forEach(x => (x.bloque ? [fs.find(f => x.bloque >= f.desde && x.bloque <= f.hasta) || fs[fs.length - 1]] : fs).forEach(f => { if (!f.nodos.includes(x.id)) f.nodos.push(x.id); }));
        /* un nodo sigue hasta que el guion nombra otro: los fragmentos sin ninguno, el último de los de antes en su escena */
        fs.forEach((f, i) => { if (!f.nodos.length && i && fs[i - 1].nodos.length) f.nodos = fs[i - 1].nodos.slice(-1); });
      });
      /* su texto, beat a beat; de un beat partido, lo de delante (personaje, paréntesis) y solo su trozo */
      const tx = (a, b) => (b >= a ? V().aTexto(doc.html, { modo: 'guion', numerar: true, desde: a, hasta: b }) : '');
      frags.forEach(f => { f.texto = f.beats.map(b => (b.parte ? [tx(b.desde, b.hasta - 1), '[' + b.hasta + ', parte ' + b.parte + '] ' + b.texto].filter(Boolean).join('\n') : tx(b.desde, b.hasta))).join('\n\n'); });
    } else {
      nodosEnOrden(m).forEach((p, k) => {
        const a = m.actoEn(m.cg(p)), t = [p.titulo, p.descripcion].filter(Boolean).join('. ');
        const s = Math.min(60, Math.max(3, palabrasDe(t) * SEG_PALABRA_NODO));
        escenas.push({ n: k + 1, titulo: p.titulo || '(sin título)', acto: a ? a.nombre : null, nodo: p.id });
        const beats = trocear([{ desde: 0, hasta: 0, segundos: s, escena: k + 1, acto: a ? a.nombre : null, texto: (p.descripcion ? String(p.descripcion) : p.titulo || '').replace(/\s*\n\s*/g, ' ') }], max);
        empaquetar(beats, max, min).forEach(f => { f.nodos = [p.id]; f.texto = beats.length > 1 ? f.beats.map(b => b.texto).join(' ') : (p.titulo || '') + (p.descripcion ? '\n' + p.descripcion : ''); frags.push(f); });
      });
      como = 'nodo';
    }
    /* el segmento de cada uno: el acto del guion (# ACTO) o, si no lo dice, el acto del esquema donde cae su primer nodo */
    const actoNodo = id => { const p = m.punto(id), a = p && m.actoEn(m.cg(p)); return a ? a.nombre : null; };
    const actoEscena = n => { const f = frags.find(x => x.escena === n && x.nodos.length); return f ? actoNodo(f.nodos[0]) : null; };
    frags.forEach((f, i) => { f.orden = i + 1; f.segundos = redondo(f.segundos); f.largo = f.beats.some(b => b.largo); f.segmento = f.acto || actoEscena(f.escena) || (i ? frags[i - 1].segmento : null); });
    const total = frags.reduce((s, f) => s + f.segundos, 0);
    /* por qué no del guion (cuando va por los nodos) */
    const queGuion = !doc ? '(aún no tiene guion)' : !conGuion ? '(su guion está vacío)' : args.fuente === 'esquema' ? '(pedido así; también tiene guion)'
      : '(su guion solo tiene encabezados, notas o recuadros: nada que medir)';
    const conectadas = docs.bibliotecasDe(eid), hechos = docs.fragmentosDe(eid);
    const L = ['FRAGMENTOS PROPUESTOS · esquema ' + comillas(r.esquema.nombre) + ' (' + eid + ') · ' + (fuente === 'guion' ? 'desde su guion ' + comillas(doc.titulo) + ' (nota ' + doc.id + ')' : 'desde sus nodos ' + queGuion)
      + ' · máximo ' + seg(max) + (min ? ', mínimo ' + seg(min) : ''),
      'Estimación (una guía, no un cronómetro: díselo a Leo si la duración importa): ' + (fuente === 'guion'
        ? 'diálogo a 2,5 palabras por segundo más 0,5 s por intervención; acción ≈ 1,1 s por renglón de guion (54 renglones = 1 página ≈ 1 minuto); transición 0,5 s; los encabezados no suman.'
        : 'sin guion que medir, cada nodo dura 0,4 s por palabra de su título y su descripción, entre 3 y 60 s (partido por oraciones si pasa del máximo): el guion la afina.'),
      'Total ≈ ' + duracion(total) + ' · ' + plural(frags.length, 'fragmento', 'fragmentos') + ' · ' + plural(escenas.length, fuente === 'guion' ? 'escena' : 'nodo', fuente === 'guion' ? 'escenas' : 'nodos')
        + (fuente === 'guion' ? ' · nodos asociados ' + (como === 'orden' ? 'por su orden (tantas escenas como nodos: compruébalo)' : como ? 'por los enlaces y los títulos que nombra el guion' : 'ninguno (el guion no nombra ningún nodo: di en el fragmento a qué nodos corresponde si lo sabes, o déjalo sin nodos)') : ''),
      conectadas.length ? 'Bibliotecas conectadas (ahí van las notas: un segmento por acto o secuencia, una nota por fragmento): ' + conectadas.map(x => comillas(x.sub.nombre) + ' (' + x.sub.id + ')').join(', ')
        : 'Aún no tiene ninguna biblioteca conectada: pregúntale a Leo cuál usar y conéctala con editar_proyecto › conectar { esquema, biblioteca } (o crea una con crear_biblioteca).',
      hechos.length ? 'Ya hay ' + plural(hechos.length, 'nota que es fragmento', 'notas que son fragmentos') + ' de este esquema: ' + hechos.slice(0, 20).map(n => comillas(n.titulo) + ' (' + n.id + (n.fragmento.orden ? ', nº ' + n.fragmento.orden : '') + ')').join(', ') + (hechos.length > 20 ? '…' : '') + ' — si se rehacen, cámbialas (escribir_documento, editar_nota) en lugar de duplicarlas.' : '',
      'Cada nota: editar_biblioteca › crear_nota { titulo, segmento, contenido (Markdown con ```prompt … ``` y ```aviso:note … ```), fragmento: { esquema: "' + eid + '", nodos: [...], segundos, orden' + (fuente === 'guion' ? ', bloques: [desde, hasta]' : '') + ' } }.'].filter(Boolean);
    L.push('');
    let segAntes;
    frags.forEach((f, i) => {
      if (!i || f.segmento !== segAntes) { segAntes = f.segmento; L.push('SEGMENTO ' + comillas(f.segmento || 'Secuencia')); }
      const e = escenas.find(x => x.n === f.escena) || {};
      L.push('  FRAGMENTO ' + f.orden + ' · ≈ ' + seg(f.segundos) + (f.largo ? ' (un beat de más de ' + seg(max) + ' sin oraciones donde cortar: pártelo a mano)' : '')
        + (fuente === 'guion' ? ' · escena ' + e.n + (e.titulo ? ' ' + comillas(e.titulo) : '') + ' · bloques ' + (f.desde === f.hasta ? f.desde : f.desde + '–' + f.hasta) : '')
        + ' · nodos: ' + (f.nodos.length ? f.nodos.map(nomNodo).join(', ') : 'ninguno'));
      const us = f.nodos.map(enlaceNodo).filter(Boolean); if (us.length) L.push('    enlaces: ' + us.join(' '));
      const partes = f.beats.filter(b => b.parte).map(b => b.parte); if (partes.length) L.push('    (lleva ' + (partes.length === 1 ? 'la parte ' + partes[0] : 'las partes ' + partes.join(', ')) + ' de un beat largo, cortado por oraciones)');
      String(f.texto || '').split('\n').forEach(l => L.push('    ' + l));
    });
    if (!frags.length) L.push('(no hay nada que partir: el esquema no tiene nodos' + (!doc ? ' ni guion' : !conGuion ? ' y su guion está vacío' : args.fuente === 'esquema' ? '; su guion, pídelo con fuente "guion"' : ' y su guion no tiene nada que medir') + ')');
    const datos = { esquema: eid, fuente, segundos_max: max, total: redondo(total), bibliotecas: conectadas.map(x => x.sub.id),
      fragmentos: frags.map(f => ({ orden: f.orden, segmento: f.segmento, escena: f.escena, segundos: f.segundos, nodos: f.nodos, ...(fuente === 'guion' ? { bloques: [f.desde, f.hasta] } : {}), ...(f.largo ? { largo: true } : {}) })) };
    if (args.formato === 'json') return { texto: JSON.stringify(datos, null, 1), datos };
    return { texto: L.join('\n'), datos };
  }

  /* ====================================================================
     Lienzos de nodos (1.1.58): leer, armar y ejecutar
     ==================================================================== */
  /* Leo, 27-09-2026: «un lienzo con nodos donde se conecten notas, notas con imágenes y esquemas; en lugar de generar videos,
     nosotros generamos guiones y también los partimos» (y «también déjame incluir segmentos y personajes»). ClapCraft no llama a
     ninguna IA: el ▶ de un nodo lo deja «pendiente» y **Claude lo ejecuta** desde aquí:
     · `leer_lienzo`: los nodos, los cables, el estado de cada operación y las pendientes en orden;
     · `ejecutar_nodo` (solo lectura): el **encargo** de una operación —tipo, instrucción, opciones, destino y el contenido de todas
       sus entradas ya resuelto, con las imágenes como contenido de imagen de MCP— y cómo escribir su salida;
     · Claude escribe la salida real con las herramientas de siempre (escribir_documento, editar_esquema, editar_biblioteca…) y
     · `completar_nodo` le dice al nodo qué salió (lo comprueba) o qué falló;
     · `editar_lienzo` arma el lienzo (entero o nada); `editar_proyecto` crea, renombra, mueve, duplica y tira lienzos.
     El modelo es `Claquedraw.Lienzo` (js/claquedraw/lienzo-modelo.js) y la pieza del árbol, documentos.js (`lienzo`, `guardarLienzo`). */
  const Lz = () => C.Lienzo;
  const ENTRADAS = ['texto', 'imagen', 'nota', 'segmento', 'biblioteca', 'esquema', 'personaje'];
  const OPERACIONES = ['generar', 'partir', 'escaleta', 'resumir', 'reescribir', 'traducir', 'prompt'];
  const NOMBRE_TIPO_L = { texto: 'Texto', imagen: 'Imagen', nota: 'Nota', segmento: 'Segmento', biblioteca: 'Biblioteca', esquema: 'Esquema', personaje: 'Personaje',
    generar: 'Generar guion', partir: 'Partir en fragmentos', escaleta: 'Sacar escaleta', resumir: 'Resumir', reescribir: 'Reescribir', traducir: 'Traducir', prompt: 'Instrucción libre' };
  /* lo que da cada operación (si el catálogo del modelo no lo dice) */
  const SALIDA_OP = { generar: ['documento'], partir: ['fragmentos'], escaleta: ['esquema'], resumir: ['nota', 'documento'], reescribir: ['nota', 'documento'], traducir: ['nota', 'documento'], prompt: ['nota', 'documento'] };
  const infoTipo = t => (Lz() && Lz().TIPOS && Lz().TIPOS[t]) || {};
  const nombreTipoL = t => infoTipo(t).nombre || NOMBRE_TIPO_L[t] || t;
  const esOp = n => { const f = infoTipo(n.tipo).familia; return f ? /^oper/.test(f) : OPERACIONES.includes(n.tipo); };
  const nombreNodoL = n => (n && String(n.titulo || '').trim() ? String(n.titulo).trim() : nombreTipoL(n && n.tipo));
  const tituloL = n => n.id + ' ' + comillas(nombreNodoL(n)) + (String(n.titulo || '').trim() && String(n.titulo).trim() !== nombreTipoL(n.tipo) ? ' (' + nombreTipoL(n.tipo).toLowerCase() + ')' : '');
  /* los puertos de entrada de un tipo: [{ id, nombre, uno }] (el catálogo los da en lista o por nombre) */
  function puertosDe(t) {
    const p = infoTipo(t).puertos || infoTipo(t).entradas;
    const norm = (x, k) => (typeof x === 'string' ? { id: x, nombre: x, uno: false }
      : { id: x.id || x.puerto || x.nombre || k, nombre: x.nombre || x.etiqueta || x.id || k, uno: !!(x.uno || x.max === 1 || x.cuantos === 'uno' || x.multiple === false), obligatorio: !!x.obligatorio });
    if (Array.isArray(p)) return p.map(x => norm(x));
    if (p && typeof p === 'object') return Object.keys(p).map(k => norm(Object.assign({ id: k }, typeof p[k] === 'object' ? p[k] : {}), k));
    return ({ generar: [{ id: 'contexto', nombre: 'contexto' }, { id: 'esquema', nombre: 'esquema', uno: true }], partir: [{ id: 'guion', nombre: 'guion', uno: true }, { id: 'contexto', nombre: 'contexto' }] })[t]
      || (OPERACIONES.includes(t) && t !== 'prompt' ? [{ id: 'fuente', nombre: 'fuente', uno: true }, { id: 'contexto', nombre: 'contexto' }] : t === 'prompt' ? [{ id: 'contexto', nombre: 'contexto' }] : []);
  }

  /* ---------- encontrar lienzos y sus nodos ---------- */
  const lienzosTodos = docs => docs.datos.contenedores.flatMap(c => (c.lienzos || []).map(l => ({ id: l.id, nombre: l.nombre, obj: { contenedor: c, lienzo: l } })));
  const lienzoDe = (docs, v) => encontrar(lienzosTodos(docs), v, 'el lienzo');
  function modeloLienzo(l, ctx) {
    if (!Lz()) falla('Esta versión de ClapCraft no trae los lienzos');
    /* con los ids y la hora del proyecto (documentos.js, `modeloLienzo`) si es suyo; si no, sobre una copia */
    const d = ctx && ctx.docs, r = d && d.lienzo && d.modeloLienzo ? d.lienzo(l.id) : null;
    const m = r && r.lienzo === l ? d.modeloLienzo(l.id) : new (Lz())(clonar(l), ctx && ctx.ahora ? { ahora: ctx.ahora } : undefined);
    m._lid = l.id; m._firma = ctx && firmaDe(ctx.docs);
    return m;
  }
  const datosL = m => (m.datos || m.toJSON());
  const nodosL = m => datosL(m).nodos || [];
  const cablesL = m => datosL(m).cables || [];
  const nodoL = (m, id) => (m.nodo ? m.nodo(id) : nodosL(m).find(n => n.id === id)) || null;
  function nodoLDe(m, v, refs) {
    if (esEnlace(v)) {
      const x = leerEnlace(v);
      if (x.tipo !== 'lienzo' || !x.nodo) falla('Ese enlace es de ' + deQue(x) + ', no de un nodo de un lienzo (' + x.url + ')');
      if (m._lid && x.id !== m._lid) falla('Ese enlace es de un nodo de otro lienzo (' + x.id + '), no del que se está leyendo o cambiando (' + m._lid + ')');
      const n = nodoL(m, x.nodo); if (!n) falla('Ese nodo ya no está en el lienzo (' + x.url + ')'); return n;
    }
    const id = refs && deRef(refs, v, 'nodo'); if (id) return nodoL(m, id);
    return encontrar(nodosL(m).map(n => ({ id: n.id, nombre: nombreNodoL(n), obj: n })), v, 'el nodo');
  }
  /* las entradas de un nodo por puerto, en el orden de sus puertos y, dentro, de arriba abajo: [{ puerto, nombre, uno, nodos: [n] }] */
  function entradasL(m, n) {
    const ps = puertosDe(n.tipo), cs = cablesL(m).filter(c => c.a === n.id), out = ps.map(p => Object.assign({}, p, { nodos: [] }));
    cs.forEach(c => {
      let p = out.find(x => x.id === c.puerto);
      if (!p) { p = { id: c.puerto, nombre: c.puerto, uno: false, nodos: [] }; out.push(p); }
      const de = nodoL(m, c.de); if (de) p.nodos.push(de);
    });
    out.forEach(p => p.nodos.sort((a, b) => (+a.y || 0) - (+b.y || 0) || (+a.x || 0) - (+b.x || 0)));
    return out;
  }
  const idsDe = l => (Array.isArray(l) ? l : []).map(x => (x && typeof x === 'object' ? x.id : x)).filter(Boolean);
  /* las operaciones pendientes, en el orden en que hay que ejecutarlas; y las desactualizadas */
  function pendientesL(m) {
    const ps = idsDe(m.pendientes ? m.pendientes() : nodosL(m).filter(n => n.estado === 'pendiente'));
    const orden = idsDe(m.orden ? m.orden() : []);
    return orden.length ? orden.filter(id => ps.includes(id)).concat(ps.filter(id => !orden.includes(id))) : ps;
  }
  /* la firma del contenido de lo que apunta una entrada (documentos.js): así una nota reescrita también desactualiza */
  const firmaDe = docs => (docs && docs.firmaEntrada ? n => docs.firmaEntrada(n) : undefined);
  const desactualizadasL = m => idsDe(m.desactualizadas ? m.desactualizadas(m._firma) : nodosL(m).filter(n => n.desactualizado));

  /* ---------- lo que apunta una entrada ---------- */
  function segmentoTexto(docs, d) {
    const r = docs.sub(d.subId); if (!r) return null;
    const e = d.etiquetaId ? docs.etiqueta(d.etiquetaId) : null;
    if (d.etiquetaId && !e) return null;
    return { sub: r.sub, contenedor: r.contenedor, etiqueta: e, notas: docs.notasDe(r.sub.id, e ? e.id : null), nombre: (e ? 'segmento ' + comillas(e.nombre) : 'la bandeja (notas sin segmento)') + ' de ' + comillas(r.sub.nombre) };
  }
  const papeleraDe = (docs, id) => (docs.enPapelera && docs.enPapelera(id)) || (docs.piezaEnPapelera && docs.piezaEnPapelera(id)) ? ' (está en la papelera)' : '';
  /* una línea: qué es la entrada y a qué apunta; `roto` si ya no está */
  function apuntaA(docs, n) {
    const d = n.datos || {};
    switch (n.tipo) {
      case 'texto': { const t = String(d.md || d.texto || '').trim(); return { texto: t ? 'texto: ' + comillas(corto(t, 140)) : 'texto vacío' }; }
      case 'imagen': return /^data:image\//i.test(String(d.src || '')) ? { texto: 'una imagen' + (d.alt ? ' (' + comillas(corto(d.alt, 80)) + ')' : '') } : { texto: 'sin imagen', roto: true };
      case 'nota': { const x = d.notaId && docs.nota(d.notaId); return x ? { texto: 'nota ' + x.id + ' ' + comillas(x.titulo) + ' (' + lugarDeNota(docs, x) + ')' } : { texto: 'nota ' + (d.notaId || '?') + ' ROTA: ya no está' + papeleraDe(docs, d.notaId), roto: true }; }
      case 'segmento': { const s = segmentoTexto(docs, d); return s ? { texto: s.nombre + ' (' + s.sub.id + ') · ' + plural(s.notas.length, 'nota', 'notas') } : { texto: 'segmento ROTO: ya no está', roto: true }; }
      case 'biblioteca': { const r = d.subId && docs.sub(d.subId); return r ? { texto: 'biblioteca ' + r.sub.id + ' ' + comillas(r.sub.nombre) + ' · ' + plural(docs.etiquetasDe(r.sub.id).length, 'segmento', 'segmentos') + ' · ' + plural(docs.notasDe(r.sub.id).length, 'nota', 'notas') } : { texto: 'biblioteca ' + (d.subId || '?') + ' ROTA: ya no está' + papeleraDe(docs, d.subId), roto: true }; }
      case 'esquema': { const r = d.eid && docs.esquema(d.eid); return r ? { texto: 'esquema ' + r.esquema.id + ' ' + comillas(r.esquema.nombre) + ' · ' + cuentaEsquema(docs, r.esquema) } : { texto: 'esquema ' + (d.eid || '?') + ' ROTO: ya no está' + papeleraDe(docs, d.eid), roto: true }; }
      case 'personaje': { const p = d.personajeId && docs.personaje(d.personajeId); return p ? { texto: 'personaje ' + p.id + ' ' + comillas(p.nombre) } : { texto: 'personaje ' + (d.personajeId || '?') + ' ROTO: ya no está' + papeleraDe(docs, d.personajeId), roto: true }; }
    }
    return { texto: n.tipo };
  }
  function destinoTexto(docs, n) {
    const d = (n.datos || {}).destino;
    if (!d || typeof d !== 'object' || !Object.keys(d).length) return 'sin destino (pregúntale a Leo dónde lo quiere, o propónselo)';
    if (d.enSitio || d.sitio || d.en_sitio) return 'en su sitio: una versión nueva del documento de la fuente';
    if (d.eid) { const r = docs.esquema(d.eid); return r ? 'el documento (guion) del esquema ' + comillas(r.esquema.nombre) + ' (' + d.eid + ')' : 'el esquema ' + d.eid + ', que YA NO ESTÁ'; }
    if (d.subId) {
      const r = docs.sub(d.subId), e = d.etiquetaId && docs.etiqueta(d.etiquetaId);
      return r ? 'la biblioteca ' + comillas(r.sub.nombre) + ' (' + d.subId + ')' + (e ? ' › segmento ' + comillas(e.nombre) + ' (' + e.id + ')' : '') : 'la biblioteca ' + d.subId + ', que YA NO ESTÁ';
    }
    if (d.nuevo) {
      const c = d.nuevo.cid && docs.contenedor(d.nuevo.cid), que = n.tipo === 'partir' ? 'una biblioteca nueva' : ['generar', 'escaleta'].includes(n.tipo) ? 'un esquema nuevo' : 'uno nuevo';
      return que + (d.nuevo.nombre ? ' ' + comillas(d.nuevo.nombre) : '') + (c ? ' en el contenedor ' + comillas(c.nombre) + ' (' + c.id + ')' : d.nuevo.cid ? ' en el contenedor ' + d.nuevo.cid + ', que YA NO ESTÁ' : '');
    }
    return JSON.stringify(d);
  }
  function salidaTexto(docs, s) {
    if (!s || typeof s !== 'object') return '';
    if (s.tipo === 'documento') { const r = docs.esquema(s.eid), n = r && docs.documentoEsquema(s.eid); return r ? 'el guion de ' + comillas(r.esquema.nombre) + ' (esquema ' + s.eid + (n ? ', ' + miles(V().palabras(n.html)) + ' palabras' : ', sin documento') + ')' : 'el guion del esquema ' + s.eid + ', que YA NO ESTÁ'; }
    if (s.tipo === 'nota') { const x = docs.nota(s.notaId); return x ? 'la nota ' + x.id + ' ' + comillas(x.titulo) + ' (' + lugarDeNota(docs, x) + ')' : 'la nota ' + s.notaId + ', que YA NO ESTÁ'; }
    if (s.tipo === 'fragmentos') { const r = docs.sub(s.subId), ns = (s.notas || []).filter(id => docs.nota(id)); return (r ? plural(ns.length, 'fragmento', 'fragmentos') + ' en ' + comillas(r.sub.nombre) + ' (' + s.subId + ')' : 'fragmentos en la biblioteca ' + s.subId + ', que YA NO ESTÁ') + (s.eid && docs.esquema(s.eid) ? ' de ' + comillas(docs.esquema(s.eid).esquema.nombre) : ''); }
    if (s.tipo === 'esquema') { const r = docs.esquema(s.eid); return r ? 'el esquema ' + comillas(r.esquema.nombre) + ' (' + s.eid + ')' : 'el esquema ' + s.eid + ', que YA NO ESTÁ'; }
    return JSON.stringify(s);
  }
  const ESTADO = { nuevo: 'sin ejecutar', pendiente: 'PENDIENTE', hecho: 'hecho', error: 'ERROR' };
  /* **Las fórmulas de una operación** (1.1.60): `datos.formulas = [notaId…]`, en orden. Resueltas (documentos.js, `resolverFormulas`):
     [{ id, titulo, texto, segmento }] o, la que ya no está (o ya no es una fórmula), { id, rota: true, titulo?, motivo?, papelera }. */
  function formulasNodo(docs, n) {
    const ids = Array.isArray((n.datos || {}).formulas) ? n.datos.formulas : [];
    const res = docs.resolverFormulas ? docs.resolverFormulas(ids) : ids.map(id => {
      const x = docs.nota ? docs.nota(id) : null;
      return x && esFormulaN(docs, x) ? { id, titulo: x.titulo, texto: textoFormula(docs, x), etiquetaId: x.etiquetaId || null } : { id, rota: true, enPapelera: !!(docs.enPapelera && docs.enPapelera(id)) };
    });
    return res.map(f => {
      if (f.rota) return { id: f.id, rota: true, titulo: f.titulo || null, motivo: f.motivo || null, papelera: !!f.enPapelera };
      const e = f.etiquetaId && docs.etiqueta(f.etiquetaId);
      return { id: f.id, titulo: f.titulo, texto: f.texto, segmento: e ? e.nombre : null };
    });
  }
  const formulaTexto = f => (!f.rota ? comillas(f.titulo) + ' (' + f.id + ')'
    : f.id + (f.titulo ? ' ' + comillas(f.titulo) : '') + ' ROTA: ' + (f.papelera ? 'está en la papelera' : /ya no es una fórmula/.test(f.motivo || '') ? 'ya no es una fórmula' : 'ya no está'));
  /* **Los duendes de una operación** (1.1.68, Leo: «Que los duendes se puedan seleccionar en los bloques de IA del lienzo para
     salidas con la personalidad del duende»): `datos.duendes = [instantánea…]`, en orden (lienzo-modelo.js, `sanearDuende`): la
     copia de la ficha de cada duende especial al elegirlo { id, nombre, personalidad, rol, veto, modelo, temperatura, voz, fijadaEn },
     así su personalidad no cambia aunque Leo edite después el duende. */
  const duendesNodo = n => (Array.isArray((n && n.datos || {}).duendes) ? n.datos.duendes : []);
  const rolDuende = x => (x.rol === 'transformar' ? 'transforma el texto' : x.veto ? 'revisa y puede vetar' : 'revisa');
  const duendeTexto = x => comillas(x.nombre) + ' (' + x.id + ', ' + rolDuende(x) + ')';
  /* los especiales del equipo de Leo, si el contexto lo da (`ctx.equipo`: el equipo o una función que lo da; la app, no Claude por MCP) */
  function especialesCtx(ctx) {
    let eq = ctx && ctx.equipo; try { if (typeof eq === 'function') eq = eq(); } catch (_) { eq = null; }
    if (!eq || !Array.isArray(eq.duendes)) return [];
    return C.equipo && C.equipo.especiales ? C.equipo.especiales(eq) : eq.duendes.filter(d => d && d.papel === 'especial');
  }
  const CAMPOS_DUENDE = ['id', 'nombre', 'personalidad', 'rol', 'veto', 'modelo', 'temperatura', 'voz', 'fijadaEn'];
  /* `duendes` de editar_lienzo: instantáneas { id, nombre, personalidad, rol: revisar|transformar, veto?, modelo?, temperatura?, voz? }
     (se validan y se dejan en texto plano: sin HTML, recortadas; su aspecto y lo que no es de una instantánea no pasan) o, por su id
     o su nombre, uno ya elegido en ese nodo o uno de los especiales de Leo si el contexto los da. [] o null los quita. */
  function duendesL(ctx, v, previo) {
    const Lm = Lz(); if (!Lm || !Lm.sanearDuende) falla('Este ClapCraft no conoce los duendes del lienzo');
    const antes = duendesNodo({ datos: previo || {} }), esp = especialesCtx(ctx), res = [], ahora = Date.now();
    const snap = e => Lm.sanearDuende(Object.assign({}, C.equipo && C.equipo.instantanea ? C.equipo.instantanea(e) || e : e, { fijadaEn: ahora }));
    lista(v === false ? null : v).forEach(x => {
      let d = null;
      if (typeof x === 'string' && x.trim()) {
        const s = x.trim(), p = plano(s);
        d = antes.find(y => y.id === s.toLowerCase() || plano(y.nombre) === p) || null;
        if (!d) { const e = esp.find(y => y.id === s.toLowerCase() || plano(y.nombre) === p); if (e) d = snap(e); }
        if (!d) falla('No conozco el duende ' + comillas(s) + (esp.length ? '. Los especiales de Leo: ' + esp.map(y => comillas(y.nombre) + ' (' + y.id + ')').join(', ')
          : ': da su instantánea { id, nombre, personalidad, rol } (por su id o su nombre solo valen los que ya tiene el nodo)'));
      } else if (x && typeof x === 'object' && !Array.isArray(x)) {
        if (typeof x.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(x.id.trim())) falla('Cada duende necesita su "id" (letras, números, - y _)');
        if (['maestro', 'lector', 'escritor', 'coordinador'].includes(x.id.trim().toLowerCase())) falla(comillas(x.id) + ' es un duende fijo del equipo: aquí solo van los especiales');
        if (typeof x.nombre !== 'string' || !x.nombre.replace(/<[^>]*>/g, '').trim()) falla('El duende ' + comillas(x.id) + ' necesita su "nombre"');
        if (x.personalidad !== undefined && x.personalidad !== null && typeof x.personalidad !== 'string') falla('La "personalidad" de ' + comillas(x.nombre) + ' es un texto');
        if (x.rol !== undefined && !['revisar', 'transformar'].includes(x.rol)) falla('rol de ' + comillas(x.nombre) + ': revisar o transformar');
        const limpio = {}; CAMPOS_DUENDE.forEach(k => { if (x[k] !== undefined) limpio[k] = x[k]; });
        d = Lm.sanearDuende(Object.assign(limpio, { fijadaEn: +x.fijadaEn > 0 ? +x.fijadaEn : ahora }));
        if (!d) falla('El duende ' + comillas(x.nombre) + ' no vale');
      } else falla('Cada duende es su instantánea { id, nombre, personalidad, rol } o el id o el nombre de uno ya elegido');
      if (!res.some(y => y.id === d.id)) res.push(d);
    });
    if (res.length > (Lm.MAX_DUENDES || 6)) falla('Como mucho ' + (Lm.MAX_DUENDES || 6) + ' duendes por operación');
    return res;
  }
  /* Cómo se combinan (lo mismo en ClapCraft, en el asistente y en el encargo copiado): documentos.js, `instruccionCompuesta`, con
     `C.formulas.componer` (js/claquedraw/formulas.js): las fórmulas en orden, cada una con su título; lo escrito en «Qué escribir» va
     donde una diga {{instruccion}} y, si ninguna lo dice, detrás como «Instrucción de Leo». → { texto, partes, rotas, hueco } */
  const componerFormulas = (docs, n, fs) => (docs.instruccionCompuesta ? docs.instruccionCompuesta(n)
    : Fm().componer(fs.map(f => (f.rota ? { id: f.id, rota: true } : { id: f.id, titulo: f.titulo, texto: f.texto })), (n.datos || {}).instruccion));
  function opcionesTexto(n) {
    const d = n.datos || {}, o = [];
    if (d.modo) o.push('modo ' + d.modo);
    if (d.segundos_max) o.push('fragmentos de ' + d.segundos_max + ' s como mucho');
    if (d.tono) o.push('tono ' + comillas(d.tono));
    if (d.idioma) o.push('idioma ' + comillas(d.idioma));
    return o.join(' · ');
  }

  /* ---------- leer_lienzo ---------- */
  function lineasNodoL(docs, m, n, desact) {
    const L = [], d = n.datos || {};
    if (!esOp(n)) { const a = apuntaA(docs, n); L.push('- ' + tituloL(n) + ' · ENTRADA · ' + a.texto); return L; }
    L.push('- ' + tituloL(n) + ' · OPERACIÓN ' + nombreTipoL(n.tipo).toLowerCase() + ' · ' + (ESTADO[n.estado] || ESTADO.nuevo)
      + (n.estado === 'pendiente' && n.pedido ? ' desde ' + fecha(n.pedido) : '') + (n.estado === 'hecho' && n.hecho ? ' ' + fecha(n.hecho) : '') + (desact.includes(n.id) ? ' · DESACTUALIZADA (cambió algo de lo que entra)' : ''));
    if (d.instruccion) L.push('    instrucción: ' + String(d.instruccion).trim().replace(/\s*\n\s*/g, ' / '));
    const fs = formulasNodo(docs, n);
    if (fs.length) L.push('    fórmulas (en orden): ' + fs.map(formulaTexto).join(', '));
    const ds = duendesNodo(n);
    if (ds.length) L.push('    duendes (en orden, con la personalidad de cuando se eligieron): ' + ds.map(duendeTexto).join(', '));
    const op = opcionesTexto(n); if (op) L.push('    opciones: ' + op);
    L.push('    destino: ' + destinoTexto(docs, n));
    entradasL(m, n).forEach(p => L.push('    ← ' + p.nombre + (p.uno ? ' (una)' : '') + ': ' + (p.nodos.length ? p.nodos.map(x => x.id + ' ' + comillas(nombreNodoL(x))).join(', ') : 'nada')));
    if (n.estado === 'hecho' && n.salida) L.push('    salida: ' + salidaTexto(docs, n.salida));
    if (n.estado === 'error' && n.error) L.push('    error: ' + n.error);
    return L;
  }
  function textoLienzo(ctx, r, m) {
    const docs = ctx.docs, l = r.lienzo, ns = nodosL(m), cs = cablesL(m), pend = pendientesL(m), desact = desactualizadasL(m);
    const L = ['LIENZO ' + comillas(l.nombre) + ' · id ' + l.id + (r.contenedor && !r.contenedor.oculto ? ' · contenedor ' + comillas(r.contenedor.nombre) : '')
      + ' · ' + plural(ns.length, 'nodo', 'nodos') + ' · ' + plural(cs.length, 'cable', 'cables')];
    L.push(pend.length ? 'PENDIENTES, en el orden en que se ejecutan: ' + pend.map(id => tituloL(nodoL(m, id))).join(' → ') + '. Cada una: ejecutar_nodo → escribir la salida → completar_nodo.' : 'Sin operaciones pendientes.');
    if (desact.length) L.push('DESACTUALIZADAS (hechas, pero luego cambió lo que entra): ' + desact.map(id => tituloL(nodoL(m, id))).join(', ') + '. Se rehacen solo si Leo lo pide.');
    const ents = ns.filter(n => !esOp(n)), ops = ns.filter(esOp);
    const orden = idsDe(m.orden ? m.orden() : []);
    ops.sort((a, b) => (orden.indexOf(a.id) + 1 || 1e9) - (orden.indexOf(b.id) + 1 || 1e9) || (+a.x || 0) - (+b.x || 0));
    ents.sort((a, b) => (+a.x || 0) - (+b.x || 0) || (+a.y || 0) - (+b.y || 0));
    L.push('', 'ENTRADAS');
    if (!ents.length) L.push('- (ninguna)');
    ents.forEach(n => lineasNodoL(docs, m, n, desact).forEach(x => L.push(x)));
    L.push('', 'OPERACIONES (en orden)');
    if (!ops.length) L.push('- (ninguna)');
    ops.forEach(n => lineasNodoL(docs, m, n, desact).forEach(x => L.push(x)));
    L.push('', 'CABLES');
    if (!cs.length) L.push('- (ninguno)');
    cs.forEach(c => { const a = nodoL(m, c.de), b = nodoL(m, c.a); L.push('- ' + c.id + ': ' + (a ? a.id + ' ' + comillas(nombreNodoL(a)) : c.de) + ' → ' + (b ? b.id + ' ' + comillas(nombreNodoL(b)) : c.a) + ' (' + c.puerto + ')'); });
    const u = enlaceDe(ctx, { tipo: 'lienzo', id: l.id });
    if (u) L.push('', 'Enlace: ' + u + ' (de un nodo: ' + u + '/nodo/<id>)');
    return L.join('\n');
  }
  function leerLienzo(ctx, args) {
    const r = lienzoDe(ctx.docs, args.lienzo), m = modeloLienzo(r.lienzo, ctx);
    if (args.formato === 'json') return { texto: JSON.stringify(datosL(m), (k, v) => (k === 'src' && typeof v === 'string' && v.length > 200 ? v.slice(0, 60) + '…(' + v.length + ' caracteres)' : v), 1) };
    return { texto: textoLienzo(ctx, r, m) };
  }

  /* ---------- ejecutar_nodo: el encargo de una operación ---------- */
  const MAX_IMAGENES = 8;                                        // lo que va como imagen en una respuesta (claude/imagenes.js las reduce a 1024 px)
  const DATA_IMG = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
  /* recoge las imágenes de un HTML (en orden) y dice cuáles van: [texto por imagen] */
  function recogerImagenes(html, donde, imgs) {
    const out = [];
    V().bloques(html).forEach((b, i) => {
      (String(b.html).match(/<img\b[^>]*>/gi) || []).forEach(tag => {
        const src = (/\bsrc\s*=\s*"([^"]*)"/i.exec(tag) || /\bsrc\s*=\s*'([^']*)'/i.exec(tag) || [])[1] || '';
        const alt = ((/\balt\s*=\s*"([^"]*)"/i.exec(tag) || [])[1] || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        out.push(ponerImagen(src, alt, donde + ', bloque ' + (i + 1), imgs));
      });
    });
    return out;
  }
  function ponerImagen(src, alt, donde, imgs) {
    const x = DATA_IMG.exec(String(src || '').trim());
    if (!x) return 'una imagen que no va incrustada (' + donde + ')';
    if (imgs.lista.length >= MAX_IMAGENES) { imgs.fuera++; return 'imagen sin enviar (' + donde + '): tope de ' + MAX_IMAGENES + ' por encargo'; }
    const datos = x[2].replace(/\s+/g, ''), ya = imgs.lista.findIndex(i => i.data === datos);   // la misma imagen no va dos veces
    if (ya >= 0) return 'IMAGEN ' + (ya + 1) + ' (' + donde + ': la misma que ya va adjunta)';
    const k = imgs.lista.length + 1, mime = x[1].toLowerCase().replace('image/jpg', 'image/jpeg');
    imgs.lista.push({ data: datos, mimeType: mime, nombre: 'imagen ' + k + ' (' + donde + ')' });
    return 'IMAGEN ' + k + ' (' + donde + ')' + (alt ? ' · descripción: ' + comillas(alt) : '') + ' → va adjunta';
  }
  const sangrar = (t, p) => String(t || '').split('\n').map(x => p + x).join('\n');
  /* el texto de una nota o documento, con sus imágenes */
  function textoNotaL(docs, n, imgs, pre) {
    const L = [], como = V().esGuion(n.html) ? 'guion' : 'prosa';
    L.push(pre + 'Texto (' + como + ', ' + miles(V().palabras(n.html)) + ' palabras):');
    L.push(sangrar(V().aTexto(n.html, { modo: como }) || '(vacía)', pre + '  │ '));
    const im = recogerImagenes(n.html, 'nota ' + comillas(corto(n.titulo, 40)), imgs);
    im.forEach(t => L.push(pre + '  ' + t));
    return L;
  }
  const MAX_PALABRAS_BIB = 8000;                                 // una biblioteca más larga entra resumida (cada nota, un extracto)
  /* unas notas (un segmento, la bandeja, la hoja de un personaje, los fragmentos de un `partir`) con el mismo tope que una
     biblioteca: si juntas pasan de MAX_PALABRAS_BIB, cada una entra con un extracto (y sin sus imágenes) y se dice */
  function notasConTope(docs, notas, imgs, pre, op) {
    const conImg = !!(op && op.conImagenes);          // la hoja de un personaje (duende_personaje › ver): sus imágenes van siempre
    const L = [], total = notas.reduce((k, x) => k + V().palabras(x.html), 0), enteras = total <= MAX_PALABRAS_BIB;
    notas.forEach(x => {
      L.push(pre + 'NOTA ' + x.id + ' ' + comillas(x.titulo) + fragmentoTexto(docs, x));
      if (enteras) { textoNotaL(docs, x, imgs, pre + '  ').forEach(y => L.push(y)); return; }
      const t = V().aTexto(x.html, { modo: V().esGuion(x.html) ? 'guion' : 'prosa' }).replace(/\s+/g, ' ').trim();
      L.push(pre + '  Extracto (' + miles(V().palabras(x.html)) + ' palabras): ' + (t ? corto(t, 280) : '(vacía)'));
      if (conImg) recogerImagenes(x.html, 'nota ' + comillas(corto(x.titulo, 40)), imgs).forEach(y => L.push(pre + '    ' + y));
    });
    if (!enteras) L.push(pre + '(Juntas tienen ' + miles(total) + ' palabras: van resumidas, cada nota un extracto' + (conImg ? '' : ' y sin sus imágenes') + '. La que haga falta entera: leer_documento { nota }.)');
    return L;
  }
  /* el contenido de lo que entra por un cable */
  function contenidoEntrada(ctx, m, n, imgs) {
    const docs = ctx.docs, d = n.datos || {}, L = [], P = '    ';
    const cab = t => L.push('  [' + n.id + '] ' + t);
    if (esOp(n)) {
      if (n.estado !== 'hecho' || !n.salida) { cab(nombreTipoL(n.tipo) + ' ' + comillas(nombreNodoL(n)) + ' — AÚN NO TIENE SALIDA (' + (ESTADO[n.estado] || ESTADO.nuevo) + '): ejecútala antes (ejecutar_nodo { nodo: "' + n.id + '" })'); return L; }
      const s = n.salida;
      cab('La salida de ' + comillas(nombreNodoL(n)) + ': ' + salidaTexto(docs, s) + (desactualizadasL(m).includes(n.id) ? ' (OJO: esa operación está desactualizada)' : ''));
      if (s.tipo === 'documento') { const doc = docs.esquema(s.eid) && docs.documentoEsquema(s.eid); if (doc) textoNotaL(docs, doc, imgs, P).forEach(x => L.push(x)); }
      else if (s.tipo === 'nota') { const x = docs.nota(s.notaId); if (x) textoNotaL(docs, x, imgs, P).forEach(y => L.push(y)); }
      else if (s.tipo === 'esquema') { const r = docs.esquema(s.eid); if (r) L.push(sangrar(textoEsquema(docs, r, modeloDe(docs, r)), P)); }
      else if (s.tipo === 'fragmentos') notasConTope(docs, (s.notas || []).map(id => docs.nota(id)).filter(Boolean), imgs, P).forEach(x => L.push(x));
      return L;
    }
    const a = apuntaA(docs, n);
    cab(nombreTipoL(n.tipo) + (String(n.titulo || '').trim() ? ' ' + comillas(n.titulo.trim()) : '') + ' · ' + a.texto);
    if (a.roto) { L.push(P + '(Lo que apuntaba ya no está: díselo a Leo; no lo inventes.)'); return L; }
    switch (n.tipo) {
      case 'texto': L.push(sangrar(String(d.md || d.texto || '').trim() || '(vacío)', P + '│ ')); break;
      case 'imagen': L.push(P + ponerImagen(d.src, d.alt, 'nodo de imagen ' + n.id, imgs)); break;
      case 'nota': textoNotaL(docs, docs.nota(d.notaId), imgs, P).forEach(x => L.push(x)); break;
      case 'segmento': {
        const s = segmentoTexto(docs, d);
        notasConTope(docs, s.notas, imgs, P).forEach(x => L.push(x));
        if (!s.notas.length) L.push(P + '(sin notas)');
        break;
      }
      case 'biblioteca': {
        const total = docs.notasDe(d.subId).reduce((k, x) => k + V().palabras(x.html), 0), entera = total <= MAX_PALABRAS_BIB;
        L.push(sangrar(leerBiblioteca(ctx, { biblioteca: d.subId, contenido: entera }).texto, P));
        if (!entera) L.push(P + '(Tiene ' + miles(total) + ' palabras: va resumida. La nota que haga falta entera: leer_documento { nota }.)');
        break;
      }
      case 'esquema': {
        const r = docs.esquema(d.eid), doc = docs.documentoEsquema(d.eid);
        L.push(P + 'ESTRUCTURA:'); L.push(sangrar(textoEsquema(docs, r, modeloDe(docs, r)), P + '  '));
        if (doc && V().palabras(doc.html)) { L.push(P + 'GUION (su documento, nota ' + doc.id + '):'); textoNotaL(docs, doc, imgs, P + '  ').forEach(x => L.push(x)); }
        else L.push(P + 'GUION: aún no tiene (o está vacío).');
        break;
      }
      case 'personaje': {
        const p = docs.personaje(d.personajeId);
        textoPersonaje(docs, p).forEach(x => L.push(P + x));
        /* su hoja es su biblioteca entera, «Hoja de personaje» primero (la misma que ve la interfaz y la firma: hojaPersonaje) */
        const h = docs.hojaPersonaje(p.id), ns = h.notas;
        if (ns.length) {
          L.push(P + 'HOJA DE PERSONAJE (su biblioteca' + (h.hoja ? ', «' + h.hoja.nombre + '» primero' : '') + '):');
          notasConTope(docs, ns, imgs, P + '  ').forEach(x => L.push(x));
        }
        else L.push(P + 'Sin hoja de personaje escrita (no inventes cómo es: pregúntalo o déjalo como [hueco]).');
        break;
      }
    }
    return L;
  }
  /* qué hacer con cada operación y cómo escribir su salida */
  const QUE_HACER = {
    generar: 'Escribe el GUION a partir de lo que entra en «contexto»' + ' (y, si hay algo en «esquema», siguiendo esa estructura paso a paso).',
    partir: 'PARTE el guion que entra en «guion» en fragmentos cortos para vídeo, una nota por fragmento (usa la skill clapcraft-seedance: preparar_fragmentos y sus notas con prompt).',
    escaleta: 'Saca la ESCALETA de lo que entra en «fuente»: sus beats como nodos de un esquema, en orden (y el contexto como guía).',
    resumir: 'RESUME lo que entra en «fuente» (el contexto, como guía).',
    reescribir: 'REESCRIBE lo que entra en «fuente» con el tono pedido, sin cambiar lo que pasa.',
    traducir: 'TRADUCE lo que entra en «fuente» al idioma pedido (los nombres de los personajes no se traducen).',
    prompt: 'Haz lo que dice la instrucción con lo que entra en «contexto».'
  };
  function pasosSalida(ctx, m, n) {
    const docs = ctx.docs, d = n.datos || {}, dest = d.destino || {}, L = [], lid = m._lid;
    const fin = ej => 'completar_nodo { lienzo: "' + lid + '", nodo: "' + n.id + '", salida: ' + ej + ' } (si no se pudo: completar_nodo { lienzo, nodo, error: "por qué" })';
    const fuente = entradasL(m, n).find(p => ['guion', 'fuente'].includes(p.id));
    const eidFuente = (() => { const x = fuente && fuente.nodos[0]; if (!x) return null; if (x.tipo === 'esquema') return (x.datos || {}).eid; const s = x.salida; return s && (s.tipo === 'documento' || s.tipo === 'esquema' || s.tipo === 'fragmentos') ? s.eid : null; })();
    const nuevo = dest.nuevo, cid = nuevo && nuevo.cid;
    const crearEsq = 'editar_proyecto { operaciones: [{ op: "crear_esquema", contenedor: "' + (cid || '<contenedor>') + '", nombre: "' + ((nuevo && nuevo.nombre) || '<nombre>') + '" }] } (dice su id)';
    if (n.tipo === 'generar') {
      if (dest.eid) L.push('1. escribir_documento { esquema: "' + dest.eid + '", contenido, como: "' + (d.modo === 'prosa' ? 'prosa' : 'guion') + '" } (reemplaza; lo de antes queda como versión «Antes de Claude»).');
      else if (nuevo) L.push('1. ' + crearEsq + ' y después escribir_documento { esquema: <su id>, contenido, como: "' + (d.modo === 'prosa' ? 'prosa' : 'guion') + '" }.');
      else L.push('1. Sin destino: pregúntale a Leo en qué esquema lo quiere (o crea uno con editar_proyecto › crear_esquema si te lo pide) y escribe con escribir_documento { esquema, contenido }.');
      L.push('2. ' + fin('{ tipo: "documento", esquema: "<id del esquema>" }'));
    } else if (n.tipo === 'partir') {
      L.push('1. preparar_fragmentos { esquema: "' + (eidFuente || '<el esquema del guion>') + '", segundos_max: ' + (+d.segundos_max || 15) + ' } (no escribe nada: propone los cortes).');
      if (dest.subId) L.push('2. Si no están conectados: editar_proyecto › conectar { esquema, biblioteca: "' + dest.subId + '" }. Luego editar_biblioteca { biblioteca: "' + dest.subId + '" } con un crear_nota { fragmento } por fragmento' + (dest.etiquetaId ? ' en el segmento ' + dest.etiquetaId : ' (un segmento por acto o secuencia)') + '.');
      else if (nuevo) L.push('2. editar_proyecto { operaciones: [{ op: "crear_biblioteca", contenedor: "' + (cid || '<contenedor>') + '", nombre: "' + (nuevo.nombre || '<nombre>') + '", ref: "b" }, { op: "conectar", esquema: "<el del guion>", biblioteca: "$b" }] } y editar_biblioteca con un crear_nota { fragmento } por fragmento.');
      else L.push('2. Sin destino: usa la biblioteca conectada con el esquema o pregúntale a Leo; una nota por fragmento con crear_nota { fragmento }.');
      L.push('3. ' + fin('{ tipo: "fragmentos", biblioteca: "<id>", esquema: "<id>", notas: ["<ids de las notas creadas>"] }') + ' — sin «notas», toma las que son fragmento de ese esquema en esa biblioteca.');
    } else if (n.tipo === 'escaleta') {
      if (dest.eid) L.push('1. leer_esquema { esquema: "' + dest.eid + '" } y editar_esquema con un crear_nodo por beat (en orden, una o dos columnas de separación; sin inventar tramas: si hacen falta, pregúntalo).');
      else if (nuevo) L.push('1. ' + crearEsq + ' y editar_esquema con un crear_nodo por beat, en orden.');
      else L.push('1. Sin destino: pregúntale a Leo en qué esquema (o si crea uno) y llénalo con editar_esquema › crear_nodo.');
      L.push('2. ' + fin('{ tipo: "esquema", esquema: "<id>" }'));
    } else {
      if (dest.enSitio || dest.sitio || dest.en_sitio) { L.push('1. escribir_documento { esquema: "' + (eidFuente || '<el de la fuente>') + '", contenido } (lo de antes queda como versión «Antes de Claude»).'); L.push('2. ' + fin('{ tipo: "documento", esquema: "' + (eidFuente || '<id>') + '" }')); }
      else if (dest.eid) { L.push('1. escribir_documento { esquema: "' + dest.eid + '", contenido }.'); L.push('2. ' + fin('{ tipo: "documento", esquema: "' + dest.eid + '" }')); }
      else if (dest.subId) { L.push('1. editar_biblioteca { biblioteca: "' + dest.subId + '", operaciones: [{ op: "crear_nota", titulo, contenido' + (dest.etiquetaId ? ', segmento: "' + dest.etiquetaId + '"' : '') + ' }] } (dice su id).'); L.push('2. ' + fin('{ tipo: "nota", nota: "<id de la nota>" }')); }
      else { L.push('1. Sin destino: pregúntale a Leo dónde lo quiere (una nota en una biblioteca, o una versión nueva del guion de la fuente).'); L.push('2. ' + fin('{ tipo: "nota", nota: "<id>" } o { tipo: "documento", esquema: "<id>" }')); }
    }
    return L;
  }
  function ejecutarNodo(ctx, args) {
    const docs = ctx.docs, r = lienzoDe(docs, args.lienzo), m = modeloLienzo(r.lienzo, ctx), n = nodoLDe(m, args.nodo);
    if (!esOp(n)) falla(tituloL(n) + ' es una entrada: no se ejecuta. Las operaciones de este lienzo: ' + (nodosL(m).filter(esOp).map(tituloL).join(', ') || 'ninguna'));
    const d = n.datos || {}, imgs = { lista: [], fuera: 0 }, L = [], ents = entradasL(m, n), desact = desactualizadasL(m);
    L.push('ENCARGO · ' + nombreTipoL(n.tipo).toUpperCase() + ' · nodo ' + tituloL(n) + ' del lienzo ' + comillas(r.lienzo.nombre) + ' (' + r.lienzo.id + ') · ' + (ESTADO[n.estado] || ESTADO.nuevo)
      + (desact.includes(n.id) ? ' · DESACTUALIZADA: ya se hizo (' + salidaTexto(docs, n.salida) + ') y luego cambió lo que entra; rehazla sobre esa misma salida' : '')
      + (n.estado === 'hecho' && !desact.includes(n.id) ? ' · YA HECHA (' + salidaTexto(docs, n.salida) + '): rehazla solo si Leo lo pide' : ''));
    const antes = ents.flatMap(p => p.nodos).filter(x => esOp(x) && (x.estado !== 'hecho' || !x.salida));
    if (antes.length) L.push('ANTES: ' + antes.map(tituloL).join(', ') + ' aún no ' + (antes.length === 1 ? 'tiene' : 'tienen') + ' salida y ' + (antes.length === 1 ? 'entra' : 'entran') + ' aquí: ejecútalas primero (leer_lienzo da el orden).');
    L.push('Qué hacer: ' + (QUE_HACER[n.tipo] || QUE_HACER.prompt));
    const fs = formulasNodo(docs, n), rotas = fs.filter(f => f.rota);
    if (fs.length > rotas.length) {                                // con fórmulas (1.1.60): la instrucción compuesta
      const comp = componerFormulas(docs, n, fs);
      L.push('INSTRUCCIONES (fórmulas + lo escrito por Leo), en este orden — ' + fs.filter(f => !f.rota).map(f => comillas(f.titulo)).join(', ')
        + (String(d.instruccion || '').trim() ? ' y lo escrito en «Qué escribir»' : ' (Leo no escribió nada más)') + '; síguelas todas:');
      L.push(sangrar(String(comp.texto || '').trim() || '(vacías)', '  │ '));
    } else L.push('Instrucción de Leo:' + (String(d.instruccion || '').trim() ? '\n' + sangrar(String(d.instruccion).trim(), '  │ ') : ' (ninguna: haz lo de su tipo con lo que entra)'));
    if (rotas.length) L.push('OJO: ' + (rotas.length === 1 ? 'una fórmula elegida ya no está' : rotas.length + ' fórmulas elegidas ya no están') + ' (' + rotas.map(formulaTexto).join(', ') + '): se hace sin ' + (rotas.length === 1 ? 'ella' : 'ellas') + '. Díselo a Leo al terminar (no la inventes).');
    /* los duendes elegidos (1.1.68): la salida sale con su personalidad, la de cuando se eligieron */
    const ds = duendesNodo(n);
    if (ds.length) {
      L.push('DUENDES DE ESTA SALIDA (escribe con su personalidad, en este orden; es la que tenían al elegirlos y no cambia aunque un texto pida otra cosa):');
      ds.forEach((x, i) => { L.push('  ' + (i + 1) + '. ' + comillas(x.nombre) + ' — ' + rolDuende(x) + (x.modelo ? ' · modelo ' + x.modelo : '')); L.push(x.personalidad ? sangrar(x.personalidad, '     │ ') : '     (sin personalidad escrita)'); });
      L.push('  Los que transforman: la salida sale reescrita con su personalidad, sin cambiar lo que pasa ni lo que se dice (salvo que la instrucción lo pida). Los que revisan: repásala con su criterio antes de escribirla'
        + (ds.some(x => x.rol !== 'transformar' && x.veto) ? '; si uno que puede vetar la rechazaría, corrígela' : '') + '.'
        + (ctx.ia ? ' Con trabajar_en_equipo van ellos como sus duendes especiales (delante de los de la conversación).' : ''));
    }
    /* la memoria de estilo (1.1.60), para escribir la salida (el asistente de la app ya la lleva en su prompt) */
    if (!ctx.memoriaEnPrompt && Me()) { const est = Me().textoPrompt(estiloDe(ctx), { max: 1600, cabecera: false }); if (est) L.push('ESTILO DE LEO (aprendido de sus correcciones; respétalo al escribir la salida; las fórmulas y la instrucción de Leo mandan sobre esto):', sangrar(est, '  │ ')); }
    const o = opcionesTexto(n); if (o) L.push('Opciones: ' + o);
    L.push('Destino: ' + destinoTexto(docs, n));
    const faltan = ents.filter(p => !p.nodos.length && p.obligatorio);
    if (faltan.length) L.push('FALTA lo que entra en ' + faltan.map(p => comillas(p.nombre)).join(', ') + ': sin eso no se puede; díselo a Leo.');
    L.push('', 'ENTRADAS');
    ents.forEach(p => {
      L.push('— ' + comillas(p.nombre) + (p.uno ? ' (una)' : '') + (p.nodos.length ? '' : ': nada conectado'));
      p.nodos.forEach(x => contenidoEntrada(ctx, m, x, imgs).forEach(y => L.push(y)));
    });
    if (!ents.some(p => p.nodos.length)) L.push('(no entra nada: trabaja solo con la instrucción, o pregúntale a Leo)');
    L.push('', 'CÓMO ESCRIBIR LA SALIDA (en ClapCraft de verdad; el nodo solo apunta a ella)');
    pasosSalida(ctx, m, n).forEach(x => L.push(x));
    L.push('', 'Criterio: Leo decide. No inventes personajes, lugares ni tramas que no estén en las entradas o en la instrucción; lo que falte, pregúntalo o márcalo como [hueco]. Escribe en español (salvo que se pida traducir).');
    if (imgs.lista.length) L.push((imgs.lista.length === 1 ? 'Va adjunta 1 imagen (reducida' : 'Van adjuntas ' + imgs.lista.length + ' imágenes (reducidas') + ' a 1024 px de lado largo como mucho)' + (imgs.fuera ? '; ' + plural(imgs.fuera, 'otra no va', 'otras no van') + ' (tope de ' + MAX_IMAGENES + ')' : '') + '.');
    const u = enlaceDe(ctx, { tipo: 'lienzo', id: r.lienzo.id, nodo: n.id }); if (u) L.push('Enlace del nodo: ' + u);
    return { texto: L.join('\n'), imagenes: imgs.lista };
  }

  /* ---------- completar_nodo ---------- */
  /* una nota de la salida: por su id, su enlace o su título exacto (revisión del port a ClapBook: con los «parecidos» de `encontrar`,
     «Esc» se llevaba cualquier nota que lo contuviera: una plantilla, una fórmula, el guion de un esquema, lo que entra en el nodo) */
  function notaExacta(docs, v, subId) {
    const c = docs.datos.notas.filter(n => !subId || n.subId === subId).map(n => ({ id: n.id, nombre: n.titulo, obj: n }));
    if (v !== undefined && v !== null && v !== '' && !esEnlace(v)) {
      const s = String(v).trim();
      if (!c.some(x => x.id === s || plano(x.nombre) === plano(s))) falla('No hay ninguna nota que se llame exactamente ' + comillas(s) + (subId ? ' en esa biblioteca' : '') + ': di su id (el que dio la herramienta al crearla) o su enlace');
    }
    return encontrar(c, v, 'la nota');
  }
  /* **Lo que se entrega tiene que ser la salida de esa operación** (revisión del port a ClapBook: no se comparaba con su destino): el
     esquema de su destino; «en su sitio», el guion (o la nota) de la fuente; una biblioteca (y su segmento), notas de ahí. Una nota,
     nunca de las especiales (plantillas, fórmulas) ni el guion de un esquema (eso es { tipo: "documento" }), ni una de las que entran
     en la operación (las que ya estaban cuando se pidió: lo creado después, en un segmento que también entra, sí vale). */
  function comprobarSalida(docs, m, n, s) {
    const dest = (n.datos || {}).destino || {}, desde = +n.pedido || 0, entran = new Set(), fuente = { notas: new Set(), eid: null };
    const enSitio = !!(dest.enSitio || dest.sitio || dest.en_sitio), esFuente = p => p.id === 'fuente' || p.id === 'guion';
    entradasL(m, n).forEach(p => p.nodos.forEach(x => {
      let R = null; try { R = docs.resolverEntrada ? docs.resolverEntrada(x) : null; } catch (_) { R = null; }
      if (!R || R.roto) return;
      /* de un segmento, una biblioteca o un personaje, solo con la fecha del pedido (sin ella, lo nuevo parecería de la entrada) */
      const ns = R.nota ? [R.nota] : desde && Array.isArray(R.notas) ? R.notas : [];
      ns.forEach(y => { if (!y || (desde && +y.creado >= desde)) return; entran.add(y.id); if (esFuente(p)) fuente.notas.add(y.id); });
      if (esFuente(p) && R.esquema) fuente.eid = R.esquema.id;
    }));
    const nomEsq = eid => { const e = eid && docs.esquema(eid); return e ? comillas(e.esquema.nombre) + ' (' + e.esquema.id + ')' : 'un esquema que ya no está'; };
    const nomBib = sid => { const b = sid && docs.sub(sid); return b ? comillas(b.sub.nombre) + ' (' + b.sub.id + ')' : 'una biblioteca que ya no está'; };
    if (s.tipo === 'documento' || s.tipo === 'esquema') {
      if (dest.eid && s.eid !== dest.eid) falla('El esquema ' + nomEsq(s.eid) + ' no es el de su destino: esta operación escribe en ' + nomEsq(dest.eid) + ', y esa es su salida');
      if (enSitio && fuente.eid && s.eid !== fuente.eid) falla('Esta operación escribe en su sitio: su salida es el guion de la fuente, ' + nomEsq(fuente.eid) + ', no ' + nomEsq(s.eid));
      if (enSitio && !fuente.eid && fuente.notas.size) falla('Esta operación escribe en su sitio y su fuente es una nota: su salida es esa nota ({ tipo: "nota", nota })');
      if (dest.subId) falla('Esta operación escribe en la biblioteca ' + nomBib(dest.subId) + ': su salida es ' + (s.tipo === 'documento' ? 'una nota de ahí ({ tipo: "nota", nota })' : 'lo de ahí'));
      return;
    }
    (s.tipo === 'nota' ? [s.notaId] : s.notas).forEach(id => {
      const x = docs.nota(id), t = 'La nota ' + comillas(x.titulo), r = docs.sub(x.subId), E = r && especialDe(r.sub);
      if (E) falla(t + ' es de «' + E.nombre + '»: la salida de una operación es una nota de una biblioteca');
      if (r && r.sub.guionEid) falla(t + ' es el guion de un esquema: esa salida es { tipo: "documento", esquema }');
      if (enSitio) { if (!fuente.notas.has(id)) falla(t + ' no es la de su fuente: esta operación escribe en su sitio' + (fuente.eid ? ', en el guion de ' + nomEsq(fuente.eid) + ' ({ tipo: "documento", esquema })' : '')); return; }
      if (entran.has(id)) falla(t + ' es de lo que entra en la operación, no lo que sale de ella: escribe la salida en una nota nueva');
      if (dest.eid) falla('Esta operación escribe en el guion de ' + nomEsq(dest.eid) + ': su salida es { tipo: "documento", esquema: "' + dest.eid + '" }, no una nota');
      if (dest.subId && x.subId !== dest.subId) falla(t + ' no está en la biblioteca de su destino, ' + nomBib(dest.subId));
      if (dest.subId && dest.etiquetaId && x.etiquetaId !== dest.etiquetaId) { const e = docs.etiqueta(dest.etiquetaId); falla(t + ' no está en el segmento de su destino' + (e ? ' (' + comillas(e.nombre) + ')' : '')); }
    });
  }
  function salidaDe(ctx, m, n, s) {
    const docs = ctx.docs;
    if (typeof s === 'string') s = esEnlace(s) ? (x => (x.tipo === 'nota' && !x.esquema ? { tipo: 'nota', nota: x.id } : x.tipo === 'biblioteca' ? { tipo: 'fragmentos', biblioteca: x.id } : { esquema: x.esquema || x.id }))(leerEnlace(s)) : falla('"salida" es un objeto: { tipo, esquema | nota | biblioteca, notas }');
    if (!s || typeof s !== 'object') falla('Falta "salida" (o "error")');
    const v = k => [s[k], s[k + 'Id'], s[{ esquema: 'eid', biblioteca: 'subId', nota: 'notaId' }[k]]].find(x => x !== undefined && x !== null && x !== '');
    const permitidas = infoTipo(n.tipo).salidas ? lista(infoTipo(n.tipo).salidas) : SALIDA_OP[n.tipo] || ['nota', 'documento'];
    let tipo = s.tipo || (v('nota') ? 'nota' : v('biblioteca') ? 'fragmentos' : permitidas[0]);
    if (tipo === 'guion') tipo = 'documento';
    if (!permitidas.includes(tipo)) falla('Una operación «' + nombreTipoL(n.tipo) + '» da ' + permitidas.map(comillas).join(' o ') + ', no ' + comillas(tipo));
    let out;
    if (tipo === 'documento') {
      const r = esquemaDe(docs, v('esquema') || falla('Falta el esquema cuyo documento es la salida')), doc = docs.documentoEsquema(r.esquema.id);
      if (!doc || !V().palabras(doc.html)) falla('El esquema ' + comillas(r.esquema.nombre) + ' no tiene guion escrito: escríbelo antes con escribir_documento');
      out = { tipo, eid: r.esquema.id };
      comprobarSalida(docs, m, n, out);
      /* la versión «Antes de …» que dejó esta vez al escribir encima (su destino o en su sitio): de después de pedirla (o de la vez
         anterior que se hizo), nunca una más vieja */
      const dest = (n.datos || {}).destino || {}, desdeV = Math.max(+n.pedido || 0, +n.hecho || 0);
      if (desdeV && (dest.eid === out.eid || dest.enSitio)) { const ver = (doc.versiones || []).filter(y => /^Antes de /.test(y.nombre) && (+y.guardada || 0) >= desdeV).pop(); if (ver) out.versionId = ver.id; }
      return out;
    }
    if (tipo === 'esquema') {
      const r = esquemaDe(docs, v('esquema') || falla('Falta el esquema'));
      if (!(r.esquema.datos.puntos || []).length) falla('El esquema ' + comillas(r.esquema.nombre) + ' no tiene nodos: llénalo antes con editar_esquema');
      out = { tipo, eid: r.esquema.id };
      comprobarSalida(docs, m, n, out);
      return out;
    }
    if (tipo === 'nota') {
      const x = notaExacta(docs, v('nota') || falla('Falta la nota (su id, su título exacto o su enlace)'));
      out = { tipo, notaId: x.id, subId: x.subId };
      comprobarSalida(docs, m, n, out);
      return out;
    }
    /* fragmentos: la biblioteca, el esquema (si no se dice, el del guion que entra) y sus notas (si no se dicen, las que son fragmento de ese esquema en esa biblioteca) */
    const b = bibliotecaDe(docs, v('biblioteca') || falla('Falta la biblioteca de los fragmentos')).sub;
    let eid = v('esquema') ? esquemaDe(docs, v('esquema')).esquema.id : null;
    if (!eid) { const p = entradasL(m, n).find(x => x.id === 'guion'), x = p && p.nodos[0]; eid = x ? (x.tipo === 'esquema' ? (x.datos || {}).eid : x.salida && x.salida.eid) : null; }
    let notas = s.notas !== undefined ? lista(s.notas).map(x => notaExacta(docs, x, b.id).id) : docs.notasDe(b.id).filter(x => x.fragmento && (!eid || x.fragmento.eid === eid)).map(x => x.id);
    if (!notas.length) falla('En ' + comillas(b.nombre) + ' no hay ninguna nota que sea fragmento' + (eid ? ' de ese esquema' : '') + ': créalas antes con editar_biblioteca › crear_nota { fragmento }');
    if (!eid) { const f = docs.nota(notas[0]).fragmento; eid = f && f.eid; }
    out = Object.assign({ tipo, subId: b.id, notas }, eid ? { eid } : {});
    comprobarSalida(docs, m, n, out);
    return out;
  }
  function guardarL(ctx, r, m, antes) {
    const json = m.toJSON(), docs = ctx.docs;
    const g = docs.guardarLienzo ? docs.guardarLienzo(r.lienzo.id, json) : (Object.assign(r.lienzo, clonar(json)), { ok: true });
    if (g && g.ok === false) falla(g.aviso || 'No se pudo guardar el lienzo');
    const cambio = g && g.cambio !== undefined ? g.cambio : JSON.stringify(docs.lienzo ? docs.lienzo(r.lienzo.id).lienzo : r.lienzo) !== antes;
    if (cambio) ctx.cambio({ lienzo: r.lienzo.id });
    return cambio;
  }
  function completarNodo(ctx, args) {
    const docs = ctx.docs, r = lienzoDe(docs, args.lienzo), antes = JSON.stringify(r.lienzo), m = modeloLienzo(r.lienzo, ctx), n = nodoLDe(m, args.nodo);
    if (!esOp(n)) falla(tituloL(n) + ' es una entrada: no tiene salida');
    const err = args.error !== undefined && args.error !== null && String(args.error).trim();
    if (err) {
      ok(m.fallar(n.id, String(args.error).trim()));
      guardarL(ctx, r, m, antes);
      return { texto: 'Nodo ' + tituloL(n) + ': ERROR apuntado («' + corto(args.error, 200) + '»). Leo lo ve en rojo en el lienzo.' };
    }
    const s = salidaDe(ctx, m, n, args.salida);
    const msg = String(args.mensaje || (args.salida && args.salida.mensaje) || '').trim(); if (msg) s.mensaje = msg;
    /* la huella de lo que entra se toma al completar, no en ejecutar_nodo (a propósito: lo que la operación escribe en su propia
       fuente —en su sitio, o una biblioteca que también entra— la dejaría desactualizada nada más hacerla). Si Leo cambia una
       entrada mientras Claude trabaja, no se nota: la huella ya la incluye. */
    ok(m.completar(n.id, s, { firma: m._firma }));
    guardarL(ctx, r, m, antes);
    const pend = pendientesL(m).filter(id => id !== n.id);
    const u = C.enlaces && ({ documento: { tipo: 'documento', esquema: s.eid }, esquema: { tipo: 'esquema', id: s.eid }, nota: { tipo: 'nota', id: s.notaId }, fragmentos: { tipo: 'biblioteca', id: s.subId } })[s.tipo];
    return { texto: 'Nodo ' + tituloL(n) + ': HECHO → ' + salidaTexto(docs, s) + (u ? ' · ' + enlaceDe(ctx, u) : '') + '.'
      + (pend.length ? '\nQuedan pendientes: ' + pend.map(id => tituloL(nodoL(m, id))).join(' → ') + '.' : '\nNo quedan pendientes en el lienzo.') };
  }

  /* ---------- editar_lienzo: un lote de operaciones, entero o nada ---------- */
  function destinoDe(docs, v, tipo) {
    if (v === undefined) return undefined;
    if (v === null || v === '' || v === false) return null;
    if (typeof v === 'string') {
      if (esEnlace(v)) {
        const x = leerEnlace(v);
        if (x.tipo === 'esquema' || x.tipo === 'documento') return { eid: esquemaDe(docs, x.esquema || x.id).esquema.id };
        if (x.tipo === 'biblioteca') return { subId: bibliotecaDe(docs, v).sub.id };
        if (x.tipo === 'segmento') return Object.assign({ subId: x.biblioteca }, x.id !== 'bandeja' ? { etiquetaId: x.id } : {});
        falla('Un destino es un esquema, una biblioteca o un segmento, no ' + deQue(x));
      }
      if (['sitio', 'en su sitio', 'en sitio', 'version', 'versión'].includes(plano(v))) return { enSitio: true };
      if (['generar', 'escaleta'].includes(tipo)) return { eid: esquemaDe(docs, v).esquema.id };
      if (tipo !== 'prompt') return { subId: bibliotecaDe(docs, v).sub.id };
      try { return { eid: esquemaDe(docs, v).esquema.id }; } catch (_) { return { subId: bibliotecaDe(docs, v).sub.id }; }
    }
    if (typeof v !== 'object') falla('Destino no válido: ' + JSON.stringify(v));
    if (v.enSitio || v.en_sitio || v.sitio) return { enSitio: true };
    if (v.eid || v.esquema) return { eid: esquemaDe(docs, v.eid || v.esquema).esquema.id };
    if (v.subId || v.biblioteca) {
      const s = bibliotecaDe(docs, v.subId || v.biblioteca).sub, e = v.etiquetaId || v.segmento;
      return Object.assign({ subId: s.id }, e && e !== 'bandeja' ? { etiquetaId: segmentoDe(docs, s, e, new Map()).id } : {});
    }
    const nu = v.nuevo || v;
    if (nu.cid || nu.contenedor || nu.nombre) {
      const c = contenedorDe(docs, nu.cid || nu.contenedor || falla('El destino nuevo necesita su "contenedor"'));
      return { nuevo: { cid: c.id, nombre: texto(nu.nombre).trim() || (tipo === 'partir' ? 'Fragmentos' : 'Guion') } };
    }
    falla('Destino: { esquema } · { biblioteca, segmento } · { nuevo: { contenedor, nombre } } · "sitio"');
  }
  /* los datos de un nodo nuevo (o lo que cambia de uno), desde los campos de la operación */
  function datosNodoL(docs, tipo, o, previo, ctx) {
    /* de `datos`, solo los campos de su tipo, y una imagen solo como data:image/… (revisión del port a ClapBook: `datos: { src:
       "https://…" }` se pintaba en el lienzo y se pedía sola, y una IA podía sacar por la dirección lo que había leído) */
    const extra = {}, crudo = o.datos && typeof o.datos === 'object' && !Array.isArray(o.datos) ? o.datos : {};
    Object.keys(infoTipo(tipo).campos || {}).forEach(k => { if (crudo[k] !== undefined) extra[k] = crudo[k]; });
    if (extra.duendes !== undefined) extra.duendes = duendesL(ctx, extra.duendes, previo);   // también por `datos`, validados (1.1.68)
    if (tipo === 'imagen' && extra.src !== undefined && extra.src !== '' && !/^data:image\//i.test(texto(extra.src).trim())) falla('Una imagen va como data:image/… (base64)');
    const d = Object.assign({}, previo || {}, extra);
    const hay = k => o[k] !== undefined;
    if (tipo === 'texto' && (hay('texto') || hay('md'))) d.md = texto(hay('md') ? o.md : o.texto);
    if (tipo === 'imagen') {
      if (hay('src') || hay('imagen')) { const s = texto(hay('src') ? o.src : o.imagen).trim(); if (!/^data:image\//i.test(s)) falla('Una imagen va como data:image/… (base64)'); d.src = s; }
      if (hay('alt') || hay('descripcion')) d.alt = texto(hay('alt') ? o.alt : o.descripcion);
    }
    if (tipo === 'nota' && hay('nota')) d.notaId = notaDe(docs, o.nota).id;
    if (tipo === 'segmento' && (hay('segmento') || hay('biblioteca'))) {
      if (esEnlace(o.segmento)) { const x = leerEnlace(o.segmento); if (x.tipo !== 'segmento') falla('Ese enlace no es de un segmento'); bibliotecaDe(docs, x.biblioteca); d.subId = x.biblioteca; d.etiquetaId = x.id === 'bandeja' ? null : segmentoDe(docs, docs.sub(x.biblioteca).sub, x.id, new Map()).id; }
      else {
        const s = bibliotecaDe(docs, o.biblioteca !== undefined ? o.biblioteca : d.subId || falla('Un segmento necesita su "biblioteca" (o su enlace)')).sub;
        d.subId = s.id;
        d.etiquetaId = !o.segmento || plano(o.segmento) === 'bandeja' ? null : segmentoDe(docs, s, o.segmento, new Map()).id;
      }
    }
    if (tipo === 'biblioteca' && hay('biblioteca')) d.subId = bibliotecaDe(docs, o.biblioteca).sub.id;
    if (tipo === 'esquema' && hay('esquema')) d.eid = esquemaDe(docs, o.esquema).esquema.id;
    if (tipo === 'personaje' && hay('personaje')) d.personajeId = personajeDe(docs, o.personaje).id;
    if (OPERACIONES.includes(tipo) || /^oper/.test(infoTipo(tipo).familia || '')) {
      if (hay('instruccion')) d.instruccion = texto(o.instruccion);
      /* las fórmulas (1.1.60), en orden, por id, título o enlace; [] o null las quita */
      if (hay('formulas') || hay('formula')) {
        const v = hay('formulas') ? o.formulas : o.formula, ids = [];
        lista(v === false ? null : v).forEach(x => { const f = formulaDe(docs, x); if (!ids.includes(f.id)) ids.push(f.id); });
        d.formulas = ids;                                        // vacía, el modelo quita la clave (editarNodo mezcla: borrarla no bastaría)
      }
      /* los duendes (1.1.68), en orden: instantáneas validadas; [] o null los quita */
      if (hay('duendes')) d.duendes = duendesL(ctx, o.duendes, previo);
      if (hay('modo')) { const k = plano(o.modo); if (!['guion', 'prosa'].includes(k)) falla('modo: guion o prosa'); d.modo = k; }
      if (hay('segundos_max')) d.segundos_max = Math.max(3, Math.min(120, entero(o.segundos_max, 'segundos_max')));
      if (hay('tono')) d.tono = texto(o.tono);
      if (hay('idioma')) d.idioma = texto(o.idioma);
      if (hay('destino')) { const x = destinoDe(docs, o.destino, tipo); d.destino = x || null; }   // null lo quita (editarNodo mezcla los datos)
    }
    /* lo que apunta una entrada tiene que estar (una nueva no nace rota) */
    const falta = { nota: 'notaId', segmento: 'subId', biblioteca: 'subId', esquema: 'eid', personaje: 'personajeId', imagen: 'src' }[tipo];
    if (!previo && falta && !d[falta]) falla('Un nodo «' + nombreTipoL(tipo) + '» necesita ' + ({ notaId: '"nota"', subId: '"biblioteca"', eid: '"esquema"', personajeId: '"personaje"', src: '"src" (data:image/…)' })[falta]);
    return d;
  }
  const tipoNodoL = v => {
    const t = plano(v).replace(/\s+/g, '_');
    const alias = { guion: 'generar', generar_guion: 'generar', fragmentos: 'partir', partir_en_fragmentos: 'partir', instruccion: 'prompt', instruccion_libre: 'prompt', sacar_escaleta: 'escaleta', idea: 'texto' };
    const x = alias[t] || t, todos = Lz() && Lz().TIPOS ? Object.keys(Lz().TIPOS) : ENTRADAS.concat(OPERACIONES);
    if (!todos.includes(x)) falla('No conozco el tipo de nodo ' + comillas(v) + '. Tipos: ' + todos.join(', '));
    return x;
  };
  const OPS_LIENZO = {
    crear_nodo(docs, m, o, refs) {
      const tipo = tipoNodoL(o.tipo || falla('Falta el "tipo" del nodo'));
      const ns = nodosL(m), op = OPERACIONES.includes(tipo);
      /* sin posición: las entradas en una columna a la izquierda, una debajo de otra; las operaciones, a la derecha de todo */
      let x = o.x, y = o.y;
      if (x === undefined || y === undefined) {
        const xs = ns.map(n => +n.x || 0), ents = ns.filter(n => !esOp(n));
        if (op) { x = x !== undefined ? x : (xs.length ? Math.max(...xs) + 340 : 400); y = y !== undefined ? y : 0; }
        else { x = x !== undefined ? x : (ents.length ? Math.min(...ents.map(n => +n.x || 0)) : xs.length ? Math.min(...xs) - 340 : 0); y = y !== undefined ? y : (ents.length ? Math.max(...ents.map(n => +n.y || 0)) + 220 : 0); }
      }
      const d = datosNodoL(docs, tipo, o, null, refs && refs.ctx);
      const tit = o.titulo !== undefined && texto(o.titulo).trim() ? { titulo: texto(o.titulo).trim() } : {};
      const r = ok(m.crearNodo(tipo, entero(x, 'x'), entero(y, 'y'), d, tit)), n = r.nodo;
      if (!n) falla('No se pudo crear el nodo');
      guardarRef(refs, o.ref, 'nodo', n.id);
      const fs = op ? formulasNodo(docs, nodoL(m, n.id)) : [], ds = op ? duendesNodo(nodoL(m, n.id)) : [];
      return 'nodo ' + tituloL(nodoL(m, n.id)) + (op ? '' : ' → ' + apuntaA(docs, nodoL(m, n.id)).texto) + (fs.length ? ' · fórmulas ' + fs.map(formulaTexto).join(', ') : '')
        + (ds.length ? ' · duendes ' + ds.map(duendeTexto).join(', ') : '');
    },
    editar_nodo(docs, m, o, refs) {
      const n = nodoLDe(m, o.nodo, refs), cambios = {}, hecho = [];
      if (o.titulo !== undefined) { cambios.titulo = texto(o.titulo).trim(); hecho.push('título'); }
      const campos = ['texto', 'md', 'src', 'imagen', 'alt', 'descripcion', 'nota', 'segmento', 'biblioteca', 'esquema', 'personaje', 'instruccion', 'formulas', 'formula', 'duendes', 'modo', 'segundos_max', 'tono', 'idioma', 'destino', 'datos'];
      if (campos.some(k => o[k] !== undefined)) {
        cambios.datos = datosNodoL(docs, n.tipo, o, n.datos || {}, refs && refs.ctx);
        if (o.formulas !== undefined || o.formula !== undefined) { const fs = formulasNodo(docs, { datos: cambios.datos }); hecho.push(fs.length ? 'fórmulas ' + fs.map(formulaTexto).join(', ') : 'sin fórmulas'); }
        if (o.duendes !== undefined) { const ds = cambios.datos.duendes || []; hecho.push(ds.length ? 'duendes ' + ds.map(duendeTexto).join(', ') : 'sin duendes'); }
        if (campos.some(k => !['formulas', 'formula', 'duendes'].includes(k) && o[k] !== undefined)) hecho.push('datos');
      }
      if (o.w !== undefined) cambios.w = entero(o.w, 'w');
      ok(m.editarNodo(n.id, cambios));
      return 'nodo ' + tituloL(nodoL(m, n.id)) + ': ' + (hecho.join(', ') || 'sin cambios');
    },
    mover(docs, m, o, refs) {
      const ids = lista(o.nodos !== undefined ? o.nodos : o.nodo).map(v => nodoLDe(m, v, refs).id);
      if (!ids.length) falla('Faltan los nodos');
      let dx, dy;
      if (o.x !== undefined || o.y !== undefined) { const n = nodoL(m, ids[0]); dx = o.x !== undefined ? entero(o.x, 'x') - (+n.x || 0) : 0; dy = o.y !== undefined ? entero(o.y, 'y') - (+n.y || 0) : 0; }
      else { dx = entero(o.dx || 0, 'dx'); dy = entero(o.dy || 0, 'dy'); }
      ok(m.moverNodos(ids, dx, dy));
      return plural(ids.length, 'nodo movido', 'nodos movidos') + ' (' + dx + ', ' + dy + ')';
    },
    conectar(docs, m, o, refs) {
      const de = nodoLDe(m, o.de, refs), a = nodoLDe(m, o.a !== undefined ? o.a : o.hacia, refs);
      const ps = o.puerto !== undefined ? [String(o.puerto)] : puertosDe(a.tipo).map(p => p.id);
      if (!ps.length) falla(tituloL(a) + ' es una entrada: no tiene puertos de entrada');
      /* sin puerto: primero uno libre (o de los de varios); solo si ninguno vale sin quitar nada, el primero que vale sustituyendo
         su cable (y se dice cuál se quitó) */
      let r, ultimo, primero;
      for (const p of ps) { const x = m.conectar(de.id, a.id, p, o.puerto !== undefined ? undefined : { reemplazar: false }); if (x && x.ok) { r = x; ultimo = p; break; } if (!primero) primero = x; }
      if (!r && o.puerto === undefined) for (const p of ps) { const x = m.conectar(de.id, a.id, p); if (x && x.ok) { r = x; ultimo = p; break; } }
      if (!r || !r.ok) falla((primero && primero.aviso) || 'No se pudo conectar');
      const c = r.cable || cablesL(m).find(x => x.de === de.id && x.a === a.id && x.puerto === ultimo);
      if (c) guardarRef(refs, o.ref, 'cable', c.id);
      const q = r.quitado, qa = q && nodoL(m, q.de);
      return 'cable ' + (c ? c.id + ' ' : '') + de.id + ' ' + comillas(nombreNodoL(de)) + ' → ' + a.id + ' ' + comillas(nombreNodoL(a)) + ' (' + ultimo + ')'
        + (q ? ' — SUSTITUYE al cable ' + q.id + ' que traía ' + (qa ? qa.id + ' ' + comillas(nombreNodoL(qa)) : q.de) + ' a ese puerto (quitado)' : '');
    },
    desconectar(docs, m, o, refs) {
      let c;
      if (o.cable !== undefined) { const id = deRef(refs, o.cable, 'cable') || String(o.cable); c = cablesL(m).find(x => x.id === id); if (!c) falla('No hay ningún cable ' + comillas(o.cable)); }
      else {
        const de = nodoLDe(m, o.de, refs), a = nodoLDe(m, o.a, refs);
        const cs = cablesL(m).filter(x => x.de === de.id && x.a === a.id && (o.puerto === undefined || x.puerto === String(o.puerto)));
        if (!cs.length) falla('No hay cable de ' + de.id + ' a ' + a.id); if (cs.length > 1) falla('Hay ' + cs.length + ' cables de ' + de.id + ' a ' + a.id + ': di el "puerto" o el "cable"');
        c = cs[0];
      }
      ok(m.desconectar(c.id));
      return 'cable ' + c.id + ' quitado (' + c.de + ' → ' + c.a + ', ' + c.puerto + ')';
    },
    borrar(docs, m, o, refs) {
      const ns = lista(o.nodos !== undefined ? o.nodos : o.nodo).map(v => nodoLDe(m, v, refs));
      if (!ns.length) falla('Faltan los nodos');
      ok(m.borrarNodos(ns.map(n => n.id)));
      return plural(ns.length, 'nodo borrado', 'nodos borrados') + ' (' + ns.map(n => n.id + ' ' + comillas(nombreNodoL(n))).join(', ') + ') con sus cables';
    }
  };
  function editarLienzo(ctx, args) {
    const docs = ctx.docs, r = lienzoDe(docs, args.lienzo), antes = JSON.stringify(r.lienzo);
    const ops = args.operaciones;
    if (!Array.isArray(ops) || !ops.length) falla('Faltan las operaciones (una lista)');
    const m = modeloLienzo(r.lienzo, ctx), refs = new Map(), hechos = [];
    refs.ctx = ctx;                                               // para los duendes de Leo (ctx.equipo), si lo hay
    ops.forEach((o, i) => {
      const fn = OPS_LIENZO[nombreOperacion('editar_lienzo', o)];
      try {
        if (!fn) falla('no conozco la operación ' + comillas(opCruda(o)) + '. Operaciones: ' + Object.keys(OPS_LIENZO).join(', '));
        hechos.push((i + 1) + '. ' + fn(docs, m, o, refs));
      } catch (e) {
        if (e instanceof Falla) falla('La operación ' + (i + 1) + ' (' + (opCruda(o) || '?') + ') no se pudo: ' + e.message + '. No se cambió nada del lienzo.');
        throw e;
      }
    });
    const cambio = guardarL(ctx, r, m, antes);
    const creados = [...refs].map(([k, x]) => '$' + k + ' = ' + x.id);
    return { texto: 'Lienzo ' + comillas(r.lienzo.nombre) + ': ' + plural(ops.length, 'operación hecha', 'operaciones hechas') + '.\n' + hechos.join('\n')
      + (creados.length ? '\nCreados: ' + creados.join(', ') : '') + (cambio ? '' : '\n(nada cambió)'), datos: { refs: Object.fromEntries([...refs].map(([k, x]) => [k, x.id])) } };
  }
  /* ¿Algún `conectar` de este editar_lienzo sustituiría un cable que ya está? (para el permiso del asistente: quitar un cable de Leo
     también es borrar). Se prueba el lote entero sobre una copia del lienzo (el modelo de `modeloLienzo` lo es), en orden: un
     conectar que no suma un cable ha sustituido otro. Lo que no se entiende, no cuenta (la herramienta fallará). */
  function sustituyeCable(docs, args) {
    const a = args && typeof args === 'object' ? args : {};
    if (!Array.isArray(a.operaciones) || !docs) return false;
    let m;
    try { m = modeloLienzo(lienzoDe(docs, a.lienzo).lienzo, { docs }); } catch (_) { return false; }
    const refs = new Map();
    for (const o of a.operaciones) {
      const k = nombreOperacion('editar_lienzo', o), fn = OPS_LIENZO[k];
      if (!fn) continue;
      const n = cablesL(m).length;
      try { fn(docs, m, o, refs); } catch (_) { continue; }
      if (k === 'conectar' && cablesL(m).length <= n) return true;
    }
    return false;
  }
  /* escribir_documento › sustituir que se lleva mucho texto (para el permiso del asistente; revisión: sustituir todos los bloques
     por uno vacío dejaba el documento en blanco sin preguntar). `quitado`/`puesto`: los caracteres de texto de los bloques que se
     van y de lo que llega; `mucho` si lo que llega está vacío, o se pierden 200 caracteres o más y queda menos de la mitad. Si no se
     puede saber (el documento no se encuentra), `mucho` (que se pregunte). */
  const MUCHO_SUSTITUIR = 200;
  function quitaAlSustituir(docs, args) {
    const a = args && typeof args === 'object' ? args : {};
    let x; try { x = documentoDe({ docs }, a, false); } catch (_) { return { quitado: 0, puesto: 0, mucho: true }; }
    if (!x.nota) return { quitado: 0, puesto: 0, mucho: false };
    const bs = V().bloques(x.nota.html), d = Math.round(+a.desde), h = a.hasta === undefined || a.hasta === null ? d : Math.round(+a.hasta);
    if (!(d >= 1 && h >= d && h <= bs.length)) return { quitado: 0, puesto: 0, mucho: false };   // la herramienta no lo hará
    const largo = t => String(t || '').replace(/\s+/g, ' ').trim().length;
    const quitado = largo(bs.slice(d - 1, h).map(b => V().textoPlano(b.html)).join(' '));
    let c = a.contenido;
    if (typeof c === 'string' && a.formato === 'bloques') { try { c = JSON.parse(c); } catch (_) { /* tal cual */ } }
    const puesto = largo(Array.isArray(c) ? c.map(b => (b && typeof b === 'object' ? texto(b.texto) : texto(b))).join(' ')
      : a.formato === 'html' ? V().textoPlano(limpiarHtml(texto(c))) : texto(c));
    return { quitado, puesto, mucho: quitado > 0 && (puesto === 0 || (quitado - puesto >= MUCHO_SUSTITUIR && puesto < quitado / 2)) };
  }
  /* un nodo de un lienzo, para ver_enlace */
  function textoNodoLienzo(ctx, R) {
    const m = modeloLienzo(R.lienzo, ctx), n = nodoL(m, R.nodo.id), L = lineasNodoL(ctx.docs, m, n, desactualizadasL(m)).map(x => x.replace(/^- /, 'NODO '));
    const sale = cablesL(m).filter(c => c.de === n.id).map(c => { const b = nodoL(m, c.a); return b ? b.id + ' ' + comillas(nombreNodoL(b)) + ' (' + c.puerto + ')' : c.a; });
    if (sale.length) L.push('Su salida entra en: ' + sale.join(', '));
    L.push(esOp(n) ? '(Para ejecutarlo: ejecutar_nodo { lienzo: "' + R.lienzo.id + '", nodo: "' + n.id + '" }; el lienzo entero: leer_lienzo.)' : '(Es una entrada; lo que entra en las operaciones sale entero en ejecutar_nodo de cada una.)');
    return L;
  }

  /* ====================================================================
     La memoria de estilo (1.1.60, js/claquedraw/memoria.js)
     Leo: «implementa una memoria que recuerde la forma de escribir y el tono que le da el usuario, conforme el usuario hace
     correcciones, para que la IA lo considere». Dos: la del proyecto (en el archivo, `documentos.memoriaEstilo`: entra en el
     historial y se revierte como lo demás) y la general (de Leo, en los datos de la app: `ctx.memoriaGeneral` = { leer () → lista,
     guardar (lista, { titulo, antes }) → id para deshacerlo }, solo en la app; sin ella, lo general va a la del proyecto).
     ==================================================================== */
  const Me = () => C.memoria || (typeof require === 'function' ? (() => { try { return require('./memoria.js').memoria; } catch (_) { return null; } })() : null);
  /* sin el módulo (una página que no lo carga), la memoria no existe: no rompe nada */
  const conMemoria = () => { const m = Me(); if (!m) falla('Esta versión de ClapCraft no trae la memoria de estilo'); return m; };
  const AMBITO_TEXTO = { proyecto: 'del proyecto', general: 'general (todos los proyectos de Leo)' };
  function ambitoDe(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = plano(v);
    if (/^(gen|todo|siempre|global|leo)/.test(s)) return 'general';
    if (/^(proy|este|esta|histor|local)/.test(s)) return 'proyecto';
    falla('El ámbito es "proyecto" (esta historia, sus personajes) o "general" (cómo escribe Leo siempre)');
  }
  const estiloProyecto = docs => (docs.memoriaEstilo ? docs.memoriaEstilo() : Array.isArray(docs.datos.memoriaEstilo) ? docs.datos.memoriaEstilo : []);
  function fijarEstiloProyecto(docs, l) {
    if (docs.fijarMemoriaEstilo) return docs.fijarMemoriaEstilo(l);
    const x = conMemoria().sanear(l), antes = JSON.stringify(estiloProyecto(docs));
    if (JSON.stringify(x) === antes) return false;
    if (x.length) docs.datos.memoriaEstilo = x; else delete docs.datos.memoriaEstilo;
    return true;
  }
  const estiloGeneral = ctx => { try { return ctx.memoriaGeneral && typeof ctx.memoriaGeneral.leer === 'function' ? ctx.memoriaGeneral.leer() || [] : null; } catch (_) { return null; } };
  /* las dos, para el prompt o el encargo */
  const estiloDe = ctx => ({ proyecto: estiloProyecto(ctx.docs), general: estiloGeneral(ctx) || [] });
  function guardarGeneral(ctx, lista, antes, titulo) {
    const id = ctx.memoriaGeneral.guardar(lista, { antes, titulo });
    return id ? { id: String(id), titulo } : null;
  }
  function recordarEstilo(ctx, args) {
    const regla = texto(args.regla !== undefined ? args.regla : args.texto).trim();
    if (!regla) falla('Di la regla: una frase corta sobre la forma o el tono («Diálogos secos, sin muletillas»)');
    let amb = ambitoDe(args.ambito) || 'proyecto', nota = '';
    const G = estiloGeneral(ctx);
    if (amb === 'general' && !G) { amb = 'proyecto'; nota = ' (la memoria general solo existe dentro de la app de ClapCraft: la apunté en la del proyecto)'; }
    const lista = amb === 'general' ? G : estiloProyecto(ctx.docs);
    const ej = args.ejemplo && typeof args.ejemplo === 'object' ? args.ejemplo : null;
    const r = conMemoria().recordar(lista, { texto: regla, ejemplo: ej }, { ahora: ahoraDe(ctx), origen: 'chat' });
    if (r.error) falla(r.error);
    const titulo = 'Aprendió: ' + comillas(r.regla.texto);
    let entrada = null;
    if (amb === 'general') entrada = guardarGeneral(ctx, r.lista, lista, titulo);
    else if (fijarEstiloProyecto(ctx.docs, r.lista)) ctx.cambio({ memoria: 'proyecto' });
    const T = [(r.nueva ? 'Aprendido' : 'Ya estaba (ahora ' + r.regla.veces + ' veces)') + ': ' + comillas(r.regla.texto) + ' · memoria de estilo ' + AMBITO_TEXTO[amb] + nota + '.'];
    if (r.fundidas) T.push('Para caber, se juntaron ' + plural(r.fundidas, 'regla parecida', 'reglas parecidas') + '.');
    if (r.quitadas.length) T.push('Para caber, se quitó: ' + r.quitadas.map(comillas).join(', ') + '.');
    T.push('Leo la ve (y la cambia o la borra) en Claude › Memoria de estilo.');
    return Object.assign({ texto: T.join(' ') }, entrada ? { entrada } : {});
  }
  function olvidarEstilo(ctx, args) {
    const v = texto(args.regla !== undefined ? args.regla : args.texto !== undefined ? args.texto : args.id).trim();
    if (!v) falla('Di qué regla olvidar (su texto o su id)');
    const amb = ambitoDe(args.ambito), G = estiloGeneral(ctx);
    conMemoria();
    const probar = a => { const l = a === 'general' ? G : estiloProyecto(ctx.docs); if (!l) return null; const o = Me().olvidar(l, v); return o.error ? null : Object.assign(o, { ambito: a, antes: l }); };
    const o = amb ? probar(amb) : probar('proyecto') || probar('general');
    if (!o) falla('No hay ninguna regla así en la memoria de estilo' + (amb ? ' ' + AMBITO_TEXTO[amb] : '') + ' (ver_proyecto las lista)');
    const titulo = 'Olvidó: ' + comillas(o.quitada.texto);
    let entrada = null;
    if (o.ambito === 'general') entrada = guardarGeneral(ctx, o.lista, o.antes, titulo);
    else if (fijarEstiloProyecto(ctx.docs, o.lista)) ctx.cambio({ memoria: 'proyecto' });
    return Object.assign({ texto: 'Olvidado: ' + comillas(o.quitada.texto) + ' (memoria de estilo ' + AMBITO_TEXTO[o.ambito] + ').' }, entrada ? { entrada } : {});
  }
  /* la memoria en ver_proyecto: cada regla con su id y cuántas veces */
  function estiloTexto(ctx) {
    if (!Me()) return [];
    const m = estiloDe(ctx), gen = estiloGeneral(ctx), L = [];
    const linea = (r, amb) => '  - ' + r.id + ' [' + amb + (r.veces > 1 ? ', ' + r.veces + ' veces' : '') + (r.apagada ? ', APAGADA' : '') + '] ' + r.texto;
    m.proyecto.forEach(r => L.push(linea(r, 'proyecto')));
    (gen || []).forEach(r => L.push(linea(r, 'general')));
    const cab = 'MEMORIA DE ESTILO (cómo quiere Leo que suene lo que se escribe: respétala al escribir; recordar_estilo / olvidar_estilo la cambian)';
    return L.length ? [cab + ':'].concat(L) : [cab + ': vacía'];
  }

  /* ====================================================================
     El historial de Claude (js/claquedraw/historial.js): cada cambio queda apuntado con su parche y se puede revertir
     ==================================================================== */
  /* el título de un cambio, como lo dice el aviso de la app */
  function titularCambio(ctx, nombre, args) {
    const docs = ctx.docs, nomEsq = () => { try { return esquemaDe(docs, args.esquema).esquema.nombre; } catch (_) { return String(args.esquema || ''); } };
    const ops = lista(args.operaciones).length;
    if (nombre === 'editar_esquema') return 'Cambió el esquema «' + nomEsq() + '»' + (ops > 1 ? ' (' + ops + ' cambios)' : '');
    if (nombre === 'escribir_documento') {
      if (args.esquema) return 'Escribió en el documento de «' + nomEsq() + '»';
      try { return 'Escribió en la nota «' + notaDe(docs, args.nota, args.biblioteca ? bibliotecaDe(docs, args.biblioteca).sub.id : null).titulo + '»'; } catch (_) { return 'Escribió en una nota'; }
    }
    if (nombre === 'editar_biblioteca') { try { const b = bibliotecaDe(docs, args.biblioteca).sub; return 'Organizó ' + (esBibPlantillas(b) ? 'las plantillas' : esBibFormulas(b) ? 'las fórmulas' : 'la biblioteca «' + b.nombre + '»') + (ops > 1 ? ' (' + ops + ' cambios)' : ''); } catch (_) { return 'Organizó una biblioteca'; } }
    if (nombre === 'editar_proyecto') return 'Cambió el proyecto' + (ops > 1 ? ' (' + ops + ' cambios)' : '');
    const nomLz = () => { try { return lienzoDe(docs, args.lienzo).lienzo.nombre; } catch (_) { return String(args.lienzo || ''); } };
    if (nombre === 'editar_lienzo') return 'Cambió el lienzo «' + nomLz() + '»' + (ops > 1 ? ' (' + ops + ' cambios)' : '');
    if (nombre === 'completar_nodo') {
      let nn = String(args.nodo || ''); try { const r = lienzoDe(docs, args.lienzo), n = (r.lienzo.nodos || []).find(x => x.id === nn) || nodoLDe(modeloLienzo(r.lienzo), nn); nn = nombreNodoL(n); } catch (_) {}
      return (args.error ? 'Apuntó un error en' : 'Completó') + ' «' + nn + '» del lienzo «' + nomLz() + '»';
    }
    if (nombre === 'recordar_estilo') return 'Aprendió: ' + comillas(corto(texto(args.regla !== undefined ? args.regla : args.texto), 80));
    if (nombre === 'olvidar_estilo') return 'Olvidó una regla de estilo: ' + comillas(corto(texto(args.regla !== undefined ? args.regla : args.texto !== undefined ? args.texto : args.id), 80));
    return 'Hizo cambios';
  }
  /* dónde fue (para «Ir» y para «Ver cambios»): un esquema, una nota, una biblioteca o el proyecto */
  function dondeDe(ctx, nombre, args) {
    const docs = ctx.docs;
    try {
      if (nombre === 'editar_esquema') { const r = esquemaDe(docs, args.esquema); return { tipo: 'esquema', id: r.esquema.id, nombre: r.esquema.nombre }; }
      if (nombre === 'escribir_documento') {
        const x = documentoDe(ctx, args, false);
        return x.nota ? Object.assign({ tipo: 'nota', id: x.nota.id, nombre: x.nota.titulo }, x.esquema ? { esquema: x.esquema.esquema.id } : {}) : null;
      }
      if (nombre === 'editar_biblioteca') { const r = bibliotecaDe(docs, args.biblioteca); return { tipo: 'biblioteca', id: r.sub.id, nombre: r.sub.nombre }; }
      if (nombre === 'editar_lienzo' || nombre === 'completar_nodo') { const r = lienzoDe(docs, args.lienzo); return { tipo: 'lienzo', id: r.lienzo.id, nombre: r.lienzo.nombre }; }
    } catch (_) {}
    return { tipo: 'proyecto' };
  }
  function verHistorial(ctx, args) {
    const docs = ctx.docs, es = C.historial.lista(docs).reverse(), max = Math.max(1, Math.min(150, +args.limite || 20));
    if (!es.length) return { texto: 'Claude aún no ha cambiado nada en este proyecto.' };
    const L = ['HISTORIAL DE CLAUDE · ' + comillas((ctx.proyecto && ctx.proyecto.nombre) || '?') + ' · ' + plural(es.length, 'cambio', 'cambios') + (es.length > max ? ' (los ' + max + ' últimos)' : ''), ''];
    es.slice(0, max).forEach(e => {
      L.push('- ' + e.id + ' · ' + fecha(e.fecha) + (e.origen ? ' · ' + e.origen : '') + ' · ' + (e.modo === 'archivo' ? 'en el archivo' : 'en vivo') + ' · ' + e.titulo
        + (e.revertido ? ' · REVERTIDO ' + fecha(e.revertido.fecha) + (e.revertido.por ? ' por ' + e.revertido.por : '') : e.parche ? '' : ' · ya no se puede revertir'));
      if (args.detalle !== false) String(e.detalle || '').split('\n').filter(l => /^\d+\. /.test(l)).slice(0, 12).forEach(l => L.push('    ' + l));
    });
    return { texto: L.join('\n') };
  }
  function revertirCambio(ctx, args) {
    const docs = ctx.docs, id = String(args.cambio || args.id || '').trim();
    if (!id) falla('Di qué cambio (su id, de ver_historial)');
    const e = C.historial.entrada(docs, id); if (!e) falla('No hay ningún cambio ' + comillas(id) + ' en el historial');
    const r = C.historial.revertirEntrada(docs, id, { forzar: !!args.forzar, ahora: ahoraDe(ctx), por: ctx.origen || 'Claude' });
    if (!r.ok) {
      if (r.choques && r.choques.length) falla('No lo revertí: después de ese cambio se tocaron algunas de las mismas cosas (' + r.choques.slice(0, 6).join('; ') + (r.choques.length > 6 ? '…' : '') + '). Pregúntale a Leo; con "forzar": true se revierte igual y en esas partes se pierde lo de después.');
      falla(r.aviso);
    }
    if (r.nombreProyecto) { if (ctx.ponerNombre) ctx.ponerNombre(r.nombreProyecto); if (ctx.proyecto) ctx.proyecto.nombre = r.nombreProyecto; }
    ctx.cambio({ revertido: id });
    return { texto: 'Revertido ' + e.id + ': ' + e.titulo + (r.choques.length ? ' (de todos modos: ' + plural(r.choques.length, 'cosa tocada', 'cosas tocadas') + ' después)' : '') + (r.avisos.length ? '\n' + r.avisos.join('\n') : '') };
  }
  /* Cómo estaba y cómo está lo que tocó un cambio, en texto: el esquema, la nota, la biblioteca o el árbol. Para «Ver cambios». */
  function vistaCambio(docs, id) {
    const e = C.historial.entrada(docs, id), antes = e && C.historial.antesDe(docs, id);
    if (!e || !antes) return null;
    const dA = new C.Documentos(antes), ctxA = { docs: dA, proyecto: { nombre: 'Antes' } }, ctxB = { docs, proyecto: { nombre: 'Ahora' } };
    const d = e.donde || { tipo: 'proyecto' };
    const texto = (c, fn) => { try { return fn(c); } catch (_) { return null; } };
    let a, b, html = false;
    if (d.tipo === 'esquema') {
      const t = c => { const r = c.docs.esquema(d.id); return r ? textoEsquema(c.docs, r, modeloDe(c.docs, r)) : '(no existe)'; };
      a = texto(ctxA, t); b = texto(ctxB, t);
    } else if (d.tipo === 'nota') {
      const n = c => { const x = c.docs.nota(d.id); return x ? x.html : ''; };
      a = n(ctxA); b = n(ctxB); html = true;
    } else if (d.tipo === 'lienzo') {
      const t = c => { const r = c.docs.lienzo ? c.docs.lienzo(d.id) : null; return r ? textoLienzo(c, r, modeloLienzo(r.lienzo, c)) : '(no existe)'; };
      a = texto(ctxA, t); b = texto(ctxB, t);
    } else if (d.tipo === 'biblioteca') {
      a = texto(ctxA, c => leerBiblioteca(c, { biblioteca: d.id }).texto) || '(no existe)'; b = texto(ctxB, c => leerBiblioteca(c, { biblioteca: d.id }).texto) || '(no existe)';
    } else { a = verProyecto(ctxA).texto.split('\n').slice(1).join('\n'); b = verProyecto(ctxB).texto.split('\n').slice(1).join('\n'); }
    const aHtml = x => String(x || '').split('\n').map(l => '<p>' + C.historial.sinIds(l).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').join('');
    return { titulo: e.titulo, antes: html ? a : aHtml(a), ahora: html ? b : aHtml(b) };
  }

  /* ====================================================================
     Las herramientas (nombre, descripción y esquema de entrada, como las pide MCP)
     ==================================================================== */
  const P_PROYECTO = { type: 'string', description: 'El proyecto: la ruta del .clapcraft, su nombre (como sale en listar_proyectos), un enlace clapcraft:// suyo o nada para el que está delante en ClapCraft (o el de los enlaces que lleve la petición).' };
  const P_ESQUEMA = { type: 'string', description: 'Id, nombre o enlace (clapcraft://…) del esquema (ver_proyecto los lista).' };
  const P_LIENZO = { type: 'string', description: 'Id, nombre o enlace (clapcraft://…/lienzo/<id>, o el de uno de sus nodos) del lienzo (ver_proyecto los lista).' };
  const P_NODO_L = { type: 'string', description: 'Id, título o enlace (…/lienzo/<id>/nodo/<id>) del nodo del lienzo (leer_lienzo los lista).' };
  const COLORES = 'rojo, ladrillo, cobre, ambar, oro, lima, oliva, verde, esmeralda, teal, turquesa, cielo, azul, marino, pizarra, indigo, violeta, uva, ciruela, magenta, rosa, vino, salvia, gris';
  const LISTA = [
    { name: 'listar_proyectos', title: 'Proyectos de ClapCraft', soloServidor: true, annotations: { readOnlyHint: true },
      description: 'Lista los proyectos de ClapCraft: los abiertos en la app (se trabaja en vivo: los cambios se ven al momento y entran en Deshacer), los recientes y los .clapcraft que hay en el equipo. Empieza por aquí si no sabes qué proyecto usar.',
      inputSchema: { type: 'object', properties: { buscar: { type: 'string', description: 'Filtra por nombre (opcional).' } } } },
    { name: 'ver_proyecto', title: 'Árbol del proyecto', annotations: { readOnlyHint: true },
      description: 'El árbol de un proyecto: contenedores, carpetas, grupos, esquemas (con cuántas tramas, nodos y notas tienen, su documento y las bibliotecas conectadas), bibliotecas (con sus esquemas conectados), lienzos de nodos (con cuántos nodos y operaciones pendientes), personajes, esquemas de personaje, las plantillas de nota, las fórmulas (prompts para las operaciones de IA de los lienzos) y la papelera, con sus ids. Si está abierto en ClapCraft, también qué se ve en pantalla (esquema montado, documento abierto, lo elegido).',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO } } },
    { name: 'leer_esquema', title: 'Leer un esquema', annotations: { readOnlyHint: true },
      description: 'Un esquema de pasos entero: las bibliotecas conectadas con él, sus tramas (filas, de arriba abajo), sus actos (tramos de columnas) y la línea del tiempo columna a columna con cada nodo (título, descripción en Markdown, color), cada salto entre tramas (cuadro = cambio de escena, rombo = salto alternativo) y cada nota (de un nodo, de un enlace entre dos nodos seguidos o de una raya de la trama). Las columnas se cuentan desde 1, como en el tablero. formato "texto" (por defecto, legible) o "json".',
      inputSchema: { type: 'object', required: ['esquema'], properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA,
        formato: { type: 'string', enum: ['texto', 'json'] }, descripciones: { type: 'boolean', description: 'Incluir las descripciones de los nodos (por defecto sí).' } } } },
    { name: 'editar_esquema', title: 'Editar un esquema', annotations: { destructiveHint: true },
      description: 'Cambia un esquema con una lista de operaciones que se hace ENTERA O NADA (si una falla, no se cambia nada y se dice cuál y por qué). Columnas desde 1. Cada elemento se nombra por su id (de leer_esquema), por su nombre si es único o por su enlace (clapcraft://…); lo creado en la misma lista se nombra con "ref": {"op":"crear_trama","ref":"romance","nombre":"Romance"} y luego "trama":"$romance". Reglas del tablero: en una celda (trama + columna) cabe un solo nodo; un salto une dos tramas en la misma columna y sus dos extremos son cuadros o rombos (no nodos normales); un cuadro no llega a una trama alternativa; queda siempre una trama principal; los actos no se pisan y moverlos no mueve nodos; una nota va en un nodo, entre dos nodos consecutivos de una trama o en la raya de una trama entre una columna y la siguiente.\n'
        + 'Operaciones (campo "op"):\n'
        + '· crear_trama {nombre, tipo: principal|secundaria|alternativa, color, posicion (1 = arriba), ref} · editar_trama {trama, nombre, tipo, color, oculta, descartada, posicion} · borrar_trama {trama} (con sus nodos)\n'
        + '· crear_acto {nombre, desde (columna), columnas (cuántas), fondo: auto|ninguno|azul|violeta|verde|ambar|rojo|gris, ref} · editar_acto {acto, nombre, fondo, desde, columnas} · borrar_acto {acto} (las columnas se quedan)\n'
        + '· insertar_columnas {columna, cantidad, lado: izquierda|derecha} (corre lo de detrás) · borrar_columnas {columnas: [..]} o {desde, hasta} (borra sus nodos) · mover_columnas {columnas, destino}\n'
        + '· crear_nodo {trama, columna (si falta, detrás del último de su trama), titulo, descripcion (Markdown), color, descartado, ref} · editar_nodo {nodo, titulo, descripcion, color, descartado, color_enlace} · mover_nodo {nodo, columna, trama, intercambiar} · mover_nodos {nodos: [..], columnas (±), tramas (±)} · borrar_nodo {nodo}\n'
        + '· crear_salto {desde (trama de salida), hacia (trama de llegada), columna, titulo, forma: cuadro|rombo, ref} · editar_salto {salto, forma, invertir, columna, titulo} · borrar_salto {salto}\n'
        + '· crear_nota {texto, nodo | entre: [nodo, nodo] | trama + columna, color, ref} · editar_nota {nota, texto, color} · mover_nota {nota, nodo | entre | trama + columna, antes_de} · borrar_nota {nota}\n'
        + 'Colores: ' + COLORES + ' (o "trama" / "papel" para quitarlo).',
      inputSchema: { type: 'object', required: ['esquema', 'operaciones'], properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA,
        operaciones: { type: 'array', description: 'Las operaciones, en orden.', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_ESQUEMA) } } } } } } },
    { name: 'leer_documento', title: 'Leer un documento', annotations: { readOnlyHint: true },
      description: 'El texto de un documento: el guion de un esquema ("esquema") o una nota de biblioteca ("nota"). Con formato "texto" (por defecto) un guion sale al estilo Fountain —escena con INT./EXT. (o "." delante), PERSONAJE en mayúsculas con su (paréntesis) y su diálogo debajo, "> TRANSICIÓN:", "# ACTO", "## encabezado secundario", [[nota]], "^" tras el segundo personaje de un diálogo doble, {toma} y {montaje}— y una nota de prosa sale en Markdown. {bloque N: imagen} es algo que no es texto. Con numerar, cada bloque lleva [N] (para sustituir tramos). También "bloques" (JSON) o "html", una versión guardada y un tramo (desde, hasta).',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA, nota: { type: 'string', description: 'Id o título de una nota de biblioteca (o de una plantilla).' },
        biblioteca: { type: 'string', description: 'Para buscar la nota por título en una biblioteca concreta.' },
        formato: { type: 'string', enum: ['texto', 'bloques', 'html'] }, como: { type: 'string', enum: ['guion', 'prosa'], description: 'Cómo leerlo (se deduce solo).' },
        numerar: { type: 'boolean' }, desde: { type: 'integer' }, hasta: { type: 'integer' }, version: { type: 'string', description: 'Nombre o id de una versión guardada.' } } } },
    { name: 'escribir_documento', title: 'Escribir en un documento', annotations: { destructiveHint: true },
      description: 'Escribe en el guion de un esquema (lo crea si aún no tiene) o en una nota de biblioteca. El contenido va en el mismo texto que da leer_documento: como "guion" (el de un esquema, por defecto) al estilo Fountain —INT./EXT. para escenas, NOMBRE en mayúsculas y debajo (paréntesis) y diálogo sin línea en blanco, "> CORTE A:" para transiciones, "# ACTO", "## secundario", [[nota]], "NOMBRE ^" para el diálogo doble; lo demás es acción; "!" delante fuerza acción— o como "prosa" (Markdown). Cualquier bloque puede forzar su tipo con {escena}, {subescena}, {accion}, {personaje}, {parentesis}, {dialogo}, {transicion}, {toma}, {acto}, {nota}, {montaje}, {parrafo}, {titulo1}… al principio; "{bloque N}" conserva el bloque N tal como estaba (imágenes). Una portada al principio con "Título:", "Episodio:", "Escrito por:", "Basado en:", "Versión:", "Fecha:", "Contacto:". Los personajes nuevos entran solos en el elenco con su color. Modos: reemplazar (por defecto), anadir (al final), insertar (antes_de N) o sustituir (desde N hasta M, con los números de leer_documento numerar). Antes de reemplazar o sustituir se guarda lo que había como versión «Antes de Claude».',
      inputSchema: { type: 'object', required: ['contenido'], properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA, nota: { type: 'string' }, biblioteca: { type: 'string' },
        contenido: { type: 'string', description: 'El texto (con formato "bloques", la lista JSON [{"tipo": …, "texto": …}] escrita como texto).' }, formato: { type: 'string', enum: ['texto', 'bloques', 'html'] },
        como: { type: 'string', enum: ['guion', 'prosa'] }, modo: { type: 'string', enum: ['reemplazar', 'anadir', 'insertar', 'sustituir'] },
        desde: { type: 'integer' }, hasta: { type: 'integer' }, antes_de: { type: 'integer' }, titulo: { type: 'string', description: 'Título nuevo del documento (opcional).' } } } },
    { name: 'leer_biblioteca', title: 'Leer una biblioteca', annotations: { readOnlyHint: true },
      description: 'Una biblioteca (o la de un personaje, «Plantillas»: la de las plantillas de nota, o «Fórmulas»: la de las fórmulas, con su texto plano): los esquemas conectados con ella, sus secciones, segmentos y notas, con ids, fechas, palabras y un extracto (y, en las que son fragmentos, de qué esquema, sus nodos, sus segundos y su puesto); con contenido: true, el texto entero de cada nota.',
      inputSchema: { type: 'object', required: ['biblioteca'], properties: { proyecto: P_PROYECTO, biblioteca: { type: 'string', description: 'Id, nombre o enlace (el de un personaje también vale; «Plantillas» para las plantillas, «Fórmulas» para las fórmulas).' }, contenido: { type: 'boolean' } } } },
    { name: 'editar_biblioteca', title: 'Organizar una biblioteca', annotations: { destructiveHint: true },
      description: 'Operaciones en una biblioteca, entera o nada: crear_seccion {nombre, ref} · renombrar_seccion {seccion, nombre} · borrar_seccion {seccion} (sus segmentos vuelven a la de partida) · crear_segmento {nombre, color, seccion, ref} · editar_segmento {segmento, nombre, color, seccion} · borrar_segmento {segmento} (sus notas a la bandeja) · crear_nota {titulo, contenido (Markdown), segmento, color, arriba, fragmento, plantilla (id, título o enlace de una plantilla de ver_proyecto: la nota sale de ella, con sus variables rellenas, sus personajes y su color; «titulo», si se da, es su título y el que rellena {{titulo}}; sin él, el de la plantilla; «contenido» va detrás), ref} · editar_nota {nota, titulo, color, segmento, fragmento} · mover_nota {nota, segmento, biblioteca, antes_de} · tirar_nota {nota} (a la papelera). El texto de una nota que ya existe se cambia con escribir_documento. **Fragmentos** (para vídeo): "fragmento": { esquema, nodos (ids, títulos o enlaces de sus nodos), segundos, orden (su puesto, desde 1), bloques: [desde, hasta] (los del guion, de preparar_fragmentos) } marca la nota como un tramo de ese esquema (en editar_nota, lo que no se da se conserva; null lo quita); en el Markdown del contenido, ```prompt Título … ``` es un bloque de prompt y ```aviso:note Título … ``` (o info, tip, success, question, warning…) un aviso. **Plantillas**: la biblioteca «Plantillas» (id plantillas:biblioteca; por su nombre, si ninguna biblioteca normal se llama así) guarda las plantillas de nota; ahí crear_nota (sin "plantilla") crea una plantilla nueva, y en su texto van variables que se rellenan al usarla: {{titulo}}, {{fecha}}, {{hora}}, {{ayer}}, {{mañana}} (con formato: {{fecha:dddd D [de] MMMM}}), {{proyecto}} y {{cursor}}. **Fórmulas**: la biblioteca «Fórmulas» (id formulas:biblioteca; por su nombre, si ninguna normal se llama así) guarda prompts reutilizables para las operaciones de IA de los lienzos; ahí crear_nota { titulo, contenido } crea una fórmula de SOLO TEXTO (el Markdown se aplana) y {{instruccion}} en su texto dice dónde va lo que Leo escribe en «Qué escribir» de la operación. Colores de segmento: 0–15 o su nombre (Azul, Verde, Terracota, Violeta, Ámbar, Rosa, Teal, Oliva, Índigo, Coral, Ciruela, Arena, Cielo, Lima, Óxido, Grafito); de nota, los 24 tonos (' + COLORES + ').',
      inputSchema: { type: 'object', required: ['biblioteca', 'operaciones'], properties: { proyecto: P_PROYECTO, biblioteca: { type: 'string' },
        operaciones: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_BIBLIOTECA) } } } } } } },
    { name: 'editar_proyecto', title: 'Organizar el proyecto', annotations: { destructiveHint: true },
      description: 'La estructura del proyecto, entera o nada: renombrar_proyecto {nombre} · crear_contenedor {nombre, ref} · renombrar_contenedor · eliminar_contenedor (sus esquemas y bibliotecas a la papelera) · crear_esquema {contenedor, nombre, carpeta, ref} (nace con tres actos y la trama Principal) · renombrar_esquema · duplicar_esquema · mover_esquema {esquema, contenedor, carpeta} · tirar_esquema (a la papelera) · crear_biblioteca {contenedor, nombre, carpeta, ref} · renombrar_biblioteca · duplicar_biblioteca · mover_biblioteca · tirar_biblioteca · crear_carpeta {contenedor | dentro_de, nombre, color: azul|violeta|verde|ambar|rojo|gris} · renombrar_carpeta · eliminar_carpeta (lo de dentro sube) · agrupar {elementos: [ids], nombre} · desagrupar {grupo} · conectar {esquema, biblioteca} / desconectar {esquema, biblioteca} (conexiones de muchos a muchos, aparte de los grupos: la biblioteca donde van los fragmentos de un esquema; no valen la de las plantillas ni la de un personaje) · crear_personaje {nombre, color} · renombrar_personaje {personaje, nombre} (lo cambia en todos los documentos) · colorear_personaje {personaje, color} · guardar_como_plantilla {nota, segmento (de las plantillas; sin él, su bandeja), ref} (una copia de la nota en «Plantillas»; la nota no cambia) · crear_lienzo {contenedor, nombre, carpeta, ref} (un lienzo de nodos vacío; se arma con editar_lienzo) · renombrar_lienzo {lienzo, nombre} · duplicar_lienzo {lienzo} · mover_lienzo {lienzo, contenedor, carpeta} · tirar_lienzo {lienzo} (a la papelera) · restaurar {elemento} (de la papelera). La biblioteca de las plantillas no se renombra, mueve, duplica, agrupa ni tira.',
      inputSchema: { type: 'object', required: ['operaciones'], properties: { proyecto: P_PROYECTO,
        operaciones: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_PROYECTO) } } } } } } },
    { name: 'preparar_fragmentos', title: 'Partir un guion en fragmentos', annotations: { readOnlyHint: true },
      description: 'Para adaptar un esquema a vídeo por tramos cortos (Seedance y parecidos, hasta 15 s por toma). NO ESCRIBE NADA: lee el guion del esquema (o, si aún no tiene, sus nodos), lo parte en escenas y beats en orden, estima la duración de cada uno (diálogo a 2,5 palabras por segundo, acción ≈ 1,1 s por renglón de guion, 1 página ≈ 1 minuto) y propone cortes de segundos_max como mucho sin cruzar de una escena a otra, con sus bloques del guion, sus nodos (por los enlaces y títulos que nombra el guion) y su texto. Dice también las bibliotecas conectadas (donde van las notas) y los fragmentos que ya hay. Después se escribe una nota por fragmento con editar_biblioteca › crear_nota { fragmento }.',
      inputSchema: { type: 'object', required: ['esquema'], properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA,
        segundos_max: { type: 'number', description: 'Lo más que dura un fragmento (15 por defecto: el de Seedance).' }, segundos_min: { type: 'number', description: 'Por debajo, el último de una escena se une al anterior si cabe (4 por defecto).' },
        fuente: { type: 'string', enum: ['auto', 'guion', 'esquema'], description: 'De dónde partir: el guion (por defecto, si lo hay) o los nodos del esquema.' }, formato: { type: 'string', enum: ['texto', 'json'] } } } },
    { name: 'leer_lienzo', title: 'Leer un lienzo de nodos', annotations: { readOnlyHint: true },
      description: 'Un lienzo de nodos (como los «Space» de Dreamina, pero para guiones): sus ENTRADAS (texto, imagen, nota, segmento, biblioteca, esquema, personaje: a qué apunta cada una, o si está rota), sus OPERACIONES (generar guion, partir en fragmentos, sacar escaleta, resumir, reescribir, traducir, instrucción libre: su estado —sin ejecutar, PENDIENTE, hecho, ERROR, desactualizada—, instrucción, fórmulas y duendes elegidos, opciones, destino, qué entra por cada puerto y su salida) y los cables. Dice las PENDIENTES en el orden en que se ejecutan: cuando Leo pulsa ▶ en ClapCraft (o dice «ejecuta el lienzo»), hazlas en ese orden, cada una con ejecutar_nodo → escribir la salida → completar_nodo.',
      inputSchema: { type: 'object', required: ['lienzo'], properties: { proyecto: P_PROYECTO, lienzo: P_LIENZO, formato: { type: 'string', enum: ['texto', 'json'] } } } },
    { name: 'editar_lienzo', title: 'Armar un lienzo', annotations: { destructiveHint: true },
      description: 'Cambia un lienzo de nodos con una lista de operaciones que se hace ENTERA O NADA. Los nodos se nombran por su id (de leer_lienzo), su título si es único o su enlace; lo creado en la misma lista, con "ref" y "$ref".\n'
        + 'Operaciones (campo "op"):\n'
        + '· crear_nodo {tipo, x, y (sin ellos, las entradas en columna a la izquierda y las operaciones a la derecha), titulo, ref, y según el tipo:} texto {texto (Markdown)} · imagen {src (data:image/…;base64), alt} · nota {nota (id, título o enlace)} · segmento {biblioteca, segmento (o "bandeja"), o el enlace del segmento} · biblioteca {biblioteca} · esquema {esquema} · personaje {personaje} · generar {instruccion, modo: guion|prosa, destino} · partir {segundos_max (15), instruccion, destino} · escaleta {instruccion, destino} · resumir {instruccion, destino} · reescribir {tono, instruccion, destino} · traducir {idioma, instruccion, destino} · prompt {instruccion, destino}\n'
        + '· editar_nodo {nodo, titulo y los campos de su tipo} · mover {nodo | nodos, x, y | dx, dy} · conectar {de, a, puerto (sin él, el primero que acepte lo que da `de`), ref} · desconectar {cable | de, a, puerto} · borrar {nodo | nodos} (con sus cables)\n'
        + 'Puertos: generar ← contexto (varios), esquema (uno: la estructura a seguir) · partir ← guion (uno, obligatorio: un esquema o la salida de un generar), contexto · escaleta, resumir, reescribir, traducir ← fuente (una), contexto · prompt ← contexto. La salida de una operación entra en otra (generar → partir); no hay ciclos y a una entrada no llega nada.\n'
        + 'Destino: {esquema} (generar, escaleta, prompt: el documento o el tablero de ese esquema) · {biblioteca, segmento} (partir, resumir, reescribir, traducir, prompt: ahí la nota o las notas) · {nuevo: {contenedor, nombre}} (Claude lo crea al ejecutar) · "sitio" (resumir, reescribir, traducir, prompt: una versión nueva del guion de la fuente).\n'
        + 'Fórmulas: en crear_nodo / editar_nodo de cualquier operación, formulas: [ids, títulos o enlaces de las fórmulas de «Fórmulas» (ver_proyecto las lista)], en orden (sustituye la lista; [] las quita): prompts reutilizables de Leo —tono, formato, reglas— que van con la instrucción; con alguna, la instrucción puede ir vacía.\n'
        + 'Duendes: duendes: [{ id, nombre, personalidad, rol: revisar|transformar, veto }] (o el id o nombre de uno ya elegido), en orden, seis como mucho ([] los quita): los duendes especiales de Leo con cuya personalidad sale la salida; se guardan tal cual (la personalidad no cambia).',
      inputSchema: { type: 'object', required: ['lienzo', 'operaciones'], properties: { proyecto: P_PROYECTO, lienzo: P_LIENZO,
        operaciones: { type: 'array', description: 'Las operaciones, en orden.', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_LIENZO) } } } } } } },
    { name: 'ejecutar_nodo', title: 'El encargo de un nodo del lienzo', annotations: { readOnlyHint: true },
      description: 'NO ESCRIBE NADA: da el encargo completo de una operación de un lienzo para que la hagas tú —su tipo, la instrucción de Leo (con sus FÓRMULAS, si eligió alguna: ya compuestas, en orden, y avisa de las que ya no están; y sus DUENDES, con la personalidad con la que tiene que salir), sus opciones, su destino y el contenido de TODO lo que le entra, ya resuelto por puerto: el texto de las notas y segmentos (Markdown, o guion al estilo Fountain), la estructura y el guion de un esquema, la hoja y las apariciones de un personaje, la salida de una operación anterior leída de lo que creó— con las IMÁGENES de esas notas y de los nodos de imagen adjuntas como imágenes (reducidas a 1024 px de lado largo; como mucho 8 por encargo: las demás se nombran). Termina con los pasos para escribir la salida en ClapCraft (escribir_documento, editar_esquema, editar_biblioteca, preparar_fragmentos…) y cómo llamar a completar_nodo. Si entra una operación que aún no tiene salida, lo dice: hazla antes.',
      inputSchema: { type: 'object', required: ['lienzo', 'nodo'], properties: { proyecto: P_PROYECTO, lienzo: P_LIENZO, nodo: P_NODO_L } } },
    { name: 'completar_nodo', title: 'Completar un nodo del lienzo', annotations: { destructiveHint: false },
      description: 'Le dice a una operación del lienzo qué salió, cuando ya escribiste su salida con las otras herramientas (o qué falló): la marca hecha (deja de estar pendiente, enseña la salida como chips que llevan a lo creado) o con error. Comprueba que la salida existe y que es la de su destino (el esquema del destino; en su sitio, lo de la fuente; notas de la biblioteca del destino, nunca de lo que entra ni plantillas o fórmulas): { tipo: "documento", esquema } (el guion escrito de ese esquema; generar, y resumir/reescribir/traducir/prompt en su sitio) · { tipo: "fragmentos", biblioteca, esquema, notas: [ids] } (partir; sin «notas», las que son fragmento de ese esquema en esa biblioteca) · { tipo: "esquema", esquema } (escaleta) · { tipo: "nota", nota } (resumir, reescribir, traducir, prompt; la nota por su id, su enlace o su título exacto). Con "error" (y sin salida), la deja en rojo con ese texto. "mensaje": una línea opcional para Leo.',
      inputSchema: { type: 'object', required: ['lienzo', 'nodo'], properties: { proyecto: P_PROYECTO, lienzo: P_LIENZO, nodo: P_NODO_L,
        salida: { type: 'object', description: '{ tipo, esquema | nota | biblioteca, notas }' }, error: { type: 'string', description: 'Si no se pudo: por qué.' }, mensaje: { type: 'string' } } } },
    { name: 'buscar', title: 'Buscar en el proyecto', annotations: { readOnlyHint: true },
      description: 'Busca un texto (sin distinguir mayúsculas ni acentos) en los nombres de esquemas, tramas, actos, nodos y sus descripciones, notas del esquema, bibliotecas, segmentos, documentos (y plantillas de nota, marcadas como tales), personajes y lienzos (sus nodos, textos e instrucciones), y las fórmulas. Dice dónde está cada cosa, con su id.',
      inputSchema: { type: 'object', required: ['texto'], properties: { proyecto: P_PROYECTO, texto: { type: 'string' }, limite: { type: 'integer' } } } },
    { name: 'ver_enlace', title: 'Leer enlaces de ClapCraft', annotations: { readOnlyHint: true },
      description: 'Leo copia en ClapCraft enlaces a lo que quiere enseñarte («Copiar enlace para Claude», o Cmd+Shift+C con algo elegido) y los pega en la conversación: son Markdown como [Nodo «La broma» · esquema «Piloto»](clapcraft://analisis-de-the-office/esquema/d…/nodo/p6). Pásale el texto con los enlaces (uno o varios, tal cual) y dice qué es cada uno —proyecto, contenedor, carpeta, grupo, esquema, nodo, salto, trama, acto, nota del esquema, enlace entre dos nodos, raya, columnas, guion de un esquema o un tramo de él (?b=12-14: sus bloques), biblioteca, sección, segmento, nota de biblioteca, personaje, lienzo o nodo de un lienzo—, dónde está y lo que tiene, con los ids para cambiarlo. Un enlace también vale en lugar del id en cualquier otra herramienta.',
      inputSchema: { type: 'object', required: ['enlace'], properties: { proyecto: P_PROYECTO, enlace: { type: 'string', description: 'Uno o varios enlaces clapcraft://, o el texto que los lleva.' } } } },
    { name: 'ver_historial', title: 'Historial de Claude', annotations: { readOnlyHint: true },
      description: 'Los cambios que Claude ha hecho en el proyecto (en vivo o sobre su archivo), del más nuevo al más viejo: su id, cuándo, desde dónde, qué fue y si ya se revirtió. Leo los ve en ClapCraft › Claude › Historial de cambios.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, limite: { type: 'integer', description: 'Cuántos (20 por defecto).' }, detalle: { type: 'boolean', description: 'Con las operaciones de cada uno (por defecto sí).' } } } },
    { name: 'revertir_cambio', title: 'Revertir un cambio de Claude', annotations: { destructiveHint: true },
      description: 'Deshace un cambio del historial de Claude (su id, de ver_historial) sin tocar lo que vino después. Si después se tocaron algunas de las mismas cosas, no hace nada y dice cuáles: pregúntale a Leo antes de repetir con forzar: true (entonces, en esas partes, se pierde lo de después).',
      inputSchema: { type: 'object', required: ['cambio'], properties: { proyecto: P_PROYECTO, cambio: { type: 'string', description: 'El id del cambio.' }, forzar: { type: 'boolean' } } } },
    { name: 'usar_formula', title: 'Usar una fórmula', annotations: { readOnlyHint: true },
      description: 'El texto de una FÓRMULA del proyecto: un prompt reutilizable de Leo (tono, formato, estilo, reglas) de la biblioteca «Fórmulas». Como una skill: si Leo nombra una fórmula o lo que pide encaja con una (ver_proyecto las lista), cárgala y síguela en ese trabajo. Donde dice {{instruccion}} va lo que pide Leo. No escribe nada.',
      inputSchema: { type: 'object', required: ['formula'], properties: { proyecto: P_PROYECTO, formula: { type: 'string', description: 'Id, título o enlace de la fórmula.' } } } },
    { name: 'recordar_estilo', title: 'Recordar algo del estilo de Leo', annotations: { destructiveHint: false },
      description: 'Apunta en la MEMORIA DE ESTILO una regla de FORMA o TONO que Leo quiere en lo que se le escribe, para respetarla desde ahora. Úsala cuando Leo corrija cómo suena algo («más seco», «así no hablaría Mara», «deja de usar metáforas», «sin adverbios en -mente»): una frase corta y general, en indicativo o imperativo («Diálogos secos, sin muletillas»; «Mara habla seco, sin rodeos»). NUNCA contenido (tramas, hechos, nombres). Si ya hay una parecida, cuenta una vez más. ambito: "proyecto" (esta historia o sus personajes; por defecto) o "general" (cómo escribe Leo siempre). Leo la ve en Claude › Memoria de estilo.',
      inputSchema: { type: 'object', required: ['regla'], properties: { proyecto: P_PROYECTO, regla: { type: 'string' }, ambito: { type: 'string', enum: ['proyecto', 'general'] },
        ejemplo: { type: 'object', description: 'Lo que estaba y cómo quedó.', properties: { antes: { type: 'string' }, despues: { type: 'string' } } } } } },
    { name: 'olvidar_estilo', title: 'Olvidar algo del estilo de Leo', annotations: { destructiveHint: false },
      description: 'Quita una regla de la MEMORIA DE ESTILO (por su texto o su id, de ver_proyecto) cuando Leo dice que ya no la quiere o la contradice.',
      inputSchema: { type: 'object', required: ['regla'], properties: { proyecto: P_PROYECTO, regla: { type: 'string', description: 'Su texto o su id.' }, ambito: { type: 'string', enum: ['proyecto', 'general'] } } } },
    { name: 'preparar_obra', title: 'Preparar una obra del teatro', soloClaude: true, annotations: { readOnlyHint: true },
      description: 'Para dirigir una OBRA del teatro de duendes (el botón «Teatro» del editor): da el guion de un documento (o el de un esquema) en eventos numerados, con cómo dirigir y el catálogo de lo que existe (escenarios, vestuarios, máscaras, músicas, utilería y gestos, de fábrica y los mods del proyecto). No escribe nada. Después, dirigir_obra.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, esquema: { type: 'string', description: 'Su guion.' }, nota: { type: 'string', description: 'Id, título o enlace del documento.' } } } },
    { name: 'dirigir_obra', title: 'Dirigir una obra del teatro', soloClaude: true, annotations: { destructiveHint: false },
      description: 'Guarda la PUESTA EN ESCENA de una obra del teatro de duendes que leíste con preparar_obra: escenario, noche, música, presentes, utilería y cartel de cada escena; vestuario, máscara, tamaño y voz en off de cada personaje (también los que no hablan); gesto de cada línea; quién entra, sale o hace algo en cada acotación. Nunca cambia diálogos ni nombres. Sustituye la dirección anterior de ese documento, pero no los ajustes de Leo (los escenarios que eligió él en el teatro: preparar_obra los dice).',
      inputSchema: { type: 'object', required: ['plan'], properties: { proyecto: P_PROYECTO, esquema: { type: 'string' }, nota: { type: 'string' },
        plan: { type: 'object', description: '{ escenas: [{ i, escenario, noche, musica, presentes, objetos: [{ id, x }], cartel }], personajes: [{ nombre, vestuario, mascara, tamano, voz }], lineas: [{ i, gesto }], acotaciones: [{ i, quienes, movimiento, gesto, objetos, cartel }] } (i = número de evento de preparar_obra).' } } } },
    { name: 'duende_personaje', title: 'El duende de un personaje', soloClaude: true, annotations: { destructiveHint: false },
      description: 'Crea, cambia o mira el DUENDE de un personaje del proyecto: cómo es en el teatro de duendes (sale así en todas las obras; Leo lo ve y lo retoca en Personajes, en el creador de duendes). Empieza con ver: true (su hoja de personaje, su duende de ahora, los rasgos que existen y las imágenes de su biblioteca —y la de «imagen»— adjuntas). Por defecto es un DUENDE; si Leo da una imagen de una persona o lo pide, cuerpo: "humano" (o "nino") con sus rasgos característicos (peinado y color de pelo, vello, lentes, complexión, altura, su ropa típica). Si faltan rasgos para dibujarlo (persona, duende o animal, colores de piel, pelo y ropa, tamaño, voz), PREGÚNTASELOS A LEO antes. Rasgos en la skill (references/teatro.md) y en leer_teatro.',
      inputSchema: { type: 'object', required: ['personaje'], properties: { proyecto: P_PROYECTO, personaje: { type: 'string', description: 'Id, nombre o enlace del personaje.' },
        ver: { type: 'boolean', description: 'true: solo mira (hoja, duende actual, rasgos e imágenes adjuntas). No escribe nada.' },
        imagen: { type: 'string', description: 'Enlace (clapcraft://…), id o título de una nota con una imagen de cómo es (una foto, un dibujo): va adjunta con ver y queda como su fuente al crearlo.' },
        duende: { type: 'object', description: '{ cuerpo (duende|humano|nino), complexion, altura, escala, skin, peinado, hairCol, cejas, ear (solo duende), ojos, eyeCol, nariz, boca, vello, beardCol, marcas [], lentes, prenda, cloth, cloth2, bajo, pants, calzado, shoes, pat, patCol, long, cape, capeIn, hat, hatCol, accesorios [], acc, prop, wings, face, faceCol, vestuario (un disfraz de base), animal, cola, mascara, voz, descripcion } (y los de antes: beard, nose, blush, belt, bigEyes, curly, noEars, noBeard, noBelt)' },
        cambiar: { type: 'boolean', description: 'true: solo cambia lo que mandas y conserva lo demás.' }, fuente: { type: 'string', description: 'La nota de donde sale (su hoja).' }, quitar: { type: 'boolean' } } } },
    { name: 'leer_teatro', title: 'Ver los mods del teatro', soloClaude: true, annotations: { readOnlyHint: true },
      description: 'Los MODS del teatro de duendes (escenarios, vestuarios, objetos de utilería, máscaras, músicas y gestos añadidos, de todos los proyectos), lo que el teatro trae de fábrica (ids que no se pueden reutilizar y las piezas de vestuario que sabe dibujar), los rasgos del duende de un personaje, los duendes de este proyecto y las obras con escenarios que Leo eligió a mano. Léelos antes de editar_teatro.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO } } },
    { name: 'editar_teatro', title: 'Añadir mods al teatro', soloClaude: true, annotations: { destructiveHint: false },
      description: 'Añade, cambia o quita MODS del teatro de duendes, que son DE TODOS LOS PROYECTOS de Leo. Reutiliza antes lo que ya existe (leer_teatro, preparar_obra); crea mods SOLO para personajes y momentos clave que no se entenderían sin ellos: un gesto clave (una acción en cuadros de pose), un escenario que falta (el interior de un coche, un laboratorio), un vestuario (combinando piezas de fábrica), un objeto de utilería (un Vocho, un generador) o una máscara dibujados en píxeles, o una música de ambiente. Son datos que el teatro valida: nunca código. Lote entero o nada. El formato de cada tipo está en la skill (references/teatro.md).',
      inputSchema: { type: 'object', required: ['operaciones'], properties: { proyecto: P_PROYECTO,
        operaciones: { type: 'array', items: { type: 'object', required: ['op', 'tipo'], properties: {
          op: { type: 'string', enum: ['poner', 'quitar'] }, tipo: { type: 'string', enum: ['escenario', 'vestuario', 'objeto', 'mascara', 'musica', 'gesto'] },
          id: { type: 'string', description: 'Para quitar.' }, datos: { type: 'object', description: 'Para poner: el mod (id, nombre, parecidos y lo de su tipo).' } } } } } } },
    { name: 'mostrar_en_clapcraft', title: 'Enseñarlo en ClapCraft', soloVivo: true,
      description: 'Lleva la ventana de ClapCraft a un sitio para que la persona lo vea: cualquier cosa por su enlace (clapcraft://…: un nodo, una nota, una trama, un tramo del guion, un lienzo o un nodo de un lienzo…), o un esquema (y un nodo elegido en él), el documento de un esquema, una nota o un lienzo (y uno de sus nodos). Si el proyecto no está abierto, lo abre.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, enlace: { type: 'string', description: 'Un enlace clapcraft:// (de ver_enlace, o que haya pegado Leo).' }, esquema: P_ESQUEMA, nodo: { type: 'string', description: 'Un nodo del esquema o del lienzo.' }, documento: { type: 'boolean', description: 'Abrir el documento (guion) del esquema.' }, nota: { type: 'string' }, lienzo: P_LIENZO } } }
  ];
  const FUNCIONES = { ver_proyecto: verProyecto, leer_esquema: leerEsquema, editar_esquema: editarEsquema, leer_documento: leerDocumento,
    escribir_documento: escribirDocumento, leer_biblioteca: leerBiblioteca, editar_biblioteca: editarBiblioteca, editar_proyecto: editarProyecto, buscar,
    ver_historial: verHistorial, revertir_cambio: revertirCambio,
    ver_enlace: verEnlace, preparar_fragmentos: prepararFragmentos,
    leer_lienzo: leerLienzo, ejecutar_nodo: ejecutarNodo, completar_nodo: completarNodo, editar_lienzo: editarLienzo, usar_formula: usarFormula,
    recordar_estilo: recordarEstilo, olvidar_estilo: olvidarEstilo, leer_teatro: leerTeatro, editar_teatro: editarTeatro, preparar_obra: prepararObra, dirigir_obra: dirigirObra, duende_personaje: duendePersonaje,
    mostrar_en_clapcraft: (ctx, args) => {
      if (!ctx.mostrar) falla('Solo con el proyecto abierto en ClapCraft');
      if (args.enlace) {                                        // cualquier enlace: ClapCraft va a su sitio (1.1.52)
        const u = C.enlaces.extraer(String(args.enlace))[0]; if (!u) falla('Ese no es un enlace de ClapCraft (empiezan por clapcraft://)');
        const R = C.enlaces.resolver(ctx.docs, C.enlaces.leer(u), {}); if (!R.ok) falla(R.aviso);
        return { texto: ok(ctx.mostrar({ enlace: u })).aviso || 'Listo: está a la vista en ClapCraft' };
      }
      if (args.lienzo) {                                        // un lienzo (y uno de sus nodos): por su enlace (1.1.58)
        const r = lienzoDe(ctx.docs, args.lienzo), n = args.nodo ? nodoLDe(modeloLienzo(r.lienzo, ctx), args.nodo) : null;
        return { texto: ok(ctx.mostrar({ enlace: enlaceDe(ctx, Object.assign({ tipo: 'lienzo', id: r.lienzo.id }, n ? { nodo: n.id } : {})) })).aviso || 'Listo: está a la vista en ClapCraft' };
      }
      const que = {};
      if (args.esquema) { const r = esquemaDe(ctx.docs, args.esquema); que.esquema = r.esquema.id; if (args.nodo) { const m = modeloDe(ctx.docs, r); que.nodo = nodoDe(m, args.nodo, new Map()).id; } if (args.documento) que.documento = true; }
      if (args.nota) que.nota = notaDe(ctx.docs, args.nota).id;
      if (!que.esquema && !que.nota) falla('Di qué enseñar: un enlace, un esquema (y nodo o documento) o una nota');
      return { texto: ok(ctx.mostrar(que)).aviso || 'Listo: está a la vista en ClapCraft' };
    } };

  /* Ejecuta una herramienta sobre un contexto. Devuelve { ok, texto, datos?, historial? } o { ok: false, error }. **Lo que cambia se
     apunta en el historial de Claude** (js/claquedraw/historial.js) con su parche: la foto de antes contra la de después. */
  const SIN_HISTORIAL = new Set(['revertir_cambio', 'mostrar_en_clapcraft']);
  /* sin «esquema» (o «biblioteca»), el de los enlaces que lleve la petición (1.1.52): «cambia esto: [Nodo…](clapcraft://…)» */
  function completar(nombre, args) {
    if (!C.enlaces) return args;
    const quiere = { leer_esquema: 'esquema', editar_esquema: 'esquema', preparar_fragmentos: 'esquema', leer_biblioteca: 'biblioteca', editar_biblioteca: 'biblioteca',
      leer_lienzo: 'lienzo', editar_lienzo: 'lienzo', ejecutar_nodo: 'lienzo', completar_nodo: 'lienzo' }[nombre];
    /* el enlace de un nodo de un lienzo en «lienzo», sin «nodo»: también dice el nodo (ejecutar_nodo, completar_nodo) */
    if ((nombre === 'ejecutar_nodo' || nombre === 'completar_nodo') && esEnlace(args.lienzo) && (args.nodo === undefined || args.nodo === null || args.nodo === '')) {
      const x = C.enlaces.leer(C.enlaces.extraer(args.lienzo)[0]);
      if (x && x.tipo === 'lienzo' && x.nodo) args = Object.assign({}, args, { nodo: x.nodo });
    }
    if (!quiere || (args[quiere] !== undefined && args[quiere] !== null && args[quiere] !== '')) return args;
    let json = ''; try { json = JSON.stringify(args); } catch (_) { return args; }
    const x = C.enlaces.extraer(json).map(u => C.enlaces.leer(u)).find(y => y && (quiere === 'lienzo' ? y.tipo === 'lienzo' : quiere === 'esquema' ? y.esquema || y.tipo === 'esquema' : y.biblioteca || y.tipo === 'biblioteca'));
    if (!x) return args;
    const mas = quiere === 'lienzo' && x.nodo && (args.nodo === undefined || args.nodo === null || args.nodo === '') && nombre !== 'leer_lienzo' && nombre !== 'editar_lienzo' ? { nodo: x.nodo } : {};
    return Object.assign({}, args, { [quiere]: x.tipo === quiere ? x.id : x[quiere] }, mas);
  }
  function ejecutar(ctx, nombre, args) {
    const fn = FUNCIONES[nombre];
    if (!fn) return { ok: false, error: 'No conozco la herramienta ' + comillas(nombre) };
    if (!ctx || !ctx.docs) return { ok: false, error: 'No hay proyecto' };
    const avisar = ctx.cambio || (() => {});
    let cambio = false;
    ctx.cambio = q => { cambio = true; avisar.call(ctx, q); };
    const meta = LISTA.find(t => t.name === nombre);
    const anota = !!C.historial && !!meta && !(meta.annotations && meta.annotations.readOnlyHint) && !SIN_HISTORIAL.has(nombre);
    const antes = anota ? C.historial.foto(ctx.docs.datos) : null, nombreAntes = ctx.proyecto && ctx.proyecto.nombre;
    args = completar(nombre, args && typeof args === 'object' ? args : {});
    try {
      const r = Object.assign({ ok: true }, fn(ctx, args));
      if (anota && cambio) {
        const nombreDespues = ctx.proyecto && ctx.proyecto.nombre;
        const e = C.historial.anotar(ctx.docs, { antes, herramienta: nombre, titulo: titularCambio(ctx, nombre, args), donde: dondeDe(ctx, nombre, args), texto: r.texto,
          origen: ctx.origen, modo: ctx.proyecto && ctx.proyecto.vivo ? 'vivo' : 'archivo', ahora: ahoraDe(ctx),
          nombreProyecto: nombreAntes !== nombreDespues ? { a: nombreAntes, b: nombreDespues } : null });
        if (e) { r.historial = e.id; r.texto = (r.texto || '') + '\n(Queda en el historial de Claude como ' + e.id + ': se revierte desde ClapCraft › Claude › Historial de cambios, o con revertir_cambio.)'; }
      }
      return r;
    } catch (e) {
      if (e instanceof Falla) return { ok: false, error: e.message };
      return { ok: false, error: 'Error de ClapCraft: ' + (e && e.message ? e.message : String(e)) };
    } finally { ctx.cambio = avisar; }
  }

  C.herramientas = { LISTA, ejecutar, estiloDe, datosEsquema, prepararFragmentos, beatsDeGuion, textoEsquema, limpiarHtml, vistaCambio, titularCambio, nombreOperacion, sustituyeCable, quitaAlSustituir, OPERACIONES: { esquema: Object.keys(OPS_ESQUEMA), biblioteca: Object.keys(OPS_BIBLIOTECA), proyecto: Object.keys(OPS_PROYECTO) } };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
