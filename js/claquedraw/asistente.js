/* ===== ClapCraft · el asistente con otra IA (1.1.59) =====
   Leo, 27-09-2026: «Implementa que pueda usar otras IAs en ClapCraft por medio de APIs para que funcionen igual que Claude Cowork…
   usa solo modelos de DeepSeek con el fin de que los costos no sean tan elevados… No tengo nada configurado ni sé cómo hacerlo, así
   que agrega un tutorial en la aplicación para configurarlo.»

   La interfaz, `Claquedraw.asistente`:
   · **El panel** (`#asistente`, a la derecha de `<main>`, en todas las vistas: el contenido se estrecha, no se tapa). Se ensancha
     arrastrando su borde izquierdo (doble clic: ancho de partida), se pliega a un riel de 40 px y se cierra. Cabecera con el modelo
     y lo gastado en la conversación, «Nueva conversación», ajustes, plegar y cerrar; los mensajes (los de Leo, con sus enlaces como
     chips; los del asistente en Markdown, y sus enlaces clapcraft:// llevan a su sitio por el gancho `irAEnlace`), cada llamada a
     una herramienta como una fila plegable («Leyó el esquema «X»», «Cambió el esquema «X» (5 cambios)» con Deshacer y Ver, que van
     al historial de Claude por los ganchos `deshacer`/`verCambio`), el texto que va llegando, «Detener» y el campo (Enter manda,
     Mayús+Enter salta de renglón). Sin clave, en lugar del chat, una bienvenida con «Configurar paso a paso».
   · **La configuración** (`#dlgIA`): proveedor (APIMart u otro compatible con OpenAI, con su dirección), la clave (la guarda el
     proceso principal cifrada; aquí solo se sabe si la hay y sus cuatro últimos caracteres), el modelo (los de DeepSeek con su
     precio aproximado, de `C.asistenteMotor`, o uno escrito a mano), la temperatura, el tope de gasto por conversación y «Probar
     conexión». En el navegador lo dice: es de la app de escritorio.
   · **El tutorial** (`#dlgTutorialIA`): ocho pasos en lenguaje llano, de qué es una API y cuánto cuesta a qué hacer si falla; los
     botones abren APIMart en el navegador del sistema (`abrirWeb`) y la clave se pega y se prueba en el propio diálogo. Se abre
     solo la primera vez que se abre el asistente sin clave, y desde la configuración, la bienvenida y el menú (`tutorial()`).

   `iniciar(ganchos)` lo llama app.js con: `transporte` (editorAPI.ia: config, guardarConfig, guardarClave, borrarClave, probar,
   chat, cancelar, alTrozo), `motor` (C.asistenteMotor, con su `Conversacion`), `ejecutar(nombre, args)` (en vivo), `estado()` (lo
   que hay en pantalla y el proyecto), `irAEnlace(url)`, `deshacer(entrada)` / `verCambio(entrada)` (del historial de Claude),
   `guardarConversacion(datos)` / `cargarConversacion()` (por proyecto, en la vista de esta máquina), `abrirWeb(url)` y
   `avisar(msg, acciones)`. Todos opcionales: sin transporte, el panel explica que es de la app de escritorio. */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  if (typeof document === 'undefined') return;

  /* ====================================================================
     Datos fijos
     ==================================================================== */
  const URL_APIMART = 'https://api.apimart.ai/v1';
  const WEB = {
    inicio: 'https://apimart.ai/es',
    panel: 'https://apimart.ai/billing',                        // «Billing»: el saldo y la recarga (comprobado el 27-09-2026)
    claves: 'https://apimart.ai/keys',
    precios: 'https://apimart.ai/es/model?type=chat&providers=DeepSeek',
    docs: 'https://docs.apimart.ai/'
  };
  /* los modelos de DeepSeek en APIMart, con su precio aproximado (USD por millón de tokens de entrada / salida; 27-09-2026). Si el
     motor exporta su tabla, manda la suya: esta es solo el respaldo */
  const MODELOS_RESPALDO = [
    { id: 'deepseek-v4-flash', entrada: 0.34, salida: 1.03, nota: 'Rápido y barato: el que te recomendamos', recomendado: true },
    { id: 'deepseek-v4.1-flash', entrada: 0.23, salida: 0.91, nota: 'Más nuevo y aún más barato' },
    { id: 'deepseek-v4-pro', entrada: null, salida: null, nota: 'El más capaz, y más caro' },
    { id: 'deepseek-v3.2', entrada: 0.21, salida: 0.31, nota: 'Económico' },
    { id: 'deepseek-v3.2-exp', entrada: null, salida: null, nota: 'Experimental' },
    { id: 'deepseek-v3-0324', entrada: 0.21, salida: 0.82, nota: 'Versión anterior' },
    { id: 'deepseek-v3.1-terminus', entrada: 0.41, salida: 1.22, nota: 'Versión anterior' },
    { id: 'deepseek-r1', entrada: 0.45, salida: 1.79, nota: 'Razona antes de contestar: más lento y más caro' },
    { id: 'deepseek-r1-0528', entrada: 0.45, salida: 1.79, nota: 'Razona antes de contestar: más lento y más caro' }
  ];
  const MODELO_DEFECTO = 'deepseek-v4-flash', TOPE_DEFECTO = 0.5, TEMP_DEFECTO = 0.7;
  const CLAVE_PREF = 'guiones.claquedraw.asistente';          // ancho, plegado y si ya se vio el tutorial: de esta máquina
  const ANCHO = { min: 300, max: 720, defecto: 380 };

  /* lo que dice cada herramienta mientras trabaja y cuando acaba (el nombre de lo tocado va detrás) */
  const VERBOS = {
    listar_proyectos: ['Mirando los proyectos', 'Miró los proyectos'],
    ver_proyecto: ['Mirando el proyecto', 'Miró el proyecto'],
    leer_esquema: ['Leyendo el esquema', 'Leyó el esquema'],
    editar_esquema: ['Cambiando el esquema', 'Cambió el esquema'],
    leer_documento: ['Leyendo el documento', 'Leyó el documento'],
    escribir_documento: ['Escribiendo en el documento', 'Escribió en el documento'],
    leer_biblioteca: ['Leyendo la biblioteca', 'Leyó la biblioteca'],
    editar_biblioteca: ['Organizando la biblioteca', 'Organizó la biblioteca'],
    editar_proyecto: ['Organizando el proyecto', 'Organizó el proyecto'],
    preparar_fragmentos: ['Preparando los fragmentos', 'Preparó los fragmentos'],
    leer_lienzo: ['Leyendo el lienzo', 'Leyó el lienzo'],
    editar_lienzo: ['Armando el lienzo', 'Armó el lienzo'],
    ejecutar_nodo: ['Leyendo el encargo del nodo', 'Leyó el encargo del nodo'],
    completar_nodo: ['Completando el nodo', 'Completó el nodo'],
    buscar: ['Buscando', 'Buscó'],
    ver_enlace: ['Leyendo el enlace', 'Leyó el enlace'],
    ver_historial: ['Mirando el historial', 'Miró el historial'],
    revertir_cambio: ['Revirtiendo un cambio', 'Revirtió un cambio'],
    mostrar_en_clapcraft: ['Enseñándotelo', 'Te lo enseñó'],
    usar_formula: ['Cargando la fórmula', 'Cargó la fórmula'],   // 1.1.60
    trabajar_en_equipo: ['El equipo está trabajando', 'El equipo trabajó'],   // 1.1.68: el equipo de duendes
    recordar_estilo: ['Aprendiendo', 'Aprendió'],                // la memoria de estilo (1.1.60): «Aprendió: …», con su Deshacer
    olvidar_estilo: ['Olvidando', 'Olvidó']
  };
  const ESCRIBEN = new Set(['recordar_estilo', 'olvidar_estilo', 'editar_esquema', 'escribir_documento', 'editar_biblioteca', 'editar_proyecto', 'editar_lienzo', 'completar_nodo', 'revertir_cambio']);
  /* qué hacer con cada error del proveedor, en palabras. Los códigos son los del transporte (electron/ia.js); los números HTTP
     valen también, por si llegan tal cual */
  const AYUDA_ERROR = {
    clave: { tit: 'La clave no vale', txt: 'APIMart no reconoce la clave. Cópiala otra vez desde apimart.ai/keys (entera, sin espacios) o crea una nueva y pégala en la configuración.', http: 401 },
    saldo: { tit: 'No queda saldo', txt: 'Tu cuenta de APIMart se quedó sin saldo. Recarga en tu panel de APIMart y pulsa «Reintentar».', http: 402 },
    modelo: { tit: 'Ese modelo no está disponible', txt: 'APIMart no deja usar ese modelo con tu cuenta, o su nombre no es exacto. Prueba con deepseek-v4-flash en la configuración.', http: 403 },
    limite: { tit: 'Demasiadas peticiones seguidas', txt: 'APIMart pide un respiro. Espera un minuto y vuelve a intentarlo.', http: 429 },
    servidor: { tit: 'APIMart tuvo un problema', txt: 'El fallo es suyo, no tuyo. Espera un poco y vuelve a intentarlo.', http: 500 },
    red: { tit: 'No hay conexión', txt: 'ClapCraft no llega a APIMart. Mira que tengas internet y vuelve a intentarlo.' },
    tiempo: { tit: 'Tardó demasiado', txt: 'La IA no contestó a tiempo. Vuelve a intentarlo; si pasa a menudo, pídele cosas más pequeñas.' },
    peticion: { tit: 'APIMart no entendió la petición', txt: 'Puede que la conversación sea ya muy larga: empieza una nueva (el «+» de arriba) y vuelve a pedírselo.', http: 400 },
    herramientas: { tit: 'El modelo no pudo usar las herramientas', txt: 'Prueba con deepseek-v4-flash en la configuración, que sabe usarlas.' },
    respuesta: { tit: 'La respuesta llegó rota', txt: 'La IA contestó algo que ClapCraft no pudo leer. Vuelve a intentarlo.' },
    sinClave: { tit: 'Falta la clave', txt: 'El asistente necesita tu clave de APIMart. Configúralo paso a paso: son unos 5 minutos.' },
    sinCifrado: { tit: 'Este equipo no puede guardar la clave cifrada', txt: 'Tu Mac no deja a ClapCraft usar el Llavero ahora mismo, y sin cifrar la clave no se guarda. Reinicia ClapCraft y, si sigue, comprueba que el Llavero de macOS está desbloqueado.' },
    cancelado: { tit: 'Detenido', txt: 'Lo paraste tú. Lo que ya hizo se queda (y se puede deshacer).' },
    topeDiario: { tit: 'Llegaste al tope de gasto de hoy', txt: 'Para cuidar tu saldo, el asistente no hace más llamadas hasta mañana. Si lo necesitas, sube el tope diario en la configuración.' },
    sinPrecio: { tit: 'Falta el precio del modelo', txt: 'Con otro proveedor, ClapCraft necesita saber cuánto cuesta el modelo para llevar la cuenta del gasto. Escríbelo en la configuración.' }
  };
  const HTTP = { 401: 'clave', 402: 'saldo', 403: 'modelo', 429: 'limite', 500: 'servidor', 502: 'servidor', 503: 'servidor', 400: 'peticion' };
  const ayudaDe = c => AYUDA_ERROR[c] || AYUDA_ERROR[HTTP[+c]] || null;
  const httpDe = c => { const a = ayudaDe(c); return a && a.http ? a.http : (/^\d{3}$/.test(String(c)) ? +c : null); };

  /* ====================================================================
     Utilidades
     ==================================================================== */
  /* los atajos como se escriben en cada sistema: «⌘⇧I» en el Mac, «Ctrl+Shift+I» en los demás */
  const MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent || '');
  const atajo = (tecla, shift) => (MAC ? '⌘' + (shift ? '⇧' : '') + tecla : 'Ctrl+' + (shift ? 'Shift+' : '') + tecla);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, t = 16) => `<svg width="${t}" height="${t}" aria-hidden="true"><use href="#${n}"></use></svg>`;
  /* 1.1.68: el altavoz del sonido (encendido y apagado) y el gorro de duende del botón «Duendes» (no están en el sprite) */
  const SVG_SONIDO = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z" fill="currentColor" fill-opacity=".18"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.9a5.8 5.8 0 0 1 0 8.2"/></svg>';
  const SVG_SONIDO_NO = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z" fill="currentColor" fill-opacity=".18"/><path d="M10.8 6.2l3.4 3.6M14.2 6.2l-3.4 3.6"/></svg>';
  const SVG_DUENDE = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3.5 9.5L8.6 1.6l3.9 7.9z" fill="currentColor" fill-opacity=".22"/><circle cx="8" cy="11.6" r="3"/><path d="M2.5 9.5h11"/></svg>';
  const corto = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const promesa = x => Promise.resolve().then(() => (typeof x === 'function' ? x() : x));
  function leerPref() { try { return JSON.parse(localStorage.getItem(CLAVE_PREF) || '{}') || {}; } catch (_) { return {}; } }
  function guardarPref() { try { localStorage.setItem(CLAVE_PREF, JSON.stringify(pref)); } catch (_) { /* sin almacenamiento: solo esta vez */ } }
  /* dinero en dólares, con coma: «0,012 USD» por debajo de diez céntimos, «0,45 USD» por encima */
  function usd(n) {
    const v = Math.max(0, +n || 0);
    const t = v === 0 ? '0,00' : v < 0.001 ? '<0,001' : v < 0.1 ? v.toFixed(3).replace('.', ',') : v.toFixed(2).replace('.', ',');
    return t + ' USD';
  }
  const miles = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const precioTxt = m => (m.entrada == null ? 'precio en APIMart' : `~${String(m.entrada).replace('.', ',')} / ~${String(m.salida).replace('.', ',')} USD`);

  /* ====================================================================
     Estado
     ==================================================================== */
  let g = {};                        // los ganchos de app.js
  let pref = leerPref();
  let cfg = null;                    // la configuración del transporte ({ proveedor, url, modelo, temperatura, tope, hayClave, finClave })
  let conv = null;                   // la conversación del motor
  let items = [];                    // lo que se ve: { tipo: 'yo'|'ia'|'paso'|'error'|'aviso', … }
  let coste = { usd: 0, entrada: 0, salida: 0 };
  let enCurso = false, iaActual = null, pintarPend = null, cargada = false;
  let panel = null, cuerpo = null, campo = null;
  let progreso = null;               // la ejecución de un nodo de lienzo: { lid, nodoId, alPaso }
  const hayTransporte = () => !!(g.transporte && typeof g.transporte.chat === 'function');
  const hayClave = () => !!(cfg && cfg.hayClave);
  const motor = () => g.motor || C.asistenteMotor || null;

  function modelos() {
    const M = motor(), t = M && (M.MODELOS || M.PRECIOS || M.modelos || M.precios);
    let lista = null;
    if (Array.isArray(t)) lista = t.map(x => ({ id: x.id || x.modelo || x.nombre, nombre: x.id ? x.nombre : null, entrada: x.entrada ?? x.input ?? x.in ?? null, salida: x.salida ?? x.output ?? x.out ?? null, nota: x.nota || x.descripcion || '', recomendado: !!x.recomendado }));
    else if (t && typeof t === 'object') lista = Object.keys(t).map(id => ({ id, entrada: t[id].entrada ?? t[id].input ?? null, salida: t[id].salida ?? t[id].output ?? null, nota: t[id].nota || '', recomendado: !!t[id].recomendado }));
    if (!lista || !lista.length) return MODELOS_RESPALDO;
    /* la nota y la recomendación del respaldo, si el motor no las trae */
    const may = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
    return lista.filter(m => m.id).map(m => { const r = MODELOS_RESPALDO.find(x => x.id === m.id) || {}; return { ...m, nota: may(m.nota || r.nota || ''), recomendado: m.recomendado || !!r.recomendado }; });
  }
  const modeloDe = id => modelos().find(m => m.id === id) || { id, entrada: null, salida: null, nota: '' };
  const modeloActual = () => (cfg && cfg.modelo) || MODELO_DEFECTO;
  const proveedorNombre = () => (!cfg || cfg.proveedor !== 'otro' ? 'APIMart' : (() => { try { return new URL(cfg.url).hostname; } catch (_) { return 'API propia'; } })());
  /* cómo firma el asistente sus cambios en el historial de Claude: «DeepSeek V4 Flash (APIMart)» */
  function origen() {
    if (g.origen) { try { const o = g.origen(modeloActual()); if (o) return o; } catch (_) { /* el de aquí */ } }
    const m = modeloActual(), dato = modelos().find(x => x.id === m);
    if (dato && dato.nombre) return dato.nombre + ' (' + proveedorNombre() + ')';
    const bonito = /^deepseek-/i.test(m) ? 'DeepSeek ' + m.slice(9).split('-').map(p => (/^v?\d/.test(p) ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join(' ') : m;
    return bonito + ' (' + proveedorNombre() + ')';
  }

  async function leerConfig() {
    if (!g.transporte || typeof g.transporte.config !== 'function') { cfg = null; return null; }
    try { cfg = await g.transporte.config(); } catch (_) { cfg = null; }
    return cfg;
  }
  async function guardarConfig(parcial) {
    if (!g.transporte || typeof g.transporte.guardarConfig !== 'function') return false;
    let r;
    try { r = await g.transporte.guardarConfig(parcial); } catch (e) { r = { ok: false, error: 'No se pudo guardar la configuración: ' + ((e && e.message) || e) }; }
    /* el transporte contesta { ok, config } o { ok: false, error } (una dirección que no es https, un modelo con espacios…) */
    if (r && r.ok === false) { errorConfig(r.error || 'No se pudo guardar'); return false; }
    cfg = r && r.config ? r.config : (r && typeof r === 'object' && 'modelo' in r) ? r : Object.assign({}, cfg, parcial);
    if (conv) aplicarAConversacion();
    pintarCabecera();
    alConfigurar();
    return true;
  }
  function alConfigurar() { if (g.alConfigurar) { try { g.alConfigurar(cfg); } catch (_) { /* de app.js */ } } }
  function errorConfig(msg) {
    const d = (dlgCfg && dlgCfg.open) ? dlgCfg : (dlgTut && dlgTut.open) ? dlgTut : null;
    const s = d && d.querySelector('[data-ia-guardado]');
    if (s) { s.textContent = msg; s.classList.add('error'); clearTimeout(tGuardado); tGuardado = setTimeout(() => { if (s.isConnected) { s.textContent = ''; s.classList.remove('error'); } }, 5000); }
    else avisar(msg);
  }
  function avisar(msg, acciones) {
    if (g.avisar) { try { g.avisar(msg, acciones); return; } catch (_) { /* sigue */ } }
    if (C.Tramas && C.Tramas.tablero) C.Tramas.tablero.avisar(msg, acciones);
    else if (raiz.Tramas && raiz.Tramas.tablero && raiz.Tramas.tablero.avisar) raiz.Tramas.tablero.avisar(msg, acciones);
  }
  function abrirWeb(url) {
    if (g.abrirWeb) { try { g.abrirWeb(url); return; } catch (_) { /* sigue */ } }
    try { raiz.open(url, '_blank', 'noopener'); } catch (_) { /* nada */ }
  }

  /* ====================================================================
     La conversación (el motor)
     ==================================================================== */
  /* los eventos de la conversación: el motor los da como `alTexto(fn)`… (métodos que apuntan), como propiedades que llama, o con
     `on(nombre, fn)`. Se admite cualquiera de las tres */
  function escuchar(c, nombre, fn) {
    if (typeof c.on === 'function') { c.on(nombre.slice(2, 3).toLowerCase() + nombre.slice(3), fn); return; }
    const propio = Object.prototype.hasOwnProperty.call(c, nombre);
    if (typeof c[nombre] === 'function' && !propio) { c[nombre](fn); return; }
    c[nombre] = fn;
  }
  /* el precio: con otro proveedor, el que se escribió en la configuración; si no, el id del modelo (el motor lo busca en su tabla
     y, si no está, cuenta con uno prudente y alto) */
  const precioActual = () => (cfg && cfg.proveedor === 'otro' && cfg.precio ? cfg.precio : modeloActual());
  /* lo que cambió en la configuración, a la conversación en marcha: el motor lee modelo, temperatura y precio de `op`, y el tope y
     el origen de la propia conversación */
  function aplicarAConversacion() {
    if (!conv) return;
    const temp = cfg && cfg.temperatura != null ? cfg.temperatura : TEMP_DEFECTO, tope = cfg && cfg.tope != null ? +cfg.tope : TOPE_DEFECTO;
    if (conv.op && typeof conv.op === 'object') Object.assign(conv.op, { modelo: modeloActual(), temperatura: temp, precio: precioActual(), tope, origen: origen() });
    try { conv.tope = tope; conv.origen = origen(); } catch (_) { /* de solo lectura */ }
  }
  let ultimoError = null;
  function crearConversacion(datos) {
    const M = motor();
    if (!M || typeof M.Conversacion !== 'function') return null;
    const c = new M.Conversacion({
      transporte: g.transporte, ejecutar: g.ejecutar, estado: g.estado, proyecto: g.proyecto, arbol: g.arbol,
      modelo: modeloActual(), temperatura: cfg && cfg.temperatura != null ? cfg.temperatura : TEMP_DEFECTO,
      precio: precioActual(), tope: cfg && cfg.tope != null ? cfg.tope : TOPE_DEFECTO,
      maxVueltas: 25, origen: origen(),
      herramientas: Array.isArray(g.herramientas) && g.herramientas.length ? g.herramientas : undefined,
      /* las fórmulas (1.1.60): las activas de la conversación van en el sistema de cada petición; del resto, la lista de títulos */
      formulas: fxActivas.slice(), textoFormula: id => textoFx(id), listaFormulas: () => listaFx(),
      /* la memoria de estilo (1.1.60, js/claquedraw/memoria-ui.js): la general y la del proyecto, en el sistema de cada petición */
      memoria: () => (g.memoria ? g.memoria() : null),
      /* el nombre de lo que tiene un id, para los pasos y el permiso (1.1.60: «Escribió en la nota «Escena del bar»», no su id) */
      nombreDe: (v, tipo, args) => nombreDeId(v, tipo, args),
      /* para el permiso (revisión del port a ClapBook): un sustituir que se lleva mucho texto y un conectar que quita un cable de Leo
         piden permiso; lo miran herramientas.js sobre el proyecto de ahora (sin proyecto, se pregunta) */
      quitaAlSustituir: args => { const d = g.docs && g.docs(), H = C.herramientas; return !d || !H || !H.quitaAlSustituir || H.quitaAlSustituir(d, args).mucho; },
      sustituyeCable: args => { const d = g.docs && g.docs(), H = C.herramientas; return !d || !H || !H.sustituyeCable || H.sustituyeCable(d, args); },
      /* el equipo de duendes (1.1.68): la herramienta del maestro (la define el motor; la ejecuta `ejecutarEquipo`) y los especiales */
      herramientasPropias: M.herramientaEquipo && EQ() && typeof EQ().trabajar === 'function' ? [M.herramientaEquipo(ejecutarEquipo)] : undefined,
      especiales: datos ? undefined : dnVista(),
      maestro: () => { const m = maestro(); return m ? { nombre: m.nombre } : null; }
    });
    /* lo que llega de una conversación que ya no es la del panel (Nueva conversación, u otro proyecto, a mitad) no se pinta */
    const suya = f => (x => { if (conv === c) f(x); });
    escuchar(c, 'alTexto', suya(alTexto));
    escuchar(c, 'alPaso', suya(alPaso));
    escuchar(c, 'alCoste', suya(alCoste));
    if (typeof c.alTurno === 'function' || 'alTurno' in c) escuchar(c, 'alTurno', suya(alTurno));   // la mesa (1.1.68, §13)
    if (typeof c.alPelea === 'function' || 'alPelea' in c) escuchar(c, 'alPelea', suya(x => alPelea(x)));   // y su pelea (§14)
    escuchar(c, 'alFin', () => {});           // el final lo da la promesa de `enviar`
    escuchar(c, 'alError', suya(e => { ultimoError = e || null; }));   // su código (clave, saldo, limite…) no viene en el final
    /* lo que borra pide permiso (revisión): una tarjeta en el panel con Permitir / Permitir en esta conversación / No */
    if (typeof c.alPermiso === 'function') c.alPermiso(pide => (conv === c ? pedirPermiso(pide) : 'no'));
    if (datos && typeof c.cargar === 'function') { try { c.cargar(datos); } catch (_) { /* conversación de otra versión: empieza de nuevo */ } }
    if (Array.isArray(c.formulas)) fxActivas = c.formulas.slice();   // las que tenía guardadas (o las que se eligieron antes de crearla)
    /* los especiales (1.1.68): una conversación guardada trae los suyos, congelados; una nueva, los elegidos o los de partida */
    if (datos) { dnActivos = Array.isArray(c.especiales) ? c.especiales.slice() : []; modoLocal = modoDe(c) || 'maestro'; }
    else {
      if (dnActivos === null) dnActivos = [];
      if (typeof c.fijarEspeciales === 'function') { try { const r = c.fijarEspeciales(dnActivos); if (Array.isArray(r)) dnActivos = r.slice(); } catch (_) { /* motor de otra versión */ } }
      ponerModoEnConv(c, modoLocal);                           // el que se eligió antes de crearla (1.1.68, §13)
    }
    return c;
  }

  /* un trozo de texto que llega del modelo */
  /* Los trozos del transporte son `{ id, texto, razonamiento?, herramienta? }`: `herramienta` llega cuando el modelo empieza a
     llamar a una (se enseña «Usando…» mientras llegan sus argumentos) y `razonamiento`, lo que piensan los modelos R1 antes de
     contestar (plegado, en gris). Con tool_calls el texto puede ser solo "\n\n": no se pinta una burbuja vacía */
  function alTexto(x) {
    const o = x && typeof x === 'object' ? x : {};
    /* del motor: `delta` es lo nuevo y `texto`, todo lo visible de esa vuelta; de un transporte a secas, `texto` es el trozo */
    const acum = typeof o.delta === 'string' && typeof o.texto === 'string' ? o.texto : (typeof o.acumulado === 'string' ? o.acumulado : null);
    const t = typeof x === 'string' ? x : acum !== null ? '' : (o.trozo ?? o.texto ?? '');
    if (o.herramienta) {
      if (iaActual) iaActual.cerrado = true;
      const ya = items.find(i => i.tipo === 'paso' && i.provisional && i.estado === 'en-curso' && i.nombre === o.herramienta);
      if (!ya) items.push({ tipo: 'paso', id: 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: o.herramienta, args: {}, estado: 'en-curso', provisional: true });
      repintarPronto(); return;
    }
    if (!t && !o.razonamiento && !(acum && acum.trim())) return;
    ultimaNovedad = Date.now();                        // llega algo que se lee: el duende se va (si llevaba un rato)
    const quien = o.quien || null;                      // en la mesa (1.1.68, §13): de quién es este texto
    if (!iaActual || iaActual.cerrado || (quien || null) !== (iaActual.quien || null) || (!quien && o.vuelta != null && iaActual.vuelta != null && o.vuelta !== iaActual.vuelta)) {
      if (iaActual) iaActual.vivo = false;
      iaActual = Object.assign({ tipo: 'ia', texto: '', vivo: true, vuelta: o.vuelta }, quien ? turnoDe(quien, o) : {}); items.push(iaActual);
    }
    if (o.razonamiento) iaActual.razon = (iaActual.razon || '') + o.razonamiento;
    if (acum !== null) iaActual.texto = acum; else iaActual.texto += t || '';
    repintarPronto();
  }
  /* un paso: empieza (sin resultado) o acaba (con él). La misma llamada se reconoce por su id */
  function alPaso(p) {
    if (!p) return;
    /* del motor: fase «preparando» (llegan los argumentos: «Usando…»), «inicio», «fin» (con ok, texto o error, historial,
       imagenes) y «aviso» (pasa al plan B) */
    if (p.fase === 'preparando') { alTexto({ herramienta: p.herramienta || p.nombre }); return; }
    ultimaNovedad = Date.now();
    /* un evento del equipo de duendes (1.1.68): ya lo pinta `ejecutarEquipo` (que lo recibe antes, con su color); aquí, nada más */
    if (p.fase === 'equipo') return;
    if (p.fase === 'aviso') { if (iaActual) iaActual.cerrado = true; items.push({ tipo: 'aviso', texto: p.titulo || p.texto || '' }); repintarPronto(); return; }
    const id = p.id || p.llamada || (p.tool_call && p.tool_call.id) || null;
    let it = id ? items.find(i => i.tipo === 'paso' && i.id === id) : null;
    const nombre = p.nombre || p.herramienta || p.name || (p.tool_call && p.tool_call.function && p.tool_call.function.name) || '';
    /* el «Usando…» que se puso mientras llegaban sus argumentos pasa a ser este paso */
    if (!it) { it = items.find(i => i.tipo === 'paso' && i.provisional && i.estado === 'en-curso' && i.nombre === nombre) || null; if (it) { delete it.provisional; if (id) it.id = id; } }
    let args = p.args ?? p.argumentos ?? p.arguments ?? {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) { args = { texto: args }; } }
    if (!it) {
      if (iaActual) iaActual.cerrado = true;          // el texto de antes del paso queda arriba; lo que siga, debajo
      it = { tipo: 'paso', id: id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre, args, estado: 'en-curso', abierto: false };
      items.push(it);
    }
    if (args && typeof args === 'object' && Object.keys(args).length) it.args = args;
    const r = p.resultado !== undefined ? p.resultado : p.result;
    const acabado = p.estado === 'hecho' || p.estado === 'error' || p.fase === 'fin' || r !== undefined;
    if (acabado) {
      const ok = p.estado === 'error' || p.ok === false || (r && typeof r === 'object' && r.ok === false) ? false : true;
      it.estado = ok ? 'hecho' : 'error';
      it.texto = typeof r === 'string' ? r : r ? (r.texto ?? r.error ?? r.aviso ?? '') : (p.texto || p.error || '');
      it.entrada = p.entrada || p.historial || (r && typeof r === 'object' ? (r.entrada || r.historial) : null) || null;
      it.imagenes = p.imagenes || (r && r.imagenes) || 0;
      if (p.descritas) { it.descritas = p.descritas; it.vision = p.vision || ''; }   // las describió el modelo de visión (1.1.60)
      /* el paso del equipo (1.1.68): lo que dice el motor al acabar (sus eventos, si no los vio `ejecutarEquipo`) */
      if (p.equipo && typeof p.equipo === 'object') {
        it.equipo = it.equipo || { eventos: Array.isArray(p.eventos) ? p.eventos.slice() : [] };
        it.equipo.enCurso = false;
        if (p.equipo.ref) it.equipo.ref = p.equipo.ref;
        if (!it.equipo.rondas && p.equipo.rondas) it.equipo.rondas = p.equipo.rondas;
        if (it.equipo.problemas == null && p.equipo.correcciones != null) it.equipo.problemas = p.equipo.correcciones;
      }
      olvidarIndice();                                  // pudo crear o renombrar algo: los ids, por su nombre de ahora
    }
    if (p.titulo && !/^Usando /.test(p.titulo)) it.titulo = p.titulo;
    if (progreso && progreso.alPaso) { try { progreso.alPaso({ nombre, estado: it.estado, titulo: tituloPaso(it) }); } catch (_) { /* del lienzo */ } }
    repintarPronto();
  }
  function alCoste(x) {
    if (typeof x === 'number') coste.usd = x;
    else if (x) {
      coste.usd = +(x.usd ?? x.total ?? x.coste ?? coste.usd) || 0;
      const tk = x.tokens || x;
      if (tk.entrada != null || tk.cache != null) coste.entrada = (+tk.entrada || 0) + (+tk.cache || 0);
      if (tk.salida != null) coste.salida = +tk.salida || 0;
      const est = x.estimadas != null ? x.estimadas : tk.estimadas;
      if (est != null) coste.estimadas = +est || 0;
    }
    pintarCabecera();
  }

  /* el permiso para lo que borra: la tarjeta espera la respuesta de Leo (sin respuesta, no se hace) */
  function pedirPermiso(pide) {
    if (iaActual) iaActual.cerrado = true;
    const it = { tipo: 'permiso', id: 'pm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titulo: corto(String(pide.titulo || ''), 300), motivos: (pide.motivos || []).slice(0, 8).map(m => corto(String(m || ''), 300)), estado: 'pendiente' };
    /* `pide.args` puede traer el texto del equipo ya sustituido (hasta 60 000 caracteres, 1.1.68): no se pinta ni se guarda entero */
    const r = new Promise(res => { it._resolver = res; });
    items.push(it);
    if (panel && (panel.hidden || pref.plegado)) { abrir({ sinTutorial: true, foco: false }); avisar('El asistente te pide permiso antes de borrar algo'); }
    pintarTodo(); abajo(true);
    return r;
  }
  function contestarPermiso(it, resp) {
    if (!it || it.tipo !== 'permiso' || it.estado !== 'pendiente') return;
    it.estado = resp === 'si' || resp === 'siempre' ? resp : 'no';
    const f = it._resolver; delete it._resolver;
    if (f) f(it.estado);
    pintarTodo();
  }

  /* ---------- mandar ---------- */
  const pareceClave = t => { const M = motor(); return M && M.pareceClave ? M.pareceClave(t) : /\bsk-[A-Za-z0-9_-]{20,}/.test(String(t || '')); };
  const AVISO_CLAVE = 'Eso parece una clave de API: no la mandes por el chat (la vería la IA y quedaría guardada en la conversación). Ponla en la configuración, que la guarda cifrada.';
  /* `op.imagenes` (1.1.60): [{ data, mimeType, nombre, mini }] las adjuntas, que van al motor junto al texto (`enviar(texto, { imagenes })`:
     un modelo de visión las describe, DeepSeek no ve imágenes); `mini`, su miniatura, solo para el mensaje que se ve */
  async function mandar(texto, op = {}) {
    texto = String(texto ?? '').trim();
    const imgs = Array.isArray(op.imagenes) ? op.imagenes.filter(x => x && x.data) : [];
    if (!texto && !imgs.length) return null;
    if (pareceClave(texto)) { avisar(AVISO_CLAVE); return null; }
    const eop = {};
    if (op.maxVueltas) eop.maxVueltas = op.maxVueltas;
    if (imgs.length) eop.imagenes = imgs.map(x => ({ data: x.data, mimeType: x.mimeType, nombre: x.nombre }));
    if (op.equipo) eop.equipo = true;                          // «Ejecutar con IA» con duendes: el equipo solo en este mensaje (§13)
    /* la mesa (1.1.68, §13): conversan los elegidos (un mensaje que empieza por @Nombre, solo esos) */
    if (!op.equipo && !op.lienzo && modoLocal === 'mesa') {   // (el lienzo nunca va a la mesa)
      const ps = mesaCfg.participantes;
      const conPj = ps.some(p => p.papel === 'personaje');
      if (ps.length < (conPj ? 1 : 2)) { avisar('Sienta al menos a dos duendes en la mesa, o llama a un personaje (el botón «Mesa»)'); abrir({ sinTutorial: true }); if (!dnPop) abrirDn(); return null; }
      const soloA = soloDe(texto, ps);
      return correr(c => (typeof c.enviarMesa === 'function' ? c.enviarMesa(texto, Object.assign({ participantes: ps.slice(), rondas: mesaCfg.rondas, resumen: mesaCfg.resumen }, mesaCfg.resumenSolo ? { resumenSolo: true } : {}, soloA.length ? { soloA } : {}, eop))
        : c.enviar(texto, Object.keys(eop).length ? eop : undefined)), { yo: texto, visible: op.visible, mesa: true, imagenes: imgs.map(x => ({ src: x.mini || '', nombre: x.nombre })) });
    }
    return correr(c => c.enviar(texto, Object.keys(eop).length ? eop : undefined), { yo: texto, visible: op.visible, imagenes: imgs.map(x => ({ src: x.mini || '', nombre: x.nombre })) });
  }
  /* manda (o reintenta) y pinta lo que pasa. `fn(conv)` → la promesa del motor; op: { yo (lo que se escribió), visible } */
  async function correr(fn, op = {}) {
    abrir({ sinTutorial: true });
    if (!hayTransporte()) { pintarTodo(); avisar('El asistente con otra IA funciona en la app de escritorio de ClapCraft'); return null; }
    if (!hayClave()) { await leerConfig(); if (!hayClave()) { pintarTodo(); tutorial(); return null; } }
    if (enCurso) { avisar('El asistente aún está trabajando: espera a que termine o pulsa Detener'); return null; }
    if (g.hayProyecto && !g.hayProyecto()) { avisar('Abre un proyecto para trabajar con el asistente'); return null; }
    if (!conv && EQ()) await leerEquipo();                     // los especiales de partida salen del equipo (1.1.68)
    if (!conv) conv = crearConversacion();
    if (!conv) { avisar('El motor del asistente no está cargado'); return null; }
    aplicarAConversacion();
    if (op.yo !== undefined && (op.yo || (op.imagenes && op.imagenes.length))) items.push(Object.assign({ tipo: 'yo', texto: op.visible || op.yo, fecha: Date.now() }, op.visible ? { enviado: op.yo } : {}, op.imagenes && op.imagenes.length ? { imagenes: op.imagenes } : {}));
    iaActual = null; enCurso = true;
    vigilarDuende(true);
    ponerEstado('pensando');
    /* la mesa: en el taller, los que se sientan (y el maestro si resume) */
    if (op.mesa) {
      const ps = mesaCfg.participantes.map(p => (p.papel === 'personaje' ? Object.assign({}, p, { duende: p.duende || null }) : p)), m = maestro();
      if (mesaCfg.resumen && !ps.some(p => p.id === 'maestro')) ps.push(Object.assign({ papel: 'maestro' }, m || { id: 'maestro', nombre: nombreMaestro() }));
      tallerEmpezar({ duendes: [] }, ps);
    }
    pintarTodo(); abajo(true);
    let r = null; ultimoError = null;
    const desde = items.length, mia = conv;
    try {
      r = await fn(mia);
    } catch (e) {
      r = { ok: false, motivo: 'error', error: (e && e.message) || String(e), codigo: e && e.codigo };
    }
    /* Nueva conversación, o el proyecto cambió, a mitad: lo de aquella ya no se pinta ni se guarda aquí */
    if (conv !== mia) return r;
    enCurso = false;
    vigilarDuende(false);
    pintarVerMascota();
    if (iaActual) { iaActual.vivo = false; iaActual.cerrado = true; }
    r = r || { ok: false, motivo: 'error', error: 'La IA no contestó' };
    const motivo = r.motivo || (r.ok ? 'fin' : 'error');
    const codigo = r.codigo != null ? r.codigo : ultimoError && ultimoError.codigo != null ? ultimoError.codigo : null;
    /* lo que no llegó en trozos (un transporte sin streaming) llega en la respuesta: solo si esta vez aún no se vio nada escrito */
    if (motivo === 'fin' && r.texto && String(r.texto).trim() && !items.slice(desde).some(i => i.tipo === 'ia' && String(i.texto || '').trim())) items.push({ tipo: 'ia', texto: String(r.texto) });
    if (motivo === 'ocupada') { if (op.yo) items.pop(); avisar(r.error || 'El asistente aún está trabajando'); }
    else if (motivo === 'error' && codigo === 'sinClave') { await leerConfig(); pintarTodo(); tutorial(); }
    else if (motivo === 'error') items.push({ tipo: 'error', codigo, texto: String(r.error || (ultimoError && ultimoError.error) || 'Algo falló') });
    else if (motivo === 'tope') items.push({ tipo: 'aviso', texto: r.aviso || 'Se detuvo al llegar al tope de gasto de esta conversación. Súbelo en la configuración o empieza una conversación nueva.', accion: 'ajustes' });
    else if (motivo === 'vueltas' || motivo === 'llamadas') items.push({ tipo: 'aviso', texto: r.aviso || 'Se detuvo tras muchos pasos seguidos. Dile «sigue» si quieres que continúe.' });
    else if (motivo === 'rotos' || motivo === 'larga') items.push({ tipo: 'aviso', texto: r.aviso || 'Se detuvo.', accion: motivo === 'larga' ? 'nueva' : null });
    else if (motivo === 'clave') { if (op.yo) items.pop(); avisar(r.error || AVISO_CLAVE); }
    else if (motivo === 'mesa') items.push({ tipo: 'aviso', texto: r.error || 'La mesa necesita de 2 a 6 duendes.' });
    else if (motivo === 'detenido') items.push({ tipo: 'aviso', texto: 'Detenido. Lo que ya hizo se queda (y se puede deshacer).' });
    else if (r.cortada) items.push({ tipo: 'aviso', texto: 'La respuesta se cortó por larga. Dile «sigue» si quieres el resto.' });
    iaActual = null;
    items.forEach(i => {
      if (i.tipo === 'paso' && i.estado === 'en-curso') i.estado = i.provisional ? 'quitar' : 'cortado';
      if (i.tipo === 'permiso' && i.estado === 'pendiente') { const f = i._resolver; delete i._resolver; i.estado = 'sin-respuesta'; if (f) f('no'); }
    });
    items = items.filter(i => i.estado !== 'quitar');
    if (typeof r.coste === 'number') alCoste(r.gasto ? { coste: r.coste, tokens: r.gasto } : r.coste);
    /* el duende maestro dice su respuesta en la mascota (1.1.68: globo y boca siempre; sonido solo con 🔊) */
    /* la escena del error (§16): se queda hasta la siguiente respuesta buena; una buena la quita (salvo la huelga por saldo a 0) */
    const esc16 = motivo === 'fin' ? null : escenaDeError(motivo, codigo);
    if (motivo === 'fin') ponerEscena(huelgaSaldo ? 'huelga' : null);
    else if (esc16) ponerEscena(esc16);
    /* el estado, el de la escena: con 'error' encima, la huelga (o el tope, sin red…) se perdía al momento (visto al portarlo a ClapBook) */
    ponerEstado(motivo === 'fin' ? 'contento' : esc16 || (motivo === 'error' ? 'error' : 'quieto'));
    /* en la mesa ya habló cada uno en la mascota: el maestro no repite la última burbuja (la de otro duende) */
    if (motivo === 'fin' && !op.mesa) { const ult = items.slice(desde).reverse().find(i => i.tipo === 'ia' && !i.quien && String(i.texto || '').trim()); if (ult) hablarMaestro(ult.texto); }
    pintarTodo(); abajo();
    guardar();
    refrescarSaldo();                                           // lo gastado ya se descontó
    return r;
  }
  /* la conversación que se deja: deja de oír los trozos del transporte */
  function soltarConv() { if (conv && typeof conv.cerrar === 'function') { try { conv.cerrar(); } catch (_) { /* nada */ } } conv = null; }
  function detener() {
    if (!enCurso || !conv) return;
    try { conv.detener(); } catch (_) { /* ya estaba */ }
  }
  function nuevaConversacion() {
    if (enCurso) detener();
    soltarConv(); enCurso = false; items = []; iaActual = null; coste = { usd: 0, entrada: 0, salida: 0 };
    fxActivas = [];                                            // las fórmulas activas son de la conversación
    dnActivos = null; cerrarDn();                              // y los duendes especiales: ninguno (1.1.68)
    modoLocal = 'maestro'; mesaCfg = { participantes: [], rondas: 2, resumen: true, resumenSolo: false };   // una conversación nueva empieza con el maestro solo (§13)
    alPelea(null, { sinLinea: true });                         // y sin pelea (§14)
    guardar();
    pintarTodo();
    if (campo) campo.focus();
  }

  /* ---------- guardar y cargar (por proyecto, lo hace app.js) ---------- */
  function guardar() {
    if (!g.guardarConversacion) return;
    const limpio = items.map(i => { const x = Object.assign({}, i); delete x.vivo; delete x.fin; delete x._resolver; if (x.tipo === 'permiso' && x.estado === 'pendiente') x.estado = 'sin-respuesta'; return x; });
    let datos = null;
    try { datos = conv && typeof conv.toJSON === 'function' ? conv.toJSON() : null; } catch (_) { datos = null; }
    /* con tope (revisión): los textos de los pasos y los razonamientos, acortados; si aún pasa de 300 KB, sin los turnos más viejos */
    let todo = { version: 1, conversacion: datos, vista: limpio, coste, modelo: modeloActual(), fecha: Date.now(), modo: modoLocal, mesa: mesaCfg };
    const M = motor();
    try { if (M && M.compactarGuardado) todo = M.compactarGuardado(todo, { max: 300000 }); } catch (_) { /* tal cual */ }
    try { g.guardarConversacion(items.length || fxActivas.length || (conv && (dnActivos !== null || modoLocal !== 'maestro')) ? todo : null); } catch (_) { /* nada */ }   // (solo con fórmulas activas o duendes elegidos, también)
  }
  async function recargar() {
    if (enCurso) detener();
    soltarConv(); enCurso = false; items = []; iaActual = null; coste = { usd: 0, entrada: 0, salida: 0 }; cargada = true; fxActivas = [];
    dnActivos = null; equipoVivo = null; modoLocal = 'maestro'; mesaCfg = { participantes: [], rondas: 2, resumen: true, resumenSolo: false };
    cerrarFx(); cerrarDn();
    let d = null;
    if (g.cargarConversacion) { try { d = await g.cargarConversacion(); } catch (_) { d = null; } }
    if (d && d.mesa && typeof d.mesa === 'object') {                  // la mesa de esta conversación (1.1.68, §13)
      const ps = Array.isArray(d.mesa.participantes) ? d.mesa.participantes.filter(x => x && x.id) : [];
      mesaCfg = { participantes: ps.slice(0, 6), rondas: [1, 2, 3].includes(+d.mesa.rondas) ? +d.mesa.rondas : 2, resumen: d.mesa.resumen !== false, resumenSolo: !!d.mesa.resumenSolo };
    }
    if (d && Array.isArray(d.vista)) {
      items = d.vista.map(i => (i.tipo === 'paso' && i.estado === 'en-curso' ? Object.assign({}, i, { estado: 'cortado' }) : i.tipo === 'permiso' && i.estado === 'pendiente' ? Object.assign({}, i, { estado: 'sin-respuesta' }) : i));
      if (d.coste) coste = Object.assign({ usd: 0, entrada: 0, salida: 0 }, d.coste);
      if (d.conversacion) conv = crearConversacion(d.conversacion);
    } else if (d && d.conversacion) {
      /* sin lo que se veía (de otra versión): se rehace con lo que recuerda el motor */
      conv = crearConversacion(d.conversacion);
      const es = conv && typeof conv.entradas === 'function' ? conv.entradas() : [];
      items = es.map(e => e.tipo === 'usuario' ? { tipo: 'yo', texto: e.texto } : e.tipo === 'asistente' ? Object.assign({ tipo: 'ia', texto: e.texto, cerrado: true }, e.quien ? turnoDe(e.quien, e) : {}, e.revisa ? { revisa: true, problemas: +e.problemas || 0 } : {})
        : e.tipo === 'aviso' ? { tipo: 'aviso', texto: e.texto }
        : Object.assign({ tipo: 'paso', id: e.id, nombre: e.herramienta, args: e.args || {}, estado: e.ok === false ? 'error' : 'hecho', titulo: e.titulo, texto: e.texto || e.error || '', entrada: e.historial || null, imagenes: e.imagenes || 0, descritas: e.descritas || 0, vision: e.vision || '' },
          e.equipo ? { equipo: { eventos: Array.isArray(e.eventos) ? e.eventos.slice() : [], enCurso: false, rondas: e.equipo.rondas || 0, problemas: e.equipo.correcciones ?? null, huecos: e.equipo.huecos || 0, coste: e.equipo.coste || 0, ref: e.equipo.ref || null } } : {}));
      if (conv && conv.gasto) coste = { usd: +conv.gasto.coste || 0, entrada: (+conv.gasto.entrada || 0) + (+conv.gasto.cache || 0), salida: +conv.gasto.salida || 0 };
    }
    /* el modo: el de la conversación (o, si el motor no lo guardó, el del panel) */
    if (d && MODOS.includes(d.modo) && !modoDe(conv)) { modoLocal = d.modo; ponerModoEnConv(conv, modoLocal); }
    /* una pelea que no se paró (hasta el siguiente mensaje de Leo) vuelve (§14) */
    alPelea(conv && conv.pelea && Array.isArray(conv.pelea.entre) && conv.pelea.entre.length ? conv.pelea : null, { sinLinea: true });
    pintarTodo(); abajo(true);
  }

  /* ---------- los lienzos: «Ejecutar con IA» ---------- */
  function nombreNodo(lid, nodoId) {
    try {
      const d = g.docs && g.docs(); const r = d && d.lienzo && d.lienzo(lid);
      const n = r && r.lienzo && (r.lienzo.nodos || []).find(x => x.id === nodoId);
      return { lienzo: r ? r.lienzo.nombre : null, nodo: n ? (n.nombre || n.titulo || n.tipo) : null };
    } catch (_) { return {}; }
  }
  /* `op.texto`: el encargo que arma lienzo.js (con los enlaces); `op.alPaso(p)` sigue el progreso para pintarlo en el nodo */
  /* ¿con el equipo? (1.1.68, §13): con duendes elegidos en esa operación (o en alguna de las del lienzo) o en el modo Equipo */
  function conEquipoLienzo(lid, nodos) {
    if (!EQ() || !motor() || typeof motor().herramientaEquipo !== 'function') return false;
    if (modoLocal === 'equipo') return true;
    try {
      const d = g.docs && g.docs(), r = d && d.lienzo && d.lienzo(lid);
      return !!(r && (r.lienzo.nodos || []).some(n => (!nodos || nodos.includes(n.id)) && n.datos && Array.isArray(n.datos.duendes) && n.datos.duendes.length));
    } catch (_) { return false; }
  }
  function ejecutarNodo(lid, nodoId, op = {}) {
    const n = nombreNodo(lid, nodoId), equipo = conEquipoLienzo(lid, [nodoId]);
    const visible = op.visible || ('Ejecuta el nodo ' + (n.nodo ? '«' + n.nodo + '»' : nodoId) + (n.lienzo ? ' del lienzo «' + n.lienzo + '»' : ''));
    const M = motor();
    const texto = M && M.encargoNodo ? (op.texto ? op.texto.trim() + '\n\n' : '') + M.encargoNodo(lid, nodoId, op.enlace || null, { titulo: n.nodo, lienzo: n.lienzo, equipo })
      : (op.texto ? op.texto + '\n\n' : visible + '.\n\n')
        + `Hazlo así: pide su encargo con ejecutar_nodo (lienzo: "${lid}", nodo: "${nodoId}"), escribe su salida con las herramientas que diga el encargo y termina con completar_nodo (con la salida, o con el error si no se pudo). Al acabar, dime en una o dos frases qué hiciste.`;
    progreso = { lid, nodoId, alPaso: op.alPaso };
    return mandar(texto, { visible, maxVueltas: op.maxVueltas, equipo, lienzo: true }).finally(() => { progreso = null; });
  }
  /* `op.texto`: el encargo de lienzo.js (las elegidas, con sus enlaces); `op.nodos`: cuáles (sin ellos, todas las pendientes);
     `op.maxVueltas`: más herramientas para muchas operaciones (lo pone app.js) */
  function ejecutarLienzo(lid, op = {}) {
    const n = nombreNodo(lid, null), equipo = conEquipoLienzo(lid, op.nodos || null);
    const visible = op.visible || ('Ejecuta todo el lienzo' + (n.lienzo ? ' «' + n.lienzo + '»' : ''));
    const M = motor();
    const texto = M && M.encargoLienzo ? M.encargoLienzo(lid, { lienzo: n.lienzo, enlace: op.enlace || null, nodos: op.nodos || null, texto: op.texto || null, equipo }) : (op.texto ? op.texto + '\n\n' : visible + '.\n\n')
      + `Hazlo así: lee el lienzo con leer_lienzo (lienzo: "${lid}") y, en el orden de sus cables, haz cada operación pendiente: ejecutar_nodo, escribir su salida con las herramientas que diga su encargo y completar_nodo. Si una falla, márcala con su error y sigue con las que no dependan de ella. Al acabar, resume qué hiciste.`;
    progreso = { lid, nodoId: null, alPaso: op.alPaso };
    return mandar(texto, { visible, maxVueltas: op.maxVueltas, equipo, lienzo: true }).finally(() => { progreso = null; });
  }

  /* ====================================================================
     El panel
     ==================================================================== */
  function montarPanel() {
    panel = document.getElementById('asistente');
    if (!panel) return;
    panel.innerHTML = `
      <div class="as-borde" data-as-borde title="Arrastra para cambiar el ancho · doble clic: ancho de partida"></div>
      <header class="as-cab">
        <span class="as-cab-ic">${ic('ic-asistente', 16)}</span>
        <div class="as-cab-tit">
          <span class="as-cab-fila"><span class="as-rotulo as-maestro" data-as-maestro title="Asistente IA: tu duende maestro, que coordina al equipo de duendes">El duende maestro</span><span class="as-coste" data-as-coste></span></span>
          <span class="as-cab-fila as-cab-fila2"><button type="button" class="as-modelo" data-as-ajustes title="Cambiar el modelo"></button><button type="button" class="as-saldo" data-as-saldo hidden></button></span>
        </div>
        <button type="button" class="icono as-sonido" data-as-sonido aria-pressed="false" title="Sonido: que los duendes «hablen» al contestar (apagado)" aria-label="Sonido de los duendes">${SVG_SONIDO_NO}</button>
        <button type="button" class="icono" data-as-memoria title="Memoria de estilo: las reglas de tono y forma que la IA aprende de tus correcciones" aria-label="Memoria de estilo">${ic('ic-edit', 15)}</button>
        <button type="button" class="icono" data-as-nueva title="Nueva conversación" aria-label="Nueva conversación">${ic('ic-plus', 16)}</button>
        <button type="button" class="icono" data-as-ajustes title="Configurar el asistente" aria-label="Configurar el asistente">${ic('ic-ajustes', 16)}</button>
        <button type="button" class="icono" data-as-plegar title="Plegar el panel" aria-label="Plegar el panel">${ic('ic-chev-r', 16)}</button>
        <button type="button" class="icono" data-as-cerrar title="Cerrar el asistente (${atajo('I', true)})" aria-label="Cerrar el asistente">${ic('ic-close', 16)}</button>
      </header>
      <div class="as-mascota" data-as-mascota title="El duende maestro · clic: te saluda"><div class="as-mascota-sitio" data-as-mascota-sitio aria-hidden="true"></div><button type="button" class="as-enlace-btn as-mascota-ver" data-as-ver-taller title="Ver a los duendes trabajando en el taller" hidden>${SVG_DUENDE}Ver trabajar</button><button type="button" class="as-enlace-btn as-mascota-recargar" data-as-web="panel" title="Abrir tu panel de APIMart para recargar saldo" hidden>Recargar saldo</button></div>
      <div class="as-cuerpo" data-as-cuerpo aria-live="polite"></div>
      <div class="as-trabajo" data-as-trabajo role="status" hidden><span class="as-trabajo-duende" data-as-duende>${ic('ic-asistente', 18)}</span><span class="as-trabajo-txt" data-as-trabajo-txt></span></div>
      <footer class="as-pie" data-as-pie>
        <div class="as-enlaces" data-as-enlaces hidden></div>
        <div class="as-modos" data-as-modos role="radiogroup" aria-label="Quién contesta" hidden>
          <button type="button" role="radio" data-as-modo="maestro" title="Maestro: contesta solo el duende maestro (de partida)">Maestro</button>
          <button type="button" role="radio" data-as-modo="equipo" title="Equipo: el maestro encarga lo largo (escenas, notas, fragmentos) a su equipo de duendes, que lo escribe, lo revisa y lo corrige">Equipo</button>
          <button type="button" role="radio" data-as-modo="mesa" title="Mesa: varios duendes conversan entre ellos sobre lo que les pidas (solo leen el proyecto; no escriben nada)">Mesa</button>
          <span class="as-modos-nota" data-as-modos-nota></span>
        </div>
        <div class="as-fx" data-as-fx hidden></div>
        <div class="as-fx as-dn" data-as-dn hidden></div>
        <div class="as-campo">
          <div class="as-editor" data-as-campo contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Pídele algo sobre tu proyecto…" aria-label="Mensaje para el asistente"></div>
          <div class="as-campo-fila">
            <button type="button" class="as-adjuntar" data-as-adjuntar title="Adjuntar una imagen (también pegándola o soltándola en el campo)" aria-label="Adjuntar una imagen">${ic('ic-imagen', 15)}</button>
            <button type="button" class="as-fx-boton" data-as-fx-abrir title="Fórmulas: activar una para toda la conversación o insertar su texto (también «/» al principio del mensaje)" aria-haspopup="true">${ic('ic-formula', 13)}<span>Fórmulas</span></button>
            <button type="button" class="as-fx-boton as-dn-boton" data-as-dn-abrir title="Duendes especiales: los que revisan o transforman lo que escribe el equipo en esta conversación" aria-haspopup="true">${SVG_DUENDE}<span>Duendes</span></button>
            <span class="as-pista">Enter manda · Mayús+Enter, otro renglón · / fórmulas</span>
            <button type="button" class="as-mandar" data-as-mandar title="Mandar (Enter)" aria-label="Mandar">${ic('ic-mandar', 16)}</button>
            <button type="button" class="as-detener" data-as-detener title="Detener" aria-label="Detener" hidden>${ic('ic-detener', 14)}<span>Detener</span></button>
          </div>
        </div>
      </footer>
      <div class="as-riel">
        <button type="button" class="as-riel-abrir" data-as-desplegar title="Desplegar el asistente" aria-label="Desplegar el asistente">${ic('ic-asistente', 16)}</button>
        <span class="as-riel-punto" data-as-riel-punto hidden></span>
      </div>`;
    cuerpo = panel.querySelector('[data-as-cuerpo]');
    campo = panel.querySelector('[data-as-campo]');
    prepararEditor(campo);
    /* elegir texto de una respuesta ofrece «Citar» (1.1.60) */
    cuerpo.addEventListener('mouseup', () => setTimeout(pintarBotonCitar, 0));
    cuerpo.addEventListener('keyup', () => setTimeout(pintarBotonCitar, 0));
    cuerpo.addEventListener('scroll', () => { if (botonCitar) botonCitar.hidden = true; });
    document.addEventListener('selectionchange', () => { if (botonCitar && !botonCitar.hidden) { const s = getSelection(); if (!s || s.isCollapsed) botonCitar.hidden = true; } });
    panel.addEventListener('click', alClicPanel);
    /* el clic central sobre un enlace va por el mismo camino que el clic (`irA`: los https de fuera, preguntando antes). 1.1.61,
       revisión: sin esto lo abría Chromium en otra ventana, y `setWindowOpenHandler` (main.js) lo mandaba al navegador sin
       preguntar. Con cualquier otro botón que no sea el principal, nada. */
    panel.addEventListener('mousedown', e => { if (e.button === 1 && e.target.closest && e.target.closest('a[href]')) e.preventDefault(); });   // ni el autodesplazamiento
    panel.addEventListener('auxclick', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || !panel.contains(a)) return;
      e.preventDefault();
      if (e.button === 1) irA(a.getAttribute('href'));
    });
    panel.addEventListener('dblclick', e => { if (e.target.closest('[data-as-borde]')) { pref.ancho = ANCHO.defecto; aplicarAncho(); guardarPref(); } });
    panel.querySelector('[data-as-borde]').addEventListener('pointerdown', arrastrarBorde);
    campo.addEventListener('keydown', alTeclaCampo);
    campo.addEventListener('input', e => {
      /* «/» al principio de un mensaje vacío: la lista de las fórmulas, para activar una (1.1.60) */
      if (e.inputType === 'insertText' && e.data === '/' && campo.value === '/') { campo.value = ''; abrirFx({ barra: true }); }
      alCambiarCampo();
    });
    /* un clic fuera cierra la lista de las fórmulas */
    document.addEventListener('pointerdown', e => { if (fxPop && !fxPop.contains(e.target) && !e.target.closest('[data-as-fx-abrir]')) cerrarFx(); }, true);
    document.addEventListener('pointerdown', e => { if (dnPop && !dnPop.contains(e.target) && !e.target.closest('[data-as-dn-abrir]')) cerrarDn(); }, true);
    document.addEventListener('pointerdown', e => { if (pjPop && !pjPop.contains(e.target) && !e.target.closest('[data-as-pj-menu]')) cerrarPj(); }, true);
    aplicarAncho();
    const btn = document.getElementById('asistenteBtn');
    if (btn) btn.addEventListener('click', () => alternar());
  }
  function aplicarAncho() {
    const a = Math.max(ANCHO.min, Math.min(ANCHO.max, +pref.ancho || ANCHO.defecto));
    document.documentElement.style.setProperty('--as-ancho', a + 'px');
  }
  function arrastrarBorde(e) {
    if (e.button !== 0 || pref.plegado) return;
    e.preventDefault();
    const x0 = e.clientX, a0 = panel.getBoundingClientRect().width;
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* eventos sintéticos */ }
    document.body.classList.add('as-redimensionando');
    const mover = ev => { pref.ancho = Math.round(a0 + (x0 - ev.clientX)); aplicarAncho(); };
    const soltar = () => {
      document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); document.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('as-redimensionando');
      pref.ancho = Math.max(ANCHO.min, Math.min(ANCHO.max, pref.ancho || ANCHO.defecto)); guardarPref();
    };
    document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
  }

  function abrir(op = {}) {
    if (!panel) return;
    const estaba = !panel.hidden;
    panel.hidden = false;
    pref.abierto = true; if (op.desplegar !== false) pref.plegado = false; guardarPref();
    aplicarPlegado();
    document.body.classList.add('con-asistente');
    const btn = document.getElementById('asistenteBtn'); if (btn) { btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); }
    montarMascota();                                           // la primera vez que se abre (ver `montarMascota`)
    sonidoAlDia(); pausarMascota();
    if (!cargada) recargar();
    if (!estaba) leerConfig().then(() => {
      pintarTodo(); refrescarSaldo();
      if (!op.sinTutorial && hayTransporte() && !hayClave() && !pref.tutorialVisto) tutorial();
    });
    if (op.foco !== false) setTimeout(() => { if (campo && !panel.hidden && !pref.plegado) campo.focus(); }, 30);
  }
  function cerrar() {
    if (!panel) return;
    panel.hidden = true;
    pref.abierto = false; guardarPref();
    document.body.classList.remove('con-asistente');
    const btn = document.getElementById('asistenteBtn'); if (btn) { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); }
    cerrarFx(); cerrarDn(); cerrarPj();                        // sus menús no se quedan abiertos para la próxima vez
    sonidoAlDia(); pausarMascota();
  }
  function alternar() { if (!panel) return; if (panel.hidden) abrir(); else if (pref.plegado) { pref.plegado = false; guardarPref(); aplicarPlegado(); } else cerrar(); }
  function plegar(v) { pref.plegado = v !== undefined ? !!v : !pref.plegado; guardarPref(); aplicarPlegado(); if (!pref.plegado && campo) campo.focus(); }
  function aplicarPlegado() {
    if (panel) panel.classList.toggle('plegado', !!pref.plegado); document.body.classList.toggle('asistente-plegado', !!pref.plegado);
    if (pref.plegado && duendeMarco) conDuendes(duendeMarco, D => { if (D.callar) D.callar(); });   // plegado, la mascota no se ve: calla
    sonidoAlDia(); pausarMascota();
  }
  /* «Mandar al asistente» (el botón de enlace de las cabeceras): abre el panel y deja el texto en el campo, para seguir escribiendo */
  function insertar(texto) {
    abrir({ sinTutorial: true });
    if (!campo) return;
    const v = campo.value;
    campo.focus();
    insertarEnCampo((v && !/\s$/.test(v) ? '\n' : '') + String(texto || '').replace(/\s+$/, '') + ' ', rangoFinal());   // al final, con el enlace como chip
    alCambiarCampo();
  }

  function alClicPanel(e) {
    const a = e.target.closest('a[href]');
    if (a && panel.contains(a)) { e.preventDefault(); irA(a.getAttribute('href')); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-as-cerrar]')) cerrar();
    else if (b.matches('[data-as-plegar]')) plegar(true);
    else if (b.matches('[data-as-desplegar]')) plegar(false);
    else if (b.matches('[data-as-ajustes]')) configurar();
    else if (b.matches('[data-as-nueva]')) nuevaConversacion();
    else if (b.matches('[data-as-mandar]')) mandarCampo();
    else if (b.matches('[data-as-detener]')) detener();
    else if (b.matches('[data-as-tutorial]')) tutorial(b.dataset.asTutorial || 0);
    else if (b.matches('[data-as-sugerencia]')) { campo.value = b.dataset.asSugerencia; alCambiarCampo(); campo.focus(); cursorAlFinal(); }
    else if (b.matches('[data-as-paso-plegar]')) { const it = itemDe(b); if (it) { it.abierto = !it.abierto; pintarTodo(); } }
    else if (b.matches('[data-as-deshacer]')) deshacerPaso(itemDe(b), b);
    else if (b.matches('[data-as-ver]')) { const it = itemDe(b); if (it && it.entrada && g.verCambio) g.verCambio(it.entrada); }
    else if (b.matches('[data-as-version]')) verVersionPaso(itemDe(b));
    else if (b.matches('[data-as-reintentar]')) reintentar();
    else if (b.matches('[data-as-permiso]')) contestarPermiso(itemDe(b), b.dataset.asPermiso);
    else if (b.matches('[data-as-copiar]')) { const it = itemDe(b); if (it && g.copiarTexto) { Promise.resolve(g.copiarTexto(it.texto)).then(() => avisar('Respuesta copiada'), () => {}); } }
    else if (b.matches('[data-as-web]')) abrirWeb(WEB[b.dataset.asWeb] || b.dataset.asWeb);
    /* las fórmulas (1.1.60): la lista, quitar una activa, abrir una */
    else if (b.matches('[data-as-saldo]')) refrescarSaldo(true);
    else if (b.matches('[data-as-memoria]')) { if (C.memoriaUI && typeof C.memoriaUI.abrir === 'function') C.memoriaUI.abrir(); else avisar('La memoria de estilo aún no está en esta versión'); }
    else if (b.matches('[data-as-fx-abrir]')) { if (fxPop) cerrarFx(); else abrirFx(); }
    else if (b.matches('[data-as-adjuntar]')) {                 // 📎: el selector de archivos del sistema
      const r = rangoCampo(), inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.addEventListener('change', () => { adjuntarArchivos(inp.files, r); });
      inp.click();
    }
    else if (b.matches('[data-as-fx-quitar]')) fijarFx(fxActivas.filter(x => x !== b.dataset.asFxQuitar));
    /* el equipo de duendes (1.1.68): los especiales de la conversación, el taller y el sonido */
    else if (b.matches('[data-as-dn-abrir]')) { if (dnPop) cerrarDn(); else abrirDn(); }
    else if (b.matches('[data-as-modo]')) ponerModo(b.dataset.asModo);
    else if (b.matches('[data-as-pj-menu]')) { if (pjPop) cerrarPj(); else abrirMenuPj(b.dataset.asPjMenu); }
    else if (b.matches('[data-as-pj-rehacer-chip]')) {
      const id = b.dataset.asPjRehacerChip, x = mesaCfg.participantes.find(q => q.id === id), n = x && participantePj(x.personaje || id.slice(3), { modelo: x.modelo, temperatura: x.temperatura });
      if (n) { mesaCfg.participantes = mesaCfg.participantes.map(q => (q.id === id ? n : q)); cacheHuellaPj.clear(); pintarDn(); guardar(); }
    }
    else if (b.matches('[data-as-dn-quitar]')) fijarLista(listaModo().filter(x => x.id !== b.dataset.asDnQuitar));
    else if (b.matches('[data-as-dn-ver]')) abrirDuendesUI({ id: b.dataset.asDnVer });
    else if (b.matches('[data-as-ver-taller]')) abrirTaller();
    else if (b.matches('[data-as-sonido]')) ponerSonido(!pref.sonido);
    else if (b.matches('[data-as-fx-ver]')) { if (g.abrirFormula) g.abrirFormula(b.dataset.asFxVer); }
  }
  const itemDe = el => { const k = el.closest('[data-as-item]'); return k ? items[+k.dataset.asItem] : null; };
  /* Los enlaces de las respuestas: los de ClapCraft, a su sitio; los de APIMart, al navegador; cualquier otro, solo https y
     preguntando antes (revisión: lo que escribe el modelo puede venir de un texto que leyó) */
  async function irA(href) {
    const u = String(href || '').trim();
    if (/^clapcraft:/i.test(u)) { if (g.irAEnlace) g.irAEnlace(u); return; }
    let url; try { url = new URL(u); } catch (_) { return; }
    if (url.protocol !== 'https:' || url.username || url.password) { avisar('Ese enlace no se abre: solo los que empiezan por https://'); return; }
    if (/(^|\.)apimart\.ai$/i.test(url.hostname)) { abrirWeb(url.href); return; }
    const txt = '¿Abrir fuera de ClapCraft? ' + url.href + ' (lo escribió la IA: ábrelo solo si te fías de él)';
    let ok = false;
    try { ok = g.confirmar ? await g.confirmar(txt, 'Abrir fuera de ClapCraft') : raiz.confirm(txt); } catch (_) { ok = false; }
    if (!ok) return;
    if (g.abrirFuera) g.abrirFuera(url.href); else { try { raiz.open(url.href, '_blank', 'noopener'); } catch (_) { /* nada */ } }
  }
  async function deshacerPaso(it, b) {
    if (!it || !it.entrada || !g.deshacer || it.deshecho) return;
    b.disabled = true;
    try {
      const r = await g.deshacer(it.entrada);
      if (r && r.ok === false) { avisar(r.aviso || r.error || 'No se pudo deshacer'); b.disabled = false; return; }
      it.deshecho = true; pintarTodo(); guardar();
    } catch (e) { avisar('No se pudo deshacer: ' + ((e && e.message) || e)); b.disabled = false; }
  }
  /* «Reintentar» tras un error: el último mensaje de Leo otra vez (el de la conversación y el que se ve no se repiten en el panel) */
  /* Revisión: ya no manda otra vez el mensaje de Leo (se rehacía lo ya hecho); el motor vuelve a llamar al modelo con lo que hay y
     una nota para que siga donde lo dejó (`reanudar`) */
  function reintentar() {
    if (enCurso) return;
    items = items.filter(i => i.tipo !== 'error');
    if (conv && typeof conv.reanudar === 'function') { correr(c => c.reanudar(), {}); return; }
    const k = items.map(i => i.tipo).lastIndexOf('yo'); if (k < 0) return;
    const ult = items[k];
    items = items.filter((i, j) => j !== k);
    mandar(ult.enviado || ult.texto, { visible: ult.enviado ? ult.texto : undefined });
  }

  function alTeclaCampo(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); mandarCampo(); return; }
    if (e.key === 'Enter' && e.shiftKey && !e.isComposing) { e.preventDefault(); insertarEnCampo('\n'); alCambiarCampo(); return; }   // otro renglón (un <br>, siempre)
    if (e.key === 'Escape') { if (enCurso) { e.preventDefault(); detener(); } else campo.blur(); return; }
    /* Retroceso o Supr junto a un chip: se va entero */
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const s = getSelection(), r = s && s.rangeCount ? s.getRangeAt(0) : null;
      const chip = r && campo.contains(r.startContainer) ? chipJunto(r, e.key === 'Backspace') : null;
      if (chip) { e.preventDefault(); const sig = chip.nextSibling; chip.remove(); ponerCursor(sig && sig.nodeType === 3 ? sig : campo, sig && sig.nodeType === 3 ? 0 : null, sig); alCambiarCampo(); }
    }
  }
  function mandarCampo() {
    const t = campo.value.trim(), imgs = imagenesDelCampo(); if ((!t && !imgs.length) || enCurso) return;
    /* una clave pegada en el chat: no se manda ni se guarda; se quita del campo */
    if (pareceClave(t)) { campo.value = campo.value.replace(/\bsk-[A-Za-z0-9_-]{20,}/g, '').replace(/\bBearer\s+[A-Za-z0-9._-]{20,}/gi, ''); alCambiarCampo(); cursorAlFinal(); avisar(AVISO_CLAVE); return; }
    campo.value = ''; alCambiarCampo();
    mandar(t, imgs.length ? { imagenes: imgs } : {});
  }
  function crecerCampo() {
    if (!campo) return;
    const max = Math.max(96, Math.round(((panel && panel.clientHeight) || 600) * 0.4));
    campo.style.maxHeight = max + 'px';                        // crece con lo que lleva y, pasado eso, se desplaza
  }
  /* ya no hay fila de chips encima del campo: los enlaces son chips dentro de él (1.1.60) */
  function pintarEnlacesCampo() { const caja = panel && panel.querySelector('[data-as-enlaces]'); if (caja) { caja.hidden = true; caja.textContent = ''; } }
  function alCambiarCampo() { crecerCampo(); pintarBotones(); }

  /* ---------- el campo del mensaje: texto con los enlaces de ClapCraft como chips (1.1.60) ----------
     Leo: «cuando envío algo al asistente se ve como en la imagen [el texto crudo `[Esquema «Roadmap»](clapcraft://…)` y un chip
     encima]; en lugar de un texto así, que se vea como un chip para que no se confunda con el texto». El campo es un editor
     (contenteditable) de texto plano donde **cada enlace de ClapCraft es un chip en línea, atómico** (`contenteditable=false`, con el
     icono de su tipo y su etiqueta): se escribe antes y después, Retroceso o Supr junto a él lo borran entero. Entran como chip
     «Mandar al asistente» (`insertar`), lo pegado (`[..](clapcraft://..)` o un `clapcraft://` suelto; el resto, como texto) y lo
     que se suelta. Al mandar, se serializa a lo mismo de antes (`[etiqueta](clapcraft://…)` en su sitio del texto), así el motor
     no cambia. `campo.value`, `campo.disabled` y `campo.placeholder` siguen valiendo (propiedades del elemento). */
  const RE_ENLACE_CC = /\[([^\]\n]+)\]\((clapcraft:\/\/[^)\s]+)\)|(clapcraft:\/\/[^\s)\]>]+)/g;
  /* el icono de lo que apunta un enlace (lo último que dice su ruta) */
  function iconoEnlace(u) {
    const p = String(u).replace(/^clapcraft:\/\//, '').split(/[?#]/)[0].split('/').slice(1);
    if (p.includes('formulas:biblioteca')) return 'ic-formula';
    if (p.includes('plantillas:biblioteca')) return 'ic-plantilla';
    const ICO = { nodo: 'ic-board', salto: 'ic-board', trama: 'ic-board', acto: 'ic-board', enlace: 'ic-board', raya: 'ic-board', columna: 'ic-board', columnas: 'ic-board',
      documento: 'ic-script', esquema: 'ic-board', lienzo: 'ic-lienzo', nota: 'ic-nota', segmento: 'ic-segmento', seccion: 'ic-segmento', biblioteca: 'ic-docs',
      personaje: 'ic-person', contenedor: 'ic-folder', carpeta: 'ic-folder', grupo: 'ic-folder' };
    for (let i = p.length - 1; i >= 0; i--) if (ICO[p[i]]) return p[i] === 'nodo' && p.includes('lienzo') ? 'ic-lienzo' : ICO[p[i]];
    return 'ic-link';
  }
  function chipCampo(url, etiqueta) {
    const c = document.createElement('span');
    c.className = 'as-chip-enlace as-chip-campo'; c.contentEditable = 'false'; c.draggable = false;
    c.dataset.url = url; c.dataset.etiqueta = etiqueta; c.title = url;
    c.innerHTML = ic(iconoEnlace(url), 12) + '<span></span>';
    c.lastChild.textContent = corto(etiqueta, 60);
    return c;
  }
  const esChip = n => !!(n && n.nodeType === 1 && n.dataset && (n.dataset.url || n.dataset.cita !== undefined || n.dataset.img));
  const esCita = n => !!(n && n.nodeType === 1 && n.dataset && n.dataset.cita !== undefined);
  /* un texto (con saltos de renglón y enlaces) en nodos: texto, <br> y chips */
  function fragmentoDe(texto) {
    const f = document.createDocumentFragment(), t = String(texto ?? '').replace(/\r\n?/g, '\n');
    const trozo = x => x.split('\n').forEach((l, i) => { if (i) f.appendChild(document.createElement('br')); if (l) f.appendChild(document.createTextNode(l)); });
    let ult = 0;
    t.replace(RE_ENLACE_CC, (x, et, u1, u2, pos) => {
      trozo(t.slice(ult, pos));
      const u = u1 || u2;
      f.appendChild(chipCampo(u, String(et || etiquetaDeUrl(u)).trim()));
      ult = pos + x.length; return x;
    });
    trozo(t.slice(ult));
    return f;
  }
  /* lo que dice el campo, en texto: los chips vuelven a ser `[etiqueta](url)` */
  function valorDe(el) {
    let out = '', trasCita = false;
    const andar = n => {
      if (n.nodeType === 3) {
        let v = n.nodeValue.replace(/\u200B/g, '').replace(/\u00a0/g, ' ');
        if (trasCita) { v = v.replace(/^ +/, ''); if (v) trasCita = false; }   // el espacio que va detrás de una cita no empieza el renglón
        out += v; return;
      }
      if (n.nodeType !== 1) return;
      if (n.dataset && n.dataset.img) return;                     // una imagen adjunta no es texto: va aparte (imagenesDelCampo)
      if (esCita(n)) { if (out && !out.endsWith('\n')) out += '\n'; out += citaMd(n) + '\n'; trasCita = true; return; }   // una cita: en su sitio, en sus renglones
      if (esChip(n)) { out += '[' + String(n.dataset.etiqueta || etiquetaDeUrl(n.dataset.url)).replace(/[[\]]/g, '') + '](' + n.dataset.url + ')'; return; }
      if (n.tagName === 'BR') { if (!(trasCita && out.endsWith('\n'))) out += '\n'; trasCita = false; return; }
      const bloque = /^(DIV|P|LI)$/.test(n.tagName);                // (Chrome, a veces, parte en <div>)
      if (bloque && out && !out.endsWith('\n')) out += '\n';
      n.childNodes.forEach(andar);
    };
    el.childNodes.forEach(andar);
    return out.replace(/\n$/, '');                                // el <br> del final que pone Chrome no es un renglón
  }
  /* el chip que hay justo delante (Retroceso) o detrás (Supr) del cursor, o null */
  function chipJunto(r, atras) {
    if (!r.collapsed) return null;
    const n = r.startContainer, k = r.startOffset;
    let x;
    if (n.nodeType === 3) {
      const resto = atras ? n.nodeValue.slice(0, k) : n.nodeValue.slice(k);
      if (resto.replace(/\u200B/g, '')) return null;
      x = atras ? n.previousSibling : n.nextSibling;
    } else x = atras ? n.childNodes[k - 1] : n.childNodes[k];
    while (x && x.nodeType === 3 && !x.nodeValue.replace(/\u200B/g, '')) x = atras ? x.previousSibling : x.nextSibling;
    return esChip(x) ? x : null;
  }
  function ponerCursor(nodo, k, tras) {
    const r = document.createRange();
    if (k === null || k === undefined) { if (tras && tras.parentNode) r.setStartBefore(tras); else { r.selectNodeContents(campo); r.collapse(false); } }
    else r.setStart(nodo, k);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function cursorAlFinal() { if (!campo) return; campo.focus(); const r = rangoFinal(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function rangoFinal() { const r = document.createRange(); r.selectNodeContents(campo); r.collapse(false); return r; }
  /* donde está el cursor en el campo (o, si no está en él, al final) */
  function rangoCampo() {
    const s = getSelection();
    if (s && s.rangeCount) { const r = s.getRangeAt(0); if (campo.contains(r.startContainer) && campo.contains(r.endContainer)) return r.cloneRange(); }
    return rangoFinal();
  }
  /* pone un texto (con sus enlaces como chips) en el rango, y el cursor detrás */
  function insertarEnCampo(texto, rango) {
    const r = rango || rangoCampo();
    [r.startContainer, r.endContainer].forEach((n, i) => {             // nunca dentro de un chip
      const c = n && (n.nodeType === 1 ? n : n.parentElement); const ch = c && c.closest ? c.closest('.as-chip-campo') : null;
      if (ch && campo.contains(ch)) { if (i) r.setEndAfter(ch); else r.setStartAfter(ch); }
    });
    r.deleteContents();
    const f = fragmentoDe(texto); let ult = f.lastChild; if (!ult) return;
    if (esChip(ult)) { const t = document.createTextNode(' '); f.appendChild(t); ult = t; }   // detrás de un chip se puede seguir escribiendo
    r.insertNode(f);
    /* un salto de renglón al final no se ve (ni deja el cursor abajo) sin algo detrás */
    if (ult.nodeName === 'BR' && !(ult.nextSibling && (ult.nextSibling.nodeType !== 3 || ult.nextSibling.nodeValue))) { const t = document.createTextNode('\u200B'); ult.after(t); ult = t; }
    const c = document.createRange();
    if (ult.nodeType === 3) c.setStart(ult, ult.nodeValue.length); else c.setStartAfter(ult);
    c.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(c);
    const el = ult.nodeType === 3 ? ult.parentElement : ult; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
  /* ---------- citas (1.1.60, Leo: «Necesito poder citar textos para mandarlos al asistente») ----------
     `C.asistente.citar({ texto, enlace, etiqueta })` (la ventana de una nota y el editor, con lo elegido; y aquí, lo elegido de una
     respuesta) mete en el campo, donde está el cursor, un chip de cita atómico: comillas, sus primeras palabras y de dónde es (al
     pasar el ratón, entera). Al mandar va como cita de Markdown en su sitio: `> renglón` y, si hay enlace, `> — [etiqueta](url)`
     debajo. Una cita enorme se recorta (MAX_CITA) con «…» y el enlace dice dónde leer el resto. */
  const MAX_CITA = 6000;
  function citaMd(n) {
    const lineas = String(n.dataset.cita || '').split('\n').map(l => '> ' + l.replace(/\s+$/, '')).join('\n').replace(/> $/gm, '>');
    const u = n.dataset.citaUrl, et = String(n.dataset.etiqueta || '').replace(/[[\]]/g, '');
    return lineas + (u ? '\n> — [' + (et || etiquetaDeUrl(u)) + '](' + u + ')' : et ? '\n> — ' + et : '');
  }
  function chipCita(texto, enlace, etiqueta) {
    let t = String(texto ?? '').replace(/\r\n?/g, '\n').replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/^\s*\n|\n\s*$/g, '').trim();
    const largo = t.length > MAX_CITA;
    if (largo) t = t.slice(0, MAX_CITA).replace(/\s+\S*$/, '') + ' …' + (enlace ? ' (sigue en el enlace)' : '');
    const u = /^clapcraft:\/\//i.test(String(enlace || '')) ? String(enlace) : '';
    const et = String(etiqueta || (u ? etiquetaDeUrl(u) : '')).trim();
    const c = document.createElement('span');
    c.className = 'as-chip-enlace as-chip-campo as-chip-cita'; c.contentEditable = 'false'; c.draggable = false;
    c.dataset.cita = t; if (u) c.dataset.citaUrl = u; if (et) c.dataset.etiqueta = et;
    c.title = (t.length > 1200 ? t.slice(0, 1200) + '…' : t) + (et ? '\n— ' + et : '');
    c.innerHTML = '<span class="as-cita-ic" aria-hidden="true">“</span><span class="as-cita-txt"></span>' + (et ? '<span class="as-cita-de"></span>' : '');
    c.querySelector('.as-cita-txt').textContent = corto(t, 42);
    if (et) c.querySelector('.as-cita-de').textContent = corto(et, 40);
    c.setAttribute('aria-label', 'Cita' + (et ? ' de ' + et : '') + ': ' + corto(t, 120));
    return c;
  }
  /* abre el panel si está cerrado y deja la cita en el campo, en el cursor (o al final si el cursor no está en él) */
  function citar(op = {}) {
    const texto = String((op && op.texto) || '').trim();
    /* con imagen (una elegida en el editor o en una nota): `imagen` es su data URL o { src, nombre }; también `imagenes` */
    const imgs = [].concat(op && op.imagen ? [op.imagen] : [], op && Array.isArray(op.imagenes) ? op.imagenes : []).map(x => (typeof x === 'string' ? { src: x } : x)).filter(x => x && /^data:image\//i.test(String(x.src || '')));
    if (!texto && !imgs.length) return false;
    abrir({ sinTutorial: true, foco: false });
    if (!campo) return false;
    if (imgs.length) {
      (async () => { for (const x of imgs) await adjuntar(x.src, x.nombre || op.etiqueta || 'Imagen', rangoCampo()); if (texto) citar(Object.assign({}, op, { imagen: null, imagenes: null })); })();
      return true;
    }
    const r = rangoCampo();
    campo.focus();
    const f = document.createDocumentFragment(), c = chipCita(texto, op.enlace, op.etiqueta), t = document.createTextNode(' ');
    f.appendChild(c); f.appendChild(t);
    r.deleteContents(); r.insertNode(f);
    const x = document.createRange(); x.setStart(t, 1); x.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(x);
    c.scrollIntoView({ block: 'nearest' });
    alCambiarCampo();
    return true;
  }
  /* «Citar» sobre lo elegido en una respuesta (o en un mensaje) del propio asistente */
  let botonCitar = null;
  function pintarBotonCitar() {
    if (!panel || !cuerpo) return;
    const s = getSelection(), r = s && s.rangeCount ? s.getRangeAt(0) : null;
    const dentro = r && !r.collapsed && cuerpo.contains(r.commonAncestorContainer) && (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest('.as-ia, .as-yo, .as-md, .as-burbuja');
    const txt = dentro ? s.toString().trim() : '';
    if (!txt) { if (botonCitar) botonCitar.hidden = true; return; }
    if (!botonCitar) {
      botonCitar = document.createElement('button');
      botonCitar.type = 'button'; botonCitar.className = 'as-citar-flot'; botonCitar.dataset.asCitar = '';
      botonCitar.innerHTML = '<span aria-hidden="true">“</span>Citar';
      botonCitar.title = 'Citar lo elegido en el mensaje';
      botonCitar.addEventListener('mousedown', e => e.preventDefault());   // que no se pierda lo elegido
      botonCitar.addEventListener('click', () => {
        const s2 = getSelection(), t2 = s2 ? s2.toString().trim() : '';
        botonCitar.hidden = true;
        if (t2) { const x = s2.rangeCount ? s2.getRangeAt(0).commonAncestorContainer : null, el = x && (x.nodeType === 1 ? x : x.parentElement), yo = el && el.closest('.as-yo'); s2.removeAllRanges(); citar({ texto: t2, etiqueta: yo ? 'Mi mensaje' : 'Respuesta del asistente' }); }
      });
      panel.appendChild(botonCitar);
    }
    const b = r.getBoundingClientRect(), p = panel.getBoundingClientRect();
    botonCitar.hidden = false;
    botonCitar.style.left = Math.max(8, Math.min(p.width - 80, b.right - p.left - 30)) + 'px';
    botonCitar.style.top = Math.max(8, b.top - p.top - 34) + 'px';
  }

  function prepararEditor(el) {
    Object.defineProperty(el, 'value', { configurable: true, get: () => valorDe(el), set: v => { el.replaceChildren(fragmentoDe(v)); pintarVacio(); } });
    Object.defineProperty(el, 'disabled', { configurable: true, get: () => el.getAttribute('contenteditable') !== 'true',
      set: v => { el.setAttribute('contenteditable', v ? 'false' : 'true'); el.classList.toggle('desactivado', !!v); el.setAttribute('aria-disabled', String(!!v)); } });
    Object.defineProperty(el, 'placeholder', { configurable: true, get: () => el.dataset.placeholder || '', set: v => { el.dataset.placeholder = v; el.setAttribute('aria-placeholder', v); } });
    /* pegar: texto plano, con los enlaces de ClapCraft como chips */
    el.addEventListener('paste', e => {
      e.preventDefault();
      const dt = e.clipboardData, t = dt ? dt.getData('text/plain') || dt.getData('text/uri-list') : '';
      const files = dt ? [...(dt.files || [])].filter(f => /^image\//.test(f.type)) : [];
      if (files.length) { adjuntarArchivos(files); if (!t) return; }       // una imagen pegada: adjunta
      if (t) { insertarEnCampo(t); alCambiarCampo(); }
    });
    /* soltar un enlace (o un texto): en el sitio donde cae */
    el.addEventListener('dragover', e => { const ts = e.dataTransfer ? [...e.dataTransfer.types] : []; if (ts.includes('text/plain') || ts.includes('text/uri-list') || ts.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    el.addEventListener('drop', e => {
      const dt = e.dataTransfer, t = dt ? dt.getData('text/plain') || dt.getData('text/uri-list') : '';
      const files = dt ? [...(dt.files || [])].filter(f => /^image\//.test(f.type)) : [];
      if (!t && !files.length) return;
      e.preventDefault();
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null, dentro = r && el.contains(r.startContainer) ? r : null;
      el.focus();
      if (files.length) { adjuntarArchivos(files, dentro); return; }
      insertarEnCampo(t, dentro); alCambiarCampo();
    });
    /* un clic en una imagen adjunta: el visor */
    el.addEventListener('click', e => { const ch = e.target.closest && e.target.closest('.as-chip-img'); if (ch && el.contains(ch)) { e.preventDefault(); verAdjunto(ch); } });
    /* un clic en un chip no abre nada (está en el mensaje que se escribe): pone el cursor detrás */
    el.addEventListener('mousedown', e => { const ch = e.target.closest && e.target.closest('.as-chip-campo'); if (ch && el.contains(ch) && !el.disabled) { e.preventDefault(); el.focus(); const r = document.createRange(); r.setStartAfter(ch); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } });
  }
  function pintarVacio() { if (campo) campo.classList.toggle('vacio', !campo.textContent.replace(/\u200B/g, '').trim() && !campo.querySelector('.as-chip-campo')); }

  /* ---------- imágenes adjuntas (1.1.60, Leo quiere mandar imágenes al asistente) ----------
     DeepSeek no ve imágenes: un modelo barato las describe («visión delegada», electron/ia.js y el motor) y DeepSeek recibe la
     descripción. Aquí, el campo: pegar, soltar o 📎 (`[data-as-adjuntar]`) ponen un chip con su miniatura (atómico, Retroceso lo
     quita, un clic la abre en el visor `Anotar`); al mandar van como `imagenes: [{ data, mimeType, nombre }]` junto al texto. Las
     grandes se aligeran como las del editor (`Anotar.ligera`: 1600 px, WebP). Sin modelo de visión configurado, se avisa. */
  const adjuntos = new Map();                                 // id del chip → { src, data, mimeType, nombre, mini }
  let serieAdj = 0;
  /* `modeloVision` de editorAPI.ia.config(): el id del modelo que describe las imágenes, o 'ninguno' */
  const hayVision = () => !!(cfg && cfg.modeloVision && cfg.modeloVision !== 'ninguno');
  const AVISO_VISION = 'DeepSeek no ve imágenes: elige un modelo para imágenes en la configuración';
  const leerComoUrl = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(f); });
  async function miniatura(src, lado) {
    try {
      const img = new Image(); img.src = src; await img.decode();
      const k = Math.min(1, (lado || 160) / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (_) { return ''; }
  }
  function chipImagen(id, a) {
    const c = document.createElement('span');
    c.className = 'as-chip-enlace as-chip-campo as-chip-img'; c.contentEditable = 'false'; c.draggable = false; c.dataset.img = id;
    c.title = (a.nombre || 'Imagen') + ' · clic: verla';
    c.innerHTML = '<img alt="" draggable="false"><span></span>';
    c.querySelector('img').src = a.mini || a.src; c.lastChild.textContent = corto(a.nombre || 'Imagen', 28);
    c.setAttribute('aria-label', 'Imagen adjunta: ' + (a.nombre || 'Imagen'));
    return c;
  }
  /* una imagen (data URL) al campo, en el cursor (o en `rango`) */
  async function adjuntar(src, nombre, rango) {
    if (!campo || !/^data:image\//i.test(String(src || ''))) return false;
    const r0 = rango || rangoCampo();
    let url = src; try { if (raiz.Anotar && raiz.Anotar.ligera) url = await raiz.Anotar.ligera(src) || src; } catch (_) { url = src; }
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url); if (!m) return false;
    const data = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
    const id = 'img' + (++serieAdj), a = { src: url, data, mimeType: m[1].toLowerCase(), nombre: String(nombre || 'Imagen ' + serieAdj), mini: await miniatura(url, 160) };
    adjuntos.set(id, a);
    const f = document.createDocumentFragment(), c = chipImagen(id, a), t = document.createTextNode(' ');
    f.appendChild(c); f.appendChild(t);
    campo.focus();
    r0.deleteContents(); r0.insertNode(f);
    const x = document.createRange(); x.setStart(t, 1); x.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(x);
    alCambiarCampo();
    if (cfg && !hayVision()) avisar(AVISO_VISION);
    return true;
  }
  async function adjuntarArchivos(files, rango) {
    const imgs = [...(files || [])].filter(f => /^image\//.test(f.type));
    for (const f of imgs) { const u = await leerComoUrl(f); if (u) await adjuntar(u, f.name || 'Imagen', rango); rango = null; }
    return imgs.length;
  }
  /* las del campo, en su orden (las de chips que ya no están, fuera) */
  function imagenesDelCampo() {
    if (!campo) return [];
    const vivas = [...campo.querySelectorAll('.as-chip-img')].map(c => c.dataset.img);
    [...adjuntos.keys()].forEach(k => { if (!vivas.includes(k)) adjuntos.delete(k); });
    return vivas.map(k => adjuntos.get(k)).filter(Boolean).map(a => Object.assign({}, a));
  }
  function verAdjunto(chip) {
    const a = adjuntos.get(chip.dataset.img); if (!a) return;
    const An = raiz.Anotar; if (!An || !An.abrir) return;
    An.abrir({ nombre: a.nombre, src: a.src, vista: a.src, tipo: An.tipoDe ? An.tipoDe(a.src) : a.mimeType, avisar: t => avisar(t),
      alCerrar: () => { if (campo && chip.isConnected) campo.focus(); },
      /* lo marcado o recortado en el visor sustituye a la adjunta */
      alGuardar: async r => {
        const u = r && r.datos; if (!u || !chip.isConnected) return;
        const m = /^data:([^;,]+);base64,(.*)$/s.exec(u); if (!m) return;
        Object.assign(a, { src: u, data: m[2], mimeType: m[1].toLowerCase(), mini: await miniatura(u, 160) });
        chip.querySelector('img').src = a.mini || u;
      } });
  }
  function enlacesDe(t) {
    const out = [], vistos = new Set();
    String(t || '').replace(/\[([^\]]+)\]\((clapcraft:\/\/[^)\s]+)\)|(clapcraft:\/\/[^\s)\]>]+)/g, (x, et, u1, u2) => {
      const url = u1 || u2; if (vistos.has(url)) return x; vistos.add(url);
      out.push({ url, etiqueta: et || etiquetaDeUrl(url) }); return x;
    });
    return out;
  }
  function etiquetaDeUrl(u) {
    const p = String(u).replace(/^clapcraft:\/\//, '').split(/[?#]/)[0].split('/');
    const nombres = { esquema: 'Esquema', nota: 'Nota', biblioteca: 'Biblioteca', nodo: 'Nodo', lienzo: 'Lienzo', personaje: 'Personaje', documento: 'Documento', segmento: 'Segmento', trama: 'Trama', acto: 'Acto', contenedor: 'Contenedor' };
    for (let i = p.length - 1; i > 0; i--) if (nombres[p[i]] || nombres[p[i - 1]]) return (nombres[p[i]] || nombres[p[i - 1]]) + ' · ' + p[0];
    return p[0] || 'Enlace de ClapCraft';
  }

  /* ---------- las fórmulas (1.1.60) ----------
     Leo: «que también se puedan usar las fórmulas en el asistente IA». Dos maneras: **activas** —el botón «Fórmulas» (o «/» al
     principio de un mensaje vacío) abre la lista con buscador, agrupada por segmento; las que se marcan van en chips encima del
     campo, en orden, y se aplican a cada mensaje de la conversación (el motor pone su texto en el sistema: `fijarFormulas`), y se
     guardan con ella— e **insertar**: el botón de la derecha de cada una pone su texto en el mensaje, donde está el cursor. Un clic en
     un chip abre la fórmula en su ventana; una que ya no existe se ve rota (y el motor le dice a la IA que siga sin ella). */
  let fxActivas = [];                // las ids de las fórmulas activas (las de `conv.formulas`, o las elegidas antes de crearla)
  let fxPop = null;                  // la lista abierta
  const docsFx = () => { try { return g.docs ? g.docs() : null; } catch (_) { return null; } };
  function textoFx(id) {
    const d = docsFx(), n = d && d.nota(id);
    if (!n || !(d.esFormula && d.esFormula(n)) || (d.enPapelera && d.enPapelera(id))) return null;
    return { titulo: n.titulo || 'Sin título', texto: d.textoFormula ? d.textoFormula(id) || '' : '' };
  }
  function listaFx() { const d = docsFx(); return d && d.formulas ? d.formulas().map(n => ({ id: n.id, titulo: n.titulo || 'Sin título' })) : []; }
  function resolverFx(ids) {
    const d = docsFx();
    if (d && d.resolverFormulas) return d.resolverFormulas(ids);
    return ids.map(id => { const x = textoFx(id); return x ? { id, titulo: x.titulo, texto: x.texto } : { id, rota: true, motivo: 'Esa fórmula ya no existe' }; });
  }
  /* cambia las activas: a la conversación (se crea si aún no hay) y a lo guardado */
  function fijarFx(ids) {
    fxActivas = [...new Set((ids || []).filter(Boolean))];
    if (!conv) conv = crearConversacion();
    if (conv && typeof conv.fijarFormulas === 'function') { try { fxActivas = conv.fijarFormulas(fxActivas).slice(); } catch (_) { /* motor de otra versión */ } }
    else if (conv) conv.formulas = fxActivas.slice();
    pintarFx(); marcarFx(); guardar();
  }
  function pintarFx() {
    const caja = panel && panel.querySelector('[data-as-fx]'); if (!caja) return;
    const b = panel.querySelector('[data-as-fx-abrir]'); if (b) b.classList.toggle('on', !!fxActivas.length);
    caja.hidden = !fxActivas.length;
    if (!fxActivas.length) { caja.innerHTML = ''; return; }
    caja.innerHTML = `<span class="as-fx-rot" title="Se aplican a cada mensaje de esta conversación, en este orden">Activas</span>` + resolverFx(fxActivas).map(f => {
      const nom = f.rota ? (f.titulo || 'Fórmula que ya no está') : (f.titulo || 'Sin título');
      return `<span class="as-fx-chip${f.rota ? ' roto' : ''}"><button type="button" class="as-fx-nom"${f.rota ? ' disabled' : ` data-as-fx-ver="${esc(f.id)}"`} title="${esc(f.rota ? (f.motivo || 'Esa fórmula ya no existe') + ': la IA sigue sin ella' : 'Abrir la fórmula «' + nom + '»')}">${ic(f.rota ? 'ic-aviso' : 'ic-formula', 11)}<span>${esc(corto(nom, 40))}</span></button>`
        + `<button type="button" class="as-fx-x" data-as-fx-quitar="${esc(f.id)}" title="Desactivar" aria-label="Desactivar la fórmula «${esc(nom)}»">${ic('ic-close', 10)}</button></span>`;
    }).join('');
  }
  const planoFx = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function cerrarFx(volver) {
    if (!fxPop) return;
    const barra = fxPop._barra; fxPop.remove(); fxPop = null;
    if (volver && campo) { if (barra && volver === 'esc' && !campo.value) { campo.value = '/'; alCambiarCampo(); } cursorAlFinal(); }
  }
  function marcarFx() {
    if (!fxPop) return;
    fxPop.querySelectorAll('[data-as-fx-op]').forEach(b => { const i = fxActivas.indexOf(b.dataset.asFxOp); b.classList.toggle('on', i >= 0); b.setAttribute('aria-checked', String(i >= 0)); b.querySelector('small').textContent = i >= 0 ? String(i + 1) : ''; });
  }
  /* pone el texto de una fórmula en el mensaje, donde está el cursor */
  function insertarFx(id) {
    const x = textoFx(id); if (!x || !campo) return;
    const r = (fxPop && fxPop._rango) || rangoFinal();
    cerrarFx();
    const a = document.createRange(); a.setStart(campo, 0); a.setEnd(r.startContainer, r.startOffset);
    const antes = a.toString().replace(/\u200B/g, ''), t = (antes && !/\n$/.test(antes) ? '\n' : '') + x.texto + '\n';
    campo.focus(); insertarEnCampo(t, r); alCambiarCampo();
  }
  /* la lista: buscador, agrupada por segmento de «Fórmulas»; marcar una la activa (sin cerrar), su botón de la derecha la inserta */
  function abrirFx(op = {}) {
    if (!panel) return;
    cerrarFx();
    const d = docsFx(), fs = d && d.formulas ? d.formulas() : [];
    const pop = document.createElement('div');
    pop.className = 'gd-pop as-fx-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Fórmulas'); pop._barra = !!op.barra;
    pop._rango = campo ? rangoCampo() : null;                  // donde estaba el cursor: ahí se inserta el texto de una
    const grupos = new Map();
    fs.forEach(n => { const e = n.etiquetaId && d.etiqueta ? d.etiqueta(n.etiquetaId) : null, k = e ? e.id : ''; if (!grupos.has(k)) grupos.set(k, { nombre: e ? e.nombre : 'Bandeja', notas: [] }); grupos.get(k).notas.push(n); });
    const primer = n => { const t = d.textoFormula ? d.textoFormula(n.id) || '' : ''; return (t.split('\n').find(l => l.trim()) || '').trim(); };
    let lista = '';
    grupos.forEach(gr => {
      lista += `<div class="as-fx-grupo" data-as-fx-grupo>${esc(gr.nombre)}</div>`;
      gr.notas.forEach(n => {
        const p1 = primer(n);
        lista += `<div class="as-fx-fila" data-as-fx-fila data-busca="${esc(planoFx(n.titulo + ' ' + gr.nombre + ' ' + p1))}">`
          + `<button type="button" class="as-fx-op" role="menuitemcheckbox" data-as-fx-op="${esc(n.id)}" title="Activarla: se aplica a cada mensaje de la conversación"><span class="as-fx-check">${ic('ic-check', 11)}</span><span class="as-fx-txt"><b>${esc(n.titulo || 'Sin título')}</b><em>${esc(corto(p1, 70) || 'Sin texto')}</em></span><small></small></button>`
          + `<button type="button" class="as-fx-ins" data-as-fx-ins="${esc(n.id)}" title="Insertar su texto en el mensaje" aria-label="Insertar el texto de «${esc(n.titulo || 'Sin título')}» en el mensaje">${ic('ic-plus', 12)}</button></div>`;
      });
    });
    pop.innerHTML = `<div class="gd-pop-tit">Fórmulas <span>· activas en cada mensaje</span></div>`
      + (fs.length ? `<input type="search" class="as-fx-buscar" placeholder="Buscar una fórmula" aria-label="Buscar una fórmula">` : '')
      + `<div class="as-fx-lista">${lista || '<div class="gd-pop-vacio">Aún no hay fórmulas. Escríbelas en «Fórmulas», al pie del menú: prompts de solo texto (formato, tono, reglas) que se reutilizan aquí y en los lienzos.</div>'}</div>`
      + `<div class="gd-pop-sep"></div><button type="button" class="as-fx-admin" data-as-fx-admin>${ic('ic-formula', 13)}<span>Administrar fórmulas…</span></button>`;
    panel.querySelector('[data-as-pie]').appendChild(pop);
    fxPop = pop;
    marcarFx();
    const buscar = pop.querySelector('.as-fx-buscar');
    const visibles = () => [...pop.querySelectorAll('[data-as-fx-fila]')].filter(f => !f.hidden);
    const filtrar = () => {
      const q = planoFx(buscar ? buscar.value : '');
      pop.querySelectorAll('[data-as-fx-fila]').forEach(f => { f.hidden = !!q && !f.dataset.busca.includes(q); });
      pop.querySelectorAll('[data-as-fx-grupo]').forEach(c => { let x = c.nextElementSibling, hay = false; while (x && x.matches('[data-as-fx-fila]')) { if (!x.hidden) hay = true; x = x.nextElementSibling; } c.hidden = !hay; });
    };
    if (buscar) buscar.addEventListener('input', filtrar);
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-as-fx-op]')) { const id = b.dataset.asFxOp, i = fxActivas.indexOf(id); fijarFx(i >= 0 ? fxActivas.filter(x => x !== id) : fxActivas.concat(id)); return; }
      if (b.matches('[data-as-fx-ins]')) { insertarFx(b.dataset.asFxIns); return; }
      if (b.matches('[data-as-fx-admin]')) { cerrarFx(); if (g.abrirFormulas) g.abrirFormulas(); }
    });
    pop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarFx('esc'); return; }
      const ops = visibles().map(f => f.querySelector('[data-as-fx-op]')), i = ops.indexOf(document.activeElement);
      if (e.target === buscar && e.key === 'Enter') { e.preventDefault(); if (ops[0]) ops[0].click(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'ArrowUp' && i <= 0 && buscar) { buscar.focus(); return; }
        const sig = ops[i < 0 ? 0 : Math.max(0, Math.min(ops.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (sig) sig.focus();
      }
      if (e.key === 'ArrowRight' && i >= 0) { e.preventDefault(); const x = ops[i].nextElementSibling; if (x) x.focus(); }
      if (e.key === 'ArrowLeft' && e.target.matches('[data-as-fx-ins]')) { e.preventDefault(); e.target.previousElementSibling.focus(); }
    });
    setTimeout(() => { const f = buscar || pop.querySelector('button'); if (f && fxPop === pop) f.focus({ preventScroll: true }); }, 0);
  }

  /* ---------- el equipo de duendes (1.1.68) ----------
     Leo, 28-09-2026: «El asistente IA es un duende también, que sea "El duende maestro" y es el duende por defecto en el chat… Que
     puedan seleccionarse duendes especiales en el asistente de IA y que adopten la personalidad que se le dio anteriormente, no la
     cambian a lo largo de la conversación… mientras trabajan que se vea en el asistente una opción para verlos trabajar». El equipo
     (los datos y el trabajo) es de js/claquedraw/equipo.js (`C.equipo`), su gestión de js/claquedraw/equipo-ui.js (`C.equipoUI`) y la
     escena del taller, de duendes.html (`Duendes.taller`). Aquí:
     · **Los especiales de la conversación**: el botón «Duendes» (junto a «Fórmulas») abre la lista con buscador; marcar varios, en
       orden. Se **congelan al elegirlos** (`C.equipo.instantanea`) y van a `conv.fijarEspeciales`: editar después su ficha no cambia
       esta conversación (su chip lo dice: «como al elegirlo»). **El formateador va elegido de partida** en cada conversación nueva
       (`dnActivos === null` = «los de partida», que se deciden al crear la conversación, cuando el equipo ya se leyó).
     · **La herramienta del maestro**, `trabajar_en_equipo` (la define el motor, `herramientaEquipo`): `ejecutarEquipo` resuelve las
       fuentes con las herramientas de siempre en modo lectura, arma lo que el proyecto ya conoce (`conocidos`) y llama a
       `C.equipo.trabajar` con el transporte del asistente, lo que queda del tope y el Detener de la conversación. Cada evento del
       equipo va a su paso (una línea por evento, con el chip del color de la ropa del duende; el enojo en rojo), a la franja del
       duende trabajando y al taller.
     · **El taller** («Ver trabajar»): una ventana flotante, no modal, con la escena de duendes.html (`?embebido=1&taller=1`), un solo
       marco creado una vez. Se mueve por su cabecera, se escala por su esquina (16:9), Esc o × la cierran y se recuerda abierta.
     · **El sonido** (🔊 en la cabecera, apagado de partida): al terminar una respuesta, el duende maestro «habla» sus primeras
       palabras en su voz (`Duendes.hablar`, en el taller si está abierto o en el marco de la franja); en el taller, los globos
       hablan. Con la ventana escondida o el panel cerrado, nada suena. */
  const EQ = () => C.equipo || null;
  const HERR_EQUIPO = 'trabajar_en_equipo';
  const PAPEL_TXT = { maestro: 'Maestro', lector: 'Lector', escritor: 'Escritor', coordinador: 'Coordinador', especial: 'Especial' };
  const ROL_TXT = { revisar: 'Revisa', transformar: 'Transforma' };
  /* el color de un duende sin aspecto propio (el de su papel) */
  const COLOR_PAPEL = { maestro: '#6141C9', lector: '#2F7FC1', escritor: '#2E9E6B', coordinador: '#4A4E5A', especial: '#C9772B' };
  let equipoCache = null;                                      // el último que se leyó (si la UI de duendes no está)
  function equipoAhora() {
    let e = null;
    try { e = g.equipo ? g.equipo() : null; } catch (_) { e = null; }
    if (!e && C.equipoUI && typeof C.equipoUI.equipo === 'function') { try { e = C.equipoUI.equipo(); } catch (_) { e = null; } }
    if (!e) e = equipoCache;
    const E = EQ();
    if (!e && E && typeof E.porDefecto === 'function') { try { e = equipoCache = E.porDefecto(); } catch (_) { e = null; } }
    return e && Array.isArray(e.duendes) ? e : null;
  }
  /* lee el equipo si aún no se leyó (al arrancar, el almacén contesta con retraso) */
  async function leerEquipo() {
    if (!g.leerEquipo) return equipoAhora();
    try { const e = await g.leerEquipo(); if (e && Array.isArray(e.duendes)) equipoCache = e; } catch (_) { /* el de partida */ }
    return equipoAhora();
  }
  const duendesDe = e => (e && Array.isArray(e.duendes) ? e.duendes : []);
  function maestro() {
    const E = EQ(), e = equipoAhora();
    try { if (E && E.maestro && e) { const m = E.maestro(e); if (m) return m; } } catch (_) { /* a mano */ }
    return duendesDe(e).find(d => d.papel === 'maestro') || null;
  }
  const nombreMaestro = () => (maestro() && maestro().nombre) || 'El duende maestro';
  function especialesEquipo() {
    const E = EQ(), e = equipoAhora(); if (!e) return [];
    try { if (E && E.especiales) return E.especiales(e) || []; } catch (_) { /* a mano */ }
    return duendesDe(e).filter(d => d.papel === 'especial');
  }
  function instantanea(d) {
    const E = EQ();
    try { if (E && E.instantanea) return E.instantanea(d) || null; } catch (_) { /* a mano */ }
    return { id: d.id, nombre: d.nombre, personalidad: d.personalidad || '', rol: d.rol || 'revisar', veto: !!d.veto, modelo: d.modelo || null, temperatura: d.temperatura ?? null,
      voz: d.voz || null, duende: d.duende ? JSON.parse(JSON.stringify(d.duende)) : null, enojon: !!d.enojon, fijadaEn: Date.now() };
  }
  /* su aspecto: el suyo o el de su papel (`C.equipo.aspectoDe`: el formateador de fábrica lleva el suyo) */
  function aspecto(d) { const E = EQ(); try { if (E && E.aspectoDe) return E.aspectoDe(d); } catch (_) { /* el suyo */ } return (d && d.duende) || null; }
  const colorDuende = d => { const a = aspecto(d); return (a && (a.cloth || a.hatCol || a.cape)) || COLOR_PAPEL[(d && d.papel) || 'especial'] || COLOR_PAPEL.especial; };
  function vozDe(d) { const E = EQ(); try { if (E && E.vozDe) return E.vozDe(d); } catch (_) { /* la suya */ } return (d && (d.voz || (d.duende && d.duende.voz))) || null; }
  const primeraLinea = t => (String(t || '').split('\n').find(l => l.trim()) || '').trim();

  /* ---------- los especiales de la conversación ---------- */
  let dnActivos = null;              // las instantáneas elegidas para el modo Equipo; null = ninguna (aún sin tocar)
  let dnPop = null;
  function dnPartida() { const f = especialesEquipo().find(d => d.id === 'formateador'), x = f && instantanea(f); return x ? [x] : []; }
  const dnVista = () => (dnActivos === null ? [] : dnActivos.slice());

  /* ---------- quién contesta: Maestro · Equipo · Mesa (1.1.68, §13) ----------
     Leo: «Yo debo decidir cuándo se usan o no [el] agent team de duendes; por defecto solo contesta el duende maestro» y «quiero poder
     poner a más de un duende en el asistente, para colaborar o discutir entre ellos». El control de tres posiciones sobre el campo:
     **Maestro** (de partida en cada conversación nueva; sin el equipo), **Equipo** (el maestro encarga lo largo a su equipo; al pasar a
     él sin especiales, se elige el formateador) y **Mesa** (los duendes elegidos conversan en el chat, cada uno con su burbuja, por
     turnos y en rondas, y el maestro resume; solo leen). El modo es de la conversación (`conv.fijarModo`, en lo guardado); los de la
     mesa (participantes, rondas, resumen) van con lo que guarda el panel. */
  const MODOS = ['maestro', 'equipo', 'mesa'];
  let modoLocal = 'maestro';
  let mesaCfg = { participantes: [], rondas: 2, resumen: true, resumenSolo: false };
  /* el modo de una conversación del motor (el nombre de su campo, sin confundirlo con el de las herramientas: tools/texto) */
  function modoDe(c) {
    if (!c) return null;
    for (const k of ['modoDuendes', 'modoConversacion', 'modoChat', 'quien', 'modo']) { const v = c[k]; if (typeof v === 'string' && MODOS.includes(v)) return v; }
    return null;
  }
  const modoActual = () => modoLocal;
  function ponerModoEnConv(c, m) {
    if (!c) return;
    if (typeof c.fijarModo === 'function') { try { c.fijarModo(m); } catch (e) { console.error('fijarModo:', e); } }
  }
  function ponerModo(m) {
    if (!MODOS.includes(m) || !EQ()) return;
    if (enCurso) { avisar('Espera a que termine (o pulsa Detener) para cambiar quién contesta'); pintarModos(); return; }
    modoLocal = m;
    if (!conv) conv = crearConversacion();
    ponerModoEnConv(conv, m);
    /* al pasar a Equipo sin especiales, el formateador */
    if (m === 'equipo' && !dnVista().length) fijarDn(dnPartida());
    cerrarDn();
    pintarModos(); pintarDn(); guardar();
    if (m === 'mesa' && mesaCfg.participantes.length < 2) setTimeout(() => { if (modoLocal === 'mesa' && !dnPop) abrirDn(); }, 0);   // quiénes conversan
  }
  function pintarModos() {
    const caja = panel && panel.querySelector('[data-as-modos]'); if (!caja) return;
    caja.hidden = !EQ();
    caja.querySelectorAll('[data-as-modo]').forEach(b => { const on = b.dataset.asModo === modoLocal; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const nota = caja.querySelector('[data-as-modos-nota]');
    if (nota) { nota.textContent = modoLocal === 'mesa' ? plural(mesaCfg.rondas, 'ronda', 'rondas') + (mesaCfg.resumen ? ' · resume el maestro' : '') : ''; nota.title = nota.textContent; }
    if (panel) panel.dataset.modo = modoLocal;
  }
  /* la lista de chips del modo: los especiales (Equipo) o los de la mesa */
  const listaModo = () => (modoLocal === 'mesa' ? mesaCfg.participantes.slice() : dnVista());
  function fijarLista(l) { if (modoLocal === 'mesa') fijarMesa(l); else fijarDn(l); }
  function fijarMesa(l) {
    const vistos = new Set();
    mesaCfg.participantes = (l || []).filter(x => x && x.id && !vistos.has(x.id) && vistos.add(x.id)).slice(0, 6);
    pintarDn(); marcarDn(); pintarModos(); guardar();
  }
  /* los fijos también se sientan a la mesa (con su papel como personalidad) y el maestro, como moderador */
  const PERSONALIDAD_FIJA = {
    maestro: 'Eres el duende maestro: moderas la mesa. Ordenas la conversación, preguntas lo que falta y no das tu opinión antes que los demás.',
    lector: 'Eres el lector del equipo: te fijas en lo que dicen de verdad las fuentes del proyecto y señalas lo que falta o no cuadra con ellas.',
    escritor: 'Eres la escritora del equipo: propones cómo escribirlo, con ejemplos concretos de escenas, diálogos o frases.',
    coordinador: 'Eres el coordinador del equipo: exiges que todo salga de lo que Leo ya escribió y vetas lo que se inventa o se contradice.'
  };
  function participanteDe(d) {
    if (!d) return null;
    const E = EQ();
    try { if (E && typeof E.participante === 'function') { const x = E.participante(d); if (x) return x; } } catch (_) { /* a mano */ }
    if (d.papel === 'especial') return instantanea(d);
    return { id: d.id, nombre: d.nombre || PAPEL_TXT[d.papel] || 'Duende', papel: d.papel, personalidad: PERSONALIDAD_FIJA[d.papel] || '', rol: 'revisar', veto: false,
      modelo: d.modelo || null, temperatura: d.temperatura ?? null, voz: vozDe(d), duende: aspecto(d), enojon: !!d.enojon, fijadaEn: Date.now() };
  }
  /* «@Nombre …» al principio del mensaje: solo contestan esos (uno o varios; con o sin el artículo: «@crítica» vale por «La crítica») */
  function soloDe(texto, ps) {
    const ids = []; let t = String(texto || '');
    const sinArt = n => planoFx(n).replace(/^(el|la|los|las)\s+/, '');
    for (;;) {
      const m = /^\s*@/.exec(t); if (!m) break;
      const resto = planoFx(t.slice(m[0].length));
      let mejor = null, largo = 0;
      ps.forEach(p => [planoFx(p.nombre || ''), sinArt(p.nombre || '')].forEach(n => {
        if (n && resto.startsWith(n) && !/[\p{L}\p{N}]/u.test(resto.charAt(n.length) || ' ') && n.length > largo) { mejor = p; largo = n.length; }
      }));
      if (!mejor) break;
      if (!ids.includes(mejor.id)) ids.push(mejor.id);
      t = t.slice(m[0].length + largo).replace(/^[\s,y]+(?=@)/i, '');
    }
    return ids;
  }
  /* quién habla en un turno de la mesa: su nombre, su papel y su color (de la mesa, o del equipo) */
  function turnoDe(quien, o) {
    const x = mesaCfg.participantes.find(p => p.id === quien) || duendesDe(equipoAhora()).find(d => d.id === quien) || null;
    const papel = (o && o.papel) || (x && x.papel) || (quien === 'maestro' ? 'maestro' : /^pj:/.test(quien) ? 'personaje' : 'especial');
    if (papel === 'personaje') return { quien, nombre: (o && o.nombre) || (x && x.nombre) || 'Personaje', papel, color: colorPj((x && x.personaje) || String(quien).slice(3)), ronda: o && o.ronda != null ? o.ronda : null, resumen: false };
    return { quien, nombre: (o && o.nombre) || (x && x.nombre) || (quien === 'maestro' ? nombreMaestro() : 'Duende'), papel, color: colorDuende(Object.assign({ papel }, x || {})), ronda: o && o.ronda != null ? o.ronda : null, resumen: !!(o && o.resumen) };
  }
  /* §17: ¿es el turno del coordinador que revisa? (el motor lo dice con `corrige`; si no, por su id) */
  const revisaTurno = (t, q) => !!(t && (t.revisa === true || t.corrige === true || t.quien === ID_COORD || (q && q.papel === 'coordinador')));
  /* lo que dice en la mascota: su primera corrección (la primera línea de viñeta o la primera frase) */
  function primeraCorreccion(md) {
    const l = String(md || '').split('\n').map(x => x.trim()).filter(Boolean), v = l.find(x => /^([-*•]|\d+[.)])\s+/.test(x));
    return primerasPalabras((v || l[0] || '').replace(/^([-*•]|\d+[.)])\s+/, ''));
  }
  /* un turno de la mesa: empieza (su burbuja, viva), termina (lo dice en la mascota y en el taller) o falla */
  function alTurno(t) {
    if (!t || !t.quien) return;
    ultimaNovedad = Date.now();
    const q = turnoDe(t.quien, t);
    const x = mesaCfg.participantes.find(p => p.id === t.quien) || duendesDe(equipoAhora()).find(d => d.id === t.quien) || null;
    if (t.fase === 'empieza') {
      if (iaActual) { iaActual.vivo = false; iaActual.cerrado = true; }
      iaActual = Object.assign({ tipo: 'ia', texto: '', vivo: true }, q, revisaTurno(t, q) ? { revisa: true } : {}); items.push(iaActual);
      tallerEvento({ quien: t.quien, papel: q.papel, nombre: q.nombre, accion: 'escribir', texto: 'Pensando qué decir…', ronda: t.ronda });
    } else if (t.fase === 'termina') {
      const it = iaActual && iaActual.quien === t.quien ? iaActual : [...items].reverse().find(i => i.tipo === 'ia' && i.quien === t.quien);
      if (it) { if (typeof t.texto === 'string' && t.texto.trim() && !String(it.texto || '').trim()) it.texto = t.texto; it.vivo = false; it.cerrado = true; }
      /* §17: el coordinador revisa lo dicho; con problemas, su burbuja lo marca y entra enojado a la mascota con la primera corrección */
      const revisa = revisaTurno(t, q), nProb = Math.max(0, Math.round(+t.problemas || 0));
      if (it && revisa) { it.revisa = true; it.problemas = nProb; }
      const dicho = revisa && nProb > 0 ? primeraCorreccion(t.texto || (it && it.texto) || '') : primerasPalabras(t.texto || (it && it.texto) || '');
      if (revisa && nProb > 0 && dicho) tallerEvento({ quien: t.quien, papel: q.papel, nombre: q.nombre, accion: 'enojo', texto: dicho, ronda: t.ronda });
      if (dicho) {
        tallerEvento({ quien: t.quien, papel: q.papel, nombre: q.nombre, accion: 'hablar', texto: dicho, ronda: t.ronda });
        const esMaestro = t.quien === 'maestro' || q.papel === 'maestro';
        decirMascota({ quien: esMaestro ? 'maestro' : t.quien, nombre: q.nombre, duende: esMaestro ? maestroMasc().duende : q.papel === 'personaje' ? (x && x.duende) || null : x ? aspecto(Object.assign({ papel: q.papel }, x)) : null,
          voz: esMaestro ? maestroMasc().voz : x ? vozDe(x) : null, texto: dicho, sonido: sonidoActivo() && !tallerAbierto(), emo: revisa && nProb > 0 ? 'enojado' : undefined });
      }
    } else if (t.fase === 'error') {
      const err = t.error || t.texto || '';
      const it = iaActual && iaActual.quien === t.quien && !String(iaActual.texto || '').trim() ? iaActual : null;
      if (it) { items = items.filter(i => i !== it); iaActual = null; }            // su burbuja vacía se va
      items.push({ tipo: 'aviso', texto: q.nombre + ' no pudo contestar' + (err ? ': ' + corto(err, 160) : '') });
      tallerEvento({ quien: t.quien, papel: q.papel, nombre: q.nombre, accion: 'error', texto: 'No pude contestar', ronda: t.ronda });
    }
    repintarPronto();
  }
  /* ---------- los personajes en la mesa (1.1.68, §15: Leo, «poder llamar duendes de los personajes, para que interpreten su papel y
     pueda ir preguntándole cosas; también se puede configurar qué modelo se usa») ----------
     El participante lo arma el asistente desde el proyecto y lo congela `C.equipo.participante({ tipo: 'personaje', … })`: su hoja (su
     biblioteca, «Hoja de personaje» primero, en texto), lo que el proyecto dice de él (sus diálogos y lo que se dice de él donde se le
     nombra, y sus nodos en los esquemas), su duende de Personajes y su voz. Su modelo y su temperatura se cambian en su chip y se
     recuerdan por personaje y proyecto en las preferencias de esta máquina; «↻» lo vuelve a armar si su hoja cambió. */
  const MODELO_PJ = 'deepseek-v4-flash', TEMP_PJ = 0.8;
  const docsPj = () => docsFx();
  function personajesProyecto() { const d = docsPj(); try { return d && d.elenco ? d.elenco().filter(p => p && p.id && p.nombre) : []; } catch (_) { return []; } }
  function colorPj(pid) {
    const d = docsPj(); let p = null; try { p = d && d.personaje ? d.personaje(pid) : null; } catch (_) { p = null; }
    const par = p && C.PALETA_ETIQUETAS && C.PALETA_ETIQUETAS[p.color];
    return par ? (document.documentElement.dataset.theme === 'dark' ? par[1] : par[2]) : COLOR_PAPEL.especial;
  }
  function duendePj(pid) { const d = docsPj(); try { const t = d && d.datos && d.datos.teatro; return (t && t.duendes && t.duendes[pid]) || null; } catch (_) { return null; } }
  const modeloCorto = m => String(m || '').replace(/^deepseek-/, '');
  function clavePj() { try { const pr = g.proyecto ? g.proyecto() : null; return (pr && (pr.archivo || pr.id)) || 'sin-proyecto'; } catch (_) { return 'sin-proyecto'; } }
  function prefPj(pid) { const t = pref.personajes && pref.personajes[clavePj()]; return (t && t[pid]) || {}; }
  function guardarPrefPj(pid, cambios) {
    pref.personajes = Object.assign({}, pref.personajes);
    const k = clavePj(); pref.personajes[k] = Object.assign({}, pref.personajes[k]);
    pref.personajes[k][pid] = Object.assign({}, pref.personajes[k][pid], cambios);
    guardarPref();
  }
  const textoDe = html => { const V = C.conversor; try { return V && V.aTexto ? V.aTexto(html || '') : String(html || '').replace(/<[^>]+>/g, ' '); } catch (_) { return ''; } };
  function hojaPj(pid) {
    const d = docsPj(); if (!d || !d.hojaPersonaje) return '';
    let h; try { h = d.hojaPersonaje(pid); } catch (_) { return ''; }
    return (h.notas || []).map(n => '## ' + (n.titulo || 'Sin título') + '\n' + textoDe(n.html).trim()).filter(Boolean).join('\n\n').slice(0, 6000);
  }
  /* lo que el proyecto dice de él: primero sus diálogos, después donde se le nombra, y sus nodos en los esquemas */
  function contextoPj(pid, nombre) {
    const d = docsPj(); if (!d) return '';
    const k = planoFx(nombre), suyos = [], nombra = [], nodos = [];
    let ms = []; try { ms = d.menciones ? d.menciones(pid) : []; } catch (_) { ms = []; }
    ms.forEach(m => {
      let html = '';
      try { const n = d.nota && d.nota(m.id); html = n ? n.html : m.eid && d.documentoEsquema ? ((d.documentoEsquema(m.eid) || {}).html || '') : ''; } catch (_) { html = ''; }
      const donde = '[' + (m.ruta || m.titulo || 'nota') + ']';
      textoDe(html).split(/\n\s*\n/).forEach(par => {
        const t = par.trim(), pl = planoFx(t); if (!t || !pl.includes(k)) return;
        (pl.startsWith(k) ? suyos : nombra).push(donde + ' ' + t);
      });
    });
    try {
      (d.esquemasDePersonaje ? d.esquemasDePersonaje(pid) : []).forEach(x => {
        const r = d.esquema(x.eid), md = r && r.esquema && r.esquema.datos; if (!md) return;
        (md.lineas || []).filter(l => l.personaje === pid).forEach(l => {
          (md.puntos || []).filter(p => p.lineaId === l.id && p.titulo).sort((a, b) => (a.col || 0) - (b.col || 0))
            .forEach(p => nodos.push('[esquema «' + x.nombre + '»] ' + p.titulo + (p.descripcion ? ': ' + corto(p.descripcion, 200) : '')));
        });
      });
    } catch (_) { /* lo que haya */ }
    const partes = [];
    if (suyos.length) partes.push('LO QUE DICE Y HACE:\n' + suyos.join('\n\n'));
    if (nombra.length) partes.push('DONDE SE LE NOMBRA:\n' + nombra.join('\n\n'));
    if (nodos.length) partes.push('SUS MOMENTOS EN LOS ESQUEMAS:\n' + nodos.join('\n'));
    return partes.join('\n\n').slice(0, 10000);
  }
  const huellaPj = (hoja, ctx) => { let h = 2166136261; const t = String(hoja) + '\u0000' + String(ctx); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  /* el participante de un personaje (congelado), con su modelo y su temperatura recordados (o los de `cambios`) */
  function participantePj(pid, cambios) {
    const d = docsPj(); let p = null; try { p = d && d.personaje ? d.personaje(pid) : null; } catch (_) { p = null; }
    if (!p) { avisar('Ese personaje ya no está en el proyecto'); return null; }
    const pr = Object.assign({}, prefPj(pid), cambios || {}), du = duendePj(pid);
    let proy = null; try { const x = g.proyecto ? g.proyecto() : null; proy = x && x.nombre; } catch (_) { proy = null; }
    const datos = { tipo: 'personaje', personaje: pid, nombre: p.nombre, hoja: hojaPj(pid), contexto: contextoPj(pid, p.nombre), proyecto: proy,
      modelo: pr.modelo || MODELO_PJ, temperatura: pr.temperatura != null ? +pr.temperatura : TEMP_PJ, voz: (du && du.voz) || null, duende: du, fijadaEn: Date.now() };
    const E = EQ();
    try { if (E && typeof E.participante === 'function') { const x = E.participante(datos); if (x) return x; } } catch (e) { console.error('participante:', e); }
    return Object.assign({ id: 'pj:' + pid, papel: 'personaje' }, datos);
  }
  /* ¿su hoja o lo que el proyecto dice de él cambió desde que se le llamó? (para «↻»; con caché de unos segundos) */
  const cacheHuellaPj = new Map();
  function cambioPj(x) {
    const pid = x.personaje || String(x.id).slice(3), c = cacheHuellaPj.get(pid);
    let h = c && Date.now() - c.t < 4000 ? c.h : null;
    if (!h) { h = huellaPj(hojaPj(pid), contextoPj(pid, x.nombre)); cacheHuellaPj.set(pid, { h, t: Date.now() }); }
    return h !== huellaPj(x.hoja || '', x.contexto || '');
  }
  /* el menú de su chip: el modelo (con su precio), la temperatura y «↻» */
  let pjPop = null;
  function cerrarPj() { if (pjPop) { pjPop.remove(); pjPop = null; } }
  function abrirMenuPj(id) {
    cerrarDn(); cerrarPj();
    const x = mesaCfg.participantes.find(p => p.id === id); if (!x) return;
    const pid = x.personaje || id.slice(3), ms = modelos();
    const pop = document.createElement('div');
    pop.className = 'gd-pop as-fx-pop as-pj-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'El modelo de ' + x.nombre);
    pop.innerHTML = `<div class="gd-pop-tit">${esc(x.nombre)} <span>· su modelo (se recuerda para este personaje)</span></div>`
      + `<div class="as-fx-lista">${ms.map(m => `<div class="as-fx-fila"><button type="button" class="as-fx-op${m.id === x.modelo ? ' on' : ''}" role="menuitemradio" aria-checked="${m.id === x.modelo}" data-as-pj-modelo="${esc(m.id)}"><span class="as-fx-check">${ic('ic-check', 11)}</span><span class="as-fx-txt"><b>${esc(m.id)}</b><em>${esc(precioTxt(m))}${m.nota ? ' · ' + esc(m.nota) : ''}</em></span><small></small></button></div>`).join('')}</div>`
      + `<div class="gd-pop-sep"></div><label class="as-pj-temp">Temperatura <input type="range" min="0" max="1.5" step="0.1" value="${esc(x.temperatura != null ? x.temperatura : TEMP_PJ)}" data-as-pj-temp> <b data-as-pj-temp-v>${esc(String(x.temperatura != null ? x.temperatura : TEMP_PJ).replace('.', ','))}</b></label>`
      + `<div class="gd-pop-sep"></div><button type="button" class="as-fx-admin" data-as-pj-rehacer>${ic('ic-reset', 13)}<span>↻ Volver a leer su hoja y lo que dice de él el proyecto</span></button>`;
    panel.querySelector('[data-as-pie]').appendChild(pop);
    pjPop = pop;
    const reponer = cambios => {
      const nuevo = participantePj(pid, cambios); if (!nuevo) return;
      mesaCfg.participantes = mesaCfg.participantes.map(p => (p.id === id ? nuevo : p));
      cacheHuellaPj.delete(pid); pintarDn(); guardar();
    };
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-as-pj-modelo]')) { guardarPrefPj(pid, { modelo: b.dataset.asPjModelo }); reponer({ modelo: b.dataset.asPjModelo }); cerrarPj(); return; }
      if (b.matches('[data-as-pj-rehacer]')) { reponer(); cerrarPj(); avisar('«' + x.nombre + '» vuelve con su hoja de ahora'); }
    });
    pop.addEventListener('input', e => { if (e.target.matches('[data-as-pj-temp]')) pop.querySelector('[data-as-pj-temp-v]').textContent = String(e.target.value).replace('.', ','); });
    pop.addEventListener('change', e => { if (e.target.matches('[data-as-pj-temp]')) { const t = +e.target.value; guardarPrefPj(pid, { temperatura: t }); reponer({ temperatura: t }); } });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarPj(); if (campo) cursorAlFinal(); } });
    setTimeout(() => { const f = pop.querySelector('.as-fx-op.on') || pop.querySelector('button'); if (f && pjPop === pop) f.focus({ preventScroll: true }); }, 0);
  }
  const candidatosMesa = () => { const e = duendesDe(equipoAhora()); return e.filter(d => d.papel === 'especial').concat(e.filter(d => d.papel !== 'especial')); };
  /* ¿cambió su ficha desde que se eligió? (su chip lo dice; esta conversación sigue con la de entonces) */
  const CAMPOS_DN = ['nombre', 'personalidad', 'rol', 'veto', 'modelo', 'temperatura', 'voz', 'enojon', 'duende'];
  function cambioDn(x) {
    const d = especialesEquipo().find(y => y.id === x.id);
    if (!d) return 'ya no está en el equipo';
    const E = EQ(), eq = equipoAhora();
    if (E && E.cambiado && eq) { try { return E.cambiado(x, eq) ? 'su ficha cambió después' : null; } catch (_) { /* a mano */ } }
    const ahora = instantanea(d);
    return CAMPOS_DN.some(k => JSON.stringify(ahora[k] ?? null) !== JSON.stringify(x[k] ?? null)) ? 'su ficha cambió después' : null;
  }
  /* cambia los de la conversación (se crea si aún no hay) y lo guardado */
  function fijarDn(lista) {
    const vistos = new Set();
    dnActivos = (lista || []).filter(x => x && x.id && !vistos.has(x.id) && vistos.add(x.id));
    if (!conv) conv = crearConversacion();
    if (conv && typeof conv.fijarEspeciales === 'function') { try { const r = conv.fijarEspeciales(dnActivos); if (Array.isArray(r)) dnActivos = r.slice(); } catch (_) { /* motor de otra versión */ } }
    else if (conv) conv.especiales = dnActivos.slice();
    pintarDn(); marcarDn(); guardar();
  }
  function pintarDn() {
    const caja = panel && panel.querySelector('[data-as-dn]'); if (!caja) return;
    const b = panel.querySelector('[data-as-dn-abrir]'), mesa = modoLocal === 'mesa';
    /* sin el equipo en esta versión, ni el botón; con el maestro solo, tampoco (el equipo no trabaja) */
    if (b) { b.hidden = !EQ() || modoLocal === 'maestro'; const t = b.querySelector('span'); if (t) t.textContent = mesa ? 'Mesa' : 'Duendes'; }
    const lista = EQ() && modoLocal !== 'maestro' ? listaModo() : [];
    if (b) b.classList.toggle('on', !!lista.length);
    caja.hidden = !lista.length;
    caja.classList.toggle('mesa', mesa);
    if (!lista.length) { caja.innerHTML = ''; return; }
    caja.innerHTML = (mesa ? `<span class="as-fx-rot" title="Conversan en la mesa, por turnos y en este orden, con la personalidad que tenían al elegirlos">Mesa</span>`
      : `<span class="as-fx-rot" title="Revisan o transforman lo que escribe el equipo en esta conversación, en este orden, con la personalidad que tenían al elegirlos">Duendes</span>`) + lista.map(x => {
      const nom = x.nombre || 'Duende';
      /* un personaje (§15): su color de etiqueta, su modelo y el menú para cambiarlo; «↻» si su hoja cambió */
      if (x.papel === 'personaje') {
        const cambio = cambioPj(x), pid = x.personaje || String(x.id).slice(3);
        return `<span class="as-fx-chip as-dn-chip as-pj-chip${cambio ? ' cambiado' : ''}" style="--dc:${esc(colorPj(pid))}" data-as-dn-id="${esc(x.id)}"><button type="button" class="as-fx-nom" data-as-pj-menu="${esc(x.id)}" title="${esc(nom + ' (personaje) · ' + x.modelo + ', temperatura ' + x.temperatura + ' · clic: cambiar su modelo')}"><i class="as-dn-punto" aria-hidden="true"></i><span>${esc(corto(nom, 28))} <em>${esc(modeloCorto(x.modelo))}</em></span></button>`
          + (cambio ? `<button type="button" class="as-fx-x as-pj-rehacer" data-as-pj-rehacer-chip="${esc(x.id)}" title="Su hoja o lo que dice de él el proyecto cambió: volver a leerlo" aria-label="Volver a leer la hoja de «${esc(nom)}»">↻</button>` : '')
          + `<button type="button" class="as-fx-x" data-as-dn-quitar="${esc(x.id)}" title="Quitarlo de la mesa" aria-label="Quitar a «${esc(nom)}» de la mesa">${ic('ic-close', 10)}</button></span>`;
      }
      const cambio = x.papel && x.papel !== 'especial' ? null : cambioDn(x);
      const tit = nom + (x.personalidad ? ': ' + corto(primeraLinea(x.personalidad), 140) : '') + (cambio ? ' (como al elegirlo: ' + cambio + ')' : '');
      return `<span class="as-fx-chip as-dn-chip${cambio ? ' cambiado' : ''}" style="--dc:${esc(colorDuende(Object.assign({ papel: 'especial' }, x)))}" data-as-dn-id="${esc(x.id)}"><button type="button" class="as-fx-nom" data-as-dn-ver="${esc(x.id)}" title="${esc(tit)}"><i class="as-dn-punto" aria-hidden="true"></i><span>${esc(corto(nom, 32))}${cambio ? ' <em>(como al elegirlo)</em>' : ''}</span></button>`
        + `<button type="button" class="as-fx-x" data-as-dn-quitar="${esc(x.id)}" title="Quitarlo de la conversación" aria-label="Quitar a «${esc(nom)}» de la conversación">${ic('ic-close', 10)}</button></span>`;
    }).join('');
  }
  function cerrarDn(volver) { if (!dnPop) return; dnPop.remove(); dnPop = null; if (volver && campo) cursorAlFinal(); }
  function marcarDn() {
    if (!dnPop) return;
    const ids = listaModo().map(x => x.id);
    dnPop.querySelectorAll('[data-as-dn-op]').forEach(b => { const i = ids.indexOf(b.dataset.asDnOp); b.classList.toggle('on', i >= 0); b.setAttribute('aria-checked', String(i >= 0)); b.querySelector('small').textContent = i >= 0 ? String(i + 1) : ''; });
    const c = dnPop.querySelector('[data-as-mesa-coord]'); if (c) c.checked = ids.includes(ID_COORD);
  }
  /* el coordinador del equipo (§17: se le puede invitar a la mesa a revisar lo que se dice) */
  const ID_COORD = 'coordinador';
  const coordinadorEquipo = () => duendesDe(equipoAhora()).find(d => d.id === ID_COORD) || null;
  function abrirDuendesUI(op) {
    cerrarDn();
    if (g.abrirDuendes) { try { g.abrirDuendes(op || {}); return; } catch (_) { /* sigue */ } }
    if (C.equipoUI && C.equipoUI.abrir) C.equipoUI.abrir(op || {});
    else avisar('La gestión de los duendes no está en esta versión');
  }
  /* la lista: buscador; marcar uno lo añade (congelado) al final; «Nuevo duende especial…» y «Administrar duendes…» */
  async function abrirDn() {
    if (!panel) return;
    cerrarFx(); cerrarDn();
    await leerEquipo();
    const mesa = modoLocal === 'mesa';
    const es = mesa ? candidatosMesa() : especialesEquipo();
    const pop = document.createElement('div');
    pop.className = 'gd-pop as-fx-pop as-dn-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', mesa ? 'La mesa de duendes' : 'Duendes especiales');
    const sub = d => (d.papel && d.papel !== 'especial' ? (d.papel === 'maestro' ? 'modera' : PAPEL_TXT[d.papel] || '') : (ROL_TXT[d.rol] || '') + (d.rol === 'revisar' && d.veto ? ' · veta' : ''));
    const linea = d => (d.papel && d.papel !== 'especial' ? ((EQ() && EQ().EN_LA_MESA) || PERSONALIDAD_FIJA)[d.id] || PERSONALIDAD_FIJA[d.papel] || '' : d.personalidad);
    const filas = es.map(d => `<div class="as-fx-fila" data-as-fx-fila data-busca="${esc(planoFx((d.nombre || '') + ' ' + (linea(d) || '')))}">`
      + `<button type="button" class="as-fx-op" role="menuitemcheckbox" data-as-dn-op="${esc(d.id)}" title="${mesa ? 'Sentarlo a la mesa' : 'Elegirlo para esta conversación'} (se queda con la personalidad de ahora)"><span class="as-fx-check">${ic('ic-check', 11)}</span><i class="as-dn-punto" style="--dc:${esc(colorDuende(d))}" aria-hidden="true"></i>`
      + `<span class="as-fx-txt"><b>${esc(d.nombre || 'Duende')} <span class="as-dn-rol">${esc(sub(d))}</span></b><em>${esc(corto(primeraLinea(linea(d)), 80) || 'Sin personalidad escrita')}</em></span><small></small></button></div>`).join('');
    /* §15: los personajes del proyecto, en su propia sección (con el color de su etiqueta) */
    const pjs = mesa ? personajesProyecto() : [];
    const filasPj = pjs.length ? `<div class="as-fx-grupo">Personajes <span>· para entrevistarlos (con uno basta)</span></div>` + pjs.map(p => `<div class="as-fx-fila" data-as-fx-fila data-busca="${esc(planoFx(p.nombre || ''))}">`
      + `<button type="button" class="as-fx-op" role="menuitemcheckbox" data-as-dn-op="pj:${esc(p.id)}" title="Llamarlo a la mesa: interpreta su papel con su hoja y lo que el proyecto dice de él"><span class="as-fx-check">${ic('ic-check', 11)}</span><i class="as-dn-punto" style="--dc:${esc(colorPj(p.id))}" aria-hidden="true"></i>`
      + `<span class="as-fx-txt"><b>${esc(p.nombre || 'Personaje')} <span class="as-dn-rol">personaje · ${esc(modeloCorto(prefPj(p.id).modelo || MODELO_PJ))}</span></b><em>${esc(duendePj(p.id) ? 'Con su duende de Personajes' : 'Sin duende propio: el teatro le pone uno')}</em></span><small></small></button></div>`).join('') : '';
    const ajustes = mesa ? `<div class="gd-pop-sep"></div><div class="as-mesa-ajustes"><span>Rondas</span><span class="as-seg as-mesa-rondas" role="radiogroup">${[1, 2, 3].map(n => `<button type="button" role="radio" data-as-mesa-rondas="${n}" class="${mesaCfg.rondas === n ? 'on' : ''}" aria-checked="${mesaCfg.rondas === n}" title="${n === 1 ? 'Cada uno dice lo suyo una vez' : 'En la ' + (n === 2 ? 'segunda' : 'segunda y la tercera') + ' se contestan entre ellos'}">${n}</button>`).join('')}</span>`
      + `<label class="as-mesa-resume"><input type="checkbox" data-as-mesa-resumen${mesaCfg.resumen ? ' checked' : ''}> El maestro resume</label>`
      + `<label class="as-mesa-resume" title="En una entrevista (contesta uno solo), el maestro no resume salvo que lo marques"><input type="checkbox" data-as-mesa-resumen-solo${mesaCfg.resumenSolo ? ' checked' : ''}> también si contesta uno solo</label>`
      + (coordinadorEquipo() ? `<label class="as-mesa-resume as-mesa-coord" title="El coordinador habla el último de cada ronda: contrasta lo que dijeron los demás con el proyecto y dice lo que no se sostiene (lo mismo que elegirlo en la lista)"><input type="checkbox" data-as-mesa-coord${mesaCfg.participantes.some(x => x.id === ID_COORD) ? ' checked' : ''}> Invitar al coordinador (revisa lo que se dice)</label>` : '') + `</div>` : '';
    pop.innerHTML = (mesa ? `<div class="gd-pop-tit">La mesa <span>· de 2 a 6 duendes (o un personaje), en este orden</span></div>` : `<div class="gd-pop-tit">Duendes especiales <span>· en esta conversación</span></div>`)
      + (es.length > 5 ? `<input type="search" class="as-fx-buscar" placeholder="Buscar un duende" aria-label="Buscar un duende">` : '')
      + `<div class="as-fx-lista">${(filas + filasPj) || '<div class="gd-pop-vacio">Aún no hay duendes especiales. Créalos con «Nuevo duende especial…»: revisan o transforman lo que escribe el equipo, con la personalidad que les des.</div>'}</div>`
      + ajustes
      + `<div class="gd-pop-sep"></div><button type="button" class="as-fx-admin" data-as-dn-nuevo>${ic('ic-plus', 13)}<span>Nuevo duende especial…</span></button>`
      + `<button type="button" class="as-fx-admin" data-as-dn-admin>${SVG_DUENDE}<span>Administrar duendes…</span></button>`;
    panel.querySelector('[data-as-pie]').appendChild(pop);
    dnPop = pop;
    marcarDn();
    const buscar = pop.querySelector('.as-fx-buscar');
    pop.addEventListener('change', e => {
      if (e.target.matches('[data-as-mesa-resumen]')) { mesaCfg.resumen = !!e.target.checked; pintarModos(); guardar(); }
      if (e.target.matches('[data-as-mesa-resumen-solo]')) { mesaCfg.resumenSolo = !!e.target.checked; guardar(); }
      /* §17: invitar al coordinador es lo mismo que elegirlo en la lista (va al final: el motor lo hace hablar el último de cada ronda) */
      if (e.target.matches('[data-as-mesa-coord]')) {
        const ahora = listaModo(), esta = ahora.some(x => x.id === ID_COORD), c = coordinadorEquipo();
        if (e.target.checked && !esta && c) {
          if (ahora.length >= 6) { e.target.checked = false; avisar('A la mesa se sientan seis duendes como mucho'); return; }
          fijarMesa(ahora.concat(participanteDe(c)));
        } else if (!e.target.checked && esta) fijarMesa(ahora.filter(x => x.id !== ID_COORD));
      }
    });
    if (buscar) buscar.addEventListener('input', () => { const q = planoFx(buscar.value); pop.querySelectorAll('[data-as-fx-fila]').forEach(f => { f.hidden = !!q && !f.dataset.busca.includes(q); }); });
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-as-dn-op]')) {
        const id = b.dataset.asDnOp, ahora = listaModo(), d = es.find(x => x.id === id);
        const nueva = /^pj:/.test(id) ? (ahora.some(x => x.id === id) ? null : participantePj(id.slice(3))) : d && (mesa ? participanteDe(d) : instantanea(d));
        if (mesa && !ahora.some(x => x.id === id) && ahora.length >= 6) { avisar('A la mesa se sientan seis duendes como mucho'); return; }
        fijarLista(ahora.some(x => x.id === id) ? ahora.filter(x => x.id !== id) : nueva ? ahora.concat(nueva) : ahora);
        return;
      }
      if (b.matches('[data-as-mesa-rondas]')) {
        mesaCfg.rondas = +b.dataset.asMesaRondas || 2;
        pop.querySelectorAll('[data-as-mesa-rondas]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
        pintarModos(); guardar(); return;
      }
      if (b.matches('[data-as-dn-nuevo]')) { abrirDuendesUI({ nuevo: true }); return; }
      if (b.matches('[data-as-dn-admin]')) abrirDuendesUI({});
    });
    pop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarDn(true); return; }
      const ops = [...pop.querySelectorAll('[data-as-fx-fila]')].filter(f => !f.hidden).map(f => f.querySelector('[data-as-dn-op]')), i = ops.indexOf(document.activeElement);
      if (e.target === buscar && e.key === 'Enter') { e.preventDefault(); if (ops[0]) ops[0].click(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'ArrowUp' && i <= 0 && buscar) { buscar.focus(); return; }
        const sig = ops[i < 0 ? 0 : Math.max(0, Math.min(ops.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (sig) sig.focus();
      }
    });
    setTimeout(() => { const f = buscar || pop.querySelector('button'); if (f && dnPop === pop) f.focus({ preventScroll: true }); }, 0);
  }

  /* ---------- trabajar en equipo: la herramienta del maestro ---------- */
  let equipoVivo = null;             // el trabajo en marcha: { it (su paso), conv, eventos }
  const MAX_EVENTOS = 240;
  /* el paso de la llamada (lo puso `alPaso` al empezar; si no, se pone aquí) */
  function pasoEquipo(ctx) {
    const id = ctx && (ctx.llamada || ctx.id);
    let it = id ? items.find(i => i.tipo === 'paso' && i.id === id) : null;
    if (!it) it = [...items].reverse().find(i => i.tipo === 'paso' && i.nombre === HERR_EQUIPO && i.estado === 'en-curso') || null;
    if (!it) {
      if (iaActual) iaActual.cerrado = true;
      it = { tipo: 'paso', id: id || 'eq' + Date.now().toString(36), nombre: HERR_EQUIPO, args: {}, estado: 'en-curso', abierto: false };
      items.push(it);
    }
    return it;
  }
  /* una fuente: lo que el maestro pasó (enlace, id, título de una nota, o la operación de un lienzo) → { etiqueta, texto } o { falta } */
  const leerHerr = async (nombre, args) => {
    if (!g.ejecutar) return null;
    let r = null; try { r = await g.ejecutar(nombre, args, { lectura: true, origen: origen() }); } catch (e) { r = { ok: false, error: (e && e.message) || String(e) }; }
    return r && r.ok !== false && String(r.texto || '').trim() ? String(r.texto) : null;
  };
  /* los duendes que Leo eligió en una operación del lienzo (§11 del contrato: `datos.duendes`, instantáneas) */
  function duendesDeOperacion(lid, nodoId) {
    try {
      const d = docsFx(), r = d && d.lienzo && d.lienzo(lid), n = r && (r.lienzo.nodos || []).find(x => x.id === nodoId);
      return n && n.datos && Array.isArray(n.datos.duendes) ? n.datos.duendes.filter(x => x && x.id) : [];
    } catch (_) { return []; }
  }
  async function resolverFuente(f) {
    const d = docsFx(), E = C.enlaces;
    if (f && typeof f === 'object') {
      if (typeof f.texto === 'string') return f.texto.trim() ? { etiqueta: String(f.etiqueta || 'Texto'), texto: f.texto } : null;   // ya resuelta (otra salida del equipo)
      if (f.lienzo && f.nodo) {
        const lid = String(f.lienzo), nid = String(f.nodo), n = nombreNodo(lid, nid), t = await leerHerr('ejecutar_nodo', { lienzo: lid, nodo: nid });
        return t ? { etiqueta: 'Operación ' + (n.nodo ? '«' + n.nodo + '»' : nid) + (n.lienzo ? ' del lienzo «' + n.lienzo + '»' : ''), texto: t, duendes: duendesDeOperacion(lid, nid) } : { falta: 'la operación ' + nid + ' del lienzo' };
      }
      f = f.enlace || f.id || f.nota || f.esquema || f.biblioteca || '';
    }
    const s = String(f || '').trim(); if (!s) return null;
    let ref = null;
    try { ref = E && E.esEnlace(s) ? E.leer(s) : E && d ? E.porId(d, s) : null; } catch (_) { ref = null; }
    let et = ''; try { et = ref && d && E.etiqueta ? E.etiqueta(d, ref, {}) : ''; } catch (_) { et = ''; }
    let t = null;
    let duendes = null;
    if (ref && ref.tipo === 'lienzo' && ref.nodo) { t = await leerHerr('ejecutar_nodo', { lienzo: ref.id, nodo: ref.nodo }); duendes = duendesDeOperacion(ref.id, ref.nodo); }
    else if (ref && ref.tipo === 'documento') t = await leerHerr('leer_documento', Object.assign({ esquema: ref.esquema || ref.id }, ref.bloques ? { desde: ref.bloques[0], hasta: ref.bloques[1] } : {}));
    else if (ref && ref.tipo === 'nota' && !ref.esquema) t = await leerHerr('leer_documento', Object.assign({ nota: ref.id }, ref.bloques ? { desde: ref.bloques[0], hasta: ref.bloques[1] } : {}));
    else if (ref && ref.tipo === 'esquema') {
      /* la estructura y, si lo tiene, su guion (leer_esquema no lo trae: la escritora tiene que saber lo que ya está escrito) */
      t = await leerHerr('leer_esquema', { esquema: ref.id });
      const g2 = t ? await leerHerr('leer_documento', { esquema: ref.id }) : null;
      if (g2) t += '\n\nSU GUION:\n' + g2;
    }
    else if (ref && ref.tipo === 'biblioteca') t = await leerHerr('leer_biblioteca', { biblioteca: ref.id, contenido: true });
    else if (ref && E && E.esEnlace(s)) t = await leerHerr('ver_enlace', { enlace: s });
    else if (ref) t = await leerHerr('ver_enlace', { enlace: E.crear(proyectoSlug(), ref) });
    else {
      /* ni enlace ni id: el nombre de un esquema (su estructura y su guion), el título de una nota o el nombre de una biblioteca
         (las herramientas los buscan por su nombre). En vivo, el maestro pasaba «Piloto» y el equipo trabajaba sin fuentes. */
      t = await leerHerr('leer_esquema', { esquema: s });
      if (t) {
        et = 'Esquema «' + s + '»';
        const g2 = await leerHerr('leer_documento', { esquema: s });
        if (g2) t += '\n\nSU GUION:\n' + g2;
      }
      if (!t) { t = await leerHerr('leer_documento', { nota: s }); if (t) et = 'Nota «' + s + '»'; }
      if (!t) { t = await leerHerr('leer_biblioteca', { biblioteca: s, contenido: true }); if (t) et = 'Biblioteca «' + s + '»'; }
    }
    return t ? Object.assign({ etiqueta: et || s, texto: t }, duendes && duendes.length ? { duendes } : {}) : { falta: et || s };
  }
  function proyectoSlug() {
    try { const pr = g.proyecto ? g.proyecto() : null; return (pr && (pr.enlace || (pr.nombre && C.enlaces.slug(pr.nombre)))) || 'proyecto'; } catch (_) { return 'proyecto'; }
  }
  /* los nombres que el proyecto ya tiene (lo demás que salga en el texto, las comprobaciones lo miran) */
  function conocidos() {
    const d = docsFx(), out = { personajes: [], nombres: [] }; if (!d) return out;
    try { out.personajes = d.elenco().map(p => p.nombre).filter(Boolean); } catch (_) { /* sin elenco */ }
    const nom = new Set(), pon = x => { const t = String(x || '').trim(); if (t && t.length <= 120) nom.add(t); };
    try {
      (d.datos.contenedores || []).forEach(c => {
        pon(c.nombre);
        (c.subs || []).forEach(s => pon(s.nombre));
        (c.lienzos || []).forEach(l => pon(l.nombre));
        (c.esquemas || []).forEach(e => {
          pon(e.nombre); const md = e.datos || {};
          (md.lineas || []).forEach(l => pon(l.nombre)); (md.actos || []).forEach(a => pon(a.nombre)); (md.puntos || []).forEach(p => pon(p.titulo));
        });
      });
    } catch (_) { /* lo que se pudo */ }
    out.nombres = [...nom].slice(0, 3000);
    return out;
  }
  /* guion o prosa: el que diga el maestro; si no, prosa si lo que entra son notas, y si no, guion */
  function formatoDe(args, fuentes) {
    if (args.formato === 'guion' || args.formato === 'prosa') return args.formato;
    return fuentes.length && fuentes.every(f => /^Nota /.test(f.etiqueta || '')) ? 'prosa' : 'guion';
  }
  /* el que habla en un evento: su nombre y su color (del equipo, o de las instantáneas de la conversación) */
  function quienDe(ev, especiales) {
    const x = (especiales || []).find(s => s.id === ev.quien) || duendesDe(equipoAhora()).find(d => d.id === ev.quien) || null;
    return { nombre: ev.nombre || (x && x.nombre) || PAPEL_TXT[ev.papel] || 'Duende', color: colorDuende(Object.assign({ papel: ev.papel || (x && x.papel) }, x || {})) };
  }
  /* un evento del equipo: a su paso, a la franja y al taller */
  function alEventoEquipo(it, ev, especiales) {
    if (!ev || typeof ev !== 'object') return;
    const q = quienDe(ev, especiales);
    const e = { quien: ev.quien || null, papel: ev.papel || null, nombre: q.nombre, color: q.color, accion: String(ev.accion || 'hablar'), texto: corto(ev.texto || '', 160), ronda: ev.ronda ?? null };
    const eq = it.equipo;
    if (eq) {
      eq.eventos.push(e); if (eq.eventos.length > MAX_EVENTOS) eq.eventos.splice(0, eq.eventos.length - MAX_EVENTOS);
      if (ev.ronda != null) eq.rondas = Math.max(eq.rondas || 0, +ev.ronda || 0);
      if (e.accion === 'rechazar' || e.accion === 'corregir') eq.correcciones = (eq.correcciones || 0) + 1;
      if (e.accion === 'enojo') eq.enojos = (eq.enojos || 0) + 1;
    }
    ultimaNovedad = Date.now();
    tallerEvento(ev);
    eventoMascota(ev, especiales);
    revisarDuende();
    repintarPronto();
  }
  /* Lo que ejecuta la herramienta del maestro (el motor le da forma al resultado para el modelo y guarda el texto para
     `{{equipo:…}}`). `ctx`: el de la llamada (`llamada`, su id; y `detenido`, si el motor lo da) */
  async function ejecutarEquipo(args, ctx) {
    const E = EQ(), M = motor();
    if (!E || typeof E.trabajar !== 'function') return { ok: false, error: 'El equipo de duendes no está en esta versión de ClapCraft: escribe tú el texto.' };
    args = args || {};
    const instruccion = String(args.instruccion || '').trim();
    if (!instruccion) return { ok: false, error: 'Falta «instruccion»: qué tiene que escribir el equipo.' };
    const mia = conv, it = pasoEquipo(ctx);
    if (args && typeof args === 'object' && Object.keys(args).length) it.args = args;
    it.equipo = { eventos: [], enCurso: true, desde: Date.now(), rondas: 0, correcciones: 0 };
    equipoVivo = { it, conv: mia };
    repintarPronto(); pintarVerMascota();                      // «Ver trabajar» en la mascota, al momento (no al siguiente vistazo)
    try {
      const eq = equipoAhora() || await leerEquipo();
      const deConv = mia && Array.isArray(mia.especiales) ? mia.especiales.slice() : dnVista();
      tallerEmpezar(eq, deConv);
      /* las fuentes, leídas (en paralelo no: g.ejecutar vuelca el editor en cada una) */
      const lista = (Array.isArray(args.fuentes) ? args.fuentes : args.fuentes ? [args.fuentes] : []).slice(0, 16);
      const fuentes = [], faltan = [], deOperacion = [];
      for (const f of lista) {
        if (mia && mia._detener) break;
        const x = await resolverFuente(f);
        if (x && x.texto) fuentes.push({ etiqueta: x.etiqueta, texto: x.texto }); else if (x && x.falta) faltan.push(x.falta);
        if (x && x.duendes) deOperacion.push(...x.duendes);
      }
      /* los de una operación del lienzo van delante de los de la conversación, sin repetir */
      const vistos = new Set(), especiales = deOperacion.concat(deConv).filter(x => x && x.id && !vistos.has(x.id) && vistos.add(x.id));
      if (deOperacion.length) {
        tallerActores(actoresDe(eq, especiales));
        it.equipo.deOperacion = deOperacion.filter((x, k, a) => a.findIndex(y => y.id === x.id) === k).map(x => ({ nombre: x.nombre || 'Duende', color: colorDuende(Object.assign({ papel: 'especial' }, x)) }));
        repintarPronto();
      }
      /* lo de la conversación (el motor lo da hecho en `ctx.trabajo`: transporte, precio, tope, Detener, el gasto en vivo); si no, aquí */
      const T0 = ctx && ctx.trabajo && typeof ctx.trabajo === 'object' ? ctx.trabajo : {};
      const tope = () => (mia && mia.tope != null ? +mia.tope : cfg && cfg.tope != null ? +cfg.tope : TOPE_DEFECTO);
      const gastado = () => (mia && mia.gasto && +mia.gasto.coste) || 0;
      /* el gasto de cada llamada del equipo, a la conversación al momento (su coste en la cabecera, y el tope lo cuenta) */
      const sumar = typeof T0.alGasto === 'function' ? T0.alGasto : ctx && typeof ctx.sumarGasto === 'function' ? x => ctx.sumarGasto(x) : null;
      const alGasto = sumar ? x => { if (it.equipo) it.equipo.coste = (+it.equipo.coste || 0) + (+(x && x.coste) || 0); try { sumar(x); } catch (_) { /* el motor lo suma al final */ } } : undefined;
      const quedan = typeof T0.quedan === 'function' ? T0.quedan
        : () => { const t = tope(); return t > 0 ? Math.max(0, t - gastado()) : Infinity; };
      const detenido = typeof T0.detenido === 'function' ? T0.detenido : ctx && typeof ctx.detenido === 'function' ? ctx.detenido : () => !!(mia && (mia._detener || conv !== mia));
      const suyo = typeof T0.alEvento === 'function' ? T0.alEvento : null;
      const r = await E.trabajar(Object.assign({ transporte: g.transporte, precio: M && M.precioDe ? M.precioDe : undefined }, T0, {
        equipo: eq, especiales, instruccion, fuentes,
        formato: formatoDe(args, fuentes), modo: args.modo === 'libre' || args.modo === 'fiel' ? args.modo : (eq && eq.modo) || 'fiel',
        conocidos: conocidos(), quedan, detenido, alGasto,
        alEvento: ev => { if (suyo) { try { suyo(ev); } catch (_) { /* del motor */ } } if (conv === mia) alEventoEquipo(it, ev, especiales); }
      })) || { ok: false, error: 'El equipo no contestó' };
      const inf = r.informe || {};
      Object.assign(it.equipo, { enCurso: false, ok: r.ok !== false, rondas: inf.rondas ?? it.equipo.rondas, problemas: Array.isArray(inf.problemas) ? inf.problemas.length : null,
        huecos: Array.isArray(inf.huecos) ? inf.huecos.length : 0, inventado: Array.isArray(inf.inventado) ? inf.inventado.length : 0,
        especiales: Array.isArray(inf.especiales) ? inf.especiales.map(s => ({ nombre: s.nombre, accion: s.accion })) : [],
        coste: r.gasto && typeof r.gasto.coste === 'number' ? r.gasto.coste : it.equipo.coste, faltan, error: r.ok === false ? String(r.error || '') : null });
      if (faltan.length && r && typeof r === 'object') r.faltan = faltan;
      return r;
    } catch (e) {
      Object.assign(it.equipo, { enCurso: false, ok: false, error: (e && e.message) || String(e) });
      return { ok: false, error: 'El equipo falló: ' + ((e && e.message) || e) };
    } finally {
      if (equipoVivo && equipoVivo.it === it) equipoVivo = null;
      tallerFin();
      repintarPronto(); pintarVerMascota();
    }
  }

  /* ---------- el taller: la ventana flotante con los duendes trabajando ---------- */
  const TALLER = { min: 320, max: 1100, defecto: 560 };
  let taller = null, tallerMarco = null, tallerListo = false, tallerCola = [], tallerActoresUlt = null;
  function actoresDe(eq, especiales) {
    const fijos = duendesDe(eq).filter(d => d.papel !== 'especial');
    const lista = fijos.concat((especiales || []).map(x => Object.assign({ papel: 'especial' }, x)));
    return lista.map(d => ({ id: d.id, nombre: d.nombre || PAPEL_TXT[d.papel] || 'Duende', papel: d.papel || 'especial', duende: aspecto(d), voz: vozDe(d), enojon: !!d.enojon }));
  }
  const sonidoActivo = () => !!pref.sonido && !document.hidden && !!panel && !panel.hidden && !pref.plegado;   // plegado a riel, tampoco
  function conDuendes(f, fn) {
    if (!f) return false;
    const ya = () => { let w = null; try { w = f.contentWindow; } catch (_) { return null; } return w && w.Duendes ? w.Duendes : null; };
    const D = ya();
    if (D) { try { fn(D); } catch (e) { console.error('Duendes:', e); } return true; }
    f.addEventListener('load', () => { const D2 = ya(); if (D2) { try { fn(D2); } catch (e) { console.error('Duendes:', e); } } }, { once: true });
    return true;
  }
  function tallerAbierto() { return !!(taller && !taller.hidden); }
  function colocarTaller() {
    if (!taller) return;
    const t = pref.taller || {}, vw = innerWidth, vh = innerHeight;
    const w = Math.max(TALLER.min, Math.min(TALLER.max, vw - 24, +t.w || TALLER.defecto));
    const h = Math.round(w * 9 / 16) + 34;
    const panelW = panel && !panel.hidden ? panel.getBoundingClientRect().width : 0;
    let x = t.x != null ? +t.x : vw - panelW - w - 16, y = t.y != null ? +t.y : 58;
    x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(8, Math.min(vh - h - 8, y));
    taller.style.width = w + 'px'; taller.style.left = x + 'px'; taller.style.top = y + 'px';
  }
  function crearTaller() {
    if (taller) return taller;
    taller = document.createElement('div');
    taller.className = 'as-taller'; taller.hidden = true; taller.tabIndex = -1;
    taller.setAttribute('role', 'dialog'); taller.setAttribute('aria-label', 'El taller de los duendes');
    taller.innerHTML = `<div class="as-taller-cab" data-as-taller-mover><span class="as-taller-tit">${SVG_DUENDE}<span>El taller de los duendes</span></span><span class="as-taller-est" data-as-taller-est></span>`
      + `<button type="button" class="icono" data-as-taller-cerrar title="Cerrar (Esc)" aria-label="Cerrar el taller">${ic('ic-close', 14)}</button></div>`
      + `<div class="as-taller-escena"></div><div class="as-taller-asa" data-as-taller-asa title="Arrastra para cambiar el tamaño · doble clic: el de partida"></div>`;
    document.body.appendChild(taller);
    tallerMarco = document.createElement('iframe');
    tallerMarco.className = 'as-taller-marco'; tallerMarco.title = 'Los duendes del equipo trabajando'; tallerMarco.tabIndex = -1;
    tallerMarco.setAttribute('scrolling', 'no');
    tallerMarco.addEventListener('load', () => {
      tallerListo = true;
      const cola = tallerCola.splice(0);
      conDuendes(tallerMarco, D => {
        if (D.taller) D.taller({ actores: tallerActoresUlt || actoresDe(equipoAhora(), dnVista()), sonido: sonidoActivo() });
        if (D.tallerEvento) cola.forEach(ev => { try { D.tallerEvento(ev); } catch (_) { /* ese no */ } });
        if (peleaVista && D.pelea) D.pelea(peleaVista);                // la pelea de la mesa, si la hay (§14)
        if (escena && D.escena) D.escena(escena);                       // y la escena del último error (§16)
        if (D.pausa) D.pausa(!tallerAbierto());                         // escondido, no se anima
      });
    });
    tallerMarco.src = 'duendes.html?embebido=1&taller=1&tema=' + temaMarco();
    taller.querySelector('.as-taller-escena').appendChild(tallerMarco);
    taller.addEventListener('click', e => { if (e.target.closest('[data-as-taller-cerrar]')) cerrarTaller(); });
    /* con el foco en el taller (no es modal), Esc lo cierra y las teclas sin Cmd/Ctrl no siguen hasta el tablero (Supr borraba el nodo
       elegido debajo); los atajos de la app, sí */
    taller.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarTaller(); return; }
      if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    });
    taller.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const asa = e.target.closest('[data-as-taller-asa]'), mover = !asa && e.target.closest('[data-as-taller-mover]') && !e.target.closest('button');
      if (!asa && !mover) return;
      e.preventDefault();
      try { taller.focus({ preventScroll: true }); } catch (_) { /* nada */ }
      const r0 = taller.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      document.body.classList.add('as-taller-moviendo');
      const mov = ev => {
        pref.taller = Object.assign({}, pref.taller);
        if (asa) pref.taller.w = Math.round(r0.width + (ev.clientX - x0));
        else { pref.taller.x = Math.round(r0.left + ev.clientX - x0); pref.taller.y = Math.round(r0.top + ev.clientY - y0); }
        if (asa) { pref.taller.x = Math.round(r0.left); pref.taller.y = Math.round(r0.top); }
        colocarTaller();
      };
      const fin = () => { document.removeEventListener('pointermove', mov); document.removeEventListener('pointerup', fin); document.removeEventListener('pointercancel', fin); document.body.classList.remove('as-taller-moviendo'); guardarPref(); };
      document.addEventListener('pointermove', mov); document.addEventListener('pointerup', fin); document.addEventListener('pointercancel', fin);
    });
    taller.addEventListener('dblclick', e => { if (e.target.closest('[data-as-taller-asa]')) { pref.taller = Object.assign({}, pref.taller, { w: TALLER.defecto }); colocarTaller(); guardarPref(); } });
    addEventListener('resize', () => { if (tallerAbierto()) colocarTaller(); });
    /* Esc sin nada con el foco (tras un clic en el tablero, por ejemplo) también la cierra; con el foco en un campo o un menú, es suyo */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.defaultPrevented || !tallerAbierto()) return;
      const a = document.activeElement;
      if (a && a !== document.body && !taller.contains(a)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault(); cerrarTaller();
    });
    return taller;
  }
  function abrirTaller(op) {
    crearTaller();
    taller.hidden = false;
    if (tallerListo) conDuendes(tallerMarco, D => { if (D.pausa) D.pausa(false); });
    colocarTaller();
    pref.taller = Object.assign({}, pref.taller, { abierto: true }); guardarPref();
    tallerActores();
    pintarTaller();
    if (!(op && op.sinFoco)) { try { taller.focus({ preventScroll: true }); } catch (_) { /* nada */ } }
    return true;
  }
  function cerrarTaller() {
    if (!taller || taller.hidden) return false;
    taller.hidden = true;
    if (tallerListo) conDuendes(tallerMarco, D => { if (D.callar) D.callar(); if (D.pausa) D.pausa(true); });
    pref.taller = Object.assign({}, pref.taller, { abierto: false }); guardarPref();
    if (campo && panel && !panel.hidden && document.activeElement === document.body) { try { campo.focus({ preventScroll: true }); } catch (_) { /* nada */ } }
    return true;
  }
  /* los actores: el equipo y los especiales de la conversación (o los del trabajo en marcha) */
  function tallerActores(actores) {
    if (actores) tallerActoresUlt = actores;
    else if (!equipoVivo || !tallerActoresUlt) tallerActoresUlt = actoresDe(equipoAhora(), conv && Array.isArray(conv.especiales) ? conv.especiales : dnVista());
    if (taller && tallerListo) conDuendes(tallerMarco, D => { if (D.taller) D.taller({ actores: tallerActoresUlt, sonido: sonidoActivo() }); });
  }
  function tallerEmpezar(eq, especiales) {
    tallerCola = [];
    tallerActores(actoresDe(eq, especiales));
    pintarTaller();
  }
  function tallerEvento(ev) {
    if (taller && tallerListo) conDuendes(tallerMarco, D => { if (D.tallerEvento) D.tallerEvento(ev); });
    else { tallerCola.push(ev); if (tallerCola.length > 30) tallerCola.shift(); }
    pintarTaller(ev);
  }
  function tallerFin() { if (!taller) tallerCola = []; pintarTaller(); }
  function pintarTaller(ev) {
    const s = taller && taller.querySelector('[data-as-taller-est]'); if (!s) return;
    const it = equipoVivo && equipoVivo.it, eqi = it && it.equipo;
    const u = ev || (eqi && eqi.eventos[eqi.eventos.length - 1]);
    s.textContent = eqi && eqi.enCurso ? (u ? corto((u.nombre || quienDe(u).nombre) + ': ' + (u.texto || ''), 90) : 'El equipo está trabajando…') : 'Esperando trabajo';
    s.classList.toggle('enojo', !!(eqi && eqi.enCurso && u && (u.accion === 'enojo' || u.accion === 'rechazar')));
  }

  /* ---------- el sonido ---------- */
  function pintarSonido() {
    const b = panel && panel.querySelector('[data-as-sonido]'); if (!b) return;
    const on = !!pref.sonido;
    b.innerHTML = on ? SVG_SONIDO : SVG_SONIDO_NO;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Sonido encendido: los duendes «hablan» al contestar (clic: apagarlo)' : 'Sonido apagado (clic: que los duendes «hablen» al contestar, como en el teatro)';
  }
  /* el sonido de los marcos, al día: con la ventana escondida o el panel cerrado, callan (lo que estaba sonando también) */
  function sonidoAlDia() {
    const on = sonidoActivo();
    if (taller && tallerListo) conDuendes(tallerMarco, D => { if (D.sonido) D.sonido(on); if (!on && D.callar) D.callar(); });
    if (duendeMarco) conDuendes(duendeMarco, D => { if (D.sonido) D.sonido(on); if (!on && D.callar) D.callar(); });
  }
  function ponerSonido(on) {
    pref.sonido = !!on; guardarPref(); pintarSonido();
    const s = sonidoActivo();
    if (taller && tallerListo) conDuendes(tallerMarco, D => { if (D.sonido) D.sonido(s); if (!s && D.callar) D.callar(); });
    if (duendeMarco) conDuendes(duendeMarco, D => { if (D.sonido) D.sonido(s); if (!s && D.callar) D.callar(); });
    avisar(on ? 'Sonido encendido: los duendes hablan al contestar' : 'Sonido apagado');
  }
  /* las primeras palabras de una respuesta, sin marcas (lo que «dice» el duende) */
  function primerasPalabras(md) {
    const t = String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`~=|]/g, ' ').replace(/\s+/g, ' ').trim();
    const frase = (/^.{12,}?[.!?…](?=\s|$)/.exec(t) || [t])[0];   // la primera frase (y no más de 24 palabras)
    return corto(frase.split(' ').slice(0, 24).join(' '), 150);
  }
  /* el maestro habla al terminar una respuesta (solo con el sonido encendido y el panel a la vista) */
  let hablados = 0;
  /* §12: el maestro **dice** siempre su respuesta en la mascota (globo y boca); suena solo con 🔊. Con el taller abierto y sonido, la
     voz va en el taller (el maestro de allí habla) y la mascota la dice sin sonido, para que no suene dos veces */
  function hablarMaestro(texto) {
    const t = primerasPalabras(texto); if (!t) return false;
    const m = maestroMasc(), suena = sonidoActivo(), enTaller = suena && tallerAbierto() && tallerListo;
    if (enTaller) { hablados++; conDuendes(tallerMarco, D => { if (D.hablar) D.hablar({ texto: t, voz: m.voz, quien: m.id }); }); }
    else if (suena) hablados++;
    return decirMascota({ quien: 'maestro', nombre: m.nombre, voz: m.voz, texto: t, sonido: suena && !enTaller });
  }

  /* ---------- el duende trabajando (1.1.67, Leo: «Quiero ver un duende genérico trabajando en el asistente de IA cuando las tareas
     están tardando en procesarse») ----------
     El motor del teatro en un marco pequeño (`duendes.html?embebido=1&retrato=1&trabajo=1`: un duende genérico que teclea, lee,
     escribe y revisa, sobre fondo transparente) entre la conversación y el campo, con lo que está haciendo. Sale cuando la respuesta
     lleva `ESPERA_DUENDE` sin nada nuevo que leer, o antes (`ESPERA_PASO`) si hay un paso en curso; se va cuando vuelve a llegar texto
     (tras `MINIMO_DUENDE` a la vista, para que no parpadee), cuando espera el permiso de Leo y al terminar o detener. **Un solo marco**,
     creado la primera vez y nunca quitado del documento (quitarlo lo recargaría): se esconde con `hidden`. Está fuera de `cuerpo`, así
     que pintar la conversación no lo toca. Sin sonido (`Duendes.detener`); con «reducir movimiento», sin marco: solo el rótulo. */
  const ESPERA_DUENDE = 1500, ESPERA_PASO = 600, MINIMO_DUENDE = 900;
  let duendeVisible = false, duendeDesde = 0, duendeVigia = null, ultimaNovedad = 0, duendeMarco = null;
  const menosMovimiento = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  const temaMarco = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  function vigilarDuende(on) {
    if (on) { ultimaNovedad = Date.now(); if (!duendeVigia) duendeVigia = setInterval(revisarDuende, 200); return; }
    if (duendeVigia) { clearInterval(duendeVigia); duendeVigia = null; }
    ponerDuende(false);
  }
  /* lo que está haciendo, o null si el duende no toca */
  function queHace() {
    if (!enCurso || !panel || panel.hidden) return null;
    if (items.some(i => i.tipo === 'permiso' && i.estado === 'pendiente')) return null;      // espera a Leo: no está trabajando
    /* el equipo trabajando (1.1.68): sale al momento y dice quién hace qué */
    if (iaActual && iaActual.vivo && iaActual.quien) return corto(iaActual.nombre + ' está hablando…', 80);   // la mesa
    const eqi = equipoVivo && equipoVivo.it && equipoVivo.it.equipo;
    if (eqi && eqi.enCurso) { const u = eqi.eventos[eqi.eventos.length - 1]; return u ? corto(u.nombre + ': ' + (u.texto || u.accion), 80) : 'El equipo se pone a trabajar…'; }
    const paso = [...items].reverse().find(i => i.tipo === 'paso' && i.estado === 'en-curso');
    if (Date.now() - ultimaNovedad < (paso ? ESPERA_PASO : ESPERA_DUENDE)) return null;
    return paso ? corto(conNombres(tituloPaso(paso)), 60) + '…' : 'Pensando…';
  }
  function revisarDuende() {
    if (!enCurso) { vigilarDuende(false); return; }
    const conPaso = !!(equipoVivo || items.some(i => i.tipo === 'paso' && i.estado === 'en-curso'));
    if (!items.some(i => i.tipo === 'permiso' && i.estado === 'pendiente')) ponerEstado(conPaso ? 'trabajando' : 'pensando');
    pintarVerMascota();
    const t = queHace();
    if (t) ponerDuende(true, t);
    else if (duendeVisible && (Date.now() - duendeDesde >= MINIMO_DUENDE || items.some(i => i.tipo === 'permiso' && i.estado === 'pendiente'))) ponerDuende(false);
  }
  function ponerDuende(on, texto) {
    const caja = panel && panel.querySelector('[data-as-trabajo]'); if (!caja) return;
    if (on) {
      if (!duendeVisible) { duendeDesde = Date.now(); marcoDuende(caja); }
      const r = caja.querySelector('[data-as-trabajo-txt]'); if (r.textContent !== texto) r.textContent = texto;
      const eqi = equipoVivo && equipoVivo.it && equipoVivo.it.equipo, u = eqi && eqi.enCurso ? eqi.eventos[eqi.eventos.length - 1] : null;
      r.classList.toggle('enojo', !!(u && (u.accion === 'enojo' || u.accion === 'rechazar')));
      caja.classList.toggle('equipo', !!(eqi && eqi.enCurso));
      caja.hidden = false;
    } else caja.hidden = true;
    if (duendeVisible !== !!on) { duendeVisible = !!on; repintarPronto(); }   // los tres puntos se van o vuelven
  }
  /* 1.1.68: el duende de la franja ya no es un marco propio: el duende maestro vive en la mascota (arriba del panel) y la franja se
     queda con el rótulo (y «Ver trabajar»). El tema de los marcos (la mascota y el taller) sigue al de la app con un
     `MutationObserver` sobre `data-theme` (`iniciar`): antes solo se ponía al día al salir la franja, y cambiar de tema con el panel
     abierto dejaba la mascota y el taller en el de antes. */
  function marcoDuende() { temaMarcos(); }
  function temaMarcos() {
    const t = temaMarco();
    [duendeMarco, tallerMarco].forEach(f => { if (f) conDuendes(f, D => { if (D.tema) D.tema(t); }); });
  }

  /* ---------- la mascota (1.1.68, §12: Leo, «Agrega al asistente de IA un recuadro en la parte superior para ver "hablar" a los
     duendes. Siempre se ve el duende y funciona como una especie de mascota. Mejora su "lipsync".») ----------
     Un recuadro de ~110 px bajo la cabecera con un solo marco (`duendes.html?embebido=1&mascota=1`), creado una vez y nunca quitado
     del documento (quitarlo lo recargaría): el duende maestro siempre a la vista, con vida propia. Sigue al asistente (`pensando` al
     mandar, `trabajando` con pasos en curso o el equipo, `contento` al terminar y luego `quieto`, `error` si falla); **al terminar una
     respuesta la dice** (`Duendes.decir`: globo y boca siempre; sonido solo con 🔊) y, con el equipo trabajando, cada evento con texto
     lo dice su duende, que entra al recuadro (el enojo, enojado; la cola es del motor). Un clic lo hace saludar. Con «reducir
     movimiento», el icono (y el marco escondido, solo para la voz). Plegado a riel, no se ve (como todo el panel). **Se monta la
     primera vez que se abre el panel** (`abrir`), no al arrancar: duendes.html pide sus fuentes a Google Fonts, y cada arranque de
     ClapCraft salía a la red aunque Leo no usara la IA (visto al portarlo a ClapBook). */
  let estadoMasc = null, tQuieto = null;
  function montarMascota() {
    const caja = panel && panel.querySelector('[data-as-mascota]'); if (!caja || duendeMarco) return;
    const sitio = caja.querySelector('[data-as-mascota-sitio]'), quieta = menosMovimiento();
    const f = document.createElement('iframe');
    f.className = 'as-mascota-marco'; f.title = 'El duende maestro'; f.tabIndex = -1;
    f.setAttribute('aria-hidden', 'true'); f.setAttribute('scrolling', 'no');
    if (quieta) { f.style.display = 'none'; sitio.innerHTML = ic('ic-asistente', 26); caja.classList.add('quieta'); }
    f.addEventListener('load', () => prepararMascota(f));
    f.src = 'duendes.html?embebido=1&mascota=1&tema=' + temaMarco();
    sitio.appendChild(f); duendeMarco = f;
    caja.addEventListener('click', e => { if (!e.target.closest('button')) saludarMascota(); });
  }
  const maestroMasc = () => { const m = maestro(); return { id: m ? m.id : 'maestro', nombre: m ? m.nombre : 'El duende maestro', duende: m ? aspecto(m) : null, voz: vozDe(m) || 'normal' }; };
  function prepararMascota(f) {
    conDuendes(f, D => {
      if (D.mascota) D.mascota({ maestro: maestroMasc(), sonido: sonidoActivo() });
      else if (D.retrato) { const m = maestroMasc(); D.retrato({ duende: m.duende, nombre: m.nombre, fondo: 'transparente' }); }   // un motor sin mascota: su retrato
      const e = estadoMasc; estadoMasc = null; ponerEstado(e || 'quieto');
      if (peleaVista && D.pelea) D.pelea(peleaVista);                  // la pelea de la mesa, si la hay (§14)
    });
    pausarMascota();
  }
  /* ---------- la pelea de la mesa (1.1.68, §14: Leo, «si la discusión es muy fuerte, exista una animación de pelea entre los
     duendes; se dejan de pelear hasta mi próxima respuesta») ----------
     El motor dice cuándo empieza (`alPelea({ entre, nivel, ronda })`, otra vez si se suma alguien) y cuándo acaba (`alPelea(null)`, al
     siguiente mensaje de Leo). Aquí: `Duendes.pelea` en la mascota y en el taller (también al cargar cualquiera de los dos o al
     recargar la conversación, con `conv.pelea`), y una línea en el chat cuando empieza («💥 «A» y «B» se pelean»). */
  let peleaVista = null;             // lo que se le pasa al motor del teatro: { entre: [{ id, nombre, duende, voz }], nivel } o null
  function alPelea(x, op) {
    op = op || {};
    const lista = x && Array.isArray(x.entre) ? x.entre.map(e => (typeof e === 'string' ? { id: e } : e)).filter(e => e && e.id) : [];
    if (!lista.length) {
      const habia = !!peleaVista; peleaVista = null;
      if (habia) [duendeMarco, tallerMarco].forEach(f => { if (f) conDuendes(f, D => { if (D.pelea) D.pelea(null); }); });
      return;
    }
    const antes = peleaVista ? peleaVista.entre.map(e => e.id).join('|') : '';
    const entre = lista.map(e => {
      const q = turnoDe(e.id, { nombre: e.nombre, papel: e.papel });
      const d = mesaCfg.participantes.find(p => p.id === e.id) || duendesDe(equipoAhora()).find(y => y.id === e.id) || null;
      return { id: e.id, nombre: q.nombre, papel: q.papel, duende: e.id === 'maestro' ? maestroMasc().duende : q.papel === 'personaje' ? (d && d.duende) || null : d ? aspecto(Object.assign({ papel: q.papel }, d)) : null, voz: e.id === 'maestro' ? maestroMasc().voz : d ? vozDe(d) : null };
    });
    peleaVista = { entre, nivel: [1, 2, 3].includes(+x.nivel) ? +x.nivel : 1 };
    [duendeMarco, tallerMarco].forEach(f => { if (f) conDuendes(f, D => { if (D.pelea) D.pelea(peleaVista); }); });
    const ahora = entre.map(e => e.id).join('|');
    if (!op.sinLinea && ahora !== antes) {
      const n = entre.map(e => '«' + e.nombre + '»');
      items.push({ tipo: 'pelea', texto: (n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0]) + ' se pelean', nivel: peleaVista.nivel });
      repintarPronto();
    }
  }
  /* el aspecto (y la voz) del maestro, al día */
  function vestirMaestro() {
    if (!duendeMarco) return;
    conDuendes(duendeMarco, D => { if (D.mascota) D.mascota({ maestro: maestroMasc(), sonido: sonidoActivo() }); else if (D.retrato) { const m = maestroMasc(); D.retrato({ duende: m.duende, nombre: m.nombre, fondo: 'transparente' }); } });
  }
  /* ---------- las escenas de los estados (1.1.68, §16: Leo, «Si ya no hubiera saldo de tokens, que se vea una animación de duendes en
     huelga, y otras animaciones divertidas») ----------
     Según el error de la última respuesta, la mascota (y el taller) pasa a una escena que se queda hasta la siguiente respuesta buena:
     huelga (sin saldo), tope (el de la conversación o el del día), sin-clave, sin-red, saturado (429) o error. Mientras trabaja, se ve
     trabajar; al acabar vuelve la escena si sigue la causa. La huelga sale también sola con el saldo de APIMart por debajo de 0,01 USD
     y se levanta al volver el saldo; con ella, la mascota lleva «Recargar saldo». */
  let escena = null, huelgaSaldo = false;
  function escenaDeError(motivo, codigo) {
    if (motivo === 'tope') return 'tope';
    if (motivo === 'detenido' || motivo === 'ocupada' || motivo === 'clave' || motivo === 'vacio') return null;
    const c = String(codigo == null ? '' : codigo), h = /^\d{3}$/.test(c) ? +c : null;
    if (c === 'saldo' || h === 402) return 'huelga';
    if (c === 'topeDiario' || c === 'tope') return 'tope';          // (el tope de gasto a mitad de la mesa llega con su código)
    if (c === 'clave' || c === 'sinClave' || c === 'claveIlegible' || h === 401) return 'sin-clave';
    if (c === 'red' || c === 'tiempo') return 'sin-red';
    if (c === 'limite' || h === 429) return 'saturado';
    return motivo === 'error' ? 'error' : null;
  }
  function ponerEscena(e) {
    e = e || null;
    const cambio = e !== escena; escena = e;
    const c = panel && panel.querySelector('[data-as-mascota]');
    if (c) { c.dataset.escena = e || ''; const b = c.querySelector('.as-mascota-recargar'); if (b) b.hidden = e !== 'huelga'; }
    if (!cambio) return;
    if (!enCurso) { const x = estadoMasc; estadoMasc = null; ponerEstado(e || (x && !ESCENAS.includes(x) ? x : 'quieto')); }
    if (taller && tallerListo) conDuendes(tallerMarco, D => { if (D.escena) D.escena(e); });
  }
  const ESCENAS = ['huelga', 'tope', 'sin-clave', 'sin-red', 'saturado', 'error'];
  function ponerEstado(e) {
    if (!e) return;
    if (!enCurso && escena && !ESCENAS.includes(e)) e = escena;   // sin trabajar, la escena manda (hasta la siguiente respuesta buena)
    if (e === estadoMasc) return;
    estadoMasc = e;
    clearTimeout(tQuieto);
    if (panel) { const c = panel.querySelector('[data-as-mascota]'); if (c) c.dataset.estado = e; }
    /* en una escena (§16), los del equipo que entran con el maestro llevan su aspecto (los fijos, en su orden: lector, escritora, coordinador) */
    const conQuien = ESCENAS.includes(e) ? { actores: actoresDe(equipoAhora(), []).filter(x => x.papel !== 'maestro').sort((x, y) => (e === 'tope' ? (y.papel === 'coordinador') - (x.papel === 'coordinador') : 0)) } : undefined;
    if (duendeMarco) conDuendes(duendeMarco, D => { if (D.mascotaEstado) D.mascotaEstado(e, conQuien); });
    /* lo de un momento vuelve a quieto solo */
    if (e === 'contento' && !enCurso) tQuieto = setTimeout(() => { if (!enCurso) ponerEstado('quieto'); }, 6000);
  }
  /* decir algo en la mascota: `op` = { quien, nombre, duende, voz, texto, emo, sonido } (sin `D.decir`, con sonido, `hablar`) */
  let dichos = 0;
  function decirMascota(op) {
    if (!duendeMarco || !panel || panel.hidden || pref.plegado || !op || !String(op.texto || '').trim()) return false;
    dichos++;
    return conDuendes(duendeMarco, D => {
      if (D.decir) { try { const r = D.decir(op); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { console.error('Duendes.decir:', e); } }
      else if (op.sonido && D.hablar) D.hablar({ texto: op.texto, voz: op.voz, emo: op.emo });
    });
  }
  /* la mascota no se anima mientras no se ve (el panel cerrado o plegado, la ventana escondida): Chromium sigue dando fotogramas a un
     marco con `display: none` y pintaba a 60 por segundo sin que nadie la viera */
  function pausarMascota() {
    const quieta = document.hidden || !panel || panel.hidden || !!pref.plegado;
    if (duendeMarco) conDuendes(duendeMarco, D => { if (D.pausa) D.pausa(quieta); });
  }
  function pintarVerMascota() {
    const b = panel && panel.querySelector('.as-mascota-ver'); if (!b) return;
    const on = !!(enCurso && equipoVivo);
    if (b.hidden === on) b.hidden = !on;
  }
  function saludarMascota() {
    const m = maestroMasc();
    ponerEstado(enCurso ? estadoMasc : 'contento');
    decirMascota({ quien: 'maestro', nombre: m.nombre, voz: m.voz, texto: enCurso ? 'Sigo en ello…' : '¡Hola! Soy ' + m.nombre.replace(/^El /, 'el ') + '.', emo: 'saluda', sonido: sonidoActivo() });
  }
  /* un evento del equipo con texto: lo dice su duende en la mascota (con el taller abierto y sonido, ya suena allí) */
  function eventoMascota(ev, especiales) {
    if (!ev || !ev.texto) return;
    const x = (especiales || []).find(s => s.id === ev.quien) || duendesDe(equipoAhora()).find(d => d.id === ev.quien) || null;
    const esMaestro = !ev.quien || ev.quien === 'maestro' || ev.papel === 'maestro';
    decirMascota({ quien: esMaestro ? 'maestro' : ev.quien, nombre: ev.nombre || (x && x.nombre) || '', duende: x ? aspecto(Object.assign({ papel: ev.papel || 'especial' }, x)) : null,
      voz: x ? vozDe(x) : null, texto: ev.texto, emo: ev.accion === 'enojo' || ev.accion === 'rechazar' ? 'enojado' : ev.accion === 'aprobar' ? 'feliz' : undefined,
      sonido: sonidoActivo() && !tallerAbierto() });
  }

  /* ---------- pintar ---------- */
  function repintarPronto() {
    if (pintarPend) return;
    pintarPend = setTimeout(() => { pintarPend = null; pintarTodo(); abajo(); }, 40);   // setTimeout y no rAF: la ventana puede estar escondida
  }
  function pintarTodo() {
    if (!panel) return;
    pintarCabecera(); pintarBotones(); pintarFx(); pintarModos(); pintarDn();
    if (!hayTransporte()) { cuerpo.innerHTML = bienvenidaHtml('navegador'); return; }
    if (cfg && !hayClave() && !items.length) { cuerpo.innerHTML = bienvenidaHtml('sin-clave'); return; }
    if (!items.length) { cuerpo.innerHTML = bienvenidaHtml('vacio'); return; }
    const sinClave = cfg && !hayClave() ? `<div class="as-nota-sis as-falta-clave">${ic('ic-llave', 14)}<span>Falta la clave de APIMart para seguir.</span><button type="button" class="as-enlace-btn" data-as-tutorial="pegar">Configurar paso a paso</button></div>` : '';
    /* los tres puntos, solo hasta que sale el duende trabajando (que los sustituye) */
    const puntos = enCurso && !duendeVisible && !(iaActual && (String(iaActual.texto || '').trim() || iaActual.razon)) && !items.some(x => x.tipo === 'paso' && x.estado === 'en-curso') ? '<div class="as-pensando" aria-label="Pensando"><i></i><i></i><i></i></div>' : '';
    pintarItems([sinClave, puntos]);
  }
  /* **Pintar sin rehacer** (1.1.67, Leo: «el razonamiento se ve pero no puedo hacer scroll hacia abajo para verlo, se queda bloqueado
     hasta que termina»). Hasta la 1.1.66 cada trozo (cada 40 ms) rehacía `cuerpo.innerHTML` entero: el `<details>` del razonamiento
     y su caja con desplazamiento nacían otra vez —arriba del todo, y abierto o cerrado según la regla, no según Leo—, y el gesto de
     la rueda o del trackpad se quedaba enganchado a una caja que ya no existía. Ahora cada elemento de la conversación es el mismo
     nodo mientras no cambie (`nodosItems`: el objeto del item → { html, el }); el que cambia se sustituye solo a él, y el mensaje que
     está llegando (`as-ia`) se pone al día en su sitio (`parchearIa`): el razonamiento conserva su caja, su desplazamiento (si Leo
     está al final lo sigue; si subió, se queda donde lo dejó) y si Leo lo abrió o lo cerró. */
  let nodosItems = new WeakMap();
  const nodosSueltos = new Map();                         // los de detrás (falta la clave, los tres puntos), por su html
  function nodoDe(html) { const t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  /* deja en `padre` exactamente `lista`, en ese orden, sin mover lo que ya está en su sitio (moverlo le quitaría su desplazamiento) */
  function ordenar(padre, lista) {
    const quedan = new Set(lista);
    [...padre.childNodes].forEach(n => { if (!quedan.has(n)) n.remove(); });
    let ref = padre.firstChild;
    lista.forEach(el => { if (el === ref) ref = el.nextSibling; else padre.insertBefore(el, ref); });
  }
  function pintarItems(detras) {
    const lista = [];
    items.forEach((it, i) => {
      const h = itemHtml(it, i); if (!h) return;
      const c = nodosItems.get(it);
      if (c && c.el.parentNode === cuerpo) {
        if (c.html === h) { lista.push(c.el); return; }
        if (it.tipo === 'ia' && parchearIa(c.el, h, it)) { c.html = h; lista.push(c.el); return; }
      }
      const el = nodoDe(h); if (!el) return;
      nodosItems.set(it, { html: h, el }); lista.push(el);
    });
    (detras || []).forEach(h => {
      if (!h) return;
      let el = nodosSueltos.get(h);
      if (!el) { el = nodoDe(h); if (!el) return; nodosSueltos.set(h, el); }
      lista.push(el);
    });
    ordenar(cuerpo, lista);
  }
  /* el mensaje que llega, en su sitio: sus atributos, su razonamiento (`parchearRazon`), su texto y su botón de copiar */
  function parchearIa(el, html, it) {
    const n = nodoDe(html);
    if (!n || n.tagName !== el.tagName) return false;
    [...el.attributes].forEach(a => { if (!n.hasAttribute(a.name)) el.removeAttribute(a.name); });
    [...n.attributes].forEach(a => { if (el.getAttribute(a.name) !== a.value) el.setAttribute(a.name, a.value); });
    const clave = x => x.tagName + '.' + (x.classList[0] || '');
    const viejos = new Map([...el.children].map(x => [clave(x), x]));
    const lista = [...n.children].map(x => {
      const v = viejos.get(clave(x));
      if (!v) return x;
      if (v.tagName === 'DETAILS') { parchearRazon(v, x, it); return v; }
      if (v.outerHTML === x.outerHTML) return v;
      if (v.classList.contains('as-md')) { v.innerHTML = x.innerHTML; return v; }
      return x;
    });
    ordenar(el, lista);
    return true;
  }
  const alFinal = (x, margen) => x.scrollHeight - x.scrollTop - x.clientHeight <= (margen || 6);
  function parchearRazon(v, x, it) {
    const dv = v.querySelector(':scope > div'), dx = x.querySelector(':scope > div');
    /* ¿sigue al final? `_sigue` lo cambia solo Leo (`alDesplazarCaja`, `alRuedaCuerpo`); sin tocarlo, sí */
    const seguia = !dv || dv._sigue !== false;
    if (dv && dx && dv.innerHTML !== dx.innerHTML) {
      dv.innerHTML = dx.innerHTML;                        // la caja es la misma: su desplazamiento se queda
      if (seguia) { dv.scrollTop = dv.scrollHeight; dv._auto = dv.scrollTop; }
    }
    if (v.open !== x.open) {
      /* la regla cierra el razonamiento cuando empieza la respuesta; si Leo lo estaba leyendo (subió en él), se queda abierto */
      if (!x.open && it.razonAbierto === undefined && v.open && !seguia) it.razonAbierto = true;
      else v.open = x.open;
    }
  }
  function pintarCabecera() {
    if (!panel) return;
    const m = modeloActual();
    /* «deepseek-» va aparte: en la cabecera estrecha se esconde (css/asistente.css) y queda «v4-flash» */
    panel.querySelectorAll('.as-modelo').forEach(b => {
      const t = hayTransporte() ? m : 'App de escritorio', pre = /^deepseek-/i.test(t) ? t.slice(0, 9) : '';
      const html = pre ? `<span class="as-modelo-pre">${esc(pre)}</span>${esc(t.slice(9))}` : esc(t);
      if (b.innerHTML !== html) b.innerHTML = html;
      b.title = 'Cambiar el modelo (' + t + ')';
    });
    const c = panel.querySelector('[data-as-coste]');
    const tope = cfg && cfg.tope != null ? cfg.tope : TOPE_DEFECTO;
    const desconocido = !!(cfg && cfg.precioModelo && cfg.precioModelo.desconocido);
    c.textContent = (coste.estimadas ? '≈ ' : '') + usd(coste.usd) + (desconocido ? ' · precio desconocido' : '');
    c.hidden = !hayTransporte();
    c.classList.toggle('cerca', coste.usd >= tope * 0.8 || desconocido);
    c.title = 'Lo que lleva gastado esta conversación (aprox.): ' + miles(coste.entrada) + ' tokens de entrada y ' + miles(coste.salida) + ' de salida. Tope: ' + usd(tope) + '.'
      + (coste.estimadas ? ' Algunas respuestas no dijeron lo que gastaron: van estimadas.' : '')
      + (desconocido ? ' No se sabe el precio de este modelo: se cuenta con uno alto, por prudencia.' : '')
      + (cfg && cfg.topeDiario ? ' Hoy: ' + usd(cfg.gastoHoy || 0) + ' de ' + usd(cfg.topeDiario) + ' (tope diario).' : '');
    const punto = panel.querySelector('[data-as-riel-punto]'); if (punto) punto.hidden = !enCurso;
    /* el duende maestro (1.1.68): su nombre (Leo puede cambiárselo) */
    const mae = panel.querySelector('[data-as-maestro]'); if (mae) { const n = nombreMaestro(); if (mae.textContent !== n) mae.textContent = n; }
    pintarSonido();
    pintarSaldo();
  }
  /* ---------- el saldo de APIMart (1.1.60, Leo: «que se puedan poner en el asistente de IA mis créditos restantes en APIMart») ----------
     `editorAPI.ia.saldo()` → { ok, saldo, usado, moneda, creditos, limiteClave? } (el proceso lo guarda 60 s). En la cabecera, junto
     al gasto de la conversación; se pide al abrir el panel, al acabar cada respuesta y con un clic. Por debajo de 1 USD, en ámbar; de
     0,20, en rojo. Si falla, o el proveedor no es APIMart, no se enseña (sin errores). */
  let saldoIA = null, pidiendoSaldo = null;
  const conSaldo = () => !!(g.transporte && typeof g.transporte.saldo === 'function' && hayTransporte() && hayClave() && !(cfg && cfg.proveedor === 'otro'));
  const numUsd = n => (Math.round(+n * 100) / 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function textoSaldo(x) { return x && x.ok && Number.isFinite(+x.saldo) ? 'Saldo ' + numUsd(x.saldo) + ' ' + (x.moneda || 'USD') : ''; }
  function tituloSaldo(x) {
    if (!x || !x.ok) return '';
    const l = x.limiteClave;
    return 'Créditos restantes en APIMart' + (Number.isFinite(+x.usado) ? ' · usados ' + numUsd(x.usado) + ' ' + (x.moneda || 'USD') : '')
      + (l ? (l.ilimitada ? ' · la clave no tiene límite propio' : Number.isFinite(+l.restante) ? ' · a esta clave le quedan ' + numUsd(l.restante) + ' ' + (x.moneda || 'USD') : '') : '') + ' · clic: volver a mirarlo';
  }
  async function refrescarSaldo(forzar) {
    if (!conSaldo()) { saldoIA = null; pintarSaldo(); return null; }
    if (pidiendoSaldo) return pidiendoSaldo;
    pidiendoSaldo = (async () => {
      let r = null;
      try { r = await g.transporte.saldo(forzar ? { forzar: true } : undefined); } catch (_) { r = null; }
      saldoIA = r && r.ok && Number.isFinite(+r.saldo) ? r : null;
      /* §16: sin saldo, huelga (aunque aún no haya fallado nada); con saldo otra vez, se levanta */
      if (saldoIA) {
        const sin = +saldoIA.saldo < 0.01;
        if (sin && !huelgaSaldo) { huelgaSaldo = true; ponerEscena('huelga'); }
        else if (!sin && huelgaSaldo) { huelgaSaldo = false; if (escena === 'huelga') ponerEscena(null); }
      }
      pidiendoSaldo = null; pintarSaldo();
      return saldoIA;
    })();
    return pidiendoSaldo;
  }
  function pintarSaldo() {
    const b = panel && panel.querySelector('[data-as-saldo]'); if (!b) return;
    const ok = !!(saldoIA && conSaldo());
    b.hidden = !ok; if (!ok) return;
    /* en el chip, solo la cifra («$9,91»); «Saldo 9,91 USD», en el globo y para el lector de pantalla (1.1.61: con «Saldo … USD» el
       chip no encogía y el nombre del modelo se cortaba en «deepseek…») */
    const mon = saldoIA.moneda || 'USD';
    b.textContent = mon === 'USD' ? '$' + numUsd(saldoIA.saldo) : numUsd(saldoIA.saldo) + ' ' + mon;
    b.title = textoSaldo(saldoIA) + ' · ' + tituloSaldo(saldoIA);
    b.setAttribute('aria-label', textoSaldo(saldoIA));
    b.classList.toggle('bajo', +saldoIA.saldo < 1 && +saldoIA.saldo >= 0.2);
    b.classList.toggle('critico', +saldoIA.saldo < 0.2);
  }
  function pintarBotones() {
    if (!panel) return;
    const listo = hayTransporte() && hayClave();
    const mb = panel.querySelector('[data-as-mandar]'), db = panel.querySelector('[data-as-detener]');
    mb.hidden = enCurso; db.hidden = !enCurso;
    mb.disabled = !listo || (!campo.value.trim() && !campo.querySelector('.as-chip-img'));
    pintarVacio();
    campo.disabled = !listo;
    campo.placeholder = !hayTransporte() ? 'Disponible en la app de escritorio' : !listo ? 'Configura el asistente para empezar' : enCurso ? 'Trabajando… (puedes ir escribiendo lo siguiente)' : 'Pídele algo sobre tu proyecto…';
    if (enCurso) campo.disabled = false;
    panel.classList.toggle('trabajando', enCurso);
    const punto = panel.querySelector('[data-as-riel-punto]'); if (punto) punto.hidden = !enCurso;
  }
  function bienvenidaHtml(caso) {
    if (caso === 'navegador') return `<div class="as-bienvenida">
        <span class="as-bv-ic">${ic('ic-asistente', 26)}</span>
        <h3>El asistente vive en la app de escritorio</h3>
        <p>Aquí, en el navegador, ClapCraft no puede guardar la clave de forma segura ni hablar con la IA. Abre ClapCraft en tu Mac para usarlo.</p>
        <button type="button" class="as-bv-sec" data-as-tutorial="0">${ic('ic-nota', 14)}Ver cómo se configura</button>
      </div>`;
    if (caso === 'sin-clave') return `<div class="as-bienvenida">
        <span class="as-bv-ic">${ic('ic-asistente', 26)}</span>
        <h3>Tu asistente de guion con DeepSeek</h3>
        <p>Trabaja como Claude en Cowork, pero aquí dentro: lee tus esquemas, bibliotecas y guiones, y los cambia cuando se lo pides. Cada cambio se puede deshacer.</p>
        <p class="as-bv-nota">Para usarlo necesitas una cuenta en APIMart con un poco de saldo (unos pocos dólares te duran mucho). Te guiamos paso a paso: son unos 5 minutos.</p>
        <button type="button" class="btn primario as-bv-prim" data-as-tutorial="0">Configurar paso a paso</button>
        <button type="button" class="as-bv-sec" data-as-ajustes>${ic('ic-llave', 14)}Ya tengo una clave</button>
      </div>`;
    const sug = ['¿Qué tramas tiene el esquema que tengo abierto y cuál está más floja?', 'Resume en cinco líneas lo que pasa en el primer acto.', 'Propón tres nodos para cerrar la trama secundaria, como notas.'];
    return `<div class="as-bienvenida as-bv-vacio">
        <span class="as-bv-ic">${ic('ic-asistente', 26)}</span>
        <h3>¿En qué te ayudo?</h3>
        <p class="as-bv-nota">Soy ${esc(nombreMaestro())}: te contesto yo y, para escribir guion o notas largas, pongo a trabajar a mi equipo de duendes.</p>
        <p>Veo lo que tienes abierto en ClapCraft. Pega un enlace (${atajo('C', true)} copia el de lo que tienes delante) para decirme exactamente de qué hablas.</p>
        <div class="as-sugerencias">${sug.map(s => `<button type="button" class="as-sug" data-as-sugerencia="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>`;
  }
  function itemHtml(it, i) {
    const d = ` data-as-item="${i}"`;
    if (it.tipo === 'yo') return `<div class="as-msg as-yo"${d}><div class="as-burbuja">${Array.isArray(it.imagenes) && it.imagenes.length ? `<span class="as-yo-imgs">${it.imagenes.map(x => x.src && /^data:image\//.test(x.src) ? `<img src="${esc(x.src)}" alt="${esc(x.nombre || 'Imagen')}" title="${esc(x.nombre || 'Imagen')}">` : `<span class="as-yo-img-x">${ic('ic-imagen', 14)}</span>`).join('')}</span>` : ''}${textoYo(it.texto)}</div></div>`;
    if (it.tipo === 'ia') {
      const razon = it.razon && it.razon.trim() ? `<details class="as-razon"${(it.razonAbierto !== undefined ? it.razonAbierto : it.vivo && !String(it.texto || '').trim()) ? ' open' : ''}><summary>Razonamiento</summary><div>${esc(it.razon.trim()).replace(/\n/g, '<br>')}</div></details>` : '';
      const hay = String(it.texto || '').trim();
      const copiar = hay && !it.vivo && g.copiarTexto ? `<button type="button" class="as-copiar" data-as-copiar title="Copiar la respuesta" aria-label="Copiar la respuesta">${ic('ic-docs', 13)}</button>` : '';
      /* en la mesa (1.1.68, §13): su nombre y el chip de su color; mientras piensa, su burbuja ya está (con los tres puntos) */
      const quien = it.quien ? `<div class="as-mesa-quien"><span class="as-eq-chip" style="--dc:${esc(it.color || COLOR_PAPEL.especial)}">${esc(corto(it.nombre || 'Duende', 32))}</span>${it.revisa ? `<span class="as-mesa-rol as-mesa-revisa${it.problemas > 0 ? ' con-problemas' : ''}" title="${esc(it.problemas > 0 ? plural(it.problemas, 'cosa que no se sostiene', 'cosas que no se sostienen') : 'Revisa lo que se dijo contra el proyecto')}">revisa${it.problemas > 0 ? ' · ' + esc(it.problemas) : ''}</span>` : ''}${it.resumen ? '<span class="as-mesa-rol">resume</span>' : it.ronda > 1 ? `<span class="as-mesa-rol">ronda ${esc(it.ronda)}</span>` : ''}</div>` : '';
      const espera = it.quien && it.vivo && !hay && !razon ? '<div class="as-pensando" aria-label="Pensando"><i></i><i></i><i></i></div>' : '';
      /* una burbuja de la mesa que se quedó vacía (el duende leyó antes de hablar: lo suyo va en la siguiente) no se pinta (en vivo) */
      return hay || razon || (quien && it.vivo) ? `<div class="as-msg as-ia${it.vivo ? ' vivo' : ''}${it.quien ? ' as-mesa' : ''}${it.revisa ? ' revisa' + (it.problemas > 0 ? ' con-problemas' : '') : ''}"${d}${it.quien ? ` style="--dc:${esc(it.color || COLOR_PAPEL.especial)}"` : ''}>${quien}${razon}${espera}${hay ? `<div class="as-md">${chipsDeIds(mdHtml(it.texto.trim()))}</div>` : ''}${copiar}</div>` : '';
    }
    if (it.tipo === 'paso') return pasoHtml(it, i);
    if (it.tipo === 'pelea') return `<div class="as-pelea nivel-${esc(it.nivel || 1)}"${d} role="note"><span aria-hidden="true">💥</span><span>${esc(it.texto)}</span></div>`;
    if (it.tipo === 'aviso') return `<div class="as-nota-sis"${d}>${ic('ic-aviso', 14)}<span>${esc(it.texto)}</span>${it.accion === 'ajustes' ? '<button type="button" class="as-enlace-btn" data-as-ajustes>Configurar</button>' : it.accion === 'nueva' ? '<button type="button" class="as-enlace-btn" data-as-nueva>Nueva conversación</button>' : ''}</div>`;
    if (it.tipo === 'permiso') {
      const hecho = it.estado !== 'pendiente';
      const est = { si: 'Permitido', siempre: 'Permitido en esta conversación', no: 'No permitido', 'sin-respuesta': 'Sin respuesta: no se hizo' }[it.estado] || '';
      return `<div class="as-permiso${hecho ? ' hecho' : ''}"${d} role="group" aria-label="Permiso">
        <div class="as-permiso-tit">${ic('ic-aviso', 15)}<span>${hecho ? 'Pidió permiso' : '¿Le dejas hacer esto?'}</span></div>
        ${it.titulo ? `<p>${esc(conNombres(it.titulo))}</p>` : ''}${it.motivos && it.motivos.length ? `<ul>${it.motivos.map(m => `<li>${esc(conNombres(m))}</li>`).join('')}</ul>` : ''}
        ${hecho ? `<span class="as-paso-est${it.estado === 'no' || it.estado === 'sin-respuesta' ? ' error' : ' ok'}">${esc(est)}</span>`
          : `<div class="as-permiso-acc"><button type="button" class="btn primario" data-as-permiso="si">Permitir</button><button type="button" class="btn" data-as-permiso="siempre">Permitir en esta conversación</button><button type="button" class="btn" data-as-permiso="no">No</button></div>`}
      </div>`;
    }
    if (it.tipo === 'error') {
      const a = ayudaDe(it.codigo), h = httpDe(it.codigo);
      return `<div class="as-error"${d}>
        <div class="as-error-tit">${ic('ic-aviso', 15)}<b>${esc(a ? a.tit : 'No se pudo completar')}</b>${h ? `<span class="as-error-cod">error ${h}</span>` : ''}</div>
        <p>${esc(a ? a.txt : it.texto)}</p>
        ${a && it.texto && it.texto !== a.txt ? `<p class="as-error-det">${esc(corto(it.texto, 240))}</p>` : ''}
        <div class="as-error-acc">
          <button type="button" class="as-enlace-btn" data-as-reintentar>Reintentar</button>
          ${a === AYUDA_ERROR.saldo ? '<button type="button" class="as-enlace-btn" data-as-web="panel">Abrir APIMart</button>' : ''}
          <button type="button" class="as-enlace-btn" data-as-ajustes>Configuración</button>
          <button type="button" class="as-enlace-btn" data-as-tutorial="fallos">Qué hacer si falla</button>
        </div></div>`;
    }
    return '';
  }
  /* el nombre de lo tocado: el título que dé el motor o el primer «…» del resultado; en «buscar», lo buscado */
  function tituloPaso(it) {
    if (it.titulo) {
      /* el motor pone el argumento entre «»: si es un id (sin espacios, con cifras) y el resultado dice su nombre, va el nombre */
      const m = /«([^»\s]{2,40})»/.exec(it.titulo), nom = it.texto ? /«([^»]{1,80})»/.exec(it.texto) : null;
      if (m && /\d/.test(m[1]) && nom && nom[1] !== m[1]) return it.titulo.replace(m[0], '«' + corto(nom[1], 48) + '»');
      return it.titulo;
    }
    const v = VERBOS[it.nombre], hecho = it.estado !== 'en-curso';
    let t = v ? v[hecho ? 1 : 0] : (hecho ? 'Usó ' : 'Usando ') + String(it.nombre || 'una herramienta').replace(/_/g, ' ');
    const a = it.args || {};
    if (it.nombre === 'buscar' && a.texto) return t + ' «' + corto(a.texto, 40) + '»';
    const m = hecho && it.texto ? /«([^»]{1,80})»/.exec(it.texto) : null;
    if (m && it.nombre !== 'ver_proyecto' && it.nombre !== 'listar_proyectos' && it.nombre !== 'ver_historial') t += ' «' + corto(m[1], 48) + '»';
    const ops = Array.isArray(a.operaciones) ? a.operaciones.length : 0;
    if (ops && ESCRIBEN.has(it.nombre)) t += ' (' + ops + (ops === 1 ? ' cambio' : ' cambios') + ')';
    return t;
  }
  /* el paso del equipo (1.1.68): «El equipo trabajó (2 rondas · 3 correcciones)» y, desplegado, una línea por evento con el chip
     del duende (el color de su ropa); el enojo, en rojo. Mientras trabaja, «Ver trabajar» */
  const ACCION_TXT = { empezar: 'encarga', leer: 'lee', escribir: 'escribe', revisar: 'revisa', enojo: 'se enoja', aprobar: 'aprueba', rechazar: 'rechaza',
    corregir: 'corrige', entregar: 'entrega', hablar: 'dice', error: 'falla', fin: 'recibe' };
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  function pasoEquipoHtml(it, i) {
    const q = it.equipo || { eventos: [] }, curso = it.estado === 'en-curso' && q.enCurso !== false;
    /* los eventos que vienen del motor (una conversación guardada) no traen su color: el del duende */
    q.eventos = (q.eventos || []).map(e => (e.color && e.nombre ? e : Object.assign({}, e, quienDe(e))));
    const rondas = +q.rondas || 0, corr = q.problemas != null ? q.problemas : (+q.correcciones || 0);
    const cab = curso ? 'El equipo está trabajando…'
      : it.estado === 'error' || q.ok === false ? 'El equipo no pudo terminar'
      : 'El equipo trabajó' + (rondas || corr ? ' (' + [rondas ? plural(rondas, 'ronda', 'rondas') : '', plural(corr, 'corrección', 'correcciones')].filter(Boolean).join(' · ') + ')' : '');
    const u = q.eventos[q.eventos.length - 1];
    const est = curso ? '<span class="as-giro" aria-label="Trabajando"></span>'
      : it.estado === 'error' || q.ok === false ? `<span class="as-paso-est error">${ic('ic-aviso', 12)}Falló</span>`
      : it.estado === 'cortado' ? '<span class="as-paso-est">Cortado</span>' : `<span class="as-paso-est ok">${ic('ic-check', 12)}</span>`;
    const ultimo = curso && u ? `<div class="as-eq-ultimo${u.accion === 'enojo' || u.accion === 'rechazar' ? ' enojo' : ''}"><span class="as-eq-chip" style="--dc:${esc(u.color || COLOR_PAPEL.especial)}">${esc(corto(u.nombre, 24))}</span><span>${esc(u.texto || ACCION_TXT[u.accion] || '')}</span></div>` : '';
    const ver = curso ? `<span class="as-paso-acc"><button type="button" class="as-enlace-btn" data-as-ver-taller>${SVG_DUENDE}Ver trabajar</button></span>` : '';
    /* los duendes que Leo eligió en la operación del lienzo (van delante de los de la conversación) */
    const op = (q.deOperacion || []).length ? `<div class="as-eq-op"><span>De la operación:</span>${q.deOperacion.map(x => `<span class="as-eq-chip" style="--dc:${esc(x.color)}">${esc(corto(x.nombre, 24))}</span>`).join('')}</div>` : '';
    let det = '';
    if (it.abierto) {
      const evs = q.eventos.map(e => `<li class="as-eq-ev ${esc(e.accion)}"><span class="as-eq-chip" style="--dc:${esc(e.color || COLOR_PAPEL.especial)}">${esc(corto(e.nombre, 24))}</span><span class="as-eq-acc">${esc(ACCION_TXT[e.accion] || e.accion)}</span><span class="as-eq-txt">${esc(e.texto || '')}</span></li>`).join('');
      const pie = [q.huecos ? plural(q.huecos, 'hueco', 'huecos') + ' por falta de datos' : '', q.inventado ? plural(q.inventado, 'cosa inventada', 'cosas inventadas') + ' (marcadas ⟦ ⟧)' : '',
        (q.faltan || []).length ? 'No encontró: ' + q.faltan.map(x => '«' + x + '»').join(', ') : '', typeof q.coste === 'number' && q.coste > 0 ? 'Gastó ' + usd(q.coste) : '', q.error ? q.error : ''].filter(Boolean);
      det = `<div class="as-paso-det as-eq-det">${it.args && it.args.instruccion ? `<div class="as-det-rot">El encargo</div><p class="as-eq-encargo">${esc(corto(it.args.instruccion, 600))}</p>` : ''}`
        + (evs ? `<div class="as-det-rot">Cómo trabajó</div><ol class="as-eq-evs">${evs}</ol>` : '<div class="as-det-nota">Aún no hay nada que contar.</div>')
        + (pie.length ? `<div class="as-det-nota">${pie.map(esc).join(' · ')}</div>` : '') + '</div>';
    }
    return `<div class="as-paso as-paso-equipo ${it.estado}${curso ? ' trabajando' : ''}${it.abierto ? ' abierto' : ''}${(+q.enojos || 0) ? ' con-enojo' : ''}" data-as-item="${i}">
      <div class="as-paso-fila">
        <button type="button" class="as-paso-cab" data-as-paso-plegar aria-expanded="${it.abierto ? 'true' : 'false'}">${ic('ic-chev-r', 12)}<span class="as-paso-ic">${SVG_DUENDE}</span><span class="as-paso-tit">${esc(cab)}</span></button>
        ${est}
      </div>${op}${ultimo}${ver}${det}</div>`;
  }
  function pasoHtml(it, i) {
    if (it.nombre === HERR_EQUIPO) return pasoEquipoHtml(it, i);
    const escribe = ESCRIBEN.has(it.nombre);
    const est = it.estado === 'en-curso' ? '<span class="as-giro" aria-label="Trabajando"></span>'
      : it.estado === 'error' ? `<span class="as-paso-est error">${ic('ic-aviso', 12)}Falló</span>`
      : it.estado === 'cortado' ? '<span class="as-paso-est">Cortado</span>'
      : it.deshecho ? '<span class="as-paso-est deshecho">Deshecho</span>'
      : `<span class="as-paso-est ok">${ic('ic-check', 12)}</span>`;
    const acc = escribe && it.estado === 'hecho' && it.entrada && !it.deshecho
      ? `<span class="as-paso-acc">${g.deshacer ? `<button type="button" class="as-enlace-btn" data-as-deshacer>${ic('ic-undo', 12)}Deshacer</button>` : ''}${g.verCambio ? '<button type="button" class="as-enlace-btn" data-as-ver>Ver</button>' : ''}</span>` : '';
    let det = '';
    if (it.abierto) {
      const args = Object.keys(it.args || {}).length ? JSON.stringify(it.args, null, 2) : '';
      const res = String(it.texto || '').split('\n');
      det = `<div class="as-paso-det">${args ? `<div class="as-det-rot">Lo que pidió</div><pre>${esc(args.length > 4000 ? args.slice(0, 4000) + '\n…' : args)}</pre>` : ''}`
        + (it.texto ? `<div class="as-det-rot">Lo que obtuvo</div><pre>${esc(res.slice(0, 60).join('\n'))}${res.length > 60 ? '\n… (' + (res.length - 60) + ' renglones más)' : ''}</pre>` : '')
        + (it.imagenes ? `<div class="as-det-nota">${it.imagenes} ${it.imagenes === 1 ? 'imagen' : 'imágenes'}: ${it.descritas ? (it.descritas === it.imagenes ? '' : it.descritas + ' ') + 'descritas por ' + esc(it.vision || 'el modelo de imágenes') + ' (DeepSeek no ve imágenes: trabaja con su descripción).' : 'este modelo no ve imágenes, solo su nombre y su descripción.'}</div>` : '') + '</div>';
    }
    /* lo que había antes de reemplazar un documento o una nota quedó como versión (herramientas.js, `versionPrevia`, 1.1.60) */
    const vp = it.estado === 'hecho' && versionDePaso(it);
    const ver = vp ? `<div class="as-paso-version"><span>Versión anterior guardada: «${esc(vp)}»</span>${it.entrada ? '<button type="button" class="as-enlace-btn" data-as-version>Ver</button>' : ''}</div>` : '';
    return `<div class="as-paso ${it.estado}${escribe ? ' escribe' : ''}${it.deshecho ? ' deshecho' : ''}${it.abierto ? ' abierto' : ''}" data-as-item="${i}">
      <div class="as-paso-fila">
        <button type="button" class="as-paso-cab" data-as-paso-plegar aria-expanded="${it.abierto ? 'true' : 'false'}">${ic('ic-chev-r', 12)}<span class="as-paso-ic">${ic(escribe ? 'ic-edit' : 'ic-herramienta', 13)}</span><span class="as-paso-tit">${esc(conNombres(tituloPaso(it)))}</span></button>
        ${est}
      </div>${acc}${ver}${det}</div>`;
  }
  /* la versión «Antes de …» que dejó un paso (la dice su resultado) y, con «Ver», cómo estaba frente a cómo está: el documento es el del
     cambio en el historial de Claude (`donde`: la nota, o el guion del esquema) */
  const versionDePaso = it => { const m = /quedó guardado como versión «([^»]+)»/.exec(String(it.texto || '')); return m ? m[1] : null; };
  function verVersionPaso(it) {
    const nombre = it && versionDePaso(it), d = C.gestor && C.gestor.documentos && C.gestor.documentos();
    const idE = it && it.entrada && (typeof it.entrada === 'object' ? it.entrada.id : it.entrada);
    const e = nombre && d && idE && C.historial && C.historial.entrada ? C.historial.entrada(d, idE) : null;
    const w = e && e.donde, n = w && (w.tipo === 'nota' ? d.nota(w.id) : w.tipo === 'esquema' && d.documentoEsquema ? d.documentoEsquema(w.id) : null);
    const v = n && (n.versiones || []).find(x => x.nombre === nombre);
    if (!v || !C.versiones) { avisar('Esa versión ya no está'); return; }
    C.versiones.abrirComparacion({ nombre: v.nombre, html: v.html }, { nombre: 'Ahora', html: n.html });
  }
  /* lo que escribe Leo: texto tal cual, con sus enlaces de ClapCraft como chips */
  function textoYo(t) {
    /* las citas (`> …`, 1.1.60): cada tanda de renglones que empiezan por «>», un bloque de cita */
    const ls = String(t).split('\n');
    if (ls.some(l => /^>/.test(l))) {
      const out = []; let cita = [], texto = [];
      const vaciar = () => {
        if (cita.length) { out.push('<blockquote class="as-cita">' + textoYoLinea(cita.map(l => l.replace(/^> ?/, '')).join('\n')) + '</blockquote>'); cita = []; }
        if (texto.length) { const x = texto.join('\n').replace(/^\n+|\n+$/g, ''); if (x) out.push('<span>' + textoYoLinea(x) + '</span>'); texto = []; }
      };
      ls.forEach(l => { if (/^>/.test(l)) { if (texto.length) vaciar(); cita.push(l); } else { if (cita.length) vaciar(); texto.push(l); } });
      vaciar();
      return out.join('');
    }
    return textoYoLinea(t);
  }
  function textoYoLinea(t) {
    const partes = []; let ult = 0;
    String(t).replace(/\[([^\]]+)\]\(((?:clapcraft|https?):\/\/[^)\s]+)\)|((?:clapcraft|https?):\/\/[^\s)\]>]+)/g, (x, et, u1, u2, pos) => {
      partes.push(esc(String(t).slice(ult, pos)));
      const u = u1 || u2, cc = /^clapcraft:/i.test(u);
      partes.push(`<a href="${esc(u)}" class="${cc ? 'as-chip-enlace' : ''}" title="${esc(u)}">${cc ? ic(iconoEnlace(u), 12) : ''}<span>${esc(et || (cc ? etiquetaDeUrl(u) : u))}</span></a>`);
      ult = pos + x.length; return x;
    });
    partes.push(esc(String(t).slice(ult)));
    return partes.join('').replace(/\n/g, '<br>');
  }
  /* ---------- los ids, por su nombre (1.1.60) ----------
     Leo: «el asistente de IA me da el ID de la nota en lugar del nombre». La IA ve los ids en lo que devuelven las herramientas y a
     veces los copia («la nota dmukdx664rd82g», «el nodo p6»). La guía le pide nombrar por el título, y aquí va la red: en sus
     respuestas, un id que es de algo del proyecto pasa a ser un chip con su nombre que lleva a su sitio; en los títulos de los pasos
     y en el permiso, su nombre. Solo tokens enteros que casan con un id que existe (`C.enlaces.indice`: notas, esquemas, bibliotecas,
     secciones, segmentos, lienzos y sus nodos, personajes, contenedores, carpetas, grupos y lo del esquema montado), fuera de los
     bloques de código y de los enlaces. Un id corto (los del tablero: «p6», «l1») solo cuenta detrás de lo que es («nodo», «trama»…):
     «a1» o «p6» sueltos pueden ser texto. */
  let idx = null, idxEn = 0, idxDocs = null;
  function indiceIds() {
    const d = docsFx(), E = C.enlaces; if (!d || !E || !E.indice) return null;
    if (idx && idxDocs === d && Date.now() - idxEn < 4000) return idx;
    let eid = null; try { const e = g.estado ? g.estado() : null; eid = e && e.esquema && e.esquema.id ? e.esquema.id : null; } catch (_) { eid = null; }
    try { idx = E.indice(d, { esquema: eid }); } catch (_) { idx = new Map(); }
    idxDocs = d; idxEn = Date.now();
    return idx;
  }
  const olvidarIndice = () => { idxEn = 0; };
  function nombreDeRef(ref) { const d = docsFx(), E = C.enlaces; try { return d && E && E.nombre ? E.nombre(d, ref, {}) : null; } catch (_) { return null; } }
  /* el gancho del motor: (valor, tipo, args) → el nombre, o null (un nombre o un texto que no es un id: null, y va tal cual) */
  function nombreDeId(v, tipo, args) {
    const d = docsFx(), E = C.enlaces; if (!d || !E || !E.porId) return null;
    const s = String(v ?? '').trim(); if (!s) return null;
    let ref = E.esEnlace && E.esEnlace(s) ? E.leer(s) : null;
    if (!ref) {
      const a = args || {}, op = {};
      if (tipo === 'nodo' && a.lienzo) { const l = E.porId(d, String(a.lienzo)); if (l && l.tipo === 'lienzo') op.lienzo = l.id; }
      ref = E.porId(d, s, op) || (indiceIds() || new Map()).get(s) || null;
    }
    return ref ? nombreDeRef(ref) : null;
  }
  const RE_ID = /(«\s?)?(?<![\p{L}\p{N}_:/.@#-])([A-Za-z0-9][A-Za-z0-9_:-]*[A-Za-z0-9]|[A-Za-z0-9])(?![\p{L}\p{N}_]|[:-][\p{L}\p{N}])(\s?»)?/gu;
  const CLASE_ANTES = /(?:^|[^\p{L}])(?:nodos?|tramas?|actos?|notas?|saltos?|eventos?|momentos?|relaci[oó]n|relaciones|cuadros?|rombos?|segmentos?|secciones|secci[oó]n|bibliotecas?|esquemas?|contenedor(?:es)?|personajes?|lienzos?|carpetas?|grupos?|id|ids)\s*(?:[:(«"'`]\s*)?$/iu;
  /* uno largo sin cifras también (un id de la app puede no llevar ninguna: «dmulqzxrwvquyv»; ninguna palabra de verdad es exactamente
     un id de 10 letras o más del proyecto) — la prueba fallaba 1 de cada 16 veces por el azar del id */
  const fuerte = t => t.includes(':') || (t.length >= 6 && /\d/.test(t) && /[a-z]/i.test(t)) || (t.length >= 10 && /^[a-z0-9]+$/.test(t));
  /* ¿vale este token como id? → la referencia, o null. `antes`: el texto de delante (para los cortos) */
  function idValido(t, antes, I) {
    const ref = I.get(t); if (!ref) return null;
    if (fuerte(t) || CLASE_ANTES.test(String(antes || '').slice(-40))) return ref;
    return null;
  }
  /* en un texto plano (títulos de pasos, el permiso): «id» → «nombre» */
  function conNombres(t) {
    const I = indiceIds(); if (!I || !I.size || !t) return t;
    return String(t).replace(RE_ID, (x, a, tok, b, pos, todo) => {
      const ref = idValido(tok, todo.slice(0, pos) + (a || ''), I), n = ref && nombreDeRef(ref);
      return n ? (a || '') + corto(n, 60) + (b || '') : x;
    });
  }
  function urlDeRef(ref) {
    const E = C.enlaces; let p = null;
    try { const pr = g.proyecto ? g.proyecto() : null; p = pr && (pr.enlace || (pr.nombre && E.slug(pr.nombre))); } catch (_) { p = null; }
    return E.crear(p || 'proyecto', ref);
  }
  function chipId(ref, nombre) {
    const E = C.enlaces, a = document.createElement('a'), u = urlDeRef(ref);
    let et = ''; try { et = E.etiqueta(docsFx(), ref, {}); } catch (_) { et = ''; }
    a.className = 'as-enlace-cc as-chip-id'; a.setAttribute('href', u || '#'); a.title = et || nombre; a.textContent = corto(nombre, 60);
    return a;
  }
  /* en el HTML de una respuesta: los ids, chips con su nombre (fuera de <pre>, <a> y el <code> que no es solo un id) */
  function chipsDeIds(html) {
    const I = indiceIds(); if (!I || !I.size || !html) return html;
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    let cambio = false;
    /* un `código` que es solo un id: el chip en su lugar */
    tpl.content.querySelectorAll('code').forEach(c => {
      if (c.closest('pre, a')) return;
      const t = c.textContent.trim(), prev = c.previousSibling;
      const ref = /^[A-Za-z0-9][A-Za-z0-9_:-]*$/.test(t) ? idValido(t, prev && prev.nodeType === 3 ? prev.nodeValue : '', I) : null, n = ref && nombreDeRef(ref);
      if (n) { c.replaceWith(chipId(ref, n)); cambio = true; }
    });
    const w = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && n.parentElement.closest('pre, code, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const textos = []; for (let n = w.nextNode(); n; n = w.nextNode()) textos.push(n);
    textos.forEach(nodo => {
      const t = nodo.nodeValue; if (!/[A-Za-z0-9]/.test(t)) return;
      const f = document.createDocumentFragment(); let ult = 0, hay = false;
      t.replace(RE_ID, (x, a, tok, b, pos) => {
        const ref = idValido(tok, t.slice(0, pos) + (a || ''), I), n = ref && nombreDeRef(ref);
        if (!n) return x;
        const envuelto = !!(a && b);                                   // «id» → el chip sin comillas
        f.appendChild(document.createTextNode(t.slice(ult, pos) + (envuelto ? '' : a || '')));
        f.appendChild(chipId(ref, n));
        if (!envuelto && b) f.appendChild(document.createTextNode(b));
        ult = pos + x.length; hay = true; return x;
      });
      if (!hay) return;
      f.appendChild(document.createTextNode(t.slice(ult)));
      nodo.replaceWith(f); cambio = true;
    });
    return cambio ? tpl.innerHTML : html;
  }
  /* Markdown del asistente: bloques de código y tablas aquí; lo demás, con MdVivo (el de los campos de la app), párrafo a párrafo.
     Los enlaces clapcraft:// sueltos se convierten en enlaces con su nombre */
  function mdHtml(md) {
    const partes = String(md || '').replace(/\r\n?/g, '\n').split(/^```[^\n]*$/m);
    return partes.map((p, k) => (k % 2 ? `<pre class="as-codigo"><code>${esc(p.replace(/^\n|\n$/g, ''))}</code></pre>` : mdTexto(p))).join('');
  }
  function mdTexto(t) {
    const ls = t.split('\n'), out = []; let bloque = [];
    const vaciar = () => { if (bloque.length) out.push(mdBloque(bloque.join('\n'))); bloque = []; };
    for (let i = 0; i < ls.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(ls[i]) && i + 1 < ls.length && /^\s*\|?\s*:?-{2,}/.test(ls[i + 1])) {
        vaciar();
        const filas = []; while (i < ls.length && /^\s*\|.*\|\s*$/.test(ls[i])) filas.push(ls[i++]); i--;
        out.push(tablaHtml(filas)); continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(ls[i])) { vaciar(); out.push('<hr>'); continue; }
      bloque.push(ls[i]);
    }
    vaciar();
    return out.join('');
  }
  const enlazarSueltos = s => s.replace(/(^|[^(\[<"])(clapcraft:\/\/[^\s)\]>]+)/g, (x, a, u) => a + '[' + etiquetaDeUrl(u).replace(/[[\]]/g, '') + '](' + u + ')');
  function mdBloque(t) {
    const V = raiz.MdVivo;
    const x = enlazarSueltos(t);
    if (V && V.html) return V.html(x).replace(/<p><br><\/p>/g, '').replace(/<a href="clapcraft:/g, '<a class="as-enlace-cc" href="clapcraft:');
    return x.split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  }
  function tablaHtml(filas) {
    const celdas = f => f.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const V = raiz.MdVivo, linea = c => (V && V.html ? V.html(c).replace(/^<p>|<\/p>$/g, '') : esc(c));
    const cab = celdas(filas[0]), resto = filas.slice(2).map(celdas);
    return '<div class="as-tabla"><table><thead><tr>' + cab.map(c => '<th>' + linea(c) + '</th>').join('') + '</tr></thead><tbody>'
      + resto.map(r => '<tr>' + r.map(c => '<td>' + linea(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  /* abajo del todo, si ya se estaba abajo (o a la fuerza). **Si Leo sube, se queda donde lo dejó** (1.1.67): `pegadoAbajo` solo cambia
     con lo que mueve Leo (la rueda, el trackpad, las teclas, la barra): el desplazamiento que pone `abajo` se apunta en `autoTop` y
     su evento `scroll` no cuenta. Antes, con un margen de 40 px, un gesto corto hacia arriba volvía abajo en el siguiente trozo. */
  let pegadoAbajo = true, autoTop = -1;
  function abajo(forzar) {
    if (!cuerpo) return;
    if (forzar) pegadoAbajo = true;
    if (pegadoAbajo) { cuerpo.scrollTop = cuerpo.scrollHeight; autoTop = cuerpo.scrollTop; }
  }
  function alDesplazarCuerpo() {
    if (Math.abs(cuerpo.scrollTop - autoTop) < 1) return;            // lo movió `abajo`
    autoTop = -1;
    pegadoAbajo = alFinal(cuerpo, 4) || (bajandoConRueda() && alFinal(cuerpo, 48));
  }
  /* un gesto de la rueda hacia abajo reciente: el desplazamiento suave aún va de camino y lo que llega lo deja unos píxeles por encima
     del final (sin esto, un trozo que llegaba justo al final del gesto dejaba a Leo suelto: fallaba 1 de cada 4 veces la prueba) */
  let ruedaAbajoEn = 0;
  const bajandoConRueda = () => Date.now() - ruedaAbajoEn < 900;
  /* lo mismo para la caja del razonamiento (el `scroll` no burbujea: se oye en captura desde `cuerpo`) */
  function alDesplazarCaja(e) {
    const dv = e.target;
    if (dv === cuerpo || !dv.matches || !dv.matches('.as-razon > div')) return;
    if (dv._auto !== undefined && Math.abs(dv.scrollTop - dv._auto) < 1) return;   // lo movió `parchearRazon`
    dv._auto = undefined;
    const bajando = bajandoConRueda() && alFinal(dv, 48);
    dv._sigue = alFinal(dv, 8) || bajando;
    /* solo al bajar con la rueda se lleva al final (subiendo, llevarlo cortaría el desplazamiento suave de Leo) */
    if (bajando && !alFinal(dv, 1)) { dv.scrollTop = dv.scrollHeight; dv._auto = dv.scrollTop; }
  }
  /* la rueda hacia arriba suelta el final al momento (antes de que llegue el siguiente trozo); si es sobre el razonamiento y este aún
     puede subir, lo que se suelta es él, no la conversación. Hacia abajo, al acabar el gesto cerca del final (48 px), se engancha:
     lo que llega mientras el desplazamiento suave va de camino dejaría a Leo siempre un poco por encima */
  let ruedaAbajo = null;
  function alRuedaCuerpo(e) {
    const r = e.target.closest && e.target.closest('.as-razon > div');
    if (e.deltaY < 0) {
      ruedaAbajoEn = 0;                                   // sube: lo de «bajando» se acabó
      if (r && r.scrollTop > 0) { r._sigue = false; return; }
      if (cuerpo.scrollTop > 0) pegadoAbajo = false;
      return;
    }
    if (e.deltaY === 0) return;
    ruedaAbajoEn = Date.now();
    clearTimeout(ruedaAbajo);
    ruedaAbajo = setTimeout(() => {
      if (r && r.isConnected && r._sigue === false && alFinal(r, 48)) { r._sigue = true; r.scrollTop = r.scrollHeight; r._auto = r.scrollTop; }
      else if (!pegadoAbajo && alFinal(cuerpo, 48)) abajo(true);
    }, 180);
  }

  /* ====================================================================
     La configuración (#dlgIA)
     ==================================================================== */
  let dlgCfg = null, borrarPendiente = false, probando = false, resultadoPrueba = null;
  async function configurar() {
    dlgCfg = document.getElementById('dlgIA'); if (!dlgCfg) return;
    await leerConfig();
    borrarPendiente = false; resultadoPrueba = null;
    pintarConfig();
    if (!dlgCfg.open) { try { dlgCfg.showModal(); } catch (_) { dlgCfg.setAttribute('open', ''); } }
    if (!dlgCfg._oido) {
      dlgCfg._oido = true;
      dlgCfg.addEventListener('click', alClicConfig);
      dlgCfg.addEventListener('change', alCambioConfig);
      dlgCfg.addEventListener('cancel', e => { e.preventDefault(); cerrarDialogo(dlgCfg); });
      dlgCfg.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches('[data-ia-clave]')) { e.preventDefault(); guardarClaveDe(e.target, 'cfg'); }
      });
    }
  }
  function cerrarDialogo(d) { try { d.close(); } catch (_) { d.removeAttribute('open'); } pintarTodo(); }
  function pintarConfig() {
    if (!dlgCfg) return;
    const t = hayTransporte(), c = cfg || {};
    const prov = c.proveedor === 'otro' ? 'otro' : 'apimart';
    const mod = c.modelo || MODELO_DEFECTO, ms = modelos(), libre = !ms.some(m => m.id === mod);
    const temp = c.temperatura != null ? +c.temperatura : TEMP_DEFECTO, tope = c.tope != null ? +c.tope : TOPE_DEFECTO;
    dlgCfg.innerHTML = `<form method="dialog" class="as-dlg-form" onsubmit="return false">
      <header class="as-dlg-cab">
        <div><div class="dlg-ceja">Asistente IA</div><p class="dlg-titulo">Configuración</p></div>
        <span class="spacer"></span>
        <button type="button" class="icono" data-ia-cerrar title="Cerrar" aria-label="Cerrar">${ic('ic-close', 16)}</button>
      </header>
      <div class="as-dlg-cuerpo">
        ${t ? '' : `<div class="as-caja-aviso">${ic('ic-aviso', 15)}<div><b>Esto es de la app de escritorio.</b> En el navegador ClapCraft no puede guardar la clave de forma segura ni hablar con la IA: ábrelo en tu Mac para configurarlo.</div></div>`}
        <section class="as-sec">
          <div class="as-sec-tit">Proveedor</div>
          <div class="as-seg" role="radiogroup">
            <button type="button" role="radio" aria-checked="${prov === 'apimart'}" class="${prov === 'apimart' ? 'on' : ''}" data-ia-proveedor="apimart"${t ? '' : ' disabled'}>APIMart</button>
            <button type="button" role="radio" aria-checked="${prov === 'otro'}" class="${prov === 'otro' ? 'on' : ''}" data-ia-proveedor="otro"${t ? '' : ' disabled'}>Otro compatible con OpenAI</button>
          </div>
          ${prov === 'otro'
            ? `<label class="as-campo-dlg"><span class="dlg-rotulo">Dirección de la API</span><input type="url" data-ia-url value="${esc(c.url && c.url !== URL_APIMART ? c.url : '')}" placeholder="https://…/v1" spellcheck="false" autocomplete="off"${t ? '' : ' disabled'}></label>`
            : `<p class="as-sec-nota">Se conecta a <code>${esc(URL_APIMART)}</code>. APIMart da acceso a DeepSeek con una sola cuenta y saldo prepagado; ClapCraft solo usa ahí modelos de DeepSeek.</p>`}
          <p class="as-sec-nota">${ic('ic-llave', 12)} Cada clave va con su servicio: al cambiar de proveedor o de dirección, la guardada no se usa y hace falta la de ese servicio${(c.otrasClaves || []).length ? ` (hay guardada otra para ${esc(c.otrasClaves.join(', '))})` : ''}.</p>
        </section>
        <section class="as-sec">
          <div class="as-sec-tit">Clave de la API</div>
          ${claveHtml('cfg', t)}
          <p class="as-sec-nota">${ic('ic-llave', 12)} Se guarda cifrada en el Llavero de tu Mac. ClapCraft no la escribe en tus proyectos ni la vuelve a enseñar: solo sus cuatro últimos caracteres.</p>
        </section>
        <section class="as-sec">
          <div class="as-sec-tit">Modelo <button type="button" class="as-enlace-btn" data-as-web="precios">${ic('ic-fuera', 12)}Precios en APIMart</button></div>
          ${(() => {
            /* los tres de la familia V4 a la vista; los demás, plegados (desplegados si el elegido es uno de ellos) */
            const PRIMEROS = ['deepseek-v4-flash', 'deepseek-v4.1-flash', 'deepseek-v4-pro'];
            const a = ms.filter(m => PRIMEROS.includes(m.id)), b = ms.filter(m => !PRIMEROS.includes(m.id));
            const primeros = a.length ? a : ms.slice(0, 3), resto = a.length ? b : ms.slice(3);
            return `<div class="as-modelos" role="radiogroup">${primeros.map(m => modeloHtml(m, mod, t)).join('')}</div>`
              + (resto.length ? `<details class="as-mas-modelos"${resto.some(m => m.id === mod) ? ' open' : ''}><summary>Más modelos de DeepSeek (${resto.length})</summary><div class="as-modelos" role="radiogroup">${resto.map(m => modeloHtml(m, mod, t)).join('')}</div></details>` : '');
          })()}
          <label class="as-campo-dlg"><span class="dlg-rotulo">${prov === 'otro' ? 'Modelo (escribe su nombre tal cual)' : 'Otro modelo de DeepSeek (su nombre tal cual, empieza por «deepseek-»)'}</span><input type="text" data-ia-modelo-libre value="${libre ? esc(mod) : ''}" placeholder="${prov === 'otro' ? 'el nombre que da tu proveedor' : 'p. ej. deepseek-v3.2'}" spellcheck="false" autocomplete="off"${t ? '' : ' disabled'}></label>
          ${prov === 'otro' ? `<div class="as-precio-fila">
            <label class="as-campo-dlg"><span class="dlg-rotulo">Precio de entrada (USD por millón)</span><input type="number" min="0.001" max="1000" step="0.01" data-ia-precio="entrada" value="${c.precio ? esc(c.precio.entrada) : ''}" placeholder="obligatorio"${t ? '' : ' disabled'}></label>
            <label class="as-campo-dlg"><span class="dlg-rotulo">Precio de salida (USD por millón)</span><input type="number" min="0.001" max="1000" step="0.01" data-ia-precio="salida" value="${c.precio ? esc(c.precio.salida) : ''}" placeholder="obligatorio"${t ? '' : ' disabled'}></label>
          </div>
          <p class="as-sec-nota">${c.precio ? 'Con él se lleva la cuenta del gasto y se aplican los topes.' : '<b>Hace falta</b>: sin el precio del modelo, ClapCraft no puede llevar la cuenta del gasto y no lo usa. Míralo en la página de precios de tu proveedor.'}</p>`
            : c.precioModelo && c.precioModelo.desconocido ? `<div class="as-caja-aviso suave">${ic('ic-aviso', 15)}<div><b>No se sabe el precio de ${esc(mod)}.</b> El gasto se cuenta con un precio alto, por prudencia, así que los topes llegan antes.</div></div>` : ''}
          <p class="as-sec-nota">Precio aproximado en USD por millón de tokens, de lo que lee / de lo que escribe (un millón de tokens son unas 1.500 páginas). Los precios cambian: el de verdad está en APIMart.</p>
        </section>
        <section class="as-sec">
          <div class="as-sec-tit">Modelo para imágenes</div>
          ${visionHtml(t)}
          <p class="as-sec-nota">DeepSeek no ve imágenes. Cuando le mandas una (o una nota que lleva alguna), otro modelo muy barato la describe —con todo el texto que se lea— y DeepSeek trabaja con esa descripción; la misma imagen no se paga dos veces. Esa parte no es de DeepSeek: la imagen va a ese proveedor, por la misma cuenta de APIMart.</p>
        </section>
        <section class="as-sec as-sec-fila">
          <label class="as-campo-dlg as-temp"><span class="dlg-rotulo">Temperatura <b data-ia-temp-v>${String(temp.toFixed(1)).replace('.', ',')}</b></span>
            <input type="range" min="0" max="2" step="0.1" value="${temp}" data-ia-temp style="--pct:${Math.round(temp / 2 * 100)}%"${t ? '' : ' disabled'}>
            <span class="as-temp-ext"><span>Precisa</span><span>Creativa</span></span></label>
          <label class="as-campo-dlg as-tope"><span class="dlg-rotulo">Tope por conversación</span>
            <span class="as-tope-caja"><input type="number" min="0.05" max="1000" step="0.05" value="${tope}" data-ia-tope${t ? '' : ' disabled'}><span>USD</span></span>
            <span class="as-sec-nota">Al llegar, se detiene y te lo dice.</span></label>
          <label class="as-campo-dlg as-tope"><span class="dlg-rotulo">Tope por día</span>
            <span class="as-tope-caja"><input type="number" min="0.05" max="1000" step="0.5" value="${c.topeDiario != null ? +c.topeDiario : 2}" data-ia-tope-dia${t ? '' : ' disabled'}><span>USD</span></span>
            <span class="as-sec-nota">Hoy van ${esc(usd(c.gastoHoy || 0))}. Lo lleva ClapCraft por su cuenta: al llegar, no hace más llamadas hasta mañana.</span></label>
        </section>
        <section class="as-sec">
          <div class="as-prueba">
            <button type="button" class="btn" data-ia-probar${t && hayClave() && !probando ? '' : ' disabled'}>${probando ? '<span class="as-giro"></span>Probando…' : 'Probar conexión'}</button>
            <div class="as-prueba-res" data-ia-res>${pruebaHtml(resultadoPrueba)}</div>
          </div>
        </section>
      </div>
      <menu>
        <button type="button" class="as-enlace-btn" data-ia-tutorial>${ic('ic-nota', 13)}Configurar paso a paso</button>
        <span class="spacer"></span>
        <span class="dlg-pista" data-ia-guardado></span>
        <button type="button" class="btn primario" data-ia-cerrar>Listo</button>
      </menu></form>`;
  }
  /* el modelo que describe las imágenes (1.1.60, la «visión delegada»): los de la lista de electron/ia.js, con su precio, o ninguno */
  function visionHtml(t) {
    const c = cfg || {}, M = motor();
    const lista = Array.isArray(c.modelosVision) && c.modelosVision.length ? c.modelosVision : (M && M.MODELOS_VISION) || [];
    const actual = c.modeloVision || (c.proveedor === 'otro' ? 'ninguno' : (M && M.VISION_DEFECTO) || 'qwen3.7-flash');
    const fila = (id, nom, precio, nota, rec) => `<button type="button" role="radio" aria-checked="${id === actual}" class="as-mod${id === actual ? ' on' : ''}" data-ia-vision="${esc(id)}"${t ? '' : ' disabled'}>
      <span class="as-mod-radio"></span><span class="as-mod-nom">${esc(nom)}${rec ? '<span class="as-mod-rec">Recomendado</span>' : ''}</span>
      <span class="as-mod-precio">${esc(precio)}</span>${nota ? `<span class="as-mod-nota">${esc(nota)}</span>` : ''}</button>`;
    return `<div class="as-modelos" role="radiogroup">${lista.map(m => fila(m.id, m.id, precioTxt(m), m.nota, m.recomendado)).join('')}${fila('ninguno', 'Ninguno', '', 'el asistente no sabrá qué muestran las imágenes', false)}</div>`;
  }
  function modeloHtml(m, mod, t) {
    return `<button type="button" role="radio" aria-checked="${m.id === mod}" class="as-mod${m.id === mod ? ' on' : ''}" data-ia-modelo="${esc(m.id)}"${t ? '' : ' disabled'}>
      <span class="as-mod-radio"></span><span class="as-mod-nom">${esc(m.id)}${m.recomendado ? '<span class="as-mod-rec">Recomendado</span>' : ''}</span>
      <span class="as-mod-precio">${esc(precioTxt(m))}</span>${m.nota ? `<span class="as-mod-nota">${esc(m.nota)}</span>` : ''}</button>`;
  }
  function claveHtml(donde, t) {
    const c = cfg || {};
    const sinCifrado = t && c.cifrado === false && !c.hayClave
      ? `<div class="as-caja-aviso">${ic('ic-aviso', 15)}<div><b>${esc(AYUDA_ERROR.sinCifrado.tit)}.</b> ${esc(AYUDA_ERROR.sinCifrado.txt)}</div></div>` : '';
    if (sinCifrado) return sinCifrado;
    const ilegible = c.claveIlegible && !c.hayClave ? `<div class="as-caja-aviso">${ic('ic-aviso', 15)}<div><b>Tu clave guardada no se puede leer en este equipo:</b> vuelve a pegarla.</div></div>` : '';
    if (c.hayClave) return `<div class="as-clave-hay">${ic('ic-llave', 14)}<span>${c.claveDePrueba ? 'Clave de pruebas' : 'Clave guardada'} <code>${esc(c.finClave ? '••••' + String(c.finClave).slice(-4) : '••••')}</code></span><span class="spacer"></span>
      <button type="button" class="as-enlace-btn" data-ia-cambiar-clave>Cambiar</button>
      <button type="button" class="as-enlace-btn peligro" data-ia-borrar-clave>${borrarPendiente ? '¿Seguro? Borrar' : 'Borrar'}</button></div>`;
    return ilegible + `<div class="as-clave-nueva"><input type="password" data-ia-clave data-ia-donde="${donde}" placeholder="Pega aquí tu clave (sk-…)" autocomplete="off" spellcheck="false"${t ? '' : ' disabled'}>
      <button type="button" class="btn${donde === 'tut' ? ' primario' : ''}" data-ia-guardar-clave${t ? '' : ' disabled'}>${donde === 'tut' ? 'Guardar y probar' : 'Guardar'}</button></div>`;
  }
  function pruebaHtml(r) {
    if (!r) return '';
    if (r.ok && r.soloSaldo) return `<div class="as-res ok">${ic('ic-check', 14)}<div><b>${esc(textoSaldo(r.saldo))}</b><br><span class="as-res-nota">${esc(tituloSaldo(r.saldo).replace(/ · clic: volver a mirarlo$/, ''))}</span></div></div>`;
    if (r.ok) return `<div class="as-res ok">${ic('ic-check', 14)}<div><b>Funciona.</b> ${esc(r.mensaje || '')}${r.saldo ? ' <span class="as-res-saldo">' + esc(textoSaldo(r.saldo)) + '</span>' : ''}${r.herramientas === false ? '<br><span class="as-res-nota">Este modelo no admite herramientas directamente: el asistente las usará de otra forma, algo más lenta.</span>' : r.herramientas ? '<br><span class="as-res-nota">El modelo puede usar las herramientas de ClapCraft.</span>' : ''}</div></div>`;
    const a = ayudaDe(r.codigo);
    return `<div class="as-res error">${ic('ic-aviso', 14)}<div><b>${esc(a ? a.tit : 'No funcionó')}.</b> ${esc(a ? a.txt : (r.mensaje || r.error || ''))}${a && (r.mensaje || r.error) ? `<br><span class="as-res-nota">${esc(corto(r.mensaje || r.error, 200))}</span>` : ''}</div></div>`;
  }
  async function alClicConfig(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-ia-cerrar]')) { cerrarDialogo(dlgCfg); return; }
    if (b.matches('[data-as-web]')) { abrirWeb(WEB[b.dataset.asWeb] || b.dataset.asWeb); return; }
    if (b.matches('[data-ia-tutorial]')) { cerrarDialogo(dlgCfg); tutorial(0); return; }
    if (b.matches('[data-ia-proveedor]')) {
      const p = b.dataset.iaProveedor;
      await guardarConfig(p === 'apimart' ? { proveedor: 'apimart', url: URL_APIMART } : { proveedor: 'otro' });
      resultadoPrueba = null; pintarConfig(); marcarGuardado(); return;
    }
    if (b.matches('[data-ia-modelo]')) { await guardarConfig({ modelo: b.dataset.iaModelo }); resultadoPrueba = null; pintarConfig(); marcarGuardado(); return; }
    if (b.matches('[data-ia-vision]')) { await guardarConfig({ modeloVision: b.dataset.iaVision }); pintarConfig(); marcarGuardado(); return; }
    if (b.matches('[data-ia-guardar-clave]')) { guardarClaveDe(dlgCfg.querySelector('[data-ia-clave]'), 'cfg'); return; }
    if (b.matches('[data-ia-cambiar-clave]')) { cfg = Object.assign({}, cfg, { hayClave: false }); pintarConfig(); const i = dlgCfg.querySelector('[data-ia-clave]'); if (i) i.focus(); await leerConfig(); return; }
    if (b.matches('[data-ia-borrar-clave]')) {
      if (!borrarPendiente) { borrarPendiente = true; pintarConfig(); return; }
      borrarPendiente = false;
      try { await g.transporte.borrarClave(); } catch (_) { /* sigue */ }
      await leerConfig(); alConfigurar(); resultadoPrueba = null; pintarConfig(); pintarTodo(); marcarGuardado('Clave borrada'); return;
    }
    if (b.matches('[data-ia-probar]')) { probar('cfg'); }
  }
  async function alCambioConfig(e) {
    const t = e.target;
    if (t.matches('[data-ia-url]')) { const u = t.value.trim(); if (u && !/^https?:\/\//i.test(u)) { t.classList.add('mal'); return; } t.classList.remove('mal'); await guardarConfig({ proveedor: 'otro', url: u }); marcarGuardado(); }
    else if (t.matches('[data-ia-modelo-libre]')) { const m = t.value.trim(); if (m) { if (await guardarConfig({ modelo: m })) { pintarConfig(); marcarGuardado(); } else t.classList.add('mal'); } }
    else if (t.matches('[data-ia-temp]')) { await guardarConfig({ temperatura: Math.round(+t.value * 10) / 10 }); marcarGuardado(); }
    else if (t.matches('[data-ia-tope]')) { const v = Math.max(0.05, Math.min(1000, +String(t.value).replace(',', '.') || TOPE_DEFECTO)); t.value = v; await guardarConfig({ tope: v }); marcarGuardado(); }
    else if (t.matches('[data-ia-tope-dia]')) { const v = Math.max(0.05, Math.min(1000, +String(t.value).replace(',', '.') || 2)); t.value = v; await guardarConfig({ topeDiario: v }); marcarGuardado(); }
    else if (t.matches('[data-ia-precio]')) {
      const f = t.closest('form'), val = k => +String((f.querySelector('[data-ia-precio="' + k + '"]') || {}).value || '').replace(',', '.');
      const e = val('entrada'), sa = val('salida');
      if (e > 0 && sa > 0) { if (await guardarConfig({ precio: { entrada: e, salida: sa } })) { pintarConfig(); marcarGuardado(); } }
    }
  }
  /* la temperatura se lee mientras se arrastra */
  document.addEventListener('input', e => {
    const t = e.target; if (!t.matches || !t.matches('[data-ia-temp]')) return;
    const f = t.closest('form'), v = f && f.querySelector('[data-ia-temp-v]');
    if (v) v.textContent = (+t.value).toFixed(1).replace('.', ',');
    t.style.setProperty('--pct', Math.round(+t.value / 2 * 100) + '%');
  });
  let tGuardado = null;
  function marcarGuardado(txt) {
    const s = dlgCfg && dlgCfg.querySelector('[data-ia-guardado]'); if (!s) return;
    s.classList.remove('error'); s.textContent = txt || 'Guardado'; clearTimeout(tGuardado); tGuardado = setTimeout(() => { if (s.isConnected) s.textContent = ''; }, 1600);
  }
  /* guardar la clave (se manda al proceso principal y el campo se vacía al momento) y, en el tutorial, probarla */
  async function guardarClaveDe(input, donde) {
    if (!input || !g.transporte || typeof g.transporte.guardarClave !== 'function') return;
    const v = input.value.trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
    input.value = '';
    if (!v) { input.classList.add('tiembla'); setTimeout(() => input.classList.remove('tiembla'), 400); input.focus(); return; }
    if (v.length < 8) { resultadoPrueba = { ok: false, mensaje: 'Eso no parece una clave: suele ser una tira larga de letras y números, sin espacios. Cópiala otra vez desde apimart.ai/keys.' }; donde === 'tut' ? pintarTutorial() : pintarConfig(); return; }
    let rg;
    try { rg = await g.transporte.guardarClave(v); } catch (e) { rg = { ok: false, codigo: e && e.codigo, error: (e && e.message) || String(e) }; }
    if (rg && rg.ok === false) {
      resultadoPrueba = { ok: false, codigo: rg.codigo, mensaje: rg.codigo === 'sinCifrado' ? '' : 'No se pudo guardar la clave: ' + (rg.error || rg.mensaje || '') };
      donde === 'tut' ? pintarTutorial() : pintarConfig(); return;
    }
    cfg = rg && rg.config ? rg.config : await leerConfig();
    pintarTodo(); alConfigurar();
    if (donde === 'tut') { probar('tut'); return; }
    pintarConfig(); marcarGuardado('Clave guardada');
    probar('cfg');
  }
  async function probar(donde) {
    if (probando || !g.transporte || typeof g.transporte.probar !== 'function') return;
    probando = true; resultadoPrueba = null;
    donde === 'tut' ? pintarTutorial() : pintarConfig();
    let r;
    try { r = await g.transporte.probar(); } catch (e) { r = { ok: false, mensaje: (e && e.message) || String(e) }; }
    if (r && r.ok && conSaldo()) { const x = await refrescarSaldo(true); if (x) r = Object.assign({}, r, { saldo: x }); }   // y el saldo que queda (1.1.60)
    probando = false; resultadoPrueba = r || { ok: false, mensaje: 'Sin respuesta' };
    if (donde === 'tut') pintarTutorial(); else if (dlgCfg && dlgCfg.open) pintarConfig();
  }

  /* ====================================================================
     El tutorial (#dlgTutorialIA)
     ==================================================================== */
  let dlgTut = null, paso = 0;
  /* las cifras de coste, con los precios del modelo recomendado: aproximadas y dichas con prudencia */
  const PASOS = [
    { id: 'que', ceja: 'Antes de empezar', tit: 'Qué es esto y cuánto cuesta', html: () => `
      <p>El asistente es una inteligencia artificial, <b>DeepSeek</b>, que trabaja dentro de ClapCraft como lo hace Claude en Cowork: lee tus esquemas, bibliotecas y guiones, y los cambia cuando se lo pides. Todo lo que cambia se puede deshacer.</p>
      <p>Para hablar con ella, ClapCraft se conecta por internet a un servicio llamado <b>APIMart</b>. A esa conexión se le llama <b>API</b>, y se paga como la luz: solo lo que usas, sin suscripción. Pones un poco de saldo y se va descontando.</p>
      <div class="as-tut-caja">
        <div class="as-tut-caja-tit">Cuánto cuesta, más o menos</div>
        <ul class="as-tut-costes">
          <li><span>Una pregunta sobre tu proyecto</span><b>1 a 3 céntimos</b></li>
          <li><span>Leer un esquema y escribir un guion de 10 páginas</span><b>unos 5 a 20 céntimos</b></li>
          <li><span>Partir un guion de 30 páginas en fragmentos</span><b>unos 10 a 40 céntimos</b></li>
          <li><span>Con 5 dólares de saldo</span><b>cientos de preguntas o decenas de encargos grandes</b></li>
        </ul>
        <p class="as-tut-letra">En dólares y con el modelo recomendado. Son cifras aproximadas: cada vez que la IA piensa un paso se le manda otra vez lo necesario (unos 6.000 tokens, medio céntimo como mucho), y dependen del tamaño de tu proyecto y de los precios de APIMart, que cambian. El asistente te enseña lo que lleva gastado, se detiene en el tope de cada conversación y, por si acaso, ClapCraft no deja gastar más de un tope al día (2 dólares, si no lo cambias).</p>
      </div>
      <div class="as-tut-seguridad">${ic('ic-llave', 16)}<div><b>Privacidad.</b> Lo que le pides y los textos de tu proyecto que la IA lee para contestarte (esquemas, notas, guiones) se mandan por internet a APIMart y a DeepSeek (las imágenes, al modelo que las describe, también por APIMart). Tu proyecto no sale entero: solo lo que haga falta para cada encargo. Si algo es muy privado, no se lo pidas.</div></div>
      <p>Configurarlo lleva unos 5 minutos. Te guiamos paso a paso.</p>` },
    { id: 'cuenta', ceja: 'Paso 1', tit: 'Crea tu cuenta en APIMart', html: () => `
      <ol class="as-tut-pasos">
        <li>Pulsa <b>Abrir APIMart</b>: se abre su página en tu navegador.</li>
        <li>Regístrate con tu correo (o con tu cuenta de Google, si te lo ofrece) y entra.</li>
        <li>Cuando estés dentro, vuelve aquí y pulsa <b>Siguiente</b>.</li>
      </ol>
      <button type="button" class="btn primario as-tut-web" data-as-web="inicio">${ic('ic-fuera', 14)}Abrir APIMart</button>
      <p class="as-tut-letra">APIMart es un intermediario: con una sola cuenta da acceso a DeepSeek y a otros modelos. ClapCraft solo usará los de DeepSeek, que son de los más baratos.</p>` },
    { id: 'saldo', ceja: 'Paso 2', tit: 'Pon un poco de saldo', html: () => `
      <p>APIMart funciona con saldo prepagado: primero pones dinero y luego se descuenta lo que gastes.</p>
      <ol class="as-tut-pasos">
        <li>En tu panel de APIMart busca la opción de recargar (puede llamarse <b>Recargar</b>, <b>Top up</b> o <b>Billing</b>).</li>
        <li>Empieza con poco, lo mínimo que te deje: con <b>5 dólares</b> tienes para mucho.</li>
        <li>Ahí mismo verás tu <b>saldo</b>. Míralo de vez en cuando: si llega a cero, el asistente te dirá «No queda saldo».</li>
      </ol>
      <div class="as-tut-botones"><button type="button" class="btn as-tut-web" data-as-web="panel">${ic('ic-fuera', 14)}Abrir mi panel de APIMart</button>${g.transporte && typeof g.transporte.saldo === 'function' ? '<button type="button" class="btn" data-ia-saldo>Comprobar mi saldo</button>' : ''}</div>
      ${resultadoPrueba && resultadoPrueba.soloSaldo !== undefined ? pruebaHtml(resultadoPrueba) : ''}` },
    { id: 'clave', ceja: 'Paso 3', tit: 'Crea tu clave', html: () => `
      <p>La <b>clave</b> es una contraseña larga que le dice a APIMart que ClapCraft va de tu parte (y que el gasto es tuyo).</p>
      <ol class="as-tut-pasos">
        <li>Pulsa <b>Abrir la página de claves</b> (apimart.ai/keys).</li>
        <li>Arriba a la derecha, pulsa <b>Create API Key</b> (crear clave).</li>
        <li>Ponle un nombre que reconozcas, como <b>ClapCraft</b>. Si te deja ponerle un límite de gasto (<i>quota</i>), pónselo: es una protección más.</li>
        <li>Pulsa <b>Create Key</b> y luego el icono de <b>copiar</b> que aparece junto a la clave.</li>
      </ol>
      <button type="button" class="btn primario as-tut-web" data-as-web="claves">${ic('ic-fuera', 14)}Abrir la página de claves</button>
      <div class="as-tut-seguridad">${ic('ic-llave', 16)}<div><b>Trátala como una contraseña.</b> No la pegues en correos, chats ni documentos, y no se la enseñes a nadie: con ella se puede gastar tu saldo. Si crees que alguien la vio, bórrala en APIMart y crea otra.</div></div>` },
    { id: 'pegar', ceja: 'Paso 4', tit: 'Pégala aquí y prueba', html: () => `
      ${hayTransporte() ? '' : `<div class="as-caja-aviso">${ic('ic-aviso', 15)}<div><b>Este paso se hace en la app de escritorio.</b> En el navegador ClapCraft no puede guardar la clave de forma segura.</div></div>`}
      <p>Pega la clave que copiaste (${atajo('V')}) y pulsa <b>Guardar y probar</b>. ClapCraft hará una pregunta mínima a DeepSeek para comprobar que todo funciona (cuesta una fracción de céntimo).</p>
      ${claveHtml('tut', hayTransporte())}
      ${hayClave() && !probando && !resultadoPrueba ? `<div class="as-prueba"><button type="button" class="btn" data-ia-probar>Probar conexión</button></div>` : ''}
      <div class="as-prueba-res" data-ia-res>${probando ? '<div class="as-res"><span class="as-giro"></span><div>Probando la conexión…</div></div>' : pruebaHtml(resultadoPrueba)}</div>
      <div class="as-tut-seguridad">${ic('ic-llave', 16)}<div>Se guarda <b>cifrada en el Llavero de tu Mac</b>. ClapCraft no la escribe en tus proyectos ni la vuelve a enseñar: solo verás sus cuatro últimos caracteres.</div></div>` },
    { id: 'modelo', ceja: 'Paso 5', tit: 'Elige el modelo y el tope de gasto', html: () => {
      const mod = modeloActual(), tope = cfg && cfg.tope != null ? +cfg.tope : TOPE_DEFECTO;
      const tres = modelos().filter(m => ['deepseek-v4-flash', 'deepseek-v4.1-flash', 'deepseek-v4-pro'].includes(m.id));
      return `
      <p>El <b>modelo</b> es la versión de DeepSeek que contesta. Te recomendamos <b>deepseek-v4-flash</b>: es rápido, barato y trabaja bien con ClapCraft.</p>
      <div class="as-modelos" role="radiogroup">${tres.map(m => modeloHtml(m, mod, hayTransporte())).join('')}</div>
      <p class="as-tut-letra as-tut-precio">Los precios son aproximados, en dólares por millón de tokens: lo que lee / lo que escribe. Un millón de tokens son unas 1.500 páginas.</p>
      <p>El <b>tope</b> es lo máximo que puede gastar una conversación. Al llegar, el asistente se detiene y te lo dice; empiezas otra o lo subes. Te recomendamos <b>0,50 USD</b>: caben muchas peticiones.</p>
      <label class="as-campo-dlg as-tope"><span class="dlg-rotulo">Tope por conversación</span>
        <span class="as-tope-caja"><input type="number" min="0.05" max="1000" step="0.05" value="${tope}" data-ia-tope${hayTransporte() ? '' : ' disabled'}><span>USD</span></span></label>
      <p class="as-tut-letra">DeepSeek no ve imágenes: las que le mandes las describe otro modelo muy barato (Qwen, por la misma cuenta de APIMart; una imagen cuesta unas centésimas de céntimo) y DeepSeek trabaja con esa descripción. Se cambia en la configuración.</p>
      <p class="as-tut-letra">Más modelos y la temperatura, en la configuración (el botón de ajustes del panel).</p>`; } },
    { id: 'uso', ceja: 'Paso 6', tit: 'Cómo se usa', html: () => `
      <ul class="as-tut-lista">
        <li>${ic('ic-asistente', 15)}<div><b>Ábrelo</b> con el botón <b>Asistente</b> de arriba a la derecha o con <b>${atajo('I', true)}</b>. Ve lo que tienes abierto.</div></li>
        <li>${ic('ic-instruccion', 15)}<div><b>Pídele cosas</b> como a una persona: «Lee el esquema del piloto y dime qué trama está floja», «Escribe el guion del primer acto».</div></li>
        <li>${ic('ic-link', 15)}<div><b>Pega enlaces</b> para decirle exactamente de qué hablas: <b>${atajo('C', true)}</b> copia el de lo que tienes delante, y el botón de enlace de cada cabecera tiene «Mandar al asistente».</div></li>
        <li>${ic('ic-lienzo', 15)}<div>En un <b>lienzo</b>, «Ejecutar con IA» hace una operación, y «Ejecutar todo con IA», todas.</div></li>
        <li>${ic('ic-undo', 15)}<div>Cada cambio sale en el chat con <b>Deshacer</b> y <b>Ver</b>, y queda en <b>Claude › Historial de cambios</b>. <b>Detener</b> lo para cuando quieras.</div></li>
      </ul>
      <p class="as-tut-letra">DeepSeek no ve imágenes: de las que haya en tus notas solo conoce su nombre y su descripción.</p>` },
    { id: 'fallos', ceja: 'Si algo falla', tit: 'Qué hacer si algo falla', html: () => `
      <dl class="as-tut-fallos">
        <dt>«La clave no vale» <span>error 401</span></dt><dd>Vuelve a copiarla entera desde apimart.ai/keys, o crea otra, y pégala en la configuración.</dd>
        <dt>«No queda saldo» <span>error 402</span></dt><dd>Recarga en tu panel de APIMart. En cuanto tengas saldo, pulsa «Reintentar».</dd>
        <dt>«Demasiadas peticiones» <span>error 429</span></dt><dd>APIMart pide un respiro: espera un minuto y vuelve a intentarlo.</dd>
        <dt>«APIMart tuvo un problema» <span>error 500 o 502</span></dt><dd>El fallo es suyo. Espera un poco y vuelve a intentarlo.</dd>
        <dt>No contesta</dt><dd>Mira que tengas internet. En la configuración, «Probar conexión» te dice qué pasa.</dd>
        <dt>Llegó al tope</dt><dd>Empieza una conversación nueva (el «+» del panel) o sube el tope en la configuración.</dd>
      </dl>
      <div class="as-tut-botones"><button type="button" class="btn as-tut-web" data-as-web="panel">${ic('ic-fuera', 14)}Abrir mi panel de APIMart</button><button type="button" class="btn" data-ia-abrir-cfg>${ic('ic-ajustes', 14)}Abrir la configuración</button></div>` }
  ];
  function tutorial(desde) {
    dlgTut = document.getElementById('dlgTutorialIA'); if (!dlgTut) return;
    pref.tutorialVisto = true; guardarPref();
    paso = typeof desde === 'string' && isNaN(+desde) ? Math.max(0, PASOS.findIndex(p => p.id === desde)) : Math.max(0, Math.min(PASOS.length - 1, +desde || 0));
    resultadoPrueba = null;
    const abrirYa = () => { pintarTutorial(); if (!dlgTut.open) { try { dlgTut.showModal(); } catch (_) { dlgTut.setAttribute('open', ''); } } };
    if (dlgCfg && dlgCfg.open) cerrarDialogo(dlgCfg);
    leerConfig().then(abrirYa, abrirYa);
    if (!dlgTut._oido) {
      dlgTut._oido = true;
      dlgTut.addEventListener('click', alClicTutorial);
      dlgTut.addEventListener('change', async e => {
        if (e.target.matches('[data-ia-tope]')) { const v = Math.max(0.05, Math.min(1000, +String(e.target.value).replace(',', '.') || TOPE_DEFECTO)); e.target.value = v; await guardarConfig({ tope: v }); }
      });
      dlgTut.addEventListener('cancel', e => { e.preventDefault(); cerrarTutorial(); });
      dlgTut.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches('[data-ia-clave]')) { e.preventDefault(); guardarClaveDe(e.target, 'tut'); }
      });
    }
  }
  function cerrarTutorial() { cerrarDialogo(dlgTut); }
  function pintarTutorial() {
    if (!dlgTut) return;
    const P = PASOS[paso], ultimo = paso === PASOS.length - 1;
    dlgTut.innerHTML = `<form method="dialog" class="as-dlg-form" onsubmit="return false">
      <header class="as-dlg-cab">
        <div><div class="dlg-ceja">${esc(P.ceja + (/^Paso \d/.test(P.ceja) ? ' de ' + PASOS.filter(x => /^Paso \d/.test(x.ceja)).length : ''))}</div><p class="dlg-titulo">${esc(P.tit)}</p></div>
        <span class="spacer"></span>
        <button type="button" class="icono" data-tut-cerrar title="Cerrar (puedes volver desde el asistente)" aria-label="Cerrar">${ic('ic-close', 16)}</button>
      </header>
      <div class="as-tut-progreso" role="progressbar" aria-valuemin="1" aria-valuemax="${PASOS.length}" aria-valuenow="${paso + 1}">
        ${PASOS.map((p, i) => `<button type="button" class="as-tut-seg${i < paso ? ' hecho' : ''}${i === paso ? ' actual' : ''}" data-tut-ir="${i}" title="${esc(p.tit)}" aria-label="${esc(p.ceja + ': ' + p.tit)}"></button>`).join('')}
      </div>
      <div class="as-dlg-cuerpo as-tut-cuerpo">${P.html()}</div>
      <menu>
        ${paso > 0 ? '<button type="button" class="btn" data-tut-atras>Atrás</button>' : '<span></span>'}
        <span class="spacer"></span>
        <span class="dlg-pista" data-ia-guardado></span>
        ${P.id === 'pegar' && !hayClave() ? '<button type="button" class="as-enlace-btn" data-tut-sig>Lo haré luego</button>' : ''}
        <button type="button" class="btn primario" data-tut-${ultimo ? 'fin' : 'sig'}>${ultimo ? 'Terminar' : paso === 0 ? 'Empezar' : 'Siguiente'}</button>
      </menu></form>`;
    const f = dlgTut.querySelector('[data-ia-clave]'); if (f && !probando) setTimeout(() => f.focus(), 30);
  }
  async function alClicTutorial(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-tut-cerrar]')) { cerrarTutorial(); return; }
    if (b.matches('[data-tut-atras]')) { paso = Math.max(0, paso - 1); resultadoPrueba = null; pintarTutorial(); return; }
    if (b.matches('[data-tut-sig]')) { paso = Math.min(PASOS.length - 1, paso + 1); resultadoPrueba = null; pintarTutorial(); return; }
    if (b.matches('[data-tut-ir]')) { paso = +b.dataset.tutIr; resultadoPrueba = null; pintarTutorial(); return; }
    if (b.matches('[data-tut-fin]')) { cerrarTutorial(); abrir({ sinTutorial: true }); return; }
    if (b.matches('[data-as-web]')) { abrirWeb(WEB[b.dataset.asWeb] || b.dataset.asWeb); return; }
    if (b.matches('[data-ia-abrir-cfg]')) { cerrarTutorial(); configurar(); return; }
    if (b.matches('[data-ia-guardar-clave]')) { guardarClaveDe(dlgTut.querySelector('[data-ia-clave]'), 'tut'); return; }
    if (b.matches('[data-ia-probar]')) { probar('tut'); return; }
    if (b.matches('[data-ia-saldo]')) {                        // «Comprobar mi saldo» (1.1.60): hace falta la clave (el paso 3)
      const x = conSaldo() ? await refrescarSaldo(true) : null;
      resultadoPrueba = x ? { ok: true, soloSaldo: true, saldo: x } : { ok: false, soloSaldo: false, mensaje: hayClave() ? 'APIMart no dijo el saldo; míralo en tu panel.' : 'Aún no hay clave: pégala en el paso 4 y vuelve aquí (o mira el saldo en tu panel de APIMart).' };
      pintarTutorial(); return;
    }
    if (b.matches('[data-ia-cambiar-clave]')) { cfg = Object.assign({}, cfg, { hayClave: false }); resultadoPrueba = null; pintarTutorial(); await leerConfig(); return; }
    if (b.matches('[data-ia-borrar-clave]')) {
      if (!borrarPendiente) { borrarPendiente = true; pintarTutorial(); return; }
      borrarPendiente = false; try { await g.transporte.borrarClave(); } catch (_) { /* sigue */ }
      await leerConfig(); alConfigurar(); resultadoPrueba = null; pintarTutorial(); pintarTodo(); return;
    }
    if (b.matches('[data-ia-modelo]')) { await guardarConfig({ modelo: b.dataset.iaModelo }); pintarTutorial(); }
  }

  /* ====================================================================
     Arranque
     ==================================================================== */
  function iniciar(ganchos) {
    g = ganchos || {};
    if (!panel) montarPanel();
    if (!panel) return;
    cuerpo.addEventListener('scroll', alDesplazarCuerpo, { passive: true });
    cuerpo.addEventListener('wheel', alRuedaCuerpo, { passive: true });
    cuerpo.addEventListener('scroll', alDesplazarCaja, { capture: true, passive: true });
    /* abrir o cerrar el razonamiento a mano: manda sobre la regla (abierto mientras piensa, cerrado cuando contesta) */
    cuerpo.addEventListener('click', e => {
      const s = e.target.closest && e.target.closest('details.as-razon > summary'); if (!s) return;
      const it = itemDe(s); if (it) it.razonAbierto = !s.parentNode.open;
    });
    /* si cambia el alto de la conversación (sale o se va el duende, se ensancha el panel) y se estaba al final, se sigue al final */
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (pegadoAbajo) abajo(); }).observe(cuerpo);
    leerConfig().then(() => { pintarTodo(); if (pref.abierto) abrir({ foco: false, sinTutorial: true, desplegar: false }); });
    if (g.transporte && typeof g.transporte.alCambioConfig === 'function') g.transporte.alCambioConfig(c => { cfg = c; pintarTodo(); });
    /* el equipo de duendes (1.1.68): leerlo, oír sus cambios (el nombre y el aspecto del maestro, los chips «como al elegirlo»,
       los actores del taller), el sonido que calla con la ventana escondida y el taller que se dejó abierto */
    leerEquipo().then(() => { pintarTodo(); vestirMaestro(); if (pref.taller && pref.taller.abierto && hayTransporte()) abrirTaller({ sinFoco: true }); });
    const alEquipo = e => { if (e && Array.isArray(e.duendes)) equipoCache = e; pintarCabecera(); pintarDn(); marcarDn(); vestirMaestro(); if (!equipoVivo) tallerActores(); };
    try {
      if (g.alCambioEquipo) g.alCambioEquipo(alEquipo);
      else if (C.equipoUI && typeof C.equipoUI.alCambio === 'function') C.equipoUI.alCambio(alEquipo);
    } catch (_) { /* sin avisos: se lee al abrir la lista */ }
    document.addEventListener('visibilitychange', () => { sonidoAlDia(); pausarMascota(); });
    if (typeof MutationObserver === 'function') new MutationObserver(temaMarcos).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    /* Esc con el foco dentro del marco del taller o de la mascota: el motor lo cuenta aquí (se comprueba de quién es); en la mascota
       (tras un clic en ella el foco se queda en su marco), vuelve al campo */
    addEventListener('message', e => {
      const x = e.data; if (!x || typeof x !== 'object') return;
      if (x.tipo === 'duendes-taller' && x.tecla === 'Escape' && tallerMarco && e.source === tallerMarco.contentWindow) { cerrarTaller(); return; }
      if (x.tipo === 'duendes-mascota' && x.tecla === 'Escape' && duendeMarco && e.source === duendeMarco.contentWindow && campo && panel && !panel.hidden) {
        try { campo.focus({ preventScroll: true }); } catch (_) { /* nada */ }
      }
    });
  }

  C.asistente = {
    iniciar, abrir, cerrar, alternar, plegar, mandar, insertar, detener, ejecutarNodo, ejecutarLienzo, tutorial, configurar,
    nuevaConversacion, recargar,
    /* las fórmulas activas de la conversación (1.1.60): cuáles y cambiarlas; `repintarFormulas` tras un cambio en «Fórmulas» */
    formulasActivas: () => fxActivas.slice(), activarFormulas: ids => fijarFx(ids), repintarFormulas: () => { pintarFx(); },
    /* citar un texto (1.1.60): { texto, enlace (clapcraft://… del tramo o la nota), etiqueta (de dónde es) } → un chip de cita en el campo */
    citar,
    abierto: () => !!(panel && !panel.hidden),
    trabajando: () => enCurso,
    /* el equipo de duendes (1.1.68): los especiales de la conversación, el taller y el sonido */
    especialesActivos: () => dnVista(), activarEspeciales: lista => fijarDn(lista), repintarDuendes: () => { pintarCabecera(); pintarDn(); marcarDn(); vestirMaestro(); if (!equipoVivo) tallerActores(); },
    abrirTaller, cerrarTaller, tallerAbierto, sonido: v => { if (v === undefined) return !!pref.sonido; ponerSonido(!!v); return !!pref.sonido; },
    ejecutarEquipo,
    _equipo: () => ({ vivo: !!equipoVivo, hablados, dichos, estado: estadoMasc, escena, huelgaSaldo, dn: dnActivos, tallerListo, tallerCola: tallerCola.length }),
    /* para las pruebas y para app.js: el estado de lo que se ve */
    /* para las pruebas (1.1.67): enseñar o esconder el duende trabajando a mano, y en qué está */
    _duende: (on, texto) => { if (on === undefined) return { visible: duendeVisible, texto: (panel && panel.querySelector('[data-as-trabajo-txt]') || {}).textContent || '' }; ponerDuende(!!on, texto || 'Pensando…'); return null; },
    _estado: () => ({ items: items.map(i => Object.assign({}, i)), coste: Object.assign({}, coste), cfg: cfg && Object.assign({}, cfg), pref: Object.assign({}, pref) }),
    MODELOS: MODELOS_RESPALDO, WEB
  };
})(typeof window !== 'undefined' ? window : globalThis);
