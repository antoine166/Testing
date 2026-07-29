import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient, todayHome } from "@/lib/mcp/shared";

export function registerCheckinTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Daily check-in ---

  server.registerTool(
    "get_checkin",
    {
      title: "Get daily check-in",
      description: "Get Antoine's energy/focus check-in for a given day.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const { data, error } = await admin
        .from("daily_checkins")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date ?? todayHome())
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "save_checkin",
    {
      title: "Save daily check-in",
      description: "Record Antoine's energy and focus level (1-5 each) for a day. One entry per day; re-saving overwrites it.",
      inputSchema: {
        energy_level: z.number().int().min(1).max(5),
        focus_level: z.number().int().min(1).max(5),
        notes: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ energy_level, focus_level, notes, date }) => {
      const { data, error } = await admin
        .from("daily_checkins")
        .upsert(
          { user_id: userId, date: date ?? todayHome(), energy_level, focus_level, notes },
          { onConflict: "user_id,date" },
        )
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );
}
