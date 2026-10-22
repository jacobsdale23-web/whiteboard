// Multi-company support. Additive and re-runnable: every existing row becomes
// part of FWI (the DB default keeps the old code working while this deploys).
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const steps = [
  `create table if not exists companies (
     id text primary key,
     name text not null,
     short_name text not null,
     sort_order integer not null default 0
   )`,
  `insert into companies (id, name, short_name, sort_order) values
     ('fwi', 'Feliciana Welders, Inc.', 'FWI', 0),
     ('om', 'O&M Management', 'O&M', 1),
     ('pip', 'PIP Services', 'PIP', 2),
     ('pgroup', 'P-Group', 'P-Group', 3)
   on conflict (id) do nothing`,
  `create table if not exists profile_companies (
     profile_id text not null,
     company_id text not null,
     primary key (profile_id, company_id)
   )`,
  `alter table profiles add column if not exists all_companies boolean not null default false`,
  `alter table projects add column if not exists company_id text not null default 'fwi'`,
  `alter table opportunities add column if not exists company_id text not null default 'fwi'`,
  `alter table crew add column if not exists company_id text not null default 'fwi'`,
  `alter table foreman_crews add column if not exists company_id text not null default 'fwi'`,
  `alter table equipment_tickets add column if not exists company_id text not null default 'fwi'`,
  // "usual crew" pairs are per company now.
  `drop index if exists foreman_crews_uniq`,
  `create unique index if not exists foreman_crews_uniq on foreman_crews (company_id, lower(foreman), lower(member))`,
  // Equipment tickets belong to the company of their project.
  `update equipment_tickets t set company_id = p.company_id from projects p where p.id = t.project_id`,
  // Today's users are all FWI; the four people who work across companies get everything.
  `insert into profile_companies (profile_id, company_id)
     select id, 'fwi' from profiles where lower(email) not in ('qa-jsa-test@example.com')
   on conflict do nothing`,
  `update profiles set all_companies = true where lower(email) in
     ('jdale@felicianawelders.com','allie@felicianawelders.com','dpritchard@felicianawelders.com','spritchard@felicianawelders.com')`,
];

for (const s of steps) {
  const r = await client.query(s);
  console.log(r.command, r.rowCount ?? "", "-", s.split("\n")[0].slice(0, 80));
}
await client.end();
