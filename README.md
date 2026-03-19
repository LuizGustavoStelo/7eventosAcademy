# 7Eventos Academy

Aplicação dedicada da Academy em arquitetura de monorepo, com frontend React + Vite e backend NestJS + Fastify.

## Estrutura

- `apps/frontend`: aplicação web administrativa (`superadmin` e `admin/professor`)
- `apps/backend`: API modular da plataforma
- `infra/docker`: Dockerfiles e `docker-compose.yml`
- `infra/nginx`: configuração do subdomínio `academy.7eventos.com`
- `docs`: documentação técnica e operacional

## Requisitos

- Node.js 22+
- npm 10+
- Docker e Docker Compose (para ambiente containerizado)

## Primeiros passos

1. Instalar dependências na raiz: `npm install`
2. Rodar backend: `npm run dev:backend`
3. Rodar frontend: `npm run dev:frontend`

## Padrões obrigatórios

- Idioma: pt-BR
- Encoding: UTF-8
- Separação de responsabilidades por módulos
- RBAC base: `superadmin`, `admin`, `user`

## Roadmap inicial

1. Fase 0: fundação técnica e CI/CD
2. Fase 1: núcleo acadêmico (cursos, turmas, matrículas)
3. Fase 2: superadmin e impersonação
4. Fase 3: financeiro (Sicoob)
5. Fase 4: presença, materiais e relatórios

## Operação em produção

- Guia completo de implantação: `docs/implantacao-producao.md`
