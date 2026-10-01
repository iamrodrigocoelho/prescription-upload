#!/bin/sh
# Gera a configuração de identidades do gateway S3 a partir do ambiente, para que
# nenhuma credencial fique versionada. Apenas a identidade da aplicação existe:
# não há identidade anônima, logo nenhum acesso sem assinatura é permitido.
set -eu
cat > /tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "receita-app",
      "credentials": [{ "accessKey": "${STORAGE_ACCESS_KEY}", "secretKey": "${STORAGE_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
JSON
exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/tmp/s3.json -volume.max=0 -master.volumeSizeLimitMB=1024
