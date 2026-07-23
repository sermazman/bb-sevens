# Sevens Pitch — Tablero digital de Blood Bowl Sevens

Tablero interactivo para jugar partidas de Blood Bowl Sevens, con conexión en directo entre dos navegadores (sin servidor propio, vía WebRTC/PeerJS).

## Archivos

- `index.html` — estructura de la página.
- `style.css` — estilos visuales.
- `app.js` — toda la lógica del juego y la conexión remota.
- `equipo-ejemplo.json` — plantilla de ejemplo para importar un equipo.

## Cómo subirlo a vuestro repositorio de GitHub

Ya tenéis el repositorio creado, así que solo hace falta subir estos 4 archivos **a la raíz** del repo (no dentro de una subcarpeta), respetando exactamente estos nombres.

### Opción A — desde la web de GitHub (sin usar la terminal)
1. Entra en vuestro repositorio en github.com.
2. Botón **"Add file" → "Upload files"**.
3. Arrastra los 4 archivos (`index.html`, `style.css`, `app.js`, `equipo-ejemplo.json`).
4. Abajo, en "Commit changes", pon un mensaje tipo `Primera versión del tablero` y confirma.

### Opción B — con git en terminal
```bash
git clone <URL-de-tu-repo>
cd <carpeta-del-repo>
# copia aquí los 4 archivos
git add .
git commit -m "Primera versión del tablero"
git push
```

## Activar GitHub Pages

1. En el repositorio, ve a **Settings → Pages**.
2. En "Source", elige **"Deploy from a branch"**.
3. Selecciona la rama `main` (o `master`) y la carpeta `/ (root)`.
4. Guarda. En 1-2 minutos, GitHub te dará una URL tipo:
   `https://tu-usuario.github.io/nombre-del-repo/`
5. Esa es la URL que compartiréis entre los dos para jugar. Ábrela cada vez que queráis echar una partida.

## Cómo jugar en remoto

1. Uno de los dos abre la URL y pulsa **"🌐 Crear sala"** → le aparece un código de 4 caracteres.
2. Se lo pasa al otro (por WhatsApp, Discord, lo que sea).
3. El otro abre la misma URL, escribe el código en la casilla **"Unirse"** y pulsa el botón.
4. En cuanto aparece "✅ Conectado", cualquier movimiento, colocación, tirada de dados o ensayo que haga uno se refleja automáticamente en la pantalla del otro.

**Importante:** ambos tenéis que tener la pestaña abierta a la vez durante la partida — es una conexión directa entre los dos navegadores, no queda nada guardado en un servidor. Si alguien cierra la pestaña o pierde la conexión, hay que crear una sala nueva para reconectar (el estado de la partida en curso se perderá si esto pasa, ya que no hay backend que lo guarde — es la limitación esperada de este enfoque "sin servidor").

## Importar/exportar equipos

Cada equipo tiene botones para cargar (`📁 Cargar JSON`) y guardar (`💾 Guardar JSON`) su plantilla. Usa `equipo-ejemplo.json` como referencia del formato.

## Próximas mejoras posibles

- Guardar el estado de la partida (para poder recuperar si se cae la conexión).
- Validación más estricta de la colocación inicial (mínimo de jugadores en la línea de scrimmage).
- Indicador visual de "el rival está colocando/moviendo ahora mismo".
