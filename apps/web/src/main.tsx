import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './i18n';
import '@cieslacalc/ui/tokens.css';
import './styles.css';
import { App } from './App';

const WORKBENCH = '/calculators/common-rafter';

/** Home and workbench share one mounted app, so session state survives. */
function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <App
      home={location.pathname === '/'}
      platform={location.pathname === '/platform'}
      onNavigate={(to) =>
        navigate(
          to === 'home' ? '/' : to === 'platform' ? '/platform' : WORKBENCH,
        )
      }
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/platform" element={<Root />} />
        <Route path={WORKBENCH} element={<Root />} />
        <Route path="*" element={<Navigate to={WORKBENCH} replace />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
