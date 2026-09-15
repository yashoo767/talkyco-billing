# Talkyco Billing — Production Deployment Guide

Complete instructions from a fresh Ubuntu 22.04 server to a running production deployment at **https://billing.talkyco.com**.

---

## Prerequisites

- Ubuntu 22.04 LTS server (2+ vCPU, 2 GB RAM minimum)
- Root or sudo SSH access
- Domain `talkyco.com` with DNS control
- Messaging provider credentials (Account SID + Auth Token)

---

## 1. DNS Configuration

Add an **A record** in your DNS provider (wherever you manage talkyco.com):

| Type | Host                 | Value               | TTL   |
|------|----------------------|---------------------|-------|
| A    | `billing.talkyco.com` | `YOUR_SERVER_IP`   | 300 s |

If your DNS provider uses relative names:

| Type | Name      | Value           | TTL |
|------|-----------|-----------------|-----|
| A    | `billing` | `YOUR_SERVER_IP`| 300 |

Wait for propagation (a few minutes with low TTL).

Verify: `dig +short billing.talkyco.com` → should return your server IP.

---

## 2. Server Setup

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker + Docker Compose
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Install Nginx + Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Create app directory
sudo mkdir -p /opt/talkyco-billing
sudo chown $USER:$USER /opt/talkyco-billing
```

---

## 3. Deploy Application Code

```bash
cd /opt/talkyco-billing

# Option A: Clone from your git repository
git clone https://github.com/YOUR_ORG/talkyco-billing.git .

# Option B: Copy files via rsync from your machine
# rsync -avz ./talkyco-billing/ user@YOUR_SERVER_IP:/opt/talkyco-billing/
```

---

## 4. Environment Configuration

```bash
cd /opt/talkyco-billing

# Create production env file (never commit this)
cat > .env.production << 'EOF'
POSTGRES_PASSWORD=CHANGE_TO_STRONG_RANDOM_PASSWORD

MESSAGING_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MESSAGING_AUTH_TOKEN=your_auth_token_here

RATE_LIMIT_IP_PER_MINUTE=20
RATE_LIMIT_IP_PER_HOUR=200
RATE_LIMIT_PHONE_PER_HOUR=60
RATE_LIMIT_BLOCK_SECONDS=300

CACHE_TTL_TODAY=120
CACHE_TTL_YESTERDAY=900
CACHE_TTL_HISTORICAL=3600

MAX_DATE_RANGE_DAYS=31
NEXT_PUBLIC_APP_URL=https://billing.talkyco.com
EOF

chmod 600 .env.production
```

Generate a strong password: `openssl rand -hex 32`

---

## 5. Build & Start Containers

```bash
cd /opt/talkyco-billing

# Build image and start all services (app, postgres, redis, migrate)
docker compose --env-file .env.production up -d --build

# Watch logs
docker compose logs -f app
docker compose logs migrate   # should show "All migrations applied"
```

Verify the app is running on port 3000:
```bash
curl -s http://localhost:3000 | grep -o "<title>.*</title>"
# → <title>Talkyco Billing — Messaging Usage & Billing</title>
```

---

## 6. Nginx Configuration

```bash
# Add rate-limiting zones to the nginx http block
sudo tee -a /etc/nginx/nginx.conf > /dev/null << 'EOF'
# Talkyco rate limiting zones — add inside http { } block
limit_req_zone $binary_remote_addr zone=talkyco_global:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=talkyco_api:10m    rate=10r/m;
EOF

# NOTE: Actually edit /etc/nginx/nginx.conf manually and add the two
# limit_req_zone lines inside the existing http { } block (not at the end).
# The tee command above is a reminder — verify placement manually.

# Copy vhost config
sudo cp /opt/talkyco-billing/nginx/billing.talkyco.com.conf \
        /etc/nginx/sites-available/billing.talkyco.com

# Enable site
sudo ln -sf /etc/nginx/sites-available/billing.talkyco.com \
            /etc/nginx/sites-enabled/billing.talkyco.com

# Remove default site if present
sudo rm -f /etc/nginx/sites-enabled/default

# Test config (expect: "syntax is ok" and "test is successful")
sudo nginx -t

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

At this point, `http://billing.talkyco.com` should proxy to the app (no SSL yet).

---

## 7. SSL — Let's Encrypt

```bash
# Obtain certificate (Certbot will edit your nginx config automatically)
sudo certbot --nginx -d billing.talkyco.com \
  --non-interactive \
  --agree-tos \
  --email admin@talkyco.com \
  --redirect

# Test certificate renewal
sudo certbot renew --dry-run

# Certbot creates a systemd timer for auto-renewal — verify it:
sudo systemctl status certbot.timer
```

