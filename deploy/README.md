# Deploying Cortex

One small AWS Lightsail server runs everything with Docker Compose:

- **web**: the Next.js app, pages and API together, on port 3000
- **memory**: the Python memory service
- **caddy**: serves HTTPS for your domain

Clerk handles sign-in. Every push to `main` rebuilds both images in GitHub Actions and restarts the server. Pull requests only build, so a change that breaks the build fails on the PR and never reaches the server.

## Making changes after launch

Edit the code, open a PR, check that the **Deploy** action passes, then merge to `main`. The site updates about 5 minutes later. To change a secret, edit `/opt/cortex/.env` on the server and run `docker compose up -d`.

## One-time setup

### 1. Domain

Claim a free domain from the GitHub Student Pack (Name.com `.dev`/`.app`, Namecheap `.me`, or `.TECH`). Clerk production needs one.

### 2. Server

In AWS Lightsail:

1. Create an instance: Linux, **Ubuntu 24.04**, the **2 GB** plan.
2. Under **Networking**, attach a **static IP**, and add firewall rules for **HTTPS (443)** and **UDP 443**.
3. Point your domain's `A` record at the static IP.
4. SSH in using the browser button or your key, then run:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/PrathameshKumbhar604/cortex/main/deploy/setup.sh | bash
   ```

5. Turn on **automatic snapshots** for the instance. All the data lives on this one disk in `/opt/cortex/data` and `/opt/cortex/memory-data`, so snapshots are your backup.

### 3. Clerk production

The student pack gives you Clerk Pro for free.

1. In the Clerk dashboard, create a **Production** instance for your domain.
2. Add the DNS records Clerk shows you.
3. Set up Google and GitHub sign-in with your own OAuth apps. Production can't use Clerk's shared dev credentials. Clerk links the steps for each provider.
4. Optional: in **Restrictions**, turn on **Block disposable email addresses**. Cortex blocks them too, but this stops the account from being created at all.
5. Copy the production `pk_live_…` and `sk_live_…` keys.

### 4. Secrets on the server

Edit the secrets file:

```bash
nano /opt/cortex/.env
```

Copy in your local `.env`, then change or add these:

```
DOMAIN=cortex.yourdomain.dev
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
CLERK_SECRET_KEY=sk_live_…
CORTEX_OWNER_EMAILS=you@example.com
```

Leave `MEMORY_SERVICE_URL` out, because Compose sets it. If you use Oracle, copy the wallet files into `/opt/cortex/wallet/`.

### 5. GitHub settings

In the repo, go to **Settings → Secrets and variables → Actions**.

**Secrets:**

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: the `pk_live_…` key. It gets built into the browser code.
- `DEPLOY_SSH_KEY`: the private SSH key for the server. In Lightsail, go to **Account → SSH keys** and download the default key, then paste the whole file.

**Variables:**

- `DEPLOY_HOST`: the static IP. Deploys are skipped until this is set.

Then merge to `main`, or open **Actions → Deploy → Run workflow**.

## Useful commands on the server

```bash
cd /opt/cortex
docker compose ps                # what's running
docker compose logs -f web       # live logs
docker compose restart web       # restart after editing .env
```

To roll back, find the last good commit `<sha>`, then run:

```bash
IMAGE=ghcr.io/prathameshkumbhar604/cortex
docker pull $IMAGE/web:<sha>
docker tag $IMAGE/web:<sha> $IMAGE/web:latest
IMAGE=$IMAGE docker compose up -d
```
