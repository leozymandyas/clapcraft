/* Claquedraw · los duendes del asistente, desde Claude (1.1.70)
   Leo, 29-09-2026: «Haz que los duendes de ClapCraft puedan conectarse con Claude Cowork para su creación, la idea es poderles dar una
   personalidad más avanzada con Claude». Y enseguida: «Y que no necesariamente haga algo con el texto, igual puede ser un consultor que
   lea y dé su opinión. Por ejemplo un duende que sepa de comedia debería poder revisar el guion si el usuario lo pide y dar sus
   opiniones de ciertas partes» (el papel `consultar` de js/claquedraw/equipo.js).
   Dos herramientas de MCP que no son de ningún proyecto (el equipo vive en los datos de la app, electron/equipo.js):
   · `ver_duendes_asistente` (solo lee): el equipo, la ficha entera de uno (su personalidad, su papel, su modelo, su voz y su aspecto)
     y la guía para escribirle una personalidad (cómo la usa cada papel, los modelos con su precio, las voces y los rasgos del aspecto).
   · `editar_duendes_asistente`: un lote de operaciones (crear, cambiar, eliminar, mover y el modo del equipo) que se hace **entero o
     nada**, con las reglas de C.equipo (los fijos sin personalidad ni eliminar; 40 especiales; 4000 caracteres de personalidad) y el
     aspecto validado con los mods del teatro.
   Aquí no hay archivos ni red: `ver(eq, args, op)` y `editar(eq, args, op)` reciben el equipo y devuelven el nuevo. Quien escribe es
   claude/servidor.js (con la app cerrada, al archivo) o electron/equipo.js (con la app en marcha: avisa a las ventanas y la de delante
   enseña «Deshacer»). */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const pedir = f => { if (typeof require !== 'function') return null; try { return require(f); } catch (_) { return null; } };
  const E = () => C.equipo || ((pedir('./equipo.js') || {}).equipo) || null;
  const Tm = () => C.teatroMods || ((pedir('./teatro-mods.js') || {}).teatroMods) || null;
  const modelosConocidos = () => {
    const M = C.asistenteMotor || ((pedir('./asistente-motor.js') || {}).asistenteMotor);
    return M && Array.isArray(M.MODELOS) ? M.MODELOS : [];
  };

  const plano = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const sinArticulo = s => plano(s).replace(/^(el|la|los|las)\s+(duende\s+)?/, '');
  const comillas = s => '«' + s + '»';
  const num = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const copia = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
  class Fallo extends Error {}
  const falla = m => { throw new Fallo(m); };

  const PAPEL_TXT = { maestro: 'maestro', lector: 'lector', escritor: 'escritora', coordinador: 'coordinador', especial: 'especial' };
  const ROL_TXT = { revisar: 'revisa', transformar: 'transforma el texto', consultar: 'solo opina (consultor)', anotar: 'toma notas y edita documentos (secretaria)' };
  const rolTexto = d => (d.rol === 'revisar' && d.veto ? 'revisa y puede vetar' : ROL_TXT[d.rol] || '');

  /* un duende por su id o su nombre (sin mayúsculas, acentos ni «el»/«la» delante) */
  function buscar(eq, ref) {
    const l = (eq && eq.duendes) || [];
    if (ref && typeof ref === 'object') ref = ref.id || ref.nombre;
    const s = String(ref == null ? '' : ref).trim();
    if (!s) falla('Di qué duende (su id o su nombre)');
    const exacto = l.find(d => d.id === s.toLowerCase());
    if (exacto) return exacto;
    const p = plano(s), sa = sinArticulo(s);
    const por = l.filter(d => plano(d.nombre) === p);
    if (por.length === 1) return por[0];
    const parecidos = l.filter(d => sinArticulo(d.nombre) === sa || (sa.length >= 4 && sinArticulo(d.nombre).includes(sa)));
    if (parecidos.length === 1) return parecidos[0];
    if (parecidos.length > 1) falla('Hay varios duendes que se llaman así: ' + parecidos.map(d => comillas(d.nombre) + ' (' + d.id + ')').join(', ') + '. Di cuál por su id');
    falla('No hay ningún duende ' + comillas(s) + '. Los que hay: ' + l.map(d => comillas(d.nombre) + ' (' + d.id + ')').join(', '));
  }

  /* ====================================================================
     La guía (lo que Claude necesita saber para escribir una personalidad que funcione)
     ==================================================================== */
  function guia(op) {
    const e = E(), T = Tm(), max = (e && e.MAX_PERSONALIDAD) || 4000;
    const modelos = (op && op.modelos) || modelosConocidos();
    const L = ['CÓMO TRABAJA UN DUENDE ESPECIAL (lo que hace ClapCraft con su ficha):',
      '- Leo lo elige en el panel del asistente (Claude › Asistente con otra IA…, que usa DeepSeek por APIMart, no a ti). Su ficha se CONGELA al elegirlo: cambiarla después no cambia una conversación empezada.',
      '- Modo «Equipo»: el duende maestro encarga los textos largos a una cadena fija (lector → escritora → coordinador, que veta lo inventado) y luego a los especiales elegidos, en orden. Según su papel:',
      '  · revisar: lee el texto y da su veredicto (ClapCraft le pide el JSON; tú no lo pongas en la personalidad). Con veto, lo que rechaza vuelve a la escritora; sin veto, sus notas van al informe.',
      '  · transformar: reescribe el texto ENTERO con su estilo, sin alargarlo más de un 25 % ni añadir hechos (en modo fiel el coordinador lo comprueba y, si mete algo, se descarta su versión).',
      '  · consultar: el consultor. No toca el texto ni lo detiene: al final da su OPINIÓN (qué funciona, qué no, citando los trozos, con propuestas), que va al informe y la dice en voz alta la mascota.',
      '- Modo «Mesa»: Leo habla con varios duendes a la vez (o con uno solo, como una entrevista); cada uno contesta en su burbuja, breve, con su personalidad, y puede LEER el proyecto (esquemas, guiones, notas). Así se le pide a un consultor «revisa el guion de X y dime qué opinas de la escena 3». Si discuten muy fuerte, se pelean (es una animación).',
      '  · anotar: la secretaria. No conversa: al final de cada vuelta de la Mesa apunta en el ACTA de la conversación (una nota de una biblioteca, que crea la primera vez) los acuerdos, ideas, desacuerdos y pendientes; y si Leo le habla con «@» (o es la única en la mesa), EDITA los documentos que le pida (añadir, insertar, sustituir en guiones y notas, crear notas; lo que borra o reemplaza, con permiso de Leo). Su personalidad dice cómo redacta las notas (secciones, tono, largo) y cómo trabaja. No trabaja en la cadena del Equipo ni en el lienzo. De fábrica hay una, «La secretaria» (id secretaria).',
      '- En el lienzo, una operación puede llevar duendes: su salida sale con su criterio.',
      '',
      'CÓMO ESCRIBIR UNA PERSONALIDAD QUE FUNCIONE (' + max + ' caracteres como mucho, en español; la lee un modelo barato, así que concreta):',
      '1. Quién es, en una o dos frases, en primera persona («Soy…») o en segunda («Eres…»): su oficio y su trayectoria (puede ser inventada, pero que no se haga pasar por una persona real).',
      '2. Qué sabe y qué le obsesiona: los criterios CONCRETOS con que mira un texto (en comedia: el remate al final de la frase, la regla de tres, el personaje que no sabe que es gracioso, el ritmo pregunta-respuesta…), mejor como lista corta de cosas que busca.',
      '3. Cómo habla: tono, largo, muletillas, lo que dice cuando algo le gusta y cuando no. Dos o tres ejemplos de comentarios suyos ayudan mucho más que los adjetivos.',
      '4. Lo que NO hace: sus límites (un consultor no reescribe escenas enteras; nadie inventa hechos del proyecto; no se sale de su tema).',
      '5. Sin instrucciones de formato de salida (JSON, listas obligatorias): eso lo pone ClapCraft según el papel. Sin «ignora…» ni órdenes para otros duendes.',
      'Pregúntale a Leo lo que no sepas (su gusto, sus referentes, lo que le molesta de sus textos) antes de inventarlo. Si te da un documento con la descripción, léelo (leer_documento o ver_enlace).',
      '',
      'LA FICHA:',
      '- papel (rol): revisar (veto: true|false) · transformar · consultar · anotar (la secretaria de la Mesa).',
      '- modelo: el de partida de un especial es deepseek-v4-pro (trabaja con los resultados de los demás). Con APIMart, el proveedor de Leo, solo valen los deepseek-*. Precios en USD por millón (entrada / salida): '
        + (modelos.length ? modelos.map(m => m.id + ' ' + num(m.entrada) + ' / ' + num(m.salida)).join(' · ') : 'deepseek-v4-flash (barato) y deepseek-v4-pro (más capaz)') + '.',
      '- temperatura: de 0 a 2 (null = la de su papel, 0,3). Revisar y transformar, 0,2–0,5; un consultor creativo, 0,6–0,9.',
      '- voz (cómo «habla» en la mascota y en el taller): ' + ((T && T.VOCES) || []).join(', ') + '.',
      '- enojon: si se enoja a menudo al trabajar (es una animación, como el coordinador).',
      '- aspecto: su duende, como en el creador de duendes (por defecto cuerpo "duende"; también "humano" o "nino"). null = el de su papel. Rasgos (ids tal cual, colores #rrggbb):'];
    if (T && typeof T.resumenRasgos === 'function') L.push(T.resumenRasgos((op && op.mods) || {}));
    L.push('', 'CONSULTAR A UN DUENDE DESDE AQUÍ (Cowork o Claude Code): si Leo te pide la opinión de uno («¿qué diría el duende de comedia de esta escena?»), lee su ficha con ver_duendes_asistente { duende } y el texto (leer_documento, ver_enlace), y contesta tú COMO ese duende —su criterio, su voz, su largo—, dejando claro que es su opinión. No escribas nada en el proyecto salvo que Leo lo pida.');
    return L.join('\n');
  }

  /* ====================================================================
     ver
     ==================================================================== */
  function ficha(d, entero) {
    const e = E(), P = e && e.PAPELES && e.PAPELES[d.papel];
    const modelo = d.modelo || (d.papel === 'maestro' ? 'el de Configurar IA' : (P && P.modelo) || '?');
    const temp = d.temperatura == null ? (d.papel === 'maestro' ? 'la de Configurar IA' : 'la de su papel') : num(d.temperatura);
    const cab = '- ' + comillas(d.nombre) + ' (id ' + d.id + ')' + (d.fijo ? ' · FIJO (' + PAPEL_TXT[d.papel] + ')' : ' · ' + rolTexto(d))
      + ' · ' + modelo + ' · temperatura ' + temp + ' · voz ' + (d.voz || (e && e.vozDe ? e.vozDe(d) + ' (la de su duende)' : 'la de su duende')) + (d.enojon ? ' · se enoja a menudo' : '');
    if (!entero) {
      if (d.fijo) return cab;
      const p = String(d.personalidad || '').replace(/\s+/g, ' ').trim();
      return cab + '\n    ' + (p ? (p.length > 180 ? p.slice(0, 179) + '…' : p) + ' (' + String(d.personalidad).length + ' caracteres)' : '(sin personalidad escrita)');
    }
    const L = [cab];
    if (d.fijo) L.push('  Qué hace (fijo, sin personalidad propia): ' + ((P && P.que) || ''));
    else L.push('  PERSONALIDAD (' + String(d.personalidad || '').length + ' de ' + ((e && e.MAX_PERSONALIDAD) || 4000) + ' caracteres):', d.personalidad ? d.personalidad.split('\n').map(x => '    ' + x).join('\n') : '    (vacía)');
    L.push('  ASPECTO' + (d.duende ? '' : ' (el de su papel; aún no tiene uno propio)') + ': ' + JSON.stringify(d.duende || (e && e.aspectoDe ? e.aspectoDe(d) : {})));
    return L.join('\n');
  }
  function ver(eq0, args, op) {
    try {
      const e = E(); if (!e) falla('Esta versión de ClapCraft no trae los duendes del asistente');
      const eq = e.normalizar(eq0), a = args || {};
      const L = ['LOS DUENDES DEL ASISTENTE DE CLAPCRAFT (de todos los proyectos de Leo; viven en esta máquina, no en un proyecto).'];
      if (a.duende) {
        const d = buscar(eq, a.duende);
        L.push('', ficha(d, true));
      } else {
        const fijos = eq.duendes.filter(d => d.fijo), esp = eq.duendes.filter(d => !d.fijo);
        L.push('Modo del equipo: ' + eq.modo + ' · rondas: ' + eq.rondas + '.', '', 'EL EQUIPO FIJO (no se eliminan ni tienen personalidad; solo cambian nombre, modelo, temperatura, voz y aspecto):');
        fijos.forEach(d => L.push(ficha(d, false)));
        L.push('', 'ESPECIALES (' + esp.length + ' de ' + (e.MAX_ESPECIALES || 40) + '; la personalidad entera, con ver_duendes_asistente { duende }):');
        if (esp.length) esp.forEach(d => L.push(ficha(d, false))); else L.push('(ninguno)');
      }
      if (a.guia !== false) L.push('', guia(op));
      return { ok: true, texto: L.join('\n'), datos: { equipo: eq } };
    } catch (err) { if (err instanceof Fallo) return { ok: false, error: err.message }; throw err; }
  }

  /* ====================================================================
     editar: un lote, entero o nada
     ==================================================================== */
  const CAMPOS = ['nombre', 'personalidad', 'rol', 'veto', 'modelo', 'temperatura', 'voz', 'enojon'];
  /* los campos de una operación, revisados → cambios para C.equipo */
  function camposDe(o, eq, op, actual) {
    const e = E(), T = Tm(), c = {}, avisos = [];
    const max = e.MAX_PERSONALIDAD || 4000;
    if (o.nombre !== undefined) {
      const n = String(o.nombre || '').replace(/\s+/g, ' ').trim();
      if (!n) falla('El duende necesita un nombre');
      if (n.length > 60) falla('El nombre ' + comillas(n) + ' es largo: 60 caracteres como mucho');
      const otro = eq.duendes.find(d => plano(d.nombre) === plano(n) && (!actual || d.id !== actual.id));
      if (otro) falla('Ya hay un duende que se llama ' + comillas(otro.nombre) + ' (' + otro.id + '): elige otro nombre');
      c.nombre = n;
    }
    if (o.personalidad !== undefined) {
      if (o.personalidad !== null && typeof o.personalidad !== 'string') falla('La personalidad es un texto');
      const p = String(o.personalidad || '').replace(/\r\n?/g, '\n').trim();
      if (p.length > max) falla('La personalidad de ' + comillas(c.nombre || (actual && actual.nombre) || 'ese duende') + ' tiene ' + p.length + ' caracteres y caben ' + max + ': acórtala (lo concreto rinde más que lo largo)');
      c.personalidad = p;
    }
    let rol = o.rol !== undefined ? String(o.rol || '').toLowerCase().trim() : undefined;
    if (rol === 'vetar' || rol === 'veta') { rol = 'revisar'; if (o.veto === undefined) c.veto = true; }
    if (rol === 'consultor' || rol === 'opinar' || rol === 'opina') rol = 'consultar';
    if (rol === 'secretaria' || rol === 'secretario' || rol === 'notas' || rol === 'anota' || rol === 'tomar_notas') rol = 'anotar';
    if (rol !== undefined) {
      if (!(e.ROLES || []).includes(rol)) falla('rol: revisar, transformar, consultar o anotar');
      c.rol = rol;
      if (rol !== 'revisar') c.veto = false;
    }
    if (o.veto !== undefined) {
      if (typeof o.veto !== 'boolean') falla('veto es true o false');
      const r = c.rol || (actual && actual.rol) || 'revisar';
      if (o.veto && r !== 'revisar') falla('Solo puede vetar un duende que revisa (rol "revisar")');
      c.veto = o.veto;
    }
    if (o.modelo !== undefined) {
      if (o.modelo === null || o.modelo === '') c.modelo = null;
      else {
        const m = String(o.modelo).trim();
        if (!/^[\w.:/@+-]{1,100}$/.test(m)) falla('El modelo ' + comillas(m) + ' no es un nombre de modelo');
        const conocidos = ((op && op.modelos) || modelosConocidos()).map(x => x.id);
        if (conocidos.length && !conocidos.includes(m)) avisos.push('Ojo: ' + comillas(m) + ' no es de los modelos que conoce ClapCraft (con APIMart solo valen los deepseek-*): si Leo usa APIMart, no funcionará.');
        c.modelo = m;
      }
    }
    if (o.temperatura !== undefined) {
      if (o.temperatura === null || o.temperatura === '') c.temperatura = null;
      else {
        const t = Number(o.temperatura);
        if (!Number.isFinite(t) || t < 0 || t > 2) falla('La temperatura va de 0 a 2 (o null, la de su papel)');
        c.temperatura = Math.round(t * 100) / 100;
      }
    }
    if (o.voz !== undefined) {
      if (o.voz === null || o.voz === '') c.voz = null;
      else {
        const v = String(o.voz).trim().toLowerCase(), voces = (T && T.VOCES) || [];
        if (voces.length && !voces.includes(v)) falla('La voz vale: ' + voces.join(', '));
        c.voz = v;
      }
    }
    if (o.enojon !== undefined) { if (typeof o.enojon !== 'boolean') falla('enojon es true o false'); c.enojon = o.enojon; }
    const asp = o.aspecto !== undefined ? o.aspecto : o.duende_aspecto;
    if (asp !== undefined) {
      if (asp === null) c.duende = null;
      else {
        if (!T || typeof T.validarDuende !== 'function') falla('Esta versión de ClapCraft no trae el creador de duendes');
        const mods = (op && op.mods) || {};
        const base = o.cambiar_aspecto === true && actual && actual.duende ? actual.duende : {};
        const r = T.validarDuende(Object.assign({}, base, asp), { mascaras: (mods.mascaras || []).map(m => m.id), vestuarios: (mods.vestuarios || []).map(m => m.id) });
        if (!r.ok) falla('El aspecto: ' + r.error);
        c.duende = r.dato;
      }
    }
    return { c, avisos };
  }
  function nombreOp(o) { return String((o && (o.op || o.operacion || o.accion)) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '').trim(); }
  const ALIAS = { crear: 'crear', nuevo: 'crear', crear_duende: 'crear', cambiar: 'cambiar', editar: 'cambiar', modificar: 'cambiar', eliminar: 'eliminar', borrar: 'eliminar', quitar: 'eliminar',
    mover: 'mover', colocar: 'mover', equipo: 'equipo', ajustar: 'equipo', modo: 'equipo' };
  function editar(eq0, args, op) {
    try {
      const e = E(); if (!e) falla('Esta versión de ClapCraft no trae los duendes del asistente');
      const antes = e.normalizar(eq0), a = args || {};
      let ops = Array.isArray(a.operaciones) ? a.operaciones : a.operaciones ? [a.operaciones] : [];
      if (!ops.length && (a.op || a.operacion)) ops = [a];
      if (!ops.length) falla('Faltan las operaciones: [{ op: "crear" | "cambiar" | "eliminar" | "mover" | "equipo", … }]');
      if (ops.length > 50) falla('Son muchas operaciones de una vez (50 como mucho)');
      const ahora = op && typeof op.ahora === 'function' ? op.ahora : () => Date.now();
      const opE = { ahora };
      let eq = copia(antes);
      const hechos = [], avisos = [], tocados = [], cortos = [];
      ops.forEach((o, i) => {
        if (!o || typeof o !== 'object') falla('La operación ' + (i + 1) + ' no es un objeto');
        const tipo = ALIAS[nombreOp(o)];
        const pre = 'Operación ' + (i + 1) + ' (' + (nombreOp(o) || '¿?') + '): ';
        try {
          if (!tipo) falla('no la conozco: crear, cambiar, eliminar, mover o equipo');
          if (tipo === 'crear') {
            if (o.nombre === undefined) falla('falta el nombre');
            if (o.personalidad === undefined || !String(o.personalidad || '').trim()) falla('falta la personalidad (un especial sin personalidad no sirve de nada)');
            const { c, avisos: av } = camposDe(o, eq, op, null);
            const datos = Object.assign({ rol: 'revisar', veto: false, modelo: e.MODELO_ESPECIAL, enojon: false }, c);
            const r = e.crearEspecial(eq, datos, opE);
            if (!r.ok) falla(r.error);
            eq = r.equipo; tocados.push(r.duende.id); avisos.push(...av);
            if (o.antes_de) { const ref = buscar(eq, o.antes_de); const m = e.moverDuende(eq, r.duende.id, ref.id, opE); if (!m.ok) falla(m.error); eq = m.equipo; }
            cortos.push('creó ' + comillas(r.duende.nombre));
            hechos.push('Creado ' + comillas(r.duende.nombre) + ' (id ' + r.duende.id + ', ' + rolTexto(r.duende) + ', ' + r.duende.modelo + ', ' + r.duende.personalidad.length + ' caracteres de personalidad' + (r.duende.duende ? ', con su aspecto' : '') + ').');
          } else if (tipo === 'cambiar') {
            const d = buscar(eq, o.duende || o.id);
            const { c, avisos: av } = camposDe(o, eq, op, d);
            if (!Object.keys(c).length) falla('no dice qué cambiar (' + CAMPOS.concat(['aspecto']).join(', ') + ')');
            if (d.fijo && c.personalidad !== undefined && c.personalidad) falla(comillas(d.nombre) + ' es del equipo fijo y no tiene personalidad propia (su trabajo es fijo). Para una personalidad, crea un especial');
            if (d.fijo && (c.rol !== undefined || c.veto !== undefined || c.enojon !== undefined)) falla(comillas(d.nombre) + ' es del equipo fijo: su papel no cambia (solo nombre, modelo, temperatura, voz y aspecto)');
            const r = e.editarDuende(eq, d.id, c, opE);
            if (!r.ok) falla(r.error);
            eq = r.equipo; tocados.push(d.id); avisos.push(...av);
            cortos.push('cambió ' + comillas(r.duende.nombre));
            hechos.push('Cambiado ' + comillas(r.duende.nombre) + ': ' + Object.keys(c).map(k => (k === 'duende' ? 'aspecto' : k)).join(', ') + '.');
          } else if (tipo === 'eliminar') {
            const d = buscar(eq, o.duende || o.id);
            const r = e.eliminarDuende(eq, d.id, opE);
            if (!r.ok) falla(r.error);
            eq = r.equipo;
            cortos.push('eliminó ' + comillas(d.nombre));
            hechos.push('Eliminado ' + comillas(d.nombre) + '.');
          } else if (tipo === 'mover') {
            const d = buscar(eq, o.duende || o.id);
            const ref = o.antes_de ? buscar(eq, o.antes_de) : null;
            const r = e.moverDuende(eq, d.id, ref ? ref.id : null, opE);
            if (!r.ok) falla(r.error);
            eq = r.equipo; tocados.push(d.id);
            cortos.push('movió ' + comillas(d.nombre));
            hechos.push('Movido ' + comillas(d.nombre) + (ref ? ' delante de ' + comillas(ref.nombre) : ' al final') + '.');
          } else {
            const c = {};
            if (o.modo !== undefined) { if (!['fiel', 'libre'].includes(o.modo)) falla('modo: fiel o libre'); c.modo = o.modo; }
            if (o.rondas !== undefined) { const n = Math.round(Number(o.rondas)); if (!(n >= 1 && n <= 4)) falla('rondas: de 1 a 4'); c.rondas = n; }
            if (!Object.keys(c).length) falla('di el modo (fiel | libre) o las rondas (1–4)');
            eq = e.ajustar(eq, c, opE).equipo;
            cortos.push('cambió el modo del equipo');
            hechos.push('Equipo: ' + Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ') + '.');
          }
        } catch (err) { if (err instanceof Fallo) falla(pre + err.message.replace(/\.+$/, '') + '. No se hizo nada del lote.'); throw err; }
      });
      eq = e.normalizar(eq, opE);
      const cambio = JSON.stringify(eq) !== JSON.stringify(antes);
      return { ok: true, equipo: eq, antes, cambio, tocados: [...new Set(tocados)].filter(id => eq.duendes.some(d => d.id === id)), hechos, avisos, cortos: [...new Set(cortos)],
        texto: hechos.join('\n') + (avisos.length ? '\n' + avisos.join('\n') : '') + (cambio ? '' : '\n(Nada cambió.)') };
    } catch (err) { if (err instanceof Fallo) return { ok: false, error: err.message }; throw err; }
  }
  /* un resumen corto para el aviso de la app: «Claude creó «X»» */
  function resumenAviso(r, origen) {
    const quien = origen || 'Claude';
    const l = (r && r.cortos) || [];
    if (!l.length) return quien + ' cambió los duendes del asistente';
    if (l.length <= 3) return quien + ' ' + l.join(', ') + ' en los duendes del asistente';
    return quien + ' hizo ' + l.length + ' cambios en los duendes del asistente';
  }

  /* ====================================================================
     Las definiciones de MCP (las ofrece claude/servidor.js; no son de ningún proyecto)
     ==================================================================== */
  const DUENDE = { type: 'string', description: 'El duende: su id o su nombre.' };
  const FICHA = {
    nombre: { type: 'string', description: '60 caracteres como mucho; distinto del de los demás.' },
    personalidad: { type: 'string', description: 'Quién es, qué le obsesiona, con qué criterio mira un texto, cómo habla (con ejemplos) y qué no hace. 4000 caracteres como mucho.' },
    rol: { type: 'string', enum: ['revisar', 'transformar', 'consultar', 'anotar'], description: 'revisar (con veto o sin él), transformar (reescribe el texto con su estilo), consultar (solo da su opinión) o anotar (la secretaria de la Mesa: toma notas en un acta y edita los documentos que Leo le pide).' },
    veto: { type: 'boolean', description: 'Solo con rol revisar: lo que rechaza vuelve a la escritora.' },
    modelo: { type: ['string', 'null'], description: 'deepseek-v4-pro de partida (null = el de su papel).' },
    temperatura: { type: ['number', 'null'], description: 'De 0 a 2 (null = la de su papel).' },
    voz: { type: ['string', 'null'] },
    enojon: { type: 'boolean', description: 'Se enoja a menudo al trabajar (una animación).' },
    aspecto: { type: ['object', 'null'], description: 'Su duende, con los rasgos del creador de duendes (ver_duendes_asistente los da). null = el de su papel.' },
    cambiar_aspecto: { type: 'boolean', description: 'Con aspecto: mezclarlo con el que tiene en lugar de sustituirlo.' }
  };
  const HERRAMIENTAS = [
    { name: 'ver_duendes_asistente', title: 'Ver los duendes del asistente', soloServidor: true, annotations: { readOnlyHint: true },
      description: 'Los duendes del asistente de IA de ClapCraft (el equipo que escribe, revisa y opina en el chat de la app y en los lienzos; NO los del teatro, que son los de los personajes): el modo del equipo, los fijos (maestro, lector, escritora, coordinador) y los especiales de Leo con su personalidad. Con "duende", su ficha entera (la personalidad completa y el aspecto). Trae la guía para escribirles una personalidad avanzada, los modelos con su precio, las voces y los rasgos del aspecto. No es de ningún proyecto: vale en todos. Míralo antes de editar_duendes_asistente, y para consultar a un duende (contesta tú como él).',
      inputSchema: { type: 'object', properties: { duende: DUENDE, guia: { type: 'boolean', description: 'false: sin la guía (ya la tienes).' } } } },
    { name: 'editar_duendes_asistente', title: 'Crear y cambiar duendes del asistente', soloServidor: true, annotations: { destructiveHint: true },
      description: 'Crea, cambia, elimina u ordena los duendes especiales del asistente de ClapCraft (de todos los proyectos de Leo), y el modo del equipo. Un lote que se hace entero o nada. Operaciones: { op: "crear", nombre, personalidad, rol, veto?, modelo?, temperatura?, voz?, enojon?, aspecto?, antes_de? } · { op: "cambiar", duende, …los campos que cambian } · { op: "eliminar", duende } · { op: "mover", duende, antes_de (null = al final) } · { op: "equipo", modo: fiel|libre, rondas: 1-4 }. Los fijos (maestro, lector, escritora, coordinador) solo cambian nombre, modelo, temperatura, voz y aspecto, y no se eliminan. Si ClapCraft está abierta, se ve al momento y Leo puede deshacerlo desde el aviso. Pregúntale a Leo antes de eliminar uno o de cambiar mucho la personalidad de uno que ya existe.',
      inputSchema: { type: 'object', required: ['operaciones'], properties: { operaciones: { type: 'array', items: { type: 'object', required: ['op'], properties: Object.assign({
        op: { type: 'string', enum: ['crear', 'cambiar', 'eliminar', 'mover', 'equipo'] }, duende: DUENDE, antes_de: { type: ['string', 'null'], description: 'Delante de qué especial queda.' },
        modo: { type: 'string', enum: ['fiel', 'libre'] }, rondas: { type: 'integer', minimum: 1, maximum: 4 } }, FICHA) } } } } }
  ];
  const NOMBRES = HERRAMIENTAS.map(t => t.name);
  const escribe = nombre => nombre === 'editar_duendes_asistente';
  /* ejecutar una: (equipo, nombre, args, op) → { ok, texto, equipo?, antes?, cambio? } */
  function ejecutar(eq, nombre, args, op) {
    if (nombre === 'ver_duendes_asistente') return ver(eq, args, op);
    if (nombre === 'editar_duendes_asistente') return editar(eq, args, op);
    return { ok: false, error: 'No conozco la herramienta ' + comillas(nombre) };
  }

  C.equipoClaude = { HERRAMIENTAS, NOMBRES, escribe, ejecutar, ver, editar, guia, buscar, resumenAviso };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
