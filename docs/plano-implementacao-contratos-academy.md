# Plano de Implementação: Módulo de Contratos no 7EventosAcademy

## Objetivo

Implementar no `7EventosAcademy` um módulo de contratos inspirado no fluxo já existente no projeto `7Eventos`, adaptado à arquitetura atual da plataforma e aos requisitos de segurança, auditoria, privacidade e multi-instituição.

O objetivo funcional é:

- disponibilizar uma área `Contratos` para professor/admin;
- disponibilizar uma área `Contratos` para o aluno;
- permitir criação e publicação de modelos de contrato;
- permitir envio de contrato para assinatura quando desejado;
- permitir assinatura eletrônica com evidências suficientes de autoria, integridade e manifestação de vontade;
- permitir consulta e download posterior do contrato assinado.

## Decisão de produto e escopo

Este plano não depende de ICP-Brasil.

O módulo será construído para operar com assinatura eletrônica própria da plataforma, sustentada por:

- autenticação e autorização;
- vínculo do contrato ao aluno correto;
- OTP para confirmação;
- trilha de auditoria;
- hashes de integridade;
- armazenamento imutável dos artefatos assinados;
- registro de aceite com data, hora e contexto da assinatura.

Fica fora do escopo desta implementação:

- ICP-Brasil;
- assinatura qualificada;
- integração com prestadores externos de assinatura;
- múltiplos signatários na primeira fase;
- fluxo de responsável legal na primeira fase, salvo se surgir requisito operacional imediato.

## Base da análise

### O que existe hoje no `7Eventos`

O projeto `7Eventos` já possui um módulo de contratos com:

- CRUD de modelos;
- publicação de modelo;
- envio para assinatura;
- token de assinatura;
- OTP;
- geração de HTML assinado;
- geração de PDF assinado;
- trilha de auditoria com encadeamento por hash;
- arquivamento de contratos assinados.

Esses conceitos são válidos e devem ser reaproveitados no desenho funcional do Academy.

### O que precisa ser diferente no `7EventosAcademy`

O `7EventosAcademy` tem outra base técnica e precisa de uma implementação nativa, não de cópia direta do legado.

Diferenças obrigatórias:

- uso de `NestJS + Prisma + PostgreSQL`;
- escopo por `institution_id` em todas as entidades;
- uso de RBAC institucional já existente;
- armazenamento privado de artefatos;
- reforço de sanitização de HTML;
- token de assinatura com armazenamento seguro;
- maior alinhamento com LGPD e com os documentos internos de auditoria da plataforma.

## Diretrizes jurídicas e de conformidade

Revisão técnica realizada em 1º de abril de 2026.

### Fundamentos aplicáveis

- Código Civil: validade do negócio jurídico depende de agente capaz, objeto lícito e forma válida quando exigida em lei.
- Código Civil: a declaração de vontade, em regra, não depende de forma especial, salvo previsão legal específica.
- MP nº 2.200-2/2001: admite outros meios de comprovação de autoria e integridade além de certificados emitidos pela ICP-Brasil, desde que aceitos pelas partes ou por quem o documento será oposto.
- LGPD: o tratamento de dados pode ocorrer quando necessário para a execução de contrato ou de procedimentos preliminares relacionados ao contrato.
- LGPD: devem ser observados os princípios de finalidade, necessidade, prevenção, segurança e responsabilização.
- LGPD: os agentes de tratamento devem adotar medidas de segurança técnicas e administrativas aptas a proteger os dados pessoais.
- LGPD: incidentes com risco ou dano relevante exigem comunicação nos termos da autoridade competente.

### Implicações práticas para o módulo

O módulo deve ser desenhado para demonstrar:

- quem assinou;
- o que foi assinado;
- quando foi assinado;
- em qual contexto foi assinado;
- que o documento não foi alterado após a assinatura;
- que houve manifestação clara de vontade.

Isso significa que a prova da assinatura não pode depender apenas de uma imagem desenhada em tela.

## Princípios técnicos obrigatórios

- Toda entidade do módulo deve carregar `institution_id`.
- Toda consulta institucional deve filtrar `institution_id`.
- Toda ação crítica deve gerar auditoria.
- Contrato assinado não pode ser editado.
- Contrato assinado não pode ser excluído fisicamente no fluxo normal.
- O modelo publicado deve ser imutável.
- A instância enviada ao aluno deve congelar um snapshot do conteúdo.
- O artefato assinado deve ser armazenado de forma privada.
- O sistema deve permitir rastrear envio, abertura, validação e assinatura.

## Arquitetura proposta

### Backend

Criar um módulo `contracts` no backend com responsabilidades separadas:

- gestão de modelos;
- versionamento de modelos;
- geração de instâncias;
- envio para assinatura;
- validação de OTP;
- assinatura;
- auditoria;
- armazenamento e download de artefatos.

Serviços sugeridos:

- `ContractsTemplatesService`
- `ContractsInstancesService`
- `ContractsSigningService`
- `ContractsAuditService`
- `ContractsStorageService`
- `ContractsRenderService`

### Frontend administrativo

Adicionar `Contratos` no menu lateral administrativo.

Capacidades da área:

- listar modelos;
- criar modelo;
- editar rascunho;
- publicar modelo;
- listar contratos enviados;
- filtrar por aluno, turma e status;
- enviar contrato para aluno;
- visualizar trilha básica do contrato;
- arquivar contrato quando permitido.

### Frontend do aluno

Adicionar `Contratos` na área do aluno.

Capacidades da área:

- listar contratos pendentes;
- visualizar contrato pendente;
- assinar contrato;
- listar contratos assinados;
- visualizar contrato assinado;
- baixar PDF do contrato assinado.

## Modelo de dados proposto

### `contract_templates`

Representa o cadastro lógico do modelo.

Campos principais:

- `id`
- `institution_id`
- `name`
- `description`
- `status`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

### `contract_template_versions`

Representa versões congeladas do modelo.

Campos principais:

- `id`
- `institution_id`
- `template_id`
- `version_number`
- `title`
- `html_content`
- `placeholders_schema`
- `is_published`
- `published_at`
- `published_by_user_id`
- `content_hash`
- `created_at`

### `contract_instances`

Representa um contrato enviado a um aluno.

Campos principais:

- `id`
- `institution_id`
- `template_id`
- `template_version_id`
- `student_id`
- `enrollment_id`
- `course_id`
- `class_id`
- `status`
- `sent_at`
- `viewed_at`
- `signed_at`
- `archived_at`
- `archived_reason`
- `snapshot_template_title`
- `snapshot_template_html`
- `snapshot_student_data`
- `unsigned_content_hash`
- `signed_content_hash`
- `signed_pdf_hash`
- `signature_code`
- `accepted_terms_text`
- `accepted_terms_version`
- `accepted_at`
- `signer_ip`
- `signer_user_agent`
- `signer_timezone`
- `signer_otp_channel`
- `signer_otp_destination_masked`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `contract_signing_tokens`

Representa o token temporário do fluxo de assinatura.

Campos principais:

- `id`
- `institution_id`
- `contract_instance_id`
- `token_hash`
- `expires_at`
- `used_at`
- `otp_channel`
- `otp_destination`
- `pin_hash`
- `pin_expires_at`
- `pin_attempts`
- `pin_last_attempt_at`
- `pin_blocked_until`
- `verified_at`
- `created_at`

Observação importante:

- o token não deve ser salvo em texto puro;
- o banco deve armazenar apenas o hash do token.

### `contract_audit_logs`

Representa a trilha imutável do contrato.

Campos principais:

- `id`
- `institution_id`
- `contract_instance_id`
- `contract_signing_token_id`
- `actor_type`
- `actor_user_id`
- `action`
- `payload`
- `previous_hash`
- `entry_hash`
- `created_at`

### `contract_artifacts`

Representa os artefatos persistidos fora do banco.

Campos principais:

- `id`
- `institution_id`
- `contract_instance_id`
- `artifact_type`
- `storage_provider`
- `storage_key`
- `mime_type`
- `size_bytes`
- `sha256`
- `created_at`

## Fluxo funcional proposto

### 1. Criação do modelo

- professor/admin acessa `Contratos`;
- cria um modelo em rascunho;
- define título, conteúdo e placeholders;
- salva o rascunho;
- publica a versão quando o conteúdo estiver finalizado.

### 2. Publicação do modelo

- a publicação congela a versão;
- após publicada, a versão não pode mais ser editada;
- novas alterações exigem nova versão.

### 3. Envio do contrato ao aluno

- usuário autorizado seleciona o aluno;
- o sistema gera uma instância com snapshot do modelo;
- o sistema registra o envio;
- o sistema gera token temporário;
- o sistema disponibiliza o contrato na área do aluno;
- opcionalmente o sistema envia notificação por e-mail.

### 4. Abertura do contrato

- o aluno acessa a área `Contratos`;
- visualiza os contratos pendentes;
- abre o contrato;
- o sistema registra a abertura.

### 5. Confirmação por OTP

- antes da assinatura, o sistema envia um PIN temporário;
- o aluno informa o PIN;
- o sistema valida o OTP;
- o sistema registra sucesso ou falha.

