# Uni Political Donations

This project measures political donations from people employed by leading US colleges and universities and turns the results into a static GitHub Pages dashboard.

The current analysis focuses on presidential election cycles `2008`, `2012`, `2016`, `2020`, and `2024`, using FEC individual contribution files and a ranked school list based on the 2025 ranking source used in the pipeline. Totals are split between `DEM` and `REP` and include direct House, Senate, presidential, and party committees plus `ActBlue` and `WinRed`.

## What This Repo Does

The repo has two jobs:

1. Scan large FEC individual contribution files and identify donations made by people whose `EMPLOYER` field matches a college or university in the selected school set.
2. Package the results into a browser-based dashboard with trend charts, donor counts, leaderboard views, and downloadable CSVs.

The latest dashboard is built from the output directory `outputs/local_presidential_with_2024_platforms/` and published from `docs/`.

## Current Snapshot

For the top 150 ranked schools in the current output:

| Cycle | DEM dollars | REP dollars | DEM donors | REP donors |
| --- | ---: | ---: | ---: | ---: |
| 2008 | $3.8M | $0.5M | 3,829 | 603 |
| 2012 | $6.8M | $0.5M | 6,337 | 586 |
| 2016 | $16.6M | $0.8M | 16,873 | 1,107 |
| 2020 | $75.7M | $2.6M | 51,826 | 2,514 |
| 2024 | $46.6M | $2.1M | 27,724 | 1,801 |

The dashboard also includes `Top 25` and `Top 10` school views.

## How It Works

The analysis pipeline in [`scripts/college_donation_chart_local_presidential.py`](scripts/college_donation_chart_local_presidential.py) works like this:

1. Detect presidential-cycle FEC individual contribution files in `Data/` such as `indiv08.zip`, `indiv12.zip`, `indiv16.zip`, `indiv20.zip`, and `indiv24.zip`. Extracted `Data/indivYY/itcont.txt` files are also supported.
2. Load the ranked school list and build institution matching rules using canonical names plus a large alias table.
3. Download and cache FEC committee master data so committee IDs can be resolved to party and committee type.
4. Scan each `itcont.txt` row, read the contributor `EMPLOYER`, and match that employer string to a school.
5. Keep only donations that resolve to `DEM` or `REP`, then aggregate totals by cycle, party, institution, and committee type.
6. Deduplicate donors using normalized `name + city + state + ZIP5` so donor counts are not just raw contribution counts.
7. Write summary CSVs and PNG charts for the top `150`, `25`, and `10` school sets.

The GitHub Pages packaging step in [`scripts/build_dashboard.py`](scripts/build_dashboard.py) reads the latest output tables, converts them into [`docs/data/dashboard-data.json`](docs/data/dashboard-data.json), and copies the raw CSV downloads into `docs/data/`.

The static frontend lives in:

- [`docs/index.html`](docs/index.html)
- [`docs/app.js`](docs/app.js)
- [`docs/styles.css`](docs/styles.css)

## Repository Layout

```text
Data/
  indiv08.zip, indiv12.zip, indiv16.zip, indiv20.zip, indiv24.zip
  weball*.zip / weball*.txt
scripts/
  college_donation_chart.py
  college_donation_chart_local_presidential.py
  build_dashboard.py
outputs/
  local_presidential_with_2024_platforms/
docs/
  index.html
  app.js
  styles.css
  data/
README.md
```

## Running The Analysis

Install the Python dependencies used by the scripts:

```bash
python3 -m pip install pandas matplotlib requests beautifulsoup4
```

Place the FEC individual contribution files in `Data/` with the expected names. The current pipeline was built around the presidential years already present in this repo.

Run the local presidential-cycle analysis:

```bash
python3 scripts/college_donation_chart_local_presidential.py \
  --top-n 150 \
  --cycles 2008 2012 2016 2020 2024 \
  --output-dir outputs/local_presidential_with_2024_platforms
```

That command writes:

- `presidential_cycles_donations_by_cycle_party.csv`
- `presidential_cycles_donations_by_institution_cycle_party.csv`
- `presidential_cycles_donations_by_institution_party.csv`
- `donor_counts_by_school_set_cycle_party.csv`
- `top_150_line_summary.csv`, `top_25_line_summary.csv`, `top_10_line_summary.csv`
- `top_150_donor_counts.csv`, `top_25_donor_counts.csv`, `top_10_donor_counts.csv`
- matching PNG charts for each school set

## Building The Dashboard

Build the GitHub Pages payload from the latest output directory:

```bash
python3 scripts/build_dashboard.py
```

Serve the dashboard locally:

```bash
python3 -m http.server 8000 -d docs
```

Then open `http://127.0.0.1:8000/`.

If you push this repo to GitHub, you can publish the dashboard directly from the `docs/` directory using GitHub Pages.

## Dashboard Features

The dashboard currently includes:

- a line chart over time by party
- toggles for `Top 150`, `Top 25`, and `Top 10` schools
- a metric toggle between donation dollars and unique donors
- KPI cards for the latest cycle and the peak cycle
- all-time and 2024 institution leaderboards by dollars
- downloadable CSVs for the underlying tables

## Methodology Notes

- School cohorts are based on the 2025 ranking source parsed by the pipeline, not on a historical ranking for each election cycle.
- Employer matching is conservative and alias-based. This reduces false positives but can still miss hospitals, labs, foundations, or department variants tied to a university.
- Short aliases such as `RIT` and `UIC` are matched with token boundaries to avoid false hits like `RETIRED` or `PUBLIC`.
- Donor counts are deduplicated by normalized `name + city + state + ZIP5`, which is a practical heuristic rather than a perfect person identifier.
- Institution leaderboards in the dashboard are dollar-based because the current institution-level output does not include donor counts by school.
- The current dashboard includes `ActBlue` and `WinRed`, but it is not a full measure of every PAC, joint fundraising committee, or conduit path in federal elections.

## Important Caveats

- This repo answers a narrow question: contributions attributable to people whose FEC `EMPLOYER` field matches a selected college or university.
- FEC employer strings are self-reported and messy. Matching quality is good enough for directional analysis, but not perfect.
- The `weball*.txt` files in `Data/` are bulk candidate/committee summary files, not the individual-level records used for the main dashboard.
- The first run may need network access to fetch ranking metadata and committee master files unless they are already cached.

## Main Files

- [`scripts/college_donation_chart_local_presidential.py`](scripts/college_donation_chart_local_presidential.py): scans local FEC individual contribution files and writes the main analysis outputs
- [`scripts/build_dashboard.py`](scripts/build_dashboard.py): packages the latest outputs for the static dashboard
- [`docs/index.html`](docs/index.html): GitHub Pages entrypoint
- [`outputs/local_presidential_with_2024_platforms`](outputs/local_presidential_with_2024_platforms): latest output used by the dashboard
