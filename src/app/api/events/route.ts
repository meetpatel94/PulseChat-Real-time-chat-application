import { NextRequest } from "next/server";
import { chatBus } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const isTyping = Boolean(body?.isTyping);

  if (!username || username.length > 30) {
    return Response.json(
      { success: false, error: "Invalid username" },
      { status: 400 }
    );
  }

  chatBus.emitToAll({ event: "typing", data: { username, isTyping } });
  return Response.json({ success: true });
}
