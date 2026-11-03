import { translations } from './translations.js';

export const languages = {
  en: 'English', es: 'Español', 'zh-CN': '简体中文', 'zh-TW': '繁體中文',
};

export const themes = {
  white: ['White', '#f7f8fa'], mint: ['Mint', '#eef6f1'], sky: ['Sky', '#eff5fb'],
  lavender: ['Lavender', '#f5f1fa'], peach: ['Peach', '#fff5ee'], glass: ['Glass', '#dcecf4'],
  aurora: ['Aurora', '#dcece6'], sunset: ['Sunset', '#f4ddd6'], ocean: ['Ocean', '#d5e9ee'],
  twilight: ['Twilight', '#e0dced'],
};

function readPreference(key) {
  try { return localStorage.getItem('cirgrid.' + key); }
  catch { return null; }
}

function savePreference(key, value) {
  try { localStorage.setItem('cirgrid.' + key, value); }
  catch { /* Keep changes for this page if storage is unavailable. */ }
}

let language = readPreference('language');
if (!Object.hasOwn(languages, language)) language = 'en';
let theme = readPreference('theme');
if (!Object.hasOwn(themes, theme)) theme = 'white';

export const getLanguage = () => language;
export const getTheme = () => theme;

export function t(key, ...values) {
  const translation = translations[key]?.[{ es: 0, 'zh-CN': 1, 'zh-TW': 2 }[language]] ?? key;
  return translation.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match);
}

export function localize(container = document) {
  for (const node of container.querySelectorAll('[data-i18n]:not(title)')) node.textContent = t(node.dataset.i18n);
  for (const node of container.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
}

export function applyPreferences() {
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme][1]);
  const title = document.querySelector('title[data-i18n]');
  if (title) document.title = 'CirGrid — ' + t(title.dataset.i18n);
  localize();
}

export function setLanguage(value) {
  if (!Object.hasOwn(languages, value)) return;
  language = value;
  savePreference('language', value);
  applyPreferences();
  window.dispatchEvent(new Event('languagechange'));
}

export function setTheme(value) {
  if (!Object.hasOwn(themes, value)) return;
  theme = value;
  savePreference('theme', value);
  applyPreferences();
}
