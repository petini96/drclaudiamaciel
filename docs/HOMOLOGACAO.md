# Ambiente de homologação — `hom.drclaudiamaciel.com.br`

Um segundo deploy do mesmo repositório, na branch `hom`, para validar mudanças
antes de irem para produção. Roda no mesmo servidor, no mesmo Traefik, mas com
projeto Compose, container, imagem e porta separados — subir homologação nunca
toca no site que está no ar.

| | Produção | Homologação |
|---|---|---|
| Domínio | `drclaudiamaciel.com.br` | `hom.drclaudiamaciel.com.br` |
| Branch | `main` | `hom` |
| Porta (loopback) | 8091 | 8092 |
| Projeto Compose | `drclaudiamaciel` | `drclaudiamaciel-hom` |
| Container | `drclaudiamaciel-site` | `drclaudiamaciel-site-hom` |
| Imagem | `drclaudiamaciel-site:latest` | `drclaudiamaciel-site:hom` |
| `SITE_ENV` | `prod` | `hom` |
| Propriedade GA4 | produção | homologação (outra propriedade) |
| Indexável | sim | **não**, em 4 camadas |
| Acesso | público | Basic Auth |

---

## As 4 camadas contra indexação

Nenhuma sozinha é suficiente, e a ordem importa: as três últimas são *pedidos*
ao buscador, e só a primeira é uma garantia técnica.

| # | Onde | O que faz | Por que existe |
|---|---|---|---|
| 1 | Traefik — `basicAuth` | Devolve **401** sem credencial | Única camada que não depende da boa vontade do robô. Sem conteúdo acessível, não há o que indexar. |
| 2 | nginx — `X-Robots-Tag` | Header `noindex, nofollow, noarchive, nosnippet` | Vale para **todo arquivo** (`.webp`, `.xml`, `.txt`), não só para o HTML. Ligado por *host*, não por build — sobrevive a um erro de roteamento. |
| 3 | build — `<meta name="robots">` | `noindex,nofollow,noarchive,nosnippet` no HTML | Redundância barata; é o sinal que as ferramentas de auditoria checam. |
| 4 | build — `robots.txt` | `Disallow: /`, sem `Sitemap:` | Corta o rastreamento na porta de entrada. O `sitemap.xml` **não é gerado** fora de produção. |

O `X-Robots-Tag` do nginx usa **lista de permissão invertida**: só
`drclaudiamaciel.com.br` e `www.drclaudiamaciel.com.br` saem sem o header;
qualquer outro host recebe `noindex`. Foi escolhido nesse sentido de propósito —
se um dia alguém apontar `hom.*` para o container de produção, ou publicar um
domínio novo, o pior caso é "ainda não indexou", nunca "indexou o ambiente
errado". **Ao adicionar um domínio de produção novo, inclua-o nesse `map` em
[`deploy/nginx.conf`](../deploy/nginx.conf).**

O `build.mjs` também recusa a combinação `SITE_ENV=prod` com uma `SITE_URL`
começando em `hom.` — o build falha em vez de gerar um HTML indexável apontando
para homologação.

---

## Subir pela primeira vez

### 1. DNS

Registro `A` de `hom.drclaudiamaciel.com.br` apontando para o IP do servidor.
O ACME TLS-ALPN precisa do DNS já resolvendo para emitir o certificado.

Não existe `www.hom.*`: seria mais um registro, mais um SAN no certificado e
mais um redirect para manter, sem ninguém para digitar esse endereço.

> ⚠️ **Não acrescente `www.hom.*` à regra do router sem criar o DNS junto.**
> Com `tlsChallenge`, o Let's Encrypt valida **todos** os domínios do
> certificado: um único SAN que não resolve derruba a emissão inteira, e
> `hom.*` fica sem certificado mesmo tendo DNS correto. O sintoma é
> `NXDOMAIN looking up A for www.hom...` no log do Traefik e a conexão
> falhando no TLS (`curl` devolve `000`).

> O `drclaudiamaciel-security` de produção aplica HSTS com
> `includeSubDomains` + `preload`. Isso já cobre `hom.*` — por isso não há
> middleware de HSTS duplicado aqui. Como consequência, o subdomínio **precisa**
> servir HTTPS válido, o que o `certResolver: le` resolve.

### 2. Senha do Basic Auth

O arquivo fica **dentro** de `dynamic/`. Esse é o ponto que mais gera confusão:
o container do Traefik monta apenas três caminhos — o socket do Docker,
`./dynamic:/etc/traefik/dynamic:ro` e `./letsencrypt`. Um `usersFile` apontando
para `/etc/traefik/hom.htpasswd` (um nível acima) referencia um caminho que
**não existe dentro do container**, e o `basicAuth` falha sempre.

Ficar em `dynamic/` é seguro: o file provider só interpreta `.yml`, `.yaml` e
`.toml`; qualquer outra extensão é ignorada.

