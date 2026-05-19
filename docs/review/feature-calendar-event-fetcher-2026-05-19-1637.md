# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Verified and fixed June 2026 output so API and browser UI both show the recurring/detail events independently with correct Hong Kong display times.

## Files Changed
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/parser.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1637.md

## What Changed
- Added a final normalized-event de-duplication pass to remove duplicate recurrence override rows exposed by `node-ical` under both date and ISO keys.
- Kept RRULE expansion and recurrence override handling.
- Kept independent-line output; no same-day merge logic was reintroduced.
- Prefilled the UI calendar link with the existing `DEFAULT_ICS_URL` when no saved link exists, so local browser verification uses the same public ICS feed as the API smoke tests.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- `git diff --check` - passed
- Fresh production local server: `npm run start -- --hostname 127.0.0.1 --port 5187`
- API smoke test for May 2026 - `23 events found for May 2026`
- API smoke test for June 2026 - `12 events found for June 2026`
- Browser UI verification for June 2026 - `12 events found for June 2026`
- Confirmed no bad `6pm` / `6:30pm` Sunday service times remain.
- Confirmed API and browser UI both include all required June timed/detail lines.

## Risks
- Calendar timezone handling still follows the existing `Asia/Hong_Kong` constant.
- RRULE and recurrence override support depends on `node-ical` exposing `rrule`, `recurrences`, and `exdate`.
- Fallback ICS parsing still does not expand RRULE recurrence rules.

## Diff
```diff
diff --git a/components/calendar/CalendarEventFetcher.tsx b/components/calendar/CalendarEventFetcher.tsx
index e416caa..c660f4e 100644
--- a/components/calendar/CalendarEventFetcher.tsx
+++ b/components/calendar/CalendarEventFetcher.tsx
@@ -2,6 +2,7 @@
 
 import { FormEvent, useEffect, useMemo, useState } from "react";
 
+import { DEFAULT_ICS_URL } from "@/lib/calendar/constants";
 import { en } from "@/lib/i18n/en";
 
 interface NormalizedEvent {
@@ -62,7 +63,7 @@ function getSavedForm(): SavedForm {
 export function CalendarEventFetcher() {
   const strings = en.calendarFetcher;
   const [calendarLink, setCalendarLink] = useState(
-    () => getSavedForm().calendarLink ?? "",
+    () => getSavedForm().calendarLink || DEFAULT_ICS_URL,
   );
   const [year, setYear] = useState(() => getSavedForm().year ?? getDefaultYear());
   const [month, setMonth] = useState(
diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
index 544c9f0..040ccde 100644
--- a/lib/calendar/parser.ts
+++ b/lib/calendar/parser.ts
@@ -689,6 +689,29 @@ function normalizeParsedCalendar(
       return [normalizeEvent(event, id)];
     })
     .filter((event): event is CalendarEvent => event !== null)
+    .filter((event, index, events) => {
+      const eventKey = [
+        event.title,
+        event.start,
+        event.end,
+        event.allDay ? "all-day" : "timed",
+        event.displayTime ?? "",
+        event.location ?? "",
+      ].join("|");
+
+      return (
+        events.findIndex((candidateEvent) =>
+          [
+            candidateEvent.title,
+            candidateEvent.start,
+            candidateEvent.end,
+            candidateEvent.allDay ? "all-day" : "timed",
+            candidateEvent.displayTime ?? "",
+            candidateEvent.location ?? "",
+          ].join("|") === eventKey,
+        ) === index
+      );
+    })
     .sort(compareCalendarEvents);
 }
```

## Output
June 2026 API smoke test:

```txt
SUMMARY=12 events found for June 2026
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
BAD_6PM=false
```

June 2026 browser UI verification:

```txt
DEFAULT_LINK_VISIBLE
UI_SUMMARY_12=FOUND
FOUND 7/6 10am 區域主日(尖東富豪)
FOUND 12/6 奉獻日
FOUND 12/6 8pm 九龍TG中心
FOUND 14/6 10:30am 九龍區域及屯門主日崇拜(荃灣悅來酒店)
FOUND 19-20/6 （BT）
FOUND 21/6 10am 區域主日(盛德)
FOUND 26/6 8pm 九龍TG中心
FOUND 28/6 10am 區域主日(盛德)
UI_BAD_6PM=false
UI_NORMALIZED_COUNT=12
```

Raw June diagnostics summary:

```txt
區域主日(尖東富豪): recurrence override from 區域主日(盛德), raw start 2026-06-07T02:00:00.000Z, tz Asia/Hong_Kong, displayTime 10am, included.
奉獻日: monthly all-day RRULE occurrence raw start 2026-06-11T16:00:00.000Z, dateOnly true, normalized startDate 2026-06-12, included.
九龍TG中心 on 12/6: monthly timed RRULE occurrence raw start 2026-06-12T12:00:00.000Z, tz Asia/Hong_Kong, displayTime 8pm, included.
九龍區域及屯門主日崇拜(荃灣悅來酒店): recurrence override raw start 2026-06-14T02:30:00.000Z, tz Asia/Hong_Kong, displayTime 10:30am, included once after de-duplication.
（BT）: monthly all-day RRULE occurrence raw start 2026-06-18T16:00:00.000Z, normalized startDate 2026-06-19, normalized endDate 2026-06-20, dateLabel 19-20/6, included.
區域主日(盛德) on 21/6 and 28/6: weekly RRULE occurrences raw start 2026-06-21T02:00:00.000Z and 2026-06-28T02:00:00.000Z, displayTime 10am, included.
九龍TG中心 on 26/6: monthly timed RRULE occurrence raw start 2026-06-26T12:00:00.000Z, tz Asia/Hong_Kong, displayTime 8pm, included.
Excluded duplicate recurrence override keys: duplicate 7/6 and 14/6 override rows from node-ical date-key plus ISO-key recurrence entries.
```

## Review Status
READY_FOR_PM_REVIEW
