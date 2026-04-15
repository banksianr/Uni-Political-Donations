#!/usr/bin/env python3

import argparse
import hashlib
import io
import json
import re
import time
import warnings
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
import pandas as pd
from bs4 import BeautifulSoup
from matplotlib.ticker import FuncFormatter
from urllib3.exceptions import InsecureRequestWarning, NotOpenSSLWarning


warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
warnings.filterwarnings("ignore", category=InsecureRequestWarning)

import requests


RANKINGS_URL = (
    "https://publicuniversityhonors.com/"
    "us-news-rankings-2025-which-universities-have-gained-or-lost-the-most-since-2018/"
)
FEC_API_BASE = "https://api.open.fec.gov/v1"
FEC_SCHEDULE_A_API_KEY = "U4CGxchr88wIKcoCqfL8mxExQearu8iTo6S9f0wU"
COMMITTEE_MASTER_URL = "https://www.fec.gov/files/bulk-downloads/2026/cm26.zip"
CANDIDATE_MASTER_URL = "https://www.fec.gov/files/bulk-downloads/2026/cn26.zip"
VALID_PARTIES = {"DEM", "REP"}
VALID_COMMITTEE_TYPES = {"H", "S", "P", "Y"}


OFFICIAL_QUERY = {
    "Princeton": "Princeton University",
    "MIT": "Massachusetts Institute of Technology",
    "Harvard": "Harvard University",
    "Stanford": "Stanford University",
    "Yale": "Yale University",
    "Caltech": "California Institute of Technology",
    "Duke": "Duke University",
    "Johns Hopkins": "Johns Hopkins University",
    "Northwestern": "Northwestern University",
    "Penn": "University of Pennsylvania",
    "Chicago": "University of Chicago",
    "Cornell": "Cornell University",
    "Brown": "Brown University",
    "Columbia": "Columbia University",
    "UCLA": "University of California Los Angeles",
    "Dartmouth": "Dartmouth College",
    "UC Berkeley": "University of California Berkeley",
    "Rice": "Rice University",
    "Vanderbilt": "Vanderbilt University",
    "Notre Dame": "University of Notre Dame",
    "Michigan": "University of Michigan",
    "Washington Univ": "Washington University in St. Louis",
    "Carnegie Mellon": "Carnegie Mellon University",
    "Georgetown": "Georgetown University",
    "Emory": "Emory University",
    "Virginia": "University of Virginia",
    "North Carolina": "University of North Carolina Chapel Hill",
    "USC": "University of Southern California",
    "UC San Diego": "University of California San Diego",
    "Florida": "University of Florida",
    "UT Austin": "University of Texas at Austin",
    "NYU": "New York University",
    "UC Davis": "University of California Davis",
    "UC Irvine": "University of California Irvine",
    "Georgia Tech": "Georgia Institute of Technology",
    "Illinois": "University of Illinois Urbana Champaign",
    "Boston College": "Boston College",
    "Tufts": "Tufts University",
    "UC Santa Barbara": "University of California Santa Barbara",
    "UW Madison": "University of Wisconsin Madison",
    "Rutgers": "Rutgers University",
    "Boston Univ": "Boston University",
    "Ohio St": "Ohio State University",
    "Maryland": "University of Maryland",
    "Rochester": "University of Rochester",
    "Washington": "University of Washington",
    "Purdue": "Purdue University",
    "Wake Forest": "Wake Forest University",
    "Georgia": "University of Georgia",
    "Lehigh": "Lehigh University",
    "Virginia Tech": "Virginia Tech",
    "Texas A&M": "Texas A&M University",
    "Case Western": "Case Western Reserve University",
    "William & Mary": "College of William and Mary",
    "Northeastern": "Northeastern University",
    "Florida St": "Florida State University",
    "Minnesota": "University of Minnesota",
    "Stony Brook": "Stony Brook University",
    "NC State": "North Carolina State University",
    "UMass Amherst": "University of Massachusetts Amherst",
    "Brandeis": "Brandeis University",
    "Penn State": "Pennsylvania State University",
    "Michigan St": "Michigan State University",
    "U of Miami": "University of Miami",
    "George Washington": "George Washington University",
    "Tulane": "Tulane University",
    "RPI": "Rensselaer Polytechnic Institute",
    "Connecticut": "University of Connecticut",
    "Pitt": "University of Pittsburgh",
    "Indiana": "Indiana University",
    "Syracuse": "Syracuse University",
    "Binghamton": "Binghamton University",
    "Stevens Inst Tech": "Stevens Institute of Technology",
    "UC Riverside": "University of California Riverside",
    "Col School of Mines": "Colorado School of Mines",
    "Univ at Buffalo": "University at Buffalo",
    "Clemson": "Clemson University",
    "Pepperdine": "Pepperdine University",
    "Delaware": "University of Delaware",
    "WPI": "Worcester Polytechnic Institute",
    "UC Santa Cruz": "University of California Santa Cruz",
    "Marquette": "Marquette University",
    "Drexel": "Drexel University",
    "Howard": "Howard University",
    "SMU": "Southern Methodist University",
    "Fordham": "Fordham University",
    "Baylor": "Baylor University",
    "American": "American University",
    "Iowa": "University of Iowa",
    "Yeshiva": "Yeshiva University",
    "Colorado": "University of Colorado Boulder",
    "Auburn": "Auburn University",
    "TCU": "Texas Christian University",
    "Illinois Tech": "Illinois Institute of Technology",
    "Saint Louis": "Saint Louis University",
    "Tennessee": "University of Tennessee",
    "San Diego": "University of San Diego",
    "Oregon": "University of Oregon",
    "Brigham Young": "Brigham Young University",
    "Arizona": "University of Arizona",
    "Missouri": "University of Missouri",
    "New Hampshire": "University of New Hampshire",
    "Arizona St": "Arizona State University",
    "Iowa St": "Iowa State University",
    "Denver": "University of Denver",
    "South Carolina": "University of South Carolina",
    "Vermont": "University of Vermont",
    "Oklahoma": "University of Oklahoma",
    "Clark": "Clark University",
    "Loyola Chicago": "Loyola University Chicago",
    "Miami Oh": "Miami University",
    "Dayton": "University of Dayton",
    "Michigan Tech": "Michigan Technological University",
    "Colorado St": "Colorado State University",
    "Kansas": "University of Kansas",
    "Clarkson": "Clarkson University",
    "Kentucky": "University of Kentucky",
    "Nebraska": "University of Nebraska",
    "Alabama": "University of Alabama",
    "Catholic": "Catholic University of America",
    "Tulsa": "University of Tulsa",
    "Arkansas": "University of Arkansas",
    "UC Merced": "University of California Merced",
    "Villanova": "Villanova University",
    "Santa Clara": "Santa Clara University",
    "Rutgers Newark": "Rutgers University Newark",
    "Illinois Chicago": "University of Illinois Chicago",
    "NJIT": "New Jersey Institute of Technology",
    "Loyola Marymount": "Loyola Marymount University",
    "RIT": "Rochester Institute of Technology",
    "USF": "University of South Florida",
    "Fla International": "Florida International University",
    "Gonzaga": "Gonzaga University",
    "Rutgers Camden": "Rutgers University Camden",
    "Temple": "Temple University",
    "Cal St Long Beach": "California State University Long Beach",
    "George Mason": "George Mason University",
    "San Diego St": "San Diego State University",
    "San Francisco": "University of San Francisco",
    "UT Dallas": "University of Texas at Dallas",
    "Chapman": "Chapman University",
    "Creighton": "Creighton University",
    "CUNY City College": "City College of New York",
    "Elon": "Elon University",
    "Univ at Albany": "University at Albany",
    "UCF": "University of Central Florida",
    "Fairfield": "Fairfield University",
    "Cal St Fullerton": "California State University Fullerton",
    "Thomas Jefferson": "Thomas Jefferson University",
    "UAB": "University of Alabama at Birmingham",
    "Utah": "University of Utah",
    "VCU": "Virginia Commonwealth University",
    "Oregon St": "Oregon State University",
    "Houston": "University of Houston",
    "UMBC": "University of Maryland Baltimore County",
    "James Madison": "James Madison University",
    "Cincinnati": "University of Cincinnati",
}


