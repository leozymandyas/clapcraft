/* Ver una imagen en grande, marcarla y recortarla, sin irse a otro editor (1.1.57, de ClapBook: js/clapbook/anotar.js)
   Leo, 27-09-2026: «lo de las imágenes como lo manejamos en ClapBook que permite poner, redimensionar e incluso editar».

   `Anotar.abrir({ nombre, src, vista, tipo, anotaciones, recorte, editar, alGuardar, alOriginal, alCerrar })`: primero la imagen
   ampliada (`vista`: la que se ve en el documento, con su recorte y sus marcas; `src`: la original, sin ellas). «Editar» (o
   `editar: true`, directamente) abre la barra con las herramientas: elegir y mover (V), rectángulo (R), círculo (O), flecha (A),
   línea (L), texto (T), lápiz (P), números (N) y recortar (C); ocho colores, tres grosores y «relleno» (un fondo translúcido en
   los rectángulos y los círculos, una caja detrás del texto). Con `alOriginal`, el visor ofrece «Volver al original».
   · **Recortar** (C): la imagen entera con el marco del recorte encima (sus esquinas y sus lados lo estiran, dentro se mueve,
     fuera se traza otro; Mayúsculas: sin cambiar la proporción) y una tira con las proporciones (libre, la de la imagen, 1:1,
     4:3, 3:2, 16:9 y girarlas). Fuera de la herramienta se ve ya recortada. El recorte va en las coordenadas de la original y
     las formas no se mueven: se puede volver a él, cambiarlo o quitarlo.
   · Las marcas son **formas** en las coordenadas de la imagen: se pintan en SVG mientras se editan (se eligen, se mueven, se
     estiran por sus asas; doble clic en un texto, para cambiarlo) y en un canvas al guardar. Mayúsculas al dibujar: cuadrados,
     círculos y ángulos de 45°. Cmd+Z / Cmd+Mayús+Z deshacen y rehacen; Supr borra la elegida; las flechas del teclado la mueven.
   · `alGuardar({ datos, tipo, anotaciones, recorte })` recibe la imagen recortada y con las marcas ya pintadas (una data URL),
     las formas y el recorte (para volver a editarlos: js/imagenes.js los deja en `data-original`, `data-anotaciones` y
     `data-recorte` de la imagen). Sin formas ni recorte, `anotaciones: []` y `recorte: null`: la imagen vuelve a ser la original.

   Se carga en el editor (index.html, `window.Ed`), en la app (claquedraw.html, `window.Claquedraw`) y en Node (las pruebas de lo
   puro, test/anotar.test.js): no depende de ninguno. Dentro del marco de ClapCraft el editor usa el de la app (`window.parent`),
   así la ventana tapa la ventana entera y no solo la hoja. Los colores van por los tokens `--an-*` de css/imagenes.css. */
