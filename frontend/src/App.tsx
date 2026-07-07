import { Navigate, Route, Routes } from 'react-router-dom';
import { CollectionPage } from './features/collection/CollectionPage';
import { LoginPage } from './features/auth/LoginPage';
import { MatchingPage } from './features/matching/MatchingPage';
import { MyWakppuballPage } from './features/wakppuball/MyWakppuballPage';
import { useAuth } from './shared/auth/AuthContext';
import { RequireAuth } from './shared/auth/RequireAuth';

// /login is only for logged-out users; send authenticated users to the main screen.
function LoginRoute() {
  const { status } = useAuth();
  if (status === 'loading') {
    return <p className="page">확인 중…</p>;
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <LoginPage />;
}

export function App() {
  return (
    <main className="app-shell">
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <MyWakppuballPage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/collection"
          element={
            <RequireAuth>
              <CollectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/matching"
          element={
            <RequireAuth>
              <MatchingPage />
            </RequireAuth>
          }
        />
      </Routes>
    </main>
  );
}
