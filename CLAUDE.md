# Guiones · Editor — guía para trabajar en este repositorio

Editor de guiones tipo Notion/Scrivener en **JavaScript puro, sin build ni dependencias**.
Se ejecuta abriendo `index.html` (o `node serve.js 5173`) y está preparado para Electron (`npm start`,
que abre `claquedraw.html`; con npm 11 hay que correr `node node_modules/electron/install.js` tras
`npm install` porque los scripts de instalación vienen bloqueados). `npm run dist` deja el `.dmg` en
`dist/`; `electron/main.js` recibe los `.clapcraft` del Finder (`open-file`) y los manda al renderer por
`abrir-ruta`, y monta el menú de la aplicación (Archivo / Edición / Ver): cada opción manda una orden
por el canal `menu` (`editorAPI.onMenu`) que `app.js` resuelve en `ordenes`; con `body.escritorio`
la barra esconde los botones que ya están en el menú. Deshacer/Rehacer del menú no llevan rol nativo:
en Esquema van al historial del tablero y en Texto a `execCommand` del marco. En Electron los
aceleradores del menú se comen la tecla antes de que llegue a la página.
La interfaz está en español; los comentarios del código también.

## Arquitectura

- Todo cuelga del espacio global `window.Ed`. Cada módulo es un IIFE `(function (Ed) { ... })(window.Ed)`
  cargado por `<script>` en `index.html`, en este orden: `utils`, `markdown`, `page`, `editor`, `table`,
  `screenplay`, `database`, `blocks`, `paginas`, `slash`, `characters`, `vendor/typo`, `dict/es`, `dict/en`, `spell`.
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
    las menciones y viaja en `characters` del documento); el bloque de personaje va centrado y
    `C.refresh()` poda del registro los nombres que ya no están en ningún bloque (una errata que llegó a
    registrarse al salir del bloque desaparece al corregirla);
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
  submit/Cancelar/Escape. En el panel de navegador llega **tarde**: el de una apertura anterior caía sobre la
  siguiente y la cerraba (`pedirNombre` del gestor lo ignora si el diálogo sigue abierto).
- Al escribir archivos JS, no dejar caracteres invisibles literales (ZWSP U+200B, NBSP, marcas U+0300):
  usar secuencias `​`, ` `, `̀-ͯ`. `perl -CSD -pi -e 's/\x{200B}/\\u200B/g'` los normaliza.
- Los eventos de puntero sintéticos rompen `setPointerCapture`: siempre va en `try/catch`.
- El corrector (`spell.js`) usa la API CSS Highlight (no toca el DOM); ignora `pre, code, a, .sp-character`
  y la interfaz de las bases de datos.
- Interlineado, sangría y operaciones de bloques modifican el DOM fuera de `execCommand` y no entran en
  Ctrl+Z (limitación conocida).
- **Fusiones y spans de estilo** (14-09-2026): al unir dos bloques distintos (Retroceso al principio, Supr al
  final, escribir o borrar sobre una selección de varios) y en `insertHTML`/`insertText`/`delete` por
  `execCommand`, Chrome envolvía el texto en `<span style="background-color; color; font-size">` con los
  estilos calculados de su bloque de origen (un diálogo unido a su personaje salía con fondo blanco, también en
  oscuro; los atajos `` `código` `` y `==resaltado==` dejaban `font-size` fijo). Mientras dura la edición,
  `#editor.fusionando` (editor.css) iguala los estilos calculados y Chrome no añade nada: `esFusion()` en
  `beforeinput` para las del teclado y `Ed.cmd` para las de `execCommand` (salvo si lo insertado trae su
  `font-size`, el control de tamaño). El formato propio y el Deshacer se conservan. Quedan `<span>` sin
  atributos, inofensivos.
- **Pegar**: `Ed.sanitizeHtml` quita fuente, tamaño, interlineado, mayúsculas, márgenes y colores neutros
  (negro, gris, blanco: en oscuro el texto no se veía); se quedan los colores con tono y `--chl/--chd`.
- **Tab en un elemento de guion cambia de elemento** (Mayús+Tab al anterior: escena → acción → personaje →
  paréntico → diálogo → transición → toma), sin mover el cursor; antes sangraba y deformaba el formato. En
  texto normal, listas y tablas, Tab sigue igual.
- **Reemplazar «Todo» se deshace de una vez**: se reemplaza en una copia y entra con un solo `insertHTML`
  sobre todo el contenido; si una coincidencia cruza nodos de texto o hay bases de datos, una a una.
- El corrector no marca los nombres de personajes ni las palabras de un nombre (`Ed.characters.has` mira el
  registro y el elenco del guion). La B de la cinta no se enciende por la negrita de estilo de un encabezado.
- El asa de bloque se recoloca cuando el documento cambia de alto (`ResizeObserver`) y tras cada cálculo de
  páginas (`Ed.blocks.reubicar`): se quedaba a una línea del bloque.
- En ClapCraft con la ventana estrecha la cinta y la barra inferior pasan a una segunda fila (antes cortaban
  alineación, listas y Ortografía) y el panel de buscar se coloca bajo la cinta; la casilla «Aa» ya no mide 180 px.
