import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "opportunity";

// ✅ Novo schema (Drizzle):
// opportunity: id(text uuidv7), old_id(text), public_id(text nullable), company_id(text not null),
// company_supervisor_id(text not null), status(enum not null), course_id(text not null),
// openings(integer not null), contact_name(text not null), reference_point(text not null),
// schedule_text(text not null), interviewer_name(text not null), education_level(text not null),
// semester_id(text not null), gender_id(text not null), accepts_disabled_candidates(boolean not null),
// stipend_amount(numeric(10,2)), benefits_text, requirements_text, activities_text,
// application_instructions, notes, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "opportunity";

type LegacyStatus = "Visivel" | "Aberta" | "Fechada" | "Cancelada";

interface LegacyVagaRow extends RowDataPacket {
  id: string; // char(36) UUID -> old_id
  codigo_vaga: number; // int(11) -> public_id (converter para text)
  status: LegacyStatus; // enum -> status (mapear)
  empresa_id: string; // char(36) UUID -> precisa verificar se existe no novo DB
  supervisor: string | null; // varchar(255) -> precisa buscar ID de company_supervisor pelo nome
  curso: string; // varchar(255) -> precisa buscar ID de course pelo nome
  semestre: string | null; // varchar(100) -> precisa buscar ID de semester pelo nome
  sexo: string | null; // varchar(50) -> precisa buscar ID de gender pelo nome
  qt_vaga: number | null; // int(11) -> openings
  contato: string; // varchar(200) -> contact_name
  ponto_referencia: string | null; // text -> reference_point
  dia_horario: string; // varchar(200) -> schedule_text
  entrevistador: string; // varchar(250) -> interviewer_name
  nivel: string; // varchar(200) -> education_level (texto livre)
  deficiencia: number; // tinyint(1) -> accepts_disabled_candidates
  bolsa: string; // varchar(100) -> stipend_amount (converter para numeric)
  beneficio: string; // varchar(100) -> benefits_text
  exigencia: string | null; // text -> requirements_text
  atividade: string | null; // text -> activities_text
  observacao: string | null; // text -> notes
  created_at: any; // datetime -> created_at
  updated_at: any; // datetime -> updated_at
}

// Caches para evitar múltiplas queries
const companyIdCache = new Map<string, string>();
const courseNameCache = new Map<string, string>();
const semesterNameCache = new Map<string, string>();
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

