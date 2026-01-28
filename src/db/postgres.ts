import { Pool } from "pg";
import { env } from "../env.js";

export const postgres = new Pool({
  connectionString: env.POSTGRES_URL,
  max: 10,
});
