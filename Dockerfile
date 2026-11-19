FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY index.html tsconfig.json vite.config.ts server.mjs firebase-applet-config.json ./
COPY src ./src

RUN npm run build

EXPOSE 3000

CMD ["node", "server.mjs"]
