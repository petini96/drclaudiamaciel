# Site — Dra. Claudia Maciel

Landing page de página única para a Dra. Claudia Maciel (Ginecologista & Obstetra, Bonito/MS).

O build gera **um único arquivo HTML auto-contido** (`dist/index.html`): CSS e imagens `.webp`
são embutidos no próprio HTML. Em produção, um nginx alpine serve esse arquivo e o
**Traefik** faz o TLS e o roteamento.

## Estrutura

```
site.html                            markup (fonte da verdade do conteúdo)
src/styles.css, src/photos.css       estilos, injetados em /*__STYLES__*/
assets/*.webp                        imagens, injetadas nos tokens __NOME__
build.mjs                            gera dist/index.html + robots.txt + sitemap.xml
Dockerfile                           multi-stage: node (build) -> nginx (runtime)
deploy/nginx.conf                    server block do nginx
deploy/traefik/drclaudiamaciel.yml   rota do Traefik (file provider)
docker-compose.yml                   publica em 127.0.0.1:8091
```

`dist/` é gerado e **não** vai para o git.

## Desenvolvimento

```bash
npm run build
```

Abra `dist/index.html` direto no navegador — não há servidor de dev nem dependências.

Para editar conteúdo, mexa em `site.html`; para estilos, em `src/styles.css` /
`src/photos.css`; para trocar fotos, substitua os `.webp` em `assets/` mantendo o nome.
Os tokens são validados no build: se algum `__NOME__` sobrar sem substituição, o build falha.

## Deploy em produção

O Traefik desta infra roda com `network_mode: host` e usa o **file provider**
(`/etc/traefik/dynamic/`), apontando para serviços em `127.0.0.1:PORTA`. O container do
site segue esse padrão: publica só no loopback, na porta **8091**.

**1. Subir o container** (no servidor, dentro do repositório clonado):

```bash
cp .env.example .env && docker compose up -d --build
```

**2. Registrar a rota no Traefik** (uma única vez):

```bash
sudo cp deploy/traefik/drclaudiamaciel.yml /home/deployer/infra/traefik/dynamic/
```

O Traefik está com `providers.file.watch=true`, então a rota entra sem restart. O
certificado é emitido pelo resolver `le` (TLS-ALPN) e o redirect HTTP→HTTPS já é global no
entrypoint `web`.

**3. Conferir:**

```bash
curl -I https://drclaudiamaciel.com.br
```

### DNS

Antes do passo 2, aponte os registros `A` de `drclaudiamaciel.com.br` e
`www.drclaudiamaciel.com.br` para o IP do servidor. O ACME TLS-ALPN precisa do DNS já
resolvendo para emitir o certificado. `www` é redirecionado 301 para o domínio raiz.

### Atualizar o site

```bash
git pull && docker compose up -d --build
```

O HTML é servido com `Cache-Control: public, max-age=300, must-revalidate`, então a
mudança aparece em até 5 minutos (ou num hard refresh).

### Trocar a porta ou o domínio

Porta: `HOST_PORT` no `.env` **e** a `url` do serviço em
`deploy/traefik/drclaudiamaciel.yml`.
Domínio: `SITE_URL` no `.env` (usado no `robots.txt`/`sitemap.xml`) **e** as regras `Host()`
e o middleware de www no mesmo arquivo do Traefik.
