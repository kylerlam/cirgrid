import { request } from './api.js';
import { applyPreferences, t } from './preferences.js';
import { addPasswordToggle, createSettings } from './settings.js';

const form = document.getElementById('login-form');
const submit = form.querySelector('[type=submit]');
addPasswordToggle(form.elements.password);
const error = document.getElementById('login-error');
const settings = createSettings();
document.getElementById('open-settings').addEventListener('click', settings.open);
applyPreferences();

function showError(message) {
  error.textContent = t(message);
  error.hidden = false;
}

try {
  const session = await request('/api/session');
  if (session.authenticated) location.replace('/');
  else {
    if (session.defaultCredentials) {
      document.getElementById('default-username').textContent = session.defaultCredentials.username;
      document.getElementById('default-password').textContent = session.defaultCredentials.password;
      document.getElementById('default-credentials').hidden = false;
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
  try {
    await request('/api/login', { method: 'POST', data });
    location.replace('/');
  } catch (failure) {
    showError(failure.message);
    submit.disabled = false;
  }
});
