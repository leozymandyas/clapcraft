/* Capturas del estado actual de ClapCraft para docs/diseno/clapcraft-componentes.html.
   Se corre con:  ./node_modules/.bin/electron docs/diseno/capturar.js
   Abre claquedraw.html en una ventana de 1280×820 con datos de muestra (sin tocar los guardados:
   el almacenamiento local queda anulado), pasa por las vistas en claro y oscuro y escribe los PNG en
   docs/diseno/img/. No forma parte de la aplicación ni del instalador. */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..', '..');
const SALIDA = path.join(__dirname, 'img');
const espera = ms => new Promise(r => setTimeout(r, ms));

app.setPath('userData', path.join(app.getPath('temp'), 'clapcraft-capturas'));   // aparte de la app real
app.whenReady().then(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const win = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { preload: path.join(RAIZ, 'electron', 'preload.js'), contextIsolation: true } });
  const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
  const foto = async nombre => { await espera(500); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(SALIDA, nombre + '.png'), img.toPNG()); console.log('·', nombre); };

  await win.loadFile(path.join(RAIZ, 'claquedraw.html'));
  await espera(800);
  /* datos de muestra: el tablero de ejemplo de Tramas, un contenedor con segmentos y notas, personajes */
  await js(`
    Storage.prototype.setItem = function () {};
    document.documentElement.dataset.theme = 'light';
    Tramas.tablero.cargar(Tramas.ejemplo());
    const d = Claquedraw.gestor.documentos(); const g = d.global();
    const inv = d.crearContenedor('Investigación').contenedor;
    const lug = d.crearEtiqueta(inv.id, 'Lugares', 6).etiqueta, tono = d.crearEtiqueta(inv.id, 'Tono', 4).etiqueta;
    const n1 = d.crearNota(inv.id, lug.id, 'La cafetería del puerto').nota, n2 = d.crearNota(inv.id, lug.id, 'El faro').nota;
    d.crearNota(inv.id, tono.id, 'Referencias de tono'); d.crearNota(inv.id, null, 'Ideas sueltas');
    d.guardarNota(n1.id, { title: n1.titulo, html: '<p class="sp-scene">INT. CAFETERÍA DEL PUERTO – DÍA</p><p class="sp-character" data-ch="0">ANA</p><p class="sp-dialogue">No pensaba volver.</p>', characters: { ANA: { name: 'ANA', color: 0 }, BETO: { name: 'BETO', color: 5 } } });
    const gl = d.crearEtiqueta(g.id, 'Estructura', 0).etiqueta; d.crearNota(g.id, gl.id, 'Sinopsis'); d.crearNota(g.id, gl.id, 'Escaleta'); d.crearNota(g.id, null, 'Notas de producción');
    d.crearEsquema(inv.id, Tramas.inicial(), 'Flashbacks');
    Claquedraw.biblioteca.marcar(Claquedraw.biblioteca.activo().id);
    Claquedraw.app.guardar && 0;
    window.__p = d.sincronizarPersonajes(g.id, [{ nombre: 'ANA', color: 0 }, { nombre: 'BETO', color: 5 }]);
    d.sincronizarPersonajes(inv.id, [{ nombre: 'ANA', color: 0 }, { nombre: 'BETO', color: 5 }]);
    const ana = d.etiquetasDe(inv.id, 'personajes')[0]; d.crearNota(inv.id, ana.id, 'Ficha de Ana');
    Claquedraw.gestor.render();
  `);
  await foto('01-esquema-claro');
  await js(`document.documentElement.dataset.theme = 'dark'; Claquedraw.gestor.render();`);
  await foto('02-esquema-oscuro');
  await js(`document.documentElement.dataset.theme = 'light';`);
  /* texto: la nota del primer nodo con la tira encima */
  await js(`const p = Tramas.tablero.seleccion; const id = Claquedraw.gestor.documentos() && document.querySelector('#board .pt') && document.querySelector('#board .pt').dataset.punto; document.querySelector('#board .pt').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));`);
  await espera(900);
  await js(`const E = document.getElementById('editorMarco').contentWindow.Ed; E.document.set({ title: E.document.get().title, html: '<p class="sp-scene">INT. CAFETERÍA DEL PUERTO – DÍA</p><p class="sp-action">Ana entra sacudiéndose la lluvia. Beto no levanta la vista del periódico.</p><p class="sp-character" data-ch="0" style="--chl:#DFE8FF;--chd:#26417F">ANA</p><p class="sp-dialogue">No pensaba volver.</p><p class="sp-character" data-ch="1" style="--chl:#FBDFE6;--chd:#8A2B47">BETO</p><p class="sp-paren">(sin mirarla)</p><p class="sp-dialogue">Nadie piensa volver. Vuelven.</p>', characters: { ANA: { name: 'ANA', color: 0 }, BETO: { name: 'BETO', color: 5 } } });`);
  await foto('03-texto-claro');
  await js(`document.documentElement.dataset.theme = 'dark';`);
  await espera(400);
  await foto('04-texto-oscuro');
  await js(`document.documentElement.dataset.theme = 'light';`);
  /* documentos: el tablero de «Documentos» de Investigación, «Personajes» global y «Documentos guión» */
  const sub = (tipo, quien) => js(`const d = Claquedraw.gestor.documentos(); const c = ${quien === 'global' ? 'd.global()' : "d.datos.contenedores.find(x => !x.global)"}; const eid = ${tipo === 'guion' ? "''" : "''"}; [...document.querySelectorAll('#gdSide .gd-sub')].find(s => s.dataset.sub === '${tipo}/' + c.id + '/' + eid).click();`);
  await sub('documentos', 'inv'); await foto('05-documentos-claro');
  await sub('personajes', 'global'); await foto('06-personajes-global');
  await sub('guion', 'global'); await foto('07-documentos-guion');
  await js(`document.querySelector('#gdMain [data-gd-menu="contenedor"], #gdSide .gd-cont [data-gd-menu="contenedor"]').click();`);
  await foto('08-menu-contextual');
  await js(`document.body.click(); document.documentElement.dataset.theme = 'dark';`);
  await sub('documentos', 'inv'); await foto('09-documentos-oscuro');
  await js(`document.documentElement.dataset.theme = 'light'; document.querySelector('[data-gd-fijar]').click(); document.getElementById('ladoAsa').click();`);
  await foto('10-barra-suelta-asomada');
  /* el editor solo (index.html) */
  await win.loadFile(path.join(RAIZ, 'index.html'));
  await espera(800);
  await js(`Storage.prototype.setItem = function () {}; document.documentElement.dataset.theme = 'light'; Ed.document.set({ title: 'Escena 3', html: '<h1>Escena 3</h1><p class="sp-scene">EXT. MUELLE – NOCHE</p><p class="sp-action">El faro barre el agua.</p><p class="sp-character" data-ch="0" style="--chl:#DFE8FF;--chd:#26417F">ANA</p><p class="sp-dialogue">¿Y si nos quedamos?</p><ul><li>Recordar el plano del principio</li><li>==Comprobar== la fecha del festival</li></ul>', characters: { ANA: { name: 'ANA', color: 0 } } });`);
  await foto('11-editor-solo');
  win.destroy(); app.quit();
}).catch(e => { console.error(e); app.exit(1); });
