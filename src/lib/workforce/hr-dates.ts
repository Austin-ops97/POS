const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthDayLabel(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function anniversarySource(hireDate?: Date | null, startDate?: Date | null): Date | null {
  return hireDate ?? startDate ?? null;
}

/** Next month/day occurrence on or after today, compared in UTC date parts. */
export function daysUntilMonthDay(monthIndex: number, day: number, today: Date): number {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(today.getUTCFullYear(), monthIndex, day);
  if (next < start) next = Date.UTC(today.getUTCFullYear() + 1, monthIndex, day);
  return Math.round((next - start) / 86_400_000);
}

export type Celebration = {
  employeeId: string;
  name: string;
  kind: "birthday" | "anniversary";
  label: string;
  daysUntil: number;
};

export function upcomingCelebrations(
  people: Array<{ id: string; name: string; dateOfBirth?: Date | null; hireDate?: Date | null; startDate?: Date | null }>,
  today: Date,
  withinDays = 14
): Celebration[] {
  const items: Celebration[] = [];
  for (const person of people) {
    if (person.dateOfBirth) {
      const daysUntil = daysUntilMonthDay(person.dateOfBirth.getUTCMonth(), person.dateOfBirth.getUTCDate(), today);
      if (daysUntil <= withinDays) {
        items.push({
          employeeId: person.id,
          name: person.name,
          kind: "birthday",
          label: monthDayLabel(person.dateOfBirth),
          daysUntil,
        });
      }
    }
    const hired = anniversarySource(person.hireDate, person.startDate);
    if (hired) {
      const daysUntil = daysUntilMonthDay(hired.getUTCMonth(), hired.getUTCDate(), today);
      if (daysUntil <= withinDays) {
        items.push({
          employeeId: person.id,
          name: person.name,
          kind: "anniversary",
          label: monthDayLabel(hired),
          daysUntil,
        });
      }
    }
  }
  return items.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}

export function celebrationSentence(item: Celebration): string {
  if (item.kind === "anniversary") return `${item.name}'s work anniversary is ${item.label}`;
  return `${item.name}'s birthday is ${item.label}`;
}