After certbot runs, the nginx config is updated with the SSL cert paths.
The `billing.talkyco.com.conf` already contains the correct SSL stanzas —
certbot will fill in the file paths.

Verify: `curl -I https://billing.talkyco.com` → HTTP/2 200

---

## 8. Background Sync (Optional)

To keep the database in sync with the provider (recommended for historical lookups):

```bash
# Install cron for sync script
sudo crontab -e
# Add this line (runs every 15 minutes):
# */15 * * * * cd /opt/talkyco-billing && docker compose exec app npm run sync >> /var/log/talkyco-sync.log 2>&1
```

For the sync to work inside Docker, make sure the app container has `ts-node` available (it's in devDependencies). Alternatively, run sync as a separate service or use a plain node script compiled to JS.

---

## 9. Production Checklist

### Security
- [ ] `.env.production` has `chmod 600` and is NOT in git
- [ ] `POSTGRES_PASSWORD` is a strong random string (32+ chars)
- [ ] `MESSAGING_AUTH_TOKEN` matches your provider dashboard
- [ ] Nginx security headers present (`curl -I https://billing.talkyco.com`)
- [ ] `X-Powered-By` header is absent from responses
- [ ] SSL certificate valid and auto-renewal configured
- [ ] Rate limiting zones active in Nginx (`nginx -T | grep limit_req_zone`)
- [ ] App-level rate limiting working (Redis)

### Application
- [ ] `https://billing.talkyco.com` loads correctly
- [ ] Phone number lookup returns results (test with a known number)
- [ ] Custom date range works
- [ ] CSV export downloads correctly
- [ ] Mobile responsive (test on phone)
- [ ] No provider names visible anywhere in the UI
- [ ] No internal IDs, costs, or credentials in API responses (`curl -s https://billing.talkyco.com/api/lookup -d '{"phoneNumber":"+14155551234","preset":"today"}'`)

### Infrastructure
- [ ] Docker containers restart on reboot (`restart: unless-stopped`)
- [ ] PostgreSQL data volume persists: `docker compose ps` shows postgres healthy
- [ ] Redis data volume persists: `docker compose ps` shows redis healthy
- [ ] Nginx starts on boot: `systemctl is-enabled nginx`
- [ ] Log rotation configured for `/var/log/nginx/*.log`

### Monitoring (recommended additions)
- [ ] Set up uptime monitoring (e.g. UptimeRobot, BetterUptime) for `https://billing.talkyco.com`
- [ ] Configure log shipping or alerting for errors in `docker compose logs app`
- [ ] Disk space monitoring for pgdata volume

---

## Application Port Summary

| Service    | Internal Port | External Port |
|------------|--------------|---------------|
| Next.js app| 3000         | Nginx proxy only (not public) |
| PostgreSQL | 5432         | Internal Docker network only |
| Redis      | 6379         | Internal Docker network only |
| Nginx HTTP | 80           | 0.0.0.0:80 |
| Nginx HTTPS| 443          | 0.0.0.0:443 |

PostgreSQL and Redis are isolated to the Docker bridge network (`talkyco`).
Only ports 80 and 443 are open to the internet (via Nginx).

Optionally harden with a firewall:
```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (redirect)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

---

## Updating the Application

```bash
cd /opt/talkyco-billing
git pull
docker compose --env-file .env.production up -d --build
# Zero-downtime: Docker rebuilds and replaces the app container.
# Database migrations run automatically via the `migrate` service.
```

---

## Caching Strategy Summary

| Period           | Cache TTL     | Rationale |
|-----------------|---------------|-----------|
| Today            | 2 minutes     | Live data needed; balances freshness vs. API calls |
| Yesterday        | 15 minutes    | Day is closed; minor staleness acceptable |
| Historical (older)| 60 minutes   | Data won't change; aggressive caching reduces API load |

Cache keys include the normalised E.164 phone number and the exact date range.
Raw user input is never used as a cache key (prevents cache poisoning).

---

## Financial Calculation Notes

- All costs use `Decimal.js` with `ROUND_HALF_UP` — no IEEE-754 float errors.
- `actual_cost` stored as decimal string (e.g. `"0.007500"`), never as float.
- `customer_cost = actual_cost × 1.30` — this is a **30% markup on cost**.
- Calculations are server-side only; the browser never receives `actual_cost`.
- Only message-level costs are included. Phone number rental and other
  account-level fees cannot be reliably attributed to individual numbers
  and are explicitly excluded from the displayed total.
