import {
  createInitialState, habitColor, isCompleted,
  weekDates, shiftDate, formatWeekRange, toggleCompletion, moveHabit,
} from './model.js';
import { renderCircle, renderGrid } from './views.js';
import { renderHistory } from './history.js';
import { historyPeriod, shiftHistoryPeriod } from './history-period.js';
import { createHabitEditor } from './editor.js';
import { createDemoStore, demoToday, DEMO_STORAGE_KEY } from './demo-store.js';
import { applyPreferences, getLanguage, t } from './preferences.js';
import { createSettings } from './settings.js';
import { createHabitReorder } from './reorder.js';

const elements = Object.fromEntries(['habit-list', 'new-habit', 'week-range', 'previous-week', 'next-week',
  'selected-date', 'today', 'circle-tracker', 'grid-tracker', 'storage-error', 'status', 'reset-demo',
  'tracker', 'habit-history', 'history-habit', 'history-unit',
  'history-date', 'history-previous', 'history-next', 'history-current'].map(id => [id, document.getElementById(id)]));
const store = createDemoStore();
let state = createInitialState();
let revision = 0;
let selectedDate = demoToday();
let historyUnit = 'month';
let historyAnchor = demoToday();
let pending = Promise.resolve();
const changes = typeof BroadcastChannel === 'function' ? new BroadcastChannel('cirgrid-demo-state') : null;

function showError(message) {
  elements['storage-error'].textContent = t(message);
  elements['storage-error'].hidden = false;
}

function accept(snapshot) {
  state = snapshot.state;
  revision = snapshot.revision;
  elements['storage-error'].hidden = true;
  render();
}

