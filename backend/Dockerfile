FROM node:24.22.1-bookworm-slim AS base
RUN npm install --global npm@11.19.1
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

FROM base AS build
RUN npm ci --workspace backend --include-workspace-root=false
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN npm run build -w backend

FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY db/default-capitals.json ./db/default-capitals.json
USER node
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "backend"]
