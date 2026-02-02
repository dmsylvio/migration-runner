import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "signed_internship_commitment_term";

// ✅ Novo schema (Drizzle):
// signed_internship_commitment_term: id(text uuidv7), old_id(text), public_id(text nullable),
// internship_commitment_term_id(text not null), company_id(text not null), student_id(text not null),
// pdf_url(text not null), created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "signed_internship_commitment_term";

interface LegacyTceDocRow extends RowDataPacket {
  id: number; // int(11) PK -> old_id
  estudante_id: number; // int(11) -> precisa converter para student_id UUID
  empresa_id: number; // int(11) -> precisa converter para company_id UUID (co_seq_empresa)
  tce_id: number; // int(11) -> precisa converter para internship_commitment_term_id UUID (co_seq_termo)
  documento: string; // varchar(255) -> pdf_url
  created_at: any; // timestamp -> created_at
  updated_at: any; // timestamp -> updated_at
}

// Caches para evitar múltiplas queries
const studentIdCache = new Map<number, string>();
const companyIdCache = new Map<number, string>();
const termIdCache = new Map<number, string>();

async function getStudentIdFromOldId(
  oldStudentId: number,
): Promise<string | null> {
  if (studentIdCache.has(oldStudentId)) {
    return studentIdCache.get(oldStudentId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM student WHERE old_id = $1 LIMIT 1`,
    [String(oldStudentId)],
  );

  if (res.rows && res.rows.length > 0) {
    const studentId = (res.rows[0] as { id: string }).id;
    studentIdCache.set(oldStudentId, studentId);
    return studentId;
  }

  return null;
}

async function getCompanyIdFromOldId(
  oldCompanyId: number,
): Promise<string | null> {
  if (companyIdCache.has(oldCompanyId)) {
    return companyIdCache.get(oldCompanyId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM company WHERE old_id = $1 LIMIT 1`,
    [String(oldCompanyId)],
  );

  if (res.rows && res.rows.length > 0) {
    const companyId = (res.rows[0] as { id: string }).id;
    companyIdCache.set(oldCompanyId, companyId);
    return companyId;
  }

  return null;
}

async function getTermIdFromOldId(oldTermId: number): Promise<string | null> {
  if (termIdCache.has(oldTermId)) {
    return termIdCache.get(oldTermId) || null;
  }

  // tce_id é o co_seq_termo, então buscar pelo old_id
  const res = await postgres.query(
    `SELECT id FROM internship_commitment_term WHERE old_id = $1 LIMIT 1`,
    [String(oldTermId)],
  );

  if (res.rows && res.rows.length > 0) {
    const termId = (res.rows[0] as { id: string }).id;
    termIdCache.set(oldTermId, termId);
    return termId;
  }

  return null;
}

async function getNextPublicId(): Promise<string> {
  // Buscar o maior public_id numérico existente
  const res = await postgres.query(
    `SELECT public_id FROM ${TARGET_TABLE} 
     WHERE public_id ~ '^[0-9]+$' 
     ORDER BY CAST(public_id AS INTEGER) DESC 
     LIMIT 1`,
  );

  let nextNumber = 1;

  if (res.rows && res.rows.length > 0) {
    const lastPublicId = (res.rows[0] as { public_id: string }).public_id;
    const lastNumber = parseInt(lastPublicId, 10);
    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  // Garantir que não ultrapasse 6 dígitos (999999)
  if (nextNumber > 999999) {
    throw new Error(
      `Public ID sequence exceeded maximum value (999999) for ${ENTITY}`,
    );
  }

  // Formatar com 6 dígitos (zeros à esquerda)
  return nextNumber.toString().padStart(6, "0");
}

async function upsertSignedInternshipCommitmentTerm(row: LegacyTceDocRow) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = String(row.id);

  // Verificar se o registro já existe para não gerar public_id duplicado
  const existingRes = await postgres.query(
    `SELECT id, public_id FROM ${TARGET_TABLE} WHERE old_id = $1 LIMIT 1`,
    [oldId],
  );

  let publicId: string | null = null;
  if (existingRes.rows && existingRes.rows.length > 0) {
    // Se já existe, usar o public_id existente ou gerar um novo se não tiver
    const existing = existingRes.rows[0] as {
      id: string;
      public_id: string | null;
    };
    publicId = existing.public_id || (await getNextPublicId());
  } else {
    // Se não existe, gerar novo public_id
    publicId = await getNextPublicId();
  }

  // Converter todas as foreign keys
  const studentId = await getStudentIdFromOldId(row.estudante_id);
  if (!studentId) {
    throw new Error(
      `Student not found for old_id: ${row.estudante_id} (signed_term: ${oldId})`,
    );
  }

  const companyId = await getCompanyIdFromOldId(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for old_id: ${row.empresa_id} (signed_term: ${oldId})`,
    );
  }

  const termId = await getTermIdFromOldId(row.tce_id);
  if (!termId) {
    throw new Error(
      `Internship commitment term not found for old_id: ${row.tce_id} (signed_term: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, public_id, internship_commitment_term_id,
        company_id, student_id, pdf_url, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        uuidv7(),
        oldId,
        publicId, // public_id gerado sequencialmente
        termId,
        companyId,
        studentId,
        row.documento.trim(),
        createdAt,
        updatedAt,
      ],
    );
  } catch (e: any) {
    // Se falhar (provavelmente duplicado), tentar atualizar
    const existingResForUpdate = await postgres.query(
      `SELECT id, public_id FROM ${TARGET_TABLE} WHERE old_id = $1 LIMIT 1`,
      [oldId],
    );

    if (existingResForUpdate.rows && existingResForUpdate.rows.length > 0) {
      const existingRow = existingResForUpdate.rows[0] as {
        id: string;
        public_id: string | null;
      };
      // Se não tinha public_id, gerar um agora
      if (!existingRow.public_id) {
        publicId = await getNextPublicId();
      } else {
        publicId = existingRow.public_id;
      }
      // Atualizar registro existente
      await postgres.query(
        `
        UPDATE ${TARGET_TABLE}
        SET public_id = $1, internship_commitment_term_id = $2, company_id = $3,
            student_id = $4, pdf_url = $5, updated_at = $6
        WHERE id = $7
        `,
        [
          publicId,
          termId,
          companyId,
          studentId,
          row.documento.trim(),
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
    const [rows] = await mariadb.query<LegacyTceDocRow[]>(
      `
      SELECT id, estudante_id, empresa_id, tce_id, documento, created_at, updated_at
      FROM tce_docs
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertSignedInternshipCommitmentTerm(r);
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
  studentIdCache.clear();
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
  let lastPk = 0;

  while (true) {
    const [rows] = await mariadb.query<LegacyTceDocRow[]>(
      `
      SELECT id, estudante_id, empresa_id, tce_id, documento, created_at, updated_at
      FROM tce_docs
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
        await upsertSignedInternshipCommitmentTerm(r);
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

  // Limpar caches após sync
  studentIdCache.clear();
  companyIdCache.clear();
  termIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const signedInternshipCommitmentTermMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
