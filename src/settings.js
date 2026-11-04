import { request } from './api.js';
import { languages, themes, getLanguage, getTheme, localize, setLanguage, setTheme, t } from './preferences.js';

export function addPasswordToggle(input) {
  const entry = document.createElement('div');
  entry.className = 'password-entry';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'password-toggle';
  button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg>';
  function show(visible) {
    input.type = visible ? 'text' : 'password';
    button.dataset.i18nLabel = visible ? 'Hide password' : 'Show password';
    button.setAttribute('aria-label', t(button.dataset.i18nLabel));
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('is-visible', visible);
  }
  show(false);
  button.addEventListener('click', () => show(input.type === 'password'));
  input.before(entry);
  entry.append(input, button);
  input.form.addEventListener('reset', () => show(false));
}

export function createSettings({ username, onImport, onDownload, onSignOut } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `
    <div class="dialog-heading">
      <h2 id="settings-title" data-i18n="Settings">Settings</h2>
      <form method="dialog"><button class="button button-secondary" data-i18n="Close">Close</button></form>
    </div>
    <div class="account-form">
      <label><span data-i18n="Language">Language</span><select name="language"></select></label>
      <label><span data-i18n="Theme">Theme</span><select name="theme"></select></label>
      <a class="source-link" href="https://github.com/kylerlam/cirgrid" target="_blank" rel="noopener noreferrer"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.4c0-1 .1-1.4-.5-2 3.3-.4 6.5-1.6 6.5-7.1a5.5 5.5 0 0 0-1.5-3.8 5 5 0 0 0-.1-3.7s-1.2-.4-3.9 1.5a13.5 13.5 0 0 0-7 0C5.8 1.6 4.6 2 4.6 2a5 5 0 0 0-.1 3.7A5.5 5.5 0 0 0 3 9.5c0 5.5 3.2 6.7 6.5 7.1-.6.6-.6 1.2-.5 2V22"/></svg>GitHub</a>
    </div>
    ${onImport ? `
      <section>
        <h3 data-i18n="Data">Data</h3>
        <form class="account-form data-form">
          <label><span data-i18n="Import a CirGrid backup">Import a CirGrid backup</span><input name="backup" type="file" accept=".yml,.yaml,.json" required></label>
          <div class="settings-actions">
            <button type="submit" class="button button-secondary" data-i18n="Import">Import</button>
            <button type="button" class="button button-secondary" data-export="yaml" data-i18n="Export YAML">Export YAML</button>
            <button type="button" class="button button-secondary" data-export="json" data-i18n="Export JSON">Export JSON</button>
          </div>
        </form>
        <p class="account-message" data-result="data" role="status" hidden></p>
      </section>
      <section>
        <h3 data-i18n="Account">Account</h3>
        <form class="account-form account-change">
          <label><span data-i18n="Username">Username</span><input name="username" autocomplete="username" required maxlength="64"></label>
          <label><span data-i18n="Current password">Current password</span><input name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"></label>
          <label><span data-i18n="New password (optional)">New password (optional)</span><input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256"></label>
          <div class="settings-actions">
            <button type="submit" class="button button-secondary" data-i18n="Save account">Save account</button>
            <button type="button" class="button button-secondary" data-sign-out data-i18n="Sign out">Sign out</button>
          </div>
        </form>
        <p class="account-message" data-result="account" role="status" hidden></p>
      </section>` : ''}
  `;
  document.body.append(dialog);
  for (const input of dialog.querySelectorAll('input[type="password"]')) addPasswordToggle(input);

  const language = dialog.querySelector('select[name="language"]');
  for (const [id, label] of Object.entries(languages)) language.add(new Option(label, id));
  const theme = dialog.querySelector('select[name="theme"]');
  for (const [id, [label]] of Object.entries(themes)) {
    const option = new Option(label, id);
    option.dataset.i18n = label;
    theme.add(option);
  }
  language.addEventListener('change', () => setLanguage(language.value));
  theme.addEventListener('change', () => setTheme(theme.value));

  async function perform(section, task) {
    const field = dialog.querySelector('[data-result="' + section + '"]');
    const form = field.previousElementSibling;
    const controls = Array.from(form.elements);
    field.hidden = true;
    for (const control of controls) control.disabled = true;
    try {
      field.textContent = t(await task());
      field.classList.remove('is-error');
    } catch (error) {
      field.textContent = t(error.message);
      field.classList.add('is-error');
    } finally {
      for (const control of controls) control.disabled = false;
      field.hidden = false;
    }
  }

  if (onImport) {
    const dataForm = dialog.querySelector('.data-form');
    dataForm.addEventListener('submit', event => {
      event.preventDefault();
      const file = dataForm.elements.backup.files[0];
      void perform('data', async () => {
        await onImport(file);
        dataForm.reset();
        return 'Backup imported.';
      });
    });
    for (const button of dataForm.querySelectorAll('[data-export]')) {
      button.addEventListener('click', () => perform('data', async () => {
        await onDownload(button.dataset.export);
        return 'Backup downloaded.';
      }));
    }

    const accountForm = dialog.querySelector('.account-change');
    accountForm.elements.username.value = username;
    dialog.addEventListener('close', () => {
      const currentUsername = accountForm.elements.username.value;
      accountForm.reset();
      accountForm.elements.username.value = currentUsername;
    });
    accountForm.addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(accountForm));
      if (!data.password) delete data.password;
      void perform('account', async () => {
        const session = await request('/api/account', { method: 'POST', data });
        accountForm.reset();
        accountForm.elements.username.value = session.username;
        return 'Account updated.';
      });
    });
    dialog.querySelector('[data-sign-out]').addEventListener('click', () => perform('account', onSignOut));
  }

  return {
    open() {
      language.value = getLanguage();
      theme.value = getTheme();
      localize(dialog);
      dialog.showModal();
    },
  };
}
