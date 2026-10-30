# Paper notes

Files in this folder:

- `paper.tex`: the review paper (IEEEtran, `\documentclass[conference]{IEEEtran}`).
- `refs.bib`: 41 references, all cited in the text.
- `NOTES.md`: this file.

The two figures are drawn with TikZ inside `paper.tex`, so there are no image files to upload.

## How to compile (Overleaf)

1. Create a blank Overleaf project and upload `paper.tex` and `refs.bib`.
2. Menu > Settings: Compiler = **pdfLaTeX**. Main document = `paper.tex`.
3. Click Recompile. Overleaf runs pdfLaTeX, BibTeX, pdfLaTeX, pdfLaTeX automatically.
   `IEEEtran.cls` and `IEEEtran.bst` are part of TeX Live, so you don't need to upload them.

Local equivalent: `pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper`.

Packages used (all in TeX Live): `cite`, `amsmath`, `amssymb`, `graphicx`, `array`, `booktabs`, `url`, `xcolor`, `tikz` (libraries `arrows.meta`, `positioning`, `calc`).

LaTeX is not installed on the machine where this was written, so the source has **not been compiled**. I checked it with a script instead: braces balance, every `\begin` has a matching `\end`, all 41 `\cite` keys exist in `refs.bib` and every entry is cited, every `\ref` has a `\label`, table rows have the right number of columns, and both files are plain ASCII. On the first Overleaf compile, check:

- **Page count.** The target is 6 to 8 pages. The body text is about 3,500 words (about 5,900 for the whole PDF; the cap is 6,300) plus two figures, four tables and 41 references, which should come to roughly 8 pages. If it runs over, the easiest cuts are the "Open Challenges" paragraphs (Section VI) and the "Where Cortex goes beyond GRASP's setting" paragraph (Section V-B).
- **Fig. 1 (taxonomy, full page width).** The boxes are 3.75 cm wide on a 4.3 cm grid. If a box overflows, lower `text width` in the `cat` style.
- **Fig. 2 (Cortex pipeline).** It is wrapped in `\resizebox{\columnwidth}{!}{...}`, so it always fits the column. If the text looks too small, raise `font=\scriptsize` to `\footnotesize` and widen the node spacing.
- **Table II (full-width comparison).** The column widths add up to about 17.5 cm. If the table is too wide, shrink the `p{...}` widths.

## Placeholders to fill in

All placeholders are printed in red through the `\placeholder{...}` macro. Search for `\placeholder`.

| Where | Placeholder |
|---|---|
| Author block 1 | `\placeholder{EMAIL: Ajit Paraskar}` |
| Author block 2 | `\placeholder{EMAIL: Harshvardhan Patil}` |
| Author block 3 | `\placeholder{EMAIL: Prathamesh Kumbhar}` |
| Author block 4 | `\placeholder{EMAIL: Bikram Ghosh}` |

There are no other placeholders. No guide or co-author was added. If your department requires a guide's name, an acknowledgment, or a code/repository URL, add them yourselves.

Before submitting, you can delete the `\placeholder` macro definition and the `xcolor` package. `tikz` loads `xcolor` anyway, so removing the package line has no effect.

## What was verified

### Base paper (GRASP)

- Found on arXiv as **2607.10463** (v1, 11 Jul 2026, cs.AI). The authors are Varun Gandhi, Jaewook Lee, Shantanu Todmal (UMass Amherst), Franck Dernoncourt, Ryan Rossi, Zichao Wang (Adobe Research) and Andrew Lan (UMass Amherst).
- The full PDF was downloaded and converted to text, and I read the main body, the limitations, the ethics section and appendices A to E. Every method detail and number in the paper comes from that text: the MDP formulation, the four actions, top-k = 5, BM25 + Qwen3-0.6B, the reward weights 0.7/0.15/0.15, GRPO on Qwen2.5-3B-Instruct, 270 steps (~19% of an epoch), max 10 turns, loss masking, 500 questions per dataset, Tables 1 to 3 and the ablation numbers.
- The table layout in the extracted PDF text was scrambled. I cross-checked the row order of Tables 1 and 2 against the arXiv HTML version, and the two sources agree.
- **Venue:** Adobe Research's publication page lists GRASP as EMNLP 2026 Findings, dated 29 Oct 2026. I could not confirm this in the ACL Anthology (the conference date is after today), so `refs.bib` cites the arXiv preprint and mentions the Adobe listing in a note. Update the entry once the Anthology version exists.

