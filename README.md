# Site — Dra. Claudia Maciel

Landing page para a Dra. Claudia Maciel (Ginecologista & Obstetra, Bonito/MS).

Duas rotas: a home (`/`), de página única, e a política de privacidade
(`/privacidade`), que fica separada porque o texto é longo o bastante para
diluir a relevância da home e porque uma URL estável é exigida por Meta Ads e
Google Ads. As duas compartilham header, rodapé e o script do menu, recortados
de `site.html` pelos marcadores `<!--#shell:nome-->`.

O build gera HTML estático (`dist/index.html` e `dist/privacidade/index.html`)
com o CSS embutido e as imagens `.webp` servidas como arquivos reais em
`dist/assets/`. Em produção, um nginx alpine serve os arquivos e o **Traefik**
faz o TLS e o roteamento.

## Estrutura

```
site.html                              markup da home (fonte da verdade do layout)
location.html                          markup das páginas de cidade (/bonito, /ponta-pora)
src/site-data.js                       NAP, SEO, consultórios, serviços, formação, FAQ e privacidade
src/styles.css, src/photos.css         estilos, injetados em /*__STYLES__*/
src/city.css                           o que é próprio das páginas de cidade
src/credentials.css                    seção "Formação e atuação" (só na home)
src/testimonials.css                   seção "Depoimentos" (só na home, e só se ativada)
src/location.css                       mapa "Como chegar" (só nas páginas de cidade)
src/env-ui.css                         selo de ambiente e aviso de cookies (as duas páginas)
src/privacy.css                        visual de /privacidade (só nessa página)
src/motion.css                         animações e micro-interações (sempre o ÚLTIMO do bundle)
assets/*.webp                          fotos, copiadas para dist/assets/
assets/logo-mark.webp                  monograma transparente (cabeçalho, rodapé, bloco de contato)
assets/logo.webp, og-image.jpg         logotipo do JSON-LD e cartão de compartilhamento
assets/favicon.ico, icon-*.png         ícones, copiados para a RAIZ de dist/
assets/brand/logo-original.webp        logotipo original 2382×2382 (fonte dos arquivos acima)
build.mjs                              gera dist/ (html, meta tags, JSON-LD, robots, sitemap, manifest, 404)
scripts/dev.mjs                        servidor local com rebuild automático (npm run dev)
scripts/gen-brand.mjs                  regera os ativos de marca a partir do logotipo original
Dockerfile                             multi-stage: node (build) -> nginx (runtime)
deploy/nginx.conf                      server block do nginx
deploy/traefik/drclaudiamaciel.yml     rota do Traefik em produção
deploy/traefik/drclaudiamaciel-hom.yml rota do Traefik em homologação (Basic Auth)
docker-compose.yml                     o mesmo para os dois ambientes; o que muda vive no .env
.env.example / .env.hom.example        variáveis de produção / de homologação
docs/SEO.md                            consolidado das decisões de SEO
docs/HOMOLOGACAO.md                    ambiente hom.* e as camadas contra indexação
docs/ANALYTICS.md                      GA4, Consent Mode v2 e LGPD
```

`dist/` é gerado e **não** vai para o git.

## Ambientes

| | Produção | Homologação | Local |
|---|---|---|---|
| Onde | `drclaudiamaciel.com.br` | `hom.drclaudiamaciel.com.br` | `127.0.0.1:8091` |
| Branch | `main` | `hom` | qualquer |
| `SITE_ENV` | `prod` | `hom` | `dev` (automático) |
| Indexável | sim | não | não |
| Acesso | público | Basic Auth | — |

`SITE_ENV` é a única chave: ele decide o `meta robots`, o `robots.txt`, se o
`sitemap.xml` é gerado, o selo visível de ambiente e o `debug_mode` do GA4.
O build **falha** se `SITE_ENV=prod` for combinado com uma `SITE_URL` de
homologação — o acidente que faria o Google indexar `hom.*` como conteúdo
duplicado do site real.

Detalhes de deploy, DNS e senha: **[docs/HOMOLOGACAO.md](docs/HOMOLOGACAO.md)**.

## Desenvolvimento

```bash
npm run dev
```

Sobe em <http://127.0.0.1:8091>, com **rebuild automático** ao salvar `site.html`, `src/` ou
`assets/` — é só recarregar a página. Para trocar a porta: `PORT=3000 npm run dev`.

