export type ThemeMode = 'light' | 'dark';

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light';
  localStorage.setItem('v4_theme', mode);
}

export function readTheme(): ThemeMode {
  const stored = localStorage.getItem('v4_theme');
  return stored === 'dark' ? 'dark' : 'light';
}
