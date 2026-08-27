const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export const RTH_OPEN_MINUTE = 9 * 60 + 30;
export const RTH_CLOSE_MINUTE = 16 * 60;

/** `YYYY-MM-DD` of an epoch-second instant, in Eastern time. */
export function etDate(epochSec: number): string {
  const parts = dateFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whether an ET instant is at or after the 09:30 regular-session open. */
export function isAtOrAfterMarketOpen(epochSec: number): boolean {
  const parts = timeFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute") >= RTH_OPEN_MINUTE;
}

function etLocalEpoch(date: string, hour: number, minute: number, second = 0): number {
  const [year, month, day] = date.split("-").map(Number);
  const desiredUtcShape = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredUtcShape;
  // Reconcile the UTC guess with how that instant is represented in ET. Two
  // passes handle either side of a DST offset change without a timezone lib.
  for (let i = 0; i < 2; i++) {
    const parts = dateTimeFormatter.formatToParts(new Date(guess));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find(part => part.type === type)?.value ?? 0);
    const representedUtcShape = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    guess += desiredUtcShape - representedUtcShape;
  }
  return Math.floor(guess / 1_000);
}

/** Epoch seconds for midnight ET on the date containing `epochSec`. */
export function etDayStartEpoch(epochSec: number): number {
  return etLocalEpoch(etDate(epochSec), 0, 0);
}

/** Inclusive epoch-second bounds for one New York regular trading session. */
export function rthSessionBounds(date: string): { startTs: number; endTs: number } {
  return {
    startTs: etLocalEpoch(date, 9, 30),
    endTs: etLocalEpoch(date, 16, 0),
  };
}

/** Whether an instant belongs to its date's 09:30–16:00 New York RTH session. */
export function isInRthSession(epochSec: number): boolean {
  const weekday = weekdayFormatter.format(new Date(epochSec * 1000));
  if (weekday === "Sat" || weekday === "Sun") return false;
  const { startTs, endTs } = rthSessionBounds(etDate(epochSec));
  return epochSec >= startTs && epochSec <= endTs;
}

/**
 * Live charts show today's RTH session after the open. Before the open (or when
 * today has no RTH recording yet), retain the latest prior recorded session.
 */
export function selectLiveSessionDate(dates: string[], nowSec: number): string | null {
  const ordered = [...new Set(dates)].sort();
  const today = etDate(nowSec);
  if (isAtOrAfterMarketOpen(nowSec) && ordered.includes(today)) return today;
  const prior = ordered.filter(date => date < today).at(-1);
  return prior ?? (ordered.includes(today) ? today : null);
}

/** Add a live point only inside RTH, without joining two separate sessions. */
export function appendLiveSessionPoint(
  series: [number, number][],
  point: [number, number],
): [number, number][] {
  if (!isInRthSession(point[0])) return series;
  const last = series.at(-1);
  if (!last) return [point];
  if (last[0] >= point[0]) return series;
  if (etDate(last[0]) === etDate(point[0])) return [...series, point];
  return [point];
}
