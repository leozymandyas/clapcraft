/* Claquedraw · enlaces (1.1.52)
   Leo, 25-09-2026: «Pon unos "puntos" o "links" a bibliotecas, segmentos, notas, personajes, esquemas, etc. Para facilitar el
   decirle a Claude a qué puntos me refiero cuando le hablo de algo». Cada cosa del proyecto tiene su **enlace**:
     clapcraft://<proyecto>/<ruta>
   <proyecto> es el nombre de su archivo sin la extensión («analisis-de-the-office»; sin archivo, el del proyecto con las mismas
   reglas, C.nombreArchivo) y <ruta> dice qué es, con los ids que usan las herramientas de Claude:
     contenedor/<id> · carpeta/<id> · grupo/<id> · personaje/<id> · nota/<id> (una nota de biblioteca)
     esquema/<id> · esquema/<id>/documento (su guion) · esquema/<id>/nodo|salto|trama|acto|nota/<id>
     esquema/<id>/enlace/<nodo>/<nodo> (el tramo entre dos nodos seguidos) · esquema/<id>/raya/<trama>/<columna>
     esquema/<id>/columna/<n> · esquema/<id>/columnas/<a>-<b> (columnas desde 1, como en el tablero)
     biblioteca/<id> · biblioteca/<id>/seccion/<id> · biblioteca/<id>/segmento/<id | bandeja>
   Un tramo de texto (del guion o de una nota) lleva `?b=<desde>-<hasta>` —los bloques de leer_documento, desde 1— y `h=`, la
   huella del primero, para encontrarlo aunque se haya movido.
   Se copian en Markdown, con un nombre que se lee: [Nodo «La broma» · esquema «Piloto»](clapcraft://…/esquema/d…/nodo/p6). Así,
   pegados en Claude, dicen qué es sin abrir nada; Claude los resuelve con ver_enlace (o los usa en lugar de un id en cualquier
   herramienta) y en ClapCraft abrir uno lleva a su sitio (menú Claude › Ir al enlace copiado, o un clic si el sistema lo abre).
   Modelo puro, sin DOM: test/enlaces.test.js. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const Tr = () => raiz.Tramas;
  const V = () => C.conversor;
  const ESQUEMA_URL = 'clapcraft';
  const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const comillas = s => '«' + s + '»';
  const corto = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const rango = (a, b) => (a === b ? String(a) : a + '–' + b);

  /* ---------- el proyecto ---------- */
  /* como el nombre de archivo que se propone (C.nombreArchivo, biblioteca.js): sin acentos, la ñ como «ni», guiones */
  function slug(nombre) {
    const s = String(nombre || '').normalize('NFC').replace(/ñ/g, 'ni').replace(/Ñ/g, 'NI')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase().replace(/['’]/g, '')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
    return s || 'proyecto';
  }
  /* el <proyecto> de un enlace: el nombre de su archivo (su ruta o su nombre) o, sin archivo, el del proyecto */
  function proyectoDe(o) {
    const r = o && (o.ruta || o.archivo);
    if (r) { const base = String(r).split(/[\\/]/).pop().replace(/\.clapcraft$/i, ''); if (base.trim()) return slug(base); }
    return slug(o && o.nombre);
  }

  /* ---------- de una referencia al enlace, y al revés ---------- */
  /* ref: { tipo, …ids }. Los de un esquema llevan `esquema` (su id); los de una biblioteca, `biblioteca`. */
  const DE_ESQUEMA = ['nodo', 'salto', 'trama', 'acto', 'nota'];
  const SUELTOS = ['contenedor', 'carpeta', 'grupo', 'personaje', 'biblioteca', 'esquema'];
  function ruta(ref) {
    if (!ref || !ref.tipo) return null;
    const t = ref.tipo;
    if (t === 'proyecto') return [];
    if (t === 'nota' && !ref.esquema) return ref.id ? ['nota', ref.id] : null;
    if (SUELTOS.includes(t)) return ref.id ? [t, ref.id] : null;
    if (t === 'documento') return ref.esquema ? ['esquema', ref.esquema, 'documento'] : null;
    if (DE_ESQUEMA.includes(t)) return ref.esquema && ref.id ? ['esquema', ref.esquema, t, ref.id] : null;
    if (t === 'enlace') return ref.esquema && ref.de && ref.a ? ['esquema', ref.esquema, 'enlace', ref.de, ref.a] : null;
    if (t === 'raya') return ref.esquema && ref.trama && ref.columna ? ['esquema', ref.esquema, 'raya', ref.trama, String(ref.columna)] : null;
    if (t === 'columnas') return ref.esquema && ref.desde ? ['esquema', ref.esquema].concat(ref.hasta && ref.hasta !== ref.desde ? ['columnas', ref.desde + '-' + ref.hasta] : ['columna', String(ref.desde)]) : null;
    if (t === 'seccion' || t === 'segmento') return ref.biblioteca && ref.id ? ['biblioteca', ref.biblioteca, t, ref.id] : null;
    return null;
  }
  const conTexto = ref => ref.tipo === 'documento' || (ref.tipo === 'nota' && !ref.esquema);
  const enc = s => encodeURIComponent(String(s)).replace(/%3A/gi, ':');
  /* El enlace de una referencia (null si le falta algo). */
  function crear(proyecto, ref) {
    const segs = ruta(ref); if (!segs) return null;
    let u = ESQUEMA_URL + '://' + enc(proyecto || 'proyecto') + (segs.length ? '/' + segs.map(enc).join('/') : '');
    if (ref.bloques && conTexto(ref)) {
      const a = +ref.bloques[0], b = +(ref.bloques[1] || a);
      if (a > 0) u += '?b=' + rango(a, Math.max(a, b)).replace('–', '-') + (ref.huella ? '&h=' + enc(ref.huella) : '');
    }
    return u;
  }
  function deRuta(s) {
    if (!s.length) return { tipo: 'proyecto' };
    const [t, id] = s;
    if (!id) return null;
    if (t === 'nota' && s.length === 2) return { tipo: 'nota', id };
    if (t === 'biblioteca') {
      if (s.length === 2) return { tipo: 'biblioteca', id };
      if (s.length === 4 && (s[2] === 'seccion' || s[2] === 'segmento')) return { tipo: s[2], biblioteca: id, id: s[3] };
      return null;
    }
    if (t === 'esquema') {
      if (s.length === 2) return { tipo: 'esquema', id };
      const k = s[2];
      if (k === 'documento' && s.length === 3) return { tipo: 'documento', esquema: id };
      if (DE_ESQUEMA.includes(k) && s.length === 4) return { tipo: k, esquema: id, id: s[3] };
      if (k === 'enlace' && s.length === 5) return { tipo: 'enlace', esquema: id, de: s[3], a: s[4] };
      if (k === 'raya' && s.length === 5 && /^\d+$/.test(s[4]) && +s[4] > 0) return { tipo: 'raya', esquema: id, trama: s[3], columna: +s[4] };
      if ((k === 'columna' || k === 'columnas') && s.length === 4) {
        const r = /^(\d+)(?:-(\d+))?$/.exec(s[3]); if (!r || !+r[1]) return null;
        const a = +r[1], b = r[2] ? +r[2] : a; return { tipo: 'columnas', esquema: id, desde: Math.min(a, b), hasta: Math.max(a, b) };
      }
      return null;
    }
    if (SUELTOS.includes(t) && s.length === 2) return { tipo: t, id };
    return null;
  }
  const RE_URL = /^clapcraft:\/\/([^/?#\s]*)\/*([^?#\s]*)(?:\?([^#\s]*))?/i;
  /* Lee un enlace: { proyecto, url, tipo, …ids, bloques?, huella? }, o null si no es uno de ClapCraft. */
  function leer(url) {
    const u = String(url || '').trim(), m = RE_URL.exec(u); if (!m) return null;
    const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };
    const segs = m[2] ? m[2].split('/').filter(Boolean).map(dec) : [];
    const ref = deRuta(segs); if (!ref) return null;
    const q = {};
    (m[3] || '').split('&').forEach(p => { const i = p.indexOf('='); if (i > 0) q[dec(p.slice(0, i))] = dec(p.slice(i + 1)); });
    if (q.b && conTexto(ref)) {
      const r = /^(\d+)(?:-(\d+))?$/.exec(q.b);
      if (r && +r[1]) { const a = +r[1], b = r[2] ? +r[2] : a; ref.bloques = [Math.min(a, b), Math.max(a, b)]; if (q.h) ref.huella = q.h; }
    }
    return Object.assign({ proyecto: dec(m[1]).toLowerCase(), url: crear(dec(m[1]).toLowerCase(), ref) }, ref);
  }
  const esEnlace = v => typeof v === 'string' && /^\s*clapcraft:\/\//i.test(v);
  /* Todos los enlaces de un texto (pegado de Claude, Markdown o sueltos), sin repetir y sin la puntuación de detrás. */
  function extraer(texto) {
    const out = [];
    (String(texto || '').match(/clapcraft:\/\/[^\s<>()[\]"'«»`\\|]+/gi) || []).forEach(m => {
      const u = m.replace(/[.,;:!?]+$/, '');
      if (leer(u) && !out.includes(u)) out.push(u);
    });
    return out;
  }

  /* ---------- una huella del texto de un bloque (para encontrar un tramo que se movió) ---------- */
  function huella(texto) {
    const s = plano(texto);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const huellaBloque = html => huella(V() ? V().textoPlano(html) : String(html || '').replace(/<[^>]+>/g, ' '));
  /* Dónde está ahora el tramo de un enlace en un documento: { desde, hasta, movido?, perdido? } (bloques desde 1). Si el primer
     bloque ya no es el que era, se busca el que tiene su huella (el más cercano) y el tramo se corre con él. */
  function tramo(html, ref) {
    const bs = V().bloques(html), n = bs.length;
    if (!ref || !ref.bloques) return { desde: 1, hasta: n, todo: true, total: n };
    let [a, b] = ref.bloques;
    const largo = b - a;
    const casa = i => i >= 0 && i < n && (!ref.huella || huellaBloque(bs[i].html) === ref.huella);
    if (casa(a - 1)) return { desde: a, hasta: Math.min(b, n), total: n, fuera: a > n };
    if (ref.huella) {
      let mejor = -1;
      bs.forEach((x, i) => { if (huellaBloque(x.html) === ref.huella && (mejor < 0 || Math.abs(i - (a - 1)) < Math.abs(mejor - (a - 1)))) mejor = i; });
      if (mejor >= 0) return { desde: mejor + 1, hasta: Math.min(mejor + 1 + largo, n), movido: true, antes: [a, b], total: n };
    }
    return { desde: Math.min(a, n), hasta: Math.min(b, n), perdido: true, total: n };
  }

  /* ---------- encontrar lo que dice un enlace ---------- */
  const NOMBRES_PERSONAJE = { acto: 'Momento', linea: 'Personaje', punto: 'Evento', nodo: 'Evento', cuadro: 'Relación', femeninos: ['cuadro'] };
  /* el modelo de un esquema: el que dé `op.modelo(eid)` (en la app, el del tablero montado) o uno nuevo con sus datos */
  function modeloDe(docs, eid, op) {
    const vivo = op && op.modelo && op.modelo(eid); if (vivo) return vivo;
    const r = docs.esquema(eid); if (!r || !Tr()) return null;
    const m = new (Tr().Modelo)(JSON.parse(JSON.stringify(r.esquema.datos)));
    if (docs.esEsquemaPersonaje && docs.esEsquemaPersonaje(eid)) m.nombres = NOMBRES_PERSONAJE;
    return m;
  }
  const no = aviso => ({ ok: false, aviso });
  const tituloNodo = p => (p && String(p.titulo || '').trim() ? comillas(corto(p.titulo, 60)) : 'sin título');
  /* Lo que dice una referencia, en el proyecto: { ok, …lo encontrado, etiqueta } o { ok: false, aviso }. `op.modelo(eid)` da el
     modelo vivo de un esquema, `op.proyecto` el nombre del proyecto y `op.extracto` el texto de un tramo (para el nombre). */
  function resolver(docs, ref, op) {
    op = op || {};
    if (!docs || !ref) return no('No hay proyecto');
    const t = ref.tipo;
    if (t === 'proyecto') return { ok: true, etiqueta: 'Proyecto' + (op.proyecto ? ' ' + comillas(op.proyecto) : '') };
    if (t === 'contenedor') {
      const c = docs.contenedor(ref.id); if (!c) return no('Ese contenedor ya no está en el proyecto');
      return { ok: true, contenedor: c, etiqueta: 'Contenedor ' + comillas(c.nombre) };
    }
    if (t === 'carpeta') {
      const k = docs.carpeta(ref.id); if (!k) return no('Esa carpeta ya no está en el proyecto');
      return Object.assign({ ok: true, etiqueta: 'Carpeta ' + comillas(k.carpeta.nombre) + (k.contenedor ? ' · ' + comillas(k.contenedor.nombre) : ' · Personajes') }, k);
    }
    if (t === 'grupo') {
      const g = docs.grupo(ref.id); if (!g) return no('Ese grupo ya no está en el proyecto');
      return Object.assign({ ok: true, etiqueta: 'Grupo ' + comillas(g.grupo.nombre) + (g.contenedor && !g.contenedor.oculto ? ' · ' + comillas(g.contenedor.nombre) : '') }, g);
    }
    if (t === 'personaje') {
      const p = docs.personaje(ref.id);
      if (!p) return no(docs.piezaEnPapelera && docs.piezaEnPapelera(ref.id) ? 'Ese personaje está en la papelera' : 'Ese personaje ya no está en el proyecto');
      return { ok: true, personaje: p, etiqueta: 'Personaje ' + comillas(p.nombre) };
    }
    if (t === 'biblioteca' || t === 'seccion' || t === 'segmento') {
      const bid = t === 'biblioteca' ? ref.id : ref.biblioteca, r = docs.sub(bid);
      if (!r || r.sub.guionEid) return no(docs.piezaEnPapelera && docs.piezaEnPapelera(bid) ? 'Esa biblioteca está en la papelera' : 'Esa biblioteca ya no está en el proyecto');
      const per = r.sub.lineaId && docs.personaje(r.sub.lineaId);
      const nomB = per ? 'biblioteca de ' + comillas(per.nombre) : 'biblioteca ' + comillas(r.sub.nombre);
      const x = { ok: true, contenedor: r.contenedor, sub: r.sub, personaje: per || null };
      if (t === 'biblioteca') return Object.assign(x, { etiqueta: nomB.charAt(0).toUpperCase() + nomB.slice(1) });
      if (t === 'seccion') {
        const k = docs.seccion(ref.id); if (!k || k.sub.id !== bid) return no('Esa sección ya no está en la ' + nomB);
        return Object.assign(x, { seccion: k.seccion, etiqueta: 'Sección ' + comillas(k.seccion.nombre) + ' · ' + nomB });
      }
      if (ref.id === 'bandeja') return Object.assign(x, { bandeja: true, etiqueta: 'Notas sin segmento · ' + nomB });
      const e = docs.etiqueta(ref.id); if (!e || e.subId !== bid) return no('Ese segmento ya no está en la ' + nomB);
      return Object.assign(x, { segmento: e, etiqueta: 'Segmento ' + comillas(e.nombre) + ' · ' + nomB });
    }
    if (t === 'nota' && !ref.esquema) {
      const n = docs.nota(ref.id);
      if (!n) return no(docs.enPapelera && docs.enPapelera(ref.id) ? 'Esa nota está en la papelera' : 'Esa nota ya no está en el proyecto');
      const r = docs.sub(n.subId), eid = r && r.sub.guionEid;
      if (eid) { const e = docs.esquema(eid); return Object.assign(resolver(docs, Object.assign({}, ref, { tipo: 'documento', esquema: eid }), op), e ? {} : { ok: false, aviso: 'Ese documento ya no tiene esquema' }); }
      const per = r && r.sub.lineaId && docs.personaje(r.sub.lineaId), seg = n.etiquetaId && docs.etiqueta(n.etiquetaId);
      const donde = r ? (per ? 'biblioteca de ' + comillas(per.nombre) : 'biblioteca ' + comillas(r.sub.nombre)) + (seg ? ' › ' + comillas(seg.nombre) : '') : '';
      const tit = comillas(corto(n.titulo || 'Sin título', 60));
      const etiqueta = ref.bloques ? (op.extracto ? comillas(corto(op.extracto, 70)) + ' · ' : '') + 'nota ' + tit + ', ' + (ref.bloques[0] === ref.bloques[1] ? 'bloque ' + ref.bloques[0] : 'bloques ' + rango(ref.bloques[0], ref.bloques[1]))
        : 'Nota ' + tit + (donde ? ' · ' + donde : '');
      return { ok: true, nota: n, sub: r && r.sub, contenedor: r && r.contenedor, segmento: seg || null, personaje: per || null, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) };
    }
    /* lo de un esquema */
    const eid = t === 'esquema' ? ref.id : ref.esquema, r = docs.esquema(eid);
    if (!r) return no(docs.piezaEnPapelera && docs.piezaEnPapelera(eid) ? 'Ese esquema está en la papelera' : 'Ese esquema ya no está en el proyecto');
    const per = docs.esEsquemaPersonaje && docs.esEsquemaPersonaje(eid);
    const nomE = (per ? 'esquema de personaje ' : 'esquema ') + comillas(r.esquema.nombre);
    const x = { ok: true, contenedor: r.contenedor, esquema: r.esquema, personajes: !!per };
    if (t === 'esquema') return Object.assign(x, { etiqueta: nomE.charAt(0).toUpperCase() + nomE.slice(1) });
    if (t === 'documento') {
      const n = docs.documentoEsquema(eid);
      if (!n) return Object.assign(x, { nota: null, etiqueta: 'Guion de ' + comillas(r.esquema.nombre) + ' (aún no tiene)' });
      const etiqueta = ref.bloques ? (op.extracto ? comillas(corto(op.extracto, 70)) + ' · ' : '') + 'guion de ' + comillas(r.esquema.nombre) + ', ' + (ref.bloques[0] === ref.bloques[1] ? 'bloque ' + ref.bloques[0] : 'bloques ' + rango(ref.bloques[0], ref.bloques[1]))
        : 'Guion de ' + comillas(r.esquema.nombre);
      return Object.assign(x, { nota: n, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) });
    }
    const m = modeloDe(docs, eid, op); if (!m) return no('No se puede leer ese esquema');
    Object.assign(x, { modelo: m });
    const nom = pieza => m.nombre ? m.nombre(pieza) : ({ acto: 'Acto', linea: 'Trama', nodo: 'Nodo' })[pieza];
    const nomL = id => { const l = m.linea(id); return l ? comillas(l.nombre) : '?'; };
    if (t === 'nodo') {
      const p = m.punto(ref.id); if (!p) return no('Ese nodo ya no está en el ' + nomE);
      const s = m.saltoDe(p.id);
      if (s) return Object.assign(resolver(docs, { tipo: 'salto', esquema: eid, id: s.id }, op), { nodo: p });
      return Object.assign(x, { punto: p, linea: m.linea(p.lineaId), etiqueta: nom('nodo') + ' ' + (String(p.titulo || '').trim() ? comillas(corto(p.titulo, 60)) : 'sin título (' + nomL(p.lineaId) + ', columna ' + (m.cg(p) + 1) + ')') + ' · ' + nomE });
    }
    if (t === 'salto') {
      const s = m.salto(ref.id) || m.saltoDe(ref.id); if (!s) return no('Ese salto ya no está en el ' + nomE);
      const a = m.punto(s.deId), b = m.punto(s.aId);
      const forma = m.forma ? m.forma(s.tipo) : s.tipo;
      return Object.assign(x, { salto: s, de: a, a: b, etiqueta: forma + ' ' + (a && String(a.titulo || '').trim() ? comillas(corto(a.titulo, 60)) : nomL(a && a.lineaId) + ' → ' + nomL(b && b.lineaId)) + ' · ' + nomE });
    }
    if (t === 'trama') {
      const l = m.linea(ref.id); if (!l) return no('Esa trama ya no está en el ' + nomE);
      return Object.assign(x, { linea: l, etiqueta: nom('linea') + ' ' + comillas(l.nombre) + ' · ' + nomE });
    }
    if (t === 'acto') {
      const a = m.acto(ref.id); if (!a) return no('Ese acto ya no está en el ' + nomE);
      return Object.assign(x, { acto: a, etiqueta: nom('acto') + ' ' + comillas(a.nombre) + ' · ' + nomE });
    }
    if (t === 'nota') {
      const n = m.nota(ref.id); if (!n) return no('Esa nota ya no está en el ' + nomE);
      let donde;
      if (n.abierta) donde = 'en la raya de ' + nomL(m.lineaDeNota ? m.lineaDeNota(n) : n.lineaId);
      else if (n.aId) donde = 'entre ' + tituloNodo(m.punto(n.deId)) + ' y ' + tituloNodo(m.punto(n.aId));
      else donde = 'en ' + (m.saltoDe(n.deId) ? 'el salto' : 'el ' + nom('nodo').toLowerCase()) + ' ' + tituloNodo(m.punto(n.deId));
      return Object.assign(x, { nota: n, etiqueta: 'Nota ' + comillas(corto(n.texto || 'vacía', 50)) + ' (' + donde + ') · ' + nomE });
    }
    if (t === 'enlace') {
      const a = m.punto(ref.de), b = m.punto(ref.a);
      if (!a || !b) return no('Uno de los dos nodos de ese enlace ya no está en el ' + nomE);
      const sig = m.siguienteEnTrama ? m.siguienteEnTrama(a.id) : null;
      const seguidos = !!sig && sig.id === b.id;
      return Object.assign(x, { de: a, a: b, linea: m.linea(a.lineaId), seguidos,
        etiqueta: 'Enlace ' + tituloNodo(a) + ' → ' + tituloNodo(b) + ' (' + nomL(a.lineaId) + ') · ' + nomE });
    }
    if (t === 'raya') {
      const l = m.linea(ref.trama); if (!l) return no('Esa trama ya no está en el ' + nomE);
      return Object.assign(x, { linea: l, col: ref.columna - 1, etiqueta: 'Raya de ' + comillas(l.nombre) + ', columnas ' + ref.columna + '–' + (ref.columna + 1) + ' · ' + nomE });
    }
    if (t === 'columnas') {
      return Object.assign(x, { etiqueta: (ref.desde === ref.hasta ? 'Columna ' + ref.desde : 'Columnas ' + rango(ref.desde, ref.hasta)) + ' · ' + nomE,
        fuera: ref.hasta > m.totalCeldas() });
    }
    return no('No sé qué es ese enlace');
  }
  /* El nombre que se lee de una referencia (aunque ya no exista: entonces, lo que se sabe). */
  function etiqueta(docs, ref, op) {
    const r = resolver(docs, ref, op);
    if (r.ok) return r.etiqueta;
    return ({ proyecto: 'Proyecto', contenedor: 'Contenedor', carpeta: 'Carpeta', grupo: 'Grupo', personaje: 'Personaje', biblioteca: 'Biblioteca', seccion: 'Sección',
      segmento: 'Segmento', nota: 'Nota', esquema: 'Esquema', documento: 'Guion', nodo: 'Nodo', salto: 'Salto', trama: 'Trama', acto: 'Acto', enlace: 'Enlace', raya: 'Raya',
      columnas: 'Columnas' })[ref.tipo] || 'Enlace';
  }
  /* El enlace en Markdown: [nombre](clapcraft://…). Los corchetes del nombre van escapados. */
  function markdown(docs, proyecto, ref, op) {
    const u = crear(proyecto, ref); if (!u) return null;
    return '[' + etiqueta(docs, ref, op).replace(/([[\]\\])/g, '\\$1') + '](' + u + ')';
  }

  /* ---------- el nombre del proyecto en sus enlaces, y cuando el archivo cambia de nombre ----------
     Leo, 25-09-2026: «que se haga una comprobación y corrección de los enlaces si es que cambié el nombre». El proyecto guarda dentro
     el nombre con que se hacen sus enlaces y los que tuvo antes: `documentos.enlace = { proyecto, antes? }`. Se sella al escribirse
     su archivo o al copiar un enlace (`sellar`: así, abrir un proyecto no lo reescribe). Si su archivo ya se llama de otra manera
     —se renombró en el Finder—, `renombrar` lo pone al día: el nombre nuevo pasa a `proyecto`, el de antes a `antes` (los enlaces
     viejos, los que ya se pegaron en Claude, lo siguen encontrando) y los enlaces que hay dentro del proyecto —en las notas y los
     documentos, en las descripciones y las notas de los esquemas— se corrigen. */
  const escRe = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* los nombres de un proyecto en sus enlaces: el sellado y los de antes */
  function nombres(datos) {
    const e = datos && datos.enlace;
    return e && e.proyecto ? [e.proyecto].concat(Array.isArray(e.antes) ? e.antes : []) : [];
  }
  function sellar(datos, ahora) {
    if (!datos || !ahora || (datos.enlace && datos.enlace.proyecto)) return false;
    datos.enlace = { proyecto: ahora };
    return true;
  }
  /* cambia `clapcraft://<viejo>/…` por `clapcraft://<ahora>/…` dentro del proyecto; devuelve cuántos */
  function corregir(datos, viejos, ahora) {
    const lista = (viejos || []).filter(v => v && v !== ahora);
    if (!datos || !lista.length) return 0;
    const re = new RegExp('clapcraft://(?:' + lista.map(escRe).join('|') + ')(?=[/?#\\s)\\]"\'<>«»`]|$)', 'gi');
    let n = 0;
    const rep = v => (typeof v === 'string' && v.includes('clapcraft:') ? v.replace(re, () => { n++; return 'clapcraft://' + ahora; }) : v);
    (datos.notas || []).forEach(x => { x.html = rep(x.html); x.titulo = rep(x.titulo); });
    (datos.contenedores || []).forEach(c => (c.esquemas || []).forEach(e => {
      const d = e.datos || {};
      (d.puntos || []).forEach(p => { p.titulo = rep(p.titulo); p.descripcion = rep(p.descripcion); });
      (d.notas || []).forEach(x => { x.texto = rep(x.texto); });
    }));
    return n;
  }
  /* El archivo se llama `ahora`: si el sello dice otra cosa, se pone al día. Con `op.corregir === false` (una copia, o un «Guardar
     como…»: el nombre de antes sigue siendo de otro archivo) no se tocan los enlaces de dentro, que apuntaban a aquel; los nombres de
     antes se quedan igual, de reserva (si el original desaparece, sus enlaces llevan aquí). Devuelve { cambio, antes?, corregidos } */
  function renombrar(datos, ahora, op) {
    if (!datos || !ahora) return { cambio: false, corregidos: 0 };
    const e = datos.enlace;
    if (!e || !e.proyecto) { sellar(datos, ahora); return { cambio: true, sellado: true, corregidos: 0 }; }
    if (e.proyecto === ahora) return { cambio: false, corregidos: 0 };
    const viejos = [e.proyecto].concat(Array.isArray(e.antes) ? e.antes : []).filter((v, i, l) => v && v !== ahora && l.indexOf(v) === i);
    const corregidos = op && op.corregir === false ? 0 : corregir(datos, viejos, ahora);
    datos.enlace = { proyecto: ahora, antes: viejos.slice(0, 20) };
    return { cambio: true, antes: e.proyecto, corregidos };
  }
  /* Qué tanto se llama `s` un proyecto: 0, el nombre de su archivo (o, sin archivo, el suyo); 1, el de su sello (se renombró y aún
     no se ha abierto); 2, uno de antes; null, ninguno. `enlaces`: los de su sello (`nombres`). */
  function rangoNombre(s, o) {
    const n = o && o.enlaces ? o.enlaces : nombres(o && o.datos);
    if (o && o.ruta ? proyectoDe({ ruta: o.ruta }) === s : o && o.nombre && slug(o.nombre) === s) return 0;
    if (n[0] === s) return 1;
    if (n.slice(1).includes(s)) return 2;
    return null;
  }

  C.enlaces = { ESQUEMA: ESQUEMA_URL, slug, proyectoDe, crear, leer, extraer, esEnlace, ruta, resolver, etiqueta, markdown, huella, huellaBloque, tramo, modeloDe,
    nombres, sellar, corregir, renombrar, rangoNombre };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
