/* Analytical explanations and workflows share the existing records, dialogs and API. */

function metric(label, value) {
  return `<div class="analysis-metric"><span>${esc(label)}</span><strong>${value}</strong></div>`;
}
function sampleNote(count) {
  return `<p class="analysis-note">${t("sample")}: ${n(count)}${count < 5 ? " · " + t("tentative") : ""}</p>`;
}
function evidenceTable(ids) {
  const selected = new Set(ids),
    rows = S.exams.filter((r) => selected.has(r.id));
  return `<details class="analysis-evidence"><summary>${t("evidence")} (${n(ids.length)})</summary><div class="chart-table" tabindex="0" role="region" aria-label="${t("evidence")}"><table><thead><tr><th>${t("name")}</th><th>${t("date")}</th><th>${t("result")}</th></tr></thead><tbody>${rows.map((r) => `<tr><td><button class="row-open" type="button" data-evidence-id="${r.id}">${esc(r.title)}</button></td><td>${dateDisplay(r.exam_date)}</td><td>${pct(r.percentage)}</td></tr>`).join("")}${ids
    .filter((id) => !rows.some((r) => r.id === id))
    .map(
      (id) =>
        `<tr><td colspan="3"><button class="row-open" type="button" data-evidence-id="${id}">${t("details")} #${n(id)}</button></td></tr>`,
    )
    .join("")}</tbody></table></div></details>`;
}
function wireEvidence(root) {
  root
    .querySelectorAll("[data-evidence-id]")
    .forEach(
      (b) => (b.onclick = () => showDetails(Number(b.dataset.evidenceId))),
    );
}
function definitions(a) {
  const s = a.summary || {};
  return `<details class="analysis-definitions"><summary>${t("definitions")}</summary><p>${t("definitionsHelp")}</p><div class="analysis-metrics">${metric(t("average"), pct(s.mean_percentage))}${metric(t("weighted"), pct(s.weighted_percentage))}${metric(t("questionWeighted"), pct(s.question_weighted_percentage))}${metric(t("completion"), pct(s.completion_rate))}${metric(t("meanCompletion"), pct(s.mean_completion_rate))}${metric(t("accuracy"), pct(s.overall_accuracy))}</div><p>${t("completionHelp")}</p></details><p class="analysis-note">${t("sampleHelp")}</p>${sampleNote(a.count)}`;
}
function comparisonSummary(result) {
  if (!result) return `<p>${t("noComparison")}</p>`;
  return `<div class="analysis-metrics">${["first", "second"]
    .map((key, index) => {
      const g = result[key];
      return `<section>${metric(t(index ? "secondPeriod" : "firstPeriod"), pct(g.mean))}${sampleNote(g.count)}<p>${g.from ? dateDisplay(g.from) + " — " + dateDisplay(g.to) : "—"}</p>${evidenceTable(g.ids)}</section>`;
    })
    .join(
      "",
    )}</div><div class="analysis-metrics">${metric(t("change"), n(result.delta_pp) + " " + t("points"))}${metric(t("volatility"), n(result.volatility_delta_pp) + " " + t("points"))}${metric(t("overlap"), n(result.overlapping_ids.length))}</div>`;
}
function breakdownTable(rows, isWeek = false) {
  return `<div class="chart-table" tabindex="0" role="region" aria-label="${t(isWeek ? "weekly" : "topics")}"><table><thead><tr><th>${t(isWeek ? "date" : "observation")}</th><th>${t("sample")}</th><th>${t("average")}</th><th>${t("errorRate")}</th><th>${t("consistency")}</th><th>${t("evidence")}</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${isWeek ? dateDisplay(r.label) : esc(r.kind === "topic" ? `${subjectLabel(r.subject)} / ${subjectLabel(r.topic)}` : { practice: t("practice"), mock: t("mock"), official: t("official"), quiz: t("quiz") }[r.label.toLowerCase()] || r.label)}${r.tentative ? `<small class="analysis-note">${t("tentative")}</small>` : ""}</th><td>${n(r.count)}</td><td>${pct(r.mean)}</td><td>${pct(r.error_rate)}</td><td>${n(r.std_dev)}</td><td>${evidenceTable(r.ids)}</td></tr>`).join("")}</tbody></table></div>`;
}
function analyticalModules(a) {
  const e = a.extended;
  if (!e) return "";
  const s = e.streaks;
  const dateField = (key, label) =>
    `<label>${t(label)}<input name="${key}" required ${isFa() ? `type="text" placeholder="${t("dateHint")}"` : 'type="date"'}></label>`;
  return `<article class="panel analysis-panel">${definitions(a)}<p>${t("scope")}: ${esc(S.filters.subject || t("allSubjects"))} · ${S.filters.from_date ? dateDisplay(S.filters.from_date) : t("allDates")} — ${S.filters.to_date ? dateDisplay(S.filters.to_date) : t("allDates")}</p></article>
    <div class="grid two"><article class="panel analysis-panel"><h2>${t("slope")}</h2>${metric(t("observed"), n(e.slope_pp_per_day, { digits: 4 }))}<p>${t("slopeHelp")}</p>${sampleNote(a.count)}</article><article class="panel analysis-panel"><h2>${t("streaks")}</h2><div class="analysis-metrics">${[
      ["currentUp", s.current_improvements],
      ["currentDown", s.current_declines],
      ["longestUp", s.longest_improvements],
      ["longestDown", s.longest_declines],
    ]
      .map(([k, v]) => metric(t(k), n(v)))
      .join(
        "",
      )}</div><p>${t("streakHelp")}</p>${s.periods.map((p) => `<details><summary>${t(p.direction > 0 ? "longestUp" : "longestDown")} · ${n(p.ids.length - 1)}</summary>${evidenceTable(p.ids)}</details>`).join("")}</article></div>
    <article class="panel analysis-panel"><h2>${t("recentCompare")}</h2><p>${t("recentHelp")}</p>${comparisonSummary(e.recent_comparison)}</article>
    <article class="panel analysis-panel"><h2>${t("weekly")}</h2><p>${t("weekHelp")}</p><div class="analysis-metrics">${["best_week", "worst_week"].map((k, i) => (e[k] ? metric(t(i ? "worstWeek" : "bestWeek"), `${dateDisplay(e[k].label)} · ${pct(e[k].mean)} · ${n(e[k].count)} ${t("sample")}`) : "")).join("")}</div>${breakdownTable(e.weekly, true)}</article>
    <article class="panel analysis-panel"><h2>${t("topics")}</h2>${breakdownTable(e.topics)}</article><article class="panel analysis-panel"><h2>${t("types")}</h2>${breakdownTable(e.exam_types)}</article>
    <div class="grid two"><article class="panel analysis-panel"><h2>${t("comparePeriods")}</h2><p>${t("compareHelp")}</p><form id="period-comparison"><fieldset><legend>${t("firstPeriod")}</legend>${dateField("first_from", "from")}${dateField("first_to", "to")}</fieldset><fieldset><legend>${t("secondPeriod")}</legend>${dateField("second_from", "from")}${dateField("second_to", "to")}</fieldset><button class="primary-btn" type="submit">${t("compareAction")}</button></form><div id="period-result" role="status"></div></article>
    <article class="panel analysis-panel"><h2>${t("simulation")}</h2><p>${t("scenarioHelp")}</p><form id="scenario-form"><label>${t("assumedAccuracy")}<input name="probability" type="text" inputmode="decimal" value="50" required></label><button class="primary-btn" type="submit">${t("simulate")}</button></form><div id="scenario-result" role="status"></div><h3>${t("negativeImpact")}</h3>${metric(t("penalty"), n(a.composition.reduce_wrong_gain_pp))}<p>${t("penaltyHelp")}</p></article></div>`;
}
function wireAnalyticalModules() {
  const comparison = $("#period-comparison"),
    scenario = $("#scenario-form");
  if (!comparison) return;
  comparison.onsubmit = (e) =>
    guardedSubmit(e, async (event) => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      for (const k of Object.keys(data)) {
        data[k] = normalizeDate(data[k]);
        if (!data[k]) throw Error(t("dateInvalid"));
      }
      if (data.first_from > data.first_to || data.second_from > data.second_to)
        throw Error(t("dateRangeInvalid"));
      data.subject = S.filters.subject || "";
      data.search = S.filters.search || "";
      const result = await api("/api/comparison?" + new URLSearchParams(data));
      if (!comparison.isConnected) return;
      $("#period-result").innerHTML = comparisonSummary(result);
      wireEvidence($("#period-result"));
    });
  scenario.onsubmit = (e) =>
    guardedSubmit(e, async (event) => {
      const probability = parseNum(event.currentTarget.probability.value) / 100;
      if (!Number.isFinite(probability) || probability < 0 || probability > 1)
        throw Error(t("assumedAccuracy") + ": 0–100");
      const result = await api(
        "/api/simulation?" +
          new URLSearchParams({
            from_date: S.filters.from_date || "",
            to_date: S.filters.to_date || "",
            subject: S.filters.subject || "",
            search: S.filters.search || "",
            probability,
          }),
      );
      if (!scenario.isConnected) return;
      $("#scenario-result").innerHTML =
        `<div class="analysis-metrics">${metric(t("expected"), pct(result.mean_expected_percentage))}${metric(t("gain"), n(result.mean_gain_pp))}</div>${sampleNote(result.count)}${evidenceTable(result.rows.map((r) => r.id))}`;
      wireEvidence($("#scenario-result"));
    });
  wireEvidence($("#analysis-modules"));
}
function renderGroundedInsights(a) {
  $("#insights").innerHTML = (a.insights || [])
    .map((item) => {
      let title,
        body,
        ids = item.evidence?.ids || [];
      if (item.kind === "trend") {
        title = t("recentCompare");
        const e = item.evidence;
        body = `<p>${pct(e.second.mean)} / ${pct(e.first.mean)} · ${t("change")}: ${n(e.delta_pp)} ${t("points")}</p><details><summary>${t("evidence")}</summary>${comparisonSummary(e)}<p>${t("recentHelp")}</p></details>`;
      } else if (item.kind === "subject") {
        title = t("subjectFact");
        body = `<p>${esc(subjectLabel(item.subject.subject))}: ${pct(item.subject.error_rate)}</p>${sampleNote(item.subject.count)}`;
      } else if (item.kind === "completion") {
        title = t("completionFact");
        body = `<p>${pct(a.composition.unanswered_rate)}</p>`;
      } else {
        title = t("consistencyFact");
        body = `<p>${n(a.summary.std_dev)} ${t("points")}</p>`;
      }
      const ev = item.evidence;
      return `<div class="insight"><b>${title}</b>${body}${ids.length ? `<p>${dateDisplay(ev.from)} — ${dateDisplay(ev.to)}</p>${evidenceTable(ids)}` : ""}</div>`;
    })
    .join("");
  $("#limits").innerHTML = `<p>${t("sampleHelp")}</p>${sampleNote(a.count)}`;
  wireEvidence($("#insights"));
}
async function previewImport(file) {
  if (!file) return;
  prepareDialog();
  $("#modal-root").innerHTML =
    `<dialog id="import-dialog"><div class="modal-head"><h2>${t("importPreview")}</h2><button class="icon-btn" id="import-close" aria-label="${t("close")}">${icon("close")}</button></div><p>${t("importHelp")}</p><label class="import-choice"><input type="checkbox" id="allow-import-duplicates">${t("duplicatesAllowed")}</label><div id="import-results" role="status">${t("loading")}</div><div class="modal-actions"><button class="outline-btn" id="import-refresh">${t("previewAgain")}</button><button class="primary-btn" id="import-commit" disabled>${t("commitImport")}</button></div></dialog>`;
  openDialog("import-dialog");
  $("#import-close").onclick = closeDialog;
  const dialog = $("#import-dialog"),
    choice = $("#allow-import-duplicates"),
    commit = $("#import-commit");
  let version = 0,
    busy = false;
  const send = (preview) => {
    const body = new FormData();
    body.append("file", file);
    return api(
      `/api/import?preview=${preview}&allow_duplicate=${choice.checked}`,
      { method: "POST", body },
    );
  };
  const refresh = async () => {
    const current = ++version;
    commit.disabled = true;
    try {
      const result = await send(true);
      if (!dialog.isConnected || current !== version) return;
      $("#import-results").innerHTML =
        `<p>${t("accepted")}: ${n(result.created)} · ${t("duplicateRow")}: ${n(result.skipped)} · ${t("invalid")}: ${n(result.errors.length)}</p><div class="chart-table" tabindex="0" role="region" aria-label="${t("importPreview")}"><table><thead><tr><th>${t("row")}</th><th>${t("status")}</th><th>${t("message")}</th></tr></thead><tbody>${result.rows.map((row) => `<tr><td>${n(row.row)}</td><td>${t(row.status === "duplicate" ? "duplicateRow" : row.status)}</td><td dir="auto">${esc(row.error ? errorText(row.error) : row.title)}</td></tr>`).join("")}</tbody></table></div>`;
      commit.disabled = result.errors.length > 0 || result.created === 0;
    } catch (error) {
      if (dialog.isConnected && current === version) toast(error.message, true);
    }
  };
  choice.onchange = refresh;
  $("#import-refresh").onclick = refresh;
  commit.onclick = async () => {
    if (busy) return;
    busy = true;
    commit.disabled = true;
    choice.disabled = true;
    $("#import-refresh").disabled = true;
    try {
      const result = await send(false);
      closeDialog();
      toast(`${t("imported")} · ${n(result.created)}`);
      await load();
    } catch (error) {
      toast(error.message, true);
      if (dialog.isConnected) {
        choice.disabled = false;
        $("#import-refresh").disabled = false;
        await refresh();
      }
    } finally {
      busy = false;
    }
  };
  await refresh();
}
