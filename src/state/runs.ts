import { postgres } from "../db/postgres.js";
import type { RunMode } from "./schema.js";

export async function startRun(mode: RunMode, notes?: string) {
  const res = await postgres.query(
    `insert into migration.migration_runs (mode, notes) values ($1, $2) returning id`,
    [mode, notes ?? null],
  );
  return res.rows[0].id as number;
}

export async function finishRun(runId: number, status: "success" | "failed") {
  await postgres.query(
    `update migration.migration_runs set status=$2, finished_at=now() where id=$1`,
    [runId, status],
  );
}
