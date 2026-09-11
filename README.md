# Sevens Pitch — Tablero digital de Blood Bowl Sevens
Tablero interactivo para jugar partidas de Blood Bowl Sevens, con conexión en directo entre dos navegadores (sin servidor propio, vía WebRTC/PeerJS).

## Cómo jugar en remoto
1. Uno de los dos abre la URL y pulsa **"🌐 Crear sala"** → le aparece un código de 4 caracteres.
2. Se lo pasa al otro (por WhatsApp, Discord, lo que sea).
3. El otro abre la misma URL, escribe el código en la casilla **"Unirse"** y pulsa el botón.
4. En cuanto aparece "✅ Conectado", cualquier movimiento, colocación, tirada de dados o ensayo que haga uno se refleja automáticamente en la pantalla del otro.

**Importante:** ambos tenéis que tener la pestaña abierta a la vez durante la partida — es una conexión directa entre los dos navegadores, no queda nada guardado en un servidor. Si alguien cierra la pestaña o pierde la conexión, hay que crear una sala nueva para reconectar o si uno de los dos tienen la ventana abierta GUARDAR la partida para seguir con ella (el estado de la partida en curso se perderá si esto pasa, ya que no hay backend que lo guarde — es la limitación esperada de este enfoque "sin servidor").

## Importar/exportar equipos
Cada equipo tiene botones para cargar (`📁 Cargar EQUIPO`) y guardar (`💾 Guardar EQUIPO`) su plantilla.

## Vocabulario del juego
Bocadillo / modal = la ventana emergente que tapa la pantalla (PLACAJE, TOUCHDOWN, etc.)
Panel = las cajas fijas siempre visibles en la interfaz (Dado de bloqueo, Jugador seleccionado, etc.)

## Imagen para campo de juego
Las medidas exactas que necesitaría, dado cómo está montado el tablero ahora mismo (20 columnas × 11 filas, casillas de 34px + 1px de separación):

Base: 699 × 384 px
Recomendado (para que se vea nítido en pantallas de alta resolución, el doble): 1398 × 768 px — redondeando, 1400 × 770 px va perfecto.
Formato: JPG está bien si es solo textura/césped (pesa menos); PNG si necesitáis transparencia en algún borde.


## Todo lo relacionado con Games Workshop, Blood Bowl y Warhammer son trademarks de Games Workshop Limited. Estan siendo usadas sin permiso. 
Esta web es totalmente NO OFICIAL y no tiene nada que ver con Games Workshop. Es trabajo de Fans del juego.
