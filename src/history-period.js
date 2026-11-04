import { localDateKey, parseDateKey } from './model.js';

export function historyPeriod(anchor, unit) {
  const date = parseDateKey(anchor);
  if (unit === 'year') {
    const year = anchor.slice(0, 4);
    return { start: year + '-01-01', end: year + '-12-31' };
  }
  if (unit !== 'month') throw new RangeError('Choose a year or month.');
  date.setDate(1);
  const start = localDateKey(date);
  date.setMonth(date.getMonth() + 1, 0);
  return { start, end: localDateKey(date) };
}

export function shiftHistoryPeriod(anchor, unit, offset) {
  if (offset !== -1 && offset !== 1) throw new TypeError('Period offset must be -1 or 1.');
  const date = parseDateKey(anchor);
  const day = date.getDate();
  date.setDate(1);
  if (unit === 'year') date.setFullYear(date.getFullYear() + offset);
  else if (unit === 'month') date.setMonth(date.getMonth() + offset);
  else throw new RangeError('Choose a year or month.');
  localDateKey(date);
  const lastDay = new Date(date);
  lastDay.setMonth(lastDay.getMonth() + 1, 0);
  date.setDate(Math.min(day, lastDay.getDate()));
  return localDateKey(date);
}
