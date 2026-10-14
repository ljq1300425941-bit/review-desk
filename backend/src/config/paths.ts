import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const backendRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const projectRoot = resolve(backendRoot, "..");
export const frontendDist = resolve(projectRoot, "frontend/dist");

const configuredPath = process.env.DATABASE_PATH;
export const databasePath = configuredPath
  ? isAbsolute(configuredPath)
    ? configuredPath
    : resolve(projectRoot, configuredPath)
  : resolve(backendRoot, "data/review-desk.sqlite");
