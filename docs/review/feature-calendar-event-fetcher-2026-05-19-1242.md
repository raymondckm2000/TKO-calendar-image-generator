# Task Review

## Branch
feature/calendar-event-fetcher

## Summary
Fixed event detail recovery for Google Calendar days where an all-day title and a timed detail/service event belong together.

## Files Changed
- lib/calendar/parser.ts
- docs/review/feature-calendar-event-fetcher-2026-05-19-1242.md

## What Changed
- Expanded recurring `RRULE` events within the selected month so weekly service events such as `區域主日(盛德)` appear in May 2026 output.
- Preserved Google Calendar all-day exclusive `DTEND` handling while correcting date-only display math for `node-ical` Google all-day dates.
- Added conservative formatter merging for related same-day all-day and timed events.
- Added special safe merge handling for sermon titles beginning with `講道：` and matching same-day service events.
- Added narrow handling for one timed venue/detail event with one class/course-like all-day event when multiple all-day events exist on the same date.
- Kept standalone timed and all-day events when no safe relationship is found.

## Verification
- `npm run lint` - passed
- `npm run build` - passed
- Local API smoke test: `GET /api/extract?month=5&year=2026` returned the expected combined May 2026 formatted lines.
- `git diff --check` - passed

## Risks
- Calendar timezone handling still follows the existing `Asia/Hong_Kong` constant.
- Recurring event expansion uses the `node-ical` `rrule.between` object when present; fallback ICS parsing still handles non-recurring event blocks only.
- Merge rules are intentionally conservative and may leave ambiguous same-day event combinations unmerged rather than risk combining unrelated events.

