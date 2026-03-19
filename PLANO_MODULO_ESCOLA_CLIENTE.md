# Plano de Ação Profissional — Plataforma Academy (Aplicação Dedicada)

Versão: `2.3`  
Data: `19/03/2026`  
Status: `Aprovado para execução`

## 1) Decisão estratégica

A solução será uma aplicação independente da 7Eventos, publicada em:

- `https://academy.7eventos.com` (frontend)
- `https://academy.7eventos.com/api` (backend)

Objetivo: separar domínio acadêmico, preservar o core da 7Eventos e acelerar evolução sem resíduos no sistema atual.

## 2) Escopo funcional confirmado

- Cursos presenciais de pós-graduação.
- Turmas com vagas e agenda de aulas recorrentes.
- Matrícula de aluno.
- Mensalidades e conciliação financeira.
- Presença por aula (credenciamento).
- Materiais de apoio e avisos por turma.
- Anotações internas do administrativo sobre alunos.
- Certificado não é gerado pela plataforma:
- a aplicação exibirá apenas link/arquivo/status disponibilizado pela instituição.

## 3) Arquitetura recomendada

### 3.1 Modelo técnico

Adotar **monólito modular** no backend (não microserviços nesta fase).

Motivos:

- menor tempo de entrega;
- menor complexidade operacional;
- rastreabilidade mais simples;
- evolução futura para serviços separados quando fizer sentido.

### 3.2 Stack profissional

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | React + TypeScript + Vite | Desenvolvimento rápido com base sólida |
| Servidor frontend | Nginx (container) | Entrega estática performática e estável |
| Backend | NestJS + TypeScript + Fastify | Estrutura enterprise, modular e testável |
| Banco | PostgreSQL 16 | Integridade relacional e bons relatórios |
| Cache/filas | Redis 7 (recomendado) | Webhooks, jobs e idempotência |
| ORM | Prisma | Migrações versionadas e tipagem forte |
| Auth | JWT + Refresh + RBAC | Controle fino por perfil |
| CI/CD | GitHub Actions + GHCR | Pipeline profissional e reproduzível |

### 3.3 Estrutura de repositório recomendada (profissional)

```text
academy-platform/
├── apps/
│   ├── backend/                 # NestJS (API, auth, domínio, integrações)
│   └── frontend/                # React + Vite
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   ├── backend.Dockerfile
│   │   └── frontend.Dockerfile
│   └── nginx/
│       └── academy.7eventos.com.conf
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
├── docs/
│   ├── arquitetura.md
│   ├── rbac.md
│   └── runbook-operacao.md
└── README.md
```

## 4) Deploy em subdomínio `academy.7eventos.com`

### 4.1 DNS

- Registro `A`/`AAAA` de `academy.7eventos.com` apontando para a VPS já configurada.

### 4.2 Nginx (reverse proxy na VPS)

Criar um `server` dedicado para o subdomínio, separado do bloco atual de `7eventos.com`.

Exemplo recomendado:

```nginx
server {
    listen 80;
    server_name academy.7eventos.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name academy.7eventos.com;

    client_max_body_size 32M;

    ssl_certificate /etc/letsencrypt/live/academy.7eventos.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/academy.7eventos.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4.3 SSL

- Emitir certificado com Let’s Encrypt para `academy.7eventos.com`.
- Renovação automática com `certbot`.

## 5) Containers e portas (produção enxuta e segura)

Portas propostas para esta aplicação:

- Frontend: `127.0.0.1:8090:80` (acesso apenas local, via Nginx reverse proxy)
- Backend: `127.0.0.1:3210:3210` (acesso apenas local, via Nginx reverse proxy)
- PostgreSQL: sem exposição de porta no host (acesso interno da rede Docker)
- Redis: sem exposição de porta no host (acesso interno da rede Docker)

Observação:

- Na sessão atual, o comando `docker` não está disponível para validar `docker ps`.
- As portas foram propostas para evitar colisão com o cenário que você mostrou anteriormente.

## 6) Docker Compose (base de produção)

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: academy-db
    environment:
      POSTGRES_DB: academy
      POSTGRES_USER: academy_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - academy_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U academy_user -d academy"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: academy-redis
    restart: unless-stopped

  backend:
    image: ghcr.io/<org>/<repo>-backend:${APP_VERSION:-latest}
    container_name: academy-backend
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3210:3210"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3210/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  frontend:
    image: ghcr.io/<org>/<repo>-frontend:${APP_VERSION:-latest}
    container_name: academy-frontend
    depends_on:
      - backend
    ports:
      - "127.0.0.1:8090:80"
    restart: unless-stopped

volumes:
  academy_pgdata:
```

