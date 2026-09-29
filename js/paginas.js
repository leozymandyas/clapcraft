/* Páginas: la hoja continua del editor se ve partida en hojas, como en un procesador de textos, para
   saber cuántas páginas lleva el guion y cuánto duraría (una página de guion ≈ un minuto en pantalla).

   **Las reparte el mismo maquetador que el PDF** (js/claquedraw/maquetar.js; Leo, 18-09-2026: «verifica que el contador de
   páginas del editor coincida con lo del pdf»): en renglones de un guion impreso (Carta, Courier 12, 60 caracteres por renglón y
   54 renglones por página), con sus reglas de corte (un encabezado no se queda solo al pie, una transición no abre página, un acto
   empieza página, un diálogo largo se parte al final de una oración con «(MORE)» y «(CONT'D)»). Los bloques los arma
   `bloquesDe`, igual que para el PDF (con las escenas numeradas si «Nº escenas» está encendido y sin las notas si la exportación
   las oculta), así que el número de páginas no depende del ancho de la hoja en pantalla ni del tamaño de letra.

   Aquí solo se dibuja, sin tocar el documento ni el Deshacer: cuando una página empieza en un bloque, ese bloque recibe margen
   superior con una hoja de estilos propia (`#editor > :nth-child(n) { margin-top }`) para que empiece en la hoja siguiente; entre
   hoja y hoja se dibuja el hueco (capa `.pag-capa` dentro de #pageWrap, fuera del contenteditable). Cuando empieza a mitad de un
   bloque (un diálogo o una acción partidos), una raya marca dónde se corta. Cada hoja mide al menos 54 renglones de la hoja y crece
   si lo que cabe en una página impresa ocupa más en pantalla. El número va arriba a la derecha, «2.», sin el de la primera. */
