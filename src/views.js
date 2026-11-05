import { habitColor, isCompleted, isHabitActive, isLateCompletion, parseDateKey, weeklyProgress } from './model.js';
import { getLanguage, t } from './preferences.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const circleObservers = new WeakMap();
const weekdayFormat = () => new Intl.DateTimeFormat(getLanguage(), { weekday: 'short' });
const fullDateFormat = () => new Intl.DateTimeFormat(getLanguage(), {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function cellAttributes(node, view, habit, dateKey, { completed, late, canMakeUp, canToggle, formatDate }) {
  node.dataset.view = view;
  node.dataset.habitId = habit.id;
  node.dataset.date = dateKey;
  const status = late ? 'Made up' : completed ? 'Completed' : canMakeUp ? 'Make up' : canToggle ? 'Not checked in'
    : dateKey < habit.startDate ? 'Not started' : 'Stage ended';
  node.setAttribute('aria-label', t('{0}, {1}: {2}', habit.name, formatDate.format(parseDateKey(dateKey)), t(status)));
  node.setAttribute('aria-pressed', String(completed));
}

function habitsForWeek(state, dates, today) {
  const pastWeek = dates.at(-1) < today;
  return state.habits.filter(habit => {
    if (!pastWeek && habit.endDate && today > habit.endDate) return false;
    return dates.some(date => isHabitActive(habit, date) || isCompleted(state, habit.id, date));
  });
}

function checkMark(x, y, size) {
  return svgElement('path', {
    d: `M ${x - size * .4} ${y} l ${size * .27} ${size * .3} l ${size * .54} ${-size * .65}`,
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none',
  });
}

export function renderCircle(container, { state, dates, selectedDate, today, onToggle }) {
  circleObservers.get(container)?.disconnect();
  container.classList.add('circular-view');
  container.replaceChildren();
  const habits = habitsForWeek(state, dates, today);
  if (!habits.length) {
    container.append(element('p', 'chart-empty', t(state.habits.length ? 'No active habits this week.' : 'Add a habit to start your week.')));
    return;
  }

  const svg = svgElement('svg', {
    class: 'circle-svg', role: 'group', 'aria-label': t('Circular habit tracker. The outer ring is the first habit.'),
    xmlns: SVG_NS,
  });
  const legend = element('div', 'habit-legend');
  habits.forEach((habit, index) => {
    const item = element('span', 'legend-item');
    const dot = element('span', 'habit-dot');
    dot.style.backgroundColor = habitColor(habit).value;
    dot.setAttribute('aria-hidden', 'true');
    let position = t('Ring {0}', index + 1);
    if (index === 0) position = t(habits.length === 1 ? 'Ring' : 'Outer');
    else if (index === habits.length - 1) position = t('Inner');
    else if (habits.length === 3) position = t('Middle');
    item.append(dot, element('span', 'habit-name', t('{0}: {1}', position, habit.name)));
    legend.append(item);
  });
  container.append(svg, legend);
  let lastSize = 0;

  function draw() {
    const size = Math.min(container.clientWidth || 420, 520);
    if (size === lastSize) return;
    lastSize = size;
    const focused = document.activeElement?.dataset;
    const restore = focused?.view === 'circle' && container.contains(document.activeElement)
      ? { habitId: focused.habitId, date: focused.date } : null;
    const center = size / 2;
    const radius = center - 39;
    const innerRadius = Math.max(24, radius * .29);
    const band = (radius - innerRadius) / habits.length;
    const radialGap = Math.min(2, band * .1);
    const sectorAngle = Math.PI * 2 / dates.length;
    const point = (r, angle) => [center + r * Math.sin(angle), center - r * Math.cos(angle)];
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.replaceChildren();
    const outline = svgElement('path', { class: 'circle-outline', 'aria-hidden': 'true' });
    const formatWeekday = weekdayFormat();
    const formatDate = fullDateFormat();
    const pastWeek = dates.at(-1) < today;

    habits.forEach((habit, habitIndex) => {
      const palette = habitColor(habit);
      dates.forEach((dateKey, dayIndex) => {
        const completed = isCompleted(state, habit.id, dateKey);
        const late = isLateCompletion(state, habit.id, dateKey);
        const canToggle = completed || isHabitActive(habit, dateKey);
        const canMakeUp = pastWeek && canToggle && !completed;
        const outer = radius - habitIndex * band - radialGap;
        const inner = radius - (habitIndex + 1) * band + radialGap;
        const start = dayIndex * sectorAngle + .012;
        const end = (dayIndex + 1) * sectorAngle - .012;
        const a = point(outer, start), b = point(outer, end);
        const c = point(inner, end), d = point(inner, start);
        const path = svgElement('path', {
          class: `circle-cell${late ? ' is-makeup' : ''}`,
          d: `M ${a} A ${outer} ${outer} 0 0 1 ${b} L ${c} A ${inner} ${inner} 0 0 0 ${d} Z`,
          fill: completed ? palette.soft : 'var(--pending-cell, #eff1f3)',
          role: 'button', tabindex: canToggle ? '0' : '-1',
        });
        cellAttributes(path, 'circle', habit, dateKey, { completed, late, canToggle, canMakeUp, formatDate });
        if (canToggle) {
          path.addEventListener('focus', () => {
            outline.setAttribute('d', path.getAttribute('d'));
            outline.classList.toggle('is-makeup', late);
          });
          path.addEventListener('blur', () => outline.removeAttribute('d'));
          path.addEventListener('click', () => {
            path.focus({ preventScroll: true });
            onToggle(habit.id, dateKey);
          });
          path.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle(habit.id, dateKey);
            }
          });
        } else {
          path.setAttribute('aria-disabled', 'true');
        }
        svg.append(path);
        if (completed) {
          const [x, y] = point((inner + outer) / 2, (start + end) / 2);
          const check = checkMark(x, y, Math.min(16, band * .53));
          check.setAttribute('class', 'circle-check');
          check.setAttribute('aria-hidden', 'true');
          svg.append(check);
        }
      });
    });
    const todayIndex = dates.indexOf(today);
    if (todayIndex !== -1) {
      const outer = radius + 1;
      const inner = innerRadius - 1;
      const start = todayIndex * sectorAngle;
      const end = (todayIndex + 1) * sectorAngle;
      const corner = 8;
      const a = point(outer, start + corner / outer), b = point(outer, end - corner / outer);
      const c = point(outer - corner, end), d = point(inner + corner, end);
      const e = point(inner, end - corner / inner), f = point(inner, start + corner / inner);
      const g = point(inner + corner, start), h = point(outer - corner, start);
      const shape = `M ${a} A ${outer} ${outer} 0 0 1 ${b} Q ${point(outer, end)} ${c} L ${d} Q ${point(inner, end)} ${e} A ${inner} ${inner} 0 0 0 ${f} Q ${point(inner, start)} ${g} L ${h} Q ${point(outer, start)} ${a} Z`;
      const shadow = svgElement('filter', {
        id: 'today-sector-shadow', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: size, height: size,
        'color-interpolation-filters': 'sRGB',
      });
      shadow.append(
        svgElement('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 2.5, result: 'blur' }),
        svgElement('feOffset', { in: 'blur', dx: 2, result: 'offset' }),
        svgElement('feComposite', { in: 'offset', in2: 'SourceAlpha', operator: 'out', result: 'outside' }),
        svgElement('feFlood', { 'flood-color': 'var(--today-shadow-color)', result: 'color' }),
        svgElement('feComposite', { in: 'color', in2: 'outside', operator: 'in' }),
      );
      const definitions = svgElement('defs');
      definitions.append(shadow);
      svg.append(definitions, svgElement('path', {
        d: shape, fill: '#000', filter: 'url(#today-sector-shadow)',
        'aria-hidden': 'true', 'pointer-events': 'none',
      }));
      svg.append(svgElement('path', {
        class: 'circle-today-outline', 'aria-hidden': 'true',
        d: shape,
      }));
    }
    svg.append(outline);

    dates.forEach((dateKey, index) => {
      const date = parseDateKey(dateKey);
      const [x, y] = point(radius + 24, (index + .5) * sectorAngle);
      const label = svgElement('text', {
        class: `circle-date-label${dateKey === today ? ' is-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}`,
        x, y: y - 8, 'text-anchor': 'middle', 'font-size': 14,
        fill: 'var(--muted-text, #6d7783)', 'pointer-events': 'none',
      });
      const weekday = svgElement('tspan', { x, dy: 0 });
      weekday.textContent = formatWeekday.format(date);
      const day = svgElement('tspan', { x, dy: 19 });
      day.textContent = date.getDate();
      label.append(weekday, day);
      svg.append(label);
    });
    const centerTitle = svgElement('text', {
      class: 'circle-center-title', x: center, y: center - 3, 'text-anchor': 'middle',
      fill: 'var(--text, #252a30)',
    });
    centerTitle.textContent = t('7 days');
    svg.append(centerTitle);
    if (restore) {
      const cell = [...svg.querySelectorAll('[data-habit-id]')].find(node =>
        node.dataset.habitId === restore.habitId && node.dataset.date === restore.date);
      cell?.focus({ preventScroll: true });
    }
  }

  draw();
  const observer = new ResizeObserver(draw);
  observer.observe(container);
  circleObservers.set(container, observer);
}

