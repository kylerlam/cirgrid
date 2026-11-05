export function createHabitReorder(list, { onDrop, onCancel, onUnlock }) {
  let drag = null;
  let ready = null;
  let suppressClick = false;

  function cancel() {
    ready?.classList.remove('is-reorder-ready');
    ready = null;
    if (!drag) return;
    clearTimeout(drag.timer);
    if (list.hasPointerCapture(drag.pointerId)) list.releasePointerCapture(drag.pointerId);
    drag.preview?.remove();
    drag.button.classList.remove('is-dragging');
    list.classList.remove('is-reordering');
    drag = null;
  }

  function unlock() {
    if (!drag?.button.isConnected) return cancel();
    const { button } = drag;
    const rect = button.getBoundingClientRect();
    suppressClick = true;
    const preview = button.cloneNode(true);
    preview.removeAttribute('data-edit-habit');
    preview.setAttribute('aria-hidden', 'true');
    preview.tabIndex = -1;
    preview.classList.add('habit-drag-preview');
    Object.assign(preview.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px' });
    drag.preview = preview;
    list.setPointerCapture(drag.pointerId);
    document.body.append(preview);
    button.classList.add('is-dragging');
    list.classList.add('is-reordering');
    onUnlock();
  }

  list.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const button = event.target.closest('[data-edit-habit]');
    if (!button) return;
    if (event.pointerType !== 'touch') event.preventDefault();
    button.focus({ preventScroll: true });
    const unlocked = ready === button;
    cancel();
    suppressClick = false;
    const rect = button.getBoundingClientRect();
    drag = { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      offsetY: event.clientY - rect.top, preview: null, moved: false };
    if (unlocked) unlock();
    else drag.timer = setTimeout(unlock, 300);
  });

  window.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.preview) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
        suppressClick = true;
        cancel();
      }
      return;
    }
    event.preventDefault();
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
    drag.preview.style.top = event.clientY - drag.offsetY + 'px';
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-edit-habit]');
    if (!target || target === drag.button || !list.contains(target)) return;
    const rect = target.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) target.before(drag.button);
    else target.after(drag.button);
  }, { passive: false });

  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { button, preview, moved } = drag;
    const beforeId = button.nextElementSibling?.dataset.editHabit ?? null;
    cancel();
    if (preview) {
      event.preventDefault();
      if (event.type === 'pointercancel') onCancel();
      else if (!moved) {
        ready = button;
        button.classList.add('is-reorder-ready');
      } else onDrop(button.dataset.editHabit, beforeId);
    }
  }

  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', () => {
    const active = Boolean(drag?.preview || ready);
    cancel();
    if (active) onCancel();
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!drag && !ready)) return;
    const active = Boolean(drag?.preview || ready);
    cancel();
    if (active) onCancel();
  });
  list.addEventListener('click', event => {
    if (!suppressClick && !ready) return;
    suppressClick = false;
    if (event.detail === 0) { cancel(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  list.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('[data-edit-habit]')) event.preventDefault();
  });
  list.addEventListener('dragstart', event => event.preventDefault());
  list.addEventListener('contextmenu', event => event.preventDefault());
  list.addEventListener('keydown', event => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const button = event.target.closest('[data-edit-habit]');
    if (!button) return;
    event.preventDefault();
    const target = event.key === 'ArrowUp' ? button.previousElementSibling : button.nextElementSibling;
    if (target) onDrop(button.dataset.editHabit,
      event.key === 'ArrowUp' ? target.dataset.editHabit : target.nextElementSibling?.dataset.editHabit ?? null);
  });

  return { cancel };
}
