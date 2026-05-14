# Task Review

## Summary
Completed an architecture and structure validation review for the current TKO Calendar Image Generator pipeline. Applied minimal structural fixes for App Router compatibility and PNG export readiness.

## Current Architecture
```txt
ICS Feed
-> Parser
-> JSON API
-> Month Matrix
-> Calendar Renderer
-> Demo Route
```

The architecture is now organized around reusable server and rendering modules:

- `lib/calendar/parser.ts` fetches and normalizes ICS events.
- `app/api/extract/route.ts` exposes normalized events as JSON.
- `lib/calendar/month.ts` generates the calendar matrix.
- `components/calendar/MonthlyCalendar.tsx` renders calendar UI from plain event data.
- `app/demo/page.tsx` renders the calendar directly from server-side calendar data.

## Structure Findings
- App Router route files are valid: `app/api/extract/route.ts` and `app/demo/page.tsx`.
- Calendar UI is correctly isolated under `components/calendar/`.
- Calendar domain logic is correctly isolated under `lib/calendar/`.
- Added `lib/calendar/constants.ts` to centralize the default ICS URL and display timezone.
- No invalid route folder names or missing required App Router files were found.

## App Router Findings
- `app/api/extract/route.ts` is correctly implemented as a Route Handler.
- `app/demo/page.tsx` is a Server Component, which is appropriate for server-side calendar data loading.
- `/demo` was explicitly marked dynamic so live ICS feed data is loaded at request time instead of being frozen during `next build`.

## Server/Client Findings
- Parser logic remains server-side.
- Rendering logic remains frontend-safe and imports only plain constants, types, and month matrix logic.
- No unnecessary `"use client"` directives were found.
- No client component imports `node-ical`, `node:module`, or Puppeteer.

## Anti-Patterns Found
- Found a Server Component self-fetch anti-pattern in `app/demo/page.tsx`:

```txt
Server Component -> fetch("/api/extract")
```

- Replaced it with a direct server-side call to `parseCalendarEvents`.
- This avoids an unnecessary HTTP hop, duplicated response validation, host/protocol reconstruction, and deployment edge cases.

## Fixes Applied
- Added `lib/calendar/constants.ts`.
- Moved `DEFAULT_ICS_URL` out of the API route and into shared calendar constants.
- Moved `CALENDAR_TIME_ZONE` out of duplicated renderer/matrix files and into shared calendar constants.
- Updated `/demo` to call `parseCalendarEvents(DEFAULT_ICS_URL, 5, 2026)` directly.
- Added `export const dynamic = "force-dynamic"` to `/demo`.

## Verification
- `npm run lint` passed.
- `npm run build` passed.
- Build output confirms:
  - `/api/extract` is dynamic.
  - `/demo` is dynamic.
- Manual verification:
  - `GET /api/extract?month=5&year=2026` returned HTTP 200 with `success: true` and `count: 15`.
  - `GET /demo` returned HTTP 200 and rendered May 2026 calendar output with default-feed events.

## Risks
- `node-ical` is intentionally loaded through Node runtime loading in `parser.ts` because previous Turbopack bundling produced runtime compatibility issues.
- The calendar matrix groups events by start date only; this matches current scope but may need expansion for multi-day visual spans.
- The renderer currently uses horizontal overflow on narrow screens, which is acceptable for MVP and screenshot rendering but may need a dedicated export viewport.

## Recommendations
- Keep `MonthlyCalendar` as a pure data-to-UI component for PNG export.
- Add a dedicated export route later that renders the same component with controlled width, font loading, background, and stable screenshot dimensions.
- Avoid placing Puppeteer logic in components; keep export orchestration in a server/API layer.
- Before PNG export, define export viewport dimensions and whether multi-day all-day events should appear on every covered date or only on the start date.

## PNG Export Readiness
The project is ready for the next PNG export phase at an architectural level.

Strengths:
- Calendar rendering is isolated and reusable.
- Parser and API are separate from UI rendering.
- Demo rendering works server-side and does not require browser-only APIs.
- No client-side Node.js dependencies are present.

Remaining decisions before PNG export:
- Export route location and API shape.
- Screenshot viewport dimensions.
- Font/network behavior during export.
- Multi-day event visual policy.

## Recommended Next Task
Implement a dedicated PNG export route using the existing rendering pipeline:

```txt
ICS Feed
-> parseCalendarEvents
-> generateMonthMatrix
-> MonthlyCalendar
-> controlled export page
-> Puppeteer screenshot
```

Recommended direction:
- Create a server-only export endpoint or action that renders a dedicated export page.
- Reuse `MonthlyCalendar` without adding export-specific behavior inside the component.
- Keep Puppeteer orchestration outside `components/`.

Risks before PNG export:
- Multi-day event representation is not yet export-polished.
- The current responsive web layout may need fixed export dimensions.
- External font and calendar feed fetch timing should be controlled for deterministic image generation.

Future scalability concerns:
- Additional calendars may need a calendar source abstraction.
- Localization may need centralized month, weekday, and event label formatting.
- Calendar themes should be introduced through props or styling wrappers, not parser changes.

## Diff
```diff
+ export const DEFAULT_ICS_URL =
+   "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics";
+
+ export const CALENDAR_TIME_ZONE = "Asia/Hong_Kong";
+
- const DEFAULT_ICS_URL =
-   "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics";
+ import { DEFAULT_ICS_URL } from "@/lib/calendar/constants";
+
- const response = await fetch(`${protocol}://${host}/api/extract?month=5&year=2026`);
+ const events = await parseCalendarEvents(DEFAULT_ICS_URL, 5, 2026);
+
+ export const dynamic = "force-dynamic";
```

## References Reviewed
- Next.js App Router docs: https://nextjs.org/docs/app
- Next.js Route Handlers docs: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js Server and Client Components docs: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js Fetching Data docs: https://nextjs.org/docs/app/getting-started/fetching-data

## Review Status
READY_FOR_PM_REVIEW
