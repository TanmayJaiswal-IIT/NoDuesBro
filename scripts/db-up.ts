import EmbeddedPostgres from "embedded-postgres";

const port = 54329;

const postgres = new EmbeddedPostgres({
  databaseDir: ".data/postgres",
  user: "found",
  password: "found",
  port,
  persistent: true,
  autoRehydrateSymlinks: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  await postgres.initialise();
  await postgres.start();

  try {
    await postgres.createDatabase("found");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      throw error;
    }
  }

  console.log(`Postgres listening on 127.0.0.1:${port}`);
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
