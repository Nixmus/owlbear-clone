# Alternativa temporal — GitHub Codespaces (sin cuenta nueva)

Despliegue **temporal** para jugar ya, mientras Oracle te asigna la VM.
Usa tu **cuenta de GitHub** (no creas nada nuevo). La app corre en la nube y te
da una **URL HTTPS pública** donde el WebSocket funciona.

> ⚠️ No es 24/7: el Codespace **se apaga por inactividad** (por defecto a los
> 30 min, aunque puedes ampliarlo). Perfecto para una sesión de partida;
> cuando lo cierras, se para. Tus datos (BD + imágenes) viven en el Codespace y
> **se pierden al borrarlo** — si quieres conservarlos, usa el backup de abajo.

> 💰 Cuota gratuita: GitHub da **60 h/mes gratis** de Codespaces (120 h en Pro).
> Con eso te sobra para varias partidas.

---

## 1. Subir el repo a GitHub

Si aún no lo hiciste:
```powershell
cd D:\archivos\Codigo\owlbear-clone
git remote add origin https://github.com/Nixmus/owlbear-clone.git
git push -u origin main
```
(El devcontainer ya está incluido en el repo.)

## 2. Abrir el Codespace

1. En GitHub, entra en tu repo `owlbear-clone`.
2. Botón verde **Code → Codespaces → Create codespace on main**.
3. Espera: instalará dependencias y **compilará el cliente** solo (1-2 min).

## 3. Arrancar el servidor

El arranque es automático al abrir. Si no, en la terminal integrada:
```bash
node server/index.js
```

## 4. Hacer público el puerto y obtener la URL

1. Abre la pestaña **Ports** (junto a Terminal).
2. Busca el puerto **4000** → clic derecho → **Port Visibility → Public**.
3. Copia la **Forwarded Address** (URL `https://...app.github.dev`).

> Esa es tu URL para tus amigos. El WebSocket va al mismo host, así que
> funciona directamente.

## 5. Usar

Abre **`https://<tu-codespace>-4000.app.github.dev`** → crea cuenta → campaña →
**Enter table**. Comparte el enlace.

---

## Detalles importantes

- **Mantén el Codespace activo:** por defecto se para a los 30 min de
  inactividad (no de que la web no tenga visitas, sino de que tú no tocas el
  editor). Entra en GitHub → **Settings → Codespaces → Idle timeout** y
  súbelo (hasta 240 min) para sesiones largas.
- **Al reabrir:** Codespaces → tu codespace → el script de arranque vuelve a
  lanzar el server. El puerto sigue público si ya lo configuraste.
- **Cerrar cuando acabes:** para no gastar cuota, **stop** el Codespace desde
  GitHub (**Code → Codespaces → … → Stop**). Se puede reactivar luego.
- **Dominio propio:** no hace falta. Si quieres, en el `Caddyfile` no toques
  nada; aquí no se usa Caddy (GitHub ya da HTTPS).

## Copia de seguridad (si quieres conservar partidas)

```bash
# Dentro del Codespace
tar czf /tmp/owlbear-data.tar.gz -C server/data .
# Descárgalo con clic derecho en el archivo desde el explorador de VS Code.
```

Y para restaurar en otro sitio, subes ese `owlbear-data.tar.gz` y lo descomprimes
en `server/data/`.

---

## Cuándo pasar a producción

Cuando Oracle te asigne la VM (el bucle sigue corriendo), simplemente despliega
allí con `QUICKSTART-ORACLE.md`. Codespaces queda como plan B para emergencias.
