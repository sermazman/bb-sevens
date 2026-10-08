# Sección `league` (schemaVersion 2) — Temporada 6

La parte superior del JSON (teamName, race, color, textColor, staff, players, formation) es la de rosters.html y NO se toca.
Todo lo de liga vive dentro de `league`. Los jugadores se enlazan por `num`.

## Qué se guarda y qué se calcula

| Se guarda | Se calcula en el gestor |
|---|---|
| Tesorería inicial, ganancias y gasto de cada partido | Tesorería actual |
| Eventos de jugador por partido | Estadísticas de carrera y SPP totales |
| Mejoras elegidas (categoría, aleatoria/elegida, orden) | Coste en SPP de cada mejora y SPP sin gastar |
| Heridas leves, graves y muertos por separado | Total de heridas (HER = HL + HG + RIP) |
| Resultado de cada partido | Victorias/empates/derrotas, TD a favor/en contra, puntos de liga |
| Precio base de cada jugador | Coste y valor del equipo |

## Fórmulas (idénticas al Excel)

- SPP totales = ESP + CP + TD×3 + DES + INT×2 + HL×2 + HG×2 + RIP×2 + MVP×4
- SPP sin gastar = SPP totales − SPP gastados en mejoras
- Coste SPP de una mejora (según su orden 1ª–6ª): 1ª = 3/6 (primaria aleatoria/elegida), 6/12 (secundaria), 18 (característica); 6ª = 15/30, 30/40, 50.
- Precio del jugador = precio base + valor extra de sus mejoras
- Coste del equipo = precios de jugadores + repeticiones + personal (fans extra a 20.000, médico, animadoras, ayudantes, sobornos)
- Valor del equipo = personal + valor de los jugadores (un jugador que se pierde el próximo partido no cuenta)
- Tesorería = inicial + Σ ganancias − Σ tesorería gastada − coste del equipo + valor extra de mejoras − precio de los muertos
- "Tesorería gastada" de cada partido es SOLO el gasto manual en incentivos (no son compras de roster).

## Estado del jugador

- `active`: puede jugar.
- `missNextGame`: herido grave; vuelve a `active` al registrar el siguiente partido.
- Muerto: sale de `players` y se mueve a `retiredPlayers` con atributos, habilidades, progresión y estadísticas del momento.
- Herido leve e inconsciente: no impiden jugar (solo cuentan HL como estadística).
- Expulsados: solo estadística del partido/equipo; no afectan a la disponibilidad.

## Ejemplo de partido

```json
{
  "id": "T6-J01",
  "round": 1,
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
  "notes": ""
}
```

Los TD del equipo salen de `result` (marcador); no se duplican.

## Ejemplo de mejora

```json
{ "category": "primary", "selection": "chosen", "order": 1, "skill": "Placar" }
{ "category": "stat", "selection": "chosen", "order": 2, "attribute": "st", "amount": 1 }
```
`category`: `primary` | `secondary` | `stat`. `selection`: `chosen` | `random`.

## Ejemplo de lesión actual

```json
"injuries": [ { "type": "seriousInjury", "matchId": "T6-J04", "missNextGame": true } ]
```