O servidor espelha o `deploy/nginx.conf`: só `/` devolve o index, qualquer outra rota cai em
404 de verdade, e os `Content-Type` são os mesmos de produção. Não há dependências — é um
`node:http` de ~70 linhas em `scripts/dev.mjs`.

Se o build falhar (por exemplo, um token `__NOME__` sem substituição), o erro aparece no
terminal e o `dist/` anterior é preservado — o site local continua no ar até você corrigir.

O `npm run dev` roda como `SITE_ENV=dev`: `noindex`, com o selo de ambiente e sem Google
Analytics. Para conferir outro ambiente localmente:

```bash
SITE_ENV=prod npm run dev                                    # o HTML exato de produção
SITE_ENV=hom GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run dev      # com o aviso de cookies e o GA
```

### Só gerar o `dist/`

```bash
npm run build
```

Dá para abrir o `dist/index.html` direto no navegador (as imagens usam caminho relativo),
mas aí o favicon, o manifest e a logo do cabeçalho não carregam — usam caminho absoluto, que
só resolve sob um servidor. Para conferir o site de verdade, use o `npm run dev`.

Para editar **conteúdo indexável** (título, descrição, serviços, formação, FAQ, endereço,
telefone), mexa em `src/site-data.js`. Para layout, em `site.html`; para estilos, em
`src/styles.css` / `src/photos.css`; para trocar fotos, substitua os `.webp` em `assets/`
mantendo o nome. Os tokens `__NOME__` são validados no build: se algum sobrar sem
substituição, o build falha.

### Animações

Vivem em `src/motion.css` (o cabeçalho do arquivo explica as três regras que as governam) e
em duas peças de JS geradas pelo `build.mjs` — `motionHead` e `motionBody`. O ponto que não
pode ser perdido de vista ao mexer nisso: **nada no HTML entregue começa invisível.** O
estado inicial das revelações só existe descendo de `html.motion`, e essa classe é aplicada
por um script inline no `<head>`. Sem JS, com JS quebrado ou com "reduzir movimento" ligado
no sistema, a classe nunca aparece e a página renderiza inteira — que é o estado que o
Googlebot precisa ver. Para animar um bloco novo, basta `data-reveal` nele (e `stagger` no
contêiner, se os filhos devem entrar em cascata).

A entrada do hero é só `transform`, nunca `opacity`: o Chrome ignora elementos com
`opacity:0` ao eleger o Largest Contentful Paint, então um fade ali empurraria a métrica
para o fim da animação de graça.

A única exceção é a manchete "escrita" do `<h1>`. O `build.mjs` (`typeWords`) envolve cada
palavra num `<span>` e calcula o tempo de cada uma a partir do número de letras e das
pausas de pontuação — o texto completo continua no HTML, o CSS só decide quando cada
palavra aparece. **Para mudar a velocidade, mexa em `CHAR_MS`, `WORD_MS`, `PAUSE` e
`LEAD_MS` no `build.mjs`, não no CSS.** O build imprime quanto a manchete leva, e
`docs/SEO.md` (§7.2) explica por que essa exceção cabe no orçamento de LCP.

### Mapa do consultório (seção "Como chegar")

O mapa **não é um `<iframe>` no HTML entregue**. O que chega ao navegador é uma fachada
desenhada em SVG (decorativa — não representa as ruas de Bonito) com um botão do tamanho do
quadro; o `<iframe>` do Google Maps só é criado no clique, por um script de 5 linhas no fim
do `site.html`. Três motivos:

1. **LGPD** — um iframe do Google no HTML inicial faz requisição a terceiro, com cookies,
   antes de qualquer consentimento. Isso contradiria o modelo usado no Analytics (nada é
   baixado antes do aceite) e o texto da própria política de privacidade.
2. **Performance** — o embed do Maps carrega centenas de KB de JS de terceiro, que
   competiriam com o carregamento da página.
3. **CLS** — a altura é do contêiner (`.mapCanvas`), não do iframe. A troca fachada → mapa
   não muda a altura da seção.

Sem JS o botão não faz nada, e o caminho continua sendo o link "Como chegar" do cartão ao
lado. As quatro URLs (busca, rota, Waze e embed) saem da **mesma** string de endereço no
`build.mjs` — pelo endereço, não pela coordenada, que ainda está marcada `[CONFERIR]`.

### Depoimentos (seção opcional)

A seção `#depoimentos` existe, mas hoje está com **textos fictícios** (`placeholder: true`).
Por isso ela só aparece em `hom`/`dev`, para avaliar o layout: o build de **produção** apaga
o bloco `<!--#opt:depoimentos-->` inteiro do HTML gerado. O resumo do build mostra em que
situação ela saiu (linha `depoimentos`).

