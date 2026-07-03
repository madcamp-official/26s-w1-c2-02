import { NavLink, Route, Routes } from 'react-router-dom';
import { CollectionPage } from './features/collection/CollectionPage';
import { LoginPage } from './features/auth/LoginPage';
import { MatchingPage } from './features/matching/MatchingPage';
import { MyWakppuballPage } from './features/wakppuball/MyWakppuballPage';

export function App() {
  return (
    <main className="app-shell">
      <Routes>
        <Route path="/" element={<MyWakppuballPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/matching" element={<MatchingPage />} />
      </Routes>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavLink to="/">내 왁뿌볼</NavLink>
        <NavLink to="/collection">컬렉션</NavLink>
        <NavLink to="/matching">매칭</NavLink>
      </nav>
    </main>
  );
}
