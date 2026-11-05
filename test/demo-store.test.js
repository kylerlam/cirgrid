import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, isHabitActive, validateState, weekDates, weeklyProgress } from '../src/model.js';
import { createDemoStore, createDemoState, demoToday, DEMO_STORAGE_KEY } from '../src/demo-store.js';

function memoryStorage(initial = null) {
  let value = initial;
  const keys = [];
  return {
    keys,
    getItem(key) { keys.push(key); return value; },
    setItem(key, next) { keys.push(key); value = next; },
    value() { return value; },
  };
}

const moment = '2026-11-04T04:00:00Z';
const clock = () => new Date(moment);

test('fictional samples validate and show weekly, late, and staged history', () => {
  const today = demoToday(clock());
  const state = createDemoState(today);
  assert.equal(validateState(state), true);
  assert.deepEqual(createInitialState(), { version: 3, habits: [], completions: {} });
  assert.equal(state.habits.length, 5);
  assert.ok(state.habits.some(habit => habit.endDate > today && habit.stageGoal));
  assert.ok(state.habits.some(habit => habit.endDate && habit.endDate < today && habit.stageGoal));
  assert.ok(new Set(state.habits.map(habit => habit.weeklyGoals['0001-01-01'])).size >= 3);
  const dates = Object.keys(state.completions).sort();
  assert.ok(dates.every(date => date <= today));
  assert.ok((new Date(today) - new Date(dates[0])) / 86400000 >= 60);
  assert.ok(Object.values(state.completions).some(records => Object.values(records).includes('late')));
  for (const [date, records] of Object.entries(state.completions)) {
    for (const id of Object.keys(records)) assert.ok(isHabitActive(state.habits.find(habit => habit.id === id), date));
  }
  const statuses = new Set();
  for (const date of dates) {
    if (weekDates(date).at(-1) >= today) continue;
    for (const habit of state.habits) statuses.add(weeklyProgress(state, habit, weekDates(date), today).status);
  }
  assert.ok(statuses.has('met'));
  assert.ok(statuses.has('missed'));
});

test('a same-day version 2 demo migrates without losing edits or check-ins', async () => {
  const state = createDemoState('2026-11-04');
  state.version = 2;
  for (const habit of state.habits) {
    delete habit.startDate;
    delete habit.description;
  }
  state.habits[0].name = 'A saved sample edit';
  const storage = memoryStorage(JSON.stringify({ version: 1, day: '2026-11-04', revision: 8, state }));
  const store = createDemoStore({ storage, clock });
  const migrated = await store.read();
  assert.equal(validateState(migrated.state), true);
  assert.equal(migrated.revision, 8);
  assert.equal(migrated.state.habits[0].name, 'A saved sample edit');
  assert.deepEqual(migrated.state.completions, state.completions);
  assert.equal(migrated.state.habits[0].description, '');
  assert.equal(migrated.state.habits[0].startDate,
    Object.keys(state.completions).sort().find(date => state.completions[date]['demo-reading']));
  await store.save(migrated.state, migrated.revision);
  assert.equal(JSON.parse(storage.value()).state.version, 3);
});

test('same-day edits persist across store instances using only the demo key', async () => {
  const storage = memoryStorage();
  const store = createDemoStore({ storage, clock });
  const first = await store.read();
  const changed = structuredClone(first.state);
  changed.habits[0].name = 'A sample edit';
  const saved = await store.save(changed, first.revision);
  assert.equal(saved.revision, first.revision + 1);
  const reopened = await createDemoStore({ storage, clock }).read();
  assert.deepEqual(reopened, saved);
  assert.ok(storage.keys.every(key => key === DEMO_STORAGE_KEY));
});

