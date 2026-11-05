# The Cortex web app (pages + API). Built by .github/workflows/deploy.yml; data lives in /app/.data (a volume).
FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/agent/package.json packages/agent/
COPY packages/connectors/package.json packages/connectors/
COPY packages/llm/package.json packages/llm/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY . .
# Clerk's publishable key is public and baked into the browser bundle at build time.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build && mkdir -p .data && chown -R node:node .data apps/web/.next

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@cortex/web"]
