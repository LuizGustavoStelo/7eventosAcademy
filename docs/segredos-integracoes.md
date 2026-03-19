# Segredos de Integrações (Gateway/API)

## Objetivo

Permitir múltiplas credenciais por conta/admin com segurança, sem expor secrets em variáveis de ambiente.

## Modelo de segurança

- Chave mestra fora do código e fora do `.env`.
- Chave mestra entregue por arquivo seguro (`Docker secret`) em `/var/www/7eventosAcademy/secrets/academy_master_key.txt`.
- Credenciais salvas criptografadas (AES-256-GCM) no backend.
- Acesso somente por serviço autorizado e operações auditadas.

## Fluxo recomendado

1. Admin cadastra credencial do provedor.
2. Backend criptografa e grava o `ciphertext`.
3. Processos de cobrança/leitura descriptografam apenas em memória.
4. Auditoria registra criação, rotação e revogação.

## Observações

- `.env` continua para configuração operacional não sensível e segredos de infraestrutura.
- Secret de integração de terceiro (gateway/API) deve ficar no cofre de credenciais.
