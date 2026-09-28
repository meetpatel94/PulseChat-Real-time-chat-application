import { NextRequest } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { chatBus } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const MAX_USERNAME = 30;
const MAX_TEXT = 1000;

export async function GET(req: NextRequest) {
  try {
    const raw = Number.parseInt(
      req.nextUrl.searchParams.get("limit") ?? "100",
      10
    );
    const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 1), 100);

    const rows = await db
      .select()
      .from(messages)
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(limit);

    return Response.json(rows);
  } catch (err) {
    console.error("GET /api/messages failed:", err);
    return Response.json(
      { success: false, error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!username) {
      return Response.json(
        { success: false, error: "username is required" },
        { status: 400 }
      );
    }
    if (username.length > MAX_USERNAME) {
      return Response.json(
        { success: false, error: `username must be at most ${MAX_USERNAME} characters` },
        { status: 400 }
      );
    }
    if (!text) {
      return Response.json(
        { success: false, error: "text is required and cannot be empty" },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT) {
      return Response.json(
        { success: false, error: `text must be at most ${MAX_TEXT} characters` },
        { status: 400 }
      );
    }

    const status = chatBus.onlineNames.length > 1 ? "delivered" : "sent";
    const rows = await db
      .insert(messages)
      .values({ username, text, status })
      .returning();
    const row = rows[0];
    if (!row) {
      return Response.json(
        { success: false, error: "Failed to create message" },
        { status: 500 }
      );
    }

    const message = {
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    };

    chatBus.emitToAll({ event: "message", data: message });
    return Response.json({ success: true, message }, { status: 201 });
  } catch (err) {
    console.error("POST /api/messages failed:", err);
    return Response.json(
      { success: false, error: "Failed to create message" },
      { status: 500 }
    );
  }
}
