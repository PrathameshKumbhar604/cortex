# Submitting the survey to SN Computer Science (SNCS)

Files: `main.tex` (the manuscript in Springer Nature's template) and `refs.bib` (93 references, all cited).
The original IEEE conference version is unchanged in `../paper/`.

This version is a pure survey (Review Article). It no longer mentions Cortex or contains a case study.

## Compile (Overleaf)

1. Overleaf → New project → Templates → search **"Springer Nature LaTeX Template"** → Open as template.
2. Delete its sample `.tex` and `.bib`, upload `main.tex` and `refs.bib`. Set `main.tex` as the main document.
3. Menu → Compiler: **pdfLaTeX**. Recompile (Overleaf runs BibTeX itself).
4. The class option `sn-mathphys-num` gives numbered references `[1]`. If the SNCS submission page asks for another
   style, change only that option (e.g. `sn-basic` for author–year).

Not compiled here (no LaTeX on this machine). Checked by script: abstract 224 words (limit 150–250), 6 keywords
(limit 4–6), every citation and cross-reference resolves, environments and braces balance, plain ASCII.
On first compile, look at the two page-wide floats (taxonomy figure, comparison table) and the TikZ loop figure.

## What is in it

- Introduction with a table comparing this survey to four earlier ones.
- Review Methodology: research questions, sources, search terms, search date (November 2026), inclusion/exclusion,
  analysis. No record counts, because none were kept; do not add estimated numbers.
- Background (retrievers, retrieval-augmented LMs, retrieval units, where single-pass RAG fails, RAG vs long context).
- Agentic RAG as a sequential decision problem (state, policy, actions, reward) with a figure.
- Eight-dimension taxonomy (figure), each dimension reviewed; GRASP analysed in depth with its reported results.
- Comparison table of 25 methods and four patterns drawn from it.
- Benchmarks table, security (prompt injection, poisoning, MCP), open challenges, conclusion, threats to validity.
- Declarations section (Springer returns submissions without it as incomplete).

## References

52 references were added to the original 41. For each new one, title and authors were taken from the arXiv API,
the venue and pages were checked on Semantic Scholar and the proceedings, and the abstract was read before the
paper was cited. Claims in the text about these papers stay within what their abstracts or full text state.
Numbers from other papers (e.g. the GRASP table) are copied, not re-run, and the text says so.

## You must fill in (red text in the PDF; search `\placeholder`)

Nothing left in red. Declarations are filled in (no funding, no competing interests, generic author contributions,
AI-use disclosure). Keep the AI-use statement: Springer Nature's AI policy requires authors to describe AI use and
confirm accountability. Corresponding author is Prof. Gaikwad (`\author*`); move the `*` if someone else submits.

## Before you submit

- Read the live SNCS submission guidelines and confirm article type **Review Article**, reference style and any
  length limit.
- Re-run the similarity check on this version (`../plagiarism/` holds old reports for the IEEE version).
- Spot-check a sample of references yourselves; you are responsible for every one.
- All five authors approve the final PDF and the author order.
- Short cover letter: scope of the survey, why it is timely (RL-trained search policies, 2025–2026), not under
  review elsewhere.

## Honest view of the odds

No one can promise acceptance; SNCS sends every paper to peer review. Likely reviewer questions:

1. **Coverage of very recent work.** The field moves monthly; reviewers may name papers we missed. Add them if real.
2. **Weight on one preprint.** GRASP is examined in depth and is an arXiv paper. The methodology explains why it was
   chosen; keep that balance if you edit.
3. **No quantitative synthesis.** Results are reported per paper, not pooled, because the setups differ. Reviewers
   may ask for a summary table of reported numbers on HotpotQA/2Wiki/MuSiQue across methods.
