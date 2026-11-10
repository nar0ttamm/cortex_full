/** Inclusive calendar dates in India Standard Time, returned as a half-open UTC interval. */

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function startOfIstDay(iso) {
  return new Date(`${iso}T00:00:00+05:30`);
}

function formatIst(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function todayIst() {
  return formatIst(new Date());
}

function parseDashboardRange(from, to) {
  const endDate = isoDate(to) ? String(to) : todayIst();
  const resolvedStart = isoDate(from)
    ? String(from)
    : formatIst(new Date(startOfIstDay(endDate).getTime() - 29 * DAY));

  if (!isoDate(resolvedStart) || !isoDate(endDate)) {
    return { ok: false, error: 'Use dates in YYYY-MM-DD format' };
  }
  const start = startOfIstDay(resolvedStart);
  const endExclusive = new Date(startOfIstDay(endDate).getTime() + DAY);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
    return { ok: false, error: 'Those dates are not valid' };
  }
  if (start >= endExclusive) return { ok: false, error: 'From date must be on or before To date' };
  if (endExclusive.getTime() - start.getTime() > MAX_DAYS * DAY) {
    return { ok: false, error: 'Choose a range of 366 days or less' };
  }
  return { ok: true, from: resolvedStart, to: endDate, start, endExclusive };
}

module.exports = { parseDashboardRange, isoDate };
