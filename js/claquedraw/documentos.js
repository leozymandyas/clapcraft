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
   **Plantillas** (1.1.56, de ClapBook): un tercer contenedor oculto, `plantillas` (`especial: 'plantillas'`), con una sola
   biblioteca, `plantillas:biblioteca`, que nace la primera vez que hace falta (`asegurarPlantillas`). Sus notas son las
   plantillas de nota: se copian a ella (`guardarComoPlantilla`) y de ellas salen notas nuevas con sus variables rellenas
   (`crearDesdePlantilla`, plantillas.js). No cuentan como notas del proyecto (ni para el elenco ni para las menciones) y su
   contenedor y su biblioteca no se renombran, mueven, colorean, duplican, agrupan, meten en carpetas ni tiran.
   **Fórmulas** (1.1.60): la misma idea para los prompts reutilizables del lienzo: el contenedor oculto `formulas` (`especial:
   'formulas'`) con `formulas:biblioteca` (`asegurarFormulas`); sus notas son texto plano (`textoFormula`, `guardarComoFormula`) y
   una operación del lienzo las elige (`resolverFormulas`, `instruccionCompuesta`; su texto cuenta en la firma). Lo común a las dos
   especiales va por `ESPECIALES`.
   **Lienzos de nodos** (1.1.58, como los «Space» de Dreamina): una tercera clase de pieza del árbol, `contenedor.lienzos`
   (la clave solo existe si hay alguno), con nombre, color de etiqueta, carpeta, grupo, orden, papelera y duplicar como un
   esquema. Dentro, nodos y cables (js/claquedraw/lienzo-modelo.js, `C.Lienzo`); aquí se guardan (`guardarLienzo`) y se
   resuelve lo que apunta cada entrada (`resolverNodo`: la nota, el segmento, la biblioteca, el esquema o el personaje, o
   `{ roto: true }`; borrar lo apuntado no toca la entrada). No van en los contenedores ocultos.
   No hay nada especial: cualquier contenedor, esquema o subcontenedor se renombra, se ordena y se
   elimina. `migrado` recuerda que el esquema del proyecto (que vivía en el guion) ya pasó aquí.
   Una nota vive en un subcontenedor y lleva como mucho una etiqueta suya; sin etiqueta está en la
   bandeja. El orden de todo es el manual. La papelera guarda las notas tiradas con su origen (el
   subcontenedor), su segmento, la nota que la seguía y la fecha; se vacía a mano o sola a los 30 días (`purgarPapelera`).
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
  /* **Las bibliotecas especiales**: un contenedor oculto con una sola biblioteca, de ids fijos (como en ClapBook), fuera del
     árbol. Las plantillas de nota (1.1.56) y las **fórmulas** (1.1.60: prompts reutilizables de texto plano para las operaciones
     de IA del lienzo, js/claquedraw/formulas.js). Lo que vale para una vale para las dos: no se renombran, mueven, colorean,
     duplican, agrupan, meten en carpetas ni tiran (sus notas sí), no cuentan para el elenco ni las menciones, no salen en el
     árbol ni en Recientes. `las`: cómo se nombran en un aviso. */
  const ESPECIALES = {
    plantillas: { clase: 'plantillas', id: 'plantillas', bib: 'plantillas:biblioteca', nombre: 'Plantillas', las: 'las plantillas' },
    formulas: { clase: 'formulas', id: 'formulas', bib: 'formulas:biblioteca', nombre: 'Fórmulas', las: 'las fórmulas' }
  };
  const CLASES_ESPECIALES = Object.keys(ESPECIALES);
  const ID_PLANTILLAS = ESPECIALES.plantillas.id, ID_BIB_PLANTILLAS = ESPECIALES.plantillas.bib, NOMBRE_PLANTILLAS = ESPECIALES.plantillas.nombre;
  const ID_FORMULAS = ESPECIALES.formulas.id, ID_BIB_FORMULAS = ESPECIALES.formulas.bib, NOMBRE_FORMULAS = ESPECIALES.formulas.nombre;
  /* la clase ('plantillas' | 'formulas') del contenedor o de la biblioteca especial de esa id, o null */
  const especialDe = id => CLASES_ESPECIALES.find(k => ESPECIALES[k].id === id || ESPECIALES[k].bib === id) || null;
  /* la clase de la biblioteca especial de esa id (solo bibliotecas), o null */
  const especialDeBib = subId => CLASES_ESPECIALES.find(k => ESPECIALES[k].bib === subId) || null;
  const esDeEspecial = id => !!especialDe(id);
  const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);
  /* el aviso de lo que no se hace con una especial: de la primera id que lo sea (si ninguna, las plantillas, como antes) */
  const claseDe = ids => ids.map(x => especialDe(x == null ? '' : String(x))).find(Boolean) || 'plantillas';
  const noEspecial = (que, ...ids) => ({ ok: false, aviso: 'La biblioteca de ' + ESPECIALES[claseDe(ids)].las + ' no se ' + que });
  /* el contenedor de una especial, recién hecho (con las claves en el orden de `normalizar`) */
  const contenedorEspecial = (k, t) => ({ id: ESPECIALES[k].id, nombre: ESPECIALES[k].nombre, fijado: false, plegado: false, creado: t, modificado: t, carpetas: [], esquemas: [],
    subs: [{ id: ESPECIALES[k].bib, nombre: ESPECIALES[k].nombre, creado: t, modificado: t }], oculto: true, especial: k });
  /* el texto plano de las fórmulas (js/claquedraw/formulas.js: en la página va detrás de este archivo; en Node se pide aquí) */
  const Fm = () => C.formulas || (typeof require === 'function' ? require('./formulas.js').formulas : null);
  const Tm = () => C.teatroMods || (typeof require === 'function' ? (() => { try { return require('./teatro-mods.js').teatroMods; } catch (_) { return null; } })() : null);
  const Me = () => C.memoria || (typeof require === 'function' ? (() => { try { return require('./memoria.js').memoria; } catch (_) { return null; } })() : null);
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
  /* Las dos letras de la etiqueta de un personaje (1.1.40, Leo: «en lugar de la letra P, las primeras dos letras del nombre, la
     segunda en minúscula —"Lestat" es "Le"—, pero con más de un nombre las dos iniciales en mayúscula —"Pez Gota" es "PG"»). */
  const iniciales = nombre => {
    const t = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (!t) return '·';
    const partes = t.split(' ');
    if (partes.length > 1) return (partes[0][0] + partes[1][0]).toUpperCase();
    return t[0].toUpperCase() + (t[1] || '').toLowerCase();
  };
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
  /* el nombre de lo que hay en la papelera: una nota, un esquema, una biblioteca o un personaje */
  const nombreEnPapelera = x => (x.nota ? x.nota.titulo : x.tipo === 'esquema' ? x.esquema.nombre : x.tipo === 'personaje' ? x.personaje.nombre : x.tipo === 'lienzo' ? x.lienzo.nombre : x.sub.nombre);
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});
  const plano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const sinSeparadores = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
  /* **Fragmentos** (1.1.57, Leo: «a partir de un guion o esquema terminado con ayuda de la IA dividir el guion en fragmentos más
     pequeños que vivan en notas de segmentos… con tiempos y todo, para que IAs como Seedance puedan generar mis guiones»): una nota
     de biblioteca puede decir de qué tramo de un esquema sale, `nota.fragmento = { eid, nodos: [puntoId…], segundos?, orden?,
     bloques?: [desde, hasta] }` —el esquema, sus nodos en el orden del tiempo, la duración estimada en segundos (con un decimal), su
     puesto en la serie (desde 1) y, si salió del guion, sus bloques del documento (los de leer_documento, desde 1)—. Solo es una
     marca: borrar el esquema o sus nodos no la toca (se queda **huérfana** y se dice: `estadoFragmento`). */
  function fragmentoDe(f) {
    if (!f || typeof f !== 'object' || typeof f.eid !== 'string' || !f.eid) return null;
    const x = { eid: f.eid, nodos: claves(f.nodos) };
    const s = Math.round((+f.segundos || 0) * 10) / 10; if (s > 0) x.segundos = s;
    const o = Math.round(+f.orden || 0); if (o >= 1) x.orden = o;
    const b = Array.isArray(f.bloques) ? f.bloques.map(v => Math.round(+v)).filter(v => v >= 1) : [];
    if (b.length) x.bloques = [Math.min(...b.slice(0, 2)), Math.max(...b.slice(0, 2))];
    return x;
  }
  const guionDe = g => g && typeof g === 'object'
    ? { guion: { eid: g.eid ? String(g.eid) : null, generado: +g.generado || 0, ...(g.principal ? { principal: true } : {}) } } : {};

  /* Un esquema de un contenedor: un tablero (basta con que traiga `lineas`) y las notas de sus nodos. */
  function sanearEsquema(e, id, nombre) {
    if (!e || typeof e !== 'object' || !e.datos || typeof e.datos !== 'object' || !Array.isArray(e.datos.lineas)) return null;
    const notas = {};
    if (e.notas && typeof e.notas === 'object') Object.keys(e.notas).forEach(k => { const n = docDe(e.notas[k]); if (n) notas[k] = n; });
    return { id, nombre: texto(nombre, 'Esquema'), datos: clonar(e.datos), notas, notaActual: typeof e.notaActual === 'string' ? e.notaActual : null,
             ...(typeof e.subId === 'string' && e.subId ? { subId: e.subId } : {}),   // forma antigua: `agruparEnlaces` lo convierte en grupo y lo borra
             ...(sanearGuion(e.guion) ? { guion: sanearGuion(e.guion) } : {}),
             ...(claves(e.bibliotecas).length ? { bibliotecas: claves(e.bibliotecas) } : {}) };   // sus conexiones (1.1.57): se podan al final de `normalizar`
  }

  /* **Un lienzo de nodos** (1.1.58): sus nodos y cables los sanea el modelo del lienzo (js/claquedraw/lienzo-modelo.js, que en la
     página se carga detrás de este archivo y en Node se pide aquí). La carpeta la pone quien lo llama. */
  const Lz = () => C.Lienzo || (typeof require === 'function' ? require('./lienzo-modelo.js').Lienzo : null);
  /* ---------- firmas del contenido de lo que apunta una entrada de un lienzo (`firmaEntrada`) ---------- */
  const huella = x => { const L = Lz(); return L && L.huellaDe ? L.huellaDe(x) : JSON.stringify(x); };
  const huellaTexto = html => huella(String(html || ''));
  /* lo que se lee de un esquema, sin su maquetación (anchos, altos, tramas ocultas, colores) ni el orden de sus claves; un
     tablero guardado en la forma de antes (nodos por acto y celda) pasa antes por el modelo de Tramas, que le da columnas */
  function contenidoEsquema(datos) {
    let x = datos || {};
    const raiz = typeof window !== 'undefined' ? window : globalThis, Tm = raiz.Tramas;
    if (Tm && Tm.Modelo && (!Array.isArray(x.puntos) || x.puntos.some(p => p && p.col === undefined))) { try { x = new Tm.Modelo(clonar(x)).datos; } catch (_) {} }
    const lista = v => (Array.isArray(v) ? v.filter(Boolean) : []), porId = (a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
    const txt = v => String(v ?? '');
    return {
      tramas: lista(x.lineas).map(l => [l.id, txt(l.nombre), l.tipo || null, !!l.cortada]),
      actos: lista(x.actos).map(a => [a.id, txt(a.nombre), +a.desde || 0, +a.celdas || 0]).sort((a, b) => a[2] - b[2]),
      nodos: lista(x.puntos).map(p => [p.id, txt(p.titulo), txt(p.descripcion ?? p.nota), +p.col || 0, p.lineaId || null, !!p.cortado]).sort(porId),
      saltos: lista(x.saltos).map(q => [q.id, q.deId, q.aId, q.tipo || null]).sort(porId),
      notas: lista(x.notas).map(q => [q.id, txt(q.texto), q.deId || null, q.aId || null, !!q.abierta, q.abierta ? q.lineaId || null : null, q.abierta ? +q.col || 0 : null]).sort(porId)
    };
  }
  /* «su biblioteca «X»» / «el esquema «X»» / «el personaje «X»»: lo que se llevó una nota a la papelera */
  const nombrePieza = x => (x.tipo === 'esquema' ? 'el esquema «' + x.esquema.nombre + '»' : x.tipo === 'personaje' ? 'el personaje «' + x.personaje.nombre + '»'
    : x.tipo === 'sub' ? 'su biblioteca «' + x.sub.nombre + '»' : '«' + nombreEnPapelera(x) + '»');

  function sanearLienzo(l, id, nombre) {
    if (!l || typeof l !== 'object') return null;
    const L = Lz(), x = L ? L.sanear(l) : { nodos: Array.isArray(l.nodos) ? clonar(l.nodos) : [], cables: Array.isArray(l.cables) ? clonar(l.cables) : [] };
    const creado = +l.creado || 0;
    return Object.assign({ id, nombre: texto(nombre, 'Lienzo'), creado, modificado: +l.modificado || creado }, tono(l),
      { nodos: x.nodos, cables: x.cables }, x.vista ? { vista: x.vista } : {});
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
      const lienzos = [];                                      // los lienzos de nodos (1.1.58): la clave solo existe si hay alguno
      (Array.isArray(c.lienzos) ? c.lienzos : []).forEach(l => {
        const lid = l && String(l.id || ''); if (!lid || ids.has(lid)) return;
        const x = sanearLienzo(l, lid, l.nombre); if (!x) return;
        ids.add(lid); lienzos.push(Object.assign(x, enCarpeta(l)));
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
      const dentro = new Set([...esquemas.map(e => e.id), ...subs.filter(x => !x.guionEid).map(x => x.id), ...lienzos.map(l => l.id)]);
      const grupos = sanearGrupos(c.grupos, dentro, carpetas.map(k => k.id), ids);
      /* el de una especial (las plantillas, las fórmulas): siempre oculto, y con su biblioteca (un archivo que la haya perdido la
         recupera, vacía); `especial` solo vale en el contenedor de su id */
      const especial = ESPECIALES[c.especial] && ESPECIALES[c.especial].id === id ? c.especial : null, E = especial && ESPECIALES[especial];
      if (E && !subs.some(x => x.id === E.bib) && !ids.has(E.bib)) {
        ids.add(E.bib); subDe.set(E.bib, id);
        subs.unshift({ id: E.bib, nombre: E.nombre, creado, modificado: creado });
      }
      d.contenedores.push({ id, nombre: texto(c.nombre, 'Contenedor'), fijado: !!c.fijado, plegado: !!c.plegado, creado, modificado: +c.modificado || creado, carpetas, esquemas, subs,
                            ...(lienzos.length ? { lienzos } : {}), ...(grupos.length ? { grupos } : {}), ...(ordenArbol.length ? { ordenArbol } : {}), ...(c.oculto || especial ? { oculto: true } : {}),
                            ...(especial ? { especial } : {}) });
    });
    /* notas de una especial sin su contenedor (no debería pasar): se rehace, para no perderlas */
    CLASES_ESPECIALES.forEach(k => {
      const E = ESPECIALES[k];
      if (d.contenedores.some(c => c.especial === k) || ids.has(E.id) || ids.has(E.bib)) return;
      if (!(Array.isArray(src.notas) ? src.notas : []).some(n => n && n.subId === E.bib)) return;
      ids.add(E.id); ids.add(E.bib); subDe.set(E.bib, E.id);
      d.contenedores.push(contenedorEspecial(k, 0));
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
      ...(TONOS.includes(n.color) ? { color: n.color } : {}), ...guionDe(n.guion), ...versionesDe(n.versiones, ids),
      ...(fragmentoDe(n.fragmento) ? { fragmento: fragmentoDe(n.fragmento) } : {}) });
    (Array.isArray(src.notas) ? src.notas : []).forEach(n => {
      const id = n && String(n.id || ''); if (!id || ids.has(id)) return;
      const subId = subPara(n); if (!subId) return; ids.add(id);
      const x = nota(n, +n.creado || 0, subId);
      const e = n.etiquetaId ? etqs.get(String(n.etiquetaId)) : null;
      if (e && e.subId === subId) x.etiquetaId = e.id;          // su segmento tiene que ser de su misma biblioteca
      d.notas.push(x);
    });
    /* Las piezas tiradas enteras (Leo, 18-09-2026: «que las bibliotecas y esquemas, también de los personajes, se vayan a la
       papelera y puedan restaurarse»): un esquema con su documento, una biblioteca o un personaje con la suya, con todo lo
       suyo (segmentos, notas y versiones), de dónde venían (contenedor, carpeta y grupo) y cuándo se tiraron. */
    const bib = (b, sid) => {
      const etiquetas = (Array.isArray(b.etiquetas) ? b.etiquetas : []).filter(e => e && e.id).map(e => Object.assign(clonar(e), { id: String(e.id), subId: sid }));
      const etqIds = new Set(etiquetas.map(e => e.id));
      const notas = (Array.isArray(b.notas) ? b.notas : []).filter(n => n && n.id).map(n => Object.assign(nota(n, +n.creado || 0, sid), n.etiquetaId && etqIds.has(String(n.etiquetaId)) ? { etiquetaId: String(n.etiquetaId) } : {}));
      return { etiquetas, notas };
    };
    const pieza = x => {
      const base = { tipo: x.tipo, origenId: String(x.origenId || ''), origenNombre: texto(x.origenNombre, ''), eliminadoEn: +x.eliminadoEn || 0,
                     ...(x.carpetaId ? { carpetaId: String(x.carpetaId) } : {}), ...(x.grupoId ? { grupoId: String(x.grupoId) } : {}) };
      const conBib = (o, b) => { const sid = b && b.sub && String(b.sub.id || ''); if (!sid) return null; return Object.assign(o, { sub: Object.assign(clonar(b.sub), { id: sid }) }, bib(b, sid)); };
      if (x.tipo === 'esquema') {
        const eid = x.esquema && String(x.esquema.id || ''); if (!eid || ids.has(eid)) return null;
        const e = sanearEsquema(x.esquema, eid, x.esquema.nombre); if (!e) return null;
        ids.add(eid);
        const g = x.guiones && conBib({}, x.guiones);
        return Object.assign(base, { esquema: Object.assign(e, tono(x.esquema)) }, g ? { guiones: g } : {});
      }
      if (x.tipo === 'sub') { const sid = x.sub && String(x.sub.id || ''); if (!sid || ids.has(sid)) return null; ids.add(sid); return conBib(base, x); }
      if (x.tipo === 'lienzo') {                               // un lienzo de nodos (1.1.58), sin su carpeta (va en la pieza)
        const lid = x.lienzo && String(x.lienzo.id || ''); if (!lid || ids.has(lid)) return null;
        const l = sanearLienzo(x.lienzo, lid, x.lienzo.nombre); if (!l) return null;
        ids.add(lid); return Object.assign(base, { lienzo: l });
      }
      if (x.tipo === 'personaje') {
        const pj = x.personaje, pid = pj && String(pj.id || ''); if (!pid || ids.has(pid)) return null; ids.add(pid);
        Object.assign(base, { personaje: { id: pid, nombre: texto(pj.nombre, 'Personaje'), color: color(pj.color), ...(pj.carpetaId ? { carpetaId: String(pj.carpetaId) } : {}) },
          carriles: (Array.isArray(x.carriles) ? x.carriles : []).filter(c => c && c.eid && c.lineaId).map(c => ({ eid: String(c.eid), lineaId: String(c.lineaId) })) });
        return (x.sub && conBib(base, x)) || base;
      }
      return null;
    };
    (Array.isArray(src.papelera) ? src.papelera : []).forEach(x => {
      if (x && x.tipo && x.tipo !== 'nota') { const p = pieza(x); if (p) d.papelera.push(p); return; }
      const n = x && x.nota; const id = n && String(n.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      /* con su segmento y su sitio de antes (`etiquetaId`, `antesDe`, `despuesDe`: al restaurarla vuelve ahí), solo si los trae */
      d.papelera.push(Object.assign({ nota: nota(n, +n.creado || 0, String(n.subId || '')), origenId: String(x.origenId || n.subId || n.contenedorId || ''), origenNombre: texto(x.origenNombre, ''), eliminadoEn: +x.eliminadoEn || 0 },
        x.etiquetaId ? { etiquetaId: String(x.etiquetaId) } : {}, x.antesDe ? { antesDe: String(x.antesDe) } : {}, x.despuesDe ? { despuesDe: String(x.despuesDe) } : {}));
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
    d.notas.forEach(n => { if (!especialDeBib(n.subId)) deRegistro(n.characters); });   // las plantillas y las fórmulas no cuentan
    d.contenedores.forEach(c => c.esquemas.forEach(e => Object.values(e.notas).forEach(n => deRegistro(n.characters))));
    const gruposElenco = sanearGrupos(src.gruposElenco, new Set(d.elenco.map(p => p.id)), d.carpetasElenco.map(k => k.id), ids);
    if (gruposElenco.length) d.gruposElenco = gruposElenco;
    const ordenElenco = Array.isArray(src.ordenElenco) ? src.ordenElenco.filter(x => typeof x === 'string' && x) : [];
    if (ordenElenco.length) d.ordenElenco = ordenElenco;
    mudarGuiones(d);
    agruparEnlaces(d);
    mudarEsquemasPersonaje(d);
    versionarGuiones(d);
    podarConexiones(d);
    /* **el historial de Claude** (js/claquedraw/historial.js, 1.1.50): viaja con el proyecto; solo se guarda si lo hay (así un
       proyecto sin cambios de Claude se abre idéntico a como se guardó) */
    if (Array.isArray(src.historialClaude) && src.historialClaude.length) {
      const h = C.historial ? C.historial.sanear(src.historialClaude) : clonar(src.historialClaude);
      if (h.length) d.historialClaude = h;
    }
    /* el nombre con que se hacen los enlaces del proyecto y los que tuvo antes (1.1.52, js/claquedraw/enlaces.js): si su archivo
       se renombra, los enlaces viejos lo siguen encontrando */
    const en = src.enlace;
    if (en && typeof en === 'object' && typeof en.proyecto === 'string' && en.proyecto.trim()) {
      const antes = (Array.isArray(en.antes) ? en.antes : []).filter((x, i, l) => typeof x === 'string' && x.trim() && x !== en.proyecto && l.indexOf(x) === i).slice(0, 20);
      d.enlace = Object.assign({ proyecto: en.proyecto.trim() }, antes.length ? { antes } : {});
    }
    /* la memoria de estilo del proyecto (1.1.60, js/claquedraw/memoria.js): solo si hay alguna regla */
    if (Array.isArray(src.memoriaEstilo) && src.memoriaEstilo.length) {
      const me = Me() ? Me().sanear(src.memoriaEstilo) : clonar(src.memoriaEstilo);
      if (me.length) d.memoriaEstilo = me;
    }
    /* los mods del teatro de duendes (1.1.63, js/claquedraw/teatro-mods.js): solo si hay alguno */
    if (src.teatro && typeof src.teatro === 'object') {
      const tm = Tm() ? Tm().sanear(src.teatro) : clonar(src.teatro);
      if (tm && Object.keys(tm).length) d.teatro = tm;
    }
    return d;
  }

  /* **Conexiones esquema ↔ biblioteca** (1.1.57, Leo: «tenía la posibilidad de conectar esquemas con bibliotecas, varios a la vez»):
     de muchos a muchos y aparte de los grupos del árbol (que siguen siendo solo orden). Viven en el esquema, `esquema.bibliotecas =
     [subId…]`, y valen las bibliotecas normales: ni la oculta de los guiones de un esquema, ni la de las plantillas, ni la de un
     personaje. Una biblioteca en la papelera **sigue conectada** (al restaurarla vuelve con su conexión; mientras, no se ve); lo que
     ya no está en ningún sitio se poda aquí. También las de los esquemas tirados (vuelven con ellos). */
  const esConectable = (c, s) => !!s && !s.guionEid && !s.lineaId && !especialDeBib(s.id) && c.id !== ID_PERSONAJES && !c.especial;
  function podarConexiones(d) {
    const vivas = new Set();
    d.contenedores.forEach(c => c.subs.forEach(s => { if (esConectable(c, s)) vivas.add(s.id); }));
    d.papelera.forEach(x => { if (x.tipo === 'sub' && x.sub) vivas.add(x.sub.id); });
    const podar = e => { if (!e.bibliotecas) return; e.bibliotecas = e.bibliotecas.filter(id => vivas.has(id)); if (!e.bibliotecas.length) delete e.bibliotecas; };
    d.contenedores.forEach(c => c.esquemas.forEach(podar));
    d.papelera.forEach(x => { if (x.tipo === 'esquema' && x.esquema) podar(x.esquema); });
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
        const pieza = x => c.esquemas.find(e => e.id === x) || c.subs.find(s => s.id === x) || (c.lienzos || []).find(l => l.id === x);
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
    enPapelera(id) { return this.datos.papelera.find(x => x.nota && x.nota.id === id) || null; }
    /* un esquema, una biblioteca o un personaje tirados enteros */
    piezaEnPapelera(id) { return this.datos.papelera.find(x => (x.tipo === 'esquema' && x.esquema.id === id) || (x.tipo === 'sub' && x.sub.id === id) || (x.tipo === 'personaje' && x.personaje.id === id) || (x.tipo === 'lienzo' && x.lienzo.id === id)) || null; }
    /* Un subcontenedor con su contenedor, o null. */
    sub(id) {
      for (const c of this.datos.contenedores) { const s = c.subs.find(x => x.id === id); if (s) return { contenedor: c, sub: s }; }
      return null;
    }
    /* Las bibliotecas del contenedor; la de los guiones de un esquema no está en el árbol (Leo, 16-09-2026). */
    subsDe(cid) { const c = this.contenedor(cid); return c ? c.subs.filter(s => !s.guionEid) : []; }
    esGuiones(subId) { const r = this.sub(subId); return !!(r && r.sub.guionEid); }
    /* Las bibliotecas de un contenedor en el orden del árbol (entrando en carpetas y grupos); nunca la oculta de los guiones
       de un esquema (`guionEid`), que `nivelArbol` y `nivelGrupo` ya no dan. */
    _bibliotecasArbol(cid) {
      const res = [];
      const ir = xs => xs.forEach(x => {
        if (x.tipo === 'sub') res.push(x.obj);
        else if (x.tipo === 'carpeta') ir(this.nivelArbol(cid, x.id));
        else if (x.tipo === 'grupo') ir(this.nivelGrupo(x.id));
      });
      ir(this.nivelArbol(cid, null));
      return res;
    }
    /* La primera biblioteca de un contenedor tal como se ve en el árbol, o null si no tiene ninguna a la vista: `c.subs[0]`
       puede ser la oculta de los guiones de un esquema (ahí se abría una biblioteca invisible y una nota restaurada se
       quedaba escondida). */
    primeraBiblioteca(cid) {
      const c = this.contenedor(cid);
      if (!c || c.especial) return null;                        // la de las plantillas (o las fórmulas) no es «la primera» de nada
      return this._bibliotecasArbol(cid)[0] || this.subsDe(cid)[0] || null;
    }
    /* Todas las bibliotecas a la vista, [{ contenedor, sub }], en el orden del menú: los contenedores fijados primero y,
       dentro de cada uno, el orden del árbol. Sin los contenedores ocultos (Personajes). */
    todasLasBibliotecas() {
      const L = this.contenedores();
      return [...L.fijados, ...L.sueltos].flatMap(c => this._bibliotecasArbol(c.id).map(sub => ({ contenedor: c, sub })));
    }
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
      const l = this.lienzo(id); if (l) return l.contenedor.id;
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
      const l = (c.lienzos || []).find(x => x.id === id); if (l) return { tipo: 'lienzo', obj: l };
      return null;
    }
    crearGrupo(ambito, ids, nombre, col, op) {
      if (esDeEspecial(ambito) || (ids || []).some(x => esDeEspecial(String(x)))) return noEspecial('agrupa', ambito, ...(ids || []));
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
      if (esDeEspecial(id)) return noEspecial('agrupa', id);
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
    /* **Las conexiones mandan** (1.1.57): un esquema conectado va a su primera biblioteca conectada, y una biblioteca, a su primer
       esquema conectado (`conectado: true`); sin conexiones, el grupo como antes. */
    enlace(id) {
      const bs = this.bibliotecasDe(id);
      if (bs.length) { const e = this.esquema(id); return { contenedor: e.contenedor, esquema: e.esquema, sub: bs[0].sub, grupo: null, conectado: true }; }
      const es = this.esquemasConectados(id);
      if (es.length) { const s = this.sub(id); return { contenedor: s.contenedor, esquema: es[0].esquema, sub: s.sub, grupo: null, conectado: true }; }
      const r = this.grupoDe(id); if (!r) return null;
      const esquema = r.contenedor.esquemas.find(e => r.grupo.items.includes(e.id));
      const sub = r.contenedor.subs.find(x => r.grupo.items.includes(x.id));
      return esquema && sub ? { contenedor: r.contenedor, esquema, sub, grupo: r.grupo } : null;
    }
    /* ---------- conexiones esquema ↔ biblioteca (1.1.57) ----------
       De muchos a muchos, aparte de los grupos: dicen qué bibliotecas trabajan con un esquema (Claude deja ahí los fragmentos del
       guion, un segmento por acto o secuencia y una nota por fragmento). Se guardan en el esquema (`bibliotecas`). */
    /* ¿se puede conectar esta biblioteca? una normal: ni la de los guiones de un esquema, ni la de las plantillas, ni la de un personaje */
    conectable(subId) { const r = this.sub(subId); return !!r && esConectable(r.contenedor, r.sub); }
    /* Las bibliotecas conectadas a un esquema, [{ contenedor, sub }] en el orden en que se conectaron (las de la papelera no salen). */
    bibliotecasDe(eid) {
      const r = this.esquema(eid); if (!r || !r.esquema.bibliotecas) return [];
      return r.esquema.bibliotecas.map(id => this.sub(id)).filter(Boolean);
    }
    /* Los esquemas conectados a una biblioteca, [{ contenedor, esquema }] en el orden del proyecto. */
    esquemasConectados(subId) {
      const res = [];
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => { if ((e.bibliotecas || []).includes(subId)) res.push({ contenedor: c, esquema: e }); }));
      return res;
    }
    conectado(eid, subId) { const r = this.esquema(eid); return !!(r && (r.esquema.bibliotecas || []).includes(subId)); }
    /* `op.pos`: su sitio en la lista del esquema (para el «Deshacer» de desconectar); sin él, al final */
    conectar(eid, subId, op) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const b = this.sub(subId); if (!b) return no('Esa biblioteca ya no existe');
      if (!esConectable(b.contenedor, b.sub)) return no(especialDeBib(b.sub.id) ? 'La biblioteca de ' + ESPECIALES[especialDeBib(b.sub.id)].las + ' no se conecta con esquemas' : 'Esa biblioteca no se conecta con esquemas');
      if ((r.esquema.bibliotecas || []).includes(subId)) return si({ esquema: r.esquema, sub: b.sub, cambio: false, aviso: '«' + r.esquema.nombre + '» ya estaba conectado con «' + b.sub.nombre + '»' });
      const l = r.esquema.bibliotecas = r.esquema.bibliotecas || [], pos = op && Number.isInteger(op.pos) ? Math.max(0, Math.min(l.length, op.pos)) : l.length;
      l.splice(pos, 0, subId);
      this._tocar(r.contenedor);
      return si({ esquema: r.esquema, sub: b.sub, cambio: true, aviso: '«' + r.esquema.nombre + '» conectado con la biblioteca «' + b.sub.nombre + '»' });
    }
    desconectar(eid, subId) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const l = r.esquema.bibliotecas || [];
      if (!l.includes(subId)) return si({ esquema: r.esquema, cambio: false, aviso: 'No estaban conectados' });
      const pos = l.indexOf(subId);
      r.esquema.bibliotecas = l.filter(x => x !== subId);
      if (!r.esquema.bibliotecas.length) delete r.esquema.bibliotecas;
      this._tocar(r.contenedor);
      const b = this.sub(subId) || (this.piezaEnPapelera(subId) || {});
      return si({ esquema: r.esquema, cambio: true, pos, aviso: '«' + r.esquema.nombre + '» ya no está conectado con «' + ((b.sub || {}).nombre || 'la biblioteca') + '»' });
    }
    /* Quita de todos los esquemas (vivos y tirados) las conexiones a lo que ya no está en ningún sitio. */
    _podarConexiones() { podarConexiones(this.datos); }

    /* ---------- fragmentos (1.1.57): notas que dicen de qué tramo de un esquema salen ---------- */
    /* Marca una nota como fragmento de un esquema (o se la quita, con null). `f = { eid, nodos, segundos, orden, bloques }`. */
    fijarFragmento(id, f) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      if (especialDeBib(n.subId) || this.esGuiones(n.subId)) return no('Esa nota no puede ser un fragmento');
      if (f === null || f === undefined) {
        if (!n.fragmento) return si({ nota: n, cambio: false });
        delete n.fragmento; this._tocarSub(n.subId);
        return si({ nota: n, cambio: true });
      }
      const x = fragmentoDe(f); if (!x) return no('Un fragmento necesita su esquema');
      if (!this.esquema(x.eid) && !this.piezaEnPapelera(x.eid)) return no('Ese esquema no existe');
      if (JSON.stringify(n.fragmento || null) === JSON.stringify(x)) return si({ nota: n, cambio: false });
      n.fragmento = x; this._tocarSub(n.subId);
      return si({ nota: n, cambio: true });
    }
    /* Las notas que son fragmentos de un esquema (sin la papelera), por su puesto (`orden`) y, a igualdad, por su sitio. */
    fragmentosDe(eid) {
      const ns = this.notasNormales().filter(n => n.fragmento && n.fragmento.eid === eid);
      return ns.map((n, i) => [n, i]).sort((a, b) => (a[0].fragmento.orden || 1e9) - (b[0].fragmento.orden || 1e9) || a[1] - b[1]).map(p => p[0]);
    }
    /* Cómo está un fragmento: su esquema (o null si ya no está; `enPapelera` si está tirado), sus nodos con su título y su columna
       (desde 0), los que ya no están, y si se quedó **huérfano** (sin esquema, o con nodos y ninguno vivo). null si no es fragmento. */
    estadoFragmento(id) {
      const n = typeof id === 'string' ? this.nota(id) : id; if (!n || !n.fragmento) return null;
      const f = n.fragmento, r = this.esquema(f.eid), tirado = !r && this.piezaEnPapelera(f.eid);
      const datos = r ? r.esquema.datos : tirado ? tirado.esquema.datos : null;
      const puntos = new Map(((datos && datos.puntos) || []).map(p => [p.id, p]));
      const colDe = p => Math.max(0, Math.round(+p.col || 0));
      const nodos = f.nodos.filter(x => puntos.has(x)).map(x => { const p = puntos.get(x); return { id: x, titulo: p.titulo || '', lineaId: p.lineaId, col: colDe(p) }; });
      const perdidos = f.nodos.filter(x => !puntos.has(x));
      return { eid: f.eid, esquema: r ? r.esquema : null, contenedor: r ? r.contenedor : null, enPapelera: !!tirado, nombre: r ? r.esquema.nombre : tirado ? tirado.esquema.nombre : '',
               nodos, perdidos, segundos: f.segundos || 0, orden: f.orden || null, bloques: f.bloques || null,
               huerfano: !r || (f.nodos.length > 0 && !nodos.length) };
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
        || c.esquemas.some(e => plano(e.nombre).includes(q) || Object.values(e.notas).some(n => plano(n.title).includes(q)))
        || (c.lienzos || []).some(l => plano(l.nombre).includes(q));
      const preparar = xs => { const f = xs.filter(pasa); return cmp ? f.sort(cmp) : f; };
      const visibles = this.datos.contenedores.filter(c => !c.oculto && !c.especial);   // ni Personajes ni las especiales (plantillas, fórmulas) salen en el árbol
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
      const c = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Contenedor'), this.datos.contenedores.filter(x => !x.especial).map(x => x.nombre)),
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
    /* Los contenedores que se llaman como el proyecto, con cualquiera de los nombres que se le pasan (el de antes y el de su
       archivo): sin mayúsculas, acentos ni separadores, «amor-tiktoker» es «Amor tiktoker» (Leo, 18-09-2026: al renombrar el
       proyecto, la cabecera no cambiaba porque su contenedor nunca se llamó exactamente igual). */
    contenedoresLlamados(nombres) {
      const buscados = new Set([].concat(nombres || []).map(sinSeparadores).filter(Boolean));
      return this.datos.contenedores.filter(c => !c.oculto && !c.especial && buscados.has(sinSeparadores(c.nombre)));
    }
    renombrarContenedor(id, nombre) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      if (c.especial) return noEspecial('renombra', c.id);
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (this.datos.contenedores.some(x => x !== c && !x.especial && plano(x.nombre) === plano(n))) return no('Ya hay un contenedor con ese nombre');
      c.nombre = n; this._tocar(c);
      return si({ contenedor: c });
    }
    fijarContenedor(id, fijado) { const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe'); if (c.especial) return noEspecial('fija', c.id); c.fijado = !!fijado; return si({ contenedor: c }); }
    plegarContenedor(id, plegado) { const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe'); c.plegado = plegado === undefined ? !c.plegado : !!plegado; return si({ contenedor: c }); }
    moverContenedor(id, salto) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      if (c.especial) return noEspecial('mueve', c.id);
      /* sus vecinos son los que se ven: con uno oculto (Personajes, las plantillas) se cambiaba de sitio sin que se notara */
      const todos = this.datos.contenedores, grupo = todos.filter(x => x.fijado === c.fijado && (x === c || (!x.oculto && !x.especial)));
      const i = grupo.indexOf(c), j = i + (salto < 0 ? -1 : 1);
      if (j < 0 || j >= grupo.length) return no('Ya está en el extremo');
      const a = todos.indexOf(c), b = todos.indexOf(grupo[j]); todos[a] = grupo[j]; todos[b] = c;
      return si({ contenedor: c });
    }
    /* Soltar tras arrastrar en la barra: queda delante de `antesDe` (y en su grupo, fijados o no) o al
       final de su grupo. */
    colocarContenedor(id, antesDe) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      if (c.especial) return noEspecial('mueve', c.id);
      /* delante de uno oculto (Personajes, las plantillas) no se ve nada: cuenta como «al final» (el gestor, al soltar detrás
         del último del árbol, podía dar el siguiente de la lista, que era uno de esos) */
      const r0 = antesDe && antesDe !== id ? this.contenedor(antesDe) : null;
      const ref = r0 && !r0.oculto && !r0.especial ? r0 : null;
      const resto = this.datos.contenedores.filter(x => x !== c);
      if (ref) { c.fijado = ref.fijado; resto.splice(resto.indexOf(ref), 0, c); }
      else { const grupo = resto.filter(x => x.fijado === c.fijado); resto.splice(grupo.length ? resto.indexOf(grupo[grupo.length - 1]) + 1 : resto.length, 0, c); }
      this.datos.contenedores = resto;
      return si({ contenedor: c });
    }
    /* Se lleva sus esquemas y sus subcontenedores con sus etiquetas; las notas van a la papelera. */
    /* Sus esquemas y sus bibliotecas van a la papelera, cada uno con lo suyo (se restauran en un contenedor con su nombre). */
    eliminarContenedor(id) {
      const c = this.contenedor(id); if (!c) return no('Ese contenedor ya no existe');
      if (c.especial) return noEspecial('elimina', c.id);
      const notas = this.notasContenedor(id).length, esquemas = c.esquemas.length, lienzos = (c.lienzos || []).length;
      const bibs = c.subs.filter(s => !s.guionEid);
      c.esquemas.slice().forEach(e => this.eliminarEsquema(e.id));
      bibs.forEach(s => this.eliminarSub(s.id));
      (c.lienzos || []).slice().forEach(l => this.eliminarLienzo(l.id));
      const subs = new Set(c.subs.map(s => s.id));
      this.datos.contenedores = this.datos.contenedores.filter(x => x !== c);
      this.datos.etiquetas = this.datos.etiquetas.filter(e => !subs.has(e.subId));
      this.datos.notas = this.datos.notas.filter(n => !subs.has(n.subId));
      const partes = [[esquemas, ' esquema', ' esquemas'], [bibs.length, ' biblioteca', ' bibliotecas'], [lienzos, ' lienzo', ' lienzos']]
        .filter(x => x[0]).map(x => x[0] + (x[0] === 1 ? x[1] : x[2]));
      const lista = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes.join('');
      return si({ contenedor: c, notas, esquemas, lienzos, aviso: '«' + c.nombre + '» eliminado' + (lista ? ' · ' + lista + ' a la papelera' : '') });
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
      return r.contenedor.esquemas.filter(dentro).length + r.contenedor.subs.filter(x => dentro(x) && !x.guionEid).length + (r.contenedor.lienzos || []).filter(dentro).length;
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
      if (c && c.especial) return no('En ' + ESPECIALES[c.especial].las + ' no hay carpetas');
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
      if (r.contenedor) { r.contenedor.esquemas.forEach(subir); r.contenedor.subs.forEach(subir); (r.contenedor.lienzos || []).forEach(subir); } else this.datos.elenco.forEach(subir);
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
      if (esDeEspecial(id) || esDeEspecial(cid) || (dest && dest.contenedor && dest.contenedor.especial)) return noEspecial('mete en carpetas', id, cid, dest && dest.contenedor && dest.contenedor.id);
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
            if (p.tipo === 'esquema') this.colocarEsquema(x, null, ambito); else if (p.tipo === 'lienzo') this.colocarLienzo(x, null, ambito); else this.colocarSub(x, null, ambito);
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
      const r = tipo === 'esquema' ? this.esquema(id) : tipo === 'lienzo' ? this.lienzo(id) : this.sub(id);
      if (!r) return no(tipo === 'esquema' ? 'Ese esquema ya no existe' : tipo === 'lienzo' ? 'Ese lienzo ya no existe' : 'Esa biblioteca ya no existe');
      if (dest && dest.ambito === ELENCO) return no('Ahí solo van personajes');
      const destino = dest ? dest.contenedor : (cid ? this.contenedor(cid) : r.contenedor);
      if (!destino) return no('Ese contenedor ya no existe');
      if (destino !== r.contenedor) {
        const x = tipo === 'esquema' ? this.colocarEsquema(id, null, destino.id) : tipo === 'lienzo' ? this.colocarLienzo(id, null, destino.id) : this.colocarSub(id, null, destino.id);
        if (!x.ok) return x;
      }
      const item = tipo === 'esquema' ? this.esquema(id).esquema : tipo === 'lienzo' ? this.lienzo(id).lienzo : this.sub(id).sub;
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
      return [...c.carpetas.map(k => k.id), ...gs, ...c.esquemas.map(e => e.id), ...c.subs.filter(x => !x.guionEid).map(x => x.id), ...(c.lienzos || []).map(l => l.id)];
    }
    _ordenArbol(ambito) {
      const guardado = ambito === ELENCO ? this.datos.ordenElenco : (this.contenedor(ambito) || {}).ordenArbol;
      return aplicarOrden(this._miembrosArbol(ambito), guardado);
    }
    /* Lo de un nivel en su orden: [{ tipo: 'carpeta' | 'grupo' | 'esquema' | 'sub' | 'lienzo' | 'personaje', id, obj }]. Lo que está
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
        xs.push(...c.esquemas.filter(aqui).map(obj => ({ tipo: 'esquema', id: obj.id, obj })), ...c.subs.filter(x => aqui(x) && !x.guionEid).map(obj => ({ tipo: 'sub', id: obj.id, obj })),
          ...(c.lienzos || []).filter(aqui).map(obj => ({ tipo: 'lienzo', id: obj.id, obj })));
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
      const l = this.lienzo(id); if (l) return { tipo: 'lienzo', id, ambito: l.contenedor.id, carpetaId: l.lienzo.carpetaId || null, grupoId: gid };
      return null;
    }
    /* Pone una pieza (o un grupo) del árbol delante (o, con `despues`, detrás) de otra: **va a donde vive esa otra**, o
       sea a su carpeta y a su grupo. Así se mete y se saca de un grupo con solo arrastrar (Leo, 16-09-2026). */
    colocarEnArbol(id, refId, despues) {
      if (esDeEspecial(id) || esDeEspecial(refId)) return noEspecial('mueve', id, refId);
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
      (origen.lienzos || []).filter(dentro).forEach(l => { const k = l.carpetaId; this.colocarLienzo(l.id, null, destino.id); this._enCarpeta(destino, l, k); });
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
      if (c.especial) return no(mayus(ESPECIALES[c.especial].las) + ' tienen una sola biblioteca');
      const t = this.ahora();
      const s = { id: this.idNuevo(), nombre: this._libre(texto(nombre, NOMBRE_SUB), c.subs.map(x => x.nombre)), creado: t, modificado: t };
      c.subs.push(s); this._tocar(c);
      return si({ contenedor: c, sub: s });
    }
    renombrarSub(id, nombre) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      if (esDeEspecial(id)) return noEspecial('renombra', id);
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (r.contenedor.subs.some(x => x !== r.sub && plano(x.nombre) === plano(n))) return no('Ya hay una biblioteca con ese nombre');
      r.sub.nombre = n; this._tocarSub(id);
      return si(r);
    }
    /* Soltar tras arrastrar: delante de `antesDe` (un subcontenedor de cualquier contenedor: se va a
       ese contenedor) o al final de `cid` (o del suyo). */
    colocarSub(id, antesDe, cid) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      if (esDeEspecial(id) || esDeEspecial(antesDe) || esDeEspecial(cid)) return noEspecial('mueve', id, antesDe, cid);
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
        this._llevar(origen, destino, p.tipo === 'esquema' ? 'esquemas' : p.tipo === 'lienzo' ? 'lienzos' : 'subs', p.obj, null);
        if (p.tipo === 'esquema') { const gs = origen.subs.find(y => y.guionEid === x); if (gs) this._llevar(origen, destino, 'subs', gs, null); }
      });
      origen.grupos = (origen.grupos || []).filter(x => x !== g);
      if (!origen.grupos.length) delete origen.grupos;
      (destino.grupos = destino.grupos || []).push(g);
    }
    /* Pasa `x` de la lista `clave` de un contenedor a la del otro (delante de `antesDe` o al final),
       renombrándolo si choca con otro de su clase allí. */
    _llevar(origen, destino, clave, x, antesDe) {
      const alli = destino[clave] || [];                        // `lienzos` puede no existir
      if (destino !== origen && alli.some(y => y !== x && plano(y.nombre) === plano(x.nombre))) x.nombre = this._libre(x.nombre, alli.filter(y => y !== x).map(y => y.nombre));
      origen[clave] = (origen[clave] || []).filter(y => y !== x);
      const lista = (destino[clave] || []).filter(y => y !== x);
      lista.splice(antesDe ? Math.max(0, lista.indexOf(antesDe)) : lista.length, 0, x);
      destino[clave] = lista;
      if (clave === 'lienzos' && origen.lienzos && !origen.lienzos.length) delete origen.lienzos;
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
    /* A la papelera entera, con sus segmentos y sus notas (Leo, 18-09-2026); desde ahí se restaura. */
    eliminarSub(id) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      if (esDeEspecial(id)) return noEspecial('tira: sus ' + ESPECIALES[especialDe(id)].nombre.toLowerCase() + ' sí, una a una', id);
      const g = this.grupoDe(id);
      this.sacarDeGrupo(id);                                     // si estaba en un grupo, sale de él (y vuelve a él al restaurarla)
      const b = this._sacarBiblioteca(r.contenedor, r.sub);
      this.datos.papelera.push(Object.assign({ tipo: 'sub', origenId: r.contenedor.id, origenNombre: r.contenedor.nombre, eliminadoEn: this.ahora() },
        r.sub.carpetaId ? { carpetaId: r.sub.carpetaId } : {}, g ? { grupoId: g.grupo.id } : {}, b));
      this._tocar(r.contenedor);
      return si({ sub: r.sub, contenedor: r.contenedor, notas: b.notas.length, aviso: 'La biblioteca «' + r.sub.nombre + '» va a la papelera' });
    }
    /* saca una biblioteca con sus segmentos y sus notas (para la papelera), y la vuelve a poner */
    _sacarBiblioteca(c, s) {
      const etiquetas = this.datos.etiquetas.filter(e => e.subId === s.id), notas = this.datos.notas.filter(n => n.subId === s.id);
      this.datos.etiquetas = this.datos.etiquetas.filter(e => e.subId !== s.id);
      this.datos.notas = this.datos.notas.filter(n => n.subId !== s.id);
      c.subs = c.subs.filter(x => x !== s);
      return { sub: s, etiquetas, notas };
    }
    _meterBiblioteca(c, b) {
      c.subs.push(b.sub);
      this.datos.etiquetas.push(...b.etiquetas.map(e => Object.assign(e, { subId: b.sub.id })));
      this.datos.notas.push(...b.notas.map(n => Object.assign(n, { subId: b.sub.id })));
    }

    /* ---------- duplicar (Leo, 18-09-2026: «quiero poder duplicar bibliotecas y esquemas, con todo y su contenido») ----------
       La copia se llama «Nombre (copia)» y queda justo detrás del original, en su carpeta y en su grupo. */
    /* Las notas (con sus versiones), los segmentos y las secciones de la biblioteca `desde`, copiados a `hacia` con
       identificadores nuevos. */
    _copiarContenido(desde, hacia) {
      const secs = new Map(), etqs = new Map();
      if (Array.isArray(hacia.secciones)) hacia.secciones = hacia.secciones.map(k => { const n = Object.assign({}, k, { id: this.idNuevo() }); secs.set(k.id, n.id); return n; });
      this.datos.etiquetas.filter(e => e.subId === desde).forEach(e => {
        const n = Object.assign(clonar(e), { id: this.idNuevo(), subId: hacia.id });
        if (n.seccionId) { if (secs.has(n.seccionId)) n.seccionId = secs.get(n.seccionId); else delete n.seccionId; }
        etqs.set(e.id, n.id); this.datos.etiquetas.push(n);
      });
      if (Array.isArray(hacia.ordenSegmentos)) hacia.ordenSegmentos = hacia.ordenSegmentos.map(k => (/^etq:/.test(k) && etqs.has(k.slice(4)) ? 'etq:' + etqs.get(k.slice(4)) : k));
      const notas = this.notasDe(desde).map(nt => Object.assign(clonar(nt), { id: this.idNuevo(), subId: hacia.id, etiquetaId: nt.etiquetaId ? etqs.get(nt.etiquetaId) || null : null }));
      this.datos.notas.push(...notas);
      return notas;
    }
    duplicarSub(id) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      if (r.sub.guionEid || r.sub.lineaId || esDeEspecial(id)) return no('Esa biblioteca no se puede duplicar');
      const c = r.contenedor, t = this.ahora();
      const s = Object.assign(clonar(r.sub), { id: this.idNuevo(), nombre: this._libre(r.sub.nombre + ' (copia)', c.subs.map(x => x.nombre)), creado: t, modificado: t });
      c.subs.splice(c.subs.indexOf(r.sub) + 1, 0, s);
      const notas = this._copiarContenido(id, s);
      /* las copias no son fragmentos: con la biblioteca conectada a los mismos esquemas, cada fragmento contaría dos veces
         (`fragmentosDe`, preparar_fragmentos); su texto se queda, la marca no */
      notas.forEach(n => { delete n.fragmento; });
      this.esquemasConectados(id).forEach(x => x.esquema.bibliotecas.push(s.id));   // y conectada con los mismos esquemas (1.1.57)
      this.colocarEnArbol(s.id, id, true);                         // detrás del original, en su carpeta y en su grupo
      this._tocar(c);
      return si({ contenedor: c, sub: s, aviso: 'Biblioteca duplicada: «' + s.nombre + '»' + (notas.length ? ' · ' + notas.length + (notas.length === 1 ? ' nota' : ' notas') : '') });
    }
    /* Un esquema, con sus nodos, sus notas y su documento (con sus versiones), que vive en su biblioteca oculta. */
    duplicarEsquema(eid) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const c = r.contenedor;
      const e = Object.assign(clonar(r.esquema), { id: this.idNuevo(), nombre: this._libre(r.esquema.nombre + ' (copia)', c.esquemas.map(x => x.nombre)) });
      c.esquemas.splice(c.esquemas.indexOf(r.esquema) + 1, 0, e);
      const gs = this.bibliotecaGuiones(eid, false);
      if (gs) {
        const s = Object.assign(clonar(gs), { id: e.id + ':guiones', guionEid: e.id });
        c.subs.push(s);
        this._copiarContenido(gs.id, s).forEach(n => { if (n.guion) n.guion = Object.assign({}, n.guion, { eid: e.id }); });
      }
      this.colocarEnArbol(e.id, eid, true);
      this._tocar(c);
      return si({ contenedor: c, esquema: e, aviso: 'Esquema duplicado: «' + e.nombre + '»' });
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
      if (c.especial) return no('En ' + ESPECIALES[c.especial].las + ' no van esquemas');
      const e = sanearEsquema({ datos, notas: notas && typeof notas === 'object' ? notas : {} }, this.idNuevo(), this._libre(texto(nombre, 'Esquema'), c.esquemas.map(x => x.nombre)));
      if (!e) return no('Eso no es un esquema de pasos válido');
      c.esquemas.push(e); this._tocar(c);
      return si({ contenedor: c, esquema: e, aviso: 'Esquema «' + e.nombre + '» creado en «' + c.nombre + '»' });
    }
    /* El color de la etiqueta de un esquema o de una biblioteca (uno de los 16 pares, como los personajes; null: el de
       siempre). Leo, 16-09-2026: «dejame cambiar los colores, igual que lo haces en personajes». */
    colorearHijo(id, col) {
      if (esDeEspecial(id)) return noEspecial('colorea', id);
      const r = this.esquema(id) || this.sub(id) || this.lienzo(id); if (!r) return no('Eso ya no existe');
      const x = r.esquema || r.sub || r.lienzo;
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
      if (destino.especial) return no('En ' + ESPECIALES[destino.especial].las + ' no van esquemas');
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
    /* A la papelera entero (Leo, 18-09-2026): con sus nodos y sus notas y con su documento (y sus versiones), que vive en su
       biblioteca oculta. */
    eliminarEsquema(eid) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const c = r.contenedor, e = r.esquema, g = this.grupoDe(eid);
      this.sacarDeGrupo(eid);
      const gs = this.bibliotecaGuiones(eid, false), guiones = gs ? this._sacarBiblioteca(c, gs) : null;
      c.esquemas = c.esquemas.filter(x => x !== e); this._tocar(c);
      const guardado = Object.assign({}, e); delete guardado.carpetaId;   // la carpeta va aparte (la de la papelera no la guarda)
      this.datos.papelera.push(Object.assign({ tipo: 'esquema', esquema: guardado, origenId: c.id, origenNombre: c.nombre, eliminadoEn: this.ahora() },
        e.carpetaId ? { carpetaId: e.carpetaId } : {}, g ? { grupoId: g.grupo.id } : {}, guiones ? { guiones } : {}));
      return si(Object.assign({ aviso: 'El esquema «' + e.nombre + '» va a la papelera' }, r));
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

    /* ---------- lienzos de nodos (1.1.58) ----------
       Una pieza del árbol como un esquema: vive en un contenedor (`contenedor.lienzos`, que solo existe si hay alguno), con su
       carpeta, su grupo y su sitio en el orden del árbol, y va a la papelera entera. Sus nodos y cables los maneja C.Lienzo
       (`modeloLienzo`) y se guardan con `guardarLienzo`. */
    lienzosDe(cid) { const c = this.contenedor(cid); return c && c.lienzos ? c.lienzos.slice() : []; }
    lienzo(lid) {
      for (const c of this.datos.contenedores) { const l = (c.lienzos || []).find(x => x.id === lid); if (l) return { contenedor: c, lienzo: l }; }
      return null;
    }
    /* Todos los lienzos a la vista, [{ contenedor, lienzo }], en el orden del menú (fijados primero y el orden del árbol). */
    todosLosLienzos() {
      const L = this.contenedores(), res = [];
      [...L.fijados, ...L.sueltos].forEach(c => {
        const ir = xs => xs.forEach(x => {
          if (x.tipo === 'lienzo') res.push({ contenedor: c, lienzo: x.obj });
          else if (x.tipo === 'carpeta') ir(this.nivelArbol(c.id, x.id));
          else if (x.tipo === 'grupo') ir(this.nivelGrupo(x.id));
        });
        ir(this.nivelArbol(c.id, null));
      });
      return res;
    }
    /* `op`: { carpetaId, grupoId, datos } (datos: { nodos, cables } con que nace; si no, vacío). No en los contenedores ocultos
       (Personajes, las plantillas). */
    crearLienzo(cid, nombre, op) {
      const o = op || {}, c = this.contenedor(cid); if (!c) return no('Ese contenedor ya no existe');
      if (c.oculto || c.especial) return no('Ahí no van lienzos');
      const t = this.ahora();
      const l = sanearLienzo(Object.assign({}, o.datos && typeof o.datos === 'object' ? o.datos : {}, { creado: t, modificado: t }), this.idNuevo(),
        this._libre(texto(nombre, 'Lienzo'), (c.lienzos || []).map(x => x.nombre)));
      (c.lienzos = c.lienzos || []).push(l);
      if (o.carpetaId && c.carpetas.some(k => k.id === o.carpetaId)) this._aCarpeta(c.id, l, o.carpetaId);
      if (o.grupoId) { const g = this.grupo(o.grupoId); if (g && g.ambito === c.id) this.aGrupo(o.grupoId, l.id); }
      this._tocar(c);
      return si({ contenedor: c, lienzo: l, aviso: 'Lienzo «' + l.nombre + '» creado en «' + c.nombre + '»' });
    }
    renombrarLienzo(lid, nombre) {
      const r = this.lienzo(lid); if (!r) return no('Ese lienzo ya no existe');
      const n = texto(nombre, ''); if (!n) return no('El nombre no puede quedar vacío');
      if (r.contenedor.lienzos.some(x => x !== r.lienzo && plano(x.nombre) === plano(n))) return no('Ya hay un lienzo con ese nombre');
      if (r.lienzo.nombre !== n) { r.lienzo.nombre = n; r.lienzo.modificado = this.ahora(); this._tocar(r.contenedor); }
      return si(r);
    }
    /* Soltar tras arrastrar: delante de `antesDe` (un lienzo de cualquier contenedor: se va a ese contenedor) o al final de `cid`
       (o del suyo); se lleva su grupo, como un esquema. */
    colocarLienzo(lid, antesDe, cid) {
      const r = this.lienzo(lid); if (!r) return no('Ese lienzo ya no existe');
      const ref = antesDe && antesDe !== lid ? this.lienzo(antesDe) : null;
      if (antesDe && antesDe !== lid && !ref) return no('Ese lienzo ya no existe');
      const destino = ref ? ref.contenedor : (cid ? this.contenedor(cid) : r.contenedor);
      if (!destino) return no('Ese contenedor ya no existe');
      if (destino.oculto || destino.especial) return no('Ahí no van lienzos');
      this._llevar(r.contenedor, destino, 'lienzos', r.lienzo, ref ? ref.lienzo : null);
      this._tocar(r.contenedor); this._tocar(destino);
      if (destino !== r.contenedor) this._llevarGrupo(r.contenedor, destino, lid);
      if (ref) this._enCarpeta(destino, r.lienzo, ref.lienzo.carpetaId); else if (cid || destino !== r.contenedor) this._enCarpeta(destino, r.lienzo, null);
      return si({ contenedor: destino, lienzo: r.lienzo, movido: destino !== r.contenedor });
    }
    /* El modelo de un lienzo (C.Lienzo) sobre una copia de sus datos; lo cambiado se guarda con `guardarLienzo(lid, m.toJSON())`. */
    modeloLienzo(lid) {
      const r = this.lienzo(lid), L = Lz(); if (!r || !L) return null;
      return new L(r.lienzo, { ahora: this.ahora, idNuevo: () => this.idNuevo() });
    }
    /* `datos`: { nodos, cables, vista? } (o un C.Lienzo). Solo cuenta si cambió; `vista` solo se toca si viene la clave. */
    guardarLienzo(lid, datos) {
      const r = this.lienzo(lid); if (!r) return no('Ese lienzo ya no existe');
      const d = datos && typeof datos.toJSON === 'function' ? datos.toJSON() : datos;
      if (!d || typeof d !== 'object' || !Array.isArray(d.nodos)) return no('Eso no es un lienzo válido');
      const L = Lz(), x = L ? L.sanear(d) : { nodos: clonar(d.nodos), cables: clonar(d.cables || []) }, l = r.lienzo;
      const conVista = Object.prototype.hasOwnProperty.call(d, 'vista');
      const ahora = JSON.stringify([l.nodos, l.cables, conVista ? l.vista || null : null]);
      if (ahora === JSON.stringify([x.nodos, x.cables, conVista ? x.vista || null : null])) return si(Object.assign({ cambio: false }, r));
      l.nodos = x.nodos; l.cables = x.cables;
      if (conVista) { if (x.vista) l.vista = x.vista; else delete l.vista; }
      l.modificado = this.ahora(); this._tocar(r.contenedor);
      return si(Object.assign({ cambio: true }, r));
    }
    /* A la papelera entero, con su carpeta y su grupo aparte (como un esquema). */
    eliminarLienzo(lid) {
      const r = this.lienzo(lid); if (!r) return no('Ese lienzo ya no existe');
      const c = r.contenedor, l = r.lienzo, g = this.grupoDe(lid);
      this.sacarDeGrupo(lid);
      c.lienzos = c.lienzos.filter(x => x !== l); if (!c.lienzos.length) delete c.lienzos;
      this._tocar(c);
      const guardado = Object.assign({}, l); delete guardado.carpetaId;
      this.datos.papelera.push(Object.assign({ tipo: 'lienzo', lienzo: guardado, origenId: c.id, origenNombre: c.nombre, eliminadoEn: this.ahora() },
        l.carpetaId ? { carpetaId: l.carpetaId } : {}, g ? { grupoId: g.grupo.id } : {}));
      return si(Object.assign({ aviso: 'El lienzo «' + l.nombre + '» va a la papelera' }, r));
    }
    /* Con sus nodos, cables, estados y salidas (la copia recuerda lo que hizo el original); lo pendiente deja de estarlo (si no,
       «ejecuta el lienzo» lo haría dos veces). Detrás del original, en su carpeta y su grupo. */
    duplicarLienzo(lid) {
      const r = this.lienzo(lid); if (!r) return no('Ese lienzo ya no existe');
      const c = r.contenedor, t = this.ahora();
      const l = Object.assign(clonar(r.lienzo), { id: this.idNuevo(), nombre: this._libre(r.lienzo.nombre + ' (copia)', c.lienzos.map(x => x.nombre)), creado: t, modificado: t });
      l.nodos.forEach(n => { if (n.estado === 'pendiente') { n.estado = n.salida ? 'hecho' : 'nuevo'; delete n.pedido; if (!n.salida) delete n.hecho; } });
      c.lienzos.splice(c.lienzos.indexOf(r.lienzo) + 1, 0, l);
      this.colocarEnArbol(l.id, lid, true);
      this._tocar(c);
      return si({ contenedor: c, lienzo: l, aviso: 'Lienzo duplicado: «' + l.nombre + '»' });
    }
    /* **Lo que apunta un nodo** (una entrada) o lo que dio (una operación hecha). `nodo`: su id o el nodo mismo.
       · texto → { tipo: 'texto', md } · imagen → { tipo: 'imagen', src, alt }
       · nota → { tipo: 'nota', nota, sub, contenedor, etiqueta }
       · segmento → { tipo: 'segmento', sub, contenedor, etiqueta (null: la bandeja), bandeja, nombre, notas }
       · biblioteca → { tipo: 'biblioteca', sub, contenedor, secciones, etiquetas, notas }
       · esquema → { tipo: 'esquema', esquema, contenedor, documento (su guion, o null) }
       · personaje → { tipo: 'personaje', personaje, biblioteca (su hoja, o null), notas, apariciones, esquemas }
       · una operación → { tipo, operacion: true, estado, salida, sinSalida? } y, según su salida, lo de 'documento'
         ({ esquema, contenedor, documento, version? }), 'esquema', 'nota' o 'fragmentos' ({ sub, contenedor, notas, perdidas }).
       Siempre con `nodo`. Si lo apuntado ya no está: { roto: true, motivo, enPapelera? } (la entrada no se toca). */
    resolverNodo(lid, nodo) {
      const r = this.lienzo(lid);
      if (!r) return { roto: true, motivo: this.piezaEnPapelera(lid) ? 'Ese lienzo está en la papelera' : 'Ese lienzo ya no existe' };
      const n = nodo && typeof nodo === 'object' ? nodo : r.lienzo.nodos.find(x => x.id === nodo);
      if (!n) return { roto: true, motivo: 'Ese nodo ya no está en el lienzo' };
      return this.resolverEntrada(n);
    }
    resolverEntrada(n) {
      const d = n.datos || {}, base = { nodo: n, tipo: n.tipo };
      const roto = (motivo, enPap) => Object.assign({ roto: true, motivo }, base, enPap ? { enPapelera: true } : {});
      const bib = subId => {                                    // { contenedor, sub } o el motivo de que no esté
        if (!subId) return { falta: roto('Sin biblioteca elegida') };
        const s = this.sub(subId);
        if (s && !s.sub.guionEid) return s;
        return { falta: this.piezaEnPapelera(subId) ? roto('Esa biblioteca está en la papelera', true) : roto('Esa biblioteca ya no existe') };
      };
      const nota = id => {
        const x = id && this.nota(id);
        if (x) { const s = this.sub(x.subId); return { nota: x, sub: s ? s.sub : null, contenedor: s ? s.contenedor : null, etiqueta: x.etiquetaId ? this.etiqueta(x.etiquetaId) : null }; }
        if (!id) return { falta: roto('Sin nota elegida') };
        if (this.enPapelera(id)) return { falta: roto('Esa nota está en la papelera', true) };
        const pz = this.piezaConNota(id);                      // se fue con su biblioteca, su esquema, su personaje o su contenedor
        if (pz) return { falta: roto('Esa nota está en la papelera, con ' + nombrePieza(pz), true) };
        return { falta: roto('Esa nota ya no existe') };
      };
      const esquema = eid => {
        const e = eid && this.esquema(eid);
        if (e) return { esquema: e.esquema, contenedor: e.contenedor, documento: this.documentoEsquema(eid) };
        return { falta: !eid ? roto('Sin esquema elegido') : this.piezaEnPapelera(eid) ? roto('Ese esquema está en la papelera', true) : roto('Ese esquema ya no existe') };
      };
      const hecho = (x, extra) => (x.falta ? x.falta : Object.assign({}, base, extra, x));
      switch (n.tipo) {
        case 'texto': return Object.assign({}, base, { md: d.md || '' });
        case 'imagen': return d.src ? Object.assign({}, base, { src: d.src, alt: d.alt || '' }) : roto('La imagen está vacía');
        case 'nota': return hecho(nota(d.notaId));
        case 'segmento': {
          const s = bib(d.subId); if (s.falta) return s.falta;
          const e = d.etiquetaId ? this.etiqueta(d.etiquetaId) : null;
          if (d.etiquetaId && (!e || e.subId !== d.subId)) return roto('Ese segmento ya no existe');
          return Object.assign({}, base, { sub: s.sub, contenedor: s.contenedor, etiqueta: e, bandeja: !e, nombre: e ? e.nombre : 'Bandeja', notas: this.notasDe(d.subId, e ? e.id : null) });
        }
        case 'biblioteca': {
          const s = bib(d.subId); if (s.falta) return s.falta;
          return Object.assign({}, base, { sub: s.sub, contenedor: s.contenedor, secciones: this.seccionesDe(d.subId), etiquetas: this.etiquetasDe(d.subId), notas: this.notasDe(d.subId) });
        }
        case 'esquema': return hecho(esquema(d.eid));
        case 'personaje': {
          const id = d.personajeId, p = id && this.personaje(id);
          if (!p) return !id ? roto('Sin personaje elegido') : this.piezaEnPapelera(id) ? roto('Ese personaje está en la papelera', true) : roto('Ese personaje ya no existe');
          const h = this.hojaPersonaje(id);                      // su biblioteca, sin crearla
          return Object.assign({}, base, { personaje: p, biblioteca: h.biblioteca, notas: h.notas, apariciones: this.menciones(id), esquemas: this.esquemasDePersonaje(id) });
        }
      }
      /* una operación: lo que dio */
      const op = Object.assign({}, base, { operacion: true, estado: n.estado || 'nuevo', salida: n.salida || null });
      const s = n.salida; if (!s) return Object.assign(op, { sinSalida: true });
      if (s.tipo === 'documento' || s.tipo === 'esquema') {
        const e = esquema(s.eid); if (e.falta) return Object.assign(e.falta, { operacion: true, estado: op.estado, salida: s });
        return Object.assign(op, e, s.versionId && e.documento ? { version: (e.documento.versiones || []).find(v => v.id === s.versionId) || null } : {});
      }
      if (s.tipo === 'nota') { const x = nota(s.notaId); return x.falta ? Object.assign(x.falta, { operacion: true, estado: op.estado, salida: s }) : Object.assign(op, x); }
      if (s.tipo === 'fragmentos') {
        const b = bib(s.subId); if (b.falta) return Object.assign(b.falta, { operacion: true, estado: op.estado, salida: s });
        const notas = s.notas.map(id => this.nota(id)).filter(Boolean);
        return Object.assign(op, { sub: b.sub, contenedor: b.contenedor, notas, perdidas: s.notas.length - notas.length });
      }
      return op;
    }
    /* Los nodos rotos de un lienzo: [{ id, motivo, enPapelera? }] (entradas cuyo destino ya no está y operaciones cuya salida
       tampoco). */
    rotasDe(lid) {
      const r = this.lienzo(lid); if (!r) return [];
      return r.lienzo.nodos.map(n => [n, this.resolverEntrada(n)]).filter(p => p[1].roto)
        .map(([n, x]) => Object.assign({ id: n.id, motivo: x.motivo }, x.enPapelera ? { enPapelera: true } : {}));
    }
    /* **La hoja de un personaje** (1.1.58): lo que se sabe de él es **su biblioteca entera** —las notas del segmento «Hoja de
       personaje» primero (en el orden de su tarjeta) y después las demás, en el suyo—, la misma para la interfaz del lienzo, para
       Claude (`ejecutar_nodo`) y para la firma. Sin crearla: { biblioteca (el sub, o null), hoja (el segmento, o null), notas }. */
    hojaPersonaje(personajeId) {
      const b = this.contenedor(ID_PERSONAJES), s = b && b.subs.find(x => x.lineaId === personajeId);
      if (!s) return { biblioteca: null, hoja: null, notas: [] };
      const hoja = this.etiquetasDe(s.id).find(e => plano(e.nombre) === plano(HOJA_PERSONAJE)) || null;
      const primero = hoja ? this.notasDe(s.id, hoja.id) : [], ya = new Set(primero.map(n => n.id));
      return { biblioteca: s, hoja, notas: primero.concat(this.notasDe(s.id).filter(n => !ya.has(n.id))) };
    }
    /* la pieza de la papelera que se llevó esa nota con ella (una biblioteca, un esquema con su guion, un personaje), o null */
    piezaConNota(id) {
      return this.datos.papelera.find(x => !x.nota && [].concat(x.notas || [], (x.guiones && x.guiones.notas) || []).some(n => n && n.id === id)) || null;
    }
    /* La firma del **contenido** de lo que apunta una entrada (para la huella de C.Lienzo: una operación hecha se ve desactualizada
       si cambia). Solo lo que se lee —títulos, textos, nombres, la estructura de un esquema—, nunca fechas de modificación ni la
       maquetación (el ancho de una columna, el alto de un carril, una trama oculta, el orden de las claves que deja T.Modelo): con
       eso, abrir un esquema en el tablero o ensanchar una columna la marcaban desactualizada y «Pedir todo» la repetía. Una huella
       (FNV-1a de las claves ordenadas, la de C.Lienzo). null en las que llevan el contenido dentro (texto, imagen) y en las
       operaciones (esas ya cuentan en la huella), salvo en una operación con fórmulas: ahí, la de sus fórmulas (1.1.60). Se pasa como `firma` a `completar`, `desactualizado`… : `n => d.firmaEntrada(n)`. */
    firmaEntrada(n) {
      const d = (n && n.datos) || {};
      const nota = x => [x.id, x.etiquetaId || null, String(x.titulo || ''), huellaTexto(x.html)];
      switch (n && n.tipo) {
        case 'nota': { const x = this.nota(d.notaId); return x ? huella(['n', x.subId || null, nota(x)]) : 'roto'; }
        case 'segmento': {
          if (!this.sub(d.subId)) return 'roto';
          const e = d.etiquetaId ? this.etiqueta(d.etiquetaId) : null;
          if (d.etiquetaId && !e) return 'roto';
          return huella(['s', e ? e.nombre : '', this.notasDe(d.subId, d.etiquetaId || null).map(nota)]);
        }
        case 'biblioteca': {
          if (!this.sub(d.subId)) return 'roto';
          return huella(['b', this.etiquetasDe(d.subId).map(e => [e.id, e.nombre]), this.notasDe(d.subId).map(nota)]);
        }
        case 'esquema': {
          const e = this.esquema(d.eid); if (!e) return 'roto';
          const doc = this.documentoEsquema(d.eid);
          return huella(['e', contenidoEsquema(e.esquema.datos), doc ? huellaTexto(doc.html) : null]);
        }
        case 'personaje': {
          const p = this.personaje(d.personajeId); if (!p) return 'roto';
          return huella(['p', p.nombre, p.color, this.hojaPersonaje(p.id).notas.map(nota)]);
        }
        /* una operación con fórmulas (1.1.60): el título y el texto de cada una, en su orden (C.Lienzo la guarda aparte, `huella.
           formulas`, y si cambia la operación se ve desactualizada por su instrucción) */
        default: return Array.isArray(d.formulas) && d.formulas.length
          ? huella(['f', this.resolverFormulas(d.formulas).map(f => (f.rota ? [f.id, 'roto'] : [f.id, f.titulo, f.texto]))]) : null;
      }
    }
    /* La firma de este proyecto, lista para C.Lienzo: `m.desactualizadas(d.firma())`. */
    firma() { return n => this.firmaEntrada(n); }

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
    /* «Mover a la izquierda/derecha» del menú de un segmento: cambia el sitio con su vecino **de su misma sección y en el
       orden que se ve**. En la sección de partida manda `ordenSegmentos` (sin contar la bandeja) y se intercambian ahí
       también; antes solo se tocaba `datos.etiquetas`, así que en cuanto se había arrastrado una tarjeta no pasaba nada, y
       con secciones cambiaba el sitio con un segmento de otra. */
    moverEtiqueta(id, salto) {
      const e = this.etiqueta(id); if (!e) return no('Ese segmento ya no existe');
      const r = this.sub(e.subId), sec = e.seccionId || null;
      let grupo = this.etiquetasDe(e.subId, sec), orden = null;
      if (!sec) {
        orden = this.ordenSegmentos(e.subId, ['bandeja', ...grupo.map(x => 'etq:' + x.id)]);
        const porClave = new Map(grupo.map(x => ['etq:' + x.id, x]));
        grupo = orden.filter(k => porClave.has(k)).map(k => porClave.get(k));
      }
      const i = grupo.indexOf(e), j = i + (salto < 0 ? -1 : 1);
      if (j < 0 || j >= grupo.length) return no('Ya está en el extremo');
      const otra = grupo[j], todas = this.datos.etiquetas;
      const a = todas.indexOf(e), b = todas.indexOf(otra); todas[a] = otra; todas[b] = e;
      if (orden && r && r.sub.ordenSegmentos) {
        const x = orden.indexOf('etq:' + e.id), y = orden.indexOf('etq:' + otra.id);
        orden[x] = 'etq:' + otra.id; orden[y] = 'etq:' + e.id; r.sub.ordenSegmentos = orden;
      }
      this._tocarSub(e.subId);
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
    /* `op.arriba`: la primera de su bandeja o de su segmento (si no, al final). `op.texto`: nace con ese texto plano, un párrafo
       por renglón (lo que se escribe en una fórmula; en la de las fórmulas, el Markdown se aplana: `op.markdown`). */
    crearNota(subId, etiquetaId, titulo, op) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const e = etiquetaId ? this.etiqueta(etiquetaId) : null;
      if (etiquetaId && (!e || e.subId !== subId)) return no('Ese segmento no es de esta biblioteca');
      const guiones = !!r.sub.guionEid;
      const t = this.ahora(), F = op && typeof op.texto === 'string' ? Fm() : null;
      const html = F ? F.htmlDeTexto(op.markdown ? F.aplanar(op.texto) : op.texto) : '';
      const n = { id: this.idNuevo(), subId, etiquetaId: etiquetaId || null,
                  titulo: this._libre(texto(titulo, 'Sin título'), this.notasDe(subId).map(x => x.titulo)), html, characters: {}, creado: t, modificado: t,
                  ...(guiones ? { guion: { eid: null, generado: 0 } } : {}) };
      const primera = op && op.arriba ? this.datos.notas.findIndex(x => x.subId === subId && (x.etiquetaId || null) === n.etiquetaId) : -1;
      if (primera >= 0) this.datos.notas.splice(primera, 0, n); else this.datos.notas.push(n);
      this._tocarSub(subId);
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
      const origen = n.subId;
      n.subId = destino; n.etiquetaId = etiquetaId || null;
      const resto = this.datos.notas.filter(x => x !== n);
      const ref = antesDe && antesDe !== id ? resto.find(x => x.id === antesDe && x.subId === destino && x.etiquetaId === n.etiquetaId) : null;
      resto.splice(ref ? resto.indexOf(ref) : resto.length, 0, n); this.datos.notas = resto;
      this._tocarSub(destino); if (origen !== destino) this._tocarSub(origen);   // la biblioteca de la que sale también cambia
      /* entre una especial (las plantillas, las fórmulas) y una biblioteca normal se mueve como cualquier nota (como en ClapBook),
         pero sus personajes entran en el elenco al salir de ahí y dejan de contar al entrar; y una nota que entra en las fórmulas
         se queda en texto plano (una fórmula no lleva formato) */
      if (destino === ID_BIB_FORMULAS && origen !== ID_BIB_FORMULAS) this._aTextoPlano(n);
      if (especialDeBib(origen) && !especialDeBib(destino)) this.sincronizarElenco(n.characters);
      else if (especialDeBib(destino) && !especialDeBib(origen)) this.podarElenco();
      return si({ nota: n });
    }
    /* ---------- papelera ---------- */
    /* La entrada de la papelera recuerda su segmento (`etiquetaId`) y la nota que la seguía en su mismo sitio (`antesDe`,
       misma biblioteca y mismo segmento; nada si era la última): así restaurarla, también con el «Deshacer» del aviso, la
       deja donde estaba. Antes volvía siempre a la bandeja. */
    tirarNota(id) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const r = this.sub(n.subId);
      const etiquetaId = n.etiquetaId || null, notas = this.datos.notas, i = notas.indexOf(n);
      const aqui = x => x.subId === n.subId && (x.etiquetaId || null) === etiquetaId;
      /* sus vecinas: la que la seguía y la que iba delante; si una de ellas se tiró antes (y era justo la de al lado), esa, que
         está más cerca que la siguiente a la vista (se tiraron varias seguidas de abajo arriba) */
      const enPap = campo => this.datos.papelera.find(x => x.nota && x.origenId === n.subId && (x.etiquetaId || null) === etiquetaId && x[campo] === n.id);
      const sigP = enPap('despuesDe'), antP = enPap('antesDe');
      const sig = sigP ? sigP.nota : notas.slice(i + 1).find(aqui), ant = antP ? antP.nota : notas.slice(0, i).reverse().find(aqui);
      this.datos.notas = notas.filter(x => x !== n);
      n.etiquetaId = null;
      const origenNombre = !r ? '' : r.contenedor.especial ? ESPECIALES[r.contenedor.especial].nombre : r.contenedor.nombre + ' › ' + r.sub.nombre;
      this.datos.papelera.push(Object.assign({ nota: n, origenId: n.subId, origenNombre, eliminadoEn: this.ahora() },
        etiquetaId ? { etiquetaId } : {}, sig ? { antesDe: sig.id } : {}, ant ? { despuesDe: ant.id } : {}));
      if (r) this._tocarSub(n.subId);
      return si({ nota: n, aviso: '«' + n.titulo + '» va a la papelera' });
    }
    /* Vuelve a su biblioteca de origen (o a la que se indique, o a la primera que haya a la vista). En la de origen, a su
       segmento si sigue ahí (si no, a la bandeja) y delante de la nota que la seguía si sigue en ese sitio (si no, al
       final); en otra biblioteca, a la bandeja y al final. `subId` puede ser también un contenedor: va a su primera
       biblioteca del árbol (`primeraBiblioteca`, nunca la oculta de los guiones). */
    restaurarNota(id, subId) {
      const x = this.enPapelera(id); if (!x) return no('Esa nota no está en la papelera');
      if (especialDeBib(x.origenId) && !subId) this.asegurarEspecial(especialDeBib(x.origenId));   // una plantilla vuelve a las plantillas; una fórmula, a las fórmulas
      const c = subId && this.contenedor(subId), pb = c && this.primeraBiblioteca(c.id);
      let destino = (subId && this.sub(subId)) || (pb && this.sub(pb.id)) || this.sub(x.origenId) || null;
      if (!destino) { const b = this.todasLasBibliotecas()[0]; destino = b ? this.sub(b.sub.id) : null; }
      if (!destino) return no('No hay ninguna biblioteca donde restaurarla');
      this.datos.papelera = this.datos.papelera.filter(y => y !== x);
      const aOrigen = destino.sub.id === x.origenId, e = aOrigen && x.etiquetaId ? this.etiqueta(x.etiquetaId) : null;
      x.nota.subId = destino.sub.id; x.nota.etiquetaId = e && e.subId === destino.sub.id ? e.id : null; x.nota.modificado = this.ahora();
      /* su sitio: delante de la primera de las que la seguían que esté a la vista, o detrás de la última de las que iban delante; las
         que siguen en la papelera se atraviesan (se tiraron varias seguidas y se restauran en cualquier orden): de cada entrada de su
         mismo sitio se siguen `antesDe` y `despuesDe`, y también las entradas que la señalan a ella. Con el `etiquetaId` guardado en la
         entrada, no el ya resuelto: si el segmento se borró, la cadena se corta igual. Sin nada a la vista, al final. */
      let pos = this.datos.notas.length;
      if (aOrigen) {
        const mismoSitio = p => p && p.nota && p.origenId === x.origenId && (p.etiquetaId || null) === (x.etiquetaId || null);
        const pap = this.datos.papelera.filter(mismoSitio);
        const presente = id => this.datos.notas.find(y => y.id === id && y.subId === x.nota.subId && (y.etiquetaId || null) === x.nota.etiquetaId) || null;
        const alcanza = hacia => {                              // 'antesDe': las que van detrás; 'despuesDe': las de delante
          const otro = hacia === 'antesDe' ? 'despuesDe' : 'antesDe', hallados = [], vistos = new Set([x.nota.id]), cola = [x];
          while (cola.length) {
            const e = cola.shift();
            [e[hacia], ...pap.filter(p => p[otro] === e.nota.id).map(p => p.nota.id)].forEach(id => {
              if (!id || vistos.has(id)) return; vistos.add(id);
              const y = presente(id); if (y) { hallados.push(this.datos.notas.indexOf(y)); return; }
              const p = pap.find(q => q.nota.id === id); if (p) cola.push(p);
            });
          }
          return hallados;
        };
        const detras = alcanza('antesDe'), delante = detras.length ? [] : alcanza('despuesDe');
        if (detras.length) pos = Math.min(...detras); else if (delante.length) pos = Math.max(...delante) + 1;
      }
      this.datos.notas.splice(pos, 0, x.nota); this._tocarSub(destino.sub.id);
      if (destino.sub.id === ID_BIB_FORMULAS && x.origenId !== ID_BIB_FORMULAS) this._aTextoPlano(x.nota);   // pedida ahí a mano: sin formato
      return si({ nota: x.nota, sub: destino.sub, contenedor: destino.contenedor, aviso: '«' + x.nota.titulo + '» vuelve a «' + (destino.contenedor.especial ? ESPECIALES[destino.contenedor.especial].nombre : destino.contenedor.nombre + ' › ' + destino.sub.nombre) + '»' });
    }
    eliminarDefinitivo(id) {
      const x = this.enPapelera(id) || this.piezaEnPapelera(id); if (!x) return no('Eso no está en la papelera');
      this.datos.papelera = this.datos.papelera.filter(y => y !== x);
      if (x.tipo === 'sub') this._podarConexiones();              // sus conexiones se van con ella
      return si({ nota: x.nota, aviso: '«' + nombreEnPapelera(x) + '» eliminado del todo' });
    }
    vaciarPapelera() { const n = this.datos.papelera.length; this.datos.papelera = []; this._podarConexiones(); return si({ eliminadas: n, aviso: n ? 'Papelera vaciada · ' + n + (n === 1 ? ' elemento' : ' elementos') : 'La papelera ya estaba vacía' }); }
    /* Un esquema, una biblioteca o un personaje vuelven de la papelera: a su contenedor (si ya no está, a uno con su nombre),
       a su carpeta y a su grupo si siguen ahí, con un nombre libre. Un personaje recupera los carriles que sigan sin
       personaje (`carriles`: los que vuelven a ser suyos). */
    restaurarPieza(id) {
      const x = this.piezaEnPapelera(id); if (!x) return no('Eso no está en la papelera');
      if (x.tipo === 'personaje') {
        const pj = x.personaje, k = clavePersonaje(pj.nombre);
        if (this.datos.elenco.some(q => clavePersonaje(q.nombre) === k)) return no('Ya hay un personaje «' + pj.nombre + '»: renómbralo antes de restaurar este');
        const p = clonar(pj);
        if (p.carpetaId && !this.datos.carpetasElenco.some(q => q.id === p.carpetaId)) delete p.carpetaId;
        this.datos.elenco.push(p);
        if (x.sub) this._meterBiblioteca(this.personajes(true), x);
        const carriles = (x.carriles || []).filter(cr => {
          const r = this.esquema(cr.eid), l = r && (r.esquema.datos.lineas || []).find(q => q.id === cr.lineaId);
          if (!l || l.personaje) return false;
          l.personaje = p.id; l.nombre = p.nombre; this._tocar(r.contenedor); return true;
        });
        if (x.grupoId && this.grupo(x.grupoId) && this.grupo(x.grupoId).ambito === ELENCO) this.aGrupo(x.grupoId, p.id);
        this.datos.papelera = this.datos.papelera.filter(y => y !== x);
        return si({ personaje: p, carriles, aviso: '«' + p.nombre + '» vuelve a Personajes' + (carriles.length ? ' con ' + carriles.length + (carriles.length === 1 ? ' carril' : ' carriles') : '') });
      }
      let c = this.contenedor(x.origenId)
        || (x.origenId === ID_ESQUEMAS ? this.esquemasPersonajes(true) : null)
        || this.datos.contenedores.find(q => !q.oculto && plano(q.nombre) === plano(x.origenNombre));
      if (!c) c = this.crearContenedor(x.origenNombre || NOMBRE_GLOBAL, { vacio: true }).contenedor;
      const carpeta = x.carpetaId && c.carpetas.some(q => q.id === x.carpetaId) ? x.carpetaId : null;
      let pieza;
      if (x.tipo === 'esquema') {
        pieza = Object.assign(x.esquema, { nombre: this._libre(x.esquema.nombre, c.esquemas.map(e => e.nombre)) });
        c.esquemas.push(pieza);
        if (x.guiones) this._meterBiblioteca(c, Object.assign(x.guiones, { sub: Object.assign(x.guiones.sub, { guionEid: pieza.id }) }));
      } else if (x.tipo === 'lienzo') {
        pieza = Object.assign(x.lienzo, { nombre: this._libre(x.lienzo.nombre, (c.lienzos || []).map(l => l.nombre)) });
        (c.lienzos = c.lienzos || []).push(pieza);
      } else {
        pieza = Object.assign(x.sub, { nombre: this._libre(x.sub.nombre, c.subs.map(q => q.nombre)) });
        this._meterBiblioteca(c, x);
      }
      if (carpeta) pieza.carpetaId = carpeta; else delete pieza.carpetaId;
      if (x.grupoId) { const g = this.grupo(x.grupoId); if (g && g.ambito === c.id) this.aGrupo(x.grupoId, pieza.id); }
      this.datos.papelera = this.datos.papelera.filter(y => y !== x);
      this._tocar(c);
      return si({ contenedor: c, tipo: x.tipo, [x.tipo === 'esquema' ? 'esquema' : x.tipo === 'lienzo' ? 'lienzo' : 'sub']: pieza, aviso: '«' + pieza.nombre + '» vuelve a «' + c.nombre + '»' });
    }
    /* Tira las notas que lleven más de `dias` en la papelera. Se llama una vez al arrancar. */
    purgarPapelera(dias) {
      const limite = this.ahora() - (dias || DIAS_PAPELERA) * 864e5;
      const antes = this.datos.papelera.length;
      this.datos.papelera = this.datos.papelera.filter(x => x.eliminadoEn >= limite);
      if (antes !== this.datos.papelera.length) this._podarConexiones();
      return si({ purgadas: antes - this.datos.papelera.length });
    }
    eliminarNota(id) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      this.datos.notas = this.datos.notas.filter(x => x !== n); this._tocarSub(n.subId);
      return si({ nota: n, aviso: '«' + n.titulo + '» eliminada' });
    }
    /* Lo que devuelve Ed.document.get(): { title, html, characters }. Solo cuenta si cambió. */
    /* Una fórmula se guarda siempre en texto plano: lo que llegue pasa a párrafos simples (`C.formulas.htmlFormula`) y sin
       personajes; así el HTML que se compara es el mismo que se guarda y dos guardados iguales no cuentan como cambio. */
    guardarNota(id, doc) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      if (!doc || typeof doc.html !== 'string') return no('Eso no es un documento válido');
      const formula = n.subId === ID_BIB_FORMULAS;
      const titulo = texto(doc.title, n.titulo), characters = !formula && doc.characters && typeof doc.characters === 'object' ? doc.characters : {};
      const html = formula ? Fm().htmlFormula(doc.html) : doc.html;
      const cambio = titulo !== n.titulo || html !== n.html || JSON.stringify(characters) !== JSON.stringify(n.characters);
      if (!cambio) return si({ nota: n, cambio: false });
      n.titulo = titulo; n.html = html; n.characters = clonar(characters); n.modificado = this.ahora();
      this._tocarSub(n.subId);
      if (!especialDeBib(n.subId)) this.sincronizarElenco(n.characters);   // los personajes de una plantilla no son del guion
      return si({ nota: n, cambio: true });
    }

    /* ---------- las bibliotecas especiales: plantillas (1.1.56, de ClapBook) y fórmulas (1.1.60) ---------- */
    /* Las notas de verdad: sin las de las bibliotecas especiales (plantillas y fórmulas). */
    notasNormales() { return this.datos.notas.filter(n => !especialDeBib(n.subId)); }
    /* ¿es una biblioteca especial (la de las plantillas o la de las fórmulas)? */
    esEspecial(subId) { return !!especialDeBib(subId); }
    /* la clase de la especial de esa id (su contenedor o su biblioteca): 'plantillas', 'formulas' o null */
    especialDe(id) { return especialDe(id); }
    esPlantilla(n) { const x = typeof n === 'string' ? this.nota(n) : n; return !!x && x.subId === ID_BIB_PLANTILLAS; }
    esFormula(n) { const x = typeof n === 'string' ? this.nota(n) : n; return !!x && x.subId === ID_BIB_FORMULAS; }
    /* la biblioteca de una especial ({ contenedor, sub }), o null si aún no se creó */
    bibliotecaEspecial(k) { const E = ESPECIALES[k]; if (!E) return null; const r = this.sub(E.bib); return r && r.contenedor.especial === k ? r : null; }
    bibliotecaPlantillas() { return this.bibliotecaEspecial('plantillas'); }
    bibliotecaFormulas() { return this.bibliotecaEspecial('formulas'); }
    /* la crea si no está (el contenedor, al final; o la biblioteca, si el contenedor se quedó sin ella) */
    asegurarEspecial(k) {
      const E = ESPECIALES[k]; if (!E) return null;
      if (this.bibliotecaEspecial(k)) return this.bibliotecaEspecial(k);
      const t = this.ahora();
      const c = this.contenedor(E.id);
      if (c && c.especial === k) c.subs.unshift(contenedorEspecial(k, t).subs[0]);
      else if (!c) this.datos.contenedores.push(contenedorEspecial(k, t));
      return this.bibliotecaEspecial(k);
    }
    asegurarPlantillas() { return this.asegurarEspecial('plantillas'); }
    asegurarFormulas() { return this.asegurarEspecial('formulas'); }
    /* Las notas de una especial, en el orden de su tablero (la sección de partida con la bandeja y sus segmentos en su orden, y
       luego las demás secciones con los suyos). */
    notasEspecial(k) {
      const r = this.bibliotecaEspecial(k); if (!r) return [];
      const sid = r.sub.id, deP = this.etiquetasDe(sid, null);
      const claves = this.ordenSegmentos(sid, ['bandeja', ...deP.map(e => 'etq:' + e.id)]).map(k2 => (k2 === 'bandeja' ? null : k2.slice(4)));
      this.seccionesDe(sid).forEach(q => this.etiquetasDe(sid, q.id).forEach(e => claves.push(e.id)));
      this.etiquetasDe(sid).forEach(e => { if (!claves.includes(e.id)) claves.push(e.id); });   // uno con una sección que ya no está
      return claves.flatMap(q => this.notasDe(sid, q));
    }
    plantillas() { return this.notasEspecial('plantillas'); }
    formulas() { return this.notasEspecial('formulas'); }
    /* Guarda una copia de una nota como plantilla (en la bandeja de las plantillas o en su segmento `etiquetaId`), con su texto,
       sus personajes (`characters`) y su color. La nota no se toca. */
    guardarComoPlantilla(id, etiquetaId) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const r = this.asegurarPlantillas();
      const x = this.crearNota(r.sub.id, etiquetaId || null, n.titulo); if (!x.ok) return x;
      x.nota.html = n.html; x.nota.characters = clonar(n.characters || {});
      if (n.color) x.nota.color = n.color;
      return si({ nota: x.nota, aviso: 'Plantilla «' + x.nota.titulo + '» guardada' });
    }
    /* Una nota nueva a partir de una plantilla, en `subId` (su bandeja o el segmento `etiquetaId`; nunca en la de las plantillas):
       su HTML con las variables rellenas ({{titulo}}, {{fecha}}, {{proyecto}}…; plantillas.js), sus personajes y su color. El
       título: `op.titulo` si se da, siempre (también sobre un título de plantilla con variables); si no, el de la plantilla con
       sus variables rellenas si lleva alguna («Reunión {{fecha}}»); si no, «Sin título». Sin repetir el de otra nota de la
       biblioteca (`_libre`, en `crearNota`), y ese título final es el que rellena {{titulo}} en el texto.
       `op = { titulo, proyecto, arriba }`. Devuelve también dónde se queda el cursor ({{cursor}}: { bloque, caracter }), o null. */
    crearDesdePlantilla(pid, subId, etiquetaId, op) {
      op = op || {};
      const p = this.nota(pid); if (!p || !this.esPlantilla(p)) return no('Esa plantilla ya no existe');
      if (!subId || this.esEspecial(subId)) return no('Una nota nueva no va en la biblioteca de las plantillas');
      if (!this.sub(subId)) return no('Esa biblioteca ya no existe');
      if (this.esGuiones(subId)) return no('Ahí solo van los guiones de ese esquema');
      const P = C.plantillas || require('./plantillas.js').plantillas, ahora = new Date(this.ahora());
      const pedido = texto(op.titulo, '');
      const base = pedido || (P.tieneVariables(p.titulo) ? P.rellenar(p.titulo, { ahora, titulo: '', proyecto: op.proyecto }).texto : 'Sin título');
      const r = this.crearNota(subId, etiquetaId || null, base, { arriba: !!op.arriba }); if (!r.ok) return r;
      const x = P.rellenarHtml(p.html, { ahora, titulo: r.nota.titulo, proyecto: op.proyecto });
      /* detrás de un recuadro final, la línea vacía que pondría el editor al abrirla (si no, abrirla ya sería un cambio) */
      r.nota.html = C.conversor && C.conversor.conLineaFinal ? C.conversor.conLineaFinal(x.html) : x.html; r.nota.characters = clonar(p.characters || {});
      if (p.color) r.nota.color = p.color;
      this.sincronizarElenco(r.nota.characters);               // ahora sí son personajes del guion
      return si({ nota: r.nota, cursor: x.cursor, plantilla: p });
    }

    /* ---------- fórmulas (1.1.60): prompts reutilizables para las operaciones de IA del lienzo ----------
       Leo: «que se puedan agregar notas que solo tengan texto y sirvan como prompts reutilizables en los bloques del lienzo que
       llaman a la IA… algo parecido a las skills». Son las notas de la biblioteca especial «Fórmulas» (`formulas:biblioteca`), en
       **texto plano**: su HTML son párrafos simples (`guardarNota` lo deja así). Una operación del lienzo las elige en
       `nodo.datos.formulas = [notaId…]` (js/claquedraw/lienzo-modelo.js) y se combinan con lo escrito con `C.formulas.componer`. */
    /* deja una nota en texto plano (una que entra en las fórmulas) */
    _aTextoPlano(n) { n.html = Fm().htmlFormula(n.html); n.characters = {}; }
    /* El texto plano de una fórmula, o null si esa nota no existe o no es una fórmula. */
    textoFormula(id) { const n = this.nota(id); return n && this.esFormula(n) ? Fm().textoDeHtml(n.html) : null; }
    /* **La memoria de estilo del proyecto** (1.1.60, js/claquedraw/memoria.js): las reglas de tono y forma que la IA aprende de Leo en
       este proyecto (las generales van en los datos de la app, no aquí). La clave solo existe si hay alguna. */
    memoriaEstilo() { return Array.isArray(this.datos.memoriaEstilo) ? this.datos.memoriaEstilo : []; }
    /* la deja como `lista` (saneada, con sus topes); → true si cambió */
    fijarMemoriaEstilo(lista) {
      const l = Me() ? Me().sanear(lista) : (Array.isArray(lista) ? lista : []);
      const antes = JSON.stringify(this.memoriaEstilo());
      if (JSON.stringify(l) === antes) return false;
      if (l.length) this.datos.memoriaEstilo = l; else delete this.datos.memoriaEstilo;
      return true;
    }
    /* **Los mods del teatro de duendes** (1.1.63, js/claquedraw/teatro-mods.js): escenarios, vestuarios, objetos, máscaras y músicas
       que Claude añade para que la obra se parezca más al guion. La clave solo existe si hay alguno. */
    teatro() { return this.datos.teatro && typeof this.datos.teatro === 'object' ? this.datos.teatro : {}; }
    fijarTeatro(t) {
      const x = Tm() ? Tm().sanear(t) : (t || {});
      if (JSON.stringify(x) === JSON.stringify(this.teatro())) return false;
      if (Object.keys(x).length) this.datos.teatro = x; else delete this.datos.teatro;
      return true;
    }
    /* Guarda como fórmula (en la bandeja de las fórmulas o en su segmento `etiquetaId`) **el texto plano** de una nota, con su
       título y su color. La nota no se toca. `op.arriba`: la primera de su sitio. */
    guardarComoFormula(id, etiquetaId, op) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const r = this.asegurarFormulas();
      const x = this.crearNota(r.sub.id, etiquetaId || null, n.titulo, { texto: Fm().textoDeHtml(n.html), arriba: !!(op && op.arriba) }); if (!x.ok) return x;
      if (n.color) x.nota.color = n.color;
      return si({ nota: x.nota, aviso: 'Fórmula «' + x.nota.titulo + '» guardada' });
    }
    /* Reescribe el texto de una fórmula (texto plano; con `op.markdown`, lo que venga en Markdown se aplana) y, si se da, su título. */
    escribirFormula(id, textoPlano, op) {
      const n = this.nota(id); if (!n) return no('Esa fórmula ya no existe');
      if (!this.esFormula(n)) return no('«' + n.titulo + '» no es una fórmula');
      const F = Fm(), t = op && op.markdown ? F.aplanar(textoPlano) : textoPlano;
      return this.guardarNota(id, { title: op && op.titulo !== undefined ? op.titulo : n.titulo, html: F.htmlDeTexto(t), characters: {} });
    }
    /* Lo que son unas ids de fórmulas, en su orden: { id, titulo, texto, etiquetaId } o, si ya no está, { id, rota: true, motivo,
       titulo?, enPapelera? } (lo que espera `C.formulas.componer`). Nunca cambia la lista. */
    resolverFormulas(ids) {
      return (Array.isArray(ids) ? ids : []).map(v => {
        const id = String(v ?? ''), n = id && this.nota(id);
        if (n && this.esFormula(n)) return { id, titulo: n.titulo, texto: Fm().textoDeHtml(n.html), etiquetaId: n.etiquetaId || null };
        const p = id && this.enPapelera(id);
        if (p && p.origenId === ID_BIB_FORMULAS) return { id, rota: true, titulo: p.nota.titulo, motivo: 'La fórmula «' + p.nota.titulo + '» está en la papelera', enPapelera: true };
        if (n) return { id, rota: true, titulo: n.titulo, motivo: '«' + n.titulo + '» ya no es una fórmula' };
        return { id, rota: true, motivo: 'Esa fórmula ya no existe' };
      });
    }
    /* La instrucción de una operación del lienzo con sus fórmulas (`nodo` o sus `datos`): lo de `C.formulas.componer` —{ texto,
       partes, rotas, hueco }— más `formulas`, lo resuelto. Sin fórmulas, `texto` es la instrucción tal cual. */
    instruccionCompuesta(nodo) {
      const d = (nodo && (nodo.datos || nodo)) || {}, formulas = this.resolverFormulas(d.formulas);
      return Object.assign(Fm().componer(formulas, d.instruccion), { formulas });
    }

    /* ---------- elenco: los personajes del guion ---------- */
    elenco() { return this.datos.elenco.slice(); }
    personaje(id) { return this.datos.elenco.find(p => p.id === id) || null; }
    /* Cada documento con texto del guion: las notas de las bibliotecas (y de la papelera) y las de los nodos.
       Las plantillas no son documentos del guion: para contar (menciones, apariciones, elenco) no entran, ni las tiradas.
       Pero lo que se **reescribe** (renombrar o recolorear un personaje) sí las lleva, `conPlantillas`, vivas y en la
       papelera: si no, una plantilla con MARA resucitaba el nombre viejo al usarla después de renombrarlo a MARÍA. */
    _documentosTexto(conPapelera, conPlantillas) {
      const lista = [];
      (conPlantillas ? this.datos.notas : this.notasNormales()).forEach(n => lista.push({ doc: n, tipo: 'nota', id: n.id, titulo: n.titulo, modificado: n.modificado || null, ruta: () => { const r = this.sub(n.subId); return r ? r.contenedor.nombre + ' › ' + r.sub.nombre : ''; } }));
      if (conPapelera) this.datos.papelera.forEach(x => {
        if (x.nota && (conPlantillas || !especialDeBib(x.nota.subId))) lista.push({ doc: x.nota, tipo: 'papelera', id: x.nota.id });
        [].concat(x.notas || [], (x.guiones && x.guiones.notas) || []).forEach(n => lista.push({ doc: n, tipo: 'papelera', id: n.id }));   // las de un esquema, una biblioteca o un personaje tirados
      });
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
      this._documentosTexto(true, true).forEach(x => {
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
      this._documentosTexto(true, true).forEach(x => Object.values(x.doc.characters || {}).forEach(r => { if (clavePersonaje(r.name) === k) r.color = p.color; }));
      return si({ personaje: p });
    }
    /* No se elimina si alguna nota lo nombra. Sus carriles en los esquemas quedan sin personaje y su
       biblioteca, con sus notas, va a la papelera. */
    eliminarPersonaje(id) {
      const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
      const m = this.menciones(id);
      if (m.length) return no('«' + p.nombre + '» aparece en ' + m.length + (m.length === 1 ? ' nota' : ' notas') + ': quítalo de ellas antes de eliminarlo');
      /* a la papelera con su biblioteca y la lista de sus carriles, para devolvérselos al restaurarlo (Leo, 18-09-2026) */
      const carriles = [];
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => { if (l.personaje === id) { carriles.push({ eid: e.id, lineaId: l.id }); delete l.personaje; l.nombre = 'Sin personaje'; } })));
      const g = this.grupoDe(id);
      this.sacarDeGrupo(id);
      const b = this.contenedor(ID_PERSONAJES), s = b && b.subs.find(x => x.lineaId === id);
      const bibl = s ? this._sacarBiblioteca(b, s) : {};
      this.datos.elenco = this.datos.elenco.filter(x => x !== p);
      const pj = { id: p.id, nombre: p.nombre, color: p.color, ...(p.carpetaId ? { carpetaId: p.carpetaId } : {}) };
      this.datos.papelera.push(Object.assign({ tipo: 'personaje', personaje: pj, carriles, origenId: ID_PERSONAJES, origenNombre: 'Personajes', eliminadoEn: this.ahora() }, g ? { grupoId: g.grupo.id } : {}, bibl));
      return si({ personaje: p, carriles, aviso: '«' + p.nombre + '» va a la papelera' });
    }
  }

  Object.assign(C, { Documentos, nombreEnPapelera, iniciales, ID_PERSONAJES, ID_ESQUEMAS_PERSONAJE: ID_ESQUEMAS, ID_PLANTILLAS, ID_BIB_PLANTILLAS, NOMBRE_PLANTILLAS, ID_FORMULAS, ID_BIB_FORMULAS, NOMBRE_FORMULAS, ESPECIALES, especialDe, COLORES_CARPETA, HOJA_PERSONAJE, TONOS_NOTA: TONOS, ELENCO_CARPETAS: ELENCO, clavePersonaje, normalizarDocumentos: normalizar, PALETA_ETIQUETAS: PALETA, ORDENES_DOCUMENTOS: ORDENES, NOMBRE_GLOBAL, NOMBRE_SUB, DIAS_PAPELERA });
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
