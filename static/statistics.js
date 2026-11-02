/* Pure presentation functions: canonical dates stay Gregorian; values stay unrounded. */
function calendarMonths(timeline, language = "en", nativeDigits = true) {
  const calendar = language === "fa" ? "persian" : "gregory";
  const keyFormatter = new Intl.DateTimeFormat("en-US", {
    calendar,
    year: "numeric",
    month: "2-digit",
    timeZone: "UTC",
  });
  const labelFormatter = new Intl.DateTimeFormat(
    language === "fa" ? "fa-IR" : "en-GB",
    {
      calendar,
      year: "numeric",
      month: "long",
      numberingSystem: language === "fa" && nativeDigits ? "arabext" : "latn",
      timeZone: "UTC",
    },
  );
  const groups = new Map();
  for (const row of timeline) {
    const day = new Date(`${row.date}T00:00:00Z`),
      parts = keyFormatter.formatToParts(day);
    const key =
      parts.find((p) => p.type === "year").value +
      "-" +
      parts.find((p) => p.type === "month").value;
    const group = groups.get(key) || {
      month: key,
      label: labelFormatter.format(day),
      sum: 0,
      count: 0,
    };
    group.sum += row.percentage;
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((g) => ({ ...g, average: g.sum / g.count }));
}
function heatmapBounds(values) {
  return values.reduce(
    (bounds, cell) => ({
      min: Math.min(bounds.min, cell[2]),
      max: Math.max(bounds.max, cell[2]),
    }),
    { min: 0, max: 100 },
  );
}
