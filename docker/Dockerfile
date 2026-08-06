# Build stage — compiles the SPA and the TypeScript server.
FROM node:20-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 ships prebuilds for common platforms but falls back to a
# source build, which needs a toolchain and python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install

COPY . .
RUN npm run build


# Runtime stage.
#
# Debian's ffmpeg is built with --enable-libsrt, which covers every SRT, UDP,
# RTP and RTMP path in this hub. It has no Open Media Transport support: OMT
# lives in a fork (github.com/GalleryUK/FFmpeg-OMT) pending upstream merge.
# To enable OMT outputs, build that fork against libomt and point FFMPEG_PATH
# at the result — see docker/ffmpeg-omt.md.
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    THITO_DATA_DIR=/data \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

VOLUME ["/data"]
EXPOSE 8080/tcp
# SRT ingest range; keep in sync with THITO_SRT_PORT_MIN/MAX.
EXPOSE 9000-9099/udp

# tini reaps the ffmpeg children, which otherwise pile up as zombies.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]
