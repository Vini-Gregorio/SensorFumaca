import mysql from "mysql2/promise";
import { loadConfig } from "../backend/config.js";
import { migrate } from "../backend/migrations.js";
const connection = await mysql.createConnection(loadConfig().db);
try {
  await migrate(connection);
} finally {
  await connection.end();
}
