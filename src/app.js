import {
  HABIT_COLORS, STORAGE_KEY, createInitialState, loadState, saveState,
  localDateKey, weekDates, shiftDate, formatWeekRange, toggleCompletion,
} from './model.js';
import { renderCircle, renderGrid } from './views.js';
import { createHabitEditor } from './editor.js';

const elements = Object.fromEntries(['habit-list', 'new-habit', 'week-range', 'previous-week', 'next-week', 'selected-date', 'today', 'circle-tracker', 'grid-tracker', 'storage-error', 'status'].map(id => [id, document.getElementById(id)]));
let state = createInitialState();
let storageAvailable = true;
let selectedDate = localDateKey();

function showError(message) {
  elements['storage-error'].textContent = message;
  elements['storage-error'].hidden = false;
}

function readSavedState() {
  try {
    state = loadState(window.localStorage);
    storageAvailable = true;
    elements['storage-error'].hidden = true;
  } catch (error) {
    storageAvailable = false;
    showError(error.message);
  }
}

async function applyChange(transform, message) {
  if (!storageAvailable) {
    showError('Saved data could not be loaded. Reload after restoring browser storage; existing data has not been changed.');
    return false;
  }
  try {
    const write = () => {
      let current;
      try { current = loadState(window.localStorage); }
      catch (error) { storageAvailable = false; throw error; }
      const nextState = transform(current);
      saveState(window.localStorage, nextState);
      state = nextState;
      elements['storage-error'].hidden = true;
      render();
      elements.status.textContent = typeof message === 'function' ? message(nextState) : message;
      return true;
    };
    return navigator.locks?.request
      ? await navigator.locks.request('cirgrid-state-write', write)
      : write();
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) elements.status.textContent = error.message;
    else showError(error.message);
    return false;
  }
}

const editor = createHabitEditor({ getState: () => state, onChange: applyChange });

function toggle(habitId, dateKey) {
  return applyChange(current => toggleCompletion(current, habitId, dateKey), next => {
    const habit = next.habits.find(item => item.id === habitId);
    const completed = next.completions[dateKey]?.[habitId] === true;
    return habit.name + (completed ? ' checked in for ' : ' check-in removed for ') + dateKey + '.';
  });
}

function renderHabits() {
  elements['habit-list'].replaceChildren();
  if (!state.habits.length) {
    const text = document.createElement('p');
    text.className = 'sidebar-empty';
    text.textContent = 'No habits yet.';
    elements['habit-list'].append(text);
    return;
  }
  state.habits.forEach(habit => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'habit-item';
    button.dataset.editHabit = habit.id;
    button.setAttribute('aria-label', 'Edit ' + habit.name);
    const dot = document.createElement('span');
    dot.className = 'habit-dot';
    dot.style.backgroundColor = HABIT_COLORS.find(color => color.id === habit.color).value;
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
  const today = localDateKey();
  elements['selected-date'].value = selectedDate;
  elements['week-range'].textContent = formatWeekRange(selectedDate);
  const options = { state, dates: weekDates(selectedDate), selectedDate, today, onToggle: toggle };
  renderHabits();
  renderCircle(elements['circle-tracker'], options);
  renderGrid(elements['grid-tracker'], options);
  if (focus) {
    const cell = [...document.querySelectorAll('[data-view]')].find(node => node.dataset.view === focus.view && node.dataset.habitId === focus.habitId && node.dataset.date === focus.date);
    cell?.focus({ preventScroll: true });
  }
}

function selectDate(dateKey) {
  try {
    weekDates(dateKey);
    selectedDate = dateKey;
    render();
    elements.status.textContent = 'Showing ' + formatWeekRange(selectedDate) + '.';
  } catch (error) {
    elements['selected-date'].value = selectedDate;
    elements.status.textContent = error.message;
  }
}

function shiftWeek(offset) {
  try { selectDate(shiftDate(selectedDate, offset)); }
  catch (error) { elements.status.textContent = error.message; }
}

elements['new-habit'].addEventListener('click', () => editor.open());
elements['previous-week'].addEventListener('click', () => shiftWeek(-7));
elements['next-week'].addEventListener('click', () => shiftWeek(7));
elements['today'].addEventListener('click', () => selectDate(localDateKey()));
elements['selected-date'].addEventListener('change', event => selectDate(event.target.value));
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    readSavedState();
    render();
  }
});
readSavedState();
render();
