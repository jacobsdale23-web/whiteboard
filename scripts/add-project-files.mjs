// Additive: documents attached to a project (original bid, contract, change orders). Files live in the same private
// bucket as the opportunity plan files; this table only records them.
// Usage: node --env-file=.env.local scripts/add-project-files.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`create table if not exists project_files (
    id text primary key,
    project_id text not null,
    kind text not null default 'Contract',
    filename text not null,
    storage_key text not null,
    file_size numeric not null default 0,
    uploaded_at timestamp not null default now()
  )`);
  await client.query("create index if not exists project_files_project_idx on project_files (project_id)");
  const r = await client.query("select count(*)::int n from project_files");
  console.log("project_files ready; rows:", r.rows[0].n);
} finally {
  await client.end();
}
