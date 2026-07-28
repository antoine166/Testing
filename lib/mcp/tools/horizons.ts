import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerHorizonTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Horizons (GTD levels 3-5: Goals, Vision, Purpose) ---

  server.registerTool(
    "get_horizons",
    {
      title: "Get horizons",
      description:
        "Antoine's GTD higher horizons — goals & objectives (1-2 yr), vision (3-5 yr), and purpose & " +
        "principles. Useful context for coaching and weekly/quarterly reviews. Returns empty strings if unset.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("horizons")
        .select("goals, vision, purpose, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data ?? { goals: "", vision: "", purpose: "" });
    },
  );

  server.registerTool(
    "update_horizons",
    {
      title: "Update horizons",
      description:
        "Update Antoine's goals, vision, and/or purpose. Only the fields you pass are changed — omitted " +
        "fields keep their current value, so updating just the vision won't wipe the goals.",
      inputSchema: {
        goals: z.string().optional().describe("Goals & objectives, roughly a 1-2 year horizon."),
        vision: z.string().optional().describe("Vision, roughly a 3-5 year horizon."),
        purpose: z.string().optional().describe("Purpose & principles — the highest, why-it-all-matters level."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ goals, vision, purpose }) => {
      if (goals === undefined && vision === undefined && purpose === undefined) {
        return fail("Pass at least one of goals, vision, or purpose to update.");
      }

      // Merge onto the existing row so a partial update doesn't blank the
      // other fields (the horizons table is a single row per user).
      const { data: existing, error: readError } = await admin
        .from("horizons")
        .select("goals, vision, purpose")
        .eq("user_id", userId)
        .maybeSingle();
      if (readError) return fail(readError.message);

      const { data, error } = await admin
        .from("horizons")
        .upsert({
          user_id: userId,
          goals: goals ?? existing?.goals ?? "",
          vision: vision ?? existing?.vision ?? "",
          purpose: purpose ?? existing?.purpose ?? "",
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );
}
