import { CALENDAR_TIME_ZONE } from "./constants";
import type { CalendarEvent } from "./types";

export interface CalendarDay {
  date: Date | null;
  events: CalendarEvent[];
}

function formatDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function createMonthDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groupedEvents = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const eventDate = new Date(event.start);

    if (Number.isNaN(eventDate.getTime())) {
      continue;
    }

    const dateKey = formatDateKey(eventDate);
    const dayEvents = groupedEvents.get(dateKey) ?? [];
    dayEvents.push(event);
    groupedEvents.set(dateKey, dayEvents);
  }

  return groupedEvents;
}

export function generateMonthMatrix(
  year: number,
  month: number,
  events: CalendarEvent[],
): CalendarDay[][] {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingEmptyCells = firstDay.getDay();
  const groupedEvents = groupEventsByDate(events);
  const calendarDays: CalendarDay[] = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    calendarDays.push({ date: null, events: [] });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = createMonthDateKey(year, month, day);
    calendarDays.push({
      date: new Date(year, month - 1, day),
      events: groupedEvents.get(dateKey) ?? [],
    });
  }

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push({ date: null, events: [] });
  }

  const weeks: CalendarDay[][] = [];

  for (let index = 0; index < calendarDays.length; index += 7) {
    weeks.push(calendarDays.slice(index, index + 7));
  }

  return weeks;
}
