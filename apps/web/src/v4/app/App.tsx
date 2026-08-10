import React from 'react';
import {BrowserRouter} from 'react-router-dom';
import {AuthProvider} from '../auth/AuthProvider';
import {ToastProvider} from '../hooks/useToast';
import {ErrorBoundary} from '../components/ErrorBoundary';
import {AppRoutes} from '../routes';
import {applyTheme, readTheme} from '../theme';
import '../design-system/global.css';

applyTheme(readTheme());

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <div className="v4-app">
              <AppRoutes />
            </div>
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
