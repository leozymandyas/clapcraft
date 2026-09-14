/* Claquedraw · gestor de documentos (vista «Documentos» y la barra lateral)
   La barra lateral enseña los **contenedores** del proyecto (fijados arriba) y, dentro de cada uno,
   sus hijos, todos con nombre propio:
   · **esquemas de pasos** (fila con ◫): un tablero de Tramas. Un clic lo monta en la vista Esquema.
   · **subcontenedores** (fila con ▤): un tablero de documentos: la bandeja (notas sin segmento)
     primero, una tarjeta por segmento y la tarjeta para crear otro segmento. Adaptación del
     prototipo «gestor-guiones-2a» (en el código los segmentos siguen llamándose «etiquetas»).
   Nada es especial: contenedores, esquemas y subcontenedores se crean con el «＋» (un diálogo pide el
   nombre, `#dlgNombre`), se renombran (doble clic o menú ⋯), se ordenan y se mueven arrastrando en el
   árbol (también a otro contenedor) y se eliminan. Un esquema nace con **su documentos enlazado**
   (mismo nombre; cada uno se renombra por su lado): en el árbol van juntos, unidos por una guía con dos
   puntos (`.gd-par` > `.gd-enlace`), se arrastran y se suben o bajan juntos, y un clic derecho en la
   guía quita el enlace (con aviso). («Personajes» y «Documentos guión» existieron y
   Leo los quitó: sobraban.) La **papelera** va al final de la barra: las notas tiradas, con su origen
   y su fecha; se vacía a mano o sola a los 30 días. Los tableros no llevan botones arriba (Leo): todo
   va en los menús ⋯ de la barra y en las tarjetas; la cabecera es la del rediseño («CONTENEDOR
   [Documentos] Nombre»). Si los documentos están enlazados a un esquema, debajo de los segmentos va
   la **Cronología**: una tarjeta por acto con sus nodos, cada uno un documento (`cronologia()`).

   En el árbol, un clic en un subcontenedor abre su tablero (y con texto en «Buscar» aparecen debajo
   las notas que casan: un clic las abre en el editor); en el tablero un clic en una nota la selecciona
   y el doble clic la abre (js/claquedraw/texto.js, modo documento): el tablero cede su sitio al
   editor, la barra se queda y encima van las migas. El arrastre (clic sostenido) va con eventos de
   puntero y un fantasma: notas entre segmentos, dentro de un segmento para ordenarlas, a un
   subcontenedor o contenedor de la barra (a su bandeja) o a la papelera; los segmentos por su
   cabecera, para ordenarlos; contenedores, esquemas y subcontenedores por su fila. Toda regla vive en
   js/claquedraw/documentos.js. */
