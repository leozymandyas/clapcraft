/* Claquedraw · maquetar
   Reparte un guion en páginas como uno impreso (Leo, 18-09-2026: «este es un guion real de The Office, ve si en el editor
   podríamos replicarlo»): Carta, Courier 12 a 10 caracteres por pulgada y 6 renglones por pulgada, 54 renglones por página.
   Es un modelo puro (sin DOM; se carga en Node, `test/maquetar.test.js`): recibe los bloques con su tipo y su texto y devuelve
   las páginas, cada una con los trozos de bloque que lleva. exportar.js lo usa para el PDF.

   - Cada elemento tiene su columna y su ancho en caracteres (`FORMATOS`, las medidas del guion real) y se parte en renglones
     como lo hace el navegador: por los espacios y detrás de un guion entre letras; una palabra más larga que el renglón se corta.
   - Una línea en blanco antes de cada elemento, salvo personaje → paréntesis → diálogo (y diálogo → paréntesis), que van pegados.
   - El bloque de diálogo (personaje, paréntesis y diálogos seguidos) va junto. Si no cabe, se parte **dentro de un diálogo, al
     final de una oración, con dos renglones como mínimo a cada lado**: abajo «(MORE)» y arriba de la página siguiente
     «NOMBRE (CONT'D)». Si no hay dónde, pasa entero a la página siguiente.
   - La acción larga también se parte al final de una oración (dos renglones a cada lado); si no, pasa entera.
   - Un encabezado (escena, secundario, toma, acto) no se queda solo al pie: necesita dos renglones de lo que le sigue.
   - Una transición no empieza página: se lleva consigo el elemento anterior.
   - Un acto empieza página nueva, salvo el primero (con solo transiciones delante) y los «FIN…».
   - Lo que no cabe en ninguna página se corta por renglones. */
