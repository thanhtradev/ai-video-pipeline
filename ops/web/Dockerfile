# Web console (D-103). Build from the repo root:
#   docker build -f ops/web/Dockerfile -t aivideo-web .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY worker/package.json worker/
COPY remotion/package.json remotion/
RUN npm ci --workspace web --ignore-scripts
COPY web web
RUN npm run build --workspace web

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY worker/package.json worker/
COPY remotion/package.json remotion/
RUN npm ci --workspace web --omit=dev --ignore-scripts

FROM node:22-alpine
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=64
ENV WEB_HOST=0.0.0.0
ENV WEB_UI_DIR=/app/web/dist/ui
WORKDIR /app/web
COPY --from=deps /repo/node_modules /app/node_modules
COPY --from=build /repo/web/dist /app/web/dist
COPY web/package.json /app/web/package.json
USER node
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8790/health || exit 1
CMD ["node", "dist/server/main.js"]
