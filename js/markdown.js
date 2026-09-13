/* Markdown: atajos en vivo (WYSIWYG), importación MD→HTML y exportación HTML→MD */
(function (Ed) {
  'use strict';
  const md = { enabled: true };
  Ed.md = md;

  /* ---------- Atajos de bloque: se activan al escribir un espacio tras el marcador ---------- */
  /* Chrome anida <ul>/<blockquote> dentro del <p> vacío al usar execCommand, así que
     listas y citas se construyen a mano en el DOM. */
  function toList(block, tag) {
    const li = document.createElement('li');
    while (block.firstChild) li.appendChild(block.firstChild);
    if (!li.firstChild) li.appendChild(document.createElement('br'));
    const prev = block.previousElementSibling;
    if (prev && prev.tagName === tag) { prev.appendChild(li); block.remove(); }
    else { const list = document.createElement(tag); list.appendChild(li); block.replaceWith(list); }
    Ed.setCaret(li, 0);
  }
  function toQuote(block) {
    const prev = block.previousElementSibling;
    if (!block.firstChild) block.appendChild(document.createElement('br'));
    if (prev && prev.tagName === 'BLOCKQUOTE') { prev.appendChild(block); }
    else { const bq = document.createElement('blockquote'); block.replaceWith(bq); bq.appendChild(block); }
    Ed.setCaret(block, 0);
  }
  /* Saca un bloque vacío fuera de su cita (partiéndola si hace falta) */
  function exitQuote(block) {
    const bq = block.closest('blockquote');
    const target = block === bq ? null : block;
    if (!target) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      bq.after(p);
      if (!bq.textContent.trim()) bq.remove();
      Ed.setCaret(p, 0);
      return;
    }
    if (target.nextSibling) {
      const rest = document.createElement('blockquote');
      while (target.nextSibling) rest.appendChild(target.nextSibling);
      bq.after(rest);
    }
    bq.after(target);
    if (!bq.firstChild) bq.remove();
    Ed.setCaret(target, 0);
  }

  md.toList = toList;
  md.toQuote = toQuote;

  const BLOCK_RULES = [
    { re: /^(#{1,6}) $/, run: m => Ed.cmd('formatBlock', 'h' + m[1].length) },
    { re: /^[-*+] $/, run: (m, block) => toList(block, 'UL') },
    { re: /^1[.)] $/, run: (m, block) => toList(block, 'OL') },
    { re: /^> $/, run: (m, block) => toQuote(block) }
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
          const r = Ed.getRange();
          const del = document.createRange();
          del.setStart(block, 0);
          del.setEnd(r.startContainer, r.startOffset);
          Ed.restoreSelection(del);
          Ed.cmd('delete');
          /* un bloque vacío sin <br> hace que Chrome anide la lista/cita dentro del párrafo */
          if (!block.textContent && !block.querySelector('br, img')) {
            block.appendChild(document.createElement('br'));
            Ed.setCaret(block, 0);
          }
          rule.run(m, block);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
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
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        block.after(p);
        /* quita la línea vacía final */
        let last = block.lastChild;
        while (last && ((last.nodeType === 1 && last.tagName === 'BR') || (last.nodeType === 3 && !last.nodeValue.replace(/\u200B/g, '')))) { const prev = last.previousSibling; last.remove(); last = prev; }
        if (last && last.nodeType === 3) last.nodeValue = last.nodeValue.replace(/\n+$/, '');
        if (last && last.nodeType === 1 && last.tagName === 'BR') last.remove();
        if (!block.textContent.replace(/\u200B/g, '') && !block.querySelector('br')) block.remove();
        Ed.setCaret(p, 0);
        notify();
        return true;
      }
      e.preventDefault();
      Ed.cmd('insertLineBreak');
      return true;
    }

    if (!md.enabled || block.tagName === 'LI') return false;
    const trimmed = full.trim();

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      e.preventDefault();
      const hr = document.createElement('hr');
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      block.replaceWith(hr, p);
      Ed.setCaret(p, 0);
      notify();
      return true;
    }
    if (/^```\w*$/.test(trimmed)) {
      e.preventDefault();
      const pre = document.createElement('pre');
      pre.appendChild(document.createElement('br'));
      block.replaceWith(pre);
      Ed.setCaret(pre, 0);
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

  function parseBlocks(lines) {
    let out = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (!line.trim()) { i++; continue; }
      if ((m = line.match(/^```(\w*)\s*$/))) {
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
        out += '<blockquote>' + parseBlocks(buf) + '</blockquote>';
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const res = parseList(lines, i);
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
        const hard = /( {2,}|\\)$/.test(l);
        return inline(l.replace(/( {2,}|\\)$/, '')) + (hard ? '<br>' : ' ');
      }).join('').replace(/ $/, '');
      out += '<p>' + html + '</p>';
    }
    return out;
  }

  function parseList(lines, i) {
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
      let subHtml = sub.length ? parseBlocks(sub) : '';
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

  function blockToMd(el) {
    const tag = el.tagName;
    if (el.classList && el.classList.contains('db')) return Ed.db ? Ed.db.toMarkdown(el) : '';
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + inlineChildren(el) + '\n\n';
    switch (tag) {
      case 'P': case 'DIV': case 'LI': {
        let t = blocksToMd(el).trim();
        if (!t) return '';
        /* elementos de guion: convención tipo Fountain */
        const sp = Array.from(el.classList || []).find(c => c.startsWith('sp-'));
        if (sp === 'sp-scene' || sp === 'sp-character' || sp === 'sp-shot') t = t.toUpperCase();
        else if (sp === 'sp-transition') t = '> ' + t.toUpperCase();
        else if (sp === 'sp-paren') t = '(' + t + ')';
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
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 1 && BLOCK_SET.has(node.tagName)) { flush(); out += blockToMd(node); }
      else buf += inlineToMd(node);
    }
    flush();
    return out;
  }

  md.fromHtml = function (root) {
    return blocksToMd(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };
})(window.Ed);
