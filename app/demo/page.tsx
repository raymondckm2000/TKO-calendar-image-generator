import { MonthlyCalendar } from "@/components/calendar/MonthlyCalendar";
import { DEFAULT_ICS_URL } from "@/lib/calendar/constants";
import { parseCalendarEvents } from "@/lib/calendar/parser";
import type { CalendarEvent } from "@/lib/calendar/types";

const DEMO_MONTH = 5;
const DEMO_YEAR = 2026;

export const dynamic = "force-dynamic";

async function fetchDemoEvents(): Promise<{
  events: CalendarEvent[];
  error: string | null;
}> {
  try {
    const events = await parseCalendarEvents(
      DEFAULT_ICS_URL,
      DEMO_MONTH,
      DEMO_YEAR,
    );
    return { events, error: null };
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
