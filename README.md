# dsh-biorxiv

bioRxiv preprint search, version/publication status and export tools for DeepSeek Harness (dsh). Zero runtime dependencies.

> Status: `0.1.0-alpha` — functional core, not a 1.0 release. Relevance evaluation is provisional; do not treat it as peer-reviewed evidence.

## Tools

- `biorxiv_search` — search bioRxiv preprints by topic, optional date window and field. Default `minScore=3` filters low-confidence text matches; set `minScore=0` for higher recall.
- `biorxiv_paper` — DOI lookup: latest version, publication DOI/journal, retraction flag when available.
- `biorxiv_latest` — latest preprints by date window and optional category.
- `biorxiv_export` — export search results or one DOI as JSON, Markdown, CSV or BibTeX.
- `biorxiv_digest` — structured markdown digest (extractive by default; optional opt-in Chinese summaries; no automatic delivery).

All tools return a stable envelope:

```json
{
  "ok": true,
  "data": {},
  "error": { "code": "", "message": "", "retryable": false, "hint": "" },
  "meta": { "requestId": "...", "elapsedMs": 12, "cached": false, "source": ["europepmc"], "warnings": [] }
}
```

On failure `ok` is `false`, `data` is `{}`, and `error.code` is one of `E-001`–`E-010`.

## Install (one command)

Build a tarball from this repository:

```bash
pnpm install
pnpm build
pnpm pack
```

Install into a dsh profile:

```bash
dsh plugin --profile headless add file:/absolute/path/to/dsh-biorxiv-0.1.0-alpha.19.tgz
```

Verify:

```bash
dsh plugin --profile headless list
dsh --profile headless "Use biorxiv_search to search for 'protein language model' and report the first title and DOI."
```

`dsh plugin add` is a pnpm forwarder: a `--profile` is required, and `pnpm` must be on `PATH`.

## CLI

```bash
dsh-biorxiv search "protein language model" --limit 5
dsh-biorxiv paper 10.64898/2026.07.21.739963
dsh-biorxiv latest --days 2 --limit 10
dsh-biorxiv export "hippocampal ripple" --format markdown --out refs.md
dsh-biorxiv digest "protein language model" --limit 5
```

Each command prints one JSON envelope and exits `0` on success, `1` on a tool error, `2` on a usage error.

## MCP

Run the stdio server:

```bash
dsh-biorxiv-mcp
```

MCP client config example:

```json
{
  "mcpServers": {
    "biorxiv": {
      "command": "npx",
      "args": ["-y", "--package", "dsh-biorxiv", "dsh-biorxiv-mcp"]
    }
  }
}
```

The server exposes `biorxiv_search`, `biorxiv_paper`, `biorxiv_latest` and `biorxiv_export` with the same JSON envelope.

## Configuration

Defaults live in the plugin schema; no config is required.

```json
{
  "cachePath": "~/.cache/dsh-biorxiv/cache.db",
  "cacheMode": "auto",
  "timeoutMs": 10000,
  "retries": 2,
  "maxBytes": 2000000,
  "userAgent": "dsh-biorxiv/0.1 (DeepSeek Harness plugin)",
  "summaryEnabled": false,
  "summaryModel": "deepseek-chat",
  "summaryBaseUrl": "https://api.deepseek.com",
  "summaryApiKeyEnv": "DEEPSEEK_API_KEY"
}
```

- `summaryEnabled`: default `false`. When true, `digest --summary` sends only public title/abstract to the configured model and labels output as machine-generated.
- The API key is read from the named environment variable; it is never written to config, cache or logs.
- CLI: `dsh-biorxiv digest "topic" --summary` opts in; it also enables the provider for that process.
- MCP: set `DSH_BIORXIV_SUMMARY=1` in the server environment, then call `biorxiv_digest` with `summary: true`.

- `cacheMode`: `auto` (SQLite when available, JSON fallback), `sqlite`, or `json`.
- Cache keys are SHA-256 hashes; query text is not written into the cache key.
- Delete the cache file to reset; it is disposable.

## Data sources and boundaries

- Search: Europe PMC REST (`SRC:PPR` + `PUBLISHER:"bioRxiv"`).
- Latest/version details: bioRxiv public API.
- Journal/retraction enrichment: Crossref and OpenAlex; failures are non-blocking.
- No full-text PDF download, no scraping behind 403/paywalls, no writes to source sites.
- Do not use for clinical, medical or investment decisions. Preprints are not peer-reviewed.

## Development

```bash
pnpm test
pnpm coverage
```

The coverage ratchet is enforced by `scripts/coverage-ratchet.mjs`; line coverage must not fall below `.coverage-baseline.json`.

## License

MIT. See `LICENSE`.
