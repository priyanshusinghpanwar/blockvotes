import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { candidatesTable, electionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendCandidateConfirmation } from "../email-service";
import {
  ensureCandidateBelongsToAdmin,
  ensureElectionBelongsToAdmin,
  requireAdminAuth,
  requireAdminCompanyId,
} from "../lib/admin-auth";

const router: IRouter = Router();

function getSingleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

router.get("/", async (req, res) => {
  try {
    const { election_id } = req.query;
    if (!election_id) {
      res.json({ status: "error", message: "election_id is required", data: [] });
      return;
    }

    const elections = await db
      .select({
        id: electionsTable.id,
      })
      .from(electionsTable)
      .where(eq(electionsTable.id, election_id as string))
      .limit(1);

    if (elections.length === 0) {
      res.status(404).json({ status: "error", message: "Election not found", data: [] });
      return;
    }

    const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.electionId, election_id as string));
    const mapped = candidates.map(c => ({
      id: c.id,
      election_id: c.electionId,
      name: c.name,
      description: c.description,
      email: c.email,
      image_url: c.imageUrl,
      is_verified: c.isVerified,
      verified_at: c.verifiedAt,
      votes: c.votes,
    }));
    res.json({ status: "success", message: "Candidates fetched", data: mapped });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: [] });
  }
});

router.post("/", requireAdminAuth, async (req, res) => {
  try {
    const { election_id, name, description, email, image_url } = req.body;
    if (!election_id || !name) {
      res.json({ status: "error", message: "election_id and name are required" });
      return;
    }
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(election_id, companyId);
    if (!election) {
      res.status(404).json({ status: "error", message: "Election not found" });
      return;
    }
    const id = randomUUID();
    await db.insert(candidatesTable).values({
      id,
      electionId: election_id,
      name,
      description: description || "",
      email: email || "",
      imageUrl: image_url || null,
      isVerified: false,
      verifiedAt: null,
      votes: 0,
    });

    let emailResult: { sent: boolean; error?: string } | null = null;

    // Send confirmation email if candidate has an email
    if (email) {
      const elections = await db.select().from(electionsTable).where(eq(electionsTable.id, election_id));
      const electionName = elections[0]?.name || "Election";
      emailResult = await sendCandidateConfirmation({ to: email, candidateName: name, electionName });
    }

    res.json({
      status: "success",
      message: emailResult
        ? emailResult.sent
          ? "Candidate added successfully! Confirmation email sent."
          : `Candidate added successfully, but confirmation email failed (${emailResult.error || "unknown error"}).`
        : "Candidate added successfully!",
      data: emailResult
        ? {
            email_sent: emailResult.sent,
            email_error: emailResult.error,
          }
        : {
            email_sent: false,
            email_error: email ? undefined : "Candidate email was not provided",
          },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/:candidateId/verify", requireAdminAuth, async (req, res) => {
  try {
    const candidateId = getSingleParam(req.params.candidateId);
    const companyId = requireAdminCompanyId(req);

    const ownedCandidate = await ensureCandidateBelongsToAdmin(candidateId, companyId);
    if (!ownedCandidate) {
      res.json({ status: "error", message: "Candidate not found", data: null });
      return;
    }

    const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    const candidate = candidates[0];
    const elections = await db.select().from(electionsTable).where(eq(electionsTable.id, ownedCandidate.electionId));
    if (elections.length === 0) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    if (elections[0]?.status !== "pending") {
      res.json({
        status: "error",
        message: "Candidate verification is allowed only before election starts",
        data: null,
      });
      return;
    }

    await db.update(candidatesTable).set({ isVerified: true, verifiedAt: new Date() }).where(
      and(
        eq(candidatesTable.id, candidate.id),
        eq(candidatesTable.electionId, candidate.electionId),
      ),
    );

    res.json({
      status: "success",
      message: "Candidate verified successfully",
      data: { candidate_id: candidate.id, election_id: candidate.electionId, is_verified: true },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/:candidateId/unverify", requireAdminAuth, async (req, res) => {
  try {
    const candidateId = getSingleParam(req.params.candidateId);
    const companyId = requireAdminCompanyId(req);

    const ownedCandidate = await ensureCandidateBelongsToAdmin(candidateId, companyId);
    if (!ownedCandidate) {
      res.json({ status: "error", message: "Candidate not found", data: null });
      return;
    }

    const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    const candidate = candidates[0];
    const elections = await db.select().from(electionsTable).where(eq(electionsTable.id, ownedCandidate.electionId));
    if (elections.length === 0) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    if (elections[0]?.status !== "pending") {
      res.json({
        status: "error",
        message: "Candidate verification is locked after election starts",
        data: null,
      });
      return;
    }

    await db.update(candidatesTable).set({ isVerified: false, verifiedAt: null }).where(
      and(
        eq(candidatesTable.id, candidate.id),
        eq(candidatesTable.electionId, candidate.electionId),
      ),
    );

    res.json({
      status: "success",
      message: "Candidate marked as unverified",
      data: { candidate_id: candidate.id, election_id: candidate.electionId, is_verified: false },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.delete("/:candidateId", requireAdminAuth, async (req, res) => {
  try {
    const candidateId = getSingleParam(req.params.candidateId);
    const companyId = requireAdminCompanyId(req);
    const candidate = await ensureCandidateBelongsToAdmin(candidateId, companyId);
    if (!candidate) {
      res.status(404).json({ status: "error", message: "Candidate not found" });
      return;
    }
    await db.delete(candidatesTable).where(eq(candidatesTable.id, candidateId));
    res.json({ status: "success", message: "Candidate deleted successfully!" });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

export default router;
