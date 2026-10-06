# Despliegue en Microsoft Azure

**Sí, es totalmente posible.** La app es un contenedor que sirve frontend + API +
WebSocket, así que encaja en varias piezas de Azure. Lo importante es elegir las
correctas, porque algunas no valen:

## ¿Merece la pena la VM gratuita de Azure?

Sí, si Oracle te da errores. Cómo funciona la gratuidad:

- **Azure free account / Azure for Students**: incluye **750 horas/mes de una VM
  B1s (Linux)** + 64 GB de disco gestionado, **gratis durante 12 meses**.
  Azure for Students no pide tarjeta y añade 100$ de crédito al año.
- **Ojo**: pasados los 12 meses, la misma B1s pasa a costar **~8-10€/mes**. No es
  "always free" como Oracle.
- Solo se incluye **una** VM B1s. Si creas otra o subes de tamaño, se cobra.

Es la opción más sencilla para empezar hoy sin pelearse con Oracle. Tienes los
pasos completos más abajo (sección "Opción rápida — Azure free VM").

| Servicio Azure | ¿Sirve? | Por qué |
| --- | --- | --- |
| **Azure free VM (B1s)** | ✅ | Gratis 12 meses; Docker + HTTPS con Caddy. Fácil. |
| **Azure Static Web Apps** | ❌ | Solo estáticos; no ejecuta Node/WebSocket ni BD. |
| **Azure Container Apps** | ✅ | Docker + HTTPS + WebSocket + volúmenes. Pago por uso. |
| **Azure App Service (Container)** | ✅ | Docker gestionado, HTTPS y WebSocket (`WEBSITES_PORT`). Más caro. |
| **Azure Database for PostgreSQL** | ➕ opcional | Solo si cambias SQLite por Postgres. |

Para HTTPS y WebSocket ya no necesitas Caddy: Azure termina el TLS y enruta el
WebSocket. En el contenedor la app escucha en `PORT` (por defecto 4000).

---

## Opción rápida — Azure free VM (B1s, gratis 12 meses) ⭐

La vía más simple si Oracle te falla. Una VM Ubuntu + Docker + Caddy.

### 1. Crear la VM desde el portal
1. <https://portal.azure.com> → **Create a resource → Virtual machine**.
2. **Image**: Ubuntu Server 22.04 LTS. **Size**: `Standard_B1s` (la del plan free).
   - Si usas Azure for Students: tamaño `Standard_B1s`, discos Standard HDD.
3. Autenticación: clave pública SSH (o contraseña). Abre el puerto **22**.
4. **Disks**: deja Standard SSD/HDD (el free cubre 64 GB).
5. **Review + create** → Create. Espera a que termine y apunta la **IP pública**.

> Con la CLI sería:
> ```bash
> az group create --name owlbear-rg --location eastus
> az vm create --resource-group owlbear-rg --name owlbear-vm \
>   --image Ubuntu2204 --size Standard_B1s \
>   --admin-username azureuser --generate-ssh-keys
> az vm open-port -g owlbear-rg -n owlbear-vm --port 80
> az vm open-port -g owlbear-rg -n owlbear-vm --port 443
> ```

### 2. Abrir los puertos 80 y 443
En **Networking → Network settings → Add inbound port rule**, añade **80** y
**443** (origen `Any`). El 22 ya está abierto para SSH.

### 3. Conectar e instalar Docker
```bash
ssh azureuser@<IP-PUBLICA>

# La B1s tiene solo 1 GB de RAM: añade swap o el build de Docker fallará.
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

### 4. Subir y arrancar la app
```bash
git clone <URL-DE-TU-REPO> owlbear && cd owlbear
cp .env.example .env && nano .env      # cambia JWT_SECRET
# Edita Caddyfile con tu subdominio DuckDNS (o tu dominio), p. ej.:
#   miowlbear.duckdns.org { reverse_proxy owlbear:4000 }
docker compose up -d --build
```
(Antes, crea el subdominio en <https://www.duckdns.org> apuntando a la IP
pública de la VM. Alternativa sin registro: `<IP-CON-GUIONES>.sslip.io`.)

### 5. Listo
En 1-2 min, `https://miowlbear.duckdns.org` con HTTPS automático. Comparte ese
enlace con tus amigos.

