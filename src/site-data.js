// Fonte unica de verdade dos dados de negocio (NAP), SEO e conteudo indexavel.
// O build.mjs usa este arquivo para gerar as meta tags, o JSON-LD (dados
// estruturados), os cards de servicos, o FAQ, o sitemap.xml e o manifest.
//
// ATENCAO — campos marcados com [CONFERIR] precisam ser validados por quem
// conhece a clinica antes de ir para producao. Dado errado em JSON-LD prejudica
// o SEO local (o Google cruza esses dados com o Google Business Profile).

export const site = {
  // Sobrescrito por SITE_URL no build; mantido aqui como fallback.
  url: 'https://drclaudiamaciel.com.br',
  locale: 'pt-BR',
  themeColor: '#682c42',

  // --- Analytics -------------------------------------------------------------
  // O Measurement ID NAO fica aqui: vem de GA_MEASUREMENT_ID no build (veja
  // .env.example), porque producao e homologacao usam propriedades diferentes
  // do GA4. Sem a variavel, nada de Google Analytics e injetado na pagina.
  analytics: {
    // Textos do banner de consentimento (LGPD).
    consent: {
      text: 'Usamos cookies de análise para entender como o site é usado e melhorá-lo. Nada é coletado sem a sua autorização, e este site não guarda nenhuma informação de saúde.',
      accept: 'Aceitar',
      reject: 'Recusar',
      more: 'Política de privacidade',
    },
  },

  doctor: {
    name: 'Claudia Maciel',
    fullName: 'Dra. Claudia Maciel',
    // Nome de registro. Os diretorios medicos (Doctoralia, agenda.app.br,
    // BoaConsulta) indexam por ele, enquanto as pacientes buscam por "Dra.
    // Claudia Maciel". Declarar os dois como alternateName ajuda o Google a
    // entender que sao a mesma pessoa e a consolidar a entidade.
    legalName: 'Claudia Estela Maciel Davalos',
    honorificPrefix: 'Dra.',
    jobTitle: 'Médica Ginecologista e Obstetra',
    // Exigido pela Res. CFM 1.974/2011 em publicidade medica. Aparece no rodape
    // e nos dados estruturados. Fonte: Doctoralia e agenda.app.br (confere no CRM-MS).
    crm: 'CRM/MS 5944',
    rqe: 'RQE 4352',
    instagram: 'https://instagram.com/draclaudiamaciel',
    // Vira `sameAs` no JSON-LD: e assim que o Google liga este site aos perfis
    // ja indexados e concentra a autoridade numa unica entidade.
    // So inclua URL conferida — link quebrado aqui atrapalha em vez de ajudar.
    profiles: [
      'https://instagram.com/draclaudiamaciel',
      'https://www.doctoralia.com.br/claudia-estela-maciel-davalos/ginecologista/bonito',
      // [PREENCHER] Cole a URL exata (abra o perfil e copie da barra de endereco):
      // 'https://agenda.app.br/especialista/...',
      // 'https://www.boaconsulta.com/...',
      // URL do perfil do Google Business (Maps > Compartilhar > Copiar link):
      // 'https://maps.app.goo.gl/...',
    ],
  },

  business: {
    name: 'Dra. Claudia Maciel — Ginecologia e Obstetrícia',
    shortName: 'Dra. Claudia Maciel',
    // Endereco completo conferido e confirmado: bate com o Google Business
    // Profile. O Doctoralia lista o bairro como "Alvorada" — divergencia
    // conhecida, corrigir la (o NAP precisa ser identico em todos os diretorios).
    address: {
      street: 'Rua Santana do Paraíso, 1026',
      district: 'Centro',
      city: 'Bonito',
      state: 'Mato Grosso do Sul',
      stateCode: 'MS',
      postalCode: '79290-000',
      country: 'BR',
    },
    // [CONFERIR] Coordenadas aproximadas do centro de Bonito-MS. Pegue as exatas
    // no Google Maps (clique com o botao direito no ponto > copiar coordenadas).
    geo: { lat: -21.1261, lng: -56.4822 },
    // Numero confirmado como correto. ATENCAO: o Google Business Profile ainda
    // exibe (67) 98446-1107 — corrigir la, senao o NAP fica inconsistente entre
    // o site e o perfil, que e o par que o Google mais compara em busca local.
    phone: { display: '(67) 99250-5165', e164: '+5567992505165' },
    whatsappText: 'Olá, gostaria de agendar uma consulta com a Dra. Claudia.',
    // Vira `openingHoursSpecification` no JSON-LD (habilita o "aberto agora" na
    // busca) E a linha de horario visivel no bloco de contato. Deixe vazio para
    // omitir dos dois lugares. Dias em ingles: e o vocabulario do schema.org.
    openingHours: [
      { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '12:00' },
      { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '14:00', closes: '18:00' },
    ],
    areaServed: [
      'Bonito',
      'Jardim',
      'Guia Lopes da Laguna',
      'Bodoquena',
      'Miranda',
      'Anastácio',
      'Aquidauana',
      'Nioaque',
      'Bela Vista',
    ],
  },

  seo: {
    title: 'Ginecologista e Obstetra em Bonito-MS | Dra. Claudia Maciel',
    description:
      'Dra. Claudia Maciel, ginecologista e obstetra em Bonito-MS. Consulta ginecológica, pré-natal e climatério com atendimento humanizado. Agende pelo WhatsApp.',
    ogImage: 'claudia-hero',
    keywords: [
      'ginecologista em Bonito MS',
      'obstetra em Bonito MS',
      'ginecologista e obstetra Bonito',
      'consulta ginecológica Bonito',
      'pré-natal Bonito MS',
      'Dra. Claudia Maciel',
      'saúde da mulher Bonito',
      'climatério e menopausa Bonito',
      'reposição hormonal Bonito MS',
      'laser íntimo Bonito MS',
    ],
  },

  // Cards da secao "Cuidados" + availableService no JSON-LD.
  services: [
    {
      icon: '✦',
      name: 'Consulta ginecológica',
      description:
        'Avaliação completa da saúde da mulher, exames preventivos de rotina e acompanhamento individualizado em todas as fases da vida.',
    },
    {
      icon: '♡',
      name: 'Obstetrícia e pré-natal',
      description:
        'Acompanhamento da gestação do início ao parto, com escuta, orientação e cuidado para a mãe e o bebê em cada trimestre.',
    },
    {
      icon: '◌',
      name: 'Climatério, menopausa e reposição hormonal',
      description:
        'Avaliação dos sintomas do climatério e da menopausa, investigação hormonal e discussão da terapia de reposição hormonal quando indicada.',
    },
    {
      icon: '◇',
      name: 'Saúde íntima e sexualidade',
      description:
        'Escuta sem julgamentos e abordagem responsável para desconfortos íntimos, libido, sexualidade e qualidade de vida.',
    },
    {
      icon: '≈',
      name: 'Laser íntimo e tecnologias ginecológicas',
      description:
        'Procedimentos com laser e outras tecnologias ginecológicas, indicados após avaliação médica e com objetivos definidos para cada paciente.',
    },
    {
      icon: '＋',
      name: 'Planejamento familiar e prevenção',
      description:
        'Orientação contraceptiva, exames preventivos e decisões compartilhadas para cuidar do presente e planejar o futuro.',
    },
  ],

  // Perguntas frequentes: viram <details> na pagina E FAQPage no JSON-LD.
  // O Google exige que a resposta do schema esteja visivel na pagina — por isso
  // os dois sao gerados daqui.
  faq: [
    {
      q: 'Quando devo procurar uma ginecologista?',
      a: 'Consultas preventivas fazem parte do cuidado mesmo sem sintomas. Alterações no ciclo menstrual, dor pélvica, corrimento, sangramento fora do período, sintomas da menopausa ou desconfortos íntimos também merecem avaliação médica.',
    },
    {
      q: 'A consulta é indicada para mulheres de todas as idades?',
      a: 'Sim. Da adolescência à pós-menopausa, cada fase da vida traz necessidades diferentes, e a consulta é conduzida de forma individualizada e respeitosa.',
    },
    {
      q: 'Com que frequência devo fazer a consulta preventiva?',
      a: 'Na maioria dos casos, a avaliação ginecológica de rotina é anual. A frequência dos exames preventivos, porém, é definida caso a caso, conforme a idade, o histórico de saúde e os resultados anteriores.',
    },
    {
      q: 'Preciso levar exames anteriores para a consulta?',
      a: 'Sim, sempre que possível. Exames preventivos, ultrassonografias, exames de sangue e relatórios anteriores ajudam a entender seu histórico e a evitar repetições desnecessárias. Leve também a lista dos medicamentos que você usa.',
    },
    {
      q: 'Posso ir à consulta menstruada?',
      a: 'A consulta pode ser realizada normalmente para conversar, avaliar queixas e revisar exames. Alguns exames, como o preventivo, costumam ser reagendados para um dia fora do período menstrual.',
    },
    {
      q: 'Todo procedimento pode ser feito já na primeira consulta?',
      a: 'Não necessariamente. Primeiro é realizada uma avaliação para compreender suas necessidades, seu histórico e definir uma indicação segura. Só então o procedimento é agendado.',
    },
    {
      q: 'Toda mulher na menopausa pode fazer reposição hormonal?',
      a: 'Não. A terapia de reposição hormonal tem indicações e contraindicações, e a decisão depende dos sintomas, do histórico de saúde e dos exames de cada mulher. A conduta é definida em consulta, de forma compartilhada.',
    },
    {
      q: 'A Dra. Claudia atende gestantes durante todo o pré-natal?',
      a: 'Sim. O acompanhamento obstétrico contempla as consultas de pré-natal, a solicitação e a leitura dos exames de cada trimestre e a orientação sobre o parto e o pós-parto.',
    },
    {
      q: 'Como faço para agendar uma consulta?',
      a: 'O agendamento é feito pelo WhatsApp (67) 99250-5165. O consultório fica na Rua Santana do Paraíso, 1026, Centro, em Bonito-MS.',
    },
  ],

  // --- Politica de privacidade (LGPD) ----------------------------------------
  // Vira a secao #privacidade da pagina, para onde o banner de consentimento
  // aponta. Um banner de cookies sem politica acessivel nao cumpre a LGPD.
  //
  // ATENCAO: texto redigido a partir do que o site TECNICAMENTE faz hoje
  // (nenhum formulario, nenhum dado de saude, apenas Google Analytics mediante
  // consentimento). Se algo mudar — formulario, chat, pixel de anuncio — o texto
  // precisa mudar junto. [CONFERIR] Recomendado revisar com a Dra. Claudia e,
  // idealmente, com assessoria juridica antes de ir para producao.
  //
  // Estrutura em duas camadas, como recomenda a ANPD: os `highlights` sao o
  // resumo que qualquer pessoa le em 10 segundos; as `sections` sao a politica
  // completa, dentro de um <details>.
  //
  // Cada secao aceita: `paragraphs` (obrigatorio), `list`, `table`, `link` e
  // `requiresAnalytics` (a secao some do HTML quando o build roda sem GA).
  //
  // Os marcadores {telefone}, {endereco} e {site} sao substituidos no build
  // pelos dados de `business`, para a politica nunca divergir do NAP.
  privacy: {
    // A politica vive em /privacidade, pagina propria. A home so linka para ela
    // (rodape + aviso de cookies), que e o que a LGPD pede: acesso facilitado e
    // ostensivo (arts. 6o, VI e 9o), nao o texto embutido na pagina inicial.
    path: '/privacidade',
    eyebrow: 'PRIVACIDADE E PROTEÇÃO DE DADOS',
    title: 'Política de Privacidade',
    // <title> e description da propria pagina. A description e separada do
    // `summary` porque o Google corta por volta de 160 caracteres.
    metaTitle: 'Política de Privacidade | Dra. Claudia Maciel',
    metaDescription:
      'Como o site da Dra. Claudia Maciel trata dados de navegação: sem formulários, sem dados de saúde e com cookies de análise apenas mediante consentimento (LGPD).',
    linkLabel: 'Política de privacidade',
    summary:
      'Este site é uma página informativa: não tem formulário, não pede dados pessoais e não registra nenhuma informação de saúde. A única coleta possível é a de estatísticas de navegação — e apenas se você autorizar.',
    legalNote: 'Lei nº 13.709/2018 (LGPD)',
    indexTitle: 'Nesta política',

    // Camada 1: o resumo visual. Cada item precisa ser verdadeiro sozinho, sem
    // depender do texto completo — e o unico trecho que muita gente vai ler.
    highlights: [
      {
        icon: '✚',
        title: 'Nenhum dado de saúde',
        text: 'O site não coleta, não guarda e não transmite qualquer informação sobre a sua saúde.',
      },
      {
        icon: '◇',
        title: 'Sem formulários',
        text: 'Não há cadastro, login nem chat. Nada é pedido a você para navegar por aqui.',
      },
      {
        icon: '◌',
        title: 'Cookies só com o seu aceite',
        text: 'Antes da autorização, nenhum cookie de análise é gravado e o Analytics nem é carregado.',
      },
      {
        icon: '↺',
        title: 'Você pode mudar de ideia',
        text: 'A autorização é revogável a qualquer momento, em um clique, no fim desta página.',
      },
    ],

    // Camada 2: a politica completa.
    sections: [
      {
        title: 'Quem é responsável pelos seus dados',
        paragraphs: [
          'A controladora dos dados tratados neste site é Claudia Estela Maciel Davalos (Dra. Claudia Maciel), CRM/MS 5944 — RQE 4352, com consultório na {endereco}.',
          'Canal de atendimento para assuntos de privacidade: {telefone} (telefone e WhatsApp). Por se tratar de agente de tratamento de pequeno porte, nos termos da Resolução CD/ANPD nº 2/2022, não há encarregado formalmente nomeado: este canal cumpre essa função e recebe qualquer pedido relacionado a dados pessoais.',
        ],
      },
      {
        title: 'A que este documento se aplica',
        paragraphs: [
          'Esta política trata exclusivamente do site {site}. Ela explica o que acontece — e o que não acontece — com os seus dados enquanto você navega por estas páginas.',
          'O tratamento de dados dentro do consultório (prontuário, exames, resultados, agendamento) é outra coisa: está protegido pelo sigilo médico e pelas normas do Conselho Federal de Medicina, e não é objeto deste documento.',
        ],
      },
      {
        title: 'Que dados são coletados',
        paragraphs: [
          'Nenhum dado é solicitado a você neste site: não há formulário, cadastro, chat ou área de login.',
          'Se — e somente se — você autorizar no aviso de cookies, o Google Analytics 4 registra dados de navegação de forma agregada:',
          'Esses dados não permitem identificar você e não são cruzados com nenhum cadastro do consultório.',
        ],
        list: [
          'seções da página visitadas e tempo de permanência;',
          'tipo de dispositivo, navegador e sistema operacional;',
          'origem do acesso (por exemplo, uma busca no Google ou um link do Instagram);',
          'localização aproximada em nível de cidade, derivada do endereço IP — que é anonimizado pelo próprio Google e não é armazenado.',
        ],
      },
      {
        title: 'Dados de saúde',
        paragraphs: [
          'Este site não coleta, não armazena e não transmite qualquer informação sobre a sua saúde. Dados clínicos existem apenas no prontuário do consultório, protegidos pelo sigilo médico (Código de Ética Médica) e tratados fora deste site.',
          'Como consequência, o site não realiza tratamento de dados pessoais sensíveis na acepção do art. 5º, II, da LGPD.',
        ],
      },
      {
        title: 'Cookies e armazenamento local',
        requiresAnalytics: true,
        paragraphs: [
          'Antes da sua autorização, nenhum cookie de análise é gravado e o script do Google Analytics sequer é baixado.',
          'Ao registrar sua escolha no aviso de cookies, o site guarda essa preferência no seu próprio navegador, para não perguntar de novo a cada visita. Essa preferência não é enviada a ninguém.',
        ],
        table: {
          head: ['Nome', 'Finalidade', 'Origem', 'Validade'],
          rows: [
            ['_ga', 'Distinguir visitantes para a contagem de visitas.', 'Google Analytics', '2 anos'],
            ['_ga_*', 'Manter o estado da sessão de análise.', 'Google Analytics', '2 anos'],
            [
              'cm-consent',
              'Guardar a sua resposta ao aviso de cookies (armazenamento local).',
              'Este site',
              'Até você limpar os dados do navegador',
            ],
          ],
        },
      },
      {
        title: 'Base legal e finalidade',
        paragraphs: [
          'O tratamento dos dados de navegação tem como base legal o seu consentimento (art. 7º, I, da LGPD) e como única finalidade entender como o site é usado, para melhorá-lo.',
          'Os dados não são usados para publicidade, não alimentam perfis de anúncios, não são vendidos e não embasam nenhuma decisão automatizada a seu respeito.',
        ],
      },
      {
        title: 'Com quem os dados são compartilhados',
        paragraphs: [
          'O único terceiro envolvido é o Google, na condição de operador, por meio do Google Analytics 4. Não há pixel de rede social, ferramenta de remarketing ou qualquer outro rastreador nesta página.',
          'Os sinais de publicidade do Google (ad_storage, ad_user_data e ad_personalization) permanecem desativados mesmo depois do seu aceite.',
        ],
      },
      {
        title: 'Transferência internacional de dados',
        paragraphs: [
          'O Google Analytics processa os dados de navegação em servidores localizados fora do Brasil. Essa transferência internacional ocorre com base no seu consentimento específico (art. 33, VIII, da LGPD) e nas cláusulas de proteção de dados do contrato do Google Analytics.',
          'Se você recusar os cookies de análise, nenhum dado seu sai do seu navegador — nem para o Brasil, nem para o exterior.',
        ],
      },
      {
        title: 'Por quanto tempo os dados ficam guardados',
        paragraphs: [
          'Os dados de navegação são retidos pelo Google Analytics por até 14 meses e depois excluídos automaticamente. A preferência de cookies fica no seu navegador até você limpá-la ou alterá-la.',
        ],
      },
      {
        title: 'Segurança da informação',
        paragraphs: [
          'Todo o acesso ao site é feito por conexão criptografada (HTTPS). O site é estático: não possui banco de dados, área administrativa ou qualquer local onde dados de visitantes possam ser armazenados no servidor.',
          'Ainda assim, nenhuma tecnologia é infalível. Se um incidente de segurança relevante vier a ocorrer, ele será comunicado conforme o art. 48 da LGPD.',
        ],
      },
      {
        title: 'Links para serviços de terceiros',
        paragraphs: [
          'Os botões de WhatsApp, telefone, Instagram e mapa levam você para serviços de terceiros (Meta, Google), que têm políticas de privacidade próprias. A partir do clique, o tratamento dos seus dados passa a ser regido por essas políticas, não por esta.',
          'A conversa de agendamento acontece dentro do WhatsApp. Evite enviar por lá informações detalhadas sobre a sua saúde: esses assuntos são tratados na consulta.',
        ],
      },
      {
        title: 'Crianças e adolescentes',
        paragraphs: [
          'Este site não é direcionado a crianças e não coleta dados de nenhum visitante, qualquer que seja a idade. O atendimento de adolescentes no consultório segue as normas do Conselho Federal de Medicina e o sigilo médico, fora do alcance deste documento.',
        ],
      },
      {
        title: 'Seus direitos e como exercê-los',
        paragraphs: [
          'O art. 18 da LGPD garante a você, a qualquer momento e gratuitamente, o direito de:',
          'Para exercer qualquer um deles, basta entrar em contato pelo {telefone}. A resposta é enviada imediatamente, em formato simplificado, ou em até 15 dias, quando a solicitação exigir uma declaração completa (art. 19 da LGPD).',
        ],
        list: [
          'confirmar que existe tratamento de dados seus e acessá-los;',
          'corrigir dados incompletos, inexatos ou desatualizados;',
          'pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários ou excessivos;',
          'solicitar a portabilidade dos dados a outro fornecedor;',
          'pedir a eliminação dos dados tratados com base no seu consentimento;',
          'saber com quais entidades os dados foram compartilhados;',
          'ser informada sobre a possibilidade de não consentir e as consequências disso;',
          'revogar o consentimento a qualquer momento.',
        ],
      },
      {
        title: 'Reclamação à autoridade',
        paragraphs: [
          'Se você entender que os seus direitos não foram atendidos, pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), nos termos do art. 18, §1º, da LGPD.',
        ],
        link: { label: 'Acessar o canal da ANPD', href: 'https://www.gov.br/anpd/pt-br' },
      },
      {
        title: 'Alterações desta política',
        paragraphs: [
          'Esta política pode ser atualizada quando o site mudar. A data da última atualização fica indicada no início desta seção — vale a pena conferi-la de tempos em tempos.',
        ],
      },
    ],

    // Cartao de encerramento: contato + revogacao do consentimento.
    contact: {
      title: 'Fale sobre os seus dados',
      text: 'Dúvidas, pedidos de acesso ou de eliminação e revogação do consentimento podem ser tratados diretamente pelo {telefone} (telefone e WhatsApp), ou pessoalmente na {endereco}.',
      cookiesLabel: 'Alterar minha preferência de cookies',
    },
    updated: '2026-09-07',
  },
};

export default site;
