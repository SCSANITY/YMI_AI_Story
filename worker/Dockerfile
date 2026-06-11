FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY index.ts processor.ts providerAdapter.ts subtitleRenderer.ts ./
COPY providers ./providers
COPY fonts ./fonts

RUN npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY fonts ./fonts

CMD ["npm", "run", "start"]
