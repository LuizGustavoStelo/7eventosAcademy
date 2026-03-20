# Plano do Plugin WordPress para Portal do Aluno (API Segura)

Versão: `1.0`  
Data: `20/03/2026`  
Status: `Planejado para execução`

## 1) Objetivo

Criar um plugin WordPress que disponibilize o portal do aluno e o formulário de cadastro por shortcode, com integração segura à API principal da Academy, sem expor banco de dados, segredos críticos ou privilégios administrativos ao ambiente WordPress.

## 2) Nomenclatura recomendada (substituindo “embed”)

Termo técnico oficial do projeto:

- **Módulo Incorporado Seguro (MIS)**

Termos alternativos aceitáveis:

- **Portal Incorporado**
- **Módulo Integrado do Aluno**
- **Janela Segura da Academy**

Padronização proposta:

- Rotas técnicas no backend podem continuar com `/mis/...`.
- Na comunicação com cliente/time, usar “Módulo Incorporado Seguro”.

## 3) Escopo funcional do plugin

Shortcodes obrigatórios:

- `[area-do-aluno]`: exibe o portal do aluno (perfil, status de matrícula, materiais, avisos, histórico essencial).
- `[formulario-cadastro-aluno]`: exibe formulário de cadastro/pré-matrícula.

Painel de configuração do plugin (WordPress admin):

- URL base da Academy (`https://academy.7eventos.com`).
- Identificador público da instituição (`tenant_slug` ou `tenant_id` público).
- Chave pública de verificação (quando aplicável).

## 4) Arquitetura-alvo (WordPress como ambiente não confiável)

Princípio central:

- O WordPress atua como **host de interface**, não como fonte de verdade.

Regras:

- Toda autenticação e autorização acontecem na Academy.
- Toda lógica de negócio e dados sensíveis permanecem na Academy.
- O plugin WordPress não possui credenciais de banco da Academy.
- O plugin não mantém token mestre de API com alto privilégio.

Fluxo de alto nível:

1. Página WordPress renderiza shortcode.
2. Shortcode carrega o Módulo Incorporado Seguro (MIS) da Academy.
3. Usuário autentica diretamente na Academy.
4. MIS consome API da Academy com sessão do próprio usuário.
5. Dados são exibidos no módulo sem persistir PII no WordPress.

## 5) Estratégia de dados (decisão formal)

Decisão:

- **Não armazenar dados acadêmicos de aluno no banco do WordPress.**

Permitido no WordPress (mínimo necessário):

- Configuração técnica do plugin.
- Preferências visuais não sensíveis.
- Cache temporário sem PII (se necessário e com expiração curta).

Proibido no WordPress:

- Dados pessoais completos de aluno.
- Situação financeira detalhada.
- Tokens de longa duração da Academy.
- Qualquer credencial administrativa da API.

## 6) Segurança de aplicação e API (nível profissional)

Autenticação e sessão:

- OAuth2/OIDC com Authorization Code + PKCE.
- Cookies `HttpOnly`, `Secure`, com política `SameSite` adequada ao domínio.
- Rotação de refresh token e revogação em logout.

Autorização:

- RBAC/ABAC no backend por recurso e ação.
- Escopos mínimos por endpoint.
- Nenhuma autorização delegada ao WordPress.

Proteções de API:

- TLS obrigatório fim a fim.
- Rate limiting por IP, rota e usuário.
- Idempotência para operações críticas.
- Auditoria imutável com trilha por usuário, IP, user-agent e correlação.

Infraestrutura:

- Banco da Academy sem exposição pública de porta.
- Segredos em cofre (`Vault`, `AWS Secrets Manager` ou equivalente).
- Rotação periódica de chaves e segredo.
- WAF e monitoramento de anomalias.

## 7) Contrato mínimo de API (v1)

Leitura do aluno autenticado:

- `GET /v1/aluno/me`
- `GET /v1/aluno/matriculas`
- `GET /v1/aluno/materiais`
- `GET /v1/aluno/avisos`

Cadastro/pré-matrícula:

- `POST /v1/public/cadastros`

Controles obrigatórios para `POST /v1/public/cadastros`:

- Anti-bot (`hCaptcha` ou equivalente).
- Rate limit agressivo.
- Validação forte de payload.
- Registro de auditoria e antifraude básico.

## 8) Estrutura sugerida do plugin WordPress

Arquivos iniciais:

- `wp-content/plugins/academy-mis/academy-mis.php`
- `wp-content/plugins/academy-mis/includes/class-academy-mis-shortcodes.php`
- `wp-content/plugins/academy-mis/includes/class-academy-mis-settings.php`
- `wp-content/plugins/academy-mis/assets/css/academy-mis.css`

Responsabilidades:

- Registrar shortcodes.
- Sanitizar atributos de shortcode.
- Gerar contêiner seguro de renderização do MIS.
- Gerenciar configurações não sensíveis.

## 9) Endurecimento específico para WordPress

- Verificação de capabilities no admin (`manage_options`).
- Nonces em ações administrativas do plugin.
- Sanitização e escaping em todas as saídas.
- Não registrar logs com PII.
- Bloquear exibição de configurações sensíveis em tela.
- Não expor endpoints REST do plugin sem necessidade real.

## 10) Fases de execução

Fase 1: Arquitetura e contrato

- Definir endpoints finais da API v1.
- Definir política de autenticação/sessão.
- Definir modelo de auditoria.

Fase 2: Backend Academy

- Implementar endpoints de aluno e cadastro.
- Implementar controles de segurança (rate limit, antifraude, auditoria).
- Publicar MIS com rotas dedicadas.

Fase 3: Plugin WordPress

- Criar plugin base com os dois shortcodes.
- Implementar painel de configuração mínima.
- Validar responsividade desktop/mobile.

Fase 4: Segurança e homologação

- Testes de invasão focados em WordPress hostil.
- Revisão de logs e trilha de auditoria.
- Checklist LGPD e política de retenção.

Fase 5: Go-live controlado

- Liberação por ambiente (staging > produção).
- Monitoramento reforçado nas primeiras semanas.
- Plano de rollback documentado.

## 11) Critérios de aceite

- Shortcodes funcionando em produção com desempenho adequado.
- Zero dado acadêmico persistido no WordPress.
- API protegida com autenticação robusta e trilha de auditoria.
- Sem credenciais críticas da Academy dentro do plugin.
- Testes de segurança aprovados antes de abrir para todos os alunos.

## 12) Risco residual importante

Se terceiros controlam o WordPress, ainda existe risco de manipulação de página para engenharia social. Para ações sensíveis (login, confirmação de identidade, operações financeiras), preferir fluxo no domínio da Academy com indicadores visuais claros de domínio e sessão.
