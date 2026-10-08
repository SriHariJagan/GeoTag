# GeoTech — Docker Deployment Guide (Ubuntu VPS, public IP)

Deploy the full application (React frontend + FastAPI backend + SQLite) with
two containers. The only public port is **80**.

```text
                    http://<SERVER_IP>/
                            |
                            v
               nginx container ("nginx") :80
               - serves the React SPA build
               - proxies /api/* -> backend:8000/*
                            |
                            v
               backend container ("backend") :8000 (internal only)
               - FastAPI + uvicorn
               - SQLite file on the sqlite_data volume
               - uploads on backend_storage / backend_pdfs volumes
```

There is intentionally **no** PostgreSQL/MySQL/MongoDB/Redis container: the
app uses SQLite (`DATABASE_URL`) and has no Redis/WebSocket code. ML models
are optional — without `ml_data/models/*.pkl` the analytics endpoints use
the built-in scoring fallback.

---

## 1. Server prerequisites

- Ubuntu 22.04/24.04 VPS with a public IP (`<SERVER_IP>`)
- Open inbound firewall port **80/tcp** (and 22/tcp for your SSH)
- The project pushed to a Git repository you can clone

## 2. Install Docker + Git (Ubuntu, copy-paste)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version && docker compose version
```

Optional: run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Clone the project

```bash
cd ~
git clone <REPOSITORY_URL> GEOTECH
cd GEOTECH
```

## 4. Configure `.env` (REQUIRED before first start)

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```env
SECRET_KEY=<output of: python3 -c "import secrets; print(secrets.token_hex(32))">
SUPERADMIN_EMAIL=admin@geotech.com
SUPERADMIN_PASSWORD=<a-strong-password>
FRONTEND_URL=http://<SERVER_IP>
```

Notes:

- `SECRET_KEY` must be ≥ 32 random chars. Never reuse the placeholder.
- `FRONTEND_URL` must be the public address (used in invitation e-mails
  and for CORS). No trailing slash.
- `DATABASE_URL` default (`sqlite:////data/geotech.db`) is correct — keep it.
- Mail (`MAIL_*`) is **optional**. Without SMTP the app still runs; invite
  e-mails are attempted in the background and failures are only logged.
  Configure real SMTP before inviting users for real.
- `CORS_EXTRA_ORIGINS` (optional, comma-separated) allows extra browser
  origins, e.g. a Vercel preview URL.

## 5. Build + start

```bash
docker compose build
docker compose up -d
```

## 6. Check status, health and logs

```bash
docker compose ps
docker compose logs --tail=50 backend
docker compose logs --tail=20 nginx

# From the server itself:
curl -s http://localhost/ | head -c 200; echo
curl -s http://localhost/api/
```

Expected:

- `docker compose ps` → both `geotech_backend` and `geotech_nginx`
  `Up (healthy)`
- `curl http://localhost/api/` →
  `{"status":"OK","message":"GeoTech Backend API is running"}`

## 7. Access the application

```text
http://<SERVER_IP>/
```

Log in with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` from your `.env`.
API docs (testing): `http://<SERVER_IP>/docs`.

End-to-end smoke test after login:

1. Open `http://<SERVER_IP>/` → login page loads.
2. Log in → admin dashboard shows project/user totals.
3. Refresh the browser on any route (e.g. `/admin/projects`) → page
   reloads correctly (SPA fallback).
4. Create a user + send invite (works without SMTP; the invite row is
   created, delivery is retried in background).
5. Upload a company logo (Company settings) → proves file uploads work.
6. Open `http://<SERVER_IP>/api/analytics/dashboard/insights` with a
   token (or via the UI forecasting views) → proves ML fallback works.

## 8. Everyday operations

```bash
# Restart everything
docker compose restart

# Restart one service
docker compose restart backend
docker compose restart nginx

# Follow logs
docker compose logs -f backend
docker compose logs -f nginx

# Stop (data is kept in volumes)
docker compose stop

# Start again
docker compose up -d
```

## 9. Update from Git / rebuild after code changes

```bash
cd ~/GEOTECH
git pull
docker compose up -d --build
docker compose ps
```

Frontend changes are baked into the image at build time (`VITE_API_URL=/api`
is relative, so no per-IP rebuild configuration is ever needed).
Backend changes take effect after the rebuild; SQLite data is untouched.

## 10. Stop / full reset

```bash
# Stop, keep all data
docker compose down

# DANGER: also deletes the database, uploads, PDFs and ML models.
# Only run this if you really want to wipe the server state.
docker compose down -v
```

