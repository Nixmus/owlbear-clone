# Roadmap — pendientes

Lista viva de lo que falta por hacer. Se va actualizando.

## En curso / siguiente tanda

### Personajes en la mesa
- [ ] **Palabra clave por personaje**: en la ficha, un campo "palabra clave". Al escribir
      `Ale: hola` en el chat, se muestra como si hablara el personaje (`Alejandro: hola`).
- [ ] **Fotos de personaje visibles**: poder ver el retrato en la ficha, el chat y el token.
- [ ] **Burbujas de texto sobre tokens**: cuando un personaje habla, aparece una burbuja
      sobre su token en el mapa durante unos segundos.
- [ ] **Chat ampliable**: botón para agrandar/reducir la ventana de chat (a veces se queda
      pequeño e incómodo).

### Tokens ↔ Fichas de personaje (vínculo bidireccional)
- [ ] **Vincular token a una ficha**: al crear/editar un token, poder asociarlo a un
      personaje de la campaña.
- [ ] **Sincronización mutua**: la info de la ficha (nombre, foto/retrato, PG, etc.) se
      refleja en el token, y los cambios del token se reflejan en la ficha.
- [ ] **Log automático del personaje**: lo que le ocurre al PJ durante la partida (cambios
      de PG, condiciones aplicadas, muertes, subidas de nivel) queda registrado en la ficha
      como un historial cronológico.
- [ ] **Extraer información del token**: desde el token poder "pasar" datos a la ficha
      (p. ej. condiciones activas, notas del DM) y viceversa.

## Seguridad (autenticación)
- [ ] Subir parámetros de scrypt (N, memoria) por encima de los *defaults*.
- [ ] Exigir contraseña mínima de 8 caracteres (ahora 6).
- [ ] **Rate limiting** en login, registro y recuperación (anti fuerza bruta).

## Ya implementado (referencia)
- Interfaz móvil responsive (barra de herramientas inferior).
- Borrador de dibujos.
- Color del trazo solo GM.
- Jugadores sin gestión de escenas (UI + servidor).
- Chat sin duplicados.
- Roles correctos (dueño de campaña = GM; invitado = jugador; el servidor asigna el rol).
- Gestión de jugadores por el GM.
- Recuperación de contraseña + CLI `node users.js` (listar / borrar / resetear usuarios).
- Botón home y navegación del hub.
- Niebla transparente para GM ("ver bajo la niebla").
- Vista previa de escena para el GM sin activarla.
- Rueda de señales/enfoque (ping) con cooldown, estilo LoL.
- Unirse a campaña por código de partida.
- Pestaña global de Personajes con filtros (propios/ajenos, tipo, campaña).
