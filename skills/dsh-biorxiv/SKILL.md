# dsh-biorxiv skill

Use this skill when the user asks to find, check or export bioRxiv preprints.

## When to use

- Daily/weekly scan of new preprints by topic.
- Literature search for a review, grant or project.
- Check whether a preprint was published, updated or retracted.
- Export references as JSON, Markdown, CSV or BibTeX.

## Tools

### `biorxiv_search`

Arguments:
- `topic` (required): phrase; use `|` for synonyms, e.g. `CRISPR screen|CRISPR screening`.
- `dateFrom`, `dateTo`: `YYYY-MM-DD`, optional.
- `limit`: 1–100, default 20.
- `field`: `any` | `title` | `abstract`, default `any`.
- `minScore`: 0–10, default 3. Lower it to 0 if recall matters more than precision. The default is a high-precision filter; see README for the precision/recall trade-off.

Returns `data.query`, `data.hitCount`, `data.items[]` with `doi`, `title`, `authors`, `date`, `abstract`, `cited`, `score`.

### `biorxiv_paper`

Argument: `doi` (required). Returns latest `version`, `versionsCount`, `publishedDoi`, `journal`, `retracted` (`true` / `false` / `null` = unknown).

### `biorxiv_latest`

Arguments: `days` 1–30 (default 3), `limit` 1–100 (default 20), optional `category` such as `neuroscience`.

### `biorxiv_export`

Arguments: `query` or `doi`, `format` (`json` | `markdown` | `csv` | `bibtex`, default `bibtex`), optional `out` (relative path inside cwd), `force` (default false).

### `biorxiv_digest`

Arguments: `topic` (required), optional `dateFrom`, `dateTo`, `limit` 1–100, `summary` (default false). Returns `markdown` plus the same `items[]`. Without `summary`, it is extractive only. With `summary: true` and a configured provider, each item gets a machine-generated Chinese summary; verify against the abstract. No automatic delivery.

## Examples

Daily scan:

```text
biorxiv_latest { "days": 2, "limit": 15, "category": "neuroscience" }
```

Topic search:

```text
biorxiv_search { "topic": "protein language model", "dateFrom": "2026-09-01", "limit": 20 }
```

Check one paper:

```text
biorxiv_paper { "doi": "10.1101/2026.01.01.000001" }
```

Export for a group meeting:

```text
biorxiv_export { "query": "hippocampal ripple", "format": "markdown", "out": "refs.md" }
```

## Failure handling

- `E-001`: fix arguments (empty topic, bad date, limit out of range).
- `E-002`: no result; broaden the topic or date window.
- `E-003`/`E-004`/`E-005`: transient; retry later.
- `E-006`: upstream shape changed; report, do not invent results.
- `E-007`/`E-008`/`E-009`: config/cache/disk; check paths and permissions.
- `E-010`: internal/version; keep logs and report.

## Privacy

- Do not send internal notes, unpublished data or personal information to the model.
- The plugin does not store query plaintext in cache keys; logs contain metadata only.
- AI summaries are not part of `0.1.0-alpha`; do not claim they exist.
- Preprints are not peer-reviewed; never present them as clinical evidence.