QUERY_VARIANTS = {
    "Illinois": ["University of Illinois at Urbana Champaign"],
    "North Carolina": ["University of North Carolina"],
    "Washington Univ": ["Washington University in St Louis"],
    "William & Mary": ["College of William and Mary", "William and Mary"],
    "Colorado": ["University of Colorado at Boulder"],
    "Rutgers Newark": ["Rutgers University-Newark"],
    "Rutgers Camden": ["Rutgers University-Camden"],
}


MATCH_ALIASES = {
    "MIT": ["MIT"],
    "UCLA": ["UCLA"],
    "UC Berkeley": ["UC Berkeley"],
    "UC San Diego": ["UC San Diego"],
    "UT Austin": ["UT Austin"],
    "NYU": ["NYU"],
    "UC Davis": ["UC Davis"],
    "UC Irvine": ["UC Irvine"],
    "Georgia Tech": ["Georgia Tech"],
    "Illinois": ["UIUC", "University of Illinois at Urbana Champaign"],
    "UC Santa Barbara": ["UC Santa Barbara"],
    "UW Madison": ["UW Madison", "University of Wisconsin Madison"],
    "Maryland": ["University of Maryland College Park"],
    "NC State": ["NC State"],
    "UMass Amherst": ["UMass Amherst"],
    "RPI": ["RPI"],
    "WPI": ["WPI"],
    "SMU": ["SMU"],
    "TCU": ["TCU"],
    "USC": ["USC"],
    "Brigham Young": ["BYU"],
    "Arizona St": ["ASU"],
    "RIT": ["RIT"],
    "USF": ["USF"],
    "UCF": ["UCF"],
    "UAB": ["UAB"],
    "VCU": ["VCU"],
    "UMBC": ["UMBC"],
    "Illinois Chicago": ["UIC"],
    "NJIT": ["NJIT"],
    "UT Dallas": ["UT Dallas", "UTD"],
    "North Carolina": ["UNC Chapel Hill", "University of North Carolina"],
    "Colorado": ["CU Boulder"],
    "Washington Univ": ["Washington University in St Louis", "WUSTL"],
    "William & Mary": ["William and Mary"],
    "Penn": ["UPenn", "University of Penn"],
    "Rutgers Newark": ["Rutgers Newark"],
    "Rutgers Camden": ["Rutgers Camden"],
}


