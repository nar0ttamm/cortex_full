/**
 * Turn spoken callback phrases into a future ISO timestamp.
 * Does not guess a time when none is present — returns null.
 */

const MS_HOUR = 3600000;
const MS_DAY = 86400000;

function parseCallbackWhen(raw, now = new Date(), timezoneOffsetMinutes = 330) {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.getTime() > now.getTime() ? raw.toISOString() : null;
  }
  const text = String(raw).trim();
  if (!text) return null;

  const isoTry = Date.parse(text);
  if (!Number.isNaN(isoTry) && isoTry > now.getTime() - 60000) {
    return new Date(isoTry).toISOString();
  }

  const lower = text.toLowerCase();
  const base = new Date(now.getTime());

  const weekdayDays = weekdayOffset(lower, now, timezoneOffsetMinutes);
  let days = 0;
  if (/\btomorrow\b|\bkal\b/.test(lower)) days = 1;
  else if (/\bday after\b|\bparso\b/.test(lower)) days = 2;
  else if (weekdayDays != null) days = weekdayDays;
  else if (/\btonight\b/.test(lower)) days = 0;
  else if (/\btoday\b|\baaj\b/.test(lower)) days = 0;
  else if (!/\b\d{1,2}/.test(lower) && !/\bmorning\b|\bafternoon\b|\bevening\b/.test(lower)) {
    return null;
  }

  const clock = extractClock(lower);
  if (!clock && days === 0 && !/\btonight\b|\btoday\b|\baaj\b|\bmorning\b|\bevening\b|\bafternoon\b/.test(lower)) {
    return null;
  }

  const local = toOffsetDate(base, timezoneOffsetMinutes);
  local.setUTCDate(local.getUTCDate() + days);
  if (clock) {
    local.setUTCHours(clock.hours, clock.minutes, 0, 0);
  } else if (/\bevening\b|\btonight\b/.test(lower)) {
    local.setUTCHours(18, 0, 0, 0);
  } else if (/\bafternoon\b/.test(lower)) {
    local.setUTCHours(15, 0, 0, 0);
  } else if (/\bmorning\b/.test(lower)) {
    local.setUTCHours(11, 0, 0, 0);
  } else {
    local.setUTCHours(11, 0, 0, 0);
  }

  const utc = fromOffsetDate(local, timezoneOffsetMinutes);
  if (utc.getTime() <= now.getTime()) {
    utc.setTime(utc.getTime() + MS_DAY);
  }
  if (utc.getTime() - now.getTime() > 366 * MS_DAY) return null;
  return utc.toISOString();
}

function weekdayOffset(lower, now, timezoneOffsetMinutes) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hit = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!hit) return null;
  const target = names.indexOf(hit[1]);
  const local = toOffsetDate(new Date(now.getTime()), timezoneOffsetMinutes);
  const current = local.getUTCDay();
  let delta = target - current;
  if (delta <= 0) delta += 7;
  return delta;
}

function extractClock(lower) {
  const mer = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (mer) {
    let hours = parseInt(mer[1], 10);
    const minutes = parseInt(mer[2] || '0', 10);
    const ap = mer[3].toLowerCase().replace(/\./g, '');
    if (hours === 12) hours = ap === 'am' ? 0 : 12;
    else if (ap === 'pm') hours += 12;
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }
  const h24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return { hours: parseInt(h24[1], 10), minutes: parseInt(h24[2], 10) };
  return null;
}

function toOffsetDate(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60000);
}

function fromOffsetDate(offsetDate, offsetMinutes) {
  return new Date(offsetDate.getTime() - offsetMinutes * 60000);
}

function hoursFromNowIso(hours, now = new Date()) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(now.getTime() + n * MS_HOUR).toISOString();
}

module.exports = { parseCallbackWhen, hoursFromNowIso, extractClock };
