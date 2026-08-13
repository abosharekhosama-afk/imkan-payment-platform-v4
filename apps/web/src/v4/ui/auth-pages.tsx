import {uiSkin} from '../ui/skin';
import {LoginPage as ClassicLoginPage} from '../ui-classic/pages/LoginPage';
import {SignupPage as ClassicSignupPage} from '../ui-classic/pages/SignupPage';
import {LoginPageModern} from '../pages/modern/LoginPage';
import {SignupPageModern} from '../pages/modern/SignupPage';

export const LoginPage = uiSkin() === 'classic' ? ClassicLoginPage : LoginPageModern;
export const SignupPage = uiSkin() === 'classic' ? ClassicSignupPage : SignupPageModern;
