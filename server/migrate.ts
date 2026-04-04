import "dotenv/config";
import { initDb, pool } from "./lib/db";

async function runMigration(): Promise<void> {
  try {
    await initDb();
    console.log("Database schema is ready.");
  } catch (error) {
    console.error("Migration failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void runMigration();
