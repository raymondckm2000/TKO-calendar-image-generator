import { CALENDAR_TIME_ZONE } from "@/lib/calendar/constants";
import { generateMonthMatrix } from "@/lib/calendar/month";
import type { CalendarEvent } from "@/lib/calendar/types";

interface MonthlyCalendarProps {
  year: number;
  month: number;
  events: CalendarEvent[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMonthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) {
    return "All Day";
  }

  const start = new Date(event.start);

  if (Number.isNaN(start.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: CALENDAR_TIME_ZONE,
  }).format(start);
}

export function MonthlyCalendar({ year, month, events }: MonthlyCalendarProps) {
  const weeks = generateMonthMatrix(year, month, events);

  return (
    <section className="mx-auto w-full max-w-6xl bg-white text-zinc-950">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            TKO Calendar
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-zinc-950 sm:text-4xl">
            {formatMonthTitle(year, month)}
          </h1>
        </div>
        <p className="text-sm text-zinc-500">{events.length} events</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50">
            {WEEKDAYS.map((weekday) => (
              <div
                className="px-3 py-2 text-center text-xs font-semibold uppercase text-zinc-500"
                key={weekday}
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {weeks.flatMap((week, weekIndex) =>
              week.map((day, dayIndex) => (
                <div
                  className="min-h-36 border-b border-r border-zinc-200 bg-white p-2 sm:min-h-40"
                  key={`${day.date?.toISOString() ?? "empty"}-${weekIndex}-${dayIndex}`}
                >
                  {day.date ? (
                    <div className="flex h-full flex-col gap-2">
                      <div className="text-sm font-semibold text-zinc-900">
                        {day.date.getDate()}
                      </div>

                      <div className="flex flex-col gap-1">
                        {day.events.map((event) => {
                          const eventTime = formatEventTime(event);

                          return (
                            <div
                              className="rounded border border-teal-200 bg-teal-50 px-2 py-1 text-left"
                              key={event.id}
                            >
                              <div className="truncate text-[11px] font-semibold leading-4 text-teal-950">
                                {event.title}
                              </div>
                              {eventTime ? (
                                <div className="text-[10px] font-medium leading-4 text-teal-700">
                                  {eventTime}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full bg-zinc-50" aria-hidden="true" />
                  )}
                </div>
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
