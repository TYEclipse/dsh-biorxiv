# Changelog

## 0.1.0-alpha.19 — 2026-10-18

- CLI `--summary` explicitly enables the summary provider (requires the configured key env); MCP enables it with `DSH_BIORXIV_SUMMARY=1`.
- Default remains off.

## 0.1.0-alpha.18 — 2026-10-18

- Optional Chinese summaries via DeepSeek chat completions; default off.
- Summary sends only public title/abstract; no internal notes, no key in logs.
- `digest --summary` / `biorxiv_digest.summary` opt-in; provider failure does not break the digest.
- 139 tests; 100% line coverage.

## 0.1.0-alpha.17 — 2026-10-18

- Default relevance filter `minScore=3`; G1 provisional precision 83.3% holdout / 100% design, recall 58.8% holdout.
- `minScore` exposed in dsh/MCP/CLI; set 0 to broaden.
- 133 tests; 100% line coverage.

## 0.1.0-alpha.16 — 2026-10-18

- `biorxiv_digest`: structured markdown digest (extractive; no AI summary, no delivery).
- CLI `digest` and MCP `biorxiv_digest` expose the same package.
- 132 tests; 100% line coverage.

## 0.1.0-alpha.15 — 2026-10-18

- CLI: `dsh-biorxiv search|paper|latest|export`, JSON envelope, exit codes.
- MCP stdio server: `dsh-biorxiv-mcp` with initialize, tools/list and tools/call.
- 122 tests; 100% line coverage.

## 0.1.0-alpha.14 — 2026-10-18

- Real-API smoke now exercises all four tools: search, paper, latest, export.
- Package remains limited to public code/docs/skill; private project docs stay out.

## 0.1.0-alpha.13 — 2026-10-18

- Package whitelist narrowed to `scripts/smoke.mjs` and `scripts/coverage-ratchet.mjs`; private self-check scripts excluded.

## 0.1.0-alpha.12 — 2026-10-18

- Public README and agent skill; package whitelist excludes private project docs.
- Coverage ratchet script (`coverage:check` / `coverage:update`).
- Real Europe PMC smoke test via `pnpm smoke`.

## 0.1.0-alpha.11 — 2026-10-18

- Four dsh tools: `biorxiv_search`, `biorxiv_paper`, `biorxiv_latest`, `biorxiv_export`.
- Stable envelope with E-001–E-010; success uses an empty error object for lossless JSON.
- Europe PMC search, bioRxiv details/latest, Crossref/OpenAlex status enrichment.
- Memory/JSON/SQLite cache; hashed cache keys; cache failures do not discard results.
- Safe export: JSON/Markdown/CSV/BibTeX; path confined to cwd; no overwrite by default.
- 112 tests; 100% line coverage baseline.

## 0.1.0-alpha.0 — 2026-10-18

- Initial scaffold, error registry, query builder, ranking, status and exporters.