Para publicá-la, em `src/site-data.js` → `testimonials`: trocar por depoimentos reais e
autorizados e pôr `placeholder: false`. Para tirá-la também da homologação: `enabled: false`.
Em `hom` a seção aparece sem nenhum aviso na tela — quem revisar a homologação precisa saber,
por este README, que os textos ainda são de exemplo.

⚠️ **Antes de ativar, confirmar com o CRM-MS**: as normas do CFM sobre publicidade médica
restringem depoimento de paciente como peça publicitária — a mesma restrição já registrada
no comentário de `credentials`. Nada da seção entra no JSON-LD: nota/estrela própria de
`LocalBusiness` é contra as diretrizes do Google (ver "Avaliações", mais abaixo).

### Dois consultórios (Bonito e Ponta Porã)

A Dra. Claudia atende em **duas cidades**, e o site é estruturado em torno disso:

| Rota | O que é | O que disputa na busca |
|---|---|---|
| `/` | Hub da marca. Apresenta os dois consultórios e linka para as duas páginas | "Dra. Claudia Maciel", termos gerais |
| `/bonito` | Página do consultório de Bonito: endereço, mapa, horário, região e dúvidas próprias | "ginecologista em Bonito-MS" |
| `/ponta-pora` | O mesmo, para Ponta Porã | "ginecologista em Ponta Porã" |

**Por que páginas separadas e não uma só.** `title` e `h1` são os dois sinais
mais fortes de intenção local, e cada um só consegue mirar uma cidade. Uma página
tentando ranquear para "ginecologista em Bonito" **e** "ginecologista em Ponta
Porã" costuma não ranquear bem para nenhuma das duas. Com uma página por cidade,
cada uma tem título, H1, endereço, horário, mapa e `LocalBusiness` próprios — e
a home continua ganhando as buscas pelo nome da médica.

**Para acrescentar ou mudar um consultório**, mexa só em `src/site-data.js` →
`locations`. Dali saem, sozinhos: a rota, o `title`/`description`/H1, o cartão na
seção "Onde atende" da home, a linha no rodapé, o nó `LocalBusiness` no JSON-LD
das duas páginas, a entrada no `sitemap.xml` e os sinais de geolocalização.

A única coisa que **não** é automática é a rota no nginx — e o build falha com
instruções se ela faltar:

```
deploy/nginx.conf: falta o bloco da rota /campo-grande. Acrescente, junto dos outros:
    location = /campo-grande {
        try_files /campo-grande/index.html =404;
    }
```

⚠️ **Cada unidade precisa do seu próprio Google Business Profile**, com o mesmo
endereço, telefone e horário que estão no `site-data.js`. Sem o perfil, a página
da cidade não entra no mapa local; com o perfil divergente do site, entra pior do
que se não existisse. É o par que o Google mais compara em busca local.

O texto de cada página de cidade é **escrito por extenso** em
`locations[].page`, e não montado a partir de um molde com a cidade trocada: duas
páginas de cidade quase iguais são conteúdo duplicado, e o Google escolhe uma só
para ranquear. Pelo mesmo motivo, cada uma tem a sua foto (`locations[].photo`) e
as suas perguntas frequentes.

### Logotipo

Tudo em `assets/` que leva a marca é **gerado** a partir de um único arquivo,
`assets/brand/logo-original.webp` (2382×2382, com o fundo creme chapado do próprio
logotipo). O `npm run build` só copia o resultado — o site não tem dependência de
processamento de imagem, e manter assim é o que garante que ele continue construindo com
`node build.mjs` e mais nada.

| Arquivo | Onde aparece |
|---|---|
| `logo-mark.webp` | Monograma recortado, fundo transparente. Cabeçalho, rodapé e o selo do bloco de contato — o mesmo arquivo serve ao creme e ao rodapé quase preto |
| `logo.webp` | Logotipo completo sobre creme. Vai no `logo` do JSON-LD (o Google usa esse campo no Knowledge Panel) |
| `og-image.jpg` | Cartão 1200×630 da prévia de link. **JPEG**, e não WebP como o resto do site: a prévia do WhatsApp não renderiza WebP de forma confiável |
| `favicon.ico` (16/32/48), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Ícones. Vão para a **raiz** de `dist/`, porque o navegador e o iOS os pedem por caminho fixo, sem olhar o HTML |

Para trocar o logotipo: substitua `assets/brand/logo-original.webp` e rode

