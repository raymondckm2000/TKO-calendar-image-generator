import type {
  CalendarResponse,
  DateWithTimeZone,
  ParameterValue,
  VEvent,
} from "node-ical";

import { CALENDAR_TIME_ZONE } from "./constants";
import type { CalendarEvent } from "./types";

type DateParts = {
  month: number;
  year: number;
};

type FallbackEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: DateWithTimeZone;
  end?: DateWithTimeZone;
  allDay: boolean;
};

const MAX_ERROR_BODY_LENGTH = 500;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ICS_CONTENT_TYPES = [
  "text/calendar",
  "application/calendar",
  "application/octet-stream",
  "text/plain",
];

async function fetchIcsText(url: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "text/calendar,text/plain,*/*",
        "user-agent": "TKO Calendar Image Generator/1.0",
      },
      redirect: "follow",
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch ICS feed: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `ICS feed request failed with HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error("ICS feed response was empty.");
  }

  if (
    contentType &&
    !ICS_CONTENT_TYPES.some((allowedType) =>
      contentType.toLowerCase().includes(allowedType),
    )
  ) {
    throw new Error(`ICS feed returned unsupported content type: ${contentType}.`);
  }

  if (!responseText.includes("BEGIN:VCALENDAR")) {
    throw new Error("ICS feed response did not contain BEGIN:VCALENDAR.");
  }

  return responseText;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }

  return String(error);
}

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

function formatDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  const datePart = {
    day: parts.find((part) => part.type === "day")?.value,
    month: parts.find((part) => part.type === "month")?.value,
    year: parts.find((part) => part.type === "year")?.value,
  };

  return `${datePart.year}-${datePart.month}-${datePart.day}`;
}

function formatDisplayTime(start: DateWithTimeZone, allDay: boolean): string | undefined {
  if (allDay) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: CALENDAR_TIME_ZONE,
  })
    .format(start)
    .toLowerCase()
    .replace(":00", "")
    .replace(/\s/g, "");
}

function isDateOnlyEvent(event: VEvent): boolean {
  return event.start?.dateOnly === true || event.datetype === "date";
}

function isMultiDayEvent(
  start: DateWithTimeZone,
  end: DateWithTimeZone,
  allDay: boolean,
): boolean {
  const displayEnd =
    allDay && end.getTime() > start.getTime()
      ? (new Date(end.getTime() - ONE_DAY_IN_MS) as DateWithTimeZone)
      : end;

  return formatDateKey(start) !== formatDateKey(displayEnd);
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
  const allDay = isDateOnlyEvent(event);
  const displayTime = formatDisplayTime(event.start, allDay);
  const multiDay = isMultiDayEvent(event.start, end, allDay);

  return {
    id: event.uid || fallbackId,
    title: normalizeText(event.summary) || "Untitled event",
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    start: event.start.toISOString(),
    end: end.toISOString(),
    allDay,
    ...(multiDay ? { multiDay } : {}),
    ...(displayTime ? { displayTime } : {}),
  };
}

function normalizeFallbackEvent(
  event: FallbackEvent,
  fallbackId: string,
): CalendarEvent | null {
  if (!isValidDate(event.start)) {
    return null;
  }

  const end = isValidDate(event.end) ? event.end : event.start;
  const displayTime = formatDisplayTime(event.start, event.allDay);
  const multiDay = isMultiDayEvent(event.start, end, event.allDay);

  return {
    id: event.uid || fallbackId,
    title: event.summary?.trim() || "Untitled event",
    ...(event.description?.trim() ? { description: event.description.trim() } : {}),
    ...(event.location?.trim() ? { location: event.location.trim() } : {}),
    start: event.start.toISOString(),
    end: end.toISOString(),
    allDay: event.allDay,
    ...(multiDay ? { multiDay } : {}),
    ...(displayTime ? { displayTime } : {}),
  };
}

function unfoldIcsLines(icsText: string): string[] {
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfoldedLines: string[] = [];

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfoldedLines.length > 0) {
      unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
    } else {
      unfoldedLines.push(line);
    }
  }

  return unfoldedLines;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string, allDay: boolean): DateWithTimeZone | undefined {
  if (allDay && /^\d{8}$/.test(value)) {
    const year = Number.parseInt(value.slice(0, 4), 10);
    const month = Number.parseInt(value.slice(4, 6), 10) - 1;
    const day = Number.parseInt(value.slice(6, 8), 10);
    const date = new Date(Date.UTC(year, month, day)) as DateWithTimeZone;
    date.dateOnly = true;
    return date;
  }

  const dateTimeMatch = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
  );

  if (!dateTimeMatch) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, utc] = dateTimeMatch;
  const parsedDate = utc
    ? new Date(
        Date.UTC(
          Number.parseInt(year, 10),
          Number.parseInt(month, 10) - 1,
          Number.parseInt(day, 10),
          Number.parseInt(hour, 10),
          Number.parseInt(minute, 10),
          Number.parseInt(second, 10),
        ),
      )
    : new Date(
        Number.parseInt(year, 10),
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10),
        Number.parseInt(hour, 10),
        Number.parseInt(minute, 10),
        Number.parseInt(second, 10),
      );

  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  return parsedDate as DateWithTimeZone;
}

function isDateOnlyIcsValue(value: string, params: string[]): boolean {
  const normalizedParams = params.map((param) => param.toUpperCase());

  if (normalizedParams.includes("VALUE=DATE-TIME")) {
    return false;
  }

  return normalizedParams.includes("VALUE=DATE") || /^\d{8}$/.test(value);
}

function parseFallbackIcsEvents(
  icsText: string,
  month: number,
  year: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let currentEvent: FallbackEvent | null = null;

  for (const line of unfoldIcsLines(icsText)) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = { allDay: false };
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.start) {
        const dateParts = getDateParts(currentEvent.start);

        if (dateParts.month === month && dateParts.year === year) {
          const event = normalizeFallbackEvent(
            currentEvent,
            `fallback-${events.length + 1}`,
          );

          if (event) {
            events.push(event);
          }
        }
      }

      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const rawName = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const [name, ...params] = rawName.split(";");
    const allDay = isDateOnlyIcsValue(value, params);

    switch (name.toUpperCase()) {
      case "UID":
        currentEvent.uid = unescapeIcsText(value);
        break;
      case "SUMMARY":
        currentEvent.summary = unescapeIcsText(value);
        break;
      case "DESCRIPTION":
        currentEvent.description = unescapeIcsText(value);
        break;
      case "LOCATION":
        currentEvent.location = unescapeIcsText(value);
        break;
      case "DTSTART":
        currentEvent.allDay = allDay;
        currentEvent.start = parseIcsDate(value, allDay);
        break;
      case "DTEND":
        currentEvent.end = parseIcsDate(value, allDay);
        break;
    }
  }

  return events.sort(
    (firstEvent, secondEvent) =>
      Date.parse(firstEvent.start) - Date.parse(secondEvent.start),
  );
}

function normalizeParsedCalendar(
  calendar: CalendarResponse,
  month: number,
  year: number,
): CalendarEvent[] {
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

export async function parseCalendarEvents(
  url: string,
  month: number,
  year: number,
): Promise<CalendarEvent[]> {
  const icsText = await fetchIcsText(url);

  try {
    const { createRequire } = await import("node:module");
    const nodeRequire = createRequire(`${process.cwd()}/package.json`);
    const ical = nodeRequire(["node", "ical"].join("-")) as typeof import("node-ical");
    const calendar = ical.parseICS(icsText) as CalendarResponse;
    return normalizeParsedCalendar(calendar, month, year);
  } catch (error) {
    console.warn("node-ical parseICS failed; using ICS fallback parser.", error);
    return parseFallbackIcsEvents(icsText, month, year);
  }
}
