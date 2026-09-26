# Guiones · Editor — guía para trabajar en este repositorio

Editor de guiones tipo Notion/Scrivener en **JavaScript puro, sin build ni dependencias**.
Se ejecuta abriendo `index.html` (o `node serve.js 5173`) y está preparado para Electron (`npm start`,
que abre `claquedraw.html`; con npm 11 hay que correr `node node_modules/electron/install.js` tras
`npm install` porque los scripts de instalación vienen bloqueados). `npm run dist` deja el `.dmg` en
`dist/`; `electron/main.js` abre **una ventana por proyecto** (1.1.33, ver `app.js` en Claquedraw), recibe los `.clapcraft` del
Finder (`open-file`: a la ventana que ya lo tenga, a una vacía por `abrir-ruta` o a una nueva con `?ruta=`), abre el puente con Claude (`electron/claude.js`, ver «Claude» al final) y monta el menú de la aplicación (Archivo / Edición / Ver / Claude): cada opción manda una orden
por el canal `menu` (`editorAPI.onMenu`) que `app.js` resuelve en `ordenes`; con `body.escritorio`
la barra esconde los botones que ya están en el menú. Deshacer/Rehacer del menú no llevan rol nativo
(`historia` en app.js): con el foco en el editor, en Texto o con una nota abierta van a `execCommand` del marco; con el foco
en un campo de la página (la descripción de un nodo, el panel de una nota, un nombre), al del campo (1.1.32: hasta entonces
deshacían el tablero, y en Documentos el esquema escondido); si no, en Esquema, al historial del tablero. En Electron los
aceleradores del menú se comen la tecla antes de que llegue a la página.
La interfaz está en español; los comentarios del código también.

## Arquitectura