test('Hong Kong midnight resets once and clock rollback preserves the newer day', async () => {
  const storage = memoryStorage();
  let now = new Date('2026-11-04T15:59:59Z');
  const store = createDemoStore({ storage, clock: () => now });
  const before = await store.read();
  const edited = structuredClone(before.state);
  edited.habits[0].name = 'An edited sample';
  await store.save(edited, before.revision);
  now = new Date('2026-11-04T16:00:00Z');
  assert.equal(demoToday(now), '2026-11-05');
  const after = await store.read();
  assert.equal(after.revision, before.revision + 2);
  assert.deepEqual(after.state, createDemoState('2026-11-05'));
  assert.deepEqual(await store.read(), after);
  now = new Date('2026-11-04T14:00:00Z');
  assert.deepEqual(await store.read(), after);
  assert.equal(JSON.parse(storage.value()).day, '2026-11-05');
});

test('Web Locks serialize initialization and reject a stale revision', async () => {
  const storage = memoryStorage();
  let tail = Promise.resolve();
  const names = [];
  const locks = {
    request(name, action) {
      names.push(name);
      const result = tail.then(action);
      tail = result.catch(() => {});
      return result;
    },
  };
  const a = createDemoStore({ storage, clock, locks });
  const b = createDemoStore({ storage, clock, locks });
  const [first, second] = await Promise.all([a.read(), b.read()]);
  assert.deepEqual(first, second);
  const outcomes = await Promise.allSettled([
    a.save(first.state, first.revision), b.save(second.state, second.revision),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.status, 409);
  assert.ok(names.every(name => name === DEMO_STORAGE_KEY));
});

test('blocked and full storage report failure without claiming a saved state', async () => {
  const blocked = createDemoStore({ storage: { getItem() { throw new Error('blocked'); } }, clock });
  await assert.rejects(blocked.read(), /storage is unavailable/);
  await assert.rejects(blocked.reset(), /storage is unavailable/);
  const full = createDemoStore({ storage: {
    getItem() { return null; }, setItem() { throw new Error('quota'); },
  }, clock });
  await assert.rejects(full.read(), /could not be saved/);
  await assert.rejects(full.reset(), /could not be saved/);
});

test('corrupt saved data is preserved until an explicit manual reset', async () => {
  for (const raw of ['{broken', JSON.stringify({ version: 1, day: '2026-11-04', revision: 8, state: {} }),
    JSON.stringify({ version: 1, day: '9999-12-31', revision: 8, state: {} })]) {
    const storage = memoryStorage(raw);
    const store = createDemoStore({ storage, clock });
    await assert.rejects(store.read(), /Saved demo data is invalid/);
    await assert.rejects(store.save(createDemoState('2026-11-04'), 8), /Saved demo data is invalid/);
    assert.equal(storage.value(), raw);
    const restored = await store.reset();
    assert.equal(validateState(restored.state), true);
    assert.ok(restored.revision > 8);
    assert.deepEqual(await store.read(), restored);
  }
});

test('manual reset restores fictional samples and advances revision during clock rollback', async () => {
  const storage = memoryStorage();
  let now = clock();
  const store = createDemoStore({ storage, clock: () => now });
  const first = await store.read();
  const empty = await store.save(createInitialState(), first.revision);
  const reset = await store.reset();
  assert.equal(reset.revision, empty.revision + 1);
  assert.deepEqual(reset.state, createDemoState('2026-11-04'));
  now = new Date('2026-11-03T04:00:00Z');
  const again = await store.reset();
  assert.equal(again.revision, reset.revision + 1);
  assert.equal(JSON.parse(storage.value()).day, '2026-11-04');
});

test('failed edits and failed daily refresh leave the stored snapshot unchanged', async () => {
  const storage = memoryStorage();
  let now = clock();
  const store = createDemoStore({ storage, clock: () => now });
  const first = await store.read();
  const original = storage.value();
  await assert.rejects(store.save({}, first.revision), /Invalid demo habit data/);
  assert.equal(storage.value(), original);
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(store.save(first.state, first.revision), /could not be saved/);
  assert.equal(storage.value(), original);
  now = new Date('2026-11-05T04:00:00Z');
  await assert.rejects(store.read(), /could not be saved/);
  assert.equal(storage.value(), original);
});
