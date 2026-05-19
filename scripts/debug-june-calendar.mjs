import ical from "node-ical";

const DEFAULT_ICS_URL =
  "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics";
const CALENDAR_TIME_ZONE = "Asia/Hong_Kong";
const TARGET_MONTH = 6;
const TARGET_YEAR = 2026;
const TARGET_TITLES = [
  "區域主日(尖東富豪)",
  "奉獻日",
  "九龍TG中心",
  "九龍區域及屯門主日崇拜(荃灣悅來酒店)",
  "（BT）",
  "區域主日(盛德)",
];

function unfoldIcsLines(icsText) {
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfoldedLines = [];

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfoldedLines.length > 0) {
      unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
    } else {
      unfoldedLines.push(line);
    }
  }

  return unfoldedLines;
}

function parseRawBlocks(icsText) {
  return unfoldIcsLines(icsText)
    .join("\n")
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => `BEGIN:VEVENT${block.split("END:VEVENT")[0]}END:VEVENT`);
}

function rawField(block, fieldName) {
  return block
    .split("\n")
    .find((line) => line.toUpperCase().startsWith(fieldName));
}

function dateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

function rawBlockMayAffectJune(block) {
  const text = block.replace(/\D/g, " ");
  const hasTargetYear = /2026/.test(block);
  const hasOpenRecurrence = /RRULE:/.test(block) && !/UNTIL=20(0|1|2[0-5])/.test(block);
  const hasLateRecurrence = /RRULE:/.test(block) && /UNTIL=2026/.test(block);

  return hasTargetYear || hasOpenRecurrence || hasLateRecurrence || text.includes("202606");
}

function dateKey(date) {
  const parts = dateParts(date);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function displayTime(date, allDay) {
  if (allDay) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: CALENDAR_TIME_ZONE,
  })
    .format(date)
    .toLowerCase()
    .replace(":00", "")
    .replace(/\s/g, "");
}

function displayEndDate(start, end, allDay) {
  if (!allDay || end.getTime() <= start.getTime()) {
    return end;
  }

  const adjusted = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  adjusted.dateOnly = true;
  return adjusted;
}

function dateLabel(startDate, endDate) {
  const [, startMonth, startDay] = startDate.split("-").map(Number);
  const [, endMonth, endDay] = endDate.split("-").map(Number);

  if (startDate === endDate) {
    return `${startDay}/${startMonth}`;
  }

  if (startMonth === endMonth) {
    return `${startDay}-${endDay}/${startMonth}`;
  }

  return `${startDay}/${startMonth}-${endDay}/${endMonth}`;
}

function overlapsJune(start, end, allDay) {
  const startKey = dateKey(start);
  const endKey = dateKey(displayEndDate(start, end, allDay));

  return startKey <= "2026-06-30" && endKey >= "2026-06-01";
}

function createOccurrence(event, occurrence) {
  const end = event.end instanceof Date ? event.end : event.start;
  const duration = end.getTime() - event.start.getTime();
  const start = new Date(occurrence.getTime());
  const occurrenceEnd = new Date(occurrence.getTime() + duration);
  start.tz = event.start.tz;
  occurrenceEnd.tz = end.tz;

  return {
    ...event,
    start,
    end: occurrenceEnd,
  };
}

function isExcluded(event, occurrence) {
  return Object.values(event.exdate ?? {}).some(
    (excludedDate) => excludedDate instanceof Date && excludedDate.getTime() === occurrence.getTime(),
  );
}