- **Páginas** (`js/paginas.js`, Leo 14-09-2026: saber cuántas hojas lleva y cuánto dura; 1 página ≈ 1 min).
  **Se cuenta en renglones de página real** (revisión del 14-09-2026: con la hoja estrecha salía el doble):
  cada bloque suma sus renglones de texto divididos por la escala 576 px / ancho de la columna (un renglón
  sigue siendo uno), las tablas, bases de datos e imágenes su alto, y un renglón en blanco si hay margen con el
  anterior; la página son 54 renglones y la hoja en pantalla mide al menos 54 líneas y crece si hace falta. El
  número de páginas ya no cambia con el ancho. Lo que sigue describe la parte visual:
  la hoja sigue siendo continua, pero se ve partida en hojas. No toca el DOM del documento ni el Deshacer:
  mide `offsetTop` de los bloques (unidades sin zoom), y al bloque que no cabe le da margen con una hoja de
  estilos propia (`#pagEstilo`: `#editor > :nth-child(n) { margin-top }` = hueco natural + lo que falta
  hasta la hoja siguiente) y `min-height` a la hoja para completar la última; los huecos entre hojas son
  `.pag-salto` en `.pag-capa` dentro de `#pageWrap`, y cada hoja lleva su número (`.pag-num`) en la
  esquina inferior derecha, desde la primera, que existe entera aunque el documento esté vacío.
  Probado con tablas y bases de datos: se empujan enteras como cualquier bloque; una tabla más alta
  que una página se corta con la raya. Página = 54 líneas × interlineado real de
  la hoja (Carta, Courier 12 pt); encabezado de escena, personaje y paréntico pasan de hoja con lo que les
  sigue; un bloque más alto que una página se corta con una raya (`.dentro`). Recalcula con
  `MutationObserver` y cuando cambia el ancho (`ResizeObserver`), con `setTimeout` (no rAF: el marco de
  ClapCraft se precarga escondido y ahí no hay frames; sin ancho no calcula). Contador `#fbPaginas` en la
  barra inferior («N páginas · ≈ N min»). **Desplazamiento estable al escribir**: al medir solo se quitan
  los márgenes (`#pagEstilo`); el `min-height` va en otra hoja (`#pagAlto`) y se queda puesto, se devuelve
  el `scrollTop` del workspace y `.workspace` lleva `overflow-anchor: none` (si no, la hoja encogía, el
  navegador recortaba o «anclaba» el desplazamiento y la vista subía y bajaba). `page.apply` no toca el
  ancho si el workspace mide 0 (marco escondido; un `resize` en ese estado dejaba la hoja a 0 px) y un
  `ResizeObserver` del workspace lo reaplica al verse.
- El asa de bloque (`js/blocks.js`, `+ ⋮⋮`) va sin fondo y **sigue a la línea donde está el cursor**
  (`selectionchange`), no al ratón; se queda a la vista. El primer bloque de la hoja no lleva margen
  superior y los encabezados (`sp-scene` 12 pt, `h1–h3`) tienen poco: el margen se veía como un salto de
  línea imborrable. En ClapCraft la hoja arranca con 26 px de lienzo y 1,1 cm de relleno, también con
  typewriter.

## Diseño

Tokens al inicio de `css/editor.css` (modo claro y `html[data-theme="dark"]`): Patrick Hand en la
interfaz, Courier Prime en el documento, bordes a tinta, sombras planas, chips pastel. La paleta de 16
tonos (par claro/oscuro) está duplicada en `editor.js` (`TONES`) y `characters.js` (`PALETTE`).
**Encima va la piel de ClapCraft**: `css/clapcraft.css` (última en `claquedraw.html`) y
`css/clapcraft-editor.css` (última en `index.html`). Desde el 13-09-2026 aplican el **rediseño que
entregó Leo** (`docs/diseno/rediseno/*.dc.html`, artboards de Claude Design; el brief que se le pidió
está en `docs/diseno/clapcraft-componentes.html`, con capturas en `docs/diseno/img/` que regenera
`./node_modules/.bin/electron docs/diseno/capturar.js`): **IBM Plex Sans** (400/500/600) en la
interfaz y **IBM Plex Mono** (400/500) en rótulos (mono 10 px, mayúsculas, tracking .09em),
empaquetadas en `fonts/` (Patrick Hand queda solo en las hojas base); **tres planos de gris**
(`--panel` barra e inspector, `--lienzo` tablero, `--papel` tarjetas y hoja); **un solo acento
lavanda** del logo, bajado de croma para leerse (`--foco` #6B5B8E claro / #BFAED8 oscuro, con
`--foco-suave`, `--sel-bg`, `--drop-bg`, `--foco-halo/linea/banda`); bordes de 1 px (`--borde`,
`--borde-fuerte`), radios 4 px (controles) y 6 px (tarjetas, menús, diálogos), sombras `--sombra`
/`--sombra-alta`/`--sombra-modal`; tramas y fondos de acto recalibrados (`--t-*`, `--f-*`); etiquetas
de tipo en el árbol (`.gd-chip--cont/esquema/sub` con `--p-grafito/violeta/azul-*`) en lugar de
iconos; un **sprite SVG de iconos** en `claquedraw.html` (`#ic-undo`, `ic-more`, `ic-plus`, `ic-chev-*`,
`ic-trash`, `ic-drag`, `ic-edit`, `ic-filter`, `ic-sort`, `ic-check`, `ic-arr-*`, `ic-panel`,
`ic-search`, `ic-close`, `ic-sun`…; el gestor los pinta con `ic(nombre, tam)`); `.icono` para botones
de 28 px sin borde; el título `#esquemaChip` de la vista Esquema («CONTENEDOR [Esquema] Nombre», solo rótulo: Leo
no quiere que haga nada al pulsarlo); indicador de guardado con punto lavanda / ✓; pestañas con
punto en vez de asterisco; toast grafito con check; diálogo de creación con ceja mono, título,
campo y tarjetas de tipo (`.dlg-tipo`). Leo eligió el acento morado entre los que ofrecía el diseño.
El documento del editor sigue en Courier Prime y **la marca «ClapCraft» va en Courier New negrita**
(`--marca`), único requisito fijo. Logo nuevo (13-09-2026): `build/logo.svg` → `build/icon.icns`
(icono de la app) e `img/clapcraft.svg` (cabecera). Los estilos base de tramas.css/claquedraw.css/
editor.css siguen ahí: lo nuevo se pone en la piel si es apariencia, en la hoja del módulo si es
estructura. El tablero de tramas (la «Pantalla Esquema») también va en la piel: eje de 27 px con «TRAMAS», actos
en mono con su fondo solo en la franja del eje (`.banda:not(.sel)` transparente), carriles de 80 px,
etiqueta de trama con punto de 8 px + nombre 13/600 + tipo mono, nodos de 11 px con aro del color de
la trama y centro en papel (`.dot::after`; seleccionado relleno de acento con halo), cuadro y rombo de
salto en beige/morado, post-it en `--nota`, «+» de celda cuadrado y panel del nodo en papel con
campos sobre lienzo y «Abrir documento» (`[data-nota-abrir]`) como único botón primario. La tira de la trama (`.hilo`, 92 px sobre `--panel`, bloque de trama de 150 px con punto + nombre +
«PRINCIPAL · N NODOS», nodos de 11 px con aro y centro en papel, trazos de salto discontinuos, pin
en `--foco-suave` pegado a la derecha) y la barra inferior del editor (`.focus-bar`, 36 px sobre
grafito, rótulos mono, pastillas y la encendida en lavanda, `css/clapcraft-editor.css`) también van
en la piel. **Segunda entrega del rediseño** (13-09-2026, `docs/diseno/rediseno-2/`, las capturas
`pasted-*.png` mandan sobre los `.dc.html`): **sin barra superior**. Arriba solo la franja de pestañas
(`.franja`, 38 px; la pestaña activa en `--panel` se funde con el menú) y, en el navegador, a su derecha
el indicador de guardado, el tema y Nuevo/Abrir/Guardar (`.franja-acc`; en Electron van en el menú). La
marca y el logo encabezan el menú: el logo de Leo en dos archivos, `img/clapcraft.svg` (claro) e
`img/clapcraft-oscuro.svg`, dentro de `.logo` (el tema esconde uno u otro). La vista Esquema es la sección
`#esquema`: `.esq-cab` (50 px, «CONTENEDOR [Esquema] Nombre», es `#esquemaChip`, y a la derecha
`#verDocumentos`, solo si el esquema tiene documentos enlazados → `C.gestor.abrirSub`), `.esq-cuerpo`
(tablero, panel y `#sinEsquema`) y `.esq-pie` (42 px sobre
`--bb-bg`: escala horizontal `#zoom` (`T.tablero.zoom`, 1.7) y vertical `#altoFila` (`T.tablero.alto`,
alto de carril: escribe `--fila` y recoloca los cables; de partida el de la hoja, 80), con relleno
`--pct`, `#escalaReset` para volver a las dos de partida (`vista.zoom` / `vista.alto`), y
deshacer/rehacer; su clic no llega al tablero). Sobre la hoja van la línea de tiempo y la cinta del editor, las dos (ver Pantalla Texto). Rediseño con personajes (14-09-2026, `docs/diseno/rediseno-4/`): pantalla Personajes (ver abajo).

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
- **Orden de apilado del tablero en ClapCraft**: `.pt` lleva z 5 (tapa el cable, z 4), así que la columna
  de nombres va con z 7 y el eje con z 8 (`#board .label` / `#board .axis` en la piel). Con los dos en z 5
  los nodos, que van después en el DOM, se veían a través de la columna al desplazar (pasó el 14-09-2026).
