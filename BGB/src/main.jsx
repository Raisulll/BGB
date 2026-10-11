import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'leaflet/dist/leaflet.css';
// Spec #43 — Bangla glyphs, bundled so they work offline; each file loads only when Bengali text is shown
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-500.css';
import '@fontsource/noto-sans-bengali/bengali-600.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import './index.css';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { setupPwa } from './utils/pwa.js';

setupPwa();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
