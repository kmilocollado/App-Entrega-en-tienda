# Imagen multi-etapa: build (extensiones + web) → runtime mínimo.
# setup-build: 2026-03-09-v6
FROM node:20-alpine AS build
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY extensions ./extensions
COPY prisma ./prisma

RUN npm ci

COPY . .

# Solo build del servidor web en Fly; las extensiones se despliegan con `shopify app deploy`.
RUN npm exec react-router build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SETUP_BUILD_ID=2026-03-09-v6

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

EXPOSE 3000

CMD ["npm", "run", "docker-start"]
