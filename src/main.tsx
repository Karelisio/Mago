import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { SyncProvider } from './contexts/SyncContext';
import { ImportProvider } from './contexts/ImportContext';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setupEdgeToEdge } from './lib/statusBar';
import { setupDynamicColor } from './lib/dynamicColor';
import { initTheme } from './lib/theme';
import './styles/theme.css';

initTheme();
void setupEdgeToEdge();
void setupDynamicColor();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <SyncProvider>
              <ImportProvider>
                <App />
              </ImportProvider>
            </SyncProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
