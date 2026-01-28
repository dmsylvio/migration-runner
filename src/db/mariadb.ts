import mysql from "mysql2/promise";
import { env } from "../env.js";

export const mariadb = mysql.createPool({
  host: env.MARIADB_HOST,
  port: env.MARIADB_PORT,
  user: env.MARIADB_USER,
  password: env.MARIADB_PASSWORD,
  database: env.MARIADB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});