### 6.1 Estrutura mínima no servidor (como você pediu)

Diretório único de runtime:

```text
/var/www/7eventosAcademy
├── docker-compose.yml
├── .env
└── .env.example
```

Regras operacionais:

- não clonar repositório de código no servidor;
- não instalar Node.js na VPS para rodar a aplicação;
- backend/frontend rodam apenas por imagens do GHCR;
- manter estado somente em volumes Docker nomeados;
- manter Nginx e Certbot no host apenas como gateway TLS.

### 6.2 Fluxo de deploy com servidor mínimo

1. GitHub Actions builda imagens e publica no GHCR.
2. GitHub Actions conecta via SSH na VPS.
3. No diretório `/var/www/7eventosAcademy`, executa:
4. `docker compose pull`
5. `docker compose up -d --remove-orphans`
6. `docker compose exec backend npx prisma migrate deploy`
7. `docker image prune -f` (higiene de imagens antigas).

## 7) RBAC obrigatório: superadmin, admin e user

### 7.1 Perfis

- `superadmin`: visão global de contas, admins e auditoria.
- `admin`: gestão operacional da própria conta (turmas, alunos, presença, materiais, financeiro operacional).
- `user`: aluno com acesso ao portal acadêmico.

### 7.2 Permissões mínimas

| Recurso | superadmin | admin | user |
|---|---|---|---|
| Gerenciar contas | Sim | Não | Não |
| Gerenciar admins da conta | Sim | Não | Não |
| Impersonar admin/user | Sim | Não | Não |
| Gerenciar cursos/turmas | Sim | Sim | Não |
| Ver anotações internas | Sim | Sim | Não |
| Registrar presença | Sim | Sim | Não |
| Ver dados pessoais próprios | Sim | Sim | Sim |
| Consumir materiais e avisos | Sim | Sim | Sim (somente da própria turma) |

### 7.3 Impersonação (login como outro usuário)

Requisito funcional:

- O `superadmin` terá uma tela dedicada para listar contas, listar admins da conta e entrar como esse usuário.

Regras de segurança obrigatórias:

- exigir motivo da impersonação;
- token temporário com `exp` curto (ex.: 15 min);
- registrar `impersonator_id`, `target_user_id`, IP, user-agent e timestamp;
- banner fixo no sistema: `Você está acessando como <nome>`;
- ação explícita de `Encerrar impersonação`;
- auditoria não pode ser desativada.

Endpoints sugeridos:

- `GET /superadmin/accounts`
- `GET /superadmin/accounts/:accountId/admins`
- `POST /superadmin/impersonations`
- `POST /superadmin/impersonations/stop`

## 8) Modelo de dados (domínio acadêmico)

Tabelas principais:

- `accounts`
- `users`
- `roles`
- `courses`
- `classes`
- `class_schedules`
- `enrollments`
- `attendance_sessions`
- `attendance_records`
- `monthly_charges`
- `payment_transactions`
- `study_materials`
- `class_notices`
- `student_private_notes`
- `certificate_links`
- `audit_logs`
- `impersonation_sessions`

Regra de modelagem:

- `curso` é entidade de catálogo;
- `turma` é unidade operacional;
- `matrícula` liga aluno à turma;
- `presença` é por aula/sessão;
- `certificado` é apenas referência externa.

## 9) Integração com Sicoob

Fluxo profissional:

1. Criar mensalidade (`monthly_charges`).
2. Gerar cobrança na Sicoob.
3. Receber webhook de status.
4. Validar assinatura e idempotência.
5. Atualizar transação e mensalidade.
6. Refletir adimplência no status da matrícula.

Controles obrigatórios:

- idempotência por `external_charge_id`;
- fila de retry para webhook;
- trilha completa em `audit_logs`.

## 10) Build e deploy com GHCR + GitHub Actions

### 10.1 Imagens

- `ghcr.io/<org>/<repo>-backend:<tag>`
- `ghcr.io/<org>/<repo>-frontend:<tag>`

Tags recomendadas:

- `latest`
- `main-<sha_curto>`
- `vX.Y.Z`

### 10.2 Pipelines

`ci.yml` (PR):

- lint;
- testes;
- build backend/frontend;
- validação de migrações Prisma.

`cd.yml` (main/tags):

- build multi-stage;
- push no GHCR;
- deploy remoto via SSH em `/var/www/7eventosAcademy`:
- `docker compose pull`
- `docker compose up -d`
- `docker compose exec backend npx prisma migrate deploy`
- sem cópia de código-fonte para a VPS;
- rollback por tag anterior de imagem.

