import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  STORAGE_KEY, HABIT_COLORS, localDateKey, parseDateKey, shiftDate, weekDates,
  formatWeekRange, createInitialState, validateState, isCompleted,
  toggleCompletion, addHabit, updateHabit, deleteHabit, loadState, saveState,
} from '../src/model.js';

function frozen(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') frozen(child);
  }
  return value;
}

function memoryStorage(value = null) {
  return {
    value,
    writes: 0,
    getItem(key) { assert.equal(key, STORAGE_KEY); return this.value; },
    setItem(key, next) { assert.equal(key, STORAGE_KEY); this.value = next; this.writes++; },
  };
}

test('calendar helpers keep local dates and Monday-to-Sunday weeks across a year boundary', () => {
  const date = parseDateKey('2026-11-03');
  assert.equal(date.getHours(), 12);
  assert.equal(localDateKey(date), '2026-11-03');
  assert.deepEqual(weekDates('2027-01-01'), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
    '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDate('2028-02-29', 1), '2028-03-01');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(formatWeekRange('2026-11-03'), 'Nov 2 – 8, 2026');
  assert.equal(formatWeekRange('2026-12-01'), 'Nov 30 – Dec 6, 2026');
  assert.equal(formatWeekRange('2027-01-01'), 'Dec 28, 2026 – Jan 3, 2027');
});

test('date parsing rejects rolled-over, malformed, and out-of-range dates', () => {
  for (const value of ['2026-02-29', '2026-11-31', '2026-00-01', '2026-13-01',
    '2026-1-01', '2026-01-00', '0000-01-01', '2026-01-01T00:00:00Z', null]) {
    assert.throws(() => parseDateKey(value), RangeError);
  }
  assert.equal(localDateKey(parseDateKey('0001-01-01')), '0001-01-01');
  assert.throws(() => localDateKey(new Date(NaN)), RangeError);
  assert.throws(() => shiftDate('2026-01-01', 0.5), TypeError);
  assert.throws(() => shiftDate('9999-12-31', 1), RangeError);
});

test('local dates survive Hong Kong UTC boundaries and daylight saving changes', () => {
  const moduleUrl = new URL('../src/model.js', import.meta.url).href;
  const cases = [
    { zone: 'Asia/Hong_Kong', script: `
      assert.equal(localDateKey(new Date('2026-11-02T16:30:00Z')), '2026-11-03');
      assert.equal(localDateKey(new Date('2026-11-03T15:30:00Z')), '2026-11-03');
    ` },
    { zone: 'America/New_York', script: `
      assert.equal(shiftDate('2026-03-07', 1), '2026-03-08');
      assert.equal(shiftDate('2026-03-08', 1), '2026-03-09');
      assert.equal(shiftDate('2026-11-01', 1), '2026-11-02');
      assert.equal(parseDateKey('2026-03-08').getHours(), 12);
      assert.deepEqual(weekDates('2026-03-08'), ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08']);
    ` },
  ];
  for (const { zone, script } of cases) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import assert from 'node:assert/strict'; import {localDateKey,parseDateKey,shiftDate,weekDates} from ${JSON.stringify(moduleUrl)}; ${script}`],
    { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('initial data has three named habits and no fabricated completions', () => {
  const state = createInitialState();
  assert.equal(validateState(state), true);
  assert.deepEqual(state.habits.map(habit => [habit.id, habit.color]), [
    ['sunscreen', 'blue'], ['exercise', 'yellow'], ['reading', 'pink'],
  ]);
  assert.deepEqual(state.completions, {});
  assert.equal(HABIT_COLORS.find(color => color.id === 'blue').value, '#2d68c4');
  state.habits[0].name = 'Changed';
  assert.equal(createInitialState().habits[0].name, 'Sunscreen');
});

test('completion toggles are immutable and remove an empty day without disturbing another habit', () => {
  const before = frozen(createInitialState());
  const completed = toggleCompletion(before, 'reading', '2026-11-03');
  assert.equal(isCompleted(before, 'reading', '2026-11-03'), false);
  assert.equal(isCompleted(completed, 'reading', '2026-11-03'), true);
  const two = toggleCompletion(frozen(completed), 'exercise', '2026-11-03');
  const one = toggleCompletion(frozen(two), 'reading', '2026-11-03');
  assert.deepEqual(one.completions, { '2026-11-03': { exercise: true } });
  const none = toggleCompletion(frozen(one), 'exercise', '2026-11-03');
  assert.deepEqual(none.completions, {});
  assert.throws(() => toggleCompletion(before, 'unknown', '2026-11-03'), /no longer exists/);
  assert.throws(() => toggleCompletion(before, 'reading', '2026-02-29'), RangeError);
});

test('adding and editing habits trims names, preserves records, and rejects invalid or duplicate values', () => {
  const initial = frozen(createInitialState());
  const added = addHabit(initial, { name: '  Drink water  ', color: 'teal' }, 'water');
  assert.equal(added.habits.at(-1).name, 'Drink water');
  assert.equal(initial.habits.length, 3);
  assert.equal(validateState(addHabit(initial, { name: 'Walk', color: 'sage' })), true);
  const completed = frozen(toggleCompletion(added, 'water', '2026-11-03'));
  const edited = updateHabit(completed, 'water', { name: 'Hydrate', color: 'purple' });
  assert.equal(edited.habits.at(-1).name, 'Hydrate');
  assert.equal(isCompleted(edited, 'water', '2026-11-03'), true);
  assert.equal(completed.habits.at(-1).name, 'Drink water');
  for (const values of [{ name: '', color: 'blue' }, { name: 'x'.repeat(61), color: 'blue' },
    { name: 'Reading ', color: 'blue' }, { name: 'New', color: 'unknown' }, { name: 'Line\nbreak', color: 'blue' }]) {
    assert.throws(() => addHabit(initial, values), TypeError);
  }
  assert.throws(() => addHabit(initial, { name: 'New', color: 'blue' }, 'constructor'), TypeError);
  assert.throws(() => addHabit(initial, { name: 'New', color: 'blue' }, 'reading'), TypeError);
  assert.throws(() => addHabit(initial, { name: 'New', color: 'blue' }, 'toString'), TypeError);
  assert.throws(() => updateHabit(initial, 'sunscreen', { name: 'reading', color: 'blue' }), /already exists/);
  assert.throws(() => updateHabit(initial, 'unknown', { name: 'New', color: 'blue' }), /no longer exists/);
});

test('deleting a habit removes all its history and preserves unrelated records', () => {
  let state = toggleCompletion(createInitialState(), 'reading', '2026-10-20');
  state = toggleCompletion(state, 'reading', '2026-11-03');
  state = frozen(toggleCompletion(state, 'exercise', '2026-11-03'));
  const result = deleteHabit(state, 'reading');
  assert.equal(result.habits.some(habit => habit.id === 'reading'), false);
  assert.deepEqual(result.completions, { '2026-11-03': { exercise: true } });
  assert.equal(state.habits.length, 3);
  assert.equal(isCompleted(state, 'reading', '2026-10-20'), true);
  assert.equal(validateState(result), true);
  assert.throws(() => deleteHabit(state, 'unknown'), /no longer exists/);
});

test('schema validation rejects unsupported versions, duplicate identities, malformed dates, and orphan records', () => {
  const invalid = [];
  const changed = mutate => { const state = createInitialState(); mutate(state); invalid.push(state); };
  changed(state => { state.version = 2; });
  changed(state => { state.extra = true; });
  changed(state => { state.habits[1].id = 'sunscreen'; });
  changed(state => { state.habits[1].name = 'reading'; });
  changed(state => { state.habits[0].name = ' Sunscreen'; });
  changed(state => { state.habits[0].id = 'constructor'; });
  changed(state => { state.habits[0].color = 'red'; });
  changed(state => { state.completions['2026-02-29'] = { reading: true }; });
  changed(state => { state.completions['2026-11-03'] = { unknown: true }; });
  changed(state => { state.completions['2026-11-03'] = { reading: false }; });
  changed(state => { state.completions['2026-11-03'] = {}; });
  for (const state of [null, [], {}, ...invalid]) assert.equal(validateState(state), false);
  assert.equal(validateState({ version: 1, habits: [], completions: {} }), true);
});

test('storage loads fresh data without writing, then persists and reloads real records', () => {
  const storage = memoryStorage();
  const initial = loadState(storage);
  assert.equal(storage.writes, 0);
  const state = toggleCompletion(initial, 'reading', '2026-11-03');
  saveState(storage, state);
  assert.equal(storage.writes, 1);
  assert.deepEqual(loadState(storage), state);
});

test('corrupt and blocked storage report errors without replacing existing data', () => {
  for (const raw of ['{broken', '{"version":99}', 'null']) {
    const storage = memoryStorage(raw);
    assert.throws(() => loadState(storage), /existing data has not been changed/);
    assert.equal(storage.value, raw);
    assert.equal(storage.writes, 0);
  }
  assert.throws(() => loadState({ getItem() { throw new Error('blocked'); } }), /storage is unavailable/);
  assert.throws(() => saveState({ setItem() { throw new Error('quota'); } }, createInitialState()), /could not be saved/);
  const storage = memoryStorage('untouched');
  assert.throws(() => saveState(storage, { version: 99 }), /Invalid habit data/);
  assert.equal(storage.value, 'untouched');
  assert.equal(storage.writes, 0);
});
