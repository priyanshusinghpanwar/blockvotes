import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  electionsTable,
  companiesTable,
  votesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { activateElectionById, finalizeElectionById } from "../services/election-lifecycle";
import { runElectionAutomationNow } from "../services/election-automation";
import { finalizeElectionProofOnChain, isBlockchainEnabled } from "../services/blockchain-proof";
import {
  ensureElectionBelongsToAdmin,
  requireAdminAuth,
  requireAdminCompanyId,
} from "../lib/admin-auth";

const router: IRouter = Router();
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function getSingleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalizeAdminName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return normalized || "admin";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generateElectionId(companyId: string): Promise<string | null> {
  const companies = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  if (companies.length === 0) return null;

  const company = companies[0];
  const prefix = normalizeAdminName(company.name);

  const existing = await db.select({ id: electionsTable.id }).from(electionsTable);
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  let maxNumber = 0;

  for (const election of existing) {
    const match = election.id.match(pattern);
    if (!match) continue;

    const parsed = Number.parseInt(match[1] || "", 10);
    if (!Number.isNaN(parsed) && parsed > maxNumber) {
      maxNumber = parsed;
    }
  }

  const nextNumber = maxNumber + 1;
  return `${prefix}${nextNumber}`;
}

function parseIstDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;

  const input = value.trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = Number.parseInt(match[1] || "", 10);
  const month = Number.parseInt(match[2] || "", 10);
  const day = Number.parseInt(match[3] || "", 10);
  const hour = Number.parseInt(match[4] || "", 10);
  const minute = Number.parseInt(match[5] || "", 10);
  const second = Number.parseInt(match[6] || "0", 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    return null;
  }

  const offsetMs = IST_OFFSET_MINUTES * 60 * 1000;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
  const parsed = new Date(utcMs);
  if (Number.isNaN(parsed.getTime())) return null;

  const roundTrip = new Date(parsed.getTime() + offsetMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
}

function toIstString(value: Date | null): string | null {
  if (!value) return null;

  const istDate = new Date(value.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(istDate.getUTCDate()).padStart(2, "0");
  const hh = String(istDate.getUTCHours()).padStart(2, "0");
  const mi = String(istDate.getUTCMinutes()).padStart(2, "0");
  const ss = String(istDate.getUTCSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} IST`;
}

function floorToIstInterval(date: Date, intervalMinutes: number): Date {
  const offsetMs = IST_OFFSET_MINUTES * 60 * 1000;
  const intervalMs = intervalMinutes * 60 * 1000;
  const shiftedMs = date.getTime() + offsetMs;
  const flooredShiftedMs = Math.floor(shiftedMs / intervalMs) * intervalMs;
  return new Date(flooredShiftedMs - offsetMs);
}

function toIstLabel(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${day} ${month} ${hour}:${minute} IST`;
}

function resolveTrendTimeframe(value: unknown): { key: "5m" | "10m" | "15m" | "30m"; bucketMinutes: number } {
  if (value === "5m") return { key: "5m", bucketMinutes: 5 };
  if (value === "10m") return { key: "10m", bucketMinutes: 10 };
  if (value === "15m") return { key: "15m", bucketMinutes: 15 };
  if (value === "30m") return { key: "30m", bucketMinutes: 30 };
  return { key: "30m", bucketMinutes: 30 };
}

function toElapsedLabel(pointIndex: number, bucketMinutes: number): string {
  const totalMinutes = (pointIndex + 1) * bucketMinutes;
  return `${totalMinutes} min`;
}

router.get("/", requireAdminAuth, async (req, res) => {
  try {
    const companyId = requireAdminCompanyId(req);
    const requestedCompanyId =
      typeof req.query.company_id === "string" ? req.query.company_id : null;
    if (requestedCompanyId && requestedCompanyId !== companyId) {
      res.status(403).json({
        status: "error",
        message: "You are not authorized to access elections for another company",
        data: [],
      });
      return;
    }
    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.companyId, companyId));
    const mapped = elections.map((e) => ({
      id: e.id,
      company_id: e.companyId,
      name: e.name,
      description: e.description,
      status: e.status,
      winner_candidate_id: e.winnerCandidateId,
      winner_candidate_name: e.winnerCandidateName,
      scheduled_start_at: e.scheduledStartAt,
      scheduled_end_at: e.scheduledEndAt,
      scheduled_start_ist: toIstString(e.scheduledStartAt),
      scheduled_end_ist: toIstString(e.scheduledEndAt),
      created_at: e.createdAt,
    }));
    res.json({ status: "success", message: "Elections fetched", data: mapped });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: [] });
  }
});

