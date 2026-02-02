import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "state";

// ✅ Novo schema (Drizzle):
// state: id(text uuidv7), old_id(text), name(text not null), acronym(varchar(2) not null), created_at, updated_at
// ✅ UPSERT por old_id ou acronym
const TARGET_TABLE = "state";

interface LegacyStateRow extends RowDataPacket {
  id: number; // int(11) PK
  estado: string; // varchar(40) -> name
  uf: string; // varchar(2) -> acronym
}

async function upsertState(row: LegacyStateRow) {
  const now = new Date();
  const oldId = String(row.id);
  const acronym = row.uf.trim().toUpperCase();
  const name = row.estado.trim();

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (id, old_id, name, acronym, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [uuidv7(), oldId, name, acronym, now, now],
    );
  } catch (e: any) {
    // Se falhar (provavelmente duplicado), tentar atualizar
    // Verificar se existe pelo old_id primeiro (mais confiável)
    const existingRes = await postgres.query(
      `SELECT id FROM ${TARGET_TABLE} WHERE old_id = $1 LIMIT 1`,
      [oldId],
    );

    if (existingRes.rows && existingRes.rows.length > 0) {
      const existingRow = existingRes.rows[0] as { id: string };
      // Atualizar pelo old_id
      await postgres.query(
        `
        UPDATE ${TARGET_TABLE}
        SET name = $1, acronym = $2, updated_at = $3
        WHERE id = $4
        `,
        [name, acronym, now, existingRow.id],
      );
    } else {
      // Tentar atualizar pelo acronym se não encontrou pelo old_id
      const byAcronymRes = await postgres.query(
        `SELECT id FROM ${TARGET_TABLE} WHERE acronym = $1 LIMIT 1`,
        [acronym],
      );

      if (byAcronymRes.rows && byAcronymRes.rows.length > 0) {
        const acronymRow = byAcronymRes.rows[0] as { id: string };
        await postgres.query(
          `
          UPDATE ${TARGET_TABLE}
          SET old_id = $1, name = $2, updated_at = $3
          WHERE id = $4
          `,
          [oldId, name, now, acronymRow.id],
        );
      } else {
        // Se não encontrou de nenhuma forma, relançar o erro original
        throw e;
      }
    }
  }
}

async function seed(runId: number) {
  logger.info({ entity: ENTITY }, "seed:start");

  let lastPk = 0;
  const maxOldIdRes = await postgres.query(
    `SELECT old_id FROM ${TARGET_TABLE} WHERE old_id ~ '^[0-9]+$' ORDER BY old_id::bigint DESC LIMIT 1`,
  );
  if (maxOldIdRes.rows?.length && maxOldIdRes.rows[0]) {
    const maxOldId = parseInt((maxOldIdRes.rows[0] as { old_id: string }).old_id, 10);
    if (!Number.isNaN(maxOldId)) {
      lastPk = maxOldId;
      logger.info({ entity: ENTITY, resumingFromOldId: lastPk }, "seed:resume from last old_id in postgres");
    }
  }

  while (true) {
    const [rows] = await mariadb.query<LegacyStateRow[]>(
      `
      SELECT id, estado, uf
      FROM tb_estados
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertState(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.id ?? ""),
        error: e?.message ?? "seed failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].id;
    logger.info({ entity: ENTITY, lastPk, batch: rows.length }, "seed:batch");
  }

  // checkpoint inicial: do zero, pra o sync começar a partir da época 0
  await setCheckpoint(ENTITY, "updated_at", new Date(0).toISOString());
  logger.info({ entity: ENTITY }, "seed:done");
}

async function sync(runId: number) {
  logger.info({ entity: ENTITY }, "sync:start");

  // Como tb_estados não tem updated_at, vamos usar uma estratégia diferente:
  // sincronizar apenas novos registros baseado no id
  let lastPk = 0;

  // Buscar o último old_id migrado no postgres
  const lastMigratedRes = await postgres.query(
    `SELECT old_id FROM ${TARGET_TABLE} WHERE old_id IS NOT NULL ORDER BY CAST(old_id AS INTEGER) DESC LIMIT 1`,
  );

  if (lastMigratedRes.rows && lastMigratedRes.rows.length > 0) {
    const row = lastMigratedRes.rows[0] as { old_id: string };
    lastPk = parseInt(row.old_id, 10) || 0;
  }

  while (true) {
    const [rows] = await mariadb.query<LegacyStateRow[]>(
      `
      SELECT id, estado, uf
      FROM tb_estados
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertState(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.id ?? ""),
        error: e?.message ?? "sync failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].id;

    logger.info(
      {
        entity: ENTITY,
        batch: rows.length,
        lastPk,
      },
      "sync:batch",
    );
  }

  await setCheckpoint(ENTITY, "updated_at", new Date().toISOString());
  logger.info({ entity: ENTITY }, "sync:done");
}

export const stateMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
