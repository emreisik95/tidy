FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --production=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
EXPOSE 3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
