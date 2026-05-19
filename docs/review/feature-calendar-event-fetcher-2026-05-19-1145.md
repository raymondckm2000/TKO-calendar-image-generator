# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Implemented the MVP calendar event fetcher UI and API response for formatted text plus normalized event JSON.

## Files Changed
- app/api/extract/route.ts
- app/page.tsx
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/parser.ts
- lib/calendar/types.ts
- lib/i18n/en.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1145.md

## What Changed
- Added a client UI for calendar link, year, month, fetch action, copy action, formatted text output, and normalized JSON output.
- Centralized MVP English UI strings in a simple i18n file for future zh-HK support.
- Added POST support to the extract API while preserving GET support.
- Added Google Calendar embed link conversion from `src` to public ICS URL format.
- Updated event filtering to include events that overlap the selected month, including multi-day events that start before the month.
- Added formatted one-line event output and normalized event JSON with `dateLabel`, date range, title, start time, location, all-day, and multi-day fields.
- Avoided description in formatted output and suppressed duplicate location text when already present in the title.
- Updated sorting by displayed local date, all-day first, then start time.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- Browser smoke test at `http://127.0.0.1:5184` - page rendered with title and form visible

## Risks
- Calendar timezone handling follows the existing `Asia/Hong_Kong` calendar timezone constant.
- Some private or non-public Google Calendar links will still fail as expected because the MVP fetches public ICS feeds only.

## Diff
```diff
diff --git a/app/api/extract/route.ts b/app/api/extract/route.ts
@@
-import { parseCalendarEvents } from "@/lib/calendar/parser";
+import {
+  formatCalendarEvents,
+  parseCalendarEvents,
+  resolveCalendarIcsUrl,
+} from "@/lib/calendar/parser";
@@
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
@@
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
@@
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
+export async function POST(request: Request) {
+  let body: { calendarLink?: string; month?: unknown; year?: unknown };
+  body = await request.json();
+  return handleCalendarRequest({
+    calendarLink: body.calendarLink,
+    month,
+    year,
+  });
+}

diff --git a/app/page.tsx b/app/page.tsx
@@
-import Image from "next/image";
+import { CalendarEventFetcher } from "@/components/calendar/CalendarEventFetcher";
 
 export default function Home() {
-  return (...starter page...);
+  return <CalendarEventFetcher />;
 }

diff --git a/components/calendar/CalendarEventFetcher.tsx b/components/calendar/CalendarEventFetcher.tsx
new file mode 100644
@@
+"use client";
+
+import { FormEvent, useEffect, useMemo, useState } from "react";
+import { en } from "@/lib/i18n/en";
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
+  useEffect(() => {
+    window.localStorage.setItem(
+      STORAGE_KEY,
+      JSON.stringify({ calendarLink, year, month }),
+    );
+  }, [calendarLink, month, year]);
+
+  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
+    event.preventDefault();
+    const response = await fetch("/api/extract", {
+      body: JSON.stringify({
+        calendarLink,
+        month: Number.parseInt(month, 10),
+        year: Number.parseInt(year, 10),
+      }),
+      headers: { "content-type": "application/json" },
+      method: "POST",
+    });
+    const data = (await response.json()) as ExtractResponse;
+    setSummary(data.summary ?? "");
+    setFormattedText(data.formattedText ?? "");
+    setNormalizedEvents(data.normalizedEvents ?? []);
+  }
+}

diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
@@
-import type { CalendarEvent } from "./types";
+import type { CalendarEvent, FormattedCalendarEvent } from "./types";
@@
+export function resolveCalendarIcsUrl(calendarLink: string): string {
+  const trimmedLink = calendarLink.trim();
+  const parsedUrl = new URL(trimmedLink);
+  if (parsedUrl.pathname.includes("/calendar/embed")) {
+    const source = parsedUrl.searchParams.get("src");
+    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
+      source,
+    )}/public/basic.ics`;
+  }
+  return trimmedLink;
+}
@@
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
@@
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
@@
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

diff --git a/lib/i18n/en.ts b/lib/i18n/en.ts
new file mode 100644
@@
+export const en = {
+  calendarFetcher: {
+    title: "TKO Calendar Fetcher",
+    calendarLinkLabel: "Google Calendar link",
+    yearLabel: "Year",
+    monthLabel: "Month",
+    fetchButton: "Fetch events",
+    errorMessage:
+      "Unable to read calendar. Please confirm the calendar is public and the link is correct.",
+    months: ["January", "February", "March", "..."],
+  },
+} as const;
```

## Output
The home page now provides a form that submits a public Google Calendar ICS or embed link, selected year, and selected month to `/api/extract`. The API returns `success`, `summary`, `formattedText`, and `normalizedEvents`, and the UI displays the formatted text with copy support plus readable normalized JSON.

## Review Status
READY_FOR_PM_REVIEW
