export type AppointmentWindow = { id?: string; assignedToId?: string | null; startsAt: string; endsAt: string };

export function appointmentsConflict(candidate: AppointmentWindow, existing: AppointmentWindow[]) {
  const start = new Date(candidate.startsAt).getTime();
  const end = new Date(candidate.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return existing.filter((item) => item.id !== candidate.id && item.assignedToId === candidate.assignedToId && start < new Date(item.endsAt).getTime() && end > new Date(item.startsAt).getTime());
}
