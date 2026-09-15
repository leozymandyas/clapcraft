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
  cuadro o rombo: el otro extremo necesita la celda libre. **Soltar un nodo encima de otro los intercambia** (Leo,
  15-09-2026, también en Personajes): el tablero llama a `moverPunto`/`moverSalto` con `{ intercambiar: true }` y, si lo que hay
  en la celda es un solo nodo, `intercambiarPuntos(p, q)`: cada uno a la celda y la trama del otro; un extremo de salto se
  lleva a su pareja a la misma celda (la pareja sigue en su trama); si algo caería sobre un tercero, dos en la misma celda o un
  salto quedaría mal (en la trama de su pareja, un cuadro en una alternativa), no se hace y avisa. Las notas se quedan en su
  tramo (sus extremos pasan al nodo que ocupa ese lugar). Mientras se arrastra, el de debajo (y su pareja) se aparta a su sitio
  (`previaIntercambio`, `.pt.intercambio` con transición). **Las notas también** (`moverNota(…, { intercambiar })`,
  `intercambiarNotas`): arrastrada sobre un tramo con otra nota, esa pasa al tramo de origen de la arrastrada, y al seguir
  arrastrando vuelve a su tramo (`colocarNotaArrastrada` en tablero.js). Sin la opción, el modelo sigue rechazando (criterio 13
  de la spec, que Leo cambió para la interfaz). La vista previa del arrastre del «+» tampoco
  enciende una pista ocupada; al soltar un nodo sobre otro el tablero avisa y lo devuelve. El arrastre
  del trazo de un salto (`mov`) es solo visual hasta soltar: desplaza los dos extremos (`transform`) y
  el grupo `<g data-salto-g>` del SVG, y `moverSalto` se llama en `pointerup`; así se ve el intento
  aunque la celda esté ocupada, y solo entonces avisa y vuelve.
- **Orden de apilado del tablero en ClapCraft**: `.pt` lleva z 5 (tapa el cable, z 4), así que la columna
  de nombres va con z 7 y el eje con z 8 (`#board .label` / `#board .axis` en la piel). Con los dos en z 5
  los nodos, que van después en el DOM, se veían a través de la columna al desplazar (pasó el 14-09-2026).
