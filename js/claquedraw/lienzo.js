/* Claquedraw · la interfaz del lienzo de nodos (1.1.58)
   Leo, 27-09-2026: «En páginas web (como Dreamina) hay una funcionalidad llamada "Space", que es un lienzo donde se conectan
   imágenes, textos y otros elementos para hacer un video, funciona por medio de nodos, donde se conectan cosas y se esperan
   salidas. Quiero algo similar en ClapCraft […] en lugar de generar videos, nosotros generamos guiones y también los partimos».
   Pinta la sección #lienzo (claquedraw.html) sobre el modelo `C.Lienzo` (js/claquedraw/lienzo-modelo.js) y lo que apunta cada
   entrada lo lee de los documentos (`resolverEntrada` de documentos.js). No sabe dónde se guarda nada: se lo dan los ganchos de
   app.js.
   · **El lienzo es infinito**: `.lz-mundo` va con `transform: translate(x, y) scale(zoom)` (la vista, `{ x, y, zoom }`: la
     esquina del mundo en píxeles de pantalla y la escala) y la cuadrícula de puntos del fondo se mueve con ella (--lz-paso,
     --lz-px, --lz-py). De pantalla a mundo: `(xCliente - borde - x) / zoom`. Se desplaza arrastrando el fondo, con espacio +
     arrastrar, con el botón central o con la rueda / el trackpad; el pellizco (o Ctrl + rueda) acerca y aleja **anclado al
     puntero**, un fotograma cada vez como el esquema (1.1.51); −, % y + del pie, y «Encajar» (Mayús 1) ve todos los nodos.
   · **Nodos**: tarjetas con cabecera (icono de su tipo, familia —ENTRADA / CLAUDE— y título, que se edita con doble clic), los
     puertos de entrada con su nombre a la izquierda, la vista previa o las opciones en el cuerpo y un pie con el estado y la
     salida (su punto en el borde derecho). Una entrada rota (lo que apuntaba ya no está) se ve rota y dice por qué.
   · **Cables**: curvas en SVG del color de lo que llevan (`claseCable` → `C.Lienzo.CLASES[…].tono`). Se crean arrastrando de un
     punto a otro (de una salida a una entrada o al revés; mientras, lo que no vale se apaga y el cable se imanta al punto que
     sí); arrastrar desde una entrada ya conectada suelta su último cable (como en ComfyUI). Soltar una salida en el vacío abre
     «Añadir nodo» con las operaciones que la aceptan y la conecta. Un clic elige un cable y Supr lo quita.
   · **Elegir**: clic, Mayús + clic (suma o quita), Mayús o Cmd + arrastrar en el fondo (rectángulo), Cmd+A. Arrastrar mueve lo
     elegido; con Opción, duplica. Supr borra con «Deshacer» en el aviso. Cmd+C / V / D copian, pegan y duplican (el
     portapapeles es de la página; pegar una imagen o un texto del sistema crea un nodo). Las flechas mueven lo elegido.
   · **Historial propio** por lienzo (instantáneas, `Tramas.Historial`): Cmd+Z / Cmd+Mayús+Z / Cmd+Y con el lienzo delante; en
     Electron, Deshacer del menú llega por `historia()` de app.js a `deshacer()` / `rehacer()`. Cada cambio llama a
     `guardar(datos)` una vez (al soltar un arrastre, no a cada píxel; lo que se escribe, a los 400 ms).
   · **Operaciones**: su instrucción y sus opciones en el cuerpo, «▶ Pedir a Claude» (el modelo las deja pendientes con sus
     previas y el encargo —el enlace de cada una y una frase— va a `pedirAClaude`), el estado (pendiente con un pulso, hecho con ✓
     y sus salidas como fichas que llevan a lo creado por `abrir`, error en rojo, desactualizada en ámbar) y «Pedir todo» en el pie.
   Los atributos de la página llevan el prefijo `data-lz-` (el tablero y el gestor oyen clics en `document` y no deben tomarlos
   por suyos). Las teclas se oyen en captura en `window` y solo con el lienzo a la vista: las que atiende no llegan al tablero
   escondido (Supr borraría su nodo elegido). Contrato: `Claquedraw.lienzoUI` al final. */