```bash
npx --yes -p sharp@0.34 node scripts/gen-brand.mjs
```

O script está comentado com o motivo de cada corte — inclusive por que o favicon usa o
monograma achatado no marrom escuro do letreiro (a 16px o degradê bronze some no fundo) e
como o fundo creme é recortado em alfa sem deixar halo.

⚠️ Os ícones da raiz saem com `max-age=604800`, não com o `immutable` de `/assets/`: quem já
visitou o site pode levar até uma semana para ver um logotipo novo na aba.

---

## SEO

> Consolidado completo das melhorias, com o antes/depois e o porquê de cada decisão:
> **[docs/SEO.md](docs/SEO.md)**.

Toda a camada de SEO é **gerada no build** a partir de `src/site-data.js`, para que os dados
estruturados nunca divirjam do que está visível na página (divergência é motivo de perda de
rich result no Google).

### O que o build produz

| Saída | Para quê |
|---|---|
| `<title>` + `meta description` | *Snippet* na SERP, otimizado para "ginecologista em Bonito MS" |
| `link rel=canonical` | Uma única URL indexável, sem duplicação |
| `meta robots` com `max-image-preview:large` | Habilita a miniatura grande no resultado |
| Open Graph + Twitter Card | Prévia com imagem no WhatsApp, Instagram, Facebook e X |
| `geo.region` / `geo.position` / `ICBM` | Sinais de geolocalização para busca local |
| JSON-LD (`@graph`) | `Physician` + `MedicalClinic` + `LocalBusiness`, `Person`, `WebSite`, `WebPage`, `ImageObject`, `BreadcrumbList` e `FAQPage` |
| `sameAs` + `alternateName` | Liga o site aos perfis já indexados (Instagram, Doctoralia) na mesma entidade |
| `openingHoursSpecification` | Habilita o "aberto agora" na SERP; a linha visível de horário sai do mesmo array |
| `robots.txt` | Libera tudo + aponta o sitemap (inclusive para GPTBot / Google-Extended) |
| `sitemap.xml` | As 4 URLs (`/`, `/bonito`, `/ponta-pora`, `/privacidade`), `lastmod` e extensão *image sitemap* |
| Uma `LocalBusiness` por consultório | Cada unidade tem `@id`, endereço, horário e região próprios, ligadas pelo `department` da clínica — é o que diz ao Google que são a mesma marca em duas cidades, e não dois negócios homônimos |
| `favicon.ico` + ícones PNG + `site.webmanifest` | O Google exige favicon para exibir o ícone na SERP mobile |
| `og:image` / `twitter:image` | Cartão 1200×630 com a logo (`assets/og-image.jpg`) — é o que aparece ao compartilhar o link |
| `logo` no JSON-LD | Logotipo da entidade, separado da foto da médica (`image`) |
| `404.html` | Evita *soft 404* (ver nginx abaixo) |

### Performance (Core Web Vitals)

As imagens deixaram de ser embutidas em base64 e passaram a ser arquivos reais. Isso
resolve três coisas de uma vez: o Google Images só indexa URLs reais, `og:image` exige URL
absoluta, e **o HTML caiu de ~238 KB para algumas dezenas de KB**, o que adianta o First
Contentful Paint. Hoje a home sai com ~64 KB (17,6 KB com gzip) — o build imprime o número
a cada rodada, e vale acompanhá-lo ao acrescentar seção.

Além disso: `preload` do hero com `fetchpriority="high"` (LCP), `loading="lazy"` nas demais,
`width`/`height` em todas as imagens (CLS zero), e o CSS do Google Fonts carregado sem
bloquear a renderização.

### Acessibilidade

O acordeão do FAQ usa `<details>`/`<summary>` nativo — navegável por teclado, sem JS, e com
o texto sempre no DOM para o crawler. Há *skip link*, `aria-expanded` no menu, marcos
semânticos (`<address>`, `<ol>`, `<nav aria-label>`) e `prefers-reduced-motion`.

### Ancoragem de entidade (`sameAs`)

`doctor.profiles` vira `sameAs` no JSON-LD. É assim que o Google entende que este site, o
Instagram e o perfil do Doctoralia são **a mesma pessoa**, e concentra a autoridade numa
única entidade em vez de espalhá-la. Reforçando isso, o JSON-LD declara o nome de registro
(*Claudia Estela Maciel Davalos*) como `alternateName` — é por ele que os diretórios médicos
indexam, enquanto as pacientes buscam por "Dra. Claudia Maciel".

