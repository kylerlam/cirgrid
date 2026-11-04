import { languages, themes, getLanguage, getTheme, localize, setLanguage, setTheme } from './preferences.js';

export function createSettings() {
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
  `;
  document.body.append(dialog);

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

  return {
    open() {
      language.value = getLanguage();
      theme.value = getTheme();
      localize(dialog);
      dialog.showModal();
    },
  };
}
