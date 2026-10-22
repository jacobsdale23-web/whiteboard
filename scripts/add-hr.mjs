// HR module tables. Additive and re-runnable.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const steps = [
  `alter table profiles add column if not exists is_hr boolean not null default false`,
  `create table if not exists hr_employees (
     id text primary key,
     company_id text not null,
     name text not null,
     position text,
     phone text,
     email text,
     hire_date text,
     status text not null default 'active',
     terminated_date text,
     da_program text not null default 'pending',
     da_enrolled_date text,
     notes text,
     candidate_id text,
     created_at timestamp not null default now()
   )`,
  `create table if not exists hr_candidates (
     id text primary key,
     company_id text not null,
     name text not null,
     phone text,
     email text,
     position text,
     source text,
     stage text not null default 'applied',
     applied_date text,
     notes text,
     employee_id text,
     created_at timestamp not null default now(),
     updated_at timestamp not null default now()
   )`,
  `create table if not exists hr_drug_tests (
     id text primary key,
     candidate_id text,
     employee_id text,
     test_type text not null default 'pre_employment',
     substance text not null default 'both',
     ordered_date text,
     collected_date text,
     result_date text,
     facility text,
     status text not null default 'ordered',
     notes text,
     storage_key text,
     filename text,
     content_type text,
     created_by text not null,
     created_at timestamp not null default now()
   )`,
  `create table if not exists hr_oq_quals (
     id text primary key,
     employee_id text not null,
     task_code text not null,
     task_name text not null,
     qualified_date text not null,
     expires_date text,
     notes text,
     created_at timestamp not null default now()
   )`,
  `create unique index if not exists hr_oq_quals_uniq on hr_oq_quals (employee_id, task_code)`,
  `create index if not exists hr_drug_tests_candidate on hr_drug_tests (candidate_id)`,
  `create index if not exists hr_drug_tests_employee on hr_drug_tests (employee_id)`,
];

for (const s of steps) {
  const r = await client.query(s);
  console.log(r.command, "-", s.split("\n")[0].slice(0, 80));
}
await client.end();