> 💡 Si el build se queda sin memoria con 1 GB, con 2 GB de swap suele bastar.
> Alternativa: construye la imagen en tu PC (`docker build -t owlbear-clone .`)
> y súbela al registro, o sube a B1ms (2 GB) si el crédito lo permite.

---

## Opción recomendada — Azure Container Apps

### 0. Requisitos
- Cuenta Azure (hay crédito gratis).
- **Azure CLI** instalada: <https://learn.microsoft.com/cli/azure/install-azure-cli>
- Docker (para construir la imagen) o usa ACR Build (sin Docker local).

### 1. Iniciar sesión y crear el grupo de recursos
```bash
az login
az group create --name owlbear-rg --location eastus
```

### 2. Construir y subir la imagen a Azure Container Registry (ACR)
```bash
az acr create --resource-group owlbear-rg --name owlbearacr --sku Basic
az acr login --name owlbearacr

# Construye en la nube (no necesitas Docker local):
az acr build --registry owlbearacr --image owlbear-clone:latest .
```

### 3. Crear el entorno de Container Apps
```bash
az containerapp env create \
  --name owlbear-env \
  --resource-group owlbear-rg \
  --location eastus
```

### 4. Desplegar la app
```bash
az containerapp create \
  --name owlbear \
  --resource-group owlbear-rg \
  --environment owlbear-env \
  --image owlbearacr.azurecr.io/owlbear-clone:latest \
  --registry-server owlbearacr.azurecr.io \
  --target-port 4000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 0.5 --memory 1.0Gi \
  --env-vars JWT_SECRET="cambia-esto-por-algo-largo-y-aleatorio" PORT=4000 NODE_ENV=production
```

Notas:
- `--ingress external` da una **URL HTTPS pública** automática (termina el TLS y
  soporta WebSocket). No hace falta Caddy ni dominio.
- `--min-replicas 1 --max-replicas 1` mantiene **una sola instancia siempre
  activa** (importante: el estado de las salas vive en memoria; con varias
  réplicas se desincronizarían sin Redis).

### 5. Obtener la URL
```bash
az containerapp show --name owlbear --resource-group owlbear-rg \
  --query properties.configuration.ingress.fqdn -o tsv
```
Será algo como `owlbear.<algo>.eastus.azurecontainerapps.io`. Ese es el enlace
que compartes con tus amigos (ya es `https://`).

### 6. Añadir un volumen persistente para la base de datos

Container Apps necesita un Storage Account para volúmenes:

```bash
az storage account create --name owlbearstore --resource-group owlbear-rg --sku Standard_LRS
az storage share create --account-name owlbearstore --name owlbear-data

# Guarda la clave y regístrala en el entorno:
KEY=$(az storage account keys list -g owlbear-rg -n owlbearstore --query "[0].value" -o tsv)
az containerapp env storage set \
  --name owlbear-env -g owlbear-rg \
  --storage-name owlbearvol \
  --azure-file-account-name owlbearstore \
  --azure-file-account-key "$KEY" \
  --azure-file-share-name owlbear-data \
  --access-mode ReadWrite
```

Luego actualiza la app para montar el volumen en `/app/data` (BD + imágenes):

```bash
az containerapp update \
  --name owlbear -g owlbear-rg \
  --yaml azure/containerapp.yaml
```

Usa `azure/containerapp.yaml` (incluido), que ya define el volumen en
`/app/data`. Ajusta ahí el nombre del registry y el `JWT_SECRET`.

> ⚠️ Azure File (SMB) no soporta `WAL` de SQLite de forma fiable. Para máxima
> fiabilidad con Azure Files, usa **journal WAL desactivado**: añade la variable
> `SQLITE_JOURNAL=delete`. Si necesitas concurrencia real, pasa a PostgreSQL
> (ver abajo). Con pocos jugadores, SQLite + `SQLITE_JOURNAL=delete` va bien.

