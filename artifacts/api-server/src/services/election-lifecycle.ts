import { db } from "@workspace/db";
import { candidatesTable, electionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function activateElectionById(
  electionId: string,
): Promise<{ ok: boolean; message: string }> {
  const results = await db
    .select()
    .from(electionsTable)
    .where(eq(electionsTable.id, electionId));

  if (results.length === 0) {
    return { ok: false, message: "Election not found" };
  }

  if (results[0]?.status !== "pending") {
    return { ok: false, message: "Election is not in pending state" };
  }

  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.electionId, electionId));

  if (candidates.length < 2) {
    return { ok: false, message: "At least 2 candidates are required to start election" };
  }

  await db
    .update(electionsTable)
    .set({ status: "active" })
    .where(eq(electionsTable.id, electionId));

  return { ok: true, message: "Election started!" };
}

export async function finalizeElectionById(
  electionId: string,
): Promise<{
  ok: boolean;
  message: string;
  data?: {
    winner_name: string;
    winner_votes: number;
    results: Array<{ id: string; name: string; votes: number }>;
  };
}> {
  const results = await db
    .select()
    .from(electionsTable)
    .where(eq(electionsTable.id, electionId));

  if (results.length === 0) {
    return { ok: false, message: "Election not found" };
  }

  if (results[0]?.status !== "active") {
    return { ok: false, message: "Election is not active" };
  }

  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.electionId, electionId));

  let winner = candidates[0];
  for (const c of candidates) {
    if (c.votes > (winner?.votes ?? -1)) winner = c;
  }

  await db
    .update(electionsTable)
    .set({
      status: "ended",
      winnerCandidateId: winner?.id ?? null,
      winnerCandidateName: winner?.name ?? null,
    })
    .where(eq(electionsTable.id, electionId));

  const resultsData = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    votes: c.votes,
  }));

  return {
    ok: true,
    message: "Election ended!",
    data: {
      winner_name: winner?.name ?? "No winner",
      winner_votes: winner?.votes ?? 0,
      results: resultsData,
    },
  };
}
