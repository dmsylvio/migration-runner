import { postgres } from "../db/postgres.js";

export async function logError(args: {
  runId: number;
  entity: string;
  sourcePk?: string;
  error: string;
  payload?: unknown;
}) {
  await postgres.query(
    `insert into migration.migration_errors (run_id, entity, source_pk, error, payload)
     values ($1, $2, $3, $4, $5)`,
    [
      args.runId,
      args.entity,
      args.sourcePk ?? null,
      args.error,
      args.payload ? JSON.stringify(args.payload) : null,
    ],
  );
}
