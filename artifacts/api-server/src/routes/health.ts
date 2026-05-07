import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { sendVoterCredentials } from "../email-service";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/test-email", async (req, res) => {
  const to = (req.query.to as string) || process.env.SMTP_USER || "";
  const result = await sendVoterCredentials({
    to,
    voterName: "Test Voter",
    electionName: "Test Election",
    electionId: "test-election-id-123",
    password: "AB12CD34",
  });
  res.json({ result, smtp_user: process.env.SMTP_USER, smtp_pass_length: process.env.SMTP_PASS?.length });
});

export default router;
