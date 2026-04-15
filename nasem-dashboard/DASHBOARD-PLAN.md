# NASEM FEC Donations Dashboard — Implementation Plan

## Purpose

Build a single-file React (`.jsx`) dashboard that visualizes political donation patterns among National Academies (NAS, NAE, NAM) members using FEC data. The dashboard must be **production-gorgeous** out of the box, following the FAI brand system exactly, so that a capable-but-aesthetically-challenged model can build it without making design judgment calls.

---

## Data Contract

The dashboard will load two CSVs at runtime using PapaParse:

### 1. `nasem_fec_summary.csv` (one row per member searched)

| Column | Type | Use |
|---|---|---|
| `name` | string | Display name |
| `clean_name` | string | Cleaned name for matching |
| `academy` | enum: NAS, NAE, NAM | Academy filter / grouping |
| `organization` | string | University/employer |
| `state` | string | US state (or blank) |
| `has_fec_donations` | bool string | Donor vs. non-donor split |
| `total_donations` | int | Count of all matched FEC records |
| `high_confidence_donations` | int | Employer-confirmed records |
| `total_amount` | float | Sum of all matched donations |
| `high_confidence_amount` | float | Sum of employer-confirmed only |
| `profile_url` | url | Link to NASEM profile |
| `fec_search_link` | url | Link to FEC search results |

### 2. `nasem_fec_donations.csv` (~4,400+ rows, will grow to ~50k+ at full scale)

| Column | Type | Use |
|---|---|---|
| `nasem_name` | string | Join key to summary |
| `academy` | enum | Academy grouping |
| `nasem_organization` | string | Member's NASEM org |
| `match_confidence` | enum: high, medium | Filter toggle |
| `contributor_name` | string | FEC contributor name |
| `contributor_employer` | string | FEC-reported employer |
| `committee_name` | string | Receiving committee |
| `committee_id` | string | FEC committee ID |
| `contribution_receipt_amount` | float | Dollar amount |
| `contribution_receipt_date` | date string | YYYY-MM-DD |
| `two_year_transaction_period` | int | Election cycle year |
| `contributor_state` | string | Contributor's state |
| `fec_link` | url | FEC record link |

---

## Technology

Single `.jsx` file. Available libraries:

- **React** (with hooks)
- **Recharts** — all charts
- **lodash** — data transforms
- **PapaParse** — CSV parsing
- **lucide-react** — icons
- **d3** — only for the US state map (d3-geo + topojson)

No localStorage. All state in React `useState`/`useReducer`.

---

## Brand System — Exact Specifications

Every color, font, and spacing value below is **mandatory**. Do not approximate.

### Colors

```js
const COLORS = {
  orange:      '#FF4F00',  // International Orange — primary accent, chart series 1
  codGray:     '#121212',  // Cod Gray — dark backgrounds, text on white
  white:       '#FFFFFF',  // Pure White — light backgrounds, text on dark
  blue:        '#4997D0',  // Celestial Blue — chart series 2
  yellow:      '#FFA300',  // Chrome Yellow — chart series 3
  timberwolf:  '#D9D9D6',  // Timberwolf — gridlines, borders, muted fills
  // Derived
  orangeAlpha: 'rgba(255, 79, 0, 0.15)',  // Orange tint for hover states / highlights
  codGrayLight:'#1E1E1E',  // Slightly lifted card backgrounds on dark
}
```

### Chart Series Order (always)

1. `#FF4F00` — most important / primary
2. `#4997D0` — secondary
3. `#FFA300` — tertiary
4. `#D9D9D6` — supporting / comparison

### Typography (Google Fonts imports)

```
IBM Plex Serif: 400, 600, 700
IBM Plex Sans: 400, 500, 600
IBM Plex Sans Condensed: 400, 700
IBM Plex Mono: 400
```

| Element | Font | Weight | Size | Line-height | Letter-spacing | Transform |
|---|---|---|---|---|---|---|
| Dashboard title | IBM Plex Serif | 700 | 36px | 120% | -0.01em | none |
| Section title | IBM Plex Serif | 600 | 21px | 130% | 0 | none |
| Card title | IBM Plex Sans | 600 | 14px | 140% | 0 | none |
| KPI number | IBM Plex Serif | 700 | 36px | 120% | -0.01em | none |
| KPI label | IBM Plex Sans Condensed | 700 | 11px | 140% | 0.05em | uppercase |
| Chart axis labels | IBM Plex Sans | 400 | 10px | 140% | 0 | none |
| Chart data labels | IBM Plex Serif | 400 | 11px | 140% | 0 | none |
| Body text | IBM Plex Serif | 400 | 11px | 140% | 0 | none |
| Source/footnote | IBM Plex Sans | 400 | 10px | 140% | 0 | none |
| Filter labels | IBM Plex Sans Condensed | 700 | 11px | 140% | 0.05em | uppercase |
| Table header | IBM Plex Sans Condensed | 700 | 11px | 140% | 0.05em | uppercase |
| Table body | IBM Plex Serif | 400 | 12px | 140% | 0 | none |

