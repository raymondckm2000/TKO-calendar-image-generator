export const CALENDAR_SOURCE_IDS = {
  tko: "tko",
  birthdays: "birthdays",
  custom: "custom",
} as const;

export const CALENDAR_SOURCES = [
  {
    id: CALENDAR_SOURCE_IDS.tko,
    url: "https://calendar.google.com/calendar/ical/6cq5boqnnjp23j95rn54o95o5o%40group.calendar.google.com/public/basic.ics",
  },
  {
    id: CALENDAR_SOURCE_IDS.birthdays,
    url: "https://calendar.google.com/calendar/ical/4ilipql7cldik4523hg1hsv93o%40group.calendar.google.com/public/basic.ics",
  },
  {
    id: CALENDAR_SOURCE_IDS.custom,
    url: "",
  },
] as const;

export type CalendarSourceId = (typeof CALENDAR_SOURCES)[number]["id"];
