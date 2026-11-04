import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftDate } from '../src/model.js';
import { historyPeriod, shiftHistoryPeriod } from '../src/history-period.js';

test('history periods use real calendar months and full years', () => {
  assert.deepEqual(historyPeriod('2028-02-29', 'year'), { start: '2028-01-01', end: '2028-12-31' });
  assert.deepEqual(historyPeriod('2028-02-29', 'month'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(historyPeriod('2027-02-20', 'month'), { start: '2027-02-01', end: '2027-02-28' });
  assert.deepEqual(historyPeriod('2026-04-30', 'month'), { start: '2026-04-01', end: '2026-04-30' });
  assert.deepEqual(historyPeriod('2026-12-31', 'month'), { start: '2026-12-01', end: '2026-12-31' });
});

test('consecutive month periods cover every real date exactly once in leap and common years', () => {
  for (const year of [2027, 2028]) {
    const dates = [];
    for (let month = 1; month <= 12; month++) {
      const anchor = `${year}-${String(month).padStart(2, '0')}-01`;
      const { start, end } = historyPeriod(anchor, 'month');
      for (let date = start; ; date = shiftDate(date, 1)) {
        dates.push(date);
        if (date === end) break;
      }
    }
    assert.equal(dates.length, year === 2028 ? 366 : 365);
    assert.equal(new Set(dates).size, dates.length);
    assert.equal(dates[0], `${year}-01-01`);
    assert.equal(dates.at(-1), `${year}-12-31`);
    for (let index = 1; index < dates.length; index++) {
      assert.equal(dates[index], shiftDate(dates[index - 1], 1));
    }
  }
});

test('month and year navigation clamp days to the target calendar month', () => {
  assert.equal(shiftHistoryPeriod('2027-01-31', 'month', 1), '2027-02-28');
  assert.equal(shiftHistoryPeriod('2028-01-31', 'month', 1), '2028-02-29');
  assert.equal(shiftHistoryPeriod('2026-03-31', 'month', -1), '2026-02-28');
  assert.equal(shiftHistoryPeriod('2026-05-31', 'month', -1), '2026-04-30');
  assert.equal(shiftHistoryPeriod('2026-12-30', 'month', 1), '2027-01-30');
  assert.equal(shiftHistoryPeriod('2027-01-30', 'month', -1), '2026-12-30');
  assert.equal(shiftHistoryPeriod('2028-02-29', 'year', 1), '2029-02-28');
  assert.equal(shiftHistoryPeriod('2028-02-29', 'year', -1), '2027-02-28');
  assert.equal(shiftHistoryPeriod('2096-02-29', 'year', 1), '2097-02-28');
  assert.equal(shiftHistoryPeriod('0099-02-28', 'year', 1), '0100-02-28');
});

test('supported year boundaries remain valid and shifts outside them fail', () => {
  assert.deepEqual(historyPeriod('0001-01-01', 'year'), { start: '0001-01-01', end: '0001-12-31' });
  assert.deepEqual(historyPeriod('9999-12-31', 'month'), { start: '9999-12-01', end: '9999-12-31' });
  assert.equal(shiftHistoryPeriod('9999-11-30', 'month', 1), '9999-12-30');
  for (const unit of ['year', 'month']) {
    assert.throws(() => shiftHistoryPeriod('0001-01-01', unit, -1), RangeError);
    assert.throws(() => shiftHistoryPeriod('9999-12-31', unit, 1), RangeError);
  }
  for (const anchor of ['2027-02-29', '2028-02-30', '0000-01-01', '10000-01-01']) {
    assert.throws(() => historyPeriod(anchor, 'month'), RangeError);
  }
  for (const unit of ['week', 'day', 'hour']) {
    assert.throws(() => historyPeriod('2026-11-03', unit), /Choose a year or month\./);
    assert.throws(() => shiftHistoryPeriod('2026-11-03', unit, 1), /Choose a year or month\./);
  }
  assert.throws(() => shiftHistoryPeriod('2026-11-03', 'month', 0.5), TypeError);
});
