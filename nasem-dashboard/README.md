# NASEM Members FEC Donation Lookup

Cross-references living members of the National Academies of Sciences, Engineering, and Medicine (NASEM) with Federal Election Commission (FEC) individual contribution records to identify political donations.

## Data Sources

### NASEM Member Lists (scraped 2026-04-14)

| File | Academy | Members |
|------|---------|---------|
| `nas_living_members_2026-04-14.csv` | National Academy of Sciences (NAS) | ~3,246 |
| `nae_living_members_2026-04-14.csv` | National Academy of Engineering (NAE) | ~2,879 |
| `nam_living_members_2026-04-14.csv` | National Academy of Medicine (NAM) | ~2,561 |
| `nasem_living_members_nas_nae_2026-04-14.csv` | NAS + NAE combined | ~6,125 |
| `nasem_living_members_nas_nae_nam_2026-04-14.csv` | All three combined | ~8,686 |

Each CSV contains: `academy, name, profile_url, membership_type, job_title, organization, city, state, country, election_year, section, description, source_directory_url`.

### FEC Data

Individual contributions (Schedule A) queried via the [FEC API](https://api.open.fec.gov/developers/) or matched against [FEC bulk data files](https://www.fec.gov/data/browse-data/?tab=bulk-data).

## Scripts

### `fec_donor_lookup.py` (API-based search)

The primary search script. Queries the FEC Schedule A API for each NASEM member.

**Name cleaning:** Strips titles (Admiral, Gen., Dr., etc.), suffixes (Jr., Ph.D., M.D., (Ret.)), and parenthesized content (nicknames like (Pete), markers like (NAS)). Handles edge cases like `ADM (Ret.) James O. Ellis Jr.` -> `James O. Ellis` and `Lt. Gen. Malcolm R. O'Neill USA (R)` -> `Malcolm R. O'Neill`.

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

## Output Format

### Summary CSV columns

| Column | Description |
|--------|-------------|
| `name` | Original NASEM name |
| `clean_name` | Name after stripping titles/suffixes |
| `first_name` / `last_name` | Parsed name components |
| `search_variants` | FEC search terms used (semicolon-separated) |
| `has_fec_donations` | Whether any FEC records were found |
| `total_donations` / `total_amount` | All matched records |
| `high_confidence_donations` / `high_confidence_amount` | Employer-confirmed records only |
| `fec_search_link` | Direct link to FEC individual contributions page |

## Caching

API responses are cached in `.cache/nasem_fec/` to avoid redundant API calls. Progress is saved every 25 members so the search can be resumed if interrupted. Use `--force-refresh` to ignore the cache.
