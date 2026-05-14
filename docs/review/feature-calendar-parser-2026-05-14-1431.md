# Task Review

## Branch
feature/calendar-parser

## Summary
Implemented Google Calendar ICS parsing and exposed `/api/extract` as a JSON endpoint for month/year event extraction.

## Files Changed
- lib/calendar/types.ts
- lib/calendar/parser.ts
- app/api/extract/route.ts
- docs/review/feature-calendar-parser-2026-05-14-1431.md

## What Changed
- Added `CalendarEvent` output type.
- Added `parseCalendarEvents(url, month, year)` using the `node-ical` async API.
- Normalized VEVENT fields into JSON-safe event objects.
- Added safe handling for missing summary, description, location, end date, and invalid start dates.
- Added month/year filtering with timezone-aware date-part extraction where ICS timezone data is present.
- Added `/api/extract` GET route with `url`, `month`, and `year` query params.
- Added fallback to the required default Google Calendar ICS feed when `url` is missing.
- Added validation responses for missing/invalid month and year.
- Added parser failure response handling with HTTP 500.

## Verification
- `npm run lint` passed.
- `npm run build` passed.
- Smoke tested `GET /api/extract?month=5&year=2026` against the required default Google Calendar ICS feed.
- Smoke test returned HTTP 200 with `success: true`, `count: 15`, and normalized event JSON.

## Risks
- Recurring event expansion is not implemented; this parser handles parsed VEVENT entries as required.
- Month filtering uses the event start date only, matching the requested task logic.
- Loading `node-ical` is intentionally done through Node runtime loading to avoid a Turbopack runtime issue with one of its bundled dependencies.

## Diff
```diff
+ export interface CalendarEvent {
+   id: string;
+   title: string;
+   description?: string;
+   location?: string;
+   start: string;
+   end: string;
+   allDay: boolean;
+ }
+
+ export async function parseCalendarEvents(
+   url: string,
+   month: number,
+   year: number,
+ ): Promise<CalendarEvent[]> {
+   const { createRequire } = await import("node:module");
+   const nodeRequire = createRequire(`${process.cwd()}/package.json`);
+   const ical = nodeRequire(["node", "ical"].join("-")) as typeof import("node-ical");
+   const calendar = await ical.async.fromURL(url);
+   return Object.entries(calendar)
+     .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
+     .filter(([, event]) => isEventInMonth(event, month, year))
+     .map(([id, event]) => normalizeEvent(event, id))
+     .filter((event): event is CalendarEvent => event !== null)
+     .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
+ }
+
+ const DEFAULT_ICS_URL =
+   "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics";
+
+ export async function GET(request: Request) {
+   const events = await parseCalendarEvents(url, month, year);
+   return NextResponse.json({ success: true, count: events.length, events });
+ }
```

## Output
`GET /api/extract?month=5&year=2026` returned:

```json
{
  "success": true,
  "count": 15,
  "events": [
    {
      "id": "0o38nb1mu84otg7pung3rolp1t@google.com",
      "title": "講道：Antony Wong",
      "start": "2026-05-02T16:00:00.000Z",
      "end": "2026-05-03T16:00:00.000Z",
      "allDay": true
    }
  ]
}
```

## Review Status
READY_FOR_PM_REVIEW
