import { isCompleted, isHabitActive, isLateCompletion, parseDateKey, shiftDate, weekDates } from './model.js';
import { getLanguage, t } from './preferences.js';

const weekCount = 12;
const arrowOffsets = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

function historyStatus(state, habit, date) {
  if (isLateCompletion(state, habit.id, date)) return ['is-complete is-makeup', 'Backfilled'];
  if (isCompleted(state, habit.id, date)) return ['is-complete', 'Completed'];
  if (!isHabitActive(habit, date)) return ['is-ended', 'Stage ended'];
  return ['', 'Not checked in'];
}

function monthHeader(table, weeks, language) {
  const row = table.createTHead().insertRow();
  row.setAttribute('aria-hidden', 'true');
  row.insertCell();
  const format = new Intl.DateTimeFormat(language, { month: 'short' });
  let label;
  for (const [monday] of weeks) {
    const month = format.format(parseDateKey(monday));
    if (label?.textContent === month) label.colSpan += 1;
    else {
      label = row.insertCell();
      label.textContent = month;
    }
  }
}

export function renderHistory(container, { state, selectedDate, today, onSelectDate }) {
  const select = container.querySelector('#history-habit');
  const heatmap = container.querySelector('#history-heatmap');
  const key = container.querySelector('#history-key');
  const habit = state.habits.find(item => item.id === select.value) ?? state.habits[0];
  select.replaceChildren(...state.habits.map(item => new Option(item.name, item.id)));
  select.disabled = !habit;
  key.hidden = !habit;
  heatmap.replaceChildren();
  if (!habit) {
    const empty = document.createElement('p');
    empty.textContent = t('No habits yet.');
    heatmap.append(empty);
    return;
  }
  select.value = habit.id;

  const weeks = Array.from({ length: weekCount }, (_, index) => weekDates(shiftDate(today, 7 * (index + 1 - weekCount))));
  const language = getLanguage();
  const range = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  const fullDate = new Intl.DateTimeFormat(language, { dateStyle: 'full' });
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'short' });
  const table = document.createElement('table');
  table.className = 'history-table';
  table.createCaption().textContent = range.formatRange(parseDateKey(weeks[0][0]), parseDateKey(today));
  monthHeader(table, weeks, language);
  const body = table.createTBody();
  const buttons = new Map();
  const tabDate = selectedDate >= weeks[0][0] && selectedDate <= today ? selectedDate : today;
  for (let day = 0; day < 7; day += 1) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = weekday.format(parseDateKey(weeks[0][day]));
    row.append(heading);
    for (const week of weeks) {
      const date = week[day];
      const cell = row.insertCell();
      if (date > today) continue;
      const [statusClass, statusText] = historyStatus(state, habit, date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = statusClass ? 'heatmap-cell ' + statusClass : 'heatmap-cell';
      Object.assign(button.dataset, { view: 'history', habitId: habit.id, date });
      button.tabIndex = date === tabDate ? 0 : -1;
      button.title = t('{0}, {1}: {2}', habit.name, fullDate.format(parseDateKey(date)), t(statusText));
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => onSelectDate(date));
      cell.append(button);
      buttons.set(date, button);
    }
  }
  table.addEventListener('focusin', event => {
    if (!event.target.matches('.heatmap-cell')) return;
    table.querySelector('[tabindex="0"]').tabIndex = -1;
    event.target.tabIndex = 0;
  });
  table.addEventListener('keydown', event => {
    if (!Object.hasOwn(arrowOffsets, event.key) || !event.target.matches('.heatmap-cell')) return;
    event.preventDefault();
    const offset = arrowOffsets[event.key];
    const row = event.target.closest('tr').sectionRowIndex;
    if ((offset === -1 && row === 0) || (offset === 1 && row === 6)) return;
    const nextDate = shiftDate(event.target.dataset.date, offset);
    buttons.get(nextDate)?.focus();
  });
  heatmap.append(table);
}
