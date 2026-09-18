FROM node:20-slim

# Debian slim (glibc) rather than Alpine (musl) — Prisma's musl/OpenSSL
# binary-target detection is flaky across build vs. runtime, which
# manifests as "Prisma Client could not locate the Query Engine" at
# startup even though `prisma generate` succeeded during the build.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "run", "dev"]