- `#celda` (el «+» de la celda) va con `z-index: 3`, por encima de la cadena resaltada (`.cadena.ruta`,
  z 2): con un nodo seleccionado, si no, el clic caía en la cadena y no se podía crear nada entre dos
  nodos. `zonaUtil()` (desde dónde se puede soltar) es el borde derecho visible de la columna de
  tramas, no `GUTTER`: así funciona con la columna contraída por CSS.
- **El alto de carril y del eje los fija la hoja de estilos** (`--fila`, `--eje` en `:root` de
  `css/tramas.css`, 120 y 44; la piel de ClapCraft pone 80 y 27): `tablero.js` los lee con
  `getComputedStyle` al cargar (`medida()`) para colocar los cables del SVG. Cambiar `.row`/`.axis`
  por CSS sin tocar esas variables desalinea los saltos (pasó el 13-09-2026).
- **Fondo de los actos**: `acto.fondo` es un color de `FONDOS`, `'ninguno'` («Sin fondo», elegido a
  mano) o `null` = automático por posición (`FONDOS_AUTO`: azul, ámbar, verde, violeta, rojo, gris;
  `T.fondoEfectivo(acto, i)`), como en el diseño. El panel del acto marca el automático.
- `T.tablero.simple(true)` (el tablero de un personaje en ClapCraft): sin fuera de escena ni camino
  iluminado, sin rombos («Salto alternativo a…» fuera del menú de crear) y sin sentido en los saltos (el
  trazo no lleva flecha y el menú de un salto solo tiene Eliminar: ni convertir ni invertir).
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

**La app se llama ClapCraft** (Leo, 13-09-2026; logo en `build/logo.svg` → `build/icon.icns` para el
instalador y `img/clapcraft.svg` en la cabecera). El nombre interno del código, los archivos y el
espacio `window.Claquedraw` no cambiaron; la extensión pasó de `.cld` a `.clapcraft` (Leo, 14-09-2026: los
`.cld` ya no se abren). Tercera página: `claquedraw.html` + `css/claquedraw.css` + `js/claquedraw/`. Un guion = un esquema de
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
- `js/claquedraw/app.js`: **una pestaña por guion** de la biblioteca (`#pestanas`, `renderPestanas`);
  un solo tablero montado, `montar(id)` vuelca el anterior (tablero, nota y archivo pendiente) y carga
  el otro. `volcar()` escribe el tablero en el guion (`abiertoId`) y persiste toda la biblioteca en
  `localStorage` (`guiones.claquedraw.biblioteca`; vista en `guiones.claquedraw.vista`). Nuevo abre una
  pestaña «Sin título N» (`nombreSinTitulo()`: el número libre más bajo; los «Capítulo N» antiguos sin
  archivo se renombran al arrancar); el asterisco de la pestaña y del título es `modificado(id)`
  (sin archivo: no virgen; con archivo: `sucio`); Abrir… abre en pestaña nueva, reutiliza la actual si está virgen (`esVirgen`)
  o salta a la que ya tenga ese archivo; cerrar (`cerrarPestana`) escribe y cierra si hay archivo,
  pregunta si hay contenido sin archivo, y sin pestañas deja una vacía. Primer arranque: hereda
  `guiones.tramas.doc` si existe (sin borrarlo).
