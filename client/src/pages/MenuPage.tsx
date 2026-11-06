import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, NETWORK_MESSAGE } from "../api";
import { useCart } from "../cart";
import { canAddFromMenu, estimatedTotal, MAX_QTY } from "../lib/cart";
import { formatBaht } from "../lib/money";
import type { Order } from "../lib/orders";

export type MenuItem = { id: number; name: string; price: number; isAvailable: boolean };

type Load = { state: "loading" } | { state: "error" } | { state: "ok"; items: MenuItem[] };

// Loads GET /api/menu. `reload` is also used by F-03 after a rejected order (fresh sold-out flags).
export function useMenu() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const reload = useCallback(() => {
    setLoad({ state: "loading" });
    api<MenuItem[]>("/api/menu")
      .then((items) => setLoad({ state: "ok", items }))
      .catch(() => setLoad({ state: "error" })); // 401 is handled by api(); anything else shows the error state
  }, []);
  useEffect(reload, [reload]);
  return { load, reload };
}

type ListProps = {
  load: Load;
  reload: () => void;
  onAdd?: (item: MenuItem) => void; // wired by F-03 (cart)
  inCart?: Record<number, number>; // menuItemId -> quantity
  addDisabledFor?: (item: MenuItem) => boolean; // e.g. cart full
};

