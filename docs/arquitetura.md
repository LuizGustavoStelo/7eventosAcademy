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
