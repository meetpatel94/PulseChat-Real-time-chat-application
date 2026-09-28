import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json(
      { success: false, error: "Invalid message id" },
      { status: 400 }
    );
  }

  try {
    const deleted = await db
      .delete(messages)
      .where(eq(messages.id, id))
      .returning();

    if (deleted.length === 0) {
      return Response.json(
        { success: false, error: "Message not found" },
        { status: 404 }
      );
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/messages/:id failed:", err);
    return Response.json(
      { success: false, error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