## 11. Database backup (SQLite)

The database file lives in the `sqlite_data` volume at `/data/geotech.db`
inside the backend container.

```bash
# Backup to ~/geotech-backup-<date>.db
docker compose exec backend sh -c 'cat /data/geotech.db' \
  > ~/geotech-backup-$(date +%F).db

# Restore (stop backend first)
docker compose stop backend
docker compose cp ~/geotech-backup-YYYY-MM-DD.db backend:/data/geotech.db
docker compose start backend
```

Uploads/PDFs can be copied the same way:

```bash
docker compose exec backend tar -C /app -czf - storage generated_pdfs \
  > ~/geotech-files-$(date +%F).tar.gz
```

## 12. Persistent volumes

| Volume          | Mount (backend)       | Content                              |
|-----------------|-----------------------|--------------------------------------|
| `sqlite_data`   | `/data`               | `geotech.db` (do not delete)         |
| `backend_storage` | `/app/storage`      | company logos, signed WO documents   |
| `backend_pdfs`  | `/app/generated_pdfs` | generated work-order PDFs            |
| `ml_models`     | `/ml_data/models`     | trained `.pkl` files (optional)      |

Recreating containers (`up -d --build`, `restart`, `stop/start`) never
touches these. Only `docker compose down -v` deletes them.

Optional: copy locally trained models to the server so forecasting uses ML
instead of the fallback:

```bash
# on your machine (models are gitignored, copy them explicitly)
scp ml_data/models/*.pkl ml_data/models/feature_columns.json \
  user@<SERVER_IP>:/tmp/
# on the server
docker compose cp /tmp/delay_classifier.pkl backend:/ml_data/models/
# ... repeat per file, then:
docker compose restart backend
```

## 13. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

Nothing else needs a public port: backend `:8000` is internal to the
Docker network (`expose`, not `ports`).

## 14. Troubleshooting

| Symptom | Check / fix |
|---|---|
| `nginx` container restarting | `docker compose logs nginx` — usually a config or upstream error; verify backend is healthy first |
| `backend` unhealthy | `docker compose logs backend` — most common cause: bad `.env` (unreadable `DATABASE_URL`, empty `SECRET_KEY`); fix `.env`, then `docker compose up -d --force-recreate backend` |
| Frontend loads but login fails | Open browser devtools → the API calls must go to `/api/...` (same origin). If they point at `localhost`, the frontend image was built with a dev `.env` — rebuild: `docker compose build --no-cache nginx && docker compose up -d` |
| CORS error calling API directly | Set `FRONTEND_URL=http://<SERVER_IP>` (exact origin) in `.env`, or add origins to `CORS_EXTRA_ORIGINS`, then recreate the backend |
| 413 on logo/document upload | Nginx allows 20 MB; backend caps docs at 15 MB and logos at 5 MB — resize the file |
| Invite e-mails never arrive | SMTP not configured or blocked by the VPS provider (many block port 587 by default). The invite itself is still created — check Users → resend once SMTP works |
| Forgot-password code never arrives | Same as above — configure `MAIL_*` first |
| Fresh DB, no users | Backend creates the superadmin from `SUPERADMIN_*` on first start against an empty volume. If you changed them later, update the user in the app instead |
| Disk full | `docker system df` / `docker system prune` (careful: never `prune --volumes` unless you have backups) |

## 15. Files added for this deployment

```text
GEOTECH/
├── docker-compose.yml            # backend + nginx, volumes, network, healthchecks
├── .env.example                  # every required variable (no secrets)
├── .dockerignore                 # root build context exclusions
├── DOCKER_DEPLOYMENT.md          # this file
├── GeoTech-UI/
│   ├── Dockerfile                # node build -> nginx serve + /api proxy
│   └── .dockerignore
├── geotech_backend/
│   ├── Dockerfile                # python:3.12-slim + uvicorn on 0.0.0.0:8000
│   └── .dockerignore
└── nginx/
    └── nginx.conf                # SPA + /api/ strip-proxy + /docs
```

Small code changes required for container deployment (no behaviour change
in local dev):

- `geotech_backend/app/main.py` + `app/core/config.py`: CORS origins now
  include `FRONTEND_URL` and optional `CORS_EXTRA_ORIGINS` (previously a
  hard-coded list that rejected the server-IP origin).
- `geotech_backend/requirements.txt`: added missing `Pillow==12.3.0`
  (company-logo validation imports PIL; it was installed locally but not
  pinned, so Docker builds would have failed logo uploads).