- **Rótulos de los nodos** (Leo, 15-09-2026, `docs/diseno/rediseno-7/`): el nombre de un nodo redondo (no cuadros,
  rombos ni descartados, que siguen con texto suelto) va en un rótulo de papel con borde, sombra y guía de 7 px hasta
  el punto (`.pt.con-rotulo`; el seleccionado con borde de acento). Ya no se alternan alturas (`.alto` desapareció):
  `colocarRotulos(row)` mide tras montar cada fila y, si un rótulo choca con el anterior, lo baja al otro lado del eje
  (`.abajo`; si tampoco cabe, se queda arriba). Una nota entre dos nodos cuyo rótulo bajó, o sin sitio para leerse
  (menos de 48 px, o recortada por un rótulo que bajó), queda `.aparte`: en el eje su marca y el papel a la derecha,
  unido por guías discontinuas (`.nota-marca`, `.nota-guia-v/-h`, hijos del papel con posiciones negativas), con el
  ancho que deja libre lo siguiente de debajo; dos corridas seguidas no se pisan (cada una acaba antes de donde empieza la
  siguiente). `.nota.aparte` va con z 2, sobre el `.hueco` (z 1) del tramo siguiente, que se comía el clic y creaba otra
  nota; y si el «+» de la celda (`#celda`, z 3) queda encima de una nota, `notaBajo(e)` (`elementsFromPoint`) lo esconde
  y el clic elige la nota (Leo, 15-09-2026). **Los huecos para poner nota** (`.hueco`, debajo del eje) también se recolocan en `colocarRotulos`: un rótulo que
  bajó (`.pt`, z 5) o una nota corrida se pintaban encima y tapaban su botón (Leo, 15-09-2026); cada hueco ocupa el trozo libre
  más ancho de su tramo y, si ninguno llega a `HUECO_MINIMO` (26 px), el primer sitio libre a su derecha sin pisar el anterior. **Notas con color** (rediseño 9): `nota.color` es un tono de `PALETA` o no
  existe (papel de nota de siempre); `m.colorearNota(id, color)`, el menú de la nota lleva los 24 tonos y «nota» (sin
  color). Con color, `.nota.con-color` con `--tc`/`--tf` (trazo y fondo pálido): fondo pálido, borde del tono, texto en
  tinta, marca del tono y guías discontinuas grises; al pasar el ratón la guía que la une a la trama se vuelve continua
  del tono (`--nc`; sin color, `--nota-tinta`), la marca lleva halo y el papel sombra alta. La clase no puede llamarse `rotulo`: la piel ya la usa para los
  rótulos mono en mayúsculas. La tira del editor hace lo mismo (`texto.js`, `colocarRotulos`, `.rotulo-abajo`:
  `.abajo` ya es la dirección del trazo de un salto).
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
- **Carriles de un personaje**: delante del selector, `.per-color` (el color de su trama; abre los 24 tonos,
  `C.gestor.paletaTrama`, porque ahí el panel de la trama no se abre) y la etiqueta «Personaje» (`.per-etq`); la columna
  mide 250 px.
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
  carpeta), esquemas (con su biblioteca enlazada, que la vista previa enseña) y bibliotecas sueltas; cada esquema lleva los tres
  actos de siempre, las tramas de la plantilla y el nodo «Inicio» (`p1`). «En blanco» crea «Contenedor» con «Esquema» y su biblioteca enlazada «Biblioteca» (Leo: sin «Esquema 1» ni «Proyecto»; `{ esquema, biblioteca }` renombra la enlazada). La prueba exige que lo creado sea exactamente el árbol
  de la vista previa: **no inventar chips que no se crean** (el diseño decía «8 CAPÍTULOS» con dos en el árbol).
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
  (esquemas con notas, segmentos y órdenes propios, personajes con tablero y carrusel, papelera, elenco) por JSON y
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
  cortado, fuera de escena) con el título encima, y a la izquierda el chip de la trama. **Un esquema es un
  solo documento** (Leo, 15-09-2026, `docs/diseno/rediseno-8/`, `Pantalla_Texto`): una **sección por nodo** en el
  orden del tiempo (`listaSecciones`: celda global y, en la misma, fila del carril; sin extremos de salto salvo, en el
  tablero de un personaje, el de salida), cada una con su cabecera `.cd-seccion.ed-fijo[data-seccion]` (punto con la
  forma del nodo, nombre, `|`, trama en mono y tipo en el color de la trama; cada banda con el fondo pálido de su trama (`--fl`) y la activa además con los bordes y una barra de 5 px del color de su trama (Leo, 15-09-2026, `docs/diseno/rediseno-10/`); estilos en `css/clapcraft-editor.css`, de borde a borde de la hoja con `--cd-pad`, el relleno de la hoja que
  mide un `ResizeObserver`). Los nodos de la tira son **anclas** (`irASeccion`: cabecera arriba y cursor al principio
  de su texto); la sección activa la dice el cursor (`selectionchange` → `marcarActiva`: cabecera, cabecera de la
  vista y la tira, que pasa a la trama de esa sección). Los extremos de un salto no tienen sección: pulsarlos pasa la
  tira a la trama del otro extremo (`.pos`). `‹ ›` de la cabecera y `Ctrl/Cmd+Alt+↑/↓` van a la sección anterior o
  siguiente del documento. **Las secciones no se borran desde el editor** (js/fijos.js; se borra el nodo en el
  esquema); pulsar una cabecera lleva a su texto y **doble clic la renombra** (`renombrarEnHoja`: un campo encima del
  nombre dentro de `#pageWrap`, fuera del contenteditable, para que no entre en el documento ni en Deshacer; Enter
  renombra el nodo, Esc o un clic fuera no), y si el nombre o la trama no caben sale el globo `.cd-globo` del marco.
  **Por dentro nada cambia en los datos**: cada sección sigue siendo la nota de su nodo. `componer` junta las notas
  (sin nota o vacía, `<p><br></p>`) y guarda la firma de cada sección tal como la serializa el editor (`base`);
  `partir` reparte el HTML por cabeceras (con los personajes del registro que se nombran en cada una) y
  `volcarSecciones` escribe solo las que cambiaron (una vacía sin nota no la crea), así una tecla no reescribe ni
  cambia la fecha de las demás. `repararSecciones` es la red de seguridad (cabeceras repetidas o ajenas fuera, las que
  falten detrás de la anterior, un bloque tras cada una, nada antes de la primera). `abrir(id)` recompone solo si la
  lista de secciones cambió (nodos creados, borrados o movidos en el esquema); si no, pone al día las cabeceras y va a
  la sección (sin id, se queda donde estaba). Sin nodos, `#editor.sin-secciones` no se edita y lo dice.
  `C.texto.cerrar()` (al montar otro esquema, `soltarEditor`) y `abrirDocumento` (una nota de biblioteca) sueltan el
  documento compuesto. Los documentos de la cronología, de los momentos y las apariciones de nodos (`o.abrirNodo`)
  llevan a su sección.
  Al pasar el ratón por un nodo, el globo `#tip` del tablero (el mismo elemento) enseña debajo el
  título y la descripción del esquema. El tema va en los dos sentidos: el botón de la cabecera cambia el
  del marco, y un `MutationObserver` sobre `html[data-theme]` del marco avisa a la página si el editor
  lo cambió desde su barra inferior (`o.alTema`).
  Habla con el editor por `Ed.document` del marco; al cargar el marco parchea `Storage.prototype` de esa
  ventana para que el autoguardado del editor (`guiones.editor.doc`) vaya a
  `guiones.claquedraw.editor.doc` y no pise el documento de `index.html` a solas. El título de cada
  sección es el del nodo (renombrarla, en su cabecera o en la de la vista, llama a `renombrarSeccion`; `#docTitle`
  solo lo usan las notas de biblioteca). Las notas viven en el guion
  (`biblioteca.guardarNota`, `notas[puntoId] = { title, html, characters }`, `notaActual`).
