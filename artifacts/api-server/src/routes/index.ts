import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companyRouter from "./company";
import electionsRouter from "./elections";
import candidatesRouter from "./candidates";
import votersRouter from "./voters";
import voteRouter from "./vote";
import blockchainRouter from "./blockchain";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/company", companyRouter);
router.use("/elections", electionsRouter);
router.use("/candidates", candidatesRouter);
router.use("/voters", votersRouter);
router.use("/voter", votersRouter);
router.use("/vote", voteRouter);
router.use("/blockchain", blockchainRouter);

export default router;
