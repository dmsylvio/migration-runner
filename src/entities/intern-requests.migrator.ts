import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "intern_requests";

// ✅ Novo schema (Drizzle):
// intern_requests: id(text uuidv7), old_id(text), company_id(text not null), city, phone, email,
// interviewer_name, interview_availability, course_id, semester_id, number_of_open_positions,
// preferred_gender_id, internship_schedule, stipend_amount, transportation_allowance_amount,
// meal_allowance_amount, other_benefits, required_skills, activities_description, status, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "intern_requests";

type LegacyGender = "Masculino" | "Feminino" | "Outro";
type LegacyStatus = "pendente" | "concluido";

interface LegacyInternRequestRow extends RowDataPacket {
  id: string; // uuid -> old_id
  empresa_id: string; // char(36) UUID -> precisa verificar se existe no novo DB
  endereco: string; // varchar(191) -> não mapeado diretamente (só cidade)
  cidade: string; // varchar(191) -> city
  telefone_empresa: string | null; // varchar(16) -> phone
  email: string; // varchar(191) -> email
  responsavel: string; // varchar(191) -> interviewer_name
  hora_entrevista: string; // varchar(191) -> interview_availability
  curso_id: number; // int(11) -> precisa converter para course_id UUID
  semestre_id: number; // int(11) -> precisa converter para semester_id UUID
  numero_vagas: number; // int(11) -> number_of_open_positions
  genero: LegacyGender; // enum -> precisa mapear para preferred_gender_id UUID
  horario_estagio: string; // varchar(191) -> internship_schedule
  valor_bolsa_auxilio: string; // varchar(191) -> stipend_amount
  valor_vale_transporte: string | null; // varchar(191) -> transportation_allowance_amount
  valor_vale_alimentacao: string | null; // varchar(191) -> meal_allowance_amount
  conhecimentos_exigidos: string | null; // text -> required_skills
  atividades_serem_realizadas: string | null; // text -> activities_description
  status_solicitacao: LegacyStatus; // enum -> status (mapear: 'pendente'→'open', 'concluido'→'filled')
  data_solicitacao: any; // datetime -> created_at (priorizar created_at se existir)
  created_at: any; // datetime(3) -> created_at
  updated_at: any; // datetime(3) -> updated_at
}

// Caches para evitar múltiplas queries
const companyIdCache = new Map<string, string>();
const courseIdCache = new Map<number, string>();
const semesterIdCache = new Map<number, string>();
const genderNameCache = new Map<string, string>();

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
  // Mas não temos o co_seq_empresa aqui, então vamos tentar buscar na tabela antiga
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

