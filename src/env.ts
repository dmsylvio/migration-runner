import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),

  MARIADB_HOST: z.string(),
  MARIADB_PORT: z.coerce.number().default(3306),
  MARIADB_USER: z.string(),
  MARIADB_PASSWORD: z.string().default(""),
  MARIADB_DATABASE: z.string(),

  POSTGRES_URL: z.string().url(),

  BATCH_SIZE: z.coerce.number().int().positive().default(2000),
  LOG_LEVEL: z.string().default("info"),

  /** When "1" or "true", users migrator only inserts missing users (ON CONFLICT DO NOTHING). */
  USERS_INSERT_ONLY: z
    .string()
    .optional()
    .default("")
    .transform((v) => v === "1" || v === "true"),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
