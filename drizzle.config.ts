import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations; they are applied with `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
