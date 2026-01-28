import { getMigrator, migrators } from "./entities/index.js";
import { startRun, finishRun } from "./state/runs.js";
import { logger } from "./logger.js";

// Ordem de migração recomendada (baseada em dependências)
const MIGRATION_ORDER = [
  // Fase 1: Tabelas de Referência (Sem Dependências)
  "state",
  "gender",
  "marital_status",
  "education_level",
  "course",
  "semester",
  "shift",
  "educational_institution",
  // Fase 2: Usuários
  "users",
  // Fase 3: Entidades Principais
  "company",
  "institutions",
  "student",
  // Fase 4: Representantes e Supervisores
  "company_representative",
  "company_supervisor",
  "institution_representative",
  "institution_supervisor",
  // Fase 5: Solicitações
  "intern_requests",
  "internship_agreement_requests",
  // Fase 6: Termos
  "internship_commitment_term",
  "internship_termination_requests",
  "signed_internship_commitment_term",
  // Fase 7: Oportunidades
  "opportunity",
];

async function runSingleMigration(
  cmd: "seed" | "sync",
  entity: string,
  runId: number,
) {
  logger.info({ entity, cmd }, "Starting migration");
  const migrator = getMigrator(entity);

  try {
    if (cmd === "seed") {
      await migrator.seed(runId);
    } else {
      await migrator.sync(runId);
    }
    logger.info({ entity, cmd }, "Migration completed successfully");
  } catch (e: any) {
    logger.error({ entity, cmd, error: e?.message }, "Migration failed");
    throw e;
  }
}

async function runAllMigrations(cmd: "seed" | "sync") {
  const runId = await startRun(cmd, "Running all migrations in order");

  logger.info(
    { cmd, total: MIGRATION_ORDER.length },
    "Starting all migrations",
  );

  const results: Array<{ entity: string; success: boolean; error?: string }> =
    [];

  for (const entity of MIGRATION_ORDER) {
    try {
      await runSingleMigration(cmd, entity, runId);
      results.push({ entity, success: true });
    } catch (e: any) {
      results.push({
        entity,
        success: false,
        error: e?.message ?? "Unknown error",
      });
      // Continuar com as próximas migrações mesmo se uma falhar
      logger.warn(
        { entity, error: e?.message },
        "Migration failed, continuing with next",
      );
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  logger.info(
    { successCount, failedCount, total: results.length },
    "All migrations completed",
  );

  if (failedCount > 0) {
    logger.error(
      {
        failed: results.filter((r) => !r.success),
      },
      "Some migrations failed",
    );
  }

  await finishRun(runId, failedCount === 0 ? "success" : "failed");

  return results;
}

async function main() {
  const cmd = process.argv[2];
  const entity = process.argv[3];

  if (!cmd || !["seed", "sync"].includes(cmd)) {
    console.log("Use: seed <entity> | sync <entity> | seed --all | sync --all");
    process.exit(1);
  }

  // Se for --all, executar todas as migrações
  if (entity === "--all") {
    const results = await runAllMigrations(cmd as "seed" | "sync");

    // Exibir resumo
    console.log("\n=== Migration Summary ===");
    console.log(`Total: ${results.length}`);
    console.log(`Success: ${results.filter((r) => r.success).length}`);
    console.log(`Failed: ${results.filter((r) => !r.success).length}`);

    if (results.some((r) => !r.success)) {
      console.log("\nFailed migrations:");
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.entity}: ${r.error}`);
        });
      process.exit(1);
    } else {
      console.log("\n✅ All migrations completed successfully!");
      process.exit(0);
    }
    return;
  }

  // Executar migração única
  if (!entity) {
    console.log(
      "Entity is required. Use: seed <entity> | sync <entity> | seed --all | sync --all",
    );
    process.exit(1);
  }

  const runId = await startRun(cmd as "seed" | "sync");

  try {
    await runSingleMigration(cmd as "seed" | "sync", entity, runId);
    await finishRun(runId, "success");
    console.log("✅ DONE");
  } catch (e) {
    await finishRun(runId, "failed");
    console.error("❌ FAILED:", e);
    process.exit(1);
  }
}

main();
