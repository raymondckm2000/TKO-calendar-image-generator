# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Updated formatted output so every Google Calendar event is emitted as its own independent line while keeping RRULE recurring event expansion.

## Files Changed
- lib/calendar/parser.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1313.md

## What Changed
- Removed same-day all-day/timed merge helpers from final formatted output.
- Stopped combining `allDayEvent + timedEvent` into one normalized event.
- Kept RRULE expansion so recurring timed service events appear in the selected month.
- Changed timed event display order to `dateLabel + timeLabel + title + location`.
- Kept all-day event display as `dateLabel + title`.
- Kept summary count based on final independent normalized event lines.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- Local API smoke test for `GET /api/extract?month=5&year=2026` - passed
- Confirmed recurring Sunday service lines appear independently.
- Confirmed no same-day event is merged into one line.
- Confirmed summary reports `23 events found for May 2026`.

## Risks
- Calendar timezone handling still follows the existing `Asia/Hong_Kong` constant.
- RRULE expansion depends on `node-ical` exposing `rrule.between`; fallback parser still does not expand recurring rules.

## Diff
```diff
diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
index d19eb5c..611fae0 100644
--- a/lib/calendar/parser.ts
+++ b/lib/calendar/parser.ts
@@ -683,111 +683,6 @@ function shouldShowLocation(title: string, location: string): boolean {
   return Boolean(location) && !title.includes(location);
 }
 
-function appendEventDetail(
-  baseText: string,
-  detail: string,
-): string {
-  if (!detail || baseText.includes(detail)) {
-    return baseText;
-  }
-
-  return baseText ? `${baseText} ${detail}` : detail;
-}
-
-function combineFormattedEvents(
-  allDayEvent: FormattedCalendarEvent,
-  timedEvent: FormattedCalendarEvent,
-): FormattedCalendarEvent {
-  const timedDetail = [timedEvent.timeLabel, timedEvent.title, timedEvent.location]
-    .filter(Boolean)
-    .reduce(appendEventDetail, "");
-  const displayText = [allDayEvent.dateLabel, allDayEvent.title, timedDetail]
-    .filter(Boolean)
-    .join(" ");
-
-  return {
-    ...allDayEvent,
-    displayText,
-    timeLabel: timedEvent.timeLabel,
-    location: timedEvent.location,
-  };
-}
-
-function isSingleDayEvent(event: FormattedCalendarEvent): boolean {
-  return !event.multiDay && event.startDate === event.endDate;
-}
-
-function isSermonTitle(title: string): boolean {
-  return title.startsWith("講道：");
-}
-
-function isServiceTitle(title: string): boolean {
-  return title.includes("主日") || title.includes("崇拜");
-}
-
-function canUseTimedDetailForTitle(title: string): boolean {
-  return /班|聚會|約會|課堂|團契/.test(title);
-}
-
-function mergeRelatedSameDayEvents(
-  events: FormattedCalendarEvent[],
-): FormattedCalendarEvent[] {
-  const mergedEvents: FormattedCalendarEvent[] = [];
-  const eventsByDate = new Map<string, FormattedCalendarEvent[]>();
-
-  for (const event of events) {
-    const dayEvents = eventsByDate.get(event.startDate) ?? [];
-    dayEvents.push(event);
-    eventsByDate.set(event.startDate, dayEvents);
-  }
-
-  for (const dayEvents of eventsByDate.values()) {
-    const usedEvents = new Set<FormattedCalendarEvent>();
-    const allDayEvents = dayEvents.filter(
-      (event) => event.allDay && isSingleDayEvent(event),
-    );
-    const timedEvents = dayEvents.filter(
-      (event) => !event.allDay && isSingleDayEvent(event),
-    );
-
-    if (allDayEvents.length === 1 && timedEvents.length === 1) {
-      mergedEvents.push(combineFormattedEvents(allDayEvents[0], timedEvents[0]));
-      usedEvents.add(allDayEvents[0]);
-      usedEvents.add(timedEvents[0]);
-    } else if (allDayEvents.length > 1 && timedEvents.length === 1) {
-      const matchingAllDayEvents = allDayEvents.filter((event) =>
-        canUseTimedDetailForTitle(event.title),
-      );
-
-      if (matchingAllDayEvents.length === 1) {
-        mergedEvents.push(combineFormattedEvents(matchingAllDayEvents[0], timedEvents[0]));
-        usedEvents.add(matchingAllDayEvents[0]);
-        usedEvents.add(timedEvents[0]);
-      }
-    } else {
-      for (const allDayEvent of allDayEvents.filter((event) => isSermonTitle(event.title))) {
-        const matchingTimedEvents = timedEvents.filter(
-          (event) => !usedEvents.has(event) && isServiceTitle(event.title),
-        );
-
-        if (matchingTimedEvents.length === 1) {
-          mergedEvents.push(combineFormattedEvents(allDayEvent, matchingTimedEvents[0]));
-          usedEvents.add(allDayEvent);
-          usedEvents.add(matchingTimedEvents[0]);
-        }
-      }
-    }
-
-    for (const event of dayEvents) {
-      if (!usedEvents.has(event)) {
-        mergedEvents.push(event);
-      }
-    }
-  }
-
-  return mergedEvents;
-}
-
 function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent {
   const start = new Date(event.start) as DateWithTimeZone;
   const end = new Date(event.end) as DateWithTimeZone;
@@ -805,7 +700,7 @@ function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent
   const displayLocation = shouldShowLocation(title, location) ? location : "";
   const timeLabel = event.displayTime ?? "";
   const dateLabel = formatDateLabel(startDate, endDate);
-  const displayText = [dateLabel, title, timeLabel, displayLocation]
+  const displayText = [dateLabel, timeLabel, title, displayLocation]
     .filter(Boolean)
     .join(" ");
 
@@ -831,9 +726,7 @@ export function formatCalendarEvents(
   normalizedEvents: FormattedCalendarEvent[];
   summary: string;
 } {
-  const normalizedEvents = mergeRelatedSameDayEvents(
-    events.map(toFormattedCalendarEvent),
-  );
+  const normalizedEvents = events.map(toFormattedCalendarEvent);
 
   return {
     formattedText: normalizedEvents.map((event) => event.displayText).join("\n"),
```

