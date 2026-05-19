"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { en } from "@/lib/i18n/en";

interface NormalizedEvent {
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

interface ExtractResponse {
  success: boolean;
  summary?: string;
  formattedText?: string;
  normalizedEvents?: NormalizedEvent[];
  error?: string;
}

const STORAGE_KEY = "tko-calendar-fetcher-form";

interface SavedForm {
  calendarLink?: string;
  year?: string;
  month?: string;
}

function getDefaultYear(): string {
  return String(new Date().getFullYear());
}

function getDefaultMonth(): string {
  return String(new Date().getMonth() + 1);
}

function getSavedForm(): SavedForm {
  if (typeof window === "undefined") {
    return {};
  }

  const savedForm = window.localStorage.getItem(STORAGE_KEY);

  if (!savedForm) {
    return {};
  }

  try {
    return JSON.parse(savedForm) as SavedForm;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

export function CalendarEventFetcher() {
  const strings = en.calendarFetcher;
  const [calendarLink, setCalendarLink] = useState(
    () => getSavedForm().calendarLink ?? "",
  );
  const [year, setYear] = useState(() => getSavedForm().year ?? getDefaultYear());
  const [month, setMonth] = useState(
    () => getSavedForm().month ?? getDefaultMonth(),
  );
  const [summary, setSummary] = useState("");
  const [formattedText, setFormattedText] = useState("");
  const [normalizedEvents, setNormalizedEvents] = useState<NormalizedEvent[]>([]);
  const [error, setError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizedJson = useMemo(
    () =>
      normalizedEvents.length > 0
        ? JSON.stringify(normalizedEvents, null, 2)
        : "",
    [normalizedEvents],
  );

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ calendarLink, year, month }),
    );
  }, [calendarLink, month, year]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsFetching(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/extract", {
        body: JSON.stringify({
          calendarLink,
          month: Number.parseInt(month, 10),
          year: Number.parseInt(year, 10),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as ExtractResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || strings.errorMessage);
      }

      setSummary(data.summary ?? "");
      setFormattedText(data.formattedText ?? "");
      setNormalizedEvents(data.normalizedEvents ?? []);
    } catch (fetchError) {
      console.error("Calendar fetch failed:", fetchError);
      setError(strings.errorMessage);
      setSummary("");
      setFormattedText("");
      setNormalizedEvents([]);
    } finally {
      setIsFetching(false);
    }
  }

  async function handleCopy() {
    if (!formattedText) {
      return;
    }

    await navigator.clipboard.writeText(formattedText);
    setCopied(true);
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{strings.title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            {strings.subtitle}
          </p>
        </section>

        <form
          className="grid gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_120px_180px_auto] sm:items-end"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            {strings.calendarLinkLabel}
            <input
              className="h-11 border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-zinc-900"
              onChange={(event) => setCalendarLink(event.target.value)}
              placeholder={strings.calendarLinkPlaceholder}
              required
              type="url"
              value={calendarLink}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            {strings.yearLabel}
            <input
              className="h-11 border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-zinc-900"
              max="9999"
              min="1"
              onChange={(event) => setYear(event.target.value)}
              required
              type="number"
              value={year}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            {strings.monthLabel}
            <select
              className="h-11 border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-zinc-900"
              onChange={(event) => setMonth(event.target.value)}
              value={month}
            >
              {strings.months.map((monthName, index) => (
                <option key={monthName} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>

          <button
            className="h-11 bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            disabled={isFetching}
            type="submit"
          >
            {isFetching ? strings.fetchingButton : strings.fetchButton}
          </button>
        </form>

        {error ? (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3 border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  {strings.summaryLabel}
                </p>
                <p className="mt-1 text-sm text-zinc-900">{summary}</p>
              </div>
              <button
                className="h-9 border border-zinc-300 px-3 text-sm font-medium transition-colors hover:border-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400"
                disabled={!formattedText}
                onClick={handleCopy}
                type="button"
              >
                {copied ? strings.copiedButton : strings.copyButton}
              </button>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold">
                {strings.formattedTextLabel}
              </h2>
              <pre className="min-h-64 overflow-auto whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6">
                {formattedText || strings.emptyFormattedText}
              </pre>
            </div>
          </div>

          <div className="flex flex-col gap-3 border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold">{strings.jsonLabel}</h2>
            <pre className="min-h-64 overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5">
              {normalizedJson || strings.emptyJson}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
