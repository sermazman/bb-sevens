# Sevens Pitch — Plan: cuentas, equipos guardados y ligas

Estado: **pendiente**. Se aborda cuando terminemos de meter las habilidades.
Fecha de la idea: 9-nov-2026.

## Objetivo
- Los jugadores entran con su cuenta y tienen equipos guardados en la nube.
- Los equipos se apuntan a ligas. Dentro de la liga quedan **bloqueados**: solo cambian (habilidades, PE, ganancias, niveles...) tras jugar partidos de esa liga contra otros equipos de la misma liga.
- La gestión (subidas, habilidades, etc.) se lleva online, y el comisario decide qué pueden hacer los usuarios.

## Punto de partida
- Liga inicial de unos 10 equipos; luego podría haber varias ligas (tamaño por definir).
- Comisario por ahora: Sergio.
- Se mantiene GitHub Pages + Firebase (sin servidor propio). El plan gratuito de Firebase sobra a este tamaño.
- Ya hecho y que sirve de base: roles local/visitante por sala, bloqueo suave, informe JSON del partido (`registro_partidos`).

## Modelo de datos (Firebase)
- `users/{uid}`: nombre, correo, rol (`jugador` | `comisario`).
- `teams/{teamId}`: dueño (uid), nombre, raza, jugadores, estado (`libre` | `en_liga`). El equipo libre lo edita su dueño sin restricción.
- `leagues/{leagueId}`: nombre, comisario, estado (`inscripción` | `en curso` | `terminada`), reglas permitidas, equipos inscritos.
- `leagues/{leagueId}/teams/{teamId}`: copia del equipo dentro de la liga. Aquí viven los campos bloqueados: nivel, PE, habilidades ganadas, tesorería, heridas permanentes.
- `leagues/{leagueId}/matches/{matchId}`: local, visitante, jornada, informe de cada jugador, estado (`pendiente` | `confirmado` | `en revisión`).

## Cómo funciona el bloqueo
- Al apuntarse a una liga, el equipo se copia a `leagues/.../teams`; el equipo libre sigue editable, el de la liga no.
- Las reglas de seguridad de Firebase solo dejan a cada jugador escribir en su equipo libre y en el informe de sus propios partidos.
- PE, niveles y habilidades se aplican solo tras un partido **confirmado por los dos jugadores**, o por orden del comisario.

## Partido de liga
1. Los dos entran a la sala con su cuenta; la app comprueba que sus equipos están en la misma liga y que el partido está en el calendario.
2. Al terminar, cada jugador envía su informe. Si coinciden, queda confirmado; si no, pasa a "en revisión" y decide el comisario.

## Límite conocido
La app corre en el navegador de cada jugador, así que no se puede impedir al 100% que alguien manipule su copia. Se mitiga con la confirmación doble y las reglas de Firebase. Suficiente para una liga entre conocidos. Si fuera pública y competitiva, haría falta un servidor (Cloud Functions) que valide los partidos.

## Fases (de menos a más riesgo)
1. Inicio de sesión + "mis equipos" guardados en la nube (útil por sí solo; sustituye al botón de cargar JSON).
2. Crear liga, inscribir equipos y bloquearlos, con panel de comisario.
3. Calendario de partidos y confirmación doble.
4. Gestión posterior al partido: PE, niveles y habilidades (empezar por lo mínimo). Es la parte más laboriosa (tesorería, fichajes, clasificación).
5. Panel de permisos: el comisario activa o desactiva qué puede hacer cada usuario.

## Decisiones pendientes
- Inicio de sesión: correo y contraseña, o Google (más cómodo, sin contraseñas olvidadas).
- Inscripción: abierta con un código de liga, o solo por invitación al correo.
- Número real de equipos y de ligas.

## Lo que tiene que hacer Sergio (no lo puede hacer Claude)
- Crear el proyecto en la consola de Firebase y activar el método de inicio de sesión (se guía paso a paso cuando llegue el momento).
