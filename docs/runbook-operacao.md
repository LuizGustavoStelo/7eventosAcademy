# Runbook de Operação

## Ambiente de runtime

Diretório da VPS:

- `/var/www/7eventosAcademy/docker-compose.yml`
- `/var/www/7eventosAcademy/.env`
- `/var/www/7eventosAcademy/.env.example`

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
