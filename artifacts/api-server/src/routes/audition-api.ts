import { Router, type IRouter, type RequestHandler } from "express";

const router: IRouter = Router();
// Contract scaffolding only: no auth, validation, writes, uploads or AI behavior.
const notImplemented: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    message: "This endpoint is a contract stub. No feature behavior is implemented.",
  });
};

router.get("/auditions", notImplemented);
router.post("/auditions", notImplemented);
router.get("/auditions/:auditionId", notImplemented);
router.get("/auditions/:auditionId/candidates", notImplemented);
router.post("/auditions/:auditionId/candidates", notImplemented);
router.get("/candidates/:candidateId", notImplemented);
router.post("/invites/resolve", notImplemented);
router.post("/sessions", notImplemented);
router.get("/sessions/:sessionId", notImplemented);
router.get("/sessions/:sessionId/transcript", notImplemented);
router.post("/sessions/:sessionId/transcript", notImplemented);
router.get("/sessions/:sessionId/editor-snapshots", notImplemented);
router.post("/sessions/:sessionId/editor-snapshots", notImplemented);
router.get("/sessions/:sessionId/screenshots", notImplemented);
router.post("/sessions/:sessionId/screenshots", notImplemented);
router.get("/sessions/:sessionId/integrity-events", notImplemented);
router.post("/sessions/:sessionId/integrity-events", notImplemented);
router.post("/sessions/:sessionId/submit", notImplemented);
router.get("/sessions/:sessionId/evaluation", notImplemented);
router.post("/sessions/:sessionId/evaluation", notImplemented);
router.get("/sessions/:sessionId/credential", notImplemented);
router.post("/sessions/:sessionId/credential", notImplemented);
router.post("/credentials/verify", notImplemented);

export default router;
