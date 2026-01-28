import type { Migrator } from "./types";
import type { RowDataPacket } from "mysql2";
import { mariadb } from "../db/mariadb";
import { postgres } from "../db/postgres";
import { getCheckpoint, setCheckpoint } from "../state/checkpoints";
import { logError } from "../state/errors";
import { env } from "../env";
import { logger } from "../logger";
import { uuidv7 } from "uuidv7";

const ENTITY = "student";

// ✅ Novo schema (Drizzle):
// student: id(text uuidv7), old_id(text), user_id(text not null), notes, full_name, birth_date, cpf_number,
// rg_number, issue_agency, has_driver_license, gender_id, marital_status_id, has_disability, disability_type,
// father_name, mother_name, address, city, state_id, zip_code, phone, whatsapp, education_level_id, course_id,
// educational_institution_id, has_oab_license, enrollment, semester_id, shift_id, available_shift_id,
// english_level, spanish_level, french_level, other_languages, improvement_courses, it_courses, created_at, updated_at
// ✅ UPSERT por old_id
const TARGET_TABLE = "student";

type LegacyGender = "masculino" | "feminino" | "ambos";
type LegacyAvailableShift =
  | "matutino"
  | "vespertino"
  | "noturno"
  | "tempo_integral";
type LegacyLanguageLevel = "nenhum" | "básico" | "intermediário" | "avançado";

interface LegacyStudentRow extends RowDataPacket {
  id: number; // int(11) PK
  usuario_id: number; // int(11) -> precisa converter para UUID
  notas: string | null; // text -> notes
  nome_completo: string; // varchar(191) -> full_name
  data_nascimento: any; // date -> birth_date
  cpf: string; // varchar(14) -> cpf_number
  rg: string; // varchar(191) -> rg_number
  orgao_expedidor: string | null; // varchar(191) -> issue_agency
  possui_cnh: number; // tinyint(1) -> has_driver_license
  genero: LegacyGender; // enum -> precisa mapear para gender_id UUID
  estado_civil_id: number; // int(11) -> precisa converter para marital_status_id UUID
  possui_deficiencia: number; // tinyint(1) -> has_disability
  tipo_deficiencia: string | null; // varchar(191) -> disability_type
  nome_pai: string | null; // varchar(191) -> father_name
  nome_mae: string | null; // varchar(191) -> mother_name
  endereco: string | null; // varchar(191) -> address
  cidade: string | null; // varchar(100) -> city
  estado_id: number; // int(11) -> precisa converter para state_id UUID
  cep: string; // varchar(9) -> zip_code
  telefone: string; // varchar(20) -> phone
  whatsapp: string | null; // varchar(20) -> whatsapp
  nivel_escolaridade_id: number; // int(11) -> precisa converter para education_level_id UUID
  curso_id: number; // int(11) -> precisa converter para course_id UUID
  instituicao_id: number; // int(11) -> precisa converter para educational_institution_id UUID
  possui_oab: number | null; // int(1) -> has_oab_license
  matricula: string | null; // varchar(100) -> enrollment
  semestre_id: number | null; // int(11) -> precisa converter para semester_id UUID
  turno_id: number; // int(11) -> precisa converter para shift_id UUID
  horario_disponivel: LegacyAvailableShift; // enum -> precisa mapear para available_shift_id UUID
  ingles: LegacyLanguageLevel; // enum -> english_level
  espanhol: LegacyLanguageLevel; // enum -> spanish_level
  frances: LegacyLanguageLevel; // enum -> french_level
  outro_idioma: string | null; // varchar(255) -> other_languages
  ImprovementCourse: string | null; // longtext -> improvement_courses
  ITCourse: string | null; // longtext -> it_courses
  createdAt: any; // datetime -> created_at
  updatedAt: any; // datetime -> updated_at
}

// Caches para evitar múltiplas queries
const userIdCache = new Map<number, string>();
const stateIdCache = new Map<number, string>();
const maritalStatusIdCache = new Map<number, string>();
const educationLevelIdCache = new Map<number, string>();
const courseIdCache = new Map<number, string>();
const educationalInstitutionIdCache = new Map<number, string>();
const semesterIdCache = new Map<number, string>();
const shiftIdCache = new Map<number, string>();
const genderNameCache = new Map<string, string>();

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

