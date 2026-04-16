#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUMMARY = ROOT / "outputs" / "4.15.nasem_fec_summary.csv"
SOURCE_DONATIONS = ROOT / "outputs" / "4.15.nasem_fec_donations_high_confidence.csv"
COMMITTEE_LOOKUP = ROOT / "outputs" / "committee_lookup.json"
MEMBER_DIRECTORY = ROOT / "nasem_living_members_nas_nae_nam_2026-04-14.csv"
OUT_DIR = ROOT / "public" / "data"
OUT_SUMMARY = OUT_DIR / "nasem_fec_summary.csv"
OUT_DONATIONS = OUT_DIR / "nasem_fec_donations.csv"

SUMMARY_FIELDS = [
    "name",
    "clean_name",
    "academy",
    "organization",
    "state",
    "has_fec_donations",
    "total_donations",
    "high_confidence_donations",
    "total_amount",
    "high_confidence_amount",
    "profile_url",
    "fec_search_link",
]

DONATION_FIELDS = [
    "nasem_name",
    "academy",
    "nasem_organization",
    "match_confidence",
    "contributor_name",
    "contributor_employer",
    "committee_name",
    "committee_id",
    "party",
    "earmark_committee_id",
    "contribution_receipt_amount",
    "contribution_receipt_date",
    "two_year_transaction_period",
    "contributor_state",
    "fec_link",
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"true", "1", "yes", "y"}


def parse_float(value: str | int | float | None) -> float:
    try:
        return float(str(value or "").replace(",", "").strip())
    except ValueError:
        return 0.0


def parse_cycle(value: str | int | float | None) -> str:
    text = str(value or "").strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    return digits[:4] if len(digits) >= 4 else ""


def format_money(value: float) -> str:
    return f"{value:.2f}"


def normalize_confidence(value: str | None) -> str:
    confidence = str(value or "").strip().lower()
    return "high" if confidence == "high" else "medium"


def make_fec_search_link(name: str) -> str:
    if not name:
        return ""
    return (
        "https://www.fec.gov/data/receipts/individual-contributions/"
        f"?contributor_name={quote_plus(name)}&min_amount=200"
    )


def load_member_directory() -> dict[str, dict[str, str]]:
    rows = read_csv(MEMBER_DIRECTORY)
    return {
        row.get("name", "").strip(): {
            "academy": row.get("academy", "").strip(),
            "organization": row.get("organization", "").strip(),
            "state": row.get("state", "").strip(),
            "profile_url": row.get("profile_url", "").strip(),
        }
        for row in rows
        if row.get("name", "").strip()
    }