### 10.3 Secrets no GitHub

- `GHCR_PAT` (ou `GITHUB_TOKEN` com permissão de package)
- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `SICOOB_CLIENT_ID`
- `SICOOB_CLIENT_SECRET`
- `SICOOB_WEBHOOK_SECRET`

## 11) Guia de estilo obrigatório (seguir padrão visual do core 7Eventos)

Esta aplicação deve herdar a linguagem visual do core atual. Não criar tema novo.

### 11.1 Paleta oficial

| Token | Valor | Uso |
|---|---|---|
| Laranja principal | `#F25C05` | Botões primários, estados ativos, destaque |
| Preto profundo | `#1A1A1A` | Header, títulos fortes, contraste |
| Cinza grafite | `#444444` | Texto secundário e elementos neutros |
| Azul cobalto | `#0057A3` | Links e pontos informativos |
| Areia suave | `#F2EFEA` | Fundo de páginas |
| Branco | `#FFFFFF` | Superfícies e cartões |

### 11.2 Tokens de tema (CSS variables)

Manter os mesmos princípios já usados no core:

- `--primary: 23 96% 48%`
- `--primary-foreground: 0 0% 100%`
- `--secondary: 23 96% 48%`
- `--accent: 23 96% 48%`
- `--ring: 23 96% 48%`
- `--background: 0 0% 100%`
- `--foreground: 0 0% 3.9%`

### 11.3 Componentes

- botão primário: fundo `#F25C05`, texto branco;
- botão secundário: fundo `#444444`, texto branco;
- abas ativas: `#F25C05` com texto branco;
- cards: fundo branco, borda neutra e sombra leve;
- fundo padrão de tela: `#F2EFEA`.

### 11.4 Tipografia e layout

- manter tipografia alinhada ao core atual (sem introduzir família visual nova);
- foco em legibilidade, contraste e consistência;
- responsividade obrigatória para desktop e mobile;
- evitar variações visuais fora do design system.

### 11.5 Acessibilidade mínima

- contraste adequado em textos e botões;
- foco visível para navegação por teclado;
- mensagens de erro e sucesso com linguagem clara.

## 12) Fases de execução

### Fase 0 — Fundação

- novo repositório (`backend`, `frontend`, `infra`);
- dockerização completa;
- RBAC base;
- CI/CD com GHCR.

### Fase 1 — Núcleo acadêmico

- cursos, turmas, vagas, agenda;
- matrícula;
- portal admin e portal aluno (base).

### Fase 2 — Superadmin e impersonação

- painel de contas e admins;
- fluxo de acessar conta como admin;
- auditoria e trilha de segurança.

### Fase 3 — Financeiro Sicoob

- mensalidades;
- webhook;
- adimplência e bloqueios.

### Fase 4 — Presença, relatórios e materiais

- presença por aula;
- relatórios gerenciais;
- materiais, avisos e certificado (link/arquivo).

## 13) Próximos passos imediatos

1. Criar o novo repositório da aplicação Academy.
2. Criar a pasta de runtime `/var/www/7eventosAcademy` com `docker-compose.yml` e `.env`.
3. Subir a base com Docker Compose usando bind local (`127.0.0.1:3210` e `127.0.0.1:8090`).
4. Publicar o `server` do Nginx para `academy.7eventos.com`.
5. Configurar pipelines de `ci.yml` e `cd.yml` com push no GHCR.
6. Implementar autenticação, RBAC e módulo de impersonação do superadmin.
7. Iniciar módulos `courses/classes/enrollments` e presença.

## 14) Arquitetura de telas (UX/UI) — visão profissional

Este módulo detalha a disposição das telas da nova plataforma dedicada para cursos, turmas e lives.

Escopo desta fase:

- incluir `superadmin` e `admin/professor`;
- não incluir portal de aluno neste frontend (aluno será atendido via plugin WordPress).

### 14.1 Layout base da aplicação

Padrão visual para todas as áreas autenticadas:

- sidebar esquerda fixa (navegação principal);
- topbar superior com contexto da conta/turma, busca e perfil;
- área central com grid de 12 colunas;
- painel lateral direito opcional para ações rápidas e contexto.

Layout desktop:

- sidebar: `264px`;
- conteúdo central: fluido (`max-width` de leitura por seção);
- espaçamento padrão: `16px` entre blocos e `24px` entre seções.

Layout mobile:

- sidebar em drawer;
- topbar compacta com ações essenciais;
- cartões em coluna única;
- tabelas com modo responsivo por cards.

