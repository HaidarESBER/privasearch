FROM node:20-alpine

WORKDIR /app

# Install only production deps (just Express). Copy manifest first for caching.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
