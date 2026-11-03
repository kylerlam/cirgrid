import { request } from './api.js';
import { applyPreferences, t } from './preferences.js';
import { addPasswordToggle, createSettings } from './settings.js';

const form = document.getElementById('login-form');
const title = document.getElementById('login-title');
const submit = form.querySelector('[type=submit]');
addPasswordToggle(form.elements.password);
const error = document.getElementById('login-error');
const settings = createSettings();
document.getElementById('open-settings').addEventListener('click', settings.open);
applyPreferences();

let needsSetup = false;

function showError(message) {
  error.textContent = t(message);
  error.hidden = false;
}

try {
  const session = await request('/api/session');
  if (session.authenticated) location.replace('/');
  else {
    needsSetup = session.needsSetup;
    if (needsSetup) {
      title.dataset.i18n = 'Set up CirGrid';
      document.querySelector('title').dataset.i18n = 'Set up CirGrid';
      submit.dataset.i18n = 'Create your account';
      form.elements.password.autocomplete = 'new-password';
      form.elements.password.minLength = 12;
      if (session.setupTokenRequired) {
        document.getElementById('setup-token').hidden = false;
        form.elements.setupToken.required = true;
      }
      applyPreferences();
    }
    submit.disabled = false;
  }
} catch (failure) {
  showError(failure.message);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  error.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  if (!needsSetup || !data.setupToken) delete data.setupToken;
  try {
    await request(needsSetup ? '/api/setup' : '/api/login', { method: 'POST', data });
    location.replace('/');
  } catch (failure) {
    showError(failure.message);
    submit.disabled = false;
  }
});
