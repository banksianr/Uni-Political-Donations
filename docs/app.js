const SVG_NS = "http://www.w3.org/2000/svg";
const SUBSET_KEYS = ["top_150", "top_25", "top_10"];
const METRIC_OPTIONS = [
  { key: "amount", label: "Donation Dollars" },
  { key: "donors", label: "Unique Donors" },
];

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const integerNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const decimalNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const state = {
  subsetKey: "top_150",
  metric: "amount",
};

const elements = {
  pageTitle: document.querySelector("#page-title"),
  pageSubtitle: document.querySelector("#page-subtitle"),
  methodologyNotes: document.querySelector("#methodology-notes"),
  subsetToggle: document.querySelector("#subset-toggle"),
  metricToggle: document.querySelector("#metric-toggle"),
  statsGrid: document.querySelector("#stats-grid"),
  chartTitle: document.querySelector("#chart-title"),
  chartRoot: document.querySelector("#chart-root"),
  insightHeadline: document.querySelector("#insight-headline"),
  insightBody: document.querySelector("#insight-body"),
  snapshotHeadline: document.querySelector("#snapshot-headline"),
  snapshotBody: document.querySelector("#snapshot-body"),
  leadersDem: document.querySelector("#leaders-dem"),
  leadersRep: document.querySelector("#leaders-rep"),
  leaders2024Dem: document.querySelector("#leaders-2024-dem"),
  leaders2024Rep: document.querySelector("#leaders-2024-rep"),
  downloadsList: document.querySelector("#downloads-list"),
};

let dashboardData = null;

function metricFields(metric) {
  return metric === "amount"
    ? { dem: "amount_dem", rep: "amount_rep", noun: "dollars", title: "Donation Dollars" }
    : { dem: "donors_dem", rep: "donors_rep", noun: "donors", title: "Unique Donors" };
}

function partyWord(party) {
  return party === "DEM" ? "Democratic" : "Republican";
}

function formatCurrency(value, compact = false) {
  if (compact) {
    return `$${compactNumber.format(value)}`;
  }
  return `$${integerNumber.format(Math.round(value))}`;
}

function formatCount(value, compact = false) {
  return compact ? compactNumber.format(value) : integerNumber.format(Math.round(value));
}

function formatMetricValue(value, metric, compact = false) {
  return metric === "amount" ? formatCurrency(value, compact) : formatCount(value, compact);
}

function formatPercent(value) {
  return decimalNumber.format(value);
}

function formatRatio(high, low) {
  if (low <= 0) {
    return "n/a";
  }
  const ratio = high / low;
  return `${decimalNumber.format(ratio)}x`;
}

function formatMultiple(current, baseline) {
  if (baseline <= 0) {
    return null;
  }
  return formatRatio(current, baseline);
}

function createButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = isActive ? "is-active" : "";
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
  button.addEventListener("click", onClick);
  return button;
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function getSubset() {
  return dashboardData.subsets[state.subsetKey];
}

function getSubsetMembers(subsetKey) {
  const count = dashboardData.subsets[subsetKey].count;
  return new Set(dashboardData.schools.slice(0, count).map((row) => row.institution));
}

function getSeries() {
  return [...getSubset().series].sort((a, b) => a.cycle - b.cycle);
}

function getOverallInstitutionRows() {
  const members = getSubsetMembers(state.subsetKey);
  return dashboardData.institution_overall
    .filter((row) => members.has(row.institution))
    .map((row) => ({
      institution: row.institution,
      party: row.party,
      total: Number(row.total),
      rank: Number(row.rank_2025),
    }));
}

function getInstitutionCycleRows() {
  const members = getSubsetMembers(state.subsetKey);
  return dashboardData.institution_by_cycle
    .filter((row) => members.has(row.institution))
    .map((row) => ({
      institution: row.institution,
      party: row.party,
      cycle: Number(row.cycle),
      total: Number(row.total),
      rank: Number(row.rank_2025),
    }));
}

