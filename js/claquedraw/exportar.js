/* Claquedraw · exportar
   «Exportar» (Leo, 15-09-2026, docs/diseno/rediseno-11/): PDF, Word y texto sin formato de un documento del editor. Desde un
   guion generado (una nota plana) exporta la nota; desde el editor con secciones o «Revisar guión», lo que está dentro del
   guion, en su orden de lectura. Todo sale del HTML del editor: los elementos de guion (`sp-*`) se traducen a su formato.

   - PDF: una página Carta con Courier Prime 12 pt. En Electron la imprime el proceso principal a un archivo (`pdf:save`); en
     el navegador se abre el diálogo de imprimir (que deja guardar como PDF).
   - Word: un .docx mínimo hecho aquí (document.xml + estilos en un zip sin comprimir), sin dependencias.
   - Texto: párrafos separados por una línea en blanco; personaje, paréntico y diálogo seguidos. */
(function (C) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nombreArchivo = t => (String(t || 'Guion').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Guion');

  /* los bloques de primer nivel del documento (las listas, por elemento) */
  function bloques(html) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    const res = [];
    Array.from(t.content.childNodes).forEach(n => {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) { const p = document.createElement('p'); p.textContent = n.nodeValue; res.push(p); } return; }
      if (n.nodeType !== 1 || n.matches('.cd-seccion, .db, .portada')) return;
      if (n.matches('ul, ol')) { Array.from(n.children).forEach((li, i) => { li.dataset.lista = n.tagName === 'OL' ? (i + 1) + '.' : '•'; res.push(li); }); return; }
      res.push(n);
    });
    return res;
  }
  /* los datos de la portada del documento (js/portada.js), o null */
  function portadaDe(html) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    const el = t.content.querySelector('.portada'); if (!el) return null;
    try { const d = JSON.parse(el.getAttribute('data-portada') || '{}'); return d && Object.keys(d).length ? d : null; } catch (_) { return null; }
  }
  const clase = b => (b.className && typeof b.className === 'string' ? (b.className.match(/sp-[a-z]+/) || [''])[0] : '');

  const k0 = b => (b.classList && b.classList.contains('sp-doble') ? 'sp-doble' : '');
  /* un diálogo doble en texto: las dos columnas lado a lado, de 28 caracteres con 4 de separación (el personaje en el 8, el
     paréntesis en el 4), como en la hoja */
  function textoDoble(b) {
    const M = C.maquetar;
    const cols = M.columnasDe(b).map(col => {
      const out = [];
      col.forEach(x => {
        const f = M.DOBLE[x.tipo] || M.DOBLE.dialogue;
        let t = x.tipo === 'character' ? x.texto.toUpperCase() : x.texto;
        t = (f.pre || '') + t + (f.post || '');
        M.envolver(t, f.primera ? [f.primera, f.ancho] : [f.ancho]).forEach((l, j) => out.push(' '.repeat(f.col + (j && f.primera ? 1 : 0)) + t.slice(l.desde, l.hasta).trim()));
      });
      return out;
    });
    const n = Math.max(0, ...cols.map(c => c.length));
    return Array.from({ length: n }, (_, i) => ((cols[0] && cols[0][i]) || '').padEnd(32) + ((cols[1] && cols[1][i]) || '')).map(l => l.replace(/\s+$/, '')).join('\n');
  }

  /* ---------- texto sin formato ---------- */
  function aTexto(html) {
    const bs = bloques(html);
    let out = '';
    const po = portadaDe(html);
    if (po) {
      const ls = [po.titulo && '"' + po.titulo + '"', po.episodio, '', po.autor && 'escrito por', po.autor, '', po.basado, '', po.version, po.fecha, po.contacto].filter(x => x !== undefined && x !== null);
      out += ls.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n\n* * *\n\n';
    }
    bs.forEach((b, i) => {
      if (k0(b) === 'sp-doble') { out += (i ? '\n\n' : '') + textoDoble(b); return; }
      const k = clase(b), prev = i ? clase(bs[i - 1]) : '';
      const lineas = n => n.nodeName === 'BR' ? '\n' : n.nodeType === 3 ? n.nodeValue : Array.from(n.childNodes).map(lineas).join('');
      let t = b.tagName === 'HR' ? '* * *' : lineas(b).replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
      if (/^(sp-scene|sp-subscene|sp-character|sp-transition|sp-shot|sp-act|sp-montage)$/.test(k)) t = t.toUpperCase();
      if (k === 'sp-paren') t = '(' + t.replace(/^\(|\)$/g, '') + ')';
      if (k === 'sp-note') t = '[' + t.replace(/^\[|\]$/g, '') + ']';
      if (b.dataset && b.dataset.lista) t = b.dataset.lista + ' ' + t;
      const pegado = ((prev === 'sp-character' || prev === 'sp-paren') && (k === 'sp-dialogue' || k === 'sp-paren')) || (prev === 'sp-dialogue' && k === 'sp-paren');
      out += (i ? (pegado ? '\n' : '\n\n') : '') + t;
    });
    return out.trim() + '\n';
  }

  /* ---------- HTML para imprimir (PDF) ----------
     Con solo texto (lo normal en un guion), las páginas las reparte `C.maquetar` como un guion impreso (54 renglones de 12 pt,
     «(MORE)» y «(CONT'D)», reglas de corte; ver js/claquedraw/maquetar.js) y cada una va en su propia `.hoja` de 9 in con su
     número dibujado arriba a la derecha desde la segunda. Con imágenes o tablas, que no se pueden medir en renglones, las
     reparte el navegador (y numera `@page`). Las medidas son las de un guion real de TV (The Office, 18-09-2026). */
  const FUENTES_CSS = f => `
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Regular.ttf"); font-weight: 400; font-style: normal; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Bold.ttf"); font-weight: 700; font-style: normal; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Italic.ttf"); font-weight: 400; font-style: italic; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-BoldItalic.ttf"); font-weight: 700; font-style: italic; }`;
  /* sangrías desde el margen de 1,5 in: personaje 1,8 in, paréntesis 1,2 in (26 de ancho), diálogo 0,75 in (42 de ancho) */
  const GUION_CSS = `
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font: 12pt/12pt "Courier Prime", "Courier New", monospace; }
p, div, li, blockquote, pre { margin: 0 0 12pt; }
p, li { white-space: pre-wrap; overflow-wrap: anywhere; }
h1, h2, h3 { font-size: 12pt; font-weight: 700; margin: 12pt 0; }
hr { border: 0; border-top: 1px solid #000; margin: 12pt 0; }
.sp-scene, .sp-subscene { text-transform: uppercase; font-weight: 700; }
.sp-scene { margin-top: 12pt; }
.sp-character { text-transform: uppercase; margin: 12pt 0 0 1.8in; }
.sp-paren { margin: 0 0 0 1.2in; max-width: 26ch; padding-left: 1ch; text-indent: -1ch; }
.sp-paren::before { content: "("; } .sp-paren::after { content: ")"; }
.sp-dialogue { margin: 0 0 12pt .75in; max-width: 42ch; }
.sp-dialogue:has(+ .sp-paren), .sp-dialogue:has(+ .sp-more) { margin-bottom: 0; }
.sp-more { margin: 0 0 0 1.8in; }
.sp-transition { text-transform: uppercase; text-align: right; }
.sp-transition[data-izq] { text-align: left; }
.sp-shot, .sp-montage { text-transform: uppercase; }
.sp-act { text-transform: uppercase; text-align: center; text-decoration: underline; }
.sp-note::before { content: "["; } .sp-note::after { content: "]"; }
/* diálogo doble: dos columnas de 2,8 in con 0,4 de separación; dentro, personaje a 0,8 in y paréntesis a 0,4 */
.sp-doble { display: grid; grid-template-columns: 2.8in 2.8in; column-gap: .4in; margin: 0 0 12pt; break-inside: avoid; }
.sp-col { margin: 0; }
.sp-col > p { margin: 0; }
.sp-col > .sp-character { margin-left: .8in; max-width: 20ch; }
.sp-col > .sp-paren { margin-left: .4in; max-width: 20ch; }
.sp-col > .sp-dialogue { max-width: 28ch; }
ul, ol { margin: 0; padding-left: 3ch; }
mark { background: none; }
img { max-width: 100%; }
table { border-collapse: collapse; } td, th { border: 1px solid #000; padding: 2pt 4pt; }`;
  /* un trozo [a, b) de un bloque (en las posiciones de `textoBloque`), con su formato */
  function recortar(el, a, b) {
    const c = el.cloneNode(true);
    const atomos = [];
    const ir = n => { n.childNodes.forEach(x => {
      if (x.nodeType === 3) { x.nodeValue = x.nodeValue.replace(/\u200B/g, '').replace(/\u00A0/g, ' '); atomos.push({ n: x, largo: x.nodeValue.length }); }
      else if (x.nodeName === 'BR') atomos.push({ n: x, largo: 1, br: true });
      else if (x.nodeType === 1) ir(x);
    }); };
    ir(c);
    const total = atomos.reduce((s, x) => s + x.largo, 0);
    const poner = (r, k, inicio) => {
      let acc = 0;
      for (const x of atomos) {
        if (k <= acc + x.largo) {
          if (x.br) { if (k === acc) (inicio ? r.setStartBefore(x.n) : r.setEndBefore(x.n)); else (inicio ? r.setStartAfter(x.n) : r.setEndAfter(x.n)); }
          else (inicio ? r.setStart(x.n, k - acc) : r.setEnd(x.n, k - acc));
          return;
        }
        acc += x.largo;
      }
      inicio ? r.setStart(c, c.childNodes.length) : r.setEnd(c, c.childNodes.length);
    };
    if (b < total) { const r = document.createRange(); poner(r, b, true); r.setEnd(c, c.childNodes.length); r.deleteContents(); }
    if (a > 0) { const r = document.createRange(); r.setStart(c, 0); poner(r, a, false); r.deleteContents(); }
    return c;
  }
  /* la portada: una hoja sin número, con el título a un tercio, el autor cuatro renglones debajo, «basado en» dos más abajo, el
     contacto abajo a la izquierda y versión y fecha abajo a la derecha (como la del guion real y la especificación) */
  function hojaPortada(d) {
    const l = (c, t) => t ? `<div class="${c}">${esc(t)}</div>` : '';
    return `<div class="hoja hoja-portada"><div class="pt-centro"><div class="pt-titulo">${d.titulo ? '“' + esc(d.titulo) + '”' : ''}</div>${l('pt-episodio', d.episodio)}`
      + `${d.autor ? `<div class="pt-por">escrito por</div><div class="pt-autor">${esc(d.autor)}</div>` : ''}${l('pt-basado', d.basado)}</div>`
      + `${l('pt-contacto', d.contacto)}<div class="pt-version">${l('', d.version)}${l('', d.fecha)}</div></div>`;
  }
  /* Las páginas del guion, con el maquetador y los mismos bloques que cuenta el editor (`bloquesDe`: así el contador de páginas
     de la barra inferior da lo mismo que el PDF). preparar() ya numeró las escenas y quitó las notas. */
  function paginado(caja) {
    const M = C.maquetar;
    const els = M.elementos(caja.children);
    const { bloques, indices } = M.bloquesDe(els);
    const paginas = M.paginar(bloques);
    return paginas.map((pg, n) => {
      const cuerpo = pg.map(x => {
        if (x.more) return '<p class="sp-more">(MORE)</p>';
        if (x.contd) return `<p class="sp-character sp-contd">${esc(x.contd)}</p>`;
        const el = els[indices[x.i]], largo = bloques[x.i].texto.length;
        const trozo = x.desde === 0 && x.hasta >= largo ? el.cloneNode(true) : recortar(el, x.desde, x.hasta);
        /* un elemento de lista, dentro de su lista (con su número) */
        if (el.nodeName === 'LI') { const l = el.parentNode.nodeName.toLowerCase(), num = Array.prototype.indexOf.call(el.parentNode.children, el) + 1; return `<${l}${l === 'ol' ? ` start="${num}"` : ''}>${trozo.outerHTML}</${l}>`; }
        return trozo.outerHTML;
      }).join('');
      return `<div class="hoja">${cuerpo}${n >= 1 ? `<span class="num">${n + 1}.</span>` : ''}</div>`;
    }).join('');
  }
  function aImprimible(html, titulo, fuentes) {
    const po = portadaDe(html);
    const t = document.createElement('template'); t.innerHTML = html || '';
    t.content.querySelectorAll('.cd-seccion, .db, .portada').forEach(x => x.remove());
    t.content.querySelectorAll('[data-ch]').forEach(x => { x.removeAttribute('data-ch'); x.style.removeProperty('--chl'); x.style.removeProperty('--chd'); });
    const caja = document.createElement('div'); caja.appendChild(t.content);
    const f = fuentes || 'fonts/';
    const soloTexto = C.maquetar && !caja.querySelector('img, table, pre, video, iframe');
    const paginas = soloTexto ? `
@page { size: letter; margin: .5in 1in 1in 1.5in; }
/* la hoja empieza a media pulgada del borde: en esa franja va su número (lo que se sale por arriba de una página, Chromium
   lo pinta al pie de la anterior) y debajo, a 1 in, sus 54 renglones */
.hoja { position: relative; height: 9.5in; padding-top: .5in; box-sizing: border-box; break-after: page; }
.hoja:last-child { break-after: auto; }
.hoja > :first-child { margin-top: 0 !important; }
.hoja > .num { position: absolute; top: 0; right: 0; margin: 0; }` : `
@page { size: letter; margin: 1in 1in 1in 1.5in;
  @top-right { content: counter(page) "."; font: 12pt "Courier Prime", "Courier New", monospace; vertical-align: bottom; padding-bottom: .5in; } }
@page :first { @top-right { content: none; } }
.sp-scene, .sp-subscene, .sp-character, .sp-paren { page-break-after: avoid; }
.sp-transition { page-break-before: avoid; }
.sp-act.nueva-pagina { page-break-before: always; }`;
    const portadaCss = `
.hoja-portada { text-align: center; }
.hoja-portada div { margin: 0; }
.hoja-portada .pt-centro { position: absolute; left: 0; right: 0; top: calc(.5in + 17 * 12pt); }
.hoja-portada .pt-titulo { font-weight: 700; }
.hoja-portada .pt-por { margin-top: 48pt; } .hoja-portada .pt-basado { margin-top: 24pt; }
.hoja-portada .pt-contacto { position: absolute; left: 0; bottom: 0; text-align: left; max-width: 48%; }
.hoja-portada .pt-version { position: absolute; right: 0; bottom: 0; text-align: right; max-width: 48%; }` + (soloTexto ? '' : `
.hoja-portada { position: relative; height: 9in; break-after: page; }`);
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${FUENTES_CSS(f)}${paginas}${GUION_CSS}${po ? portadaCss : ''}
</style></head><body>${po ? hojaPortada(po) : ''}${soloTexto ? paginado(caja) : caja.innerHTML}</body></html>`;
  }
  function pdf(html, titulo) {
    const api = window.editorAPI;
    if (api && api.guardarPdf) {
      return api.guardarPdf({ html: aImprimible(html, titulo, 'FUENTES/'), defaultPath: nombreArchivo(titulo) + '.pdf' });
    }
    /* navegador: el diálogo de imprimir en un marco escondido */
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const base = location.href.replace(/[^/]*$/, '');
    f.srcdoc = aImprimible(html, titulo, base + 'fonts/');
    f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 60000); } }, 350); };
    return Promise.resolve(true);
  }

  /* ---------- Word (.docx) ---------- */
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function runs(nodo, estilo, mayus) {
    let r = '';
    nodo.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        let t = n.nodeValue.replace(/\u200B/g, ''); if (!t) return;
        if (mayus) t = t.toUpperCase();
        const pr = (estilo.b ? '<w:b/>' : '') + (estilo.i ? '<w:i/>' : '') + (estilo.u ? '<w:u w:val="single"/>' : '') + (estilo.s ? '<w:strike/>' : '');
        r += `<w:r>${pr ? '<w:rPr>' + pr + '</w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
        return;
      }
      if (n.nodeType !== 1) return;
      if (n.nodeName === 'BR') { r += '<w:r><w:br/></w:r>'; return; }
      const st = n.style || {}, e = Object.assign({}, estilo);
      if (/^(B|STRONG)$/.test(n.nodeName) || /^(bold|[6-9]00)$/.test(st.fontWeight)) e.b = true;
      if (/^(I|EM)$/.test(n.nodeName) || st.fontStyle === 'italic') e.i = true;
      if (n.nodeName === 'U' || /underline/.test(st.textDecoration || '')) e.u = true;
      if (/^(S|STRIKE|DEL)$/.test(n.nodeName) || /line-through/.test(st.textDecoration || '')) e.s = true;
      r += runs(n, e, mayus);
    });
    return r;
  }
  /* un diálogo doble en Word: una tabla de dos columnas sin bordes que no se parte (2,8 in cada una, con 0,4 de separación) y una
     línea en blanco detrás */
  function tablaDoble(b) {
    const cols = Array.from(b.children).filter(c => c.classList && c.classList.contains('sp-col'));
    const linea = p => {
      const k = clase(p), izq = k === 'sp-character' ? 1152 : k === 'sp-paren' ? 576 : 0;
      const r = t => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
      return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0"/>${izq ? `<w:ind w:left="${izq}"/>` : ''}</w:pPr>`
        + (k === 'sp-paren' ? r('(') : '') + runs(p, {}, k === 'sp-character') + (k === 'sp-paren' ? r(')') : '') + '</w:p>';
    };
    const celda = (col, ancho, sep) => `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${sep ? `<w:tcMar><w:right w:w="${sep}" w:type="dxa"/></w:tcMar>` : ''}</w:tcPr>`
      + ((col ? Array.from(col.children).map(linea).join('') : '') || '<w:p/>') + '</w:tc>';
    return '<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="4608"/><w:gridCol w:w="4032"/></w:tblGrid>'
      + `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celda(cols[0], 4608, 576)}${celda(cols[1], 4032, 0)}</w:tr></w:tbl>`
      + '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';
  }
  function parrafo(b, siguiente) {
    if (k0(b) === 'sp-doble') return tablaDoble(b);
    const k = clase(b), st = b.style || {};
    if (b.tagName === 'HR') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:after="360"/></w:pPr></w:p>';
    const pp = [], estilo = {};
    let despues = 240, antes = 0, izq = 0, der = 0, jc = null, mayus = false, pre = '', post = '';
    if (k === 'sp-scene') { mayus = true; estilo.b = true; antes = 240; pp.push('<w:keepNext/>'); }
    if (k === 'sp-subscene') { mayus = true; estilo.b = true; pp.push('<w:keepNext/>'); }
    /* sangrías del guion real (desde el margen): personaje 1,8 in, paréntesis 1,2 in (2,6 de ancho), diálogo 0,75 in (4,2) */
    if (k === 'sp-character') { mayus = true; izq = 2592; antes = 240; despues = 0; pp.push('<w:keepNext/>'); }
    if (k === 'sp-paren') { izq = 1728; der = 3168; despues = 0; pre = '('; post = ')'; pp.push('<w:keepNext/>'); }
    if (k === 'sp-dialogue') { izq = 1080; der = 1512; if (siguiente && clase(siguiente) === 'sp-paren') despues = 0; }
    if (k === 'sp-transition') { mayus = true; jc = b.hasAttribute('data-izq') ? null : 'right'; }
    if (k === 'sp-shot' || k === 'sp-montage') mayus = true;
    if (k === 'sp-act') { mayus = true; estilo.u = true; jc = 'center'; pp.push('<w:keepNext/>'); if (b.classList.contains('nueva-pagina')) pp.push('<w:pageBreakBefore/>'); }
    if (k === 'sp-note') { pre = '['; post = ']'; }
    if (/^H[1-3]$/.test(b.tagName)) { estilo.b = true; antes = 240; }
    if (b.tagName === 'BLOCKQUOTE') { izq = 720; estilo.i = true; }
    if (b.dataset && b.dataset.lista) { izq = 360; pre = b.dataset.lista + ' '; despues = 80; }
    if (k === 'sp-character' && siguiente && /sp-(dialogue|paren)/.test(clase(siguiente))) despues = 0;
    const al = st.textAlign; if (/^(center|right|justify)$/.test(al) && k !== 'sp-act') jc = al === 'justify' ? 'both' : al;
    if (/^(sp-character)$/.test(k) && !jc) jc = null;
    pp.push(`<w:spacing w:before="${antes}" w:after="${despues}"/>`);
    if (izq || der) pp.push(`<w:ind w:left="${izq}" w:right="${der}"/>`);
    if (jc) pp.push(`<w:jc w:val="${jc}"/>`);
    const size = /^H1$/.test(b.tagName) ? '<w:rPr><w:sz w:val="32"/></w:rPr>' : '';
    const texto = (pre ? `<w:r><w:t xml:space="preserve">${xml(pre)}</w:t></w:r>` : '') + runs(b, estilo, mayus) + (post ? `<w:r><w:t xml:space="preserve">${xml(post)}</w:t></w:r>` : '');
    return `<w:p><w:pPr>${pp.join('')}${size}</w:pPr>${texto}</w:p>`;
  }
  function docx(html) {
    const bs = bloques(html);
    const po = portadaDe(html);
    const centrado = (t, antes, negrita) => `<w:p><w:pPr><w:spacing w:before="${antes || 0}" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r>${negrita ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r></w:p>`;
    const portada = !po ? '' : centrado(po.titulo ? '“' + po.titulo + '”' : '', 17 * 240, true) + (po.episodio ? centrado(po.episodio) : '')
      + (po.autor ? centrado('escrito por', 4 * 240) + centrado(po.autor) : '') + (po.basado ? centrado(po.basado, 2 * 240) : '')
      + [po.contacto, po.version, po.fecha].filter(Boolean).map((t, i) => `<w:p><w:pPr><w:spacing w:before="${i ? 0 : 12 * 240}" w:after="0"/></w:pPr><w:r><w:t xml:space="preserve">${xml(t)}</w:t></w:r></w:p>`).join('')
      + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const cuerpo = portada + (bs.map((b, i) => parrafo(b, bs[i + 1])).join('') || '<w:p/>');
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const archivos = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier Prime" w:hAnsi="Courier Prime" w:cs="Courier New" w:eastAsia="Courier New"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="240" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
    };
    return zip(archivos);
  }
  /* zip sin comprimir (método 0), con nombres UTF-8 */
  const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(archivos) {
    const enc = new TextEncoder(), partes = [], central = [];
    let offset = 0;
    const u16 = (v, n) => { v.push(n & 0xFF, (n >>> 8) & 0xFF); }, u32 = (v, n) => { v.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); };
    Object.keys(archivos).forEach(nombre => {
      const datos = enc.encode(archivos[nombre]), nom = enc.encode(nombre), crc = crc32(datos);
      const h = []; u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, 0); u16(h, 0x21); u32(h, crc); u32(h, datos.length); u32(h, datos.length); u16(h, nom.length); u16(h, 0);
      partes.push(new Uint8Array(h), nom, datos);
      const c = []; u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, 0); u16(c, 0x21); u32(c, crc); u32(c, datos.length); u32(c, datos.length); u16(c, nom.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
      central.push(new Uint8Array(c), nom);
      offset += h.length + nom.length + datos.length;
    });
    const tamCentral = central.reduce((a, x) => a + x.length, 0);
    const fin = []; u32(fin, 0x06054b50); u16(fin, 0); u16(fin, 0); u16(fin, Object.keys(archivos).length); u16(fin, Object.keys(archivos).length); u32(fin, tamCentral); u32(fin, offset); u16(fin, 0);
    const todo = [...partes, ...central, new Uint8Array(fin)], total = todo.reduce((a, x) => a + x.length, 0);
    const out = new Uint8Array(total); let p = 0; todo.forEach(x => { out.set(x, p); p += x.length; });
    return out;
  }

  /* ---------- guardar ---------- */
  async function guardar(contenido, nombre, tipo, filtro) {
    const api = window.editorAPI;
    if (api && api.saveFile) return api.saveFile({ defaultPath: nombre, content: contenido, filters: [filtro] });
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return nombre;
  }
  /* Lo que el editor solo pinta y en el archivo tiene que ir escrito (especificación de guion, Leo 17-09-2026): el nombre del
     personaje con un solo espacio antes de su extensión («LAURA (V.O.)»; en el editor lo separan dos espacios duros), el
     número de las escenas si están numeradas («ESCENA 3 - …», sin los encabezados secundarios), los actos que empiezan página
     (todos menos los «FIN…») y, si se pide, sin las notas. */
  const CLAVE_SIN_NOTAS = 'guiones.claquedraw.exportar.sinNotas';
  const sinNotas = () => { try { return localStorage.getItem(CLAVE_SIN_NOTAS) === '1'; } catch (_) { return false; } };
  function numerarEscenas() {
    const m = document.getElementById('editorMarco'), E = m && m.contentWindow && m.contentWindow.Ed;
    return !!(E && E.page && E.page.state.numerar);
  }
  function preparar(html) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    const r = t.content;
    r.querySelectorAll('p.sp-character').forEach(p => { p.textContent = p.textContent.replace(/\u200B/g, '').replace(/[\s\u00A0]+/g, ' ').trim(); });
    if (numerarEscenas()) {
      let n = 0;
      r.querySelectorAll('p.sp-scene').forEach(p => { if (p.textContent.trim()) p.insertBefore(document.createTextNode('ESCENA ' + (++n) + ' - '), p.firstChild); });
    }
    let primero = true;
    Array.from(r.children).forEach(p => {
      if (p.matches('p.sp-act') && !primero && !/^FIN\b/i.test(p.textContent.trim())) p.classList.add('nueva-pagina');
      if (p.textContent.trim() && !p.matches('.sp-transition')) primero = false;   // «FADE IN:» delante no cuenta
    });
    if (sinNotas()) r.querySelectorAll('p.sp-note').forEach(p => p.remove());
    /* «FADE IN:» a la izquierda aunque el documento no traiga la marca del editor */
    r.querySelectorAll('p.sp-transition').forEach(p => { if (/^FADE IN:?$/i.test(p.textContent.replace(/\s+/g, ' ').trim())) p.setAttribute('data-izq', ''); });
    const caja = document.createElement('div'); caja.appendChild(r);
    return caja.innerHTML;
  }
  async function exportar(formato, doc0) {
    const doc = Object.assign({}, doc0, { html: preparar(doc0.html) });
    const titulo = nombreArchivo(doc.titulo);
    if (formato === 'pdf') return pdf(doc.html, doc.titulo);
    if (formato === 'docx') return guardar(docx(doc.html), titulo + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { name: 'Documento de Word', extensions: ['docx'] });
    return guardar(aTexto(doc.html), titulo + '.txt', 'text/plain;charset=utf-8', { name: 'Texto sin formato', extensions: ['txt'] });
  }
  /* El menú de «Exportar» junto a un botón (o un rectángulo, para el botón de dentro del marco del editor). `obtener()` da
     `{ titulo, html }` en el momento de elegir. */
  function menu(trigger, obtener, avisar) {
    const doc0 = obtener(); if (!doc0) return;
    const f = document.createDocumentFragment();
    const tit = Object.assign(document.createElement('div'), { className: 'gd-pop-tit', textContent: 'Exportar ' + (doc0.titulo || '') });
    f.appendChild(tit);
    [['pdf', 'Documento PDF', '.pdf'], ['docx', 'Word', '.docx'], ['txt', 'Texto sin formato', '.txt']].forEach(([k, texto, ext]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ex-opcion'; b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span></span><span class="ex-ext">${ext}</span>`; b.firstChild.textContent = texto;
      b.addEventListener('click', async () => {
        C.gestor.cerrarPop();
        const doc = obtener(); if (!doc) return;
        try { const r = await exportar(k, doc); if (r && avisar) avisar(k === 'pdf' && !(window.editorAPI && window.editorAPI.guardarPdf) ? 'Elige «Guardar como PDF» en el diálogo de imprimir' : 'Exportado: ' + (typeof r === 'string' ? r.split(/[\\/]/).pop() : texto)); }
        catch (err) { console.error(err); if (avisar) avisar('No se pudo exportar: ' + (err && err.message || err)); }
      });
      f.appendChild(b);
    });
    /* ocultar las notas del guion (/nota) al exportar; se recuerda en esta máquina */
    const nt = document.createElement('button'); nt.type = 'button'; nt.className = 'ex-opcion ex-casilla'; nt.setAttribute('role', 'menuitemcheckbox');
    const pintarCasilla = () => { nt.setAttribute('aria-checked', String(sinNotas())); nt.innerHTML = `<span>${sinNotas() ? '☑' : '☐'} Ocultar las notas del guion</span>`; };
    pintarCasilla();
    nt.addEventListener('click', () => { try { localStorage.setItem(CLAVE_SIN_NOTAS, sinNotas() ? '0' : '1'); } catch (_) {} pintarCasilla(); });
    f.appendChild(nt);
    C.gestor.pop(trigger, f);
  }

  C.exportar = { menu, exportar, aTexto, docx, aImprimible, preparar };
})(window.Claquedraw);
