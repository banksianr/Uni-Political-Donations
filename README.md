# NASEM Political Donations Dashboard

This branch publishes a GitHub Pages dashboard showing political donation patterns among living members of the National Academies of Sciences, Engineering, and Medicine using matched FEC individual contribution records.

Live site:
[https://banksianr.github.io/Uni-Political-Donations/](https://banksianr.github.io/Uni-Political-Donations/)

This is the `NASEM-Donations` branch of the `banksianr/Uni-Political-Donations` repository. It intentionally replaces the branch's `docs/` payload with the NASEM dashboard build. The original university-donations dashboard still lives in other branches/history; this branch is for the NASEM publication specifically.

## Branch Layout

- `docs/`
  - Published GitHub Pages artifact for this branch.
  - GitHub Pages is configured to serve from `NASEM-Donations /docs`.
- `nasem-dashboard/`
  - React/Vite source used to build the published site.
  - Includes the dashboard code, data-prep script, bundled CSVs, and the implementation plan.

## Current Data Bundle

The published dashboard currently ships with:

- `docs/data/nasem_fec_summary.csv`
  - 7,619 summary rows
  - One row per matched NASEM member in the current bundled dataset
- `docs/data/nasem_fec_donations.csv`
  - 76,675 normalized donation rows
  - Individual contribution rows after deduplicating overlapping multi-academy and multi-search-variant matches
- `docs/data/states-10m.json`
  - US state topology for the choropleth map

The underlying NASEM member lists were scraped on `2026-04-14`, and the bundled dashboard data was normalized from the current local lookup outputs for browser use. The source `outputs/nasem_fec_donations.csv` file used for this refresh contained 94,433 raw matched rows before the dashboard normalization step collapsed duplicate transaction matches.

## What The Dashboard Contains

- FAI-styled single-page React dashboard
- academy filter for `NAS`, `NAE`, and `NAM`
- confidence filter for `All` versus `High only`
- election-cycle filter across the bundled FEC records
- KPI cards for searched members, identified donors, total dollars, and high-confidence dollars
- charts for:
  - donations over time by academy
  - academy comparison across several metrics
  - top committees
  - top organizations
  - contributor-state choropleth
- searchable, sortable member detail table

## Source Of Truth

The editable source for this branch is:

- [`nasem-dashboard/src/main.jsx`](nasem-dashboard/src/main.jsx)
- [`nasem-dashboard/vite.config.js`](nasem-dashboard/vite.config.js)
- [`nasem-dashboard/scripts/prepare_dashboard_data.py`](nasem-dashboard/scripts/prepare_dashboard_data.py)

The published site is the built output in:

- [`docs/index.html`](docs/index.html)
- `docs/assets/*`
- `docs/data/*`

Do not hand-edit the compiled JavaScript in `docs/assets/`. Make changes in `nasem-dashboard/`, rebuild, then copy the new `dist/` output into `docs/`.

## Local Build Workflow

From the source workspace:

```bash
cd nasem-dashboard
npm install
python3 scripts/prepare_dashboard_data.py
npm run build
```

That produces a fresh `dist/` directory. To update the published branch payload:

```bash
rsync -a --delete dist/ ../docs/
touch ../docs/.nojekyll
```

Then commit and push the branch:

```bash
git add docs nasem-dashboard
git commit -m "Update NASEM dashboard"
git push origin NASEM-Donations
```

## GitHub Pages Configuration

This branch is configured for GitHub Pages with:

- Branch: `NASEM-Donations`
- Folder: `/docs`

If GitHub Pages is already enabled, pushing updated `docs/` contents to this branch is sufficient for a redeploy.

## Data Provenance

The source dashboard was built from a local NASEM/FEC matching workflow that:

1. Loads living member directories for `NAS`, `NAE`, and `NAM`.
2. Cleans names and generates multiple surname variants for FEC matching.
3. Searches local FEC bulk contribution files.
4. Scores matches as `high` when employer confirmation is present and `medium` otherwise.
5. Normalizes the output into the runtime CSV contract expected by the dashboard.

Relevant source snapshot files in `nasem-dashboard/` include:

- `DASHBOARD-PLAN.md`
- `README.md`
- `scripts/prepare_dashboard_data.py`
- `public/data/nasem_fec_summary.csv`
- `public/data/nasem_fec_donations.csv`

## Notes

- This branch is publication-oriented: `docs/` is treated as a build artifact.
- The current bundled dataset is a snapshot, not a live API-backed dashboard.
- If you need to refresh the data, regenerate the normalized CSVs in `nasem-dashboard/public/data/`, rebuild, and republish `docs/`.
