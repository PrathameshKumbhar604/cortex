# Getting your free keys (~30 min)

Paste each value into `.env` at the repo root (copy `.env.example` first). Cortex only enables a provider once its key is present, so you can add keys one at a time.

## LLMs (free tiers; Cortex fails over between them)

| # | Provider | Where | `.env` key |
|---|----------|-------|-----------|
| 1 | **Google AI Studio (Gemini)** | https://aistudio.google.com/apikey → *Create API key* | `GEMINI_API_KEY` |
| 2 | **Groq** | https://console.groq.com/keys | `GROQ_API_KEY` |
| 3 | **Cerebras** | https://cloud.cerebras.ai → API Keys | `CEREBRAS_API_KEY` |
| 4 | **OpenRouter** (`:free` models) | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |
| 5 | **Puter** (last-resort fallback) | Sign up at https://puter.com → https://puter.com/dashboard → *Auth Token* | `PUTER_AUTH_TOKEN` |

Gemini on its own is enough to run Cortex. Each extra provider adds headroom before you hit rate limits.

## Connectors

### Composio (Gmail, Calendar, Drive, Notion, Slack, GitHub)
1. Sign up at https://platform.composio.dev, then go to **Settings → API Keys** and copy the key to `COMPOSIO_API_KEY`.
2. You don't need to do anything else. Cortex uses Composio-managed OAuth apps, so users just click **Connect** in Cortex.

### Firecrawl (web evidence)
- Sign up at https://www.firecrawl.dev, then go to **API Keys** and copy the key to `FIRECRAWL_API_KEY`.

## Memory: Oracle AI Database + Oracle Agent Memory

**Option A, local (fastest for development, uses Docker):**
```bash
docker run -d --name cortex-oracle -p 1521:1521 -e ORACLE_PWD=CortexDev_123 \
  container-registry.oracle.com/database/free:latest
# wait ~2 min until `docker logs cortex-oracle` shows DATABASE IS READY
```
Then set `ORACLE_DB_USER=system`, `ORACLE_DB_PASSWORD=CortexDev_123` and `ORACLE_DB_DSN=localhost:1521/FREEPDB1`.

**Option B, cloud (for the deployed demo):**
1. Sign up at https://www.oracle.com/cloud/free/. A card is needed for verification, but Always Free resources are never charged.
2. Go to **Oracle AI Database → Autonomous AI Database → Create**, tick **Always Free** and set the ADMIN password.
3. Click **Database connection → Download wallet**, then unzip it into `services/memory/wallet/`.
4. Set `ORACLE_DB_USER=ADMIN`, `ORACLE_DB_PASSWORD=…`, `ORACLE_DB_DSN=<service>_low` and `ORACLE_WALLET_DIR=./wallet`.

If Oracle isn't configured, the memory service falls back to a local SQLite store. The UI labels this clearly, so you can still demo.

## Observability
- Get a key from https://smith.langchain.com, then go to **Settings → API Keys** and copy it to `LANGSMITH_API_KEY`.