- **Archivos `.clapcraft`** (Leo, 14-09-2026: ligeros). JSON sin sangría `{ app: 'clapcraft', formato: 2,
  nombre, documentos }` —el tablero antiguo (`g.datos`, `g.notas`) ya está migrado y no viaja; `tramas.html`
  ya no los abre— **comprimido con gzip** (`empaquetar`/`desempaquetar` con Compression/DecompressionStream;
  sin CompressionStream va el JSON tal cual y al leer se reconoce la firma 1f 8b). `ultimoEscrito` y `sucio`
  comparan el JSON en texto; se escriben bytes (Electron: `file:write`/`file:save` aceptan texto o
  `Uint8Array`, y `file:read`/`file:open` con `binario: true` devuelven bytes; `tramas.html` sigue con texto).
  `escribirHandle` relee y compara bytes. Abrir exige `app === 'clapcraft'`. Medido: un guion en texto baja a
  ~1/5 con gzip (unos 100-150 KB para 120 páginas); lo que de verdad pesaba eran las imágenes pegadas (data
  URL): `js/editor.js` (`imagenLigera`) reduce las de más de 200 KB a 1600 px de lado largo en WebP 0,82
  (JPEG si no hay WebP; GIF y SVG tal cual; si no aligera, la original): una de 19 MB quedó en 56 KB.
  El estado de archivo es **por guion** (`estado(id)` = `{ archivo, ultimoEscrito, temporizador,
  escribiendo }`; `vista.archivos[id]` y la clave IndexedDB `archivo:<id>` lo recuerdan). «Guardar
  como…» (`Ctrl+Shift+S`) y «Abrir…» dejan la pestaña **vinculada** al archivo y desde entonces cada
  `persistir()` programa `escribirArchivo(id)` (1 s) que escribe solo si `serializar(g)` cambió respecto
  a `ultimoEscrito` (`vincular()` lo pone a null: un archivo recién elegido está vacío aunque el
  contenido no haya cambiado; olvidarlo dejaba archivos de 0 bytes al «Guardar como» dos veces). El
  nombre propuesto en el diálogo es siempre «Esquema.clapcraft». `escribirHandle()` pide permiso si hace
  falta, escribe y **relee el archivo para comprobarlo**: en navegadores embebidos (el panel de Claude,
  por ejemplo) el sistema deja elegir el archivo pero la escritura no llega, sin error; en ese caso
  «Guardar como…» desvincula, descarga una copia y lo dice. Si al recargar no se recupera el handle
  de IndexedDB, también se avisa. «Guardar» (`Ctrl+S`) escribe ya o pide archivo. El vínculo vive en
  `vista.archivo` ({ nombre, ruta }) y, en el navegador, el `FileSystemFileHandle` va en IndexedDB
  (`guiones.claquedraw` / `kv` / `archivo`); al recargar, `retomarArchivo()` lo recupera y si el permiso
  es `prompt` el indicador dice «reconectar» y el primer «Guardar» (gesto de usuario) pide permiso. En
  Electron el vínculo es la ruta y usa `editorAPI.writeFile/readFile` (IPC `file:write` / `file:read`).
  Sin File System Access ni Electron: descarga, sin autoguardado al archivo. «Nuevo» desvincula. El
  indicador `#estadoGuardado` (botón, clic = Guardar) enseña «Solo en este navegador», «✓ nombre.clapcraft»,
  «● nombre.clapcraft» (cambios sin escribir) o «● nombre.clapcraft · reconectar».
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
- **Vista Documentos** (`js/claquedraw/documentos.js` + `js/claquedraw/gestor.js`): un guion es un
  **proyecto con contenedores**; cada contenedor es una carpeta con dos clases de hijos, todos con
  nombre propio, ordenables y movibles entre contenedores arrastrando (Leo, 13-09-2026): **esquemas
  de pasos** (`contenedor.esquemas[]`) y **subcontenedores** (`contenedor.subs[] = { id, nombre }`,
  cada uno un tablero de documentos con sus segmentos y notas, por `subId`). Nada es especial: Trama
  global es solo el nombre del contenedor que estrena un guion o recibe el esquema migrado; un
  contenedor nuevo estrena un subcontenedor «Documentos» (`C.NOMBRE_SUB`). «Personajes» y
  «Documentos guión» desaparecieron («están de más»). `Documentos` es un modelo puro (Node,
  `test/documentos.test.js`); en el código los segmentos siguen siendo `etiquetas` (Leo quiso
  «Segmentos» en la interfaz).
  · **Esquemas** (`{ id, nombre, datos, notas, notaActual }`, `crearEsquema(cid, datos, nombre,
    notas)`, `esquema(eid)` → `{ contenedor, esquema }`, `esquemasDe`, `renombrarEsquema`,
    `colocarEsquema(eid, antesDe, cid)` (delante de otro, de cualquier contenedor, o al final de
    `cid`), `guardarEsquema(eid)`, `eliminarEsquema(eid)`, `notaEsquema`, `guardarNotaEsquema`,
    `fijarNotaActualEsquema`, `podarNotasEsquema`). Un clic en su fila lo monta en la vista Esquema
    (`.montado` lo marca). El esquema que vivía en el guion (`guion.datos` + `guion.notas`, forma
    antigua) pasa una sola vez a los documentos con `d.migrarEsquema(datos, notas)` (al primer
    contenedor, o a uno nuevo «Trama global»; `datos.migrado` lo recuerda) desde `montarPrimero()`
    en app.js, que luego monta el primer esquema que haya (`primerEsquema()`). `g.datos` queda como
    reliquia (tramas.html) y `g.notas` vacío; `esVirgen` mira también los documentos. Sin ningún
    esquema, `esquemaId = null`: el tablero carga `T.inicial()` sin guardar, `body.sin-esquema` tapa
    el tablero con `#sinEsquema` y el acceso `notas` no hace nada; crear uno lo monta si no había
    (`o.esquemaCreado`).
  · **Enlace esquema ↔ documentos** (Leo, 13-09-2026): `crearEsquema` crea a la vez un subcontenedor
    con el mismo nombre y lo enlaza (`esquema.subId`; `_libre` si choca); cada uno se renombra por su
    lado. `enlace(id)` (id de cualquiera de los dos) → `{ contenedor, esquema, sub }`; `colocarEsquema`
    y `colocarSub` llevan al otro al contenedor de destino (`_llevar`); `quitarEnlace(id)` los deja
    sueltos; eliminar uno deja al otro suelto; `normalizar` descarta enlaces rotos, repetidos o a otro
    contenedor. `enlazar(eid, subId)` enlaza a mano un esquema suelto con unos documentos sueltos del
    mismo contenedor (uno con uno). En el árbol la pareja va en `.gd-par[data-unidad]` con la guía
    `.gd-enlace`; clic derecho en la guía o en una fila enlazada → «Eliminar enlace…» → `#dlg`; en una
    fila suelta → lista de los candidatos del contenedor (`menuEnlazar`); también en el ⋯ de las filas.
    **Un clic en el nombre de un contenedor no hace nada** (Leo); el chevrón pliega, el chip «Documentos»
    enlazado va en violeta y se arrastra/sube/baja como una pieza (`unidadDe`, `sueltosDe`: los
    documentos sin enlace van después de los esquemas).
  · **Subcontenedores** (`sub(id)` → `{ contenedor, sub }`, `subsDe`, `crearSub(cid, nombre)`,
    `renombrarSub`, `colocarSub(id, antesDe, cid)`, `eliminarSub` (etiquetas fuera, notas a la
    papelera)). Etiquetas y notas cuelgan del `subId`: `etiquetasDe(subId)`, `crearEtiqueta(subId,
    nombre, col)`, `notasDe(subId, etiquetaId)` (`undefined` = todas, `null` = bandeja),
    `notasContenedor(cid)`, `crearNota(subId, etq, titulo)`, `moverNota(id, etq, subId, antesDe)`,
    `colocarEtiqueta(id, antesDe)`, `restaurarNota(id, subId | cid)`. `normalizar` entiende lo
    antiguo (`contenedorId` sin subcontenedor → un «Documentos» `cid:docs`; las etiquetas con
    `personaje` se descartan). La papelera guarda `origenId` = subId y `origenNombre` =
    «Contenedor › Sub».
  · **Contenedores**: `colocarContenedor(id, antesDe)` (cambia de grupo fijado/suelto según el
    destino), `moverContenedor`, `eliminarContenedor` (notas de todos sus subs a la papelera).
  · **Papelera** al final de la barra (`gestor.PAPELERA`; `tirarNota`, `restaurarNota`,
    `eliminarDefinitivo`, `vaciarPapelera`, `purgarPapelera(30)` una vez por guion).
  El gestor lleva `actual = { tipo: sub | cont (contenedor sin subcontenedores) | papelera, cid, id }`
  (`ref()`, `clave()`/`desclave()` para el DOM: `[data-sub]` en las filas de hijo, `[data-gd-drop-sub]`
  solo en subcontenedores). **Los tableros no llevan botones arriba** (Leo): el **«＋» del contenedor
  solo ofrece «Esquema de pasos…» y «Subcontenedor…»**, los dos con el diálogo del nombre
  (`pedirNombre`, `#dlgNombre`; también «＋ Nuevo contenedor»); nueva nota y nuevo segmento van en el
  menú `⋯` del subcontenedor y en las tarjetas («＋ nota», «＋ nuevo segmento»); el `⋯` del contenedor:
  nuevo esquema/subcontenedor, renombrar, fijar, subir/bajar, eliminar; el de un hijo: abrir (esquema),
  renombrar, subir/bajar, eliminar. Doble clic en el nombre de un contenedor o en la fila de un hijo
  renombra en sitio (`renombrarHijo`). La vista Documentos (rediseño 3) lleva la
  misma cabecera de 50 px que Esquema (`cabeceraHtml` con `.esq-cab`: «CONTENEDOR [Documentos] Nombre»;
  sin «‹», historial ni filtro) y `.gd-cuerpo` con SEGMENTOS (bandeja, segmentos, «＋ nuevo segmento»)
  y, **solo si los documentos están enlazados a un esquema**, la **CRONOLOGÍA** (`cronologia()`): una
  tarjeta `.gd-acto` por acto (cabecera con `--acto-bg` = `T.fondoEfectivo`) con sus nodos por celda
  (sin extremos de salto), cada uno un documento `.gd-nodo[data-nodo][data-eid]` (no `data-nota`: no se
  arrastran ni reordenan). Clic selecciona, doble clic o Enter abre su documento (`o.abrirNodo`, monta el
  esquema y pasa a Texto); ⋯: abrir, renombrar (`o.editarTituloNodo`, también el título de su nota),
  ver en el esquema, eliminar (confirmación; `o.borrarNodo` borra el nodo del esquema, montado o no, y
  poda su nota). «Ver en el esquema» monta el esquema. Quitar el enlace hace desaparecer la sección y
  enlazar la trae. Las migas de la nota abierta
  (`#migas`: contenedor › subcontenedor › segmento › nota) siguen (`‹` cierra la nota). app.js lleva
  `esquemaId` (el esquema montado o null) y `montarEsquema(eid)` lo carga en el único `T.Modelo` del
  tablero; `volcar()` escribe donde toca y las notas de los nodos van por el acceso `notas`/`o.notas`
  que usa texto.js (`leer/guardar/actual/fijarActual`); el gestor recibe `abrirEsquema(eid)`,
  `esquemaCreado(eid)`, `esquemaEliminado(eid)`, `crearEsquemaDatos`, `mostrarTablero`,
  `alternarLado`, `esquemaMontado`, `modo`. **Arrastre** con clic sostenido (eventos de puntero y un fantasma
  `.gd-fantasma`, no el arrastre nativo, que a Leo no le funcionaba): notas entre segmentos (con
  `antes`: la nota bajo el puntero queda detrás), a un subcontenedor de la barra (a su bandeja), a un
  contenedor (a su primer subcontenedor) o a la papelera; segmentos por su cabecera (a la derecha
  quedan detrás del destino, a la izquierda delante); **el árbol entero se reordena arrastrando**:
  contenedores por su fila (`pd.tipo = 'cont'`, `mitad` antes/después según la mitad de la fila de
  destino, solo con orden Manual) y esquemas y subcontenedores por su fila (`'hijo'`: delante o detrás
  de otro de su clase, de cualquier contenedor, o al final del contenedor sobre el que se sueltan);
  `.sobre-antes`/`.sobre-despues` pintan la línea. En el tablero un clic selecciona (`notaSel`, sin
  redibujar) y el doble clic abre; en el árbol el clic abre con 260 ms de espera y el doble clic lo
  cancela y renombra (`clicArbol`); mientras hay un campo de renombrar, `render()` no redibuja
  (`editando`). El editor se precarga escondido al arrancar (`C.texto.precargar`). La barra se
  desplaza entera (`overflow-y` en `.gd-side`). Vive en `guion.documentos`, viaja en el `.clapcraft` y
  `biblioteca.marcar(id)` cuenta sus cambios. Una nota se abre en el mismo editor del marco
  (`C.texto.abrirDocumento` / `cerrarDocumento`, modo documento: sin tira, con la cinta y las migas);
  `body.nota-abierta` esconde el tablero y deja la barra. `#documentos` va con `order: -1`. Las notas
  del tablero son `div[role=button]` porque llevan un botón `⋯` dentro. Al cambiar de pestaña
  `C.gestor.reiniciar()`.
