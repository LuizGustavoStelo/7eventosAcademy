# Arquitetura da Plataforma Academy

## Visão geral

A plataforma segue o padrão de monólito modular no backend e SPA no frontend.

- Frontend: React + TypeScript + Vite
- Backend: NestJS + Fastify + Prisma
- Banco: PostgreSQL 16
- Cache/filas: Redis 7
- Deploy: Docker + Nginx + GitHub Actions + GHCR

## Estrutura de módulos (backend)

- `auth`: autenticação, refresh token, guards
- `users`: usuários, perfis e dados de conta
- `accounts`: multi-tenant
- `courses`: catálogo de cursos
- `classes`: turmas e agenda
- `enrollments`: matrículas
- `attendance`: presença
- `finance`: mensalidades e transações
- `materials`: materiais e avisos
- `audit`: trilha de auditoria
- `impersonation`: sessão de impersonação do superadmin

## Regras arquiteturais

- Cada módulo possui domínio, aplicação e infraestrutura bem separados.
- Toda ação crítica é auditável.
- Endpoints administrativos exigem RBAC.
- Operações externas (ex.: webhook Sicoob) devem ser idempotentes.

## Gestão segura de credenciais de integrações

Para suportar múltiplos gateways por admin/conta (Sicoob e outras APIs), o padrão é:

- Não armazenar `client_secret`, token privado ou API key em `.env`.
- Salvar credenciais por tenant/admin em tabela de cofre (`integration_credentials`).
- Persistir somente payload criptografado (`ciphertext`) e metadados.
- Ler chave mestra de arquivo protegido (`SECRETS_MASTER_KEY_FILE`), montado como Docker secret.
- Controlar rotação por versão (`key_version`) e manter trilha de auditoria.

Campos sugeridos para o cofre:

- `id`
- `account_id`
- `admin_id` (ou `created_by`)
- `provider` (ex.: `sicoob`, `asaas`, `pagarme`)
- `environment` (`sandbox`/`production`)
- `ciphertext`
- `key_version`
- `created_at`
- `updated_at`
- `last_rotated_at`
