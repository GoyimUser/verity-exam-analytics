/* Examination editing, metadata and comparison workflows; no scoring duplication. */
function allowExamDiscard() {
  if (!S.examDirty) return true;
  if (!confirm(t("discardExam"))) return false;
  S.examDirty = false;
  return true;
}

function watchExamDraft(form) {
  form.addEventListener("input", () => {
    S.examDirty = true;
  });
  form.addEventListener("change", () => {
    S.examDirty = true;
  });
}

function timingAndWeights(exam) {
  const form = $("#exam-form");
  if (S.settings.application_mode === "advanced") {
    const grid = form.querySelector(".form-grid");
    grid.insertAdjacentHTML(
      "beforeend",
      `<label>${t("unansweredWeight")}<input name="unanswered_weight" type="text" inputmode="decimal" value="${esc(exam?.unanswered_weight ?? S.settings.unanswered_weight ?? 0)}"></label><label>${t("startTime")}<input name="start_time" type="time" value="${esc(exam?.start_time || "")}"></label><label>${t("endTime")}<input name="end_time" type="time" value="${esc(exam?.end_time || "")}"></label><p class="span2 analysis-note">${t("timingHelp")}</p>`,
    );
  }
  watchExamDraft(form);
}

function detailFields(r) {
  const rows = [
    ["total", n(r.total_questions)],
    ["unanswered", n(r.unanswered)],
    ["topic", r.topic_name],
    ["tags", r.tags.join(", ")],
    [
      "type",
      L.en[String(r.exam_type).toLowerCase()]
        ? t(String(r.exam_type).toLowerCase())
        : r.exam_type,
    ],
    ["attempt", n(r.attempt_number)],
    ["duration", r.duration_minutes == null ? null : n(r.duration_minutes)],
    ["startTime", r.start_time],
    ["endTime", r.end_time],
    ["correctWeight", n(r.correct_weight)],
    ["incorrectWeight", n(r.incorrect_weight)],
    ["unansweredWeight", n(r.unanswered_weight ?? 0)],
    ["createdAt", r.created_at],
    ["updatedAt", r.updated_at],
  ];
  return `<dl class="record-metadata">${rows.map(([key, value]) => `<div><dt>${t(key)}</dt><dd><bdi>${esc(value ?? t("notRecorded"))}</bdi></dd></div>`).join("")}</dl>`;
}

function reportLink(format) {
  return (
    "/api/export/" +
    format +
    "?" +
    new URLSearchParams({
      ...S.filters,
      language: isFa() ? "fa" : "en",
      digits: S.settings.persian_digits || "native",
    })
  );
}

