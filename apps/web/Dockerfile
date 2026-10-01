# Imagem de produção do web (Next.js standalone). Build a partir da raiz:
#   docker build -f apps/web/Dockerfile -t receita-web .
FROM node:24.21.0-alpine AS build
RUN npm install -g pnpm@11.1.3
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @receita/web... build

FROM node:24.21.0-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
