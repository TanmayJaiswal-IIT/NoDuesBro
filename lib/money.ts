const TIME_ZONE = "Asia/Kolkata";

export function formatInr(minor: number): string {
  const rupees = minor / 100;
  const hasPaise = minor % 100 !== 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupees);
  return `₹${formatted}`;
}

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  const list = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(date);
  return Object.fromEntries(list.map((part) => [part.type, part.value]));
}

export function formatDeskClock(date: Date): string {
  const value = parts(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const period = value.dayPeriod.toLowerCase().replace(/\s+/g, "");
  return `${value.weekday} ${value.day} ${value.month} · ${value.hour}:${value.minute}${period}`;
}

export function formatDeskDay(date: Date): string {
  const value = parts(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${value.weekday} ${value.day} ${value.month}`;
}

export function kolkataDateKey(date: Date): string {
  const value = parts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${value.year}-${value.month}-${value.day}`;
}
