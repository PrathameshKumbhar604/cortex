# Report notes

## Files

| File | What it is |
|---|---|
| `report.tex` | The filled report, built on `template.tex` |
| `biblo.bib` | Bibliography for `\bibliography{biblo}`; 26 entries, all cited |
| `DPU_DYP_Logo.png`, `UNI_LOGO.jpg` | College and university logos (unchanged) |
| `screens/*.png` | 8 app screenshots used in the Results chapter, copied from `apps/web/.impeccable/review/` |
| `template.tex` | The original college template (unchanged) |

All diagrams are drawn in TikZ inside `report.tex`: use case, ERD, Level 0 and Level 1 DFD, activity, state, architecture, class (two parts), sequence, task network, Gantt chart, Venn diagram, functional dependency graph and two result bar charts. Because of this, `use-case.jpg`, `state-dig.jpg`, `arch2.jpg` and `class-dig.jpg` are not needed. The template's labels (`fig:usecase`, `fig:state-dig`, `fig:arch-dig`, `fig:class-dig`) are kept.

## How to compile

No LaTeX is installed on this machine, so the report has **not** been compiled. Only static checks were run: brace balance, environment balance, labels and refs, citation keys against `biblo.bib`, image paths, and ASCII-only source.

**Overleaf:**
1. Upload `report.tex`, `biblo.bib`, both logos and the `screens/` folder, keeping the folder name.
2. Set the compiler to pdfLaTeX and the main document to `report.tex`.
3. Recompile. Overleaf runs pdflatex, bibtex, pdflatex, pdflatex.

**Locally:** `pdflatex report && bibtex report && pdflatex report && pdflatex report`.

Packages used, all in TeX Live: fancyhdr, graphicx, titlesec, hyperref, tikz, tabularx, tocbibind, appendix, titletoc, float, subcaption, multirow, algorithm2e.

Expected length is about 120 to 140 pages. This is an estimate, not a count from a compiled PDF. The template puts every chapter and annexure title on its own page, which adds about 20 pages.

## Placeholders left for the team

Search `report.tex` for `[` to find them.

- **Guide name:** `Prof. [Guide Name]` appears on the title page, certificate (twice), approval sheet, acknowledgments, Synopsis 1.3 and the team-roles table.
- **HOD name:** `Prof. [HOD Name]` appears on the certificate, approval sheet and acknowledgments.
- **Acknowledgments:** `[Other Person Name]`.
- **Team roles (Table "Team roles", section 5.4):** which member owns which subsystem is marked `[to be filled]`. The roles come from the code's subsystems; who did what is not known.
- **Annexure E, Reviewers comments:**
  - The paper title is taken from `docs/paper/paper.tex`.
  - Still to fill: the conference, accepted or rejected, the reviewers' comments, and corrective actions.
- **Annexure F, Plagiarism report:** attach after the check.
- **Annexure G, Term-II assignments:** fill in the Term-I feedback and corrective actions.
- **Annexure H, Group members:** for each of the four students, fill in date of birth, gender, address, e-mail, phone, placement and papers. Each photo is an empty framed box marked `[Photo]`. To add a photo, replace the box with `\includegraphics[width=60pt]{<file>}` and upload the file.
- **Annexure C:** "Additional assignments by the guide", if there are any.
- **Schedule (section 5.3 task set, Annexure D Gantt chart and planner table):**
  - These are a *planned* schedule for A.Y. 2026-2027.
  - Git history only shows the implementation commits (25 to 26 Oct 2026). The earlier months (survey, SRS, design) are planned dates, not records.
  - Correct them against your own records.
- **Conferences (Synopsis 1.10):** "SPPU / central university conference: to be selected with the guide".

## Deviations from the template, and why

### Fixes so it compiles

Each fix is marked `% FIX` in the source.