## Diff
```diff
diff --git a/lib/calendar/parser.ts b/lib/calendar/parser.ts
index fffafe0..d19eb5c 100644
--- a/lib/calendar/parser.ts
+++ b/lib/calendar/parser.ts
@@ -24,6 +24,13 @@ type FallbackEvent = {
   allDay: boolean;
 };
 
+type RecurringVEvent = VEvent & {
+  exdate?: Record<string, Date>;
+  rrule: {
+    between: (start: Date, end: Date, includeLimits?: boolean) => Date[];
+  };
+};
+
 const MAX_ERROR_BODY_LENGTH = 500;
 const ICS_CONTENT_TYPES = [
   "text/calendar",
@@ -156,7 +163,7 @@ function isVEvent(component: unknown): component is VEvent {
 }
 
 function getDateParts(date: DateWithTimeZone): DateParts {
-  if (date.dateOnly || !date.tz) {
+  if (!date.dateOnly && !date.tz) {
     return {
       day: date.getUTCDate(),
       month: date.getUTCMonth() + 1,
@@ -168,7 +175,7 @@ function getDateParts(date: DateWithTimeZone): DateParts {
     const parts = new Intl.DateTimeFormat("en-US", {
       day: "numeric",
       month: "numeric",
-      timeZone: date.tz,
+      timeZone: date.tz || CALENDAR_TIME_ZONE,
       year: "numeric",
     }).formatToParts(date);
 
@@ -193,15 +200,17 @@ function getDateParts(date: DateWithTimeZone): DateParts {
   };
 }
 
-function formatDateKey(date: Date): string {
-  if ("dateOnly" in date && date.dateOnly) {
-    return [
-      date.getUTCFullYear(),
-      String(date.getUTCMonth() + 1).padStart(2, "0"),
-      String(date.getUTCDate()).padStart(2, "0"),
-    ].join("-");
-  }
+function isRecurringVEvent(event: VEvent): event is RecurringVEvent {
+  return Boolean(
+    "rrule" in event &&
+      event.rrule &&
+      typeof event.rrule === "object" &&
+      "between" in event.rrule &&
+      typeof event.rrule.between === "function",
+  );
+}
 
+function formatDateKey(date: Date): string {
   const parts = new Intl.DateTimeFormat("en-CA", {
     day: "2-digit",
     month: "2-digit",
@@ -257,10 +266,9 @@ function isMultiDayEvent(
 }
 
 function subtractOneUtcDay(date: DateWithTimeZone): DateWithTimeZone {
-  const adjustedDate = new Date(
-    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1),
-  ) as DateWithTimeZone;
+  const adjustedDate = new Date(date.getTime() - 24 * 60 * 60 * 1000) as DateWithTimeZone;
   adjustedDate.dateOnly = date.dateOnly;
+  adjustedDate.tz = date.tz;
   return adjustedDate;
 }
 
@@ -344,6 +352,75 @@ function isEventInMonth(event: VEvent, month: number, year: number): boolean {
   );
 }
 
+function createMonthSearchWindow(month: number, year: number): {
+  end: Date;
+  start: Date;
+} {
+  return {
+    start: new Date(Date.UTC(year, month - 1, -1)),
+    end: new Date(Date.UTC(year, month, 2)),
+  };
+}
+
+function isExcludedOccurrence(event: RecurringVEvent, occurrence: Date): boolean {
+  if (!event.exdate) {
+    return false;
+  }
+
+  return Object.values(event.exdate).some(
+    (excludedDate) =>
+      excludedDate instanceof Date &&
+      excludedDate.getTime() === occurrence.getTime(),
+  );
+}
+
+function createRecurringOccurrence(
+  event: RecurringVEvent,
+  occurrence: Date,
+): VEvent | null {
+  if (!isValidDate(event.start)) {
+    return null;
+  }
+
+  const end = isValidDate(event.end) ? event.end : event.start;
+  const duration = end.getTime() - event.start.getTime();
+  const occurrenceStart = new Date(occurrence.getTime()) as DateWithTimeZone;
+  const occurrenceEnd = new Date(occurrence.getTime() + duration) as DateWithTimeZone;
+
+  occurrenceStart.tz = event.start.tz;
+  occurrenceEnd.tz = end.tz;
+
+  return {
+    ...event,
+    start: occurrenceStart,
+    end: occurrenceEnd,
+  };
+}
+
+function normalizeRecurringEvents(
+  event: VEvent,
+  fallbackId: string,
+  month: number,
+  year: number,
+): CalendarEvent[] {
+  if (!isRecurringVEvent(event) || !isValidDate(event.start)) {
+    return [];
+  }
+
+  const searchWindow = createMonthSearchWindow(month, year);
+
+  return event.rrule
+    .between(searchWindow.start, searchWindow.end, true)
+    .filter((occurrence) => !isExcludedOccurrence(event, occurrence))
+    .map((occurrence) => createRecurringOccurrence(event, occurrence))
+    .filter((occurrence): occurrence is VEvent => occurrence !== null)
+    .filter((occurrence) => isEventInMonth(occurrence, month, year))
+    .map((occurrence, index) =>
+      normalizeEvent(occurrence, `${fallbackId}-${occurrence.start.toISOString()}-${index}`),
+    )
+    .filter((occurrence): occurrence is CalendarEvent => occurrence !== null);
+}
+
 function normalizeEvent(event: VEvent, fallbackId: string): CalendarEvent | null {
   if (!isValidDate(event.start)) {
     return null;
@@ -553,8 +630,17 @@ function normalizeParsedCalendar(
 ): CalendarEvent[] {
   return Object.entries(calendar)
     .filter((entry): entry is [string, VEvent] => isVEvent(entry[1]))
-    .filter(([, event]) => isEventInMonth(event, month, year))
-    .map(([id, event]) => normalizeEvent(event, id))
+    .flatMap(([id, event]) => {
+      if (isRecurringVEvent(event)) {
+        return normalizeRecurringEvents(event, id, month, year);
+      }
+
+      if (!isEventInMonth(event, month, year)) {
+        return [];
+      }
+
+      return [normalizeEvent(event, id)];
+    })
     .filter((event): event is CalendarEvent => event !== null)
     .sort(compareCalendarEvents);
 }
@@ -597,6 +683,111 @@ function shouldShowLocation(title: string, location: string): boolean {
   return Boolean(location) && !title.includes(location);
 }
 
+function appendEventDetail(
+  baseText: string,
+  detail: string,
+): string {
+  if (!detail || baseText.includes(detail)) {
+    return baseText;
+  }
+
+  return baseText ? `${baseText} ${detail}` : detail;
+}
+
+function combineFormattedEvents(
+  allDayEvent: FormattedCalendarEvent,
+  timedEvent: FormattedCalendarEvent,
+): FormattedCalendarEvent {
+  const timedDetail = [timedEvent.timeLabel, timedEvent.title, timedEvent.location]
+    .filter(Boolean)
+    .reduce(appendEventDetail, "");
+  const displayText = [allDayEvent.dateLabel, allDayEvent.title, timedDetail]
+    .filter(Boolean)
+    .join(" ");
+
+  return {
+    ...allDayEvent,
+    displayText,
+    timeLabel: timedEvent.timeLabel,
+    location: timedEvent.location,
+  };
+}
+
+function isSingleDayEvent(event: FormattedCalendarEvent): boolean {
+  return !event.multiDay && event.startDate === event.endDate;
+}
+
+function isSermonTitle(title: string): boolean {
+  return title.startsWith("講道：");
+}
+
+function isServiceTitle(title: string): boolean {
+  return title.includes("主日") || title.includes("崇拜");
+}
+
+function canUseTimedDetailForTitle(title: string): boolean {
+  return /班|聚會|約會|課堂|團契/.test(title);
+}
+
+function mergeRelatedSameDayEvents(
+  events: FormattedCalendarEvent[],
+): FormattedCalendarEvent[] {
+  const mergedEvents: FormattedCalendarEvent[] = [];
+  const eventsByDate = new Map<string, FormattedCalendarEvent[]>();
+
+  for (const event of events) {
+    const dayEvents = eventsByDate.get(event.startDate) ?? [];
+    dayEvents.push(event);
+    eventsByDate.set(event.startDate, dayEvents);
+  }
+
+  for (const dayEvents of eventsByDate.values()) {
+    const usedEvents = new Set<FormattedCalendarEvent>();
+    const allDayEvents = dayEvents.filter(
+      (event) => event.allDay && isSingleDayEvent(event),
+    );
+    const timedEvents = dayEvents.filter(
+      (event) => !event.allDay && isSingleDayEvent(event),
+    );
+
+    if (allDayEvents.length === 1 && timedEvents.length === 1) {
+      mergedEvents.push(combineFormattedEvents(allDayEvents[0], timedEvents[0]));
+      usedEvents.add(allDayEvents[0]);
+      usedEvents.add(timedEvents[0]);
+    } else if (allDayEvents.length > 1 && timedEvents.length === 1) {
+      const matchingAllDayEvents = allDayEvents.filter((event) =>
+        canUseTimedDetailForTitle(event.title),
+      );
+
+      if (matchingAllDayEvents.length === 1) {
+        mergedEvents.push(combineFormattedEvents(matchingAllDayEvents[0], timedEvents[0]));
+        usedEvents.add(matchingAllDayEvents[0]);
+        usedEvents.add(timedEvents[0]);
+      }
+    } else {
+      for (const allDayEvent of allDayEvents.filter((event) => isSermonTitle(event.title))) {
+        const matchingTimedEvents = timedEvents.filter(
+          (event) => !usedEvents.has(event) && isServiceTitle(event.title),
+        );
+
+        if (matchingTimedEvents.length === 1) {
+          mergedEvents.push(combineFormattedEvents(allDayEvent, matchingTimedEvents[0]));
+          usedEvents.add(allDayEvent);
+          usedEvents.add(matchingTimedEvents[0]);
+        }
+      }
+    }
+
+    for (const event of dayEvents) {
+      if (!usedEvents.has(event)) {
+        mergedEvents.push(event);
+      }
+    }
+  }
+
+  return mergedEvents;
+}
+
 function toFormattedCalendarEvent(event: CalendarEvent): FormattedCalendarEvent {
   const start = new Date(event.start) as DateWithTimeZone;
   const end = new Date(event.end) as DateWithTimeZone;
@@ -640,7 +831,9 @@ export function formatCalendarEvents(
   normalizedEvents: FormattedCalendarEvent[];
   summary: string;
 } {
-  const normalizedEvents = events.map(toFormattedCalendarEvent);
+  const normalizedEvents = mergeRelatedSameDayEvents(
+    events.map(toFormattedCalendarEvent),
+  );
 
   return {
     formattedText: normalizedEvents.map((event) => event.displayText).join("\n"),
```

