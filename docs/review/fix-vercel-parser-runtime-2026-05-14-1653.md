# Task Review

## Summary
Updated the calendar parser runtime path for serverless stability. The parser now fetches ICS text with native `fetch`, validates the HTTP and ICS response, then parses the text. The API now returns safe runtime debug details during the MVP phase.

## Root Cause
The likely production failure was caused by relying on `node-ical`'s `ical.async.fromURL()` plus dynamic server-side module loading inside Vercel's serverless bundle.

Two concrete runtime risks were identified:

- `ical.async.fromURL()` hides HTTP/fetch failure details and behaves differently from the platform-native fetch path.
- The built Next route trace did not include `node-ical`, so Vercel serverless output can fail when the parser is loaded dynamically.

The fix avoids `node-ical`'s internal remote fetch path and adds a server-side fallback parser for the VEVENT fields needed by this app if `node-ical` cannot load or parse in production.

## Runtime Findings
- Native `fetch()` can retrieve the Google ICS feed locally.
- The Google Calendar feed returns valid ICS text containing `BEGIN:VCALENDAR`.
- Local parser output for May 2026 returns 15 events.
- The previous API error response did not include enough detail to diagnose production runtime failures.

## Vercel Findings
- Production URL is not stored in repo metadata.
- Public search did not discover the deployment URL.
- Production verification is blocked until the Vercel URL is provided or the branch is deployed to Vercel.
- Local `.next/server/app/api/extract/route.js.nft.json` did not list `node-ical`, which supports the serverless dynamic-loading risk.

## Fix Applied
- Replaced `ical.async.fromURL(url)` with native `fetch(url)` plus `response.text()`.
- Added runtime validation for:
  - fetch failures
  - HTTP status failures
  - unsupported content type
  - empty ICS body
  - missing `BEGIN:VCALENDAR`
- Kept `node-ical.parseICS()` as the preferred parser.
- Added a minimal server-side ICS fallback parser for VEVENT fields if `node-ical` fails at runtime.
- Added detailed API error serialization with stack traces in the `details` field.

## Verification
- `npm run lint` passed.
- `npm run build` passed.
- Local `GET /api/extract?month=5&year=2026` returned:
  - HTTP 200
  - `success: true`
  - `count: 15`
  - first event title: `講道：Antony Wong`
- Local `GET /demo` returned:
  - HTTP 200
  - `May 2026` present
  - `15 events` present
  - `Antony Wong` present

Production verification:
- Blocked pending Vercel deployment URL.

## Risks
- The fallback parser intentionally covers the fields required by the current renderer, not the full ICS RFC.
- Recurrence expansion remains delegated to `node-ical`; fallback mode handles VEVENT entries present in the ICS text.
- Debug details are exposed in API error responses during the MVP phase and should be removed or gated before public hardening.

## Diff
```diff
- const calendar = await ical.async.fromURL(url);
+ const icsText = await fetchIcsText(url);
+ const calendar = ical.parseICS(icsText) as CalendarResponse;
+
+ if (!response.ok) {
+   throw new Error(`ICS feed request failed with HTTP ${response.status}`);
+ }
+
+ if (!responseText.includes("BEGIN:VCALENDAR")) {
+   throw new Error("ICS feed response did not contain BEGIN:VCALENDAR.");
+ }
+
+ try {
+   return normalizeParsedCalendar(calendar, month, year);
+ } catch (error) {
+   console.warn("node-ical parseICS failed; using ICS fallback parser.", error);
+   return parseFallbackIcsEvents(icsText, month, year);
+ }
+
+ return NextResponse.json({
+   success: false,
+   error: "Failed to parse calendar events.",
+   details,
+ });
```

## Output
Local API output summary:

```json
{
  "success": true,
  "count": 15,
  "events": [
    {
      "title": "講道：Antony Wong",
      "allDay": true
    }
  ]
}
```

## Review Status
BLOCKED_PENDING_PRODUCTION_URL
