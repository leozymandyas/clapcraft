# La nota de un fragmento

Una nota por fragmento, en la biblioteca conectada al esquema, en el segmento de su acto o secuencia (el que dice `preparar_fragmentos`), en orden.

## Título

`NN · Escena · lo que pasa (segundos)` — corto y ordenable: `03 · Cocina · Tomás no vende (14 s)`. El número, con dos cifras, es su `orden`.

## Contenido (Markdown)

Tres recuadros, en este orden. ClapCraft los pinta con su cabecera (icono, título y, en el prompt, «Copiar», que copia solo lo de dentro) y realza lo que va entre `[corchetes]`: úsalos para lo que Leo tiene que rellenar o decidir.

````markdown
```aviso:note Fragmento 3 · ≈ 14 s
**Tramo:** escena 2, «INT. COCINA – NOCHE» · bloques 7–9 del guion
**Nodos:** [Nodo «La discusión» · esquema «Piloto»](clapcraft://…/esquema/…/nodo/p5)
**Personajes:** TOMÁS (@image1), MARA (@image2)
**Viene de:** 02 (Mara entra en la cocina) · **Sigue en:** 04 (la respuesta de Mara)
```

```prompt Seedance · Fragmento 3
Visual Style:
Cinematic realism, ARRI Alexa, warm tungsten kitchen light, 35mm, shallow depth of field, light film grain, amber-teal grade.
Camera Behavior: handheld, slow push-in, breathing drift.

Environment:
Small kitchen at night, worn formica table, rain on the window, fridge hum.

Tomás, a figure based on @image1 [stylized illustration] — gray sweater, three-day beard, seated, hands flat on the table.

Shot 1 — Seated (0-5s)
Medium shot. The seated figure keeps his eyes on the table. Tomás dice (tono seco): "Papá dejó la casa a los dos." Rain ticking on glass.

Shot 2 — The refusal (5-10s)
Close-up. He lifts his gaze. Tomás dice (firme): "No pienso venderla." Fridge hum drops out.

Shot 3 — Hold (10-14s)
Slow push-in on his face. Silence, rain only.
```

```aviso:tip Para generarlo
Referencias: @image1 = [hoja de Tomás, estilizada]. Formato [16:9]. Si falla el filtro, prueba a 720p antes de reescribir.
```
````

- **El aviso `note`** (arriba): duración, tramo del guion, **el enlace a sus nodos** (el de `preparar_fragmentos`; en Markdown con su nombre) y los personajes con su referencia; y de qué fragmento viene y a cuál sigue, para la continuidad.
- **El `prompt`**: solo el prompt de Seedance, sin comentarios; menos de 1 990 caracteres. Ver [Seedance](seedance.md).
- **Un aviso más, si hace falta**: `tip` (cómo generarlo, qué subir), `question` (una duda para Leo sobre el guion o una decisión que tomaste tú), `warning` (algo que puede fallar en el filtro).
- **Lo que da «Copiar» es lo que va a Seedance**, así que escribe el prompt para que salga exacto (ver abajo).
- Tipos de aviso: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`, `abstract`, `todo` (o en español: nota, consejo, pregunta, advertencia…). Color opcional al final de la cabecera: ` ```prompt Título {.violeta}`.

## Qué pasa con el Markdown dentro de un prompt

Dentro de un recuadro el Markdown **se convierte** (se ve con formato en ClapCraft) y «Copiar» se lleva el texto **sin marcas**:

- Cada renglón es un renglón y una línea en blanco separa párrafos; «Copiar» deja **una** línea en blanco entre párrafos (dos o más seguidas cuentan como una) y ninguna al principio ni al final.
- `- ` y `1. ` al principio de un renglón hacen una lista: se copia igual (`- a`, `1. a`, renumerada desde el primero), pero **como su propio párrafo**: si va pegada a un renglón de texto, «Copiar» pone una línea en blanco en medio. Si no quieres lista, no empieces el renglón así (`Shot 1 — …`, no `1. Shot`).
- `**negrita**`, `*cursiva*` / `_cursiva_`, `~~tachado~~`, `==resaltado==` y `` `código` `` se ven con formato y **se copian sin los signos**. Si Seedance necesita el signo (un asterisco, un guion bajo entre espacios), no lo escribas en parejas.
- `# Título`, `> cita` y `---` solos en su renglón se vuelven título, cita y raya: se copian sin `#` ni `>`, y la raya no se copia. Para un rótulo, escríbelo con dos puntos (`Visual Style:`), no con `#`.
- `[texto](https://…)` es un enlace y se copia solo el texto; `[huecos]` sin paréntesis detrás se quedan como están (y se realzan).
- Una valla ` ``` ` dentro del prompt es un bloque de código (se copia tal cual); un renglón «```prompt» ahí dentro es texto, no abre otro recuadro.
- Las tablas no valen dentro de un prompt (se copian sin separadores).

## El fragmento

Cada nota lleva `fragmento: { esquema, nodos, segundos, orden, bloques }`, con lo que dio `preparar_fragmentos` (o lo que ajustaste con Leo):

- `esquema`: su id, nombre o enlace. `nodos`: los de su tramo (ids, títulos o enlaces; pueden ser ninguno).
- `segundos`: la duración que le diste (la suma de sus tomas). `orden`: su puesto en la serie, desde 1. `bloques`: `[desde, hasta]` del guion.
- En `editar_nota`, lo que no se da se conserva; `fragmento: null` quita la marca.
- `leer_biblioteca` lo enseña en cada nota («FRAGMENTO nº 3 de «Piloto» · 14 s · nodos … · bloques 7–9»); si luego se borran sus nodos o su esquema, dice «HUÉRFANO»: pregúntale a Leo si se rehace o se tira.
