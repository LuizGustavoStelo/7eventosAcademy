# 7Eventos Academy

Aplicação dedicada da Academy em arquitetura de monorepo, com frontend React + Vite e backend NestJS + Fastify.

## Estrutura

- `apps/frontend`: aplicação web administrativa (`superadmin` e `admin/professor`)
- `apps/backend`: API modular da plataforma
- `infra/docker`: Dockerfiles e `docker-compose.yml`
- `infra/nginx`: configuração do subdomínio `academy.7eventos.com`
- `docs`: documentação técnica e operacional
- `integrations/wordpress/7academy`: plugin WordPress `7academy`

## Requisitos

- Node.js 22+
- npm 10+
- Docker e Docker Compose (para ambiente containerizado)

## Primeiros passos

1. Instalar dependências na raiz: `npm install`
2. Subir banco e redis com Docker Compose: `docker compose -f infra/docker/docker-compose.yml up -d db redis`
3. Aplicar migrações do backend: `npm run prisma:migrate:deploy --workspace backend`
4. Rodar backend: `npm run dev:backend`
5. Rodar frontend: `npm run dev:frontend`

## Autenticação inicial

- `POST /api/auth/register`: cria usuário com perfil `admin`.
- `POST /api/auth/login`: autentica e retorna `accessToken` e dados do usuário.
- Perfis RBAC previstos na base: `user`, `admin`, `superadmin`.

## Padrões obrigatórios

- Idioma: pt-BR
- Encoding: UTF-8
- Separação de responsabilidades por módulos
- RBAC base: `superadmin`, `admin`, `user`

## Plugin WordPress (7academy)

Documentação base:

- Guia de setup: `docs/wordpress-plugin-setup.md`
- Código do plugin: `integrations/wordpress/7academy`

Escopo inicial do plugin:

- Shortcode `[area-do-aluno]`
- Shortcode `[formulario-cadastro-aluno]`
- Menu lateral no WordPress Admin com nome `7academy`
- Painel com status de conexão, versão e configurações mínimas

Diretrizes de segurança:

- WordPress é tratado como ambiente não confiável.
- Dados acadêmicos sensíveis não devem ser persistidos no banco do WordPress.
- Autenticação, autorização e regra de negócio ficam no backend Academy.

Atualização automática sem loja oficial:

- Endpoint de atualização no próprio domínio Academy: `https://academy.7eventos.com/atualizacoes-api`
- Distribuição de artefato via GitHub Releases (preferencialmente privado)
- O WordPress consulta a API de atualização e instala o `.zip` autorizado

Licenciamento e bloqueio de uso não autorizado:

- Plugin com campo de chave de licença no painel administrativo
- Licença vinculada ao domínio (`home_url`) e validada pela API Academy
- Sem licença válida, funcionalidades críticas devem permanecer bloqueadas
- A gestão de licenças e atualizações deve ser visível apenas para `superadmin` no sistema Academy

## Roadmap inicial

1. Fase 0: fundação técnica e CI/CD
2. Fase 1: núcleo acadêmico (cursos, turmas, matrículas)
3. Fase 2: superadmin e impersonação
4. Fase 3: financeiro (Sicoob)
5. Fase 4: presença, materiais e relatórios

## Operação em produção

- Guia completo de implantação: `docs/implantacao-producao.md`
