import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

/** D1 through the Worker binding (also available in `next dev` via initOpenNextCloudflareForDev). */
export function getDb(): DB {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

export { schema };
