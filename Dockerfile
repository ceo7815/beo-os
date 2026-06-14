# syntax=docker/dockerfile:1

# ---- Stage 1: build React (Vite) static assets ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY eslint.config.js ./
COPY public ./public
COPY src ./src

# Vite embeds VITE_* at build time — pass via docker build-arg / xCloud env
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FUNCTIONS_REGION=us-central1
ARG VITE_CLOCKIFY_PROXY_URL
ARG VITE_GREEN_INVOICE_URL
ARG VITE_ENABLE_FIRESTORE_SEED=false

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FUNCTIONS_REGION=$VITE_FUNCTIONS_REGION \
    VITE_CLOCKIFY_PROXY_URL=$VITE_CLOCKIFY_PROXY_URL \
    VITE_GREEN_INVOICE_URL=$VITE_GREEN_INVOICE_URL \
    VITE_ENABLE_FIRESTORE_SEED=$VITE_ENABLE_FIRESTORE_SEED

RUN npm run build

# ---- Stage 2: serve with Nginx ----
FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
