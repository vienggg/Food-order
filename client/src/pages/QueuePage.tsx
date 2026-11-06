import { useCallback, useEffect, useState } from "react";
import { api, ApiError, NETWORK_MESSAGE } from "../api";
import { formatBaht as baht } from "../lib/money";
import { formatPlacedTime } from "../lib/time";

type QueueOrder = {
  id: number;
  total: number;
  createdAt: string;
  customer: { id: number; name: string };
  lines: { name: string; quantity: number }[];
};

const items = (o: QueueOrder) => o.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ");

export function QueuePage() {
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setOrders(await api<QueueOrder[]>("/api/operator/orders?status=PLACED"));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(id: number) {
    setBusyId(id);
    setMessage(null);
    try {
      await api(`/api/operator/orders/${id}/accept`, { method: "POST" });
      setMessage({ kind: "success", text: `Order #${id} accepted.` });
      setOrders((list) => list?.filter((o) => o.id !== id) ?? null);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      if (e?.status === 409) setMessage({ kind: "error", text: `Order #${id}: ${e.message}` });
      else if (e?.status === 404) setMessage({ kind: "error", text: `Order #${id} no longer exists.` });
      else setMessage({ kind: "error", text: NETWORK_MESSAGE });
      if (e?.status === 409 || e?.status === 404) await load(); // what is on screen is out of date
    } finally {
      setBusyId(null);
    }
  }

  const refresh = (
    <button className="btn ghost small" onClick={load}>
      Refresh queue
    </button>
  );

  if (loadError)
    return (
      <div className="empty">
        <p className="empty-title">Couldn't load orders.</p>
        <button className="btn inline" onClick={load}>
          Reload queue
        </button>
      </div>
    );
  if (!orders)
    return (
      <div aria-busy="true">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );

  const now = Date.now();
  const oldestMin = orders.length ? Math.floor((now - Date.parse(orders[0].createdAt)) / 60000) : 0;
  const stats = [
    { label: "Waiting orders", value: String(orders.length) },
    { label: "Oldest waiting", value: `${oldestMin} min` },
    { label: "Items to make", value: String(orders.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.quantity, 0), 0)) },
    { label: "Queue value", value: baht(orders.reduce((n, o) => n + o.total, 0)) },
  ];

  return (
    <section>
      <div className="queue-head">
        <h2 className="section-title">
          New orders <span className="count">{orders.length}</span>
        </h2>
        {refresh}
      </div>
      {message && (
        <div className={"msg " + message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
      <div className="stats">
        {stats.map((s) => (
          <div className="stat card" key={s.label}>
            <p className="muted">{s.label}</p>
            <p className="stat-value">{s.value}</p>
          </div>
        ))}
      </div>
      {orders.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No new orders.</p>
          <p className="muted">New orders appear here when you refresh.</p>
        </div>
      ) : (
        // Phone: one card per order. Desktop: the same items laid out as table rows (styles.css).
        <ul className="queue">
          <li className="queue-headrow" aria-hidden="true">
            <span>Order</span>
            <span>Customer</span>
            <span>Items</span>
            <span>Placed</span>
            <span>Total</span>
            <span>Action</span>
          </li>
          {orders.map((o) => (
            <li className="card order-card" key={o.id} data-testid={`order-${o.id}`}>
              <span className="q-no order-no">#{o.id}</span>
              <span className="q-pill pill placed">PLACED</span>
              <span className="q-who">{o.customer.name}</span>
              <span className="q-time muted">{formatPlacedTime(o.createdAt)}</span>
              <span className="q-items muted">{items(o)}</span>
              <strong className="q-total">{baht(o.total)}</strong>
              <button className="q-action btn small" disabled={busyId === o.id} onClick={() => accept(o.id)}>
                {busyId === o.id ? "Accepting…" : "Accept order"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
