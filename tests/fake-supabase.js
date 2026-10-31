// A small in-memory imitation of the supabase-js query builder, enough for the marketplace code paths.
// It does not enforce RLS (that is tested against real Postgres in supabase/tests) — it checks our calls and mapping.
const RELATIONS = {
  workshops: { workshop_services: 'workshop_id' },
  parts_stores: { products: 'store_id' },
  conversations: { messages: 'conversation_id' },
  orders: { order_items: 'order_id' },
};
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function fakeSupabase() {
  const db = {};
  const table = t => (db[t] ||= []);
  const now = () => new Date(Date.now() + seq).toISOString();

  function builder(t) {
    let rows = null, op = 'select', payload = null, filters = [], single = null, sel = '*', order = null, returning = false;
    const q = {
      select(s = '*') { if (op === 'select') sel = s; else returning = true; sel = s; return q; },
      insert(p) { op = 'insert'; payload = p; return q; },
      upsert(p) { op = 'upsert'; payload = p; return q; },
      update(p) { op = 'update'; payload = p; return q; },
      delete() { op = 'delete'; return q; },
      eq(c, v) { filters.push(r => r[c] === v); return q; },
      in(c, vs) { filters.push(r => vs.includes(r[c])); return q; },
      order(c, o = {}) { order = [c, o.ascending !== false]; return q; },
      maybeSingle() { single = 'maybe'; return q; },
      single() { single = 'one'; return q; },
      then(res, rej) { return run().then(res, rej); },
    };
    const match = r => filters.every(f => f(r));
    const nest = r => {
      const out = { ...r };
      for (const [rel, fk] of Object.entries(RELATIONS[t] || {})) if (sel.includes(rel)) out[rel] = table(rel).filter(x => x[fk] === r.id).map(x => ({ ...x }));
      return out;
    };
    async function run() {
      let data;
      if (op === 'select') {
        data = table(t).filter(match).map(nest);
        if (order) data.sort((a, b) => (a[order[0]] < b[order[0]] ? -1 : 1) * (order[1] ? 1 : -1));
      } else if (op === 'insert' || op === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: r.id || id(), created_at: now(), status: defaults(t), ...r }));
        for (const r of list) {
          const i = table(t).findIndex(x => x.id === r.id);
          if (i >= 0) table(t)[i] = { ...table(t)[i], ...r }; else table(t).push(r);
          if (t === 'order_items') { const o = table('orders').find(x => x.id === r.order_id); o.total = table('order_items').filter(x => x.order_id === o.id).reduce((s, x) => s + x.unit_price * x.qty, 0); }
        }
        data = list;
      } else if (op === 'update') {
        data = table(t).filter(match);
        data.forEach(r => Object.assign(r, payload));
      } else if (op === 'delete') {
        data = table(t).filter(match);
        db[t] = table(t).filter(r => !match(r));
      }
      if (single) data = data[0] ?? (single === 'maybe' ? null : undefined);
      return { data, error: null };
    }
    return q;
  }
  const defaults = t => (['workshops', 'parts_stores'].includes(t) ? 'pending' : t === 'orders' ? 'new' : undefined);

  const channels = [];
  return {
    db, table,
    from: builder,
    channel: name => { const ch = { name, handlers: [], on(_e, _f, cb) { ch.handlers.push(cb); return ch; }, subscribe() { channels.push(ch); return ch; } }; return ch; },
    removeChannel: ch => { const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); },
    channels,
  };
}
