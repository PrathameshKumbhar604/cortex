# Cleanup log: plagiarism and AI-marker pass

Date: 30 Oct 2026. Files covered: `docs/paper/paper.tex`, `docs/paper/refs.bib`, `docs/report/report.tex`, `docs/report/report/part1.tex`, `docs/report/report/part2.tex`, `docs/report/template.tex`, `docs/report/biblo.bib`, and `C:\Users\prath\Downloads\Cortex_BE_Project_Report.docx`.

## How the check was done

1. **Overlap check.** We downloaded the full text of the base paper (GRASP, arXiv:2607.10463). We also fetched the arXiv abstract of every reference that has one. A script then listed every run of 7 or more words shared between our files and those sources.
2. **Exact-phrase web searches.** We searched the web for distinctive sentences from the introduction, the literature survey and the background.
3. **Citation keys.** Every `\cite` key was checked against its `.bib` file.
4. **Reference checks.** Doubtful references were looked up on arXiv, the ACL Anthology, NeurIPS proceedings, McKinsey and retailer pages.
5. **Marker search.** All files, comments included, were searched for: Claude, Anthropic, AI-generated, "Generated with", "as an AI", Co-Authored-By, `[insert`, TODO, lorem, ChatGPT/OpenAI, assistant-style phrasing, and `\hypersetup` or `pdfinfo` metadata. The .docx core properties were checked too.

`report/report/part1.tex` and `part2.tex` are an older split draft of `report.tex`. The .docx is an older export of the same text. Every fix was applied to each copy that contained the passage.

## Passages changed

### Report (`report.tex`, mirrored in `part1.tex`/`part2.tex` and the .docx)

| # | Location | Problem | Source it resembled | Fix |
|---|---|---|---|---|
| R1 | Synopsis, "Review of Conference/Journal Papers", item 1 (GRASP) | Close paraphrase of two abstract sentences: "...to coordinate semantic search, keyword search and paragraph reading, so that it retrieves fine-grained evidence and widens context only when needed. Its reward combines answer accuracy, grounded reading, complementary search and turn efficiency." | GRASP abstract (Gandhi et al., arXiv:2607.10463) | Rewritten in the team's own words. The names of the four reward terms are kept, because they are the paper's technical terms. The citation is kept. |
| R2 | Ch. Introduction, Literature Survey, "Base paper: GRASP", first sentence | Clause-by-clause paraphrase of the abstract's second sentence ("...decide when to retrieve, whether to use lexical matching or semantic similarity, and how to control context granularity to prevent irrelevant tokens from interfering with agent reasoning") | GRASP abstract | Rewritten as "three linked decisions..." in our own words. The citation is kept. |
| R3 | Same item, results sentence | 12-word verbatim span: "single-step retrieval, prompting-based agentic RAG and RL-based retrieval baselines" | GRASP abstract | Rewritten ("one-shot retrieval, prompted agents and other agents trained with reinforcement learning"). |
| R4 | Same item, learned-behaviour sentence | 18-word verbatim span: "uses semantic search for broad exploration, paragraph reading for local verification and keyword search for entity-specific evidence" | GRASP abstract | Rewritten as a description in our own words, attributed to "the authors' analysis". |
| R5 | Ch. Introduction, Motivation, "Fragmented information costs time" | Near-verbatim copy of McKinsey's sentence ("The average interaction worker spends an estimated 28 percent of the workweek managing e-mail and nearly 20 percent looking for internal information or tracking down colleagues who can help with specific tasks"), presented as a paraphrase | McKinsey Global Institute, *The Social Economy* (2012), `mckinseyweb` | Turned into a direct quotation in quotation marks, with the citation. |
| R6 | Ch. Project Plan, Risk Identification, questionnaire | The nine questions are quoted word for word from Pressman's risk identification checklist (they come in through the college template) without saying so | Pressman & Maxim, *Software Engineering: A Practitioner's Approach* (`bookPressman`) | The lead-in sentence now says the questions are quoted from Pressman and Maxim, with `\cite{bookPressman}`. In the .docx it says "Pressman [23]", to match that file's reference list. |

### Paper (`paper.tex`)

| # | Location | Problem | Source it resembled | Fix |
|---|---|---|---|---|
| P1 | Abstract, GRASP sentence | 7-word span "to coordinate semantic search, keyword search and", close to the abstract's wording | GRASP abstract | Reworded ("uses reinforcement learning to teach a small policy model when to search by meaning, when to search by keyword and when to read a whole paragraph..."). |
| P2 | Sec. III-C, "Problem" | 8-word span "use a single retriever or a fixed, coarse chunk size" | GRASP introduction | Reworded. It was already attributed ("In their view..."). |

The author block and the implementation / "how we built it" sections of the paper were not touched, because another agent is editing them.

### Bibliography

| # | File | Change | Evidence |
|---|---|---|---|
| B1 | `paper/refs.bib`, `schick2023toolformer` | Added the missing author Eric Hambro. The NeurIPS 2023 version has nine authors, and `biblo.bib` already listed him. | proceedings.neurips.cc (NeurIPS 36, pp. 68539-68551) |

## Overlaps checked and left unchanged

- **Bibliography strings** (paper titles, "Proceedings of the 61st Annual Meeting of the ACL", etc.) match the sources exactly by design.
- **Tool and reward-term names** stay verbatim because they are technical terms: "semantic search, keyword search, filtering and aggregation" (MARAG-R1), and "answer accuracy, grounded reading, complementary search and turn efficiency" (GRASP).
- **"finite-horizon Markov decision process"** is standard terminology and is attributed to GRASP.
- **GRASP numbers in the paper's Table** are taken from the GRASP paper, and the caption already says so.
- **College-template text** is still in the report: the certificate wording, the risk table definitions (cited to Pressman), the section lead-ins ("This section provides various usage scenarios...", "Data objects that will be managed/manipulated..."), the IDEA matrix, and the Annexure B/C assignment wording (e.g. "Write also test cases [Black box testing] for each identified functions.", "You can use Mathematica or equivalent open source tool..."). This text is shared by every report built on the same template, so a similarity checker will flag it. Removing it would break the college format. **Ask your guide** whether the Annexure assignment instructions should stay as headings or be replaced by your answers.

