import pg from "pg";

const sql = process.argv[2];
if (!sql) {
  console.error("Usage: node --env-file=.env.local scripts/run-sql.mjs \"SQL HERE\"");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(sql);
console.log(result.command, result.rowCount, "row(s)");
await client.end();
