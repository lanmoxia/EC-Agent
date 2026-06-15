# ── Stage 1: Build Vue frontend ───────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /build
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────
FROM node:22-alpine

# ffmpeg for video processing; python3/make/g++ to compile better-sqlite3 native module
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./

# Copy built frontend to where Express expects it in production mode
# app.js: path.resolve(__dirname, "../client/dist") → /app/client/dist
COPY --from=frontend /build/dist /app/client/dist

# Ensure DB file exists as a file (not a dir) before volume mount takes effect
RUN printf '#!/bin/sh\ntouch /app/claude-vision.db\nmkdir -p /app/reports /app/server/uploads\nexec "$@"\n' \
    > /entrypoint.sh && chmod +x /entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "app.js"]
