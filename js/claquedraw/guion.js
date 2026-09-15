/* Claquedraw · guion
   El guion de un esquema (Leo, 15-09-2026, docs/diseno/rediseno-11/): del documento con secciones (una por nodo) se sacan
   las que no deben ir, se ordena el resto a mano y se genera un documento plano, sin secciones ni línea del tiempo, que
   vive en la biblioteca del esquema (segmento del sistema «Guiones») y se abre en el editor normal para exportarlo.

   Aquí va lo que comparten el editor (texto.js), la pantalla «Revisar guión» (revisar.js) y el gestor: la lista de
   secciones de un tablero, el orden de lectura y la composición del documento. El estado vive en los documentos
   (`guionEsquema`, `sacarDelGuion`…); este módulo no guarda nada. Se carga en Node para las pruebas. */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Los nodos con sección de un tablero (T.Modelo), en el orden del tiempo: por celda y, en la misma, por carril. Sin
     extremos de salto; con `conSaltos` (el tablero de un personaje) el salto tiene una, la de su extremo de salida. */
  function secciones(tm, conSaltos) {
    const fila = lid => tm.datos.lineas.findIndex(l => l.id === lid);
    return tm.datos.puntos.filter(p => { const s = tm.saltoDe(p.id); return !s || (conSaltos && s.deId === p.id); })
      .sort((a, b) => tm.cg(a) - tm.cg(b) || fila(a.lineaId) - fila(b.lineaId));
  }
  /* Dónde vive la nota de un nodo: en su id, o en el del extremo de salida si los dos extremos la comparten. */
  function clave(tm, id, conSaltos) { const s = conSaltos && tm.saltoDe(id); return s ? s.deId : id; }

  /* Palabras de un HTML (o de un texto). */
  function palabras(html) {
    const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z#0-9]+;/gi, 'x');
    const m = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return m ? m.length : 0;
  }
  /* Páginas aproximadas de un guion (≈ 200 palabras por página de guion; mínimo una si hay texto). */
  const paginas = n => n ? Math.max(1, Math.round(n / 200)) : 0;
  const numero = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');   // «2 160»
  /* «Duda», «Duda y Huida», «Duda, Huida y Puerto» */
  const enLista = xs => xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

  /* El estado del guion de un esquema listo para pintar: filas en el orden de lectura, con nombre, trama, palabras y si
     están fuera. `d` los documentos, `eid` el esquema, `tm` su tablero. */
  function estado(d, eid, tm, conSaltos) {
    const lista = secciones(tm, conSaltos), g = d.guionEsquema(eid);
    const porClave = new Map(lista.map(p => [clave(tm, p.id, conSaltos), p]));
    const fuera = new Set(g.fuera), plegadas = new Set(g.plegadas);
    const orden = d.ordenGuion(eid, [...porClave.keys()]);
    const filas = orden.map(k => {
      const p = porClave.get(k), l = tm.linea(p.lineaId) || {}, s = tm.saltoDe(p.id), n = d.notaEsquema(eid, k);
      return { clave: k, punto: p, linea: l, forma: s ? s.tipo : null, titulo: p.titulo || 'Sin título', fuera: fuera.has(k), plegada: plegadas.has(k),
               palabras: palabras(n && n.html), html: (n && n.html) || '', characters: (n && n.characters) || {} };
    });
    const dentro = filas.filter(f => !f.fuera);
    const total = dentro.reduce((a, f) => a + f.palabras, 0);
    return { filas, dentro, fueraFilas: filas.filter(f => f.fuera), palabras: total, paginas: paginas(total) };
  }

  /* El documento plano: título del proyecto y del guion, y el texto de cada sección dentro del guion, seguido, en el orden
     de lectura (sin cabeceras de sección). Personajes: los registros de las secciones copiadas. */
  function componer(d, eid, tm, conSaltos, op) {
    op = op || {};
    const e = estado(d, eid, tm, conSaltos), chars = {};
    const partes = [];
    if (op.proyecto || op.titulo) {
      if (op.proyecto) partes.push(`<p style="text-align: center;"><b>${esc(String(op.proyecto).toUpperCase())}</b></p>`);
      if (op.titulo) partes.push(`<p style="text-align: center;">${esc(op.titulo)}</p>`);
      partes.push('<hr>');
    }
    e.dentro.forEach(f => { if (f.html && f.palabras + (/(<img|<table|<hr)/i.test(f.html) ? 1 : 0)) { partes.push(f.html); Object.assign(chars, f.characters); } });
    return { html: partes.join(''), characters: chars, estado: e };
  }

  C.guion = { secciones, clave, palabras, paginas, numero, enLista, estado, componer };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
