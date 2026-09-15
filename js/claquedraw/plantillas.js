/* Claquedraw · plantillas de proyecto
   La pantalla «Nuevo proyecto» (Leo, 15-09-2026, docs/diseno/rediseno-13/Pantalla Nuevo Proyecto): cada plantilla dice en
   una línea qué crea, lo resume en chips y, al elegirla, enseña el árbol y las tramas exactas que va a crear. Aquí van las
   definiciones y lo que sale de ellas: los `documentos` de un guion nuevo (un contenedor con sus carpetas, esquemas con su
   biblioteca enlazada y bibliotecas sueltas; cada esquema con las tramas de la plantilla), la vista previa del árbol y el
   resumen de un proyecto para «Recientes». Sin DOM: se carga en Node para las pruebas (test/plantillas.test.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /* Árbol: { carpeta, hijos } · { esquema, biblioteca? } (con su biblioteca enlazada: del mismo nombre, o `biblioteca` si
     la lleva) · { biblioteca } (suelta).
     `tono` pinta la tarjeta (uno de los 24 de las tramas); `carpeta` es el color de sus carpetas (los seis de las carpetas).
     Tramas: [nombre, tipo, color]. */
  const PLANTILLAS = [
    { id: 'blanco', nombre: 'En blanco', tono: 'gris', carpeta: 'gris', contenedor: 'Contenedor',
      resumen: 'Un contenedor con un esquema y nada más. Para empezar sin estructura impuesta.',
      chips: ['1 CONTENEDOR', '1 ESQUEMA'],
      arbol: [{ esquema: 'Esquema', biblioteca: 'Biblioteca' }],   // Leo: «Esquema» y «Biblioteca», no «Esquema 1»
      tramas: [['Trama', 'principal', 'violeta']] },
    { id: 'largo', nombre: 'Largometraje', tono: 'violeta', carpeta: 'violeta', contenedor: 'Película',
      resumen: 'Tres actos, cada uno con su esquema de secuencias, y las localizaciones.',
      chips: ['3 ACTOS', '3 ESQUEMAS', '1 BIBLIOTECA'],
      arbol: [{ carpeta: 'Acto I', hijos: [{ esquema: 'Secuencias I' }, { biblioteca: 'Localizaciones' }] },
              { carpeta: 'Acto II', hijos: [{ esquema: 'Secuencias II' }] },
              { carpeta: 'Acto III', hijos: [{ esquema: 'Secuencias III' }] }],
      tramas: [['Protagonista', 'principal', 'violeta'], ['Antagonista', 'secundaria', 'rojo']] },
    { id: 'serie', nombre: 'Serie de TV', tono: 'cielo', carpeta: 'azul', contenedor: 'Temporada 1',
      resumen: 'Una temporada con sus ocho capítulos, cada uno con su escaleta.',
      chips: ['1 TEMPORADA', '8 CAPÍTULOS', 'BIBLIOTECAS'],
      arbol: [...ROMANOS.slice(0, 8).map(r => ({ carpeta: 'Capítulo ' + r, hijos: [{ esquema: 'Escaleta ' + r }] })),
              { biblioteca: 'Lugares' }, { biblioteca: 'Reparto fijo' }],
      tramas: [['Arco de temporada', 'principal', 'cielo'], ['Trama del capítulo', 'secundaria', 'teal'], ['Final alternativo', 'alterna', 'verde']] },
    { id: 'novela', nombre: 'Novela', tono: 'esmeralda', carpeta: 'verde', contenedor: 'Novela',
      resumen: 'Partes con su esquema de capítulos en prosa, y una biblioteca de personajes.',
      chips: ['3 PARTES', '3 ESQUEMAS', 'PERSONAJES'],
      arbol: [{ carpeta: 'Primera parte', hijos: [{ esquema: 'Capítulos I' }] },
              { carpeta: 'Segunda parte', hijos: [{ esquema: 'Capítulos II' }] },
              { carpeta: 'Tercera parte', hijos: [{ esquema: 'Capítulos III' }] },
              { biblioteca: 'Personajes' }],
      tramas: [['Narradora', 'principal', 'esmeralda'], ['Recuerdos', 'alterna', 'oliva']] },
    { id: 'corto', nombre: 'Cortometraje', tono: 'cobre', carpeta: 'ambar', contenedor: 'Corto',
      resumen: 'Una sola secuencia con su esquema y una biblioteca para el rodaje.',
      chips: ['1 SECUENCIA', '1 BIBLIOTECA'],
      arbol: [{ esquema: 'Secuencia' }, { biblioteca: 'Notas de rodaje' }],
      tramas: [['Protagonista', 'principal', 'cobre']] },
    { id: 'teatro', nombre: 'Teatro', tono: 'magenta', carpeta: 'rojo', contenedor: 'Obra',
      resumen: 'Actos con sus cuadros, y el reparto aparte.',
      chips: ['2 ACTOS', '2 ESQUEMAS', 'REPARTO'],
      arbol: [{ carpeta: 'Acto I', hijos: [{ esquema: 'Cuadros I' }] },
              { carpeta: 'Acto II', hijos: [{ esquema: 'Cuadros II' }] },
              { biblioteca: 'Reparto' }],
      tramas: [['Escena', 'principal', 'magenta'], ['Coro', 'secundaria', 'uva']] }
  ];
  const plantilla = id => PLANTILLAS.find(p => p.id === id) || PLANTILLAS[0];

  /* El tablero de cada esquema: los tres actos de siempre (los de `inicial()` de las tramas) con las tramas de la plantilla
     y el primer nodo, «Inicio», en la principal. */
  function tablero(p) {
    return {
      actos: [{ id: 'a1', nombre: 'Acto I', celdas: 14, fondo: null }, { id: 'a2', nombre: 'Acto II', celdas: 22, fondo: null },
              { id: 'a3', nombre: 'Acto III', celdas: 15, fondo: null }],
      lineas: p.tramas.map(([nombre, tipo, color], i) => ({ id: 'l' + (i + 1), nombre, tipo, color, cortada: false })),
      puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 2, titulo: 'Inicio', descripcion: '', color: null, cortado: false }],
      saltos: [], notas: [], formato: 1
    };
  }

  /* Los documentos de un guion nuevo con esa plantilla. `op` son las del modelo (ahora, idNuevo: las pruebas). */
  function documentos(id, op) {
    const p = plantilla(id), d = new C.Documentos(null, op);
    d.datos.migrado = true;                                    // nada que migrar: no se crea el «Esquema de pasos» de la forma antigua
    const c = d.crearContenedor(p.contenedor, { vacio: true }).contenedor;
    const poner = (nodos, carpetaId) => nodos.forEach(n => {
      if (n.carpeta) { const k = d.crearCarpeta(c.id, n.carpeta, p.carpeta, carpetaId).carpeta; poner(n.hijos || [], k.id); }
      else if (n.esquema) {
        const r = d.crearEsquema(c.id, tablero(p), n.esquema);
        if (n.biblioteca) d.renombrarSub(r.sub.id, n.biblioteca);
        if (carpetaId) d.moverACarpeta('esquema', r.esquema.id, carpetaId);
      }
      else if (n.biblioteca) { const r = d.crearSub(c.id, n.biblioteca); if (carpetaId) d.moverACarpeta('sub', r.sub.id, carpetaId); }
    });
    poner(p.arbol, null);
    return d.toJSON();
  }

  /* La vista previa del árbol, fila a fila: { tipo: 'contenedor' | 'carpeta' | 'esquema' | 'biblioteca', nivel, nombre,
     enlazada? }. Un esquema va seguido de su biblioteca enlazada, que se crea con él. */
  function arbol(id) {
    const p = plantilla(id), filas = [{ tipo: 'contenedor', nivel: 0, nombre: p.contenedor }];
    const poner = (nodos, nivel) => nodos.forEach(n => {
      if (n.carpeta) { filas.push({ tipo: 'carpeta', nivel, nombre: n.carpeta }); poner(n.hijos || [], nivel + 1); }
      else if (n.esquema) { filas.push({ tipo: 'esquema', nivel, nombre: n.esquema }); filas.push({ tipo: 'biblioteca', nivel, nombre: n.biblioteca || n.esquema, enlazada: true }); }
      else filas.push({ tipo: 'biblioteca', nivel, nombre: n.biblioteca });
    });
    poner(p.arbol, 1);
    return filas;
  }

  /* El resumen de un proyecto para «Recientes»: «2 CONTENEDORES · 5 ESQUEMAS» (sin Personajes, que va oculto). */
  function estructura(docs) {
    const conts = ((docs && docs.contenedores) || []).filter(c => !c.oculto);
    const esquemas = conts.reduce((n, c) => n + (c.esquemas || []).length, 0);
    const bibliotecas = conts.reduce((n, c) => n + (c.subs || []).filter(s => !(c.esquemas || []).some(e => e.subId === s.id)).length, 0);
    const cuenta = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
    return [cuenta(conts.length, 'CONTENEDOR', 'CONTENEDORES'), cuenta(esquemas, 'ESQUEMA', 'ESQUEMAS')]
      .concat(bibliotecas ? [cuenta(bibliotecas, 'BIBLIOTECA', 'BIBLIOTECAS')] : []).join(' · ');
  }

  /* «HOY, 11:20», «AYER», «HACE 4 DÍAS», «HACE 3 SEMANAS», «HACE 2 MESES» */
  function visto(ts, ahora) {
    if (!ts) return '';
    const f = new Date(ts), hoy = new Date(ahora || Date.now());
    const dia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dias = Math.round((dia(hoy) - dia(f)) / 864e5);
    if (dias <= 0) return 'HOY, ' + String(f.getHours()).padStart(2, '0') + ':' + String(f.getMinutes()).padStart(2, '0');
    if (dias === 1) return 'AYER';
    if (dias < 7) return 'HACE ' + dias + ' DÍAS';
    if (dias < 31) { const s = Math.round(dias / 7); return 'HACE ' + s + (s === 1 ? ' SEMANA' : ' SEMANAS'); }
    const m = Math.round(dias / 30); return m < 12 ? 'HACE ' + m + (m === 1 ? ' MES' : ' MESES') : 'HACE MÁS DE UN AÑO';
  }

  C.plantillas = { PLANTILLAS, plantilla, tablero, documentos, arbol, estructura, visto };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
