import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { OAuth2Client } from "google-auth-library";
import { pool } from "./db";
import {
  findOrCreateUser,
  getUserById,
  getSleepSessions,
  getSleepSessionsByRange,
  createSleepSession,
  updateSleepSession,
  deleteSleepSession,
} from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const PgSession = connectPgSimple(session);

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");
  return new OAuth2Client(clientId);
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function computeSleepMetrics(
  sleepModeStart: Date,
  wakeTime: Date | null,
  screenEvents: Array<{ time: string; durationSeconds: number }>
) {
  const sorted = [...screenEvents].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  let sleepOnset = sleepModeStart;
  for (const evt of sorted) {
    const t = new Date(evt.time);
    if (t <= sleepModeStart) continue;
    if (evt.durationSeconds < 120) {
      sleepOnset = t;
    } else {
      break;
    }
  }

  let detectedWake: Date | null = null;
  if (!wakeTime) {
    for (const evt of sorted) {
      const t = new Date(evt.time);
      if (t <= sleepOnset) continue;
      const hoursSinceSleep = (t.getTime() - sleepOnset.getTime()) / 3600000;
      if (hoursSinceSleep >= 2 && evt.durationSeconds >= 120) {
        detectedWake = t;
        break;
      }
    }
  }

  const finalWake = wakeTime || detectedWake;
  const durationMinutes = finalWake
    ? Math.round((finalWake.getTime() - sleepOnset.getTime()) / 60000)
    : null;

  const qualityScore = durationMinutes
    ? Math.min(100, Math.max(0, Math.round(
        (Math.min(durationMinutes, 540) / 540) * 70 +
        (sorted.filter(e => e.durationSeconds < 120).length <= 2 ? 30 : 10)
      )))
    : null;

  return { sleepOnset, wakeTime: finalWake, durationMinutes, qualityScore };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "fallback-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 },
    })
  );

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.json(null);
    const user = await getUserById(req.session.userId);
    res.json(user);
  });

  app.post("/api/auth/google", async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "idToken required" });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ message: "Google auth not configured. Set GOOGLE_CLIENT_ID." });

    try {
      const client = getGoogleClient();
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload) return res.status(401).json({ message: "Invalid token" });

      const user = await findOrCreateUser(
        payload.sub,
        payload.email ?? "",
        payload.name ?? payload.email ?? "User",
        payload.picture
      );

      req.session.userId = user.id;
      res.json(user);
    } catch (err: any) {
      console.error("Google auth error:", err);
      res.status(401).json({ message: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/sleep/sessions", requireAuth, async (req, res) => {
    const { from, to } = req.query;
    if (from && to) {
      const sessions = await getSleepSessionsByRange(req.session.userId!, from as string, to as string);
      return res.json(sessions);
    }
    const sessions = await getSleepSessions(req.session.userId!);
    res.json(sessions);
  });

  app.post("/api/sleep/sessions", requireAuth, async (req, res) => {
    try {
      const { date, sleepModeStart, wakeTime, screenEvents = [], notes } = req.body;
      if (!date || !sleepModeStart) {
        return res.status(400).json({ message: "date and sleepModeStart required" });
      }

      const sleepModeStartDate = new Date(sleepModeStart);
      const wakeTimeDate = wakeTime ? new Date(wakeTime) : null;
      const metrics = computeSleepMetrics(sleepModeStartDate, wakeTimeDate, screenEvents);

      const session = await createSleepSession({
        userId: req.session.userId!,
        date,
        sleepModeStart: sleepModeStartDate,
        sleepOnset: metrics.sleepOnset,
        wakeTime: metrics.wakeTime,
        durationMinutes: metrics.durationMinutes,
        screenEvents,
        qualityScore: metrics.qualityScore,
        notes,
      });

      res.json(session);
    } catch (err: any) {
      console.error("Create session error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/sleep/sessions/:id", requireAuth, async (req, res) => {
    const { sleepModeStart, wakeTime, screenEvents, notes } = req.body;

    const sleepModeStartDate = sleepModeStart ? new Date(sleepModeStart) : undefined;
    const wakeTimeDate = wakeTime ? new Date(wakeTime) : null;

    let metrics: any = {};
    if (sleepModeStartDate) {
      metrics = computeSleepMetrics(sleepModeStartDate, wakeTimeDate, screenEvents ?? []);
    }

    const updated = await updateSleepSession(req.params.id, req.session.userId!, {
      ...(sleepModeStartDate && { sleepModeStart: sleepModeStartDate }),
      ...(metrics.sleepOnset && { sleepOnset: metrics.sleepOnset }),
      ...(metrics.wakeTime !== undefined && { wakeTime: metrics.wakeTime }),
      ...(metrics.durationMinutes !== undefined && { durationMinutes: metrics.durationMinutes }),
      ...(metrics.qualityScore !== undefined && { qualityScore: metrics.qualityScore }),
      ...(screenEvents !== undefined && { screenEvents }),
      ...(notes !== undefined && { notes }),
    });

    if (!updated) return res.status(404).json({ message: "Session not found" });
    res.json(updated);
  });

  app.delete("/api/sleep/sessions/:id", requireAuth, async (req, res) => {
    const deleted = await deleteSleepSession(req.params.id, req.session.userId!);
    if (!deleted) return res.status(404).json({ message: "Session not found" });
    res.json({ success: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}