(function (C) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clonar = x => JSON.parse(JSON.stringify(x));
  const ic = (id, t) => `<svg width="${t || 14}" height="${t || 14}" aria-hidden="true"><use href="#${id}"></use></svg>`;
  const L = () => C.Lienzo;
  const TIPOS = () => (L() && L().TIPOS) || {};
  const CLASES = () => (L() && L().CLASES) || {};

  /* ---------- lo que ve cada tipo: icono del sprite y color (los tonos de las tramas) ---------- */
  const ICONOS = { texto: 'ic-texto', imagen: 'ic-imagen', nota: 'ic-nota', segmento: 'ic-segmento', biblioteca: 'ic-docs', esquema: 'ic-board',
    personaje: 'ic-person', generar: 'ic-magia', partir: 'ic-tijera', escaleta: 'ic-escaleta', resumir: 'ic-resumir', reescribir: 'ic-reescribir',
    traducir: 'ic-traducir', prompt: 'ic-instruccion' };
  const TONO_OP = { generar: 'indigo', partir: 'verde', escaleta: 'violeta', resumir: 'cielo', reescribir: 'magenta', traducir: 'turquesa', prompt: 'uva' };
  const ANCHO = { texto: 260, imagen: 240, nota: 250, segmento: 240, biblioteca: 250, esquema: 260, personaje: 230 };
  const ANCHO_OP = 360;                          // (1.1.61: con 300, el pie de una operación con «IA» no cabía en una fila)
  const tonoClase = k => (CLASES()[k] && CLASES()[k].tono) || 'gris';
  const tonoTipo = tipo => { const t = TIPOS()[tipo]; if (!t) return 'gris'; return t.familia === 'operacion' ? (TONO_OP[tipo] || 'violeta') : tonoClase(t.da[0]); };
  const colorTipo = tipo => `var(--t-${tonoTipo(tipo)})`;
  const esOp = n => !!n && !!TIPOS()[n.tipo] && TIPOS()[n.tipo].familia === 'operacion';
  const PLACEHOLDER = {
    generar: 'Qué escribir: tono, extensión, qué escenas… (opcional si conectas algo)',
    partir: 'Algo más para los fragmentos: estilo, cámara, continuidad… (opcional)',
    escaleta: 'Cómo sacar los beats (opcional)',
    resumir: 'Qué resumir o cómo (opcional)',
    reescribir: 'Qué cambiar (opcional si pones el tono)',
    traducir: 'Registro, nombres que no se traducen… (opcional)',
    prompt: 'Qué quieres que haga Claude con lo conectado'
  };
  /* con una fórmula elegida (1.1.60), lo escrito es opcional: va donde ella dice {{instruccion}} o detrás */
  const PLACEHOLDER_FX = 'Qué escribir (opcional con fórmula): va donde la fórmula dice {{instruccion}} o detrás';
  const IDIOMAS = ['Inglés', 'Español', 'Francés', 'Portugués', 'Italiano', 'Alemán', 'Catalán', 'Japonés'];

  /* ---------- estado ---------- */
  let m = null, lid = null, g = {};
  let vista = { x: 0, y: 0, zoom: 1 };
  const sel = new Set();
  let cableSel = null;
  const historiales = new Map();                  // lienzo → Tramas.Historial (en memoria: dura lo que la ventana)
  let hist = null;
  let $sec, $cuerpo, $mundo, $svg, $nodos, $vacio, $pct;
  let iniciado = false, encajarAlVer = false;
  const els = new Map();                          // nodo → su elemento
  let portapapeles = null, textoCopiado = '';
  let ultimoPuntero = null;                       // { x, y } del mundo: donde se pega
  let espacio = false;
  let menuAbierto = null;
  let firmaCache = null;
  let pulsandoNodo = false;                       // un botón de un nodo, apretado: no se repinta hasta soltarlo (1.1.60)

  const docs = () => (g.docs ? g.docs() : null);
  const firma = () => { const d = docs(); return d && d.firma ? d.firma() : undefined; };
  const nodos = () => (m ? m.datos.nodos : []);
  const cables = () => (m ? m.datos.cables : []);
  const json = () => JSON.stringify(m.toJSON());
  const avisar = (msg, accion) => { if (!msg) return; if (g.avisar) g.avisar(msg, accion); else if (window.Tramas && Tramas.tablero) Tramas.tablero.avisar(msg, accion); };

  /* ====================================================================
     Montar y desmontar
     ==================================================================== */
  function iniciar() {
    if (iniciado) return true;
    $sec = $('lienzo'); if (!$sec) return false;
    $cuerpo = $('lzCuerpo'); $mundo = $('lzMundo'); $svg = $('lzCables'); $nodos = $('lzNodos'); $vacio = $('lzVacio');
    $pct = $sec.querySelector('[data-lz-zoom="0"]');
    $cuerpo.addEventListener('pointerdown', onDown);
    $cuerpo.addEventListener('dblclick', onDoble);
    $cuerpo.addEventListener('contextmenu', onContexto);
    $cuerpo.addEventListener('wheel', onRueda, { passive: false });
    $cuerpo.addEventListener('pointermove', e => { ultimoPuntero = aMundo(e.clientX, e.clientY); });
    $cuerpo.addEventListener('dragover', e => { if (tieneArchivos(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    $cuerpo.addEventListener('drop', onSoltarArchivos);
    $nodos.addEventListener('click', onClicNodos);
    $nodos.addEventListener('input', onCampo);
    $nodos.addEventListener('change', onCampo);
    /* al salir de un campo se vuelca y se repinta; pero no si el foco va a un botón de un nodo (▶, «Fórmula», la × de un chip…):
       repintar rehacía el nodo entre el `mousedown` y el `mouseup` y el clic se perdía (1.1.60: escribir en «Qué escribir» y pulsar
       ▶ sin más). Lo que haga ese botón ya repinta. */
    $nodos.addEventListener('focusout', e => {
      if (!(e.target.matches && e.target.matches('.lz-md, .lz-instr, .lz-opts input, input.lz-alt'))) return;
      volcar();
      const a = e.relatedTarget;
      if (a && a.closest && a.closest('[data-lz-nodo]') && a.closest('button, [role="button"]')) return;
      setTimeout(() => { if (m && !esCampo(document.activeElement) && !pulsandoNodo) pintar(); }, 0);
    });
    $nodos.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('[data-lz-nodo] button')) { pulsandoNodo = true; const fin = () => { setTimeout(() => { pulsandoNodo = false; }, 0); window.removeEventListener('pointerup', fin, true); window.removeEventListener('pointercancel', fin, true); }; window.addEventListener('pointerup', fin, true); window.addEventListener('pointercancel', fin, true); } }, true);
    $sec.addEventListener('click', onClicSeccion);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onTecla, true);
    window.addEventListener('keyup', e => { if (e.key === ' ' && espacio) { espacio = false; $cuerpo.classList.remove('espacio'); } }, true);
    window.addEventListener('blur', () => { espacio = false; if ($cuerpo) $cuerpo.classList.remove('espacio'); });
    document.addEventListener('copy', e => onPortapapeles(e, 'copy'));
    document.addEventListener('cut', e => onPortapapeles(e, 'cut'));
    document.addEventListener('paste', e => onPortapapeles(e, 'paste'));
    document.addEventListener('pointerdown', e => { if (menuAbierto && !menuAbierto.contains(e.target)) cerrarMenu(); }, true);
    /* el marco escondido no tiene tamaño: «Encajar» espera a que se vea */
    new ResizeObserver(() => { if (encajarAlVer && $cuerpo.clientWidth > 0) { encajarAlVer = false; encajar(false); } else aplicarVista(); }).observe($cuerpo);
    /* el tema cambia los colores de los segmentos y los personajes (van por CSS) y el brillo de los cables: nada que repintar */
    iniciado = true;
    return true;
  }

  /* `ganchos`: guardar(datos), avisar(msg, accion), docs(), abrir(ref), copiarEnlace(refs), pedirAClaude(texto, que),
     alVista(v), vista (la que se dejó, opcional) y proyecto() (el nombre de los enlaces, opcional). */
  function montar(id, ganchos) {
    if (!iniciar() || !L()) return false;
    oirEquipo();
    volcar();
    g = ganchos || {};
    const d = docs(), r = d && d.lienzo ? d.lienzo(id) : null;
    if (!r) { desmontar(); return false; }
    lid = id;
    m = new (L())(clonar(r.lienzo), d && d.idNuevo ? { idNuevo: () => d.idNuevo() } : undefined);
    sel.clear(); cableSel = null; els.clear(); $nodos.textContent = ''; $svg.textContent = '';
    hist = historiales.get(lid);
    if (!hist) { hist = new Tramas.Historial(100); historiales.set(lid, hist); }
    hist.reiniciar(json());                       // deshacer no cruza de una apertura a otra: lo de fuera pudo cambiar
    const v = g.vista || r.lienzo.vista;
    pintar();
    if (v && isFinite(+v.x)) { vista = { x: +v.x, y: +v.y, zoom: clamp(+v.zoom || 1, ZMIN, ZMAX) }; aplicarVista(); }
    else if ($cuerpo.clientWidth > 0) encajar(false); else { encajarAlVer = true; vista = { x: 40, y: 40, zoom: 1 }; aplicarVista(); }
    botonesHistoria();
    return true;
  }
  function desmontar() {
    volcar();
    cerrarMenu();
    m = null; lid = null; sel.clear(); cableSel = null; els.clear();
    if ($nodos) $nodos.textContent = '';
    if ($svg) $svg.textContent = '';
    if ($vacio) $vacio.hidden = true;
  }
  /* tras un cambio de fuera (Claude, renombrar): relee los datos guardados; entra en Deshacer como un paso */
  function refrescar() {
    if (!m) return;
    const d = docs(), r = d && d.lienzo(lid);
    if (!r) { desmontar(); return; }
    const antes = json();
    m = new (L())(clonar(r.lienzo), d.idNuevo ? { idNuevo: () => d.idNuevo() } : undefined);
    [...sel].forEach(id => { if (!m.nodo(id)) sel.delete(id); });
    if (cableSel && !m.cable(cableSel)) cableSel = null;
    if (json() !== antes) hist.registrar(json());
    pintar(); botonesHistoria();
  }

  /* ====================================================================
     Guardar e historial
     ==================================================================== */
  /* un cambio hecho en el modelo: al historial y, si cambió algo, a guardar */
  function cambio(sinPintar) {
    if (!m) return;
    clearTimeout(tEscribir); tEscribir = null;
    const j = json();
    if (hist.registrar(j)) guardarYa(j);
    if (!sinPintar) pintar();
    botonesHistoria();
  }
  function guardarYa(j) {
    if (!g.guardar) return;
    const r = g.guardar(JSON.parse(j || json()));
    if (r && r.ok === false && r.aviso) avisar(r.aviso);
  }
  let tEscribir = null;
  /* lo que se escribe (instrucción, texto, opciones) va al modelo al momento y a guardar a los 400 ms */
  function escrito() { clearTimeout(tEscribir); tEscribir = setTimeout(() => { tEscribir = null; cambio(true); pintarEstados(); }, 400); }
  /* lo que espera para guardarse —lo escrito (400 ms), lo movido con las flechas (350 ms)— y la vista, ya: antes de desmontar,
     de cambiar de lienzo, de deshacer, de cerrar o de que Claude lea */
  function volcar() {
    const pend = !!(tEscribir || tFlechas);
    clearTimeout(tEscribir); tEscribir = null; clearTimeout(tFlechas); tFlechas = null;
    if (pend && m) cambio(true);
    if (tVista) { clearTimeout(tVista); tVista = null; if (g.alVista && m) g.alVista(vistaRedonda()); }
  }
  function cargar(j) {
    m = new (L())(JSON.parse(j), docs() && docs().idNuevo ? { idNuevo: () => docs().idNuevo() } : undefined);
    [...sel].forEach(id => { if (!m.nodo(id)) sel.delete(id); });
    if (cableSel && !m.cable(cableSel)) cableSel = null;
  }
  function deshacer() {
    if (!m) return;
    volcar();
    const j = hist.deshacer();
    if (!j) { avisar('No hay nada que deshacer'); return; }
    cargar(j); guardarYa(j); pintar(); botonesHistoria(); avisar('Deshecho');
  }
  function rehacer() {
    if (!m) return;
    volcar();
    const j = hist.rehacer();
    if (!j) { avisar('No hay nada que rehacer'); return; }
    cargar(j); guardarYa(j); pintar(); botonesHistoria(); avisar('Rehecho');
  }
  /* «Deshacer» del aviso: vuelve a una foto de antes, sin depender del historial. **La foto es de su lienzo**: el aviso sigue a la
     vista unos segundos y, si entretanto se pasó a otro lienzo (o se salió del lienzo), no se carga en el de delante —lo pisaría
     y lo guardaría—: se escribe en el suyo con sus propios ganchos (el `guardar` de app.js sabe de qué lienzo es) y se dice. */
  const deshacerA = (antes, msg) => {
    const suyo = lid, gs = g;
    return { texto: 'Deshacer', fn: () => {
      if (m && lid === suyo) { volcar(); cargar(antes); cambio(); if (msg) avisar(msg); return; }
      const d = gs.docs ? gs.docs() : null, r = d && d.lienzo ? d.lienzo(suyo) : null;
      if (!r) { avisar('Ese lienzo ya no existe: no hay nada que deshacer'); return; }
      const x = gs.guardar ? gs.guardar(JSON.parse(antes)) : null;
      if (x && x.ok === false) { avisar(x.aviso || 'No se pudo deshacer'); return; }
      const h = historiales.get(suyo); if (h) h.registrar(antes);
      avisar('Deshecho en el lienzo «' + r.lienzo.nombre + '»');
    } };
  };
  function botonesHistoria() {
    const u = $('lzDeshacer'), r = $('lzRehacer');
    if (u) u.disabled = !hist || !hist.puedeDeshacer();
    if (r) r.disabled = !hist || !hist.puedeRehacer();
  }

  /* ====================================================================
     La vista: desplazamiento y zoom
     ==================================================================== */
  const ZMIN = 0.2, ZMAX = 2.5;
  const PASOS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5];
  function aMundo(cx, cy) {
    const r = $cuerpo.getBoundingClientRect();
    return { x: (cx - r.left - vista.x) / vista.zoom, y: (cy - r.top - vista.y) / vista.zoom };
  }
  function aplicarVista() {
    if (!$mundo) return;
    $mundo.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`;
    const paso = 24 * vista.zoom;
    $cuerpo.style.setProperty('--lz-paso', paso + 'px');
    $cuerpo.style.setProperty('--lz-px', vista.x + 'px');
    $cuerpo.style.setProperty('--lz-py', vista.y + 'px');
    if ($pct) $pct.textContent = Math.round(vista.zoom * 100) + ' %';
    if ($pct) $pct.classList.toggle('on', Math.abs(vista.zoom - 1) > 0.005);
  }
  let tVista = null;
  const vistaRedonda = () => ({ x: Math.round(vista.x), y: Math.round(vista.y), zoom: Math.round(vista.zoom * 1000) / 1000 });
  function vistaCambiada() {
    aplicarVista();
    clearTimeout(tVista);
    tVista = setTimeout(() => { tVista = null; if (g.alVista && m) g.alVista(vistaRedonda()); }, 250);
  }
  /* el zoom con el punto de pantalla (cx, cy) quieto */
  function zoomEn(nuevo, cx, cy) {
    nuevo = clamp(nuevo, ZMIN, ZMAX);
    const r = $cuerpo.getBoundingClientRect();
    const px = cx === undefined ? r.width / 2 : cx - r.left, py = cy === undefined ? r.height / 2 : cy - r.top;
    const wx = (px - vista.x) / vista.zoom, wy = (py - vista.y) / vista.zoom;
    vista.zoom = nuevo; vista.x = px - wx * nuevo; vista.y = py - wy * nuevo;
    vistaCambiada();
  }
  function paso(dir) {
    const z = vista.zoom;
    const n = dir > 0 ? PASOS.find(p => p > z + 0.001) : [...PASOS].reverse().find(p => p < z - 0.001);
    animarZoom(n || (dir > 0 ? ZMAX : ZMIN));
  }
  function animarZoom(dest) {
    const r = $cuerpo.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const z0 = vista.zoom, t0 = performance.now();
    const f = t => { const k = Math.min(1, (t - t0) / 160), e = 1 - Math.pow(1 - k, 3); zoomEn(z0 + (dest - z0) * e, cx, cy); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  /* la vista a `dest` con una transición corta */
  function animarVista(dest, dur) {
    const a = Object.assign({}, vista), t0 = performance.now(), D = dur || 240;
    const f = t => {
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      vista = { x: a.x + (dest.x - a.x) * e, y: a.y + (dest.y - a.y) * e, zoom: a.zoom + (dest.zoom - a.zoom) * e };
      vistaCambiada();
      if (k < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  /* la caja de unos nodos en el mundo */
  function cajaDe(ids) {
    const ns = (ids ? ids.map(id => m.nodo(id)) : nodos()).filter(Boolean);
    if (!ns.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ns.forEach(n => {
      const el = els.get(n.id), w = el ? el.offsetWidth : anchoDe(n), h = el ? el.offsetHeight : 160;
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
    });
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  function encajar(animado, ids) {
    if (!m || !$cuerpo) return;
    const W = $cuerpo.clientWidth, H = $cuerpo.clientHeight; if (!W || !H) { encajarAlVer = true; return; }
    const c = cajaDe(ids);
    let dest;
    if (!c) dest = { zoom: 1, x: W / 2 - 150, y: H / 2 - 100 };
    else {
      const M = 70, z = clamp(Math.min((W - M * 2) / c.w, (H - M * 2) / c.h, 1), ZMIN, ZMAX);
      dest = { zoom: z, x: W / 2 - (c.x0 + c.w / 2) * z, y: H / 2 - (c.y0 + c.h / 2) * z };
    }
    if (animado) animarVista(dest); else { vista = dest; vistaCambiada(); }
  }
  /* la rueda: con Ctrl (o el pellizco del trackpad) acerca y aleja; sin él, desplaza */
  let pellizco = null;
  function onRueda(e) {
    if (!m) return;
    if (!e.ctrlKey) {
      const s = e.target.closest && e.target.closest('.lz-md, textarea, .lz-elige-lista');
      if (s && s.scrollHeight > s.clientHeight + 1) return;           // un campo largo se desplaza él
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : 1;
      let dx = e.deltaX * k, dy = e.deltaY * k;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      vista.x -= dx; vista.y -= dy; vistaCambiada();
      return;
    }
    e.preventDefault();
    if (arr) return;
    if (!pellizco) { pellizco = { delta: 0, x: e.clientX, y: e.clientY }; requestAnimationFrame(aplicarPellizco); }
    pellizco.delta += clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -30, 30);
    pellizco.x = e.clientX; pellizco.y = e.clientY;
  }
  function aplicarPellizco() {
    const p = pellizco; pellizco = null; if (!p || !m) return;
    zoomEn(vista.zoom * Math.exp(-p.delta * 0.01), p.x, p.y);
  }
  /* centrar un nodo (y elegirlo) */
  function ir(id) {
    if (!m || !m.nodo(id)) return false;
    sel.clear(); sel.add(id); cableSel = null; pintarSel();
    const n = m.nodo(id), el = els.get(id), W = $cuerpo.clientWidth, H = $cuerpo.clientHeight;
    const w = el ? el.offsetWidth : anchoDe(n), h = el ? el.offsetHeight : 160, z = Math.max(vista.zoom, 0.8);
    if (W && H) animarVista({ zoom: z, x: W / 2 - (n.x + w / 2) * z, y: H / 2 - (n.y + h / 2) * z }, 320);
    if (el) { el.classList.remove('destello'); void el.offsetWidth; el.classList.add('destello'); }
    return true;
  }

  /* ====================================================================
     Pintar
     ==================================================================== */
  const anchoDe = n => n.w || (esOp(n) ? ANCHO_OP : ANCHO[n.tipo] || 250);
  function pintar() {
    if (!m || !$nodos) return;
    firmaCache = firma();
    const vivos = new Set();
    const activo = document.activeElement;
    nodos().forEach(n => {
      vivos.add(n.id);
      let el = els.get(n.id);
      const html = htmlNodo(n);
      if (!el) {
        el = document.createElement('div');
        el.dataset.lzNodo = n.id;
        els.set(n.id, el); $nodos.appendChild(el);
        el.classList.add('aparece'); setTimeout(() => el.classList.remove('aparece'), 260);
      }
      const clases = clasesNodo(n);
      /* lo que se está escribiendo no se rehace (se perdería el cursor); el pie de una operación sí, aparte (pintarEstados) */
      const escribiendo = activo && el.contains(activo) && esCampo(activo) && el._tipo === n.tipo;
      if (el._html !== html && !escribiendo) {
        el.innerHTML = html; el._html = html; el._tipo = n.tipo;
        prepararCampos(el, n);
      }
      el.className = clases + (el.classList.contains('aparece') ? ' aparece' : '');
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = anchoDe(n) + 'px';
      el.style.setProperty('--lz-c', colorTipo(n.tipo));
    });
    [...els.keys()].forEach(id => { if (!vivos.has(id)) { els.get(id).remove(); els.delete(id); sel.delete(id); } });
    pintarCables();
    pintarCabecera();
    pintarVacio();
  }
  function clasesNodo(n) {
    const t = TIPOS()[n.tipo], x = ['lz-nodo', t.familia === 'operacion' ? 'lz-op' : 'lz-ent', 'lz-t-' + n.tipo];
    if (sel.has(n.id)) x.push('sel');
    if (!esOp(n)) { const r = resolver(n); if (r && r.roto && !sinElegir(n)) x.push('roto'); }
    return x.join(' ');
  }
  /* una entrada que aún no apunta a nada (recién creada): no está rota, está por elegir */
  const sinElegir = n => ({ nota: !n.datos.notaId, segmento: !n.datos.subId, biblioteca: !n.datos.subId, esquema: !n.datos.eid, personaje: !n.datos.personajeId })[n.tipo] || false;
  const resolver = n => { const d = docs(); return d && d.resolverEntrada ? d.resolverEntrada(n) : null; };

  function htmlNodo(n) {
    const t = TIPOS()[n.tipo], op = t.familia === 'operacion', r = op ? resolver(n) : resolver(n);
    const tit = n.titulo || tituloAuto(n, r) || (!op && !sinElegir(n) && r && r.roto ? TIPOS()[n.tipo].nombre + ' que ya no está' : '');
    const cab = `<div class="lz-ncab" data-lz-asa><span class="lz-ic">${ic(ICONOS[n.tipo] || 'ic-lienzo', 13)}</span>`
      + `<span class="lz-ntxt"><span class="lz-clase">${op ? 'IA · ' : 'Entrada · '}${esc(t.nombre)}</span>`
      + `<span class="lz-tit${tit ? '' : ' vacio'}" data-lz-tit title="Doble clic para renombrar">${esc(tit || 'Sin elegir')}</span></span>`
      + `<button type="button" class="icono" data-lz-menu title="Más" aria-label="Más">${ic('ic-more', 15)}</button></div>`;
    const ins = op ? `<div class="lz-ins">${puertosHtml(n)}</div>` : '';
    const cuerpo = `<div class="lz-ncuerpo">${op ? cuerpoOp(n, r) : cuerpoEntrada(n, r)}</div>`;
    const pie = `<div class="lz-npie" style="--lz-outn:${letrasSalida(n)}">${op ? pieOp(n, r) : pieEntrada(n, r) + salidaHtml(n)}</div>`;
    return cab + ins + cuerpo + pie + '<div class="lz-asa-ancho" data-lz-ancho title="Arrastra para cambiar el ancho · doble clic: el de partida"></div>';
  }
  function tituloAuto(n, r) {
    if (esOp(n) || !r || r.roto) return esOp(n) ? TIPOS()[n.tipo].nombre : '';
    switch (n.tipo) {
      case 'nota': return r.nota.titulo;
      case 'segmento': return r.nombre;
      case 'biblioteca': return r.sub.nombre;
      case 'esquema': return r.esquema.nombre;
      case 'personaje': return r.personaje.nombre;
      case 'imagen': return r.alt || 'Imagen';
      case 'texto': return 'Texto';
    }
    return '';
  }
  const colorPuerto = p => (p.acepta.length === 1 ? `var(--t-${tonoClase(p.acepta[0])})` : 'var(--tenue)');
  function puertosHtml(n) {
    const t = TIPOS()[n.tipo], ent = m.entradasDe(n.id);
    return t.puertos.map(p => {
      const k = (ent[p.id] || []).length;
      return `<div class="lz-puerto lz-in${k ? ' lleno' : ''}" data-lz-in="${esc(p.id)}" style="--lz-pc:${colorPuerto(p)}"><span class="lz-dot" data-lz-punto="in"></span>`
        + `${esc(p.nombre)}<small>${p.uno ? (p.obligatorio ? 'uno · obligatorio' : 'uno') : 'varios'}</small>${k > 1 ? `<span class="lz-cuantos">${k}</span>` : ''}</div>`;
    }).join('');
  }
  const nombreSalida = n => TIPOS()[n.tipo].da.map(k => (CLASES()[k] ? CLASES()[k].nombre : k)).join(' · ');
  /* la etiqueta de la salida va encima del pie, en su primera fila, a la derecha y con el punto a su altura (css: `.lz-out`
     absoluto); el pie le deja sitio con `--lz-outn`, sus letras (1.1.61, de la revisión de ClapBook). En el flujo, cuando el pie no
     cabía en una fila la etiqueta bajaba a la segunda y su punto se quedaba arriba */
  const letrasSalida = n => nombreSalida(n).length;
  function salidaHtml(n) {
    const t = TIPOS()[n.tipo], da = nombreSalida(n);
    const k = m.salidasDe(n.id).length;
    return `<span class="lz-puerto lz-out${k ? ' lleno' : ''}" data-lz-out style="--lz-pc:var(--t-${tonoClase(t.da[0])})">${esc(da)}<span class="lz-dot" data-lz-punto="out" title="Arrastra para conectar"></span></span>`;
  }

  /* ---------- el cuerpo de una entrada: la vista previa de lo que apunta ---------- */
  const PAL = () => C.PALETA_ETIQUETAS || [];
  const par = i => { const p = PAL()[i] || PAL()[0]; return p ? `--chl:${p[1]};--chd:${p[2]}` : ''; };
  const extracto = (html, max) => { const t = C.conversor && C.conversor.textoPlano ? C.conversor.textoPlano(html || '') : String(html || '').replace(/<[^>]+>/g, ' '); return t.length > (max || 260) ? t.slice(0, max || 260).trim() + '…' : t; };
  const srcPropio = s => /^\s*(?:data:image\/|blob:)/i.test(String(s || ''));
  const imagenesDe = html => { const res = [], re = /<img\b[^>]*\bsrc="(data:image\/[^"]+)"/gi; let x; while ((x = re.exec(html || ''))) res.push(x[1]); return res; };
  const miniaturas = html => {
    const im = imagenesDe(html); if (!im.length) return '';
    return `<div class="lz-minis">${im.slice(0, 4).map(s => `<img src="${esc(s)}" alt="">`).join('')}${im.length > 4 ? `<span class="mas">+${im.length - 4}</span>` : ''}</div>`;
  };
  const palabras = html => { const t = extracto(html, 1e9); return t ? t.split(/\s+/).filter(Boolean).length : 0; };
  const cuenta = (k, uno, varios) => k + ' ' + (k === 1 ? uno : varios);
  function cuerpoEntrada(n, r) {
    const elegir = `<button type="button" class="lz-elegir" data-lz-elegir>${ic('ic-search', 13)}Elegir ${esc(TIPOS()[n.tipo].nombre.toLowerCase())}…</button>`;
    if (n.tipo === 'texto') return `<div class="lz-md" contenteditable="true" spellcheck="true" data-lz-md data-vacio="Una idea, una instrucción, un texto de referencia…"></div>`;
    if (n.tipo === 'imagen') {
      if (!n.datos.src) return `<button type="button" class="lz-elegir" data-lz-imagen>${ic('ic-imagen', 13)}Elegir una imagen…</button>`;
      /* solo una imagen del proyecto (data: o blob:): una dirección de fuera no se pide sola al pintar (1.1.61, revisión: la podía
         poner la IA con `editar_lienzo`, y el `<img>` hacía la petición sin que Leo hiciera nada) */
      if (!srcPropio(n.datos.src)) return `<div class="lz-roto">${ic('ic-aviso', 14)}<span>Una imagen de fuera del proyecto no se carga.</span></div><button type="button" class="lz-elegir" data-lz-imagen>${ic('ic-imagen', 13)}Elegir otra imagen…</button>`;
      return `<img class="lz-img" src="${esc(n.datos.src)}" alt="${esc(n.datos.alt)}" draggable="false" data-lz-ver><input type="text" class="lz-alt" data-lz-alt placeholder="Descripción (para Claude)" value="${esc(n.datos.alt)}">`;
    }
    if (sinElegir(n)) return elegir;
    if (!r || r.roto) return `<div class="lz-roto">${ic('ic-aviso', 14)}<span>${esc((r && r.motivo) || 'Lo que apuntaba ya no está')}. El nodo se queda: elige otro o bórralo.</span></div>`
      + `<button type="button" class="lz-elegir" data-lz-elegir>${ic('ic-search', 13)}Elegir otro…</button>`;
    switch (n.tipo) {
      case 'nota': {
        const nt = r.nota, ruta = [r.sub && r.sub.nombre, r.etiqueta ? r.etiqueta.nombre : 'Bandeja'].filter(Boolean).join(' › ');
        const txt = extracto(nt.html, 240);
        return `<div class="lz-fila">${nt.color ? `<span class="lz-punto" style="--c:var(--t-${esc(nt.color)})"></span>` : ''}<span class="lz-ruta">${esc(ruta)}</span></div>`
          + `<div class="lz-extracto${txt ? '' : ' vacio'}">${esc(txt || 'La nota está vacía')}</div>` + miniaturas(nt.html);
      }
      case 'segmento': {
        const k = r.notas.length;
        return `<div class="lz-seg${r.bandeja ? ' bandeja' : ''}" style="${r.etiqueta ? par(r.etiqueta.color) : ''}"><span>${esc(r.nombre)}</span><small>${cuenta(k, 'nota', 'notas')}</small></div>`
          + `<div class="lz-ruta">${esc(r.sub.nombre)}</div>`
          + (k ? `<ul class="lz-lista">${r.notas.slice(0, 4).map(x => `<li><span class="lz-punto" style="--c:${x.color ? 'var(--t-' + esc(x.color) + ')' : 'var(--regla-fuerte)'}"></span><span>${esc(x.titulo)}</span></li>`).join('')}${k > 4 ? `<li><span></span><span class="lz-meta">y ${k - 4} más</span></li>` : ''}</ul>` : '');
      }
      case 'biblioteca': {
        const etq = r.etiquetas, band = r.notas.filter(x => !x.etiquetaId).length;
        const filas = etq.slice(0, 6).map(e => `<li><span class="lz-punto par" style="${par(e.color)}"></span><span>${esc(e.nombre)}</span><small>${r.notas.filter(x => x.etiquetaId === e.id).length}</small></li>`).join('');
        return `<div class="lz-ruta">${esc(r.contenedor ? r.contenedor.nombre : '')}</div>`
          + `<ul class="lz-lista">${band ? `<li><span class="lz-punto" style="--c:var(--palido)"></span><span>Bandeja</span><small>${band}</small></li>` : ''}${filas}${etq.length > 6 ? `<li><span></span><span class="lz-meta">y ${etq.length - 6} segmentos más</span></li>` : ''}</ul>`
          + (!etq.length && !band ? '<div class="lz-extracto vacio">La biblioteca está vacía</div>' : '');
      }
      case 'esquema': {
        const doc = r.documento, pal = doc ? palabras(doc.html) : 0;
        return miniEsquema(r.esquema.datos) + `<span class="lz-guion${pal ? '' : ' sin'}">${ic('ic-script', 12)}${pal ? 'Guion · ' + cuenta(pal, 'palabra', 'palabras') : 'Aún sin guion'}</span>`;
      }
      case 'personaje': {
        const p = r.personaje, hoja = r.notas.length, ap = (r.apariciones || []).length, es = (r.esquemas || []).length;
        return `<div class="lz-per"><span class="gd-chip per-chip" style="${par(p.color)}">${esc(C.iniciales ? C.iniciales(p.nombre) : p.nombre.slice(0, 2))}</span><b>${esc(p.nombre)}</b></div>`
          + `<div class="lz-meta">Hoja: <b>${cuenta(hoja, 'nota', 'notas')}</b> · ${cuenta(ap, 'aparición', 'apariciones')}${es ? ' · ' + cuenta(es, 'esquema', 'esquemas') : ''}</div>`
          + (r.biblioteca && r.notas[0] ? `<div class="lz-extracto">${esc(extracto(r.notas[0].html, 160) || r.notas[0].titulo)}</div>` : '');
      }
    }
    return '';
  }
  /* el esquema en miniatura: los actos arriba, cada trama una raya con sus nodos, y los saltos */
  const normalizados = new WeakMap();             // los datos de un esquema, en la forma de ahora (columnas globales), una vez
  function miniEsquema(dt0) {
    if (!dt0) return '';
    let dt = normalizados.get(dt0);
    if (!dt) { try { dt = window.Tramas && Tramas.normalizar ? Tramas.normalizar(clonar(dt0)) : dt0; } catch (_) { dt = dt0; } normalizados.set(dt0, dt); }
    const lineas = (dt.lineas || []).filter(l => !l.oculta).slice(0, 7), puntos = dt.puntos || [];
    const cols = Math.max(dt.columnas || 0, ...puntos.map(p => (p.col || 0) + 1), 8);
    const W = 240, fila = 11, top = 12, H = top + Math.max(1, lineas.length) * fila + 5;
    const x = c => 6 + (c + 0.5) * (W - 12) / cols, y = i => top + i * fila + fila / 2;
    const fondos = (window.Tramas && Tramas.fondoEfectivo) || ((a, i) => a.fondo);
    const actos = (dt.actos || []).map((a, i) => { const f = fondos(a, i); return f && f !== 'ninguno' ? `<rect x="${x(a.desde || 0) - (W - 12) / cols / 2}" y="2" width="${(a.celdas || 1) * (W - 12) / cols}" height="6" rx="2" style="fill:var(--f-${f})"/>` : ''; }).join('');
    const filas = lineas.map((l, i) => `<line x1="6" x2="${W - 6}" y1="${y(i)}" y2="${y(i)}" style="stroke:var(--t-${esc(l.color)});stroke-opacity:.45" stroke-width="1.4"/>`).join('');
    const fi = new Map(lineas.map((l, i) => [l.id, i]));
    const saltos = (dt.saltos || []).map(s => { const a = puntos.find(p => p.id === s.deId), b = puntos.find(p => p.id === s.aId); if (!a || !b || !fi.has(a.lineaId) || !fi.has(b.lineaId)) return ''; return `<line x1="${x(a.col)}" x2="${x(b.col)}" y1="${y(fi.get(a.lineaId))}" y2="${y(fi.get(b.lineaId))}" style="stroke:var(--escena-trazo)" stroke-width="1" stroke-dasharray="2 2"/>`; }).join('');
    const dots = puntos.filter(p => fi.has(p.lineaId)).map(p => { const l = lineas[fi.get(p.lineaId)]; return `<circle cx="${x(p.col || 0)}" cy="${y(fi.get(p.lineaId))}" r="2.4" style="fill:var(--t-${esc(p.color || l.color)})${p.cortado ? ';opacity:.35' : ''}"/>`; }).join('');
    const resto = (dt.lineas || []).filter(l => !l.oculta).length - lineas.length;
    return `<svg class="lz-mini-esq" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${actos}${filas}${saltos}${dots}</svg>`
      + `<div class="lz-meta">${cuenta((dt.lineas || []).length, 'trama', 'tramas')} · ${cuenta((dt.actos || []).length, 'acto', 'actos')} · ${cuenta(puntos.length, 'nodo', 'nodos')}${resto > 0 ? ` · ${resto} tramas más` : ''}</div>`;
  }
  function pieEntrada(n, r) {
    if (n.tipo === 'texto' || n.tipo === 'imagen' || sinElegir(n) || !r || r.roto) return '';
    return `<span class="lz-cuando">Doble clic: abrir</span>`;
  }

  /* ---------- el cuerpo de una operación: instrucción, opciones y destino ---------- */
  function cuerpoOp(n) {
    const t = TIPOS()[n.tipo], d = n.datos, filas = [];
    if (n.tipo === 'generar') filas.push(`<label>Modo</label><span class="lz-seg-ctl"><button type="button" data-lz-modo="guion" class="${d.modo !== 'prosa' ? 'on' : ''}">Guion</button><button type="button" data-lz-modo="prosa" class="${d.modo === 'prosa' ? 'on' : ''}">Prosa</button></span>`);
    if (n.tipo === 'partir') filas.push(`<label for="lz-s-${esc(n.id)}">Máximo</label><span class="lz-fila"><input type="number" id="lz-s-${esc(n.id)}" min="3" max="120" step="1" data-lz-dato="segundos_max" value="${esc(d.segundos_max)}" style="width:70px"><span class="lz-meta">segundos por fragmento</span></span>`);
    if (n.tipo === 'reescribir') filas.push(`<label>Tono</label><input type="text" data-lz-dato="tono" value="${esc(d.tono)}" placeholder="más seco, cómico, noir…">`);
    if (n.tipo === 'traducir') filas.push(`<label>Idioma</label><input type="text" data-lz-dato="idioma" value="${esc(d.idioma)}" placeholder="Inglés" list="lz-idiomas">`);
    filas.push(destinoHtml(n));
    const faltan = m.faltan(n.id).filter(f => f.que !== 'previa');
    const conFx = Array.isArray(d.formulas) && d.formulas.length;
    return `<textarea class="lz-instr" data-lz-dato="instruccion" rows="2" placeholder="${esc(conFx ? PLACEHOLDER_FX : PLACEHOLDER[n.tipo] || 'Instrucción')}">${esc(d.instruccion || '')}</textarea>`
      + `<div class="lz-fx">${formulasBoton(n)}${duendesBoton(n)}${formulasChips(n)}<span class="lz-dn-chips">${duendesChips(n)}</span></div>`
      + `<div class="lz-opts">${filas.join('')}</div>`
      + (faltan.length ? `<div class="lz-falta">${ic('ic-aviso', 12)}<span>${esc(faltan.map(f => f.aviso).join(' · '))}</span></div>` : '')
      + (n.tipo === 'traducir' ? `<datalist id="lz-idiomas">${IDIOMAS.map(i => `<option value="${i}">`).join('')}</datalist>` : '');
  }
  function contenedoresVisibles() { const d = docs(); if (!d) return []; const L2 = d.contenedores(); return [...L2.fijados, ...L2.sueltos]; }
  function destinoHtml(n) {
    const t = TIPOS()[n.tipo], d = docs(), dst = n.datos.destino, P = t.destinos || [];
    if (!d || !P.length) return '';
    const val = !dst ? '' : dst.enSitio ? 'sitio' : dst.nuevo ? 'nuevo' : dst.eid ? 'e:' + dst.eid : dst.subId ? 'b:' + dst.subId : '';
    const nuevoEs = t.nuevoEs === 'esquema' ? 'Un esquema nuevo…' : 'Una biblioteca nueva…';
    let o = `<option value=""${val === '' ? ' selected' : ''}>Lo decide Claude</option>`;
    if (P.includes('enSitio')) o += `<option value="sitio"${val === 'sitio' ? ' selected' : ''}>En su sitio (una versión nueva)</option>`;
    if (P.includes('nuevo')) o += `<option value="nuevo"${val === 'nuevo' ? ' selected' : ''}>${nuevoEs}</option>`;
    let hay = false;
    contenedoresVisibles().forEach(c => {
      const ops = [];
      if (P.includes('eid')) d.esquemasDe(c.id).forEach(e => ops.push(`<option value="e:${esc(e.id)}"${val === 'e:' + e.id ? ' selected' : ''}>${n.tipo === 'prompt' ? 'Guion de ' : ''}${esc(e.nombre)}</option>`));
      if (P.includes('subId')) d.subsDe(c.id).forEach(s => ops.push(`<option value="b:${esc(s.id)}"${val === 'b:' + s.id ? ' selected' : ''}>${n.tipo === 'prompt' ? 'Nota en ' : ''}${esc(s.nombre)}</option>`));
      if (ops.length) { hay = true; o += `<optgroup label="${esc(c.nombre)}">${ops.join('')}</optgroup>`; }
    });
    /* un destino que ya no está se dice, no se pierde */
    if ((val.startsWith('e:') && !d.esquema(dst.eid)) || (val.startsWith('b:') && !d.sub(dst.subId))) o += `<option value="${esc(val)}" selected>(ya no existe)</option>`;
    let nuevo = '';
    if (val === 'nuevo') {
      const cs = contenedoresVisibles(), cid = dst.nuevo.cid || '';
      nuevo = `<span class="lz-nuevo"><select data-lz-nuevo-cid aria-label="Contenedor"><option value=""${cid ? '' : ' selected'}>El contenedor del lienzo</option>${cs.map(c => `<option value="${esc(c.id)}"${cid === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`
        + `<input type="text" data-lz-nuevo-nombre value="${esc(dst.nuevo.nombre || '')}" placeholder="${t.nuevoEs === 'esquema' ? 'Nombre del esquema' : 'Nombre de la biblioteca'}"></span>`;
    }
    return `<label>Destino</label><select data-lz-destino>${o}</select>${nuevo}`;
  }
  /* ---------- el pie de una operación: estado, ▶ y lo que dio ---------- */
  function hace(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'ahora';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
  const MOTIVOS = { instruccion: 'cambió su instrucción o sus opciones', entradas: 'cambió lo que tiene conectado', contenido: 'cambió lo que traen sus entradas', cadena: 'una operación anterior no está al día' };
  /* «Ejecutar con IA» (1.1.59): con el asistente de ClapCraft (el gancho `ejecutarConIA` de app.js), la operación la hace la otra
     IA (DeepSeek) sin copiar nada; mientras, el nodo sigue pendiente con su pulso y dice «Con IA…» (`enCursoIA(lid)`: los nodos que
     está haciendo) y, al acabar, su `completar_nodo` lo deja hecho con su salida, como con Claude. */
  const conIA = () => !!(g && g.ejecutarConIA);
  function corriendoIA(id) { try { const s = g && g.enCursoIA ? g.enCursoIA(lid) : null; return !!s && s.includes(id); } catch (_) { return false; } }
  /* compacto (su icono e «IA»; lo demás, en el globo y para el lector de pantalla): con el nombre entero, el pie de una operación no
     cabía en una fila (1.1.61) */
  const botonIA = texto => conIA() ? `<button type="button" class="lz-pedir otra lz-ia" data-lz-ia title="${esc(texto || 'Ejecutar con IA')}: la hace el asistente de ClapCraft con la IA que configuraste (DeepSeek), sin copiar nada" aria-label="${esc(texto || 'Ejecutar con IA')}">${ic('ic-magia', 11)}IA</button>` : '';
  function pieOp(n, r) {
    const ev = m.estadoVisible(n.id, firmaCache);
    let est, boton;
    if (corriendoIA(n.id)) {
      est = `<span class="lz-estado pendiente" title="El asistente la está haciendo"><i></i>Con IA…</span>`;
      boton = `<button type="button" class="lz-pedir otra" data-lz-ia-ver title="Ver lo que hace en el asistente">Ver</button>`;
      return est + boton + salidaHtml(n) + salidasHtml(n, r);
    }
    /* (cuándo se pidió va en su globo: al lado no cabía en la fila con «Copiar encargo» e «IA») */
    if (ev === 'pendiente') { est = `<span class="lz-estado pendiente" title="Pedido ${esc(hace(n.pedido))}: pégale el encargo a Claude"><i></i>Pendiente</span>`; boton = `<button type="button" class="lz-pedir otra" data-lz-pedir title="Vuelve a copiar el encargo para Claude">${ic('ic-play', 10)}Copiar encargo</button>`; }
    else if (ev === 'hecho') { est = `<span class="lz-estado hecho">${ic('ic-check', 12)}Hecho</span><span class="lz-cuando">${esc(hace(n.hecho))}</span>`; boton = `<button type="button" class="lz-pedir otra" data-lz-pedir title="Pedir a Claude que lo haga otra vez">${ic('ic-play', 10)}Otra vez</button>`; }
    else if (ev === 'desactualizado') { const mo = m.desactualizado(n.id, firmaCache); est = `<span class="lz-estado viejo" title="Desactualizada: ${esc(MOTIVOS[mo] || '')}"><i></i>Desactualizada</span>`; boton = `<button type="button" class="lz-pedir" data-lz-pedir>${ic('ic-play', 10)}Rehacer</button>`; }
    else if (ev === 'error') { est = `<span class="lz-estado error"><i></i>Error</span>`; boton = `<button type="button" class="lz-pedir" data-lz-pedir>${ic('ic-play', 10)}Reintentar</button>`; }
    else { est = `<span class="lz-estado"><i></i>Sin pedir</span>`; boton = `<button type="button" class="lz-pedir" data-lz-pedir title="La deja pendiente y copia el encargo para Claude">${ic('ic-play', 10)}Pedir a Claude</button>`; }
    boton += botonIA(ev === 'hecho' ? 'Otra vez con IA' : ev === 'error' ? 'Reintentar con IA' : '');
    const err = ev === 'error' && n.error ? `<div class="lz-error">${esc(n.error)}</div>` : '';
    return est + boton + salidaHtml(n) + err + salidasHtml(n, r);
  }
  function salidasHtml(n, r) {
    const s = n.salida; if (!s || !r) return '';
    const chip = (sc, icono, texto, ref, roto) => `<button type="button" class="lz-sal${roto ? ' roto' : ''}" style="--sc:var(--t-${sc})"${roto ? ' disabled' : ` data-lz-abrir='${esc(JSON.stringify(ref))}'`} title="${esc(roto ? r.motivo || 'Ya no está' : 'Abrir')}">${ic(icono, 12)}<span>${esc(texto)}</span></button>`;
    let h = '';
    if (r.roto) h = chip('gris', 'ic-aviso', r.motivo || 'Lo que dio ya no está', null, true);
    else if (s.tipo === 'documento') h = chip('indigo', 'ic-script', 'Guion de «' + r.esquema.nombre + '»' + (r.version ? ' · ' + r.version.nombre : ''), { tipo: 'documento', esquema: s.eid });
    else if (s.tipo === 'esquema') h = chip('violeta', 'ic-board', 'Esquema «' + r.esquema.nombre + '»', { tipo: 'esquema', id: s.eid });
    else if (s.tipo === 'nota') h = chip('ambar', 'ic-nota', 'Nota «' + r.nota.titulo + '»', { tipo: 'nota', id: s.notaId });
    else if (s.tipo === 'fragmentos') {
      h = chip('verde', 'ic-tijera', cuenta(r.notas.length, 'fragmento', 'fragmentos') + ' en «' + r.sub.nombre + '»', s.etiquetaId ? { tipo: 'segmento', biblioteca: s.subId, id: s.etiquetaId } : { tipo: 'biblioteca', id: s.subId });
      if (r.notas[0]) h += chip('ambar', 'ic-nota', r.notas[0].titulo, { tipo: 'nota', id: r.notas[0].id });
      if (r.perdidas) h += `<span class="lz-cuando">${cuenta(r.perdidas, 'ya no está', 'ya no están')}</span>`;
    }
    const msg = s.mensaje ? `<div class="lz-mensaje">“${esc(s.mensaje)}”</div>` : '';
    return `<div class="lz-salidas">${h}</div>${msg}`;
  }
  /* solo el pie de las operaciones (lo que cambia al escribir la instrucción: desactualizada, lo que falta) */
  function pintarEstados() {
    if (!m) return;
    firmaCache = firma();
    nodos().filter(esOp).forEach(n => {
      const el = els.get(n.id); if (!el) return;
      const pie = el.querySelector('.lz-npie'), h = pieOp(n, resolver(n));
      if (pie && pie.innerHTML !== h) pie.innerHTML = h;
      const f = el.querySelector('.lz-falta'), faltan = m.faltan(n.id).filter(x => x.que !== 'previa').map(x => x.aviso).join(' · ');
      if (f && !faltan) f.remove();
      else if (f) f.lastElementChild.textContent = faltan;
      else if (faltan) { const o = el.querySelector('.lz-opts'); if (o) o.insertAdjacentHTML('afterend', `<div class="lz-falta">${ic('ic-aviso', 12)}<span>${esc(faltan)}</span></div>`); }
    });
    pintarCabecera();
  }
  /* lo que no cabe en el HTML: el texto con Markdown vivo */
  function prepararCampos(el, n) {
    const md = el.querySelector('[data-lz-md]');
    if (md) {
      if (window.MdVivo) { md.innerHTML = n.datos.md ? MdVivo.html(n.datos.md) : ''; MdVivo.vivo(md); } else md.textContent = n.datos.md || '';
    }
  }

  function pintarCabecera() {
    if (!$sec) return;
    const d = docs(), r = d && lid ? d.lienzo(lid) : null;
    const cont = $sec.querySelector('[data-lz-cont]'), nom = $sec.querySelector('[data-lz-nom]');
    if (cont) cont.textContent = r ? r.contenedor.nombre : '';
    if (nom) {
      nom.textContent = r ? r.lienzo.nombre : ''; nom.parentElement.title = r ? r.lienzo.nombre : '';
      /* con color propio, la etiqueta va de ese color (como en el árbol: `.per-chip` con su par de la paleta) */
      const chip = nom.parentElement, col = r && Number.isInteger(r.lienzo.color) && PAL()[r.lienzo.color] ? r.lienzo.color : null;
      chip.classList.toggle('per-chip', col !== null);
      chip.style.cssText = col !== null ? par(col) : '';
    }
    const ops = nodos().filter(esOp), pend = m ? m.pendientes().length : 0;
    const k = $sec.querySelector('[data-lz-cuenta]');
    if (k) k.innerHTML = m ? cuenta(nodos().length, 'nodo', 'nodos') + (pend ? ` · <b>${cuenta(pend, 'pendiente', 'pendientes')}</b>` : '') : '';
    const pt = $sec.querySelector('[data-lz-pedir-todo]'); if (pt) pt.disabled = !ops.length;
    /* «Ejecutar todo con IA» (1.1.59), junto a «Pedir todo»: solo con el asistente de ClapCraft */
    let it = $sec.querySelector('[data-lz-ia-todo]');
    if (!it && pt && conIA()) {
      pt.insertAdjacentHTML('afterend', `<button type="button" class="btn lz-pedir-todo lz-ia-todo" data-lz-ia-todo title="Deja pendientes todas las operaciones y las hace el asistente de ClapCraft con la IA que configuraste">${ic('ic-magia', 13)}Ejecutar todo con IA</button>`);
      it = pt.nextElementSibling;
    }
    if (it) { it.hidden = !conIA(); it.disabled = !ops.length || !!(g && g.enCursoIA && (g.enCursoIA(lid) || []).length); }
  }
  function pintarVacio() {
    if (!$vacio) return;
    const vacio = !!m && !nodos().length;
    $vacio.hidden = !vacio;
    if (vacio && !$vacio.firstChild) {
      $vacio.innerHTML = `<div class="lz-vacio-caja"><b>Un lienzo vacío</b><p>Pon aquí lo que ya tienes —notas, segmentos, bibliotecas, esquemas, personajes, imágenes o un texto— y conéctalo a una operación: Claude escribe el guion, lo parte en fragmentos o lo transforma, y el resultado vive en ClapCraft.</p><p>Arrastra piezas desde el menú, haz doble clic en el fondo o empieza aquí:</p>`
        + `<div class="lz-vacio-acc"><button type="button" class="btn" data-lz-crear="texto">${ic('ic-texto', 14)}Texto</button><button type="button" class="btn" data-lz-crear="nota">${ic('ic-nota', 14)}Nota</button><button type="button" class="btn" data-lz-crear="esquema">${ic('ic-board', 14)}Esquema</button><button type="button" class="btn" data-lz-crear="generar">${ic('ic-magia', 14)}Generar guion</button></div></div>`;
    }
  }

  /* ---------- cables ---------- */
  /* el centro de un punto, en el mundo */
  function centroDe(dot) {
    const r = dot.getBoundingClientRect(), b = $cuerpo.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - b.left - vista.x) / vista.zoom, y: (r.top + r.height / 2 - b.top - vista.y) / vista.zoom };
  }
  const puntoSalida = id => { const el = els.get(id); const d = el && el.querySelector('[data-lz-out] .lz-dot'); return d ? centroDe(d) : null; };
  const puntoEntrada = (id, p) => { const el = els.get(id); const d = el && el.querySelector(`[data-lz-in="${CSS.escape(p)}"] .lz-dot`); return d ? centroDe(d) : null; };
  function curva(a, b) {
    const dx = b.x - a.x, k = dx >= 0 ? clamp(dx * 0.5, 40, 200) : clamp(-dx * 0.6 + 60, 80, 260);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${(a.x + k).toFixed(1)} ${a.y.toFixed(1)} ${(b.x - k).toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  let provisional = null;                         // { a, b, color, cae } del cable que se arrastra
  function pintarCables() {
    if (!m || !$svg) return;
    const partes = [], pts = [];
    cables().forEach(c => {
      const a = puntoSalida(c.de), b = puntoEntrada(c.a, c.puerto); if (!a || !b) return;
      pts.push(a, b);
      const cl = m.claseCable(c.id), destino = m.nodo(c.a), origen = m.nodo(c.de);
      const fl = destino && destino.estado === 'pendiente' ? ' fluye' : '';
      const roto = origen && !esOp(origen) && !sinElegir(origen) && (resolver(origen) || {}).roto ? ' roto' : '';
      const d = curva(a, b);
      partes.push(`<g class="lz-cable-g${cableSel === c.id ? ' sel' : ''}${fl}${roto}" data-lz-cable="${esc(c.id)}" style="--lz-cc:var(--t-${tonoClase(cl)})"><path class="lz-cable-hit" d="${d}"/><path class="lz-cable" d="${d}"/></g>`);
    });
    if (provisional) { pts.push(provisional.a, provisional.b); partes.push(`<path class="lz-cable provisional${provisional.cae ? ' cae' : ''}" style="--lz-cc:${provisional.color}" d="${provisional.inverso ? curva(provisional.b, provisional.a) : curva(provisional.a, provisional.b)}"/>`); }
    /* el SVG cubre lo que dibuja (la parte que asoma de una caja de 1 px no recibe clics en todos los motores) */
    if (pts.length) {
      const x0 = Math.min(...pts.map(p => p.x)) - 300, y0 = Math.min(...pts.map(p => p.y)) - 300;
      const x1 = Math.max(...pts.map(p => p.x)) + 300, y1 = Math.max(...pts.map(p => p.y)) + 300;
      Object.assign($svg.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
      $svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    }
    $svg.innerHTML = partes.join('');
  }
  function pintarSel() {
    els.forEach((el, id) => el.classList.toggle('sel', sel.has(id)));
    $svg.querySelectorAll('[data-lz-cable]').forEach(x => x.classList.toggle('sel', x.dataset.lzCable === cableSel));
  }

  /* ====================================================================
     Puntero: arrastres de nodos, cables, ancho, desplazamiento y rectángulo
     ==================================================================== */
  let arr = null;                                  // el arrastre en marcha
  let soltarClic = false;
  const CAMPO = 'input, textarea, select, button, a, [contenteditable="true"], .lz-md, .lz-sal, .lz-elegir';
  function onDown(e) {
    if (!m) return;
    cerrarMenu();
    const t = e.target;
    soltarClic = false;
    /* el botón central o espacio: desplazar, estés donde estés */
    if (e.button === 1 || (e.button === 0 && espacio)) { e.preventDefault(); empezarPan(e); return; }
    if (e.button !== 0) return;                   // el derecho es del menú contextual
    const dot = t.closest('[data-lz-punto]');
    if (dot) { e.preventDefault(); empezarCable(e, dot); return; }
    const an = t.closest('[data-lz-ancho]');
    if (an) {
      e.preventDefault();
      const id = an.closest('[data-lz-nodo]').dataset.lzNodo, n = m.nodo(id);
      arr = { tipo: 'ancho', id, x0: e.clientX, w0: anchoDe(n), movido: false };
      document.body.classList.add('lz-arrastrando');
      return;
    }
    const cab = t.closest('[data-lz-cable]');
    if (cab) { e.preventDefault(); sel.clear(); cableSel = cab.dataset.lzCable; pintarSel(); $cuerpo.focus({ preventScroll: true }); return; }
    const nodoEl = t.closest('[data-lz-nodo]');
    if (nodoEl) {
      const id = nodoEl.dataset.lzNodo;
      if (t.closest(CAMPO) && !t.closest('[data-lz-tit]')) {   // en un campo: se elige sin mover
        if (!sel.has(id) || cableSel) { if (!e.shiftKey) sel.clear(); sel.add(id); cableSel = null; pintarSel(); }
        return;
      }
      e.preventDefault();
      if (document.activeElement && document.activeElement !== document.body && $nodos.contains(document.activeElement)) document.activeElement.blur();
      $cuerpo.focus({ preventScroll: true });
      cableSel = null;
      const yaEstaba = sel.has(id);
      if (e.shiftKey) { /* se decide al soltar: Mayús + clic suma o quita */ }
      else if (!yaEstaba) { sel.clear(); sel.add(id); }
      pintarSel();
      const ids = e.shiftKey && !yaEstaba ? [...sel, id] : [...sel];
      arr = { tipo: 'nodos', id, shift: e.shiftKey, yaEstaba, alt: e.altKey, x0: e.clientX, y0: e.clientY, ids, orig: new Map(ids.map(k => [k, { x: m.nodo(k).x, y: m.nodo(k).y }])), movido: false };
      return;
    }
    /* el fondo: con Mayús o Cmd, el rectángulo; si no, desplazar */
    e.preventDefault();
    $cuerpo.focus({ preventScroll: true });
    if (document.activeElement && $nodos.contains(document.activeElement)) document.activeElement.blur();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const b = $cuerpo.getBoundingClientRect();
      arr = { tipo: 'marq', x0: e.clientX - b.left, y0: e.clientY - b.top, suma: e.shiftKey, antes: new Set(sel), movido: false, el: null };
      $cuerpo.classList.add('eligiendo');
      return;
    }
    empezarPan(e, true);
  }
  function empezarPan(e, limpiar) {
    arr = { tipo: 'pan', x0: e.clientX, y0: e.clientY, vx: vista.x, vy: vista.y, movido: false, limpiar: !!limpiar };
    $cuerpo.classList.add('moviendo');
  }
  function onMove(e) {
    if (!arr) return;
    if (arr.tipo !== 'pan' && arr.tipo !== 'marq') vigilarBorde(e);
    const dxp = e.clientX - arr.x0, dyp = (e.clientY - (arr.y0 || 0));
    if (!arr.movido && Math.hypot(dxp, dyp) < 3) return;
    if (!arr.movido) empezarMovido(e);
    arr.movido = true;
    arr.ultimo = { x: e.clientX, y: e.clientY, alt: e.altKey };
    if (arr.tipo === 'pan') { vista.x = arr.vx + dxp; vista.y = arr.vy + dyp; vistaCambiada(); return; }
    if (arr.tipo === 'nodos') {
      const dx = (e.clientX + (arr.despl ? arr.despl.x : 0) - arr.x0) / vista.zoom, dy = (e.clientY + (arr.despl ? arr.despl.y : 0) - arr.y0) / vista.zoom;
      arr.dx = Math.round(dx); arr.dy = Math.round(dy);
      arr.ids.forEach(id => { const el = els.get(id), o = arr.orig.get(id); if (el && o) { el.style.left = (o.x + arr.dx) + 'px'; el.style.top = (o.y + arr.dy) + 'px'; } });
      pintarCablesProvisional();
      return;
    }
    if (arr.tipo === 'ancho') {
      const w = Math.round(clamp(arr.w0 + dxp / vista.zoom, 180, 900)); arr.w = w;
      const el = els.get(arr.id); if (el) el.style.width = w + 'px';
      pintarCablesProvisional();
      return;
    }
    if (arr.tipo === 'marq') { moverMarq(e); return; }
    if (arr.tipo === 'cable') { moverCable(e); return; }
  }
  function empezarMovido(e) {
    if (arr.tipo === 'nodos') {
      if (arr.shift && !arr.yaEstaba) { sel.add(arr.id); pintarSel(); }
      /* con Opción, lo que se arrastra es una copia y el original se queda */
      if (arr.alt) {
        const clip = m.copiar(arr.ids), r = clip && m.pegar(clip, clip.x0, clip.y0);
        if (r && r.ok) {
          pintar();
          const mapa = new Map(arr.ids.map((k, i) => [k, r.ids[i]]));
          arr.ids = r.ids; arr.orig = new Map(r.nodos.map(n => [n.id, { x: n.x, y: n.y }]));
          sel.clear(); r.ids.forEach(k => sel.add(k)); pintarSel();
          arr.duplicado = mapa;
        }
      }
      arr.ids.forEach(id => { const el = els.get(id); if (el) el.classList.add('arrastrado'); });
      document.body.classList.add('lz-arrastrando');
    }
  }
  /* mientras se arrastra, los cables siguen a los nodos (el modelo aún no sabe dónde están) */
  let tCab = 0;
  function pintarCablesProvisional() { if (tCab) return; tCab = requestAnimationFrame(() => { tCab = 0; pintarCables(); }); }
  function onUp(e) {
    pararBorde();
    if (!arr) return;
    const a = arr; arr = null;
    $cuerpo.classList.remove('moviendo', 'eligiendo', 'cableando');
    document.body.classList.remove('lz-arrastrando');
    if (a.tipo === 'pan') {
      if (!a.movido && a.limpiar && (sel.size || cableSel)) { sel.clear(); cableSel = null; pintarSel(); }
      return;
    }
    if (a.tipo === 'nodos') {
      a.ids.forEach(id => { const el = els.get(id); if (el) el.classList.remove('arrastrado'); });
      if (!a.movido) {
        if (a.shift) { if (a.yaEstaba) sel.delete(a.id); else sel.add(a.id); pintarSel(); }
        else if (sel.size > 1) { sel.clear(); sel.add(a.id); pintarSel(); }
        return;
      }
      soltarClic = true; setTimeout(() => { soltarClic = false; }, 0);
      if (a.duplicado) {
        /* el pegado ya estaba en su sitio de partida: se lleva adonde se soltó */
        m.moverNodos(a.ids, a.dx || 0, a.dy || 0);
        cambio(); avisar(cuenta(a.ids.length, 'nodo duplicado', 'nodos duplicados'));
        return;
      }
      m.moverNodos(a.ids, a.dx || 0, a.dy || 0);
      cambio();
      return;
    }
    if (a.tipo === 'ancho') {
      if (a.movido && a.w) { m.editarNodo(a.id, { w: a.w }); cambio(); }
      return;
    }
    if (a.tipo === 'marq') {
      if (a.el) a.el.remove();
      if (!a.movido) { if (!a.suma) { sel.clear(); cableSel = null; pintarSel(); } }
      else { soltarClic = true; setTimeout(() => { soltarClic = false; }, 0); }
      return;
    }
    if (a.tipo === 'cable') { soltarCable(e, a); return; }
  }
  /* cerca de un borde, el lienzo se desplaza solo (arrastrando nodos o un cable) */
  let tBorde = null, bordeEv = null;
  function vigilarBorde(e) {
    bordeEv = { x: e.clientX, y: e.clientY };
    if (!tBorde) tBorde = setInterval(pasoBorde, 16);
  }
  function pararBorde() { clearInterval(tBorde); tBorde = null; bordeEv = null; }
  function pasoBorde() {
    if (!arr || !bordeEv || !arr.movido) return;
    const b = $cuerpo.getBoundingClientRect(), B = 40;
    const v = d => (d < B ? Math.ceil((B - d) / B * 14) : 0);
    const dx = v(bordeEv.x - b.left) - v(b.right - bordeEv.x), dy = v(bordeEv.y - b.top) - v(b.bottom - bordeEv.y);
    if (!dx && !dy) return;
    vista.x += dx; vista.y += dy; vistaCambiada();
    if (arr.tipo === 'nodos') {
      arr.despl = arr.despl || { x: 0, y: 0 }; arr.despl.x -= dx; arr.despl.y -= dy;
      onMove({ clientX: bordeEv.x, clientY: bordeEv.y, altKey: false });
    } else if (arr.tipo === 'cable') moverCable({ clientX: bordeEv.x, clientY: bordeEv.y, target: document.elementFromPoint(bordeEv.x, bordeEv.y) });
  }
  function moverMarq(e) {
    const b = $cuerpo.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    if (!arr.el) { arr.el = document.createElement('div'); arr.el.className = 'lz-marq'; $cuerpo.appendChild(arr.el); }
    const x0 = Math.min(x, arr.x0), y0 = Math.min(y, arr.y0), w = Math.abs(x - arr.x0), h = Math.abs(y - arr.y0);
    Object.assign(arr.el.style, { left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
    const m0 = { x: (x0 - vista.x) / vista.zoom, y: (y0 - vista.y) / vista.zoom }, m1 = { x: (x0 + w - vista.x) / vista.zoom, y: (y0 + h - vista.y) / vista.zoom };
    sel.clear(); if (arr.suma) arr.antes.forEach(k => sel.add(k));
    cableSel = null;
    nodos().forEach(n => {
      const el = els.get(n.id), W = el ? el.offsetWidth : anchoDe(n), H = el ? el.offsetHeight : 120;
      if (n.x < m1.x && n.x + W > m0.x && n.y < m1.y && n.y + H > m0.y) sel.add(n.id);
    });
    pintarSel();
  }

  /* ---------- arrastrar un cable ---------- */
  function empezarCable(e, dot) {
    const nodoEl = dot.closest('[data-lz-nodo]'), id = nodoEl.dataset.lzNodo;
    const antes = json();
    let desde;                                       // { lado: 'out', id } o { lado: 'in', id, puerto }
    if (dot.dataset.lzPunto === 'out') desde = { lado: 'out', id };
    else {
      const p = dot.closest('[data-lz-in]').dataset.lzIn;
      const ya = cables().filter(c => c.a === id && c.puerto === p);
      if (ya.length) {                               // se suelta su último cable y se sigue arrastrando desde su origen
        const c = ya[ya.length - 1];
        m.desconectar(c.id);
        desde = { lado: 'out', id: c.de, quitado: { de: c.de, a: id, puerto: p } };
        pintar();
      } else desde = { lado: 'in', id, puerto: p };
    }
    /* lo que vale y lo que no */
    const posibles = new Set();
    if (desde.lado === 'out') m.compatibles(desde.id).forEach(x => posibles.add(x.nodo + '|' + x.puerto));
    else nodos().forEach(n => { if (m.puedeConectar(n.id, desde.id, desde.puerto).ok) posibles.add(n.id + '|out'); });
    els.forEach((el, nid) => {
      let alguno = false;
      el.querySelectorAll('[data-lz-in]').forEach(x => { const ok = desde.lado === 'out' && posibles.has(nid + '|' + x.dataset.lzIn); x.classList.toggle('posible', ok); x.classList.toggle('apagado', !ok); alguno = alguno || ok; });
      const o = el.querySelector('[data-lz-out]');
      if (o) { const ok = desde.lado === 'in' && posibles.has(nid + '|out'); o.classList.toggle('posible', ok); o.classList.toggle('apagado', !ok && !(desde.lado === 'out' && nid === desde.id)); alguno = alguno || ok; }
      el.classList.toggle('apagado', !alguno && nid !== desde.id);
    });
    const origen = desde.lado === 'out' ? puntoSalida(desde.id) : puntoEntrada(desde.id, desde.puerto);
    const tn = m.nodo(desde.id), color = desde.lado === 'out' ? `var(--t-${tonoClase(TIPOS()[tn.tipo].da[0])})` : 'var(--foco)';
    arr = { tipo: 'cable', desde, antes, posibles, x0: e.clientX, y0: e.clientY, movido: !!desde.quitado, origen };
    provisional = { a: origen, b: aMundo(e.clientX, e.clientY), color, inverso: desde.lado === 'in' };
    $cuerpo.classList.add('cableando');
    pintarCables();
  }
  /* el punto válido más cercano al puntero (se imanta a menos de 28 px de pantalla) */
  function puntoCerca(cx, cy) {
    let mejor = null, dm = 28;
    $nodos.querySelectorAll('.lz-puerto.posible .lz-dot').forEach(dot => {
      const r = dot.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < dm) { dm = d; mejor = dot; }
    });
    return mejor;
  }
  function moverCable(e) {
    /* justo encima de un puerto que no vale, no se imanta al de al lado: se ve que ahí no */
    const bajo = e.target && e.target.closest ? document.elementFromPoint(e.clientX, e.clientY) : null;
    const encimaMalo = bajo && bajo.closest && bajo.closest('.lz-puerto.apagado');
    const dot = encimaMalo ? null : puntoCerca(e.clientX, e.clientY);
    $nodos.querySelectorAll('.lz-puerto.cerca').forEach(x => x.classList.remove('cerca'));
    if (dot) dot.parentElement.classList.add('cerca');
    provisional.b = dot ? centroDe(dot) : aMundo(e.clientX, e.clientY);
    provisional.cae = !!dot;
    arr.dot = dot;
    pintarCablesProvisional();
  }
  function soltarCable(e, a) {
    /* donde se suelta manda (el último movimiento puede no haber llegado antes que el botón) */
    arr = a; moverCable({ clientX: e.clientX, clientY: e.clientY, target: document.elementFromPoint(e.clientX, e.clientY) }); arr = null;
    provisional = null;
    els.forEach(el => { el.classList.remove('apagado'); el.querySelectorAll('.posible, .apagado, .cerca').forEach(x => x.classList.remove('posible', 'apagado', 'cerca')); });
    const dot = a.dot;
    if (dot) {
      const destEl = dot.closest('[data-lz-nodo]'), nid = destEl.dataset.lzNodo;
      let r;
      if (a.desde.lado === 'out') {
        const p = dot.closest('[data-lz-in]').dataset.lzIn;
        if (a.desde.quitado && a.desde.quitado.a === nid && a.desde.quitado.puerto === p) { cargar(a.antes); pintar(); return; }   // vuelve adonde estaba
        r = m.conectar(a.desde.id, nid, p);
      } else r = m.conectar(nid, a.desde.id, a.desde.puerto);
      if (!r.ok) { cargar(a.antes); pintar(); avisar(r.aviso); return; }
      cambio();
      if (r.aviso) avisar(r.aviso);
      return;
    }
    /* en el vacío: si se soltó un cable que estaba, se queda quitado; si salía de una salida, «Añadir nodo» con lo que la acepta */
    if (a.desde.quitado) { cambio(); avisar('Cable quitado', deshacerA(a.antes)); return; }
    if (!a.movido || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 6) { pintarCables(); return; }
    pintarCables();
    if (a.desde.lado === 'out') menuAnadir(e.clientX, e.clientY, { desde: a.desde.id });
  }

  /* ====================================================================
     Clics, dobles clics y menús
     ==================================================================== */
  function onClicNodos(e) {
    if (!m) return;
    const t = e.target, nodoEl = t.closest('[data-lz-nodo]'); if (!nodoEl) return;
    const id = nodoEl.dataset.lzNodo, n = m.nodo(id); if (!n) return;
    if (t.closest('[data-lz-menu]')) { e.stopPropagation(); menuNodo(t.closest('[data-lz-menu]'), id); return; }
    if (t.closest('[data-lz-pedir]')) { pedir([id]); return; }
    if (t.closest('[data-lz-ia]')) { pedirIA([id]); return; }       // 1.1.59
    if (t.closest('[data-lz-ia-ver]')) { if (g.verIA) g.verIA(); return; }
    /* las fórmulas de la operación (1.1.60): elegir, quitar una, abrir una */
    if (t.closest('[data-lz-fx-elegir]')) { volcar(); elegirFormulas(id, t.closest('[data-lz-fx-elegir]')); return; }
    const fq = t.closest('[data-lz-fx-quitar]');
    if (fq) { const xs = (n.datos.formulas || []).slice(); xs.splice(+fq.dataset.lzFxQuitar, 1); ponerFormulas(id, xs); return; }
    const fa = t.closest('[data-lz-fx-abrir]');
    if (fa) { abrirFormula(fa.dataset.lzFxAbrir); return; }
    /* los duendes de la operación (1.1.68): elegir, quitar uno, actualizar su instantánea, abrir su ficha */
    if (t.closest('[data-lz-dn-elegir]')) { volcar(); elegirDuendes(id, t.closest('[data-lz-dn-elegir]')); return; }
    const dq = t.closest('[data-lz-dn-quitar]');
    if (dq) { const xs = (n.datos.duendes || []).slice(); xs.splice(+dq.dataset.lzDnQuitar, 1); ponerDuendes(id, xs); return; }
    const du = t.closest('[data-lz-dn-actualizar]');
    if (du) { actualizarDuende(id, +du.dataset.lzDnActualizar); return; }
    const da = t.closest('[data-lz-dn-abrir]');
    if (da) { abrirFicha(da.dataset.lzDnAbrir); return; }
    if (t.closest('[data-lz-elegir]')) { elegirRef(n.tipo, t.closest('[data-lz-elegir]'), ref => { m.editarNodo(id, { datos: ref }); cambio(); }); return; }
    if (t.closest('[data-lz-imagen]')) { elegirImagen(src => { m.editarNodo(id, { datos: { src } }); cambio(); }); return; }
    const ab = t.closest('[data-lz-abrir]');
    if (ab) { try { abrir(JSON.parse(ab.dataset.lzAbrir)); } catch (_) {} return; }
    const mo = t.closest('[data-lz-modo]');
    if (mo) { m.editarNodo(id, { datos: { modo: mo.dataset.lzModo } }); cambio(); return; }
  }
  /* lo que se escribe o se elige en un nodo */
  function onCampo(e) {
    if (!m) return;
    const t = e.target, nodoEl = t.closest('[data-lz-nodo]'); if (!nodoEl) return;
    const id = nodoEl.dataset.lzNodo, n = m.nodo(id); if (!n) return;
    if (t.matches('[data-lz-md]')) { if (e.type === 'input') { m.editarNodo(id, { datos: { md: window.MdVivo ? MdVivo.md(t) : t.innerText } }); escrito(); } return; }
    if (t.matches('[data-lz-alt]')) { if (e.type === 'input') { m.editarNodo(id, { datos: { alt: t.value } }); escrito(); } return; }
    if (t.matches('[data-lz-dato]')) {
      const k = t.dataset.lzDato;
      if (t.type === 'number') { if (e.type !== 'change') return; m.editarNodo(id, { datos: { [k]: +t.value } }); cambio(); return; }
      if (e.type === 'input') { m.editarNodo(id, { datos: { [k]: t.value } }); escrito(); }
      return;
    }
    if (t.matches('[data-lz-destino]') && e.type === 'change') {
      const v = t.value, contCid = (docs().lienzo(lid) || {}).contenedor;
      const dst = !v ? null : v === 'sitio' ? { enSitio: true } : v === 'nuevo' ? { nuevo: { cid: contCid ? contCid.id : null, nombre: '' } } : v.startsWith('e:') ? { eid: v.slice(2) } : v.startsWith('b:') ? { subId: v.slice(2) } : null;
      m.editarNodo(id, { datos: { destino: dst } }); cambio();
      if (v === 'nuevo') { const inp = els.get(id) && els.get(id).querySelector('[data-lz-nuevo-nombre]'); if (inp) inp.focus(); }
      return;
    }
    if (t.matches('[data-lz-nuevo-cid], [data-lz-nuevo-nombre]')) {
      const el = els.get(id), cid = el.querySelector('[data-lz-nuevo-cid]').value, nombre = el.querySelector('[data-lz-nuevo-nombre]').value;
      if (t.matches('select') && e.type !== 'change') return;
      if (t.matches('input') && e.type !== 'input') return;
      m.editarNodo(id, { datos: { destino: { nuevo: Object.assign(cid ? { cid } : {}, { nombre }) } } });
      if (t.matches('select')) cambio(); else escrito();
    }
  }
  function onClicSeccion(e) {
    const t = e.target;
    if (t.closest('[data-lz-anadir]')) { const b = t.closest('[data-lz-anadir]').getBoundingClientRect(); menuAnadir(b.left, b.bottom + 4, { centro: true, ancla: t.closest('[data-lz-anadir]') }); return; }
    const z = t.closest('[data-lz-zoom]');
    if (z) { const k = +z.dataset.lzZoom; if (k) paso(k); else animarZoom(1); return; }
    if (t.closest('[data-lz-encajar]')) { encajar(true); return; }
    if (t.closest('[data-lz-pedir-todo]')) { pedirTodo(); return; }
    if (t.closest('[data-lz-ia-todo]')) { pedirIA(null, true); return; }   // 1.1.59
    if (t.closest('#lzDeshacer')) { deshacer(); return; }
    if (t.closest('#lzRehacer')) { rehacer(); return; }
    const cr = t.closest('[data-lz-crear]');
    if (cr) { const b = $cuerpo.getBoundingClientRect(); crearTipo(cr.dataset.lzCrear, b.left + b.width / 2 - 130, b.top + b.height / 2 - 60, cr); }
  }
  function onDoble(e) {
    if (!m) return;
    const t = e.target;
    const tit = t.closest('[data-lz-tit]');
    if (tit) { renombrar(tit.closest('[data-lz-nodo]').dataset.lzNodo); return; }
    if (t.closest('[data-lz-asa-ancho], [data-lz-ancho]')) { const id = t.closest('[data-lz-nodo]').dataset.lzNodo; m.editarNodo(id, { w: 0 }); const n = m.nodo(id); delete n.w; cambio(); return; }
    const nodoEl = t.closest('[data-lz-nodo]');
    if (nodoEl) {
      if (t.closest(CAMPO)) return;
      const n = m.nodo(nodoEl.dataset.lzNodo); if (!n) return;
      if (n.tipo === 'imagen' && srcPropio(n.datos.src)) { verImagen(n); return; }
      if (n.tipo === 'texto') { const md = nodoEl.querySelector('[data-lz-md]'); if (md) { md.focus(); cursorAlFinal(md); } return; }
      if (!esOp(n)) abrirEntrada(n);
      return;
    }
    if (t.closest('[data-lz-cable]')) return;
    menuAnadir(e.clientX, e.clientY, {});
  }
  function onContexto(e) {
    if (!m) return;
    const t = e.target;
    if (t.closest('input, textarea, [contenteditable="true"]')) return;   // el menú del sistema (corregir, pegar…)
    e.preventDefault();
    const cab = t.closest('[data-lz-cable]');
    if (cab) { cableSel = cab.dataset.lzCable; sel.clear(); pintarSel(); menuCable(e.clientX, e.clientY, cableSel); return; }
    const nodoEl = t.closest('[data-lz-nodo]');
    if (nodoEl) { const id = nodoEl.dataset.lzNodo; if (!sel.has(id)) { sel.clear(); sel.add(id); cableSel = null; pintarSel(); } menuNodo({ x: e.clientX, y: e.clientY }, id); return; }
    menuAnadir(e.clientX, e.clientY, { fondo: true });
  }
  function cursorAlFinal(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* ---------- los menús (con el aspecto de los del gestor, .gd-pop) ---------- */
  function cerrarMenu() { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }
  function abrirMenu(ancla, contenido, clase) {
    cerrarMenu();
    const el = document.createElement('div');
    el.className = 'gd-pop lz-menu' + (clase ? ' ' + clase : ''); el.setAttribute('role', 'menu');
    if (typeof contenido === 'string') el.innerHTML = contenido; else el.appendChild(contenido);
    document.body.appendChild(el);
    const W = innerWidth, H = innerHeight;
    let x, y;
    if (ancla && ancla.getBoundingClientRect) { const r = ancla.getBoundingClientRect(); x = r.left; y = r.bottom + 5; if (y + el.offsetHeight > H - 8) y = Math.max(8, r.top - el.offsetHeight - 5); }
    else { x = ancla.x; y = ancla.y; if (y + el.offsetHeight > H - 8) y = Math.max(8, H - 8 - el.offsetHeight); }
    if (x + el.offsetWidth > W - 8) x = W - 8 - el.offsetWidth;
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
    /* sus teclas (flechas, Enter, Esc) las atiende `teclaMenu`, desde el oyente en captura del lienzo */
    menuAbierto = el;
    return el;
  }
  const opcion = (html, fn, extra) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.innerHTML = html; if (extra && extra.clase) b.className = extra.clase; if (extra && extra.disabled) b.disabled = true; if (extra && extra.title) b.title = extra.title; b.addEventListener('click', () => { cerrarMenu(); fn(); }); return b; };
  const tituloMenu = t => Object.assign(document.createElement('div'), { className: 'gd-pop-tit', textContent: t });
  const sepMenu = () => Object.assign(document.createElement('div'), { className: 'gd-pop-sep' });
  const icMenu = tipo => `<span class="lz-ic-m${esOp({ tipo }) ? ' op' : ''}" style="--c:${colorTipo(tipo)}">${ic(ICONOS[tipo], 12)}</span>`;

  /* «Añadir nodo»: las dos familias. `op.desde`: se soltó un cable de ese nodo en el vacío (solo lo que lo acepta, y se conecta) */
  function menuAnadir(cx, cy, op) {
    if (!m) return;
    const o = op || {}, f = document.createDocumentFragment();
    const b = $cuerpo.getBoundingClientRect();
    const px = o.centro ? b.left + b.width / 2 - 130 : cx, py = o.centro ? b.top + b.height / 2 - 60 : cy;
    const T = TIPOS(), entradas = (L().ENTRADAS || []), ops = (L().OPERACIONES || []);
    const acepta = tipo => { if (!o.desde) return true; const p = (T[tipo].puertos || []).find(p => p.acepta.some(k => T[m.nodo(o.desde).tipo].da.includes(k))); return !!p; };
    const item = tipo => opcion(`${icMenu(tipo)}<span>${esc(T[tipo].nombre)}</span>`, () => crearTipo(tipo, px, py, null, o.desde), { title: T[tipo].descripcion || '' });
    if (!o.desde) { f.appendChild(tituloMenu('Entradas')); entradas.forEach(k => f.appendChild(item(k))); f.appendChild(sepMenu()); }
    f.appendChild(tituloMenu(o.desde ? 'Conectar con una operación' : 'Operaciones · las hace Claude'));
    ops.filter(acepta).forEach(k => f.appendChild(item(k)));
    if (o.fondo) {
      f.appendChild(sepMenu());
      f.appendChild(opcion(`${ic('ic-docs', 14)}<span>Pegar</span><small>Cmd V</small>`, () => pegarAqui(px, py), { disabled: !portapapeles }));
      f.appendChild(opcion(`${ic('ic-encajar', 14)}<span>Encajar</span><small>Mayús 1</small>`, () => encajar(true)));
      if (nodos().length) f.appendChild(opcion(`${ic('ic-check', 14)}<span>Elegir todo</span><small>Cmd A</small>`, () => { nodos().forEach(n => sel.add(n.id)); pintarSel(); }));
    }
    abrirMenu(o.ancla || { x: cx, y: cy }, f);
    const primero = menuAbierto && menuAbierto.querySelector('button'); if (primero) primero.focus({ preventScroll: true });
  }
  /* crea un nodo de ese tipo en (cx, cy) de pantalla; las entradas que apuntan a algo piden antes qué */
  function crearTipo(tipo, cx, cy, ancla, desde) {
    const w = aMundo(cx, cy), x = Math.round(w.x), y = Math.round(w.y);
    const hecho = (datos, op) => {
      const r = m.crearNodo(tipo, x, y, datos || {}); if (!r.ok) { avisar(r.aviso); return; }
      const id = r.nodo.id;
      if (desde) {
        const T = TIPOS(), da = T[m.nodo(desde).tipo].da, p = T[tipo].puertos.find(p => p.acepta.some(k => da.includes(k)));
        if (p) { const c = m.conectar(desde, id, p.id); if (!c.ok) avisar(c.aviso); }
        const a = puntoSalida(desde); if (a) { m.nodo(id).x = Math.round(Math.max(a.x + 60, x)); }
      }
      sel.clear(); sel.add(id); cableSel = null;
      cambio();
      const el = els.get(id);
      if (el) { const f = el.querySelector('[data-lz-md], .lz-instr'); if (f && (!op || op.enfocar !== false)) setTimeout(() => f.focus({ preventScroll: true }), 30); }
    };
    if (['nota', 'segmento', 'biblioteca', 'esquema', 'personaje'].includes(tipo)) { elegirRef(tipo, ancla || { x: cx, y: cy }, ref => hecho(ref)); return; }
    if (tipo === 'imagen') { elegirImagen(src => hecho({ src })); return; }
    hecho({});
  }
  function menuNodo(ancla, id) {
    const n = m.nodo(id); if (!n) return;
    const f = document.createDocumentFragment(), varios = sel.size > 1 && sel.has(id) ? [...sel] : [id];
    const op = esOp(n), ops = varios.filter(k => esOp(m.nodo(k)));
    if (varios.length > 1) {
      f.appendChild(tituloMenu(cuenta(varios.length, 'nodo elegido', 'nodos elegidos')));
      if (ops.length) f.appendChild(opcion(`${ic('ic-play', 12)}<span>Pedir a Claude (${ops.length})</span>`, () => pedir(ops)));
      if (ops.length && conIA()) f.appendChild(opcion(`${ic('ic-magia', 12)}<span>Ejecutar con IA (${ops.length})</span>`, () => pedirIA(ops)));
    } else if (op) {
      f.appendChild(opcion(`${ic('ic-play', 12)}<span>${n.estado === 'pendiente' ? 'Copiar el encargo otra vez' : 'Pedir a Claude'}</span>`, () => pedir([id])));
      if (conIA() && !corriendoIA(id)) f.appendChild(opcion(`${ic('ic-magia', 12)}<span>Ejecutar con IA</span>`, () => pedirIA([id])));
      if (n.estado === 'pendiente') f.appendChild(opcion(`${ic('ic-close', 14)}<span>Ya no está pedida</span>`, () => { const r = m.cancelar(id); if (r.ok) { cambio(); avisar('«' + m.nombre(id) + '» ya no está pendiente'); } }));
    } else if (!sinElegir(n) && n.tipo !== 'texto') {
      f.appendChild(opcion(`${ic('ic-expand', 14)}<span>Abrir</span><small>doble clic</small>`, () => abrirEntrada(n)));
      if (n.tipo === 'esquema') f.appendChild(opcion(`${ic('ic-script', 14)}<span>Abrir su guion</span>`, () => abrir({ tipo: 'documento', esquema: n.datos.eid })));
      if (['nota', 'segmento', 'biblioteca', 'esquema', 'personaje'].includes(n.tipo)) f.appendChild(opcion(`${ic('ic-search', 14)}<span>Cambiar por otra…</span>`, () => elegirRef(n.tipo, ancla, ref => { m.editarNodo(id, { datos: ref }); cambio(); })));
    }
    if (varios.length === 1) f.appendChild(opcion(`${ic('ic-edit', 14)}<span>Renombrar</span><small>doble clic</small>`, () => renombrar(id)));
    f.appendChild(sepMenu());
    if (g.copiarEnlace) f.appendChild(opcion(`${ic('ic-link', 14)}<span>Copiar enlace para Claude</span><small>Cmd ⇧ C</small>`, () => g.copiarEnlace(varios.map(k => ({ tipo: 'lienzo', id: lid, nodo: k })))));
    f.appendChild(opcion(`${ic('ic-plus', 14)}<span>Duplicar</span><small>Cmd D</small>`, () => duplicar(varios)));
    f.appendChild(opcion(`${ic('ic-trash', 14)}<span>${varios.length > 1 ? 'Eliminar los ' + varios.length : 'Eliminar'}</span><small>Supr</small>`, () => borrar(varios), { clase: 'peligro' }));
    abrirMenu(ancla, f);
  }
  function menuCable(cx, cy, cid) {
    const f = document.createDocumentFragment(), c = m.cable(cid); if (!c) return;
    const cl = m.claseCable(cid);
    f.appendChild(tituloMenu('Cable · ' + ((CLASES()[cl] || {}).nombre || '') + ' → ' + m.nombre(c.a)));
    f.appendChild(opcion(`${ic('ic-trash', 14)}<span>Quitar el cable</span><small>Supr</small>`, () => quitarCable(cid), { clase: 'peligro' }));
    abrirMenu({ x: cx, y: cy }, f);
  }

  /* ---------- elegir a qué apunta una entrada: una lista con buscador ---------- */
  function candidatos(tipo) {
    const d = docs(); if (!d) return [];
    const res = [], conts = contenedoresVisibles();
    const bibs = conts.flatMap(c => d.subsDe(c.id).map(s => ({ c, s })));
    if (tipo === 'nota') {
      bibs.forEach(({ c, s }) => d.notasDe(s.id).forEach(n => { const e = n.etiquetaId ? d.etiqueta(n.etiquetaId) : null; res.push({ ref: { notaId: n.id }, nombre: n.titulo, ruta: c.nombre + ' › ' + s.nombre + ' › ' + (e ? e.nombre : 'Bandeja'), mod: n.modificado || 0, punto: n.color ? `var(--t-${n.color})` : null }); }));
      res.sort((a, b) => b.mod - a.mod);
    } else if (tipo === 'segmento') {
      bibs.forEach(({ c, s }) => {
        res.push({ ref: { subId: s.id, etiquetaId: null }, nombre: 'Bandeja', ruta: c.nombre + ' › ' + s.nombre, grupo: s.nombre, cuenta: d.notasDe(s.id, null).length });
        d.etiquetasDe(s.id).forEach(e => res.push({ ref: { subId: s.id, etiquetaId: e.id }, nombre: e.nombre, ruta: c.nombre + ' › ' + s.nombre, grupo: s.nombre, cuenta: d.notasDe(s.id, e.id).length, chip: e.color }));
      });
    } else if (tipo === 'biblioteca') bibs.forEach(({ c, s }) => res.push({ ref: { subId: s.id }, nombre: s.nombre, ruta: c.nombre, grupo: c.nombre, cuenta: d.notasDe(s.id).length }));
    else if (tipo === 'esquema') {
      conts.forEach(c => d.esquemasDe(c.id).forEach(e => res.push({ ref: { eid: e.id }, nombre: e.nombre, ruta: c.nombre, grupo: c.nombre })));
      const pe = d.contenedor(C.ID_ESQUEMAS_PERSONAJE); if (pe) pe.esquemas.forEach(e => res.push({ ref: { eid: e.id }, nombre: e.nombre, ruta: 'Personajes', grupo: 'Esquemas de personaje' }));
    } else if (tipo === 'personaje') d.elenco().forEach(p => res.push({ ref: { personajeId: p.id }, nombre: p.nombre, ruta: 'Personaje', chip: p.color, per: true }));
    return res;
  }
  const plano = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function elegirRef(tipo, ancla, fn) {
    const lista = candidatos(tipo), T = TIPOS()[tipo];
    const caja = document.createElement('div'); caja.className = 'lz-elige';
    caja.innerHTML = `<div class="gd-pop-tit">Elegir ${esc(T.nombre.toLowerCase())}</div><input type="search" placeholder="Buscar" aria-label="Buscar"><div class="lz-elige-lista"></div>`;
    const campo = caja.querySelector('input'), $l = caja.querySelector('.lz-elige-lista');
    const pintarL = () => {
      const q = plano(campo.value), vistos = lista.filter(x => !q || plano(x.nombre + ' ' + x.ruta).includes(q)).slice(0, 200);
      $l.textContent = '';
      if (!vistos.length) { $l.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: lista.length ? 'Nada con ese nombre' : 'No hay ' + T.nombre.toLowerCase() + 's en el proyecto' })); return; }
      vistos.forEach(x => {
        const punto = x.per ? `<span class="gd-chip per-chip" style="${par(x.chip)};width:22px;height:22px;padding:0;justify-content:center;border-radius:50%;font-size:10px">${esc(C.iniciales ? C.iniciales(x.nombre) : '')}</span>`
          : x.chip !== undefined && x.chip !== null ? `<span class="lz-punto par" style="${par(x.chip)}"></span>` : `<span class="lz-ic-m" style="--c:${x.punto || colorTipo(tipo)}">${ic(ICONOS[tipo], 12)}</span>`;
        $l.appendChild(opcion(`${punto}<span><b>${esc(x.nombre)}</b><em>${esc(x.ruta)}</em></span>${x.cuenta !== undefined ? `<small>${x.cuenta}</small>` : ''}`, () => fn(x.ref)));
      });
    };
    campo.addEventListener('input', pintarL);
    campo.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const b = $l.querySelector('button'); if (b) b.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const b = $l.querySelector('button'); if (b) b.focus(); }
    });
    pintarL();
    abrirMenu(ancla, caja);
    setTimeout(() => campo.focus({ preventScroll: true }), 0);
  }
  /* ---------- las fórmulas de una operación (1.1.60) ----------
     Leo: «La idea es poder darle formato o tonos a los bloques de IA del lienzo, que se pueda escribir normalmente como ahora en
     "Qué escribir" o seleccionar directamente la "Fórmula" para que se ejecute la acción». Debajo de «Qué escribir», el botón
     «Fórmula» y un chip por cada una elegida (en orden, con su ×; su clic la abre en su ventana; si ya no existe, rota). La lista,
     con buscador, va agrupada por segmento de «Fórmulas»; se eligen varias sin cerrarla (el orden es el de elegirlas) y abajo
     «Nueva fórmula desde lo escrito…» (guarda como fórmula lo que dice «Qué escribir» y la elige) y «Administrar fórmulas…».
     En el modelo, `datos.formulas = [notaId…]` (lienzo-modelo.js); su texto cuenta en la huella (documentos.js), así que
     cambiarlo deja la operación desactualizada. */
  const ID_BIB_FX = () => C.ID_BIB_FORMULAS || 'formulas:biblioteca';
  const resolverFx = ids => { const d = docs(); return d && d.resolverFormulas ? d.resolverFormulas(ids || []) : (ids || []).map(id => ({ id, rota: true, motivo: 'Esa fórmula ya no existe' })); };
  /* el botón y los chips van en la misma fila que los de los duendes (1.1.68): [Fórmula] [Duendes] chips… */
  function formulasBoton(n) {
    const ids = Array.isArray(n.datos.formulas) ? n.datos.formulas : [];
    return `<button type="button" class="lz-fx-boton${ids.length ? ' con' : ''}" data-lz-fx-elegir title="Elegir fórmulas: prompts reutilizables de «Fórmulas» (formato, tono, reglas…) que se combinan con lo escrito">${ic('ic-formula', 12)}<span>Fórmula</span>${ic('ic-chev-d', 10)}</button>`;
  }
  function formulasChips(n) {
    const ids = Array.isArray(n.datos.formulas) ? n.datos.formulas : [];
    return resolverFx(ids).map((f, i) => {
      const nom = f.rota ? (f.titulo ? f.titulo : 'Fórmula que ya no está') : f.titulo || 'Sin título';
      const tit = f.rota ? (f.motivo || 'Esa fórmula ya no existe') + ' · se pedirá sin ella' : 'Abrir la fórmula «' + nom + '»';
      return `<span class="lz-fx-chip${f.rota ? ' roto' : ''}"><button type="button" class="lz-fx-nom"${f.rota ? ' disabled' : ` data-lz-fx-abrir="${esc(f.id)}"`} title="${esc(tit)}">${ic(f.rota ? 'ic-aviso' : 'ic-formula', 11)}<span>${esc(nom)}</span></button>`
        + `<button type="button" class="lz-fx-x" data-lz-fx-quitar="${i}" title="Quitar la fórmula" aria-label="Quitar la fórmula «${esc(nom)}»">${ic('ic-close', 10)}</button></span>`;
    }).join('');
  }
  function ponerFormulas(id, ids) {
    const limpias = [...new Set((ids || []).map(String).filter(Boolean))];
    m.editarNodo(id, { datos: { formulas: limpias } });
    const n = m.nodo(id);
    if (n && !limpias.length && n.datos.formulas && !n.datos.formulas.length) delete n.datos.formulas;   // la clave, solo si hay (por si el modelo no la quita)
    cambio();
  }
  function abrirFormula(fid) {
    const d = docs(), nt = d && d.nota(fid);
    if (!nt || d.enPapelera(fid)) { avisar('Esa fórmula ya no está'); return; }
    abrir({ tipo: 'nota', id: fid });
  }
  /* la lista de las fórmulas, agrupada por segmento (en el orden de su tablero) */
  function gruposFx() {
    const d = docs(); if (!d || !d.formulas) return [];
    const grupos = new Map();
    d.formulas().forEach(nt => {
      const e = nt.etiquetaId && d.etiqueta ? d.etiqueta(nt.etiquetaId) : null, k = e ? e.id : '';
      if (!grupos.has(k)) grupos.set(k, { nombre: e ? e.nombre : 'Bandeja', color: e ? e.color : null, notas: [] });
      grupos.get(k).notas.push(nt);
    });
    return [...grupos.values()];
  }
  const primerRenglon = nt => { const x = C.formulas && C.formulas.textoDeHtml ? C.formulas.textoDeHtml(nt.html || '') : extracto(nt.html, 200); return (x.split('\n').find(l => l.trim()) || '').trim(); };
  function elegirFormulas(id, ancla) {
    const n = m.nodo(id); if (!n) return;
    const grupos = gruposFx(), total = grupos.reduce((k, x) => k + x.notas.length, 0);
    const caja = document.createElement('div'); caja.className = 'lz-elige lz-fx-menu';
    caja.innerHTML = `<div class="gd-pop-tit">Fórmulas de «${esc(m.nombre(id))}»</div>`
      + (total ? `<input type="search" placeholder="Buscar una fórmula" aria-label="Buscar una fórmula">` : '')
      + `<div class="lz-elige-lista"></div>`;
    const campo = caja.querySelector('input'), $l = caja.querySelector('.lz-elige-lista');
    const elegidas = () => ((m.nodo(id) || {}).datos || {}).formulas || [];
    const marcarBotones = () => {
      const xs = elegidas();
      $l.querySelectorAll('[data-lz-fx-op]').forEach(b => { const i = xs.indexOf(b.dataset.lzFxOp); b.classList.toggle('on', i >= 0); b.setAttribute('aria-checked', String(i >= 0)); b.querySelector('small').textContent = i >= 0 ? String(i + 1) : ''; });
    };
    if (!total) $l.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: 'Aún no hay fórmulas. Escribe una en «Fórmulas», al pie del menú, o guarda aquí lo que dice «Qué escribir».' }));
    grupos.forEach(gr => {
      const cab = document.createElement('div'); cab.className = 'gd-pop-sub'; cab.dataset.lzFxGrupo = '';
      cab.innerHTML = (gr.color !== null && gr.color !== undefined ? `<span class="lz-punto par" style="${par(gr.color)}"></span>` : '') + `<span>${esc(gr.nombre)}</span>`;
      $l.appendChild(cab);
      gr.notas.forEach(nt => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemcheckbox'); b.dataset.lzFxOp = nt.id;
        b.dataset.lzFxBusca = plano(nt.titulo + ' ' + gr.nombre + ' ' + primerRenglon(nt));
        b.innerHTML = `<span class="lz-fx-check">${ic('ic-check', 12)}</span><span><b>${esc(nt.titulo || 'Sin título')}</b><em>${esc(primerRenglon(nt) || 'Sin texto')}</em></span><small></small>`;
        /* elegir o quitar sin cerrar la lista (el orden es el de elegirlas) */
        b.addEventListener('click', () => {
          const xs = elegidas().slice(), i = xs.indexOf(nt.id);
          if (i >= 0) xs.splice(i, 1); else xs.push(nt.id);
          ponerFormulas(id, xs); marcarBotones();
        });
        $l.appendChild(b);
      });
    });
    marcarBotones();
    const filtrar = () => {
      const q = plano(campo ? campo.value : '');
      $l.querySelectorAll('[data-lz-fx-op]').forEach(b => { b.hidden = !!q && !b.dataset.lzFxBusca.includes(q); });
      $l.querySelectorAll('[data-lz-fx-grupo]').forEach(c => { let x = c.nextElementSibling, hay = false; while (x && x.dataset.lzFxOp) { if (!x.hidden) hay = true; x = x.nextElementSibling; } c.hidden = !hay; });
    };
    if (campo) {
      campo.addEventListener('input', filtrar);
      campo.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const b = [...$l.querySelectorAll('[data-lz-fx-op]')].find(x => !x.hidden); if (b) b.click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const b = [...$l.querySelectorAll('[data-lz-fx-op]')].find(x => !x.hidden); if (b) b.focus(); }
      });
    }
    caja.appendChild(sepMenu());
    const escrito = String(n.datos.instruccion || '').trim();
    caja.appendChild(opcion(`${ic('ic-plus', 13)}<span>Nueva fórmula desde lo escrito…</span>`, () => nuevaDesdeEscrito(id, ancla),
      { disabled: !escrito || !g.crearFormula, title: escrito ? 'Guarda como fórmula lo que dice «Qué escribir» y la elige' : 'Escribe algo en «Qué escribir» para guardarlo como fórmula' }));
    caja.appendChild(opcion(`${ic('ic-formula', 13)}<span>Administrar fórmulas…</span>`, () => abrir({ tipo: 'biblioteca', id: ID_BIB_FX() })));
    abrirMenu(ancla, caja);
    setTimeout(() => (campo || $l.querySelector('button') || caja).focus({ preventScroll: true }), 0);
  }
  /* «Nueva fórmula desde lo escrito…»: su nombre (de partida, el principio del texto) y se crea en la bandeja de «Fórmulas»; queda
     elegida en la operación, que ya no necesita lo escrito (se queda: Leo decide si lo borra) */
  function nuevaDesdeEscrito(id, ancla) {
    const n = m.nodo(id); if (!n || !g.crearFormula) return;
    const escrito = String(n.datos.instruccion || '').trim(); if (!escrito) return;
    const propuesto = escrito.split('\n')[0].replace(/\s+/g, ' ').slice(0, 48).trim();
    const caja = document.createElement('div'); caja.className = 'lz-fx-nueva';
    caja.innerHTML = `<div class="gd-pop-tit">Nueva fórmula desde lo escrito</div><label class="lz-fx-campo"><span>Nombre</span><input type="text" data-lz-fx-nombre spellcheck="false" autocomplete="off"></label>`
      + `<div class="lz-fx-vista">${esc(escrito.length > 240 ? escrito.slice(0, 240) + '…' : escrito)}</div>`
      + `<div class="lz-fx-acc"><button type="button" class="btn" data-lz-fx-cancelar>Cancelar</button><button type="button" class="btn primario" data-lz-fx-crear>Crear fórmula</button></div>`;
    const inp = caja.querySelector('input');
    inp.value = propuesto;
    const crear = () => {
      const nombre = inp.value.trim(); if (!nombre) { inp.classList.add('tiembla'); setTimeout(() => inp.classList.remove('tiembla'), 400); return; }
      cerrarMenu();
      const fid = g.crearFormula(nombre, escrito);
      if (!fid) return;
      const xs = ((m.nodo(id) || {}).datos || {}).formulas || [];
      ponerFormulas(id, xs.concat(fid));
      const d = docs(), nt = d && d.nota(fid);
      avisar('Fórmula «' + (nt ? nt.titulo : nombre) + '» guardada y elegida', { texto: 'Abrir', fn: () => abrirFormula(fid) });
    };
    caja.addEventListener('click', e => { if (e.target.closest('[data-lz-fx-crear]')) crear(); else if (e.target.closest('[data-lz-fx-cancelar]')) cerrarMenu(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); crear(); } });
    abrirMenu(ancla, caja);
    setTimeout(() => { inp.focus({ preventScroll: true }); inp.select(); }, 0);
  }
  /* las fórmulas que ya no existen de unas operaciones: se piden sin ellas, pero se dice */
  function avisoRotas(ids) {
    const rotas = [];
    ids.forEach(k => { const n = m.nodo(k); if (n && esOp(n)) resolverFx(n.datos.formulas).filter(f => f.rota).forEach(f => rotas.push(f.titulo ? '«' + f.titulo + '»' : 'una que ya no existe')); });
    if (!rotas.length) return;
    setTimeout(() => avisar((rotas.length === 1 ? 'La fórmula ' + rotas[0] + ' ya no está' : 'Las fórmulas ' + rotas.join(', ') + ' ya no están') + ': se pide sin ' + (rotas.length === 1 ? 'ella' : 'ellas')), 2600);
  }

  /* ---------- los duendes de una operación (1.1.68) ----------
     Leo: «Que los duendes se puedan seleccionar en los bloques de IA del lienzo para salidas con la personalidad del duende». Junto a
     «Fórmula», el botón «Duendes»: la lista de los duendes especiales del asistente (los de `C.equipoUI.equipo()`, globales), varios
     en orden, sin cerrarla. Cada elegido es una **instantánea** de su ficha (`C.equipo.instantanea`, sin su aspecto; lienzo-modelo.js
     la sanea): así la personalidad con la que sale la salida no cambia si Leo edita después el duende. Un chip por cada uno (su color
     de ropa, su nombre —el clic abre su ficha—, «↻» si la ficha cambió desde que se eligió, que la actualiza, y ×). Cambiarlos deja
     la operación desactualizada (su huella de datos). Sin el equipo (otra página, o sin equipo-ui.js), la lista lo dice. */
  const IC_DUENDE = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.6 1.6 4.2 11.6h8.2L9.9 5.2"/><path d="M9.9 5.2l2.6-1.1"/><path d="M2.6 11.8c1.2 1.4 3.2 2.2 5.4 2.2s4.2-.8 5.4-2.2"/></svg>';
  const E = () => C.equipo || null;
  function equipoActual() { try { return C.equipoUI && C.equipoUI.equipo ? C.equipoUI.equipo() : null; } catch (_) { return null; } }
  function especialesDe(eq) {
    if (!eq || !Array.isArray(eq.duendes)) return [];
    try { if (E() && E().especiales) return E().especiales(eq) || []; } catch (_) {}
    return eq.duendes.filter(d => d && d.papel === 'especial');
  }
  /* la instantánea de una ficha, ya como la guarda el lienzo (sin aspecto) */
  function instantaneaDe(d) {
    const x = E() && E().instantanea ? E().instantanea(d) : null;
    const base = Object.assign({}, x || d, { fijadaEn: (x && x.fijadaEn) || Date.now() });
    return L().sanearDuende ? L().sanearDuende(base) : null;
  }
  /* ¿la ficha cambió desde que se eligió? (sin contar cuándo se eligió) */
  function fichaCambiada(inst, ficha) {
    if (!ficha) return false;
    const a = instantaneaDe(ficha); if (!a) return false;
    return ['nombre', 'personalidad', 'rol', 'veto', 'modelo', 'temperatura', 'voz'].some(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(inst[k] ?? null));
  }
  const ROL_DN = { transformar: 'Transforma el texto', revisar: 'Revisa' };
  const rolDn = x => (x.rol === 'transformar' ? ROL_DN.transformar : x.veto ? 'Revisa y puede vetar' : ROL_DN.revisar);
  function colorDn(ficha) {
    let a = null; try { a = ficha && E() && E().aspectoDe ? E().aspectoDe(ficha) : ficha && ficha.duende; } catch (_) { a = null; }
    return a && /^#[0-9a-f]{6}$/i.test(a.cloth || '') ? a.cloth : 'var(--foco)';
  }
  const primeraLinea = t => (String(t || '').split('\n').find(l => l.trim()) || '').trim();
  function duendesBoton(n) {
    const ds = Array.isArray(n.datos.duendes) ? n.datos.duendes : [];
    return `<button type="button" class="lz-fx-boton lz-dn-boton${ds.length ? ' con' : ''}" data-lz-dn-elegir title="Elegir duendes: la salida sale con la personalidad de tus duendes especiales (los del asistente)">${IC_DUENDE}<span>Duendes</span>${ic('ic-chev-d', 10)}</button>`;
  }
  function duendesChips(n) {
    const ds = Array.isArray(n.datos.duendes) ? n.datos.duendes : [], eq = equipoActual(), esp = especialesDe(eq);
    return ds.map((x, i) => {
      const ficha = esp.find(d => d.id === x.id) || null, cambio = fichaCambiada(x, ficha);
      const tit = rolDn(x) + (x.personalidad ? ' · ' + primeraLinea(x.personalidad).slice(0, 160) : '')
        + (!ficha && eq ? ' · ya no está en tu equipo: se usa como era al elegirlo' : cambio ? ' · su ficha cambió: se usa como era al elegirlo' : '');
      return `<span class="lz-dn-chip${!ficha && eq ? ' suelto' : ''}${cambio ? ' cambio' : ''}" style="--dn:${esc(colorDn(ficha))}">`
        + `<button type="button" class="lz-dn-nom"${ficha ? ` data-lz-dn-abrir="${esc(x.id)}"` : ''} title="${esc(tit)}"><span class="lz-dn-punto"></span><span>${esc(x.nombre)}</span></button>`
        + (cambio ? `<button type="button" class="lz-dn-act" data-lz-dn-actualizar="${i}" title="Su ficha cambió desde que lo elegiste: usar la de ahora" aria-label="Actualizar «${esc(x.nombre)}»">↻</button>` : '')
        + `<button type="button" class="lz-dn-x" data-lz-dn-quitar="${i}" title="Quitar el duende" aria-label="Quitar el duende «${esc(x.nombre)}»">${ic('ic-close', 10)}</button></span>`;
    }).join('');
  }
  function ponerDuendes(id, lista) {
    const limpias = L().sanearDuendes ? L().sanearDuendes(lista || []) : [];
    m.editarNodo(id, { datos: { duendes: limpias } });
    const n = m.nodo(id);
    if (n && !limpias.length && n.datos.duendes && !n.datos.duendes.length) delete n.datos.duendes;
    cambio();
  }
  function actualizarDuende(id, i) {
    const n = m.nodo(id), xs = ((n && n.datos.duendes) || []).slice(), x = xs[i]; if (!x) return;
    const ficha = especialesDe(equipoActual()).find(d => d.id === x.id);
    if (!ficha) { avisar('«' + x.nombre + '» ya no está en tu equipo'); return; }
    const nueva = instantaneaDe(ficha); if (!nueva) return;
    xs[i] = nueva; ponerDuendes(id, xs);
    avisar('«' + nueva.nombre + '» actualizado: la operación sale con su ficha de ahora');
  }
  function abrirFicha(did) { if (C.equipoUI && C.equipoUI.abrir) { cerrarMenu(); C.equipoUI.abrir({ id: did }); } }
  function elegirDuendes(id, ancla) {
    const n = m.nodo(id); if (!n) return;
    const eq = equipoActual(), esp = especialesDe(eq), max = L().MAX_DUENDES || 6;
    const caja = document.createElement('div'); caja.className = 'lz-elige lz-fx-menu lz-dn-menu';
    caja.innerHTML = `<div class="gd-pop-tit">Duendes de «${esc(m.nombre(id))}»</div>`
      + (esp.length > 6 ? `<input type="search" placeholder="Buscar un duende" aria-label="Buscar un duende">` : '')
      + `<div class="lz-elige-lista"></div>`;
    const campo = caja.querySelector('input'), $l = caja.querySelector('.lz-elige-lista');
    const elegidos = () => ((m.nodo(id) || {}).datos || {}).duendes || [];
    const marcar = () => {
      const xs = elegidos().map(x => x.id);
      $l.querySelectorAll('[data-lz-dn-op]').forEach(b => { const i = xs.indexOf(b.dataset.lzDnOp); b.classList.toggle('on', i >= 0); b.setAttribute('aria-checked', String(i >= 0)); b.querySelector('small').textContent = i >= 0 ? String(i + 1) : ''; });
    };
    const vacio = t => $l.appendChild(Object.assign(document.createElement('div'), { className: 'gd-pop-vacio', textContent: t }));
    if (!eq) vacio('Los duendes del asistente no están disponibles aquí.');
    else if (!esp.length) vacio('Aún no tienes duendes especiales. Créalos en «Duendes del asistente» (menú Claude) y dales su personalidad.');
    esp.forEach(d => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemcheckbox'); b.dataset.lzDnOp = d.id;
      b.dataset.lzDnBusca = plano(d.nombre + ' ' + (d.personalidad || ''));
      b.innerHTML = `<span class="lz-fx-check">${ic('ic-check', 12)}</span><span class="lz-dn-punto" style="--dn:${esc(colorDn(d))}"></span><span><b>${esc(d.nombre)}</b><em>${esc(rolDn(d) + (d.personalidad ? ' · ' + primeraLinea(d.personalidad) : ''))}</em></span><small></small>`;
      b.addEventListener('click', () => {
        const xs = elegidos().slice(), i = xs.findIndex(x => x.id === d.id);
        if (i >= 0) xs.splice(i, 1);
        else { if (xs.length >= max) { avisar('Como mucho ' + max + ' duendes por operación'); return; } const s = instantaneaDe(d); if (!s) return; xs.push(s); }
        ponerDuendes(id, xs); marcar();
      });
      $l.appendChild(b);
    });
    marcar();
    if (campo) {
      campo.addEventListener('input', () => { const q = plano(campo.value); $l.querySelectorAll('[data-lz-dn-op]').forEach(b => { b.hidden = !!q && !b.dataset.lzDnBusca.includes(q); }); });
      campo.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const b = [...$l.querySelectorAll('[data-lz-dn-op]')].find(x => !x.hidden); if (b) b.click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const b = [...$l.querySelectorAll('[data-lz-dn-op]')].find(x => !x.hidden); if (b) b.focus(); }
      });
    }
    if (C.equipoUI && C.equipoUI.abrir) {
      caja.appendChild(sepMenu());
      caja.appendChild(opcion(`${ic('ic-plus', 13)}<span>Nuevo duende especial…</span>`, () => C.equipoUI.abrir({ nuevo: true })));
      caja.appendChild(opcion(`${IC_DUENDE}<span>Administrar duendes…</span>`, () => C.equipoUI.abrir()));
    }
    abrirMenu(ancla, caja);
    setTimeout(() => (campo || $l.querySelector('button') || caja.querySelector('button') || caja).focus({ preventScroll: true }), 0);
  }
  /* si el equipo cambia (otra ventana, el diálogo de duendes), los chips dicen «↻» donde toque */
  let oyendoEquipo = false;
  function oirEquipo() {
    if (oyendoEquipo || !C.equipoUI || !C.equipoUI.alCambio) return;
    oyendoEquipo = true;
    C.equipoUI.alCambio(() => { if (m) pintar(); });
  }

  function elegirImagen(fn) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) leerImagen(f).then(src => { if (src) fn(src); }); });
    inp.click();
  }
  function leerImagen(file) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = async () => { let src = r.result; try { if (window.Anotar && Anotar.ligera) src = await Anotar.ligera(src); } catch (_) {} res(src); };
      r.onerror = () => res(null);
      r.readAsDataURL(file);
    });
  }
  function verImagen(n) {
    if (!window.Anotar || !Anotar.abrir || !srcPropio(n.datos.src)) return;
    Anotar.abrir({ nombre: n.titulo || n.datos.alt || 'Imagen', src: n.datos.src, vista: n.datos.src,
      alGuardar: x => { if (!m || !m.nodo(n.id) || !x || !x.datos) return; m.editarNodo(n.id, { datos: { src: x.datos } }); cambio(); } });
  }
  const tieneArchivos = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
  function onSoltarArchivos(e) {
    if (!m || !tieneArchivos(e)) return;
    e.preventDefault();
    const fs = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)); if (!fs.length) { avisar('Al lienzo solo se sueltan imágenes'); return; }
    const w = aMundo(e.clientX, e.clientY);
    Promise.all(fs.map(leerImagen)).then(srcs => {
      const ids = [];
      srcs.forEach((src, i) => { if (!src) return; const r = m.crearNodo('imagen', Math.round(w.x + i * 30), Math.round(w.y + i * 30), { src, alt: fs[i].name.replace(/\.[^.]+$/, '') }); if (r.ok) ids.push(r.nodo.id); });
      if (!ids.length) return;
      sel.clear(); ids.forEach(k => sel.add(k)); cambio();
    });
  }

  /* ---------- renombrar en sitio ---------- */
  function renombrar(id) {
    const el = els.get(id), tit = el && el.querySelector('[data-lz-tit]'), n = m.nodo(id); if (!tit || !n) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'lz-tit-edit'; inp.value = n.titulo || tituloAuto(n, resolver(n)) || ''; inp.placeholder = tituloAuto(n, resolver(n)) || TIPOS()[n.tipo].nombre;
    tit.replaceWith(inp); inp.focus(); inp.select();
    let hecho = false;
    const fin = guardar => {
      if (hecho) return; hecho = true;
      if (guardar && m && m.nodo(id)) {
        const v = inp.value.trim(), auto = tituloAuto(n, resolver(n));
        m.editarNodo(id, { titulo: v && v !== auto ? v : '' });
        el._html = null; cambio();
      } else { el._html = null; pintar(); }
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fin(true); } if (e.key === 'Escape') { e.preventDefault(); fin(false); } });
    inp.addEventListener('blur', () => fin(true));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }

  /* ====================================================================
     Acciones
     ==================================================================== */
  function abrir(ref) { if (g.abrir) { volcar(); g.abrir(ref); } }
  function refDe(n) {
    const d = n.datos;
    switch (n.tipo) {
      case 'nota': return { tipo: 'nota', id: d.notaId };
      case 'segmento': return { tipo: 'segmento', biblioteca: d.subId, id: d.etiquetaId || 'bandeja' };
      case 'biblioteca': return { tipo: 'biblioteca', id: d.subId };
      case 'esquema': return { tipo: 'esquema', id: d.eid };
      case 'personaje': return { tipo: 'personaje', id: d.personajeId };
    }
    return null;
  }
  function abrirEntrada(n) {
    const r = resolver(n);
    if (r && r.roto) { avisar(r.motivo || 'Lo que apuntaba ya no está'); return; }
    const ref = refDe(n); if (ref) abrir(ref);
  }
  function borrar(ids) {
    ids = (ids || [...sel]).filter(id => m.nodo(id)); if (!ids.length) return;
    const antes = json();
    const r = m.borrarNodos(ids); if (!r.ok) { avisar(r.aviso); return; }
    ids.forEach(id => sel.delete(id));
    cambio();
    avisar(r.aviso, deshacerA(antes));
  }
  function quitarCable(cid) {
    const antes = json();
    const r = m.desconectar(cid); if (!r.ok) { avisar(r.aviso); return; }
    cableSel = null; cambio();
    avisar('Cable quitado', deshacerA(antes));
  }
  function duplicar(ids) {
    ids = (ids || [...sel]).filter(id => m.nodo(id)); if (!ids.length) return;
    const clip = m.copiar(ids), r = clip && m.pegar(clip, clip.x0 + 36, clip.y0 + 36);
    if (!r || !r.ok) { avisar(r && r.aviso); return; }
    sel.clear(); r.ids.forEach(k => sel.add(k)); cambio();
  }
  function pegarAqui(cx, cy) {
    if (!portapapeles) return;
    const b = $cuerpo.getBoundingClientRect();
    const w = cx !== undefined ? aMundo(cx, cy) : (ultimoPuntero || aMundo(b.left + b.width / 2, b.top + b.height / 2));
    const r = m.pegar(portapapeles, Math.round(w.x), Math.round(w.y));
    if (!r.ok) { avisar(r.aviso); return; }
    sel.clear(); r.ids.forEach(k => sel.add(k)); cableSel = null; cambio();
  }
  /* el encargo para Claude: el enlace de cada operación (si el proyecto sabe hacerlos) y una frase */
  function encargo(ids, todo) {
    const d = docs(), r = d && d.lienzo(lid), nomL = r ? r.lienzo.nombre : 'el lienzo';
    const P = (g.proyecto && g.proyecto()) || (d && d.datos && d.datos.enlace && d.datos.enlace.proyecto) || null;
    const enlace = ref => { try { return P && C.enlaces && C.enlaces.markdown ? C.enlaces.markdown(d, P, ref) : null; } catch (_) { return null; } };
    if (todo) {
      const e = enlace({ tipo: 'lienzo', id: lid });
      return `Ejecuta el lienzo «${nomL}» de ClapCraft: ${cuenta(ids.length, 'operación pendiente', 'operaciones pendientes')}, en orden.` + (e ? '\n' + e : '');
    }
    const ls = ids.map(k => enlace({ tipo: 'lienzo', id: lid, nodo: k })).filter(Boolean);
    const nombres = ids.map(k => '«' + m.nombre(k) + '»').join(', ');
    return (ids.length === 1 ? `Ejecuta el nodo ${nombres} del lienzo «${nomL}» de ClapCraft.` : `Ejecuta en orden los nodos ${nombres} del lienzo «${nomL}» de ClapCraft.`) + (ls.length ? '\n' + ls.join('\n') : '')
      + fxEncargo(ids, enlace) + dnEncargo(ids);
  }
  /* los duendes de cada operación (1.1.68): ejecutar_nodo trae su personalidad */
  function dnEncargo(ids) {
    const l = ids.map(k => { const n = m.nodo(k), ds = (n && esOp(n) && n.datos.duendes) || []; return ds.length ? 'Duendes de «' + m.nombre(k) + '», en este orden: ' + ds.map(x => '«' + x.nombre + '»').join(', ') + '.' : ''; }).filter(Boolean);
    return l.length ? '\n' + l.join('\n') + '\nejecutar_nodo trae su personalidad: la salida sale con ella.' : '';
  }
  /* las fórmulas de cada operación (1.1.60), en su orden, con su enlace: ejecutar_nodo trae su texto ya compuesto con lo escrito */
  function fxEncargo(ids, enlace) {
    const lineas = [];
    ids.forEach(k => {
      const n = m.nodo(k); if (!n || !esOp(n) || !(n.datos.formulas || []).length) return;
      const fs = resolverFx(n.datos.formulas);
      const vivas = fs.filter(f => !f.rota), rotas = fs.filter(f => f.rota);
      if (!vivas.length && !rotas.length) return;
      lineas.push('Fórmulas de «' + m.nombre(k) + '», en este orden: ' + vivas.map(f => '«' + (f.titulo || 'Sin título') + '»').join(', ')
        + (rotas.length ? (vivas.length ? ' (' : '(') + (rotas.length === 1 ? 'una ya no existe: va sin ella' : rotas.length + ' ya no existen: van sin ellas') + ')' : '') + '.');
      vivas.forEach(f => { const e = enlace({ tipo: 'nota', id: f.id }); if (e) lineas.push(e); });
    });
    return lineas.length ? '\n' + lineas.join('\n') + '\nejecutar_nodo trae su texto compuesto con lo escrito en «Qué escribir».' : '';
  }
  /* las deja pendientes (con sus previas) y devuelve cuáles, en orden; null si ninguna */
  function marcar(ids) {
    const f = firma(); let todos = [];
    for (const id of ids) {
      const n = m.nodo(id); if (!esOp(n)) continue;
      if (n.estado === 'pendiente') { todos.push(id); continue; }   // ya lo estaba: solo se vuelve a copiar
      const r = m.pedir(id, f);
      if (!r.ok) { avisar(r.aviso); els.get(id) && els.get(id).classList.add('tiembla'); setTimeout(() => els.get(id) && els.get(id).classList.remove('tiembla'), 400); if (ids.length === 1) return null; continue; }
      todos = todos.concat(r.ids);
    }
    todos = m.orden([...new Set(todos)]);
    if (!todos.length) return null;
    cambio();
    return todos;
  }
  function pedir(ids) {
    volcar();
    const todos = marcar(ids); if (!todos) return;
    const texto = encargo(todos);
    if (g.pedirAClaude) g.pedirAClaude(texto, { lienzo: lid, nodos: todos }); else avisar('Pídeselo a Claude: ' + texto.split('\n')[0]);
    avisoRotas(todos);
  }
  /* «Ejecutar con IA» (uno, varios) y «Ejecutar todo con IA» (1.1.59): igual que pedírselo a Claude, pero lo hace el asistente */
  function pedirIA(ids, todo) {
    if (!m || !conIA()) return;
    if (g.listoIA && !g.listoIA()) { g.ejecutarConIA({ lienzo: lid, nodos: [], sinClave: true }); return; }   // sin clave: nada pendiente; el asistente dice cómo configurarlo
    /* el asistente ocupado con otra cosa: nada queda pendiente (si no, los nodos se quedaban en «pendiente» sin que nadie los hiciera) */
    if (g.ocupadoIA && g.ocupadoIA()) { avisar('El asistente está con otra cosa: espera a que termine (o detenlo) y vuelve a pulsar'); if (g.verIA) g.verIA(); return; }
    volcar();
    let nodosIA;
    if (todo) {
      const r = m.pedirTodo(firma());
      if (r.ids.length) cambio();
      nodosIA = m.pendientes();
      if (!nodosIA.length) { avisar(r.aviso); return; }
      if (r.saltadas && r.saltadas.length) setTimeout(() => avisar(r.aviso), 2600);
    } else {
      /* las que ya estaban pendientes también van (para Claude solo se volvía a copiar el encargo) */
      nodosIA = marcar(ids); if (!nodosIA) return;
    }
    g.ejecutarConIA({ lienzo: lid, nodos: nodosIA, todo: !!todo, texto: encargo(nodosIA, todo) });
    pintarEstados();
    avisoRotas(nodosIA);
  }
  function pedirTodo() {
    if (!m) return;
    volcar();
    const r = m.pedirTodo(firma());
    if (r.ids.length) cambio();
    const pend = m.pendientes();
    if (!pend.length) { avisar(r.aviso); return; }
    const texto = encargo(pend, true);
    if (g.pedirAClaude) g.pedirAClaude(texto, { lienzo: lid, nodos: pend }); else avisar(r.aviso);
    if (r.saltadas && r.saltadas.length) setTimeout(() => avisar(r.aviso), 2600);
    else avisoRotas(pend);
  }

  /* ====================================================================
     Teclado y portapapeles
     ==================================================================== */
  const esCampo = t => t instanceof Element && (t.matches('input, textarea, select') || t.isContentEditable);
  /* el lienzo está delante: su vista se ve y no hay nada encima —un diálogo (#dlg, #dlgNombre), el historial de Claude (.hc-capa),
     una comparación de versiones (.vs-capa), el visor de una imagen, la ventana de una nota—. Con algo encima, sus teclas son de
     eso (Esc lo cierra, Supr y las flechas no tocan el lienzo). */
  function activo() {
    if (!m || !$sec || !$sec.offsetParent || !$cuerpo.clientWidth) return false;
    if (document.querySelector('dialog[open], #dlg[open], #dlgNombre[open], .hc-capa, .vs-capa')) return false;
    /* el teatro, el creador de duendes y «Duendes del asistente» (1.1.68) también tapan: sus teclas en captura en `window` van detrás
       de esta (se registran al abrirse), así que sin esto Supr en su lista borraba los nodos elegidos del lienzo de debajo */
    if (document.querySelector('.dn-capa, .cd-capa, .eq-capa')) return false;
    if (window.Anotar && Anotar.abierto && Anotar.abierto()) return false;
    if (document.body.classList.contains('con-ventana')) return false;
    return true;
  }
  /* las teclas con el foco en un menú propio (.lz-menu): las flechas recorren sus opciones (y bajan del buscador a la lista),
     Enter y Espacio eligen (lo hace el botón), Esc lo cierra; ninguna llega al lienzo ni al tablero escondido */
  function teclaMenu(e) {
    const el = menuAbierto, t = e.target;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const para = () => e.stopPropagation(), mio = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { mio(); cerrarMenu(); $cuerpo.focus({ preventScroll: true }); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      const bs = [...el.querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent);
      const campo = el.querySelector('input[type="search"]');
      if (!bs.length) { if (!esCampo(t)) mio(); return; }
      mio();
      const i = bs.indexOf(document.activeElement);
      if (e.key === 'Home') { bs[0].focus(); return; }
      if (e.key === 'End') { bs[bs.length - 1].focus(); return; }
      if (e.key === 'ArrowUp' && i === 0 && campo) { campo.focus(); return; }     // de la lista, de vuelta al buscador
      if (i < 0) { (e.key === 'ArrowDown' ? bs[0] : bs[bs.length - 1]).focus(); return; }
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
      return;
    }
    if (esCampo(t)) return;                               // el buscador: su Enter elige la primera (su propio oyente), Retroceso borra
    if (e.key === 'Enter' || e.key === ' ') { para(); return; }   // el botón se pulsa solo (lo hace el navegador)
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow')) { mio(); return; }   // no borran el nodo elegido
  }
  function onTecla(e) {
    if (!activo()) return;
    const t = e.target instanceof Element ? e.target : null;
    /* en un menú propio abierto: sus teclas */
    if (menuAbierto && t && menuAbierto.contains(t)) return teclaMenu(e);
    const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), campo = esCampo(e.target);
    /* lo que no es del lienzo: el menú lateral, las pestañas, los menús del gestor, el aviso (su «Deshacer»), el historial de
       Claude o una comparación (encima) */
    const fuera = t && t.closest('#gdSide, .franja, .gd-pop, .hc-capa, .vs-capa, #aviso, #asistente, .as-panel, .as-dlg, .as-taller');   // …y el asistente con otra IA (1.1.59) y su taller (1.1.68)
    const mio = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
    if (e.key === 'Escape' && menuAbierto && !fuera) return mio(cerrarMenu);
    if (campo) {
      if (e.key === 'Escape' && $nodos.contains(e.target)) mio(() => { volcar(); e.target.blur(); $cuerpo.focus({ preventScroll: true }); });
      return;
    }
    if (fuera) return;
    /* Enter y Espacio en un botón, un enlace o una lista son de ellos (▶ «Pedir a Claude», una ficha de salida…): lo hace el
       navegador; solo que no siga hasta el tablero escondido */
    if ((e.key === 'Enter' || e.key === ' ') && t && t.closest('button, a[href], select, summary, [role="button"]')) { e.stopPropagation(); return; }
    if (cmd && k === 'z') return mio(() => (e.shiftKey ? rehacer() : deshacer()));
    if (cmd && k === 'y') return mio(rehacer);
    if (cmd && !e.shiftKey && k === 'd') return mio(() => duplicar());
    if (cmd && !e.shiftKey && k === 'a') return mio(elegirTodo);
    if (cmd && (e.key === '=' || e.key === '+')) return mio(() => paso(1));
    if (cmd && e.key === '-') return mio(() => paso(-1));
    if (cmd && e.key === '0') return mio(() => animarZoom(1));
    if (!cmd && e.shiftKey && (e.key === '!' || e.code === 'Digit1')) return mio(() => encajar(true, sel.size ? [...sel] : null));
    if (!cmd && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (cableSel) return mio(() => quitarCable(cableSel));
      if (sel.size) return mio(() => borrar());
      return mio(() => {});                         // que no llegue al tablero escondido
    }
    if (e.key === 'Escape') return mio(() => { sel.clear(); cableSel = null; pintarSel(); });
    if (e.key === ' ' && !cmd) { mio(() => { espacio = true; $cuerpo.classList.add('espacio'); }); return; }
    if (e.key === 'Enter' && sel.size === 1) { const n = m.nodo([...sel][0]); if (n && !esOp(n)) return mio(() => abrirEntrada(n)); }
    if (e.key.startsWith('Arrow') && !cmd) {
      if (!sel.size) return mio(() => {});           // con nada elegido, las flechas del tablero no se mueven
      const d = e.shiftKey ? 40 : 8, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      return mio(() => { m.moverNodos([...sel], dx, dy); pintar(); clearTimeout(tFlechas); tFlechas = setTimeout(() => { tFlechas = null; cambio(true); }, 350); });
    }
  }
  let tFlechas = null;
  /* Cmd+A (y, en Electron, Edición › Seleccionar todo con el lienzo delante: `elegirTodo` de app.js) */
  function elegirTodo() { if (!m) return; nodos().forEach(n => sel.add(n.id)); cableSel = null; pintarSel(); }
  function onPortapapeles(e, tipo) {
    if (!activo() || esCampo(e.target) || (e.target instanceof Element && e.target.closest('#gdSide, #asistente'))) return;
    if (tipo === 'copy' || tipo === 'cut') {
      if (!sel.size) return;
      const clip = m.copiar([...sel]); if (!clip) return;
      e.preventDefault();
      portapapeles = clip;
      textoCopiado = clip.nodos.map(n => n.titulo || TIPOS()[n.tipo].nombre).join('\n');
      try { e.clipboardData.setData('text/plain', textoCopiado); } catch (_) {}
      if (tipo === 'cut') borrar([...sel]); else avisar(cuenta(clip.nodos.length, 'nodo copiado', 'nodos copiados'));
      return;
    }
    /* pegar: lo nuestro, una imagen o un texto del sistema (un nodo de texto con él) */
    const dt = e.clipboardData; if (!dt) return;
    const img = [...(dt.files || [])].find(f => /^image\//.test(f.type));
    const txt = dt.getData('text/plain');
    const w = ultimoPuntero || aMundo($cuerpo.getBoundingClientRect().left + $cuerpo.clientWidth / 2, $cuerpo.getBoundingClientRect().top + $cuerpo.clientHeight / 2);
    if (portapapeles && (!txt || txt === textoCopiado) && !img) { e.preventDefault(); pegarAqui(); return; }
    if (img) { e.preventDefault(); leerImagen(img).then(src => { if (!src) return; const r = m.crearNodo('imagen', Math.round(w.x), Math.round(w.y), { src }); if (r.ok) { sel.clear(); sel.add(r.nodo.id); cambio(); } }); return; }
    if (txt && txt.trim()) {
      e.preventDefault();
      const r = m.crearNodo('texto', Math.round(w.x), Math.round(w.y), { md: txt.trim() });
      if (r.ok) { sel.clear(); sel.add(r.nodo.id); cambio(); }
    }
  }

  /* ====================================================================
     Soltar desde fuera (el árbol, la biblioteca)
     ==================================================================== */
  /* `tipo`: 'nota' | 'segmento' | 'biblioteca' | 'esquema' | 'personaje'; `id`: el suyo (el de un segmento, «subId|etiquetaId», con
     «bandeja» sin segmento, o { subId, etiquetaId }). Crea la entrada donde cae (en el centro si no se dice dónde). */
  function soltar(tipo, id, cx, cy) {
    if (!m || !TIPOS()[tipo]) return { ok: false, aviso: 'No hay ningún lienzo abierto' };
    let datos;
    if (tipo === 'nota') datos = { notaId: id };
    else if (tipo === 'esquema') datos = { eid: id };
    else if (tipo === 'personaje') datos = { personajeId: id };
    else if (tipo === 'biblioteca') datos = { subId: id };
    else if (tipo === 'segmento') {
      if (id && typeof id === 'object') datos = { subId: id.subId, etiquetaId: id.etiquetaId || null };
      else { const [s, e] = String(id).split('|'); datos = { subId: s, etiquetaId: e && e !== 'bandeja' ? e : null }; }
    } else if (tipo === 'texto') datos = { md: String(id || '') };
    else if (tipo === 'imagen') datos = { src: String(id || '') };
    else return { ok: false, aviso: 'Eso no entra en un lienzo' };
    const b = $cuerpo.getBoundingClientRect();
    const dentro = cx !== undefined && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    const w = aMundo(dentro ? cx : b.left + b.width / 2, dentro ? cy : b.top + b.height / 2);
    const r = m.crearNodo(tipo, Math.round(w.x - 30), Math.round(w.y - 18), datos);
    if (!r.ok) { avisar(r.aviso); return r; }
    sel.clear(); sel.add(r.nodo.id); cableSel = null;
    cambio();
    return { ok: true, nodo: r.nodo.id };
  }
  /* ¿cae ese punto de pantalla sobre el lienzo? (para quien arrastra desde fuera) */
  function dentro(cx, cy) { if (!m || !$cuerpo || !$cuerpo.offsetParent) return false; const b = $cuerpo.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; }

  C.lienzoUI = {
    montar, desmontar, refrescar, ir, soltar, dentro, volcar,
    elegidos: () => [...sel],
    vista: v => { if (v === undefined) return Object.assign({}, vista); if (v && isFinite(+v.x)) { vista = { x: +v.x, y: +v.y, zoom: clamp(+v.zoom || 1, ZMIN, ZMAX) }; encajarAlVer = false; aplicarVista(); } return Object.assign({}, vista); },
    deshacer, rehacer, activo, elegirTodo, encajar: () => encajar(true), pedirTodo, montado: () => lid,
    estados: () => pintarEstados(),                 // el pie de las operaciones (1.1.59: al empezar y acabar la IA)
    anadir: () => { if (!m) return; const b = $cuerpo.getBoundingClientRect(); menuAnadir(b.left + b.width / 2, b.top + b.height / 2, { centro: true }); }
  };
})(window.Claquedraw = window.Claquedraw || {});
