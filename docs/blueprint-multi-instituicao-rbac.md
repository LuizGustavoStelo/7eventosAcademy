# Blueprint Técnico: Multi-Instituição com RBAC Avançado

## 1. Objetivo

Evoluir a plataforma para suportar dois modos operacionais, sem ruptura:

1. Modo atual: professor autônomo (single-account).
2. Modo institucional: uma instituição com múltiplos usuários, múltiplos perfis e permissões granulares (ex.: coordenador, tutor, secretaria, financeiro).

A evolução deve preservar compatibilidade com dados existentes, permitir migração incremental e garantir isolamento forte entre instituições.

## 2. Escopo

### 2.1 Incluído

- Modelo de dados multi-instituição.
- RBAC avançado com papéis customizáveis por instituição.
- Estratégia de migração sem Big Bang.
- Contratos de API para contexto institucional.
- Diretrizes de frontend para troca de contexto de instituição.
- Auditoria, segurança e observabilidade.

### 2.2 Não incluído (fase posterior)

- Hierarquia complexa de unidades/campus.
- BI avançado e data warehouse.
- SSO corporativo (SAML/OIDC enterprise).

## 3. Princípios arquiteturais

- Isolamento de tenant por chave de partição: `institution_id`.
- Segurança por padrão: toda query tenant-aware.
- Autorização por política (RBAC + regras contextuais).
- Migração por fases com dual-read/dual-write temporário.
- Backward compatibility até cutover completo.
- Observabilidade obrigatória por instituição e por módulo.

## 4. Estado atual resumido

Hoje já existe separação por `ownerAdminId` em partes do domínio (ex.: cursos e fluxos associados). Essa abordagem resolve o cenário "professor autônomo", mas limita expansão para equipes institucionais com múltiplos perfis.

## 5. Arquitetura alvo

### 5.1 Camadas

- Global (plataforma): `superadmin`, catálogo global de permissões, billing da plataforma, licenciamento global.
- Institucional (tenant): usuários membros, papéis locais, cursos/turmas/alunos/financeiro/agenda próprios.

### 5.2 Entidades principais (alvo)

- `institutions`
- `institution_members`
- `roles`
- `permissions`
- `role_permissions`
- `member_roles`
- `institution_invitations`
- `audit_logs`

### 5.3 Chave de isolamento

Todas as entidades acadêmicas e financeiras devem carregar `institution_id`:

- `courses`, `classes`, `students` (ou vínculo aluno-instituição), `enrollments`
- `attendance`, `class_notices`, `study_materials`, `agenda`
- `monthly_charges`, `payment_transactions`, `account_financial_configs`
- `upload_bindings` (direta ou indiretamente via owner)

## 6. Modelo de dados proposto (Prisma)

### 6.1 Tabelas novas

#### `institutions`

- `id` (uuid)
- `name`
- `slug` (único)
- `status` (`active`, `inactive`, `suspended`)
- `created_at`, `updated_at`

Índices:

- `unique(slug)`
- `index(status)`

#### `institution_members`

- `id` (uuid)
- `institution_id` (fk)
- `user_id` (fk)
- `status` (`active`, `invited`, `suspended`)
- `joined_at`, `created_at`, `updated_at`

Restrições:

- `unique(institution_id, user_id)`

Índices:

- `index(user_id)`
- `index(institution_id, status)`

#### `roles`

- `id` (uuid)
- `institution_id` (nullable para role global/template)
- `code` (ex.: `institution_owner`, `coordinator`)
- `name`
- `is_system` (bool)
- `created_at`, `updated_at`

Restrições:

- `unique(institution_id, code)`

#### `permissions`

- `id` (uuid)
- `code` (único, ex.: `courses.read`, `students.manage`)
- `description`
- `created_at`, `updated_at`

#### `role_permissions`

- `role_id` (fk)
- `permission_id` (fk)

Restrições:

- `unique(role_id, permission_id)`

#### `member_roles`

- `member_id` (fk)
- `role_id` (fk)

Restrições:

