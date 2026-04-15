#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import io
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import requests

from college_donation_chart import (
    EXCLUDE_TERMS,
    MATCH_ALIASES,
    OFFICIAL_QUERY,
    VALID_COMMITTEE_TYPES,
    VALID_PARTIES,
    build_chart,
    build_institution_rules,
    contains_normalized_phrase,
    load_fec_master_data,
    normalize_text,
    parse_rankings,
)


DATA_DIR = Path(__file__).resolve().parents[1] / "Data"
COLLEGE_FILTER_RE = re.compile(
    r"\b(UNIVERSITY|COLLEGE|INSTITUTE|ACADEMY|SCHOOL|POLYTECHNIC|TECHNOLOGICAL|SEMINARY)\b"
)
PIPE_COLUMNS = 21
NAME_INDEX = 7
CITY_INDEX = 8
STATE_INDEX = 9
ZIP_INDEX = 10
EMPLOYER_INDEX = 11
AMOUNT_INDEX = 14
COMMITTEE_ID_INDEX = 0

QUICK_ALIAS_TERMS = tuple(
    sorted(
        {
            normalize_text(term)
            for terms in MATCH_ALIASES.values()
            for term in terms
            if term and len(normalize_text(term)) <= 18
        },
        key=len,
        reverse=True,
    )
)

PLATFORM_PARTY_BY_NAME = {
    "ACTBLUE": "DEM",
    "WINRED": "REP",
}


@dataclass(frozen=True)
class MatcherRule:
    institution: str
    rank_2025: int
    include_terms: tuple[str, ...]
    exclude_terms: tuple[str, ...]
    specificity: int


def detect_presidential_files() -> dict[int, Path]:
    files: dict[int, Path] = {}
    for year in range(2000, 2030, 4):
        suffix = str(year)[-2:]
        extracted = DATA_DIR / f"indiv{suffix}" / "itcont.txt"
        zipped = DATA_DIR / f"indiv{suffix}.zip"
        if extracted.exists():
            files[year] = extracted
        elif zipped.exists():
            files[year] = zipped
    return files


def build_matcher_rules(top_n: int) -> list[MatcherRule]:
    rankings = parse_rankings(requests.Session())
    rules = build_institution_rules(rankings, top_n)
    matcher_rules: list[MatcherRule] = []
    for rule in rules:
        include_terms = tuple(
            dict.fromkeys(
                [rule.queries[0], *MATCH_ALIASES.get(rule.label, []), OFFICIAL_QUERY[rule.label]]
            )
        )
        normalized_include = tuple(normalize_text(term) for term in include_terms if term)
        normalized_exclude = tuple(
            normalize_text(term) for term in EXCLUDE_TERMS.get(rule.label, []) if term
        )
        matcher_rules.append(
            MatcherRule(
                institution=rule.label,
                rank_2025=rule.rank_2025,
                include_terms=normalized_include,
                exclude_terms=normalized_exclude,
                specificity=max(len(term) for term in normalized_include),
            )
        )
    matcher_rules.sort(key=lambda item: item.specificity, reverse=True)
    return matcher_rules


def top_institution_lists(rules: list[MatcherRule], limits: list[int]) -> dict[int, list[str]]:
    ordered = [rule.institution for rule in sorted(rules, key=lambda item: item.rank_2025)]
    return {limit: ordered[:limit] for limit in limits}


def match_institution(employer: str, rules: list[MatcherRule]) -> tuple[str, int] | tuple[None, None]:
    normalized = normalize_text(employer)
    if not normalized:
        return None, None
    if not COLLEGE_FILTER_RE.search(normalized) and not any(
        contains_normalized_phrase(normalized, term) for term in QUICK_ALIAS_TERMS
    ):
        return None, None
    for rule in rules:
        if any(contains_normalized_phrase(normalized, term) for term in rule.include_terms) and not any(
            contains_normalized_phrase(normalized, term) for term in rule.exclude_terms
        ):
            return rule.institution, rule.rank_2025
    return None, None


def iter_zip_lines(zip_path: Path):
    with zipfile.ZipFile(zip_path) as zf:
        target = None
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            if name == "itcont.txt":
                target = name
                break
        if target is None:
            raise RuntimeError(f"Could not find itcont.txt in {zip_path}")
        with zf.open(target) as raw:
            yield from io.TextIOWrapper(raw, encoding="latin-1", newline="")


def iter_text_lines(text_path: Path):
    with text_path.open("r", encoding="latin-1", newline="") as handle:
        yield from handle


def iter_source_lines(path: Path):
    if path.suffix == ".zip":
        yield from iter_zip_lines(path)
    else:
        yield from iter_text_lines(path)


