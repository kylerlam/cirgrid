import { HABIT_COLORS, addHabit, updateHabit, deleteHabit } from './model.js';

export function createHabitEditor({ getState, onChange }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'habit-dialog';
  dialog.setAttribute('aria-labelledby', 'habit-dialog-title');
  dialog.innerHTML = `
    <div class="dialog-heading">
      <h2 id="habit-dialog-title">New habit</h2>
      <button class="dialog-close button button-secondary" type="button" aria-label="Close dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
    </div>
    <form class="habit-form">
      <label class="field-label" for="habit-name">Habit name</label>
      <input class="habit-input" id="habit-name" name="name" type="text" required maxlength="60" placeholder="e.g. Morning walk" autocomplete="off" autofocus>
      <fieldset>
        <legend class="field-label">Color</legend>
        <div class="color-options"></div>
      </fieldset>
      <p class="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions">
        <button class="button button-danger" type="button" data-action="delete" hidden>Delete habit</button>
        <button class="button button-secondary" type="button" data-action="cancel">Cancel</button>
        <button class="button button-primary" type="submit">Add habit</button>
      </div>
    </form>`;
  const heading = dialog.querySelector('h2');
  const input = dialog.querySelector('input[name="name"]');
  const colors = dialog.querySelector('.color-options');
  const error = dialog.querySelector('.dialog-error');
  const submit = dialog.querySelector('button[type="submit"]');
  const remove = dialog.querySelector('[data-action="delete"]');
  let editingId = null;
  let opener = null;

  for (const color of HABIT_COLORS) {
    const label = document.createElement('label');
    label.className = 'color-option';
    label.style.setProperty('--habit-color', color.value);
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'color';
    radio.value = color.id;
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = color.label;
    label.append(radio, dot, name);
    colors.append(label);
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function applyChange(nextState, successMessage) {
    if (onChange(nextState, successMessage) === true) close();
    else showError('Your changes could not be saved. Please try again.');
  }

  dialog.querySelector('.habit-form').addEventListener('submit', event => {
    event.preventDefault();
    error.hidden = true;
    const values = { name: input.value, color: dialog.querySelector('input[name="color"]:checked').value };
    try {
      const state = getState();
      if (editingId === null) applyChange(addHabit(state, values), 'Habit added.');
      else applyChange(updateHabit(state, editingId, values), 'Habit updated.');
    } catch (failure) {
      showError(failure.message || 'Your changes could not be saved. Please try again.');
    }
  });

  remove.addEventListener('click', () => {
    try {
      const habit = getState().habits.find(item => item.id === editingId);
      if (!habit) throw new Error('This habit no longer exists.');
      if (!window.confirm(`Delete "${habit.name}" and all of its check-ins? This cannot be undone.`)) return;
      applyChange(deleteHabit(getState(), editingId), 'Habit deleted.');
    } catch (failure) {
      showError(failure.message || 'Your changes could not be saved. Please try again.');
    }
  });

  dialog.querySelector('.dialog-close').addEventListener('click', close);
  dialog.querySelector('[data-action="cancel"]').addEventListener('click', close);
  dialog.addEventListener('close', () => {
    const habitId = opener?.dataset?.editHabit;
    const replacement = habitId ? document.querySelector(`[data-edit-habit="${habitId}"]`) : null;
    const target = opener?.isConnected ? opener : replacement ?? document.getElementById('new-habit');
    target?.focus();
    opener = null;
  });
  document.body.append(dialog);

  return {
    open(habitId) {
      const habit = habitId === undefined ? null : getState().habits.find(item => item.id === habitId);
      if (habitId !== undefined && !habit) throw new Error('This habit no longer exists.');
      editingId = habit?.id ?? null;
      opener = document.activeElement;
      heading.textContent = habit ? 'Edit habit' : 'New habit';
      submit.textContent = habit ? 'Save changes' : 'Add habit';
      remove.hidden = habit === null;
      input.value = habit?.name ?? '';
      error.textContent = '';
      error.hidden = true;
      for (const radio of colors.querySelectorAll('input')) radio.checked = radio.value === (habit?.color ?? 'blue');
      if (!dialog.open) dialog.showModal();
      input.focus();
      input.select();
    },
    close,
  };
}
