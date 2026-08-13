import {uiSkin} from './skin';

/** Loads global CSS for the active skin (build-time env). */
if (uiSkin() === 'classic') {
  void import('../ui-classic/design-system/global.css');
} else {
  void import('../design-system/global.css');
}
