import { db } from "@workspace/db";
import { electionsTable } from "@workspace/db";
import { and, eq, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { activateElectionById, finalizeElectionById } from "./election-lifecycle";

const DEFAULT_INTERVAL_MS = 5_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runElectionAutomationNow(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const now = new Date();

    const pendingToStart = await db
      .select({ id: electionsTable.id })
      .from(electionsTable)
      .where(
        and(
          eq(electionsTable.status, "pending"),
          lte(electionsTable.scheduledStartAt, now),
        ),
      );

    let started = 0;
    for (const election of pendingToStart) {
      const result = await activateElectionById(election.id);
      if (result.ok) {
        started++;
        continue;
      }

      logger.warn(
        { electionId: election.id, reason: result.message },
        "Election automation could not activate scheduled election",
      );
    }

    const activeToEnd = await db
      .select({ id: electionsTable.id })
      .from(electionsTable)
      .where(
        and(
          eq(electionsTable.status, "active"),
          lte(electionsTable.scheduledEndAt, now),
        ),
      );

    let ended = 0;
    for (const election of activeToEnd) {
      const result = await finalizeElectionById(election.id);
      if (result.ok) {
        ended++;
        continue;
      }

      logger.warn(
        { electionId: election.id, reason: result.message },
        "Election automation could not finalize scheduled election",
      );
    }

    if (started > 0 || ended > 0) {
      logger.info(
        { started, ended },
        "Election automation cycle executed",
      );
    }
  } catch (err) {
    logger.error({ err }, "Election automation cycle failed");
  } finally {
    running = false;
  }
}

export function startElectionAutomation(): void {
  if (process.env.ELECTION_AUTOMATION_ENABLED === "false") {
    logger.info("Election automation disabled by ELECTION_AUTOMATION_ENABLED=false");
    return;
  }

  if (timer) return;

  const configured = Number.parseInt(
    process.env.ELECTION_AUTOMATION_INTERVAL_MS || "",
    10,
  );
  const intervalMs =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_INTERVAL_MS;

  timer = setInterval(() => {
    void runElectionAutomationNow();
  }, intervalMs);

  void runElectionAutomationNow();
  logger.info({ intervalMs }, "Election automation started");
}