1. Added `\usepackage{fancyhdr}`. The template uses `\pagestyle{fancy}`, `\fancyhead`, `\cfoot` and `\rfoot` without loading it.
2. Added `\usepackage{graphicx}` for `\includegraphics` and `\resizebox`.
3. Added `\usepackage{titlesec}`. `\titleformat` and `\filcenter` need it.
4. Added `\providecommand{\frontmatter}{}` and `\providecommand{\mainmatter}{\clearpage\pagenumbering{arabic}}`. These are `book`-class commands and do not exist in the `report` class. `\mainmatter` now does what it does in `book`: it switches to arabic page numbers.
5. Added `\setlength{\headheight}{15pt}`. This only silences a fancyhdr warning.
6. Added `\usetikzlibrary{positioning,fit,calc}` for the diagrams.
7. Title page: closed the two `{\bfseries ...` groups ("Under The Guidance of ..." and "Department of Computer Engineering ... A.Y.") with `\par}`. The template left them open and relied on stray `}` later in the file, which crosses environment boundaries.
8. Certificate: added `\egroup` to close the template's `\bgroup`.
9. Certificate: replaced `\\\\` after `\end{center}` with `\vspace*{2\baselineskip}`. A `\\` in vertical mode is an error.
10. Approval sheet: removed `\\` after two `\end{center}`, for the same reason.
11. Approval sheet: removed the stray `}` after `\vspace*{1\baselineskip}`.
12. Removed the stray `}` after the Conclusion chapter text.
13. Annexure H: replaced `\includegraphics{photo.jpg}` with a framed placeholder box. `photo.jpg` does not exist, and a missing file stops compilation.

### Layout changes

1. **Title.**
   - The title is in a macro, `\ProjectTitle`, so it is the same everywhere.
   - The title-page line spacing is `\fontsize{16}{18}` instead of `{16}{12}`, so the three-line title does not overlap itself.
   - The title takes about three lines, which adds roughly 40pt to the title page. If the page spills onto a second page after compiling, change the `\vspace*{2\baselineskip}` right after `\ProjectTitle` on the title page to `1\baselineskip`.
   - On the certificate, the title is in a centred block instead of `\centerline`. `\centerline` cannot wrap and the title would run off the page.
2. **Names.** Each student's name is in `\makebox[55mm][l]{...}`, so the "Exam No" column lines up. The roll numbers (BCOC17, BCOC32, BCOC35, BCOC47) are in the "Exam No" field, as requested.
3. **Approval sheet.** "A Project Title" reads "A Project Titled", followed by the title in parentheses.
4. **Year.** 2026-2027 is used everywhere:
   - title page: "A.Y 2026-2027", unchanged;
   - approval sheet: "ACADEMIC YEAR 2026-2027", was 2024-2025;
   - footer: "2026-2027", was 2023-24.
5. **Acknowledgments.** These use "we/our" instead of "I/my", because this is a four-member team. "CollegeName" is replaced with "Dr. D. Y. Patil Institute of Technology, Pimpri".
6. **Heading typo.** "Compoent Design" is corrected to "Component Design". This is the only heading whose text was changed.
7. **Placeholder headings.**
   - "Algorithm 1/Pseudo Code" and "Algorithm 2/Pseudo Code" are kept.
   - Two subsections, "Algorithm 3/Pseudo Code" and "Algorithm 4/Pseudo Code", are added for the model router and the memory policy.
8. **Added sub-sections and figures.** The template's order is unchanged. Additions:
   - an ERD figure under "Data objects and Relationships";
   - an "Interaction diagram for a consent-gated action" subsection with a sequence diagram, after the class diagram (the template asks for interaction diagrams);
   - extra risk-detail tables 4 to 6 (the template shows 3);
   - tables for literature comparison, approaches, cost, roles, interfaces, database, tools, acceptance, tests and evaluation.
9. **Class diagram.** It is one figure (`fig:class-dig`) with two sub-figures, (a) core and (b) connectors, so it stays readable at text width.
10. **Annexure letters.**
    - The template text says "Annex A and B" for the lab assignments and "Annex C" for the planner.
    - With the template's own annexure order (References, two lab-assignment annexures, Planner, ...), these are actually B, C and D.
    - The text uses `\ref{}`, so the letters are always correct.
