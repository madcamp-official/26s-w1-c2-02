import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
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

function BottomNav() {
  const { status, signOut } = useAuth();
  const navigate = useNavigate();

  if (status !== 'authenticated') {
    return null;
  }

  function handleLogout() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <NavLink to="/">내 왁뿌볼</NavLink>
      <NavLink to="/collection">컬렉션</NavLink>
      <NavLink to="/matching">매칭</NavLink>
      <button type="button" onClick={handleLogout}>
        로그아웃
      </button>
    </nav>
  );
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

      <BottomNav />
    </main>
  );
}
