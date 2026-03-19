# Segredos locais da VPS (não versionar)

Este diretório deve existir em produção em:

- `/var/www/7eventosAcademy/secrets`

Arquivo obrigatório:

- `/var/www/7eventosAcademy/secrets/academy_master_key.txt`

## Criar o segredo mestre

No servidor, execute:

```bash
cd /var/www/7eventosAcademy
mkdir -p secrets
openssl rand -base64 32 > secrets/academy_master_key.txt
chmod 600 secrets/academy_master_key.txt
```

## Regras

- Nunca commitar `academy_master_key.txt`.
- O backend lê esse arquivo via Docker secret.
- Rotação exige rotina de recriptografia dos segredos salvos no banco.
