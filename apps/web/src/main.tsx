import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import '@cieslacalc/ui/tokens.css';
import './styles.css';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/calculators/common-rafter" element={<App />} />
          <Route
            path="*"
            element={<Navigate to="/calculators/common-rafter" replace />}
          />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
