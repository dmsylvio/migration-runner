import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "company_supervisor";

// ✅ Novo schema (Drizzle):
// company_supervisor: id(text uuidv7), old_id(text), company_id(text not null), full_name, cpf_number,
// rg_number, issuing_authority, phone, whatsapp, position, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "company_supervisor";

interface LegacyCompanySupervisorRow extends RowDataPacket {
  id: number; // int(11) PK
  empresa_id: string; // char(36) UUID -> precisa converter para company_id UUID
  nomeCompleto: string; // varchar(255) -> full_name
  cpf: string; // varchar(14) -> cpf_number (remover formatação)
  rg: string | null; // varchar(40) -> rg_number
  orgaoEmissor: string | null; // varchar(60) -> issuing_authority
  telefone: string | null; // varchar(15) -> phone
  celular: string | null; // varchar(15) -> whatsapp
  cargo: string | null; // varchar(60) -> position
  created_at: any; // datetime
  updated_at: any; // datetime
}

// Cache para evitar múltiplas queries
const companyIdCache = new Map<string, string>();

async function getCompanyIdFromLegacyUuid(
  legacyUuid: string,
): Promise<string | null> {
  if (companyIdCache.has(legacyUuid)) {
    return companyIdCache.get(legacyUuid) || null;
  }

  // Buscar o company pelo UUID antigo que pode estar no campo id
  // (caso tenha sido preservado durante a migração, mas geralmente não está)
  const resDirect = await postgres.query(
    `SELECT id FROM company WHERE id = $1 LIMIT 1`,
    [legacyUuid],
  );

  if (resDirect.rows && resDirect.rows.length > 0) {
    const companyId = (resDirect.rows[0] as { id: string }).id;
    companyIdCache.set(legacyUuid, companyId);
    return companyId;
  }

  // Se não encontrou, o UUID antigo não foi preservado
  // Nesse caso, precisamos buscar na tabela antiga para pegar o co_seq_empresa
  // e então buscar pelo old_id no novo banco
  const [legacyCompanyRows] = await mariadb.query<RowDataPacket[]>(
    `SELECT co_seq_empresa FROM tb_empresa WHERE id = :uuid LIMIT 1`,
    { uuid: legacyUuid },
  );

  if (legacyCompanyRows && legacyCompanyRows.length > 0) {
    const row = legacyCompanyRows[0] as { co_seq_empresa: number };
    const oldId = String(row.co_seq_empresa);
    const resByOldId = await postgres.query(
      `SELECT id FROM company WHERE old_id = $1 LIMIT 1`,
      [oldId],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const companyId = (resByOldId.rows[0] as { id: string }).id;
      companyIdCache.set(legacyUuid, companyId);
      return companyId;
    }
  }

  return null;
}

function removeCpfFormatting(cpf: string): string {
  return cpf.replace(/[.\-]/g, "");
}

async function upsertCompanySupervisor(row: LegacyCompanySupervisorRow) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = String(row.id);

  // Converter empresa_id (UUID antigo) para company_id (UUID novo)
  const companyId = await getCompanyIdFromLegacyUuid(row.empresa_id.trim());
  if (!companyId) {
    throw new Error(
      `Company not found for legacy UUID: ${row.empresa_id} (supervisor: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, company_id, full_name, cpf_number, rg_number,
        issuing_authority, phone, whatsapp, position, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        uuidv7(),
        oldId,
        companyId,
        row.nomeCompleto.trim(),
        removeCpfFormatting(row.cpf),
        row.rg?.trim() || null,
        row.orgaoEmissor?.trim() || null,
        row.telefone?.trim() || null,
        row.celular?.trim() || null,
        row.cargo?.trim() || null,
        createdAt,
        updatedAt,
      ],
    );
  } catch (e: any) {
    // Se falhar (provavelmente duplicado), tentar atualizar
    const existingRes = await postgres.query(
      `SELECT id FROM ${TARGET_TABLE} WHERE old_id = $1 LIMIT 1`,
      [oldId],
    );

    if (existingRes.rows && existingRes.rows.length > 0) {
      const existingRow = existingRes.rows[0] as { id: string };
      // Atualizar registro existente
      await postgres.query(
        `
        UPDATE ${TARGET_TABLE}
        SET company_id = $1, full_name = $2, cpf_number = $3, rg_number = $4,
            issuing_authority = $5, phone = $6, whatsapp = $7, position = $8, updated_at = $9
        WHERE id = $10
        `,
        [
          companyId,
          row.nomeCompleto.trim(),
          removeCpfFormatting(row.cpf),
          row.rg?.trim() || null,
          row.orgaoEmissor?.trim() || null,
          row.telefone?.trim() || null,
          row.celular?.trim() || null,
          row.cargo?.trim() || null,
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
    const [rows] = await mariadb.query<LegacyCompanySupervisorRow[]>(
      `
      SELECT id, empresa_id, nomeCompleto, cpf, rg, orgaoEmissor,
             telefone, celular, cargo, created_at, updated_at
      FROM supervisor_empresas
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertCompanySupervisor(r);
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

  // Limpar cache após seed
  companyIdCache.clear();

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
    const [rows] = await mariadb.query<LegacyCompanySupervisorRow[]>(
      `
      SELECT id, empresa_id, nomeCompleto, cpf, rg, orgaoEmissor,
             telefone, celular, cargo, created_at, updated_at
      FROM supervisor_empresas
      WHERE (COALESCE(updated_at, created_at) > :cursor)
         OR (COALESCE(updated_at, created_at) = :cursor AND id > :lastPk)
      ORDER BY COALESCE(updated_at, created_at), id
      LIMIT :limit
      `,
      { cursor: lastCursor, lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertCompanySupervisor(r);
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

    const lastRow = rows[rows.length - 1];
    lastCursor = new Date((lastRow.updated_at ?? lastRow.created_at) as any);
    lastPk = lastRow.id;

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
  companyIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const companySupervisorMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
