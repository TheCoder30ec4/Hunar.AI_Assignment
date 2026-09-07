# Deployment

Backend on a single EC2 instance (Docker Compose), frontend on Vercel.

## Why a single instance

Calling runs are tracked in an in-process dictionary
(`Backend/services/calling_jobs.py`). A second instance would not see a
campaign started by the first, so an in-flight run would appear to vanish
and its results would never be written.

**Do not scale the API past one replica** until that state moves to Postgres
or Redis. This also rules out Lambda (15-minute cap vs. SSE streams that run
up to 30) and App Runner (autoscales by default).

Postgres needs the **pgvector** extension, so the image is
`pgvector/pgvector:pg16` rather than stock Postgres.

---

## 1. Backend — EC2

### Launch the instance

- **AMI:** Amazon Linux 2023
- **Type:** `t3.small` (2 GB RAM). `t3.micro` is tight once Postgres,
  the API and Caddy are all running.
- **Storage:** 20 GB gp3
- **Security group inbound:** 22 (your IP only), 80, 443 from anywhere.
  Do **not** open 5432 — Postgres is reachable only inside the Docker
  network.

Point an A record for your domain at the instance's public IP **before**
first start; Caddy needs working DNS to obtain a certificate.

### Install Docker

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
newgrp docker   # or log out and back in
```

Docker Compose v2 plugin:

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

(Use `docker-compose-linux-x86_64` on an Intel instance type.)

### Configure

```bash
git clone <your-repo> hunar && cd hunar
cp Backend/.env.example Backend/.env
```

Fill in `Backend/.env`. Generate fresh secrets — never reuse the dev ones:

```bash
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))"
python3 -c "import secrets; print('JWT_REFRESH_SECRET=' + secrets.token_hex(32))"
```

Then a root `.env` for Compose itself:

```bash
cat > .env <<'EOF'
DOMAIN=api.yourdomain.com
POSTGRES_USER=hunar
POSTGRES_PASSWORD=<a long random password>
POSTGRES_DB=hunar
CORS_ORIGINS=https://your-app.vercel.app
EOF
```

`CORS_ORIGINS` **must** list the Vercel URL exactly, or every browser
request fails with an opaque CORS error.

### Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically before the API starts. Verify:

```bash
curl https://api.yourdomain.com/api/health   # {"status":"ok"}
docker compose -f docker-compose.prod.yml ps
```

### Configure the voice agent (once)

```bash
docker compose -f docker-compose.prod.yml exec api python -m core.agent_prompt
```

---

## 2. Frontend — Vercel

```bash
cd Frontend
vercel link
vercel env add VITE_API_BASE_URL production   # https://api.yourdomain.com/api
vercel --prod
```

The frontend and backend are on different origins, so `VITE_API_BASE_URL`
must be the backend's absolute URL. MSW is excluded from production builds,
so nothing proxies `/api` on Vercel's side.

After the first deploy, set `CORS_ORIGINS` on the server to the real Vercel
URL and restart:

```bash
docker compose -f docker-compose.prod.yml up -d api
```

---

## Operations

**Logs**

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

**Deploy an update**

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

Expect a few seconds of downtime — one replica, no rolling deploy.

**Back up the database.** The data lives in a Docker volume on the
instance; terminating it destroys the volume. At minimum, a nightly cron:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U hunar hunar | gzip > backup-$(date +%F).sql.gz
```

Ship those to S3 if the data matters.

---

## Known limitations

| Limitation | Impact |
|---|---|
| Single API replica | No horizontal scaling, brief downtime on deploy |
| In-process job store | A restart mid-campaign loses tracking of in-flight calls; the calls still happen, but results are not recorded |
| Two hardcoded accounts | No real user management (`Backend/core/auth_config.py`) |
| Every write uses one seeded org | No tenant isolation (`Backend/core/default_tenant.py`) |
| Apollo on the free plan | Returns 403; phone numbers only come from manually added contacts |
| Postgres on the instance | Backups are your responsibility |
