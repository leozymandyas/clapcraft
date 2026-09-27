---
name: clapcraft-seedance
description: Adapta un guion o un esquema de ClapCraft a fragmentos cortos para generar vídeo con IA (Seedance 2.0 y parecidos, hasta 15 s por toma) — parte el guion en tramos con sus tiempos, escribe una nota por fragmento en la biblioteca conectada al esquema, con su bloque de prompt, un aviso con la duración, el tramo y los personajes, y el enlace a sus nodos, y rehace el que Leo pida. Úsala cuando Leo hable de Seedance, de generar su guion en vídeo, de fragmentos, tomas o prompts de vídeo a partir de un esquema o un guion de ClapCraft, de «pedazos del guion con tiempos», o pida regenerar el prompt de un fragmento, o haya que ejecutar un nodo «Partir en fragmentos» de un lienzo.
---

# De un guion de ClapCraft a fragmentos para Seedance

Leo escribe sus guiones en ClapCraft y quiere que una IA de vídeo (Seedance) los genere **por tramos de 15 segundos como mucho**. Tu trabajo: partir el guion (o, si aún no tiene, el esquema) en fragmentos en orden, con su duración, y dejar **una nota por fragmento** en la biblioteca conectada al esquema, lista para copiar su prompt. Usa las herramientas `clapcraft` y la skill **clapcraft** para todo lo demás del proyecto (qué es cada cosa, enlaces, historial).

## El flujo

1. **Ubícate.** `ver_proyecto` (o `ver_enlace` si Leo pegó enlaces): qué esquema, y con qué **bibliotecas está conectado** (sale junto a cada esquema: «conectado con biblioteca «…»»; también en `leer_esquema`). Las conexiones son de muchos a muchos y no tienen que ver con los grupos del árbol.
   - Sin ninguna conectada: **pregúntale a Leo** dónde las quiere. Conecta con `editar_proyecto { operaciones: [{ op: "conectar", esquema, biblioteca }] }` (o crea antes una con `crear_biblioteca`).
   - Con varias: pregunta cuál, salvo que una ya tenga los fragmentos de ese esquema (`leer_biblioteca` los marca: «FRAGMENTO nº 3 de «Piloto»…»).
2. **Prepara los cortes.** `preparar_fragmentos { esquema, segundos_max: 15 }` **no escribe nada**: te da los fragmentos en orden, cada uno con su segmento (acto o secuencia), su escena, sus bloques del guion, sus nodos, sus segundos estimados y su texto; y dice si ya hay fragmentos de ese esquema. Lee el cómo de la estimación en [tiempos](references/tiempos.md) y **díselo a Leo**: es una guía, no un cronómetro.
   - Si ya hay fragmentos, no los dupliques: cambia los que están (ver «Rehacer uno»).
   - Si los cortes no le sirven (una escena partida en mal sitio, una acción que pide más tiempo), ajústalos con él antes de escribir: puedes unir o partir fragmentos a mano mientras ninguno pase de 15 s.
3. **Lee lo que hace falta para que sea consistente**: el guion entero (`leer_documento { esquema }`), las descripciones y notas de sus nodos (`leer_esquema`), y **la hoja de cada personaje** que aparezca: está en su biblioteca, `leer_biblioteca { biblioteca: "<nombre del personaje>", contenido: true }` (segmento «Hoja de personaje»). De ahí salen su aspecto, su ropa y lo que no cambia.
4. **Escribe una nota por fragmento**, en orden, en un solo lote por segmento: `editar_biblioteca { biblioteca, operaciones: [ { op: "crear_segmento", ref: "a1", nombre: "Acto I" }, { op: "crear_nota", segmento: "$a1", titulo, contenido, fragmento: { esquema, nodos, segundos, orden, bloques } }, … ] }`. Cómo es cada nota: [la nota de un fragmento](references/nota.md). El `fragmento` es lo que hace que ClapCraft enseñe la etiqueta «Fragmento · 12 s · Piloto» en la tarjeta, que lleva a sus nodos del esquema.
5. **Cuenta y comprueba**: cada prompt, **menos de 1 990 caracteres** (cuéntalos antes de escribir; ClapCraft no los cuenta). Después, `leer_biblioteca` y, si está abierto, `mostrar_en_clapcraft` con el enlace de la biblioteca para que Leo los vea.
6. **Rehacer uno** cuando Leo lo pida (por su enlace, su número o su título): `leer_documento { nota }` para ver cómo está, relee su tramo del guion (sus `bloques`) y reescribe **solo esa nota** con `escribir_documento { nota, contenido }` (lo de antes queda como versión «Antes de Claude»); si cambia la duración, `editar_nota { nota, fragmento: { segundos } }` (lo demás del fragmento se conserva). Si Leo dice qué no le gustó (el plano, la luz, el ritmo), cambia eso y deja lo demás igual, para que los fragmentos sigan casando.

