import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "institutions";

// ✅ Novo schema (Drizzle):
// institutions: id(text uuidv7), old_id(text), user_id(text not null), notes, legal_name, trade_name, activities,
// cnpj_number, state_registration, address, city, state_id, zip_code, phone, whatsapp, created_at, updated_at
// ✅ UPSERT por id (UUID) ou old_id
const TARGET_TABLE = "institutions";

interface LegacyInstitutionRow extends RowDataPacket {
  co_seq_instituicao: number; // int(10) PK
  id: string | null; // char(36) UUID (pode ser null)
  user_id: number; // int(11) -> precisa converter para UUID
  ds_razao_social: string; // varchar(100) -> legal_name
  ds_nome_fantasia: string; // varchar(100) -> trade_name
  ds_atividade: string | null; // varchar(100) -> activities
  nu_cnpj: string; // varchar(18) -> cnpj_number
  ds_insc_est: string | null; // varchar(100) -> state_registration
  ds_endereco: string; // varchar(100) -> address
  ds_cidade: string; // varchar(100) -> city
  ds_uf: string; // char(2) -> precisa converter para state_id UUID
  nu_cep: string | null; // varchar(10) -> zip_code
  nu_telefone: string; // varchar(16) -> phone
  ds_obs_futura_inst: string | null; // text -> notes
  dt_cadastro: any; // datetime -> created_at
  created_at: any; // datetime -> created_at (priorizar)
  updated_at: any; // datetime -> updated_at
}

// Cache para evitar múltiplas queries
const userIdCache = new Map<number, string>();
const stateIdCache = new Map<string, string>();

