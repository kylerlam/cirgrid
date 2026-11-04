import { isCompleted, isHabitActive, isLateCompletion, parseDateKey, shiftDate, weekDates } from './model.js';
import { historyPeriod } from './history-period.js';
import { getLanguage, t } from './preferences.js';

const arrowOffsets = { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 };

function historyStatus(state, habit, date, today) {
  if (date > today) return ['is-future', 'Future date'];
  if (isLateCompletion(state, habit.id, date)) return ['is-complete is-makeup', 'Backfilled'];
  if (isCompleted(state, habit.id, date)) return ['is-complete', 'Completed'];
  if (!isHabitActive(habit, date)) return ['is-ended', 'Stage ended'];
  return ['', 'Not checked in'];
}

export function renderHistory(container, { state, selectedDate, today, onSelectDate, onOpenWeek, unit = 'month', anchor = today }) {
  const select = container.querySelector('#history-habit');
  const heatmap = container.querySelector('#history-heatmap');
  const key = container.querySelector('#history-key');
  const detail = container.querySelector('#history-detail');
  const language = getLanguage();
  const period = historyPeriod(anchor, unit);
  const monthTitle = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long' });
  const fullDate = new Intl.DateTimeFormat(language, { dateStyle: 'full' });
  const title = new Intl.DateTimeFormat(language, unit === 'year' ? { year: 'numeric' } : { year: 'numeric', month: 'long' })
    .format(parseDateKey(period.start));
  container.querySelector('#history-range').textContent = title;

  const habit = state.habits.find(item => item.id === select.value) ?? state.habits[0];
  select.replaceChildren(...state.habits.map(item => new Option(item.name, item.id)));
  select.disabled = !habit;
  key.hidden = !habit;
  heatmap.replaceChildren();
  if (!habit) {
    detail.hidden = true;
    detail.replaceChildren();
    const empty = document.createElement('p');
    empty.textContent = t('No habits yet.');
    heatmap.append(empty);
    return;
  }
  select.value = habit.id;

  const detailDate = selectedDate >= period.start && selectedDate <= period.end ? selectedDate : anchor;
  const [detailClass, detailStatus] = historyStatus(state, habit, detailDate, today);
  let summary = detail.querySelector('.history-detail-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'history-detail-summary';
    summary.setAttribute('aria-live', 'polite');
    summary.setAttribute('aria-atomic', 'true');
    detail.append(summary);
  }
  const dateHeading = document.createElement('strong');
  dateHeading.id = 'history-detail-date';
  dateHeading.textContent = fullDate.format(parseDateKey(detailDate));
  const meta = document.createElement('div');
  meta.className = 'history-detail-meta';
  const name = document.createElement('span');
  name.textContent = habit.name;
  const mark = document.createElement('span');
  mark.className = 'heatmap-mark ' + detailClass;
  mark.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span');
  status.textContent = t(detailStatus);
  meta.append(name, mark, status);
  summary.replaceChildren(dateHeading, meta);
  let openWeek = detail.querySelector('button');
  if (!openWeek) {
    openWeek = document.createElement('button');
    openWeek.type = 'button';
    openWeek.className = 'button button-secondary';
    detail.append(openWeek);
  }
  openWeek.textContent = t('Open weekly tracker');
  openWeek.disabled = detailDate > today;
  openWeek.onclick = () => onOpenWeek(detailDate);
  detail.hidden = false;

  const periods = unit === 'year'
    ? Array.from({ length: 12 }, (_, index) => historyPeriod(period.start.slice(0, 4) + '-' + String(index + 1).padStart(2, '0') + '-01', 'month'))
    : [period];
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'short' });
  const buttons = new Map();
  const latest = today < period.end ? today : period.end;
  const tabDate = detailDate <= latest ? detailDate : latest;
  const calendars = document.createElement('div');
  calendars.className = 'history-calendars';
  calendars.dataset.unit = unit;

  for (const { start, end } of periods) {
    const section = document.createElement('section');
    section.className = 'history-month';
    const table = document.createElement('table');
    table.className = 'history-table';
    const caption = table.createCaption();
    caption.textContent = monthTitle.format(parseDateKey(start));
    if (unit !== 'year') caption.className = 'sr-only';
    const heading = table.createTHead().insertRow();
    for (const date of weekDates(start)) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = weekday.format(parseDateKey(date));
      heading.append(cell);
    }

    const leading = (parseDateKey(start).getDay() + 6) % 7;
    const days = parseDateKey(end).getDate();
    const slots = Math.ceil((leading + days) / 7) * 7;
    const body = table.createTBody();
    let row;
    for (let index = 0; index < slots; index += 1) {
      if (index % 7 === 0) row = body.insertRow();
      const cell = row.insertCell();
      const day = index - leading;
      if (day < 0 || day >= days) continue;
      const date = shiftDate(start, day);
      const [statusClass, statusText] = historyStatus(state, habit, date, today);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = statusClass ? 'heatmap-cell ' + statusClass : 'heatmap-cell';
      if (date === detailDate) button.className += ' is-selected';
      if (date === today) {
        button.className += ' is-today';
        button.setAttribute('aria-current', 'date');
      }
      Object.assign(button.dataset, { view: 'history', habitId: habit.id, date });
      button.disabled = date > today;
      button.tabIndex = date === tabDate && !button.disabled ? 0 : -1;
      button.title = t('{0}, {1}: {2}', habit.name, fullDate.format(parseDateKey(date)), t(statusText));
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(date === detailDate));
      button.setAttribute('aria-controls', 'history-detail');
      const label = document.createElement('span');
      label.className = 'history-day-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = parseDateKey(date).getDate();
      button.append(label);
      if (!button.disabled) {
        button.addEventListener('click', () => onSelectDate(date));
        buttons.set(date, button);
      }
      cell.append(button);
    }
    section.append(table);
    calendars.append(section);
  }

  const dates = [...buttons.keys()];
  calendars.addEventListener('focusin', event => {
    if (!event.target.matches('.heatmap-cell:not(:disabled)')) return;
    calendars.querySelector('[tabindex="0"]')?.setAttribute('tabindex', '-1');
    event.target.tabIndex = 0;
  });
  calendars.addEventListener('keydown', event => {
    if (!Object.hasOwn(arrowOffsets, event.key) || !event.target.matches('.heatmap-cell:not(:disabled)')) return;
    event.preventDefault();
    const nextDate = dates[dates.indexOf(event.target.dataset.date) + arrowOffsets[event.key]];
    buttons.get(nextDate)?.focus();
  });
  heatmap.append(calendars);
}
