"""Render the current review and canonical checklist from evidence-bearing findings."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'outputs/review-2026-11-01'
items=json.loads((REVIEW/'findings.json').read_text(encoding='utf-8'))
done=[i for i in items if i['status']=='fixed']
verified=[
 ('Scoring','The 15/3/4 case gives 8/60 = 13.3333%; full-exam denominator, negative scores, strict counts, saved weights and shared preview/save scorer pass existing regressions.'),
 ('Persistence','SQLite transactions, foreign keys, CRUD, shared modes/preferences, partial PATCH preservation and duplicate opt-in pass tests. No personal database was used for review probes.'),
 ('Backup/recovery','Integrity/schema/FK/score checks, matching write-time domains, retained recovery copy, rollback, fresh revision tokens and temporary-file cleanup pass tests.'),
 ('Statistics','Exam/question/maximum-score weighting, undefined zero-attempt accuracy, sparse-dispersion limits, histogram underflow, repeated-date heatmaps, OLS/trends, simulations and period comparisons pass regressions. R07 separately covers identity collisions.'),
 ('Weekly Study','Saturday–Friday normalization, integer minutes, detail-over-aggregate totals, Video subcategories, zero/missing-week distinctions and historical category snapshots pass tests. R01 is a separate stale-version defect.'),
 ('Localization','English/Persian resources, RTL/LTR, local Vazirmatn/Manrope, Persian numeric parsing, Jalali picker boundaries and server/browser calendar equivalence have automated coverage; 20,924 calendar comparison dates agree.'),
 ('Reports','Study text/CSV/XLSX/PDF and dedicated examination PDF/XLSX/JSON/CSV work in both languages. PDF pages were rendered and inspected; versioned examination CSV round-trips historical scoring and metadata.'),
 ('UI foundation','Shared SVG navigation, responsive layouts, chart ARIA/data tables/decal patterns, native modal semantics, focus restoration and reduced-motion support are present. New findings qualify long-label and Settings behavior.'),
 ('Desktop boundary','DesktopSession token/cookie/Host/Origin checks and Windows profile locking pass their unit tests. Plain browser-server launch is a different path (R03).'),
 ('Syntax','Current baseline: Python compilation and node --check for all first-party static JavaScript pass. No syntax errors found. The Settings problem is runtime logic; the desktop traceback is response decoding/lifecycle logic.')]
summary=f"{len(items)} tracked findings: {len(done)} resolved and verified, {len(items)-len(done)} open."
todo=['# Verity — current review and remediation checklist','',
 'Reviewed 2026-11-01; remediation verified 2026-11-02. '+summary,'',
 'Canonical source: `outputs/review-2026-11-01/findings.json`; regenerate with `python scripts/render_review.py`.',
 'Report: [full categorized review](outputs/REVIEW-REPORT.md). Historical checklist/report are archived in `outputs/review-2026-11-01/`.',
 'Latest evidence: [verification and per-item test map](outputs/remediation-2026-11-02/validation.md).',
 '', '## Status and scope','',
 '- `[x]` = implemented and verified with the stated evidence; `[ ]` = open or explicitly unverified.',
 '- P0: reproducible data loss. P1: broken core behavior, incorrect results or security boundary. P2: required capability/data architecture. P3: UX, performance, maintainability and delivery hygiene.',
 '- Findings describe a tested/source-reviewed defect, a missing requirement, or a labeled verification gap. They are not a claim that every possible defect has been found.',
 '- Review verification is historical evidence. Current Windows downloads and publication status are described in README.md and WINDOWS.md.',
 '- Verify using disposable databases. Preserve old records, scoring snapshots and established exam/study behavior.','']
for priority in ['P0','P1','P2','P3']:
 todo += [f'## {priority} — work queue','']
 for i in items:
  if i['priority']!=priority:continue
  todo += [f"- [{'x' if i['status']=='fixed' else ' '}] **{i['id']} — {i['title']}** ({i['category']})",
   f"  - Location: `{i['files']}`.",f"  - Evidence: {i['evidence']}",f"  - Done when: {i['acceptance']}"]
  if i.get('resolution'):todo.append('  - Resolution/verification: '+i['resolution'])
  todo.append('')
todo += ['## Verified behavior to preserve','']+[f'- [x] **{title}:** {body}' for title,body in verified]
(ROOT/'TODO.md').write_text('\n'.join(todo)+'\n',encoding='utf-8')
(ROOT/'outputs/TODO.md').write_text('# Checklist location\n\nThe canonical current checklist is [../TODO.md](../TODO.md).\n\nSee [the review report](REVIEW-REPORT.md) and [the evidence catalog](review-2026-11-01/findings.json). This pointer replaces the duplicate checklist to prevent status drift.\n',encoding='utf-8')
report=['# Verity — comprehensive project review','', 'Review date: 2026-11-01; remediation verified 2026-11-02. '+summary,'',
 '## Scope and evidence','',
 'Reviewed the backend, schema/write/restore paths, scoring/statistics, Weekly Study, all first-party frontend JavaScript/CSS, localization/calendar, dependency manifests, desktop launcher, packaging/CI, tests and delivery documentation. Vendored ECharts/fonts were checked for local loading and notices, not re-audited internally.',
 '', 'Historical baseline: **50 Python tests and 18 Node tests passed**, with a Starlette/httpx deprecation warning. Those suites did not prove complete UI behavior: Settings failed despite a caught exception and no page-error event. Current verification passes **67 Python tests and 25 Node tests** in a fresh pinned environment without that warning, plus 48 cross-browser configurations and 16 Settings regression configurations.',
 '', 'Evidence artifacts: `backend-before.json`, `desktop-before.json`, UI screenshots and regression scripts. Baseline probes used temporary databases/port 8002. Personal records and release state were not modified. Previous feature reports are historical evidence, not substitutes for current results.',
 '', '## Correct and functioning parts','']
for title,body in verified:report += [f'### {title}','',body,'']
report += ['## Categorized findings','', 'Evidence below describes the reproduced pre-fix behavior; each fixed entry includes its current resolution and verification. The catalog tracks known findings, not a guarantee that no other defect exists.','']
for category in dict.fromkeys(i['category'] for i in items):
 report += [f'### {category}','']
 for i in items:
  if i['category']!=category:continue
  report += [f"**{i['id']} · {i['priority']} · {'FIXED' if i['status']=='fixed' else 'OPEN'} — {i['title']}**",'',
   f"Location: `{i['files']}`. {i['evidence']}",'',f"Acceptance: {i['acceptance']}",'']
  if i.get('resolution'):report += ['Resolution and evidence: '+i['resolution'],'']
report += ['## Repair order and verification','',
 'All catalogued work is resolved. The final batch adds draft and stale-edit protection, complete reports/interchange, metadata management, historical scoring snapshots, comparisons, transactional database guards, bounded history views, diagnostics and repeatable quality tooling. The reported Settings loading failure has dedicated empty/populated history and mode/language-switch regression coverage.',
 '', 'After each fix, add a regression that fails on the observed defect. Run the appropriate existing suites and actual browser workflows; verify actual handlers, saved records and downloads rather than treating an empty console as success.',
 '', 'Current results and per-item test evidence are in [validation.md](remediation-2026-11-02/validation.md). Chromium/Edge, Firefox and WebKit were exercised; fresh Windows dependency installation and frozen/native builds passed. Accessibility coverage includes keyboard flows, automated contrast/rules and accessibility-tree inspection, not an end-to-end human NVDA/JAWS certification. GitHub CI/publication was not dispatched; the workflow commands were verified locally.',
 '', '## References','',
 'Local-host protection follows the purpose described by [Starlette middleware documentation](https://starlette.dev/middleware/). Spreadsheet text handling addresses [OWASP CSV injection](https://github.com/OWASP/www-project-web-security-testing-guide/blob/master/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection.md). These references guide the fixes; concrete findings above come from this project’s source and reproductions.']
(ROOT/'outputs/REVIEW-REPORT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
print(summary)
