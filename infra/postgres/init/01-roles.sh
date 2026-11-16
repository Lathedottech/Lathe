#!/bin/sh
# Creates the migration owner role and the non-owner app role.
# Passwords come from the container environment; nothing is hard-coded.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v owner_role="$LATHE_OWNER_ROLE" -v owner_pw="$LATHE_OWNER_PASSWORD" \
  -v app_role="$LATHE_APP_ROLE" -v app_pw="$LATHE_APP_PASSWORD" \
  -v dbname="$POSTGRES_DB" -f /docker-entrypoint-initdb.d/roles.sql.in