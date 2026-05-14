# Task Review

## Summary
Improved event detail normalization so parsed calendar events can carry richer metadata for the renderer and future PNG export.

## Event Model Changes
Updated `CalendarEvent` with:

- `description?: string`
- `location?: string`
- `multiDay?: boolean`
- `displayTime?: string`

`description` and `location` already existed in the model but were not rendered. `displayTime` and `multiDay` are now normalized by the parser layer instead of being derived inside the UI.

## ICS Fields Added
The parser now consistently normalizes these iCalendar fields:

- `SUMMARY` -> `title`
- `DESCRIPTION` -> `description`
- `LOCATION` -> `location`
- `DTSTART` -> `start`, `displayTime`
- `DTEND` -> `end`, `multiDay`

Previously missing from rendering quality:

- Google Calendar `DESCRIPTION`
- Google Calendar `LOCATION`
- readable local display time
- multi-day span metadata

For the May 2026 default feed, the specific sermon all-day events do not include `DESCRIPTION` or `LOCATION` in the raw ICS, so those rows still only have a title. Timed events in the same month now expose `displayTime`.

## Rendering Changes
Updated `MonthlyCalendar` event rows:

- Line 1: event title
- Line 2: `displayTime + location` when both exist
- Fallback line 2: `displayTime`, `location`, or `description`

This improves rendering quality because the component can now show compact Google-style detail lines, for example:

```txt
九龍TG中心
11:30am
```

When a feed includes both time and location, it renders as:

```txt
title
10am location
```

## Verification
- `npm run lint` passed.
- `npm run build` passed.
- Local `GET /api/extract?month=5&year=2026` returned HTTP 200.
- Local API returned `success: true` and `count: 15`.
- Local API included timed event details:
  - `官基家禮堂 (Kids : Rm 202)` -> `displayTime: "8pm"`
  - `九龍TG中心` -> `displayTime: "11:30am"`
- Local API included multi-day metadata:
  - `Kln X TM 區域家庭團契` -> `multiDay: true`
- Local `GET /demo` returned HTTP 200.
- Demo HTML included `May 2026`, `8pm`, and `11:30am`.

## Risks
- `DESCRIPTION` and `LOCATION` can only be rendered when the ICS feed provides those fields.
- The May 2026 default feed has limited location/description detail for many all-day events.
- Multi-day detection treats all-day `DTEND` as exclusive for display-date comparison, preventing one-day all-day events from being incorrectly marked multi-day.
- Recurring event expansion remains outside this task.

## Diff
```diff
 export interface CalendarEvent {
   id: string;
   title: string;
   description?: string;
   location?: string;
   start: string;
   end: string;
   allDay: boolean;
+  multiDay?: boolean;
+  displayTime?: string;
 }

+ const displayTime = formatDisplayTime(event.start, allDay);
+ const multiDay = isMultiDayEvent(event.start, end, allDay);
+
 return {
   id: event.uid || fallbackId,
   title: normalizeText(event.summary) || "Untitled event",
   description,
   location,
   start: event.start.toISOString(),
   end: end.toISOString(),
   allDay,
+  ...(multiDay ? { multiDay } : {}),
+  ...(displayTime ? { displayTime } : {}),
 };

- const eventTime = formatEventTime(event);
+ const eventDetail = getEventDetail(event);
```

## Output
API detail sample:

```json
{
  "success": true,
  "count": 15,
  "events": [
    {
      "title": "官基家禮堂 (Kids : Rm 202)",
      "displayTime": "8pm"
    },
    {
      "title": "九龍TG中心",
      "displayTime": "11:30am"
    },
    {
      "title": "Kln X TM 區域家庭團契",
      "multiDay": true
    }
  ]
}
```

## Review Status
READY_FOR_PM_REVIEW