async function getGenderIdFromName(genderName: string): Promise<string | null> {
  if (genderNameCache.has(genderName)) {
    return genderNameCache.get(genderName) || null;
  }

  // Mapear possíveis variações de nomes
  const genderMap: Record<string, string> = {
    Masculino: "Masculino",
    Feminino: "Feminino",
    Outro: "Outro",
    M: "Masculino",
    F: "Feminino",
    O: "Outro",
  };

  const mappedName = genderMap[genderName] || genderName;

  const res = await postgres.query(
    `SELECT id FROM gender WHERE name = $1 LIMIT 1`,
    [mappedName],
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
): "internal" | "published" | "closed" | "cancelled" | "archived" {
  switch (status) {
    case "Visivel":
      return "published";
    case "Aberta":
      return "published";
    case "Fechada":
      return "closed";
    case "Cancelada":
      return "cancelled";
    default:
      return "internal";
  }
}

function parseStipendAmount(bolsa: string): number | null {
  if (!bolsa || bolsa.trim() === "" || bolsa === "0") {
    return null;
  }

  // Remover caracteres não numéricos exceto ponto e vírgula
  const cleaned = bolsa.replace(/[^\d.,]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function upsertOpportunity(row: LegacyVagaRow) {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const oldId = row.id;
  const publicId = String(row.codigo_vaga);

  // Converter todas as foreign keys
  const companyId = await getCompanyIdFromOldUuid(row.empresa_id);
  if (!companyId) {
    throw new Error(
      `Company not found for UUID: ${row.empresa_id} (opportunity: ${oldId})`,
    );
  }

  const courseId = await getCourseIdFromName(row.curso);
  if (!courseId) {
    throw new Error(
      `Course not found for name: ${row.curso} (opportunity: ${oldId})`,
    );
  }

  // semester_id é NOT NULL, então precisamos garantir um valor
  let semesterId: string;
  if (row.semestre) {
    const foundSemesterId = await getSemesterIdFromName(row.semestre);
    if (!foundSemesterId) {
      // Buscar primeiro semestre disponível como fallback
      const defaultSemesterRes = await postgres.query(
        `SELECT id FROM semester ORDER BY name LIMIT 1`,
      );
      if (!defaultSemesterRes.rows || defaultSemesterRes.rows.length === 0) {
        throw new Error(
          `No semester available and opportunity ${oldId} has invalid semester: ${row.semestre}`,
        );
      }
      semesterId = (defaultSemesterRes.rows[0] as { id: string }).id;
      logger.warn(
        { entity: ENTITY, opportunityId: oldId },
        `Semester not found for name: ${row.semestre}, using default: ${semesterId}`,
      );
    } else {
      semesterId = foundSemesterId;
    }
  } else {
    // Se não tem semestre, buscar primeiro disponível
    const defaultSemesterRes = await postgres.query(
      `SELECT id FROM semester ORDER BY name LIMIT 1`,
    );
    if (!defaultSemesterRes.rows || defaultSemesterRes.rows.length === 0) {
      throw new Error(
        `No semester available and opportunity ${oldId} has no semester`,
      );
    }
    semesterId = (defaultSemesterRes.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, opportunityId: oldId },
      `Opportunity has no semester, using default: ${semesterId}`,
    );
  }

  // gender_id é NOT NULL, então precisamos garantir um valor
  let genderId: string;
  if (row.sexo) {
    const foundGenderId = await getGenderIdFromName(row.sexo);
    if (!foundGenderId) {
      // Buscar primeiro gender disponível como fallback
      const defaultGenderRes = await postgres.query(
        `SELECT id FROM gender ORDER BY name LIMIT 1`,
      );
      if (!defaultGenderRes.rows || defaultGenderRes.rows.length === 0) {
        throw new Error(
          `No gender available and opportunity ${oldId} has invalid gender: ${row.sexo}`,
        );
      }
      genderId = (defaultGenderRes.rows[0] as { id: string }).id;
      logger.warn(
        { entity: ENTITY, opportunityId: oldId },
        `Gender not found for name: ${row.sexo}, using default: ${genderId}`,
      );
    } else {
      genderId = foundGenderId;
    }
  } else {
    // Se não tem gender, buscar primeiro disponível
    const defaultGenderRes = await postgres.query(
      `SELECT id FROM gender ORDER BY name LIMIT 1`,
    );
    if (!defaultGenderRes.rows || defaultGenderRes.rows.length === 0) {
      throw new Error(
        `No gender available and opportunity ${oldId} has no gender`,
      );
    }
    genderId = (defaultGenderRes.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, opportunityId: oldId },
      `Opportunity has no gender, using default: ${genderId}`,
    );
  }

  // company_supervisor_id é NOT NULL, então precisamos garantir um valor
  let companySupervisorId: string;
  if (row.supervisor) {
    const foundSupervisorId = await getCompanySupervisorIdByName(
      companyId,
      row.supervisor,
    );
    if (!foundSupervisorId) {
      // Buscar primeiro supervisor da empresa como fallback
      const defaultSupervisorRes = await postgres.query(
        `SELECT id FROM company_supervisor WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
        [companyId],
      );
      if (
        !defaultSupervisorRes.rows ||
        defaultSupervisorRes.rows.length === 0
      ) {
        throw new Error(
          `No company supervisor found for company ${companyId} and opportunity ${oldId}`,
        );
      }
      companySupervisorId = (defaultSupervisorRes.rows[0] as { id: string }).id;
      logger.warn(
        { entity: ENTITY, opportunityId: oldId },
        `Supervisor not found for name: ${row.supervisor}, using first supervisor: ${companySupervisorId}`,
      );
    } else {
      companySupervisorId = foundSupervisorId;
    }
  } else {
    // Se não tem supervisor, buscar primeiro da empresa
    const defaultSupervisorRes = await postgres.query(
      `SELECT id FROM company_supervisor WHERE company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId],
    );
    if (!defaultSupervisorRes.rows || defaultSupervisorRes.rows.length === 0) {
      throw new Error(
        `No company supervisor found for company ${companyId} (opportunity: ${oldId})`,
      );
    }
    companySupervisorId = (defaultSupervisorRes.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, opportunityId: oldId },
      `Opportunity has no supervisor, using first supervisor: ${companySupervisorId}`,
    );
  }

  const stipendAmount = parseStipendAmount(row.bolsa);

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, public_id, company_id, company_supervisor_id, status,
        course_id, openings, contact_name, reference_point, schedule_text,
        interviewer_name, education_level, semester_id, gender_id,
        accepts_disabled_candidates, stipend_amount, benefits_text,
        requirements_text, activities_text, application_instructions, notes,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      `,
      [
        uuidv7(),
        oldId,
        publicId,
        companyId,
        companySupervisorId,
        mapStatus(row.status),
        courseId,
        row.qt_vaga || 1,
        row.contato.trim() || "",
        row.ponto_referencia?.trim() || "",
        row.dia_horario.trim() || "",
        row.entrevistador.trim() || "",
        row.nivel.trim() || "",
        semesterId,
        genderId,
        Boolean(row.deficiencia),
        stipendAmount,
        row.beneficio?.trim() || null,
        row.exigencia?.trim() || null,
        row.atividade?.trim() || null,
        null, // application_instructions não existe no antigo
        row.observacao?.trim() || null,
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
        SET public_id = $1, company_id = $2, company_supervisor_id = $3, status = $4,
            course_id = $5, openings = $6, contact_name = $7, reference_point = $8,
            schedule_text = $9, interviewer_name = $10, education_level = $11,
            semester_id = $12, gender_id = $13, accepts_disabled_candidates = $14,
            stipend_amount = $15, benefits_text = $16, requirements_text = $17,
            activities_text = $18, application_instructions = $19, notes = $20,
            updated_at = $21
        WHERE id = $22
        `,
        [
          publicId,
          companyId,
          companySupervisorId,
          mapStatus(row.status),
          courseId,
          row.qt_vaga || 1,
          row.contato.trim() || "",
          row.ponto_referencia?.trim() || "",
          row.dia_horario.trim() || "",
          row.entrevistador.trim() || "",
          row.nivel.trim() || "",
          semesterId,
          genderId,
          Boolean(row.deficiencia),
          stipendAmount,
          row.beneficio?.trim() || null,
          row.exigencia?.trim() || null,
          row.atividade?.trim() || null,
          null, // application_instructions
          row.observacao?.trim() || null,
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
    const [rows] = await mariadb.query<LegacyVagaRow[]>(
      `
      SELECT id, codigo_vaga, status, empresa_id, supervisor, curso, semestre, sexo,
             qt_vaga, contato, ponto_referencia, dia_horario, entrevistador, nivel,
             deficiencia, bolsa, beneficio, exigencia, atividade, observacao,
             created_at, updated_at
      FROM vagas
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertOpportunity(r);
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
    const [rows] = await mariadb.query<LegacyVagaRow[]>(
      `
      SELECT id, codigo_vaga, status, empresa_id, supervisor, curso, semestre, sexo,
             qt_vaga, contato, ponto_referencia, dia_horario, entrevistador, nivel,
             deficiencia, bolsa, beneficio, exigencia, atividade, observacao,
             created_at, updated_at
      FROM vagas
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
        await upsertOpportunity(r);
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
  genderNameCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const opportunityMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