## References

- **Cite keys:** every `\cite` key in `paper.tex`, `report.tex`, `part1.tex` and `part2.tex` exists in its `.bib`. Nothing is missing, and every `.bib` entry is cited.
- **Found on arXiv by exact title:** GRASP (2607.10463; Adobe Research lists it as Findings of EMNLP 2026), A-RAG (2602.03442), MARAG-R1 (2510.27569), Search-R1, Search-o1, Dense X, GraphRAG, DPR, DeepSeekMath, Toolformer, MCP survey (2503.23278), MemGPT, Generative Agents, Mem0, ALCE, and the other arXiv-hosted entries. See the overlap run for the full list.
- **Confirmed through publisher or venue pages:** Query Rewriting (ACL Anthology 2023.emnlp-main.322; the venue title "in" differs from the arXiv title "for", and the .bib correctly uses the venue title), Toolformer (NeurIPS 36), McKinsey 2023 generative-AI report (authors and June 2023 match), McKinsey 2012 *Social Economy*, and Kulkarni, *Knowledge Innovation Strategy* (Bloomsbury India).
- **Minor discrepancies to check by hand:**
  - Kulkarni: one review gives 2015, but retailers list the hardback as March 2016. The `.bib` says 2015.
  - Pressman: `biblo.bib` and the LaTeX report use the 8th ed. (2015, with Maxim), while the .docx reference list has the 7th ed. (2010, Pressman alone). Pick one edition and make both files match.
  - MemGPT: the author order in the report's hand-written ACM list follows arXiv v1, and the `.bib` follows v2. Both are valid, but use one.
- **More references confirmed by web search:**
  - AIS / Rashkin et al.: Computational Linguistics 49(4):777-840
  - Greshake et al.: AISec 2023, pp. 79-90. ACM lists Abdelnabi as first author; arXiv lists Greshake first.
  - RAPTOR: ICLR 2024
- **Not confirmed online in this pass, because the arXiv API timed out:**
  - Reflexion (NeurIPS 2023, arXiv 2303.11366)
  - Robertson & Zaragoza, BM25 (FnTIR 3(4), 2009)
  - Ries, *The Lean Startup* (2011)
  - Pressman & Maxim, 8th ed. (2015)
  - Startup India website

  These are standard, well-known records and none looks doubtful, but they were not checked online this time.
- **Unverifiable references:** 0. No reference appears to be invented.
- **Overlap result after the fixes:** the remaining runs of 7 or more shared words are all acceptable:
  - bibliography strings
  - cited technical term lists: MARAG-R1's "four retrieval tools: semantic search, keyword search, filtering and aggregation" and GRASP's four reward-term names
  - "finite-horizon Markov decision process"
  - one 7-word phrase, "search queries during step-by-step reasoning", which describes Search-R1 and is cited

## AI / assistant markers

- **"Claude", "AI-generated", "Generated with", "as an AI", "Co-Authored-By", "lorem", "TODO":** none found in any file, comments included.
- **"Anthropic"** appears only as the legitimate author of the cited MCP announcement (`anthropic2024mcp`) and in the sentence saying MCP was introduced by Anthropic. Kept, because it is a correct citation.
- **"OpenAI"** appears only in "OpenAI-compatible", which describes the API format. Kept.
- **Placeholders:** these are intentional, clearly marked spots for the team to fill in. They were not removed:
  - `\placeholder{EMAIL: ...}` in the paper's author block (the other agent's area)
  - `Prof. [Guide Name]`, `Prof. [HOD Name]` and `[Other Person Name]` in the report and the .docx
  - `[to be filled]` and `[Photo]` in the annexures
  - Template instruction text in Annexures B/C/F/G
- **LaTeX PDF metadata:** neither the paper nor the report sets `\hypersetup` or `\pdfinfo`. So the PDF author, creator and producer fields will only show what pdfLaTeX writes itself ("LaTeX with hyperref", "pdfTeX-..."). There is nothing tool- or AI-specific.
- **.docx core properties:**
  - author = "Ajit Paraskar, Harshvardhan Patil, Prathamesh Kumbhar, Bikram Ghosh"
  - last modified by = empty
  - comments = empty
  - title = "Cortex - BE Project Report"
  - application = "Microsoft Word 12.0.0"
  - `word/comments.xml` exists but holds no comments.
  - No change was needed.
- **Hidden watermarks:** Claude does not embed a hidden statistical watermark in the text it writes, so there is nothing hidden to strip. The only things a marker check can find are visible strings and file metadata, which are covered above.

## Not done / not checkable

- No Turnitin, iThenticate or URKUND access, so this is not a similarity score. Run the college's checker and attach its report as Annexure F.
- No LaTeX toolchain is installed (`pdflatex`, `latexmk`, `xelatex`, `tectonic` and MiKTeX are all absent), so nothing was compiled. Every edit is plain prose inside existing paragraphs, with balanced quotes and no new commands. Compile on Overleaf to confirm.
- The web exact-phrase search tool is not a strict exact-match engine. The n-gram overlap check covers only GRASP's full text and the arXiv abstracts of cited works, not the full text of every cited paper or the wider web.
- No text was "humanized" or rewritten to get past AI detectors. That would misrepresent authorship, so it is out of scope. Talk to your guide if this is a concern.
