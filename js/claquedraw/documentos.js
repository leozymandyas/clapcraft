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
   **Personajes** (Leo, 14-09-2026): un contenedor oculto (`oculto`, id `personajes`) que no sale en el
   árbol, con **un tablero por personaje** (`esquemaPersonaje`, id `personajes:esquema:<personaje>`: su
   carril principal es el personaje, fijo; los otros carriles eligen personaje; los actos son momentos) y
   una biblioteca por personaje (`sub.lineaId`); `personajes(crear)` da el contenedor y
   `bibliotecaPersonaje` la biblioteca de un personaje.
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

  /* Los 16 pares claro/oscuro del diseño (los mismos de los personajes del editor). */
  const PALETA = [
    ['Azul', '#DFE8FF', '#26417F'], ['Verde', '#E2F0E0', '#2C5730'], ['Terracota', '#FBE6DA', '#8A4320'], ['Violeta', '#EDE0F7', '#563180'],
    ['Ámbar', '#FBF0D2', '#7A5410'], ['Rosa', '#FBDFE6', '#8A2B47'], ['Teal', '#D8EFEE', '#1F5B58'], ['Oliva', '#E8EED3', '#4E5C1E'],
    ['Índigo', '#DEE0F8', '#333B85'], ['Coral', '#FDE2DC', '#8F3A2C'], ['Ciruela', '#F3DCEF', '#71306A'], ['Arena', '#EFE7DA', '#6B5638'],
    ['Cielo', '#D9ECFA', '#1F5476'], ['Lima', '#E6F2CF', '#4A6013'], ['Óxido', '#F8E3CD', '#835012'], ['Grafito', '#E4E4E2', '#3B3B39']
  ];
  const ORDENES = ['manual', 'az', 'za', 'modificado'];
  const NOMBRE_GLOBAL = 'Capítulo';                            // nombre del contenedor que estrena un guion
  const NOMBRE_SUB = 'Biblioteca';                             // nombre del subcontenedor (biblioteca) que estrena un contenedor
  const DIAS_PAPELERA = 30;
  const ID_PERSONAJES = 'personajes';                          // el contenedor oculto de Personajes

  /* ---------- personajes del editor: nombres y bloques `p.sp-character` en el HTML de las notas ---------- */
  /* «MARA (V.O.)» y «Mara» son el mismo personaje (la misma clave que js/characters.js) */
  const limpio = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  const sinSufijo = s => limpio(s).replace(/\s*\([^)]*\)\s*$/, '');
  const clavePersonaje = s => sinSufijo(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const RE_PERSONAJE = /(<p\b[^>]*\bclass="[^"]*\bsp-character\b[^"]*"[^>]*>)([\s\S]*?)(<\/p>)/gi;
  const textoDe = h => String(h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mencionaEn = (html, k) => { let hay = false; String(html || '').replace(RE_PERSONAJE, (t, a, dentro) => { if (clavePersonaje(textoDe(dentro)) === k) hay = true; return t; }); return hay; };
  /* cambia el nombre en los bloques de ese personaje, conservando la extensión («(V.O.)») */
  const renombrarEn = (html, k, nombre) => String(html || '').replace(RE_PERSONAJE, (t, a, dentro, c) => {
    const txt = textoDe(dentro); if (clavePersonaje(txt) !== k) return t;
    const suf = (limpio(txt).match(/\s*\([^)]*\)\s*$/) || [''])[0];
    return a + escHtml(nombre + suf) + c;
  });

  const clonar = d => JSON.parse(JSON.stringify(d));
  const no = aviso => ({ ok: false, aviso });
  const si = extra => Object.assign({ ok: true }, extra || {});
  const plano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  const texto = (v, defecto) => { const s = String(v ?? '').trim(); return s || defecto; };
  const color = v => { const n = Math.round(+v); return n >= 0 && n < PALETA.length ? n : 0; };
  const docDe = n => n && typeof n === 'object' && typeof n.html === 'string'
    ? { title: texto(n.title, ''), html: n.html, characters: n.characters && typeof n.characters === 'object' ? clonar(n.characters) : {} } : null;

  /* Un esquema de un contenedor: un tablero (basta con que traiga `lineas`) y las notas de sus nodos. */
  function sanearEsquema(e, id, nombre) {
    if (!e || typeof e !== 'object' || !e.datos || typeof e.datos !== 'object' || !Array.isArray(e.datos.lineas)) return null;
    const notas = {};
    if (e.notas && typeof e.notas === 'object') Object.keys(e.notas).forEach(k => { const n = docDe(e.notas[k]); if (n) notas[k] = n; });
    return { id, nombre: texto(nombre, 'Esquema'), datos: clonar(e.datos), notas, notaActual: typeof e.notaActual === 'string' ? e.notaActual : null,
             subId: typeof e.subId === 'string' && e.subId ? e.subId : null };
  }

  /* Sanea lo que venga guardado: ids repetidos y huérfanos se descartan, una nota cuya etiqueta ya no
     existe pasa a la bandeja. Entiende las formas anteriores: un `esquema` por contenedor, y
     etiquetas y notas colgadas del contenedor (`contenedorId`) sin subcontenedor, que pasan a un
     subcontenedor «Documentos» creado para ese contenedor. */
  function normalizar(datos) {
    const d = { contenedores: [], etiquetas: [], notas: [], papelera: [], elenco: [], migrado: !!(datos && datos.migrado) };
    const src = datos && typeof datos === 'object' ? datos : {};
    const ids = new Set();
    const subDe = new Map();                                   // subId → contenedorId
    const heredado = new Map();                                // contenedorId → subId del «Documentos» creado para lo antiguo
    (Array.isArray(src.contenedores) ? src.contenedores : []).forEach(c => {
      const id = c && String(c.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      const creado = +c.creado || 0;
      const esquemas = [];
      const fuente = Array.isArray(c.esquemas) ? c.esquemas : (c.esquema ? [Object.assign({ id: id + ':esquema' }, c.esquema)] : []);
      fuente.forEach((e, i) => {
        const eid = e && String(e.id || ''); if (!eid || ids.has(eid)) return;
        const s = sanearEsquema(e, eid, e.nombre || ('Esquema' + (i ? ' ' + (i + 1) : ''))); if (!s) return;
        ids.add(eid); esquemas.push(s);
      });
      const subs = [];
      (Array.isArray(c.subs) ? c.subs : []).forEach(s => {
        const sid = s && String(s.id || ''); if (!sid || ids.has(sid)) return; ids.add(sid);
        subs.push({ id: sid, nombre: texto(s.nombre, NOMBRE_SUB), creado: +s.creado || creado, modificado: +s.modificado || +s.creado || creado,
                    segmentosPrimero: !!s.segmentosPrimero, ...(s.lineaId ? { lineaId: String(s.lineaId) } : {}) });   // por defecto la cronología va arriba (Leo)
        subDe.set(sid, id);
      });
      /* el enlace esquema ↔ documentos: a un subcontenedor del mismo contenedor, uno por esquema */
      const enlazados = new Set();
      esquemas.forEach(e => { if (!e.subId || enlazados.has(e.subId) || !subs.some(s => s.id === e.subId)) e.subId = null; else enlazados.add(e.subId); });
      d.contenedores.push({ id, nombre: texto(c.nombre, 'Contenedor'), fijado: !!c.fijado, plegado: !!c.plegado, creado, modificado: +c.modificado || creado, esquemas, subs, ...(c.oculto ? { oculto: true } : {}) });
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
      d.etiquetas.push({ id, subId, nombre: texto(e.nombre, 'Segmento'), color: color(e.color) });
    });
    const etqs = new Map(d.etiquetas.map(e => [e.id, e]));
    const nota = (n, creado, subId) => ({ id: String(n.id), subId, etiquetaId: null,
      titulo: texto(n.titulo, 'Sin título'), html: typeof n.html === 'string' ? n.html : '',
      characters: n.characters && typeof n.characters === 'object' ? clonar(n.characters) : {}, creado, modificado: +n.modificado || creado });
    (Array.isArray(src.notas) ? src.notas : []).forEach(n => {
      const id = n && String(n.id || ''); if (!id || ids.has(id)) return;
      const subId = subPara(n); if (!subId) return; ids.add(id);
      const x = nota(n, +n.creado || 0, subId);
      const e = n.etiquetaId ? etqs.get(String(n.etiquetaId)) : null;
      if (e && e.subId === subId) x.etiquetaId = e.id;
      d.notas.push(x);
    });
    (Array.isArray(src.papelera) ? src.papelera : []).forEach(x => {
      const n = x && x.nota; const id = n && String(n.id || ''); if (!id || ids.has(id)) return; ids.add(id);
      d.papelera.push({ nota: nota(n, +n.creado || 0, String(n.subId || '')), origenId: String(x.origenId || n.subId || n.contenedorId || ''), origenNombre: texto(x.origenNombre, ''), eliminadoEn: +x.eliminadoEn || 0 });
    });
    /* el elenco: lo guardado y, además, los personajes de los registros de las notas que aún no estén */
    const claves = new Set();
    (Array.isArray(src.elenco) ? src.elenco : []).forEach(p => {
      const id = p && String(p.id || ''), k = p && clavePersonaje(p.nombre); if (!id || !k || claves.has(k) || ids.has(id)) return;
      ids.add(id); claves.add(k); d.elenco.push({ id, nombre: sinSufijo(p.nombre), color: color(p.color), ...(p.auto ? { auto: true } : {}) });
    });
    const deRegistro = ch => Object.values(ch || {}).forEach(r => {
      const k = r && clavePersonaje(r.name); if (!k || claves.has(k)) return;
      claves.add(k); d.elenco.push({ id: 'pj:' + k, nombre: sinSufijo(r.name), color: color(r.color), auto: true });
    });
    d.notas.forEach(n => deRegistro(n.characters));
    d.contenedores.forEach(c => c.esquemas.forEach(e => Object.values(e.notas).forEach(n => deRegistro(n.characters))));
    return d;
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
    subsDe(cid) { const c = this.contenedor(cid); return c ? c.subs.slice() : []; }
    /* El enlace de un esquema o de un subcontenedor: { contenedor, esquema, sub }, o null si va suelto. */
    enlace(id) {
      for (const c of this.datos.contenedores) {
        const e = c.esquemas.find(x => x.subId && (x.id === id || x.subId === id)); if (!e) continue;
        const s = c.subs.find(x => x.id === e.subId); if (s) return { contenedor: c, esquema: e, sub: s };
      }
      return null;
    }
    etiquetasDe(subId) { return this.datos.etiquetas.filter(e => e.subId === subId); }
    /* Notas de un subcontenedor: todas, o las de una etiqueta (null = la bandeja). */
    notasDe(subId, etiquetaId) {
      return this.datos.notas.filter(n => n.subId === subId && (etiquetaId === undefined || n.etiquetaId === (etiquetaId || null)));
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
    /* Estrena una biblioteca («Biblioteca»), salvo con `{ vacio: true }` (la interfaz le pone un esquema
       enlazado a su biblioteca). */
    crearContenedor(nombre, opciones) {
      const t = this.ahora();
      const c = { id: this.idNuevo(), nombre: this._libre(texto(nombre, 'Contenedor'), this.datos.contenedores.map(x => x.nombre)),
                  fijado: false, plegado: false, creado: t, modificado: t, esquemas: [], subs: [] };
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
      const c = this.datos.contenedores.find(x => !x.oculto) || this.crearContenedor(NOMBRE_GLOBAL, { vacio: true }).contenedor;   // un «Capítulo» con solo el esquema y su biblioteca
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

    /* ---------- personajes: contenedor oculto con un tablero y una biblioteca por personaje ---------- */
    /* El contenedor de Personajes; con `crear` lo crea si no existe. El tablero único de antes
       (`personajes:esquema`, compartido por todos) se descarta: ahora cada personaje tiene el suyo. */
    personajes(crear) {
      let c = this.contenedor(ID_PERSONAJES);
      if (!c) {
        if (!crear) return null;
        const t = this.ahora();
        c = { id: ID_PERSONAJES, nombre: 'Personajes', fijado: false, plegado: false, creado: t, modificado: t, esquemas: [], subs: [], oculto: true };
        this.datos.contenedores.push(c);
      }
      c.esquemas = c.esquemas.filter(e => e.id !== ID_PERSONAJES + ':esquema');
      return c;
    }
    /* El tablero de un personaje; con `datos` (un tablero de partida) lo crea si no existe. Su carril
       principal es siempre el personaje (nombre y `personaje`), y en los demás no puede repetirse. */
    esquemaPersonaje(personajeId, datos) {
      const p = this.personaje(personajeId); if (!p) return null;
      const c = this.personajes(!!datos); if (!c) return null;
      const eid = ID_PERSONAJES + ':esquema:' + p.id;
      let e = c.esquemas.find(x => x.id === eid);
      if (!e) {
        if (!datos) return null;
        e = sanearEsquema({ datos, notas: {} }, eid, p.nombre); if (!e) return null;
        c.esquemas.push(e); this._tocar(c);
      }
      e.nombre = p.nombre;
      (e.datos.lineas || []).forEach(l => {
        if (l.tipo === 'principal') { l.personaje = p.id; l.nombre = p.nombre; }
        else if (l.personaje === p.id) { delete l.personaje; l.nombre = 'Sin personaje'; }
      });
      return e;
    }
    /* La biblioteca de un personaje (una trama del tablero de Personajes); la crea con su nombre si no la hay. */
    bibliotecaPersonaje(personajeId, nombre) {
      const c = this.contenedor(ID_PERSONAJES); if (!c || !personajeId) return null;
      let s = c.subs.find(x => x.lineaId === personajeId);        // (`lineaId` guarda el id del personaje del elenco)
      if (!s) {
        const t = this.ahora();
        s = { id: this.idNuevo(), nombre: texto(nombre, 'Personaje'), creado: t, modificado: t, lineaId: personajeId };
        c.subs.push(s); this._tocar(c);
      } else if (nombre && texto(nombre, '') && s.nombre !== texto(nombre, '')) s.nombre = texto(nombre, '');   // sigue al nombre del personaje
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
      /* enlazado a un esquema: el esquema va con él (al final de los esquemas del destino) */
      const e = destino !== r.contenedor && r.contenedor.esquemas.find(x => x.subId === id);
      if (e) this._llevar(r.contenedor, destino, 'esquemas', e, null);
      return si({ contenedor: destino, sub: r.sub, movido: destino !== r.contenedor });
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
    ordenarSecciones(id, cronologiaPrimero) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      r.sub.segmentosPrimero = !cronologiaPrimero;
      return si(r);
    }
    /* Sus etiquetas se van; sus notas, a la papelera. */
    eliminarSub(id) {
      const r = this.sub(id); if (!r) return no('Esa biblioteca ya no existe');
      const mias = this.notasDe(id), notas = mias.length;
      mias.forEach(n => this.tirarNota(n.id));
      this.datos.etiquetas = this.datos.etiquetas.filter(e => e.subId !== id);
      r.contenedor.esquemas.forEach(e => { if (e.subId === id) e.subId = null; });   // su esquema se queda, suelto
      r.contenedor.subs = r.contenedor.subs.filter(x => x !== r.sub); this._tocar(r.contenedor);
      return si({ sub: r.sub, contenedor: r.contenedor, notas, aviso: '«' + r.sub.nombre + '» eliminado' + (notas ? ' · ' + notas + (notas === 1 ? ' nota va' : ' notas van') + ' a la papelera' : '') });
    }

    /* ---------- esquemas de pasos de un contenedor ---------- */
    esquemasDe(cid) { const c = this.contenedor(cid); return c ? c.esquemas.slice() : []; }
    esquema(eid) {
      for (const c of this.datos.contenedores) { const e = c.esquemas.find(x => x.id === eid); if (e) return { contenedor: c, esquema: e }; }
      return null;
    }
    crearEsquema(cid, datos, nombre, notas) {
      const c = this.contenedor(cid); if (!c) return no('Ese contenedor ya no existe');
      const e = sanearEsquema({ datos, notas: notas && typeof notas === 'object' ? notas : {} }, this.idNuevo(), this._libre(texto(nombre, 'Esquema'), c.esquemas.map(x => x.nombre)));
      if (!e) return no('Eso no es un esquema de pasos válido');
      c.esquemas.push(e);
      /* con su documentos enlazado, que nace con el mismo nombre */
      const t = this.ahora();
      const s = { id: this.idNuevo(), nombre: this._libre(e.nombre, c.subs.map(x => x.nombre)), creado: t, modificado: t };
      c.subs.push(s); e.subId = s.id; this._tocar(c);
      return si({ contenedor: c, esquema: e, sub: s, aviso: 'Esquema «' + e.nombre + '» creado en «' + c.nombre + '» con su biblioteca' });
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
      /* su documentos enlazado va con él (al final de los subcontenedores del destino) */
      const s = destino !== r.contenedor && r.esquema.subId && r.contenedor.subs.find(x => x.id === r.esquema.subId);
      if (s) this._llevar(r.contenedor, destino, 'subs', s, null);
      return si({ contenedor: destino, esquema: r.esquema, movido: destino !== r.contenedor });
    }
    /* Enlaza un esquema suelto con un documentos suelto del mismo contenedor (uno con uno). */
    enlazar(eid, subId) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const s = r.contenedor.subs.find(x => x.id === subId); if (!s) return no('Esa biblioteca no es de «' + r.contenedor.nombre + '»');
      if (r.esquema.subId) return no('«' + r.esquema.nombre + '» ya está enlazado con otra biblioteca');
      if (r.contenedor.esquemas.some(x => x.subId === subId)) return no('«' + s.nombre + '» ya está enlazada con otro esquema');
      r.esquema.subId = subId; this._tocar(r.contenedor);
      return si({ contenedor: r.contenedor, esquema: r.esquema, sub: s, aviso: '«' + r.esquema.nombre + '» enlazado con la biblioteca «' + s.nombre + '»' });
    }
    /* Quita el enlace entre un esquema y su documentos (se da el id de cualquiera de los dos): los dos
       se quedan donde están, sueltos. */
    quitarEnlace(id) {
      const x = this.enlace(id); if (!x) return no('No hay ningún enlace que quitar');
      x.esquema.subId = null; this._tocar(x.contenedor);
      return si(Object.assign({ aviso: 'Enlace quitado: «' + x.esquema.nombre + '» y su biblioteca van sueltos' }, x));
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
      r.contenedor.esquemas = r.contenedor.esquemas.filter(x => x !== r.esquema); this._tocar(r.contenedor);
      return si(Object.assign({ aviso: 'Esquema «' + r.esquema.nombre + '» eliminado' + (n ? ' con las notas de sus nodos' : '') }, r));
    }
    notaEsquema(eid, puntoId) { const r = this.esquema(eid); return (r && r.esquema.notas[puntoId]) || null; }
    guardarNotaEsquema(eid, puntoId, doc) {
      const r = this.esquema(eid); if (!r) return no('Ese esquema ya no existe');
      const n = docDe(doc); if (!n || !puntoId) return no('Eso no es un documento válido');
      if (JSON.stringify(r.esquema.notas[puntoId]) === JSON.stringify(n)) return si({ nota: n, cambio: false });
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
    crearEtiqueta(subId, nombre, col) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      const mias = this.etiquetasDe(subId);
      const usados = mias.map(e => e.color);
      const libre = col !== undefined && col !== null ? color(col) : (PALETA.findIndex((_, i) => !usados.includes(i)) + 1 || 1) - 1;
      const e = { id: this.idNuevo(), subId, nombre: this._libre(texto(nombre, 'Segmento'), mias.map(x => x.nombre)), color: libre };
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
    crearNota(subId, etiquetaId, titulo) {
      const r = this.sub(subId); if (!r) return no('Esa biblioteca ya no existe');
      if (etiquetaId) { const e = this.etiqueta(etiquetaId); if (!e || e.subId !== subId) return no('Ese segmento no es de esta biblioteca'); }
      const t = this.ahora();
      const n = { id: this.idNuevo(), subId, etiquetaId: etiquetaId || null,
                  titulo: this._libre(texto(titulo, 'Sin título'), this.notasDe(subId).map(x => x.titulo)), html: '', characters: {}, creado: t, modificado: t };
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
    /* Cambia de etiqueta (null = bandeja) y, si se pide, de subcontenedor; con `antesDe` (una nota del
       mismo sitio) queda delante de ella, si no al final: así se ordenan a mano. */
    moverNota(id, etiquetaId, subId, antesDe) {
      const n = this.nota(id); if (!n) return no('Esa nota ya no existe');
      const destino = subId || n.subId;
      if (!this.sub(destino)) return no('Esa biblioteca ya no existe');
      if (etiquetaId) { const e = this.etiqueta(etiquetaId); if (!e || e.subId !== destino) return no('Ese segmento no es de esa biblioteca'); }
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
      this.datos.notas.forEach(n => lista.push({ doc: n, tipo: 'nota', id: n.id, titulo: n.titulo, ruta: () => { const r = this.sub(n.subId); return r ? r.contenedor.nombre + ' › ' + r.sub.nombre : ''; } }));
      if (conPapelera) this.datos.papelera.forEach(x => lista.push({ doc: x.nota, tipo: 'papelera', id: x.nota.id }));
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => Object.keys(e.notas).forEach(pid => {
        const n = e.notas[pid], p = (e.datos.puntos || []).find(q => q.id === pid);
        lista.push({ doc: n, tipo: 'nodo', eid: e.id, id: pid, titulo: (p && p.titulo) || n.title || 'Sin título', ruta: () => c.nombre + ' › ' + e.nombre });
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
      /* cuenta como carril el que tiene en el tablero de otro personaje; su propio tablero, si tiene nodos */
      const propio = id => ID_PERSONAJES + ':esquema:' + id;
      const conCarril = new Set(); if (b) b.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => {
        if (l.personaje && (e.id !== propio(l.personaje) || (e.datos.puntos || []).length)) conCarril.add(l.personaje);
      }));
      const fuera = this.datos.elenco.filter(p => p.auto && !conCarril.has(p.id)
        && !(b && b.subs.some(s => s.lineaId === p.id && this.notasDe(s.id).length))
        && !this.menciones(p.id).length);
      if (fuera.length) {
        this.datos.elenco = this.datos.elenco.filter(p => !fuera.includes(p));
        if (b) { const ids = new Set(fuera.map(p => propio(p.id))); b.esquemas = b.esquemas.filter(e => !ids.has(e.id)); }   // su tablero vacío también
      }
      return si({ podados: fuera.length });
    }
    /* Las notas (sin la papelera) donde aparece con «/», con su ruta. */
    menciones(id) {
      const p = this.personaje(id); if (!p) return [];
      const k = clavePersonaje(p.nombre);
      return this._documentosTexto(false).filter(x => mencionaEn(x.doc.html, k))
        .map(x => ({ tipo: x.tipo, id: x.id, eid: x.eid || null, titulo: x.titulo, ruta: x.ruta() }));
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
      const e = b && b.esquemas.find(x => x.id === ID_PERSONAJES + ':esquema:' + id); if (e) e.nombre = n;
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
    /* No se elimina si alguna nota lo nombra. Sus carriles en otros tableros quedan sin personaje, su
       tablero desaparece y su biblioteca, con sus notas, va a la papelera. */
    eliminarPersonaje(id) {
      const p = this.personaje(id); if (!p) return no('Ese personaje ya no existe');
      const m = this.menciones(id);
      if (m.length) return no('«' + p.nombre + '» aparece en ' + m.length + (m.length === 1 ? ' nota' : ' notas') + ': quítalo de ellas antes de eliminarlo');
      this.datos.contenedores.forEach(c => c.esquemas.forEach(e => (e.datos.lineas || []).forEach(l => { if (l.personaje === id) { delete l.personaje; l.nombre = 'Sin personaje'; } })));
      const b = this.contenedor(ID_PERSONAJES), s = b && b.subs.find(x => x.lineaId === id); if (s) this.eliminarSub(s.id);
      if (b) b.esquemas = b.esquemas.filter(e => e.id !== ID_PERSONAJES + ':esquema:' + id);
      this.datos.elenco = this.datos.elenco.filter(x => x !== p);
      return si({ personaje: p, aviso: '«' + p.nombre + '» eliminado' });
    }
  }

  Object.assign(C, { Documentos, ID_PERSONAJES, clavePersonaje, normalizarDocumentos: normalizar, PALETA_ETIQUETAS: PALETA, ORDENES_DOCUMENTOS: ORDENES, NOMBRE_GLOBAL, NOMBRE_SUB, DIAS_PAPELERA });
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
