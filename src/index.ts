// Re-export for backward compatibility.
// New entry point is src/cli.ts with subcommand dispatch.
export { runInsert } from "./commands/insert.ts";
export { runTemplate } from "./commands/template.ts";
