# Guiones · Editor — guía para trabajar en este repositorio

Editor de guiones tipo Notion/Scrivener en **JavaScript puro, sin build ni dependencias**.
Se ejecuta abriendo `index.html` (o `node serve.js 5173`) y está preparado para Electron (`npm start`,
que abre `claquedraw.html`; con npm 11 hay que correr `node node_modules/electron/install.js` tras
`npm install` porque los scripts de instalación vienen bloqueados). `npm run dist` deja el `.dmg` en
`dist/`; `electron/main.js` recibe los `.cld` del Finder (`open-file`) y los manda al renderer por
`abrir-ruta`.
La interfaz está en español; los comentarios del código también.

## Arquitectura

- Todo cuelga del espacio global `window.Ed`. Cada módulo es un IIFE `(function (Ed) { ... })(window.Ed)`
  cargado por `<script>` en `index.html`, en este orden: `utils`, `markdown`, `page`, `editor`, `table`,
  `screenplay`, `database`, `blocks`, `slash`, `characters`, `vendor/typo`, `dict/es`, `dict/en`, `spell`.
- `js/editor.js` es el núcleo: comandos de formato (execCommand), cinta, barra inferior, menús,
  buscar/reemplazar, autoguardado y **la API de documento** `Ed.document` (`get()`, `set(doc)`,
  `isDirty()`, `onChange(fn)`). Un módulo externo (p. ej. el gestor de documentos) debe usar solo esa API.
- Estado de la vista (ancho de hoja, tamaño, typewriter, modo guion) en `js/page.js` (`Ed.page.state`).
- Los ganchos entre módulos van por `Ed.*`: `Ed.afterChange()`, `Ed.updateToolbar()`, `Ed.focusEditor()`,
  `Ed.cmd(name, value)`, `Ed.getRange()`, `Ed.closestBlock()`, `Ed.selectedBlocks()`.
- El documento es el `innerHTML` de `#editor` (contenteditable). Bloques especiales:
  - elementos de guion: `<p class="sp-scene|sp-action|sp-character|sp-paren|sp-dialogue|sp-transition|sp-shot">`;
  - personajes: `p.sp-character[data-ch]` con `--chl`/`--chd` (colores), registro en `Ed.characters`;
    el color se asigna en orden de la paleta y se cambia a mano con el clic derecho sobre el bloque
    (`Ed.characters.ctxHtml` / `setColor`, sección `#ctxChar` del menú contextual: se aplica a todas
    las menciones y viaja en `characters` del documento);
  - bases de datos: `<div class="db" contenteditable="false" data-db="{json}">` (la interfaz se renderiza
    desde `data-db`; `Ed.db.stripped(editor)` devuelve el HTML sin interfaz para guardar);
  - tablas normales: `<table>` con anchos inline por celda.
- Formato: se guarda como HTML. `Ed.md.toHtml` / `Ed.md.fromHtml` convierten Markdown (con extensiones
  `==resaltado==` y convención Fountain para el guion), pensado para importar/exportar más adelante.

## Reglas que cuestan descubrir

- **Chrome no permite `execCommand` dentro de un evento `input` generado por otro `execCommand`**:
  los atajos Markdown se difieren con `setTimeout(…, 0)` (ver `editor.js`, listener de `input`).
- Las listas y citas se construyen en el DOM (`Ed.md.toList/toQuote`); `insertUnorderedList` sobre un
  párrafo vacío anida la lista dentro del `<p>`.
- El evento `close` de `<dialog>` no se dispara en algunos entornos embebidos: `Ed.dialog` resuelve con
  submit/Cancelar/Escape.
- Al escribir archivos JS, no dejar caracteres invisibles literales (ZWSP U+200B, NBSP, marcas U+0300):
  usar secuencias `​`, ` `, `̀-ͯ`. `perl -CSD -pi -e 's/\x{200B}/\\u200B/g'` los normaliza.
- Los eventos de puntero sintéticos rompen `setPointerCapture`: siempre va en `try/catch`.
- El corrector (`spell.js`) usa la API CSS Highlight (no toca el DOM); ignora `pre, code, a, .sp-character`
  y la interfaz de las bases de datos.
- Interlineado, sangría y operaciones de bloques modifican el DOM fuera de `execCommand` y no entran en
  Ctrl+Z (limitación conocida).

## Diseño

Tokens al inicio de `css/editor.css` (modo claro y `html[data-theme="dark"]`): Patrick Hand en la
interfaz, Courier Prime en el documento, bordes a tinta, sombras planas, chips pastel. La paleta de 16
tonos (par claro/oscuro) está duplicada en `editor.js` (`TONES`) y `characters.js` (`PALETTE`).

## Verificación

