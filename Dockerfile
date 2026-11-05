# KIT — production image for Fly.io.
#
# This app is a single long-lived Express process with a local SQLite file
# (server/database.ts, node:sqlite) — not a static site and not serverless.
# It needs a persistent volume mounted at /data (see fly.toml) and must run
# as exactly one machine: the workspace is one JSON row behind a single
# global revision, so a second writer would corrupt it.
#
# node_modules keeps devDependencies: server.ts imports "vite" unconditionally
# at module load (only calling it when NODE_ENV !== "production"), so the
# "vite" package must still be resolvable at runtime even in production.
# `npm run start` runs server.ts directly via tsx — no separate compiled
# server output, so the TypeScript source is copied into the runtime stage.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lockfile was generated on macOS (arm64), and npm's optional-dependency
# resolution (npm/cli#4828) can skip Linux x64 native binaries even on a
# clean `npm install` here, not just `npm ci`. Installing rollup's Linux
# binary explicitly guarantees it's present regardless of that lockfile bug.
RUN npm install \
    && npm install --no-save @rollup/rollup-linux-x64-gnu

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM deps AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server ./server
COPY src ./src
COPY server.ts ./server.ts
COPY index.html ./index.html
COPY public ./public
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["npm", "start"]