async function getStateIdFromOldId(oldStateId: number): Promise<string | null> {
  if (stateIdCache.has(oldStateId)) {
    return stateIdCache.get(oldStateId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM state WHERE old_id = $1 LIMIT 1`,
    [String(oldStateId)],
  );

  if (res.rows && res.rows.length > 0) {
    const stateId = (res.rows[0] as { id: string }).id;
    stateIdCache.set(oldStateId, stateId);
    return stateId;
  }

  return null;
}

async function getMaritalStatusIdFromOldId(
  oldMaritalStatusId: number,
): Promise<string | null> {
  if (maritalStatusIdCache.has(oldMaritalStatusId)) {
    return maritalStatusIdCache.get(oldMaritalStatusId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM marital_status WHERE old_id = $1 LIMIT 1`,
    [String(oldMaritalStatusId)],
  );

  if (res.rows && res.rows.length > 0) {
    const maritalStatusId = (res.rows[0] as { id: string }).id;
    maritalStatusIdCache.set(oldMaritalStatusId, maritalStatusId);
    return maritalStatusId;
  }

  return null;
}

async function getEducationLevelIdFromOldId(
  oldEducationLevelId: number,
): Promise<string | null> {
  if (educationLevelIdCache.has(oldEducationLevelId)) {
    return educationLevelIdCache.get(oldEducationLevelId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM education_level WHERE old_id = $1 LIMIT 1`,
    [String(oldEducationLevelId)],
  );

  if (res.rows && res.rows.length > 0) {
    const educationLevelId = (res.rows[0] as { id: string }).id;
    educationLevelIdCache.set(oldEducationLevelId, educationLevelId);
    return educationLevelId;
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

async function getEducationalInstitutionIdFromOldId(
  oldEducationalInstitutionId: number,
): Promise<string | null> {
  if (educationalInstitutionIdCache.has(oldEducationalInstitutionId)) {
    return (
      educationalInstitutionIdCache.get(oldEducationalInstitutionId) || null
    );
  }

  const res = await postgres.query(
    `SELECT id FROM educational_institution WHERE old_id = $1 LIMIT 1`,
    [String(oldEducationalInstitutionId)],
  );

  if (res.rows && res.rows.length > 0) {
    const educationalInstitutionId = (res.rows[0] as { id: string }).id;
    educationalInstitutionIdCache.set(
      oldEducationalInstitutionId,
      educationalInstitutionId,
    );
    return educationalInstitutionId;
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

async function getShiftIdFromOldId(oldShiftId: number): Promise<string | null> {
  if (shiftIdCache.has(oldShiftId)) {
    return shiftIdCache.get(oldShiftId) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM shift WHERE old_id = $1 LIMIT 1`,
    [String(oldShiftId)],
  );

  if (res.rows && res.rows.length > 0) {
    const shiftId = (res.rows[0] as { id: string }).id;
    shiftIdCache.set(oldShiftId, shiftId);
    return shiftId;
  }

  return null;
}

async function getGenderIdFromName(genderName: string): Promise<string | null> {
  // Mapear enum para nome de gender
  const genderMap: Record<LegacyGender, string> = {
    masculino: "Masculino",
    feminino: "Feminino",
    ambos: "Outro",
  };

  const mappedName = genderMap[genderName as LegacyGender] || genderName;

  if (genderNameCache.has(mappedName)) {
    return genderNameCache.get(mappedName) || null;
  }

  const res = await postgres.query(
    `SELECT id FROM gender WHERE name = $1 LIMIT 1`,
    [mappedName],
  );

  if (res.rows && res.rows.length > 0) {
    const genderId = (res.rows[0] as { id: string }).id;
    genderNameCache.set(mappedName, genderId);
    return genderId;
  }

  return null;
}

async function getShiftIdFromAvailableShiftName(
  shiftName: LegacyAvailableShift,
): Promise<string | null> {
  // Mapear enum para nome de shift
  const shiftMap: Record<LegacyAvailableShift, string> = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    noturno: "Noturno",
    tempo_integral: "Integral",
  };

  const mappedName = shiftMap[shiftName] || shiftName;

  // Usar o cache de shift se já tiver sido buscado por nome
  const res = await postgres.query(
    `SELECT id FROM shift WHERE name = $1 LIMIT 1`,
    [mappedName],
  );

  if (res.rows && res.rows.length > 0) {
    return (res.rows[0] as { id: string }).id;
  }

  return null;
}

function mapLanguageLevel(
  level: LegacyLanguageLevel,
): "beginner" | "intermediate" | "advanced" | "native" {
  switch (level) {
    case "nenhum":
      return "beginner";
    case "básico":
      return "beginner";
    case "intermediário":
      return "intermediate";
    case "avançado":
      return "advanced";
    default:
      return "beginner";
  }
}

async function upsertStudent(row: LegacyStudentRow) {
  const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
  const updatedAt = row.updatedAt ? new Date(row.updatedAt) : createdAt;
  const oldId = String(row.id);

  // Converter todas as foreign keys
  const userId = await getUserIdFromOldId(row.usuario_id);
  if (!userId) {
    throw new Error(
      `User not found for old_id: ${row.usuario_id} (student: ${oldId})`,
    );
  }

  const stateId = await getStateIdFromOldId(row.estado_id);
  if (!stateId) {
    throw new Error(
      `State not found for old_id: ${row.estado_id} (student: ${oldId})`,
    );
  }

  const maritalStatusId = await getMaritalStatusIdFromOldId(
    row.estado_civil_id,
  );
  if (!maritalStatusId) {
    throw new Error(
      `Marital status not found for old_id: ${row.estado_civil_id} (student: ${oldId})`,
    );
  }

  const educationLevelId = await getEducationLevelIdFromOldId(
    row.nivel_escolaridade_id,
  );
  if (!educationLevelId) {
    throw new Error(
      `Education level not found for old_id: ${row.nivel_escolaridade_id} (student: ${oldId})`,
    );
  }

  const courseId = await getCourseIdFromOldId(row.curso_id);
  if (!courseId) {
    throw new Error(
      `Course not found for old_id: ${row.curso_id} (student: ${oldId})`,
    );
  }

  const educationalInstitutionId = await getEducationalInstitutionIdFromOldId(
    row.instituicao_id,
  );
  if (!educationalInstitutionId) {
    throw new Error(
      `Educational institution not found for old_id: ${row.instituicao_id} (student: ${oldId})`,
    );
  }

  // semester_id é NOT NULL no schema, então precisamos garantir um valor
  let semesterId: string;
  if (row.semestre_id) {
    const foundSemesterId = await getSemesterIdFromOldId(row.semestre_id);
    if (!foundSemesterId) {
      throw new Error(
        `Semester not found for old_id: ${row.semestre_id} (student: ${oldId})`,
      );
    }
    semesterId = foundSemesterId;
  } else {
    // Se não tem semestre_id, buscar um semestre padrão (primeiro disponível)
    const defaultSemesterRes = await postgres.query(
      `SELECT id FROM semester ORDER BY name LIMIT 1`,
    );
    if (!defaultSemesterRes.rows || defaultSemesterRes.rows.length === 0) {
      throw new Error(
        `No semester available and student ${oldId} has no semester_id`,
      );
    }
    semesterId = (defaultSemesterRes.rows[0] as { id: string }).id;
    logger.warn(
      { entity: ENTITY, studentId: oldId },
      `Student has no semester_id, using default semester: ${semesterId}`,
    );
  }

  const shiftId = await getShiftIdFromOldId(row.turno_id);
  if (!shiftId) {
    throw new Error(
      `Shift not found for old_id: ${row.turno_id} (student: ${oldId})`,
    );
  }

  const genderId = await getGenderIdFromName(row.genero);
  if (!genderId) {
    throw new Error(
      `Gender not found for name: ${row.genero} (student: ${oldId})`,
    );
  }

  const availableShiftId = await getShiftIdFromAvailableShiftName(
    row.horario_disponivel,
  );
  if (!availableShiftId) {
    throw new Error(
      `Available shift not found for name: ${row.horario_disponivel} (student: ${oldId})`,
    );
  }

  // Tentar inserir primeiro (mais comum)
  try {
    await postgres.query(
      `
      INSERT INTO ${TARGET_TABLE} (
        id, old_id, user_id, notes, full_name, birth_date, cpf_number, rg_number,
        issue_agency, has_driver_license, gender_id, marital_status_id, has_disability,
        disability_type, father_name, mother_name, address, city, state_id, zip_code,
        phone, whatsapp, education_level_id, course_id, educational_institution_id,
        has_oab_license, enrollment, semester_id, shift_id, available_shift_id,
        english_level, spanish_level, french_level, other_languages, improvement_courses,
        it_courses, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
      `,
      [
        uuidv7(),
        oldId,
        userId,
        row.notas,
        row.nome_completo.trim(),
        row.data_nascimento,
        row.cpf.trim(),
        row.rg.trim(),
        row.orgao_expedidor?.trim() || null,
        Boolean(row.possui_cnh),
        genderId,
        maritalStatusId,
        Boolean(row.possui_deficiencia),
        row.tipo_deficiencia?.trim() || null,
        row.nome_pai?.trim() || null,
        row.nome_mae?.trim() || null,
        row.endereco?.trim() || null,
        row.cidade?.trim() || null,
        stateId,
        row.cep.trim(),
        row.telefone.trim(),
        row.whatsapp?.trim() || null,
        educationLevelId,
        courseId,
        educationalInstitutionId,
        Boolean(row.possui_oab ?? 0),
        row.matricula?.trim() || null,
        semesterId,
        shiftId,
        availableShiftId,
        mapLanguageLevel(row.ingles),
        mapLanguageLevel(row.espanhol),
        mapLanguageLevel(row.frances),
        row.outro_idioma?.trim() || null,
        row.ImprovementCourse || null,
        row.ITCourse || null,
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
        SET user_id = $1, notes = $2, full_name = $3, birth_date = $4, cpf_number = $5,
            rg_number = $6, issue_agency = $7, has_driver_license = $8, gender_id = $9,
            marital_status_id = $10, has_disability = $11, disability_type = $12,
            father_name = $13, mother_name = $14, address = $15, city = $16, state_id = $17,
            zip_code = $18, phone = $19, whatsapp = $20, education_level_id = $21,
            course_id = $22, educational_institution_id = $23, has_oab_license = $24,
            enrollment = $25, semester_id = $26, shift_id = $27, available_shift_id = $28,
            english_level = $29, spanish_level = $30, french_level = $31,
            other_languages = $32, improvement_courses = $33, it_courses = $34, updated_at = $35
        WHERE id = $36
        `,
        [
          userId,
          row.notas,
          row.nome_completo.trim(),
          row.data_nascimento,
          row.cpf.trim(),
          row.rg.trim(),
          row.orgao_expedidor?.trim() || null,
          Boolean(row.possui_cnh),
          genderId,
          maritalStatusId,
          Boolean(row.possui_deficiencia),
          row.tipo_deficiencia?.trim() || null,
          row.nome_pai?.trim() || null,
          row.nome_mae?.trim() || null,
          row.endereco?.trim() || null,
          row.cidade?.trim() || null,
          stateId,
          row.cep.trim(),
          row.telefone.trim(),
          row.whatsapp?.trim() || null,
          educationLevelId,
          courseId,
          educationalInstitutionId,
          Boolean(row.possui_oab ?? 0),
          row.matricula?.trim() || null,
          semesterId,
          shiftId,
          availableShiftId,
          mapLanguageLevel(row.ingles),
          mapLanguageLevel(row.espanhol),
          mapLanguageLevel(row.frances),
          row.outro_idioma?.trim() || null,
          row.ImprovementCourse || null,
          row.ITCourse || null,
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
    const [rows] = await mariadb.query<LegacyStudentRow[]>(
      `
      SELECT id, usuario_id, notas, nome_completo, data_nascimento, cpf, rg, orgao_expedidor,
             possui_cnh, genero, estado_civil_id, possui_deficiencia, tipo_deficiencia,
             nome_pai, nome_mae, endereco, cidade, estado_id, cep, telefone, whatsapp,
             nivel_escolaridade_id, curso_id, instituicao_id, possui_oab, matricula,
             semestre_id, turno_id, horario_disponivel, ingles, espanhol, frances,
             outro_idioma, ImprovementCourse, ITCourse, createdAt, updatedAt
      FROM tb_estudante
      WHERE id > :lastPk
      ORDER BY id
      LIMIT :limit
      `,
      { lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertStudent(r);
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
  userIdCache.clear();
  stateIdCache.clear();
  maritalStatusIdCache.clear();
  educationLevelIdCache.clear();
  courseIdCache.clear();
  educationalInstitutionIdCache.clear();
  semesterIdCache.clear();
  shiftIdCache.clear();
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
  let lastPk = 0;

  while (true) {
    const [rows] = await mariadb.query<LegacyStudentRow[]>(
      `
      SELECT id, usuario_id, notas, nome_completo, data_nascimento, cpf, rg, orgao_expedidor,
             possui_cnh, genero, estado_civil_id, possui_deficiencia, tipo_deficiencia,
             nome_pai, nome_mae, endereco, cidade, estado_id, cep, telefone, whatsapp,
             nivel_escolaridade_id, curso_id, instituicao_id, possui_oab, matricula,
             semestre_id, turno_id, horario_disponivel, ingles, espanhol, frances,
             outro_idioma, ImprovementCourse, ITCourse, createdAt, updatedAt
      FROM tb_estudante
      WHERE (COALESCE(updatedAt, createdAt) > :cursor)
         OR (COALESCE(updatedAt, createdAt) = :cursor AND id > :lastPk)
      ORDER BY COALESCE(updatedAt, createdAt), id
      LIMIT :limit
      `,
      { cursor: lastCursor, lastPk, limit: env.BATCH_SIZE },
    );

    if (rows.length === 0) break;

    try {
      for (const r of rows) {
        await upsertStudent(r);
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
    lastCursor = new Date((lastRow.updatedAt ?? lastRow.createdAt) as any);
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
  userIdCache.clear();
  stateIdCache.clear();
  maritalStatusIdCache.clear();
  educationLevelIdCache.clear();
  courseIdCache.clear();
  educationalInstitutionIdCache.clear();
  semesterIdCache.clear();
  shiftIdCache.clear();
  genderNameCache.clear();

  await setCheckpoint(ENTITY, "updated_at", lastCursor.toISOString());
  logger.info(
    { entity: ENTITY, checkpoint: lastCursor.toISOString() },
    "sync:done",
  );
}

export const studentMigrator: Migrator = {
  entity: ENTITY,
  seed,
  sync,
};
