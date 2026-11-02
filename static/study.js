/* Weekly study has its own scope and drafts; exam records are never inputs here. */
const ST = {
  selected: null,
  categories: [],
  analysis: { weeks: [] },
  draft: null,
  dirty: false,
  filters: {},
  manage: false,
};

function studyWeek(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw Error(t("studyInvalidDate"));
  const d = new Date(iso + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
    throw Error(t("studyInvalidDate"));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  if (start < "1821-03-21" || end > "2222-03-20")
    throw Error(t("studyDateRange"));
  return [start, end];
}
function studyDuration(value) {
  if (value === null || value === undefined) return "—";
  const minutes = Math.round(Math.abs(value));
  return `${value < 0 ? "−" : ""}${n(Math.floor(minutes / 60), 0)} ${t("studyHours")} ${n(minutes % 60, 0)} ${t("studyMinutes")}`;
}
function studyDate(iso) {
  return new Intl.DateTimeFormat(isFa() ? "fa-IR" : "en-GB", {
    calendar: isFa() ? "persian" : "gregory",
    numberingSystem:
      isFa() && S.settings.persian_digits !== "latin" ? "arabext" : "latn",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso + "T12:00:00Z"));
}
function studyPeriod(start) {
  return studyWeek(start).map(studyDate).join(" — ");
}
function studyName(c) {
  return c[isFa() ? "name_fa" : "name_en"];
}
function studyGroup(group) {
  return t(group === "theoretical" ? "studyTheoretical" : "studyPractical");
}
function studyAdvance() {
  return S.settings.application_mode === "advanced";
}
function studyQuery() {
  return new URLSearchParams({
    ...ST.filters,
    calendar: isFa() ? "persian" : "gregorian",
  });
}
async function fetchStudy() {
  if (!ST.selected) ST.selected = studyWeek(localToday())[0];
  if ($("#study-form") && ST.dirty) ST.draft = readStudyDraft(true);
  return Promise.all([
    api("/api/study/categories"),
    api("/api/study/analytics?" + studyQuery()),
    api("/api/study/weeks/" + ST.selected),
  ]);
}
function acceptStudy(data) {
  [ST.categories, ST.analysis] = data;
  if (!ST.dirty || !ST.draft) ST.draft = data[2];
  ST.selected = ST.draft.week_start;
}
function studyView() {
  return `<section class="view active study-page"><div class="study-hero"><div><p class="eyebrow">${t("study")} · ${t("studyPeriod")}</p><h1>${t("studyTitle")}</h1><p>${t("studySubtitle")}</p></div><div class="study-hero-icon">${icon("study")}</div></div>${ST.manage || studyAdvance() ? `<div class="study-tools"><button type="button" class="outline-btn" id="study-manage">${t("studyManage")}</button></div>` : ""}<div id="study-manager"></div><article class="panel study-editor"><div class="panel-head"><div><h2>${t("studyEntry")}</h2><p>${t("studyBoundaryHelp")}</p></div><label>${t("studyWeek")}<input id="study-week" class="localized-date" value="${isFa() ? Jalali.format(ST.selected, S.settings.persian_digits) : ST.selected}"></label></div><div class="study-period" id="study-period">${studyPeriod(ST.selected)}</div><div id="study-entry-root"></div></article><article class="panel study-chart-panel"><div class="panel-head"><div><h2>${t("studyChart")}</h2><p>${t("studyFiltered")}</p></div></div><div class="study-filters"><label>${t("from")}<input id="study-from" class="localized-date" value="${ST.filters.from_date ? (isFa() ? Jalali.format(ST.filters.from_date, S.settings.persian_digits) : ST.filters.from_date) : ""}"></label><label>${t("to")}<input id="study-to" class="localized-date" value="${ST.filters.to_date ? (isFa() ? Jalali.format(ST.filters.to_date, S.settings.persian_digits) : ST.filters.to_date) : ""}"></label><label>${t("studyCategories")}<select id="study-category-filter"><option value="">${t("studyAllCategories")}</option>${ST.categories.map((c) => `<option value="${c.id}" ${String(ST.filters.category_id) === String(c.id) ? "selected" : ""}>${esc(studyName(c))}</option>`).join("")}</select></label><button type="button" class="text-btn" id="study-reset">${t("reset")}</button></div><div id="study-stack" class="chart study-chart"></div></article><div id="study-advanced"></div><article class="panel"><div class="panel-head"><h2>${t("studyHistory")}</h2>${studyAdvance() ? `<div class="button-row">${studyExportButtons()}</div>` : ""}</div><div id="study-history" class="chart-table" tabindex="0" role="region" aria-label="${t("studyHistory")}"></div></article></section>`;
}
function studyExportButtons(start = "") {
  return ["text", "pdf", "csv", "xlsx"]
    .map(
      (format) =>
        `<button type="button" class="outline-btn" data-study-export="${format}" data-week="${start}">${t({ text: "studyCopy", pdf: "studyPdf", csv: "studyCsv", xlsx: "studyXlsx" }[format])}</button>`,
    )
    .join("");
}
function studyEntry(c, video) {
  const e = ST.draft.entries.find(
    (e) => e.category_id === c.id && !!e.video === video,
  ) || {
    category_id: c.id,
    video,
    minutes: 0,
    description: "",
    details: [],
    study_group: c.study_group,
  };
  const detailed = e.details.length > 0,
    advanced = studyAdvance();
  return `<div class="study-entry" data-category="${c.id}" data-video="${video ? 1 : 0}" data-group="${e.study_group}"><div class="study-entry-main"><div><b>${video ? t("studyVideo") : esc(studyName(e.name_en ? e : c))}</b>${!c.enabled ? `<small>${t("studyDisabled")}</small>` : ""}${c.study_group !== e.study_group ? `<small>${t("studySnapshot")}: ${studyGroup(e.study_group)}</small>` : ""}</div><label>${t("studyHours")}<input class="entry-hours" inputmode="numeric" value="${e.minutes ? n(Math.floor(e.minutes / 60), 0) : ""}" ${detailed ? "readonly" : ""} aria-label="${esc(studyName(c))} ${video ? t("studyVideo") : ""} ${t("studyHours")}"></label><label>${t("studyMinutes")}<input class="entry-minutes" inputmode="numeric" value="${e.minutes ? n(e.minutes % 60, 0) : ""}" ${detailed ? "readonly" : ""} aria-label="${esc(studyName(c))} ${video ? t("studyVideo") : ""} ${t("studyMinutes")}"></label></div><details class="study-entry-options" ${e.description || detailed ? "open" : ""}><summary>${t("studyDescription")}${advanced ? " / " + t("studyDetails") : ""}</summary><input class="entry-description" aria-label="${t("studyDescription")}" placeholder="${t("studyDescription")}" maxlength="2000" value="${esc(e.description)}">${advanced ? `<label class="study-check"><input type="checkbox" class="entry-breakdown" ${detailed ? "checked" : ""}>${t("studyBreakdown")}</label>${detailed ? `<p>${t("studyBreakdownHelp")}</p><div class="study-details">${e.details.map((d, i) => studyDetail(d, i)).join("")}</div><button type="button" class="text-btn" data-add-detail>${t("studyAddDetail")}</button>` : ""}` : detailed ? `<p>${t("studyDetailedQuick")}</p>` : ""}</details></div>`;
}
function studyDetail(d, i) {
  return `<div class="study-detail" data-index="${i}"><input class="detail-label" aria-label="${t("studyActivity")}" placeholder="${t("studyActivity")}" maxlength="500" value="${esc(d.label)}"><input class="detail-hours" inputmode="numeric" aria-label="${t("studyHours")}" placeholder="${t("studyHours")}" value="${n(Math.floor(d.minutes / 60), 0)}"><input class="detail-minutes" inputmode="numeric" aria-label="${t("studyMinutes")}" placeholder="${t("studyMinutes")}" value="${n(d.minutes % 60, 0)}"><button type="button" class="icon-btn" data-remove-detail aria-label="${t("studyRemove")}">${icon("close")}</button></div>`;
}
function renderStudyEditor() {
  const available = ST.categories.filter(
    (c) => c.enabled || ST.draft.entries.some((e) => e.category_id === c.id),
  );
  $("#study-entry-root").innerHTML =
    `<form id="study-form"><div class="study-group-grid">${[
      "theoretical",
      "practical",
    ]
      .map(
        (group) =>
          `<section class="study-group"><h3><span class="study-group-dot ${group}"></span>${studyGroup(group)}</h3>${available
            .filter(
              (c) =>
                (ST.draft.entries.find((e) => e.category_id === c.id)
                  ?.study_group || c.study_group) === group,
            )
            .map(
              (c) =>
                `<article class="study-category-row" style="--category-color:${c.color}">${studyEntry(c, false)}<details class="study-video" ${ST.draft.entries.some((e) => e.category_id === c.id && e.video && (e.minutes || e.description)) ? "open" : ""}><summary>${t("studyVideo")}</summary><p>${t("studyVideoHelp")}</p>${studyEntry(c, true)}</details></article>`,
            )
            .join("")}</section>`,
      )
      .join(
        "",
      )}</div><label class="study-note-label">${t("studyNotes")}<textarea name="notes" maxlength="5000">${esc(ST.draft.notes)}</textarea></label><p>${t("studyEmpty")}</p><div class="study-save-bar"><div id="study-live" role="status" aria-live="polite"></div><div class="button-row"><button type="button" class="text-btn" id="study-reload">${t("studyReload")}</button><button class="primary-btn" type="submit">${t("studySave")}</button></div></div></form>`;
  $("#study-form").oninput = () => {
    ST.dirty = true;
    studyLive();
  };
  $("#study-form").onsubmit = (e) => guardedSubmit(e, saveStudy);
  $("#study-reload").onclick = async () => {
    if (ST.dirty && !confirm(t("studyUnsaved"))) return;
    ST.dirty = false;
    ST.draft = null;
    await load();
  };
  $$(".entry-breakdown").forEach(
    (input) =>
      (input.onchange = () => {
        try {
          const entry = input.closest(".study-entry"),
            draft = readStudyDraft(true),
            key = (e) =>
              e.category_id === Number(entry.dataset.category) &&
              !!e.video === !!Number(entry.dataset.video);
          let row = draft.entries.find(key);
          if (!row) {
            row = {
              category_id: Number(entry.dataset.category),
              video: Number(entry.dataset.video),
              minutes: 0,
              description: "",
              details: [],
              study_group: entry.dataset.group,
            };
            draft.entries.push(row);
          }
          if (input.checked) {
            row.details = [
              {
                label: row.description || t("studyActivity"),
                minutes: row.minutes,
              },
            ];
          } else {
            if (!confirm(t("studyConvertConfirm"))) {
              input.checked = true;
              return;
            }
            row.details = [];
          }
          ST.draft = draft;
          ST.dirty = true;
          renderStudyEditor();
        } catch (error) {
          toast(error.message, true);
        }
      }),
  );
  $$("[data-add-detail],[data-remove-detail]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          const entry = button.closest(".study-entry"),
            draft = readStudyDraft(true),
            row = draft.entries.find(
              (e) =>
                e.category_id === Number(entry.dataset.category) &&
                !!e.video === !!Number(entry.dataset.video),
            );
          if (button.hasAttribute("data-add-detail"))
            row.details.push({ label: "", minutes: 0 });
          else {
            row.details.splice(
              Number(button.closest(".study-detail").dataset.index),
              1,
            );
            if (!row.details.length) row.minutes = 0;
          }
          ST.draft = draft;
          ST.dirty = true;
          renderStudyEditor();
        } catch (error) {
          toast(error.message, true);
        }
      }),
  );
  studyLive();
}
function readStudyMinutes(h, m) {
  const hours = h.trim() ? parseNum(h) : 0,
    minutes = m.trim() ? parseNum(m) : 0;
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59 ||
    hours > 168
  )
    throw Error(t("studyInvalidDuration"));
  return hours * 60 + minutes;
}
function readStudyDraft(allowEmptyLabels = false) {
  const draft = {
    ...ST.draft,
    entries: [],
    notes: $("#study-form [name=notes]").value,
  };
  $$(".study-entry").forEach((element) => {
    const category_id = Number(element.dataset.category),
      video = Number(element.dataset.video),
      original = ST.draft.entries.find(
        (e) => e.category_id === category_id && e.video == video,
      );
    let details = original?.details || [];
    if (studyAdvance())
      details = [...element.querySelectorAll(".study-detail")].map((row) => ({
        label: row.querySelector(".detail-label").value,
        minutes: readStudyMinutes(
          row.querySelector(".detail-hours").value,
          row.querySelector(".detail-minutes").value,
        ),
      }));
    if (!allowEmptyLabels && details.some((d) => !d.label.trim()))
      throw Error(t("studyDetailLabel"));
    const minutes = details.length
      ? details.reduce((s, d) => s + d.minutes, 0)
      : readStudyMinutes(
          element.querySelector(".entry-hours").value,
          element.querySelector(".entry-minutes").value,
        );
    const description = element.querySelector(".entry-description").value;
    if (minutes || description || details.length || original)
      draft.entries.push({
        ...original,
        category_id,
        video,
        study_group: element.dataset.group,
        minutes,
        description,
        details,
      });
  });
  return draft;
}
function studyLive() {
  try {
    const draft = readStudyDraft(true),
      totals = { theoretical: 0, practical: 0 };
    for (const e of draft.entries) {
      totals[e.study_group] += e.minutes;
      if (e.details.length) {
        const el = $(
          `.study-entry[data-category="${e.category_id}"][data-video="${e.video}"]`,
        );
        el.querySelector(".entry-hours").value = n(
          Math.floor(e.minutes / 60),
          0,
        );
        el.querySelector(".entry-minutes").value = n(e.minutes % 60, 0);
      }
    }
    const overall = totals.theoretical + totals.practical;
    $("#study-live").innerHTML =
      `${["theoretical", "practical"].map((g) => `<span>${studyGroup(g)}<strong>${studyDuration(totals[g])}</strong></span>`).join("")}<span class="study-total">${t("studyTotal")}<strong>${studyDuration(overall)}</strong></span>`;
    if (overall > 10080) throw Error(t("studyWeekLimit"));
  } catch (error) {
    $("#study-live").textContent = error.message;
  }
}
async function saveStudy() {
  const draft = readStudyDraft();
  const saved = await api("/api/study/weeks/" + ST.selected, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  ST.dirty = false;
  ST.draft = saved;
  toast(t("studySaved"));
  await load();
}
function renderStudy() {
  renderStudyEditor();
  renderStudyHistory();
  renderStudyChart();
  if (studyAdvance()) renderStudyAdvanced();
  if (ST.manage) renderStudyManager();
}
function renderStudyHistory() {
  const weeks = ST.analysis.weeks;
  ST.historyPage = Math.min(
    ST.historyPage || 0,
    Math.max(0, Math.ceil(weeks.length / 50) - 1),
  );
  $("#study-history").innerHTML = weeks.length
    ? `<table><thead><tr><th>${t("studyPeriod")}</th><th>${t("studyTheoretical")}</th><th>${t("studyPractical")}</th><th>${t("studyTotal")}</th><th>${t("studyChange")}</th></tr></thead><tbody>${[
        ...weeks,
      ]
        .reverse()
        .slice(ST.historyPage * 50, (ST.historyPage + 1) * 50)
        .map(
          (w) =>
            `<tr><th><button type="button" class="row-open" data-study-week="${w.week_start}">${studyPeriod(w.week_start)}</button></th><td>${studyDuration(w.totals.theoretical)}</td><td>${studyDuration(w.totals.practical)}</td><td><b>${studyDuration(w.totals.overall)}</b></td><td>${w.change_minutes === null ? "—" : studyDuration(w.change_minutes)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">${t("studyNoReports")}</p>`;
  if (weeks.length > 50) {
    $("#study-history").insertAdjacentHTML(
      "beforeend",
      `<nav class="pagination" aria-label="${t("historyPages")}"><button type="button" class="outline-btn" id="study-previous-page" ${!ST.historyPage ? "disabled" : ""}>${t("previous")}</button><span>${n(ST.historyPage + 1)} / ${n(Math.ceil(weeks.length / 50))}</span><button type="button" class="outline-btn" id="study-next-page" ${(ST.historyPage + 1) * 50 >= weeks.length ? "disabled" : ""}>${t("next")}</button></nav>`,
    );
    $("#study-previous-page").onclick = () => {
      ST.historyPage--;
      renderStudyHistory();
    };
    $("#study-next-page").onclick = () => {
      ST.historyPage++;
      renderStudyHistory();
    };
  }
  $$("#study-history [data-study-week]").forEach(
    (b) => (b.onclick = () => showStudyReport(b.dataset.studyWeek)),
  );
}
function studyChartRows() {
  const rows = ST.analysis.weeks;
  if (!rows.length) return [];
  const first = new Date(rows[0].week_start + "T12:00:00Z"),
    last = new Date(rows.at(-1).week_start + "T12:00:00Z");
  if ((last - first) / 86400000 > 3640) return rows;
  const map = new Map(rows.map((w) => [w.week_start, w])),
    all = [];
  while (first <= last) {
    const start = first.toISOString().slice(0, 10);
    all.push(
      map.get(start) || { week_start: start, entries: [], totals: null },
    );
    first.setUTCDate(first.getUTCDate() + 7);
  }
  return all;
}
function studyChartBase(rows) {
  const style = getComputedStyle(document.documentElement),
    muted = style.getPropertyValue("--muted").trim(),
    line = style.getPropertyValue("--line").trim();
  return {
    legend: { type: "scroll", top: 0, textStyle: { color: muted } },
    grid: { left: 10, right: 16, top: 65, bottom: 85, containLabel: true },
    xAxis: {
      type: "category",
      data: rows.map((w) => studyDate(w.week_start)),
      axisLabel: { color: muted, hideOverlap: true, rotate: 25 },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLabel: { color: muted, formatter: studyDuration },
      splitLine: { lineStyle: { color: line } },
    },
    dataZoom:
      rows.length > 10
        ? [{ type: "inside" }, { type: "slider", height: 15, bottom: 0 }]
        : [],
  };
}
function renderStudyChart() {
  const rows = studyChartRows();
  if (!rows.length) {
    $("#study-stack").innerHTML = `<p class="empty">${t("studyNoReports")}</p>`;
    return;
  }
  const ids = new Set(rows.flatMap((w) => w.entries.map((e) => e.category_id))),
    cats = ST.categories.filter((c) => ids.has(c.id));
  const instance = chart("study-stack", {
    ...studyChartBase(rows),
    tooltip: {
      trigger: "axis",
      formatter: (items) => {
        if (!items.length) return "";
        const w = rows[items[0].dataIndex];
        return `<b>${esc(studyPeriod(w.week_start))}</b><br>${
          w.totals
            ? items
                .filter((p) => p.value)
                .map((p) => `${esc(p.seriesName)}: ${studyDuration(p.value)}`)
                .join("<br>") +
              "<br><b>" +
              t("studyTotal") +
              ": " +
              studyDuration(w.totals.overall) +
              "</b>"
            : t("studyNotRecorded")
        }`;
      },
    },
    series: cats.length
      ? cats.map((c) => ({
          id: String(c.id),
          name: studyLegendName(c),
          type: "bar",
          stack: "study",
          barMaxWidth: 44,
          itemStyle: { color: c.color },
          data: rows.map((w) =>
            w.totals
              ? w.entries
                  .filter((e) => e.category_id === c.id)
                  .reduce((s, e) => s + e.minutes, 0)
              : null,
          ),
        }))
      : [
          {
            name: t("studyTotal"),
            type: "bar",
            data: rows.map((w) => (w.totals ? 0 : null)),
          },
        ],
  });
  instance.on("click", (p) => {
    const w = rows[p.dataIndex];
    if (w?.totals) showStudyReport(w.week_start);
  });
}
function renderStudyAdvanced() {
  const a = ST.analysis,
    top = [...a.category_totals].sort((a, b) => b.minutes - a.minutes)[0],
    topCat =
      top?.minutes > 0
        ? ST.categories.find((c) => c.id === top.category_id)
        : null;
  $("#study-advanced").innerHTML = `<div class="study-stats">${[
    [t("studyRecorded"), n(a.count)],
    [t("studyAverage"), studyDuration(a.average_minutes)],
    [t("studyDispersion"), studyDuration(a.std_minutes)],
    [t("studyTop"), topCat ? esc(studyName(topCat)) : "—"],
  ]
    .map(
      ([k, v]) =>
        `<article class="kpi"><span class="kpi-label">${k}</span><strong>${v}</strong></article>`,
    )
    .join(
      "",
    )}</div><p class="analysis-note">${t("studyStatsHelp")}</p><div class="grid two"><article class="panel"><div class="panel-head"><h2>${t("studyView")}</h2><select id="study-chart-view" aria-label="${t("studyView")}"><option value="balance">${t("studyBalance")}</option><option value="trend">${t("studyTrend")}</option><option value="distribution">${t("studyDistribution")}</option></select></div><div id="study-secondary" class="chart study-chart"></div><div class="study-shares">${t("studyTheoretical")}: ${pct(a.shares.theoretical)} · ${t("studyPractical")}: ${pct(a.shares.practical)}</div></article><article class="panel"><h2>${t("studyMonthly")}</h2><p>${t("studyMonthlyHelp")}</p><table><thead><tr><th>${t("month")}</th><th>${t("studyRecorded")}</th><th>${t("studyTotal")}</th></tr></thead><tbody>${a.months.map((m) => `<tr><th>${studyMonthLabel(m.month)}</th><td>${n(m.count)}</td><td>${studyDuration(m.minutes)}</td></tr>`).join("")}</tbody></table><p>${t("studyBest")}: ${a.highest_week ? studyPeriod(a.highest_week) : "—"}</p><p>${t("studyLowest")}: ${a.lowest_week ? studyPeriod(a.lowest_week) : "—"}</p></article></div><article class="panel study-comparison"><h2>${t("studyCompare")}</h2><div class="study-filters">${["first", "second"].map((key, i) => `<label>${t(i ? "studySecond" : "studyFirst")}<select id="study-compare-${key}">${a.weeks.map((w, j) => `<option value="${j}" ${j === Math.max(0, a.weeks.length - 2 + i) ? "selected" : ""}>${studyPeriod(w.week_start)}</option>`).join("")}</select></label>`).join("")}</div><div id="study-comparison-result"></div></article>`;
  $("#study-chart-view").onchange = renderStudySecondary;
  renderStudySecondary();
  ["first", "second"].forEach(
    (k) => ($("#study-compare-" + k).onchange = renderStudyComparison),
  );
  renderStudyComparison();
}
function studyMonthLabel(month) {
  const iso = isFa() ? Jalali.parse(month + "/01") : month + "-01";
  return iso
    ? new Intl.DateTimeFormat(isFa() ? "fa-IR" : "en-GB", {
        calendar: isFa() ? "persian" : "gregory",
        month: "long",
        year: "numeric",
        numberingSystem:
          isFa() && S.settings.persian_digits !== "latin" ? "arabext" : "latn",
        timeZone: "UTC",
      }).format(new Date(iso + "T12:00:00Z"))
    : esc(month);
}
function renderStudySecondary() {
  const rows = ST.analysis.weeks,
    id = "study-secondary";
  S.charts[id]?.dispose();
  $("#" + id)
    .parentElement.querySelector(".chart-data")
    ?.remove();
  if (!rows.length) {
    $("#" + id).innerHTML = `<p class="empty">${t("studyNoReports")}</p>`;
    return;
  }
  const mode = $("#study-chart-view").value,
    base = studyChartBase(rows);
  let series;
  if (mode === "balance")
    series = ["theoretical", "practical"].map((g, i) => ({
      name: studyGroup(g),
      type: "bar",
      stack: "groups",
      itemStyle: { color: i ? "#54b49a" : "#7c91e8" },
      data: rows.map((w) => w.totals[g]),
    }));
  else if (mode === "trend")
    series = [
      {
        name: t("studyTotal"),
        type: "line",
        data: rows.map((w) => w.totals.overall),
      },
      {
        name: t("studyMoving"),
        type: "line",
        lineStyle: { type: "dashed" },
        data: rows.map((w) => w.moving_average_minutes),
      },
    ];
  else {
    const data = ST.analysis.category_totals;
    base.xAxis.data = data.map((d) =>
      studyName(ST.categories.find((c) => c.id === d.category_id)),
    );
    series = [
      {
        name: t("studyDistribution"),
        type: "bar",
        data: data.map((d) => ({
          value: d.minutes,
          itemStyle: {
            color: ST.categories.find((c) => c.id === d.category_id).color,
          },
        })),
      },
    ];
  }
  chart(id, {
    ...base,
    tooltip: {
      trigger: "axis",
      formatter: (items) =>
        items
          .map(
            (p) =>
              `${esc(p.name)} · ${esc(p.seriesName)}: ${studyDuration(p.value)}`,
          )
          .join("<br>"),
    },
    series,
  });
}
function renderStudyComparison() {
  const rows = ST.analysis.weeks,
    a = rows[$("#study-compare-first").value],
    b = rows[$("#study-compare-second").value];
  $("#study-comparison-result").innerHTML =
    a && b
      ? `<p>${t("studyDifference")}</p><div class="analysis-metrics">${["theoretical", "practical", "overall"].map((g) => metric(g === "overall" ? t("studyTotal") : studyGroup(g), studyDuration(b.totals[g] - a.totals[g]))).join("")}</div>`
      : `<p>${t("studyNoReports")}</p>`;
}
function renderStudyManager() {
  ST.manage = true;
  $("#study-manager").innerHTML =
    `<article class="panel study-manager"><div class="panel-head"><h2>${t("studyCategories")}</h2><button type="button" class="primary-btn" id="study-new-category">${t("studyNewCategory")}</button></div><p>${t("studyCategoryHelp")}</p><div class="study-category-grid">${ST.categories.map((c) => `<button type="button" class="study-category-button" data-category-edit="${c.id}"><span style="background:${c.color}"></span><b>${esc(studyName(c))}</b><small>${studyGroup(c.study_group)}${c.enabled ? "" : " · " + t("studyDisabled")}</small></button>`).join("")}</div></article>`;
  $("#study-new-category").onclick = () => studyCategoryModal();
  $$("[data-category-edit]").forEach(
    (b) =>
      (b.onclick = () =>
        studyCategoryModal(
          ST.categories.find((c) => c.id === Number(b.dataset.categoryEdit)),
        )),
  );
}
function studyCategoryModal(category = null) {
  prepareDialog();
  $("#modal-root").innerHTML =
    `<dialog id="study-category-dialog"><form id="study-category-form"><div class="modal-head"><h2>${t("studyManage")}</h2><button type="button" class="icon-btn" data-study-close aria-label="${t("close")}">${icon("close")}</button></div><div class="form-grid"><label>${t("studyNameEn")}<input name="name_en" required maxlength="100" value="${esc(category?.name_en || "")}"></label><label>${t("studyNameFa")}<input name="name_fa" required maxlength="100" value="${esc(category?.name_fa || "")}"></label><label>${t("studyGroup")}<select name="study_group">${["theoretical", "practical"].map((g) => `<option value="${g}" ${category?.study_group === g ? "selected" : ""}>${studyGroup(g)}</option>`).join("")}</select></label><label>${t("studyOrder")}<input name="display_order" inputmode="numeric" required value="${category?.display_order ?? ST.categories.length}"></label><label>${t("studyColor")}<input name="color" type="color" value="${category?.color || "#5b8def"}"></label><label class="study-check"><input name="enabled" type="checkbox" ${category?.enabled !== 0 ? "checked" : ""}>${t("studyEnabled")}</label><label class="span2">${t("studyDescription")}<textarea name="description" maxlength="2000">${esc(category?.description || "")}</textarea></label></div><div class="modal-actions"><button type="submit" class="primary-btn">${t("saveDefaults")}</button></div></form></dialog>`;
  openDialog("study-category-dialog");
  $("[data-study-close]").onclick = closeDialog;
  $("#study-category-form").onsubmit = (e) =>
    guardedSubmit(e, async (event) => {
      const form = event.currentTarget,
        data = Object.fromEntries(new FormData(form));
      data.enabled = form.enabled.checked;
      data.display_order = parseNum(data.display_order);
      await api("/api/study/categories" + (category ? "/" + category.id : ""), {
        method: category ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      closeDialog();
      toast(t("studyCategorySaved"));
      await load();
    });
}
async function showStudyReport(start) {
  const version = (S.detailsVersion = (S.detailsVersion || 0) + 1);
  try {
    const w = await api("/api/study/weeks/" + start);
    if (version !== S.detailsVersion || S.view !== "study" || !w.revision)
      return;
    prepareDialog();
    $("#modal-root").innerHTML =
      `<dialog id="study-report-dialog"><div class="modal-head"><div><p class="eyebrow">${t("studyPeriod")}</p><h2>${t("studyHistory")}</h2><p>${studyPeriod(start)}</p></div><button type="button" class="icon-btn" data-study-close aria-label="${t("close")}">${icon("close")}</button></div><div class="study-report-content"><div class="study-report-total">${t("studyTotal")}<strong>${studyDuration(w.totals.overall)}</strong></div>${[
        "theoretical",
        "practical",
      ]
        .map(
          (g) =>
            `<section><h3>${studyGroup(g)}</h3>${w.entries
              .filter((e) => e.study_group === g && e.minutes)
              .map(
                (e) =>
                  `<div class="study-report-entry"><div><b>${esc(studyName(e))}${e.video ? " · " + t("studyVideo") : ""}</b><strong>${studyDuration(e.minutes)}</strong></div>${e.description ? `<p>${esc(e.description)}</p>` : ""}${e.details.length ? `<ul>${e.details.map((d) => `<li>${studyDuration(d.minutes)}: ${esc(d.label)}</li>`).join("")}</ul>` : ""}</div>`,
              )
              .join(
                "",
              )}<p><b>${studyGroup(g)}: ${studyDuration(w.totals[g])}</b></p></section>`,
        )
        .join(
          "",
        )}${w.notes ? `<p class="study-report-notes">${esc(w.notes)}</p>` : ""}<div class="button-row">${studyExportButtons(start)}</div></div><div class="modal-actions"><button type="button" class="danger-btn" id="study-delete">${t("studyDelete")}</button><button type="button" class="primary-btn" id="study-edit">${t("studyEdit")}</button></div></dialog>`;
    openDialog("study-report-dialog");
    $("[data-study-close]").onclick = closeDialog;
    $("#study-edit").onclick = async () => {
      if (ST.dirty && !confirm(t("studyUnsaved"))) return;
      closeDialog();
      ST.selected = start;
      ST.draft = w;
      ST.dirty = false;
      await load();
      $("#study-week").focus();
    };
    $("#study-delete").onclick = async () => {
      if (!confirm(t("studyDeleteConfirm"))) return;
      try {
        await api("/api/study/weeks/" + start + "?revision=" + w.revision, {
          method: "DELETE",
        });
        closeDialog();
        if (ST.selected === start) {
          ST.draft = null;
          ST.dirty = false;
        }
        await load();
      } catch (error) {
        toast(error.message, true);
      }
    };
    wireStudyExports($("#study-report-dialog"));
  } catch (error) {
    if (version === S.detailsVersion && S.view === "study")
      toast(error.message, true);
  }
}
function wireStudyExports(root) {
  root.querySelectorAll("[data-study-export]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          const format = button.dataset.studyExport,
            start = button.dataset.week,
            params = new URLSearchParams({
              ...(start ? { from_date: start, to_date: start } : ST.filters),
              format,
              language: isFa() ? "fa" : "en",
              digits: S.settings.persian_digits || "native",
            });
          const response = await fetch("/api/study/export?" + params);
          if (!response.ok) {
            const error = await response.json();
            throw Error(t(error.detail));
          }
          if (format === "text") {
            const text = await response.text();
            try {
              await navigator.clipboard.writeText(text);
              toast(t("studyCopied"));
            } catch {
              prepareDialog();
              $("#modal-root").innerHTML =
                `<dialog id="study-copy-dialog"><div class="modal-head"><h2>${t("studyCopyFallback")}</h2><button type="button" class="text-btn" id="study-copy-close">${t("close")}</button></div><textarea aria-label="${t("studyHistory")}" readonly>${esc(text)}</textarea></dialog>`;
              openDialog("study-copy-dialog");
              $("#study-copy-dialog textarea").select();
              $("#study-copy-close").onclick = closeDialog;
            }
          } else {
            const url = URL.createObjectURL(await response.blob()),
              link = document.createElement("a");
            link.href = url;
            link.download = "verity-weekly-study." + format;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          }
        } catch (error) {
          toast(error.message, true);
        } finally {
          button.disabled = false;
        }
      }),
  );
}
function wireStudy() {
  $("#study-week").onchange = async (e) => {
    try {
      const iso = normalizeDate(e.target.value);
      if (!iso) {
        toast(t("studyInvalidDate"), true);
        return;
      }
      if (ST.dirty && !confirm(t("studyUnsaved"))) {
        e.target.value = isFa()
          ? Jalali.format(ST.selected, S.settings.persian_digits)
          : ST.selected;
        return;
      }
      ST.selected = studyWeek(iso)[0];
      ST.dirty = false;
      ST.draft = null;
      await load();
    } catch (error) {
      toast(error.message, true);
    }
  };
  ["from", "to"].forEach(
    (key) =>
      ($("#study-" + key).onchange = async (e) => {
        try {
          const value = e.target.value ? normalizeDate(e.target.value) : "";
          if (e.target.value && !value) {
            toast(t("studyInvalidDate"), true);
            return;
          }
          const next = {
            ...ST.filters,
            [key + "_date"]: value ? studyWeek(value)[0] : "",
          };
          if (next.from_date && next.to_date && next.from_date > next.to_date) {
            toast(t("studyInvalidRange"), true);
            return;
          }
          ST.filters = next;
          await load();
        } catch (error) {
          toast(error.message, true);
        }
      }),
  );
  $("#study-category-filter").onchange = async (e) => {
    ST.filters.category_id = e.target.value;
    if (!e.target.value) delete ST.filters.category_id;
    await load();
  };
  $("#study-reset").onclick = () => {
    ST.filters = {};
    load();
  };
  $("#study-manage")?.addEventListener("click", renderStudyManager);
  $$("[data-study-week]").forEach(
    (b) => (b.onclick = () => showStudyReport(b.dataset.studyWeek)),
  );
  wireStudyExports($("#main-content"));
}

function studyLegendName(category) {
  // IDs distinguish equal names across groups and deliberate duplicate labels.
  const name = studyName(category);
  return ST.categories.some(
    (c) => c.id !== category.id && studyName(c) === name,
  )
    ? `${name} · ${studyGroup(category.study_group)} #${n(category.id)}`
    : name;
}
