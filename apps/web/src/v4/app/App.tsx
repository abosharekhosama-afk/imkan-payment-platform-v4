import React from 'react';
import {BrowserRouter} from 'react-router-dom';
import {AuthProvider} from '../auth/AuthProvider';
import {ToastProvider} from '../hooks/useToast';
import {ErrorBoundary} from '../components/ErrorBoundary';
import {AppRoutes} from '../routes';
import {I18nProvider, bootstrapPreferences} from '../i18n/I18nProvider';

bootstrapPreferences();

export function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <div className="v4-app">
                <AppRoutes />
              </div>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
