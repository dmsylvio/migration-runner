import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "institution_representative";

// ✅ Novo schema (Drizzle):
// institution_representative: id(text uuidv7), old_id(text), institution_id(text not null), full_name, cpf_number,
// rg_number, issuing_authority, phone, whatsapp, position, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "institution_representative";

interface LegacyInstitutionRepresentativeRow extends RowDataPacket {
  id: number; // int(11) PK
  instituicao_id: string; // char(36) UUID -> precisa converter para institution_id UUID
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
const institutionIdCache = new Map<string, string>();

async function getInstitutionIdFromLegacyUuid(
  legacyUuid: string,
): Promise<string | null> {
  if (institutionIdCache.has(legacyUuid)) {
    return institutionIdCache.get(legacyUuid) || null;
  }

  // Buscar o institution pelo UUID antigo que pode estar no campo id
  // (caso tenha sido preservado durante a migração, mas geralmente não está)
  const resDirect = await postgres.query(
    `SELECT id FROM institutions WHERE id = $1 LIMIT 1`,
    [legacyUuid],
  );

  if (resDirect.rows && resDirect.rows.length > 0) {
    const institutionId = (resDirect.rows[0] as { id: string }).id;
    institutionIdCache.set(legacyUuid, institutionId);
    return institutionId;
  }

  // Se não encontrou, o UUID antigo não foi preservado
  // Nesse caso, precisamos buscar na tabela antiga para pegar o co_seq_instituicao
  // e então buscar pelo old_id no novo banco
  const [legacyInstitutionRows] = await mariadb.query<RowDataPacket[]>(
    `SELECT co_seq_instituicao FROM tb_instituicao WHERE id = :uuid LIMIT 1`,
    { uuid: legacyUuid },
  );

  if (legacyInstitutionRows && legacyInstitutionRows.length > 0) {
    const row = legacyInstitutionRows[0] as { co_seq_instituicao: number };
    const oldId = String(row.co_seq_instituicao);
    const resByOldId = await postgres.query(
      `SELECT id FROM institutions WHERE old_id = $1 LIMIT 1`,
      [oldId],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const institutionId = (resByOldId.rows[0] as { id: string }).id;
      institutionIdCache.set(legacyUuid, institutionId);
      return institutionId;
    }
  }

  return null;
}

function removeCpfFormatting(cpf: string): string | null {
  if (!cpf) return null;

  // Remover todos os caracteres não numéricos
  const cleaned = cpf.replace(/[^\d]/g, "");

  // Limitar a 11 caracteres (tamanho máximo do campo)
  if (cleaned.length > 11) {
    return cleaned.substring(0, 11);
  }

  // Se ficar vazio após limpeza, retornar null
  if (cleaned === "" || cleaned === "0") {
    return null;
  }

  return cleaned;
}

async function upsertInstitutionRepresentative(
  row: LegacyInstitutionRepresentativeRow,
) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = String(row.id);

  // Converter instituicao_id (UUID antigo) para institution_id (UUID novo)
  const institutionId = await getInstitutionIdFromLegacyUuid(
    row.instituicao_id.trim(),
  );
  if (!institutionId) {
    throw new Error(
      `Institution not found for legacy UUID: ${row.instituicao_id} (representative: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, institution_id, full_name, cpf_number, rg_number,
        issuing_authority, phone, whatsapp, position, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        uuidv7(),
        oldId,
        institutionId,
        row.nomeCompleto.trim(),
        removeCpfFormatting(row.cpf) || null,
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
        SET institution_id = $1, full_name = $2, cpf_number = $3, rg_number = $4,
            issuing_authority = $5, phone = $6, whatsapp = $7, position = $8, updated_at = $9
        WHERE id = $10
        `,
        [
          institutionId,
          row.nomeCompleto.trim(),
          removeCpfFormatting(row.cpf) || null,
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
    const [rows] = await mariadb.query<LegacyInstitutionRepresentativeRow[]>(
      `
      SELECT id, instituicao_id, nomeCompleto, cpf, rg, orgaoEmissor,
             telefone, celular, cargo, created_at, updated_at
      FROM representante_instituicaos
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInstitutionRepresentative(r);
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
  institutionIdCache.clear();

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
    const [rows] = await mariadb.query<LegacyInstitutionRepresentativeRow[]>(
      `
      SELECT id, instituicao_id, nomeCompleto, cpf, rg, orgaoEmissor,
             telefone, celular, cargo, created_at, updated_at
      FROM representante_instituicaos
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
        await upsertInstitutionRepresentative(r);
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
  institutionIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const institutionRepresentativeMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
