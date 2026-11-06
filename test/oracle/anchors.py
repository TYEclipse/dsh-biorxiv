#!/usr/bin/env python3
"""Independent anchors for dsh-biorxiv: every number the tests assert.

Section A — the values the pre-trend suites pinned (exit codes, retry counts,
relevance scores, version counting, cache round-trips).
Section B — the month-window maths of biorxiv_trend: calendar spans, per-week
normalisation, totals, peak selection and the percent rule.

`--check` re-derives the anchors from definitions (calendar module, scoring
formula) instead of restating them, so a wrong constant on either side fails.
"""

from __future__ import annotations

import argparse
import calendar
import sys
from datetime import date, datetime, timedelta, timezone

# ---------------------------------------------------------------- section A


def relevance_score(title: str, abstract: str, terms: list[str]) -> int:
    """3*title hit + 2*early abstract hit + min(term occurrences, 3)."""
    if not terms:
        return 0
    lowered = [term.lower() for term in terms if term]
    if not lowered:
        return 0
    title_hit = 1 if any(term in title.lower() for term in lowered) else 0
    positions = [abstract.lower().find(term) for term in lowered]
    positions = [pos for pos in positions if pos >= 0]
    early = 1 if positions and min(positions) <= 300 else 0
    count = sum(abstract.lower().count(term) for term in lowered)
    return 3 * title_hit + 2 * early + min(count, 3)


def attempts_for(retries: int) -> int:
    """One initial attempt plus `retries` retries."""
    return retries + 1


def section_a() -> list[tuple[str, float | int]]:
    term = ["protein language model"]
    return [
        # test/adapters/cache.test.ts
        ("cache: round-trip of the stored number 2", 2),
        ("cache: round-trip of the stored number 1", 1),
        ("cache: json file mode 0o600 = 384", 0o600),
        # test/adapters/europepmc.test.ts
        ("europepmc: hitCount echoed from the payload", 2),
        ("europepmc: cited from the string \"7\"", 7),
        # test/adapters/http.test.ts
        ("http: retries=2 on a persistent 429 → attempts", attempts_for(2)),
        ("http: one transient 500 then ok → attempts", 2),
        ("http: one thrown HttpError then ok → attempts", 2),
        ("http: one thrown TypeError then ok → attempts", 2),
        # test/apps/cli.test.ts — exit codes by contract
        ("cli: --help exit", 0),
        ("cli: search success exit", 0),
        ("cli: missing topic exit (tool error)", 1),
        ("cli: latest success exit", 0),
        ("cli: digest success exit", 0),
        ("cli: bad DOI exit (tool error)", 1),
        ("cli: export success exit", 0),
        ("cli: unknown command exit (usage error)", 2),
        # test/apps/mcp.test.ts — JSON-RPC 2.0 codes
        ("mcp: method not found", -32601),
        ("mcp: invalid params (missing name)", -32602),
        ("mcp: invalid params (unknown tool)", -32602),
        # test/core/digest.test.ts
        ("digest: one item in the fixture", 1),
        ("digest: empty result set", 0),
        # test/core/export.test.ts
        ("export: empty workbook row count", 0),
        # test/core/files.test.ts
        ("files: rejected write leaves 0 files", 0),
        # test/core/query.test.ts
        ("query: default limit", 20),
        ("query: explicit limit", 5),
        # test/core/rank.test.ts
        ("rank: title hit", relevance_score("protein language model", "", term)),
        ("rank: early abstract hit", relevance_score("other", "protein language model appears early", term)),
        ("rank: early hit + capped term frequency", relevance_score("other", "protein language model " * 10, term)),
        ("rank: late-only mention", relevance_score("other", "x" * 400 + "protein language model", term)),
        ("rank: case-insensitive title hit", relevance_score("PROTEIN LANGUAGE MODEL", "", term)),
        ("rank: no terms", relevance_score("protein language model", "", [])),
        ("rank: dedupe keeps the title-hit copy", relevance_score("protein language model", "", term)),
        ("rank: dedupe keeps the higher score", 5),
        # test/core/service.test.ts
        ("service: export json count for one paper", 1),
        ("service: export bibtex count for one DOI", 1),
        # test/core/status.test.ts
        ("status: three versions in the fixture", 3),
        ("status: malformed version falls back to 1", 1),
        # trend via CLI/tool surface (each fixture search answers hitCount=1)
        ("cli: trend over 2 months has months+1 buckets", 2 + 1),
        ("cli: trend total for two completed hit-1 months", 1 + 1),
    ]


