# Seedance 2.0: lo que hace falta para escribir el prompt de un fragmento

Resumen de trabajo para las notas de ClapCraft. Si tienes a mano una skill dedicada a Seedance, úsala además de esta.

## Límites

- **Duración**: de 4 a 15 s por generación (más largo se encadena extendiendo el vídeo anterior). Dentro caben varias tomas; cada una con su tramo: `Shot 2 — Nombre (4-9s)`.
- **1 990 caracteres como máximo** por prompt, todo incluido. Cuéntalos. Si sobra, quita primero detalle visual secundario; nunca el bloque de estilo y cámara.
- Formato (16:9, 9:16, 1:1), resolución y fotogramas se eligen en la interfaz, no en el prompt. No hay campo negativo.
- Referencias: hasta 9 imágenes, 3 vídeos y 3 audios (el audio, en MP3), nombrados en el prompt como `@image1`, `@video1`, `@audio1`.

## Estructura (por secciones, en este orden)

1. **Visual Style / Camera Behavior** (siempre): nivel de realismo y una cámara o formato real (ARRI Alexa, RED, iPhone), la luz (fuente y dirección), la lente (focal, profundidad de campo), una textura o partícula en el aire y la gradación de color; y cómo se mueve la cámara (fija, en mano, dolly, grúa…).
2. **Environment** (siempre): el lugar, el suelo o las superficies, el cielo o la luz ambiente, los objetos que importan y lo que se oye antes de que pase nada.
3. **Personajes** (si hay): cada uno con su referencia (`based on @image1 [stylized illustration]`), su ropa y su estado visible, y su postura como acción física.
4. **Efectos** (solo si los hay): qué acción los dispara y cómo se comportan, con lenguaje de producción (mecánico, de partículas), no «mágico».
5. **Shots** (siempre): cada toma empieza por la posición y el movimiento de la cámara; luego lo que se ve, lo que hacen (movimientos, no intenciones) y lo que suena.
6. **Final frame** (opcional): dónde queda cada cosa y qué se oye al final. Útil para enlazar con el fragmento siguiente.

**La prueba de la lista de tomas**: cada línea tiene que poder estar en la lista de tomas de un director. Fuera la historia de fondo, lo que sienten o piensan los personajes y el porqué: «se gira», «levanta la vista», nunca «se da cuenta» o «decide».

## Diálogo en español

- De 5 a 8 palabras por línea, fáciles de pronunciar; si el guion trae una frase larga, repártela en dos tomas o recórtala **y dilo en el aviso** (el texto del guion es de Leo).
- Quién habla y cómo: `Mara dice (en voz baja): "Entonces quédatela."`
- Acción entre una línea y la siguiente; nada de réplicas encadenadas sin pausa.
- Las secciones pueden ir en inglés (Seedance las entiende mejor) con los diálogos en español tal cual; si Leo prefiere todo en español, también funciona.

## Que pase el filtro

- Desde la primera línea, contexto de producción de cine (cámara, lente, luz).
- Nada de personas reales, famosos, marcas ni personajes con derechos, ni descritos para que se reconozcan: rasgos visuales genéricos.
- Las imágenes de referencia de personas, siempre estilizadas (ilustración, render 3D), nunca una foto real; dilo en el prompt (`[stylized illustration]`).
- Edades ambiguas, fuera: etiquetas de papel (figura, viajero, técnico…) y la ropa.
- Golpes, armas, peligro: siempre enmarcados como producción (entrenamiento, efecto práctico, bengala) y sin sangre ni daño explícito.
- Emociones, como cuerpo: «mandíbula tensa, puños cerrados», no «furioso».
- Si una generación falla sin decir por qué: primero descarta que sea el servicio o la resolución (probar a 720p); luego quita subtexto, nombres o acciones sueltas; luego simplifica y vuelve a añadir poco a poco.

## Consistencia entre fragmentos

- Escribe **las constantes una vez** (cámara, lente, luz, gradación, grano) y repítelas **igual** en el primer bloque de todos los fragmentos de una escena (y, si Leo quiere un mismo look, de todo el guion).
- Cada personaje, con **la misma descripción palabra por palabra** en todos sus fragmentos, sacada de su hoja de personaje (su biblioteca en ClapCraft): ropa, pelo, accesorios. Si algo cambia en la historia (se moja, se cambia de ropa), cámbialo desde ese fragmento y apúntalo en el aviso.
- La misma referencia para el mismo personaje en todos (`@image1` siempre Tomás, por ejemplo) y dilo en el aviso de cada nota.
- Cierra cada fragmento en una posición que el siguiente pueda retomar (su «Final frame» y el «Viene de / Sigue en» del aviso).