Con `node serve.js 5173` y el panel de navegador se prueban las funciones por JavaScript; las simulaciones
de tecleo deben ser carácter a carácter con `document.execCommand('insertText', false, ch)` y esperas de
unos ms entre pulsaciones, porque los atajos Markdown se procesan de forma diferida.
Al terminar pruebas: limpiar `localStorage` (`guiones.editor.doc`) y dejar el editor vacío.

## Tramas (tablero de estructura)

Segunda herramienta del repositorio: `tramas.html` + `css/tramas.css` + `js/tramas/`. No comparte
código con el editor (espacio global propio `window.Tramas`), solo las fuentes y el lenguaje visual.
La especificación de dominio está en `docs/tramas/` (spec y mecanismo) y manda sobre cualquier duda.

- `js/tramas/modelo.js`: **modelo puro, sin DOM**. Cinco colecciones planas (`actos`, `lineas`,
  `puntos`, `saltos`, `notas`), todas las invariantes y los dos cálculos derivados (`presencia()`,
  `recorrido()`). Cada operación devuelve `{ ok, aviso?, … }`; la interfaz solo enseña el aviso.
  Se carga en Node: `npm test` corre `test/tramas.test.js` (criterios de aceptación de la spec).
- `js/tramas/tablero.js`: la única capa que conoce píxeles (celda × escala). Reconstruye el DOM
  entero en cada `render()`; **un clic seco nunca redibuja** (solo cambia clases) para que el doble
  clic siga cayendo en el mismo elemento. Los arrastres no registran historial hasta soltar.
- `js/tramas/app.js`: autoguardado en `localStorage` (`guiones.tramas.doc`), abrir/guardar `.json`
  (usa `window.editorAPI` de Electron si existe) y `Tramas.document` (`get/set/isDirty/onChange`),
  misma forma que `Ed.document`.
- Reglas firmes de la spec: hay exactamente una trama principal, que no se elimina ni cambia de tipo
  y no se puede promover otra; un nodo pertenece como mucho a un salto; los dos extremos de un salto
  comparten celda; un cuadro nunca toca una trama alternativa (se convierte en rombo); borrar un
  salto borra sus dos nodos; una nota va entre dos nodos consecutivos y solo cabe una por tramo.
  **Una celda es de un solo nodo** (Leo, 13-09-2026): `nuevoPunto`, `moverPunto` y `moverSalto`
  rechazan caer sobre otro nodo (`ocupante()`), y `crearSalto` no convierte un nodo existente en
  cuadro o rombo: el otro extremo necesita la celda libre. La vista previa del arrastre del «+» tampoco
  enciende una pista ocupada; al soltar un nodo sobre otro el tablero avisa y lo devuelve. El arrastre
  del trazo de un salto (`mov`) es solo visual hasta soltar: desplaza los dos extremos (`transform`) y
  el grupo `<g data-salto-g>` del SVG, y `moverSalto` se llama en `pointerup`; así se ve el intento
  aunque la celda esté ocupada, y solo entonces avisa y vuelve.
- `#celda` (el «+» de la celda) va con `z-index: 3`, por encima de la cadena resaltada (`.cadena.ruta`,
  z 2): con un nodo seleccionado, si no, el clic caía en la cadena y no se podía crear nada entre dos
  nodos. `zonaUtil()` (desde dónde se puede soltar) es el borde derecho visible de la columna de
  tramas, no `GUTTER`: así funciona con la columna contraída por CSS.
- El ancho de la columna de tramas es `T.tablero.gutter(px)` (110–420), que escribe `--gutter` en el
  `<html>`; `css/tramas.css` lo lee en `.label` y `.axis .gutter`. tramas.html no lo cambia (190).
- Integración futura (gestor de documentos): solo a través de `Tramas.document`; el autoguardado local
  y los botones Nuevo/Abrir/Guardar son provisionales y los sustituirá el gestor. El guardado lleva
  `formato: 1`; un guardado sin esa marca se descarta al arrancar (era el tablero de ejemplo).
- `T.inicial()` es el tablero de partida (3 actos, Principal con «Inicio», Secundaria); `T.ejemplo()` es
  el de muestra del prototipo y solo lo usan las pruebas.
- `modelo.hilo()` devuelve los nodos en el orden en que la historia los visita (recorriendo `flujo()`),
  y `vecinos(id)` los anterior/siguiente para las flechas del panel (por el hilo, o por la propia
  trama si el nodo no está en él).
- Colores: el tablero nunca pinta hex; usa `var(--t-<color>)` (tramas y nodos), `var(--f-<color>)`
  (fondos de acto) y `var(--escena-trazo)` / `var(--rombo-trazo)` (saltos). Los tokens claros y oscuros
  viven en `css/tramas.css` (`:root` y `html[data-theme="dark"]`); el SVG los recibe por `style`, no por
  atributo (los atributos de presentación no aceptan `var()`). Solo el globo resuelve el valor real
  (`getComputedStyle`) para elegir el color del texto. El tema se decide en el `<head>` de `tramas.html`
  (clave `guiones.tramas.theme`, si no la del editor, si no la del sistema).
