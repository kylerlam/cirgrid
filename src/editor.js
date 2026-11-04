import { HABIT_COLORS, addHabit, updateHabit, deleteHabit, habitColor, localDateKey, weeklyGoal } from './model.js';
import { t } from './preferences.js';

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
      <label class="field-label" for="habit-name" data-label="Habit name"></label>
      <input class="habit-input" id="habit-name" name="name" type="text" required maxlength="60" autocomplete="off" autofocus>
      <div class="habit-schedule">
        <div class="habit-field">
          <label class="field-label" for="habit-weekly-goal" data-label="Days per week"></label>
          <select class="habit-input" id="habit-weekly-goal" name="weeklyGoal" required></select>
        </div>
        <div class="habit-field">
          <label class="field-label" for="habit-end-date" data-label="End date (optional)"></label>
          <input class="habit-input" id="habit-end-date" name="endDate" type="date" max="9999-12-31">
        </div>
      </div>
      <div class="habit-field" id="habit-stage" hidden>
        <label class="field-label" for="habit-stage-goal" data-label="Stage goal (optional)"></label>
        <input class="habit-input" id="habit-stage-goal" name="stageGoal" type="text" maxlength="120">
      </div>
      <fieldset>
        <legend class="field-label" data-label="Color"></legend>
        <div class="color-options"></div>
        <div class="custom-color-panel" id="habit-color-panel" hidden>
          <div class="habit-field">
            <label class="field-label" for="habit-custom-color" data-label="Color picker"></label>
            <input class="custom-color-input" id="habit-custom-color" name="customColor" type="color">
          </div>
          <div class="habit-field">
            <label class="field-label" for="habit-hex-color" data-label="Hex color"></label>
            <input class="habit-input" id="habit-hex-color" name="hexColor" type="text" placeholder="#8866CC" maxlength="7" autocomplete="off" spellcheck="false" autocapitalize="off">
          </div>
        </div>
      </fieldset>
      <p class="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions">
        <button class="button button-danger" type="button" data-action="delete" data-label="Delete habit" hidden></button>
        <button class="button button-secondary" type="button" data-action="cancel" data-label="Cancel"></button>
        <button class="button button-primary" type="submit">Add habit</button>
      </div>
    </form>`;
  const heading = dialog.querySelector('h2');
  const input = dialog.querySelector('input[name="name"]');
  const goal = dialog.querySelector('select[name="weeklyGoal"]');
  const endDate = dialog.querySelector('input[name="endDate"]');
  const stageGoal = dialog.querySelector('input[name="stageGoal"]');
  const colors = dialog.querySelector('.color-options');
  const error = dialog.querySelector('.dialog-error');
  const submit = dialog.querySelector('button[type="submit"]');
  const remove = dialog.querySelector('[data-action="delete"]');
  const cancel = dialog.querySelector('[data-action="cancel"]');
  const dismiss = dialog.querySelector('.dialog-close');
  let editingId = null;
  let opener = null;
  let saving = false;

  for (let days = 1; days <= 7; days++) goal.add(new Option(days, days));

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
    name.dataset.label = color.label;
    label.append(radio, dot, name);
    colors.append(label);
  }
  const customOption = document.createElement('button');
  customOption.type = 'button';
  customOption.className = 'color-option custom-color-option';
  customOption.setAttribute('aria-expanded', 'false');
  customOption.setAttribute('aria-controls', 'habit-color-panel');
  customOption.innerHTML = '<span class="custom-color-dot" aria-hidden="true"></span><span class="sr-only" data-label="Custom color"></span>';
  colors.append(customOption);
  const colorPanel = dialog.querySelector('.custom-color-panel');
  const customColor = dialog.querySelector('input[name="customColor"]');
  const hexColor = dialog.querySelector('input[name="hexColor"]');
  const presetColors = [...colors.querySelectorAll('input[name="color"]')];

  function updateStageField() {
    stageGoal.parentElement.hidden = !endDate.value;
  }

  function syncHexColor() {
    hexColor.value = customColor.value.toUpperCase();
    hexColor.setCustomValidity('');
  }

  function closeColorPanel() {
    syncHexColor();
    colorPanel.hidden = true;
    customOption.setAttribute('aria-expanded', 'false');
  }

  function selectCustomColor() {
    for (const radio of presetColors) radio.checked = false;
    customOption.classList.add('is-selected');
  }

  endDate.addEventListener('input', updateStageField);
  customOption.addEventListener('click', () => {
    if (!colorPanel.hidden) return closeColorPanel();
    syncHexColor();
    colorPanel.hidden = false;
    customOption.setAttribute('aria-expanded', 'true');
    hexColor.focus();
    hexColor.select();
  });
  customColor.addEventListener('input', () => {
    syncHexColor();
    selectCustomColor();
  });
  hexColor.addEventListener('input', () => {
    const match = /^#?([0-9a-f]{6})$/i.exec(hexColor.value);
    hexColor.setCustomValidity(match ? '' : t('Use a six-digit hex color, such as #8866CC.'));
    if (!match) return;
    customColor.value = `#${match[1].toLowerCase()}`;
    selectCustomColor();
  });
  hexColor.addEventListener('change', () => {
    if (hexColor.validity.valid) syncHexColor();
  });
  for (const radio of presetColors) {
    const selectPresetColor = () => {
      customColor.value = habitColor({ color: radio.value }).value;
      customOption.classList.remove('is-selected');
      closeColorPanel();
    };
    radio.addEventListener('change', selectPresetColor);
    radio.addEventListener('click', selectPresetColor);
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function close() {
    if (!saving && dialog.open) dialog.close();
  }

  function setSaving(value) {
    saving = value;
    dialog.setAttribute('aria-busy', String(value));
    for (const control of dialog.querySelectorAll('button, input, select')) control.disabled = value;
  }

  async function applyChange(transform, successMessage) {
    if (saving) return;
    const focusTarget = document.activeElement;
    setSaving(true);
    let saved = false;
    let validationError = '';
    try {
      saved = await onChange(current => {
        try { return transform(current); }
        catch (failure) { validationError = failure.message; throw failure; }
      }, successMessage);
      if (!saved) showError(validationError ? t(validationError) : t('Your changes could not be saved. Please try again.'));
    } catch (failure) {
      showError(t(failure.message || 'Your changes could not be saved. Please try again.'));
    } finally {
      setSaving(false);
    }
    if (saved) close();
    else if (dialog.contains(focusTarget)) focusTarget.focus({ preventScroll: true });
  }

  dialog.querySelector('.habit-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    error.hidden = true;
    const habitId = editingId;
    const values = {
      name: input.value,
      color: presetColors.find(radio => radio.checked)?.value ?? customColor.value,
      weeklyGoal: Number(goal.value),
      endDate: endDate.value,
      stageGoal: endDate.value ? stageGoal.value : '',
    };
    await applyChange(current => habitId === null
      ? addHabit(current, values)
      : updateHabit(current, habitId, values), t(habitId === null ? 'Habit added.' : 'Habit updated.'));
  });

  remove.addEventListener('click', async () => {
    if (saving) return;
    error.hidden = true;
    const habitId = editingId;
    try {
      const habit = getState().habits.find(item => item.id === habitId);
      if (!habit) throw new Error('This habit no longer exists.');
      if (!window.confirm(t('Delete "{0}" and all of its check-ins? This cannot be undone.', habit.name))) return;
      await applyChange(current => deleteHabit(current, habitId), t('Habit deleted.'));
    } catch (failure) {
      showError(t(failure.message || 'Your changes could not be saved. Please try again.'));
    }
  });

  dismiss.addEventListener('click', close);
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    if (saving) event.preventDefault();
    else if (!colorPanel.hidden) {
      event.preventDefault();
      closeColorPanel();
      customOption.focus();
    }
  });
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
      if (saving) return;
      const habit = habitId === undefined ? null : getState().habits.find(item => item.id === habitId);
      if (habitId !== undefined && !habit) throw new Error('This habit no longer exists.');
      editingId = habit?.id ?? null;
      opener = document.activeElement;
      for (const label of dialog.querySelectorAll('[data-label]')) label.textContent = t(label.dataset.label);
      heading.textContent = t(habit ? 'Edit habit' : 'New habit');
      submit.textContent = t(habit ? 'Save changes' : 'Add habit');
      dismiss.setAttribute('aria-label', t('Close dialog'));
      remove.hidden = habit === null;
      input.value = habit?.name ?? '';
      input.placeholder = t('e.g. Morning walk');
      goal.value = habit ? weeklyGoal(habit, localDateKey()) : 5;
      endDate.value = habit?.endDate ?? '';
      stageGoal.value = habit?.stageGoal ?? '';
      updateStageField();
      error.textContent = '';
      error.hidden = true;
      const color = habit?.color ?? 'blue';
      for (const radio of presetColors) radio.checked = radio.value === color;
      customOption.classList.toggle('is-selected', color.startsWith('#'));
      customColor.value = habitColor({ color }).value;
      closeColorPanel();
      if (!dialog.open) dialog.showModal();
      input.focus();
      input.select();
    },
    close,
  };
}
