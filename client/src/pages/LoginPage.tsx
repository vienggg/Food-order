import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, NETWORK_MESSAGE } from "../api";
import { homeFor, useAuth } from "../auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, loading, notice, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!email) fe.email = "Email is required.";
    else if (!EMAIL.test(email)) fe.email = "Enter a valid email.";
    if (!password) fe.password = "Password is required.";
    setFieldErrors(fe);
    if (fe.email || fe.password) return;

    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setPassword("");
      setError(err instanceof ApiError && err.status === 401 ? "Incorrect email or password." : NETWORK_MESSAGE);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img className="login-photo" src="/img/espresso-shot.webp" alt="Espresso running into a small white cup at a steel machine" />
      <div className="hero">
        <p className="brand">
          Campus Café
          <br />
          <em>Order ahead.</em>
        </p>
        <p className="tag">Skip the line. Pick up when it's ready.</p>
      </div>
      <form className="login-form" onSubmit={submit} noValidate>
        <div className="card-head">
          <h1 className="title">Sign in</h1>
          <p className="muted">Use your café account.</p>
        </div>
        {notice && !error && <div className="msg info">{notice}</div>}
        {error && (
          <div className="msg error" role="alert">
            {error}
          </div>
        )}
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className={"input" + (fieldErrors.email ? " bad" : "")}
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          disabled={busy}
          aria-invalid={!!fieldErrors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className={"input" + (fieldErrors.password ? " bad" : "")}
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={busy}
          aria-invalid={!!fieldErrors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="no-signup">Accounts are created by the café. No sign-up.</p>
        <p className="credit">Photos: Shixart1985 (CC BY 2.0), Takeaway (CC BY-SA 3.0), via Wikimedia Commons.</p>
      </form>
    </div>
  );
}
