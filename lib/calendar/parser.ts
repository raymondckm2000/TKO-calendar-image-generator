import type {
  CalendarResponse,
  DateWithTimeZone,
  ParameterValue,
  VEvent,
} from "node-ical";

import { CALENDAR_TIME_ZONE } from "./constants";
import type { CalendarEvent, FormattedCalendarEvent } from "./types";

type DateParts = {
  day: number;
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
  exdates?: DateWithTimeZone[];
  recurrenceId?: DateWithTimeZone;
  rrule?: string;
};

export type CalendarSourceStatus =
  | "parsed"
  | "fetch_failed"
  | "invalid_feed"
  | "no_events_in_feed"
  | "parser_failed"
  | "no_events_for_selected_month";

export type CalendarSourceDiagnostics = {
  bodyPreview: string;
  contentType: string;
  filteredEventCount: number;
  hasVCalendar: boolean;
  hasVEvent: boolean;
  httpStatus: number | null;
  rawEventCount: number;
  sourceStatus: CalendarSourceStatus;
};

export class CalendarSourceError extends Error {
  diagnostics: CalendarSourceDiagnostics;
  sourceStatus: CalendarSourceStatus;

  constructor(
    message: string,
    sourceStatus: CalendarSourceStatus,
    diagnostics: Partial<CalendarSourceDiagnostics> = {},
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "CalendarSourceError";
    this.sourceStatus = sourceStatus;
    this.diagnostics = createSourceDiagnostics({
      ...diagnostics,
      sourceStatus,
    });
  }
}

type RecurringVEvent = VEvent & {
  exdate?: Record<string, Date>;
  recurrences?: Record<string, VEvent>;
  rrule: {
    between: (start: Date, end: Date, includeLimits?: boolean) => Date[];
  };
};

const MAX_ERROR_BODY_LENGTH = 500;
const ICS_CONTENT_TYPES = [
  "text/calendar",
  "application/calendar",
  "application/octet-stream",
  "text/plain",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || `Month ${month}`;
}

function createSourceDiagnostics(
  diagnostics: Partial<CalendarSourceDiagnostics>,
): CalendarSourceDiagnostics {
  return {
    bodyPreview: diagnostics.bodyPreview ?? "",
    contentType: diagnostics.contentType ?? "",
    filteredEventCount: diagnostics.filteredEventCount ?? 0,
    hasVCalendar: diagnostics.hasVCalendar ?? false,
    hasVEvent: diagnostics.hasVEvent ?? false,
    httpStatus: diagnostics.httpStatus ?? null,
    rawEventCount: diagnostics.rawEventCount ?? 0,
    sourceStatus: diagnostics.sourceStatus ?? "fetch_failed",
  };
}

