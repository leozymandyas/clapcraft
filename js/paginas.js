/* Páginas: la hoja continua del editor se ve partida en hojas, como en un procesador de textos, para
   saber cuántas páginas lleva el guion y cuánto duraría (una página de guion ≈ un minuto en pantalla).

   No toca el documento ni el Deshacer: los bloques no se parten ni se mueven en el DOM. Se mide dónde cae
   cada bloque en la hoja continua y, cuando uno no cabe en la página, se le da margen superior con una
   hoja de estilos propia (`#editor > :nth-child(n) { margin-top }`) para que empiece en la siguiente; entre
   hoja y hoja se dibuja el hueco (capa `.pag-capa` dentro de #pageWrap, fuera del contenteditable). Un
   bloque más alto que una página no se puede empujar: la página se corta por dentro con una raya. Cada
   hoja lleva su número en la esquina inferior derecha, desde la primera (que existe entera desde el
   principio: la hoja tiene como mínimo el alto de las páginas que ocupa). El
   encabezado de escena, el personaje y el paréntico pasan de hoja con lo que les sigue.

   Capacidad de una página: la de un guion en Carta (11 in con 1 in de margen arriba y abajo) en Courier
   12 pt, unas 54 líneas; se cuenta con el interlineado real de la hoja, así que con interlineado 1.5 la
   hoja se ve más alta que un Carta pero cuenta lo mismo. El ancho también influye (más ancho, menos
   renglones): con ~60 caracteres por línea se parece a la página de verdad. */
(function (Ed) {
  'use strict';
  const P = {};
  Ed.paginas = P;
  const LINEAS = 54;           // líneas por página de guion
  const HUECO = 26;            // px de lienzo entre hoja y hoja
  let estilo, alto, capa, contador, pendiente = null, ancho = 0, total = 1;

  const num = v => parseFloat(v) || 0;

  function calcular() {
    pendiente = null;
    const ed = Ed.editor; if (!ed || !ed.isConnected || !ed.offsetWidth) return;   // escondido: se calcula al verse (ResizeObserver)
    /* posiciones naturales: sin los márgenes de salto (leer y volver a escribir ocurre antes de pintar).
       El alto mínimo de la hoja (otra hoja de estilos) se queda mientras se mide: si se quitara, la hoja
       encogería, el navegador recortaría el desplazamiento y al volver la vista saltaría al escribir.
       Por lo mismo se guarda y se devuelve el desplazamiento del área de trabajo. */
    const ws = document.getElementById('workspace'), desp = ws ? ws.scrollTop : 0;
    const antes = estilo.textContent;
    estilo.textContent = '';
    const cs = getComputedStyle(ed);
    const lh = num(cs.lineHeight) || num(cs.fontSize) * 1.5 || 24;
    const H = Math.round(LINEAS * lh);
    const padT = num(cs.paddingTop), padB = num(cs.paddingBottom), bordeT = num(cs.borderTopWidth), bordeB = num(cs.borderBottomWidth);
    const hijos = Array.from(ed.children);
    const reglas = [], saltos = [], finales = [];   // finales: el borde inferior de cada hoja (para su número)
    let desplaza = 0, inicio = padT, limite = padT + H, previo = null;
    hijos.forEach((k, i) => {
      if (k.offsetParent === null) { return; }            // oculto
      const arriba = k.offsetTop + desplaza, alto = k.offsetHeight;
      /* como en un guion impreso, el encabezado de escena, el personaje y el paréntico no se quedan solos al
         pie: cuentan con lo que les sigue (el paréntico y el diálogo del personaje) */
      let finGrupo = arriba + alto;
      if (k.matches && k.matches('.sp-scene, .sp-character, .sp-paren')) {
        let j = i + 1;
        while (hijos[j] && hijos[j].matches('.sp-paren') && !k.matches('.sp-paren')) j++;
        const n = hijos[j];
        if (n) finGrupo = Math.max(finGrupo, n.offsetTop + desplaza + Math.min(n.offsetHeight, H));   // lo que sigue tampoco se parte: va entero
      }
      if (previo && finGrupo > limite && arriba > inicio + 1) {
        /* no cabe: empieza en la hoja siguiente */
        const hueco = k.offsetTop - (previo.offsetTop + previo.offsetHeight);   // el hueco natural con el anterior (márgenes ya colapsados)
        const nuevo = limite + padB + HUECO + padT;
        const extra = nuevo - arriba;
        reglas.push(`#editor > :nth-child(${i + 1}) { margin-top: ${Math.max(0, hueco) + extra}px !important; }`);
        saltos.push({ y: limite + padB }); finales.push(limite + padB);
        desplaza += extra; inicio = nuevo; limite = nuevo + H;
      }
      /* un bloque más alto que la página: la corta por dentro */
      let fin = k.offsetTop + desplaza + alto;
      while (fin > limite) { saltos.push({ y: limite, dentro: true }); finales.push(limite); inicio = limite; limite = inicio + H; }
      previo = k;
    });
    finales.push(limite + padB);                         // la última hoja, completa aunque esté casi vacía
    const nuevo = reglas.join('\n');
    estilo.textContent = nuevo;
    const minimo = `#editor { min-height: ${Math.ceil(limite + padB + bordeT + bordeB)}px !important; }`;
    if (alto.textContent !== minimo) alto.textContent = minimo;
    if (ws && ws.scrollTop !== desp) ws.scrollTop = desp;
    if (nuevo === antes && capa.childElementCount === saltos.length + finales.length) { actualizarContador(finales.length); return; }   // nada cambió
    pintar(saltos, finales, ed.offsetTop + bordeT);
    actualizarContador(finales.length);
  }
  function actualizarContador(n) {
    total = n;
    if (contador) {
      contador.textContent = total + (total === 1 ? ' página' : ' páginas') + ' · ≈ ' + total + ' min';
      contador.title = 'Páginas de guion (Carta, Courier 12 pt, ~' + LINEAS + ' líneas) · una página ≈ un minuto en pantalla';
    }
  }

  /* los huecos entre hojas y, en la esquina inferior derecha de cada hoja (desde la primera), su número */
  function pintar(saltos, finales, base) {
    const huecos = saltos.map(s => {
      const el = document.createElement('div');
      el.className = 'pag-salto' + (s.dentro ? ' dentro' : '');
      el.style.top = (base + s.y) + 'px';
      if (!s.dentro) el.style.height = HUECO + 'px';
      return el;
    });
    const numeros = finales.map((y, i) => {
      const n = document.createElement('span');
      n.className = 'pag-num'; n.textContent = i + 1;
      n.title = 'Página ' + (i + 1) + ' de ' + finales.length;
      n.style.top = (base + y) + 'px';
      return n;
    });
    capa.replaceChildren(...huecos, ...numeros);
  }

  /* con setTimeout y no requestAnimationFrame: el marco de ClapCraft se precarga escondido y ahí no hay frames */
  P.programar = function () {
    clearTimeout(pendiente);
    pendiente = setTimeout(calcular, 120);
  };
  P.total = () => total;
  P.recalcular = calcular;

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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(P.programar);
    P.programar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.Ed);
