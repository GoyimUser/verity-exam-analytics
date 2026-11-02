/* Centralized UI strings, Gregorian persistence, and a single API/scoring path for both modes. */
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const S = {
  settings: {},
  analytics: { count: 0, summary: {} },
  exams: [],
  subjects: [],
  charts: {},
  view: "overview",
  filters: {},
  sort: "exam_date",
  direction: "desc",
  selected: null,
};
const L = TRANSLATIONS;
const t = (k) => L[S.settings.language === "fa" ? "fa" : "en"][k] || k;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const api = async (path, opts = {}) => {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let e;
    try {
      e = await r.json();
    } catch {
      e = { detail: r.statusText };
    }
    throw Error(
      Array.isArray(e.detail)
        ? e.detail.map((x) => `${x.loc?.at(-1) || ""}: ${x.msg}`).join("; ")
        : e.detail || "Request failed",
    );
  }
  return r.status === 204 ? null : r.json();
};
function isFa() {
  return S.settings.language === "fa";
}
function digits() {
  return isFa() && S.settings.persian_digits !== "latin" ? "fa-IR" : "en-US";
}
function n(v, opts = {}) {
  if (typeof opts === "number") opts = { digits: opts };
  return v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat(digits(), {
        maximumFractionDigits: opts.digits ?? 1,
        minimumFractionDigits: opts.fixed ? (opts.digits ?? 1) : 0,
      }).format(v);
}
function pct(v) {
  return v === null || v === undefined ? "—" : `${n(v)}${isFa() ? "٪" : "%"}`;
}
function dateDisplay(iso) {
  return isFa()
    ? Jalali.format(iso, S.settings.persian_digits)
    : new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${iso}T00:00:00Z`));
}
function filterDateValue(key) {
  const value = S.filters[key] || "";
  return isFa() && value
    ? Jalali.format(value, S.settings.persian_digits)
    : value;
}
function filterDateInput(key, id) {
  const attrs = isFa()
    ? `type="text" class="localized-date" placeholder="${t("dateHint")}"`
    : 'type="date"';
  return `<input ${attrs} id="${id}" value="${filterDateValue(key)}">`;
}
function monthDisplay(month) {
  return month;
}
function chart(id, opt) {
  const el = $("#" + id);
  if (!el) return;
  if (S.charts[id]) S.charts[id].dispose();
  const st = getComputedStyle(document.documentElement),
    c = {
      text: st.getPropertyValue("--text").trim(),
      muted: st.getPropertyValue("--muted").trim(),
      line: st.getPropertyValue("--line").trim(),
      panel: st.getPropertyValue("--panel").trim(),
      accent: st.getPropertyValue("--accent").trim(),
      accent2: st.getPropertyValue("--accent2").trim(),
      red: st.getPropertyValue("--red").trim(),
      yellow: st.getPropertyValue("--yellow").trim(),
    };
  const description = chartDescription(el, opt);
  const q = echarts.init(el);
  S.charts[id] = q;
  q.setOption({
    aria: { enabled: true, label: { description }, decal: { show: true } },
    animation: !matchMedia("(prefers-reduced-motion:reduce)").matches,
    textStyle: { fontFamily: isFa() ? "Vazirmatn, Manrope" : "Manrope" },
    animationDuration: 350,
    ...opt,
  });
  return q;
}
function empty(id) {
  const e = $("#" + id);
  if (e) e.innerHTML = `<div class="empty">${t("noRecords")}</div>`;
}
function toast(msg, bad = false) {
  if (bad) msg = errorText(msg);
  const e = $("#toast");
  clearTimeout(S.toastTimer);
  e.textContent = msg;
  e.className = bad ? "show error" : "show";
  const local = $("#modal-root .dialog-status");
  if (local) local.textContent = msg;
  S.toastTimer = setTimeout(() => {
    e.className = "";
    e.textContent = "";
  }, 6000);
}
function nav() {
  const inQuickMode = S.settings.application_mode === "quick",
    quick = inQuickMode && S.view === "quick";
  const views = inQuickMode
    ? ["quick", "study"]
    : ["overview", "history", "analytics", "subjects", "study", "reports"];
  return `<a class="skip-link" href="#main-content">${t("skip")}</a><div class="app-shell ${quick ? "quick-shell" : ""}"><button id="nav-backdrop" class="nav-backdrop" tabindex="-1" aria-label="${t("closeNav")}" hidden></button><aside class="sidebar" id="sidebar"><button class="icon-btn nav-close" id="nav-close" aria-label="${t("closeNav")}">${icon("close")}</button><div class="brand"><div class="brand-mark">V</div><div><b>Verity</b><span>${t("brand")}</span></div></div><nav aria-label="${t("brand")}">${views.map((v) => `<button class="nav-item ${S.view === v ? "active" : ""}" data-view="${v}">${icon(v === "quick" ? "add" : v)}<span>${t(v)}</span></button>`).join("")}</nav><div class="side-footer"><button class="quiet-btn" id="locale-btn">${icon("language")}<span>${t("language")}: ${isFa() ? "فارسی" : "English"}</span></button><button class="quiet-btn" id="theme-btn">${icon("theme")}<span>${t("appearance")}</span></button><button class="quiet-btn" data-view="settings">${icon("settings")}<span>${t("settings")}</span></button></div></aside><main class="main" id="main-content" tabindex="-1"><header class="topbar"><button id="menu-btn" class="icon-btn" aria-label="${t("menu")}" aria-controls="sidebar" aria-expanded="false">${icon("menu")}</button><div class="breadcrumb"><span>${quick ? t("quick") : t(S.view)}</span><small>${quick ? t("quickSub") : t("advancedSub")}</small></div><div class="top-actions">${!quick && S.view === "overview" ? `<button class="outline-btn" id="filter-btn" aria-controls="filters" aria-expanded="${!!S.filtersOpen}">${icon("filter")}${t("filter")}</button>` : ""}${["settings", "study"].includes(S.view) ? "" : `<button class="primary-btn" id="add-btn">${icon("add")}${t("add")}</button>`}</div></header>${S.view === "study" ? "" : scopeBar()}${quick ? quickView() : advancedView()}</main></div>`;
}
function quickView() {
  const a = S.analytics,
    s = a.summary || {},
    recent = S.exams.slice(0, 6);
  return `<section class="quick-page"><div class="quick-hero"><div><p class="eyebrow">${t("quick").toUpperCase()}</p><h1>${t("quickTitle")}</h1><p>${t("quickSub")}</p></div></div><div class="quick-grid"><article class="panel quick-form"><h2>${t("add")}</h2><form id="quick-form"><label>${t("name")}<input name="title" required autofocus></label><label>${t("date")}<input name="exam_date" class="localized-date" required placeholder="${isFa() ? t("dateHint") : ""}" value="${quickDate()}"></label><label>${t("total")}<input name="total_questions" type="text" inputmode="numeric" required value="${S.settings.default_total_questions || 15}"></label><div class="answer-row"><label>${t("correct")}<input name="correct_answers" type="text" inputmode="numeric" required></label><label>${t("incorrect")}<input name="incorrect_answers" type="text" inputmode="numeric" required></label></div><div class="quick-score" id="quick-score">${t("enterCounts")}</div><button class="primary-btn">${t("save")}</button></form></article><div class="quick-side"><div class="quick-kpis">${[
    [t("exams"), n(a.count)],
    [t("average"), pct(s.mean_percentage)],
    [t("latest"), a.timeline?.length ? pct(a.timeline.at(-1).percentage) : "—"],
    [t("best"), pct(s.highest_percentage)],
  ]
    .map(
      (x) =>
        `<article class="kpi"><span class="kpi-label">${x[0]}</span><strong>${x[1]}</strong></article>`,
    )
    .join(
      "",
    )}</div><article class="panel"><div class="panel-head"><h2>${t("recent")}</h2></div><div class="chart quick-chart" id="quick-chart"></div></article></div></div><article class="panel compact-history"><div class="panel-head"><h2>${t("quickHistory")}</h2><button class="text-btn" data-advanced-view="history">${t("history")}</button></div>${recent.length ? `<div class="quick-list">${recent.map((r) => `<button data-detail="${r.id}"><span><b>${esc(r.title)}</b><small>${dateDisplay(r.exam_date)}</small></span><strong class="${r.percentage >= 0 ? "positive" : "negative"}">${pct(r.percentage)}</strong></button>`).join("")}</div>` : `<div class="empty">${t("noRecords")}</div>`}</article></section>`;
}
function advancedView() {
  const map = {
    study: studyView,
    overview: overview,
    history: history,
    analytics: analytics,
    subjects: subjects,
    reports: reports,
    settings: settings,
  };
  return map[S.view]?.() || overview();
}
function overview() {
  const subjectOptions = S.subjects
    .map(
      (name) =>
        `<option value="${esc(name)}" ${S.filters.subject === name ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("");
  return `<section class="view active"><div class="hero"><div><p class="eyebrow">${t("pulse")}</p><h1>${t("advancedTitle")}</h1><p>${t("advancedSub")}</p></div></div><div id="filters" class="filters ${S.filtersOpen ? "show" : ""}"><label>${t("from")}${filterDateInput("from_date", "from-date")}</label><label>${t("to")}${filterDateInput("to_date", "to-date")}</label><label>${t("subject")}<select id="subject-filter"><option value="">${t("allSubjects")}</option>${subjectOptions}</select></label><button class="text-btn" id="clear-filter">${t("reset")}</button></div><div id="overview-content"></div></section>`;
}
function history() {
  return `<section class="view active"><div class="page-head"><div><p class="eyebrow">${t("records")}</p><h1>${t("history")}</h1></div></div><div class="table-tools"><input id="search" aria-label="${t("search")}" value="${esc(S.filters.search || "")}" placeholder="${t("search")}"><select id="sort" aria-label="${t("sort")}"><option value="exam_date">${t("date")}</option><option value="percentage">${t("result")}</option><option value="raw_score">${t("raw")}</option><option value="title">${t("name")}</option></select><button id="direction" class="outline-btn" aria-label="${t("direction")}">${icon("sort")}</button></div><article class="panel table-panel" tabindex="0" role="region" aria-label="${t("history")}"><div id="exam-table"></div></article></section>`;
}
function analytics() {
  return `<section class="view active"><div class="page-head"><div><p class="eyebrow">${t("analytics")}</p><h1>${t("analytics")}</h1></div></div><div class="grid two"><article class="panel"><h2>${t("trajectory")}</h2><div class="chart tall" id="analytics-trend"></div></article><article class="panel"><h2>${t("heatmap")}</h2><div class="chart tall" id="heatmap-chart"></div></article></div><div class="grid two"><article class="panel"><h2>${t("monthly")}</h2><div class="chart" id="analytics-monthly"></div></article><article class="panel"><h2>${t("distribution")}</h2><div class="chart" id="analytics-distribution"></div></article></div><div id="analysis-modules"></div></section>`;
}
function subjects() {
  return `<section class="view active"><div class="page-head"><div><p class="eyebrow">${t("subjects")}</p><h1>${t("subjects")}</h1></div></div><div class="grid two"><article class="panel"><h2>${t("subjectAverage")}</h2><div class="chart tall" id="subject-chart"></div></article><article class="panel"><h2>${t("subjects")}</h2><div id="subject-table" class="subject-list"></div></article></div></section>`;
}
function reports() {
  return `<section class="view active"><div class="page-head"><div><p class="eyebrow">${t("data")}</p><h1>${t("reportsTitle")}</h1><p>${t("reportSub")}</p></div></div><div class="report-grid"><article class="panel report-card"><span class="card-icon">${icon("reports")}</span><h2>${t("print")}</h2><p>${t("reportSub")}</p><button class="primary-btn" id="print-report">${t("print")}</button></article><article class="panel report-card"><span class="card-icon">${icon("download")}</span><h2>${t("export")}</h2><p>${t("exportHint")}</p><div class="button-row"><a class="outline-btn" href="/api/export/json?${esc(new URLSearchParams(S.filters))}">JSON</a><a class="outline-btn" href="/api/export/csv?${esc(new URLSearchParams({ ...S.filters, language: isFa() ? "fa" : "en" }))}">CSV</a></div></article><article class="panel report-card"><span class="card-icon">${icon("upload")}</span><h2>${t("import")}</h2><label class="outline-btn file-label">${t("import")}<input id="import-file" type="file" accept="application/json,text/csv,.csv"></label></article><article class="panel report-card"><span class="card-icon">${icon("backup")}</span><h2>${t("backup")}</h2><div class="button-row"><a class="outline-btn" href="/api/backup">${t("backup")}</a><label class="outline-btn file-label danger">${t("restore")}<input id="restore-file" type="file" accept=".db"></label></div></article></div></section>`;
}
function settings() {
  const p = S.settings;
  return `<section class="view active"><div class="page-head"><div><p class="eyebrow">${t("preferences")}</p><h1>${t("settings")}</h1></div></div><article class="panel settings-wide"><h2>${t("modeTitle")}</h2><p>${t("modeSub")}</p><div class="mode-options">${[
    ["quick", "quickMode", "quickModeSub"],
    ["advanced", "advancedMode", "advancedModeSub"],
  ]
    .map(
      ([v, title, sub]) =>
        `<button class="mode-card ${p.application_mode === v ? "chosen" : ""}" data-mode="${v}"><span class="mode-dot"></span><b>${t(title)}</b><small>${t(sub)}</small>${p.application_mode === v ? `<em>${t("selected")}</em>` : ""}</button>`,
    )
    .join(
      "",
    )}</div></article><article class="panel settings-wide"><h2>${t("language")}</h2><div class="segmented"><button data-language="en" class="${!isFa() ? "chosen" : ""}">English</button><button data-language="fa" class="${isFa() ? "chosen" : ""}">فارسی</button></div>${isFa() ? `<label class="setting-inline">${t("digits")}<select id="digits-select"><option value="native" ${p.persian_digits === "native" ? "selected" : ""}>${t("native")}</option><option value="latin" ${p.persian_digits === "latin" ? "selected" : ""}>${t("latin")}</option></select></label>` : ""}</article><article class="panel settings-wide"><h2>${t("scoring")}</h2><p>${t("scoringSub")}</p><form id="settings-form" class="settings-row"><label>${t("defaultTotal")}<input name="default_total_questions" type="number" min="1" value="${p.default_total_questions || 15}"></label><label>${t("correctWeight")}<input name="correct_weight" type="number" min=".01" step=".01" value="${p.correct_weight ?? 4}"></label><label>${t("incorrectWeight")}<input name="incorrect_weight" type="number" min="0" step=".01" value="${p.incorrect_weight ?? 1}"></label><button class="primary-btn">${t("saveDefaults")}</button></form></article><article class="panel settings-wide"><h2>${t("studyCategories")}</h2><p>${t("studyCategoryHelp")}</p><button type="button" class="outline-btn" id="study-settings">${t("studyManage")}</button></article></section>`;
}
function quickDate() {
  const iso = localToday();
  return isFa() ? Jalali.format(iso, S.settings.persian_digits) : iso;
}
function renderData() {
  if (S.view === "study") {
    renderStudy();
    return;
  }
  if (S.settings.application_mode === "quick" && S.view === "quick")
    renderQuick();
  else {
    if (S.view === "overview") renderOverview();
    if (S.view === "history") renderTable();
    if (S.view === "analytics") renderAnalytics();
    if (S.view === "subjects") renderSubjects();
  }
}
function renderQuick() {
  const a = S.analytics;
  if (!a.count) {
    empty("quick-chart");
    return;
  }
  trendChart("quick-chart", a, true);
}
function renderOverview() {
  const a = S.analytics,
    s = a.summary || {};
  const root = $("#overview-content");
  root.innerHTML = `<div class="kpi-grid">${[
    [t("average"), pct(s.mean_percentage), t("average")],
    [t("weighted"), pct(s.weighted_percentage), t("weighted")],
    [
      t("consistency"),
      s.std_dev == null ? "—" : `${n(s.std_dev)} ${t("points")}`,
      t("consistency"),
    ],
    [t("accuracy"), pct(s.overall_accuracy), t("accuracy")],
    [t("completion"), pct(s.completion_rate), t("completion")],
  ]
    .map(
      (x) =>
        `<article class="kpi"><span class="kpi-label">${x[0]}</span><strong>${x[1]}</strong></article>`,
    )
    .join(
      "",
    )}</div><div class="grid two-main"><article class="panel"><div class="panel-head"><h2>${t("trajectory")}</h2></div><div class="chart tall" id="trend-chart"></div></article><article class="panel"><div class="panel-head"><h2>${t("signal")}</h2></div><div id="insights" class="insights"></div><div id="limits" class="limitations"></div></article></div><div class="grid triple"><article class="panel"><h2>${t("composition")}</h2><div class="chart" id="composition-chart"></div></article><article class="panel"><h2>${t("monthly")}</h2><div class="chart" id="monthly-chart"></div></article><article class="panel"><h2>${t("distribution")}</h2><div class="chart" id="distribution-chart"></div></article></div>`;
  if (!a.count) {
    [
      "trend-chart",
      "composition-chart",
      "monthly-chart",
      "distribution-chart",
    ].forEach(empty);
    $("#insights").innerHTML = `<div class="empty">${t("noRecords")}</div>`;
    return;
  }
  trendChart("trend-chart", a);
  compositionChart(a);
  monthlyChart("monthly-chart", a);
  distributionChart("distribution-chart", a);
  renderGroundedInsights(a);
  root.insertAdjacentHTML(
    "beforeend",
    `<article class="panel analysis-panel">${definitions(a)}</article>`,
  );
}
function faInsight(k) {
  return (
    {
      trend: "روند اخیر بر پایه داده‌های ثبت‌شده",
      subject: "بالاترین نرخ پاسخ نادرست",
      completion: "سهم پرسش‌های بدون پاسخ",
      consistency: "ثبات نتایج",
    }[k] || "بینش عملکرد"
  );
}
function faDetail(k) {
  return (
    {
      trend: "میانگین آزمون‌های اخیر با دوره پیش از آن مقایسه می‌شود.",
      subject: "این شاخص فقط نرخ پاسخ‌های نادرست ثبت‌شده را نشان می‌دهد.",
      completion: "این مقدار مشاهده‌شده است و توصیه‌ای برای حدس‌زدن نیست.",
      consistency:
        "انحراف معیار کمتر، نشان‌دهنده نوسان کمتر نتایج ثبت‌شده است.",
    }[k] || "این مشاهده از رکوردهای ذخیره‌شده محاسبه شده است."
  );
}
function grid() {
  const c = getComputedStyle(document.documentElement);
  return {
    left: isFa() ? 18 : 45,
    right: isFa() ? 45 : 18,
    top: 58,
    bottom: 65,
    containLabel: true,
  };
}
function trendChart(id, a, compact = false) {
  if (!a.count) return empty(id);
  const c = getComputedStyle(document.documentElement),
    tl = a.timeline || [];
  chart(id, {
    tooltip: {
      trigger: "axis",
      backgroundColor: c.getPropertyValue("--panel").trim(),
      borderColor: c.getPropertyValue("--line").trim(),
      formatter: (p) => {
        const d = tl[p[0]?.dataIndex];
        return d
          ? `<b>${esc(d.title)}</b><br>${dateDisplay(d.date)}<br>${p.map((item) => `${esc(item.seriesName)}: ${pct(item.value)}`).join("<br>")}`
          : "";
      },
    },
    legend: compact
      ? { show: false }
      : {
          top: 0,
          type: "scroll",
          data: [t("actual"), t("trend")],
          textStyle: { color: c.getPropertyValue("--muted").trim() },
        },
    grid: grid(),
    xAxis: {
      type: "category",
      data: tl.map((x) => dateDisplay(x.date)),
      axisLabel: {
        color: c.getPropertyValue("--muted").trim(),
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: c.getPropertyValue("--muted").trim(),
        formatter: (v) => pct(v),
      },
      splitLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    dataZoom:
      !compact && tl.length > 12
        ? [{ type: "inside" }, { type: "slider", bottom: 2, height: 15 }]
        : [],
    series: [
      {
        name: t("actual"),
        type: "line",
        smooth: 0.25,
        symbolSize: compact ? 5 : 8,
        lineStyle: { color: c.getPropertyValue("--accent").trim(), width: 2 },
        itemStyle: { color: c.getPropertyValue("--accent").trim() },
        data: tl.map((x) => ({
          value: x.percentage,
          title: x.title,
          iso: x.date,
        })),
      },
      {
        name: t("trend"),
        type: "line",
        smooth: 0.3,
        symbol: "none",
        lineStyle: {
          color: c.getPropertyValue("--accent2").trim(),
          type: "dashed",
        },
        data: tl.map((x) => x.moving_average),
      },
    ],
  });
}
function compositionChart(a) {
  const c = getComputedStyle(document.documentElement),
    x = a.composition,
    total = x.correct + x.incorrect + x.unanswered;
  chart("composition-chart", {
    tooltip: {
      trigger: "axis",
      formatter: (p) =>
        p
          .map(
            (q) =>
              `${q.seriesName}: ${n(q.value)} (${pct((q.value / total) * 100)})`,
          )
          .join("<br>"),
    },
    legend: {
      bottom: 0,
      type: "scroll",
      textStyle: { color: c.getPropertyValue("--muted").trim() },
    },
    grid: { left: 5, right: 5, top: 45, bottom: 35 },
    xAxis: { type: "value", max: total, show: false },
    yAxis: { type: "category", data: [""], show: false },
    series: [
      [t("correct"), x.correct, "--accent"],
      [t("incorrect"), x.incorrect, "--red"],
      [t("unanswered"), x.unanswered, "--yellow"],
    ].map(([name, value, color]) => ({
      name,
      type: "bar",
      stack: "a",
      barWidth: 42,
      data: [value],
      label: {
        show: value > 0,
        position: "inside",
        formatter: n(value),
        color: "#16202b",
      },
      itemStyle: { color: c.getPropertyValue(color).trim() },
    })),
  });
}
function monthlyChart(id, a) {
  const c = getComputedStyle(document.documentElement),
    m = calendarMonths(
      a.timeline || [],
      isFa() ? "fa" : "en",
      S.settings.persian_digits !== "latin",
    );
  chart(id, {
    tooltip: {
      trigger: "axis",
      formatter: (items) => {
        const row = m[items[0].dataIndex];
        return `${esc(row.label)}<br>${t("average")}: ${pct(row.average)}<br>${t("sample")}: ${n(row.count)}`;
      },
    },
    grid: grid(),
    xAxis: {
      type: "category",
      data: m.map((x) => x.label),
      axisLabel: { color: c.getPropertyValue("--muted").trim() },
      axisLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: c.getPropertyValue("--muted").trim(),
        formatter: (v) => pct(v),
      },
      splitLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    series: [
      {
        name: t("average"),
        type: "bar",
        data: m.map((x) => x.average),
        itemStyle: {
          color: c.getPropertyValue("--accent").trim(),
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  });
}
function distributionChart(id, a) {
  const c = getComputedStyle(document.documentElement),
    d = a.distribution || [],
    labels = d.map((x) =>
      x.lower === null
        ? `${t("below")} ${n(x.upper)}`
        : x.lower === x.upper
          ? n(x.lower)
          : `[${n(x.lower)}, ${n(x.upper)})`,
    );
  chart(id, {
    tooltip: {
      trigger: "axis",
      formatter: (p) =>
        `${esc(labels[p[0].dataIndex])}<br>${t("sample")}: ${n(p[0].value)}`,
    },
    grid: grid(),
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        color: c.getPropertyValue("--muted").trim(),
        rotate: 35,
        fontSize: 10,
        interval: 2,
      },
      axisLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: {
        formatter: (value) => n(value),
        color: c.getPropertyValue("--muted").trim(),
      },
      splitLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    series: [
      {
        name: t("sample"),
        type: "bar",
        data: d.map((x) => x.count),
        itemStyle: {
          color: c.getPropertyValue("--accent2").trim(),
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  });
  $("#" + id).insertAdjacentHTML(
    "afterend",
    `<p class="analysis-note">${t("binHelp")}</p>`,
  );
}
function renderTable() {
  const rows = S.exams,
    e = $("#exam-table");
  if (!e) return;
  if (!rows.length) {
    e.innerHTML = `<div class="empty">${t("noRecords")}</div>`;
    return;
  }
  e.innerHTML = `<table><thead><tr><th>${t("name")}</th><th>${t("date")}</th><th>${t("subject")}</th><th>${t("raw")}</th><th>${t("result")}</th></tr></thead><tbody>${rows.map((r) => `<tr class="clickable" data-detail="${r.id}"><td><button type="button" class="row-open" aria-label="${esc(`${t("details")}: ${r.title}`)}">${esc(r.title)}</button><div class="tags">${r.tags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></td><td>${dateDisplay(r.exam_date)}</td><td>${esc(r.subject_name || "—")}</td><td>${n(r.raw_score, 2)} / ${n(r.maximum_score, 2)}</td><td class="score ${r.percentage >= 0 ? "positive" : "negative"}">${pct(r.percentage)}</td></tr>`).join("")}</tbody></table>`;
}
function renderAnalytics() {
  const a = S.analytics;
  $("#analysis-modules").innerHTML = analyticalModules(a);
  wireAnalyticalModules();
  if (!a.count) {
    [
      "analytics-trend",
      "heatmap-chart",
      "analytics-monthly",
      "analytics-distribution",
    ].forEach(empty);
    return;
  }
  trendChart("analytics-trend", a);
  monthlyChart("analytics-monthly", a);
  distributionChart("analytics-distribution", a);
  const c = getComputedStyle(document.documentElement),
    h = a.heatmap,
    bounds = heatmapBounds(h.values),
    counts = new Map(h.counts.map((c) => [`${c[0]}:${c[1]}`, c[2]]));
  chart("heatmap-chart", {
    tooltip: {
      formatter: (p) =>
        `<bdi>${esc(subjectLabel(h.subjects[p.value[1]]))}</bdi><br><bdi>${dateDisplay(h.dates[p.value[0]])}</bdi><br>${t("average")}: ${pct(p.value[2])}<br>${t("sample")}: ${n(counts.get(`${p.value[0]}:${p.value[1]}`))}`,
    },
    grid: { left: 8, right: 12, top: 20, bottom: 100, containLabel: true },
    xAxis: {
      type: "category",
      data: h.dates.map(dateDisplay),
      axisLabel: {
        rotate: 45,
        hideOverlap: true,
        color: c.getPropertyValue("--muted").trim(),
      },
    },
    yAxis: {
      type: "category",
      data: h.subjects.map(subjectLabel),
      axisLabel: { color: c.getPropertyValue("--muted").trim() },
    },
    visualMap: {
      formatter: (value) => n(value),
      dimension: 2,
      min: bounds.min,
      max: bounds.max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemHeight: 150,
      itemWidth: 12,
      textStyle: { color: c.getPropertyValue("--muted").trim() },
      inRange: {
        color: [
          "#d76378",
          "#e5a66c",
          "#2a5163",
          c.getPropertyValue("--accent").trim(),
        ],
      },
    },
    series: [
      {
        type: "heatmap",
        name: t("average"),
        data: h.values.map((cell) => [
          ...cell,
          counts.get(`${cell[0]}:${cell[1]}`),
        ]),
      },
    ],
  });
  $("#heatmap-chart").insertAdjacentHTML(
    "beforebegin",
    `<p class="analysis-note">${t("heatHelp")}</p>`,
  );
}
function renderSubjects() {
  const a = S.analytics,
    d = a.subjects || [];
  if (!d.length) {
    empty("subject-chart");
    $("#subject-table").innerHTML =
      `<div class="empty">${t("noRecords")}</div>`;
    return;
  }
  const c = getComputedStyle(document.documentElement);
  chart("subject-chart", {
    tooltip: {
      trigger: "axis",
      formatter: (items) =>
        `${esc(subjectLabel(d[items[0].dataIndex].subject))}<br>${t("average")}: ${pct(items[0].value)}`,
    },
    grid: { left: 8, right: 50, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: {
        formatter: (v) => pct(v),
        color: c.getPropertyValue("--muted").trim(),
      },
      splitLine: { lineStyle: { color: c.getPropertyValue("--line").trim() } },
    },
    yAxis: {
      type: "category",
      data: d.map((x) => subjectLabel(x.subject)),
      axisLabel: { color: c.getPropertyValue("--muted").trim() },
    },
    series: [
      {
        type: "bar",
        data: d.map((x) => x.average),
        itemStyle: { color: c.getPropertyValue("--accent").trim() },
        label: {
          show: true,
          position: "right",
          formatter: (p) => pct(p.value),
        },
      },
    ],
  });
  $("#subject-table").innerHTML = d
    .map(
      (x) =>
        `<div class="subject-row"><b>${esc(subjectLabel(x.subject))}<small>${n(x.count)} ${t("exams")}${x.tentative ? " · " + t("tentative") : ""}</small></b><div><small>${t("average")}</small>${pct(x.average)}</div><div><small>${t("consistency")}</small>${n(x.std_dev)} ${t("points")}</div></div>`,
    )
    .join("");
  $("#subject-table").insertAdjacentHTML(
    "afterend",
    `<p class="analysis-note">${t("sampleHelp")}</p>`,
  );
}
function modal(exam = null) {
  prepareDialog();
  S.selected = exam;
  const advanced = S.settings.application_mode === "advanced";
  const d = exam?.exam_date || localToday(),
    showDate = isFa() ? Jalali.format(d, S.settings.persian_digits) : d;
  $("#modal-root").innerHTML =
    `<dialog id="exam-modal"><form id="exam-form"><div class="modal-head"><div><p class="eyebrow">${exam ? t("updateRecord") : t("newRecord")}</p><h2>${exam ? esc(exam.title) : t("add")}</h2></div><button class="icon-btn" type="button" id="modal-close" aria-label="${t("close")}">${icon("close")}</button></div><div class="form-grid"><label class="span2">${t("name")}<input name="title" required value="${esc(exam?.title || "")}"></label>${advanced ? `<label>${t("subject")}<input name="subject" value="${esc(exam?.subject_name || "")}"></label><label>${t("topic")}<input name="topic" value="${esc(exam?.topic_name || "")}"></label><label>${t("type")}<select name="exam_type">${["practice", "mock", "official", "quiz"].map((k) => `<option value="${k}" ${(exam?.exam_type || "Practice").toLowerCase().startsWith(k) ? "selected" : ""}>${t(k)}</option>`).join("")}</select></label>` : ""}<label>${t("date")}<input name="exam_date" class="localized-date" required value="${showDate}" placeholder="${isFa() ? t("dateHint") : ""}"></label><label>${t("total")}<input name="total_questions" type="text" inputmode="numeric" value="${exam?.total_questions ?? S.settings.default_total_questions ?? 15}" required></label><label>${t("correct")}<input name="correct_answers" type="text" inputmode="numeric" value="${exam?.correct_answers ?? ""}" required></label><label>${t("incorrect")}<input name="incorrect_answers" type="text" inputmode="numeric" value="${exam?.incorrect_answers ?? ""}" required></label>${advanced ? `<label>${t("attempt")}<input name="attempt_number" type="number" min="1" value="${exam?.attempt_number || 1}"></label><label>${t("duration")}<input name="duration_minutes" type="number" min="0" value="${exam?.duration_minutes ?? ""}"></label><label>${t("correctWeight")}<input name="correct_weight" type="number" min=".01" step=".01" value="${exam?.correct_weight ?? S.settings.correct_weight ?? 4}"></label><label>${t("incorrectWeight")}<input name="incorrect_weight" type="number" min="0" step=".01" value="${exam?.incorrect_weight ?? S.settings.incorrect_weight ?? 1}"></label><label class="span2">${t("tags")}<input name="tags" value="${esc((exam?.tags || []).join(", "))}"></label><label class="span2">${t("notes")}<textarea name="notes">${esc(exam?.notes || "")}</textarea></label>` : ""}</div><div class="live-score" id="form-score">${t("enterCounts")}</div><div class="modal-actions"><button class="outline-btn" type="button" id="modal-cancel">${t("cancel")}</button><button class="primary-btn">${t("save")}</button></div></form></dialog>`;
  $("#modal-close").onclick = $("#modal-cancel").onclick = closeDialog;
  $("#exam-form").oninput = previewForm;
  $("#exam-form").onsubmit = saveForm;
  timingAndWeights(exam);
  previewForm();
  openDialog("exam-modal");
  wireLocale();
}
function parseNum(v) {
  return localizedNumber(v);
}
function normalizeDate(value) {
  if (!isFa()) return value;
  return Jalali.parse(value);
}
function previewForm() {
  scheduleScorePreview($("#exam-form"), "#form-score");
}
async function saveFormRequest(e) {
  e.preventDefault();
  const f = e.currentTarget,
    d = Object.fromEntries(new FormData(f)),
    original = S.selected;
  d.exam_date = normalizeDate(d.exam_date);
  if (!d.exam_date) {
    toast(t("dateInvalid"), true);
    return;
  }
  d.total_questions = parseNum(d.total_questions);
  d.correct_answers = parseNum(d.correct_answers);
  d.incorrect_answers = parseNum(d.incorrect_answers);
  d.correct_weight = parseNum(
    d.correct_weight ?? original?.correct_weight ?? S.settings.correct_weight,
  );
  d.incorrect_weight = parseNum(
    d.incorrect_weight ??
      original?.incorrect_weight ??
      S.settings.incorrect_weight,
  );
  d.unanswered_weight = parseNum(
    d.unanswered_weight ??
      original?.unanswered_weight ??
      S.settings.unanswered_weight ??
      0,
  );
  if (original?.revision) d.revision = original.revision;
  d.attempt_number = parseNum(
    d.attempt_number ?? original?.attempt_number ?? 1,
  );
  const duration = d.duration_minutes ?? original?.duration_minutes ?? null;
  d.duration_minutes =
    duration === "" || duration === null ? null : parseNum(duration);
  d.subject = d.subject ?? original?.subject_name ?? "";
  d.topic = d.topic ?? original?.topic_name ?? "";
  d.tags = d.tags ?? original?.tags ?? [];
  d.tags = Array.isArray(d.tags)
    ? d.tags
    : d.tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
  d.notes = d.notes ?? original?.notes ?? "";
  d.exam_type = d.exam_type ?? original?.exam_type ?? "Practice";
  try {
    await api(original ? `/api/exams/${original.id}` : "/api/exams", {
      method: original ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    S.examDirty = false;
    closeDialog();
    toast(
      S.settings.application_mode === "quick" ? t("quickSaved") : t("saved"),
    );
    await load();
  } catch (err) {
    if (err.message.includes("matching") && confirm(t("duplicate"))) {
      d.allow_duplicate = true;
      try {
        await api(original ? `/api/exams/${original.id}` : "/api/exams", {
          method: original ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        S.examDirty = false;
        closeDialog();
        await load();
      } catch (second) {
        toast(second.message, true);
      }
    } else toast(err.message, true);
  }
}
const submittingForms = new WeakSet();
async function guardedSubmit(event, action) {
  event.preventDefault();
  const form = event.currentTarget;
  if (submittingForms.has(form)) return;
  submittingForms.add(form);
  const buttons = [
    ...form.querySelectorAll('button[type="submit"],button:not([type])'),
  ];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await action(event);
  } catch (error) {
    toast(error.message, true);
  } finally {
    submittingForms.delete(form);
    buttons.forEach((b) => (b.disabled = false));
  }
}
function saveForm(event) {
  return guardedSubmit(event, saveFormRequest);
}
function saveQuick(event) {
  return guardedSubmit(event, saveQuickRequest);
}
function quickPreview() {
  scheduleScorePreview($("#quick-form"), "#quick-score");
}
async function saveQuickRequest(e) {
  e.preventDefault();
  const f = e.currentTarget,
    d = Object.fromEntries(new FormData(f));
  d.exam_date = normalizeDate(d.exam_date);
  if (!d.exam_date) {
    toast(t("dateInvalid"), true);
    return;
  }
  Object.assign(d, {
    total_questions: parseNum(d.total_questions),
    correct_answers: parseNum(d.correct_answers),
    incorrect_answers: parseNum(d.incorrect_answers),
    correct_weight: Number(S.settings.correct_weight),
    incorrect_weight: Number(S.settings.incorrect_weight),
    unanswered_weight: Number(S.settings.unanswered_weight ?? 0),
    exam_type: "Practice",
    attempt_number: 1,
    tags: [],
  });
  try {
    await api("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    S.examDirty = false;
    toast(t("quickSaved"));
    await load();
  } catch (err) {
    if (err.message.includes("matching") && confirm(t("duplicate"))) {
      d.allow_duplicate = true;
      try {
        await api("/api/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        S.examDirty = false;
        toast(t("quickSaved"));
        await load();
      } catch (second) {
        toast(second.message, true);
      }
    } else toast(err.message, true);
  }
}
async function deleteExam(id, button) {
  if (button.disabled || !confirm(t("deleteConfirm"))) return;
  const dialog = button.closest("dialog");
  button.disabled = true;
  try {
    await api("/api/exams/" + id, { method: "DELETE" });
    if (dialog?.isConnected) closeDialog();
    await load();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}
async function showDetails(id) {
  const version = (S.detailsVersion = (S.detailsVersion || 0) + 1);
  try {
    const r = await api(`/api/exams/${id}`);
    if (version !== S.detailsVersion) return;
    prepareDialog();
    S.selected = r;
    $("#modal-root").innerHTML =
      `<dialog id="details-modal"><div class="modal-head"><div><p class="eyebrow">${t("details")}</p><h2>${esc(r.title)}</h2></div><button class="icon-btn" id="detail-close" aria-label="${t("close")}">${icon("close")}</button></div><div id="detail-content"><p class="detail-meta">${dateDisplay(r.exam_date)} · ${esc(r.subject_name || "—")}</p><div class="detail-stats"><div class="detail-stat"><span>${t("result")}</span><b>${pct(r.percentage)}</b></div><div class="detail-stat"><span>${t("raw")}</span><b>${n(r.raw_score)} / ${n(r.maximum_score)}</b></div><div class="detail-stat"><span>${t("correct")}</span><b>${n(r.correct_answers)}</b></div><div class="detail-stat"><span>${t("incorrect")}</span><b>${n(r.incorrect_answers)}</b></div></div>${detailFields(r)}${r.notes ? `<div class="detail-note">${esc(r.notes)}</div>` : ""}</div><div class="modal-actions"><button class="danger-btn" id="detail-delete">${t("delete")}</button><button class="outline-btn" id="detail-edit">${t("edit")}</button></div></dialog>`;
    openDialog("details-modal");
    $("#detail-close").onclick = closeDialog;
    $("#detail-edit").onclick = () => modal(r);
    $("#detail-delete").onclick = () => deleteExam(r.id, $("#detail-delete"));
  } catch (e) {
    toast(e.message, true);
  }
}
async function load() {
  if (!allowExamDiscard()) {
    S.view = S.renderedView || S.view;
    return;
  }

  S.detailsVersion = (S.detailsVersion || 0) + 1;
  clearTimeout(S.timer);
  const version = (S.loadVersion = (S.loadVersion || 0) + 1);
  const root = $("#app");
  if (!S.loaded) loadingState();
  root.setAttribute("aria-busy", "true");
  try {
    const settings = await api("/api/settings");
    if (version !== S.loadVersion) return;
    S.settings = settings;
    document.documentElement.lang = isFa() ? "fa" : "en";
    document.documentElement.dir = isFa() ? "rtl" : "ltr";
    document.documentElement.dataset.theme = S.settings.theme || "dark";
    if (S.settings.application_mode === "advanced" && S.view === "quick")
      S.view = "overview";
    if (S.settings.application_mode === "quick" && S.view === "overview")
      S.view = "quick";
    const q = new URLSearchParams({
      ...S.filters,
      sort: S.sort,
      direction: S.direction,
      limit: S.view === "history" ? 50 : 10,
      offset: S.view === "history" ? (S.page || 0) * 50 : 0,
    });
    const needsExamData = [
      "overview",
      "quick",
      "history",
      "analytics",
      "subjects",
    ].includes(S.view);
    const results =
      S.view === "study"
        ? await fetchStudy()
        : needsExamData
          ? await Promise.all([
              api("/api/exams?" + q),
              api("/api/subjects"),
              api("/api/analytics?" + new URLSearchParams(S.filters)),
            ])
          : null;
    if (version !== S.loadVersion) return;
    if (S.view === "study") acceptStudy(results);
    else if (needsExamData) [S.exams, S.subjects, S.analytics] = results;
    if (
      S.view === "history" &&
      S.page > 0 &&
      S.page * 50 >= S.analytics.count
    ) {
      S.page = 0;
      return await load();
    }
    document.documentElement.lang = isFa() ? "fa" : "en";
    document.documentElement.dir = isFa() ? "rtl" : "ltr";
    document.documentElement.dataset.theme = S.settings.theme || "dark";
    document.title = isFa()
      ? "وریتی — هوشمندی آزمون"
      : "Verity — Exam Intelligence";
    Object.values(S.charts).forEach((c) => c.dispose());
    S.charts = {};
    const focus = document.activeElement,
      focusState =
        focus?.id === "search"
          ? { start: focus.selectionStart, end: focus.selectionEnd }
          : null;
    root.innerHTML = nav();
    renderData();
    wire();
    wireAccessibility();
    wireLocale();
    extendWorkspace();
    S.renderedView = S.view;
    if (focusState && $("#search")) {
      $("#search").focus();
      $("#search").setSelectionRange(focusState.start, focusState.end);
    }
    S.loaded = true;
    S.lastLoadError = null;
  } catch (e) {
    if (version === S.loadVersion) {
      S.lastLoadError = { view: S.view, message: String(e?.message || e) };
      console.error("Workspace loading failed", S.view, e);
      if (!S.loaded) loadingState(true);
      toast(t("loadFailed"), true);
    }
  } finally {
    if (version === S.loadVersion) root.setAttribute("aria-busy", "false");
  }
}
function wire() {
  const quick = S.settings.application_mode === "quick" && S.view === "quick";
  $$("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      if (S.view === "study" && ST.dirty) {
        try {
          ST.draft = readStudyDraft(true);
        } catch (error) {
          toast(error.message, true);
          return;
        }
      }
      S.view = b.dataset.view;
      load();
    }),
  );
  $("#menu-btn").onclick = () => $("#sidebar").classList.toggle("open");
  $("#locale-btn").onclick = () =>
    saveSettings({ language: isFa() ? "en" : "fa" });
  $("#theme-btn").onclick = () =>
    saveSettings({
      theme:
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    });
  const add = $("#add-btn");
  if (add) add.onclick = () => modal();
  $$("[data-detail]").forEach((b) => {
    b.onclick = () => showDetails(Number(b.dataset.detail));
    b.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showDetails(Number(b.dataset.detail));
      }
    };
  });
  $$("[data-advanced-view]").forEach(
    (b) =>
      (b.onclick = () => {
        S.view = b.dataset.advancedView;
        saveSettings({ application_mode: "advanced" });
      }),
  );
  if (S.view === "study") {
    wireStudy();
    return;
  }
  if (quick) {
    $("#quick-form").oninput = quickPreview;
    $("#quick-form").onsubmit = saveQuick;
    quickPreview();
    return;
  }
  if (S.view === "settings") {
    $("#study-settings").onclick = () => {
      S.view = "study";
      ST.manage = true;
      load();
    };
    $$("[data-mode]").forEach(
      (b) =>
        (b.onclick = () => saveSettings({ application_mode: b.dataset.mode })),
    );
    $$("[data-language]").forEach(
      (b) => (b.onclick = () => saveSettings({ language: b.dataset.language })),
    );
    $("#digits-select")?.addEventListener("change", (e) =>
      saveSettings({ persian_digits: e.target.value }),
    );
    $("#settings-form").onsubmit = (e) => {
      e.preventDefault();
      saveSettings(
        Object.fromEntries(
          [...new FormData(e.currentTarget)].map(([k, v]) => [k, parseNum(v)]),
        ),
      );
    };
    return;
  }
  if (S.view === "overview") {
    $("#filter-btn")?.addEventListener("click", () => {
      const open = $("#filters").classList.toggle("show");
      S.filtersOpen = open;
      $("#filter-btn").setAttribute("aria-expanded", String(open));
    });
    ["from-date", "to-date"].forEach((id) =>
      $("#" + id)?.addEventListener("change", (e) => {
        const key = id.replace("-", "_"),
          value = isFa() ? Jalali.parse(e.target.value) : e.target.value;
        if (e.target.value && !value) {
          toast(t("dateInvalid"), true);
          return;
        }
        const proposed = { ...S.filters, [key]: value || "" };
        if (
          proposed.from_date &&
          proposed.to_date &&
          proposed.from_date > proposed.to_date
        ) {
          toast(t("dateRangeInvalid"), true);
          return;
        }
        S.filters = proposed;
        load();
      }),
    );
    $("#subject-filter")?.addEventListener("change", (e) => {
      S.filters.subject = e.target.value;
      load();
    });
    $("#clear-filter")?.addEventListener("click", () => {
      S.filters = {};
      load();
    });
  }
  if (S.view === "history") {
    $("#sort").value = S.sort;
    $("#direction").title = t(
      S.direction === "asc" ? "ascending" : "descending",
    );
    $("#direction").setAttribute(
      "aria-label",
      t(S.direction === "asc" ? "ascending" : "descending"),
    );
    $("#search").oninput = (e) => {
      S.filters.search = e.target.value;
      S.page = 0;
      S.loadVersion = (S.loadVersion || 0) + 1;
      clearTimeout(S.timer);
      S.timer = setTimeout(load, 200);
    };
    $("#sort").onchange = (e) => {
      S.sort = e.target.value;
      S.page = 0;
      load();
    };
    $("#direction").onclick = () => {
      S.direction = S.direction === "asc" ? "desc" : "asc";
      load();
    };
  }
  if (S.view === "reports") {
    $("#print-report").onclick = () => window.print();
    $("#import-file").onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      upload(file, "/api/import", t("imported"));
    };
    $("#restore-file").onchange = (e) =>
      upload(e.target.files[0], "/api/restore", t("restored"));
  }
}
async function saveSettings(x) {
  if (!allowExamDiscard()) return;
  try {
    await api("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(x),
    });
    S.view =
      x.application_mode === "quick"
        ? "quick"
        : x.application_mode === "advanced"
          ? "overview"
          : S.view;
    await load();
    toast(x.application_mode ? t("modeSaved") : t("saved"));
  } catch (e) {
    toast(e.message, true);
  }
}
async function upload(file, url, msg) {
  if (!file) return;
  if (url === "/api/import") return previewImport(file);
  if (url === "/api/restore" && !confirm(t("restoreConfirm"))) return;
  const d = new FormData();
  d.append("file", file);
  try {
    const r = await api(url, { method: "POST", body: d });
    toast(
      r.recovery_backup
        ? `${msg} · ${t("restoreRecovery")}: ${r.recovery_backup}`
        : r.errors?.length
          ? `${msg} (${r.created})`
          : msg,
    );
    await load();
  } catch (e) {
    toast(e.message, true);
  }
}
window.addEventListener("beforeunload", (event) => {
  if (S.examDirty || ST.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("resize", () => {
  Object.values(S.charts).forEach((c) => c.resize());
  const sidebar = $("#sidebar");
  if (sidebar) {
    const mobile = matchMedia("(max-width:780px)").matches;
    sidebar.inert = mobile && !sidebar.classList.contains("open");
    $("#main-content").inert = mobile && sidebar.classList.contains("open");
  }
});
load();