**Só inclua URL conferida** — `sameAs` apontando para link quebrado atrapalha em vez de
ajudar. Faltam colar (as URLs aparecem truncadas na busca do Google; abra o perfil e copie
da barra de endereço): `agenda.app.br`, `BoaConsulta` e o link do Google Business Profile
(Maps → Compartilhar → Copiar link).

**Por que não há links visíveis para Doctoralia/BoaConsulta na página:** `sameAs` já entrega
todo o benefício de consolidação de entidade, e é invisível. Um link visível para esses
diretórios mandaria justamente a visitante com intenção de agendar para o funil de um
terceiro — que cobra pela consulta e fica com o relacionamento. Instagram é diferente: é
propriedade dela, e continua linkado no rodapé.

### ⚠️ Pendências antes de ir para produção

1. **Corrigir o telefone no Google Business Profile** — o perfil exibe (67) 98446-1107, mas o
   número correto é o (67) 99250-5165 que está no site. Enquanto os dois divergirem, o NAP
   fica inconsistente exatamente no par que o Google mais compara em busca local.
2. **Corrigir o bairro no Doctoralia** — lá consta "Alvorada"; o correto é "Centro", como no
   Google Business Profile e neste site.
3. **Remover/atualizar o consultório de Campo Grande no Doctoralia** — o perfil ainda lista
   um segundo endereço (Clovis Bevilaqua, 36) que não está mais em uso.
4. **Coordenadas** (`locations[].geo`) — as duas são aproximadas (centro da cidade).
   Pegue as exatas no Google Maps: botão direito no ponto → copiar coordenadas.
5. **Decidir a seção de depoimentos** (`testimonials`) — hoje os textos são fictícios, e por
   isso a seção só existe em homologação. Ou entram depoimentos reais e autorizados, ou a
   seção é desligada de vez. Confirmar antes a restrição do CFM (ver "Depoimentos", acima).
6. **Revisar serviços e FAQ** (`services`, `faq`) — os textos foram ampliados com termos de
   busca ("pré-natal", "exames preventivos", "reposição hormonal", "laser íntimo", extraídos
   da própria bio do Instagram) e há uma pergunta nova sobre reposição hormonal. Confirme
   que descrevem exatamente o que é oferecido.

**Específico de Ponta Porã** (a unidade nova — só o endereço foi informado):

7. **Conferir os horários no Google Business Profile** (`locations[1].openingHours`) — o
   site está com sexta 12h–17h e sábado 8h–17h, informados pela Dra. Claudia. O perfil da
   unidade precisa estar igual: é com ele que o Google compara.
8. **Conferir o endereço e o CEP** — "Rua 18 de Julho, 44 — Centro" veio por mensagem; o CEP
   (79900-000) é o geral da cidade. Confirme os dois contra o Google Business Profile da
   unidade antes de publicar.
9. **Região atendida** (`locations[1].areaServed`) — a lista atual (Antônio João, Aral
   Moreira, Laguna Carapã, Amambai, Bela Vista) foi montada por proximidade geográfica.
   É uma declaração de **de onde vêm as pacientes**, não de cidades próximas no mapa —
   ajuste com a Dra. Claudia.
10. **Criar o Google Business Profile de Ponta Porã** — é uma unidade nova, e sem perfil
    próprio ela não entra no mapa local por mais bem feita que a página esteja.

Já conferidos e gravados: CRM/MS 5944, RQE 4352, endereço de Bonito com CEP 79290-000,
horário de Bonito Seg–Sex 8h–12h e 14h–18h, telefone (67) 99250-5165 para as duas unidades.

### Fora do código (o que mais move o ponteiro em busca local)

O site é só metade do trabalho. Para aparecer no mapa e no pacote local do Google:

1. **Google Business Profile — um por consultório** — criar/reivindicar os perfis de Bonito
   **e** de Ponta Porã, cada um com o **mesmo** nome, endereço, telefone e horário (NAP) que
   estão em `src/site-data.js`, e cada um apontando o site para a sua página (`/bonito`,
   `/ponta-pora`). É o maior fator isolado de SEO local — e, com duas unidades, é o que
   impede o Google de tratá-las como um negócio só (ou como duplicata).
2. **Google Search Console** — verificar o domínio e enviar
   `https://drclaudiamaciel.com.br/sitemap.xml`.