async function getUserIdFromOldId(oldUserId: number): Promise<string | null> {
  if (userIdCache.has(oldUserId)) {
    return userIdCache.get(oldUserId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM users WHERE old_id = $1 LIMIT 1`,
    [String(oldUserId)],
  );

  if (res.rows && res.rows.length > 0) {
    const userId = (res.rows[0] as { id: string }).id;
    userIdCache.set(oldUserId, userId);
    return userId;
  }

  return null;
}

async function getStateIdFromAcronym(acronym: string): Promise<string | null> {
  const upperAcronym = acronym.trim().toUpperCase();
  if (stateIdCache.has(upperAcronym)) {
    return stateIdCache.get(upperAcronym) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM state WHERE acronym = $1 LIMIT 1`,
    [upperAcronym],
  );

  if (res.rows && res.rows.length > 0) {
    const stateId = (res.rows[0] as { id: string }).id;
    stateIdCache.set(upperAcronym, stateId);
    return stateId;
  }

  return null;
}

async function upsertInstitution(row: LegacyInstitutionRow) {
  const createdAt = row.created_at
    ? new Date(row.created_at)
    : row.dt_cadastro
      ? new Date(row.dt_cadastro)
      : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;

  // Sempre gerar novo UUID v7 (melhor que UUIDs antigos que não usam timestamp)
  const institutionId = uuidv7();
  const oldId = String(row.co_seq_instituicao);

  // Converter user_id (int) para UUID
  const userId = await getUserIdFromOldId(row.user_id);
  if (!userId) {
    throw new Error(
      `User not found for old_id: ${row.user_id} (institution: ${oldId})`,
    );
  }

  // Converter ds_uf para state_id UUID
  const stateId = await getStateIdFromAcronym(row.ds_uf);
  if (!stateId) {
    throw new Error(
      `State not found for acronym: ${row.ds_uf} (institution: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, user_id, notes, legal_name, trade_name, activities,
        cnpj_number, state_registration, address, city, state_id, zip_code,
        phone, whatsapp, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        institutionId,
        oldId,
        userId,
        row.ds_obs_futura_inst,
        row.ds_razao_social.trim(),
        row.ds_nome_fantasia.trim(),
        row.ds_atividade?.trim() || null,
        row.nu_cnpj.trim(),
        row.ds_insc_est?.trim() || null,
        row.ds_endereco.trim(),
        row.ds_cidade.trim(),
        stateId,
        row.nu_cep?.trim() || null,
        row.nu_telefone.trim(),
        null, // whatsapp não existe no antigo
        createdAt,
        updatedAt,
      ],
    );
  } catch (e: any) {
    // Se falhar (provavelmente duplicado), tentar atualizar
    // Verificar se existe pelo id (UUID) ou old_id
    const existingRes = await postgres.query(
      `SELECT id FROM ${TARGET_TABLE} WHERE id = $1 OR old_id = $2 LIMIT 1`,
      [institutionId, oldId],
    );

    if (existingRes.rows && existingRes.rows.length > 0) {
      const existingRow = existingRes.rows[0] as { id: string };
      // Atualizar registro existente
      await postgres.query(
        `
        UPDATE ${TARGET_TABLE}
        SET old_id = $1, user_id = $2, notes = $3, legal_name = $4, trade_name = $5,
            activities = $6, cnpj_number = $7, state_registration = $8, address = $9,
            city = $10, state_id = $11, zip_code = $12, phone = $13, updated_at = $14
        WHERE id = $15
        `,
        [
          oldId,
          userId,
          row.ds_obs_futura_inst,
          row.ds_razao_social.trim(),
          row.ds_nome_fantasia.trim(),
          row.ds_atividade?.trim() || null,
          row.nu_cnpj.trim(),
          row.ds_insc_est?.trim() || null,
          row.ds_endereco.trim(),
          row.ds_cidade.trim(),
          stateId,
          row.nu_cep?.trim() || null,
          row.nu_telefone.trim(),
          updatedAt,
          existingRow.id,
        ],
      );
    } else {
      // Se não encontrou de nenhuma forma, relançar o erro original
      throw e;
    }
  }
}

async function seed(runId: number) {
  logger.info({ entity: ENTITY }, "seed:start");

  let lastPk = 0;

  while (true) {
    const [rows] = await mariadb.query<LegacyInstitutionRow[]>(
      `
      SELECT co_seq_instituicao, id, user_id, ds_razao_social, ds_nome_fantasia,
             ds_atividade, nu_cnpj, ds_insc_est, ds_endereco, ds_cidade, ds_uf,
             nu_cep, nu_telefone, ds_obs_futura_inst, dt_cadastro, created_at, updated_at
      FROM tb_instituicao
      WHERE co_seq_instituicao > :lastPk
      ORDER BY co_seq_instituicao
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInstitution(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_instituicao ?? ""),
        error: e?.message ?? "seed failed",
        payload: rows[0],
      });
      throw e;
    }

    lastPk = rows[rows.length - 1].co_seq_instituicao;
    logger.info({ entity: ENTITY, lastPk, batch: rows.length }, "seed:batch");
  }

  // Limpar cache após seed
  userIdCache.clear();
  stateIdCache.clear();

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
    const [rows] = await mariadb.query<LegacyInstitutionRow[]>(
      `
      SELECT co_seq_instituicao, id, user_id, ds_razao_social, ds_nome_fantasia,
             ds_atividade, nu_cnpj, ds_insc_est, ds_endereco, ds_cidade, ds_uf,
             nu_cep, nu_telefone, ds_obs_futura_inst, dt_cadastro, created_at, updated_at
      FROM tb_instituicao
      WHERE (COALESCE(updated_at, created_at, dt_cadastro) > :cursor)
         OR (COALESCE(updated_at, created_at, dt_cadastro) = :cursor AND co_seq_instituicao > :lastPk)
      ORDER BY COALESCE(updated_at, created_at, dt_cadastro), co_seq_instituicao
      LIMIT :limit
      `,
      { cursor: lastCursor, lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInstitution(r);
      }
    } catch (e: any) {
      await logError({
        runId,
        entity: ENTITY,
        sourcePk: String(rows[0]?.co_seq_instituicao ?? ""),
        error: e?.message ?? "sync failed",
        payload: rows[0],
      });
      throw e;
    }

    const lastRow = rows[rows.length - 1];
    lastCursor = new Date(
      (lastRow.updated_at ?? lastRow.created_at ?? lastRow.dt_cadastro) as any,
    );
    lastPk = lastRow.co_seq_instituicao;

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

  // Limpar cache após sync
  userIdCache.clear();
  stateIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const institutionsMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