export function resolveCalendarIcsUrl(calendarLink: string): string {
  const trimmedLink = calendarLink.trim();

  if (!trimmedLink) {
    throw new Error("Calendar link is required.");
  }

  const parsedUrl = new URL(trimmedLink);

  if (parsedUrl.pathname.includes("/calendar/embed")) {
    const source = parsedUrl.searchParams.get("src");

    if (!source) {
      throw new Error("Google Calendar embed link is missing the src parameter.");
    }

    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
      source,
    )}/public/basic.ics`;
  }

  return trimmedLink;
}

function countRawVEvents(icsText: string): number {
  return unfoldIcsLines(icsText).filter((line) => line === "BEGIN:VEVENT").length;
}

async function fetchIcsText(url: string): Promise<{
  diagnostics: CalendarSourceDiagnostics;
  icsText: string;
}> {
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
    throw new CalendarSourceError(
      `Failed to fetch ICS feed: ${getErrorMessage(error)}`,
      "fetch_failed",
      {},
      error,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const responseText = await response.text();
  const baseDiagnostics = createSourceDiagnostics({
    bodyPreview: responseText.slice(0, MAX_ERROR_BODY_LENGTH),
    contentType,
    hasVCalendar: responseText.includes("BEGIN:VCALENDAR"),
    hasVEvent: responseText.includes("BEGIN:VEVENT"),
    httpStatus: response.status,
    rawEventCount: countRawVEvents(responseText),
  });

  if (!response.ok) {
    throw new CalendarSourceError(
      `ICS feed request failed with HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}`,
      "fetch_failed",
      baseDiagnostics,
    );
  }

  if (!responseText.trim()) {
    throw new CalendarSourceError(
      "ICS feed response was empty.",
      "invalid_feed",
      baseDiagnostics,
    );
  }

  if (
    contentType &&
    !ICS_CONTENT_TYPES.some((allowedType) =>
      contentType.toLowerCase().includes(allowedType),
    )
  ) {
    throw new CalendarSourceError(
      `ICS feed returned unsupported content type: ${contentType}.`,
      "invalid_feed",
      baseDiagnostics,
    );
  }

  if (!responseText.includes("BEGIN:VCALENDAR")) {
    throw new CalendarSourceError(
      "ICS feed response did not contain BEGIN:VCALENDAR.",
      "invalid_feed",
      baseDiagnostics,
    );
  }

  if (!responseText.includes("BEGIN:VEVENT")) {
    throw new CalendarSourceError(
      "Calendar was read, but no events were found in the feed.",
      "no_events_in_feed",
      {
        ...baseDiagnostics,
        sourceStatus: "no_events_in_feed",
      },
    );
  }

  return {
    diagnostics: baseDiagnostics,
    icsText: responseText,
  };
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
  if (!date.dateOnly && !date.tz) {
    return {
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: date.tz || CALENDAR_TIME_ZONE,
      year: "numeric",
    }).formatToParts(date);

    const dayPart = parts.find((part) => part.type === "day")?.value;
    const monthPart = parts.find((part) => part.type === "month")?.value;
    const yearPart = parts.find((part) => part.type === "year")?.value;
    const day = dayPart ? Number.parseInt(dayPart, 10) : NaN;
    const month = monthPart ? Number.parseInt(monthPart, 10) : NaN;
    const year = yearPart ? Number.parseInt(yearPart, 10) : NaN;

    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)) {
      return { day, month, year };
    }
  } catch {
    // Fall back to UTC if an ICS timezone identifier is not supported.
  }

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function isRecurringVEvent(event: VEvent): event is RecurringVEvent {
  return Boolean(
    "rrule" in event &&
      event.rrule &&
      typeof event.rrule === "object" &&
      "between" in event.rrule &&
      typeof event.rrule.between === "function",
  );
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

function createDateKey(parts: DateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
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

function isMultiDayEvent(
  start: DateWithTimeZone,
  end: DateWithTimeZone,
  allDay: boolean,
): boolean {
  const displayEnd =
    allDay && end.getTime() > start.getTime()
      ? subtractOneUtcDay(end)
      : end;

  return formatDateKey(start) !== formatDateKey(displayEnd);
}

function subtractOneUtcDay(date: DateWithTimeZone): DateWithTimeZone {
  const adjustedDate = new Date(date.getTime() - 24 * 60 * 60 * 1000) as DateWithTimeZone;
  adjustedDate.dateOnly = date.dateOnly;
  adjustedDate.tz = date.tz;
  return adjustedDate;
}

function getDisplayEndDate(
  start: DateWithTimeZone,
  end: DateWithTimeZone,
  allDay: boolean,
): DateWithTimeZone {
  if (allDay && end.getTime() > start.getTime()) {
    return subtractOneUtcDay(end);
  }

  return end;
}

function doesEventOverlapMonth(
  start: DateWithTimeZone,
  end: DateWithTimeZone,
  allDay: boolean,
  month: number,
  year: number,
): boolean {
  const displayStartKey = createDateKey(getDateParts(start));
  const displayEndKey = createDateKey(getDateParts(getDisplayEndDate(start, end, allDay)));
  const monthStartKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndKey = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  ).padStart(2, "0")}`;

  return displayStartKey <= monthEndKey && displayEndKey >= monthStartKey;
}