3. **Avaliações** — hoje há **1 avaliação** (5,0) no Google. É o ponto mais fraco do perfil e
   o de maior retorno: pedir avaliação a cada paciente atendida move mais o ranking local do
   que qualquer ajuste de código. (Não dá para declarar `aggregateRating` no JSON-LD sem as
   avaliações estarem na própria página — e review próprio de LocalBusiness é contra as
   diretrizes do Google.)
4. **Citações NAP** consistentes em Doctoralia, BoaConsulta e agenda.app.br — ver as
   divergências listadas em "Pendências" acima.
5. **Conteúdo novo e recorrente** — um blog com artigos (ex.: "pré-natal em Bonito",
   "quando fazer o preventivo") é o caminho para ranquear em cauda longa. O caminho para
   isso já existe: `/privacidade` mostra como acrescentar uma rota (bloco `<!--#shell:-->`
   em `site.html`, entrada no `location` do nginx e no `sitemap.xml`).

---

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
entrypoint `web`. O arquivo também aplica **HSTS** (`stsPreload`) — só mantenha
`stsIncludeSubdomains` se todos os subdomínios forem HTTPS.

**3. Conferir:**

```bash
curl -I https://drclaudiamaciel.com.br
```

### DNS

Antes do passo 2, aponte os registros `A` de `drclaudiamaciel.com.br` e
`www.drclaudiamaciel.com.br` para o IP do servidor. O ACME TLS-ALPN precisa do DNS já
resolvendo para emitir o certificado. `www` é redirecionado 301 para o domínio raiz.

### Cache

| Rota | `Cache-Control` |
|---|---|
| `/` (HTML) | `max-age=300, must-revalidate` |
| `/assets/*` | `max-age=31536000, immutable` |
| `favicon.ico`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` | `max-age=604800` |
| `robots.txt`, `sitemap.xml` | `max-age=86400` |

O HTML aparece atualizado em até 5 minutos. Como as imagens são imutáveis por um ano,
**trocar uma foto mantendo o mesmo nome de arquivo não invalida o cache do navegador de
quem já visitou** — renomeie o `.webp` (e a referência em `site.html`) ao substituir uma
imagem.

### 404

Qualquer URL fora das quatro rotas do site (`/`, `/bonito`, `/ponta-pora` e `/privacidade`) devolve **404 de verdade**
com `dist/404.html`. Antes, o `try_files $uri /index.html` devolvia o index com status 200
em qualquer endereço, o que o Google classifica como *soft 404* e trata como erro de
qualidade.

`/privacidade` tem um `location =` próprio no nginx apontando para
`dist/privacidade/index.html`. É de propósito: sem ele, o módulo `index` responderia um 301
para acrescentar a barra final, e o canonical da página é `/privacidade`, sem barra.
O `scripts/dev.mjs` faz o mesmo mapeamento, para o local não divergir de produção.

### Atualizar o site

```bash
git pull && docker compose up -d --build
```

### Trocar a porta ou o domínio

Porta: `HOST_PORT` no `.env` **e** a `url` do serviço em
`deploy/traefik/drclaudiamaciel.yml`.
Domínio: `SITE_URL` no `.env` (usado no canonical, Open Graph, JSON-LD, `robots.txt` e
`sitemap.xml`), as regras `Host()` e o middleware de www no mesmo arquivo do Traefik, **e**
o `map $host $robots_tag` em `deploy/nginx.conf` — só os hosts listados ali ficam
indexáveis; qualquer outro recebe `noindex`. Um domínio de produção novo que não entre
nesse `map` sobe funcionando, mas nunca é indexado.

---

## Analytics e LGPD

> Propriedades do GA4, Consent Mode v2, eventos medidos e como conferir a integração:
> **[docs/ANALYTICS.md](docs/ANALYTICS.md)**.

O Measurement ID não fica no código: entra por `GA_MEASUREMENT_ID` no `.env`. Vazio, o
site sobe sem nenhuma linha de Google Analytics — e sem o aviso de cookies, já que não
haveria nada a consentir. Produção e homologação usam **propriedades diferentes** do GA4,
para que os eventos de teste não entrem nos relatórios reais.

O consentimento roda em modo básico: os sinais do Consent Mode v2 são declarados como
negados e o `gtag.js` só é baixado depois do aceite. Quem recusa não gera nenhuma
requisição para o Google.

⚠️ O texto da política de privacidade (`site.privacy`, em `src/site-data.js`) descreve o
que o site tecnicamente faz **hoje**. Revise com a Dra. Claudia — e, se possível, com
assessoria jurídica — antes de ir para produção, e atualize-o se entrar formulário, chat
ou pixel de anúncio.