- Al terminar pruebas en el navegador: limpiar `localStorage` (`guiones.tramas.doc`).

## Claquedraw (esquema de pasos + editor de texto)

Tercera página: `claquedraw.html` + `css/claquedraw.css` + `js/claquedraw/`. Un guion = un esquema de
pasos (tablero de Tramas) más una nota del editor de texto por nodo, con dos vistas alternables:
**Esquema** (el tablero) y **Texto** (el editor). **No toca el editor ni `js/tramas/`**: carga
`js/tramas/modelo.js` y `js/tramas/tablero.js` tal cual (no `js/tramas/app.js`), `css/tramas.css` antes
que el suyo, y mete `index.html` en un `<iframe>`. `tramas.html` e `index.html` siguen funcionando solos.
La lista lateral de guiones del prototipo se quitó (Leo, 13-09-2026); queda un solo guion abierto con
Nuevo / Abrir… / Guardar… en la cabecera.

- `js/claquedraw/biblioteca.js`: **modelo puro, sin DOM** (`Claquedraw.Biblioteca`): guiones
  `{ id, nombre, fijado, creado, modificado, datos, notas, notaActual }` con `activo`. Hoy la página
  solo usa uno (el activo); las operaciones de lista (fijar, mover, colocar, lista) quedan probadas por
  si vuelve un gestor. Cada operación devuelve `{ ok, aviso? }`. `npm test` corre `test/claquedraw.test.js`.
- `js/claquedraw/app.js`: un solo tablero montado; `volcar()` escribe el tablero en el guion
  (`abiertoId`) y persiste toda la biblioteca en `localStorage` (`guiones.claquedraw.biblioteca`; vista
  en `guiones.claquedraw.vista`). Nuevo y Abrir… **reemplazan** el guion (el anterior sale de la
  biblioteca). Primer arranque: hereda `guiones.tramas.doc` si existe (sin borrarlo).
- **Archivos `.cld`** (JSON: tablero con `formato: 1`, `nombre` y `notas`; `tramas.html` los abre igual).
  «Guardar como…» (`Ctrl+Shift+S`) y «Abrir…» dejan el guion **vinculado** al archivo y desde entonces
  cada `persistir()` programa `escribirArchivo()` (1 s) que escribe solo si `serializar(g)` cambió
  respecto a `ultimoEscrito` (`vincular()` lo pone a null: un archivo recién elegido está vacío aunque
  el contenido no haya cambiado; olvidarlo dejaba `.cld` de 0 bytes al «Guardar como» dos veces). El
  nombre propuesto en el diálogo es siempre «Esquema.cld». `escribirHandle()` pide permiso si hace
  falta, escribe y **relee el archivo para comprobarlo**: en navegadores embebidos (el panel de Claude,
  por ejemplo) el sistema deja elegir el archivo pero la escritura no llega, sin error; en ese caso
  «Guardar como…» desvincula, descarga una copia y lo dice. Si al recargar no se recupera el handle
  de IndexedDB, también se avisa. «Guardar» (`Ctrl+S`) escribe ya o pide archivo. El vínculo vive en
  `vista.archivo` ({ nombre, ruta }) y, en el navegador, el `FileSystemFileHandle` va en IndexedDB
  (`guiones.claquedraw` / `kv` / `archivo`); al recargar, `retomarArchivo()` lo recupera y si el permiso
  es `prompt` el indicador dice «reconectar» y el primer «Guardar» (gesto de usuario) pide permiso. En
  Electron el vínculo es la ruta y usa `editorAPI.writeFile/readFile` (IPC `file:write` / `file:read`).
  Sin File System Access ni Electron: descarga, sin autoguardado al archivo. «Nuevo» desvincula. El
  indicador `#estadoGuardado` (botón, clic = Guardar) enseña «Solo en este navegador», «✓ nombre.cld»,
  «● nombre.cld» (cambios sin escribir) o «● nombre.cld · reconectar».
