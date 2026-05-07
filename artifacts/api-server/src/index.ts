import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { startElectionAutomation } from "./services/election-automation";

const rawPort = process.env["PORT"] ?? "3000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startElectionAutomation();
});
