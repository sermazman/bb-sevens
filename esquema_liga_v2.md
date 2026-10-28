# Sección `league` (schemaVersion 2) — Temporada 6

La parte superior del JSON (teamName, race, color, textColor, staff, players, formation) es la de rosters.html y NO se toca.
Todo lo de liga vive dentro de `league`. `league.coach` guarda el nombre del entrenador (se pide al inscribir el equipo y se puede editar en «Equipo y economía»). `league.logo` (opcional) es el nombre del PNG del logo, que vive en la misma carpeta que el JSON del equipo (`<teamId>.png`, máx. 512 px de lado largo). Los jugadores se enlazan por `num`.

## Qué se guarda y qué se calcula

| Se guarda | Se calcula en el gestor |
|---|---|
| Tesorería inicial, ganancias y gasto de cada partido | Tesorería actual |
| Eventos de jugador por partido | Estadísticas de carrera y SPP totales |
| Mejoras elegidas (categoría, aleatoria/elegida, orden) | Coste en SPP de cada mejora y SPP sin gastar |
| Heridas leves, graves y muertos por separado | Total de heridas (HER = HL + HG + RIP) |
| Resultado de cada partido | Victorias/empates/derrotas, TD a favor/en contra, puntos de liga |
| Precio base de cada jugador | Coste y valor del equipo |

## Progresión (reglas nuevas de Sevens)

- Las mejoras NO se pagan con SPP: se sube 1 habilidad por partido a un solo jugador. El gestor lo aplica así (máx. 1 mejora por equipo y partido, desde el registro del partido).
- Los SPP y las estadísticas son solo orientativos (y base para un futuro Hall of Fame). `sppUnspent` ya no se usa (igual a `sppTotal`) y `sppCost` de las mejoras nuevas es 0.
- Solo hay mejoras de habilidad, determinadas al azar. Valor extra: primaria +10.000 la primera habilidad nueva y +20.000 cada una de las siguientes; secundaria +20.000 la primera y +30.000 las siguientes. Ese dinero sube el valor del jugador, pero no sale de la tesorería.

## Personal y fans

- Se compran durante la liga: ayudantes de entrenador (20.000, máx. 3), animadoras (20.000, máx. 3) y apotecario (80.000 según raza, máx. 1). Resta de la tesorería al comprarlo y suma al valor del equipo.
- Fans devotos: 1 gratis al crear el equipo, no se compran. Suben o bajan con los partidos (`dedicatedFansGained`), siempre entre 1 y 5 (se aplica partido a partido).

## Fórmulas (antiguas, del Excel; los costes en SPP ya no se aplican)

- SPP totales = ESP + CP + TD×3 + DES + INT×2 + HL×2 + HG×2 + RIP×2 + MVP×4
- SPP sin gastar = SPP totales − SPP gastados en mejoras
- Coste SPP de una mejora (según su orden 1ª–6ª): 1ª = 3/6 (primaria aleatoria/elegida), 6/12 (secundaria), 18 (característica); 6ª = 15/30, 30/40, 50.
- Precio del jugador = precio base + valor extra de sus mejoras
- Coste del equipo = precios de jugadores + repeticiones + personal (fans extra a 20.000, médico, animadoras, ayudantes, sobornos)
- Valor del equipo = personal + valor de los jugadores (un jugador que se pierde el próximo partido no cuenta)
- Tesorería = inicial + Σ ganancias − Σ tesorería gastada − coste del equipo + valor extra de mejoras − precio de los muertos y drafteados (con sus mejoras) − Σ valor pagado para no ser drafteado
- "Tesorería gastada" de cada partido es SOLO el gasto manual en incentivos (no son compras de roster).

## Estado del jugador

- `active`: puede jugar.
- `missNextGame`: herido grave; vuelve a `active` al registrar el siguiente partido.
- Drafteado: el draft se marca en el registro de partido, solo en jugadores con al menos 1 habilidad subida con SPP (las de base y las mejoras de característica no cuentan). Sale de `players` y de `formation` y pasa a `retiredPlayers` con `reason: "drafted"` y `draftValue` ("2+" con 1 habilidad subida, "3+" con 2, etc.). Se trata exactamente como un muerto: no se devuelve dinero y su valor total en ese momento (precio + mejoras) sigue restando de la tesorería.
- Pagar valor: en lugar de ser drafteado, el jugador se queda; se resta su valor (precio + mejoras) de la tesorería y su valor sube 15.000. Se guarda en `progression.draftPayments`: `{ "matchId": "T6-J02", "paid": 105000, "valueExtra": 15000 }`. El evento del partido lleva `draft: "paidValue"` y `valuePaid`.
- Muerto: sale de `players` y se mueve a `retiredPlayers` con atributos, habilidades, progresión y estadísticas del momento.
- Herido leve e inconsciente: no impiden jugar (solo cuentan HL como estadística).
- Expulsados: son los jugadores PROPIOS expulsados; solo estadística del partido/equipo, no afectan a la disponibilidad.

## Ejemplo de partido