async function getCourseIdFromOldId(
  oldCourseId: number,
): Promise<string | null> {
  if (courseIdCache.has(oldCourseId)) {
    return courseIdCache.get(oldCourseId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM course WHERE old_id = $1 LIMIT 1`,
    [String(oldCourseId)],
  );

  if (res.rows && res.rows.length > 0) {
    const courseId = (res.rows[0] as { id: string }).id;
    courseIdCache.set(oldCourseId, courseId);
    return courseId;
  }

  return null;
}

async function getSemesterIdFromOldId(
  oldSemesterId: number,
): Promise<string | null> {
  if (semesterIdCache.has(oldSemesterId)) {
    return semesterIdCache.get(oldSemesterId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM semester WHERE old_id = $1 LIMIT 1`,
    [String(oldSemesterId)],
  );

  if (res.rows && res.rows.length > 0) {
    const semesterId = (res.rows[0] as { id: string }).id;
    semesterIdCache.set(oldSemesterId, semesterId);
    return semesterId;
  }

  return null;
}

async function getGenderIdFromName(genderName: string): Promise<string | null> {
  if (genderNameCache.has(genderName)) {
    return genderNameCache.get(genderName) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM gender WHERE name = $1 LIMIT 1`,
    [genderName],
  );

  if (res.rows && res.rows.length > 0) {
    const genderId = (res.rows[0] as { id: string }).id;
    genderNameCache.set(genderName, genderId);
    return genderId;
  }

  return null;
}

function mapStatus(
  status: LegacyStatus,
): "open" | "in_progress" | "filled" | "canceled" | "closed" {
  switch (status) {
    case "pendente":
      return "open";
    case "concluido":
      return "filled";
    default:
      return "open";
  }
}

async function upsertInternRequest(row: LegacyInternRequestRow) {
  const createdAt = row.created_at
    ? new Date(row.created_at)
    : row.data_solicitacao
      ? new Date(row.data_solicitacao)
      : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = row.id;

  // Converter todas as foreign keys
  const companyId = await getCompanyIdFromOldUuid(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for UUID: ${row.empresa_id} (intern_request: ${oldId})`,
    );
  }

  const courseId = await getCourseIdFromOldId(row.curso_id);
  if (!courseId) {
    throw new Error(
      `Course not found for old_id: ${row.curso_id} (intern_request: ${oldId})`,
    );
  }

  const semesterId = await getSemesterIdFromOldId(row.semestre_id);
  if (!semesterId) {
    throw new Error(
      `Semester not found for old_id: ${row.semestre_id} (intern_request: ${oldId})`,
    );
  }

  const preferredGenderId = await getGenderIdFromName(row.genero);
  // preferred_gender_id é opcional, então não lançamos erro se não encontrar

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, company_id, city, phone, email, interviewer_name,
        interview_availability, course_id, semester_id, number_of_open_positions,
        preferred_gender_id, internship_schedule, stipend_amount,
        transportation_allowance_amount, meal_allowance_amount, other_benefits,
        required_skills, activities_description, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      `,
      [
        uuidv7(),
        oldId,
        companyId,
        row.cidade.trim(),
        row.telefone_empresa?.trim() || null,
        row.email.trim(),
        row.responsavel.trim(),
        row.hora_entrevista.trim() ||
          "To be scheduled via email/phone/whatssap",
        courseId,
        semesterId,
        row.numero_vagas || 1,
        preferredGenderId,
        row.horario_estagio.trim(),
        row.valor_bolsa_auxilio.trim(),
        row.valor_vale_transporte?.trim() || null,
        row.valor_vale_alimentacao?.trim() || null,
        null, // other_benefits não existe no antigo
        row.conhecimentos_exigidos?.trim() || null,
        row.atividades_serem_realizadas?.trim() || null,
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
        SET company_id = $1, city = $2, phone = $3, email = $4, interviewer_name = $5,
            interview_availability = $6, course_id = $7, semester_id = $8,
            number_of_open_positions = $9, preferred_gender_id = $10, internship_schedule = $11,
            stipend_amount = $12, transportation_allowance_amount = $13,
            meal_allowance_amount = $14, other_benefits = $15, required_skills = $16,
            activities_description = $17, status = $18, updated_at = $19
        WHERE id = $20
        `,
        [
          companyId,
          row.cidade.trim(),
          row.telefone_empresa?.trim() || null,
          row.email.trim(),
          row.responsavel.trim(),
          row.hora_entrevista.trim() ||
            "To be scheduled via email/phone/whatssap",
          courseId,
          semesterId,
          row.numero_vagas || 1,
          preferredGenderId,
          row.horario_estagio.trim(),
          row.valor_bolsa_auxilio.trim(),
          row.valor_vale_transporte?.trim() || null,
          row.valor_vale_alimentacao?.trim() || null,
          null, // other_benefits
          row.conhecimentos_exigidos?.trim() || null,
          row.atividades_serem_realizadas?.trim() || null,
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

  let lastCreatedAt: string | null = null;
  let lastId = "";
  const lastRes = await postgres.query(
    `SELECT created_at, old_id FROM ${TARGET_TABLE} ORDER BY created_at DESC NULLS LAST, old_id DESC LIMIT 1`,
  );
  if (lastRes.rows?.length && lastRes.rows[0]) {
    const row = lastRes.rows[0] as { created_at: string; old_id: string };
    lastCreatedAt = row.created_at;
    lastId = row.old_id ?? "";
    logger.info(
      { entity: ENTITY, resumingFrom: { created_at: lastCreatedAt, old_id: lastId } },
      "seed:resume from last row in postgres",
    );
  }

  while (true) {
    const [rows] = await mariadb.query<LegacyInternRequestRow[]>(
      lastCreatedAt == null
        ? `
      SELECT id, empresa_id, endereco, cidade, telefone_empresa, email, responsavel,
             hora_entrevista, curso_id, semestre_id, numero_vagas, genero, horario_estagio,
             valor_bolsa_auxilio, valor_vale_transporte, valor_vale_alimentacao,
             conhecimentos_exigidos, atividades_serem_realizadas, status_solicitacao,
             data_solicitacao, created_at, updated_at
      FROM solicitar_estagiarios
      ORDER BY COALESCE(created_at, data_solicitacao), id
      LIMIT :limit
      `
        : `
      SELECT id, empresa_id, endereco, cidade, telefone_empresa, email, responsavel,
             hora_entrevista, curso_id, semestre_id, numero_vagas, genero, horario_estagio,
             valor_bolsa_auxilio, valor_vale_transporte, valor_vale_alimentacao,
             conhecimentos_exigidos, atividades_serem_realizadas, status_solicitacao,
             data_solicitacao, created_at, updated_at
      FROM solicitar_estagiarios
      WHERE (COALESCE(created_at, data_solicitacao) > :lastCreatedAt)
         OR (COALESCE(created_at, data_solicitacao) = :lastCreatedAt AND id > :lastId)
      ORDER BY COALESCE(created_at, data_solicitacao), id
      LIMIT :limit
      `,
      lastCreatedAt == null ? { limit: env.BATCH_SIZE } : { lastCreatedAt, lastId, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertInternRequest(r);
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

    const lastRow = rows[rows.length - 1];
    lastCreatedAt = (lastRow.created_at ?? lastRow.data_solicitacao) as string;
    lastId = lastRow.id;
    logger.info({ entity: ENTITY, lastCreatedAt, lastId, batch: rows.length }, "seed:batch");
  }

  // Limpar caches após seed
  companyIdCache.clear();
  courseIdCache.clear();
  semesterIdCache.clear();
  genderNameCache.clear();

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
    const [rows] = await mariadb.query<LegacyInternRequestRow[]>(
      `
      SELECT id, empresa_id, endereco, cidade, telefone_empresa, email, responsavel,
             hora_entrevista, curso_id, semestre_id, numero_vagas, genero, horario_estagio,
             valor_bolsa_auxilio, valor_vale_transporte, valor_vale_alimentacao,
             conhecimentos_exigidos, atividades_serem_realizadas, status_solicitacao,
             data_solicitacao, created_at, updated_at
      FROM solicitar_estagiarios
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
        await upsertInternRequest(r);
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
  courseIdCache.clear();
  semesterIdCache.clear();
  genderNameCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const internRequestsMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
