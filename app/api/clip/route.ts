import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constantTimeEqual } from "@/lib/mcp/oauth";

const ATTACHMENTS_BUCKET = "task-attachments";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/\w+);base64,(.+)$/;

// Plain token-secured endpoint for the Chrome extension (chrome-extension/)
// to call directly — an extension page has no way to share the app's
// session cookie, so it authenticates with a personal access token
// instead, same pattern as /api/digest. Creates a task rather than a
// knowledge item, landing in the Inbox (no domain_id/project_id set) like
// any other unfiled capture, since that's where a clip should start —
// filing it into the Knowledge Library, a project, etc. happens from there.
export async function POST(request: Request) {
  const expected = process.env.EXTENSION_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Clipper isn't configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  const owner = users?.users[0];
  if (usersError || !owner) {
    return NextResponse.json({ error: "No account to clip to" }, { status: 500 });
  }

  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      user_id: owner.id,
      title,
      notes: typeof body.content === "string" ? body.content : undefined,
      link: typeof body.url === "string" ? body.url : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let attachmentError: string | undefined;
  const screenshot = typeof body.screenshot === "string" ? body.screenshot.match(DATA_URL_PATTERN) : null;

  if (screenshot) {
    const [, contentType, base64] = screenshot;
    const buffer = Buffer.from(base64, "base64");

    if (buffer.byteLength > MAX_SCREENSHOT_BYTES) {
      attachmentError = "Screenshot must be under 10MB";
    } else {
      const storagePath = `${owner.id}/${task.id}/${crypto.randomUUID()}-screenshot.png`;
      const { error: uploadError } = await admin.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(storagePath, buffer, { contentType });

      if (uploadError) {
        attachmentError = uploadError.message;
      } else {
        const { error: insertError } = await admin.from("task_attachments").insert({
          user_id: owner.id,
          task_id: task.id,
          storage_path: storagePath,
          filename: "screenshot.png",
          content_type: contentType,
          size: buffer.byteLength,
        });

        if (insertError) {
          await admin.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
          attachmentError = insertError.message;
        }
      }
    }
  }

  return NextResponse.json({ ...task, attachment_error: attachmentError }, { status: 201 });
}
