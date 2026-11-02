/* Intl is the single calendar authority. Input range: Jalali 1200–1600. */
window.Jalali = (() => {
  const fa = "۰۱۲۳۴۵۶۷۸۹",
    toLatin = (v) =>
      String(v ?? "")
        .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
  function format(iso, digits = "native") {
    if (!iso) return "—";
    const p = formatter.formatToParts(new Date(iso + "T12:00:00Z")),
      get = (t) => p.find((x) => x.type === t).value;
    const out = get("year") + "/" + get("month") + "/" + get("day");
    return digits === "native" ? out.replace(/\d/g, (d) => fa[Number(d)]) : out;
  }
  function parse(value) {
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(
      toLatin(value).trim(),
    );
    if (!match) return null;
    const [y, m, d] = match.slice(1).map(Number);
    if (y < 1200 || y > 1600 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const target = y * 10000 + m * 100 + d;
    let low = Math.floor(Date.UTC(y + 621, 0, 1) / 86400000),
      high = Math.floor(Date.UTC(y + 622, 11, 31) / 86400000);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2),
        iso = new Date(mid * 86400000).toISOString().slice(0, 10),
        parts = format(iso, "latin").split("/").map(Number),
        key = parts[0] * 10000 + parts[1] * 100 + parts[2];
      if (key === target) return iso;
      if (key < target) low = mid + 1;
      else high = mid - 1;
    }
    return null;
  }
  return { parse, format, toLatin };
})();
