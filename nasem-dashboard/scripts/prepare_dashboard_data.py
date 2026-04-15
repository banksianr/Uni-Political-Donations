#!/usr/bin/env python3
from __future__ import annotations

import csv
from pathlib import Path
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUMMARY = ROOT / "outputs" / "nasem_fec_summary.csv"
SOURCE_DONATIONS = ROOT / "outputs" / "nasem_fec_donations.csv"
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
        total_donations = int(parse_float(row.get("total_donations") or row.get("total_records")))
        high_conf_donations = int(
            parse_float(
                row.get("high_confidence_donations") or row.get("high_conf_records")
            )
        )
        total_amount = parse_float(row.get("total_amount"))
        high_conf_amount = parse_float(
            row.get("high_confidence_amount") or row.get("high_conf_amount")
        )

        normalized.append(
            {
                "name": name,
                "clean_name": (row.get("clean_name") or "").strip(),
                "academy": (row.get("academy") or member.get("academy") or "").strip(),
                "organization": (
                    row.get("organization") or member.get("organization") or ""
                ).strip(),
                "state": (row.get("state") or member.get("state") or "").strip(),
                "has_fec_donations": str(
                    parse_bool(row.get("has_fec_donations") or row.get("has_fec_records"))
                    or total_donations > 0
                ),
                "total_donations": str(total_donations),
                "high_confidence_donations": str(high_conf_donations),
                "total_amount": format_money(total_amount),
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


def normalize_donation_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for row in rows:
        contributor_name = (row.get("contributor_name") or row.get("fec_name") or "").strip()
        nasem_name = (row.get("nasem_name") or "").strip()
        if not nasem_name or not contributor_name:
            continue

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
                "committee_name": (row.get("committee_name") or "").strip(),
                "committee_id": (row.get("committee_id") or "").strip(),
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
            }
        )

    normalized.sort(
        key=lambda item: (
            item["two_year_transaction_period"],
            item["contribution_receipt_date"],
            item["nasem_name"],
        )
    )
    return normalized


def main() -> None:
    if not SOURCE_SUMMARY.exists():
        raise FileNotFoundError(f"Missing summary CSV: {SOURCE_SUMMARY}")
    if not SOURCE_DONATIONS.exists():
        raise FileNotFoundError(f"Missing donations CSV: {SOURCE_DONATIONS}")

    members = load_member_directory()
    summary_rows = normalize_summary_rows(read_csv(SOURCE_SUMMARY), members)
    donation_rows = normalize_donation_rows(read_csv(SOURCE_DONATIONS))

    write_csv(OUT_SUMMARY, SUMMARY_FIELDS, summary_rows)
    write_csv(OUT_DONATIONS, DONATION_FIELDS, donation_rows)

    print(f"Wrote {len(summary_rows):,} summary rows to {OUT_SUMMARY}")
    print(f"Wrote {len(donation_rows):,} donation rows to {OUT_DONATIONS}")


if __name__ == "__main__":
    main()
