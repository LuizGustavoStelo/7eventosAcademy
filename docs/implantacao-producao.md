# Implantação em Produção (VPS)

Este guia assume Ubuntu 22.04+ e domínio `academy.7eventos.com`.

## 1) Pré-requisitos

1. DNS do subdomínio apontando para o IP da VPS.
2. Acesso SSH com usuário sudo.
3. Token do GitHub com permissão `read:packages` (para baixar imagens do GHCR).

## 2) Instalar dependências da VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release nginx certbot python3-certbot-nginx
```

Instalar Docker Engine + Compose Plugin:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Liberar firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 3) Criar estrutura de runtime

```bash
sudo mkdir -p /var/www/7eventosAcademy/secrets
sudo chown -R $USER:$USER /var/www/7eventosAcademy
cd /var/www/7eventosAcademy
```

Arquivos necessários no runtime:

- `/var/www/7eventosAcademy/docker-compose.yml` (copiar de `infra/docker/docker-compose.yml`)
- `/var/www/7eventosAcademy/.env`
- `/var/www/7eventosAcademy/secrets/academy_master_key.txt`

Criar chave mestra:

```bash
cd /var/www/7eventosAcademy
openssl rand -base64 32 > secrets/academy_master_key.txt
chmod 600 secrets/academy_master_key.txt
```

## 4) Criar `.env` de produção

Exemplo base:

```env
POSTGRES_PASSWORD=trocar_em_producao
DATABASE_URL=postgresql://academy_user:trocar_em_producao@db:5432/academy
REDIS_URL=redis://redis:6379
PORT=3210
JWT_SECRET=trocar_em_producao
JWT_REFRESH_SECRET=trocar_em_producao
SECRETS_MASTER_KEY_FILE=/run/secrets/academy_master_key
APP_VERSION=latest
# Ajuste apenas se necessário:
# BACKEND_IMAGE=ghcr.io/luizgustavostelo/7eventosacademy-backend
# FRONTEND_IMAGE=ghcr.io/luizgustavostelo/7eventosacademy-frontend
```

## 5) Login no GHCR e subir containers

```bash
echo "<GHCR_PAT>" | docker login ghcr.io -u LuizGustavoStelo --password-stdin
cd /var/www/7eventosAcademy
docker compose pull
docker compose up -d
docker compose ps
```

Validação local:

```bash
curl http://127.0.0.1:3210/api/health
curl -I http://127.0.0.1:8090
```

## 6) Configurar Nginx (reverse proxy)

Criar arquivo:

```bash
sudo nano /etc/nginx/sites-available/academy.7eventos.com
```

Conteúdo inicial (HTTP):

```nginx
server {
    listen 80;
    server_name academy.7eventos.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ativar site:

```bash
sudo ln -s /etc/nginx/sites-available/academy.7eventos.com /etc/nginx/sites-enabled/academy.7eventos.com
sudo nginx -t
sudo systemctl reload nginx
```

## 7) Emitir SSL com Let's Encrypt

```bash
sudo certbot --nginx -d academy.7eventos.com -m seu-email@dominio.com --agree-tos --redirect --non-interactive
```

Teste de renovação:

```bash
sudo certbot renew --dry-run
```

## 8) Rotina de deploy

Sempre que publicar nova imagem:

```bash
cd /var/www/7eventosAcademy
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
```

Quando Prisma estiver ativo no backend:

```bash
docker compose exec -T backend npx prisma migrate deploy
```
