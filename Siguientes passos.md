AUTOMATIZAR FALTA
** INICIO:  REALIZADO FECHA:

INCLUIR RESTO DE STAFF EN ROSTERS y APP GENERAL (buscar huecos para Incentivos por el Futuro)
** INICIO:  REALIZADO FECHA:

Añadir e implementar la patada de Inicio de entrada.
** INICIO:  REALIZADO FECHA:

- Sed de Sangre (no se si implementarla de Inicio o más tarde)
Cuando este jugador es activado o se marque la primera casilla para movimiento, tras declarar su acción, debe tirar 106, sumando 1 al dado si ha declarado una acción de Placaje o de Penetración. 
Si el resultado es igual o superior al número que se indica entre paréntesis en la habilidad, se activa de manera normal. En cambio, si el resultado es inferior al número indicado entre paréntesis, o un 1 natural, este jugador se activa de manera normal, puede cambiar su acción declarada por una acción de de Movimiento. Si la acción antes declarada solo puede realizarse una vez por turno (como una Penetración), contará como dicha acción para ese turno. 
Al final de su activación, este jugador puede morder a un compañero Thrall Lineman adyacente, sin importar el estado en el que se encuentre dicho Thrall Lineman (puede estar Tumbado, Distraido, Aturdido, etc...).
Si le muerde, haz una tirada de Heridas por el Thrall Lineman, tratando cualquier resultado de Lesionado como Magullado; esto no causa un cambio de turno a menos que el Thrall Lineman fuese el portador del balón. Si este jugador no muerde a un Thrall Lineman por el motivo que sea, se produce un cambio de turno, este jugador queda Distraído, e inmediatamente deja caer el balón si era el portador. Si estaba en la zona de anotación rival, no anota touchdown. Un jugador que haya fallado esta tirada y quiera realizar una acción de Pase, de Entregar el balón, o anotar touchdown, debe morder a un Thrall Lineman antes de realizar dicha acción o de anotar.
** INICIO:  REALIZADO FECHA:

@@@@@@@@@@@@@@@@@@@ HABILIDADES / RASGOS AUTOMATIZADAS @@@@@@@@@@@@@@@@@@@
- PLACAR
- ESQUIVAR
- ESPRINTAR
- EN PIE DE UN SALTO
- MANOS SEGURAS
- ESTUPIDO / REALMENTE ESTUPIDO / IRA DESCONTROLADA / FEROCIDAD ANIMAL 
- FURIA
¿¿¿ EN PRUEBAS ???
- PROFESIONAL
- CUERNOS
- GOLPE MORTIFERO

- PRÓXIMAS VIABLES: PASAR y ANIMOSIDAD, ATRAPAR, GARRAS, CABEZA DURA, LLAVE DE BRAZO, DEJADA, NERVIOS DE ACERO, ECHARSE A UN LADO, RECEPCIÓN HEROICA

@@@@@@@@@@@@@@@@@@@ EQUIPOS @@@@@@@@@@@@@@@@@@@
 - PDTE PASAR A SHEETS: HALFLING, GOBLIN, SLANN, SNOTLINGS
 - ACTUALIZADO SHEETS: GNOMES
 - PDTE PASAR A GITHUB: GNOMES
 
✅✅✅✅✅✅✅ REALIZADOS ✅✅✅✅✅✅✅

- Confirmamos por favor que el Asegurar balón lo tenemos puesto para realizarlo sólo una vez por turno cuando sea posible, que si lo consigue se termina la activación del jugador, Que si el jugador tiene en su Clave "GRANDULLON" o la habilidad "TEMBLOROSO" no puede realizar esta acción. Con esto creo que dejamos al 100% esta habilidad finalizada.

✅* INICIO:  REALIZADO FECHA: 03-09-2026 confirmado

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

✅* INICIO: 31-08-2026 21h56 REALIZADO FECHA: 02-09-2026

Revisar Furia, que tiene que seguir siempre y no preguntar si quiere hacer movimiento impulso, no se si esta implementada o no. Preguntar antes.
Darle de Furia toda la Habilidad para implementarla

