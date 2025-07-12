FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

RUN mkdir -p /app/downloads && chmod 755 /app/downloads

COPY . .

CMD ["node", "src/server.js"]