export function renderGrid(container, { state, dates, selectedDate, today, onToggle }) {
  container.classList.add('grid-view');
  container.replaceChildren();
  const habits = habitsForWeek(state, dates, today);
  if (!habits.length) {
    container.append(element('p', 'chart-empty', t(state.habits.length ? 'No active habits this week.' : 'Add a habit to start your week.')));
    return;
  }

  const formatWeekday = weekdayFormat();
  const formatDate = fullDateFormat();
  const formatStageEnd = new Intl.DateTimeFormat(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' });
  const pastWeek = dates.at(-1) < today;
  const scroll = element('div', 'grid-scroll');
  const table = element('table', 'habit-grid');
  table.setAttribute('aria-label', t('Weekly habit grid'));
  const head = element('thead');
  const headingRow = element('tr');
  const habitHeading = element('th', 'grid-habit-heading', t('Habit'));
  habitHeading.scope = 'col';
  headingRow.append(habitHeading);
  dates.forEach(dateKey => {
    const date = parseDateKey(dateKey);
    const heading = element('th', `grid-date-header${dateKey === today ? ' is-today grid-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}`);
    heading.scope = 'col';
    if (dateKey === today) heading.setAttribute('aria-current', 'date');
    heading.append(element('span', 'grid-weekday', formatWeekday.format(date)), element('span', 'grid-day', date.getDate()));
    headingRow.append(heading);
  });
  const progressHeading = element('th', 'grid-progress-heading', t('Goal'));
  progressHeading.scope = 'col';
  headingRow.append(progressHeading);
  head.append(headingRow);
  const body = element('tbody');
  habits.forEach(habit => {
    const row = element('tr');
    const heading = element('th', 'habit-row-label');
    heading.scope = 'row';
    const name = element('span', 'habit-row-name');
    const dot = element('span', 'habit-dot');
    dot.style.backgroundColor = habitColor(habit).value;
    dot.setAttribute('aria-hidden', 'true');
    name.append(dot, element('span', 'habit-name', habit.name));
    heading.append(name);
    if (habit.endDate) {
      heading.append(element('span', 'stage-end', t('Ends {0}', formatStageEnd.format(parseDateKey(habit.endDate)))));
      if (habit.stageGoal) {
        const stage = element('span', 'stage-goal', habit.stageGoal);
        stage.title = habit.stageGoal;
        heading.append(stage);
      }
    }
    row.append(heading);
    dates.forEach(dateKey => {
      const completed = isCompleted(state, habit.id, dateKey);
      const late = isLateCompletion(state, habit.id, dateKey);
      const canToggle = completed || isHabitActive(habit, dateKey);
      const canMakeUp = pastWeek && canToggle && !completed;
      const cell = element('td', dateKey === today ? 'grid-today' : '');
      const button = element('button', `check-cell${completed ? ' is-complete' : ''}${late ? ' is-makeup' : ''}`);
      button.type = 'button';
      button.disabled = !canToggle;
      cellAttributes(button, 'grid', habit, dateKey, { completed, late, canToggle, canMakeUp, formatDate });
      button.addEventListener('click', () => onToggle(habit.id, dateKey));
      if (canMakeUp) button.dataset.hint = t('Make up');
      if (completed) {
        const check = svgElement('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' });
        check.append(checkMark(10, 10, 12));
        button.append(check);
      }
      cell.append(button);
      row.append(cell);
    });
    const { completed, goal, status } = weeklyProgress(state, habit, dates, today);
    const progress = element('td', 'grid-progress');
    const label = element('span', 'progress-score', status === 'inactive' ? '—' : `${completed}/${goal}`);
    const statusText = status === 'inactive' ? t(dates.at(-1) < habit.startDate ? 'Not started' : 'Stage ended')
      : status === 'met' ? t('Goal reached') : status === 'missed' ? t('Goal missed') : t('In progress');
    label.title = statusText;
    progress.append(label, element('span', 'sr-only', ` ${statusText}`));
    if (status === 'met' || status === 'missed') {
      const face = element('span', 'progress-face', status === 'met' ? '😄' : '😭');
      face.setAttribute('aria-hidden', 'true');
      progress.append(face);
    }
    row.append(progress);
    body.append(row);
  });
  table.append(head, body);
  scroll.append(table);
  container.append(scroll);
}
