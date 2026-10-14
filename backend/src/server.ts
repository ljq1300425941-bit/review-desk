import { createApp } from "./app.js";
import { openDatabase } from "./db/database.js";
import { databasePath } from "./config/paths.js";

const db = openDatabase();
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const server = createApp(db).listen(port, "127.0.0.1", () => {
  console.log(`Review Desk API: http://127.0.0.1:${port}`);
  console.log(`SQLite: ${databasePath}`);
});
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
