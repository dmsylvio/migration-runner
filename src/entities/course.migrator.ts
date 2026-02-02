import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "course";

// ✅ Novo schema (Drizzle):
// course: id(text uuidv7), old_id(text), name(text not null), created_at, updated_at
// ✅ UPSERT por old_id ou name
const TARGET_TABLE = "course";

interface LegacyCourseRow extends RowDataPacket {
  co_seq_confcurso: number; // int(11) PK
  no_curso: string; // varchar(255) -> name
  dt_publicado: any; // datetime -> created_at
}

async function upsertCourse(row: LegacyCourseRow) {
  const createdAt = row.dt_publicado ? new Date(row.dt_publicado) : new Date();
  const updatedAt = createdAt;
  const oldId = String(row.co_seq_confcurso);
  const name = row.no_curso?.trim() || "";

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (id, old_id, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [uuidv7(), oldId, name, createdAt, updatedAt],
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
        SET name = $1, updated_at = $2
        WHERE id = $3
        `,
        [name, updatedAt, existingRow.id],
      );
    } else {
      // Tentar atualizar pelo name se não encontrou pelo old_id
      const byNameRes = await postgres.query(
        `SELECT id FROM ${TARGET_TABLE} WHERE name = $1 LIMIT 1`,
        [name],
      );

      if (byNameRes.rows && byNameRes.rows.length > 0) {
        const nameRow = byNameRes.rows[0] as { id: string };
        await postgres.query(
          `
          UPDATE ${TARGET_TABLE}
          SET old_id = $1, updated_at = $2
          WHERE id = $3
          `,
          [oldId, updatedAt, nameRow.id],
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
    const [rows] = await mariadb.query<LegacyCourseRow[]>(
      `
      SELECT co_seq_confcurso, no_curso, dt_publicado
      FROM tb_confcurso
      WHERE co_seq_confcurso > :lastPk
      ORDER BY co_seq_confcurso
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertCourse(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_confcurso ?? ""),
        error: e?.message ?? "seed failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].co_seq_confcurso;
    logger.info({ entity: ENTITY, lastPk, batch: rows.length }, "seed:batch");
  }

  // checkpoint inicial: do zero, pra o sync começar a partir da época 0
  await setCheckpoint(ENTITY, "updated_at", new Date(0).toISOString());
  logger.info({ entity: ENTITY }, "seed:done");
}

async function sync(runId: number) {
  logger.info({ entity: ENTITY }, "sync:start");

  // Como tb_confcurso não tem updated_at, vamos usar uma estratégia diferente:
  // sincronizar apenas novos registros baseado no co_seq_confcurso
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
    const [rows] = await mariadb.query<LegacyCourseRow[]>(
      `
      SELECT co_seq_confcurso, no_curso, dt_publicado
      FROM tb_confcurso
      WHERE co_seq_confcurso > :lastPk
      ORDER BY co_seq_confcurso
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertCourse(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_confcurso ?? ""),
        error: e?.message ?? "sync failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].co_seq_confcurso;

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

export const courseMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
