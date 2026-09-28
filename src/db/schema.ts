import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull().default("sent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
