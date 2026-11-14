# Iconos en el JSON de equipo — integración sin romper nada

## Idea
**Los jugadores NO necesitan ningún campo nuevo.** El JSON ya trae `race` (equipo) y `position` (jugador), y `player_icons/icons.json` traduce `race + position → icono`. La app resuelve el icono sola. Los JSON existentes (ligas, gestor de partidos, visor público, creador de rosters) siguen valiendo sin tocarlos.

Comprobado con `marienburg_ravens.json`: *Elven Union* + Lineman/Thrower/Blitzer/Catcher → `ELV_LINEMAN`, `ELV_THROWER`, `ELV_BLITZER`, `ELV_CATCHER` (7 jugadores + el retirado, todos resueltos).

## Orden de resolución (en la app)
1. `player.icon` (opcional) → fuerza un icono/variante concreto para ese jugador.
2. `icons.json` → `icons[race][position]` (comparando sin mayúsculas ni espacios sobrantes).
3. Si no hay coincidencia → **ficha actual** (con `textColor`, como ahora).

## Dos uniformes (Primario y Secundario)
La app ya trabaja con **dos uniformes completos**: el Primario (`color`, `textColor`) y el Secundario (`color_secundary`, `textColor_secundary`). Cada jugador elige en su pantalla cuál ve de cada equipo (`colorChoice`, solo local; el interruptor LOCAL/VISITANTE). El icono usa el mismo mecanismo: **pinta siempre el uniforme que esté activo** (`effColor`/`effTextSetting`), así que no hay que sincronizar nada extra.

> Corrección: antes interpreté `color_secundary` como el color de la capa 4. **No lo es**: es el color de la capa 3 del uniforme *Secundario*. La capa 4 necesita campos propios, por uniforme.

| Capa | Uniforme Primario | Uniforme Secundario |
|---|---|---|
| 3 (color principal) | `color` *(ya existe)* | `color_secundary` *(ya existe)* |
| 4 (detalle, solo iconos con 4 capas) | `color_detalle` *(nuevo)* | `color_detalle_secundary` *(nuevo)* |
| 2 (veladura de armadura, 25 %) | `color_armadura` *(nuevo)* | `color_armadura_secundary` *(nuevo)* |
| Fichas sin icono | `textColor` *(ya existe)* | `textColor_secundary` *(ya existe, "auto")* |

Fallbacks (nada obligatorio):
- Sin `color_armadura*` → armadura con su color original.
- Sin `color_detalle*` → la capa 4 se tiñe con el `textColor` del uniforme activo (o blanco si es "auto").
- Sin `color_secundary` → no hay Uniforme Secundario (como ahora: el interruptor se atenúa).
- Un uniforme Secundario sin `color_armadura_secundary` usa la armadura original, no la del Primario.

## Campos nuevos (todos opcionales)
| Dónde | Campo | Para qué |
|---|---|---|
| equipo | `color_detalle`, `color_detalle_secundary` | capa 4 por uniforme |
| equipo | `color_armadura`, `color_armadura_secundary` | veladura de armadura por uniforme |
| jugador | `"icon": "UND_TROLL2"` | forzar variante/icono distinto del de su posición |

## Por qué no rompe otros editores
- No se cambia ni renombra ningún campo; solo se **añaden** opcionales.
- Un lector que no conozca `color_armadura` o `icon` los ignora.
- Riesgo a vigilar: un editor que **reescriba** el JSON copiando solo los campos que conoce **perdería** esos campos al guardar (no falla, pero se pierde el color de armadura o la variante). Al pasarlos por el resto de editores hay que hacer que los conserven.
- No se guarda ninguna ruta de imagen en el JSON: si algún día se renombran o se mueven los PNG, no hay que tocar ningún equipo.

## Ejemplos
- `doble_calavera_iconos.json` (Underworld Denizens, con los dos uniformes): tu JSON + `color_detalle`, `color_armadura`, `color_detalle_secundary`, `color_armadura_secundary`. Valores de prueba; el resto idéntico.
- `marienburg_ravens_iconos.json`: versión anterior (solo `color_armadura`).

## Pendiente
- Que la app cargue `player_icons/icons.json` y aplique el orden de resolución.
- Cómo se elige la variante desde la UI (de momento solo vía `player.icon` a mano).
- Revisar en Gestor de partidos, creador de rosters y visor público que conservan los campos nuevos.
