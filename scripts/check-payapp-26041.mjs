// Read-only: shows how White Board stores/derives the pay apps for a QuickBooks project number.
// Usage: node --env-file=.env.local scripts/check-payapp-26041.mjs [projectNumber]
import pg from "pg";

const number = process.argv[2] || "26041";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

try {
  const projects = (await client.query("select id, name, status, value, project_number from projects where project_number = $1", [number])).rows;
  console.log("projects with number", number, ":", projects.map((p) => `${p.name} [${p.status}] value=${p.value}`));
  for (const p of projects) {
    const apps = (await client.query("select id, app_number, period, application_date, retainage_percent from pay_apps where project_id = $1", [p.id])).rows
      .sort((a, b) => Number(a.app_number) - Number(b.app_number));
    const items = (await client.query('select item_no, description, bid_qty, unit_price, baseline_qty, "order" from sov_items where project_id = $1 order by "order"::numeric', [p.id])).rows;
    const entries = (await client.query("select pay_app_id, item_no, period_qty, stored from sov_entries where project_id = $1", [p.id])).rows;
    console.log(`\n=== ${p.name}: ${apps.length} pay apps, ${items.length} items, ${entries.length} entries`);
    console.log("pay apps:", apps.map((a) => `#${a.app_number} (${a.period || "no period"}, ret ${a.retainage_percent}%)`).join(" | "));

    const stats = (item, idx) => {
      const mine = entries.filter((e) => e.item_no === item.item_no);
      let prev = Number(item.baseline_qty) || 0;
      for (let i = 0; i < idx; i++) {
        const e = mine.find((x) => x.pay_app_id === apps[i].id);
        if (e) prev += Number(e.period_qty) || 0;
      }
      const cur = mine.find((x) => x.pay_app_id === apps[idx].id);
      const thisQty = cur ? Number(cur.period_qty) || 0 : 0;
      const stored = cur ? Number(cur.stored) || 0 : 0;
      const price = Number(item.unit_price) || 0;
      return { prev, thisQty, price, bid: (Number(item.bid_qty) || 0) * price, completed: (prev + thisQty) * price + stored };
    };

    apps.forEach((a, idx) => {
      let completed = 0, prevCompleted = 0, contract = 0, periodGross = 0;
      for (const it of items) {
        const s = stats(it, idx);
        completed += s.completed;
        contract += s.bid;
        periodGross += s.thisQty * s.price;
        if (idx > 0) prevCompleted += stats(it, idx - 1).completed;
      }
      const ret = Number(a.retainage_percent) / 100;
      const eligible = completed - completed * ret;
      const prevEligible = idx > 0 ? prevCompleted - prevCompleted * ret : 0;
      console.log(`App ${a.app_number}: contract ${money(contract)} | total completed ${money(completed)} | prior ${money(prevCompleted)} | this period (qty x price) ${money(periodGross)} | eligible ${money(eligible)} | due ${money(eligible - prevEligible)}`);
    });

    console.log("\nitems (baseline qty = progress before White Board, then period qty per app):");
    for (const it of items) {
      const per = apps.map((a) => {
        const e = entries.find((x) => x.item_no === it.item_no && x.pay_app_id === a.id);
        return e ? `${Number(e.period_qty)}${Number(e.stored) ? `+stored ${e.stored}` : ""}` : "-";
      });
      console.log(`${String(it.item_no).padEnd(5)} ${String(it.description || "").slice(0, 44).padEnd(44)} bid ${String(Number(it.bid_qty)).padStart(6)} @ ${String(Number(it.unit_price)).padStart(10)}  baseline ${String(Number(it.baseline_qty)).padStart(6)}  periods: ${per.join(" / ")}`);
    }
  }
} finally {
  await client.end();
}