### 6. Assinatura

- o aluno confirma o aceite;
- o aluno assina na interface;
- o sistema gera HTML assinado;
- o sistema gera PDF assinado;
- o sistema calcula hashes;
- o sistema grava evidências e artefatos;
- o sistema marca a instância como assinada.

### 7. Pós-assinatura

- o aluno passa a ver o contrato como assinado;
- professor/admin pode consultar status e evidências básicas;
- downloads ficam disponíveis por controle de acesso.

## Placeholders do modelo

O módulo deve suportar placeholders controlados, por exemplo:

- `{{student_name}}`
- `{{student_email}}`
- `{{student_document}}`
- `{{course_name}}`
- `{{class_name}}`
- `{{institution_name}}`
- `{{signed_at}}`
- `{{signed_by_name}}`
- `{{signature_code}}`

Os placeholders devem ser resolvidos no backend no momento da geração da instância.

## Requisitos obrigatórios de segurança

### 1. Escopo institucional

- todas as tabelas com `institution_id`;
- toda leitura e escrita protegida por escopo institucional;
- testes específicos contra bypass por URL, payload e relacionamento indireto.

### 2. Proteção de tokens

- token de assinatura com alta entropia;
- armazenamento apenas do hash;
- expiração curta;
- invalidação de tokens anteriores ao reenviar contrato;
- token marcado como usado após assinatura.

### 3. OTP

- PIN com validade curta;
- limite de tentativas;
- bloqueio temporário após falhas;
- trilha de auditoria para envio e validação;
- destino do OTP mascarado em logs e respostas.

### 4. Sanitização e renderização

- sanitização forte do HTML no backend;
- allowlist de tags e atributos;
- remoção de scripts, eventos inline e conteúdo perigoso;
- renderização do contrato sempre a partir de conteúdo controlado.

### 5. Armazenamento de artefatos

- armazenamento privado;
- download autenticado ou com URL temporária;
- hashes SHA-256 para verificação;
- retenção segura dos arquivos assinados.

### 6. Auditoria

- log append-only para ações sensíveis;
- encadeamento por hash entre entradas;
- registro de IP, user-agent e timezone;
- registro de versões do termo de aceite.

### 7. Imutabilidade

- versão publicada não é editável;
- contrato assinado não é editável;
- exclusão lógica apenas por arquivamento quando permitido;
- snapshots preservados independentemente de mudanças futuras no modelo.

### 8. Privacidade e LGPD

- coletar apenas dados necessários;
- mascarar destinos sensíveis em respostas e logs;
- limitar acesso administrativo às evidências;
- definir retenção e descarte para dados transitórios;
- remover ou expirar dados temporários que não precisem permanecer após o fluxo.

## Requisitos obrigatórios de conformidade operacional

- termo de aceite visível no momento da assinatura;
- registro do texto exato do aceite utilizado;
- registro da versão do aceite;
- registro de data e hora do aceite;
- registro de data e hora da assinatura;
- preservação do documento assinado em formato consultável;
- capacidade de demonstrar a cadeia de eventos do contrato.

## Regras de negócio

- somente usuários com permissão adequada podem criar ou publicar modelos;
- somente usuários com permissão adequada podem enviar contratos;
- professor só pode operar dentro do próprio escopo institucional e acadêmico;
- aluno só pode visualizar e assinar os próprios contratos;
- modelo publicado não pode ser alterado;
- contrato assinado não pode ser reenviado como se fosse novo documento;
- reenvio gera novo token, mantendo histórico;
- exclusão física de contrato assinado fica bloqueada no fluxo de negócio.

## Integração com a arquitetura atual do Academy

### Backend

O módulo deve seguir os padrões já existentes:

- NestJS modular;
- Prisma;
- PostgreSQL;
- guards de autenticação e permissão;
- uso de `activeInstitutionId` como partição lógica;
- logging e auditoria compatíveis com a estratégia institucional já documentada.

### Frontend

O módulo deve ser integrado à navegação já existente:

- menu administrativo com uma seção `Contratos`;
- área do aluno com uma seção `Contratos`;
- experiência responsiva;
- estados claros para pendente, enviado, visualizado, assinado, expirado e arquivado.

## Fases de implementação

### Fase 1: Fundamentos do domínio

- modelagem Prisma;
- migrations;
- permissões RBAC;
- serviços base do módulo;
- auditoria encadeada;
- armazenamento privado de artefatos.

### Fase 2: Modelos e versões

- CRUD de modelos;
- placeholders;
- publicação de versão;
- bloqueios de edição após publicação.

