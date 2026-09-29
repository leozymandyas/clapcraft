/* Prueba del taller de duendes del asistente (1.1.68): `electron pruebas/taller-electron.js`.
   Carga duendes.html?embebido=1&taller=1 en una ventana y lo maneja por su API (`Duendes.taller`, `tallerEvento`, `sonido`, `hablar`,
   `callar`, `tallerInfo`): los actores en sus puestos, cada acción del §3 del contrato (leer, escribir, revisar, enojo con el gesto
   enojado de fábrica y sus partículas, el enojo frecuente de los enojones sin que llegue un evento, aprobar, rechazar con su bola de
   papel, corregir, entregar caminando hasta el destino, hablar, error y fin), ocho actores sin errores de consola, ponerlos al día sin
   recargar, que hablar programa notas con el sonido encendido y ninguna apagado (el contador `notas` del motor, no el oído), y que el
   retrato del asistente (?retrato=1&trabajo=1) habla después de `detener()`. Además, que el teatro embebido y el generador suelto
   siguen como estaban. `CAPTURAS=carpeta` deja capturas ahí. No forma parte de la aplicación ni del instalador. */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CAPTURAS = process.env.CAPTURAS || null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cc-taller-')));
const HTML = path.join(__dirname, '..', 'duendes.html');
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || detalle === undefined ? '' : '\n      ' + String(typeof detalle === 'string' ? detalle : JSON.stringify(detalle)).slice(0, 1200)));
}
/* lo que no es un error del motor: las fuentes de Google sin red */
const ajeno = m => /fonts\.(googleapis|gstatic)|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(m);

async function abrir(query, errores, tam) {
  const win = new BrowserWindow({ width: tam ? tam[0] : 1000, height: tam ? tam[1] : 620, useContentSize: !!tam, show: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', e => {
    const nivel = e.level ?? e.params?.level, msg = String(e.message ?? e.params?.message ?? '');
    if ((nivel === 'error' || nivel === 3) && !ajeno(msg)) { errores.push(msg); console.log('    [página] ' + msg); }
  });
  win.webContents.on('render-process-gone', (_e, d) => errores.push('render-process-gone ' + JSON.stringify(d)));
  await win.loadFile(HTML, { search: query });
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  for (let i = 0; i < 50 && !(await js('return !!(window.Duendes)')); i++) await espera(100);
  return { win, js };
}