EXCLUDE_TERMS = {
    "Rutgers": ["NEWARK", "CAMDEN"],
    "Maryland": ["BALTIMORE COUNTY", "UMBC"],
    "Illinois": ["CHICAGO", "UIC"],
    "North Carolina": ["CHARLOTTE", "GREENSBORO", "WILMINGTON"],
    "Indiana": ["PENNSYLVANIA"],
}


@dataclass(frozen=True)
class InstitutionRule:
    label: str
    rank_2025: int
    queries: tuple[str, ...]
    include_terms: tuple[str, ...]
    exclude_terms: tuple[str, ...]


def normalize_text(text: str) -> str:
    text = text.upper()
    text = text.replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def contains_normalized_phrase(haystack: str, needle: str) -> bool:
    return f" {needle} " in f" {haystack} "


def hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def fetch_json(
    session: requests.Session,
    url: str,
    params: dict,
    cache_dir: Path,
    pause_seconds: float,
    force_refresh: bool = False,
) -> dict:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_name = f"{hash_key(url + json.dumps(params, sort_keys=True))}.json"
    cache_path = cache_dir / cache_name
    if cache_path.exists() and not force_refresh:
        return json.loads(cache_path.read_text())

    last_error = None
    for attempt in range(5):
        try:
            response = session.get(url, params=params, timeout=60)
            if response.status_code == 429:
                wait_seconds = 5 * (attempt + 1)
                time.sleep(wait_seconds)
                continue
            response.raise_for_status()
            payload = response.json()
            cache_path.write_text(json.dumps(payload))
            time.sleep(pause_seconds)
            return payload
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url} with params={params}") from last_error