✅* REALIZADO: OK    FECHA: 30-08-2026

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

✅* INICIO: 31-08-2026  REALIZADO FECHA: 31-08-2026

Y el tema que hemos dejado de los colores en el borde de la ficha, tenemos que poner estos de momento buscando en la CLAVE del JUGADOR:
LINEA - Gris
LANZADOR - Blanco
BLITZER - ROJO
DEFENSOR - Verde
RECEPTOR - Amarillo
ESPECIAL - Morado
CORREDOR - Naranja
GRANDULLON - Azul
Journey - (sin color, este no busca el CLAVE DE JUGADOR, lo busca en el tipo de jugador)

✅* INICIO: 31-08-2026  REALIZADO FECHA: 31-08-2026

Luego tenemos que ver algunas activaciones de jugadores con habilidades y Rasgos como Estúpido, Realmente Estúpido, etc... que deben hacer tirada de chequeo al inicio de su activación. 
Te pongo lo que hace cada uno:
- Echar raices
Cuando este jugador sea activado estando En pie, justo tras declarar su acción o marcar la primera casilla para movimiento, tira 106: con 2+, este jugador puede realizar la acción declarada de manera normal.
Con un 1, en cambio, el jugador "Echa raíces" y se queda en la casilla de origen. 
Un jugador que ha Echado raíces no puede realizar acciones de Movimiento en los siguientes turnos, no puede hacer movimientos de impulso tras una acción de Placaje, no puede ser empujado, y no puede abandonar la casilla que ocupa actualmente por ningún otro motivo, salvo que quede Inconsciente o sufra una Lesión.
Este jugador dejará de Echar raíces al final de una entrada o cuando acabe la 1ra parte del partido, o si es Derribado o colocado Tumbado boca arriba. 
¿¿Podriamos marcar esto cuando Echa raíces, coloreando la casilla donde está de Marrón?? que fueran Raices??

- Estúpido
Cuando este jugador sea activado, justo tras haber declarado su acción o marcar la primera casilla para movimiento, debe tirar 1D6. Con 2+, puede realizar la acción declarada de manera normal o moverse a la casilla que había marcado para movimiento. Con un 1, en cambio se queda en la casilla de origen y queda Distraido.

- Ferocidad animal
Cuando este jugador es activado, justo tras declarar su acción o marcar la primera casilla para movimiento, debe tirar 1D6.
Puede aplicar un modificador de +2 a la tirada si ha declarado una acción de Placaje o de Blitz / Penetración. 
Con 4+, este jugador puede realizar la acción declarada de manera normal. Con 1-3, en lugar de eso este jugador ataca a uno de sus compañeros. Elige un compañero que esté En pie y adyacente a este jugador; el jugador elegido es Derribado de inmediato. Esto no provoca un cambio de turno a menos que ese compañero fuese el portador del balón. Si este jugador tiene las habilidades Garras o Golpe mortífero, debe usarlas al hacer la tirada de Armadura contra el jugador Derribado.
Si este jugador saca de 1 a 3 pero no tiene ningún compañero En pie adyacente, queda Distraído.

- Ira descontrolada
Cuando este Jugador sea activado o se marque la primera casilla para movimiento, tras declarar su acción, tira 1D6, aplicando un modificador de +2 a la tirada si ha declarado una acción de Placaje o de Penetración. Con 4+, este jugador puede realizar la acción declarada de manera normal.
Con 1-3, este jugador ruge de forma incoherente, pero no hace nada más. Su activación termina de inmediato.

- Realmente Estúpido
Cuando este jugador es activado o se marque la primera casilla para movimiento, tras declarar su acción, debe tirar 1D6. Puede aplicar un modificador de +2 a la tirada si se encuentra adyacente a algún compañero que esté En pie, no esté Distraído y no tengan a su vez Realmente estupido. Con 4+, este jugador puede realizar su acción declarada de manera normal. Con 1-3, en cambio, este jugador queda Distraido.

Estas activaciones de Rasgos, no pueden ser repetidas por segundas oportunidades.
✅
