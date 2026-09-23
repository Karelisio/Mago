import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Lists } from './pages/Lists';
import { ListDetail } from './pages/ListDetail';
import { Settings } from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p style={{ padding: 24 }}>Chargement…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { session } = useAuth();
  const location = useLocation();
  const isGradientRoute = location.pathname.startsWith('/lists');

  return (
    <div className="app-shell">
      <div className={`app-content ${isGradientRoute ? 'gradient-bg' : ''}`}>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/lists" replace /> : <Login />} />
          <Route
            path="/lists"
            element={
              <RequireAuth>
                <Lists />
              </RequireAuth>
            }
          />
          <Route
            path="/lists/:id"
            element={
              <RequireAuth>
                <ListDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={session ? '/lists' : '/login'} replace />} />
        </Routes>
      </div>
      {session && (
        <nav className="bottom-nav">
          <NavLink to="/lists" className={({ isActive }) => (isActive ? 'active' : '')}>
            Listes
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            Réglages
          </NavLink>
        </nav>
      )}
    </div>
  );
}
