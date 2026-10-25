FROM node:24.22.1-bookworm-slim AS build
RUN npm install --global npm@11.19.1
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root=false
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
ARG VITE_MAPBOX_TOKEN
RUN test -n "$VITE_MAPBOX_TOKEN" || (echo 'Set a public VITE_MAPBOX_TOKEN before building the frontend' >&2; exit 1)
RUN npm run build -w frontend

FROM nginx:stable-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
