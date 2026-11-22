# Build context: repository root (the npm-workspaces lockfile lives there).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w api
COPY api/src api/src
# Bundle the TypeScript sources; dependencies stay external (installed in the runtime stage).
# esbuild ships with tsx (nested or hoisted, depending on lockfile resolution).
RUN ESB=node_modules/tsx/node_modules/.bin/esbuild; [ -x "$ESB" ] || ESB=node_modules/.bin/esbuild; \
    "$ESB" api/src/server.ts --bundle --platform=node --format=esm --packages=external \
    --outfile=api/dist/server.mjs

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    DB_FILE=/data/dzingel.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w api --omit=dev && npm cache clean --force
# server.mjs resolves ../migrations relative to itself.
COPY --from=build /app/api/dist/server.mjs api/dist/server.mjs
COPY api/migrations api/migrations
# Pre-create the data dir owned by the unprivileged user so a new named volume inherits it.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "api/dist/server.mjs"]
