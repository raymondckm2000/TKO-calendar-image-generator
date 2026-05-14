import { NextResponse } from "next/server";

import { parseCalendarEvents } from "@/lib/calendar/parser";

export const runtime = "nodejs";

const DEFAULT_ICS_URL =
  "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics";

function parseIntegerParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidMonth(month: number): boolean {
  return month >= 1 && month <= 12;
}

function isValidYear(year: number): boolean {
  return year >= 1 && year <= 9999;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = parseIntegerParam(searchParams.get("month"));
  const year = parseIntegerParam(searchParams.get("year"));

  if (month === null || year === null) {
    return NextResponse.json(
      { success: false, error: "Missing required month or year query param." },
      { status: 400 },
    );
  }

  if (!isValidMonth(month) || !isValidYear(year)) {
    return NextResponse.json(
      { success: false, error: "Invalid month or year query param." },
      { status: 400 },
    );
  }

  try {
    const url = searchParams.get("url") || DEFAULT_ICS_URL;
    const events = await parseCalendarEvents(url, month, year);

    return NextResponse.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Calendar extraction failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to parse calendar events." },
      { status: 500 },
    );
  }
}
