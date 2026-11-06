import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { formatBaht } from "../lib/money";
import type { Order, OrderStatus, OrderSummary } from "../lib/orders";
import { formatPlacedTime } from "../lib/time";

function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
}

function Skeletons() {
  return (
    <div aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

// /orders and /orders/:id. Desktop: list and detail side by side (DesktopOrders.html).
// Phone: the list, or the detail when an order is open.
export function OrdersSplit() {
  const { id } = useParams();
  return (
    <div className={"orders-split" + (id ? " has-detail" : "")}>
      <section className="split-list">
        <OrdersPage selectedId={id} />
      </section>
      <section className="split-detail">
        {id ? (
          <OrderDetailPage key={id} />
        ) : (
          <div className="empty">
            <p className="muted">Select an order to see its details.</p>
          </div>
        )}
      </section>
    </div>
  );
}

// S3 My orders (F-03): own orders, newest first. Refresh by hand (no polling in Sprint 1).
export function OrdersPage({ selectedId }: { selectedId?: string }) {
  const [orders, setOrders] = useState<OrderSummary[] | "loading" | "error">("loading");
  const navigate = useNavigate();
  const load = useCallback(() => {
    setOrders("loading");
    api<OrderSummary[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders("error"));
  }, []);
  useEffect(load, [load]);

  if (orders === "loading") return <Skeletons />;
  if (orders === "error")
    return (
      <div className="empty" role="alert">
        <p className="empty-title">Couldn't load your orders.</p>
        <button className="btn inline small" onClick={load}>
          Reload orders
        </button>
      </div>
    );
  if (orders.length === 0)
    return (
      <div className="empty">
        <p>No orders yet. Your orders will show up here.</p>
        <Link className="btn inline small" to="/menu">
          Browse the menu
        </Link>
      </div>
    );
  return (
    <>
      <button className="btn ghost small refresh" onClick={load}>
        Refresh list
      </button>
      <ul className="order-list">
        <li className="order-headrow" aria-hidden="true">
          <span>Order</span>
          <span>Placed</span>
          <span>Status</span>
          <span>Total</span>
        </li>
        {orders.map((o) => (
          <li key={o.id}>
            <button
              className="order-row"
              aria-current={String(o.id) === selectedId ? "true" : undefined}
              onClick={() => navigate(`/orders/${o.id}`)}
            >
              <span className="order-no">#{o.id}</span>
              <span className="muted">
                {formatPlacedTime(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
              </span>
              <StatusPill status={o.status} />
              <strong>{formatBaht(o.total)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const HINT: Partial<Record<OrderStatus, string>> = {
  PLACED: "Waiting for the café to accept your order.",
  ACCEPTED: "Accepted — being prepared soon.",
};

// S4 Order detail (F-03): lines and total come from the order itself (BR-05), never from the menu.
export function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const justPlaced = (location.state as { placed?: boolean } | null)?.placed;
  const [order, setOrder] = useState<Order | "loading" | "notfound" | "error">("loading");

  const load = useCallback(() => {
    setOrder("loading");
    api<Order>(`/api/orders/${id}`)
      .then(setOrder)
      .catch((e) => setOrder(e instanceof ApiError && (e.status === 404 || e.status === 400) ? "notfound" : "error"));
  }, [id]);
  useEffect(load, [load]);

  const back = (
    <Link to="/orders" className="back">
      ← My orders
    </Link>
  );
  if (order === "loading") return <Skeletons />;
  if (order === "notfound")
    return (
      <div className="empty">
        <p className="empty-title">Order not found.</p>
        <Link to="/orders">Back to my orders</Link>
      </div>
    );
  if (order === "error")
    return (
      <div className="empty" role="alert">
        <p className="empty-title">Couldn't load this order.</p>
        <button className="btn inline small" onClick={load}>
          Reload order
        </button>
      </div>
    );

  return (
    <div className="order-detail">
      {back}
      {justPlaced && (
        <div className="msg success" role="status">
          Order #{order.id} placed!
        </div>
      )}
      <div className="card">
        <div className="cart-line-top">
          <h2 className="title">Order #{order.id}</h2>
          <StatusPill status={order.status} />
        </div>
        <p className="muted">
          Placed {formatPlacedTime(order.createdAt)} · Pickup: ASAP
        </p>
        <table className="lines">
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.menuItemId}>
                <td>{l.name}</td>
                <td className="muted">
                  {formatBaht(l.unitPrice)} × {l.quantity}
                </td>
                <td className="num">{formatBaht(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cart-total">
          <span>Total</span>
          <strong>{formatBaht(order.total)}</strong>
        </div>
        <p className="muted">{HINT[order.status]}</p>
        <ol className="timeline">
          <li>Placed {formatPlacedTime(order.createdAt)}</li>
          <li>{order.acceptedAt ? `Accepted ${formatPlacedTime(order.acceptedAt)}` : "Waiting for the café"}</li>
        </ol>
        <button className="btn ghost small" onClick={load}>
          Refresh status
        </button>
      </div>
    </div>
  );
}
