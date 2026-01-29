import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "internship_agreement_requests";

// ✅ Novo schema (Drizzle):
// internship_agreement_requests: id(text uuidv7), old_id(text), company_id(text not null),
// company_representative_id(text not null), company_supervisor_id(text not null),
// company_phone, company_email, supervisor_email, council_number, student_name, student_phone,
// course_id(text not null), semester_id(text not null), proposed_start_date, proposed_end_date,
// weekly_schedule, stipend_amount, transportation_allowance_amount, other_benefits,
// activities_description, request_date, status, notes, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "internship_agreement_requests";

type LegacyStatus = "pendente" | "concluido";

interface LegacyInternshipAgreementRequestRow extends RowDataPacket {
  id: string; // uuid -> old_id
  empresa_id: string; // varchar(36) UUID -> precisa verificar se existe no novo DB
  representante_empresa: string; // varchar(191) -> precisa buscar ID de company_representative
  supervisor_empresa: string; // varchar(191) -> precisa buscar ID de company_supervisor
  telefone_empresa: string | null; // varchar(16) -> company_phone
  email_empresa: string; // varchar(191) -> company_email
  email_supervisor: string | null; // varchar(191) -> supervisor_email
  numero_conselho: string | null; // varchar(191) -> council_number
  nome_estudante: string; // varchar(191) -> student_name
  telefone_estudante: string | null; // varchar(16) -> student_phone
  curso: string; // varchar(191) -> precisa buscar ID de course pelo nome
  semestre: string; // varchar(191) -> precisa buscar ID de semester pelo nome
  data_inicio_estagio: any; // date -> proposed_start_date
  vigencia_estagio: number; // int(11) -> precisa calcular proposed_end_date (adicionar meses)
  horario_estagio: string; // varchar(191) -> weekly_schedule
  valor_bolsa_auxilio: number; // decimal(10,2) -> stipend_amount (converter para text)
  valor_vale_transporte: number | null; // decimal(10,2) -> transportation_allowance_amount (converter para text)
  outros_beneficios: string | null; // text -> other_benefits
  atividades_realizadas: string; // text -> activities_description
  data_solicitacao: any; // datetime -> request_date (converter para date)
  status_solicitacao: LegacyStatus; // enum -> status (mapear: 'pendente'→'pending', 'concluido'→'accepted')
  created_at: any; // datetime(3) -> created_at
  updated_at: any; // datetime(3) -> updated_at
}

// Caches para evitar múltiplas queries
const companyIdCache = new Map<string, string>();
const courseNameCache = new Map<string, string>();
const semesterNameCache = new Map<string, string>();

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

async function getCompanyRepresentativeIdByName(
  companyId: string,
  representativeName: string,
): Promise<string | null> {
  // Buscar representante pelo nome completo dentro da empresa
  const res = await postgres.query(
    `SELECT id FROM company_representative WHERE company_id = $1 AND full_name = $2 LIMIT 1`,
    [companyId, representativeName.trim()],
  );

  if (res.rows && res.rows.length > 0) {
    return (res.rows[0] as { id: string }).id;
  }

  return null;
}

async function getCompanySupervisorIdByName(
  companyId: string,
  supervisorName: string,
): Promise<string | null> {
  // Buscar supervisor pelo nome completo dentro da empresa
  const res = await postgres.query(
    `SELECT id FROM company_supervisor WHERE company_id = $1 AND full_name = $2 LIMIT 1`,
    [companyId, supervisorName.trim()],
  );

  if (res.rows && res.rows.length > 0) {
    return (res.rows[0] as { id: string }).id;
  }

  return null;
}

async function getCourseIdFromName(courseName: string): Promise<string | null> {
  if (courseNameCache.has(courseName)) {
    return courseNameCache.get(courseName) || null;
  }

  // Tentar buscar por nome primeiro
  const resByName = await postgres.query(
    `SELECT id FROM course WHERE name = $1 LIMIT 1`,
    [courseName.trim()],
  );

  if (resByName.rows && resByName.rows.length > 0) {
    const courseId = (resByName.rows[0] as { id: string }).id;
    courseNameCache.set(courseName, courseId);
    return courseId;
  }

  // Se não encontrou por nome e o valor é numérico, tentar buscar por old_id
  const numericValue = parseInt(courseName.trim(), 10);
  if (!isNaN(numericValue)) {
    const resByOldId = await postgres.query(
      `SELECT id FROM course WHERE old_id = $1 LIMIT 1`,
      [String(numericValue)],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const courseId = (resByOldId.rows[0] as { id: string }).id;
      courseNameCache.set(courseName, courseId);
      return courseId;
    }
  }

  return null;
}

