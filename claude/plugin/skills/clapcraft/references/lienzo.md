# Lienzos de nodos

Un **lienzo** es una pieza del árbol de un proyecto (como un esquema o una biblioteca: vive en un contenedor, sale en `ver_proyecto` como `LIENZO … · 6 nodos (2 operaciones) · 1 pendiente`). Es como los «Space» de Dreamina, pero en lugar de vídeo sale un guion, sus fragmentos o una nota: **nodos** conectados con **cables**, de la salida de uno al puerto de entrada de otro.

**Las operaciones las ejecutas tú** (o, si Leo pulsa «Ejecutar con IA» en la app, su asistente con otra IA, con estas mismas herramientas y estos mismos pasos). Leo pulsa ▶ en un nodo (o «▶ Pedir todo»): queda **pendiente** y se copia su enlace; te lo pega o te dice «ejecuta el lienzo».

## Los nodos

**Entradas** (no tienen puertos de entrada; dan lo que apuntan):

| tipo | qué da |
| --- | --- |
| `texto` | un texto libre de Leo: una idea, un tono, una instrucción (Markdown) |
| `imagen` | una imagen suelta (te llega como imagen) |
| `nota` | una nota de una biblioteca: su texto **y sus imágenes** |
| `segmento` | todas las notas de un segmento (o de la bandeja) |
| `biblioteca` | una biblioteca entera (resumida si es muy larga) |
| `esquema` | un esquema: su estructura (tramas, actos, nodos, notas) **y** su guion |
| `personaje` | un personaje: su hoja (el segmento «Hoja de personaje» de su biblioteca, con imágenes), dónde aparece y sus esquemas |

Si lo que apunta una entrada ya no está (borrado o en la papelera), está **rota**: `leer_lienzo` y `ejecutar_nodo` lo dicen. No lo sustituyas por algo inventado: díselo a Leo.

**Operaciones** (las haces tú; su salida es algo real de ClapCraft):

| tipo | puertos | salida |
| --- | --- | --- |
| `generar` — Generar guion | `contexto` (varios), `esquema` (uno: la estructura a seguir) | el **documento** (guion) de un esquema |
| `partir` — Partir en fragmentos | `guion` (uno: un esquema o la salida de un `generar`), `contexto` | **fragmentos**: una nota por fragmento en una biblioteca (skill **clapcraft-seedance**) |
| `escaleta` — Sacar escaleta | `fuente` (una), `contexto` | un **esquema** con los beats como nodos |
| `resumir`, `reescribir` (tono), `traducir` (idioma) | `fuente` (una), `contexto` | una **nota** en una biblioteca o, «en su sitio», una versión nueva del guion de la fuente |
| `prompt` — Instrucción libre | `contexto` (varios) | una nota o un documento |

Cada operación lleva **instrucción** (lo que pide Leo, en «Qué escribir»), **fórmulas** (abajo), opciones (modo guion/prosa, segundos, tono, idioma) y **destino**: un esquema, una biblioteca (y segmento), uno **nuevo** (`nuevo: { contenedor, nombre }`: lo creas tú al ejecutar) o «en su sitio». Sin destino, pregúntale a Leo.

La salida de una operación puede entrar en otra: **generar → partir** es lo normal (primero el guion, luego sus fragmentos).

## Fórmulas

Las **fórmulas** son prompts reutilizables de Leo, como skills: notas de **solo texto** en la biblioteca especial «Fórmulas» (id `formulas:biblioteca`, fuera del árbol; `ver_proyecto` las lista con su id y su segmento) que dicen el tono, el formato, el estilo o las reglas de un trabajo. En cada operación Leo puede elegir **varias, en orden**, además de escribir (o no) en «Qué escribir»: con alguna fórmula, la operación vale aunque no escriba nada.

