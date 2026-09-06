# --- build: gera um unico HTML auto-contido em /app/dist ---
FROM node:22-alpine AS build

WORKDIR /app
COPY build.mjs site.html ./
COPY src ./src
COPY assets ./assets

# O ambiente entra por build arg porque o HTML e estatico: meta robots,
# robots.txt, sitemap e o Measurement ID do GA4 sao decididos no build, nao em
# runtime. Consequencia pratica: producao e homologacao sao imagens diferentes.
ARG SITE_URL=https://drclaudiamaciel.com.br
ARG SITE_ENV=prod
ARG GA_MEASUREMENT_ID=
ENV SITE_URL=$SITE_URL SITE_ENV=$SITE_ENV GA_MEASUREMENT_ID=$GA_MEASUREMENT_ID
RUN node build.mjs

# --- runtime: nginx servindo estatico ---
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1
