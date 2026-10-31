// Best times per course, on this device. Keyed by course id so they can be compared between players later.
export interface RecordEntry {
  time: number;
  date: string;
}

const KEEP = 10;
const storageKey = (courseId: string): string => `marble-records:${courseId}`;

export function loadRecords(courseId: string): RecordEntry[] {
  try {
    const saved = localStorage.getItem(storageKey(courseId));
    return saved ? (JSON.parse(saved) as RecordEntry[]) : [];
  } catch {
    return [];
  }
}

export function addRecord(courseId: string, time: number): RecordEntry[] {
  const records = [...loadRecords(courseId), { time, date: new Date().toISOString() }]
    .sort((a, b) => a.time - b.time)
    .slice(0, KEEP);
  try {
    localStorage.setItem(storageKey(courseId), JSON.stringify(records));
  } catch {
    // Storage can be unavailable; the time still shows for this session.
  }
  return records;
}
