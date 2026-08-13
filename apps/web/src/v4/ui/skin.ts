/** UI skin selected at build time via VITE_UI_SKIN (classic | modern). */
export type UiSkin = 'classic' | 'modern';

export function uiSkin(): UiSkin {
  const raw = String(import.meta.env.VITE_UI_SKIN ?? 'modern').trim().toLowerCase();
  return raw === 'classic' ? 'classic' : 'modern';
}

export function isClassicSkin(): boolean {
  return uiSkin() === 'classic';
}
