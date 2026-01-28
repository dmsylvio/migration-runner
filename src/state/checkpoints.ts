import { postgres } from "../db/postgres.js";
import type { Checkpoint, CheckpointType } from "./schema.js";

export async function getCheckpoint(
  entity: string,
): Promise<Checkpoint | null> {
  const res = await postgres.query(
    `select entity, checkpoint_type, checkpoint_value
     from migration.migration_checkpoints
     where entity = $1`,
    [entity],
  );
  return res.rows[0] ?? null;
}

export async function setCheckpoint(
  entity: string,
  type: CheckpointType,
  value: string,
) {
  await postgres.query(
    `insert into migration.migration_checkpoints (entity, checkpoint_type, checkpoint_value)
     values ($1, $2, $3)
     on conflict (entity) do update set
       checkpoint_type = excluded.checkpoint_type,
       checkpoint_value = excluded.checkpoint_value,
       updated_at = now()`,
    [entity, type, value],
  );
}