(function (raiz) {
  'use strict';
  const conDom = typeof document !== 'undefined';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const tecla = t => (mac ? t.replace('Mod+Shift+', '⇧⌘').replace('Mod+', '⌘') : t.replace('Mod+', 'Ctrl+').replace('Shift+', 'Mayús+'));
  function hexARgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const n = m ? parseInt(m[1], 16) : 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  /* el color de texto que se lee sobre `hex`: casi negro sobre los claros, blanco sobre los oscuros */
  function contraste(hex) {
    const { r, g, b } = hexARgb(hex), l = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b) > 0.4 ? '#1C1C1E' : '#FFFFFF';
  }
  const alfa = (hex, a) => { const { r, g, b } = hexARgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
  const fondoTexto = c => (contraste(c) === '#1C1C1E' ? 'rgba(28, 28, 30, 0.78)' : 'rgba(255, 255, 255, 0.9)');
  const svgIc = d => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    editar: svgIc('<path d="M10.8 2.8l2.4 2.4-7.4 7.4-3 .6.6-3z"/><path d="M9.4 4.2l2.4 2.4"/>'),
    cerrar: svgIc('<path d="M4 4l8 8M12 4l-8 8"/>'),
    deshacer: svgIc('<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7"/>'),
    rehacer: svgIc('<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9"/>'),
    papelera: svgIc('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    original: svgIc('<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8"/><path d="M2.6 2.6v2.8h2.8"/>'),
    girar: svgIc('<rect x="2.5" y="5" width="8" height="8.5" rx="1.2"/><path d="M8.5 2.5h1.8a3.2 3.2 0 0 1 3.2 3.2v1.3M11.8 5.4l1.7 1.7 1.7-1.7"/>')
  };
  const COLORES = [['Rojo', '#FF3B30'], ['Naranja', '#FF9500'], ['Amarillo', '#FFCC00'], ['Verde', '#34C759'], ['Azul', '#0A84FF'], ['Morado', '#AF52DE'], ['Blanco', '#FFFFFF'], ['Negro', '#1C1C1E']];
  const HERRAMIENTAS = [
    ['mover', 'Elegir y mover', 'V', svgIc('<path d="M3.5 2.5 12 7.2l-3.9 1-1.9 3.6z"/>')],
    ['rect', 'Rectángulo', 'R', svgIc('<rect x="2.5" y="3.5" width="11" height="9" rx="1.6"/>')],
    ['elipse', 'Círculo', 'O', svgIc('<ellipse cx="8" cy="8" rx="5.6" ry="4.8"/>')],
    ['flecha', 'Flecha', 'A', svgIc('<path d="M3 13 12.5 3.5M6.8 3.5h5.7v5.7"/>')],
    ['linea', 'Línea', 'L', svgIc('<path d="M3 13 13 3"/>')],
    ['texto', 'Texto', 'T', svgIc('<path d="M3.5 4.4V3h9v1.4M8 3v10M6 13h4"/>')],
    ['lapiz', 'Trazo libre', 'P', svgIc('<path d="M2.8 12.6c1.8-.4 2.6-4.9 4.6-4.9s1.6 3.3 3.5 2.8 1.6-4.6 2.3-5.9"/>')],
    ['numero', 'Números (1, 2, 3…)', 'N', svgIc('<circle cx="8" cy="8" r="5.6"/><path d="M7.1 6.3 8.4 5.6v4.8"/>')],
    ['recortar', 'Recortar', 'C', svgIc('<path d="M4.5 1.5v10h10M1.5 4.5h10v10"/>')]
  ];
  /* las proporciones del recorte: [clave, rótulo, ancho / alto] ('orig': la de la imagen) */
  const PROPORCIONES = [['libre', 'Libre', null], ['orig', 'Original', 'orig'], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:2', '3:2', 3 / 2], ['16:9', '16:9', 16 / 9]];
  const GROSORES = [['fino', 'Fino', 1], ['medio', 'Medio', 2], ['grueso', 'Grueso', 3.6]];
  const fuente = tam => `600 ${tam}px 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;   // comillas simples: va en un style="…"
  const clonar = x => JSON.parse(JSON.stringify(x || []));
  const entre = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- la geometría de las formas (la misma para el SVG y para el canvas) ---------- */
  const rectDe = f => ({ x: Math.min(f.x, f.x + f.w), y: Math.min(f.y, f.y + f.h), w: Math.abs(f.w), h: Math.abs(f.h) });
  /* la punta de una flecha: el triángulo, y dónde acaba el trazo (en la base de la punta) */
  function punta(f) {
    const L = Math.max(f.grosor * 4.4, 11), a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1), s = 0.44, largo = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
    const tri = [[f.x2, f.y2], [f.x2 - L * Math.cos(a - s), f.y2 - L * Math.sin(a - s)], [f.x2 - L * Math.cos(a + s), f.y2 - L * Math.sin(a + s)]];
    const k = Math.min(largo, L * 0.8);
    return { tri, fin: [f.x2 - k * Math.cos(a), f.y2 - k * Math.sin(a)] };
  }
  let medidor = null;
  function medirTexto(f) {
    const ls = String(f.texto || '').split('\n'), lh = f.tam * 1.25, pad = f.relleno ? f.tam * 0.36 : 0;
    let ancho;
    if (conDom) {
      if (!medidor) medidor = document.createElement('canvas').getContext('2d');
      medidor.font = fuente(f.tam); ancho = l => medidor.measureText(l).width;
    } else ancho = l => l.length * f.tam * 0.56;                       // en Node, una estimación (las pruebas no miden texto)
    const w = Math.max(f.tam * 0.5, ...ls.map(ancho));
    return { ls, lh, pad, caja: { x: f.x - pad, y: f.y - pad, w: w + pad * 2, h: ls.length * lh + pad * 2 } };
  }
  const radioNumero = f => Math.max(10, f.grosor * 3.4);
  /* la caja de una forma (para elegirla y sus asas) */
  function cajaDe(f) {
    if (f.tipo === 'rect' || f.tipo === 'elipse') return rectDe(f);
    if (f.tipo === 'flecha' || f.tipo === 'linea') return { x: Math.min(f.x1, f.x2), y: Math.min(f.y1, f.y2), w: Math.abs(f.x2 - f.x1), h: Math.abs(f.y2 - f.y1) };
    if (f.tipo === 'texto') return medirTexto(f).caja;
    if (f.tipo === 'numero') { const r = radioNumero(f); return { x: f.x - r, y: f.y - r, w: r * 2, h: r * 2 }; }
    const xs = (f.puntos || []).map(p => p[0]), ys = (f.puntos || []).map(p => p[1]);
    return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : { x: 0, y: 0, w: 0, h: 0 };
  }
  /* con Mayúsculas: el ángulo de 45° en 45° */
  function cuarentaYCinco(x0, y0, x, y) { const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(x - x0, y - y0); return { x: x0 + d * Math.cos(a), y: y0 + d * Math.sin(a) }; }

  /* ---------- el recorte (puro) ---------- */
  /* el recorte mientras se arrastra: `a` = { asa, p0, r0 } (asa: una esquina, un lado, 'mover' o 'nuevo'), `p` el puntero;
     con `prop` (ancho / alto), sin salirse de ella. Nunca se sale de la imagen ni baja de `min`. */
  function arrastrarRecorte(a, p, W, H, prop, min) {
    const r0 = a.r0, px = entre(p.x, 0, W), py = entre(p.y, 0, H);
    if (a.asa === 'mover') return { x: entre(r0.x + p.x - a.p0.x, 0, W - r0.w), y: entre(r0.y + p.y - a.p0.y, 0, H - r0.h), w: r0.w, h: r0.h };
    if (a.asa.length === 1) {                                          // un lado: el otro, fijo; con proporción, centrado
      if (a.asa === 'e' || a.asa === 'w') {
        const fijo = a.asa === 'e' ? r0.x : r0.x + r0.w;
        let w = entre(a.asa === 'e' ? px - fijo : fijo - px, min, a.asa === 'e' ? W - fijo : fijo), h = r0.h, y = r0.y;
        if (prop) { h = w / prop; if (h > H) { h = H; w = h * prop; } y = entre(r0.y + r0.h / 2 - h / 2, 0, H - h); }
        return { x: a.asa === 'e' ? fijo : fijo - w, y, w, h };
      }
      const fijo = a.asa === 's' ? r0.y : r0.y + r0.h;
      let h = entre(a.asa === 's' ? py - fijo : fijo - py, min, a.asa === 's' ? H - fijo : fijo), w = r0.w, x = r0.x;
      if (prop) { w = h * prop; if (w > W) { w = W; h = w / prop; } x = entre(r0.x + r0.w / 2 - w / 2, 0, W - w); }
      return { x, y: a.asa === 's' ? fijo : fijo - h, w, h };
    }
    /* una esquina (la de enfrente, fija) o uno nuevo (desde donde empezó) */
    const ax = a.asa === 'nuevo' ? entre(a.p0.x, 0, W) : a.asa.includes('w') ? r0.x + r0.w : r0.x;
    const ay = a.asa === 'nuevo' ? entre(a.p0.y, 0, H) : a.asa.includes('n') ? r0.y + r0.h : r0.y;
    const sx = px - ax < 0 ? -1 : 1, sy = py - ay < 0 ? -1 : 1;
    let w = Math.abs(px - ax), h = Math.abs(py - ay);
    if (prop) { if (w / Math.max(h, 1e-9) > prop) w = h * prop; else h = w / prop; }
    const maxW = sx > 0 ? W - ax : ax, maxH = sy > 0 ? H - ay : ay;
    if (w < min || h < min) {                                           // no por debajo del mínimo (sin salirse)
      const k = Math.max(min / Math.max(w, 1e-9), min / Math.max(h, 1e-9));
      if (prop) { w = Math.min(Math.max(w * k, min, min * prop), maxW); h = w / prop; if (h > maxH) { h = maxH; w = h * prop; } }
      else { w = Math.min(Math.max(w, min), maxW); h = Math.min(Math.max(h, min), maxH); }
    }
    return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
  }
  /* un recorte con otra proporción: con la misma superficie (sin salirse de la imagen) y centrado donde estaba */
  function conProporcion(r, prop, W, H) {
    const area = r.w * r.h;
    let w = Math.sqrt(area * prop), h = w / prop;
    const k = Math.min(1, W / w, H / h); w *= k; h *= k;
    return { x: entre(r.x + r.w / 2 - w / 2, 0, W - w), y: entre(r.y + r.h / 2 - h / 2, 0, H - h), w, h };
  }
  /* el recorte, si recorta algo: el que cubre la imagen entera (W × H) no cuenta */
  function recorteReal(r, W, H) {
    if (!r || !W) return r || null;
    return r.x < 0.5 && r.y < 0.5 && r.w > W - 1 && r.h > H - 1 ? null : r;
  }
  /* un recorte guardado, dentro de una imagen de W × H (la original pudo cambiar): recortado a ella, o null si ya no recorta */
  function recorteEn(r, W, H) {
    if (!r || !W || !H) return null;
    const x = entre(r.x, 0, W - 1), y = entre(r.y, 0, H - 1);
    return recorteReal({ x, y, w: entre(r.w, 1, W - x), h: entre(r.h, 1, H - y) }, W, H);
  }

  /* ---------- lo que se guarda en la imagen, saneado (puro) ---------- */
  const TIPOS_FORMA = ['rect', 'elipse', 'flecha', 'linea', 'texto', 'lapiz', 'numero'];
  /* las formas: solo sus tipos, números de verdad y colores en hex (lo que llega de un atributo puede venir de cualquier sitio) */
  function anotacionesValidas(xs) {
    if (!Array.isArray(xs)) return [];
    const num = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
    const col = v => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toUpperCase() : '#FF3B30');
    return xs.slice(0, 500).filter(f => f && TIPOS_FORMA.includes(f.tipo)).map(f => {
      const y = { tipo: f.tipo, color: col(f.color), grosor: Math.max(0.5, num(f.grosor) || 4) };
      ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'tam'].forEach(k => { if (f[k] !== undefined) y[k] = num(f[k]); });
      if (f.relleno) y.relleno = true;
      if (f.tipo === 'texto') { y.texto = String(f.texto || '').slice(0, 2000); if (!(y.tam > 0)) y.tam = 24; }
      if (f.tipo === 'numero') y.n = Math.max(0, Math.round(num(f.n)));
      if (f.tipo === 'lapiz') y.puntos = (Array.isArray(f.puntos) ? f.puntos : []).slice(0, 5000).filter(p => Array.isArray(p) && p.length === 2).map(p => [num(p[0]), num(p[1])]);
      return y;
    }).filter(f => f.tipo !== 'texto' || f.texto.trim());
  }
  /* el recorte: { x, y, w, h } con números de verdad, o null */
  function recorteValido(r) {
    if (!r || typeof r !== 'object') return null;
    const n = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : NaN), x = n(r.x), y = n(r.y), w = n(r.w), h = n(r.h);
    return [x, y, w, h].some(isNaN) || x < 0 || y < 0 || w < 1 || h < 1 ? null : { x, y, w, h };
  }
  const leerJson = t => { if (!t) return null; try { return JSON.parse(t); } catch (_) { return null; } };
  /* Lo que una imagen del documento dice de sí misma (sus atributos, de `getAttribute`): la que se ve, la original y lo que se
     le hizo. `original` solo si es una imagen de verdad; sin original no hay marcas ni recorte que editar. */
  function leer(at) {
    const g = k => (at && at[k] != null ? String(at[k]) : '');
    const src = g('src'), orig = g('data-original'), original = /^data:image\//i.test(orig) || /^https?:/i.test(orig) ? orig : '';
    const ancho = parseInt(g('width'), 10);
    return { src, alt: g('alt'), ancho: ancho > 0 ? ancho : null, original,
      anotaciones: original ? anotacionesValidas(leerJson(g('data-anotaciones'))) : [],
      recorte: original ? recorteValido(leerJson(g('data-recorte'))) : null };
  }
  /* Los atributos que cambian tras guardar las marcas (el resto de la imagen —alt, width…— se queda): con formas o recorte, la
     imagen nueva (`src`), la original (la de antes si ya estaba editada; si no, la que se veía) y lo hecho, en JSON; sin nada,
     vuelve la original y se quitan los tres (null = quitar el atributo). */
  function atributosTrasEditar(antes, r) {
    const original = antes.original || antes.src;
    const formas = anotacionesValidas(r && r.anotaciones), rc = recorteValido(r && r.recorte);
    if ((!formas.length && !rc) || !(r && r.datos)) return { src: original, 'data-original': null, 'data-anotaciones': null, 'data-recorte': null };
    return { src: r.datos, 'data-original': original, 'data-anotaciones': formas.length ? JSON.stringify(formas) : null, 'data-recorte': rc ? JSON.stringify(rc) : null };
  }
  /* El ancho al arrastrar un asa: `w0` el de partida, `dx` lo que se movió el puntero (en píxeles de la hoja), `lado` +1 (asa de
     la derecha) o −1 (la de la izquierda); centrada, la imagen crece por los dos lados y el asa sigue al puntero con el doble.
     Entre `min` y `max`, en píxeles enteros. */
  function anchoArrastre({ w0, dx, lado, centrada, min, max }) {
    const k = centrada ? 2 : 1, w = w0 + dx * (lado < 0 ? -1 : 1) * k;
    return Math.round(entre(w, min || 40, Math.max(min || 40, max || Infinity)));
  }

  /* ---------- pintar una forma en SVG (al editar) ---------- */
  function svgForma(f, i, escala, oculta) {
    if (oculta) return '';
    const c = f.color, g = f.grosor, golpe = Math.max(g, 14 / escala), d = ` data-i="${i}"`;
    const trazo = `stroke="${c}" stroke-width="${g}" stroke-linecap="round" stroke-linejoin="round"`;
    switch (f.tipo) {
      case 'rect': { const r = rectDe(f), rx = Math.min(g * 1.4, r.w / 2, r.h / 2);
        return `<g${d}><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}" fill="${f.relleno ? alfa(c, 0.22) : 'none'}" ${trazo} pointer-events="${f.relleno ? 'all' : 'none'}"/>`
          + `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}" fill="none" stroke="transparent" stroke-width="${golpe}" pointer-events="stroke"/></g>`; }
      case 'elipse': { const r = rectDe(f), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return `<g${d}><ellipse cx="${cx}" cy="${cy}" rx="${r.w / 2}" ry="${r.h / 2}" fill="${f.relleno ? alfa(c, 0.22) : 'none'}" ${trazo} pointer-events="${f.relleno ? 'all' : 'none'}"/>`
          + `<ellipse cx="${cx}" cy="${cy}" rx="${r.w / 2}" ry="${r.h / 2}" fill="none" stroke="transparent" stroke-width="${golpe}" pointer-events="stroke"/></g>`; }
      case 'flecha': { const p = punta(f);
        return `<g${d}><line x1="${f.x1}" y1="${f.y1}" x2="${p.fin[0]}" y2="${p.fin[1]}" ${trazo}/><polygon points="${p.tri.map(q => q.join(',')).join(' ')}" fill="${c}" stroke="${c}" stroke-width="${g * 0.6}" stroke-linejoin="round"/>`
          + `<line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}" stroke="transparent" stroke-width="${golpe}" pointer-events="stroke"/></g>`; }
      case 'linea':
        return `<g${d}><line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}" ${trazo}/><line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}" stroke="transparent" stroke-width="${golpe}" pointer-events="stroke"/></g>`;
      case 'lapiz': { const pts = (f.puntos || []).map(q => q.join(',')).join(' ');
        return `<g${d}><polyline points="${pts}" fill="none" ${trazo}/><polyline points="${pts}" fill="none" stroke="transparent" stroke-width="${golpe}" pointer-events="stroke"/></g>`; }
      case 'texto': { const m = medirTexto(f), b = m.caja;
        return `<g${d}>${f.relleno ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${f.tam * 0.24}" fill="${fondoTexto(c)}"/>` : ''}`
          + m.ls.map((l, k) => `<text x="${f.x}" y="${f.y + k * m.lh + f.tam * 0.92}" fill="${c}" style="font:${fuente(f.tam)};white-space:pre">${esc(l)}</text>`).join('')
          + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent" pointer-events="all"/></g>`; }
      case 'numero': { const r = radioNumero(f);
        return `<g${d}><circle cx="${f.x}" cy="${f.y}" r="${r}" fill="${c}" stroke="${contraste(c) === '#1C1C1E' ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.85)'}" stroke-width="${r * 0.12}" pointer-events="all"/>`
          + `<text x="${f.x}" y="${f.y + r * 0.02}" fill="${contraste(c)}" text-anchor="middle" dominant-baseline="central" style="font:${fuente(r * 1.1)}">${f.n}</text></g>`; }
      default: return '';
    }
  }
  /* las asas de la elegida: su caja y, según la forma, sus esquinas o sus extremos */
  function svgAsas(f, escala) {
    const b = cajaDe(f), r = 5.5 / escala, m = 4 / escala, asa = (x, y, k) => `<circle class="an-asa" data-asa="${k}" cx="${x}" cy="${y}" r="${r}" stroke-width="${1.6 / escala}"/>`;
    let asas = '';
    if (f.tipo === 'rect' || f.tipo === 'elipse') asas = asa(b.x, b.y, 'nw') + asa(b.x + b.w, b.y, 'ne') + asa(b.x, b.y + b.h, 'sw') + asa(b.x + b.w, b.y + b.h, 'se');
    else if (f.tipo === 'flecha' || f.tipo === 'linea') asas = asa(f.x1, f.y1, 'p1') + asa(f.x2, f.y2, 'p2');
    else if (f.tipo === 'texto') asas = asa(b.x + b.w, b.y + b.h, 'se');
    const caja = f.tipo === 'flecha' || f.tipo === 'linea' ? '' : `<rect class="an-caja-sel" x="${b.x - m}" y="${b.y - m}" width="${b.w + m * 2}" height="${b.h + m * 2}" stroke-width="${1.2 / escala}" stroke-dasharray="${5 / escala} ${4 / escala}"/>`;
    return `<g class="an-sel">${caja}${asas}</g>`;
  }
  /* el recorte: el marco encima de la imagen entera (fuera, oscuro; tercios; asas en las esquinas y los lados) */
  const CURSORES_RC = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', mover: 'move', fuera: 'crosshair' };
  function svgRecorte(r, W, H, escala) {
    const t = 1 / escala, L = Math.min(18 * t, r.w / 3, r.h / 3), g = 3 * t, hit = 22 * t, x2 = r.x + r.w, y2 = r.y + r.h;
    const zona = (k, x, y, w, h) => `<rect data-rc="${k}" x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="transparent" style="cursor:${CURSORES_RC[k]}"/>`;
    const esquinas = `M${r.x} ${r.y + L}V${r.y}H${r.x + L}M${x2 - L} ${r.y}H${x2}V${r.y + L}M${x2} ${y2 - L}V${y2}H${x2 - L}M${r.x + L} ${y2}H${r.x}V${y2 - L}`;
    const lados = `M${r.x + r.w / 2 - L / 2} ${r.y}h${L}M${r.x + r.w / 2 - L / 2} ${y2}h${L}M${r.x} ${r.y + r.h / 2 - L / 2}v${L}M${x2} ${r.y + r.h / 2 - L / 2}v${L}`;
    return `<g class="an-rc">
      <path d="M0 0H${W}V${H}H0Z M${r.x} ${r.y}V${y2}H${x2}V${r.y}Z" fill-rule="evenodd" class="an-rc-fuera" data-rc="fuera" style="cursor:crosshair"/>
      ${zona('mover', r.x, r.y, r.w, r.h)}
      <path class="an-rc-tercios" d="M${r.x + r.w / 3} ${r.y}V${y2}M${r.x + r.w * 2 / 3} ${r.y}V${y2}M${r.x} ${r.y + r.h / 3}H${x2}M${r.x} ${r.y + r.h * 2 / 3}H${x2}" stroke-width="${t}"/>
      <rect class="an-rc-borde" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" stroke-width="${1.5 * t}"/>
      <path class="an-rc-asas" d="${esquinas}${lados}" stroke-width="${g}"/>
      ${zona('n', r.x + hit / 2, r.y - hit / 2, r.w - hit, hit)}${zona('s', r.x + hit / 2, y2 - hit / 2, r.w - hit, hit)}
      ${zona('w', r.x - hit / 2, r.y + hit / 2, hit, r.h - hit)}${zona('e', x2 - hit / 2, r.y + hit / 2, hit, r.h - hit)}
      ${zona('nw', r.x - hit / 2, r.y - hit / 2, hit, hit)}${zona('ne', x2 - hit / 2, r.y - hit / 2, hit, hit)}
      ${zona('sw', r.x - hit / 2, y2 - hit / 2, hit, hit)}${zona('se', x2 - hit / 2, y2 - hit / 2, hit, hit)}</g>`;
  }

  /* ---------- pintar una forma en un canvas (al guardar) ---------- */
  function dibujar(g, f) {
    const c = f.color;
    g.save();
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = f.grosor; g.lineCap = 'round'; g.lineJoin = 'round';
    const redondeado = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    switch (f.tipo) {
      case 'rect': { const r = rectDe(f); redondeado(r.x, r.y, r.w, r.h, Math.min(f.grosor * 1.4, r.w / 2, r.h / 2)); if (f.relleno) { g.fillStyle = alfa(c, 0.22); g.fill(); } g.stroke(); break; }
      case 'elipse': { const r = rectDe(f); g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); if (f.relleno) { g.fillStyle = alfa(c, 0.22); g.fill(); } g.stroke(); break; }
      case 'flecha': {
        const p = punta(f);
        g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(p.fin[0], p.fin[1]); g.stroke();
        g.beginPath(); g.moveTo(...p.tri[0]); g.lineTo(...p.tri[1]); g.lineTo(...p.tri[2]); g.closePath(); g.lineWidth = f.grosor * 0.6; g.fill(); g.stroke();
        break;
      }
      case 'linea': g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); break;
      case 'lapiz': { const ps = f.puntos || []; if (!ps.length) break; g.beginPath(); g.moveTo(...ps[0]); ps.slice(1).forEach(q => g.lineTo(...q)); if (ps.length === 1) g.lineTo(ps[0][0] + 0.01, ps[0][1]); g.stroke(); break; }
      case 'texto': {
        const m = medirTexto(f), b = m.caja;
        if (f.relleno) { g.fillStyle = fondoTexto(c); redondeado(b.x, b.y, b.w, b.h, f.tam * 0.24); g.fill(); }
        g.fillStyle = c; g.font = fuente(f.tam); g.textBaseline = 'alphabetic';
        m.ls.forEach((l, k) => g.fillText(l, f.x, f.y + k * m.lh + f.tam * 0.92));
        break;
      }
      case 'numero': {
        const r = radioNumero(f);
        g.beginPath(); g.arc(f.x, f.y, r, 0, Math.PI * 2); g.fill();
        g.lineWidth = r * 0.12; g.strokeStyle = contraste(c) === '#1C1C1E' ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.85)'; g.stroke();
        g.fillStyle = contraste(c); g.font = fuente(r * 1.1); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(f.n), f.x, f.y + r * 0.02);
        break;
      }
      default:
    }
    g.restore();
  }

  /* ---------- la ventana ---------- */
  let S = null, V = null;
  const avisar = (op, t) => { if (op && op.avisar) op.avisar(t); else if (conDom) console.warn('Anotar ·', t); };
  /* una pregunta dentro de la propia ventana (la del editor o la de la app quedarían debajo): true si se acepta */
  function confirmar(op, texto, ok) {
    if (op && op.confirmar) return Promise.resolve(op.confirmar(texto, ok));
    const capa = (V || S) && (V || S).capa; if (!capa) return Promise.resolve(false);
    return new Promise(res => {
      const d = document.createElement('div');
      d.className = 'an-pregunta'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = `<div class="an-pregunta-caja" tabindex="-1"><p></p><div class="an-pregunta-acc"><button type="button" class="an-btn" data-no>Cancelar</button><button type="button" class="an-btn primario" data-si></button></div></div>`;
      d.querySelector('p').textContent = texto; d.querySelector('[data-si]').textContent = ok || 'Aceptar';
      const fin = v => { d.remove(); res(v); const c = capa.querySelector('.an-caja'); if (c && c.isConnected) c.focus({ preventScroll: true }); };
      d.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('[data-si]')) fin(true); else if (e.target.closest('[data-no]') || e.target === d) fin(false); });
      d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); fin(false); } else if (e.key === 'Enter') { e.preventDefault(); fin(true); } });
      capa.appendChild(d); d.querySelector('[data-si]').focus();
    });
  }
  /* Las teclas no salen de la ventana: debajo están el editor, el tablero de tramas y la ventana de una nota, que oyen en
     `document` (Cmd+Z desharía allí, Supr borraría un nodo, Esc cerraría la nota). */
  const encerrarTeclas = capa => { ['keydown', 'keyup', 'keypress'].forEach(t => capa.addEventListener(t, e => e.stopPropagation())); ['click', 'dblclick', 'contextmenu', 'mousedown', 'pointerdown'].forEach(t => capa.addEventListener(t, e => e.stopPropagation())); };
  function abrir(op) {
    const foco = V ? V.foco : S ? S.foco : document.activeElement;
    cerrar(false);
    const capa = document.createElement('div'), v = V = { capa, foco, op };
    capa.className = 'an-capa';
    capa.innerHTML = `<div class="an-caja an-vista" role="dialog" aria-modal="true" aria-label="Imagen ampliada" tabindex="-1">
      <header class="an-barra an-vista-barra"><span class="an-vista-nombre"></span>
        <span class="an-grupo an-vista-acc">
          ${op.alOriginal ? `<button type="button" class="an-btn" data-an-original title="Quitar las marcas y el recorte: la imagen como era">${IC.original}<span>Volver al original</span></button>` : ''}
          <button type="button" class="an-btn primario" data-an-editar disabled>${IC.editar}<span>Editar</span></button></span>
        <button type="button" class="an-b" data-an-cerrar title="Cerrar (Esc)" aria-label="Cerrar imagen">${IC.cerrar}</button></header>
      <div class="an-lienzo an-vista-lienzo"><img draggable="false" alt=""><span class="an-vista-estado">Cargando imagen…</span></div>
      <footer class="an-pie"><span class="an-medida"></span></footer>
    </div>`;
    encerrarTeclas(capa);
    const imagen = capa.querySelector('img'), editarBtn = capa.querySelector('[data-an-editar]'), cerrarBtn = capa.querySelector('[data-an-cerrar]'), origBtn = capa.querySelector('[data-an-original]');
    capa.querySelector('.an-vista-nombre').textContent = op.nombre || 'Imagen';
    imagen.alt = op.nombre || 'Imagen ampliada';
    imagen.onload = () => {
      if (V !== v) return;
      capa.querySelector('.an-vista-estado').hidden = true;
      capa.querySelector('.an-medida').textContent = imagen.naturalWidth + ' × ' + imagen.naturalHeight + ' px';
      editarBtn.disabled = false;
    };
    imagen.onerror = () => { if (V !== v) return; avisar(op, 'No se pudo abrir la imagen'); cerrar(); };
    editarBtn.addEventListener('click', () => { if (V === v) editar(); });
    cerrarBtn.addEventListener('click', () => cerrar());
    if (origBtn) origBtn.addEventListener('click', async () => {
      if (V !== v || !await confirmar(op, '¿Quitar las marcas y el recorte? La imagen vuelve a ser la original.', 'Volver al original')) return;
      cerrar(); op.alOriginal();
    });
    v.alClic = e => { if (e.target === capa) cerrar(); };
    v.alTecla = e => {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const botones = [origBtn, editarBtn, cerrarBtn].filter(b => b && !b.disabled), i = botones.indexOf(capa.ownerDocument.activeElement);
        botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length].focus();
      } else if (e.key === 'Enter' && e.target === capa.querySelector('.an-caja') && !editarBtn.disabled) { e.preventDefault(); editar(); }
    };
    capa.addEventListener('click', v.alClic);
    capa.addEventListener('keydown', v.alTecla);
    document.body.appendChild(capa);
    imagen.src = op.vista || op.src;
    if (op.editar) { imagen.addEventListener('load', () => { if (V === v) editar(); }, { once: true }); capa.classList.add('an-directo'); }
    cerrarBtn.focus();
  }
  async function editar() {
    const anterior = V;
    if (!anterior || anterior.editando) return;
    const op = anterior.op, foco = anterior.foco;
    anterior.editando = true;
    const boton = anterior.capa.querySelector('[data-an-editar]');
    boton.setAttribute('aria-busy', 'true');
    /* la vista se queda mientras se decodifica la original: ni un lienzo vacío ni otra vez el fundido de la ventana */
    const original = new Image(); original.alt = op.nombre || ''; original.draggable = false; original.src = op.src;
    try { await original.decode(); }
    catch (_) {
      if (V === anterior) { anterior.editando = false; boton.removeAttribute('aria-busy'); avisar(op, 'No se pudo abrir la imagen para editarla'); }
      return;
    }
    if (V !== anterior) return;
    const capa = anterior.capa;
    capa.removeEventListener('click', anterior.alClic);
    capa.removeEventListener('keydown', anterior.alTecla);
    capa.classList.remove('an-directo');
    V = null;
    const formas0 = anotacionesValidas(op.anotaciones);
    S = { op, foco, formas: clonar(formas0), recorte: recorteValido(op.recorte), sel: -1, herr: formas0.length || op.recorte ? 'mover' : 'rect',
      color: '#FF3B30', grosor: 'medio', relleno: false, pasado: [], futuro: [], arr: null, editando: -1, W: 0, H: 0, escala: 1, base: 3, prop: 'libre', vertical: false };
    S.capa = capa;
    const boton2 = (k, t, a, i) => `<button type="button" class="an-b" data-an-herr="${k}" title="${t} (${a})" aria-label="${t}">${i}</button>`;
    capa.innerHTML = `<div class="an-caja" role="dialog" aria-modal="true" aria-label="Marcar y recortar la imagen" tabindex="-1">
        <header class="an-barra">
          <div class="an-grupo">${HERRAMIENTAS.slice(0, -1).map(h => boton2(...h)).join('')}</div>
          <i class="an-sep"></i>
          <div class="an-grupo">${HERRAMIENTAS.slice(-1).map(h => boton2(...h)).join('')}</div>
          <i class="an-sep"></i>
          <div class="an-grupo an-colores">${COLORES.map(([t, c]) => `<button type="button" class="an-color" data-an-color="${c}" style="--c:${c}" title="${t}" aria-label="${t}"><i></i></button>`).join('')}</div>
          <i class="an-sep"></i>
          <div class="an-grupo">${GROSORES.map(([k, t, n]) => `<button type="button" class="an-b an-grosor" data-an-grosor="${k}" title="${t}" aria-label="Grosor ${t.toLowerCase()}"><i style="height:${Math.round(n * 1.6)}px"></i></button>`).join('')}
            <button type="button" class="an-b" data-an-relleno title="Relleno: fondo translúcido en rectángulos y círculos, caja detrás del texto" aria-label="Relleno">${svgIc('<rect x="3" y="3" width="10" height="10" rx="1.6" fill="currentColor" fill-opacity=".35"/>')}</button></div>
          <i class="an-sep"></i>
          <div class="an-grupo">
            <button type="button" class="an-b" data-an-deshacer title="Deshacer (${tecla('Mod+Z')})" aria-label="Deshacer">${IC.deshacer}</button>
            <button type="button" class="an-b" data-an-rehacer title="Rehacer (${tecla('Mod+Shift+Z')})" aria-label="Rehacer">${IC.rehacer}</button>
            <button type="button" class="an-b" data-an-borrar title="Borrar la marca elegida (Supr)" aria-label="Borrar la marca elegida">${IC.papelera}</button></div>
          <span class="an-espacio"></span>
          <button type="button" class="an-btn" data-an-limpiar title="Quitar todas las marcas">Quitar las marcas</button>
          <button type="button" class="an-btn" data-an-cancelar>Cancelar</button>
          <button type="button" class="an-btn primario" data-an-guardar title="Guardar (${tecla('Mod+Enter')})">Guardar</button>
        </header>
        <div class="an-subbarra" data-an-rc-barra hidden>
          <span class="an-sub-rot">Proporción</span>
          <div class="an-grupo">${PROPORCIONES.map(([k, t]) => `<button type="button" class="an-chip" data-an-prop="${k}">${t}</button>`).join('')}
            <button type="button" class="an-b" data-an-girar title="Girar la proporción: horizontal o vertical" aria-label="Girar la proporción">${IC.girar}</button></div>
          <span class="an-rc-medida" data-an-rc-medida></span>
          <span class="an-espacio"></span>
          <button type="button" class="an-btn" data-an-sin-recorte title="La imagen entera, sin recortar">Quitar el recorte</button>
          <button type="button" class="an-btn" data-an-rc-listo title="Ver la imagen recortada (Enter)">Listo</button>
        </div>
        <div class="an-lienzo"><div class="an-marco"><img alt="" draggable="false"><svg class="an-svg" xmlns="http://www.w3.org/2000/svg"></svg></div></div>
        <footer class="an-pie"><span class="an-nombre"></span><span class="an-medida"></span><span class="an-espacio"></span><span class="an-ayuda"></span></footer>
      </div>`;
    capa.querySelector('.an-marco img').replaceWith(original);
    S.marco = capa.querySelector('.an-marco'); S.img = original; S.svg = capa.querySelector('.an-svg');
    capa.querySelector('.an-nombre').textContent = op.nombre || '';
    S.W = original.naturalWidth; S.H = original.naturalHeight;
    S.base = Math.max(2, Math.round(Math.max(S.W, S.H) / 320));
    S.recorte = recorteEn(S.recorte, S.W, S.H);                        // el de antes, dentro de esta imagen
    S.inicial = estado();
    montarEventos(capa);
    colocar(); pintarBarra();
    capa.querySelector('.an-caja').focus();
  }
  function cerrar(reponerFoco = true) {
    const foco = V ? V.foco : S && S.foco, op = V ? V.op : S && S.op;
    const habia = !!(V || S);
    if (V) { V.capa.remove(); V = null; }
    if (S) { window.removeEventListener('resize', S.alCambiarTamano); S.capa.remove(); S = null; }
    if (reponerFoco && foco && foco.isConnected && foco.focus) foco.focus({ preventScroll: true });
    if (habia && reponerFoco && op && op.alCerrar) op.alCerrar();
  }
  const sucio = () => !!S && estado() !== S.inicial;
  async function salir() {
    if (sucio() && !await confirmar(S.op, '¿Salir sin guardar las marcas?', 'Salir sin guardar')) return;
    cerrar();
  }
  const recorteDeS = () => recorteReal(S.recorte, S.W, S.H);
  /* lo que se ve: la imagen entera (al recortar, o sin recorte) o solo lo recortado */
  const vista = () => (S.herr === 'recortar' || !recorteDeS() ? { x: 0, y: 0, w: S.W, h: S.H } : S.recorte);
  /* la imagen, tan grande como quepa (sin pasar de dos veces la suya) */
  function colocar() {
    if (!S || !S.W) return;
    const l = S.capa.querySelector('.an-lienzo'), aw = l.clientWidth - 48, ah = l.clientHeight - 48, v = vista(), k = S.escala = Math.max(0.05, Math.min(aw / v.w, ah / v.h, 2));
    const recortada = v.w !== S.W || v.h !== S.H || v.x || v.y;
    S.marco.style.width = Math.round(v.w * k) + 'px'; S.marco.style.height = Math.round(v.h * k) + 'px';
    S.marco.classList.toggle('recortada', !!recortada);
    S.img.style.cssText = recortada ? `position:absolute;max-width:none;left:${-v.x * k}px;top:${-v.y * k}px;width:${S.W * k}px;height:${S.H * k}px` : '';
    S.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    pintar();
  }
  const grosorPx = k => S.base * (GROSORES.find(g => g[0] === k) || GROSORES[1])[2];
  const tamTexto = k => Math.round(S.base * 7 * (0.7 + (GROSORES.find(g => g[0] === k) || GROSORES[1])[2] * 0.22));
  function pintar() {
    if (!S || !S.W) return;
    const rc = S.herr === 'recortar';
    S.svg.innerHTML = S.formas.map((f, i) => svgForma(f, i, S.escala, i === S.editando)).join('')
      + (rc ? svgRecorte(S.recorte, S.W, S.H, S.escala) : S.sel >= 0 && S.formas[S.sel] && S.editando < 0 ? svgAsas(S.formas[S.sel], S.escala) : '');
    S.marco.dataset.herr = S.herr;
    const r = recorteDeS(), px = n => Math.round(n), m = S.W + ' × ' + S.H + ' px' + (r ? ' → ' + px(r.w) + ' × ' + px(r.h) + ' px' : '');
    S.capa.querySelector('.an-medida').textContent = m;
    const rm = S.capa.querySelector('[data-an-rc-medida]'); if (rm) rm.textContent = r ? px(r.w) + ' × ' + px(r.h) + ' px' : 'La imagen entera';
  }
  function pintarBarra() {
    const b = S.capa.querySelector('.an-barra'), f = S.formas[S.sel];
    b.querySelectorAll('[data-an-herr]').forEach(x => x.classList.toggle('on', x.dataset.anHerr === S.herr));
    b.querySelectorAll('[data-an-color]').forEach(x => x.classList.toggle('on', x.dataset.anColor === (f ? f.color : S.color)));
    const gk = f ? (GROSORES.find(g => Math.abs(grosorPx(g[0]) - f.grosor) < 0.01 || (f.tipo === 'texto' && tamTexto(g[0]) === f.tam)) || [null])[0] : S.grosor;
    b.querySelectorAll('[data-an-grosor]').forEach(x => x.classList.toggle('on', x.dataset.anGrosor === gk));
    b.querySelector('[data-an-relleno]').classList.toggle('on', f ? !!f.relleno : S.relleno);
    b.querySelector('[data-an-deshacer]').disabled = !S.pasado.length;
    b.querySelector('[data-an-rehacer]').disabled = !S.futuro.length;
    b.querySelector('[data-an-borrar]').disabled = S.sel < 0;
    b.querySelector('[data-an-limpiar]').disabled = !S.formas.length;
    const rc = S.herr === 'recortar', sb = S.capa.querySelector('[data-an-rc-barra]');
    sb.hidden = !rc;
    sb.querySelectorAll('[data-an-prop]').forEach(x => {
      x.classList.toggle('on', x.dataset.anProp === S.prop);
      const p = PROPORCIONES.find(q => q[0] === x.dataset.anProp);
      if (typeof p[2] === 'number' && p[2] !== 1) x.textContent = S.vertical ? p[1].split(':').reverse().join(':') : p[1];
    });
    sb.querySelector('[data-an-girar]').classList.toggle('on', S.vertical);
    sb.querySelector('[data-an-sin-recorte]').disabled = !recorteDeS();
    S.capa.querySelector('.an-ayuda').textContent = rc ? 'Arrastra las esquinas o los lados · dentro, para moverlo · fuera, otro · Mayúsculas: sin cambiar la proporción · Enter: listo'
      : 'Mayúsculas: cuadrados, círculos y 45° · doble clic en un texto: cambiarlo · Esc: soltar o cerrar';
  }
  /* la proporción del recorte (ancho / alto) o null (libre) */
  function proporcion() {
    const p = PROPORCIONES.find(q => q[0] === S.prop); if (!p || !p[2]) return null;
    const v = p[2] === 'orig' ? S.W / S.H : p[2];
    return S.vertical && v !== 1 ? 1 / v : v;
  }
  function ponerProporcion(k, vertical) {
    historia();
    S.prop = k; if (vertical !== undefined) S.vertical = vertical;
    const pr = proporcion();
    if (pr) S.recorte = conProporcion(S.recorte, pr, S.W, S.H);
    pintar(); pintarBarra();
  }
  /* cambiar de herramienta: recortar enseña la imagen entera con el marco; al salir, recortada */
  function ponerHerr(h) {
    terminarTexto();
    if (h === S.herr || (h === 'recortar' && !S.W)) return;
    const eraRc = S.herr === 'recortar';
    S.herr = h;
    if (h !== 'mover') S.sel = -1;
    if (h === 'recortar' && !S.recorte) S.recorte = { x: 0, y: 0, w: S.W, h: S.H };
    if (eraRc && !recorteDeS()) S.recorte = null;
    pintarBarra();                                                     // antes de medir: la tira del recorte cambia el alto
    if (h === 'recortar' || eraRc) colocar(); else pintar();
  }
  /* la historia: cada cambio guarda cómo estaba (las formas y el recorte; un JSON de solo las formas rompía deshacer) */
  function estado() { return JSON.stringify({ formas: S.formas, recorte: S.W ? recorteDeS() : S.recorte }); }
  function restaurar(json) {
    const x = JSON.parse(json);
    S.formas = x.formas; S.recorte = x.recorte || (S.herr === 'recortar' ? { x: 0, y: 0, w: S.W, h: S.H } : null); S.sel = -1;
    if (S.herr === 'recortar') pintar(); else colocar();                // fuera de la herramienta, lo que se ve cambia con el recorte
    pintarBarra();
  }
  function historia() { S.pasado.push(estado()); if (S.pasado.length > 200) S.pasado.shift(); S.futuro = []; }
  function deshacer() { if (!S || S.editando >= 0 || !S.pasado.length) return; S.futuro.push(estado()); restaurar(S.pasado.pop()); }
  function rehacer() { if (!S || S.editando >= 0 || !S.futuro.length) return; S.pasado.push(estado()); restaurar(S.futuro.pop()); }
  function elegir(i) { S.sel = i; pintar(); pintarBarra(); }
  function borrar() { if (S.sel < 0) return; historia(); S.formas.splice(S.sel, 1); S.sel = -1; pintar(); pintarBarra(); }
  /* el color, el grosor o el relleno: para lo que se dibuje y, si hay una elegida, también para ella */
  function aplicar(cambio) {
    Object.assign(S, cambio);
    const f = S.formas[S.sel];
    if (f) {
      historia();
      if (cambio.color) f.color = cambio.color;
      if (cambio.grosor) { if (f.tipo === 'texto') f.tam = tamTexto(cambio.grosor); else f.grosor = grosorPx(cambio.grosor); }
      if (cambio.relleno !== undefined) { if (cambio.relleno) f.relleno = true; else delete f.relleno; }
    }
    pintar(); pintarBarra();
  }
  const punto = e => { const r = S.svg.getBoundingClientRect(), v = vista(); return { x: v.x + (e.clientX - r.left) / r.width * v.w, y: v.y + (e.clientY - r.top) / r.height * v.h }; };
  function nuevaForma(tipo, p) {
    const base = { tipo, color: S.color, grosor: grosorPx(S.grosor) };
    if (S.relleno && (tipo === 'rect' || tipo === 'elipse')) base.relleno = true;
    if (tipo === 'rect' || tipo === 'elipse') return Object.assign(base, { x: p.x, y: p.y, w: 0, h: 0 });
    if (tipo === 'flecha' || tipo === 'linea') return Object.assign(base, { x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    return Object.assign(base, { puntos: [[p.x, p.y]] });
  }
  /* ---------- el texto: un campo encima, donde se escribe ---------- */
  function editarTexto(i) {
    terminarTexto();
    const f = S.formas[i]; if (!f) return;
    S.editando = i; S.sel = i; pintar(); pintarBarra();
    const ta = document.createElement('textarea');
    ta.className = 'an-texto'; ta.value = f.texto; ta.spellcheck = true; ta.rows = 1;
    const k = S.escala, pad = f.relleno ? f.tam * 0.36 : 0, v = vista();
    ta.style.cssText = `left:${(f.x - pad - v.x) * k}px;top:${(f.y - pad - v.y) * k}px;font:${fuente(f.tam * k)};line-height:1.25;color:${f.color};padding:${pad * k}px;border-radius:${f.tam * 0.24 * k}px;`
      + (f.relleno ? `background:${fondoTexto(f.color)};` : '');
    const ajustar = () => { ta.style.width = '10px'; ta.style.height = '10px'; ta.style.width = Math.max(40, ta.scrollWidth + 4) + 'px'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', () => { f.texto = ta.value; ajustar(); });
    ta.addEventListener('keydown', e => {
      if ((e.key === 'Enter' && !e.shiftKey && !e.isComposing) || e.key === 'Escape') { e.preventDefault(); terminarTexto(); }
    });
    ta.addEventListener('blur', () => terminarTexto());
    S.marco.appendChild(ta); S.textoCampo = ta;
    ajustar(); ta.focus(); ta.select();
  }
  function terminarTexto() {
    if (!S || S.editando < 0) return;
    const i = S.editando, f = S.formas[i], ta = S.textoCampo;
    S.editando = -1; S.textoCampo = null;
    if (ta) ta.remove();
    if (f && !String(f.texto).trim()) { S.formas.splice(i, 1); S.sel = -1; }
    pintar(); pintarBarra();
    S.capa.querySelector('.an-caja').focus();
  }

  function montarEventos(capa) {
    S.alCambiarTamano = () => colocar();
    window.addEventListener('resize', S.alCambiarTamano);
    capa.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.anHerr) { ponerHerr(b.dataset.anHerr); return; }
      if (b.dataset.anProp) { ponerProporcion(b.dataset.anProp); return; }
      if (b.matches('[data-an-girar]')) { ponerProporcion(S.prop, !S.vertical); return; }
      if (b.matches('[data-an-sin-recorte]')) { if (recorteDeS()) { historia(); S.recorte = { x: 0, y: 0, w: S.W, h: S.H }; S.prop = 'libre'; pintar(); pintarBarra(); } return; }
      if (b.matches('[data-an-rc-listo]')) { ponerHerr('mover'); return; }
      if (b.dataset.anColor) { aplicar({ color: b.dataset.anColor }); return; }
      if (b.dataset.anGrosor) { aplicar({ grosor: b.dataset.anGrosor }); return; }
      if (b.matches('[data-an-relleno]')) { const f = S.formas[S.sel]; aplicar({ relleno: !(f ? f.relleno : S.relleno) }); return; }
      if (b.matches('[data-an-deshacer]')) { deshacer(); return; }
      if (b.matches('[data-an-rehacer]')) { rehacer(); return; }
      if (b.matches('[data-an-borrar]')) { borrar(); return; }
      if (b.matches('[data-an-limpiar]')) { if (S.formas.length) { historia(); S.formas = []; S.sel = -1; pintar(); pintarBarra(); } return; }
      if (b.matches('[data-an-cancelar]')) { salir(); return; }
      if (b.matches('[data-an-guardar]')) guardar();
    });
    /* un clic en el fondo, fuera de la imagen: soltar la elegida */
    capa.querySelector('.an-lienzo').addEventListener('pointerdown', e => { if (e.target.classList.contains('an-lienzo')) { terminarTexto(); elegir(-1); } });
    const svg = S.svg;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !S.W) return;
      e.preventDefault();
      if (S.editando >= 0) terminarTexto();
      const p = punto(e), asa = e.target.closest('[data-asa]'), g = e.target.closest('[data-i]');
      const i = g ? +g.dataset.i : -1, f = i >= 0 ? S.formas[i] : null;
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* un puntero de pruebas */ }
      if (S.herr === 'recortar') {
        const z = e.target.closest('[data-rc]'), k = z ? z.dataset.rc : 'fuera';
        S.arr = { tipo: 'recorte', asa: k === 'fuera' ? 'nuevo' : k, p0: p, r0: Object.assign({}, S.recorte), antes: estado() };
        return;
      }
      if (asa && S.sel >= 0) { S.arr = { tipo: 'asa', asa: asa.dataset.asa, p0: p, f0: clonar([S.formas[S.sel]])[0], antes: estado() }; return; }
      if (S.herr === 'texto' && f && f.tipo === 'texto') { editarTexto(i); return; }
      if (f && S.herr !== 'lapiz') { elegir(i); S.arr = { tipo: 'mover', p0: p, f0: clonar([f])[0], antes: estado() }; return; }
      if (S.herr === 'mover') { elegir(-1); return; }
      if (S.herr === 'texto') {
        historia();
        S.formas.push(Object.assign({ tipo: 'texto', x: p.x, y: p.y, texto: '', color: S.color, grosor: grosorPx(S.grosor), tam: tamTexto(S.grosor) }, S.relleno ? { relleno: true } : {}));
        editarTexto(S.formas.length - 1);
        return;
      }
      if (S.herr === 'numero') {
        historia();
        const n = Math.max(0, ...S.formas.filter(x => x.tipo === 'numero').map(x => x.n || 0)) + 1;
        S.formas.push({ tipo: 'numero', x: p.x, y: p.y, n, color: S.color, grosor: grosorPx(S.grosor) });
        elegir(S.formas.length - 1);
        return;
      }
      const antes = estado();
      S.formas.push(nuevaForma(S.herr, p)); S.sel = S.formas.length - 1;
      S.arr = { tipo: 'dibujar', p0: p, antes };
      pintar();
    });
    svg.addEventListener('pointermove', e => {
      if (!S || !S.arr) return;
      const a = S.arr, p = punto(e);
      if (a.tipo === 'recorte') {
        if (a.asa === 'nuevo' && Math.hypot(p.x - a.p0.x, p.y - a.p0.y) * S.escala < 4) return;      // un clic suelto no traza otro
        const pr = proporcion() || (e.shiftKey && a.asa !== 'mover' ? a.r0.w / a.r0.h : null);
        const r = arrastrarRecorte(a, p, S.W, S.H, pr, Math.max(4, 16 / S.escala));
        if (r.w >= 1 && r.h >= 1) S.recorte = r;                         // contra un borde de la imagen, se queda como estaba
        pintar(); pintarBarra(); return;
      }
      const f = S.formas[S.sel]; if (!f) return;
      if (a.tipo === 'dibujar') {
        if (f.tipo === 'rect' || f.tipo === 'elipse') {
          let w = p.x - a.p0.x, h = p.y - a.p0.y;
          if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          f.w = w; f.h = h;
        } else if (f.tipo === 'flecha' || f.tipo === 'linea') { const q = e.shiftKey ? cuarentaYCinco(f.x1, f.y1, p.x, p.y) : p; f.x2 = q.x; f.y2 = q.y; }
        else if (f.tipo === 'lapiz') { const u = f.puntos[f.puntos.length - 1]; if (Math.hypot(p.x - u[0], p.y - u[1]) * S.escala >= 2) f.puntos.push([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]); }
      } else if (a.tipo === 'mover') {
        const dx = p.x - a.p0.x, dy = p.y - a.p0.y, o = a.f0;
        ['x', 'x1', 'x2'].forEach(k => { if (o[k] !== undefined) f[k] = o[k] + dx; });
        ['y', 'y1', 'y2'].forEach(k => { if (o[k] !== undefined) f[k] = o[k] + dy; });
        if (o.puntos) f.puntos = o.puntos.map(q => [q[0] + dx, q[1] + dy]);
      } else if (a.tipo === 'asa') {
        const o = a.f0;
        if (a.asa === 'p1' || a.asa === 'p2') {
          const fijo = a.asa === 'p1' ? [o.x2, o.y2] : [o.x1, o.y1], q = e.shiftKey ? cuarentaYCinco(fijo[0], fijo[1], p.x, p.y) : p;
          if (a.asa === 'p1') { f.x1 = q.x; f.y1 = q.y; } else { f.x2 = q.x; f.y2 = q.y; }
        } else if (f.tipo === 'texto') {
          const m0 = medirTexto(o).caja, alto = Math.max(8, p.y - m0.y);
          f.tam = Math.max(8, Math.round(o.tam * alto / Math.max(1, m0.h)));
        } else {
          const r = rectDe(o), x1 = a.asa.includes('w') ? p.x : r.x, x2 = a.asa.includes('e') ? p.x : r.x + r.w;
          const y1 = a.asa.includes('n') ? p.y : r.y, y2 = a.asa.includes('s') ? p.y : r.y + r.h;
          f.x = x1; f.y = y1; f.w = x2 - x1; f.h = y2 - y1;
        }
      }
      pintar();
    });
    const soltar = () => {
      if (!S || !S.arr) return;
      const a = S.arr, f = S.formas[S.sel]; S.arr = null;
      if (a.tipo === 'recorte') { if (estado() !== a.antes) { S.pasado.push(a.antes); S.futuro = []; } pintar(); pintarBarra(); return; }
      if (a.tipo === 'dibujar' && f) {
        const b = cajaDe(f), chica = Math.max(b.w, b.h) * S.escala < 4;
        if (chica && f.tipo !== 'lapiz') { S.formas.splice(S.sel, 1); S.sel = -1; pintar(); pintarBarra(); return; }
        if (f.tipo === 'rect' || f.tipo === 'elipse') Object.assign(f, rectDe(f));
      }
      if (estado() !== a.antes) { S.pasado.push(a.antes); S.futuro = []; }
      pintar(); pintarBarra();
    };
    svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
    svg.addEventListener('dblclick', e => { const g = e.target.closest('[data-i]'); if (g && S.formas[+g.dataset.i] && S.formas[+g.dataset.i].tipo === 'texto') editarTexto(+g.dataset.i); });
    capa.addEventListener('keydown', e => {
      if (!S || S.editando >= 0 || (e.target.matches && e.target.matches('textarea, input'))) return;
      const mod = mac ? e.metaKey : e.ctrlKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
      if (mod && k === 'y') { e.preventDefault(); rehacer(); return; }
      if (mod && (e.key === 'Enter' || k === 's')) { e.preventDefault(); guardar(); return; }
      if (S.herr === 'recortar' && !mod && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); ponerHerr('mover'); return; }
      if (S.herr === 'recortar' && e.key.startsWith('Arrow')) {                // mover el recorte
        e.preventDefault();
        const d = (e.shiftKey ? 10 : 1) / S.escala, r = S.recorte;
        historia();
        S.recorte = { x: entre(r.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0), 0, S.W - r.w), y: entre(r.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0), 0, S.H - r.h), w: r.w, h: r.h };
        pintar(); pintarBarra(); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); if (S.sel >= 0) elegir(-1); else salir(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel >= 0) { e.preventDefault(); borrar(); return; }
      if (e.key.startsWith('Arrow') && S.sel >= 0) {
        e.preventDefault();
        const f = S.formas[S.sel], d = (e.shiftKey ? 10 : 1) / S.escala, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        historia();
        ['x', 'x1', 'x2'].forEach(q => { if (f[q] !== undefined) f[q] += dx; });
        ['y', 'y1', 'y2'].forEach(q => { if (f[q] !== undefined) f[q] += dy; });
        if (f.puntos) f.puntos = f.puntos.map(q => [q[0] + dx, q[1] + dy]);
        pintar(); pintarBarra(); return;
      }
      if (!mod && !e.altKey) { const h = HERRAMIENTAS.find(x => x[2].toLowerCase() === k); if (h) { e.preventDefault(); ponerHerr(h[0]); } }
    });
  }

  /* ---------- guardar: la imagen recortada y con las marcas pintadas (en su formato, sin pasar de 4096 px), las formas y el
     recorte ---------- */
  function guardar() {
    if (!S || !S.W) return;
    terminarTexto();
    const op = S.op, formas = clonar(S.formas), rc = recorteDeS();
    const recorte = rc ? { x: Math.round(rc.x), y: Math.round(rc.y), w: Math.max(1, Math.round(rc.w)), h: Math.max(1, Math.round(rc.h)) } : null;
    if (!formas.length && !recorte) { cerrar(); op.alGuardar({ anotaciones: [], recorte: null }); return; }
    const r = recorte || { x: 0, y: 0, w: S.W, h: S.H }, k = Math.min(1, 4096 / Math.max(r.w, r.h)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(r.w * k)); cv.height = Math.max(1, Math.round(r.h * k));
    const g = cv.getContext('2d');
    g.scale(k, k); g.translate(-r.x, -r.y);
    g.drawImage(S.img, 0, 0, S.W, S.H);
    formas.forEach(f => dibujar(g, f));
    const tipo = /^image\/(png|jpeg|webp)$/.test(op.tipo || '') ? op.tipo : 'image/png';
    let datos;
    try { datos = cv.toDataURL(tipo, 0.92); } catch (_) { avisar(op, 'No se pudo guardar la imagen marcada'); return; }
    cerrar();
    op.alGuardar({ datos, tipo, anotaciones: formas, recorte });
  }
  /* Una imagen (data URL) tan ligera como una pegada, con la regla de `imagenLigera` de editor.js: por encima de 200 KB, a 1600 px
     por el lado largo en WebP 0,82 (JPEG si no hay WebP), y si no aligera, la que era. Para la ventana de una nota, que no tiene
     el editor cargado; el editor usa la suya. */
  async function ligera(url) {
    if (!conDom || !/^data:image\//i.test(url || '') || url.length * 0.75 <= 200 * 1024 || /^data:image\/(gif|svg)/i.test(url) || !window.createImageBitmap) return url;
    try {
      const i = url.indexOf(','), cab = url.slice(0, i), bin = /;base64/i.test(cab) ? atob(url.slice(i + 1)) : decodeURIComponent(url.slice(i + 1));
      const u8 = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
      const bmp = await createImageBitmap(new Blob([u8], { type: tipoDe(url) || 'image/png' }));
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      let r = cv.toDataURL('image/webp', 0.82);
      if (!r.startsWith('data:image/webp')) r = cv.toDataURL('image/jpeg', 0.82);
      return r.length < url.length ? r : url;
    } catch (_) { return url; }
  }
  /* el tipo de una data URL («image/png»…) */
  const tipoDe = src => { const m = /^data:(image\/[a-z0-9.+-]+)[;,]/i.exec(String(src || '')); return m ? m[1].toLowerCase() : ''; };

  const Anotar = {
    abrir, cerrar, abierto: () => !!(S || V), editando: () => !!S, deshacer, rehacer,
    /* lo puro (también en Node) */
    dibujar, rectDe, punta, cajaDe, medirTexto, cuarentaYCinco, arrastrarRecorte, conProporcion, recorteReal, recorteEn,
    anotacionesValidas, recorteValido, leer, atributosTrasEditar, anchoArrastre, tipoDe, contraste, TIPOS_FORMA, ligera
  };
  raiz.Anotar = Anotar;
  if (raiz.Ed) raiz.Ed.anotar = Anotar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Anotar;
})(typeof window !== 'undefined' ? window : globalThis);
