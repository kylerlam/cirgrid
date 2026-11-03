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
const customColor = /^#[0-9a-f]{6}$/;
const defaultGoal = 5;
const firstWeek = '0001-01-01';
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
const validColor = color => colorIds.has(color) || (typeof color === 'string' && customColor.test(color));
const validGoal = goal => Number.isInteger(goal) && goal >= 1 && goal <= 7;
const validStageGoal = goal => typeof goal === 'string' && goal === goal.trim()
  && goal.length <= 120 && !/[\u0000-\u001f\u007f]/.test(goal);

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

function weekStart(dateKey) {
  const date = parseDateKey(dateKey);
  return shiftDate(dateKey, -((date.getDay() + 6) % 7));
}

export function weekDates(dateKey) {
  const monday = weekStart(dateKey);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function formatWeekRange(dateKey, locale = 'en-US') {
  const days = weekDates(dateKey);
  const start = parseDateKey(days[0]);
  const end = parseDateKey(days[6]);
  if (locale !== 'en-US' && locale !== 'en') {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' })
      .formatRange(start, end);
  }
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
    version: 2,
    habits: [
      { id: 'sunscreen', name: 'Sunscreen', color: 'blue' },
      { id: 'exercise', name: 'Exercise', color: 'yellow' },
      { id: 'reading', name: 'Reading', color: 'pink' },
    ].map(habit => ({ ...habit, weeklyGoals: { [firstWeek]: defaultGoal }, endDate: '', stageGoal: '' })),
    completions: {},
  };
}

export function validateState(value) {
  return validateVersion(value, 2);
}

function validateVersion(value, version) {
  if (!hasKeys(value, ['version', 'habits', 'completions']) || value.version !== version
    || !Array.isArray(value.habits) || !isObject(value.completions)) return false;
  const legacy = version === 1;
  const habitKeys = legacy ? ['id', 'name', 'color'] : ['id', 'name', 'color', 'weeklyGoals', 'endDate', 'stageGoal'];
  const ids = new Set();
  const names = new Set();
  for (const habit of value.habits) {
    if (!hasKeys(habit, habitKeys) || !validId(habit.id)
      || !validName(habit.name) || !(legacy ? colorIds.has(habit.color) : validColor(habit.color))
      || ids.has(habit.id) || names.has(habit.name.toLowerCase())) return false;
    if (!legacy) {
      const { weeklyGoals, endDate, stageGoal } = habit;
      if (!isObject(weeklyGoals) || !Object.hasOwn(weeklyGoals, firstWeek)
        || !validStageGoal(stageGoal) || (stageGoal && !endDate)) return false;
      try {
        if (endDate !== '') parseDateKey(endDate);
        if (Object.entries(weeklyGoals).some(([week, goal]) => !validGoal(goal)
          || parseDateKey(week).getDay() !== 1)) return false;
      } catch { return false; }
    }
    ids.add(habit.id);
    names.add(habit.name.toLowerCase());
  }
  for (const [dateKey, records] of Object.entries(value.completions)) {
    try { parseDateKey(dateKey); } catch { return false; }
    if (!isObject(records) || Object.keys(records).length === 0
      || Object.entries(records).some(([id, completed]) => !ids.has(id)
        || (completed !== true && (legacy || completed !== 'late')))) return false;
  }
  return true;
}

export function migrateState(state) {
  if (validateState(state)) return state;
  if (!validateVersion(state, 1)) {
    throw new Error('Saved habit data is invalid or uses an unsupported version. Your existing data has not been changed.');
  }
  return {
    ...state,
    version: 2,
    habits: state.habits.map(habit => ({ ...habit, weeklyGoals: { [firstWeek]: defaultGoal }, endDate: '', stageGoal: '' })),
  };
}

function requireHabit(state, habitId) {
  const habit = state.habits.find(item => item.id === habitId);
  if (!habit) throw new RangeError('This habit no longer exists.');
  return habit;
}

