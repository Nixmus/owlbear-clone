# Despliegue en un servidor en línea

Guía para tener la app **siempre encendida** y compartible con tus amigos.

> ⚠️ **GitHub Pages no sirve para esto.** Solo aloja archivos estáticos y no
> puede ejecutar el backend (Node + WebSocket + base de datos). GitHub sirve
> para *guardar* el código, no para *correr* la app. Abajo tienes las opciones
> que sí funcionan.

La app ya está lista para producción: un contenedor Docker sirve el frontend,
la API y el WebSocket desde el mismo puerto, con SQLite e imágenes en un
volumen persistente.

---

## Opción A — Oracle Cloud "Always Free" (0€, siempre activo) ⭐

La mejor opción totalmente gratis sin que se duerma. Te dan una VM ARM con
hasta 4 CPU / 24 GB RAM siempre gratis.

> ⚠️ **Si Oracle te da error "Out of host capacity"** al crear la VM ARM: no es
> culpa tuya, es que no hay hueco en esa región. Prueba otra región (p. ej.
> `eu-madrid-1`, `us-ashburn-1`), reintenta en distintos horarios, o crea una VM
> **AMD** (`VM.Standard.E2.1.Micro`, también Always Free) en vez de ARM. Si te
> cansa, ve directo a la VM gratuita de Azure (12 meses) o a un VPS de ~4€.

### 1. Crear la VM
1. Crea cuenta en <https://www.oracle.com/cloud/free/>.
2. **Compute → Instances → Create instance**.
3. Imagen: **Ubuntu 22.04**. Shape: **VM.Standard.A1.Flex** (ARM, Always Free).
4. Descarga la clave SSH y crea la instancia.
5. En **Networking → Security Lists / NSG**, abre los puertos **80** y **443**
   (entrada TCP desde `0.0.0.0/0`).

### 2. Instalar Docker y subir el proyecto
```bash
ssh ubuntu@<IP-PUBLICA>
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker

git clone <URL-DE-TU-REPO> owlbear && cd owlbear
cp .env.example .env
nano .env       # cambia JWT_SECRET por algo largo y aleatorio
```

### 3. Elegir "dominio" gratis
No tienes dominio propio, así que usa uno gratis de **DuckDNS**:
1. Entra en <https://www.duckdns.org>, crea una cuenta y un subdominio
   (p. ej. `miowlbear`).
2. En tu panel DuckDNS, apunta ese subdominio a la **IP pública** de la VM.
3. Edita `Caddyfile` y pon tu subdominio:
   ```
   miowlbear.duckdns.org {
       reverse_proxy owlbear:4000
   }
   ```
   (Alternativa sin registrarse: usa `sslip.io` → `<IP-CON-GUIONES>.sslip.io`.)

### 4. Arrancar
```bash
docker compose up -d --build
```
Caddy consigue el certificado HTTPS automáticamente. En 1-2 minutos la app
estará en **https://miowlbear.duckdns.org**. Comparte ese enlace con tus amigos.

### 5. Actualizar más adelante
```bash
git pull && docker compose up -d --build
```

---

## Opción B — VPS barato (4-6€/mes, la más estable)

Igual que la Opción A pero en Hetzner / Contabo / DigitalOcean. Los pasos 2-4
son idénticos. Recomendado si el "Always Free" de Oracle te da problemas de
disponibilidad de capacidad ARM.

- **Hetzner CX22** (~4€/mes) o **Contabo VPS S** (~5€/mes).
- Apunta un subdominio DuckDNS a la IP y usa el mismo `Caddyfile`.

---

## Opción C — Plataforma gestionada (despliegue desde GitHub)

Estas plataformas **sí ejecutan el backend** y tienen HTTPS automático. La
pega: el nivel gratis se duerme o no da disco persistente.

**Render**
1. Sube el proyecto a GitHub.
2. Render → **New → Web Service → Build from repository**.
3. Runtime **Docker** (detecta el `Dockerfile` automáticamente).
4. Añade un **Disk** montado en `/app/data` (necesario para no perder datos).
5. Variable de entorno `JWT_SECRET`.
   > El plan pago (~7$/mes) evita el "sleep" y permite disco. El free se
   > duerme a los 15 min y **borra el disco**.

**Fly.io** (algo más técnico, HTTPS y volúmenes incluidos):
```bash
fly launch --no-deploy
fly volumes create owlbear_data --size 1
# añade [mounts] source="owlbear_data" destination="/app/data" en fly.toml
fly deploy
```

**Railway / Koyeb**: conecta el repo, despliega con Docker, añade un volumen en
`/app/data` y define `JWT_SECRET`.

---

## Opción D — Frontend en GitHub Pages + backend externo

Posible, pero **no recomendado** para un VTT: GitHub Pages sirve el frontend
gratis, pero necesitas igualmente un backend 24/7 (Render/Fly/VPS) y configurar
CORS. Ahorra poco y complica.

Si aun así quieres intentarlo:
1. Construye el cliente apuntando al backend:
   ```bash
   cd client
   VITE_API_URL="https://tu-backend.example.com" \
   VITE_WS_URL="wss://tu-backend.example.com" \
   npm run build
   ```
   (`VITE_API_URL` sin `/api` al final; el cliente lo añade.)
2. Publica `client/dist` en GitHub Pages.
3. En el backend, define `CORS_ORIGIN` con la URL de Pages.

---

## Resumen de variables

| Variable | Ejemplo | Para qué |
| --- | --- | --- |
| `JWT_SECRET` | cadena larga aleatoria | **Obligatorio** cambiar en producción |
| `PORT` | `4000` | Puerto interno (Caddy hace el proxy) |
| `VITE_API_URL` | `https://api.midominio.com` | Solo si separas frontend/backend |
| `VITE_WS_URL` | `wss://api.midominio.com` | Solo si separas frontend/backend |

## Checklist antes de compartir el enlace

- [ ] `JWT_SECRET` cambiado (no el valor por defecto).
- [ ] El volumen `/app/data` está montado y persiste (SQLite + imágenes).
- [ ] Entra por **https://** (no http) — si no, el WebSocket será bloqueado.
- [ ] Puertos 80 y 443 abiertos en el firewall del proveedor.
- [ ] Probado desde el móvil/otra red: crear cuenta, campaña y entrar a la mesa.

## Copias de seguridad

Todo lo importante vive en `/app/data` (base de datos + subidas):

```bash
docker run --rm -v owlbear-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/owlbear-$(date +%F).tar.gz -C /data .
```
