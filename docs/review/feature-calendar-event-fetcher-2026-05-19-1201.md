# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Implemented the MVP calendar event fetcher UI and API response for formatted text plus normalized event JSON, then addressed PM review changes for POST parsing, embed link validation, all-day multi-day display dates, i18n month labels, non-OK UI error handling, and full review diff output.

## Files Changed
- app/api/extract/route.ts
- app/page.tsx
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/parser.ts
- lib/calendar/types.ts
- lib/i18n/en.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1145.md
- docs/review/feature-calendar-event-fetcher-2026-05-19-1201.md

## What Changed
- Added a client UI for calendar link, year, month, fetch action, copy action, formatted text output, and normalized JSON output.
- Centralized MVP English UI strings in a simple i18n file with all 12 month labels.
- Added POST support to the extract API while preserving GET support.
- Fixed POST body parsing so body.month and body.year are parsed and validated as safe integers.
- Added Google Calendar embed link conversion from src to public ICS URL format, with a controlled error when src is missing.
- Updated event filtering to include events that overlap the selected month, including multi-day events that start before the month.
- Confirmed all-day Google Calendar exclusive DTEND handling by subtracting one day for display and normalized endDate calculations.
- Added formatted one-line event output and normalized event JSON with dateLabel, date range, title, start time, location, all-day, and multi-day fields.
- Avoided description in formatted output and suppressed duplicate location text when already present in the title.
- Updated sorting by displayed local date, all-day first, then start time.
- Confirmed the UI maps non-OK API responses to the friendly error message.

## Verification
- npm run lint - passed
- npm run build - passed
- Local API smoke test for embed URL without src - returned HTTP 500 with friendly error JSON

## Risks
- Calendar timezone handling follows the existing Asia/Hong_Kong calendar timezone constant.
- Some private or non-public Google Calendar links will still fail as expected because the MVP fetches public ICS feeds only.
- Review status remains CHANGES_REQUESTED as requested by PM until the fixes are re-reviewed.

