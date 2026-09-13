export function calendarDays(year: number, month: number): (number | null)[] {
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((first + length) / 7) * 7;
  return Array.from({ length: cells }, (_, i) =>
    i >= first && i < first + length ? i - first + 1 : null,
  );
}