- `unique(member_id, role_id)`

#### `institution_invitations`

- `id` (uuid)
- `institution_id` (fk)
- `email`
- `invited_by_member_id`
- `token_hash`
- `expires_at`
- `accepted_at` (nullable)
- `created_at`, `updated_at`

#### `audit_logs`

- `id` (uuid)
- `institution_id` (nullable para escopo global)
- `actor_user_id`
- `actor_member_id` (nullable)
- `action`
- `resource_type`
- `resource_id`
- `metadata_json`
- `ip`, `user_agent`
- `created_at`

Índices:

- `index(institution_id, created_at)`
- `index(actor_user_id, created_at)`

### 6.2 Entidades existentes (alterações)

Adicionar `institution_id` com índice em:

- `courses`
- `classes`
- `enrollments`
- `monthly_charges`
- `payment_transactions`
- `class_notices`
- `study_materials`
- `student_courses`
- `account_financial_configs`

Para alunos, duas opções:

1. Simples (recomendada para evolução rápida): manter `users.role = user` e adicionar `users.owner_admin_id` + `users.institution_id`.
2. Estrutural (alvo final): criar `students` como entidade própria e permitir mesmo usuário em múltiplas instituições via tabela de vínculo.

Recomendação: iniciar com opção 1 e evoluir para opção 2 quando houver demanda real de aluno multi-instituição.

## 7. Matriz inicial de papéis e permissões

Papéis institucionais sugeridos:

- `institution_owner`
- `institution_admin`
- `coordinator`
- `professor`
- `tutor`
- `secretaria`
- `financeiro`
- `viewer`

Permissões base (exemplos):

- `institution.members.read`, `institution.members.invite`, `institution.members.manage_roles`
- `courses.read`, `courses.create`, `courses.update`, `courses.delete`
- `classes.read`, `classes.create`, `classes.update`, `classes.delete`
- `students.read`, `students.create`, `students.update`, `students.delete`
- `enrollments.read`, `enrollments.create`, `enrollments.delete`
- `attendance.read`, `attendance.write`
- `materials.read`, `materials.write`, `notices.write`
- `finance.read`, `finance.write`, `finance.reconcile`
- `reports.read`

Regras contextuais complementares (ABAC leve):

- Professor pode escrever presença apenas em turmas atribuídas a ele.
- Tutor pode visualizar alunos apenas das turmas atribuídas.
- Coordenador gerencia cursos/turmas da instituição inteira.

## 8. Autenticação e contexto institucional

### 8.1 JWT

Adicionar claims:

- `sub`
- `globalRole` (`superadmin` ou `null`)
- `activeInstitutionId`
- `activeMemberId`
- `activeRoleCodes` (lista)

### 8.2 Troca de instituição

Endpoint:

- `POST /auth/switch-institution`

Entrada:

- `institutionId`

Saída:

- novo `accessToken` com contexto ativo atualizado.

## 9. Backend: padrão de autorização

### 9.1 Guardas

- `JwtAuthGuard` (já existente, evoluir claims)
- `InstitutionContextGuard` (valida membership ativo)
- `PermissionsGuard` (valida permissões declaradas no endpoint)

### 9.2 Decorators

- `@RequirePermissions('courses.read')`
- `@InstitutionScoped()` para forçar contexto tenant.

### 9.3 Repositórios/serviços

Regra de implementação:

- Toda query tenant-aware deve receber `institutionId` explicitamente.
- Proibido `findMany` administrativo sem filtro de instituição, exceto rotas de `superadmin` global.

## 10. Frontend: mudanças estruturais

- Seletor de instituição no cabeçalho para usuários com múltiplos vínculos.
- Tela de membros e papéis da instituição.
- Fluxo de convite por e-mail.
- Controle condicional de menus por permissões do token ativo.
- Mensagens claras quando usuário não possuir permissão.

## 11. Estratégia de migração (sem downtime)

## Fase 0: Preparação

- Criar feature flags:
  - `ff_multi_institution_read`
  - `ff_multi_institution_write`
  - `ff_rbac_v2`
