import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constantTimeEqual } from "@/lib/mcp/oauth";
import { topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";

// Plain token-secured endpoint for a scheduled routine to call directly
// (via curl/Bash), same pattern as /api/digest — tops up every active
// recurring task template's generated-but-not-yet-due occurrences back up
// to its horizon. Safe to call as often as you like: a template with no
// deficit generates nothing, so this is idempotent.
export async function POST(request: Request) {
  const expected = process.env.RECURRING_TASKS_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Recurring tasks endpoint isn't configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: templates, error } = await admin
    .from("recurring_task_templates")
    .select("*")
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (templates as StoredTemplate[]).map(async (template) => {
      const { generated, error: topUpError } = await topUpTemplate(admin, template);
      return { template_id: template.id, title: template.title, generated, error: topUpError };
    }),
  );

  return NextResponse.json({
    checked: results.length,
    generated_total: results.reduce((sum, r) => sum + r.generated, 0),
    results,
  });
}
