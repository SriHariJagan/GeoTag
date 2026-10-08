# GeoTech frontend — multi-stage production build.
#
#   stage 1 (node)  : npm ci + vite build  -> /ui/dist
#   stage 2 (nginx) : serve dist + reverse-proxy /api/ -> backend:8000
#
# Build from the REPOSITORY ROOT so nginx/nginx.conf is available:
#   docker build -f GeoTech-UI/Dockerfile .
# (docker-compose.yml already does this.)
#
# VITE_API_URL is baked in at build time. The default "/api" is a RELATIVE
# path, so the same image works behind ANY server IP or domain: the browser
# calls http://<SERVER_IP>/api/... and Nginx proxies it to the backend.
# There is intentionally no localhost URL anywhere in the production build.

FROM node:20-alpine AS build

WORKDIR /ui

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY GeoTech-UI/package.json GeoTech-UI/package-lock.json ./
RUN npm ci

COPY GeoTech-UI/ ./
RUN npm run build


FROM nginx:alpine

# SPA + API reverse proxy (see nginx/nginx.conf).
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/conf.d/default.conf.bak \
    && mkdir -p /usr/share/nginx/html

COPY --from=build /ui/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
