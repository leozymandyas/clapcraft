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
    'el segmento': x => (x.tipo === 'segmento' ? x.id : null), 'la carpeta': x => (x.tipo === 'carpeta' ? x.id : null)
  };
  function leerEnlace(v) { const x = C.enlaces.leer(C.enlaces.extraer(v)[0] || v); if (!x) falla('Ese enlace no se entiende: ' + String(v).trim()); return x; }
  function idDeEnlace(valor, que) {
    const x = leerEnlace(valor), f = DE_ENLACE[que], id = f && f(x);
    if (!id) falla('Ese enlace es de ' + deQue(x) + ', no de ' + que.replace(/^(el|la) /, '') + ' (' + x.url + ')');
    return id;
  }
  const NOMBRE_TIPO = { proyecto: 'un proyecto', contenedor: 'un contenedor', carpeta: 'una carpeta', grupo: 'un grupo', personaje: 'un personaje', biblioteca: 'una biblioteca',
    seccion: 'una sección', segmento: 'un segmento', nota: 'una nota', esquema: 'un esquema', documento: 'un documento', nodo: 'un nodo', salto: 'un salto', trama: 'una trama',
    acto: 'un acto', enlace: 'un enlace entre nodos', raya: 'una raya', columnas: 'unas columnas' };
  const deQue = x => (x.tipo === 'nota' && x.esquema ? 'una nota del esquema' : NOMBRE_TIPO[x.tipo] || 'otra cosa');
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
  const bibliotecaDe = (docs, v) => encontrar(bibliotecasTodas(docs), v, 'la biblioteca');
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
      const nombre = o && plano(o.op || o.operacion || '').replace(/\s+/g, '_');
      const fn = OPS_ESQUEMA[nombre];
      try {
        if (!fn) falla('no conozco la operación ' + comillas(o && (o.op || o.operacion)) + '. Operaciones: ' + Object.keys(OPS_ESQUEMA).join(', '));
        hechos.push((i + 1) + '. ' + fn(m, o, refs));
      } catch (e) {
        if (e instanceof Falla) falla('La operación ' + (i + 1) + ' (' + ((o && o.op) || '?') + ') no se pudo: ' + e.message + '. No se cambió nada del esquema.');
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
    const x = ok(docs.crearDocumentoEsquema(eid, r.esquema.nombre, { html: partes.join(''), characters: chars }));
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
      return { nota: n, esquema: eid ? docs.esquema(eid) : null, que: 'nota de ' + lugarDeNota(docs, n) };
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
    L.push('');
    const op = { modo: como, numerar: !!args.numerar, desde: args.desde, hasta: args.hasta };
    if (args.formato === 'bloques') L.push(JSON.stringify(V().aJson(html, op), null, 1));
    else if (args.formato === 'html') L.push(op.desde || op.hasta ? bs.slice(Math.max(0, (+op.desde || 1) - 1), +op.hasta || bs.length).map(b => b.html).join('\n') : html);
    else L.push(V().aTexto(html, op) || '(vacío)');
    return { texto: L.join('\n') };
  }
  /* Antes de reemplazar lo que Claude cambia se guarda como versión («Antes de Claude»), una por sesión de trabajo: si la última
     ya es de Claude y de hace menos de 20 minutos, no se repite (así queda lo de antes de empezar, no cada paso). */
  const MINUTOS_VERSION = 20;
  function versionPrevia(ctx, n) {
    const docs = ctx.docs, vs = n.versiones || [], ultima = vs[vs.length - 1], t = ahoraDe(ctx);
    if (!n.html || !V().palabras(n.html)) return null;
    if (ultima && ultima.html === n.html) return null;
    if (ultima && /^Antes de Claude/.test(ultima.nombre) && t - ultima.guardada < MINUTOS_VERSION * 60e3) return null;
    const r = docs.guardarVersion(n.id, 'Antes de Claude · ' + fecha(t));
    return r.ok ? r.version.nombre : null;
  }
  /* Limpia HTML que llega de fuera: solo etiquetas y atributos del editor, sin scripts ni manejadores. */
  const PERMITIDAS = new Set(['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'code', 'pre', 'sup', 'sub', 'a', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
  const ATRIBUTOS = new Set(['class', 'style', 'href', 'src', 'alt', 'data-ch', 'data-izq', 'data-portada', 'contenteditable', 'colspan', 'rowspan', 'start']);
  function limpiarHtml(html) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escA = s => esc(s).replace(/"/g, '&quot;');
    const out = n => {
      if (n.t === 'tx') return esc(n.v);
      const dentro = n.hijos.map(out).join('');
      if (!PERMITIDAS.has(n.tag)) return ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'].includes(n.tag) ? '' : dentro;
      const at = Object.entries(n.at).filter(([k, v]) => ATRIBUTOS.has(k) && !((k === 'href' || k === 'src') && /^\s*(javascript|vbscript):/i.test(v)) && !/expression\(|url\(\s*['"]?\s*javascript:/i.test(v));
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
    if (formato === 'bloques') {
      let l = args.contenido;
      if (typeof l === 'string') { try { l = JSON.parse(l); } catch (_) { falla('Con formato "bloques", el contenido es una lista JSON de { tipo, texto }'); } }
      nuevos = V().deJson(l, op);
    } else if (formato === 'html') nuevos = { bloques: V().bloques(limpiarHtml(texto(args.contenido))).map(b => b.html), personajes: V().Personajes(op) };
    else nuevos = V().deTexto(texto(args.contenido), op);
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
    const html = partes.join('') || '<p><br></p>';
    const characters = V().registroDe(html, nuevos.personajes, n.characters);
    const titulo = args.titulo !== undefined && texto(args.titulo).trim() ? texto(args.titulo).trim() : n.titulo;
    if (html === n.html && titulo === n.titulo) return { texto: comillas(n.titulo) + ': sin cambios (el contenido ya era ese)' };
    const version = modo === 'reemplazar' || modo === 'sustituir' ? versionPrevia(ctx, n) : null;
    const elencoAntes = new Set(docs.elenco().map(p => p.id));
    ok(docs.guardarNota(n.id, { title: titulo, html, characters }));
    ctx.cambio({ nota: n.id });
    const nuevosPj = docs.elenco().filter(p => !elencoAntes.has(p.id)).map(p => p.nombre);
    return { texto: comillas(n.titulo) + ' (' + x.que + '): ' + que + ' · ' + plural(V().bloques(nuevos.bloques.join('')).length, 'bloque nuevo', 'bloques nuevos') + ' · ' + miles(V().palabras(html)) + ' palabras en total'
      + (version ? '\nLo de antes quedó guardado como versión ' + comillas(version) + ' (se recupera en el botón de versiones del editor).' : '')
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
  function lineaNota(docs, n, contenido) {
    const t = V().textoPlano(n.html), L = ['  - nota ' + n.id + ' ' + comillas(n.titulo) + ' · ' + miles(V().palabras(n.html)) + ' palabras · ' + fecha(n.modificado)
      + (n.color ? ' · [' + n.color + ']' : '') + ((n.versiones || []).length ? ' · ' + plural(n.versiones.length, 'versión', 'versiones') : '')
      + (!contenido && t ? ' — ' + corto(t, 160) : '')];
    if (contenido) { const cuerpo = V().aTexto(n.html) || '(vacía)'; L.push(cuerpo.split('\n').map(l => '      ' + l).join('\n')); }
    return L.join('\n');
  }
  function leerBiblioteca(ctx, args) {
    const docs = ctx.docs, r = bibliotecaDe(docs, args.biblioteca), s = r.sub;
    const per = s.lineaId && docs.personaje(s.lineaId);
    const L = ['BIBLIOTECA ' + comillas(s.nombre) + ' · id ' + s.id + (per ? ' · biblioteca del personaje ' + comillas(per.nombre) : ' · contenedor ' + comillas(r.contenedor.nombre))
      + ' · ' + plural(docs.notasDe(s.id).length, 'nota', 'notas')];
    const g = docs.grupoDe(s.id); if (g) L.push('Grupo ' + comillas(g.grupo.nombre));
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
      const n = ok(docs.crearNota(s.id, etq, texto(o.titulo).trim() || 'Sin título')).nota;
      if (o.contenido !== undefined && texto(o.contenido).trim()) {
        const r = V().deTexto(texto(o.contenido), { modo: o.como === 'guion' ? 'guion' : 'prosa', elenco: docs.elenco().map(p => ({ nombre: p.nombre, color: p.color })) });
        const html = r.bloques.join('') || '<p><br></p>';
        ok(docs.guardarNota(n.id, { title: n.titulo, html, characters: V().registroDe(html, r.personajes, {}) }));
      }
      if (o.color !== undefined) ok(docs.colorearNota(n.id, tono(o.color)));
      guardarRef(refs, o.ref, 'nota', n.id);
      return 'nota ' + n.id + ' ' + comillas(n.titulo) + ' en ' + lugarDeNota(docs, n);
    },
    editar_nota(docs, s, o, refs) {
      const n = notaBibDe(docs, s, o.nota, refs), hecho = [];
      if (o.titulo !== undefined) { ok(docs.renombrarNota(n.id, texto(o.titulo))); hecho.push('título'); }
      if (o.color !== undefined) { ok(docs.colorearNota(n.id, tono(o.color))); hecho.push('color'); }
      if (o.segmento !== undefined) { ok(docs.moverNota(n.id, o.segmento ? segmentoDe(docs, s, o.segmento, refs).id : null)); hecho.push('segmento'); }
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
        catch (e) { if (e instanceof Falla) falla('La operación ' + (i + 1) + ' (' + ((o && o.op) || '?') + ') no se pudo: ' + e.message + '. No se cambió nada.'); throw e; }
      });
    } catch (e) { reponerEnSitio(docs.datos, antes); throw e; }
    const cambio = JSON.stringify(docs.datos) !== antes;
    if (cambio) ctx.cambio({});
    const creados = [...refs].map(([k, x]) => '$' + k + ' = ' + x.id);
    return { hechos, cambio, refs, creados };
  }
  function editarBiblioteca(ctx, args) {
    const docs = ctx.docs, s = bibliotecaDe(docs, args.biblioteca).sub;
    const r = lote(ctx, args.operaciones, (o, refs) => {
      const nombre = o && plano(o.op || '').replace(/\s+/g, '_'), fn = OPS_BIBLIOTECA[nombre];
      if (!fn) falla('no conozco la operación ' + comillas(o && o.op) + '. Operaciones: ' + Object.keys(OPS_BIBLIOTECA).join(', '));
      return fn(docs, s, o, refs, ctx);
    });
    return { texto: 'Biblioteca ' + comillas(s.nombre) + ':\n' + r.hechos.join('\n') + (r.creados.length ? '\nCreados: ' + r.creados.join(', ') : '') + (r.cambio ? '' : '\n(nada cambió)'),
             datos: { refs: Object.fromEntries([...r.refs].map(([k, x]) => [k, x.id])) } };
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
  /* una pieza del árbol (y lo que lleva dentro, si es una carpeta o un grupo) */
  function piezaTexto(docs, ambito, x, p, L) {
    if (x.tipo === 'carpeta') { L.push(p + 'CARPETA ' + x.id + ' ' + comillas(x.obj.nombre)); arbolTexto(docs, ambito, x.id, p + '  ', L); return; }
    if (x.tipo === 'grupo') { L.push(p + 'GRUPO ' + x.id + ' ' + comillas(x.obj.nombre)); docs.nivelGrupo(x.id).forEach(y => piezaTexto(docs, ambito, y, p + '  ', L)); return; }
    if (x.tipo === 'esquema') { L.push(p + 'ESQUEMA ' + x.id + ' ' + comillas(x.obj.nombre) + ' · ' + cuentaEsquema(docs, x.obj)); return; }
    if (x.tipo === 'sub') { const n = docs.notasDe(x.id).length, k = docs.etiquetasDe(x.id).length; L.push(p + 'BIBLIOTECA ' + x.id + ' ' + comillas(x.obj.nombre) + ' · ' + plural(k, 'segmento', 'segmentos') + ' · ' + plural(n, 'nota', 'notas')); return; }
    if (x.tipo === 'personaje') L.push(p + 'PERSONAJE ' + x.id + ' ' + comillas(x.obj.nombre));
  }
  function arbolTexto(docs, ambito, carpetaId, pre, L) {
    docs.nivelArbol(ambito, carpetaId).forEach(x => piezaTexto(docs, ambito, x, pre, L));
  }
  function verProyecto(ctx) {
    const docs = ctx.docs, P = ctx.proyecto || {}, L = [];
    L.push('PROYECTO ' + comillas(P.nombre || '?') + (P.ruta ? ' · archivo ' + P.ruta : '') + (P.vivo ? ' · abierto en ClapCraft (los cambios se ven al momento)' : P.ruta ? ' · cerrado (se trabaja sobre el archivo)' : ''));
    if (C.enlaces) {
      const ahora = C.enlaces.proyectoDe(ctx.proyecto || {}), viejos = C.enlaces.nombres(docs.datos).filter(x => x !== ahora);
      L.push('Enlaces: ' + enlaceDe(ctx, { tipo: 'proyecto' }) + '/… (esquema/<id>, esquema/<id>/nodo/<id>, biblioteca/<id>, nota/<id>, personaje/<id>…; ver_enlace los lee)'
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
    if (ep && ep.esquemas.length) { L.push('ESQUEMAS DE PERSONAJE'); ep.esquemas.forEach(e => L.push('  ESQUEMA ' + e.id + ' ' + comillas(e.nombre) + ' · ' + cuentaEsquema(docs, e))); }
    const pap = docs.papelera();
    L.push('', 'PAPELERA: ' + (pap.length ? pap.map(x => (x.nota ? 'nota ' + x.nota.id : x.tipo + ' ' + (x.esquema || x.sub || x.personaje).id) + ' ' + comillas(C.nombreEnPapelera(x))).join(', ') : 'vacía'));
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
    renombrar_biblioteca(ctx, o, refs) { const s = bibRef(ctx, o.biblioteca, refs); ok(ctx.docs.renombrarSub(s.id, texto(o.nombre))); return 'biblioteca ' + s.id + ' → ' + comillas(s.nombre); },
    duplicar_biblioteca(ctx, o, refs) { const s = bibRef(ctx, o.biblioteca, refs), r = ok(ctx.docs.duplicarSub(s.id)); guardarRef(refs, o.ref, 'biblioteca', r.sub.id); return r.aviso + ' (' + r.sub.id + ')'; },
    mover_biblioteca(ctx, o, refs) {
      const s = bibRef(ctx, o.biblioteca, refs);
      if (o.carpeta !== undefined) ok(ctx.docs.moverACarpeta('sub', s.id, o.carpeta ? carpetaRef(ctx, o.carpeta, refs).id : null, o.contenedor ? contRef(ctx, o.contenedor, refs).id : undefined));
      else if (o.contenedor !== undefined) ok(ctx.docs.colocarSub(s.id, null, contRef(ctx, o.contenedor, refs).id));
      return 'biblioteca ' + s.id + ' en ' + comillas(ctx.docs.sub(s.id).contenedor.nombre);
    },
    tirar_biblioteca(ctx, o, refs) { const s = bibRef(ctx, o.biblioteca, refs); return ok(ctx.docs.eliminarSub(s.id)).aviso + ' (restaurar la devuelve)'; },
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
  const persRef = (ctx, v, refs) => { const id = deRef(refs, v, 'personaje'); if (id) return ctx.docs.personaje(id); return personajeDe(ctx.docs, v); };
  function carpetaRef(ctx, v, refs) {
    const id = deRef(refs, v, 'carpeta'); if (id) return ctx.docs.carpeta(id).carpeta;
    const todas = ctx.docs.datos.contenedores.flatMap(c => c.carpetas).concat(ctx.docs.datos.carpetasElenco);
    return encontrar(todas.map(k => ({ id: k.id, nombre: k.nombre, obj: k })), v, 'la carpeta');
  }
  function editarProyecto(ctx, args) {
    const r = lote(ctx, args.operaciones, (o, refs) => {
      const nombre = o && plano(o.op || '').replace(/\s+/g, '_'), fn = OPS_PROYECTO[nombre];
      if (!fn) falla('no conozco la operación ' + comillas(o && o.op) + '. Operaciones: ' + Object.keys(OPS_PROYECTO).join(', '));
      return fn(ctx, o, refs);
    });
    const nombre = r.refs.nombreProyecto;
    if (nombre) {
      if (ctx.renombrarProyecto) ok(ctx.renombrarProyecto(nombre));
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
      if (casa(n.titulo) || casa(t)) res.push('- documento ' + n.id + ' ' + comillas(n.titulo) + ' (' + lugarDeNota(docs, n) + ')' + (casa(t) ? ' — ' + extracto(t) : ''));
    });
    docs.datos.elenco.forEach(p => { if (casa(p.nombre)) res.push('- personaje ' + p.id + ' ' + comillas(p.nombre)); });
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
    if (nombre === 'editar_biblioteca') { try { return 'Organizó la biblioteca «' + bibliotecaDe(docs, args.biblioteca).sub.nombre + '»' + (ops > 1 ? ' (' + ops + ' cambios)' : ''); } catch (_) { return 'Organizó una biblioteca'; } }
    if (nombre === 'editar_proyecto') return 'Cambió el proyecto' + (ops > 1 ? ' (' + ops + ' cambios)' : '');
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
  const COLORES = 'rojo, ladrillo, cobre, ambar, oro, lima, oliva, verde, esmeralda, teal, turquesa, cielo, azul, marino, pizarra, indigo, violeta, uva, ciruela, magenta, rosa, vino, salvia, gris';
  const LISTA = [
    { name: 'listar_proyectos', title: 'Proyectos de ClapCraft', soloServidor: true, annotations: { readOnlyHint: true },
      description: 'Lista los proyectos de ClapCraft: los abiertos en la app (se trabaja en vivo: los cambios se ven al momento y entran en Deshacer), los recientes y los .clapcraft que hay en el equipo. Empieza por aquí si no sabes qué proyecto usar.',
      inputSchema: { type: 'object', properties: { buscar: { type: 'string', description: 'Filtra por nombre (opcional).' } } } },
    { name: 'ver_proyecto', title: 'Árbol del proyecto', annotations: { readOnlyHint: true },
      description: 'El árbol de un proyecto: contenedores, carpetas, grupos, esquemas (con cuántas tramas, nodos y notas tienen y su documento), bibliotecas, personajes, esquemas de personaje y papelera, con sus ids. Si está abierto en ClapCraft, también qué se ve en pantalla (esquema montado, documento abierto, lo elegido).',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO } } },
    { name: 'leer_esquema', title: 'Leer un esquema', annotations: { readOnlyHint: true },
      description: 'Un esquema de pasos entero: sus tramas (filas, de arriba abajo), sus actos (tramos de columnas) y la línea del tiempo columna a columna con cada nodo (título, descripción en Markdown, color), cada salto entre tramas (cuadro = cambio de escena, rombo = salto alternativo) y cada nota (de un nodo, de un enlace entre dos nodos seguidos o de una raya de la trama). Las columnas se cuentan desde 1, como en el tablero. formato "texto" (por defecto, legible) o "json".',
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
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, esquema: P_ESQUEMA, nota: { type: 'string', description: 'Id o título de una nota de biblioteca.' },
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
      description: 'Una biblioteca (o la de un personaje): sus secciones, segmentos y notas, con ids, fechas, palabras y un extracto; con contenido: true, el texto entero de cada nota.',
      inputSchema: { type: 'object', required: ['biblioteca'], properties: { proyecto: P_PROYECTO, biblioteca: { type: 'string', description: 'Id o nombre (el de un personaje también vale).' }, contenido: { type: 'boolean' } } } },
    { name: 'editar_biblioteca', title: 'Organizar una biblioteca', annotations: { destructiveHint: true },
      description: 'Operaciones en una biblioteca, entera o nada: crear_seccion {nombre, ref} · renombrar_seccion {seccion, nombre} · borrar_seccion {seccion} (sus segmentos vuelven a la de partida) · crear_segmento {nombre, color, seccion, ref} · editar_segmento {segmento, nombre, color, seccion} · borrar_segmento {segmento} (sus notas a la bandeja) · crear_nota {titulo, contenido (Markdown), segmento, color, ref} · editar_nota {nota, titulo, color, segmento} · mover_nota {nota, segmento, biblioteca, antes_de} · tirar_nota {nota} (a la papelera). El texto de una nota que ya existe se cambia con escribir_documento. Colores de segmento: 0–15 o su nombre (Azul, Verde, Terracota, Violeta, Ámbar, Rosa, Teal, Oliva, Índigo, Coral, Ciruela, Arena, Cielo, Lima, Óxido, Grafito); de nota, los 24 tonos (' + COLORES + ').',
      inputSchema: { type: 'object', required: ['biblioteca', 'operaciones'], properties: { proyecto: P_PROYECTO, biblioteca: { type: 'string' },
        operaciones: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_BIBLIOTECA) } } } } } } },
    { name: 'editar_proyecto', title: 'Organizar el proyecto', annotations: { destructiveHint: true },
      description: 'La estructura del proyecto, entera o nada: renombrar_proyecto {nombre} · crear_contenedor {nombre, ref} · renombrar_contenedor · eliminar_contenedor (sus esquemas y bibliotecas a la papelera) · crear_esquema {contenedor, nombre, carpeta, ref} (nace con tres actos y la trama Principal) · renombrar_esquema · duplicar_esquema · mover_esquema {esquema, contenedor, carpeta} · tirar_esquema (a la papelera) · crear_biblioteca {contenedor, nombre, carpeta, ref} · renombrar_biblioteca · duplicar_biblioteca · mover_biblioteca · tirar_biblioteca · crear_carpeta {contenedor | dentro_de, nombre, color: azul|violeta|verde|ambar|rojo|gris} · renombrar_carpeta · eliminar_carpeta (lo de dentro sube) · agrupar {elementos: [ids], nombre} · desagrupar {grupo} · crear_personaje {nombre, color} · renombrar_personaje {personaje, nombre} (lo cambia en todos los documentos) · colorear_personaje {personaje, color} · restaurar {elemento} (de la papelera).',
      inputSchema: { type: 'object', required: ['operaciones'], properties: { proyecto: P_PROYECTO,
        operaciones: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: Object.keys(OPS_PROYECTO) } } } } } } },
    { name: 'buscar', title: 'Buscar en el proyecto', annotations: { readOnlyHint: true },
      description: 'Busca un texto (sin distinguir mayúsculas ni acentos) en los nombres de esquemas, tramas, actos, nodos y sus descripciones, notas del esquema, bibliotecas, segmentos, documentos y personajes. Dice dónde está cada cosa, con su id.',
      inputSchema: { type: 'object', required: ['texto'], properties: { proyecto: P_PROYECTO, texto: { type: 'string' }, limite: { type: 'integer' } } } },
    { name: 'ver_enlace', title: 'Leer enlaces de ClapCraft', annotations: { readOnlyHint: true },
      description: 'Leo copia en ClapCraft enlaces a lo que quiere enseñarte («Copiar enlace para Claude», o Cmd+Shift+C con algo elegido) y los pega en la conversación: son Markdown como [Nodo «La broma» · esquema «Piloto»](clapcraft://analisis-de-the-office/esquema/d…/nodo/p6). Pásale el texto con los enlaces (uno o varios, tal cual) y dice qué es cada uno —proyecto, contenedor, carpeta, grupo, esquema, nodo, salto, trama, acto, nota del esquema, enlace entre dos nodos, raya, columnas, guion de un esquema o un tramo de él (?b=12-14: sus bloques), biblioteca, sección, segmento, nota de biblioteca o personaje—, dónde está y lo que tiene, con los ids para cambiarlo. Un enlace también vale en lugar del id en cualquier otra herramienta.',
      inputSchema: { type: 'object', required: ['enlace'], properties: { proyecto: P_PROYECTO, enlace: { type: 'string', description: 'Uno o varios enlaces clapcraft://, o el texto que los lleva.' } } } },
    { name: 'ver_historial', title: 'Historial de Claude', annotations: { readOnlyHint: true },
      description: 'Los cambios que Claude ha hecho en el proyecto (en vivo o sobre su archivo), del más nuevo al más viejo: su id, cuándo, desde dónde, qué fue y si ya se revirtió. Leo los ve en ClapCraft › Claude › Historial de cambios.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, limite: { type: 'integer', description: 'Cuántos (20 por defecto).' }, detalle: { type: 'boolean', description: 'Con las operaciones de cada uno (por defecto sí).' } } } },
    { name: 'revertir_cambio', title: 'Revertir un cambio de Claude', annotations: { destructiveHint: true },
      description: 'Deshace un cambio del historial de Claude (su id, de ver_historial) sin tocar lo que vino después. Si después se tocaron algunas de las mismas cosas, no hace nada y dice cuáles: pregúntale a Leo antes de repetir con forzar: true (entonces, en esas partes, se pierde lo de después).',
      inputSchema: { type: 'object', required: ['cambio'], properties: { proyecto: P_PROYECTO, cambio: { type: 'string', description: 'El id del cambio.' }, forzar: { type: 'boolean' } } } },
    { name: 'mostrar_en_clapcraft', title: 'Enseñarlo en ClapCraft', soloVivo: true,
      description: 'Lleva la ventana de ClapCraft a un sitio para que la persona lo vea: cualquier cosa por su enlace (clapcraft://…: un nodo, una nota, una trama, un tramo del guion…), o un esquema (y un nodo elegido en él), el documento de un esquema o una nota. Si el proyecto no está abierto, lo abre.',
      inputSchema: { type: 'object', properties: { proyecto: P_PROYECTO, enlace: { type: 'string', description: 'Un enlace clapcraft:// (de ver_enlace, o que haya pegado Leo).' }, esquema: P_ESQUEMA, nodo: { type: 'string' }, documento: { type: 'boolean', description: 'Abrir el documento (guion) del esquema.' }, nota: { type: 'string' } } } }
  ];
  const FUNCIONES = { ver_proyecto: verProyecto, leer_esquema: leerEsquema, editar_esquema: editarEsquema, leer_documento: leerDocumento,
    escribir_documento: escribirDocumento, leer_biblioteca: leerBiblioteca, editar_biblioteca: editarBiblioteca, editar_proyecto: editarProyecto, buscar,
    ver_historial: verHistorial, revertir_cambio: revertirCambio,
    ver_enlace: verEnlace,
    mostrar_en_clapcraft: (ctx, args) => {
      if (!ctx.mostrar) falla('Solo con el proyecto abierto en ClapCraft');
      if (args.enlace) {                                        // cualquier enlace: ClapCraft va a su sitio (1.1.52)
        const u = C.enlaces.extraer(String(args.enlace))[0]; if (!u) falla('Ese no es un enlace de ClapCraft (empiezan por clapcraft://)');
        const R = C.enlaces.resolver(ctx.docs, C.enlaces.leer(u), {}); if (!R.ok) falla(R.aviso);
        return { texto: ok(ctx.mostrar({ enlace: u })).aviso || 'Listo: está a la vista en ClapCraft' };
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
    const quiere = { leer_esquema: 'esquema', editar_esquema: 'esquema', leer_biblioteca: 'biblioteca', editar_biblioteca: 'biblioteca' }[nombre];
    if (!quiere || (args[quiere] !== undefined && args[quiere] !== null && args[quiere] !== '')) return args;
    let json = ''; try { json = JSON.stringify(args); } catch (_) { return args; }
    const x = C.enlaces.extraer(json).map(u => C.enlaces.leer(u)).find(y => y && (quiere === 'esquema' ? y.esquema || y.tipo === 'esquema' : y.biblioteca || y.tipo === 'biblioteca'));
    if (!x) return args;
    return Object.assign({}, args, { [quiere]: x.tipo === quiere ? x.id : x[quiere] });
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

  C.herramientas = { LISTA, ejecutar, datosEsquema, textoEsquema, limpiarHtml, vistaCambio, titularCambio, OPERACIONES: { esquema: Object.keys(OPS_ESQUEMA), biblioteca: Object.keys(OPS_BIBLIOTECA), proyecto: Object.keys(OPS_PROYECTO) } };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
