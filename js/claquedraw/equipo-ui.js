/* ClapCraft · los duendes del asistente en la app (1.1.68): el diálogo «Duendes del asistente» y el almacén del equipo.

   Leo, 28-09-2026: «Que los agentes personalizados (al igual que los personajes) tengan su duende propio… Los agentes personalizados
   pueden configurarse el modelo de manera individual, pero proponiendo deepseek-v4-pro… El asistente IA es un duende también, que sea
   "El duende maestro"… no es un duende que pueda eliminarse.» Los datos y sus reglas son de js/claquedraw/equipo.js (`C.equipo`:
   normalizar, crear, editar, eliminar, mover); aquí:
   - **dónde vive**: en todos sus proyectos, en los datos de la app (`editorAPI.equipo`, electron/equipo.js; en el navegador, el
     localStorage `guiones.claquedraw.equipo`). Cuando otra ventana lo cambia, llega `alCambiar` y se vuelve a leer.
   - **el diálogo** (`abrir(op)`): arriba el modo del equipo (Fiel / Libre) y las rondas; a la izquierda la lista (una ficha pequeña
     con el color de su ropa y su inicial, nombre, papel y modelo; los fijos con candado) y «＋ Nuevo duende especial»; a la derecha la
     ficha del elegido: su retrato animado (duendes.html?embebido=1&retrato=1), nombre, personalidad (solo los especiales; de los
     fijos, qué hacen), rol, modelo (propone deepseek-v4-pro a los especiales y al coordinador), temperatura, voz, «se enoja a
     menudo», «✎ Editar su duende» (el creador de duendes, creador-duende.js) y «Eliminar» (no los fijos; con Deshacer en el aviso).
     Todo se guarda al momento (el nombre y la personalidad, al dejar de escribir).
   - Mientras está abierto (o el creador encima), las teclas no llegan a la app de debajo (oyente en captura en `window`, como el
     creador) ni los clics al tablero de tramas.
   - **el respaldo** (Leo, 29-09-2026: «agrega la posibilidad de hacer un respaldo de los duendes, para importarlos si cambio de equipo
     de cómputo»; el mismo que en ClapBook): al pie, «Exportar respaldo…» (`exportar`: el archivo de `C.equipo.respaldo`, «Duendes de
     ClapCraft AAAA-MM-DD.json», con los disfraces y máscaras de los mods del teatro que usan sus duendes; con el diálogo de guardar
     del sistema o, en el navegador, una descarga) e «Importar respaldo…» (`importar`: el selector de archivos,
     `C.equipo.leerRespaldo` y una pregunta de la propia ventana —«Añadir a los míos», de partida, o «Reemplazar todos», con lo que
     trae—; se aplica con `C.equipo.importarRespaldo` y los mods que falten aquí con `C.equipo.importarMods`, se guarda al momento y
     el aviso trae «Deshacer», que también quita los mods que llegaron). Soltar un .json sobre la ventana también lo importa. Mientras
     está abierto el diálogo del sistema, no se piden dos; al volver, el foco vuelve al botón (las teclas siguen siendo de la ventana).
   Ganchos (`iniciar(g)`, todos opcionales: sin ellos, los de esta ventana): leer () → Promise<equipo | null>, escribir (equipo) →
   Promise<{ ok, error? }>, modelos () → [{ id, nombre, entrada, salida, nota }], avisar (msg, acciones), alCambiar (fn) →
   desuscribir, mods () → los mods del teatro (para el creador y el respaldo; objeto o Promise), y para el respaldo: escribirMods
   (mods) (los de todos los proyectos, con los que llegaron), guardarArchivo (texto, nombre) → Promise<ruta | nombre | null
   (cancelado)>, abrirArchivo () → Promise<{ nombre, texto } | null> y version () → Promise<'1.1.68' | null>. */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const E = () => C.equipo;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, t = 16) => `<svg width="${t}" height="${t}" aria-hidden="true"><use href="#${n}"></use></svg>`;
  const copia = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const bonito = id => { const s = String(id).replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
  const num = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const CLAVE_LOCAL = 'guiones.claquedraw.equipo';

  /* ---------- lo que se enseña de cada papel ---------- */
  const PAPEL = { maestro: 'Maestro', lector: 'Lector', escritor: 'Escritor', coordinador: 'Coordinador', especial: 'Especial' };
  const QUE_HACE = {
    maestro: 'El duende maestro no tiene personalidad: es tu asistente y coordina al equipo. Habla contigo en el chat, decide qué hay que escribir y se lo encarga a los demás.',
    lector: 'Lee las fuentes (el esquema, el guion, las notas que le pasen) y arma un dossier con los hechos, cada uno con su cita. No escribe nada nuevo.',
    escritor: 'Escribe solo con el dossier del lector y lo que pediste. En modo Fiel, lo que falte lo deja como [hueco: …]; en Libre, lo que invente va marcado entre ⟦ ⟧.',
    coordinador: 'Trabaja con los resultados de los demás: revisa lo escrito contra el dossier y las fuentes y, si algo no cuadra, lo devuelve a la escritora con los problemas. Se enoja a menudo: está corrigiendo.'
  };
  /* qué hace cada fijo y la temperatura de su papel: las del motor (C.equipo.PAPELES); estas, si aún no está */
  const queHace = papel => { const P = E() && E().PAPELES; return (P && P[papel] && P[papel].que) || QUE_HACE[papel] || ''; };
  function tempDePapel(papel, modo) {
    const e = E(), P = e && e.PAPELES && e.PAPELES[papel];
    if (papel === 'escritor') return ((e && e.TEMP_ESCRITOR) || { fiel: 0.5, libre: 0.8 })[modo === 'libre' ? 'libre' : 'fiel'];
    if (P && Number.isFinite(P.temperatura)) return P.temperatura;
    return { lector: 0.2, coordinador: 0, especial: 0.3 }[papel];
  }
  const COLOR_PAPEL = { maestro: '#7a4fb0', lector: '#3d7ec8', escritor: '#2f8f6b', coordinador: '#5a5aa8', especial: '#c8553d' };
  const ROLES = [
    { id: 'vetar', n: 'Revisa y puede vetar', d: 'Si algo no le cuadra, lo devuelve a la escritora y vuelve a pasar por el coordinador y por él.', rol: 'revisar', veto: true },
    { id: 'revisar', n: 'Revisa sin vetar', d: 'Da sus notas, que van en el informe; no detiene el trabajo.', rol: 'revisar', veto: false },
    { id: 'transformar', n: 'Transforma el texto', d: 'Lo reescribe con su personalidad, sin cambiar lo que pasa ni lo que se dice.', rol: 'transformar', veto: false }
  ];
  const rolDe = d => (d.rol === 'transformar' ? 'transformar' : d.veto ? 'vetar' : 'revisar');
  const MODOS = {
    fiel: 'Solo lo que está en tus fuentes: lo que falte queda como [hueco: …] para que lo escribas tú.',
    libre: 'Puede inventar lo que falte, pero lo inventado sale marcado entre ⟦ ⟧ para que lo revises.'
  };

  /* ---------- los ganchos y el almacén ---------- */
  let g = {}, iniciado = false, desoir = null;
  const oyentes = new Set();
  const api = () => (raiz.editorAPI && raiz.editorAPI.equipo ? raiz.editorAPI.equipo : null);
  const DEFECTO = {
    async leer() {
      const a = api();
      if (a) return a.leer();
      try { const t = localStorage.getItem(CLAVE_LOCAL); return t ? JSON.parse(t) : null; } catch (_) { return null; }
    },
    async escribir(eq) {
      const a = api();
      if (a) return a.escribir(eq);
      try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(eq)); return { ok: true }; } catch (e) { return { ok: false, error: 'No se pudieron guardar los duendes: ' + ((e && e.message) || e) }; }
    },
    modelos: () => (C.asistenteMotor && C.asistenteMotor.MODELOS) || [],
    avisar(msg, acciones) { try { raiz.Tramas.tablero.avisar(msg, acciones); } catch (_) {} },
    alCambiar(fn) {
      const a = api();
      if (a && a.alCambiar) return a.alCambiar(fn);
      const f = e => { if (e.key === CLAVE_LOCAL) fn(); };
      raiz.addEventListener('storage', f);
      return () => raiz.removeEventListener('storage', f);
    },
    async mods() {
      try { const t = raiz.editorAPI && raiz.editorAPI.teatro; if (t && t.leer) return (await t.leer()) || {}; } catch (_) {}
      try { const t = localStorage.getItem(CLAVE_MODS); return t ? JSON.parse(t) : {}; } catch (_) { return {}; }
    },
    /* (sin app.js, la copia de los mods de esta ventana no se entera: app.js pasa el suyo, `escribirModsGlobales`) */
    async escribirMods(m) {
      const t = raiz.editorAPI && raiz.editorAPI.teatro;
      if (t && t.escribir) return t.escribir(m);
      try { localStorage.setItem(CLAVE_MODS, JSON.stringify(m)); } catch (_) {}
      return m;
    },
    /* el respaldo: en la app, con los diálogos del sistema (file:save y file:open de main.js); en el navegador, una descarga y un
       <input type="file"> */
    async guardarArchivo(texto, nombre) {
      const a = raiz.editorAPI;
      if (a && a.saveFile) return a.saveFile({ defaultPath: nombre, content: texto, filters: [FILTRO_RESPALDO] });
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      const el = document.createElement('a');
      el.href = url; el.download = nombre; el.hidden = true;
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return nombre;
    },
    async abrirArchivo() {
      const a = raiz.editorAPI;
      if (a && a.openFile) { const r = await a.openFile({ filters: [FILTRO_RESPALDO] }); return r ? { nombre: r.name, texto: String(r.content == null ? '' : r.content) } : null; }
      return elegirEnNavegador();
    },
    async version() {
      const a = raiz.editorAPI;
      try { return a && a.version ? await a.version() : null; } catch (_) { return null; }
    }
  };
  const gancho = k => (typeof g[k] === 'function' ? g[k] : DEFECTO[k]);
  const CLAVE_MODS = 'guiones.claquedraw.teatroMods';
  const FILTRO_RESPALDO = { name: 'Respaldo de duendes', extensions: ['json'] };
  /* el selector de archivos del navegador: resuelve con { nombre, texto } o null si se cancela */
  function elegirEnNavegador() {
    return new Promise(resolver => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = '.json,application/json'; i.hidden = true;
      let hecho = false;
      const fin = v => { if (hecho) return; hecho = true; i.remove(); resolver(v); };
      i.addEventListener('change', () => { const f = i.files && i.files[0]; if (!f) { fin(null); return; } leerArchivo(f).then(fin, () => fin(null)); });
      i.addEventListener('cancel', () => fin(null));
      document.body.appendChild(i);
      i.click();
    });
  }
  const leerArchivo = f => f.text().then(texto => ({ nombre: f.name || 'respaldo.json', texto: String(texto) }));
  /* los mods del teatro de todos los proyectos (para el respaldo): {} si no se pueden leer */
  async function modsAqui() { try { return (await gancho('mods')()) || {}; } catch (_) { return {}; } }

  function iniciar(ganchos) {
    g = ganchos || {};
    iniciado = true;
    if (desoir) { try { desoir(); } catch (_) {} }
    desoir = null;
    try { const u = gancho('alCambiar')(() => { recargar(); }); if (typeof u === 'function') desoir = u; } catch (_) {}
    return leer();
  }
  const asegurar = () => { if (!iniciado) iniciar({}); };

  let eq = null;                     // el equipo, normalizado
  let leyendo = null;
  function normalizar(x) {
    const e = E(); if (!e) return x || null;
    try { return e.normalizar(x); } catch (err) { console.error(err); return e.porDefecto ? e.porDefecto() : x; }
  }
  /* lee el almacén (una vez; `forzar` vuelve a leer) → el equipo normalizado. La primera vez, si normalizar lo cambió (el de partida,
     o uno de una versión de antes), se guarda así; al releer por un aviso de otra ventana, no (dos ventanas no se contestan). */
  function leer(forzar) {
    asegurar();
    if (leyendo && !forzar) return leyendo;
    leyendo = Promise.resolve().then(() => gancho('leer')()).catch(() => null).then(x => {
      const n = normalizar(x);
      if (!n) return eq;
      eq = n;
      if (!forzar && JSON.stringify(x) !== JSON.stringify(n)) guardar(true);
      avisarCambio();
      return eq;
    });
    return leyendo;
  }
  function recargar() {
    return leer(true).then(() => { if (capa) pintar({ suave: true }); return eq; });
  }
  /* lo último leído, sin esperar (antes de leer nada, el de partida) */
  function equipo() {
    asegurar();
    if (!eq) { const e = E(); if (e && e.porDefecto) eq = e.porDefecto(); if (!leyendo) leer(); }
    return eq;
  }
  function alCambio(fn) { if (typeof fn !== 'function') return () => {}; oyentes.add(fn); return () => oyentes.delete(fn); }
  function avisarCambio() { for (const f of [...oyentes]) { try { f(eq); } catch (err) { console.error(err); } } }

  let tGuardar = 0, guardando = Promise.resolve({ ok: true }), estadoGuardado = '', sucio = false;
  function guardar(ya) {
    clearTimeout(tGuardar);
    if (!ya) { sucio = true; tGuardar = setTimeout(() => guardar(true), 300); return guardando; }
    sucio = false;
    const datos = copia(eq);
    guardando = guardando.catch(() => {}).then(() => gancho('escribir')(datos)).then(r => {
      estadoGuardado = r && r.ok === false ? (r.error || 'No se pudieron guardar los duendes') : 'ok';
      pintarGuardado();
      return r || { ok: true };
    }, err => { estadoGuardado = 'No se pudieron guardar los duendes: ' + ((err && err.message) || err); pintarGuardado(); return { ok: false, error: estadoGuardado }; });
    return guardando;
  }
  /* lo pendiente, ya; sin nada pendiente, no escribe (al cerrar el diálogo, al salir de un campo, ⌘S): con dos ventanas, la que no
     cambió nada escribía su copia (sin lo último de la otra, que aún no le había llegado por `equipo:cambio`) encima de lo que la
     otra acababa de guardar (visto al portarlo a ClapBook) */
  const guardarYa = () => (sucio ? guardar(true) : guardando);
  /* un cambio del modelo: `r = { ok, equipo, error? }` → el equipo nuevo, guardado y avisado */
  function aplicar(r, op) {
    if (!r || r.ok === false || !r.equipo) { if (r && r.error) mostrarError(r.error); return false; }
    eq = r.equipo;
    mostrarError('');
    guardar(op && op.ya);
    avisarCambio();
    return true;
  }
  const avisar = (msg, acc) => { try { gancho('avisar')(msg, acc); } catch (_) {} };

  /* ====================================================================
     El diálogo
     ==================================================================== */
  let capa = null, sel = null, focoAntes = null, tTexto = 0, pendienteTexto = null, marcoListo = false, tGesto = 0, obsTema = null;
  let pregunta = null, ocupado = false;                             // la pregunta de importar (dentro de la ventana) y un diálogo del sistema abierto
  let modsVista = null;                                             // los mods del teatro para el retrato (un disfraz de los mods se ve)
  const q = s => capa && capa.querySelector(s);
  const qq = s => (capa ? [...capa.querySelectorAll(s)] : []);
  const duendes = () => (eq && Array.isArray(eq.duendes) ? eq.duendes : []);
  const duendeDe = id => duendes().find(d => d.id === id) || null;
  function tema() {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  const colorDe = d => { const a = d ? aspectoDe(d) : null; return a && /^#[0-9a-f]{6}$/i.test(a.cloth || '') ? a.cloth : COLOR_PAPEL[d && d.papel] || COLOR_PAPEL.especial; };
  const inicial = d => { const n = String((d && d.nombre) || '?').replace(/^(el|la|los|las)\s+(duende\s+)?/i, '').trim(); return (n.charAt(0) || '?').toUpperCase(); };
  function modelos() {
    let l = [];
    try { l = gancho('modelos')() || []; } catch (_) {}
    if (!l.length) l = DEFECTO.modelos();
    return l.filter(m => m && m.id);
  }
  const corto = id => String(id || '').replace(/^deepseek-/, '');
  function propuesto(d) {
    const e = E() || {};
    if (d.papel === 'especial') return e.MODELO_ESPECIAL || 'deepseek-v4-pro';
    if (d.papel === 'coordinador') return e.MODELO_COORDINADOR || 'deepseek-v4-pro';
    if (d.papel === 'lector' || d.papel === 'escritor') return e.MODELO_BARATO || 'deepseek-v4-flash';
    return null;
  }
  const precio = m => (Number.isFinite(m.entrada) && Number.isFinite(m.salida) ? ` · ${num(m.entrada)} / ${num(m.salida)} USD por millón` : '');

  async function abrir(op) {
    op = op || {};
    asegurar();
    if (!E()) { avisar('Falta el motor del equipo (js/claquedraw/equipo.js)'); return false; }
    await leer();
    if (!eq) return false;
    if (!capa) { crear(); modsAqui().then(m => { modsVista = m; if (capa) retrato(); }); }
    if (op.nuevo) nuevoEspecial();
    else if (op.id && duendeDe(op.id)) sel = op.id;
    else if (!duendeDe(sel)) sel = (E().maestro ? (E().maestro(eq) || {}).id : null) || (duendes()[0] || {}).id;
    pintar();
    const n = op.nuevo && q('[data-eq-campo="nombre"]');
    if (n) { n.focus(); n.select(); } else { const b = q(`.eq-item[data-eq-id="${cssId(sel)}"]`); if (b) b.focus(); }
    return true;
  }
  const cssId = id => (raiz.CSS && CSS.escape ? CSS.escape(String(id || '')) : String(id || '').replace(/"/g, '\\"'));
  function crear() {
    focoAntes = document.activeElement;
    capa = document.createElement('div');
    capa.className = 'eq-capa';
    capa.innerHTML = `<div class="eq-ventana" role="dialog" aria-modal="true" aria-labelledby="eqTitulo">
      <header class="eq-cab">
        <div><div class="dlg-ceja">Asistente IA</div><p class="dlg-titulo" id="eqTitulo">Duendes del asistente</p></div>
        <span class="eq-hueco"></span>
        <button type="button" class="icono eq-cerrar" data-eq-cerrar title="Cerrar (Esc)" aria-label="Cerrar">${ic('ic-close')}</button>
      </header>
      <section class="eq-modo" aria-label="Cómo trabaja el equipo">
        <div class="eq-modo-fila">
          <span class="eq-rot">Modo del equipo</span>
          <div class="as-seg eq-seg" role="radiogroup" aria-label="Modo del equipo">
            <button type="button" role="radio" data-eq-modo="fiel">Fiel</button><button type="button" role="radio" data-eq-modo="libre">Libre</button>
          </div>
          <span class="eq-modo-txt"></span>
          <label class="eq-rondas"><span class="eq-rot">Rondas</span><select data-eq-rondas aria-label="Rondas como mucho">${[1, 2, 3, 4].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>
        </div>
        <p class="eq-modo-nota">Cuando le pides algo de cierta extensión, el duende maestro se lo encarga a su equipo: el lector, la escritora, el coordinador y los especiales que elijas en la conversación. Las rondas son las vueltas que puede dar el texto entre la escritora y los que revisan.</p>
      </section>
      <div class="eq-cuerpo">
        <nav class="eq-lista" aria-label="Duendes">
          <div class="eq-items" role="listbox" aria-label="Duendes del asistente"></div>
          <button type="button" class="btn eq-nuevo" data-eq-nuevo>${ic('ic-plus', 14)} Nuevo duende especial</button>
        </nav>
        <div class="eq-ficha">
          <div class="eq-retrato">
            <div class="eq-marco-caja"><iframe class="eq-marco" title="Su duende" tabindex="-1"></iframe></div>
            <div class="eq-retrato-acc">
              <button type="button" class="btn eq-aspecto" data-eq-aspecto>${ic('ic-edit', 14)} <span>Editar su duende</span></button>
              <button type="button" class="btn eq-probar" data-eq-probar title="Verlo enojado un momento">😠 Enojo</button>
              <button type="button" class="btn eq-oir" data-eq-oir title="Oír su voz" hidden>▶ Voz</button>
            </div>
          </div>
          <div class="eq-campos"></div>
        </div>
      </div>
      <footer class="eq-pie">
        <div class="eq-respaldo">
          <button type="button" class="btn" data-eq-exportar title="Guarda en un archivo todos tus duendes (el equipo, los especiales y los disfraces y máscaras de los mods que usan) para llevarlos a otro equipo de cómputo">${ic('ic-export', 14)} Exportar respaldo…</button>
          <button type="button" class="btn" data-eq-importar title="Trae los duendes de un respaldo (de ClapCraft o de ClapBook); también puedes soltar el archivo aquí">${ic('ic-import', 14)} Importar respaldo…</button>
        </div>
        <span class="eq-error" role="alert"></span><span class="eq-guardado" aria-live="polite"></span><span class="eq-hueco"></span>
        <button type="button" class="btn primario" data-eq-cerrar>Listo</button></footer>
      <div class="eq-soltar" aria-hidden="true"><span>Suelta el respaldo de tus duendes (.json)</span></div>
    </div>`;
    /* lo que se pulsa aquí no llega a la app de debajo (el tablero de tramas oye en document) */
    for (const t of ['click', 'dblclick', 'contextmenu', 'pointerdown', 'mousedown', 'wheel', 'keyup']) capa.addEventListener(t, e => e.stopPropagation());
    capa.addEventListener('click', alClic);
    capa.addEventListener('input', alEscribir);
    capa.addEventListener('change', alCambiar);
    capa.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('[data-eq-campo="nombre"], [data-eq-campo="personalidad"]')) terminarTexto(e.target); });
    /* un clic en el fondo (fuera de la ventana) cierra, como la ventana de una nota */
    capa.addEventListener('mousedown', e => { capa._fuera = e.target === capa; });
    capa.addEventListener('click', e => { if (capa && e.target === capa && capa._fuera) cerrar(); });
    /* soltar un respaldo (.json) sobre la ventana lo importa; lo que se suelta aquí no llega a la app (app.js abriría el archivo) */
    const conArchivos = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
    capa.addEventListener('dragover', e => {
      if (!conArchivos(e)) return;
      e.preventDefault(); e.stopPropagation();
      const vale = !pregunta && !ocupado;
      e.dataTransfer.dropEffect = vale ? 'copy' : 'none';
      q('.eq-ventana').classList.toggle('soltando', vale);
    });
    capa.addEventListener('dragleave', e => { if (!e.relatedTarget || !capa.contains(e.relatedTarget)) q('.eq-ventana').classList.remove('soltando'); });
    capa.addEventListener('drop', e => {
      if (!conArchivos(e)) return;
      e.preventDefault(); e.stopPropagation();
      q('.eq-ventana').classList.remove('soltando');
      if (pregunta || ocupado) return;
      const fs = [...(e.dataTransfer.files || [])];
      const f = fs.find(x => /\.json$/i.test(x.name || '') || /json/.test(x.type || ''));
      if (!f) { mostrarError('Suelta un archivo .json con el respaldo de tus duendes.'); return; }
      leerArchivo(f).then(a => importar({ archivo: a }), () => mostrarError('No se pudo leer ' + (f.name || 'el archivo') + '.'));
    });
    const f = q('.eq-marco');
    marcoListo = false;
    f.addEventListener('load', () => { marcoListo = true; retrato(); });
    f.src = 'duendes.html?embebido=1&retrato=1&tema=' + tema();
    document.body.appendChild(capa);
    document.body.classList.add('con-equipo');
    raiz.addEventListener('keydown', teclas, true);
    /* el retrato sigue al tema de la app (cambiarlo con el diálogo abierto lo dejaba en el de antes) */
    obsTema = new MutationObserver(() => { const D = marco(); if (D && typeof D.tema === 'function') { try { D.tema(tema()); } catch (_) {} } });
    obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- pintar ---------- */
  function pintar(op) {
    if (!capa || !eq) return;
    if (!duendeDe(sel)) sel = (duendes()[0] || {}).id || null;
    pintarModo(); pintarLista();
    /* con el foco en el nombre o la personalidad (otra ventana cambió algo), la ficha no se rehace: se perdería lo que se escribe */
    const a = document.activeElement;
    if (op && op.suave && a && capa.contains(a) && a.matches('input, textarea')) return;
    pintarFicha(); pintarGuardado(); retrato();
  }
  function pintarModo() {
    const modo = eq.modo === 'libre' ? 'libre' : 'fiel';
    qq('[data-eq-modo]').forEach(b => { const si = b.dataset.eqModo === modo; b.classList.toggle('on', si); b.setAttribute('aria-checked', si); b.tabIndex = si ? 0 : -1; });
    q('.eq-modo-txt').textContent = MODOS[modo];
    const r = q('[data-eq-rondas]'); if (r && document.activeElement !== r) r.value = String(eq.rondas || 2);
  }
  function itemHtml(d) {
    const m = d.modelo ? corto(d.modelo) : (d.papel === 'maestro' ? 'el de Configurar IA' : corto(propuesto(d)));
    return `<button type="button" class="eq-item${d.id === sel ? ' on' : ''}" role="option" aria-selected="${d.id === sel}" tabindex="${d.id === sel ? 0 : -1}" data-eq-id="${esc(d.id)}">
      <span class="eq-chip" style="--eq-c:${esc(colorDe(d))}" aria-hidden="true">${esc(inicial(d))}</span>
      <span class="eq-item-t"><span class="eq-item-n">${esc(d.nombre || 'Sin nombre')}</span><span class="eq-item-m">${esc(PAPEL[d.papel] || d.papel)} · ${esc(m)}</span></span>
      ${d.fijo ? `<span class="eq-candado" title="Fijo: no se elimina" aria-label="Fijo">${ic('ic-candado', 13)}</span>` : ''}</button>`;
  }
  function pintarLista() {
    const l = duendes(), fijos = l.filter(d => d.fijo), esp = l.filter(d => !d.fijo);
    const el = q('.eq-items'), top = el.scrollTop;
    el.innerHTML = `<div class="eq-grupo-t">El equipo</div>${fijos.map(itemHtml).join('')}
      <div class="eq-grupo-t">Especiales <span>${esp.length}</span></div>${esp.length ? esp.map(itemHtml).join('') : '<p class="eq-vacio">Aún no hay duendes especiales. Uno especial revisa o transforma el texto con la personalidad que le des.</p>'}`;
    el.scrollTop = top;
  }
  function pintarFicha() {
    const d = duendeDe(sel), c = q('.eq-campos');
    if (!d) { c.innerHTML = ''; return; }
    const esEsp = d.papel === 'especial', maestro = d.papel === 'maestro';
    const lista = modelos(), prop = propuesto(d);
    const opciones = [];
    if (maestro || d.modelo == null) opciones.push(`<option value=""${d.modelo == null ? ' selected' : ''}>El de Configurar IA</option>`);
    for (const m of lista) opciones.push(`<option value="${esc(m.id)}"${m.id === d.modelo ? ' selected' : ''}>${esc(m.nombre || m.id)}${m.id === prop ? ' (propuesto)' : ''}${esc(precio(m))}</option>`);
    if (d.modelo && !lista.some(m => m.id === d.modelo)) opciones.push(`<option value="${esc(d.modelo)}" selected>${esc(d.modelo)}</option>`);
    const tPapel = maestro ? null : tempDePapel(d.papel, eq.modo);
    const tDePapel = d.temperatura == null;
    const tVal = tDePapel ? (tPapel == null ? 0.7 : tPapel) : d.temperatura;
    const voces = (C.teatroMods && C.teatroMods.VOCES) || [];
    const lugar = esEsp ? duendes().filter(x => !x.fijo) : [];
    const i = lugar.findIndex(x => x.id === d.id);
    const rol = rolDe(d);
    const max = (E() && E().MAX_PERSONALIDAD) || 4000;
    c.innerHTML = `
      <div class="eq-f-cab">
        <span class="eq-papel${d.fijo ? ' fijo' : ''}">${d.fijo ? ic('ic-candado', 12) : ''}${esc(PAPEL[d.papel] || d.papel)}${d.fijo ? ' · no se elimina' : ''}</span>
        <span class="eq-hueco"></span>
        ${esEsp ? `<button type="button" class="icono" data-eq-mover="-1" title="Subirlo en la lista" aria-label="Subirlo" ${i <= 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icono" data-eq-mover="1" title="Bajarlo en la lista" aria-label="Bajarlo" ${i < 0 || i >= lugar.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
      </div>
      <label class="eq-campo"><span class="eq-rot">Nombre</span>
        <input type="text" data-eq-campo="nombre" maxlength="60" value="${esc(d.nombre || '')}" spellcheck="false" aria-label="Nombre"></label>
      ${esEsp ? `<label class="eq-campo eq-campo-pers"><span class="eq-rot">Personalidad <span class="eq-cuenta" data-eq-cuenta>${(d.personalidad || '').length} / ${max}</span></span>
          <textarea data-eq-campo="personalidad" rows="6" maxlength="${max}" aria-label="Personalidad" placeholder="Quién es y cómo trabaja. Por ejemplo: «Eres un editor de diálogos obsesionado con que cada personaje hable distinto; marca las frases que podría decir cualquiera»">${esc(d.personalidad || '')}</textarea>
          <span class="eq-nota">Es su personalidad durante toda la conversación: la adopta al elegirlo en el asistente y no la cambia.</span></label>
        <div class="eq-campo"><span class="eq-rot">Qué hace con el texto</span>
          <div class="eq-roles" role="radiogroup" aria-label="Qué hace con el texto">${ROLES.map(r => `<button type="button" role="radio" class="eq-rol${r.id === rol ? ' on' : ''}" aria-checked="${r.id === rol}" tabindex="${r.id === rol ? 0 : -1}" data-eq-rol="${r.id}"><b>${esc(r.n)}</b><span>${esc(r.d)}</span></button>`).join('')}</div></div>`
        : `<div class="eq-campo"><span class="eq-rot">${maestro ? 'Personalidad' : 'Qué hace'}</span><p class="eq-explica">${esc(queHace(d.papel))}</p></div>`}
      <div class="eq-dos">
        <label class="eq-campo"><span class="eq-rot">Modelo</span><select data-eq-campo="modelo" aria-label="Modelo">${opciones.join('')}</select>
          <span class="eq-nota">${maestro ? 'Sin elegir, el de Claude › Configurar IA.' : prop ? `Propuesto: <code>${esc(prop)}</code>${esEsp || d.papel === 'coordinador' ? ', que trabaja con los resultados de los demás' : ', el barato'}.` : ''}</span></label>
        <div class="eq-campo"><span class="eq-rot">Temperatura <b class="eq-temp-v" data-eq-temp-v>${tDePapel && maestro ? 'la de Configurar IA' : num(tVal)}</b></span>
          <label class="eq-casilla"><input type="checkbox" data-eq-temp-papel ${tDePapel ? 'checked' : ''}> <span>${maestro ? 'La de Configurar IA' : `La de su papel (${num(tPapel)})`}</span></label>
          <input type="range" min="0" max="1.5" step="0.05" value="${tVal}" data-eq-campo="temperatura" aria-label="Temperatura" ${tDePapel ? 'disabled' : ''}>
          <span class="eq-nota">Más baja, más apegado a lo que tiene; más alta, más libre.</span></div>
      </div>
      <div class="eq-dos">
        <label class="eq-campo"><span class="eq-rot">Voz</span><select data-eq-campo="voz" aria-label="Voz">
          <option value=""${!d.voz ? ' selected' : ''}>La de su duende</option>${voces.map(v => `<option value="${esc(v)}"${v === d.voz ? ' selected' : ''}>${esc(bonito(v))}</option>`).join('')}</select>
          <span class="eq-nota">Con el sonido del asistente encendido, «habla» con ella.</span></label>
        ${esEsp ? `<div class="eq-campo"><span class="eq-rot">Carácter</span><label class="eq-casilla"><input type="checkbox" data-eq-enojon ${d.enojon ? 'checked' : ''}> <span>Se enoja a menudo al trabajar</span></label>
          <span class="eq-nota">Como el coordinador: está corrigiendo.</span></div>` : '<div></div>'}
      </div>
      ${esEsp ? `<div class="eq-peligro"><button type="button" class="btn eq-eliminar" data-eq-eliminar>${ic('ic-trash', 14)} <span>Eliminar este duende</span></button></div>` : ''}`;
    const asp = q('[data-eq-aspecto] span'); if (asp) asp.textContent = d.duende ? 'Editar su duende' : 'Crear su duende';
    q('[data-eq-probar]').hidden = !d.enojon;
    pintarOir();
  }
  function pintarGuardado() {
    const el = q('.eq-guardado'); if (!el) return;
    el.textContent = estadoGuardado === 'ok' ? '✓ Guardado en este equipo (vale en todos tus proyectos)' : '';
    if (estadoGuardado && estadoGuardado !== 'ok') mostrarError(estadoGuardado);
  }
  function mostrarError(t) { const el = q('.eq-error'); if (el) el.textContent = t || ''; }

  /* ---------- el retrato ---------- */
  function marco() { const f = q('.eq-marco'); return f && marcoListo && f.contentWindow && f.contentWindow.Duendes ? f.contentWindow.Duendes : null; }
  function aspectoDe(d) {
    if (d.duende) return copia(d.duende);
    const e = E();
    try { if (e && typeof e.aspectoDe === 'function') return copia(e.aspectoDe(d)) || {}; } catch (_) {}
    return {};
  }
  function retrato() {
    const D = marco(), d = duendeDe(sel); if (!D || !d) return;
    try { D.retrato(Object.assign({ duende: Object.assign(aspectoDe(d), { nombre: d.nombre }), nombre: d.nombre }, modsVista ? { mods: modsVista } : {})); } catch (err) { console.error(err); }
    pintarOir();
  }
  function pintarOir() { const b = q('[data-eq-oir]'), D = marco(); if (b) b.hidden = !(D && typeof D.hablar === 'function'); }
  function probarEnojo() {
    const D = marco(), d = duendeDe(sel); if (!D || !d) return;
    clearTimeout(tGesto);
    try { D.previa(Object.assign(aspectoDe(d), { nombre: d.nombre }), { gesto: 'enojado' }); } catch (_) {}
    tGesto = setTimeout(retrato, 2600);                          // el retrato entero, quieto otra vez
  }
  function oir() {
    const D = marco(), d = duendeDe(sel); if (!D || !d || typeof D.hablar !== 'function') return;
    const voz = d.voz || (d.duende && d.duende.voz) || (E() && E().vozDe ? E().vozDe(d) : null) || null;   // la misma que en la mascota
    try { D.hablar({ texto: 'Hola, soy ' + (d.nombre || 'un duende') + '. A trabajar.', voz }); } catch (err) { console.error(err); }
  }

  /* ---------- cambiar ---------- */
  function editar(cambios, op) {
    const d = duendeDe(sel); if (!d) return false;
    return aplicar(E().editarDuende(eq, d.id, cambios), op);
  }
  function alClic(e) {
    const b = e.target.closest('button'); if (!b || !capa.contains(b)) return;
    if (b.matches('[data-eq-preg]')) { responder(b.dataset.eqPreg); return; }
    if (b.matches('[data-eq-cerrar]')) { cerrar(); return; }
    if (b.matches('[data-eq-exportar]')) { exportar(); return; }
    if (b.matches('[data-eq-importar]')) { importar(); return; }
    if (b.matches('[data-eq-id]')) { elegir(b.dataset.eqId); return; }
    if (b.matches('[data-eq-nuevo]')) { if (nuevoEspecial()) { pintar(); const n = q('[data-eq-campo="nombre"]'); if (n) { n.focus(); n.select(); } } return; }
    if (b.matches('[data-eq-modo]')) { cambiarEquipo({ modo: b.dataset.eqModo }); return; }
    if (b.matches('[data-eq-rol]')) {
      const r = ROLES.find(x => x.id === b.dataset.eqRol);
      if (r && editar({ rol: r.rol, veto: r.veto }, { ya: true })) { pintarFicha(); const n = q(`[data-eq-rol="${r.id}"]`); if (n) n.focus(); }
      return;
    }
    if (b.matches('[data-eq-mover]')) { mover(Number(b.dataset.eqMover)); return; }
    if (b.matches('[data-eq-aspecto]')) { editarAspecto(); return; }
    if (b.matches('[data-eq-probar]')) { probarEnojo(); return; }
    if (b.matches('[data-eq-oir]')) { oir(); return; }
    if (b.matches('[data-eq-eliminar]')) {
      if (!b.classList.contains('seguro')) { b.classList.add('seguro'); b.querySelector('span').textContent = '¿Eliminarlo? Otra vez para confirmar'; return; }
      eliminar(sel);
    }
  }
  function elegir(id, foco) {
    if (!duendeDe(id)) return;
    terminarPendiente();
    sel = id;
    pintarLista(); pintarFicha(); retrato();
    const b = q(`.eq-item[data-eq-id="${cssId(id)}"]`); if (b && foco !== false) b.focus();
  }
  /* modo y rondas: del equipo (no de un duende); normalizar los recorta */
  function cambiarEquipo(cambios) {
    const e = E();
    const r = typeof e.ajustar === 'function' ? e.ajustar(eq, cambios) : { ok: true, equipo: normalizar(Object.assign(copia(eq), cambios)) };
    if (!aplicar(r, { ya: true })) return;
    pintarModo();
    if ('modo' in cambios) { pintarFicha(); pintarLista(); }
  }
  function alEscribir(e) {
    const t = e.target;
    if (t.matches('[data-eq-campo="nombre"], [data-eq-campo="personalidad"]')) {
      const campo = t.dataset.eqCampo;
      if (campo === 'personalidad') { const c = q('[data-eq-cuenta]'); if (c) c.textContent = t.value.length + ' / ' + ((E() && E().MAX_PERSONALIDAD) || 4000); }
      /* lo de otro campo que esperaba, antes: si no, este lo pisaría y se perdería (el nombre, si enseguida se escribía en la
         personalidad sin salir del campo; visto al portarlo a ClapBook) */
      if (pendienteTexto && pendienteTexto.el !== t) terminarPendiente();
      pendienteTexto = { id: sel, campo, el: t };
      clearTimeout(tTexto);
      tTexto = setTimeout(terminarPendiente, 350);
      return;
    }
    if (t.matches('[data-eq-campo="temperatura"]')) {
      const v = Math.round(Number(t.value) * 100) / 100;
      const s = q('[data-eq-temp-v]'); if (s) s.textContent = num(v);
      editar({ temperatura: v });
      return;
    }
  }
  function alCambiar(e) {
    const t = e.target;
    if (t.matches('[data-eq-rondas]')) { cambiarEquipo({ rondas: Number(t.value) }); return; }
    if (t.matches('[data-eq-campo="modelo"]')) { if (editar({ modelo: t.value || null }, { ya: true })) { pintarLista(); pintarFicha(); focoEn('[data-eq-campo="modelo"]'); } return; }
    if (t.matches('[data-eq-campo="voz"]')) { editar({ voz: t.value || null }, { ya: true }); pintarLista(); return; }
    if (t.matches('[data-eq-temp-papel]')) {
      const d = duendeDe(sel); if (!d) return;
      const v = t.checked ? null : (d.papel === 'maestro' ? 0.7 : tempDePapel(d.papel, eq.modo));
      if (editar({ temperatura: v }, { ya: true })) { pintarFicha(); focoEn('[data-eq-temp-papel]'); }
      return;
    }
    if (t.matches('[data-eq-enojon]')) { if (editar({ enojon: !!t.checked }, { ya: true })) { q('[data-eq-probar]').hidden = !t.checked; } return; }
  }
  const focoEn = s => { const el = q(s); if (el) el.focus(); };
  /* el nombre y la personalidad se aplican al dejar de escribir (y al salir del campo) sin rehacer la ficha */
  function terminarPendiente() {
    clearTimeout(tTexto);
    const p = pendienteTexto; pendienteTexto = null;
    if (!p || !duendeDe(p.id)) return;
    const v = p.campo === 'nombre' ? p.el.value.replace(/\s+/g, ' ').trim() : p.el.value;
    if (p.campo === 'nombre' && !v) return;                        // vacío: se queda el de antes (al salir se repone)
    const r = E().editarDuende(eq, p.id, { [p.campo]: v });
    if (aplicar(r) && p.campo === 'nombre' && capa) {
      const b = q(`.eq-item[data-eq-id="${cssId(p.id)}"] .eq-item-n`); if (b) b.textContent = v;
      const ch = q(`.eq-item[data-eq-id="${cssId(p.id)}"] .eq-chip`); if (ch) ch.textContent = inicial(duendeDe(p.id));
    }
  }
  function terminarTexto(el) {
    terminarPendiente();
    const d = duendeDe(sel);
    if (d && el.dataset.eqCampo === 'nombre' && el.value.trim() !== (d.nombre || '')) el.value = d.nombre || '';
    guardarYa();
  }
  function nuevoEspecial() {
    terminarPendiente();
    const e = E(), usados = new Set(duendes().map(d => (d.nombre || '').toLowerCase()));
    let nombre = 'Duende especial', n = 2;
    while (usados.has(nombre.toLowerCase())) nombre = 'Duende especial ' + n++;
    const r = e.crearEspecial(eq, { nombre, personalidad: '', rol: 'revisar', veto: true, modelo: e.MODELO_ESPECIAL || 'deepseek-v4-pro', enojon: true });
    if (!aplicar(r, { ya: true })) return null;
    sel = r.duende ? r.duende.id : sel;
    return r.duende || null;
  }
  function mover(dir) {
    const lugar = duendes().filter(x => !x.fijo), i = lugar.findIndex(x => x.id === sel);
    if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= lugar.length) return;
    /* `antesDe`: delante de quién queda (null, al final) */
    const antesDe = dir < 0 ? lugar[j].id : (lugar[j + 1] ? lugar[j + 1].id : null);
    if (aplicar(E().moverDuende(eq, sel, antesDe), { ya: true })) { pintarLista(); pintarFicha(); focoEn(`[data-eq-mover="${dir}"]:not([disabled])`); }
  }
  function eliminar(id) {
    const d = duendeDe(id); if (!d) return;
    terminarPendiente();
    const lista = duendes(), quitado = copia(d);
    const r = E().eliminarDuende(eq, id);
    const idx = r && Number.isInteger(r.indice) ? r.indice : lista.findIndex(x => x.id === id);
    if (!aplicar(r, { ya: true })) return;
    const resto = duendes(), sig = resto[Math.min(idx, resto.length - 1)];
    sel = sig ? sig.id : null;
    pintar();
    const b = q(`.eq-item[data-eq-id="${cssId(sel)}"]`); if (b) b.focus();
    avisar('Duende «' + (quitado.nombre || 'especial') + '» eliminado', [{ texto: 'Deshacer', fn: () => restaurar(quitado, idx) }]);
  }
  /* «Deshacer» del aviso: vuelve a su sitio (con lo que haya cambiado después en los demás) */
  function restaurar(d, idx) {
    if (!eq || duendeDe(d.id)) return;
    const x = copia(eq);
    x.duendes.splice(Math.max(0, Math.min(idx, x.duendes.length)), 0, d);
    const n = normalizar(x); if (!n) return;
    aplicar({ ok: true, equipo: n }, { ya: true });
    if (capa) { sel = d.id; pintar(); }
    avisar('Duende «' + (d.nombre || 'especial') + '» recuperado');
  }

  /* ---------- su aspecto: el creador de duendes ---------- */
  async function editarAspecto() {
    const d = duendeDe(sel); if (!d || !C.creadorDuende) return;
    terminarPendiente();
    let mods = {};
    try { mods = (await gancho('mods')()) || {}; } catch (_) {}
    const id = d.id;
    C.creadorDuende.abrir('equipo:' + id, {
      nombre: d.nombre, duende: d.duende || aspectoDe(d), mods,
      rotulo: 'Duende del asistente',
      textoQuitar: 'Quitarle su aspecto: vuelve al de su papel',
      guardar: datos => {
        if (!duendeDe(id)) return { ok: false, error: 'Ese duende ya no está' };
        if (datos) delete datos.nombre;
        const r = E().editarDuende(eq, id, { duende: datos || null });
        if (!r || r.ok === false) return { ok: false, error: (r && r.error) || 'No se pudo guardar su duende' };
        aplicar(r, { ya: true });
        return { ok: true };
      },
      avisar: msg => avisar(msg),
      alCerrar: () => {
        if (!capa) return;
        pintarLista(); pintarFicha(); retrato();
        const b = q('[data-eq-aspecto]'); if (b) b.focus();
      }
    });
  }

  /* ---------- el respaldo: exportar e importar los duendes ---------- */
  const nEsp = e => ((e && e.duendes) || []).filter(d => d && !d.fijo).length;
  const listaNombres = (l, max) => { const n = l.slice(0, max || 4).map(x => '«' + x + '»').join(', '); return l.length > (max || 4) ? n + ' y ' + (l.length - (max || 4)) + ' más' : n; };
  const nMods = n => n + (n === 1 ? ' mod del teatro' : ' mods del teatro');
  /* el foco vuelve a la ventana tras un diálogo del sistema (si no, Esc y Tab no tendrían dónde caer) */
  function volverFoco(s) {
    if (!capa) return;
    const a = document.activeElement;
    if (a && capa.contains(a) && a !== document.body) return;
    const b = q(s); if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
  }
  /* Exportar: todo el equipo (lo pendiente de escribir, antes) y los mods que usan sus duendes a «Duendes de ClapCraft
     AAAA-MM-DD.json». Sin la ventana abierta también vale (la orden `exportarDuendes`). → la ruta o el nombre, o null si se canceló */
  async function exportar() {
    if (ocupado) return null;
    asegurar();
    terminarPendiente();
    if (!eq) await leer();
    const e = E(); if (!e || !e.respaldo || !eq) { avisar('Falta el motor del equipo (js/claquedraw/equipo.js)'); return null; }
    ocupado = true;
    try {
      let version = null;
      try { version = await gancho('version')(); } catch (_) { version = null; }
      const r = e.respaldo(eq, { app: 'clapcraft', version: typeof version === 'string' ? version : null, mods: await modsAqui() });
      const ruta = await gancho('guardarArchivo')(JSON.stringify(r, null, 2) + '\n', e.nombreRespaldo({ app: 'clapcraft' }));
      if (!ruta) return null;                                       // canceló el diálogo
      const n = nEsp(r.equipo), m = r.mods ? (r.mods.vestuarios || []).length + (r.mods.mascaras || []).length : 0;
      avisar('Respaldo guardado: ' + n + (n === 1 ? ' duende especial' : ' duendes especiales') + (m ? ' y ' + nMods(m) : ''));
      return ruta;
    } catch (err) {
      const m = 'No se pudo guardar el respaldo: ' + ((err && err.message) || err);
      if (capa) mostrarError(m); else avisar(m);                  // con la ventana, al pie; sin ella, en el aviso
      return null;
    } finally { ocupado = false; volverFoco('[data-eq-exportar]'); }
  }
  /* Importar: abre la ventana si no lo está, pide el archivo (o toma `op.archivo` = { nombre, texto }, lo soltado), lo lee y pregunta.
     → true si llegó a preguntar */
  async function importar(op) {
    op = op || {};
    if (ocupado || pregunta) return false;
    asegurar();
    if (!capa) { const ok = await abrir({}); if (!ok) return false; }
    terminarPendiente();
    let a = op.archivo || null;
    if (!a) {
      ocupado = true;
      try { a = await gancho('abrirArchivo')(); } catch (err) { a = null; mostrarError('No se pudo leer el archivo: ' + ((err && err.message) || err)); }
      finally { ocupado = false; volverFoco('[data-eq-importar]'); }
    }
    if (!a) return false;
    const l = E().leerRespaldo(a.texto);
    if (!l.ok) { if (capa) mostrarError(l.error); else avisar(l.error); return false; }
    const mods = l.mods ? await modsAqui() : null;
    if (!capa) { const ok = await abrir({}); if (!ok) return false; }
    if (pregunta) return false;
    mostrarError('');
    preguntar(l, a.nombre, mods);
    return true;
  }
  const FECHA = ts => { try { return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { return ''; } };
  /* la pregunta: lo que trae y qué hacer con ello, dentro de la ventana (no un confirm() del sistema) */
  function preguntar(l, nombre, mods) {
    cerrarPregunta();
    const e = E(), esp = (l.equipo.duendes || []).filter(d => !d.fijo);
    const an = e.importarRespaldo(eq, l.equipo, 'anadir'), re = e.importarRespaldo(eq, l.equipo, 'reemplazar');
    const de = l.app ? (e.APPS_RESPALDO[l.app] || l.app) : null;
    const origen = [de ? 'de ' + de + (l.version ? ' ' + l.version : '') : null, l.exportado ? 'exportado el ' + FECHA(l.exportado) : null].filter(Boolean).join(', ');
    /* los mods que llegarían con cada opción (los que usan los duendes que quedan y no hay aquí) */
    const modsCon = r => (l.mods && e.importarMods ? e.importarMods(mods || {}, l.mods, r.equipo).anadidos.length : 0);
    const partes = (r, conQuitados) => {
      const t = [];
      if (r.anadidos) t.push(r.anadidos + (r.anadidos === 1 ? ' nuevo' : ' nuevos'));
      if (r.actualizados) t.push(r.actualizados + (r.actualizados === 1 ? ' se pone al día' : ' se ponen al día'));
      if (r.iguales) t.push(r.iguales + (r.iguales === 1 ? ' ya lo tienes igual' : ' ya los tienes iguales'));
      if (r.conservados) t.push(r.conservados + (r.conservados === 1 ? ' se queda el tuyo, más reciente' : ' se quedan los tuyos, más recientes'));
      if (r.sinSitio) t.push(r.sinSitio + (r.sinSitio === 1 ? ' no cabe' : ' no caben') + ' (' + (e.MAX_ESPECIALES || 40) + ' como mucho)');
      if (conQuitados && r.quitados) t.push(r.quitados + (r.quitados === 1 ? ' tuyo que no viene en él se quita' : ' tuyos que no vienen en él se quitan'));
      const m = modsCon(r); if (m) t.push(nMods(m) + ' que no tenías');
      return t.join(' · ') || 'nada cambia';
    };
    pregunta = document.createElement('div');
    pregunta.className = 'eq-preg-capa';
    pregunta.innerHTML = `<div class="eq-preg" role="alertdialog" aria-modal="true" aria-labelledby="eqPregT" aria-describedby="eqPregD">
        <div class="dlg-ceja">Importar respaldo</div>
        <p class="dlg-titulo" id="eqPregT">${esc(nombre || 'Respaldo de duendes')}</p>
        <div id="eqPregD">
          <p class="eq-preg-trae">Trae ${esp.length === 1 ? '1 duende especial' : esp.length + ' duendes especiales'}${esp.length ? ' (' + esc(listaNombres(esp.map(d => d.nombre))) + ')' : ''} y el equipo fijo${origen ? ', ' + esc(origen) : ''}.${l.nMods ? ' Con ' + (l.nMods === 1 ? 'el disfraz o la máscara' : 'los disfraces y máscaras') + ' de los mods del teatro que usan (' + esc(nMods(l.nMods)) + '): se añaden los que no tengas y, si ya tienes uno igual de nombre, se queda el tuyo.' : ''}</p>
          ${l.aviso ? `<p class="eq-preg-aviso">${esc(l.aviso)}</p>` : ''}
          <ul class="eq-preg-ops">
            <li><b>Añadir a los míos</b>: ${esc(partes(an))}. Tus duendes fijos, el modo y las rondas se quedan como están.</li>
            <li><b>Reemplazar todos</b>: tu equipo pasa a ser el del respaldo (modo ${esc(l.equipo.modo === 'libre' ? 'Libre' : 'Fiel')}, ${l.equipo.rondas} ${l.equipo.rondas === 1 ? 'ronda' : 'rondas'}, sus fijos y sus especiales): ${esc(partes(re, true))}.</li>
          </ul>
          <p class="eq-nota">Después podrás deshacerlo desde el aviso.</p>
        </div>
        <div class="eq-preg-bot">
          <button type="button" class="btn" data-eq-preg="cancelar">Cancelar</button>
          <span class="eq-hueco"></span>
          <button type="button" class="btn" data-eq-preg="reemplazar">Reemplazar todos</button>
          <button type="button" class="btn primario" data-eq-preg="anadir">Añadir a los míos</button>
        </div>
      </div>`;
    pregunta._leido = l;
    q('.eq-ventana').appendChild(pregunta);
    const b = pregunta.querySelector('[data-eq-preg="anadir"]'); if (b) b.focus();
  }
  function cerrarPregunta() {
    if (!pregunta) return;
    pregunta.remove(); pregunta = null;
    volverFoco('[data-eq-importar]');
  }
  function responder(que) {
    const l = pregunta && pregunta._leido;
    if (!l || (que !== 'anadir' && que !== 'reemplazar')) { cerrarPregunta(); return; }
    cerrarPregunta();
    aplicarRespaldo(l, que);
  }
  /* aplica, guarda al momento (el equipo y, si llegaron, los mods) y avisa con «Deshacer» (vuelve el equipo de antes, tal cual, y
     quita los mods que llegaron si siguen como llegaron) */
  async function aplicarRespaldo(l, modo) {
    const antes = copia(eq);
    const r = E().importarRespaldo(eq, l.equipo, modo);
    if (!aplicar({ ok: true, equipo: r.equipo }, { ya: true })) return null;
    if (capa) {
      const nuevo = r.anadidos ? (duendes().filter(d => !d.fijo && !(antes.duendes || []).some(x => x.id === d.id))[0] || null) : null;
      if (nuevo) sel = nuevo.id; else if (!duendeDe(sel)) sel = (duendes()[0] || {}).id || null;
      pintar();
      volverFoco('[data-eq-importar]');
    }
    let rm = null;
    if (l.mods && E().importarMods) {
      try {
        rm = E().importarMods(await modsAqui(), l.mods, r.equipo);
        if (rm.cambio) await gancho('escribirMods')(rm.mods); else rm = null;
      } catch (err) { rm = null; mostrarError('Los duendes llegaron, pero no se pudieron guardar sus mods del teatro: ' + ((err && err.message) || err)); }
      if (rm && capa) { modsVista = rm.mods; retrato(); }           // el retrato, ya con su disfraz
    }
    let msg;
    if (modo === 'reemplazar') msg = 'Duendes reemplazados por los del respaldo (' + nEsp(r.equipo) + (nEsp(r.equipo) === 1 ? ' especial)' : ' especiales)');
    else {
      const t = [];
      if (r.anadidos) t.push(r.anadidos + (r.anadidos === 1 ? ' duende nuevo' : ' duendes nuevos'));
      if (r.actualizados) t.push(r.actualizados + (r.actualizados === 1 ? ' puesto al día' : ' puestos al día'));
      msg = t.length ? 'Importados: ' + t.join(' y ') : 'Nada que importar: ya tenías esos duendes';
      if (r.sinSitio) msg += ' · ' + r.sinSitio + (r.sinSitio === 1 ? ' no cupo' : ' no cupieron');
    }
    if (rm) msg += ' · ' + nMods(rm.anadidos.length);
    avisar(msg, [{ texto: 'Deshacer', fn: () => deshacerImportacion(antes, rm ? rm.anadidos : null) }]);
    return r;
  }
  async function deshacerImportacion(antes, modsAnadidos) {
    const n = normalizar(antes); if (!n) return;
    aplicar({ ok: true, equipo: n }, { ya: true });
    if (capa) { if (!duendeDe(sel)) sel = (duendes()[0] || {}).id || null; pintar(); }
    if (modsAnadidos && modsAnadidos.length && E().quitarMods) {
      try { const x = E().quitarMods(await modsAqui(), modsAnadidos); if (x.quitados) await gancho('escribirMods')(x.mods); } catch (_) { /* los duendes ya volvieron */ }
    }
    avisar('Importación deshecha: vuelven tus duendes de antes');
  }

  /* ---------- cerrar ---------- */
  function cerrar() {
    if (!capa) return;
    if (pregunta) { cerrarPregunta(); return; }                    // la pregunta de importar va delante: Esc, Cmd+W o el fondo la cierran a ella
    if (C.creadorDuende && C.creadorDuende.abierto && C.creadorDuende.abierto()) C.creadorDuende.cerrar();
    terminarPendiente();
    guardarYa();
    clearTimeout(tGesto);
    if (obsTema) { obsTema.disconnect(); obsTema = null; }
    try { const D = marco(); if (D) D.detener(); } catch (_) {}
    raiz.removeEventListener('keydown', teclas, true);
    capa.remove(); capa = null; marcoListo = false;
    document.body.classList.remove('con-equipo');
    const f = focoAntes; focoAntes = null;
    if (f && f.isConnected && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (_) {} }
  }
  const abierto = () => !!capa;

  /* ---------- el teclado ----------
     Todo pasa por aquí (en captura en window) y no sigue: nada llega a la app de debajo. Con el creador encima, manda él. Lo que es
     del navegador (escribir, Tab, Enter y espacio en un botón, las listas desplegables) sigue igual. Esc cierra; ⌘S guarda ya; en la
     lista, ↑ ↓ pasan de duende. */
  function teclas(e) {
    if (!capa) return;
    if (C.creadorDuende && C.creadorDuende.abierto && C.creadorDuende.abierto()) return;
    if (e.target && e.target.closest && e.target.closest('#asistente')) return;
    e.stopPropagation();
    const k = e.key, mod = e.metaKey || e.ctrlKey, a = document.activeElement;
    if (k === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); terminarPendiente(); guardarYa(); return; }
    if (mod && (k === 'w' || k === 'W')) { e.preventDefault(); cerrar(); return; }
    if (k === 'Tab' && !mod) {
      const l = enfocables(); if (!l.length) return;
      const i = l.indexOf(a);
      if (i < 0 || (!e.shiftKey && i === l.length - 1) || (e.shiftKey && i === 0)) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0].focus(); }
      return;
    }
    if (mod || e.altKey || !a || !capa.contains(a)) return;
    if (pregunta) {
      /* en la pregunta, ← → pasan de botón; lo demás (Enter, espacio) es del botón */
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && a.matches('[data-eq-preg]')) {
        e.preventDefault();
        const l = enfocables(), i = l.indexOf(a);
        l[(i + (k === 'ArrowRight' ? 1 : -1) + l.length) % l.length].focus();
      }
      return;
    }
    if (a.matches('.eq-item') && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End')) {
      e.preventDefault();
      const l = qq('.eq-item'), i = l.indexOf(a);
      const j = k === 'Home' ? 0 : k === 'End' ? l.length - 1 : Math.max(0, Math.min(l.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
      if (l[j]) elegir(l[j].dataset.eqId);
      return;
    }
    if (a.matches('[role="radio"]') && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) {
      e.preventDefault();
      const grupo = [...a.parentElement.querySelectorAll('[role="radio"]')], i = grupo.indexOf(a);
      const j = (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + grupo.length) % grupo.length;
      grupo[j].click(); const n = q(grupo[j].dataset.eqRol ? `[data-eq-rol="${grupo[j].dataset.eqRol}"]` : `[data-eq-modo="${grupo[j].dataset.eqModo}"]`); if (n) n.focus();
    }
  }
  function enfocables() {
    if (pregunta) return [...pregunta.querySelectorAll('button:not([disabled])')];
    return qq('button:not([disabled]), select:not([disabled]), textarea, input:not([disabled]), [tabindex="0"]').filter(el => el.tabIndex >= 0 && el.offsetParent !== null && !el.hidden);
  }
  /* Edición › Deshacer / Rehacer del menú de Electron (el acelerador se come ⌘Z antes de la página): con el foco en un campo de aquí,
     lo escrito; si no, nada (los cambios de los duendes se guardan al momento; eliminar trae su «Deshacer» en el aviso). → si lo atendió */
  function historia(accion) {
    if (!capa) return false;
    const a = document.activeElement;
    if (a && capa.contains(a) && a.matches('input[type="text"], textarea')) { document.execCommand(accion === 'redo' ? 'redo' : 'undo'); return true; }
    return true;
  }

  C.equipoUI = {
    iniciar, abrir, cerrar, abierto, equipo, leer, recargar, alCambio, historia, exportar, importar,
    /* guardar lo pendiente ya (antes de cerrar la ventana o salir) */
    guardarYa: () => { terminarPendiente(); return guardarYa(); },
    /* para las pruebas: el elegido y si está la pregunta de importar */
    _elegido: () => sel,
    _pregunta: () => !!pregunta
  };
})(typeof window !== 'undefined' ? window : globalThis);
