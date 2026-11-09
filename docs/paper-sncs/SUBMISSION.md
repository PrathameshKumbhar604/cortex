# Submitting the survey to SN Computer Science (SNCS)

Files: `main.tex` (the manuscript in Springer Nature's template) and `refs.bib` (41 references, all cited).
The original IEEE conference version is unchanged in `../paper/`.

## Compile (Overleaf)

1. Overleaf → New project → Templates → search **"Springer Nature LaTeX Template"** → Open as template.
2. Delete its sample `.tex` and `.bib`, upload `main.tex` and `refs.bib`. Set `main.tex` as the main document.
3. Menu → Compiler: **pdfLaTeX**. Recompile (Overleaf runs BibTeX itself).
4. The class option `sn-mathphys-num` gives numbered references `[1]`. If the SNCS submission page asks for another
   style, change only that option (e.g. `sn-basic` for author–year).

Not compiled here (no LaTeX on this machine). Checked by script: abstract 222 words, 6 keywords, every citation and
cross-reference resolves, environments and braces balance, plain ASCII. Check the two wide figures/tables on first compile.

## What changed from the IEEE version

- Springer Nature template: author/affiliation blocks, `\abstract`, `\keywords`, numbered reference style.
- Abstract rewritten to 222 words (limit 150–250) to describe the survey first, the case study second.
- Keywords cut from 10 to 6 (limit 4–6).
- New **Section 2, Review Methodology**: research questions, sources, search terms, inclusion/exclusion, analysis.
  Reviewers of surveys check for this first; it was missing.
- Contributions paragraph restated as four numbered contributions.
- New **Threats to Validity** section (coverage, preprints, the small Cortex evaluation).
- New **Declarations** section (Springer returns submissions without it as incomplete): funding, competing interests,
  ethics, consent, data, code, author contributions, and generative-AI use.
- Fixed one statement that no longer matches Cortex (claims are not "struck through").

## You must fill in (red text in the PDF; search `\placeholder`)

1. Methodology: the month and year of the literature search, and the record counts **only if you have them**. Do not estimate.
2. Funding (confirm "no funding"), data availability, code availability (a public repo URL helps reviewers a lot).
3. Author contributions.
4. **Generative-AI use.** Springer Nature requires authors to disclose AI assistance with writing. Write what you
   actually did. Leaving it out risks rejection or later retraction.
5. Corresponding author: currently Prof. Gaikwad (`\author*`). Move the `*` if someone else will handle the submission.
6. Acknowledgements: fill in or delete.

## Before you submit

- Check the live SNCS "Submission guidelines" page while logged in (it needs a login, so it could not be read here):
  confirm article type **Review Article**, reference style, abstract format and any length limit.
- Similarity: re-run the plagiarism check on this version (`../plagiarism/` holds the old reports). Keep it low.
- Make sure all five authors approve the final PDF and the author order.
- Prepare a short cover letter: what the survey covers, why it is timely, that it is not under review elsewhere.

## Honest view of the odds

No one can promise acceptance; SNCS sends every paper to peer review. What most often sinks a survey at a journal:

1. **Thin coverage.** 41 references is light for a journal survey (60–100 is common). Adding ~20–30 well-chosen,
   verified works (e.g. more on GraphRAG, long-context vs RAG, agent benchmarks, tool-use safety) is the single
   biggest improvement. Every added reference must be real and checked.
2. **Anchoring on one preprint.** The paper reads partly as a commentary on GRASP (an arXiv paper). The new
   abstract and methodology frame it as a survey with GRASP as one in-depth case; keep that balance if you edit.
3. **Weak case-study evidence.** Cortex's numbers are 12 self-written questions on synthetic data. They are now
   labelled as illustrative; reviewers may still ask for more. A larger question set or a second annotator would help.
4. **Missing declarations or AI disclosure:** fixed in the template; fill them in truthfully.

Doing items 1 and 3 moves the paper from "possible with major revisions" toward "likely with minor revisions".