### Spacing System

Use a 4px base grid. Common values: 4, 8, 12, 16, 24, 32, 48, 64.

### Border & Dividers

- Card borders: `1px solid #D9D9D6` (on white bg) or `1px solid rgba(255,255,255,0.08)` (on dark bg)
- Section dividers: `2px solid #FF4F00` (the orange rule, used sparingly — only between major dashboard sections)
- Card border-radius: `0px` — FAI is angular/modernist, no rounded corners
- Chart gridlines: `#D9D9D6` at 0.5 opacity

### Shadows

None. FAI is flat. No `box-shadow`, no `drop-shadow`, no gradients. Elevation is communicated through color contrast and border, not shadow.

---

## Layout Architecture

The dashboard is a **dark-mode-first** single-page app on Cod Gray (`#121212`), with white-background cards floating on the dark surface. This mirrors FAI's signature dark/light page alternation.

### Overall Structure (top to bottom)

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER BAR (Cod Gray, slightly lighter #1E1E1E)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [FAI Logomark ▶▶]   NASEM Political Donations Dashboard     │   │
│  │                      Source: FEC Schedule A · Updated 2026   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  FILTER BAR ───────────────────────────── [orange 2px rule below]  │
│  │ Academy: [All] [NAS] [NAE] [NAM]                                │
│  │ Confidence: [All] [High only]                                    │
│  │ Cycle: [All] [2026] [2024] [2022] [2020] [...]                  │
│  ──────────────────────────────────────── [orange 2px rule]         │
│                                                                     │
│  KPI ROW (4 cards, white background, full-width grid)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Members  │ │ Donors   │ │ Total $  │ │ High-    │              │
│  │ Searched │ │ Found    │ │ Donated  │ │ Conf $   │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  SECTION: "Donation Patterns" ──────────── [orange rule]           │
│                                                                     │
│  ROW 1: Two charts side by side                                    │
│  ┌────────────────────────┐ ┌────────────────────────┐             │
│  │ Donations Over Time    │ │ Academy Comparison      │             │
│  │ (Area chart by cycle)  │ │ (Grouped bar chart)     │             │
│  └────────────────────────┘ └────────────────────────┘             │
│                                                                     │
│  ROW 2: Two charts side by side                                    │
│  ┌────────────────────────┐ ┌────────────────────────┐             │
│  │ Top Committees         │ │ Top Organizations      │             │
│  │ (Horiz. bar chart)     │ │ (Horiz. bar chart)     │             │
│  └────────────────────────┘ └────────────────────────┘             │
│                                                                     │
│  ROW 3: Full width                                                 │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ Geographic Distribution (US state choropleth)       │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  SECTION: "Member Detail" ──────────────── [orange rule]           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ Searchable/sortable table of members with donations │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  FOOTER                                                            │
│  Source: FEC Schedule A individual contributions                   │
│  Data: NASEM member directories, scraped 2026-04-14               │
│  ▶▶ Foundation for American Innovation                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Header Bar

- Background: `#1E1E1E` (slightly lifted from page Cod Gray)
- Left: FAI double-chevron logomark as inline SVG (white version), 21px tall
- Center-left: "NASEM Political Donations Dashboard" in IBM Plex Serif 700, 24px, white
- Below title: "Source: FEC Schedule A Individual Contributions · NASEM Member Directories" in IBM Plex Sans 400, 10px, `#D9D9D6`
- Height: 80px, flex aligned center, padding 0 32px
- Bottom border: `2px solid #FF4F00`

### 2. Filter Bar

- Background: `#121212` (matches page)
- Pill-style toggle buttons for each filter group
- Inactive pill: border `1px solid rgba(255,255,255,0.2)`, text `#D9D9D6`, bg transparent
- Active pill: bg `#FF4F00`, text `#121212`, font-weight 600, no border
- Hover (inactive): border color `#FF4F00`, text white
- Filter group labels: IBM Plex Sans Condensed Bold 11px, uppercase, letter-spacing 0.05em, color `#D9D9D6`
- Padding: 16px 32px
- Bottom: `2px solid #FF4F00`

### 3. KPI Cards (row of 4)

- Grid: 4 equal columns, gap 16px, margin 24px 32px
- Each card: white background, padding 24px, no border-radius
- Border: `1px solid #D9D9D6`
- KPI number: IBM Plex Serif 700, 36px, `#121212`, line-height 120%
- KPI label below: IBM Plex Sans Condensed Bold 11px, uppercase, `#FF4F00`, letter-spacing 0.05em
- KPI sublabel (optional context): IBM Plex Sans 400, 10px, `#6B6B6B`

**The four KPIs:**

| # | Label | Value | Sublabel |
|---|---|---|---|
| 1 | MEMBERS SEARCHED | count from summary | "across {n} academies" |
| 2 | DONORS IDENTIFIED | count where has_fec_donations=True | "{pct}% of members" |
| 3 | TOTAL CONTRIBUTED | sum of total_amount, formatted $X.XM | "all matched records" |
| 4 | HIGH-CONFIDENCE $ | sum of high_confidence_amount | "employer-verified" |

### 4. Charts — General Rules

All charts sit inside white-background cards with:
- Padding: 24px
- Border: `1px solid #D9D9D6`
- No border-radius
- Chart title: IBM Plex Serif 600, 16px, `#121212`, margin-bottom 4px
- Chart subtitle: IBM Plex Sans 400, 11px, `#6B6B6B`, margin-bottom 16px
- Source line below chart: IBM Plex Sans 400, 10px, `#9B9B9B`, "Source: FEC Schedule A"
- Recharts tooltip: bg `#121212`, border `1px solid #FF4F00`, text white (IBM Plex Sans 400 11px), no border-radius
- Recharts axis ticks: IBM Plex Sans 400, 10px, `#6B6B6B`
- Grid lines: `#D9D9D6`, strokeDasharray="3 3", opacity 0.5

### 5. Chart A — Donations Over Time (AreaChart)

- X-axis: `two_year_transaction_period` (election cycle)
- Y-axis: sum of `contribution_receipt_amount`
- Series: one area per academy (NAS, NAE, NAM) stacked
- Colors: NAS = `#FF4F00`, NAE = `#4997D0`, NAM = `#FFA300`
- Fill opacity: 0.3 for area, 1.0 for stroke
- Legend: bottom, IBM Plex Sans 400 11px
- Behavior: respects all active filters except cycle (since cycle IS the x-axis)

### 6. Chart B — Academy Comparison (BarChart, grouped)

- Three grouped bars per metric
- Metrics on X: "Members", "Donors", "Donor Rate", "Avg Donation"
- One bar per academy, same color coding as Chart A
- Rounded bar tops: `radius={[2, 2, 0, 0]}` (subtle, just 2px)
- Y-axis formatted contextually ($, %, count)

### 7. Chart C — Top Committees (horizontal BarChart)

- Top 10 committees by total $ received
- Horizontal bars, sorted descending
- All bars: `#FF4F00`
- Labels: committee name on y-axis, $ amount at bar end
- Long committee names: truncate to 35 chars + "…"
- Filter out "ACTBLUE" and "WINRED" with a toggle (they are conduit PACs that obscure the real recipients), default OFF (excluded)

### 8. Chart D — Top Organizations (horizontal BarChart)

- Top 10 member organizations by total $ donated
- Same styling as Chart C but bars in `#4997D0`
- Y-axis: org name (truncated to 30 chars)

### 9. Chart E — Geographic Heatmap (US States)

- Full-width card
- US state choropleth using d3-geo (AlbersUSA projection)
- Color scale: white → `#FF4F00` (sequential, linear)
- Metric toggle: "Total $" or "# of Donors"
- State borders: `#D9D9D6` stroke, 0.5px
- Tooltip on hover: state name, value, member count
- States with no data: `#F5F5F5` fill
- Legend: horizontal gradient bar below map, 200px wide, with min/max labels

### 10. Member Detail Table

- Searchable text input: full width, `1px solid #D9D9D6` border, no border-radius, padding 8px 12px, IBM Plex Sans 400 14px
- Search placeholder: "Search by name, organization, or state…"
- Table header row: bg `#121212`, text white, IBM Plex Sans Condensed Bold 11px, uppercase, letter-spacing 0.05em
- Table body rows: alternating `#FFFFFF` and `#F8F8F6`, IBM Plex Serif 400 12px
- Hover row: bg `rgba(255, 79, 0, 0.08)`
- Columns:

| Column | Width | Align | Format |
|---|---|---|---|
| Name | 20% | left | Linked to `profile_url` in `#FF4F00` |
| Academy | 8% | center | Badge pill with academy color |
| Organization | 22% | left | truncate 35 chars |
| State | 10% | left | — |
| Donations | 10% | right | integer |
| Total $ | 12% | right | $X,XXX |
| High-Conf $ | 12% | right | $X,XXX |
| FEC Link | 6% | center | External link icon (lucide `ExternalLink`) in `#4997D0` |

- Sortable on all numeric columns (click header to toggle asc/desc)
- Sort indicator: orange `▲` or `▼` next to active sort column
- Default sort: Total $ descending
- Pagination: 25 rows per page, simple prev/next controls

### 11. Footer

- Background: `#1E1E1E`
- Padding: 24px 32px
- Top border: `2px solid #FF4F00`
- Left: source attribution text, IBM Plex Sans 400, 10px, `#D9D9D6`
- Right: FAI logomark (white, 16px tall) + "Foundation for American Innovation" IBM Plex Sans 400, 10px, `#D9D9D6`

---

## Interaction Design

### Data Loading

1. On mount, prompt user to upload two CSV files via a styled dropzone (or embed file paths)
2. Show a loading state: centered FAI logomark pulsing (opacity animation 0.3 → 1.0, 1.5s ease-in-out infinite)
3. Parse with PapaParse, store in state

### Filter Behavior

- All filters apply globally to all charts and KPIs simultaneously
- Academy filter: multi-select (can pick 1, 2, or all 3)
- Confidence filter: "All" or "High only" (filters donation records to `match_confidence === 'high'`)
- Cycle filter: multi-select across available `two_year_transaction_period` values
- Active filter count shown as orange badge on the filter bar

### Responsive Behavior

- Min-width: 1024px (dashboard is designed for desktop/laptop)
- Chart rows: CSS grid `repeat(2, 1fr)` → collapse to single column below 1200px
- KPI row: `repeat(4, 1fr)` → `repeat(2, 1fr)` below 900px

---

## File Upload Approach

Since this is a React artifact, embed a simple drag-and-drop zone at the top that accepts CSVs. Store parsed data in state. The upload UI should follow FAI styling:

- Dropzone: dashed border `2px dashed rgba(255,79,0,0.4)`, centered text "Drop CSVs here or click to upload"
- On drag-over: border becomes solid `#FF4F00`, bg becomes `rgba(255,79,0,0.05)`
- After upload: dropzone collapses, dashboard renders

---

## Implementation Notes for the Executing Model

1. **DO NOT use rounded corners anywhere.** FAI is angular. `border-radius: 0` on everything except the subtle 2px on bar chart tops.

2. **DO NOT use gradients or shadows.** The brand is flat. Depth comes from the dark page / white card contrast.

3. **DO NOT use any color not listed in the COLORS object.** If you need a gray, use `#D9D9D6` (Timberwolf), `#6B6B6B`, or `#9B9B9B`. No blue-grays, no warm grays outside this range.

4. **The orange is `#FF4F00`, not `#FF6600`, not `#E64A00`, not `#FF5500`.** Get it exactly right.

5. **Typography hierarchy matters.** Every text element has a specific font family + weight + size assigned above. Do not improvise.

6. **Chart tooltips must be dark.** Bg `#121212`, border `#FF4F00`, white text. Never use the Recharts default light tooltip.

7. **All money values use `$X,XXX` formatting.** Over $1M use `$X.XM`. Over $1B use `$X.XB`. Use Intl.NumberFormat.

8. **Academy color mapping is fixed:** NAS = `#FF4F00`, NAE = `#4997D0`, NAM = `#FFA300`. These map to the brand's primary → secondary → tertiary chart series order.

9. **The FAI double-chevron logomark** should be rendered as an inline SVG. It's two right-pointing chevrons (like a fast-forward icon). Approximate with: `<svg viewBox="0 0 24 24"><path d="M5 3l9 9-9 9" stroke="currentColor" strokeWidth="2.5" fill="none"/><path d="M13 3l9 9-9 9" stroke="currentColor" strokeWidth="2.5" fill="none"/></svg>`

10. **Table links** in `#FF4F00` for NASEM profiles, `#4997D0` for FEC external links. Underline on hover only.

11. **US Map**: Fetch the topojson from `https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json`. Use d3.geoAlbersUsa() projection.

12. **Performance**: The donations CSV may reach 50k+ rows. Memoize all computed aggregations with `useMemo`. Don't re-aggregate on every render.

---

## What "Done" Looks Like

The finished dashboard should feel like it belongs in an FAI research publication — dark, authoritative, and precise, with that distinctive orange accent cutting through like a signal flare. It should look like a Bloomberg terminal had a baby with a Swiss design poster. No cuteness, no playfulness, no gratuitous animation. Every pixel earns its place.
