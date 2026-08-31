"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDate, type FormatDateOptions } from "@/lib/datetime";

type TimezoneContextValue = {
  displayTimezone: string;
};

const TimezoneContext = createContext<TimezoneContextValue>({
  displayTimezone: "America/New_York",
});

export function TimezoneProvider({
  displayTimezone,
  children,
}: {
  displayTimezone: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ displayTimezone }), [displayTimezone]);
  return (
    <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
  );
}

export function useDisplayTimezone(): string {
  return useContext(TimezoneContext).displayTimezone;
}

/** Format dates using the business display timezone from context. */
export function useFormatDate() {
  const timeZone = useDisplayTimezone();
  return (date: Date | string, options?: Omit<FormatDateOptions, "timeZone">) =>
    formatDate(date, { ...options, timeZone });
}
