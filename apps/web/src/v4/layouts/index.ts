import {uiSkin} from '../ui/skin';
import {AppShell as ModernAppShell} from './AppShell';
import {AppShell as ClassicAppShell} from '../ui-classic/layouts/AppShell';

export const AppShell = uiSkin() === 'classic' ? ClassicAppShell : ModernAppShell;
