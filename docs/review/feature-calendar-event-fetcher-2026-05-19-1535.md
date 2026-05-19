# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Fixed recurrence override handling for the `(BT)` all-day multi-day event and updated sorting so multi-day all-day events appear before same-day all-day events on the same start date.

## Files Changed
- lib/calendar/parser.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1535.md

## What Changed
- Added recurrence override support for `node-ical` `recurrences` on recurring events.
- Skips a base RRULE occurrence when Google Calendar provides a matching `RECURRENCE-ID` override.
- Includes the recurrence override event when its actual date overlaps the selected month.
- Kept independent-line output; no same-day merge logic was reintroduced.
- Kept RRULE expansion for recurring timed Sunday service events.
- Updated same-date sorting so multi-day all-day events sort before single-day all-day events.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- `git diff --check` - passed
- Local API smoke test for `GET /api/extract?month=5&year=2026` - passed
- Confirmed `(BT)` outputs as `22-23/5 （BT）`.
- Confirmed incorrect `15-16/5 （BT）` is absent.
- Confirmed `14-15/5 Kln X TM 區域家庭團契` sorts before the `14/5` single-day all-day items.
- Confirmed Sunday service lines remain independent recurring timed events.

## Risks
- Calendar timezone handling still follows the existing `Asia/Hong_Kong` constant.
- RRULE expansion and override handling depend on `node-ical` exposing `rrule`, `recurrences`, and `exdate` fields.
- Fallback ICS parsing still does not expand RRULE recurrence rules.

## Diff
```diff
diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
index d19eb5c..544c9f0 100644
--- a/lib/calendar/parser.ts
+++ b/lib/calendar/parser.ts
@@ -26,6 +26,7 @@ type FallbackEvent = {
 
 type RecurringVEvent = VEvent & {
   exdate?: Record<string, Date>;
+  recurrences?: Record<string, VEvent>;
   rrule: {
     between: (start: Date, end: Date, includeLimits?: boolean) => Date[];
   };
@@ -327,6 +328,14 @@ function compareCalendarEvents(
     return firstEvent.allDay ? -1 : 1;
   }
 
+  if (
+    firstEvent.allDay &&
+    secondEvent.allDay &&
+    Boolean(firstEvent.multiDay) !== Boolean(secondEvent.multiDay)
+  ) {
+    return firstEvent.multiDay ? -1 : 1;
+  }
+
   const firstStartTime = Date.parse(firstEvent.start);
   const secondStartTime = Date.parse(secondEvent.start);
 
@@ -374,6 +383,35 @@ function isExcludedOccurrence(event: RecurringVEvent, occurrence: Date): boolean
   );
 }
 
+function formatUtcDateKey(date: Date): string {
+  return [
+    date.getUTCFullYear(),
+    String(date.getUTCMonth() + 1).padStart(2, "0"),
+    String(date.getUTCDate()).padStart(2, "0"),
+  ].join("-");
+}
+
+function isOverriddenOccurrence(event: RecurringVEvent, occurrence: Date): boolean {
+  if (!event.recurrences) {
+    return false;
+  }
+
+  const occurrenceTime = occurrence.getTime();
+  const occurrenceUtcKey = formatUtcDateKey(occurrence);
+  const occurrenceDisplayKey = formatDateKey(occurrence);
+
+  return Object.keys(event.recurrences).some((recurrenceKey) => {
+    const recurrenceDate = new Date(recurrenceKey);
+
+    return (
+      recurrenceKey === occurrenceUtcKey ||
+      recurrenceKey === occurrenceDisplayKey ||
+      (!Number.isNaN(recurrenceDate.getTime()) &&
+        recurrenceDate.getTime() === occurrenceTime)
+    );
+  });
+}
+
 function createRecurringOccurrence(
   event: RecurringVEvent,
   occurrence: Date,
@@ -408,10 +446,10 @@ function normalizeRecurringEvents(
   }
 
   const searchWindow = createMonthSearchWindow(month, year);
-
-  return event.rrule
+  const recurringEvents = event.rrule
     .between(searchWindow.start, searchWindow.end, true)
     .filter((occurrence) => !isExcludedOccurrence(event, occurrence))
+    .filter((occurrence) => !isOverriddenOccurrence(event, occurrence))
     .map((occurrence) => createRecurringOccurrence(event, occurrence))
     .filter((occurrence): occurrence is VEvent => occurrence !== null)
     .filter((occurrence) => isEventInMonth(occurrence, month, year))
@@ -419,6 +457,15 @@ function normalizeRecurringEvents(
       normalizeEvent(occurrence, `${fallbackId}-${occurrence.start.toISOString()}-${index}`),
     )
     .filter((occurrence): occurrence is CalendarEvent => occurrence !== null);
+  const recurrenceOverrides = Object.entries(event.recurrences ?? {})
+    .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
+    .filter(([, recurrence]) => isEventInMonth(recurrence, month, year))
+    .map(([recurrenceId, recurrence]) =>
+      normalizeEvent(recurrence, `${fallbackId}-${recurrenceId}`),
+    )
+    .filter((recurrence): recurrence is CalendarEvent => recurrence !== null);
+
+  return [...recurringEvents, ...recurrenceOverrides];
 }
 
 function normalizeEvent(event: VEvent, fallbackId: string): CalendarEvent | null {
@@ -683,111 +730,6 @@ function shouldShowLocation(title: string, location: string): boolean {
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
@@ -805,7 +747,7 @@ function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent
   const displayLocation = shouldShowLocation(title, location) ? location : "";
   const timeLabel = event.displayTime ?? "";
   const dateLabel = formatDateLabel(startDate, endDate);
-  const displayText = [dateLabel, title, timeLabel, displayLocation]
+  const displayText = [dateLabel, timeLabel, title, displayLocation]
     .filter(Boolean)
     .join(" ");
 
@@ -831,9 +773,7 @@ export function formatCalendarEvents(
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
Raw `(BT)` recurrence diagnosis:

```txt
Base recurring event:
title=（BT）
raw start=2025-03-20T16:00:00.000Z
raw end=2025-03-22T16:00:00.000Z
allDay=true
dateOnly=true
tz=undefined
RRULE=FREQ=MONTHLY;BYDAY=3FR
May 2026 base recurrence key=2026-05-15

Google Calendar override:
RECURRENCE-ID;VALUE=DATE:20260515
DTSTART;VALUE=DATE:20260522
DTEND;VALUE=DATE:20260524
normalized startDate=2026-05-22
normalized endDate=2026-05-23
dateLabel=22-23/5
```

May 2026 smoke test output included:

```txt
SUMMARY=23 events found for May 2026
14-15/5 Kln X TM 區域家庭團契
14/5 婚姻班-15年以上 (8pm TG Centre)
14/5 菁英班 (8pm HMS Centre)
22-23/5 （BT）
24/5 10am 區域主日(盛德)
31/5 10am 區域主日(盛德)
```

Smoke test checks:

```txt
BT_22_23=true
BT_15_16=false
Kln_before_marriage=true
Sunday_3=true
Sunday_31=true
```

## Review Status
READY_FOR_PM_REVIEW