function debugCandidate(event, source) {
  const title = event.summary || "Untitled event";
  const start = event.start;
  const end = event.end instanceof Date ? event.end : event.start;
  const allDay = Boolean(start?.dateOnly || event.datetype === "date");
  const included = start instanceof Date && overlapsJune(start, end, allDay);
  const startDate = start instanceof Date ? dateKey(start) : "";
  const endDate = end instanceof Date ? dateKey(displayEndDate(start, end, allDay)) : "";
  const timeLabel = start instanceof Date ? displayTime(start, allDay) : "";
  const text = included
    ? [dateLabel(startDate, endDate), timeLabel, title].filter(Boolean).join(" ")
    : "";

  if (
    !included &&
    !String(event.rawStart ?? "").includes("2026") &&
    !String(event.rawEnd ?? "").includes("2026") &&
    !String(event.rrule?.toString?.() ?? "").includes("2026")
  ) {
    return;
  }

  console.log("---CANDIDATE---");
  console.log(`source=${source}`);
  console.log(`title=${title}`);
  console.log(`raw DTSTART=${event.rawStart ?? ""}`);
  console.log(`raw DTEND=${event.rawEnd ?? ""}`);
  console.log(`allDay=${allDay}`);
  console.log(`dateOnly=${Boolean(start?.dateOnly)}`);
  console.log(`tz=${start?.tz ?? ""}`);
  console.log(`rrule=${event.rrule?.toString?.() ?? ""}`);
  console.log(`recurrence-id=${event.recurrenceid?.toISOString?.() ?? ""}`);
  console.log(`recurrences=${Object.keys(event.recurrences ?? {}).join(",")}`);
  console.log(`normalized startDate=${startDate}`);
  console.log(`normalized endDate=${endDate}`);
  console.log(`displayTime=${timeLabel}`);
  console.log(`final displayText=${text}`);
  console.log(`included=${included}`);
  console.log(`exclusion reason=${included ? "" : "outside June 2026 or invalid start"}`);
}

const response = await fetch(DEFAULT_ICS_URL);
const icsText = await response.text();
const rawBlocks = parseRawBlocks(icsText);
const calendar = ical.parseICS(icsText);
const searchStart = new Date(Date.UTC(TARGET_YEAR, TARGET_MONTH - 1, -1));
const searchEnd = new Date(Date.UTC(TARGET_YEAR, TARGET_MONTH, 2));

console.log(`DEFAULT_ICS_URL=${DEFAULT_ICS_URL}`);
console.log(`TARGET=${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}`);

for (const title of TARGET_TITLES) {
  console.log(`\n=== RAW ${title} ===`);
  for (const block of rawBlocks.filter(
    (candidate) => candidate.includes(title) && rawBlockMayAffectJune(candidate),
  )) {
    console.log([
      rawField(block, "SUMMARY") ?? "",
      rawField(block, "DTSTART") ?? "",
      rawField(block, "DTEND") ?? "",
      rawField(block, "RRULE") ?? "",
      rawField(block, "EXDATE") ?? "",
      rawField(block, "RECURRENCE-ID") ?? "",
      rawField(block, "UID") ?? "",
    ].filter(Boolean).join("\n"));
    console.log("---");
  }
}

for (const [id, event] of Object.entries(calendar)) {
  if (event.type !== "VEVENT" || !TARGET_TITLES.includes(event.summary)) {
    continue;
  }

  const rawBlock = rawBlocks.find(
    (block) => block.includes(`UID:${event.uid}`) && block.includes(`SUMMARY:${event.summary}`),
  );
  event.rawStart = rawBlock ? rawField(rawBlock, "DTSTART") : "";
  event.rawEnd = rawBlock ? rawField(rawBlock, "DTEND") : "";

  if (event.rrule?.between instanceof Function) {
    for (const occurrence of event.rrule.between(searchStart, searchEnd, true)) {
      if (isExcluded(event, occurrence)) {
        continue;
      }

      debugCandidate(createOccurrence(event, occurrence), `${id} occurrence`);
    }
  }

  debugCandidate(event, id);

  for (const [recurrenceId, recurrence] of Object.entries(event.recurrences ?? {})) {
    if (TARGET_TITLES.includes(recurrence.summary)) {
      debugCandidate(recurrence, `${id} recurrence ${recurrenceId}`);
    }
  }
}