# ---------------------------------------------------------------- section B

MONTH_NOTE_KEYS = ("complete=false", "perWeek", "percent is null")


def month_spans(now: datetime, months: int) -> list[dict]:
    """Completed calendar months plus the running one, using UTC dates."""
    spans: list[dict] = []
    year, month = now.year, now.month
    for offset in range(months, 0, -1):
        index = month - offset
        while index < 1:
            index += 12
            year -= 1
        start = date(year, index, 1)
        days = calendar.monthrange(year, index)[1]
        spans.append(
            {
                "label": f"{year}-{index:02d}",
                "dateFrom": start.isoformat(),
                "dateTo": date(year, index, days).isoformat(),
                "days": days,
                "complete": True,
            }
        )
        year = now.year
    elapsed = now.day
    spans.append(
        {
            "label": f"{now.year}-{now.month:02d}",
            "dateFrom": date(now.year, now.month, 1).isoformat(),
            "dateTo": date(now.year, now.month, elapsed).isoformat(),
            "days": elapsed,
            "complete": False,
        }
    )
    return spans


def per_week(count: int, days: int) -> float:
    if days <= 0:
        return 0.0
    value = round((count * 7) / days, 2)
    return 0.0 if value == 0 else value


def summarise(counts: list[int], spans: list[dict]) -> dict:
    buckets = []
    for span, count in zip(spans, counts):
        buckets.append({**span, "count": count, "perWeek": per_week(count, span["days"])})
    completed = [bucket for bucket in buckets if bucket["complete"]]
    total = sum(bucket["count"] for bucket in completed)
    peak = {"label": "", "count": -1}
    for bucket in completed:
        if bucket["count"] > peak["count"]:
            peak = {"label": bucket["label"], "count": bucket["count"]}
    mom = None
    overall = None
    if len(completed) >= 2:
        mom = change(completed[-2], completed[-1])
        overall = change(completed[0], completed[-1])
    return {"buckets": buckets, "total": total, "peak": peak, "monthOverMonth": mom, "overall": overall}


def change(before: dict, after: dict) -> dict:
    absolute = after["count"] - before["count"]
    percent = None if before["count"] == 0 else round(absolute / before["count"] * 100, 1)
    return {
        "fromLabel": before["label"],
        "toLabel": after["label"],
        "fromCount": before["count"],
        "toCount": after["count"],
        "absolute": absolute,
        "percent": percent,
    }


NOW = datetime(2026, 11, 7, 5, 45, tzinfo=timezone.utc)
SIX_MONTH_COUNTS = [10, 12, 9, 0, 5, 15, 4]
TWO_MONTH_COUNTS = [0, 5, 3]


def section_b() -> list[tuple[str, object]]:
    six = summarise(SIX_MONTH_COUNTS, month_spans(NOW, 6))
    two = summarise(TWO_MONTH_COUNTS, month_spans(NOW, 2))
    leap = month_spans(datetime(2024, 3, 10, tzinfo=timezone.utc), 1)
    anchors: list[tuple[str, object]] = []
    for bucket in six["buckets"]:
        anchors.append((f"trend: {bucket['label']} span", f"{bucket['dateFrom']}..{bucket['dateTo']} days={bucket['days']} complete={bucket['complete']}"))
        anchors.append((f"trend: {bucket['label']} perWeek for count {bucket['count']}", bucket["perWeek"]))
    anchors.append(("trend: total of completed months", six["total"]))
    anchors.append(("trend: peak label", six["peak"]["label"]))
    anchors.append(("trend: peak count", six["peak"]["count"]))
    anchors.append(("trend: monthOverMonth percent", six["monthOverMonth"]["percent"]))
    anchors.append(("trend: monthOverMonth absolute", six["monthOverMonth"]["absolute"]))
    anchors.append(("trend: overall percent", six["overall"]["percent"]))
    anchors.append(("trend: zero baseline percent is null", "null" if two["monthOverMonth"]["percent"] is None else "not-null"))
    anchors.append(("trend: zero baseline absolute", two["monthOverMonth"]["absolute"]))
    anchors.append(("trend: february 2024 days", leap[0]["days"]))
    anchors.append(("trend: february 2024 span", f"{leap[0]['dateFrom']}..{leap[0]['dateTo']}"))
    return anchors