```bash
docker run --rm httpd:alpine htpasswd -nbB claudia 'SENHA' \
  > /home/deployer/infra/traefik/dynamic/hom.htpasswd
chmod 644 /home/deployer/infra/traefik/dynamic/hom.htpasswd
```

Confirme que o caminho existe **dentro** do container:

```bash
docker exec traefik ls -l /etc/traefik/dynamic/hom.htpasswd
```

Se o `usersFile` não existir, o Traefik devolve 500 em `hom.*` — falha fechada,
que é o comportamento certo para um ambiente que não deveria ficar exposto. Se
o seu mapeamento de volume for outro, ajuste o `usersFile` em
[`deploy/traefik/drclaudiamaciel-hom.yml`](../deploy/traefik/drclaudiamaciel-hom.yml).

### 3. Rota no Traefik

```bash
sudo cp deploy/traefik/drclaudiamaciel-hom.yml /home/deployer/infra/traefik/dynamic/
```

`providers.file.watch=true`, então entra sem restart.

> Router, middlewares e service usam o sufixo `-hom` justamente para não colidir
> com os de `drclaudiamaciel.yml`. O file provider carrega todos os `.yml` do
> diretório num **único namespace**: nomes repetidos entre arquivos fazem o
> Traefik descartar uma das definições — e você acabaria com homologação
> servindo produção, ou pior.

### 4. Container

Em um diretório separado do de produção:

```bash
git clone <repo> drclaudiamaciel-hom && cd drclaudiamaciel-hom
git checkout hom
cp .env.hom.example .env
# edite o .env: preencha GA_MEASUREMENT_ID com a propriedade GA4 de homologação
docker compose up -d --build
```

### 5. Conferir

```bash
curl -I https://hom.drclaudiamaciel.com.br
```

Esperado: **401** e `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`.

```bash
curl -I -u claudia:SENHA https://hom.drclaudiamaciel.com.br
```

Esperado: **200**, o mesmo `X-Robots-Tag`, e no HTML
`<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">`.

O site tem **duas** rotas, e as duas precisam passar no mesmo teste — uma página
de privacidade indexável apontando para `hom.*` seria conteúdo duplicado do
mesmo jeito:

```bash
curl -I -u claudia:SENHA https://hom.drclaudiamaciel.com.br/privacidade
```

Esperado: **200** (não 301 nem 404) e o mesmo `X-Robots-Tag`.

E que o `sitemap.xml` **não** existe fora de produção — ele é o convite explícito
para o Googlebot rastrear:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u claudia:SENHA https://hom.drclaudiamaciel.com.br/sitemap.xml   # 404
```

E que produção continua limpa:

```bash
curl -I https://drclaudiamaciel.com.br | grep -i robots   # não deve retornar nada
```

---

## Atualizar homologação

```bash
git pull && docker compose up -d --build
```

## Promover para produção

```bash
git checkout main && git merge hom && git push
# no diretório de produção do servidor:
git pull && docker compose up -d --build
```

Antes de promover, confirme que `GA_MEASUREMENT_ID` no `.env` de **produção**
aponta para a propriedade GA4 de produção, não para a de homologação.

---

## Rodar o ambiente de homologação localmente

```bash
SITE_ENV=hom SITE_URL=https://hom.drclaudiamaciel.com.br GA_MEASUREMENT_ID=G-XXXX npm run dev
```

No PowerShell:

```bash
$env:SITE_ENV='hom'; $env:SITE_URL='https://hom.drclaudiamaciel.com.br'; $env:GA_MEASUREMENT_ID='G-XXXX'; npm run dev
```

Sem variáveis nenhumas, o `npm run dev` roda como `SITE_ENV=dev`: também
`noindex`, também com o selo de ambiente, e sem Google Analytics.

---

## Testar o GA4 em homologação

A propriedade GA4 de homologação precisa ser **outra**, não a de produção —
senão os eventos de teste entram nos relatórios reais e contaminam a série
histórica. O `GA_MEASUREMENT_ID` do `.env` de hom é o dessa segunda propriedade.

Com `SITE_ENV=hom` o build liga `debug_mode: true` automaticamente, então os
eventos aparecem em tempo real no **DebugView** do GA4 (Administrador →
DebugView) — sem esperar as 24–48 h dos relatórios normais.

Dois detalhes que costumam gerar "o Analytics não está funcionando":

1. **Nada dispara antes do aceite.** O consentimento nasce como `denied` e o
   `gtag.js` só é baixado depois do clique em "Aceitar". Se o DebugView está
   vazio, o primeiro lugar para olhar é se o banner ainda está na tela.
2. **A escolha fica salva.** Depois de aceitar uma vez, o banner não volta. Para
   repetir o teste do zero, use o botão "Alterar minha preferência de cookies"
   no fim de `/privacidade` — que é o mesmo caminho da paciente.

O evento a validar é o `generate_lead`, com o parâmetro `method` (`whatsapp` ou
`telefone`): clique no botão de WhatsApp e num link de telefone e confirme que
os dois aparecem no DebugView. É a única conversão do site.