function getLeaders(rows, party, limit = 5) {
  return rows
    .filter((row) => row.party === party)
    .sort((a, b) => b.total - a.total || a.rank - b.rank || a.institution.localeCompare(b.institution))
    .slice(0, limit);
}

function getPeakSeriesPoint(series, metric) {
  const fields = metricFields(metric);
  let peak = { cycle: series[0].cycle, party: "DEM", value: Number(series[0][fields.dem]) };
  for (const row of series) {
    const demValue = Number(row[fields.dem]);
    const repValue = Number(row[fields.rep]);
    if (demValue > peak.value) {
      peak = { cycle: row.cycle, party: "DEM", value: demValue };
    }
    if (repValue > peak.value) {
      peak = { cycle: row.cycle, party: "REP", value: repValue };
    }
  }
  return peak;
}

function renderNotes() {
  clearChildren(elements.methodologyNotes);
  for (const note of dashboardData.notes) {
    const chip = document.createElement("span");
    chip.textContent = note;
    elements.methodologyNotes.appendChild(chip);
  }
}

function renderControls() {
  clearChildren(elements.subsetToggle);
  clearChildren(elements.metricToggle);

  for (const subsetKey of SUBSET_KEYS) {
    const subset = dashboardData.subsets[subsetKey];
    elements.subsetToggle.appendChild(
      createButton(subset.label, state.subsetKey === subsetKey, () => {
        state.subsetKey = subsetKey;
        renderControls();
        renderDashboard();
      })
    );
  }

  for (const option of METRIC_OPTIONS) {
    elements.metricToggle.appendChild(
      createButton(option.label, state.metric === option.key, () => {
        state.metric = option.key;
        renderControls();
        renderDashboard();
      })
    );
  }
}

function renderStatCards(series) {
  clearChildren(elements.statsGrid);

  const fields = metricFields(state.metric);
  const latest = series[series.length - 1];
  const latestDem = Number(latest[fields.dem]);
  const latestRep = Number(latest[fields.rep]);
  const totalLatest = latestDem + latestRep;
  const peak = getPeakSeriesPoint(series, state.metric);
  const leadingParty = latestDem >= latestRep ? "DEM" : "REP";
  const leadingValue = leadingParty === "DEM" ? latestDem : latestRep;
  const trailingValue = leadingParty === "DEM" ? latestRep : latestDem;

  const cards = [
    {
      label: `2024 DEM ${fields.title}`,
      value: formatMetricValue(latestDem, state.metric, true),
      note: `${formatPercent((latestDem / totalLatest) * 100)}% of the 2024 total`,
      className: "stat-card stat-card--dem panel",
    },
    {
      label: `2024 REP ${fields.title}`,
      value: formatMetricValue(latestRep, state.metric, true),
      note: `${formatPercent((latestRep / totalLatest) * 100)}% of the 2024 total`,
      className: "stat-card stat-card--rep panel",
    },
    {
      label: "2024 Party Balance",
      value: `${leadingParty} ${formatRatio(leadingValue, trailingValue)}`,
      note: `${leadingParty} led by ${formatMetricValue(leadingValue - trailingValue, state.metric, true)}`,
      className: "stat-card panel",
    },
    {
      label: "Peak Cycle",
      value: String(peak.cycle),
      note: `${peak.party} reached ${formatMetricValue(peak.value, state.metric, true)}`,
      className: "stat-card panel",
    },
  ];

  for (const card of cards) {
    const wrapper = document.createElement("article");
    wrapper.className = card.className;

    const label = document.createElement("p");
    label.className = "stat-card__label";
    label.textContent = card.label;

    const value = document.createElement("div");
    value.className = "stat-card__value";
    value.textContent = card.value;

    const note = document.createElement("p");
    note.className = "stat-card__note";
    note.textContent = card.note;

    wrapper.append(label, value, note);
    elements.statsGrid.appendChild(wrapper);
  }
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }
  const exponent = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / exponent;
  if (fraction <= 1) {
    return exponent;
  }
  if (fraction <= 2) {
    return 2 * exponent;
  }
  if (fraction <= 2.5) {
    return 2.5 * exponent;
  }
  if (fraction <= 5) {
    return 5 * exponent;
  }
  return 10 * exponent;
}

