import React, {
  StrictMode,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import Papa from "papaparse";
import _ from "lodash";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  RefreshCcw,
  Search,
  Upload,
} from "lucide-react";
import * as d3 from "d3";
import { feature } from "topojson-client";

const COLORS = {
  orange: "#FF4F00",
  codGray: "#121212",
  white: "#FFFFFF",
  blue: "#4997D0",
  yellow: "#FFA300",
  timberwolf: "#D9D9D6",
  orangeAlpha: "rgba(255, 79, 0, 0.15)",
  codGrayLight: "#1E1E1E",
};

const ACADEMY_ORDER = ["NAS", "NAE", "NAM"];
const ACADEMY_COLORS = {
  NAS: COLORS.orange,
  NAE: COLORS.blue,
  NAM: COLORS.yellow,
};
const PARTY_COLORS = {
  DEM: "#4997D0",
  REP: "#E04040",
  OTH: "#D9D9D6",
};
const PARTY_ORDER = ["DEM", "REP", "OTH"];
const PARTY_LABELS = { DEM: "Democrat", REP: "Republican", OTH: "Other / Unknown" };
const ALL_COMMITTEE_CONDUITS = ["ACTBLUE", "WINRED"];
const PRESIDENTIAL_CYCLES = ["2008", "2010", "2012", "2014", "2016", "2018", "2020", "2022", "2024", "2026"];
const PRESIDENTIAL_ELECTION_CYCLES = ["2008", "2012", "2016", "2020", "2024"];
const PRESIDENTIAL_CANDIDATES = {
  // 2008
  C00431445: { candidate: "Obama", cycle: "2008", party: "DEM" },
  C00431569: { candidate: "McCain", cycle: "2008", party: "REP" },
  // 2012
  C00451393: { candidate: "Romney", cycle: "2012", party: "REP" },
  C00418632: { candidate: "Obama", cycle: "2012", party: "DEM" },
  // 2016
  C00575795: { candidate: "Clinton", cycle: "2016", party: "DEM" },
  C00494740: { candidate: "Clinton", cycle: "2016", party: "DEM" },
  C00544288: { candidate: "Sanders", cycle: "2016", party: "DEM" },
  C00586537: { candidate: "Biden", cycle: "2016", party: "DEM" },  // Biden 2016 exploratory
  // 2020
  C00703975: { candidate: "Biden", cycle: "2020", party: "DEM" },  // Biden for President (renamed later)
  C00709410: { candidate: "Biden", cycle: "2020", party: "DEM" },  // Biden Victory Fund (initially)
  C00582809: { candidate: "Sanders", cycle: "2020", party: "DEM" },
  C00636571: { candidate: "Warren", cycle: "2020", party: "DEM" },
  C00711564: { candidate: "Buttigieg", cycle: "2020", party: "DEM" },
  C00696419: { candidate: "Klobuchar", cycle: "2020", party: "DEM" },
  C00580100: { candidate: "Trump", cycle: "2020", party: "REP" },
  C00618389: { candidate: "Trump", cycle: "2020", party: "REP" },
  C00589820: { candidate: "O'Rourke", cycle: "2020", party: "DEM" },
  // 2024
  C00744946: { candidate: "Harris", cycle: "2024", party: "DEM" },  // Harris Victory Fund
  C00838912: { candidate: "Harris", cycle: "2024", party: "DEM" },  // Harris Action Fund
  C00770941: { candidate: "Trump", cycle: "2024", party: "REP" },
  C00873893: { candidate: "Trump", cycle: "2024", party: "REP" },
  C00828541: { candidate: "DeSantis", cycle: "2024", party: "REP" },
};
// C00703975 was Biden's committee through June 2024, then became Harris's.
// Earmarked donations after 2024-07-01 targeting C00703975 are for Harris.
const C00703975_HARRIS_CUTOVER = "2024-07-01";
const PAGE_SIZE = 25;
const DEFAULT_SORT = { key: "totalAmount", direction: "desc" };
const BUNDLED_DATASET = {
  summaryUrl: `${import.meta.env.BASE_URL}data/nasem_fec_summary.csv`,
  donationsUrl: `${import.meta.env.BASE_URL}data/nasem_fec_donations.csv`,
  statesUrl: `${import.meta.env.BASE_URL}data/states-10m.json`,
};

