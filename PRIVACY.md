# Privacy

`dsh-biorxiv` works with public preprint metadata. It does not collect telemetry, analytics or user accounts.

## Data sent to third parties

- Search and status lookups go to public APIs: Europe PMC, bioRxiv, Crossref and OpenAlex.
- Requests contain the topic, DOI, date window and category you pass to the tool. Do not put confidential material into a query.
- No request is sent when the tool is not called.

## Local cache

- The cache lives under `~/.cache/dsh-biorxiv/` by default and stays on the local machine.
- Cache keys are SHA-256 hashes; query text is not stored in the key.
- Cache values contain public API responses only. The cache is disposable: delete the file or set `cacheMode` to change the backend.

## Optional AI summaries

- AI summaries are **off by default**.
- When enabled (`--summary`, `summary: true` or `DSH_BIORXIV_SUMMARY=1`), only the public title and abstract are sent to the configured chat-completions endpoint.
- The API key is read from the environment variable named by `summaryApiKeyEnv` (default `DEEPSEEK_API_KEY`); it is never written to config, cache or logs.
- Summaries are labelled as machine-generated. Verify them against the abstract before use.

## Exports

- `biorxiv_export` writes only inside the current working directory and does not overwrite an existing file unless `force` is set.

## Credentials and package contents

- The published package contains build output, public documentation and the agent skill. It contains no API keys, local paths, private project documents or user data.
- If you find a privacy issue, open an issue in the repository without including credentials or private material.
