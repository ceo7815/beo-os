# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8787

CMD ["node", "dist/index.js"]
