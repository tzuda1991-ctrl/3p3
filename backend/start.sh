#!/bin/sh
set -e

PORT="${PORT:-8080}"

# Fix Apache "AH00534: More than one MPM loaded"
rm -f /etc/apache2/mods-enabled/mpm_event.conf /etc/apache2/mods-enabled/mpm_event.load \
      /etc/apache2/mods-enabled/mpm_worker.conf /etc/apache2/mods-enabled/mpm_worker.load
a2enmod mpm_prefork >/dev/null 2>&1 || true

# Bind Apache cleanly to Railway dynamic $PORT
printf "Listen %s\n" "$PORT" > /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/g" /etc/apache2/sites-available/000-default.conf

exec apache2-foreground
