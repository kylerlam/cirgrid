import { HABIT_COLORS, isCompleted, parseDateKey } from './model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const circleObservers = new WeakMap();
const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const fullDateFormat = new Intl.DateTimeFormat('en-US', {
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

function habitColor(habit) {
  return HABIT_COLORS.find(color => color.id === habit.color);
}

function cellLabel(habit, dateKey, completed) {
  return `${habit.name}, ${fullDateFormat.format(parseDateKey(dateKey))}: ${completed ? 'completed' : 'not completed'}`;
}

function cellAttributes(node, view, habit, dateKey, completed) {
  node.dataset.view = view;
  node.dataset.habitId = habit.id;
  node.dataset.date = dateKey;
  node.setAttribute('aria-label', cellLabel(habit, dateKey, completed));
  node.setAttribute('aria-pressed', String(completed));
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
  if (!state.habits.length) {
    container.append(element('p', 'chart-empty', 'Add a habit to start your week.'));
    return;
  }

  const svg = svgElement('svg', {
    class: 'circle-svg', role: 'group', 'aria-label': 'Circular habit tracker. The outer ring is the first habit.',
    xmlns: SVG_NS,
  });
  const legend = element('div', 'habit-legend');
  state.habits.forEach((habit, index) => {
    const item = element('span', 'legend-item');
    const dot = element('span', 'habit-dot');
    dot.style.backgroundColor = habitColor(habit).value;
    dot.setAttribute('aria-hidden', 'true');
    let position = `Ring ${index + 1}`;
    if (index === 0) position = state.habits.length === 1 ? 'Ring' : 'Outer';
    else if (index === state.habits.length - 1) position = 'Inner';
    else if (state.habits.length === 3) position = 'Middle';
    item.append(dot, element('span', 'habit-name', `${position}: ${habit.name}`));
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
    const band = (radius - innerRadius) / state.habits.length;
    const radialGap = Math.min(2, band * .1);
    const sectorAngle = Math.PI * 2 / dates.length;
    const point = (r, angle) => [center + r * Math.sin(angle), center - r * Math.cos(angle)];
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.replaceChildren();

    state.habits.forEach((habit, habitIndex) => {
      const palette = habitColor(habit);
      dates.forEach((dateKey, dayIndex) => {
        const completed = isCompleted(state, habit.id, dateKey);
        const outer = radius - habitIndex * band - radialGap;
        const inner = radius - (habitIndex + 1) * band + radialGap;
        const start = dayIndex * sectorAngle + .012;
        const end = (dayIndex + 1) * sectorAngle - .012;
        const a = point(outer, start), b = point(outer, end);
        const c = point(inner, end), d = point(inner, start);
        const path = svgElement('path', {
          class: `circle-cell${completed ? ' is-complete' : ''}`,
          d: `M ${a} A ${outer} ${outer} 0 0 1 ${b} L ${c} A ${inner} ${inner} 0 0 0 ${d} Z`,
          fill: completed ? palette.soft : 'var(--pending-cell, #eff1f3)',
          role: 'button', tabindex: '0',
        });
        cellAttributes(path, 'circle', habit, dateKey, completed);
        path.addEventListener('click', () => onToggle(habit.id, dateKey));
        path.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle(habit.id, dateKey);
          }
        });
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

    dates.forEach((dateKey, index) => {
      const date = parseDateKey(dateKey);
      const [x, y] = point(radius + 24, (index + .5) * sectorAngle);
      const label = svgElement('text', {
        class: `circle-date-label${dateKey === today ? ' is-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}`,
        x, y: y - 7, 'text-anchor': 'middle', 'font-size': 12,
        fill: 'var(--muted-text, #6d7783)', 'pointer-events': 'none',
      });
      const weekday = svgElement('tspan', { x, dy: 0 });
      weekday.textContent = weekdayFormat.format(date);
      const day = svgElement('tspan', { x, dy: 17 });
      day.textContent = date.getDate();
      label.append(weekday, day);
      svg.append(label);
    });
    const centerTitle = svgElement('text', {
      class: 'circle-center-title', x: center, y: center - 3, 'text-anchor': 'middle',
      'font-size': Math.min(17, innerRadius * .4), fill: 'var(--text, #252a30)',
    });
    centerTitle.textContent = '7 days';
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
  if (!state.habits.length) {
    container.append(element('p', 'chart-empty', 'Add a habit to start your week.'));
    return;
  }

  const scroll = element('div', 'grid-scroll');
  const table = element('table', 'habit-grid');
  table.setAttribute('aria-label', 'Weekly habit grid');
  const head = element('thead');
  const headingRow = element('tr');
  const habitHeading = element('th', 'grid-habit-heading', 'Habit');
  habitHeading.scope = 'col';
  headingRow.append(habitHeading);
  dates.forEach(dateKey => {
    const date = parseDateKey(dateKey);
    const heading = element('th', `grid-date-header${dateKey === today ? ' is-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}`);
    heading.scope = 'col';
    heading.append(element('span', 'grid-weekday', weekdayFormat.format(date)), element('span', 'grid-day', date.getDate()));
    headingRow.append(heading);
  });
  head.append(headingRow);
  const body = element('tbody');
  state.habits.forEach(habit => {
    const row = element('tr');
    const heading = element('th', 'habit-row-label');
    heading.scope = 'row';
    const name = element('span', 'habit-row-name');
    const dot = element('span', 'habit-dot');
    dot.style.backgroundColor = habitColor(habit).value;
    dot.setAttribute('aria-hidden', 'true');
    name.append(dot, element('span', 'habit-name', habit.name));
    heading.append(name);
    row.append(heading);
    dates.forEach(dateKey => {
      const completed = isCompleted(state, habit.id, dateKey);
      const cell = element('td');
      const button = element('button', `check-cell${completed ? ' is-complete' : ''}`);
      button.type = 'button';
      cellAttributes(button, 'grid', habit, dateKey, completed);
      button.addEventListener('click', () => onToggle(habit.id, dateKey));
      if (completed) {
        const check = svgElement('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' });
        check.append(checkMark(10, 10, 12));
        button.append(check);
      }
      cell.append(button);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(head, body);
  scroll.append(table);
  container.append(scroll);
}
