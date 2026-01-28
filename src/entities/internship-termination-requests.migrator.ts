import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "internship_termination_requests";

// ✅ Novo schema (Drizzle):
// internship_termination_requests: id(text uuidv7), old_id(text), company_id(text not null),
// internship_commitment_term_id(text not null), date_of_termination(date not null),
// reason_for_termination(enum not null), status(enum not null), created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "internship_termination_requests";

type LegacyReason =
  | "TerminoAutomatico"
  | "IniciativaEstagiario"
  | "IniciativaEmpresa"
  | "NaoAssumiuVaga"
  | "ConclusaoAbandonoTrancamento"
  | "EfetivadoEmpresa"
  | "DescumprimentoContratual"
  | "AusenciaInjustificada"
  | "Outros";
type LegacyStatus = "pendente" | "concluido";

interface LegacyTerminationRequestRow extends RowDataPacket {
  id: string; // uuid -> old_id
  termo_id: string | null; // char(36) UUID -> precisa verificar se existe no novo DB
  empresa_id: string | null; // char(36) UUID -> precisa verificar se existe no novo DB
  estudante_id: number; // int(11) -> não usado diretamente, mas pode ser útil para validação
  data_rescisao: any; // date -> date_of_termination
  data_solicitacao: any; // date -> created_at (priorizar created_at se existir)
  motivo_rescisao: LegacyReason; // enum -> reason_for_termination
  status_solicitacao: LegacyStatus; // enum -> status
  created_at: any; // datetime -> created_at
  updated_at: any; // datetime -> updated_at
}

// Caches para evitar múltiplas queries
const companyIdCache = new Map<string, string>();
const termIdCache = new Map<string, string>();

async function getCompanyIdFromOldUuid(
  oldCompanyUuid: string | null,
): Promise<string | null> {
  if (!oldCompanyUuid) return null;

  if (companyIdCache.has(oldCompanyUuid)) {
    return companyIdCache.get(oldCompanyUuid) || null;
  }

  // Primeiro tentar buscar pelo UUID antigo (id) no novo DB
  const resById = await postgres.query(
    `SELECT id FROM company WHERE id = $1 LIMIT 1`,
    [oldCompanyUuid],
  );

  if (resById.rows && resById.rows.length > 0) {
    const companyId = (resById.rows[0] as { id: string }).id;
    companyIdCache.set(oldCompanyUuid, companyId);
    return companyId;
  }

  // Se não encontrou, tentar buscar pelo old_id (co_seq_empresa)
  const [oldRows] = await mariadb.query<RowDataPacket[]>(
    `SELECT co_seq_empresa FROM tb_empresa WHERE id = ? LIMIT 1`,
    [oldCompanyUuid],
  );

  if (oldRows && oldRows.length > 0) {
    const oldId = (oldRows[0] as { co_seq_empresa: number }).co_seq_empresa;
    const resByOldId = await postgres.query(
      `SELECT id FROM company WHERE old_id = $1 LIMIT 1`,
      [String(oldId)],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const companyId = (resByOldId.rows[0] as { id: string }).id;
      companyIdCache.set(oldCompanyUuid, companyId);
      return companyId;
    }
  }

  return null;
}

async function getTermIdFromOldUuid(
  oldTermUuid: string | null,
): Promise<string | null> {
  if (!oldTermUuid) return null;

  if (termIdCache.has(oldTermUuid)) {
    return termIdCache.get(oldTermUuid) || null;
  }

  // Buscar pelo UUID (id) no novo DB
  const res = await postgres.query(
    `SELECT id FROM internship_commitment_term WHERE id = $1 LIMIT 1`,
    [oldTermUuid],
  );

  if (res.rows && res.rows.length > 0) {
    const termId = (res.rows[0] as { id: string }).id;
    termIdCache.set(oldTermUuid, termId);
    return termId;
  }

  return null;
}