function compareCalendarEvents(
  firstEvent: CalendarEvent,
  secondEvent: CalendarEvent,
): number {
  const firstStart = new Date(firstEvent.start) as DateWithTimeZone;
  const secondStart = new Date(secondEvent.start) as DateWithTimeZone;

  if (firstEvent.allDay) {
    firstStart.dateOnly = true;
  }

  if (secondEvent.allDay) {
    secondStart.dateOnly = true;
  }

  const firstDateKey = createDateKey(getDateParts(firstStart));
  const secondDateKey = createDateKey(getDateParts(secondStart));

  if (firstDateKey !== secondDateKey) {
    return firstDateKey.localeCompare(secondDateKey);
  }

  if (firstEvent.allDay !== secondEvent.allDay) {
    return firstEvent.allDay ? -1 : 1;
  }

  if (
    firstEvent.allDay &&
    secondEvent.allDay &&
    Boolean(firstEvent.multiDay) !== Boolean(secondEvent.multiDay)
  ) {
    return firstEvent.multiDay ? -1 : 1;
  }

  const firstStartTime = Date.parse(firstEvent.start);
  const secondStartTime = Date.parse(secondEvent.start);

  if (firstStartTime !== secondStartTime) {
    return firstStartTime - secondStartTime;
  }

  return firstEvent.title.localeCompare(secondEvent.title);
}

function isEventInMonth(event: VEvent, month: number, year: number): boolean {
  if (!isValidDate(event.start)) {
    return false;
  }

  const end = isValidDate(event.end) ? event.end : event.start;
  return doesEventOverlapMonth(
    event.start,
    end,
    Boolean(event.start.dateOnly || event.datetype === "date"),
    month,
    year,
  );
}

function createMonthSearchWindow(month: number, year: number): {
  end: Date;
  start: Date;
} {
  return {
    start: new Date(Date.UTC(year, month - 1, -1)),
    end: new Date(Date.UTC(year, month, 2)),
  };
}

function isExcludedOccurrence(event: RecurringVEvent, occurrence: Date): boolean {
  if (!event.exdate) {
    return false;
  }

  return Object.values(event.exdate).some(
    (excludedDate) =>
      excludedDate instanceof Date &&
      excludedDate.getTime() === occurrence.getTime(),
  );
}

function formatUtcDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function isOverriddenOccurrence(event: RecurringVEvent, occurrence: Date): boolean {
  if (!event.recurrences) {
    return false;
  }

  const occurrenceTime = occurrence.getTime();
  const occurrenceUtcKey = formatUtcDateKey(occurrence);
  const occurrenceDisplayKey = formatDateKey(occurrence);

  return Object.keys(event.recurrences).some((recurrenceKey) => {
    const recurrenceDate = new Date(recurrenceKey);

    return (
      recurrenceKey === occurrenceUtcKey ||
      recurrenceKey === occurrenceDisplayKey ||
      (!Number.isNaN(recurrenceDate.getTime()) &&
        recurrenceDate.getTime() === occurrenceTime)
    );
  });
}

function createRecurringOccurrence(
  event: RecurringVEvent,
  occurrence: Date,
): VEvent | null {
  if (!isValidDate(event.start)) {
    return null;
  }

  const end = isValidDate(event.end) ? event.end : event.start;
  const duration = end.getTime() - event.start.getTime();
  const occurrenceStart = new Date(occurrence.getTime()) as DateWithTimeZone;
  const occurrenceEnd = new Date(occurrence.getTime() + duration) as DateWithTimeZone;

  occurrenceStart.tz = event.start.tz;
  occurrenceEnd.tz = end.tz;

  return {
    ...event,
    start: occurrenceStart,
    end: occurrenceEnd,
  };
}