### Other references

Every other entry was checked by web search against arXiv, the ACL Anthology, NeurIPS/ICLR/ICML proceedings pages, or the publisher. Notes on edge cases:

- **Search-R1:** cited as COLM 2025 (from the search result summary; arXiv:2503.09516 is in the note field).
- **MemGPT:** author lists differ between arXiv versions. The bib uses the seven-author list on the PDF, which includes Ion Stoica.
- **Reflexion:** uses the five-author NeurIPS 2023 proceedings list. The arXiv version has more authors.
- **Agentic RAG survey (Singh et al.):** uses the four authors of v1 to v3. The 2026 v4 adds Athanasios V. Vasilakos.
- **Query rewriting (Ma et al.):** the ACL Anthology title "Query Rewriting *in* Retrieval-Augmented Large Language Models" is used, not the arXiv title ("...*for*...").
- **MCP:** cited as Anthropic's announcement (25 Nov 2024) at `https://www.anthropic.com/news/model-context-protocol`. The date was confirmed through secondary sources; the exact URL was not opened.
- **DeepSeekMath (GRPO), HotpotQA, 2WikiMultiHopQA, MuSiQue, BM25:** details match GRASP's own reference list and are standard citations. BM25 is cited as Foundations and Trends in IR 3(4):333-389. GRASP's bibliography gives a different volume, but 3(4) is the published one.
- **Lewis et al. (RAG):** NeurIPS 2020, vol. 33, pp. 9459-9474. The page range comes from a secondary reference listing; the venue and authors were confirmed on the proceedings page and arXiv.

## Cortex facts: sources and caveats

The Cortex description in Section V follows the code, not the vision or roadmap documents: `packages/agent/src/{run,verify,prompts,actions,memory,time}.ts`, `packages/connectors/src/*`, `packages/llm/src/{providers,router}.ts`, `services/memory/app/{main,ledger,oracle}.py`, the web app's consent route and the claim styling.

Docs and code disagree in a few places. The paper follows the code in each case:

- `docs/03-TECH-STACK.md` says orchestration uses LangGraph.js. The code is a hand-written loop (as `02-ARCHITECTURE.md` says).
- `02-ARCHITECTURE.md` says the planner uses the strong model. The code uses the `fast` tier for planning.
- `02-ARCHITECTURE.md` lists the router order as Gemini, then Groq. The code tries Groq first.
- `01-VISION.md` lists temporal diffs, an editable plan, shareable "reasoning receipts" and Cortex-as-an-MCP-server. These are roadmap items and are **not** claimed in the paper.

The preliminary evaluation numbers (Table IV) match `evals/results/deep-2026-10-26.json`:

- groundedness 0.88, citation recall 0.92, not-found 1/1, conflicts 1/2, actions 1/2, 0 executed without consent, p50 3,709 ms, p90 7,110 ms.
- In the code, "groundedness" counts partial support as 0.5 (`verify.ts: groundedness()`), and "citation recall" is the fraction of each question's expected key strings that appear in the cited evidence (`evals/run.ts`). The paper describes both exactly this way.
- The result file lists three models: Groq `openai/gpt-oss-120b`, Gemini `gemini-3.5-flash-lite` and OpenRouter `nvidia/nemotron-3-super-120b-a12b:free`. Individual rows also show the fast-tier models (`openai/gpt-oss-20b`, `gemini-flash-lite-latest`). The paper names Groq as primary and Gemini as fallback, and says that other free-tier providers were available for failover. It does not name the OpenRouter model.
- These numbers come from one run of 12 developer-written questions on a synthetic workspace. The paper says so and makes no comparison with other systems.