- `js/claquedraw/texto.js`: la vista **Texto**. Encima de la cinta del editor va **la tira de una
  trama**: sus nodos dibujados como en el tablero (mismos tokens: `.dot`, cuadro beige, rombo morado,
  cortado, fuera de escena) con el título encima, y a la izquierda el chip de la trama. **Cada nodo es
  una nota**; los extremos de un salto llevan su título pero no tienen nota: pulsarlos pasa la tira a la
  trama del otro extremo, que queda resaltado (`.pos`) y permite volver. La nota abierta no cambia al
  saltar. `‹ ›` de la barra de título del editor y `Ctrl/Cmd+Alt+↑/↓` recorren las notas de la trama.
  Al pasar el ratón por un nodo, el globo `#tip` del tablero (el mismo elemento) enseña debajo el
  título y la descripción del esquema. El tema va en los dos sentidos: el botón de la cabecera cambia el
  del marco, y un `MutationObserver` sobre `html[data-theme]` del marco avisa a la página si el editor
  lo cambió desde su barra inferior (`o.alTema`).
  Habla con el editor por `Ed.document` del marco; al cargar el marco parchea `Storage.prototype` de esa
  ventana para que el autoguardado del editor (`guiones.editor.doc`) vaya a
  `guiones.claquedraw.editor.doc` y no pise el documento de `index.html` a solas. El título de la nota
  es el título del nodo (escribir en `#docTitle` renombra el nodo; se escucha aparte porque el editor no
  avisa por `onChange` de cambios de título). Las notas viven en el guion
  (`biblioteca.guardarNota`, `notas[puntoId] = { title, html, characters }`, `notaActual`).
- Ganchos con el tablero sin tocar `tablero.js`: el botón «✎ Escribir la nota» se añade al panel con un
  `MutationObserver` (el panel se reconstruye con innerHTML); seleccionar un nodo desde fuera se hace
  con un botón efímero `[data-hilo=id]` al que se le hace clic (el tablero lo trata como sus flechas
  ‹ ›). Renombrar desde el editor no entra en el Deshacer del tablero.
- Vistas: `vista.modo` (`esquema`/`texto`, se recuerda), `body.vista-texto`, botones `[data-vista]` y
  `Ctrl/Cmd+Shift+G` (también dentro del editor). Los controles solo del tablero llevan `.solo-esquema`.
  Los atajos dentro del marco van en fase de captura y no pueden repetir los del editor
  (`Ctrl+Shift+E` centra, `L` alinea, `X` tacha, `H` resalta, `7/8` listas, `V` pega plano…).
- Columna de tramas: el asa `#asaTramas` (sobre el borde derecho, `left: calc(var(--gutter) - 4px)`)
  cambia `T.tablero.gutter()` al arrastrar y se guarda en `vista.gutter`; doble clic vuelve a 190.
- Sobre la hoja va **la línea de tiempo o la cinta del editor, una de las dos** (`vista.cabecera`:
  `tira` | `cinta`, `Ctrl/Cmd+Shift+K`). Con la tira, texto.js pone `html.sin-cinta` en el marco y una
  regla inyectada esconde `.topbar .ribbon` (la barra de título con ‹ › y el nombre sigue); con la
  cinta, `#texto.sin-tira` esconde la tira. El botón para volver a la tira (`#cdTira`) se monta desde
  fuera en la cinta del editor, junto a su pin. El trazo de un cuadro o rombo sale
  hacia donde está la otra trama en el tablero (`.arriba` / `.abajo`, por el índice de la trama en
  `lineas`); con trazo hacia arriba el título va debajo del nodo. La tira centra el nodo resaltado con
  `scrollLeft`, nunca con `scrollIntoView` (movería la página con la tira escondida).
- Columna de tramas contraíble (`#plegarTramas`, `vista.tramasPlegadas`, `body.tramas-plegadas`): solo
  CSS, el lienzo se desplaza 146px a la izquierda y las etiquetas pegajosas se quedan con el chip de
  color; la geometría de `tablero.js` no cambia (su `zonaUtil()` mira el borde visible de la columna,
  así que soltar y crear funcionan también en las celdas que quedan bajo la columna ancha).
- Cuidado con `css/tramas.css`: estila `aside`, `.sep`, `.label`, `.btn`, `.chip`, `.ltipo`… La tira
  reutiliza `.chip` y `.ltipo`; todo lo demás lleva prefijo `hilo-`.
- Al terminar pruebas en el navegador: dejar `localStorage` como estaba (`guiones.claquedraw.biblioteca`,
  `guiones.claquedraw.vista`, `guiones.claquedraw.editor.doc`, y `guiones.editor.theme` si se tocó el tema
  desde el editor) y borrar la base IndexedDB `guiones.claquedraw` si se vinculó un archivo; los
  selectores de archivo se prueban sustituyendo `window.showSaveFilePicker` / `showOpenFilePicker` por
  un handle falso; **`beforeunload` vuelve a guardar la
  biblioteca**, así que restaurarla escribiendo localStorage y recargando no sirve (hay que cargarla
  por `Claquedraw.biblioteca.cargar` + `Claquedraw.app.abrir`). Servidor: `.claude/launch.json` tiene
  `claquedraw-web` en el 5174. No simular clics en nodos del tablero con `PointerEvent` sin
  coordenadas: el tablero los toma por arrastres y mueve nodos. Las capturas del panel llegan con
  retraso respecto a la acción: comprobar el estado por JavaScript y capturar después de esperar.