async function downloadExamReport(format, button) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (format === "pdf" && window.VerityAndroid) {
      window.VerityAndroid.printReport(
        reportLink(format).replace(
          "/api/export/pdf?",
          "/api/android/report?kind=exam&",
        ),
      );
      return;
    }
    const response = await fetch(reportLink(format));
    if (!response.ok) {
      const body = await response.json();
      throw Error(errorText(body.detail));
    }
    await saveDownload(await response.blob(), `verity-exams.${format}`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function saveDownload(blob, filename) {
  if (window.VerityAndroid) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    window.VerityAndroid.saveFile(
      data,
      filename,
      blob.type || "application/octet-stream",
    );
    return;
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function extendWorkspace() {
  if ($("#quick-form")) watchExamDraft($("#quick-form"));
  if (S.view === "settings") {
    $("#settings-form").insertAdjacentHTML(
      "beforeend",
      `<label>${t("unansweredWeight")}<input name="unanswered_weight" type="text" inputmode="decimal" value="${esc(S.settings.unanswered_weight ?? 0)}"></label>`,
    );
    if (S.settings.application_mode === "advanced") {
      $("#main-content .view").insertAdjacentHTML(
        "beforeend",
        `<article class="panel"><h2>${t("metadataTitle")}</h2><p>${t("metadataHelp")}</p><button class="outline-btn" id="manage-metadata">${t("manage")}</button></article>`,
      );
      $("#manage-metadata").onclick = showMetadata;
    }
  }
  if (S.view === "reports") {
    const button = $("#print-report");
    button.textContent = t("pdfReport");
    button.onclick = () => downloadExamReport("pdf", button);
    button.insertAdjacentHTML(
      "afterend",
      `<button type="button" id="excel-report" class="outline-btn">${t("excelReport")}</button>`,
    );
    $("#excel-report").onclick = () =>
      downloadExamReport("xlsx", $("#excel-report"));
  }
  if (S.view === "history") {
    S.compared ??= new Set();
    const table = $("#exam-table table");
    if (table) {
      table
        .querySelector("thead tr")
        .insertAdjacentHTML("afterbegin", `<th>${t("compareSelected")}</th>`);
      table.querySelectorAll("tbody tr").forEach((row, index) => {
        const r = S.exams[index];
        row.insertAdjacentHTML(
          "afterbegin",
          `<td><input type="checkbox" aria-label="${esc(t("compareSelected") + ": " + r.title)}" ${S.compared.has(r.id) ? "checked" : ""}></td>`,
        );
        const input = row.querySelector("input");
        input.onclick = (e) => e.stopPropagation();
        input.onkeydown = (e) => e.stopPropagation();
        input.onchange = () => {
          if (input.checked && S.compared.size >= 6) {
            input.checked = false;
            toast(t("compareLimit"), true);
            return;
          }
          input.checked ? S.compared.add(r.id) : S.compared.delete(r.id);
        };
      });
    }
    $("#exam-table").insertAdjacentHTML(
      "beforebegin",
      `<div class="button-row"><button class="outline-btn" id="compare-exams">${t("compareSelected")}</button><button class="text-btn" id="clear-comparison">${t("clearSelection")}</button></div>`,
    );
    $("#compare-exams").onclick = compareExams;
    $("#clear-comparison").onclick = () => {
      S.compared.clear();
      load();
    };
    $("#exam-table").insertAdjacentHTML(
      "afterend",
      `<nav class="pagination" aria-label="${t("historyPages")}"><button class="outline-btn" id="previous-page" ${!S.page ? "disabled" : ""}>${t("previous")}</button><span>${n((S.page || 0) + 1)} / ${n(Math.max(1, Math.ceil(S.analytics.count / 50)))}</span><button class="outline-btn" id="next-page" ${(S.page || 0) * 50 + S.exams.length >= S.analytics.count ? "disabled" : ""}>${t("next")}</button></nav>`,
    );
    $("#previous-page").onclick = () => {
      S.page--;
      load();
    };
    $("#next-page").onclick = () => {
      S.page = (S.page || 0) + 1;
      load();
    };
  }
}

async function compareExams() {
  if (S.compared.size < 2) {
    toast(t("compareMinimum"), true);
    return;
  }
  try {
    const rows = await Promise.all(
      [...S.compared].map((id) => api("/api/exams/" + id)),
    );
    const metrics = [
      ["date", (r) => dateDisplay(r.exam_date)],
      ["subject", (r) => r.subject_name],
      ["result", (r) => pct(r.percentage)],
      ["raw", (r) => n(r.raw_score)],
      ["maximum", (r) => n(r.maximum_score)],
      ["total", (r) => n(r.total_questions)],
      [
        "accuracy",
        (r) =>
          r.correct_answers + r.incorrect_answers
            ? pct(
                (r.correct_answers /
                  (r.correct_answers + r.incorrect_answers)) *
                  100,
              )
            : "—",
      ],
      [
        "duration",
        (r) => (r.duration_minutes == null ? "—" : n(r.duration_minutes)),
      ],
      ["attempt", (r) => n(r.attempt_number)],
      ["correctWeight", (r) => n(r.correct_weight)],
      ["incorrectWeight", (r) => n(r.incorrect_weight)],
      ["unansweredWeight", (r) => n(r.unanswered_weight)],
    ];
    prepareDialog();
    $("#modal-root").innerHTML =
      `<dialog id="compare-dialog"><div class="modal-head"><h2>${t("compareSelected")}</h2><button class="icon-btn" id="compare-close" aria-label="${t("close")}">${icon("close")}</button></div><p>${t("compareCaution")}</p><div class="comparison-scroll" tabindex="0" role="region" aria-label="${t("compareSelected")}"><table><thead><tr><th>${t("metric")}</th>${rows.map((r) => `<th><bdi>${esc(r.title)}</bdi></th>`).join("")}</tr></thead><tbody>${metrics.map(([key, fn]) => `<tr><th scope="row">${t(key)}</th>${rows.map((r) => `<td><bdi>${esc(fn(r) ?? "—")}</bdi></td>`).join("")}</tr>`).join("")}</tbody></table></div></dialog>`;
    $("#compare-close").onclick = closeDialog;
    openDialog("compare-dialog");
  } catch (e) {
    toast(e.message, true);
  }
}

async function showMetadata() {
  const version = (S.metadataVersion = (S.metadataVersion || 0) + 1);
  try {
    const data = await api("/api/metadata");
    if (version !== S.metadataVersion) return;
    prepareDialog();
    $("#modal-root").innerHTML =
      `<dialog id="metadata-dialog"><div class="modal-head"><h2>${t("metadataTitle")}</h2><button class="icon-btn" id="metadata-close" aria-label="${t("close")}">${icon("close")}</button></div><p>${t("metadataHelp")}</p>${["subjects", "topics"].map((kind) => `<h3>${t(kind === "subjects" ? "subject" : "topic")}</h3>${data[kind].map((row) => `<form class="metadata-row" data-kind="${kind}" data-id="${row.id}"><label>${t("name")}<input name="name" required maxlength="500" value="${esc(row.name)}"></label><span>${t("count")}: ${n(row.exam_count)}</span><button class="outline-btn">${t("save")}</button><button type="button" class="danger-btn" data-remove ${row.exam_count ? "disabled" : ""}>${t("delete")}</button></form>`).join("")}`).join("")}</dialog>`;
    $("#metadata-close").onclick = closeDialog;
    openDialog("metadata-dialog");
    $$(".metadata-row").forEach((form) => {
      const send = async (method) => {
        const buttons = [...form.querySelectorAll("button")];
        buttons.forEach((b) => (b.disabled = true));
        try {
          await api(`/api/metadata/${form.dataset.kind}/${form.dataset.id}`, {
            method,
            headers: { "Content-Type": "application/json" },
            ...(method === "PATCH"
              ? { body: JSON.stringify({ name: form.elements.name.value }) }
              : {}),
          });
          if (form.isConnected) await showMetadata();
        } catch (e) {
          toast(e.message, true);
          buttons.forEach((b) => (b.disabled = false));
        }
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        send("PATCH");
      };
      form.querySelector("[data-remove]").onclick = () => {
        if (confirm(t("deleteConfirm"))) send("DELETE");
      };
    });
  } catch (e) {
    toast(e.message, true);
  }
}