function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildAreaPath(points, baselineY) {
  const line = buildLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function renderChart(series) {
  clearChildren(elements.chartRoot);

  const fields = metricFields(state.metric);
  const width = 1000;
  const height = 430;
  const margin = { top: 24, right: 96, bottom: 52, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    ...series.flatMap((row) => [Number(row[fields.dem]), Number(row[fields.rep])]),
    0
  );
  const step = niceStep(maxValue / 4);
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = [];

  for (let value = 0; value <= yMax + step / 2; value += step) {
    ticks.push(value);
  }

  const xForIndex = (index) =>
    margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const yForValue = (value) => margin.top + innerHeight - (value / yMax) * innerHeight;

  const demPoints = series.map((row, index) => ({
    cycle: row.cycle,
    x: xForIndex(index),
    y: yForValue(Number(row[fields.dem])),
    value: Number(row[fields.dem]),
  }));
  const repPoints = series.map((row, index) => ({
    cycle: row.cycle,
    x: xForIndex(index),
    y: yForValue(Number(row[fields.rep])),
    value: Number(row[fields.rep]),
  }));

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${fields.title} over time for ${getSubset().label}`,
  });

  const guideLine = createSvgElement("line", {
    class: "hover-guide",
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: margin.top + innerHeight,
  });

  for (const tick of ticks) {
    const y = yForValue(tick);
    svg.appendChild(
      createSvgElement("line", {
        class: "grid-line",
        x1: margin.left,
        x2: margin.left + innerWidth,
        y1: y,
        y2: y,
      })
    );

    const tickLabel = createSvgElement("text", {
      class: "tick-label",
      x: margin.left - 12,
      y: y + 4,
      "text-anchor": "end",
    });
    tickLabel.textContent = formatMetricValue(tick, state.metric, true);
    svg.appendChild(tickLabel);
  }

  svg.appendChild(
    createSvgElement("line", {
      class: "axis-line",
      x1: margin.left,
      x2: margin.left + innerWidth,
      y1: margin.top + innerHeight,
      y2: margin.top + innerHeight,
    })
  );

  for (const point of demPoints) {
    const tickLabel = createSvgElement("text", {
      class: "tick-label",
      x: point.x,
      y: margin.top + innerHeight + 28,
      "text-anchor": "middle",
    });
    tickLabel.textContent = String(point.cycle);
    svg.appendChild(tickLabel);
  }

  svg.appendChild(
    createSvgElement("path", {
      class: "area-dem",
      d: buildAreaPath(demPoints, margin.top + innerHeight),
    })
  );
  svg.appendChild(
    createSvgElement("path", {
      class: "area-rep",
      d: buildAreaPath(repPoints, margin.top + innerHeight),
    })
  );
  svg.appendChild(
    createSvgElement("path", {
      class: "line-dem",
      d: buildLinePath(demPoints),
    })
  );
  svg.appendChild(
    createSvgElement("path", {
      class: "line-rep",
      d: buildLinePath(repPoints),
    })
  );

  for (const point of demPoints) {
    svg.appendChild(
      createSvgElement("circle", {
        class: "point-dem",
        cx: point.x,
        cy: point.y,
        r: 5.5,
      })
    );
  }

  for (const point of repPoints) {
    svg.appendChild(
      createSvgElement("circle", {
        class: "point-rep",
        cx: point.x,
        cy: point.y,
        r: 5.5,
      })
    );
  }

  const lastDem = demPoints[demPoints.length - 1];
  const lastRep = repPoints[repPoints.length - 1];
  const demOffset = lastDem.y <= lastRep.y ? -10 : 18;
  const repOffset = lastRep.y <= lastDem.y ? -10 : 18;

  const demLabel = createSvgElement("text", {
    class: "line-label line-label--dem",
    x: lastDem.x + 12,
    y: lastDem.y + demOffset,
  });
  demLabel.textContent = "DEM";
  svg.appendChild(demLabel);

  const repLabel = createSvgElement("text", {
    class: "line-label line-label--rep",
    x: lastRep.x + 12,
    y: lastRep.y + repOffset,
  });
  repLabel.textContent = "REP";
  svg.appendChild(repLabel);

  svg.appendChild(guideLine);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";

  function hideTooltip() {
    tooltip.classList.remove("is-visible");
    guideLine.style.opacity = "0";
  }

  function showTooltip(event, index) {
    const demPoint = demPoints[index];
    const repPoint = repPoints[index];
    const rect = elements.chartRoot.getBoundingClientRect();
    tooltip.innerHTML = [
      `<div class="chart-tooltip__title">${series[index].cycle}</div>`,
      `<div class="chart-tooltip__row"><span class="chart-tooltip__label">DEM</span><strong>${formatMetricValue(
        demPoint.value,
        state.metric
      )}</strong></div>`,
      `<div class="chart-tooltip__row"><span class="chart-tooltip__label">REP</span><strong>${formatMetricValue(
        repPoint.value,
        state.metric
      )}</strong></div>`,
    ].join("");
    tooltip.classList.add("is-visible");
    guideLine.setAttribute("x1", demPoint.x);
    guideLine.setAttribute("x2", demPoint.x);
    guideLine.style.opacity = "1";

    const tooltipWidth = 180;
    const left = Math.max(12, Math.min(event.clientX - rect.left + 18, rect.width - tooltipWidth - 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = "16px";
  }

  demPoints.forEach((point, index) => {
    const previousX = index === 0 ? margin.left : (demPoints[index - 1].x + point.x) / 2;
    const nextX =
      index === demPoints.length - 1 ? margin.left + innerWidth : (point.x + demPoints[index + 1].x) / 2;
    const band = createSvgElement("rect", {
      class: "hover-band",
      x: previousX,
      y: margin.top,
      width: nextX - previousX,
      height: innerHeight,
    });
    band.addEventListener("mouseenter", (event) => showTooltip(event, index));
    band.addEventListener("mousemove", (event) => showTooltip(event, index));
    band.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(band);
  });

  elements.chartRoot.append(svg, tooltip);
}

function renderInsights(series) {
  const fields = metricFields(state.metric);
  const latest = series[series.length - 1];
  const totalDem = series.reduce((sum, row) => sum + Number(row[fields.dem]), 0);
  const totalRep = series.reduce((sum, row) => sum + Number(row[fields.rep]), 0);
  const peak = getPeakSeriesPoint(series, state.metric);
  const peakShare = peak.party === "DEM" ? (peak.value / totalDem) * 100 : (peak.value / totalRep) * 100;

  elements.insightHeadline.textContent = `${peak.cycle} reset the baseline`;
  elements.insightBody.textContent =
    `${partyWord(peak.party)} ${fields.noun} peaked at ${formatMetricValue(peak.value, state.metric, true)} ` +
    `in ${peak.cycle} for the ${getSubset().label.toLowerCase()}. ` +
    `That one cycle accounts for ${formatPercent(peakShare)}% of all ${partyWord(peak.party).toLowerCase()} ${fields.noun} in the 2008-2024 series.`;

  const leaders2024 = getLeaders(
    getInstitutionCycleRows().filter((row) => row.cycle === latest.cycle),
    "DEM",
    1
  );
  const leaders2024Rep = getLeaders(
    getInstitutionCycleRows().filter((row) => row.cycle === latest.cycle),
    "REP",
    1
  );
  const topDem = leaders2024[0];
  const topRep = leaders2024Rep[0];
  const cycle2016 = series.find((row) => row.cycle === 2016) || series[0];
  const demLift = formatMultiple(Number(latest[fields.dem]), Number(cycle2016[fields.dem]));
  const repLift = formatMultiple(Number(latest[fields.rep]), Number(cycle2016[fields.rep]));
  const amountShareDem = (Number(latest.amount_dem) / (Number(latest.amount_dem) + Number(latest.amount_rep))) * 100;

  elements.snapshotHeadline.textContent = `2024 leaders: ${topDem.institution} and ${topRep.institution}`;
  elements.snapshotBody.textContent =
    `By dollars, ${topDem.institution} led Democratic giving in 2024 with ${formatCurrency(topDem.total, true)}, ` +
    `while ${topRep.institution} led Republican giving with ${formatCurrency(topRep.total, true)}. ` +
    `Democrats captured ${formatPercent(amountShareDem)}% of 2024 dollars in this cohort, and 2024 ${fields.noun} stayed ` +
    `${demLift ? `${demLift} of the 2016 Democratic level` : "above the 2016 Democratic level"} ` +
    `${repLift ? `while Republicans were at ${repLift} of their 2016 level.` : "while Republicans also remained above 2016."}`;
}

function renderLeaderList(target, rows, qualifier) {
  clearChildren(target);
  for (const row of rows) {
    const item = document.createElement("li");
    const institution = document.createElement("strong");
    institution.textContent = row.institution;
    const detail = document.createElement("span");
    detail.textContent = `${formatCurrency(row.total, true)} ${qualifier} · Rank #${row.rank}`;
    item.append(institution, detail);
    target.appendChild(item);
  }
}