## Output
Local May 2026 API output included:

```txt
3/5 講道：Antony Wong 10am 區域主日(盛德)
8/5 HC 屬靈課堂《認識神》（一） 8pm 九龍TG中心
10/5 講道：Rex Chan 10am 區域主日(盛德)
17/5 講道：Brian Tang 10am 區域主日(盛德)
24/5 講道：明綱 (UC) 10am 區域主日(盛德)
29/5 區域家庭聚會 8pm 官基家禮堂 (Kids : Rm 202)
30/5 我和爸媽有個約會2026 (Kln+TM) 11:30am 九龍TG中心
31/5 講道：Jeffrey Chan 10am 區域主日(盛德)
```

Raw parsed event verification notes:

```txt
title=講道：Antony Wong | start=2026-05-03 | end=2026-05-03 | allDay=true | displayTime= | location=
title=區域主日(盛德) | start=2026-05-03T02:00:00.000Z | end=2026-05-03T04:00:00.000Z | allDay=false | displayTime=10am | location=
title=HC 屬靈課堂《認識神》（一） | start=2026-05-08 | end=2026-05-08 | allDay=true | displayTime= | location=
title=九龍TG中心 | start=2026-05-08T12:00:00.000Z | end=2026-05-08T14:00:00.000Z | allDay=false | displayTime=8pm | location=
title=區域家庭聚會 | start=2026-05-29 | end=2026-05-29 | allDay=true | displayTime= | location=
title=官基家禮堂 (Kids : Rm 202) | start=2026-05-29T12:00:00.000Z | end=2026-05-29T14:00:00.000Z | allDay=false | displayTime=8pm | location=
title=我和爸媽有個約會2026 (Kln+TM) | start=2026-05-30 | end=2026-05-30 | allDay=true | displayTime= | location=
title=九龍TG中心 | start=2026-05-30T03:30:00.000Z | end=2026-05-30T06:30:00.000Z | allDay=false | displayTime=11:30am | location=
```

The public ICS feed contains the Sunday service as a recurring `RRULE` event (`區域主日(盛德)`, weekly Sunday 10am). After expansion, the May 2026 occurrences are available for same-day merge with the sermon all-day events.

## Review Status
READY_FOR_PM_REVIEW
