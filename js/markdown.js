/* Markdown: atajos en vivo (WYSIWYG), importación MD→HTML y exportación HTML→MD */
(function (Ed) {
  'use strict';
  const md = { enabled: true };
  Ed.md = md;

  /* ---------- Atajos de bloque: se activan al escribir un espacio tras el marcador ----------
     Chrome anida <ul>/<blockquote> dentro del <p> vacío al usar execCommand, así que listas y citas se arman en un clon y
     entran con un solo insertHTML (`Ed.screenplay.editar`, que usa `Ed.sustituir`): así entran en Deshacer. Hasta el
     29-09-2026 se hacían a mano en el DOM y «- item» + Deshacer dejaba una viñeta vacía para siempre. */
  const editar = (nodos, fn) => (Ed.screenplay && Ed.screenplay.editar ? Ed.screenplay.editar(nodos, fn) : null);
  /* quita los primeros `n` caracteres del texto de un elemento (el marcador «- », «> »…) */
  function quitarInicio(el, n) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t; const vacios = [];
    while (n > 0 && (t = w.nextNode())) { const k = Math.min(n, t.nodeValue.length); t.nodeValue = t.nodeValue.slice(k); n -= k; if (!t.nodeValue) vacios.push(t); }
    vacios.forEach(x => x.remove());
    /* sin texto, el bloque lleva su <br> (un <p></p> vacío hacía que Chrome escribiera fuera de él) */
    if (!el.textContent.replace(/\u200B/g, '') && !el.querySelector('br, img')) el.appendChild(document.createElement('br'));
  }
  function listaEn(c, tag) {                                   // en el clon: el bloque pasa a una viñeta (con la lista de antes si es igual)
    const li = document.createElement('li');
    if (c.tagName === 'PRE') li.innerHTML = Ed.escapeHtml(c.textContent).replace(/\n/g, '<br>');
    else while (c.firstChild) li.appendChild(c.firstChild);
    if (!li.textContent.replace(/\u200B/g, '') && !li.querySelector('br, img')) li.appendChild(document.createElement('br'));
    const prev = c.previousElementSibling;
    if (prev && prev.tagName === tag) { prev.appendChild(li); c.remove(); }
    else { const list = document.createElement(tag); list.appendChild(li); c.replaceWith(list); }
    return li;
  }
  function citaEn(c) {
    if (!c.firstChild) c.appendChild(document.createElement('br'));
    const prev = c.previousElementSibling;
    if (prev && prev.tagName === 'BLOCKQUOTE') prev.appendChild(c);
    else { const bq = document.createElement('blockquote'); c.replaceWith(bq); bq.appendChild(c); }
    return c;
  }
  function toList(block, tag, quitar) {
    const prev = block.previousElementSibling;
    editar(prev ? [prev, block] : [block], clon => {
      const c = clon(block); if (!c) return false;
      if (quitar) quitarInicio(c, quitar);
      return { nodo: listaEn(c, tag), offset: 0 };
    });
  }
  function toQuote(block, quitar) {
    const prev = block.previousElementSibling;
    editar(prev ? [prev, block] : [block], clon => {
      const c = clon(block); if (!c) return false;
      if (quitar) quitarInicio(c, quitar);
      if (c.tagName !== 'P') { const p = document.createElement('p'); while (c.firstChild) p.appendChild(c.firstChild); c.replaceWith(p); return { nodo: citaEn(p), offset: 0 }; }
      return { nodo: citaEn(c), offset: 0 };
    });
  }
  function toHeading(block, nivel, quitar) {
    editar([block], clon => {
      const c = clon(block); if (!c) return false;
      if (quitar) quitarInicio(c, quitar);
      const h = document.createElement('h' + nivel);
      while (c.firstChild) h.appendChild(c.firstChild);
      if (!h.textContent.replace(/\u200B/g, '') && !h.querySelector('br, img')) h.appendChild(document.createElement('br'));
      c.replaceWith(h);
      return { nodo: h, offset: 0 };
    });
  }
  /* Saca un bloque vacío fuera de su cita (partiéndola si hace falta) */
  function exitQuote(block) {
    const bq = block.closest('blockquote');
    editar([bq], clon => {
      const cbq = clon(bq), cb = clon(block); if (!cbq || !cb) return false;
      if (cb === cbq) {
        const p = document.createElement('p'); p.appendChild(document.createElement('br'));
        cbq.after(p);
        if (!cbq.textContent.trim()) cbq.remove();
        return { nodo: p, offset: 0 };
      }
      if (cb.nextSibling) {
        const rest = document.createElement('blockquote');
        while (cb.nextSibling) rest.appendChild(cb.nextSibling);
        cbq.after(rest);
      }
      cbq.after(cb);
      if (!cbq.firstChild) cbq.remove();
      return { nodo: cb, offset: 0 };
    });
  }

  md.toList = toList;
  md.toQuote = toQuote;

  /* cada regla recibe cuántos caracteres del principio son el marcador (se quitan en el mismo paso) */
  const BLOCK_RULES = [
    { re: /^(#{1,6}) $/, run: (m, block, n) => toHeading(block, m[1].length, n) },
    { re: /^[-*+] $/, run: (m, block, n) => toList(block, 'UL', n) },
    { re: /^1[.)] $/, run: (m, block, n) => toList(block, 'OL', n) },
    { re: /^> $/, run: (m, block, n) => toQuote(block, n) }
  ];

  /* ---------- Atajos en línea: se activan al escribir el carácter de cierre ---------- */
  const INLINE_RULES = [
    { re: /(?:\*\*\*|___)(?!\s)([^*_]*?[^*_\s])(?:\*\*\*|___)$/, cmds: ['bold', 'italic'] },
    { re: /(?<![*_])(?:\*\*|__)(?!\s)([^*_]*?[^*_\s])(?:\*\*|__)$/, cmds: ['bold'] },
    { re: /(?<![*\w])\*(?!\s)([^*]*?[^*\s])\*$/, cmds: ['italic'] },
    { re: /(?<![_\w])_(?!\s)([^_]*?[^_\s])_$/, cmds: ['italic'] },
    { re: /~~(?!\s)([^~]*?[^~\s])~~$/, cmds: ['strikeThrough'] },
    { re: /(?<!`)`([^`\n]+)`$/, code: true },
    { re: /(?<!=)==(?!\s)([^=]*?[^=\s])==$/, mark: true },
    { re: /\[([^\]]+)\]\(([^)\s]+)\)$/, link: true }
  ];

  let busy = false;

  md.onInput = function (e) {
    if (busy || !md.enabled || e.inputType !== 'insertText' || !e.data) return;
    const editor = Ed.editor;
    const ctx = Ed.textBeforeCaretInBlock(editor);
    if (!ctx) return;
    const block = ctx.block;
    const text = ctx.text.replace(/\u00A0/g, ' ');
    if (block.tagName === 'PRE' || block.closest('pre')) return;

    busy = true;
    try {
      if (e.data === ' ') {
        for (const rule of BLOCK_RULES) {
          const m = text.match(rule.re);
          if (!m) continue;
          if (block.tagName === 'LI') return; /* dentro de listas no se convierte */
          /* ni en un elemento de guion: «- Ya sé…» es un guion de interrupción y «- Andrés…» una toma de montaje (especificación
             de guion); convertirlos en lista, título o cita rompía el formato */
          if (Ed.screenplay && Ed.screenplay.kindOf(block)) return;
          /* el marcador se quita y el bloque se convierte con un solo insertHTML (un paso de Deshacer: vuelve a «- ») */
          rule.run(m, block, ctx.text.length);
          if (Ed.afterChange) Ed.afterChange();
          return;
        }
        return;
      }
      if (/^[*_`~)=]$/.test(e.data)) {
        const r = Ed.getRange();
        if (!r || r.startContainer.nodeType !== 3) return;
        const node = r.startContainer;
        if (node.parentElement.closest('code, a, mark')) return;
        const before = node.nodeValue.slice(0, r.startOffset).replace(/\u00A0/g, ' ');
        for (const rule of INLINE_RULES) {
          const m = before.match(rule.re);
          if (m) { applyInline(rule, m, node, r.startOffset); return; }
        }
      }
    } finally {
      busy = false;
    }
  };

  function applyInline(rule, m, node, caret) {
    const inner = m[1];
    const r = document.createRange();
    r.setStart(node, caret - m[0].length);
    r.setEnd(node, caret);
    Ed.restoreSelection(r);

    if (rule.link) {
      Ed.cmd('insertHTML', `<a href="${Ed.escapeHtml(m[2])}">${Ed.escapeHtml(inner)}</a>&#8203;`);
      return;
    }
    if (rule.code) {
      Ed.cmd('insertHTML', `<code>${Ed.escapeHtml(inner)}</code>&#8203;`);
      return;
    }
    if (rule.mark) {
      Ed.cmd('insertHTML', `<mark>${Ed.escapeHtml(inner)}</mark>&#8203;`);
      return;
    }
    Ed.cmd('insertText', inner);
    const r2 = Ed.getRange();
    if (!r2) return;
    const sel = document.createRange();
    sel.setStart(r2.endContainer, Math.max(0, r2.endOffset - inner.length));
    sel.setEnd(r2.endContainer, r2.endOffset);
    Ed.restoreSelection(sel);
    rule.cmds.forEach(c => Ed.cmd(c));
    window.getSelection().collapseToEnd();
    /* apaga el estilo para lo que se escriba después */
    rule.cmds.forEach(c => Ed.cmd(c));
  }

  /* ---------- Enter: líneas horizontales, bloques de código, salir de citas ---------- */
  md.onKeydown = function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const editor = Ed.editor;
    const ctx = Ed.textBeforeCaretInBlock(editor);
    if (!ctx) return false;
    const { block, text } = ctx;
    const full = block.textContent.replace(/\u200B/g, '');
    const notify = () => editor.dispatchEvent(new Event('input', { bubbles: true }));

    if (block.tagName === 'PRE') {
      /* ¿línea vacía antes del cursor y nada después? → doble Enter: salir del bloque */
      const r = Ed.getRange();
      const beforeR = document.createRange();
      beforeR.setStart(block, 0);
      beforeR.setEnd(r.startContainer, r.startOffset);
      const afterR = document.createRange();
      afterR.setStart(r.startContainer, r.startOffset);
      afterR.setEnd(block, block.childNodes.length);
      const lastBefore = beforeR.cloneContents().lastChild;
      const emptyLine = !!lastBefore && ((lastBefore.nodeType === 1 && lastBefore.tagName === 'BR') ||
        (lastBefore.nodeType === 3 && /\n$/.test(lastBefore.nodeValue)));
      const nothingAfter = afterR.toString().replace(/\u200B/g, '') === '' && !afterR.cloneContents().querySelector('br:not(:last-child)');
      if (emptyLine && nothingAfter && text.replace(/\u200B/g, '') !== '') {
        e.preventDefault();
        editar([block], clon => {
          const c = clon(block); if (!c) return false;
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          c.after(p);
          /* quita la línea vacía final */
          let last = c.lastChild;
          while (last && ((last.nodeType === 1 && last.tagName === 'BR') || (last.nodeType === 3 && !last.nodeValue.replace(/\u200B/g, '')))) { const prev = last.previousSibling; last.remove(); last = prev; }
          if (last && last.nodeType === 3) last.nodeValue = last.nodeValue.replace(/\n+$/, '');
          if (last && last.nodeType === 1 && last.tagName === 'BR') last.remove();
          if (!c.textContent.replace(/\u200B/g, '') && !c.querySelector('br')) c.remove();
          return { nodo: p, offset: 0 };
        });
        notify();
        return true;
      }
      e.preventDefault();
      Ed.cmd('insertLineBreak');
      return true;
    }

    if (!md.enabled || block.tagName === 'LI') return false;
    const trimmed = full.trim();

    /* un elemento de guion no se convierte: «---» o «```» ahí son texto del guion */
    const deGuion = Ed.screenplay && Ed.screenplay.kindOf(block);
    if (!deGuion && /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      e.preventDefault();
      editar([block], clon => {
        const c = clon(block); if (!c) return false;
        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        c.replaceWith(hr, p);
        return { nodo: p, offset: 0 };
      });
      notify();
      return true;
    }
    if (!deGuion && /^```\w*$/.test(trimmed)) {
      e.preventDefault();
      editar([block], clon => {
        const c = clon(block); if (!c) return false;
        const pre = document.createElement('pre');
        pre.appendChild(document.createElement('br'));
        c.replaceWith(pre);
        return { nodo: pre, offset: 0 };
      });
      notify();
      return true;
    }
    if (trimmed === '' && block.closest('blockquote')) {
      e.preventDefault();
      exitQuote(block);
      notify();
      return true;
    }
    return false;
  };

  md.looksLikeMarkdown = text =>
    /^(#{1,6} |[-*+] |\d+\. |> |```|\|)/m.test(text) || /\*\*[^*\n]+\*\*/.test(text) || /==[^=\n]+==/.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text);

  /* =========================== MD → HTML =========================== */
  const PH = '\uE000'; /* marcador temporal para proteger los code spans */

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (m, c) => { codes.push('<code>' + Ed.escapeHtml(c) + '</code>'); return PH + (codes.length - 1) + PH; });
    s = Ed.escapeHtml(s);
    s = s.replace(/&lt;(\/?)(u|sup|sub|br|mark|s)\s*\/?&gt;/g, '<$1$2>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '<strong><em>$2</em></strong>');
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>');
    s = s.replace(new RegExp(PH + '(\\d+)' + PH, 'g'), (m, i) => codes[+i]);
    return s;
  }

  const isBlockStart = l => /^(#{1,6}\s|\s*([-*+]|\d+[.)])\s+|\s*>|```|\s*([-*_])(\s*\3){2,}\s*$|\s*\|)/.test(l);

  /* ---------- los recuadros (js/recuadros.js, 1.1.57): ```prompt Título {.color} y ```aviso:tipo Título {.color} ----------
     Como en ClapBook: un bloque cercado cuya valla dice qué es (el tipo de un aviso, `note` si no se dice), su título y su color;
     dentro, Markdown. La valla de cierre, de tantos acentos graves como la de apertura o más. */
  function infoRecuadro(info) {
    let s = String(info || '').trim(), color = null;
    /* «{.azul}» al final es el color solo si es uno de la paleta (su nombre, su índice o un alias: `Ed.recuadros.color`); si no, es
       parte del título. «{.}» es «sin color» (lo escribe `recuadroMd` cuando el título acaba en algo que se leería como color) */
    const c = /(?:^|[ \t])\{\.([^}\s]*)\}$/.exec(s);
    const R = Ed.recuadros;
    if (c && (!c[1] || !(R && R.color) || R.color(c[1]))) { color = c[1] || null; s = s.slice(0, c.index).trim(); }
    const m = /^(prompt|aviso)(?::([\p{L}\p{N}_-]+))?(?:[ \t]+(.*))?$/iu.exec(s);
    if (!m) return null;
    return { rc: m[1].toLowerCase(), tipo: m[2] || 'note', titulo: (m[3] || '').trim(), color };
  }
  md.infoRecuadro = infoRecuadro;
  function htmlRecuadro(o, cuerpo) {
    const R = Ed.recuadros;
    if (R && R.html) return R.html(o, cuerpo);
    const esc = Ed.escapeHtml;
    return '<div class="rc rc-' + o.rc + '" data-rc="' + o.rc + '"' + (o.rc === 'aviso' ? ' data-tipo="' + esc(String(o.tipo || 'note').toLowerCase()) + '"' : '')
      + (o.titulo ? ' data-titulo="' + esc(o.titulo) + '"' : '') + (o.color ? ' data-color="' + esc(o.color) + '"' : '') + '>' + (cuerpo || '<p><br></p>') + '</div>';
  }

  /* `duro`: cada salto de renglón de un párrafo es un <br> (dentro de un recuadro: un prompt se escribe por renglones).
     `dentroRc`: el cuerpo de un recuadro (o una cita o una lista suya), donde no cabe otro: un renglón «```prompt» ahí es texto */
  function parseBlocks(lines, duro, dentroRc) {
    let out = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (!line.trim()) { i++; continue; }
      const vallaRc = (m = line.match(/^(`{3,})[ \t]*(.*)$/)) && infoRecuadro(m[2]) ? m : null;
      if (vallaRc && !dentroRc) {
        const valla = vallaRc[1], o = infoRecuadro(vallaRc[2]), buf = [];
        i++;
        while (i < lines.length && !new RegExp('^`{' + valla.length + ',}\\s*$').test(lines[i])) buf.push(lines[i++]);
        i++;
        out += htmlRecuadro(o, parseBlocks(buf, true, true));
        continue;
      }
      if (!vallaRc && (m = line.match(/^```(\w*)\s*$/))) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out += '<pre>' + Ed.escapeHtml(buf.join('\n')) + '</pre>';
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out += '<hr>'; i++; continue; }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*> ?/, ''));
        out += '<blockquote>' + parseBlocks(buf, false, dentroRc) + '</blockquote>';
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const res = parseList(lines, i, dentroRc);
        out += res.html;
        i = res.next;
        continue;
      }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(2).map(cells);
        out += '<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
          body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++]);
      const html = buf.map(l => {
        const hard = duro || /( {2,}|\\)$/.test(l);
        return inline(l.replace(/( {2,}|\\)$/, '')) + (hard ? '<br>' : ' ');
      }).join('').replace(duro ? /(<br>| )$/ : / $/, '');
      out += '<p>' + html + '</p>';
    }
    return out;
  }

  function parseList(lines, i, dentroRc) {
    const first = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+/);
    const indent = first[1].length;
    const tag = /\d/.test(first[2]) ? 'ol' : 'ul';
    let html = '<' + tag + '>';
    while (i < lines.length) {
      const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (!m || m[1].length !== indent) break;
      i++;
      const sub = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].search(/\S/) > indent) {
        sub.push(lines[i].replace(new RegExp('^\\s{1,' + (indent + 2) + '}'), ''));
        i++;
      }
      let subHtml = sub.length ? parseBlocks(sub, false, dentroRc) : '';
      subHtml = subHtml.replace(/^<p>([\s\S]*?)<\/p>(?=<[uo]l>|$)/, ' $1');
      html += '<li>' + inline(m[3]) + subHtml + '</li>';
    }
    return { html: html + '</' + tag + '>', next: i };
  }

  md.toHtml = function (src) {
    return parseBlocks(String(src).replace(/\r\n?/g, '\n').split('\n')) || '<p><br></p>';
  };

  /* =========================== HTML → MD =========================== */
  const BLOCK_SET = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'HR', 'TABLE', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);

  function wrap(marker, inner, closer = marker) {
    const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2]) return inner;
    return m[1] + marker + m[2] + closer + m[3];
  }

  function inlineToMd(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\u200B/g, '').replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName;
    if (BLOCK_SET.has(tag)) return '\n\n' + blockToMd(node).trim() + '\n\n';
    const inner = () => Array.from(node.childNodes).map(inlineToMd).join('');
    switch (tag) {
      case 'CODE': return '`' + node.textContent.replace(/\u200B/g, '') + '`';
      case 'A': return '[' + inner() + '](' + (node.getAttribute('href') || '') + ')';
      case 'IMG': return '![' + (node.getAttribute('alt') || '') + '](' + (node.getAttribute('src') || '') + ')';
      case 'BR': return '  \n';
      case 'SUP': return wrap('<sup>', inner(), '</sup>');
      case 'SUB': return wrap('<sub>', inner(), '</sub>');
      case 'MARK': return wrap('==', inner());
      default: break;
    }
    /* etiqueta + estilos en línea (Chrome mezcla ambos, p. ej. <i style="font-weight:bold">) */
    const st = node.style;
    const deco = (st.textDecorationLine || st.textDecoration || '') + '';
    const bold = tag === 'STRONG' || tag === 'B' || st.fontWeight === 'bold' || st.fontWeight === 'bolder' || +st.fontWeight >= 600;
    const italic = tag === 'EM' || tag === 'I' || st.fontStyle === 'italic';
    const underline = tag === 'U' || /underline/.test(deco);
    const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(deco);
    let s = inner();
    if (bold && italic) s = wrap('***', s);
    else if (bold) s = wrap('**', s);
    else if (italic) s = wrap('*', s);
    if (strike) s = wrap('~~', s);
    if (underline) s = wrap('<u>', s, '</u>');
    const bg = st.backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg)) s = wrap('==', s);
    return s;
  }

  function inlineChildren(el) {
    return Array.from(el.childNodes).map(inlineToMd).join('').replace(/[ \t]+\n/g, '  \n').trim();
  }

  /* ---------- el guion en Markdown (exportar a .md; Leo, 18-09-2026) ----------
     Legible en cualquier visor (y en Obsidian): los actos como `##`, las escenas como `###` y los encabezados secundarios
     como `####`; la acción en párrafos; el diálogo junto, con el personaje en negrita, el paréntesis en cursiva y lo dicho
     debajo (saltos de renglón de Markdown); las transiciones como cita (`> CORTE A:`; «FADE IN:», que va a la izquierda, en
     su párrafo); tomas y montajes en mayúsculas; las notas en cursiva y entre corchetes, y el diálogo doble como una tabla de
     dos columnas, una por personaje. */
  const spDe = el => { const c = el && el.classList && Array.from(el.classList).find(k => /^sp-[a-z]+$/.test(k) && k !== 'sp-col'); return c ? c.slice(3) : null; };
  const unaLinea = t => t.replace(/\s*\n\s*/g, ' ').replace(/[ \t\u00A0]+/g, ' ').trim();
  function lineaDialogo(p) {
    const k = spDe(p), t = inlineChildren(p);
    if (!t) return '';
    if (k === 'character') return '**' + unaLinea(t).toUpperCase() + '**';
    if (k === 'paren') return '*(' + unaLinea(t).replace(/^\(|\)$/g, '') + ')*';
    return t;
  }
  const dialogoMd = ps => { const t = ps.map(lineaDialogo).filter(Boolean).join('  \n'); return t ? t + '\n\n' : ''; };
  function dobleMd(el) {
    const cols = Array.from(el.children).filter(c => c.classList.contains('sp-col')).map(c => Array.from(c.children));
    const celda = ps => ps.map(lineaDialogo).filter(Boolean).join('<br>').replace(/ {2}\n/g, '<br>').replace(/\n/g, ' ').replace(/\|/g, '\\|');
    const cab = cols.map(ps => (ps[0] && spDe(ps[0]) === 'character' ? celda([ps[0]]) : ''));
    const cuerpo = cols.map(ps => celda(ps[0] && spDe(ps[0]) === 'character' ? ps.slice(1) : ps));
    return '| ' + cab.join(' | ') + ' |\n|' + ' --- |'.repeat(cols.length) + '\n| ' + cuerpo.join(' | ') + ' |\n\n';
  }

  function listToMd(el, depth) {
    const ordered = el.tagName === 'OL';
    let out = '';
    let n = 0;
    for (const li of Array.from(el.children)) {
      if (li.tagName !== 'LI') continue;
      n++;
      const marker = ordered ? `${n}. ` : '- ';
      const own = document.createElement('div');
      const nested = [];
      for (const c of Array.from(li.childNodes)) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
        else own.appendChild(c.cloneNode(true));
      }
      const text = blocksToMd(own).trim().replace(/\n{2,}/g, '\n').replace(/\n/g, '\n' + ' '.repeat(depth * 2 + marker.length));
      out += ' '.repeat(depth * 2) + marker + text + '\n';
      nested.forEach(nl => { out += listToMd(nl, depth + 1); });
    }
    return out;
  }

  /* un recuadro: su valla (con el tipo, el título y el color) y su texto en Markdown; la valla, más larga que cualquier ``` de dentro */
  function recuadroMd(el) {
    const R = Ed.recuadros, d = R ? R.datos(el) : { rc: el.getAttribute('data-rc') === 'prompt' ? 'prompt' : 'aviso', tipo: el.getAttribute('data-tipo') || 'note', titulo: el.getAttribute('data-titulo') || '', color: el.getAttribute('data-color') };
    const cuerpo = blocksToMd(el).replace(/\n{3,}/g, '\n\n').trim();
    let n = 3; (cuerpo.match(/^[ \t]*`{3,}/gm) || []).forEach(x => { n = Math.max(n, x.trim().length + 1); });
    const valla = '`'.repeat(n);
    const titulo = String(d.titulo || '').replace(/[\r\n]+/g, ' ').trim();
    const cola = d.color ? ' {.' + d.color + '}' : /\{\.[^}\s]*\}$/.test(titulo) ? ' {.}' : '';   // un título que acaba en «{.x}» no se lee como color
    return valla + d.rc + (d.rc === 'aviso' && d.tipo && d.tipo !== 'note' ? ':' + d.tipo : '') + (titulo ? ' ' + titulo : '') + cola
      + '\n' + (cuerpo ? cuerpo + '\n' : '') + valla + '\n\n';
  }

  function blockToMd(el) {
    const tag = el.tagName;
    if (el.hasAttribute && el.hasAttribute('data-rc') && tag === 'DIV') return recuadroMd(el);
    if (el.classList && el.classList.contains('db')) return Ed.db ? Ed.db.toMarkdown(el) : '';
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + inlineChildren(el) + '\n\n';
    switch (tag) {
      case 'P': case 'DIV': case 'LI': {
        if (el.classList && el.classList.contains('sp-doble')) return dobleMd(el);
        const t = blocksToMd(el).trim();
        if (!t) return '';
        /* elementos de guion (ver arriba; el diálogo, junto, lo arma blocksToMd) */
        const sp = spDe(el);
        if (sp === 'act') return '## ' + unaLinea(t).toUpperCase() + '\n\n';
        if (sp === 'scene') return '### ' + unaLinea(t).toUpperCase() + '\n\n';
        if (sp === 'subscene') return '#### ' + unaLinea(t).toUpperCase() + '\n\n';
        if (sp === 'character' || sp === 'paren') return lineaDialogo(el) + '\n\n';
        if (sp === 'transition') return (el.hasAttribute('data-izq') ? '' : '> ') + unaLinea(t).toUpperCase() + '\n\n';
        if (sp === 'shot' || sp === 'montage') return t.toUpperCase() + '\n\n';
        if (sp === 'note') return '*[' + unaLinea(t).replace(/^\[|\]$/g, '') + ']*\n\n';
        return t + '\n\n';
      }
      case 'BLOCKQUOTE':
        return blocksToMd(el).trim().split('\n').map(l => ('> ' + l).replace(/\s+$/, '')).join('\n') + '\n\n';
      case 'PRE':
        return '```\n' + el.textContent.replace(/\u200B/g, '').replace(/\n$/, '') + '\n```\n\n';
      case 'UL': case 'OL': return listToMd(el, 0) + '\n';
      case 'HR': return '---\n\n';
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => inlineChildren(td).replace(/\|/g, '\\|').replace(/\n/g, ' ')));
        if (!rows.length) return '';
        const cols = Math.max(...rows.map(r => r.length));
        const line = r => '| ' + Array.from({ length: cols }, (_, i) => r[i] || '').join(' | ') + ' |';
        return line(rows[0]) + '\n|' + ' --- |'.repeat(cols) + '\n' + rows.slice(1).map(line).join('\n') + '\n\n';
      }
      default: return blocksToMd(el);
    }
  }

  /* Recorre hijos mezclando bloques e inline (los inline sueltos forman párrafos) */
  function blocksToMd(parent) {
    let out = '';
    let buf = '';
    const flush = () => { const t = buf.trim(); if (t) out += t + '\n\n'; buf = ''; };
    const nodos = Array.from(parent.childNodes);
    for (let i = 0; i < nodos.length; i++) {
      const node = nodos[i];
      if (node.nodeType === 1 && BLOCK_SET.has(node.tagName)) {
        flush();
        /* un diálogo de guion va junto: el personaje con los paréntesis y diálogos que le siguen */
        if (spDe(node) === 'character') {
          const grupo = [node];
          let j = i + 1;
          while (j < nodos.length) {
            const n = nodos[j];
            if (n.nodeType === 3 && !n.nodeValue.trim()) { j++; continue; }
            if (n.nodeType === 1 && /^(paren|dialogue)$/.test(spDe(n) || '')) { grupo.push(n); j++; continue; }
            break;
          }
          out += dialogoMd(grupo); i = j - 1;
          continue;
        }
        out += blockToMd(node);
      }
      else buf += inlineToMd(node);
    }
    flush();
    return out;
  }

  md.fromHtml = function (root) {
    return blocksToMd(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };
})(window.Ed);
