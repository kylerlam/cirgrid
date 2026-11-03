import {
  STORAGE_KEY, createInitialState, habitColor, isCompleted, migrateState,
  localDateKey, weekDates, shiftDate, formatWeekRange, toggleCompletion,
} from './model.js';
import { renderCircle, renderGrid } from './views.js';
import { createHabitEditor } from './editor.js';
import { request } from './api.js';
import { applyPreferences, getLanguage, t } from './preferences.js';
import { createSettings } from './settings.js';

const elements = Object.fromEntries(['habit-list', 'new-habit', 'week-range', 'previous-week', 'next-week',
  'selected-date', 'today', 'circle-tracker', 'grid-tracker', 'storage-error', 'status', 'migration-notice',
  'migrate-browser', 'download-browser'].map(id => [id, document.getElementById(id)]));
let state = createInitialState();
let revision = 0;
let selectedDate = localDateKey();
let pending = Promise.resolve();
const changes = typeof BroadcastChannel === 'function' ? new BroadcastChannel('cirgrid-server-state') : null;

function showError(message) {
  elements['storage-error'].textContent = t(message);
  elements['storage-error'].hidden = false;
}

function accept(snapshot) {
  state = snapshot.state === null ? createInitialState() : migrateState(snapshot.state);
  revision = snapshot.revision;
  elements['storage-error'].hidden = true;
  render();
}

function reportFailure(error) {
  if (error.status === 401) location.replace('/login');
  else if (error instanceof TypeError || error instanceof RangeError) elements.status.textContent = t(error.message);
  else showError(error.message);
}

function serialize(task) {
  const result = pending.then(task);
  pending = result.catch(() => {});
  return result;
}

async function write(transform) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = transform(state, revision);
    if (next === state) return next;
    try {
      const saved = await request('/api/state', { method: 'PUT', data: { state: next, revision } });
      accept(saved);
      changes?.postMessage(saved.revision);
      return state;
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
      accept(await request('/api/state'));
    }
  }
}

async function applyChange(transform, message) {
  try {
    const next = await serialize(() => write(transform));
    elements.status.textContent = typeof message === 'function' ? message(next) : t(message);
    return true;
  } catch (error) {
    reportFailure(error);
    return false;
  }
}

const editor = createHabitEditor({ getState: () => state, onChange: applyChange });

function toggle(habitId, dateKey) {
  const completed = !isCompleted(state, habitId, dateKey);
  const today = localDateKey();
  return applyChange(current => isCompleted(current, habitId, dateKey) === completed
    ? current : toggleCompletion(current, habitId, dateKey, today), next => {
    const habit = next.habits.find(item => item.id === habitId);
    if (!habit) return t('This habit no longer exists.');
    return t(completed ? '{0} checked in for {1}.' : '{0} check-in removed for {1}.', habit.name, dateKey);
  });
}

function renderHabits() {
  elements['habit-list'].replaceChildren();
  if (!state.habits.length) {
    const text = document.createElement('p');
    text.className = 'sidebar-empty';
    text.textContent = t('No habits yet.');
    elements['habit-list'].append(text);
    return;
  }
  state.habits.forEach(habit => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'habit-item';
    button.dataset.editHabit = habit.id;
    button.setAttribute('aria-label', t('Edit {0}', habit.name));
    const dot = document.createElement('span');
    dot.className = 'habit-dot';
    dot.style.backgroundColor = habitColor(habit).value;
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'habit-name';
    name.textContent = habit.name;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('icon');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-edit');
    icon.append(use);
    button.append(dot, name, icon);
    button.addEventListener('click', () => editor.open(habit.id));
    elements['habit-list'].append(button);
  });
}

function render() {
  const active = document.activeElement;
  const focus = active?.dataset?.view ? { view: active.dataset.view, habitId: active.dataset.habitId, date: active.dataset.date } : null;
  const editHabit = active?.dataset?.editHabit;
  const today = localDateKey();
  elements['selected-date'].value = selectedDate;
  elements['week-range'].textContent = formatWeekRange(selectedDate, getLanguage());
  const options = { state, dates: weekDates(selectedDate), selectedDate, today, onToggle: toggle };
  renderHabits();
  renderCircle(elements['circle-tracker'], options);
  renderGrid(elements['grid-tracker'], options);
  if (focus) {
    const cell = [...document.querySelectorAll('[data-view]')].find(node => node.dataset.view === focus.view && node.dataset.habitId === focus.habitId && node.dataset.date === focus.date);
    cell?.focus({ preventScroll: true });
  } else if (editHabit) {
    document.querySelector('[data-edit-habit="' + editHabit + '"]')?.focus({ preventScroll: true });
  }
}

function selectDate(dateKey) {
  try {
    weekDates(dateKey);
    selectedDate = dateKey;
    render();
    elements.status.textContent = t('Showing {0}.', formatWeekRange(selectedDate, getLanguage()));
  } catch (error) {
    elements['selected-date'].value = selectedDate;
    elements.status.textContent = t(error.message);
  }
}

