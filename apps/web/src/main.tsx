/**
 * V4 Merchant Console entrypoint (Phase 6.5).
 * Active UI uses /api/v1 only. Legacy console is preserved under src/legacy/ (frozen).
 */
import React from 'react';
import {createRoot} from 'react-dom/client';
import './v4/ui/load-styles';
import {App} from './v4/app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