function normalizeRecurringEvents(
  event: VEvent,
  fallbackId: string,
  month: number,
  year: number,
): CalendarEvent[] {
  if (!isRecurringVEvent(event) || !isValidDate(event.start)) {
    return [];
  }

  const searchWindow = createMonthSearchWindow(month, year);
  const recurringEvents = event.rrule
    .between(searchWindow.start, searchWindow.end, true)
    .filter((occurrence) => !isExcludedOccurrence(event, occurrence))
    .filter((occurrence) => !isOverriddenOccurrence(event, occurrence))
    .map((occurrence) => createRecurringOccurrence(event, occurrence))
    .filter((occurrence): occurrence is VEvent => occurrence !== null)
    .filter((occurrence) => isEventInMonth(occurrence, month, year))
    .map((occurrence, index) =>
      normalizeEvent(occurrence, `${fallbackId}-${occurrence.start.toISOString()}-${index}`),
    )
    .filter((occurrence): occurrence is CalendarEvent => occurrence !== null);
  const recurrenceOverrides = Object.entries(event.recurrences ?? {})
    .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
    .filter(([, recurrence]) => isEventInMonth(recurrence, month, year))
    .map(([recurrenceId, recurrence]) =>
      normalizeEvent(recurrence, `${fallbackId}-${recurrenceId}`),
    )
    .filter((recurrence): recurrence is CalendarEvent => recurrence !== null);

  return [...recurringEvents, ...recurrenceOverrides];
}

function normalizeEvent(event: VEvent, fallbackId: string): CalendarEvent | null {
  if (!isValidDate(event.start)) {
    return null;
  }

  const end = isValidDate(event.end) ? event.end : event.start;
  const description = normalizeText(event.description);
  const location = normalizeText(event.location);
  const allDay = Boolean(event.start.dateOnly || event.datetype === "date");
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

function parseIcsDate(
  value: string,
  allDay: boolean,
  timeZone?: string,
): DateWithTimeZone | undefined {
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
  const parsedDate = utc || timeZone === CALENDAR_TIME_ZONE
    ? new Date(
        Date.UTC(
          Number.parseInt(year, 10),
          Number.parseInt(month, 10) - 1,
          Number.parseInt(day, 10),
          Number.parseInt(hour, 10) - (timeZone === CALENDAR_TIME_ZONE && !utc ? 8 : 0),
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

  const date = parsedDate as DateWithTimeZone;

  if (timeZone) {
    date.tz = timeZone;
  }

  return date;
}

function getCalendarEventKey(event: CalendarEvent): string {
  return [
    event.title,
    event.start,
    event.end,
    event.allDay ? "all-day" : "timed",
    event.displayTime ?? "",
    event.location ?? "",
  ].join("|");
}

function dedupeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(
    (event, index, allEvents) =>
      allEvents.findIndex(
        (candidateEvent) =>
          getCalendarEventKey(candidateEvent) === getCalendarEventKey(event),
      ) === index,
  );
}

function getTimeParts(date: DateWithTimeZone): {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    minute: "numeric",
    second: "numeric",
    timeZone: date.tz || CALENDAR_TIME_ZONE,
  }).formatToParts(date);

  return {
    hour: Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10),
    minute: Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10),
    second: Number.parseInt(parts.find((part) => part.type === "second")?.value ?? "0", 10),
  };
}

function createFallbackOccurrenceDate(
  parts: DateParts,
  timeParts: { hour: number; minute: number; second: number },
  allDay: boolean,
  timeZone?: string,
): DateWithTimeZone {
  const date = allDay
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : new Date(
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          timeParts.hour - (timeZone === CALENDAR_TIME_ZONE ? 8 : 0),
          timeParts.minute,
          timeParts.second,
        ),
      );
  const occurrenceDate = date as DateWithTimeZone;

  if (allDay) {
    occurrenceDate.dateOnly = true;
  }
  occurrenceDate.tz = timeZone;

  return occurrenceDate;
}

function parseFallbackRRule(rrule: string): Record<string, string> {
  return Object.fromEntries(
    rrule
      .split(";")
      .map((part) => part.split("="))
      .filter((part): part is [string, string] => part.length === 2),
  );
}

function getWeekdayCode(parts: DateParts): string {
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  ];
}

function doesDateMatchByDay(parts: DateParts, byDay: string): boolean {
  return byDay.split(",").some((ruleDay) => {
    const match = ruleDay.match(/^([+-]?\d)?([A-Z]{2})$/);

    if (!match || getWeekdayCode(parts) !== match[2]) {
      return false;
    }

    return !match[1] || Math.floor((parts.day - 1) / 7) + 1 === Number.parseInt(match[1], 10);
  });
}

