import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";

const ENTITY = "internship_commitment_term";

// ✅ Novo schema (Drizzle):
// internship_commitment_term: id(text UUID mantido), old_id(text), public_id(text nullable),
// notes, company_id, company_supervisor_id, company_supervisor_position, company_representative_id,
// company_representative_position, institution_id, institution_supervisor_id, institution_supervisor_position,
// institution_representative_id, institution_representative_position, student_id, first_activity,
// second_activity, start_commitment_date, end_commitment_date, days_and_hours_per_week, stipend_amount,
// payment_frequency, transportation_allowance_amount, term_date, first_extension_date, second_extension_date,
// third_extension_date, termination_date, created_at, updated_at
// ✅ UPSERT por id (UUID) ou old_id
const TARGET_TABLE = "internship_commitment_term";

type LegacyPaymentFrequency =
  | "Hora"
  | "Diario"
  | "Semanalmente"
  | "Mensalmente";

interface LegacyTermoRow extends RowDataPacket {
  co_seq_termo: number; // int(10) PK -> old_id
  id: string; // char(36) UUID -> id (mantido)
  notas: string | null; // mediumtext -> notes
  empresa_id: string; // char(36) UUID -> precisa verificar se existe no novo DB
  supervisor_empresa_id: number | null; // int(11) -> precisa converter para company_supervisor_id UUID
  cargo_supervisor_empresa: string | null; // varchar(255) -> company_supervisor_position
  representante_empresa_id: number | null; // int(11) -> precisa converter para company_representative_id UUID
  cargo_representante_empresa: string | null; // varchar(255) -> company_representative_position
  instituicao_id: string; // char(36) UUID -> precisa verificar se existe no novo DB
  supervisor_instituicao_id: number | null; // int(11) -> precisa converter para institution_supervisor_id UUID
  cargo_supervisor_instituicao: string | null; // varchar(255) -> institution_supervisor_position
  representante_instituicao_id: number | null; // int(11) -> precisa converter para institution_representative_id UUID
  cargo_representante_instituicao: string | null; // varchar(255) -> institution_representative_position
  estudante_id: number; // int(11) -> precisa converter para student_id UUID
  data: any; // date -> term_date
  paragrafo_a: string | null; // mediumtext -> first_activity
  paragrafo_b: string | null; // mediumtext -> second_activity
  data_inicio: any; // date -> start_commitment_date
  data_fim: any; // date -> end_commitment_date
  hora_especial: string | null; // mediumtext -> days_and_hours_per_week
  valor_estagio: string | null; // varchar(191) -> stipend_amount
  taxa_pagamento: LegacyPaymentFrequency; // enum -> payment_frequency
  vale_transporte: string | null; // varchar(191) -> transportation_allowance_amount
  prorrogacao1: any; // date -> first_extension_date
  prorrogacao2: any; // date -> second_extension_date
  prorrogacao3: any; // date -> third_extension_date
  rescisao: any; // date -> termination_date
  created_at: any; // datetime -> created_at
  updated_at: any; // datetime -> updated_at
}

// Caches para evitar múltiplas queries
const companyIdCache = new Map<string, string>();
const institutionIdCache = new Map<string, string>();
const studentIdCache = new Map<number, string>();
const companySupervisorIdCache = new Map<number, string>();
const companyRepresentativeIdCache = new Map<number, string>();
const institutionSupervisorIdCache = new Map<number, string>();
const institutionRepresentativeIdCache = new Map<number, string>();

