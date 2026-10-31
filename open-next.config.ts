import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR in this app, so no incremental cache bucket is needed.
export default defineCloudflareConfig({});