function renderLeaders() {
  const overallRows = getOverallInstitutionRows();
  const cycleRows = getInstitutionCycleRows().filter((row) => row.cycle === 2024);

  renderLeaderList(elements.leadersDem, getLeaders(overallRows, "DEM"), "total");
  renderLeaderList(elements.leadersRep, getLeaders(overallRows, "REP"), "total");
  renderLeaderList(elements.leaders2024Dem, getLeaders(cycleRows, "DEM"), "in 2024");
  renderLeaderList(elements.leaders2024Rep, getLeaders(cycleRows, "REP"), "in 2024");
}

function renderDownloads() {
  clearChildren(elements.downloadsList);
  for (const item of dashboardData.downloads) {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = `./data/${item.file}`;
    link.textContent = item.label;
    link.title = item.file;
    listItem.appendChild(link);
    elements.downloadsList.appendChild(listItem);
  }
}

function renderDashboard() {
  const subset = getSubset();
  const series = getSeries();
  const fields = metricFields(state.metric);
  elements.chartTitle.textContent = `${fields.title} Over Time · ${subset.label}`;
  renderStatCards(series);
  renderChart(series);
  renderInsights(series);
  renderLeaders();
}

function renderError(error) {
  elements.pageSubtitle.textContent =
    "The dashboard data did not load. Serve the docs folder over HTTP or through GitHub Pages.";
  clearChildren(elements.chartRoot);
  const message = document.createElement("p");
  message.textContent = error instanceof Error ? error.message : "Unknown dashboard load error";
  elements.chartRoot.appendChild(message);
}

async function loadDashboard() {
  const response = await fetch("./data/dashboard-data.json");
  if (!response.ok) {
    throw new Error(`Could not load dashboard-data.json (${response.status})`);
  }
  return response.json();
}

async function main() {
  try {
    dashboardData = await loadDashboard();
    elements.pageTitle.textContent = dashboardData.title;
    elements.pageSubtitle.textContent = dashboardData.subtitle;
    renderNotes();
    renderControls();
    renderDownloads();
    renderDashboard();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

main();
