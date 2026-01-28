import type { Migrator } from "./types.js";
import { usersMigrator } from "./users.migrator.js";
import { stateMigrator } from "./state.migrator.js";
import { genderMigrator } from "./gender.migrator.js";
import { maritalStatusMigrator } from "./marital-status.migrator.js";
import { educationLevelMigrator } from "./education-level.migrator.js";
import { courseMigrator } from "./course.migrator.js";
import { semesterMigrator } from "./semester.migrator.js";
import { shiftMigrator } from "./shift.migrator.js";
import { educationalInstitutionMigrator } from "./educational-institution.migrator.js";
import { companyMigrator } from "./company.migrator.js";
import { companyRepresentativeMigrator } from "./company-representative.migrator.js";
import { companySupervisorMigrator } from "./company-supervisor.migrator.js";
import { institutionsMigrator } from "./institutions.migrator.js";
import { institutionRepresentativeMigrator } from "./institution-representative.migrator.js";
import { institutionSupervisorMigrator } from "./institution-supervisor.migrator.js";
import { studentMigrator } from "./student.migrator.js";
import { internRequestsMigrator } from "./intern-requests.migrator.js";
import { internshipAgreementRequestsMigrator } from "./internship-agreement-requests.migrator.js";
import { internshipCommitmentTermMigrator } from "./internship-commitment-term.migrator.js";
import { internshipTerminationRequestsMigrator } from "./internship-termination-requests.migrator.js";
import { signedInternshipCommitmentTermMigrator } from "./signed-internship-commitment-term.migrator.js";
import { opportunityMigrator } from "./opportunity.migrator.js";

export const migrators: Migrator[] = [
  usersMigrator,
  stateMigrator,
  genderMigrator,
  maritalStatusMigrator,
  educationLevelMigrator,
  courseMigrator,
  semesterMigrator,
  shiftMigrator,
  educationalInstitutionMigrator,
  companyMigrator,
  companyRepresentativeMigrator,
  companySupervisorMigrator,
  institutionsMigrator,
  institutionRepresentativeMigrator,
  institutionSupervisorMigrator,
  studentMigrator,
  internRequestsMigrator,
  internshipAgreementRequestsMigrator,
  internshipCommitmentTermMigrator,
  internshipTerminationRequestsMigrator,
  signedInternshipCommitmentTermMigrator,
  opportunityMigrator,
];

export function getMigrator(entity: string) {
  const m = migrators.find((x) => x.entity === entity);
  if (!m) throw new Error(`Unknown entity: ${entity}`);
  return m;
}