- Todo cuelga del espacio global `window.Ed`. Cada módulo es un IIFE `(function (Ed) { ... })(window.Ed)`
  cargado por `<script>` en `index.html`, en este orden: `utils`, `markdown`, `page`, `editor`, `table`,
  `screenplay`, `database`, `blocks`, `fijos`, `doble`, `claquedraw/maquetar` (el maquetador del PDF, para el contador de
  páginas), `paginas`, `slash`, `characters`, `formato`, `portada`, `vendor/typo`, `dict/es`, `dict/en`, `spell`.
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
- **Especificación de formato de guion** (Leo, 17-09-2026, `especificacion-formato-guion.md`, 1.1.13; manda sobre lo anterior
  del guion). Elementos (`Ed.screenplay.KINDS`): scene, **subscene** (encabezado secundario, negrita, sin número), action,
  character, paren, dialogue, transition, shot, **act** (centrado, subrayado; empieza página nueva salvo el primero tras solo
  transiciones y los «FIN…»: `paginas.js` y `preparar` de exportar.js), **note** (gris, `[ ]` de CSS; el menú Exportar puede
  ocultarlas, `guiones.claquedraw.exportar.sinNotas`) y **montage**. Sangrías en `ch` desde el margen con `min()` en % para
  hojas estrechas y **medidas de un guion real** (The Office, piloto de 2005, que pasó Leo el 18-09-2026, 1.1.15; la
  especificación decía 22/16/10): personaje 18 (3,3 in; **no se centra**), paréntesis 12 (2,7 in; 26 de ancho, con sangría
  francesa para su «(»), diálogo 7,5 (2,25 in; 42 de ancho); `sp-dialogue:has(+ .sp-paren)` va pegado. Los mismos valores en
  exportar.js (PDF: 1,8 / 1,2 / 0,75 in desde el margen de 1,5; Word, en twips) y en `FORMATOS` de maquetar.js. Enter (`NEXT`) y Tab (`TAB`: acción→personaje, personaje/diálogo→
  paréntesis; los demás siguen el ciclo de `ORDEN`) según la tabla de la especificación; **Enter en un elemento vacío abre el
  menú «/»** (`Ed.slash.abrirAqui`: escribe la «/» y la quita si se cierra con Esc o un clic fuera). Ctrl+1…6 (`atajo` en
  `KINDS`; solo Ctrl, no Cmd). `js/formato.js`: «int/ext» → «INT./EXT.» en `beforeinput`, no deja teclear los «( )» / «[ ]»
  que ya pinta el CSS, «:» al salir de una transición, `data-izq` a «FADE IN:», el menú de sugerencias `.sug-menu` (lugares y
  momentos de las escenas usadas, secundarios, transiciones, tomas y actos; va antes que el de «/» en el `keydown`) y
  `Ed.formato.numerar` (botón «Nº escenas», `Ed.page.state.numerar`, contador CSS «ESCENA N - »). Personaje: con el nombre
  entero la lista ofrece «Sin extensión» (Enter/Tab siguen su camino) y V.O., O.S., CONT'D; «(» tras el nombre lo suelta.
  Páginas: el número va **arriba a la derecha, «N.», sin el de la primera** (`.pag-num`); en el PDF con `@page { @top-right }`
  y `@page :first` (Chromium ≥ 131; Electron 36). Exportar pasa antes por `preparar(html)`: un espacio entre nombre y
  extensión, números de escena si están activados, `nueva-pagina` en los actos y sin notas si se pidió. Pendiente de la
  especificación: `(CONT'D)` automático tras una acción.
  **El PDF se maqueta como un guion impreso** (1.1.15, `js/claquedraw/maquetar.js`, modelo puro con `test/maquetar.test.js`):
  con solo texto, `paginar(bloques)` reparte en páginas de 54 renglones de 12 pt (parte los renglones como el navegador:
  espacios y tras un guion entre letras, con `white-space: pre-wrap` y los espacios duros como normales), con una línea en
  blanco entre elementos salvo los pegados; el bloque de diálogo va junto y, si no cabe, se parte **al final de una oración con
  dos renglones a cada lado**, «(MORE)» abajo (en la columna del personaje, como el real) y «NOMBRE (CONT'D)» arriba de la
  siguiente (un monólogo largo, las veces que haga falta: lo que queda vuelve a la cola como otra unidad); la acción larga, igual
  sin MORE; un encabezado no se queda solo (`saltar()` se lo lleva si lo suyo pasa entero); una transición se lleva la unidad
  anterior; el acto empieza página. exportar.js (`paginado`) pinta cada página en una `.hoja` de 9,5 in con `@page` de 0,5 in
  arriba y el número en esa franja («2.» desde la segunda; posicionado por encima de la hoja, Chromium lo pintaba al pie de la
  anterior), y recorta los bloques partidos con `recortar(el, a, b)` (posiciones de `textoBloque`, los `<br>` cuentan uno). Con
  imágenes o tablas lo reparte el navegador como antes. **Portada** (`js/portada.js`, «/portada» o un clic en ella): primer
  bloque `div.portada.ed-fijo[contenteditable=false][data-portada]` pintado desde sus datos con `Ed.dialog` como formulario
  (título, episodio, escrito por, basado en, versión, fecha, contacto; «Quitar la portada»); mide `54lh`, paginas.js la cuenta
  como una hoja sin número ni página del contador y la numeración del guion empieza detrás; exportar.js la saca como primera
  hoja del PDF, primera página del Word (con salto) y cabecera del texto.
  **El contador y los saltos del editor son los del PDF** (1.1.16, Leo: «verifica que el contador de páginas del editor
  coincida con lo del pdf»): index.html carga `js/claquedraw/maquetar.js` y paginas.js y exportar.js arman los bloques con la
  misma función, `bloquesDe(els, { numerar, sinNotas, fijo })` (con `elementos()`: las listas, por elemento; `textoBloque()`:
  un `<br>` al final no es un renglón, `<p><br></p>` es uno y no dos; el personaje con un solo espacio; «ESCENA n - » delante si
  `#editor.numerar-escenas`, con `prefijos` para no descontar; sin notas si `guiones.claquedraw.exportar.sinNotas`, que llega
  al marco por el evento `storage`; tablas e imágenes, sus renglones de alto). Probado con cinco guiones inventados de 23 a 27
  páginas (Electron, `printToPDF`): mismas páginas y ninguna hoja pasa de 54 renglones.
  **Diálogo doble** (`js/doble.js`, 1.1.16; especificación 2.7): `div.sp-doble > div.sp-col × 2 > p.sp-character|paren|dialogue`,
  todo en el mismo contenteditable. «/dialogo-doble» (slash, detrás de Diálogo), el clic derecho (`data-action="doble"`, que
  dentro de uno dice «Separar…») y el asa de bloques (`separar`; no se convierte) llaman a `Ed.doble.alternar()`: en un diálogo
  (`grupoDe`: personaje + paréntesis/diálogos seguidos) lo junta con el de antes, o con el de después, o con una columna en
  blanco; en otra línea pone uno en blanco; dentro de uno, `separar`. Juntar y separar van con **un solo `insertHTML` sobre
  una selección del principio de un párrafo al final de otro** (Chrome reemplaza limpio y entra en Deshacer; empezando en el
  propio `div` se queda el envoltorio, así que separar abarca el párrafo de antes y el de después, y sin ellos lo hace a mano).
  Enter (`D.onEnter`, desde screenplay.js): personaje/paréntesis → diálogo de su columna (o la línea vacía que ya estaba),
  diálogo izquierdo → columna derecha, diálogo derecho → una acción debajo; una línea vacía de más se quita. Tab y Mayús+Tab en
  una columna solo ciclan entre sus tres tipos y `S.set` no pone otros (`kindOf` ignora `sp-doble`/`sp-col`). Retroceso/Supr
  (`keydown` en captura): al principio de una columna el cursor pasa a la de antes (derecha vacía: vuelve a ser un diálogo
  normal; todo vacío: fuera), no une un párrafo de al lado con el bloque, y una selección que cruza columnas se borra por tramos
  (`tramosDe`, como fijos.js). `normalizar` (MutationObserver) repara columnas que faltan o sobran, dobles anidados y deja un
  `<p>` detrás del último; al pegar, `Ed.sanitizeHtml` envuelto deshace un doble dentro de una columna o uno a medias.
  Maquetar: `lineasDoble` (la columna más larga; `DOBLE`: columnas de 28, personaje en el 8, paréntesis en el 4) y no se parte;
  PDF en rejilla de 2,8 + 0,4 + 2,8 in; Word, tabla sin bordes que no se parte (`tablaDoble`); texto, columnas lado a lado.
  **Pasada de pruebas del 18-09-2026 (1.1.14)**, lo que se corrigió: los atajos Markdown de bloque («- », «# », «> », «1. ») ya
  no convierten un elemento de guion (`markdown.js`: un diálogo con guion de interrupción o una toma de montaje se volvían
  lista); «int.» + espacio dejaba doble espacio; pegar «(…)» o «[…]» salía doble y los «:» de la transición se ponían fuera del
  historial (deshacer dejaba uno suelto): ahora `alSalir(b)` de formato.js lo arregla todo con `execCommand` al salir del
  bloque, y «FADE OUT» / «FUNDIDO A NEGRO» reciben punto; **Esc con las sugerencias abiertas** lo cogía el asa de bloques
  (seleccionaba el bloque y el editor se quedaba sin cursor): `anyMenuOpen` de blocks.js mira todos los `.char-menu` (también
  el `.sug-menu`); «Nº escenas» no se aplicaba al abrir (page.js aplica la vista antes de que exista formato.js); pegar texto
  en un elemento de guion deja todos los párrafos de ese elemento y no lo lee como Markdown (`insertPlainText`); **Tab al final
  de una línea con texto abre la siguiente** del tipo de la tabla (antes convertía el nombre o el diálogo en paréntesis); el
  asa de bloques ofrece los elementos nuevos (`CONVERTS` sale de `KINDS`); y una transición no empieza página (`paginas.js`
  agrupa el bloque anterior con ella). Para probar el editor en el panel: `beforeinput` + `execCommand('insertText')` por
  carácter (sin el primero no hay conversiones) y `keydown` sintéticos; `Ed.setCaret(p, n)` cuenta hijos, no caracteres.
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
  **Desde la 1.1.16 las reparte `Claquedraw.maquetar.paginar`, igual que el PDF** (ver arriba): de cada página que empieza en
  un bloque sale su margen de salto, y de la que empieza a mitad de uno (un diálogo o una acción partidos) una raya `.dentro`
  a la altura del carácter donde sigue (`alturaEn`: el rectángulo de ese carácter, proporcional al alto del bloque, así vale
  con zoom); una página que empieza en un elemento de lista pone el margen en el `li`. La hoja en pantalla mide al menos 54
  líneas y crece si hace falta. Lo que sigue describe la parte visual:
  la hoja sigue siendo continua, pero se ve partida en hojas. No toca el DOM del documento ni el Deshacer:
  mide `offsetTop` de los bloques (unidades sin zoom), y al bloque que no cabe le da margen con una hoja de
  estilos propia (`#pagEstilo`: `#editor > :nth-child(n) { margin-top }` = hueco natural + lo que falta
  hasta la hoja siguiente) y `min-height` a la hoja para completar la última; los huecos entre hojas son
  `.pag-salto` en `.pag-capa` dentro de `#pageWrap`, y cada hoja lleva su número (`.pag-num`) en la
  esquina inferior derecha, desde la primera, que existe entera aunque el documento esté vacío.
  Recalcula con
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

**Las bibliotecas y los segmentos** (1.1.54) se prueban con `npm run test:segmentos` (`pruebas/segmentos-electron.js`, 85
comprobaciones con el ratón y el teclado de verdad: `sendInputEvent`, la ventana enfocada, ~180 ms entre los clics de un doble clic;
el portapapeles sustituido): la ventana de una nota (abrir, cerrar con el fondo, Esc y ×, ‹ › y «＋», el doble clic al editor y
«Contraer», lo que recuerda cada nota, los menús y `#dlg` encima sin cerrarla, las teclas que no llegan al tablero escondido, las
pestañas y las vistas), buscar, filtrar y ordenar (y que se recuerda al recargar), el formato del campo y un bloque por cada fallo
que encontró la revisión (j–q). Chromium no da `dblclick` si el botón se repintó entre los dos clics: el doble clic en ‹ › no se
puede reproducir con el ratón, pero sí el de una palabra del campo justo después. El formato del campo, que depende de lo que hace
Chrome con `execCommand`, se probó además en un Electron aparte con `div.gd-lado-texto.md-texto` y las hojas de la app (código,
resaltado y enlaces al principio y al final de párrafos, títulos y citas, títulos sobre marcas y en celdas, y Deshacer).

## Tramas (tablero de estructura)

Segunda herramienta del repositorio: `tramas.html` + `css/tramas.css` + `js/tramas/`. No comparte
código con el editor (espacio global propio `window.Tramas`), solo las fuentes y el lenguaje visual.
La especificación de dominio está en `docs/tramas/` (spec y mecanismo) y manda sobre cualquier duda.

- `js/tramas/modelo.js`: **modelo puro, sin DOM**. `columnas` y cinco colecciones planas (`actos`, `lineas`,
  `puntos`, `saltos`, `notas`), todas las invariantes y los dos cálculos derivados (`presencia()`,
  `recorrido()`). Cada operación devuelve `{ ok, aviso?, … }`; la interfaz solo enseña el aviso.
  Se carga en Node: `npm test` corre `test/tramas.test.js` (criterios de aceptación de la spec) y
  **`test/fuzz-tramas.test.js`**, un fuzz con semillas fijas: ocho tandas de 400 operaciones al azar —crear, mover,
  intercambiar, copiar, pegar, ocultar y borrar nodos, saltos, notas, tramas, actos y columnas— que tras **cada** una
  comprueban las invariantes de la spec (una celda, un nodo; los dos extremos de un salto en la misma columna y en tramas
  distintas; una nota entre dos nodos consecutivos de la misma trama; actos que no se pisan; siempre una trama a la vista)
  y que lo guardado vuelve igual al abrirlo. Así salieron tres de los cuatro fallos del debugueo del 20-09-2026 (1.1.48) —el cuarto, el de reordenar tramas con alguna oculta, es de la interfaz—; quitar
  cualquiera de esas reparaciones hace fallar las ocho semillas en milisegundos. Con la interfaz, lo mismo lo prueba
  **`npm run test:esquema`** (`pruebas/mono-esquema.js`): un «mono» que en la app de verdad da clics, arrastres y teclas al
  azar —reproducibles por semilla— sobre el tablero y comprueba cada diez gestos las invariantes, que el DOM cuadra con el
  modelo, que no se perdería nada al guardar y que la página no ha soltado ningún error (`electron pruebas/mono-esquema.js
  <semilla> <gestos>`). Con `MONO_ARCHIVO=<ruta.clapcraft>` trabaja sobre **una copia** de un proyecto de verdad (el
  original no se toca) y `<índice>` como tercer argumento elige cuál de sus esquemas monta: los datos de Leo tienen formas
  que un proyecto recién creado no tiene.
  **Las columnas no dependen de los actos** (1.1.24, Leo: «que las líneas verticales existan sin depender de un acto, que pueda
  mover los actos sin que se muevan las líneas, para poder definir qué tan largo es un acto solamente, y pueden haber o no más
  de uno»): el tablero tiene `columnas` (las líneas verticales) y un acto es un tramo de ellas, `{ id, nombre, desde, celdas,
  fondo }`, ordenados, sin pisarse, con huecos o sin ninguno; los nodos van en una columna global `col` (`cg(p)`, `columna(c)`
  recorta a las que hay, `actoEn(c)` da el acto que la cubre o null), y las notas de raya también (`{ abierta, lineaId, col }`).
  La API es por columnas: `nuevoPunto(lineaId, col, props)`, `moverPunto(id, { col, lineaId })`, `ocupante(lineaId, col)`,
  `moverSalto(id, col)`; `ubicarCelda` desapareció. `normalizar` pasa lo guardado antes (actos seguidos sin `desde` y nodos con
  `actoId` + `celda`; lo reconoce porque no trae `columnas`) a esta forma. **Los actos**: `moverBorde(id, fin)` cambia dónde acaba
  (si el siguiente empieza justo ahí, el borde es de los dos y se reparten el sitio; si no, no pasa del siguiente; el último,
  pasado el final, crea columnas) —`fijarAncho`, `crecerActo` y `encogerActo` van por él, y `anchoMaximo(id)` es el tope de la
  barra del panel—; `moverActo(id, desde)` lo lleva entero con su largo sin pisar a sus vecinos; `borrarActo` solo lo quita (sus
  columnas y nodos se quedan; puede no quedar ninguno); `nuevoActo` empieza donde acaba el último. Ninguno mueve nodos ni
  columnas. En el tablero se arrastra la cabecera de un acto para moverlo (`actoArr`, sin robarle el clic que lo elige ni el
  doble clic que lo renombra; `body.moviendo-acto`) y su borde para cambiar lo que dura; las rayas `.sep` van en los dos bordes
  de cada acto (`bordesActos`) y el «+» de acto nuevo, detrás del último (`finActos`).
- `js/tramas/tablero.js`: la única capa que conoce píxeles (celda × escala). Reconstruye el DOM
  entero en cada `render()`; **un clic seco nunca redibuja** (solo cambia clases) para que el doble
  clic siga cayendo en el mismo elemento. Los arrastres no registran historial hasta soltar.
- **La descripción de un nodo lleva formato** (1.1.32, Leo: «quiero que mis campos de descripción acepten formato markdown,
  formateado y todo quiero verlo en ese campo. Esto no hace que los tooltips del esquema se vean con ese formato, solo es el
  campo»). `js/mdvivo.js` (`window.MdVivo`, sin dependencias; claquedraw.html y tramas.html lo cargan antes que tablero.js;
  `test/mdvivo.test.js`): `html(md)` pinta Markdown (cada renglón, un párrafo; `#`…`######`, `- `, `1. ` con su `start`, `> `
  con un `<p>` por renglón; `**`, `*`/`_`, `~~`, `` ` ``, `==`, `[t](url)` —sin `javascript:`— y `<u>`), `md(campo)` lo
  contrario, `plano(md)` el texto sin marcas y `vivo(campo, op)` convierte al escribir con las reglas del editor (js/markdown.js),
  más Cmd/Ctrl+B, I y U, pegar como texto, Enter en un renglón vacío de una cita (sale) y Retroceso al principio de un título o
  de una cita (párrafo). **Desde la 1.1.54** (el formato de la ventana de una nota, de ClapBook) también los atajos del editor
  (`atajoDe(e, mac)`, puro —Cmd en el Mac y Ctrl en los demás, así Ctrl+E y Ctrl+K siguen siendo del sistema en el Mac; AltGr no cuenta—: Cmd+Mayús+X tachado, Cmd+Mayús+H resaltado —`op.resaltado()` da el color; sin él, `<mark>`—, Cmd+K
  enlace —solo con `op.pedirEnlace`—, Cmd+Alt+0…6 títulos por `e.code`, y Cmd+E código), `formato(campo, accion, valor)` (negrita,
  cursiva, subrayado, tachado, código, resaltar, letra, título, quitar y enlace, siempre por `execCommand` —entra en Deshacer— y
  con el HTML del editor: `<strike>`, `<span style>` con `styleWithCSS` para los colores, `<a href>…</a>\u200B`), `pegar` (una
  dirección sobre lo elegido es un enlace; con `op.markdown`, lo que `pareceMd` entra con formato), `urlEnlace`, `esUrl` y
  `enlaceEn`. En los campos de Markdown (el nodo, el flotante) todo eso da la vuelta por `md()`/`html()`. `#fNota` es un `div.md-campo.md-texto[contenteditable]` (antes un textarea) y `p.descripcion` sigue
  siendo texto, ahora Markdown: `descripcionEn`/`descripcionDe` en tablero.js, y los rótulos (`ponerResumen`), el globo de la
  tira del editor (texto.js) y las tarjetas de la cronología la enseñan con `plano`. **Lo que en el campo es texto se queda en
  texto** (`escaparMd`): un `*` o un `==` que no se convirtió (pegado, o con la conversión deshecha) se guarda escapado y un
  párrafo que empieza por `#`, `- `, `> ` o `2. ` también, así que al volver a abrir el nodo se ve igual. **Tres cosas de
  Chrome que costó ver**: (1) lo que un atajo inserta con `insertHTML` **al final de un bloque** sale con el tamaño y el color
  de su sitio en `<span style>` (y al final del párrafo de una cita lo sacaba del párrafo); en medio del texto no: por eso el
  atajo escribe antes un `\u200B` detrás y el cursor sigue tras él; (2) al unir bloques (Retroceso o Supr entre un título y un
  párrafo, o con una cita) sí hace falta igualar los estilos, `.md-fusion` en `beforeinput` (tramas.css; los bloques con más
  especificidad que `.md-texto h2`, cuyo tamaño y peso se llevaba), pero **no** en los `insertHTML` de los atajos, donde ponía
  justo esos spans; (3) con la ventana sin foco, `focus()` no dispara `focus`, así que `defaultParagraphSeparator` se pide en
  cada tecla (salían `<div>`). `onKeyDown` del tablero cuenta un `contenteditable` como campo (si no, Supr en la descripción
  borraba el nodo). `aside h2` (el rótulo del panel) también estiliza los títulos del campo: `.md-texto` los devuelve.
- `js/tramas/app.js`: autoguardado en `localStorage` (`guiones.tramas.doc`), abrir/guardar `.json`
  (usa `window.editorAPI` de Electron si existe) y `Tramas.document` (`get/set/isDirty/onChange`),
  misma forma que `Ed.document`.
- Reglas firmes de la spec: **caben las tramas principales que sean** (1.1.23, Leo: «quita esa regla que puse de que solo
  puede haber una trama principal»; la spec pedía exactamente una): se crean desde «+ trama» (Principal, Secundaria o
  Alternativa) y cualquier trama cambia de tipo en su panel, pero **siempre queda al menos una** (`ultimaPrincipal(id)`: la
  última no se elimina —ni su «×» ni su papelera salen— ni deja de serlo —sus otros tipos, apagados—; `normalizar` ya no
  degrada las que sobran, solo hace principal la primera si no hay ninguna). La historia (`flujo`, `hilo`, el camino
  iluminado, la tira del editor) sale de la primera (`lineaPrincipal`) y todas las principales empiezan en escena
  (`presencia`); un nodo pertenece como mucho a un salto; los dos extremos de un salto
  comparten celda; un cuadro nunca toca una trama alternativa (se convierte en rombo); borrar un
  salto borra sus dos nodos; una nota va entre dos nodos consecutivos o **en un nodo** (`aId: null`) y **caben varias
  en el mismo sitio** (Leo, 16-09-2026; la spec pedía una por tramo).
  **Una celda es de un solo nodo** (Leo, 13-09-2026): `nuevoPunto`, `moverPunto` y `moverSalto`
  rechazan caer sobre otro nodo (`ocupante()`), y `crearSalto` no convierte un nodo existente en
  cuadro o rombo: el otro extremo necesita la celda libre. **Soltar un nodo encima de otro los intercambia** (Leo,
  15-09-2026, también en Personajes): el tablero llama a `moverPunto`/`moverSalto` con `{ intercambiar: true }` y, si lo que hay
  en la celda es un solo nodo, `intercambiarPuntos(p, q)`: cada uno a la celda y la trama del otro; un extremo de salto se
  lleva a su pareja a la misma celda (la pareja sigue en su trama); si algo caería sobre un tercero, dos en la misma celda o un
  salto quedaría mal (en la trama de su pareja, un cuadro en una alternativa), no se hace y avisa. **Las notas de un nodo se van con él** (1.1.1, Leo 16-09-2026: «al mover el nodo se debe mover con todo y sus
  notas, lo mismo al borrar»; antes también se quedaban y pasaban al otro nodo); las de un enlace se quedan en su tramo (sus extremos
  pasan al nodo que ocupa ese lugar). **`moverPunto` recoloca las notas** (1.1.48, del debugueo del 20-09-2026):
  `_repararNotas(p.id)` al final del movimiento —el `evitar` es el nodo que se movió, para que una nota de enlace se quede con el
  extremo que no se movió—. Sin eso, meter un nodo en medio de un tramo dejaba su nota entre dos nodos que ya no eran consecutivos
  (se pintaba a mitad de un trecho larguísimo, encima del nodo de en medio), y llevarse a otra trama uno de los extremos dejaba la
  nota entre dos tramas: **`normalizar` la descarta al abrir el archivo, así que esa nota desaparecía al guardar y volver a abrir**.
  `pegar` e `intercambiarPuntos` también reparan al terminar. Mientras se arrastra, las notas de nodo acompañan al arrastrado y al que se aparta. Mientras se arrastra, el de debajo (y su pareja) se aparta a su sitio
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
  nuevas, faltan columnas → nacen (`asegurarCeldas`); si cae sobre otros nodos se abre sitio en el
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
  un rótulo de papel con borde, sombra y guía hasta el punto (`.pt.con-rotulo`; el seleccionado con borde de acento). **Teñido
  del color de su nodo** (el suyo o el de su trama, `--c`; 1.1.16, Leo: «los colores del tooltip fijo no cambian, solo cambia
  el color del nodo»): 7 % de fondo y 32 % de borde quieto, más al pasar el ratón o elegido; igual el rótulo en la tira.
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
  anchas aunque no existan notas») **y su carril va siempre en el centro de la fila** (1.1.47; entre la 1.0.82 y la 1.1.46 se
  quedaba pegado debajo de los rótulos cuando la fila crecía): `render` mide lo que ocupan rótulos y notas **por
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
  **Y debajo, tres líneas de su descripción** (1.1.10, Leo 17-09-2026: «lo suficiente para que se entienda de qué trata… que no
  afecte mucho visualmente; la completa, en el panel»): `ponerResumen(cap, p)` deja la descripción (en una línea, hasta 220
  caracteres) en `.cap[data-desc]` —al pintar el nodo y al escribir en el panel— y `css/tramas.css` la enseña solo en `:hover`
  con `::after { content: attr(data-desc) }`, separada por una raya, más pequeña, apagada y cortada con `-webkit-line-clamp: 3`.
  **Del color del nodo** (1.1.11, Leo 17-09-2026: «el tooltip del hover debe ser del mismo color que el del nodo o la nota»): el
  rótulo, al pasar el ratón, va sobre `color-mix` al 11 % de `--c` (su color o el de su trama) con el borde al 45 %
  (`#board .pt.con-rotulo:hover .cap` en la piel). **Las notas ya no llevan el globo `#tip`**: al pasar el ratón la cajita crece
  hacia abajo y enseña su texto en cuatro líneas como mucho, con su papel y su color (`.nota:hover:not(.arrastrando)`).
  **Reordenar una nota no rehace el tablero** (1.1.45, Leo, con su proyecto «Amor tiktoker»: «cuando intento mover una nota en la
  misma trama, de arriba a abajo, empieza a parpadear»): cada paso del arrastre llamaba a `render()` —40 reconstrucciones de
  `#rows` en un arrastre corto, midiendo con `capturePage` y un MutationObserver sobre `#rows`—, así que las notas se destruían y
  volvían a nacer con sus guías y sus animaciones a medias. Ahora, mientras la nota siga en **su misma trama**, solo se recoloca
  esa fila (`ajustarFila`, el bloque de medida que antes vivía dentro de `render`) y se le ajusta su clase `de-nodo`/`abierta`;
  solo cambiar de trama repinta. Además, la nota que tiene el ratón encima **no cuenta para el alto de la fila** (con `:hover`
  crece para enseñar su texto, y la fila crecía y encogía a cada píxel) y **la fila no encoge mientras se arrastra**. Medido: de
  40 reconstrucciones a 5 y cero cambios de píxel en las otras tramas. El `:hover` forzado se prueba con el depurador de Chromium
  (`CSS.forcePseudoState`): los eventos sintéticos no lo activan.
  **La guía viaja con la nota** (1.1.46, Leo: «se ve por un tiempo como el enlace de la nota al nodo se sale y aparece arriba del
  nodo»): la animación del reordenamiento mueve la nota desde donde estaba, pero su `--guia` ya tenía la medida final, así que
  durante esos milisegundos la línea asomaba por encima del carril. `--guia` se registra con `@property` (`syntax: '<length>'`,
  **`inherits: true`**: la línea es `.nota::before`, y un pseudo-elemento hereda de su elemento; con `false` se quedaba con el
  valor inicial y la guía salía como un muñón) y `animarNotas` la anima junto al `transform`, de `g + dy` a `g`, leyéndola **del
  estilo en línea** (con otra animación a medias, el valor calculado es el de ese instante y el error se acumula) y cancelando la
  animación anterior de esa nota.
  **Una nota puede bajarse a su propio escalón** (1.1.46, Leo: «quiero poder poner más abajo notas… sin que eso haga que deje de
  estar relacionada a su nodo, solo es para mejorar la organización visual»): `nota.nivel` en el modelo (`fijarNivelNota`, que
  `normalizar` conserva) es el escalón donde se quiere, contando desde el carril; sigue colgando de su nodo o de su tramo, solo
  baja. `colocarRotulos` empieza a buscarle sitio ahí (y las que lo tienen se colocan después, para no robarles el nivel a las
  demás) y la fila crece para contenerla. Se pone arrastrando la nota **por debajo de todas las que comparten su sitio**
  (`bajarNotaArrastrada`, que mira el paso de la fila, apuntado en `row.dataset.paso`); subiéndola otra vez se le quita.
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
  se crea con «Agregar nota» del menú del nodo (antes «Nota en este nodo», Leo 17-09-2026) o con «＋ Nota» en su panel (1.1.3); **al terminar de escribirla en sitio se
  vuelve a centrar** (`editarEnSitio` llama a `colocarRotulos` de su fila y pone el texto en el panel): se colocaba con el ancho
  del campo y quedaba «al lado del nodo y no abajo» (Leo, 17-09-2026); arrastrando una nota, **acercar el puntero a un nodo la cuelga de él a cualquier altura** (1.0.80, Leo 16-09-2026: «si muevo una nota de nodo a un enlace, regresarla es muy complicado»; antes solo valía un cuadro de 24 px sobre el nodo a la altura del carril): el imán es el 30 % del tramo hacia ese lado, entre 12 y 40 px, así que **la mitad del tramo sigue siendo del enlace** y ahí una nota de enlace solo se ordena, sin convertirse; fuera del imán va al tramo donde cae (ya no se intercambian: se apilan). **Su guía es continua, de 2 px**, con un punto donde toca el carril: antes era una raya gris discontinua que no dejaba ver de quién era la nota (Leo, 16-09-2026). **Guía y punto van siempre del color de la nota** (`--nc` en la piel: su tono, o `--nota-tenue` la de papel; 1.1.18, Leo: «del mismo color que la nota todo el tiempo, no solo al hacer hover»; hasta entonces, quietas, del color de la trama, `--gl`, que tablero.js sigue poniendo). **Apiladas, cada nota tapa a las de más abajo** (1.1.22, Leo: «la línea de las notas de hasta abajo cubren el contenido de las de arriba»; hasta entonces la guía de las de abajo las cruzaba y la señalada iba delante): las notas de una trama van en su capa, `.notas-capa` dentro de `.track` (absoluta, `inset: 0`, z 1, sin quitarle los clics a la pista; con una nota señalada, elegida o arrastrada, z 2 con `:has()`), y dentro cada nota lleva `--nz` = 500 − su nivel (`colocarRotulos`), así la guía de una de abajo pasa por detrás de las de arriba; al señalarla crece hacia abajo, sobre las de debajo, y solo la arrastrada va delante de todas (z 999). **Mide lo que la nota se haya bajado** (`--guia`, que escribe `colocarRotulos` con su nivel): con la altura fija se veía cortada en cuanto la nota caía a un segundo nivel. **Y sale de su sitio** (`--gx`, 1.1.16, Leo 18-09-2026: «se ven ligeramente separadas del nodo»): la nota del primer nodo se corre a la derecha para no salirse del tablero y una más estrecha que su hueco mínimo (44 px) quedaba a la izquierda de él; la guía iba en medio de la nota. Ahora la nota va centrada en su hueco y `--gx` pone la guía y su punto sobre el nodo (o la mitad del tramo). Si el «+» de la celda (`#celda`, z 3)
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
- **Rayas y sus notas** (1.1.7, Leo 17-09-2026: «quiero que se habiliten todos los enlaces del largo de la trama, incluso si
  no hay nodos… velo como rayas: las rayas son enlaces, los puntos son los nodos»; en la 1.1.6 la nota abierta colgaba de un nodo
  y se iba dos celdas más allá). Fuera de los tramos entre nodos (tras el último, antes del primero o en una trama sin nodos),
  **cada raya entre dos columnas es un enlace**: `enlaceEn(e)` devuelve `{ a: null, b: null, lineaId, col }`, el puntero la
  enciende (`rayaBajo` → `#rayaHover`, `.cadena.raya`), el clic la elige (`sel.tipo 'raya'`, id `lineaId|col`, panel con «＋ Nota»
  y sus notas) y el secundario abre `menuAbierto` («Agregar nota», `data-abierta-nota="lineaId|col"`). La nota de una raya es
  `{ abierta: true, lineaId, col }` (la columna donde empieza la raya; `deId`/`aId` null) y se dibuja a mitad de su raya
  (`sitioNota`). Modelo: `crearNotaAbierta(lineaId, cg)`, `moverNotaAbierta(id, lineaId, cg)`, `colNota(n)`, `lineaDeNota(n)`
  (úsese en lugar de `punto(n.deId).lineaId`), `notasAbiertas(lineaId, cg)`; `notasDe(id, null)` no las cuenta como de nodo;
  insertar, borrar y mover columnas y borrar un acto las llevan como a un nodo (no el «abrir sitio» de `moverBloque`); borrar
  nodos no las toca, borrar su trama sí; `normalizar` pasa las de la 1.1.6 (con `deId`) a la raya que sale de ese nodo.
  Arrastrar una nota fuera de todo tramo la deja en la raya donde cae; a un enlace entre nodos, pierde la marca.
- **Lo pegado no se mete entre nodos y se lleva las notas de sus rayas** (1.1.16, Leo 18-09-2026: «no copia las de enlace»):
  `pegar` corre lo pegado hasta que, en cada trama, del primer nodo pegado al último no quede ninguno de los que ya había (antes
  solo miraba las celdas, y un enlace pegado entre otros nodos dejaba de ser consecutivo: su nota pasaba a ser de nodo), y
  `copiar` se lleva también las notas de las rayas (`abierta`) que quedan entre dos nodos copiados de su trama o detrás del
  último (o delante del primero) si ese va (`{ abierta, dc, df }` en el portapapeles).
- **Copiar, pegar y duplicar** (1.1.12, Leo 17-09-2026: «copiar y pegar nodos y notas… por medio de selecciones como las que
  tenemos… duplicarlos, como en Figma, con Opción mientras arrastro… con contenido y color»). Modelo: `copiar(ids)` → `{ tipo:
  'puntos', c0, f0, puntos: [{ ref, dc, df, titulo, descripcion, color, cortado, colorEnlace? }], saltos, notas }` (un extremo
  se lleva a su pareja; notas de nodo y de enlace entre copiados; sin ids del tablero, así vale en otro esquema) y `pegar(clip,
  c0, f0)` (nacen las tramas y columnas que falten; si algo cae sobre un nodo, todo se corre a la derecha al primer sitio
  libre; un salto que no cabe deja su extremo como nodo suelto); `copiarNotas(ids)` / `pegarNotas(clip, destino)` (destino
  `{ deId }`, `{ deId, aId }`, `{ lineaId, cg }` o nada = donde estaban). Tablero: el portapapeles es suyo (`portapapeles`,
  entre esquemas; al del sistema solo va el texto) y se oye en los eventos `copy`/`paste` del documento (en Electron los
  atajos son los `role` del menú Edición) si el tablero se ve y el foco no está en un campo. Se copia lo elegido (`queCopiar`:
  notas o nodos con Mayús o rectángulo, el nodo, el salto o la nota elegidos). Los nodos se pegan donde está el puntero
  (`ultimoSitio`, que apunta `onMouseMove`) o, si no, donde estaban; las notas en el nodo, enlace o raya elegidos o donde
  estaban; lo pegado queda elegido. **Cmd/Ctrl+D** duplica sin tocar el portapapeles (nodos justo a la derecha, notas en su
  sitio). **Opción al arrastrar**: un nodo deja el original a la vista (`.pt.original-dup`) y al soltar pega la copia ahí (sin
  intercambiar); un bloque, igual con `pegar(clip, c0 + dc, f0 + dl)`; una nota crea la copia en el `pointerdown` y lo que se
  arrastra es la copia (si no se mueve, se quita).
- **Un nodo nace sin nombre propuesto** (1.1.42, Leo: «quita lo del nombre sugerido en los nodos; al igual que las notas, debe
  haber un texto para que pueda guardarse»): `nuevoPunto` lo crea con `titulo: ''` (ya no «Punto nuevo» / «Evento»), sin nombre no
  se pinta su rótulo (ni en el tablero ni en la tira del editor) y, si se cierra el panel flotante sin escribir nada, no se crea
  (`limpiar()` de flotante.js, la regla de la 1.1.39). En tramas.html, donde el nombre se escribe en sitio, `nombrarRecien` enseña
  el campo donde irá el rótulo y borra el nodo si se deja en blanco.
- **Lo que se borra del esquema se puede deshacer desde su aviso** (1.1.42, Leo: «lo del deshacer aplica para los elementos de los
  esquemas»): `borrado(r, antes, msg)` en tablero.js guarda el JSON del tablero antes de borrar y pinta el aviso con «Deshacer»,
  que lo repone tal cual (`aplicarInstantanea` + `registrar`, sin depender del historial); lo usan los borrados de nodo, salto,
  trama, acto, nota, varias notas, selección múltiple y columnas. Lo que se borra desde el panel flotante va por
  `T.tablero.instantanea()` / `T.tablero.restaurar(json)` (el aviso del contexto pasa ahora la acción: `ctx.avisar(t, accion)`). El
  botón del aviso va en el **acento del propio aviso** (`--toast-acento` en la piel, `currentColor` en tramas.css): con
  `--inverso` —la regla de tramas.css gana por especificidad, `#aviso .aviso-accion`— salía casi negro sobre el grafito en modo
  oscuro (Leo, 1.1.43). Contraste comprobado en los dos temas (6:1).
- **Una relación nace sin texto** (1.1.41, Leo: «que las relaciones en los esquemas no tengan un texto por defecto; pueden tenerlo
  si se edita, pero nacen en el arrastre sin ningún texto adicional»): `saltoDesdeCruce` crea su nodo con `titulo: ''`, `cables()`
  no pinta el rótulo si no hay título y `nombrarRecien` no abre el campo en sitio para un salto sin nombre. Se le pone después con
  el panel (el del salto es el de su nodo de salida) o con doble clic en un extremo. En flotante.js, `limpiar()` deja vacío un
  extremo de salto que nunca tuvo título (solo recupera el suyo lo que sí lo tenía).
- **Filas y columnas con su propio tamaño** (1.1.41, Leo: «quiero poder hacer más largas las filas y columnas del esquema, de manera
  individual… el ancho de las filas hace que también sea más amplio el espacio entre las notas… debe poder restablecerse el tamaño
  de todas las filas y columnas que se hayan modificado individualmente»). Modelo: un **factor** sobre el tamaño de la vista,
  `linea.alto` y `datos.anchos[columna]` (`anchoCol`, `altoLinea`, `fijarAnchoCol`, `fijarAltoLinea`, `tamanosPropios`,
  `restablecerTamanos`); los anchos viajan con sus columnas al insertar, borrar y mover (`_mapearAnchos`) y `normalizar` solo
  guarda lo que se tocó. Tablero: `anchoCol(c)` en píxeles y `xs()`, las posiciones de todas las rayas (con su clave de caché), así
  que `px(cg)` las lee y `celdaEn(x)` busca en ellas (antes los dos eran una multiplicación); `anchoDe(acto)` es la diferencia
  entre sus dos bordes y la cuadrícula del fondo se dibuja raya a raya cuando hay anchos propios (`rejillaFondo`). Cada fila lleva
  su `--fila` cuando su alto no es el de la vista, y `colocarRotulos(row, base)` **reparte el alto que sobra entre los
  niveles de notas** (`dispo`: lo que queda de `base` desde debajo de los rótulos, contando lo que mide de verdad la nota más
  alta, que una de varios renglones ocupa más; el tope del paso, 6 × el normal, solo evita guías absurdas).
  **Sin salirse de su trama y con el carril centrado** (1.1.47, Leo: «aún hay momentos en los que las notas se van a otras tramas
  y momentos en que la línea de la trama se va hasta arriba en lugar de seguir centrada»; la 1.1.44 lo había dejado a medias):
  `colocarRotulos` devuelve **el borde de abajo de verdad** —el de la nota que más baja, con su alto real, no el último escalón
  más un tope de tres renglones, que se quedaba corto con una nota larga o muy bajada— y `ajustarFila` hace la fila lo bastante
  alta para que quepan los rótulos por encima **y** las notas por debajo con el carril **en su mitad**
  (`alto = max(base, 2 · max(arriba, abajo) + 12)`, `centro = alto / 2`). Así el carril está a la misma altura relativa en todas
  las tramas y entre las notas de una y los rótulos de la siguiente queda hueco. `remedir(row)` vuelve a medir una fila sin
  reconstruir el tablero y, si cambió de alto, pone al día `GEO` (las de debajo se corren) y `cables()`: lo usan el arrastre de
  notas y la escritura en vivo (el título de un nodo, el texto de una nota en el panel), que antes solo recolocaban la fila. Se arrastra el borde de abajo de la etiqueta de la trama (`.fila-asa`) y el borde
  derecho de la cabecera de la columna (`.col-asa`, que es la raya: se ensancha el hueco a su derecha); **doble clic en un asa**
  devuelve su tamaño normal (se cuenta a mano, `dosVeces`: el `preventDefault` del `pointerdown` deja sin `click`), y el botón de
  restablecer de la barra de abajo devuelve las escalas **y** todos los tamaños propios (`T.tablero.restablecerTamanos`, con aviso;
  `pintarEscalas` lo enciende en cuanto hay alguno, desde `alCambiar`).
- **Los saltos se crean arrastrando el «+»** (1.1.23, Leo: «quita en el menú lo de cambio y salto de escena, que las
  funcionalidades existan, solo que no en el menú»): el menú de crear (`abrirMenuCrear`, el del «+» y el doble clic en una
  pista) solo ofrece el nodo. Arrastrando el «+» a otra trama, **la vista previa pinta en sus dos puntas lo que va a nacer**
  (`cel.marcas`, dos `rect` en `#cables`, girados 45° para el rombo): el cuadro o, si una de las dos tramas es alternativa, el
  rombo (`formaEntre`); luego se convierte desde el menú del salto, como siempre (un cuadro sigue sin tocar una alternativa).
- **Mover entre tramas se ve** (1.1.23, Leo: «no hay animación que me indique dónde se va a posicionar si acepto el
  movimiento»): el nodo arrastrado se desliza de celda en celda y, sobre otra trama, **baja o sube a su carril**
  (`transform` con `yFila(destino) - yFila(origen)`; `.pt.arrastrando` con transición de `left` y `transform`), con sus notas
  de nodo (el mismo desplazamiento; antes usaban el borde de la pista y con filas de alto distinto quedaban corridas) y, si es
  el extremo de un salto, su pareja en la misma celda (`.con-nodo`) y el trazo y el nombre del salto apagados (`.en-vilo`)
  hasta soltar; el que se aparta en un intercambio también va al carril (`previaIntercambio`). **Sin parpadeos** (1.1.27, Leo: «la
  animación de mover un nodo a otra trama se ve rara, quizás porque tiene notas… muchos parpadeos»; eran dos cosas): las notas del
  nodo arrastrado, que viajan con él, quedaban bajo el puntero y el destino (`elementFromPoint` → `.track`) saltaba a su trama de
  origen en cada movimiento —ahora lo que viaja en la vista previa (`.pt.con-nodo`, `.nota.con-nodo`, `.pt.intercambio`,
  `.nota.intercambio`) lleva `pointer-events: none`—; y `previaIntercambio` devolvía lo apartado a su sitio y lo volvía a apartar
  en cada movimiento: ahora recuerda lo que puso (`arr.previaT`) y solo toca lo que cambia. Y **al cruzar la línea de un salto**
  (1.1.29, Leo: «sigue ocurriendo… cuando paso por la línea que une las tramas»): el trazo (y su nombre) quedaba encima de la
  pista y `elementFromPoint` no daba ninguna, así que el destino volvía a la trama de origen; ahora el nodo, la nota y el «+» la
  buscan con `pistaBajo(x, y)`, que recorre `elementsFromPoint` hasta la primera `#board .track`. Y **al pasar de largo por la
  columna de un cuadro** (1.1.30, Leo: «sigue parpadeando»): la vista previa del intercambio mandaba el salto entero a la otra
  punta y lo devolvía en cuanto el puntero seguía, con su trazo y su nombre quietos. Ahora sale **solo si el puntero se detiene
  220 ms** sobre el mismo nodo (`arr.candidato`, `arr.esperaPrevia`; soltar antes intercambia igual) y el salto se aparta entero:
  sus extremos, su trazo (`[data-salto-g]`) y su nombre (`previaDe`, aplicado con `ponerPrevia`; si el extremo cambia de trama,
  el trazo se apaga con `.en-vilo`). Lo arrastrado va por encima de los trazos y los nombres de los saltos (`.pt.arrastrando`
  z 7 y la capa de sus notas, z 6). Probado con el ratón de verdad en Electron (`sendInputEvent`): de largo, cero cambios.
  **La causa que quedaba** (1.1.31, Leo con su proyecto «Análisis de The Office»: «Se ve a Jim y Dwight», de la trama azul a la de
  arriba): el rótulo de un nodo lleva `pointer-events: auto` (para pasar el ratón por él) y el `pointer-events: none` que se pone al
  nodo arrastrado no le llega; al subir, su rótulo caía bajo el puntero y `pistaBajo` daba la trama de origen (el rótulo sigue en
  su DOM), así que la vista previa bajaba y subía. Ahora nada de dentro de `.pt.arrastrando`, `.con-nodo` o `.intercambio` recibe
  el puntero (`!important`) y `pistaBajo` se lo salta. Para reproducirlo se cargaron sus datos en un Electron aparte y se subió el
  nodo con `sendInputEvent`: 4 saltos antes, 0 después. Una nota arrastrada, que ya se
  movía en el modelo de sitio en sitio, **ahora se desliza** hasta el nuevo (`animarNotas` ya no se la salta, 200 ms).
- **Arrastrando cerca de un borde, el tablero se desplaza solo** (1.1.23, Leo: «cuando muevo una nota o nodo muy a la derecha o
  izquierda, no se hace scroll automáticamente»): nodos, notas, saltos, bloques y el «+» hacia otra trama (este, solo en vertical).
  `vigilarBordes` (al principio de `onPointerMove`) arranca `pasoDespl` cada 16 ms mientras dura uno de esos arrastres; a menos de
  `BORDE_DESPL` (48 px) de un borde —el izquierdo es el de la columna de tramas (`zonaUtil`), el de arriba el del eje— desplaza
  `#board`, más deprisa cuanto más cerca, y **repite el movimiento** con la última posición del puntero (un evento hecho a mano
  con `desplazando: true`, recortado dentro del tablero) para que lo arrastrado siga debajo; `onPointerUp` lo para. El bloque
  cuenta lo que se ha desplazado desde que empezó (`sl0`/`st0`). El borde de un acto sigue con su `autoCrecer`.
  **Solo con un arrastre de verdad** (1.1.24): hasta que el puntero se aleja 6 px de donde se pulsó (`inicioPuntero`) no arranca,
  así un clic o un doble clic sobre un nodo junto al borde no desplazan nada; y el movimiento que se repite lleva la posición de
  verdad a los arrastres que cuentan distancia (un acto, un bloque, el trazo de un salto): recortada al tablero, los descuadraba.
- **Renombrar no desplaza el tablero** (1.1.24, Leo: «si está desplazada la trama y quiero cambiar el nombre a un nodo, me mueve al
  inicio del scroll»): `editarEnSitio` enfoca con `preventScroll`. Con el nombre de un cuadro o un rombo (`renombrarSalto`) el
  campo se coloca después de crearlo, y al enfocarlo aún estaba en la esquina del tablero: el navegador saltaba al principio.
- **Pellizcar con el trackpad cambia el zoom de la vista** (1.1.51, Leo: «cuando hago un gesto de pellizco en un esquema, lo que
  crece es la escala horizontal, que sea mejor el zoom el que se vea afectado por el gesto»; de la 1.1.23 a la 1.1.50 movía la
  escala horizontal): Chrome y Electron dan el pellizco como `wheel` con `ctrlKey` (Ctrl + rueda también vale). `onWheel` (en
  `document`, solo sobre `#board`; nada a mitad de un arrastre) lo acumula —cada evento con tope de ±30, para que una muesca de la
  rueda no pase de un 35 %— y `aplicarPellizco`, una vez por fotograma, multiplica `ZOOM` por `exp(-delta · 0,01)` entre 0,4 y 3
  (los topes de sus botones) con `zoomEn(nuevo, ancla)`: solo cambia `--zoom-esq`, sin repintar (el tablero mide en sus píxeles),
  y corrige `scrollLeft` **y** `scrollTop` para que lo de debajo del puntero se quede ahí. **El ancla es la del principio del
  gesto** (se vuelve a tomar si el puntero se mueve más de 4 px): con el esquema que cabe entero en alto no se puede desplazar en
  vertical y el punto se corre, y recalculándola en cada fotograma esa deriva ya no se recuperaba. Por fotograma llama a
  `alVista(false)` (app.js pinta el porcentaje); 180 ms después del último evento redondea a un porcentaje entero —el que se lee
  abajo: con 0,998 el «+» iba a 1 y no se veía el paso—, repinta una vez conservando el desplazamiento (salvo si hay un arrastre o
  se escribe un nombre en sitio: repintar cerraría el campo y guardaría lo que llevara) y llama a `alVista(true)` (`recordarZoom`
  lo guarda en `vista.zoomEsq`). **Sin `alVista`** (tramas.html, que no tiene zoom de la vista) sigue como antes: la escala
  horizontal y `alZoom`. Prueba de Electron con eventos de rueda reales en el scratchpad (`pellizco-electron.js`, 25
  comprobaciones: anclaje en los dos ejes, topes, porcentaje, que la escala no se mueve, arrastre, nombre en sitio, tramas.html).
- **El nombre de un nodo se escribe con su color** (1.1.23, Leo: «cuando estoy creando un nodo, siempre se ve lo que escribo en
  morado; es hasta que doy Enter cuando toma el color de la trama»): `.cap-edit` (al crear o con doble clic) lleva el `--c` del
  nodo en el borde, el fondo, el halo y la selección, como su rótulo, y no el acento (`#board .pt .cap-edit` en la piel).
- **El campo de una nota que se escribe va centrado bajo su sitio** (1.1.23, Leo: «se desplaza un poco a la izquierda cuando voy
  a escribir el texto»): sin su texto la nota se encoge y el campo (`.nota-edit`, centrado en ella) se corría; `editarEnSitio`
  lo centra en su guía (`--gx`), sin salirse de la pista por la izquierda.
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
- **Ya no hay camino iluminado** (1.1.25, Leo: «quita mi regla de que al seleccionar un nodo se sigue un camino por medio de
  los cuadros o rombos, todo que se vea igual»): elegir un nodo no enciende el recorrido que siguió la historia hasta él ni apaga
  lo demás. `calcularRuta()` deja `ruta` en null, así que `body.con-ruta`, `.cadena.ruta`, `.pt.en-ruta` y la opacidad de los
  saltos fuera del camino ya no salen (el CSS sigue ahí) y `sinRuta` desapareció: Esc con un nodo elegido y el panel abajo no hace
  nada (con el panel al lado, tramas.html, suelta la selección). `m.recorrido()` sigue en el modelo y en sus pruebas. **Y nada se
  apaga nunca** (Leo, al ver que lo de fuera de escena seguía: «no, ni así, que no se apague en ningún momento»): `render()` usa
  siempre `SIN_PRESENCIA`, así que lo que queda entre la salida y la vuelta de un salto ya no lleva `.fuera` (ni en el tablero ni
  en la tira del editor, texto.js, ni el aviso «fuera de escena» del panel del nodo). `m.presencia()` sigue en el modelo. Lo único
  que se ve apagado es lo que se descarta a mano (nodo o trama).
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
  `insertarColumnas(cg, cuantas, lado)` (dentro de un acto lo alargan y los actos de detrás se corren),
  `moverColumnas(cgs, delta)` (**arrastrar la cabecera de una columna ya elegida mueve las elegidas con lo que tengan
  dentro**, Leo 16-09-2026: se sacan de la cuadrícula y se meten `delta` más allá, lo demás conserva su orden y los actos no
  cambian de ancho —lo que cambia de acto es el contenido—; sueltas, quedan juntas en el destino; la vista previa
  (`previaColumnas`) corre las rayas, los nodos y los trazos hasta soltar, y al soltar lo elegido sigue a las columnas),
  `borrarColumnas(cgs)` (borra sus nodos con `borrarPuntos`, corre lo de la derecha tantas columnas como se quitaron antes,
  acorta los actos que las tenían y elimina los que se quedan a cero, y repara las notas; nunca deja el tablero sin columnas) y
  `resumenColumnas(cgs)`. Por eso `normalizar` ya **no sube el ancho de un acto a
  `MIN_CELDAS`** (respeta desde 1); `MIN_CELDAS` es el mínimo del divisor y de la barra del panel, y **vale 1** (Leo,
  16-09-2026: «lo mínimo que puede tener un acto no debe ser 7, debe ser 1»; antes 6), también para los momentos. Todo entra en
  Deshacer como un paso (lo registra el `render()` de siempre).
- **Delante de la primera columna va un hueco de una celda** (Leo, 16-09-2026: «deja un espacio, como punto 0, pero sin el 0,
  donde no se pone nada»; así la columna 1 no queda pegada a la columna de tramas y su cabecera se ve entera): en tablero.js
  todo lo que pasa de celdas a píxeles va por `px(cg) = MARGEN() + cg * G()` y lo que vuelve, por `celdaEn(x)`; `MARGEN()` es
  una celda. El hueco no es de ningún acto y ahí no sale el «+» de crear (`onMouseMove` lo esconde si `celdaEn < 0`).
- **Después de la última columna hay una más** (1.1.5, Leo 17-09-2026: «cuando llego al final de una trama ya no se me sugiere
  agregar nuevos nodos»): las pistas miden `W + G()` y, pasado el final, `onMouseMove` pone el «+» ahí con `celdaObj.extender`.
  Nada cambia hasta crear: `extender(q)` llama a `m.asegurarCeldas(total)` (nace esa columna; los actos no cambian) y
  devuelve dónde quedó; vale para el menú de crear y para arrastrar el «+» a otra trama (salto).
- **El borde de un acto se arrastra columna a columna** (1.1.8; desde la 1.1.24 **solo cambia dónde acaba el acto**: antes
  añadía y quitaba columnas y movía los nodos): el arrastre `res` (`{ a, x0, fin0 }`) llama a `m.moverBorde(id, fin0 + columnas
  recorridas)` y redibuja si cambió. `#addActo` va detrás del último acto.
  **Pegado al borde crece solo** (1.1.9, Leo 17-09-2026: «para que funcione tengo que arrastrar a la izquierda y luego a la
  derecha»: el final del último acto queda junto al borde del tablero y no había sitio para llevar el puntero más allá):
  `autoCrecer()` —con el puntero a menos de `BORDE_AUTO` (40 px) del borde derecho de `#board`— alarga el acto una columna cada 110 ms (pasado el final nacen columnas),
  desplaza el tablero lo mismo y corre `res.x0`, así el borde sigue bajo el puntero; para al alejarse, al soltar, si el puntero
  sale de la ventana (`mouseleave` del documento) o si vuelve sin botón (`buttons === 0` cuenta como soltar: al simularlo, los
  `pointermove` deben llevar `buttons: 1`).
- **El alto de carril y del eje los fija la hoja de estilos** (`--fila`, `--eje` en `:root` de
  `css/tramas.css`, 120 y 57 —44 de actos más 13 de la tira de columnas—; la piel de ClapCraft pone 80 y 46): `tablero.js` los lee con
  `getComputedStyle` al cargar (`medida()`) para colocar los cables del SVG. Cambiar `.row`/`.axis`
  por CSS sin tocar esas variables desalinea los saltos (pasó el 13-09-2026).
- **Ocultar tramas** (1.1.40, Leo: «que se puedan ocultar tramas, como cuando se ocultan filas de Excel; no las elimina, solo las
  oculta y se pueden mostrar de nuevo más adelante; se ocultan con todo y sus elementos; solo se puede desocultar desde el esquema,
  no desde el editor»): `linea.oculta` en el modelo (`ocultarLinea(id, v)`, `mostrarLinea`, `mostrarTodasLasLineas`,
  `lineasVisibles`; `normalizar` la conserva y nunca deja todas ocultas: **siempre queda una a la vista**). No se borra nada: sus
  nodos, saltos y notas siguen ahí y vuelven con ella. **Borrar la última que se ve deja otra a la vista** (1.1.48: con las demás
  ocultas, `borrarLinea` dejaba el esquema con cero filas —solo la franja de ocultas— hasta volver a abrir el proyecto, que era
  cuando `normalizar` lo arreglaba). **Y al reordenar tramas arrastrando, `moverFila` traduce el sitio donde se suelta —que cuenta
  filas a la vista— al índice de la lista entera, donde también están las ocultas** (1.1.48: con una oculta por encima, soltar una
  trama debajo de otra las dejaba al revés o no la movía). El tablero no pinta su fila, `altoFilas`/`filaEn` no la cuentan, `cables()`
  se salta los saltos con una punta escondida y, si hay ocultas, va una franja al final (`.row.ocultas`) con su cuenta: su botón
  (`#verOcultas`) abre el menú con cada una y «Mostrar todas» (`data-mostrar-linea`, `data-mostrar-todas`). Se oculta desde el panel
  flotante de la trama («Ocultar» → `T.tablero.ocultarLinea`). En el editor (texto.js) la tira solo recorre las visibles, sus
  flechas las saltan y un cuadro que lleva a una oculta avisa en lugar de cambiar de trama.
- **Zoom de la vista** (1.1.40, Leo: «implementa un zoom en los esquemas para verlos más cerca»): `#canvas` lleva `zoom` de CSS
  (`--zoom-esq`, que escribe `T.tablero.vista(v)`, de 0,4 a 3), así que crece todo —nodos, rótulos, notas, eje— y las barras de
  desplazamiento siguen valiendo. **Ojo con las medidas**: con `zoom`, `getBoundingClientRect`, las coordenadas del puntero y
  `scrollLeft` van en píxeles de pantalla (× ZOOM) y `offsetLeft`, los estilos en línea y la geometría del tablero (`px`, `G`,
  `yFila`) en los suyos; por eso `L(d)` pasa de pantalla a tablero, `P(d)` al revés y `celdaCli(dx)` es `celdaEn` con una distancia
  de pantalla. Van por ahí los arrastres (nodo, nota, salto, bloque, columnas, acto y su borde), el «+» de la celda, la marquesina,
  la marca de reordenar filas y el ancla de una raya para el panel flotante. En la barra de abajo, «− 100 % +» (`.zoom-vista`,
  `[data-zoom]`, pasos de `PASOS`, el porcentaje vuelve al 100 %) y Cmd/Ctrl + − 0 con el esquema delante; se recuerda en
  `vista.zoomEsq`. La escala horizontal y el alto de carril siguen siendo otra cosa; desde la 1.1.51 el pellizco mueve este zoom
  (ver «Pellizcar con el trackpad»).
- **Un clic en el nombre de una trama o de un acto la elige** (1.1.40): su campo es de solo lectura hasta el doble clic —lo dice su
  título, «Clic: seleccionar · doble clic: renombrar»—, pero el clic no hacía nada y el acto parecía no dejarse elegir.
- **Fondo de los actos**: `acto.fondo` es un color de `FONDOS`, `'ninguno'` («Sin fondo», elegido a
  mano) o `null` = automático por posición (`FONDOS_AUTO`: azul, ámbar, verde, violeta, rojo, gris;
  `T.fondoEfectivo(acto, i)`), como en el diseño. El panel del acto marca el automático.
- `T.tablero.simple(true)` (el tablero de un personaje en ClapCraft): sin fuera de escena ni camino
  iluminado, sin rombos y sin sentido en los saltos (el
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
- `js/claquedraw/app.js`: **una ventana por proyecto** (1.1.33, Leo: «que los proyectos se abran en nuevas ventanas y pueda tener
  varios abiertos a la vez»). La ventana lleva un proyecto (o ninguno: «Sin proyectos» / «Nuevo proyecto») y lo dice su dirección,
  `claquedraw.html?p=<id>` (`informarVentana` la pone con `history.replaceState` y se lo cuenta a Electron: `api.ventanaProyecto({
  id, nombre, ruta, nuevo })`). `biblioteca` sigue siendo una `C.Biblioteca`, con un solo guion, y `persistir()` lo escribe **en
  su clave**, `guiones.claquedraw.p.<id>` (y `guiones.claquedraw.ultimo`, que en el navegador abre la página sin nada pedido):
  dos ventanas no se pisan. Hasta la 1.1.32 todos iban en `guiones.claquedraw.biblioteca`: `repartir()` lo pasa una sola vez
  (el activo se queda en la ventana y los demás se abren en las suyas, `otrosDeAntes`). La vista (`guiones.claquedraw.vista`) es
  de todas: `guardarVista` relee lo guardado y solo toca, de los mapas por proyecto (`archivos`, `pestanas`, `pantallas`), los
  de sus proyectos (`idsPropios`). **Lo que la ventana quita de la vista se quita también de lo guardado** (1.1.51, `conocidas`: las
  claves que ha tenido; si falta una, la quitó): la mezcla con lo guardado la devolvía, así que volver al 100 % (`zoomEsq`),
  restablecer las escalas (`zoom`, `alto`) o el ancho del menú (`ladoAncho`) no se recordaba y al abrir otra vez la app volvía el
  valor de antes. **Abrir o crear con un proyecto ya en la ventana (`ocupada()`: uno que no sea un «Sin título»
  sin tocar) va a otra ventana** (`abrirVentana(q)`: en Electron `api.abrirVentana`, que trae delante la que ya tenga ese
  proyecto o archivo; en el navegador, `window.open`): `nuevo()` → `?nuevo`, `abrirRuta` → `?ruta` (antes `api.buscarRuta`: si
  otra ventana lo tiene, va a ella; si esta, lo dice), `abrirHandle` → `?h=<clave>` (el handle por IndexedDB,
  `pendiente:<clave>`), un archivo sin ruta ni handle → `?t=<clave>` (su texto en `guiones.claquedraw.pendiente.<clave>`); la
  ventana nueva lo atiende al arrancar (`pedido()`). `elegirArchivoNuevo` rechaza un archivo que ya es de otra ventana.
  **Cerrar el proyecto** (`cerrarProyecto`: Archivo › Cerrar proyecto, Cmd+Shift+W, Cmd+W con una sola pestaña) escribe lo
  pendiente o pregunta si no tiene archivo, lo quita de este equipo (`quitarDeLaVentana`: su clave, sus pestañas, su vínculo) y
  cierra la ventana (`api.cerrarVentana`), salvo si es la única, que se queda en «Sin proyectos»; el botón rojo de la ventana
  pasa por lo mismo (Electron no la cierra: manda la orden `cerrarVentana` y la página la cierra con `forzar`). Cancelar un
  proyecto nuevo en una ventana abierta para eso la cierra. En `electron/main.js`: `ventanas` (por `webContents.id`: `proyecto`,
  `ruta`, `nuevo`, `cerrable`), `ventanas.json` en los datos de la app con las ventanas y su sitio (**salir de la app no las
  olvida**: al arrancar se abre una por cada una; cerrar una ventana sí), las IPC `ventana:proyecto`, `ventana:abrir`,
  `ventana:buscarRuta` y `ventana:cerrar`, y una ventana nueva sale 28 px más abajo y a la derecha. El asterisco del título es
  `modificado(id)` (sin archivo: no virgen; con archivo: `sucio`). Primer arranque: hereda `guiones.tramas.doc` si existe (sin
  borrarlo).
  **Arriba, las pestañas del proyecto** (1.1.33, Leo: «que en los elementos del árbol o en notas y segmentos exista en los tres
  puntos la opción "Abrir en pestaña"… si ya tengo un elemento abierto en una pestaña, no se duplica»; «los documentos de los
  esquemas y los esquemas también se puedan abrir en pestañas diferentes»): la franja lleva a la izquierda el nombre del
  proyecto (`.franja-proyecto`, doble clic lo renombra) y detrás sus pestañas, cada una **una pantalla** (`pantallaActual()`: vista,
  árbol, esquema montado, biblioteca, segmento expandido `seg`, nota, papelera, documento `doc`) con la inicial de su clase
  (`rotuloDe`: E esquema, D su documento, B biblioteca, P personaje, S segmento, N nota; su color si lo tiene). `vista.pestanas[id]
  = { lista: [{ id, p }], activa }`. Lo que se hace en el árbol cambia la de delante (`recordarPantalla` la apunta, como antes la
  última pantalla); **«Abrir en pestaña»** en los ⋯ del gestor (esquemas —y «Abrir el documento en pestaña»—, bibliotecas,
  personajes, segmentos, notas y papelera; `o.abrirEnPestana({ tipo, id, clave })` → `pantallaDe`) abre otra detrás de la de
  delante o, si ya hay una con ese elemento (`claveDe`), va a ella. Cambiar de pestaña (`cambiarPestana`) apunta la que se deja y
  repone la otra (`reponer`, que ya no remonta el esquema si es el mismo y monta sin abrir el editor, `montarEsquema(eid, {
  sinEditor })`, para no crear el documento de un esquema al pasar por él). Se ordenan arrastrándolas (`pestArr`), se cierran con
  su × o el botón central (la última no tiene ×), Cmd+W cierra la de delante y Ctrl+Tab pasa de una a otra; una cuyo elemento ya
  no existe se quita al redibujar (`podarPestanas`). Las pestañas de antes eran los proyectos (1.1.26: se ordenaban igual).
  **Cada pestaña guarda su nota elegida con su ventana abierta** (1.1.34, Leo: «el sidepanel de los segmentos cuando presiono una
  nota se cierra cuando cambio de pestaña»; desde la 1.1.54 es la ventana de la nota): `p.sel` (`C.gestor.notaElegida()`, la de la
  ventana abierta) y `reponer` la vuelve a elegir con `C.gestor.elegirNota(sel)`, que la deja para reabrirse (`reabrir`), antes de abrir la biblioteca o el segmento (así otra pestaña no hereda la de esta). El
  cierre estaba en el clic «fuera de las notas» del gestor: cuando llega ahí, la pestaña pulsada ya no está en la página (la franja
  se redibuja al cambiar) y `closest('#pestanas')` no la encontraba; ahora mira `e.composedPath()` (`enPestanas`). Abrir y cerrar
  la ventana apuntan la pantalla (`o.alNavegar`).
  **‹ › en las cabeceras: el historial de la pestaña** (1.1.35, Leo: «a la izquierda del nombre del contenedor en las pantallas
  unos botones < > para poder regresar a la pantalla anterior»): `t.atras` / `t.adelante` (hasta `MAX_HISTORIA`, 40) viajan con
  la pestaña en `vista.pestanas`; `recordarPantalla`, cuando lo de delante cambia de elemento (`claveDe`), mete lo de antes en
  `atras` y olvida `adelante`; `irHistoria(±1)` repone (saltando lo que ya no existe). Los botones (`.nav-hist`, `HISTORIA`) los
  pone un MutationObserver sobre `main` delante de cada `.esq-titulo` (esquema, documento, biblioteca, segmento expandido, nota:
  las cabeceras se rehacen a menudo) y `pintarHistoria` los apaga sin nada a ese lado; el clic se atiende en captura y no llega al
  gestor. También Cmd/Ctrl+[ y ] (no con el foco en un campo) y las órdenes `atras`/`adelante`. **«Contenedores» y «Personajes»
  del pie del menú solo cambian el árbol** (`o.verArbol` + `renderLado`; Leo: «no me debe cambiar de pantalla hasta que presione
  algún elemento del árbol… afecta la navegación entre pestañas»; antes montaban un esquema o abrían un personaje). **El «+»
  detrás de la última pestaña** (`[data-nueva-pestana]`, `nuevaPestana`, Cmd+T y Archivo › Pestaña nueva) abre una pestaña al
  final en el primer elemento de Contenedores (`primerElemento`: el primer esquema o biblioteca en el orden del árbol, entrando en
  carpetas y grupos).
  **El editor recuerda dónde se quedó cada documento** (1.1.33, Leo: «no se debe perder la línea… al hacer cambios de pestaña;
  actualmente si cambio de pantalla en el árbol se pierde la línea del editor»): texto.js apunta por documento (`op.clave` de
  `abrirDocumento`, la id de su nota) el bloque y el carácter del cursor y el desplazamiento de la hoja (`selectionchange` y
  `scroll` del marco, solo con el editor a la vista y sin contar el medio segundo tras abrir, en que el cálculo de páginas mueve
  la hoja) y `reponer` los deja igual al volver a abrirlo; sin nada apuntado, arriba (`alPrincipio`).
- **Proyectos: «Nuevo proyecto» y «Sin proyectos»** (Leo, 15-09-2026, `docs/diseno/rediseno-13/`: «la pestaña en realidad es un
  proyecto»; el menú Archivo dice Nuevo proyecto…, Abrir proyecto… y Cerrar proyecto). **Nuevo** (Ctrl+N, el «+», `btnNuevo`, el
  menú) ya no crea un «Sin título»: abre la **pestaña de creación** (`.pestana-proyecto`, una sola, en memoria; se puede ir a
  otra y volver; `pantalla = 'nuevo'` en app.js → `body.pantalla-nuevo`, que tapa todo `<main>` con `#nuevoProyecto`).
  `js/claquedraw/proyectos.js` la pinta: lateral de 320 px con el nombre (obligatorio: sin nombre, el campo tiembla) y a la
  derecha las plantillas, «Árbol que crea» y «Tramas que crea»; Enter crea (salvo con foco en un botón), Esc cancela. **Ya no
  hay «Dónde se guarda»** (1.1.22, Leo: «que cuando des en "Crear proyecto" te abra el Files del sistema operativo para que
  selecciones el nombre del archivo y la ruta»): lo pregunta el diálogo de guardar del sistema (ver `crearProyecto`). **Plantillas** (`js/claquedraw/plantillas.js`, Node, `test/plantillas.test.js`): seis (En blanco,
  Largometraje, Serie de TV, Novela, Cortometraje, Teatro), cada una con un contenedor, carpetas (color: uno de los seis de
  carpeta), esquemas y bibliotecas sueltas; cada esquema lleva los tres actos de siempre y las tramas de la plantilla,
  **sin nodos** (Leo, 16-09-2026: ya no se crea «Inicio»). **Ningún esquema de plantilla trae biblioteca enlazada**
  (Leo, 16-09-2026: «si aún está lo de que al hacer un esquema se cree una biblioteca, quítalo»): las bibliotecas de una
  plantilla son las que se listan aparte, y «En blanco» crea «Contenedor» con un solo «Esquema». La prueba exige que lo
  creado sea exactamente el árbol de la vista previa: **no inventar chips que no se crean** (el diseño decía «8 CAPÍTULOS»
  con dos en el árbol).
  `crearProyecto` (app.js) **elige primero el archivo** (`elegirArchivoNuevo`): Electron, IPC `proyecto:elegirArchivo` (el
  diálogo de guardar, «Crear», en `vista.carpetaProyectos` —la carpeta del último proyecto creado—, o `~/Documents/ClapCraft`
  si existe, o Documentos; solo devuelve la ruta); Chrome/Edge, `showSaveFilePicker` con `id: 'clapcraft-proyectos'`; sin
  diálogo, se crea sin archivo como antes. El nombre propuesto es `C.nombreArchivo(nombre)` (biblioteca.js, Node): sin
  espacios y con guiones, sin acentos, la ñ como «ni» y en minúsculas («Año nuevo» → `anio-nuevo.clapcraft`); «Guardar
  como…» propone lo mismo. **Cancelar no crea nada** y la pantalla sigue con lo escrito; un archivo que ya es de otro
  proyecto abierto se rechaza (se pisarían). Después `biblioteca.crear({ nombre, documentos: plantillas.documentos(id) })`,
  monta y `archivoNuevo` vincula y escribe con `escribirArchivo` (si no queda escrito: desvincula y, en el navegador, descarga
  una copia). **La pestaña lleva el nombre del proyecto, no el del archivo.** Desaparecieron `archivoEnCarpeta`,
  `carpetaInicial`, `elegirCarpeta` y los IPC `proyecto:carpeta`, `proyecto:elegirCarpeta` y `proyecto:crear`. **Sin proyectos** (`body.sin-proyectos`, `#sinProyectos`): al cerrar el
  proyecto de la última ventana (`quedarSinProyectos`: nada montado, `abiertoId = null`) y en el primer arranque (`vista.iniciada`; salvo si
  hay un tablero de tramas.html que heredar). Riel de 44 px, «Nuevo proyecto», «Abrir un proyecto», **recientes**
  (`guiones.claquedraw.recientes`, ocho como mucho: `recordarReciente` al abrir, crear, «Guardar como…», montar y cerrar un
  proyecto con archivo; clave = ruta o `h:<nombre>` con el handle en IndexedDB `reciente:<clave>`; tono de la plantilla o por
  nombre; `plantillas.estructura` y `plantillas.visto`), y el pie con los atajos y la versión (`editorAPI.version` o
  `package.json`). **Soltar un `.clapcraft`** en la ventana lo abre (Electron: `editorAPI.rutaDe` = `webUtils.getPathForFile`;
  Chrome/Edge: `getAsFileSystemHandle`, queda vinculado; si no, solo leído). Sin proyecto, la franja esconde Guardar y el
  indicador. `npm run test:archivos` arranca sin proyectos (crea uno en blanco, con su archivo en la carpeta temporal) y
  comprueba el diálogo de «Crear proyecto» (nombre propuesto, cancelar, dónde nace el archivo, el nombre de la pestaña, no pisar
  el archivo de otro proyecto abierto), cerrar todo y abrir un reciente, y que ese proyecto se sigue guardando (Leo, 15-09-2026: «ve que el guardado siga
  funcionando»): notas y texto de sección llegan solos a su archivo, cerrar justo tras un cambio lo escribe, reabrir desde
  recientes no reescribe, crear otro proyecto escribe lo pendiente del anterior y, al volver a arrancar, los dos siguen
  vinculados sin reescribirse (86 en la 1.1.55, con Electron sabiendo el archivo de cada ventana al arrancar, «Guardar como…» rechazando el de otra ventana, un cambio durante una escritura y que no queden temporales; 78 en la 1.1.33, ya con una ventana por proyecto: «Abrir…» y «Nuevo proyecto» en otra
  ventana, abrir dos veces el mismo archivo no abre otra, `ventanas.json`, cerrar ventanas y las pestañas; antes 71, con renombrar el proyecto sin tocar su archivo, su contenedor
  detrás y exportar a Markdown; «guarda la nota nueva creada en el segmento expandido» falla alguna vez por los tiempos del
  arrastre sintético: repetir antes de buscar un fallo). En el panel de navegador la tecla Enter de la herramienta no llega al campo: se prueba con
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
  `mismoContenido` (documentos normalizados, claves ordenadas) aunque el texto difiera.
  **El nombre del proyecto va por su lado y el del archivo por el suyo** (1.1.19, Leo: «quiero poder cambiar el nombre del
  proyecto, sin que eso cambie el nombre del archivo automáticamente»): el proyecto se renombra con **doble clic en su pestaña**
  (`click` con `detail` 2: el primer clic puede montar y redibujar las pestañas) o **Archivo › Renombrar proyecto…** (orden
  `renombrar`), en sitio (`editarNombrePestana`: `input.pestana-edit`, Enter o salir guarda, Esc deja; mientras,
  `editandoPestana` frena `renderPestanas`) → `renombrarProyecto` (`biblioteca.renombrar`, `persistir()` escribe el nombre
  nuevo **dentro** de su archivo, que no cambia de nombre, y `recordarReciente` lo pone en los recientes). Al abrir un archivo el
  proyecto toma **el nombre que lleva dentro** (`datos.nombre`; el del archivo solo si no trae), «Guardar como…» propone el
  nombre del proyecto y ya no lo renombra, y crear un proyecto en una carpeta tampoco (desapareció `nombrarComoArchivo`, que
  igualaba el proyecto a su archivo). **La cabecera enseña el contenedor, no el proyecto** («AMOR TIKTOKER [Piloto]»: Leo le
  había puesto al contenedor el nombre del proyecto y, al renombrar, «solo se cambia en la pestaña, no en el header»; 1.1.20):
  `renombrarProyecto` renombra también los contenedores que se llamaban como el proyecto y redibuja cabecera, árbol y editor;
  los de otro nombre («Temporada 1», los de las plantillas) no se tocan. **Qué es «llamarse como el proyecto»** (1.1.21, Leo:
  «no veo aplicado el cambio»; en su proyecto real nunca coincidieron del todo: proyecto «amor-tiktoker», luego «amor toktiker»,
  archivo `amor-tiktoker.clapcraft`, contenedor «Amor tiktoker»): `d.contenedoresLlamados([nombre de antes, nombre del
  archivo sin extensión])` de documentos.js compara sin mayúsculas, acentos ni separadores (`sinSeparadores`: guiones,
  puntos y espacios cuentan como un espacio), así que también vale el nombre del archivo.
  El estado de archivo es **por guion** (`estado(id)` = `{ archivo, ultimoEscrito, temporizador,
  escribiendo }`; `vista.archivos[id]` y la clave IndexedDB `archivo:<id>` lo recuerdan). «Guardar
  como…» (`Ctrl+Shift+S`) y «Abrir…» dejan la pestaña **vinculada** al archivo y desde entonces cada
  `persistir()` programa `escribirArchivo(id)` (1 s) que escribe solo si `serializar(g)` cambió respecto
  a `ultimoEscrito` (`vincular()` lo pone a null: un archivo recién elegido está vacío aunque el
  contenido no haya cambiado; olvidarlo dejaba archivos de 0 bytes al «Guardar como» dos veces). El
  nombre propuesto en el diálogo es el del proyecto (hasta la 1.1.18, «Esquema.clapcraft»). `escribirHandle()` pide permiso si hace
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
  **Revisión del guardado** (1.1.55, Leo: «verifica con un agent team que el guardado de archivos funcione»; cuatro agentes: las
  pruebas, un estrés en Electron con userData temporal —sus guiones en el scratchpad de esa sesión— y la revisión de la página y
  del proceso principal). Lo que se corrigió:
  · **Se escribe de una vez** (`claude/atomico.js`, `test/atomico.test.js`): un temporal junto al archivo, `fsync` y `rename`
    (con los permisos que tenía y a través de un enlace simbólico), para la app (`file:write`, `file:save`), `ventanas.json`,
    `puente.json` y el servidor de Claude. `fs.writeFile` vaciaba el archivo antes de escribir: salir con Cmd+Q a mitad dejaba un
    proyecto grande cortado (reproducido 3 de 3 con 1,8 MB), y quien lo leyera mientras (Claude, iCloud) lo veía roto.
  · **Salir espera** (`before-quit` en main.js): pide a cada ventana `app:vaciar` y la página contesta tras `escribirTodo()` (máximo
    20 s). Antes solo el botón rojo pasaba por la página.
  · **Una escritura en marcha ya no anula la siguiente**: `escribirArchivo` guarda su promesa (`est.enCurso`) y, si llega otra, la
    espera y vuelve a mirar. Antes devolvía false tras quitar el autoguardado pendiente: Cmd+S o un cambio durante una escritura se
    quedaban sin escribir, y cerrar decía «No se pudo escribir» y, aceptando, perdía lo último.
  · **Si falla, se reintenta solo** (5 s, 10 s… hasta un minuto; el aviso sale una vez) y el indicador dice «Sin escribir» (en
    Electron; «Reconectar» queda para el permiso del navegador).
  · **No cabe en este equipo** (el localStorage del origen `file://`, ~52 millones de caracteres para todas las ventanas): la copia
    local se quedaba vieja pero la firma seguía siendo la del archivo, así que al volver a arrancar se tomaba por lo último y
    **pisaba el archivo** (el estrés vio uno de 39 MB quedarse en un proyecto vacío de 360 bytes). Ahora, con archivo, `persistir`
    quita la copia vieja y `pedido()` abre la ventana desde el archivo (`vista.archivos[id].ruta`).
  · **«Cambió fuera»**: mientras se pregunta (`preguntarSinEscribir`, `est.bloqueado`) no se escribe (el autoguardado pisaba lo de
    fuera antes de elegir); `onArchivoCambiado` espera a la escritura en marcha en lugar de ignorar el aviso; y el vigía
    (electron/claude.js) calla solo lo que la app acaba de escribir **por su huella** (`atomico.huella`: disco, inodo, tamaño y
    fecha), no todo lo que llegue en 2 s (un cambio de iCloud en ese rato se perdía).
  · **Electron sabe el archivo de cada ventana desde el arranque**: `retomarArchivos` llama a `informarVentana()` en cuanto lo
    retoma. Antes, hasta el primer cambio, no se vigilaba, Claude lo tomaba por cerrado y **escribía en él con la app abierta** (y
    la app lo pisaba después), y abrirlo desde el Finder abría otra ventana con el mismo archivo.
  · **«Guardar como…» no acepta el archivo de otra ventana** (`file:save` lanza `ABIERTO`) y sus errores se avisan (antes EACCES
    se tragaba). Las rutas se comparan con `atomico.mismoArchivo` (misma identidad: mayúsculas, enlaces) en main.js y en el
    servidor, y el servidor no escribe si el archivo cambió mientras trabajaba (otra sesión de Claude).
  · **Lo que se escribe en sitio o en el panel flotante no se pierde al cerrar**: `volcarTodo()` saca el foco del campo (un nombre
    en sitio se guarda al salir de él) y vacía el `repintarTablero` de 150 ms del panel flotante antes de cerrar, recargar o salir.
  · **Renombrado justo antes de escribir**: `file:write` pasa por `claude.antesDeEscribir`: si el archivo ya no está y se le
    encuentra por su inodo, la ventana pasa a él y la escritura se repite ahí (`MOVIDO`); antes se volvía a crear con el nombre
    viejo. Si no se le encuentra (borrado, o movido a donde no se busca), `archivo:perdido`: se avisa y se vuelve a escribir entero
    en su sitio (antes seguía con ✓ sin archivo). Los inodos se comparan con su disco (`dev`).
  · **Abrir apunta lo que tiene el archivo** (no el proyecto ya montado): lo que cambie al montar (la papelera purgada, el documento
    de un esquema) se escribe; `migrado`, una marca que se pone sola, no cuenta (`sinMarcas` en `mismoContenido` y `firmaDe`).
  · El sello de los enlaces llega también a la copia local, «Guardar» sin haber podido leer el archivo al arrancar mira antes si
    cambió fuera (`releerAntesDeEscribir`), y la app instalada es una sola (`requestSingleInstanceLock`, solo empaquetada).
  · Con la escritura de una vez: un archivo de solo lectura no se escribe aunque la carpeta deje (el `rename` lo habría
    sustituido; `sePuedeEscribir`), los temporales de una escritura cortada (la app matada a mitad) se quitan al volver a abrir
    ese proyecto si su proceso ya no vive (`atomico.limpiar`, desde `ventana:proyecto`), y los errores se dicen en palabras
    (`motivoError`: permiso, disco lleno, carpeta que no existe; sin la ruta del temporal).
  Tras corregir, el agente de estrés repitió sus escenarios: todos los que fallaban pasan (también Cmd+Q con un proyecto de 16 MB a
  mitad de la escritura, y dos ventanas que no caben juntas en el localStorage), sin regresiones.
  Queda: lo que el servidor escribe con `rename` estrena inodo, así que si Claude cambia un proyecto cerrado y luego se renombra
  el archivo antes de volver a abrirlo, «Recientes» no lo encuentra por su identidad (no se pierde nada: se abre con Abrir…); y
  las etiquetas del Finder (atributos extendidos) no pasan al archivo nuevo.
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
  **La tira se edita con un panel flotante** (1.1.36, Leo: «quiero poder agregar, editar, eliminar nodos y notas desde la línea del
  tiempo del editor. No quiero un panel inferior como en el esquema… quizás un panel flotante… incluso si hay varias notas en un
  mismo nodo o raya»; y «en esta vista no dejes hacer relaciones»). `pintarLugares` pone sobre la raya un «+» (`.hilo-mas`, se ve al
  pasar el ratón) en cada **lugar**: delante del primer nodo, entre cada dos (el enlace) y detrás del último, o uno solo en una trama
  sin nodos (`lugares`, en los mismos sitios donde `pintarNotas` pone los puntos de sus notas). El clic en un nodo (o en sus puntos)
  abre `abrirFlot({ tipo: 'nodo' })`: título (en un salto, de los dos extremos), descripción con formato (MdVivo) y sus notas; el de
  un «+» o de los puntos de un enlace o raya, `{ tipo: 'lugar' }`: «＋ Nodo aquí» (`nodoEn`: en medio del hueco entre sus dos nodos
  o, si van pegados, en una columna nueva, `insertarColumnas`; delante del primero en la columna de antes o en una nueva; detrás
  del último en la siguiente) y sus notas (`notasDelLugar`: las del enlace y las de las rayas de entre sus nodos, o las de las
  rayas de ese lado); «＋ Nota» (`crearNota` de nodo o de enlace, `crearNotaAbierta` en una raya), cada nota con su campo y su ×.
  Borrar pide confirmación (`Tramas.tablero.confirmar`; el de un nodo cuenta las notas que se van con él). **Aquí no se crean
  cuadros ni rombos**: el clic en uno sigue pasando la tira a la otra trama y su panel sale con el clic derecho. Los cambios van al
  modelo montado (`o.modelo()`, el del tablero) y se guardan con `o.alCambiarTablero`; el tablero se repinta al volver a él. El panel
  (`.hilo-flot`, fijo, 340 px, en el `body`) se cierra con Esc, un clic fuera (también en la hoja: el `mousedown` del marco) o al
  cerrar el documento, y mientras está abierto no salen los globos de la tira.
  **Desde la 1.1.37 el panel es `js/claquedraw/flotante.js`** (`C.flotante`: `abrir(que, ancla, ctx)`, `abrirNota(id, ancla, ctx)`,
  `cerrar`), compartido con el tablero: la tira le da su contexto (`ctxTira`: repintar la tira, `anclaDe`, `marcar`, `conNodo`) y
  los lugares admiten además la raya de una columna (`{ lineaId, col }`). **En el esquema sale solo al crear** (Leo: «el panel
  solo aparece en la creación, con un clic; si el nodo o nota ya existen, se abre el panel inferior»; y que conviva con él): el
  tablero tiene el gancho `alCrear({ tipo, id }, el)` (tablero.js; sin él, tramas.html, todo como antes): el «+» de una celda (y
  el doble clic en una pista) crea el nodo **con un clic** (`crearAqui`, sin el menú, que solo tenía el nodo) y «Agregar nota» /
  «＋ Nota» (`escribirNotaNueva`) lo llaman en lugar de escribir en sitio; app.js abre el panel con `ctxTablero` (repinta el
  tablero, y con él el panel de abajo, 150 ms después y guarda). El tablero ignora los clics dentro de `.hilo-flot`. **Color solo
  al crear** (Leo: «solo se necesita en ese panel un selector de color al momento de crear, tanto en el esquema como el editor»):
  un nodo recién creado (`que.nuevo`) lleva bajo el título «trama» y los 24 tonos (`Tramas.PALETA`), y cada nota creada con el
  panel abierto (`nuevas`), «papel» y los tonos (`colorearNota`); lo que ya existía no los enseña.
  **Desde la 1.1.38 sustituye al panel de abajo en el esquema** (Leo: «es extremadamente cómodo este panel flotante, sustitúyelo
  por el panel inferior, igual para que aparezca en las tramas, edición de nodos, edición de notas de manera individual o masiva si
  selecciono el nodo… que permanezca abajo del nodo o nota que estoy creando o editando»). `T.tablero.panelFlotante(fn)` (app.js al
  arrancar; `body.panel-flotante` esconde `#panel` y `#panelAsa`): `panel()` ya no pinta nada y llama a `fn({ tipo, id } | null)` en
  cada cambio de selección y en cada render. app.js (`alElegir` → `queDeSel`): nodo → su panel (título, descripción, sus notas);
  salto → el de su nodo de salida; nota → el panel de su sitio con ella señalada (`que.marca`, `.hilo-flot-nota.on`); enlace y raya
  → sus notas; **trama** y **acto** → paneles nuevos de flotante.js (`pintarPieza`: nombre; tipo, 24 colores y Descartar; ancho con
  `fijarAncho`, fondo, y la papelera por `T.tablero.borrarLinea/borrarActo`). Lo mismo ya abierto solo se refresca
  (`C.flotante.igual`, `refrescar`: no repinta mientras el foco está dentro). **Va pegado a lo suyo**: `T.tablero.anclaDe(tipo, id)`
  da el elemento (o, para una raya, una caja a mitad de ella), `colocar` lo pone debajo (encima si no cabe; nunca sobre el menú
  lateral: `ctx.area()` es `#board`), se recoloca con cualquier `scroll` (en captura) y `resize`, y se esconde (`visibility`)
  mientras lo suyo está fuera de `#board`. Cerrarlo (Esc, ×, clic fuera) suelta lo elegido sin redibujar (`T.tablero.soltar`); un
  clic en lo propio (`ctx.dentro`: su `.pt` o su `.nota`) no lo cierra; cambiar de vista lo cierra. **El clic fuera va por
  `pointerdown`** (el tablero cancela el `pointerdown` y entonces no llega `mousedown`, así que un clic en el tablero no lo cerraba),
  también en el documento del marco del editor (`oirMarco`), y al cerrar se avisa `alCambiar` para que se guarde ya. El panel de
  abajo sigue en tramas.html. Prueba de Electron con ratón real en el scratchpad (`flot2-electron.js`, 19 comprobaciones).
  **Nada vacío, Enter/Tab y el color en el punto** (1.1.39, Leo): (1) **el punto de color abre su menú** («es difícil cambiar el
  color de las notas y nodos una vez creados»): el panel de un nodo lleva su punto delante del título (`.hilo-flot-punto`) y cada
  nota el suyo (`.hilo-np`, ahora un botón), los dos con `data-flot-menu-color` (vacío = el nodo, o la id de la nota) →
  `abrirMenu` pinta `.hilo-flot-menu` dentro del panel con «trama»/«papel» y los 24 tonos (`data-flot-pick`); al elegir se aplica
  (`editarPunto` / `colorearNota`), se cierra y `pintarColores` deja los puntos al día. Las filas de color de lo recién creado
  siguen. (2) **No se permiten nodos ni notas vacíos**: `limpiar()` (al cerrar y al pasar a otra cosa) borra un nodo **recién
  creado** sin título —uno que ya existía recupera su `tituloAntes`— y las notas del panel que se quedaron sin texto; las notas
  nacen **sin texto propuesto** (`crearNota(…, '')`; `ponerNota` del tablero solo pone «Nota nueva» sin panel flotante). (3)
  **Teclado** (`teclas`, en captura para ir antes que MdVivo): **Enter** cierra el panel (lo vacío no se crea) y **Mayús+Enter**
  es el salto de renglón (en la descripción, `insertParagraph`); **Tab** desde el título (con nombre) o desde una nota con texto
  abre otra nota lista para escribir, y sin nombre o sin texto no hace nada y el campo tiembla (`.tiembla`). Prueba con ratón y
  teclado reales: `flot3-electron.js` (19 comprobaciones).
  **Arrastrando no sale** (1.1.40, Leo: «al arrastrar un nodo para moverlo, aparece el panel flotante, no debe aparecer en esos
  casos»): `arrastreVivo` se enciende con cada `pointerdown` sobre `#canvas`, y mientras dura, `panel()` cierra el flotante
  (`ganchos.alElegir(null)`) y apunta `panelPendiente`; un `pointerup` registrado **detrás** del suyo lo apaga y, solo si no hubo
  movimiento (clic seco), vuelve a llamar a `panel()`. Para no perder lo elegido, `ctx.marcar(null)` de app.js no suelta la
  selección si `T.tablero.enArrastre()`.
  **Una trama sin nodos** enseña su aviso («Esta trama aún no tiene nodos…») **encima de la raya**, donde irían los títulos
  (`.hilo-pista.vacia .hilo-vacio`, absoluto; 1.0.79): centrado, la raya lo tachaba.
  **Las notas del esquema también van en la tira, como puntos** (1.1.16, Leo: «quiero ver las notas que agregué en el esquema
  en la línea del tiempo del editor»; en la 1.1.17, «márcalas solo con puntos… ocupan mucho espacio»: la 1.1.16 las pintaba
  como tarjetas y la tira crecía). `pintarNotas` en texto.js: bajo un nodo (`.hilo-nodo[data-punto].con-notas > .hilo-notas`)
  un punto por nota (`.hilo-np`, del color de la nota o papel; seis como mucho y «+N»), y bajo la mitad de un enlace o en su
  raya (`.hilo-notas-enlace[data-grupo]`, agrupados por sitio) los de sus notas. El globo `#tip`: al pasar por un nodo, su
  descripción y debajo sus notas (`notasNodo`); al pasar por los puntos de un enlace o de una raya, sus notas (`notasEnlace`),
  con el mismo título que en el nodo, «Nota» o «N notas» (1.1.18, Leo: «no pongas "nota del enlace" o "nota de la raya"»). Un rótulo que va debajo del eje (`.rotulo-abajo`) baja un poco más si el nodo lleva puntos. **Flechas de
  trama**: encima y debajo del círculo de la trama (`.hilo-trama.con-flechas`, `[data-trama-paso]`, `cambiarTrama`) pasan a la
  de arriba o la de abajo en el orden del esquema (Leo: «la opción de poder moverme de tramas, quizás con unas flechas»).
  **Salen siempre**, con borde y sombra (1.1.17, Leo: «tampoco veo las flechas»: con una sola trama no salían y, con más, eran
  dos trazos grises); sin trama a ese lado, apagadas.
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
  **lo que hay abierto en el editor** (`documentoAExportar`: el documento del esquema, un guion o una nota de biblioteca). **Markdown**
  (1.1.19, Leo: «agrega a la exportación poder exportar a .md»): `aMarkdown` usa `Ed.md.fromHtml` del marco (js/markdown.js), que
  ahora sabe de guion —actos `##`, escenas `###`, secundarios `####`, el diálogo junto (`**PERSONAJE**`, `*(paréntesis)*` y lo dicho,
  con saltos de renglón de dos espacios), transiciones como cita salvo «FADE IN:», tomas y montajes en mayúsculas, notas
  `*[…]*` y el diálogo doble como tabla de dos columnas— y pone delante la portada (`# Título`, episodio, autor…); sin el marco,
  el texto sin formato. PDF: HTML imprimible en Carta con Courier Prime (`aImprimible`); en Electron `editorAPI.guardarPdf`
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
    destino), `moverContenedor`, `eliminarContenedor` (sus esquemas y bibliotecas, a la papelera).
  · **Papelera** al final de la barra (`gestor.PAPELERA`; `tirarNota`, `restaurarNota`,
    `eliminarDefinitivo`, `vaciarPapelera`, `purgarPapelera(30)` una vez por guion). **Esquemas, bibliotecas y personajes van
    enteros** (1.1.16, Leo: «que las bibliotecas y esquemas, también de los personajes, se vayan a la papelera y puedan
    restaurarse»): `eliminarEsquema` (con su biblioteca oculta: documento y versiones), `eliminarSub` (segmentos, secciones y
    notas; `_sacarBiblioteca`/`_meterBiblioteca`) y `eliminarPersonaje` (su biblioteca y la lista `carriles` de sus carriles,
    que quedan «Sin personaje») dejan una **pieza** `{ tipo: 'esquema'|'sub'|'personaje', …, origenId, origenNombre,
    carpetaId, grupoId, eliminadoEn }` (`normalizar` las conserva; el esquema se guarda sin `carpetaId`, que va en la pieza,
    para que abrir y guardar den lo mismo). `piezaEnPapelera(id)`, `restaurarPieza(id)`: a su contenedor (si ya no está, al de
    su nombre o a uno nuevo con él; los de personaje, a los suyos), a su carpeta y a su grupo si siguen, con nombre libre; el
    personaje, si no hay otro con su nombre, y recupera los carriles que sigan sin personaje (`o.restaurado` de app.js los ata
    también en el esquema montado). En el gestor: «Mover a la papelera» sin preguntar (se restaura), la papelera enseña arriba
    las piezas (`.gd-pieza`, doble clic o ⋯ › Restaurar / Eliminar del todo) y debajo las notas. Antes de tirar un esquema, el
    montado y el editor se vuelcan (`o.volcar`).
  · **Duplicar** (1.1.16, Leo: «quiero poder duplicar bibliotecas y esquemas, con todo y su contenido»): ⋯ › «Duplicar»
    (`duplicarHijo`, tras `o.volcar`) → `duplicarSub(id)` (segmentos, secciones y notas con ids nuevos, `ordenSegmentos`
    traducido; no las de guiones ni las de personaje) y `duplicarEsquema(eid)` (con su documento y versiones, `guion.eid` al
    nuevo); «Nombre (copia)», detrás del original y en su carpeta y su grupo (`colocarEnArbol(copia, original, true)`).
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
  enlazar la trae. **Se vuelve al editor que se dejó** (1.1.28, Leo: «si está abierto el editor de una nota de segmento, me paso a
  un esquema y luego quiero regresar al editor, me saca del editor y me regresa a la vista expandida»): `salir()` (al irse de
  Documentos a otra vista) apunta la nota abierta en `notaAntes`, y `volverANota()` la abre otra vez al volver con Ver ›
  Documentos (`mostrar`) o pulsando su biblioteca en el árbol, si sigue existiendo; ir a otra biblioteca, a la papelera, a «Ver
  biblioteca» (`abrirSub`), abrir otra nota o cambiar de proyecto la olvidan. **Lo mismo con el documento del esquema** (1.1.29,
  Leo: «si abro el editor del esquema y luego me paso a un editor de un segmento, al regresar al editor del esquema me aparece en
  su lugar el esquema»): `verVista` apunta en `textoAntes` el esquema cuyo documento estaba en la vista Texto al irse a
  Documentos, y el gancho `abrirEsquema` (pulsar ese esquema en el menú) vuelve a `verVista('texto')`; desde su tablero, al
  tablero. Cualquier otra vista que no sea Documentos lo olvida. Las migas de la nota abierta
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
  entra arriba (`nuevaNota` la coloca delante de la primera) y se abre en su ventana con el nombre elegido (1.1.54); caben «＋ nota» y cinco notas (256 px) y
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
- **Lo que se va a la papelera se puede deshacer** (1.1.40, Leo: «cuando aparece notificación que se va a la papelera, que dure tres
  segundos la notificación pero que tenga un botón de deshacer»): `avisar(msg, accion)` en tablero.js pinta el botón
  (`.aviso-accion`) y alarga el aviso a 3 s; en el gestor, `conDeshacer(r, fn)` lo usa al tirar una nota, una biblioteca o un
  esquema, y app.js al eliminar un personaje (con `alRestaurar`, el mismo gancho `restaurado`). Deshacer llama a
  `restaurarNota` / `restaurarPieza`, así que vuelve a su sitio con todo lo suyo. **Y tirar una nota pregunta antes** (Leo: «cuando
  se elimine una nota de segmentos, que aparezca dialog modal de confirmación»): `tirarNota` abre el modal; arrastrarla a la
  papelera no pregunta (es un gesto deliberado) y también trae su «Deshacer».
- **Personajes** (Leo, 14-09-2026). **La etiqueta lleva dos letras** (1.1.40, Leo: «en lugar de la letra P, las primeras dos letras
  del nombre, la segunda en minúscula —"Lestat" es "Le"—; con más de un nombre, las dos iniciales en mayúscula —"Pez Gota" es
  "PG"»): `C.iniciales(nombre)` en documentos.js (con su prueba) lo usan el chip del árbol, el de la papelera y el círculo del
  carril en un esquema de personaje. **Renombrar o recolorear un personaje con un editor abierto** lo cambia al instante (1.1.38, Leo: «no se cambia al instante sino
  que tengo que recargar»): `renombrarPersonaje`/`colorPersonaje` de app.js guardan lo del editor (`guardarEditor`), reescriben las
  notas y el editor relee la suya sin cerrarse (`releerEditor` → `C.texto.recargar(doc)`, con el elenco nuevo y el cursor y el
  desplazamiento donde estaban); antes lo cerraban (`soltarEditor`) y lo viejo seguía a la vista. **Elenco**: los personajes del guion son los que se escriben en el
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
  siga existiendo (si no, el primer esquema, como antes). Vive en la vista, no en el archivo: es de esta máquina. Al volver a una
  nota o a una biblioteca, `reponer` llama a `verVista('documentos')` y `o.mostrarTablero` mira también la clase del `body`
  (1.1.16: `vista.modo` ya decía «documentos» y la página no la ponía, así que se veía el esquema detrás). **Mientras se repone no se apunta nada** (`reponiendo`, 1.0.78): el arranque llama a `persistir()` antes de montar y eso pisaba lo guardado con «sin esquema», así que siempre se abría el primero; la biblioteca solo se reabre si la vista era Documentos (el gestor la recuerda aunque delante esté el esquema) y `montar` ya no salta a Personajes por su cuenta. Al acercar el puntero a un borde del tablero
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
  nueva (`nuevaNota`, en su ventana desde la 1.1.54) y un nodo nuevo del tablero (`nombrarRecien` en tablero.js, tras crear nodo o salto desde
  el menú o arrastrando el «+») quedan con el nombre propuesto escrito y seleccionado en sitio, como un segmento;
  en blanco se queda el propuesto («Sin título», «Punto nuevo», «Evento», «Cambio de escena», «Relación»); en
  un salto el otro extremo toma el nombre si seguía con el propuesto. `aplicarOrden` pone lo nuevo detrás del último de sus predecesores
  naturales. **La ventana de una nota** (1.1.54, de ClapBook; allí Leo: «En lugar del sidepanel que usamos como vista previa en
  los segmentos y bibliotecas, que sea mejor un modal como en notion, que puede expandirse y se cierra si se presiona fuera del
  modal», y «se extrañan las flechas de < > para navegar por las otras notas del segmento… Se debe conservar donde dejo el
  scroll»). Hasta la 1.1.53 era un panel lateral (`.gd-exp-lado`, 1.1.16; ensanchable, 1.1.18) que vivía en `main`: cada render lo
  rehacía (parpadeaba, perdía lo escrito en los últimos 400 ms y `renderMain` lo reabría con un `setTimeout`) y se cerraba al crear
  una nota o al plegar el menú, lo mismo que Leo vio en ClapBook. Ahora un clic en una tarjeta de nota (de la biblioteca o del
  segmento expandido) la abre en una ventana encima de todo (`capaNota`: `div.gd-modal-capa` en el `body`, z 70, con
  `body.con-ventana`; se crea una vez). Cabecera (`.gd-modal-cab`, 46 px): ⤢ (`[data-gd-lado-abrir]`, `expandirLado`: al editor),
  la ruta «CONTENEDOR [biblioteca] › [segmento]» con los chips de las cabeceras (`rutaLadoHtml`; `[data-gd-ruta=bib|seg]` →
  `irARuta`: la biblioteca, o el segmento expandido con la nota marcada; en Personajes, el personaje), ‹ n/N › (`navHtml`,
  `moverLado`, por `vecinasDe`: las notas del segmento **en el orden en que se ven**, con sus filtros, lo que se busque en esa
  vista y el orden de sus tarjetas pintadas —`ordenVisto`—; **ese orden se congela mientras se navega**, `ordenNav`, porque con
  «Modificadas recientemente» escribir en una la subía y › volvía a la de antes; se olvida al cerrar la ventana o el editor y no al
  pasar de una al otro, `navSigue`; en la última, «＋» `[data-gd-nota-nueva]` → `nuevaNota(…, { alFinal: true })`), el punto de su color
  (`[data-gd-lado-color]` → `paletaNota`; con color, la ventana lleva arriba una raya de ese tono), «Copiar enlace para Claude», el
  ⋯ de la nota (`MENUS.nota` por `data-nota-id`, `notaDeBoton`; «Renombrar» enfoca el nombre, y hay «Exportar…»), la papelera
  (`tirarNota`, que pregunta) y ×. Debajo, en `.gd-modal-papel` (760 px), el nombre grande (`[data-gd-lado-titulo]`: renombra al
  escribir, Enter lo aplica y pasa al campo, vacío vuelve al de antes; `tituloCargado` es el que conoce la ventana: si Claude
  renombra la nota con el foco en ese campo, se pone el suyo, y lo que no escribió Leo nunca renombra), **el documento con su formato** (el campo, abajo) y
  `.gd-modal-cola` (un clic ahí, el cursor al final). **Se cierra** con un clic en el fondo solo si el `mousedown` también cayó en
  él (`capa._fuera`) y han pasado más de 350 ms desde que se abrió (`abiertaEn`: el segundo clic de un doble clic en la tarjeta ya
  cae aquí), con Esc (si no lo coge antes un menú) o con ×. **El doble clic en la tarjeta** (< 700 ms, el `dblclick` de la capa, y
  solo si se abrió con un clic en su tarjeta, `porTarjeta`: dos clics seguidos en › o en «＋» abrían el editor) la lleva al editor, y **«Contraer»** (`[data-gd-contraer-nota]` en `#migas`, junto a su papelera nueva, `[data-gd-miga-tirar]`)
  devuelve la nota del editor a su ventana (`contraerNota`; Leo en ClapBook: «Pon junto al bote de basura un botón para contraer la
  nota y se vea de nuevo el modal»). Cada nota vuelve con el desplazamiento y el cursor donde se dejaron (`posLado`: bloque y
  carácter, como `apuntar` de texto.js; en memoria). **Convivencia**: como la capa no está en `main`, nada la rehace; `navegar` la
  cierra al salir de su biblioteca, y también `abrirNota`, `tirarNota`, la papelera y una biblioteca o un segmento que desaparece;
  tras pintar una biblioteca, `ventanaTrasPintar` la pone al día (`refrescarVentana`: cabecera, nombre y, si el documento cambió
  fuera —Claude, una versión, un personaje renombrado— y aquí no se tocó, el campo, con el cursor donde estaba) o la cierra. Ir a
  una biblioteca, un segmento, una sección o una pieza del árbol por un enlace (`mostrarEnlace`) o desde el historial de Claude la
  cierra antes (la taparía). **Se reabre sola una vez**
  (`reabrir`): al volver a una pestaña que la tenía (`elegirNota`) o a la vista Documentos si se dejó con ella abierta (`salir`), y
  solo con esa vista delante (el menú también se pinta desde las otras, y se reabría encima del editor). Con una nota en el editor,
  `render()` no pinta `main`. **La capa corta lo que el tablero de tramas oye en `document`**: `click`, `dblclick` y `contextmenu`
  no salen de ella, ni las teclas de borrar, las flechas, Enter, espacio y Cmd+Z/Y/D (con el foco en un botón de la ventana
  borrarían o desharían en el esquema escondido); por eso nada de dentro lleva `data-nota` (el tablero lo tomaría por uno de sus
  post-it) ni `.esq-titulo` (app.js le metería los ‹ › del historial). Cmd+S, Ctrl+Tab, Cmd+Shift+C y Cmd+W llegan a app.js (Cmd+W
  cierra antes la ventana, `cerrarLoDeDelante`). El clic del documento del gestor no hace nada con la ventana abierta (lo que se
  abre encima —`#dlg`, un menú— no la cierra), respeta al botón que abrió un menú (`disparador`: es su alternar) y no cuenta el de
  un botón que un redibujo ya quitó (`isConnected`). Los menús y el aviso van encima (`.gd-pop` z 80; `body.con-ventana #aviso`
  z 95). **Lo escrito en ella se vuelca con el editor**: `volcarTexto()` de app.js (antes `C.texto.volcar()` a secas) llama también
  a `C.gestor.guardarPanel()` en todos los sitios (guardar, Claude y su historial, pestañas, cerrar, `beforeunload`), y Claude ve
  la nota de la ventana (`estadoEnPantalla`, «Documentos (una nota en su ventana)»; `refDeLoQueSeVe` y Cmd+Shift+C). **Una nota
  nueva se abre en su ventana** con el nombre propuesto elegido (`nuevaNota` → `mostrarLado(id, { enfocarTitulo: true })`; antes se
  renombraba en su tarjeta); con una nota en el editor, lo cierra antes (se creaba detrás de él).
  **El campo** es el documento, **con su formato y en los dos sentidos** (1.1.32, Leo: «para el de segmentos, que sea
  bidireccional con el editor»; hasta entonces cada párrafo era un renglón de texto plano y al guardar las listas se volvían
  párrafos): `htmlDeLado` copia el documento tal cual —negritas, colores, títulos, listas, citas, elementos de guion con una
  pista de lo que son (mayúsculas, el «( )» y los «[ ]» que el editor pinta con CSS, el chip del personaje)— con cada bloque
  señalado por `data-l` (su índice en `ladoOrig`, apuntado al pintarlo), las tablas editables, las imágenes a la vista (1.1.54,
  `.gd-lado-img`: no se editan) y lo demás que no es texto (bases de datos, portada, diálogo doble, `.ed-fijo`) como una marca
  `data-f`. `htmlDeLadoEditado` rehace el documento desde el campo: el bloque que no cambió (`ladoVista`) vuelve tal cual, el que
  cambió conserva sus atributos (clase, alineación, `data-ch`) con lo de ahora dentro, las marcas vuelven a ser lo que eran, el
  texto suelto va en un `<p>`, los `\u200B` de los atajos no pasan y un bloque vacío lleva su `<br>`. Escribe con `MdVivo.vivo`
  (Markdown al escribir; un elemento de guion no se vuelve lista ni título) y `guardarLadoYa` lo guarda a los 400 ms y al salir,
  sin reescribir si no se tocó. **Formato en la ventana** (1.1.54, de ClapBook: «Cuando seleccione un texto y le haga clic
  derecho, debo tener opciones de subrayado… varios colores»): el clic derecho sobre el campo (`menuFormato`, un `C.gestor.pop`
  anclado al ratón, `anclaEn`) da, con algo elegido, negrita, cursiva, subrayado, tachado, código y enlace (`.gd-fmt-barra`,
  encendidos si ya están), **resaltar** y **color de letra** con los 16 tonos de la paleta del editor en el par del tema
  (`colores(i)`: el mismo HTML que su cinta, `<span style="background-color">` / `color`; el resaltado se apunta en
  `guiones.editor.hilite`, el de la cinta) y «Quitar el formato»; lo de un enlace (abrir, editar, quitar, copiar la dirección);
  cortar, copiar y pegar; y el enlace para Claude. Todo va por `MdVivo.formato` tras devolver el foco y lo elegido (`volverA`: el
  menú se lleva el foco). **Cmd+K** o «Enlace…» abre `.gd-enlace-cuadro` (`cuadroEnlace`: texto y dirección; si lo elegido ya es
  una dirección, va a Dirección) y **Cmd+clic** en un enlace lo abre (`abrirDireccion`: la dirección se lee con `new URL`, como la
  lee el navegador —sin tabuladores ni saltos—, y solo pasan `clapcraft:`, con `o.irAEnlace`, y `http(s):` y `mailto:`, al
  navegador). Tras cerrar el menú o el cuadro con Esc, el foco y lo elegido vuelven al campo (`ancla._volver`, `devolverFoco`). Los atajos del editor los pone MdVivo: Cmd+Mayús+X, Cmd+Mayús+H (el último
  resaltado de la cinta, `colorResaltado`), Cmd+Alt+0…6, y Cmd+E, código (de ClapBook). Al pegar, una dirección sobre lo elegido
  es un enlace y lo que parece Markdown entra con su formato (`op.markdown`, como `insertPlainText` del editor). **No se portó** lo
  propio del editor de Markdown de ClapBook (CodeMirror): el subrayado de colores con línea (aquí el marcador es el resaltado y el
  subrayado va en el color del texto), los colores de títulos y del texto como preferencia de la vista, los colores de bloque,
  Typewriter y el panel y el pie de la nota (esquema, enlaces, versiones: están en el editor, ⤢).
  **Buscar, filtrar y ordenar** (1.1.54, de ClapBook; allí Leo: «En las bibliotecas, se necesita unos filtros y ordenamientos
  generales (como los que se tienen en los segmentos expandidos) para que se ordenen y filtren el contenido de los segmentos
  contraídos, los filtros se deben guardar entre sesiones. El filtro general es más fuerte que el filtro por segmento en las
  bibliotecas, pero en los segmentos expandidos es más fuerte el filtro del segmento. Cuando digo filtro, también incluyo el
  ordenamiento», y un buscador en las bibliotecas). ClapCraft no tiene etiquetas: **el filtro es el color de la nota** (los 24
  tonos o «Sin color»; `menuColores`, con cuántas lo llevan). La cabecera de la biblioteca lleva la caja de buscar y el color y el
  orden generales (`colorBib`, `ordenBib`: modificadas, creadas, antiguas, por título, por color o «Cada segmento, el suyo»); el
  rótulo del segmento expandido, los suyos (`colorSeg`, `ordenSeg`, con «Como la biblioteca: …»; sustituyen al «Orden manual»
  fijo). En la biblioteca manda el general y lo que no pone lo pone el de cada segmento; en el expandido, al revés (lo heredado va en
  cursiva y con borde discontinuo, `.heredado`); en un segmento, «Todas las notas» (`color: ''`) y «Orden manual» se guardan para
  mandar sobre el general. Las reglas son `C.busqueda.efectivo(g, sg, enExpandido)` y el filtrado `C.busqueda.filtrar`
  (`js/claquedraw/busqueda.js`, puro, `test/busqueda.test.js`). La tarjeta con su propio filtro lleva una marca (`.gd-etq-filtro`),
  con un color la cuenta dice «n/total», y un cuerpo con un orden que no es el manual no se ordena a mano (`.ordenada`: al
  arrastrar, en su cuerpo la nota se queda en su sitio y en otro va al final). Con orden por creación, la fecha que se enseña es esa
  (`fechaSegun`). Se recuerdan en la vista de esta máquina (`vista.filtros`: `bib:<biblioteca>` y
  `seg:<biblioteca>|<bandeja|etq:id>`), **mezclados clave a clave** con los de las otras ventanas (`ponerFiltroVista` y
  `filtrosTocados` en `guardarVista`: cada una escribe solo los que tocó). **Buscar** (`aplicarBusqueda`: `C.busqueda.puntuar` en el
  título y el texto del documento —`C.conversor.textoPlano`, con caché—, sin acentos ni mayúsculas, con "frases", -excluir y
  titulo:) esconde las tarjetas que no casan sin redibujar, apaga los segmentos sin ninguna (`.sin-coincidencias`) y cuenta
  «n de N» (sin contar las de una sección contraída o escondida, `seccionOculta`; la contraída con alguna lo dice en su título, y
  Enter no abre una de ellas); tras un render de la misma vista se repone con el foco donde estaba (`focoBusqueda`, `reponerBusqueda`) y en otra se
  olvida. Esc la vacía, Enter abre la primera que casa en su ventana y **Cmd+F** con la biblioteca delante va a la caja
  (`C.gestor.buscarEnVista`, keydown de app.js; en Electron el menú no lleva Cmd+F). Una nota nueva con un filtro de color nace de
  ese color, y lo que se buscaba se olvida (si no, no se vería).
  **Correcciones que venían de ClapBook** (1.1.54): la papelera recuerda el segmento de la nota y su sitio (`etiquetaId`, `antesDe`
  y `despuesDe` en su entrada —la que la seguía y la que iba delante; si una se tiró antes y era la de al lado, esa—, que
  `normalizar` conserva): restaurarla en su biblioteca —también con el «Deshacer» del aviso— la devuelve a su segmento y a su sitio
  (antes, siempre a la bandeja y al final). Las vecinas que también están en la papelera se atraviesan (`alcanza`: delante de la
  primera de detrás que esté a la vista, o detrás de la última de delante), así que tiradas y restauradas una a una en cualquier
  orden vuelven en el suyo (la prueba recorre las 748 combinaciones con cuatro notas); «Mover a la izquierda/derecha» de un segmento
  (`moverEtiqueta`) va por su sección y por `ordenSegmentos` (no hacía nada visible en cuanto se había arrastrado una tarjeta, y con
  secciones cruzaba de una a otra); arrastrar un segmento al tablero de otra sección —también vacía— funciona (`moverArrastre` lo
  bloqueaba); `autodesplazar` usa el primer antepasado que se desplace (el cuerpo de una tarjeta con más de cinco notas, el
  lienzo); **la primera biblioteca de un contenedor es la del árbol** (`primeraBiblioteca`, `todasLasBibliotecas`: `c.subs[0]`
  podía ser la oculta de guiones de un esquema, y se abría o se restauraba ahí); `moverNota` marca también la biblioteca de la que
  sale; un clic en el menú lateral ya no suelta la nota elegida; plegar o ensanchar el menú no redibuja el gestor (era el
  parpadeo); el globo enseña el nombre entero de una nota cortada (las tarjetas ya no llevan `title`); `contraer` avisa a la
  pestaña; y `CSS.escape` en los selectores hechos con ids.
  **Segmento expandido** (Leo, 15-09-2026, `docs/diseno/rediseno-5/Pantalla_Segmento.dc.html`): todas las
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
  `Ctrl/Cmd+Shift+F` abre Documentos (desde la 1.1.54 también con el foco en el editor: `onKey` de texto.js lo reenvía, `o.documentos`). Los controles solo del tablero llevan `.solo-esquema`.
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

## Claude: acceso desde Cowork y Claude Code (1.1.49)

Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o no)
puedas acceder al contenido de la aplicación, tanto texto y muy principalmente la gestión de esquemas». Cuatro piezas:

- **`js/claquedraw/herramientas.js`** (`Claquedraw.herramientas`, modelo puro, `test/herramientas.test.js`): las herramientas
  (`LISTA`: nombre, descripción, `inputSchema` y `annotations` de MCP) y `ejecutar(ctx, nombre, args)` → `{ ok, texto, datos? }` o
  `{ ok: false, error }`. No saben dónde está el proyecto: el **contexto** da `docs` (C.Documentos), `cambio()` y, en la app,
  `estado()` (qué hay en pantalla), `mostrar(que)` y `renombrarProyecto(n)`. Herramientas: `ver_proyecto` (el árbol con ids, en el
  orden de `nivelArbol`/`nivelGrupo`), `leer_esquema` (texto: tramas, actos y la línea del tiempo columna a columna con
  descripciones y notas bajo su sitio; o `json`), **`editar_esquema`** (un lote de operaciones sobre una **copia** del T.Modelo, que
  pasa al esquema con `guardarEsquema` solo si todas salen: **entero o nada**; con relaciones reflejadas si es de personaje),
  `leer_documento`/`escribir_documento` (el guion de un esquema, que se crea como `documentoDe` de app.js, o una nota; modos
  reemplazar, anadir, insertar y sustituir por bloques; antes de reemplazar o sustituir, **versión «Antes de Claude»**, una por
  sesión: no se repite si la última lo es y tiene menos de 20 minutos), `leer_biblioteca`, `editar_biblioteca` y `editar_proyecto`
  (lotes sobre los documentos: si uno falla se deshace con `reponerEnSitio`, **en el mismo objeto**, porque el gestor de la app
  guarda la referencia y `g.documentos !== d.datos` lo haría rehacerse), `buscar` y `mostrar_en_clapcraft` (solo en vivo).
  Reglas de la interfaz que se respetan: **columnas desde 1** (la cabecera del tablero dice `c + 1`); todo por id o por nombre si
  es único (`encontrar`, sin mayúsculas ni acentos; si no, la lista de candidatos) y lo creado en el lote por `ref`/`$ref`; un nodo
  necesita título y una nota texto (como en la app, 1.1.39/1.1.42); `crear_salto` crea sus **dos** extremos en una celda libre
  (como arrastrar el «+»: nunca convierte un nodo existente); el título de un salto va en sus dos extremos; `crear_acto` no pisa a
  otro (usa `_ordenarActos` del modelo). `limpiarHtml` deja solo etiquetas y atributos del editor para `formato: "html"`.
- **`js/claquedraw/conversor.js`** (`Claquedraw.conversor`, `test/conversor.test.js`): HTML del editor ↔ texto, sin DOM (un
  analizador pequeño con `ini`/`fin` de cada nodo: un bloque que no se toca vuelve **tal cual** estaba). Modo **guion** al estilo
  Fountain (escena INT./EXT. o `.`, PERSONAJE + (paréntesis) + diálogo sin línea en blanco, `> TRANSICIÓN:`, `#` acto, `##`
  secundario, `[[nota]]`, `^` diálogo doble, `!` fuerza acción, portada con `Título:`…) y modo **prosa** (Markdown, las reglas de
  js/markdown.js en cadenas; un salto de renglón dentro de un párrafo es un `<br>`); en los dos, `{tipo}` fuerza el tipo y
  `{bloque N}` conserva lo que no es texto (imágenes, bases de datos). Personajes: la clave de js/characters.js, **manda el
  elenco** (como `setGlobal`), un nombre en mayúsculas se guarda en «Título» (el CSS lo pone en mayúsculas), la anotación tras el
  doble espacio se lee `(V.O.)`, color libre para los nuevos, y `registroDe` rehace el registro desde el HTML (poda como
  `C.refresh`). La transición recibe «:» o «.» como `alSalir` de formato.js y FADE IN lleva `data-izq`.
- **`claude/servidor.js`**: servidor **MCP por stdio, sin dependencias** (JSON-RPC por líneas; `initialize` con las versiones
  2024-11-05 a 2025-11-25, `tools/list`, `tools/call`, `ping`; cola: una llamada detrás de otra). Carga los modelos de `js/` con
  `require` y añade `listar_proyectos` (abiertos en la app, recientes y los `.clapcraft` del equipo por Spotlight y las carpetas
  de siempre) y `crear_proyecto` (plantillas; en `~/Documents/ClapCraft` o `~/Documents`). Cada llamada va **en vivo** si el
  proyecto está abierto en la app con la conexión encendida (por el puente) o **al archivo** (gunzip, ejecutar, gzip a un
  temporal y `rename`), volviendo a mirar justo antes de escribir si la app lo abrió entretanto. Con la conexión apagada y el
  proyecto abierto, solo lee (avisando). **Se arranca con el Node de la propia app**: `ELECTRON_RUN_AS_NODE=1 ClapCraft
  app.asar/claude/servidor.js` (en ese modo Electron lee el asar con `require`, comprobado con la 1.1.48 instalada), así va a la
  par de la versión instalada; `node claude/servidor.js` desde el repositorio también vale (`CLAPCRAFT_PUENTE` apunta a otro
  `puente.json`, para las pruebas).
- **`electron/claude.js`** (la «extensión» dentro del programa, que se puede apagar): un **socket Unix** `claude.sock` en los datos
  de la app (0600; con más de 100 caracteres de ruta, en `os.tmpdir()`; en Windows una tubería) y **`puente.json`** (pid, socket,
  `activo`, proyectos abiertos con su ruta), escrito también apagado para que el servidor no pise lo abierto. Peticiones `hola`,
  `proyectos` (con los recientes, que pide a una ventana: `_recientes`, y la última ventana enfocada como «delante»), `herramienta`
  (a la ventana del proyecto: `claude:peticion` → `claude:respuesta`) y `abrir` (abre el archivo con `abrirRuta` y espera su
  ventana). Menú **Claude**: «Permitir que Claude acceda» (casilla, en `claude.json`; `alternar`) y «Conectar con Claude…»
  (deja `clapcraft.plugin` en Descargas con `claude/plugin.js` y ofrece copiar el `claude mcp add …` para Claude Code). **Vigila
  el archivo de cada ventana** (`fs.watch` de su carpeta) y avisa `archivo:cambiado`, salvo lo que la propia app acaba de
  escribir (`escrito(ruta)` en `file:write` y `file:save`: desde la 1.1.55 por su huella, no por los 2 s de antes).
- **En la ventana** (app.js, «Claude»): `atenderClaude` vuelca tablero y editor, ejecuta con `ctx.docs = docs()` y, si cambió
  algo, `ponerAlDia`: el esquema montado se recarga del guardado (`modelo.cargar` + `T.tablero.render()`, que lo registra en su
  Deshacer como un paso), el editor relee su nota (`C.texto.recargar`), se persiste y se redibuja; el aviso («Claude cambió el
  esquema «X» (5 cambios)») trae **Deshacer**, que repone los documentos de antes de esa petición en el mismo objeto.
  `mostrarClaude` monta el esquema, elige el nodo (`seleccionarEnTablero`) o abre el documento o la nota.
- **Lo que cambia fuera** (app.js): la **firma** de lo último escrito o leído de cada archivo (`firmaDe`: el contenido con los
  documentos normalizados y las claves ordenadas, FNV-1a + largo) va en `vista.archivos[id].firma` (`anotarEscrito`, en todos los
  sitios que ponían `ultimoEscrito`). Al arrancar, `cambiadoFuera`: si el archivo ya no tiene esa firma, alguien lo cambió con la
  app cerrada y se carga (`cargarDelArchivo`: `C.texto.soltar`, `g.documentos` del archivo y `montar`); si además lo local cambió
  desde la firma, se pregunta. Antes de la 1.1.49 **lo local pisaba el archivo al volver a arrancar** («lo local es lo último»),
  que es lo que habría borrado lo que Claude escribió con la app cerrada. Sin firma (proyectos de antes), como siempre. Con el
  proyecto abierto, `archivo:cambiado` hace lo mismo (lo que ya tenía o lo que escribió la propia ventana no cuenta).
- **El plugin** (`claude/plugin/`, `npm run plugin` → `dist/clapcraft.plugin`, también en `predist`): `.claude-plugin/plugin.json`
  (la versión de la app), `.mcp.json` (`/bin/sh ${CLAUDE_PLUGIN_ROOT}/lanzar.sh`), `lanzar.sh` (busca ClapCraft.app en
  Aplicaciones, `~/Applications` o por Spotlight, `dev.leo.clapcraft`, y la arranca en modo Node con su servidor) y la skill
  `skills/clapcraft` (qué es cada cosa, cómo trabajar, el criterio —Leo decide; sugerencias como notas; las notas de enlace
  «Pero»/«Por lo tanto» y «TH» de sus proyectos— y las referencias de operaciones y del texto). En el repositorio van **sin
  punto** (`claude-plugin/`, `mcp.json`: electron-builder puede dejar fuera lo que empieza por punto) y `claude/plugin.js` se lo
  pone al empaquetar; el zip lo arma `claude/zip.js` (deflate de zlib, CRC32 propio) con el plugin en la raíz.
  `claude plugin validate` lo da por bueno. `claude/**` va en `build.files`.
- **El historial de Claude** (1.1.50, `js/claquedraw/historial.js`, `C.historial`, `test/historial.test.js`). Leo, 25-09-2026:
  «¿Se pueden revertir los cambios hechos con IA? Necesito que exista una especie de historial para ver los cambios que ha hecho
  la IA». `ejecutar` (herramientas.js) saca la foto de los documentos antes de toda herramienta que escribe (salvo
  `revertir_cambio` y `mostrar_en_clapcraft`) y, si algo cambió, `anotar` deja una entrada en **`documentos.historialClaude`**
  (viaja con el proyecto; `normalizar` de documentos.js la conserva con `sanear`, y sin cambios de Claude la clave no existe):
  `{ id, fecha, herramienta, titulo, donde: { tipo: esquema|nota|biblioteca|proyecto, id }, detalle (lo que devolvió), origen
  (Claude Code, Cowork o Claude, del `clientInfo` del saludo MCP; el puente lo pasa como `origen`), modo (vivo|archivo),
  nombreProyecto?, parche, revertido? }`. **El parche** es la diferencia antes → después: por claves en los objetos y, en las
  listas cuyos elementos tienen id (en la papelera, el de lo que guarda), elemento a elemento —`q` lo quitado con su valor y sus
  tres vecinos de delante, `p` la huella de lo puesto, `c` lo cambiado dentro, `o` el orden—; de lo de después solo la huella
  (FNV-1a del contenido con las claves ordenadas). `modificado` y `columnas` no cuentan (se ponen solos). **Revertir** aplica el
  parche al revés sobre lo de ahora: quita lo puesto si su huella sigue igual, deshace lo cambiado, devuelve el orden y repone lo
  quitado detrás de su vecino (en ese orden: al revés, el reordenamiento descolocaba lo repuesto). Lo que se tocó después es un
  **choque** (`describir` lo dice en palabras: «contenedor «X» › esquema «Y» › nodo «Z»»): sin `forzar` no se hace nada; con él,
  en esas partes vuelve lo de antes. Luego los esquemas tocados pasan por `normalizar` de Tramas (lo que se cae, se avisa) y los
  documentos por `normalizarDocumentos`, y todo va **en el mismo objeto** (como `reponerEnSitio`). `reponer` deshace una
  reversión. Tope: 150 entradas; los parches más viejos se quitan pasado 1,5 MB (el proyecto también vive en el localStorage de la
  app) salvo los 3 últimos. `antesDe` da cómo estaba (lo de ahora con ese cambio deshecho a la fuerza) y `vistaCambio`
  (herramientas.js) lo pone en texto frente a lo de ahora. **Aguante**: cambios al azar con las herramientas de verdad y,
  revertidos del último al primero, el proyecto vuelve idéntico (4 semillas en `npm test`; probado con 40 × 60).
  Herramientas `ver_historial` y `revertir_cambio`. **En la app** (app.js): el aviso de cada cambio trae «Deshacer» (revierte esa
  entrada) e «Historial» (`T.tablero.avisar` acepta ahora una lista de acciones: con dos, 5 s); menú **Claude › Historial de
  cambios…** → orden `historialClaude` → `abrirHistorialClaude`: el panel (`.hc-capa`, z 80, en la piel; el aviso sube a z 100
  con el panel abierto) por días, con hora, título, origen, modo, marca de revertido, el detalle (tres líneas y «N más…») **sin los
  ids** (`sinIds`: quita los ids fuera de «», que para Claude sí hacen falta) y sus acciones «Ir» (`mostrarClaude`), «Ver
  cambios» (`C.versiones.abrirComparacion` con «Antes de Claude» y «Ahora»; Esc cierra primero la comparación) y «Revertir»
  (`revertirClaude`: `probar`; con choques, `confirmar` «Revertir de todos modos»; luego `ponerAlDia` y el aviso con «Deshacer»,
  que llama a `reponer`). Al montar un proyecto, `avisarCambiosDeClaude` dice lo que hizo Claude con el proyecto cerrado (una vez:
  lo último visto se apunta en `guiones.claquedraw.claudeVisto` por la ruta del archivo, porque al reabrirlo desde recientes el
  proyecto estrena id). Las notas del esquema ya dicen el título de su nodo, no solo su id («en el nodo p6 «Título»»).
- **Enlaces** (1.1.52, `js/claquedraw/enlaces.js`, `C.enlaces`, `test/enlaces.test.js`). Leo, 25-09-2026: «Pon unos "puntos" o "links" a
  bibliotecas, segmentos, notas, personajes, esquemas, etc. Para facilitar el decirle a Claude a qué puntos me refiero cuando le
  hablo de algo». Cada cosa tiene su enlace `clapcraft://<proyecto>/<ruta>`: `<proyecto>` es el nombre del archivo sin la
  extensión (`proyectoDe`, con las reglas de `C.nombreArchivo`: `slug`; sin archivo, el del proyecto) y la ruta dice qué es con los
  ids de las herramientas —`contenedor|carpeta|grupo|personaje/<id>`, `esquema/<id>`, `esquema/<id>/documento`,
  `esquema/<id>/nodo|salto|trama|acto|nota/<id>`, `esquema/<id>/enlace/<nodo>/<nodo>`, `esquema/<id>/raya/<trama>/<columna>`,
  `esquema/<id>/columna/<n>` o `columnas/<a>-<b>` (desde 1), `biblioteca/<id>[/seccion|segmento/<id | bandeja>]`, `nota/<id>`—; un
  tramo de texto lleva `?b=<desde>-<hasta>` (los bloques de `C.conversor.bloques`, desde 1) y `h=`, la huella del primero (FNV-1a de
  su texto plano), para encontrarlo aunque se haya movido (`tramo(html, ref)`: `movido`, o `perdido` si el texto cambió). `crear`,
  `leer`, `extraer` (los de un texto pegado), `resolver(docs, ref, op)` (lo encontrado y su **etiqueta**, «Nodo «X» · esquema «Y»»;
  o el aviso de que ya no está o está en la papelera) y `markdown` (`[etiqueta](url)`, corchetes escapados).
  **Copiar** (app.js, «enlaces»: `copiarEnlaces(refs, { extracto })`, un renglón por enlace, al portapapeles por `api.copiarTexto`
  —IPC `portapapeles:escribir`— y un aviso «Enlace copiado: … Pégalo en Claude.»): «Copiar enlace para Claude» en los ⋯ del gestor
  (`conEnlace`: esquemas, bibliotecas, contenedores, carpetas, grupos, personajes, secciones, segmentos, notas, nodos de la
  cronología), en la ventana de una nota (`data-gd-lado-enlace`), en los menús del tablero (`T.tablero.extras(fn)`: el tablero
  pide `[{ texto, fn }]` para `{ tipo: punto|salto|nota|enlace|raya|columnas|varios|notas }` y los pone en `<!--extras-->` o delante
  de lo que borra, y en las barras de lo elegido), en el panel flotante (`ctx.copiarEnlace`: la cabecera y cada nota), en el clic
  derecho del editor (`#cdEnlace`, que texto.js mete en `#ctxMenu`: el párrafo del cursor o lo seleccionado) y en el asa de bloques
  (`Ed.blocks.extras`, gancho nuevo de blocks.js), y el botón `[data-enlace-cab]` detrás del título de cada cabecera (lo pone el
  mismo MutationObserver que ‹ ›; copia `refDeLoQueSeVe()`). **Cmd+Shift+C** (menú Claude › Copiar enlace para Claude; en el
  navegador, la página y el marco) copia lo elegido —lo seleccionado en el editor (`C.texto.tramo()`: el mapa de bloques del DOM
  como los cuenta el conversor, `mapaBloques`), los nodos, notas o columnas elegidos (`T.tablero.elegidos()`) o lo elegido, la nota
  marcada en la biblioteca (`C.gestor.notaMarcada()`)— o, sin nada, lo que se ve.
  **Abrir** (`irAEnlace(texto)` → `mostrarEnlace(x)`): el de este proyecto va a su sitio —`T.tablero.ir(que)` elige y centra en el
  tablero (nodo, salto, trama, acto, nota, enlace, raya o columnas; lo de una trama oculta, lo dice), `C.texto.irATramo(clave, a, b)`
  selecciona los bloques de un tramo cuando el editor tiene el documento, `C.gestor.expandir` un segmento, `verSeccion` una sección,
  `revelar(tipo, id)` despliega y marca un contenedor, una carpeta o un grupo en el árbol—; el de otro, a Electron (`api.irEnlace` →
  `claude.irAEnlace` en electron/claude.js: la ventana de ese proyecto, o su archivo por los recientes o `claude/archivos.js`, que
  se abre; ahí, `enlace:ir`, sin rebotar: `deFuera`). Llegan por **Claude › Ir al enlace copiado** (el portapapeles, o un diálogo
  para pegarlo), por `open-url` (el protocolo `clapcraft://` va en `build.protocols`; `setAsDefaultProtocolClient` solo empaquetada)
  y por `mostrar_en_clapcraft { enlace }`.
  **Claude**: `ver_enlace` (uno o varios, tal como los pega Leo; en el servidor, los de varios proyectos por separado) dice qué es
  cada uno, dónde está y lo que tiene, con los ids para cambiarlo (un tramo, sus bloques numerados con uno de contexto). Un enlace
  vale en lugar del id en cualquier herramienta (`encontrar`, `enlaceDelEsquema`: el de otro esquema no vale, que los ids de nodos
  solo son únicos dentro del suyo) y, sin `proyecto`, el servidor lo toma del primer enlace de la petición (`porEnlace`: abiertos,
  recientes y los del equipo por el nombre de su archivo); sin `esquema` o `biblioteca`, también (`completar`). `ver_proyecto` y
  `leer_esquema` dicen su enlace. La skill lo explica en `references/enlaces.md`.
  **Cuando el archivo cambia de nombre** (1.1.53, Leo: «que se haga una comprobación y corrección de los enlaces si es que cambié el
  nombre»). El proyecto guarda dentro con qué nombre se hacen sus enlaces y los que tuvo antes, `documentos.enlace = { proyecto,
  antes? }` (`normalizar` lo conserva). Se **sella** al escribirse su archivo o al copiar un enlace (`sellarEnlaces`: solo si ya se
  escribe algo, así abrir un proyecto no lo reescribe; el servidor MCP sella lo que escribe y lo que crea). `C.enlaces.renombrar(datos,
  ahora, op)` lo pone al día: el nombre nuevo a `proyecto`, los viejos a `antes` y, salvo `corregir: false`, **corrige los enlaces
  de dentro** (`corregir`: notas y documentos, títulos y descripciones de nodos, notas de los esquemas; solo los de ese proyecto,
  sin tocar los de otros ni los que solo se le parecen). En la app, `comprobarEnlaces(id, op)`: **renombrado con el proyecto
  abierto** —electron/claude.js vigila el archivo con su **inodo**; si desaparece de su ruta, `buscarPorInodo` lo busca en su carpeta
  y en las de siempre, la ventana sigue con él (`archivo:renombrado` → `seguirArchivo`: su ruta, la vista, los recientes, lo visto
  de Claude) y ya no se vuelve a crear el archivo con el nombre viejo—; **con ClapCraft cerrado** —la ventana guardada lo encuentra
  por el inodo que apunta la vista (`vista.archivos[id].ino`, `archivo:buscar`)—; **con el proyecto cerrado** —al abrirlo, su sello
  dice otro nombre y ningún otro archivo se llama así (`proyecto:hay`)—. Si el nombre de antes aún es de otro archivo, **es una
  copia** (o un «Guardar como…»): toma su nombre al escribirse, con los del original de reserva, y sus enlaces siguen apuntando al
  original. Un proyecto aún sin sello que se renombra se sella con el nombre del archivo que se renombró (`sellarConNombreDe`), y un
  reciente cuyo archivo ya no está se busca por el inodo que guarda su entrada. Encontrar un proyecto por un enlace (`rangoNombre`): 0, el nombre de su archivo; 1, su sello; 2, uno de antes (3, en el
  servidor, el nombre del proyecto); la ventana anuncia los suyos (`enlaces` en `ventana:proyecto` y en `puente.json`) y el servidor
  lee los sellos de los archivos (`claude/archivos.js`, `sellosDe`, `buscarPorEnlace`). `ver_enlace` y `ver_proyecto` dicen si un
  enlace lleva un nombre de antes. Los enlaces `clapcraft://` **viven también dentro de los documentos**: el conversor ya no se los
  quita a Claude (`[t](clapcraft://…)` queda como enlace) y en el editor **Cmd+clic** en uno lleva a su sitio (su `window.open` va a
  `setWindowOpenHandler`, que lo manda a `abrirEnlace`).
  **Y se arregló el clic derecho del tablero**: con el ratón de verdad, el botón derecho sobre un nodo empezaba su arrastre, el
  nodo se quedaba sin puntero (`pointer-events: none`) y el `contextmenu` —que en macOS llega tras el `mousedown`— caía en la raya,
  así que no salía su menú; ahora solo el botón principal arrastra un nodo o una nota (`onPointerDown`), el panel flotante no se
  abre con el menú del clic derecho abierto (`alElegir`) y `#menu` va por encima de él (z 80). Estaba desde antes de la 1.1.51.
- **Pruebas**: `test/conversor.test.js`, `test/herramientas.test.js` y `test/mcp.test.js` (el servidor por stdio: archivo, un
  puente de mentira que hace de la app y la conexión apagada) en `npm test`; `npm run test:claude` (`pruebas/claude-electron.js`,
  51 comprobaciones (también el historial: el aviso con sus dos botones, el panel desde el menú, «Ver cambios», revertir con choque y confirmación, «Deshacer» de lo revertido, el historial en el archivo y el aviso al reabrir); con la app de verdad y el servidor arrancado con el Node de Electron: en vivo, avisos, Deshacer del aviso y del
  tablero, el editor abierto, «Antes de Claude», mostrar, apagar y encender, el proyecto cerrado, el archivo cambiado fuera con la
  ventana abierta y con la ventana cerrada), y `test/enlaces.test.js` en `npm test` y `npm run test:enlaces`
  (`pruebas/enlaces-electron.js`, 69 comprobaciones, con el portapapeles sustituido: el de verdad es el de Leo): copiar desde cada
  sitio, el clic derecho con el ratón de verdad (`sendInputEvent`), un tramo del editor, `ver_enlace` en vivo con lo copiado, ir a un
  nodo, una nota, un tramo, un segmento, una trama, una raya, un enlace, un contenedor y a uno que ya no está, el de otro proyecto
  cerrado, que se abre en su ventana, un enlace dentro de una nota (Cmd+clic) y los renombrados: con el proyecto abierto
  (`fs.renameSync` con la ventana viva), con ClapCraft cerrado (la página a `about:blank`, se renombra y vuelve con `?p=`), con el
  proyecto cerrado (se abre el renombrado, también desde «Recientes», que guardan el inodo), una copia y un proyecto sin sello. Ojo al probar: el `click()` de un MenuItem casilla ya la alterna (no ponerle
  `checked` antes), y el escritor de archivos de esta sesión convierte las secuencias `\uXXXX` en caracteres literales: pasar
  el normalizador de invisibles tras escribir un JS.
