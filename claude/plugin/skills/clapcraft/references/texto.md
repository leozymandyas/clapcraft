# El texto de los documentos

`leer_documento` y `escribir_documento` usan el mismo texto. Hay dos maneras de leerlo, y se elige sola: el documento de un esquema (o cualquiera con elementos de guion) va **como guion**; una nota de biblioteca, **como prosa** (Markdown). Se puede forzar con `como: "guion" | "prosa"`.

## Como guion (al estilo Fountain)

```
Título: Amor tiktoker
Episodio: Piloto
Escrito por: Leo

# ACTO UNO

INT. COPAL - ÁREA DE CELULARES - DÍA

Cámara graba al Bagre en el mostrador.

## BAGRE TALKING HEAD - INT. - DÍA

BAGRE (T.H.)
(sonrojado)
Grabando videos para Maudicio...

> CORTE A:

[[revisar el ritmo]]

ANNIE
¿Otra vez tú?

BAGRE ^
¿Otra vez tú?
```

- **Portada**: al principio, líneas `Título:`, `Episodio:`, `Escrito por:`, `Basado en:`, `Versión:`, `Fecha:`, `Contacto:`.
- **Escena**: empieza por INT., EXT., INT./EXT., I/E o EST.; cualquier otra cosa se fuerza con un punto delante (`.FLASHBACK - FARO - DÍA`).
- **Acto**: `# NOMBRE`. **Encabezado secundario** (talking heads, insertos): `## TEXTO`.
- **Personaje**: una línea en MAYÚSCULAS con su diálogo debajo **sin línea en blanco**; la extensión entre paréntesis (`BAGRE (V.O.)`). Un nombre que no va en mayúsculas se fuerza con `@`. Los personajes nuevos entran solos en el elenco con un color libre; los conocidos conservan el suyo.
- **Paréntesis**: una línea `(así)` dentro del diálogo.
- **Diálogo doble**: `^` al final del segundo personaje; los dos grupos van seguidos, separados por una línea en blanco.
- **Transición**: `> CORTE A:` (con `>` siempre vale; FADE OUT. y los que acaban en «TO:» se reconocen solos).
- **Nota**: `[[texto]]`.
- **Acción**: todo lo demás. Una acción que se leería como otra cosa se fuerza con `!`.
- **Toma** y **montaje**: `{toma} PRIMER PLANO DE LA LÁMPARA`, `{montaje} MONTAJE - BAGRE ENTRENA`.
- En línea: `**negrita**`, `*cursiva*`, `<u>subrayado</u>`, `~~tachado~~`, `==resaltado==`.

## Como prosa (Markdown)

Títulos `#`, listas `-` y `1.`, citas `>`, tablas, `---`, código y lo de en línea. Un salto de línea dentro de un párrafo se queda como salto.

## Recuadros: prompt y avisos (en los dos modos)

Un bloque cercado con tres acentos graves, como en ClapBook; dentro, Markdown (párrafos, listas, formato):

````
```prompt Seedance · Toma 3 {.violeta}
Visual Style: …
```

```aviso:question ¿Llueve aquí?
El guion no lo dice.
```
````

- `prompt`: un bloque de prompt (ClapCraft le pone «Copiar», que copia solo su texto, y realza los `[huecos]` entre corchetes).
- `aviso:tipo`: un aviso con icono y color por tipo — `note` (sin tipo, también), `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`, `abstract`, `todo`; valen en español (nota, consejo, pregunta, advertencia, pendiente…).
- Tras el tipo, un título opcional, y al final `{.color}` opcional (azul, verde, terracota, violeta, ámbar, rosa, teal, oliva, índigo, coral, ciruela, arena, cielo, lima, óxido, grafito).

## Etiquetas (en los dos modos)

Un párrafo que empieza por `{tipo}` es de ese tipo: `{escena}`, `{subescena}`, `{accion}`, `{personaje}`, `{parentesis}`, `{dialogo}`, `{transicion}`, `{toma}`, `{acto}`, `{nota}`, `{montaje}`, `{parrafo}`, `{titulo1}`…`{titulo6}`, `{cita}`.

## Bloques

Cada párrafo, título, lista o elemento de guion es un **bloque**. `leer_documento { numerar: true }` pone `[N]` delante de cada uno (los vacíos no salen, pero cuentan). Para cambiar solo un trozo:

```json
{"esquema": "Piloto", "modo": "sustituir", "desde": 12, "hasta": 18, "contenido": "INT. OFICINA - NOCHE\n\n..."}
```

- `modo`: `reemplazar` (todo; por defecto), `anadir` (al final), `insertar` (con `antes_de: N`), `sustituir` (`desde`–`hasta`).
- Lo que no es texto (una imagen, una base de datos) sale como `{bloque N: imagen}`; escrito tal cual en el contenido, se conserva.
- Antes de reemplazar o sustituir, lo que había se guarda como versión «Antes de Claude» (una por sesión de trabajo); Leo la recupera desde el botón de versiones del editor.
- `formato: "bloques"` lee y escribe una lista JSON `[{tipo, texto}]`, por si hace falta precisión.
