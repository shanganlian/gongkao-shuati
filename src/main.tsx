import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AuthUIProvider } from './context/AuthUIContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthUIProvider>
        <App />
      </AuthUIProvider>
    </AuthProvider>
  </StrictMode>,
);

