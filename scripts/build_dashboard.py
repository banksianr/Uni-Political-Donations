#!/usr/bin/env python3

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = BASE_DIR / "outputs" / "local_presidential_with_2024_platforms"
DOCS_DIR = BASE_DIR / "docs"
DATA_DIR = DOCS_DIR / "data"


SUBSETS = {
    "top_150": {"count": 150, "label": "Top 150 Schools"},
    "top_25": {"count": 25, "label": "Top 25 Schools"},
    "top_10": {"count": 10, "label": "Top 10 Schools"},
}

DOWNLOADS = [
    {"file": "top_150_line_summary.csv", "label": "Top 150 donation totals"},
    {"file": "top_25_line_summary.csv", "label": "Top 25 donation totals"},
    {"file": "top_10_line_summary.csv", "label": "Top 10 donation totals"},
    {"file": "top_150_donor_counts.csv", "label": "Top 150 donor counts"},
    {"file": "top_25_donor_counts.csv", "label": "Top 25 donor counts"},
    {"file": "top_10_donor_counts.csv", "label": "Top 10 donor counts"},
    {
        "file": "presidential_cycles_donations_by_institution_party.csv",
        "label": "Institution totals by party",
    },
    {
        "file": "presidential_cycles_donations_by_institution_cycle_party.csv",
        "label": "Institution totals by cycle and party",
    },
    {
        "file": "donor_counts_by_school_set_cycle_party.csv",
        "label": "Combined donor counts by school set",
    },
    {"file": "top_schools_2025_source_list.csv", "label": "School source list"},
]


def load_subset_series(subset_key: str) -> dict:
    amount_df = pd.read_csv(SOURCE_DIR / f"{subset_key}_line_summary.csv")
    donor_df = pd.read_csv(SOURCE_DIR / f"{subset_key}_donor_counts.csv")
    amount_pivot = amount_df.pivot(index="cycle", columns="party", values="total").fillna(0)
    donor_pivot = donor_df.pivot(index="cycle", columns="party", values="donor_count").fillna(0)

    cycles = sorted(set(amount_pivot.index) | set(donor_pivot.index))
    series = []
    for cycle in cycles:
        amount_row = amount_pivot.loc[cycle] if cycle in amount_pivot.index else pd.Series(dtype=float)
        donor_row = donor_pivot.loc[cycle] if cycle in donor_pivot.index else pd.Series(dtype=float)
        series.append(
            {
                "cycle": int(cycle),
                "amount_dem": float(amount_row.get("DEM", 0)),
                "amount_rep": float(amount_row.get("REP", 0)),
                "donors_dem": int(donor_row.get("DEM", 0)),
                "donors_rep": int(donor_row.get("REP", 0)),
            }
        )
    return {
        "key": subset_key,
        "count": SUBSETS[subset_key]["count"],
        "label": SUBSETS[subset_key]["label"],
        "series": series,
    }


def build_payload() -> dict:
    subsets = {key: load_subset_series(key) for key in SUBSETS}

    overall_df = pd.read_csv(SOURCE_DIR / "presidential_cycles_donations_by_institution_party.csv")
    by_cycle_df = pd.read_csv(SOURCE_DIR / "presidential_cycles_donations_by_institution_cycle_party.csv")
    by_cycle_df = (
        by_cycle_df.groupby(["institution", "rank_2025", "cycle", "party"], as_index=False)["total"]
        .sum()
        .sort_values(["cycle", "party", "total"], ascending=[True, True, False])
    )
    schools_df = pd.read_csv(SOURCE_DIR / "top_schools_2025_source_list.csv")

    return {
        "title": "University Political Donations Dashboard",
        "subtitle": "Presidential cycles 2008-2024, including ActBlue and WinRed",
        "notes": [
            "School cohorts are based on the 2025 ranking source used in the analysis pipeline.",
            "Totals include direct House, Senate, presidential, party, ActBlue, and WinRed recipient committees.",
            "Unique donors are deduplicated by normalized name, city, state, and ZIP5.",
        ],
        "subsets": subsets,
        "institution_overall": overall_df.to_dict(orient="records"),
        "institution_by_cycle": by_cycle_df.to_dict(orient="records"),
        "schools": schools_df.to_dict(orient="records"),
        "downloads": DOWNLOADS,
    }


def main() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    (DATA_DIR / "dashboard-data.json").write_text(json.dumps(payload, indent=2))

    for filename in payload["downloads"]:
        shutil.copy2(SOURCE_DIR / filename["file"], DATA_DIR / filename["file"])


if __name__ == "__main__":
    main()
