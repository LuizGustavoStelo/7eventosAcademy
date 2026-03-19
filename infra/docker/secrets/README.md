# Segredo Mestre (não versionar)

Este diretório guarda apenas arquivos locais de segredo para o ambiente Docker.

## Criar o segredo mestre

Execute no diretório `infra/docker`:

```bash
openssl rand -base64 32 > secrets/academy_master_key.txt
```

## Regras

- Nunca commitar `academy_master_key.txt`.
- O arquivo é montado no backend em `/run/secrets/academy_master_key`.
- Rotação exige recriptografar as credenciais armazenadas.
