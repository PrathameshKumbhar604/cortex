import { traceable } from "langsmith/traceable";
import type { AgentDeps } from "./run";

export const tracingEnabled = () => process.env.LANGSMITH_TRACING === "true" && !!process.env.LANGSMITH_API_KEY;

/**
 * Wraps LLM calls and connector searches as LangSmith child runs, so a trace
 * shows plan → each search → synthesis → verification. No-op without a key.
 */
export function withTracing(deps: AgentDeps): AgentDeps {
  if (!tracingEnabled()) return deps;
  const { llm, registry } = deps;
  const tracedLlm = Object.assign(Object.create(Object.getPrototypeOf(llm)), llm, {
    json: traceable(llm.json.bind(llm), { name: "llm.json", run_type: "llm" }),
    stream: traceable(llm.stream.bind(llm), { name: "llm.stream", run_type: "llm" }),
    complete: traceable(llm.complete.bind(llm), { name: "llm.complete", run_type: "llm" }),
  }) as typeof llm;
  const tracedRegistry = Object.assign(Object.create(Object.getPrototypeOf(registry)), registry, {
    safeSearch: traceable(registry.safeSearch.bind(registry), { name: "connector.search", run_type: "tool" }),
  }) as typeof registry;
  return { ...deps, llm: tracedLlm, registry: tracedRegistry };
}

export function traced<F extends (...args: never[]) => unknown>(fn: F, name: string): F {
  return tracingEnabled() ? (traceable(fn as never, { name, run_type: "chain" }) as unknown as F) : fn;
}
