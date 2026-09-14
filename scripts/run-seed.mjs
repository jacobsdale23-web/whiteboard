import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const target = process.argv[2] || "seed.sql";
const filePath = path.resolve(target);
const sql = readFileSync(filePath, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
await client.end();
console.log(`${target} executed successfully.`);