11. **References format.**
    - The template sets `\bibliographystyle{ieeetr}`, but the annexure "References" says "(Strictly in ACM Format)". Both are kept as in the template.
    - BibTeX produces the IEEE-style numbered "References" chapter.
    - Annexure A repeats the same references written by hand in ACM reference format.
    - If the department wants only one list, delete one of them.

## Bibliography decisions

- **Template keys.** The template cites `bookPressman`, `innovationbook`, `ehr`, `mckinsey`, `mckinseyweb` and `govwebsite` but does not include the `.bib` file. It is not known which works the department intended, so each key is filled with a real, verified work that fits how the template uses it:
  - `bookPressman`: Pressman & Maxim, *Software Engineering: A Practitioner's Approach*, 8th ed., McGraw-Hill, 2015.
  - `innovationbook`: Parag Kulkarni, *Knowledge Innovation Strategy*, Bloomsbury India, 2015. This is a best guess for the IDEA-matrix / knowledge-canvas book. The book was verified, but the search could not confirm that it contains those two models. Replace it if the department names another book.
  - `ehr`: Eric Ries, *The Lean Startup*, Crown Business, 2011. It is a reasonable entrepreneurship reference; the original target of this key is unknown.
  - `mckinsey`: McKinsey & Company, *The economic potential of generative AI: The next productivity frontier* (June 2023). All eight authors were verified.
  - `mckinseyweb`: McKinsey Global Institute, *The social economy* (July 2012). This is the source of the "28% e-mail, nearly 20% searching" statistic in the Motivation. Only the first three authors could be verified, so the entry says "and others".
  - `govwebsite`: the Startup India portal of DPIIT, Government of India.
- **Base paper.** GRASP was found and verified on arXiv: arXiv:2607.10463, submitted 11 Jul 2026. Authors: Varun Gandhi, Jaewook Lee, Shantanu Todmal, Franck Dernoncourt, Ryan Rossi, Zichao Wang, Andrew Lan (UMass Amherst and Adobe Research).
  - It is cited as an arXiv preprint.
  - Adobe Research's page lists the sixth author as "Jack Wang" and suggests EMNLP 2026 Findings, but the venue could not be confirmed, so it is not claimed.
  - The benchmark numbers quoted in the survey (retrieval recall 0.90 / 0.90 / 0.70 on HotpotQA / 2Wiki / MuSiQue) come from the paper's Table 1, read through the Hugging Face paper page.
- **Literature.** The other 19 entries are 18 peer-reviewed papers or arXiv preprints plus Anthropic's MCP announcement page. Each one's title, authors, venue or arXiv id, year and (where given) pages was checked by web search. The `\cite` targets are the 26 keys in `biblo.bib`; nothing is cited that is not in the file.

## Honesty notes on content

- **Evaluation.** All results come from `evals/results/deep-2026-10-26.json` and are labelled preliminary: 12 questions, a fictional workspace, free-tier models, and run-to-run variation. Groq answered 4 questions and Gemini answered 8 after failover.
- **Screenshots.** They were captured with the development mock model. The captions and the chapter text say so.
- **Oracle.** The local Oracle container is described as set up but blocked by a Docker networking issue. Memory runs on the SQLite fallback.
- **Code versus vision docs.** The report describes what the code does, not what the vision docs say, where the two differ:
  - the orchestrator is hand-written, not LangGraph;
  - planning uses the fast model tier;
  - time-travel queries, the editable plan and Cortex-as-an-MCP-server are listed as future work.
- **Cost estimate.** The COCOMO figures use 6.1 KLOC, counted as non-blank lines of TypeScript, TSX, Python, CSS and scripts in the repo.

## Housekeeping

- While this report was being written, another process committed an intermediate draft, `docs/report/part1.tex`, together with `docs/report/screens/*.png`, in commit 7c9d2a1. That draft has been merged into `report.tex` and deleted, so `git status` shows `part1.tex` as deleted.
- The folder `docs/report/report/` and the archives `docs/report.zip` and `docs/report.rar` were not created by this work and were left untouched. They are snapshots taken mid-way and are now out of date.
