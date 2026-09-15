/* Corrector ortográfico: Hunspell en JavaScript (Typo.js) con diccionario de español.
   Marca las palabras dudosas con la API de Highlight (sin tocar el DOM) y ofrece sugerencias. */
(function (Ed) {
  'use strict';
  const S = { ready: false, enabled: true };
  Ed.spell = S;

  const KEY_ENABLED = 'guiones.editor.spell';
  const KEY_WORDS = 'guiones.editor.spell.words';
  const WORD_RE = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
  const hasHighlight = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  let typo = null;     /* español (principal) */
  let typoEn = null;   /* inglés (secundario) */
  const cache = new Map();
  const personal = new Set();
  const ignored = new Set();
  let ranges = [];

  try { JSON.parse(localStorage.getItem(KEY_WORDS) || '[]').forEach(w => personal.add(w)); } catch (_) { /* ignorar */ }
  S.enabled = localStorage.getItem(KEY_ENABLED) !== '0';

  /* ---------- carga diferida del diccionario (tarda ~1 s; no bloquea el primer pintado) ---------- */
  function init() {
    if (typeof Typo === 'undefined' || !window.DICT_ES) return;
    try {
      typo = new Typo('es', window.DICT_ES.aff, window.DICT_ES.dic);
      S.ready = true;
    } catch (err) {
      console.warn('No se pudo cargar el diccionario de español', err);
      return;
    }
    syncButton();
    run();
    /* el inglés se carga después, en otro hueco de inactividad */
    if (window.DICT_EN) idle(() => {
      try { typoEn = new Typo('en', window.DICT_EN.aff, window.DICT_EN.dic); cache.clear(); run(); }
      catch (err) { console.warn('No se pudo cargar el diccionario de inglés', err); }
    });
  }
  const idle = window.requestIdleCallback ? fn => window.requestIdleCallback(fn, { timeout: 2000 }) : fn => setTimeout(fn, 300);
  idle(init);

  /* ---------- comprobación ---------- */
  /* abreviaturas habituales de guion y siglas cortas en mayúsculas no se marcan */
  const BUILTIN = new Set(['int', 'ext', 'vo', 'os', 'cont', 'cu', 'pov', 'ok']);
  function isOk(word) {
    if (word.length < 2) return true;
    const lower = word.toLowerCase();
    if (personal.has(lower) || ignored.has(lower) || BUILTIN.has(lower)) return true;
    if (Ed.characters && Ed.characters.has(word)) return true;
    if (word.length <= 3 && word === word.toUpperCase()) return true;
    let v = cache.get(word);
    if (v === undefined) { v = typo.check(word) || (typoEn ? typoEn.check(word) : false); cache.set(word, v); }
    return v;
  }
  S.isMisspelled = word => S.ready && !isOk(word);

  function run() {
    if (!hasHighlight) return;
    if (!S.ready || !S.enabled) { ranges = []; paint(); return; }
    const editor = Ed.editor;
    const sel = window.getSelection();
    let caretNode = null, caretOff = -1;
    if (sel && sel.isCollapsed && sel.rangeCount) { const r = sel.getRangeAt(0); caretNode = r.startContainer; caretOff = r.startOffset; }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!p || p.closest('pre, code, a, .sp-character, .ed-fijo')) return NodeFilter.FILTER_REJECT;
        /* en bases de datos solo se revisan las celdas de texto, no la interfaz */
        if (p.closest('.db') && !p.closest('.db-txt')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    ranges = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue;
      WORD_RE.lastIndex = 0;
      let m;
      while ((m = WORD_RE.exec(text))) {
        const w = m[0];
        const start = m.index, end = start + w.length;
        /* la palabra que se está escribiendo (cursor pegado a su final) no se marca todavía */
        if (node === caretNode && caretOff === end) continue;
        if (isOk(w)) continue;
        const r = document.createRange();
        r.setStart(node, start);
        r.setEnd(node, end);
        ranges.push(r);
      }
    }
    paint();
  }
  function paint() {
    if (!hasHighlight) return;
    CSS.highlights.set('spell-error', new Highlight(...ranges));
  }
  S.check = Ed.debounce(run, 350);
  S.checkNow = run;

  /* ---------- palabra bajo el puntero y sugerencias ---------- */
  S.wordAt = function (x, y) {
    if (!document.caretRangeFromPoint) return null;
    const r = document.caretRangeFromPoint(x, y);
    if (!r || r.startContainer.nodeType !== 3 || !Ed.editor.contains(r.startContainer)) return null;
    const node = r.startContainer, off = r.startOffset, text = node.nodeValue;
    if (node.parentElement.closest('pre, code, a, .sp-character, .ed-fijo')) return null;
    if (node.parentElement.closest('.db') && !node.parentElement.closest('.db-txt')) return null;
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(text))) {
      if (off >= m.index && off <= m.index + m[0].length) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        return { word: m[0], range };
      }
    }
    return null;
  };

  /* Distancia de edición ponderada: las confusiones típicas del español cuestan menos
     (s/c/z, b/v, ll/y, g/j, h muda, acentos), para ordenar mejor las sugerencias. */
  const strip = ch => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const CONFUSE = [['s', 'c', 'z', 'x'], ['b', 'v'], ['g', 'j'], ['y', 'i'], ['k', 'q', 'c'], ['m', 'n']];
  function subCost(a, b, es) {
    if (a === b) return 0;
    const sa = strip(a), sb = strip(b);
    if (sa === sb) return 0.2;                       /* solo cambia el acento */
    if (es && CONFUSE.some(g => g.includes(sa) && g.includes(sb))) return 0.5;
    return 1;
  }
  /* Omitir una letra es el error más frecuente: la inserción en el candidato cuesta algo menos */
  function distance(a, b, lang) {
    const es = lang !== 'en';
    a = a.toLowerCase(); b = b.toLowerCase();
    const n = a.length, m = b.length;
    const d = Array.from({ length: n + 1 }, (_, i) => [i]);
    for (let j = 1; j <= m; j++) d[0][j] = j * 0.9;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const delA = es && a[i - 1] === 'h' ? 0.5 : 1;    /* h muda (español) */
        const insB = es && b[j - 1] === 'h' ? 0.5 : 0.9;
        let best = Math.min(d[i - 1][j] + delA, d[i][j - 1] + insB, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1], es));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2][j - 2] + 0.8);
        d[i][j] = best;
      }
    }
    return d[n][m];
  }

  /* Idioma predominante de un texto: cuenta palabras que solo valen en inglés frente a las de español */
  function contextLang(text) {
    if (!typoEn || !text) return 'es';
    let es = 0, en = 0;
    const words = text.match(WORD_RE) || [];
    for (const w of words.slice(0, 80)) {
      if (w.length < 3) continue;
      const okEs = typo.check(w), okEn = typoEn.check(w);
      if (okEs && !okEn) es++; else if (okEn && !okEs) en++;
    }
    return en > es ? 'en' : 'es';
  }

  S.suggest = function (word, n = 5, context = '') {
    if (!S.ready) return [];
    const lang = contextLang(context);
    const source = new Map();
    let list = [];
    /* Typo.js compara con mayúsculas exactas: para palabras con inicial mayúscula o en
       mayúsculas se consulta también la forma en minúsculas */
    const queries = [word];
    if (word !== word.toLowerCase()) queries.push(word.toLowerCase());
    const ask = (dict, tag) => queries.forEach(q => {
      let res = [];
      try { res = dict.suggest(q, Math.max(n * 2, 10)) || []; } catch (_) { res = []; }
      res.forEach(sg => { if (!source.has(sg)) { source.set(sg, tag); list.push(sg); } });
    });
    ask(typo, 'es');
    if (typoEn) ask(typoEn, 'en');
    const bias = sg => (source.get(sg) === lang ? -0.35 : 0);
    const isUpper = word.length > 1 && word === word.toUpperCase();
    const isCap = !isUpper && word[0] !== word[0].toLowerCase();
    const isLower = !isUpper && !isCap;
    /* con entrada en minúsculas, se descartan variantes que solo cambian la mayúscula inicial */
    if (isLower) list = list.filter(sg => sg[0] === sg[0].toLowerCase() || !list.includes(sg[0].toLowerCase() + sg.slice(1)));
    const recase = sg => isUpper ? sg.toUpperCase() : isCap ? sg[0].toUpperCase() + sg.slice(1) : sg;
    list = list.map(sg => { const r = recase(sg); if (!source.has(r)) source.set(r, source.get(sg)); return r; });
    const seen = new Set();
    list = list.filter(sg => sg !== word && !seen.has(sg) && seen.add(sg));
    /* desempates: apóstrofos, siglas (varias mayúsculas) y candidatos más cortos son menos probables */
    const penalty = sg => (sg.includes("'") ? 0.2 : 0) + (!isUpper && /[A-ZÁÉÍÓÚÑ].*[A-ZÁÉÍÓÚÑ]/.test(sg) ? 0.2 : 0)
      + (sg.length < word.length ? 0.05 : 0) + (strip(sg[0].toLowerCase()) !== strip(word[0].toLowerCase()) ? 0.1 : 0);
    const scored = list.map((sg, i) => ({ sg, d: distance(word, sg, lang) + bias(sg) + penalty(sg), i }));
    scored.sort((x, y) => x.d - y.d || x.i - y.i);
    return scored.slice(0, n).map(x => x.sg);
  };

  S.replace = function (info, text) {
    Ed.focusEditor();
    Ed.restoreSelection(info.range);
    Ed.cmd('insertText', text);
    if (Ed.afterChange) Ed.afterChange();
    run();
  };
  S.addWord = function (word) {
    personal.add(word.toLowerCase());
    try { localStorage.setItem(KEY_WORDS, JSON.stringify(Array.from(personal))); } catch (_) { /* ignorar */ }
    cache.clear();
    run();
  };
  S.ignore = function (word) { ignored.add(word.toLowerCase()); run(); };

  S.setEnabled = function (on) {
    S.enabled = !!on;
    localStorage.setItem(KEY_ENABLED, on ? '1' : '0');
    syncButton();
    run();
  };
  function syncButton() {
    const b = document.getElementById('fbSpell');
    if (b) { b.classList.toggle('active', S.enabled); b.title = S.ready ? (S.enabled ? 'Desactivar corrector' : 'Activar corrector') : 'Cargando diccionario…'; }
  }

  document.addEventListener('DOMContentLoaded', syncButton);
  if (document.readyState !== 'loading') syncButton();
  Ed.editor.addEventListener('input', S.check);
  document.addEventListener('selectionchange', S.check);
})(window.Ed);
