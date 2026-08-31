Revisar Furia, que tiene que seguir siempre y no preguntar si quiere hacer movimiento impulso, no se si esta implementada o no. Preguntar antes.
Darle de Furia toda la Habilidad para implementarla

** REALIZADO: OK    FECHA: 30-08-2026

Vamos con otro actualización para dejar muy fino la ruleta que nos encanta como se gestiona ahora y nos ha abierto la mente a otras mejoras para poder actualizar.

Tenemos que crear la Ruleta "tumbados" para que salga en los jugadores que están tumbados, por que?, por que El solo levantarse ya implica movimiento y para los Rasgos que hemos programado, solo esto de levantarse ya tiene que Activar el rasgo y hacer su chequeo. En estos rasgos que hemos programado si se decide levantarse tiene que pasar el chequeo de su Rasgo.

Por ello, la "Ruleta de Tumbados" (te lo dire así para diferenciarlo de la "Ruleta" base) debe tener estas opciones:
- Levantar/Fin - consume 3 de movimiento al levantarse por lo que se debe activar el Jugador (chequeo de activación por Rasgo si lo tiene)
- Levantar/Mover - Consume 3 de movimiento al levantarse y luego con lo que le queda de MA puede mover hasta ponerse adyacente a un jugador (siguiendo normas de movimiento base, esquivas, etc...)
- Levantar/Blitz - Consume 3 de movimiento al levantarse y luego con lo que le queda de MA puede mover (siguiendo normas de movimiento base, esquivas, etc...) y hacer Blitz como ya tenemos programado
- Levantar/Asegurar Balon - Consume 3 de movimiento al levantarse y luego con lo que le queda de MA puede mover (siguiendo normas de movimiento base, esquivas, etc...) hasta Asegurar el balón como tenemos programado - Esta opción solo debe salir si cumple la regla de Asegurar el balón que hemos programado.
- Levantar/Falta - Consume 3 de movimiento al levantarse y luego con lo que le queda de MA puede mover hasta ponerse adyacente a un jugador (siguiendo normas de movimiento base, esquivas, etc...) para hacer falta (no programado aun).
- En pie de un salto (esta habilidad solo debe salir en esta ruleta cuando el jugador tenga esta habilidad, y hace lo que tenemos programado que funciona bien)

Si hubiera que cambiar algo en esta ruleta la llamaremos "Ruleta de Tumbados" y la otra la general solo "Ruleta" o "Ruleta Base".
** INICIO:  REALIZADO FECHA:

Confirmamos por favor que el Asegurar balón lo tenemos puesto para realizarlo sólo una vez por turno cuando sea posible, que si lo consigue se termina la activación del jugador, Que si el jugador tiene en su Clave "GRANDULLON" o la habilidad "TEMBLOROSO" no puede realizar esta acción. Con esto creo que dejamos al 100% esta habilidad finalizada.
** INICIO:  REALIZADO FECHA:

Y esta actualización de los botones manuales que tenemos abajo, hay que crear / actualizar los que te menciono y a parte su funcionamiento es mejor que sea: 1º pulsamos el Boton y 2º se elige al jugador para que haga la accion que el botón le hemos puesto:
Nuevos botones
- LEVANTAR - Pone al jugador el pie y sin activar aún
- TUMBAR - Pone al jugador Tumbado (sin hacer tiradas de Armaduras ni nada, solo marcar al Jugador como TUMBADO)
- ATURDIR - Pone al jugador aturdido (sin hacer tiradas de Armaduras ni nada, solo marcar al Jugador como ATURDIDO)
- DISTRAIDO - Pone al jugador Distraido
- INCONSCIENTE - Poner al jugador Inconsciente y ponerlo en el Banquillo de las bajas
- HL - Pone al jugador Herido Leve y ponerlo en el Banquillo de las bajas
- HG - Pone al jugador Herido Grave y ponerlo en el Banquillo de las bajas
- MUERTO - Pone al jugador Muerto y ponerlo en el Banquillo de las bajas

** INICIO:  REALIZADO FECHA:


Colores por Clave o Posición:
LINEA - Gris
LANZADOR - Blanco
BLITZER - ROJO
DEFENSOR - Verde
RECEPTOR - Amarillo
ESPECIAL - Morado
CORREDOR - Naranja
GRANDULLON - Azul
Journeyman - (sin color)

** INICIO:  REALIZADO FECHA:
