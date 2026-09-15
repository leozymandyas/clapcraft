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
      if (n.nodeType !== 1 || n.matches('.cd-seccion, .db')) return;
      if (n.matches('ul, ol')) { Array.from(n.children).forEach((li, i) => { li.dataset.lista = n.tagName === 'OL' ? (i + 1) + '.' : '•'; res.push(li); }); return; }
      res.push(n);
    });
    return res;
  }
  const clase = b => (b.className && typeof b.className === 'string' ? (b.className.match(/sp-[a-z]+/) || [''])[0] : '');

  /* ---------- texto sin formato ---------- */
  function aTexto(html) {
    const bs = bloques(html);
    let out = '';
    bs.forEach((b, i) => {
      const k = clase(b), prev = i ? clase(bs[i - 1]) : '';
      const lineas = n => n.nodeName === 'BR' ? '\n' : n.nodeType === 3 ? n.nodeValue : Array.from(n.childNodes).map(lineas).join('');
      let t = b.tagName === 'HR' ? '* * *' : lineas(b).replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
      if (/^(sp-scene|sp-character|sp-transition|sp-shot)$/.test(k)) t = t.toUpperCase();
      if (k === 'sp-paren') t = '(' + t.replace(/^\(|\)$/g, '') + ')';
      if (b.dataset && b.dataset.lista) t = b.dataset.lista + ' ' + t;
      const pegado = (prev === 'sp-character' || prev === 'sp-paren') && (k === 'sp-dialogue' || k === 'sp-paren');
      out += (i ? (pegado ? '\n' : '\n\n') : '') + t;
    });
    return out.trim() + '\n';
  }

  /* ---------- HTML para imprimir (PDF) ---------- */
  function aImprimible(html, titulo, fuentes) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    t.content.querySelectorAll('.cd-seccion, .db').forEach(x => x.remove());
    t.content.querySelectorAll('[data-ch]').forEach(x => { x.removeAttribute('data-ch'); x.style.removeProperty('--chl'); x.style.removeProperty('--chd'); });
    const caja = document.createElement('div'); caja.appendChild(t.content);
    const f = fuentes || 'fonts/';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Regular.ttf"); font-weight: 400; font-style: normal; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Bold.ttf"); font-weight: 700; font-style: normal; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-Italic.ttf"); font-weight: 400; font-style: italic; }
@font-face { font-family: "Courier Prime"; src: url("${f}CourierPrime-BoldItalic.ttf"); font-weight: 700; font-style: italic; }
@page { size: letter; margin: 1in 1in 1in 1.5in; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font: 12pt/1.15 "Courier Prime", "Courier New", monospace; }
p, div, li, blockquote, pre { margin: 0 0 12pt; }
h1, h2, h3 { font-size: 12pt; font-weight: 700; margin: 12pt 0; }
h1 { font-size: 16pt; }
hr { border: 0; border-top: 1px solid #000; margin: 12pt 0 18pt; }
.sp-scene { text-transform: uppercase; font-weight: 700; margin-top: 12pt; page-break-after: avoid; }
.sp-character { text-transform: uppercase; margin: 12pt 0 0 2.2in; page-break-after: avoid; }
.sp-paren { margin: 0 2in 0 1.6in; }
.sp-paren::before { content: "("; } .sp-paren::after { content: ")"; }
.sp-dialogue { margin: 0 1.5in 12pt 1in; }
.sp-transition { text-transform: uppercase; text-align: right; }
.sp-shot { text-transform: uppercase; }
mark { background: none; }
img { max-width: 100%; }
table { border-collapse: collapse; } td, th { border: 1px solid #000; padding: 2pt 4pt; }
</style></head><body>${caja.innerHTML}</body></html>`;
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
  function parrafo(b, siguiente) {
    const k = clase(b), st = b.style || {};
    if (b.tagName === 'HR') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:after="360"/></w:pPr></w:p>';
    const pp = [], estilo = {};
    let despues = 240, antes = 0, izq = 0, der = 0, jc = null, mayus = false, pre = '', post = '';
    if (k === 'sp-scene') { mayus = true; estilo.b = true; antes = 240; pp.push('<w:keepNext/>'); }
    if (k === 'sp-character') { mayus = true; izq = 3168; antes = 240; despues = 0; pp.push('<w:keepNext/>'); }
    if (k === 'sp-paren') { izq = 2304; der = 2880; despues = 0; pre = '('; post = ')'; pp.push('<w:keepNext/>'); }
    if (k === 'sp-dialogue') { izq = 1440; der = 2160; }
    if (k === 'sp-transition') { mayus = true; jc = 'right'; }
    if (k === 'sp-shot') mayus = true;
    if (/^H[1-3]$/.test(b.tagName)) { estilo.b = true; antes = 240; }
    if (b.tagName === 'BLOCKQUOTE') { izq = 720; estilo.i = true; }
    if (b.dataset && b.dataset.lista) { izq = 360; pre = b.dataset.lista + ' '; despues = 80; }
    if (k === 'sp-character' && siguiente && /sp-(dialogue|paren)/.test(clase(siguiente))) despues = 0;
    const al = st.textAlign; if (/^(center|right|justify)$/.test(al)) jc = al === 'justify' ? 'both' : al;
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
    const cuerpo = bs.map((b, i) => parrafo(b, bs[i + 1])).join('') || '<w:p/>';
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
  async function exportar(formato, doc) {
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
    C.gestor.pop(trigger, f);
  }

  C.exportar = { menu, exportar, aTexto, docx, aImprimible };
})(window.Claquedraw);