- **Revisar guión** (Leo, 15-09-2026, `docs/diseno/rediseno-11/`: «sacar del guion secciones del editor con línea del
  tiempo, ordenarlas y generar un documento sin línea de tiempo que se abra en el editor normal, listo para exportar»).
  **Estado por esquema** en los documentos: `esquema.guion = { fuera, orden, plegadas }` (claves de sección; solo se guarda
  lo no vacío), `guionEsquema`, `sacarDelGuion`, `devolverAlGuion`, `plegarSeccion`, `ordenarGuion`, `ordenGuion(eid,
  natural)` (lo nuevo detrás de su vecino) y `podarGuion` (al montar otro esquema). **Nada se borra ni se mueve**: una
  sección fuera se queda en su sitio del documento con la banda gris, el nombre tachado, «FUERA DEL GUIÓN» y el texto apagado
  (`.cd-sin-guion`); plegada, su texto no se ve (`.cd-oculto`, con «· plegada · N palabras»). Esas dos clases son marcas de la
  hoja (`marcarBloques` en texto.js) y `partir` las quita al guardar. **Tres sitios para lo mismo** (texto.js): la casilla y
  «Sacar del guión» / «Devolver al guión» y el plegado en cada cabecera de sección (clic en `[data-sec-accion]`, no mueve el
  cursor), la casilla en el rótulo de la tira (`.hilo-casilla`; los nodos fuera, discontinuos y tachados, `.sin-guion`) y la
  barra de guión `#guionBarra` bajo la tira («N fuera de M», la selección con Sacar/Devolver, Sacar todo/Devolver todo y el
  primario «Revisar guión»; no sale con una nota de biblioteca ni en el tablero de un personaje). **Se contrae** (Leo:
  quitaba mucho espacio) con «Armar guión» en la cabecera (`[data-texto-guion]`), siempre a la vista, que la abre y la
  contrae (chevrón arriba abierta, abajo contraída; `vista.guionAbierto`, se recuerda; de partida contraída, Leo); en Revisar guión se ve siempre. Contraída,
  las cabeceras de sección y la tira esconden también la casilla y «Sacar / Devolver» (`html.cd-guion-plegado` en el marco,
  `#texto.guion-plegado`); el plegado de la sección y el aspecto de las que están fuera se quedan. Las secciones marcadas viven en
  memoria (`elegidas`) y las comparten la hoja, la tira y la pantalla. **La pantalla** (`js/claquedraw/revisar.js`,
  `#revisar` en `#texto.revisando`: esconde la tira y el marco, y la cabecera pasa a «CONTENEDOR [esquema] Revisar guión» con
  «Volver al texto», también Esc): la lista de secciones en el orden de lectura, que se reordena arrastrando (eventos de
  puntero, marca de 2 px, la fila levantada medio grado) y en cada fila casilla, número, glifo, trama, palabras y
  sacar/devolver; a la derecha la ficha (nombre, secciones, palabras, páginas ≈ 200 palabras por página, lo que no se copia, el
  destino) y «Generar documento»; abajo el último guion generado y «Exportar». `js/claquedraw/guion.js` (Node, `test/guion.test.js`)
  tiene lo compartido: `secciones(tm, conSaltos)` (la misma lista del documento compuesto), `estado` y `componer` (título del
  proyecto y del guion, `<hr>` y el HTML de cada sección dentro, seguido, con los personajes de lo copiado). **Guiones
  generados** (Leo, 15-09-2026, `docs/diseno/rediseno-12/`: la biblioteca **ya no tiene cronología**, en su lugar esta sección;
  **sin «Regenerar»**): documentos de la biblioteca con `nota.guion = { eid, generado }` (`crearGuion`; `eid` null si se creó a
  mano con «＋ documento») que viven en la sección «Guiones generados» (`bloqueGuiones`, `.gd-bloque[data-seccion="guiones"]`,
  `.gd-tablero[data-grupo="guiones"]`): como la de segmentos, con su **bandeja** (`notasDe(subId, C.SEGMENTO_GUIONES)`: donde caen
  los que genera Revisar guión) y **segmentos de guiones** (`etiqueta.guiones`, `crearEtiqueta(sub, nombre, null, { guiones })`,
  `guionesSegmentosDe`; `etiquetasDe` ya no los devuelve), **todos con cabecera negra** (`--guion-cab`, `.gd-etq--guion`), con su
  orden (`ordenGuiones` / `colocarSegmentoGuiones`, claves `bandeja` y `etq:<id>`), sin botón en el título (Leo quitó «＋ Segmento») y «nuevo
  segmento de guiones» al final; **«Ver esquema» va a la derecha de la cabecera de la biblioteca** (`cabeceraHtml(…, acciones)`,
  `[data-gd-ver-esquema]`) si está enlazada, como en el diseño 12 (antes iba en el título de la cronología). `moverNota`: un guion solo entre la bandeja y los segmentos de guiones de su biblioteca, y una nota
  nunca a un segmento de guiones (el arrastre en vivo tampoco los cruza: `grupo`); `normalizar` lo mantiene. La bandeja de
  guiones se expande con la clave `guiones` (`data-exp-clave`). La sección se ve si la biblioteca está enlazada o ya tiene
  guiones, y se intercala con la de segmentos arrastrando su título (`segmentosPrimero`; de partida, guiones arriba). El chip
  del acto en la cabecera del editor solo abre momentos de un personaje (`puedeVerSegmento`). El árbol anuncia los guiones
  con `.gd-guiones-cuenta`. Abierto, un guion es un documento plano (sin tira ni barra de guión) con la cabecera
  «CONTENEDOR [biblioteca] [segmento de guiones] título» y «Generado desde ESQUEMA · fecha». **Exportar** (`js/claquedraw/exportar.js`): botón en la barra inferior del editor
  (`#cdExportar`, con borde y sin color de acento: Leo no lo quiere morado), en Revisar guión y en el ⋯ del guion; menú PDF / Word /
  Texto (`C.gestor.pop`, en la página: como un clic dentro del marco no le llega, texto.js lo cierra en el `mousedown` del
  marco y el mismo botón lo abre y lo cierra; Esc cierra cualquier menú abierto, oyente en captura del documento). Una nota exporta su HTML; el editor con secciones o Revisar guión, lo que está dentro del guion en su orden
  (`documentoAExportar`). PDF: HTML imprimible en Carta con Courier Prime (`aImprimible`); en Electron `editorAPI.guardarPdf`
  → IPC `pdf:save` (ventana escondida, `printToPDF`, las fuentes por su ruta en `fonts/`), en el navegador el diálogo de
  imprimir. Word: un .docx hecho a mano (`docx`: document.xml con sangrías de guion y un zip sin comprimir, CRC32 propio).
  Texto: párrafos con una línea en blanco, personaje/paréntico/diálogo seguidos. `npm run test:archivos` genera un guion y
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
    enlazado va en azul como cualquier biblioteca (Leo, 15-09-2026; antes violeta) y se arrastra/sube/baja como una pieza (`unidadDe`, `sueltosDe`: los
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
  `ordenarSecciones(subId, cronologiaPrimero)`, guardado en la biblioteca como `segmentosPrimero`: por defecto la cronología va arriba). «Ver esquema» va al
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
  (`carrilNuevo`); el selector de un carril ofrece lo mismo más «Quitar el personaje». El carril lleva el
  color de su trama, como en cualquier esquema (Leo, 15-09-2026: antes tomaba el de la etiqueta del personaje,
  `.row.con-color`, que desapareció; la etiqueta sigue en el menú y en el chip de la cabecera). **Nombres en ese
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
  (`guardarNotaEsquema` lo pone solo si cambió el contenido; `docDe` lo conserva).
  **Segmentos y notas en general** (Leo, 14-09-2026): al pasar el ratón por el nombre de un segmento, acto,
  momento o bandeja sale el globo `.gd-globo` con su nombre completo (`.gd-etq-nom[data-globo]`, 350 ms,
  debajo del nombre). Las notas que son nodos de una línea de tiempo (cronología, momentos, apariciones de
  tipo nodo) llevan su símbolo como en el tablero (`glifo(tm, p)`: `.gd-glifo--punto` con aro del color del
  nodo o de su trama, `--cuadro`, `--rombo`; apagado si está descartado). Cronología y momentos salen de
  `tarjetasActos(m, tm, eid, conSaltos)`. **El carrusel de un personaje lleva un segmento por momento** de su
  tablero, detrás de la bandeja: mismos documentos y menú que los actos de la cronología (abrir, renombrar,
  ver en el esquema, eliminar), sin arrastrarse; con `conSaltos` la relación va una vez (su extremo de
  salida). **La cabecera de una nota de biblioteca** (`#migas`) es como la de un documento de nodo: 50 px,
  «CONTENEDOR [biblioteca] [segmento] título», el título es un campo que renombra la nota
  (`C.texto.fijarTitulo` escribe el título del editor, que al guardarse la renombra; no se redibuja mientras
  se escribe), «Ver biblioteca» (en Personajes, «Ver personaje») y ‹ › a la nota anterior o siguiente de su
  segmento. El nombre de la nota abierta va en `migas.dataset.migaNota`, **nunca `data-nota`**: el `pointerdown` del
  tablero de tramas (en `document`) tomaba cualquier `[data-nota]` por uno de sus post-it y hacía
  `preventDefault`, y el campo del título no recibía el foco (ahora el tablero solo mira `#board [data-nota]`).
  **Orden propio de actos, momentos y sus documentos** (Leo, 14-09-2026): las tarjetas de la cronología y del
  carrusel se ordenan arrastrando su cabecera (entre las de su sitio) y sus documentos dentro de su tarjeta,
  sin tocar la línea de tiempo: se guarda en la biblioteca (`sub.ordenActos = { actos, nodos: { actoId } }`,
  `colocarActo` / `colocarNodoActo`, `ordenActos` / `ordenNodos` lo aplican; lo nuevo entra detrás de su vecino
  natural) y `tarjetasActos(…, subId)` lo usa. **Arrastre en vivo** (Leo: «que se vea posicionado donde lo pondría y desplace a los de al lado»): segmentos
  de una biblioteca (`'etq'`), actos de la cronología (`'acto'`), momentos y segmentos del carrusel
  (`'carrusel'`), documentos dentro de su acto o momento (`'nodo'`) y notas dentro de su segmento o a otro del
  mismo tablero (`'nota'`) **se recolocan de verdad en el DOM mientras se arrastran** (`colocarVivo`, por la
  mitad horizontal de la tarjeta o la vertical de la nota) y los vecinos se apartan con animación FLIP (`flip`,
  Web Animations, 180 ms); al soltar se guarda el orden que se ve (con `pointercancel`, `devolverAlOrigen`).
  Una nota llevada a la barra lateral o a la papelera vuelve a su sitio y se marca el destino, como antes.
  Mano en lo que se arrastra, al pulsar se levanta (`.agarrado`, `body.gd-agarrando`), lo arrastrado queda en
  hueco punteado y lo sigue un fantasma con forma de tarjeta (`fantasmaTarjeta`). Mover y soltar se oyen en
  `window`: recolocar el elemento le quita la captura del puntero. **Las tarjetas de segmentos tienen un solo orden**
  (`sub.ordenSegmentos`, que también lee el antiguo `ordenCarrusel`; `ordenSegmentos` / `colocarSegmento`),
  con claves `bandeja` y `etq:<id>` en una biblioteca y además `apariciones` y `acto:<id>` en el carrusel de un
  personaje: todas se mueven entre sí, bandeja y Apariciones incluidas (tipo de arrastre `'orden'`, contenedor
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
  `vistaExpandida` en lugar del tablero; en Personajes, `renderPersonaje` la pinta en el carrusel y
  `body.per-expandido` esconde la cabecera, el tablero y el pie. Cabecera «CONTENEDOR [Biblioteca] Nombre ›
  [Segmento] Nombre» (las dos primeras migas contraen), banda del color del segmento con cuenta, lápiz y ⋯ (solo
  segmentos) y «Contraer» (`ic-collapse`, también Esc), y la rejilla `.gd-exp-grid` con título, primeras líneas
  (`textoDe`) y fecha; la nota `sel` va con el borde de acento. Notas y documentos se ordenan arrastrando en la
  rejilla (mismo arrastre en vivo, leído por filas; «＋ nota» se queda al final); Apariciones van punteadas con su
  ruta y no se ordenan. `navegar` a otra biblioteca, «Ver biblioteca»/«Ver personaje» y «Ver esquema»
  (`C.gestor.contraer()`) lo cierran. **La etiqueta del segmento en la cabecera del editor** (antes un `.gd-tag` de
  9,5 px) es un chip de 24 px con el color del segmento (`.gd-seg-chip`, bandeja punteada) y abre ese segmento
  expandido con la nota marcada; en un documento de nodo, el chip del acto (`[data-texto-acto]`) abre el acto o
  momento en la biblioteca enlazada o del personaje (`o.verSegmento`, `bibliotecaDelEsquema` en app.js; sin
  biblioteca queda deshabilitado). **Cabeceras con nombres en los chips** (Leo, 15-09-2026: le gustó la de la nota
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
  sitio (`editarEnSitio`) y los de tramas y actos (`onKeyNombre`) solo se guardan con Enter; Esc o un clic fuera los
  dejan como estaban; al salir no queda texto marcado (`setSelectionRange(0, 0)`: con texto seleccionado y Esc
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
  tablero no tiene tira** (`o.sinTira` → `#texto.sin-tira`) y **el menú sigue en Personajes** con el editor
  abierto desde ahí (`o.personajesActivo`: vista Personajes, Texto con un tablero de personaje, o una nota
  abierta de la biblioteca de un personaje).
  Vista `vista.modo = 'personajes'`: la sección `#esquema` con el tablero del personaje abierto (`T.tablero.simple(true)`,
  sin fuera de escena ni camino iluminado; `gutter(250)`; `modelo.nombres`) y encima `#personajesSeg`, el
  carrusel de la biblioteca del personaje abierto (`C.gestor.renderPersonaje(el, subId, personajeId)`) con
  el segmento fijo **Apariciones**, delante de la bandeja (notas donde se le nombra, con su ruta; doble clic abre). Crear notas o
  segmentos en el carrusel **no cambia de vista** (`irAlTablero` no hace nada con `enCarrusel()`; antes
  pasaba a Biblioteca y el tablero desaparecía); abrir una nota sí (`irAlTablero(true)`), y renombrar el
  segmento nuevo busca su tarjeta en el carrusel. Menú en
  Personajes: el elenco (`.gd-per`: etiqueta «Personaje» con su color, nombre, ⋯ Abrir/Renombrar/Cambiar color/Eliminar;
  «＋ personaje», «Nuevo personaje»; doble clic renombra) y el pie **Contenedores · Personajes · Papelera**.
  app.js: `verPersonajes`, `verContenedores`, `abrirPersonaje`, `nuevoPersonaje`, `renombrarPersonaje`,
  `colorPersonaje`, `eliminarPersonaje`, `asignarCarril`. El panel del nodo ya no tiene «Estado»
  (descartar sigue en el menú contextual del nodo). `.btn[hidden]`/`.icono[hidden]` llevan
  `display: none !important`.
- **Carpetas** (Leo, 15-09-2026, `docs/diseno/rediseno-7/`): dentro de un contenedor las carpetas anidan sin límite
  (`contenedor.carpetas = [{ id, nombre, color, padreId, plegada? }]`, color = uno de `C.COLORES_CARPETA`, los de las
  tramas: se pinta con `var(--t-…)`) y de cualquier nivel cuelgan esquemas y bibliotecas (`carpetaId`; un esquema y su
  biblioteca enlazada siempre en la misma, `_enCarpeta`). En Personajes agrupan el elenco (`datos.carpetasElenco`,
  `personaje.carpetaId`, ámbito `C.ELENCO_CARPETAS`). Modelo: `crearCarpeta(ambito, nombre, color, padreId)`,
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
  marca de «delante o detrás» es solo una raya (sombra de fuera): no quita el fondo ni la barra de la fila activa o de la
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
  El **panel del nodo** lo arma tablero.js (también en tramas.html): cabecera «NODO» con ‹ › y ×
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
