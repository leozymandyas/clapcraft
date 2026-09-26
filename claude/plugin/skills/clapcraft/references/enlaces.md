# Enlaces de ClapCraft

Leo copia en ClapCraft el enlace de lo que te quiere enseñar —«Copiar enlace para Claude» en los ⋯ del árbol y de las bibliotecas, en el clic derecho del esquema y del editor, el botón de enlace de cada cabecera y del panel flotante, o **Cmd+Shift+C** con algo elegido— y lo pega en la conversación. Llega en Markdown, con un nombre que ya dice qué es:

```
[Nodo «La broma de la engrapadora» · esquema «Piloto»](clapcraft://analisis-de-the-office/esquema/dmu3k2…/nodo/p6)
[«MICHAEL Soy el mejor jefe.» · guion de «Piloto», bloques 12–14](clapcraft://analisis-de-the-office/esquema/dmu3k2…/documento?b=12-14&h=1x9a3)
```

- **Léelos con `ver_enlace`** (pásale el texto tal cual, con uno o varios): qué es cada uno, dónde está y lo que tiene, con los ids para cambiarlo. Si algo ya no existe, lo dice.
- **Valen en lugar del id** en cualquier herramienta: `editar_esquema { operaciones: [{ op: "crear_nota", nodo: "<enlace>", texto: "Pero…" }] }` —sin `proyecto` ni `esquema`: salen del enlace—, `leer_documento { nota: "<enlace>" }`, `leer_biblioteca { biblioteca: "<enlace>" }`…
- **Un tramo de texto** (`?b=12-14`) son los bloques de `leer_documento { numerar: true }`; `h=` es la huella del primero: si Leo escribió algo encima y el tramo se movió, `ver_enlace` lo encuentra y dice sus números de ahora. Para cambiarlo, `escribir_documento { modo: "sustituir", desde, hasta }` con los números que dé `ver_enlace`.
- **Para llevar a Leo a algo**, `mostrar_en_clapcraft { enlace }`. Y cuando le hables de algo concreto, puedes poner su enlace en Markdown: en ClapCraft, **Claude › Ir al enlace copiado** lo lleva ahí (y un clic, si su app de Claude le pasa el enlace al sistema).

- **Si el archivo cambió de nombre**, los enlaces viejos siguen valiendo: el proyecto recuerda cómo se llamaba (`ver_proyecto` lo dice en «Enlaces:», y `ver_enlace` avisa cuando un enlace lleva un nombre de antes). Los que des tú, con el nombre de ahora.
- **Dentro de un documento** también puedes escribir enlaces (`[Nodo «X»](clapcraft://…)` en `escribir_documento`): quedan como enlaces, Leo los abre con Cmd+clic y ClapCraft los corrige si el archivo cambia de nombre.

## Cómo se forman

`clapcraft://<proyecto>/<ruta>`. `<proyecto>` es el nombre del archivo del proyecto sin `.clapcraft` (`ver_proyecto` y `leer_esquema` dicen el suyo en «Enlaces:» / «Enlace:»). Los ids, los de las herramientas; las columnas, desde 1.

| Qué | Ruta |
| --- | --- |
| el proyecto | *(vacía)* |
| contenedor, carpeta, grupo, personaje | `contenedor/<id>` · `carpeta/<id>` · `grupo/<id>` · `personaje/<id>` |
| esquema | `esquema/<id>` |
| su guion (o un tramo) | `esquema/<id>/documento` · `…/documento?b=<desde>-<hasta>` |
| nodo, salto, trama, acto, nota del esquema | `esquema/<id>/nodo/<p…>` · `…/salto/<s…>` · `…/trama/<l…>` · `…/acto/<a…>` · `…/nota/<n…>` |
| el enlace entre dos nodos seguidos | `esquema/<id>/enlace/<nodo>/<nodo>` |
| la raya de una trama entre la columna c y la c+1 | `esquema/<id>/raya/<trama>/<c>` |
| columnas | `esquema/<id>/columna/<n>` · `esquema/<id>/columnas/<a>-<b>` |
| biblioteca, sección, segmento | `biblioteca/<id>` · `biblioteca/<id>/seccion/<id>` · `biblioteca/<id>/segmento/<id>` (`…/segmento/bandeja`: las notas sin segmento) |
| nota de biblioteca (o un tramo) | `nota/<id>` · `nota/<id>?b=<desde>-<hasta>` |

Pon delante un nombre que se lea, como los de Leo: `[Nodo «Título» · esquema «Nombre»](clapcraft://…)`.
