# NASEM Members FEC Donation Lookup

Cross-references living members of the National Academies of Sciences, Engineering, and Medicine (NASEM) with Federal Election Commission (FEC) individual contribution records to identify political donations.

## Key Findings

Analysis of high-confidence FEC matches (name + employer/occupation concordance), deduplicated by transaction ID:

- **8,212 unique** living NASEM members (3,246 NAS, 2,879 NAE, 2,561 NAM; 473 hold dual membership)
- **2,117 unique donors** (25.8% participation rate) contributed **$52.3M** across the 2012--2026 election cycles
- Giving is **extremely concentrated**: Gini coefficient 0.89; top 1% of donors = 59.7% of all dollars
- **Overwhelmingly Democratic**: ActBlue received $7.7M (1,153 donors) vs. WinRed $455K (35 donors) -- a 17:1 ratio
- **2020 surge**: $17.8M donated (2.4x prior average), with 44% first-time donors
- NAM (medicine) has the highest participation rate (32.1%); NAE (engineering) the highest total ($32.7M)

See `WHITEPAPER-OUTLINE.md` for the full statistical analysis and planned whitepaper structure.

## Data Sources

### NASEM Member Lists (scraped 2026-04-14)

| File | Academy | Members |
|------|---------|---------|
| `nas_living_members_2026-04-14.csv` | National Academy of Sciences (NAS) | ~3,246 |
| `nae_living_members_2026-04-14.csv` | National Academy of Engineering (NAE) | ~2,879 |
| `nam_living_members_2026-04-14.csv` | National Academy of Medicine (NAM) | ~2,561 |
| `nasem_living_members_nas_nae_nam_2026-04-14.csv` | All three combined | ~8,686 rows (8,212 unique) |

Each CSV contains: `academy, name, profile_url, membership_type, job_title, organization, city, state, country, election_year, section, description, source_directory_url`.

### FEC Data