async function getSemesterIdFromName(
  semesterName: string,
): Promise<string | null> {
  if (semesterNameCache.has(semesterName)) {
    return semesterNameCache.get(semesterName) || null;
  }

  // Tentar buscar por nome primeiro
  const resByName = await postgres.query(
    `SELECT id FROM semester WHERE name = $1 LIMIT 1`,
    [semesterName.trim()],
  );

  if (resByName.rows && resByName.rows.length > 0) {
    const semesterId = (resByName.rows[0] as { id: string }).id;
    semesterNameCache.set(semesterName, semesterId);
    return semesterId;
  }

  // Se não encontrou por nome e o valor é numérico, tentar buscar por old_id
  const numericValue = parseInt(semesterName.trim(), 10);
  if (!isNaN(numericValue)) {
    const resByOldId = await postgres.query(
      `SELECT id FROM semester WHERE old_id = $1 LIMIT 1`,
      [String(numericValue)],
    );

    if (resByOldId.rows && resByOldId.rows.length > 0) {
      const semesterId = (resByOldId.rows[0] as { id: string }).id;
      semesterNameCache.set(semesterName, semesterId);
      return semesterId;
    }
  }

  return null;
}

function calculateEndDate(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);
  return endDate;
}

function mapStatus(status: LegacyStatus): "pending" | "accepted" | "rejected" {
  switch (status) {
    case "pendente":
      return "pending";
    case "concluido":
      return "accepted";
    default:
      return "pending";
  }
}

