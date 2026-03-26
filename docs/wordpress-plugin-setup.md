# Setup do Plugin 7academy (Passo a passo)

Data: `20/03/2026`

## 1) O que já foi implementado no projeto

Backend (NestJS):

- Endpoints públicos para WordPress:
- `GET /api/wordpress/health`
- `POST /api/wordpress/license/activate`
- `POST /api/wordpress/license/validate`
- `POST /api/wordpress/updates/check`

- Endpoints protegidos para superadmin:
- `GET /api/wordpress/admin/licenses`
- `POST /api/wordpress/admin/licenses`
- `GET /api/wordpress/admin/releases`
- `POST /api/wordpress/admin/releases`

- Persistência no banco:
- `wordpress_plugin_licenses`
- `wordpress_plugin_activations`
- `wordpress_plugin_releases`

Plugin WordPress:

- Menu lateral `7academy` no admin.
- Painel com status de conexão, status da licença e versão.
- Campo para chave de licença.
- Botões para ativar/remover licença.
- Shortcodes:
- `[area-do-aluno]`
- `[formulario-cadastro-aluno]`
- Verificação automática de atualização via API Academy.

## 2) Passos que dependem de você

### 2.1 Banco e backend em produção

1. Executar migration no backend em produção:
2. `npm run prisma:migrate:deploy --workspace backend`
3. Reiniciar backend após migration/deploy.

### 2.2 Publicação do plugin (ZIP)

1. Compactar a pasta `integrations/wordpress/7academy` em um ZIP.
2. Instalar no WordPress em `Plugins > Adicionar novo > Enviar plugin`.
3. Ativar o plugin `7academy`.

### 2.3 Cadastro da licença (superadmin via API)

Gerar token de superadmin (login normal do sistema) e chamar:

```bash
curl -X POST "https://academy.7eventos.com/api/wordpress/admin/licenses" \
  -H "Authorization: Bearer SEU_TOKEN_SUPERADMIN" \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "7A-XXXX-XXXX-XXXX",
    "label": "Cliente Alpha",
    "maxActivations": 1,
    "isActive": true
  }'
```

### 2.4 Cadastro da release do plugin

Subir o ZIP no GitHub Release (privado ou público) e cadastrar:

```bash
curl -X POST "https://academy.7eventos.com/api/wordpress/admin/releases" \
  -H "Authorization: Bearer SEU_TOKEN_SUPERADMIN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.1",
    "packageUrl": "https://github.com/ORG/REPO/releases/download/v1.0.1/7academy.zip",
    "changelogUrl": "https://github.com/ORG/REPO/releases/tag/v1.0.1",
    "isPublished": true,
    "isMandatory": false,
    "minWpVersion": "6.0",
    "minPhpVersion": "8.0"
  }'
```

### 2.5 Configuração no WordPress

1. Abrir `7academy` no menu lateral.
2. Preencher:
- URL base da Academy (ex.: `https://academy.7eventos.com`)
- Chave de licença
3. Salvar.
4. Clicar em `Ativar licença`.
5. Validar status:
- Conexão: `Conectado`
- Licença: `Ativa`

## 3) Como o update automático funciona

1. WordPress consulta atualização do plugin.
2. Plugin envia `activationToken`, domínio e versão instalada para `/api/wordpress/updates/check`.
3. API valida licença por domínio.
4. Se houver versão nova publicada, devolve `packageUrl`.
5. WordPress exibe atualização e instala o ZIP.

## 4) Segurança mínima obrigatória

- Não expor credenciais do GitHub no plugin.
- Usar releases privadas quando possível.
- Garantir que `packageUrl` seja temporária ou controlada.
- Manter licença vinculada ao domínio.
- Controlar rotas admin apenas com role `superadmin`.
