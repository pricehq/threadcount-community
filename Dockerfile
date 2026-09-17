# ThreadCount, Community edition — one image, built where it runs.
#
# Built locally by `docker compose build` rather than pulled, and for a reason: everything that
# starts NEXT_PUBLIC_ is compiled into the browser bundle, so the address people will open the app
# at (NEXT_PUBLIC_SITE_URL) and the optional Turnstile site key have to be known at build time.
# docker-compose.yml passes them in from your .env as build arguments.
#
# Three stages:
#   deps     — node_modules from the lockfile (patch-package runs in postinstall).
#   builder  — the Prisma client and the Next build. Also the image `docker compose run migrate`
#              uses, because it still has the Prisma CLI.
#   runner   — Next's standalone output only: no compiler, no CLI, a non-root user.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci --ignore-scripts && npx patch-package

FROM deps AS builder
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_TURNSTILE_SITEKEY=
# The terms and privacy links the screens show. A self-hosted instance is somebody else's service
# with somebody else's privacy officer, so lib/links.ts sends people to the operator's own
# documents — and those constants are read by client components, which means they are frozen into
# the browser bundle here, not read from .env when the container starts. Without these two lines a
# self-hoster sets them in .env, rebuilds, and nothing changes: their staff see no terms link at all.
ARG NEXT_PUBLIC_TERMS_URL=
ARG NEXT_PUBLIC_PRIVACY_URL=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITEKEY=$NEXT_PUBLIC_TURNSTILE_SITEKEY \
    NEXT_PUBLIC_TERMS_URL=$NEXT_PUBLIC_TERMS_URL \
    NEXT_PUBLIC_PRIVACY_URL=$NEXT_PUBLIC_PRIVACY_URL \
    EDITION=community \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && groupadd -r threadcount && useradd -r -g threadcount -d /app threadcount \
 && mkdir -p /data/photos && chown -R threadcount:threadcount /data
ENV NODE_ENV=production \
    EDITION=community \
    PHOTO_DIR=/data/photos \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=threadcount:threadcount /app/.next/standalone ./
COPY --from=builder --chown=threadcount:threadcount /app/.next/static ./.next/static
COPY --from=builder --chown=threadcount:threadcount /app/public ./public
USER threadcount
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
