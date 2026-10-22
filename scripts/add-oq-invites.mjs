// OQ practice invite links (no account needed). Additive and re-runnable.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const steps = [
  `create table if not exists oq_invites (
     id text primary key,
     token text not null unique,
     name text not null,
     email text,
     company_id text not null,
     employee_id text,
     created_by text not null,
     created_at timestamp not null default now(),
     revoked_at timestamp,
     last_used_at timestamp,
     use_count integer not null default 0,
     sent_at timestamp
   )`,
  `create index if not exists oq_invites_employee on oq_invites (employee_id)`,
];

for (const s of steps) {
  const r = await client.query(s);
  console.log(r.command, "-", s.split("\n")[0].slice(0, 80));
}
await client.end();

