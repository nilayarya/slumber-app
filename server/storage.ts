import { db } from "./db";
import { users, sleepSessions, type SleepSession, type User, type InsertSleepSession } from "../shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function findOrCreateUser(googleId: string, email: string, name: string, avatarUrl?: string): Promise<User> {
  const existing = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }
  const created = await db.insert(users).values({ googleId, email, name, avatarUrl }).returning();
  return created[0];
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getSleepSessions(userId: string, limit = 60): Promise<SleepSession[]> {
  return db.select().from(sleepSessions)
    .where(eq(sleepSessions.userId, userId))
    .orderBy(desc(sleepSessions.date))
    .limit(limit);
}

export async function getSleepSessionsByRange(userId: string, fromDate: string, toDate: string): Promise<SleepSession[]> {
  return db.select().from(sleepSessions)
    .where(and(
      eq(sleepSessions.userId, userId),
      gte(sleepSessions.date, fromDate),
      lte(sleepSessions.date, toDate),
    ))
    .orderBy(desc(sleepSessions.date));
}

export async function createSleepSession(data: InsertSleepSession): Promise<SleepSession> {
  const result = await db.insert(sleepSessions).values(data).returning();
  return result[0];
}

export async function updateSleepSession(id: string, userId: string, data: Partial<InsertSleepSession>): Promise<SleepSession | null> {
  const result = await db.update(sleepSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, userId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteSleepSession(id: string, userId: string): Promise<boolean> {
  const result = await db.delete(sleepSessions)
    .where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, userId)))
    .returning();
  return result.length > 0;
}