## 15) Mapa de navegação por perfil

### 15.1 Navegação `superadmin`

- Dashboard Global
- Contas (tenants)
- Admins por conta
- Impersonação
- Catálogo global (opcional estratégico)
- Operações de Lives (visão global)
- Auditoria e segurança
- Configurações da plataforma

### 15.2 Navegação `admin/professor`

- Dashboard da conta
- Cursos
- Turmas
- Agenda (aulas presenciais e lives)
- Alunos e matrículas
- Presença (credenciamento)
- Financeiro
- Conteúdo (materiais e biblioteca)
- Avisos e comunicação
- Relatórios
- Configurações da conta/perfil

## 16) Telas do `superadmin` (detalhamento)

### 16.1 Dashboard Global

Objetivo:

- visão executiva da operação multi-conta.

Layout:

- linha 1: KPIs (contas ativas, admins ativos, alunos ativos, taxa de adimplência).
- linha 2: gráficos (crescimento de matrículas, presença média, conversão por mês).
- linha 3: alertas operacionais (inadimplência alta, webhooks com falha, lives futuras).
- coluna lateral: ações rápidas (`Criar conta`, `Acessar conta`, `Ver auditoria`).

### 16.2 Gestão de Contas

Objetivo:

- administrar as contas/organizações da plataforma.

Layout:

- topo com busca, filtros (status, plano, segmento, criação) e botão `Nova conta`.
- tabela principal com colunas: conta, responsável, status, último acesso, turmas ativas.
- drawer lateral para resumo da conta e atalhos.

Itens obrigatórios:

- ativar/desativar conta;
- reset controlado de credenciais do admin principal;
- limites da conta (turmas, armazenamento, lives simultâneas).

### 16.3 Gestão de Admins por Conta

Objetivo:

- controlar administradores de cada conta.

Layout:

- cabeçalho da conta selecionada;
- tabela de admins com perfil, permissões, MFA, último login;
- painel de detalhes do admin.

Itens obrigatórios:

- criar admin;
- editar permissões;
- bloquear/desbloquear;
- forçar redefinição de senha;
- visualizar histórico de ações.

### 16.4 Tela de Impersonação

Objetivo:

- superadmin acessar conta/admin como suporte operacional.

Layout:

- etapa 1: selecionar conta;
- etapa 2: selecionar admin;
- etapa 3: informar motivo e tempo de sessão;
- etapa 4: confirmar acesso com duplo fator.

Itens obrigatórios:

- banner fixo durante impersonação;
- botão `Encerrar impersonação` sempre visível;
- log completo e imutável da sessão.

### 16.5 Operações de Lives (Global)

Objetivo:

- monitorar saúde das lives em todas as contas.

Layout:

- calendário semanal de lives;
- tabela de sessões com status (`agendada`, `ao vivo`, `encerrada`, `falha`);
- gráfico de audiência/conexão por período;
- alertas de incidentes por provedor.

### 16.6 Auditoria e Segurança

Objetivo:

- rastrear toda ação crítica da plataforma.

Layout:

- filtros por usuário, conta, tipo de ação, período e IP;
- timeline de eventos;
- visualização detalhada do payload de auditoria.

Itens obrigatórios:

- exportação (`CSV`/`JSON`);
- trilha de impersonação;
- trilha de alterações financeiras;
- trilha de permissões e acessos.

## 17) Telas do `admin/professor` (detalhamento)

### 17.1 Dashboard da Conta

Objetivo:

- visão diária para tomada de decisão rápida.

Layout:

- KPIs: alunos ativos, turmas abertas, presenças da semana, mensalidades pendentes.
- cards de agenda: próximas aulas presenciais e próximas lives.
- bloco de avisos recentes.
- bloco de tarefas pendentes (`lançar presença`, `publicar material`, `confirmar cobrança`).

### 17.2 Cursos

Objetivo:

- gerir catálogo acadêmico da conta.

Layout:

- lista de cursos em cards/tabela;
- filtros por área, status e coordenação;
- botão `Novo curso`;
- painel lateral com resumo do curso.

Itens da tela:

- nome, descrição, carga horária, coordenação;
- trilha modular (disciplinas/módulos);
- vínculo com turmas ativas.

### 17.3 Turmas

Objetivo:

- gerir execução operacional de cada oferta.

Layout:

- lista de turmas com filtros (`curso`, `status`, `turno`, `unidade`);
- visão `kanban` opcional por status (`planejamento`, `matrículas abertas`, `em andamento`, `encerrada`);
- detalhes em aba: `Alunos`, `Agenda`, `Materiais`, `Avisos`, `Financeiro`, `Presença`.