function doesDateMatchFallbackRRule(
  parts: DateParts,
  startParts: DateParts,
  rrule: Record<string, string>,
): boolean {
  if (createDateKey(parts) < createDateKey(startParts)) {
    return false;
  }

  if (rrule.FREQ === "WEEKLY") {
    return rrule.BYDAY
      ? doesDateMatchByDay(parts, rrule.BYDAY)
      : getWeekdayCode(parts) === getWeekdayCode(startParts);
  }

  if (rrule.FREQ === "MONTHLY") {
    return rrule.BYDAY
      ? doesDateMatchByDay(parts, rrule.BYDAY)
      : parts.day === startParts.day;
  }

  if (rrule.FREQ === "YEARLY") {
    const monthMatches = rrule.BYMONTH
      ? rrule.BYMONTH.split(",").includes(String(parts.month))
      : parts.month === startParts.month;
    const dayMatches = rrule.BYMONTHDAY
      ? rrule.BYMONTHDAY.split(",").includes(String(parts.day))
      : parts.day === startParts.day;

    return monthMatches && dayMatches;
  }

  return false;
}

function isFallbackExcluded(
  event: FallbackEvent,
  occurrenceStart: DateWithTimeZone,
): boolean {
  const occurrenceKey = createDateKey(getDateParts(occurrenceStart));

  return (event.exdates ?? []).some(
    (exdate) => createDateKey(getDateParts(exdate)) === occurrenceKey,
  );
}

function isFallbackOverridden(
  event: FallbackEvent,
  occurrenceStart: DateWithTimeZone,
  events: FallbackEvent[],
): boolean {
  const occurrenceKey = createDateKey(getDateParts(occurrenceStart));

  return events.some(
    (candidateEvent) =>
      candidateEvent.uid === event.uid &&
      candidateEvent.recurrenceId &&
      createDateKey(getDateParts(candidateEvent.recurrenceId)) === occurrenceKey,
  );
}

function getFallbackOccurrenceCount(
  event: FallbackEvent,
  candidateParts: DateParts,
  rrule: Record<string, string>,
): number {
  if (!event.start) {
    return 0;
  }

  const startParts = getDateParts(event.start);
  let count = 0;

  for (let year = startParts.year; year <= candidateParts.year; year += 1) {
    for (
      let month = year === startParts.year ? startParts.month : 1;
      month <= (year === candidateParts.year ? candidateParts.month : 12);
      month += 1
    ) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const firstDay =
        year === startParts.year && month === startParts.month ? startParts.day : 1;
      const endDay =
        year === candidateParts.year && month === candidateParts.month
          ? candidateParts.day
          : lastDay;

      for (let day = firstDay; day <= endDay; day += 1) {
        if (doesDateMatchFallbackRRule({ day, month, year }, startParts, rrule)) {
          count += 1;
        }
      }
    }
  }

  return count;
}