def download_binary(
    session: requests.Session,
    url: str,
    path: Path,
    pause_seconds: float,
    force_refresh: bool = False,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not force_refresh:
        return path
    response = session.get(url, timeout=120)
    response.raise_for_status()
    path.write_bytes(response.content)
    time.sleep(pause_seconds)
    return path


def parse_rankings(session: requests.Session) -> pd.DataFrame:
    response = session.get(RANKINGS_URL, timeout=60)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")
    table = soup.find("table")
    if table is None:
        raise RuntimeError("Could not find rankings table")

    rows: list[dict] = []
    source_order = 0
    for tr in table.find_all("tr"):
        cols = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if len(cols) < 9:
            continue
        label = cols[0].strip()
        rank_text = cols[8].strip()
        if not label or not rank_text.isdigit():
            continue
        source_order += 1
        rows.append(
            {
                "label": label,
                "rank_2025": int(rank_text),
                "source_order": source_order,
            }
        )

    rankings = pd.DataFrame(rows)
    rankings = rankings.sort_values(["rank_2025", "source_order"]).reset_index(drop=True)
    return rankings


def build_institution_rules(rankings: pd.DataFrame, top_n: int) -> list[InstitutionRule]:
    selected = rankings.head(top_n).copy()
    missing = [label for label in selected["label"] if label not in OFFICIAL_QUERY]
    if missing:
        raise KeyError(f"Missing query mapping for: {missing}")

    rules: list[InstitutionRule] = []
    for row in selected.itertuples(index=False):
        official = OFFICIAL_QUERY[row.label]
        queries = tuple(dict.fromkeys([official, *QUERY_VARIANTS.get(row.label, [])]))
        include_terms = tuple(dict.fromkeys([official, *MATCH_ALIASES.get(row.label, [])]))
        exclude_terms = tuple(EXCLUDE_TERMS.get(row.label, []))
        rules.append(
            InstitutionRule(
                label=row.label,
                rank_2025=row.rank_2025,
                queries=queries,
                include_terms=include_terms,
                exclude_terms=exclude_terms,
            )
        )
    return rules


def read_zip_pipe_table(zip_path: Path, column_names: list[str]) -> pd.DataFrame:
    with zipfile.ZipFile(zip_path) as zf:
        inner_name = zf.namelist()[0]
        with zf.open(inner_name) as handle:
            return pd.read_csv(
                io.TextIOWrapper(handle, encoding="latin-1"),
                sep="|",
                header=None,
                names=column_names,
                dtype=str,
                keep_default_na=False,
            )


def load_fec_master_data(
    session: requests.Session,
    cache_dir: Path,
    pause_seconds: float,
    force_refresh: bool = False,
) -> pd.DataFrame:
    committee_zip = download_binary(
        session,
        COMMITTEE_MASTER_URL,
        cache_dir / "cm26.zip",
        pause_seconds,
        force_refresh=force_refresh,
    )
    candidate_zip = download_binary(
        session,
        CANDIDATE_MASTER_URL,
        cache_dir / "cn26.zip",
        pause_seconds,
        force_refresh=force_refresh,
    )

    committee_df = read_zip_pipe_table(
        committee_zip,
        [
            "committee_id",
            "committee_name",
            "treasurer_name",
            "street_1",
            "street_2",
            "city",
            "state",
            "zip",
            "designation",
            "committee_type",
            "party_affiliation",
            "filing_frequency",
            "organization_type",
            "connected_org_name",
            "candidate_id",
        ],
    )
    candidate_df = read_zip_pipe_table(
        candidate_zip,
        [
            "candidate_id",
            "candidate_name",
            "candidate_party",
            "election_year",
            "state",
            "office",
            "district",
            "incumbent_challenge_status",
            "candidate_status",
            "committee_id",
            "street_1",
            "street_2",
            "city",
            "state_address",
            "zip",
        ],
    )

    candidate_df = candidate_df[["candidate_id", "candidate_party"]].drop_duplicates()
    committee_df = committee_df.merge(candidate_df, on="candidate_id", how="left")
    committee_df["resolved_party"] = committee_df["party_affiliation"].where(
        committee_df["party_affiliation"].isin(VALID_PARTIES),
        committee_df["candidate_party"].where(committee_df["candidate_party"].isin(VALID_PARTIES)),
    )
    return committee_df[
        [
            "committee_id",
            "committee_name",
            "committee_type",
            "designation",
            "party_affiliation",
            "candidate_id",
            "candidate_party",
            "resolved_party",
        ]
    ].drop_duplicates(subset=["committee_id"])


def employer_matches(employer: str, rule: InstitutionRule) -> bool:
    normalized = normalize_text(employer)
    include = [normalize_text(term) for term in rule.include_terms]
    exclude = [normalize_text(term) for term in rule.exclude_terms]
    return any(contains_normalized_phrase(normalized, term) for term in include) and not any(
        contains_normalized_phrase(normalized, term) for term in exclude
    )


def fetch_institution_rows(
    session: requests.Session,
    rule: InstitutionRule,
    cache_dir: Path,
    pause_seconds: float,
    force_refresh: bool = False,
) -> pd.DataFrame:
    rows: list[dict] = []
    seen = set()
    endpoint = f"{FEC_API_BASE}/schedules/schedule_a/by_employer/"
    for query in rule.queries:
        page = 1
        while True:
            payload = fetch_json(
                session,
                endpoint,
                {
                    "api_key": FEC_SCHEDULE_A_API_KEY,
                    "employer": query,
                    "per_page": 100,
                    "page": page,
                },
                cache_dir=cache_dir / slugify(rule.label),
                pause_seconds=pause_seconds,
                force_refresh=force_refresh,
            )
            for result in payload.get("results", []):
                employer = result["employer"]
                key = (
                    rule.label,
                    employer,
                    result["committee_id"],
                    result["cycle"],
                    result["total"],
                    result["count"],
                )
                if key in seen:
                    continue
                if not employer_matches(employer, rule):
                    continue
                seen.add(key)
                rows.append(
                    {
                        "institution": rule.label,
                        "rank_2025": rule.rank_2025,
                        "query_term": query,
                        "employer": employer,
                        "committee_id": result["committee_id"],
                        "cycle": int(result["cycle"]),
                        "transaction_count": int(result["count"]),
                        "total": float(result["total"]),
                    }
                )

            pagination = payload.get("pagination", {})
            if page >= int(pagination.get("pages", 1)):
                break
            page += 1
    return pd.DataFrame(rows)


def format_currency_axis(value: float, _: int) -> str:
    if abs(value) >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if abs(value) >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:,.0f}"