# ---------------------------------------------------------------- self-check


def self_check() -> list[str]:
    failures: list[str] = []
    spans = month_spans(NOW, 6)
    if [span["label"] for span in spans] != ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]:
        failures.append(f"labels: {[span['label'] for span in spans]}")
    for span in spans[:-1]:
        first = date.fromisoformat(span["dateFrom"])
        last = date.fromisoformat(span["dateTo"])
        if first.day != 1:
            failures.append(f"{span['label']} does not start on the 1st")
        if calendar.monthrange(first.year, first.month)[1] != span["days"]:
            failures.append(f"{span['label']} days disagree with the calendar")
        if (last - first).days + 1 != span["days"]:
            failures.append(f"{span['label']} span length != days")
        if last.day != span["days"]:
            failures.append(f"{span['label']} does not end on the last day")
    partial = spans[-1]
    if partial["complete"]:
        failures.append("the running month must be incomplete")
    if partial["days"] != NOW.day:
        failures.append("the running month must stop at today")
    # leap year
    leap = month_spans(datetime(2024, 3, 10, tzinfo=timezone.utc), 1)[0]
    if leap["days"] != 29 or leap["dateTo"] != "2024-02-29":
        failures.append(f"2024-02 must have 29 days, got {leap['days']} {leap['dateTo']}")
    # per-week normalisation: a full week of hits is exactly the count
    if per_week(7, 7) != 7 or per_week(0, 31) != 0:
        failures.append("perWeek normalisation is wrong")
    if per_week(10, 31) != round(70 / 31, 2):
        failures.append("perWeek rounding is wrong")
    # totals and peak
    result = summarise(SIX_MONTH_COUNTS, spans)
    if result["total"] != sum(SIX_MONTH_COUNTS[:-1]):
        failures.append("total must exclude the running month")
    if result["peak"] != {"label": "2026-10", "count": 15}:
        failures.append(f"peak mismatch: {result['peak']}")
    # a tie keeps the earliest month
    tie = summarise([5, 5, 0], month_spans(NOW, 2))
    if tie["peak"]["label"] != "2026-09":
        failures.append(f"tie must keep the earliest month, got {tie['peak']['label']}")
    # percent rules
    if result["monthOverMonth"]["percent"] != 200.0:
        failures.append(f"monthOverMonth: {result['monthOverMonth']}")
    if result["overall"]["percent"] != 50.0:
        failures.append(f"overall: {result['overall']}")
    zero = summarise(TWO_MONTH_COUNTS, month_spans(NOW, 2))
    if zero["monthOverMonth"]["percent"] is not None:
        failures.append("zero baseline must give a null percent")
    if zero["monthOverMonth"]["absolute"] != 5:
        failures.append("zero baseline absolute must still be reported")
    # one completed month is not enough for a change
    single = summarise([7, 2], month_spans(NOW, 1))
    if single["monthOverMonth"] is not None or single["overall"] is not None:
        failures.append("one completed month must give null changes")
    # scoring formula against hand cases (definitions, not the implementation)
    if relevance_score("protein", "", ["protein"]) != 3:
        failures.append("title hit must score 3")
    if relevance_score("other", "protein protein protein protein", ["protein"]) != 2 + 3:
        failures.append("repeated early hits must cap at 3")
    if relevance_score("other", "x" * 400 + "protein", ["protein"]) != 1:
        failures.append("late-only mention must score 1")
    if relevance_score("other", "", []) != 0:
        failures.append("no terms must score 0")
    if attempts_for(2) != 3:
        failures.append("retries=2 must mean 3 attempts")
    return failures


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="dsh-biorxiv anchors")
    parser.add_argument("--check", action="store_true", help="re-derive anchors and fail on inconsistency")
    args = parser.parse_args(argv)

    if args.check:
        failures = self_check()
        if failures:
            for failure in failures:
                print(f"FAIL {failure}")
            print(f"{len(failures)} self-check failure(s)")
            return 1
        print("all self-checks passed")
        return 0

    for name, value in section_a():
        print(f"A| {name}: {value}")
    print("---")
    for name, value in section_b():
        print(f"B| {name}: {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
