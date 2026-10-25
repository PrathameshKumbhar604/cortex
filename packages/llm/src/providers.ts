export type Tier = "strong" | "fast";

export interface ProviderConfig {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  models: Record<Tier, string>;
  supportsJsonMode: boolean;
  /** Last-resort providers are only used after every free tier has failed. */
  fallback?: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * Free-tier providers in failover order. All expose OpenAI-compatible endpoints,
 * so one client implementation covers every provider. Model ids are overridable
 * via env because free-tier catalogs change often.
 */
export function loadProviders(env: Env = process.env): ProviderConfig[] {
  // Dev-only: scripts/mock-llm.mjs for UI testing without keys. Never combined with real providers.
  if (env.CORTEX_MOCK_LLM_URL) {
    return [{ id: "mock", label: "Mock (dev only)", baseURL: env.CORTEX_MOCK_LLM_URL, apiKey: "mock", models: { strong: "mock", fast: "mock" }, supportsJsonMode: true }];
  }
  const candidates: (ProviderConfig | null)[] = [
    env.GEMINI_API_KEY
      ? {
          id: "gemini",
          label: "Gemini",
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          apiKey: env.GEMINI_API_KEY,
          models: {
            strong: env.GEMINI_MODEL_STRONG ?? "gemini-flash-latest",
            fast: env.GEMINI_MODEL_FAST ?? "gemini-flash-lite-latest",
          },
          supportsJsonMode: true,
        }
      : null,
    env.GROQ_API_KEY
      ? {
          id: "groq",
          label: "Groq",
          baseURL: "https://api.groq.com/openai/v1",
          apiKey: env.GROQ_API_KEY,
          models: {
            strong: env.GROQ_MODEL_STRONG ?? "openai/gpt-oss-120b",
            fast: env.GROQ_MODEL_FAST ?? "llama-3.1-8b-instant",
          },
          supportsJsonMode: true,
        }
      : null,
    env.CEREBRAS_API_KEY
      ? {
          id: "cerebras",
          label: "Cerebras",
          baseURL: "https://api.cerebras.ai/v1",
          apiKey: env.CEREBRAS_API_KEY,
          models: {
            strong: env.CEREBRAS_MODEL_STRONG ?? "gpt-oss-120b",
            fast: env.CEREBRAS_MODEL_FAST ?? "llama3.1-8b",
          },
          supportsJsonMode: true,
        }
      : null,
    env.OPENROUTER_API_KEY
      ? {
          id: "openrouter",
          label: "OpenRouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: env.OPENROUTER_API_KEY,
          models: {
            strong: env.OPENROUTER_MODEL_STRONG ?? "openai/gpt-oss-120b:free",
            fast: env.OPENROUTER_MODEL_FAST ?? "meta-llama/llama-3.3-70b-instruct:free",
          },
          supportsJsonMode: false,
        }
      : null,
    env.PUTER_AUTH_TOKEN
      ? {
          id: "puter",
          label: "Puter",
          baseURL: "https://api.puter.com/puterai/openai/v1/",
          apiKey: env.PUTER_AUTH_TOKEN,
          models: {
            strong: env.PUTER_MODEL_STRONG ?? "claude-sonnet-5-5",
            fast: env.PUTER_MODEL_FAST ?? "gpt-5.4-nano",
          },
          supportsJsonMode: false,
          fallback: true,
        }
      : null,
  ];
  const providers = candidates.filter((p): p is ProviderConfig => p !== null);
  // Free tiers first, Puter last.
  return [...providers.filter((p) => !p.fallback), ...providers.filter((p) => p.fallback)];
}