def build_committee_lookup(cache_dir: Path) -> dict[str, tuple[str, str]]:
    session = requests.Session()
    committee_df = load_fec_master_data(
        session=session,
        cache_dir=cache_dir,
        pause_seconds=0.05,
        force_refresh=False,
    )
    committee_df["platform_party"] = committee_df["committee_name"].map(PLATFORM_PARTY_BY_NAME)
    standard_mask = committee_df["resolved_party"].isin(VALID_PARTIES) & committee_df[
        "committee_type"
    ].isin(VALID_COMMITTEE_TYPES)
    platform_mask = committee_df["platform_party"].isin(VALID_PARTIES) & committee_df[
        "committee_type"
    ].eq("V")
    committee_df = committee_df[standard_mask | platform_mask].copy()
    committee_df["resolved_party"] = committee_df["resolved_party"].where(
        committee_df["resolved_party"].isin(VALID_PARTIES),
        committee_df["platform_party"],
    )
    return {
        row.committee_id: (row.resolved_party, row.committee_type)
        for row in committee_df.itertuples(index=False)
    }


def safe_amount(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def donor_token(parts: list[str]) -> bytes:
    name = normalize_text(parts[NAME_INDEX])
    city = normalize_text(parts[CITY_INDEX])
    state = normalize_text(parts[STATE_INDEX])
    zip5 = re.sub(r"[^0-9]", "", parts[ZIP_INDEX])[:5]
    token_source = "|".join([name, city, state, zip5])
    return hashlib.blake2b(token_source.encode("utf-8"), digest_size=8).digest()


def process_files(
    files: dict[int, Path],
    matcher_rules: list[MatcherRule],
    committee_lookup: dict[str, tuple[str, str]],
    institution_limits: dict[int, set[str]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    overall_totals = defaultdict(float)
    institution_totals = defaultdict(float)
    donor_sets: dict[tuple[int, int, str], set[bytes]] = defaultdict(set)

    for year, path in sorted(files.items()):
        print(f"Processing {year}: {path.name}")
        processed = 0
        matched = 0
        for line in iter_source_lines(path):
            processed += 1
            if processed % 2_000_000 == 0:
                print(f"  {year}: scanned {processed:,} rows, matched {matched:,}")

            parts = line.rstrip("\n").split("|")
            if len(parts) < PIPE_COLUMNS:
                continue

            committee_id = parts[COMMITTEE_ID_INDEX]
            party_info = committee_lookup.get(committee_id)
            if not party_info:
                continue

            employer = parts[EMPLOYER_INDEX].strip()
            if not employer:
                continue

            institution, rank = match_institution(employer, matcher_rules)
            if not institution:
                continue

            amount = safe_amount(parts[AMOUNT_INDEX])
            if amount is None:
                continue

            matched += 1
            party, committee_type = party_info
            overall_totals[(year, party)] += amount
            institution_totals[(institution, rank, year, party, committee_type)] += amount
            token = donor_token(parts)
            for limit, institutions in institution_limits.items():
                if institution in institutions:
                    donor_sets[(limit, year, party)].add(token)

        print(f"  {year}: finished {processed:,} rows, matched {matched:,}")

    overall_df = pd.DataFrame(
        [
            {"cycle": year, "party": party, "total": total}
            for (year, party), total in sorted(overall_totals.items())
        ]
    )
    institution_df = pd.DataFrame(
        [
            {
                "institution": institution,
                "rank_2025": rank,
                "cycle": year,
                "party": party,
                "committee_type": committee_type,
                "total": total,
            }
            for (institution, rank, year, party, committee_type), total in sorted(
                institution_totals.items()
            )
        ]
    )
    donor_df = pd.DataFrame(
        [
            {
                "school_set": f"top_{limit}",
                "school_count": limit,
                "cycle": year,
                "party": party,
                "donor_count": len(tokens),
            }
            for (limit, year, party), tokens in sorted(donor_sets.items())
        ]
    )
    return overall_df, institution_df, donor_df


def build_line_chart(summary: pd.DataFrame, title: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pivot = (
        summary.pivot(index="cycle", columns="party", values="total")
        .fillna(0)
        .sort_index()
    )
    plt.style.use("seaborn-v0_8-whitegrid")
    fig, ax = plt.subplots(figsize=(12, 7))
    for party, color in [("DEM", "#2563eb"), ("REP", "#dc2626")]:
        if party in pivot.columns:
            ax.plot(
                pivot.index,
                pivot[party],
                marker="o",
                linewidth=2.5,
                color=color,
                label=party,
            )
    ax.set_title(title, fontsize=16, loc="left")
    ax.set_xlabel("Presidential Election Cycle")
    ax.set_ylabel("Total Direct Contributions")
    ax.legend(frameon=False)
    ax.yaxis.set_major_formatter(
        plt.matplotlib.ticker.FuncFormatter(
            lambda value, _: f"${value/1_000_000:.1f}M" if abs(value) >= 1_000_000 else f"${value:,.0f}"
        )
    )
    fig.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def run(args: argparse.Namespace) -> None:
    base_dir = Path(__file__).resolve().parents[1]
    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else base_dir / "outputs" / "local_presidential_run"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    files = detect_presidential_files()
    if args.cycles:
        files = {year: path for year, path in files.items() if year in set(args.cycles)}
    if not files:
        raise RuntimeError("No presidential-year indiv zip files found")

    matcher_rules = build_matcher_rules(args.top_n)
    institution_limits = {
        limit: set(institutions)
        for limit, institutions in top_institution_lists(matcher_rules, [10, 25, args.top_n]).items()
    }
    committee_lookup = build_committee_lookup(base_dir / ".cache" / "college_donation_chart" / "master")
    overall_df, institution_df, donor_df = process_files(
        files, matcher_rules, committee_lookup, institution_limits
    )

    if overall_df.empty:
        raise RuntimeError("No matched donations were found")

    overall_df = overall_df.sort_values(["cycle", "party"]).reset_index(drop=True)
    institution_df = institution_df.sort_values(
        ["institution", "cycle", "party", "committee_type"]
    ).reset_index(drop=True)

    ordered_rules = sorted(matcher_rules, key=lambda rule: rule.rank_2025)
    source_df = pd.DataFrame(
        {
            "institution": [rule.institution for rule in ordered_rules],
            "rank_2025": [rule.rank_2025 for rule in ordered_rules],
        }
    ).drop_duplicates()
    source_df.to_csv(output_dir / "top_schools_2025_source_list.csv", index=False)
    overall_df.to_csv(output_dir / "presidential_cycles_donations_by_cycle_party.csv", index=False)
    institution_df.to_csv(
        output_dir / "presidential_cycles_donations_by_institution_cycle_party.csv",
        index=False,
    )
    build_chart(overall_df, output_dir / "presidential_cycles_donations_by_cycle_party.png")
    build_line_chart(
        overall_df,
        f"Top {args.top_n} Schools: Donations Over Time by Party",
        output_dir / f"top_{args.top_n}_line_chart.png",
    )

    institution_party_df = (
        institution_df.groupby(["institution", "rank_2025", "party"], as_index=False)["total"]
        .sum()
        .sort_values(["party", "total"], ascending=[True, False])
    )
    institution_party_df.to_csv(
        output_dir / "presidential_cycles_donations_by_institution_party.csv",
        index=False,
    )
    donor_df = donor_df.sort_values(["school_count", "cycle", "party"]).reset_index(drop=True)
    donor_df.to_csv(output_dir / "donor_counts_by_school_set_cycle_party.csv", index=False)

    for limit, institutions in institution_limits.items():
        subset = institution_df[institution_df["institution"].isin(institutions)].copy()
        subset_summary = (
            subset.groupby(["cycle", "party"], as_index=False)["total"]
            .sum()
            .sort_values(["cycle", "party"])
        )
        subset_summary.to_csv(output_dir / f"top_{limit}_line_summary.csv", index=False)
        donor_subset = donor_df[donor_df["school_count"] == limit].copy()
        donor_subset.to_csv(output_dir / f"top_{limit}_donor_counts.csv", index=False)
        build_line_chart(
            subset_summary,
            f"Top {limit} Ranked Schools: Donations Over Time by Party",
            output_dir / f"top_{limit}_line_chart.png",
        )

    print()
    print("Wrote:")
    print(output_dir / "presidential_cycles_donations_by_cycle_party.csv")
    print(output_dir / "presidential_cycles_donations_by_cycle_party.png")
    print(output_dir / "presidential_cycles_donations_by_institution_cycle_party.csv")
    print(output_dir / "presidential_cycles_donations_by_institution_party.csv")
    print(output_dir / "donor_counts_by_school_set_cycle_party.csv")
    print(output_dir / "top_schools_2025_source_list.csv")
    for limit in [10, 25, args.top_n]:
        print(output_dir / f"top_{limit}_line_summary.csv")
        print(output_dir / f"top_{limit}_line_chart.png")
        print(output_dir / f"top_{limit}_donor_counts.csv")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top-n", type=int, default=150)
    parser.add_argument("--output-dir")
    parser.add_argument("--cycles", nargs="*", type=int)
    return parser


if __name__ == "__main__":
    run(build_parser().parse_args())
