# Imagem de produção da API. Build a partir da raiz do monorepo:
#   docker build -f apps/api/Dockerfile -t receita-api .
# Migrations: rode `pnpm --filter @receita/api db:migrate:deploy` como job separado
# antes de subir uma nova versão.

FROM node:24.21.0-alpine AS build
RUN npm install -g pnpm@11.1.3
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @receita/api db:generate
RUN pnpm --filter @receita/api... build
RUN pnpm --filter @receita/api deploy --prod --legacy /out \
  && cp -r apps/api/dist /out/dist \
  && cp -r apps/api/prisma /out/prisma \
  && cp apps/api/prisma.config.ts /out/

FROM node:24.21.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /out .
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