router.post("/", requireAdminAuth, async (req, res) => {
  try {
    const companyId = requireAdminCompanyId(req);
    const { name, description, start_time_ist, end_time_ist } = req.body;
    if (!name || !description || !start_time_ist || !end_time_ist) {
      res.json({
        status: "error",
        message: "name, description, start_time_ist, and end_time_ist are required",
        data: null,
      });
      return;
    }

    const startAt = parseIstDateTime(start_time_ist);
    const endAt = parseIstDateTime(end_time_ist);
    if (!startAt || !endAt) {
      res.json({
        status: "error",
        message:
          "Invalid IST date-time format. Use YYYY-MM-DD HH:mm or YYYY-MM-DDTHH:mm",
        data: null,
      });
      return;
    }

    if (endAt <= startAt) {
      res.json({
        status: "error",
        message: "end_time_ist must be after start_time_ist",
        data: null,
      });
      return;
    }

    const id = await generateElectionId(companyId);
    if (!id) {
      res.json({ status: "error", message: "Company not found", data: null });
      return;
    }

    await db.insert(electionsTable).values({
      id,
      companyId,
      name,
      description,
      status: "pending",
      scheduledStartAt: startAt,
      scheduledEndAt: endAt,
    });

    await runElectionAutomationNow();

    const election = {
      id,
      company_id: companyId,
      name,
      description,
      status: "pending",
      winner_candidate_id: null,
      winner_candidate_name: null,
      scheduled_start_at: startAt,
      scheduled_end_at: endAt,
      scheduled_start_ist: toIstString(startAt),
      scheduled_end_ist: toIstString(endAt),
      created_at: new Date(),
    };

    res.json({ status: "success", message: "Election created and scheduled!", data: election });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.get("/:electionId", async (req, res) => {
  try {
    const electionId = getSingleParam(req.params.electionId);
    const results = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, electionId))
      .limit(1);
    const e = results[0];
    if (!e) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }
    res.json({
      status: "success",
      message: "Election fetched",
      data: {
        id: e.id,
        company_id: e.companyId,
        name: e.name,
        description: e.description,
        status: e.status,
        winner_candidate_id: e.winnerCandidateId,
        winner_candidate_name: e.winnerCandidateName,
        scheduled_start_at: e.scheduledStartAt,
        scheduled_end_at: e.scheduledEndAt,
        scheduled_start_ist: toIstString(e.scheduledStartAt),
        scheduled_end_ist: toIstString(e.scheduledEndAt),
        created_at: e.createdAt,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.get("/:electionId/hourly-trend", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getSingleParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const timeframe = resolveTrendTimeframe(req.query.timeframe);
    const bucketMs = timeframe.bucketMinutes * 60 * 1000;
    const maxPoints = 360;

    const ownedElection = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!ownedElection) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }
    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, electionId))
      .limit(1);

    const election = elections[0];

    const votes = await db
      .select({
        createdAt: votesTable.createdAt,
      })
      .from(votesTable)
      .where(eq(votesTable.electionId, electionId));

    const now = new Date();
    const defaultStart = election.scheduledStartAt ?? election.createdAt ?? now;
    const firstVoteAt =
      votes.length > 0
        ? votes.reduce((min, row) => (row.createdAt < min ? row.createdAt : min), votes[0]!.createdAt)
        : null;
    const startReference = firstVoteAt ?? defaultStart;
    const endReference =
      election.status === "ended" && election.scheduledEndAt ? election.scheduledEndAt : now;

    let startBucket = floorToIstInterval(startReference, timeframe.bucketMinutes);
    const endBucket = floorToIstInterval(endReference, timeframe.bucketMinutes);
    if (startBucket.getTime() > endBucket.getTime()) {
      startBucket = new Date(endBucket);
    }

    const spanPoints = Math.floor((endBucket.getTime() - startBucket.getTime()) / bucketMs) + 1;
    if (spanPoints > maxPoints) {
      startBucket = new Date(endBucket.getTime() - (maxPoints - 1) * bucketMs);
    }

    const bucketKeys: string[] = [];
    for (
      let cursor = new Date(startBucket);
      cursor.getTime() <= endBucket.getTime();
      cursor = new Date(cursor.getTime() + bucketMs)
    ) {
      bucketKeys.push(cursor.toISOString());
    }

    const bucketVoteCounts = new Map<string, number>();
    for (const key of bucketKeys) {
      bucketVoteCounts.set(key, 0);
    }

    for (const vote of votes) {
      const key = floorToIstInterval(vote.createdAt, timeframe.bucketMinutes).toISOString();
      if (!bucketVoteCounts.has(key)) continue;
      bucketVoteCounts.set(key, (bucketVoteCounts.get(key) ?? 0) + 1);
    }

    let runningTotal = 0;
    const points = bucketKeys.map((key, index) => {
      const bucketDate = new Date(key);
      const votesInBucket = bucketVoteCounts.get(key) ?? 0;
      runningTotal += votesInBucket;
      return {
        bucket_start_utc: key,
        bucket_start_ist: toIstLabel(bucketDate),
        elapsed_label: toElapsedLabel(index, timeframe.bucketMinutes),
        votes_in_bucket: votesInBucket,
        cumulative_votes: runningTotal,
      };
    });

    res.json({
      status: "success",
      message: "Live vote trend fetched",
      data: {
        election_id: electionId,
        timezone: "Asia/Kolkata",
        timeframe: timeframe.key,
        bucket_minutes: timeframe.bucketMinutes,
        refresh_interval: "live",
        generated_at: new Date().toISOString(),
        points,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/:electionId/schedule", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getSingleParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const { start_time_ist, end_time_ist } = req.body;

    if (!start_time_ist || !end_time_ist) {
      res.json({
        status: "error",
        message: "start_time_ist and end_time_ist are required",
        data: null,
      });
      return;
    }

    const startAt = parseIstDateTime(start_time_ist);
    const endAt = parseIstDateTime(end_time_ist);

    if (!startAt || !endAt) {
      res.json({
        status: "error",
        message:
          "Invalid IST date-time format. Use YYYY-MM-DD HH:mm or YYYY-MM-DDTHH:mm",
        data: null,
      });
      return;
    }

    if (endAt <= startAt) {
      res.json({
        status: "error",
        message: "end_time_ist must be after start_time_ist",
        data: null,
      });
      return;
    }

    const existing = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!existing) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    if (existing.status !== "pending") {
      res.json({
        status: "error",
        message: "Only pending elections can be scheduled",
        data: null,
      });
      return;
    }

    await db
      .update(electionsTable)
      .set({ scheduledStartAt: startAt, scheduledEndAt: endAt })
      .where(eq(electionsTable.id, electionId));

    // Run one immediate cycle so near-time schedules are not delayed by polling interval.
    await runElectionAutomationNow();

    res.json({
      status: "success",
      message: "Election schedule saved. It will start and end automatically.",
      data: {
        election_id: electionId,
        scheduled_start_at: startAt,
        scheduled_end_at: endAt,
        scheduled_start_ist: toIstString(startAt),
        scheduled_end_ist: toIstString(endAt),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/:electionId/start", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getSingleParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!election) {
      res.json({ status: "error", message: "Election not found" });
      return;
    }
    const result = await activateElectionById(electionId);
    res.json({ status: result.ok ? "success" : "error", message: result.message });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/:electionId/end", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getSingleParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!election) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }
    const result = await finalizeElectionById(electionId);

    let blockchain: { status: "success" | "error" | "noop"; message: string; data?: unknown } | null = null;
    const autoFinalizeOnEnd = (process.env.BLOCKCHAIN_AUTO_FINALIZE_ON_END || "").toLowerCase();
    const shouldAutoFinalize = autoFinalizeOnEnd === "1" || autoFinalizeOnEnd === "true" || autoFinalizeOnEnd === "yes";

    if (result.ok && isBlockchainEnabled() && shouldAutoFinalize) {
      const finalized = await finalizeElectionProofOnChain(electionId);
      blockchain = {
        status: finalized.status,
        message: finalized.message,
        data: "data" in finalized ? finalized.data : null,
      };
    }

    res.json({
      status: result.ok ? "success" : "error",
      message: result.message,
      data: result.ok ? { ...result.data, blockchain } : null,
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

export default router;