(function (raiz) {
  'use strict';
  const LINEAS = 54;
  /* columna (desde el margen izquierdo de 1,5 in) y ancho en caracteres; `pre`/`post`: lo que pinta el CSS alrededor */
  const FORMATOS = {
    scene: { col: 0, ancho: 60 }, subscene: { col: 0, ancho: 60 }, action: { col: 0, ancho: 60 },
    character: { col: 18, ancho: 38 }, paren: { col: 12, ancho: 26, primera: 27, pre: '(', post: ')' },
    dialogue: { col: 7.5, ancho: 42 }, transition: { col: 0, ancho: 60 }, shot: { col: 0, ancho: 60 },
    act: { col: 0, ancho: 60 }, note: { col: 0, ancho: 60, pre: '[', post: ']' }, montage: { col: 0, ancho: 60 },
    texto: { col: 0, ancho: 60 }
  };
  /* dentro de un diálogo doble, cada columna mide 28 caracteres (2,8 in): el personaje en el 8, el paréntesis en el 4 */
  const DOBLE = { character: { col: 8, ancho: 20 }, paren: { col: 4, ancho: 20, primera: 21, pre: '(', post: ')' }, dialogue: { col: 0, ancho: 28 } };
  const PEGADOS = new Set(['character>paren', 'character>dialogue', 'paren>dialogue', 'dialogue>paren', 'paren>paren', 'dialogue>more']);
  const ENCABEZADOS = new Set(['scene', 'subscene', 'shot', 'act']);

  /* ---------- renglones ---------- */
  /* Parte `texto` en renglones de `anchos[0]`, `anchos[1]`… (el último se repite). Devuelve [{ desde, hasta }] sobre el texto. */
  function envolver(texto, anchos) {
    const out = [];
    const ancho = n => anchos[Math.min(n, anchos.length - 1)];
    let base = 0;
    String(texto).split('\n').forEach((parrafo, k) => {
      if (k) base += 1;                                         // el salto de línea
      /* trozos: una palabra con sus espacios detrás; «fork-lift» son dos trozos («fork-» y «lift») */
      const trozos = [];
      const re = /[^\s-]*-(?=[A-Za-zÀ-ÿ])|\S+/g;
      let m, ultimo = 0;
      while ((m = re.exec(parrafo))) {
        let fin = m.index + m[0].length;
        while (fin < parrafo.length && /\s/.test(parrafo[fin])) fin++;
        trozos.push({ desde: m.index, hasta: fin, palabra: m[0].length });
        re.lastIndex = fin; ultimo = fin;
      }
      if (!trozos.length) { out.push({ desde: base, hasta: base + parrafo.length }); base += parrafo.length; return; }
      let linea = null;
      const cerrar = () => { if (linea) { out.push({ desde: base + linea.desde, hasta: base + linea.hasta }); linea = null; } };
      trozos.forEach(t => {
        const w = ancho(out.length);
        if (linea) {
          const largo = t.desde - linea.desde + t.palabra;           // hasta el final de la palabra (los espacios cuelgan)
          if (largo <= w) { linea.hasta = t.hasta; return; }
          cerrar();
        }
        /* una palabra más larga que el renglón se corta */
        let d = t.desde;
        while (t.desde + t.palabra - d > ancho(out.length)) { const w2 = ancho(out.length); out.push({ desde: base + d, hasta: base + d + w2 }); d += w2; }
        linea = { desde: d, hasta: t.hasta };
      });
      cerrar();
      base += parrafo.length;
      void ultimo;
    });
    return out.length ? out : [{ desde: 0, hasta: 0 }];
  }
  const anchosDe = f => f.primera ? [f.primera, f.ancho] : [f.ancho];
  /* renglones de un trozo de texto de un bloque de tipo `tipo` (con lo que pinta el CSS alrededor) */
  function renglones(tipo, texto) {
    const f = FORMATOS[tipo] || FORMATOS.texto;
    return envolver((f.pre || '') + texto + (f.post || ''), anchosDe(f)).length;
  }
  /* Renglones de un diálogo doble: los de su columna más larga (personaje, paréntesis y diálogo, pegados). `columnas`: dos
     listas de { tipo, texto }. */
  function lineasDoble(columnas) {
    return Math.max(1, ...columnas.map(col => col.reduce((n, b) => {
      const f = DOBLE[b.tipo] || DOBLE.dialogue;
      return n + envolver((f.pre || '') + b.texto + (f.post || ''), f.primera ? [f.primera, f.ancho] : [f.ancho]).length;
    }, 0)));
  }
  /* los renglones de un bloque: los de su texto o, si no es texto (un diálogo doble, una tabla, una imagen), los que trae */
  const renglonesBloque = (b, texto) => (b.lineas != null ? b.lineas : renglones(b.tipo, texto === undefined ? b.texto : texto));

  /* los finales de oración de un texto: posiciones justo detrás de «.», «?», «!», «…» (y comillas o paréntesis de cierre) */
  function finesDeOracion(texto) {
    const out = [];
    const re = /[.?!…]+["”’»)]*(?=\s)/g; let m;
    while ((m = re.exec(texto))) out.push(m.index + m[0].length);
    return out;
  }
  /* El mejor corte de `texto` para que lo de antes quepa en `disponibles` renglones: al final de una oración, con `minimo`
     renglones a cada lado. Devuelve la posición (en el texto) o -1. */
  function corte(tipo, texto, disponibles, minimo) {
    const fines = finesDeOracion(texto).reverse();
    for (const p of fines) {
      const antes = texto.slice(0, p), despues = texto.slice(p).replace(/^\s+/, '');
      const ra = renglones(tipo, antes), rd = renglones(tipo, despues);
      if (ra <= disponibles && ra >= minimo && rd >= minimo && despues.trim()) return p;
    }
    return -1;
  }

  /* ---------- páginas ---------- */
  /* `bloques`: [{ tipo, texto, nombre? }] (tipo: el de guion, o 'texto' para lo demás). Devuelve las páginas: cada una una lista
     de piezas { i, desde, hasta } (un trozo del bloque i), { more: true } o { contd: 'NOMBRE (CONT'D)' }. */
  function paginar(bloques) {
    const B = bloques.map((b, i) => Object.assign({ i }, b, { texto: String(b.texto || '') }));
    /* unidades: el bloque de diálogo va junto (personaje y lo que va pegado detrás) */
    const unidades = [];
    for (let i = 0; i < B.length; i++) {
      if (B[i].tipo === 'character') {
        const u = [B[i]];
        while (B[i + 1] && (B[i + 1].tipo === 'paren' || B[i + 1].tipo === 'dialogue')) u.push(B[++i]);
        unidades.push({ tipo: 'dialogo', bloques: u });
      } else unidades.push({ tipo: B[i].tipo, bloques: [B[i]] });
    }
    const paginas = [[]];
    let usados = 0, previo = null, contenido = false;          // previo: tipo del último bloque puesto
    const pagina = () => paginas[paginas.length - 1];
    const nueva = () => { paginas.push([]); usados = 0; previo = null; };
    const blanco = tipo => (usados > 0 && previo && !PEGADOS.has(previo + '>' + tipo)) ? 1 : 0;
    /* pone el trozo [desde, hasta) del texto del bloque `b` (un bloque partido lleva `base`: dónde empieza en el original; el
       «NOMBRE (CONT'D)» de arriba de página es un personaje sin `i`) */
    const poner = (b, desde, hasta) => {
      const txt = b.texto.slice(desde, hasta);
      usados += blanco(b.tipo) + renglonesBloque(b, b.lineas != null ? undefined : txt);
      if (b.contd) pagina().push({ contd: b.texto });
      else pagina().push({ i: b.i, desde: (b.base || 0) + desde, hasta: (b.base || 0) + hasta });
      previo = b.tipo;
    };
    /* pasa a la página siguiente llevándose los encabezados que se quedarían solos al pie (el de una escena cuyo diálogo no
       cabe entero ni se puede partir; antes se quedaba el encabezado abajo y lo suyo en la página siguiente) */
    const saltar = () => {
      const pag = pagina(), llevar = [];
      while (pag.length > 1) { const x = pag[pag.length - 1]; if (x.i === undefined || !ENCABEZADOS.has(B[x.i].tipo)) break; llevar.unshift(pag.pop()); }
      nueva();
      llevar.forEach(x => poner(B[x.i], x.desde, x.hasta));
    };
    /* lo que queda de un bloque partido en `p` (sin los espacios de delante), como un bloque más */
    const resto = (b, p) => { const t = b.texto.slice(p), sin = t.replace(/^\s+/, ''); return Object.assign({}, b, { texto: sin, base: (b.base || 0) + p + (t.length - sin.length) }); };
    const lineasDe = u => {                                       // renglones de una unidad entera (sin la línea en blanco de delante)
      let n = 0, p = null;
      u.bloques.forEach(b => { if (p && !PEGADOS.has(p + '>' + b.tipo)) n += 1; n += renglonesBloque(b); p = b.tipo; });
      return n;
    };
    /* lo mínimo de una unidad que tiene que acompañar a un encabezado: dos renglones (en un diálogo, el nombre y uno más) */
    const minimoDe = u => Math.min(2, lineasDe(u));

    for (let k = 0; k < unidades.length; k++) {
      const u = unidades[k], b0 = u.bloques[0];
      const lineas = lineasDe(u), antes = usados > 0 ? 1 : 0;   // la primera de una unidad siempre lleva línea en blanco
      /* un acto empieza página (salvo el primero, con solo transiciones delante, y los «FIN…») */
      if (u.tipo === 'act' && contenido && usados > 0 && !/^FIN\b/i.test(b0.texto.trim())) nueva();
      /* un encabezado se lleva los dos primeros renglones de lo que le sigue */
      let extra = 0;
      if (ENCABEZADOS.has(u.tipo) && unidades[k + 1]) extra = 1 + minimoDe(unidades[k + 1]);
      if (usados + antes + lineas + extra <= LINEAS || usados === 0 && lineas + extra <= LINEAS) {
        if (usados + (usados > 0 ? 1 : 0) + lineas > LINEAS) nueva();
        u.bloques.forEach(b => poner(b, 0, b.texto.length));
        if (u.tipo !== 'transition') contenido = true;
        continue;
      }
      /* no cabe: una transición se lleva la unidad de antes a la página siguiente */
      if (u.tipo === 'transition' && pagina().length > 1) {
        const pag = pagina();
        let j = pag.length - 1;
        const tipoUltimo = B[pag[j].i].tipo;
        /* la unidad de antes entera (si era un diálogo, desde su personaje) */
        if (tipoUltimo === 'dialogue' || tipoUltimo === 'paren' || tipoUltimo === 'character') { while (j > 0 && B[pag[j].i].tipo !== 'character') j--; }
        const movidas = pag.splice(j);
        if (pag.length && movidas.every(x => x.i !== undefined && x.desde === 0)) {
          nueva();
          movidas.forEach(x => poner(B[x.i], x.desde, x.hasta));
          poner(b0, 0, b0.texto.length);
          continue;
        }
        pag.push(...movidas);                                     // no se pudo: se deja como estaba
      }
      /* partir un diálogo (dentro de uno de sus diálogos, al final de una oración); lo que queda sigue en la página siguiente
         como otra unidad, con su «NOMBRE (CONT'D)» delante, y se vuelve a partir si hace falta */
      if (u.tipo === 'dialogo') { const r = partirDialogo(u); if (r) { unidades.splice(k + 1, 0, r); continue; } }
      /* partir una acción larga: lo que queda, como otra unidad */
      if (u.tipo === 'action') {
        const disp = LINEAS - usados - antes;
        const p = disp >= 2 ? corte('action', b0.texto, disp, 2) : -1;
        if (p > 0) {
          poner(b0, 0, p);
          nueva();
          unidades.splice(k + 1, 0, { tipo: 'action', bloques: [resto(b0, p)] });
          contenido = true;
          continue;
        }
      }
      /* a la página siguiente, entera (con su encabezado, si se quedaba solo); si ni así cabe, se corta por renglones */
      if (usados > 0) saltar();
      forzar(u);
      if (u.tipo !== 'transition') contenido = true;
    }
    return paginas;

    /* Parte un bloque de diálogo que no cabe: pone en esta página lo que quepa (hasta el final de una oración de uno de sus
       diálogos, con dos renglones como mínimo de él) y «(MORE)», abre página con «NOMBRE (CONT'D)» y devuelve la unidad con lo
       que queda (o null si no hay dónde cortar). */
    function partirDialogo(u) {
      const cab = u.bloques[0];
      const nombre = cab.texto.replace(/\s+/g, ' ').trim().toUpperCase();
      const contd = cab.contd ? cab.texto : (/\(CONT'?D\)|\(CONT\.\)/i.test(nombre) ? nombre : nombre + " (CONT'D)");
      const disp = LINEAS - usados - (usados > 0 ? 1 : 0);        // renglones libres para la unidad
      let gastados = 0, p = null;
      for (let j = 0; j < u.bloques.length; j++) {
        const b = u.bloques[j];
        const sep = p && !PEGADOS.has(p + '>' + b.tipo) ? 1 : 0;
        const r = renglones(b.tipo, b.texto);
        if (b.tipo === 'dialogue' && j > 0) {
          const libres = disp - gastados - sep - 1;                 // dejando uno para «(MORE)»
          if (libres >= 2 && r > libres) {
            const q = corte('dialogue', b.texto, libres, 2);
            if (q > 0) {
              u.bloques.slice(0, j).forEach(x => poner(x, 0, x.texto.length));
              poner(b, 0, q);
              pagina().push({ more: true }); usados += 1; previo = 'more';
              nueva();
              contenido = true;
              return { tipo: 'dialogo', bloques: [{ tipo: 'character', texto: contd, contd: true }, resto(b, q)].concat(u.bloques.slice(j + 1)) };
            }
          }
        }
        if (gastados + sep + r > disp) return null;
        gastados += sep + r; p = b.tipo;
      }
      return null;
    }
    /* pone una unidad; lo que no quepa en la página, en la siguiente, cortando por renglones si hace falta */
    function forzar(u) {
      u.bloques.forEach(b => {
        if (b.lineas != null) { if (usados > 0 && usados + blanco(b.tipo) + b.lineas > LINEAS) nueva(); poner(b, 0, b.texto.length); return; }   // no se parte
        const f = FORMATOS[b.tipo] || FORMATOS.texto;
        const pre = (f.pre || '').length;
        const rs = envolver((f.pre || '') + b.texto + (f.post || ''), anchosDe(f));
        let desde = 0;
        while (desde < rs.length) {
          const cab = LINEAS - usados - blanco(b.tipo);
          if (cab <= 0) { nueva(); continue; }
          const hastaR = Math.min(rs.length, desde + cab);
          const a = Math.max(0, rs[desde].desde - pre), z = hastaR >= rs.length ? b.texto.length : Math.max(0, rs[hastaR].desde - pre);
          usados += blanco(b.tipo) + (hastaR - desde);
          if (b.contd) pagina().push({ contd: b.texto });
          else pagina().push({ i: b.i, desde: (b.base || 0) + a, hasta: (b.base || 0) + z });
          previo = b.tipo;
          desde = hastaR;
          if (desde < rs.length) nueva();
        }
      });
    }
  }

  /* ---------- desde el documento (el PDF y el contador de páginas del editor, con la misma cuenta) ----------
     Solo recorren nodos (sin `document`): se cargan también en Node. */
  const tipoDe = el => { const m = el.className && typeof el.className === 'string' && el.className.match(/(?:^|\s)sp-([a-z]+)/); return m ? m[1] : null; };
  /* El texto de un bloque tal como se cuenta: los <br> son saltos de línea, los espacios duros son espacios y sin los de
     anchura cero. Un <br> al final no cuenta: el navegador no pinta una línea detrás (un párrafo vacío, `<p><br></p>`, es un
     renglón, no dos). */
  function textoBloque(el) {
    let t = '', br = false;
    const ir = n => n.childNodes.forEach(x => {
      if (x.nodeType === 3) { const v = x.nodeValue.replace(/\u200B/g, '').replace(/\u00A0/g, ' '); if (v) { t += v; br = false; } }
      else if (x.nodeName === 'BR') { t += '\n'; br = true; }
      else if (x.nodeType === 1) ir(x);
    });
    ir(el);
    return br ? t.slice(0, -1) : t;
  }
  /* las columnas de un diálogo doble, como listas de { tipo, texto } */
  const columnasDe = el => Array.from(el.children).filter(c => /(^|\s)sp-col(\s|$)/.test(c.className))
    .map(c => Array.from(c.children).map(p => { const tipo = tipoDe(p) || 'dialogue'; let texto = textoBloque(p); if (tipo === 'character') texto = texto.replace(/\s+/g, ' ').trim(); return { tipo, texto }; }));
  /* los elementos que se reparten en páginas: los hijos del documento, con las listas por elemento */
  const elementos = hijos => [].concat(...Array.from(hijos).map(n => /^(UL|OL)$/.test(n.nodeName) ? Array.from(n.children) : [n]));
  /* Los bloques de `els` para `paginar`, y de qué elemento sale cada uno (`indices`). Fuera las bases de datos, la portada y,
     con `op.sinNotas`, las notas; con `op.numerar`, cada escena lleva delante «ESCENA n - » (`prefijos`: cuántos caracteres).
     El personaje, con un solo espacio antes de su extensión (como sale en el PDF). Un diálogo doble ocupa lo de su columna más
     larga y lo que no es texto (una tabla, una imagen) los renglones que diga `op.fijo(el)`. */
  function bloquesDe(els, op) {
    op = op || {};
    const bloques = [], indices = [], prefijos = [];
    let escena = 0;
    els.forEach((el, k) => {
      if (/(^|\s)(db|portada)(\s|$)/.test(el.className || '')) return;
      const tipo = tipoDe(el);
      if (tipo === 'note' && op.sinNotas) return;
      let b, pre = 0;
      if (tipo === 'doble') b = { tipo: 'doble', texto: '', lineas: lineasDoble(columnasDe(el)) };
      else if (op.fijo && (/^(TABLE|IMG|FIGURE|VIDEO|IFRAME)$/.test(el.nodeName) || (el.querySelector && el.querySelector('img, table')))) b = { tipo: 'fijo', texto: '', lineas: Math.max(1, op.fijo(el)) };
      else {
        let texto = textoBloque(el);
        if (tipo === 'character') texto = texto.replace(/\s+/g, ' ').trim();
        if (tipo === 'scene' && op.numerar && texto.trim()) { const p = 'ESCENA ' + (++escena) + ' - '; texto = p + texto; pre = p.length; }
        b = { tipo: tipo || 'texto', texto };
      }
      bloques.push(b); indices.push(k); prefijos.push(pre);
    });
    return { bloques, indices, prefijos };
  }

  const API = { LINEAS, FORMATOS, DOBLE, envolver, renglones, lineasDoble, finesDeOracion, corte, paginar, tipoDe, textoBloque, columnasDe, elementos, bloquesDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { raiz.Claquedraw = raiz.Claquedraw || {}; raiz.Claquedraw.maquetar = API; }
})(typeof window !== 'undefined' ? window : globalThis);