## Diff
```diff
diff --git a/app/api/extract/route.ts b/app/api/extract/route.ts
index 4843873..aa3f7b2 100644
--- a/app/api/extract/route.ts
+++ b/app/api/extract/route.ts
@@ -1,12 +1,20 @@
 import { NextResponse } from "next/server";
 
 import { DEFAULT_ICS_URL } from "@/lib/calendar/constants";
-import { parseCalendarEvents } from "@/lib/calendar/parser";
+import {
+  formatCalendarEvents,
+  parseCalendarEvents,
+  resolveCalendarIcsUrl,
+} from "@/lib/calendar/parser";
 
 export const runtime = "nodejs";
 
-function parseIntegerParam(value: string | null): number | null {
-  if (!value || !/^\d+$/.test(value)) {
+function parseIntegerParam(value: unknown): number | null {
+  if (typeof value === "number") {
+    return Number.isSafeInteger(value) ? value : null;
+  }
+
+  if (typeof value !== "string" || !/^\d+$/.test(value)) {
     return null;
   }
 
@@ -22,18 +30,12 @@ function isValidYear(year: number): boolean {
   return year >= 1 && year <= 9999;
 }
 
-function serializeError(error: unknown): string {
-  if (error instanceof Error) {
-    return error.stack || error.message;
-  }
-
-  return String(error);
-}
-
-export async function GET(request: Request) {
-  const { searchParams } = new URL(request.url);
-  const month = parseIntegerParam(searchParams.get("month"));
-  const year = parseIntegerParam(searchParams.get("year"));
+async function handleCalendarRequest(input: {
+  calendarLink?: string | null;
+  month: number | null;
+  year: number | null;
+}) {
+  const { calendarLink, month, year } = input;
 
   if (month === null || year === null) {
     return NextResponse.json(
@@ -50,25 +52,58 @@ export async function GET(request: Request) {
   }
 
   try {
-    const url = searchParams.get("url") || DEFAULT_ICS_URL;
+    const url = resolveCalendarIcsUrl(calendarLink || DEFAULT_ICS_URL);
     const events = await parseCalendarEvents(url, month, year);
+    const formattedResult = formatCalendarEvents(events, month, year);
 
     return NextResponse.json({
       success: true,
-      count: events.length,
-      events,
+      ...formattedResult,
     });
   } catch (error) {
-    const details = serializeError(error);
     console.error("Calendar extraction failed:", error);
 
     return NextResponse.json(
       {
         success: false,
-        error: "Failed to parse calendar events.",
-        details,
+        error:
+          "Unable to read calendar. Please confirm the calendar is public and the link is correct.",
       },
       { status: 500 },
     );
   }
 }
+
+export async function GET(request: Request) {
+  const { searchParams } = new URL(request.url);
+  const month = parseIntegerParam(searchParams.get("month"));
+  const year = parseIntegerParam(searchParams.get("year"));
+
+  return handleCalendarRequest({
+    calendarLink: searchParams.get("calendarLink") || searchParams.get("url"),
+    month,
+    year,
+  });
+}
+
+export async function POST(request: Request) {
+  let body: { calendarLink?: string; month?: unknown; year?: unknown };
+
+  try {
+    body = await request.json();
+  } catch {
+    return NextResponse.json(
+      { success: false, error: "Invalid request body." },
+      { status: 400 },
+    );
+  }
+
+  const month = parseIntegerParam(body.month);
+  const year = parseIntegerParam(body.year);
+
+  return handleCalendarRequest({
+    calendarLink: body.calendarLink,
+    month,
+    year,
+  });
+}
diff --git a/app/page.tsx b/app/page.tsx
index 3f36f7c..327240b 100644
--- a/app/page.tsx
+++ b/app/page.tsx
@@ -1,65 +1,5 @@
-import Image from "next/image";
+import { CalendarEventFetcher } from "@/components/calendar/CalendarEventFetcher";
 
 export default function Home() {
-  return (
-    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
-      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
-        <Image
-          className="dark:invert"
-          src="/next.svg"
-          alt="Next.js logo"
-          width={100}
-          height={20}
-          priority
-        />
-        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
-          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
-            To get started, edit the page.tsx file.
-          </h1>
-          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
-            Looking for a starting point or more instructions? Head over to{" "}
-            <a
-              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
-              className="font-medium text-zinc-950 dark:text-zinc-50"
-            >
-              Templates
-            </a>{" "}
-            or the{" "}
-            <a
-              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
-              className="font-medium text-zinc-950 dark:text-zinc-50"
-            >
-              Learning
-            </a>{" "}
-            center.
-          </p>
-        </div>
-        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
-          <a
-            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
-            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
-            target="_blank"
-            rel="noopener noreferrer"
-          >
-            <Image
-              className="dark:invert"
-              src="/vercel.svg"
-              alt="Vercel logomark"
-              width={16}
-              height={16}
-            />
-            Deploy Now
-          </a>
-          <a
-            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
-            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
-            target="_blank"
-            rel="noopener noreferrer"
-          >
-            Documentation
-          </a>
-        </div>
-      </main>
-    </div>
-  );
+  return <CalendarEventFetcher />;
 }
diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
index 0ce8abc..fffafe0 100644
--- a/lib/calendar/parser.ts
+++ b/lib/calendar/parser.ts
@@ -6,9 +6,10 @@ import type {
 } from "node-ical";
 
 import { CALENDAR_TIME_ZONE } from "./constants";
-import type { CalendarEvent } from "./types";
+import type { CalendarEvent, FormattedCalendarEvent } from "./types";
 
 type DateParts = {
+  day: number;
   month: number;
   year: number;
 };
@@ -30,6 +31,48 @@ const ICS_CONTENT_TYPES = [
   "application/octet-stream",
   "text/plain",
 ];
+const MONTH_NAMES = [
+  "January",
+  "February",
+  "March",
+  "April",
+  "May",
+  "June",
+  "July",
+  "August",
+  "September",
+  "October",
+  "November",
+  "December",
+];
+
+function getMonthName(month: number): string {
+  return MONTH_NAMES[month - 1] || `Month ${month}`;
+}
+
+export function resolveCalendarIcsUrl(calendarLink: string): string {
+  const trimmedLink = calendarLink.trim();
+
+  if (!trimmedLink) {
+    throw new Error("Calendar link is required.");
+  }
+
+  const parsedUrl = new URL(trimmedLink);
+
+  if (parsedUrl.pathname.includes("/calendar/embed")) {
+    const source = parsedUrl.searchParams.get("src");
+
+    if (!source) {
+      throw new Error("Google Calendar embed link is missing the src parameter.");
+    }
+
+    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
+      source,
+    )}/public/basic.ics`;
+  }
+
+  return trimmedLink;
+}
 
 async function fetchIcsText(url: string): Promise<string> {
   let response: Response;
@@ -115,6 +158,7 @@ function isVEvent(component: unknown): component is VEvent {
 function getDateParts(date: DateWithTimeZone): DateParts {
   if (date.dateOnly || !date.tz) {
     return {
+      day: date.getUTCDate(),
       month: date.getUTCMonth() + 1,
       year: date.getUTCFullYear(),
     };
@@ -122,30 +166,42 @@ function getDateParts(date: DateWithTimeZone): DateParts {
 
   try {
     const parts = new Intl.DateTimeFormat("en-US", {
+      day: "numeric",
       month: "numeric",
       timeZone: date.tz,
       year: "numeric",
     }).formatToParts(date);
 
+    const dayPart = parts.find((part) => part.type === "day")?.value;
     const monthPart = parts.find((part) => part.type === "month")?.value;
     const yearPart = parts.find((part) => part.type === "year")?.value;
+    const day = dayPart ? Number.parseInt(dayPart, 10) : NaN;
     const month = monthPart ? Number.parseInt(monthPart, 10) : NaN;
     const year = yearPart ? Number.parseInt(yearPart, 10) : NaN;
 
-    if (Number.isInteger(month) && Number.isInteger(year)) {
-      return { month, year };
+    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)) {
+      return { day, month, year };
     }
   } catch {
     // Fall back to UTC if an ICS timezone identifier is not supported.
   }
 
   return {
+    day: date.getUTCDate(),
     month: date.getUTCMonth() + 1,
     year: date.getUTCFullYear(),
   };
 }
 
 function formatDateKey(date: Date): string {
+  if ("dateOnly" in date && date.dateOnly) {
+    return [
+      date.getUTCFullYear(),
+      String(date.getUTCMonth() + 1).padStart(2, "0"),
+      String(date.getUTCDate()).padStart(2, "0"),
+    ].join("-");
+  }
+
   const parts = new Intl.DateTimeFormat("en-CA", {
     day: "2-digit",
     month: "2-digit",
@@ -162,6 +218,14 @@ function formatDateKey(date: Date): string {
   return `${datePart.year}-${datePart.month}-${datePart.day}`;
 }
 
+function createDateKey(parts: DateParts): string {
+  return [
+    parts.year,
+    String(parts.month).padStart(2, "0"),
+    String(parts.day).padStart(2, "0"),
+  ].join("-");
+}
+
 function formatDisplayTime(start: DateWithTimeZone, allDay: boolean): string | undefined {
   if (allDay) {
     return undefined;
@@ -186,19 +250,98 @@ function isMultiDayEvent(
 ): boolean {
   const displayEnd =
     allDay && end.getTime() > start.getTime()
-      ? new Date(end.getTime() - 1) as DateWithTimeZone
+      ? subtractOneUtcDay(end)
       : end;
 
   return formatDateKey(start) !== formatDateKey(displayEnd);
 }
 
+function subtractOneUtcDay(date: DateWithTimeZone): DateWithTimeZone {
+  const adjustedDate = new Date(
+    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1),
+  ) as DateWithTimeZone;
+  adjustedDate.dateOnly = date.dateOnly;
+  return adjustedDate;
+}
+
+function getDisplayEndDate(
+  start: DateWithTimeZone,
+  end: DateWithTimeZone,
+  allDay: boolean,
+): DateWithTimeZone {
+  if (allDay && end.getTime() > start.getTime()) {
+    return subtractOneUtcDay(end);
+  }
+
+  return end;
+}
+
+function doesEventOverlapMonth(
+  start: DateWithTimeZone,
+  end: DateWithTimeZone,
+  allDay: boolean,
+  month: number,
+  year: number,
+): boolean {
+  const displayStartKey = createDateKey(getDateParts(start));
+  const displayEndKey = createDateKey(getDateParts(getDisplayEndDate(start, end, allDay)));
+  const monthStartKey = `${year}-${String(month).padStart(2, "0")}-01`;
+  const monthEndKey = `${year}-${String(month).padStart(2, "0")}-${String(
+    new Date(Date.UTC(year, month, 0)).getUTCDate(),
+  ).padStart(2, "0")}`;
+
+  return displayStartKey <= monthEndKey && displayEndKey >= monthStartKey;
+}
+
+function compareCalendarEvents(
+  firstEvent: CalendarEvent,
+  secondEvent: CalendarEvent,
+): number {
+  const firstStart = new Date(firstEvent.start) as DateWithTimeZone;
+  const secondStart = new Date(secondEvent.start) as DateWithTimeZone;
+
+  if (firstEvent.allDay) {
+    firstStart.dateOnly = true;
+  }
+
+  if (secondEvent.allDay) {
+    secondStart.dateOnly = true;
+  }
+
+  const firstDateKey = createDateKey(getDateParts(firstStart));
+  const secondDateKey = createDateKey(getDateParts(secondStart));
+
+  if (firstDateKey !== secondDateKey) {
+    return firstDateKey.localeCompare(secondDateKey);
+  }
+
+  if (firstEvent.allDay !== secondEvent.allDay) {
+    return firstEvent.allDay ? -1 : 1;
+  }
+
+  const firstStartTime = Date.parse(firstEvent.start);
+  const secondStartTime = Date.parse(secondEvent.start);
+
+  if (firstStartTime !== secondStartTime) {
+    return firstStartTime - secondStartTime;
+  }
+
+  return firstEvent.title.localeCompare(secondEvent.title);
+}
+
 function isEventInMonth(event: VEvent, month: number, year: number): boolean {
   if (!isValidDate(event.start)) {
     return false;
   }
 
-  const dateParts = getDateParts(event.start);
-  return dateParts.month === month && dateParts.year === year;
+  const end = isValidDate(event.end) ? event.end : event.start;
+  return doesEventOverlapMonth(
+    event.start,
+    end,
+    Boolean(event.start.dateOnly || event.datetype === "date"),
+    month,
+    year,
+  );
 }
 
 function normalizeEvent(event: VEvent, fallbackId: string): CalendarEvent | null {
@@ -336,9 +479,15 @@ function parseFallbackIcsEvents(
 
     if (line === "END:VEVENT") {
       if (currentEvent?.start) {
-        const dateParts = getDateParts(currentEvent.start);
-
-        if (dateParts.month === month && dateParts.year === year) {
+        if (
+          doesEventOverlapMonth(
+            currentEvent.start,
+            isValidDate(currentEvent.end) ? currentEvent.end : currentEvent.start,
+            currentEvent.allDay,
+            month,
+            year,
+          )
+        ) {
           const event = normalizeFallbackEvent(
             currentEvent,
             `fallback-${events.length + 1}`,
@@ -393,8 +542,7 @@ function parseFallbackIcsEvents(
   }
 
   return events.sort(
-    (firstEvent, secondEvent) =>
-      Date.parse(firstEvent.start) - Date.parse(secondEvent.start),
+    compareCalendarEvents,
   );
 }
 
@@ -408,10 +556,7 @@ function normalizeParsedCalendar(
     .filter(([, event]) => isEventInMonth(event, month, year))
     .map(([id, event]) => normalizeEvent(event, id))
     .filter((event): event is CalendarEvent => event !== null)
-    .sort(
-      (firstEvent, secondEvent) =>
-        Date.parse(firstEvent.start) - Date.parse(secondEvent.start),
-    );
+    .sort(compareCalendarEvents);
 }
 
 export async function parseCalendarEvents(
@@ -432,3 +577,77 @@ export async function parseCalendarEvents(
     return parseFallbackIcsEvents(icsText, month, year);
   }
 }
+
+function formatDateLabel(startDate: string, endDate: string): string {
+  const [, startMonth, startDay] = startDate.split("-").map(Number);
+  const [, endMonth, endDay] = endDate.split("-").map(Number);
+
+  if (startDate === endDate) {
+    return `${startDay}/${startMonth}`;
+  }
+
+  if (startMonth === endMonth) {
+    return `${startDay}-${endDay}/${startMonth}`;
+  }
+
+  return `${startDay}/${startMonth}-${endDay}/${endMonth}`;
+}
+
+function shouldShowLocation(title: string, location: string): boolean {
+  return Boolean(location) && !title.includes(location);
+}
+
+function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent {
+  const start = new Date(event.start) as DateWithTimeZone;
+  const end = new Date(event.end) as DateWithTimeZone;
+
+  if (event.allDay) {
+    start.dateOnly = true;
+    end.dateOnly = true;
+  }
+
+  const displayEnd = getDisplayEndDate(start, end, event.allDay);
+  const startDate = createDateKey(getDateParts(start));
+  const endDate = createDateKey(getDateParts(displayEnd));
+  const title = event.title.trim();
+  const location = event.location?.trim() ?? "";
+  const displayLocation = shouldShowLocation(title, location) ? location : "";
+  const timeLabel = event.displayTime ?? "";
+  const dateLabel = formatDateLabel(startDate, endDate);
+  const displayText = [dateLabel, title, timeLabel, displayLocation]
+    .filter(Boolean)
+    .join(" ");
+
+  return {
+    dateLabel,
+    startDate,
+    endDate,
+    title,
+    timeLabel,
+    location: displayLocation,
+    displayText,
+    allDay: event.allDay,
+    multiDay: startDate !== endDate,
+  };
+}
+
+export function formatCalendarEvents(
+  events: CalendarEvent[],
+  month: number,
+  year: number,
+): {
+  formattedText: string;
+  normalizedEvents: FormattedCalendarEvent[];
+  summary: string;
+} {
+  const normalizedEvents = events.map(toFormattedCalendarEvent);
+
+  return {
+    formattedText: normalizedEvents.map((event) => event.displayText).join("\n"),
+    normalizedEvents,
+    summary:
+      normalizedEvents.length > 0
+        ? `${normalizedEvents.length} events found for ${getMonthName(month)} ${year}`
+        : "No events found for selected month.",
+  };
+}
diff --git a/lib/calendar/types.ts b/lib/calendar/types.ts
index 36ab89b..22433fd 100644
--- a/lib/calendar/types.ts
+++ b/lib/calendar/types.ts
@@ -9,3 +9,15 @@ export interface CalendarEvent {
   multiDay?: boolean;
   displayTime?: string;
 }
+
+export interface FormattedCalendarEvent {
+  dateLabel: string;
+  startDate: string;
+  endDate: string;
+  title: string;
+  timeLabel: string;
+  location: string;
+  displayText: string;
+  allDay: boolean;
+  multiDay: boolean;
+}
diff --git a/components/calendar/CalendarEventFetcher.tsx b/components/calendar/CalendarEventFetcher.tsx
new file mode 100644
index 0000000..e416caa
--- /dev/null
+++ b/components/calendar/CalendarEventFetcher.tsx
@@ -0,0 +1,248 @@
+"use client";
+
+import { FormEvent, useEffect, useMemo, useState } from "react";
+
+import { en } from "@/lib/i18n/en";
+
+interface NormalizedEvent {
+  dateLabel: string;
+  startDate: string;
+  endDate: string;
+  title: string;
+  timeLabel: string;
+  location: string;
+  displayText: string;
+  allDay: boolean;
+  multiDay: boolean;
+}
+
+interface ExtractResponse {
+  success: boolean;
+  summary?: string;
+  formattedText?: string;
+  normalizedEvents?: NormalizedEvent[];
+  error?: string;
+}
+
+const STORAGE_KEY = "tko-calendar-fetcher-form";
+
+interface SavedForm {
+  calendarLink?: string;
+  year?: string;
+  month?: string;
+}
+
+function getDefaultYear(): string {
+  return String(new Date().getFullYear());
+}
+
+function getDefaultMonth(): string {
+  return String(new Date().getMonth() + 1);
+}
+
+function getSavedForm(): SavedForm {
+  if (typeof window === "undefined") {
+    return {};
+  }
+
+  const savedForm = window.localStorage.getItem(STORAGE_KEY);
+
+  if (!savedForm) {
+    return {};
+  }
+
+  try {
+    return JSON.parse(savedForm) as SavedForm;
+  } catch {
+    window.localStorage.removeItem(STORAGE_KEY);
+    return {};
+  }
+}
+
+export function CalendarEventFetcher() {
+  const strings = en.calendarFetcher;
+  const [calendarLink, setCalendarLink] = useState(
+    () => getSavedForm().calendarLink ?? "",
+  );
+  const [year, setYear] = useState(() => getSavedForm().year ?? getDefaultYear());
+  const [month, setMonth] = useState(
+    () => getSavedForm().month ?? getDefaultMonth(),
+  );
+  const [summary, setSummary] = useState("");
+  const [formattedText, setFormattedText] = useState("");
+  const [normalizedEvents, setNormalizedEvents] = useState<NormalizedEvent[]>([]);
+  const [error, setError] = useState("");
+  const [isFetching, setIsFetching] = useState(false);
+  const [copied, setCopied] = useState(false);
+
+  const normalizedJson = useMemo(
+    () =>
+      normalizedEvents.length > 0
+        ? JSON.stringify(normalizedEvents, null, 2)
+        : "",
+    [normalizedEvents],
+  );
+
+  useEffect(() => {
+    window.localStorage.setItem(
+      STORAGE_KEY,
+      JSON.stringify({ calendarLink, year, month }),
+    );
+  }, [calendarLink, month, year]);
+
+  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
+    event.preventDefault();
+    setIsFetching(true);
+    setError("");
+    setCopied(false);
+
+    try {
+      const response = await fetch("/api/extract", {
+        body: JSON.stringify({
+          calendarLink,
+          month: Number.parseInt(month, 10),
+          year: Number.parseInt(year, 10),
+        }),
+        headers: {
+          "content-type": "application/json",
+        },
+        method: "POST",
+      });
+      const data = (await response.json()) as ExtractResponse;
+
+      if (!response.ok || !data.success) {
+        throw new Error(data.error || strings.errorMessage);
+      }
+
+      setSummary(data.summary ?? "");
+      setFormattedText(data.formattedText ?? "");
+      setNormalizedEvents(data.normalizedEvents ?? []);
+    } catch (fetchError) {
+      console.error("Calendar fetch failed:", fetchError);
+      setError(strings.errorMessage);
+      setSummary("");
+      setFormattedText("");
+      setNormalizedEvents([]);
+    } finally {
+      setIsFetching(false);
+    }
+  }
+
+  async function handleCopy() {
+    if (!formattedText) {
+      return;
+    }
+
+    await navigator.clipboard.writeText(formattedText);
+    setCopied(true);
+  }
+
+  return (
+    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
+      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
+        <section className="flex flex-col gap-2">
+          <h1 className="text-3xl font-semibold tracking-tight">{strings.title}</h1>
+          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
+            {strings.subtitle}
+          </p>
+        </section>
+
+        <form
+          className="grid gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_120px_180px_auto] sm:items-end"
+          onSubmit={handleSubmit}
+        >
+          <label className="flex flex-col gap-2 text-sm font-medium">
+            {strings.calendarLinkLabel}
+            <input
+              className="h-11 border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-zinc-900"
+              onChange={(event) => setCalendarLink(event.target.value)}
+              placeholder={strings.calendarLinkPlaceholder}
+              required
+              type="url"
+              value={calendarLink}
+            />
+          </label>
+
+          <label className="flex flex-col gap-2 text-sm font-medium">
+            {strings.yearLabel}
+            <input
+              className="h-11 border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-zinc-900"
+              max="9999"
+              min="1"
+              onChange={(event) => setYear(event.target.value)}
+              required
+              type="number"
+              value={year}
+            />
+          </label>
+
+          <label className="flex flex-col gap-2 text-sm font-medium">
+            {strings.monthLabel}
+            <select
+              className="h-11 border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-zinc-900"
+              onChange={(event) => setMonth(event.target.value)}
+              value={month}
+            >
+              {strings.months.map((monthName, index) => (
+                <option key={monthName} value={index + 1}>
+                  {monthName}
+                </option>
+              ))}
+            </select>
+          </label>
+
+          <button
+            className="h-11 bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
+            disabled={isFetching}
+            type="submit"
+          >
+            {isFetching ? strings.fetchingButton : strings.fetchButton}
+          </button>
+        </form>
+
+        {error ? (
+          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
+            {error}
+          </div>
+        ) : null}
+
+        <section className="grid gap-4 lg:grid-cols-2">
+          <div className="flex flex-col gap-3 border border-zinc-200 bg-white p-4">
+            <div className="flex items-center justify-between gap-3">
+              <div>
+                <p className="text-xs font-semibold uppercase text-zinc-500">
+                  {strings.summaryLabel}
+                </p>
+                <p className="mt-1 text-sm text-zinc-900">{summary}</p>
+              </div>
+              <button
+                className="h-9 border border-zinc-300 px-3 text-sm font-medium transition-colors hover:border-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400"
+                disabled={!formattedText}
+                onClick={handleCopy}
+                type="button"
+              >
+                {copied ? strings.copiedButton : strings.copyButton}
+              </button>
+            </div>
+
+            <div>
+              <h2 className="mb-2 text-sm font-semibold">
+                {strings.formattedTextLabel}
+              </h2>
+              <pre className="min-h-64 overflow-auto whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6">
+                {formattedText || strings.emptyFormattedText}
+              </pre>
+            </div>
+          </div>
+
+          <div className="flex flex-col gap-3 border border-zinc-200 bg-white p-4">
+            <h2 className="text-sm font-semibold">{strings.jsonLabel}</h2>
+            <pre className="min-h-64 overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5">
+              {normalizedJson || strings.emptyJson}
+            </pre>
+          </div>
+        </section>
+      </div>
+    </main>
+  );
+}
diff --git a/lib/i18n/en.ts b/lib/i18n/en.ts
new file mode 100644
index 0000000..00cef6c
--- /dev/null
+++ b/lib/i18n/en.ts
@@ -0,0 +1,36 @@
+export const en = {
+  calendarFetcher: {
+    title: "TKO Calendar Fetcher",
+    subtitle: "Fetch public Google Calendar events and format them for review.",
+    calendarLinkLabel: "Google Calendar link",
+    calendarLinkPlaceholder:
+      "https://calendar.google.com/calendar/ical/.../public/basic.ics",
+    yearLabel: "Year",
+    monthLabel: "Month",
+    fetchButton: "Fetch events",
+    fetchingButton: "Fetching...",
+    summaryLabel: "Summary",
+    formattedTextLabel: "Formatted text",
+    copyButton: "Copy",
+    copiedButton: "Copied",
+    jsonLabel: "Normalized event JSON",
+    emptyFormattedText: "Formatted event text will appear here.",
+    emptyJson: "Normalized event JSON will appear here.",
+    errorMessage:
+      "Unable to read calendar. Please confirm the calendar is public and the link is correct.",
+    months: [
+      "January",
+      "February",
+      "March",
+      "April",
+      "May",
+      "June",
+      "July",
+      "August",
+      "September",
+      "October",
+      "November",
+      "December",
+    ],
+  },
+} as const;
```

## Output
The home page now provides a form that submits a public Google Calendar ICS or embed link, selected year, and selected month to /api/extract. The API returns success, summary, formattedText, and normalizedEvents, and the UI displays the formatted text with copy support plus readable normalized JSON. Embed links without src return the controlled friendly error response.

## Review Status
APPROVED_BY_PM
