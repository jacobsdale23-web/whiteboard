// Additive: stores which screening flags on a T&M invoice were marked "not a mistake" (with an optional note).
// Usage: node --env-file=.env.local scripts/add-tm-acknowledged.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("alter table tm_invoices add column if not exists acknowledged jsonb default '[]'::jsonb");
  const r = await client.query("select count(*)::int n, count(acknowledged)::int with_col from tm_invoices");
  console.log("tm_invoices rows:", r.rows[0].n, "| with acknowledged column value:", r.rows[0].with_col);
} finally {
  await client.end();
}