Individual contributions (Schedule A) queried via the [FEC API](https://api.open.fec.gov/developers/) or matched against [FEC bulk data files](https://www.fec.gov/data/browse-data/?tab=bulk-data).

## Data Pipeline & Deduplication

Raw FEC matching produces duplicate records from two sources:

1. **Search variant duplicates**: Multiple name variants (e.g., "Smith, John" and "Smith, J.") match the same FEC record, producing duplicate rows with the same transaction ID.
2. **Dual-academy duplicates**: 473 members hold membership in multiple academies and appear under variant name formats (e.g., "David E. Shaw" in NAS vs. "Dr. David E. Shaw" in NAE). The same FEC transaction is matched independently for each academy entry.

The dashboard data preparation script (`scripts/prepare_dashboard_data.py`) deduplicates by FEC `transaction_id`, merging academy tags when the same transaction was matched from multiple academy entries. After deduplication: 94,432 raw rows → **85,203 unique transactions**.

The summary CSV uses **high-confidence amounts only** (employer/occupation-confirmed matches). Members whose FEC name matches could not be confirmed by employer are shown with $0.

## Suggested Donor Party Labeling Methodology

If you want to label a donor as `Dem`, `Rep`, or `Other / corporate` within a given election cycle, use a donor-cycle rule rather than an all-time label.

1. **Unit of analysis:** group each donor's matched contributions by two-year election cycle.
2. **Recipient resolution:** use the actual recipient committee on the FEC record; when an earmark target is identified, use that target for candidate-specific classification and for party assignment when available.
3. **Recipient labels:** assign each recipient committee to `DEM`, `REP`, or `OTH` from committee or candidate party data. ActBlue defaults to `DEM`, WinRed defaults to `REP`, and unresolved, bipartisan, trade-association, or nonpartisan committees fall into `OTH`.
4. **Weighting:** sum **dollars**, not just contribution counts, into `DEM`, `REP`, and `OTH` buckets for each donor-cycle.
5. **Decision rule:** label the donor-cycle `Dem` if Democratic dollars are at least two-thirds of identifiable partisan dollars and at least double Republican dollars. Label it `Rep` under the mirror rule. Otherwise label it `Other / corporate`.

This approach is intentionally conservative. It produces a behavioral label for a specific cycle, not a permanent ideological label for the donor. Mixed, bipartisan, corporate-PAC, trade-association, and unresolved patterns should stay in `Other / corporate` unless a clear partisan majority exists.

## Scripts

### `fec_donor_lookup.py` (API-based search)

The primary search script. Queries the FEC Schedule A API for each NASEM member.

**Name cleaning:** Strips titles (Admiral, Gen., Dr., etc.), suffixes (Jr., Ph.D., M.D., (Ret.)), and parenthesized content (nicknames like (Pete), markers like (NAS)). Handles edge cases like `ADM (Ret.) James O. Ellis Jr.` → `James O. Ellis` and `Lt. Gen. Malcolm R. O'Neill USA (R)` → `Malcolm R. O'Neill`.

**Multi-variant search:** For names with surname particles (de, van, el, al, etc.) or ambiguous multi-word endings, generates multiple search variants. For example, `Dr. Abbas El Gamal` searches both `GAMAL, ABBAS` (treating "El" as a middle name) and `EL GAMAL, ABBAS` (compound surname). Results are checked against the member's NASEM organization to confirm identity via employer matching.

**Match confidence:** Each result is scored as `high` (employer confirmed) or `medium` (name match only).

```bash
pip install requests openpyxl pandas
python fec_donor_lookup.py                    # search all US members
python fec_donor_lookup.py --limit 50         # test with first 50
python fec_donor_lookup.py --force-refresh    # ignore cached API responses
python fec_donor_lookup.py --all-countries    # include international members
```

Outputs to `./outputs/`:
- `nasem_fec_donations.xlsx` -- all matched donations with FEC links
- `nasem_fec_donations.csv` -- same data in CSV
- `nasem_fec_summary.csv` -- one row per member with donation totals and confidence

### `nasem_fec_local_search.py` (fast bulk data search -- recommended)

The fastest approach. Streams through locally-downloaded FEC bulk individual contribution files (`itcont.txt`), processing ~230K lines/second. Searches all available election cycles (2008--2026) in a single run.

Uses the same multi-variant name matching and employer confirmation as the API search. Each member is indexed under every plausible last name variant, so compound surnames are found regardless of how FEC stored the name.

```bash
pip install pandas
python nasem_fec_local_search.py                               # search all
python nasem_fec_local_search.py --limit 50                    # test first 50 members
python nasem_fec_local_search.py --high-only                   # employer-confirmed only
python nasem_fec_local_search.py --data-dir /path/to/fec/data  # custom data location
```

Requires FEC bulk data downloaded from https://www.fec.gov/data/browse-data/?tab=bulk-data (the `indivYY.zip` files containing `itcont.txt`). Auto-discovers files in `../Uni Political Donations/Data/`.

Outputs to `./outputs/`:
- `nasem_fec_donations.csv` -- all matched donations with confidence scores
- `nasem_fec_donations_high_confidence.csv` -- employer-confirmed matches only
- `nasem_fec_summary.csv` -- one row per member with totals by confidence level and party

### `run_nasem_fec.py` and `nasem_fec_bulk_search.py` (legacy bulk search)

Earlier versions of the bulk data search. `nasem_fec_local_search.py` supersedes these with better name cleaning, multi-variant indexing, and employer confirmation.

### `scripts/prepare_dashboard_data.py` (dashboard data preparation)

Transforms raw output CSVs into the format consumed by the interactive dashboard. Handles:
- Column name normalization across different source script formats
- Party enrichment via committee lookup table and earmark extraction
- Transaction-ID-based deduplication of search variant and dual-academy duplicates
- High-confidence-only filtering for summary statistics

```bash
python scripts/prepare_dashboard_data.py
```

Reads from `outputs/` and writes to `public/data/`.

## Interactive Dashboard

A React + Vite dashboard for exploring the data interactively. Includes per-member search, party/academy/cycle filters, geographic heatmaps, and top-donor/recipient charts.

```bash
npm install
npm run dev     # development server
npm run build   # production build to dist/
```

## Output Format

### Summary CSV columns

| Column | Description |
|--------|-------------|
| `name` | Original NASEM name |
| `clean_name` | Name after stripping titles/suffixes |
| `academy` | NAS, NAE, or NAM |
| `has_fec_donations` | Whether high-confidence FEC records were found |
| `total_donations` / `total_amount` | High-confidence matched records and dollar total |
| `high_confidence_donations` / `high_confidence_amount` | Same as total (high-conf only) |
| `fec_search_link` | Direct link to FEC individual contributions page |

## Caching

API responses are cached in `.cache/nasem_fec/` to avoid redundant API calls. Progress is saved every 25 members so the search can be resumed if interrupted. Use `--force-refresh` to ignore the cache.