- **«Biblioteca»** (Leo, 13-09-2026): en la interfaz los subcontenedores se llaman **Biblioteca** (chip del
  árbol, diálogo, cabecera, «Ver biblioteca», menús y avisos); en el código siguen siendo `sub`/`subs` y
  la vista sigue siendo `documentos`. `NOMBRE_SUB = 'Biblioteca'`, `NOMBRE_GLOBAL = 'Capítulo'`. Un guion
  nuevo trae un «Capítulo» con **solo** un esquema enlazado a su biblioteca (`crearContenedor(nombre,
  { vacio: true })` en `migrarEsquema`), y «＋ Nuevo contenedor» hace lo mismo. Menú ⋯ del contenedor:
  Nuevo esquema…, Nueva biblioteca…, Renombrar, Fijar / Quitar de fijados, Eliminar contenedor; el de
  un hijo ya no tiene Subir/Bajar (se ordena arrastrando). El diálogo de creación no habilita «Crear»
  hasta que hay nombre. En la biblioteca, «＋ nota» es la primera fila de cada tarjeta y la nota nueva
  entra arriba (`nuevaNota` la coloca delante de la primera); caben «＋ nota» y cinco notas (256 px) y
  con más la tarjeta se desplaza (la cronología, cinco nodos). Segmentos y cronología van en
  `.gd-bloque[data-seccion]` y se intercalan arrastrando su título (`pd.tipo = 'seccion'`,
  `ordenarSecciones(subId, cronologiaPrimero)`, guardado en la biblioteca como `segmentosPrimero`: por defecto la cronología va arriba). «Ver en el esquema» va al
  extremo derecho de su fila. En el esquema, `#board` lleva `overflow-x: scroll` con desplazadores
  `::-webkit-scrollbar` morados, siempre visibles (no poner `scrollbar-width/color` en `#board`: anulan
  los pseudoelementos). **Todos los desplazadores de ClapCraft son morados**: reglas globales
  `::-webkit-scrollbar*` al principio de `css/clapcraft.css` (pulgar en `--foco`) y, dentro del marco,
  `html.clapcraft ::-webkit-scrollbar*` en `css/clapcraft-editor.css`; por eso `.gd-side`, `.pestanas` y
  `.gd-arbol` llevan `scrollbar-width: auto` y las pestañas `overflow-y: hidden`.
