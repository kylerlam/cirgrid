export const STORAGE_KEY = 'cirgrid.state.v1';

export const HABIT_COLORS = Object.freeze([
  { id: 'blue', label: 'Blue', value: '#2d68c4', soft: '#dbe6fa' },
  { id: 'yellow', label: 'Yellow', value: '#f3c83e', soft: '#fbf1cd' },
  { id: 'pink', label: 'Pink', value: '#e978ad', soft: '#f9dfec' },
  { id: 'sage', label: 'Sage', value: '#5c7664', soft: '#eaf0ec' },
  { id: 'purple', label: 'Purple', value: '#9c7bd1', soft: '#eee6f8' },
  { id: 'teal', label: 'Teal', value: '#429b9d', soft: '#deeff0' },
].map(Object.freeze));

const colorIds = new Set(HABIT_COLORS.map(color => color.id));
const reservedIds = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const isObject = value => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hasKeys = (value, keys) => isObject(value)
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)
  && !reservedIds.has(id);
const validName = name => typeof name === 'string' && name === name.trim()
  && name.length > 0 && name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name);

export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())
    || date.getFullYear() < 1 || date.getFullYear() > 9999) {
    throw new RangeError('Choose a valid calendar date.');
  }
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError('Choose a valid date in YYYY-MM-DD format.');
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, month - 1, day);
  if (year < 1 || year > 9999 || date.getFullYear() !== year
    || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError('Choose a valid calendar date.');
  }
  return date;
}

export function shiftDate(dateKey, days) {
  if (!Number.isSafeInteger(days)) throw new TypeError('Date offset must be a whole number.');
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function weekDates(dateKey) {
  const date = parseDateKey(dateKey);
  const monday = shiftDate(dateKey, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function formatWeekRange(dateKey) {
  const days = weekDates(dateKey);
  const start = parseDateKey(days[0]);
  const end = parseDateKey(days[6]);
  const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  if (start.getFullYear() !== end.getFullYear()) {
    return `${shortDate.format(start)}, ${start.getFullYear()} – ${shortDate.format(end)}, ${end.getFullYear()}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${shortDate.format(start)} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${shortDate.format(start)} – ${shortDate.format(end)}, ${end.getFullYear()}`;
}

export function createInitialState() {
  return {
    version: 1,
    habits: [
      { id: 'sunscreen', name: 'Sunscreen', color: 'blue' },
      { id: 'exercise', name: 'Exercise', color: 'yellow' },
      { id: 'reading', name: 'Reading', color: 'pink' },
    ],
    completions: {},
  };
}

export function validateState(value) {
  if (!hasKeys(value, ['version', 'habits', 'completions']) || value.version !== 1
    || !Array.isArray(value.habits) || !isObject(value.completions)) return false;
  const ids = new Set();
  const names = new Set();
  for (const habit of value.habits) {
    if (!hasKeys(habit, ['id', 'name', 'color']) || !validId(habit.id)
      || !validName(habit.name) || !colorIds.has(habit.color)
      || ids.has(habit.id) || names.has(habit.name.toLowerCase())) return false;
    ids.add(habit.id);
    names.add(habit.name.toLowerCase());
  }
  for (const [dateKey, records] of Object.entries(value.completions)) {
    try { parseDateKey(dateKey); } catch { return false; }
    if (!isObject(records) || Object.keys(records).length === 0
      || Object.entries(records).some(([id, completed]) => !ids.has(id) || completed !== true)) return false;
  }
  return true;
}

function requireHabit(state, habitId) {
  const habit = state.habits.find(item => item.id === habitId);
  if (!habit) throw new RangeError('This habit no longer exists.');
  return habit;
}

function normalizeHabit(state, values, exceptId) {
  const name = typeof values?.name === 'string' ? values.name.trim() : '';
  if (!validName(name)) throw new TypeError('Use a habit name between 1 and 60 characters.');
  if (!colorIds.has(values.color)) throw new TypeError('Choose one of the available habit colors.');
  if (state.habits.some(habit => habit.id !== exceptId
    && habit.name.toLowerCase() === name.toLowerCase())) {
    throw new TypeError('A habit with this name already exists.');
  }
  return { name, color: values.color };
}

export function isCompleted(state, habitId, dateKey) {
  return state.completions[dateKey]?.[habitId] === true;
}

export function toggleCompletion(state, habitId, dateKey) {
  requireHabit(state, habitId);
  parseDateKey(dateKey);
  const records = { ...state.completions[dateKey] };
  if (Object.hasOwn(records, habitId)) delete records[habitId];
  else records[habitId] = true;
  const completions = { ...state.completions };
  if (Object.keys(records).length) completions[dateKey] = records;
  else delete completions[dateKey];
  return { ...state, completions };
}

export function addHabit(state, values, id = globalThis.crypto.randomUUID()) {
  const habit = normalizeHabit(state, values);
  if (!validId(id) || state.habits.some(item => item.id === id)) {
    throw new TypeError('The habit identifier is invalid or already exists.');
  }
  return { ...state, habits: [...state.habits, { id, ...habit }] };
}

export function updateHabit(state, habitId, values) {
  requireHabit(state, habitId);
  const changes = normalizeHabit(state, values, habitId);
  return { ...state, habits: state.habits.map(habit => habit.id === habitId
    ? { ...habit, ...changes } : habit) };
}

export function deleteHabit(state, habitId) {
  requireHabit(state, habitId);
  const completions = {};
  for (const [dateKey, day] of Object.entries(state.completions)) {
    const remaining = { ...day };
    delete remaining[habitId];
    if (Object.keys(remaining).length) completions[dateKey] = remaining;
  }
  return { ...state, habits: state.habits.filter(habit => habit.id !== habitId), completions };
}

export function loadState(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch {
    throw new Error('Browser storage is unavailable. Allow storage to keep your habit records.');
  }
  if (raw === null) return createInitialState();
  let state;
  try { state = JSON.parse(raw); } catch {
    throw new Error('Saved habit data could not be read. Your existing data has not been changed.');
  }
  if (!validateState(state)) {
    throw new Error('Saved habit data is invalid or uses an unsupported version. Your existing data has not been changed.');
  }
  return state;
}

export function saveState(storage, state) {
  if (!validateState(state)) throw new TypeError('Invalid habit data cannot be saved.');
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {
    throw new Error('Your changes could not be saved. Browser storage may be full or unavailable.');
  }
}