Itens obrigatórios:

- vagas totais e ocupadas;
- professor responsável;
- datas de início/fim;
- regras de presença mínima;
- situação acadêmica da turma.

### 17.4 Agenda (Aulas + Lives)

Objetivo:

- planejar encontros presenciais e sessões ao vivo.

Layout:

- calendário mensal/semanal;
- alternância de visão `Aulas` e `Lives`;
- painel de criação rápida de sessão.

Itens obrigatórios para lives:

- título, turma, professor, data/hora, duração;
- provedor de transmissão (`YouTube privado`, `Zoom`, `RTMP`, `Jitsi`, conforme decisão técnica);
- link de transmissão e chave de acesso;
- gravação (on/off) e destino da gravação.

### 17.5 Alunos e Matrículas

Objetivo:

- acompanhar situação acadêmica e administrativa.

Layout:

- tabela com filtros avançados (curso, turma, status, adimplência, presença);
- drawer de perfil do aluno;
- timeline de eventos do aluno.

Itens obrigatórios:

- status da matrícula;
- histórico de presença;
- histórico financeiro;
- materiais e avisos consumidos;
- campo de anotações internas (somente admin/professor autorizado).

### 17.6 Presença (Credenciamento)

Objetivo:

- registrar e auditar frequência por sessão.

Layout:

- seleção de turma e sessão;
- modos de marcação: QR Code, lista nominal, importação;
- quadro resumo com presentes, ausentes, percentual e pendências.

Itens obrigatórios:

- bloqueio de edição após fechamento da sessão;
- trilha de alteração manual;
- exportação de lista e relatório consolidado.

### 17.7 Financeiro

Objetivo:

- acompanhar mensalidades e inadimplência.

Layout:

- KPIs financeiros no topo;
- tabela de cobranças com status;
- filtros por turma, período, status e aluno;
- ações rápidas (`segunda via`, `reenviar cobrança`, `registrar acordo`).

Itens obrigatórios:

- visão por aluno;
- visão por turma;
- integração de status Sicoob em tempo real;
- histórico de tentativas de webhook.

### 17.8 Conteúdo (Materiais e Biblioteca)

Objetivo:

- publicar conteúdo complementar por turma e por aula.

Layout:

- aba `Materiais da Turma`;
- aba `Biblioteca Geral`;
- uploader com metadados (tipo, módulo, professor, visibilidade).

Itens obrigatórios:

- controle de versão de arquivo;
- vínculo por turma/sessão;
- permissões por perfil;
- data de publicação e expiração.

### 17.9 Avisos e Comunicação

Objetivo:

- comunicação acadêmica e operacional.

Layout:

- editor de aviso com modelos;
- lista de avisos ativos/expirados;
- segmentação por turma, curso e status de matrícula.

Itens obrigatórios:

- agendamento de aviso;
- prioridade (`normal`, `importante`, `urgente`);
- log de envio e leitura (quando disponível).

### 17.10 Relatórios

Objetivo:

- análise acadêmica, financeira e operacional.

Layout:

- filtros globais por período, curso, turma e status;
- blocos de relatório: presença, matrícula, adimplência, engajamento de lives;
- exportação em `CSV`, `XLSX` e `PDF`.

Relatórios mínimos:

- frequência por aluno/turma;
- evasão e retenção;
- inadimplência por turma;
- ocupação de vagas;
- desempenho de lives (sessões, participação, duração média).

## 18) Regras de UX para consistência profissional

- usar a paleta oficial da 7Eventos já definida neste documento;
- manter linguagem textual consistente (`Curso`, `Turma`, `Aluno`, `Matrícula`, `Presença`, `Live`);
- todas as telas com estado vazio orientado por ação;
- todas as ações críticas com confirmação;
- feedback imediato de sucesso/erro em operações;
- evitar mais de 3 níveis de navegação;
- priorizar tarefas do dia no dashboard de admin/professor;
- manter acessibilidade com foco visível e contraste mínimo adequado.

## 19) Entregáveis de design (para execução)

- sitemap final por perfil (`superadmin` e `admin/professor`);
- wireframes de baixa fidelidade de todas as telas listadas;
- design system aplicado ao padrão 7Eventos;
- protótipo navegável das jornadas críticas:
- gestão de turma;
- lançamento de presença;
- criação de live;
- impersonação do superadmin.

---

Decisão final: a estrutura em subdomínio dedicado + backend modular + RBAC completo + padrão visual do core 7Eventos é o caminho mais profissional para entregar rápido, manter governança e escalar sem acoplamento ao sistema atual.