- **Personajes** (Leo, 14-09-2026). **Elenco**: los personajes del guion son los que se escriben en el
  editor con «/» (bloques `p.sp-character` y registro `characters` de cada nota) más los creados en
  Personajes: `documentos.elenco = [{ id, nombre, color (paleta de 16 del editor), auto? }]`. Guardar una
  nota (`guardarNota` / `guardarNotaEsquema`) añade los nombres nuevos (`sincronizarElenco`, con `auto`) y
  `podarElenco` quita los `auto` que ya nadie nombra ni tienen carril o notas (una errata corregida);
  `normalizar` lo reconstruye con los registros. `menciones(id)` recorre las notas (bibliotecas y nodos,
  sin papelera) buscando sus bloques por clave (`clavePersonaje`, la misma que characters.js) y da título y
  ruta; `renombrarPersonaje` reescribe los bloques (conservando «(V.O.)») y los registros de todas las notas
  y los carriles con ese `linea.personaje`; `colorearPersonaje` los registros; `eliminarPersonaje` se niega
  si hay menciones. El editor recibe el elenco con `Ed.characters.setGlobal(lista)` al abrir cada nota
  (texto.js, `o.elenco`): sugiere esos nombres con «/» y manda en sus colores (no se guarda en el
  documento). Antes de reescribir notas desde Personajes, app.js guarda y cierra lo abierto en el editor
  (`soltarEditor`). Datos: contenedor **oculto** `personajes` (`d.personajes(datos)` lo crea la primera vez;
  fuera del árbol, `contenedores()`, `migrarEsquema`, `primerEsquema` y restaurar; `personajes(crear)`) con
  **un tablero por personaje** (Leo, 14-09-2026: `esquemaPersonaje(id, datos)`, id
  `personajes:esquema:<personaje>`, actos «Momento»; el tablero único `personajes:esquema` de antes se
  descarta; `abrirPersonaje` lo crea y lo monta) y una biblioteca por personaje del elenco
  (`bibliotecaPersonaje(id, nombre)`; el campo se sigue llamando `sub.lineaId`). **El carril principal es
  el personaje del tablero**: nombre fijo (`span.per-combo.fijo`, sin selector; `esquemaPersonaje` y
  `marcarPersonaje` lo reponen si cambia, y en el panel de la trama el nombre es de solo lectura). Cada uno
  de los demás carriles lleva un selector `.per-combo` (lo pone `marcarPersonaje()` tras cada render; su clic
  no llega al tablero) para elegir otro personaje del elenco (el dueño no sale), crear uno o quitarlo
  (`C.gestor.menuCarril(trigger, actual, salvo, …)`, `linea.personaje`, que `js/tramas/modelo.js` conserva;
  el carril toma su nombre). Eliminar un personaje borra su tablero; `podarElenco` también (si está vacío).
  Sin personajes, `body.sin-personajes` esconde el tablero y queda el aviso del carrusel.
  En ese tablero (Leo, 14-09-2026): elegir un carril **no abre el panel** (el observador del panel lo
  vacía y quita `con-panel`; los nodos y actos sí lo abren) y los carriles no llevan el círculo de la
  inicial (`.chip` oculto). **Los personajes solo se crean con «/» en el editor y en el menú lateral**
  (Leo): «Nuevo personaje» y «＋ personaje» abren un diálogo con nombre y color (`#dlgNombre` con
  `[data-dlg-colores]`, `C.gestor.pedirPersonaje`; el primer color libre marcado) y abren su tablero. **En el
  tablero solo se eligen**: «＋ personaje» (`#addLinea`, capturado en `#rows`: sin elegir
  Secundaria/Alternativa) abre la lista de los que aún no tienen carril (`C.gestor.menuCarril(trigger,
  { titulo, actual, salvo, alElegir, alQuitar })`) y crea un carril secundario con el elegido
  (`carrilNuevo`); el selector de un carril ofrece lo mismo más «Quitar el personaje». El fondo de un
  carril con personaje es su color (`.row.con-color` con `--chl`/`--chd`, que pone `marcarPersonaje`; claro:
  fondo `--chl` y nombre `--chd`, oscuro al revés). **Nombres en ese
  tablero**: `modelo.nombres` (modelo.js: `nombre(pieza)`, `forma(tipo)`, `femenino(tipo)`) llama
  «Evento» al nodo (título de partida, menú «Crear en…», panel) y «Relación» al cuadro (título, «Relación
  a…», avisos, confirmación con concordancia «esta relación»); fuera de Personajes siguen «Punto nuevo»,
  «Nodo» y «Cambio de escena». El panel lateral también usa `nombre('acto')`/`nombre('linea')`
  («Momento», «Fondo del momento», «Eliminar momento», los títulos del eje) y el aviso de «al menos un
  momento». El nombre del personaje va con la misma letra en el menú (`.gd-per-nom`) y en el carril
  (`.per-combo`): Plex Mono 400 13 px, 500 el activo o el principal (la mono va empaquetada en 400/500; un
  600 salía con negrita sintética); sin cursiva en «Sin personaje». `abrirPersonaje` llama a `verVista` también si `body` no lleva
  `vista-personajes`. **Cambiar de personaje sin brincos**: el carrusel conserva su desplazamiento solo al
  redibujar el mismo personaje (`el.dataset.sub`) y `montarEsquema` guarda y devuelve el desplazamiento de
  cada tablero (`desplazamientos`, en memoria; uno nuevo empieza en 0,0): antes se heredaba el del
  anterior. **La app arranca en Contenedores** (Leo): si se cerró en Personajes, el arranque
  vuelve a `vista.modoPrevio` (Esquema o Documentos). El carrusel usa un desplazador horizontal normal
  (`.per-carrusel::-webkit-scrollbar`, morado; ya no hay barra de avance «desliza…»). **En el carrusel se
  arrastra** (Leo, 14-09-2026) con el mismo mecanismo del gestor (el carrusel está en `zonas` de `oir`):
  segmentos por su cabecera (con asa), notas dentro de su segmento para ordenarlas y entre segmentos o a la
  bandeja; al acercar el puntero a un borde el carrusel se desplaza solo (`autodesplazar`, cada 16 ms) para
  llegar a los que no se ven; mientras dura el arrastre `render()` no redibuja (`renderPendiente`: si no,
  el persistir de fondo se llevaba lo arrastrado) y `.per-seg.arrastrando` quita la selección de texto. Las notas del
  carrusel llevan la fecha como en Biblioteca, y también los documentos de la cronología y las apariciones
  (Leo: todo lo que va dentro de un segmento). Las notas de los nodos guardan `modificado`
  (`guardarNotaEsquema` lo pone solo si cambió el contenido; `docDe` lo conserva). El chip «Personaje» del título (`.per-chip`) y
  el punto del personaje en el menú (`.gd-per-punto`) llevan su par de la paleta en `--chl`/`--chd` y el
  CSS elige según el tema, como el bloque de personaje del editor (claro: fondo `--chl`, tinta `--chd`). **Los cuadros de un salto tienen nota,
  una sola para los dos** (`o.saltosConNota` en texto.js: `claveNota(id)` = `deId` del salto; doble clic y
  «Abrir documento» también en los extremos; cambiar el título renombra los dos). **El editor de ese
  tablero no tiene tira** (`o.sinTira` → `#texto.sin-tira`) y **el menú sigue en Personajes** con el editor
  abierto desde ahí (`o.personajesActivo`: vista Personajes, Texto con un tablero de personaje, o una nota
  abierta de la biblioteca de un personaje).
  Vista `vista.modo = 'personajes'`: la sección `#esquema` con el tablero del personaje abierto (`T.tablero.simple(true)`,
  sin fuera de escena ni camino iluminado; `gutter(200)`; `modelo.nombres`) y encima `#personajesSeg`, el
  carrusel de la biblioteca del personaje abierto (`C.gestor.renderPersonaje(el, subId, personajeId)`) con
  el segmento fijo **Apariciones**, delante de la bandeja (notas donde se le nombra, con su ruta; doble clic abre). Crear notas o
  segmentos en el carrusel **no cambia de vista** (`irAlTablero` no hace nada con `enCarrusel()`; antes
  pasaba a Biblioteca y el tablero desaparecía); abrir una nota sí (`irAlTablero(true)`), y renombrar el
  segmento nuevo busca su tarjeta en el carrusel. Menú en
  Personajes: el elenco (`.gd-per`: punto del color, nombre, ⋯ Abrir/Renombrar/Cambiar color/Eliminar;
  «＋ personaje», «Nuevo personaje»; doble clic renombra) y el pie **Contenedores · Personajes · Papelera**.
  app.js: `verPersonajes`, `verContenedores`, `abrirPersonaje`, `nuevoPersonaje`, `renombrarPersonaje`,
  `colorPersonaje`, `eliminarPersonaje`, `asignarCarril`. El panel del nodo ya no tiene «Estado»
  (descartar sigue en el menú contextual del nodo). `.btn[hidden]`/`.icono[hidden]` llevan
  `display: none !important`.
