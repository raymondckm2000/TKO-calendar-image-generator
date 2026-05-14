import { headers } from "next/headers";

import { MonthlyCalendar } from "@/components/calendar/MonthlyCalendar";
import type { CalendarEvent } from "@/lib/calendar/types";

const DEMO_MONTH = 5;
const DEMO_YEAR = 2026;

interface ExtractResponse {
  success: boolean;
  count?: number;
  events?: CalendarEvent[];
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<CalendarEvent>;

  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.start === "string" &&
    typeof event.end === "string" &&
    typeof event.allDay === "boolean"
  );
}

function normalizeExtractResponse(value: unknown): CalendarEvent[] {
  const response = value as ExtractResponse;

  if (!response?.success || !Array.isArray(response.events)) {
    return [];
  }

  return response.events.filter(isCalendarEvent);
}

async function fetchDemoEvents(): Promise<{
  events: CalendarEvent[];
  error: string | null;
}> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");

    if (!host) {
      return { events: [], error: "Calendar API host unavailable." };
    }

    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    const response = await fetch(
      `${protocol}://${host}/api/extract?month=${DEMO_MONTH}&year=${DEMO_YEAR}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return { events: [], error: "Calendar events unavailable." };
    }

    const payload: unknown = await response.json();
    return { events: normalizeExtractResponse(payload), error: null };
  } catch {
    return { events: [], error: "Calendar events unavailable." };
  }
}

export default async function DemoPage() {
  const { events, error } = await fetchDemoEvents();

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {error ? (
          <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <MonthlyCalendar events={events} month={DEMO_MONTH} year={DEMO_YEAR} />
      </div>
    </main>
  );
}