app.on('window-all-closed', () => {});   // entre una ventana y la siguiente no hay ninguna: que no se cierre la prueba
app.whenReady().then(async () => {
  let fallo = null;
  try {
    /* ============ 1. El taller ============ */
    console.log('\n1. El taller: la escena y los actores');
    const errores = [];
    const { win, js } = await abrir('embebido=1&taller=1&tema=dark', errores);
    const info = () => js('return JSON.stringify(Duendes.tallerInfo())').then(JSON.parse);
    const actor = async id => (await info()).actores.find(a => a.id === id);
    const evento = ev => js(`return Duendes.tallerEvento(${JSON.stringify(ev)})`);
    const hasta = async (fn, ms) => { for (let t = 0; t < (ms || 5000); t += 80) { const r = await fn(); if (r) return r; await espera(80); } return null; };
    const captura = async nombre => { if (!CAPTURAS) return; await espera(250); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };

    let i0 = await info();
    comprobar('la página dice que es el taller', i0.taller === true && (await js(`return document.documentElement.classList.contains('taller')`)));
    comprobar('sin controles del teatro ni del generador', await js(`return ['.controls', '#theaterCard', '#forestCard', 'header', '.sobretitulo'].every(s => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === 'none'; })`));
    comprobar('el escenario se ve y la línea de estado está debajo', await js(`const c = document.getElementById('stage'), e = document.getElementById('tallerEstado');
      return c.clientWidth > 400 && !!e && e.getBoundingClientRect().top >= c.getBoundingClientRect().bottom - 2 && e.textContent.length > 5;`));
    comprobar('de partida está el duende maestro, en el centro', i0.actores.length === 1 && i0.actores[0].papel === 'maestro' && i0.actores[0].casa[0] === 160, i0.actores);
    comprobar('el taller empieza callado', i0.sonido === false);

    const FORMATEADOR = { cuerpo: 'duende', skin: '#c89b6d', cloth: '#39a0a0', hat: 'boina', hatCol: '#1b1420', lentes: 'redondos', accesorios: ['bufanda'], vello: 'bigote' };
    const MAESTRO = { cuerpo: 'duende', skin: '#7bc043', cloth: '#3d7ec8', hat: 'punta', hatCol: '#c8553d', vello: 'barba-larga', beardCol: '#f4f1ea' };
    const EQUIPO = [
      { id: 'maestro', nombre: 'El duende maestro', papel: 'maestro', duende: MAESTRO, voz: 'grave' },
      { id: 'lector', nombre: 'El lector', papel: 'lector', duende: null },
      { id: 'escritor', nombre: 'La escritora', papel: 'escritor', duende: null, voz: 'dulce' },
      { id: 'coordinador', nombre: 'El coordinador', papel: 'coordinador', duende: null, enojon: true },
      { id: 'formateador', nombre: 'El formateador', papel: 'especial', duende: FORMATEADOR, enojon: true }
    ];
    comprobar('taller() pone al equipo', await js(`return Duendes.taller(${JSON.stringify({ actores: EQUIPO, sonido: false })})`) === true);
    await espera(200);
    let i1 = await info();
    comprobar('cinco actores, en el orden y con su papel', i1.actores.map(a => a.id).join() === 'maestro,lector,escritor,coordinador,formateador' && i1.actores.map(a => a.papel).join() === 'maestro,lector,escritor,coordinador,especial', i1.actores);
    comprobar('cada uno en su puesto (el maestro al centro), sin repetir', new Set(i1.actores.map(a => a.casa.join())).size === 5 && i1.actores[0].casa.join() === '160,160', i1.actores.map(a => a.casa));
    comprobar('un aspecto por papel si no traen duende, y el suyo si lo traen', new Set(i1.actores.map(a => a.ropa)).size === 5
      && i1.actores.find(a => a.id === 'formateador').ropa === '#39a0a0' && i1.actores.find(a => a.id === 'formateador').sombrero === 'boina'
      && i1.actores.find(a => a.id === 'maestro').sombrero === 'punta', i1.actores.map(a => [a.id, a.ropa, a.sombrero]));
    comprobar('enojones: el coordinador y el especial (y los demás no)', i1.actores.filter(a => a.enojon).map(a => a.id).join() === 'coordinador,formateador');
    await captura('taller-1-equipo');

    console.log('\n2. Los eventos');
    await evento({ quien: 'maestro', papel: 'maestro', nombre: 'El duende maestro', accion: 'empezar', texto: 'Escriban la escena 3 con lo que dice el esquema' });
    await espera(150);
    let m = await actor('maestro'); i1 = await info();
    comprobar('empezar: el maestro habla con su globo y el taller trabaja', m.breve === 'hablar' && /escena 3/.test(m.globo || '') && i1.trabajando && /El duende maestro: Escriban/.test(i1.estado), [m, i1.estado]);
    await evento({ quien: 'lector', accion: 'leer', texto: 'Leyendo 3 fuentes' });
    await evento({ quien: 'escritor', accion: 'escribir', texto: 'Escribiendo la escena' });
    await evento({ quien: 'coordinador', accion: 'revisar' });
    await espera(250);
    comprobar('leer: el lector hojea su libro', (await actor('lector')).accion === 'leer', await actor('lector'));
    comprobar('escribir: la escritora teclea (unos y ceros)', (await actor('escritor')).accion === 'teclear' && !!(await hasta(async () => ((await info()).particulas.one || 0) + ((await info()).particulas.zero || 0) > 0, 3000)));
    comprobar('revisar: el coordinador revisa con la lupa', (await actor('coordinador')).accion === 'revisar' && (await actor('coordinador')).tarea === 'revisar');
    await captura('taller-2-trabajan');

    await evento({ quien: 'coordinador', accion: 'enojo', texto: '¡Esto no sale en el esquema: «el bar de Mara»!', ronda: 1 });
    await espera(120);
    let c = await actor('coordinador'), ip = await info();
    comprobar('enojo: el gesto enojado de fábrica, sacudiéndose', c.accion === 'actuar' && c.gesto === 'enojado' && c.breve === 'enojo' && c.sacude === true, c);
    comprobar('enojo: partículas de enojo y su globo', (ip.particulas.anger || 0) > 0 && /bar de Mara/.test(c.globo || ''), [ip.particulas, c.globo]);
    comprobar('la línea de estado dice quién y qué', /El coordinador: ¡Esto no sale/.test(ip.estado), ip.estado);
    await captura('taller-3-enojo');
    const volvio = await hasta(async () => (await actor('coordinador')).accion === 'revisar', 4000);
    comprobar('después del enojo, sigue revisando', !!volvio);

    /* el enojo frecuente de los enojones, sin evento */
    await evento({ quien: 'formateador', accion: 'revisar', texto: 'Mirando el formato' });
    const e0 = (await actor('formateador')).enojos;
    const seEnojo = await hasta(async () => { const a = await actor('formateador'); return a.enojos > e0 && a.gesto === 'enojado' ? a : null; }, 9000);
    comprobar('un enojón que revisa se enoja solo cada pocos segundos (gesto y globo)', !!seEnojo && !!seEnojo.globo, seEnojo || await actor('formateador'));
    comprobar('y hay partículas de enojo mientras', ((await info()).particulas.anger || 0) > 0);
    await evento({ quien: 'lector', accion: 'leer' });
    const l0 = (await actor('lector')).enojos; await espera(2500);
    comprobar('uno que no es enojón no se enoja solo', (await actor('lector')).enojos === l0);

    await evento({ quien: 'coordinador', accion: 'rechazar', texto: 'Otra vez: hay un nombre inventado', ronda: 1 });
    await espera(100);
    c = await actor('coordinador'); ip = await info();
    comprobar('rechazar: se enoja y tira el papel', c.gesto === 'enojado' && c.breve === 'rechazar' && (ip.particulas.hoja || 0) > 0, [c, ip.particulas]);
    await evento({ quien: 'escritor', accion: 'corregir', texto: 'Quito «el bar de Mara»', ronda: 2 });
    await espera(150);
    let es = await actor('escritor');
    comprobar('corregir: tacha y escribe', es.accion === 'escribir' && es.tarea === 'corregir', es);
    comprobar('la ronda sale en la línea de estado', /ronda 2/.test((await info()).estado));
    await evento({ quien: 'coordinador', accion: 'aprobar', texto: 'Aprobado', ronda: 2 });
    await espera(120);
    c = await actor('coordinador'); ip = await info();
    comprobar('aprobar: aplaude con su palomita', c.gesto === 'aplaude' && (ip.particulas.check || 0) > 0 && c.tarea === 'esperar', [c, ip.particulas]);
    await evento({ quien: 'escritor', accion: 'error', texto: 'Se acabó el saldo' });
    await espera(100);
    es = await actor('escritor');
    comprobar('error: triste, con su globo', es.gesto === 'triste' && /saldo/.test(es.globo || ''), es);

    /* entregar: camina hasta el siguiente (el lector → la escritora) y vuelve a su puesto */
    const L0 = await actor('lector'), E0 = await actor('escritor');
    await evento({ quien: 'lector', accion: 'entregar', texto: 'El dossier' });
    await espera(80);
    let l = await actor('lector');
    comprobar('entregar: camina con el papel', l.caminando && l.carga && l.ultimaEntrega && l.ultimaEntrega.a === 'escritor', l);
    let min = 1e9;
    const llego = await hasta(async () => { const a = await actor('lector'); min = Math.min(min, Math.hypot(a.x - E0.x, a.y - E0.y)); return a.ultimaEntrega && a.ultimaEntrega.llego ? a : null; }, 8000);
    comprobar('llega hasta la escritora (y le entrega)', !!llego && min < 22 && llego.entregas === 1 && !llego.carga, { min, llego });
    await captura('taller-4-entrega');
    const enCasa = await hasta(async () => { const a = await actor('lector'); return !a.caminando && Math.hypot(a.x - L0.casa[0], a.y - L0.casa[1]) < 2 ? a : null; }, 9000);
    comprobar('y vuelve a su puesto', !!enCasa);
    await evento({ quien: 'formateador', accion: 'entregar', para: 'maestro' });
    const M0 = await actor('maestro');
    let minM = 1e9;
    const llegoM = await hasta(async () => { const a = await actor('formateador'); minM = Math.min(minM, Math.hypot(a.x - M0.x, a.y - M0.y)); return a.ultimaEntrega && a.ultimaEntrega.llego ? a : null; }, 8000);
    comprobar('entregar con destino: el especial camina hasta el maestro', !!llegoM && llegoM.ultimaEntrega.a === 'maestro' && minM < 22, { minM, llegoM });

    console.log('\n3. El sonido');
    let n0 = (await info()).notas;
    await evento({ quien: 'escritor', accion: 'hablar', texto: 'Ya tengo la escena lista' });
    await espera(500);
    comprobar('con el sonido apagado, los globos no suenan', (await info()).notas === n0);
    comprobar('y hablar() no suena (devuelve false)', await js(`return Duendes.hablar({ texto: 'Hola', voz: 'grave' })`) === false && (await info()).notas === n0);
    comprobar('sonido(true) lo enciende', await js('return Duendes.sonido(true)') === true && (await info()).sonido === true);
    n0 = (await info()).notas;
    await evento({ quien: 'escritor', accion: 'hablar', texto: 'Ya tengo la escena lista' });
    const sono = await hasta(async () => (await info()).notas > n0, 3000);
    comprobar('con el sonido encendido, el globo habla (se programan notas)', !!sono, await info());
    n0 = (await info()).notas;
    comprobar('hablar() en el taller hace hablar al maestro', await js(`return Duendes.hablar({ texto: 'Listo, Leo: la escena ya está en el documento.', voz: 'grave', emo: 'feliz' })`) === true);
    await hasta(async () => (await info()).notas > n0, 3000);
    m = await actor('maestro'); ip = await info();
    comprobar('…con su globo y notas programadas', ip.notas > n0 && /Listo, Leo/.test(m.globo || '') && m.breve === 'hablar' && ip.hablando, [ip.notas - n0, m]);
    comprobar('como mucho unos 6 s de notas (92 sílabas)', ip.notas - n0 <= 93, ip.notas - n0);
    comprobar('callar() corta', await js('return Duendes.callar()') === true && !(await info()).hablando);
    comprobar('hablar sin texto no suena', await js(`return Duendes.hablar({ texto: '   ' })`) === false);
    await js('Duendes.sonido(false)');
    n0 = (await info()).notas;
    await evento({ quien: 'coordinador', accion: 'enojo', texto: '¡Esa coma!' });
    await espera(400);
    comprobar('apagado otra vez: ni el enojo suena', (await info()).notas === n0);

    console.log('\n4. El final');
    await evento({ quien: 'maestro', accion: 'fin', texto: 'Listo' });
    await espera(100);
    comprobar('fin: todos van con el maestro', (await info()).fin === 'ir' && (await info()).actores.filter(a => a.id !== 'maestro').some(a => a.caminando));
    const celebran = await hasta(async () => (await info()).fin === 'celebrar', 8000);
    comprobar('se juntan y celebran', !!celebran && (await info()).actores.every(a => Math.hypot(a.x - 160, a.y - 150) < 125));
    await captura('taller-5-fin');
    const vuelven = await hasta(async () => { const x = await info(); return !x.fin && !x.trabajando && x.actores.every(a => !a.caminando && Math.hypot(a.x - a.casa[0], a.y - a.casa[1]) < 2) ? x : null; }, 12000);
    comprobar('y cada quien vuelve a su puesto; el taller deja de trabajar', !!vuelven, await info());

    console.log('\n5. Ocho actores, ponerlos al día y uno que llega solo');
    const OCHO = EQUIPO.concat([
      { id: 'd-a1', nombre: 'La correctora', papel: 'especial', duende: { cuerpo: 'humano', prenda: 'saco', lentes: 'cuadrados', peinado: 'chongo', cloth: '#7a4fb0' }, enojon: true },
      { id: 'd-a2', nombre: 'El tiquismiquis', papel: 'especial', duende: { cuerpo: 'nino', vestuario: 'detective' }, enojon: true, voz: 'chillona' },
      { id: 'd-a3', nombre: 'Doña Tilde', papel: 'especial', duende: { vestuario: 'perro' }, enojon: false }
    ]);
    const lectorAntes = await actor('lector');
    await js(`Duendes.taller(${JSON.stringify({ actores: OCHO })})`);
    await espera(300);
    let i8 = await info();
    comprobar('ocho actores en escena', i8.actores.length === 8 && new Set(i8.actores.map(a => a.casa.join())).size === 8, i8.actores.map(a => [a.id, a.casa]));
    comprobar('los que ya estaban no se movieron (sin recargar)', (await actor('lector')).x === lectorAntes.x && (await actor('lector')).y === lectorAntes.y);
    comprobar('cuerpos humanos, de niño y disfraces de animal', i8.actores.find(a => a.id === 'd-a1').cuerpo === 'humano' && i8.actores.find(a => a.id === 'd-a2').cuerpo === 'nino', i8.actores.map(a => [a.id, a.cuerpo]));
    await js(`Duendes.sonido(true)`);
    for (const a of OCHO) {
      for (const accion of ['leer', 'escribir', 'revisar', 'corregir', 'enojo', 'aprobar', 'hablar', 'rechazar']) await evento({ quien: a.id, accion, texto: accion + ' de ' + a.nombre });
    }
    for (const a of OCHO) await evento({ quien: a.id, accion: 'revisar' });
    await evento({ quien: 'd-a3', accion: 'entregar' });
    await captura('taller-6-ocho');
    await espera(4000);
    i8 = await info();
    comprobar('ocho trabajando a la vez, sin errores de consola', errores.length === 0 && i8.actores.length === 8, errores);
    comprobar('los enojones se enojan solos también con ocho', i8.actores.filter(a => a.enojon).some(a => a.enojos > 2));
    const fps = await js(`let n = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n;`);
    comprobar('y a buen ritmo (' + fps + ' fotogramas por segundo)', fps >= 30, fps);
    await js(`Duendes.sonido(false); Duendes.callar();`);
    await js(`Duendes.taller(${JSON.stringify({ actores: OCHO.filter(a => a.id !== 'd-a3').map(a => a.id === 'lector' ? Object.assign({}, a, { nombre: 'El lector atento' }) : a) })})`);
    await espera(200);
    i8 = await info();
    comprobar('taller() otra vez: se va el que falta y cambia el nombre', i8.actores.length === 7 && !i8.actores.some(a => a.id === 'd-a3') && (await actor('lector')).nombre === 'El lector atento');
    comprobar('cambiarle el duende a uno lo vuelve a vestir', await js(`Duendes.taller({ actores: ${JSON.stringify(OCHO.slice(0, 7).map(a => a.id === 'escritor' ? Object.assign({}, a, { duende: { cloth: '#c8553d', hat: 'copa' } }) : a))} }); await W(100); return Duendes.tallerInfo().actores.find(a => a.id === 'escritor').sombrero === 'copa';`));
    await evento({ quien: 'd-nuevo', nombre: 'El recién llegado', papel: 'especial', accion: 'revisar' });
    await espera(150);
    comprobar('un evento de uno que no estaba lo trae con el aspecto de su papel', !!(await actor('d-nuevo')) && (await actor('d-nuevo')).tarea === 'revisar');
    comprobar('un evento sin acción conocida no hace nada', await evento({ quien: 'maestro', accion: 'bailar' }) === false);
    comprobar('sin errores de consola en todo el taller', errores.length === 0, errores);
    win.destroy();

    /* ============ 6. El retrato del asistente ============ */
    console.log('\n6. El retrato del asistente (?retrato=1&trabajo=1)');
    const errR = [];
    const R = await abrir('embebido=1&retrato=1&trabajo=1&tema=light', errR);
    const infoR = () => R.js('return JSON.stringify(Duendes.tallerInfo())').then(JSON.parse);
    comprobar('no es el taller', (await infoR()).taller === false && await R.js('return Duendes.taller({ actores: [] })') === false);
    comprobar('sale trabajando', (await R.js('return JSON.stringify(Duendes.retratoInfo())').then(JSON.parse)).accion === 'trabajar');
    await R.js(`Duendes.retrato(${JSON.stringify({ duende: MAESTRO, accion: 'trabajar', fondo: 'transparente' })})`);
    const ri = await R.js('return JSON.stringify(Duendes.retratoInfo())').then(JSON.parse);
    comprobar('retrato({ duende: el del maestro, accion: trabajar, fondo: transparente })', ri && ri.accion === 'trabajar' && ri.cuerpo === 'duende'
      && await R.js(`return document.documentElement.classList.contains('retrato-transparente')`), ri);
    await R.js('Duendes.detener()');
    comprobar('detener() lo calla (el AudioContext, cerrado)', ['closed', null].includes((await infoR()).audio));
    const nR = (await infoR()).notas;
    comprobar('hablar() después de detener()', await R.js(`return Duendes.hablar({ texto: 'Listo, Leo: ya quedó la escena en el documento.', voz: 'grave' })`) === true);
    const habloR = await (async () => { for (let t = 0; t < 3000; t += 80) { const x = await infoR(); if (x.notas > nR) return x; await espera(80); } return null; })();
    comprobar('…vuelve a abrir el audio y programa notas', !!habloR && habloR.audio === 'running' && habloR.hablando, habloR || await infoR());
    comprobar('el retrato sigue trabajando mientras habla', (await R.js('return JSON.stringify(Duendes.retratoInfo())').then(JSON.parse)).accion === 'trabajar');
    await R.js('Duendes.callar()');
    comprobar('callar() lo corta', !(await infoR()).hablando);
    comprobar('sonido(false) y hablar() ya no suena', await R.js(`Duendes.sonido(false); return Duendes.hablar({ texto: 'Hola' })`) === false);
    comprobar('sin errores de consola en el retrato', errR.length === 0, errR);
    R.win.destroy();

    /* ============ 7. Lo de siempre, igual ============ */
    console.log('\n7. El teatro embebido y el generador, como estaban');
    const errT = [];
    const T = await abrir('embebido=1&tema=dark', errT);
    comprobar('el teatro no es el taller y conserva sus controles', (await T.js('return Duendes.tallerInfo().taller')) === false
      && await T.js(`return getComputedStyle(document.querySelector('.controls')).display !== 'none' && !document.getElementById('tallerEstado')`));
    await T.js(`Duendes.cargar({ texto: 'INT. OFICINA - DÍA\\n\\nLUNA: ¡Hola!\\n\\nPIPO: (triste) Adiós.', titulo: 'Prueba', personajes: [{ nombre: 'Luna', claro: '#f0d0e0', oscuro: '#8a2a5a' }], empezar: true })`);
    const rep = await (async () => { for (let t = 0; t < 4000; t += 100) { const r = JSON.parse(await T.js('return JSON.stringify(Duendes.reparto())')); if (r.activa && r.actores.length === 2) return r; await espera(100); } return null; })();
    comprobar('cargar() y la función empieza con su reparto', !!rep, rep);
    /* el lipsync del teatro: la boca de quien habla sigue las letras del globo (visemas, cerrada entre palabras) */
    const bt = await (async () => { for (let t = 0; t < 8000; t += 100) { const x = JSON.parse(await T.js('return JSON.stringify(Duendes.lipsyncInfo())')); if (x.teatro.filter(v => /^v-/.test(v)).length >= 2 && x.teatro.some(v => v === 'normal' || v === 'smile')) return x; await espera(100); } return JSON.parse(await T.js('return JSON.stringify(Duendes.lipsyncInfo())')); })();
    comprobar('teatro: la boca del que habla va por visemas y se cierra entre palabras', bt.teatro.filter(v => /^v-/.test(v)).length >= 2 && bt.teatro.some(v => v === 'normal' || v === 'smile'), bt);
    comprobar('sin errores de consola en el teatro', errT.length === 0, errT);
    T.win.destroy();
    const errG = [];
    const G = await abrir('', errG);
    const cuantos = await (async () => { for (let t = 0; t < 4000; t += 100) { const n = await G.js(`return document.getElementById('count').textContent`); if (/^4 /.test(n)) return n; await espera(100); } return null; })();
    comprobar('el generador suelto invoca sus cuatro duendes', !!cuantos, cuantos);
    comprobar('y no es el taller', (await G.js('return Duendes.tallerInfo().taller')) === false && !(await G.js(`return document.documentElement.classList.contains('taller')`)));
    comprobar('sin errores de consola en el generador', errG.length === 0, errG);
    G.win.destroy();

    /* ============ 8. El lipsync ============ */
    console.log('\n8. El lipsync');
    const errL = [];
    const Lp = await abrir('embebido=1&taller=1', errL);
    const ls = (t, m) => Lp.js(`return JSON.stringify(Duendes.lipsync(${JSON.stringify(t)}${m ? ", 'letras'" : ''}))`).then(JSON.parse);
    let li = await ls('mamá');
    comprobar('«mamá»: cerrada en cada m y abierta en cada a, una nota por sílaba', li.items.map(x => x.v).join() === 'v-m,v-a,v-m,v-a' && li.items.filter(x => x.nota).length === 2, li);
    li = await ls('a e i o u');
    comprobar('cada vocal, su visema (a, e, i, o, u)', li.items.map(x => x.v).join() === 'v-a,v-e,v-i,v-o,v-u', li);
    const hueco = x => { let m = 0; for (let i = 1; i < x.items.length; i++) m = Math.max(m, x.items[i].t - (x.items[i - 1].t + x.items[i - 1].d)); return m; };
    const hEsp = hueco(await ls('hola mira')), hComa = hueco(await ls('hola, mira')), hPunto = hueco(await ls('hola. mira'));
    comprobar('entre palabras se cierra, y más en comas y aún más en puntos', hEsp >= .05 && hComa > hEsp && hPunto > hComa, { hEsp, hComa, hPunto });
    comprobar('lo largo se corta a 6 s', (await ls('palabra '.repeat(200))).fin <= 6.2);
    const lt = await ls('Mi mapa', true);
    comprobar('por letras (el teatro): M cerrada, i, espacio cerrado, m, a, p cerrada, a', lt.join() === 'v-m,v-i,x,v-m,v-a,v-m,v-a', lt);
    const bocas = await Lp.js('return JSON.stringify(Duendes.bocasPrueba())').then(JSON.parse);
    const distintas = h => new Set(['v-a', 'v-e', 'v-i', 'v-o', 'v-u', 'v-m'].map(v => h[v])).size;
    comprobar('cada cara dibuja sus bocas: duende, con barba, humano, niño y perro', Object.entries(bocas).every(([n, h]) => distintas(h) >= (n === 'perro' || n === 'duende-barba' ? 3 : 5) && h['v-a'] !== h['v-m'] && h['v-a'] !== h.normal),
      Object.fromEntries(Object.entries(bocas).map(([n, h]) => [n, distintas(h)])));
    comprobar('sin errores de consola en el lipsync', errL.length === 0, errL);
    Lp.win.destroy();

    /* ============ 9. La mascota ============ */
    console.log('\n9. La mascota (?embebido=1&mascota=1)');
    const errM = [];
    const M = await abrir('embebido=1&mascota=1&tema=light', errM, [480, 116]);
    const mi = () => M.js('return JSON.stringify(Duendes.mascotaInfo())').then(JSON.parse);
    const hastaM = async (fn, ms) => { for (let t = 0; t < (ms || 5000); t += 60) { const x = await mi(); const r = fn(x); if (r) return x; await espera(60); } return null; };
    const capM = async nombre => { if (!CAPTURAS) return; await espera(120); const img = await M.win.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };
    let x = await mi();
    comprobar('es la mascota: el maestro a la vista, a escala 1, sin interfaz', x.mascota && x.maestro && x.maestro.enEscena && x.escala === 1 && Math.round(x.ancho) === 480
      && await M.js(`return getComputedStyle(document.querySelector('.wrap')).display === 'none' && !!document.getElementById('mascota')`), x);
    comprobar('empieza callada', x.sonido === false);
    comprobar('mascota() le pone su duende y su voz', await M.js(`return Duendes.mascota(${JSON.stringify({ maestro: { id: 'maestro', nombre: 'El duende maestro', duende: MAESTRO, voz: 'grave' }, sonido: false })})`) === true
      && (await mi()).maestro.sombrero === 'punta' && (await mi()).maestro.ropa === '#3d7ec8');
    await capM('mascota-1-quieto');
    /* vida propia: en unos segundos cambia de algo (mira a un lado, saluda, bosteza, lee…) */
    const vistos = new Set();
    for (let t = 0; t < 12000 && vistos.size < 2; t += 150) { const a = (await mi()).maestro; vistos.add([a.accion, a.gesto, a.x, a.facing].join('|')); await espera(150); }
    comprobar('quieto, no está quieto del todo (su rutina)', vistos.size >= 2, [...vistos]);
    const estados = {};
    for (const e of ['pensando', 'trabajando', 'escuchando', 'contento', 'error']) {
      await M.js(`Duendes.mascotaEstado('${e}')`); await espera(250);
      const a = (await mi()).maestro; estados[e] = a.accion + '/' + a.gesto;
    }
    comprobar('cada estado se ve: piensa, trabaja, escucha, contento y triste', /piensa/.test(estados.pensando) && /teclear|leer|escribir|revisar/.test(estados.trabajando)
      && /feliz/.test(estados.contento) && /triste/.test(estados.error) && estados.escuchando === 'actuar/null', estados);
    comprobar('un estado que no existe no hace nada', await M.js(`return Duendes.mascotaEstado('bailando')`) === false && (await mi()).estado === 'error');
    await M.js(`Duendes.mascotaEstado('quieto')`);

    /* decir: el maestro, con globo y boca, sin sonido */
    let n1 = (await mi()).notas;
    await M.js(`window.__r1 = null; Duendes.decir({ texto: 'Mamá, mira el mapa bonito que pinté. Y esto ya no sale.' }).then(r => { window.__r1 = r; });`);
    const hab = await hastaM(x => x.hablando === 'maestro' && x.maestro.globo, 3000);
    comprobar('decir(): el maestro habla con su globo (lo largo, una frase)', !!hab && hab.maestro.globo === 'Mamá, mira el mapa bonito que pinté.', hab);
    await capM('mascota-2-habla');
    const r1 = await (async () => { for (let t = 0; t < 12000; t += 100) { const r = await M.js('return window.__r1'); if (r) return r; await espera(100); } return null; })();
    x = await mi();
    comprobar('…y la promesa se resuelve al terminar', !!r1 && r1.ok === true && !x.hablando, r1);
    const vs = new Set(x.bocas);
    comprobar('la boca cambia con el texto (varios visemas), se cierra en la m y entre palabras', ['v-m', 'v-a', 'v-i'].every(v => vs.has(v)) && (vs.has('normal') || vs.has('smile')) && [...vs].filter(v => /^v-/.test(v)).length >= 4, x.bocas);
    comprobar('sin sonido no suena', x.notas === n1);
    await M.js(`window.__r2 = null; Duendes.decir({ texto: 'Ya quedó.', sonido: true }).then(r => { window.__r2 = r; });`);
    const sonoM = await hastaM(x => x.notas > n1, 3000);
    comprobar('decir({ sonido: true }) suena (notas programadas) aunque la mascota esté callada', !!sonoM);
    await hastaM(x => !x.hablando && x.cola === 0, 8000);
    comprobar('sonido(true): lo que dice suena solo', await M.js('return Duendes.sonido(true)') === true);
    n1 = (await mi()).notas;
    await M.js(`Duendes.decir({ texto: 'Hola otra vez.' })`);
    comprobar('…y se oye', !!(await hastaM(x => x.notas > n1, 3000)));
    await hastaM(x => !x.hablando && x.cola === 0, 8000);
    await M.js('Duendes.sonido(false)');

    /* un invitado entra, dice lo suyo (enojado) y se va */
    await M.js(`window.__r3 = null; Duendes.decir({ quien: 'coordinador', nombre: 'El coordinador', texto: '¡Esto no sale en el esquema!', emo: 'enojado' }).then(r => { window.__r3 = r; });`);
    const entra = await hastaM(x => x.invitados.length && x.invitados[0].caminando, 2000);
    comprobar('un invitado entra caminando por la derecha', !!entra && entra.invitados[0].x > 480 * .6, entra);
    const enojado = await hastaM(x => x.hablando === 'coordinador' && x.invitados[0].gesto === 'enojado', 5000);
    comprobar('…dice lo suyo enojado (gesto de fábrica, sacudida)', !!enojado && enojado.invitados[0].sacude && /esquema/.test(enojado.invitados[0].globo || ''), enojado);
    await capM('mascota-3-invitado');
    const sale = await hastaM(x => x.invitados.length && x.invitados[0].caminando && x.invitados[0].x > 440, 9000);
    comprobar('…y se va', !!sale && (await M.js('return window.__r3 && window.__r3.ok')) === true);
    comprobar('cuando sale, se olvida', !!(await hastaM(x => x.invitados.length === 0, 6000)));
    /* dos seguidos del mismo invitado: no sale entre uno y otro */
    await M.js(`Duendes.decir({ quien: 'lector', nombre: 'El lector', texto: 'Leí tres fuentes.' }); Duendes.decir({ quien: 'lector', nombre: 'El lector', texto: 'Y falta una.' });`);
    let salio = false, dijo1 = false, dijo2 = false;
    for (let t = 0; t < 14000 && !dijo2; t += 80) {
      const y = await mi(); const l = y.invitados[0];
      if (l && l.globo === 'Y falta una.') dijo2 = true;
      else if (l && l.globo === 'Leí tres fuentes.') dijo1 = true;
      else if (dijo1 && (!l || l.caminando)) salio = true;   // entre la primera y la segunda, ni camina ni se va
      await espera(80);
    }
    comprobar('dos seguidos del mismo invitado: no sale entre uno y otro', dijo2 && !salio);
    await hastaM(x => x.invitados.length === 0 && !x.hablando && x.cola === 0, 12000);
    /* la cola: tres esperando como mucho; lo más viejo se descarta */
    await M.js(`window.__rs = []; for (let i = 1; i <= 6; i++) Duendes.decir({ texto: 'Mensaje ' + i + '.' }).then(r => window.__rs.push([i, r.ok, r.motivo || '']));`);
    await espera(200);
    x = await mi();
    const rs = await M.js('return JSON.stringify(window.__rs)').then(JSON.parse);
    comprobar('cola: 3 esperando como mucho, los más viejos descartados', x.cola <= 3 && rs.filter(r => r[2] === 'descartado').length >= 2, { cola: x.cola, rs });
    comprobar('callar() corta y vacía la cola', await M.js('return Duendes.callar()') === true && !!(await hastaM(x => x.cola === 0 && !x.hablando, 1500))
      && (await M.js('return JSON.stringify(window.__rs)').then(JSON.parse)).length === 6);
    /* clic: saluda; Esc: lo cuenta al marco de arriba */
    await espera(400);
    M.win.focus();
    M.win.webContents.sendInputEvent({ type: 'mouseDown', x: 40, y: 60, button: 'left', clickCount: 1 });
    M.win.webContents.sendInputEvent({ type: 'mouseUp', x: 40, y: 60, button: 'left', clickCount: 1 });
    comprobar('un clic: el maestro saluda', !!(await hastaM(x => x.maestro.gesto === 'saluda', 1500)));
    await M.js(`window.__esc = null; window.addEventListener('message', e => { if (e.data && e.data.tipo === 'duendes-mascota' && e.data.tecla) window.__esc = e.data.tecla; });`);
    M.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); M.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await espera(200);
    comprobar('Esc se le cuenta a quien la tiene (postMessage)', await M.js('return window.__esc') === 'Escape');
    /* se adapta al tamaño del marco sin deformar: escala entera */
    M.win.setContentSize(720, 130); await espera(400);
    x = await mi();
    comprobar('a 720×130: escala 1, todo el ancho, el maestro en el suelo', x.escala === 1 && Math.round(x.ancho) === 720 && x.maestro.y === Math.round(x.alto - 7), x);
    M.win.setContentSize(400, 240); await espera(400);
    x = await mi();
    comprobar('a 400×240: escala 2 (pixel art entero)', x.escala === 2 && Math.round(x.ancho) === 200, x);
    comprobar('fondo del tema (opaco)', await M.js(`const c = document.getElementById('mascota'); return c.getContext('2d').getImageData(2, 2, 1, 1).data[3] === 255;`));
    comprobar('sin errores de consola en la mascota', errM.length === 0, errM);
    M.win.destroy();
    const MT = await abrir('embebido=1&mascota=1&tema=dark&fondo=transparente', errM, [480, 116]);
    await espera(300);
    comprobar('fondo=transparente: el lienzo es transparente', await MT.js(`const c = document.getElementById('mascota'); return c.getContext('2d').getImageData(2, 2, 1, 1).data[3] === 0;`));
    comprobar('fuera de la mascota, decir() no hace nada', await abrir('embebido=1&retrato=1', errM).then(async R2 => { const r = await R2.js(`return JSON.stringify(await Duendes.decir({ texto: 'Hola' }))`); R2.win.destroy(); return JSON.parse(r).ok === false; }));
    MT.win.destroy();

    /* ============ 10. La pelea de caricatura ============ */
    console.log('\n10. La pelea (mascota y taller)');
    const errP = [];
    const PM = await abrir('embebido=1&mascota=1&tema=dark', errP, [560, 120]);
    const pmi = () => PM.js('return JSON.stringify(Duendes.mascotaInfo())').then(JSON.parse);
    const hastaP = async (f, fn, ms) => { for (let t = 0; t < (ms || 6000); t += 60) { const x = await f(); if (fn(x)) return x; await espera(60); } return null; };
    const capP = async (w, nombre) => { if (!CAPTURAS) return; await espera(120); const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };
    const ENTRE = [{ id: 'critica', nombre: 'La crítica', duende: { cuerpo: 'humano', cloth: '#c8553d', hat: 'boina', hatCol: '#1b1420' } }, { id: 'lector', nombre: 'El lector' }];
    comprobar('pelea() en la mascota', await PM.js(`return Duendes.pelea(${JSON.stringify({ entre: ENTRE, nivel: 2 })})`) === true);
    let pp = await pmi();
    comprobar('mascotaInfo() dice la pelea: quiénes y el nivel', pp.pelea && pp.pelea.entre.join() === 'critica,lector' && pp.pelea.nivel === 2 && pp.pelea.fase === 'pelea', pp.pelea);
    comprobar('los que no estaban entran al recuadro', pp.invitados.length === 2 && pp.invitados.every(i => i.enPelea && (i.caminando || i.x > 400)), pp.invitados);
    const llegaron = await hastaP(pmi, x => x.pelea && x.pelea.llegaron, 5000);
    comprobar('llegan y se meten en la nube', !!llegaron && llegaron.pelea.nube && llegaron.invitados.some(i => i.enNube), llegaron && llegaron.invitados);
    comprobar('el maestro se aparta y mira preocupado', !!(await hastaP(pmi, x => x.maestro.gesto === 'nervioso', 2000)));
    const conPalabras = await hastaP(pmi, x => x.pelea.palabras > 0 && x.pelea.golpes > 0, 5000);
    comprobar('¡PUM!, ¡ZAS!, #@! y golpes', !!conPalabras, conPalabras && conPalabras.pelea);
    const asoma = await hastaP(pmi, x => x.invitados.some(i => i.enPelea && !i.enNube && i.gesto === 'pelea' && i.sacude), 6000);
    comprobar('a ratos uno asoma con el gesto «pelea» de fábrica, sacudiéndose', !!asoma, asoma && asoma.invitados);
    await capP(PM.win, 'pelea-1-mascota');
    const n0p = (await pmi()).notas; await espera(1500);
    comprobar('con el sonido apagado, los golpes no suenan', (await pmi()).notas === n0p);
    await PM.js('Duendes.sonido(true)');
    const n1p = (await pmi()).notas;
    comprobar('con sonido, golpes y gruñidos de vez en cuando (bajito, sin saturar)', !!(await hastaP(pmi, x => x.notas > n1p, 4000)));
    await espera(3000);
    const porSeg = ((await pmi()).notas - n1p) / 3;
    comprobar('…pocas notas por segundo (' + porSeg.toFixed(1) + ')', porSeg < 8, porSeg);
    await PM.js('Duendes.sonido(false)');
    /* decir en plena pelea: el que habla sale de la nube */
    await PM.js(`window.__rp = null; Duendes.decir({ quien: 'critica', nombre: 'La crítica', texto: '¡Te equivocas!', emo: 'enojado' }).then(r => window.__rp = r);`);
    const saleP = await hastaP(pmi, x => x.hablando === 'critica' && x.invitados.find(i => i.id === 'critica' && !i.enNube && i.globo), 5000);
    comprobar('decir() sigue funcionando: la que habla sale de la nube con su globo', !!saleP, saleP && saleP.invitados);
    await hastaP(pmi, x => !x.hablando, 8000);
    comprobar('…y no se va: sigue peleando', (await pmi()).invitados.filter(i => i.enPelea).length === 2 && (await PM.js('return window.__rp && window.__rp.ok')));
    comprobar('nivel 3 cambia la intensidad', await PM.js(`return Duendes.pelea(${JSON.stringify({ entre: ENTRE, nivel: 3 })})`) && (await pmi()).pelea.nivel === 3);
    comprobar('pelea(null): la nube se disipa y quedan mareados', await PM.js('return Duendes.pelea(null)') === true && !!(await hastaP(pmi, x => x.pelea && x.pelea.fase === 'fin' && x.invitados.some(i => i.gesto === 'cansado'), 2000)));
    await capP(PM.win, 'pelea-2-mareados');
    comprobar('…y los invitados salen; el maestro vuelve a lo suyo', !!(await hastaP(pmi, x => !x.pelea && x.invitados.length === 0 && x.maestro.gesto !== 'nervioso', 9000)), await pmi());
    /* «reducir movimiento» (emulado con el depurador): quietos, enojados y un «#@!» */
    PM.win.webContents.debugger.attach('1.3');
    await PM.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await PM.js(`Duendes.pelea(${JSON.stringify({ entre: ENTRE, nivel: 3 })})`);
    await espera(400);
    pp = await pmi();
    comprobar('reducir movimiento: sin nube, ya en su sitio, enojados y quietos', pp.pelea.reducir && !pp.pelea.nube && pp.invitados.every(i => i.enPelea && !i.caminando && !i.enNube && i.gesto === 'enojado' && !i.sacude), pp);
    await espera(1200);
    comprobar('…sin onomatopeyas que salten (solo el «#@!» fijo)', (await pmi()).pelea.palabras === 0);
    await capP(PM.win, 'pelea-3-reducir');
    await PM.js('Duendes.pelea(null)');
    await PM.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    PM.win.webContents.debugger.detach();
    comprobar('pelea() con una lista vacía no hace nada', await PM.js(`return Duendes.pelea({ entre: [] })`) === false);
    PM.win.destroy();

    const PT = await abrir('embebido=1&taller=1&tema=light', errP);
    const pti = () => PT.js('return JSON.stringify(Duendes.tallerInfo())').then(JSON.parse);
    await PT.js(`Duendes.taller(${JSON.stringify({ actores: EQUIPO })})`);
    await espera(200);
    const casaC = (await pti()).actores.find(a => a.id === 'coordinador').casa;
    comprobar('pelea() en el taller (con uno que no estaba: entra)', await PT.js(`return Duendes.pelea({ entre: [{ id: 'coordinador', nombre: 'El coordinador' }, { id: 'formateador' }, { id: 'd-critica', nombre: 'La crítica' }], nivel: 2 })`) === true
      && (await pti()).actores.some(a => a.id === 'd-critica'));
    const pt = await hastaP(pti, x => x.pelea && x.pelea.llegaron, 8000);
    comprobar('tallerInfo() dice la pelea; se juntan en la nube', !!pt && pt.pelea.entre.length === 3 && pt.pelea.nube && pt.actores.filter(a => a.enPelea).length === 3, pt && pt.pelea);
    comprobar('el maestro, preocupado; los demás siguen', !!(await hastaP(pti, x => x.actores.find(a => a.id === 'maestro').gesto === 'nervioso', 3000)));
    await PT.js(`Duendes.tallerEvento({ quien: 'lector', accion: 'leer' })`);
    await PT.js(`Duendes.tallerEvento({ quien: 'coordinador', accion: 'revisar' })`);
    await espera(300);
    comprobar('un evento no saca a nadie de la pelea (ni lo manda a su puesto)', (await pti()).actores.find(a => a.id === 'coordinador').enPelea && (await pti()).actores.find(a => a.id === 'lector').accion === 'leer');
    await capP(PT.win, 'pelea-4-taller');
    await PT.js('Duendes.pelea(null)');
    const vueltaT = await hastaP(pti, x => !x.pelea && x.actores.filter(a => a.id !== 'd-critica').every(a => !a.caminando && Math.hypot(a.x - a.casa[0], a.y - a.casa[1]) < 2), 12000);
    comprobar('pelea(null): cada uno vuelve a su puesto', !!vueltaT && vueltaT.actores.find(a => a.id === 'coordinador').x === casaC[0], await pti());
    comprobar('sin errores de consola en la pelea', errP.length === 0, errP);
    PT.win.destroy();

    /* ============ 11. Las escenas de los estados: la huelga y compañía ============ */
    console.log('\n11. Las escenas (huelga, tope, sin-clave, sin-red, saturado)');
    const errE = [];
    const EM = await abrir('embebido=1&mascota=1&tema=light', errE, [600, 130]);
    const emi = () => EM.js('return JSON.stringify(Duendes.mascotaInfo())').then(JSON.parse);
    const hastaE = async (f, fn, ms) => { for (let t = 0; t < (ms || 6000); t += 60) { const x = await f(); if (fn(x)) return x; await espera(60); } return null; };
    const capE = async (w, nombre) => { if (!CAPTURAS) return; await espera(150); const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };
    comprobar('mascotaEstado(\'huelga\')', await EM.js(`return Duendes.mascotaEstado('huelga')`) === true);
    let ee = await emi();
    comprobar('huelga: el maestro y tres más (entran)', ee.estado === 'huelga' && ee.escena && ee.escena.tipo === 'huelga' && ee.escena.actores.length === 4 && ee.invitados.length === 3, ee.escena);
    ee = await hastaE(emi, x => x.escena.llegaron, 6000);
    comprobar('…llegan a la marcha', !!ee);
    const x0h = (await emi()).maestro.x; await espera(900);
    const mh = (await emi()).maestro;
    comprobar('marchan en círculo (caminando, con los puños arriba)', Math.abs(mh.x - x0h) > 2 && (mh.accion === 'caminar' || mh.gesto === 'sienta'), { x0h, mh });
    const coro = await hastaE(emi, x => x.escena.corosTotal > 0, 5000);
    comprobar('corean («¡hu-el-ga!»)', !!coro, coro && coro.escena);
    await capE(EM.win, 'escena-1-huelga');
    await EM.js('Duendes.sonido(true)');
    const nh = (await emi()).notas;
    comprobar('con sonido, el coro suena bajito de vez en cuando', !!(await hastaE(emi, x => x.notas > nh, 9000)));
    await EM.js('Duendes.sonido(false)');
    comprobar('mascotaEstado(e, { texto }) cambia la pancarta', await EM.js(`return Duendes.mascotaEstado('huelga', { texto: '¡PAGUEN LOS TOKENS!' })`) && (await emi()).escena.texto === '¡PAGUEN LOS TOKENS!');
    await EM.js(`window.__rh = null; Duendes.decir({ texto: 'Estamos en huelga.' }).then(r => window.__rh = r);`);
    comprobar('decir() sigue funcionando en la huelga', !!(await hastaE(emi, x => x.hablando === 'maestro', 3000)) && !!(await hastaE(() => EM.js('return JSON.stringify(window.__rh)').then(JSON.parse), r => r && r.ok, 9000)));
    /* tope */
    await EM.js(`Duendes.mascotaEstado('tope')`);
    ee = await hastaE(emi, x => x.escena.tipo === 'tope' && x.maestro.accion === 'dormir', 6000);
    comprobar('tope: el maestro se duerme bajo su letrero', !!ee && ee.escena.actores.length === 2, ee && ee.escena);
    const alc = await hastaE(emi, x => x.invitados.some(i => i.id === 'coordinador' && i.enEscenaEsp && !i.caminando && /triste|nervioso/.test(i.gesto || '')), 6000);
    comprobar('…y otro sacude una alcancía vacía', !!alc);
    comprobar('…los que no están en esta escena se van', !!(await hastaE(emi, x => x.invitados.length === 1, 8000)));
    await capE(EM.win, 'escena-2-tope');
    /* sin-clave */
    await EM.js(`Duendes.mascotaEstado('sin-clave')`);
    await hastaE(emi, x => x.escena.llegaron, 5000);
    const xs = new Set(); for (let i = 0; i < 12; i++) { xs.add((await emi()).maestro.x); await espera(120); }
    comprobar('sin-clave: el maestro busca la llave con su linterna (va y viene)', xs.size >= 3 && (await emi()).escena.tipo === 'sin-clave', [...xs]);
    await capE(EM.win, 'escena-3-sin-clave');
    /* sin-red */
    await EM.js(`Duendes.mascotaEstado('sin-red')`);
    const sub = await hastaE(emi, x => x.maestro.alzado >= 29, 7000);
    comprobar('sin-red: el maestro sube a la escalera a arreglar el cable', !!sub && sub.escena.tipo === 'sin-red', await emi());
    await capE(EM.win, 'escena-4-sin-red');
    /* saturado */
    await EM.js(`Duendes.mascotaEstado('saturado')`);
    const fila = await hastaE(emi, x => x.escena.llegaron && x.escena.actores.length === 3, 7000);
    comprobar('saturado: hacen fila (el maestro y dos más) con su turno', !!fila && fila.escena.turno === 17 && fila.maestro.alzado === 0, fila && fila.escena);
    await capE(EM.win, 'escena-5-saturado');
    /* de vuelta a lo normal */
    comprobar('otro estado quita la escena; los invitados se van', await EM.js(`return Duendes.mascotaEstado('quieto')`) && (await emi()).escena === null && !!(await hastaE(emi, x => x.invitados.length === 0, 9000)));
    comprobar('un estado que no existe sigue sin hacer nada', await EM.js(`return Duendes.mascotaEstado('vacaciones')`) === false);
    /* «reducir movimiento»: la escena quieta con sus letreros */
    EM.win.webContents.debugger.attach('1.3');
    await EM.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await EM.js(`Duendes.mascotaEstado('huelga')`);
    await espera(1200);
    const q1 = await emi(); await espera(1500); const q2 = await emi();
    comprobar('reducir movimiento: la huelga quieta (nadie marcha ni corea)', q1.escena.reducir && q1.invitados.every((i, k) => i.x === q2.invitados[k].x) && q1.maestro.x === q2.maestro.x && q2.escena.corosTotal === 0 && q2.invitados.every(i => !i.caminando), { q1: q1.invitados.map(i => i.x), q2: q2.invitados.map(i => i.x) });
    await capE(EM.win, 'escena-6-reducir');
    await EM.js(`Duendes.mascotaEstado('quieto')`);
    await EM.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    EM.win.webContents.debugger.detach();
    comprobar('fuera del taller, escena() no hace nada', await EM.js(`return Duendes.escena('huelga')`) === false);
    EM.win.destroy();

    const ET = await abrir('embebido=1&taller=1&tema=dark', errE);
    const eti = () => ET.js('return JSON.stringify(Duendes.tallerInfo())').then(JSON.parse);
    await ET.js(`Duendes.taller(${JSON.stringify({ actores: EQUIPO })})`);
    await espera(200);
    comprobar('escena(\'huelga\') en el taller: el maestro y tres del equipo', await ET.js(`return Duendes.escena('huelga')`) === true
      && (await eti()).escena.actores.join() === 'maestro,lector,escritor,coordinador', (await eti()).escena);
    const th = await hastaE(eti, x => x.escena.llegaron, 8000);
    comprobar('…marchan; el que no está en la marcha, de brazos cruzados', !!th && th.actores.find(a => a.id === 'formateador').gesto === 'sienta', th && th.actores.map(a => [a.id, a.accion, a.gesto]));
    await ET.js(`Duendes.tallerEvento({ quien: 'lector', accion: 'revisar' })`);
    await espera(300);
    comprobar('un evento no saca a nadie de la huelga', (await eti()).actores.find(a => a.id === 'lector').enEscena);
    await espera(2500);
    await capE(ET.win, 'escena-7-taller-huelga');
    await ET.js(`Duendes.escena('sin-red')`);
    comprobar('escena(\'sin-red\') en el taller: sube a la escalera', !!(await hastaE(eti, x => x.escena.tipo === 'sin-red' && x.actores.find(a => a.id === 'maestro').alzado >= 14, 8000)));
    await capE(ET.win, 'escena-8-taller-sin-red');
    for (const e of ['tope', 'sin-clave', 'saturado', 'error']) { await ET.js(`Duendes.escena('${e}')`); await espera(700); }
    comprobar('las demás escenas en el taller (tope, sin-clave, saturado, error)', (await eti()).escena.tipo === 'error');
    comprobar('escena(null): cada uno a su puesto', await ET.js('return Duendes.escena(null)') === true && !!(await hastaE(eti, x => !x.escena && x.actores.every(a => !a.caminando && a.alzado === 0 && Math.hypot(a.x - a.casa[0], a.y - a.casa[1]) < 2), 12000)), await eti());
    comprobar('una escena que no existe no hace nada', await ET.js(`return Duendes.escena('fiesta')`) === false);
    comprobar('sin errores de consola en las escenas', errE.length === 0, errE);
    ET.win.destroy();
  } catch (e) { fallo = e; console.error(e); }
  const malos = resultados.filter(r => !r.ok).length;
  console.log(`\n${resultados.length - malos} de ${resultados.length} comprobaciones bien${malos ? `, ${malos} mal` : ''}.`);
  app.exit(fallo || malos ? 1 : 0);
});
