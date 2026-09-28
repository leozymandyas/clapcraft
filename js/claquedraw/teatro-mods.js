/* ClapCraft · los mods del teatro de duendes (1.1.63)
   Leo, 28-09-2026: «Que exista una funcionalidad que solo funcione con Claude, y que sea para que pueda incorporar elementos,
   escenarios y más para que la obra se vea más fiel al guion, por lo que debe dejarse abierta y editable esa parte sin tocar el
   motor de teatro para no dañarlo, una especie de mods para el teatro».
   · Viven en el proyecto, `documentos.teatro = { escenarios, vestuarios, objetos, mascaras, musicas }` (la clave solo si hay
     alguno), y solo los escribe Claude (Cowork o Claude Code) con `editar_teatro`; el asistente de la app no tiene esa herramienta.
   · Son **datos, nunca código**: un escenario es una lista de capas de dibujo (rect, círculo, bandas, colinas, estrellas, un
     dibujo en píxeles…), un vestuario combina las piezas que el motor ya sabe dibujar (sombreros, estampados, caras, colas…), un
     objeto de utilería o una máscara son un dibujo en píxeles (filas de letras y sus colores) y una música, los parámetros del
     compositor. `validar` los comprueba campo a campo (ids, colores, números dentro de rango, tamaños) y duendes.html los vuelve a
     mirar y los dibuja dentro de un try, así que un mod malo se ignora y el motor no se toca.
   · `FABRICA` son los ids que ya trae el teatro (un mod no puede llamarse igual: no sustituye nada de fábrica); test/teatro-mods.test.js
     comprueba que siguen siendo los de duendes.html. */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  const FABRICA = {
    gestos: ['feliz', 'rie', 'triste', 'enojado', 'sorpresa', 'miedo', 'susurro', 'canta', 'baila', 'salta', 'corre', 'piensa', 'nervioso', 'sarcasmo', 'exclama', 'saluda', 'senala', 'aplaude', 'sienta', 'esconde', 'cansado', 'desmayo', 'telefono', 'come', 'pelea', 'olfatea', 'ladra', 'aulla', 'grune', 'muerde', 'camara', 'sale', 'reverencia'],
    escenarios: ['oficina', 'sala', 'cocina', 'salon', 'playa', 'mar', 'pradera', 'bosque', 'selva', 'montanas', 'desierto', 'ciudad', 'pueblo', 'castillo', 'cueva', 'invierno', 'espacio', 'vacio'],
    vestuarios: ['ninguno', 'pirata', 'rey', 'princesa', 'mago', 'hada', 'caballero', 'vaquero', 'mariachi', 'catrina', 'luchador', 'detective', 'doctor', 'cientifico', 'chef', 'astronauta', 'bombero', 'explorador', 'ninja', 'heroe', 'vampiro', 'fantasma', 'robot', 'payaso', 'abeja', 'graduado',
      'perro', 'gato', 'gorila', 'oso', 'conejo', 'zorro', 'tigre', 'raton'],
    mascaras: ['ninguna', 'neutra', 'comedia', 'tragedia', 'veneciana', 'antifaz', 'lucha', 'calavera', 'diablito', 'pajaro', 'tiki', 'zorro', 'gato', 'conejo', 'oso', 'jaguar', 'perro', 'gorila', 'raton'],
    musicas: ['ninguna', 'alegre', 'comedia', 'romantica', 'triste', 'noche', 'misterio', 'suspenso', 'terror', 'accion', 'epica'],
    objetos: []
  };
  /* los gestos que el motor sabe actuar (getPose de duendes.html), con lo que significan */
  const GESTOS = [['feliz','alegre, sonríe'],['rie','se ríe'],['triste','triste, llora'],['enojado','enojado, grita, manotea'],
    ['sorpresa','sorprendido, da un brinco'],['miedo','tiene miedo, tiembla y se cubre'],['susurro','susurra, en secreto'],['canta','canta'],
    ['baila','baila'],['salta','salta'],['corre','corre, huye, va de un lado a otro'],['piensa','piensa, duda'],['nervioso','nervioso, preocupado'],
    ['sarcasmo','sarcástico, burlón'],['exclama','exclama, levanta el brazo'],['saluda','saluda con la mano'],['senala','señala algo'],
    ['aplaude','aplaude, celebra'],['sienta','se sienta y se queda sentado'],['esconde','se agacha, se esconde, se tapa'],
    ['cansado','cansado, bosteza'],['desmayo','se desmaya, cae rendido'],['telefono','habla por teléfono o mira el celular'],
    ['come','come o mastica'],['pelea','pelea, forcejea, golpea'],['olfatea','olfatea, husmea'],['ladra','ladra'],['aulla','aúlla'],
    ['grune','gruñe, amenaza'],['muerde','muerde o jala con los dientes'],
    ['camara','habla a cámara, al público (solo líneas)'],['sale','sale de escena al terminar de hablar (solo líneas)']];
  /* las piezas que el motor sabe dibujar, para los vestuarios */
  const PIEZAS = {
    hat: ['punta', 'caido', 'hongo', 'gorro', 'pelo', 'flores', 'corona', 'mago', 'casco', 'chef', 'astro', 'vaquero', 'fedora', 'tricornio', 'ninja', 'payaso', 'tiara', 'charro', 'antenas', 'antena', 'safari', 'birrete', 'bombero', 'floral', 'nada',
      'gorra', 'boina', 'copa', 'bandana', 'casco-obra', 'diadema'],
    pat: ['rayas', 'estrellas', 'botones', 'puntos', 'armadura', 'chaleco', 'bolsillos', 'estetoscopio', 'emblema', 'moño', 'mariachi', 'luces', 'reflejante'],
    face: ['parche', 'nariz', 'antifaz', 'lentes', 'colmillos'],
    prop: ['espada', 'cetro', 'varita', 'guitarra', 'cuchara', 'lupa'],
    cola: ['perro', 'gato', 'oso', 'conejo', 'zorro', 'tigre', 'raton'],
    long: ['vestido', 'largo'],
    onda: ['sine', 'square', 'triangle', 'sawtooth']
  };
  const TIPOS = { escenario: 'escenarios', vestuario: 'vestuarios', objeto: 'objetos', mascara: 'mascaras', musica: 'musicas', gesto: 'gestos' };
  const MAX_POR_TIPO = 80, MAX_CAPAS = 600, MAX_BYTES = 900000;
  /* las voces del teatro (VOICES de duendes.html) y las piezas de un gesto (las poses que sabe dibujar getPose) */
  const VOCES = ['normal', 'aguda', 'dulce', 'grave', 'ronca', 'robot', 'burbuja', 'chillona', 'misteriosa', 'graciosa'];
  const POSE = { brazo: ['down', 'up', 'out', 'diag', 'reach', 'hold', 'type'], piernas: [0, 1, 3, 4], ojos: ['abiertos', 'cerrados'],
    boca: ['normal', 'abierta', 'sonrisa'], mueve: ['nada', 'ida-vuelta', 'avanza', 'retrocede'],
    particula: ['z', 'note', 'heart', 'spark', 'q', 'ex', 'drop', 'anger'], globo: ['dots', 'q', 'ex', 'check', 'bulb', 'heart'] };

  const esColor = c => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim());
  const texto = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const num = (v, a, b) => { const x = Number(v); return Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : null; };
  const slug = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  function error(m) { return { ok: false, error: m }; }
  function comunes(x, tipo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return error('El ' + tipo + ' tiene que ser un objeto');
    const id = slug(x.id || x.nombre);
    if (!id || id.length < 2) return error('Falta el id (letras, números y guiones)');
    if ((FABRICA[TIPOS[tipo]] || []).includes(id)) return error('«' + id + '» ya es un ' + tipo + ' de fábrica: ponle otro id (los mods no sustituyen los de fábrica)');
    const nombre = texto(x.nombre || id, 40);
    const parecidos = (Array.isArray(x.parecidos) ? x.parecidos : []).map(p => texto(p, 30).toLowerCase()).filter(Boolean).slice(0, 12);
    return { ok: true, base: Object.assign({ id, nombre }, parecidos.length ? { parecidos } : {}) };
  }
  /* un dibujo en píxeles: filas de igual largo, cada letra un color de `colores` (el punto y el espacio, transparentes) */
  function dibujo(filas, colores, maxW, maxH) {
    if (!Array.isArray(filas) || !filas.length) return error('Faltan las filas del dibujo');
    if (filas.length > maxH) return error('El dibujo tiene más de ' + maxH + ' filas');
    const f = filas.map(r => String(r == null ? '' : r));
    const w = Math.max(...f.map(r => r.length));
    if (!w || w > maxW) return error('Las filas del dibujo tienen que medir entre 1 y ' + maxW + ' caracteres');
    if (!colores || typeof colores !== 'object') return error('Faltan los colores del dibujo ({ "a": "#rrggbb" })');
    const cs = {};
    for (const [k, v] of Object.entries(colores)) { if (String(k).length !== 1 || k === '.' || k === ' ') continue; if (!esColor(v)) return error('«' + v + '» no es un color (#rgb o #rrggbb)'); cs[k] = v.trim(); }
    for (const r of f) for (const ch of r) if (ch !== '.' && ch !== ' ' && !cs[ch]) return error('La letra «' + ch + '» del dibujo no tiene color');
    return { ok: true, filas: f.map(r => r.padEnd(w, '.')), colores: cs };
  }
  /* las capas de un escenario: [op, …args]. El lienzo mide 320 × 126 (el suelo del escenario va aparte). */
  const OPS = {
    cielo: a => (Array.isArray(a[0]) && a[0].length && a[0].length <= 12 && a[0].every(esColor) ? [a[0]] : null),
    bandas: a => (num(a[0], 0, 126) != null && num(a[1], 0, 126) != null && Array.isArray(a[2]) && a[2].length && a[2].length <= 12 && a[2].every(esColor) ? [num(a[0], 0, 126), num(a[1], 0, 126), a[2]] : null),
    rect: a => (esColor(a[4]) ? [num(a[0], -50, 370), num(a[1], -50, 176), num(a[2], 0, 400), num(a[3], 0, 200), a[4]] : null),
    circulo: a => (esColor(a[3]) ? [num(a[0], -50, 370), num(a[1], -50, 176), num(a[2], 0, 120), a[3]] : null),
    elipse: a => (esColor(a[4]) ? [num(a[0], -50, 370), num(a[1], -50, 176), num(a[2], 0, 200), num(a[3], 0, 120), a[4]] : null),
    triangulo: a => (esColor(a[4]) ? [num(a[0], -50, 370), num(a[1], -50, 176), num(a[2], 0, 176), num(a[3], 0, 200), a[4]] : null),
    colina: a => (esColor(a[4]) ? [num(a[0], 0, 126), num(a[1], 0, 60), num(a[2], 0, 1), num(a[3], -10, 10), a[4]] : null),
    estrellas: a => [num(a[0], 0, 400), num(a[1], 0, 126)],
    nube: a => (esColor(a[3] || '#ffffff') ? [num(a[0], -50, 370), num(a[1], -50, 176), num(a[2], .2, 4), a[3] || '#ffffff'] : null),
    pixel: a => (esColor(a[2]) ? [num(a[0], 0, 319), num(a[1], 0, 125), a[2]] : null)
  };
  function capas(lista) {
    if (!Array.isArray(lista) || !lista.length) return error('Faltan las capas del escenario');
    if (lista.length > MAX_CAPAS) return error('Demasiadas capas (' + lista.length + '; ' + MAX_CAPAS + ' como mucho)');
    const out = [];
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      if (!Array.isArray(c) || typeof c[0] !== 'string') return error('La capa ' + (i + 1) + ' tiene que ser una lista: ["rect", x, y, ancho, alto, "#color"]');
      const op = c[0].toLowerCase();
      if (op === 'dibujo') {
        const d = dibujo(c[3], c[4], 160, 96); if (!d.ok) return error('Capa ' + (i + 1) + ': ' + d.error);
        out.push(['dibujo', num(c[1], -50, 370), num(c[2], -50, 176), d.filas, d.colores, num(c[5] || 1, 1, 4)]); continue;
      }
      if (!OPS[op]) return error('Capa ' + (i + 1) + ': no conozco «' + op + '» (valen: ' + Object.keys(OPS).concat('dibujo').join(', ') + ')');
      const a = OPS[op](c.slice(1));
      if (!a || a.some(v => v === null)) return error('Capa ' + (i + 1) + ' («' + op + '»): faltan números o un color');
      out.push([op].concat(a));
    }
    return { ok: true, capas: out };
  }
  const VALIDAR = {
    escenario(x) {
      const b = comunes(x, 'escenario'); if (!b.ok) return b;
      const c = capas(x.capas); if (!c.ok) return c;
      return { ok: true, dato: Object.assign(b.base, { noche: !!x.noche, capas: c.capas }) };
    },
    vestuario(x, extra) {
      const b = comunes(x, 'vestuario'); if (!b.ok) return b;
      const d = Object.assign(b.base, { emoji: texto(x.emoji || '🧩', 4) });
      for (const k of ['cloth', 'cloth2', 'pants', 'shoes', 'skin', 'hatCol', 'patCol', 'cape', 'capeIn', 'faceCol', 'hair', 'eyeCol']) {
        if (x[k] == null) continue;
        if (!esColor(x[k])) return error('«' + k + '» tiene que ser un color (#rrggbb)');
        d[k] = x[k].trim();
      }
      /* (1.1.67) también el cuerpo, la prenda, lo de abajo, el calzado y el peinado de los duendes v2 */
      for (const [k, lista] of [['hat', PIEZAS.hat], ['pat', PIEZAS.pat], ['face', PIEZAS.face], ['prop', PIEZAS.prop], ['cola', PIEZAS.cola], ['long', PIEZAS.long],
        ['cuerpo', RASGOS.cuerpo], ['prenda', RASGOS.prenda], ['bajo', RASGOS.bajo], ['calzado', RASGOS.calzado], ['peinado', RASGOS.peinado]]) {
        if (x[k] == null || x[k] === '') continue;
        if (!lista.includes(x[k])) return error('«' + k + '» vale: ' + lista.join(', '));
        d[k] = x[k];
      }
      if (x.animal != null && x.animal !== '') {
        const m = slug(x.animal), mods = (extra && extra.mascaras) || [];
        if (!FABRICA.mascaras.includes(m) && !mods.includes(m)) return error('«animal» es la máscara de su cara: una de fábrica (' + FABRICA.mascaras.slice(1).join(', ') + ') o un mod de máscara');
        d.animal = m;
      }
      for (const k of ['wings', 'noEars', 'noBeard', 'noBelt']) if (x[k] === true) d[k] = true;
      if (x.escala != null) { const e = num(x.escala, .6, 1.8); if (e == null) return error('«escala» es un número de 0.6 a 1.8'); d.escala = e; }
      return { ok: true, dato: d };
    },
    /* `ancho`: lo que mide en el escenario (un duende mide 24 de alto; un coche, 100–130; una silla, 20); el dibujo se escala a eso */
    objeto(x) {
      const b = comunes(x, 'objeto'); if (!b.ok) return b;
      const d = dibujo(x.filas, x.colores, 128, 96); if (!d.ok) return d;
      const w = d.filas[0].length, ancho = x.ancho != null ? num(x.ancho, 6, 300) : Math.round(w * num(x.escala || 1, 1, 3));
      if (ancho == null) return error('«ancho» es lo que mide en el escenario (6 a 300; un duende mide 24 de alto)');
      return { ok: true, dato: Object.assign(b.base, { filas: d.filas, colores: d.colores, ancho }) };
    },
    /* un gesto clave: de 1 a 8 cuadros de pose que se repiten, con temblor, saltos, movimiento, partículas y un globo */
    gesto(x) {
      const b = comunes(x, 'gesto'); if (!b.ok) return b;
      const cs = Array.isArray(x.cuadros) ? x.cuadros : [];
      if (!cs.length || cs.length > 8) return error('«cuadros» son de 1 a 8 poses: { brazoI, brazoD, piernas, cuerpo, sentado, ojos, boca, dura }');
      const cuadros = [];
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i] || {}, q = {};
        for (const k of ['brazoI', 'brazoD']) { const v = c[k] || 'down'; if (!POSE.brazo.includes(v)) return error('Cuadro ' + (i + 1) + ': «' + k + '» vale ' + POSE.brazo.join(', ')); q[k] = v; }
        const pi = c.piernas == null ? 0 : +c.piernas; if (!POSE.piernas.includes(pi)) return error('Cuadro ' + (i + 1) + ': «piernas» vale 0 (quieto), 1 o 3 (pasos) o 4 (en el aire)'); q.piernas = pi;
        q.cuerpo = Math.round(num(c.cuerpo == null ? 0 : c.cuerpo, -1, 3));
        if (c.sentado === true) q.sentado = true;
        const oj = c.ojos || 'abiertos', bo = c.boca || 'normal';
        if (!POSE.ojos.includes(oj) || !POSE.boca.includes(bo)) return error('Cuadro ' + (i + 1) + ': «ojos» vale abiertos o cerrados; «boca», normal, abierta o sonrisa');
        q.ojos = oj; q.boca = bo; q.dura = Math.round(num(c.dura == null ? 12 : c.dura, 2, 60));
        cuadros.push(q);
      }
      const d = Object.assign(b.base, { cuadros });
      if (x.sacude === true) d.sacude = true;
      if (x.salta === true) d.salta = true;
      if (x.mueve != null) { if (!POSE.mueve.includes(x.mueve)) return error('«mueve» vale ' + POSE.mueve.join(', ')); if (x.mueve !== 'nada') d.mueve = x.mueve; }
      if (x.particula) {
        const pt = x.particula;
        if (!POSE.particula.includes(pt.tipo) || (pt.color && !esColor(pt.color))) return error('«particula» es { tipo: ' + POSE.particula.join(' | ') + ', color, cada }');
        d.particula = { tipo: pt.tipo, color: pt.color || '#ffffff', cada: Math.round(num(pt.cada || 24, 6, 120)) };
      }
      if (x.globo != null) { if (!POSE.globo.includes(x.globo)) return error('«globo» vale ' + POSE.globo.join(', ')); d.globo = x.globo; }
      return { ok: true, dato: d };
    },
    mascara(x) {
      const b = comunes(x, 'mascara'); if (!b.ok) return b;
      const d = dibujo(x.filas, x.colores, 12, 10); if (!d.ok) return d;
      return { ok: true, dato: Object.assign(b.base, { filas: d.filas, colores: d.colores }) };
    },
    musica(x) {
      const b = comunes(x, 'musica'); if (!b.ok) return b;
      const modo = Array.isArray(x.modo) ? x.modo.map(v => num(v, 0, 24)).filter(v => v !== null) : [];
      const acordes = Array.isArray(x.acordes) ? x.acordes.map(v => num(v, 0, 11)).filter(v => v !== null).map(Math.round) : [];
      if (modo.length < 3 || modo.length > 12) return error('«modo» es la escala en semitonos (3 a 12 números de 0 a 24), p. ej. [0,2,3,5,7,8,10]');
      if (acordes.length !== 4) return error('«acordes» son 4 grados de la escala (0 a 11), p. ej. [0,5,3,4]');
      const onda = x.onda || 'square';
      if (!PIEZAS.onda.includes(onda)) return error('«onda» vale: ' + PIEZAS.onda.join(', '));
      const d = Object.assign(b.base, { bpm: num(x.bpm || 100, 40, 200), modo: modo.map(Math.round), acordes, onda, densidad: num(x.densidad == null ? .5 : x.densidad, 0, 1), raiz: Math.round(num(x.raiz || 60, 36, 84)) });
      for (const k of ['pulso', 'arpegio', 'staccato', 'marcha']) if (x[k] === true) d[k] = true;
      return { ok: true, dato: d };
    }
  };
  function validar(tipo, x, extra) {
    if (!VALIDAR[tipo]) return error('No hay mods de tipo «' + tipo + '» (valen: ' + Object.keys(VALIDAR).join(', ') + ')');
    try { return VALIDAR[tipo](x, extra); } catch (e) { return error('No se entiende ese ' + tipo); }
  }
  /* lo guardado, limpio (lo que no valga, fuera): para normalizar y para pasárselo al teatro */
  /* **Las obras dirigidas por Claude** (`teatro.obras[notaId] = { huella, fecha, titulo, plan }`, dirigir_obra): la puesta en escena
     de cada documento, por la firma de cada evento (tipo, quién y texto), así que vale para un fragmento y, si el guion cambia, lo que
     no se tocó conserva la suya. Solo campos conocidos, con sus topes. */
  const MAX_OBRAS = 60, MAX_EVENTOS = 4000;
  const ids = l => (Array.isArray(l) ? l.filter(x => typeof x === 'string' && x.length <= 40).slice(0, 20) : undefined);
  function decision(x) {
    if (!x || typeof x !== 'object') return null;
    const d = {};
    for (const k of ['bd', 'musica', 'mov', 'tamano']) if (typeof x[k] === 'string' && x[k].length <= 40) d[k] = x[k];
    if ('emo' in x && (x.emo === null || (typeof x.emo === 'string' && x.emo.length <= 20))) d.emo = x.emo;
    if (typeof x.noche === 'boolean') d.noche = x.noche;
    if (typeof x.cartel === 'string' && x.cartel.trim()) d.cartel = texto(x.cartel, 60);
    for (const k of ['presentes', 'quienes']) { const l = ids(x[k]); if (l && l.length) d[k] = l; }
    if (Array.isArray(x.objetos)) {
      const l = x.objetos.filter(o => o && typeof o.id === 'string').slice(0, 6).map(o => Object.assign({ id: o.id.slice(0, 30) },
        Number.isFinite(o.x) ? { x: Math.max(20, Math.min(300, Math.round(o.x))) } : {}, Number.isFinite(o.ancho) ? { ancho: Math.max(6, Math.min(300, Math.round(o.ancho))) } : {}));
      if (l.length) d.objetos = l;
    }
    return Object.keys(d).length ? d : null;
  }
  /* **Los ajustes de Leo** (1.1.67, Leo: «que Claude me deje cambiar los escenarios en las composiciones que hace»): el escenario (y la
     noche) que Leo eligió a mano para una escena en el teatro, por la firma de su evento de escena: `{ escenas: { [firma]: { bd, noche? } } }`.
     Mandan sobre la dirección de Claude y sobre la improvisación, y dirigir_obra no los borra. Una obra puede tener solo ajustes (sin
     dirección: plan vacío y `fecha` 0); `ajustes.fecha` dice cuándo los tocó. */
  function sanearAjustes(a) {
    if (!a || typeof a !== 'object' || !a.escenas || typeof a.escenas !== 'object') return null;
    const es = {};
    Object.entries(a.escenas).slice(0, 400).forEach(([k, v]) => {
      if (!v || typeof v !== 'object' || typeof k !== 'string' || !k || k.length > 600) return;
      const d = {};
      if (typeof v.bd === 'string' && v.bd.trim() && v.bd.length <= 40) d.bd = v.bd.trim();
      if (typeof v.noche === 'boolean') d.noche = v.noche;
      if (Object.keys(d).length) es[k] = d;
    });
    return Object.keys(es).length ? Object.assign({ escenas: es }, Number.isFinite(a.fecha) && a.fecha > 0 ? { fecha: a.fecha } : {}) : null;
  }
  /* cuándo se tocó una obra por última vez (la dirección o los ajustes de Leo), para quedarse con las más recientes */
  const fechaObra = o => Math.max((o && o.fecha) || 0, (o && o.ajustes && o.ajustes.fecha) || 0);
  function sanearObra(o) {
    if (!o || typeof o !== 'object') return null;
    const aj = sanearAjustes(o.ajustes);
    if ((!o.plan || typeof o.plan !== 'object') && !aj) return null;
    const plan = o.plan && typeof o.plan === 'object' ? o.plan : {};
    const ev = {}, per = {};
    Object.entries(plan.eventos || {}).slice(0, MAX_EVENTOS).forEach(([k, v]) => { const d = decision(v); if (d && k.length <= 600) ev[k] = d; });
    Object.entries(plan.personajes || {}).slice(0, 60).forEach(([k, v]) => {
      if (!v || typeof v !== 'object' || k.length > 40) return;
      const d = {};
      for (const c of ['vestuario', 'mascara', 'tamano']) if (typeof v[c] === 'string' && v[c].length <= 40) d[c] = v[c];
      if (v.voz === true) d.voz = true;
      per[k] = d;
    });
    const extras = (Array.isArray(plan.extras) ? plan.extras : []).filter(x => x && typeof x.clave === 'string' && typeof x.nombre === 'string').slice(0, 20)
      .map(x => ({ clave: x.clave.slice(0, 40), nombre: texto(x.nombre, 40) }));
    return Object.assign({ huella: String(o.huella || '').slice(0, 40), fecha: Number(o.fecha) || 0, titulo: texto(o.titulo, 80), plan: { eventos: ev, personajes: per, extras } }, aj ? { ajustes: aj } : {});
  }
  /* **El duende de un personaje** (1.1.64): cómo es en el teatro, que Claude hace a partir de su descripción (y pregunta lo que
     falte). Rasgos del duende (piel, ropa, sombrero, orejas, barba, ojos, pelo, accesorio), piezas de vestuario, un animal (su cara es
     una máscara), máscara, voz y tamaño. Se usa siempre que ese personaje sale en una obra. `extra.mascaras`: los ids de
     las máscaras de los mods (sin él, se acepta cualquier id: el teatro ignora el que no exista).
     **Versión 2** (1.1.67, Leo: «que aparte de duendes puedan elegirse otros cuerpos, como cuerpos humanos… una variedad más amplia de
     características»): el cuerpo (duende, humano o niño), complexión, altura, peinado, cejas, ojos, nariz, boca, vello, marcas, lentes,
     prenda, bajo, calzado, accesorios y sombreros nuevos, y `vestuario` (un disfraz de fábrica o de los mods como base). Estas listas son
     **la única verdad**: duendes.html las dibuja todas (`Duendes.catalogo()`, que test/teatro-mods.test.js compara con ellas). Todos los
     campos son opcionales: sin ellos, el duende de siempre. */
  const RASGOS = {
    beard: ['no', 'corta', 'larga'],
    acc: ['nada', 'farol', 'baston', 'flor', 'mochila'],
    cuerpo: ['duende', 'humano', 'nino'],
    complexion: ['delgada', 'media', 'robusta'],
    altura: ['baja', 'media', 'alta'],
    peinado: ['calvo', 'rapado', 'corto', 'raya', 'despeinado', 'rizado', 'afro', 'ondulado', 'largo', 'melena', 'coleta', 'chongo', 'trenzas', 'mohicano', 'flequillo', 'entradas'],
    cejas: ['normales', 'gruesas', 'finas', 'arqueadas', 'unicejas', 'ninguna'],
    ojos: ['redondos', 'grandes', 'almendra', 'rasgados', 'entrecerrados', 'cansados', 'brillantes'],
    nariz: ['boton', 'recta', 'grande', 'aguilena', 'chata', 'puntiaguda'],
    boca: ['normal', 'sonrisa', 'seria', 'labios', 'dientes', 'mueca'],
    vello: ['no', 'sombra', 'bigote', 'bigote-grande', 'candado', 'barba-corta', 'barba-larga', 'patillas'],
    marcas: ['pecas', 'lunar', 'cicatriz', 'rubor', 'arrugas', 'ojeras', 'maquillaje'],
    lentes: ['no', 'redondos', 'cuadrados', 'oscuros', 'monoculo'],
    prenda: ['camiseta', 'camisa', 'sueter', 'saco', 'chaqueta', 'sudadera', 'chaleco', 'overol', 'vestido', 'uniforme', 'tirantes'],
    bajo: ['pantalon', 'short', 'falda', 'falda-larga', 'jeans'],
    calzado: ['zapatos', 'botas', 'tenis', 'sandalias', 'tacones', 'descalzo'],
    accesorios: ['aretes', 'collar', 'corbata', 'bufanda', 'reloj', 'audifonos', 'mono-pelo', 'pulsera', 'cinturon'],
    sombreros: ['gorra', 'boina', 'copa', 'bandana', 'casco-obra', 'diadema']
  };
  /* los campos de una sola opción y los de varias (listas sin repetir) */
  const LISTAS_V2 = ['cuerpo', 'complexion', 'altura', 'peinado', 'cejas', 'ojos', 'nariz', 'boca', 'vello', 'lentes', 'prenda', 'bajo', 'calzado'];
  const MULTI_V2 = ['marcas', 'accesorios'];
  const COLORES_DUENDE = ['skin', 'cloth', 'cloth2', 'pants', 'shoes', 'hatCol', 'beardCol', 'eyeCol', 'hairCol', 'patCol', 'cape', 'capeIn', 'faceCol'];
  function validarDuende(x, extra) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return error('El duende tiene que ser un objeto');
    const d = {};
    for (const k of COLORES_DUENDE) {
      if (x[k] == null || x[k] === '') continue;
      if (!esColor(x[k])) return error('«' + k + '» tiene que ser un color (#rrggbb)');
      d[k] = x[k].trim();
    }
    for (const [k, lista] of [['hat', PIEZAS.hat], ['pat', PIEZAS.pat], ['face', PIEZAS.face], ['prop', PIEZAS.prop], ['cola', PIEZAS.cola], ['long', PIEZAS.long], ['beard', RASGOS.beard], ['acc', RASGOS.acc], ['voz', VOCES]]
      .concat(LISTAS_V2.map(k => [k, RASGOS[k]]))) {
      if (x[k] == null || x[k] === '') continue;
      if (!lista.includes(x[k])) return error('«' + k + '» vale: ' + lista.join(', '));
      d[k] = x[k];
    }
    for (const k of MULTI_V2) {
      if (x[k] == null || x[k] === '') continue;
      const l = Array.isArray(x[k]) ? x[k] : [x[k]];
      const malo = l.find(v => !RASGOS[k].includes(v));
      if (malo !== undefined) return error('«' + k + '» es una lista con: ' + RASGOS[k].join(', ') + ' («' + malo + '» no vale)');
      const u = [...new Set(l)];
      if (u.length) d[k] = u;
    }
    const mods = extra && extra.mascaras;
    for (const k of ['animal', 'mascara']) {
      if (x[k] == null || x[k] === '' || x[k] === 'ninguna') continue;
      const m = slug(x[k]);
      if (mods && !FABRICA.mascaras.includes(m) && !mods.includes(m)) return error('«' + k + '» es una máscara: de fábrica (' + FABRICA.mascaras.slice(1).join(', ') + ') o de los mods');
      d[k] = m;
    }
    /* un disfraz como base (de fábrica o de los mods), y encima los rasgos. `extra.vestuarios`: los ids de los mods (sin él, cualquiera) */
    if (x.vestuario != null && x.vestuario !== '' && x.vestuario !== 'ninguno') {
      const v = slug(x.vestuario), vm = extra && extra.vestuarios;
      if (vm && !FABRICA.vestuarios.includes(v) && !vm.includes(v)) return error('«vestuario» es un disfraz: de fábrica (' + FABRICA.vestuarios.slice(1).join(', ') + ') o de los mods');
      d.vestuario = v;
    }
    if (x.ear != null) { const e = num(x.ear, 0, 3); if (e == null) return error('«ear» es el tamaño de las orejas, de 0 a 3'); d.ear = Math.round(e); }
    for (const k of ['nose', 'blush', 'belt', 'bigEyes', 'curly', 'wings', 'noEars', 'noBeard', 'noBelt']) if (typeof x[k] === 'boolean') d[k] = x[k];
    if (x.escala != null) { const e = num(x.escala, .6, 1.8); if (e == null) return error('«escala» es un número de 0.6 a 1.8'); d.escala = e; }
    if (x.descripcion) d.descripcion = texto(x.descripcion, 400);
    if (typeof x.fuente === 'string' && x.fuente.length <= 60) d.fuente = x.fuente;
    if (Number.isFinite(x.fecha)) d.fecha = x.fecha;
    if (typeof x.nombre === 'string') d.nombre = texto(x.nombre, 40);
    return { ok: true, dato: d };
  }

  /* **Lo que se puede elegir en el creador de duendes** (1.1.67, Leo: «que exista la creación de duendes, como cuando seleccionas tu
     avatar… los elementos disponibles vienen de los elementos del motor y de sus mods»): las categorías en el orden del creador, cada
     una con su rasgo principal arriba (`campo`, `tipo`, `opciones`, `colores`) y todos los suyos en `rasgos`. Un rasgo es
     `{ id, n, campo, tipo: 'lista'|'color'|'multi'|'numero'|'bool', opciones: [{ id, n }], colores?, campoColor?, campoColor2?,
     min?, max?, paso?, solo?, opcional? }`: `campoColor` es el campo del color que va con la lista (el peinado y `hairCol`),
     `solo: 'duende'` lo que solo tiene un duende (las orejas) y una opción con id '' es «nada» (el campo no se guarda). */
  const NOMBRES = {
    cuerpo: { duende: 'Duende', humano: 'Humano', nino: 'Niño o niña' },
    complexion: { delgada: 'Delgada', media: 'Media', robusta: 'Robusta' },
    altura: { baja: 'Baja', media: 'Media', alta: 'Alta' },
    peinado: { calvo: 'Calvo', rapado: 'Rapado', corto: 'Corto', raya: 'Con raya', despeinado: 'Despeinado', rizado: 'Rizado', afro: 'Afro',
      ondulado: 'Ondulado', largo: 'Largo', melena: 'Melena', coleta: 'Coleta', chongo: 'Chongo', trenzas: 'Trenzas', mohicano: 'Mohicano',
      flequillo: 'Flequillo', entradas: 'Con entradas' },
    cejas: { normales: 'Normales', gruesas: 'Gruesas', finas: 'Finas', arqueadas: 'Arqueadas', unicejas: 'Uniceja', ninguna: 'Sin cejas' },
    ojos: { redondos: 'Redondos', grandes: 'Grandes', almendra: 'Almendrados', rasgados: 'Rasgados', entrecerrados: 'Entrecerrados', cansados: 'Cansados', brillantes: 'Brillantes' },
    nariz: { boton: 'De botón', recta: 'Recta', grande: 'Grande', aguilena: 'Aguileña', chata: 'Chata', puntiaguda: 'Puntiaguda' },
    boca: { normal: 'Normal', sonrisa: 'Sonriente', seria: 'Seria', labios: 'Labios marcados', dientes: 'Enseña los dientes', mueca: 'Mueca' },
    vello: { no: 'Sin vello', sombra: 'Sombra de barba', bigote: 'Bigote', 'bigote-grande': 'Bigotón', candado: 'Candado', 'barba-corta': 'Barba corta',
      'barba-larga': 'Barba larga', patillas: 'Patillas' },
    marcas: { pecas: 'Pecas', lunar: 'Lunar', cicatriz: 'Cicatriz', rubor: 'Rubor', arrugas: 'Arrugas', ojeras: 'Ojeras', maquillaje: 'Maquillaje' },
    lentes: { no: 'Sin lentes', redondos: 'Redondos', cuadrados: 'Cuadrados', oscuros: 'Oscuros', monoculo: 'Monóculo' },
    prenda: { camiseta: 'Camiseta', camisa: 'Camisa', sueter: 'Suéter', saco: 'Saco', chaqueta: 'Chaqueta', sudadera: 'Sudadera', chaleco: 'Chaleco',
      overol: 'Overol', vestido: 'Vestido', uniforme: 'Uniforme', tirantes: 'Con tirantes' },
    bajo: { pantalon: 'Pantalón', short: 'Short', falda: 'Falda', 'falda-larga': 'Falda larga', jeans: 'Jeans' },
    calzado: { zapatos: 'Zapatos', botas: 'Botas', tenis: 'Tenis', sandalias: 'Sandalias', tacones: 'Tacones', descalzo: 'Descalzo' },
    accesorios: { aretes: 'Aretes', collar: 'Collar', corbata: 'Corbata', bufanda: 'Bufanda', reloj: 'Reloj', audifonos: 'Audífonos', 'mono-pelo': 'Moño en el pelo',
      pulsera: 'Pulsera', cinturon: 'Cinturón' },
    hat: { punta: 'Puntiagudo', caido: 'Largo y caído', hongo: 'De hongo', gorro: 'Gorro de lana', pelo: 'Sin sombrero (su pelo)', flores: 'Corona de flores',
      corona: 'Corona', mago: 'De mago', casco: 'Casco de caballero', chef: 'De chef', astro: 'Casco de astronauta', vaquero: 'Vaquero', fedora: 'Fedora',
      tricornio: 'Tricornio', ninja: 'Capucha ninja', payaso: 'De payaso', tiara: 'Tiara', charro: 'De charro', antenas: 'Antenas', antena: 'Antena de robot',
      safari: 'De safari', birrete: 'Birrete', bombero: 'De bombero', floral: 'Tocado floral', nada: 'Sin sombrero', gorra: 'Gorra', boina: 'Boina',
      copa: 'Sombrero de copa', bandana: 'Bandana', 'casco-obra': 'Casco de obra', diadema: 'Diadema' },
    pat: { rayas: 'Rayas', estrellas: 'Estrellas', botones: 'Botones', puntos: 'Puntos', armadura: 'Armadura', chaleco: 'Chaleco', bolsillos: 'Bolsillos',
      estetoscopio: 'Estetoscopio', emblema: 'Emblema', 'moño': 'Moño', mariachi: 'De mariachi', luces: 'Luces', reflejante: 'Reflejante' },
    face: { parche: 'Parche', nariz: 'Nariz de payaso', antifaz: 'Antifaz', lentes: 'Lentes', colmillos: 'Colmillos' },
    prop: { espada: 'Espada', cetro: 'Cetro', varita: 'Varita', guitarra: 'Guitarra', cuchara: 'Cuchara', lupa: 'Lupa' },
    cola: { perro: 'De perro', gato: 'De gato', oso: 'De oso', conejo: 'De conejo', zorro: 'De zorro', tigre: 'De tigre', raton: 'De ratón' },
    long: { vestido: 'Vestido largo', largo: 'Bata o abrigo largo' },
    acc: { nada: 'Manos libres', farol: 'Un farol', baston: 'Un bastón', flor: 'Una flor', mochila: 'Una mochila' },
    voz: { normal: 'Normal', aguda: 'Aguda', dulce: 'Dulce', grave: 'Grave', ronca: 'Ronca', robot: 'Robot', burbuja: 'Burbujeante', chillona: 'Chillona',
      misteriosa: 'Misteriosa', graciosa: 'Graciosa' },
    ear: { 0: 'Sin orejas', 1: 'Pequeñitas', 2: 'Medianas', 3: '¡Enormes!' },
    vestuario: { ninguno: 'Su ropa de siempre', pirata: 'Pirata', rey: 'Rey o reina', princesa: 'Princesa o príncipe', mago: 'Mago', hada: 'Hada',
      caballero: 'Caballero', vaquero: 'Vaquero', mariachi: 'Mariachi', catrina: 'Catrina', luchador: 'Luchador', detective: 'Detective', doctor: 'Doctora o doctor',
      cientifico: 'Científico', chef: 'Chef', astronauta: 'Astronauta', bombero: 'Bombero', explorador: 'Explorador', ninja: 'Ninja', heroe: 'Superhéroe',
      vampiro: 'Vampiro', fantasma: 'Fantasma', robot: 'Robot', payaso: 'Payaso', abeja: 'Abeja', graduado: 'Graduado', perro: 'Perro', gato: 'Gato',
      gorila: 'Gorila o simio', oso: 'Oso', conejo: 'Conejo', zorro: 'Zorro', tigre: 'Tigre o jaguar', raton: 'Ratón' },
    mascara: { ninguna: 'Sin máscara', neutra: 'Neutra', comedia: 'Comedia', tragedia: 'Tragedia', veneciana: 'Veneciana', antifaz: 'Antifaz', lucha: 'Lucha libre',
      calavera: 'Calavera', diablito: 'Diablito', pajaro: 'Médico de la peste', tiki: 'Tiki', zorro: 'Zorro', gato: 'Gato', conejo: 'Conejo', oso: 'Oso',
      jaguar: 'Jaguar', perro: 'Perro', gorila: 'Gorila', raton: 'Ratón' },
    musica: { ninguna: 'Sin música', alegre: 'Alegre', comedia: 'Comedia', romantica: 'Romántica', triste: 'Triste', noche: 'Nocturna', misterio: 'Misterio',
      suspenso: 'Suspenso', terror: 'Terror', accion: 'Acción', epica: 'Épica' },
    escenario: { oficina: 'Oficina', sala: 'Sala de casa', cocina: 'Cocina', salon: 'Salón de clases', playa: 'Playa al atardecer', mar: 'Fondo del mar',
      pradera: 'Pradera', bosque: 'Bosque encantado', selva: 'Selva', montanas: 'Montañas nevadas', desierto: 'Desierto', ciudad: 'Ciudad de noche',
      pueblo: 'Pueblo con papel picado', castillo: 'Castillo', cueva: 'Cueva de cristales', invierno: 'Pueblo nevado', espacio: 'Espacio exterior', vacio: 'Telón negro' }
  };
  /* las máscaras de fábrica que son la cara de un animal (el `animal` de un duende; `pajaro` no: es la del médico de la peste, que
     va en Máscara) */
  const ANIMALES = ['perro', 'gato', 'gorila', 'oso', 'conejo', 'zorro', 'jaguar', 'raton'];
  /* paletas del creador: tonos de piel humanos variados y los de duende; pelo, ojos, vello y ropa */
  const PALETAS = {
    piel: ['#fbe3d0', '#f3cfb3', '#e8b48e', '#d69c72', '#c08159', '#a0663f', '#7d4a2b', '#5b3420', '#3f2416',
      '#7bc043', '#5fa84a', '#a3d977', '#6fb3a8', '#79a3d9', '#9b8fd1', '#8d6e4a', '#c89b6d', '#e0a37a', '#f0c9a0'],
    pelo: ['#1b1420', '#3b2a1e', '#5a3a22', '#8a5a34', '#b8472a', '#d9823b', '#f2d36b', '#e8e0d0', '#9a9aa8', '#b04a8a', '#3d7ec8', '#2f8f6b'],
    ojos: ['#1b1420', '#5a3a22', '#6b4a2e', '#1b3a6b', '#3a8a9a', '#2f5a1b', '#6b1b3a', '#8a8f99'],
    vello: ['#1b1420', '#3b2a1e', '#6b4a2e', '#d9823b', '#f2d36b', '#b9b4ab', '#f4f1ea'],
    ropa: ['#c8553d', '#e8a33d', '#3d7ec8', '#7a4fb0', '#2f8f6b', '#d65a9e', '#5a5aa8', '#b8862b', '#39a0a0', '#9a3b3b', '#f4f1ea', '#1b1420', '#6a7384', '#e8d8b8'],
    bajo: ['#4a3b2a', '#2e3a4f', '#3f5a2e', '#5a2e3f', '#6b5a44', '#3d5a8a', '#1b1420', '#b8a070', '#6a7384', '#f4f1ea'],
    calzado: ['#3b2a1e', '#5a3a22', '#2a2a2a', '#7a2e2e', '#2e4a3a', '#f4f1ea', '#c8553d', '#3d7ec8'],
    capa: ['#c8553d', '#d65a9e', '#e8a33d', '#7a4fb0', '#b8862b', '#b0243a', '#1b1420', '#f4f1ea', '#f2c94c']
  };
  function catalogoDuende(mods) {
    const s = sanear(mods || {});
    const ops = (campo, ids, vacio) => (vacio ? [{ id: '', n: vacio }] : []).concat(ids.map(id => ({ id, n: (NOMBRES[campo] && NOMBRES[campo][id]) || id })));
    const deMods = (k, lista) => (s[k] || []).map(x => ({ id: x.id, n: x.nombre + ' (mod)' })).filter(x => !lista.some(y => y.id === x.id));
    const lista = (campo, n, opciones, mas) => Object.assign({ id: campo, n, campo, tipo: 'lista', opciones }, mas || {});
    const color = (campo, n, colores, mas) => Object.assign({ id: campo, n, campo, tipo: 'color', opciones: [], colores }, mas || {});
    const vest = ops('vestuario', FABRICA.vestuarios), masc = ops('mascara', FABRICA.mascaras);
    const anim = ops('mascara', ANIMALES, 'Ninguno');
    const grupos = [
      ['cuerpo', 'Cuerpo', [
        lista('cuerpo', 'Cuerpo', ops('cuerpo', RASGOS.cuerpo)),
        lista('complexion', 'Complexión', ops('complexion', RASGOS.complexion)),
        lista('altura', 'Altura', ops('altura', RASGOS.altura)),
        { id: 'escala', n: 'Tamaño en escena', campo: 'escala', tipo: 'numero', opciones: [], min: .6, max: 1.8, paso: .1 }]],
      ['piel', 'Piel', [color('skin', 'Piel', PALETAS.piel)]],
      ['cabeza', 'Cabeza', [
        lista('peinado', 'Peinado', ops('peinado', RASGOS.peinado), { colores: PALETAS.pelo, campoColor: 'hairCol' }),
        lista('cejas', 'Cejas', ops('cejas', RASGOS.cejas)),
        { id: 'ear', n: 'Orejas', campo: 'ear', tipo: 'numero', opciones: [0, 1, 2, 3].map(i => ({ id: i, n: NOMBRES.ear[i] })), min: 0, max: 3, paso: 1, solo: 'duende' }]],
      ['cara', 'Cara', [
        lista('ojos', 'Ojos', ops('ojos', RASGOS.ojos), { colores: PALETAS.ojos, campoColor: 'eyeCol' }),
        lista('nariz', 'Nariz', ops('nariz', RASGOS.nariz)),
        lista('boca', 'Boca', ops('boca', RASGOS.boca)),
        lista('vello', 'Barba y bigote', ops('vello', RASGOS.vello), { colores: PALETAS.vello, campoColor: 'beardCol' }),
        { id: 'marcas', n: 'Marcas', campo: 'marcas', tipo: 'multi', opciones: ops('marcas', RASGOS.marcas) },
        lista('lentes', 'Lentes', ops('lentes', RASGOS.lentes)),
        lista('face', 'Detalle de la cara', ops('face', PIEZAS.face, 'Ninguno'), { colores: PALETAS.ropa, campoColor: 'faceCol' })]],
      ['ropa', 'Ropa', [
        lista('prenda', 'Prenda', ops('prenda', RASGOS.prenda), { colores: PALETAS.ropa, campoColor: 'cloth', campoColor2: 'cloth2' }),
        lista('bajo', 'Abajo', ops('bajo', RASGOS.bajo), { colores: PALETAS.bajo, campoColor: 'pants' }),
        lista('calzado', 'Calzado', ops('calzado', RASGOS.calzado), { colores: PALETAS.calzado, campoColor: 'shoes' }),
        lista('pat', 'Estampado', ops('pat', PIEZAS.pat, 'Liso'), { colores: PALETAS.ropa, campoColor: 'patCol' }),
        lista('long', 'Largo', ops('long', PIEZAS.long, 'Normal')),
        color('cape', 'Capa', PALETAS.capa, { opcional: true, campoColor2: 'capeIn' }),
        color('capeIn', 'Forro de la capa', PALETAS.capa, { opcional: true })]],
      ['sombrero', 'Sombrero', [lista('hat', 'Sombrero', ops('hat', PIEZAS.hat), { colores: PALETAS.ropa, campoColor: 'hatCol' })]],
      ['accesorios', 'Accesorios', [
        { id: 'accesorios', n: 'Accesorios', campo: 'accesorios', tipo: 'multi', opciones: ops('accesorios', RASGOS.accesorios) },
        lista('acc', 'En la mano', ops('acc', RASGOS.acc)),
        lista('prop', 'Utilería', ops('prop', PIEZAS.prop, 'Nada')),
        { id: 'wings', n: 'Alas', campo: 'wings', tipo: 'bool', opciones: [] }]],
      ['disfraz', 'Disfraz', [lista('vestuario', 'Disfraz', vest.concat(deMods('vestuarios', vest)))]],
      ['animal', 'Animal', [
        lista('animal', 'Animal', anim.concat(deMods('mascaras', anim))),
        lista('cola', 'Cola', ops('cola', PIEZAS.cola, 'Sin cola'))]],
      ['mascara', 'Máscara', [lista('mascara', 'Máscara', masc.concat(deMods('mascaras', masc)))]],
      ['voz', 'Voz', [lista('voz', 'Voz', ops('voz', VOCES))]]
    ];
    const categorias = grupos.map(([id, n, rasgos]) => Object.assign({}, rasgos[0], { id, n, rasgos }));
    return { categorias, paletas: PALETAS };
  }
  function sanear(t) {
    const out = {};
    if (!t || typeof t !== 'object') return out;
    if (t.duendes && typeof t.duendes === 'object') {
      const du = {};
      Object.entries(t.duendes).slice(0, 200).forEach(([k, v]) => { const r = validarDuende(v); if (r.ok && k.length <= 60) du[k] = r.dato; });
      if (Object.keys(du).length) out.duendes = du;
    }
    if (t.obras && typeof t.obras === 'object') {
      const ob = {};
      Object.entries(t.obras).sort((a, b) => fechaObra(b[1]) - fechaObra(a[1])).slice(0, MAX_OBRAS)
        .forEach(([k, v]) => { const o = sanearObra(v); if (o && k.length <= 60) ob[k] = o; });
      if (Object.keys(ob).length) out.obras = ob;
    }
    const mascaras = Array.isArray(t.mascaras) ? t.mascaras.map(m => slug(m && (m.id || m.nombre))) : [];
    for (const [tipo, clave] of Object.entries(TIPOS)) {
      const vistos = new Set(), l = [];
      for (const x of Array.isArray(t[clave]) ? t[clave] : []) {
        const r = validar(tipo, x, { mascaras });
        if (r.ok && !vistos.has(r.dato.id) && l.length < MAX_POR_TIPO) { vistos.add(r.dato.id); l.push(r.dato); }
      }
      if (l.length) out[clave] = l;
    }
    return out;
  }
  const vacio = t => !t || (!Object.keys(TIPOS).some(k => Array.isArray(t[TIPOS[k]]) && t[TIPOS[k]].length) && !(t.obras && Object.keys(t.obras).length) && !(t.duendes && Object.keys(t.duendes).length));
  /* **Los mods son de todos los proyectos** (1.1.64, Leo: «la utilería generada se comparte en todos los proyectos con el fin de poder
     reutilizarlos»): viven en los datos de la app (claude/teatro-global.js), y en el proyecto solo quedan sus obras y los duendes de sus
     personajes. `soloMods` y `soloProyecto` parten un teatro en esas dos cosas; `mezclar` junta los mods (los de todos mandan; uno que
     solo tenga el proyecto —de la 1.1.63— se añade). */
  const soloMods = t => { const s = sanear(t), o = {}; for (const k of Object.values(TIPOS)) if (s[k]) o[k] = s[k]; return o; };
  const soloProyecto = t => { const s = sanear(t), o = {}; if (s.obras) o.obras = s.obras; if (s.duendes) o.duendes = s.duendes; return o; };
  function mezclar(global, proyecto) {
    const g = soloMods(global), p = soloMods(proyecto), o = {};
    for (const k of Object.values(TIPOS)) {
      const l = (g[k] || []).slice(), ids = new Set(l.map(x => x.id));
      for (const x of p[k] || []) if (!ids.has(x.id)) l.push(x);
      if (l.length) o[k] = l;
    }
    return o;
  }
  const tieneMods = t => Object.values(TIPOS).some(k => t && Array.isArray(t[k]) && t[k].length);
  /* aplica una lista de operaciones sobre una copia: `poner` (crea o sustituye por id) y `quitar` */
  /* todo lo que el teatro puede usar, de fábrica y de los mods: [{ id, n }] por tipo */
  function catalogo(t) {
    const s = sanear(t), deMods = k => (s[k] || []).map(x => ({ id: x.id, n: x.nombre + ' (mod)' + (k === 'objetos' ? ', ' + x.ancho + ' de ancho' : '') }));
    const nom = { escenarios: NOMBRES.escenario, vestuarios: NOMBRES.vestuario, mascaras: NOMBRES.mascara, musicas: NOMBRES.musica };
    const fab = k => FABRICA[k].map(id => ({ id, n: (nom[k] && nom[k][id]) || id }));
    return {
      escenarios: fab('escenarios').concat(deMods('escenarios')), vestuarios: fab('vestuarios').concat(deMods('vestuarios')),
      mascaras: fab('mascaras').concat(deMods('mascaras')), musicas: fab('musicas').concat(deMods('musicas')),
      objetos: deMods('objetos'), gestos: GESTOS.map(([id, n]) => ({ id, n })).concat(deMods('gestos'))
    };
  }
  function editar(t, operaciones) {
    if (!Array.isArray(operaciones) || !operaciones.length) return error('Faltan las operaciones');
    const nuevo = JSON.parse(JSON.stringify(sanear(t))), hechos = [];
    for (let i = 0; i < operaciones.length; i++) {
      const o = operaciones[i] || {}, tipo = String(o.tipo || '').toLowerCase(), clave = TIPOS[tipo];
      const op = String(o.op || o.operacion || '').toLowerCase();
      if (!clave) return error('Operación ' + (i + 1) + ': «tipo» vale ' + Object.keys(TIPOS).join(', '));
      if (op === 'quitar' || op === 'borrar') {
        const id = slug(o.id), l = nuevo[clave] || [], j = l.findIndex(x => x.id === id);
        if (j < 0) return error('Operación ' + (i + 1) + ': no hay ningún ' + tipo + ' «' + id + '» en los mods');
        l.splice(j, 1); if (!l.length) delete nuevo[clave];
        hechos.push('Quitado el ' + tipo + ' «' + id + '»'); continue;
      }
      if (op !== 'poner' && op !== 'crear' && op !== 'cambiar') return error('Operación ' + (i + 1) + ': «op» vale poner o quitar');
      const r = validar(tipo, o.datos || o.dato || o, { mascaras: (nuevo.mascaras || []).map(m => m.id) });
      if (!r.ok) return error('Operación ' + (i + 1) + ' (' + tipo + '): ' + r.error);
      const l = nuevo[clave] = nuevo[clave] || [], j = l.findIndex(x => x.id === r.dato.id);
      if (j < 0 && l.length >= MAX_POR_TIPO) return error('Ya hay ' + MAX_POR_TIPO + ' mods de ' + tipo + ': quita alguno');
      if (j < 0) l.push(r.dato); else l[j] = r.dato;
      hechos.push((j < 0 ? 'Nuevo ' : 'Cambiado el ') + tipo + ' «' + r.dato.nombre + '» (' + r.dato.id + ')');
    }
    if (JSON.stringify(nuevo).length > MAX_BYTES) return error('Los mods del teatro pasarían de ' + Math.round(MAX_BYTES / 1000) + ' KB: simplifica los dibujos');
    return { ok: true, teatro: nuevo, hechos };
  }
  /* en palabras, para leer_teatro */
  function resumen(t) {
    const s = sanear(t), L = [];
    L.push('DE FÁBRICA (no se pueden sustituir; un mod usa otro id):');
    for (const k of ['escenarios', 'vestuarios', 'mascaras', 'musicas']) L.push('- ' + k + ': ' + FABRICA[k].join(', '));
    L.push('- piezas de vestuario: ' + Object.entries(PIEZAS).filter(([k]) => k !== 'onda').map(([k, v]) => k + ' (' + v.join(', ') + ')').join('; '));
    L.push('- voces: ' + VOCES.join(', '));
    L.push('', 'MODS (de todos los proyectos):');
    let n = 0;
    for (const [tipo, clave] of Object.entries(TIPOS)) for (const x of s[clave] || []) {
      n++;
      const det = tipo === 'escenario' ? x.capas.length + ' capas' + (x.noche ? ', de noche' : '')
        : tipo === 'objeto' ? x.filas[0].length + '×' + x.filas.length + ' px, ' + x.ancho + ' de ancho en escena'
        : tipo === 'mascara' ? x.filas[0].length + '×' + x.filas.length + ' px'
        : tipo === 'gesto' ? x.cuadros.length + ' cuadros' + (x.mueve ? ', ' + x.mueve : '') + (x.particula ? ', ' + x.particula.tipo : '')
        : tipo === 'musica' ? x.bpm + ' bpm, ' + x.onda
        : ['hat', 'pat', 'face', 'prop', 'animal', 'cola'].filter(k => x[k]).map(k => k + ' ' + x[k]).join(', ');
      L.push('- ' + tipo + ' «' + x.nombre + '» (' + x.id + ')' + (det ? ' · ' + det : '') + (x.parecidos ? ' · se parece a: ' + x.parecidos.join(', ') : ''));
    }
    if (!n) L.push('(ninguno todavía)');
    const ob = Object.values(s.obras || {}).filter(o => o.fecha || Object.keys(o.plan.eventos).length);   // (las que solo tienen ajustes de Leo, no)
    if (ob.length) L.push('', 'OBRAS DIRIGIDAS: ' + ob.map(o => '«' + o.titulo + '»').join(', '));
    return L.join('\n');
  }

  /* los rasgos del duende de un personaje, en palabras (leer_teatro y duende_personaje › ver) */
  function resumenRasgos(mods) {
    return catalogoDuende(mods).categorias.map(c => '- ' + c.n + ': ' + c.rasgos.map(r => {
      const igual = x => slug(x.n) === String(x.id);           // «calvo (Calvo)» sobra: solo se dice el nombre si dice algo más
      const o = r.opciones.filter(x => x.id !== '').map(x => (igual(x) ? x.id : x.id + ' (' + x.n + ')'));
      return r.campo + (r.tipo === 'color' ? ' = color #rrggbb' : r.tipo === 'numero' ? ' = ' + r.min + '–' + r.max : r.tipo === 'bool' ? ' = true/false'
        : (r.tipo === 'multi' ? ' = lista de: ' : ' = ') + o.join(', ')) + (r.campoColor ? ' [color: ' + r.campoColor + (r.campoColor2 ? ', ' + r.campoColor2 : '') + ']' : '')
        + (r.solo ? ' (solo ' + r.solo + ')' : '');
    }).join('; ')).join('\n');
  }

  C.teatroMods = { FABRICA, PIEZAS, TIPOS, GESTOS, VOCES, POSE, RASGOS, NOMBRES, PALETAS, ANIMALES, validar, validarDuende, catalogoDuende, resumenRasgos, sanearAjustes,
    sanear, sanearObra, editar, resumen, catalogo, vacio, slug,
    soloMods, soloProyecto, mezclar, tieneMods };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