- **El menú** (rediseño 2): marca, «＋ Nuevo contenedor», rótulo CONTENEDORES, árbol (`.gd-arbol`,
  fijados primero, orden siempre manual; ya no hay buscador, grupo «Fijados» ni botón de orden) y la
  papelera al pie (`.gd-pie`, sin listar sus notas: un clic abre su tablero). Contenedor 34 px en mono
  mayúsculas con «＋» y «⋯»; hijos de 28 px: punto · chip (ancho fijo) · nombre mono · ⋯. La fila activa
  es lo que enseña la vista (`o.modo()`): el esquema montado en Esquema/Texto, el subcontenedor abierto
  en Documentos; `verVista` redibuja el menú al cambiar. El punto en acento es solo de la fila activa:
  el esquema montado no se marca fuera de su vista (pasaba y parecía seleccionado siempre).
- **La barra de documentos (`#gdSide`) vive en `<main>`, delante de todo, en las tres vistas** (Leo,
  13-09-2026: «debe permanecer incluso si se abre el esquema de pasos»). Se **pliega** a un riel de
  56 px (rediseño 3: `vista.ladoPlegado` → `body.lado-plegado`; `.gd-riel` con logo, nuevo contenedor,
  desplegar y papelera, que también recibe notas): botón de panel `[data-gd-lado]` junto a la marca,
  la flecha del riel y `Ctrl/Cmd+Shift+B` (también dentro del marco). Desplegado, su ancho se cambia
  arrastrando el borde `#ladoBorde` (`vista.ladoAncho`, `--lado-ancho`, 220–480, de partida 280); por
  debajo de 160 px se pliega y tirando del riel se despliega; doble clic en el borde, ancho de partida.
  `vista.rev = 3` lo dejó desplegado y con el ancho de partida una vez. El fijo/suelto con asa
  (`ladoFijo`, `#ladoAsa`) desapareció. El gestor oye clic/teclado/puntero en la sección y en la barra (`oir`), los menús `.gd-pop`
  van en `document.body` con `position: fixed`, y lo elegido en la barra llama a `o.mostrarTablero()`
  (pasa a la vista Documentos; «Esquema de pasos» monta el esquema y pasa a Esquema). La fila del
  esquema montado lleva `.montado` (`o.esquemaMontado()`); `C.gestor.mostrar()` se llama en cada
  `montar` y `C.gestor.render()` al montar un esquema.
