# Quickstart — Google Cloud (Always Free e2-micro)

Lista paso a paso para dejar la app online, siempre activa, con HTTPS gratis.
Sustituye lo que va entre `<...>` por tus datos.

> **Por qué GCP:** la VM **e2-micro** está en el *Always Free* de Google **sin
> caducidad** (1 vCPU, 1 GB RAM, 30 GB disco) en las regiones
> `us-central1`, `us-west1` o `us-east1`. Mucha más disponibilidad que la ARM
> de Oracle.
>
> ⚠️ **Aviso de tráfico:** el Always Free incluye **1 GB/mes de salida** hacia
> internet. Tu app sirve mapas/imágenes, así que un uso intenso podría pasarse;
> a partir de ahí se cobra ~0,12 $/GB (unos céntimos). Para un grupo pequeño es
> irrelevante, pero tenlo en el radar. Puedes poner un presupuesto con alerta
> (FASE 5).

---

## FASE 1 — Cuenta y proyecto

1. Entra en <https://console.cloud.google.com> e inicia sesión con tu cuenta de
   Google. Acepta los términos (pide tarjeta para verificar, pero el free tier
   **no se cobra**).
2. Crea un proyecto: arriba, **Select a project → New project** → nombre
   `owlbear` → **Create**. Espera y selecciónalo.

---

## FASE 2 — Crear la VM e2-micro

1. Menú ☰ → **Compute Engine → VM instances** → **Create instance**.
2. **Name:** `owlbear`.
3. **Region / Zone:** elige una de las **gratis**:
   - `us-central1` (Iowa) — *recomendada*, suele tener buena latencia.
   - o `us-west1`, o `us-east1`.
   - Zone: la que proponga (p. ej. `us-central1-a`).
4. **Machine configuration:**
   - Series: **E2**.
   - Machine type: **e2-micro** (debe aparecer la etiqueta de free tier).
5. **Boot disk → Change:**
   - Operating system: **Ubuntu**.
   - Version: **Ubuntu 22.04 LTS**.
   - Boot disk type: **Standard persistent disk** (⚠️ **no** Balanced/SSD, que
     se cobra).
   - Size: **30 GB** (⚠️ el máximo del free tier es 30 GB).
6. **Firewall:** marca **Allow HTTP traffic** y **Allow HTTPS traffic** ✅
   (abre los puertos 80 y 443; es lo que necesitamos para Caddy).
7. **Advanced options** (opcional, recomendado): en **Networking → Network
   interfaces**, comprueba que tiene **External IPv4 address (ephemeral)**.
8. **Create**. En ~1 minuto la VM estará **Running**.

---

## FASE 3 — Reservar una IP estática (evita que cambie)

Por defecto la IP es *ephemeral* y puede cambiar si reinicias. Vamos a fijarla.

1. ☰ → **VPC network → IP addresses**.
2. En la IP externa de tu VM, cámbiala a **Static** (botón **Reserve** / tipo
   *Static*), nómbrala `owlbear-ip`.
3. Copia la **IP**. Un **static IP adjunta a una VM encendida es gratis**.

---

## FASE 4 — Desplegar la app

### 4.1 Conéctate por SSH (sin claves, desde el navegador)
En **Compute Engine → VM instances**, pulsa el botón **SSH** de tu VM. Se abre
una terminal en el navegador. (Alternativa: Cloud Shell → `gcloud compute ssh
owlbear`.)

### 4.2 Instala Docker y Git
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

### 4.3 Añade swap (⚠️ imprescindible con 1 GB de RAM)
Sin swap, el build de Docker se quedará sin memoria:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # debe mostrar la swap activa
```

### 4.4 Clona y configura
```bash
git clone https://github.com/TU-USUARIO/owlbear-clone.git owlbear
cd owlbear
cp .env.example .env
nano .env
```
En `.env`, cambia `JWT_SECRET` por una cadena larga y aleatoria
(genera una con: `openssl rand -hex 32`). Guarda con `Ctrl+O`, `Enter`,
`Ctrl+X`.

### 4.5 Dominio gratis (DuckDNS) y Caddy
1. Ve a <https://www.duckdns.org>, crea cuenta y un subdominio, p. ej.
   `miowlbear`.
2. Apúntalo a la **IP estática** de tu VM y pulsa *update ip*.
3. Edita el dominio de Caddy:
   ```bash
   nano Caddyfile
   ```
   Deja solo:
   ```
   miowlbear.duckdns.org {
       reverse_proxy owlbear:4000
   }
   ```

### 4.6 Arranca
```bash
docker compose up -d --build
docker compose logs -f caddy     # debe obtener el certificado HTTPS
```
La primera vez tarda unos minutos. Sal del log con `Ctrl+C`.

---

## FASE 5 — Probar y proteger costes

1. Abre **`https://miowlbear.duckdns.org`** → crea cuenta → campaña →
   **Enter table**. Comparte el enlace con tus amigos.
   > Obligatorio entrar por **`https://`**; por `http://` el navegador bloquea
   > el WebSocket de la mesa.
2. **Alerta de presupuesto:** ☰ → **Billing → Budgets & alerts → Create
   budget** → importe **1 USD**, alertas por email al 50%, 90% y 100%. Así te
   avisan si algún mes te pasas del 1 GB de salida gratis.

---

## Comandos útiles del día a día

```bash
cd ~/owlbear

docker compose ps
docker compose logs -f owlbear
docker compose restart

# Actualizar a la última versión del repo
git pull && docker compose up -d --build

docker compose down
docker compose up -d

# Copia de seguridad (BD + imágenes)
docker run --rm -v owlbear_owlbear-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/owlbear-$(date +%F).tar.gz -C /data .
```
(Los nombres de volumen pueden variar; compruébalos con `docker volume ls`.)

---

## Si algo no carga

1. **La web no abre** → revisa en **VPC network → Firewall** que existan las
   reglas `default-allow-http` y `default-allow-https`, y que la VM tenga las
   **network tags** `http-server` y `https-server` (se añaden solas al marcar
   los checkboxes de firewall al crear la VM).
2. **Caddy no saca certificado** → el dominio DuckDNS debe apuntar a la IP
   estática; espera 1-2 min; revisa `docker compose logs caddy`.
3. **La mesa queda en "connecting"** → asegúrate de usar `https://`.
4. **Se pierde todo al recrear el contenedor** → comprueba el volumen
   (`docker volume ls`); el `docker-compose.yml` ya monta `/app/data`.

---

## Alternativa por CLI (opcional)

Si prefieres crear la VM con `gcloud` (desde Cloud Shell):

```bash
gcloud compute instances create owlbear \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --tags=http-server,https-server
```
Y reservar la IP estática:
```bash
gcloud compute addresses create owlbear-ip --region=us-central1
```
