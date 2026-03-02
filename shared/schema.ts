import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sleepSessions = pgTable("sleep_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  sleepModeStart: timestamp("sleep_mode_start").notNull(),
  sleepOnset: timestamp("sleep_onset"),
  wakeTime: timestamp("wake_time"),
  durationMinutes: integer("duration_minutes"),
  screenEvents: jsonb("screen_events").default([]),
  qualityScore: integer("quality_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("idx_sleep_sessions_user_date").on(table.userId, table.date),
}));

export const screenEventSchema = z.object({
  time: z.string(),
  durationSeconds: z.number(),
  label: z.string().optional(),
});

export const insertSleepSessionSchema = createInsertSchema(sleepSessions, {
  screenEvents: z.array(screenEventSchema).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ScreenEvent = z.infer<typeof screenEventSchema>;
export type InsertSleepSession = z.infer<typeof insertSleepSessionSchema>;
export type SleepSession = typeof sleepSessions.$inferSelect;
export type User = typeof users.$inferSelect;
