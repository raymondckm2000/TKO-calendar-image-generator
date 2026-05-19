export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  multiDay?: boolean;
  displayTime?: string;
}

export interface FormattedCalendarEvent {
  dateLabel: string;
  startDate: string;
  endDate: string;
  title: string;
  timeLabel: string;
  location: string;
  displayText: string;
  allDay: boolean;
  multiDay: boolean;
}
