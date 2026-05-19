import { NextResponse } from "next/server";

import { DEFAULT_ICS_URL } from "@/lib/calendar/constants";
import {
  formatCalendarEvents,
  parseCalendarEvents,
  resolveCalendarIcsUrl,
} from "@/lib/calendar/parser";

export const runtime = "nodejs";

function parseIntegerParam(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
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

async function handleCalendarRequest(input: {
  calendarLink?: string | null;
  month: number | null;
  year: number | null;
}) {
  const { calendarLink, month, year } = input;

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
    const url = resolveCalendarIcsUrl(calendarLink || DEFAULT_ICS_URL);
    const events = await parseCalendarEvents(url, month, year);
    const formattedResult = formatCalendarEvents(events, month, year);

    return NextResponse.json({
      success: true,
      ...formattedResult,
    });
  } catch (error) {
    console.error("Calendar extraction failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to read calendar. Please confirm the calendar is public and the link is correct.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = parseIntegerParam(searchParams.get("month"));
  const year = parseIntegerParam(searchParams.get("year"));

  return handleCalendarRequest({
    calendarLink: searchParams.get("calendarLink") || searchParams.get("url"),
    month,
    year,
  });
}

export async function POST(request: Request) {
  let body: { calendarLink?: string; month?: unknown; year?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const month = parseIntegerParam(body.month);
  const year = parseIntegerParam(body.year);

  return handleCalendarRequest({
    calendarLink: body.calendarLink,
    month,
    year,
  });
}