- Ganchos con el tablero sin tocar `tablero.js`: el botón «✎ Escribir la nota» se añade al panel con un
  `MutationObserver` (el panel se reconstruye con innerHTML); seleccionar un nodo desde fuera se hace
  con un botón efímero `[data-hilo=id]` al que se le hace clic (el tablero lo trata como sus flechas
  ‹ ›). Renombrar desde el editor no entra en el Deshacer del tablero.
- Vistas: `vista.modo` (`esquema`/`texto`/`documentos`, se recuerda), `body.vista-texto` /
  `body.vista-documentos`. **Ya no hay botones de vista en la cabecera** (Leo: «deja de tener sentido»
  con la barra en todas las vistas): se navega desde la barra de documentos, Ver › Esquema / Texto y
  Documentos, `Ctrl/Cmd+Shift+G` y `Ctrl/Cmd+Shift+F`; el código que recorre `[data-vista]` queda por
  si vuelven. **El menú Ver solo tiene «Modo oscuro»** (Leo): los atajos de la página
  (Ctrl+Shift+G/F/K/B) llegan en Electron porque el menú ya no los captura. Al editor de nodos se
  entra con doble clic en un nodo —capturado en `#board` antes de que el tablero lo
  tome por renombrar— o con «Abrir documento» en el panel, y se sale con el botón «‹ Esquema» que
  texto.js monta en la barra de título del editor, `#cdVolver`, o `Ctrl/Cmd+Shift+G`), y
  `Ctrl/Cmd+Shift+F` abre Documentos. Los controles solo del tablero llevan `.solo-esquema`.
  Los atajos dentro del marco van en fase de captura y no pueden repetir los del editor
  (`Ctrl+Shift+E` centra, `L` alinea, `X` tacha, `H` resalta, `7/8` listas, `V` pega plano…).
- **Pantalla Esquema del rediseño 3**: eje de 34 px (`--eje`, rótulo «TR»), la columna de tramas es un
  carril fijo de 48 px (`T.tablero.gutter(48)`; el mínimo de `gutter` bajó a 40) con un círculo de 24 px
  por trama y su inicial (`.chip[data-inicial]`, que pone tablero.js) sobre un fondo sólido teñido del
  color de la trama (`.label` lleva `--tc`; `color-mix` al 18 %, 30 % seleccionada) para que el tablero no
  se transparente al desplazarse; nombre y tipo se asoman al pasar el ratón (`.label:hover .lbox`, también al renombrar con
  doble clic) y el resto se edita en el panel de la trama. Ya no hay asa ni botón para ensanchar o
  contraer la columna (`#asaTramas`, `#plegarTramas`, `vista.gutter`, `vista.tramasPlegadas` fuera).
  El **panel del nodo** lo arma tablero.js (también en tramas.html): cabecera «NODO» con ‹ › y ×
  (`.panel-nav`, iconos SVG en línea `ICONO`), título, descripción que ocupa el alto (`.field-crece`),
  `#fEstado` (En escena / Descartado, en lugar del botón Descartar; no en extremos de salto),
  `.panel-meta` (color · trama · acto), `.panel-acciones` con la papelera (`#bBorrar`, icono) donde app.js
  mete delante «Abrir documento» y `.panel-pista` («Supr elimina · Esc cierra»).
- **Pantalla Texto del rediseño 3**: arriba `#textoCab` (50 px, `.esq-cab`: «CONTENEDOR [Acto] título»,
  el título es un `<input data-texto-nom>` que escribe en `#docTitle` del marco y así renombra el nodo;
  «Ver biblioteca» = `o.verBiblioteca`, solo si el esquema tiene biblioteca enlazada; «Ver en el esquema» = `o.volver`; ‹ › = `mover`), la tira (92 px sobre el lienzo más 12 de un
  desplazador horizontal morado siempre visible, `overflow-x: scroll` sin `scrollbar-width`; la pista
  crece con sus nodos para que la raya llegue al último; carril pegajoso de 48 px con fondo sólido
  teñido del color de la trama, `--tc`, y el círculo con la inicial; los saltos llevan debajo `.hilo-trazo`, punteado de 2 px con
  una flecha `.sube`/`.baja` según la trama del otro extremo esté más arriba o más abajo en el tablero, y
  el rótulo) y, dentro
  del marco, **la cinta y la hoja a la vez** (ya no hay `vista.cabecera`, `Ctrl+Shift+K`, `#cdTira` ni
  `#cdVolver`). texto.js pone `html.clapcraft` en el marco (`adaptarMarco`): con esa clase
  `css/clapcraft-editor.css` deja la cinta en una fila de 44 px siempre visible (sin enlace, tabla,
  buscar, tema ni pin; buscar sigue con Ctrl+F), esconde `.titlebar`, pone la hoja a 26 px del borde y la
  barra inferior clara de 42 px siempre visible (TAMAÑO, ANCHO con relleno `--pct`, las pastillas de
  modo con su botón invisible encima, sin tema ni pin, y `#cdLado` para plegar el menú). Deshacer/rehacer
  llevan iconos puestos desde fuera. `index.html` a solas no cambia. Con una nota de biblioteca
  (`#texto.documento`) no hay cabecera ni tira: mandan las migas.
- En el árbol, al pasar el ratón por un esquema o una biblioteca aparece el globo `.gd-globo` con su
  tipo y su nombre completo (350 ms; las filas ya no llevan `title`).
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
