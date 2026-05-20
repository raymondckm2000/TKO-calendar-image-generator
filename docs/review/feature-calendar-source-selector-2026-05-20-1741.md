# Task Review

## Branch
feature/calendar-source-selector

## Summary
Added a Calendar source selector to the calendar fetch UI so users can choose TKO 月曆, 生日月曆, or 自訂 Google Calendar without repeatedly pasting preset calendar URLs.

## Files Changed
- components/calendar/CalendarEventFetcher.tsx
- lib/calendar/constants.ts
- lib/calendar/sources.ts
- lib/i18n/en.ts

## What Changed
- Added centralized calendar source config in lib/calendar/sources.ts.
- Added i18n labels for Calendar source and the three source options.
- Reordered the form to show Calendar source, Year, Month, then Fetch events.
- Hid the Google Calendar link input for preset sources and showed it only for 自訂 Google Calendar.
- Persisted calendar source id, custom calendar link, year, and month in localStorage without storing formatted output or normalized JSON.
- Submitted the preset source URL or custom calendar link as the existing calendarLink field to POST /api/extract.

## Verification
- npm run lint: passed
- npm run build: passed
- git diff --check: passed
- Local production browser verification on http://127.0.0.1:3002: passed
- Vercel preview deployment: Ready
- Vercel preview URL: https://tko-calendar-image-generator-afmp06uec.vercel.app
- Implementation commit SHA: ab37bd6
- Branch pushed: origin/feature/calendar-source-selector
- TKO May 2026 API result: 23 events found for May 2026, including 3/5 講道：Antony Wong, 3/5 10am 區域主日(盛德), 22-23/5 （BT）, 30/5 我和爸媽有個約會2026 (Kln+TM), and 30/5 11:30am 九龍TG中心.
- TKO June 2026 browser/API result: 12 events found for June 2026, including 7/6 10am 區域主日(尖東富豪), 12/6 奉獻日, 12/6 8pm 九龍TG中心, 14/6 10:30am 九龍區域及屯門主日崇拜(荃灣悅來酒店), 19-20/6 （BT）, and 26/6 8pm 九龍TG中心.
- Birthday May 2026 browser/API result: 8 events found for May 2026.
- Birthday source diagnostics: sourceStatus parsed by direct ICS fetch; rawEventCount 104; filteredEventCount 8.
- Source dropdown works for TKO 月曆, 生日月曆, and 自訂 Google Calendar.
- Custom link input appears only for 自訂 Google Calendar and is hidden again for TKO 月曆 / 生日月曆.
- Reload restoration confirmed for selected source, year, month, and saved custom calendar link.

## Risks
- localStorage defaults are not written until the user changes a field; the visible default still correctly resolves to TKO 月曆 when no saved source exists.

## Diff
```diff
+export const CALENDAR_SOURCE_IDS = {
+  tko: "tko",
+  birthdays: "birthdays",
+  custom: "custom",
+} as const;
+
+export const CALENDAR_SOURCES = [
+  { id: CALENDAR_SOURCE_IDS.tko, url: "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics" },
+  { id: CALENDAR_SOURCE_IDS.birthdays, url: "https://calendar.google.com/calendar/ical/4ilipql7cldik4523hg1hsv93o%40group.calendar.google.com/public/basic.ics" },
+  { id: CALENDAR_SOURCE_IDS.custom, url: "" },
+] as const;
```

## Output
Calendar fetch UI now defaults to TKO 月曆, supports selecting 生日月曆, shows the custom calendar link field only for 自訂 Google Calendar, and preserves source/year/month/custom link choices across reloads.

## Review Status
READY_FOR_PM_REVIEW