### Fase 3: Instâncias e envio

- geração de instância;
- snapshot do contrato;
- listagem por aluno e por administração;
- notificação inicial.

### Fase 4: Assinatura

- tela do aluno;
- OTP;
- aceite;
- assinatura;
- geração de HTML e PDF assinados;
- auditoria completa do fluxo.

### Fase 5: Consulta, download e arquivamento

- listagem de assinados;
- download protegido;
- arquivamento administrativo;
- filtros e busca.

### Fase 6: Testes e endurecimento

- testes de permissão;
- testes de escopo por instituição;
- testes de expiração e reuse de token;
- testes de brute force de OTP;
- testes de sanitização;
- testes de download indevido;
- revisão de logs e retenção.

## Critérios de aceite

- professor/admin consegue criar e publicar modelos;
- professor/admin consegue enviar contrato para aluno;
- aluno consegue visualizar pendentes;
- aluno consegue assinar com OTP;
- aluno consegue visualizar e baixar o contrato assinado;
- contrato assinado preserva integridade verificável;
- todas as ações críticas ficam auditadas;
- não há vazamento entre instituições;
- não há acesso público irrestrito aos documentos assinados.

## Riscos e cuidados

- reutilizar código legado sem adaptação pode carregar fragilidades de segurança;
- artefatos assinados não podem usar o fluxo público atual de uploads;
- token em texto puro é inadequado;
- imagem da assinatura sozinha não comprova suficientemente a operação;
- sanitização fraca do HTML pode abrir brecha para XSS e manipulação de documento;
- ausência de filtro por `institution_id` compromete o isolamento entre clientes.

## Recomendação final

O módulo de contratos deve ser implementado no `7EventosAcademy` como um módulo novo, aderente à arquitetura atual da plataforma.

Devem ser portados do `7Eventos` apenas:

- o desenho funcional;
- as regras de negócio centrais;
- a noção de snapshot;
- a noção de auditoria encadeada;
- a experiência de envio, assinatura e consulta.

Não deve ser portada diretamente a implementação legada.

## Passos que dependem de você

Para concluir a implantação em produção com estabilidade e conformidade, estes pontos precisam ser definidos/configurados por você:

### 1. URL pública de assinatura (obrigatório)

Definir a variável `CONTRACT_SIGNING_PUBLIC_BASE_URL` com URL absoluta.

Formato recomendado:

- `https://SEU-DOMINIO/api/contracts/sign/{token}`

Exemplo:

- `https://academy.7eventos.com/api/contracts/sign/{token}`

Sem isso, clientes de e-mail podem converter link relativo para URL inválida (caso do `http:///api/...`).

### 2. URL de redirecionamento pós-token (obrigatório)

Definir `CONTRACT_SIGNING_REDIRECT_URL` para onde o backend deve redirecionar após validar o token.

Exemplo:

- `https://academy.7eventos.com/`

### 3. Domínios autorizados no CORS (obrigatório)

Definir `CORS_ORIGINS` com os domínios reais do frontend administrativo/aluno.

Exemplo:

- `https://academy.7eventos.com,https://admin.7eventos.com`

### 4. E-mail transacional (obrigatório)

Validar/confirmar credenciais SMTP de produção:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (recomendado)

### 5. Evidências imutáveis em storage externo (decisão sua)

Hoje o Academy grava artefatos em `storageProvider = db`.

Para paridade completa com o 7Eventos (camada adicional de imutabilidade), você precisa aprovar e fornecer:

- provedor (`Cloudflare R2` ou `S3` compatível);
- bucket privado;
- credenciais de acesso;
- política de retenção/versionamento;
- regra de acesso apenas por backend (sem público).

### 6. Política de retenção e descarte (conformidade)

Definir formalmente:

- prazo de retenção de contratos assinados;
- prazo de retenção de logs de auditoria;
- prazo de retenção de tokens/OTP expirados;
- procedimento de descarte e trilha de descarte.

### 7. Termo institucional de assinatura eletrônica

Validar com jurídico/compliance o texto oficial do termo de aceite e versionamento interno do termo (`accepted_terms_version`).

### 8. Operação e segurança

Confirmar:

- responsável por rotação de segredos (SMTP e storage);
- responsável por resposta a incidentes de segurança;
- rotina de backup e restore das tabelas de contratos/auditoria.

## Referências oficiais

- Lei nº 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm
- Medida Provisória nº 2.200-2/2001: https://www.planalto.gov.br/ccivil_03/MPV/Antigas_2001/2200-2.htm
- Código Civil, Lei nº 10.406/2002: https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
- ANPD, comunicação de incidente de segurança: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