- **Cómo se combinan**: van en su orden, cada una con su título; lo escrito en «Qué escribir» va **donde una diga `{{instruccion}}`** y, si ninguna lo dice, **detrás, como «Instrucción de Leo»**. `ejecutar_nodo` ya te lo da compuesto en **INSTRUCCIONES (fórmulas + lo escrito por Leo)**: síguelo entero, como si Leo te lo hubiera escrito ahí.
- **Rotas**: una fórmula elegida que ya no existe (tirada, o sacada de «Fórmulas») sale en `leer_lienzo` como ROTA y `ejecutar_nodo` avisa con **OJO**: se ejecuta sin ella; díselo a Leo, no la inventes.
- **Cambiar la de una operación**: `editar_lienzo › crear_nodo` / `editar_nodo { formulas: [ids, títulos o enlaces] }` (sustituye la lista; `[]` las quita).
- **Crear o cambiar una fórmula**: `editar_biblioteca { biblioteca: "Fórmulas", operaciones: [{ op: "crear_nota", titulo, contenido, segmento }] }` (solo texto: el Markdown se aplana) y `escribir_documento { nota }` para su texto. Cambiar el texto de una fórmula deja **desactualizadas** las operaciones hechas que la usan.
- **Fuera del lienzo**: si Leo nombra una fórmula («con mi fórmula noir») o lo que pide encaja con una, `usar_formula { formula }` te da su texto: síguela en ese trabajo. Una fórmula dice *cómo* hacerlo, no encarga nada por sí sola.

**Estados**: sin ejecutar · **pendiente** (Leo pulsó ▶) · **hecho** (con su salida, que en ClapCraft son chips que llevan a lo creado) · **error** (en rojo, con el texto) · **desactualizada**: estaba hecha y después cambió lo que le entra (una nota reescrita, la instrucción, un cable); no se rehace sola.

## Ejecutar un nodo, paso a paso

1. **`ejecutar_nodo { lienzo, nodo }`** (o solo el enlace del nodo, en `nodo` o en `lienzo`). No escribe nada: te da el **encargo** —el tipo, la instrucción de Leo (con sus fórmulas, ya compuestas), las opciones, el destino y el contenido de **todo lo que entra**, por puerto y ya resuelto: el texto de las notas (Markdown, o guion al estilo Fountain), la estructura y el guion de los esquemas, la hoja de los personajes, la salida de una operación anterior—. **Las imágenes** de esas notas y de los nodos de imagen van adjuntas (reducidas a 1024 px de lado largo, como mucho 8 por encargo; en el texto, «IMAGEN 1 (nota «…», bloque 2)» dice de dónde es cada una). Termina con los pasos exactos para escribir la salida.
   - Si dice **ANTES**: una operación que te entra aún no tiene salida. Hazla primero.
   - Si dice **FALTA** lo de un puerto obligatorio, o una entrada está **rota**: no inventes; díselo a Leo.
2. **Genera con el criterio de siempre** (ver SKILL.md): Leo decide la historia. **No inventes personajes, lugares ni tramas que no estén en las entradas o en la instrucción**; si falta algo, pregúntalo o déjalo como `[hueco]`. El contexto manda en el tono; el esquema conectado a `esquema` manda en el orden de lo que pasa (síguelo paso a paso, sin saltarte nodos).
3. **Escribe la salida de verdad** con las herramientas de siempre:
   - `generar`: `escribir_documento { esquema, contenido, como: "guion" }` (con destino `nuevo`, antes `editar_proyecto › crear_esquema`). Lo que había queda como versión «Antes de Claude».
   - `partir`: la skill **clapcraft-seedance** (conectar esquema ↔ biblioteca, `preparar_fragmentos`, una nota por fragmento con `crear_nota { fragmento }`), con los `segundos_max` del nodo.
   - `escaleta`: `editar_esquema` con un `crear_nodo` por beat, en orden (tramas nuevas solo si Leo las pide).
   - `resumir` / `reescribir` / `traducir` / `prompt`: `editar_biblioteca › crear_nota` en el destino, o `escribir_documento { esquema }` si es «en su sitio».
