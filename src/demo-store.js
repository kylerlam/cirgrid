import { parseDateKey, validateState } from './model.js';
import { createDemoState } from './demo-samples.js';

export { createDemoState } from './demo-samples.js';
export const DEMO_STORAGE_KEY = 'cirgrid.demo.state.v1';

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function demoToday(date = new Date()) {
  const parts = Object.fromEntries(calendar.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

function validDay(day) {
  try { parseDateKey(day); return true; }
  catch { return false; }
}

function invalidData() {
  return new Error('Saved demo data is invalid. Reset sample data to restore the demo.');
}

function decode(raw) {
  let value;
  try { value = JSON.parse(raw); }
  catch { throw invalidData(); }
  if (!value || Object.keys(value).length !== 4 || value.version !== 1
    || !validDay(value.day) || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !validateState(value.state)) throw invalidData();
  return value;
}

export function createDemoStore({ storage, clock = () => new Date(), locks } = {}) {
  let observedRevision = 0;

  function readRaw() {
    try { return (storage === undefined ? globalThis.localStorage : storage).getItem(DEMO_STORAGE_KEY); }
    catch { throw new Error('Demo browser storage is unavailable. Allow storage to keep your changes.'); }
  }

  function persist(value) {
    if (!Number.isSafeInteger(value.revision)) throw new Error('The demo revision cannot be advanced.');
    try {
      (storage === undefined ? globalThis.localStorage : storage).setItem(DEMO_STORAGE_KEY, JSON.stringify(value));
    } catch {
      throw new Error('Your demo changes could not be saved. Browser storage may be full or unavailable.');
    }
    observedRevision = value.revision;
    return value;
  }

  function latest() {
    const raw = readRaw();
    const value = raw === null ? null : decode(raw);
    const today = demoToday(clock());
    if (value && value.day >= today) {
      observedRevision = value.revision;
      return value;
    }
    return persist({ version: 1, day: today, revision: (value?.revision ?? 0) + 1, state: createDemoState(today) });
  }

  function transact(action) {
    const manager = locks === undefined ? globalThis.navigator?.locks : locks;
    const operation = () => {
      const { state, revision } = action();
      return { state, revision };
    };
    return manager?.request ? manager.request(DEMO_STORAGE_KEY, operation) : Promise.resolve().then(operation);
  }

  return {
    read() { return transact(latest); },
    save(state, expectedRevision) {
      return transact(() => {
        if (!validateState(state)) throw new Error('Invalid demo habit data cannot be saved.');
        const current = latest();
        if (current.revision !== expectedRevision) {
          throw Object.assign(new Error('Demo data changed in another tab. Try again.'), { status: 409 });
        }
        return persist({ ...current, state, revision: current.revision + 1 });
      });
    },
    reset() {
      return transact(() => {
        const raw = readRaw();
        let previous;
        let recoveredRevision;
        try { previous = raw === null ? null : decode(raw); }
        catch {
          try { recoveredRevision = JSON.parse(raw)?.revision; }
          catch { recoveredRevision = undefined; }
        }
        const date = clock();
        const today = demoToday(date);
        const day = previous?.day > today ? previous.day : today;
        const revision = previous?.revision ?? (Number.isSafeInteger(recoveredRevision) && recoveredRevision >= 1
          ? recoveredRevision : Math.max(observedRevision, date.getTime()));
        return persist({ version: 1, day, revision: revision + 1, state: createDemoState(day) });
      });
    },
  };
}
