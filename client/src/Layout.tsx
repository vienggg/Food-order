import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { homeFor, useAuth, type Role } from "./auth";
import { useCart } from "./cart";

const LINKS: Record<Role, { to: string; label: string }[]> = {
  CUSTOMER: [
    { to: "/menu", label: "Menu" },
    { to: "/orders", label: "My orders" },
  ],
  OPERATOR: [{ to: "/operator/orders", label: "Order queue" }],
};

function WrongRole({ home }: { home: string }) {
  const { setNotice } = useAuth();
  useEffect(() => setNotice("You don't have access to that page."), [setNotice]);
  return <Navigate to={home} replace />;
}

// Route guard + shared layout. Hiding links here is only for the user; the API checks every request.
export function RequireRole({ role, title, children }: { role: Role; title: string; children: ReactNode }) {
  const { user, loading, notice, setNotice, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const { cart } = useCart();

  if (loading) return <div className="loading-page" aria-busy="true" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <WrongRole home={homeFor(user.role)} />;

  async function doLogout() {
    setLeaving(true);
    await logout();
    navigate("/login", { replace: true });
  }

  const links = LINKS[user.role];
  const clearNotice = () => setNotice(null); // a notice is for one redirect, not every page after it
  const cartCount = cart.lines.reduce((n, l) => n + l.quantity, 0);
  const roleChip = user.role === "OPERATOR" ? "Operator" : "Customer";
  const logoutButton = (cls: string) => (
    <button className={cls} onClick={doLogout} disabled={leaving}>
      {leaving ? "Logging out…" : "Log out"}
    </button>
  );

  return (
    <div className="shell">
      <aside className="side">
        <p className="brand small">Campus Café</p>
        <p className="side-sub">{user.role === "OPERATOR" ? "Staff" : "Pre-order"}</p>
        <nav className="side-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end onClick={clearNotice}>
              {l.label}
              {l.to === "/menu" && cartCount > 0 && <span className="count">{cartCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <p className="user-name">{user.name}</p>
          <p className="role">{roleChip}</p>
          {logoutButton("out")}
        </div>
      </aside>

      <header className="top">
        <div>
          <p className="hey">Hey, {user.name}</p>
          <p className="role">{roleChip}</p>
        </div>
        {logoutButton("btn ghost small")}
      </header>

      <main className="content">
        <p className="crumb">Pre-order / {title}</p>
        <h1 className="page-title">{title}</h1>
        {notice && (
          <div className="msg info" role="status">
            {notice}
            <button className="msg-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
        {children}
      </main>

      <nav className="tabs">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end className="tab" onClick={clearNotice}>
            {l.label}
          </NavLink>
        ))}
        {user.role === "CUSTOMER" && (
          <Link to="/menu#cart" className="tab" onClick={clearNotice}>
            Cart{cartCount > 0 ? ` (${cartCount})` : ""}
          </Link>
        )}
      </nav>
    </div>
  );
}
