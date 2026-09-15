/* Claquedraw · pantallas de proyecto (Leo, 15-09-2026, docs/diseno/rediseno-13/)
   - «Nuevo proyecto» (`#nuevoProyecto`): el proyecto es la pestaña, así que crearlo vive en una pestaña propia junto a los
     abiertos (se puede dejar a medias y volver). A la izquierda, en la lateral de 320 px, el nombre y dónde se guarda; a la
     derecha las plantillas (js/claquedraw/plantillas.js) y, de la elegida, el árbol y las tramas exactas que va a crear.
     Enter crea, Esc cancela.
   - «Sin proyectos» (`#sinProyectos`): sin pestañas abiertas, el menú queda en su riel y en el centro «Nuevo proyecto», «Abrir
     un proyecto» y los recientes; un .clapcraft soltado en la ventana también se abre (app.js).
   Este módulo pinta y guarda lo que se va escribiendo en la pestaña de creación; crear, abrir y las pestañas son de app.js. */
(function (C) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, t, st) => `<svg width="${t}" height="${t}"${st ? ` style="${st}"` : ''} aria-hidden="true"><use href="#ic-${n}"></use></svg>`;
  const LOGO = t => `<span class="logo" style="--logo:${t}px" aria-hidden="true"><img src="img/clapcraft.svg" alt="" class="logo-claro"><img src="img/clapcraft-oscuro.svg" alt="" class="logo-oscuro"></span>`;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const TIPO = { principal: 'PRINCIPAL', secundaria: 'SECUNDARIA', alterna: 'ALTERNATIVA' };
  let o = {}, estado = null, version = '';

  /* ---------- Nuevo proyecto ---------- */
  /* `estado` = { nombre, plantilla, carpeta: { texto, ruta?, handle? } | null }: vive mientras la pestaña esté abierta */
  function empezar() {
    if (estado) return;
    estado = { nombre: '', plantilla: C.plantillas.PLANTILLAS[0].id, carpeta: null };
    Promise.resolve(o.carpetaInicial && o.carpetaInicial()).then(c => { if (estado && !estado.carpeta && c) { estado.carpeta = c; pintarCarpeta(); } });
  }
  function descartar() { estado = null; }

  function render() {
    const s = $('nuevoProyecto'); if (!s || !estado) return;
    const P = C.plantillas;
    s.innerHTML = `
      <aside class="np-lado">
        <div class="gd-marca">${LOGO(27)}<span>ClapCraft</span></div>
        <div class="np-form">
          <label class="np-campo"><span class="np-rotulo">NOMBRE DEL PROYECTO</span>
            <input type="text" class="np-nombre" data-np-nombre maxlength="120" placeholder="Sin título" autocomplete="off" spellcheck="false"></label>
          <div class="np-campo"><span class="np-rotulo">DÓNDE SE GUARDA</span>
            <button type="button" class="np-destino" data-np-carpeta title="Elegir la carpeta donde se guarda el archivo del proyecto">${ic('folder', 15)}<span class="np-destino-txt" data-np-carpeta-txt></span><span class="np-cambiar">Cambiar</span></button></div>
        </div>
        <div class="np-pie">El proyecto se abre como una pestaña más. Todo lo que cree la plantilla se puede renombrar o borrar después.</div>
      </aside>
      <div class="np-cuerpo">
        <header class="esq-cab np-cab"><span class="np-miga">NUEVO PROYECTO</span>${ic('chev-r', 13)}<span class="np-miga-nom">Plantilla</span><span class="spacer"></span><span class="np-cuenta">${P.PLANTILLAS.length} PLANTILLAS</span></header>
        <div class="np-contenido">
          <div class="np-plantillas" role="radiogroup" aria-label="Plantilla"></div>
          <div class="np-fichas">
            <div class="np-ficha np-arbol"><div class="np-rotulo">ÁRBOL QUE CREA</div><div class="np-arbol-filas" data-np-arbol></div></div>
            <div class="np-ficha np-tramas"><div class="np-ficha-cab"><span class="np-rotulo">TRAMAS QUE CREA</span><i></i><span class="np-rotulo" data-np-cuenta-tramas></span></div><div data-np-tramas></div></div>
          </div>
        </div>
        <footer class="np-barra"><span class="np-rotulo">ENTER CREA · ESC CANCELA</span><span class="spacer"></span>
          <button type="button" class="btn np-cancelar" data-np-cancelar>Cancelar</button>
          <button type="button" class="btn primario np-crear" data-np-crear>${ic('plus', 14)}Crear proyecto</button></footer>
      </div>`;
    const campo = s.querySelector('[data-np-nombre]'); campo.value = estado.nombre;
    pintarCarpeta(); pintarPlantillas();
  }
  function pintarCarpeta() {
    const t = document.querySelector('#nuevoProyecto [data-np-carpeta-txt]'); if (!t || !estado) return;
    t.textContent = estado.carpeta ? estado.carpeta.texto : (o.sinCarpeta || 'Solo en esta ventana');
    t.parentNode.title = estado.carpeta ? 'Se guarda en ' + estado.carpeta.texto + ' · Cambiar' : 'Elegir la carpeta donde se guarda el archivo del proyecto';
  }
  function pintarPlantillas() {
    const s = $('nuevoProyecto'); if (!s || !estado) return;
    const P = C.plantillas, p = P.plantilla(estado.plantilla);
    s.querySelector('.np-plantillas').innerHTML = P.PLANTILLAS.map(x => {
      const a = x.id === p.id;
      return `<button type="button" class="np-plantilla${a ? ' activa' : ''}" role="radio" aria-checked="${a}" data-np-plantilla="${x.id}">
        <span class="np-plantilla-cab"><span class="np-tono" style="background:var(--t-${x.tono})"></span><span class="np-plantilla-nom">${esc(x.nombre)}</span>${a ? ic('check', 14, 'color:var(--foco)') : ''}</span>
        <span class="np-plantilla-res">${esc(x.resumen)}</span>
        <span class="np-chips">${x.chips.map(c => `<span class="np-chip">${esc(c)}</span>`).join('')}</span></button>`;
    }).join('');
    s.querySelector('[data-np-arbol]').innerHTML = P.arbol(p.id).map(n => {
      const col = n.tipo === 'esquema' ? 'violeta' : n.tipo === 'biblioteca' ? 'azul' : null;
      const marca = n.tipo === 'contenedor' || n.tipo === 'carpeta'
        ? ic('folder', 14, `color:var(--t-${n.tipo === 'carpeta' ? p.carpeta : p.tono})`)
        : `<span class="np-etq" style="--tc:var(--t-${col});--tf:var(--f-${col})">${n.tipo === 'esquema' ? 'Esquema' : 'Biblioteca'}</span>`;
      return `<div class="np-fila${n.enlazada ? ' enlazada' : ''}${n.nivel ? '' : ' raiz'}" style="--nivel:${n.nivel}"${n.enlazada ? ' title="La biblioteca enlazada que se crea con cada esquema"' : ''}><i class="np-guia"></i>${marca}<span class="np-fila-nom${n.tipo === 'contenedor' || n.tipo === 'carpeta' ? ' fuerte' : ''}">${esc(n.nombre)}</span></div>`;
    }).join('');
    s.querySelector('[data-np-cuenta-tramas]').textContent = p.tramas.length + (p.tramas.length === 1 ? ' TRAMA' : ' TRAMAS');
    s.querySelector('[data-np-tramas]').innerHTML = p.tramas.map(([nombre, tipo, color]) => `
      <div class="np-trama" style="--tc:var(--t-${color})"><span class="np-trama-nom">${esc(nombre)}</span><span class="np-trama-tipo">${TIPO[tipo] || ''}</span>
        <i class="np-trama-raya"></i><i class="np-trama-nodo" style="left:40px"></i><i class="np-trama-nodo" style="left:150px"></i><i class="np-trama-nodo" style="left:280px"></i></div>`).join('');
  }
  function enfocar() { const c = document.querySelector('#nuevoProyecto [data-np-nombre]'); if (c) { c.focus(); c.select(); } }

  let creandoAhora = false;
  async function crear() {
    if (!estado || creandoAhora) return;
    const nombre = estado.nombre.trim();
    if (!nombre) {                                            // sin nombre no se crea: el campo lo pide
      const c = document.querySelector('#nuevoProyecto [data-np-nombre]');
      if (c) { c.classList.remove('falta'); void c.offsetWidth; c.classList.add('falta'); c.focus(); }
      return;
    }
    creandoAhora = true;
    try { await o.crear({ nombre, plantilla: estado.plantilla, carpeta: estado.carpeta }); } finally { creandoAhora = false; }
  }

  /* ---------- Sin proyectos ---------- */
  function renderVacio() {
    const s = $('sinProyectos'); if (!s) return;
    const rec = (o.recientes && o.recientes()) || [];
    const k = mac ? '⌘' : 'CTRL+';
    s.innerHTML = `
      <div class="sinp-riel"><span class="sinp-panel" aria-hidden="true">${ic('panel', 16)}</span></div>
      <div class="sinp-cuerpo">
        <div class="sinp-centro"><div class="sinp-caja">
          <div class="sinp-intro">${LOGO(34)}
            <h1>No hay ningún proyecto abierto</h1>
            <p>Cada proyecto se abre en su propia pestaña y trae consigo sus contenedores, sus personajes y sus documentos. Abre uno reciente o empieza desde una plantilla.</p></div>
          <div class="sinp-botones">
            <button type="button" class="btn primario" data-sinp-nuevo>${ic('plus', 15)}Nuevo proyecto</button>
            <button type="button" class="btn" data-sinp-abrir>${ic('folder', 15, 'color:var(--tenue)')}Abrir un proyecto</button></div>
          ${rec.length ? `<div class="sinp-recientes">
            <div class="sinp-sep"><span class="np-rotulo">RECIENTES</span><i></i><span class="np-rotulo">${rec.length} ${rec.length === 1 ? 'PROYECTO' : 'PROYECTOS'}</span></div>
            ${rec.map(r => `<button type="button" class="sinp-reciente" data-sinp-reciente="${esc(r.clave)}" title="${esc(r.ruta || r.nombre)}">
              <span class="np-tono" style="background:var(--t-${esc(r.tono)})"></span><span class="sinp-rec-nom">${esc(r.nombre)}</span>
              <span class="sinp-rec-dato">${esc(r.estructura || '')}</span><span class="spacer"></span><span class="sinp-rec-dato">${esc(C.plantillas.visto(r.visto))}</span>${ic('chev-r', 14)}</button>`).join('')}
          </div>` : ''}
          <div class="sinp-sep sinp-soltar"><span class="np-rotulo">O ARRASTRA UN .CLAPCRAFT A ESTA VENTANA</span><i></i></div>
        </div></div>
        <footer class="sinp-pie"><span>${k}N NUEVO</span><span>${k}O ABRIR</span><span class="spacer"></span><span data-sinp-version>CLAPCRAFT${version ? ' ' + esc(version) : ''}</span></footer>
      </div>`;
  }

  function iniciar(opciones) {
    o = opciones || {};
    Promise.resolve(o.version && o.version()).then(v => { if (!v) return; version = v; const e = document.querySelector('[data-sinp-version]'); if (e) e.textContent = 'CLAPCRAFT ' + v; }).catch(() => {});
    const np = $('nuevoProyecto'), sp = $('sinProyectos');
    np.addEventListener('input', e => {
      if (e.target.matches('[data-np-nombre]') && estado) { estado.nombre = e.target.value; e.target.classList.remove('falta'); }
    });
    np.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t || !estado) return;
      if (t.dataset.npPlantilla) { estado.plantilla = t.dataset.npPlantilla; pintarPlantillas(); const b = np.querySelector(`[data-np-plantilla="${t.dataset.npPlantilla}"]`); if (b) b.focus(); return; }
      if (t.matches('[data-np-carpeta]')) { const c = o.elegirCarpeta && await o.elegirCarpeta(estado.carpeta); if (c && estado) { estado.carpeta = c; pintarCarpeta(); } return; }
      if (t.matches('[data-np-cancelar]')) { o.cancelar(); return; }
      if (t.matches('[data-np-crear]')) crear();
    });
    /* flechas entre plantillas, como un grupo de radios */
    np.addEventListener('keydown', e => {
      const b = e.target.closest && e.target.closest('[data-np-plantilla]'); if (!b || !/^Arrow/.test(e.key)) return;
      const ids = C.plantillas.PLANTILLAS.map(p => p.id), i = ids.indexOf(b.dataset.npPlantilla);
      const salto = { ArrowLeft: -1, ArrowUp: -3, ArrowRight: 1, ArrowDown: 3 }[e.key];
      const j = Math.max(0, Math.min(ids.length - 1, i + salto)); e.preventDefault();
      estado.plantilla = ids[j]; pintarPlantillas(); np.querySelector(`[data-np-plantilla="${ids[j]}"]`).focus();
    });
    /* Enter crea y Esc cancela mientras se ve la pantalla (salvo en un botón con foco, que hace lo suyo con Enter) */
    document.addEventListener('keydown', e => {
      if (!document.body.classList.contains('pantalla-nuevo') || !estado || e.isComposing) return;
      if (document.querySelector('dialog[open]') || (C.gestor && C.gestor.hayPop())) return;
      if (e.key === 'Escape') { e.preventDefault(); o.cancelar(); }
      else if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button:not([data-np-plantilla])'))) { e.preventDefault(); crear(); }
    });
    sp.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.matches('[data-sinp-nuevo]')) o.nuevo();
      else if (t.matches('[data-sinp-abrir]')) o.abrir();
      else if (t.dataset.sinpReciente) o.abrirReciente(t.dataset.sinpReciente);
    });
  }

  C.proyectos = { iniciar, empezar, descartar, render, renderVacio, enfocar, crear, hay: () => !!estado, estado: () => estado };
})(window.Claquedraw);
