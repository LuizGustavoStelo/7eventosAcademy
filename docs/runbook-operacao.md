# Runbook de Operação

## Ambiente de runtime

Diretório da VPS:

- `/var/www/7eventosAcademy/docker-compose.yml`
- `/var/www/7eventosAcademy/.env`
- `/var/www/7eventosAcademy/.env.example`
- `/var/www/7eventosAcademy/secrets/academy_master_key.txt`

## Segredos de integração

- Credenciais de gateways/API são gravadas criptografadas no banco, por tenant/admin.
- A chave mestra de criptografia não fica em `.env`.
- O backend recebe a chave mestra por arquivo montado em `/run/secrets/academy_master_key`.

## Deploy

1. `docker compose pull`
2. `docker compose up -d --remove-orphans`
3. `docker compose exec backend npx prisma migrate deploy`
4. `docker image prune -f`

## Saúde do sistema

- Frontend: `GET /` em `127.0.0.1:8090`
- Backend: `GET /api/health` em `127.0.0.1:3210`

## Incidentes

- Verificar logs por serviço: `docker compose logs -f backend`, `frontend`, `db`, `redis`.
- Validar conectividade do banco e fila.
- Em caso de rollback, fixar tag anterior no compose e subir novamente.

## Rotação de chave mestra

1. Gerar nova chave em `/var/www/7eventosAcademy/secrets/academy_master_key.txt`.
2. Reiniciar backend para carregar a nova versão.
3. Executar rotina de recriptografia das credenciais existentes.
4. Validar leitura/escrita de integrações.