4. **`completar_nodo { lienzo, nodo, salida }`**: `{ tipo: "documento", esquema }` · `{ tipo: "fragmentos", biblioteca, esquema, notas }` (sin `notas`, las que son fragmento de ese esquema en esa biblioteca) · `{ tipo: "esquema", esquema }` · `{ tipo: "nota", nota }`. Comprueba que existe (un guion vacío no vale) y que **es la de su destino**: el esquema del destino; «en su sitio», el guion (o la nota) de la fuente; con destino una biblioteca (y su segmento), notas de ahí. La nota va por su **id** (el que te dio `crear_nota`), su enlace o su **título exacto** (uno parecido no vale), y nunca es una plantilla, una fórmula, el guion de un esquema ni una de las que entran en la operación. Puedes añadir `mensaje`: una línea para Leo. Si no se pudo, `completar_nodo { lienzo, nodo, error: "por qué" }`: el nodo se pone en rojo con ese texto.
5. Dile a Leo qué escribiste, con los enlaces que devuelve `completar_nodo`.

## «Ejecuta el lienzo»

`leer_lienzo { lienzo }` da las **PENDIENTES en el orden en que se ejecutan** (cada una detrás de las que le dan algo). Hazlas en ese orden, cada una con los pasos de arriba; la salida de una es la entrada de la siguiente, así que **completa cada una antes de pasar a la otra**. Si una falla, márcala con `error` y no hagas las que dependen de ella (díselo a Leo).

- Una **desactualizada** solo se rehace si Leo lo pide: entonces ejecútala otra vez y escribe **sobre la misma salida** (el mismo documento, las mismas notas: cámbialas en lugar de duplicarlas) y vuelve a completarla.
- Una **ya hecha** que Leo no pidió rehacer: déjala.
- Una con **error**: lee el error (sale en `leer_lienzo`), arregla lo que se pueda y vuelve a intentarlo, o pregúntale a Leo.

## Armar un lienzo

Si Leo te lo pide, `editar_proyecto › crear_lienzo { contenedor, nombre }` y `editar_lienzo { lienzo, operaciones }` (entero o nada, con `ref`/`$ref`):

```json
[
  { "op": "crear_nodo", "tipo": "nota", "nota": "Referencias de la playa", "ref": "n" },
  { "op": "crear_nodo", "tipo": "personaje", "personaje": "Mara", "ref": "m" },
  { "op": "crear_nodo", "tipo": "esquema", "esquema": "Piloto", "ref": "e" },
  { "op": "crear_nodo", "tipo": "generar", "titulo": "Escena de la playa", "instruccion": "…", "formulas": ["Tono noir"], "destino": { "esquema": "Piloto" }, "ref": "g" },
  { "op": "crear_nodo", "tipo": "partir", "segundos_max": 15, "destino": { "biblioteca": "Fragmentos" }, "ref": "p" },
  { "op": "conectar", "de": "$n", "a": "$g" }, { "op": "conectar", "de": "$m", "a": "$g" },
  { "op": "conectar", "de": "$e", "a": "$g", "puerto": "esquema" }, { "op": "conectar", "de": "$g", "a": "$p" }
]
```

Sin `x`/`y`, las entradas van en una columna a la izquierda y las operaciones a la derecha. `conectar` sin `puerto` usa el primero que acepta lo que da el nodo de salida; a una entrada no llega nada y no hay ciclos. `editar_nodo`, `mover`, `desconectar` y `borrar` completan el juego (estos dos, y un `conectar` que sustituye un cable, piden permiso en el asistente de la app). Una imagen va como `data:image/…` (base64): una dirección de la web no vale; y de `datos` solo cuentan los campos de su tipo. No pongas tú operaciones en pendiente: eso es el ▶ de Leo.

## Enlaces

`clapcraft://<proyecto>/lienzo/<id>` (el lienzo) y `…/lienzo/<id>/nodo/<id>` (un nodo): valen en lugar del id en `leer_lienzo`, `ejecutar_nodo`, `completar_nodo`, `editar_lienzo` y `mostrar_en_clapcraft`; `ver_enlace` los lee. Todo lo que cambias en un lienzo queda en tu historial y se revierte como lo demás.