def build_chart(summary: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary = summary.sort_values(["cycle", "party"])
    dem = summary[summary["party"] == "DEM"].set_index("cycle")["total"]
    rep = summary[summary["party"] == "REP"].set_index("cycle")["total"]
    cycles = sorted(set(summary["cycle"]))
    dem_values = [dem.get(cycle, 0.0) for cycle in cycles]
    rep_values = [rep.get(cycle, 0.0) for cycle in cycles]

    plt.style.use("seaborn-v0_8-whitegrid")
    fig, ax = plt.subplots(figsize=(16, 9))
    x = range(len(cycles))
    width = 0.42

    ax.bar([idx - width / 2 for idx in x], dem_values, width=width, color="#2563eb", label="DEM")
    ax.bar([idx + width / 2 for idx in x], rep_values, width=width, color="#dc2626", label="REP")

    ax.set_title(
        "Political Donations by Employees of Top-Ranked U.S. Universities\n"
        "Direct contributions to DEM and REP candidate or party committees by election cycle",
        fontsize=18,
        loc="left",
    )
    ax.set_xlabel("Election Cycle")
    ax.set_ylabel("Total Direct Contributions")
    ax.set_xticks(list(x))
    ax.set_xticklabels(cycles, rotation=45)
    ax.yaxis.set_major_formatter(FuncFormatter(format_currency_axis))
    ax.legend(frameon=False)

    fig.text(
        0.01,
        0.01,
        "Universe: top 150 institutions from a 2025 U.S. News-derived ranking table published by "
        "Public University Honors. FEC employer matching is conservative and may miss some hospital, "
        "foundation, or department-only employer variants.",
        fontsize=10,
        color="#4b5563",
    )
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def run(args: argparse.Namespace) -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cache_dir = (
        Path(args.cache_dir).expanduser().resolve()
        if args.cache_dir
        else base_dir / ".cache" / "college_donation_chart"
    )
    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else base_dir / "outputs"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    rankings = parse_rankings(session)
    rules = build_institution_rules(rankings, args.top_n)
    print(f"Selected {len(rules)} schools from ranking source")

    ranking_output = pd.DataFrame(
        {
            "institution": [rule.label for rule in rules],
            "rank_2025": [rule.rank_2025 for rule in rules],
            "primary_query": [rule.queries[0] for rule in rules],
        }
    )
    ranking_output.to_csv(output_dir / "top_schools_2025_source_list.csv", index=False)

    committee_lookup = load_fec_master_data(
        session,
        cache_dir=cache_dir / "master",
        pause_seconds=args.pause_seconds,
        force_refresh=args.force_refresh,
    )

    institution_frames: list[pd.DataFrame] = []
    for idx, rule in enumerate(rules, start=1):
        print(f"[{idx:03d}/{len(rules):03d}] Fetching {rule.label}")
        frame = fetch_institution_rows(
            session,
            rule,
            cache_dir=cache_dir / "by_employer",
            pause_seconds=args.pause_seconds,
            force_refresh=args.force_refresh,
        )
        if not frame.empty:
            institution_frames.append(frame)

    if not institution_frames:
        raise RuntimeError("No institution rows were collected")

    raw = pd.concat(institution_frames, ignore_index=True)
    raw = raw[(raw["cycle"] >= args.start_cycle) & (raw["cycle"] <= args.end_cycle)].copy()
    raw = raw.merge(committee_lookup, on="committee_id", how="left")
    raw = raw[
        raw["resolved_party"].isin(VALID_PARTIES)
        & raw["committee_type"].isin(VALID_COMMITTEE_TYPES)
    ].copy()

    raw.to_csv(output_dir / "top_school_committee_rows.csv", index=False)

    institution_party_cycle = (
        raw.groupby(["institution", "rank_2025", "cycle", "resolved_party"], as_index=False)["total"]
        .sum()
        .rename(columns={"resolved_party": "party"})
    )
    institution_party_cycle.to_csv(
        output_dir / "top_school_donations_by_institution_cycle_party.csv", index=False
    )

    overall_summary = (
        raw.groupby(["cycle", "resolved_party"], as_index=False)["total"]
        .sum()
        .rename(columns={"resolved_party": "party"})
        .sort_values(["cycle", "party"])
    )
    overall_summary.to_csv(output_dir / "top_school_donations_by_cycle_party.csv", index=False)

    build_chart(overall_summary, output_dir / "top_school_donations_by_cycle_party.png")

    top_institutions = (
        raw.groupby(["institution", "resolved_party"], as_index=False)["total"]
        .sum()
        .rename(columns={"resolved_party": "party"})
        .sort_values(["party", "total"], ascending=[True, False])
    )
    top_institutions.to_csv(output_dir / "top_school_donations_by_institution_party.csv", index=False)

    print()
    print("Wrote:")
    print(output_dir / "top_school_donations_by_cycle_party.csv")
    print(output_dir / "top_school_donations_by_cycle_party.png")
    print(output_dir / "top_school_donations_by_institution_cycle_party.csv")
    print(output_dir / "top_school_donations_by_institution_party.csv")
    print(output_dir / "top_schools_2025_source_list.csv")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top-n", type=int, default=150)
    parser.add_argument("--start-cycle", type=int, default=2000)
    parser.add_argument("--end-cycle", type=int, default=2026)
    parser.add_argument("--pause-seconds", type=float, default=1.05)
    parser.add_argument("--cache-dir")
    parser.add_argument("--output-dir")
    parser.add_argument("--force-refresh", action="store_true")
    return parser


if __name__ == "__main__":
    run(build_parser().parse_args())
