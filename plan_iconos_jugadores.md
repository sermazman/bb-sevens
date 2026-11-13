# Sevens Pitch — Plan de iconos de jugador (por capas)

Estado: **DISEÑO ACORDADO, SIN CÓDIGO TODAVÍA.** Orden de trabajo: 1) cerrar este plan → 2) Excel + `icons.json` + validador → 3) rediseño del campo/banquillos para 38×38 → 4) implementación en la app.

## 1. Formato de las imágenes
- PNG **38×38 px**, fondo transparente, **sin recortar** (todas las capas del mismo icono tienen el mismo lienzo para apilarse sin desplazamientos).
- Todos los sprites **miran a la derecha**. El equipo **visitante (derecha del campo)** se voltea horizontalmente (en el campo los sprites no deben llevar texto ni elementos que no admitan inversión).
- Carpeta en la raíz del repo: `/player_icons/`.
- Píxel duro (sin suavizado) y `image-rendering: pixelated` al pintar.

## 2. Capas y orden de apilado (de abajo a arriba)
| Capa | Archivo | Qué es | Cómo se pinta |
|---|---|---|---|
| BASE | `ICONO_BASE.png` | Base/peana bajo el jugador | Solo se usa su **forma**: se rellena con el **color de la posición** (el que hoy es el borde exterior de la ficha: Líneas gris, Receptores amarillo…) al **60 %** de opacidad |
| 1 | `ICONO_1.png` | Piel y zonas que **no** cambian de color | Tal cual |
| 2 | `ICONO_2.png` | **Armadura** | Veladura con el nuevo **Color ARMADURA** al **25 %**. Sin color de armadura → se deja como el original |
| 3 | `ICONO_3.png` | **Color primario** del equipo | Dibujada en **gris**; se tiñe con el color primario |
| 4 | `ICONO_4.png` | **Color secundario** (opcional, casos excepcionales) | Dibujada en **gris**; se tiñe con el color secundario |

- Siempre existen 1, 2 y 3; la 4 solo en algún caso. `BASE` se confirma como capa propia (a validar en la primera prueba visual).
- Ejemplo: `UND_TROLL_1.png … UND_TROLL_3.png`, `UND_TROLL_BASE.png`.

### Reglas de color (fallbacks)
- Sin colores de equipo definidos → se usa el **primario actual de la ficha** en la capa 3; el resto, como el original.
- Sin ningún color → **rojo / azul** básicos en la capa 3 (local / visitante).
- Sin icono para ese jugador → **se mantiene la ficha actual** (con `textColor` como ahora).

### Datos de color en los JSON de equipo
```
"color": "#0a0a0a"                  → color primario   → capa 3
"color_secundary": "#00ff2a"        → color secundario → capa 4
"textColor" / "textColor_secundary" → se conservan (para las fichas sin icono)
"color_armadura": (NUEVO)           → veladura de la capa 2 (a implementar; opcional)
```
> ⚠️ En tu mensaje ponía "capa 2" para primario y secundario; lo he interpretado como **capa 3 y capa 4** (la 2 es la armadura). Confírmalo.

### Calibrado de los grises (importante)
El método de teñido previsto es **multiplicar**. Con multiplicación, un gris oscuro oscurece mucho el color. `UND_TROLL_3.png` usa grises entre 32 y 116 (y alguno a 175/255): con un color como `#00ff2a` saldría muy apagado. Antes de dibujar todas las razas hay que **probar esta imagen con 2-3 colores** y decidir: (a) que las luces de las capas 3/4 lleguen cerca de 255 y las sombras no bajen de ~100, o (b) que la app normalice el brillo al teñir. Decidir tras la primera prueba.

## 3. Tabla maestra (Excel → `icons.json`)
Columnas (basadas en `/rosters/positions.json`):
| Col | Contenido | Ejemplo |
|---|---|---|
| A | `race` (idéntico al JSON) | `Amazon` |
| B | `type` (idéntico al JSON) | `Eagle Warrior Linewomen` |
| C | icono | `UND_TROLL` |
| D | capas (nº, casi todas 3; la 4 es excepcional) | `3` |
| E | variante (icono alternativo) | `UND_TROLL2` |

A partir del Excel se generará:
- `icons.json` (la app lo lee, así no se piden archivos inexistentes).
- **Validador**: comprueba que existen todos los PNG, que miden 38×38, que están todas las capas indicadas y lista lo que falta.

Pendientes del Excel: de dónde sale el **color de la capa BASE por posición** (¿columna F "categoría/color"? o regla por tipo de posición) y **cómo se elige la variante** (manual por jugador, por número, aleatoria…).

## 4. Comportamiento en el campo
- **Estados**: igual que ahora (imagen traslúcida + letra del estado encima). Sin sprites nuevos de caído/aturdido.
- **Número del jugador**: si lleva icono, **se quita**; las fichas sin icono lo mantienen.
- **Zonas de defensa**: se siguen dibujando como casillas, igual que ahora.
- **Rendimiento**: componer cada jugador una vez por combinación de colores y cachearlo; no repintar capas en cada refresco.
- **Sincronización online**: solo viajan la clave del icono y los colores, no las imágenes.
- **Permisos**: los iconos vienen de FUMBBL; permiso en trámite (de acuerdo con que se use mientras se cite en el footer).

## 5. Pendiente
1. Confirmar capa 3/4 (arriba) y la capa BASE.
2. Prueba de calibrado de grises con `UND_TROLL_3.png`.
3. Definir color de BASE por posición y selección de variantes.
4. Excel → `icons.json` + validador.
5. Rediseño del campo, banquillos y HTML para 38×38 (celda de 38 px o múltiplos enteros; hoy 20×11 celdas = 760×418 px).
6. Añadir `color_armadura` a los equipos.
7. Implementación en la app y pruebas.

## 6. Archivos generados (14-nov)
- `player_icons/icons.json` — generado desde el Excel (197 posiciones, 164 iconos). Contiene `size: 38`, `base_opacity: 0.6`, `armor_opacity: 0.25`, `layers` (icono → nº de capas) e `icons` (race → type → icon/layers/variant).
- `tools/build_icons_json.py` — Excel → `icons.json` (`python tools/build_icons_json.py player_icons.xlsx`). Avisa de datos vacíos, capas ≠ 3/4, duplicados race+type.
- `tools/validate_icons.py` — comprueba que existen `ICONO_BASE.png` e `ICONO_1..N.png`, que miden 38×38 y que tienen transparencia; lista lo que falta y los PNG sobrantes.
- Probado: icono completo = `UND_TROLL`. Faltan los otros 163.
- Teñido decidido en la prueba: capas 3/4 con brillo **normalizado** (lo más claro = color pleno); colores casi negros se aclaran un poco antes de teñir (se afina al implementar).
- Campo: casillas de **38 px con 1 px de separación** (→ 779 × 428 px). Pendiente: portada/index y recolocación de paneles y banquillos.
