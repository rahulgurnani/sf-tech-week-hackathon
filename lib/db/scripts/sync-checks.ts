import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { db, pool } from "../src/index";
import * as schema from "../src/schema";

// drizzle-kit push does not reliably update an existing CHECK's definition.
// Reconcile declared checks atomically; this never removes or resets records.
try {
  await db.transaction(async tx => {
    for (const table of Object.values(schema)) {
      if (!is(table, PgTable)) continue;
      for (const check of getTableConfig(table).checks) {
        await tx.execute(sql`ALTER TABLE ${table}
          DROP CONSTRAINT IF EXISTS ${sql.identifier(check.name)},
          ADD CONSTRAINT ${sql.identifier(check.name)} CHECK (${check.value})`);
      }
    }
  });
  console.log("Database CHECK constraints synchronized.");
} finally {
  await pool.end();
}
