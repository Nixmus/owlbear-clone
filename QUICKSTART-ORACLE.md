# Quickstart — Oracle Cloud (Always Free)

Lista paso a paso para dejar la app online, siempre activa, con HTTPS gratis.
Sustituye lo que va entre `<...>` por tus datos.

---

## FASE 1 — Subir el código a GitHub (desde tu PC)

Ya tienes el repo creado y el primer commit hecho en
`D:\archivos\Codigo\owlbear-clone`.

1. Crea un repositorio **vacío** en <https://github.com/new> (sin README,
   sin .gitignore). Anota la URL, p. ej.
   `https://github.com/TU-USUARIO/owlbear-clone.git`.

2. En PowerShell, dentro del proyecto:
   ```powershell
   cd D:\archivos\Codigo\owlbear-clone
   git remote add origin https://github.com/TU-USUARIO/owlbear-clone.git
   git push -u origin main
   ```
   Si te pide credenciales, usa tu usuario y un **Personal Access Token**
   (<https://github.com/settings/tokens>, scope `repo`) como contraseña.

> Recomendación: haz el repo **público** para clonarlo sin token en el servidor.
> Si lo quieres privado, en la VM usa `https://TOKEN@github.com/USUARIO/repo.git`.

---

## FASE 2 — Crear la VM en Oracle

1. Entra en <https://cloud.oracle.com> → **Compute → Instances → Create instance**.
2. **Name**: `owlbear`.
3. **Image**: Canonical **Ubuntu 22.04**.
4. **Shape**: `VM.Standard.A1.Flex` (ARM, Always Free) → 1 OCPU + 6 GB RAM basta.
   (Si no hay capacidad, `VM.Standard.E2.1.Micro`, AMD, también Always Free.)
5. **Networking**: deja la VCN por defecto marcando **Assign a public IPv4 address**.
6. **SSH keys**: *Generate a key pair* y **descarga la clave privada** (`.key`).
7. **Create**. Cuando esté *Running*, copia la **Public IP address**.

### Abrir puertos 80 y 443 (dos sitios)

**A) Security List de la VCN**
- **Networking → Virtual Cloud Networks → tu VCN → Security Lists → Default**
  → **Add Ingress Rules**:
  - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
  - Repite con **443**

**B) Firewall interno de la VM (¡el error más común!)**
Las imágenes Ubuntu de Oracle traen `iptables` bloqueando 80/443. Se corrige
más abajo, en la FASE 3, paso 3.

---

## FASE 3 — Preparar la VM

1. Conéctate (desde tu PC):
   ```powershell
   ssh -i RUTA\a\tu\clave.key ubuntu@<IP-PUBLICA>
   ```
   (Si Windows se queja de permisos de la clave: clic derecho → Propiedades →
   Seguridad → quita herencia y deja solo tu usuario; o usa `icacls`.)

2. Instala Docker y Git:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker $USER && newgrp docker
   ```

3. **Abre 80/443 en el firewall de la VM** (clave):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

---

## FASE 4 — Dominio gratis con DuckDNS

1. Ve a <https://www.duckdns.org> e inicia sesión (GitHub/Google/email).
2. Crea un subdominio, p. ej. `miowlbear` → tu casa será
   **`miowlbear.duckdns.org`**.
3. En la caja de ese subdominio, pon la **IP pública de la VM** y **update ip**.
   (Opcional: instala su actualizador en la VM por si la IP cambia.)

---

## FASE 5 — Desplegar la app

1. Clona el repo y entra:
   ```bash
   git clone https://github.com/TU-USUARIO/owlbear-clone.git owlbear
   cd owlbear
   ```

2. Configura el secreto:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Cambia `JWT_SECRET=change-me-in-production` por una cadena larga y aleatoria.
   (Genera una con: `openssl rand -hex 32`.) Guarda con `Ctrl+O`, `Enter`,
   `Ctrl+X`.

3. Edita el dominio de Caddy:
   ```bash
   nano Caddyfile
   ```
   Deja solo tu dominio:
   ```
   miowlbear.duckdns.org {
       reverse_proxy owlbear:4000
   }
   ```

4. Arranca todo:
   ```bash
   docker compose up -d --build
   ```
   La primera vez tarda unos minutos (instala y compila).

5. Comprueba:
   ```bash
   docker compose ps
   docker compose logs -f caddy     # debe conseguir el certificado
   ```
   Sal del log con `Ctrl+C` (no para los contenedores).

---

## FASE 6 — Probar y compartir

1. Abre en el navegador: **`https://miowlbear.duckdns.org`**.
2. Crea una cuenta → crea una campaña → **Enter table**.
3. Comparte ese enlace con tus amigos: pueden registrarse y entrar a tu campaña.

> Es **obligatorio** entrar por `https://` (no `http://`): en una web sin
> cifrar el navegador bloquea el WebSocket de la mesa.

---

## Comandos útiles del día a día

```bash
cd ~/owlbear

# Ver estado y logs
docker compose ps
docker compose logs -f owlbear

# Reiniciar
docker compose restart

# Actualizar a la última versión del repo
git pull && docker compose up -d --build

# Parar / arrancar
docker compose down
docker compose up -d

# Copia de seguridad (BD + imágenes)
docker run --rm -v owlbear-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/owlbear-$(date +%F).tar.gz -C /data .
```

## Si algo no carga

1. **La web no abre** → vuelve a revisar **los dos sitios** de puertos (Security
   List **y** `iptables` en la VM).
2. **Caddy no saca certificado** → el dominio DuckDNS debe apuntar a la IP
   pública; espera 1-2 min; revisa `docker compose logs caddy`.
3. **La mesa no conecta (queda "connecting")** → asegúrate de usar `https://`.
4. **Se pierde todo al reiniciar** → comprueba el volumen:
   `docker volume ls` debe mostrar `owlbear_owlbear-data`.
