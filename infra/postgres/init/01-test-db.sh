#!/bin/sh
# Cria o banco exclusivo dos testes e2e, de propriedade do mesmo usuário da aplicação.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE ${POSTGRES_DB}_test OWNER \"$POSTGRES_USER\";"