function shiftWeek(offset) {
  try { selectDate(shiftDate(selectedDate, offset)); }
  catch (error) { elements.status.textContent = t(error.message); }
}

function mergeBackup(current, incoming, legacy) {
  const habits = current.habits.slice();
  let changed = false;
  const conflict = () => new Error('This backup conflicts with saved habits or check-ins. No records were changed.');
  for (const habit of incoming.habits) {
    const existing = habits.find(item => item.id === habit.id);
    if (!existing) {
      if (habits.some(item => item.name.toLowerCase() === habit.name.toLowerCase())) throw conflict();
      habits.push(habit);
      changed = true;
    } else if (!legacy && (existing.name !== habit.name || existing.color !== habit.color
      || existing.endDate !== habit.endDate || existing.stageGoal !== habit.stageGoal
      || Object.keys(existing.weeklyGoals).length !== Object.keys(habit.weeklyGoals).length
      || Object.entries(habit.weeklyGoals).some(([date, goal]) => existing.weeklyGoals[date] !== goal))) {
      throw conflict();
    }
  }
  const completions = { ...current.completions };
  for (const [date, records] of Object.entries(incoming.completions)) {
    const day = { ...completions[date] };
    for (const [id, value] of Object.entries(records)) {
      if (!legacy && Object.hasOwn(day, id) && day[id] !== value) throw conflict();
      if (!Object.hasOwn(day, id)) {
        day[id] = value;
        changed = true;
      }
    }
    completions[date] = day;
  }
  return changed ? { ...current, habits, completions } : current;
}

function importState(raw) {
  const incoming = migrateState(raw);
  return serialize(() => write((current, currentRevision) => currentRevision === 0
    ? incoming : mergeBackup(current, incoming, raw.version === 1)));
}

async function importFile(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file no larger than 10 MiB.');
  const format = /\.json$/i.test(file.name) ? 'json' : 'yaml';
  const result = await request('/api/import', { method: 'POST', data: { text: await file.text(), format } });
  await importState(result.state);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFile(format) {
  const response = await fetch('/api/export?format=' + format);
  if (!response.ok) {
    const body = await response.json();
    throw Object.assign(new Error(body.message), { status: response.status });
  }
  download(await response.blob(), 'cirgrid.' + (format === 'yaml' ? 'yml' : 'json'));
}

function offerBrowserMigration() {
  let original;
  const migrationKey = 'cirgrid.browser-imported';
  try {
    original = localStorage.getItem(STORAGE_KEY);
    if (original === null || localStorage.getItem(migrationKey) === original) return;
  } catch {
    return;
  }
  elements['migration-notice'].hidden = false;
  elements['download-browser'].addEventListener('click', () => download(new Blob([original], { type: 'application/json' }), 'cirgrid-browser-backup.json'));
  elements['migrate-browser'].addEventListener('click', async () => {
    const button = elements['migrate-browser'];
    button.disabled = true;
    try {
      await importState(JSON.parse(original));
      try { localStorage.setItem(migrationKey, original); } catch { /* The original remains available. */ }
      elements['migration-notice'].hidden = true;
      elements.status.textContent = t('Browser records imported.');
    } catch (error) {
      if (error instanceof SyntaxError) showError('The browser backup could not be read.');
      else reportFailure(error);
      button.disabled = false;
    }
  });
}

function refresh() {
  void serialize(async () => {
    const snapshot = await request('/api/state');
    if (snapshot.revision !== revision) accept(snapshot);
  }).catch(reportFailure);
}

function refreshAtMidnight() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  setTimeout(() => {
    render();
    refreshAtMidnight();
  }, midnight.getTime() - Date.now());
}

async function start() {
  applyPreferences();
  const session = await request('/api/session');
  if (!session.authenticated) {
    location.replace('/login');
    return;
  }
  const snapshot = await request('/api/state');
  const settings = createSettings({
    username: session.username, onImport: importFile, onDownload: exportFile,
    onSignOut: async () => {
      await request('/api/logout', { method: 'POST', data: {} });
      location.replace('/login');
      return 'Signed out.';
    },
  });
  document.getElementById('open-settings').addEventListener('click', settings.open);
  elements['new-habit'].addEventListener('click', () => editor.open());
  elements['previous-week'].addEventListener('click', () => shiftWeek(-7));
  elements['next-week'].addEventListener('click', () => shiftWeek(7));
  elements['today'].addEventListener('click', () => selectDate(localDateKey()));
  elements['selected-date'].addEventListener('change', event => selectDate(event.target.value));
  window.addEventListener('languagechange', render);
  window.addEventListener('focus', refresh);
  changes?.addEventListener('message', refresh);
  document.getElementById('app-shell').hidden = false;
  accept(snapshot);
  offerBrowserMigration();
  refreshAtMidnight();
}

start().catch(error => {
  if (error.status === 401) location.replace('/login');
  else {
    const startup = document.getElementById('startup-error');
    startup.textContent = t('CirGrid could not connect. Reload the page to try again.');
    startup.hidden = false;
  }
});