### 7. Actualizar a una nueva versión
```bash
az acr build --registry owlbearacr --image owlbear-clone:latest .
az containerapp update \
  --name owlbear -g owlbear-rg \
  --image owlbearacr.azurecr.io/owlbear-clone:latest
```

---

## Opción — Azure App Service (contenedor)

```bash
az appservice plan create --name owlbear-plan -g owlbear-rg --is-linux --sku B1
az webapp create --name owlbear-app \
  --resource-group owlbear-rg \
  --plan owlbear-plan \
  --deployment-container-image-name owlbearacr.azurecr.io/owlbear-clone:latest

# La app escucha en 4000:
az webapp config appsettings set --name owlbear-app -g owlbear-rg \
  --settings WEBSITES_PORT=4000 JWT_SECRET="cambia-esto"

# WebSocket (para la mesa en tiempo real):
az webapp config set --name owlbear-app -g owlbear-rg --web-sockets-enabled true
```

- HTTPS y el enlace público (`https://owlbear-app.azurewebsites.net`) son
  automáticos.
- Persistencia: App Service tiene su propio almacenamiento en `/home`.
  Monta ahí los datos o usa Azure Files. Para algo serio, mejor Container Apps
  con volumen o PostgreSQL.
- El plan **B1** es de pago (~13€/mes); el **F1 (free)** no soporta
  contenedores personalizados.

---

## Opción — Azure VM (como un VPS)

Idéntico a la sección de VPS en `DEPLOY.md`: crea una VM Ubuntu, abre 80/443,
instala Docker y usa `docker compose up -d --build`. Si usas esta vía, mantén el
`Caddyfile` para el HTTPS automático.

```bash
az vm create \
  --resource-group owlbear-rg \
  --name owlbear-vm \
  --image Ubuntu2204 \
  --size Standard_B1s \
  --admin-username azureuser \
  --generate-ssh-keys
az vm open-port --resource-group owlbear-rg --name owlbear-vm --port 80
az vm open-port --resource-group owlbear-rg --name owlbear-vm --port 443
```

---

## Opción — Azure Static Web Apps (NO sirve sola)

Azure Static Web Apps solo aloja el frontend estático. No ejecuta el backend ni
WebSocket. Si quisieras usarla, tendrías que alojar el backend en Azure
Container Apps aparte y construir el cliente con:

```bash
cd client
VITE_API_URL="https://owlbear.<algo>.azurecontainerapps.io" \
VITE_WS_URL="wss://owlbear.<algo>.azurecontainerapps.io" \
npm run build
```

...y configurar `CORS_ORIGIN` en el backend. Es más lío que desplegar todo junto,
así que para un VTT **no lo recomiendo**.

---

## Costes y comparación

| Servicio | Coste aprox. | Siempre activo | WS | Persistencia |
| --- | --- | --- | --- | --- |
| **Azure free VM B1s** | **0€ (12 meses)** | ✅ | ✅ con Caddy | disco de la VM |
| **Container Apps** (min 1 réplica) | ~10-15€/mes | ✅ | ✅ | volumen Azure Files |
| App Service B1 | ~13€/mes | ✅ | ✅ | App Service storage |
| Azure VM B1s | ~8-10€/mes | ✅ | ✅ con Caddy | disco de la VM |
| Static Web Apps | gratis | ✅ (solo front) | ❌ | N/A |

Azure no tiene un "always free" de verdad para contenedores 24/7: el plan free
de Container Apps tiene horas limitadas y el de App Service F1 no admite
contenedores propios. Para **0€**, la mejor sigue siendo **Oracle Cloud Always
Free** (ver `DEPLOY.md`). Azure brilla si ya tienes crédito/cuenta corporativa.

---

## Checklist Azure

- [ ] `JWT_SECRET` cambiado en las variables de entorno.
- [ ] `--min-replicas 1 --max-replicas 1` (evita desincronización de salas).
- [ ] Volumen montado en `/app/data` (si quieres persistencia real).
- [ ] `SQLITE_JOURNAL=delete` si usas Azure Files.
- [ ] WebSocket habilitado (App Service) o ingress correcto (Container Apps).
- [ ] Probado desde el móvil en `https://...azurecontainerapps.io`.
