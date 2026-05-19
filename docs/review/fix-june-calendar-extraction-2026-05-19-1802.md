# Task Review

## Branch
fix/june-calendar-extraction

## Summary
Fixed the Vercel/main calendar extraction mismatch for June 2026. The production route now attempts `node-ical` inside the parser try/catch and uses an upgraded fallback parser when Vercel cannot load `node-ical` runtime dependencies. June 2026 now renders 12 independent event lines with correct Hong Kong times.

## Files Changed
- lib/calendar/parser.ts
- next.config.ts
- scripts/debug-june-calendar.mjs
- docs/review/fix-june-calendar-extraction-2026-05-19-1802.md

## What Changed
- Moved `node-ical` loading back inside the guarded parser path so Vercel module-load failures fall back instead of crashing the route.
- Expanded fallback ICS parsing to handle `RRULE`, `EXDATE`, `RECURRENCE-ID`, weekly/monthly `BYDAY`, `COUNT`, all-day multi-day dates, override exclusion, and duplicate removal.
- Fixed fallback `TZID=Asia/Hong_Kong` date parsing so timed events display as `10am`, `10:30am`, and `8pm` instead of drifting to evening times.
- Added `scripts/debug-june-calendar.mjs` for raw June 2026 diagnostics.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- `git diff --check` - passed
- Local production API smoke test, May 2026 - `23 events found for May 2026`; required May lines present.
- Local production API smoke test, June 2026 - `12 events found for June 2026`; required June lines present.
- Local production browser UI - default calendar link matched `DEFAULT_ICS_URL`; June showed 12 events; bad `6pm` / `6:30pm` lines absent.
- Vercel preview browser UI - passed using Vercel automation bypass header because preview protection is enabled.

## Vercel Preview
- Preview URL: https://tko-calendar-image-generator-g8nbyz97z.vercel.app
- Commit SHA: `7507dcb2ef81e270c23105acf6c851d4a1013345`
- Branch: `fix/june-calendar-extraction`
- June 2026 UI summary: `12 events found for June 2026`
- Confirmed absent: `7/6 6pm`, `14/6 6pm`, `14/6 6:30pm`

## Risks
- The fallback recurrence parser intentionally supports the recurrence forms currently needed by this Google Calendar feed: weekly/monthly `BYDAY`, `COUNT`, `UNTIL`, exclusions, and overrides.
- Vercel preview protection requires an automation bypass header for non-interactive browser verification.

## Diff
```diff
- const ical = nodeRequire(["node", "ical"].join("-")) as typeof import("node-ical");
+ const ical = await import("node-ical");
  const calendar = ical.parseICS(icsText) as CalendarResponse;

+ case "EXDATE":
+   currentEvent.exdates = [...]
+ case "RECURRENCE-ID":
+   currentEvent.recurrenceId = parseIcsDate(value, allDay, timeZone);
+ case "RRULE":
+   currentEvent.rrule = value;

+ return dedupeCalendarEvents(
+   parsedEvents.flatMap((event, index) => {
+     if (event.rrule) {
+       return expandFallbackRecurringEvent(...);
+     }
+   }),
+ ).sort(compareCalendarEvents);
```

## Output
Vercel June 2026 formatted text copied from browser:

```txt
7/6 講道：Nevin Wong
7/6 10am 區域主日(尖東富豪)
12/6 奉獻日
12/6 8pm 九龍TG中心
14/6 講道：Godwin Chan
14/6 10:30am 九龍區域及屯門主日崇拜(荃灣悅來酒店)
19-20/6 （BT）
21/6 講道：Lucas Cheuk
21/6 10am 區域主日(盛德)
26/6 8pm 九龍TG中心
28/6 講道：Rex Chan
28/6 10am 區域主日(盛德)
```

Raw diagnostics summary:

```txt
區域主日(尖東富豪): raw RECURRENCE-ID;TZID=Asia/Hong_Kong:20260607T100000; normalized displayTime 10am; included as 7/6 10am 區域主日(尖東富豪).
奉獻日: monthly all-day RRULE BYDAY=2FR; normalized 12/6; included.
九龍TG中心: monthly timed RRULE BYDAY=2FR and BYDAY=4FR; normalized displayTime 8pm; included for 12/6 and 26/6.
九龍區域及屯門主日崇拜(荃灣悅來酒店): raw DTSTART;TZID=Asia/Hong_Kong:20260614T103000; normalized displayTime 10:30am; included.
（BT）: monthly all-day RRULE BYDAY=3FR; normalized dateLabel 19-20/6; included.
區域主日(盛德): weekly RRULE at 10am with 14/6 EXDATE and 7/6 override; included on 21/6 and 28/6.
```

## Review Status
READY_FOR_PM_REVIEW