def normalize_summary_rows(
    rows: list[dict[str, str]], members: dict[str, dict[str, str]]
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for row in rows:
        name = (row.get("name") or row.get("nasem_name") or "").strip()
        if not name:
            continue

        member = members.get(name, {})
        high_conf_donations = int(
            parse_float(
                row.get("high_confidence_donations") or row.get("high_conf_records")
            )
        )
        high_conf_amount = parse_float(
            row.get("high_confidence_amount") or row.get("high_conf_amount")
        )

        # Use high-confidence figures for both total and high-conf columns so
        # the dashboard never displays inflated low/medium-confidence totals.
        normalized.append(
            {
                "name": name,
                "clean_name": (row.get("clean_name") or "").strip(),
                "academy": (row.get("academy") or member.get("academy") or "").strip(),
                "organization": (
                    row.get("organization") or member.get("organization") or ""
                ).strip(),
                "state": (row.get("state") or member.get("state") or "").strip(),
                "has_fec_donations": str(high_conf_donations > 0),
                "total_donations": str(high_conf_donations),
                "high_confidence_donations": str(high_conf_donations),
                "total_amount": format_money(high_conf_amount),
                "high_confidence_amount": format_money(high_conf_amount),
                "profile_url": (
                    row.get("profile_url") or member.get("profile_url") or ""
                ).strip(),
                "fec_search_link": (
                    row.get("fec_search_link")
                    or make_fec_search_link(row.get("clean_name") or name)
                ).strip(),
            }
        )

    return normalized


def load_committee_lookup() -> dict[str, dict[str, str]]:
    """Load the committee lookup JSON (party, name enrichment)."""
    if COMMITTEE_LOOKUP.exists():
        with open(COMMITTEE_LOOKUP, encoding="utf-8") as f:
            return json.load(f)
    return {}


# Standard party code normalization
PARTY_LABELS = {
    "DEM": "DEM",
    "REP": "REP",
    "IND": "IND",
    "LIB": "LIB",
    "GRE": "GRE",
    "DFL": "DEM",  # Minnesota Democratic-Farmer-Labor
    "OTH": "OTH",
}


def normalize_party(party: str) -> str:
    """Normalize party codes to standard labels."""
    p = party.strip().upper()
    return PARTY_LABELS.get(p, p if p else "")


_EARMARK_RE = re.compile(r"\(C(\d{8})\)")


def extract_earmark_committee_id(memo: str) -> str:
    """Extract the target committee ID from an earmark memo field."""
    m = _EARMARK_RE.search(memo)
    return f"C{m.group(1)}" if m else ""


def normalize_donation_rows(
    rows: list[dict[str, str]],
    committee_lookup: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for row in rows:
        contributor_name = (row.get("contributor_name") or row.get("fec_name") or "").strip()
        nasem_name = (row.get("nasem_name") or "").strip()
        if not nasem_name or not contributor_name:
            continue

        committee_id = (row.get("committee_id") or "").strip()
        cmte_info = committee_lookup.get(committee_id, {})

        # Extract earmark target from memo (e.g. "EARMARKED FOR BIDEN (C00703975)")
        memo = (row.get("memo") or "").strip()
        earmark_cid = extract_earmark_committee_id(memo)

        # Use lookup to fill missing committee_name and party
        committee_name = (row.get("committee_name") or "").strip()
        if not committee_name:
            committee_name = cmte_info.get("name", "")

        party = (row.get("party") or "").strip()
        if not party:
            party = cmte_info.get("party", "")
        # If party still missing and we have an earmark target, use its party
        if not party and earmark_cid:
            earmark_info = committee_lookup.get(earmark_cid, {})
            party = earmark_info.get("party", "")
        party = normalize_party(party)

        transaction_id = (row.get("transaction_id") or "").strip()

        normalized.append(
            {
                "nasem_name": nasem_name,
                "academy": (row.get("academy") or "").strip(),
                "nasem_organization": (
                    row.get("nasem_organization") or row.get("nasem_org") or ""
                ).strip(),
                "match_confidence": normalize_confidence(row.get("match_confidence")),
                "contributor_name": contributor_name,
                "contributor_employer": (
                    row.get("contributor_employer") or row.get("fec_employer") or ""
                ).strip(),
                "committee_name": committee_name,
                "committee_id": committee_id,
                "party": party,
                "earmark_committee_id": earmark_cid,
                "contribution_receipt_amount": format_money(
                    parse_float(
                        row.get("contribution_receipt_amount") or row.get("amount")
                    )
                ),
                "contribution_receipt_date": (
                    row.get("contribution_receipt_date") or row.get("date") or ""
                ).strip(),
                "two_year_transaction_period": parse_cycle(
                    row.get("two_year_transaction_period") or row.get("cycle")
                ),
                "contributor_state": (
                    row.get("contributor_state") or row.get("fec_state") or ""
                ).strip(),
                "fec_link": (
                    row.get("fec_link") or make_fec_search_link(contributor_name)
                ).strip(),
                "_transaction_id": transaction_id,
            }
        )

    # Deduplicate by FEC transaction_id when available, falling back to a
    # composite key.  Multi-academy members (e.g. D.E. Shaw in NAS+NAE) and
    # duplicate search variants produce duplicate rows for the same real-world
    # contribution.  Keep one row per transaction, merging academies.
    seen: dict[str | tuple, int] = {}
    deduped: list[dict[str, str]] = []
    dupes_removed = 0
    for row in normalized:
        tid = row.get("_transaction_id", "")
        if tid:
            key: str | tuple = tid
        else:
            key = (
                row["contributor_name"],
                row["committee_id"],
                row["contribution_receipt_date"],
                row["contribution_receipt_amount"],
            )
        if key in seen:
            dupes_removed += 1
            existing = deduped[seen[key]]
            if row["academy"] and row["academy"] not in existing["academy"]:
                existing["academy"] = ",".join(
                    sorted(set(existing["academy"].split(",") + [row["academy"]]))
                )
            if row["match_confidence"] == "high" and existing["match_confidence"] != "high":
                existing["match_confidence"] = "high"
        else:
            seen[key] = len(deduped)
            deduped.append(row)

    # Strip internal-only field before output
    for row in deduped:
        row.pop("_transaction_id", None)

    if dupes_removed:
        print(f"  Deduplicated: removed {dupes_removed:,} duplicate transaction rows")

    deduped.sort(
        key=lambda item: (
            item["two_year_transaction_period"],
            item["contribution_receipt_date"],
            item["nasem_name"],
        )
    )
    return deduped


def main() -> None:
    if not SOURCE_SUMMARY.exists():
        raise FileNotFoundError(f"Missing summary CSV: {SOURCE_SUMMARY}")
    if not SOURCE_DONATIONS.exists():
        raise FileNotFoundError(f"Missing donations CSV: {SOURCE_DONATIONS}")

    members = load_member_directory()
    committee_lookup = load_committee_lookup()
    summary_rows = normalize_summary_rows(read_csv(SOURCE_SUMMARY), members)
    donation_rows = normalize_donation_rows(read_csv(SOURCE_DONATIONS), committee_lookup)

    write_csv(OUT_SUMMARY, SUMMARY_FIELDS, summary_rows)
    write_csv(OUT_DONATIONS, DONATION_FIELDS, donation_rows)

    # Stats
    party_count = sum(1 for r in donation_rows if r.get("party"))
    print(f"Wrote {len(summary_rows):,} summary rows to {OUT_SUMMARY}")
    print(f"Wrote {len(donation_rows):,} donation rows to {OUT_DONATIONS}")
    print(f"  Party coverage: {party_count}/{len(donation_rows)} ({party_count/len(donation_rows)*100:.1f}%)")


if __name__ == "__main__":
    main()
