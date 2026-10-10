import { Router, type IRouter } from "express";
import { GetAdminHealthResponse, RunAdminHealthCheckParams, RunAdminHealthCheckResponse } from "@workspace/api-zod";
import { createHealthDiagnostics } from "../lib/health-diagnostics";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const diagnostics = createHealthDiagnostics({
  logCompletion: event => logger.info({ nebius_completion: event }, "Nebius health completion"),
});

router.use("/admin/health", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV !== "development") {
    res.status(403).json({
      error: "diagnostics_disabled",
      message: "Diagnostics are development-only until admin authorization is implemented.",
    });
    return;
  }
  // Only accept same-origin browser mutation requests; server CLI calls have no Origin.
  const origin = req.get("Origin");
  if (req.method === "POST" && origin) {
    try {
      const host = req.get("X-Forwarded-Host") ?? req.get("Host");
      if (new URL(origin).host !== host) throw new Error("Cross-origin request");
    } catch {
      res.status(403).json({ error: "forbidden", message: "Cross-origin diagnostic requests are not permitted." });
      return;
    }
  }
  next();
});

router.get("/admin/health", (_req, res) => {
  res.json(GetAdminHealthResponse.parse({ development_only: true, checks: diagnostics.manifest() }));
});

router.post("/admin/health/:checkId", async (req, res): Promise<void> => {
  const params = RunAdminHealthCheckParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_check", message: "Unknown connection test." });
    return;
  }
  res.json(RunAdminHealthCheckResponse.parse(await diagnostics.run(params.data.checkId)));
});

router.get("/admin/health/tts-audio", (_req, res) => {
  const audio = diagnostics.getAudio();
  if (!audio) {
    res.status(404).json({ error: "audio_unavailable", message: "Run the speech test first. Diagnostic audio expires after five minutes." });
    return;
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(audio);
});

export default router;
