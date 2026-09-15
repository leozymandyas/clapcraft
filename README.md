# ClapCraft

Programa para escribir guiones: estructuras la historia en un **esquema de pasos** (actos, tramas y
nodos), escribes el texto de cada paso en un **editor de guion** y organizas el material de apoyo en
**bibliotecas** y **personajes**. Funciona como app de escritorio (macOS, Windows, Linux) y en el
navegador. Está hecho en JavaScript puro, sin frameworks ni paso de compilación.

**Versión 1.0.34**

## Instalar

Genera el instalador con `npm run dist` (ver [Desarrollo](#desarrollo)); queda en `dist/`.
En macOS es un `.dmg` sin firmar: arrastra ClapCraft a Aplicaciones y, si Gatekeeper protesta la primera
vez, clic derecho → Abrir. Los archivos `.clapcraft` quedan asociados: un doble clic en el Finder los abre.

## Cómo se usa

### El menú lateral

- Arriba, la marca y **«＋ Nuevo contenedor»**; debajo, el árbol de **contenedores**. Al pie,
  **Contenedores · Personajes · Papelera** cambian lo que enseña el menú.
- Se **pliega** a un riel estrecho con el botón junto a la marca o `Cmd/Ctrl+Shift+B`, y cambia de ancho
  arrastrando su borde (si lo estrechas mucho, se pliega).
- Un **contenedor** (por ejemplo, un capítulo) guarda **esquemas de pasos** y **bibliotecas**. Uno nuevo
  trae un esquema enlazado a su biblioteca. Su `⋯` ofrece Nuevo esquema…, Nueva biblioteca…, Renombrar,
  Fijar y Eliminar.
- **Enlace esquema ↔ biblioteca**: un esquema y su biblioteca van unidos por una guía; se renombran por
  separado, pero se mueven juntos. Clic derecho sobre la guía quita el enlace; sobre un esquema o una
  biblioteca sueltos, permite enlazarlos con otro del mismo contenedor.
- **Carpetas**: dentro de un contenedor se crean carpetas con «Nueva carpeta…» en su `⋯` (nombre y color) y se anidan
  sin límite; esquemas y bibliotecas van en cualquier nivel (arrastrándolos a la carpeta o con «Mover a carpeta…»).
  Pulsar una carpeta la despliega o la pliega; si la jerarquía no cabe, el menú se desplaza en horizontal. En
  Personajes, las carpetas agrupan el elenco («＋ carpeta», bajo «＋ personaje»).
- En cada nivel las piezas se mezclan como quieras: una biblioteca puede ir encima de un esquema con su biblioteca
  (que siempre van juntos) o de una carpeta. En Personajes, los personajes y sus carpetas también se ordenan arrastrando.
- Todo el árbol se **ordena arrastrando**: contenedores, esquemas y bibliotecas, también de un contenedor
  a otro. Doble clic renombra.

### Esquema de pasos

El tablero donde se estructura la historia.

- **Actos**: columnas con su color de fondo (automático o elegido). Clic en el encabezado abre su panel
  (nombre, ancho, fondo); el «+» del final añade uno.
- **Tramas**: carriles. Una **principal**, las **secundarias** que hagan falta y las **alternativas**
  (exploraciones, punteadas).
- **Nodos**: pasa el cursor por una celda y pulsa el «+». Clic selecciona e ilumina el camino que siguió la
  historia hasta ahí; arrastrar cambia de celda o de trama, y **soltarlo sobre otro nodo los intercambia** (también en
  Personajes). En el panel se escriben título y descripción.
  **Doble clic abre su documento** en el editor.
- **Saltos**: el cambio de escena (cuadro) y el salto a una alternativa (rombo) unen dos tramas en la misma
  celda. Lo que queda fuera del hilo de la historia se ve apagado.
- **Notas** en post-it entre dos nodos; se arrastran de tramo en tramo y, sobre otra nota, se cambian de lugar con ella;
  con clic derecho se les da uno de los 24 colores de la paleta. Al pasar el
  ratón por una nota corrida a un lado se marca la guía que la une a su trama.
- Abajo: **escala horizontal y vertical**, restablecer, deshacer y rehacer (`Cmd/Ctrl+Z`,
  `Cmd/Ctrl+Shift+Z`). **«Ver biblioteca»** abre la biblioteca enlazada.

### Biblioteca

- Si la biblioteca está enlazada a un esquema, **«Ver esquema»** en su cabecera lo abre.
- **Guiones generados** (si está enlazada a un esquema): los documentos que salen de «Revisar guión» caen en su
  bandeja; se pueden crear segmentos de guiones (cabecera negra) y documentos a mano, y se mueven entre ellos, pero no
  a la sección de segmentos (ni las notas a esta).
- **Segmentos**: la **bandeja** y un segmento por color con sus notas. «＋ nota» crea una arriba; cada nota puede
  llevar uno de los 24 colores (⋯ › «Color…»); las notas se arrastran para ordenarlas o moverlas de segmento, y los segmentos se ordenan arrastrando su cabecera.
  Guiones generados y segmentos se intercambian arrastrando su título.
- **Segmento expandido**: el icono de expandir de cualquier segmento (bandeja, segmentos, actos, momentos y
  Apariciones) lo abre a todo el lienzo, con sus notas en rejilla, sus primeras líneas y su fecha; se ordenan
  arrastrando y «Contraer» (o Esc) vuelve.
- Doble clic en un documento de la cronología o de un momento lleva a su sección en el documento del esquema.
- Doble clic en una nota la abre en el editor, con las migas encima (contenedor › biblioteca › segmento). La
  etiqueta del segmento abre ese segmento expandido, con la nota marcada.
- **Papelera**: guarda lo que tiras con su origen; se restaura arrastrándolo a una biblioteca y se vacía
  sola a los 30 días.

### Texto: el editor

- **Guión**: cada sección se puede **sacar del guión** (se queda en su sitio, gris y tachada; nada se borra) y
  plegar. Se hace desde su cabecera, desde la casilla de su rótulo en la línea de tiempo o, para varias a la vez,
  desde la barra de guión («Sacar», «Devolver», «Sacar todo», «Devolver todo»). «Armar guión», en la cabecera, abre y
  contrae la barra; contraída, las secciones tampoco enseñan sus casillas ni «Sacar / Devolver».
- **Revisar guión**: la lista de secciones en el orden de lectura del documento final (se reordena arrastrando sin
  tocar el esquema), cuántas palabras y páginas salen, qué no se copia y **Generar documento**: un guion sin
  secciones ni línea de tiempo que se guarda en la biblioteca del esquema, en la bandeja de «Guiones generados», y se
  abre en el editor normal.
- **Exportar** (barra inferior): PDF, Word (.docx) y texto sin formato. En un guion generado exporta el documento; en
  el editor con secciones, lo que está dentro del guion.

- **Un documento por esquema**: cada nodo es una sección del documento, en el orden del tiempo, con su
  cabecera (punto del nodo, nombre, trama y tipo); la sección en la que escribes va resaltada. Las secciones
  no se borran desde el editor (se borran eliminando el nodo en el esquema); doble clic en su cabecera
  cambia el nombre (Enter guarda, Esc o un clic fuera cancelan) y, si el nombre no cabe, al pasar el ratón
  sale entero.
- **Cabecera**: el nodo de la sección en la que escribes (doble clic en su título para renombrarlo),
  «Ver biblioteca», «Ver esquema» y ‹ › para ir a la sección anterior o siguiente (`Cmd/Ctrl+Alt+↑/↓`).
- **Línea de tiempo**: la trama de la sección en la que escribes; sus nodos son anclas: al pulsar uno, la
  hoja va a su sección. Los saltos llevan una flecha que indica si suben o bajan a otra trama y, al
  pulsarlos, la línea pasa a esa trama.
- **Elementos de guion**: encabezado de escena, acción, personaje, paréntico, diálogo, transición y toma,
  con su sangría y mayúsculas. **Enter** pasa al elemento que suele seguir (escena → acción, personaje →
  diálogo, diálogo → personaje…); en uno vacío lo convierte en acción. **Tab** cambia el elemento de la
  línea (Mayús+Tab, al anterior).
- **Menú «/»**: escribe `/` al principio de una línea para elegir elemento (con Modo guion activo) o
  bloques de texto: títulos, listas, cita, código, tabla, base de datos, línea y enlace.
- **Personajes**: cada nombre lleva su color, como un marcatextos; al escribir un personaje aparecen
  sugerencias (`Tab` completa, `Enter` completa y pasa al diálogo). Clic derecho sobre el nombre cambia su
  color en todo el guion.
- **Páginas**: la hoja se ve partida en páginas numeradas y la barra inferior dice cuántas lleva y cuánto
  duraría (una página ≈ un minuto). Se cuenta como una página de guion impresa (Carta, Courier 12 pt, unas
  54 líneas de 60 caracteres), sea cual sea el ancho de la hoja en pantalla.
- **Barra inferior**: tamaño del texto, ancho de la hoja, páginas, **Modo guion**, **Typewriter** (la línea
  del cursor se queda centrada), **Ortografía** (español e inglés, sin conexión; no marca nombres de
  personajes) y plegar el menú.
- **Bloques**: el asa «+ ⋮⋮» junto a la línea en la que escribes inserta, arrastra, convierte, duplica o
  elimina bloques; también se seleccionan varios a la vez.
- **Buscar y reemplazar** con `Cmd/Ctrl+F` («Todo» se deshace de una vez).
- **Pegar**: lo que viene de una web o de otro programa llega sin su fuente, tamaño ni colores neutros; las
  imágenes se reducen (1600 px, WebP) para que el archivo no pese.
- Tablas, bases de datos estilo Notion, colores de letra y resaltado, y [atajos Markdown](#atajos-markdown).

### Personajes

Se entra desde el pie del menú lateral.

- **El elenco** son los personajes que escribes en el editor con «/» y los que creas aquí con
  **«Nuevo personaje»** (nombre y color). Los creados aquí también se sugieren en el editor.
- Desde su `⋯`: abrir, renombrar, cambiar de color o eliminar. **Renombrar o cambiar el color lo aplica en
  todas las notas** que lo nombran. No se puede eliminar un personaje mientras alguna nota lo nombre.
- **Cada personaje tiene su tablero**: el primer carril es él (fijo) y «＋ personaje» añade un carril con otro
  personaje existente, que se cambia con su selector. El círculo delante de cada carril cambia el color de su trama. Los actos se llaman **momentos**, los nodos
  **eventos** y los cuadros **relaciones**; los dos cuadros de una relación comparten un mismo documento.
  El editor de estos documentos no lleva línea de tiempo.
- Encima, el **carrusel**: **Apariciones** (las notas donde se le nombra, con su ruta; doble clic abre),
  la **bandeja** y sus **segmentos**. Segmentos y notas se ordenan y se mueven arrastrando; al acercar lo
  arrastrado a un borde, el carrusel se desplaza solo.

### Proyectos, archivos y pestañas

- Cada **proyecto** abierto es una **pestaña**; `Ctrl+Tab` pasa de una a otra.
- **Nuevo proyecto** (`Cmd/Ctrl+N`, el «+» de las pestañas): se abre en una pestaña propia, que se puede dejar a medias
  e ir a otra. A la izquierda, el nombre y **dónde se guarda** (en la app, de partida `~/Documents/ClapCraft`; «Cambiar»
  elige otra carpeta; en Chrome o Edge, una carpeta elegida o solo el navegador). A la derecha, seis **plantillas** (En
  blanco, Largometraje, Serie de TV, Novela, Cortometraje y Teatro) con el árbol y las tramas exactas que crean. Enter crea
  y Esc cancela. Con carpeta, el proyecto nace con su `.clapcraft` (sin pisar uno que ya exista: «Nombre 2»).
- **Sin proyectos abiertos**: «Nuevo proyecto», «Abrir un proyecto» y los **recientes** (los proyectos con archivo que se
  han abierto, con su estructura y cuándo). Un `.clapcraft` soltado en la ventana también se abre.
- El trabajo se guarda siempre en el navegador o en la app. **«Guardar como…»** (`Cmd/Ctrl+Shift+S`) lo
  vincula a un archivo **`.clapcraft`** y desde entonces cada cambio se escribe ahí solo; **«Abrir…»**
  (`Cmd/Ctrl+O`) toma uno existente; **«Guardar»** (`Cmd/Ctrl+S`) escribe en el acto. El indicador de la
  cabecera dice si hay cambios sin escribir.
- Un `.clapcraft` es JSON comprimido con gzip: un guion largo ocupa del orden de 100-150 KB.
- En el navegador, Chrome y Edge escriben en el archivo (pueden pedir permiso al volver); en los demás solo
  se descarga una copia.
- En la app, las órdenes están en el menú: **Archivo** (Nuevo proyecto…, Abrir proyecto…, Guardar, Guardar como…,
  Cerrar proyecto), **Edición** y **Ver** (modo oscuro).

## Atajos de teclado

| Atajo (Cmd en Mac, Ctrl en Windows/Linux) | Qué hace |
|---|---|
| `Cmd+N` | Nuevo proyecto |
| `Cmd+S` / `Cmd+Shift+S` / `Cmd+O` | Guardar / Guardar como… / Abrir… |
| `Cmd+Shift+G` | Esquema ↔ Texto |
| `Cmd+Shift+F` | Biblioteca |
| `Cmd+Shift+B` | Plegar o desplegar el menú |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Pestaña siguiente / anterior |
| `Cmd+Alt+↑` / `Cmd+Alt+↓` | Nota anterior / siguiente de la trama |
| `Cmd+Z` / `Cmd+Shift+Z` | Deshacer / Rehacer |
| `Cmd+F` | Buscar y reemplazar |
| `Cmd+B` / `I` / `U` | Negrita / cursiva / subrayado |
| `Cmd+Shift+X` / `Cmd+Shift+H` | Tachado / resaltar |
| `Cmd+K` | Enlace |
| `Cmd+Alt+0..4` | Texto normal / títulos |
| `Cmd+Shift+↑` / `Cmd+Shift+↓` · `Cmd+D` | Mover bloque · duplicar bloque |
| `Cmd` + `+` / `-` / `0` o `Cmd+rueda` | Tamaño del texto |
| `Tab` / `Shift+Tab` | Elemento de guion siguiente / anterior (en tablas, celda; en listas, sangría) |

## Atajos Markdown

Se convierten al escribir.

| Escribe | Resultado |
|---|---|
| `# ` … `#### ` | Título 1 a 4 |
| `- `, `* `, `+ ` | Lista con viñetas |
| `1. ` | Lista numerada |
| `> ` | Cita |
| `---` + Enter | Línea horizontal |
| ```` ``` ```` + Enter | Bloque de código (doble Enter para salir) |
| `**texto**` / `__texto__` | **Negrita** |
| `*texto*` / `_texto_` | *Cursiva* |
| `~~texto~~` | ~~Tachado~~ |
| `==texto==` | Resaltado |
| `` `código` `` | `código` |
| `[texto](url)` | Enlace |

## Desarrollo

```bash
node serve.js 5173     # y abrir http://localhost:5173/claquedraw.html
npm test               # pruebas de los modelos (node:test), también el archivo .clapcraft (JSON + gzip)
npm run test:archivos  # guardar, autoguardar, abrir y volver a arrancar con la app de verdad (Electron y disco)
```

App de escritorio con Electron:

```bash
npm install
node node_modules/electron/install.js   # con npm 11 los scripts de instalación vienen bloqueados
npm start                               # abre ClapCraft
npm run dist                            # instalador (dmg / nsis / AppImage) en dist/
```

El nombre interno del proyecto es **Claquedraw**: así se llaman `claquedraw.html`, `js/claquedraw/` y el
espacio global `window.Claquedraw`. Las decisiones de diseño y las reglas que cuesta descubrir están en
[`CLAUDE.md`](CLAUDE.md).

### Estructura

| Archivo | Qué hace |
|---|---|
| `claquedraw.html` | La app: pestañas, menú lateral, vistas Esquema, Biblioteca, Texto y Personajes |
| `js/claquedraw/app.js` | Arranque, pestañas, archivos `.clapcraft`, vistas, Personajes, ganchos con el tablero |
| `js/claquedraw/documentos.js` | Modelo puro de un guion: contenedores, esquemas, bibliotecas, segmentos, notas, papelera y elenco |
| `js/claquedraw/gestor.js` | Menú lateral, Biblioteca, carrusel de Personajes, menús y arrastres |
| `js/claquedraw/texto.js` | Vista Texto: el editor en un marco, cabecera y línea de tiempo |
| `js/claquedraw/biblioteca.js` | Modelo de las pestañas (proyectos abiertos) |
| `js/claquedraw/plantillas.js`, `js/claquedraw/proyectos.js` | Plantillas de proyecto; pantallas «Nuevo proyecto» y «Sin proyectos» |
| `js/tramas/modelo.js`, `js/tramas/tablero.js` | Esquema de pasos: modelo puro y tablero |
| `index.html`, `js/*.js` | El editor: formato, guion, personajes, páginas, bloques, tablas, bases de datos, corrector |
| `css/clapcraft.css`, `css/clapcraft-editor.css` | La piel de ClapCraft sobre las hojas base (`claquedraw.css`, `tramas.css`, `editor.css`): grises neutros, acento violeta (#6141C9 / #B3A6F7) y los 24 tonos de tramas, nodos y notas |
| `electron/` | Proceso principal (menú, diálogos, lectura y escritura de archivos) y preload |
| `test/` | Pruebas de `documentos.js`, `modelo.js` y `biblioteca.js` |
| `docs/` | Especificación del tablero de tramas y diseños de la interfaz |

El editor (`index.html`) y el tablero (`tramas.html`) también funcionan solos. Cada uno expone una API de
documento con la misma forma (`get()`, `set(doc)`, `isDirty()`, `onChange(fn)`): `Ed.document` y
`Tramas.document`.

## Licencia

[MIT](LICENSE) © 2026 Leonardo Ruano. Las fuentes (Courier Prime, IBM Plex, Patrick Hand) tienen licencia
OFL, y Typo.js y los diccionarios de español e inglés, las suyas (ver `js/dict/`).