## Output
May 2026 local API smoke test returned:

```txt
SUMMARY=23 events found for May 2026
3/5 講道：Antony Wong
3/5 10am 區域主日(盛德)
8/5 奉獻日
8/5 HC 屬靈課堂《認識神》（一）
8/5 8pm 九龍TG中心
10/5 講道：Rex Chan
10/5 10am 區域主日(盛德)
14/5 婚姻班-15年以上 (8pm TG Centre)
14/5 菁英班 (8pm HMS Centre)
14-15/5 Kln X TM 區域家庭團契
15-16/5 （BT）
15/5 婚姻班-15年以下 (8pm HMS Centre)
15/5 P5-S6父母班 (8pm TG Centre)
17/5 講道：Brian Tang
17/5 10am 區域主日(盛德)
24/5 講道：明綱 (UC)
24/5 10am 區域主日(盛德)
29/5 區域家庭聚會
29/5 8pm 官基家禮堂 (Kids : Rm 202)
30/5 我和爸媽有個約會2026 (Kln+TM)
30/5 11:30am 九龍TG中心
31/5 講道：Jeffrey Chan
31/5 10am 區域主日(盛德)
```

Smoke test checks:

```txt
FOUND 3/5 講道：Antony Wong
FOUND 3/5 10am 區域主日(盛德)
FOUND 30/5 我和爸媽有個約會2026 (Kln+TM)
FOUND 30/5 11:30am 九龍TG中心
FOUND 31/5 講道：Jeffrey Chan
FOUND 31/5 10am 區域主日(盛德)
MERGED_30=false
COUNT=23
```

## Review Status
READY_FOR_PM_REVIEW