function expandFallbackRecurringEvent(
  event: FallbackEvent,
  events: FallbackEvent[],
  fallbackId: string,
  month: number,
  year: number,
): CalendarEvent[] {
  if (!event.start || !event.rrule) {
    return [];
  }

  const rrule = parseFallbackRRule(event.rrule);
  const startParts = getDateParts(event.start);
  const end = isValidDate(event.end) ? event.end : event.start;
  const duration = end.getTime() - event.start.getTime();
  const timeParts = event.allDay
    ? { hour: 0, minute: 0, second: 0 }
    : getTimeParts(event.start);
  const until = rrule.UNTIL
    ? parseIcsDate(rrule.UNTIL, event.allDay, event.start.tz)
    : undefined;
  const countLimit = rrule.COUNT ? Number.parseInt(rrule.COUNT, 10) : undefined;
  const occurrences: CalendarEvent[] = [];

  for (
    let date = new Date(Date.UTC(year, month - 1, -1));
    date <= new Date(Date.UTC(year, month, 2));
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const dateParts = {
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    };

    if (!doesDateMatchFallbackRRule(dateParts, startParts, rrule)) {
      continue;
    }

    if (
      countLimit &&
      getFallbackOccurrenceCount(event, dateParts, rrule) > countLimit
    ) {
      continue;
    }

    const occurrenceStart = createFallbackOccurrenceDate(
      dateParts,
      timeParts,
      event.allDay,
      event.start.tz,
    );

    if (
      (until && occurrenceStart.getTime() > until.getTime()) ||
      isFallbackExcluded(event, occurrenceStart) ||
      isFallbackOverridden(event, occurrenceStart, events)
    ) {
      continue;
    }

    const occurrenceEnd = new Date(
      occurrenceStart.getTime() + duration,
    ) as DateWithTimeZone;
    if (event.allDay) {
      occurrenceEnd.dateOnly = true;
    }
    occurrenceEnd.tz = end.tz;

    if (
      !doesEventOverlapMonth(
        occurrenceStart,
        occurrenceEnd,
        event.allDay,
        month,
        year,
      )
    ) {
      continue;
    }

    const normalizedEvent = normalizeFallbackEvent(
      { ...event, start: occurrenceStart, end: occurrenceEnd },
      `${fallbackId}-${occurrenceStart.toISOString()}`,
    );

    if (normalizedEvent) {
      occurrences.push(normalizedEvent);
    }
  }

  return occurrences;
}

function parseFallbackIcsEvents(
  icsText: string,
  month: number,
  year: number,
): CalendarEvent[] {
  const parsedEvents: FallbackEvent[] = [];
  let currentEvent: FallbackEvent | null = null;

  for (const line of unfoldIcsLines(icsText)) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = { allDay: false };
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.start) {
        parsedEvents.push(currentEvent);
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
    const allDay = params.some((param) => param.toUpperCase() === "VALUE=DATE");
    const timeZone = params
      .find((param) => param.toUpperCase().startsWith("TZID="))
      ?.slice("TZID=".length);

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
        currentEvent.start = parseIcsDate(value, allDay, timeZone);
        break;
      case "DTEND":
        currentEvent.end = parseIcsDate(value, allDay, timeZone);
        break;
      case "EXDATE":
        currentEvent.exdates = [
          ...(currentEvent.exdates ?? []),
          ...value
            .split(",")
            .map((dateValue) => parseIcsDate(dateValue, allDay, timeZone))
            .filter((date): date is DateWithTimeZone => date !== undefined),
        ];
        break;
      case "RECURRENCE-ID":
        currentEvent.recurrenceId = parseIcsDate(value, allDay, timeZone);
        break;
      case "RRULE":
        currentEvent.rrule = value;
        break;
    }
  }

  return dedupeCalendarEvents(
    parsedEvents.flatMap((event, index) => {
      if (event.rrule) {
        return expandFallbackRecurringEvent(
          event,
          parsedEvents,
          `fallback-${index + 1}`,
          month,
          year,
        );
      }

      if (
        !event.start ||
        !doesEventOverlapMonth(
          event.start,
          isValidDate(event.end) ? event.end : event.start,
          event.allDay,
          month,
          year,
        )
      ) {
        return [];
      }

      const normalizedEvent = normalizeFallbackEvent(event, `fallback-${index + 1}`);
      return normalizedEvent ? [normalizedEvent] : [];
    }),
  ).sort(compareCalendarEvents);
}

function countFallbackEventsWithStart(icsText: string): number {
  let count = 0;
  let currentEvent: FallbackEvent | null = null;

  for (const line of unfoldIcsLines(icsText)) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = { allDay: false };
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.start) {
        count += 1;
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

    if (name.toUpperCase() !== "DTSTART") {
      continue;
    }

    const allDay = params.some((param) => param.toUpperCase() === "VALUE=DATE");
    currentEvent.start = parseIcsDate(value, allDay);
  }

  return count;
}

function normalizeParsedCalendar(
  calendar: CalendarResponse,
  month: number,
  year: number,
): CalendarEvent[] {
  return dedupeCalendarEvents(Object.entries(calendar)
    .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
    .flatMap(([id, event]) => {
      if (isRecurringVEvent(event)) {
        return normalizeRecurringEvents(event, id, month, year);
      }

      if (!isEventInMonth(event, month, year)) {
        return [];
      }

      return [normalizeEvent(event, id)];
    })
    .filter((event): event is CalendarEvent => event !== null))
    .sort(compareCalendarEvents);
}

