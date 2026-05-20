import { CALENDAR_SOURCES, CALENDAR_SOURCE_IDS } from "@/lib/calendar/sources";

export const DEFAULT_ICS_URL = CALENDAR_SOURCES.find(
  (source) => source.id === CALENDAR_SOURCE_IDS.tko,
)!.url;

export const CALENDAR_TIME_ZONE = "Asia/Hong_Kong";
