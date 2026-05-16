# Task Review

## Branch
fix/timed-event-normalization

## Summary
Fixed calendar normalization so all-day status is tied to ICS DATE metadata and single-day all-day events no longer appear as multi-day events.

## Root Cause
The parser already depended on node-ical date metadata for most events, but the multi-day calculation treated exclusive all-day `DTEND` by subtracting one millisecond. With date-only values serialized around UTC/local timezone boundaries, that could still format as the next calendar day and mark single-day all-day events as `multiDay`.

Google Calendar timed events are incorrectly normalized as all-day when a parser treats midnight-shaped `Date` objects or date comparisons as all-day evidence. RFC5545 does not define all-day events by clock time. It defines them by DATE values such as `DTSTART;VALUE=DATE:20260503`. Timed events use DATE-TIME values such as `DTSTART;TZID=Asia/Hong_Kong:20260503T100000`, even if the resulting JavaScript date happens to land near midnight in another timezone.

## ICS Findings
- RFC5545 all-day events use `VALUE=DATE`.
- DATE all-day `DTEND` is exclusive.
- DATE-TIME events may include `TZID`, UTC `Z`, or floating local time and must remain timed events.

## Timed Event Findings
A controlled API sample with:

```txt
DTSTART;TZID=Asia/Hong_Kong:20260503T100000
DTEND;TZID=Asia/Hong_Kong:20260503T120000
LOCATION:區域主日(盛德)
```

returned:

```json
{
  "allDay": false,
  "displayTime": "10am"
}
```

The live public ICS currently publishes `講道：Antony Wong` itself as:

```txt
DTSTART;VALUE=DATE:20260503
DTEND;VALUE=DATE:20260504
SUMMARY:講道：Antony Wong
```

So that specific live feed item is correctly normalized as all-day based on its current ICS data.

## Exclusive DTEND Findings
`DTSTART;VALUE=DATE:20260503` plus `DTEND;VALUE=DATE:20260504` represents one visible day because `DTEND` is exclusive. The normalized result should be:

```json
{
  "allDay": true,
  "multiDay": false
}
```

## Fix Applied
- Added a named `isDateOnlyEvent` helper for node-ical events using `dateOnly` and `datetype` metadata.
- Changed all-day multi-day comparison to subtract one full day from exclusive `DTEND`.
- Added fallback ICS DATE detection that honors `VALUE=DATE`, excludes `VALUE=DATE-TIME`, and treats raw `YYYYMMDD` values as date-only fallback metadata.

## Files Changed
- `lib/calendar/parser.ts`

## Verification
- `cmd /c npm run lint` passed.
- `cmd /c npm run build` passed.
- `/api/extract?month=5&year=2026` returned HTTP 200.
- `/demo` returned HTTP 200.
- Browser check for `/demo` loaded `http://127.0.0.1:5184/demo` and found calendar content.
- Controlled DATE-TIME sample returned `allDay:false` and `displayTime:"10am"`.
- Controlled single-day `VALUE=DATE` sample returned `allDay:true` without `multiDay`.

## Risks
- The current public Google basic ICS feed does not include the expected `10am 區域主日(盛德)` detail on the `講道：Antony Wong` event; it publishes that event as all-day. This fix preserves RFC5545 semantics rather than overriding feed data in the renderer.

## Diff
```diff
+ const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
+
+ function isDateOnlyEvent(event: VEvent): boolean {
+   return event.start?.dateOnly === true || event.datetype === "date";
+ }
+
-      ? new Date(end.getTime() - 1) as DateWithTimeZone
+      ? (new Date(end.getTime() - ONE_DAY_IN_MS) as DateWithTimeZone)
+
+ function isDateOnlyIcsValue(value: string, params: string[]): boolean {
+   const normalizedParams = params.map((param) => param.toUpperCase());
+
+   if (normalizedParams.includes("VALUE=DATE-TIME")) {
+     return false;
+   }
+
+   return normalizedParams.includes("VALUE=DATE") || /^\d{8}$/.test(value);
+ }
```

## Output
Calendar API normalization now distinguishes DATE all-day events from DATE-TIME timed events and handles exclusive all-day `DTEND` correctly.

## Review Status
READY_FOR_PM_REVIEW
