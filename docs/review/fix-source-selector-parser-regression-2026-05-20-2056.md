# Task Review

## Branch
fix/source-selector-parser-regression

## Summary
Fixed the source selector integration so it runs on the corrected parser/API path instead of the stale Vercel recurrence output.

## Files Changed
- app/api/extract/route.ts
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/constants.ts
- lib/calendar/parser.ts
- lib/calendar/sources.ts
- lib/i18n/en.ts
- next.config.ts
- scripts/debug-june-calendar.mjs

## What Changed
- Reapplied source diagnostics on top of current main: sourceStatus, rawEventCount, and filteredEventCount.
- Reapplied the Calendar Source selector UI using centralized preset URLs.
- Restored the Vercel parser stabilization fix with fallback RRULE, EXDATE, and RECURRENCE-ID handling.
- Added YEARLY fallback RRULE support so birthday calendar recurring events work in Vercel.
- Kept custom calendar input visible only for 自訂 Google Calendar.
- Kept localStorage limited to source id, custom link, year, and month.

## Verification
- npm run lint: passed
- npm run build: passed
- git diff --check: passed
- Local production API verification on http://127.0.0.1:3005: passed
- Local production browser verification on http://127.0.0.1:3005: passed
- Vercel preview deployment: Ready
- Vercel preview URL: https://tko-calendar-image-generator-m6rhp9g6p.vercel.app
- Vercel preview is protected for anonymous browser sessions; exact preview verification was completed with authenticated `vercel curl` against the preview URL.
- Commit SHA: d525e23
- Branch pushed: origin/fix/source-selector-parser-regression

TKO June 2026 Vercel preview output:
```txt
12 events found for June 2026

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
Confirmed absent from Vercel preview output:
- 7/6 6pm
- 14/6 6pm
- 14/6 6:30pm

TKO May 2026 API result:
- sourceStatus: parsed
- rawEventCount: 2113
- filteredEventCount: 23
- summary: 23 events found for May 2026

Birthday May 2026 Vercel preview/API result:
- sourceStatus: parsed
- rawEventCount: 104
- filteredEventCount: 8
- summary: 8 events found for May 2026

Birthday June 2026 Vercel preview/API result:
- sourceStatus: parsed
- rawEventCount: 104
- filteredEventCount: 5
- summary: 5 events found for June 2026
- output: 2/6 Birthday of Linda !; 5/6 ~Corina's BD~; 10/6 Alex / Antony Birthdays !; 14/6 阿聯生日！; 20/6 Raymond 志華の生日 !

Source selector behavior:
- Preview HTML contains Calendar source dropdown with TKO 月曆, 生日月曆, and 自訂 Google Calendar.
- Local production browser confirmed custom link input appears for 自訂 Google Calendar.
- Local production browser confirmed custom link input hides again after switching back to a preset source.

## Risks
- Vercel preview is deployment-protected, so direct anonymous browser automation reaches an authentication page. Verification used authenticated Vercel preview API/HTML access plus local production browser interaction.
- Fallback RRULE support now includes YEARLY for birthday-style recurring events; unusual yearly rules beyond BYMONTH/BYMONTHDAY may need future expansion.

## Diff
```diff
+  if (rrule.FREQ === "YEARLY") {
+    const monthMatches = rrule.BYMONTH
+      ? rrule.BYMONTH.split(",").includes(String(parts.month))
+      : parts.month === startParts.month;
+    const dayMatches = rrule.BYMONTHDAY
+      ? rrule.BYMONTHDAY.split(",").includes(String(parts.day))
+      : parts.day === startParts.day;
+
+    return monthMatches && dayMatches;
+  }
```

## Output
Calendar Source selector now works with the corrected parser/API path on the Vercel preview. TKO June 2026 returns the expected 12 events with correct 10am, 10:30am, and 8pm times, and the birthday calendar returns valid parsed results for May and June 2026.

## Review Status
READY_FOR_PM_REVIEW
