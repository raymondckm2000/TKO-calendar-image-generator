# Task Review

## Branch
fix/calendar-source-validation

## Summary
Added calendar source diagnostics so fetch failures, invalid feeds, empty feeds, parser extraction failures, and valid feeds with no selected-month events are no longer hidden behind the generic no-events message.

## Files Changed
- app/api/extract/route.ts
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/parser.ts
- next.config.ts
- package.json
- package-lock.json

## What Changed
- Added source diagnostics for HTTP status, content type, body preview, VCALENDAR presence, VEVENT presence, raw VEVENT count, filtered event count, and sourceStatus.
- Added API response fields: sourceStatus, rawEventCount, and filteredEventCount.
- Added clear API error statuses for fetch_failed, invalid_feed, no_events_in_feed, and parser_failed.
- Preserved successful empty-month responses as success with sourceStatus no_events_for_selected_month.
- Updated the UI error path to display the API-provided user-facing source message instead of replacing it with a generic local message.
- Kept technical diagnostics in console output and this review file, not in the visible UI.
- Made node-ical and its runtime parser dependencies traceable in Vercel serverless functions.

## Verification
- npm run lint: PASS
- npm run build: PASS
- git diff --check: PASS
- Local production API, default TKO May 2026: sourceStatus parsed, rawEventCount 2113, filteredEventCount 23.
- Local production API, default TKO June 2026: sourceStatus parsed, rawEventCount 2113, filteredEventCount 12.
- Local browser production check: provided calendar, May 2026, UI summary showed "8 events found for May 2026" with formatted text and JSON populated.
- Direct provided ICS fetch:
  - HTTP status: 200
  - content-type: text/calendar; charset=utf-8
  - body first 500 characters: begins with "BEGIN:VCALENDAR", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "X-WR-CALNAME:Birthdays", and first VEVENT fields.
  - contains BEGIN:VCALENDAR: true
  - contains BEGIN:VEVENT: true
  - raw VEVENT count: 104
- Vercel preview URL: https://tko-calendar-image-generator-fb13ryz0i.vercel.app
- Vercel verification, default TKO June 2026: sourceStatus parsed, rawEventCount 2113, filteredEventCount 12, summary "12 events found for June 2026".
- Vercel verification, provided calendar May 2026: sourceStatus parsed, rawEventCount 104, filteredEventCount 8, summary "8 events found for May 2026".
- Commit SHA verified for implementation: 7c3d0d51b62be129f4e2eb25c5f83bd0e1a815be

## Risks
- API response now exposes aggregate diagnostic counts, but raw technical fetch details remain server-side only.
- Vercel deployment protection required a bypass header for verification; the public preview URL itself is protected by the project.
- Direct parser runtime dependencies are now listed at the top level to keep Vercel tracing reliable.

## Diff
```diff
+ sourceStatus: diagnostics.sourceStatus,
+ rawEventCount: diagnostics.rawEventCount,
+ filteredEventCount: diagnostics.filteredEventCount,
+ console.info("Calendar source diagnostics:", diagnostics);
+ serverExternalPackages: ["node-ical", "rrule-temporal", "temporal-polyfill"],
```

## Output
The provided calendar is public and valid. It is not inaccessible, not empty, and did not fail parsing. It has 104 raw VEVENT entries and 8 May 2026 events after filtering, so the final sourceStatus is parsed and the user-facing message is "8 events found for May 2026".

Default TKO calendar regression passed: June 2026 still returns 12 events on local production and Vercel preview.

Review file created:
docs/review/fix-calendar-source-validation-2026-05-20-1650.md

## Review Status
READY_FOR_PM_REVIEW
