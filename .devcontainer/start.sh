#!/usr/bin/env bash
# Arranca el servidor combinado (API + WebSocket + cliente compilado) en el puerto 4000.
# Se ejecuta automáticamente al abrir el Codespace.
set -e
cd "$(dirname "$0")/.."

# Evita arrancar dos veces si ya está corriendo.
if pgrep -f "node index.js" >/dev/null 2>&1; then
  echo "El servidor ya está en marcha."
  exit 0
fi

mkdir -p server/data
echo "Arrancando Owlbear en el puerto 4000…"
nohup node server/index.js > /tmp/owlbear.log 2>&1 &
sleep 1
echo "Listo. Log: /tmp/owlbear.log"
echo "El puerto 4000 se expone público automáticamente (pestaña Ports)."
