# Build context: repository root.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w web
COPY web web
RUN npm run build -w web

# Stock nginx image, run as the unprivileged "nginx" user on port 8080.
FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