- Criar testes de contrato para endpoints críticos.

## Fase 1: Schema expand

- Criar tabelas novas (`institutions`, `institution_members`, RBAC v2, convites, audit).
- Adicionar colunas `institution_id` nullable nas tabelas alvo.
- Criar índices e FKs sem remover estruturas legadas.

## Fase 2: Backfill

- Para cada `admin` atual, criar uma `institution` de 1 membro.
- Vincular dados existentes por `ownerAdminId` para `institution_id`.
- Preencher `institution_members` para admins existentes.
- Relatório de consistência (linhas órfãs, nulos indevidos, divergências).

## Fase 3: Dual-write

- Escrita em estruturas antigas e novas ao mesmo tempo.
- Leitura ainda preferencialmente legada com comparação de consistência.
- Métrica de divergência por endpoint.

## Fase 4: Read switch

- Ativar leitura por `institution_id` progressivamente por módulo:
  1. `courses`
  2. `classes`
  3. `students`
  4. `enrollments`
  5. `attendance/materials/notices/agenda`
  6. `finance`

## Fase 5: RBAC v2

- Ativar `PermissionsGuard` por rotas institucionais.
- Migrar tela de gestão de usuários para membros/papéis.
- Validar trilhas de auditoria.

## Fase 6: Contract e cleanup

- Tornar `institution_id` `NOT NULL` onde aplicável.
- Remover dependência funcional de `ownerAdminId` (manter temporariamente apenas para rollback curto).
- Consolidar documentação e runbooks.

## 12. Plano de rollback

- Rollback por fase, nunca global.
- Enquanto dual-write estiver ativo, rollback de leitura é imediato via feature flag.
- Migrações destrutivas (drop de legado) só após janela de estabilidade mínima (ex.: 30 dias).

## 13. Qualidade e testes

### 13.1 Testes obrigatórios

- Unitários de política de autorização.
- Integração por endpoint com cenários cross-tenant.
- E2E de convite, troca de instituição e gestão de papéis.
- Testes de regressão para modo professor autônomo.

### 13.2 Casos críticos

- Usuário A não lê/edita recursos da instituição B.
- Professor não altera turma não atribuída.
- Tutor não acessa financeiro.
- Coordenador acessa todos os cursos da própria instituição.

## 14. Observabilidade e operação

- Log estruturado com `institutionId`, `memberId`, `requestId`.
- Dashboard de erros por instituição e módulo.
- Alertas:
  - aumento de 403 por rota
  - divergência dual-write
  - falhas de backfill

Atualizar runbook com:

- procedimentos de troca de instituição
- procedimentos de convite/remoção de membro
- playbook de incidente de vazamento cross-tenant

## 15. Segurança

- Princípio do menor privilégio em todos os papéis.
- Tokens curtos, rotação de refresh token.
- Auditoria imutável para ações sensíveis.
- Revisão semestral da matriz de permissões.
- Testes de segurança para bypass de `institution_id` por URL e payload.

## 16. Cronograma sugerido

- Fase 0-1: 1 a 2 semanas
- Fase 2: 1 semana
- Fase 3-4: 2 a 4 semanas (por módulo)
- Fase 5: 1 a 2 semanas
- Fase 6: 1 semana

Total estimado: 6 a 10 semanas, dependendo de volume de dados e janelas de homologação.

## 17. Definition of Done

- 100% das rotas institucionais com filtro por `institution_id`.
- 0 falhas de isolamento em suíte automatizada cross-tenant.
- RBAC v2 ativo em produção para módulos críticos.
- Modo professor autônomo funcionando via instituição de 1 membro.
- Runbook, arquitetura e RBAC atualizados no repositório.

## 18. Próximos artefatos recomendados

1. ADR-001: decisão oficial de `institution_id` como partição primária.
2. ADR-002: modelo RBAC v2 (roles + permissions + policies).
3. Documento de migração detalhado por tabela (SQL + validações).
4. Plano de testes de isolamento multi-instituição.