async function getCompanyIdFromOldUuid(
  oldCompanyUuid: string,
): Promise<string | null> {
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

async function getInstitutionIdFromOldUuid(
  oldInstitutionUuid: string,
): Promise<string | null> {
  if (institutionIdCache.has(oldInstitutionUuid)) {
    return institutionIdCache.get(oldInstitutionUuid) || null;
  }

  // Primeiro tentar buscar pelo UUID antigo (id) no novo DB
  const resById = await postgres.query(
    `SELECT id FROM institutions WHERE id = $1 LIMIT 1`,
    [oldInstitutionUuid],
  );

  if (resById.rows && resById.rows.length > 0) {
    const institutionId = (resById.rows[0] as { id: string }).id;
    institutionIdCache.set(oldInstitutionUuid, institutionId);
    return institutionId;
  }

  // Se não encontrou, tentar buscar pelo old_id (co_seq_instituicao)
  const [oldRows] = await mariadb.query<RowDataPacket[]>(
    `SELECT co_seq_instituicao FROM tb_instituicao WHERE id = ? LIMIT 1`,
    [oldInstitutionUuid],
  );

  if (oldRows && oldRows.length > 0) {
    const oldId = (oldRows[0] as { co_seq_instituicao: number })
      .co_seq_instituicao;
    const resByOldId = await postgres.query(
      `SELECT id FROM institutions WHERE old_id = $1 LIMIT 1`,
      [String(oldId)],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const institutionId = (resByOldId.rows[0] as { id: string }).id;
      institutionIdCache.set(oldInstitutionUuid, institutionId);
      return institutionId;
    }
  }

  return null;
}

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

async function getCompanySupervisorIdFromOldId(
  oldSupervisorId: number,
): Promise<string | null> {
  if (companySupervisorIdCache.has(oldSupervisorId)) {
    return companySupervisorIdCache.get(oldSupervisorId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM company_supervisor WHERE old_id = $1 LIMIT 1`,
    [String(oldSupervisorId)],
  );

  if (res.rows && res.rows.length > 0) {
    const supervisorId = (res.rows[0] as { id: string }).id;
    companySupervisorIdCache.set(oldSupervisorId, supervisorId);
    return supervisorId;
  }

  return null;
}

async function getCompanyRepresentativeIdFromOldId(
  oldRepresentativeId: number,
): Promise<string | null> {
  if (companyRepresentativeIdCache.has(oldRepresentativeId)) {
    return companyRepresentativeIdCache.get(oldRepresentativeId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM company_representative WHERE old_id = $1 LIMIT 1`,
    [String(oldRepresentativeId)],
  );

  if (res.rows && res.rows.length > 0) {
    const representativeId = (res.rows[0] as { id: string }).id;
    companyRepresentativeIdCache.set(oldRepresentativeId, representativeId);
    return representativeId;
  }

  return null;
}

async function getInstitutionSupervisorIdFromOldId(
  oldSupervisorId: number,
): Promise<string | null> {
  if (institutionSupervisorIdCache.has(oldSupervisorId)) {
    return institutionSupervisorIdCache.get(oldSupervisorId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM institution_supervisor WHERE old_id = $1 LIMIT 1`,
    [String(oldSupervisorId)],
  );

  if (res.rows && res.rows.length > 0) {
    const supervisorId = (res.rows[0] as { id: string }).id;
    institutionSupervisorIdCache.set(oldSupervisorId, supervisorId);
    return supervisorId;
  }

  return null;
}

async function getInstitutionRepresentativeIdFromOldId(
  oldRepresentativeId: number,
): Promise<string | null> {
  if (institutionRepresentativeIdCache.has(oldRepresentativeId)) {
    return institutionRepresentativeIdCache.get(oldRepresentativeId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM institution_representative WHERE old_id = $1 LIMIT 1`,
    [String(oldRepresentativeId)],
  );

  if (res.rows && res.rows.length > 0) {
    const representativeId = (res.rows[0] as { id: string }).id;
    institutionRepresentativeIdCache.set(oldRepresentativeId, representativeId);
    return representativeId;
  }

  return null;
}

function mapPaymentFrequency(
  frequency: LegacyPaymentFrequency,
): "hourly" | "daily" | "weekly" | "biweekly" | "monthly" {
  switch (frequency) {
    case "Hora":
      return "hourly";
    case "Diario":
      return "daily";
    case "Semanalmente":
      return "weekly";
    case "Mensalmente":
      return "monthly";
    default:
      return "monthly";
  }
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

async function upsertInternshipCommitmentTerm(row: LegacyTermoRow) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const termId = row.id; // UUID mantido
  const oldId = String(row.co_seq_termo);

  // Verificar se o registro já existe para não gerar public_id duplicado
  const existingRes = await postgres.query(
    `SELECT id, public_id FROM ${TARGET_TABLE} WHERE id = $1 OR old_id = $2 LIMIT 1`,
    [termId, oldId],
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
  const companyId = await getCompanyIdFromOldUuid(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for UUID: ${row.empresa_id} (term: ${termId})`,
    );
  }

  const institutionId = await getInstitutionIdFromOldUuid(row.instituicao_id);
  if (!institutionId) {
    throw new Error(
      `Institution not found for UUID: ${row.instituicao_id} (term: ${termId})`,
    );
  }

  const studentId = await getStudentIdFromOldId(row.estudante_id);
  if (!studentId) {
    throw new Error(
      `Student not found for old_id: ${row.estudante_id} (term: ${termId})`,
    );
  }

  // Todos os campos são NOT NULL no schema, então precisamos garantir valores
  let companySupervisorId: string;
  if (row.supervisor_empresa_id) {
    const found = await getCompanySupervisorIdFromOldId(
      row.supervisor_empresa_id,
    );
    if (!found) {
      throw new Error(
        `Company supervisor not found for old_id: ${row.supervisor_empresa_id} (term: ${termId})`,
      );
    }
    companySupervisorId = found;
  } else {
    // Buscar primeiro supervisor da empresa
    const res = await postgres.query(
      `SELECT id FROM company_supervisor WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId],
    );
    if (!res.rows || res.rows.length === 0) {
      throw new Error(
        `No company supervisor found for company ${companyId} (term: ${termId})`,
      );
    }
    companySupervisorId = (res.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, termId },
      `Term has no supervisor_empresa_id, using first supervisor: ${companySupervisorId}`,
    );
  }

  let companyRepresentativeId: string;
  if (row.representante_empresa_id) {
    const found = await getCompanyRepresentativeIdFromOldId(
      row.representante_empresa_id,
    );
    if (!found) {
      throw new Error(
        `Company representative not found for old_id: ${row.representante_empresa_id} (term: ${termId})`,
      );
    }
    companyRepresentativeId = found;
  } else {
    // Buscar primeiro representante da empresa
    const res = await postgres.query(
      `SELECT id FROM company_representative WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId],
    );
    if (!res.rows || res.rows.length === 0) {
      throw new Error(
        `No company representative found for company ${companyId} (term: ${termId})`,
      );
    }
    companyRepresentativeId = (res.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, termId },
      `Term has no representante_empresa_id, using first representative: ${companyRepresentativeId}`,
    );
  }

  let institutionSupervisorId: string;
  if (row.supervisor_instituicao_id) {
    const found = await getInstitutionSupervisorIdFromOldId(
      row.supervisor_instituicao_id,
    );
    if (!found) {
      throw new Error(
        `Institution supervisor not found for old_id: ${row.supervisor_instituicao_id} (term: ${termId})`,
      );
    }
    institutionSupervisorId = found;
  } else {
    // Buscar primeiro supervisor da instituição
    const res = await postgres.query(
      `SELECT id FROM institution_supervisor WHERE institution_id = $1 ORDER BY created_at LIMIT 1`,
      [institutionId],
    );
    if (!res.rows || res.rows.length === 0) {
      throw new Error(
        `No institution supervisor found for institution ${institutionId} (term: ${termId})`,
      );
    }
    institutionSupervisorId = (res.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, termId },
      `Term has no supervisor_instituicao_id, using first supervisor: ${institutionSupervisorId}`,
    );
  }

  let institutionRepresentativeId: string;
  if (row.representante_instituicao_id) {
    const found = await getInstitutionRepresentativeIdFromOldId(
      row.representante_instituicao_id,
    );
    if (!found) {
      throw new Error(
        `Institution representative not found for old_id: ${row.representante_instituicao_id} (term: ${termId})`,
      );
    }
    institutionRepresentativeId = found;
  } else {
    // Buscar primeiro representante da instituição
    const res = await postgres.query(
      `SELECT id FROM institution_representative WHERE institution_id = $1 ORDER BY created_at LIMIT 1`,
      [institutionId],
    );
    if (!res.rows || res.rows.length === 0) {
      throw new Error(
        `No institution representative found for institution ${institutionId} (term: ${termId})`,
      );
    }
    institutionRepresentativeId = (res.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, termId },
      `Term has no representante_instituicao_id, using first representative: ${institutionRepresentativeId}`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, public_id, notes, company_id, company_supervisor_id,
        company_supervisor_position, company_representative_id,
        company_representative_position, institution_id, institution_supervisor_id,
        institution_supervisor_position, institution_representative_id,
        institution_representative_position, student_id, first_activity, second_activity,
        start_commitment_date, end_commitment_date, days_and_hours_per_week,
        stipend_amount, payment_frequency, transportation_allowance_amount,
        term_date, first_extension_date, second_extension_date, third_extension_date,
        termination_date, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
      `,
      [
        termId, // UUID mantido
        oldId,
        publicId, // public_id gerado sequencialmente
        row.notas?.trim() || null,
        companyId,
        companySupervisorId,
        row.cargo_supervisor_empresa?.trim() || null,
        companyRepresentativeId,
        row.cargo_representante_empresa?.trim() || null,
        institutionId,
        institutionSupervisorId,
        row.cargo_supervisor_instituicao?.trim() || null,
        institutionRepresentativeId,
        row.cargo_representante_instituicao?.trim() || null,
        studentId,
        row.paragrafo_a?.trim() || null,
        row.paragrafo_b?.trim() || null,
        row.data_inicio
          ? new Date(row.data_inicio).toISOString().split("T")[0]
          : null,
        row.data_fim
          ? new Date(row.data_fim).toISOString().split("T")[0]
          : null,
        row.hora_especial?.trim() || null,
        row.valor_estagio?.trim() || null,
        mapPaymentFrequency(row.taxa_pagamento),
        row.vale_transporte?.trim() || null,
        row.data ? new Date(row.data).toISOString().split("T")[0] : null,
        row.prorrogacao1
          ? new Date(row.prorrogacao1).toISOString().split("T")[0]
          : null,
        row.prorrogacao2
          ? new Date(row.prorrogacao2).toISOString().split("T")[0]
          : null,
        row.prorrogacao3
          ? new Date(row.prorrogacao3).toISOString().split("T")[0]
          : null,
        row.rescisao
          ? new Date(row.rescisao).toISOString().split("T")[0]
          : null,
        createdAt,
        updatedAt,
      ],
    );
  } catch (e: any) {
    // Se falhar (provavelmente duplicado), tentar atualizar
    const existingResForUpdate = await postgres.query(
      `SELECT id, public_id FROM ${TARGET_TABLE} WHERE id = $1 OR old_id = $2 LIMIT 1`,
      [termId, oldId],
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
        SET old_id = $1, public_id = $2, notes = $3, company_id = $4, company_supervisor_id = $5,
            company_supervisor_position = $6, company_representative_id = $7,
            company_representative_position = $8, institution_id = $9,
            institution_supervisor_id = $10, institution_supervisor_position = $11,
            institution_representative_id = $12, institution_representative_position = $13,
            student_id = $14, first_activity = $15, second_activity = $16,
            start_commitment_date = $17, end_commitment_date = $18,
            days_and_hours_per_week = $19, stipend_amount = $20, payment_frequency = $21,
            transportation_allowance_amount = $22, term_date = $23,
            first_extension_date = $24, second_extension_date = $25,
            third_extension_date = $26, termination_date = $27, updated_at = $28
        WHERE id = $29
        `,
        [
          oldId,
          publicId,
          row.notas?.trim() || null,
          companyId,
          companySupervisorId,
          row.cargo_supervisor_empresa?.trim() || null,
          companyRepresentativeId,
          row.cargo_representante_empresa?.trim() || null,
          institutionId,
          institutionSupervisorId,
          row.cargo_supervisor_instituicao?.trim() || null,
          institutionRepresentativeId,
          row.cargo_representante_instituicao?.trim() || null,
          studentId,
          row.paragrafo_a?.trim() || null,
          row.paragrafo_b?.trim() || null,
          row.data_inicio
            ? new Date(row.data_inicio).toISOString().split("T")[0]
            : null,
          row.data_fim
            ? new Date(row.data_fim).toISOString().split("T")[0]
            : null,
          row.hora_especial?.trim() || null,
          row.valor_estagio?.trim() || null,
          mapPaymentFrequency(row.taxa_pagamento),
          row.vale_transporte?.trim() || null,
          row.data ? new Date(row.data).toISOString().split("T")[0] : null,
          row.prorrogacao1
            ? new Date(row.prorrogacao1).toISOString().split("T")[0]
            : null,
          row.prorrogacao2
            ? new Date(row.prorrogacao2).toISOString().split("T")[0]
            : null,
          row.prorrogacao3
            ? new Date(row.prorrogacao3).toISOString().split("T")[0]
            : null,
          row.rescisao
            ? new Date(row.rescisao).toISOString().split("T")[0]
            : null,
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
    const [rows] = await mariadb.query<LegacyTermoRow[]>(
      `
      SELECT co_seq_termo, id, notas, empresa_id, supervisor_empresa_id,
             cargo_supervisor_empresa, representante_empresa_id, cargo_representante_empresa,
             instituicao_id, supervisor_instituicao_id, cargo_supervisor_instituicao,
             representante_instituicao_id, cargo_representante_instituicao, estudante_id,
             data, paragrafo_a, paragrafo_b, data_inicio, data_fim, hora_especial,
             valor_estagio, taxa_pagamento, vale_transporte, prorrogacao1, prorrogacao2,
             prorrogacao3, rescisao, created_at, updated_at
      FROM tb_termo
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInternshipCommitmentTerm(r);
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
  institutionIdCache.clear();
  studentIdCache.clear();
  companySupervisorIdCache.clear();
  companyRepresentativeIdCache.clear();
  institutionSupervisorIdCache.clear();
  institutionRepresentativeIdCache.clear();

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
    const [rows] = await mariadb.query<LegacyTermoRow[]>(
      `
      SELECT co_seq_termo, id, notas, empresa_id, supervisor_empresa_id,
             cargo_supervisor_empresa, representante_empresa_id, cargo_representante_empresa,
             instituicao_id, supervisor_instituicao_id, cargo_supervisor_instituicao,
             representante_instituicao_id, cargo_representante_instituicao, estudante_id,
             data, paragrafo_a, paragrafo_b, data_inicio, data_fim, hora_especial,
             valor_estagio, taxa_pagamento, vale_transporte, prorrogacao1, prorrogacao2,
             prorrogacao3, rescisao, created_at, updated_at
      FROM tb_termo
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
        await upsertInternshipCommitmentTerm(r);
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
  companyIdCache.clear();
  institutionIdCache.clear();
  studentIdCache.clear();
  companySupervisorIdCache.clear();
  companyRepresentativeIdCache.clear();
  institutionSupervisorIdCache.clear();
  institutionRepresentativeIdCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const internshipCommitmentTermMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
