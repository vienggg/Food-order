import { Link, Navigate, Route, Routes } from "react-router-dom";
import { homeFor, useAuth } from "./auth";
import { RequireRole } from "./Layout";
import { LoginPage } from "./pages/LoginPage";
import { MenuPage } from "./pages/MenuPage";
import { OrdersSplit } from "./pages/OrdersPage";
import { CartProvider } from "./cart";
import { QueuePage } from "./pages/QueuePage";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page" aria-busy="true" />;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

function NotFound() {
  return (
    <main className="content center">
      <h1 className="page-title">Page not found</h1>
      <Link className="btn inline" to="/">
        Go home
      </Link>
    </main>
  );
}

export function App() {
  // key: a new user gets a new, empty cart.
  const { user } = useAuth();
  return (
    <CartProvider key={user?.id ?? 0}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/menu" element={<RequireRole role="CUSTOMER" title="Menu"><MenuPage /></RequireRole>} />
      <Route path="/orders" element={<RequireRole role="CUSTOMER" title="My orders"><OrdersSplit /></RequireRole>} />
      <Route path="/orders/:id" element={<RequireRole role="CUSTOMER" title="My orders"><OrdersSplit /></RequireRole>} />
      <Route path="/operator/orders" element={<RequireRole role="OPERATOR" title="Order queue"><QueuePage /></RequireRole>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </CartProvider>
  );
}
