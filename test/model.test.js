import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  HABIT_COLORS, localDateKey, parseDateKey, shiftDate, weekDates,
  formatWeekRange, createInitialState, validateState, isCompleted, isLateCompletion,
  toggleCompletion, addHabit, updateHabit, deleteHabit,
  habitColor, isHabitActive, migrateState, weeklyGoal, weeklyProgress,
} from '../src/model.js';

function frozen(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') frozen(child);
  }
  return value;
}

function sampleState() {
  let state = createInitialState();
  for (const [id, name, color] of [
    ['sunscreen', 'Sunscreen', 'blue'],
    ['exercise', 'Exercise', 'yellow'],
    ['reading', 'Reading', 'pink'],
  ]) {
    state = addHabit(state, { name, color }, id);
  }
  return state;
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

test('a fresh tracker has no habits or check-ins and owns independent empty collections', () => {
  const state = createInitialState();
  assert.equal(validateState(state), true);
  assert.deepEqual(state, { version: 2, habits: [], completions: {} });
  assert.equal(HABIT_COLORS.find(color => color.id === 'blue').value, '#2d68c4');
  state.habits.push({ id: 'local-only' });
  state.completions['2026-11-03'] = { 'local-only': true };
  assert.deepEqual(createInitialState(), { version: 2, habits: [], completions: {} });
});

test('completion toggles are immutable and remove an empty day without disturbing another habit', () => {
  const before = frozen(sampleState());
  const completed = toggleCompletion(before, 'reading', '2026-11-03', '2026-11-04');
  assert.equal(isCompleted(before, 'reading', '2026-11-03'), false);
  assert.equal(isCompleted(completed, 'reading', '2026-11-03'), true);
  const two = toggleCompletion(frozen(completed), 'exercise', '2026-11-03', '2026-11-08');
  const one = toggleCompletion(frozen(two), 'reading', '2026-11-03');
  assert.deepEqual(one.completions, { '2026-11-03': { exercise: true } });
  const none = toggleCompletion(frozen(one), 'exercise', '2026-11-03');
  assert.deepEqual(none.completions, {});
  assert.throws(() => toggleCompletion(before, 'unknown', '2026-11-03'), /no longer exists/);
  assert.throws(() => toggleCompletion(before, 'reading', '2026-02-29'), RangeError);
});

test('adding and editing habits trims names, preserves records, and rejects invalid or duplicate values', () => {
  const initial = frozen(sampleState());
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

test('new habit identifiers contain sixteen random bytes and are unique', () => {
  const state = createInitialState();
  const first = addHabit(state, { name: 'Walk', color: 'sage' }).habits.at(-1).id;
  const second = addHabit(state, { name: 'Water', color: 'teal' }).habits.at(-1).id;
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.match(second, /^[0-9a-f]{32}$/);
  assert.notEqual(first, second);
});

test('deleting a habit removes all its history and preserves unrelated records', () => {
  let state = toggleCompletion(sampleState(), 'reading', '2026-10-20');
  state = toggleCompletion(state, 'reading', '2026-11-03');
  state = frozen(toggleCompletion(state, 'exercise', '2026-11-03', '2026-11-03'));
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
  const changed = mutate => { const state = sampleState(); mutate(state); invalid.push(state); };
  changed(state => { state.version = 3; });
  changed(state => { state.extra = true; });
  changed(state => { state.habits[1].id = 'sunscreen'; });
  changed(state => { state.habits[1].name = 'reading'; });
  changed(state => { state.habits[0].name = ' Sunscreen'; });
  changed(state => { state.habits[0].id = 'constructor'; });
  changed(state => { state.habits[0].color = 'red'; });
  changed(state => { state.habits[0].weeklyGoals['2026-11-03'] = 3; });
  changed(state => { state.habits[0].weeklyGoals['2026-11-02'] = 8; });
  changed(state => { delete state.habits[0].weeklyGoals['0001-01-01']; });
  changed(state => { state.habits[0].endDate = '2026-02-29'; });
  changed(state => { state.habits[0].stageGoal = 'Goal without an end date'; });
  changed(state => { state.completions['2026-02-29'] = { reading: true }; });
  changed(state => { state.completions['2026-11-03'] = { unknown: true }; });
  changed(state => { state.completions['2026-11-03'] = { reading: false }; });
  changed(state => { state.completions['2026-11-03'] = {}; });
  for (const state of [null, [], {}, ...invalid]) assert.equal(validateState(state), false);
  assert.equal(validateState({ version: 2, habits: [], completions: {} }), true);
  assert.throws(() => migrateState({ version: 99 }), /unsupported version/);
});

test('legacy browser records migrate without changing the source or guessing late status', () => {
  const legacy = frozen({
    version: 1,
    habits: [{ id: 'reading', name: 'Reading', color: 'pink' }],
    completions: { '2026-11-03': { reading: true } },
  });
  const raw = JSON.stringify(legacy);
  const migrated = migrateState(legacy);
  assert.equal(validateState(migrated), true);
  assert.equal(weeklyGoal(migrated.habits[0], '2026-11-03'), 5);
  assert.equal(isCompleted(migrated, 'reading', '2026-11-03'), true);
  assert.equal(isLateCompletion(migrated, 'reading', '2026-11-03'), false);
  assert.equal(JSON.stringify(legacy), raw);
});

test('nonempty current records are retained while new trackers start empty', () => {
  const saved = frozen(toggleCompletion(sampleState(), 'reading', '2026-11-03', '2026-11-09'));
  assert.strictEqual(migrateState(saved), saved);
  assert.equal(isLateCompletion(saved, 'reading', '2026-11-03'), true);
  assert.equal(saved.habits.length, 3);
  assert.deepEqual(createInitialState(), { version: 2, habits: [], completions: {} });
});

test('weekly targets change during the current week without altering earlier weeks', () => {
  const initial = sampleState();
  const values = { name: 'Reading', color: '#E85761', weeklyGoal: 3 };
  const changed = updateHabit(initial, 'reading', values, '2026-11-05');
  const habit = changed.habits.at(-1);
  assert.equal(habitColor(habit).value, '#e85761');
  assert.equal(weeklyGoal(habit, '2026-11-01'), 5);
  assert.equal(weeklyGoal(habit, '2026-11-02'), 3);
  assert.equal(weeklyGoal(habit, '2026-11-09'), 3);
  assert.equal(validateState(changed), true);
  assert.throws(() => updateHabit(changed, 'reading', { ...values, weeklyGoal: 0 }), TypeError);
  const added = addHabit(changed, { name: 'Water', color: 'sage', weeklyGoal: 7 }, 'water');
  assert.equal(weeklyGoal(added.habits.at(-1), '2026-11-05'), 7);
});

test('a missed week recovers when a late check-in reaches the original goal', () => {
  const dates = weekDates('2026-11-03');
  let state = addHabit(createInitialState(), { name: 'Walk', color: 'teal', weeklyGoal: 2 }, 'walk');
  state = toggleCompletion(state, 'walk', dates[0], dates.at(-1));
  const habit = state.habits.at(-1);
  assert.equal(isLateCompletion(state, 'walk', dates[0]), false);
  assert.deepEqual(weeklyProgress(state, habit, dates, '2026-11-08'), { completed: 1, goal: 2, status: 'pending' });
  assert.deepEqual(weeklyProgress(state, habit, dates, '2026-11-09'), { completed: 1, goal: 2, status: 'missed' });
  state = toggleCompletion(state, 'walk', dates[1], '2026-11-09');
  assert.equal(isCompleted(state, 'walk', dates[1]), true);
  assert.equal(isLateCompletion(state, 'walk', dates[1]), true);
  assert.deepEqual(weeklyProgress(state, habit, dates, '2026-11-09'), { completed: 2, goal: 2, status: 'met' });
  assert.equal(validateState(state), true);
});

test('a staged habit remains eligible through its end date, including late check-ins', () => {
  const values = { name: 'Weight', color: 'sage', endDate: '2026-11-05', stageGoal: '  55 kg → 53 kg  ' };
  let state = addHabit(createInitialState(), values, 'weight');
  const habit = state.habits.at(-1);
  assert.equal(habit.stageGoal, '55 kg → 53 kg');
  assert.equal(isHabitActive(habit, '2026-11-05'), true);
  assert.equal(isHabitActive(habit, '2026-11-06'), false);
  state = toggleCompletion(state, 'weight', '2026-11-05', '2026-11-09');
  assert.equal(isLateCompletion(state, 'weight', '2026-11-05'), true);
  assert.throws(() => toggleCompletion(state, 'weight', '2026-11-06', '2026-11-09'), /habit has ended/);
  state = updateHabit(state, 'weight', { ...values, endDate: '' });
  assert.equal(state.habits.at(-1).stageGoal, '');
  assert.equal(isHabitActive(state.habits.at(-1), '2026-11-06'), true);
});
