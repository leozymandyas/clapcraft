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
   [Documentos] Nombre», con «Ver esquema» si está enlazada).

   En el árbol, un clic en un subcontenedor abre su tablero (y con texto en «Buscar» aparecen debajo
   las notas que casan: un clic las abre en el editor); en el tablero un clic en una nota la abre en su
   ventana, encima de todo (1.1.54, como en ClapBook), y el doble clic en el editor (js/claquedraw/texto.js,
   modo documento): el tablero cede su sitio al editor, la barra se queda y encima van las migas. La
   biblioteca y el segmento expandido se buscan, se filtran por color y se ordenan (js/claquedraw/busqueda.js). El arrastre (clic sostenido) va con eventos de
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
  /* en el árbol la etiqueta es solo la inicial, para que quepa el nombre (Leo, 16-09-2026); en las cabeceras va entera */
  const CHIPS = { esquema: '<span class="gd-chip gd-chip--esquema" title="Esquema">E</span>', sub: '<span class="gd-chip gd-chip--sub" title="Biblioteca">B</span>',
                  enlazado: '<span class="gd-chip gd-chip--sub" title="Biblioteca">B</span>',
                  lienzo: '<span class="gd-chip gd-chip--lienzo" title="Lienzo">L</span>' };   // los lienzos de nodos (1.1.58), en verde azulado

  let o = {};                    // opciones de iniciar()
  let seccion, lado, main, migas;
  let d = null, guionId = null;  // C.Documentos del guion abierto
  let actual = null;             // lo abierto en el tablero: { tipo: 'sub' | 'cont' (sin subcontenedores) | 'papelera', cid, id }
  let notaAbierta = null;        // nota en el editor
  let notaAntes = null;          // la que estaba en el editor al irse a otra vista: al volver se abre otra vez
  let notaSel = null;            // nota seleccionada con un clic (doble clic la abre)
  let clicArbol = null;          // temporizador del clic en el árbol (el doble clic lo cancela)
  let editando = false;          // hay un campo de renombrar abierto: no se redibuja hasta cerrarlo
  let expandido = null;          // { subId, clave } del segmento expandido, que ocupa el lienzo

  /* ---------- referencias { tipo, cid, id } y su clave para el DOM ---------- */
  const clave = s => s ? s.tipo + '/' + (s.cid || '') + '/' + (s.id || '') : '';
  const desclave = k => { const [tipo, cid, id] = String(k || '').split('/'); return tipo ? { tipo, cid: cid || null, id: id || null } : null; };
  const mismo = (a, b) => clave(a) === clave(b);
  const ref = (tipo, cid, id) => ({ tipo, cid, id: id || null });
  /* Los subcontenedores de un contenedor que no están enlazados a ningún esquema. */
  const sueltosDe = c => c.subs.filter(s => !s.guionEid && !c.esquemas.some(e => e.subId === s.id));   // la de guiones de un esquema no está en el árbol
  const esPapelera = () => !!actual && actual.tipo === PAPELERA;
  /* las plantillas de nota (1.1.56, de ClapBook): una biblioteca especial fuera del árbol, que se abre desde «Plantillas» al pie
     del menú (documentos.js). `especial`: una biblioteca que no es de las del árbol (hoy, solo esa). */
  const BIB_PLANTILLAS = C.ID_BIB_PLANTILLAS || 'plantillas:biblioteca';
  /* las fórmulas (1.1.60): la otra biblioteca especial, gemela de la de las plantillas, con los prompts reutilizables de las
     operaciones de IA del lienzo; sus notas son solo texto (la ventana las edita en texto plano) */
  const BIB_FORMULAS = C.ID_BIB_FORMULAS || 'formulas:biblioteca';
  const esPlantillas = () => !!actual && actual.tipo === 'sub' && actual.id === BIB_PLANTILLAS;
  const esFormulas = () => !!actual && actual.tipo === 'sub' && actual.id === BIB_FORMULAS;
  const especial = id => !!id && (id === BIB_PLANTILLAS || id === BIB_FORMULAS || !!(d && d.esEspecial && d.esEspecial(id)));
  /* cuál: 'formulas' o 'plantillas' (la de un id especial que no sea el de las fórmulas, la de las plantillas) */
  const cualEspecial = id => !especial(id) ? null : id === BIB_FORMULAS ? 'formulas' : 'plantillas';
  const esPlantilla = n => !!(n && d && d.esPlantilla && d.esPlantilla(n));
  const esFormula = n => { const x = typeof n === 'string' ? d && d.nota(n) : n; return !!(x && (x.subId === BIB_FORMULAS || (d && d.esFormula && d.esFormula(x)))); };
  /* lo que cambia entre las dos: su nombre, su icono y cómo se llama una de sus notas */
  const ESPECIAL = {
    plantillas: { nombre: 'Plantillas', icono: 'plantilla', una: 'plantilla', las: 'las plantillas', volver: 'Volver a las plantillas', ver: 'Ver plantillas' },
    formulas: { nombre: 'Fórmulas', icono: 'formula', una: 'fórmula', las: 'las fórmulas', volver: 'Volver a las fórmulas', ver: 'Ver fórmulas' }
  };
  const infoEspecial = id => ESPECIAL[cualEspecial(id) || 'plantillas'];
  let ultimaNormal = null;       // la última biblioteca normal que se vio: ahí van las notas que salen de una plantilla
  function valido(s) {
    if (!s || !d) return false;
    if (s.tipo === PAPELERA) return true;
    const c = d.contenedor(s.cid); if (!c) return false;
    if (s.tipo === 'esquema') return c.esquemas.some(e => e.id === s.id);
    if (s.tipo === 'sub') return c.subs.some(x => x.id === s.id);
    if (s.tipo === 'lienzo') return (c.lienzos || []).some(x => x.id === s.id);
    return s.tipo === 'cont';
  }
  /* El tablero por defecto de un contenedor: su primera biblioteca en el orden del árbol (o él mismo, vacío). Nunca la oculta
     de guiones de un esquema: `c.subs[0]` podía serlo, y se abría una biblioteca que no sale en el árbol (1.1.54, de ClapBook). */
  const entradaDe = c => {
    const b = d && d.primeraBiblioteca ? d.primeraBiblioteca(c.id) : c.subs.find(s => !s.guionEid);
    return b ? ref('sub', c.id, b.id) : ref('cont', c.id);
  };
  /* Cambiar de tablero. */
  /* `alNavegar`: app.js apunta la pantalla para volver a ella al abrir el proyecto (Leo, 16-09-2026). La ventana de una nota se
     cierra al salir de su biblioteca. */
  function navegar(s) {
    if (ladoId) { const n = d && d.nota(ladoId); if (!(s && s.tipo === 'sub' && n && n.subId === s.id)) cerrarLado(); }
    /* la nota elegida en otra biblioteca ya no es lo elegido (Cmd+Shift+C copiaba una nota que no estaba a la vista) */
    const ns = notaSel && d && d.nota(notaSel);
    if (ns && !(s && s.tipo === 'sub' && ns.subId === s.id)) soltarSeleccion();
    actual = s; if (expandido && !(s && s.tipo === 'sub' && s.id === expandido.subId)) expandido = null;
    if (s && s.tipo === 'sub' && !especial(s.id)) ultimaNormal = s.id;
    if (o.alNavegar) o.alNavegar();
  }

  /* El modelo del guion abierto. Se rehace si cambia el guion o si la biblioteca sustituyó sus datos.
     La papelera se purga una vez por sesión. */
  function modelo() {
    const g = o.guion();
    if (!g) { d = null; guionId = null; actual = null; return null; }
    if (!d || guionId !== g.id || g.documentos !== d.datos) {
      d = new C.Documentos(g.documentos); g.documentos = d.datos; guionId = g.id;
      actual = null;
      const p = d.purgarPapelera(C.DIAS_PAPELERA);
      if (p.purgadas) { if (o.avisar) o.avisar('Papelera: ' + p.purgadas + (p.purgadas === 1 ? ' elemento antiguo eliminado' : ' elementos antiguos eliminados') + ' (más de ' + C.DIAS_PAPELERA + ' días)'); if (o.guardar) o.guardar(); }
    }
    const primero = d.datos.contenedores.find(c => !c.oculto);   // los de Personajes tienen su propio árbol
    if (!valido(actual)) actual = primero ? entradaDe(primero) : null;
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
    /* un lienzo (1.1.58): activo con su vista delante */
    const lienzoDelante = s.tipo === 'lienzo' && modo === 'lienzo' && o.lienzoMontado && s.id === o.lienzoMontado();
    const activo = s.tipo === 'lienzo' ? lienzoDelante : s.tipo === 'esquema' ? montado && modo !== 'documentos' && modo !== 'lienzo' : modo === 'documentos' && !notaAbierta && mismo(s, actual);
    fila.className = 'gd-sub gd-sub--' + s.tipo + (activo ? ' activo' : '') + (montado ? ' montado' : '') + (enlazado ? ' enlazado' : '');
    fila.dataset.sub = clave(s);
    let nombre;
    if (s.tipo === 'esquema') {
      const r = d.esquema(s.id); nombre = r ? r.esquema.nombre : '';
      fila.dataset.gdGlobo = 'esquema';
    } else if (s.tipo === 'lienzo') {
      const r = d.lienzo && d.lienzo(s.id); nombre = r ? r.lienzo.nombre : '';
      fila.dataset.gdGlobo = 'lienzo';
    } else {
      const r = d.sub(s.id); nombre = r ? r.sub.nombre : '';
      fila.dataset.gdDropSub = clave(s);                      // recibe notas
      fila.dataset.gdGlobo = 'sub';
    }
    /* la etiqueta lleva su color si se le puso uno (Leo, 16-09-2026), como la de un personaje */
    const e0 = estiloHijo(s.id);
    const que = { esquema: ['Esquema', 'E'], lienzo: ['Lienzo', 'L'] }[s.tipo] || ['Biblioteca', 'B'];
    const chip = e0.estilo
      ? `<span class="gd-chip per-chip" style="${e0.estilo}" title="${que[0]}">${que[1]}</span>`
      : (s.tipo === 'esquema' ? CHIPS.esquema : s.tipo === 'lienzo' ? CHIPS.lienzo : enlazado ? CHIPS.enlazado : CHIPS.sub);
    fila.innerHTML = `<span class="gd-sub-punto" aria-hidden="true"></span>${chip}<span class="gd-sub-nom"></span>
      <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="hijo" title="Opciones">${ic('more')}</button></span>`;
    $('.gd-sub-nom', fila).textContent = nombre;
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
  /* La caja de un grupo (Leo, 16-09-2026): un corchete del color del grupo con su nombre al lado, y dentro sus filas.
     No significa nada más: junta piezas de un mismo nivel. */
  function cajaGrupo(g, nivel) {
    const caja = document.createElement('div');
    caja.className = 'gd-arb-grupo'; caja.dataset.grupo = g.id;
    caja.style.setProperty('--gc', 'var(--t-' + g.color + ')');
    /* el «⋯» de la cabecera crea dentro del grupo (Leo, 16-09-2026: «ponle unos tres puntos a los grupos del árbol
       para poder agregar nuevos elementos»); el resto de la cabecera sigue abriendo el mismo menú y arrastrando */
    caja.innerHTML = `<button type="button" class="gd-arb-marca" data-gd-menu="grupo" data-grupo-id="${esc(g.id)}"
        title="Grupo «${esc(g.nombre)}» · ${g.items.length} elementos · opciones"><span class="gd-arb-nom"></span><span class="gd-arb-n">${g.items.length}</span>
        <span class="gd-arb-mas" data-gd-menu="grupo" data-grupo-id="${esc(g.id)}" role="button" tabindex="0" aria-label="Opciones del grupo" title="Crear dentro del grupo · opciones">${ic('more', 14)}</span></button><div class="gd-arb-filas"></div>`;
    $('.gd-arb-nom', caja).textContent = g.nombre;
    return conSangria(caja, nivel);
  }
  /* Lo de un nivel (o lo de dentro de un grupo): carpetas, grupos (con lo suyo dentro, anidados) y piezas sueltas. */
  function pintarNivel(c, lista, destino, nivel) {
    lista.forEach(x => {
      if (x.tipo === 'carpeta') {
        destino.appendChild(filaCarpeta(x.obj, c.id, nivel));
        if (!x.obj.plegada) pintarNivel(c, d.nivelArbol(c.id, x.id), destino, nivel + 1);
        return;
      }
      if (x.tipo === 'grupo') {
        const caja = cajaGrupo(x.obj, nivel);
        destino.appendChild(caja);
        pintarNivel(c, d.nivelGrupo(x.id), $('.gd-arb-filas', caja), 0);
        return;
      }
      const r = ref(x.tipo, c.id, x.id), f = filaHijo(r, false);
      f.dataset.unidad = clave(r);
      destino.appendChild(conSangria(f, nivel));
    });
  }
  function nivelContenedor(c, carpetaId, nivel, destino) { pintarNivel(c, d.nivelArbol(c.id, carpetaId), destino, nivel); }
  /* `op`: `sistema` (los dos de Personajes: no se arrastran ni se eliminan), `titulo` del «＋» y `pintar(hijos)`. */
  function filaContenedor(c, op) {
    op = op || {};
    const fila = document.createElement('div');
    fila.className = 'gd-cont' + (c.fijado ? ' fijado' : '') + (op.sistema ? ' gd-cont--sistema' : '');
    fila.dataset.id = c.id; fila.dataset.gdDropCont = c.id;
    fila.innerHTML = `<span class="gd-cont-nom">
        <button type="button" class="gd-chev" data-gd-plegar title="${c.plegado ? 'Desplegar' : 'Plegar'}">${ic(c.plegado ? 'chev-r' : 'chev-d', 13)}</button>
        ${c.fijado ? '<span class="gd-estrella" aria-label="Fijado">★</span>' : ''}<span data-gd-nombre></span></span>
      <span class="gd-cont-acc siempre">
        <button type="button" data-gd-nuevo-hijo title="${op.titulo || 'Nuevo esquema de pasos o biblioteca'}">${ic('plus', 15)}</button>
        <button type="button" data-gd-menu="contenedor" title="Opciones del contenedor">${ic('more', 15)}</button></span>`;
    $('[data-gd-nombre]', fila).textContent = c.nombre;
    if (!op.sistema) fila.title = 'Arrastra para ordenar los contenedores';
    const hijos = document.createElement('div');
    hijos.className = 'gd-hijos' + (op.clase || ''); hijos.hidden = c.plegado;
    if (op.pintar) op.pintar(hijos); else nivelContenedor(c, null, 1, hijos);
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
    const enDocs = !o.modo || o.modo() === 'documentos';
    return [nav('', 'docs', 'Contenedores', 'data-gd-ir-contenedores', !per && !((esPapelera() || esPlantillas() || esFormulas()) && enDocs)),
            nav('', 'person', 'Personajes', 'data-gd-ir-personajes', per),
            filaPlantillas(enDocs),
            filaFormulas(enDocs),
            filaPapelera()];
  }
  /* «Fórmulas» (1.1.60): como «Plantillas», su tablero y cuántas hay; soltar una nota encima guarda su texto como fórmula */
  function filaFormulas(enDocs) {
    const f = document.createElement('div');
    f.className = 'gd-cont papelera gd-nav gd-formulas' + (esFormulas() && enDocs ? ' activo' : '');
    f.dataset.gdFormulas = ''; f.dataset.gdDropFormulas = '';
    f.title = 'Fórmulas: prompts reutilizables para las operaciones de IA del lienzo · suelta aquí una nota para guardar su texto como fórmula';
    const n = d && d.formulas ? d.formulas().length : 0;
    f.innerHTML = `<span class="gd-cont-nom">${ic('formula', 16)}<span data-gd-nombre>Fórmulas</span>${n ? `<span class="gd-cont-num">${n}</span>` : ''}</span>
      <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="formulas" title="Opciones de las fórmulas">${ic('more')}</button></span>`;
    return f;
  }
  /* «Plantillas» (1.1.56, de ClapBook): su tablero, con cuántas hay; soltar una nota encima guarda una copia como plantilla */
  function filaPlantillas(enDocs) {
    const f = document.createElement('div');
    f.className = 'gd-cont papelera gd-nav gd-plantillas' + (esPlantillas() && enDocs ? ' activo' : '');
    f.dataset.gdPlantillas = ''; f.dataset.gdDropPlantillas = '';
    f.title = 'Plantillas: de ellas salen notas nuevas · suelta aquí una nota para guardarla como plantilla';
    const n = d && d.plantillas ? d.plantillas().length : 0;
    f.innerHTML = `<span class="gd-cont-nom">${ic('plantilla', 16)}<span data-gd-nombre>Plantillas</span>${n ? `<span class="gd-cont-num">${n}</span>` : ''}</span>
      <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="plantillas" title="Opciones de las plantillas">${ic('more')}</button></span>`;
    return f;
  }
  /* el menú enseña el árbol de Personajes en su ámbito y también con el editor abierto desde él (Leo) */
  const enPersonajes = () => !!(o.enPersonajes && o.enPersonajes());
  /* El árbol de Personajes (Leo, 16-09-2026): dos contenedores como los de siempre. «Personajes» tiene una fila por
     personaje —que es su biblioteca—, con sus carpetas y sus grupos; «Esquemas», los esquemas de personaje. */
  function filasPersonajes() {
    const P = o.personajes ? o.personajes() : null; if (!P) return [];
    const E = C.ELENCO_CARPETAS;
    const cP = d.personajes(false) || { id: C.ID_PERSONAJES, nombre: 'Personajes', plegado: false, fijado: false };
    const cE = d.esquemasPersonajes(false) || { id: C.ID_ESQUEMAS_PERSONAJE, nombre: 'Esquemas', plegado: false, fijado: false, esquemas: [], subs: [], carpetas: [] };
    const filaPersonaje = (l, nivel) => {
      const f = document.createElement('div');
      const sub = d.contenedor(C.ID_PERSONAJES) && (d.contenedor(C.ID_PERSONAJES).subs.find(s => s.lineaId === l.id) || null);
      const abierto = actual && actual.tipo === 'sub' && sub && actual.id === sub.id && !notaAbierta && (!o.modo || o.modo() === 'documentos');
      f.className = 'gd-per' + (abierto ? ' activo' : ''); f.dataset.personaje = l.id;
      f.innerHTML = `<span class="gd-chip per-chip" style="--chl:${(PAL[l.color] || PAL[0])[1]};--chd:${(PAL[l.color] || PAL[0])[2]}" title="Personaje">${esc(C.iniciales(l.nombre))}</span><span class="gd-per-nom"></span>
        <span class="gd-cont-acc siempre"><button type="button" data-gd-menu="personaje" title="Opciones del personaje">${ic('more')}</button></span>`;
      $('.gd-per-nom', f).textContent = l.nombre;
      return conSangria(f, nivel);
    };
    /* carpetas (Leo, 16-09-2026: vuelven), grupos y personajes, en el orden del árbol */
    const pintar = (lista, destino, n) => lista.forEach(x => {
      if (x.tipo === 'carpeta') {
        destino.appendChild(filaCarpeta(x.obj, E, n));
        if (!x.obj.plegada) pintar(d.nivelArbol(E, x.id), destino, n + 1);
        return;
      }
      if (x.tipo === 'grupo') {
        const caja = cajaGrupo(x.obj, n);
        destino.appendChild(caja);
        pintar(d.nivelGrupo(x.id), $('.gd-arb-filas', caja), 0);
        return;
      }
      destino.appendChild(filaPersonaje(x.obj, n));
    });
    const elenco = filaContenedor(cP, { sistema: true, clase: ' gd-hijos--elenco', titulo: 'Nuevo personaje o carpeta', pintar: hijos => {
      pintar(d.nivelArbol(E, null), hijos, 1);
      const nuevo = document.createElement('div');
      nuevo.className = 'gd-per gd-per--nuevo'; nuevo.dataset.gdNuevoPersonaje = ''; nuevo.dataset.gdRaizElenco = '';   // soltar aquí: a la raíz
      nuevo.innerHTML = `${ic('plus', 13)}<span class="gd-per-nom">personaje</span>`;
      hijos.appendChild(conSangria(nuevo, 1));
    } });
    const esquemas = filaContenedor(cE, { sistema: true, titulo: 'Nuevo esquema de personaje', pintar: hijos => {
      if (d.contenedor(cE.id)) nivelContenedor(cE, null, 1, hijos);
      if (!hijos.children.length) hijos.appendChild(conSangria(Object.assign(document.createElement('div'), { className: 'gd-per gd-per--vacio', textContent: 'Aún no hay esquemas' }), 1));
    } });
    return [...elenco, ...esquemas];
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
  /* sin `title`: el nombre entero de una nota cortada sale en el globo al pasar el ratón (1.1.54, Leo en ClapBook: «un tooltip que
     cuando le haga hover se vea el nombre completo de la nota») */
  /* una plantilla lleva «Usar» en lugar de su fecha (como en ClapBook): una nota nueva desde ella */
  const USAR = '<button type="button" class="gd-usar" data-gd-usar title="Nueva nota con esta plantilla">Usar</button>';
  /* **Fragmento** (1.1.57): la etiqueta de una nota que es un tramo de un esquema, «Fragmento · 12 s · Piloto»; lleva a sus nodos en
     el esquema (`o.irAFragmento`). Huérfana (sin esquema, o sin ninguno de sus nodos), se ve apagada y lo dice. `corta`: solo el
     icono y los segundos (la tarjeta pequeña de una biblioteca). */
  function fragmentoHtml(n, corta) {
    const x = d && d.estadoFragmento && d.estadoFragmento(n); if (!x) return '';
    const segs = x.segundos ? String(x.segundos).replace('.', ',') + ' s' : '';
    const nom = x.nombre || 'un esquema que ya no está';
    const t = 'Fragmento' + (x.orden ? ' nº ' + x.orden : '') + ' de «' + nom + '»' + (segs ? ' · ' + segs : '') + (x.nodos.length ? ' · ' + x.nodos.length + (x.nodos.length === 1 ? ' nodo' : ' nodos') : '')
      + (x.huerfano ? ' · huérfano: ' + (x.esquema ? 'sus nodos ya no están' : x.enPapelera ? 'su esquema está en la papelera' : 'su esquema ya no existe') : ' · clic: ir a ' + (x.nodos.length ? 'sus nodos' : 'su esquema'));
    const txt = corta ? (segs || 'Frag.') : 'Fragmento' + (segs ? ' · ' + segs : '') + ' · ' + nom;
    return `<button type="button" class="cx-frag${x.huerfano ? ' huerfano' : ''}${corta ? ' corta' : ''}" data-gd-fragmento="${esc(n.id)}" title="${esc(t)}" aria-label="${esc(t)}">${ic('board', 12)}<span>${esc(txt)}</span></button>`;
  }
  function notaHtml(n, meta, fijo) {
    const cn = colorNota(n);
    return `<div class="gd-nota${cn.clase}${n.id === notaAbierta ? ' activa' : ''}${n.id === notaSel ? ' sel' : ''}"${cn.estilo} role="button" tabindex="0" data-nota="${esc(n.id)}" aria-label="${esc(n.titulo || 'Sin título')}">
            <span></span>${fragmentoHtml(n, true)}${!fijo && esPlantilla(n) ? USAR : `<span class="gd-nota-meta">${esc(meta)}</span>`}
            <button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">${ic('more', 13)}</button></div>`;
  }
  /* Una tarjeta: un segmento (o la bandeja, e = null) con sus notas, ya filtradas y ordenadas (`info` = { total, filtro, propio }):
     con un filtro de color, la cuenta dice «vistas/total»; si el segmento lleva su propio filtro (y la biblioteca no pone el
     suyo), una marca lo dice; y con un orden que no es el manual, el cuerpo no se ordena a mano (`.ordenada`). */
  function tarjeta(e, notas, info) {
    info = info || { total: notas.length, filtro: { color: null, orden: 'manual' } };
    const f = info.filtro, cuerpo = notas.map(n => notaHtml(n, fechaSegun(n, f.orden), false)).join('');
    /* la marca dice lo que pone el segmento, no lo que viene de la biblioteca */
    const pc = f.propioColor !== undefined ? f.propioColor : !!f.color, po = f.propioOrden !== undefined ? f.propioOrden : f.orden !== 'manual';
    const partes = [pc ? nombreColor(f.color) : '', po ? rotuloOrden(f.orden).toLowerCase() : ''].filter(Boolean);
    const marcaFiltro = info.propio ? `<span class="gd-etq-filtro" title="${esc('Este segmento tiene su filtro' + (partes.length ? ': ' + partes.join(' · ') : ''))}">${ic(pc ? 'filter' : 'sort', 12)}</span>` : '';
    const cabecera = `<span class="gd-etq-nom" data-globo="${e ? 'Segmento' : 'Bandeja'}"><span class="gd-asa" title="Arrastra para cambiar su posición">${ic('drag', 13)}</span><span ${e ? 'data-gd-etq-nombre' : ''}></span></span>
         <span class="gd-etq-acc">${marcaFiltro}<span class="gd-cuenta"${f.color ? ` title="${notas.length} de ${info.total}"` : ''}>${f.color ? notas.length + '/' + info.total : notas.length}</span>${BOTON_EXPANDIR}${e
           ? `<button type="button" data-gd-menu="etiqueta" title="Editar el segmento">${ic('edit', 13)}</button><button type="button" data-gd-eliminar-etq title="Eliminar el segmento">${ic('close', 13)}</button>` : ''}</span>`;
    const pie = `<button type="button" class="gd-nota-add" data-gd-crear-nota="${e ? esc(e.id) : ''}">${ic('plus', 13)}nota</button>`;
    const sec = document.createElement('section');
    sec.className = 'gd-etq' + (e ? '' : ' gd-etq--bandeja') + (notas.length ? '' : ' vacia');
    if (e) { sec.dataset.etq = e.id; sec.setAttribute('style', estiloTag(e)); }
    sec.innerHTML = `<header class="gd-etq-head">${cabecera}</header><div class="gd-etq-body${f.orden !== 'manual' ? ' ordenada' : ''}" data-gd-drop="${e ? esc(e.id) : ''}">${pie}${cuerpo}</div>`;
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
    const col = p => tm.cg(p);                                // los nodos van en columnas; el acto es el tramo que las cubre
    let nodos = tm.datos.puntos.filter(p => { if (col(p) < a.desde || col(p) >= a.desde + a.celdas) return false; const s = tm.saltoDe(p.id); return !s || (conSaltos && s.deId === p.id); })
      .sort((p, q) => col(p) - col(q) || fila(p.lineaId) - fila(q.lineaId));
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
  /* El color propio de la etiqueta de un esquema o una biblioteca (Leo, 16-09-2026: el mismo en todas las pantallas);
     sin color, la clase de siempre (violeta el esquema, azul la biblioteca). */
  function estiloHijo(id, porDefecto) {
    const r = d && (d.esquema(id) || d.sub(id) || (d.lienzo && d.lienzo(id)));
    const x = r && (r.esquema || r.sub || r.lienzo);
    const par = x && x.color !== undefined && x.color !== null && PAL[x.color];
    return par ? { clase: 'per-chip', estilo: `--chl:${par[1]};--chd:${par[2]}` } : { clase: porDefecto || '', estilo: '' };
  }
  /* Un chip con un nombre (cortado si es largo; entero al pasar el ratón). `op`: { boton, attrs, estilo, title, icono } */
  function chipNombre(nombre, clase, op) {
    op = op || {};
    const tagName = op.boton ? 'button' : 'span';
    return `<${tagName}${op.boton ? ' type="button"' : ''} class="gd-chip gd-chip-nom ${clase}"${op.estilo ? ` style="${esc(op.estilo)}"` : ''}${op.attrs || ''} aria-label="${esc(op.title || nombre)}"><span>${esc(nombre)}</span>${op.icono || ''}</${tagName}>`;   // sin title: cortado, sale el globo (texto.js)
  }
  /* el chip de las plantillas en las cabeceras, con su icono (no tienen contenedor: no están en el árbol). `op`: { boton, attrs, icono } */
  function chipPlantillas(op) { return chipEspecial(BIB_PLANTILLAS, op); }
  /* el de una biblioteca especial (las plantillas o las fórmulas, 1.1.60): su nombre y su icono */
  function chipEspecial(id, op) {
    op = op || {};
    const tag = op.boton ? 'button' : 'span', k = cualEspecial(id) || 'plantillas', x = ESPECIAL[k];
    return `<${tag}${op.boton ? ' type="button"' : ''} class="gd-chip gd-chip-nom gd-chip--plantillas gd-chip--${k}"${op.attrs || ''} aria-label="${x.nombre}">${ic(x.icono, 13)}<span>${x.nombre}</span>${op.icono || ''}</${tag}>`;
  }
  function datosSegmento(m, subId, claveSeg) {
    const r = m.sub(subId); if (!r || !claveSeg) return null;
    const per = r.contenedor.id === C.ID_PERSONAJES, pid = per ? r.sub.lineaId : null;
    const [tipo, id] = claveSeg.split(/:(.*)/s);
    const base = { tipo, r, per, pid };
    if (tipo === 'bandeja') return Object.assign(base, { nombre: 'Bandeja', rotulo: 'Bandeja', notas: m.notasDe(subId, null), etq: '' });
    if (tipo === 'guiones') return Object.assign(base, { nombre: 'Bandeja', rotulo: 'Guiones del esquema', notas: m.notasDe(subId, null), etq: '', guiones: true });
    if (tipo === 'etq') {
      const e = m.etiqueta(id); if (!e || e.subId !== subId) return null;
      const esG = m.esGuiones(subId);
      return Object.assign(base, { nombre: e.nombre, rotulo: 'Segmento', estilo: esG ? '' : estiloTag(e), e, notas: m.notasDe(subId, e.id), etq: e.id, guiones: esG });
    }
    if (tipo === 'acto') {
      const eid = ((m.enlace(subId) || {}).esquema || {}).id;
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
    let n = 0, tarjetas = '', rejilla = '', visibles = null, f = null, filtros = '';
    const pie = (meta, ruta, usar) => `<div class="gd-exp-pie">${usar ? USAR : ''}${ruta ? '<span class="gd-exp-ruta"></span>' : `<span class="gd-nota-meta">${esc(meta)}</span>`}</div>`;
    if (x.notas) {
      n = x.notas.length;
      /* buscar, filtrar y ordenar (1.1.54, de ClapBook): aquí manda el filtro del segmento; lo que no pone, lo pone el de la
         biblioteca (se ve en cursiva) */
      f = x.guiones ? { color: null, orden: 'manual', heredado: {} } : filtroPara(subId, claveDe(x), true);
      visibles = filtrarNotas(x.notas, f);
      tarjetas = visibles.map(nt => `<div class="gd-exp-nota${colorNota(nt).clase}${nt.id === notaSel ? ' sel' : ''}"${colorNota(nt).estilo} role="button" tabindex="0" data-nota="${esc(nt.id)}" aria-label="${esc(nt.titulo || 'Sin título')}">
          <div class="gd-exp-nota-cab"><span class="gd-exp-tit"></span><span class="gd-asa" aria-hidden="true">${ic('drag', 13)}</span><button type="button" class="gd-nota-acc" data-gd-menu="nota" title="Opciones de la nota">${ic('more', 13)}</button></div>
          <div class="gd-exp-texto"></div>${fragmentoHtml(nt)}${pie(fechaSegun(nt, f.orden), false, esPlantilla(nt))}</div>`).join('')
        + `<button type="button" class="gd-exp-add" data-gd-crear-nota="${esc(x.etq)}"${x.guiones ? ' data-gd-doc' : ''}>${ic('plus', 14)}${x.guiones ? 'documento' : 'nota'}</button>`;
      rejilla = (f.color && !visibles.length ? `<div class="gd-filtro-vacio">${esc(f.color === 'sin' ? 'Todas las notas del segmento tienen color.' : 'Ninguna nota del segmento es de color ' + nombreColor(f.color).toLowerCase() + '.')}</div>` : '')
        + `<div class="gd-exp-grid${f.orden !== 'manual' ? ' ordenada' : ''}" data-gd-drop="${esc(x.etq)}">${tarjetas}</div>`;
      if (!x.guiones) filtros = cajaBuscar('Buscar en el segmento', 'Buscar en las notas del segmento (Cmd+F)')
        + botonColor('colorSeg', f.color, f.heredado.color, f.heredado.color ? 'El filtro de la biblioteca (aquí manda el del segmento: cámbialo para este)' : 'Solo las notas de un color')
        + (f.color && !f.heredado.color ? `<button type="button" class="gd-filtro-quitar" data-gd-quitar-color-seg title="Quitar el filtro" aria-label="Quitar el filtro">${ic('close', 12)}</button>` : '')
        + `<button type="button" class="gd-filtro${f.heredado.orden ? ' heredado' : ''}" data-gd-menu="ordenSeg" title="${f.heredado.orden ? 'El orden de la biblioteca (aquí manda el del segmento: cámbialo para este)' : 'El orden de las notas'}">${ic('sort', 14)}<span>${esc(f.orden === 'manual' ? 'Orden manual' : rotuloOrden(f.orden))}</span>${ic('chev-d', 12)}</button>`;
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
      <div class="gd-exp-medio"><div class="gd-exp-cuerpo">
        <div class="gd-exp-banda${x.tipo === 'bandeja' ? ' gd-exp-banda--bandeja' : ''}${x.guiones ? ' gd-exp-banda--guiones' : ''}${x.tipo === 'apariciones' ? ' gd-exp-banda--apariciones' : ''}"${x.e ? ` data-etq="${esc(x.e.id)}"` : ''} style="${esc(estiloBanda)}">
          <span class="gd-exp-banda-nom"><span ${x.e ? 'data-gd-etq-nombre' : ''}></span></span><span class="gd-exp-banda-n">${n} ${n === 1 ? docs.slice(0, -1) : docs}</span>
          ${acciones ? '<i class="gd-exp-banda-sep"></i>' + acciones : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-gd-contraer title="Volver (Esc)">${ic('collapse', 15)}Contraer</button>
        </div>
        <div class="gd-exp-rot"><span>${x.nodos ? 'Documentos del ' + esc(x.rotulo.toLowerCase()) : 'Notas del segmento'}</span><i></i>${x.nodos && !x.apariciones ? `<span>Orden manual</span>${ic('sort', 14)}` : filtros}</div>
        ${rejilla}
      </div></div>`;
    $('.esq-cont', el).textContent = cab.cont;
    $('.gd-exp-banda-nom > span', el).textContent = x.nombre;
    /* títulos y primeras líneas */
    const cards = $$('.gd-exp-nota', el);
    if (x.notas) cards.forEach((c, i) => { const nt = visibles[i]; $('.gd-exp-tit', c).textContent = nt.titulo || 'Sin título'; $('.gd-exp-texto', c).textContent = textoDe(nt.html); });
    else if (x.nodos) cards.forEach((c, i) => { const p = x.nodos[i]; $('.gd-exp-tit', c).textContent = p.titulo || 'Sin título'; $('.gd-exp-texto', c).textContent = textoDe((m.notaEsquema(x.eid, p.id) || {}).html) || (window.MdVivo ? MdVivo.plano(p.descripcion) : p.descripcion) || ''; });
    else cards.forEach((c, i) => {
      const ap = x.apariciones[i], doc = ap.tipo === 'nota' ? m.nota(ap.id) : m.notaEsquema(ap.eid, ap.id);
      $('.gd-exp-tit', c).textContent = ap.titulo; $('.gd-exp-texto', c).textContent = textoDe(doc && doc.html); $('.gd-exp-ruta', c).textContent = 'en «' + ap.ruta + '»';
    });
    $$('.gd-exp-texto', el).forEach(t => { if (!t.textContent) { t.textContent = 'Sin texto'; t.classList.add('vacio'); } });
    return el;
  }
  /* la clave de un segmento en `ordenSegmentos` y en los filtros: 'bandeja' o 'etq:<id>' */
  const claveDe = x => x.e ? 'etq:' + x.e.id : 'bandeja';

  /* ---------- el campo de una nota: el documento, con su formato ----------
     «Al hacer clic en una nota, que aparezca un panel lateral con el nombre del documento… y un campo de descripción amplio; el
     texto que escriba ahí debe verse si abro el documento normal» (Leo, 18-09-2026). El campo **es el documento**, y desde la
     1.1.32 **con su formato y en los dos sentidos** (Leo: «quiero que mis campos de descripción acepten formato markdown,
     formateado y todo quiero verlo en ese campo… para el de segmentos, que sea bidireccional con el editor»): se ve con negritas,
     cursivas, subrayados, tachados, colores, resaltados, código, enlaces, títulos, listas y citas, y al escribir convierte el
     Markdown como el editor (`MdVivo.vivo`; un elemento de guion no se vuelve lista ni título). Las tablas se editan en su sitio,
     las imágenes se ven (1.1.54) y lo demás que no es texto (bases de datos, portada, diálogo doble, vídeo) va como una marca que no
     se toca. Cada bloque del campo lleva en `data-l` el del documento del que sale (`ladoOrig`, apuntados al pintarlo): al guardar,
     el que no cambió vuelve tal cual (un personaje sigue siendo personaje, con su chip) y el que cambió conserva los atributos del
     suyo (su clase de guion, su alineación) con lo que haya ahora dentro. Desde la 1.1.54 vive en la ventana de la nota (abajo). */
  const LADO_FIJO = '.db, .portada, .ed-fijo, img, hr, figure, .sp-doble, video, iframe, object, embed, svg, canvas';
  const LADO_BLOQUE = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TABLE)$/;
  const LADO_CAJA = /^(UL|OL|BLOCKQUOTE|SECTION|ARTICLE|HEADER|FOOTER)$/;          // entre sus hijos, un salto de línea no es texto
  let ladoOrig = [], ladoVista = [];
  const sinMarcasLado = el => { const c = el.cloneNode(true); c.removeAttribute('data-l'); c.querySelectorAll('[data-l]').forEach(x => x.removeAttribute('data-l')); return c.outerHTML; };
  /* lo que se ve en el campo: una copia del documento con cada bloque señalado y lo que no es texto como una marca */
  function htmlDeLado(html) {
    ladoOrig = []; ladoVista = [];
    return vistaLado(html) || '<p><br></p>';
  }
  /* la vista de un trozo de documento, con sus bloques apuntados **detrás** de los que ya hay en `ladoOrig` (así también se pinta
     lo que se inserta en el campo: una plantilla, `insertarPlantillaEnVentana`); `quitar`, un selector de lo que no debe volver
     al documento (la marca del cursor de una plantilla: se ve en el campo, pero no en lo apuntado) */
  function vistaLado(html, quitar) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    const marca = (n, k) => {
      if (n.matches('img')) {                                  // una imagen se ve tal cual (no se edita: al guardar vuelve la suya)
        const el = document.createElement('span');
        el.className = 'gd-lado-fijo gd-lado-img'; el.contentEditable = 'false'; el.dataset.f = k;
        el.title = 'Doble clic: verla en grande, marcarla o recortarla';   // (abrirImagenLado, 1.1.57)
        const img = n.cloneNode(false); img.draggable = false; el.appendChild(img);
        return el;
      }
      const nombres = n.matches('.sp-doble') ? Array.from(n.querySelectorAll('.sp-character')).map(p => p.textContent.replace(/\s+/g, ' ').trim().toUpperCase()).filter(Boolean).join(' / ') : '';
      const que = n.matches('.db') ? 'Base de datos' : n.matches('.portada') ? 'Portada' : n.matches('hr') ? 'Línea'
        : n.matches('.sp-doble') ? 'Diálogo doble' + (nombres ? ' · ' + nombres : '') : n.matches('video, iframe, object, embed') ? 'Vídeo' : 'Imagen';
      const el = document.createElement(n.matches('svg, canvas') ? 'span' : 'div');
      el.className = 'gd-lado-fijo'; el.contentEditable = 'false'; el.dataset.f = k; el.textContent = que;
      return el;
    };
    const vista = (n, caja) => {
      if (n.nodeType === 3) return caja && !n.nodeValue.trim() ? null : document.createTextNode(n.nodeValue);
      if (n.nodeType !== 1) return null;
      if (n.matches('table')) { const tb = n.cloneNode(true); tb.dataset.f = ladoOrig.push(n) - 1; return tb; }
      if (n.matches(LADO_FIJO)) return marca(n, ladoOrig.push(n) - 1);
      const c = n.cloneNode(false);
      c.removeAttribute('contenteditable');
      if (LADO_BLOQUE.test(n.tagName)) c.dataset.l = ladoOrig.push(n) - 1;
      const esCaja = LADO_CAJA.test(n.tagName) || Array.from(n.children).some(h => LADO_BLOQUE.test(h.tagName));
      n.childNodes.forEach(h => { const x = vista(h, esCaja); if (x) c.appendChild(x); });
      return c;
    };
    const caja = document.createElement('div');
    t.content.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) { const p = document.createElement('p'); p.textContent = n.nodeValue; caja.appendChild(p); } return; }
      const x = vista(n, true); if (x) caja.appendChild(x);
    });
    caja.querySelectorAll('[data-l]').forEach(el => { ladoVista[+el.dataset.l] = sinMarcasLado(el); });
    if (quitar) t.content.querySelectorAll(quitar).forEach(x => x.remove());   // de lo apuntado (lo que se ve la conserva)
    return caja.innerHTML;
  }
  /* del campo al documento: lo que no cambió, tal cual; lo que cambió, con los atributos de su bloque; las marcas, lo que eran.
     Los espacios de anchura cero que deja un atajo (MdVivo) no pasan al documento, y un bloque que se queda vacío lleva su <br>. */
  function htmlDeLadoEditado(campo) {
    const usados = new Set();
    const salida = n => {
      if (n.nodeType === 3) return document.createTextNode(n.nodeValue.replace(/\u200B/g, ''));
      if (n.nodeType !== 1) return null;
      if (n.hasAttribute('data-f')) {
        if (n.matches('table')) {
          const tb = n.cloneNode(true); tb.removeAttribute('data-f'); tb.querySelectorAll('[data-l]').forEach(x => x.removeAttribute('data-l'));
          const tw = document.createTreeWalker(tb, NodeFilter.SHOW_TEXT); let x;   // sin los espacios de anchura cero de los atajos
          while ((x = tw.nextNode())) x.nodeValue = x.nodeValue.replace(/\u200B/g, '');
          return tb;
        }
        const o = ladoOrig[+n.dataset.f]; return o ? o.cloneNode(true) : null;
      }
      const k = n.hasAttribute('data-l') ? +n.dataset.l : -1, o = k >= 0 ? ladoOrig[k] : null;
      if (o && !usados.has(k) && o.tagName === n.tagName && sinMarcasLado(n) === ladoVista[k]) { usados.add(k); return o.cloneNode(true); }
      const c = n.cloneNode(false); c.removeAttribute('data-l');
      n.childNodes.forEach(h => { const x = salida(h); if (x) c.appendChild(x); });
      if (!c.textContent && !c.querySelector('br, img, table') && /^(P|DIV|H[1-6]|LI)$/.test(c.tagName)) c.appendChild(document.createElement('br'));
      return c;
    };
    const out = document.createElement('div');
    let suelto = null;                                         // texto o formato sin párrafo (Chrome, con el campo vacío): a un párrafo
    campo.childNodes.forEach(n => {
      const bloque = n.nodeType === 1 && (LADO_BLOQUE.test(n.tagName) || n.hasAttribute('data-f'));
      if (bloque) { suelto = null; const x = salida(n); if (x) out.appendChild(x); return; }
      if (n.nodeType === 3 && !n.nodeValue.replace(/\u200B/g, '').trim() && !suelto) return;
      if (!suelto) { suelto = document.createElement('p'); out.appendChild(suelto); }
      const x = salida(n); if (x) suelto.appendChild(x);
    });
    return out.innerHTML || '<p><br></p>';
  }

  /* ---------- los recuadros en la ventana de una nota (1.1.57) ----------
     Un prompt o un aviso del documento (`div.rc[data-rc]`, js/recuadros.js) se ve en el campo con su cabecera (css/recuadros.css
     la pinta desde sus atributos) y su texto se edita ahí: `vistaLado` lo copia como a cualquier bloque (con sus párrafos
     señalados) y `htmlDeLadoEditado` lo devuelve con sus atributos. Lo que en el editor hace js/recuadros.js (que vive en el marco),
     aquí en pequeño: un clic en la cabecera abre su menú (título, tipo, color, copiar, quitar) o copia el prompt; Enter en la
     última línea vacía sale; Retroceso y Supr no lo mezclan con lo de al lado; el clic derecho lo ofrece arriba del de formato. */
  const RCX = () => C.conversor && C.conversor.RECUADROS;
  const recuadroEn = (n, campo) => { const e = n && (n.nodeType === 3 ? n.parentNode : n), rc = e && e.closest ? e.closest('div[data-rc]') : null; return rc && rc.parentNode === campo ? rc : null; };
  /* 'copiar', 'menu' o null: dónde cae (x, y) en la cabecera del recuadro (por encima de su primer bloque; «Copiar», a la derecha) */
  function zonaRc(rc, x, y) {
    const caja = rc.getBoundingClientRect(), p = rc.firstElementChild, tope = p ? p.getBoundingClientRect().top - 2 : caja.top + 32;
    if (y < caja.top || y > tope || x < caja.left || x > caja.right) return null;
    return rc.getAttribute('data-rc') === 'prompt' && x > caja.right - 92 ? 'copiar' : 'menu';
  }
  function copiarPrompt(rc) {
    const t = RCX() ? RCX().texto(rc.outerHTML) : rc.innerText;
    const hecho = ok => { if (o.avisar) o.avisar(ok ? 'Prompt copiado' : 'No se pudo copiar el prompt'); };
    if (window.editorAPI && window.editorAPI.copiarTexto) window.editorAPI.copiarTexto(t).then(() => hecho(true), () => hecho(false));
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => hecho(true), () => hecho(false));
  }
  const tocado = campo => campo.dispatchEvent(new Event('input', { bubbles: true }));   // se guarda como lo escrito
  const cursorRc = (n, k) => { const r = document.createRange(); r.setStart(n, k); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  function quitarRecuadroLado(rc, campo) {
    const ultimo = rc.lastElementChild;
    while (rc.firstChild) rc.parentNode.insertBefore(rc.firstChild, rc);
    rc.remove();
    if (ultimo) { campo.focus({ preventScroll: true }); cursorRc(ultimo, ultimo.childNodes.length); }
    tocado(campo);
  }
  /* su menú: título, tipo (un aviso), color, copiar, convertir y quitar */
  function menuRecuadroLado(rc, campo, x, y) {
    const R = RCX(); if (!R) return;
    const f = document.createDocumentFragment(), caja = document.createElement('div'); caja.className = 'rc-menu rc-menu-lado';
    const dato = k => rc.getAttribute(k), esPrompt = dato('data-rc') === 'prompt';
    const pintar = () => {
      const tipo = R.tipo(dato('data-tipo')), col = R.color(dato('data-color')), oscuro = document.documentElement.dataset.theme === 'dark';
      caja.innerHTML = `<div class="gd-pop-tit">${esPrompt ? 'Prompt' : 'Aviso'}</div>`
        + `<label class="rc-menu-tit"><span>Título</span><input type="text" data-rc-titulo spellcheck="false" autocomplete="off" placeholder="${esc(R.nombre({ rc: esPrompt ? 'prompt' : 'aviso', tipo }))}"></label>`
        + (esPrompt ? '' : '<div class="gd-pop-tit">Tipo de aviso</div><div class="rc-menu-tipos">' + R.TIPOS.map(([id, nom, gl]) => `<button type="button" data-rc-tipo="${id}" class="${tipo === id ? 'active' : ''}"><i>${esc(gl)}</i><span>${esc(nom)}</span></button>`).join('') + '</div>')
        + '<div class="gd-pop-tit">Color</div><div class="rc-menu-colores">' + `<button type="button" data-rc-color="" class="auto${col ? '' : ' active'}">Auto</button>`
        + R.COLORES.map(([id, nom, cl, os]) => `<button type="button" data-rc-color="${id}" class="${col === id ? 'active' : ''}" title="${esc(nom)}" style="--sw: ${oscuro ? cl : os}; --sw-f: ${oscuro ? os : cl}"></button>`).join('') + '</div>';
      $('[data-rc-titulo]', caja).value = dato('data-titulo') || '';
    };
    pintar();
    caja.addEventListener('click', e => {
      const t = e.target.closest('[data-rc-tipo]'), c = e.target.closest('[data-rc-color]');
      if (t) { rc.setAttribute('data-tipo', t.dataset.rcTipo); pintar(); tocado(campo); }
      else if (c) { if (c.dataset.rcColor) rc.setAttribute('data-color', c.dataset.rcColor); else rc.removeAttribute('data-color'); pintar(); tocado(campo); }
    });
    caja.addEventListener('input', e => {
      if (!e.target.matches('[data-rc-titulo]')) return;
      const v = e.target.value.replace(/[\r\n]+/g, ' ').trim();
      if (v) rc.setAttribute('data-titulo', v); else rc.removeAttribute('data-titulo');
      tocado(campo);
    });
    caja.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); cerrarPop(); campo.focus({ preventScroll: true }); } });
    f.appendChild(caja);
    f.appendChild(separador());
    if (esPrompt) f.appendChild(opcion('Copiar el texto del prompt', () => copiarPrompt(rc)));
    f.appendChild(opcion(esPrompt ? 'Convertir en aviso' : 'Convertir en prompt', () => {
      rc.setAttribute('data-rc', esPrompt ? 'aviso' : 'prompt'); rc.className = 'rc rc-' + (esPrompt ? 'aviso' : 'prompt');
      if (esPrompt) rc.setAttribute('data-tipo', 'note'); else rc.removeAttribute('data-tipo');
      tocado(campo);
    }));
    f.appendChild(opcion('Quitar el recuadro', () => quitarRecuadroLado(rc, campo), { clase: 'peligro' }));
    cerrarPop();
    abrirPop(anclaEn(x, y), f);
    const campoTit = abierto && $('[data-rc-titulo]', abierto); if (campoTit) { campoTit.focus({ preventScroll: true }); campoTit.select(); }
  }
  /* los oyentes del campo (una vez, al crear la ventana) */
  function recuadrosEnCampo(campo) {
    /* en el `mousedown` no se pone el cursor; en el `click` se actúa y no llega a la capa (su clic cierra los menús abiertos) */
    let pulsado = null;
    campo.addEventListener('mousedown', e => {
      pulsado = null;
      if (e.button !== 0 || !e.target.matches || !e.target.matches('div[data-rc]') || e.target.parentNode !== campo) return;
      const z = zonaRc(e.target, e.clientX, e.clientY); if (!z) return;
      e.preventDefault(); e.stopPropagation();
      pulsado = { rc: e.target, z };
    }, true);
    campo.addEventListener('click', e => {
      if (!pulsado) return;
      const { rc, z } = pulsado; pulsado = null;
      e.preventDefault(); e.stopPropagation();
      if (z === 'copiar') copiarPrompt(rc); else menuRecuadroLado(rc, campo, e.clientX, e.clientY);
    }, true);
    campo.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || !campo.querySelector(':scope > div[data-rc]')) return;
      const s = getSelection(), r = s && s.rangeCount ? s.getRangeAt(0) : null;
      if (!r || !r.collapsed || !campo.contains(r.startContainer)) return;
      let b = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
      b = b.closest ? b.closest('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote') : null;
      if (!b || !campo.contains(b)) return;
      const vacio = el => !el.textContent.replace(/\u200B/g, '').trim() && !el.querySelector('img, table');
      const borde = final => { const t = document.createRange(); if (final) { t.setStart(r.endContainer, r.endOffset); t.setEnd(b, b.childNodes.length); } else { t.setStart(b, 0); t.setEnd(r.startContainer, r.startOffset); } return !t.toString().replace(/\u200B/g, ''); };
      const parar = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const rc = recuadroEn(b, campo), linea = () => { const p = document.createElement('p'); p.appendChild(document.createElement('br')); return p; };
      if (e.key === 'Enter' && !e.shiftKey) {
        if (rc && b.parentNode === rc && b.tagName === 'P' && vacio(b) && b === rc.lastElementChild && rc.children.length > 1) {
          parar(); b.remove();
          let n = rc.nextElementSibling; if (!(n && n.tagName === 'P' && vacio(n))) { n = linea(); rc.after(n); }
          cursorRc(n, 0); tocado(campo);
        }
        return;
      }
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const atras = e.key === 'Backspace';
      if (rc && b.parentNode === rc) {
        if (atras && b === rc.firstElementChild && borde(false)) {
          parar();
          if (vacio(rc)) { const p = linea(); rc.replaceWith(p); cursorRc(p, 0); tocado(campo); }
          else if (vacio(b) && b.nextElementSibling) { const sig = b.nextElementSibling; b.remove(); cursorRc(sig, 0); tocado(campo); }
          else { const prev = rc.previousElementSibling; if (prev && !prev.matches('[data-f], div[data-rc]')) cursorRc(prev, prev.childNodes.length); }
        } else if (!atras && b === rc.lastElementChild && borde(true)) parar();
        return;
      }
      if (b.parentNode !== campo) return;
      const vecino = atras ? b.previousElementSibling : b.nextElementSibling;
      if (!(vecino && vecino.matches('div[data-rc]') && borde(!atras))) return;
      parar();
      if (vacio(b) && (atras ? b.nextElementSibling : true)) { b.remove(); tocado(campo); }
      const dest = atras ? vecino.lastElementChild : vecino.firstElementChild;
      if (dest && (atras || !b.isConnected)) cursorRc(dest, atras ? dest.childNodes.length : 0);
    }, true);
  }

  /* ---------- una imagen de la ventana de una nota: verla, marcarla y recortarla (1.1.57, js/anotar.js) ----------
     Lo mismo que en el editor (js/imagenes.js): la marcada va en `src` y la de antes, las formas y el recorte en `data-original`,
     `data-anotaciones` y `data-recorte`. La imagen del documento es `ladoOrig[k]` (la marca del campo solo la enseña): se
     sustituye ahí, se repinta la marca y se guarda la nota. */
  function abrirImagenLado(marca) {
    const An = window.Anotar, k = +marca.dataset.f, orig = ladoOrig[k], id = ladoId;
    if (!An || !orig || !orig.matches('img')) return;
    const at = {}; Array.from(orig.attributes).forEach(a => { at[a.name] = a.value; });
    const d = An.leer(at), src = d.original || d.src; if (!src) return;
    const poner = cambios => {
      if (ladoId !== id || !marca.isConnected || ladoOrig[k] !== orig) { if (o.avisar) o.avisar('La ventana de esa nota ya se cerró'); return; }
      const nueva = orig.cloneNode(false);
      Object.keys(cambios).forEach(a => { if (cambios[a] == null) nueva.removeAttribute(a); else nueva.setAttribute(a, cambios[a]); });
      if (nueva.outerHTML === orig.outerHTML) return;
      ladoOrig[k] = nueva;
      const img = nueva.cloneNode(false); img.draggable = false; marca.replaceChildren(img);
      guardarLadoYa();
    };
    An.abrir({ nombre: orig.getAttribute('alt') || 'Imagen', src, vista: d.src, tipo: An.tipoDe(src), anotaciones: d.anotaciones, recorte: d.recorte,
      avisar: t => { if (o.avisar) o.avisar(t); },
      alCerrar: () => { const c = campoLado(); if (c && ladoId === id) c.focus({ preventScroll: true }); },
      alGuardar: async r => { const datos = r && r.datos ? await An.ligera(r.datos) : null; poner(An.atributosTrasEditar(d, Object.assign({}, r, { datos }))); },
      alOriginal: d.original ? () => poner(An.atributosTrasEditar(d, null)) : null });
  }

  /* ---------- una fórmula en su ventana: solo texto (1.1.60) ----------
     Una fórmula es un prompt: su campo se edita como texto plano (renglones; sin formato, sin elementos de guion, sin recuadros ni
     imágenes) y se guarda como párrafos simples. `lineasDe` saca el texto de un árbol renglón a renglón (un bloque o un <br>
     cortan; un bloque vacío es un renglón en blanco) y `htmlPlano` lo vuelve párrafos. */
  function lineasDe(raiz) {
    const lineas = []; let linea = null;
    const andar = n => {
      if (n.nodeType === 3) {
        const t = n.nodeValue.replace(/\u200B/g, '').replace(/\u00a0/g, ' ');
        if (linea === null && !/\S/.test(t) && /\n/.test(t)) return;   // el salto de línea del HTML entre dos bloques
        linea = (linea || '') + t.replace(/\n/g, ' '); return;
      }
      if (n.nodeType !== 1 && n.nodeType !== 11) return;
      if (n.nodeType === 1 && n.tagName === 'BR') { lineas.push(linea || ''); linea = null; return; }
      if (n.nodeType === 1 && n.matches('img, video, iframe, object, embed, svg, canvas, hr, style, script')) return;
      const bloque = n.nodeType === 1 && LADO_BLOQUE.test(n.tagName);
      if (bloque && linea !== null) { lineas.push(linea); linea = null; }
      const antes = lineas.length;
      n.childNodes.forEach(andar);
      if (bloque) { if (linea !== null) { lineas.push(linea); linea = null; } else if (lineas.length === antes) lineas.push(''); }
    };
    andar(raiz);
    if (linea !== null) lineas.push(linea);
    return lineas.map(l => l.replace(/[ \t]+$/, ''));
  }
  const htmlPlano = lineas => lineas.length ? lineas.map(l => l.trim() ? '<p>' + esc(l) + '</p>' : '<p><br></p>').join('') : '<p><br></p>';
  /* el documento de una fórmula, como se ve en su campo */
  function vistaPlana(html) {
    if (C.formulas && C.formulas.textoDeHtml) { const x = C.formulas.textoDeHtml(html || ''); return htmlPlano(x ? x.split('\n') : []); }   // como lo lee el modelo
    const t = document.createElement('template'); t.innerHTML = html || ''; return htmlPlano(lineasDe(t.content));
  }
  const esPlano = campo => !!(campo && campo.classList.contains('plano'));
  /* lo que el campo en modo texto no deja: los atajos de formato, el formato del sistema (Cmd+B de Chrome), soltar cosas y los
     atajos Markdown de MdVivo (su `input`); pegar entra como texto. Va en captura en la capa, antes que los oyentes del campo. */
  function soloTexto(capa, campo) {
    const dentro = e => esPlano(campo) && e.target && (e.target === campo || campo.contains(e.target));
    capa.addEventListener('keydown', e => {
      if (!dentro(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const fmt = (window.MdVivo && MdVivo.atajoDe && MdVivo.atajoDe(e)) || (mod && !e.shiftKey && !e.altKey && /^[biuek]$/i.test(e.key));
      if (fmt) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    capa.addEventListener('beforeinput', e => {
      if (!dentro(e)) return;
      if (/^format/.test(e.inputType || '') || e.inputType === 'insertFromDrop' || e.inputType === 'insertLink') { e.preventDefault(); e.stopPropagation(); }
    }, true);
    capa.addEventListener('input', e => {
      if (!dentro(e)) return;
      e.stopPropagation();                                     // ni los atajos Markdown ni nada: solo guardar, como lo escrito
      clearTimeout(ladoT); ladoT = setTimeout(guardarLadoYa, 400);
    }, true);
    capa.addEventListener('paste', e => {
      if (!dentro(e)) return;
      e.preventDefault(); e.stopPropagation();
      const t = ((e.clipboardData && e.clipboardData.getData('text/plain')) || '').replace(/\r\n?/g, '\n');
      if (t) document.execCommand('insertText', false, t);
    }, true);
    capa.addEventListener('drop', e => { if (dentro(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* ---------- la ventana de una nota (1.1.54, como en ClapBook) ----------
     Leo, en ClapBook: «En lugar del sidepanel que usamos como vista previa en los segmentos y bibliotecas, que sea mejor un modal
     como en notion, que puede expandirse y se cierra si se presiona fuera del modal», «En el modal de notas, se extrañan las
     flechas de < > para navegar por las otras notas del segmento… Se debe conservar donde dejo el scroll», y «que al llegar al
     límite, la > … cámbiala por un + para permitirme agregar otra nota en el mismo segmento». Un clic en una nota de una biblioteca
     o de un segmento expandido la abre en una ventana encima de todo: la ruta (biblioteca › segmento; cada una lleva a su sitio),
     ‹ n/N › por las notas del segmento en el orden en que se ven (con sus filtros y lo que se busque; en la última, «＋» crea otra
     ahí), el color, el enlace para Claude, el ⋯ de la nota, la papelera y ×; debajo, su nombre y el documento con su formato (el
     campo de arriba). Se cierra con un clic fuera (el botón pulsado también fuera y pasados 350 ms: el segundo clic de un doble
     clic en la tarjeta cae ya aquí), con Esc o con ×; ⤢ o el doble clic en la tarjeta (< 700 ms) la abren en el editor, y
     «Contraer» en la cabecera del editor la devuelve aquí. Cada nota vuelve a su ventana con el desplazamiento y el cursor donde
     se dejaron (`posLado`, mientras dura la sesión). La capa vive en el `body`, fuera de `main`: redibujar la biblioteca no la
     toca (el panel lateral se rehacía en cada render: parpadeaba, perdía lo último escrito y se cerraba al crear una nota o al
     plegar el menú, lo mismo que Leo vio en ClapBook). Se reabre sola solo al volver a una pestaña o a la vista que la tenía
     (`reabrir`). Corta los clics y las teclas de borrar, flechas y deshacer, que el tablero de tramas oye en `document` (fuera de
     un campo borrarían o desharían en el esquema escondido): por eso nada de dentro lleva `data-nota` ni `.esq-titulo`. */
  let ladoId = null, ladoT = null, capa = null, abiertaEn = 0, ladoCargado = '';
  let tituloCargado = '';                                      // el nombre que la ventana conoce: lo demás en el campo es de Leo
  let porTarjeta = 0;                                          // abierta con un clic en su tarjeta (para el doble clic: al editor)
  let reabrir = false;
  const posLado = new Map();                                   // id de la nota → { scroll, bloque, car }
  const campoLado = () => capa && $('[data-gd-lado-texto]', capa);
  const tituloLado = () => capa && $('[data-gd-lado-titulo]', capa);
  const hojaLado = () => capa && $('.gd-modal-hoja', capa);
  const ventanaAbierta = () => !!(ladoId && capa && !capa.hidden);
  const sinGuion = el => !Array.from(el.classList).some(c => /^sp-/.test(c));   // un elemento de guion no se vuelve lista ni título
  function capaNota() {
    if (capa) return capa;
    capa = document.createElement('div');
    capa.className = 'gd-modal-capa'; capa.hidden = true;
    capa.innerHTML = `<div class="gd-modal" role="dialog" aria-modal="true" aria-label="Nota" tabindex="-1">
        <header class="gd-modal-cab">
          <button type="button" class="icono" data-gd-lado-abrir title="Abrir en el editor (doble clic en la nota)" aria-label="Abrir en el editor">${ic('expand', 15)}</button>
          <nav class="gd-modal-ruta" aria-label="Dónde está la nota"></nav><span class="spacer"></span>
          <span class="gd-modal-usar"></span><span class="gd-modal-nav" data-gd-nav-lado></span>
          <button type="button" class="icono gd-modal-color" data-gd-lado-color aria-label="Color de la nota"><i></i></button>
          ${o.copiarEnlace ? `<button type="button" class="icono" data-gd-lado-enlace title="Copiar enlace para Claude (Cmd+Shift+C)" aria-label="Copiar enlace para Claude">${ic('link', 15)}</button>` : ''}
          <button type="button" class="icono" data-gd-menu="nota" title="Opciones de la nota" aria-label="Opciones de la nota">${ic('more', 15)}</button>
          <button type="button" class="icono gd-modal-tirar" data-gd-lado-tirar title="Mover la nota a la papelera" aria-label="Mover la nota a la papelera">${ic('trash', 15)}</button>
          <button type="button" class="icono" data-gd-lado-cerrar title="Cerrar (Esc)" aria-label="Cerrar">${ic('close', 15)}</button>
        </header>
        <div class="gd-modal-hoja"><div class="gd-modal-papel">
          <input type="text" class="gd-modal-titulo" data-gd-lado-titulo spellcheck="false" autocomplete="off" placeholder="Sin título" aria-label="Nombre de la nota">
          <div class="gd-lado-texto md-texto" data-gd-lado-texto contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="La nota" data-vacio="Escribe aquí; se ve igual al abrir el documento"></div>
          <div class="gd-modal-cola" data-gd-modal-cola></div>
        </div></div>
      </div>`;
    document.body.appendChild(capa);
    const tit = tituloLado(), campo = campoLado();
    /* el campo: Markdown al escribir, los atajos del editor (MdVivo) y, al pegar, una dirección sobre lo elegido es un enlace y
       lo que parece Markdown entra con su formato (como en el editor) */
    if (window.MdVivo) MdVivo.vivo(campo, { bloques: sinGuion, markdown: true, resaltado: () => colorResaltado(), pedirEnlace: () => cuadroEnlace(campo) });
    recuadrosEnCampo(campo);                                   // los prompts y los avisos (1.1.57): su cabecera, Enter, Retroceso
    soloTexto(capa, campo);                                    // una fórmula (1.1.60): texto plano
    /* el menú «/», el zoom del texto, la longitud de línea, typewriter y citar en el asistente (1.1.60, js/claquedraw/ventana.js) */
    if (C.ventana) C.ventana.montar(capa, {
      campo, id: () => ladoId, plano: () => esPlano(campo), nota: () => { const m = modelo(); return ladoId && m ? m.nota(ladoId) : null; },
      vista: h => vistaLado(h), guardar: () => guardarLadoYa(), avisar: t => { if (o.avisar) o.avisar(t); },
      plantilla: r0 => insertarPlantillaEnVentana(null, r0 && campo.contains(r0.startContainer) ? r0 : undefined),
      citar: o.citar ? (ref, texto) => o.citar(ref, texto) : null,
      prefs: () => o.vista || (o.vista = {}), guardarPrefs: () => guardarVista(),
      versiones: boton => menuVersionesLado(boton)             // las versiones de la nota (1.1.60, como en ClapBook)
    });
    /* doble clic en una imagen: el visor, para marcarla o recortarla (1.1.57); no llega al de la capa (que abriría el editor) */
    campo.addEventListener('dblclick', e => { const s = e.target.closest && e.target.closest('.gd-lado-img'); if (s && campo.contains(s)) { e.preventDefault(); e.stopPropagation(); abrirImagenLado(s); } });
    capa.addEventListener('mousedown', e => { capa._fuera = e.target === capa; });
    capa.addEventListener('click', e => {
      e.stopPropagation();                                     // ni el tablero de tramas ni el «clic fuera» del gestor
      const t = e.target.closest('[data-gd-menu]');
      if (t) { e.preventDefault(); const nodo = MENUS[t.dataset.gdMenu] && MENUS[t.dataset.gdMenu](t); if (nodo) abrirPop(t, nodo); return; }
      if (!(disparador && disparador.contains && disparador.contains(e.target))) cerrarPop();
      if (e.target === capa) { if (capa._fuera && Date.now() - abiertaEn > 350) { cerrarLado(); soltarSeleccion(); } return; }
      const a = e.target.closest('a[href]');                   // Cmd+clic en un enlace del documento: lo abre (1.1.53: también los clapcraft://)
      if (a && campo.contains(a) && (e.metaKey || e.ctrlKey)) { e.preventDefault(); abrirDireccion(a.getAttribute('href')); return; }
      const b = e.target.closest('button, [data-gd-modal-cola]'); if (!b) return;
      const nt = ladoId && d && d.nota(ladoId);
      if (b.matches('[data-gd-lado-cerrar]')) { cerrarLado(); soltarSeleccion(); return; }
      if (b.matches('[data-gd-lado-abrir]')) { expandirLado(); return; }
      if (b.matches('[data-gd-nota-mover]')) { moverLado(+b.dataset.gdNotaMover); return; }
      if (b.matches('[data-gd-nota-nueva]')) { if (nt) { guardarLadoYa(); nuevaNota(nt.subId, nt.etiquetaId || null, { alFinal: true }); } return; }
      if (b.matches('[data-gd-ruta]')) { if (nt) irARuta(nt.id, b.dataset.gdRuta); return; }
      if (b.matches('[data-gd-lado-color]')) { if (nt) abrirPop(b, paletaNota(nt.id)); return; }
      if (b.matches('[data-gd-lado-enlace]')) { if (nt && o.copiarEnlace) o.copiarEnlace({ tipo: 'nota', id: nt.id }); return; }
      if (b.matches('[data-gd-lado-tirar]')) { if (nt) { guardarLadoYa(); tirarNota(nt.id); } return; }
      if (b.matches('[data-gd-usar]')) { if (nt) { guardarLadoYa(); const id = nt.id; cerrarLado(); desdePlantilla(id); } return; }   // una plantilla: una nota nueva desde ella
      if (b.matches('[data-gd-modal-cola]')) alFinalDelCampo();
    });
    /* el segundo clic de un doble clic en la tarjeta ya cae en la ventana (recién abierta): el doble clic la lleva al editor */
    capa.addEventListener('dblclick', e => { e.stopPropagation(); if (ladoId && porTarjeta && Date.now() - porTarjeta < 700 && !e.target.closest('button')) expandirLado(); });   // no tras ‹ › ni «＋»
    capa.addEventListener('contextmenu', e => { e.stopPropagation(); if (e.target.closest('[data-gd-lado-texto]')) menuFormato(e, campo); });
    capa.addEventListener('keydown', e => {
      if (e.key === 'Escape') {                                // un menú abierto lo cierra antes el oyente en captura
        if (e.defaultPrevented || abierto) return;
        e.preventDefault(); e.stopPropagation();
        if (e.target === tit) aplicarTituloLado();
        cerrarLado(); soltarSeleccion(); return;
      }
      if (e.target === tit && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault(); e.stopPropagation(); aplicarTituloLado();
        const pc = cursorTrasTitulo && cursorTrasTitulo.id === ladoId ? cursorTrasTitulo.p : null; cursorTrasTitulo = null;
        if (!(pc && reponerLado(pc) && verCursor())) alPrincipioDelCampo();   // desde una plantilla: donde decía {{cursor}}
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key) || (mod && /^[zyd]$/i.test(e.key))) e.stopPropagation();
    });
    /* el nombre, al momento (vacío no: se queda el que había); el documento, poco después y siempre al salir */
    tit.addEventListener('input', () => {
      const m = modelo(), nt = ladoId && m && m.nota(ladoId); if (!nt) return;
      const v = tit.value.trim(); if (!v || v === nt.titulo) return;
      if (m.renombrarNota(nt.id, v).ok) { tituloCargado = nt.titulo; if (o.guardar) o.guardar(); pintarTituloTarjetas(nt); }
    });
    tit.addEventListener('focusout', () => aplicarTituloLado());
    campo.addEventListener('input', () => { clearTimeout(ladoT); ladoT = setTimeout(guardarLadoYa, 400); });
    campo.addEventListener('focusin', () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) {} });
    campo.addEventListener('focusout', () => guardarLadoYa());
    return capa;
  }
  /* `op`: { enfocarTitulo } (una nota nueva: el nombre elegido, para escribir encima), { porTarjeta } (un clic en su tarjeta),
     { cursor } (una nota que sale de una plantilla: `{ bloque, caracter }` en el documento, donde decía {{cursor}}; con
     `enfocarTitulo`, Enter en el nombre lleva allí), { alFinal } (sin `cursor`: el cursor al final del campo) */
  function mostrarLado(id, op) {
    op = op || {};
    const m = modelo(), nt = m && m.nota(id); if (!nt || m.enPapelera(id)) return;
    const c = capaNota();
    if (ladoId === id && !c.hidden) { refrescarVentana(); if (op.enfocarTitulo) setTimeout(() => { const t = tituloLado(); t.focus(); t.select(); }, 0); return; }   // ya está
    guardarLadoYa(); apuntarLado();
    ladoId = id; abiertaEn = Date.now(); porTarjeta = op.porTarjeta ? abiertaEn : 0; cursorTrasTitulo = null;
    c.hidden = false; document.body.classList.add('con-ventana');
    if (o.alNavegar) setTimeout(() => o.alNavegar(), 0);         // la pestaña de delante apunta la nota elegida
    pintarCabeceraLado(m, nt);
    tituloLado().value = tituloCargado = nt.titulo || '';
    pintarCampo(nt);
    const hoja = hojaLado(); hoja.scrollTop = 0;
    if (C.ventana) C.ventana.alAbrir();
    pintarVersionLado();
    const antes = posLado.get(id);
    const pc = op.cursor ? cursorDe(nt.html, op.cursor) : null;
    setTimeout(() => {
      if (ladoId !== id) return;
      if (op.enfocarTitulo) { if (pc) cursorTrasTitulo = { id, p: pc }; const t = tituloLado(); t.focus(); t.select(); return; }
      if (pc && reponerLado(pc)) { verCursor(); return; }
      if (op.alFinal) { alFinalDelCampo(); verCursor(); return; }   // desde una plantilla, ya con nombre: a escribir detrás
      if (!(antes && reponerLado(antes))) $('.gd-modal', c).focus({ preventScroll: true });
      if (antes) { hoja.scrollTop = antes.scroll; setTimeout(() => { if (ladoId === id) hoja.scrollTop = antes.scroll; }, 80); }   // otra vez, con las imágenes ya medidas
    }, 0);
  }
  function pintarCampo(nt) {
    const campo = campoLado(), plano = esFormula(nt);
    campo.classList.toggle('plano', plano);
    campo.innerHTML = plano ? vistaPlana(nt.html) : htmlDeLado(nt.html);
    campo.dataset.base = campo.innerHTML;                      // lo que había, para saber si se tocó
    ladoCargado = nt.html || '';
  }
  /* la ruta, la navegación, el color y el ⋯ de la cabecera */
  function pintarCabeceraLado(m, nt) {
    $('.gd-modal-ruta', capa).innerHTML = rutaLadoHtml(m, nt);
    const cont = $('.gd-modal-cont', capa), r = m.sub(nt.subId);
    if (cont && r) cont.textContent = especial(r.sub.id) ? '' : r.contenedor.id === C.ID_PERSONAJES ? 'Personajes' : r.contenedor.nombre;   // las plantillas no tienen contenedor
    const fx = esFormula(nt);                                  // una fórmula (1.1.60): no va al editor de guion
    $('[data-gd-lado-abrir]', capa).hidden = fx;
    $('.gd-modal', capa).classList.toggle('gd-modal--formula', fx);
    $('[data-gd-lado-texto]', capa).dataset.vacio = fx ? 'Escribe la fórmula: el formato, el tono, el estilo o las reglas. {{instruccion}} marca dónde va lo escrito en «Qué escribir»' : 'Escribe aquí; se ve igual al abrir el documento';
    $('.gd-modal-usar', capa).innerHTML = esPlantilla(nt) ? `<button type="button" class="btn gd-lado-usar" data-gd-usar title="Nueva nota con esta plantilla">${ic('plantilla', 14)}Usar</button>` : '';
    $('[data-gd-nav-lado]', capa).innerHTML = navHtml(m, nt);
    const col = $('[data-gd-lado-color]', capa), modal = $('.gd-modal', capa);
    [col, modal].forEach(x => { x.classList.toggle('con-color', !!nt.color); if (nt.color) x.style.setProperty('--tc', `var(--t-${nt.color})`); else x.style.removeProperty('--tc'); });
    col.title = nt.color ? 'Color: ' + nombreColor(nt.color).toLowerCase() + ' (cambiarlo)' : 'Sin color (ponerle uno)';
    $('[data-gd-menu="nota"]', capa).dataset.notaId = nt.id;
  }
  /* «CONTENEDOR [biblioteca] › [segmento]», con los chips de las cabeceras: la biblioteca lleva a su tablero y el segmento, a su
     vista expandida (en Personajes, el personaje con su color) */
  function rutaLadoHtml(m, n) {
    const r = m.sub(n.subId); if (!r) return '';
    const e = n.etiquetaId ? m.etiqueta(n.etiquetaId) : null, per = r.contenedor.id === C.ID_PERSONAJES;
    const pj = per && m.personaje(r.sub.lineaId), pt = pj && PAL[pj.color], nomSub = pj ? pj.nombre : r.sub.nombre;
    const chipSub = especial(r.sub.id) ? chipEspecial(r.sub.id, { boton: true, attrs: ` data-gd-ruta="bib" title="${infoEspecial(r.sub.id).las.replace(/^l/, 'L')}"` })
      : per
      ? chipNombre(nomSub, 'per-chip', { boton: true, attrs: ` data-gd-ruta="bib" title="${esc('Ir a «' + nomSub + '»')}"`, estilo: pt ? `--chl:${pt[1]};--chd:${pt[2]}` : '' })
      : chipNombre(nomSub, estiloHijo(r.sub.id, 'gd-chip--sub').clase, { boton: true, estilo: estiloHijo(r.sub.id).estilo, attrs: ` data-gd-ruta="bib" title="${esc('La biblioteca «' + nomSub + '»')}"` });
    const nomSeg = e ? e.nombre : 'Bandeja';
    const chipSeg = chipNombre(nomSeg, 'gd-seg-chip' + (e ? '' : ' gd-seg-chip--bandeja'), { boton: true, estilo: e ? estiloTag(e) : '',
      attrs: ` data-gd-ruta="seg" title="${esc((e ? 'El segmento «' + nomSeg + '»' : 'La bandeja') + ', expandido')}"` });
    return `<span class="gd-modal-cont"></span>${chipSub}<span class="gd-ruta-sep" aria-hidden="true">›</span>${chipSeg}${fragmentoHtml(n)}`;   // y, si es un fragmento, su etiqueta (1.1.57)
  }
  /* lo que cambió por fuera con la ventana abierta (Claude, una versión, un personaje renombrado, un render cualquiera): la
     cabecera al día y, si el documento cambió y aquí no se ha tocado, el campo otra vez; la nota que ya no está, fuera */
  function refrescarVentana() {
    if (!ventanaAbierta()) return;
    const m = modelo(), nt = m && m.nota(ladoId);
    if (!nt || m.enPapelera(ladoId)) { cerrarLado(); return; }
    pintarCabeceraLado(m, nt);
    /* el nombre, también con el foco en él si Leo no lo ha cambiado (Claude lo renombró con la ventana de la app sin el foco: si no,
       al salir del campo se volvía a poner el de antes) */
    const tit = tituloLado(), nuevo = nt.titulo || '';
    if (document.activeElement !== tit) tit.value = tituloCargado = nuevo;
    else if (tit.value.trim() === tituloCargado && nuevo !== tituloCargado) {
      const todo = tit.selectionStart === 0 && tit.selectionEnd === tit.value.length;
      tit.value = tituloCargado = nuevo; if (todo) tit.select();
    }
    const campo = campoLado();
    pintarVersionLado();
    if ((nt.html || '') !== ladoCargado && campo.innerHTML === campo.dataset.base) {
      const hoja = hojaLado(), y = hoja.scrollTop, conFoco = document.activeElement === campo || campo.contains(document.activeElement);
      if (conFoco) apuntarLado();                              // el cursor, donde estaba (si no, lo siguiente iría al principio)
      pintarCampo(nt);
      if (conFoco) { const p = posLado.get(ladoId); if (!(p && reponerLado(p))) campo.focus({ preventScroll: true }); }
      hoja.scrollTop = y;
    }
  }
  /* dónde se dejó: el desplazamiento y, si el cursor estaba en el campo, su bloque y su carácter (como el editor, texto.js) */
  function apuntarLado() {
    if (!ladoId || !capa) return;
    const campo = campoLado(), p = { scroll: hojaLado().scrollTop };
    const s = getSelection(), r = s && s.rangeCount ? s.getRangeAt(0) : null;
    if (r && campo.contains(r.startContainer)) {
      if (r.startContainer === campo) { p.bloque = r.startOffset; p.car = 0; }
      else {
        let b = r.startContainer; while (b.parentNode !== campo) b = b.parentNode;
        const x = document.createRange(); x.setStart(b, 0); x.setEnd(r.startContainer, r.startOffset);
        p.bloque = Array.prototype.indexOf.call(campo.childNodes, b); p.car = x.toString().length;
      }
    }
    posLado.set(ladoId, p);
  }
  function reponerLado(p) {
    const campo = campoLado(); if (p.bloque === undefined || !campo.childNodes.length) return false;
    const b = campo.childNodes[Math.min(p.bloque, campo.childNodes.length - 1)];
    let destino = null;
    if (b.nodeType === 3) destino = [b, Math.min(p.car || 0, b.nodeValue.length)];
    else if (!b.matches('[data-f]')) {
      const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n, resto = p.car || 0;
      while ((n = tw.nextNode())) { if (resto <= n.nodeValue.length) { destino = [n, resto]; break; } resto -= n.nodeValue.length; }
      /* un bloque sin texto (el {{cursor}} de una plantilla que se queda solo en su párrafo): dentro de él, con su <br> para que se vea */
      if (!destino && !b.textContent && !b.matches('table')) { if (!b.querySelector('br, img')) { b.appendChild(document.createElement('br')); campo.dataset.base = campo.innerHTML; } destino = [b, 0]; }
    }
    campo.focus({ preventScroll: true });
    const r = document.createRange();
    if (destino) r.setStart(destino[0], destino[1]); else r.setStart(campo, Math.min(p.bloque, campo.childNodes.length));
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return true;
  }
  /* el cursor de una plantilla (`{ bloque, caracter }`: el hijo de primer nivel del documento y el carácter en su texto) en el
     campo, cuyos bloques son los del documento sin los textos en blanco sueltos (htmlDeLado) */
  let cursorTrasTitulo = null;                                 // { id, p }: adónde lleva Enter en el nombre
  function cursorDe(html, cur) {
    if (!cur || typeof cur.bloque !== 'number') return null;
    const t = document.createElement('template'); t.innerHTML = html || '';
    const nodos = t.content.childNodes; let k = 0;
    for (let i = 0; i < Math.min(cur.bloque, nodos.length); i++) { const n = nodos[i]; if (n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim())) k++; }
    return { bloque: k, car: cur.caracter || 0 };
  }
  /* la hoja de la ventana, hasta el cursor */
  function verCursor() {
    const s = getSelection(), n = s && s.rangeCount ? s.getRangeAt(0).startContainer : null;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  const ponerCursor = (nodo, i) => { const r = document.createRange(); r.setStart(nodo, i); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  function alPrincipioDelCampo() { const c = campoLado(); c.focus({ preventScroll: true }); ponerCursor(c.firstChild && c.firstChild.nodeType === 1 && !c.firstChild.matches('[data-f]') ? c.firstChild : c, 0); }
  /* un clic debajo de todo: el cursor al final (detrás de una tabla o de una marca, en un párrafo nuevo) */
  function alFinalDelCampo() {
    const c = campoLado(); if (!c) return;
    const ult = c.lastElementChild;
    if (!ult || ult.matches('table, pre, [data-f], div[data-rc]')) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); c.appendChild(p); }
    c.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(c.lastElementChild); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function cerrarLado() {
    guardarLadoYa(); apuntarLado();
    const habia = !!ladoId; ladoId = null;
    if (C.ventana) C.ventana.alCerrar();
    if (!navSigue) ordenNav = null;
    clearTimeout(ladoT); ladoT = null;
    if (capa) { if (capa.contains(document.activeElement)) document.activeElement.blur(); capa.hidden = true; }
    document.body.classList.remove('con-ventana');
    if (habia && o.alNavegar) setTimeout(() => o.alNavegar(), 0);
  }
  /* ---------- las versiones de la nota de la ventana (1.1.60) ----------
     Leo: «en las notas sería bueno que [lo que reemplaza la IA] se pusiera como nueva versión, aprovechando la funcionalidad;
     rescátala en el modal como lo haces ya en ClapBook». El botón «Versiones» del pie (ventana.js) abre el menú de siempre
     (js/claquedraw/versiones.js, el del editor): la lista con la que coincide con lo de ahora marcada «Actual», cargar una
     (pregunta si lo de ahora no está guardado como versión), el doble clic la renombra, su «×» la elimina, «Guardar versión…» pide
     el nombre y «Comparar con la actual…». El botón lleva el nombre de la versión que coincide con el texto. Las versiones son las de
     la nota (documentos.js), así que las «Antes de Claude» / «Antes de DeepSeek» que deja la IA al reemplazar están aquí. */
  const versionDeLado = n => (n && (n.versiones || []).find(v => v.html === n.html)) || null;
  function pintarVersionLado() {
    if (!C.ventana || !C.ventana.pintarVersion) return;
    const m = modelo(), nt = ladoId && m && m.nota(ladoId), v = versionDeLado(nt);
    C.ventana.pintarVersion(v ? v.nombre : null);
  }
  function menuVersionesLado(boton) {
    guardarLadoYa();
    const m = modelo(), n = ladoId && m && m.nota(ladoId); if (!n || !C.versiones) return;
    const id = n.id, avisarV = t => { if (o.avisar) o.avisar(t); };
    const tras = r => { if (!r.ok) { avisarV(r.aviso); return false; } if (o.guardar) o.guardar(); pintarVersionLado(); return true; };
    const actual = versionDeLado(n);
    C.versiones.menu(boton, { titulo: n.titulo, versiones: m.versionesDe(id), actual: actual ? actual.id : null, html: n.html }, {
      cargar: async vid => {
        cerrarPop();
        const v = m.version(id, vid); if (!v) return;
        if (!versionDeLado(n) && n.html !== v.html && !await o.confirmar('¿Cargar «' + v.nombre + '»? Lo que has escrito y no has guardado como versión se pierde.', 'Cargar')) return;
        if (!tras(m.cargarVersion(id, vid))) return;
        if (ladoId === id) {                                   // el campo, con la versión (arriba, con el cursor al principio)
          pintarCampo(n); hojaLado().scrollTop = 0;
          if (C.ventana) C.ventana.alAbrir();
          alPrincipioDelCampo();
        }
        const t = textoDe(n.html);
        $$(`.gd-exp-nota[data-nota="${CSS.escape(id)}"] .gd-exp-texto`).forEach(x => { x.textContent = t || 'Sin texto'; x.classList.toggle('vacio', !t); });
        avisarV('Versión «' + v.nombre + '» cargada');
      },
      guardar: async () => {
        cerrarPop();
        const r0 = await pedirNombre({ ceja: 'Versión de «' + n.titulo + '»', titulo: 'Guardar versión', pista: 'Por ejemplo, v1 o Primer borrador', boton: 'Guardar', valor: 'v' + (m.versionesDe(id).length + 1) });
        if (!r0) return;
        if (!r0.nombre.trim()) { avisarV('Escribe un nombre para la versión'); return; }
        const r = m.guardarVersion(id, r0.nombre);
        if (tras(r)) avisarV(r.aviso);
      },
      comparar: vid => {
        cerrarPop();
        const lista = m.versionesDe(id); if (!lista.length) return;
        const abrirC = v => C.versiones.abrirComparacion({ nombre: v.nombre, html: v.html }, { nombre: 'Ahora', html: n.html });
        if (vid) { const v = m.version(id, vid); if (v) abrirC(v); return; }
        if (lista.length === 1) { abrirC(lista[0]); return; }
        menuLista(boton, 'Comparar con la actual…', lista.slice().reverse().map(v => ({ id: v.id, nombre: v.nombre })), x => abrirC(m.version(id, x)));
      },
      renombrar: async vid => {
        cerrarPop();
        const v = m.version(id, vid); if (!v) return;
        const r0 = await pedirNombre({ ceja: 'Versión de «' + n.titulo + '»', titulo: 'Renombrar la versión', boton: 'Renombrar', valor: v.nombre });
        if (!r0 || !r0.nombre.trim()) return;
        tras(m.renombrarVersion(id, vid, r0.nombre));
      },
      eliminar: async vid => {
        const v = m.version(id, vid); if (!v) return;
        cerrarPop();
        if (!await o.confirmar('¿Eliminar la versión «' + v.nombre + '»? La nota de ahora no se toca.', 'Eliminar')) return;
        const r = m.eliminarVersion(id, vid);
        if (tras(r)) avisarV(r.aviso);
      }
    });
  }
  /* lo escrito en la ventana, a la nota (y a su tarjeta, sin redibujar la biblioteca) */
  function guardarLadoYa() {
    clearTimeout(ladoT); ladoT = null;
    const m = modelo(), nt = ladoId && m && m.nota(ladoId), campo = campoLado(); if (!nt || !campo) return;
    if (campo.innerHTML === campo.dataset.base) return;            // sin tocar: el documento no se reescribe
    const r = m.guardarNota(nt.id, { title: nt.titulo, html: esPlano(campo) ? htmlPlano(lineasDe(campo)) : htmlDeLadoEditado(campo), characters: nt.characters || {} });
    campo.dataset.base = campo.innerHTML; ladoCargado = nt.html || '';
    if (r.ok && r.cambio && o.guardar) o.guardar();
    pintarVersionLado();
    if (capa) $('[data-gd-nav-lado]', capa).innerHTML = navHtml(m, nt);   // (el orden va congelado: no salta)
    const t = textoDe(nt.html);
    $$(`.gd-exp-nota[data-nota="${CSS.escape(nt.id)}"] .gd-exp-texto`).forEach(x => { x.textContent = t || 'Sin texto'; x.classList.toggle('vacio', !t); });
    $$(`.gd-nota[data-nota="${CSS.escape(nt.id)}"] .gd-nota-meta, .gd-exp-nota[data-nota="${CSS.escape(nt.id)}"] .gd-nota-meta`).forEach(x => { if (!/^creada/.test(x.textContent)) x.textContent = fecha(nt.modificado); });
  }
  function pintarTituloTarjetas(nt) {
    $$(`.gd-exp-nota[data-nota="${CSS.escape(nt.id)}"] .gd-exp-tit, .gd-nota[data-nota="${CSS.escape(nt.id)}"] > span:first-child`).forEach(x => { x.textContent = nt.titulo; });
    $$(`.gd-nota[data-nota="${CSS.escape(nt.id)}"], .gd-exp-nota[data-nota="${CSS.escape(nt.id)}"]`).forEach(x => x.setAttribute('aria-label', nt.titulo));
  }
  function aplicarTituloLado() {
    const m = modelo(), nt = ladoId && m && m.nota(ladoId), tit = tituloLado(); if (!nt || !tit) return;
    const v = tit.value.trim();
    if (!v || v === nt.titulo || v === tituloCargado) { tit.value = tituloCargado = nt.titulo; return; }   // lo que no escribió Leo no renombra
    const r = m.renombrarNota(nt.id, v);
    if (!r.ok) { if (o.avisar) o.avisar(r.aviso); tit.value = tituloCargado = nt.titulo; return; }
    tit.value = tituloCargado = nt.titulo;
    if (o.guardar) o.guardar();
    pintarTituloTarjetas(nt);
  }
  /* ‹ ›: las notas del segmento de una nota en el orden en que se ven (con sus filtros, lo que se esté buscando en esa vista y, si
     sus tarjetas están pintadas, su orden); si ella no está entre las que se ven, todas. **El orden se congela mientras se va de
     una a otra** (`ordenNav`): con «Modificadas recientemente», escribir en una la subía y › volvía a la de antes. Se olvida al
     cerrar la ventana o el editor (no al pasar de una al otro) y cambia solo si cambian el filtro, el orden o lo que se busca. */
  let ordenNav = null, navSigue = false;                       // { clave, ids }; navSigue: de la ventana al editor o al revés
  function ordenVisto(n, k) {                                  // las tarjetas de ese segmento, tal como se ven
    if (notaAbierta || !main) return null;
    const enExp = !!expandido && expandido.subId === n.subId && expandido.clave === k;
    const caja = enExp ? $('.gd-exp-grid', main) : $(`.gd-tablero[data-sub="${CSS.escape(n.subId)}"] > [data-clave="${CSS.escape(k)}"] > .gd-etq-body`, main);
    return caja ? $$(':scope > [data-nota]', caja).map(x => x.dataset.nota) : null;
  }
  function vecinasDe(m, n) {
    const k = n.etiquetaId ? 'etq:' + n.etiquetaId : 'bandeja', todas = m.notasDe(n.subId, n.etiquetaId || null);
    const enExp = !!expandido && expandido.subId === n.subId && expandido.clave === k;
    const f = m.esGuiones(n.subId) ? null : filtroPara(n.subId, k, enExp), c = busquedaEn(n.subId);
    let xs = f ? filtrarNotas(todas, f) : todas;
    if (c) xs = xs.filter(x => C.busqueda.puntuar(x, c) > 0);
    const clave = n.subId + '|' + k + '|' + (f ? f.color + '|' + f.orden : '') + '|' + (c ? busquedaVista.texto.trim() : '');
    const previo = ordenNav && ordenNav.clave === clave && ordenNav.ids.includes(n.id) ? ordenNav.ids : ordenVisto(n, k);
    if (previo) { const pos = new Map(previo.map((id, i) => [id, i])), en = x => (pos.has(x.id) ? pos.get(x.id) : 1e9); xs = xs.slice().sort((a, b) => en(a) - en(b)); }   // lo nuevo, al final
    if (!xs.some(x => x.id === n.id)) return todas;
    ordenNav = { clave, ids: xs.map(x => x.id) };
    return xs;
  }
  /* ‹ 2/5 ›; en la última, «＋» en lugar de ›: otra nota en el mismo segmento */
  function navHtml(m, n) {
    const xs = vecinasDe(m, n), i = xs.findIndex(x => x.id === n.id);
    if (i < 0) return '';
    const ultima = i >= xs.length - 1;
    return `<span class="gd-nav-notas" role="group" aria-label="Las notas del segmento"><button type="button" class="icono" data-gd-nota-mover="-1" ${i > 0 ? '' : 'disabled'} title="Nota anterior del segmento" aria-label="Nota anterior">${ic('arr-l', 14)}</button>`
      + `<span class="gd-nav-pos">${i + 1}/${xs.length}</span>`
      + (ultima ? `<button type="button" class="icono gd-nav-nueva" data-gd-nota-nueva title="Otra nota en este segmento" aria-label="Otra nota en este segmento">${ic('plus', 14)}</button>`
        : `<button type="button" class="icono" data-gd-nota-mover="1" title="Nota siguiente del segmento" aria-label="Nota siguiente">${ic('arr-r', 14)}</button>`) + '</span>';
  }
  /* marca una nota como elegida en las tarjetas (y, con `llevar`, la trae a la vista) */
  function marcarElegida(id, llevar) {
    $$('[data-nota].sel').forEach(x => x.classList.remove('sel'));
    $$(`[data-nota="${CSS.escape(id)}"]`).forEach(x => { x.classList.add('sel'); if (llevar && !x.classList.contains('gd-nota-fila')) x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  }
  function moverLado(delta) {
    const m = modelo(), n = ladoId && m && m.nota(ladoId); if (!n) return;
    const xs = vecinasDe(m, n), sig = xs[xs.findIndex(x => x.id === n.id) + delta]; if (!sig) return;
    notaSel = sig.id; marcarElegida(sig.id, true);
    mostrarLado(sig.id);
  }
  /* ⤢ (o el doble clic en la tarjeta): la nota, en el editor */
  function expandirLado() { const id = ladoId; if (!id || esFormula(id)) return; navSigue = true; try { cerrarLado(); abrirNota(id); } finally { navSigue = false; } }
  /* la ruta de la ventana: «bib», su biblioteca; «seg», su segmento expandido (con la nota marcada) */
  function irARuta(id, k) {
    const m = modelo(), n = m && m.nota(id), r = n && m.sub(n.subId); if (!r) return;
    cerrarLado();
    if (k === 'seg') { expandir(n.subId, n.etiquetaId ? 'etq:' + n.etiquetaId : 'bandeja', n.id); return; }
    expandido = null; notaSel = n.id;
    navegar(ref('sub', r.contenedor.id, n.subId));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* «Contraer» en la cabecera del editor: la nota vuelve a su ventana, encima de su biblioteca (o de su segmento expandido) */
  function contraerNota() {
    const id = notaAbierta; if (!id) return;
    if (o.texto.volcar) o.texto.volcar();
    navSigue = true; try { cerrarNota(); } finally { navSigue = false; }
    notaSel = id; marcarElegida(id, true);
    mostrarLado(id);
  }
  /* Cmd+clic en un enlace del documento: los de ClapCraft, a su sitio; los demás, al navegador */
  function abrirDireccion(u) {
    const s = String(u || '').trim(); if (!s) return;
    let url; try { url = new URL(s, location.href); } catch (_) { return; }   // como la leerá el navegador (sin tabuladores ni saltos)
    if (url.protocol === 'clapcraft:') { if (o.irAEnlace) { cerrarLado(); o.irAEnlace(s); } return; }
    if (!/^(https?|mailto):$/.test(url.protocol)) return;       // solo la web y el correo: nunca javascript:, data:, file:…
    window.open(url.href, '_blank', 'noopener');
  }

  /* ---------- el formato en la ventana de una nota (1.1.54, de ClapBook) ----------
     Leo, en ClapBook: «Cuando seleccione un texto y le haga clic derecho, debo tener opciones de subrayado… varios colores». Aquí el
     campo es el documento del editor, así que el clic derecho da lo de su cinta, con el mismo HTML: negrita, cursiva, subrayado,
     tachado, código y enlace; resaltar y color de letra con los 16 tonos de su paleta en el par del tema (`colores(i)`, como la
     cinta), quitar el formato, cortar, copiar, pegar y el enlace para Claude. Los atajos del editor (Cmd+Mayús+X, Cmd+Mayús+H con
     el último resaltado, Cmd+K, Cmd+Alt+0…6) y Cmd+E (código) los pone MdVivo. El subrayado de colores de ClapBook no se porta: en
     el editor el resaltado ya es el «marcador» y el subrayado va en el color del texto. */
  const MAC = /Mac|iP(hone|ad)/.test(navigator.platform || '');
  const tecla = k => MAC ? k.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : k.replace(/Mod\+/g, 'Ctrl+').replace(/Shift\+/g, 'Mayús+');
  const HILITE = 'guiones.editor.hilite';                      // el último resaltado de la cinta del editor: el mismo aquí
  function colorResaltado() {
    let c = null; try { c = localStorage.getItem(HILITE); } catch (_) {}
    const k = String(c || '').toUpperCase(), i = PAL.findIndex(t => String(t[1]).toUpperCase() === k || String(t[2]).toUpperCase() === k);
    if (i >= 0) return colores(i)[0];                          // un tono de la paleta, en el par del tema de ahora
    if (!c || k === '#FBF0D2' || k === '#7A5410') return oscuro() ? '#7A5410' : '#FBF0D2';   // el de partida del editor
    return c;
  }
  const recordarResaltado = c => { try { localStorage.setItem(HILITE, c); } catch (_) {} };
  /* tras cerrar un menú con Esc, el foco vuelve a quien lo abrió; si se abrió sobre el campo de la ventana, al campo con lo elegido */
  function devolverFoco(t) { if (t && t._volver) { const v = t._volver; t._volver = null; v(); } else if (t && t.focus) t.focus(); }
  /* un punto fijo donde se abre un menú (el del ratón) */
  let anclaF = null;
  function anclaEn(x, y) {
    if (!anclaF) { anclaF = document.createElement('div'); anclaF.className = 'gd-ancla'; anclaF.setAttribute('aria-hidden', 'true'); document.body.appendChild(anclaF); }
    Object.assign(anclaF.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: '1px', height: '1px', pointerEvents: 'none' });
    return anclaF;
  }
  /* lo elegido en el campo (un rango dentro de él), para devolverlo tras el menú, que se lleva el foco */
  function rangoEn(campo) { const s = getSelection(); if (!s || !s.rangeCount) return null; const r = s.getRangeAt(0); return campo.contains(r.commonAncestorContainer) ? r.cloneRange() : null; }
  function volverA(campo, r0) { campo.focus({ preventScroll: true }); if (r0) { const s = getSelection(); s.removeAllRanges(); s.addRange(r0); } }
  function menuFormato(e, campo) {
    if (esPlano(campo)) { menuTextoPlano(e, campo); return; }
    if (!window.MdVivo || !MdVivo.formato || e.target.closest('.gd-lado-fijo')) return;
    e.preventDefault();
    const r0 = rangoEn(campo), hay = !!r0 && !r0.collapsed;
    const estado = k => { try { return document.queryCommandState(k); } catch (_) { return false; } };
    const nodo = r0 && (r0.startContainer.nodeType === 1 ? r0.startContainer : r0.startContainer.parentElement);
    const enCodigo = !!(nodo && nodo.closest('code') && campo.contains(nodo.closest('code')));
    const a = MdVivo.enlaceEn ? MdVivo.enlaceEn(campo) : null;
    const aplicar = (accion, valor) => () => { volverA(campo, r0); MdVivo.formato(campo, accion, valor, { bloques: sinGuion }); };
    const f = document.createDocumentFragment();
    /* dentro de un prompt o un aviso: lo suyo, arriba (1.1.57) */
    const rcAqui = recuadroEn(e.target, campo);
    if (rcAqui) {
      const esPrompt = rcAqui.getAttribute('data-rc') === 'prompt', R = RCX();
      f.appendChild(titulo(esPrompt ? 'Prompt' : 'Aviso · ' + (R ? R.TIPOS.find(t => t[0] === R.tipo(rcAqui.getAttribute('data-tipo')))[1] : '')));
      if (esPrompt) f.appendChild(opcion('Copiar el texto del prompt', () => copiarPrompt(rcAqui)));
      const x = e.clientX, y = e.clientY;
      f.appendChild(opcion('Título, tipo y color…', () => setTimeout(() => menuRecuadroLado(rcAqui, campo, x, y), 0)));
      f.appendChild(opcion('Quitar el recuadro', () => quitarRecuadroLado(rcAqui, campo)));
      f.appendChild(separador());
    }
    if (hay) {
      const barra = document.createElement('div'); barra.className = 'gd-fmt-barra';
      [['negrita', '<b>B</b>', 'Negrita', 'Mod+B', estado('bold')], ['cursiva', '<i>I</i>', 'Cursiva', 'Mod+I', estado('italic')],
       ['subrayado', '<u>U</u>', 'Subrayado', 'Mod+U', estado('underline')], ['tachado', '<s>S</s>', 'Tachado', 'Mod+Shift+X', estado('strikeThrough')],
       ['codigo', '<code>&lt;/&gt;</code>', 'Código', 'Mod+E', enCodigo]].forEach(([acc, html, nombre, k, on]) => {
        const b = document.createElement('button'); b.type = 'button'; b.innerHTML = html; b.title = nombre + ' (' + tecla(k) + ')'; b.setAttribute('aria-label', nombre);
        if (on) b.classList.add('activo');
        b.addEventListener('click', () => { cerrarPop(); aplicar(acc)(); });
        barra.appendChild(b);
      });
      const ln = document.createElement('button'); ln.type = 'button'; ln.innerHTML = ic('link', 14); ln.title = 'Enlace… (' + tecla('Mod+K') + ')'; ln.setAttribute('aria-label', 'Enlace');
      if (a) ln.classList.add('activo');
      ln.addEventListener('click', () => { cerrarPop(); volverA(campo, r0); cuadroEnlace(campo); });
      barra.appendChild(ln);
      f.appendChild(barra);
      const tonos = (rot, fondo) => {
        f.appendChild(titulo(rot));
        const grid = document.createElement('div'); grid.className = 'gd-fmt-tonos';
        PAL.forEach((t, i) => {
          const b = document.createElement('button'); b.type = 'button'; b.title = t[0]; b.setAttribute('aria-label', t[0]);
          if (fondo) b.style.background = colores(i)[0]; else { b.textContent = 'A'; b.style.color = colores(i)[1]; b.classList.add('letra'); }
          b.addEventListener('click', () => { cerrarPop(); if (fondo) recordarResaltado(colores(i)[0]); aplicar(fondo ? 'resaltar' : 'letra', colores(i)[fondo ? 0 : 1])(); });
          grid.appendChild(b);
        });
        f.appendChild(grid);
        f.appendChild(opcion(fondo ? 'Quitar el resaltado' : 'Automático', aplicar(fondo ? 'resaltar' : 'letra', null)));
      };
      tonos('Resaltar', true);
      tonos('Color de letra', false);
    }
    if (a) {
      const u = a.getAttribute('href') || '';
      if (hay) f.appendChild(separador());
      f.appendChild(opcion('Abrir el enlace', () => { volverA(campo, r0); abrirDireccion(u); }, { atajo: tecla('Mod+') + 'clic' }));
      f.appendChild(opcion('Editar el enlace…', () => { volverA(campo, r0); cuadroEnlace(campo); }));
      f.appendChild(opcion('Quitar el enlace', aplicar('enlace', null)));
      f.appendChild(opcion('Copiar la dirección', () => { volverA(campo, r0); copiarTexto(u); }));
    } else if (!hay) f.appendChild(opcion('Enlace…', () => { volverA(campo, r0); cuadroEnlace(campo); }, { atajo: tecla('Mod+K') }));
    if (hay) f.appendChild(opcion('Quitar el formato', aplicar('quitar')));
    f.appendChild(separador());
    if (hay) {
      f.appendChild(opcion('Cortar', () => { volverA(campo, r0); document.execCommand('cut'); }, { atajo: tecla('Mod+X') }));
      f.appendChild(opcion('Copiar', () => { volverA(campo, r0); document.execCommand('copy'); }, { atajo: tecla('Mod+C') }));
    }
    f.appendChild(opcion('Pegar', async () => {
      let t = '';
      try { t = window.editorAPI && window.editorAPI.leerPortapapeles ? await window.editorAPI.leerPortapapeles() : await navigator.clipboard.readText(); } catch (_) {}
      if (!t) { if (o.avisar) o.avisar('No se pudo leer el portapapeles: pega con ' + tecla('Mod+V')); return; }
      volverA(campo, r0);
      if (MdVivo.pegar) MdVivo.pegar(campo, t, { markdown: true, bloques: sinGuion }); else document.execCommand('insertText', false, t);
    }, { atajo: tecla('Mod+V') }));
    /* una plantilla de nota, donde está el cursor (1.1.56; en ClapBook también se inserta en la ventana) */
    if (ladoId && C.plantillas && C.plantillas.rellenarHtml) { f.appendChild(separador()); f.appendChild(opcion('Insertar plantilla…', () => insertarPlantillaEnVentana(null, r0))); }
    /* lo elegido, al asistente, con el enlace de su tramo (1.1.60, js/claquedraw/ventana.js) */
    if (C.ventana && C.ventana.puedeCitar(r0)) { f.appendChild(separador()); f.appendChild(opcion('Citar en el asistente', () => { volverA(campo, r0); C.ventana.citar(r0); }, { atajo: tecla('Mod+Shift+A') })); }
    if (o.copiarEnlace && ladoId) { f.appendChild(separador()); const id = ladoId; f.appendChild(opcion('Copiar enlace para Claude', () => { volverA(campo, r0); o.copiarEnlace({ tipo: 'nota', id }); }, { atajo: tecla('Mod+Shift+C') })); }
    cerrarPop();
    const ancla = anclaEn(e.clientX, e.clientY); ancla._volver = () => volverA(campo, r0);   // Esc: el foco y lo elegido, al campo
    abrirPop(ancla, f);
  }
  /* el clic derecho en el campo de una fórmula (1.1.60): sin formato; cortar, copiar, pegar (como texto) y el enlace para Claude */
  function menuTextoPlano(e, campo) {
    e.preventDefault();
    const r0 = rangoEn(campo), hay = !!r0 && !r0.collapsed, f = document.createDocumentFragment();
    if (hay) {
      f.appendChild(opcion('Cortar', () => { volverA(campo, r0); document.execCommand('cut'); }, { atajo: tecla('Mod+X') }));
      f.appendChild(opcion('Copiar', () => { volverA(campo, r0); document.execCommand('copy'); }, { atajo: tecla('Mod+C') }));
    }
    f.appendChild(opcion('Pegar', async () => {
      let t = '';
      try { t = window.editorAPI && window.editorAPI.leerPortapapeles ? await window.editorAPI.leerPortapapeles() : await navigator.clipboard.readText(); } catch (_) {}
      if (!t) { if (o.avisar) o.avisar('No se pudo leer el portapapeles: pega con ' + tecla('Mod+V')); return; }
      volverA(campo, r0); document.execCommand('insertText', false, String(t).replace(/\r\n?/g, '\n'));
    }, { atajo: tecla('Mod+V') }));
    /* lo elegido, al asistente, con el enlace de su tramo (1.1.60, js/claquedraw/ventana.js) */
    if (C.ventana && C.ventana.puedeCitar(r0)) { f.appendChild(separador()); f.appendChild(opcion('Citar en el asistente', () => { volverA(campo, r0); C.ventana.citar(r0); }, { atajo: tecla('Mod+Shift+A') })); }
    if (o.copiarEnlace && ladoId) { f.appendChild(separador()); const id = ladoId; f.appendChild(opcion('Copiar enlace para Claude', () => { volverA(campo, r0); o.copiarEnlace({ tipo: 'nota', id }); }, { atajo: tecla('Mod+Shift+C') })); }
    cerrarPop();
    const ancla = anclaEn(e.clientX, e.clientY); ancla._volver = () => volverA(campo, r0);
    abrirPop(ancla, f);
  }
  /* ---------- insertar una plantilla en la ventana de una nota (1.1.56) ----------
     Archivo › Insertar plantilla… (app.js) o «Insertar plantilla…» del clic derecho del campo, con una nota en su ventana (en
     ClapBook también se inserta en el editor del panel). Como `insertarHtml` de texto.js, pero en el campo: la plantilla, ya
     rellena y con la marca de {{cursor}}, se pinta como el campo pinta el documento (`vistaLado`, que apunta sus bloques detrás
     de los que había: un elemento de guion que no se toque vuelve al documento tal cual, con su clase y su chip; lo que no es
     texto va como su marca) y entra con **un solo `insertHTML`** (un paso de Deshacer; `.md-fusion` evita los spans de estilo
     de Chrome). Dónde, según el bloque del cursor: vacío, la plantilla lo sustituye; una plantilla de un solo párrafo sin clase,
     su texto en el cursor; si no, detrás del bloque (se elige su contenido y se escribe él tal cual más la plantilla) o, si no es
     un párrafo, delante del siguiente. Luego el cursor va a la marca, sus personajes pasan al registro de la nota y se guarda
     como guarda la ventana (`guardarLadoYa`). Sin `pid`, se elige antes (el menú se lleva el foco: `r0` es lo elegido en el campo). */
  const MARCA_CURSOR = '<span data-cursor-plantilla></span>';
  function insertarPlantillaEnVentana(pid, r0) {
    if (!ventanaAbierta() || !C.plantillas || !C.plantillas.rellenarHtml) return false;
    if (esFormula(ladoId)) { if (o.avisar) o.avisar('Una fórmula es solo texto: en ella no se insertan plantillas'); return false; }
    const m = modelo(), id = ladoId, nt = m && m.nota(id), campo = campoLado(); if (!nt || !campo) return false;
    const elegido = r0 !== undefined ? r0 : rangoEn(campo);
    if (!pid) {
      let rr = elegido && elegido.getBoundingClientRect();
      if (!rr || !(rr.width || rr.height)) {                   // un cursor en un renglón vacío no mide: su bloque
        let b = elegido && elegido.startContainer; while (b && b.parentNode !== campo && b !== campo) b = b.parentNode;
        rr = (b && b !== campo && b.nodeType === 1 ? b : campo).getBoundingClientRect();
      }
      const ancla = anclaEn(rr.left, rr.bottom); ancla._volver = () => volverA(campo, elegido);   // Esc: vuelve al campo
      elegirPlantilla('Insertar plantilla', x => {
        if (ladoId !== id || !ventanaAbierta()) { if (o.avisar) o.avisar('La ventana de esa nota ya se cerró'); return; }
        insertarPlantillaEnVentana(x, elegido);
      }, ancla);
      return true;
    }
    const p = m.nota(pid);
    if (!p || !esPlantilla(p)) { if (o.avisar) o.avisar('Esa plantilla ya no existe'); return false; }
    const x = C.plantillas.rellenarHtml(p.html || '', { titulo: nt.titulo, proyecto: o.nombreProyecto ? o.nombreProyecto() : '', marca: MARCA_CURSOR });
    const vista = vistaLado(x.html, '[data-cursor-plantilla]');
    if (!vista.replace(/<span data-cursor-plantilla=""><\/span>/g, '').replace(/<p[^>]*>(?:\s|<br\s*\/?>)*<\/p>/gi, '').trim()) { volverA(campo, elegido); if (o.avisar) o.avisar('La plantilla «' + (p.titulo || 'Sin título') + '» está vacía'); return false; }
    volverA(campo, elegido && campo.contains(elegido.startContainer) ? elegido : null);
    const elegir = (a, ao, b, bo) => { const y = document.createRange(); y.setStart(a, ao); y.setEnd(b, bo); const s = getSelection(); s.removeAllRanges(); s.addRange(y); };
    const topeDe = n => { while (n && n.parentNode !== campo) n = n.parentNode; return n; };
    let r = rangoEn(campo);
    if (!r) { alFinalDelCampo(); r = rangoEn(campo); } if (!r) return false;
    let t = r.startContainer === campo ? campo.childNodes[Math.max(0, r.startOffset - (r.startOffset >= campo.childNodes.length ? 1 : 0))] || null : topeDe(r.startContainer);
    const simple = el => !!el && el.nodeType === 1 && /^(P|H[1-6]|PRE|BLOCKQUOTE)$/.test(el.tagName) && !el.hasAttribute('data-f')
      && !el.querySelector('img, table, hr, [contenteditable="false"], [data-f]');
    const vacio = el => !el.textContent.replace(/[\u200B\s]/g, '');
    /* una plantilla que es un solo párrafo sin clase: va en el texto, donde está el cursor */
    const tpl = document.createElement('template'); tpl.innerHTML = vista;
    const hijos = [...tpl.content.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim());
    const solo = hijos.length === 1 && hijos[0].nodeType === 1 && hijos[0].tagName === 'P' && [...hijos[0].attributes].every(a => a.name === 'data-l') ? hijos[0] : null;
    const enLinea = solo ? solo.innerHTML
      : hijos.every(n => n.nodeType === 3 || (!/^(P|H[1-6]|PRE|BLOCKQUOTE|UL|OL|LI|TABLE|DIV|HR)$/.test(n.tagName) && !n.hasAttribute('data-f'))) ? vista : null;
    let poner = vista;
    if (simple(t) && vacio(t)) { elegir(t, 0, t, 0); poner = enLinea !== null ? enLinea : vista; }
    else if (enLinea !== null && r.collapsed && t && t.nodeType === 1 && !t.hasAttribute('data-f')) poner = enLinea;
    else if (simple(t)) { elegir(t, 0, t, t.childNodes.length); poner = t.outerHTML + vista; }
    else if (t && simple(t.nextElementSibling)) { const n = t.nextElementSibling; elegir(n, 0, n, n.childNodes.length); poner = vista + n.outerHTML; }
    else {                                                     // detrás de una tabla, una marca o lo último: en un párrafo nuevo
      const pv = document.createElement('p'); pv.appendChild(document.createElement('br'));
      if (t && t.parentNode === campo) t.after(pv); else campo.appendChild(pv);
      elegir(pv, 0, pv, 0); poner = enLinea !== null ? enLinea : vista;
    }
    campo.classList.add('md-fusion');
    try { document.execCommand('insertHTML', false, poner); } finally { campo.classList.remove('md-fusion'); }
    const mk = campo.querySelector('[data-cursor-plantilla]');
    if (mk) {
      const padre = mk.parentNode, i = [...padre.childNodes].indexOf(mk);
      mk.remove();
      if (!padre.childNodes.length && padre !== campo) { padre.appendChild(document.createElement('br')); ponerCursor(padre, 0); }
      else ponerCursor(padre, i);
    }
    campo.querySelectorAll('[data-cursor-plantilla]').forEach(y => y.remove());   // por si Chrome la hubiera partido
    /* sus personajes, al registro de la nota (los que ya tenía mandan) */
    const reg = nt.characters || (nt.characters = {});
    Object.keys(p.characters || {}).forEach(k => { if (!reg[k]) reg[k] = Object.assign({}, p.characters[k]); });
    guardarLadoYa();
    verCursor();
    if (o.avisar) o.avisar('Plantilla «' + (p.titulo || 'Sin título') + '» insertada');
    return true;
  }
  function copiarTexto(t) {
    const hecho = () => { if (o.avisar) o.avisar('Dirección copiada'); };
    if (window.editorAPI && window.editorAPI.copiarTexto) window.editorAPI.copiarTexto(t).then(hecho, () => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(hecho, () => {});
  }
  /* el cuadro de un enlace (Cmd+K, o el menú): el texto y la dirección; si ya lo había, «Guardar» y «Quitar el enlace» */
  function cuadroEnlace(campo) {
    if (!window.MdVivo || !MdVivo.formato) return;
    const r0 = rangoEn(campo), a = MdVivo.enlaceEn ? MdVivo.enlaceEn(campo) : null;
    let url = a ? a.getAttribute('href') || '' : '', txt = a ? a.textContent.replace(/\u200B/g, '') : (r0 ? r0.toString() : '');
    if (!a && MdVivo.esUrl && MdVivo.esUrl(txt.trim())) { url = txt.trim(); txt = ''; }   // lo elegido ya es una dirección
    const form = document.createElement('form'); form.className = 'gd-enlace-cuadro';
    form.innerHTML = `<div class="gd-pop-tit">${a ? 'Editar el enlace' : 'Enlace'}</div>
      <label><span>Texto</span><input type="text" name="texto" spellcheck="false" autocomplete="off"></label>
      <label><span>Dirección</span><input type="text" name="url" spellcheck="false" autocomplete="off" placeholder="https://… o clapcraft://…"></label>
      <div class="gd-enlace-pie">${a ? '<button type="button" class="gd-enlace-quitar" data-quitar>Quitar el enlace</button>' : ''}<span class="spacer"></span><button type="submit" class="gd-enlace-ok">${a ? 'Guardar' : 'Añadir'}</button></div>`;
    const campos = form.elements; campos.texto.value = txt; campos.url.value = url;
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const u = campos.url.value.trim(); cerrarPop(); volverA(campo, r0);
      if (u) MdVivo.formato(campo, 'enlace', { url: u, texto: campos.texto.value });
    });
    form.addEventListener('click', ev => { if (ev.target.closest('[data-quitar]')) { cerrarPop(); volverA(campo, r0); MdVivo.formato(campo, 'enlace', null); } });
    const rr = r0 && r0.getBoundingClientRect(), base = rr && (rr.width || rr.height) ? rr : (a || campo).getBoundingClientRect();
    cerrarPop();
    const ancla = anclaEn(base.left, base.bottom); ancla._volver = () => volverA(campo, r0);
    abrirPop(ancla, form);
    setTimeout(() => { const i = campos.url.value ? campos.texto : campos.url; i.focus(); i.select(); }, 0);
  }
  /* Expandir un segmento (con `sel`, la nota que queda marcada). En Personajes se abre en su pantalla. */
  function expandir(subId, claveSeg, sel) {
    const m = modelo(), r = m && m.sub(subId); if (!r || !datosSegmento(m, subId, claveSeg)) return;
    if (sel !== undefined) notaSel = sel;
    expandido = { subId, clave: claveSeg };
    navegar(ref('sub', r.contenedor.id, subId));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero(true);
  }
  function contraer() {
    if (ladoId) cerrarLado();
    if (!expandido) return;
    expandido = null;
    render();
    if (o.alNavegar) o.alNavegar();                                // la pestaña vuelve a ser la de la biblioteca (de ClapBook)
    const v = main.querySelector('.gd-etq-body [data-nota].sel, .gd-etq-body [data-nodo].sel');
    if (v) v.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /* ---------- buscar, filtrar y ordenar (1.1.54, de ClapBook) ----------
     Leo, en ClapBook: «En las bibliotecas, se necesita unos filtros y ordenamientos generales (como los que se tienen en los
     segmentos expandidos) para que se ordenen y filtren el contenido de los segmentos contraídos, los filtros se deben guardar
     entre sesiones. El filtro general es más fuerte que el filtro por segmento en las bibliotecas, pero en los segmentos
     expandidos es más fuerte el filtro del segmento. Cuando digo filtro, también incluyo el ordenamiento», y un buscador en las
     bibliotecas. En ClapCraft no hay etiquetas: se filtra por **el color de la nota** (los 24 tonos, o «Sin color»), que es lo
     que Leo les pone a mano. Cada biblioteca tiene su filtro general (en su cabecera: manda sobre las tarjetas) y cada segmento el
     suyo (en su vista expandida: ahí manda él, y lo que no pone lo pone el general, en cursiva); las reglas son
     `C.busqueda.efectivo` (js/claquedraw/busqueda.js, probado en Node). En un segmento, «Todas las notas» (`color: ''`) y «Orden
     manual» se guardan para mandar sobre el general. Se recuerdan en la vista de esta máquina (`vista.filtros`: 'bib:<biblioteca>'
     y 'seg:<biblioteca>|<segmento>'; app.js los mezcla clave a clave con lo que guardan las otras ventanas). Con un orden que no
     es el manual, las notas no se ordenan arrastrando (el cuerpo lleva `.ordenada`). Lo que se busca esconde las notas que no
     casan, sin redibujar, mientras se sigue en esa vista. */
  const claveFiltroBib = subId => 'bib:' + subId;
  const claveFiltroSeg = (subId, k) => 'seg:' + subId + '|' + k;
  const filtroDe = k => (o.filtro ? o.filtro(k) : ((o.vista && o.vista.filtros) || {})[k]) || {};
  function ponerFiltro(k, cambios) {
    const f = Object.assign({}, filtroDe(k));
    Object.keys(cambios).forEach(c => { if (cambios[c] === undefined) delete f[c]; else f[c] = cambios[c]; });
    const v = Object.keys(f).length ? f : null;
    if (o.ponerFiltro) o.ponerFiltro(k, v);
    else if (o.vista) { const fs = o.vista.filtros = o.vista.filtros || {}; if (v) fs[k] = v; else delete fs[k]; guardarVista(); }
    render();
  }
  /* el filtro que se aplica a un segmento (`k`: 'bandeja' o 'etq:<id>'): { color, orden, heredado, propio } */
  const filtroPara = (subId, k, enExpandido) => C.busqueda.efectivo(filtroDe(claveFiltroBib(subId)), k ? filtroDe(claveFiltroSeg(subId, k)) : {}, !!enExpandido);
  const filtrarNotas = (notas, f) => C.busqueda.filtrar(notas, f, C.TONOS_NOTA);
  const rotuloOrden = k => (C.busqueda.ORDENES_SEG.find(x => x[0] === k) || [k, k])[1];
  const fechaSegun = (n, orden) => C.busqueda.fechaSegun(n, orden, fecha);
  const nombreColor = t => t === 'sin' ? 'Sin color' : ((window.Tramas && Tramas.PALETA && Tramas.PALETA.find(p => p.id === t)) || {}).label || (t.charAt(0).toUpperCase() + t.slice(1));
  /* el botón de un filtro de color: el punto del tono (o «Color»), encendido si hay filtro y en cursiva si viene de la biblioteca */
  function botonColor(menu, color, heredado, pista) {
    const punto = color ? `<i class="gd-filtro-punto${color === 'sin' ? ' sin' : ''}"${color !== 'sin' ? ` style="background: var(--t-${esc(color)})"` : ''}></i>` : ic('filter', 14);
    return `<button type="button" class="gd-filtro${color ? ' on' : ''}${heredado ? ' heredado' : ''}" data-gd-menu="${menu}" title="${esc(pista)}">${punto}<span>${esc(color ? nombreColor(color) : 'Color')}</span>${ic('chev-d', 12)}</button>`;
  }
  /* el menú de colores de unas notas (con cuántas lo llevan); `heredar`: «Como la biblioteca» en un segmento */
  function menuColores(rot, notas, actualC, poner, heredar) {
    const cuenta = new Map(); let sin = 0;
    notas.forEach(n => { if (n.color) cuenta.set(n.color, (cuenta.get(n.color) || 0) + 1); else sin++; });
    const f = frag(titulo(rot)), hereda = !!(heredar && heredar.on);
    if (heredar) f.appendChild(opcion(heredar.texto, heredar.fn, { clase: hereda ? 'on' : '' }));
    f.appendChild(opcion('Todas las notas', () => poner(null), { clase: !actualC && !hereda ? 'on' : '' }));
    if (!cuenta.size) { f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'Estas notas no tienen color: se les pone en su ⋯ o en su ventana.' })); return f; }
    C.TONOS_NOTA.filter(t => cuenta.has(t)).forEach(t => f.appendChild(opcion(nombreColor(t), () => poner(t), { punto: `var(--t-${t})`, clase: actualC === t && !hereda ? 'on' : '', atajo: String(cuenta.get(t)) })));
    if (sin) f.appendChild(opcion('Sin color', () => poner('sin'), { punto: 'var(--papel)', clase: actualC === 'sin' && !hereda ? 'on' : '', atajo: String(sin) }));
    return f;
  }
  function menuOrden(rot, lista, actualK, fn) {
    const f = frag(titulo(rot));
    lista.forEach(([k, t]) => f.appendChild(opcion(t, () => fn(k), { clase: k === actualK ? 'on' : '' })));
    return f;
  }
  /* buscar en la vista (la biblioteca o el segmento expandido): esconde las notas que no casan, sin redibujar */
  let busquedaVista = { donde: null, texto: '' };
  const dondeVista = () => (!actual || actual.tipo !== 'sub' ? null : expandido && expandido.subId === actual.id ? 'seg:' + actual.id + '|' + expandido.clave : 'sub:' + actual.id);
  /* lo que se busca en la vista donde se ven las notas de esa biblioteca (para ‹ ›): el análisis, o null */
  function busquedaEn(subId) {
    if (!busquedaVista.texto || !actual || actual.tipo !== 'sub' || actual.id !== subId || busquedaVista.donde !== dondeVista()) return null;
    const c = C.busqueda.analizar(busquedaVista.texto.trim());
    return c && !c.vacia ? c : null;
  }
  function aplicarBusqueda() {
    const inp = $('[data-gd-buscar-vista]', main), m = modelo(); if (!inp || !m) return;
    const q = inp.value.trim(), c = q ? C.busqueda.analizar(q) : null, activa = !!c && !c.vacia;
    busquedaVista = { donde: dondeVista(), texto: inp.value };
    let total = 0, vistas = 0;
    $$('[data-nota]', main).forEach(el => {
      const n = m.nota(el.dataset.nota); if (!n) return;
      const ok = !activa || C.busqueda.puntuar(n, c) > 0;
      el.hidden = !ok; total++; if (ok && !seccionOculta(el)) vistas++;
    });
    $$('.gd-bloque', main).forEach(b => b.classList.toggle('con-coincidencias', activa && b.classList.contains('plegada') && $$('[data-nota]', b).some(x => !x.hidden)));   // contraída, pero con algo
    $$('.gd-etq[data-clave]', main).forEach(sec => sec.classList.toggle('sin-coincidencias', activa && !$$('[data-nota]', sec).some(x => !x.hidden)));
    main.classList.toggle('buscando', activa);
    const cuenta = $('.gd-buscar-cuenta', main); if (cuenta) cuenta.textContent = activa ? vistas + ' de ' + total : '';
    if (ladoId) { const mm = modelo(), n = mm && mm.nota(ladoId); if (n && capa) $('[data-gd-nav-lado]', capa).innerHTML = navHtml(mm, n); }
  }
  /* una nota de una sección contraída, o escondida porque otra se ve sola en toda la pantalla */
  const seccionOculta = el => !!(el.closest('.gd-bloque.plegada') || (el.closest('.gd-cuerpo.con-grande') && !el.closest('.gd-bloque.grande')));
  /* la caja de buscar de una vista */
  const cajaBuscar = (ph, pista) => `<label class="gd-buscar-vista" title="${esc(pista)}">${ic('search', 14)}<input type="search" data-gd-buscar-vista placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" aria-label="${esc(ph)}"><span class="gd-buscar-cuenta"></span></label>`;
  /* tras redibujar la misma vista, lo que se buscaba (y el foco, si lo tenía: un render de fondo no lo quita); en otra, nada */
  function reponerBusqueda(foco) {
    const inp = $('[data-gd-buscar-vista]', main), aqui = dondeVista();
    if (busquedaVista.donde !== aqui) busquedaVista = { donde: aqui, texto: '' };
    if (!inp) { main.classList.remove('buscando'); return; }
    if (busquedaVista.texto) { inp.value = busquedaVista.texto; aplicarBusqueda(); } else main.classList.remove('buscando');
    if (foco && foco.donde === aqui) { inp.focus({ preventScroll: true }); try { inp.setSelectionRange(foco.a, foco.b); } catch (_) {} }
  }
  /* la caja con el foco antes de redibujar (dónde y qué tenía elegido) */
  function focoBusqueda() {
    const b = document.activeElement;
    return b && b.matches && b.matches('[data-gd-buscar-vista]') && main.contains(b) ? { donde: busquedaVista.donde, a: b.selectionStart, b: b.selectionEnd } : null;
  }
  function enfocarBusqueda() { const inp = $('[data-gd-buscar-vista]', main); if (!inp || !inp.offsetParent) return false; inp.focus(); inp.select(); return true; }
  /* Cmd+F en la vista de una biblioteca (sin una nota abierta ni su ventana): su caja de buscar */
  const buscarEnVista = () => !notaAbierta && !ladoId && enfocarBusqueda();
  const olvidarBusqueda = () => { busquedaVista = { donde: null, texto: '' }; };
  /* ---------- las secciones de la biblioteca: contraer y expandir (Leo, 16-09-2026) ----------
     Cada sección (Segmentos y Guiones generados) se contrae con el chevrón de su título, como los segmentos de
     Personajes, y se expande con el botón de la derecha: expandida ocupa el lienzo ella sola (la otra no se ve) y
     sus tarjetas crecen, para verla «en una sola pantalla». Las dos cosas se recuerdan en la vista, no en el
     archivo, y el botón de expandir solo sale si hay dos secciones. */
  const plegadaSec = k => !!(o.vista && o.vista.secPlegadas && o.vista.secPlegadas[k]);
  const grandeSec = () => (o.vista && o.vista.secGrande) || null;
  const guardarVista = () => { if (o.guardarVista) o.guardarVista(); };
  /* el título de una sección: chevrón, muestra, nombre, cuenta, raya y el botón de expandir */
  function seccionHtml(clave, titulo, n, muestra, acciones) {
    return `<div class="gd-seccion">
      <button type="button" class="gd-seccion-plegar" data-gd-plegar-seccion="${clave}" aria-label="Contraer o desplegar la sección">${ic('chev-d', 13)}</button>
      <span class="gd-muestra${muestra || ''}" aria-hidden="true"></span><span class="gd-seccion-tit" data-gd-seccion-nombre>${esc(titulo)}</span><span class="gd-seccion-cuenta">${n}</span><i class="gd-seccion-linea"></i>
      ${acciones || ''}<button type="button" class="gd-seccion-grande" data-gd-grande-seccion="${clave}" aria-label="Expandir la sección">${ic('expand', 14)}</button></div>`;
  }
  /* Deja el cuerpo como dicen la vista: lo contraído, lo expandido y el aspecto de los dos botones. */
  function aplicarSecciones() {
    const cuerpo = $('.gd-cuerpo', main); if (!cuerpo) return;
    const bloques = $$('.gd-bloque', cuerpo), dos = bloques.length > 1;
    const gr = dos && bloques.some(b => b.dataset.seccion === grandeSec()) ? grandeSec() : null;
    cuerpo.classList.toggle('con-grande', !!gr);
    bloques.forEach(b => {
      const k = b.dataset.seccion, pleg = !gr && plegadaSec(k), on = gr === k;
      b.classList.toggle('grande', on);
      b.classList.toggle('plegada', pleg);
      const p = $('[data-gd-plegar-seccion]', b);
      if (p) { p.setAttribute('aria-expanded', String(!pleg)); p.title = pleg ? 'Desplegar la sección' : 'Contraer la sección'; }
      const g = $('[data-gd-grande-seccion]', b);
      if (g) {
        g.hidden = !dos; g.setAttribute('aria-pressed', String(on)); g.innerHTML = ic(on ? 'collapse' : 'expand', 14);
        g.title = on ? 'Volver a ver las dos secciones' : 'Ver solo esta sección, en toda la pantalla';
      }
    });
  }
  function renderMain() {
    const m = modelo(), foco = focoBusqueda();
    if (!m) { if (ladoId) cerrarLado(); main.innerHTML = '<div class="gd-nada"><b>No hay ningún guion abierto</b></div>'; return; }
    if (!actual) { if (ladoId) cerrarLado(); main.innerHTML = '<div class="gd-nada"><b>No hay contenedores</b><br>Crea uno con «＋ Nuevo contenedor» en el menú.</div>'; return; }
    const seccion = t => `<div class="gd-seccion"><span class="gd-seccion-tit">${t}</span></div>`;
    if (esPapelera()) {
      const todo = m.papelera(), lista = todo.filter(x => x.nota), piezas = todo.filter(x => !x.nota);
      const hace = x => { const dias = diasEn(x.eliminadoEn); return dias ? 'hace ' + dias + (dias === 1 ? ' día' : ' días') : 'hoy'; };
      /* arriba, lo tirado entero (Leo, 18-09-2026): esquemas, bibliotecas y personajes, cada uno con su «⋯» para restaurarlo */
      main.innerHTML = cabeceraHtml(null, '', 'Papelera') + `<div class="gd-cuerpo">`
        + (piezas.length ? `${seccion(`Esquemas, bibliotecas, lienzos y personajes · ${piezas.length} · se eliminan solos a los ${C.DIAS_PAPELERA} días`)}
        <section class="gd-etq gd-etq--bandeja gd-papelera gd-papelera--piezas"><div class="gd-etq-body"></div></section>` : '')
        + `${seccion(`Notas tiradas · ${lista.length} · se eliminan solas a los ${C.DIAS_PAPELERA} días`)}
        <section class="gd-etq gd-etq--bandeja gd-papelera gd-papelera--notas"><div class="gd-etq-body" data-gd-drop-cont="${PAPELERA}">${todo.length ? (lista.length ? '' : '<div class="gd-etq-vacia">No hay notas sueltas</div>') : '<div class="gd-etq-vacia">La papelera está vacía</div>'}</div></section></div>`;
      ponerCabecera('', 'Papelera');
      if (ladoId) cerrarLado(); olvidarBusqueda();
      const cajaP = $('.gd-papelera--piezas .gd-etq-body', main);
      piezas.forEach(x => {
        const id = x.tipo === 'esquema' ? x.esquema.id : x.tipo === 'sub' ? x.sub.id : x.tipo === 'lienzo' ? x.lienzo.id : x.personaje.id;
        const par = x.tipo === 'personaje' ? (PAL[x.personaje.color] || PAL[0]) : null;
        const chip = x.tipo === 'esquema' ? CHIPS.esquema : x.tipo === 'sub' ? CHIPS.sub : x.tipo === 'lienzo' ? CHIPS.lienzo : `<span class="gd-chip per-chip" style="--chl:${par[1]};--chd:${par[2]}" title="Personaje">${esc(C.iniciales(x.nombre || (x.personaje && x.personaje.nombre) || ''))}</span>`;
        const n = x.tipo === 'esquema' ? (x.esquema.datos.puntos || []).length : x.tipo === 'lienzo' ? (x.lienzo.nodos || []).length : (x.notas || []).length;
        const cuanto = x.tipo === 'esquema' || x.tipo === 'lienzo' ? n + (n === 1 ? ' nodo' : ' nodos') : n + (n === 1 ? ' nota' : ' notas');
        const donde = x.tipo === 'personaje' ? 'de Personajes' : 'de «' + (x.origenNombre || '?') + '»';
        cajaP.insertAdjacentHTML('beforeend', `<div class="gd-nota gd-pieza" role="button" tabindex="0" data-pieza="${esc(id)}" title="Doble clic: restaurar">
            ${chip}<span class="gd-pieza-nom"></span><span class="gd-nota-meta">${esc(donde + ' · ' + cuanto + ' · ' + hace(x))}</span>
            <button type="button" class="gd-nota-acc" data-gd-menu="pieza" title="Opciones">${ic('more', 13)}</button></div>`);
        cajaP.lastElementChild.querySelector('.gd-pieza-nom').textContent = x.tipo === 'lienzo' ? x.lienzo.nombre : C.nombreEnPapelera(x);
      });
      const cuerpo = $('.gd-papelera--notas .gd-etq-body', main);
      lista.forEach(x => {
        const dias = diasEn(x.eliminadoEn);
        cuerpo.insertAdjacentHTML('beforeend', notaHtml(x.nota, 'de «' + (x.origenNombre || '?') + '» · ' + (dias ? 'hace ' + dias + (dias === 1 ? ' día' : ' días') : 'hoy'), true));
        const el = cuerpo.lastElementChild; el.firstElementChild.textContent = x.nota.titulo; el.title = 'Restáurala para abrirla · arrástrala a una biblioteca';
      });
    } else if (actual.tipo === 'cont') {
      const c = m.contenedor(actual.cid);
      main.innerHTML = cabeceraHtml(null, '', c.nombre) + '<div class="gd-cuerpo"><div class="gd-nada"><b>Este contenedor no tiene bibliotecas</b><br>Crea una con el «＋» del contenedor en el menú.</div></div>';
      ponerCabecera('', c.nombre);
      if (ladoId) cerrarLado(); olvidarBusqueda();
    } else {
      const r = m.sub(actual.id), c = r.contenedor, s = r.sub;
      const x = expandido && expandido.subId === s.id && datosSegmento(m, s.id, expandido.clave);
      if (x) {
        const e0 = estiloHijo(s.id, 'gd-chip--sub');
        main.replaceChildren(vistaExpandida(m, x, especial(s.id)
          ? { cont: '', chip: chipEspecial(s.id, { boton: true, attrs: ` data-gd-contraer title="${infoEspecial(s.id).volver}"` }) }
          : { cont: c.nombre, chip: chipNombre(s.nombre, e0.clase, { boton: true, estilo: e0.estilo, attrs: ' data-gd-contraer', title: 'Volver a la biblioteca «' + s.nombre + '»' }) }));
        reponerBusqueda(foco);
        ventanaTrasPintar(m, s.id);
        return;
      }
      if (expandido && expandido.subId === s.id) expandido = null;   // el segmento ya no existe
      const enl = m.enlace(s.id);
      const eid = enl && enl.esquema ? enl.esquema.id : null;
      /* conectada con esquemas (1.1.57): sus chips (llevan a cada uno) en lugar de «Ver esquema»; sin conexiones, «Ver esquema» por el grupo */
      const conex = especial(s.id) ? '' : chipsConexiones('sub', s.id);
      const verEsq = (eid && !(enl && enl.conectado) ? `<button type="button" class="btn" data-gd-ver-esquema="${esc(eid)}" title="Abrir el esquema enlazado a esta biblioteca">${ic('board', 15)}Ver esquema</button>` : '') + conex;
      /* la de las plantillas (1.1.56): su chip, sin contenedor, «Nueva plantilla» y un aviso de cómo se usan; en las demás,
         «Desde plantilla» */
      const esp = especial(s.id), fx = esp && cualEspecial(s.id) === 'formulas';   // las fórmulas (1.1.60): lo mismo, con su aviso y «Nueva fórmula»
      const chipSub = esp ? chipEspecial(s.id) : chipNombre(s.nombre, estiloHijo(s.id, 'gd-chip--sub').clase, { estilo: estiloHijo(s.id).estilo, title: 'Biblioteca «' + s.nombre + '»' });
      /* buscar y el filtro general de la biblioteca (1.1.54): manda sobre el de cada segmento en sus tarjetas */
      const fb = filtroDe(claveFiltroBib(s.id)), colB = fb.color || null, ordB = fb.orden || 'manual';
      const filtrosBib = cajaBuscar(esp ? 'Buscar en ' + infoEspecial(s.id).las : 'Buscar en la biblioteca', 'Buscar en las notas de la biblioteca (Cmd+F)')
        + botonColor('colorBib', colB, false, (colB ? 'Solo las notas ' + (colB === 'sin' ? 'sin color' : 'de color ' + nombreColor(colB).toLowerCase()) + ', en todos los segmentos' : 'Solo las notas de un color, en todos los segmentos') + ' (aquí manda sobre el filtro de cada segmento)')
        + (colB ? `<button type="button" class="gd-filtro-quitar" data-gd-quitar-color-bib title="Quitar el filtro" aria-label="Quitar el filtro">${ic('close', 12)}</button>` : '')
        + `<button type="button" class="gd-filtro${ordB !== 'manual' ? ' on' : ''}" data-gd-menu="ordenBib" title="${esc((ordB === 'manual' ? 'El orden de las notas de todos los segmentos' : 'Orden: ' + rotuloOrden(ordB).toLowerCase() + ', en todos los segmentos') + ' (aquí manda sobre el de cada segmento)')}">${ic('sort', 14)}<span>${esc(ordB === 'manual' ? 'Orden' : rotuloOrden(ordB))}</span>${ic('chev-d', 12)}</button>`;
      const botonPl = fx ? `<button type="button" class="btn" data-gd-nueva-formula title="Una fórmula nueva en la bandeja">${ic('plus', 15)}Nueva fórmula</button>`
        : esp ? `<button type="button" class="btn" data-gd-nueva-plantilla title="Una plantilla nueva en la bandeja">${ic('plus', 15)}Nueva plantilla</button>`
        : `<button type="button" class="btn" data-gd-desde-plantilla title="Nueva nota desde una plantilla (${esc(tecla('Mod+Alt+N'))})">${ic('plantilla', 15)}Desde plantilla</button>`;
      main.innerHTML = cabeceraHtml(esp ? null : c.nombre, chipSub, null, filtrosBib + verEsq + botonPl) + `<div class="gd-exp-medio gd-bib-medio${esp ? ' gd-bib-plantillas' : ''}${fx ? ' gd-bib-formulas' : ''}"><div class="gd-cuerpo"></div></div>`;
      const cuerpo = $('.gd-cuerpo', main);
      if (fx) cuerpo.insertAdjacentHTML('beforeend', `<div class="gd-plantillas-aviso gd-formulas-aviso">${ic('formula', 18)}<div><b>Fórmulas</b> · Prompts reutilizables para las operaciones de IA de los lienzos, como las skills: el formato, el tono, el estilo o las reglas que quieres que se sigan. Se eligen en cada operación, junto a «Qué escribir» (el botón <b>Fórmula</b>), se pueden elegir varias —van en orden— y se combinan con lo que escribas ahí: si una lleva {{instruccion}}, lo escrito va en ese sitio; si no, detrás, como tu instrucción. Son solo texto (sin formato). Para guardar el texto de una nota como fórmula, su menú ⋯ o suéltala sobre «Fórmulas».</div></div>`);
      else if (esp) cuerpo.insertAdjacentHTML('beforeend', `<div class="gd-plantillas-aviso">${ic('plantilla', 18)}<div><b>Plantillas</b> · De estas notas salen notas nuevas: «Usar», <b>Desde plantilla</b> en una biblioteca, ${esc(tecla('Mod+Alt+N'))} o <b>/plantilla</b> dentro del editor. Sus variables se rellenan al usarlas: {{titulo}}, {{fecha}}, {{hora}}, {{ayer}}, {{mañana}}, {{proyecto}} y {{cursor}} (dónde se empieza a escribir); la fecha y la hora aceptan formato, como {{fecha:dddd D [de] MMMM}}. Llevan su color y sus personajes, pero no cuentan como apariciones de nadie. Para guardar una nota como plantilla, su menú ⋯ o suéltala sobre «Plantillas».</div></div>`);
      {
        /* la biblioteca de un personaje estrena la sección «Apariciones» (Leo, 16-09-2026: los personajes son
           bibliotecas, y sus apariciones dejan de vivir en el carrusel) */
        if (c.id === C.ID_PERSONAJES && s.lineaId) cuerpo.appendChild(bloqueApariciones(m, s.lineaId));
        /* la sección de partida (con la bandeja) y las que haya creado Leo, cada una con sus segmentos */
        cuerpo.appendChild(bloqueSeccion(m, s, null));
        m.seccionesDe(s.id).forEach(k => cuerpo.appendChild(bloqueSeccion(m, s, k)));
        const mas = document.createElement('button');
        mas.type = 'button'; mas.className = 'gd-seccion-nueva'; mas.dataset.gdNuevaSeccion = '';
        mas.innerHTML = ic('plus', 14) + 'Nueva sección';
        cuerpo.appendChild(mas);
        if ($$('.gd-bloque:not(.gd-bloque--apariciones)', cuerpo).length > 1)   // «Apariciones» se queda la primera: no se arrastra
          $$('.gd-bloque:not(.gd-bloque--apariciones) > .gd-seccion', main).forEach(h => { h.title = 'Arrastra el título para cambiar el orden de las secciones'; h.insertAdjacentHTML('afterbegin', `<span class="gd-asa">${ic('drag', 13)}</span>`); });
      }
      aplicarSecciones();                                      // lo contraído y lo expandido de la vista
      ponerCabecera(esp ? '' : c.nombre, null);
      reponerBusqueda(foco);
      ventanaTrasPintar(m, s.id);
    }
  }
  /* la ventana de una nota tras pintar una biblioteca: se reabre sola una vez (al volver a una pestaña o a la vista que la tenía),
     se pone al día si sigue abierta y se cierra si su nota ya no es de aquí */
  function ventanaTrasPintar(m, subId) {
    const aLaVista = () => !o.modo || o.modo() === 'documentos';   // el menú se pinta también desde las otras vistas: ahí no se abre
    const elegida = notaSel && m.nota(notaSel);
    if (reabrir && aLaVista()) {
      reabrir = false;
      if (elegida && elegida.subId === subId && !m.enPapelera(elegida.id)) { const id = elegida.id; setTimeout(() => { if (notaSel === id && !notaAbierta && aLaVista()) mostrarLado(id); }, 0); return; }
    }
    if (!ladoId) return;
    const n = m.nota(ladoId);
    if (n && n.subId === subId && aLaVista()) refrescarVentana(); else cerrarLado();
  }
  /* Una sección de la biblioteca: su título, sus segmentos (y la bandeja, en la de partida) y «＋ nuevo segmento».
     `k` null = la sección de partida, «Segmentos» (Leo, 16-09-2026: en lugar de «Guiones generados», las que quiera). */
  function bloqueSeccion(m, s, k) {
    const sec = document.createElement('section');
    const clave = k ? 'sec:' + k.id : 'segmentos';
    sec.className = 'gd-bloque'; sec.dataset.seccion = clave;
    if (k) sec.dataset.seccionId = k.id;
    const etqs = m.etiquetasDe(s.id, k ? k.id : null);
    sec.innerHTML = seccionHtml(clave, k ? k.nombre : 'Segmentos', etqs.length + (k ? 0 : 1), '',
      k ? `<button type="button" class="gd-seccion-acc" data-gd-menu="seccion" data-seccion-id="${esc(k.id)}" title="Opciones de la sección">${ic('more', 14)}</button>` : '');
    const tablero = document.createElement('div');
    tablero.className = 'gd-tablero'; tablero.dataset.orden = ''; tablero.dataset.sub = s.id;
    if (k) tablero.dataset.seccionId = k.id;
    sec.appendChild(tablero);
    /* cada segmento con el filtro que le toca en la biblioteca: el general manda; lo que no pone, lo pone el suyo */
    const conFiltro = (e, kk) => {
      const todas = m.notasDe(s.id, e ? e.id : null), f = filtroPara(s.id, kk, false);
      return tarjeta(e, filtrarNotas(todas, f), { total: todas.length, filtro: f, propio: f.propio });
    };
    const piezas = new Map(k ? [] : [['bandeja', conFiltro(null, 'bandeja')]]);
    etqs.forEach(e => piezas.set('etq:' + e.id, conFiltro(e, 'etq:' + e.id)));
    const orden = k ? Array.from(piezas.keys()) : m.ordenSegmentos(s.id, Array.from(piezas.keys()));
    orden.forEach(x => { const card = piezas.get(x); if (!card) return; card.dataset.clave = x; tablero.appendChild(card); });
    const nueva = document.createElement('button');
    nueva.type = 'button'; nueva.className = 'gd-etq-nueva'; nueva.dataset.gdMenu = 'paleta';
    if (k) nueva.dataset.seccionId = k.id;
    nueva.innerHTML = '<span class="gd-etq-nueva-tit">' + ic('plus', 14) + 'nuevo segmento</span><span class="gd-muestras" aria-hidden="true">' + [0, 1, 3, 4, 6, 5].map(i => `<i style="background:${colores(i)[0]}"></i>`).join('') + '</span>';
    tablero.appendChild(nueva);
    return sec;
  }
  /* La cabecera de una nota de biblioteca abierta en el editor: la misma que la de un documento de esquema
     (Leo): «CONTENEDOR [Biblioteca] [segmento] título», con el título editable (renombra la nota), «Ver
     biblioteca» y ‹ › para la nota anterior o siguiente de su segmento. En Personajes: «PERSONAJES [nombre]». */
  /* (1.1.54) ‹ › van por las notas del segmento en el orden en que se ven (`vecinasDe`: sus filtros y lo que se busque), y junto a
     la papelera, «Contraer» devuelve la nota a su ventana, encima de la biblioteca (Leo en ClapBook: «Pon junto al bote de basura
     un botón para contraer la nota y se vea de nuevo el modal») */
  function renderMigas() {
    if (!migas) return;
    const m = modelo(); if (!m || !notaAbierta) { migas.innerHTML = ''; delete migas.dataset.migaNota; return; }
    const n = m.nota(notaAbierta), r = n && m.sub(n.subId); if (!r) { migas.innerHTML = ''; delete migas.dataset.migaNota; return; }
    const hermanas = vecinasDe(m, n), i = hermanas.findIndex(x => x.id === n.id);
    const nom = $('[data-gd-miga-nom]', migas);
    if (nom && !nom.readOnly && migas.dataset.migaNota === n.id) return;   // renombrando: no se redibuja
    const s = ref('sub', r.contenedor.id, r.sub.id);
    const e = n.etiquetaId ? m.etiqueta(n.etiquetaId) : null;
    const per = r.contenedor.id === C.ID_PERSONAJES;
    /* la etiqueta del segmento (o de la bandeja), como un chip de la cabecera: al pulsarla, el segmento expandido */
    const nomSeg = e ? e.nombre : 'Bandeja';
    const chipSeg = chipNombre(nomSeg, 'gd-seg-chip' + (e ? '' : ' gd-seg-chip--bandeja'), { boton: true, attrs: ' data-gd-expandir-nota', estilo: e ? estiloTag(e) : '', icono: ic('expand', 12),
      title: (e ? 'Segmento «' + e.nombre + '»' : 'Bandeja') + ' · pulsa para expandirlo' });
    /* la biblioteca (en Personajes, el personaje con su color): al pulsarla, su tablero */
    const pj = per && m.personaje(r.sub.lineaId), pt = pj && PAL[pj.color], pl = especial(r.sub.id);   // una plantilla: «[Plantillas]», sin contenedor
    const chipSub = pl ? chipEspecial(r.sub.id, { boton: true, attrs: ` data-gd-ir="${esc(clave(s))}" title="${infoEspecial(r.sub.id).las.replace(/^l/, 'L')}"` })
      : per
      ? chipNombre(pj ? pj.nombre : r.sub.nombre, 'per-chip', { boton: true, attrs: ' data-gd-volver', estilo: pt ? `--chl:${pt[1]};--chd:${pt[2]}` : '', title: 'Volver a «' + (pj ? pj.nombre : r.sub.nombre) + '»' })
      : chipNombre(r.sub.nombre, estiloHijo(r.sub.id, 'gd-chip--sub').clase, { boton: true, estilo: estiloHijo(r.sub.id).estilo, attrs: ` data-gd-ir="${esc(clave(s))}"`, title: 'Biblioteca «' + r.sub.nombre + '»' });
    migas.dataset.migaNota = n.id;   // no `data-nota`: el tablero de tramas lo tomaría por uno de sus post-it y bloquearía el clic
    migas.innerHTML = `<div class="esq-titulo">
        ${pl ? '' : `<button type="button" class="esq-cont gd-miga" ${per ? 'data-gd-volver' : `data-gd-ir="${esc(clave(entradaDe(r.contenedor)))}"`} data-gd-miga-cont></button>`}
        ${chipSub}${chipSeg}
        <input type="text" class="texto-nom" data-gd-miga-nom readonly spellcheck="false" autocomplete="off" placeholder="Sin título" aria-label="Título del documento">
      </div>
      <span class="spacer"></span>
      <button type="button" class="btn" data-gd-volver title="${per ? 'Volver al personaje' : pl ? infoEspecial(r.sub.id).volver : 'Volver a la biblioteca'}">${ic(per ? 'person' : pl ? infoEspecial(r.sub.id).icono : 'docs', 15)}${per ? 'Ver personaje' : pl ? infoEspecial(r.sub.id).ver : 'Ver biblioteca'}</button>
      <span class="par-nav"><button type="button" data-gd-miga-mover="-1" ${i > 0 ? '' : 'disabled'} title="Nota anterior del segmento" aria-label="Nota anterior">${ic('arr-l', 13)}</button><button type="button" data-gd-miga-mover="1" ${i >= 0 && i < hermanas.length - 1 ? '' : 'disabled'} title="Nota siguiente del segmento" aria-label="Nota siguiente">${ic('arr-r', 13)}</button></span>
      <button type="button" class="icono gd-miga-tirar" data-gd-miga-tirar title="Mover la nota a la papelera" aria-label="Mover la nota a la papelera">${ic('trash', 15)}</button>
      <button type="button" class="icono" data-gd-contraer-nota title="Contraer: verla en su ventana, encima de la biblioteca" aria-label="Contraer la nota">${ic('collapse', 15)}</button>`;
    if (!pl) $('[data-gd-miga-cont]', migas).textContent = per ? 'Personajes' : r.contenedor.nombre;
    $('[data-gd-miga-nom]', migas).value = n.titulo;
  }
  /* La cabecera de un documento de «Guiones generados» (rediseño 11, «Documento plano»): «CONTENEDOR [Biblioteca] [segmento de
     guiones] título» y de dónde salió y cuándo (Leo, 15-09-2026: sin «Regenerar»). */
  function fechaHora(t) {
    if (!t) return '';
    const dt = new Date(t), hh = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    return fecha(t) + ' ' + hh;
  }
  let renderPendiente = false;
  /* con una nota en el editor, el tablero de detrás no se pinta (no se ve, y así la ventana de otra nota no se reabre detrás);
     cerrarla lo redibuja */
  function render() {
    if (pd && pd.activo) { renderPendiente = true; return; }   // durante un arrastre no se redibuja: se perdería lo que se arrastra
    if (editando) return; renderLado(); if (!notaAbierta) renderMain(); renderMigas(); }
  /* abrir una aparición: una nota de biblioteca en el editor, o el documento de un nodo */
  function abrirAparicion(el) {
    const tipo = el.dataset.apTipo, id = el.dataset.apId;
    if (tipo === 'nota') abrirNota(id); else if (o.abrirNodo) o.abrirNodo(el.dataset.apEid, id);
  }

  /* ---------- notas en el editor ---------- */
  /* la barra está en todas las vistas: lo elegido en ella se enseña en la vista Biblioteca */
  const irAlTablero = () => { if (o.mostrarTablero) o.mostrarTablero(); };
  function abrirNota(id) {
    notaAntes = null;
    const m = modelo(); if (!m) return;
    if (m.enPapelera(id)) { if (o.avisar) o.avisar('Está en la papelera: restáurala para abrirla'); return; }
    const n = m.nota(id), r = n && m.sub(n.subId); if (!r) return;
    /* una fórmula (1.1.60) no va al editor de guion: se abre en su ventana, encima de su tablero */
    if (esFormula(n)) { abrirFormula(id); return; }
    if (ladoId) cerrarLado();                                    // la ventana de una nota se va: esta ocupa el editor
    /* los documentos de un esquema (los guiones) se abren en la vista Texto, con su tira de referencia (Leo, 16-09-2026) */
    if (r.sub.guionEid && o.abrirTexto) { if (notaAbierta) cerrarNota(); o.abrirTexto(id); return; }
    irAlTablero(true);
    notaAbierta = id;
    navegar(ref('sub', r.contenedor.id, n.subId));
    document.body.classList.add('nota-abierta');
    if (o.alNavegar) o.alNavegar();                            // con la nota ya marcada: entra en la última pantalla
    o.texto.abrirDocumento({ titulo: n.titulo, html: n.html, characters: n.characters }, {
      guardar: doc => { const x = m.guardarNota(id, doc); if (x.ok && x.cambio && o.guardar) o.guardar(); },
      alCambiar: () => { renderMigas(); renderLado(); }
    }, { clave: id });
    render();
  }
  function cerrarNota() {
    if (!notaAbierta) return;
    if (!navSigue) ordenNav = null;                            // el orden de ‹ › se congela mientras se navega (vecinasDe)
    o.texto.cerrarDocumento();
    notaAbierta = null;
    document.body.classList.remove('nota-abierta');
    render();
    if (actual && actual.cid === C.ID_PERSONAJES && o.verArbol) { o.verArbol('personajes'); render(); }   // la nota era de un personaje: su árbol
    if (o.alNavegar) o.alNavegar();
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
    const pintarTipo = () => { $$('[data-dlg-tipo]', dlg).forEach(b => b.classList.toggle('on', b.dataset.dlgTipo === tipo)); $('[data-dlg-titulo]', dlg).textContent = op.tipos ? (tipo === 'esquema' ? 'Crear esquema de pasos' : tipo === 'lienzo' ? 'Crear lienzo' : 'Crear biblioteca') : op.titulo; };
    tipos.hidden = !op.tipos; pintarTipo();
    /* la tarjeta «Lienzo» (1.1.58), solo donde caben lienzos (`op.conLienzo`) */
    const tLienzo = $('[data-dlg-tipo="lienzo"]', dlg); if (tLienzo) tLienzo.hidden = !op.conLienzo;
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
  async function nuevoHijo(cid, tipoInicial, carpetaId, grupoId) {
    const c = d.contenedor(cid); if (!c) return;
    const k = carpetaId && d.carpeta(carpetaId);
    const conLienzo = !!d.crearLienzo && !c.oculto && !c.especial;   // un lienzo también es un hijo del contenedor (1.1.58)
    const r0 = await pedirNombre({ ceja: 'Nuevo en «' + (k ? k.carpeta.nombre : c.nombre) + '»', titulo: 'Crear', tipos: true, tipo: tipoInicial || 'sub', pista: 'Nombre', conLienzo });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre'); return; }
    if (r0.tipo === 'lienzo' && conLienzo) { crearLienzoEn(cid, r0.nombre, k ? carpetaId : null, grupoId || null); return; }
    const abrirCarpeta = () => { if (k) { d.plegarCarpeta(carpetaId, false); if (c.plegado) d.plegarContenedor(cid, false); } };
    const enGrupo = id => { if (grupoId && d.grupo(grupoId)) d.aGrupo(grupoId, id); };   // lo creado desde el ⋯ de un grupo entra en él
    if (r0.tipo === 'esquema') {
      const r = d.crearEsquema(cid, o.crearEsquemaDatos ? o.crearEsquemaDatos() : null, r0.nombre);
      if (r.ok && k) { d.moverACarpeta('esquema', r.esquema.id, carpetaId); abrirCarpeta(); }
      if (r.ok) enGrupo(r.esquema.id);
      if (tras(r) && o.esquemaCreado) o.esquemaCreado(r.esquema.id);
    } else {
      const r = d.crearSub(cid, r0.nombre);
      if (r.ok && k) { d.moverACarpeta('sub', r.sub.id, carpetaId); abrirCarpeta(); }
      if (r.ok) enGrupo(r.sub.id);
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
  async function nuevoPersonajeEn(carpetaId, grupoId) {
    const p = o.nuevoPersonaje ? await o.nuevoPersonaje() : null;
    if (!p || !d) return;
    if (carpetaId) { d.moverACarpeta('personaje', p.id, carpetaId); d.plegarCarpeta(carpetaId, false); }
    if (grupoId && d.grupo(grupoId)) d.aGrupo(grupoId, p.id);
    if (carpetaId || grupoId) { if (o.guardar) o.guardar(); render(); }
  }
  /* Un grupo vacío, listo para ir metiéndole cosas (Leo, 16-09-2026). `op`: { carpetaId, padreId }. */
  async function nuevoGrupo(ambito, op) {
    const gs = d.gruposDe ? d.gruposDe(ambito) : [];
    const usados = gs.map(g => g.color), libre = C.COLORES_CARPETA.find(x => !usados.includes(x)) || 'ambar';
    const r0 = await pedirNombre({ ceja: 'Nuevo grupo', titulo: 'Crear grupo', pista: 'Por ejemplo, Bloque I', paleta: PALETA_CARPETA(), color: libre });
    if (!r0) return;
    if (!r0.nombre.trim()) { o.avisar && o.avisar('Escribe un nombre para el grupo'); return; }
    tras(d.crearGrupo(ambito, [], r0.nombre, r0.color, op || {}));
  }
  const nuevoEsquema = cid => nuevoHijo(cid, 'esquema');
  const nuevoSub = cid => nuevoHijo(cid, 'sub');

  /* ---------- menús flotantes ---------- */
  let abierto = null, disparador = null;
  function cerrarPop() {
    if (!abierto) return;
    abierto.remove(); abierto = null;
    if (disparador) { if (disparador.classList) disparador.classList.remove('is-active'); disparador = null; }
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
    if (trigger.classList) trigger.classList.add('is-active');
    abierto = el; disparador = trigger;
    const primero = el.querySelector('button'); if (primero) primero.focus({ preventScroll: true });
  }
  const opcion = (texto, accion, extra) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = (extra && extra.clase) || ''; b.setAttribute('role', 'menuitem');
    if (extra && extra.punto) { const p = document.createElement('span'); p.className = 'gd-pop-punto'; p.style.background = extra.punto; b.appendChild(p); }
    b.appendChild(document.createTextNode(texto));
    if (extra && extra.atajo) { const k = document.createElement('kbd'); k.className = 'gd-pop-atajo'; k.textContent = extra.atajo; b.appendChild(k); }   // un atajo, o una cuenta
    b.addEventListener('click', () => { cerrarPop(); accion(); });
    return b;
  };
  const separador = () => Object.assign(document.createElement('div'), { className: 'gd-pop-sep' });
  const titulo = t => Object.assign(document.createElement('div'), { className: 'gd-pop-tit', textContent: t });
  const frag = (...xs) => { const f = document.createDocumentFragment(); xs.forEach(x => { if (x) f.appendChild(x); }); return f; };

  /* La paleta: crea un segmento con ese color (y pide su nombre) o recolorea uno existente. */
  function paleta(etiquetaId, subId, seccionId) {
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
        const x = m.crearEtiqueta(sid, null, i, { seccionId: seccionId || null });
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
  /* «Agrupar con…»: cualquier otra pieza del mismo nivel del contenedor (Leo, 16-09-2026: los grupos son libres). */
  /* el punto de cada opción lleva el color de su etiqueta (Leo, 16-09-2026: salía un cuadro gris), y si está en un
     grupo, el del grupo */
  function puntoPieza(id) {
    const g = d.grupoDe(id);
    if (g) return 'var(--t-' + g.grupo.color + ')';
    const r = d.esquema(id) || d.sub(id) || lienzoDe(id) || (d.personaje(id) ? { pieza: d.personaje(id) } : null);
    const x = r && (r.esquema || r.sub || r.lienzo || r.pieza);
    if (x && x.color !== undefined && x.color !== null) return colores(x.color)[0];
    return d.esquema(id) ? 'var(--p-violeta-bg)' : lienzoDe(id) ? 'var(--t-teal)' : 'var(--p-azul-bg)';   // el de siempre: violeta el esquema, azul la biblioteca, verde azulado el lienzo
  }
  function menuEnlazar(s) {
    if (d.grupoDe(s.id)) return frag(opcion('Sacar del grupo', () => tras(d.quitarEnlace(s.id))));
    const c = d.contenedor(s.cid); if (!c) return null;
    const mia = (d.esquema(s.id) || d.sub(s.id) || lienzoDe(s.id) || {});
    const nivel = ((mia.esquema || mia.sub || mia.lienzo || {}).carpetaId) || null;
    const candidatos = d.nivelArbol(c.id, nivel).filter(x => x.tipo !== 'carpeta' && x.id !== s.id);
    const f = frag(titulo('Agrupar con…'));
    f.appendChild(opcion('Un grupo con este solo', () => tras(d.crearGrupo(c.id, [s.id]))));   // grupos de uno (Leo, 16-09-2026)
    f.appendChild(separador());
    if (!candidatos.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'No hay nada más en este nivel' }));
    candidatos.forEach(x => f.appendChild(opcion(x.obj.nombre, () => tras(d.enlazar(s.id, x.id)), { punto: puntoPieza(x.id) })));
    return f;
  }
  /* «Agrupar con…» de un personaje: cualquier otro del elenco (Leo, 16-09-2026: en Personajes se agrupa, no hay carpetas). */
  function menuAgruparPersonaje(id) {
    const f = frag(titulo('Agrupar con…'));
    f.appendChild(opcion('Un grupo con este solo', () => tras(d.crearGrupo(C.ELENCO_CARPETAS, [id]))));
    f.appendChild(separador());
    const otros = d.elenco().filter(p => p.id !== id);
    if (!otros.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'No hay más personajes' }));
    otros.forEach(p => f.appendChild(opcion(p.nombre, () => tras(d.enlazar(id, p.id)), { punto: puntoPieza(p.id) })));
    return f;
  }
  /* El color de un grupo (los seis de carpeta) y el de la etiqueta de un esquema o una biblioteca (los 16 pares). */
  function paletaGrupo(gid) {
    const r = d.grupo(gid); if (!r) return null;
    const grid = document.createElement('div'); grid.className = 'gd-paleta gd-paleta--carpeta';
    PALETA_CARPETA().forEach(x => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = x.titulo; b.style.background = x.fondo;
      if (r.grupo.color === x.valor) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); tras(d.colorearGrupo(gid, x.valor)); });
      grid.appendChild(b);
    });
    return frag(titulo('Color de «' + r.grupo.nombre + '»'), grid);
  }
  function paletaHijo(id) {
    const r = d.esquema(id) || d.sub(id) || lienzoDe(id); if (!r) return null;
    const x = r.esquema || r.sub || r.lienzo;
    const grid = document.createElement('div'); grid.className = 'gd-paleta';
    PAL.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = t[0]; b.style.background = colores(i)[0];
      if (x.color === i) b.classList.add('on');
      b.addEventListener('click', () => { cerrarPop(); coloreado(tras(d.colorearHijo(id, i))); });
      grid.appendChild(b);
    });
    const quitar = opcion('El de siempre', () => coloreado(tras(d.colorearHijo(id, null))), { punto: 'var(--hover-fuerte)' });
    /* un lienzo abierto repinta su cabecera (la etiqueta lleva su color) y sus pestañas (1.1.58) */
    function coloreado(ok) { if (ok && lienzoDe(id) && o.lienzoRenombrado) o.lienzoRenombrado(id); }
    return frag(titulo('Color de la etiqueta'), grid, quitar);
  }
  /* Las primeras líneas de una nota, para la vista expandida. */
  const textoDe = html => {
    if (!html) return '';
    const t = document.createElement('template');
    t.innerHTML = String(html).replace(/<div class="db"[\s\S]*?<\/div>/g, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, ' ');
    return t.content.textContent.replace(/\s+/g, ' ').trim().slice(0, 320);
  };
  /* Un menú de lista sencillo, para elegir entre cosas con nombre (lo usan las versiones del documento). */
  function menuLista(trigger, tituloTexto, items, alElegir) {
    const f = frag(titulo(tituloTexto));
    if (!items.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'No hay nada que elegir' }));
    items.forEach(x => f.appendChild(opcion(x.nombre, () => alElegir(x.id), { punto: x.punto || 'var(--foco-suave)' })));
    abrirPop(trigger, f);
  }
  function renombrarGrupo(gid) {
    const r = d.grupo(gid); if (!r) return;
    const el = $(`.gd-arb-grupo[data-grupo="${CSS.escape(gid)}"] .gd-arb-nom`, lado); if (!el) return;
    editarEnSitio(el, r.grupo.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarGrupo(gid, v)); else render(); });
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
  /* «Abrir en pestaña» (1.1.33, Leo): lo abre en una pestaña del proyecto, o va a la que ya lo tenga (app.js, `abrirEnPestana`) */
  const enPestana = (destino, texto) => o.abrirEnPestana ? [opcion(texto || 'Abrir en pestaña', () => o.abrirEnPestana(destino))] : [];
  /* «Copiar enlace para Claude» (1.1.52, Leo: «pon unos "puntos" o "links" a bibliotecas, segmentos, notas, personajes,
     esquemas… para facilitar el decirle a Claude a qué puntos me refiero»): su enlace en Markdown, al portapapeles (app.js) */
  const conEnlace = ref => (o.copiarEnlace ? [opcion('Copiar enlace para Claude', () => o.copiarEnlace(ref))] : []);
  function menuHijo(t, s) {
    const actualCarpeta = ((s.tipo === 'esquema' ? (d.esquema(s.id) || {}).esquema : s.tipo === 'lienzo' ? (lienzoDe(s.id) || {}).lienzo : (d.sub(s.id) || {}).sub) || {}).carpetaId || null;
    const mover = opcion('Mover a carpeta…', () => abrirPop(t, menuMoverCarpeta(s.tipo === 'sub' ? 'sub' : s.tipo, s.id, s.cid, actualCarpeta)));
    const grupo = d.grupoDe(s.id);
    const enlace = [opcion('Cambiar color', () => abrirPop(t, paletaHijo(s.id))),
      grupo ? opcion('Sacar del grupo', () => tras(d.quitarEnlace(s.id))) : opcion('Agrupar con…', () => abrirPop(t, menuEnlazar(s)))];
    const duplicar = opcion('Duplicar', () => duplicarHijo(s));
    /* un lienzo de nodos (1.1.58): se abre, se renombra, se colorea, se agrupa, se duplica y va a la papelera como los demás; no
       se conecta con bibliotecas (sus nodos ya apuntan a lo que usan) */
    if (s.tipo === 'lienzo') return frag(
      opcion('Abrir lienzo', () => abrirLienzo(s.id)),
      ...enPestana({ tipo: 'lienzo', id: s.id }),
      ...conEnlace({ tipo: 'lienzo', id: s.id }),
      separador(),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      duplicar, mover,
      separador(), ...enlace,
      opcion('Mover a la papelera', () => eliminarLienzo(s.id), { clase: 'peligro' }));
    /* lo que se puede poner en un lienzo como entrada: el esquema y la biblioteca (1.1.58) */
    const alLienzo = anadirAlLienzoOpcion(t, s.tipo === 'esquema' ? 'esquema' : 'biblioteca', s.id);
    /* conexiones esquema ↔ biblioteca (1.1.57): de muchos a muchos, aparte de los grupos */
    const conectar = s.tipo === 'esquema' ? [opcion('Conectar con biblioteca…', () => menuConectar(t, 'esquema', s.id), { atajo: String(d.bibliotecasDe(s.id).length || '') })]
      : d.conectable(s.id) ? [opcion('Conectar con esquema…', () => menuConectar(t, 'sub', s.id), { atajo: String(d.esquemasConectados(s.id).length || '') })] : [];
    if (s.tipo === 'esquema') return frag(
      opcion('Abrir esquema', () => abrirEsquema(s.id)),
      ...enPestana({ tipo: 'esquema', id: s.id }),
      ...(d.esEsquemaPersonaje(s.id) ? [] : enPestana({ tipo: 'documento', id: s.id }, 'Abrir el documento en pestaña')),
      ...conEnlace({ tipo: 'esquema', id: s.id }),
      ...alLienzo,
      separador(),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      duplicar, mover,
      separador(), ...conectar, ...enlace,
      opcion('Mover a la papelera', () => eliminarEsquema(s.id), { clase: 'peligro' }));
    return frag(
      ...enPestana({ tipo: 'sub', id: s.id }),
      ...conEnlace({ tipo: 'biblioteca', id: s.id }),
      ...alLienzo,
      separador(),
      opcion('Nueva nota', () => nuevaNota(s.id, null)),
      opcion('Nuevo segmento', () => abrirPop(t, paleta(null, s.id))),
      separador(),
      opcion('Renombrar', () => renombrarHijo(s, t)),
      duplicar, mover,
      separador(), ...conectar, ...enlace,
      opcion('Mover a la papelera', () => eliminarSub(s.id), { clase: 'peligro' }));
  }
  /* una copia con todo su contenido, detrás del original (el esquema montado y el documento abierto se guardan antes: la copia
     lleva lo último) */
  function duplicarHijo(s) {
    if (o.volcar) o.volcar();
    if (s.tipo === 'lienzo') { tras(d.duplicarLienzo ? d.duplicarLienzo(s.id) : { ok: false, aviso: 'Esta versión no sabe duplicar lienzos' }); return; }
    tras(s.tipo === 'esquema' ? d.duplicarEsquema(s.id) : d.duplicarSub(s.id));
  }
  /* ---------- conexiones esquema ↔ biblioteca (1.1.57) ----------
     Leo, 27-09-2026: «tenía la posibilidad de conectar esquemas con bibliotecas, varios a la vez». El menú lista las bibliotecas (o los
     esquemas) de todos los contenedores, con las conectadas marcadas; un clic conecta o desconecta, con «Deshacer» en el aviso. */
  function menuConectar(trigger, tipo, id) {
    if (!d) return;
    const esEsq = tipo === 'esquema', r = esEsq ? d.esquema(id) : d.sub(id); if (!r) return;
    const nombre = esEsq ? r.esquema.nombre : r.sub.nombre;
    const f = frag(titulo(esEsq ? 'Conectar «' + nombre + '» con…' : 'Conectar «' + nombre + '» con…'));
    const grupos = [];
    if (esEsq) todasLasBibliotecas().forEach(x => { let g = grupos.find(y => y.c === x.contenedor); if (!g) grupos.push(g = { c: x.contenedor, xs: [] }); g.xs.push({ id: x.sub.id, nombre: x.sub.nombre, on: d.conectado(id, x.sub.id) }); });
    else {
      const L = d.contenedores();
      [...L.fijados, ...L.sueltos, d.contenedor(C.ID_ESQUEMAS_PERSONAJE)].filter(Boolean).forEach(c => {
        const xs = c.esquemas.map(e => ({ id: e.id, nombre: e.nombre, on: d.conectado(e.id, id) }));
        if (xs.length) grupos.push({ c, xs, rotulo: c.id === C.ID_ESQUEMAS_PERSONAJE ? 'Esquemas de personaje' : c.nombre });
      });
    }
    if (!grupos.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: esEsq ? 'Aún no hay bibliotecas: créalas con el «＋» de un contenedor' : 'Aún no hay esquemas' }));
    grupos.forEach(g => {
      if (grupos.length > 1) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-sub', textContent: g.rotulo || g.c.nombre }));
      g.xs.forEach(x => f.appendChild(opcion(x.nombre, () => alternarConexion(esEsq ? id : x.id, esEsq ? x.id : id), { clase: x.on ? 'on' : '', punto: x.on ? 'var(--foco)' : 'var(--hover-fuerte)' })));
    });
    abrirPop(trigger, f);
  }
  const todasLasBibliotecas = () => (d.todasLasBibliotecas ? d.todasLasBibliotecas() : []).filter(x => d.conectable(x.sub.id));
  /* conecta si no lo estaban y desconecta si lo estaban; el aviso trae «Deshacer» (que la devuelve a su sitio en la lista) */
  function alternarConexion(eid, subId) {
    if (!d) return false;
    const ya = d.conectado(eid, subId), r = ya ? d.desconectar(eid, subId) : d.conectar(eid, subId);
    if (!r.ok || !r.cambio) return tras(r);
    const listo = () => { if (o.guardar) o.guardar(); render(); if (o.alConectar) o.alConectar(); };
    listo();
    if (o.avisar) o.avisar(r.aviso, { texto: 'Deshacer', fn: () => { const x = ya ? d.conectar(eid, subId, { pos: r.pos }) : d.desconectar(eid, subId); if (x.ok) listo(); } });
    return true;
  }
  /* las conexiones de un esquema o de una biblioteca como chips (para las cabeceras): cada una lleva allí y su × desconecta, y
     el último botón conecta otra. `tipo`: 'esquema' (sus bibliotecas) o 'sub' (sus esquemas). También lo usa app.js. */
  function chipsConexiones(tipo, id) {
    if (!d) return '';
    const esEsq = tipo === 'esquema', xs = esEsq ? d.bibliotecasDe(id) : d.esquemasConectados(id);
    if (!esEsq && !d.conectable(id)) return '';
    const chips = xs.map(x => {
      const obj = esEsq ? x.sub : x.esquema, e = estiloHijo(obj.id, esEsq ? 'gd-chip--sub' : 'gd-chip--esquema');
      const par = esEsq ? id + '|' + obj.id : obj.id + '|' + id;
      return `<span class="cx-chip">${chipNombre(obj.nombre, e.clase, { boton: true, estilo: e.estilo, attrs: ` data-cx-ir="${esEsq ? 'sub' : 'esquema'}:${esc(obj.id)}"`, title: (esEsq ? 'Biblioteca conectada «' : 'Esquema conectado «') + obj.nombre + '»' })}`
        + `<button type="button" class="cx-quitar" data-cx-quitar="${esc(par)}" title="Desconectar" aria-label="${esc('Desconectar «' + obj.nombre + '»')}">${ic('close', 10)}</button></span>`;
    }).join('');
    return `<span class="cx-conexiones" aria-label="${esEsq ? 'Bibliotecas conectadas' : 'Esquemas conectados'}">${chips}`
      + `<button type="button" class="cx-mas" data-cx-conectar="${esc(tipo + ':' + id)}" title="${esEsq ? 'Conectar con una biblioteca… (ahí van, por ejemplo, los fragmentos de su guion)' : 'Conectar con un esquema…'}" aria-label="${esEsq ? 'Conectar con una biblioteca' : 'Conectar con un esquema'}">${ic('link', 13)}${xs.length ? '' : '<span>Conectar</span>'}</button></span>`;
  }
  /* un clic en un chip de conexión, en su × o en «Conectar», y en la etiqueta de un fragmento: en captura, antes que las tarjetas
     (la etiqueta va dentro de una) y en cualquier sitio (también en la cabecera del esquema, que pinta app.js, y en la ventana) */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cx-ir], [data-cx-quitar], [data-cx-conectar], [data-gd-fragmento]'); if (!b || !d) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.gdFragmento) { const id = b.dataset.gdFragmento; if (ladoId) { guardarLadoYa(); cerrarLado(); } if (o.irAFragmento) o.irAFragmento(id); return; }
    if (b.dataset.cxConectar) { const [t, id] = b.dataset.cxConectar.split(/:(.*)/s); menuConectar(b, t, id); return; }
    if (b.dataset.cxQuitar) { cerrarPop(); const [eid, sid] = b.dataset.cxQuitar.split('|'); alternarConexion(eid, sid); return; }
    cerrarPop();
    const [t, id] = b.dataset.cxIr.split(/:(.*)/s);
    if (t === 'esquema') abrirEsquema(id); else abrirSub(id);
  }, true);
  /* la nota de un botón: su tarjeta, o la ventana de la nota (que no lleva `data-nota`: el tablero de tramas lo oye) */
  const notaDeBoton = t => t.dataset.notaId || ((t.closest('[data-nota]') || {}).dataset || {}).nota;
  const MENUS = {
    /* el filtro general de la biblioteca: el color y el orden de las notas de todos sus segmentos (1.1.54) */
    colorBib: () => {
      if (!actual || actual.tipo !== 'sub') return null;
      const k = claveFiltroBib(actual.id);
      return menuColores('Solo las notas de color', d.notasDe(actual.id), filtroDe(k).color || null, t => ponerFiltro(k, { color: t || undefined }));
    },
    ordenBib: () => {
      if (!actual || actual.tipo !== 'sub') return null;
      const k = claveFiltroBib(actual.id), g = filtroDe(k);
      return menuOrden('Ordenar las notas de todos los segmentos', [['manual', 'Cada segmento, el suyo (manual o el que tenga)'], ...C.busqueda.ORDENES], g.orden || 'manual', o2 => ponerFiltro(k, { orden: o2 === 'manual' ? undefined : o2 }));
    },
    /* el de un segmento expandido (se guarda en él; «Como la biblioteca», lo del filtro general) */
    colorSeg: () => {
      const x = expandido && datosSegmento(d, expandido.subId, expandido.clave); if (!x || !x.notas) return null;
      const k = claveFiltroSeg(expandido.subId, expandido.clave), propio = filtroDe(k), g = filtroDe(claveFiltroBib(expandido.subId));
      return menuColores('Solo las notas del segmento de color', x.notas, filtroPara(expandido.subId, expandido.clave, true).color, t => ponerFiltro(k, { color: t || (g.color ? '' : undefined) }),
        g.color ? { texto: 'Como la biblioteca: ' + nombreColor(g.color).toLowerCase(), on: propio.color === undefined, fn: () => ponerFiltro(k, { color: undefined }) } : null);
    },
    ordenSeg: () => {
      if (!expandido) return null;
      const x = expandido, k = claveFiltroSeg(x.subId, x.clave), propio = filtroDe(k), g = filtroDe(claveFiltroBib(x.subId)), f = filtroPara(x.subId, x.clave, true);
      const fr = frag(titulo('Ordenar las notas del segmento'));
      if (g.orden && g.orden !== 'manual') fr.appendChild(opcion('Como la biblioteca: ' + rotuloOrden(g.orden).toLowerCase(), () => ponerFiltro(k, { orden: undefined }), { clase: propio.orden === undefined ? 'on' : '' }));
      C.busqueda.ORDENES_SEG.forEach(([o2, t]) => fr.appendChild(opcion(t, () => ponerFiltro(k, { orden: o2 === 'manual' && !(g.orden && g.orden !== 'manual') ? undefined : o2 }),
        { clase: propio.orden !== undefined || !(g.orden && g.orden !== 'manual') ? (f.orden === o2 ? 'on' : '') : '' })));
      return fr;
    },
    grupo: t => {
      const gid = t.dataset.grupoId, r = d.grupo(gid); if (!r) return null;
      const n = r.grupo.items.length;
      /* lo que se cree entra en el grupo (Leo, 16-09-2026): esquemas y bibliotecas, y en Personajes, personajes */
      const crear = r.ambito === C.ELENCO_CARPETAS
        ? [opcion('Nuevo personaje…', () => nuevoPersonajeEn(r.grupo.carpetaId || null, gid))]
        : r.ambito === C.ID_ESQUEMAS_PERSONAJE
          ? [opcion('Nuevo esquema…', () => { if (o.nuevoEsquemaPersonaje) o.nuevoEsquemaPersonaje(t, r.grupo.carpetaId || null, gid); })]
          : [opcion('Nuevo esquema…', () => nuevoHijo(r.ambito, 'esquema', r.grupo.carpetaId || null, gid)),
             opcion('Nueva biblioteca…', () => nuevoHijo(r.ambito, 'sub', r.grupo.carpetaId || null, gid)),
             ...(d.crearLienzo ? [opcion('Nuevo lienzo…', () => nuevoLienzo(r.ambito, r.grupo.carpetaId || null, gid))] : [])];
      crear.push(opcion('Nuevo grupo dentro…', () => nuevoGrupo(r.ambito, { padreId: gid, carpetaId: r.grupo.carpetaId || null })));
      return frag(
        titulo(r.grupo.nombre + ' · ' + (n === 1 ? '1 elemento' : n + ' elementos')),
        ...crear,
        separador(),
        opcion('Renombrar', () => renombrarGrupo(gid)),
        opcion('Cambiar color', () => abrirPop(t, paletaGrupo(gid))),
        ...conEnlace({ tipo: 'grupo', id: gid }),
        separador(),
        opcion('Deshacer el grupo', () => tras(d.deshacerGrupo(gid)), { clase: 'peligro' }));
    },
    /* clic derecho en un esquema o unos documentos: eliminar su enlace, o enlazarlo con uno suelto de su contenedor */
    enlazar: t => { const s = desclave((t.closest('.gd-sub') || {}).dataset?.sub); return s ? menuEnlazar(s) : null; },
    contenedor: t => {
      const fila = t.closest('.gd-cont'), cid = t.dataset.gdCid || (fila && fila.dataset.id);
      /* los dos contenedores de Personajes (Leo, 16-09-2026): no se renombran, ni se fijan, ni se eliminan */
      if (cid === C.ID_PERSONAJES) return frag(
        opcion('Nuevo personaje…', () => nuevoPersonajeEn(null)),
        opcion('Nueva carpeta…', () => nuevaCarpeta(C.ELENCO_CARPETAS, null)),
        opcion('Nuevo grupo…', () => nuevoGrupo(C.ELENCO_CARPETAS)));
      if (cid === C.ID_ESQUEMAS_PERSONAJE) return frag(
        opcion('Nuevo esquema…', () => { if (o.nuevoEsquemaPersonaje) o.nuevoEsquemaPersonaje(t, null); }),
        opcion('Nueva carpeta…', () => { d.esquemasPersonajes(true); nuevaCarpeta(cid, null); }),
        opcion('Nuevo grupo…', () => { d.esquemasPersonajes(true); nuevoGrupo(cid); }));
      const c = d.contenedor(cid); if (!c) return null;
      return frag(
        opcion('Nuevo esquema…', () => nuevoEsquema(c.id)),
        opcion('Nueva biblioteca…', () => nuevoSub(c.id)),
        ...(d.crearLienzo ? [opcion('Nuevo lienzo…', () => nuevoLienzo(c.id))] : []),   // 1.1.58
        opcion('Nueva carpeta…', () => nuevaCarpeta(c.id, null)),
        opcion('Nuevo grupo…', () => nuevoGrupo(c.id)),
        separador(),
        opcion('Renombrar', () => renombrarContenedor(c.id)),
        opcion(c.fijado ? 'Quitar de fijados' : 'Fijar', () => tras(d.fijarContenedor(c.id, !c.fijado))),
        ...conEnlace({ tipo: 'contenedor', id: c.id }),
        separador(),
        opcion('Eliminar contenedor', async () => {
          const ne = c.esquemas.length, nb = d.subsDe(c.id).length;
          if (await o.confirmar('¿Eliminar «' + c.nombre + '»?' + (ne + nb ? ' Sus esquemas y bibliotecas van a la papelera, de donde se pueden restaurar.' : ''), 'Eliminar')) {
            if (d.notasContenedor(c.id).some(x => x.id === notaAbierta)) cerrarNota();
            if (o.volcar) o.volcar();
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
        ...(r.contenedor ? [opcion('Nuevo esquema…', () => nuevoHijo(r.contenedor.id, 'esquema', id)), opcion('Nueva biblioteca…', () => nuevoHijo(r.contenedor.id, 'sub', id)),
            ...(d.crearLienzo && r.contenedor.id !== C.ID_ESQUEMAS_PERSONAJE ? [opcion('Nuevo lienzo…', () => nuevoLienzo(r.contenedor.id, id))] : [])]
          : [opcion('Nuevo personaje…', () => nuevoPersonajeEn(id))]),
        opcion('Nuevo grupo…', () => nuevoGrupo(r.ambito, { carpetaId: id })),
        separador(),
        opcion('Renombrar', () => renombrarCarpeta(id)),
        opcion('Cambiar color', () => abrirPop(t, paletaCarpeta(id))),
        opcion('Mover a…', () => abrirPop(t, menuMoverCarpetaDe(id))),
        ...conEnlace({ tipo: 'carpeta', id }),
        separador(),
        opcion('Eliminar carpeta', () => eliminarCarpeta(id), { clase: 'peligro' }));
    },
    papelera: () => frag(...enPestana({ tipo: 'papelera' }), separador(), opcion('Vaciar papelera', vaciarPapelera, { clase: 'peligro' })),
    personaje: t => {
      const id = t.closest('[data-personaje]').dataset.personaje;
      return frag(
        opcion('Abrir', () => o.abrirPersonaje && o.abrirPersonaje(id)),
        ...enPestana({ tipo: 'personaje', id }),
        ...conEnlace({ tipo: 'personaje', id }),
        ...anadirAlLienzoOpcion(t, 'personaje', id),
        separador(),
        opcion('Renombrar', () => renombrarPersonaje(id)),
        opcion('Cambiar color', () => abrirPop(t, paletaPersonaje(id))),
        opcion('Mover a carpeta…', () => abrirPop(t, menuMoverCarpeta('personaje', id, C.ELENCO_CARPETAS, (d.personaje(id) || {}).carpetaId || null))),
        ...(d.grupoDe(id) ? [opcion('Sacar del grupo', () => tras(d.quitarEnlace(id)))] : [opcion('Agrupar con…', () => abrirPop(t, menuAgruparPersonaje(id)))]),
        separador(),
        opcion('Mover a la papelera', () => o.eliminarPersonaje && o.eliminarPersonaje(id), { clase: 'peligro' }));
    },
    paleta: t => paleta(null, null, t.dataset.seccionId || null),
    /* el ⋯ de una sección de la biblioteca (las que crea Leo): renombrar y eliminar */
    seccion: t => {
      const id = t.dataset.seccionId, k = d.seccion(id); if (!k) return null;
      return frag(
        opcion('Renombrar', () => renombrarSeccion(id)),
        opcion('Nuevo segmento', () => abrirPop(t, paleta(null, k.sub.id, id))),
        ...conEnlace({ tipo: 'seccion', biblioteca: k.sub.id, id }),
        separador(),
        opcion('Eliminar sección', () => eliminarSeccion(id), { clase: 'peligro' }));
    },
    etiqueta: t => {
      const e = d.etiqueta(t.closest('[data-etq]').dataset.etq); if (!e) return null;
      return frag(
        ...enPestana({ tipo: 'segmento', id: e.subId, clave: 'etq:' + e.id }),
        ...conEnlace({ tipo: 'segmento', biblioteca: e.subId, id: e.id }),
        ...anadirAlLienzoOpcion(t, 'segmento', e.id, { subId: e.subId, etiquetaId: e.id }),
        separador(),
        opcion('Renombrar', () => renombrarEtiqueta(e.id)),
        opcion('Cambiar color', () => abrirPop(t, paleta(e.id))),
        opcion('Mover a la izquierda', () => tras(d.moverEtiqueta(e.id, -1))),
        opcion('Mover a la derecha', () => tras(d.moverEtiqueta(e.id, 1))),
        ...(d.seccionesDe(e.subId).length ? [opcion('Mover a sección…', () => abrirPop(t, menuSecciones(e)))] : []),
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
        ...conEnlace({ tipo: 'nodo', esquema: eid, id }),
        separador(),
        opcion('Eliminar nodo…', () => eliminarNodo(eid, id), { clase: 'peligro' }));
    },
    mover: t => { const id = notaDeBoton(t), n = id && d.nota(id); if (!n) return null; return menuDestinos('Mover a…', eid => tras(d.moverNota(id, eid)), n.etiquetaId, n.subId); },
    pieza: t => {
      const id = t.closest('[data-pieza]').dataset.pieza, x = d.piezaEnPapelera(id); if (!x) return null;
      const nombre = x.tipo === 'lienzo' ? x.lienzo.nombre : C.nombreEnPapelera(x);
      return frag(
        opcion('Restaurar' + (x.tipo === 'personaje' ? ' en Personajes' : x.origenNombre ? ' en «' + x.origenNombre + '»' : ''), () => restaurarPieza(id)),
        separador(),
        opcion('Eliminar del todo', async () => { if (await o.confirmar('¿Eliminar «' + nombre + '» del todo, con todo lo que tiene dentro? No se puede deshacer.', 'Eliminar')) tras(d.eliminarDefinitivo(id)); }, { clase: 'peligro' }));
    },
    nota: t => {
      const id = notaDeBoton(t); if (!id) return null;
      const enVentana = !!(capa && capa.contains(t));             // el ⋯ de la ventana: renombrar es su nombre, arriba
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
        ...enPestana({ tipo: 'nota', id }),
        ...conEnlace({ tipo: 'nota', id }),
        opcion('Renombrar', () => renombrarNota(id, t.closest('[data-nota]'))),
        opcion('Exportar…', () => { if (C.exportar) C.exportar.menu(t, () => ({ titulo: n.titulo, html: (d.nota(id) || n).html }), o.avisar); }),
        opcion('Color…', () => abrirPop(t, paletaNota(id))),
        separador(),
        opcion('Mover a la papelera', () => tirarNota(id), { clase: 'peligro' }));
      return frag(
        opcion(esFormula(n) ? 'Abrir la fórmula' : 'Abrir documento', () => abrirNota(id)),
        ...enPestana({ tipo: 'nota', id }),
        ...conEnlace({ tipo: 'nota', id }),
        ...(esPlantilla(n) || esFormula(n) ? [] : anadirAlLienzoOpcion(t, 'nota', id)),
        opcion('Renombrar', () => { if (enVentana) { const x = tituloLado(); x.focus(); x.select(); } else renombrarNota(id, t.closest('[data-nota]')); }),
        opcion('Exportar…', () => { if (enVentana) guardarLadoYa(); if (C.exportar) C.exportar.menu(t, () => ({ titulo: (d.nota(id) || n).titulo, html: (d.nota(id) || n).html }), o.avisar); }),
        opcion('Color…', () => abrirPop(t, paletaNota(id))),
        opcion('Mover a…', () => abrirPop(t, MENUS.mover(t))),
        /* una plantilla: una nota nueva desde ella; cualquier otra, una copia como plantilla (1.1.56, de ClapBook) y su texto como
           fórmula (1.1.60); una fórmula, nada de eso */
        ...(esFormula(n) ? [] : [separador(), esPlantilla(n) ? opcion('Nueva nota con esta plantilla', () => { if (enVentana) guardarLadoYa(); desdePlantilla(id); })
          : opcion('Guardar como plantilla…', () => abrirPop(t, menuGuardarPlantilla(id)))]),
        ...(esPlantilla(n) || esFormula(n) ? [] : [opcion('Guardar como fórmula…', () => abrirPop(t, menuGuardarFormula(id)))]),
        separador(),
        opcion('Mover a la papelera', () => tirarNota(id), { clase: 'peligro' }));
    },
    /* el ⋯ de «Plantillas», al pie del menú: crear, y abrirla en otra pestaña o copiar su enlace (no se renombra, ni se mueve, ni
       se duplica, ni se tira) */
    plantillas: t => {
      const hay = d.bibliotecaPlantillas && d.bibliotecaPlantillas();
      return frag(
        opcion('Nueva plantilla', () => { const r = asegurarPlantillas(); if (r) nuevaNota(r.sub.id, null); }),
        opcion('Nuevo segmento', () => { const r = asegurarPlantillas(); if (r) abrirPop(t, paleta(null, r.sub.id)); }),
        ...(hay ? [separador(), ...enPestana({ tipo: 'sub', id: hay.sub.id }), ...conEnlace({ tipo: 'biblioteca', id: hay.sub.id })] : []));
    },
    /* el ⋯ de «Fórmulas» (1.1.60), como el de las plantillas */
    formulas: t => {
      const hay = d.bibliotecaFormulas && d.bibliotecaFormulas();
      return frag(
        opcion('Nueva fórmula', () => { const r = asegurarFormulas(); if (r) nuevaNota(r.sub.id, null); }),
        opcion('Nuevo segmento', () => { const r = asegurarFormulas(); if (r) abrirPop(t, paleta(null, r.sub.id)); }),
        ...(hay ? [separador(), ...enPestana({ tipo: 'sub', id: hay.sub.id }), ...conEnlace({ tipo: 'biblioteca', id: hay.sub.id })] : []));
    }
  };

  /* ---------- acciones ---------- */
  function abrirEsquema(eid) { if (eid && !d.esquema(eid)) return; if (o.abrirEsquema) o.abrirEsquema(eid || null); }

  /* ---------- lienzos de nodos (1.1.58) ----------
     Leo, 27-09-2026: «un lienzo con nodos donde se conecten notas, notas con imágenes y esquemas» (como los «Space» de Dreamina). Un
     lienzo es una pieza más del árbol, como un esquema: fila con su «L», su ⋯ (abrir, en pestaña, enlace, renombrar, duplicar,
     carpeta, color, grupo, papelera con «Deshacer»), doble clic renombra y se arrastra igual. Lo abre app.js (`o.abrirLienzo`: la
     vista «lienzo», con js/claquedraw/lienzo.js). Lo que puede ser una entrada del lienzo —un esquema, una biblioteca o un
     personaje del árbol— se suelta en el lienzo abierto arrastrándolo (el árbol está siempre a su lado); las notas y los segmentos
     viven en la biblioteca, que no se ve a la vez que el lienzo, así que llevan «Añadir al lienzo…» en su ⋯ (y el árbol también). */
  const lienzoDe = id => (id && d && d.lienzo ? d.lienzo(id) : null);
  function abrirLienzo(lid) { if (!lienzoDe(lid)) return; if (o.abrirLienzo) o.abrirLienzo(lid); }
  function eliminarLienzo(lid) {
    if (!lienzoDe(lid) || !d.eliminarLienzo) return;
    if (o.volcar) o.volcar();                                // lo último del lienzo abierto, a sus datos: lo tirado lo lleva
    if (conDeshacer(d.eliminarLienzo(lid), () => restaurarPieza(lid)) && o.lienzoEliminado) o.lienzoEliminado(lid);
  }
  /* «Nuevo lienzo…» del ⋯ de un contenedor, de una carpeta o de un grupo: el diálogo del nombre y, creado, se abre */
  async function nuevoLienzo(cid, carpetaId, grupoId) {
    const c = d && d.contenedor(cid); if (!c || !d.crearLienzo) return null;
    const k = carpetaId && d.carpeta(carpetaId), g = grupoId && d.grupo(grupoId);
    const r0 = await pedirNombre({ ceja: 'Nuevo lienzo en «' + (g ? g.grupo.nombre : k ? k.carpeta.nombre : c.nombre) + '»', titulo: 'Crear lienzo',
      pista: 'Por ejemplo, Del esquema a los fragmentos', boton: 'Crear' });
    if (!r0) return null;
    if (!r0.nombre.trim()) { if (o.avisar) o.avisar('Escribe un nombre para el lienzo'); return null; }
    return crearLienzoEn(cid, r0.nombre, k ? carpetaId : null, g ? grupoId : null);
  }
  /* crea el lienzo (en su carpeta y su grupo, si los hay), despliega lo que lo tapa y lo abre */
  function crearLienzoEn(cid, nombre, carpetaId, grupoId) {
    const c = d && d.contenedor(cid); if (!c || !d.crearLienzo) return null;
    const k = carpetaId && d.carpeta(carpetaId), g = grupoId && d.grupo(grupoId);
    const r = d.crearLienzo(cid, nombre, { carpetaId: k ? carpetaId : null, grupoId: g ? grupoId : null });
    if (!r.ok) { tras(r); return null; }
    if (k) d.plegarCarpeta(carpetaId, false);
    if (c.plegado) d.plegarContenedor(cid, false);
    tras(r);
    abrirLienzo(r.lienzo.id);
    return r.lienzo;
  }
  /* **«Añadir al lienzo…»**: la lista de los lienzos del proyecto (por contenedor) y «Nuevo lienzo…»; lo elegido entra en ese
     lienzo como un nodo de entrada (app.js, `o.anadirAlLienzo`, que lo pone sin abrirlo y avisa con «Abrir»). `tipo`: 'nota',
     'segmento', 'biblioteca', 'esquema' o 'personaje'; `datos`, los del nodo ({ notaId }, { subId, etiquetaId }…). */
  function todosLosLienzos() {
    if (!d) return [];
    return d.datos.contenedores.filter(c => !c.oculto && !c.especial && (c.lienzos || []).length).map(c => ({ c, lienzos: c.lienzos }));
  }
  function menuAnadirAlLienzo(trigger, tipo, datos, cidNuevo) {
    const f = frag(titulo('Añadir al lienzo…'));
    const grupos = todosLosLienzos(), montado = o.lienzoMontado && o.lienzoMontado();
    if (!grupos.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'Aún no hay lienzos en el proyecto' }));
    grupos.forEach(({ c, lienzos }) => {
      if (grupos.length > 1) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-sub', textContent: c.nombre }));
      lienzos.forEach(l => f.appendChild(opcion(l.nombre, () => { if (o.anadirAlLienzo) o.anadirAlLienzo(l.id, tipo, datos); },
        { punto: puntoPieza(l.id), clase: l.id === montado ? 'on' : '' })));
    });
    const cid = cidNuevo || (grupos[0] && grupos[0].c.id) || ((d.datos.contenedores.find(c => !c.oculto && !c.especial) || {}).id);
    if (cid) {
      f.appendChild(separador());
      f.appendChild(opcion('Nuevo lienzo…', async () => {
        const l = await nuevoLienzo(cid); if (l && o.anadirAlLienzo) o.anadirAlLienzo(l.id, tipo, datos, { yaAbierto: true });
      }));
    }
    return f;
  }
  /* la opción, para los ⋯ (sin lienzos ni modo de crearlos, no sale) */
  function anadirAlLienzoOpcion(t, tipo, id, extra) {
    if (!d || !d.crearLienzo || !o.anadirAlLienzo) return [];
    const datos = tipo === 'nota' ? { notaId: id } : tipo === 'biblioteca' ? { subId: id } : tipo === 'esquema' ? { eid: id }
      : tipo === 'personaje' ? { personajeId: id } : tipo === 'segmento' ? { subId: extra.subId, etiquetaId: extra.etiquetaId || null } : null;
    if (!datos) return [];
    const r = tipo === 'esquema' ? d.esquema(id) : tipo === 'biblioteca' ? d.sub(id) : tipo === 'nota' ? d.sub((d.nota(id) || {}).subId) : tipo === 'segmento' ? d.sub(extra.subId) : null;
    const cid = r && r.contenedor && !r.contenedor.oculto && !r.contenedor.especial ? r.contenedor.id : null;
    return [opcion('Añadir al lienzo…', () => abrirPop(t, menuAnadirAlLienzo(t, tipo, datos, cid)))];
  }
  /* Subir o bajar un hijo dentro de su contenedor. */
  function renombrarHijo(s, t) {
    const fila = t && (t.classList && t.classList.contains('gd-sub') ? t : t.closest('.gd-sub'));
    const el = fila && fila.querySelector('.gd-sub-nom'); if (!el) return;
    const actualNombre = s.tipo === 'esquema' ? (d.esquema(s.id) || {}).esquema : s.tipo === 'lienzo' ? (lienzoDe(s.id) || {}).lienzo : (d.sub(s.id) || {}).sub; if (!actualNombre) return;
    editarEnSitio(el, actualNombre.nombre, v => {
      if (v === null || !v.trim()) { render(); return; }
      if (tras(s.tipo === 'esquema' ? d.renombrarEsquema(s.id, v) : s.tipo === 'lienzo' ? d.renombrarLienzo(s.id, v) : d.renombrarSub(s.id, v)) && s.tipo === 'lienzo' && o.lienzoRenombrado) o.lienzoRenombrado(s.id);
    });
  }
  /* A la papelera enteros, sin preguntar: desde ahí se restauran (Leo, 18-09-2026). El esquema montado y lo abierto en el
     editor se guardan antes, para que lo tirado lleve lo último. */
  function eliminarEsquema(eid) {
    if (!d.esquema(eid)) return;
    if (o.volcar) o.volcar();
    if (conDeshacer(d.eliminarEsquema(eid), () => restaurarPieza(eid)) && o.esquemaEliminado) o.esquemaEliminado(eid);
  }
  function eliminarSub(id) {
    const r = d.sub(id); if (!r) return;
    if (d.notasDe(id).some(x => x.id === notaAbierta)) cerrarNota();
    if (actual && actual.id === id) actual = null;
    conDeshacer(d.eliminarSub(id), () => restaurarPieza(id));
  }
  /* Una nota nueva se abre en su ventana con el nombre propuesto elegido, para escribir encima (1.1.54, de ClapBook: «agregué
     una nota cuando estaba abierto el panel lateral y se cerró»); en blanco se queda «Sin título». Va arriba de su segmento,
     bajo «＋ nota», o al final con `op.alFinal` (el «＋» de la ventana, en la última nota). Con un filtro de color en ese segmento,
     nace de ese color (si no, no se vería), y lo que se estuviera buscando se olvida. Con una nota en el editor, el editor se
     cierra: la nueva se crearía detrás de él. */
  function nuevaNota(subId, eid, op) {
    op = op || {};
    const x = d.sub(subId); if (!x) return;
    const primera = d.notasDe(subId, eid || null)[0];
    const r = d.crearNota(subId, eid);
    if (r.ok && primera && !op.alFinal) d.moverNota(r.nota.id, eid || null, subId, primera.id);   // la nueva va arriba, bajo «＋ nota»
    if (r.ok && !d.esGuiones(subId)) {
      const k = eid ? 'etq:' + eid : 'bandeja', enExp = !!expandido && expandido.subId === subId && expandido.clave === k;
      const f = filtroPara(subId, k, enExp);
      if (f.color && f.color !== 'sin') d.colorearNota(r.nota.id, f.color);
      olvidarBusqueda();
    }
    if (!r.ok) { tras(r); return; }
    const s = ref('sub', x.contenedor.id, subId);
    if (!mismo(actual, s) || notaAbierta) navegar(s);
    if (notaAbierta) cerrarNota();                                 // ya redibuja
    tras(r);
    irAlTablero();
    notaSel = r.nota.id; marcarElegida(r.nota.id, true);
    mostrarLado(r.nota.id, { enfocarTitulo: true });
  }
  /* ---------- plantillas de nota (1.1.56, de ClapBook: «Agrega la funcionalidad, junto con su lugar especial en el menú, de
     plantillas de Clapbook a Clapcraft») ----------
     Viven en su biblioteca especial (documentos.js), fuera del árbol: se abre con «Plantillas» al pie del menú y su tablero es el
     de una biblioteca más (bandeja, segmentos, secciones, buscar, filtrar, ordenar, la ventana de la nota) con su aviso y «Usar»
     en cada una. «Guardar como plantilla…» (⋯ de una nota, o soltarla sobre «Plantillas») copia ahí una nota; «Desde plantilla»
     (la cabecera de una biblioteca), Cmd+Alt+N (app.js) y «Usar» crean una nota con sus variables rellenas (plantillas.js) en la
     biblioteca de ahora —nunca en la de las plantillas— y la abren en su ventana con el cursor donde decía {{cursor}}. */
  const PL = () => C.plantillas || {};
  const conVariables = t => (PL().tieneVariables ? PL().tieneVariables(t) : /\{\{[^}]+\}\}/.test(String(t || '')));
  const conTitulo = html => (PL().usaTitulo ? PL().usaTitulo(html) : /\{\{\s*(t[ií]tulo|title)\s*\}\}/iu.test(String(html || '')));
  /* una biblioteca donde puede nacer una nota: de las del árbol (o de un personaje), no la de las plantillas ni la oculta de un guion */
  function subNormal(id) { const r = id && d && d.sub(id); return !!(r && !especial(id) && !r.sub.guionEid); }
  /* adónde va una nota que sale de una plantilla: la pedida, la de delante, la última normal que se vio o la primera del árbol */
  function bibliotecaDestino(op) {
    if (subNormal(op.subId)) return op.subId;
    if (actual && actual.tipo === 'sub' && subNormal(actual.id)) return actual.id;
    if (subNormal(ultimaNormal)) return ultimaNormal;
    const b = d.todasLasBibliotecas ? d.todasLasBibliotecas()[0] : null;
    return b ? b.sub.id : null;
  }
  /* la biblioteca de las plantillas (se crea la primera vez que hace falta, y entonces se guarda) */
  function asegurarPlantillas() {
    const m = modelo(); if (!m || !m.asegurarPlantillas) return null;
    const nueva = !(m.bibliotecaPlantillas && m.bibliotecaPlantillas()), r = m.asegurarPlantillas();
    if (!r || !r.sub) return null;
    if (nueva && o.guardar) o.guardar();
    return r;
  }
  function abrirPlantillas() {
    const r = asegurarPlantillas(); if (!r) return;
    expandido = null; notaAntes = null;
    navegar(ref('sub', r.contenedor.id, r.sub.id));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* un menú suelto: junto a `ancla` o, sin ella (un atajo, el menú de la app, «/plantilla» en el editor), centrado arriba del lienzo */
  function abrirPopEn(ancla, nodo) {
    if (!nodo) return;
    if (ancla && ancla.getBoundingClientRect) { abrirPop(ancla, nodo); return; }
    const z = main && main.offsetParent !== null ? main.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth };
    const cx = z.left + z.width / 2, y = z.top + 56;
    abrirPop({ getBoundingClientRect: () => ({ left: cx, right: cx, top: y, bottom: y, width: 0, height: 0 }) }, nodo);
    if (abierto) abierto.style.left = Math.max(8, Math.min(innerWidth - abierto.offsetWidth - 8, cx - abierto.offsetWidth / 2)) + 'px';
  }
  /* Elegir una plantilla: la lista (con el color de su segmento y su nombre a la derecha), un campo para buscar entre ellas si
     son muchas (con las flechas y Enter) y «Administrar plantillas…». Sin ninguna, cómo se guarda una. */
  function elegirPlantilla(tituloTexto, fn, ancla) {
    const m = modelo(); if (!m) return;
    const ps = m.plantillas ? m.plantillas() : [];
    const f = frag(titulo(tituloTexto || 'Elegir una plantilla'));
    if (!ps.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'Aún no hay plantillas. Guarda una nota como plantilla con su menú ⋯ («Guardar como plantilla…») o suéltala sobre «Plantillas», al pie del menú.' }));
    const lista = document.createElement('div'); lista.className = 'gd-pop-lista';
    ps.forEach(p => {
      const e = p.etiquetaId && m.etiqueta(p.etiquetaId);
      const b = opcion(p.titulo || 'Sin título', () => fn(p.id), { punto: e ? colores(e.color)[0] : 'var(--hover-fuerte)', atajo: e ? e.nombre : '' });
      b.dataset.plTitulo = p.titulo || '';
      lista.appendChild(b);
    });
    let campo = null;
    if (ps.length > 6) {
      campo = document.createElement('input');
      campo.type = 'search'; campo.className = 'gd-pop-buscar'; campo.placeholder = 'Buscar una plantilla'; campo.setAttribute('aria-label', 'Buscar una plantilla');
      const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      campo.addEventListener('input', () => { const q = norm(campo.value); $$('button', lista).forEach(b => { b.hidden = !!q && !norm(b.dataset.plTitulo).includes(q); }); });
      campo.addEventListener('keydown', e => {
        const vis = $$('button', lista).filter(b => !b.hidden);
        if (e.key === 'Enter') { e.preventDefault(); if (vis[0]) vis[0].click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (vis[0]) vis[0].focus(); }
      });
      f.appendChild(campo);
    }
    /* las flechas pasan de una a otra (y, arriba del todo, al campo) */
    lista.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const vis = $$('button', lista).filter(b => !b.hidden), i = vis.indexOf(document.activeElement);
      const sig = vis[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (sig) sig.focus(); else if (e.key === 'ArrowUp' && campo) campo.focus();
    });
    if (ps.length) f.appendChild(lista);
    f.appendChild(separador());
    f.appendChild(opcion('Administrar plantillas…', () => abrirPlantillas()));
    abrirPopEn(ancla, f);
    if (campo && abierto) campo.focus({ preventScroll: true });
  }
  /* Una nota nueva desde la plantilla `pid` (sin ella, se elige antes). `op`: { subId, etiquetaId, ancla }. Si su texto lleva
     {{titulo}} y su nombre no lleva variables, se pregunta el nombre antes de crearla. Se abre en su ventana con el cursor donde
     decía {{cursor}} (sin él, al final del texto); si no tiene nombre (se queda «Sin título»), con el nombre elegido para
     escribir encima (y, con {{cursor}}, Enter en el nombre lleva allí). */
  async function desdePlantilla(pid, op) {
    op = op || {};
    const m = modelo(); if (!m) return;
    if (!pid) { elegirPlantilla('Nueva nota desde plantilla', id => desdePlantilla(id, op), op.ancla); return; }
    const p = m.nota(pid);
    if (!p || !esPlantilla(p)) { if (o.avisar) o.avisar('Esa plantilla ya no existe'); return; }
    if (!m.crearDesdePlantilla) return;
    const subId = bibliotecaDestino(op);
    if (!subId) { if (o.avisar) o.avisar('Crea antes una biblioteca con el «＋» de un contenedor'); return; }
    if (ladoId) guardarLadoYa();
    if (notaAbierta && o.texto.volcar) o.texto.volcar();
    const variables = conVariables(p.titulo);
    let nombre = null;
    if (!variables && conTitulo(p.html)) {                     // el texto lleva el nombre: se pide antes
      const r0 = await pedirNombre({ ceja: 'Nueva nota desde «' + (p.titulo || 'Sin título') + '»', titulo: 'Nombre de la nota', pista: 'Por ejemplo, ' + (p.titulo || 'Reunión') + ' de hoy', boton: 'Crear' });
      if (!r0 || !r0.nombre.trim()) return;
      nombre = r0.nombre.trim();
    }
    const x = d && d.sub(subId); if (!x) return;              // (pudo irse mientras se pedía el nombre)
    const r = d.crearDesdePlantilla(pid, subId, subId === op.subId ? op.etiquetaId || null : null,
      { titulo: nombre, proyecto: o.nombreProyecto ? o.nombreProyecto() : '', arriba: true });
    if (!r || !r.ok) { tras(r); return; }
    olvidarBusqueda();
    if (ladoId) cerrarLado();
    const s = ref('sub', x.contenedor.id, subId);
    if (!mismo(actual, s) || notaAbierta) navegar(s);
    if (notaAbierta) cerrarNota();                                 // la nueva se crearía detrás del editor
    if (o.guardar) o.guardar();
    render();
    irAlTablero();
    notaSel = r.nota.id; marcarElegida(r.nota.id, true);
    const sinNombre = !variables && !nombre;
    /* el nombre se elige solo si se quedó sin él («Sin título»): con uno ya puesto, lo siguiente que se teclease lo borraría;
       entonces el cursor va donde decía {{cursor}} o, si no lo dice, al final del texto */
    mostrarLado(r.nota.id, { enfocarTitulo: sinNombre, cursor: r.cursor || null, alFinal: !r.cursor });
    if (o.avisar) o.avisar('Nota creada desde «' + (p.titulo || 'Sin título') + '»');
  }
  /* «Guardar como plantilla…»: en la bandeja de las plantillas o en uno de sus segmentos; lo abierto de esa nota se vuelca antes */
  function menuGuardarPlantilla(id) {
    const n = d && d.nota(id); if (!n) return null;
    const r = d.bibliotecaPlantillas ? d.bibliotecaPlantillas() : null, f = frag(titulo('Guardar «' + (n.titulo || 'Sin título') + '» como plantilla en…'));
    const guardar = eid => {
      if (ladoId === id) guardarLadoYa();
      if (notaAbierta === id && o.texto.volcar) o.texto.volcar();
      const x = d.guardarComoPlantilla(id, eid);
      if (!x || !x.ok) { tras(x); return; }
      if (o.guardar) o.guardar();
      render();
      if (o.avisar) o.avisar(x.aviso || 'Guardada como plantilla', { texto: 'Ver', fn: () => abrirPlantillas() });
    };
    f.appendChild(opcion('Bandeja', () => guardar(null), { punto: 'var(--hover-fuerte)' }));
    if (r) d.etiquetasDe(r.sub.id).forEach(e => f.appendChild(opcion(e.nombre, () => guardar(e.id), { punto: colores(e.color)[0] })));
    return f;
  }
  function guardarComoPlantilla(id, ancla) {
    const m = modelo(), n = m && m.nota(id); if (!n || !m.guardarComoPlantilla) return;
    if (esPlantilla(n)) { if (o.avisar) o.avisar('Esta nota ya es una plantilla'); return; }
    abrirPopEn(ancla, menuGuardarPlantilla(id));
  }
  /* ---------- fórmulas (1.1.60) ----------
     Leo, 27-09-2026: «Agrega una sección en el menú (como Plantillas) que se llame "Fórmulas"… notas que solo tengan texto y sirvan
     como prompts reutilizables en los bloques del lienzo que llaman a la IA. Sería algo parecido a las skills». Su biblioteca especial
     (documentos.js) se abre con «Fórmulas» al pie del menú; su tablero es el de una biblioteca, con su aviso y «Nueva fórmula», y una
     fórmula se edita en su ventana como texto plano (no va al editor de guion). «Guardar como fórmula…» (⋯ de una nota, o soltarla
     sobre «Fórmulas») copia su texto; el lienzo (lienzo.js) las elige en cada operación y crea una desde lo escrito. */
  function asegurarFormulas() {
    const m = modelo(); if (!m || !m.asegurarFormulas) return null;
    const nueva = !(m.bibliotecaFormulas && m.bibliotecaFormulas()), r = m.asegurarFormulas();
    if (!r || !r.sub) return null;
    if (nueva && o.guardar) o.guardar();
    return r;
  }
  function abrirFormulas() {
    const r = asegurarFormulas(); if (!r) return;
    expandido = null; notaAntes = null;
    navegar(ref('sub', r.contenedor.id, r.sub.id));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* una biblioteca especial por su id: su tablero (las plantillas o las fórmulas) */
  function abrirEspecial(id) { if (cualEspecial(id) === 'formulas') abrirFormulas(); else abrirPlantillas(); }
  /* una fórmula, en su ventana encima de su tablero (desde el lienzo, un enlace o «Abrir») */
  function abrirFormula(id) {
    const m = modelo(), n = m && m.nota(id); if (!n || m.enPapelera(id) || !esFormula(n)) return false;
    const r = m.sub(n.subId); if (!r) return false;
    const s = ref('sub', r.contenedor.id, r.sub.id);
    if (!mismo(actual, s) || notaAbierta) { expandido = null; navegar(s); if (notaAbierta) cerrarNota(); else render(); }
    irAlTablero();
    notaSel = id; marcarElegida(id, true);
    mostrarLado(id);
    return true;
  }
  /* «Guardar como fórmula…»: su texto (sin formato) en la bandeja de las fórmulas o en uno de sus segmentos */
  function menuGuardarFormula(id) {
    const n = d && d.nota(id); if (!n) return null;
    const r = d.bibliotecaFormulas ? d.bibliotecaFormulas() : null, f = frag(titulo('Guardar el texto de «' + (n.titulo || 'Sin título') + '» como fórmula en…'));
    const guardar = eid => {
      if (ladoId === id) guardarLadoYa();
      if (notaAbierta === id && o.texto.volcar) o.texto.volcar();
      const x = d.guardarComoFormula ? d.guardarComoFormula(id, eid) : null;
      if (!x || !x.ok) { tras(x || { ok: false, aviso: 'No se pudo guardar como fórmula' }); return; }
      if (o.guardar) o.guardar();
      render();
      if (o.avisar) o.avisar(x.aviso || 'Guardada como fórmula', { texto: 'Ver', fn: () => { const k = x.nota && x.nota.id; if (k) abrirFormula(k); else abrirFormulas(); } });
    };
    f.appendChild(opcion('Bandeja', () => guardar(null), { punto: 'var(--hover-fuerte)' }));
    if (r) d.etiquetasDe(r.sub.id).forEach(e => f.appendChild(opcion(e.nombre, () => guardar(e.id), { punto: colores(e.color)[0] })));
    return f;
  }
  function guardarComoFormula(id, ancla) {
    const m = modelo(), n = m && m.nota(id); if (!n || !m.guardarComoFormula) return;
    if (esFormula(n)) { if (o.avisar) o.avisar('Esta nota ya es una fórmula'); return; }
    abrirPopEn(ancla, menuGuardarFormula(id));
  }
  /* una fórmula nueva con este texto (el lienzo: «Nueva fórmula desde lo escrito…»), en la bandeja o en el segmento `etiquetaId`;
     devuelve su id (o null). No abre nada: quien la pide decide. */
  function crearFormula(tituloF, textoF, etiquetaId) {
    const r = asegurarFormulas(); if (!r) return null;
    const x = d.crearNota(r.sub.id, etiquetaId || null, tituloF || 'Sin título', { arriba: true, texto: String(textoF || '') });
    if (!x || !x.ok) { tras(x); return null; }
    if (!x.nota.html && String(textoF || '').trim()) d.guardarNota(x.nota.id, { title: x.nota.titulo, html: htmlPlano(String(textoF).replace(/\r\n?/g, '\n').split('\n')), characters: {} });   // (sin `op.texto` en el modelo)
    if (o.guardar) o.guardar();
    render();
    return x.nota.id;
  }

  /* **Mover una nota a la papelera pregunta antes** (1.1.40, Leo: «cuando se elimine una nota de segmentos, que aparezca dialog
     modal de confirmación»); arrastrarla a la papelera no pregunta (es un gesto deliberado) y, como todo lo que se va a la
     papelera, el aviso lleva «Deshacer». */
  async function tirarNota(id, op) {
    const n = d.nota(id); if (!n) return;
    if (!(op && op.sinPreguntar) && !await o.confirmar('¿Mover «' + (n.titulo || 'Sin título') + '» a la papelera?', 'Mover')) return;
    if (ladoId === id) cerrarLado();
    if (notaAbierta === id) cerrarNota();
    if (notaSel === id) notaSel = null;
    conDeshacer(d.tirarNota(id), () => tras(d.restaurarNota(id)));
  }
  /* Lo que se va a la papelera se avisa con su «Deshacer» (1.1.40). */
  function conDeshacer(r, deshacer) {
    if (!r || !r.ok) return tras(r);
    if (o.guardar) o.guardar();
    render();
    if (o.avisar) o.avisar(r.aviso, { texto: 'Deshacer', fn: deshacer });
    return true;
  }
  async function vaciarPapelera() {
    const n = d.papelera().length; if (!n) { tras(d.vaciarPapelera()); return; }
    if (await o.confirmar('¿Vaciar la papelera? ' + (n === 1 ? 'Lo que hay en ella se elimina' : 'Sus ' + n + ' elementos se eliminan') + ' del todo.', 'Vaciar')) tras(d.vaciarPapelera());
  }
  /* devuelve un esquema, una biblioteca o un personaje de la papelera (la app vuelve a atar los carriles del esquema montado) */
  function restaurarPieza(id) {
    const r = d.restaurarPieza(id);
    if (!tras(r)) return;
    if (o.restaurado) o.restaurado(r);
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
    /* el nombre de un grupo se edita **dentro de su cabecera, que es un botón**: al escribir un espacio, el navegador
       activaba el botón, se abría su menú y el campo perdía el foco, así que el nombre volvía al de antes (Leo,
       16-09-2026). Mientras se edita, ese botón no recibe clics. */
    const boton = el.closest && el.closest('button');
    const tragar = e => { e.stopPropagation(); e.preventDefault(); };
    if (boton) boton.addEventListener('click', tragar, true);
    let hecho = false;
    const fin = v => { if (hecho) return; hecho = true; editando = false; if (boton) boton.removeEventListener('click', tragar, true); alFin(v); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fin(inp.value); } if (e.key === 'Escape') { e.preventDefault(); fin(null); } });
    inp.addEventListener('keyup', e => e.stopPropagation());
    inp.addEventListener('keypress', e => e.stopPropagation());
    inp.addEventListener('blur', () => fin(inp.value));        // un clic fuera guarda, como Enter; cancelar es Esc (Leo, 16-09-2026)
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('dblclick', e => e.stopPropagation());
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }
  function renombrarContenedor(id) {
    const c = d.contenedor(id); if (!c) return;
    const el = $(`.gd-cont[data-id="${CSS.escape(id)}"] [data-gd-nombre]`, lado); if (!el) return;
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
    const actual = op.actual && d.personaje(op.actual);
    if (op.alIr && actual) { f.appendChild(opcion('Ir a «' + actual.nombre + '»', op.alIr)); f.appendChild(separador()); }   // Leo: moverse al personaje desde su selector
    const lista = d.elenco().filter(p => !(op.salvo || []).includes(p.id));
    lista.forEach(p => f.appendChild(opcion(p.nombre, () => op.alElegir(p.id), { punto: colores(p.color)[0], clase: p.id === op.actual ? 'on' : '' })));
    if (!lista.length) f.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'No hay más personajes: créalos en el menú lateral o en el editor con «/»' }));
    if ((op.alQuitar && op.actual) || op.alEliminar) f.appendChild(separador());
    if (op.alQuitar && op.actual) f.appendChild(opcion('Quitar el personaje', op.alQuitar, { clase: 'peligro' }));
    if (op.alEliminar) f.appendChild(opcion('Eliminar el carril', op.alEliminar, { clase: 'peligro' }));   // Leo: los carriles no se podían quitar
    abrirPop(trigger, f);
  }
  /* Renombrar un personaje en su fila del menú (cambia su nombre en las notas y en los carriles). */
  function renombrarPersonaje(id) {
    const el = $(`[data-personaje="${CSS.escape(id)}"] .gd-per-nom`, lado); if (!el) return;
    const P = o.personajes && o.personajes(), l = P && P.lista.find(x => x.id === id); if (!l) return;
    editarEnSitio(el, l.nombre, v => { if (v !== null && v.trim() && v.trim() !== l.nombre && o.renombrarPersonaje) o.renombrarPersonaje(id, v.trim()); render(); });
  }
  /* ---------- secciones de una biblioteca (Leo, 16-09-2026) ---------- */
  function nuevaSeccion(subId) {
    const r = d.sub(subId); if (!r) return;
    const x = d.crearSeccion(subId, null);
    if (tras(x)) renombrarSeccion(x.seccion.id);
  }
  function renombrarSeccion(id) {
    const k = d.seccion(id); if (!k) return;
    const el = $(`.gd-bloque[data-seccion-id="${CSS.escape(id)}"] [data-gd-seccion-nombre]`, main); if (!el) return;
    editarEnSitio(el, k.seccion.nombre, v => { if (v !== null && v.trim()) tras(d.renombrarSeccion(id, v)); else render(); });
  }
  async function eliminarSeccion(id) {
    const k = d.seccion(id); if (!k) return;
    const n = d.etiquetasDe(k.sub.id, id).length;
    if (!n || await o.confirmar('¿Eliminar la sección «' + k.seccion.nombre + '»? Sus ' + n + (n === 1 ? ' segmento vuelve' : ' segmentos vuelven') + ' a Segmentos.', 'Eliminar')) tras(d.eliminarSeccion(id));
  }
  /* «Mover a sección…» de un segmento: la de partida y las creadas. */
  function menuSecciones(e) {
    const f = document.createDocumentFragment();
    f.appendChild(titulo('Mover «' + e.nombre + '» a…'));
    const ir = sid => { cerrarPop(); tras(d.cambiarSeccion(e.id, sid)); };
    const punto = on => ({ punto: on ? 'var(--foco)' : 'var(--hover-fuerte)' });
    f.appendChild(opcion('Segmentos', () => ir(null), punto(!e.seccionId)));
    d.seccionesDe(e.subId).forEach(k => f.appendChild(opcion(k.nombre, () => ir(k.id), punto(e.seccionId === k.id))));
    return f;
  }
  function renombrarEtiqueta(id) {
    const e = d.etiqueta(id); if (!e) return;
    const el = $(`[data-etq="${CSS.escape(id)}"] [data-gd-etq-nombre]`, main); if (!el) return;
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
  /* Los segmentos que no se ven se alcanzan acercando el puntero a un borde del tablero: se desplaza solo
     mientras el arrastre siga ahí. */
  const BORDE_AUTO = 70;
  /* (1.1.54, de ClapBook) no solo el tablero: también el cuerpo de una tarjeta (con más de cinco notas se desplaza él) y el lienzo de
     la biblioteca (las secciones de más abajo); vale el primer antepasado de lo arrastrado que se desplace hacia ese lado */
  function autodesplazar() {
    if (!pd || !pd.activo || pd.px === undefined) return;
    for (let car = pd.el && pd.el.parentElement; car && car !== document.body; car = car.parentElement) {
      if (!car.matches('.gd-etq-body, .gd-exp-grid, .gd-tablero, .gd-cuerpo') || car.scrollHeight <= car.clientHeight + 2) continue;
      const r = car.getBoundingClientRect();
      if (pd.px < r.left - 8 || pd.px > r.right + 8) continue;  // el puntero va por otra columna: no es este
      if (car.classList.contains('gd-etq-body')) {             // el cuerpo de una tarjeta, solo con el puntero en ella (su cabecera cuenta)
        const rc = (car.closest('.gd-etq') || car.parentElement).getBoundingClientRect();
        if (pd.py < rc.top || pd.py > rc.bottom || pd.px < rc.left || pd.px > rc.right) continue;
      }
      const borde = Math.min(BORDE_AUTO, r.height / 4);
      const a = pd.py - r.top, b = r.bottom - pd.py;
      if (a < -BORDE_AUTO || b < -BORDE_AUTO) continue;          // el puntero anda lejos de este: el de fuera
      const v = a < borde ? -Math.ceil((borde - Math.max(a, 0)) / 5) : b < borde ? Math.ceil((borde - Math.max(b, 0)) / 5) : 0;
      if (!v) continue;
      const antes = car.scrollTop;
      car.scrollTop += v;
      if (car.scrollTop !== antes) { moverArrastre({ clientX: pd.px, clientY: pd.py }); return; }   // lo que queda bajo el puntero cambió
    }
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
  /* El árbol se recoloca con una animación (Leo, 16-09-2026, mejorada): cada fila y cada grupo **viajan** de donde
     estaban a donde quedan; una caja que además **cambia de alto** (un grupo o una carpeta que gana o pierde algo) lo
     hace animando su altura, y entonces lo de dentro sí se anima por su cuenta (con la caja rígida no haría falta);
     lo que **llega nuevo** entra suave, y lo movido se marca un instante donde cae (`.gd-aterriza`). */
  const CLAVE_FILA = '.gd-sub, .gd-carpeta, .gd-per[data-personaje], .gd-arb-grupo, .gd-cont:not(.papelera)';
  const SUAVE = 'cubic-bezier(.2, .8, .2, 1)', DURA = 240;
  function animarArbol(mutar, destacado) {
    /* la clave es el id de la pieza (no el `data-sub` entero): así una que cambia de contenedor sigue siendo la misma
       y viaja en lugar de aparecer de nuevo */
    const clave = el => (el.dataset.sub ? (desclave(el.dataset.sub) || {}).id : null)
      || el.dataset.carpeta || el.dataset.grupo || el.dataset.personaje || el.dataset.id || '';
    const antes = new Map($$(CLAVE_FILA, lado).map(el => [clave(el), el.getBoundingClientRect()]));
    mutar();
    const ahora = $$(CLAVE_FILA, lado).map(el => ({ el, k: clave(el), r0: antes.get(clave(el)), r1: el.getBoundingClientRect() }));
    /* las cajas que cambian de tamaño no llevan a sus hijos con ellas: cada uno hace su propio viaje */
    const elasticas = new Set(ahora.filter(x => x.r0 && Math.abs(x.r0.height - x.r1.height) > 1).map(x => x.el));
    const rigidas = [];
    ahora.forEach(({ el, r0, r1 }) => {
      if (!r0) {                                                // llega de fuera (se creó o venía de otro sitio)
        el.animate([{ opacity: 0, transform: 'translateY(-7px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
        return;
      }
      const dx = r0.left - r1.left, dy = r0.top - r1.top, dh = r0.height - r1.height;
      const dentroDeRigida = rigidas.some(x => x.contains(el));
      if (!dentroDeRigida && (Math.abs(dx) >= 1 || Math.abs(dy) >= 1)) {
        /* cuanto más lejos, algo más de tiempo (un salto largo a 240 ms se ve brusco) */
        const dur = Math.min(380, Math.max(200, 170 + Math.hypot(dx, dy) * 0.35));
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: SUAVE });
        if (!elasticas.has(el)) rigidas.push(el);                // lo suyo ya viaja con ella
      }
      /* un grupo (o una carpeta) que gana o pierde algo estira o encoge en lugar de saltar */
      if (Math.abs(dh) >= 1 && el.matches('.gd-arb-grupo'))
        el.animate([{ height: r0.height + 'px' }, { height: r1.height + 'px' }], { duration: DURA, easing: SUAVE });
    });
    if (destacado) {
      const el = ahora.find(x => x.k === destacado);
      if (el) { el.el.classList.add('gd-aterriza'); setTimeout(() => el.el.classList.remove('gd-aterriza'), 620); }
    }
  }
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
     · 'orden' las tarjetas de segmentos de una biblioteca (bandeja incluida)
       (Apariciones, bandeja, momentos y segmentos), todas entre sí; «nuevo segmento» se queda al final;
     · 'acto' tarjetas de la cronología (entre ellas);
     · 'nodo' documentos dentro de su acto o momento;
     · 'nota' notas dentro de su segmento o a otro segmento del mismo tablero (hacia la barra lateral o la
       papelera sigue como antes: la nota vuelve a su sitio y se marca el destino). */
  const VIVOS = { orden: ':scope > [data-clave]', acto: ':scope > .gd-acto[data-acto]' };
  const TABLEROS = '.gd-exp, #gdMain';                       // dentro de uno de ellos una nota se recoloca en vivo
  function iniciarArrastre() {
    pd.activo = true; seccion.classList.add('arrastrando'); lado.classList.add('arrastrando'); pd.el.classList.add('arrastrando');
    pd.auto = setInterval(autodesplazar, 16);
    pd.origen = { padre: pd.el.parentElement, siguiente: pd.el.nextSibling };
    let f;
    if (VIVOS[pd.tipo]) f = fantasmaTarjeta(pd.el);
    else {
      const fuente = pd.tipo === 'seccion' ? pd.el.querySelector('.gd-seccion') : pd.tipo === 'grupo' ? pd.el.querySelector('.gd-arb-marca') : pd.el;
      f = fuente.cloneNode(true); f.className = 'gd-fantasma' + (pd.tipo === 'grupo' ? ' gd-fantasma--grupo' : '');
      f.querySelectorAll('button').forEach(b => b.remove());
      f.style.width = Math.min(pd.tipo === 'grupo' ? 180 : pd.el.offsetWidth, 260) + 'px';
      if (pd.tipo === 'grupo') f.style.setProperty('--gc', getComputedStyle(pd.el).getPropertyValue('--gc'));
    }
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
  /* ---------- dónde va a caer lo que se arrastra en el árbol ----------
     Leo, 16-09-2026: «mover entre grupos pareciera que quiero meter un grupo dentro de otro». El resalte de la caja no
     decía **dónde** cae: ahora se pinta una **raya de inserción** en el sitio exacto y **con la sangría del nivel de
     destino**, así meter algo en un grupo (raya dentro de su caja, más adentro) se distingue de dejarlo al lado (raya
     al ras del grupo). Los destinos que no son una posición —un contenedor, una biblioteca, la papelera— siguen
     resaltándose enteros. */
  let $caida = null;
  function marcaCaida(el, donde, color) {
    if (!el) { sinCaida(); return; }
    if (!$caida) { $caida = document.createElement('div'); $caida.className = 'gd-caida'; }
    if ($caida.parentElement !== lado) lado.appendChild($caida);
    const base = lado.getBoundingClientRect();
    let r = el.getBoundingClientRect(), y = donde === 'antes' ? r.top : r.bottom, izq = r.left, ancho = r.width;
    if (donde === 'dentro') {                                  // dentro de un grupo o de una carpeta: bajo su cabecera y con su sangría
      const cab = $(':scope > .gd-arb-marca', el);
      const filas = $(':scope > .gd-arb-filas', el);
      if (cab) { y = cab.getBoundingClientRect().bottom + 1; }
      if (filas) { const rf = filas.getBoundingClientRect(); izq = rf.left + 10; ancho = Math.max(60, rf.width - 10); }
      else { izq = r.left + 22; ancho = Math.max(60, r.width - 22); y = r.bottom; }
    }
    $caida.style.top = (y - base.top + lado.scrollTop) + 'px';
    $caida.style.left = (izq - base.left + lado.scrollLeft) + 'px';
    $caida.style.width = ancho + 'px';
    $caida.style.setProperty('--cc', color || 'var(--foco)');
    $caida.hidden = false;
  }
  const sinCaida = () => { if ($caida) $caida.hidden = true; };
  /* `visual`: { el, donde: 'antes' | 'despues' | 'dentro', color } pinta la raya en lugar de resaltar la fila. */
  function marcar(zona, antes, mitad, visual) {
    if (pd.zona !== zona) { if (pd.zona) pd.zona.classList.remove('sobre', 'sobre-antes', 'sobre-despues'); pd.zona = zona; }
    if (pd.antes !== antes) { if (pd.antes) pd.antes.classList.remove('antes'); pd.antes = antes; if (antes) antes.classList.add('antes'); }
    pd.mitad = mitad || null;
    if (zona) {
      zona.classList.toggle('sobre', !visual);
      zona.classList.toggle('sobre-antes', !visual && mitad === 'antes');
      zona.classList.toggle('sobre-despues', !visual && mitad === 'despues');
    }
    if (visual) marcaCaida(visual.el, visual.donde, visual.color); else sinCaida();
  }
  const mitadDe = (fila, y) => { const r = fila.getBoundingClientRect(); return y < r.top + r.height / 2 ? 'antes' : 'despues'; };
  /* **Al lienzo abierto** (1.1.58): un esquema, una biblioteca o un personaje del árbol (y una nota de sus filas) soltados sobre
     `#lienzo` entran en él como un nodo de entrada, donde caen (`o.soltarEnLienzo` → `C.lienzoUI.soltar`). Lo que puede ir: */
  function paraLienzo() {
    if (!pd || !o.lienzoVisible || !o.lienzoVisible()) return null;
    if (pd.tipo === 'hijo' && pd.ref && pd.ref.tipo === 'esquema') return { tipo: 'esquema', id: pd.id };
    if (pd.tipo === 'hijo' && pd.ref && pd.ref.tipo === 'sub') {
      const r = d.sub(pd.id); if (!r) return null;
      return r.sub.lineaId && d.personaje(r.sub.lineaId) ? { tipo: 'personaje', id: r.sub.lineaId } : { tipo: 'biblioteca', id: pd.id };
    }
    if (pd.tipo === 'personaje') return { tipo: 'personaje', id: pd.id };
    if (pd.tipo === 'nota' && d.nota(pd.id) && !d.enPapelera(pd.id) && !esPlantilla(d.nota(pd.id)) && !esFormula(d.nota(pd.id))) return { tipo: 'nota', id: pd.id };
    return null;
  }
  function sobreLienzo(v) {
    const L = document.getElementById('lienzo'); if (L) L.classList.toggle('gd-sobre-lienzo', !!v);
    if (pd && pd.fantasma) pd.fantasma.classList.toggle('al-lienzo', !!v);
  }
  function moverArrastre(e) {
    pd.px = e.clientX; pd.py = e.clientY;
    pd.fantasma.style.left = (e.clientX + 12) + 'px'; pd.fantasma.style.top = (e.clientY + 8) + 'px';
    const el = bajo(e.clientX, e.clientY); if (!el || !el.closest) { marcar(null, null); return; }
    const sobre = o.dentroLienzo ? o.dentroLienzo(e.clientX, e.clientY) : !!el.closest('#lienzo');   // su lienzo, no su cabecera ni su barra
    const aL = sobre ? paraLienzo() : null;
    pd.alLienzo = aL; sobreLienzo(aL);
    if (aL) { marcar(null, null); return; }
    if (pd.tipo === 'orden') {                               // un segmento: entre los de su sección o a otra de la biblioteca (también vacía)
      const o0 = pd.origen.padre, card = el.closest('[data-clave]');
      if (!card) {
        const t = el.closest('[data-orden]');
        if (t && t !== o0 && pd.id !== 'bandeja' && t.dataset.sub === o0.dataset.sub) colocarVivo(t, $(':scope > .gd-etq-nueva', t));
        return;
      }
      const padre = card.parentElement;
      if (card === pd.el || !padre || !padre.matches('[data-orden]') || padre.dataset.sub !== o0.dataset.sub) return;
      if (padre !== o0 && pd.id === 'bandeja') return;         // la bandeja no sale de «Segmentos»
      const r = card.getBoundingClientRect(), izquierda = e.clientX < r.left + r.width / 2;
      colocarVivo(padre, izquierda ? card : card.nextSibling);
      return;
    }
    if (VIVOS[pd.tipo]) {                                    // una tarjeta: delante o detrás de la que está bajo el puntero
      const padre = pd.origen.padre, card = el.closest('[data-clave], [data-acto]');
      if (!card || card === pd.el || card.parentElement !== padre || !card.matches(VIVOS[pd.tipo].replace(':scope > ', ''))) return;
      const r = card.getBoundingClientRect(), izquierda = e.clientX < r.left + r.width / 2;
      colocarVivo(padre, izquierda ? card : card.nextSibling);   // también en rejilla: la tarjeta es la de debajo del puntero
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
      if (cuerpo && cuerpo.closest(TABLEROS) === pd.enTablero && grupo(cuerpo) === grupo(pd.origen.padre)) {
        marcar(null, null);
        /* con un orden que no es el manual, el sitio no cuenta: en su cuerpo se queda donde estaba; en otro, al final */
        if (cuerpo.classList.contains('ordenada')) { if (cuerpo === pd.origen.padre) devolverAlOrigen(); else colocarVivo(cuerpo, cuerpo.classList.contains('gd-exp-grid') ? $(':scope > .gd-exp-add', cuerpo) : null); return; }
        colocarEnCuerpo(cuerpo, ':scope > [data-nota]'); return;
      }
      if (cuerpo && cuerpo.closest(TABLEROS) === pd.enTablero) { devolverAlOrigen(); return; }
      if (el.closest('[data-gd-drop-sub], [data-gd-drop-cont], [data-gd-drop-plantillas], [data-gd-drop-formulas]')) devolverAlOrigen();   // hacia la barra o la papelera: vuelve a su sitio y se marca el destino
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
    if (pd.tipo === 'carpeta' || pd.tipo === 'personaje' || pd.tipo === 'hijo' || pd.tipo === 'grupo') {
      const enElenco = !!(pd.el && pd.el.closest('.gd-hijos--elenco'));
      const elenco = pd.tipo === 'personaje' || enElenco || (pd.tipo === 'carpeta' && pd.ambito === C.ELENCO_CARPETAS);
      /* sobre otro grupo: por el borde de arriba de su cabecera, delante de él; en el resto, **dentro** (Leo, 16-09-2026:
         así se meten grupos dentro de grupos arrastrando) */
      const otroG = (pd.tipo === 'grupo' || el.closest('.gd-arb-marca')) ? el.closest('.gd-arb-grupo') : null;
      if (otroG && otroG !== pd.el && !pd.el.contains(otroG)) {
        const cab = $(':scope > .gd-arb-marca', otroG), r = cab.getBoundingClientRect();
        const dentro = e.clientY >= r.top + r.height * .5;
        const color = getComputedStyle(otroG).getPropertyValue('--gc') || '';
        marcar(cab, null, dentro ? 'dentro' : 'antes', { el: otroG, donde: dentro ? 'dentro' : 'antes', color: color.trim() });
        return;
      }
      const kf = el.closest('.gd-carpeta');
      if (kf && kf !== pd.el && (kf.dataset.ambito === C.ELENCO_CARPETAS) === elenco) {
        const r = kf.getBoundingClientRect(), dentro = e.clientY >= r.top + r.height * .35;
        marcar(kf, null, dentro ? 'dentro' : 'antes', { el: kf, donde: dentro ? 'dentro' : 'antes' });
        return;
      }
      const q = elenco ? el.closest('.gd-per[data-personaje]') : el.closest('[data-unidad]');
      if (q && q !== pd.el && !pd.el.contains(q)) { const md = mitadDe(q, e.clientY); marcar(q, null, md, { el: q, donde: md }); return; }
      /* en Personajes, «＋ personaje», «＋ carpeta» o el hueco libre del árbol: a la raíz (fuera de toda carpeta) */
      if (elenco) { const raiz = el.closest('[data-gd-raiz-elenco]') || el.closest(`.gd-cont[data-id="${C.ID_PERSONAJES}"]`) || (el.closest('.gd-arbol') && !el.closest('.gd-per, .gd-carpeta') ? $('[data-gd-nuevo-personaje]', lado) : null); marcar(raiz || null, null); return; }
      const cont = !elenco && el.closest('.gd-cont:not(.papelera)'); marcar(cont || null, null); return;
    }
    const plEl = pd.tipo === 'nota' && el.closest('[data-gd-drop-plantillas], [data-gd-drop-formulas]');   // «Plantillas»: una copia como plantilla; «Fórmulas», su texto (1.1.60)
    if (plEl) { marcar(plEl, null); return; }
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
    const alLienzo = pd.alLienzo, px = pd.px, py = pd.py;
    sobreLienzo(false);
    if (activo && !soltar && origen) devolverAlOrigen();       // cancelado: todo vuelve a su sitio
    clearInterval(pd.auto); pd = null;
    soltarAgarre(el);
    seccion.classList.remove('arrastrando'); lado.classList.remove('arrastrando'); el.classList.remove('arrastrando');
    if (renderPendiente) { renderPendiente = false; setTimeout(render, 0); }
    if (fantasma) fantasma.remove(); if (zona) zona.classList.remove('sobre', 'sobre-antes', 'sobre-despues'); if (antes) antes.classList.remove('antes');
    sinCaida();
    if (!activo) return;
    suprimirClic = Date.now();
    if (!soltar) return;
    if (alLienzo) { if (o.soltarEnLienzo) o.soltarEnLienzo(alLienzo.tipo, alLienzo.id, px, py); return; }   // al lienzo abierto (1.1.58)
    /* en vivo: se guarda el orden que se ve (lo arrastrado ya está en su sitio) */
    const siguiente = sel => { let n = el.nextElementSibling; while (n && !n.matches(sel)) n = n.nextElementSibling; return n; };
    if (VIVOS[tipo]) {
      const padre = el.parentElement, sel = VIVOS[tipo].replace(':scope > ', ''), lista = $$(VIVOS[tipo], padre);
      if (origen && origen.padre === padre && origen.siguiente === el.nextSibling) { render(); return; }   // no se movió
      const sig = siguiente(sel);
      if (tipo === 'acto') { tras(d.colocarActo(el.dataset.sub, id, sig ? sig.dataset.acto : null, lista.map(c => c.dataset.acto))); return; }
      /* arrastrado a otra sección de la biblioteca: además de su sitio, cambia de sección (Leo, 16-09-2026) */
      const etq = (el.dataset.clave || '').startsWith('etq:') ? el.dataset.clave.slice(4) : null;
      if (etq && origen && origen.padre !== padre) d.cambiarSeccion(etq, padre.dataset.seccionId || null);
      /* la sección de partida guarda su orden (`ordenSegmentos`, con la bandeja); las demás, el de sus segmentos */
      if (padre.dataset.seccionId && etq) { const s2 = sig && (sig.dataset.clave || '').startsWith('etq:') ? sig.dataset.clave.slice(4) : null; tras(d.colocarEtiqueta(etq, s2)); return; }
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
      const sig = siguiente('[data-nota]'), ordenada = cuerpo.classList.contains('ordenada');
      if (origen && origen.padre === cuerpo && (ordenada || origen.siguiente === el.nextSibling)) { render(); return; }   // no se movió (o el orden no es el manual)
      tras(d.moverNota(id, cuerpo.dataset.gdDrop || null, (actual && actual.tipo === 'sub' && actual.id) || n.subId, sig && !ordenada ? sig.dataset.nota : null)); return;
    }
    if (!zona) { render(); return; }
    if (tipo === 'seccion') {                                // delante o detrás de otra sección de la biblioteca
      const suyo = k => (k || '').startsWith('sec:') ? k.slice(4) : null;
      const mio = suyo(id), otro = suyo(zona.dataset.seccion);
      if (!mio) { render(); return; }                        // la de partida («Segmentos») se queda la primera
      const lista = d.seccionesDe((d.seccion(mio) || { sub: {} }).sub.id).map(x => x.id);
      const j = lista.indexOf(otro);
      tras(d.colocarSeccion(mio, otro ? (mitad === 'antes' ? otro : (lista[j + 1] || null)) : lista[0]));
      return;
    }
    if (tipo === 'carpeta' || tipo === 'personaje' || tipo === 'hijo' || tipo === 'grupo') {
      return animarArbol(() => soltarEnArbol(tipo, id, hijo, zona, mitad), id);
    }
    if (tipo === 'cont') {
      /* «detrás» es delante del siguiente **que se ve** en el árbol (fijados y luego sueltos): el siguiente de
         `datos.contenedores` podía ser uno oculto (Personajes, las plantillas) */
      const L = d.contenedores({ orden: 'manual' }), lista = [...L.fijados, ...L.sueltos].map(c => c.id), r = zona.dataset.id, j = lista.indexOf(r);
      return animarArbol(() => tras(d.colocarContenedor(id, mitad === 'antes' ? r : (lista[j + 1] || null))), id);
    }
    return soltarResto();

    function soltarEnArbol(tipo, id, hijo, zona, mitad) {
      const tipoModelo = tipo === 'hijo' ? (hijo.tipo === 'esquema' || hijo.tipo === 'lienzo' ? hijo.tipo : 'sub') : tipo;
      if (zona.classList.contains('gd-arb-marca')) {
        const gid = zona.dataset.grupoId;
        if (mitad === 'antes') { tras(d.colocarEnArbol(id, gid)); return; }        // delante del grupo, como hermano
        const dentro = d.nivelGrupo(gid).filter(x => x.id !== id);                  // dentro de él, el primero (donde se vio la raya)
        const r = d.aGrupo(gid, id);
        if (r.ok && dentro.length) d.colocarEnArbol(id, dentro[0].id);
        tras(r); return;
      }
      /* entra al final de su nuevo nivel (al soltar sobre un contenedor) o el primero (donde se vio la raya) */
      const alFinal = (ambito, carpetaId, x) => {
        if (!x.ok) return x;
        const resto = d.nivelArbol(ambito, carpetaId).filter(p => p.id !== id);
        if (resto.length) d.colocarEnArbol(id, resto[resto.length - 1].id, true);
        return x;
      };
      const alPrimero = (ambito, carpetaId, x) => {
        if (!x.ok) return x;
        const resto = d.nivelArbol(ambito, carpetaId).filter(p => p.id !== id);
        if (resto.length) d.colocarEnArbol(id, resto[0].id);
        return x;
      };
      if (zona.classList.contains('gd-carpeta')) {
        if (mitad === 'antes') { tras(d.colocarEnArbol(id, zona.dataset.carpeta)); return; }
        tras(alPrimero(zona.dataset.ambito, zona.dataset.carpeta, d.moverACarpeta(tipoModelo, id, zona.dataset.carpeta))); return;
      }
      if (zona.dataset.gdRaizElenco !== undefined) { tras(alFinal(C.ELENCO_CARPETAS, null, d.moverACarpeta(tipoModelo, id, null, C.ELENCO_CARPETAS))); return; }
      if (zona.dataset.personaje || zona.dataset.unidad) {
        const refId = zona.dataset.personaje || (desclave(zona.dataset.unidad) || {}).id;
        if (refId) tras(d.colocarEnArbol(id, refId, mitad === 'despues'));
        return;
      }
      if (zona.classList.contains('gd-cont')) {              // el contenedor «Personajes» es la raíz del elenco
        const ambito = zona.dataset.id === C.ID_PERSONAJES ? C.ELENCO_CARPETAS : zona.dataset.id;
        tras(alFinal(ambito, null, d.moverACarpeta(tipoModelo, id, null, ambito)));
      }
      return;
    }
    function soltarResto() {
      if (zona.dataset.gdDropFormulas !== undefined) {          // en «Fórmulas» (1.1.60): su texto, como fórmula (a su bandeja)
        const n = d.nota(id);
        if (!n || d.enPapelera(id)) return;
        if (esFormula(n)) { if (o.avisar) o.avisar('Esta nota ya es una fórmula'); return; }
        if (esPlantilla(n)) { if (o.avisar) o.avisar('Una plantilla no se guarda como fórmula'); return; }
        if (ladoId === id) guardarLadoYa();
        if (notaAbierta === id && o.texto.volcar) o.texto.volcar();
        const x = d.guardarComoFormula ? d.guardarComoFormula(id, null) : null;
        if (!x || !x.ok) { tras(x || { ok: false, aviso: 'No se pudo guardar como fórmula' }); return; }
        if (o.guardar) o.guardar(); render();
        if (o.avisar) o.avisar(x.aviso || 'Guardada como fórmula', { texto: 'Ver', fn: () => { if (x.nota) abrirFormula(x.nota.id); else abrirFormulas(); } });
        return;
      }
      if (zona.dataset.gdDropPlantillas !== undefined) {        // en «Plantillas»: una copia de la nota, como plantilla (a su bandeja)
        const n = d.nota(id);
        if (!n || d.enPapelera(id)) return;
        if (esPlantilla(n)) { if (o.avisar) o.avisar('Esta nota ya es una plantilla'); return; }
        if (esFormula(n)) { if (o.avisar) o.avisar('Una fórmula no se guarda como plantilla'); return; }
        if (ladoId === id) guardarLadoYa();
        if (notaAbierta === id && o.texto.volcar) o.texto.volcar();
        const x = d.guardarComoPlantilla ? d.guardarComoPlantilla(id, null) : null;
        if (!x || !x.ok) { tras(x); return; }
        if (o.guardar) o.guardar(); render();
        if (o.avisar) o.avisar(x.aviso || 'Guardada como plantilla', { texto: 'Ver', fn: () => abrirPlantillas() });
        return;
      }
      const aSub = zona.dataset.gdDropSub !== undefined ? desclave(zona.dataset.gdDropSub) : null;
      if (aSub) {
        if (d.enPapelera(id)) { tras(d.restaurarNota(id, aSub.id)); return; }
        const r = d.sub(aSub.id); if (tras(d.moverNota(id, null, aSub.id)) && r && o.avisar) o.avisar('Movida a «' + r.contenedor.nombre + ' › ' + r.sub.nombre + '» (bandeja)'); return;
      }
      if (zona.closest('.gd-sub--esquema')) { if (o.avisar) o.avisar('Un esquema de pasos no recibe notas: suéltala en una biblioteca'); return; }
      const aCont = zona.dataset.gdDropCont;
      if (aCont === PAPELERA) { if (!d.enPapelera(id)) tirarNota(id, { sinPreguntar: true }); return; }
      if (d.enPapelera(id)) { if (aCont !== undefined) tras(d.restaurarNota(id, aCont)); else if (o.avisar) o.avisar('Suéltala sobre una biblioteca del menú para restaurarla'); return; }
      if (aCont !== undefined) {
        const c = d.contenedor(aCont); if (!c) return;
        const b = d.primeraBiblioteca ? d.primeraBiblioteca(c.id) : c.subs.find(x => !x.guionEid);   // nunca la oculta de guiones
        if (!b) { if (o.avisar) o.avisar('«' + c.nombre + '» no tiene bibliotecas: crea una con su «＋»'); return; }
        if (tras(d.moverNota(id, null, b.id)) && o.avisar) o.avisar('Movida a «' + c.nombre + ' › ' + b.nombre + '» (bandeja)'); return;
      }
      const n = d.nota(id); if (!n) return;
      tras(d.moverNota(id, zona.dataset.gdDrop || null, (actual && actual.tipo === 'sub' && actual.id) || n.subId, antes ? antes.dataset.nota : null));
    }
  }

  /* ---------- arranque ---------- */
  function iniciar(opciones) {
    o = opciones || {};
    seccion = o.seccion; lado = o.lado; main = o.main; migas = o.migas;
    seccion.style.position = 'relative';
    const zonas = [seccion, lado];                              // la barra vive fuera de la sección: mismos oyentes
    const oir = (tipo, fn) => zonas.forEach(z => z.addEventListener(tipo, fn));
    /* el ancho del panel lateral de la nota (hasta la 1.1.53): ya no hay panel, la nota se abre en su ventana */
    if (o.vista && 'ladoNota' in o.vista) { delete o.vista.ladoNota; guardarVista(); }

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
      if (!(disparador && disparador.contains && disparador.contains(e.target))) cerrarPop();   // un clic en otro sitio cierra el menú
      e.stopPropagation();                                   // y no llega al tablero (lo tomaría por un clic en blanco)
      if (Date.now() - suprimirClic < 400) return;           // el clic que cierra un arrastre no es un clic
      /* un clic fuera de las notas quita la marca (Leo); en el menú lateral no (1.1.54, de ClapBook: plegarlo la quitaba), ni en la
         caja de buscar o los filtros */
      if (!e.target.closest('[data-nota]:not(.gd-nota-fila), [data-nodo], .gd-buscar-vista, .gd-filtro, .gd-filtro-quitar') && !lado.contains(e.target)) soltarSeleccion();
      if (e.target.closest('[data-gd-quitar-color-seg]')) { if (expandido) ponerFiltro(claveFiltroSeg(expandido.subId, expandido.clave), { color: filtroDe(claveFiltroBib(expandido.subId)).color ? '' : undefined }); return; }
      if (e.target.closest('[data-gd-quitar-color-bib]')) { if (actual && actual.tipo === 'sub') ponerFiltro(claveFiltroBib(actual.id), { color: undefined }); return; }
      if (e.target.closest('.gd-buscar-vista')) return;
      /* las plantillas (1.1.56): «Usar» en su tarjeta, «Nueva plantilla» y «Desde plantilla» en la cabecera, y su fila del pie */
      const usar = e.target.closest('[data-gd-usar]'); if (usar) { const c = usar.closest('[data-nota]'); if (c) desdePlantilla(c.dataset.nota); return; }
      if (e.target.closest('[data-gd-nueva-plantilla]')) { if (actual && actual.tipo === 'sub') nuevaNota(actual.id, null); return; }
      const dp = e.target.closest('[data-gd-desde-plantilla]');
      if (dp) { if (actual && actual.tipo === 'sub') { const sid = actual.id; elegirPlantilla('Nueva nota desde plantilla', id => desdePlantilla(id, { subId: sid }), dp); } return; }
      if (e.target.closest('[data-gd-plantillas]')) { abrirPlantillas(); return; }
      /* las fórmulas (1.1.60): «Nueva fórmula» en su cabecera y su fila del pie */
      if (e.target.closest('[data-gd-nueva-formula]')) { if (actual && actual.tipo === 'sub') nuevaNota(actual.id, null); return; }
      if (e.target.closest('[data-gd-formulas]')) { abrirFormulas(); return; }
      if (e.target.closest('[data-gd-nueva-seccion]')) { if (actual && actual.tipo === 'sub') nuevaSeccion(actual.id); return; }
      const ps = e.target.closest('[data-gd-plegar-seccion]'); // biblioteca: contraer una sección
      if (ps) {
        const k = ps.dataset.gdPlegarSeccion;
        if (o.vista) { const p = o.vista.secPlegadas = o.vista.secPlegadas || {}; p[k] = !p[k]; if (p[k] && grandeSec() === k) o.vista.secGrande = null; guardarVista(); }
        aplicarSecciones();
        if (busquedaVista.texto) aplicarBusqueda();             // lo que se ve cambió: la cuenta también
        return;
      }
      const gs = e.target.closest('[data-gd-grande-seccion]'); // biblioteca: una sección sola, en toda la pantalla
      if (gs) {
        const k = gs.dataset.gdGrandeSeccion, v = grandeSec() === k ? null : k;
        if (o.vista) { o.vista.secGrande = v; if (v && o.vista.secPlegadas) o.vista.secPlegadas[v] = false; guardarVista(); }
        aplicarSecciones();
        if (busquedaVista.texto) aplicarBusqueda();             // lo que se ve cambió: la cuenta también
        return;
      }
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
      /* «Contenedores» y «Personajes» solo cambian el árbol del menú; la pantalla sigue hasta que se pulse algo de él (1.1.35, Leo:
         «no me debe cambiar de pantalla hasta que presione algún elemento del árbol… afecta la navegación entre pestañas») */
      if (e.target.closest('[data-gd-ir-personajes]')) { if (o.verArbol) o.verArbol('personajes'); renderLado(); return; }
      if (e.target.closest('[data-gd-ir-contenedores]')) { if (o.verArbol) o.verArbol('contenedores'); renderLado(); return; }
      const per = e.target.closest('[data-personaje]'); if (per) { if (o.abrirPersonaje) o.abrirPersonaje(per.dataset.personaje); return; }
      const nh = e.target.closest('[data-gd-nuevo-hijo]');
      if (nh) {
        const cid = nh.closest('.gd-cont').dataset.id;
        if (cid === C.ID_PERSONAJES || cid === C.ID_ESQUEMAS_PERSONAJE) { const nodo = MENUS.contenedor(nh); if (nodo) abrirPop(nh, nodo); return; }
        nuevoHijo(cid); return;
      }
      const ve = e.target.closest('[data-gd-ver-esquema]'); if (ve) { abrirEsquema(ve.dataset.gdVerEsquema); return; }
      const irEsq = e.target.closest('[data-ir-esquema]'); if (irEsq) { abrirEsquema(irEsq.dataset.irEsquema); return; }   // «Esquemas relacionados»
      const nodo = e.target.closest('[data-nodo]');
      if (nodo) {                                            // la cronología: un clic selecciona, doble clic abre
        notaSel = nodo.dataset.nodo;
        $$('.sel[data-nota], .sel[data-nodo]').forEach(x => x.classList.remove('sel')); nodo.classList.add('sel');
        return;
      }
      const ir = e.target.closest('[data-gd-ir]');
      if (ir) { const s = desclave(ir.dataset.gdIr); if (valido(s)) { notaAntes = null; navegar(s); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); } return; }
      if (e.target.closest('[data-gd-eliminar-etq]')) { eliminarEtiqueta(e.target.closest('.gd-etq').dataset.etq); return; }
      const crear = e.target.closest('[data-gd-crear-nota]'); if (crear) { if (actual && actual.tipo === 'sub') nuevaNota(actual.id, crear.dataset.gdCrearNota || null); return; }
      const plegar = e.target.closest('[data-gd-plegar]');
      if (plegar) {
        const cid = plegar.closest('.gd-cont').dataset.id;     // los dos de Personajes pueden no existir todavía
        if (cid === C.ID_PERSONAJES) d.personajes(true); else if (cid === C.ID_ESQUEMAS_PERSONAJE) d.esquemasPersonajes(true);
        d.plegarContenedor(cid); if (o.guardar) o.guardar();
        render(); return;
      }
      const nota = e.target.closest('[data-nota]');
      if (nota && nota.classList.contains('gd-nota-fila')) {   // en el árbol, un clic abre el documento (con espera: el doble clic renombra)
        clearTimeout(clicArbol); const id = nota.dataset.nota;
        clicArbol = setTimeout(() => { clicArbol = null; abrirNota(id); }, 260);
        return;
      }
      if (nota) {                                            // en el tablero, un clic la elige y abre su ventana (el doble clic, el editor)
        notaSel = nota.dataset.nota;
        marcarElegida(notaSel);
        if ((nota.classList.contains('gd-exp-nota') || nota.classList.contains('gd-nota')) && actual && actual.tipo === 'sub' && !d.enPapelera(notaSel) && ladoId !== notaSel) mostrarLado(notaSel, { porTarjeta: true });
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
        /* el segundo clic de un doble clic (1.1.58): el primero abre y redibuja el árbol, así que el `dblclick` no siempre llega
           (cae en otra fila); `detail` sí dice 2. Renombra, como el doble clic. */
        if (e.detail >= 2) { if (!subEl.querySelector('input.gd-edit')) renombrarHijo(s, subEl); return; }
        if (s.tipo === 'esquema') { abrirEsquema(s.id); return; }
        if (s.tipo === 'lienzo') { abrirLienzo(s.id); return; }
        if (s.tipo === 'sub' && volverANota(s.id)) return;     // su nota seguía en el editor antes de irse: se vuelve a ella
        navegar(s); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); return;
      }
      if (e.target.closest('[data-gd-lado]')) { if (o.alternarLado) o.alternarLado(); return; }
      /* la papelera (al pie o en el riel) abre su tablero; un contenedor no hace nada (Leo): se abre lo de dentro */
      if (e.target.closest('.gd-cont.papelera, [data-gd-papelera]')) {
        notaAntes = null; navegar(ref(PAPELERA, null)); if (notaAbierta) cerrarNota(); else render(); irAlTablero(); return;
      }
    });
    const sinClicPendiente = () => { clearTimeout(clicArbol); clicArbol = null; };
    oir('dblclick', e => {
      const ap = e.target.closest('[data-ap-tipo]'); if (ap) { e.stopPropagation(); abrirAparicion(ap); return; }
      const pz = e.target.closest('[data-pieza]'); if (pz && !e.target.closest('button')) { e.stopPropagation(); restaurarPieza(pz.dataset.pieza); return; }   // en la papelera: restaurar
      const nodo = e.target.closest('[data-nodo]');
      if (nodo && !e.target.closest('button')) { e.stopPropagation(); o.abrirNodo(nodo.dataset.eid, nodo.dataset.nodo); return; }
      const nota = e.target.closest('[data-nota]');
      if (nota && !e.target.closest('button')) {
        e.stopPropagation();
        if (nota.classList.contains('gd-nota-fila')) { clearTimeout(clicArbol); clicArbol = null; renombrarNota(nota.dataset.nota, nota); }   // en el árbol: renombrar
        else abrirNota(nota.dataset.nota);                                                      // en el tablero: abrir
        return;
      }
      const grupoD = e.target.closest('.gd-arb-marca');
      if (grupoD) { e.stopPropagation(); sinClicPendiente(); cerrarPop(); renombrarGrupo(grupoD.dataset.grupoId); return; }   // doble clic: renombrar el grupo (Leo, 16-09-2026)
      const carpD = e.target.closest('.gd-carpeta'); if (carpD && !e.target.closest('button')) { e.stopPropagation(); clearTimeout(clicArbol); clicArbol = null; renombrarCarpeta(carpD.dataset.carpeta); return; }
      const cont = e.target.closest('.gd-cont:not(.papelera):not(.gd-cont--sistema) [data-gd-nombre]'); if (cont) { e.stopPropagation(); sinClicPendiente(); renombrarContenedor(cont.closest('.gd-cont').dataset.id); return; }
      const per = e.target.closest('[data-personaje]'); if (per && !e.target.closest('button')) { e.stopPropagation(); sinClicPendiente(); renombrarPersonaje(per.dataset.personaje); return; }
      /* el clic de abrir estaba pendiente: sin cancelarlo, su render se llevaba por delante el campo de renombrar
         (Leo, 16-09-2026: «quiero poder cambiar nombres de los elementos del árbol dando doble clic») */
      const fila = e.target.closest('.gd-sub'); if (fila) { e.stopPropagation(); sinClicPendiente(); const s = desclave(fila.dataset.sub); if (s && !fila.querySelector('input.gd-edit')) renombrarHijo(s, fila); return; }
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
        const hs = vecinasDe(m, n), sig = hs[hs.findIndex(x => x.id === n.id) + (+mv.dataset.gdMigaMover)];
        if (sig) { if (o.texto.volcar) o.texto.volcar(); abrirNota(sig.id); }
        return;
      }
      if (e.target.closest('[data-gd-expandir-nota]')) {         // la etiqueta del segmento: su vista expandida, con esta nota marcada
        e.stopPropagation();
        const m = modelo(), n = m && notaAbierta && m.nota(notaAbierta); if (!n) return;
        expandir(n.subId, n.etiquetaId ? 'etq:' + n.etiquetaId : 'bandeja', n.id);
        return;
      }
      if (e.target.closest('[data-gd-contraer-nota]')) { e.stopPropagation(); contraerNota(); return; }   // «Contraer»: a su ventana
      if (e.target.closest('[data-gd-miga-tirar]')) { e.stopPropagation(); if (notaAbierta) { if (o.texto.volcar) o.texto.volcar(); tirarNota(notaAbierta); } return; }
      if (e.target.closest('[data-gd-volver]')) { e.stopPropagation(); expandido = null; cerrarNota(); return; }
      const ir = e.target.closest('[data-gd-ir]');
      if (ir) { e.stopPropagation(); const s = desclave(ir.dataset.gdIr); if (valido(s)) { navegar(s); cerrarNota(); irAlTablero(); } }
    });
    /* un clic fuera de las notas suelta la elegida; en las pestañas no: cambiar de pestaña guarda la nota elegida con la que se
       deja y repone la de la otra (1.1.34, Leo: «el sidepanel de los segmentos se cierra cuando cambio de pestaña»). La pestaña
       pulsada ya no está en la página cuando el clic llega aquí (la franja se redibuja al cambiar): se mira la ruta del evento,
       que se guarda tal cual empezó. Como en ClapBook: el clic en el botón que abrió un menú es suyo (lo alterna), el de un botón
       que un redibujo ya quitó no es un «clic fuera», y con la ventana de una nota abierta nada de esto la toca (lo que se abre
       encima de ella —confirmar, un menú— no la cierra; ella se cierra con su fondo, Esc o ×). */
    const enPestanas = e => e.composedPath().some(n => n && n.id === 'pestanas');
    document.addEventListener('click', e => {
      if (e.target.closest('.gd-pop,[data-gd-menu]')) return;
      if (disparador && disparador.contains && disparador.contains(e.target)) return;
      cerrarPop();
      if (!e.target.isConnected || ladoId) return;
      if (!e.target.closest('.gd-exp-nota, .gd-bib-medio .gd-nota, .gd-buscar-vista, .gd-filtro, .gd-filtro-quitar') && !enPestanas(e)) soltarSeleccion();
    });
    /* lo que se busca en la vista: al momento en lo que se recuerda, y se aplica poco después */
    let buscarT = null;
    oir('input', e => {
      const t = e.target;
      if (t.matches && t.matches('[data-gd-buscar-vista]')) { busquedaVista = { donde: dondeVista(), texto: t.value }; clearTimeout(buscarT); buscarT = setTimeout(aplicarBusqueda, 90); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); const t = disparador; cerrarPop(); devolverFoco(t); } }, true);   // Esc cierra cualquier menú, también los que van fuera del gestor (Exportar)   // fuera del gestor (cabecera, tablero, editor)
    /* Esc con el segmento expandido a la vista (y sin menú, campo ni diálogo): contraer */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && notaSel && !abierto && !pd && !editando && !e.defaultPrevented && !(e.target.closest && e.target.closest('input, textarea, [contenteditable], dialog'))) { if (ladoId) cerrarLado(); soltarSeleccion(); return; }   // Esc quita primero la marca de la nota (y su panel)
      if (e.key !== 'Escape' || !expandido || abierto || pd || editando || e.defaultPrevented) return;
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable], dialog')) return;
      if ([...document.querySelectorAll('.gd-exp')].some(x => x.offsetParent !== null)) contraer();
    });

    /* Teclado: Esc cierra menús o limpia campos; Supr no llega al tablero */
    oir('keydown', e => {
      /* la caja de buscar: Esc la vacía (y, vacía, la deja); Enter abre la primera nota que casa en su ventana */
      if (e.target.matches && e.target.matches('[data-gd-buscar-vista]')) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.target.value) { e.target.value = ''; busquedaVista.texto = ''; clearTimeout(buscarT); aplicarBusqueda(); } else e.target.blur(); return; }
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation(); clearTimeout(buscarT); aplicarBusqueda();
          const n = $$('[data-nota]', main).find(x => !x.hidden && !seccionOculta(x)); if (n) { notaSel = n.dataset.nota; marcarElegida(notaSel); mostrarLado(notaSel); }
          return;
        }
        if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (pd) { terminarArrastre(false); return; }
        if (abierto) { const t = disparador; cerrarPop(); devolverFoco(t); return; }
        if (notaSel && !editando) { if (ladoId) cerrarLado(); soltarSeleccion(); return; }
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
      const s = desclave(f.dataset.sub), x = s && (s.tipo === 'esquema' ? d.esquema(s.id) : s.tipo === 'lienzo' ? lienzoDe(s.id) : d.sub(s.id)); if (!x) return;
      const nombre = (x.esquema || x.lienzo || x.sub).nombre, tipo = s.tipo === 'esquema' ? 'Esquema' : s.tipo === 'lienzo' ? 'Lienzo' : 'Biblioteca';
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
    [seccion].forEach(z => {
      z.addEventListener('mouseover', e => {
        /* una nota de un segmento (o de uno expandido): su nombre entero, si no cabe en la tarjeta (1.1.54, Leo en ClapBook:
           «implementa un tooltip que cuando le haga hover se vea el nombre completo de la nota») */
        const nt = !pd && d && e.target.closest('.gd-nota[data-nota], .gd-exp-nota[data-nota]');
        if (nt && !e.target.closest('button, .gd-edit')) {
          const t = nt.querySelector('.gd-exp-tit') || nt.querySelector(':scope > span:first-child');
          const x = d.nota(nt.dataset.nota) || (d.enPapelera(nt.dataset.nota) || {}).nota;
          const corto = t && (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1);
          if (!x || !corto) { esconderGlobo(); return; }
          const k = 'nota:' + nt.dataset.nota; if (globo.dataset.para === k && !globo.hidden) return;
          esconderGlobo();
          globoT = setTimeout(() => {
            if (!nt.isConnected) return;
            globo.dataset.para = k;
            globo.replaceChildren(Object.assign(document.createElement('span'), { className: 'gd-globo-rot', textContent: d.enPapelera(nt.dataset.nota) ? 'En la papelera' : 'Nota' }), document.createTextNode(x.titulo || 'Sin título'));
            globo.hidden = false;
            const r = nt.getBoundingClientRect();
            globo.style.left = Math.max(8, Math.min(r.left, innerWidth - globo.offsetWidth - 8)) + 'px';
            globo.style.top = (r.bottom + 6) + 'px';
          }, 250);
          return;
        }
        /* cualquier cosa con `data-globo` enseña su globo: los nombres de segmento y también las filas que llevan su
           propio texto en `data-globo-txt` (Leo, 16-09-2026: «necesito un tooltip al hacer hover en este y en todos») */
        const n = e.target.closest('[data-globo]'); if (!n || pd || e.target.closest('.gd-edit')) { if (!n) esconderGlobo(); return; }
        const nombre = (n.dataset.globoTxt || n.textContent).trim(); if (globo.dataset.para === 'etq:' + nombre && !globo.hidden) return;
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
      const g = e.target.closest('.gd-arb-marca, .gd-sub'); if (!g || !d) return;
      e.preventDefault(); e.stopPropagation();
      const nodo = g.matches('.gd-arb-marca') ? MENUS.grupo(g) : MENUS.enlazar(g);
      if (nodo) { if (abierto && disparador === g) cerrarPop(); abrirPop(g, nodo); }
    });

    oir('pointerdown', e => {
      if (e.button !== 0 || pd || e.target.closest('button:not(.gd-arb-marca), input, .gd-edit')) return;   // la cabecera de un grupo es un botón y sí se arrastra
      const base = { x0: e.clientX, y0: e.clientY, pid: e.pointerId, activo: false, zona: null, antes: null, fantasma: null, mitad: null };
      const hs = e.target.closest('.gd-bloque > .gd-seccion');   // el título de una sección: intercalar segmentos y cronología
      if (hs && $$('.gd-bloque', main).filter(b => b.offsetParent !== null).length > 1) { pd = Object.assign(base, { tipo: 'seccion', id: hs.parentElement.dataset.seccion, el: hs.parentElement }); return; }   // con una expandida, la otra no se ve: no se intercalan
      /* las tarjetas de segmentos se ordenan entre sí por su cabecera */
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
      const marcaG = e.target.closest('.gd-arb-marca');       // un grupo se arrastra por su cabecera (Leo, 16-09-2026)
      if (marcaG) { pd = Object.assign(base, { tipo: 'grupo', id: marcaG.dataset.grupoId, el: marcaG.closest('.gd-arb-grupo') }); return; }
      if (e.target.closest('.gd-hijos')) return;
      const cont = e.target.closest('.gd-cont:not(.papelera):not(.gd-cont--sistema)');   // los de Personajes no se reordenan
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
  function mostrar() { modelo(); if (!volverANota()) render(); }
  /* al irse a otra vista, la ventana de una nota se cierra y vuelve sola al volver (como el editor, `notaAntes`) */
  function salir() { cerrarPop(); if (ladoId) { reabrir = true; cerrarLado(); } if (notaAbierta) { notaAntes = notaAbierta; cerrarNota(); } }
  /* **Se vuelve al editor que se dejó** (Leo, 18-09-2026: «si está abierto el editor de una nota de segmento, me paso a un
     esquema y luego quiero regresar al editor, me saca del editor y me regresa a la vista expandida del segmento»): la nota que
     estaba abierta al irse a otra vista se abre otra vez al volver —con Ver › Documentos o pulsando su biblioteca en el árbol—,
     si sigue existiendo. Ir a otra biblioteca, a la papelera o a «Ver biblioteca» la olvida. */
  function volverANota(subId) {
    const id = notaAntes; notaAntes = null;
    const m = modelo(), n = id && m && !m.enPapelera(id) && m.nota(id);
    if (!n || notaAbierta) return false;
    if (subId ? n.subId !== subId : !(actual && actual.tipo === 'sub' && actual.id === n.subId)) return false;
    abrirNota(id); return true;
  }
  /* Al cambiar de guion (pestaña): nada abierto, y el modelo se rehace solo. */
  function reiniciar() { cerrarPop(); if (ladoId) cerrarLado(); reabrir = false; ultimaNormal = null; olvidarBusqueda(); notaAntes = null; if (notaAbierta) { o.texto.cerrarDocumento(); notaAbierta = null; document.body.classList.remove('nota-abierta'); } d = null; guionId = null; actual = null; notaSel = null; expandido = null; render(); }

  /* Abre el tablero de unos documentos desde fuera («Ver documentos» del esquema, en app.js). */
  /* la papelera, desde fuera (una pestaña que la enseña) */
  function abrirPapelera() {
    if (!modelo()) return;
    expandido = null; notaAntes = null;
    navegar(ref(PAPELERA, null));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* **Llevar el árbol a una pieza** (1.1.52, abrir el enlace de un contenedor, una carpeta o un grupo): despliega lo que la tapa
     —su contenedor y sus carpetas—, la trae a la vista y la marca un instante. */
  function revelar(tipo, id) {
    const m = modelo(); if (!m) return false;
    let ambito = null, carpetaId = null;
    if (tipo === 'contenedor') ambito = id;
    else if (tipo === 'carpeta') { const r = m.carpeta(id); if (!r) return false; ambito = r.ambito; carpetaId = r.carpeta.padreId || null; m.plegarCarpeta(id, false); }
    else if (tipo === 'grupo') { const r = m.grupo(id); if (!r) return false; ambito = r.ambito; let g = r.grupo; while (g.padreId) { const p = m.grupo(g.padreId); if (!p) break; g = p.grupo; } carpetaId = g.carpetaId || null; }
    else return false;
    for (let k = carpetaId && m.carpeta(carpetaId); k; k = k.carpeta.padreId && m.carpeta(k.carpeta.padreId)) m.plegarCarpeta(k.carpeta.id, false);
    const personajes = ambito === C.ELENCO_CARPETAS || ambito === C.ID_PERSONAJES || ambito === C.ID_ESQUEMAS_PERSONAJE;
    const cont = ambito === C.ELENCO_CARPETAS ? m.contenedor(C.ID_PERSONAJES) : m.contenedor(ambito);
    if (cont && cont.plegado) m.plegarContenedor(cont.id, false);
    if (o.verArbol) o.verArbol(personajes ? 'personajes' : 'contenedores');
    if (lado && lado.classList && document.body.classList.contains('lado-plegado') && o.alternarLado) o.alternarLado();
    renderLado();
    const sel = tipo === 'contenedor' ? `.gd-cont[data-id="${CSS.escape(id)}"]` : tipo === 'carpeta' ? `.gd-carpeta[data-carpeta="${CSS.escape(id)}"]` : `.gd-arb-grupo[data-grupo="${CSS.escape(id)}"] > .gd-arb-marca`;
    const el = lado && lado.querySelector(sel);
    if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.classList.remove('gd-aterriza'); void el.offsetWidth; el.classList.add('gd-aterriza'); setTimeout(() => el.classList.remove('gd-aterriza'), 700); }
    return !!el;
  }
  /* una sección de la biblioteca abierta, a la vista (desplegada) y marcada un instante */
  function verSeccion(id) {
    const b = main && main.querySelector(`.gd-bloque[data-seccion-id="${CSS.escape(id)}"]`); if (!b) return false;
    if (o.vista && o.vista.secPlegadas && o.vista.secPlegadas[b.dataset.seccion]) { delete o.vista.secPlegadas[b.dataset.seccion]; if (o.guardarVista) o.guardarVista(); aplicarSecciones(); }
    b.scrollIntoView({ block: 'start', inline: 'nearest' });
    b.classList.remove('gd-aterriza'); void b.offsetWidth; b.classList.add('gd-aterriza'); setTimeout(() => b.classList.remove('gd-aterriza'), 700);
    return true;
  }
  function abrirSub(id) {
    const m = modelo(), r = m && m.sub(id); if (!r) return;
    expandido = null; notaAntes = null;                      // «Ver biblioteca»: su tablero, no un segmento expandido ni la nota de antes
    navegar(ref('sub', r.contenedor.id, id));
    if (notaAbierta) cerrarNota(); else render();
    irAlTablero();
  }
  /* ---------- Personajes: «Apariciones», una sección más de la biblioteca de un personaje ----------
     Leo, 16-09-2026: los personajes son bibliotecas, así que sus apariciones (las notas donde se les nombra con «/»,
     con su ruta) dejan de ir en un carrusel aparte y van en su propia sección, que se contrae y se expande como las
     demás. No se ordenan ni se borran; el doble clic las abre. */
  const glifoDe = (eid, id) => { const tm = o.modeloDe && o.modeloDe(eid), p = tm && tm.punto(id); return p ? glifo(tm, p) : ''; };
  function tarjetaApariciones(lista) {
    const sec = document.createElement('section');
    sec.className = 'gd-etq gd-apariciones';
    sec.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom" data-globo="Segmento"><span>Apariciones</span></span><span class="gd-etq-acc"><span class="gd-cuenta">${lista.length}</span>${BOTON_EXPANDIR}</span></header>
      <div class="gd-etq-body">${lista.map(x => `<div class="gd-aparicion" role="button" tabindex="0" data-ap-tipo="${esc(x.tipo)}" data-ap-id="${esc(x.id)}" data-ap-eid="${esc(x.eid || '')}" title="Doble clic: abrir la nota">
          <span class="gd-aparicion-lin">${x.tipo === 'nodo' ? glifoDe(x.eid, x.id) : ''}<span class="gd-aparicion-tit"></span><span class="gd-nota-meta">${esc(fecha(x.modificado))}</span></span><span class="gd-aparicion-ruta"></span></div>`).join('') || '<div class="gd-etq-vacia">Aún no aparece en ninguna nota</div>'}</div>`;
    $$('.gd-aparicion', sec).forEach((b, i) => { $('.gd-aparicion-tit', b).textContent = lista[i].titulo; $('.gd-aparicion-ruta', b).textContent = lista[i].ruta; });
    return sec;
  }
  /* «Esquemas relacionados»: los esquemas donde el personaje tiene carril (Leo, 16-09-2026). Solo lista y lleva
     al esquema con un clic; desde aquí no se añaden ni se quitan (se añaden dándole carril en el esquema). */
  function tarjetaEsquemas(lista) {
    const sec = document.createElement('section');
    sec.className = 'gd-etq gd-esq-rel';
    sec.innerHTML = `<header class="gd-etq-head"><span class="gd-etq-nom" data-globo="Segmento"><span>Esquemas relacionados</span></span><span class="gd-etq-acc"><span class="gd-cuenta">${lista.length}</span></span></header>
      <div class="gd-etq-body">${lista.map(x => `<button type="button" class="gd-esq-rel-fila" data-ir-esquema="${esc(x.eid)}" data-globo="Esquema">
          <span class="gd-chip gd-chip--esquema${x.personaje ? ' gd-chip--per' : ''}">E</span><span class="gd-esq-rel-nom"></span><span class="gd-esq-rel-ruta"></span></button>`).join('')
        || '<div class="gd-etq-vacia">Aún no tiene carril en ningún esquema</div>'}</div>`;
    /* la etiqueta de la derecha va corta (cabía a duras penas); lo largo se lee en el globo */
    const donde = x => x.personaje ? (x.principal ? 'Suyo' : 'Personaje') : x.contenedor;
    $$('.gd-esq-rel-fila', sec).forEach((b, i) => {
      $('.gd-esq-rel-nom', b).textContent = lista[i].nombre;
      $('.gd-esq-rel-ruta', b).textContent = donde(lista[i]);
      b.dataset.globoTxt = lista[i].nombre + ' · ' + (lista[i].personaje
        ? (lista[i].principal ? 'su propio esquema de personaje' : 'esquema de personaje') : 'en «' + lista[i].contenedor + '»');
    });
    return sec;
  }
  function bloqueApariciones(m, pid) {
    const lista = m.menciones(pid), esquemas = m.esquemasDePersonaje(pid);
    const sec = document.createElement('section');
    sec.className = 'gd-bloque gd-bloque--apariciones'; sec.dataset.seccion = 'apariciones';
    sec.innerHTML = seccionHtml('apariciones', 'Apariciones', lista.length + esquemas.length, '');
    const tablero = document.createElement('div');
    tablero.className = 'gd-tablero'; tablero.dataset.sub = m.bibliotecaPersonaje(pid).id;
    const card = tarjetaApariciones(lista); card.dataset.expClave = 'apariciones';   // su botón de expandir
    tablero.appendChild(card);
    tablero.appendChild(tarjetaEsquemas(esquemas));
    sec.appendChild(tablero);
    return sec;
  }

  C.gestor = { iniciar, menuConectar, alternarConexion, chipsConexiones, fragmentoHtml, pop: (t, nodo) => abrirPop(t, nodo), cerrarPop: () => cerrarPop(), hayPop: () => !!abierto, expandir, contraer: () => { if (expandido) expandido = null; }, pedirPersonaje, pedirNombre, menuLista, renombrarPersonaje, menuCarril, paletaTrama, mostrar, salir, reiniciar, render, abrirNota, cerrarNota, abrirSub, estiloHijo, nuevoContenedor, notaAbierta: () => notaAbierta, subActual: () => actual,
    expandidoActual: () => expandido && Object.assign({}, expandido), abrirPapelera, sinVolver: () => { notaAntes = null; },
    /* la nota elegida con su panel abierto, y elegir una (sin pintar: lo hace lo que se abra después) — las pestañas */
    notaElegida: () => (ladoId && notaSel === ladoId ? notaSel : null), elegirNota: id => { if (ladoId && ladoId !== id) cerrarLado(); notaSel = id || null; reabrir = !!id; }, documentos: () => (o.guion ? modelo() : null), PAPELERA,
    /* la ventana de una nota (1.1.54): lo escrito en ella, a la nota (antes de guardar, de Claude, de cambiar de pestaña…); ponerla
       al día con lo de fuera; si está abierta, y cerrarla. Cmd+F en la biblioteca. */
    guardarPanel: () => guardarLadoYa(), refrescarVentana, ventanaAbierta, cerrarVentana: () => { if (ladoId) { cerrarLado(); soltarSeleccion(); } }, buscarEnVista,
    /* enlaces (1.1.52): la nota marcada con un clic (lo elegido, para Cmd+Shift+C), llevar el árbol a una pieza y una sección a la vista */
    notaMarcada: () => notaSel, revelar, verSeccion,
    /* las plantillas de nota (1.1.56): su tablero, crear desde una (sin `pid`, se elige), elegir una, guardar una nota como
       plantilla, si su tablero es el de delante y la última biblioteca normal que se vio */
    abrirPlantillas, desdePlantilla, elegirPlantilla, guardarComoPlantilla, esPlantillas, ultimaBiblioteca: () => ultimaNormal,
    /* las fórmulas (1.1.60): su tablero, una en su ventana, guardar una nota como fórmula, crear una con un texto (el lienzo) y si
       su tablero es el de delante; `abrirEspecial(id)`, el tablero de una biblioteca especial por su id */
    abrirFormulas, abrirFormula, guardarComoFormula, crearFormula, esFormulas, abrirEspecial, esEspecial: especial,
    /* e insertar una en la nota de la ventana, en el cursor (sin `pid`, se elige antes) */
    insertarPlantilla: pid => insertarPlantillaEnVentana(pid || null),
    /* los lienzos de nodos (1.1.58): crear uno (Archivo › Nuevo lienzo…) y el menú «Añadir al lienzo…» */
    nuevoLienzo: (cid, carpetaId, grupoId) => nuevoLienzo(cid, carpetaId || null, grupoId || null), menuAnadirAlLienzo };
})(window.Claquedraw);
