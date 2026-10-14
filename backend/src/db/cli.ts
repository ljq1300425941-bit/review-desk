import { databasePath } from "../config/paths.js";
import { openDatabase, resetDatabase } from "./database.js";

const command = process.argv[2];
if (!["init", "reset"].includes(command))
  throw new Error("Use init or reset --confirm");
if (command === "reset" && !process.argv.includes("--confirm")) {
  throw new Error(
    "Reset deletes local review results. Pass --confirm explicitly.",
  );
}
const db = openDatabase();
try {
  if (command === "reset") resetDatabase(db);
  const counts = db
    .prepare(
      "SELECT status, count(*) AS count FROM submissions GROUP BY status",
    )
    .all();
  console.log(
    `${command === "reset" ? "已重置演示数据" : "数据库已初始化，已有审核结果保持不变"}：${databasePath}`,
  );
  console.table(counts);
} finally {
  db.close();
}
