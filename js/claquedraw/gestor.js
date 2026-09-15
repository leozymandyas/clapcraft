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
   [Documentos] Nombre», con «Ver esquema» si está enlazada). Con esquema enlazado o guiones ya generados
   va además la sección **Guiones generados** (`bloqueGuiones`).

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
  /* en el árbol manda la etiqueta de tipo, no el icono (rediseño): Esquema en violeta · Biblioteca en azul, enlazada o no */
  const CHIPS = { esquema: '<span class="gd-chip gd-chip--esquema">Esquema</span>', sub: '<span class="gd-chip gd-chip--sub">Biblioteca</span>',
                  enlazado: '<span class="gd-chip gd-chip--sub">Biblioteca</span>' };   // también enlazada, en azul (Leo): el mismo color que en las cabeceras

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
  function navegar(s) { actual = s; if (expandido && !(s && s.tipo === 'sub' && s.id === expandido.subId)) expandido = null; }

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
    /* la biblioteca de un esquema anuncia sus guiones generados (Revisar guión) */
    const nGuiones = s.tipo !== 'esquema' ? d.guionesDe(s.id).length : 0;
    if (nGuiones) $('.gd-sub-nom', fila).insertAdjacentHTML('afterend', `<span class="gd-guiones-cuenta" title="${nGuiones} ${nGuiones === 1 ? 'guion generado' : 'guiones generados'}" aria-label="Guiones generados: ${nGuiones}">${ic('script', 10)}${nGuiones}</span>`);   // corta: en el menú estrecho el nombre manda
    return fila;
  }
  /* Un contenedor y, debajo, lo suyo por niveles (rediseño «carpetas», 15-09-2026): primero sus carpetas, cada una
     con lo de dentro si está desplegada, y después sus esquemas (cada uno con su biblioteca enlazada, unidos por la
     guía) y las bibliotecas sueltas. Cada fila lleva su sangría (`--sangria`) y la guía de su nivel; lo que se
     arrastra como una pieza lleva `data-unidad`. */
  const SANGRIA = nivel => 2 + nivel * 11 + 7;               // la guía del nivel y 7 px de aire, como en el diseño
  const conSangria = (el, nivel) => { el.style.setProperty('--sangria', SANGRIA(nivel) + 'px'); if (!nivel) el.classList.add('sin-guia'); return el; };
  function filaCarpeta(k, ambito, nivel) {
    const f = document.createElement('div');
    f.className = 'gd-carpeta' + (k.plegada ? '' : ' abierta');
    f.dataset.carpeta = k.id; f.dataset.ambito = ambito;
    f.style.setProperty('--fc', 'var(--t-' + k.color + ')');
    f.innerHTML = `<span class="gd-chev">${ic(k.plegada ? 'chev-r' : 'chev-d', 12)}</span><span class="gd-carpeta-ic">${ic('folder', 15)}</span><span class="gd-carpeta-nom"></span>
      <span class="gd-cont-num">${d.cuentaCarpeta(k.id)}</span><span class="gd-cont-acc siempre"><button type="button" data-gd-menu="carpeta" title="Opciones de la carpeta">${ic('more', 14)}</button></span>`;
    $('.gd-carpeta-nom', f).textContent = k.nombre;
    return conSangria(f, nivel);
  }
  function nivelContenedor(c, carpetaId, nivel, destino) {
    /* en el orden propio del nivel: carpetas, esquemas (con su biblioteca) y bibliotecas sueltas, mezclados */
    d.nivelArbol(c.id, carpetaId).forEach(x => {
      if (x.tipo === 'carpeta') { destino.appendChild(filaCarpeta(x.obj, c.id, nivel)); if (!x.obj.plegada) nivelContenedor(c, x.id, nivel + 1, destino); return; }
      if (x.tipo === 'sub') { const rs = ref('sub', c.id, x.id), f = filaHijo(rs, false); f.dataset.unidad = clave(rs); destino.appendChild(conSangria(f, nivel)); return; }
      const e = x.obj, re = ref('esquema', c.id, e.id), sub = e.subId && c.subs.find(y => y.id === e.subId);
      if (!sub) { const f = filaHijo(re, false); f.dataset.unidad = clave(re); destino.appendChild(conSangria(f, nivel)); return; }
      const par = document.createElement('div');
      par.className = 'gd-par'; par.dataset.unidad = clave(re);
      par.innerHTML = '<span class="gd-enlace" data-gd-enlace title="Esquema y biblioteca enlazados · clic derecho para quitar el enlace"></span>';
      par.appendChild(filaHijo(re, true));
      par.appendChild(filaHijo(ref('sub', c.id, sub.id), true));
      destino.appendChild(conSangria(par, nivel));
    });
  }
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
    nivelContenedor(c, null, 1, hijos);
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
    const E = C.ELENCO_CARPETAS, arbol = document.createElement('div');
    arbol.className = 'gd-hijos gd-hijos--elenco';
    const filaPersonaje = (l, nivel) => {
      const f = document.createElement('div');
      f.className = 'gd-per' + (l.id === P.abierto ? ' activo' : ''); f.dataset.personaje = l.id;
      f.innerHTML = `<span class="gd-chip per-chip" style="--chl:${(PAL[l.color] || PAL[0])[1]};--chd:${(PAL[l.color] || PAL[0])[2]}">Personaje</span><span class="gd-per-nom"></span>
        <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="personaje" title="Opciones del personaje">${ic('more')}</button></span>`;
      $('.gd-per-nom', f).textContent = l.nombre;
      return conSangria(f, nivel);
    };
    const nivel = (carpetaId, n) => d.nivelArbol(E, carpetaId).forEach(x => {
      if (x.tipo === 'carpeta') { arbol.appendChild(filaCarpeta(x.obj, E, n)); if (!x.obj.plegada) nivel(x.id, n + 1); }
      else arbol.appendChild(filaPersonaje(x.obj, n));
    });
    nivel(null, 0);
    const nuevo = document.createElement('div');
    nuevo.className = 'gd-per gd-per--nuevo'; nuevo.dataset.gdNuevoPersonaje = ''; nuevo.dataset.gdRaizElenco = '';   // soltar aquí: a la raíz
    nuevo.innerHTML = `${ic('plus', 13)}<span class="gd-per-nom">personaje</span>`;
    arbol.appendChild(conSangria(nuevo, 0));
    /* y «＋ carpeta» (Leo): una carpeta en la raíz de Personajes, con el diálogo del nombre y el color */
    const carpeta = document.createElement('div');
    carpeta.className = 'gd-per gd-per--nuevo'; carpeta.dataset.gdNuevaCarpetaElenco = ''; carpeta.dataset.gdRaizElenco = '';
    carpeta.innerHTML = `${ic('plus', 13)}<span class="gd-per-nom">carpeta</span>`;
    arbol.appendChild(conSangria(carpeta, 0));
    return [arbol];
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
  /* el color de una nota (Leo, 15-09-2026): fondo pálido, borde y punto de su tono; sin color, papel */
  const colorNota = n => n && n.color ? { clase: ' con-color', estilo: ` style="--tc:var(--t-${esc(n.color)});--tf:var(--f-${esc(n.color)})"` } : { clase: '', estilo: '' };
  function notaHtml(n, meta, fijo) {
    const cn = colorNota(n);
    return `<div class="gd-nota${cn.clase}${n.id === notaAbierta ? ' activa' : ''}${n.id === notaSel ? ' sel' : ''}"${cn.estilo} role="button" tabindex="0" data-nota="${esc(n.id)}" title="${fijo ? 'Doble clic: abrir documento' : 'Doble clic: abrir documento · arrastra para moverla u ordenarla'}">
            <span></span><span class="gd-nota-meta">${esc(meta)}</span>
            <button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">${ic('more', 13)}</button></div>`;
  }
  /* Una tarjeta: un segmento (o la bandeja, e = null) con sus notas. */
  /* Una tarjeta: un segmento (o la bandeja, e = null) con sus notas. Con `guiones`, de la sección «Guiones generados»:
     cabecera negra sin color propio, «＋ documento» y sus documentos marcan si salieron de Revisar guión. */
  function tarjeta(e, notas, guiones) {
    const cuerpo = notas.map(n => notaHtml(n, fecha(n.modificado), false)).join('');
    const cabecera = `<span class="gd-etq-nom" data-globo="${e ? 'Segmento' : 'Bandeja'}"><span class="gd-asa" title="Arrastra para cambiar su posición">${ic('drag', 13)}</span>${guiones && !e ? `<span class="gd-guion-ico">${ic('script', 13)}</span>` : ''}<span ${e ? 'data-gd-etq-nombre' : ''}></span></span>
         <span class="gd-etq-acc"><span class="gd-cuenta">${notas.length}</span>${BOTON_EXPANDIR}${e
           ? `<button type="button" data-gd-menu="etiqueta" title="Editar el segmento">${ic('edit', 13)}</button><button type="button" data-gd-eliminar-etq title="Eliminar el segmento">${ic('close', 13)}</button>` : ''}</span>`;
    const pie = `<button type="button" class="gd-nota-add" data-gd-crear-nota="${e ? esc(e.id) : ''}"${guiones ? ' data-gd-guiones' : ''}>${ic('plus', 13)}${guiones ? 'documento' : 'nota'}</button>`;
    const sec = document.createElement('section');
    sec.className = 'gd-etq' + (e ? '' : ' gd-etq--bandeja') + (guiones ? ' gd-etq--guion' : '') + (notas.length ? '' : ' vacia');
    if (e) { sec.dataset.etq = e.id; if (!guiones) sec.setAttribute('style', estiloTag(e)); }
    sec.innerHTML = `<header class="gd-etq-head">${cabecera}</header><div class="gd-etq-body" data-gd-drop="${e ? esc(e.id) : ''}">${pie}${cuerpo}</div>`;
    $('.gd-etq-nom > span:last-child', sec).textContent = e ? e.nombre : 'Bandeja';
    $$('.gd-nota', sec).forEach(b => {
      const n = notas.find(x => x.id === b.dataset.nota); if (!n) return;
      b.firstElementChild.textContent = n.titulo;
      if (n.guion && n.guion.eid) b.firstElementChild.insertAdjacentHTML('afterend', '<span class="gd-generado">Generado</span>');
    });
    return sec;
  }
  /* El símbolo de un nodo de una línea de tiempo, como en el tablero: punto con aro del color de su trama
     (o el suyo), cuadro de cambio de escena o rombo de salto alternativo. */
  function glifo(tm, p) {
    const forma = tm.formaDe(p.id), l = tm.linea(p.lineaId);
    const color = p.color || (l && l.color) || 'gris';
    return `<i class="gd-glifo gd-glifo--${forma || 'punto'}${p.cortado ? ' cortado' : ''}" style="--gc: var(--t-${esc(color)})" aria-hidden="true"></i>`;
  }
  /* Una tarjeta por acto con sus nodos, cada uno un documento (la cronología de una biblioteca y los momentos
     de un personaje). `conSaltos`: en el tablero de un personaje los dos cuadros de una relación comparten un
     documento, que va una sola vez (el extremo de salida). */
  /* Los documentos de un acto (nodos, sin extremos de salto salvo `conSaltos`) en el orden de la biblioteca;
     sin orden guardado, el del tiempo. */
  function nodosDeActo(m, tm, a, conSaltos, subId) {
    const fila = l => tm.datos.lineas.findIndex(y => y.id === l);
    let nodos = tm.datos.puntos.filter(p => { if (p.actoId !== a.id) return false; const s = tm.saltoDe(p.id); return !s || (conSaltos && s.deId === p.id); })
      .sort((p, q) => p.celda - q.celda || fila(p.lineaId) - fila(q.lineaId));
    if (subId) { const orden = m.ordenNodos(subId, a.id, nodos.map(p => p.id)); nodos = orden.map(id => nodos.find(p => p.id === id)); }
    return nodos;
  }
  /* el fondo de un acto como valor CSS (el automático por posición, o transparente) */
  function fondoActo(tm, a) {
    const T = window.Tramas, i = tm.datos.actos.indexOf(a);
    const f = T && T.fondoEfectivo ? T.fondoEfectivo(a, i) : null;
    return f && f !== 'ninguno' ? `var(--f-${f})` : 'transparent';
  }
  const BOTON_EXPANDIR = `<button type="button" data-gd-expandir title="Expandir el segmento">${ic('expand', 13)}</button>`;
  function tarjetasActos(m, tm, eid, conSaltos, subId, op) {
    const nodoNombre = (tm.nombre ? tm.nombre('nodo') : 'Nodo').toLowerCase(), actoNombre = (tm.nombre ? tm.nombre('acto') : 'Acto').toLowerCase();
    /* el orden en que se ven los actos y sus documentos es el propio de la biblioteca (se cambia arrastrando);
       sin orden guardado, el de la línea de tiempo, que no cambia */
    const porId = new Map(tm.datos.actos.map(a => [a.id, a]));
    const actos = subId && !(op && op.natural) ? m.ordenActos(subId, tm.datos.actos.map(a => a.id)) : tm.datos.actos.map(a => a.id);   // en el carrusel el orden de las tarjetas lo pone ordenSegmentos
    return actos.map(aid => {
      const a = porId.get(aid);
      const nodos = nodosDeActo(m, tm, a, conSaltos, subId);
      const card = document.createElement('section');
      card.className = 'gd-etq gd-acto' + (nodos.length ? '' : ' vacia');
      card.dataset.acto = a.id; if (subId) card.dataset.sub = subId;
      card.style.setProperty('--acto-bg', fondoActo(tm, a));
      card.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom" data-globo="${esc(tm.nombre ? tm.nombre('acto') : 'Acto')}"><span class="gd-asa" title="Arrastra para cambiar su posición">${ic('drag', 13)}</span><span></span></span><span class="gd-etq-acc"><span class="gd-cuenta">${nodos.length}</span>${subId ? BOTON_EXPANDIR : ''}</span></header>
        <div class="gd-etq-body">${nodos.map(p => `<div class="gd-nota gd-nodo${p.cortado ? ' cortado' : ''}${p.id === notaSel ? ' sel' : ''}" role="button" tabindex="0" data-nodo="${esc(p.id)}" data-eid="${esc(eid)}" title="Doble clic: ir a su sección del documento">
            ${glifo(tm, p)}<span class="gd-nodo-tit"></span><span class="gd-nota-meta">${esc(fecha((m.notaEsquema(eid, p.id) || {}).modificado))}</span><button type="button" class="gd-nota-acc" data-gd-menu="nodo" title="Opciones del documento">${ic('more', 13)}</button></div>`).join('')
          || `<div class="gd-etq-vacia">Sin ${esc(nodoNombre)}s en este ${esc(actoNombre)}</div>`}</div>`;
      $('.gd-etq-nom > span:last-child', card).textContent = a.nombre;
      $$('.gd-nodo', card).forEach((b, k) => { $('.gd-nodo-tit', b).textContent = nodos[k].titulo || 'Sin título'; });
      return card;
    });
  }
  /* La cabecera de la vista (50 px): «CONTENEDOR [Documentos] Nombre», como la del esquema. */
  /* En las cabeceras cada lugar va en un chip con su nombre (el color dice qué es: esquema, biblioteca, segmento,
     personaje) y en negrita solo el documento abierto (Leo). `nombre` null: sin negrita. */
  function cabeceraHtml(cont, chip, nombre, acciones) {
    return `<header class="esq-cab"><div class="esq-titulo">${cont !== null ? '<span class="esq-cont"></span>' : ''}${chip || ''}${nombre === null ? '' : '<span class="esq-nom"></span>'}</div>${acciones ? '<span class="spacer"></span>' + acciones : ''}</header>`;
  }
  function ponerCabecera(cont, nombre) {
    const c = $('.esq-cab .esq-cont', main); if (c) c.textContent = cont;
    const n = $('.esq-cab .esq-nom', main); if (n) n.textContent = nombre;
  }
  /* Un chip con un nombre (cortado si es largo; entero al pasar el ratón). `op`: { boton, attrs, estilo, title, icono } */
  function chipNombre(nombre, clase, op) {
    op = op || {};
    const tagName = op.boton ? 'button' : 'span';
    return `<${tagName}${op.boton ? ' type="button"' : ''} class="gd-chip gd-chip-nom ${clase}"${op.estilo ? ` style="${esc(op.estilo)}"` : ''}${op.attrs || ''} aria-label="${esc(op.title || nombre)}"><span>${esc(nombre)}</span>${op.icono || ''}</${tagName}>`;   // sin title: cortado, sale el globo (texto.js)
  }
  /* ---------- segmento expandido ----------
     Cualquier segmento (bandeja, segmento, acto de la cronología, momento o Apariciones) se abre en grande con
     el icono de expandir de su cabecera o con su etiqueta en la cabecera del editor: ocupa el lienzo (el menú no
     cambia), con sus notas en rejilla, sus primeras líneas y su fecha. La nota que se editaba queda marcada.
     «Contraer», la miga o Esc devuelven al tablero de la biblioteca o al carrusel del personaje. */
  let expandido = null;          // { subId, clave } · clave: 'bandeja' | 'etq:<id>' | 'acto:<id>' | 'apariciones'
  const textoDe = html => {
    if (!html) return '';
    const t = document.createElement('template');
    t.innerHTML = String(html).replace(/<div class="db"[\s\S]*?<\/div>/g, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, ' ');
    return t.content.textContent.replace(/\s+/g, ' ').trim().slice(0, 320);
  };
  /* Lo que enseña un segmento expandido, o null si ya no existe. */
  function datosSegmento(m, subId, claveSeg) {
    const r = m.sub(subId); if (!r || !claveSeg) return null;
    const per = r.contenedor.id === C.ID_PERSONAJES, pid = per ? r.sub.lineaId : null;
    const [tipo, id] = claveSeg.split(/:(.*)/s);
    const base = { tipo, r, per, pid };
    if (tipo === 'bandeja') return Object.assign(base, { nombre: 'Bandeja', rotulo: 'Bandeja', notas: m.notasDe(subId, null), etq: '' });
    if (tipo === 'guiones') return Object.assign(base, { nombre: 'Bandeja', rotulo: 'Guiones generados', notas: m.notasDe(subId, C.SEGMENTO_GUIONES), etq: '', guiones: true });
    if (tipo === 'etq') {
      const e = m.etiqueta(id); if (!e || e.subId !== subId) return null;
      return Object.assign(base, { nombre: e.nombre, rotulo: 'Segmento', estilo: e.guiones ? '' : estiloTag(e), e, notas: m.notasDe(subId, e.id), etq: e.id, guiones: !!e.guiones });
    }
    if (tipo === 'acto') {
      const eid = per ? (o.esquemaPersonaje && o.esquemaPersonaje(pid)) : ((m.enlace(subId) || {}).esquema || {}).id;
      const tm = eid && o.modeloDe && o.modeloDe(eid), a = tm && tm.acto(id); if (!a) return null;
      return Object.assign(base, { nombre: a.nombre, rotulo: tm.nombre ? tm.nombre('acto') : 'Acto', fondo: fondoActo(tm, a), a, tm, eid, nodos: nodosDeActo(m, tm, a, per, subId) });
    }
    if (tipo === 'apariciones' && pid) return Object.assign(base, { nombre: 'Apariciones', rotulo: 'Segmento', apariciones: m.menciones(pid) });
    return null;
  }
  /* La vista: cabecera «CONTENEDOR [Biblioteca] Nombre › [Segmento] Nombre», la banda del segmento con
     «Contraer» y la rejilla de notas. `cab`: { cont, chip (html), nombre }. */
  function vistaExpandida(m, x, cab) {
    const el = document.createElement('div');
    el.className = 'gd-exp' + (x.apariciones ? ' gd-exp--apariciones' : '');
    const subId = x.r.sub.id;
    let n = 0, tarjetas = '', rejilla = '';
    const pie = (meta, ruta) => `<div class="gd-exp-pie">${ruta ? '<span class="gd-exp-ruta"></span>' : `<span class="gd-nota-meta">${esc(meta)}</span>`}</div>`;
    if (x.notas) {
      n = x.notas.length;
      tarjetas = x.notas.map(nt => `<div class="gd-exp-nota${colorNota(nt).clase}${nt.id === notaSel ? ' sel' : ''}"${colorNota(nt).estilo} role="button" tabindex="0" data-nota="${esc(nt.id)}" title="Doble clic: abrir documento · arrastra para ordenarla">
          <div class="gd-exp-nota-cab"><span class="gd-exp-tit"></span><span class="gd-asa" aria-hidden="true">${ic('drag', 13)}</span><button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">${ic('more', 13)}</button></div>
          <div class="gd-exp-texto"></div>${pie(fecha(nt.modificado))}</div>`).join('')
        + `<button type="button" class="gd-exp-add" data-gd-crear-nota="${esc(x.etq)}"${x.guiones ? ' data-gd-guiones' : ''}>${ic('plus', 14)}${x.guiones ? 'documento' : 'nota'}</button>`;
      rejilla = `<div class="gd-exp-grid" data-gd-drop="${esc(x.etq)}">${tarjetas}</div>`;
    } else if (x.nodos) {
      n = x.nodos.length;
      tarjetas = x.nodos.map(p => `<div class="gd-exp-nota gd-nodo${p.cortado ? ' cortado' : ''}${p.id === notaSel ? ' sel' : ''}" role="button" tabindex="0" data-nodo="${esc(p.id)}" data-eid="${esc(x.eid)}" title="Doble clic: ir a su sección del documento · arrastra para ordenarlo">
          <div class="gd-exp-nota-cab">${glifo(x.tm, p)}<span class="gd-exp-tit gd-nodo-tit"></span><span class="gd-asa" aria-hidden="true">${ic('drag', 13)}</span><button type="button" class="gd-nota-acc" data-gd-menu="nodo" title="Opciones del documento">${ic('more', 13)}</button></div>
          <div class="gd-exp-texto"></div>${pie(fecha((m.notaEsquema(x.eid, p.id) || {}).modificado))}</div>`).join('');
      const vacio = n ? '' : `<div class="gd-exp-vacio">Sin ${esc((x.tm.nombre ? x.tm.nombre('nodo') : 'nodo').toLowerCase())}s en este ${esc(x.rotulo.toLowerCase())}: créalos en su línea de tiempo</div>`;
      rejilla = `<div class="gd-exp-grid" data-acto="${esc(x.a.id)}" data-sub="${esc(subId)}">${tarjetas}${vacio}</div>`;
    } else {
      n = x.apariciones.length;
      tarjetas = x.apariciones.map(ap => `<div class="gd-exp-nota gd-exp-ref" role="button" tabindex="0" data-ap-tipo="${esc(ap.tipo)}" data-ap-id="${esc(ap.id)}" data-ap-eid="${esc(ap.eid || '')}" title="Doble clic: abrir la nota">
          <div class="gd-exp-nota-cab">${ap.tipo === 'nodo' ? glifoDe(ap.eid, ap.id) : ''}<span class="gd-exp-tit"></span><span class="gd-nota-meta">${esc(fecha(ap.modificado))}</span></div>
          <div class="gd-exp-texto"></div>${pie('', true)}</div>`).join('');
      rejilla = `<div class="gd-exp-grid">${tarjetas}${n ? '' : '<div class="gd-exp-vacio">Aún no aparece en ninguna nota</div>'}</div>`;
    }
    const docs = x.nodos ? 'documentos' : 'notas';
    const acciones = x.e ? `<div class="gd-exp-banda-acc"><button type="button" data-gd-renombrar-etq title="Renombrar el segmento">${ic('edit', 15)}</button><button type="button" data-gd-menu="etiqueta" title="Opciones del segmento">${ic('more', 15)}</button></div>` : '';
    const estiloBanda = x.estilo || (x.fondo ? `--sbg:${x.fondo};--sink:var(--tinta)` : '');
    el.innerHTML = `<header class="esq-cab gd-exp-cab"><div class="esq-titulo">
        <button type="button" class="esq-cont gd-miga" data-gd-contraer title="Volver"></button>${cab.chip}
        ${chipNombre(x.nombre, 'gd-seg-chip' + (x.guiones ? ' gd-seg-chip--guiones' : x.tipo === 'bandeja' ? ' gd-seg-chip--bandeja' : '') + (x.tipo === 'apariciones' ? ' gd-seg-chip--apariciones' : ''), { estilo: estiloBanda, title: x.rotulo + ' «' + x.nombre + '»' })}
      </div></header>
      <div class="gd-exp-cuerpo">
        <div class="gd-exp-banda${x.tipo === 'bandeja' ? ' gd-exp-banda--bandeja' : ''}${x.guiones ? ' gd-exp-banda--guiones' : ''}${x.tipo === 'apariciones' ? ' gd-exp-banda--apariciones' : ''}"${x.e ? ` data-etq="${esc(x.e.id)}"` : ''} style="${esc(estiloBanda)}">
          <span class="gd-exp-banda-nom"><span ${x.e ? 'data-gd-etq-nombre' : ''}></span></span><span class="gd-exp-banda-n">${n} ${n === 1 ? docs.slice(0, -1) : docs}</span>
          ${acciones ? '<i class="gd-exp-banda-sep"></i>' + acciones : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-gd-contraer title="Volver (Esc)">${ic('collapse', 15)}Contraer</button>
        </div>
        <div class="gd-exp-rot"><span>${x.nodos ? 'Documentos del ' + esc(x.rotulo.toLowerCase()) : 'Notas del segmento'}</span><i></i>${x.apariciones ? '' : `<span>Orden manual</span>${ic('sort', 14)}`}</div>
        ${rejilla}
      </div>`;
    $('.esq-cont', el).textContent = cab.cont;
    $('.gd-exp-banda-nom > span', el).textContent = x.nombre;
    /* títulos y primeras líneas */
    const cards = $$('.gd-exp-nota', el);
    if (x.notas) cards.forEach((c, i) => { const nt = x.notas[i]; $('.gd-exp-tit', c).textContent = nt.titulo || 'Sin título'; $('.gd-exp-texto', c).textContent = textoDe(nt.html); });
    else if (x.nodos) cards.forEach((c, i) => { const p = x.nodos[i]; $('.gd-exp-tit', c).textContent = p.titulo || 'Sin título'; $('.gd-exp-texto', c).textContent = textoDe((m.notaEsquema(x.eid, p.id) || {}).html) || p.descripcion || ''; });
    else cards.forEach((c, i) => {
      const ap = x.apariciones[i], doc = ap.tipo === 'nota' ? m.nota(ap.id) : m.notaEsquema(ap.eid, ap.id);
      $('.gd-exp-tit', c).textContent = ap.titulo; $('.gd-exp-texto', c).textContent = textoDe(doc && doc.html); $('.gd-exp-ruta', c).textContent = 'en «' + ap.ruta + '»';
    });
    $$('.gd-exp-texto', el).forEach(t => { if (!t.textContent) { t.textContent = 'Sin texto'; t.classList.add('vacio'); } });
    return el;
  }
  /* Expandir un segmento (con `sel`, la nota que queda marcada). En Personajes se abre en su pantalla. */
  function expandir(subId, claveSeg, sel) {
    const m = modelo(), r = m && m.sub(subId); if (!r || !datosSegmento(m, subId, claveSeg)) return;
    if (sel !== undefined) notaSel = sel;
    expandido = { subId, clave: claveSeg };
    navegar(ref('sub', r.contenedor.id, subId));
    if (r.contenedor.id === C.ID_PERSONAJES) {
      if (notaAbierta) { o.texto.cerrarDocumento(); notaAbierta = null; document.body.classList.remove('nota-abierta'); }
      if (o.abrirPersonaje) o.abrirPersonaje(r.sub.lineaId);
      return;
    }
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero(true);
  }
  function contraer() {
    if (!expandido) return;
    expandido = null;
    render();
    const v = [main, o.carrusel].filter(Boolean).map(z => z.querySelector('.gd-etq-body [data-nota].sel, .gd-etq-body [data-nodo].sel')).find(x => x && x.offsetParent !== null);
    if (v) v.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /* el título de la sección de segmentos, como el de «Guiones generados»: muestra, nombre, cuenta y raya */
  const seccionSegmentos = n => `<div class="gd-seccion"><span class="gd-muestra" aria-hidden="true"></span><span class="gd-seccion-tit">Segmentos</span><span class="gd-seccion-cuenta">${n}</span><i class="gd-seccion-linea"></i></div>`;
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
      const x = expandido && expandido.subId === s.id && datosSegmento(m, s.id, expandido.clave);
      if (x) { main.replaceChildren(vistaExpandida(m, x, { cont: c.nombre, chip: chipNombre(s.nombre, 'gd-chip--sub', { boton: true, attrs: ' data-gd-contraer', title: 'Volver a la biblioteca «' + s.nombre + '»' }) })); return; }
      if (expandido && expandido.subId === s.id) expandido = null;   // el segmento ya no existe
      const etqs = m.etiquetasDe(s.id), enl = m.enlace(s.id);
      /* «Ver esquema» a la derecha de la cabecera si la biblioteca está enlazada (rediseño 12: antes iba en la cronología) */
      const verEsq = enl && enl.esquema ? `<button type="button" class="btn" data-gd-ver-esquema="${esc(enl.esquema.id)}" title="Abrir el esquema enlazado a esta biblioteca">${ic('board', 15)}Ver esquema</button>` : '';
      main.innerHTML = cabeceraHtml(c.nombre, chipNombre(s.nombre, 'gd-chip--sub', { title: 'Biblioteca «' + s.nombre + '»' }), null, verEsq) + `<div class="gd-cuerpo"><section class="gd-bloque" data-seccion="segmentos">${seccionSegmentos(etqs.length + 1)}<div class="gd-tablero"></div></section></div>`;
      const tablero = $('.gd-tablero', main);
      /* la bandeja y los segmentos en el orden de la biblioteca (se cambia arrastrando; la bandeja también) */
      tablero.dataset.orden = ''; tablero.dataset.sub = s.id;
      const piezas = new Map([['bandeja', tarjeta(null, m.notasDe(s.id, null))]]);
      etqs.forEach(e => piezas.set('etq:' + e.id, tarjeta(e, m.notasDe(s.id, e.id))));
      m.ordenSegmentos(s.id, Array.from(piezas.keys())).forEach(k => { const card = piezas.get(k); card.dataset.clave = k; tablero.appendChild(card); });
      const nueva = document.createElement('button');
      nueva.type = 'button'; nueva.className = 'gd-etq-nueva'; nueva.dataset.gdMenu = 'paleta';
      nueva.innerHTML = '<span class="gd-etq-nueva-tit">' + ic('plus', 14) + 'nuevo segmento</span><span class="gd-muestras" aria-hidden="true">' + [0, 1, 3, 4, 6, 5].map(i => `<i style="background:${colores(i)[0]}"></i>`).join('') + '</span>';
      tablero.appendChild(nueva);
      /* con esquema enlazado (o con guiones ya generados), la sección «Guiones generados» (Leo, 15-09-2026: en lugar de la
         cronología): arriba salvo `segmentosPrimero`; las dos secciones se intercalan arrastrando su título */
      if (m.enlace(s.id) || m.guionesDe(s.id).length || m.guionesSegmentosDe(s.id).length) {
        const cuerpo = $('.gd-cuerpo', main), bloque = bloqueGuiones(m, s);
        if (s.segmentosPrimero) cuerpo.appendChild(bloque); else cuerpo.prepend(bloque);
        $$('.gd-bloque > .gd-seccion', main).forEach(h => { h.title = 'Arrastra el título para intercalar las secciones'; h.insertAdjacentHTML('afterbegin', `<span class="gd-asa">${ic('drag', 13)}</span>`); });
      }
      ponerCabecera(c.nombre, null);
    }
  }
  /* «Guiones generados» (Leo, 15-09-2026, docs/diseno/rediseno-12/): como la sección de segmentos, con su bandeja (donde caen los
     guiones que genera Revisar guión) y segmentos propios, todos con cabecera negra; sus documentos solo se mueven entre las
     tarjetas de esta sección. Orden propio (`ordenGuiones`) y «nuevo segmento de guiones» al final. */
  function bloqueGuiones(m, s) {
    const sec = document.createElement('section');
    sec.className = 'gd-bloque gd-bloque--guiones'; sec.dataset.seccion = 'guiones';
    const etqs = m.guionesSegmentosDe(s.id);
    sec.innerHTML = `<div class="gd-seccion"><span class="gd-muestra gd-muestra--guiones" aria-hidden="true"></span><span class="gd-seccion-tit">Guiones generados</span><span class="gd-seccion-cuenta">${etqs.length + 1}</span><i class="gd-seccion-linea"></i></div>
      <div class="gd-tablero" data-grupo="guiones"></div>`;
    const tablero = $('.gd-tablero', sec);
    tablero.dataset.orden = ''; tablero.dataset.sub = s.id;
    const piezas = new Map([['bandeja', tarjeta(null, m.notasDe(s.id, C.SEGMENTO_GUIONES), true)]]);
    etqs.forEach(e => piezas.set('etq:' + e.id, tarjeta(e, m.notasDe(s.id, e.id), true)));
    m.ordenGuiones(s.id, Array.from(piezas.keys())).forEach(k => { const card = piezas.get(k); card.dataset.clave = k; if (k === 'bandeja') card.dataset.expClave = 'guiones'; tablero.appendChild(card); });
    const nueva = document.createElement('button');
    nueva.type = 'button'; nueva.className = 'gd-etq-nueva gd-etq-nueva--guiones'; nueva.dataset.gdNuevoSegGuiones = '';
    nueva.innerHTML = `<span class="gd-etq-nueva-tit">${ic('plus', 14)}nuevo segmento de guiones</span>`;
    tablero.appendChild(nueva);
    return sec;
  }
  /* La cabecera de una nota de biblioteca abierta en el editor: la misma que la de un documento de esquema
     (Leo): «CONTENEDOR [Biblioteca] [segmento] título», con el título editable (renombra la nota), «Ver
     biblioteca» y ‹ › para la nota anterior o siguiente de su segmento. En Personajes: «PERSONAJES [nombre]». */
  const hermanasDe = (m, n) => m.notasDe(n.subId, n.etiquetaId || null);
  function renderMigas() {
    if (!migas) return;
    const m = modelo(); if (!m || !notaAbierta) { migas.innerHTML = ''; delete migas.dataset.migaNota; return; }
    const n = m.nota(notaAbierta), r = n && m.sub(n.subId); if (!r) { migas.innerHTML = ''; delete migas.dataset.migaNota; return; }
    const hermanas = hermanasDe(m, n), i = hermanas.findIndex(x => x.id === n.id);
    const nom = $('[data-gd-miga-nom]', migas);
    if (nom && !nom.readOnly && migas.dataset.migaNota === n.id) return;   // renombrando: no se redibuja
    const s = ref('sub', r.contenedor.id, r.sub.id);
    const e = n.etiquetaId ? m.etiqueta(n.etiquetaId) : null;
    const per = r.contenedor.id === C.ID_PERSONAJES;
    if (n.guion) { migasGuion(m, n, r, s); return; }
    /* la etiqueta del segmento (o de la bandeja), como un chip de la cabecera: al pulsarla, el segmento expandido */
    const nomSeg = e ? e.nombre : 'Bandeja';
    const chipSeg = chipNombre(nomSeg, 'gd-seg-chip' + (e ? '' : ' gd-seg-chip--bandeja'), { boton: true, attrs: ' data-gd-expandir-nota', estilo: e ? estiloTag(e) : '', icono: ic('expand', 12),
      title: (e ? 'Segmento «' + e.nombre + '»' : 'Bandeja') + ' · pulsa para expandirlo' });
    /* la biblioteca (en Personajes, el personaje con su color): al pulsarla, su tablero */
    const pj = per && m.personaje(r.sub.lineaId), pt = pj && PAL[pj.color];
    const chipSub = per
      ? chipNombre(pj ? pj.nombre : r.sub.nombre, 'per-chip', { boton: true, attrs: ' data-gd-volver', estilo: pt ? `--chl:${pt[1]};--chd:${pt[2]}` : '', title: 'Volver a «' + (pj ? pj.nombre : r.sub.nombre) + '»' })
      : chipNombre(r.sub.nombre, 'gd-chip--sub', { boton: true, attrs: ` data-gd-ir="${esc(clave(s))}"`, title: 'Biblioteca «' + r.sub.nombre + '»' });
    migas.dataset.migaNota = n.id;   // no `data-nota`: el tablero de tramas lo tomaría por uno de sus post-it y bloquearía el clic
    migas.innerHTML = `<div class="esq-titulo">
        <button type="button" class="esq-cont gd-miga" ${per ? 'data-gd-volver' : `data-gd-ir="${esc(clave(entradaDe(r.contenedor)))}"`} data-gd-miga-cont></button>
        ${chipSub}${chipSeg}
        <input type="text" class="texto-nom" data-gd-miga-nom readonly spellcheck="false" autocomplete="off" placeholder="Sin título" aria-label="Título del documento">
      </div>
      <span class="spacer"></span>
      <button type="button" class="btn" data-gd-volver title="${per ? 'Volver al personaje' : 'Volver a la biblioteca'}">${ic(per ? 'person' : 'docs', 15)}${per ? 'Ver personaje' : 'Ver biblioteca'}</button>
      <span class="par-nav"><button type="button" data-gd-miga-mover="-1" ${i > 0 ? '' : 'disabled'} title="Nota anterior del segmento" aria-label="Nota anterior">${ic('arr-l', 13)}</button><button type="button" data-gd-miga-mover="1" ${i >= 0 && i < hermanas.length - 1 ? '' : 'disabled'} title="Nota siguiente del segmento" aria-label="Nota siguiente">${ic('arr-r', 13)}</button></span>`;
    $('[data-gd-miga-cont]', migas).textContent = per ? 'Personajes' : r.contenedor.nombre;
    $('[data-gd-miga-nom]', migas).value = n.titulo;
  }
  /* La cabecera de un documento de «Guiones generados» (rediseño 11, «Documento plano»): «CONTENEDOR [Biblioteca] [segmento de
     guiones] título» y de dónde salió y cuándo (Leo, 15-09-2026: sin «Regenerar»). */
  function migasGuion(m, n, r, s) {
    const x = m.esquema(n.guion.eid);
    migas.dataset.migaNota = n.id;
    migas.innerHTML = `<div class="esq-titulo">
        <button type="button" class="esq-cont gd-miga" data-gd-ir="${esc(clave(entradaDe(r.contenedor)))}" data-gd-miga-cont></button>
        ${chipNombre(r.sub.nombre, 'gd-chip--sub', { boton: true, attrs: ` data-gd-ir="${esc(clave(s))}"`, title: 'Biblioteca «' + r.sub.nombre + '»' })}
        ${chipNombre(n.etiquetaId && m.etiqueta(n.etiquetaId) ? m.etiqueta(n.etiquetaId).nombre : 'Guiones generados', 'gd-seg-chip gd-seg-chip--guiones', { boton: true, attrs: ` data-gd-ir="${esc(clave(s))}"`, title: 'Guiones generados de la biblioteca' })}
        <input type="text" class="texto-nom" data-gd-miga-nom readonly spellcheck="false" autocomplete="off" placeholder="Sin título" aria-label="Título del documento">
      </div>
      <span class="spacer"></span>
      <span class="gd-miga-origen" data-gd-miga-origen></span>`;
    $('[data-gd-miga-cont]', migas).textContent = r.contenedor.nombre;
    $('[data-gd-miga-nom]', migas).value = n.titulo;
    $('[data-gd-miga-origen]', migas).textContent = n.guion.eid ? (x ? 'Generado desde ' + x.esquema.nombre : 'Generado') + ' · ' + fechaHora(n.guion.generado) : 'Documento de guiones';
  }
  function fechaHora(t) {
    if (!t) return '';
    const dt = new Date(t), hh = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    return fecha(t) + ' ' + hh;
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
    grid.classList.toggle('dlg-paleta--carpeta', !!op.paleta);
    if (col !== null) {
      /* la paleta: la de 16 del editor (personajes) o la que se pida (`op.paleta`: [{ valor, fondo, titulo }], carpetas) */
      const paletaDlg = op.paleta || PAL.map((t, i) => ({ valor: i, fondo: colores(i)[0], titulo: t[0] }));
      grid.replaceChildren(...paletaDlg.map((x, i) => { const b = document.createElement('button'); b.type = 'button'; b.title = x.titulo; b.dataset.dlgColor = i; b.style.background = x.fondo; return b; }));
      const pintarCol = () => $$('[data-dlg-color]', grid).forEach(b => b.classList.toggle('on', paletaDlg[+b.dataset.dlgColor].valor === col));
      $$('[data-dlg-color]', grid).forEach(b => { b.onclick = () => { col = paletaDlg[+b.dataset.dlgColor].valor; pintarCol(); inp.focus(); }; });
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
  /* El «＋» de un contenedor: un solo diálogo con el nombre y el tipo (esquema de pasos o subcontenedor). Desde
     el ⋯ de una carpeta, nace dentro de ella. */
  async function nuevoHijo(cid, tipoInicial, carpetaId) {
    const c = d.contenedor(cid); if (!c) return;
    const k = carpetaId && d.carpeta(carpetaId);
    const r0 = await pedirNombre({ ceja: 'Nuevo en «' + (k ? k.carpeta.nombre : c.nombre) + '»', titulo: 'Crear', tipos: true, tipo: tipoInicial || 'sub', pista: 'Nombre' });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre'); return; }
    const abrirCarpeta = () => { if (k) { d.plegarCarpeta(carpetaId, false); if (c.plegado) d.plegarContenedor(cid, false); } };
    if (r0.tipo === 'esquema') {
      const r = d.crearEsquema(cid, o.crearEsquemaDatos ? o.crearEsquemaDatos() : null, r0.nombre);
      if (r.ok && k) { d.moverACarpeta('esquema', r.esquema.id, carpetaId); abrirCarpeta(); }
      if (tras(r) && o.esquemaCreado) o.esquemaCreado(r.esquema.id);
    } else {
      const r = d.crearSub(cid, r0.nombre);
      if (r.ok && k) { d.moverACarpeta('sub', r.sub.id, carpetaId); abrirCarpeta(); }
      if (tras(r)) { navegar(ref('sub', cid, r.sub.id)); render(); irAlTablero(); }
    }
  }
  /* Carpetas: el diálogo pide el nombre y el color (los de las tramas). `ambito`: un contenedor o Personajes. */
  const PALETA_CARPETA = () => C.COLORES_CARPETA.map(x => ({ valor: x, fondo: 'var(--t-' + x + ')', titulo: { azul: 'Azul', violeta: 'Violeta', verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo', gris: 'Gris' }[x] }));
  async function nuevaCarpeta(ambito, padreId) {
    const padre = padreId && d.carpeta(padreId), c = ambito === C.ELENCO_CARPETAS ? null : d.contenedor(ambito);
    const donde = padre ? padre.carpeta.nombre : c ? c.nombre : 'Personajes';
    const usados = d.hijasDe(ambito, padreId).map(k => k.color), libre = C.COLORES_CARPETA.find(x => !usados.includes(x)) || 'azul';
    const r0 = await pedirNombre({ ceja: 'Nueva carpeta en «' + donde + '»', titulo: 'Crear carpeta', pista: 'Por ejemplo, Temporada 1', paleta: PALETA_CARPETA(), color: libre });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre para la carpeta'); return; }
    const r = d.crearCarpeta(ambito, r0.nombre, r0.color, padreId || null);
    if (r.ok) { if (padreId) d.plegarCarpeta(padreId, false); if (c && c.plegado) d.plegarContenedor(c.id, false); }
    tras(r);
  }
  function renombrarCarpeta(id) {
    const r = d.carpeta(id); if (!r) return;
    const el = $(`.gd-carpeta[data-carpeta="${CSS.escape(id)}"] .gd-carpeta-nom`, lado); if (!el) return;
    editarEnSitio(el, r.carpeta.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarCarpeta(id, v)); else render(); });
  }
  async function eliminarCarpeta(id) {
    const r = d.carpeta(id); if (!r) return;
    const n = d.cuentaCarpeta(id) + d.hijasDe(r.ambito, id).length, arriba = r.carpeta.padreId && d.carpeta(r.carpeta.padreId);
    const destino = arriba ? '«' + arriba.carpeta.nombre + '»' : r.contenedor ? 'la raíz de «' + r.contenedor.nombre + '»' : 'la raíz de Personajes';
    if (n && !await o.confirmar('¿Eliminar la carpeta «' + r.carpeta.nombre + '»? Lo que hay dentro no se pierde: pasa a ' + destino + '.', 'Eliminar')) return;
    tras(d.eliminarCarpeta(id));
  }
  /* El color de una nota de biblioteca: los 24 tonos de tramas y nodos, y «Sin color» (papel). */
  /* Quita la marca de la nota (o documento de nodo) elegida con un clic, sin redibujar; también el foco que le dejó el clic. */
  function soltarSeleccion() {
    if (!notaSel) return;
    notaSel = null;
    $$('.sel[data-nota]:not(.gd-nota-fila), .sel[data-nodo]').forEach(x => { x.classList.remove('sel'); if (document.activeElement === x) x.blur(); });
  }
  /* El color de la trama de un carril (tablero de un personaje): los mismos 24 tonos. */
  function paletaTrama(trigger, actualColor, alElegir) {
    const grid = document.createElement('div'); grid.className = 'gd-paleta gd-paleta--nota';
    C.TONOS_NOTA.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t.charAt(0).toUpperCase() + t.slice(1); b.style.background = `var(--t-${t})`;
      if (actualColor === t) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); alElegir(t); });
      grid.appendChild(b);
    });
    abrirPop(trigger, frag(titulo('Color de la trama'), grid));
  }
  function paletaNota(id) {
    const n = d.nota(id); if (!n) return null;
    const grid = document.createElement('div'); grid.className = 'gd-paleta gd-paleta--nota';
    C.TONOS_NOTA.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t.charAt(0).toUpperCase() + t.slice(1); b.style.background = `var(--t-${t})`;
      if (n.color === t) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); tras(d.colorearNota(id, t)); });
      grid.appendChild(b);
    });
    const sin = opcion('Sin color', () => tras(d.colorearNota(id, null)), { clase: n.color ? '' : 'on' });
    return frag(titulo('Color de «' + n.titulo + '»'), grid, separador(), sin);
  }
  function paletaCarpeta(id) {
    const r = d.carpeta(id); if (!r) return null;
    const grid = document.createElement('div'); grid.className = 'gd-paleta gd-paleta--carpeta';
    PALETA_CARPETA().forEach(x => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = x.titulo; b.style.background = x.fondo;
      if (r.carpeta.color === x.valor) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); tras(d.colorearCarpeta(id, x.valor)); });
      grid.appendChild(b);
    });
    return frag(titulo('Color de «' + r.carpeta.nombre + '»'), grid);
  }
  /* «Mover a carpeta…»: la raíz y las carpetas de su ámbito, sangradas por nivel */
  function menuMoverCarpeta(tipo, id, ambito, actual) {
    const f = frag(titulo('Mover a…'));
    const raiz = opcion(ambito === C.ELENCO_CARPETAS ? 'Personajes (sin carpeta)' : 'Raíz de «' + ((d.contenedor(ambito) || {}).nombre || '') + '»', () => tras(d.moverACarpeta(tipo, id, null, ambito)), { clase: actual ? '' : 'on' });
    f.appendChild(raiz);
    const nivel = (padreId, n) => d.hijasDe(ambito, padreId).forEach(k => {
      const b = opcion(k.nombre, () => tras(d.moverACarpeta(tipo, id, k.id)), { punto: 'var(--t-' + k.color + ')', clase: k.id === actual ? 'on' : '' });
      b.style.paddingLeft = (12 + n * 14) + 'px'; f.appendChild(b); nivel(k.id, n + 1);
    });
    nivel(null, 0);
    if (!d.carpetasDe(ambito).length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'Aún no hay carpetas: créalas con «Nueva carpeta…» en el ⋯' }));
    return f;
  }
  async function nuevoPersonajeEn(carpetaId) {
    const p = o.nuevoPersonaje ? await o.nuevoPersonaje() : null;
    if (p && carpetaId && d) { d.moverACarpeta('personaje', p.id, carpetaId); d.plegarCarpeta(carpetaId, false); if (o.guardar) o.guardar(); render(); }
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
  /* mover una carpeta: a la raíz o dentro de otra de su ámbito que no sea ella ni una suya */
  function menuMoverCarpetaDe(id) {
    const r = d.carpeta(id); if (!r) return null;
    const fuera = d._descendientes(r.ambito, id), f = frag(titulo('Mover «' + r.carpeta.nombre + '» a…'));
    f.appendChild(opcion(r.contenedor ? 'Raíz de «' + r.contenedor.nombre + '»' : 'Personajes (sin carpeta)', () => tras(d.moverACarpeta('carpeta', id, null, r.ambito)), { clase: r.carpeta.padreId ? '' : 'on' }));
    const nivel = (padreId, n) => d.hijasDe(r.ambito, padreId).forEach(k => {
      if (fuera.has(k.id)) return;
      const b = opcion(k.nombre, () => tras(d.moverACarpeta('carpeta', id, k.id)), { punto: 'var(--t-' + k.color + ')', clase: k.id === r.carpeta.padreId ? 'on' : '' });
      b.style.paddingLeft = (12 + n * 14) + 'px'; f.appendChild(b); nivel(k.id, n + 1);
    });
    nivel(null, 0);
    return f;
  }
  function menuHijo(t, s) {
    const actualCarpeta = ((s.tipo === 'esquema' ? (d.esquema(s.id) || {}).esquema : (d.sub(s.id) || {}).sub) || {}).carpetaId || null;
    const mover = opcion('Mover a carpeta…', () => abrirPop(t, menuMoverCarpeta(s.tipo === 'esquema' ? 'esquema' : 'sub', s.id, s.cid, actualCarpeta)));
    const enlace = [d.enlace(s.id) ? opcion('Quitar enlace…', () => quitarEnlace(s.id), { clase: 'peligro' }) : opcion(s.tipo === 'esquema' ? 'Enlazar con una biblioteca…' : 'Enlazar con un esquema…', () => abrirPop(t, menuEnlazar(s)))];
    if (s.tipo === 'esquema') return frag(
      opcion('Abrir esquema', () => abrirEsquema(s.id)),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      mover,
      separador(), ...enlace,
      opcion('Eliminar esquema', () => eliminarEsquema(s.id), { clase: 'peligro' }));
    return frag(
      opcion('Nueva nota', () => nuevaNota(s.id, null)),
      opcion('Nuevo segmento', () => abrirPop(t, paleta(null, s.id))),
      separador(),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      mover,
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
        opcion('Nueva carpeta…', () => nuevaCarpeta(c.id, null)),
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
    carpeta: t => {
      const id = t.closest('[data-carpeta]').dataset.carpeta, r = d.carpeta(id); if (!r) return null;
      return frag(
        opcion('Nueva carpeta…', () => nuevaCarpeta(r.ambito, id)),
        ...(r.contenedor ? [opcion('Nuevo esquema…', () => nuevoHijo(r.contenedor.id, 'esquema', id)), opcion('Nueva biblioteca…', () => nuevoHijo(r.contenedor.id, 'sub', id))]
          : [opcion('Nuevo personaje…', () => nuevoPersonajeEn(id))]),
        separador(),
        opcion('Renombrar', () => renombrarCarpeta(id)),
        opcion('Cambiar color', () => abrirPop(t, paletaCarpeta(id))),
        opcion('Mover a…', () => abrirPop(t, menuMoverCarpetaDe(id))),
        separador(),
        opcion('Eliminar carpeta', () => eliminarCarpeta(id), { clase: 'peligro' }));
    },
    papelera: () => frag(opcion('Vaciar papelera', vaciarPapelera, { clase: 'peligro' })),
    personaje: t => {
      const id = t.closest('[data-personaje]').dataset.personaje;
      return frag(
        opcion('Abrir', () => o.abrirPersonaje && o.abrirPersonaje(id)),
        opcion('Renombrar', () => renombrarPersonaje(id)),
        opcion('Cambiar color', () => abrirPop(t, paletaPersonaje(id))),
        opcion('Mover a carpeta…', () => abrirPop(t, menuMoverCarpeta('personaje', id, C.ELENCO_CARPETAS, (d.personaje(id) || {}).carpetaId || null))),
        opcion('Nueva carpeta…', () => nuevaCarpeta(C.ELENCO_CARPETAS, (d.personaje(id) || {}).carpetaId || null)),
        separador(),
        opcion('Eliminar personaje', () => o.eliminarPersonaje && o.eliminarPersonaje(id), { clase: 'peligro' }));
    },
    paleta: () => paleta(null),
    etiqueta: t => {
      const e = d.etiqueta(t.closest('[data-etq]').dataset.etq); if (!e) return null;
      if (e.guiones) return frag(opcion('Renombrar', () => renombrarEtiqueta(e.id)), separador(), opcion('Eliminar segmento', () => eliminarEtiqueta(e.id), { clase: 'peligro' }));
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
        opcion('Ir a su sección', () => o.abrirNodo(eid, id)),
        opcion('Renombrar', () => renombrarNodo(el)),
        opcion('Ver esquema', () => o.irAlNodo(id, eid)),
        separador(),
        opcion('Eliminar nodo…', () => eliminarNodo(eid, id), { clase: 'peligro' }));
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
      if (n.guion) return frag(
        opcion('Abrir guion', () => abrirNota(id)),
        opcion('Renombrar', () => renombrarNota(id, t.closest('[data-nota]'))),
        opcion('Exportar…', () => { if (C.exportar) C.exportar.menu(t, () => ({ titulo: n.titulo, html: (d.nota(id) || n).html }), o.avisar); }),
        opcion('Color…', () => abrirPop(t, paletaNota(id))),
        separador(),
        opcion('Mover a la papelera', () => tirarNota(id), { clase: 'peligro' }));
      return frag(
        opcion('Abrir documento', () => abrirNota(id)),
        opcion('Renombrar', () => renombrarNota(id, t.closest('[data-nota]'))),
        opcion('Color…', () => abrirPop(t, paletaNota(id))),
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
  function nuevaNota(subId, eid, guiones) {
    const primera = d.notasDe(subId, eid || (guiones ? C.SEGMENTO_GUIONES : null))[0];
    const r = d.crearNota(subId, eid, undefined, { guiones });
    if (r.ok && primera) d.moverNota(r.nota.id, eid || null, subId, primera.id);   // la nueva va arriba, bajo «＋ nota»
    if (!tras(r)) return;
    const x = d.sub(subId), s = ref('sub', x.contenedor.id, subId);
    if (!mismo(actual, s)) { navegar(s); render(); }
    irAlTablero();
    /* como al crear un segmento: el nombre propuesto seleccionado para escribir encima; en blanco se queda «Sin título» */
    const fila = [main, o.carrusel].filter(Boolean).map(z => z.querySelector(`[data-gd-drop] > [data-nota="${CSS.escape(r.nota.id)}"]`)).find(x => x && x.offsetParent !== null);
    if (fila) { fila.scrollIntoView({ block: 'nearest', inline: 'nearest' }); renombrarNota(r.nota.id, fila); }
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
    editarEnSitio($('.gd-nodo-tit', el) || el.firstElementChild, p.titulo, v => { if (v !== null && v.trim() && v.trim() !== p.titulo) { o.editarTituloNodo(eid, id, v.trim()); } render(); });
  }
  /* Eliminar un documento de la cronología borra su nodo del esquema (y las notas que colgaban de él). */
  async function eliminarNodo(eid, id) {
    const tm = o.modeloDe && o.modeloDe(eid), p = tm && tm.punto(id), r = d.esquema(eid); if (!p || !r) return;
    if (!await o.confirmar('¿Eliminar «' + (p.titulo || 'Sin título') + '»? Se borra su nodo del esquema «' + r.esquema.nombre + '» y su sección del documento, con lo escrito en ella.', 'Eliminar')) return;
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
    const el = $(`[data-etq="${id}"] [data-gd-etq-nombre]`, enCarrusel() ? o.carrusel : main); if (!el) return;
    editarEnSitio(el, e.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarEtiqueta(id, v)); else render(); });
  }
  function renombrarNota(id, fila) {
    const el = fila && (fila.querySelector('.gd-exp-tit') || (fila.classList.contains('gd-nota') ? fila.firstElementChild : fila.children[1]));
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
  /* al pulsar lo que se puede arrastrar se nota enseguida («agarrado»: se levanta un poco); al moverse, lo
     arrastrado queda en hueco punteado y lo sigue un fantasma */
  function agarrar() { if (pd && pd.el) { pd.el.classList.add('agarrado'); document.body.classList.add('gd-agarrando'); } }
  function soltarAgarre(el) { if (el) el.classList.remove('agarrado'); document.body.classList.remove('gd-agarrando'); }
  function fantasmaTarjeta(card) {
    const f = document.createElement('div');
    f.className = 'gd-fantasma gd-fantasma--tarjeta';
    const cab = card.querySelector('.gd-etq-head'), cs = getComputedStyle(cab);
    f.style.setProperty('--fc-bg', cs.backgroundColor); f.style.setProperty('--fc-fg', cs.color);
    const titulos = $$('.gd-nota, .gd-nodo', card).slice(0, 3).map(n => ($('.gd-nodo-tit', n) || n.firstElementChild || n).textContent.trim());
    const total = $$('.gd-nota, .gd-nodo', card).length;
    f.innerHTML = `<div class="gd-fantasma-cab"><span></span><b>${total}</b></div><div class="gd-fantasma-lista">${titulos.map(() => '<span></span>').join('')}${total > 3 ? `<i>+ ${total - 3} más</i>` : ''}</div>`;
    $('.gd-fantasma-cab span', f).textContent = ($('.gd-etq-nom', card) || cab).textContent.trim();
    $$('.gd-fantasma-lista span', f).forEach((sp, i) => { sp.textContent = titulos[i]; });
    return f;
  }
  /* FLIP: lo que se recoloca en el DOM se anima desde donde estaba, para que se vea apartarse a los vecinos */
  function flip(elementos, mutar) {
    const antes = new Map(elementos.map(el => [el, el.getBoundingClientRect()]));
    mutar();
    antes.forEach((r0, el) => {
      if (!el.isConnected || el === (pd && pd.el)) return;
      const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  }
  /* Arrastre en vivo (Leo: «que se vea posicionado donde lo pondría y aparte a los de al lado»): la tarjeta o
     la nota arrastrada se mueve de verdad a su sitio mientras se arrastra (queda en hueco punteado) y los
     vecinos se apartan con animación; al soltar se guarda el orden que se ve. Tipos en vivo:
     · 'orden' las tarjetas de segmentos de una biblioteca (bandeja incluida) y del carrusel de un personaje
       (Apariciones, bandeja, momentos y segmentos), todas entre sí; «nuevo segmento» se queda al final;
     · 'acto' tarjetas de la cronología (entre ellas);
     · 'nodo' documentos dentro de su acto o momento;
     · 'nota' notas dentro de su segmento o a otro segmento del mismo tablero (hacia la barra lateral o la
       papelera sigue como antes: la nota vuelve a su sitio y se marca el destino). */
  const VIVOS = { orden: ':scope > [data-clave]', acto: ':scope > .gd-acto[data-acto]' };
  const TABLEROS = '.gd-exp, #gdMain, .per-carrusel';        // dentro de uno de ellos una nota se recoloca en vivo
  function iniciarArrastre() {
    pd.activo = true; seccion.classList.add('arrastrando'); lado.classList.add('arrastrando'); pd.el.classList.add('arrastrando');
    if (o.carrusel) o.carrusel.classList.add('arrastrando');
    pd.auto = setInterval(autodesplazar, 16);
    pd.origen = { padre: pd.el.parentElement, siguiente: pd.el.nextSibling };
    let f;
    if (VIVOS[pd.tipo]) f = fantasmaTarjeta(pd.el);
    else { f = (pd.tipo === 'seccion' ? pd.el.querySelector('.gd-seccion') : pd.el).cloneNode(true); f.className = 'gd-fantasma'; f.querySelectorAll('button').forEach(b => b.remove()); f.style.width = Math.min(pd.el.offsetWidth, 260) + 'px'; }
    document.body.appendChild(f); pd.fantasma = f;
  }
  /* coloca lo arrastrado delante de `ref` dentro de `padre` (con null, al final), animando a los vecinos */
  function colocarVivo(padre, ref) {
    if (ref === pd.el) return;
    if (pd.el.parentElement === padre && pd.el.nextSibling === ref) return;
    const vecinos = [...new Set([...pd.el.parentElement.children, ...padre.children])];
    flip(vecinos, () => padre.insertBefore(pd.el, ref));
  }
  function devolverAlOrigen() {
    const { padre, siguiente } = pd.origen || {}; if (!padre) return;
    if (pd.el.parentElement === padre && pd.el.nextSibling === siguiente) return;
    colocarVivo(padre, siguiente && siguiente.parentElement === padre ? siguiente : null);
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
    if (VIVOS[pd.tipo]) {                                    // una tarjeta: delante o detrás de la que está bajo el puntero
      const padre = pd.origen.padre, card = el.closest('[data-clave], [data-acto]');
      if (!card || card === pd.el || card.parentElement !== padre || !card.matches(VIVOS[pd.tipo].replace(':scope > ', ''))) return;
      const r = card.getBoundingClientRect(), izquierda = e.clientX < r.left + r.width / 2;
      colocarVivo(padre, izquierda ? card : card.nextSibling);
      return;
    }
    /* un documento o una nota dentro de un cuerpo: delante de la primera cuyo centro queda por debajo del puntero */
    const colocarEnCuerpo = (cuerpo, selector) => {
      /* en la rejilla del segmento expandido se lee por filas: delante de la primera que queda por debajo, o de la
         de esa fila cuyo centro queda a la derecha del puntero; «＋ nota» sigue al final */
      const rejilla = cuerpo.classList.contains('gd-exp-grid');
      let ref = null;
      for (const n of $$(selector, cuerpo)) {
        if (n === pd.el) continue;
        const r = n.getBoundingClientRect();
        if (rejilla ? (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2)) : e.clientY < r.top + r.height / 2) { ref = n; break; }
      }
      colocarVivo(cuerpo, ref || (rejilla ? $(':scope > .gd-exp-add', cuerpo) : null));
    };
    if (pd.tipo === 'nodo') {                                // solo dentro de su propio acto o momento
      const card = el.closest('.gd-acto[data-sub], .gd-exp-grid[data-acto]'); if (card !== pd.card) return;
      colocarEnCuerpo(card.matches('.gd-exp-grid') ? card : $('.gd-etq-body', card), ':scope > .gd-nodo'); return;
    }
    if (pd.tipo === 'nota' && pd.enTablero) {
      const cuerpo = el.closest('[data-gd-drop]');
      const grupo = x => ((x && x.closest('[data-grupo]')) || { dataset: {} }).dataset.grupo || '';   // guiones generados y notas, cada uno en su sección
      if (cuerpo && cuerpo.closest(TABLEROS) === pd.enTablero && grupo(cuerpo) === grupo(pd.origen.padre)) { marcar(null, null); colocarEnCuerpo(cuerpo, ':scope > [data-nota]'); return; }
      if (cuerpo && cuerpo.closest(TABLEROS) === pd.enTablero) { devolverAlOrigen(); return; }
      if (el.closest('[data-gd-drop-sub], [data-gd-drop-cont]')) devolverAlOrigen();   // hacia la barra o la papelera: vuelve a su sitio y se marca el destino
      else return;                                           // por fuera de todo: se queda donde iba
    }
    if (pd.tipo === 'seccion') { const b = el.closest('.gd-bloque'); if (!b || b === pd.el) { marcar(null, null); return; } marcar(b, null, mitadDe(b, e.clientY)); return; }
    if (pd.tipo === 'cont') {                                // sobre otro contenedor: delante o detrás según la mitad
      const fila = el.closest('.gd-cont:not(.papelera)'); if (!fila || fila === pd.el) { marcar(null, null); return; }
      marcar(fila, null, mitadDe(fila, e.clientY)); return;
    }
    /* el árbol: carpetas, esquemas y bibliotecas (y, en Personajes, personajes y sus carpetas) van delante o detrás de
       cualquier otra pieza de su nivel; sobre una carpeta (salvo su borde de arriba, que es «delante») entran en ella;
       sobre un contenedor, a su raíz */
    if (pd.tipo === 'carpeta' || pd.tipo === 'personaje' || pd.tipo === 'hijo') {
      const elenco = pd.tipo === 'personaje' || (pd.tipo === 'carpeta' && pd.ambito === C.ELENCO_CARPETAS);
      const kf = el.closest('.gd-carpeta');
      if (kf && kf !== pd.el && (kf.dataset.ambito === C.ELENCO_CARPETAS) === elenco) {
        const r = kf.getBoundingClientRect(); marcar(kf, null, e.clientY < r.top + r.height * .3 ? 'antes' : null); return;
      }
      const q = elenco ? el.closest('.gd-per[data-personaje]') : el.closest('[data-unidad]');
      if (q && q !== pd.el && !pd.el.contains(q)) { marcar(q, null, mitadDe(q, e.clientY)); return; }
      /* en Personajes, «＋ personaje», «＋ carpeta» o el hueco libre del árbol: a la raíz (fuera de toda carpeta) */
      if (elenco) { const raiz = el.closest('[data-gd-raiz-elenco]') || (el.closest('.gd-arbol') && !el.closest('.gd-per, .gd-carpeta') ? $('[data-gd-nuevo-personaje]', lado) : null); marcar(raiz || null, null); return; }
      const cont = !elenco && el.closest('.gd-cont:not(.papelera)'); marcar(cont || null, null); return;
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
    const { activo, zona, antes, id, el, fantasma, tipo, mitad } = pd, hijo = pd.ref, cardNodo = pd.card, origen = pd.origen, enTablero = pd.enTablero;
    if (activo && !soltar && origen) devolverAlOrigen();       // cancelado: todo vuelve a su sitio
    clearInterval(pd.auto); pd = null;
    soltarAgarre(el);
    seccion.classList.remove('arrastrando'); lado.classList.remove('arrastrando'); el.classList.remove('arrastrando');
    if (o.carrusel) o.carrusel.classList.remove('arrastrando');
    if (renderPendiente) { renderPendiente = false; setTimeout(render, 0); }
    if (fantasma) fantasma.remove(); if (zona) zona.classList.remove('sobre', 'sobre-antes', 'sobre-despues'); if (antes) antes.classList.remove('antes');
    if (!activo) return;
    suprimirClic = Date.now();
    if (!soltar) return;
    /* en vivo: se guarda el orden que se ve (lo arrastrado ya está en su sitio) */
    const siguiente = sel => { let n = el.nextElementSibling; while (n && !n.matches(sel)) n = n.nextElementSibling; return n; };
    if (VIVOS[tipo]) {
      const padre = el.parentElement, sel = VIVOS[tipo].replace(':scope > ', ''), lista = $$(VIVOS[tipo], padre);
      if (origen && origen.padre === padre && origen.siguiente === el.nextSibling) { render(); return; }   // no se movió
      const sig = siguiente(sel);
      if (tipo === 'acto') { tras(d.colocarActo(el.dataset.sub, id, sig ? sig.dataset.acto : null, lista.map(c => c.dataset.acto))); return; }
      if (padre.dataset.grupo === 'guiones') { tras(d.colocarSegmentoGuiones(padre.dataset.sub, el.dataset.clave, sig ? sig.dataset.clave : null, lista.map(c => c.dataset.clave))); return; }
      tras(d.colocarSegmento(padre.dataset.sub, el.dataset.clave, sig ? sig.dataset.clave : null, lista.map(c => c.dataset.clave))); return;
    }
    if (tipo === 'nodo') {
      if (!cardNodo) return;
      const sig = siguiente('.gd-nodo'), lista = $$('.gd-nodo', cardNodo).map(n => n.dataset.nodo);
      if (origen && origen.padre === el.parentElement && origen.siguiente === el.nextSibling) { render(); return; }   // no se movió
      tras(d.colocarNodoActo(cardNodo.dataset.sub, cardNodo.dataset.acto, id, sig ? sig.dataset.nodo : null, lista)); return;
    }
    if (tipo === 'nota' && enTablero && !zona) {             // soltada en un cuerpo del tablero: donde se ve
      const cuerpo = el.parentElement; if (!cuerpo || cuerpo.dataset.gdDrop === undefined) { render(); return; }
      const n = d.nota(id); if (!n) return;
      const sig = siguiente('[data-nota]');
      if (origen && origen.padre === cuerpo && origen.siguiente === el.nextSibling) { render(); return; }
      tras(d.moverNota(id, cuerpo.dataset.gdDrop || null, (actual && actual.tipo === 'sub' && actual.id) || n.subId, sig ? sig.dataset.nota : null)); return;
    }
    if (!zona) { render(); return; }
    if (tipo === 'seccion') {                                // delante o detrás de la otra sección
      if (actual && actual.tipo === 'sub') tras(d.ordenarSecciones(actual.id, (id === 'crono' || id === 'guiones') === (mitad === 'antes')));   // true: guiones generados delante
      return;
    }
    if (tipo === 'cont') {
      const r = zona.dataset.id, lista = d.datos.contenedores.map(c => c.id), j = lista.indexOf(r);
      tras(d.colocarContenedor(id, mitad === 'antes' ? r : (lista[j + 1] || null))); return;
    }
    if (tipo === 'carpeta' || tipo === 'personaje' || tipo === 'hijo') {
      const tipoModelo = tipo === 'hijo' ? (hijo.tipo === 'esquema' ? 'esquema' : 'sub') : tipo;
      /* entra al final de su nuevo nivel */
      const alFinal = (ambito, carpetaId, x) => {
        if (!x.ok) return x;
        const resto = d.nivelArbol(ambito, carpetaId).filter(p => p.id !== id);
        if (resto.length) d.colocarEnArbol(id, resto[resto.length - 1].id, true);
        return x;
      };
      if (zona.classList.contains('gd-carpeta')) {
        if (mitad === 'antes') { tras(d.colocarEnArbol(id, zona.dataset.carpeta)); return; }
        tras(alFinal(zona.dataset.ambito, zona.dataset.carpeta, d.moverACarpeta(tipoModelo, id, zona.dataset.carpeta))); return;
      }
      if (zona.dataset.gdRaizElenco !== undefined) { tras(alFinal(C.ELENCO_CARPETAS, null, d.moverACarpeta(tipoModelo, id, null, C.ELENCO_CARPETAS))); return; }
      if (zona.dataset.personaje || zona.dataset.unidad) {
        const refId = zona.dataset.personaje || (desclave(zona.dataset.unidad) || {}).id;
        if (refId) tras(d.colocarEnArbol(id, refId, mitad === 'despues'));
        return;
      }
      if (zona.classList.contains('gd-cont')) tras(alFinal(zona.dataset.id, null, d.moverACarpeta(tipoModelo, id, null, zona.dataset.id)));
      return;
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
      if (!e.target.closest('[data-nota]:not(.gd-nota-fila), [data-nodo]')) soltarSeleccion();   // un clic fuera de las notas quita la marca (Leo)
      const ex = e.target.closest('[data-gd-expandir]');
      if (ex) {                                              // el icono de expandir de una tarjeta de segmento
        const card = ex.closest('.gd-etq'), sub = card && (card.dataset.sub || (card.parentElement && card.parentElement.dataset.sub));
        const k = card && (card.dataset.expClave || card.dataset.clave || (card.dataset.acto ? 'acto:' + card.dataset.acto : null));   // la bandeja de guiones se expande como «guiones»
        if (sub && k) expandir(sub, k);
        return;
      }
      if (e.target.closest('[data-gd-contraer]')) { contraer(); return; }
      if (e.target.closest('[data-gd-renombrar-etq]')) { const b = e.target.closest('[data-etq]'); if (b) renombrarEtiqueta(b.dataset.etq); return; }
      if (e.target.closest('[data-gd-nuevo]')) { if (enPersonajes()) { if (o.nuevoPersonaje) o.nuevoPersonaje(); } else nuevoContenedor(); return; }
      if (e.target.closest('[data-gd-nuevo-personaje]')) { if (o.nuevoPersonaje) o.nuevoPersonaje(); return; }
      if (e.target.closest('[data-gd-nueva-carpeta-elenco]')) { nuevaCarpeta(C.ELENCO_CARPETAS, null); return; }
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
      const crear = e.target.closest('[data-gd-crear-nota]'); if (crear) { if (actual && actual.tipo === 'sub') nuevaNota(actual.id, crear.dataset.gdCrearNota || null, crear.dataset.gdGuiones !== undefined); return; }
      if (e.target.closest('[data-gd-nuevo-seg-guiones]')) {     // un segmento de guiones: se crea y se escribe su nombre
        if (!actual || actual.tipo !== 'sub') return;
        const r = d.crearEtiqueta(actual.id, 'Segmento', null, { guiones: true });
        if (tras(r)) renombrarEtiqueta(r.etiqueta.id);
        return;
      }
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
      const carp = e.target.closest('.gd-carpeta');
      if (carp) {                                            // pulsar la carpeta la despliega o la pliega (con espera: el doble clic la renombra)
        clearTimeout(clicArbol); const id = carp.dataset.carpeta;
        clicArbol = setTimeout(() => { clicArbol = null; if (d.carpeta(id)) tras(d.plegarCarpeta(id)); }, 220);
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
      const ap = e.target.closest('[data-ap-tipo]'); if (ap) { e.stopPropagation(); abrirAparicion(ap); return; }
      const nodo = e.target.closest('[data-nodo]');
      if (nodo && !e.target.closest('button')) { e.stopPropagation(); o.abrirNodo(nodo.dataset.eid, nodo.dataset.nodo); return; }
      const nota = e.target.closest('[data-nota]');
      if (nota && !e.target.closest('button')) {
        e.stopPropagation();
        if (nota.classList.contains('gd-nota-fila')) { clearTimeout(clicArbol); clicArbol = null; renombrarNota(nota.dataset.nota, nota); }   // en el árbol: renombrar
        else abrirNota(nota.dataset.nota);                                                      // en el tablero: abrir
        return;
      }
      const carpD = e.target.closest('.gd-carpeta'); if (carpD && !e.target.closest('button')) { e.stopPropagation(); clearTimeout(clicArbol); clicArbol = null; renombrarCarpeta(carpD.dataset.carpeta); return; }
      const cont = e.target.closest('.gd-cont:not(.papelera) [data-gd-nombre]'); if (cont) { e.stopPropagation(); renombrarContenedor(cont.closest('.gd-cont').dataset.id); return; }
      const per = e.target.closest('[data-personaje]'); if (per && !e.target.closest('button')) { e.stopPropagation(); renombrarPersonaje(per.dataset.personaje); return; }
      const fila = e.target.closest('.gd-sub'); if (fila) { e.stopPropagation(); const s = desclave(fila.dataset.sub); if (s) renombrarHijo(s, fila); return; }
      const etq = e.target.closest('[data-gd-etq-nombre]'); if (etq) { e.stopPropagation(); renombrarEtiqueta(etq.closest('[data-etq]').dataset.etq); }
    });
    /* el título de la nota (se edita con doble clic en la cabecera, texto.js): al aplicarlo pasa al título del documento
       del editor, que al guardarse renombra la nota */
    document.addEventListener('clapcraft:titulo', e => { if (notaAbierta && o.texto.fijarTitulo) { o.texto.fijarTitulo(e.detail.valor); setTimeout(renderMigas, 350); } });
    if (migas) migas.addEventListener('click', e => {
      const mv = e.target.closest('[data-gd-miga-mover]');
      if (mv) {
        e.stopPropagation();
        const m = modelo(), n = m && notaAbierta && m.nota(notaAbierta); if (!n) return;
        const hs = hermanasDe(m, n), sig = hs[hs.findIndex(x => x.id === n.id) + (+mv.dataset.gdMigaMover)];
        if (sig) { if (o.texto.volcar) o.texto.volcar(); abrirNota(sig.id); }
        return;
      }
      if (e.target.closest('[data-gd-expandir-nota]')) {         // la etiqueta del segmento: su vista expandida, con esta nota marcada
        e.stopPropagation();
        const m = modelo(), n = m && notaAbierta && m.nota(notaAbierta); if (!n) return;
        expandir(n.subId, n.etiquetaId ? 'etq:' + n.etiquetaId : 'bandeja', n.id);
        return;
      }
      if (e.target.closest('[data-gd-volver]')) { e.stopPropagation(); expandido = null; cerrarNota(); return; }
      const ir = e.target.closest('[data-gd-ir]');
      if (ir) { e.stopPropagation(); const s = desclave(ir.dataset.gdIr); if (valido(s)) { navegar(s); cerrarNota(); irAlTablero(); } }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.gd-pop,[data-gd-menu]')) { cerrarPop(); soltarSeleccion(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); const t = disparador; cerrarPop(); if (t && t.focus) t.focus(); } }, true);   // Esc cierra cualquier menú, también los que van fuera del gestor (Exportar)   // fuera del gestor (cabecera, tablero, editor)
    /* Esc con el segmento expandido a la vista (y sin menú, campo ni diálogo): contraer */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && notaSel && !abierto && !pd && !editando && !e.defaultPrevented && !(e.target.closest && e.target.closest('input, textarea, [contenteditable], dialog'))) { soltarSeleccion(); return; }   // Esc quita primero la marca de la nota
      if (e.key !== 'Escape' || !expandido || abierto || pd || editando || e.defaultPrevented) return;
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable], dialog')) return;
      if ([...document.querySelectorAll('.gd-exp')].some(x => x.offsetParent !== null)) contraer();
    });

    /* Teclado: Esc cierra menús o limpia campos; Supr no llega al tablero */
    oir('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (pd) { terminarArrastre(false); return; }
        if (abierto) { const t = disparador; cerrarPop(); if (t) t.focus(); return; }
        if (notaSel && !editando) { soltarSeleccion(); return; }
        if (expandido && !editando && e.target.closest && e.target.closest('.gd-exp')) contraer();
        return;
      }
      if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-nota]')) { e.preventDefault(); abrirNota(e.target.dataset.nota); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ap-tipo]')) { e.preventDefault(); abrirAparicion(e.target); return; }
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
    /* y sobre el nombre de un segmento (o de un acto, un momento, la bandeja): su nombre completo, debajo */
    [seccion, o.carrusel].filter(Boolean).forEach(z => {
      z.addEventListener('mouseover', e => {
        const n = e.target.closest('.gd-etq-nom[data-globo]'); if (!n || pd || e.target.closest('.gd-edit')) { if (!n) esconderGlobo(); return; }
        const nombre = n.textContent.trim(); if (globo.dataset.para === 'etq:' + nombre && !globo.hidden) return;
        esconderGlobo();
        globoT = setTimeout(() => {
          if (!n.isConnected || n.querySelector('.gd-edit')) return;
          globo.dataset.para = 'etq:' + nombre;
          globo.replaceChildren(Object.assign(document.createElement('span'), { className: 'gd-globo-rot', textContent: n.dataset.globo }), document.createTextNode(nombre));
          globo.hidden = false;
          const r = n.getBoundingClientRect();
          globo.style.left = Math.max(8, Math.min(r.left, innerWidth - globo.offsetWidth - 8)) + 'px';
          globo.style.top = (r.bottom + 6) + 'px';
        }, 350);
      });
      z.addEventListener('mouseleave', esconderGlobo);
      z.addEventListener('pointerdown', esconderGlobo);
      z.addEventListener('scroll', esconderGlobo, true);
    });
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
      /* las tarjetas de segmentos (biblioteca y carrusel de un personaje) se ordenan entre sí por su cabecera */
      const cabOrden = e.target.closest('[data-orden] > [data-clave] > .gd-etq-head');
      if (cabOrden) { const card = cabOrden.parentElement; pd = Object.assign(base, { tipo: 'orden', id: card.dataset.clave, el: card }); agarrar(); return; }
      /* actos de la cronología: la tarjeta por su cabecera y sus documentos dentro de ella (orden propio, no el de la línea de tiempo) */
      const cabActo = e.target.closest('.gd-acto[data-sub] > .gd-etq-head');
      if (cabActo) { const card = cabActo.parentElement; pd = Object.assign(base, { tipo: 'acto', id: card.dataset.acto, el: card }); agarrar(); return; }
      const nodoActo = e.target.closest('.gd-acto[data-sub] .gd-nodo, .gd-exp-grid[data-acto] > .gd-nodo');
      if (nodoActo) { pd = Object.assign(base, { tipo: 'nodo', id: nodoActo.dataset.nodo, el: nodoActo, card: nodoActo.closest('.gd-acto, .gd-exp-grid') }); agarrar(); return; }
      if (e.target.closest('.gd-crono, .gd-apariciones, .gd-acto, .gd-exp--apariciones, .gd-exp-cab, .gd-exp-banda')) return;   // las apariciones no se reordenan
      const n = e.target.closest('[data-nota]');
      if (n) {
        const enCuerpo = n.parentElement && n.parentElement.dataset.gdDrop !== undefined && !n.closest('#gdSide');
        pd = Object.assign(base, { tipo: 'nota', id: n.dataset.nota, el: n, enTablero: enCuerpo ? n.closest(TABLEROS) : null }); agarrar(); return;
      }
      const kf = e.target.closest('.gd-carpeta');              // una carpeta, con todo lo suyo
      if (kf) { pd = Object.assign(base, { tipo: 'carpeta', id: kf.dataset.carpeta, ambito: kf.dataset.ambito, el: kf }); return; }
      const pj = e.target.closest('.gd-per[data-personaje]');   // un personaje, a una carpeta
      if (pj) { pd = Object.assign(base, { tipo: 'personaje', id: pj.dataset.personaje, el: pj }); return; }
      const u = e.target.closest('[data-unidad]');             // un esquema con su documentos enlazado se arrastra entero
      if (u) { const s = desclave(u.dataset.unidad); if (s) pd = Object.assign(base, { tipo: 'hijo', id: s.id, ref: s, el: u }); return; }
      if (e.target.closest('.gd-hijos')) return;
      const cont = e.target.closest('.gd-cont:not(.papelera)');
      if (cont) pd = Object.assign(base, { tipo: 'cont', id: cont.dataset.id, el: cont });
    });
    /* mover y soltar se oyen en la ventana: al recolocar en vivo lo arrastrado sale y vuelve a entrar en el DOM y
       pierde la captura del puntero; así el arrastre no se queda colgado si se suelta fuera de la barra o del tablero */
    window.addEventListener('pointermove', e => {
      if (!pd) return;
      if (!pd.activo) { if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < 5) return; iniciarArrastre(); }
      e.preventDefault(); moverArrastre(e);
    });
    window.addEventListener('pointerup', () => { if (pd) terminarArrastre(true); });
    window.addEventListener('pointercancel', () => { if (pd) terminarArrastre(false); });

    /* al cambiar de tema, los colores de los segmentos se pintan del otro par */
    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* Entrar y salir de la vista. Al salir, la nota abierta vuelve al gestor (se guarda antes). */
  function mostrar() { modelo(); render(); }
  function salir() { cerrarPop(); if (notaAbierta) cerrarNota(); }
  /* Al cambiar de guion (pestaña): nada abierto, y el modelo se rehace solo. */
  function reiniciar() { cerrarPop(); if (notaAbierta) { o.texto.cerrarDocumento(); notaAbierta = null; document.body.classList.remove('nota-abierta'); } d = null; guionId = null; actual = null; notaSel = null; expandido = null; document.body.classList.remove('per-expandido'); render(); }

  /* Abre el tablero de unos documentos desde fuera («Ver documentos» del esquema, en app.js). */
  function abrirSub(id) {
    const m = modelo(), r = m && m.sub(id); if (!r) return;
    expandido = null;                                        // «Ver biblioteca»: su tablero, no un segmento expandido
    navegar(ref('sub', r.contenedor.id, id));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* ---------- Personajes: los segmentos de la biblioteca de un personaje, en carrusel ----------
     Las mismas tarjetas (y el mismo arrastre) que en una biblioteca; `actual` pasa a esa biblioteca. */
  /* «Apariciones»: las notas donde se nombra al personaje con «/», con su ruta; doble clic las abre. No se ordena ni se borra. */
  const glifoDe = (eid, id) => { const tm = o.modeloDe && o.modeloDe(eid), p = tm && tm.punto(id); return p ? glifo(tm, p) : ''; };
  function tarjetaApariciones(lista) {
    const sec = document.createElement('section');
    sec.className = 'gd-etq gd-apariciones';
    sec.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom" data-globo="Segmento"><span class="gd-asa" title="Arrastra para cambiar su posición">${ic('drag', 13)}</span><span>Apariciones</span></span><span class="gd-etq-acc"><span class="gd-cuenta">${lista.length}</span>${BOTON_EXPANDIR}</span></header>
      <div class="gd-etq-body">${lista.map(x => `<div class="gd-aparicion" role="button" tabindex="0" data-ap-tipo="${esc(x.tipo)}" data-ap-id="${esc(x.id)}" data-ap-eid="${esc(x.eid || '')}" title="Doble clic: abrir la nota">
          <span class="gd-aparicion-lin">${x.tipo === 'nodo' ? glifoDe(x.eid, x.id) : ''}<span class="gd-aparicion-tit"></span><span class="gd-nota-meta">${esc(fecha(x.modificado))}</span></span><span class="gd-aparicion-ruta"></span></div>`).join('') || '<div class="gd-etq-vacia">Aún no aparece en ninguna nota</div>'}</div>`;
    $$('.gd-aparicion', sec).forEach((b, i) => { $('.gd-aparicion-tit', b).textContent = lista[i].titulo; $('.gd-aparicion-ruta', b).textContent = lista[i].ruta; });
    return sec;
  }
  let personajeId = null, carruselAntes = null;
  function renderPersonaje(el, subId, pid) {
    if (pid !== undefined) personajeId = pid;
    const m = modelo(); if (!m || !el) return;
    const r = m.sub(subId); if (!r) { el.replaceChildren(); document.body.classList.remove('per-expandido'); return; }
    navegar(ref('sub', r.contenedor.id, subId));
    /* un segmento expandido ocupa el lienzo del personaje: sin su tablero ni el carrusel */
    const x = expandido && expandido.subId === subId && datosSegmento(m, subId, expandido.clave);
    if (expandido && !x) expandido = null;
    document.body.classList.toggle('per-expandido', !!x);
    if (x) {
      const p = personajeId && m.personaje(personajeId), t = p && PAL[p.color];
      const nombre = p ? p.nombre : r.sub.nombre;
      const chip = chipNombre(nombre, 'per-chip', { boton: true, attrs: ' data-gd-contraer', estilo: t ? `--chl:${t[1]};--chd:${t[2]}` : '', title: 'Volver a «' + nombre + '»' });
      const car0 = el.querySelector('.per-carrusel');
      if (car0 && el.dataset.sub === subId) carruselAntes = { sub: subId, left: car0.scrollLeft };   // al contraer, el carrusel vuelve a donde estaba
      el.replaceChildren(vistaExpandida(m, x, { cont: 'Personajes', chip }));
      return;
    }
    const etqs = m.etiquetasDe(subId);
    /* el desplazamiento se conserva al redibujar el mismo personaje; otro empieza al principio (antes heredaba
       el del anterior y el carrusel brincaba al final si el nuevo tenía menos segmentos) */
    const previo = el.querySelector('.per-carrusel');
    const pista = previo && el.dataset.sub === subId ? previo.scrollLeft : !previo && carruselAntes && carruselAntes.sub === subId ? carruselAntes.left : 0;
    carruselAntes = null;
    el.dataset.sub = subId;
    el.innerHTML = `<div class="per-seg-cab"><span class="gd-seccion-tit">Segmentos</span><span class="per-seg-n">${etqs.length}</span></div>
      <div class="per-carrusel gd-tablero"></div>`;
    const car = $('.per-carrusel', el);
    car.dataset.orden = ''; car.dataset.sub = subId;
    const piezas = new Map();                                // sin orden guardado: Apariciones, bandeja (Leo), momentos y segmentos
    if (personajeId) piezas.set('apariciones', tarjetaApariciones(m.menciones(personajeId)));
    piezas.set('bandeja', tarjeta(null, m.notasDe(subId, null)));
    /* un segmento por momento de su línea de tiempo, como los actos de la cronología, y los segmentos; unos y
       otros en un solo orden que se cambia arrastrando (Leo), sin tocar la línea de tiempo */
    const eid = personajeId && o.esquemaPersonaje && o.esquemaPersonaje(personajeId), tm = eid && o.modeloDe && o.modeloDe(eid);
    if (tm) tarjetasActos(m, tm, eid, true, subId, { natural: true }).forEach(card => piezas.set('acto:' + card.dataset.acto, card));
    etqs.forEach(e => piezas.set('etq:' + e.id, tarjeta(e, m.notasDe(subId, e.id))));
    m.ordenSegmentos(subId, Array.from(piezas.keys())).forEach(k => { const card = piezas.get(k); card.dataset.clave = k; car.appendChild(card); });
    const nueva = document.createElement('button');
    nueva.type = 'button'; nueva.className = 'gd-etq-nueva'; nueva.dataset.gdMenu = 'paleta';
    nueva.innerHTML = '<span class="gd-etq-nueva-tit">' + ic('plus', 14) + 'nuevo segmento</span><span class="gd-muestras" aria-hidden="true">' + [0, 1, 4, 6, 5].map(i => `<i style="background:${colores(i)[0]}"></i>`).join('') + '</span>';
    car.appendChild(nueva);
    car.scrollLeft = pista;
    /* un desplazador horizontal normal (morado, siempre visible); la rueda vertical también desplaza */
    car.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.target.closest('.gd-etq-body')) { car.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }

  C.gestor = { iniciar, renderPersonaje, pop: (t, nodo) => abrirPop(t, nodo), cerrarPop: () => cerrarPop(), hayPop: () => !!abierto, expandir, contraer: () => { if (expandido) { expandido = null; document.body.classList.remove('per-expandido'); } }, pedirPersonaje, renombrarPersonaje, menuCarril, paletaTrama, mostrar, salir, reiniciar, render, abrirNota, cerrarNota, abrirSub, nuevoContenedor, notaAbierta: () => notaAbierta, subActual: () => actual, documentos: () => (o.guion ? modelo() : null), PAPELERA };
})(window.Claquedraw);
