import pg from "pg";

const sql = process.argv[2];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(sql);
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
