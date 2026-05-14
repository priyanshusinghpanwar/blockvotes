import { Router, type IRouter } from "express";
import {
  ensureElectionBelongsToAdmin,
  requireAdminAuth,
  requireAdminCompanyId,
} from "../lib/admin-auth";
import {
  anchorPendingVotesForElection,
  finalizeElectionProofOnChain,
  getBlockchainHealth,
  getElectionAnchors,
  verifyElectionAnchors,
} from "../services/blockchain-proof";

const router: IRouter = Router();

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

router.get("/health", async (req, res) => {
  try {
    const health = await getBlockchainHealth();
    res.json({ status: "success", message: "Blockchain health fetched", data: health });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Failed to fetch blockchain health", data: null });
  }
});

router.get("/elections/:electionId/anchors", async (req, res) => {
  try {
    const electionId = getRouteParam(req.params.electionId);
    const data = await getElectionAnchors(electionId);
    res.json({ status: "success", message: "Election anchors fetched", data });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Failed to fetch election anchors", data: null });
  }
});

router.post("/elections/:electionId/anchor", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getRouteParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!election) {
      res.status(404).json({ status: "error", message: "Election not found", data: null });
      return;
    }
    if (election.status === "pending") {
      res.status(400).json({
        status: "error",
        message: "Only active or ended elections can be anchored on chain",
        data: null,
      });
      return;
    }

    const result = await anchorPendingVotesForElection(electionId);
    res.json({
      status: result.status === "error" ? "error" : "success",
      message: result.message,
      data: "data" in result ? result.data : null,
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Failed to anchor votes on chain", data: null });
  }
});

router.post("/elections/:electionId/finalize", requireAdminAuth, async (req, res) => {
  try {
    const electionId = getRouteParam(req.params.electionId);
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(electionId, companyId);
    if (!election) {
      res.status(404).json({ status: "error", message: "Election not found", data: null });
      return;
    }
    if (election.status !== "ended") {
      res.status(400).json({
        status: "error",
        message: "Election must be ended before finalizing its blockchain proof",
        data: null,
      });
      return;
    }

    const result = await finalizeElectionProofOnChain(electionId);
    res.json({
      status: result.status === "error" ? "error" : "success",
      message: result.message,
      data: "data" in result ? result.data : null,
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Failed to finalize election proof on chain", data: null });
  }
});

router.get("/elections/:electionId/verify", async (req, res) => {
  try {
    const electionId = getRouteParam(req.params.electionId);
    const data = await verifyElectionAnchors(electionId);
    res.json({ status: "success", message: "Election proof verification complete", data });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Failed to verify election proof", data: null });
  }
});

export default router;