function mapReason(
  reason: LegacyReason,
):
  | "end_of_term"
  | "student_initiative"
  | "company_initiative"
  | "no_show_did_not_start"
  | "course_completion_or_dropout"
  | "hired_by_company"
  | "breach_of_contract"
  | "excessive_absences"
  | "other" {
  switch (reason) {
    case "TerminoAutomatico":
      return "end_of_term";
    case "IniciativaEstagiario":
      return "student_initiative";
    case "IniciativaEmpresa":
      return "company_initiative";
    case "NaoAssumiuVaga":
      return "no_show_did_not_start";
    case "ConclusaoAbandonoTrancamento":
      return "course_completion_or_dropout";
    case "EfetivadoEmpresa":
      return "hired_by_company";
    case "DescumprimentoContratual":
      return "breach_of_contract";
    case "AusenciaInjustificada":
      return "excessive_absences";
    case "Outros":
      return "other";
    default:
      return "other";
  }
}

function mapStatus(status: LegacyStatus): "pending" | "approved" | "cancelled" {
  switch (status) {
    case "pendente":
      return "pending";
    case "concluido":
      return "approved";
    default:
      return "pending";
  }
}

async function upsertInternshipTerminationRequest(
  row: LegacyTerminationRequestRow,
) {
  const createdAt = row.created_at
    ? new Date(row.created_at)
    : row.data_solicitacao
      ? new Date(row.data_solicitacao)
      : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = row.id;

  // Converter foreign keys
  const companyId = await getCompanyIdFromOldUuid(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for UUID: ${row.empresa_id} (termination_request: ${oldId})`,
    );
  }

  const termId = await getTermIdFromOldUuid(row.termo_id);
  if (!termId) {
    throw new Error(
      `Internship commitment term not found for UUID: ${row.termo_id} (termination_request: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, company_id, internship_commitment_term_id,
        date_of_termination, reason_for_termination, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        uuidv7(),
        oldId,
        companyId,
        termId,
        row.data_rescisao
          ? new Date(row.data_rescisao).toISOString().split("T")[0]
          : null,
        mapReason(row.motivo_rescisao),
        mapStatus(row.status_solicitacao),
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
        SET company_id = $1, internship_commitment_term_id = $2,
            date_of_termination = $3, reason_for_termination = $4,
            status = $5, updated_at = $6
        WHERE id = $7
        `,
        [
          companyId,
          termId,
          row.data_rescisao
            ? new Date(row.data_rescisao).toISOString().split("T")[0]
            : null,
          mapReason(row.motivo_rescisao),
          mapStatus(row.status_solicitacao),
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

  let lastPk = "";

  while (true) {
    const [rows] = await mariadb.query<LegacyTerminationRequestRow[]>(
      `
      SELECT id, termo_id, empresa_id, estudante_id, data_rescisao, data_solicitacao,
             motivo_rescisao, status_solicitacao, created_at, updated_at
      FROM solicitar_rescisao_termos
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInternshipTerminationRequest(r);
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

  // Limpar caches após seed
  companyIdCache.clear();
  termIdCache.clear();

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
  let lastPk = "";

  while (true) {
    const [rows] = await mariadb.query<LegacyTerminationRequestRow[]>(
      `
      SELECT id, termo_id, empresa_id, estudante_id, data_rescisao, data_solicitacao,
             motivo_rescisao, status_solicitacao, created_at, updated_at
      FROM solicitar_rescisao_termos
      WHERE (COALESCE(updated_at, created_at, data_solicitacao) > :cursor)
         OR (COALESCE(updated_at, created_at, data_solicitacao) = :cursor AND id > :lastPk)
      ORDER BY COALESCE(updated_at, created_at, data_solicitacao), id
      LIMIT :limit
      `,
      { cursor: lastCursor, lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInternshipTerminationRequest(r);
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
    lastCursor = new Date(
      (lastRow.updated_at ??
        lastRow.created_at ??
        lastRow.data_solicitacao) as any,
    );
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

  // Limpar caches após sync
  companyIdCache.clear();
  termIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const internshipTerminationRequestsMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