## Desde un lienzo: el nodo «Partir en fragmentos»

En un lienzo de ClapCraft (skill **clapcraft**, [lienzos](../clapcraft/references/lienzo.md)), el nodo `partir` es este mismo flujo como operación: le entra un **guion** (un nodo de esquema o la salida de un «Generar guion») y, en **contexto**, lo que ayude a que sea consistente (personajes con su hoja e imágenes, notas de estilo, referencias). Lleva `segundos_max` (15 por defecto) y un **destino** (una biblioteca y su segmento, o una nueva).

1. `ejecutar_nodo { lienzo, nodo }`: el guion que entra ya leído, el contexto (con las imágenes de las hojas de personaje y las notas de referencia adjuntas: úsalas para describir a cada personaje igual en todos los prompts), el destino y la instrucción de Leo. Si el guion viene de un «Generar guion» que aún no tiene salida, hazlo antes.
2. Haz **el flujo de arriba** con el esquema del guion (`preparar_fragmentos { esquema, segundos_max }` con los segundos del nodo) y escribe las notas en la **biblioteca del destino** (conéctala con el esquema si no lo está; con destino `nuevo`, créala antes con `crear_biblioteca`). La instrucción de Leo manda sobre lo de por defecto (estilo, cámara, lo que quiere en los prompts).
3. `completar_nodo { lienzo, nodo, salida: { tipo: "fragmentos", biblioteca, esquema, notas: [ids de las notas creadas, en orden] } }`. ClapCraft enseña en el nodo los fragmentos como chips que llevan a cada nota.
4. Si Leo lo rehace (el nodo sale **desactualizado** porque cambió el guion): cambia las notas que ya están en lugar de crear otras, y vuelve a completarlo.

## Seedance, en breve

Lo que hay que saber para que el prompt funcione está en [Seedance](references/seedance.md). Lo esencial:

- Una generación dura **de 4 a 15 s**; dentro, varias tomas con su tramo de tiempo («Shot 2 — … (4-9s)»). El formato y la resolución se eligen fuera del prompt.
- **Límite duro de 1 990 caracteres** por prompt, con todo dentro.
- Por secciones: estilo visual y cámara, entorno, personajes, efectos (si hay), tomas con tiempos y cuadro final. Solo lo que **ve la cámara o se oye**: nada de pensamientos, intenciones ni psicología.
- Diálogo en español, **frases cortas** (5 a 8 palabras por línea) con quién habla y en qué tono, y acción entre líneas.
- Sin personas reales, sin marcas ni personajes con derechos (ni sugeridos), y las acciones delicadas (golpes, armas) contadas como producción de cine.
- **Consistencia**: las mismas constantes (cámara, lente, luz, gradación) y la misma descripción de cada personaje, palabra por palabra, en **todos** los fragmentos; las imágenes de referencia de un personaje, estilizadas (no fotos), como `@image1`.

## Criterio

- **Leo decide.** No inventes personajes, lugares, tramas ni diálogo que no estén en su guion o en su esquema; lo que el guion no dice (la luz, el plano) sí lo propones tú, y lo apuntas en el aviso para que lo revise. Si falta algo que importa (cómo es un personaje sin hoja), pregunta o déjalo como `[hueco]` en el prompt.
- El guion manda sobre el esquema; el esquema solo si no hay guion.
- No reescribas el guion ni el esquema para que quepan los fragmentos: las notas son aparte. Una duda sobre el guion va en el aviso de su fragmento (tipo `question`), no en el guion.
- Todo lo que escribes queda en el historial de Claude y se revierte desde ClapCraft; avisa siempre de qué notas creaste o cambiaste, con sus enlaces.