(function (Ed) {
  'use strict';
  const P = {};
  Ed.paginas = P;
  const LINEAS = 54;           // renglones por página de guion
  const HUECO = 26;            // px de lienzo entre hoja y hoja
  const CLAVE_SIN_NOTAS = 'guiones.claquedraw.exportar.sinNotas';   // la casilla «Ocultar las notas del guion» de Exportar
  let estilo, alto, capa, contador, pendiente = null, ancho = 0, total = 1, portada = false;

  const num = v => parseFloat(v) || 0;
  const sinNotas = () => { try { return localStorage.getItem(CLAVE_SIN_NOTAS) === '1'; } catch (_) { return false; } };

  /* el nodo y el desplazamiento del carácter `off` del texto de un bloque, contado como en el maquetador (un <br> es un carácter;
     los espacios de anchura cero no cuentan) */
  function posicion(el, off) {
    let visto = 0, res = null;
    const ir = n => {
      for (const x of Array.from(n.childNodes)) {
        if (res) return;
        if (x.nodeType === 3) {
          const v = x.nodeValue;
          for (let i = 0; i < v.length; i++) {
            if (v[i] === '\u200B') continue;
            if (visto === off) { res = { n: x, o: i }; return; }
            visto++;
          }
        } else if (x.nodeName === 'BR') {
          if (visto === off) { res = { n: x.parentNode, o: Array.prototype.indexOf.call(x.parentNode.childNodes, x) }; return; }
          visto++;
        } else if (x.nodeType === 1) ir(x);
      }
    };
    ir(el);
    return res;
  }
  /* a qué altura del bloque (en px sin zoom, desde su borde de arriba) empieza el renglón de ese carácter: se mide el propio
     carácter (un rango plegado al principio de un renglón puede dar el final del anterior) */
  function alturaEn(el, off) {
    const p = posicion(el, off), caja = el.getBoundingClientRect();
    if (!p || !caja.height) return el.offsetHeight / 2;
    const r = document.createRange();
    r.setStart(p.n, p.o);
    if (p.n.nodeType === 3 && p.o < p.n.nodeValue.length) r.setEnd(p.n, p.o + 1); else r.collapse(true);
    const rc = r.getClientRects()[0] || r.getBoundingClientRect();
    if (!rc || !rc.height) return el.offsetHeight / 2;
    return Math.max(0, Math.min(el.offsetHeight, (rc.top - caja.top) / caja.height * el.offsetHeight));
  }
  /* el selector de un elemento del documento (o de un elemento de una lista) para su margen de salto */
  function selector(ed, k) {
    const idx = n => Array.prototype.indexOf.call(n.parentNode.children, n) + 1;
    return k.parentNode === ed ? `#editor > :nth-child(${idx(k)})` : `#editor > :nth-child(${idx(k.parentNode)}) > :nth-child(${idx(k)})`;
  }

  /* **Sin quitar nodos de la página** (29-09-2026): Chrome cierra la agrupación de lo tecleado —y cada letra pasa a ser un paso de
     Deshacer— en cuanto se quita un nodo del documento fuera de un `execCommand`, aunque no sea del editor (ver Ed.pintarFilas).
     Asignar `textContent` quita el texto de antes aunque sea el mismo: el contador de la barra lo hacía en cada cálculo, así que
     escribiendo con pausas de más de 120 ms cada letra se deshacía sola. Aquí se cambia el texto que ya estaba. */
  function ponerTexto(el, v) {
    const t = el.firstChild;
    if (t && t.nodeType === 3 && t === el.lastChild) { if (t.nodeValue !== v) t.nodeValue = v; return; }
    if (!t) { el.appendChild(document.createTextNode(v)); return; }
    el.textContent = v;
  }

  /* **Sin rehacer lo que no cambió** (29-09-2026, revisión del editor: con 184 páginas cada cálculo costaba 50-60 ms y se notaba un
     tirón al parar de escribir; más de la mitad era quitar y volver a poner los márgenes de salto, que rehace la maqueta del documento
     entero dos veces). Los bloques y las páginas del maquetador se calculan siempre (son baratos y no dependen de los márgenes), y lo
     de pantalla solo depende de dónde empieza cada página (bloque y carácter), de lo que miden los bloques (alto, clase, estilo) y,
     en un bloque partido por dentro, de su texto. Si nada de eso cambió desde el último cálculo (lo normal al teclear dentro de un
     renglón), los márgenes y las rayas ya están bien y no se tocan. Los altos se miden con los márgenes puestos (no cambian el alto
     de un bloque; en una lista partida, a lo sumo, hacen un cálculo de más). */
  let ultimo = null;                               // { els, firma: [], pags } del último cálculo completo
  function firmaDe(els, bloques, indices, prefijos, pags, extra) {
    const f = [extra];
    els.forEach(el => f.push(el.offsetHeight + '|' + el.className + '|' + (el.getAttribute('style') || '')));
    pags.slice(1).forEach(pg => {
      const x = pg.find(y => y.i !== undefined); if (!x) { f.push('-'); return; }
      const off = x.desde - prefijos[x.i];
      f.push(indices[x.i] + ':' + (off > 0 ? off + ':' + bloques[x.i].texto : ''));
    });
    return f;
  }
  const igual = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  /* la altura del cursor en la pantalla (para que el typewriter no vea saltar la línea que se escribe) */
  function altoCursor(ed) {
    if (!Ed.page || !Ed.page.state || !Ed.page.state.typewriter || document.activeElement !== ed) return null;
    const s = window.getSelection(); if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0); if (!ed.contains(r.startContainer)) return null;
    let x = r.getClientRects()[0];
    if (!x || !x.height) { const b = Ed.closestBlock ? Ed.closestBlock(r.startContainer, ed) : null; x = b && b.getBoundingClientRect(); }
    return x && x.height ? x.top : null;
  }

  function calcular() {
    pendiente = null;
    const ed = Ed.editor; if (!ed || !ed.isConnected || !ed.offsetWidth) return;   // escondido: se calcula al verse (ResizeObserver)
    const M = window.Claquedraw && window.Claquedraw.maquetar; if (!M) return;
    const cs = getComputedStyle(ed);
    const lh = num(cs.lineHeight) || num(cs.fontSize) * 1.5 || 24;
    const padT = num(cs.paddingTop), padB = num(cs.paddingBottom), bordeT = num(cs.borderTopWidth), bordeB = num(cs.borderBottomWidth);
    /* los bloques, como para el PDF (la portada es una hoja aparte, sin número y fuera de la cuenta). Nada de esto depende de los
       márgenes de salto, así que se lee antes de quitarlos */
    const hijos = Array.from(ed.children).filter(k => k.offsetParent !== null);   // sin los ocultos
    const portadaEl = hijos[0] && hijos[0].matches('.portada') ? hijos[0] : null;
    const els = M.elementos(hijos.filter(k => k !== portadaEl));
    const numerar = ed.classList.contains('numerar-escenas'), quitaNotas = sinNotas();
    const { bloques, indices, prefijos } = M.bloquesDe(els, {
      numerar, sinNotas: quitaNotas,
      fijo: el => Math.ceil(el.offsetHeight / lh - 0.2)              // una tabla o una imagen: su alto en renglones
    });
    const pags = M.paginar(bloques);
    const firma0 = firmaDe(els, bloques, indices, prefijos, pags, [lh, padT, padB, ed.offsetWidth, numerar, quitaNotas, !!portadaEl, portadaEl ? portadaEl.offsetHeight : 0].join('|'));
    if (ultimo && igual(ultimo.els, els) && igual(ultimo.firma, firma0)) { actualizarContador(pags.length); return; }   // en pantalla, nada cambió
    /* posiciones naturales: sin los márgenes de salto (leer y volver a escribir ocurre antes de pintar).
       El alto mínimo de la hoja (otra hoja de estilos) se queda mientras se mide: si se quitara, la hoja
       encogería, el navegador recortaría el desplazamiento y al volver la vista saltaría al escribir.
       Por lo mismo se guarda y se devuelve el desplazamiento del área de trabajo; y con el typewriter, la línea que se escribe
       se queda a la misma altura (si un salto de página la movía, bajaba de golpe unos 250 px al hacer una pausa). */
    const ws = document.getElementById('workspace'), desp = ws ? ws.scrollTop : 0;
    const yCursor = ws ? altoCursor(ed) : null;
    const antes = estilo.textContent;
    ponerTexto(estilo, '');
    /* dónde empieza cada página: `null`, antes de un elemento; un número, a mitad de él (en ese carácter de su texto) */
    const cortes = new Map();
    const cortar = (el, off) => { if (!cortes.has(el)) cortes.set(el, []); cortes.get(el).push(off); };
    if (portadaEl && els.length) cortar(els[0], null);
    pags.slice(1).forEach(pg => {
      const x = pg.find(y => y.i !== undefined); if (!x) return;
      const off = x.desde - prefijos[x.i];
      cortar(els[indices[x.i]], off > 0 ? off : null);
    });
    const reglas = [], saltos = [], finales = [];   // finales: el borde inferior de cada hoja
    const minimoHoja = LINEAS * lh;
    let desplaza = 0, inicio = padT, previo = null;
    (portadaEl ? [portadaEl] : []).concat(els).forEach(k => {
      (cortes.get(k) || []).forEach(off => {
        if (off === null) {
          if (!previo) return;                                   // la primera hoja ya empieza aquí
          /* empieza en la hoja siguiente: un margen con el hueco natural más lo que falta hasta ella */
          const arriba = k.offsetTop + desplaza;
          const hueco = k.offsetTop - (previo.offsetTop + previo.offsetHeight);   // el hueco natural con el anterior (márgenes colapsados)
          const limite = Math.max(previo.offsetTop + previo.offsetHeight + desplaza, inicio + minimoHoja);
          const nuevo = limite + padB + HUECO + padT;
          const extra = nuevo - arriba;
          reglas.push(`${selector(ed, k)} { margin-top: ${Math.max(0, hueco) + extra}px !important; }`);
          saltos.push({ y: limite + padB }); finales.push(limite + padB);
          desplaza += extra; inicio = nuevo;
        } else {
          /* se parte por dentro: la raya, en el renglón donde sigue la página siguiente */
          const y = k.offsetTop + desplaza + alturaEn(k, off);
          saltos.push({ y, dentro: true }); finales.push(y); inicio = y;
        }
      });
      previo = k;
    });
    const fin = previo ? previo.offsetTop + previo.offsetHeight + desplaza : padT;
    const limite = Math.max(fin, inicio + minimoHoja);
    finales.push(limite + padB);                         // la última hoja, completa aunque esté casi vacía
    const nuevo = reglas.join('\n');
    ponerTexto(estilo, nuevo);
    const minimo = `#editor { min-height: ${Math.ceil(limite + padB + bordeT + bordeB)}px !important; }`;
    if (alto.textContent !== minimo) ponerTexto(alto, minimo);
    if (ws && ws.scrollTop !== desp) ws.scrollTop = desp;
    if (yCursor !== null) { const y = altoCursor(ed); if (y !== null && Math.abs(y - yCursor) > 1) ws.scrollTop += y - yCursor; }
    ultimo = { els, firma: firma0, pags: pags.length };
    const firma = saltos.map(x => Math.round(x.y) + (x.dentro ? 'd' : '')).join(',');
    if (nuevo === antes && !!portadaEl === portada && capa.dataset.firma === firma) { actualizarContador(pags.length); return; }   // nada cambió
    portada = !!portadaEl;
    pintar(saltos, finales, ed.offsetTop + bordeT);
    capa.dataset.firma = firma;
    actualizarContador(pags.length);
    if (Ed.blocks && Ed.blocks.reubicar) Ed.blocks.reubicar();   // los márgenes de salto movieron bloques: el asa los sigue
  }
  function actualizarContador(n) {
    total = n;
    if (contador) {
      ponerTexto(contador, total + (total === 1 ? ' página' : ' páginas') + ' · ≈ ' + total + ' min');
      contador.title = 'Páginas de guion (Carta, Courier 12 pt, ~' + LINEAS + ' líneas) · una página ≈ un minuto en pantalla';
    }
  }

  /* los huecos entre hojas y el número de cada hoja **arriba a la derecha, «2.», sin el de la primera** (especificación de
     guion, Leo 17-09-2026; antes iba abajo y desde la primera) */
  function pintar(saltos, finales, base) {
    /* se reutilizan los elementos de antes y los que sobran se esconden: quitar nodos de la página cerraría la agrupación de lo
       tecleado de Chrome (ver ponerTexto) */
    const huecos = capa._huecos || (capa._huecos = []), numeros = capa._numeros || (capa._numeros = []);
    const pieza = (lista, k, clase) => {
      if (!lista[k]) { const el = document.createElement(clase === 'pag-num' ? 'span' : 'div'); el.appendChild(document.createTextNode('')); capa.appendChild(el); lista[k] = el; }
      const el = lista[k]; el.style.display = ''; return el;
    };
    saltos.forEach((s, k) => {
      const el = pieza(huecos, k, 'pag-salto');
      el.className = 'pag-salto' + (s.dentro ? ' dentro' : '');
      el.style.top = (base + s.y) + 'px';
      el.style.height = s.dentro ? '' : HUECO + 'px';
    });
    for (let k = saltos.length; k < huecos.length; k++) huecos[k].style.display = 'none';
    /* con portada, esa hoja no cuenta: la primera del guion es la 1 (sin número) y la siguiente, la «2.» */
    const quita = portada ? 1 : 0;
    const nums = finales.slice(1 + quita);
    nums.forEach((y, j) => {
      const i = j + 1 + quita, n = pieza(numeros, j, 'pag-num');
      n.className = 'pag-num'; n.firstChild.nodeValue = (i + 1 - quita) + '.';
      n.title = 'Página ' + (i + 1 - quita) + ' de ' + (finales.length - quita);
      /* arriba de su hoja: justo tras el hueco que la separa de la anterior (o tras la raya, si una página larga se corta) */
      const s = saltos[i - 1];
      n.style.top = (base + (s ? s.y + (s.dentro ? 0 : HUECO) : y)) + 'px';
    });
    for (let k = nums.length; k < numeros.length; k++) { numeros[k].style.display = 'none'; numeros[k].firstChild.nodeValue = ''; }
    capa.dataset.hojas = String(finales.length);
  }

  /* con setTimeout y no requestAnimationFrame: el marco de ClapCraft se precarga escondido y ahí no hay frames */
  P.programar = function () {
    clearTimeout(pendiente);
    pendiente = setTimeout(calcular, 120);
  };
  P.total = () => total;
  P.recalcular = () => { ultimo = null; calcular(); };

  function iniciar() {
    const ed = Ed.editor, wrap = document.getElementById('pageWrap');
    if (!ed || !wrap) return;
    estilo = document.createElement('style'); estilo.id = 'pagEstilo'; document.head.appendChild(estilo);
    alto = document.createElement('style'); alto.id = 'pagAlto'; document.head.appendChild(alto);
    capa = document.createElement('div'); capa.className = 'pag-capa'; capa.setAttribute('aria-hidden', 'true'); wrap.appendChild(capa);
    contador = document.getElementById('fbPaginas');
    new MutationObserver(P.programar).observe(ed, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    /* el ancho de la hoja cambia los renglones (zoom, ANCHO, ventana); el alto lo cambia este módulo, así que se ignora */
    new ResizeObserver(() => { const w = ed.offsetWidth; if (w !== ancho) { ancho = w; P.programar(); } }).observe(ed);
    /* la casilla de exportar sin notas se cambia desde ClapCraft (otra ventana del mismo origen): el PDF cambia de páginas */
    window.addEventListener('storage', e => { if (e.key === CLAVE_SIN_NOTAS) P.programar(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(P.programar);
    P.programar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.Ed);
