# BOb image for a Bzzz box (Bzzz: docs/INSUMOS_bob_en_la_caja_minimo_etapa_4.md §4).
#
# Packaging only. Built from main, this image does NOT meet §4.2: main still reads
# the demo through the service role and PostgREST, which a box does not have. It
# meets it once the box mode (BOB_CAJA=1, branch bob-schema-data-layer) is merged.
# Do not offer an image built before that for a box.
#
# What is in it: the Next standalone server and nothing the build does not need.
# No keys are built in: everything box-specific is read at run time, and
# NEXT_PUBLIC_* values are not set here, so none reach the browser bundle.
# Vercel crons do not exist outside Vercel, so nothing in the image calls them.
#
# Build and hand-over (no registry: docker save / docker load, §4.4):
#   docker build -t bob-web:<commit> .
#   docker save bob-web:<commit> | gzip > bob-web-<commit>.tar.gz
# The box pins the image by id (BOB_IMAGEN_ID), not by tag.
#
# Memory ceiling: the box sets it at run time (NODE_OPTIONS=--max-old-space-size
# and the container limit, Bzzz compose/l7-bob.yml). BUILD_HEAP_MB only caps the
# build on a small machine.

FROM node:22.21.1-alpine@sha256:0340fa682d72068edf603c305bfbc10e23219fb0e40df58d9ea4d6f33a9798bf AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.21.1-alpine@sha256:0340fa682d72068edf603c305bfbc10e23219fb0e40df58d9ea4d6f33a9798bf AS build
WORKDIR /app
ARG BUILD_HEAP_MB=2048
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=${BUILD_HEAP_MB}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.21.1-alpine@sha256:0340fa682d72068edf603c305bfbc10e23219fb0e40df58d9ea4d6f33a9798bf AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=65534:65534 /app/.next/standalone ./
COPY --from=build --chown=65534:65534 /app/.next/static ./.next/static
COPY --from=build --chown=65534:65534 /app/public ./public
USER 65534:65534
EXPOSE 3000
CMD ["node", "server.js"]