export function MenuList({ load, reload, onAdd, inCart = {}, addDisabledFor }: ListProps) {
  if (load.state === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading menu">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className="empty" role="alert">
        <p className="empty-title">Couldn't load the menu. Check your connection.</p>
        <button className="btn inline small" onClick={reload}>
          Reload menu
        </button>
      </div>
    );
  }
  if (load.items.length === 0) {
    return (
      <div className="empty">
        <p>Nothing on the menu yet. Please check back later.</p>
      </div>
    );
  }
  return (
    <ul className="menu-list">
      {load.items.map((item) => {
        const qty = inCart[item.id] ?? 0;
        return (
          <li key={item.id} className={"menu-item" + (item.isAvailable ? "" : " sold-out")}>
            <div>
              <p className="menu-name">{item.name}</p>
              <p className="menu-price">{formatBaht(item.price)}</p>
              {!item.isAvailable && <span className="badge sold">Sold out</span>}
              {qty > 0 && <span className="badge in-cart">In cart · {qty}</span>}
            </div>
            <button
              className="add"
              aria-label={`Add ${item.name}`}
              disabled={!item.isAvailable || !onAdd || !!addDisabledFor?.(item)}
              onClick={() => onAdd?.(item)}
            >
              +
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function MenuPage() {
  const { load, reload } = useMenu();
  const { cart, dispatch } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const showCartOnPhone = location.hash === "#cart";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const [badLines, setBadLines] = useState<Record<number, string>>({});

  const inCart = Object.fromEntries(cart.lines.map((l) => [l.menuItemId, l.quantity]));
  const count = cart.lines.reduce((n, l) => n + l.quantity, 0);
  const total = estimatedTotal(cart);
  const full = !canAddFromMenu(cart);
  const fullMsg = "Cart is full (20 different items max).";

  async function placeOrder() {
    setSubmitting(true);
    setError(null);
    try {
      // Only ids and quantities: the server owns prices and the total (BR-04).
      const items = cart.lines.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }));
      const order = await api<Order>("/api/orders", { method: "POST", body: { items } });
      dispatch({ type: "clear" });
      setBadLines({});
      navigate(`/orders/${order.id}`, { state: { placed: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError({ text: err.message, retry: false });
        const bad = (err.details as { items?: { menuItemId: number; reason: string }[] } | null)?.items ?? [];
        setBadLines(Object.fromEntries(bad.map((b) => [b.menuItemId, REASON[b.reason] ?? "Check this item."])));
        reload(); // sold-out flags may have changed since the page loaded
      } else if (!(err instanceof ApiError && err.status === 401)) {
        setError({ text: NETWORK_MESSAGE, retry: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cartPanel = (
    <section className="cart" aria-label="Cart">
      <div className="cart-head">
        <div>
          <h2 className="title">Your cart</h2>
          <p className="muted">
            {count} {count === 1 ? "item" : "items"} · pickup ASAP
          </p>
        </div>
        <button className="msg-close static" aria-label="Close cart" onClick={() => navigate("/menu")}>
          ×
        </button>
      </div>
      {error && (
        <div className="msg error" role="alert">
          {error.text}
          {error.retry && (
            <button className="btn inline small" onClick={placeOrder} disabled={submitting}>
              Try again
            </button>
          )}
        </div>
      )}
      {cart.lines.length === 0 ? (
        <div>
          <p className="muted">Your cart is empty. Add something from the menu.</p>
          <button className="btn ghost small phone-only" onClick={() => navigate("/menu")}>
            Browse the menu
          </button>
        </div>
      ) : (
        <ul className="cart-lines">
          {cart.lines.map((l) => (
            <li key={l.menuItemId} className={"cart-line" + (badLines[l.menuItemId] ? " bad" : "")}>
              <div className="cart-line-top">
                <span className="menu-name">{l.name}</span>
                <span>{formatBaht(l.price * l.quantity)}</span>
              </div>
              <div className="cart-line-top">
                <div className="stepper">
                  <button
                    aria-label={`Fewer ${l.name}`}
                    title={l.quantity <= 1 ? "Min 1 — use ✕ to remove." : undefined}
                    disabled={submitting || l.quantity <= 1}
                    onClick={() => dispatch({ type: "setQty", menuItemId: l.menuItemId, quantity: l.quantity - 1 })}
                  >
                    −
                  </button>
                  <input
                    aria-label={`Quantity of ${l.name}`}
                    type="number"
                    min={1}
                    max={MAX_QTY}
                    value={l.quantity}
                    disabled={submitting}
                    onChange={(e) => dispatch({ type: "setQty", menuItemId: l.menuItemId, quantity: Number(e.target.value) })}
                  />
                  <button
                    aria-label={`More ${l.name}`}
                    title={l.quantity >= MAX_QTY ? "Max 10 per item." : undefined}
                    disabled={submitting || l.quantity >= MAX_QTY}
                    onClick={() => dispatch({ type: "setQty", menuItemId: l.menuItemId, quantity: l.quantity + 1 })}
                  >
                    +
                  </button>
                </div>
                <button
                  className="remove"
                  aria-label={`Remove ${l.name}`}
                  disabled={submitting}
                  onClick={() => {
                    dispatch({ type: "remove", menuItemId: l.menuItemId });
                    setBadLines(({ [l.menuItemId]: _, ...rest }) => rest);
                  }}
                >
                  ✕
                </button>
              </div>
              {l.quantity >= MAX_QTY && <p className="hint">Max 10 per item.</p>}
              {l.quantity <= 1 && <p className="hint">Min 1. Use ✕ to remove.</p>}
              {badLines[l.menuItemId] && <p className="field-error">{badLines[l.menuItemId]}</p>}
            </li>
          ))}
        </ul>
      )}
      {full && <div className="msg info">{fullMsg}</div>}
      <p className="muted">Pickup: ASAP</p>
      <div className="cart-total">
        <span>Estimated total</span>
        <strong>{formatBaht(total)}</strong>
      </div>
      <button className="btn" onClick={placeOrder} disabled={submitting || cart.lines.length === 0}>
        {submitting ? "Placing order…" : "Place order →"}
      </button>
      <p className="hint center-text">The final total is calculated by the café.</p>
    </section>
  );

  return (
    <div className={"menu-layout" + (showCartOnPhone ? " cart-open" : "")}>
      <div className="menu-main">
        <section className="banner">
          <p className="banner-title">Order ahead. Skip the line.</p>
          <p className="banner-sub">Coffee and snacks from ฿35. Pickup ASAP at the counter.</p>
        </section>
        {load.state === "ok" && load.items.length > 0 && (
          <div className="section-head">
            <h2 className="section-title">Today's menu</h2>
            <p className="muted">{load.items.length} items · sold-out items can't be added</p>
          </div>
        )}
        {full && <p className="hint">{fullMsg}</p>}
        <MenuList
          load={load}
          reload={reload}
          inCart={inCart}
          onAdd={(item) => dispatch({ type: "add", item })}
          addDisabledFor={() => full}
        />
        {count > 0 && (
          <button className="cart-bar" onClick={() => navigate("/menu#cart")}>
            {count} {count === 1 ? "item" : "items"} · {formatBaht(total)} · View cart →
          </button>
        )}
      </div>
      {cartPanel}
    </div>
  );
}

const REASON: Record<string, string> = {
  SOLD_OUT: "Sold out — remove this item.",
  NOT_FOUND: "No longer on the menu — remove this item.",
  DUPLICATE: "This item appears twice.",
};