function reportFailure(error) {
  if (error instanceof TypeError || error instanceof RangeError) elements.status.textContent = t(error.message);
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
      const saved = await store.save(next, revision);
      accept(saved);
      changes?.postMessage(saved.revision);
      return state;
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
      accept(await store.read());
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

const editor = createHabitEditor({ getState: () => state, getToday: demoToday, onChange: applyChange });
const habitOrder = createHabitReorder(elements['habit-list'], {
  onDrop: async (habitId, beforeId) => {
    if (!await applyChange(current => moveHabit(current, habitId, beforeId), 'Habit order saved.')) render();
    document.querySelector('[data-edit-habit="' + habitId + '"]')?.focus({ preventScroll: true });
  },
  onCancel: () => { render(); elements.status.textContent = ''; },
  onUnlock: () => { elements.status.textContent = t('Drag to reorder. Release to save; Escape to cancel.'); },
});

function toggle(habitId, dateKey) {
  const completed = !isCompleted(state, habitId, dateKey);
  const today = demoToday();
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
    button.title = t('Hold for 0.3 seconds to drag. Alt+Up or Alt+Down also reorders.');
    button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
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

function showPage(focus = false) {
  const history = location.hash === '#habit-history';
  elements.tracker.hidden = history;
  elements['habit-history'].hidden = !history;
  const title = document.getElementById('page-title');
  title.dataset.i18n = history ? 'Habit history' : 'Weekly tracker';
  title.textContent = t(title.dataset.i18n);
  const pageTitle = document.querySelector('title');
  pageTitle.dataset.i18n = 'Demo';
  pageTitle.textContent = 'CirGrid — ' + t(pageTitle.dataset.i18n);
  for (const link of document.querySelectorAll('.navigation .nav-item')) {
    const active = link.hash === (history ? '#habit-history' : '#tracker');
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (focus) {
    (history ? title : elements['week-range']).focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
}

function render() {
  habitOrder.cancel();
  const active = document.activeElement;
  const focus = active?.dataset?.view ? { view: active.dataset.view, habitId: active.dataset.habitId, date: active.dataset.date } : null;
  const editHabit = active?.dataset?.editHabit;
  const today = demoToday();
  elements['selected-date'].value = selectedDate;
  elements['week-range'].textContent = formatWeekRange(selectedDate, getLanguage());
  const options = { state, dates: weekDates(selectedDate), selectedDate, today, onToggle: toggle };
  renderHabits();
  renderCircle(elements['circle-tracker'], options);
  renderGrid(elements['grid-tracker'], options);
  elements['history-unit'].value = historyUnit;
  elements['history-date'].value = historyAnchor;
  elements['history-date'].max = today;
  for (const [id, offset] of [['history-previous', -1], ['history-next', 1]]) {
    try {
      const next = shiftHistoryPeriod(historyAnchor, historyUnit, offset);
      elements[id].disabled = historyPeriod(next, historyUnit).start > today;
    } catch {
      elements[id].disabled = true;
    }
  }
  renderHistory(elements['habit-history'], {
    state, selectedDate: historyAnchor, today, unit: historyUnit, anchor: historyAnchor,
    onSelectDate: selectHistoryDate, onOpenWeek: jumpToWeek,
  });
  showPage();
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

function jumpToWeek(dateKey) {
  selectDate(dateKey);
  location.hash = '#tracker';
  showPage();
  const heading = elements['week-range'];
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start' });
}

function selectHistoryDate(dateKey) {
  try {
    historyPeriod(dateKey, historyUnit);
    if (dateKey > demoToday()) throw new RangeError('Choose a date on or before today.');
    historyAnchor = dateKey;
    elements.status.textContent = '';
    render();
  } catch (error) {
    elements['history-date'].value = historyAnchor;
    elements.status.textContent = t(error.message);
  }
}

function shiftWeek(offset) {
  try { selectDate(shiftDate(selectedDate, offset)); }
  catch (error) { elements.status.textContent = t(error.message); }
}

function refresh() {
  void serialize(async () => {
    const snapshot = await store.read();
    if (snapshot.revision !== revision) {
      accept(snapshot);
      changes?.postMessage(snapshot.revision);
    }
  }).catch(reportFailure);
}

function refreshAtMidnight() {
  const hongKong = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const midnight = Date.UTC(hongKong.getUTCFullYear(), hongKong.getUTCMonth(), hongKong.getUTCDate() + 1)
    - 8 * 60 * 60 * 1000;
  setTimeout(() => {
    refresh();
    refreshAtMidnight();
  }, midnight - Date.now());
}

async function resetDemo() {
  const button = elements['reset-demo'];
  button.disabled = true;
  try {
    await serialize(async () => {
      const snapshot = await store.reset();
      accept(snapshot);
      changes?.postMessage(snapshot.revision);
    });
    elements.status.textContent = t('Sample data reset.');
  } catch (error) {
    reportFailure(error);
  } finally {
    button.disabled = false;
  }
}

async function start() {
  applyPreferences();
  const settings = createSettings();
  document.getElementById('open-settings').addEventListener('click', settings.open);
  elements['new-habit'].addEventListener('click', () => editor.open());
  elements['reset-demo'].addEventListener('click', resetDemo);
  elements['previous-week'].addEventListener('click', () => shiftWeek(-7));
  elements['next-week'].addEventListener('click', () => shiftWeek(7));
  elements['today'].addEventListener('click', () => selectDate(demoToday()));
  elements['selected-date'].addEventListener('change', event => selectDate(event.target.value));
  elements['history-habit'].addEventListener('change', render);
  elements['history-unit'].addEventListener('change', event => {
    historyUnit = event.target.value;
    render();
  });
  elements['history-date'].addEventListener('change', event => selectHistoryDate(event.target.value));
  for (const [id, offset] of [['history-previous', -1], ['history-next', 1]]) {
    elements[id].addEventListener('click', () => selectHistoryDate(shiftHistoryPeriod(historyAnchor, historyUnit, offset)));
  }
  elements['history-current'].addEventListener('click', () => selectHistoryDate(demoToday()));
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('main-content').focus();
  });
  window.addEventListener('hashchange', () => showPage(true));
  window.addEventListener('languagechange', render);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('storage', event => {
    if (event.key === DEMO_STORAGE_KEY) refresh();
  });
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 60_000);
  changes?.addEventListener('message', refresh);
  document.getElementById('app-shell').hidden = false;
  try { accept(await store.read()); }
  catch (error) {
    render();
    reportFailure(error);
  }
  refreshAtMidnight();
}

start().catch(() => {
  const startup = document.getElementById('startup-error');
  startup.textContent = t('Demo data could not be loaded. Check browser storage and reload.');
  startup.hidden = false;
});
