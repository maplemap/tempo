FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install --no-audit --no-fund
RUN cd backend && npm install --no-audit --no-fund
RUN cd frontend && npm install --no-audit --no-fund

COPY . .

RUN cd frontend && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY backend/src ./src
COPY --from=builder /app/frontend/dist ./public

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "src/server.js"]