function normalizeHabit(state, values, previous) {
  const name = typeof values?.name === 'string' ? values.name.trim() : '';
  if (!validName(name)) throw new TypeError('Use a habit name between 1 and 60 characters.');
  const color = typeof values.color === 'string' ? values.color.toLowerCase() : values.color;
  if (!validColor(color)) throw new TypeError('Choose a preset or a valid custom color.');
  if (state.habits.some(habit => habit.id !== previous?.id
    && habit.name.toLowerCase() === name.toLowerCase())) {
    throw new TypeError('A habit with this name already exists.');
  }
  const endDate = values.endDate === undefined ? previous?.endDate ?? '' : values.endDate;
  if (endDate !== '') parseDateKey(endDate);
  let stageGoal = values.stageGoal === undefined ? previous?.stageGoal ?? '' : values.stageGoal;
  if (typeof stageGoal === 'string') stageGoal = stageGoal.trim();
  if (!validStageGoal(stageGoal)) throw new TypeError('Use a stage goal up to 120 characters.');
  return { name, color, endDate, stageGoal: endDate ? stageGoal : '' };
}

export function habitColor(habit) {
  return HABIT_COLORS.find(color => color.id === habit.color)
    ?? { value: habit.color, soft: `color-mix(in srgb, ${habit.color} 22%, var(--surface, #fff))` };
}

export function isHabitActive(habit, dateKey) {
  return habit.endDate === '' || dateKey <= habit.endDate;
}

export function weeklyGoal(habit, dateKey) {
  const week = weekStart(dateKey);
  const effectiveWeek = Object.keys(habit.weeklyGoals).sort().findLast(start => start <= week);
  return habit.weeklyGoals[effectiveWeek];
}

export function weeklyProgress(state, habit, dates, today) {
  const completed = dates.filter(date => isCompleted(state, habit.id, date)).length;
  const goal = weeklyGoal(habit, dates[0]);
  const status = completed >= goal ? 'met' : dates.at(-1) < today ? 'missed' : 'pending';
  return { completed, goal, status };
}

export function isCompleted(state, habitId, dateKey) {
  return Object.hasOwn(state.completions[dateKey] ?? {}, habitId);
}

export function isLateCompletion(state, habitId, dateKey) {
  return state.completions[dateKey]?.[habitId] === 'late';
}

export function toggleCompletion(state, habitId, dateKey, today = localDateKey()) {
  const habit = requireHabit(state, habitId);
  const week = weekStart(dateKey);
  const currentWeek = weekStart(today);
  const records = { ...state.completions[dateKey] };
  if (Object.hasOwn(records, habitId)) delete records[habitId];
  else {
    if (!isHabitActive(habit, dateKey)) throw new RangeError('This habit has ended.');
    records[habitId] = week < currentWeek ? 'late' : true;
  }
  const completions = { ...state.completions };
  if (Object.keys(records).length) completions[dateKey] = records;
  else delete completions[dateKey];
  return { ...state, completions };
}

const createHabitId = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),
  byte => byte.toString(16).padStart(2, '0')).join('');

export function addHabit(state, values, id = createHabitId()) {
  const habit = normalizeHabit(state, values);
  if (!validId(id) || state.habits.some(item => item.id === id)) {
    throw new TypeError('The habit identifier is invalid or already exists.');
  }
  const goal = values.weeklyGoal === undefined ? defaultGoal : values.weeklyGoal;
  if (!validGoal(goal)) throw new TypeError('Choose a weekly goal between 1 and 7 days.');
  return { ...state, habits: [...state.habits, { id, ...habit, weeklyGoals: { [firstWeek]: goal } }] };
}

export function updateHabit(state, habitId, values, today = localDateKey()) {
  const previous = requireHabit(state, habitId);
  const changes = normalizeHabit(state, values, previous);
  let weeklyGoals = previous.weeklyGoals;
  if (values.weeklyGoal !== undefined) {
    if (!validGoal(values.weeklyGoal)) throw new TypeError('Choose a weekly goal between 1 and 7 days.');
    if (values.weeklyGoal !== weeklyGoal(previous, today)) {
      weeklyGoals = { ...weeklyGoals, [weekStart(today)]: values.weeklyGoal };
    }
  }
  return { ...state, habits: state.habits.map(habit => habit.id === habitId
    ? { ...habit, ...changes, weeklyGoals } : habit) };
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
