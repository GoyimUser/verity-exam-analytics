/* Centralized presentation utilities. Dates and numbers cross the API in canonical form. */
function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function localizedNumber(value) {
  let s = Jalali.toLatin(value ?? "")
    .trim()
    .replace(/[\u200e\u200f\u061c]/g, "")
    .replace(/−/g, "-")
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
  if (!s || !/^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) return NaN;
  return Number(s.replaceAll(",", ""));
}

const persianErrors = [
  [
    /matching title|matching record/i,
    "رکورد مشابه وجود دارد. شماره تلاش را تغییر دهید یا ایجاد تلاش جداگانه را تأیید کنید.",
  ],
  [
    /cannot exceed total/i,
    "مجموع پاسخ‌های درست و نادرست نباید از کل پرسش‌ها بیشتر باشد.",
  ],
  [/total questions.*positive/i, "تعداد کل پرسش‌ها باید عدد صحیح مثبت باشد."],
  [
    /correct answers.*non-negative/i,
    "تعداد پاسخ‌ها باید عدد صحیح نامنفی باشد.",
  ],
  [
    /whole number/i,
    "تعداد پرسش‌ها و شماره تلاش باید عدد صحیح در محدوده مجاز باشند.",
  ],
  [/Attempt number must/i, "شماره تلاش باید حداقل یک باشد."],
  [
    /Allow duplicate must/i,
    "گزینه تلاش جداگانه باید مقدار درست یا نادرست داشته باشد.",
  ],
  [/HH:MM/i, "زمان را با قالب ساعت و دقیقه (HH:MM) وارد کنید."],
  [/Duration must/i, "مدت باید عددی متناهی و نامنفی باشد."],
  [/must be text/i, "نام، درس، موضوع، نوع آزمون و یادداشت باید متن باشند."],
  [
    /too long/i,
    "متن از طول مجاز بیشتر است: نام و فراداده ۵۰۰ نویسه، یادداشت ۲۰۰۰۰ نویسه.",
  ],
  [
    /Tags must|100 tags/i,
    "حداکثر ۱۰۰ برچسب متنی با طول حداکثر ۱۰۰ نویسه وارد کنید.",
  ],
  [/title is required/i, "نام آزمون الزامی است."],
  [
    /date.*YYYY|start date|closed date ranges/i,
    "تاریخ‌ها را معتبر وارد کنید؛ آغاز بازه نباید پس از پایان باشد.",
  ],
  [/not found/i, "آزمون پیدا نشد؛ ممکن است حذف شده باشد."],
  [/Preference values/i, "مقادیر تنظیمات باید متن یا عدد باشند."],
  [/Theme must/i, "ظاهر باید روشن یا تیره باشد."],
  [/Application mode must/i, "حالت برنامه باید سریع یا پیشرفته باشد."],
  [/Language must/i, "زبان باید فارسی یا انگلیسی باشد."],
  [/digit setting/i, "نوع رقم باید فارسی یا لاتین باشد."],
  [
    /weight|Scoring|numeric range|must be numeric|finite range/i,
    "ضرایب باید عدد متناهی در محدوده مجاز باشند؛ امتیاز درست مثبت و جریمه نامنفی است.",
  ],
  [
    /JSON object|Each examination/i,
    "فایل باید یک شیء JSON با آرایه exams باشد و هر آزمون یک شیء باشد.",
  ],
  [/10000 records/i, "هر فایل حداکثر ۱۰۰۰۰ آزمون را پشتیبانی می‌کند."],
  [
    /Import rejected/i,
    "ورود داده به دلیل ردیف نامعتبر رد شد. هیچ رکوردی ذخیره نشد؛ پیش‌نمایش را بررسی کنید.",
  ],
  [
    /original database was recovered/i,
    "بازیابی انجام نشد؛ پایگاه داده قبلی برگردانده شد.",
  ],
  [
    /Backup|SQLite backup/i,
    "فایل پشتیبان نامعتبر، ناسازگار یا ناقص است. یک پشتیبان سالم با نسخه پشتیبانی‌شده انتخاب کنید.",
  ],
  [/Assumed accuracy/i, "احتمال فرضی باید بین صفر و یک باشد."],
];
function errorText(message) {
  const s = typeof message === "string" ? message : JSON.stringify(message);
  if (L[isFa() ? "fa" : "en"][s]) return t(s);
  if (/fetch|network|Failed to fetch/i.test(s)) return t("networkError");
  if (/too large/i.test(s)) return t("tooLarge");
  if (!isFa()) return s;
  if (/[\u0600-\u06ff]/.test(s)) return s;
  return (
    persianErrors.find(([pattern]) => pattern.test(s))?.[1] ||
    t("invalidRequest")
  );
}
function subjectLabel(value) {
  return value === null || value === undefined || value === ""
    ? t("unassigned")
    : value;
}
function scopeBar() {
  const parts = Object.entries(S.filters)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `${t({ search: "search", subject: "subject", from_date: "from", to_date: "to" }[k] || k)}: ${k.endsWith("_date") ? dateDisplay(v) : v}`,
    );
  return parts.length
    ? `<aside class="scope-bar"><span>${t("activeScope")}: ${esc(parts.join(" · "))}</span><button type="button" class="text-btn" data-reset-scope>${t("reset")}</button></aside>`
    : "";
}
function wireLocale() {
  document.querySelectorAll("input,select,textarea").forEach((input) => {
    input.oninvalid = () =>
      input.setCustomValidity(
        t(input.validity.valueMissing ? "requiredInput" : "invalidRequest"),
      );
    input.addEventListener("input", () => input.setCustomValidity(""));
  });
  document.querySelectorAll("[data-reset-scope]").forEach(
    (b) =>
      (b.onclick = () => {
        S.filters = {};
        load();
      }),
  );
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.type = "text";
    input.inputMode = "decimal";
  });
  document
    .querySelectorAll("input.localized-date,#period-comparison input")
    .forEach((input) => {
      if (!isFa()) {
        input.type = "date";
        return;
      }
      if (input.dataset.calendar) return;
      input.dataset.calendar = "true";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-btn calendar-launch";
      button.textContent = t("calendar");
      button.setAttribute(
        "aria-label",
        `${t("calendar")} — ${input.closest("label")?.childNodes[0]?.textContent || t("date")}`,
      );
      input.after(button);
      button.onclick = () => openCalendar(input);
    });
}
function openCalendar(input) {
  const dialog = document.createElement("dialog");
  dialog.className = "calendar-dialog";
  dialog.setAttribute("aria-label", t("calendar"));
  const iso = Jalali.parse(input.value) || localToday();
  let [year, month] = Jalali.format(iso, "latin").split("/").map(Number);
  year = Math.min(1600, Math.max(1200, year));
  document.body.append(dialog);
  const close = () => {
    dialog.close();
    dialog.remove();
    input.focus();
  };
  const draw = () => {
    const days = [];
    for (let d = 1; d <= 31; d++) {
      const value = Jalali.parse(`${year}/${month}/${d}`);
      if (value) days.push({ d, value });
    }
    const label = new Intl.DateTimeFormat("fa-IR", {
      calendar: "persian",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(days[0].value + "T12:00:00Z"));
    dialog.innerHTML = `<div class="calendar-head"><h2>${t("calendar")}</h2><button type="button" class="text-btn" data-close>${t("close")}</button></div><p>${t("calendarRange")}</p><label>${t("year")}<input data-year inputmode="numeric" value="${n(year, { digits: 0 }).replace(/[٬,]/g, "")}"></label><div class="calendar-head"><button type="button" class="text-btn" data-prev ${year === 1200 && month === 1 ? "disabled" : ""}>${t("previousMonth")}</button><strong>${label} ${n(year, { digits: 0 }).replace(/[٬,]/g, "")}</strong><button type="button" class="text-btn" data-next ${year === 1600 && month === 12 ? "disabled" : ""}>${t("nextMonth")}</button></div><div class="calendar-days">${t(
      "weekdays",
    )
      .map((day) => `<span>${day}</span>`)
      .join(
        "",
      )}${"<span></span>".repeat((new Date(days[0].value + "T12:00:00Z").getUTCDay() + 1) % 7)}${days.map(({ d, value }) => `<button type="button" class="outline-btn" data-date="${value}" aria-label="${n(d)} ${label} ${n(year, { digits: 0 })}">${n(d)}</button>`).join("")}</div>`;
    dialog.querySelector("[data-close]").onclick = close;
    dialog.querySelector("[data-year]").onchange = (e) => {
      const value = localizedNumber(e.target.value);
      if (Number.isInteger(value) && value >= 1200 && value <= 1600) {
        year = value;
        draw();
      } else {
        e.target.setCustomValidity(t("calendarRange"));
        e.target.reportValidity();
      }
    };
    for (const [attr, delta] of [
      ["prev", -1],
      ["next", 1],
    ])
      dialog.querySelector(`[data-${attr}]`).onclick = () => {
        month += delta;
        if (month === 0) {
          month = 12;
          year--;
        }
        if (month === 13) {
          month = 1;
          year++;
        }
        draw();
        dialog.querySelector(`[data-${attr}]`).focus();
      };
    dialog.querySelectorAll("[data-date]").forEach(
      (b) =>
        (b.onclick = () => {
          input.value = Jalali.format(
            b.dataset.date,
            S.settings.persian_digits,
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
          close();
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }),
    );
  };
  draw();
  dialog.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  dialog.showModal();
  dialog.querySelector("[data-close]").focus();
}
const previewRequests = new WeakMap();
function scheduleScorePreview(form, target) {
  if (!form) return;
  const old = previewRequests.get(form);
  if (old) {
    clearTimeout(old.timer);
    old.controller?.abort();
  }
  const state = {};
  previewRequests.set(form, state);
  const output = document.querySelector(target);
  const fields = ["total_questions", "correct_answers", "incorrect_answers"];
  if (fields.some((k) => !form.elements[k]?.value.trim())) {
    output.textContent = t("enterCounts");
    return;
  }
  output.textContent = t("loading");
  state.timer = setTimeout(async () => {
    const data = Object.fromEntries(
      fields.map((k) => [k, localizedNumber(form.elements[k].value)]),
    );
    const original = form.id === "exam-form" ? S.selected : null;
    for (const k of ["correct_weight", "incorrect_weight", "unanswered_weight"])
      data[k] = localizedNumber(
        form.elements[k]?.value ?? original?.[k] ?? S.settings[k],
      );
    state.controller = new AbortController();
    try {
      const result = await api("/api/score-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: state.controller.signal,
      });
      if (previewRequests.get(form) !== state || !form.isConnected) return;
      output.innerHTML = `<strong>${pct(result.percentage)}</strong> · ${t("raw")} ${n(result.raw_score, 2)} / ${n(result.maximum_score, 2)} · ${n(result.unanswered)} ${t("unanswered")}`;
    } catch (error) {
      if (
        error.name === "AbortError" ||
        previewRequests.get(form) !== state ||
        !form.isConnected
      )
        return;
      output.textContent = errorText(error.message);
    }
  }, 180);
}
