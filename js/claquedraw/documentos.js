/* Claquedraw · documentos
   El gestor de documentos de un guion. Un guion es un proyecto con **contenedores**; cada contenedor
   es una carpeta con dos clases de hijos, todos con nombre propio, ordenables y movibles entre
   contenedores (Leo, 13-09-2026):
   · **esquemas de pasos** (`contenedor.esquemas[]`): un tablero de Tramas cada uno, con las notas de
     sus nodos (`esquema.notas`, la forma de Ed.document.get()).
   · **subcontenedores** (`contenedor.subs[]`): cada uno un tablero de documentos con sus segmentos
     (`etiquetas`, por `subId`) y sus notas (por `subId`). Un contenedor nuevo estrena uno, «Documentos».
   Un esquema nuevo estrena **su documentos enlazado** (`esquema.subId`, Leo, 13-09-2026): un
   subcontenedor del mismo contenedor que nace con el mismo nombre (luego cada uno se renombra por su
   lado) y que se mueve con él; el enlace se puede quitar (`quitarEnlace`) y entonces cada uno va suelto.
   («Personajes» y «Documentos guión» existieron y Leo los quitó: sobraban.)
   **Personajes** (Leo, 16-09-2026): dos contenedores ocultos (`oculto`), que no salen en el árbol de
   contenedores y son el árbol de Personajes. **«Personajes»** (id `personajes`) guarda **una biblioteca
   por personaje** (`sub.lineaId`, `bibliotecaPersonaje`): un personaje **es** su biblioteca, con sus
   secciones y sus segmentos, y en su árbol caben carpetas y grupos (`carpetasElenco`, `gruposElenco`,
   `ordenElenco`). **«Esquemas»** (id `personajes:esquemas`, `esquemasPersonajes`) guarda los **esquemas
   de personaje** (`crearEsquemaPersonaje`, `esEsquemaPersonaje`): documentos sueltos como los de
   cualquier contenedor (carpetas, grupos, orden) cuyas tramas son personajes y cuyos actos son momentos.
   Hasta la 1.0.58 cada personaje tenía el suyo, uno y solo uno (`personajes:esquema:<personaje>`): esos
   se mudan aquí al abrir el archivo (`mudarEsquemasPersonaje`) y los que estaban vacíos se descartan.
   **Elenco** (Leo, 14-09-2026): los personajes del guion son los que se escriben en el editor con «/»
   (bloques `p.sp-character`, registro `characters` de cada nota) más los creados en Personajes
   (`datos.elenco = [{ id, nombre, color }]`, color = índice de la paleta de 16 del editor). Guardar una
   nota añade al elenco los nombres nuevos; `normalizar` lo reconstruye con lo que ya haya en las notas.
   Renombrar o recolorear un personaje reescribe todas las notas (sus bloques de personaje y sus
   registros) y los carriles del tablero de Personajes que lo llevan (`linea.personaje`); no se elimina
   mientras alguna nota lo nombre (`menciones`).
   No hay nada especial: cualquier contenedor, esquema o subcontenedor se renombra, se ordena y se
   elimina. `migrado` recuerda que el esquema del proyecto (que vivía en el guion) ya pasó aquí.
   Una nota vive en un subcontenedor y lleva como mucho una etiqueta suya; sin etiqueta está en la
   bandeja. El orden de todo es el manual. La papelera guarda las notas tiradas con su origen (el
   subcontenedor) y la fecha; se vacía a mano o sola a los 30 días (`purgarPapelera`).
   Modelo puro, sin DOM: se carga en Node (test/documentos.test.js). Cada operación devuelve
   { ok, aviso?, ... }. Los datos viven dentro del guion (`guion.documentos`) y viajan en el .clapcraft. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  /* Los 24 tonos de tramas, nodos y notas (los de js/tramas/modelo.js, Leo 15-09-2026): una nota de biblioteca puede llevar
     uno (se pinta con var(--t-<tono>) y var(--f-<tono>)); sin él, papel. */
  const TONOS = ['rojo', 'ladrillo', 'cobre', 'ambar', 'oro', 'lima', 'oliva', 'verde', 'esmeralda', 'teal', 'turquesa', 'cielo',
    'azul', 'marino', 'pizarra', 'indigo', 'violeta', 'uva', 'ciruela', 'magenta', 'rosa', 'vino', 'salvia', 'gris'];
  /* Los 16 pares claro/oscuro del diseño (los mismos de los personajes del editor). */
  const PALETA = [
    ['Azul', '#DBE8FF', '#1A4A86'], ['Verde', '#D8F2DF', '#11643D'], ['Terracota', '#FFE3D5', '#9C3F14'], ['Violeta', '#EAE0FF', '#5326AB'],
    ['Ámbar', '#FFEEC9', '#875408'], ['Rosa', '#FFE0EA', '#A51A5A'], ['Teal', '#D2F0ED', '#0A6663'], ['Oliva', '#E8F4CD', '#4C6B0F'],
    ['Índigo', '#E2E2FF', '#33359C'], ['Coral', '#FFE3DD', '#A83A26'], ['Ciruela', '#F9DCF6', '#8B2280'], ['Arena', '#F4E8CF', '#6F5722'],
    ['Cielo', '#D6EEFF', '#05618F'], ['Lima', '#E9F8C8', '#4F7205'], ['Óxido', '#FFE0C4', '#94480A'], ['Grafito', '#E6E2EE', '#3C3648']
  ];
  const ORDENES = ['manual', 'az', 'za', 'modificado'];
  const NOMBRE_GLOBAL = 'Capítulo';                            // nombre del contenedor que estrena un guion
  const NOMBRE_SUB = 'Biblioteca';                             // nombre del subcontenedor (biblioteca) que estrena un contenedor
  const DIAS_PAPELERA = 30;
  const ID_PERSONAJES = 'personajes';                          // el contenedor oculto con la biblioteca de cada personaje
  const ID_ESQUEMAS = 'personajes:esquemas';                    // el contenedor oculto con los esquemas de personaje
  /* Carpetas (Leo, 15-09-2026): dentro de un contenedor anidan sin límite y de cualquier nivel cuelgan esquemas y
     bibliotecas (`carpetaId`); en Personajes agrupan el elenco (`datos.carpetasElenco`, `personaje.carpetaId`).
     Su color es uno de los de las tramas (`var(--t-…)`). */
  const COLORES_CARPETA = ['azul', 'violeta', 'verde', 'ambar', 'rojo', 'gris'];
  const HOJA_PERSONAJE = 'Hoja de personaje';                   // el segmento con que estrena su biblioteca un personaje
  const ELENCO = 'elenco';                                     // el ámbito de las carpetas de Personajes

  /* ---------- personajes del editor: nombres y bloques `p.sp-character` en el HTML de las notas ---------- */
  /* «MARA (V.O.)» y «Mara» son el mismo personaje (la misma clave que js/characters.js), y **un doble espacio
     suelta el personaje**: lo que va detrás es una anotación («V.O.», «CONT'D») y no cuenta para el nombre
     (Leo, 16-09-2026; el segundo espacio suele llegar como NBSP). */
  const DOBLE = /[ \u00a0\u2007\u202f\t]{2,}/;
  const limpio = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  const sinSufijo = s => limpio(String(s || '').replace(/\u200B/g, '').split(DOBLE)[0]).replace(/\s*\([^)]*\)\s*$/, '');
  const clavePersonaje = s => sinSufijo(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const RE_PERSONAJE = /(<p\b[^>]*\bclass="[^"]*\bsp-character\b[^"]*"[^>]*>)([\s\S]*?)(<\/p>)/gi;
  const textoDe = h => String(h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mencionaEn = (html, k) => { let hay = false; String(html || '').replace(RE_PERSONAJE, (t, a, dentro) => { if (clavePersonaje(textoDe(dentro)) === k) hay = true; return t; }); return hay; };
  /* cambia el nombre en los bloques de ese personaje, conservando la extensión («(V.O.)») */
  const renombrarEn = (html, k, nombre) => String(html || '').replace(RE_PERSONAJE, (t, a, dentro, c) => {
    const txt = textoDe(dentro); if (clavePersonaje(txt) !== k) return t;
    const bruto = String(txt).replace(/\u200B/g, ''), corte = bruto.search(DOBLE);
    const anot = corte >= 0 ? bruto.slice(corte) : '';      // lo escrito tras el doble espacio se queda igual
    const suf = (limpio(corte >= 0 ? bruto.slice(0, corte) : bruto).match(/\s*\([^)]*\)\s*$/) || [''])[0];
    return a + escHtml(nombre + suf + anot) + c;
  });

  const clonar = d => JSON.parse(JSON.stringify(d));
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});
  const plano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  const texto = (v, defecto) => { const s = String(v ?? '').trim(); return s || defecto; };
  const color = v => { const n = Math.round(+v); return n >= 0 && n < PALETA.length ? n : 0; };
  /* El orden propio de las tarjetas de actos (o momentos) y de sus documentos en una biblioteca: solo cómo se
     ven ahí, no cambia la línea de tiempo. `{ actos: [actoId…], nodos: { actoId: [puntoId…] } }`. */
  function ordenValido(o) {
    if (!o || typeof o !== 'object') return null;
    const ids = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [];
    const nodos = {};
    if (o.nodos && typeof o.nodos === 'object') Object.keys(o.nodos).forEach(k => { const l = ids(o.nodos[k]); if (l.length) nodos[k] = l; });
    const actos = ids(o.actos);
    return actos.length || Object.keys(nodos).length ? { actos, nodos } : null;
  }
  /* Aplica un orden guardado a una lista natural de ids: los guardados van en su orden y los nuevos entran
     detrás del último (en el orden guardado) de los que les preceden en el natural, o delante de todo. */
  function aplicarOrden(natural, guardado) {
    if (!guardado || !guardado.length) return natural.slice();
    const res = guardado.filter(id => natural.includes(id));
    natural.forEach((id, i) => {
      if (res.includes(id)) return;
      const tras = Math.max(-1, ...natural.slice(0, i).map(x => res.indexOf(x)));
      res.splice(tras + 1, 0, id);
    });
    return res;
  }
  /* el documento de un nodo; `modificado` (cuándo se escribió por última vez) se conserva si viene */
  const docDe = n => n && typeof n === 'object' && typeof n.html === 'string'
    ? { title: texto(n.title, ''), html: n.html, characters: n.characters && typeof n.characters === 'object' ? clonar(n.characters) : {}, ...(+n.modificado ? { modificado: +n.modificado } : {}) } : null;
  const contenidoDe = n => n ? JSON.stringify([n.title, n.html, n.characters]) : '';

  /* Las carpetas de un ámbito: ids únicos, color válido, padre que exista (si no, a la raíz) y sin ciclos. */
  function sanearCarpetas(lista, ids) {
    const res = [];
    (Array.isArray(lista) ? lista : []).forEach(k => {
      const id = k && String(k.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      res.push({ id, nombre: texto(k.nombre, 'Carpeta'), color: COLORES_CARPETA.includes(k.color) ? k.color : 'gris', padreId: k.padreId ? String(k.padreId) : null, ...(k.plegada ? { plegada: true } : {}) });
    });
    const porId = new Map(res.map(k => [k.id, k]));
    res.forEach(k => { if (k.padreId && !porId.has(k.padreId)) k.padreId = null; });
    res.forEach(k => { const vistos = new Set([k.id]); let p = k.padreId; while (p) { if (vistos.has(p)) { k.padreId = null; break; } vistos.add(p); p = porId.get(p).padreId; } });
    return res;
  }

  /* El guion de un esquema (Revisar guión, Leo 15-09-2026): claves de sección fuera del guion, su orden propio de lectura
     y las plegadas en el editor. Solo se guarda lo que no está vacío (así lo abierto es idéntico a lo guardado). */
  const claves = x => Array.isArray(x) ? [...new Set(x.filter(k => typeof k === 'string' && k))] : [];
  function sanearGuion(g) {
    if (!g || typeof g !== 'object') return null;
    const r = {};
    ['fuera', 'orden', 'plegadas'].forEach(k => { const l = claves(g[k]); if (l.length) r[k] = l; });
    return Object.keys(r).length ? r : null;
  }
  /* **Versiones de un documento** (Leo, 16-09-2026: «para tener diferentes guiones para un mismo esquema»): instantáneas
     con nombre del mismo documento, guardadas dentro de él. */
  function versionesDe(v, ids) {
    const lista = [];
    (Array.isArray(v) ? v : []).forEach(x => {
      const id = x && String(x.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      lista.push({ id, nombre: texto(x.nombre, 'Versión'), guardada: +x.guardada || 0,
                   html: typeof x.html === 'string' ? x.html : '',
                   characters: x.characters && typeof x.characters === 'object' ? clonar(x.characters) : {} });
    });
    return lista.length ? { versiones: lista } : {};
  }
  /* `eid` null: un documento creado a mano en la sección de guiones (no sale de un esquema, no se regenera) */
  const guionDe = g => g && typeof g === 'object'
    ? { guion: { eid: g.eid ? String(g.eid) : null, generado: +g.generado || 0, ...(g.principal ? { principal: true } : {}) } } : {};

  /* Un esquema de un contenedor: un tablero (basta con que traiga `lineas`) y las notas de sus nodos. */
  function sanearEsquema(e, id, nombre) {
    if (!e || typeof e !== 'object' || !e.datos || typeof e.datos !== 'object' || !Array.isArray(e.datos.lineas)) return null;
    const notas = {};
    if (e.notas && typeof e.notas === 'object') Object.keys(e.notas).forEach(k => { const n = docDe(e.notas[k]); if (n) notas[k] = n; });
    return { id, nombre: texto(nombre, 'Esquema'), datos: clonar(e.datos), notas, notaActual: typeof e.notaActual === 'string' ? e.notaActual : null,
             ...(typeof e.subId === 'string' && e.subId ? { subId: e.subId } : {}),   // forma antigua: `agruparEnlaces` lo convierte en grupo y lo borra
             ...(sanearGuion(e.guion) ? { guion: sanearGuion(e.guion) } : {}) };
  }

  /* Sanea lo que venga guardado: ids repetidos y huérfanos se descartan, una nota cuya etiqueta ya no
     existe pasa a la bandeja. Entiende las formas anteriores: un `esquema` por contenedor, y
     etiquetas y notas colgadas del contenedor (`contenedorId`) sin subcontenedor, que pasan a un
     subcontenedor «Documentos» creado para ese contenedor. */
  /* El color de la etiqueta de un esquema o de una biblioteca: uno de los 16 pares (como los personajes) o ninguno,
     y entonces vale el de siempre (violeta el esquema, azul la biblioteca). Leo, 16-09-2026. */
  const tono = x => x && x.color !== undefined && x.color !== null && x.color !== '' ? { color: color(x.color) } : {};

  /* Grupos saneados: sus piezas tienen que existir aquí y estar en un solo grupo; `padreId` a otro grupo de la lista, sin
     ciclos; un grupo con menos de dos cosas dentro se descarta. */
  function sanearGrupos(lista, piezas, carpetas, ids) {
    const res = [], enGrupo = new Set();
    (Array.isArray(lista) ? lista : []).forEach((g, i) => {
      const gid = g && String(g.id || ''); if (!gid || ids.has(gid)) return;
      const items = [...new Set((Array.isArray(g.items) ? g.items : []).map(String))].filter(x => piezas.has(x) && !enGrupo.has(x));
      items.forEach(x => enGrupo.add(x));
      ids.add(gid);
      res.push({ id: gid, nombre: texto(g.nombre, 'Grupo ' + (i + 1)), color: COLORES_CARPETA.includes(g.color) ? g.color : 'ambar',
                 padreId: g.padreId ? String(g.padreId) : null,
                 ...(g.carpetaId && carpetas.includes(String(g.carpetaId)) ? { carpetaId: String(g.carpetaId) } : {}), items });
    });
    const porId = new Map(res.map(g => [g.id, g]));
    res.forEach(g => { if (g.padreId && !porId.has(g.padreId)) g.padreId = null; });
    res.forEach(g => { const vistos = new Set([g.id]); let p = g.padreId; while (p) { if (vistos.has(p)) { g.padreId = null; break; } vistos.add(p); p = porId.get(p).padreId; } });
    /* lo que tenga dentro va en la carpeta del grupo, y un grupo dentro de otro, en la de su padre */
    const nivel = g => { let p = g.padreId, k = g.carpetaId || null; while (p) { const q = porId.get(p); if (!q) break; k = q.carpetaId || null; p = q.padreId; } return k; };
    res.forEach(g => { const k = nivel(g); if (k) g.carpetaId = k; else delete g.carpetaId; });
    /* **Un grupo vacío se queda** (Leo, 16-09-2026: «quiero poder crear grupos vacíos»): antes se deshacían solos,
       primero los de menos de dos y luego los de cero, y no había forma de preparar un grupo para ir llenándolo. */
    return res;
  }

  function normalizar(datos) {
    const d = { contenedores: [], etiquetas: [], notas: [], papelera: [], elenco: [], carpetasElenco: [], migrado: !!(datos && datos.migrado) };
    const src = datos && typeof datos === 'object' ? datos : {};
    const ids = new Set();
    const subDe = new Map();                                   // subId → contenedorId
    const heredado = new Map();                                // contenedorId → subId del «Documentos» creado para lo antiguo
    (Array.isArray(src.contenedores) ? src.contenedores : []).forEach(c => {
      const id = c && String(c.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      const creado = +c.creado || 0;
      const carpetas = sanearCarpetas(c.carpetas, ids);
      const enCarpeta = x => x && x.carpetaId && carpetas.some(k => k.id === String(x.carpetaId)) ? { carpetaId: String(x.carpetaId) } : {};
      const esquemas = [];
      const fuente = Array.isArray(c.esquemas) ? c.esquemas : (c.esquema ? [Object.assign({ id: id + ':esquema' }, c.esquema)] : []);
      fuente.forEach((e, i) => {
        const eid = e && String(e.id || ''); if (!eid || ids.has(eid)) return;
        const s = sanearEsquema(e, eid, e.nombre || ('Esquema' + (i ? ' ' + (i + 1) : ''))); if (!s) return;
        ids.add(eid); esquemas.push(Object.assign(s, enCarpeta(e), tono(e)));
      });
      const subs = [];
      (Array.isArray(c.subs) ? c.subs : []).forEach(s => {
        const sid = s && String(s.id || ''); if (!sid || ids.has(sid)) return; ids.add(sid);
        const secciones = [];
        (Array.isArray(s.secciones) ? s.secciones : []).forEach(k => {         // las secciones propias de la biblioteca (Leo, 16-09-2026)
          const kid = k && String(k.id || ''); if (!kid || ids.has(kid)) return; ids.add(kid);
          secciones.push({ id: kid, nombre: texto(k.nombre, 'Sección') });
        });
        subs.push({ id: sid, nombre: texto(s.nombre, NOMBRE_SUB), creado: +s.creado || creado, modificado: +s.modificado || +s.creado || creado,
                    ...(s.lineaId ? { lineaId: String(s.lineaId) } : {}), ...(s.hoja ? { hoja: true } : {}), ...enCarpeta(s), ...tono(s),
                    ...(s.guionEid ? { guionEid: String(s.guionEid) } : {}), ...(secciones.length ? { secciones } : {}),
                    ...(ordenValido(s.ordenActos) ? { ordenActos: ordenValido(s.ordenActos) } : {}),
                    ...(Array.isArray(s.ordenSegmentos || s.ordenCarrusel) ? { ordenSegmentos: (s.ordenSegmentos || s.ordenCarrusel).filter(x => typeof x === 'string' && x) } : {}) });
        subDe.set(sid, id);
      });
      /* el enlace esquema ↔ documentos: a un subcontenedor del mismo contenedor, uno por esquema */
      const enlazados = new Set();
      esquemas.forEach(e => { if (!e.subId || enlazados.has(e.subId) || !subs.some(s => s.id === e.subId)) delete e.subId; else enlazados.add(e.subId); });
      /* un esquema y su biblioteca enlazada van en la misma carpeta (la del esquema) */
      esquemas.forEach(e => { const s = e.subId && subs.find(x => x.id === e.subId); if (!s) return; if (e.carpetaId) s.carpetaId = e.carpetaId; else delete s.carpetaId; });
      /* el orden del árbol (carpetas, esquemas y bibliotecas mezclados, por niveles); los ids que ya no están aquí no
         molestan (al aplicarlo se ignoran) y no se podan: así lo abierto es idéntico a lo guardado */
      const ordenArbol = Array.isArray(c.ordenArbol) ? c.ordenArbol.filter(x => typeof x === 'string' && x) : [];
      /* grupos del árbol (Leo, 16-09-2026): juntan piezas y otros grupos, sin más sentido que agruparlos */
      const dentro = new Set([...esquemas.map(e => e.id), ...subs.filter(x => !x.guionEid).map(x => x.id)]);
      const grupos = sanearGrupos(c.grupos, dentro, carpetas.map(k => k.id), ids);
      d.contenedores.push({ id, nombre: texto(c.nombre, 'Contenedor'), fijado: !!c.fijado, plegado: !!c.plegado, creado, modificado: +c.modificado || creado, carpetas, esquemas, subs,
                            ...(grupos.length ? { grupos } : {}), ...(ordenArbol.length ? { ordenArbol } : {}), ...(c.oculto ? { oculto: true } : {}) });
    });
    /* lo antiguo colgaba del contenedor: un «Documentos» por contenedor que lo necesite */
    const conts = new Map(d.contenedores.map(c => [c.id, c]));
    const subPara = x => {
      if (x.subId && subDe.has(String(x.subId))) return String(x.subId);
      const cid = String(x.contenedorId || ''); const c = conts.get(cid); if (!c) return null;
      if (!heredado.has(cid)) {
        let s = c.subs[0];
        if (!s) { s = { id: cid + ':docs', nombre: NOMBRE_SUB, creado: c.creado, modificado: c.modificado }; c.subs.push(s); subDe.set(s.id, cid); }
        heredado.set(cid, s.id);
      }
      return heredado.get(cid);
    };
    (Array.isArray(src.etiquetas) ? src.etiquetas : []).forEach(e => {
      const id = e && String(e.id || ''); if (!id || ids.has(id)) return;
      if (e.personaje || e.ambito === 'personajes') return;                    // los «Personajes» de antes se descartan (sus notas van a la bandeja)
      const subId = subPara(e); if (!subId) return; ids.add(id);
      d.etiquetas.push({ id, subId, nombre: texto(e.nombre, 'Segmento'), color: color(e.color),
                         ...(e.guiones ? { guiones: true } : {}), ...(e.seccionId ? { seccionId: String(e.seccionId) } : {}) });
    });
    const etqs = new Map(d.etiquetas.map(e => [e.id, e]));
    const nota = (n, creado, subId) => ({ id: String(n.id), subId, etiquetaId: null,
      titulo: texto(n.titulo, 'Sin título'), html: typeof n.html === 'string' ? n.html : '',
      characters: n.characters && typeof n.characters === 'object' ? clonar(n.characters) : {}, creado, modificado: +n.modificado || creado,
      ...(TONOS.includes(n.color) ? { color: n.color } : {}), ...guionDe(n.guion), ...versionesDe(n.versiones, ids) });
    (Array.isArray(src.notas) ? src.notas : []).forEach(n => {
      const id = n && String(n.id || ''); if (!id || ids.has(id)) return;
      const subId = subPara(n); if (!subId) return; ids.add(id);
      const x = nota(n, +n.creado || 0, subId);
      const e = n.etiquetaId ? etqs.get(String(n.etiquetaId)) : null;
      if (e && e.subId === subId) x.etiquetaId = e.id;          // su segmento tiene que ser de su misma biblioteca
      d.notas.push(x);
    });
    (Array.isArray(src.papelera) ? src.papelera : []).forEach(x => {
      const n = x && x.nota; const id = n && String(n.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      d.papelera.push({ nota: nota(n, +n.creado || 0, String(n.subId || '')), origenId: String(x.origenId || n.subId || n.contenedorId || ''), origenNombre: texto(x.origenNombre, ''), eliminadoEn: +x.eliminadoEn || 0 });
    });
    /* el elenco: lo guardado y, además, los personajes de los registros de las notas que aún no estén */
    const claves = new Set();
    d.carpetasElenco = sanearCarpetas(src.carpetasElenco, ids);   // en Personajes vuelven las carpetas (Leo, 16-09-2026)
    const enCarpetaP = p => p && p.carpetaId && d.carpetasElenco.some(k => k.id === String(p.carpetaId)) ? { carpetaId: String(p.carpetaId) } : {};
    (Array.isArray(src.elenco) ? src.elenco : []).forEach(p => {
      const id = p && String(p.id || ''), k = p && clavePersonaje(p.nombre); if (!id || !k || claves.has(k) || ids.has(id)) return;
      ids.add(id); claves.add(k); d.elenco.push({ id, nombre: sinSufijo(p.nombre), color: color(p.color), ...enCarpetaP(p), ...(p.auto ? { auto: true } : {}) });
    });
    const deRegistro = ch => Object.values(ch || {}).forEach(r => {
      const k = r && clavePersonaje(r.name); if (!k || claves.has(k)) return;
      claves.add(k); d.elenco.push({ id: 'pj:' + k, nombre: sinSufijo(r.name), color: color(r.color), auto: true });
    });
    d.notas.forEach(n => deRegistro(n.characters));
    d.contenedores.forEach(c => c.esquemas.forEach(e => Object.values(e.notas).forEach(n => deRegistro(n.characters))));
    const gruposElenco = sanearGrupos(src.gruposElenco, new Set(d.elenco.map(p => p.id)), d.carpetasElenco.map(k => k.id), ids);
    if (gruposElenco.length) d.gruposElenco = gruposElenco;
    const ordenElenco = Array.isArray(src.ordenElenco) ? src.ordenElenco.filter(x => typeof x === 'string' && x) : [];
    if (ordenElenco.length) d.ordenElenco = ordenElenco;
    mudarGuiones(d);
    agruparEnlaces(d);
    mudarEsquemasPersonaje(d);
    versionarGuiones(d);
    return d;
  }

  /* Hasta la 1.0.60 un esquema podía tener varios documentos en su biblioteca de guiones (la pestaña GUIONES, que Leo
     quitó el 16-09-2026: «que ya no exista esa opción»). Ahora tiene **un documento con versiones**: los demás pasan a
     ser versiones suyas, con su título por nombre, y sus segmentos desaparecen. */
  function versionarGuiones(d) {
    const guiones = new Set();
    d.contenedores.forEach(c => c.subs.forEach(s => { if (s.guionEid) guiones.add(s.id); }));
    if (!guiones.size) return;
    guiones.forEach(sid => {
      const notas = d.notas.filter(n => n.subId === sid);
      if (!notas.length) return;
      const principal = notas.find(n => n.guion && n.guion.principal) || notas[0];
      principal.guion = Object.assign({ eid: null, generado: 0 }, principal.guion, { principal: true });
      const otras = notas.filter(n => n !== principal);
      if (otras.length) {
        principal.versiones = principal.versiones || [];
        otras.forEach(n => principal.versiones.push({ id: n.id, nombre: n.titulo, guardada: n.modificado || n.creado || 0,
                                                      html: n.html, characters: n.characters || {} }));
        d.notas = d.notas.filter(n => n.subId !== sid || n === principal);
      }
    });
    d.etiquetas = d.etiquetas.filter(e => !guiones.has(e.subId));     // los segmentos de esa biblioteca ya no se ven
    d.contenedores.forEach(c => c.subs.forEach(s => { if (guiones.has(s.id)) { delete s.ordenSegmentos; delete s.secciones; } }));
  }

  /* Hasta la 1.0.58 cada personaje tenía su propio tablero (`personajes:esquema:<personaje>`), que nacía solo al
     abrirlo y no se podía ni borrar ni ordenar. Ahora los esquemas de personaje viven en su contenedor, «Esquemas»
     (Leo, 16-09-2026), como documentos sueltos: los que tenían algo dentro se mudan allí y los que quedaron vacíos
     (abiertos una vez y nada más) se descartan. */
  function mudarEsquemasPersonaje(d) {
    const b = d.contenedores.find(c => c.id === ID_PERSONAJES); if (!b) return;
    const viejos = b.esquemas.filter(e => e.id === ID_PERSONAJES + ':esquema' || e.id.startsWith(ID_PERSONAJES + ':esquema:'));
    if (!viejos.length) return;
    b.esquemas = b.esquemas.filter(e => !viejos.includes(e));
    const conAlgo = viejos.filter(e => (e.datos.puntos || []).length);
    if (!conAlgo.length) return;
    let c = d.contenedores.find(x => x.id === ID_ESQUEMAS);
    if (!c) {
      c = { id: ID_ESQUEMAS, nombre: 'Esquemas', fijado: false, plegado: false, creado: b.creado, modificado: b.modificado, carpetas: [], esquemas: [], subs: [], oculto: true };
      d.contenedores.push(c);
    }
    c.esquemas.push(...conAlgo);
  }

  /* Hasta la 1.0.54 un esquema y una biblioteca se «enlazaban» de uno en uno (`esquema.subId`). Ahora eso es un **grupo**
     del árbol, que admite las piezas que se quieran (Leo, 16-09-2026: «ya no solo dos… es solo para armar grupos dentro de
     un mismo nivel»). Los enlaces guardados se convierten en grupos de dos; `enlace()` sigue existiendo (lo usan «Ver
     biblioteca» y el chip del acto) pero se deduce del grupo. */
  function agruparEnlaces(d) {
    d.contenedores.forEach(c => {
      const enGrupo = new Set((c.grupos || []).flatMap(g => g.items));
      c.esquemas.forEach(e => {
        const sid = e.subId; delete e.subId;
        if (!sid || enGrupo.has(e.id) || enGrupo.has(sid)) return;
        if (!c.subs.some(x => x.id === sid && !x.guionEid)) return;
        const g = { id: e.id + ':grupo', nombre: 'Grupo ' + ((c.grupos || []).length + 1), color: 'ambar', padreId: null, items: [e.id, sid] };
        (c.grupos = c.grupos || []).push(g);
        enGrupo.add(e.id); enGrupo.add(sid);
      });
      /* lo de un grupo vive donde él: manda la carpeta de la primera pieza */
      (c.grupos || []).forEach(g => {
        const pieza = x => c.esquemas.find(e => e.id === x) || c.subs.find(s => s.id === x);
        const k = g.carpetaId || (pieza(g.items[0]) || {}).carpetaId || null;
        if (k) g.carpetaId = k; else delete g.carpetaId;
        g.items.forEach(x => { const p = pieza(x); if (!p) return; if (k) p.carpetaId = k; else delete p.carpetaId; });
      });
      if (c.grupos && !c.grupos.length) delete c.grupos;
    });
  }

  /* Hasta la 1.0.49 los guiones generados vivían en la biblioteca enlazada al esquema; ahora viven **con el esquema**
     (Leo, 16-09-2026: «se va directamente al esquema para que ya no pueda desenlazarse»), en una biblioteca suya que no
     sale en el árbol (`sub.guionEid`). Aquí se mudan los que vengan de un archivo antiguo: los segmentos de guiones y
     sus documentos van a la del esquema (el suyo, o el enlazado a la biblioteca donde estaban); si no hay esquema al
     que ir, se quedan como un segmento y una nota normales. */
  function mudarGuiones(d) {
    const contDe = new Map();                                  // subId → contenedor
    d.contenedores.forEach(c => c.subs.forEach(s => {
      if (s.guionEid && !c.esquemas.some(e => e.id === s.guionEid)) delete s.guionEid;   // sin su esquema, vuelve a ser una biblioteca normal
      contDe.set(s.id, c);
    }));
    const oculta = (c, eid) => {
      let s = c.subs.find(x => x.guionEid === eid);
      if (!s) { s = { id: eid + ':guiones', nombre: 'Guiones', creado: c.creado, modificado: c.modificado, guionEid: eid }; c.subs.push(s); contDe.set(s.id, c); }
      return s;
    };
    const destino = (eid, subId) => {
      if (eid) for (const c of d.contenedores) if (c.esquemas.some(e => e.id === eid)) return oculta(c, eid);
      const c = contDe.get(subId), e = c && c.esquemas.find(x => x.subId === subId);
      return e ? oculta(c, e.id) : null;
    };
    const enGuiones = subId => { const c = contDe.get(subId); const s = c && c.subs.find(x => x.id === subId); return !!(s && s.guionEid); };
    d.etiquetas.forEach(e => {
      if (!e.guiones) return;
      delete e.guiones;
      if (enGuiones(e.subId)) return;
      const s = destino(null, e.subId);
      if (s) { e.subId = s.id; delete e.seccionId; }
    });
    d.notas.forEach(n => {
      if (!n.guion || enGuiones(n.subId)) return;
      const etq = n.etiquetaId ? d.etiquetas.find(x => x.id === n.etiquetaId) : null;
      const s = etq ? { id: etq.subId } : destino(n.guion.eid, n.subId);
      if (s) n.subId = s.id; else delete n.guion;
    });
  }

  class Documentos {
    constructor(datos, opciones) {
      const o = opciones || {};
      this.ahora = o.ahora || (() => Date.now());
      this.idNuevo = o.idNuevo || (() => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      this.datos = normalizar(datos);
    }
    toJSON() { return clonar(this.datos); }

    /* ---------- consultas ---------- */
    contenedor(id) { return this.datos.contenedores.find(c => c.id === id) || null; }
    etiqueta(id) { return this.datos.etiquetas.find(e => e.id === id) || null; }
    nota(id) { return this.datos.notas.find(n => n.id === id) || null; }
    papelera() { return this.datos.papelera.slice(); }
    enPapelera(id) { return this.datos.papelera.find(x => x.nota.id === id) || null; }
    /* Un subcontenedor con su contenedor, o null. */
    sub(id) {
      for (const c of this.datos.contenedores) { const s = c.subs.find(x => x.id === id); if (s) return { contenedor: c, sub: s }; }
      return null;
    }
    /* Las bibliotecas del contenedor; la de los guiones de un esquema no está en el árbol (Leo, 16-09-2026). */
    subsDe(cid) { const c = this.contenedor(cid); return c ? c.subs.filter(s => !s.guionEid) : []; }
    esGuiones(subId) { const r = this.sub(subId); return !!(r && r.sub.guionEid); }
    /* ---------- los guiones generados viven con su esquema (Leo, 16-09-2026: «se va directamente al esquema para
       que ya no pueda desenlazarse»): una biblioteca oculta por esquema, que se mueve y se borra con él. ---------- */
    bibliotecaGuiones(eid, crear) {
      const r = this.esquema(eid); if (!r) return null;
      const hay = r.contenedor.subs.find(s => s.guionEid === eid);
      if (hay || crear === false) return hay || null;
      const t = Date.now();
      const s = { id: eid + ':guiones', nombre: 'Guiones', creado: t, modificado: t, guionEid: eid };
      r.contenedor.subs.push(s);
      return s;
    }
    /* ---------- grupos del árbol (Leo, 16-09-2026) ----------
       Juntan piezas de un mismo sitio (esquemas y bibliotecas; en Personajes, personajes) y **también otros grupos**: se
       anidan como carpetas. No significan nada más. Un grupo vive en una carpeta (`carpetaId`) o dentro de otro
       (`padreId`), y lo que tiene dentro va donde él. Un esquema y su biblioteca, que antes iban «enlazados», nacen
       agrupados. */
    /* Los grupos de un ámbito. Solo para leer: `_gruposMut` es el que crea la lista (leer no debe dejar un `grupos: []`
       en los datos, o el guion abierto dejaría de ser idéntico a su archivo). */
    _grupos(ambito) {
      if (ambito === ELENCO) return this.datos.gruposElenco || [];
      const c = this.contenedor(ambito); if (!c) return [];
      return c.grupos || [];
    }
    _gruposMut(ambito) {
      if (ambito === ELENCO) return this.datos.gruposElenco || (this.datos.gruposElenco = []);
      const c = this.contenedor(ambito); if (!c) return [];
      return c.grupos || (c.grupos = []);
    }
    _tocarAmbito(ambito) { if (ambito !== ELENCO) { const c = this.contenedor(ambito); if (c) this._tocar(c); } }
    /* Un grupo se queda aunque esté vacío (Leo, 16-09-2026): solo desaparece con «Deshacer el grupo». */
    _limpiarGrupos() {}
    /* El ámbito (contenedor o elenco) donde vive una pieza o un grupo. */
    _ambitoDe(id) {
      if (this.personaje(id)) return ELENCO;
      if ((this.datos.gruposElenco || []).some(g => g.id === id)) return ELENCO;
      const e = this.esquema(id); if (e) return e.contenedor.id;
      const s = this.sub(id); if (s && !s.sub.guionEid) return s.contenedor.id;
      for (const c of this.datos.contenedores) if ((c.grupos || []).some(g => g.id === id)) return c.id;
      return null;
    }
    grupo(gid) {
      const a = this._ambitoDe(gid); const g = a && this._grupos(a).find(x => x.id === gid);
      return g ? { ambito: a, grupo: g, contenedor: a === ELENCO ? null : this.contenedor(a) } : null;
    }
    /* El grupo que contiene algo: una pieza (por `items`) o un grupo (por `padreId`). */
    grupoDe(id) {
      const a = this._ambitoDe(id); if (!a) return null;
      const gs = this._grupos(a), propio = gs.find(x => x.id === id);
      const g = propio ? (propio.padreId ? gs.find(x => x.id === propio.padreId) : null) : gs.find(x => x.items.includes(id));
      return g ? { ambito: a, grupo: g, contenedor: a === ELENCO ? null : this.contenedor(a) } : null;
    }
    gruposDe(ambito) { return this._grupos(ambito).slice(); }
    /* Lo que hay dentro de un grupo, en el orden del árbol: sus grupos y sus piezas. */
    nivelGrupo(gid) {
      const r = this.grupo(gid); if (!r) return [];
      const orden = this._ordenArbol(r.ambito);
      const xs = this._grupos(r.ambito).filter(g => g.padreId === gid).map(obj => ({ tipo: 'grupo', id: obj.id, obj }));
      r.grupo.items.forEach(id => { const p = this._pieza(r.ambito, id); if (p) xs.push({ tipo: p.tipo, id, obj: p.obj }); });
      return xs.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
    }
    /* Una pieza de un ámbito: esquema o biblioteca de un contenedor, o personaje del elenco. */
    _pieza(ambito, id) {
      if (ambito === ELENCO) { const p = this.personaje(id); return p ? { tipo: 'personaje', obj: p } : null; }
      const c = this.contenedor(ambito); if (!c) return null;
      return this._piezaDe(c, id);
    }
    _piezaDe(c, id) {
      const e = c.esquemas.find(x => x.id === id); if (e) return { tipo: 'esquema', obj: e };
      const s = c.subs.find(x => x.id === id && !x.guionEid); if (s) return { tipo: 'sub', obj: s };
      return null;
    }
    crearGrupo(ambito, ids, nombre, col, op) {
      const gs = this._gruposMut(ambito);
      const todos = [...new Set((ids || []).map(String))];
      const piezas = todos.filter(x => this._pieza(ambito, x));
      const grupos = todos.filter(x => gs.some(g => g.id === x));
      const donde = piezas.length || grupos.length ? this.grupoDe(piezas[0] || grupos[0]) : null;   // vacío también vale (Leo, 16-09-2026)
      const g = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Grupo ' + (gs.length + 1)), gs.map(x => x.nombre)),
                  color: COLORES_CARPETA.includes(col) ? col : 'ambar',
                  padreId: donde ? donde.grupo.id : ((op && op.padreId && gs.some(x => x.id === op.padreId)) ? String(op.padreId) : null), items: [] };
      const k = piezas.length || grupos.length ? this._carpetaDe(ambito, piezas[0] || grupos[0]) : (op && op.carpetaId) || null;
      if (k) g.carpetaId = k;
      gs.push(g);
      piezas.forEach(x => { this.sacarDeGrupo(x, true); g.items.push(x); });
      grupos.forEach(x => { const q = gs.find(y => y.id === x); if (q && q !== g) q.padreId = g.id; });
      this._nivelar(ambito, g.id, k);
      this._limpiarGrupos(ambito); this._tocarAmbito(ambito);
      const n = piezas.length + grupos.length;
      return si({ grupo: g, aviso: '«' + g.nombre + '» agrupa ' + n + (n === 1 ? ' elemento' : ' elementos') });
    }
    /* Todas las piezas de un grupo, incluidas las de sus grupos. */
    _piezasGrupo(ambito, gid) {
      const gs = this._grupos(ambito), g = gs.find(x => x.id === gid); if (!g) return [];
      return [...g.items, ...gs.filter(x => x.padreId === gid).flatMap(x => this._piezasGrupo(ambito, x.id))];
    }
    _dentroDe(ambito, gid, deGid) {
      const gs = this._grupos(ambito); let p = (gs.find(x => x.id === gid) || {}).padreId;
      while (p) { if (p === deGid) return true; p = (gs.find(x => x.id === p) || {}).padreId; }
      return false;
    }
    _carpetaDe(ambito, id) {
      const g = this._grupos(ambito).find(x => x.id === id);
      if (g) return g.carpetaId || null;
      const p = this._pieza(ambito, id);
      return p ? (p.obj.carpetaId || null) : null;
    }
    /* Mete una pieza (o un grupo) dentro de un grupo, con lo que tenga. */
    aGrupo(gid, id) {
      const r = this.grupo(gid); if (!r) return no('Ese grupo ya no existe');
      if (id === gid) return no('Un grupo no va dentro de sí mismo');
      const esGrupo = this._grupos(r.ambito).some(g => g.id === id);
      if (!esGrupo && !this._pieza(r.ambito, id)) return no('Eso no está aquí');
      if (esGrupo) {
        let p = r.grupo;                                       // ni dentro de uno suyo
        while (p) { if (p.id === id) return no('Un grupo no va dentro de sí mismo'); p = p.padreId ? this._grupos(r.ambito).find(x => x.id === p.padreId) : null; }
      }
      this.sacarDeGrupo(id, true);
      if (esGrupo) { const g = this._grupos(r.ambito).find(x => x.id === id); g.padreId = gid; }
      else if (!r.grupo.items.includes(id)) r.grupo.items.push(id);
      this._nivelar(r.ambito, gid, r.grupo.carpetaId || null);
      this._limpiarGrupos(r.ambito); this._tocarAmbito(r.ambito);
      return si({ grupo: r.grupo, cambio: true });
    }
    /* Saca una pieza o un grupo de su grupo (se queda donde estaba el grupo). */
    sacarDeGrupo(id, callado) {
      const r = this.grupoDe(id); if (!r) return si({ cambio: false });
      const gs = this._grupos(r.ambito), propio = gs.find(x => x.id === id);
      if (propio) propio.padreId = r.grupo.padreId || null;
      else r.grupo.items = r.grupo.items.filter(x => x !== id);
      if (!callado) { this._limpiarGrupos(r.ambito); this._tocarAmbito(r.ambito); }
      return si({ grupo: r.grupo, cambio: true });
    }
    /* Todo lo de un grupo (y lo de sus grupos) en la misma carpeta. */
    _nivelar(ambito, gid, carpetaId) {
      const g = this._grupos(ambito).find(x => x.id === gid); if (!g) return;
      g.carpetaId = carpetaId || null;
      if (!g.carpetaId) delete g.carpetaId;
      g.items.forEach(id => { const p = this._pieza(ambito, id); if (!p) return; if (carpetaId) p.obj.carpetaId = carpetaId; else delete p.obj.carpetaId; });
      this._grupos(ambito).filter(x => x.padreId === gid).forEach(x => this._nivelar(ambito, x.id, carpetaId));
    }
    renombrarGrupo(gid, nombre) {
      const r = this.grupo(gid); if (!r) return no('Ese grupo ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this._grupos(r.ambito).some(g => g !== r.grupo && plano(g.nombre) === plano(n))) return no('Ya hay un grupo con ese nombre');
      r.grupo.nombre = n; this._tocarAmbito(r.ambito);
      return si({ grupo: r.grupo });
    }
    colorearGrupo(gid, col) {
      const r = this.grupo(gid); if (!r) return no('Ese grupo ya no existe');
      r.grupo.color = COLORES_CARPETA.includes(col) ? col : 'ambar'; this._tocarAmbito(r.ambito);
      return si({ grupo: r.grupo });
    }
    /* Deshace el grupo: lo suyo sube a donde estaba él. */
    deshacerGrupo(gid) {
      const r = this.grupo(gid); if (!r) return no('Ese grupo ya no existe');
      const gs = this._grupos(r.ambito), padre = r.grupo.padreId ? gs.find(x => x.id === r.grupo.padreId) : null;
      gs.forEach(x => { if (x.padreId === gid) { x.padreId = padre ? padre.id : null; } });
      if (padre) r.grupo.items.forEach(id => padre.items.push(id));
      const vivos = gs.filter(g => g !== r.grupo);
      if (r.ambito === ELENCO) { this.datos.gruposElenco = vivos; if (!vivos.length) delete this.datos.gruposElenco; }
      else { const c = this.contenedor(r.ambito); c.grupos = vivos; if (!vivos.length) delete c.grupos; }
      this._limpiarGrupos(r.ambito); this._tocarAmbito(r.ambito);
      return si({ grupo: r.grupo, aviso: '«' + r.grupo.nombre + '» deshecho' });
    }
    /* El «enlace» de antes, ahora deducido del grupo: el primer esquema y la primera biblioteca que lo comparten.
       Lo usan «Ver biblioteca», «Ver esquema» y el chip del acto en la cabecera del editor. */
    enlace(id) {
      const r = this.grupoDe(id); if (!r) return null;
      const esquema = r.contenedor.esquemas.find(e => r.grupo.items.includes(e.id));
      const sub = r.contenedor.subs.find(x => r.grupo.items.includes(x.id));
      return esquema && sub ? { contenedor: r.contenedor, esquema, sub, grupo: r.grupo } : null;
    }
    /* ---------- secciones de una biblioteca (Leo, 16-09-2026: en lugar de «Guiones generados», las que se quieran) ----------
       Cada sección agrupa segmentos; la de partida no se guarda (`seccionId` vacío) y es la que lleva la bandeja. */
    seccionesDe(subId) { const r = this.sub(subId); return r && Array.isArray(r.sub.secciones) ? r.sub.secciones.slice() : []; }
    seccion(id) {
      for (const c of this.datos.contenedores) for (const s of c.subs) {
        const k = (s.secciones || []).find(x => x.id === id); if (k) return { sub: s, seccion: k, contenedor: c };
      }
      return null;
    }
    crearSeccion(subId, nombre) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const mias = this.seccionesDe(subId);
      const k = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Sección'), mias.map(x => x.nombre)) };
      (r.sub.secciones = r.sub.secciones || []).push(k); this._tocarSub(subId);
      return si({ seccion: k });
    }
    renombrarSeccion(id, nombre) {
      const r = this.seccion(id); if (!r) return no('Esa sección ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this.seccionesDe(r.sub.id).some(x => x.id !== id && plano(x.nombre) === plano(n))) return no('Ya hay una sección con ese nombre');
      r.seccion.nombre = n; this._tocarSub(r.sub.id);
      return si({ seccion: r.seccion });
    }
    /* Sus segmentos vuelven a la sección de partida; las notas no se tocan. */
    eliminarSeccion(id) {
      const r = this.seccion(id); if (!r) return no('Esa sección ya no existe');
      let sueltos = 0;
      this.datos.etiquetas.forEach(e => { if (e.seccionId === id) { delete e.seccionId; sueltos++; } });
      r.sub.secciones = (r.sub.secciones || []).filter(x => x !== r.seccion);
      if (!r.sub.secciones.length) delete r.sub.secciones;
      this._tocarSub(r.sub.id);
      return si({ seccion: r.seccion, sueltos, aviso: '«' + r.seccion.nombre + '» eliminada' + (sueltos ? ' · ' + sueltos + (sueltos === 1 ? ' segmento vuelve' : ' segmentos vuelven') + ' a Segmentos' : '') });
    }
    /* Delante de otra sección (`antesDe`) o al final; con `antesDe` = null y `alPrincipio`, la primera. */
    colocarSeccion(id, antesDe) {
      const r = this.seccion(id); if (!r) return no('Esa sección ya no existe');
      const l = (r.sub.secciones || []).filter(x => x !== r.seccion);
      const ref = antesDe && antesDe !== id ? l.find(x => x.id === antesDe) : null;
      l.splice(ref ? l.indexOf(ref) : l.length, 0, r.seccion);
      r.sub.secciones = l; this._tocarSub(r.sub.id);
      return si({ seccion: r.seccion });
    }
    /* Un segmento a otra sección de su biblioteca (null = la de partida). */
    cambiarSeccion(id, seccionId) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      if (seccionId) { const r = this.seccion(seccionId); if (!r || r.sub.id !== e.subId) return no('Esa sección no es de esta biblioteca'); }
      if ((e.seccionId || null) === (seccionId || null)) return si({ etiqueta: e, cambio: false });
      if (seccionId) e.seccionId = seccionId; else delete e.seccionId;
      this._tocarSub(e.subId);
      return si({ etiqueta: e, cambio: true });
    }
    /* Los segmentos de una biblioteca: todos (`seccionId` sin dar), los de la sección de partida (null) o los de una. */
    etiquetasDe(subId, seccionId) {
      return this.datos.etiquetas.filter(e => e.subId === subId
        && (seccionId === undefined || (seccionId ? e.seccionId === seccionId : !e.seccionId)));
    }
    /* Notas de un subcontenedor: todas (`etiquetaId` sin dar) o las de un segmento (null = la bandeja). */
    notasDe(subId, etiquetaId) {
      return this.datos.notas.filter(n => n.subId === subId && (etiquetaId === undefined || (etiquetaId ? n.etiquetaId === etiquetaId : !n.etiquetaId)));
    }
    notasContenedor(cid) { const set = new Set(this.subsDe(cid).map(s => s.id)); return this.datos.notas.filter(n => set.has(n.subId)); }
    /* Las dos listas de la barra (fijados y el resto), filtradas por texto (nombre del contenedor, de
       un hijo o título de alguna nota) y ordenadas. */
    contenedores(opciones) {
      const o = opciones || {}, q = plano(o.texto);
      const cmp = { az: (a, b) => comparar(a.nombre, b.nombre), za: (a, b) => comparar(b.nombre, a.nombre), modificado: (a, b) => b.modificado - a.modificado }[o.orden];
      const pasa = c => !q || plano(c.nombre).includes(q) || c.subs.some(s => plano(s.nombre).includes(q)) || this.notasContenedor(c.id).some(n => plano(n.titulo).includes(q))
        || c.esquemas.some(e => plano(e.nombre).includes(q) || Object.values(e.notas).some(n => plano(n.title).includes(q)));
      const preparar = xs => { const f = xs.filter(pasa); return cmp ? f.sort(cmp) : f; };
      const visibles = this.datos.contenedores.filter(c => !c.oculto);   // el de Personajes no sale en el árbol
      return { fijados: preparar(visibles.filter(c => c.fijado)), sueltos: preparar(visibles.filter(c => !c.fijado)),
               total: visibles.length };
    }
    /* Notas de un subcontenedor que casan con el texto (todas si no hay texto). */
    buscarNotas(subId, texto) { const q = plano(texto); return this.notasDe(subId).filter(n => !q || plano(n.titulo).includes(q)); }

    _libre(base, usados) {
      const set = new Set(usados.map(plano));
      if (!set.has(plano(base))) return base;
      let n = 2; while (set.has(plano(base + ' ' + n))) n++;
      return base + ' ' + n;
    }
    _tocar(c) { if (c) c.modificado = this.ahora(); }
    _tocarSub(subId) { const r = this.sub(subId); if (r) { r.sub.modificado = this.ahora(); this._tocar(r.contenedor); } }

    /* ---------- contenedores ---------- */
    /* Estrena una biblioteca («Biblioteca»), salvo con `{ vacio: true }`. */
    crearContenedor(nombre, opciones) {
      const t = this.ahora();
      const c = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Contenedor'), this.datos.contenedores.map(x => x.nombre)),
                  fijado: false, plegado: false, creado: t, modificado: t, carpetas: [], esquemas: [], subs: [] };
      this.datos.contenedores.push(c);
      if (!(opciones && opciones.vacio)) c.subs.push({ id: this.idNuevo(), nombre: NOMBRE_SUB, creado: t, modificado: t });
      return si({ contenedor: c, sub: c.subs[0] || null });
    }
    /* El esquema que vivía en el guion (forma antigua) pasa al primer contenedor (o a uno nuevo, «Trama
       global»); solo una vez por guion (`migrado`). Devuelve el esquema creado, o null si no hacía falta. */
    migrarEsquema(datos, notas) {
      if (this.datos.migrado) return si({ esquema: null, cambio: false });
      this.datos.migrado = true;
      if (!datos || !Array.isArray(datos.lineas)) return si({ esquema: null, cambio: true });
      const c = this.datos.contenedores.find(x => !x.oculto) || this.crearContenedor(NOMBRE_GLOBAL).contenedor;   // un «Capítulo» con su biblioteca
      const r = this.crearEsquema(c.id, datos, 'Esquema de pasos', notas);
      return si({ esquema: r.ok ? r.esquema : null, contenedor: c, cambio: true });
    }
    renombrarContenedor(id, nombre) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this.datos.contenedores.some(x => x !== c && plano(x.nombre) === plano(n))) return no('Ya hay un contenedor con ese nombre');
      c.nombre = n; this._tocar(c);
      return si({ contenedor: c });
    }
    fijarContenedor(id, fijado) { const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe'); c.fijado = !!fijado; return si({ contenedor: c }); }
    plegarContenedor(id, plegado) { const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe'); c.plegado = plegado === undefined ? !c.plegado : !!plegado; return si({ contenedor: c }); }
    moverContenedor(id, salto) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      const todos = this.datos.contenedores, grupo = todos.filter(x => x.fijado === c.fijado);
      const i = grupo.indexOf(c), j = i + (salto < 0 ? -1 : 1);
      if (j < 0 || j >= grupo.length) return no('Ya está en el extremo');
      const a = todos.indexOf(c), b = todos.indexOf(grupo[j]); todos[a] = grupo[j]; todos[b] = c;
      return si({ contenedor: c });
    }
    /* Soltar tras arrastrar en la barra: queda delante de `antesDe` (y en su grupo, fijados o no) o al
       final de su grupo. */
    colocarContenedor(id, antesDe) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      const ref = antesDe && antesDe !== id ? this.contenedor(antesDe) : null;
      const resto = this.datos.contenedores.filter(x => x !== c);
      if (ref) { c.fijado = ref.fijado; resto.splice(resto.indexOf(ref), 0, c); }
      else { const grupo = resto.filter(x => x.fijado === c.fijado); resto.splice(grupo.length ? resto.indexOf(grupo[grupo.length - 1]) + 1 : resto.length, 0, c); }
      this.datos.contenedores = resto;
      return si({ contenedor: c });
    }
    /* Se lleva sus esquemas y sus subcontenedores con sus etiquetas; las notas van a la papelera. */
    eliminarContenedor(id) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      const mias = this.notasContenedor(id), notas = mias.length;
      mias.forEach(n => this.tirarNota(n.id));
      const subs = new Set(c.subs.map(s => s.id));
      this.datos.contenedores = this.datos.contenedores.filter(x => x !== c);
      this.datos.etiquetas = this.datos.etiquetas.filter(e => !subs.has(e.subId));
      return si({ contenedor: c, notas, esquemas: c.esquemas.length, aviso: '«' + c.nombre + '» eliminado' + (notas ? ' · ' + notas + (notas === 1 ? ' nota va' : ' notas van') + ' a la papelera' : '') });
    }

    /* ---------- carpetas ---------- */
    /* `ambito`: el id de un contenedor, o ELENCO (las de Personajes). */
    carpetasDe(ambito) { if (ambito === ELENCO) return this.datos.carpetasElenco; const c = this.contenedor(ambito); return c ? c.carpetas : []; }
    /* Una carpeta con su ámbito y su contenedor (null en Personajes), o null. */
    carpeta(id) {
      if (!id) return null;
      const k = this.datos.carpetasElenco.find(x => x.id === id); if (k) return { ambito: ELENCO, contenedor: null, carpeta: k };
      for (const c of this.datos.contenedores) { const x = c.carpetas.find(y => y.id === id); if (x) return { ambito: c.id, contenedor: c, carpeta: x }; }
      return null;
    }
    hijasDe(ambito, padreId) { return this.carpetasDe(ambito).filter(k => (k.padreId || null) === (padreId || null)); }
    /* La carpeta y todas las que cuelgan de ella. */
    _descendientes(ambito, id) {
      const set = new Set([id]); let crece = true;
      while (crece) { crece = false; this.carpetasDe(ambito).forEach(k => { if (k.padreId && set.has(k.padreId) && !set.has(k.id)) { set.add(k.id); crece = true; } }); }
      return set;
    }
    /* Lo que cuelga de una carpeta, contando lo de sus subcarpetas: esquemas y bibliotecas, o personajes. */
    cuentaCarpeta(id) {
      const r = this.carpeta(id); if (!r) return 0;
      const set = this._descendientes(r.ambito, id), dentro = x => x.carpetaId && set.has(x.carpetaId);
      if (!r.contenedor) return this.datos.elenco.filter(dentro).length;
      return r.contenedor.esquemas.filter(dentro).length + r.contenedor.subs.filter(x => dentro(x) && !x.guionEid).length;
    }
    /* Pone un esquema o una biblioteca en una carpeta de su contenedor (null: la raíz); si está en un grupo, sus
       compañeras van con él (un grupo vive en un solo nivel). */
    _enCarpeta(c, x, carpetaId) { this._aCarpeta(c.id, x, carpetaId); }
    /* Lo mismo para cualquier ámbito (un contenedor o Personajes). */
    _aCarpeta(ambito, x, carpetaId) {
      const k = carpetaId && this.carpetasDe(ambito).some(y => y.id === carpetaId) ? carpetaId : null;
      /* si está en un grupo, el grupo entero (con sus grupos) se muda con él: viven en un solo sitio */
      const gs = this._grupos(ambito), g = gs.find(y => y.items.includes(x.id));
      if (g) {
        let raiz = g; while (raiz.padreId) { const p = gs.find(y => y.id === raiz.padreId); if (!p) break; raiz = p; }
        this._nivelar(ambito, raiz.id, k);
        return;
      }
      if (k) x.carpetaId = k; else delete x.carpetaId;
    }
    crearCarpeta(ambito, nombre, col, padreId) {
      const c = ambito === ELENCO ? null : this.contenedor(ambito);   // en Personajes las carpetas vuelven (Leo, 16-09-2026)
      if (ambito !== ELENCO && !c) return no('Ese contenedor ya no existe');
      const lista = this.carpetasDe(ambito);
      if (padreId && !lista.some(k => k.id === padreId)) return no('Esa carpeta ya no existe');
      const k = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Carpeta'), this.hijasDe(ambito, padreId).map(x => x.nombre)),
                  color: COLORES_CARPETA.includes(col) ? col : 'gris', padreId: padreId || null };
      lista.push(k); this._tocar(c);
      return si({ carpeta: k });
    }
    renombrarCarpeta(id, nombre) {
      const r = this.carpeta(id); if (!r) return no('Esa carpeta ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this.hijasDe(r.ambito, r.carpeta.padreId).some(k => k !== r.carpeta && plano(k.nombre) === plano(n))) return no('Ya hay una carpeta con ese nombre ahí');
      r.carpeta.nombre = n; this._tocar(r.contenedor);
      return si(r);
    }
    colorearCarpeta(id, col) {
      const r = this.carpeta(id); if (!r) return no('Esa carpeta ya no existe');
      if (!COLORES_CARPETA.includes(col)) return no('Ese color no existe');
      r.carpeta.color = col; this._tocar(r.contenedor);
      return si(r);
    }
    plegarCarpeta(id, plegada) {
      const r = this.carpeta(id); if (!r) return no('Esa carpeta ya no existe');
      const p = plegada === undefined ? !r.carpeta.plegada : !!plegada;
      if (p) r.carpeta.plegada = true; else delete r.carpeta.plegada;
      return si(r);
    }
    /* Lo que tenía (carpetas, esquemas, bibliotecas o personajes) sube a la carpeta de arriba; no se pierde nada. */
    eliminarCarpeta(id) {
      const r = this.carpeta(id); if (!r) return no('Esa carpeta ya no existe');
      const arriba = r.carpeta.padreId || null;
      const subir = x => { if (x.carpetaId !== id) return; if (arriba) x.carpetaId = arriba; else delete x.carpetaId; };
      this.carpetasDe(r.ambito).forEach(k => { if (k.padreId === id) k.padreId = arriba; });
      if (r.contenedor) { r.contenedor.esquemas.forEach(subir); r.contenedor.subs.forEach(subir); } else this.datos.elenco.forEach(subir);
      if (r.contenedor) r.contenedor.carpetas = r.contenedor.carpetas.filter(k => k !== r.carpeta); else this.datos.carpetasElenco = this.datos.carpetasElenco.filter(k => k !== r.carpeta);
      this._tocar(r.contenedor);
      return si(Object.assign({ aviso: 'Carpeta «' + r.carpeta.nombre + '» eliminada' }, r));
    }
    /* Mete algo en una carpeta (null: la raíz de su ámbito). `tipo`: 'carpeta', 'esquema', 'sub' o 'personaje'. Un
       esquema o una biblioteca que va a una carpeta de otro contenedor se muda con su pareja; una carpeta, con todo lo
       suyo. Una carpeta no entra en sí misma ni en una de sus subcarpetas. */
    moverACarpeta(tipo, id, carpetaId, cid) {
      const dest = carpetaId ? this.carpeta(carpetaId) : null;
      if (carpetaId && !dest) return no('Esa carpeta ya no existe');
      if (tipo === 'personaje') {
        const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
        if (dest && dest.ambito !== ELENCO) return no('Un personaje solo va en una carpeta de Personajes');
        this._aCarpeta(ELENCO, p, carpetaId);                  // si está en un grupo, el grupo entero se muda con él
        return si({ personaje: p });
      }
      if (tipo === 'carpeta') {
        const r = this.carpeta(id); if (!r) return no('Esa carpeta ya no existe');
        const ambito = dest ? dest.ambito : (cid || r.ambito);
        if ((ambito === ELENCO) !== (r.ambito === ELENCO)) return no('Esa carpeta no puede ir ahí');
        if (ambito !== r.ambito) { const x = this._trasladarCarpeta(r, this.contenedor(ambito)); if (!x.ok) return x; }
        if (carpetaId && this._descendientes(ambito, id).has(carpetaId)) return no('Una carpeta no puede ir dentro de sí misma');
        const lista = this.carpetasDe(ambito);
        r.carpeta.padreId = carpetaId || null;
        r.carpeta.nombre = this._libre(r.carpeta.nombre, this.hijasDe(ambito, carpetaId).filter(k => k !== r.carpeta).map(k => k.nombre));
        lista.splice(lista.indexOf(r.carpeta), 1); lista.push(r.carpeta);   // al final de su nivel
        this._tocar(this.contenedor(ambito));
        return si({ carpeta: r.carpeta });
      }
      if (tipo === 'grupo') {                                  // un grupo se muda con todo lo suyo (Leo, 16-09-2026)
        const g = this.grupo(id); if (!g) return no('Ese grupo ya no existe');
        const ambito = dest ? dest.ambito : (cid || g.ambito);
        if ((ambito === ELENCO) !== (g.ambito === ELENCO)) return no('Eso no puede ir ahí');
        if (ambito !== g.ambito) {                             // a otro contenedor: sus piezas primero
          const origen = this.contenedor(g.ambito), destino2 = this.contenedor(ambito);
          if (!destino2) return no('Ese contenedor ya no existe');
          this._piezasGrupo(g.ambito, id).forEach(x => {
            const p = this._piezaDe(origen, x); if (!p) return;
            if (p.tipo === 'esquema') this.colocarEsquema(x, null, ambito); else this.colocarSub(x, null, ambito);
          });
          const mios = this._grupos(g.ambito).filter(x => x.id === id || this._dentroDe(g.ambito, x.id, id));
          if (g.ambito !== ELENCO) { origen.grupos = (origen.grupos || []).filter(x => !mios.includes(x)); if (!origen.grupos.length) delete origen.grupos; }
          const gs2 = this._gruposMut(ambito); mios.forEach(x => gs2.push(x));
          this._tocar(origen); this._tocar(destino2);
        }
        const g2 = this.grupo(id);
        g2.grupo.padreId = null;
        this._nivelar(ambito, id, carpetaId || null);
        this._tocarAmbito(ambito);
        return si({ grupo: g2.grupo });
      }
      const r = tipo === 'esquema' ? this.esquema(id) : this.sub(id); if (!r) return no(tipo === 'esquema' ? 'Ese esquema ya no existe' : 'Esa biblioteca ya no existe');
      if (dest && dest.ambito === ELENCO) return no('Ahí solo van personajes');
      const destino = dest ? dest.contenedor : (cid ? this.contenedor(cid) : r.contenedor);
      if (!destino) return no('Ese contenedor ya no existe');
      if (destino !== r.contenedor) { const x = tipo === 'esquema' ? this.colocarEsquema(id, null, destino.id) : this.colocarSub(id, null, destino.id); if (!x.ok) return x; }
      const item = tipo === 'esquema' ? this.esquema(id).esquema : this.sub(id).sub;
      this._enCarpeta(destino, item, carpetaId || null); this._tocar(destino);
      return si({ contenedor: destino });
    }
    /* ---------- orden del árbol ----------
       En cada nivel (la raíz de un contenedor o una carpeta; lo mismo en Personajes) todo va en un solo orden: carpetas,
       esquemas (con su biblioteca enlazada, que es una pieza con él) y bibliotecas sueltas, mezclados como se quiera.
       Se guarda como una lista de ids por contenedor (`ordenArbol`) y otra para Personajes (`ordenElenco`); lo nuevo
       entra detrás de su vecino natural (`aplicarOrden`). */
    _miembrosArbol(ambito) {
      const gs = this._grupos(ambito).map(g => g.id);
      if (ambito === ELENCO) return [...this.datos.carpetasElenco.map(k => k.id), ...gs, ...this.datos.elenco.map(p => p.id)];
      const c = this.contenedor(ambito); if (!c) return [];
      return [...c.carpetas.map(k => k.id), ...gs, ...c.esquemas.map(e => e.id), ...c.subs.filter(x => !x.guionEid).map(x => x.id)];
    }
    _ordenArbol(ambito) {
      const guardado = ambito === ELENCO ? this.datos.ordenElenco : (this.contenedor(ambito) || {}).ordenArbol;
      return aplicarOrden(this._miembrosArbol(ambito), guardado);
    }
    /* Lo de un nivel en su orden: [{ tipo: 'carpeta' | 'grupo' | 'esquema' | 'sub' | 'personaje', id, obj }]. Lo que está
       dentro de un grupo no sale aquí: sale en `nivelGrupo(gid)`. */
    nivelArbol(ambito, carpetaId) {
      const k = carpetaId || null, orden = this._ordenArbol(ambito);
      const gs = this._grupos(ambito);
      const dentro = new Set(gs.flatMap(g => g.items));
      const aqui = x => (x.carpetaId || null) === k && !dentro.has(x.id);
      const xs = this.hijasDe(ambito, k).map(obj => ({ tipo: 'carpeta', id: obj.id, obj }));   // también en Personajes (Leo, 16-09-2026)
      xs.push(...gs.filter(g => !g.padreId && (g.carpetaId || null) === k).map(obj => ({ tipo: 'grupo', id: obj.id, obj })));
      if (ambito === ELENCO) xs.push(...this.datos.elenco.filter(aqui).map(obj => ({ tipo: 'personaje', id: obj.id, obj })));
      else {
        const c = this.contenedor(ambito); if (!c) return [];
        xs.push(...c.esquemas.filter(aqui).map(obj => ({ tipo: 'esquema', id: obj.id, obj })), ...c.subs.filter(x => aqui(x) && !x.guionEid).map(obj => ({ tipo: 'sub', id: obj.id, obj })));
      }
      return xs.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
    }
    /* Qué es un id del árbol y dónde está: su ámbito, su carpeta y el grupo que lo tiene (si lo tiene). */
    _piezaArbol(id) {
      const g = this.grupo(id);
      if (g) return { tipo: 'grupo', id, ambito: g.ambito, carpetaId: g.grupo.carpetaId || null, grupoId: (this.grupoDe(id) || {}).grupo && this.grupoDe(id).grupo.id || null };
      const k = this.carpeta(id); if (k) return { tipo: 'carpeta', id, ambito: k.ambito, carpetaId: k.carpeta.padreId || null, grupoId: null };
      const gd = this.grupoDe(id), gid = gd ? gd.grupo.id : null;
      const p = this.personaje(id); if (p) return { tipo: 'personaje', id, ambito: ELENCO, carpetaId: p.carpetaId || null, grupoId: gid };
      const e = this.esquema(id); if (e) return { tipo: 'esquema', id, ambito: e.contenedor.id, carpetaId: e.esquema.carpetaId || null, grupoId: gid };
      const s = this.sub(id); if (s && !s.sub.guionEid) return { tipo: 'sub', id, ambito: s.contenedor.id, carpetaId: s.sub.carpetaId || null, grupoId: gid };
      return null;
    }
    /* Pone una pieza (o un grupo) del árbol delante (o, con `despues`, detrás) de otra: **va a donde vive esa otra**, o
       sea a su carpeta y a su grupo. Así se mete y se saca de un grupo con solo arrastrar (Leo, 16-09-2026). */
    colocarEnArbol(id, refId, despues) {
      const yo = this._piezaArbol(id), ref = this._piezaArbol(refId);
      if (!yo || !ref) return no('Eso ya no existe');
      if (yo.id === ref.id) return si({});
      if ((yo.ambito === ELENCO) !== (ref.ambito === ELENCO)) return no('Eso no puede ir ahí');   // personajes con personajes; lo demás, en los contenedores
      if (yo.tipo === 'grupo') {                               // un grupo dentro de sí mismo, no
        let p = ref.grupoId;
        while (p) { if (p === id) return no('Un grupo no va dentro de sí mismo'); const q = this.grupo(p); p = q && q.grupo.padreId; }
      }
      if (yo.grupoId !== ref.grupoId) {
        if (ref.grupoId) { const r = this.aGrupo(ref.grupoId, id); if (!r.ok) return r; }
        else this.sacarDeGrupo(id);
      }
      if (yo.ambito !== ref.ambito || yo.carpetaId !== ref.carpetaId) {
        const x = this.moverACarpeta(yo.tipo, yo.id, ref.carpetaId, ref.ambito); if (!x.ok) return x;
      }
      const lista = this._ordenArbol(ref.ambito).filter(x => x !== yo.id);
      lista.splice(lista.indexOf(ref.id) + (despues ? 1 : 0), 0, yo.id);
      if (ref.ambito === ELENCO) this.datos.ordenElenco = lista;
      else { const c = this.contenedor(ref.ambito); c.ordenArbol = lista; this._tocar(c); }
      return si({});
    }
    /* Delante de otra carpeta (en su nivel y su contenedor). */
    colocarCarpeta(id, antesDe) {
      const r = this.carpeta(id), ref = this.carpeta(antesDe); if (!r || !ref) return no('Esa carpeta ya no existe');
      if (id === antesDe) return si(r);
      const x = this.moverACarpeta('carpeta', id, ref.carpeta.padreId, ref.ambito); if (!x.ok) return x;
      const lista = this.carpetasDe(ref.ambito);
      lista.splice(lista.indexOf(r.carpeta), 1); lista.splice(lista.indexOf(ref.carpeta), 0, r.carpeta);
      return si(r);
    }
    /* Muda una carpeta con sus subcarpetas, esquemas y bibliotecas a otro contenedor (a su raíz). */
    _trasladarCarpeta(r, destino) {
      if (!destino || destino.oculto) return no('Ese contenedor ya no existe');
      const origen = r.contenedor, set = this._descendientes(r.ambito, r.carpeta.id);
      const carpetas = origen.carpetas.filter(k => set.has(k.id));
      origen.carpetas = origen.carpetas.filter(k => !set.has(k.id));
      destino.carpetas.push(...carpetas);
      r.carpeta.padreId = null;
      const dentro = x => x.carpetaId && set.has(x.carpetaId);
      origen.esquemas.filter(dentro).forEach(e => { const k = e.carpetaId; this.colocarEsquema(e.id, null, destino.id); this._enCarpeta(destino, e, k); });
      origen.subs.filter(dentro).forEach(s => { const k = s.carpetaId; if (destino.subs.includes(s)) return; this.colocarSub(s.id, null, destino.id); this._enCarpeta(destino, s, k); });
      this._tocar(origen); this._tocar(destino);
      return si({});
    }

    /* ---------- personajes: dos contenedores ocultos, sus bibliotecas y sus esquemas ---------- */
    /* El contenedor con la biblioteca de cada personaje; con `crear` lo crea si no existe. */
    personajes(crear) {
      let c = this.contenedor(ID_PERSONAJES);
      if (!c) {
        if (!crear) return null;
        const t = this.ahora();
        c = { id: ID_PERSONAJES, nombre: 'Personajes', fijado: false, plegado: false, creado: t, modificado: t, carpetas: [], esquemas: [], subs: [], oculto: true };
        this.datos.contenedores.push(c);
      }
      return c;
    }
    /* El contenedor de los esquemas de personaje (Leo, 16-09-2026: ya no hay uno por personaje, son documentos
       sueltos que se crean eligiendo un personaje y se ordenan, agrupan y guardan en carpetas como los demás). */
    esquemasPersonajes(crear) {
      let c = this.contenedor(ID_ESQUEMAS);
      if (!c) {
        if (!crear) return null;
        const t = this.ahora();
        c = { id: ID_ESQUEMAS, nombre: 'Esquemas', fijado: false, plegado: false, creado: t, modificado: t, carpetas: [], esquemas: [], subs: [], oculto: true };
        this.datos.contenedores.push(c);
      }
      return c;
    }
    /* ¿Es un esquema de personaje? (sus tramas son personajes y sus actos, momentos) */
    esEsquemaPersonaje(eid) { const r = this.esquema(eid); return !!r && r.contenedor.id === ID_ESQUEMAS; }
    /* Uno nuevo: `datos` trae ya su primera trama con el personaje elegido, que luego se edita y se borra como
       cualquier otra. No estrena biblioteca (ahí solo van esquemas) y crea el contenedor si aún no estaba. */
    crearEsquemaPersonaje(datos, nombre) {
      const c = this.esquemasPersonajes(true);
      const e = sanearEsquema({ datos, notas: {} }, this.idNuevo(), this._libre(texto(nombre, 'Esquema'), c.esquemas.map(x => x.nombre)));
      if (!e) return no('Eso no es un esquema de pasos válido');
      c.esquemas.push(e); this._tocar(c);
      return si({ contenedor: c, esquema: e, aviso: 'Esquema «' + e.nombre + '» creado' });
    }
    /* La biblioteca de un personaje (una trama del tablero de Personajes); la crea con su nombre si no la hay. Estrena el
       segmento «Hoja de personaje» (Leo, 15-09-2026), con el color del personaje, una sola vez (`hoja`): si se renombra o se
       borra, no vuelve; las bibliotecas de antes lo reciben la primera vez que se abren. */
    bibliotecaPersonaje(personajeId, nombre) {
      if (!personajeId) return null;
      const c = this.personajes(true);                          // el contenedor nace con la primera biblioteca
      let s = c.subs.find(x => x.lineaId === personajeId);        // (`lineaId` guarda el id del personaje del elenco)
      if (!s) {
        const t = this.ahora();
        s = { id: this.idNuevo(), nombre: texto(nombre, 'Personaje'), creado: t, modificado: t, lineaId: personajeId };
        c.subs.push(s); this._tocar(c);
      } else if (nombre && texto(nombre, '') && s.nombre !== texto(nombre, '')) s.nombre = texto(nombre, '');   // sigue al nombre del personaje
      if (!s.hoja) {
        s.hoja = true;
        const p = this.personaje(personajeId);
        if (!this.etiquetasDe(s.id).some(e => plano(e.nombre) === plano(HOJA_PERSONAJE))) this.crearEtiqueta(s.id, HOJA_PERSONAJE, p ? p.color : null);
      }
      return s;
    }

    /* ---------- subcontenedores ---------- */
    crearSub(cid, nombre) {
      const c = this.contenedor(cid); if (!c) return no('Ese contenedor ya no existe');
      const t = this.ahora();
      const s = { id: this.idNuevo(), nombre: this._libre(texto(nombre, NOMBRE_SUB), c.subs.map(x => x.nombre)), creado: t, modificado: t };
      c.subs.push(s); this._tocar(c);
      return si({ contenedor: c, sub: s });
    }
    renombrarSub(id, nombre) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (r.contenedor.subs.some(x => x !== r.sub && plano(x.nombre) === plano(n))) return no('Ya hay una biblioteca con ese nombre');
      r.sub.nombre = n; this._tocarSub(id);
      return si(r);
    }
    /* Soltar tras arrastrar: delante de `antesDe` (un subcontenedor de cualquier contenedor: se va a
       ese contenedor) o al final de `cid` (o del suyo). */
    colocarSub(id, antesDe, cid) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      const ref = antesDe && antesDe !== id ? this.sub(antesDe) : null;
      if (antesDe && antesDe !== id && !ref) return no('Esa biblioteca ya no existe');
      const destino = ref ? ref.contenedor : (cid ? this.contenedor(cid) : r.contenedor);
      if (!destino) return no('Ese contenedor ya no existe');
      if (destino !== r.contenedor && destino.subs.some(x => plano(x.nombre) === plano(r.sub.nombre))) r.sub.nombre = this._libre(r.sub.nombre, destino.subs.map(x => x.nombre));
      r.contenedor.subs = r.contenedor.subs.filter(x => x !== r.sub);
      const lista = destino.subs.filter(x => x !== r.sub);
      lista.splice(ref ? lista.indexOf(ref.sub) : lista.length, 0, r.sub);
      destino.subs = lista; this._tocar(r.contenedor); this._tocar(destino);
      /* en un grupo: sus compañeras van con él (al final del destino) */
      if (destino !== r.contenedor) this._llevarGrupo(r.contenedor, destino, id);
      /* la carpeta: la de aquel delante del que se suelta; soltada sobre un contenedor, su raíz */
      if (ref) this._enCarpeta(destino, r.sub, ref.sub.carpetaId); else if (cid || destino !== r.contenedor) this._enCarpeta(destino, r.sub, null);
      return si({ contenedor: destino, sub: r.sub, movido: destino !== r.contenedor });
    }
    /* Las compañeras de grupo de `id` se mudan con él a otro contenedor, y el grupo se muda entero. */
    _llevarGrupo(origen, destino, id) {
      const g = (origen.grupos || []).find(x => x.items.includes(id)); if (!g) return;
      g.items.filter(x => x !== id).forEach(x => {
        const p = this._piezaDe(origen, x); if (!p) return;
        this._llevar(origen, destino, p.tipo === 'esquema' ? 'esquemas' : 'subs', p.obj, null);
        if (p.tipo === 'esquema') { const gs = origen.subs.find(y => y.guionEid === x); if (gs) this._llevar(origen, destino, 'subs', gs, null); }
      });
      origen.grupos = (origen.grupos || []).filter(x => x !== g);
      if (!origen.grupos.length) delete origen.grupos;
      (destino.grupos = destino.grupos || []).push(g);
    }
    /* Pasa `x` de la lista `clave` de un contenedor a la del otro (delante de `antesDe` o al final),
       renombrándolo si choca con otro de su clase allí. */
    _llevar(origen, destino, clave, x, antesDe) {
      if (destino !== origen && destino[clave].some(y => y !== x && plano(y.nombre) === plano(x.nombre))) x.nombre = this._libre(x.nombre, destino[clave].filter(y => y !== x).map(y => y.nombre));
      origen[clave] = origen[clave].filter(y => y !== x);
      const lista = destino[clave].filter(y => y !== x);
      lista.splice(antesDe ? Math.max(0, lista.indexOf(antesDe)) : lista.length, 0, x);
      destino[clave] = lista;
    }
    /* En la vista de una biblioteca enlazada, qué sección va arriba: la cronología (por defecto) o los segmentos. */
    /* ---------- orden propio de actos y documentos en una biblioteca (cronología, momentos) ---------- */
    ordenActos(subId, actosNaturales) {
      const r = this.sub(subId), o = r && r.sub.ordenActos;
      return aplicarOrden(actosNaturales, o && o.actos);
    }
    ordenNodos(subId, actoId, nodosNaturales) {
      const r = this.sub(subId), o = r && r.sub.ordenActos;
      return aplicarOrden(nodosNaturales, o && o.nodos[actoId]);
    }
    /* `visibles`: la lista tal como se ve ahora; el acto (o el documento) queda delante de `antesDe` (al final con null) */
    colocarActo(subId, actoId, antesDe, visibles) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const l = visibles.filter(x => x !== actoId), i = antesDe ? l.indexOf(antesDe) : -1;
      l.splice(i < 0 ? l.length : i, 0, actoId);
      r.sub.ordenActos = r.sub.ordenActos || { actos: [], nodos: {} };
      r.sub.ordenActos.actos = l; this._tocarSub(subId);
      return si(r);
    }
    colocarNodoActo(subId, actoId, puntoId, antesDe, visibles) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      if (!visibles.includes(puntoId)) return no('Ese documento es de otro segmento');
      const l = visibles.filter(x => x !== puntoId), i = antesDe ? l.indexOf(antesDe) : -1;
      l.splice(i < 0 ? l.length : i, 0, puntoId);
      r.sub.ordenActos = r.sub.ordenActos || { actos: [], nodos: {} };
      r.sub.ordenActos.nodos[actoId] = l; this._tocarSub(subId);
      return si(r);
    }
    /* El orden de las tarjetas de segmentos de una biblioteca, que se cambia arrastrando (Leo): claves `bandeja`,
       `etq:<id>` y, en el carrusel de un personaje, también `apariciones` y `acto:<id>` (sus momentos). Sin orden
       guardado, el natural (bandeja, segmentos; en el carrusel: apariciones, bandeja, momentos, segmentos). */
    ordenSegmentos(subId, naturales) {
      const r = this.sub(subId);
      return aplicarOrden(naturales, r && r.sub.ordenSegmentos);
    }
    colocarSegmento(subId, clave, antesDe, visibles) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const l = visibles.filter(x => x !== clave), i = antesDe ? l.indexOf(antesDe) : -1;
      l.splice(i < 0 ? l.length : i, 0, clave);
      r.sub.ordenSegmentos = l; this._tocarSub(subId);
      return si(r);
    }
    /* Sus etiquetas se van; sus notas, a la papelera. */
    eliminarSub(id) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      const mias = this.notasDe(id), notas = mias.length;
      mias.forEach(n => this.tirarNota(n.id));
      this.datos.etiquetas = this.datos.etiquetas.filter(e => e.subId !== id);
      this.sacarDeGrupo(id);                                     // si estaba en un grupo, sale de él
      r.contenedor.subs = r.contenedor.subs.filter(x => x !== r.sub); this._tocar(r.contenedor);
      return si({ sub: r.sub, contenedor: r.contenedor, notas, aviso: '«' + r.sub.nombre + '» eliminado' + (notas ? ' · ' + notas + (notas === 1 ? ' nota va' : ' notas van') + ' a la papelera' : '') });
    }

    /* ---------- esquemas de pasos de un contenedor ---------- */
    esquemasDe(cid) { const c = this.contenedor(cid); return c ? c.esquemas.slice() : []; }
    esquema(eid) {
      for (const c of this.datos.contenedores) { const e = c.esquemas.find(x => x.id === eid); if (e) return { contenedor: c, esquema: e }; }
      return null;
    }
    /* Un esquema y nada más (Leo, 16-09-2026: ya no estrena una biblioteca enlazada; quien la quiera, la crea y los
       agrupa, y «Ver biblioteca» sigue saliendo por el grupo). */
    crearEsquema(cid, datos, nombre, notas) {
      const c = this.contenedor(cid); if (!c) return no('Ese contenedor ya no existe');
      const e = sanearEsquema({ datos, notas: notas && typeof notas === 'object' ? notas : {} }, this.idNuevo(), this._libre(texto(nombre, 'Esquema'), c.esquemas.map(x => x.nombre)));
      if (!e) return no('Eso no es un esquema de pasos válido');
      c.esquemas.push(e); this._tocar(c);
      return si({ contenedor: c, esquema: e, aviso: 'Esquema «' + e.nombre + '» creado en «' + c.nombre + '»' });
    }
    /* El color de la etiqueta de un esquema o de una biblioteca (uno de los 16 pares, como los personajes; null: el de
       siempre). Leo, 16-09-2026: «dejame cambiar los colores, igual que lo haces en personajes». */
    colorearHijo(id, col) {
      const r = this.esquema(id) || this.sub(id); if (!r) return no('Eso ya no existe');
      const x = r.esquema || r.sub;
      if (col === null || col === undefined || col === '') delete x.color; else x.color = color(col);
      this._tocar(r.contenedor);
      return si({ hijo: x });
    }
    renombrarEsquema(eid, nombre) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (r.contenedor.esquemas.some(x => x !== r.esquema && plano(x.nombre) === plano(n))) return no('Ya hay un esquema con ese nombre');
      r.esquema.nombre = n; this._tocar(r.contenedor);
      return si(r);
    }
    /* Soltar tras arrastrar: delante de `antesDe` (un esquema de cualquier contenedor: se va a ese
       contenedor) o al final de `cid` (o del suyo). */
    colocarEsquema(eid, antesDe, cid) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const ref = antesDe && antesDe !== eid ? this.esquema(antesDe) : null;
      if (antesDe && antesDe !== eid && !ref) return no('Ese esquema ya no existe');
      const destino = ref ? ref.contenedor : (cid ? this.contenedor(cid) : r.contenedor);
      if (!destino) return no('Ese contenedor ya no existe');
      if (destino !== r.contenedor && destino.esquemas.some(x => plano(x.nombre) === plano(r.esquema.nombre))) r.esquema.nombre = this._libre(r.esquema.nombre, destino.esquemas.map(x => x.nombre));
      r.contenedor.esquemas = r.contenedor.esquemas.filter(x => x !== r.esquema);
      const lista = destino.esquemas.filter(x => x !== r.esquema);
      lista.splice(ref ? lista.indexOf(ref.esquema) : lista.length, 0, r.esquema);
      destino.esquemas = lista; this._tocar(r.contenedor); this._tocar(destino);
      /* en un grupo: sus compañeras van con él (al final del destino) */
      if (destino !== r.contenedor) this._llevarGrupo(r.contenedor, destino, eid);
      /* y sus guiones también: viven con el esquema (Leo, 16-09-2026) */
      const gs = destino !== r.contenedor && r.contenedor.subs.find(x => x.guionEid === eid);
      if (gs) this._llevar(r.contenedor, destino, 'subs', gs, null);
      if (ref) this._enCarpeta(destino, r.esquema, ref.esquema.carpetaId); else if (cid || destino !== r.contenedor) this._enCarpeta(destino, r.esquema, null);
      return si({ contenedor: destino, esquema: r.esquema, movido: destino !== r.contenedor });
    }
    /* Agrupa dos piezas del mismo contenedor (o mete una en el grupo de la otra). */
    enlazar(aId, bId) {
      const a = this._ambitoDe(aId), b = this._ambitoDe(bId);
      if (!a || a !== b) return no('Los dos tienen que estar en el mismo sitio');
      const g = this.grupoDe(bId) || this.grupoDe(aId);
      if (g) { const r = this.aGrupo(g.grupo.id, this.grupoDe(bId) ? aId : bId); return r.ok ? si(Object.assign({ aviso: 'Va con «' + g.grupo.nombre + '»' }, r)) : r; }
      return this.crearGrupo(a, [aId, bId]);
    }
    /* Saca una pieza de su grupo (las dos se quedan donde están). */
    quitarEnlace(id) {
      const r = this.grupoDe(id); if (!r) return no('No está en ningún grupo');
      const nombre = r.grupo.nombre;
      this.sacarDeGrupo(id);
      return si({ contenedor: r.contenedor, aviso: 'Fuera de «' + nombre + '»' });
    }
    guardarEsquema(eid, datos) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      if (!datos || !Array.isArray(datos.lineas)) return no('Eso no es un esquema de pasos válido');
      if (JSON.stringify(r.esquema.datos) === JSON.stringify(datos)) return si(Object.assign({ cambio: false }, r));
      r.esquema.datos = clonar(datos); this._tocar(r.contenedor);
      return si(Object.assign({ cambio: true }, r));
    }
    /* Se lleva sus notas por nodo. */
    eliminarEsquema(eid) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const n = Object.keys(r.esquema.notas).length;
      const gs = this.bibliotecaGuiones(eid, false);            // sus guiones viven con él: se van a la papelera con él
      let gn = 0;
      if (gs) { gn = this.notasDe(gs.id).length; this.eliminarSub(gs.id); }
      r.contenedor.esquemas = r.contenedor.esquemas.filter(x => x !== r.esquema); this._tocar(r.contenedor);
      return si(Object.assign({ aviso: 'Esquema «' + r.esquema.nombre + '» eliminado' + (n ? ' con las notas de sus nodos' : '')
        + (gn ? ' · ' + gn + (gn === 1 ? ' guion va' : ' guiones van') + ' a la papelera' : '') }, r));
    }
    notaEsquema(eid, puntoId) { const r = this.esquema(eid); return (r && r.esquema.notas[puntoId]) || null; }
    guardarNotaEsquema(eid, puntoId, doc) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const n = docDe(doc); if (!n || !puntoId) return no('Eso no es un documento válido');
      const previa = r.esquema.notas[puntoId];
      if (previa && contenidoDe(previa) === contenidoDe(n)) return si({ nota: previa, cambio: false });
      n.modificado = this.ahora();
      r.esquema.notas[puntoId] = n; this._tocar(r.contenedor);
      this.sincronizarElenco(n.characters);
      return si({ nota: n, cambio: true });
    }
    fijarNotaActualEsquema(eid, puntoId) { const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe'); r.esquema.notaActual = puntoId || null; return si({}); }
    /* Quita las notas de nodos que ya no están en el esquema. */
    podarNotasEsquema(eid, vivos) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const set = new Set(vivos || []); let podadas = 0;
      Object.keys(r.esquema.notas).forEach(k => { if (!set.has(k)) { delete r.esquema.notas[k]; podadas++; } });
      if (podadas) this._tocar(r.contenedor);
      return si({ podadas });
    }

    /* ---------- etiquetas (los segmentos de un subcontenedor) ---------- */
    /* `op.seccionId`: la sección de la biblioteca donde entra (sin ella, la de partida). */
    crearEtiqueta(subId, nombre, col, op) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const guiones = !!r.sub.guionEid;                          // en la biblioteca de guiones de un esquema: cabecera negra
      const seccionId = op && op.seccionId && this.seccion(op.seccionId) && this.seccion(op.seccionId).sub.id === subId ? op.seccionId : null;
      const mias = this.etiquetasDe(subId);
      const usados = mias.map(e => e.color);
      const libre = col !== undefined && col !== null ? color(col) : (PALETA.findIndex((_, i) => !usados.includes(i)) + 1 || 1) - 1;
      const e = { id: this.idNuevo(), subId, nombre: this._libre(texto(nombre, 'Segmento'), mias.map(x => x.nombre)), color: guiones ? 0 : libre, ...(seccionId ? { seccionId } : {}) };
      this.datos.etiquetas.push(e); this._tocarSub(subId);
      return si({ etiqueta: e });
    }
    renombrarEtiqueta(id, nombre) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this.etiquetasDe(e.subId).some(x => x !== e && plano(x.nombre) === plano(n))) return no('Ya hay un segmento con ese nombre');
      e.nombre = n; this._tocarSub(e.subId);
      return si({ etiqueta: e });
    }
    colorearEtiqueta(id, col) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      e.color = color(col); this._tocarSub(e.subId); return si({ etiqueta: e });
    }
    moverEtiqueta(id, salto) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      const todas = this.datos.etiquetas, grupo = this.etiquetasDe(e.subId);
      const i = grupo.indexOf(e), j = i + (salto < 0 ? -1 : 1);
      if (j < 0 || j >= grupo.length) return no('Ya está en el extremo');
      const a = todas.indexOf(e), b = todas.indexOf(grupo[j]); todas[a] = grupo[j]; todas[b] = e;
      return si({ etiqueta: e });
    }
    /* Soltar tras arrastrar: queda antes de `antesDe` (una etiqueta del mismo sitio) o al final. */
    colocarEtiqueta(id, antesDe) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      const ref = antesDe && antesDe !== id ? this.etiqueta(antesDe) : null;
      if (ref && ref.subId !== e.subId) return no('Ese segmento es de otra biblioteca');
      const resto = this.datos.etiquetas.filter(x => x !== e);
      let idx = resto.length;
      if (ref) idx = resto.indexOf(ref);
      else { const mias = resto.filter(x => x.subId === e.subId); if (mias.length) idx = resto.indexOf(mias[mias.length - 1]) + 1; }
      resto.splice(idx, 0, e); this.datos.etiquetas = resto; this._tocarSub(e.subId);
      return si({ etiqueta: e });
    }
    /* Sus notas vuelven a la bandeja. */
    eliminarEtiqueta(id) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      let sueltas = 0;
      this.datos.notas.forEach(n => { if (n.etiquetaId === id) { n.etiquetaId = null; sueltas++; } });
      this.datos.etiquetas = this.datos.etiquetas.filter(x => x !== e); this._tocarSub(e.subId);
      return si({ etiqueta: e, sueltas, aviso: '«' + e.nombre + '» eliminado' + (sueltas ? ' · ' + sueltas + (sueltas === 1 ? ' nota vuelve' : ' notas vuelven') + ' a la bandeja' : '') });
    }

    /* ---------- notas ---------- */
    /* En la biblioteca de guiones de un esquema, la nota nueva es un documento de guion hecho a mano. */
    crearNota(subId, etiquetaId, titulo, op) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const e = etiquetaId ? this.etiqueta(etiquetaId) : null;
      if (etiquetaId && (!e || e.subId !== subId)) return no('Ese segmento no es de esta biblioteca');
      const guiones = !!r.sub.guionEid;
      const t = this.ahora();
      const n = { id: this.idNuevo(), subId, etiquetaId: etiquetaId || null,
                  titulo: this._libre(texto(titulo, 'Sin título'), this.notasDe(subId).map(x => x.titulo)), html: '', characters: {}, creado: t, modificado: t,
                  ...(guiones ? { guion: { eid: null, generado: 0 } } : {}) };
      this.datos.notas.push(n); this._tocarSub(subId);
      return si({ nota: n });
    }
    renombrarNota(id, titulo) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const t = texto(titulo, ''); if (!t) return no('El título no puede quedar vacío');
      if (t === n.titulo) return si({ nota: n });
      n.titulo = t; n.modificado = this.ahora(); this._tocarSub(n.subId);
      return si({ nota: n });
    }
    /* ---------- el guion de un esquema (Revisar guión) ---------- */
    guionEsquema(eid) {
      const r = this.esquema(eid), g = (r && r.esquema.guion) || {};
      return { fuera: (g.fuera || []).slice(), orden: (g.orden || []).slice(), plegadas: (g.plegadas || []).slice() };
    }
    _cambiarGuion(eid, fn) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const antes = JSON.stringify(this.guionEsquema(eid)), g = this.guionEsquema(eid);
      fn(g);
      const limpio = sanearGuion(g);
      if (limpio) r.esquema.guion = limpio; else delete r.esquema.guion;
      const cambio = antes !== JSON.stringify(this.guionEsquema(eid));
      if (cambio) this._tocar(r.contenedor);
      return si({ guion: this.guionEsquema(eid), cambio });
    }
    /* Sacar secciones del guion: se quedan en su sitio del documento, pero no se copian al generar. */
    sacarDelGuion(eid, lista) { return this._cambiarGuion(eid, g => { g.fuera = g.fuera.concat(claves(lista)); }); }
    devolverAlGuion(eid, lista) { const q = new Set(claves(lista)); return this._cambiarGuion(eid, g => { g.fuera = g.fuera.filter(k => !q.has(k)); }); }
    plegarSeccion(eid, clave, plegada) {
      return this._cambiarGuion(eid, g => { g.plegadas = g.plegadas.filter(k => k !== clave); if (plegada) g.plegadas.push(clave); });
    }
    /* El orden de lectura del documento generado; el esquema y la línea del tiempo no cambian. `natural`: las claves en el
       orden del tiempo. Lo nuevo entra detrás de su vecino natural. */
    ordenGuion(eid, natural) { return aplicarOrden(natural, this.guionEsquema(eid).orden); }
    ordenarGuion(eid, lista) { return this._cambiarGuion(eid, g => { g.orden = claves(lista); }); }
    /* Poda de lo que ya no es sección (nodos borrados): fuera, orden y plegadas. */
    podarGuion(eid, vivas) {
      const set = new Set(vivas || []);
      return this._cambiarGuion(eid, g => { ['fuera', 'orden', 'plegadas'].forEach(k => { g[k] = g[k].filter(x => set.has(x)); }); });
    }

    /* ---------- guiones generados: viven en la biblioteca oculta del esquema (Leo, 16-09-2026) ---------- */
    guionesDe(eid) { const s = this.bibliotecaGuiones(eid, false); return s ? this.datos.notas.filter(n => n.subId === s.id) : []; }
    /* ---------- versiones de un documento (Leo, 16-09-2026) ----------
       Un esquema tiene **un documento**, y dentro suyo las versiones con nombre que se vayan guardando: así se tienen
       varios guiones del mismo esquema sin llenar el árbol de notas. */
    versionesDe(id) { const n = this.nota(id); return n && n.versiones ? n.versiones.slice() : []; }
    version(id, vid) { const n = this.nota(id); return (n && (n.versiones || []).find(v => v.id === vid)) || null; }
    /* Guarda lo que hay ahora en el documento como una versión con ese nombre. */
    guardarVersion(id, nombre) {
      const n = this.nota(id); if (!n) return no('Ese documento ya no existe');
      const lista = n.versiones || (n.versiones = []);
      const nom = this._libre(texto(nombre, 'v' + (lista.length + 1)), lista.map(v => v.nombre));
      const v = { id: this.idNuevo(), nombre: nom, guardada: this.ahora(), html: n.html, characters: clonar(n.characters || {}) };
      lista.push(v); this._tocarSub(n.subId);
      return si({ version: v, nota: n, aviso: 'Versión «' + nom + '» guardada' });
    }
    /* Pone una versión guardada en el documento (lo de ahora se pierde si no se guardó antes). */
    cargarVersion(id, vid) {
      const n = this.nota(id), v = this.version(id, vid); if (!n || !v) return no('Esa versión ya no existe');
      n.html = v.html; n.characters = clonar(v.characters || {}); n.modificado = this.ahora();
      this._tocarSub(n.subId);
      return si({ nota: n, version: v, aviso: 'Versión «' + v.nombre + '»' });
    }
    renombrarVersion(id, vid, nombre) {
      const n = this.nota(id), v = this.version(id, vid); if (!n || !v) return no('Esa versión ya no existe');
      const nom = texto(nombre, ''); if (!nom) return no('El nombre no puede quedar vacío');
      v.nombre = this._libre(nom, n.versiones.filter(x => x !== v).map(x => x.nombre));
      this._tocarSub(n.subId);
      return si({ version: v });
    }
    eliminarVersion(id, vid) {
      const n = this.nota(id), v = this.version(id, vid); if (!n || !v) return no('Esa versión ya no existe');
      n.versiones = n.versiones.filter(x => x !== v);
      if (!n.versiones.length) delete n.versiones;
      this._tocarSub(n.subId);
      return si({ aviso: 'Versión «' + v.nombre + '» eliminada' });
    }

    /* **El documento del esquema** (Leo, 16-09-2026: «en el esquema pon un botón general para abrir el documento»):
       la primera nota de su biblioteca de guiones marcada como principal. Los demás documentos de esa biblioteca (los
       que genera Exportar y los que se crean a mano) son notas normales y se abren igual. */
    documentoEsquema(eid) {
      const s = this.bibliotecaGuiones(eid, false); if (!s) return null;
      return this.datos.notas.find(n => n.subId === s.id && n.guion && n.guion.principal) || null;
    }
    crearDocumentoEsquema(eid, titulo, doc) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const hay = this.documentoEsquema(eid); if (hay) return si({ nota: hay, cambio: false });
      const x = this.crearGuion(eid, titulo || r.esquema.nombre, doc);
      if (!x.ok) return x;
      x.nota.guion.principal = true;
      return si({ nota: x.nota, cambio: true, aviso: '' });
    }
    crearGuion(eid, titulo, doc) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const s = this.bibliotecaGuiones(eid);
      const t = this.ahora();
      /* el primero es **el documento del esquema** (`principal`); los demás, documentos sueltos que al abrir el archivo
         pasan a ser versiones suyas (Leo, 16-09-2026) */
      const hay = this.datos.notas.some(x => x.subId === s.id && x.guion && x.guion.principal);
      const n = { id: this.idNuevo(), subId: s.id, etiquetaId: null, titulo: this._libre(texto(titulo, 'Guion'), this.notasDe(s.id).map(x => x.titulo)),
                  html: doc && typeof doc.html === 'string' ? doc.html : '', characters: doc && doc.characters ? clonar(doc.characters) : {},
                  creado: t, modificado: t, guion: { eid, generado: t, ...(hay ? {} : { principal: true }) } };
      this.datos.notas.push(n); this._tocarSub(s.id);
      this.sincronizarElenco(n.characters);
      return si({ nota: n, aviso: '«' + n.titulo + '» generado en los guiones de «' + r.esquema.nombre + '»' });
    }
    /* El color de una nota: un tono de TONOS, o null (sin color). No cambia su fecha: no es contenido. */
    colorearNota(id, tono) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      if (tono && !TONOS.includes(tono)) return no('Ese color no es de la paleta');
      if ((n.color || null) === (tono || null)) return si({ nota: n, cambio: false });
      if (tono) n.color = tono; else delete n.color;
      this._tocarSub(n.subId);
      return si({ nota: n, cambio: true });
    }
    /* Cambia de etiqueta (null = bandeja) y, si se pide, de subcontenedor; con `antesDe` (una nota del
       mismo sitio) queda delante de ella, si no al final: así se ordenan a mano. */
    moverNota(id, etiquetaId, subId, antesDe) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const destino = subId || n.subId;
      if (!this.sub(destino)) return no('Esa biblioteca ya no existe');
      const e = etiquetaId ? this.etiqueta(etiquetaId) : null;
      if (etiquetaId && (!e || e.subId !== destino)) return no('Ese segmento no es de esa biblioteca');
      /* los guiones viven con su esquema: se mueven entre los segmentos de esa biblioteca, y nada más entra ahí */
      if (this.esGuiones(n.subId) && destino !== n.subId) return no('Un guion vive con su esquema: no se mueve a una biblioteca');
      if (this.esGuiones(destino) && !this.esGuiones(n.subId)) return no('Ahí solo van los guiones de ese esquema');
      n.subId = destino; n.etiquetaId = etiquetaId || null;
      const resto = this.datos.notas.filter(x => x !== n);
      const ref = antesDe && antesDe !== id ? resto.find(x => x.id === antesDe && x.subId === destino && x.etiquetaId === n.etiquetaId) : null;
      resto.splice(ref ? resto.indexOf(ref) : resto.length, 0, n); this.datos.notas = resto;
      this._tocarSub(destino);
      return si({ nota: n });
    }
    /* ---------- papelera ---------- */
    tirarNota(id) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const r = this.sub(n.subId);
      this.datos.notas = this.datos.notas.filter(x => x !== n);
      n.etiquetaId = null;
      this.datos.papelera.push({ nota: n, origenId: n.subId, origenNombre: r ? r.contenedor.nombre + ' › ' + r.sub.nombre : '', eliminadoEn: this.ahora() });
      if (r) this._tocarSub(n.subId);
      return si({ nota: n, aviso: '«' + n.titulo + '» va a la papelera' });
    }
    /* Vuelve a su subcontenedor de origen (o al que se indique, o al primero que haya), a la bandeja.
       `subId` puede ser también un contenedor: va a su primer subcontenedor. */
    restaurarNota(id, subId) {
      const x = this.enPapelera(id); if (!x) return no('Esa nota no está en la papelera');
      const c = subId && this.contenedor(subId);
      let destino = (subId && this.sub(subId)) || (c && c.subs[0] && this.sub(c.subs[0].id)) || this.sub(x.origenId) || null;
      if (!destino) { const cc = this.datos.contenedores.find(y => !y.oculto && y.subs.length); destino = cc ? this.sub(cc.subs[0].id) : null; }
      if (!destino) return no('No hay ninguna biblioteca donde restaurarla');
      this.datos.papelera = this.datos.papelera.filter(y => y !== x);
      x.nota.subId = destino.sub.id; x.nota.etiquetaId = null; x.nota.modificado = this.ahora();
      this.datos.notas.push(x.nota); this._tocarSub(destino.sub.id);
      return si({ nota: x.nota, sub: destino.sub, contenedor: destino.contenedor, aviso: '«' + x.nota.titulo + '» vuelve a «' + destino.contenedor.nombre + ' › ' + destino.sub.nombre + '»' });
    }
    eliminarDefinitivo(id) {
      const x = this.enPapelera(id); if (!x) return no('Esa nota no está en la papelera');
      this.datos.papelera = this.datos.papelera.filter(y => y !== x);
      return si({ nota: x.nota, aviso: '«' + x.nota.titulo + '» eliminada del todo' });
    }
    vaciarPapelera() { const n = this.datos.papelera.length; this.datos.papelera = []; return si({ eliminadas: n, aviso: n ? 'Papelera vaciada · ' + n + (n === 1 ? ' nota' : ' notas') : 'La papelera ya estaba vacía' }); }
    /* Tira las notas que lleven más de `dias` en la papelera. Se llama una vez al arrancar. */
    purgarPapelera(dias) {
      const limite = this.ahora() - (dias || DIAS_PAPELERA) * 864e5;
      const antes = this.datos.papelera.length;
      this.datos.papelera = this.datos.papelera.filter(x => x.eliminadoEn >= limite);
      return si({ purgadas: antes - this.datos.papelera.length });
    }
    eliminarNota(id) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      this.datos.notas = this.datos.notas.filter(x => x !== n); this._tocarSub(n.subId);
      return si({ nota: n, aviso: '«' + n.titulo + '» eliminada' });
    }
    /* Lo que devuelve Ed.document.get(): { title, html, characters }. Solo cuenta si cambió. */
    guardarNota(id, doc) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      if (!doc || typeof doc.html !== 'string') return no('Eso no es un documento válido');
      const titulo = texto(doc.title, n.titulo), characters = doc.characters && typeof doc.characters === 'object' ? doc.characters : {};
      const cambio = titulo !== n.titulo || doc.html !== n.html || JSON.stringify(characters) !== JSON.stringify(n.characters);
      if (!cambio) return si({ nota: n, cambio: false });
      n.titulo = titulo; n.html = doc.html; n.characters = clonar(characters); n.modificado = this.ahora();
      this._tocarSub(n.subId);
      this.sincronizarElenco(n.characters);
      return si({ nota: n, cambio: true });
    }

    /* ---------- elenco: los personajes del guion ---------- */
    elenco() { return this.datos.elenco.slice(); }
    personaje(id) { return this.datos.elenco.find(p => p.id === id) || null; }
    /* Cada documento con texto del guion: las notas de las bibliotecas (y de la papelera) y las de los nodos. */
    _documentosTexto(conPapelera) {
      const lista = [];
      this.datos.notas.forEach(n => lista.push({ doc: n, tipo: 'nota', id: n.id, titulo: n.titulo, modificado: n.modificado || null, ruta: () => { const r = this.sub(n.subId); return r ? r.contenedor.nombre + ' › ' + r.sub.nombre : ''; } }));
      if (conPapelera) this.datos.papelera.forEach(x => lista.push({ doc: x.nota, tipo: 'papelera', id: x.nota.id }));
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => Object.keys(e.notas).forEach(pid => {
        const n = e.notas[pid], p = (e.datos.puntos || []).find(q => q.id === pid);
        lista.push({ doc: n, tipo: 'nodo', eid: e.id, id: pid, titulo: (p && p.titulo) || n.title || 'Sin título', modificado: n.modificado || null, ruta: () => c.nombre + ' › ' + e.nombre });
      })));
      return lista;
    }
    crearPersonaje(nombre, col) {
      const n = sinSufijo(nombre), k = clavePersonaje(n);
      if (!k) return no('Escribe un nombre para el personaje');
      if (this.datos.elenco.some(p => clavePersonaje(p.nombre) === k)) return no('Ya hay un personaje llamado «' + n + '»');
      const usados = this.datos.elenco.map(p => p.color);
      const libre = col !== undefined && col !== null ? color(col) : Math.max(0, PALETA.findIndex((_, i) => !usados.includes(i)));
      const p = { id: this.idNuevo(), nombre: n, color: libre };
      this.datos.elenco.push(p);
      return si({ personaje: p });
    }
    /* Añade al elenco los personajes de un registro de notas (`characters` del editor) que aún no estén. */
    sincronizarElenco(characters) {
      const nuevos = [];
      Object.values(characters || {}).forEach(r => {
        const k = r && clavePersonaje(r.name); if (!k || this.datos.elenco.some(p => clavePersonaje(p.nombre) === k)) return;
        const p = { id: this.idNuevo(), nombre: sinSufijo(r.name), color: color(r.color), auto: true };   // `auto`: vino de una nota
        this.datos.elenco.push(p); nuevos.push(p);
      });
      this.podarElenco();
      return si({ nuevos });
    }
    /* Los personajes que llegaron solos desde una nota y ya no nombra ninguna (una errata corregida, un
       nombre borrado) salen del elenco, salvo que tengan carril en Personajes o notas en su biblioteca. Los
       creados en Personajes se quedan siempre. */
    podarElenco() {
      const b = this.contenedor(ID_PERSONAJES);
      /* cuenta como carril el que tiene en cualquier esquema de personaje */
      const conCarril = new Set();
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => { if (l.personaje) conCarril.add(l.personaje); })));
      const fuera = this.datos.elenco.filter(p => p.auto && !conCarril.has(p.id)
        && !(b && b.subs.some(s => s.lineaId === p.id && this.notasDe(s.id).length))
        && !this.menciones(p.id).length);
      if (fuera.length) this.datos.elenco = this.datos.elenco.filter(p => !fuera.includes(p));
      return si({ podados: fuera.length });
    }
    /* Los esquemas donde el personaje tiene carril, en el orden del árbol (Leo, 16-09-2026: la sección «Apariciones»
       de su biblioteca lleva también «Esquemas relacionados», que solo lista y lleva al esquema; desde ahí no se
       añaden). `principal` marca el esquema de personaje que nació con él (su primer carril). */
    esquemasDePersonaje(id) {
      const pid = String(id || ''); if (!pid) return [];
      const res = [];
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => {
        const lineas = e.datos.lineas || [];
        const i = lineas.findIndex(l => l.personaje === pid); if (i < 0) return;
        res.push({ eid: e.id, nombre: e.nombre, contenedorId: c.id, contenedor: c.nombre,
                   personaje: c.id === ID_ESQUEMAS, principal: c.id === ID_ESQUEMAS && i === 0,
                   carriles: lineas.filter(l => l.personaje === pid).length });
      }));
      /* delante el suyo, después los demás esquemas de personaje y al final los normales; dentro, el orden del árbol */
      const peso = x => (x.principal ? 0 : x.personaje ? 1 : 2);
      return res.map((x, i) => [x, i]).sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1]).map(p => p[0]);
    }
    /* Las notas (sin la papelera) donde aparece con «/», con su ruta. */
    menciones(id) {
      const p = this.personaje(id); if (!p) return [];
      const k = clavePersonaje(p.nombre);
      return this._documentosTexto(false).filter(x => mencionaEn(x.doc.html, k))
        .map(x => ({ tipo: x.tipo, id: x.id, eid: x.eid || null, titulo: x.titulo, modificado: x.modificado, ruta: x.ruta() }));
    }
    renombrarPersonaje(id, nombre) {
      const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
      const n = sinSufijo(nombre), k = clavePersonaje(n), antes = clavePersonaje(p.nombre);
      if (!k) return no('El nombre no puede quedar vacío');
      if (this.datos.elenco.some(x => x !== p && clavePersonaje(x.nombre) === k)) return no('Ya hay un personaje llamado «' + n + '»');
      let notas = 0;
      this._documentosTexto(true).forEach(x => {
        const d = x.doc, html = renombrarEn(d.html, antes, n), reg = d.characters || {};
        const tenia = Object.keys(reg).find(c => clavePersonaje(reg[c].name) === antes);
        if (html === d.html && !tenia) return;
        d.html = html; notas++;
        if (tenia) { const r = reg[tenia]; delete reg[tenia]; reg[k] = { name: n, color: r.color }; }
      });
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => { if (l.personaje === id) l.nombre = n; })));
      const b = this.contenedor(ID_PERSONAJES), s = b && b.subs.find(x => x.lineaId === id); if (s) s.nombre = n;
      p.nombre = n; delete p.auto;                               // tocado a mano: ya no se poda solo
      return si({ personaje: p, notas });
    }
    colorearPersonaje(id, col) {
      const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
      p.color = color(col); delete p.auto;
      const k = clavePersonaje(p.nombre);
      this._documentosTexto(true).forEach(x => Object.values(x.doc.characters || {}).forEach(r => { if (clavePersonaje(r.name) === k) r.color = p.color; }));
      return si({ personaje: p });
    }
    /* No se elimina si alguna nota lo nombra. Sus carriles en los esquemas quedan sin personaje y su
       biblioteca, con sus notas, va a la papelera. */
    eliminarPersonaje(id) {
      const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
      const m = this.menciones(id);
      if (m.length) return no('«' + p.nombre + '» aparece en ' + m.length + (m.length === 1 ? ' nota' : ' notas') + ': quítalo de ellas antes de eliminarlo');
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => { if (l.personaje === id) { delete l.personaje; l.nombre = 'Sin personaje'; } })));
      const b = this.contenedor(ID_PERSONAJES), s = b && b.subs.find(x => x.lineaId === id); if (s) this.eliminarSub(s.id);
      this.datos.elenco = this.datos.elenco.filter(x => x !== p);
      return si({ personaje: p, aviso: '«' + p.nombre + '» eliminado' });
    }
  }

  Object.assign(C, { Documentos, ID_PERSONAJES, ID_ESQUEMAS_PERSONAJE: ID_ESQUEMAS, COLORES_CARPETA, HOJA_PERSONAJE, TONOS_NOTA: TONOS, ELENCO_CARPETAS: ELENCO, clavePersonaje, normalizarDocumentos: normalizar, PALETA_ETIQUETAS: PALETA, ORDENES_DOCUMENTOS: ORDENES, NOMBRE_GLOBAL, NOMBRE_SUB, DIAS_PAPELERA });
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