async function upsertInternshipAgreementRequest(
  row: LegacyInternshipAgreementRequestRow,
) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = row.id;

  // Converter todas as foreign keys
  const companyId = await getCompanyIdFromOldUuid(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for UUID: ${row.empresa_id} (internship_agreement_request: ${oldId})`,
    );
  }

  // company_representative_id é NOT NULL, então precisamos garantir um valor
  let companyRepresentativeId: string;
  const foundRepresentativeId = await getCompanyRepresentativeIdByName(
    companyId,
    row.representante_empresa,
  );
  if (!foundRepresentativeId) {
    // Buscar primeiro representante da empresa como fallback
    const defaultRepresentativeRes = await postgres.query(
      `SELECT id FROM company_representative WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId],
    );
    if (
      !defaultRepresentativeRes.rows ||
      defaultRepresentativeRes.rows.length === 0
    ) {
      throw new Error(
        `No company representative found for company ${companyId} and name "${row.representante_empresa}" (internship_agreement_request: ${oldId})`,
      );
    }
    companyRepresentativeId = (
      defaultRepresentativeRes.rows[0] as { id: string }
    ).id;
    logger.warn(
      { entity: ENTITY, requestId: oldId },
      `Representative not found for name: "${row.representante_empresa}", using first representative: ${companyRepresentativeId}`,
    );
  } else {
    companyRepresentativeId = foundRepresentativeId;
  }

  // company_supervisor_id é NOT NULL, então precisamos garantir um valor
  let companySupervisorId: string;
  const foundSupervisorId = await getCompanySupervisorIdByName(
    companyId,
    row.supervisor_empresa,
  );
  if (!foundSupervisorId) {
    // Buscar primeiro supervisor da empresa como fallback
    const defaultSupervisorRes = await postgres.query(
      `SELECT id FROM company_supervisor WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId],
    );
    if (!defaultSupervisorRes.rows || defaultSupervisorRes.rows.length === 0) {
      throw new Error(
        `No company supervisor found for company ${companyId} and name "${row.supervisor_empresa}" (internship_agreement_request: ${oldId})`,
      );
    }
    companySupervisorId = (defaultSupervisorRes.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, requestId: oldId },
      `Supervisor not found for name: "${row.supervisor_empresa}", using first supervisor: ${companySupervisorId}`,
    );
  } else {
    companySupervisorId = foundSupervisorId;
  }

  const courseId = await getCourseIdFromName(row.curso);
  if (!courseId) {
    throw new Error(
      `Course not found for name: ${row.curso} (internship_agreement_request: ${oldId})`,
    );
  }

  const semesterId = await getSemesterIdFromName(row.semestre);
  if (!semesterId) {
    throw new Error(
      `Semester not found for name: ${row.semestre} (internship_agreement_request: ${oldId})`,
    );
  }

  // Calcular data de término
  const startDate = new Date(row.data_inicio_estagio);
  const endDate = calculateEndDate(startDate, row.vigencia_estagio);

  // Converter request_date
  const requestDate = row.data_solicitacao
    ? new Date(row.data_solicitacao)
    : startDate;

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, company_id, company_representative_id, company_supervisor_id,
        company_phone, company_email, supervisor_email, council_number,
        student_name, student_phone, course_id, semester_id, proposed_start_date,
        proposed_end_date, weekly_schedule, stipend_amount,
        transportation_allowance_amount, other_benefits, activities_description,
        request_date, status, notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      `,
      [
        uuidv7(),
        oldId,
        companyId,
        companyRepresentativeId,
        companySupervisorId,
        row.telefone_empresa?.trim() || null,
        row.email_empresa.trim(),
        row.email_supervisor?.trim() || null,
        row.numero_conselho?.trim() || null,
        row.nome_estudante.trim(),
        row.telefone_estudante?.trim() || null,
        courseId,
        semesterId,
        startDate.toISOString().split("T")[0], // date format
        endDate.toISOString().split("T")[0], // date format
        row.horario_estagio.trim(),
        String(row.valor_bolsa_auxilio),
        row.valor_vale_transporte ? String(row.valor_vale_transporte) : null,
        row.outros_beneficios?.trim() || null,
        row.atividades_realizadas.trim(),
        requestDate.toISOString().split("T")[0], // date format
        mapStatus(row.status_solicitacao),
        null, // notes não existe no antigo
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
        SET company_id = $1, company_representative_id = $2, company_supervisor_id = $3,
            company_phone = $4, company_email = $5, supervisor_email = $6, council_number = $7,
            student_name = $8, student_phone = $9, course_id = $10, semester_id = $11,
            proposed_start_date = $12, proposed_end_date = $13, weekly_schedule = $14,
            stipend_amount = $15, transportation_allowance_amount = $16,
            other_benefits = $17, activities_description = $18, request_date = $19,
            status = $20, notes = $21, updated_at = $22
        WHERE id = $23
        `,
        [
          companyId,
          companyRepresentativeId,
          companySupervisorId,
          row.telefone_empresa?.trim() || null,
          row.email_empresa.trim(),
          row.email_supervisor?.trim() || null,
          row.numero_conselho?.trim() || null,
          row.nome_estudante.trim(),
          row.telefone_estudante?.trim() || null,
          courseId,
          semesterId,
          startDate.toISOString().split("T")[0],
          endDate.toISOString().split("T")[0],
          row.horario_estagio.trim(),
          String(row.valor_bolsa_auxilio),
          row.valor_vale_transporte ? String(row.valor_vale_transporte) : null,
          row.outros_beneficios?.trim() || null,
          row.atividades_realizadas.trim(),
          requestDate.toISOString().split("T")[0],
          mapStatus(row.status_solicitacao),
          null, // notes
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
    const [rows] = await mariadb.query<LegacyInternshipAgreementRequestRow[]>(
      `
      SELECT id, empresa_id, representante_empresa, supervisor_empresa, telefone_empresa,
             email_empresa, email_supervisor, numero_conselho, nome_estudante, telefone_estudante,
             curso, semestre, data_inicio_estagio, vigencia_estagio, horario_estagio,
             valor_bolsa_auxilio, valor_vale_transporte, outros_beneficios, atividades_realizadas,
             data_solicitacao, status_solicitacao, created_at, updated_at
      FROM solicitar_termos
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInternshipAgreementRequest(r);
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
  courseNameCache.clear();
  semesterNameCache.clear();

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
    const [rows] = await mariadb.query<LegacyInternshipAgreementRequestRow[]>(
      `
      SELECT id, empresa_id, representante_empresa, supervisor_empresa, telefone_empresa,
             email_empresa, email_supervisor, numero_conselho, nome_estudante, telefone_estudante,
             curso, semestre, data_inicio_estagio, vigencia_estagio, horario_estagio,
             valor_bolsa_auxilio, valor_vale_transporte, outros_beneficios, atividades_realizadas,
             data_solicitacao, status_solicitacao, created_at, updated_at
      FROM solicitar_termos
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
        await upsertInternshipAgreementRequest(r);
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
  courseNameCache.clear();
  semesterNameCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const internshipAgreementRequestsMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
