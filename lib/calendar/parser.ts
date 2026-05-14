import type {
  DateWithTimeZone,
  ParameterValue,
  VEvent,
} from "node-ical";

import type { CalendarEvent } from "./types";

type DateParts = {
  month: number;
  year: number;
};

function normalizeText(value: ParameterValue | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (value && typeof value === "object" && "val" in value) {
    return normalizeText(value.val);
  }

  return undefined;
}

function isValidDate(value: unknown): value is DateWithTimeZone {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isVEvent(component: unknown): component is VEvent {
  return (
    typeof component === "object" &&
    component !== null &&
    "type" in component &&
    component.type === "VEVENT"
  );
}

function getDateParts(date: DateWithTimeZone): DateParts {
  if (date.dateOnly || !date.tz) {
    return {
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      timeZone: date.tz,
      year: "numeric",
    }).formatToParts(date);

    const monthPart = parts.find((part) => part.type === "month")?.value;
    const yearPart = parts.find((part) => part.type === "year")?.value;
    const month = monthPart ? Number.parseInt(monthPart, 10) : NaN;
    const year = yearPart ? Number.parseInt(yearPart, 10) : NaN;

    if (Number.isInteger(month) && Number.isInteger(year)) {
      return { month, year };
    }
  } catch {
    // Fall back to UTC if an ICS timezone identifier is not supported.
  }

  return {
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function isEventInMonth(event: VEvent, month: number, year: number): boolean {
  if (!isValidDate(event.start)) {
    return false;
  }

  const dateParts = getDateParts(event.start);
  return dateParts.month === month && dateParts.year === year;
}

function normalizeEvent(event: VEvent, fallbackId: string): CalendarEvent | null {
  if (!isValidDate(event.start)) {
    return null;
  }

  const end = isValidDate(event.end) ? event.end : event.start;
  const description = normalizeText(event.description);
  const location = normalizeText(event.location);

  return {
    id: event.uid || fallbackId,
    title: normalizeText(event.summary) || "Untitled event",
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    start: event.start.toISOString(),
    end: end.toISOString(),
    allDay: Boolean(event.start.dateOnly || event.datetype === "date"),
  };
}

export async function parseCalendarEvents(
  url: string,
  month: number,
  year: number,
): Promise<CalendarEvent[]> {
  const { createRequire } = await import("node:module");
  const nodeRequire = createRequire(`${process.cwd()}/package.json`);
  const ical = nodeRequire(["node", "ical"].join("-")) as typeof import("node-ical");
  const calendar = await ical.async.fromURL(url);

  return Object.entries(calendar)
    .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
    .filter(([, event]) => isEventInMonth(event, month, year))
    .map(([id, event]) => normalizeEvent(event, id))
    .filter((event): event is CalendarEvent => event !== null)
    .sort(
      (firstEvent, secondEvent) =>
        Date.parse(firstEvent.start) - Date.parse(secondEvent.start),
    );
}