export async function parseCalendarEvents(
  url: string,
  month: number,
  year: number,
): Promise<CalendarEvent[]> {
  const result = await parseCalendarEventsWithDiagnostics(url, month, year);
  return result.events;
}

export async function parseCalendarEventsWithDiagnostics(
  url: string,
  month: number,
  year: number,
): Promise<{
  diagnostics: CalendarSourceDiagnostics;
  events: CalendarEvent[];
}> {
  const { diagnostics, icsText } = await fetchIcsText(url);
  let events: CalendarEvent[];

  try {
    const ical = await import("node-ical");
    const calendar = ical.parseICS(icsText) as CalendarResponse;
    events = normalizeParsedCalendar(calendar, month, year);
  } catch (error) {
    console.warn("node-ical parseICS failed; using ICS fallback parser.", error);
    events = parseFallbackIcsEvents(icsText, month, year);

    if (diagnostics.rawEventCount > 0 && countFallbackEventsWithStart(icsText) === 0) {
      const parserFailedDiagnostics = createSourceDiagnostics({
        ...diagnostics,
        filteredEventCount: 0,
        sourceStatus: "parser_failed",
      });

      throw new CalendarSourceError(
        "Calendar was read, but events could not be extracted from the feed.",
        "parser_failed",
        parserFailedDiagnostics,
        error,
      );
    }
  }

  const sourceStatus =
    events.length > 0 ? "parsed" : "no_events_for_selected_month";

  return {
    diagnostics: createSourceDiagnostics({
      ...diagnostics,
      filteredEventCount: events.length,
      sourceStatus,
    }),
    events,
  };
}

function formatDateLabel(startDate: string, endDate: string): string {
  const [, startMonth, startDay] = startDate.split("-").map(Number);
  const [, endMonth, endDay] = endDate.split("-").map(Number);

  if (startDate === endDate) {
    return `${startDay}/${startMonth}`;
  }

  if (startMonth === endMonth) {
    return `${startDay}-${endDay}/${startMonth}`;
  }

  return `${startDay}/${startMonth}-${endDay}/${endMonth}`;
}

function shouldShowLocation(title: string, location: string): boolean {
  return Boolean(location) && !title.includes(location);
}

function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent {
  const start = new Date(event.start) as DateWithTimeZone;
  const end = new Date(event.end) as DateWithTimeZone;

  if (event.allDay) {
    start.dateOnly = true;
    end.dateOnly = true;
  }

  const displayEnd = getDisplayEndDate(start, end, event.allDay);
  const startDate = createDateKey(getDateParts(start));
  const endDate = createDateKey(getDateParts(displayEnd));
  const title = event.title.trim();
  const location = event.location?.trim() ?? "";
  const displayLocation = shouldShowLocation(title, location) ? location : "";
  const timeLabel = event.displayTime ?? "";
  const dateLabel = formatDateLabel(startDate, endDate);
  const displayText = [dateLabel, timeLabel, title, displayLocation]
    .filter(Boolean)
    .join(" ");

  return {
    dateLabel,
    startDate,
    endDate,
    title,
    timeLabel,
    location: displayLocation,
    displayText,
    allDay: event.allDay,
    multiDay: startDate !== endDate,
  };
}

export function formatCalendarEvents(
  events: CalendarEvent[],
  month: number,
  year: number,
): {
  formattedText: string;
  normalizedEvents: FormattedCalendarEvent[];
  summary: string;
} {
  const normalizedEvents = events.map(toFormattedCalendarEvent);

  return {
    formattedText: normalizedEvents.map((event) => event.displayText).join("\n"),
    normalizedEvents,
    summary:
      normalizedEvents.length > 0
        ? `${normalizedEvents.length} events found for ${getMonthName(month)} ${year}`
        : "No events found for selected month.",
  };
}