(function (C) {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAL = C.PALETA_ETIQUETAS;
  const PAPELERA = 'papelera';
  const ic = (n, t) => `<svg width="${t || 14}" height="${t || 14}" aria-hidden="true"><use href="#ic-${n}"></use></svg>`;
  /* en el árbol manda la etiqueta de tipo, no el icono (rediseño): Esquema · Documentos (el enlazado, en el tono del esquema) */
  const CHIPS = { esquema: '<span class="gd-chip gd-chip--esquema">Esquema</span>', sub: '<span class="gd-chip gd-chip--sub">Biblioteca</span>',
                  enlazado: '<span class="gd-chip gd-chip--esquema">Biblioteca</span>' };

  let o = {};                    // opciones de iniciar()
  let seccion, lado, main, migas;
  let d = null, guionId = null;  // C.Documentos del guion abierto
  let actual = null;             // lo abierto en el tablero: { tipo: 'sub' | 'cont' (sin subcontenedores) | 'papelera', cid, id }
  let notaAbierta = null;        // nota en el editor
  let notaSel = null;            // nota seleccionada con un clic (doble clic la abre)
  let clicArbol = null;          // temporizador del clic en el árbol (el doble clic lo cancela)
  let editando = false;          // hay un campo de renombrar abierto: no se redibuja hasta cerrarlo

  /* ---------- referencias { tipo, cid, id } y su clave para el DOM ---------- */
  const clave = s => s ? s.tipo + '/' + (s.cid || '') + '/' + (s.id || '') : '';
  const desclave = k => { const [tipo, cid, id] = String(k || '').split('/'); return tipo ? { tipo, cid: cid || null, id: id || null } : null; };
  const mismo = (a, b) => clave(a) === clave(b);
  const ref = (tipo, cid, id) => ({ tipo, cid, id: id || null });
  /* Los subcontenedores de un contenedor que no están enlazados a ningún esquema. */
  const sueltosDe = c => c.subs.filter(s => !c.esquemas.some(e => e.subId === s.id));
  const esPapelera = () => !!actual && actual.tipo === PAPELERA;
  function valido(s) {
    if (!s || !d) return false;
    if (s.tipo === PAPELERA) return true;
    const c = d.contenedor(s.cid); if (!c) return false;
    if (s.tipo === 'esquema') return c.esquemas.some(e => e.id === s.id);
    if (s.tipo === 'sub') return c.subs.some(x => x.id === s.id);
    return s.tipo === 'cont';
  }
  /* El tablero por defecto de un contenedor: su primer subcontenedor (o él mismo, vacío). */
  const entradaDe = c => c.subs.length ? ref('sub', c.id, c.subs[0].id) : ref('cont', c.id);
  /* Cambiar de tablero. */
  function navegar(s) { actual = s; }

  /* El modelo del guion abierto. Se rehace si cambia el guion o si la biblioteca sustituyó sus datos.
     La papelera se purga una vez por sesión. */
  function modelo() {
    const g = o.guion();
    if (!g) { d = null; guionId = null; actual = null; return null; }
    if (!d || guionId !== g.id || g.documentos !== d.datos) {
      d = new C.Documentos(g.documentos); g.documentos = d.datos; guionId = g.id;
      actual = null;
      const p = d.purgarPapelera(C.DIAS_PAPELERA);
      if (p.purgadas) { if (o.avisar) o.avisar('Papelera: ' + p.purgadas + (p.purgadas === 1 ? ' nota antigua eliminada' : ' notas antiguas eliminadas') + ' (más de ' + C.DIAS_PAPELERA + ' días)'); if (o.guardar) o.guardar(); }
    }
    if (!valido(actual)) actual = d.datos.contenedores.length ? entradaDe(d.datos.contenedores[0]) : null;
    return d;
  }
  const oscuro = () => document.documentElement.dataset.theme === 'dark';
  const colores = i => { const t = PAL[i] || PAL[0]; return oscuro() ? [t[2], t[1]] : [t[1], t[2]]; };
  const estiloTag = e => { const [bg, ink] = colores(e.color); return `--sbg:${bg};--sink:${ink}`; };
  const tag = (nombre, estilo) => nombre ? `<span class="gd-tag" style="${estilo}">${esc(nombre)}</span>` : '<span class="gd-tag gd-tag--bandeja">bandeja</span>';
  const tagPapelera = x => `<span class="gd-tag gd-tag--bandeja" title="Venía de «${esc(x.origenNombre || '?')}»">${esc(x.origenNombre || 'sin origen')}</span>`;
  function fecha(ts) {
    if (!ts) return '';
    const f = new Date(ts), hoy = new Date(); const dia = 864e5;
    const d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    if (ts >= d0) return 'hoy';
    if (ts >= d0 - dia) return 'ayer';
    return f.getDate() + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][f.getMonth()];
  }
  const diasEn = ts => Math.floor((Date.now() - (ts || 0)) / 864e5);
  /* Tras una operación del modelo: aviso si lo hay, guardar y redibujar. Devuelve si fue bien. */
  function tras(r) {
    if (!r) return false;
    if (r.aviso && o.avisar) o.avisar(r.aviso);
    if (r.ok) { if (o.guardar) o.guardar(); render(); }
    return !!r.ok;
  }

  /* ---------- barra lateral (el menú) ---------- */
  function filaNota(n, tagHtml, extra) {
    const b = document.createElement('div');
    b.className = 'gd-nota-fila' + (n.id === notaAbierta ? ' activa' : '') + (n.id === notaSel ? ' sel' : '') + (extra || '');
    b.dataset.nota = n.id; b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.innerHTML = tagHtml + '<span></span><button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">' + ic('more', 14) + '</button>';
    b.children[1].textContent = n.titulo;
    return b;
  }
  /* Una fila de hijo: punto · etiqueta de tipo · nombre · ⋯. La activa es lo que enseña la vista: el
     esquema montado en Esquema y Texto, el subcontenedor abierto en Documentos. */
  function filaHijo(s, enlazado) {
    const fila = document.createElement('div');
    const modo = o.modo ? o.modo() : 'documentos';
    const montado = s.tipo === 'esquema' && o.esquemaMontado && s.id === (o.esquemaMontado() || null);
    const activo = s.tipo === 'esquema' ? montado && modo !== 'documentos' : modo === 'documentos' && !notaAbierta && mismo(s, actual);
    fila.className = 'gd-sub gd-sub--' + s.tipo + (activo ? ' activo' : '') + (montado ? ' montado' : '') + (enlazado ? ' enlazado' : '');
    fila.dataset.sub = clave(s);
    let nombre;
    if (s.tipo === 'esquema') {
      const r = d.esquema(s.id); nombre = r ? r.esquema.nombre : '';
      fila.dataset.gdGlobo = 'esquema';
    } else {
      const r = d.sub(s.id); nombre = r ? r.sub.nombre : '';
      fila.dataset.gdDropSub = clave(s);                      // recibe notas
      fila.dataset.gdGlobo = 'sub';
    }
    fila.innerHTML = `<span class="gd-sub-punto" aria-hidden="true"></span>${s.tipo === 'esquema' ? CHIPS.esquema : enlazado ? CHIPS.enlazado : CHIPS.sub}<span class="gd-sub-nom"></span>
      <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="hijo" title="Opciones">${ic('more')}</button></span>`;
    $('.gd-sub-nom', fila).textContent = nombre;
    return fila;
  }
  /* Un contenedor y, debajo, sus esquemas (cada uno con su documentos enlazado, unidos por la guía) y
     después los documentos sueltos. Lo que se arrastra como una pieza lleva `data-unidad`. */
  function filaContenedor(c) {
    const fila = document.createElement('div');
    fila.className = 'gd-cont' + (c.fijado ? ' fijado' : '');
    fila.dataset.id = c.id; fila.dataset.gdDropCont = c.id;
    fila.innerHTML = `<span class="gd-cont-nom">
        <button type="button" class="gd-chev" data-gd-plegar title="${c.plegado ? 'Desplegar' : 'Plegar'}">${ic(c.plegado ? 'chev-r' : 'chev-d', 13)}</button>
        ${c.fijado ? '<span class="gd-estrella" aria-label="Fijado">★</span>' : ''}<span data-gd-nombre></span></span>
      <span class="gd-cont-acc siempre">
        <button type="button" data-gd-nuevo-hijo title="Nuevo esquema de pasos o biblioteca">${ic('plus', 15)}</button>
        <button type="button" data-gd-menu="contenedor" title="Opciones del contenedor">${ic('more', 15)}</button></span>`;
    $('[data-gd-nombre]', fila).textContent = c.nombre;
    fila.title = 'Arrastra para ordenar los contenedores';
    const hijos = document.createElement('div');
    hijos.className = 'gd-hijos'; hijos.hidden = c.plegado;
    c.esquemas.forEach(e => {
      const re = ref('esquema', c.id, e.id), sub = e.subId && c.subs.find(x => x.id === e.subId);
      if (!sub) { const f = filaHijo(re, false); f.dataset.unidad = clave(re); hijos.appendChild(f); return; }
      const par = document.createElement('div');
      par.className = 'gd-par'; par.dataset.unidad = clave(re);
      par.innerHTML = '<span class="gd-enlace" data-gd-enlace title="Esquema y biblioteca enlazados · clic derecho para quitar el enlace"></span>';
      par.appendChild(filaHijo(re, true));
      par.appendChild(filaHijo(ref('sub', c.id, sub.id), true));
      hijos.appendChild(par);
    });
    sueltosDe(c).forEach(x => { const rs = ref('sub', c.id, x.id), f = filaHijo(rs, false); f.dataset.unidad = clave(rs); hijos.appendChild(f); });
    return [fila, hijos];
  }
  /* El pie del menú: Contenedores y Personajes cambian lo que enseña el menú (y la vista); la papelera abre su tablero. */
  function filasPie() {
    const per = enPersonajes();
    const nav = (clase, icono, texto, dato, activo) => {
      const f = document.createElement('div');
      f.className = 'gd-cont papelera gd-nav' + (activo ? ' activo' : ''); f.setAttribute(dato, '');
      f.innerHTML = `<span class="gd-cont-nom">${ic(icono, 16)}<span data-gd-nombre>${texto}</span></span>`;
      return f;
    };
    return [nav('', 'docs', 'Contenedores', 'data-gd-ir-contenedores', !per && !(esPapelera() && o.modo && o.modo() === 'documentos')),
            nav('', 'person', 'Personajes', 'data-gd-ir-personajes', per),
            filaPapelera()];
  }
  /* el menú enseña los personajes en su pantalla y también con el editor abierto desde ella (Leo) */
  const enPersonajes = () => !!(o.personajesActivo ? o.personajesActivo() : (o.modo && o.modo() === 'personajes'));
  /* Menú en modo Personajes: los personajes del guion (los del editor y los creados aquí), uno por fila
     (punto de su color · nombre · ⋯) y «＋ personaje». */
  function filasPersonajes() {
    const P = o.personajes ? o.personajes() : null; if (!P) return [];
    const filas = P.lista.map(l => {
      const f = document.createElement('div');
      f.className = 'gd-per' + (l.id === P.abierto ? ' activo' : ''); f.dataset.personaje = l.id;
      f.innerHTML = `<span class="gd-per-punto" style="--chl:${(PAL[l.color] || PAL[0])[1]};--chd:${(PAL[l.color] || PAL[0])[2]}"></span><span class="gd-per-nom"></span>
        <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="personaje" title="Opciones del personaje">${ic('more')}</button></span>`;
      $('.gd-per-nom', f).textContent = l.nombre;
      return f;
    });
    const nuevo = document.createElement('div');
    nuevo.className = 'gd-per gd-per--nuevo'; nuevo.dataset.gdNuevoPersonaje = '';
    nuevo.innerHTML = `${ic('plus', 13)}<span class="gd-per-nom">personaje</span>`;
    return [...filas, nuevo];
  }
  function filaPapelera() {
    const fila = document.createElement('div');
    fila.className = 'gd-cont papelera' + (esPapelera() && (!o.modo || o.modo() === 'documentos') ? ' activo' : '');
    fila.dataset.id = PAPELERA; fila.dataset.gdDropCont = PAPELERA;
    fila.title = 'Papelera · suelta aquí una nota para tirarla';
    const n = d.papelera().length;
    fila.innerHTML = `<span class="gd-cont-nom">${ic('trash', 16)}<span data-gd-nombre>Papelera</span>${n ? `<span class="gd-cont-num">${n}</span>` : ''}</span>
      <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="papelera" title="Opciones">${ic('more')}</button></span>`;
    return fila;
  }
  function renderLado() {
    const m = modelo();
    const listaF = $('[data-gd-lista="fijados"]', lado), listaT = $('[data-gd-lista="contenedores"]', lado);
    const pie = $('[data-gd-lista="papelera"]', lado), vacio = $('[data-gd-vacio]', lado);
    if (!m) { listaF.replaceChildren(); listaT.replaceChildren(); pie.replaceChildren(); vacio.hidden = false; vacio.textContent = 'No hay ningún guion abierto'; return; }
    pie.replaceChildren(...filasPie());
    const riel = $('[data-gd-papelera]', lado); if (riel) riel.classList.toggle('activo', esPapelera() && (!o.modo || o.modo() === 'documentos'));
    const rielPer = $('.gd-riel [data-gd-ir-personajes]', lado); if (rielPer) rielPer.classList.toggle('activo', enPersonajes());
    const rot = $('.gd-rotulo', lado), txt = $('[data-gd-nuevo-txt]', lado);
    if (enPersonajes()) {                                  // el menú enseña los personajes en lugar del árbol
      if (rot) rot.textContent = 'Personajes'; if (txt) txt.textContent = 'Nuevo personaje';
      listaF.replaceChildren(); listaT.replaceChildren(...filasPersonajes()); vacio.hidden = true;
      return;
    }
    if (rot) rot.textContent = 'Contenedores'; if (txt) txt.textContent = 'Nuevo contenedor';
    const L = m.contenedores({ orden: 'manual' });
    listaF.replaceChildren(...L.fijados.flatMap(filaContenedor));
    listaT.replaceChildren(...L.sueltos.flatMap(filaContenedor));
    vacio.hidden = !!L.total; vacio.textContent = 'Aún no hay contenedores: crea uno con el botón de arriba';
  }

  /* ---------- tablero del subcontenedor abierto ---------- */
  function notaHtml(n, meta, fijo) {
    return `<div class="gd-nota${n.id === notaAbierta ? ' activa' : ''}${n.id === notaSel ? ' sel' : ''}" role="button" tabindex="0" data-nota="${esc(n.id)}" title="${fijo ? 'Doble clic: abrir documento' : 'Doble clic: abrir documento · arrastra para moverla u ordenarla'}">
            <span></span><span class="gd-nota-meta">${esc(meta)}</span>
            <button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">${ic('more', 13)}</button></div>`;
  }
  /* Una tarjeta: un segmento (o la bandeja, e = null) con sus notas. */
  function tarjeta(e, notas) {
    const cuerpo = notas.map(n => notaHtml(n, fecha(n.modificado), false)).join('');
    const cabecera = `<span class="gd-etq-nom">${e ? '<span class="gd-asa" title="Arrastra para ordenar los segmentos">' + ic('drag', 13) + '</span>' : ''}<span ${e ? 'data-gd-etq-nombre' : ''}></span></span>
         <span class="gd-etq-acc"><span class="gd-cuenta">${notas.length}</span>${e
           ? `<button type="button" data-gd-menu="etiqueta" title="Editar el segmento">${ic('edit', 13)}</button><button type="button" data-gd-eliminar-etq title="Eliminar el segmento">${ic('close', 13)}</button>` : ''}</span>`;
    const pie = `<button type="button" class="gd-nota-add" data-gd-crear-nota="${e ? esc(e.id) : ''}">${ic('plus', 13)}nota</button>`;
    const sec = document.createElement('section');
    sec.className = 'gd-etq' + (e ? '' : ' gd-etq--bandeja') + (notas.length ? '' : ' vacia');
    if (e) { sec.dataset.etq = e.id; sec.setAttribute('style', estiloTag(e)); }
    sec.innerHTML = `<header class="gd-etq-head">${cabecera}</header><div class="gd-etq-body" data-gd-drop="${e ? esc(e.id) : ''}">${pie}${cuerpo}</div>`;
    $('.gd-etq-nom > span:last-child', sec).textContent = e ? e.nombre : 'Bandeja';
    $$('.gd-nota', sec).forEach(b => { const n = notas.find(x => x.id === b.dataset.nota); if (n) b.firstElementChild.textContent = n.titulo; });
    return sec;
  }
  /* La cronología de unos documentos enlazados a un esquema: una tarjeta por acto (con el fondo del acto)
     y, dentro, sus nodos en el orden del tiempo; cada nodo es un documento. No se reordenan; se abren
     (doble clic), se renombran y se eliminan (con su nodo) desde el ⋯. Los extremos de un salto no
     tienen documento y no salen. Sin enlace, no hay sección. */
  function cronologia(m, subId) {
    const x = m.enlace(subId), tm = x && o.modeloDe && o.modeloDe(x.esquema.id); if (!tm) return null;
    const T = window.Tramas, eid = x.esquema.id;
    const fila = l => tm.datos.lineas.findIndex(y => y.id === l);
    const sec = document.createElement('section');
    sec.className = 'gd-crono gd-bloque'; sec.dataset.eid = eid; sec.dataset.seccion = 'crono';
    sec.innerHTML = `<div class="gd-seccion"><span class="gd-seccion-tit">Cronología</span>${CHIPS.esquema}<span class="gd-seccion-nom"></span>
        <button type="button" class="btn" data-gd-ver-esquema="${esc(eid)}" title="Abrir este esquema en el tablero">${ic('board', 15)}Ver en el esquema</button></div>
      <div class="gd-tablero gd-tablero--crono"></div>`;
    $('.gd-seccion-nom', sec).textContent = x.esquema.nombre;
    const tablero = $('.gd-tablero', sec);
    tm.datos.actos.forEach((a, i) => {
      const f = T && T.fondoEfectivo ? T.fondoEfectivo(a, i) : null;
      const nodos = tm.datos.puntos.filter(p => p.actoId === a.id && !tm.saltoDe(p.id))
        .sort((p, q) => p.celda - q.celda || fila(p.lineaId) - fila(q.lineaId));
      const card = document.createElement('section');
      card.className = 'gd-etq gd-acto' + (nodos.length ? '' : ' vacia');
      card.style.setProperty('--acto-bg', f && f !== 'ninguno' ? `var(--f-${f})` : 'transparent');
      card.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom"><span></span></span><span class="gd-etq-acc"><span class="gd-cuenta">${nodos.length}</span></span></header>
        <div class="gd-etq-body">${nodos.map(p => `<div class="gd-nota gd-nodo${p.cortado ? ' cortado' : ''}${p.id === notaSel ? ' sel' : ''}" role="button" tabindex="0" data-nodo="${esc(p.id)}" data-eid="${esc(eid)}" title="Doble clic: abrir documento">
            <span></span><span class="gd-nota-meta">${esc(fecha((m.notaEsquema(eid, p.id) || {}).modificado))}</span><button type="button" class="gd-nota-acc" data-gd-menu="nodo" title="Opciones del documento">${ic('more', 13)}</button></div>`).join('')
          || '<div class="gd-etq-vacia">Sin nodos en este acto</div>'}</div>`;
      $('.gd-etq-nom > span', card).textContent = a.nombre;
      $$('.gd-nodo', card).forEach((b, k) => { b.firstElementChild.textContent = nodos[k].titulo || 'Sin título'; });
      tablero.appendChild(card);
    });
    return sec;
  }
  /* La cabecera de la vista (50 px): «CONTENEDOR [Documentos] Nombre», como la del esquema. */
  function cabeceraHtml(cont, chip, nombre) {
    return `<header class="esq-cab"><div class="esq-titulo">${cont !== null ? '<span class="esq-cont"></span>' : ''}${chip || ''}<span class="esq-nom"></span></div></header>`;
  }
  function ponerCabecera(cont, nombre) {
    const c = $('.esq-cab .esq-cont', main); if (c) c.textContent = cont;
    $('.esq-cab .esq-nom', main).textContent = nombre;
  }
  function renderMain() {
    const m = modelo();
    if (!m) { main.innerHTML = '<div class="gd-nada"><b>No hay ningún guion abierto</b></div>'; return; }
    if (!actual) { main.innerHTML = '<div class="gd-nada"><b>No hay contenedores</b><br>Crea uno con «＋ Nuevo contenedor» en el menú.</div>'; return; }
    const seccion = t => `<div class="gd-seccion"><span class="gd-seccion-tit">${t}</span></div>`;
    if (esPapelera()) {
      const lista = m.papelera();
      main.innerHTML = cabeceraHtml(null, '', 'Papelera') + `<div class="gd-cuerpo">${seccion(`Notas tiradas · ${lista.length} · se eliminan solas a los ${C.DIAS_PAPELERA} días`)}
        <section class="gd-etq gd-etq--bandeja gd-papelera"><div class="gd-etq-body" data-gd-drop-cont="${PAPELERA}">${lista.length ? '' : '<div class="gd-etq-vacia">La papelera está vacía</div>'}</div></section></div>`;
      ponerCabecera('', 'Papelera');
      const cuerpo = $('.gd-papelera .gd-etq-body', main);
      lista.forEach(x => {
        const dias = diasEn(x.eliminadoEn);
        cuerpo.insertAdjacentHTML('beforeend', notaHtml(x.nota, 'de «' + (x.origenNombre || '?') + '» · ' + (dias ? 'hace ' + dias + (dias === 1 ? ' día' : ' días') : 'hoy'), true));
        const el = cuerpo.lastElementChild; el.firstElementChild.textContent = x.nota.titulo; el.title = 'Restáurala para abrirla · arrástrala a una biblioteca';
      });
    } else if (actual.tipo === 'cont') {
      const c = m.contenedor(actual.cid);
      main.innerHTML = cabeceraHtml(null, '', c.nombre) + '<div class="gd-cuerpo"><div class="gd-nada"><b>Este contenedor no tiene bibliotecas</b><br>Crea una con el «＋» del contenedor en el menú.</div></div>';
      ponerCabecera('', c.nombre);
    } else {
      const r = m.sub(actual.id), c = r.contenedor, s = r.sub;
      const etqs = m.etiquetasDe(s.id);
      main.innerHTML = cabeceraHtml(c.nombre, CHIPS.sub, s.nombre) + `<div class="gd-cuerpo"><section class="gd-bloque" data-seccion="segmentos">${seccion('Segmentos')}<div class="gd-tablero"></div></section></div>`;
      const tablero = $('.gd-tablero', main);
      tablero.appendChild(tarjeta(null, m.notasDe(s.id, null)));                          // la bandeja va primero
      etqs.forEach(e => tablero.appendChild(tarjeta(e, m.notasDe(s.id, e.id))));
      const nueva = document.createElement('button');
      nueva.type = 'button'; nueva.className = 'gd-etq-nueva'; nueva.dataset.gdMenu = 'paleta';
      nueva.innerHTML = '<span class="gd-etq-nueva-tit">' + ic('plus', 14) + 'nuevo segmento</span><span class="gd-muestras" aria-hidden="true">' + [0, 1, 3, 4, 6, 5].map(i => `<i style="background:${colores(i)[0]}"></i>`).join('') + '</span>';
      tablero.appendChild(nueva);
      /* con esquema enlazado, la cronología: arriba salvo `segmentosPrimero`; las dos secciones se
         intercalan arrastrando su título */
      const crono = cronologia(m, s.id);
      if (crono) {
        const cuerpo = $('.gd-cuerpo', main);
        if (s.segmentosPrimero) cuerpo.appendChild(crono); else cuerpo.prepend(crono);
        $$('.gd-bloque > .gd-seccion', main).forEach(h => { h.title = 'Arrastra el título para intercalar las secciones'; h.insertAdjacentHTML('afterbegin', `<span class="gd-asa">${ic('drag', 13)}</span>`); });
      }
      ponerCabecera(c.nombre, s.nombre);
    }
  }
  function renderMigas() {
    if (!migas) return;
    const m = modelo(); if (!m || !notaAbierta) { migas.innerHTML = ''; return; }
    const n = m.nota(notaAbierta), r = n && m.sub(n.subId); if (!r) { migas.innerHTML = ''; return; }
    const s = ref('sub', r.contenedor.id, r.sub.id);
    const e = n.etiquetaId ? m.etiqueta(n.etiquetaId) : null;
    /* «‹» cierra la nota y vuelve al tablero; cada miga lleva a su tablero */
    const sep = `<span class="migas-sep">${ic('chev-r', 12)}</span>`;
    migas.innerHTML = `<button type="button" class="icono gd-atras" data-gd-volver title="Volver al tablero">${ic('arr-l', 14)}</button>
      <button type="button" class="gd-miga" data-gd-ir="${esc(clave(entradaDe(r.contenedor)))}" data-gd-miga-cont></button>${sep}
      <button type="button" class="gd-miga" data-gd-ir="${esc(clave(s))}" data-gd-miga-sub></button>${sep}${tag(e && e.nombre, e && estiloTag(e))}${sep}<span class="migas-actual" data-gd-miga-nota></span>`;
    $('[data-gd-miga-cont]', migas).textContent = r.contenedor.nombre;
    $('[data-gd-miga-sub]', migas).textContent = r.sub.nombre;
    $('[data-gd-miga-nota]', migas).textContent = n.titulo;
  }
  let renderPendiente = false;
  function render() {
    if (pd && pd.activo) { renderPendiente = true; return; }   // durante un arrastre no se redibuja: se perdería lo que se arrastra
    if (editando) return; renderLado(); renderMain(); renderMigas(); if (enPersonajes() && o.carrusel && actual && actual.cid === C.ID_PERSONAJES) renderPersonaje(o.carrusel.querySelector('[data-per-cuerpo]'), actual.id); }
  /* abrir una aparición: una nota de biblioteca en el editor, o el documento de un nodo */
  function abrirAparicion(el) {
    const tipo = el.dataset.apTipo, id = el.dataset.apId;
    if (tipo === 'nota') abrirNota(id); else if (o.abrirNodo) o.abrirNodo(el.dataset.apEid, id);
  }

  /* ---------- notas en el editor ---------- */
  /* la barra está en todas las vistas. En Personajes la biblioteca del personaje se ve en el carrusel:
     crear notas o segmentos no cambia de vista (antes pasaba a Biblioteca y el tablero desaparecía); abrir
     una nota sí (`forzar`), porque el editor de notas vive en esa vista. */
  const enCarrusel = () => enPersonajes() && !!o.carrusel && !!actual && actual.cid === C.ID_PERSONAJES;
  const irAlTablero = forzar => { if (!forzar && enCarrusel()) return; if (o.mostrarTablero) o.mostrarTablero(); };
  function abrirNota(id) {
    const m = modelo(); if (!m) return;
    if (m.enPapelera(id)) { if (o.avisar) o.avisar('Está en la papelera: restáurala para abrirla'); return; }
    const n = m.nota(id), r = n && m.sub(n.subId); if (!r) return;
    irAlTablero(true);
    notaAbierta = id;
    navegar(ref('sub', r.contenedor.id, n.subId));
    document.body.classList.add('nota-abierta');
    o.texto.abrirDocumento({ titulo: n.titulo, html: n.html, characters: n.characters }, {
      guardar: doc => { const x = m.guardarNota(id, doc); if (x.ok && x.cambio && o.guardar) o.guardar(); },
      alCambiar: () => { renderMigas(); renderLado(); }
    });
    render();
  }
  function cerrarNota() {
    if (!notaAbierta) return;
    o.texto.cerrarDocumento();
    notaAbierta = null;
    document.body.classList.remove('nota-abierta');
    render();
    if (actual && actual.cid === C.ID_PERSONAJES && o.verPersonajes) o.verPersonajes();   // la nota era de un personaje
  }

  /* ---------- diálogo de creación (contenedor, o esquema / subcontenedor dentro de uno) ----------
     Devuelve { nombre, tipo } o null. Con `tipos`, enseña las dos tarjetas de tipo del rediseño. */
  function pedirNombre(op) {
    const dlg = $('#dlgNombre'); if (!dlg) { const v = window.prompt(op.titulo, ''); return Promise.resolve(v === null ? null : { nombre: v, tipo: op.tipo || null }); }
    const inp = $('input', dlg), ok = $('[data-dlg-ok]', dlg), cancel = $('[data-dlg-cancel]', dlg);
    $('[data-dlg-ceja]', dlg).textContent = op.ceja || ''; $('[data-dlg-titulo]', dlg).textContent = op.titulo;
    inp.value = op.valor || ''; inp.placeholder = op.pista || ''; ok.textContent = op.boton || 'Crear';
    const tipos = $('[data-dlg-tipos]', dlg); let tipo = op.tipo || null;
    /* el color (crear personaje) */
    const colBox = $('[data-dlg-colores]', dlg), grid = $('.dlg-paleta', dlg); let col = op.color === undefined ? null : op.color;
    colBox.hidden = col === null;
    if (col !== null) {
      grid.replaceChildren(...PAL.map((t, i) => { const b = document.createElement('button'); b.type = 'button'; b.title = t[0]; b.dataset.dlgColor = i; b.style.background = colores(i)[0]; return b; }));
      const pintarCol = () => $$('[data-dlg-color]', grid).forEach(b => b.classList.toggle('on', +b.dataset.dlgColor === col));
      $$('[data-dlg-color]', grid).forEach(b => { b.onclick = () => { col = +b.dataset.dlgColor; pintarCol(); inp.focus(); }; });
      pintarCol();
    }
    const pintarTipo = () => { $$('[data-dlg-tipo]', dlg).forEach(b => b.classList.toggle('on', b.dataset.dlgTipo === tipo)); $('[data-dlg-titulo]', dlg).textContent = op.tipos ? (tipo === 'esquema' ? 'Crear esquema de pasos' : 'Crear biblioteca') : op.titulo; };
    tipos.hidden = !op.tipos; pintarTipo();
    const habilitar = () => { ok.disabled = !inp.value.trim(); };   // «Crear» solo con un nombre escrito
    inp.oninput = habilitar; habilitar();
    return new Promise(resolve => {
      let hecho = false;
      const fin = v => { if (hecho) return; hecho = true; dlg.removeEventListener('close', alCerrar); if (dlg.open) dlg.close(); resolve(v === null ? null : { nombre: v, tipo, color: col }); };
      /* un `close` rezagado de la apertura anterior (llega tarde en algunos entornos) no cierra esta: si el
         diálogo sigue abierto, no es para nosotros */
      const alCerrar = () => { if (!dlg.open) fin(null); };
      dlg.addEventListener('close', alCerrar);
      $('form', dlg).onsubmit = e => { e.preventDefault(); if (inp.value.trim()) fin(inp.value); };
      cancel.onclick = () => fin(null);
      $$('[data-dlg-tipo]', dlg).forEach(b => { b.onclick = () => { tipo = b.dataset.dlgTipo; pintarTipo(); inp.focus(); }; });
      dlg.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); fin(null); } };
      dlg.showModal(); inp.focus(); inp.select();
    });
  }
  /* El diálogo de un personaje nuevo: nombre y color. */
  function pedirPersonaje(op) {
    return pedirNombre({ ceja: op.ceja || 'Nuevo personaje', titulo: op.titulo || 'Crear personaje', pista: 'Por ejemplo, Lestat', color: op.color || 0 });
  }
  async function nuevoContenedor() {
    if (!d) return;
    const r0 = await pedirNombre({ ceja: 'Nuevo contenedor', titulo: 'Crear contenedor', pista: 'Por ejemplo, Investigación' });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre para el contenedor'); return; }
    /* un contenedor nuevo trae un esquema enlazado a su biblioteca */
    const r = d.crearContenedor(r0.nombre, { vacio: true }); if (!r.ok) { tras(r); return; }
    const e = d.crearEsquema(r.contenedor.id, o.crearEsquemaDatos ? o.crearEsquemaDatos() : null, 'Esquema de pasos');
    if (e.ok) navegar(ref('sub', r.contenedor.id, e.sub.id));
    if (o.guardar) o.guardar(); render(); irAlTablero();
    if (e.ok && o.esquemaCreado) o.esquemaCreado(e.esquema.id);
  }
  /* El «＋» de un contenedor: un solo diálogo con el nombre y el tipo (esquema de pasos o subcontenedor). */
  async function nuevoHijo(cid, tipoInicial) {
    const c = d.contenedor(cid); if (!c) return;
    const r0 = await pedirNombre({ ceja: 'Nuevo en «' + c.nombre + '»', titulo: 'Crear', tipos: true, tipo: tipoInicial || 'sub', pista: 'Nombre' });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre'); return; }
    if (r0.tipo === 'esquema') {
      const r = d.crearEsquema(cid, o.crearEsquemaDatos ? o.crearEsquemaDatos() : null, r0.nombre);
      if (tras(r) && o.esquemaCreado) o.esquemaCreado(r.esquema.id);
    } else {
      const r = d.crearSub(cid, r0.nombre);
      if (tras(r)) { navegar(ref('sub', cid, r.sub.id)); render(); irAlTablero(); }
    }
  }
  const nuevoEsquema = cid => nuevoHijo(cid, 'esquema');
  const nuevoSub = cid => nuevoHijo(cid, 'sub');

  /* ---------- menús flotantes ---------- */
  let abierto = null, disparador = null;
  function cerrarPop() {
    if (!abierto) return;
    abierto.remove(); abierto = null;
    if (disparador) { disparador.classList.remove('is-active'); disparador = null; }
  }
  function abrirPop(trigger, nodo) {
    const igual = disparador === trigger;
    cerrarPop();
    if (igual) return;
    const el = document.createElement('div');
    el.className = 'gd-pop'; el.setAttribute('role', 'menu'); el.appendChild(nodo);
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
    const t = trigger.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    let x = t.left, y = t.bottom + 5;
    if (x + el.offsetWidth > W - 8) x = W - 8 - el.offsetWidth;
    if (y + el.offsetHeight > H - 8) y = Math.max(8, t.top - el.offsetHeight - 5);
    el.style.left = Math.max(8, x) + 'px'; el.style.top = y + 'px';
    trigger.classList.add('is-active');
    abierto = el; disparador = trigger;
    const primero = el.querySelector('button'); if (primero) primero.focus({ preventScroll: true });
  }
  const opcion = (texto, accion, extra) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = (extra && extra.clase) || ''; b.setAttribute('role', 'menuitem');
    if (extra && extra.punto) { const p = document.createElement('span'); p.className = 'gd-pop-punto'; p.style.background = extra.punto; b.appendChild(p); }
    b.appendChild(document.createTextNode(texto));
    b.addEventListener('click', () => { cerrarPop(); accion(); });
    return b;
  };
  const separador = () => Object.assign(document.createElement('div'), { className: 'gd-pop-sep' });
  const titulo = t => Object.assign(document.createElement('div'), { className: 'gd-pop-tit', textContent: t });
  const frag = (...xs) => { const f = document.createDocumentFragment(); xs.forEach(x => f.appendChild(x)); return f; };

  /* La paleta: crea un segmento con ese color (y pide su nombre) o recolorea uno existente. */
  function paleta(etiquetaId, subId) {
    const m = d, e = etiquetaId ? m.etiqueta(etiquetaId) : null, sid = subId || (actual && actual.tipo === 'sub' ? actual.id : null);
    const grid = document.createElement('div'); grid.className = 'gd-paleta';
    PAL.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t[0]; b.style.background = colores(i)[0];
      if (e && e.color === i) b.classList.add('on');
      b.addEventListener('click', () => {
        cerrarPop();
        if (e) { tras(m.colorearEtiqueta(e.id, i)); return; }
        const r = m.sub(sid); if (!r) return;
        navegar(ref('sub', r.contenedor.id, sid));
        const x = m.crearEtiqueta(sid, null, i);
        if (tras(x)) { irAlTablero(); renombrarEtiqueta(x.etiqueta.id); }
      });
      grid.appendChild(b);
    });
    return frag(titulo(e ? 'Color del segmento' : 'Nuevo segmento · elige un color'), grid);
  }
  function menuDestinos(tituloTexto, accion, salvoEtiqueta, subId) {
    const f = document.createDocumentFragment();
    f.appendChild(titulo(tituloTexto));
    if (salvoEtiqueta !== null) f.appendChild(opcion('Bandeja', () => accion(null), { punto: 'var(--hover-fuerte)' }));
    d.etiquetasDe(subId).forEach(e => { if (e.id !== salvoEtiqueta) f.appendChild(opcion(e.nombre, () => accion(e.id), { punto: colores(e.color)[0] })); });
    return f;
  }
  /* Enlazar: un esquema suelto elige entre los documentos sueltos de su contenedor, y al revés. Con enlace, quitarlo. */
  function menuEnlazar(s) {
    if (d.enlace(s.id)) return frag(opcion('Eliminar enlace…', () => quitarEnlace(s.id), { clase: 'peligro' }));
    const c = d.contenedor(s.cid); if (!c) return null;
    const esq = s.tipo === 'esquema';
    const candidatos = esq ? sueltosDe(c) : c.esquemas.filter(e => !e.subId);
    const f = frag(titulo(esq ? 'Enlazar con la biblioteca…' : 'Enlazar con el esquema…'));
    if (!candidatos.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: esq ? 'No hay bibliotecas sin enlace en «' + c.nombre + '»' : 'No hay esquemas sin enlace en «' + c.nombre + '»' }));
    candidatos.forEach(x => f.appendChild(opcion(x.nombre, () => tras(esq ? d.enlazar(s.id, x.id) : d.enlazar(x.id, s.id)))));
    return f;
  }
  /* Las opciones de un hijo (esquema o subcontenedor), en su fila del árbol. */
  function menuHijo(t, s) {
    const enlace = [d.enlace(s.id) ? opcion('Quitar enlace…', () => quitarEnlace(s.id), { clase: 'peligro' }) : opcion(s.tipo === 'esquema' ? 'Enlazar con una biblioteca…' : 'Enlazar con un esquema…', () => abrirPop(t, menuEnlazar(s)))];
    if (s.tipo === 'esquema') return frag(
      opcion('Abrir esquema', () => abrirEsquema(s.id)),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      separador(), ...enlace,
      opcion('Eliminar esquema', () => eliminarEsquema(s.id), { clase: 'peligro' }));
    return frag(
      opcion('Nueva nota', () => nuevaNota(s.id, null)),
      opcion('Nuevo segmento', () => abrirPop(t, paleta(null, s.id))),
      separador(),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      separador(), ...enlace,
      opcion('Eliminar biblioteca', () => eliminarSub(s.id), { clase: 'peligro' }));
  }
  const MENUS = {
    enlace: t => { const s = desclave((t.closest('.gd-par') || {}).dataset?.unidad); return s ? frag(opcion('Eliminar enlace…', () => quitarEnlace(s.id), { clase: 'peligro' })) : null; },
    /* clic derecho en un esquema o unos documentos: eliminar su enlace, o enlazarlo con uno suelto de su contenedor */
    enlazar: t => { const s = desclave((t.closest('.gd-sub') || {}).dataset?.sub); return s ? menuEnlazar(s) : null; },
    contenedor: t => {
      const fila = t.closest('.gd-cont'), c = d.contenedor(t.dataset.gdCid || (fila && fila.dataset.id)); if (!c) return null;
      return frag(
        opcion('Nuevo esquema…', () => nuevoEsquema(c.id)),
        opcion('Nueva biblioteca…', () => nuevoSub(c.id)),
        separador(),
        opcion('Renombrar', () => renombrarContenedor(c.id)),
        opcion(c.fijado ? 'Quitar de fijados' : 'Fijar', () => tras(d.fijarContenedor(c.id, !c.fijado))),
        separador(),
        opcion('Eliminar contenedor', async () => {
          const n = d.notasContenedor(c.id).length, ne = c.esquemas.length;
          if (await o.confirmar('¿Eliminar «' + c.nombre + '»?' + (n ? ' Sus ' + n + (n === 1 ? ' nota va' : ' notas van') + ' a la papelera.' : '') + (ne ? ' Se pierden sus ' + ne + (ne === 1 ? ' esquema' : ' esquemas') + ' de pasos.' : ''), 'Eliminar')) {
            if (d.notasContenedor(c.id).some(x => x.id === notaAbierta)) cerrarNota();
            const eids = c.esquemas.map(e => e.id);
            tras(d.eliminarContenedor(c.id));
            if (o.esquemaEliminado) eids.forEach(eid => o.esquemaEliminado(eid));
          }
        }, { clase: 'peligro' }));
    },
    hijo: t => { const s = desclave(t.dataset.gdSub || (t.closest('.gd-sub') || {}).dataset && t.closest('.gd-sub').dataset.sub); return s ? menuHijo(t, s) : null; },
    papelera: () => frag(opcion('Vaciar papelera', vaciarPapelera, { clase: 'peligro' })),
    personaje: t => {
      const id = t.closest('[data-personaje]').dataset.personaje;
      return frag(
        opcion('Abrir', () => o.abrirPersonaje && o.abrirPersonaje(id)),
        opcion('Renombrar', () => renombrarPersonaje(id)),
        opcion('Cambiar color', () => abrirPop(t, paletaPersonaje(id))),
        separador(),
        opcion('Eliminar personaje', () => o.eliminarPersonaje && o.eliminarPersonaje(id), { clase: 'peligro' }));
    },
    paleta: () => paleta(null),
    etiqueta: t => {
      const e = d.etiqueta(t.closest('.gd-etq').dataset.etq); if (!e) return null;
      return frag(
        opcion('Renombrar', () => renombrarEtiqueta(e.id)),
        opcion('Cambiar color', () => abrirPop(t, paleta(e.id))),
        opcion('Mover a la izquierda', () => tras(d.moverEtiqueta(e.id, -1))),
        opcion('Mover a la derecha', () => tras(d.moverEtiqueta(e.id, 1))),
        separador(),
        opcion('Eliminar segmento', () => eliminarEtiqueta(e.id), { clase: 'peligro' }));
    },
    /* un documento de la cronología: su nodo en el esquema enlazado */
    nodo: t => {
      const el = t.closest('[data-nodo]'), eid = el.dataset.eid, id = el.dataset.nodo;
      return frag(
        opcion('Abrir documento', () => o.abrirNodo(eid, id)),
        opcion('Renombrar', () => renombrarNodo(el)),
        opcion('Ver en el esquema', () => o.irAlNodo(id, eid)),
        separador(),
        opcion('Eliminar documento', () => eliminarNodo(eid, id), { clase: 'peligro' }));
    },
    mover: t => { const id = t.closest('[data-nota]').dataset.nota, n = d.nota(id); if (!n) return null; return menuDestinos('Mover a…', eid => tras(d.moverNota(id, eid)), n.etiquetaId, n.subId); },
    nota: t => {
      const id = t.closest('[data-nota]').dataset.nota;
      if (d.enPapelera(id)) {
        const x = d.enPapelera(id);
        return frag(
          opcion('Restaurar' + (x.origenNombre ? ' en «' + x.origenNombre + '»' : ''), () => tras(d.restaurarNota(id))),
          separador(),
          opcion('Eliminar del todo', async () => { if (await o.confirmar('¿Eliminar «' + x.nota.titulo + '» del todo? No se puede deshacer.', 'Eliminar')) tras(d.eliminarDefinitivo(id)); }, { clase: 'peligro' }));
      }
      const n = d.nota(id); if (!n) return null;
      return frag(
        opcion('Abrir documento', () => abrirNota(id)),
        opcion('Renombrar', () => renombrarNota(id, t.closest('[data-nota]'))),
        opcion('Mover a…', () => abrirPop(t, MENUS.mover(t))),
        separador(),
        opcion('Mover a la papelera', () => tirarNota(id), { clase: 'peligro' }));
    }
  };

  /* ---------- acciones ---------- */
  function abrirEsquema(eid) { if (eid && !d.esquema(eid)) return; if (o.abrirEsquema) o.abrirEsquema(eid || null); }
  /* Subir o bajar un hijo dentro de su contenedor. */
  /* Quitar el enlace entre un esquema y su documentos: pide confirmación y los deja sueltos. */
  async function quitarEnlace(id) {
    const x = d.enlace(id); if (!x) return;
    if (!await o.confirmar('¿Eliminar el enlace entre el esquema «' + x.esquema.nombre + '» y la biblioteca «' + x.sub.nombre + '»? Los dos se conservan con todo su contenido, pero dejarán de ir juntos en el menú. Se pueden volver a enlazar con clic derecho.', 'Eliminar enlace')) return;
    tras(d.quitarEnlace(id));
  }
  function renombrarHijo(s, t) {
    const fila = t && (t.classList && t.classList.contains('gd-sub') ? t : t.closest('.gd-sub'));
    const el = fila && fila.querySelector('.gd-sub-nom'); if (!el) return;
    const actualNombre = s.tipo === 'esquema' ? (d.esquema(s.id) || {}).esquema : (d.sub(s.id) || {}).sub; if (!actualNombre) return;
    editarEnSitio(el, actualNombre.nombre, v => { if (v !== null && v.trim()) tras(s.tipo === 'esquema' ? d.renombrarEsquema(s.id, v) : d.renombrarSub(s.id, v)); else render(); });
  }
  async function eliminarEsquema(eid) {
    const r = d.esquema(eid); if (!r) return;
    const n = Object.keys(r.esquema.notas).length;
    const x = d.enlace(eid);
    if (!await o.confirmar('¿Eliminar el esquema «' + r.esquema.nombre + '» de «' + r.contenedor.nombre + '»?' + (n ? ' Se pierden las notas de sus ' + n + (n === 1 ? ' nodo.' : ' nodos.') : '') + (x ? ' Su biblioteca «' + x.sub.nombre + '» se queda, suelta.' : ''), 'Eliminar')) return;
    if (tras(d.eliminarEsquema(eid)) && o.esquemaEliminado) o.esquemaEliminado(eid);
  }
  async function eliminarSub(id) {
    const r = d.sub(id); if (!r) return;
    const n = d.notasDe(id).length;
    const x = d.enlace(id);
    if (!await o.confirmar('¿Eliminar la biblioteca «' + r.sub.nombre + '» de «' + r.contenedor.nombre + '»?' + (n ? ' Sus ' + n + (n === 1 ? ' nota va' : ' notas van') + ' a la papelera.' : '') + (x ? ' Su esquema «' + x.esquema.nombre + '» se queda, suelto.' : ''), 'Eliminar')) return;
    if (d.notasDe(id).some(x => x.id === notaAbierta)) cerrarNota();
    if (actual && actual.id === id) actual = null;
    tras(d.eliminarSub(id));
  }
  /* Crear una nota no la abre: queda en su tarjeta hasta que se pulse. */
  function nuevaNota(subId, eid) {
    const primera = d.notasDe(subId, eid || null)[0];
    const r = d.crearNota(subId, eid);
    if (r.ok && primera) d.moverNota(r.nota.id, eid || null, subId, primera.id);   // la nueva va arriba, bajo «＋ nota»
    if (!tras(r)) return;
    const x = d.sub(subId), s = ref('sub', x.contenedor.id, subId);
    if (!mismo(actual, s)) { navegar(s); render(); }
    irAlTablero();
  }
  function tirarNota(id) {
    if (notaAbierta === id) cerrarNota();
    if (notaSel === id) notaSel = null;
    tras(d.tirarNota(id));
  }
  async function vaciarPapelera() {
    const n = d.papelera().length; if (!n) { tras(d.vaciarPapelera()); return; }
    if (await o.confirmar('¿Vaciar la papelera? Sus ' + n + (n === 1 ? ' nota se elimina' : ' notas se eliminan') + ' del todo.', 'Vaciar')) tras(d.vaciarPapelera());
  }
  async function eliminarEtiqueta(id) {
    const e = d.etiqueta(id); if (!e) return;
    const n = d.notasDe(e.subId, id).length;
    if (!n || await o.confirmar('¿Eliminar el segmento «' + e.nombre + '»? Sus ' + n + (n === 1 ? ' nota vuelve' : ' notas vuelven') + ' a la bandeja.', 'Eliminar')) tras(d.eliminarEtiqueta(id));
  }
  /* Renombrar en sitio: un campo sobre el nombre; Enter guarda, Esc o perder el foco cancela. */
  function editarEnSitio(el, valor, alFin) {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'gd-edit'; inp.value = valor; inp.setAttribute('aria-label', 'Nuevo nombre');
    el.replaceChildren(inp); inp.focus(); inp.select();
    editando = true;
    let hecho = false;
    const fin = v => { if (hecho) return; hecho = true; editando = false; alFin(v); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fin(inp.value); } if (e.key === 'Escape') { e.preventDefault(); fin(null); } });
    inp.addEventListener('blur', () => fin(null));
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('dblclick', e => e.stopPropagation());
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }
  function renombrarContenedor(id) {
    const c = d.contenedor(id); if (!c) return;
    const el = $(`.gd-cont[data-id="${id}"] [data-gd-nombre]`, lado); if (!el) return;
    editarEnSitio(el, c.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarContenedor(id, v)); else render(); });
  }
  /* Renombrar un documento de la cronología cambia el título de su nodo. */
  function renombrarNodo(el) {
    const eid = el.dataset.eid, id = el.dataset.nodo, tm = o.modeloDe && o.modeloDe(eid), p = tm && tm.punto(id); if (!p) return;
    editarEnSitio(el.firstElementChild, p.titulo, v => { if (v !== null && v.trim() && v.trim() !== p.titulo) { o.editarTituloNodo(eid, id, v.trim()); } render(); });
  }
  /* Eliminar un documento de la cronología borra su nodo del esquema (y las notas que colgaban de él). */
  async function eliminarNodo(eid, id) {
    const tm = o.modeloDe && o.modeloDe(eid), p = tm && tm.punto(id), r = d.esquema(eid); if (!p || !r) return;
    if (!await o.confirmar('¿Eliminar «' + (p.titulo || 'Sin título') + '»? También se borra su nodo del esquema «' + r.esquema.nombre + '» y lo escrito en su documento.', 'Eliminar')) return;
    if (notaSel === id) notaSel = null;
    tras(o.borrarNodo(eid, id));
  }
  /* El color de un personaje: la paleta de 16 del editor (se aplica en todas las notas). */
  function paletaPersonaje(id) {
    const p = d.personaje(id); if (!p) return null;
    const grid = document.createElement('div'); grid.className = 'gd-paleta';
    PAL.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t[0]; b.style.background = colores(i)[0];
      if (p.color === i) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); if (o.colorPersonaje) o.colorPersonaje(id, i); });
      grid.appendChild(b);
    });
    return frag(titulo('Color de «' + p.nombre + '»'), grid);
  }
  /* El selector de personajes del tablero de un personaje: elegir uno del guion para un carril (o, con
     `alQuitar`, dejarlo sin personaje). Desde el tablero no se crean personajes (Leo): eso queda para «/» en
     el editor y el menú lateral. `salvo`: los que no se ofrecen (el dueño y los que ya tienen carril). */
  function menuCarril(trigger, op) {
    const f = frag(titulo(op.titulo || 'Personaje del carril'));
    const lista = d.elenco().filter(p => !(op.salvo || []).includes(p.id));
    lista.forEach(p => f.appendChild(opcion(p.nombre, () => op.alElegir(p.id), { punto: colores(p.color)[0], clase: p.id === op.actual ? 'on' : '' })));
    if (!lista.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'No hay más personajes: créalos en el menú lateral o en el editor con «/»' }));
    if (op.alQuitar && op.actual) { f.appendChild(separador()); f.appendChild(opcion('Quitar el personaje', op.alQuitar, { clase: 'peligro' })); }
    abrirPop(trigger, f);
  }
  /* Renombrar un personaje en su fila del menú (cambia su nombre en las notas y en los carriles). */
  function renombrarPersonaje(id) {
    const el = $(`[data-personaje="${CSS.escape(id)}"] .gd-per-nom`, lado); if (!el) return;
    const P = o.personajes && o.personajes(), l = P && P.lista.find(x => x.id === id); if (!l) return;
    editarEnSitio(el, l.nombre, v => { if (v !== null && v.trim() && v.trim() !== l.nombre && o.renombrarPersonaje) o.renombrarPersonaje(id, v.trim()); render(); });
  }
  function renombrarEtiqueta(id) {
    const e = d.etiqueta(id); if (!e) return;
    const el = $(`.gd-etq[data-etq="${id}"] [data-gd-etq-nombre]`, enCarrusel() ? o.carrusel : main); if (!el) return;
    editarEnSitio(el, e.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarEtiqueta(id, v)); else render(); });
  }
  function renombrarNota(id, fila) {
    const el = fila && (fila.classList.contains('gd-nota') ? fila.firstElementChild : fila.children[1]);
    if (!el) return;
    if (d.enPapelera(id)) { if (o.avisar) o.avisar('Está en la papelera: restáurala para renombrarla'); return; }
    const n = d.nota(id); if (!n) return;
    editarEnSitio(el, n.titulo, v => {
      if (v !== null && v.trim() && v.trim() !== n.titulo) { if (tras(d.renombrarNota(id, v)) && notaAbierta === id) o.texto.abrirDocumento({ titulo: n.titulo, html: n.html, characters: n.characters }, null); }
      else render();
    });
  }

  /* ---------- arrastrar con clic sostenido (eventos de puntero y un fantasma) ----------
     Notas: a otro segmento o a la bandeja, dentro de su segmento para ordenarlas (quedan delante de la
     nota sobre la que se sueltan), a un subcontenedor o contenedor de la barra (a su bandeja) o a la
     papelera; desde la papelera, a un subcontenedor para restaurarlas. Segmentos: por su cabecera.
     Contenedores: por su fila, delante o detrás del que se suelta según la mitad. Esquemas y
     subcontenedores: por su fila, delante o detrás de otro de su clase (de cualquier contenedor) o
     al final del contenedor sobre el que se sueltan. */
  let pd = null, suprimirClic = 0;              // suprimirClic: marca de tiempo del último arrastre
  const bajo = (x, y) => document.elementFromPoint(x, y);
  /* En el carrusel de Personajes los segmentos que no se ven se alcanzan acercando el puntero a un borde:
     el carrusel se desplaza solo mientras el arrastre siga ahí. */
  const BORDE_AUTO = 70;
  function autodesplazar() {
    if (!pd || !pd.activo || pd.px === undefined) return;
    const car = o.carrusel && o.carrusel.querySelector('.per-carrusel'); if (!car) return;
    const r = car.getBoundingClientRect();
    if (pd.py < r.top || pd.py > r.bottom) return;
    const izq = pd.px - r.left, der = r.right - pd.px;
    const v = izq < BORDE_AUTO ? -Math.ceil((BORDE_AUTO - Math.max(izq, 0)) / 5) : der < BORDE_AUTO ? Math.ceil((BORDE_AUTO - Math.max(der, 0)) / 5) : 0;
    if (!v) return;
    const antes = car.scrollLeft; car.scrollLeft += v;
    if (car.scrollLeft !== antes) moverArrastre({ clientX: pd.px, clientY: pd.py });   // lo que queda bajo el puntero cambió
  }
  function iniciarArrastre() {
    pd.activo = true; seccion.classList.add('arrastrando'); lado.classList.add('arrastrando'); pd.el.classList.add('arrastrando');
    if (o.carrusel) o.carrusel.classList.add('arrastrando');
    pd.auto = setInterval(autodesplazar, 16);
    const f = (pd.tipo === 'seccion' ? pd.el.querySelector('.gd-seccion') : pd.el).cloneNode(true); f.className = 'gd-fantasma' + (pd.tipo === 'etq' ? ' gd-fantasma--etq' : ''); f.querySelectorAll('button').forEach(b => b.remove());
    f.style.width = Math.min(pd.el.offsetWidth, 260) + 'px'; document.body.appendChild(f); pd.fantasma = f;
    try { pd.el.setPointerCapture(pd.pid); } catch (_) {}
  }
  function marcar(zona, antes, mitad) {
    if (pd.zona !== zona) { if (pd.zona) pd.zona.classList.remove('sobre', 'sobre-antes', 'sobre-despues'); pd.zona = zona; if (zona) zona.classList.add('sobre'); }
    if (pd.antes !== antes) { if (pd.antes) pd.antes.classList.remove('antes'); pd.antes = antes; if (antes) antes.classList.add('antes'); }
    pd.mitad = mitad || null;
    if (zona) { zona.classList.toggle('sobre-antes', mitad === 'antes'); zona.classList.toggle('sobre-despues', mitad === 'despues'); }
  }
  const mitadDe = (fila, y) => { const r = fila.getBoundingClientRect(); return y < r.top + r.height / 2 ? 'antes' : 'despues'; };
  function moverArrastre(e) {
    pd.px = e.clientX; pd.py = e.clientY;
    pd.fantasma.style.left = (e.clientX + 12) + 'px'; pd.fantasma.style.top = (e.clientY + 8) + 'px';
    const el = bajo(e.clientX, e.clientY); if (!el || !el.closest) { marcar(null, null); return; }
    if (pd.tipo === 'etq') { const card = el.closest('.gd-etq[data-etq]'); marcar(card && card !== pd.el ? card : null, null); return; }
    if (pd.tipo === 'seccion') { const b = el.closest('.gd-bloque'); if (!b || b === pd.el) { marcar(null, null); return; } marcar(b, null, mitadDe(b, e.clientY)); return; }
    if (pd.tipo === 'cont') {                                // sobre otro contenedor: delante o detrás según la mitad
      const fila = el.closest('.gd-cont:not(.papelera)'); if (!fila || fila === pd.el) { marcar(null, null); return; }
      marcar(fila, null, mitadDe(fila, e.clientY)); return;
    }
    if (pd.tipo === 'hijo') {                                // sobre otra pieza de su clase: delante o detrás; sobre un contenedor: al final
      const u = el.closest('[data-unidad]');
      if (u && u !== pd.el) { const s = desclave(u.dataset.unidad); if (s && s.tipo === pd.ref.tipo) { marcar(u, null, mitadDe(u, e.clientY)); return; } }
      const cont = el.closest('.gd-cont:not(.papelera)'); marcar(cont || null, null); return;
    }
    const subEl = el.closest('[data-gd-drop-sub]');
    if (subEl) { marcar(subEl, null); return; }
    const cont = el.closest('[data-gd-drop-cont]');
    if (cont) { marcar(cont, null); return; }
    const zona = el.closest('[data-gd-drop]');
    if (!zona) { marcar(null, null); return; }
    /* dentro de una tarjeta: la nota bajo el puntero (por su mitad) es la que quedará detrás */
    let antes = null;
    for (const n of $$('.gd-nota', zona)) { if (n === pd.el) continue; const r = n.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { antes = n; break; } }
    marcar(zona, antes);
  }
  function terminarArrastre(soltar) {
    const { activo, zona, antes, id, el, fantasma, tipo, mitad } = pd, hijo = pd.ref; clearInterval(pd.auto); pd = null;
    seccion.classList.remove('arrastrando'); lado.classList.remove('arrastrando'); el.classList.remove('arrastrando');
    if (o.carrusel) o.carrusel.classList.remove('arrastrando');
    if (renderPendiente) { renderPendiente = false; setTimeout(render, 0); }
    if (fantasma) fantasma.remove(); if (zona) zona.classList.remove('sobre', 'sobre-antes', 'sobre-despues'); if (antes) antes.classList.remove('antes');
    if (!activo) return;
    suprimirClic = Date.now();
    if (!soltar || !zona) return;
    if (tipo === 'etq') {                                    // sobre uno de la derecha queda detrás de él; de la izquierda, delante
      const e = d.etiqueta(id), lista = e ? d.etiquetasDe(e.subId).map(x => x.id) : [];
      const i = lista.indexOf(id), j = lista.indexOf(zona.dataset.etq);
      tras(d.colocarEtiqueta(id, j > i ? (lista[j + 1] || null) : zona.dataset.etq)); return;
    }
    if (tipo === 'seccion') {                                // delante o detrás de la otra sección
      if (actual && actual.tipo === 'sub') tras(d.ordenarSecciones(actual.id, (id === 'crono') === (mitad === 'antes')));
      return;
    }
    if (tipo === 'cont') {
      const r = zona.dataset.id, lista = d.datos.contenedores.map(c => c.id), j = lista.indexOf(r);
      tras(d.colocarContenedor(id, mitad === 'antes' ? r : (lista[j + 1] || null))); return;
    }
    if (tipo === 'hijo') {
      const colocar = (antesDe, cid) => hijo.tipo === 'esquema' ? d.colocarEsquema(id, antesDe, cid) : d.colocarSub(id, antesDe, cid);
      if (zona.classList.contains('gd-cont')) { tras(colocar(null, zona.dataset.id)); return; }     // al final de ese contenedor
      const s = desclave(zona.dataset.unidad), c = s && d.contenedor(s.cid); if (!s || !c) return;
      const lista = (s.tipo === 'esquema' ? c.esquemas : sueltosDe(c)).map(x => x.id), j = lista.indexOf(s.id);
      tras(colocar(mitad === 'antes' ? s.id : (lista[j + 1] || null), c.id)); return;
    }
    const aSub = zona.dataset.gdDropSub !== undefined ? desclave(zona.dataset.gdDropSub) : null;
    if (aSub) {
      if (d.enPapelera(id)) { tras(d.restaurarNota(id, aSub.id)); return; }
      const r = d.sub(aSub.id); tras(d.moverNota(id, null, aSub.id)); if (r && o.avisar) o.avisar('Movida a «' + r.contenedor.nombre + ' › ' + r.sub.nombre + '» (bandeja)'); return;
    }
    if (zona.closest('.gd-sub--esquema')) { if (o.avisar) o.avisar('Un esquema de pasos no recibe notas: suéltala en una biblioteca'); return; }
    const aCont = zona.dataset.gdDropCont;
    if (aCont === PAPELERA) { if (!d.enPapelera(id)) tirarNota(id); return; }
    if (d.enPapelera(id)) { if (aCont !== undefined) tras(d.restaurarNota(id, aCont)); else if (o.avisar) o.avisar('Suéltala sobre una biblioteca del menú para restaurarla'); return; }
    if (aCont !== undefined) {
      const c = d.contenedor(aCont); if (!c) return;
      if (!c.subs.length) { if (o.avisar) o.avisar('«' + c.nombre + '» no tiene bibliotecas: crea una con su «＋»'); return; }
      tras(d.moverNota(id, null, c.subs[0].id)); if (o.avisar) o.avisar('Movida a «' + c.nombre + ' › ' + c.subs[0].nombre + '» (bandeja)'); return;
    }
    const n = d.nota(id); if (!n) return;
    tras(d.moverNota(id, zona.dataset.gdDrop || null, (actual && actual.tipo === 'sub' && actual.id) || n.subId, antes ? antes.dataset.nota : null));
  }

  /* ---------- arranque ---------- */
  function iniciar(opciones) {
    o = opciones || {};
    seccion = o.seccion; lado = o.lado; main = o.main; migas = o.migas;
    seccion.style.position = 'relative';
    const zonas = [seccion, lado, o.carrusel].filter(Boolean);   // la barra y el carrusel de Personajes viven fuera de la sección: mismos oyentes
    const oir = (tipo, fn) => zonas.forEach(z => z.addEventListener(tipo, fn));

    oir('click', e => {
      const t = e.target.closest('[data-gd-menu]');
      if (t) {
        e.preventDefault(); e.stopPropagation();
        if (!d) return;
        if (t.dataset.gdMenu === 'paleta' && !(actual && actual.tipo === 'sub')) { o.avisar && o.avisar('Aquí no hay segmentos'); return; }
        const nodo = MENUS[t.dataset.gdMenu] && MENUS[t.dataset.gdMenu](t);
        if (nodo) abrirPop(t, nodo);
        return;
      }
      cerrarPop();                                           // un clic en cualquier otro sitio cierra el menú
      e.stopPropagation();                                   // y no llega al tablero (lo tomaría por un clic en blanco)
      if (Date.now() - suprimirClic < 400) return;           // el clic que cierra un arrastre no es un clic
      if (e.target.closest('[data-gd-nuevo]')) { if (enPersonajes()) { if (o.nuevoPersonaje) o.nuevoPersonaje(); } else nuevoContenedor(); return; }
      if (e.target.closest('[data-gd-nuevo-personaje]')) { if (o.nuevoPersonaje) o.nuevoPersonaje(); return; }
      if (e.target.closest('[data-gd-ir-personajes]')) { if (o.verPersonajes) o.verPersonajes(); return; }
      if (e.target.closest('[data-gd-ir-contenedores]')) { if (o.verContenedores) o.verContenedores(); return; }
      const per = e.target.closest('[data-personaje]'); if (per) { if (o.abrirPersonaje) o.abrirPersonaje(per.dataset.personaje); return; }
      const nh = e.target.closest('[data-gd-nuevo-hijo]'); if (nh) { nuevoHijo(nh.closest('.gd-cont').dataset.id); return; }
      const ve = e.target.closest('[data-gd-ver-esquema]'); if (ve) { abrirEsquema(ve.dataset.gdVerEsquema); return; }
      const nodo = e.target.closest('[data-nodo]');
      if (nodo) {                                            // la cronología: un clic selecciona, doble clic abre
        notaSel = nodo.dataset.nodo;
        $$('.sel[data-nota], .sel[data-nodo]').forEach(x => x.classList.remove('sel')); nodo.classList.add('sel');
        return;
      }
      const ir = e.target.closest('[data-gd-ir]');
      if (ir) { const s = desclave(ir.dataset.gdIr); if (valido(s)) { navegar(s); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); } return; }
      if (e.target.closest('[data-gd-eliminar-etq]')) { eliminarEtiqueta(e.target.closest('.gd-etq').dataset.etq); return; }
      const crear = e.target.closest('[data-gd-crear-nota]'); if (crear) { if (actual && actual.tipo === 'sub') nuevaNota(actual.id, crear.dataset.gdCrearNota || null); return; }
      const plegar = e.target.closest('[data-gd-plegar]');
      if (plegar) {
        d.plegarContenedor(plegar.closest('.gd-cont').dataset.id); if (o.guardar) o.guardar();
        render(); return;
      }
      const nota = e.target.closest('[data-nota]');
      if (nota && nota.classList.contains('gd-nota-fila')) {   // en el árbol, un clic abre el documento (con espera: el doble clic renombra)
        clearTimeout(clicArbol); const id = nota.dataset.nota;
        clicArbol = setTimeout(() => { clicArbol = null; abrirNota(id); }, 260);
        return;
      }
      if (nota) {                                            // en el tablero, un clic selecciona (sin redibujar: el doble clic debe caer en el mismo elemento); doble clic abre
        notaSel = nota.dataset.nota;
        $$('[data-nota].sel').forEach(x => x.classList.remove('sel'));
        $$(`[data-nota="${notaSel}"]`).forEach(x => x.classList.add('sel'));
        return;
      }
      const subEl = e.target.closest('.gd-sub');
      if (subEl) {
        const s = desclave(subEl.dataset.sub); if (!s) return;
        if (s.tipo === 'esquema') { abrirEsquema(s.id); return; }
        navegar(s); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); return;
      }
      if (e.target.closest('[data-gd-lado]')) { if (o.alternarLado) o.alternarLado(); return; }
      /* la papelera (al pie o en el riel) abre su tablero; un contenedor no hace nada (Leo): se abre lo de dentro */
      if (e.target.closest('.gd-cont.papelera, [data-gd-papelera]')) {
        navegar(ref(PAPELERA, null)); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); return;
      }
    });
    oir('dblclick', e => {
      const ap = e.target.closest('.gd-aparicion'); if (ap) { e.stopPropagation(); abrirAparicion(ap); return; }
      const nodo = e.target.closest('[data-nodo]');
      if (nodo && !e.target.closest('button')) { e.stopPropagation(); o.abrirNodo(nodo.dataset.eid, nodo.dataset.nodo); return; }
      const nota = e.target.closest('[data-nota]');
      if (nota && !e.target.closest('button')) {
        e.stopPropagation();
        if (nota.classList.contains('gd-nota-fila')) { clearTimeout(clicArbol); clicArbol = null; renombrarNota(nota.dataset.nota, nota); }   // en el árbol: renombrar
        else abrirNota(nota.dataset.nota);                                                      // en el tablero: abrir
        return;
      }
      const cont = e.target.closest('.gd-cont:not(.papelera) [data-gd-nombre]'); if (cont) { e.stopPropagation(); renombrarContenedor(cont.closest('.gd-cont').dataset.id); return; }
      const per = e.target.closest('[data-personaje]'); if (per && !e.target.closest('button')) { e.stopPropagation(); renombrarPersonaje(per.dataset.personaje); return; }
      const fila = e.target.closest('.gd-sub'); if (fila) { e.stopPropagation(); const s = desclave(fila.dataset.sub); if (s) renombrarHijo(s, fila); return; }
      const etq = e.target.closest('[data-gd-etq-nombre]'); if (etq) { e.stopPropagation(); renombrarEtiqueta(etq.closest('.gd-etq').dataset.etq); }
    });
    if (migas) migas.addEventListener('click', e => {
      if (e.target.closest('[data-gd-volver]')) { e.stopPropagation(); cerrarNota(); return; }
      const ir = e.target.closest('[data-gd-ir]');
      if (ir) { e.stopPropagation(); const s = desclave(ir.dataset.gdIr); if (valido(s)) { navegar(s); cerrarNota(); irAlTablero(); } }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.gd-pop,[data-gd-menu]')) cerrarPop(); });

    /* Teclado: Esc cierra menús o limpia campos; Supr no llega al tablero */
    oir('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (pd) { terminarArrastre(false); return; }
        if (abierto) { const t = disparador; cerrarPop(); if (t) t.focus(); return; }
        return;
      }
      if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-nota]')) { e.preventDefault(); abrirNota(e.target.dataset.nota); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.gd-aparicion')) { e.preventDefault(); abrirAparicion(e.target); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-nodo]')) { e.preventDefault(); o.abrirNodo(e.target.dataset.eid, e.target.dataset.nodo); return; }
    });
    /* al pasar el ratón por un esquema o una biblioteca del árbol, un globo con su nombre completo (en la fila se corta) */
    const globo = document.createElement('div'); globo.className = 'gd-globo'; globo.hidden = true; document.body.appendChild(globo);
    let globoT = null;
    const esconderGlobo = () => { clearTimeout(globoT); globo.hidden = true; };
    lado.addEventListener('mouseover', e => {
      const f = e.target.closest('.gd-sub'); if (!f || !d || pd) { if (!f) esconderGlobo(); return; }
      if (globo.dataset.para === f.dataset.sub && !globo.hidden) return;
      esconderGlobo();
      const s = desclave(f.dataset.sub), x = s && (s.tipo === 'esquema' ? d.esquema(s.id) : d.sub(s.id)); if (!x) return;
      const nombre = (x.esquema || x.sub).nombre, tipo = s.tipo === 'esquema' ? 'Esquema' : 'Biblioteca';
      globoT = setTimeout(() => {
        if (!f.isConnected) return;
        globo.dataset.para = f.dataset.sub;
        globo.replaceChildren(Object.assign(document.createElement('span'), { className: 'gd-globo-rot', textContent: tipo }), document.createTextNode(nombre));
        globo.hidden = false;
        const r = f.getBoundingClientRect();
        globo.style.left = Math.min(r.right + 8, innerWidth - globo.offsetWidth - 8) + 'px';
        globo.style.top = (r.top + r.height / 2 - globo.offsetHeight / 2) + 'px';
      }, 350);
    });
    lado.addEventListener('mouseleave', esconderGlobo);
    lado.addEventListener('pointerdown', esconderGlobo);
    /* clic derecho en la guía que une un esquema con su documentos: quitar el enlace */
    lado.addEventListener('contextmenu', e => {
      const g = e.target.closest('[data-gd-enlace], .gd-sub'); if (!g || !d) return;
      e.preventDefault(); e.stopPropagation();
      const nodo = g.matches('[data-gd-enlace]') ? MENUS.enlace(g) : MENUS.enlazar(g);
      if (nodo) { if (abierto && disparador === g) cerrarPop(); abrirPop(g, nodo); }
    });

    oir('pointerdown', e => {
      if (e.button !== 0 || pd || e.target.closest('button, input, .gd-edit')) return;
      const base = { x0: e.clientX, y0: e.clientY, pid: e.pointerId, activo: false, zona: null, antes: null, fantasma: null, mitad: null };
      const hs = e.target.closest('.gd-bloque > .gd-seccion');   // el título de una sección: intercalar segmentos y cronología
      if (hs && $$('.gd-bloque', main).length > 1) { pd = Object.assign(base, { tipo: 'seccion', id: hs.parentElement.dataset.seccion, el: hs.parentElement }); return; }
      if (e.target.closest('.gd-crono, .gd-apariciones')) return;   // la cronología y las apariciones no se reordenan
      const cab = e.target.closest('.gd-etq:not(.gd-etq--bandeja) > .gd-etq-head');
      if (cab) { const card = cab.parentElement; pd = Object.assign(base, { tipo: 'etq', id: card.dataset.etq, el: card }); return; }
      const n = e.target.closest('[data-nota]'); if (n) { pd = Object.assign(base, { tipo: 'nota', id: n.dataset.nota, el: n }); return; }
      const u = e.target.closest('[data-unidad]');             // un esquema con su documentos enlazado se arrastra entero
      if (u) { const s = desclave(u.dataset.unidad); if (s) pd = Object.assign(base, { tipo: 'hijo', id: s.id, ref: s, el: u }); return; }
      if (e.target.closest('.gd-hijos')) return;
      const cont = e.target.closest('.gd-cont:not(.papelera)');
      if (cont) pd = Object.assign(base, { tipo: 'cont', id: cont.dataset.id, el: cont });
    });
    oir('pointermove', e => {
      if (!pd) return;
      if (!pd.activo) { if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < 5) return; iniciarArrastre(); }
      e.preventDefault(); moverArrastre(e);
    });
    oir('pointerup', () => { if (pd) terminarArrastre(true); });
    oir('pointercancel', () => { if (pd) terminarArrastre(false); });

    /* al cambiar de tema, los colores de los segmentos se pintan del otro par */
    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* Entrar y salir de la vista. Al salir, la nota abierta vuelve al gestor (se guarda antes). */
  function mostrar() { modelo(); render(); }
  function salir() { cerrarPop(); if (notaAbierta) cerrarNota(); }
  /* Al cambiar de guion (pestaña): nada abierto, y el modelo se rehace solo. */
  function reiniciar() { cerrarPop(); if (notaAbierta) { o.texto.cerrarDocumento(); notaAbierta = null; document.body.classList.remove('nota-abierta'); } d = null; guionId = null; actual = null; notaSel = null; render(); }

  /* Abre el tablero de unos documentos desde fuera («Ver documentos» del esquema, en app.js). */
  function abrirSub(id) {
    const m = modelo(), r = m && m.sub(id); if (!r) return;
    navegar(ref('sub', r.contenedor.id, id));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* ---------- Personajes: los segmentos de la biblioteca de un personaje, en carrusel ----------
     Las mismas tarjetas (y el mismo arrastre) que en una biblioteca; `actual` pasa a esa biblioteca. */
  /* «Apariciones»: las notas donde se nombra al personaje con «/», con su ruta; doble clic las abre. No se ordena ni se borra. */
  function tarjetaApariciones(lista) {
    const sec = document.createElement('section');
    sec.className = 'gd-etq gd-apariciones';
    sec.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom"><span>Apariciones</span></span><span class="gd-etq-acc"><span class="gd-cuenta">${lista.length}</span></span></header>
      <div class="gd-etq-body">${lista.map(x => `<div class="gd-aparicion" role="button" tabindex="0" data-ap-tipo="${esc(x.tipo)}" data-ap-id="${esc(x.id)}" data-ap-eid="${esc(x.eid || '')}" title="Doble clic: abrir la nota">
          <span class="gd-aparicion-lin"><span class="gd-aparicion-tit"></span><span class="gd-nota-meta">${esc(fecha(x.modificado))}</span></span><span class="gd-aparicion-ruta"></span></div>`).join('') || '<div class="gd-etq-vacia">Aún no aparece en ninguna nota</div>'}</div>`;
    $$('.gd-aparicion', sec).forEach((b, i) => { $('.gd-aparicion-tit', b).textContent = lista[i].titulo; $('.gd-aparicion-ruta', b).textContent = lista[i].ruta; });
    return sec;
  }
  let personajeId = null;
  function renderPersonaje(el, subId, pid) {
    if (pid !== undefined) personajeId = pid;
    const m = modelo(); if (!m || !el) return;
    const r = m.sub(subId); if (!r) { el.replaceChildren(); return; }
    navegar(ref('sub', r.contenedor.id, subId));
    const etqs = m.etiquetasDe(subId);
    /* el desplazamiento se conserva al redibujar el mismo personaje; otro empieza al principio (antes heredaba
       el del anterior y el carrusel brincaba al final si el nuevo tenía menos segmentos) */
    const previo = el.querySelector('.per-carrusel'), pista = previo && el.dataset.sub === subId ? previo.scrollLeft : 0;
    el.dataset.sub = subId;
    el.innerHTML = `<div class="per-seg-cab"><span class="gd-seccion-tit">Segmentos</span><span class="per-seg-n">${etqs.length}</span></div>
      <div class="per-carrusel gd-tablero"></div>`;
    const car = $('.per-carrusel', el);
    if (personajeId) car.appendChild(tarjetaApariciones(m.menciones(personajeId)));   // Apariciones primero y luego la bandeja (Leo)
    car.appendChild(tarjeta(null, m.notasDe(subId, null)));
    etqs.forEach(e => car.appendChild(tarjeta(e, m.notasDe(subId, e.id))));
    const nueva = document.createElement('button');
    nueva.type = 'button'; nueva.className = 'gd-etq-nueva'; nueva.dataset.gdMenu = 'paleta';
    nueva.innerHTML = '<span class="gd-etq-nueva-tit">' + ic('plus', 14) + 'nuevo segmento</span><span class="gd-muestras" aria-hidden="true">' + [0, 1, 4, 6, 5].map(i => `<i style="background:${colores(i)[0]}"></i>`).join('') + '</span>';
    car.appendChild(nueva);
    car.scrollLeft = pista;
    /* un desplazador horizontal normal (morado, siempre visible); la rueda vertical también desplaza */
    car.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.target.closest('.gd-etq-body')) { car.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }

  C.gestor = { iniciar, renderPersonaje, pedirPersonaje, renombrarPersonaje, menuCarril, mostrar, salir, reiniciar, render, abrirNota, cerrarNota, abrirSub, nuevoContenedor, notaAbierta: () => notaAbierta, subActual: () => actual, documentos: () => (o.guion ? modelo() : null), PAPELERA };
})(window.Claquedraw);
