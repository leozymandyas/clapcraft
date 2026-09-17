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
  `screenplay`, `database`, `blocks`, `fijos`, `paginas`, `slash`, `characters`, `vendor/typo`, `dict/es`, `dict/en`, `spell`.
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
- **Bloques fijos** (`js/fijos.js`, 15-09-2026): un hijo directo de `#editor` con `.ed-fijo[contenteditable=false]` no se
  borra desde el texto. Retroceso al principio del bloque siguiente o Supr al final del anterior no hacen nada (Chrome se
  llevaba el bloque entero); borrar, escribir, pegar o cortar sobre una selección que los cruza borra tramo a tramo con
  `execCommand('delete')` (del último al primero, entra en Deshacer) y lo escrito va al primer tramo; copiar los deja
  fuera; un cursor entre bloques junto a uno fijo pasa al bloque de al lado. El corrector y buscar los ignoran («Todo» va
  uno a uno si los hay) y la selección de bloques (blocks.js) no los coge. Solo los usa ClapCraft (cabeceras de sección).
  **Para probarlo en el panel**: las teclas del panel llegan como `keydown` pero sin su acción de edición (Retroceso no
  borra, Cmd+A no selecciona); se prueba con `KeyboardEvent`/`InputEvent('beforeinput')`/`ClipboardEvent` sintéticos
  y, si no se previenen, `execCommand('delete')` como haría Chrome.
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
- **Un doble espacio suelta al personaje** (Leo, 16-09-2026): en un bloque de personaje, el nombre acaba en el primer
  doble espacio y lo que va detrás («V.O.», «CONT'D», «(O.S.)») es una anotación, no un personaje nuevo. Lo aplican
  `key`/`soloNombre`/`C.suelto` de `js/characters.js` (el segundo espacio llega como NBSP; con el personaje ya soltado
  las sugerencias de «/» no salen) y `sinSufijo`/`clavePersonaje`/`renombrarEn` de `js/claquedraw/documentos.js`, que al
  renombrar conservan la anotación tal cual.
  **El disparador de verdad es el Enter** (Leo, 16-09-2026: «al seleccionar un personaje con Enter, hace el Enter de
  inmediato; que sea ahí donde me deje escribir un texto y si no, ya que haga el Enter normal»): elegir un personaje de
  las sugerencias (Enter, Tab o con el ratón) **ya no salta al diálogo**: escribe el nombre y lo **suelta** ahí mismo,
  con el cursor detrás listo para la anotación; el **siguiente** Enter es el de siempre. Lo hace `soltar(block, nombre)`
  de characters.js, que escribe `<span class="ch-nom">NOMBRE</span>` + **dos espacios duros** de una sola vez con
  `insertHTML` (con `insertText` Chrome recorta los espacios del final al sustituir el bloque entero, y sin doble
  espacio el personaje seguía creciendo). Si no se escribe nada detrás, al salir del bloque se recoge y queda el nombre
  solo. **Teclear el doble espacio también vale**, y ahí estaba el fallo que veía Leo: **macOS lo cambia por un punto**
  («MARA. ») y el personaje seguía creciendo; un `beforeinput` en characters.js reconoce los dos casos —el segundo
  espacio y la sustitución del sistema, un `.` justo detrás de un espacio— y suelta el personaje en lugar de escribirlos.
  **Y el color es solo del nombre** (Leo, 16-09-2026: «el personaje debe mantener su color de etiqueta y luego lo que
  escriba, en texto normal»): `separar(b, editando)` en characters.js deja el nombre en un `span.ch-nom` y la anotación detrás,
  como texto suelto; el chip pasa al span y el bloque se queda sin fondo (`p.sp-character[data-ch]:has(> .ch-nom)` en
  css/editor.css). Se parte en cuanto se teclea el segundo espacio (`C.onInput`) y también al cargar un documento
  (`refresh`), y **se deshace solo** si se borra el doble espacio; el cursor se conserva por su posición en el texto
  (`offsetCursor`/`ponerCursor`), porque el bloque se rehace entero. `renombrarEn` sigue escribiendo texto plano: el
  span lo vuelve a poner `refresh` al abrir. Un bloque que deja de ser personaje pierde el span.
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
- **Un clic en el hueco de la hoja escribe ahí** (Leo, 16-09-2026: «tengo que dar saltos de línea para poder escribir en
  un espacio en blanco… quiero habilitar cualquier espacio con un clic»): el `mousedown` de `#editor` con
  `e.target === editor` (el hueco, no un bloque) y por debajo del último bloque baja hasta el punto pulsado con las
  líneas en blanco que hagan falta (`insertHTML` de `<p><br></p>`, así entra en Deshacer), hasta 80. Para contarlas,
  **el alto de renglón se multiplica por el `zoom` de `.page-wrap`**: los estilos vienen sin él y las coordenadas del
  clic, con él, y mezclarlos dejaba el cursor muy por encima. Si el último bloque ya está en blanco, cuenta como una.
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
violeta** (`--foco` #6141C9 claro / #B3A6F7 oscuro, con `--foco-suave`, `--sel-bg`, `--drop-bg`,
`--foco-halo/linea/banda`; antes fue el lavanda del logo, #6B5B8E / #BFAED8, y luego
#6F3AD0 / #C9A6FF). **Paleta nueva** (Leo, 15-09-2026, `docs/diseno/rediseno-12/` y, para grises y acento,
`docs/diseno/rediseno-13/`, que manda): grises neutros fríos en claro (`--chrome` #E8E9EC, `--panel` #DFE1E6,
`--lienzo` #F5F6F8, `--borde` #C5C8D0, `--tinta` #1B1D22…; en la 12 iban teñidos de violeta), `--ok`/`--peligro` más vivos,
fondos pálidos `--f-*` más saturados (también `FONDOS` de modelo.js), chips `--p-*` y los 16 pares de
personajes y segmentos (`TONES`, `PALETTE`, `PALETA` de documentos.js) con las tintas nuevas; el oscuro solo
cambia el acento. Los mismos valores van en clapcraft.css, tramas.css (`--f-*`) y clapcraft-editor.css
(`--bg`/`--canvas`/`--line`/`--fg`/`--muted`, `--accent*`, `--bb-*`, `--cd-foco-*`); bordes de 1 px (`--borde`,
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
`--bb-bg`: escala horizontal `#zoom` (`T.tablero.zoom`, 1.7 de partida; **de 0,7 a 18**: Leo lo dobló el 15-09-2026, de 3 a 6, y
lo triplicó el 16-09-2026 —«el escalamiento horizontal sigue pareciéndome muy pequeño»—; el tope va en el `clamp` de
tablero.js **y** en el `max` del control de claquedraw.html y tramas.html) y vertical `#altoFila` (`T.tablero.alto`,
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
  salto borra sus dos nodos; una nota va entre dos nodos consecutivos o **en un nodo** (`aId: null`) y **caben varias
  en el mismo sitio** (Leo, 16-09-2026; la spec pedía una por tramo).
  **Una celda es de un solo nodo** (Leo, 13-09-2026): `nuevoPunto`, `moverPunto` y `moverSalto`
  rechazan caer sobre otro nodo (`ocupante()`), y `crearSalto` no convierte un nodo existente en
  cuadro o rombo: el otro extremo necesita la celda libre. **Soltar un nodo encima de otro los intercambia** (Leo,
  15-09-2026, también en Personajes): el tablero llama a `moverPunto`/`moverSalto` con `{ intercambiar: true }` y, si lo que hay
  en la celda es un solo nodo, `intercambiarPuntos(p, q)`: cada uno a la celda y la trama del otro; un extremo de salto se
  lleva a su pareja a la misma celda (la pareja sigue en su trama); si algo caería sobre un tercero, dos en la misma celda o un
  salto quedaría mal (en la trama de su pareja, un cuadro en una alternativa), no se hace y avisa. Las notas se quedan en su
  tramo (sus extremos pasan al nodo que ocupa ese lugar). Mientras se arrastra, el de debajo (y su pareja) se aparta a su sitio
  (`previaIntercambio`, `.pt.intercambio` con transición). **Las notas también** (`moverNota(…, { intercambiar })`,
  `intercambiarNotas`): arrastrada sobre un tramo con otra nota, esa pasa al tramo de origen de la arrastrada, y al seguir
  arrastrando vuelve a su tramo (`colocarNotaArrastrada` en tablero.js). Sin la opción, el modelo sigue rechazando (criterio 13
  de la spec, que Leo cambió para la interfaz).
  **Reordenar tramas** (Leo, 15-09-2026, también en Personajes): se arrastra la etiqueta de la trama en la columna (`filaArr`: a
  los 6 px la fila sigue al puntero con `.arrastrando-fila` y `.fila-marca` marca dónde cae; un clic seco la sigue eligiendo) y al
  soltar `m.moverLinea(id, indice)`. Los saltos no cambian (siguen saliendo de la misma trama): la flecha que sube o baja, en el
  tablero y en la tira del editor, sale del orden al dibujar. En el tablero de un personaje su carril principal no se arrastra y
  nada cae encima de él; como ahí el selector, la etiqueta y el color interceptan el puntero, app.js arranca el arrastre con
  `T.tablero.arrastrarFila(e, id)` y sus clics miran `T.tablero.acabaDeReordenar()` para no abrir el menú al soltar.
  **Selección múltiple y bloques** (Leo, 15-09-2026, también en Personajes): arrastrar desde un hueco del tablero (no sobre un nodo,
  una nota, un control ni el trazo de un salto `[data-salto]`, que se arrastra para mover el salto (el salto elegido ya no lleva la
  «×» en un círculo, `.badge`: Leo, «Eliminar» ya está en su menú contextual): en la 1.0.37 el
  rectángulo se lo comía y los cuadros, rombos y relaciones solo se movían desde un extremo; desde el «+» de la celda si el arrastre va en horizontal, o con Mayús) dibuja `.marquesina` y elige los
  nodos, cuadros y rombos cuyo punto queda dentro (`multi`, `.pt.multi`; Mayús suma a lo elegido; Esc o un clic en otro nodo lo
  sueltan). Arrastrar uno de ellos mueve el bloque con vista previa (nodos y trazos desplazados) y al soltar
  `m.moverBloque(ids, dc, dl)`: los extremos de un salto van juntos (entra la pareja), faltan tramas por abajo → secundarias
  nuevas, faltan celdas → `asegurarCeldas` alarga el último acto o añade actos; si cae sobre otros nodos se abre sitio en el
  tiempo (todo lo que no va en el bloque desde su primera celda de destino se corre el ancho del bloque, en todas las tramas, para
  no romper saltos ni el orden); un cuadro no baja a una alternativa; `_repararNotas` recoloca las notas que quedan fuera de un
  tramo válido. Entra en Deshacer como un solo paso. **Borrado masivo** (Leo, 15-09-2026): con algo elegido sale la barra
  `.multi-barra` («N elegidos · Eliminar · Soltar», en `document.body`, abajo en el centro del tablero) y Supr, la barra o el menú
  contextual de uno de ellos («Eliminar los N elegidos») llaman a `pedirBorrarVarios` → `m.resumenBorrado` para el texto y
  `m.borrarPuntos(ids)` (con los extremos de sus saltos y sus notas). **Todos los borrados de la línea del tiempo piden
  confirmación** con el modal `#dlg` (`confirmar`): nodo, salto, trama (`pedirBorrarLinea`), acto (`pedirBorrarActo`), nota
  (`pedirBorrarNota`) y varios; antes trama, acto y nota se borraban sin preguntar. La vista previa del arrastre del «+» tampoco
  enciende una pista ocupada; al soltar un nodo sobre otro el tablero avisa y lo devuelve. El arrastre
  del trazo de un salto (`mov`) es solo visual hasta soltar: desplaza los dos extremos (`transform`) y
  el grupo `<g data-salto-g>` del SVG, y `moverSalto` se llama en `pointerup`; así se ve el intento
  aunque la celda esté ocupada, y solo entonces avisa y vuelve.
- **Orden de apilado del tablero en ClapCraft**: `.pt` lleva z 5 (tapa el cable, z 4), así que la columna
  de nombres va con z 7 y el eje con z 8 (`#board .label` / `#board .axis` en la piel). Con los dos en z 5
  los nodos, que van después en el DOM, se veían a través de la columna al desplazar (pasó el 14-09-2026).
- **Rótulos y notas de una fila** (Leo, 16-09-2026: «no importa que crezca el alto vertical de la trama donde no quepa
  la información»). El nombre de un nodo redondo (no cuadros, rombos ni descartados, que siguen con texto suelto) va en
  un rótulo de papel con borde, sombra y guía hasta el punto (`.pt.con-rotulo`; el seleccionado con borde de acento).
  `colocarRotulos(row)` mide tras montar cada fila y **apila**: los **rótulos hacia arriba** (nivel 0 pegado al carril;
  el que choca con el anterior sube 19 px) y las **notas hacia abajo** (26 px por nivel), con los huecos del «+» al
  final, debajo de todas las notas. Ya no hay `.abajo` ni notas `.aparte` con guías: cada cosa tiene su nivel.
  **Lo que se lee crece con la escala** (Leo, 16-09-2026: «si ya tengo más espacio, debería ver más texto de títulos o
  notas largas»): `sitioDe(p, props, minimo)` mide el hueco hasta el nodo vecino y lo pasa al rótulo (`--cap-max`, que
  el CSS usa como `max-width: max(150px, var(--cap-max))`, 190 en tramas.css) y a la nota de un nodo (`maxWidth`, con
  `NOTA_MAX` de suelo), con tope `ANCHO_TOPE` (620). Con poca escala se corta con «…» como siempre; con mucha, se lee
  el título entero.
  **El rótulo del primer nodo no se sale por la izquierda** (Leo, 16-09-2026: un nombre largo en la primera columna se
  perdía bajo la columna de tramas): se desplaza lo justo con `translateX(calc(-50% + dx))`.
  **La fila crece lo que haga falta, cada una la suya** (1.0.82, Leo 16-09-2026: «si tengo más tramas se hacen igual de
  anchas aunque no existan notas») y su carril deja de ir centrado: `render` mide lo que ocupan rótulos y notas **por
  fila** y, si no cabe en `FILA_BASE`, escribe `--fila` y `--centro` **en esa `.row`** (en `:root` quedan los de partida;
  `.rail`, `.pt`, `.cadena`, `.nota` y `.hueco` leen `top: var(--centro, 50%)`). La geometría vive en `GEO` (por trama:
  `top`, `alto`, `centro`; `geo(id)`, `altoFilas()`) y la usan `yFila`, el alto del SVG, el nombre de un salto (en el borde
  de su fila) y el arrastre de un bloque (cuenta las filas por la que queda bajo el puntero). `T.tablero.alto(v)` sigue
  siendo lo que pide la vista (`FILA_BASE`).
  **El rótulo fijo vale como el nodo** (Leo, 16-09-2026: «presionar el tooltip fijo es como si seleccionara el
  nodo»): el `pointerdown` sobre `#board .pt > .cap` se atiende como el del punto, así que lo elige, abre su panel y
  desde ahí también se arrastra.
  **Al pasar el ratón por un nodo —o por su propio rótulo** (`.cap` con `pointer-events: auto`, Leo 16-09-2026)— el
  rótulo enseña el nombre entero, **en varias líneas** si hace falta (`width: max-content`, hasta 300 px) y por encima
  del eje (`.pt:hover { z-index: 9 }`), sin recortarse.
  **Las notas apiladas se reordenan arrastrando** (Leo, 16-09-2026: «déjame reordenar notas, una encima o debajo de
  otras, que la animación de mover exista… y que no importe si es del nodo o del enlace»): dentro de su sitio, la
  altura del puntero decide dónde cae (`reordenarNotaArrastrada` → `m.colocarNota(id, antesDe)`, que recoloca la nota
  en `datos.notas`; la referencia puede ser **cualquier nota de la misma trama que se pise con ella**, de nodo o de
  enlace, no solo las de su mismo sitio), y las demás se apartan con una animación FLIP
  (`rectsNotas`/`animarNotas`, 170 ms; la arrastrada no se anima, va con el puntero). Para que el orden de la lista
  **sea** el orden en que se ven, `colocarRotulos` apila **por el orden de `datos.notas`** (antes por el borde de cada
  nota, que depende de lo larga que sea) y cada pieza baja al primer nivel **donde no se pise con las que ya hay**
  (mirando sus tramos ocupados, no solo el borde del último: con el orden de la lista por delante, una nota se iba muy
  abajo aunque tuviera libre todo el hueco de su izquierda).
  **Caben varias notas en el mismo sitio y las hay de nodo** (Leo, 16-09-2026: «quiero poder agregar varias notas
  apiladas… también agregar notas por nodo»): en el modelo, `nota.aId` puede ser `null` y entonces la nota cuelga de
  `deId` (`notasDe(deId, aId)`, `notasDeLinea`, `crearNota(deId, null)`; `_tramoValido` ya no exige que el tramo esté
  libre). En el tablero **todas las notas se pintan igual** (Leo, 16-09-2026: «hazlas más como las notas de nodo»): una cajita
  a su medida colgada de su sitio con su guía al carril, el nodo o **la mitad del tramo** que une dos nodos; antes la de
  tramo se estiraba de nodo a nodo y crecía con la escala, y ocupaba un nivel entero del apilado. `.nota.de-nodo` marca
  cuál es de nodo, pero ya no cambia su aspecto. Una nota de nodo
  se crea con «Nota en este nodo» del menú del nodo; arrastrando una nota, **acercar el puntero a un nodo la cuelga de él a cualquier altura** (1.0.80, Leo 16-09-2026: «si muevo una nota de nodo a un enlace, regresarla es muy complicado»; antes solo valía un cuadro de 24 px sobre el nodo a la altura del carril): el imán es el 30 % del tramo hacia ese lado, entre 12 y 40 px, así que **la mitad del tramo sigue siendo del enlace** y ahí una nota de enlace solo se ordena, sin convertirse; fuera del imán va al tramo donde cae (ya no se intercambian: se apilan). **Su guía es continua, de 2 px y del color de su trama** (`--gl`, que pone tablero.js), con un punto donde toca el carril: antes era una raya gris discontinua que no dejaba ver de quién era la nota (Leo, 16-09-2026). **Mide lo que la nota se haya bajado** (`--guia`, que escribe `colocarRotulos` con su nivel): con la altura fija se veía cortada en cuanto la nota caía a un segundo nivel. Si el «+» de la celda (`#celda`, z 3)
  queda encima de una nota, `notaBajo(e)` (`elementsFromPoint`) lo esconde y el clic elige la nota (Leo, 15-09-2026).
  **Elegir una nota abre su panel** (Leo, 16-09-2026: «que se vea su contenido en el panel inferior»): `sel.tipo`
  `'nota'` pinta su texto en un `textarea` que ocupa el alto (se escribe ahí y se ve en el tablero al momento), su
  color, dónde está y la papelera. **Notas con color** (rediseño 9): `nota.color` es un tono de `PALETA` o no existe
  (papel de nota de siempre); `m.colorearNota(id, color)`, y los 24 tonos están en su menú y en el panel. Con color,
  `.nota.con-color` con `--tc`/`--tf`, pero **sigue pareciendo papel de nota** (1.0.81, Leo 16-09-2026: con el fondo pálido y el borde del tono entero «se ven más como nodos que notas»): en la piel, papel apenas teñido (`color-mix` 11 % del tono sobre `--papel`; sobre el amarillo de `--nota` los fríos salían turbios), borde al 30 % sobre `--borde` y letra al 55 % sobre `--tinta`. La clase no puede llamarse `rotulo`: la piel ya la usa
  para los rótulos mono en mayúsculas. La tira del editor mantiene su propio colocado (`texto.js`, `.rotulo-abajo`).
- **Enlaces y selección con Mayús** (1.0.83, Leo 16-09-2026: «quiero poder agregar más de una nota enlace. Quita ese icono de
  nota… que pueda seleccionar enlaces y al hacer clic secundario aparezca la opción de agregar nota… cambiarle el color a los
  enlaces»; «seleccionar varios nodos o notas, siempre que sean del mismo tipo, para cambiarles el color o eliminarlas… con
  Mayús»). **Ya no hay huecos** (`.hueco`, `.add-nota`, su doble clic): el **enlace** es el tramo `.cadena[data-enlace=deId]`
  entre dos nodos consecutivos, con una franja invisible de ±7 px para acertarle. Un clic lo elige (`sel.tipo 'enlace'`,
  `.cadena.sel`) y abre su panel (color en `.nota-colores` con «trama» primero, entre qué nodos va, «＋ Nota» y a la derecha
  sus notas, que llevan a cada una); el clic secundario (también sobre el «+» de una celda del tramo: `enlaceEn(e)` mira la
  altura del carril) abre `menuEnlace`: «Agregar nota» (caben varias) y su color. Modelo: `punto.colorEnlace` (el tramo que
  sale de ese nodo; `colorearEnlace(deId, color)`, sin él el de la trama), `siguienteEnTrama(id)` y `borrarNotas(ids)`.
  **Mayús + clic** en un nodo (punto o rótulo) o en una nota lo suma o lo quita (`alternarMulti`; lo elegido solo entra también):
  nodos en `multi`, notas en `multiNotas`, nunca a la vez. La barra `.multi-barra` dice «N elegidos» o «N notas elegidas» y lleva
  **Color** (`paletaVarios`, `data-varios-color`), Eliminar y Soltar; el menú contextual de uno de los elegidos ofrece lo mismo
  y Supr borra (`pedirBorrarNotas` con confirmación). El `pointerdown` pone `soltarClic = false` al empezar: el Mayús+clic lo
  deja en true para que el clic de después no elija nada.
- **El trazo de un salto abre el panel de su nodo de salida** (Leo, 16-09-2026: «si selecciono la diagonal, no se abre
  el texto en la descripción; debe poderse escribir como si eligiera uno de sus nodos»): con `sel.tipo === 'salto'`,
  `panel()` pinta el panel del punto `deId` (cabecera «Relación» o «Cambio de escena»), así que ahí se escribe su
  descripción; el título se escribe **en los dos extremos**, como al renombrarlo en su trazo. Eliminar desde ese panel
  sigue borrando el salto entero.
- **El nombre de un salto va en su trazo** (Leo, 15-09-2026, cuadros, rombos y relaciones; la tira del editor no cambia), **en el
  hueco entre el carril de salida y el de al lado** (`y1 ± FILA/2`, Leo 16-09-2026: a mitad del trazo, un salto de la trama 1 a la
  3 tapaba los nodos de la 2): sus
  extremos no enseñan rótulo (`.pt.caja .cap` oculto) y `cables()` pinta en `#saltosNombres` (capa sobre el SVG, z 6) una etiqueta
  `.salto-nombre[data-salto][data-salto-nombre]` a mitad del trazo con el título del extremo de salida. Como lleva `data-salto`, se
  arrastra para mover el salto, su clic lo elige y su menú contextual es el del salto; se renombra con doble clic (en la etiqueta o en
  un extremo) o, al crear un salto, en sitio (`renombrarSalto`: el nombre pasa a los dos extremos; input `.salto-nombre-edit`). El
  doble clic se reconoce por `click.detail` 2, y **un clic seco en el trazo ya no redibuja** al soltar (`mov` sin movimiento, con 3 px
  de margen): si redibujaba, la etiqueta se sustituía entre `pointerup` y `click` y el navegador no daba el clic.
- **Esc apaga el camino iluminado, no la selección** (Leo, 16-09-2026: «Esc solo debe ser para escapar de que se me muestre
  el recorrido, no para que me cierre el panel»): con un camino a la vista, Esc pone `sinRuta` y redibuja sin él, dejando el
  nodo elegido y su descripción; elegir otra cosa lo vuelve a encender. Con el panel al lado (tramas.html, Personajes) un Esc
  sin camino sigue soltando la selección. Con el recorrido encendido, lo que queda apagado **se ve entero al pasar el ratón**
  (`body.con-ruta .pt:hover`, y lo elegido siempre). Y **ni su rótulo ni las notas se atenúan** (Leo, 16-09-2026: «mantén el texto
  de los tooltips sin atenuar», «las notas tampoco»): la opacidad baja va en los hijos del nodo menos en `.cap`, no en
  el `.pt` entero, y `body.con-ruta .nota` se quedó en 1.
- **Al pasar el ratón por un nodo** (Leo, 15-09-2026) ya no sale el globo `#tip` (las notas sí lo llevan): su rótulo fijo enseña
  el nombre entero (`.pt:hover .cap` sin `max-width`, el nodo por encima de los vecinos). Además se enciende (el centro se rellena de su color,
  que `.dot` lleva también en `color`, con halo) y su rótulo va en negrita; lo mismo en la tira del editor.
- **El nodo elegido va con su propio color**, no con el lavanda del acento (Leo, 15-09-2026: parecía la paleta de antes):
  `.pt` lleva `--c` (tablero.js), relleno y halo de su tono, rótulo con borde de su tono y el camino iluminado
  (`.cadena.ruta`) del color de cada trama; igual el nodo actual de la tira del editor y el punto de la sección activa.
  Las paletas del gestor (`.gd-paleta--nota`, `--carpeta`) van con `minmax(0, 1fr)` y botones sin relleno: el relleno
  de los botones del menú ensanchaba unas columnas.
- **Notas de biblioteca con color** (Leo, 15-09-2026): `nota.color` es uno de `C.TONOS_NOTA` (los 24 de las tramas) o no
  existe; `d.colorearNota(id, tono)` (no toca la fecha). ⋯ de la nota › «Color…» (`paletaNota`: 24 tonos y «Sin color»).
  `.gd-nota.con-color` y `.gd-exp-nota.con-color` con `--tc`/`--tf`: fondo pálido, borde y punto del tono delante del título.
  **La marca de una nota elegida con un clic se quita** con Esc (el primero; el siguiente contrae el segmento expandido) o
  con un clic en cualquier otro sitio (`soltarSeleccion`); antes se quedaba.
- **Carriles de un personaje**: la columna es la **compacta de 48 px**, igual que en cualquier esquema (Leo, 16-09-2026:
  «ocupan mucho espacio, haz que sean como la de los otros esquemas»). En lugar de la inicial de la trama, el círculo lleva
  **las dos primeras letras del nombre del personaje** con su par de la paleta de etiquetas (`.chip.per-tono` con
  `--chl`/`--chd`, que pone `marcarPersonaje()` tras cada render) y al pasar el ratón se asoma el nombre entero, como en los
  demás esquemas (`.label:hover .lbox`, con «PERSONAJE» de tipo). Un carril sin personaje va con el borde discontinuo
  (`.row.sin-personaje`). El clic en el círculo abre el menú del carril (`C.gestor.menuCarril`), el doble clic abre ese
  personaje y el `pointerdown` arrastra la fila (`T.tablero.arrastrarFila`). `.per-combo`, `.per-color` y `.per-etq`
  desaparecieron con la columna de 250 px.
- `#celda` (el «+» de la celda) va con `z-index: 3`, por encima de la cadena resaltada (`.cadena.ruta`,
  z 2): con un nodo seleccionado, si no, el clic caía en la cadena y no se podía crear nada entre dos
  nodos. `zonaUtil()` (desde dónde se puede soltar) es el borde derecho visible de la columna de
  tramas, no `GUTTER`: así funciona con la columna contraída por CSS.
- **Columnas** (Leo, 16-09-2026, «como en Excel web»; también en Personajes, no hay nada parecido para las horizontales,
  que son las tramas): bajo los nombres de los actos, la **tira de cabeceras** del eje (`.cols`, alto `--eje-col`, una
  `.col[data-col]` por celda global con su número si la escala llega a 22 px). **Una columna es la raya vertical donde se posan los nodos** (Leo, 16-09-2026: la banda de celda de
  la 1.0.49 hacía creer que lo elegido era el hueco de al lado y que un cuadro eran dos nodos), así que la cabecera va
  centrada en la raya (`left: px(c) - g/2`) y lo elegido se pinta como una raya de 2 px de arriba abajo (`#colsCapa` con una
  `.col-marca` por columna, z 6: sobre los nodos y bajo el eje y la columna de tramas), con los nodos que están sobre ella
  encendidos (`.pt.en-columna`) y la barra diciendo qué se llevaría («2 nodos · 1 salto»). **Elegir**: clic una, arrastrar el rango,
  Mayús extiende desde el ancla, Cmd/Ctrl suma o quita sueltas; Esc o un clic en el tablero las sueltan, y elegir columnas
  suelta los nodos elegidos (y al revés) y sale la barra flotante `#colBarra`
  (`.multi-barra.col-barra`: «N columnas · ＋ Izquierda · ＋ Derecha · Eliminar · Soltar»); el clic derecho en una cabecera
  abre el mismo menú sin tocar lo elegido (si no estaba elegida, la elige). **Insertar** mete tantas columnas como haya
  elegidas (Excel) a un lado o a otro, y quedan elegidas las nuevas; **Supr** o «Eliminar» las borra con confirmación
  (`m.resumenColumnas` para el texto: nodos, saltos, notas y los actos que se quedarían sin columnas). En el modelo:
  `insertarColumnas(cg, cuantas, lado)` (las añade al acto que contiene esa columna, hasta `MAX_CELDAS`),
  `moverColumnas(cgs, delta)` (**arrastrar la cabecera de una columna ya elegida mueve las elegidas con lo que tengan
  dentro**, Leo 16-09-2026: se sacan de la cuadrícula y se meten `delta` más allá, lo demás conserva su orden y los actos no
  cambian de ancho —lo que cambia de acto es el contenido—; sueltas, quedan juntas en el destino; la vista previa
  (`previaColumnas`) corre las rayas, los nodos y los trazos hasta soltar, y al soltar lo elegido sigue a las columnas),
  `borrarColumnas(cgs)` (borra sus nodos con `borrarPuntos`, corre lo de la derecha, quita las celdas de atrás hacia
  delante con las posiciones calculadas antes de tocar nada, elimina los actos que se quedan a cero y repara las notas;
  nunca deja el tablero sin columnas) y `resumenColumnas(cgs)`. Por eso `normalizar` ya **no sube el ancho de un acto a
  `MIN_CELDAS`** (respeta desde 1); `MIN_CELDAS` es el mínimo del divisor y de la barra del panel, y **vale 1** (Leo,
  16-09-2026: «lo mínimo que puede tener un acto no debe ser 7, debe ser 1»; antes 6), también para los momentos. Todo entra en
  Deshacer como un paso (lo registra el `render()` de siempre).
- **Delante de la primera columna va un hueco de una celda** (Leo, 16-09-2026: «deja un espacio, como punto 0, pero sin el 0,
  donde no se pone nada»; así la columna 1 no queda pegada a la columna de tramas y su cabecera se ve entera): en tablero.js
  todo lo que pasa de celdas a píxeles va por `px(cg) = MARGEN() + cg * G()` y lo que vuelve, por `celdaEn(x)`; `MARGEN()` es
  una celda. El hueco no es de ningún acto y ahí no sale el «+» de crear (`onMouseMove` lo esconde si `celdaEn < 0`).
- **El alto de carril y del eje los fija la hoja de estilos** (`--fila`, `--eje` en `:root` de
  `css/tramas.css`, 120 y 57 —44 de actos más 13 de la tira de columnas—; la piel de ClapCraft pone 80 y 46): `tablero.js` los lee con
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
- `T.inicial()` es el tablero de partida (3 actos y **solo la trama Principal, sin ningún nodo**; Leo, 16-09-2026:
  «cuando hago un nuevo esquema, me crea por defecto "Inicio", que ya no esté; tampoco la trama secundaria»); `T.ejemplo()` es
  el de muestra del prototipo y solo lo usan las pruebas.
- `modelo.hilo()` devuelve los nodos en el orden en que la historia los visita (recorriendo `flujo()`),
  y `vecinos(id)` los anterior/siguiente para las flechas del panel (por el hilo, o por la propia
  trama si el nodo no está en él).
- Colores: **24 tonos** (Leo, 15-09-2026, `docs/diseno/rediseno-9/`: rojo, ladrillo, cobre, ámbar, oro, lima, oliva, verde,
  esmeralda, teal, turquesa, cielo, azul, marino, pizarra, índigo, violeta, uva, ciruela, magenta, rosa, vino, salvia y gris;
  `PALETA` en modelo.js, los seis de antes conservan su id). Una trama nueva toma el primero libre de `ORDEN_NUEVAS` (tonos
  separados). Los tokens van en `css/tramas.css`, `css/clapcraft.css` y, para las cabeceras de sección del editor,
  `css/clapcraft-editor.css`: los tres con los mismos valores. Cuadro de escena ámbar sobre crema y rombo violeta sobre lila.
  La raya de los carriles y de la tira va al 62 %. El tablero nunca pinta hex; usa `var(--t-<color>)` (tramas, nodos y
  notas), `var(--f-<color>)` (fondo pálido de nota con color y fondos de acto, que siguen siendo seis) y `var(--escena-trazo)` / `var(--rombo-trazo)` (saltos). Los tokens claros y oscuros
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

- `js/claquedraw/versiones.js`: el menú de versiones del documento (barra inferior del editor), el modal de nombre y la
  comparación por párrafos; `comparar`/`bloques` no tocan el DOM y se cargan en Node (`test/versiones.test.js`).
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
  pregunta si hay contenido sin archivo, y sin pestañas queda «Sin proyectos» (ver abajo). Primer arranque: hereda
  `guiones.tramas.doc` si existe (sin borrarlo).
- **Proyectos: «Nuevo proyecto» y «Sin proyectos»** (Leo, 15-09-2026, `docs/diseno/rediseno-13/`: «la pestaña en realidad es un
  proyecto»; el menú Archivo dice Nuevo proyecto…, Abrir proyecto… y Cerrar proyecto). **Nuevo** (Ctrl+N, el «+», `btnNuevo`, el
  menú) ya no crea un «Sin título»: abre la **pestaña de creación** (`.pestana-proyecto`, una sola, en memoria; se puede ir a
  otra y volver; `pantalla = 'nuevo'` en app.js → `body.pantalla-nuevo`, que tapa todo `<main>` con `#nuevoProyecto`).
  `js/claquedraw/proyectos.js` la pinta: lateral de 320 px con nombre (obligatorio: sin nombre, el campo tiembla) y «Dónde se
  guarda» (`carpetaInicial`/`elegirCarpeta`: en Electron `vista.carpetaProyectos` o `~/Documents/ClapCraft`, IPC
  `proyecto:carpeta`/`proyecto:elegirCarpeta`; en el navegador `showDirectoryPicker`, handle en IndexedDB `carpetaProyectos`, o
  «Solo en este navegador»), y a la derecha las plantillas, «Árbol que crea» y «Tramas que crea»; Enter crea (salvo con foco en
  un botón), Esc cancela. **Plantillas** (`js/claquedraw/plantillas.js`, Node, `test/plantillas.test.js`): seis (En blanco,
  Largometraje, Serie de TV, Novela, Cortometraje, Teatro), cada una con un contenedor, carpetas (color: uno de los seis de
  carpeta), esquemas y bibliotecas sueltas; cada esquema lleva los tres actos de siempre y las tramas de la plantilla,
  **sin nodos** (Leo, 16-09-2026: ya no se crea «Inicio»). **Ningún esquema de plantilla trae biblioteca enlazada**
  (Leo, 16-09-2026: «si aún está lo de que al hacer un esquema se cree una biblioteca, quítalo»): las bibliotecas de una
  plantilla son las que se listan aparte, y «En blanco» crea «Contenedor» con un solo «Esquema». La prueba exige que lo
  creado sea exactamente el árbol de la vista previa: **no inventar chips que no se crean** (el diseño decía «8 CAPÍTULOS»
  con dos en el árbol).
  `crearProyecto` (app.js): `biblioteca.crear({ nombre, documentos: plantillas.documentos(id) })`, monta y, con carpeta,
  `archivoEnCarpeta` (Electron: IPC `proyecto:crear`, que no pisa nada y usa «Nombre 2»; navegador: `getFileHandle` en la carpeta
  y `escribirArchivo` comprueba) y `nombrarComoArchivo`. **Sin proyectos** (`body.sin-proyectos`, `#sinProyectos`): al cerrar la
  última pestaña (`quedarSinProyectos`: nada montado, `abiertoId = null`) y en el primer arranque (`vista.iniciada`; salvo si
  hay un tablero de tramas.html que heredar). Riel de 44 px, «Nuevo proyecto», «Abrir un proyecto», **recientes**
  (`guiones.claquedraw.recientes`, ocho como mucho: `recordarReciente` al abrir, crear, «Guardar como…», montar y cerrar un
  proyecto con archivo; clave = ruta o `h:<nombre>` con el handle en IndexedDB `reciente:<clave>`; tono de la plantilla o por
  nombre; `plantillas.estructura` y `plantillas.visto`), y el pie con los atajos y la versión (`editorAPI.version` o
  `package.json`). **Soltar un `.clapcraft`** en la ventana lo abre (Electron: `editorAPI.rutaDe` = `webUtils.getPathForFile`;
  Chrome/Edge: `getAsFileSystemHandle`, queda vinculado; si no, solo leído). Sin proyecto, la franja esconde Guardar y el
  indicador. `npm run test:archivos` arranca sin proyectos (crea uno en blanco sin carpeta) y comprueba crear con carpeta,
  cerrar todo y abrir un reciente, y que ese proyecto se sigue guardando (Leo, 15-09-2026: «ve que el guardado siga
  funcionando»): notas y texto de sección llegan solos a su archivo, cerrar justo tras un cambio lo escribe, reabrir desde
  recientes no reescribe, crear otro proyecto escribe lo pendiente del anterior y, al volver a arrancar, los dos siguen
  vinculados sin reescribirse (53 comprobaciones). En el panel de navegador la tecla Enter de la herramienta no llega al campo: se prueba con
  `KeyboardEvent` sintético.
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
  **Pruebas del archivo** (Leo, 15-09-2026): `test/archivo.test.js` (en `npm test`) pasa un guion con todo
  (esquemas con notas, segmentos y órdenes propios, personajes con su esquema y su biblioteca, papelera, elenco) por JSON y
  gzip y exige que vuelva idéntico; `npm run test:archivos` (`pruebas/archivos-electron.js`, fuera del instalador y
  de `node --test`) arranca `electron/main.js` con los diálogos sustituidos por rutas temporales y comprueba
  Guardar como…, el autoguardado tras arrastrar, expandir, crear notas y editar, Abrir… una copia (igual y sin
  reescribirla) y volver a arrancar (sin reescribir y siguiendo al archivo). Encontraron dos reescrituras sin
  cambios: `normalizar` añadía `segmentosPrimero: false` (ahora solo se guarda si es true) y, al volver a
  arrancar, el guion normalizado tenía las claves en otro orden que el archivo; `escribirArchivo` ya no escribe si
  `mismoContenido` (documentos normalizados, claves ordenadas) aunque el texto difiera. Una copia con otro nombre
  de archivo sí se reescribe una vez al volver a arrancar: el `nombre` de dentro pasa a ser el del archivo.
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
  indicador `#estadoGuardado` (botón, clic = Guardar) ya no enseña el nombre del archivo (Leo, 15-09-2026): «✓»
  (escrito), «●» (cambios sin escribir) o «● Reconectar»; el nombre y la ruta van en su `title`.
- `js/claquedraw/texto.js`: la vista **Texto**. Encima de la cinta del editor va **la tira de una
  trama**: sus nodos dibujados como en el tablero (mismos tokens: `.dot`, cuadro beige, rombo morado,
  cortado, fuera de escena) con el título encima, y a la izquierda el chip de la trama.
  **El editor es un editor normal** (Leo, 16-09-2026: «lo del editor con secciones y el armado de guión resultó ser
  extremadamente molesto, quita esa funcionalidad… pero conserva la línea del tiempo para verla de referencia»). Lo que
  se abre es **un documento**: `esquema.documento` no existe como campo, es una **nota de la biblioteca de guiones del
  esquema marcada como principal** (`nota.guion = { eid, generado, principal: true }`, `documentoEsquema(eid)` y
  `crearDocumentoEsquema`). Se abre con **«Abrir documento»** en la cabecera del esquema (`#abrirDoc`, el único botón
  primario de ahí; `abrirTexto` / `abrirEnEditor` en app.js) y se guarda entero como cualquier nota (`guardarNota`), con
  el título de la cabecera renombrándola. **La primera vez se crea con lo que hubiera escrito en los nodos**
  (`documentoDe` junta las notas de los nodos en el orden del tiempo con `C.guion.estado` y después vacía
  `esquema.notas` con `podarNotasEsquema(eid, [])`): nada se pierde y el esquema deja de llevar texto por nodo.
  **La tira se queda de referencia**: sus nodos ya no llevan a ningún sitio; un cuadro o un rombo sigue pasando la tira
  a la trama del otro extremo (`saltar`, `.pos`), que es mirar, no navegar. **Un nodo ya no abre documentos**: ni el
  doble clic en el tablero, ni el panel (se quitó «Abrir documento» de ahí, Leo), ni la cronología (`o.abrirNodo` lleva
  al nodo en el esquema). Desaparecieron las secciones (`.cd-seccion`, `partir`, `volcarSecciones`,
  `repararSecciones`, `irASeccion`, `renombrarEnHoja`, `#editor.con-secciones`), la barra de guión y `revisar.js`.
  **Varios guiones del mismo esquema: sus versiones** (Leo, 16-09-2026: «que ya no exista esa opción [la bandeja de
  guiones]; en su lugar implementa algo así… al guardar versión que se abra un modal que me pida el nombre»), en
  `js/claquedraw/versiones.js`. El documento guarda dentro suyo sus instantáneas (`nota.versiones = [{ id, nombre,
  guardada, html, characters }]`; modelo: `versionesDe`, `version`, `guardarVersion`, `cargarVersion`,
  `renombrarVersion`, `eliminarVersion`). En la barra inferior del editor, **`#cdVersiones`** (junto a «Exportar», con el
  nombre de la versión que hay en el editor) abre el menú: la lista con su fecha y sus palabras, la que coincide con el
  texto de ahora marcada **«Actual»**, y abajo **«Guardar versión…»** (pide el nombre en `#dlgNombre`) y **«Comparar con
  la actual…»**. Pulsar una la carga (si lo de ahora no está guardado, pregunta antes; `C.texto.soltar()` evita que el
  texto viejo vuelva a la nota al recargar el editor), el doble clic la renombra y su «×» la elimina. **La comparación**
  (`comparar(a, b)`, sin DOM, `test/versiones.test.js`) enfrenta los dos textos por párrafos (subsecuencia común más
  larga) y los pinta en una capa: lo igual apagado, lo añadido en verde y lo quitado tachado en rojo.
  **Una trama sin nodos** enseña su aviso («Esta trama aún no tiene nodos…») **encima de la raya**, donde irían los títulos
  (`.hilo-pista.vacia .hilo-vacio`, absoluto; 1.0.79): centrado, la raya lo tachaba.
  `C.texto.abrirDocumento(doc, ganchos, { tira })` es el único camino para abrir un documento: con `tira` manda la
  cabecera de la vista (`#textoCab`), sin ella (una nota de biblioteca) mandan las migas.
  Al pasar el ratón por un nodo, el globo `#tip` del tablero (el mismo elemento) enseña debajo el
  título y la descripción del esquema. El tema va en los dos sentidos: el botón de la cabecera cambia el
  del marco, y un `MutationObserver` sobre `html[data-theme]` del marco avisa a la página si el editor
  lo cambió desde su barra inferior (`o.alTema`).
  Habla con el editor por `Ed.document` del marco; al cargar el marco parchea `Storage.prototype` de esa
  ventana para que el autoguardado del editor (`guiones.editor.doc`) vaya a
  `guiones.claquedraw.editor.doc` y no pise el documento de `index.html` a solas.
- **El documento de un esquema vive con él** (Leo, 16-09-2026): cada esquema tiene una **biblioteca oculta**
  (`sub.guionEid`, `bibliotecaGuiones(eid)`, id `<eid>:guiones`) que **no sale en el árbol** (`subsDe`, `nivelArbol`,
  `sueltosDe` y `cuentaCarpeta` la saltan), se muda con él (`colocarEsquema`) y se va con él a la papelera
  (`eliminarEsquema`); quitar el enlace con la biblioteca no la toca. Dentro va **una sola nota**, la marcada
  `nota.guion.principal` (`documentoEsquema`, `crearDocumentoEsquema`; `crearGuion` marca la primera), y sus versiones
  dentro de ella. `moverNota`: no sale de ahí ni entra nada. **Ya no hay pestaña GUIONES, ni bandeja, ni «＋ documento»**
  (Leo, 16-09-2026): los documentos que hubiera de más pasan a ser **versiones** del principal al abrir el archivo
  (`versionarGuiones`), y sus segmentos desaparecen. Los guiones de archivos anteriores a la 1.0.50 se mudan solos al
  normalizar (`mudarGuiones`).
    **Secciones de una biblioteca** (Leo, 16-09-2026: «que ya no aparezca lo de guiones; en su lugar, que cree nuevas secciones
  que tengan segmentos»): `sub.secciones = [{ id, nombre }]` y `etiqueta.seccionId` (sin él, la sección de partida
  «Segmentos», la única con bandeja). Modelo: `seccionesDe`, `crearSeccion`, `renombrarSeccion` (sin repetir),
  `eliminarSeccion` (sus segmentos vuelven a la de partida), `colocarSeccion`, `cambiarSeccion(etq, seccionId)` y
  `etiquetasDe(subId, seccionId)` (sin el segundo argumento, todas). La vista pinta un `.gd-bloque` por sección
  (`bloqueSeccion`, claves `segmentos` y `sec:<id>` para contraer y expandir), cada una con sus segmentos y su «＋ nuevo
  segmento», el ⋯ de la sección (renombrar, nuevo segmento, eliminar) y, al final del cuerpo, «＋ Nueva sección»
  (`[data-gd-nueva-seccion]`); un segmento se lleva a otra sección arrastrándolo a su tablero o con «Mover a sección…», y las
  secciones se reordenan arrastrando su título (la de partida se queda la primera). El orden de las tarjetas de la sección de
  partida sigue en `ordenSegmentos` (con la bandeja); el de las demás es el de sus segmentos (`colocarEtiqueta`). **Exportar** (`js/claquedraw/exportar.js`): botón en la barra inferior del editor
  (`#cdExportar`, con borde y sin color de acento: Leo no lo quiere morado) y en el ⋯ del guion; menú PDF / Word /
  Texto (`C.gestor.pop`, en la página: como un clic dentro del marco no le llega, texto.js lo cierra en el `mousedown` del
  marco y el mismo botón lo abre y lo cierra; Esc cierra cualquier menú abierto, oyente en captura del documento). Se exporta
  **lo que hay abierto en el editor** (`documentoAExportar`: el documento del esquema, un guion o una nota de biblioteca). PDF: HTML imprimible en Carta con Courier Prime (`aImprimible`); en Electron `editorAPI.guardarPdf`
  → IPC `pdf:save` (ventana escondida, `printToPDF`, las fuentes por su ruta en `fonts/`), en el navegador el diálogo de
  imprimir. Word: un .docx hecho a mano (`docx`: document.xml con sangrías de guion y un zip sin comprimir, CRC32 propio).
  Texto: párrafos con una línea en blanco, personaje/paréntico/diálogo seguidos. `npm run test:archivos` escribe un documento y
  comprueba los tres archivos (`PRUEBA_EXPORTADOS=carpeta` los copia para mirarlos).
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
  · **Grupos del árbol** (Leo, 16-09-2026, `docs/diseno/rediseno-14/`: «que se puedan unir más… no tiene una funcionalidad
    en sí, es solo para armar grupos», «quiero meter grupos dentro de grupos», «este mismo sistema ponlo en personajes»).
    Sustituyen al **enlace** de uno con uno (`esquema.subId`, que desaparece del archivo: `agruparEnlaces` lo convierte en un
    grupo de dos al normalizar). `contenedor.grupos` y `datos.gruposElenco` = `[{ id, nombre, color, padreId, carpetaId,
    items }]`: juntan piezas (esquemas y bibliotecas; en Personajes, personajes) y **otros grupos**, anidados como carpetas;
    **un grupo de uno vale y uno vacío también** (Leo, 16-09-2026: «quiero poder crear grupos vacíos»): ya **no se
    deshacen solos** —`_limpiarGrupos` no hace nada y `sanearGrupos` los conserva—, solo desaparecen con «Deshacer el
    grupo», y el ⋯ de cualquier pieza ofrece «Un grupo con este solo» en «Agrupar con…».
    **Se crean vacíos** con «Nuevo grupo…» en el ⋯ de un contenedor, de una carpeta o de los dos contenedores de
    Personajes, y «Nuevo grupo dentro…» en el de un grupo (`nuevoGrupo(ambito, { carpetaId, padreId })` en gestor.js →
    `crearGrupo(ambito, [], nombre, color, op)`, que ya acepta la lista vacía).
    **La cabecera de un grupo lleva su «⋯»** (`.gd-arb-mas`, Leo 16-09-2026: «ponle unos tres puntos a los grupos del
    árbol para poder agregar nuevos elementos»): abre el mismo menú del grupo, que empieza por «Nuevo esquema…» y
    «Nueva biblioteca…» (en Personajes, «Nuevo personaje…»; en sus esquemas, «Nuevo esquema…») y **lo creado entra en
    el grupo** (`nuevoHijo(cid, tipo, carpetaId, grupoId)` y `nuevoPersonajeEn(carpetaId, grupoId)` llaman a `aGrupo`). Al renombrarlo, el campo va **dentro de su
    cabecera, que es un `<button>`**: escribir un espacio activaba el botón, abría su menú y el campo perdía el foco, así
    que el nombre volvía al de antes (Leo, 16-09-2026); mientras se edita, `editarEnSitio` traga los clics de ese botón. Modelo: `grupo(gid)` →
    `{ ambito, grupo }`, `grupoDe(id)` (el que lo contiene: una pieza por `items`, un grupo por `padreId`), `gruposDe`,
    `nivelGrupo(gid)` (lo de dentro, en el orden del árbol), `crearGrupo(ambito, ids, nombre, color)`, `aGrupo`,
    `sacarDeGrupo`, `renombrar/colorear/deshacerGrupo`, `_nivelar` (todo lo suyo en su misma carpeta) y
    `moverACarpeta('grupo', …)` (se muda con todo, incluso de contenedor). **`crearEsquema` crea solo el esquema**
    (Leo, 16-09-2026: ya no le hace una biblioteca ni un grupo); `enlazar(a, b)` agrupa o mete en el grupo del otro, y
    `quitarEnlace(id)` saca del grupo.
    **`enlace(id)` se deduce del grupo** (el primer esquema y la primera biblioteca que lo comparten) y sigue valiendo para
    «Ver biblioteca», «Ver esquema» y el chip del acto. **Arrastrando** (`colocarEnArbol`): lo que se suelta **va a donde
    vive aquello junto a lo que cae** (su carpeta y su grupo), así que se mete y se saca de un grupo con solo arrastrar; un
    grupo se arrastra por su cabecera y **cae dentro de otro** si se suelta en la mitad de abajo de su cabecera (en la de
    arriba queda delante, como hermano; nunca dentro de uno suyo).
    **Dónde va a caer se ve en una raya** (`marcaCaida`, `.gd-caida`; Leo, 16-09-2026: «mover entre grupos pareciera que
    quiero meter un grupo dentro de otro»): en lugar de resaltar la caja, se pinta la raya en el sitio exacto y **con la
    sangría del nivel de destino** —al ras del grupo si queda al lado, dentro de su caja y con su color si entra en él—,
    y lo que entra en un grupo o en una carpeta se coloca **el primero**, justo donde se vio la raya. Los destinos que no
    son una posición (un contenedor, una biblioteca, la papelera) se siguen resaltando enteros. El árbol se recoloca **animado** (`animarArbol`, mejorado el 16-09-2026):
    cada fila y cada grupo viajan de donde estaban a donde quedan (el tiempo crece con la distancia, 200–380 ms), una
    caja que **gana o pierde algo anima su alto** en lugar de saltar —y entonces lo de dentro se anima por su cuenta, que
    con la caja rígida viaja con ella—, lo que **llega nuevo** entra con un pequeño desvanecido y lo movido se marca un
    instante donde cae (`.gd-aterriza`). La identidad de cada fila es **su id** (no su `data-sub` entero), así una pieza
    que cambia de contenedor viaja en lugar de aparecer de nuevo. Lo que se arrastra se ve en un fantasma compacto (de un
    grupo, solo su cabecera). En el árbol cada pieza tiene su
    fila y el grupo las envuelve en `.gd-arb-grupo` (no `.gd-grupo`, que ya es de las tarjetas): cabecera `.gd-arb-marca`
    con el nombre y la cuenta y una barra del color del grupo a la izquierda (`nivelGrupo` se pinta dentro, recursivo).
    Su cabecera se arrastra para mover el grupo (el `pointerdown` la deja pasar aunque sea un `<button>`, y va antes del
    `return` de `.gd-hijos`), el doble clic en ella lo renombra en sitio y su clic (o el derecho) abre el menú del grupo
    (renombrar, color, deshacer), y el ⋯ de cada pieza lleva
    «Agrupar con…» / «Sacar del grupo» y «Cambiar color». **En Personajes no hay carpetas** (Leo): `crearCarpeta` las
    rechaza, `normalizar` vacía `carpetasElenco` y quita `personaje.carpetaId`; se agrupa con los mismos grupos.
    En el árbol las etiquetas son solo la inicial (**E**, **B**, **P**) para que quepa el nombre; en las cabeceras van
    enteras. Y el punto de cada fila (`.gd-sub-punto`, del enlace de antes) ya no se pinta.
  · **Color de las etiquetas** (Leo, 16-09-2026: «igual que lo haces en personajes»): `esquema.color` / `sub.color` es uno
    de los 16 pares de `PALETA_ETIQUETAS` o no existe, y entonces vale el de siempre (violeta el esquema, azul la
    biblioteca). `colorearHijo(id, col)` (con `null` lo quita) y, en el árbol, el chip se pinta como el de un personaje
    (`.gd-chip.per-chip` con `--chl/--chd`).
    **Un clic en el nombre de un contenedor no hace nada** (Leo); el chevrón pliega.
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
  poda su nota). «Ver esquema» monta el esquema. Quitar el enlace hace desaparecer la sección y
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
  (`editando`). **Todas las ramas del doble clic cancelan ese clic pendiente** (`sinClicPendiente()`, Leo 16-09-2026:
  las filas de esquema y biblioteca, los contenedores, los personajes y los grupos no lo hacían, así que el `render()`
  de abrir se llevaba por delante el campo y parecía que no se podía renombrar). El editor se precarga escondido al arrancar (`C.texto.precargar`). La barra se
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
  `ordenarSecciones(subId, cronologiaPrimero)`, guardado en la biblioteca como `segmentosPrimero`: por defecto la cronología va arriba).
  **Cada sección se contrae y se expande** (Leo, 16-09-2026): su título lo pinta `seccionHtml(clave, titulo, n, muestra)` con el
  chevrón `[data-gd-plegar-seccion]` (→ `.gd-bloque.plegada`, sin su tablero) y, al otro extremo de la raya,
  `[data-gd-grande-seccion]` (→ `.gd-cuerpo.con-grande` + `.gd-bloque.grande`: esa sección ocupa el lienzo ella sola, la otra no se
  ve y sus tarjetas crecen hasta `min(52vh, 480px)`), que solo sale si hay dos secciones. Las dos cosas van en la vista
  (`vista.secPlegadas`, `vista.secGrande`; no viajan en el archivo) y las aplica `aplicarSecciones()` tras cada render; contraer la
  expandida deshace la expansión y expandir una contraída la despliega. Con una expandida, la otra no se ve: no se intercalan
  (el arrastre del título cuenta las visibles). «Ver esquema» va al
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
  (`soltarEditor`). **Datos y árbol propio** (Leo, 16-09-2026, `docs/diseno/rediseno-14/`): dos contenedores
  **ocultos** (fuera de `contenedores()`, `migrarEsquema`, `primerEsquema` y restaurar) que forman el árbol de
  Personajes, con las mismas piezas que el de contenedores (carpetas, grupos, orden, arrastre):
  · **«Personajes»** (id `personajes`, `personajes(crear)`): **un personaje es su biblioteca**
    (`bibliotecaPersonaje(id, nombre)`, `sub.lineaId`, que la crea al abrirlo). Pulsar su fila abre esa
    biblioteca como cualquier otra (`abrirPersonaje` → `C.gestor.abrirSub`), con sus secciones, sus segmentos y
    «＋ Nueva sección»; delante va la sección **«Apariciones»** (`bloqueApariciones`: las notas donde se le
    nombra con «/», con su ruta; no se ordena ni se arrastra y se queda la primera). En el árbol la fila sigue
    siendo un personaje (chip **P** con su color, ⋯ con abrir, renombrar, color, mover a carpeta, agrupar,
    eliminar; `menuCarril` sigue dando la lista del elenco al tablero) y **vuelven las carpetas**
    (`datos.carpetasElenco`, `personaje.carpetaId`, ámbito `C.ELENCO_CARPETAS`; Leo: «regresa la opción de
    agregar carpetas ahí»), además de los grupos. Eliminar un personaje manda su biblioteca a la papelera y
    deja sin personaje sus carriles.
  · **«Esquemas»** (id `personajes:esquemas`, `esquemasPersonajes(crear)`, `C.ID_ESQUEMAS_PERSONAJE`): los
    **esquemas de personaje**, documentos sueltos con sus carpetas, grupos y orden, que se renombran, se
    ordenan y se eliminan como los de cualquier contenedor. Uno nuevo (el «＋» o el ⋯ del contenedor) **pide
    un personaje** (`menuCarril`, `o.nuevoEsquemaPersonaje`) y nace con los tres momentos y **su primera
    trama**, que a partir de ahí se edita y se borra con normalidad (`crearEsquemaPersonaje`, sin biblioteca
    enlazada ni guiones). `esEsquemaPersonaje(eid)` (vive en ese contenedor) es lo que enciende el modo
    Personajes del tablero. Ya no hay un tablero por personaje: los de antes
    (`personajes:esquema:<personaje>`) se mudan aquí al abrir el archivo y los que estaban vacíos se descartan
    (`mudarEsquemasPersonaje`).
  Los dos contenedores se pintan con `filaContenedor(c, op)` (`op.sistema`: no se arrastran, no se renombran
  y su ⋯ solo crea), y el pie del menú (Contenedores · Personajes · Papelera) cambia `vista.arbol`
  (`o.enPersonajes()`), que ya no es un `vista.modo`: en Personajes la pantalla puede ser una biblioteca, un
  esquema o el editor, como en Contenedores. Desaparecen el carrusel `#personajesSeg`, `body.vista-personajes`,
  `body.sin-personajes` y los expandidos `per-esq-grande` / `per-seg-grande`.
  **Todos los carriles son iguales** (Leo, 16-09-2026): en la columna compacta, el clic en el círculo de cada uno
  (lo prepara `marcarPersonaje()` tras cada render) abre el menú para elegir personaje, quitarlo o eliminar
  el carril; ya no hay carril dueño fijo. «Eliminar el carril» vale también para el
  principal si queda otro: antes de `borrarLinea` otra pasa a principal (ahí «principal» no significa nada, el
  tablero va en modo simple). `podarElenco` cuenta los carriles de cualquier esquema. El panel del nodo va
  **abajo también aquí** (`panelAbajo(true)` siempre, Leo: «solo agrega el panel inferior en lugar del
  sidepanel») y elegir un carril abre el panel de la trama, como en cualquier esquema. El círculo del carril lleva
  las dos primeras letras del personaje con el color de su etiqueta (ver «Carriles de un personaje» arriba).
  **Los personajes solo se crean con «/» en el editor y en el menú lateral**
  (Leo): «Nuevo personaje» y «＋ personaje» abren un diálogo con nombre y color (`#dlgNombre` con
  `[data-dlg-colores]`, `C.gestor.pedirPersonaje`; el primer color libre marcado) y abren su tablero. **En el
  tablero solo se eligen**: «＋ personaje» (`#addLinea`, capturado en `#rows`: sin elegir
  Secundaria/Alternativa) abre la lista de los que aún no tienen carril (`C.gestor.menuCarril(trigger,
  { titulo, actual, salvo, alElegir, alQuitar })`) y crea un carril secundario con el elegido
  (`carrilNuevo`); el selector de un carril ofrece lo mismo más «Quitar el personaje» (el carril se queda, sin personaje) y
  **Doble clic en un carril** (su nombre, su etiqueta o el hueco de la columna, no el círculo de color) abre la biblioteca de ese
  personaje (Leo, 15-09-2026; oyente de `dblclick` en `#rows` de app.js, que cierra el menú del selector que abrió el primer clic). También vale el segundo clic de un doble clic (`click` con `detail` 2,
  `stopImmediatePropagation` para que el oyente del selector no reabra su menú). **Con la ventana enfocada y tiempos de ratón reales
  el `dblclick` no llega**: el primer clic abre el menú del selector (se lleva el foco) o elige el carril y el tablero redibuja la
  fila, y el segundo cae en otro elemento; `click.detail` sí llega a 2. En el panel y en Electron con `sendInputEvent` sin enfocar la
  ventana el `dblclick` sí llegaba y la prueba engañaba (Leo: «no me funciona»); para probar dobles clics, `win.focus()` y pausas de
  ~180 ms. El selector ofrece además «Ir a «Nombre»» (`menuCarril` con `alIr`).
  **Relaciones reflejadas** (Leo, 15-09-2026, `js/claquedraw/relaciones.js`, Node, `test/relaciones.test.js`): al guardar un
  esquema de personaje (`volcar`), cada salto entre carriles de dos personajes se marca (`salto.rel`, que modelo.js conserva) y
  aparece igual, dos celdas después de lo último de su línea del tiempo, **en los demás esquemas de personaje donde los dos ya
  tienen carril** (Leo, 16-09-2026: con los esquemas sueltos ya no hay «el tablero del otro»; no se inventan esquemas ni
  carriles). Con la marca no se duplica ni rebota. **Borrarla en un esquema la borra en los demás** (`borrarReflejos`, antes de
  guardar: las `rel` que tenía guardadas y ya no tiene, por la relación, un extremo, el carril o un bloque, se quitan de los
  otros con sus dos extremos). **Renombrarla la renombra en los demás** (`renombrarReflejos`, también antes de guardar: al
  crearla, el primer guardado automático reflejaba el nombre propuesto «Relación» y el que se escribía después no llegaba, Leo
  15-09-2026). Moverla no mueve el reflejo, y no copia el documento de la relación.
  «Eliminar el carril» (`eliminarCarril` en app.js, Leo 15-09-2026: no había forma de quitar un carril porque ahí el panel de la
  trama no se abre; con eventos pide confirmación y se va con ellos; entra en Deshacer). El carril lleva el
  color de su trama, como en cualquier esquema (Leo, 15-09-2026: antes tomaba el de la etiqueta del personaje,
  `.row.con-color`, que desapareció; la etiqueta sigue en el menú y en el chip de la cabecera). **Nombres en ese
  tablero**: `modelo.nombres` (modelo.js: `nombre(pieza)`, `forma(tipo)`, `femenino(tipo)`) llama
  «Evento» al nodo (título de partida, menú «Crear en…», panel) y «Relación» al cuadro (título, «Relación
  a…», avisos, confirmación con concordancia «esta relación»); fuera de Personajes siguen «Punto nuevo»,
  «Nodo» y «Cambio de escena». El panel lateral también usa `nombre('acto')`/`nombre('linea')`
  («Momento», «Fondo del momento», «Eliminar momento», los títulos del eje) y el aviso de «al menos un
  momento». El nombre del personaje va con la misma letra en el menú (`.gd-per-nom`) y en el nombre asomado del
  carril: Plex Mono 400 13 px, 500 el activo (la mono va empaquetada en 400/500; un
  600 salía con negrita sintética); sin cursiva en «Sin personaje». **Cambiar de esquema sin brincos**:
  `montarEsquema` guarda y devuelve el desplazamiento de cada tablero (`desplazamientos`, en memoria; uno
  nuevo empieza en 0,0): antes se heredaba el del anterior. **La app vuelve a la última pantalla** (Leo, 16-09-2026: «que cuando cierre y abra el programa me deje en la última
  pantalla que estaba»; antes arrancaba siempre en Contenedores y en el primer esquema): por proyecto se apunta en
  `vista.pantallas[guionId]` qué vista estaba delante, en qué árbol, qué esquema montado, qué biblioteca abierta y qué
  nota (`recordarPantalla` en app.js, desde `persistir`, `verVista`, `montarEsquema` y el gancho `alNavegar` del
  gestor —`navegar`, `abrirNota` y `cerrarNota`—), y `restaurarPantalla` lo repone al montar el proyecto, con lo que
  siga existiendo (si no, el primer esquema, como antes). Vive en la vista, no en el archivo: es de esta máquina. **Mientras se repone no se apunta nada** (`reponiendo`, 1.0.78): el arranque llama a `persistir()` antes de montar y eso pisaba lo guardado con «sin esquema», así que siempre se abría el primero; la biblioteca solo se reabre si la vista era Documentos (el gestor la recuerda aunque delante esté el esquema) y `montar` ya no salta a Personajes por su cuenta. Al acercar el puntero a un borde del tablero
  de segmentos se desplaza solo (`autodesplazar`, cada 16 ms) para llegar a los que no se ven; mientras dura
  el arrastre `render()` no redibuja (`renderPendiente`: si no, el persistir de fondo se llevaba lo
  arrastrado). Las notas llevan la fecha en todas partes (Leo: todo lo que va dentro de un segmento). Las notas de los nodos guardan `modificado`
  (`guardarNotaEsquema` lo pone solo si cambió el contenido; `docDe` lo conserva).
  **Segmentos y notas en general** (Leo, 14-09-2026): al pasar el ratón por el nombre de un segmento, acto,
  momento o bandeja sale el globo `.gd-globo` con su nombre completo (`.gd-etq-nom[data-globo]`, 350 ms,
  debajo del nombre). Las notas que son nodos de una línea de tiempo (cronología, momentos, apariciones de
  tipo nodo) llevan su símbolo como en el tablero (`glifo(tm, p)`: `.gd-glifo--punto` con aro del color del
  nodo o de su trama, `--cuadro`, `--rombo`; apagado si está descartado). **Un personaje ya no tiene segmentos de momentos**
  (Leo, 15-09-2026; `tarjetasActos` desapareció, y con la cronología fuera de las bibliotecas el chip del acto de la cabecera
  del editor ya no abre nada: `puedeVerSegmento` da false): Apariciones, bandeja y sus segmentos. La
  biblioteca de un personaje **estrena el segmento «Hoja de personaje»** (`C.HOJA_PERSONAJE`, en `bibliotecaPersonaje`, con el
  color del personaje) una sola vez (`sub.hoja`): renombrado o borrado no vuelve, y las de antes lo reciben al abrirse. Las claves
  `acto:<id>` que quedaran en `ordenSegmentos` se ignoran. **La cabecera de una nota de biblioteca** (`#migas`) es como la de un documento de nodo: 50 px,
  «CONTENEDOR [biblioteca] [segmento] título», el título es un campo que renombra la nota
  (`C.texto.fijarTitulo` escribe el título del editor, que al guardarse la renombra; no se redibuja mientras
  se escribe), «Ver biblioteca» (en Personajes, «Ver personaje») y ‹ › a la nota anterior o siguiente de su
  segmento. El nombre de la nota abierta va en `migas.dataset.migaNota`, **nunca `data-nota`**: el `pointerdown` del
  tablero de tramas (en `document`) tomaba cualquier `[data-nota]` por uno de sus post-it y hacía
  `preventDefault`, y el campo del título no recibía el foco (ahora el tablero solo mira `#board [data-nota]`).
  **Orden propio de actos, momentos y sus documentos** (Leo, 14-09-2026): las tarjetas de la cronología y del
  biblioteca se ordenan arrastrando su cabecera (entre las de su sitio) y sus documentos dentro de su tarjeta,
  sin tocar la línea de tiempo: se guarda en la biblioteca (`sub.ordenActos = { actos, nodos: { actoId } }`,
  `colocarActo` / `colocarNodoActo`, `ordenActos` / `ordenNodos` lo aplican; lo nuevo entra detrás de su vecino
  natural) y `tarjetasActos(…, subId)` lo usa. **Arrastre en vivo** (Leo: «que se vea posicionado donde lo pondría y desplace a los de al lado»): segmentos
  de una biblioteca (`'etq'`), actos de la cronología (`'acto'`), documentos dentro de su acto (`'nodo'`) y
  notas dentro de su segmento o a otro del
  mismo tablero (`'nota'`) **se recolocan de verdad en el DOM mientras se arrastran** (`colocarVivo`, por la
  mitad horizontal de la tarjeta o la vertical de la nota) y los vecinos se apartan con animación FLIP (`flip`,
  Web Animations, 180 ms); al soltar se guarda el orden que se ve (con `pointercancel`, `devolverAlOrigen`).
  Una nota llevada a la barra lateral o a la papelera vuelve a su sitio y se marca el destino, como antes.
  Mano en lo que se arrastra, al pulsar se levanta (`.agarrado`, `body.gd-agarrando`), lo arrastrado queda en
  hueco punteado y lo sigue un fantasma con forma de tarjeta (`fantasmaTarjeta`). Mover y soltar se oyen en
  `window`: recolocar el elemento le quita la captura del puntero. **Las tarjetas de segmentos tienen un solo orden**
  (`sub.ordenSegmentos`, que también lee el antiguo `ordenCarrusel`; `ordenSegmentos` / `colocarSegmento`),
  con claves `bandeja` y `etq:<id>` en una biblioteca (las de `apariciones` y `acto:<id>` de antes se ignoran):
  todas se mueven entre sí, la bandeja incluida (tipo de arrastre `'orden'`, contenedor
  `[data-orden][data-sub]`, tarjetas `[data-clave]`); sin orden guardado, el natural (bandeja y segmentos;
  Apariciones, bandeja, momentos y segmentos), y lo nuevo entra al final. Todas llevan el asa de seis puntos
  (`.gd-asa`) en la cabecera, también actos, momentos, Apariciones y bandeja. **Nombre al crear**: una nota
  nueva (`nuevaNota`) y un nodo nuevo del tablero (`nombrarRecien` en tablero.js, tras crear nodo o salto desde
  el menú o arrastrando el «+») quedan con el nombre propuesto escrito y seleccionado en sitio, como un segmento;
  en blanco se queda el propuesto («Sin título», «Punto nuevo», «Evento», «Cambio de escena», «Relación»); en
  un salto el otro extremo toma el nombre si seguía con el propuesto. `aplicarOrden` pone lo nuevo detrás del último de sus predecesores
  naturales. **Segmento expandido** (Leo, 15-09-2026, `docs/diseno/rediseno-5/Pantalla_Segmento.dc.html`): todas las
  cabeceras de segmento (bandeja, segmentos, actos de la cronología, momentos y Apariciones) llevan el icono
  `ic-expand` (`[data-gd-expandir]`); `C.gestor.expandir(subId, clave, sel)` guarda `expandido = { subId, clave }`
  (las claves de `ordenSegmentos`) y el segmento ocupa el lienzo: en una biblioteca, `renderMain` pinta
  `vistaExpandida` en lugar del tablero (también en la biblioteca de un personaje). Cabecera «CONTENEDOR [Biblioteca] Nombre ›
  [Segmento] Nombre» (las dos primeras migas contraen), banda del color del segmento con cuenta, lápiz y ⋯ (solo
  segmentos) y «Contraer» (`ic-collapse`, también Esc), y la rejilla `.gd-exp-grid` con título, primeras líneas
  (`textoDe`) y fecha; la nota `sel` va con el borde de acento. Notas y documentos se ordenan arrastrando en la
  rejilla (mismo arrastre en vivo, leído por filas; «＋ nota» se queda al final); Apariciones van punteadas con su
  ruta y no se ordenan. `navegar` a otra biblioteca, «Ver biblioteca»/«Ver personaje» y «Ver esquema»
  (`C.gestor.contraer()`) lo cierran. **La etiqueta del segmento en la cabecera del editor** (antes un `.gd-tag` de
  9,5 px) es un chip de 24 px con el color del segmento (`.gd-seg-chip`, bandeja punteada) y abre ese segmento
  expandido con la nota marcada; en un documento de nodo, el chip del acto (`[data-texto-acto]`) abre el acto o
  momento en la biblioteca enlazada (`o.verSegmento`, `bibliotecaDelEsquema` en app.js; sin biblioteca —los esquemas de
  personaje no la tienen— queda deshabilitado). **Cabeceras con nombres en los chips** (Leo, 15-09-2026: le gustó la de la nota
  y pidió homologarla): cada lugar va en un chip con su nombre y el color dice qué es (violeta esquema, azul
  biblioteca, el color del segmento, el fondo del acto o momento, el del personaje con `per-chip`), y en negrita solo
  el documento abierto. Vista Esquema «CONTENEDOR [esquema]» (en Personajes, «PERSONAJES [personaje]»); biblioteca
  «CONTENEDOR [biblioteca]» y la sección «CRONOLOGÍA [esquema]»; nota «CONTENEDOR [biblioteca o personaje]
  [segmento] Título»; documento de nodo «CONTENEDOR [esquema o personaje] [acto] Título» (`[data-texto-esq]` va al
  esquema, `o.esquemaChip`); segmento expandido «CONTENEDOR [biblioteca o personaje] [segmento]» (el primero
  contrae). Los chips se hacen con `chipNombre(nombre, clase, op)` (`.gd-chip-nom`, cortados a 260 px con el nombre
  entero en el `title`). «Ver biblioteca» (`abrirSub`) cierra el segmento expandido. **Título de las cabeceras del editor** (Leo, 15-09-2026): en la de un
  nodo (`[data-texto-nom]`) y en la de una nota (`[data-gd-miga-nom]`) el título es de solo lectura (`readonly`, cortado
  con «…») y solo se edita con **doble clic**; Enter lo aplica (el nodo por `fijarTitulo`; la nota por el evento
  `clapcraft:titulo` que oye el gestor) y **Esc o un clic fuera lo dejan como estaba** (`iniciarTitulos` en texto.js,
  oyentes en captura). Las etiquetas de su izquierda no encogen (`flex: none`, 180 px como mucho, cortadas): encoge el
  título. Si un título o una etiqueta de una cabecera no cabe, al pasar el ratón sale el globo `.gd-globo` con el nombre
  entero (las etiquetas ya no llevan `title`, sino `aria-label`). La misma regla en el tablero: el nombre de un nodo en
  sitio (`editarEnSitio`) y los de tramas y actos (`onKeyNombre`) **se guardan también al salir del campo** (Leo,
  16-09-2026: «doy un clic fuera y no se me guarda, forzosamente tengo que dar Enter»; antes un clic fuera los dejaba
  como estaban, y eso vale ya solo para Esc, que lo marca con `dataset.cancelar`); al salir no queda texto marcado (`setSelectionRange(0, 0)`: con texto seleccionado y Esc
  el azul se quedaba). Si la cabecera no da para todo, primero encoge el título (hasta 80 px) y solo después las
  etiquetas (hasta 64 px), y por debajo de 720 px de cabecera los botones se quedan en su icono (container query en
  `.texto-cab` y `.migas`). **Otro documento empieza arriba**: al abrir otro nodo u otra nota, `alPrincipio()` devuelve la
  hoja al principio (el cursor ya iba al principio, pero se heredaba el desplazamiento). **Cabecera del editor sin parpadeo**: los botones no encogen (`flex: none`, sin salto de línea) y
  encoge el título; antes, con un título largo, «Ver esquema» se partía en dos líneas y al acortarlo
  volvía a su tamaño de golpe en cada tecla. El chip «Personaje» del título (`.per-chip`), la
  etiqueta «Personaje» de su fila en el menú (`.gd-chip.per-chip`, en lugar del punto de antes, Leo 15-09-2026) y la del carril llevan su par de la paleta en `--chl`/`--chd` y el
  CSS elige según el tema, como el bloque de personaje del editor (claro: fondo `--chl`, tinta `--chd`). **Los cuadros de un salto tienen nota,
  una sola para los dos** (`o.saltosConNota` en texto.js: `claveNota(id)` = `deId` del salto; doble clic y
  «Abrir documento» también en los extremos; cambiar el título renombra los dos). **El editor de ese
tablero no tiene tira** (`o.sinTira` → `#texto.sin-tira`) y **el menú sigue en el árbol de Personajes** con el editor
  abierto desde ahí (`o.enPersonajes()` = `vista.arbol`).
  Un esquema de personaje se monta como cualquiera (`T.tablero.simple(true)`, sin fuera de escena ni camino iluminado;
  `gutter(48)`; `modelo.nombres`; el panel abajo), y la biblioteca de un personaje se ve en la vista Biblioteca con su
  sección **Apariciones** delante, con dos tarjetas: **Apariciones** (notas donde se le nombra, con su ruta; doble clic
  abre) y **«Esquemas relacionados»** (Leo, 16-09-2026): los esquemas donde tiene carril
  (`esquemasDePersonaje(id)` en documentos.js: el suyo primero —el esquema de personaje cuyo **primer** carril es él,
  `principal`—, luego los demás de personaje y al final los normales, con el nombre de su contenedor). Un clic lleva al
  esquema (`[data-ir-esquema]` → `abrirEsquema`); **desde ahí no se añaden ni se quitan**: un esquema entra en la lista
  cuando el personaje tiene carril en él. La etiqueta de la derecha va corta («Suyo», «Personaje» o el contenedor) y lo
  largo se lee en el globo: **cualquier elemento con `data-globo` lo enseña** (con `data-globo-txt` para poner otro
  texto), no solo los nombres de segmento (Leo, 16-09-2026: «se ve muy larga la etiqueta, y necesito un tooltip»).
  **Un esquema de personaje no tiene documento** (Leo, 16-09-2026): su cabecera no enseña «Abrir documento»
  (`$('abrirDoc').hidden` mira `esPersonajes`) y `documentoDe` no le crea ninguno.
  **El doble clic en el círculo de un carril lleva al esquema de ese personaje** (Leo, 16-09-2026), no a su biblioteca:
  `irAEsquemaPersonaje` en app.js monta el suyo (o el primero donde salga) y, si no tiene ninguno, abre su biblioteca.
  «Ir a «Nombre»» del menú del carril sigue llevando a la biblioteca. Menú en Personajes: los dos
  contenedores (`.gd-per`: etiqueta «Personaje» con su color, nombre, ⋯ Abrir/Renombrar/Cambiar color/Mover a
  carpeta/Agrupar/Eliminar; «＋ personaje», «Nuevo personaje»; doble clic renombra) y el pie **Contenedores · Personajes ·
  Papelera**. app.js: `verPersonajes`, `verContenedores`, `abrirPersonaje`, `nuevoEsquemaPersonaje`, `nuevoPersonaje`,
  `renombrarPersonaje`, `colorPersonaje`, `eliminarPersonaje`, `asignarCarril`. El panel del nodo ya no tiene «Estado»
  (descartar sigue en el menú contextual del nodo). `.btn[hidden]`/`.icono[hidden]` llevan
  `display: none !important`.
- **Carpetas** (Leo, 15-09-2026, `docs/diseno/rediseno-7/`): dentro de un contenedor las carpetas anidan sin límite
  (`contenedor.carpetas = [{ id, nombre, color, padreId, plegada? }]`, color = uno de `C.COLORES_CARPETA`, los de las
  tramas: se pinta con `var(--t-…)`) y de cualquier nivel cuelgan esquemas y bibliotecas (`carpetaId`; un esquema y su
  biblioteca enlazada siempre en la misma, `_enCarpeta`/`_aCarpeta`, que mudan el grupo entero si la pieza está en uno). En
  Personajes agrupan el elenco (`datos.carpetasElenco`, `personaje.carpetaId`, ámbito `C.ELENCO_CARPETAS`). Modelo: `crearCarpeta(ambito, nombre, color, padreId)`,
  `renombrarCarpeta` (sin repetir entre hermanas), `colorearCarpeta`, `plegarCarpeta`, `eliminarCarpeta` (lo de dentro
  sube un nivel, no se pierde nada), `moverACarpeta(tipo, id, carpetaId, cid)` (esquema/biblioteca a otro contenedor se
  mudan con su pareja; una carpeta a otro contenedor, con todo lo suyo, `_trasladarCarpeta`; nunca dentro de sí misma),
  `colocarCarpeta`, `cuentaCarpeta`; `colocarEsquema`/`colocarSub` dejan lo soltado en la carpeta de aquel delante del
  que cae (sobre un contenedor, en su raíz). `normalizar` sanea padres rotos y ciclos (a la raíz) y `carpetaId` rotos.
  **Orden del árbol** (Leo, 15-09-2026: «debería poder poner una biblioteca arriba de esta [pareja]»): en cada nivel todo
  va en un solo orden, carpetas, esquemas (con su biblioteca enlazada, una pieza) y bibliotecas sueltas mezclados, y en
  Personajes carpetas y personajes (`contenedor.ordenArbol`, `datos.ordenElenco`: listas de ids; `nivelArbol(ambito,
  carpetaId)` da un nivel ordenado y `colocarEnArbol(id, refId, despues)` pone una pieza delante o detrás de otra,
  mudándola de carpeta o de contenedor si hace falta; una biblioteca enlazada cuenta como su esquema). Los ids que ya no
  están no se podan al normalizar (se ignoran al aplicar el orden): así lo abierto es idéntico a lo guardado.
  Menú: cada nivel en su orden (sin orden guardado, carpetas, esquemas y bibliotecas sueltas); cada fila lleva `--sangria` (2 + nivel × 11
  + 7 px) y la guía de 1 px de su nivel (`::before`); la carpeta (`.gd-carpeta`, 30 px): chevrón, icono y barra de
  2 px de su color, nombre, cuenta y ⋯; pulsarla la pliega o despliega (220 ms de espera: el doble clic renombra). Se
  crean con **«Nueva carpeta…»** en el ⋯ del contenedor, de una carpeta o de un personaje, y en Personajes también con
  la fila «＋ carpeta» bajo «＋ personaje» (`data-gd-nueva-carpeta-elenco`): diálogo `#dlgNombre` con
  nombre y los seis colores (`pedirNombre` acepta `op.paleta`). ⋯ de la carpeta: nueva carpeta, nuevo esquema o
  biblioteca (o personaje) dentro, renombrar, cambiar color, mover a…, eliminar; ⋯ de esquemas, bibliotecas y
  personajes: «Mover a carpeta…». Arrastrando (el mismo trato para carpetas, esquemas, bibliotecas y personajes): sobre
  otra pieza de su nivel, delante o detrás según la mitad; sobre una carpeta, dentro (por su borde de arriba, delante);
  sobre un contenedor, al final de su raíz. En Personajes, soltar sobre «＋ personaje», «＋ carpeta» o el hueco libre del
  árbol lleva a la raíz (`data-gd-raiz-elenco`: si no, un personaje metido en una carpeta no salía arrastrando). La
  marca de «delante o detrás» es solo una raya (sombra de fuera; `.gd-arbol` lleva 4 px de relleno arriba, devueltos con margen negativo,
  para que la de la primera fila no se recorte al arrastrar algo hasta arriba, Leo 15-09-2026): no quita el fondo ni la barra de la fila activa o de la
  carpeta sobre la que se pasa (antes lo hacía y el fondo «desaparecía» al reordenar). Las filas no bajan de
  200 px: si la jerarquía no cabe, `.gd-arbol` se desplaza en horizontal.
- **El menú** (rediseño 2): marca, «＋ Nuevo contenedor», rótulo CONTENEDORES, árbol (`.gd-arbol`,
  fijados primero, orden siempre manual; ya no hay buscador, grupo «Fijados» ni botón de orden) y la
  papelera al pie (`.gd-pie`, sin listar sus notas: un clic abre su tablero). Contenedor 34 px en mono
  mayúsculas con «＋» y «⋯»; hijos de 28 px: punto · chip (ancho fijo) · nombre mono · ⋯. La fila activa
  es lo que enseña la vista (`o.modo()`): el esquema montado en Esquema/Texto, el subcontenedor abierto
  en Documentos; `verVista` redibuja el menú al cambiar. El punto en acento es solo de la fila activa:
  el esquema montado no se marca fuera de su vista (pasaba y parecía seleccionado siempre).
- **La barra de documentos (`#gdSide`) vive en `<main>`, delante de todo, en las tres vistas** (Leo,
  13-09-2026: «debe permanecer incluso si se abre el esquema de pasos»). Se **pliega** a un riel de
  44 px (`vista.ladoPlegado` → `body.lado-plegado`; desde el rediseño «agregando carpetas», 15-09-2026, el
  `.gd-riel` solo lleva el botón de panel para desplegarlo: ni logo, ni nuevo contenedor, ni accesos del pie): botón
  de panel `[data-gd-lado]` junto a la marca, el del riel y `Ctrl/Cmd+Shift+B` (también dentro del marco). Desplegado, su ancho se cambia
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
  por trama y su inicial (`.chip[data-inicial]`, que pone tablero.js) sobre un fondo opaco **sin color** (`--lienzo`; la
  elegida con la banda del acento; Leo, 15-09-2026, como el diseño: antes iba teñido del color de la trama) para que el
  tablero no se transparente al desplazarse; lo mismo el carril de la tira del editor; nombre y tipo se asoman al pasar el ratón (`.label:hover .lbox`, también al renombrar con
  doble clic) y el resto se edita en el panel de la trama. Ya no hay asa ni botón para ensanchar o
  contraer la columna (`#asaTramas`, `#plegarTramas`, `vista.gutter`, `vista.tramasPlegadas` fuera).
  **El panel del nodo va abajo en ClapCraft** (Leo, 16-09-2026, `docs/diseno/rediseno-14/`: «cambié el sidepanel por uno que se
  ve en la parte inferior, debe poder arrastrarse para que crezca hacia arriba»; **aún no en Personajes**, que sigue con el de
  al lado): `T.tablero.panelAbajo(v)` (lo llama app.js en `montarEsquema` con `!esPersonajes`) pone `body.panel-abajo`, que en
  la piel gira `.esq-cuerpo` a columna —el mismo `#panel`, sin mover nada de sitio— y lo enseña como una franja de borde a
  borde, sin la pista de teclas. **En el panel de un nodo manda la descripción** (Leo, 16-09-2026: «es donde pongo muchas
  notas»): `#panel:has(> .field-crece)` es una rejilla de dos columnas, a la izquierda una de 250 px con el tipo, el título
  (sin su rótulo), dónde está y las acciones, y a la derecha la descripción entera, de arriba abajo (`grid-area: 1/2/6/3`),
  así que agrandar el panel la agranda a ella; los de trama y acto siguen en fila.
  **Es una sección fija** (Leo, 16-09-2026): está siempre, con o sin nada elegido (sin nada, el rótulo y una línea que dice
  de qué va), y **se contrae hacia abajo** con el chevrón de su cabecera (`[data-panel-plegar]`, `panelPlegado(v)` →
  `body.panel-plegado`: solo queda su cabecera de 34 px, con el nombre de lo elegido —`.panel-quien`— y sin el asa); se
  recuerda en `vista.panelPlegado`. `adornarAbajo()` pone el chevrón y ese nombre tras pintar cualquiera de los tres paneles.
  **`panelPlegado` tiene que salir en `T.tablero`** (Leo, 16-09-2026, «ya no funciona nada»): estaba escrita pero no
  exportada, y como `app.js` la llama en el arranque para devolver el panel contraído como se dejó, la excepción cortaba
  el módulo entero —sin pestañas, sin árbol, sin nada— **solo si el panel se había dejado contraído**, así que ni las
  pruebas ni el navegador recién limpiado lo veían. `test/api-tablero.test.js` compara ahora lo que ClapCraft llama
  (`T.tablero.*`) con lo que el objeto exporta, leyendo el archivo (tablero.js necesita DOM y no se carga en Node).
  Para mirar por dentro la app ya instalada: `/Applications/ClapCraft.app/Contents/MacOS/ClapCraft --remote-debugging-port=9222`
  y hablar por CDP con `http://localhost:9222/json` (`Log.enable` + `Runtime.enable` dan las excepciones del arranque).
  Los paneles de trama y de acto caben sin desplazarse (Leo, 16-09-2026: la barra de color hacía desplazar el panel): los 24
  tonos van en dos filas (`#panel .swatches` en rejilla de columnas) y cada campo con su ancho.
  El alto es `--panel-alto` (164 px de partida) y se arrastra con `#panelAsa`, una franja de 7 px que tablero.js inserta
  delante del panel y arrastra `panelAlto(px)` (de 132 px a lo que deje el tablero); al soltar, `alPanel(px, plegado)` guarda
  las dos cosas en la vista y el doble clic en el asa vuelve al alto de partida. El asa **no es un clic en blanco**: `onClick` la
  salta y el arrastre pone `soltarClic` (si no, al agrandarlo el clic de después soltaba la selección y el panel se cerraba,
  Leo 16-09-2026). En tramas.html no hay piel, así que el panel sigue siendo la columna de la derecha.
  **El panel lleva `data-panel`** (`punto`, `linea`, `acto`, `nota` o `vacio`) y **los cuatro se ven igual** (Leo,
  16-09-2026: «que se parezca al que aparece cuando se presionan los nodos»): la misma rejilla del nodo, con la columna
  de la izquierda (cabecera, nombre o color, dónde está y las acciones) y a la derecha, ocupando el alto, lo ancho en
  un `.panel-bloque` —el tipo y el color de la trama, el ancho y el fondo del acto, la descripción o el texto—. Los
  tonos van en una rejilla de ocho columnas, sin desparramarse; y **el color de una nota va a la vista en su panel** (1.0.82, Leo
  16-09-2026: el botón que abría la paleta «resulta extraño, porque es un combo list»): `.swatches.nota-colores`, el papel de
  nota (`.sw.papel`) y los 24 tonos en dos filas de cuadritos de 13 columnas que caben en la columna de 250 px.
  El **panel del nodo** ya **no lleva «Abrir documento»** (Leo, 16-09-2026: el documento es del esquema, no del nodo).
  Lo arma tablero.js (también en tramas.html): cabecera «NODO» con ‹ › y ×
  (`.panel-nav`, iconos SVG en línea `ICONO`), título, descripción que ocupa el alto (`.field-crece`),
  `#fEstado` (En escena / Descartado, en lugar del botón Descartar; no en extremos de salto),
  `.panel-meta` (color · trama · acto), `.panel-acciones` con la papelera (`#bBorrar`, icono) donde app.js
  mete delante «Abrir documento» y `.panel-pista` («Supr elimina · Esc cierra»).
- **Pantalla Texto del rediseño 3**: arriba `#textoCab` (50 px, `.esq-cab`: «CONTENEDOR [Acto] título»,
  el título es un `<input data-texto-nom>` que escribe en `#docTitle` del marco y así renombra el nodo;
  «Ver biblioteca» = `o.verBiblioteca`, solo si el esquema tiene biblioteca enlazada; «Ver esquema» = `o.volver`; ‹ › = `mover`), la tira (92 px sobre el lienzo más 12 de un
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
- **Renombrar en sitio** (`editarEnSitio` del gestor, `input.gd-edit`): **salir del campo guarda** lo escrito, como
  Enter, y cancelar es Esc (Leo, 16-09-2026, igual que en el tablero). El campo va dentro del nombre, que recorta con «…»; más
  ancho que él, se cortaba por la derecha y al borrar desde el final no se veía nada (Leo, 15-09-2026). En clapcraft.css el
  padre de un `input.gd-edit` (`:has(> input.gd-edit)`) no recorta y crece lo que deje la fila, el campo mide el 100 % y la fila
  esconde su «⋯» mientras se edita.
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