```json
{
  "id": "T6-J01",
  "round": 1,
  "homeAway": "home",
  "opponent": { "teamId": "equipo_2", "teamName": "Reinos del Caos", "race": "Chaos Chosen" },
  "result": { "teamScore": 2, "opponentScore": 1, "outcome": "win" },
  "statistics": {
    "lightInjuriesFor": 2, "lightInjuriesAgainst": 1,
    "seriousInjuriesFor": 1, "seriousInjuriesAgainst": 0,
    "deathsFor": 0, "deathsAgainst": 0,
    "sentOffFor": 1, "sentOffAgainst": 0
  },
  "dedicatedFansGained": 1,
  "treasurySpent": 50000,
  "earnings": 70000,
  "leaguePoints": 3,
  "playerEvents": [
    { "num": 3, "sprints": 0, "passes": 0, "touchdowns": 1, "deflections": 0,
      "interceptions": 0, "lightInjuries": 0, "seriousInjuries": 1, "deaths": 0, "mvp": 1 }
  ],
  "notes": "",
  "registeredAt": "2026-10-12T11:30:00Z"
}
```

- `homeAway`: `home` | `away`. `registeredAt`: fecha ISO de cuando se registró.
- `dedicatedFansGained`, `earnings`, `leaguePoints` y `treasurySpent` pueden ser **negativos** (los fans pueden bajar).
- El partido se registra a la vez en los dos equipos, en un solo commit de GitHub.
- Cada elemento de `playerEvents` puede llevar `improvements` (mejoras ganadas en ese partido).

Los TD del equipo salen de `result` (marcador); no se duplican.

## Ejemplo de mejora

```json
{ "category": "primary", "selection": "chosen", "order": 1, "skill": "Placar" }
{ "category": "stat", "selection": "chosen", "order": 2, "attribute": "st", "amount": 1 }
```
`category`: `primary` | `secondary` | `stat`. `selection`: `chosen` | `random`.

Mejora guardada en `progression.improvements` (la crea el gestor):
```json
{ "matchId": "T6-J01", "order": 1, "category": "primary", "selection": "chosen",
  "skill": "Placar", "sppCost": 6, "valueExtra": 20000 }
{ "matchId": "T6-J01", "order": 2, "category": "stat", "selection": "chosen",
  "attribute": "st", "amount": 1, "sppCost": 18, "valueExtra": 80000 }
```
Las habilidades se añaden además a `players[].skills` (nombre exacto de `rosters/skills.json`) y las características modifican `ma/st/ag/pa/av` del jugador.

## Ejemplo de lesión actual

```json
"injuries": [ { "type": "seriousInjury", "matchId": "T6-J04", "missNextGame": true } ]
```

## Ajustes (14-oct)
- Segundas oportunidades: 100.000 mo para todos los equipos. Apotecario: 80.000 mo en las razas que pueden tenerlo, máx. 1. Sobornos: siguen disponibles en el gestor (100.000 mo).
- Mejoras de habilidad: el gestor puede marcarlas como `chosen` (elegida) o `random` (proceso externo); el valor extra es el mismo (tabla primera/siguiente).
- Hoja PDF: se elimina la columna SUB (el sustituto se gestiona en el juego); la columna DRAFT ya marca las habilidades extra.
- Hall of Fame: pendiente.

## Dados (15-oct)
- En cada partido se registran las calaveras y los unos sacados por cada equipo: `statistics.skullsFor/skullsAgainst`, `statistics.onesFor/onesAgainst`. Se acumulan en la ficha del equipo (gestor y visor).
- Hoja PDF: fila FANS = total actual (mín. 1, máx. 5); FANS DEVOTOS = 1 inicial gratis; Médico muestra 80.000; sin «Novatos alborotadores»; columna de casillas calavera / 1 a la derecha de las segundas oportunidades (usa `icons/attacker-down.png`).

## Clasificación (22-oct)
- Se calcula en el visor, no se guarda. `leaguePoints` queda a 0 (el campo «Puntos de liga» se quitó del registro).
- Orden: % victorias ((G + 0,5·E)/PJ) → ≠ → calaverunos → diferencia de TD → SPP ganados.
- ≠ = calaverunos × 0,5 + Dif3 (victorias por ≥3 TD) + A«0» (partidos con 0 TD encajados) + 3H (partidos con ≥3 bajas causadas).
- Calaverunos = skullsFor + onesFor de cada partido (solo los del propio equipo). Pasan los 4 primeros.

## Odio (27-oct)
- Un jugador con «herido grave» puede ganar `Odio (raza)`. La raza sale de la clave de los jugadores rivales a los que se les marcó una herida grave causada en ese partido. Se añade a sus habilidades (no es una mejora, no sube su valor ni cuenta para el draft) y se guarda `hatred` en el evento del partido y en la lesión.

## Tesorería y valor (27-oct)
- Muertos y drafteados restan de la tesorería solo lo que se pagó por el jugador (`price`). Las mejoras suben su valor, pero nunca salen de la tesorería. Ejemplo: jugador de 50.000 con una habilidad (valor 60.000) que es drafteado → la tesorería no cambia y el valor del equipo baja 60.000.
- Visor: cada partido tiene una crónica de solo lectura (`#match=<id>|<pareja>`).

## Hoja PDF (28-oct)
- Las columnas ESP…MVP muestran las estadísticas acumuladas de la liga (vacías si son 0). Las habilidades ganadas en la liga (mejoras y Odio) salen en rojo y negrita.

## PlayOffs (28-oct)
- Jornadas 1–10 (`T6-J01`…) y fase final: semifinal (`round` 11, `T6-SF`) y final (`round` 12, `T6-F`). Los partidos con `round` > 10 no cuentan en la clasificación de la fase regular.
