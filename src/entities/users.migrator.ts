import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";
import { hashSync } from "bcryptjs";

const ENTITY = "users";

// ✅ Novo schema (Drizzle):
// users: id(text uuidv7 default), old_id(text), email unique not null, name, avatar, password not null, role not null, created_at, updated_at
// ✅ UPSERT por email (único)
const TARGET_TABLE = "users";

type LegacyRole = "undefined" | "student" | "company" | "institution" | "admin";

interface LegacyUserRow extends RowDataPacket {
  co_seq_usuario: number;
  id: string; // char(36) (uuid legado)
  name: string | null;
  email: string;
  ds_senha: string;
  role: LegacyRole;
  image: string | null;
  created_at: any; // datetime
  updated_at: any; // datetime | null
}

function mapRole(
  role: LegacyRole,
): "student" | "company" | "institution" | "admin" {
  if (role === "undefined") return "student"; // ajuste se quiser outro default
  return role;
}

async function upsertUser(row: LegacyUserRow) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;

  // old_id no seu schema é text e NÃO é unique.
  // Aqui eu recomendo guardar o PK numérico do legado em string, porque costuma ser o que outras tabelas referenciam.
  // Se você quiser guardar o UUID legado (row.id) também, melhor criar uma coluna extra depois (legacy_uuid) ou uma tabela de mapeamento.
  const oldId = String(row.co_seq_usuario);

  // password no novo é NOT NULL: precisamos garantir valor.
  // Se ds_senha vier null (raro), use um placeholder e trate depois.
  const password = row.ds_senha
    ? hashSync(row.ds_senha, 12)
    : "MIGRATION_PASSWORD_MISSING";

  await postgres.query(
    `
   INSERT INTO ${TARGET_TABLE} (id, old_id, email, name, avatar, password, role, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
   ON CONFLICT (email) DO UPDATE SET
     old_id = EXCLUDED.old_id,
     name = EXCLUDED.name,
     avatar = EXCLUDED.avatar,
     password = EXCLUDED.password,
     role = EXCLUDED.role,
     updated_at = GREATEST(${TARGET_TABLE}.updated_at, EXCLUDED.updated_at)
   `,
    [
      uuidv7(), // ✅ gera id no runner
      oldId,
      row.email.trim().toLowerCase(),
      row.name,
      row.image,
      password,
      mapRole(row.role),
      createdAt,
      updatedAt,
    ],
  );

  if (row.role === "undefined") {
    logger.warn(
      { entity: ENTITY, email: row.email },
      "legacy role 'undefined' mapped to 'student'",
    );
  }
  if (!row.ds_senha) {
    logger.warn(
      { entity: ENTITY, email: row.email },
      "legacy ds_senha is NULL; placeholder written",
    );
  }
}

async function seed(runId: number) {
  logger.info({ entity: ENTITY }, "seed:start");

  let lastPk = 0;

  while (true) {
    const [rows] = await mariadb.query<LegacyUserRow[]>(
      `
      SELECT co_seq_usuario, id, name, email, ds_senha, role, image, created_at, updated_at
      FROM tb_usuario
      WHERE co_seq_usuario > :lastPk
      ORDER BY co_seq_usuario
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertUser(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_usuario ?? ""),
        error: e?.message ?? "seed failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].co_seq_usuario;
    logger.info({ entity: ENTITY, lastPk, batch: rows.length }, "seed:batch");
  }

  // checkpoint inicial: do zero, pra o sync começar a partir da época 0
  await setCheckpoint(ENTITY, "updated_at", new Date(0).toISOString());
  logger.info({ entity: ENTITY }, "seed:done");
}

async function sync(runId: number) {
  logger.info({ entity: ENTITY }, "sync:start");

  const cp = await getCheckpoint(ENTITY);
  const last = cp?.checkpoint_value
    ? new Date(cp.checkpoint_value)
    : new Date(0);

  let lastCursor = last;
  let lastPk = 0;

  while (true) {
    const [rows] = await mariadb.query<LegacyUserRow[]>(
      `
      SELECT co_seq_usuario, id, name, email, ds_senha, role, image, created_at, updated_at
      FROM tb_usuario
      WHERE (COALESCE(updated_at, created_at) > :cursor)
         OR (COALESCE(updated_at, created_at) = :cursor AND co_seq_usuario > :lastPk)
      ORDER BY COALESCE(updated_at, created_at), co_seq_usuario
      LIMIT :limit
      `,
      { cursor: lastCursor, lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertUser(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_usuario ?? ""),
        error: e?.message ?? "sync failed",
        payload: rows[0],
      });
      throw e;
    }

    const lastRow = rows[rows.length - 1];
    lastCursor = new Date((lastRow.updated_at ?? lastRow.created_at) as any);
    lastPk = lastRow.co_seq_usuario;

    logger.info(
      {
        entity: ENTITY,
        batch: rows.length,
        cursor: lastCursor.toISOString(),
        lastPk,
      },
      "sync:batch",
    );
  }

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const usersMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
