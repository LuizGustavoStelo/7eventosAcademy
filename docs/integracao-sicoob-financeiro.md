# Integração Sicoob no Financeiro (Super Admin)

## Base usada para configuração

Esta implementação usa os padrões oficiais do Portal Developers do Sicoob:

- Fluxo OAuth 2.0 `client_credentials` com mTLS.
- Certificado digital A1 (e-CNPJ/e-CPF) ICP-Brasil.
- API de Cobrança Bancária V3.
- Escopos da Cobrança V3:
  - `boletos_inclusao`
  - `boletos_consulta`
  - `boletos_alteracao`

## Campos expostos no painel

Quando o provedor `sicoob` é selecionado, o formulário por conta exibe:

- `clientId`
- `clientSecret`
- `numeroCliente` (cliente/cedente)
- `tokenUrl`
- `baseUrl` (produção)
- `sandboxBaseUrl`
- `scopes`
- `webhookUrl` (opcional)
- `certificatePem` (certificado público)
- `privateKeyPem` (chave privada)

## Armazenamento e segurança

- Configuração financeira é por conta `admin/professor`.
- Segredos são armazenados criptografados com `SecretsService` (AES-256-GCM).
- O cadastro permite atualização parcial sem obrigar reenviar segredo/certificado/chave já cadastrados.
