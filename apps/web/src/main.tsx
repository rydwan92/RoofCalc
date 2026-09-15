import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import './i18n';
import '@cieslacalc/ui/tokens.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/calculators/common-rafter" element={<App />} />
        <Route
          path="*"
          element={<Navigate to="/calculators/common-rafter" replace />}
        />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