const STATE_ABBREVIATIONS = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
  "Puerto Rico": "PR",
};

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const wholeCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("en-US");

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;700&family=IBM+Plex+Serif:wght@400;600;700&display=swap');

  :root {
    color: ${COLORS.white};
    background: ${COLORS.codGray};
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  * {
    box-sizing: border-box;
  }

  html, body, #root {
    min-height: 100%;
    margin: 0;
    background: ${COLORS.codGray};
  }

  body {
    font-family: "IBM Plex Serif", serif;
    color: ${COLORS.white};
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  input {
    font: inherit;
  }

  .app-shell {
    min-height: 100vh;
    background: ${COLORS.codGray};
  }

  .page-width {
    width: min(1520px, calc(100vw - 48px));
    margin: 0 auto;
  }

  .header-bar,
  .footer-bar {
    background: ${COLORS.codGrayLight};
    border-top: 0;
    border-bottom: 2px solid ${COLORS.orange};
  }

  .footer-bar {
    border-top: 2px solid ${COLORS.orange};
    border-bottom: 0;
    margin-top: 48px;
  }

  .header-inner,
  .footer-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    min-height: 80px;
    padding: 0 32px;
  }

  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .brand-title {
    font-family: "IBM Plex Serif", serif;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: ${COLORS.white};
    margin: 0;
  }

  .brand-subtitle,
  .footer-copy {
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 10px;
    line-height: 1.4;
    color: ${COLORS.timberwolf};
    margin: 4px 0 0;
  }

  .filter-bar {
    border-bottom: 2px solid ${COLORS.orange};
  }

  .filter-inner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 16px 32px;
  }

  .filter-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-label,
  .eyebrow,
  .kpi-label,
  .table-head-button,
  .badge,
  .chart-chip {
    font-family: "IBM Plex Sans Condensed", sans-serif;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .filter-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-pill,
  .ghost-button,
  .pagination-button,
  .table-head-button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: ${COLORS.timberwolf};
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 0;
    transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
  }

  .filter-pill:hover,
  .ghost-button:hover,
  .pagination-button:hover,
  .table-head-button:hover {
    border-color: ${COLORS.orange};
    color: ${COLORS.white};
  }

  .filter-pill.active,
  .ghost-button.active {
    border-color: ${COLORS.orange};
    background: ${COLORS.orange};
    color: ${COLORS.codGray};
  }

  .filter-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 11px;
    color: ${COLORS.timberwolf};
  }

  .active-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: ${COLORS.orange};
    color: ${COLORS.codGray};
    border: 0;
  }

  .main-content {
    padding: 24px 0 0;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    padding: 0 32px;
  }

  .card,
  .kpi-card {
    background: ${COLORS.white};
    color: ${COLORS.codGray};
    border: 1px solid ${COLORS.timberwolf};
    border-radius: 0;
  }

  .kpi-card {
    padding: 24px;
    min-height: 156px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .kpi-number {
    font-family: "IBM Plex Serif", serif;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin: 0 0 8px;
  }

  .kpi-label {
    color: ${COLORS.orange};
    margin: 0 0 6px;
  }

  .kpi-sublabel {
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 10px;
    line-height: 1.4;
    color: #6B6B6B;
    margin: 0;
  }

  .section-block {
    padding: 32px 32px 0;
  }

  .section-header {
    border-top: 2px solid ${COLORS.orange};
    padding-top: 16px;
    margin-bottom: 20px;
  }

  .section-title {
    font-family: "IBM Plex Serif", serif;
    font-size: 21px;
    font-weight: 600;
    line-height: 1.3;
    color: ${COLORS.white};
    margin: 0;
  }

  .section-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  .card {
    padding: 24px;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .card-title {
    font-family: "IBM Plex Serif", serif;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
    margin: 0 0 4px;
  }

  .card-subtitle,
  .card-source,
  .toolbar-copy,
  .empty-copy,
  .table-meta {
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #6B6B6B;
    margin: 0;
  }

  .card-source {
    color: #9B9B9B;
    margin-top: 12px;
  }

  .chart-shell {
    width: 100%;
    height: 320px;
  }

  .tooltip-shell {
    background: ${COLORS.codGray};
    border: 1px solid ${COLORS.orange};
    color: ${COLORS.white};
    padding: 12px;
    min-width: 180px;
  }

  .tooltip-label {
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: ${COLORS.white};
    margin: 0 0 8px;
  }

  .tooltip-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 11px;
    line-height: 1.4;
  }

  .tooltip-key {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .tooltip-dot {
    width: 8px;
    height: 8px;
    border-radius: 0;
  }

  .table-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid ${COLORS.timberwolf};
    padding: 8px 12px;
    background: ${COLORS.white};
    color: ${COLORS.codGray};
  }

  .search-box input {
    border: 0;
    outline: 0;
    width: 100%;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 14px;
    background: transparent;
    color: ${COLORS.codGray};
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid ${COLORS.timberwolf};
  }

  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 1080px;
  }

  thead tr {
    background: ${COLORS.codGray};
    color: ${COLORS.white};
  }

  th,
  td {
    padding: 12px;
    text-align: left;
    vertical-align: middle;
  }

  tbody tr:nth-child(odd) {
    background: ${COLORS.white};
  }

  tbody tr:nth-child(even) {
    background: #F8F8F6;
  }

  tbody tr:hover {
    background: rgba(255, 79, 0, 0.08);
  }

  .table-head-button {
    border: 0;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: inherit;
  }

  .table-value {
    font-family: "IBM Plex Serif", serif;
    font-size: 12px;
    line-height: 1.4;
    color: ${COLORS.codGray};
  }

  .numeric {
    text-align: right;
  }

  .centered {
    text-align: center;
  }

  .profile-link {
    color: ${COLORS.orange};
  }

  .fec-link {
    color: ${COLORS.blue};
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .profile-link:hover,
  .fec-link:hover {
    text-decoration: underline;
  }

  .academy-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 4px 8px;
    background: ${COLORS.orangeAlpha};
    border: 1px solid currentColor;
    color: ${COLORS.codGray};
    font-family: "IBM Plex Sans Condensed", sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pagination-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .pagination-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .empty-state,
  .loading-state,
  .upload-state {
    width: min(1160px, calc(100vw - 48px));
    margin: 0 auto;
    padding: 48px 0 96px;
  }

  .loading-frame,
  .upload-frame {
    background: ${COLORS.codGrayLight};
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 48px;
    min-height: 360px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
    text-align: center;
  }

  .loading-mark {
    display: inline-flex;
    align-self: center;
    color: ${COLORS.white};
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }

  .loading-title,
  .upload-title {
    font-family: "IBM Plex Serif", serif;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: ${COLORS.white};
    margin: 0;
  }

  .loading-copy,
  .upload-copy {
    max-width: 760px;
    margin: 0 auto;
    font-family: "IBM Plex Serif", serif;
    font-size: 12px;
    line-height: 1.6;
    color: ${COLORS.timberwolf};
  }

  .upload-dropzone {
    border: 2px dashed rgba(255, 79, 0, 0.4);
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .upload-dropzone.active,
  .upload-dropzone:hover {
    border-style: solid;
    border-color: ${COLORS.orange};
    background: rgba(255, 79, 0, 0.05);
  }

  .upload-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }

  .primary-button,
  .secondary-button {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 0;
    cursor: pointer;
    padding: 10px 14px;
  }

  .primary-button {
    background: ${COLORS.orange};
    color: ${COLORS.codGray};
    border: 1px solid ${COLORS.orange};
  }

  .secondary-button {
    background: transparent;
    color: ${COLORS.timberwolf};
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .primary-button:hover,
  .secondary-button:hover {
    border-color: ${COLORS.orange};
    color: ${COLORS.white};
  }

  .primary-button:hover {
    color: ${COLORS.codGray};
  }

  .hidden-input {
    display: none;
  }

  .empty-panel {
    border: 1px solid ${COLORS.timberwolf};
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    color: #6B6B6B;
    background: ${COLORS.white};
  }

  .chart-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .chart-chip {
    border: 1px solid ${COLORS.timberwolf};
    background: transparent;
    color: #6B6B6B;
    padding: 6px 10px;
    cursor: pointer;
  }

  .chart-chip.active {
    background: ${COLORS.orange};
    border-color: ${COLORS.orange};
    color: ${COLORS.codGray};
  }

  .legend-bar {
    width: 200px;
    height: 10px;
    background: linear-gradient(to right, #FFFFFF 0%, ${COLORS.orange} 100%);
    border: 1px solid ${COLORS.timberwolf};
  }

  .map-shell {
    position: relative;
  }

  .map-svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .map-tooltip {
    position: absolute;
    pointer-events: none;
    background: ${COLORS.codGray};
    border: 1px solid ${COLORS.orange};
    padding: 10px 12px;
    color: ${COLORS.white};
    min-width: 180px;
    z-index: 2;
  }

  .map-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .legend-copy {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 10px;
    color: #6B6B6B;
  }

  .table-stats {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .party-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    padding: 3px 8px;
    border: 1px solid currentColor;
    font-family: "IBM Plex Sans Condensed", sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .party-legend {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 8px;
  }

  .party-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 11px;
    color: #6B6B6B;
  }

  .party-dot {
    width: 10px;
    height: 10px;
    border-radius: 0;
  }

  @media (max-width: 1200px) {
    .section-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) {
    .page-width,
    .loading-state,
    .upload-state {
      width: min(100vw - 24px, 100%);
    }

    .header-inner,
    .footer-inner,
    .filter-inner,
    .kpi-grid,
    .section-block {
      padding-left: 20px;
      padding-right: 20px;
    }

    .header-inner,
    .footer-inner,
    .filter-inner,
    .table-controls,
    .table-footer {
      flex-direction: column;
      align-items: flex-start;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .loading-frame,
    .upload-frame {
      padding: 32px 20px;
    }
  }
`;

function installGlobalStyles() {
  const styleId = "nasem-dashboard-styles";
  if (document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = GLOBAL_STYLES;
  document.head.appendChild(style);
}

installGlobalStyles();

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return ["true", "1", "yes", "y"].includes(String(value ?? "").trim().toLowerCase());
}

function sanitizeAcademy(value) {
  const academy = String(value ?? "").trim().toUpperCase();
  return ACADEMY_ORDER.includes(academy) ? academy : academy;
}

function normalizeConfidence(value) {
  return String(value ?? "").trim().toLowerCase() === "high" ? "high" : "medium";
}

function parseCycle(value) {
  const digits = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");
  return digits.length >= 4 ? digits.slice(0, 4) : "";
}

function normalizeStateCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length === 2) {
    return raw.toUpperCase();
  }
  return STATE_ABBREVIATIONS[raw] ?? raw.toUpperCase().slice(0, 2);
}

function buildFecSearchLink(name) {
  if (!name) {
    return "";
  }
  return `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(name)}&min_amount=200`;
}

function formatCurrency(value) {
  return wholeCurrencyFormatter.format(value || 0);
}

function formatCompactCurrency(value) {
  return compactCurrencyFormatter.format(value || 0);
}

function formatKpiCurrency(value) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  return formatCurrency(value);
}

function formatCount(value) {
  return integerFormatter.format(value || 0);
}

function formatPercent(value) {
  return `${(value || 0).toFixed(1)}%`;
}

function truncateLabel(value, maxLength) {
  return _.truncate(value || "Unspecified", { length: maxLength, omission: "…" });
}

function isConduitCommittee(name) {
  const upper = String(name ?? "").toUpperCase();
  return ALL_COMMITTEE_CONDUITS.some((needle) => upper.includes(needle));
}

function parseCsvText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data ?? []),
      error: reject,
    });
  });
}

async function loadCsvRows(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return parseCsvText(await response.text());
}

function normalizeSummaryRows(rows) {
  return rows
    .map((row) => {
      const name = String(row.name ?? row.nasem_name ?? "").trim();
      if (!name) {
        return null;
      }
      return {
        name,
        cleanName: String(row.clean_name ?? "").trim(),
        academy: sanitizeAcademy(row.academy),
        organization: String(row.organization ?? row.nasem_organization ?? row.nasem_org ?? "").trim(),
        state: String(row.state ?? "").trim(),
        hasFecDonations:
          parseBoolean(row.has_fec_donations ?? row.has_fec_records) ||
          parseNumber(row.total_donations ?? row.total_records) > 0,
        totalDonations: parseNumber(row.total_donations ?? row.total_records),
        highConfidenceDonations: parseNumber(
          row.high_confidence_donations ?? row.high_conf_records,
        ),
        totalAmount: parseNumber(row.total_amount),
        highConfidenceAmount: parseNumber(
          row.high_confidence_amount ?? row.high_conf_amount,
        ),
        profileUrl: String(row.profile_url ?? row.nasem_profile ?? "").trim(),
        fecSearchLink: String(
          row.fec_search_link ?? row.fec_link ?? buildFecSearchLink(name),
        ).trim(),
      };
    })
    .filter(Boolean);
}

function normalizeDonationRows(rows) {
  return rows
    .map((row) => {
      const nasemName = String(row.nasem_name ?? "").trim();
      const contributorName = String(
        row.contributor_name ?? row.fec_name ?? "",
      ).trim();
      if (!nasemName || !contributorName) {
        return null;
      }
      return {
        nasemName,
        academy: sanitizeAcademy(row.academy),
        nasemOrganization: String(
          row.nasem_organization ?? row.nasem_org ?? "",
        ).trim(),
        nasemProfile: String(row.nasem_profile ?? row.profile_url ?? "").trim(),
        matchConfidence: normalizeConfidence(row.match_confidence),
        contributorName,
        contributorEmployer: String(
          row.contributor_employer ?? row.fec_employer ?? "",
        ).trim(),
        committeeName: String(row.committee_name ?? "").trim() || "Unspecified Committee",
        committeeId: String(row.committee_id ?? "").trim(),
        earmarkCommitteeId: String(row.earmark_committee_id ?? "").trim(),
        party: (() => {
          const p = String(row.party ?? "").trim().toUpperCase();
          if (p === "DEM" || p === "DFL") return "DEM";
          if (p === "REP") return "REP";
          return p || "";
        })(),
        amount: parseNumber(
          row.contribution_receipt_amount ?? row.amount,
        ),
        date: String(row.contribution_receipt_date ?? row.date ?? "").trim(),
        cycle: parseCycle(row.two_year_transaction_period ?? row.cycle),
        contributorState: normalizeStateCode(
          row.contributor_state ?? row.fec_state,
        ),
        fecLink: String(
          row.fec_link ?? buildFecSearchLink(contributorName),
        ).trim(),
      };
    })
    .filter((row) => row && row.amount > 0);
}

function buildSummaryRowsFromDonations(rows) {
  return _.orderBy(
    Object.entries(_.groupBy(rows, "nasemName")).map(([name, donationRows]) => {
      const first = donationRows[0] ?? {};
      const highRows = donationRows.filter((row) => row.matchConfidence === "high");
      return {
        name,
        clean_name: name,
        academy: first.academy ?? "",
        organization: first.nasemOrganization ?? "",
        state: "",
        has_fec_donations: "true",
        total_donations: String(donationRows.length),
        high_confidence_donations: String(highRows.length),
        total_amount: String(_.sumBy(donationRows, "amount")),
        high_confidence_amount: String(_.sumBy(highRows, "amount")),
        profile_url: first.nasemProfile ?? "",
        fec_search_link: buildFecSearchLink(name),
      };
    }),
    [(row) => parseNumber(row.total_amount), (row) => row.name],
    ["desc", "asc"],
  );
}

function inferFileKind(rows) {
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  const headers = Object.keys(firstRow).map((key) => key.trim().toLowerCase());
  const headerSet = new Set(headers);
  if (
    headerSet.has("contributor_name") ||
    headerSet.has("fec_name") ||
    headerSet.has("committee_name")
  ) {
    return "donations";
  }
  if (
    headerSet.has("total_amount") &&
    (headerSet.has("name") || headerSet.has("nasem_name"))
  ) {
    return "summary";
  }
  return null;
}

function inferFileKindFromName(fileName) {
  const lower = String(fileName ?? "").toLowerCase();
  if (lower.includes("summary")) {
    return "summary";
  }
  if (lower.includes("donation")) {
    return "donations";
  }
  return null;
}

function enrichSummary(summaryRows, donationRows) {
  const profileByName = new Map();
  donationRows.forEach((row) => {
    if (row.nasemProfile && !profileByName.has(row.nasemName)) {
      profileByName.set(row.nasemName, row.nasemProfile);
    }
  });

  return summaryRows.map((row) => ({
    ...row,
    profileUrl: row.profileUrl || profileByName.get(row.name) || "",
  }));
}

function FaiMark({ size = 24, color = "currentColor" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      style={{ display: "block", color }}
    >
      <path d="M5 3L14 12L5 21" stroke="currentColor" strokeWidth="2.5" />
      <path d="M13 3L22 12L13 21" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function TooltipShell({ label, rows }) {
  if (!rows.length) {
    return null;
  }
  return (
    <div className="tooltip-shell">
      {label ? <p className="tooltip-label">{label}</p> : null}
      {rows.map((row) => (
        <div className="tooltip-row" key={row.key}>
          <span className="tooltip-key">
            {row.color ? (
              <span className="tooltip-dot" style={{ background: row.color }} />
            ) : null}
            <span>{row.label}</span>
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function AreaTooltip({ active, label, payload }) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <TooltipShell
      label={`Cycle ${label}`}
      rows={payload.map((item) => ({
        key: item.dataKey,
        color: item.stroke,
        label: item.name,
        value: formatCurrency(item.value),
      }))}
    />
  );
}

function BarTooltip({ active, label, payload }) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <TooltipShell
      label={label}
      rows={payload.map((item) => ({
        key: item.dataKey,
        color: item.fill,
        label: item.name,
        value: formatCurrency(item.value),
      }))}
    />
  );
}

function ComparisonTooltip({ active, payload, academies = ACADEMY_ORDER }) {
  if (!active || !payload?.length) {
    return null;
  }
  const datum = payload[0].payload;
  return (
    <TooltipShell
      label={datum.metric}
      rows={academies
        .filter((academy) => datum[`${academy}Raw`] !== undefined)
        .map((academy) => ({
        key: academy,
        color: ACADEMY_COLORS[academy],
        label: academy,
        value: datum.formatter(datum[`${academy}Raw`]),
      }))}
    />
  );
}

function PartyAreaTooltip({ active, label, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell
      label={`Cycle ${label}`}
      rows={payload.map((item) => ({
        key: item.dataKey,
        color: PARTY_COLORS[item.dataKey] || item.stroke,
        label: PARTY_LABELS[item.dataKey] || item.dataKey,
        value: formatCurrency(item.value),
      }))}
    />
  );
}

function PartyBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <TooltipShell
      label={item.payload.label}
      rows={[{
        key: "amount",
        color: PARTY_COLORS[item.payload.party] || COLORS.timberwolf,
        label: PARTY_LABELS[item.payload.party] || "Total",
        value: formatCurrency(item.value),
      }]}
    />
  );
}

function CandidateTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const d = item.payload;
  return (
    <TooltipShell
      label={`${d.candidate} (${d.cycle})`}
      rows={[{
        key: "amount",
        color: PARTY_COLORS[d.party] || COLORS.timberwolf,
        label: PARTY_LABELS[d.party] || d.party,
        value: formatCurrency(item.value),
      }]}
    />
  );
}

function ConduitTooltip({ active, label, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell
      label={`${label} Cycle`}
      rows={payload.map((item) => ({
        key: item.dataKey,
        color: item.dataKey === "ActBlue" ? PARTY_COLORS.DEM : PARTY_COLORS.REP,
        label: item.dataKey,
        value: formatCurrency(item.value),
      }))}
    />
  );
}

function ChartCard({ title, subtitle, controls, children, source = "Source: FEC Schedule A" }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">{title}</h3>
          <p className="card-subtitle">{subtitle}</p>
        </div>
        {controls ? <div className="chart-toolbar">{controls}</div> : null}
      </div>
      {children}
      <p className="card-source">{source}</p>
    </div>
  );
}

function EmptyPanel({ copy }) {
  return (
    <div className="empty-panel">
      <p className="empty-copy">{copy}</p>
    </div>
  );
}

function KpiCard({ label, value, sublabel }) {
  return (
    <div className="kpi-card">
      <div>
        <p className="kpi-number">{value}</p>
      </div>
      <div>
        <p className="kpi-label">{label}</p>
        <p className="kpi-sublabel">{sublabel}</p>
      </div>
    </div>
  );
}

function LoadingView({ copy }) {
  return (
    <div className="loading-state">
      <div className="loading-frame">
        <span className="loading-mark">
          <FaiMark size={72} />
        </span>
        <h1 className="loading-title">Loading the dashboard</h1>
        <p className="loading-copy">{copy}</p>
      </div>
    </div>
  );
}

function UploadView({ onFilesSelected, onLoadBundled, message, canLoadBundled }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const readFiles = (fileList) => {
    const files = Array.from(fileList ?? []);
    if (files.length) {
      onFilesSelected(files);
    }
  };

  return (
    <div className="upload-state">
      <div className="upload-frame">
        <span className="loading-mark">
          <FaiMark size={72} />
        </span>
        <h1 className="upload-title">NASEM Political Donations Dashboard</h1>
        <p className="upload-copy">
          Drop a donations CSV, or upload both summary and donations CSVs, or load
          the normalized bundled dataset. The dashboard accepts both the dashboard
          contract files and the legacy lookup exports already present in this folder.
        </p>
        <label
          className={`upload-dropzone ${isDragging ? "active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            readFiles(event.dataTransfer.files);
          }}
        >
          <Upload size={24} />
          <strong>Drop CSVs here or click to upload</strong>
          <span className="toolbar-copy">
            A donations CSV alone is enough; summary data will be derived if needed.
          </span>
          <input
            ref={inputRef}
            className="hidden-input"
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(event) => {
              readFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <div className="upload-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} />
            Select CSV files
          </button>
          {canLoadBundled ? (
            <button type="button" className="secondary-button" onClick={onLoadBundled}>
              <Database size={16} />
              Load bundled dataset
            </button>
          ) : null}
        </div>
        {message ? <p className="upload-copy">{message}</p> : null}
      </div>
    </div>
  );
}

function UsMap({ features, stateData, metricLabel }) {
  const [hovered, setHovered] = useState(null);

  const projection = useMemo(() => {
    if (!features.length) {
      return null;
    }
    return d3.geoAlbersUsa().fitSize(
      [960, 600],
      { type: "FeatureCollection", features },
    );
  }, [features]);

  const pathGenerator = useMemo(
    () => (projection ? d3.geoPath(projection) : null),
    [projection],
  );

  const maxValue = useMemo(
    () => d3.max(Array.from(stateData.values()), (entry) => entry.value) ?? 0,
    [stateData],
  );

  const colorScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, maxValue || 1])
        .range(["#FFFFFF", COLORS.orange]),
    [maxValue],
  );

  if (!features.length || !pathGenerator) {
    return <EmptyPanel copy="State topology is unavailable. Add the bundled states file to render the choropleth." />;
  }

  return (
    <div className="map-shell">
      {hovered ? (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(hovered.x + 16, window.innerWidth - 220),
            top: Math.max(hovered.y - 24, 0),
          }}
        >
          <p className="tooltip-label">{hovered.name}</p>
          <div className="tooltip-row">
            <span>{metricLabel}</span>
            <strong>{hovered.value}</strong>
          </div>
          <div className="tooltip-row">
            <span>Member count</span>
            <strong>{hovered.memberCount}</strong>
          </div>
        </div>
      ) : null}
      <svg className="map-svg" viewBox="0 0 960 600">
        {features.map((state) => {
          const abbr = STATE_ABBREVIATIONS[state.properties.name];
          const datum = stateData.get(abbr) ?? { value: 0, memberCount: 0 };
          return (
            <path
              key={state.properties.name}
              d={pathGenerator(state)}
              fill={datum.value > 0 ? colorScale(datum.value) : "#F5F5F5"}
              stroke={COLORS.timberwolf}
              strokeWidth={0.5}
              onMouseMove={(event) =>
                setHovered({
                  x: event.clientX,
                  y: event.clientY,
                  name: state.properties.name,
                  value:
                    metricLabel === "Total $"
                      ? formatCurrency(datum.value)
                      : formatCount(datum.value),
                  memberCount: formatCount(datum.memberCount),
                })
              }
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>
      <div className="map-footer">
        <div className="legend-copy">
          <span>Low</span>
          <div className="legend-bar" />
          <span>High</span>
        </div>
        <p className="toolbar-copy">
          States without matched donors are shown in off-white.
        </p>
      </div>
    </div>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [donationRows, setDonationRows] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("Preparing bundled CSVs and state geometry.");
  const [datasetLabel, setDatasetLabel] = useState("Bundled dataset");
  const [selectedAcademies, setSelectedAcademies] = useState(ACADEMY_ORDER);
  const [selectedCycles, setSelectedCycles] = useState([]);
  const [confidenceMode, setConfidenceMode] = useState("all");
  const [includeConduits, setIncludeConduits] = useState(false);
  const [mapMetric, setMapMetric] = useState("amount");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState(DEFAULT_SORT);
  const [pageIndex, setPageIndex] = useState(0);

  const deferredSearch = useDeferredValue(searchQuery);

  useEffect(() => {
    let alive = true;
    d3
      .json(BUNDLED_DATASET.statesUrl)
      .then((topology) => {
        if (!alive || !topology?.objects?.states) {
          return;
        }
        setFeatures(feature(topology, topology.objects.states).features);
      })
      .catch(() => {
        if (alive) {
          setFeatures([]);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const commitDataset = (nextSummaryRows, nextDonationRows, label) => {
    const normalizedDonations = normalizeDonationRows(nextDonationRows);
    const normalizedSummary = enrichSummary(
      normalizeSummaryRows(nextSummaryRows),
      normalizedDonations,
    );
    const availableAcademies = ACADEMY_ORDER.filter((academy) =>
      normalizedSummary.some((row) => row.academy === academy),
    );
    const cycles = _.orderBy(
      _.uniq(normalizedDonations.map((row) => row.cycle).filter(Boolean)),
      [(cycle) => Number(cycle)],
      ["desc"],
    );

    startTransition(() => {
      setSummaryRows(normalizedSummary);
      setDonationRows(normalizedDonations);
      setDatasetLabel(label);
      setSelectedAcademies(availableAcademies.length ? availableAcademies : ACADEMY_ORDER);
      setSelectedCycles(cycles);
      setConfidenceMode("all");
      setIncludeConduits(false);
      setMapMetric("amount");
      setSearchQuery("");
      setSortConfig(DEFAULT_SORT);
      setPageIndex(0);
      setLoadState("ready");
      setStatusMessage("");
    });
  };

  const loadBundledData = async () => {
    setLoadState("loading");
    setStatusMessage("Loading normalized dashboard data from public/data.");
    try {
      const [summary, donations] = await Promise.all([
        loadCsvRows(BUNDLED_DATASET.summaryUrl),
        loadCsvRows(BUNDLED_DATASET.donationsUrl),
      ]);
      commitDataset(summary, donations, "Bundled dataset");
    } catch (error) {
      setLoadState("needs-files");
      setStatusMessage(
        "Bundled CSVs were not available from /public/data. Upload the files or run the local dev server.",
      );
    }
  };

  useEffect(() => {
    loadBundledData();
  }, []);

  const handleUploadedFiles = async (files) => {
    setLoadState("loading");
    setStatusMessage("Parsing uploaded CSVs.");

    try {
      const parsed = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          rows: await parseCsvText(await file.text()),
        })),
      );

      let summary = null;
      let donations = null;
      parsed.forEach((file) => {
        const kind = inferFileKind(file.rows) ?? inferFileKindFromName(file.name);
        if (kind === "summary") {
          summary = file.rows;
        }
        if (kind === "donations") {
          donations = file.rows;
        }
      });

      if (!donations) {
        throw new Error("A donations CSV is required.");
      }

      const normalizedDonations = normalizeDonationRows(donations);
      const summaryRows =
        summary ?? buildSummaryRowsFromDonations(normalizedDonations);

      commitDataset(
        summaryRows,
        donations,
        summary ? "Uploaded dataset" : "Uploaded donations CSV",
      );
    } catch (error) {
      setLoadState("needs-files");
      setStatusMessage(error.message);
    }
  };

  const availableCycles = useMemo(
    () =>
      _.orderBy(
        _.uniq(donationRows.map((row) => row.cycle).filter(Boolean)),
        [(cycle) => Number(cycle)],
        ["desc"],
      ),
    [donationRows],
  );

  const selectedAcademySet = useMemo(
    () => new Set(selectedAcademies),
    [selectedAcademies],
  );
  const visibleAcademies = useMemo(
    () => ACADEMY_ORDER.filter((academy) => selectedAcademySet.has(academy)),
    [selectedAcademySet],
  );
  const selectedCycleSet = useMemo(
    () => new Set(selectedCycles.length ? selectedCycles : availableCycles),
    [selectedCycles, availableCycles],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedAcademies.length !== ACADEMY_ORDER.length) {
      count += 1;
    }
    if (confidenceMode !== "all") {
      count += 1;
    }
    if (selectedCycles.length && selectedCycles.length !== availableCycles.length) {
      count += 1;
    }
    return count;
  }, [availableCycles.length, confidenceMode, selectedAcademies.length, selectedCycles.length]);

  const selectedMembers = useMemo(
    () => summaryRows.filter((row) => selectedAcademySet.has(row.academy)),
    [selectedAcademySet, summaryRows],
  );

  const donationsBase = useMemo(
    () =>
      donationRows.filter(
        (row) =>
          selectedAcademySet.has(row.academy) &&
          (confidenceMode === "all" || row.matchConfidence === "high"),
      ),
    [confidenceMode, donationRows, selectedAcademySet],
  );

  const filteredDonations = useMemo(
    () => donationsBase.filter((row) => selectedCycleSet.has(row.cycle)),
    [donationsBase, selectedCycleSet],
  );

  const chartCommitteesDonations = useMemo(
    () =>
      filteredDonations.filter(
        (row) => includeConduits || !isConduitCommittee(row.committeeName),
      ),
    [filteredDonations, includeConduits],
  );

  const memberStats = useMemo(() => {
    const byMember = new Map(
      selectedMembers.map((member) => [
        member.name,
        {
          ...member,
          totalDonations: 0,
          highConfidenceDonations: 0,
          totalAmount: 0,
          highConfidenceAmount: 0,
        },
      ]),
    );

    filteredDonations.forEach((row) => {
      if (!byMember.has(row.nasemName)) {
        byMember.set(row.nasemName, {
          name: row.nasemName,
          cleanName: row.nasemName,
          academy: row.academy,
          organization: row.nasemOrganization,
          state: "",
          hasFecDonations: true,
          totalDonations: 0,
          highConfidenceDonations: 0,
          totalAmount: 0,
          highConfidenceAmount: 0,
          profileUrl: row.nasemProfile,
          fecSearchLink: buildFecSearchLink(row.contributorName),
        });
      }
      const current = byMember.get(row.nasemName);
      current.totalDonations += 1;
      current.totalAmount += row.amount;
      current.hasFecDonations = true;
      if (row.matchConfidence === "high") {
        current.highConfidenceDonations += 1;
        current.highConfidenceAmount += row.amount;
      }
      if (!current.profileUrl && row.nasemProfile) {
        current.profileUrl = row.nasemProfile;
      }
      if (!current.organization && row.nasemOrganization) {
        current.organization = row.nasemOrganization;
      }
    });

    return Array.from(byMember.values());
  }, [filteredDonations, selectedMembers]);

  const donorRows = useMemo(
    () => memberStats.filter((row) => row.totalDonations > 0),
    [memberStats],
  );

  const kpis = useMemo(() => {
    const membersSearched = selectedMembers.length;
    const donorsIdentified = donorRows.length;
    const donorRate = membersSearched ? (donorsIdentified / membersSearched) * 100 : 0;
    const totalAmount = _.sumBy(memberStats, "totalAmount");
    const highConfidenceAmount = _.sumBy(memberStats, "highConfidenceAmount");
    const academyCount = _.uniq(selectedMembers.map((row) => row.academy)).length;

    return {
      membersSearched,
      donorsIdentified,
      donorRate,
      totalAmount,
      highConfidenceAmount,
      academyCount,
    };
  }, [donorRows.length, memberStats, selectedMembers]);

  const donationsOverTimeData = useMemo(() => {
    const grouped = _.groupBy(donationsBase.filter((row) => row.cycle), "cycle");
    return _.orderBy(
      Object.entries(grouped).map(([cycle, rows]) => ({
        cycle,
        NAS: _.sumBy(rows.filter((row) => row.academy === "NAS"), "amount"),
        NAE: _.sumBy(rows.filter((row) => row.academy === "NAE"), "amount"),
        NAM: _.sumBy(rows.filter((row) => row.academy === "NAM"), "amount"),
      })),
      [(row) => Number(row.cycle)],
      ["asc"],
    );
  }, [donationsBase]);

  const comparisonData = useMemo(() => {
    const metrics = [
      {
        key: "members",
        metric: "Members",
        formatter: formatCount,
        accessor: (academy) =>
          selectedMembers.filter((row) => row.academy === academy).length,
      },
      {
        key: "donors",
        metric: "Donors",
        formatter: formatCount,
        accessor: (academy) =>
          donorRows.filter((row) => row.academy === academy).length,
      },
      {
        key: "rate",
        metric: "Donor Rate",
        formatter: formatPercent,
        accessor: (academy) => {
          const members = selectedMembers.filter((row) => row.academy === academy).length;
          const donors = donorRows.filter((row) => row.academy === academy).length;
          return members ? (donors / members) * 100 : 0;
        },
      },
      {
        key: "average",
        metric: "Avg Donation",
        formatter: formatCurrency,
        accessor: (academy) => {
          const donors = donorRows.filter((row) => row.academy === academy);
          return donors.length ? _.sumBy(donors, "totalAmount") / donors.length : 0;
        },
      },
    ];

    return metrics.map((metric) => {
      const raw = Object.fromEntries(
        visibleAcademies.map((academy) => [academy, metric.accessor(academy)]),
      );
      const max = Math.max(...Object.values(raw), 1);
      return {
        metric: metric.metric,
        formatter: metric.formatter,
        ...Object.fromEntries(
          visibleAcademies.map((academy) => [academy, ((raw[academy] ?? 0) / max) * 100]),
        ),
        ...Object.fromEntries(
          visibleAcademies.map((academy) => [`${academy}Raw`, raw[academy] ?? 0]),
        ),
      };
    });
  }, [donorRows, selectedMembers, visibleAcademies]);

  const topCommittees = useMemo(
    () =>
      _.orderBy(
        Object.entries(_.groupBy(chartCommitteesDonations, "committeeName")).map(
          ([committeeName, rows]) => {
            const parties = _.countBy(rows, "party");
            const dominant = Object.entries(parties).sort((a, b) => b[1] - a[1])[0];
            const party = dominant ? dominant[0] : "";
            return {
              committeeName: truncateLabel(committeeName, 35),
              fullCommitteeName: committeeName,
              amount: _.sumBy(rows, "amount"),
              party: party === "DEM" || party === "REP" ? party : "OTH",
            };
          },
        ),
        ["amount"],
        ["desc"],
      ).slice(0, 10),
    [chartCommitteesDonations],
  );

  const topOrganizations = useMemo(
    () =>
      _.orderBy(
        Object.entries(_.groupBy(filteredDonations, "nasemOrganization")).map(
          ([organization, rows]) => ({
            organization: truncateLabel(organization || "Independent / Unknown", 30),
            fullOrganization: organization || "Independent / Unknown",
            amount: _.sumBy(rows, "amount"),
          }),
        ),
        ["amount"],
        ["desc"],
      ).slice(0, 10),
    [filteredDonations],
  );

  const stateMapData = useMemo(() => {
    const grouped = _.groupBy(filteredDonations.filter((row) => row.contributorState), "contributorState");
    return new Map(
      Object.entries(grouped).map(([state, rows]) => [
        state,
        {
          value:
            mapMetric === "amount"
              ? _.sumBy(rows, "amount")
              : _.uniq(rows.map((row) => row.nasemName)).length,
          memberCount: _.uniq(rows.map((row) => row.nasemName)).length,
        },
      ]),
    );
  }, [filteredDonations, mapMetric]);

  const partyBreakdownData = useMemo(() => {
    const buckets = { DEM: 0, REP: 0, OTH: 0 };
    filteredDonations.forEach((row) => {
      if (row.party === "DEM") buckets.DEM += row.amount;
      else if (row.party === "REP") buckets.REP += row.amount;
      else buckets.OTH += row.amount;
    });
    return PARTY_ORDER.map((party) => ({
      party,
      label: PARTY_LABELS[party],
      amount: buckets[party],
    }));
  }, [filteredDonations]);

  const partyOverTimeData = useMemo(() => {
    const grouped = _.groupBy(donationsBase.filter((row) => row.cycle), "cycle");
    return _.orderBy(
      Object.entries(grouped).map(([cycle, rows]) => {
        const dem = _.sumBy(rows.filter((r) => r.party === "DEM"), "amount");
        const rep = _.sumBy(rows.filter((r) => r.party === "REP"), "amount");
        const oth = _.sumBy(rows.filter((r) => r.party !== "DEM" && r.party !== "REP"), "amount");
        return { cycle, DEM: dem, REP: rep, OTH: oth };
      }),
      [(row) => Number(row.cycle)],
      ["asc"],
    );
  }, [donationsBase]);

  const presidentialCandidateData = useMemo(() => {
    const candidateTotals = {};
    filteredDonations.forEach((row) => {
      // Check earmark target first (for ActBlue/WinRed conduit donations),
      // then fall back to direct committee_id
      const earmarkId = row.earmarkCommitteeId || "";
      const directId = row.committeeId;
      let info = PRESIDENTIAL_CANDIDATES[earmarkId] || PRESIDENTIAL_CANDIDATES[directId];
      if (!info) return;

      // C00703975 was Biden's committee but transferred to Harris in July 2024.
      // Use the donation date to attribute correctly.
      if ((earmarkId === "C00703975" || directId === "C00703975") && info.candidate === "Biden") {
        const date = row.date || "";
        if (date >= C00703975_HARRIS_CUTOVER) {
          info = { candidate: "Harris", cycle: "2024", party: "DEM" };
        }
      }

      const key = `${info.candidate} (${info.cycle})`;
      if (!candidateTotals[key]) {
        candidateTotals[key] = {
          candidate: info.candidate,
          cycle: info.cycle,
          party: info.party,
          label: `${info.candidate} '${info.cycle.slice(2)}`,
          amount: 0,
        };
      }
      candidateTotals[key].amount += row.amount;
    });
    return _.orderBy(Object.values(candidateTotals), ["cycle", "amount"], ["asc", "desc"]);
  }, [filteredDonations]);

  const conduitData = useMemo(() => {
    const ACTBLUE_ID = "C00401224";
    const WINRED_ID = "C00694323";
    const grouped = _.groupBy(
      filteredDonations.filter(
        (r) => r.committeeId === ACTBLUE_ID || r.committeeId === WINRED_ID,
      ),
      "cycle",
    );
    const cycles = _.orderBy(Object.keys(grouped), [(c) => Number(c)], ["asc"]);
    return cycles.map((cycle) => {
      const rows = grouped[cycle];
      const ab = rows.filter((r) => r.committeeId === ACTBLUE_ID);
      const wr = rows.filter((r) => r.committeeId === WINRED_ID);
      return {
        cycle,
        ActBlue: _.sumBy(ab, "amount"),
        WinRed: _.sumBy(wr, "amount"),
        actblueCount: ab.length,
        winredCount: wr.length,
      };
    });
  }, [filteredDonations]);

  const searchableRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const rows = donorRows.filter((row) => {
      if (!query) {
        return true;
      }
      return [row.name, row.organization, row.state]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return _.orderBy(
      rows,
      [(row) => row[sortConfig.key] ?? 0, (row) => row.name],
      [sortConfig.direction, "asc"],
    );
  }, [deferredSearch, donorRows, sortConfig]);

  useEffect(() => {
    setPageIndex(0);
  }, [deferredSearch, sortConfig, selectedAcademies, selectedCycles, confidenceMode]);

  const totalPages = Math.max(1, Math.ceil(searchableRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () =>
      searchableRows.slice(
        pageIndex * PAGE_SIZE,
        pageIndex * PAGE_SIZE + PAGE_SIZE,
      ),
    [pageIndex, searchableRows],
  );

  const datasetUpdated = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  const toggleAcademy = (academy) => {
    setSelectedAcademies((current) => {
      const exists = current.includes(academy);
      if (exists && current.length === 1) {
        return current;
      }
      const next = exists
        ? current.filter((item) => item !== academy)
        : [...current, academy];
      return _.sortBy(next, (item) => ACADEMY_ORDER.indexOf(item));
    });
  };

  const toggleCycle = (cycle) => {
    setSelectedCycles((current) => {
      const exists = current.includes(cycle);
      if (exists && current.length === 1) {
        return current;
      }
      const next = exists
        ? current.filter((item) => item !== cycle)
        : [...current, cycle];
      return _.orderBy(next, [(item) => Number(item)], ["desc"]);
    });
  };

  const setSort = (key) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "desc" ? "asc" : "desc",
        };
      }
      return { key, direction: "desc" };
    });
  };

  if (loadState === "loading") {
    return <LoadingView copy={statusMessage} />;
  }

  if (loadState === "needs-files") {
    return (
      <UploadView
        onFilesSelected={handleUploadedFiles}
        onLoadBundled={loadBundledData}
        message={statusMessage}
        canLoadBundled
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="header-bar">
        <div className="page-width header-inner">
          <div className="brand-lockup">
            <FaiMark size={28} />
            <div>
              <h1 className="brand-title">NASEM Political Donations Dashboard</h1>
              <p className="brand-subtitle">
                Source: FEC Schedule A Individual Contributions · NASEM Member
                Directories · Updated {datasetUpdated}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="filter-bar">
        <div className="page-width filter-inner">
          <div className="filter-groups">
            <div className="filter-group">
              <span className="filter-label">Academy</span>
              <div className="filter-pill-row">
                <button
                  type="button"
                  className={`filter-pill ${selectedAcademies.length === ACADEMY_ORDER.length ? "active" : ""}`}
                  onClick={() => setSelectedAcademies(ACADEMY_ORDER)}
                >
                  All
                </button>
                {ACADEMY_ORDER.map((academy) => (
                  <button
                    key={academy}
                    type="button"
                    className={`filter-pill ${selectedAcademies.includes(academy) ? "active" : ""}`}
                    onClick={() => toggleAcademy(academy)}
                  >
                    {academy}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Confidence</span>
              <div className="filter-pill-row">
                <button
                  type="button"
                  className={`filter-pill ${confidenceMode === "all" ? "active" : ""}`}
                  onClick={() => setConfidenceMode("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-pill ${confidenceMode === "high" ? "active" : ""}`}
                  onClick={() => setConfidenceMode("high")}
                >
                  High only
                </button>
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Cycle</span>
              <div className="filter-pill-row">
                <button
                  type="button"
                  className={`filter-pill ${selectedCycles.length === availableCycles.length ? "active" : ""}`}
                  onClick={() => setSelectedCycles(availableCycles)}
                >
                  All
                </button>
                {availableCycles.map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    className={`filter-pill ${selectedCycleSet.has(cycle) ? "active" : ""}`}
                    onClick={() => toggleCycle(cycle)}
                  >
                    {cycle}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-summary">
            <span className="active-count">{activeFilterCount}</span>
            <span>
              <Filter size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
              {datasetLabel}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              Upload CSVs
            </button>
            <button type="button" className="ghost-button" onClick={loadBundledData}>
              <RefreshCcw size={14} />
              Reload bundled data
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(event) => {
            handleUploadedFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      <main className="page-width main-content">
        <section className="kpi-grid">
          <KpiCard
            label="Members Searched"
            value={formatCount(kpis.membersSearched)}
            sublabel={`across ${formatCount(kpis.academyCount)} academies`}
          />
          <KpiCard
            label="Donors Identified"
            value={formatCount(kpis.donorsIdentified)}
            sublabel={`${formatPercent(kpis.donorRate)} of members`}
          />
          <KpiCard
            label="Total Contributed"
            value={formatKpiCurrency(kpis.totalAmount)}
            sublabel="all matched records"
          />
          <KpiCard
            label="High-Confidence $"
            value={formatKpiCurrency(kpis.highConfidenceAmount)}
            sublabel="employer-verified"
          />
        </section>

        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">Donation Patterns</h2>
          </div>

          <div className="section-grid">
            <ChartCard
              title="Donations Over Time"
              subtitle="Stacked area view of matched contribution amounts by election cycle and academy."
            >
              {donationsOverTimeData.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={donationsOverTimeData}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis dataKey="cycle" tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }} />
                      <YAxis
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <Tooltip content={<AreaTooltip />} />
                      <Legend wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 11 }} />
                      {visibleAcademies.map((academy) => (
                        <Area
                          key={academy}
                          type="monotone"
                          dataKey={academy}
                          name={academy}
                          stackId="donations"
                          stroke={ACADEMY_COLORS[academy]}
                          fill={ACADEMY_COLORS[academy]}
                          fillOpacity={0.3}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="No donation records match the current academy and confidence filters." />
              )}
            </ChartCard>

            <ChartCard
              title="Academy Comparison"
              subtitle="Grouped comparison across four metrics. Each metric column is scaled within itself so the academy spread stays legible."
            >
              {comparisonData.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} barGap={12}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis dataKey="metric" tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }} />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip content={<ComparisonTooltip academies={visibleAcademies} />} />
                      {visibleAcademies.map((academy) => (
                        <Bar
                          key={academy}
                          dataKey={academy}
                          name={academy}
                          fill={ACADEMY_COLORS[academy]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="Academy comparison becomes available once members and donations are loaded." />
              )}
            </ChartCard>

            <ChartCard
              title="Top Committees"
              subtitle="Top receiving committees by total matched dollars under the current filters."
              controls={
                <>
                  <button
                    type="button"
                    className={`chart-chip ${!includeConduits ? "active" : ""}`}
                    onClick={() => setIncludeConduits(false)}
                  >
                    Exclude ACTBLUE / WINRED
                  </button>
                  <button
                    type="button"
                    className={`chart-chip ${includeConduits ? "active" : ""}`}
                    onClick={() => setIncludeConduits(true)}
                  >
                    Include conduits
                  </button>
                </>
              }
            >
              {topCommittees.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCommittees} layout="vertical" margin={{ left: 8, right: 32 }}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="committeeName"
                        width={180}
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="amount" name="Total $" radius={[0, 2, 2, 0]}>
                        {topCommittees.map((entry, idx) => (
                          <Cell key={idx} fill={PARTY_COLORS[entry.party] || COLORS.orange} />
                        ))}
                        <LabelList
                          dataKey="amount"
                          position="right"
                          formatter={(value) => formatCurrency(value)}
                          style={{ fill: COLORS.codGray, fontSize: 11, fontFamily: "IBM Plex Serif" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="No committee records match the current filters." />
              )}
            </ChartCard>

            <ChartCard
              title="Top Organizations"
              subtitle="Member organizations associated with the largest total matched donation amounts."
            >
              {topOrganizations.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topOrganizations} layout="vertical" margin={{ left: 8, right: 32 }}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="organization"
                        width={180}
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="amount" name="Total $" fill={COLORS.blue} radius={[0, 2, 2, 0]}>
                        <LabelList
                          dataKey="amount"
                          position="right"
                          formatter={(value) => formatCurrency(value)}
                          style={{ fill: COLORS.codGray, fontSize: 11, fontFamily: "IBM Plex Serif" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="Organization totals appear when donation rows are available." />
              )}
            </ChartCard>

            <div className="full-width">
              <ChartCard
                title="Geographic Distribution"
                subtitle="Contributor-state choropleth using matched donor locations."
                controls={
                  <>
                    <button
                      type="button"
                      className={`chart-chip ${mapMetric === "amount" ? "active" : ""}`}
                      onClick={() => setMapMetric("amount")}
                    >
                      Total $
                    </button>
                    <button
                      type="button"
                      className={`chart-chip ${mapMetric === "donors" ? "active" : ""}`}
                      onClick={() => setMapMetric("donors")}
                    >
                      # of Donors
                    </button>
                  </>
                }
              >
                <UsMap
                  features={features}
                  stateData={stateMapData}
                  metricLabel={mapMetric === "amount" ? "Total $" : "# of Donors"}
                />
              </ChartCard>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">Political Destination</h2>
          </div>

          <div className="section-grid">
            <ChartCard
              title="Donations by Party"
              subtitle="Total matched contributions grouped by recipient party affiliation."
            >
              {partyBreakdownData.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={partyBreakdownData} layout="vertical" margin={{ left: 8, right: 48 }}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={130}
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                      />
                      <Tooltip content={<PartyBarTooltip />} />
                      <Bar dataKey="amount" name="Total $" radius={[0, 2, 2, 0]}>
                        {partyBreakdownData.map((entry) => (
                          <Cell key={entry.party} fill={PARTY_COLORS[entry.party]} />
                        ))}
                        <LabelList
                          dataKey="amount"
                          position="right"
                          formatter={(value) => formatCurrency(value)}
                          style={{ fill: COLORS.codGray, fontSize: 11, fontFamily: "IBM Plex Serif" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="No donation records match the current filters." />
              )}
            </ChartCard>

            <ChartCard
              title="Party Donations Over Time"
              subtitle="Stacked area view of contribution amounts by party affiliation across election cycles."
            >
              {partyOverTimeData.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={partyOverTimeData}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis dataKey="cycle" tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }} />
                      <YAxis
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <Tooltip content={<PartyAreaTooltip />} />
                      <Legend
                        wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 11 }}
                        formatter={(value) => PARTY_LABELS[value] || value}
                      />
                      <Area type="monotone" dataKey="DEM" name="DEM" stackId="party" stroke={PARTY_COLORS.DEM} fill={PARTY_COLORS.DEM} fillOpacity={0.3} />
                      <Area type="monotone" dataKey="REP" name="REP" stackId="party" stroke={PARTY_COLORS.REP} fill={PARTY_COLORS.REP} fillOpacity={0.3} />
                      <Area type="monotone" dataKey="OTH" name="OTH" stackId="party" stroke={PARTY_COLORS.OTH} fill={PARTY_COLORS.OTH} fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="No donation records match the current filters." />
              )}
            </ChartCard>

            <div className="full-width">
              <ChartCard
                title="Presidential Candidate Donations"
                subtitle="Matched donations to identified presidential candidate committees, grouped by election cycle."
              >
                {presidentialCandidateData.length ? (
                  <div className="chart-shell" style={{ height: Math.max(320, presidentialCandidateData.length * 36) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={presidentialCandidateData} layout="vertical" margin={{ left: 8, right: 48 }}>
                        <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                        <XAxis
                          type="number"
                          tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                          tickFormatter={(value) => formatCompactCurrency(value)}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={130}
                          tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        />
                        <Tooltip content={<CandidateTooltip />} />
                        <Bar dataKey="amount" name="Total $" radius={[0, 2, 2, 0]}>
                          {presidentialCandidateData.map((entry, idx) => (
                            <Cell key={idx} fill={PARTY_COLORS[entry.party] || COLORS.timberwolf} />
                          ))}
                          <LabelList
                            dataKey="amount"
                            position="right"
                            formatter={(value) => formatCurrency(value)}
                            style={{ fill: COLORS.codGray, fontSize: 11, fontFamily: "IBM Plex Serif" }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyPanel copy="No presidential candidate donations found under the current filters." />
                )}
              </ChartCard>
            </div>

            <ChartCard
              title="ActBlue vs WinRed"
              subtitle="Donations routed through the two major online fundraising conduits, by election cycle."
            >
              {conduitData.length ? (
                <div className="chart-shell" style={{ height: 340 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conduitData} margin={{ left: 8, right: 48 }}>
                      <CartesianGrid stroke={COLORS.timberwolf} strokeDasharray="3 3" opacity={0.5} />
                      <XAxis
                        dataKey="cycle"
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                      />
                      <YAxis
                        tick={{ fill: "#6B6B6B", fontSize: 10, fontFamily: "IBM Plex Sans" }}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <Tooltip content={<ConduitTooltip />} />
                      <Legend
                        wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 11 }}
                      />
                      <Bar dataKey="ActBlue" name="ActBlue" fill={PARTY_COLORS.DEM} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="WinRed" name="WinRed" fill={PARTY_COLORS.REP} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel copy="No conduit donations found under the current filters." />
              )}
            </ChartCard>
          </div>
        </section>

        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">Member Detail</h2>
          </div>

          <div className="card">
            <div className="table-controls">
              <label className="search-box">
                <Search size={16} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, organization, or state…"
                />
              </label>
              <p className="table-meta">
                {formatCount(searchableRows.length)} members with matched donations under the
                current filters.
              </p>
            </div>

            <div className="table-wrap">
              <table>
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      ["name", "Name", "left"],
                      ["academy", "Academy", "center"],
                      ["organization", "Organization", "left"],
                      ["state", "State", "left"],
                      ["totalDonations", "Donations", "right"],
                      ["totalAmount", "Total $", "right"],
                      ["highConfidenceAmount", "High-Conf $", "right"],
                      ["links", "FEC Link", "center"],
                    ].map(([key, label, align]) => (
                      <th key={key} className={align === "right" ? "numeric" : align === "center" ? "centered" : ""}>
                        {key === "links" ? (
                          <span className="table-head-button">{label}</span>
                        ) : (
                          <button
                            type="button"
                            className="table-head-button"
                            onClick={() => setSort(key)}
                          >
                            <span>{label}</span>
                            {sortConfig.key === key ? (
                              <span>{sortConfig.direction === "desc" ? "▲" : "▼"}</span>
                            ) : null}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length ? (
                    pagedRows.map((row) => (
                      <tr key={row.name}>
                        <td className="table-value">
                          {row.profileUrl ? (
                            <a className="profile-link" href={row.profileUrl} target="_blank" rel="noreferrer">
                              {row.name}
                            </a>
                          ) : (
                            row.name
                          )}
                        </td>
                        <td className="centered">
                          <span
                            className="academy-badge"
                            style={{
                              color: ACADEMY_COLORS[row.academy] || COLORS.codGray,
                              background:
                                row.academy === "NAS"
                                  ? "rgba(255, 79, 0, 0.15)"
                                  : row.academy === "NAE"
                                    ? "rgba(73, 151, 208, 0.15)"
                                    : "rgba(255, 163, 0, 0.18)",
                            }}
                          >
                            {row.academy}
                          </span>
                        </td>
                        <td className="table-value">{truncateLabel(row.organization, 35)}</td>
                        <td className="table-value">{row.state || "—"}</td>
                        <td className="table-value numeric">{formatCount(row.totalDonations)}</td>
                        <td className="table-value numeric">{formatCurrency(row.totalAmount)}</td>
                        <td className="table-value numeric">{formatCurrency(row.highConfidenceAmount)}</td>
                        <td className="centered">
                          {row.fecSearchLink ? (
                            <a className="fec-link" href={row.fecSearchLink} target="_blank" rel="noreferrer">
                              <ExternalLink size={16} />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="table-value centered" colSpan={8}>
                        No members match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <div className="table-stats table-meta">
                <span>Page {Math.min(pageIndex + 1, totalPages)} of {totalPages}</span>
                <span>·</span>
                <span>{formatCount(searchableRows.length)} rows</span>
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
                  disabled={pageIndex === 0}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() =>
                    setPageIndex((value) => Math.min(totalPages - 1, value + 1))
                  }
                  disabled={pageIndex >= totalPages - 1}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer-bar">
        <div className="page-width footer-inner">
          <div>
            <p className="footer-copy">
              Source: FEC Schedule A individual contributions · Data: NASEM member
              directories, scraped 2026-04-14 · Active dataset: {datasetLabel}
            </p>
            <p className="footer-copy">
              Data available upon request · Based on publicly available information
              from the FEC and NASEM
            </p>
          </div>
          <div className="brand-lockup">
            <FaiMark size={18} />
            <p className="footer-copy">Foundation for American Innovation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
