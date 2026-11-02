function bidiText(value) {
  return "\u2068" + String(value) + "\u2069";
}
/* Shared presentation and accessibility helpers. No exam data is stored here. */
function icon(name) {
  const paths = {
    study: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l4 2",
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    history: "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5",
    analytics: "M3 3v18h18 M6 15l4-5 4 3 6-8",
    subjects: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16",
    reports: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
    settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
    language:
      "M3 5h12 M9 3v2 M5 5c0 6 5 9 9 10 M13 5c0 6-5 9-10 10 M14 21l4-10 4 10 M16 17h4",
    theme: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    close: "M6 6l12 12 M18 6L6 18",
    add: "M12 5v14 M5 12h14",
    filter: "M3 4h18l-7 8v7l-4 2v-9z",
    sort: "M8 4v16 M4 16l4 4 4-4 M16 20V4 M12 8l4-4 4 4",
    download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
    upload: "M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5",
    backup:
      "M4 7c0-5 16-5 16 0s-16 5-16 0v10c0 5 16 5 16 0V7 M4 12c0 5 16 5 16 0",
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name] || paths.overview}"/></svg>`;
}

let dialogOpener = null;
function prepareDialog() {
  S.examDirty = false;
  const previous = document.querySelector("#modal-root dialog");
  if (!previous) dialogOpener = document.activeElement;
  else {
    previous.onclose = null;
    previous.close();
  }
}
function openDialog(id) {
  const dialog = document.getElementById(id),
    heading = dialog.querySelector("h2");
  heading.id = id + "-heading";
  dialog.setAttribute("aria-labelledby", heading.id);
  const status = document.createElement("div");
  status.className = "dialog-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  dialog.append(status);
  dialog.oncancel = (event) => {
    event.preventDefault();
    closeDialog();
  };
  dialog.onclose = () => closeDialog();
  dialog.onkeydown = (event) => {
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length);
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  };
  dialog.showModal();
  (dialog.querySelector("input") || dialog.querySelector("button")).focus();
}
function closeDialog() {
  if (!allowExamDiscard()) return;
  S.metadataVersion = (S.metadataVersion || 0) + 1;
  S.detailsVersion = (S.detailsVersion || 0) + 1;
  const dialog = document.querySelector("#modal-root dialog");
  if (dialog) {
    dialog.onclose = null;
    dialog.close();
    dialog.remove();
  }
  const target = dialogOpener?.isConnected
    ? dialogOpener
    : document.querySelector("#add-btn");
  target?.focus();
  dialogOpener = null;
}

function setMenu(open) {
  const sidebar = document.querySelector("#sidebar"),
    button = document.querySelector("#menu-btn");
  if (!sidebar || !button) return;
  sidebar.classList.toggle("open", open);
  button.setAttribute("aria-expanded", String(open));
  const mobile = matchMedia("(max-width:780px)").matches;
  sidebar.inert = mobile && !open;
  document.querySelector("#main-content").inert = mobile && open;
  document.querySelector("#nav-backdrop").hidden = !open;
  if (mobile && open) sidebar.querySelector("#nav-close").focus();
  else if (mobile) button.focus();
}
function wireAccessibility() {
  const sidebar = document.querySelector("#sidebar"),
    mobile = matchMedia("(max-width:780px)").matches;
  sidebar.inert = mobile;
  document.querySelector("#menu-btn").onclick = () =>
    setMenu(!sidebar.classList.contains("open"));
  document.querySelector("#nav-close").onclick = () => setMenu(false);
  document.querySelector("#nav-backdrop").onclick = () => setMenu(false);
  sidebar.onkeydown = (event) => {
    if (
      !matchMedia("(max-width:780px)").matches ||
      !sidebar.classList.contains("open")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false);
    }
    if (event.key === "Tab") {
      const controls = [...sidebar.querySelectorAll("button")].filter(
        (el) => el.getClientRects().length,
      );
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1).focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0].focus();
      }
    }
  };
  document.querySelectorAll(".nav-item").forEach((button) => {
    if (button.classList.contains("active"))
      button.setAttribute("aria-current", "page");
  });
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === S.settings.application_mode),
      ),
    );
  document
    .querySelectorAll("[data-language]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === S.settings.language),
      ),
    );
  document
    .querySelector("#theme-btn")
    .setAttribute("aria-pressed", String(S.settings.theme === "dark"));
}

function chartDescription(el, opt) {
  const title =
    el.closest("article")?.querySelector("h2")?.textContent || t("analytics");
  const rows = [];
  for (const series of opt.series || []) {
    (series.data || []).forEach((datum, index) => {
      const value = datum?.value ?? datum;
      const label = Array.isArray(value)
        ? `${bidiText(opt.yAxis?.data?.[value[1]] ?? "")} · ${bidiText(opt.xAxis?.data?.[value[0]] ?? "")}${value.length > 3 ? " · " + t("sample") + ": " + n(value[3]) : ""}`
        : datum?.title ||
          opt.xAxis?.data?.[index] ||
          opt.yAxis?.data?.[index] ||
          t("composition");
      const number = Array.isArray(value) ? value[2] : value;
      if (typeof number === "number" && Number.isFinite(number))
        rows.push({ series: series.name || title, label, value: number });
    });
  }
  const primary = rows.filter((row) => row.series === rows[0]?.series),
    values = primary.map((row) => row.value);
  const formatValue = el.id.startsWith("study-")
    ? studyDuration
    : el.id.includes("distribution") || el.id === "composition-chart"
      ? n
      : pct;
  const summary =
    el.id === "composition-chart"
      ? `${title}. ${rows.map((row) => `${row.series}: ${n(row.value)}`).join(" · ")}`
      : values.length
        ? `${title}. ${t("observations")}: ${n(values.length)}. ${t("lowest")}: ${formatValue(values.reduce((a, b) => Math.min(a, b)))}. ${t("highest")}: ${formatValue(values.reduce((a, b) => Math.max(a, b)))}.`
        : t("noRecords");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", summary);
  const details = document.createElement("details");
  details.className = "chart-data";
  details.innerHTML = `<summary>${t("chartData")}</summary><p>${esc(summary)}</p><div class="chart-table" tabindex="0" role="region" aria-label="${esc(title)}"></div>`;
  details.addEventListener("toggle", () => {
    if (!details.open || details.dataset.ready) return;
    details.dataset.ready = "true";
    details.querySelector(".chart-table").innerHTML =
      `<table><caption>${esc(title)}</caption><thead><tr><th scope="col">${t("series")}</th><th scope="col">${t("observation")}</th><th scope="col">${t("value")}</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.series)}</td><th scope="row">${esc(row.label)}</th><td>${formatValue(row.value)}</td></tr>`).join("")}</tbody></table>`;
  });
  el.after(details);
  return summary;
}

function loadingState(failed = false) {
  const root = document.querySelector("#app");
  root.innerHTML = `<main class="load-state"><h1>${failed ? t("loadFailed") : t("loading")}</h1><p>${failed ? t("loadHelp") : t("loadWait")}</p>${failed ? `<button id="retry-load" class="primary-btn">${t("retry")}</button>` : ""}</main>`;
  if (failed) document.querySelector("#retry-load").onclick = () => load();
}
