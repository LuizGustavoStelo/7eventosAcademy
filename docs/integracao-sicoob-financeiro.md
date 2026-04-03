# Integração Sicoob no Financeiro (Super Admin)

## Base usada para configuração

Esta implementação usa os padrões do Portal Developers do Sicoob:

- Fluxo OAuth 2.0 `client_credentials` com mTLS.
- Certificado digital A1 (e-CNPJ/e-CPF) ICP-Brasil.
- URLs separadas por produto da API.

## Campos expostos no painel

Quando o provedor `sicoob` é selecionado, o formulário por conta exibe:

- `clientId`
- `numeroCliente` (cliente/cedente)
- `tokenUrl`
- `baseUrls` de produção por produto:
  - `cobrancaBancaria`
  - `cobrancaBancariaPagamentos`
  - `pixPagamentos`
  - `pixRecebimentos`
  - `spbTransferencias`
- `sandboxBaseUrls` por produto:
  - `cobrancaBancaria`
  - `cobrancaBancariaPagamentos`
  - `pixPagamentos`
  - `pixRecebimentos`
  - `spbTransferencias`
- `scopes`
- `webhookUrl` (opcional)
- Certificado do cliente com duas opções:
  - `certificatePem` e `privateKeyPem` (entrada manual)
  - `certificatePfxBase64` e `certificatePfxPassphrase` (extração automática no backend)

## Armazenamento e segurança

- Configuração financeira é por conta `admin/professor`.
- Segredos são armazenados criptografados com `SecretsService` (AES-256-GCM).
- O cadastro permite atualização parcial sem obrigar reenviar certificado/chave já cadastrados.
- Para contas antigas, a aplicação mantém compatibilidade com o formato legado de URL única.
