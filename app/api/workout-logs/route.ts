import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

const BUCKET = "workout-log-attachments";
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: logs, error } = await supabase
    .from("workout_logs")
    .select("id, workout_id, logged_date, duration_minutes, notes, created_at")
    .order("logged_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from("workout_log_attachments")
    .select("id, workout_log_id, filename, content_type, storage_path");

  if (attachmentsError) {
    return NextResponse.json({ error: attachmentsError.message }, { status: 500 });
  }

  const withAttachments = await Promise.all(
    logs.map(async (log) => {
      const logAttachments = attachments.filter((a) => a.workout_log_id === log.id);
      const resolved = await Promise.all(
        logAttachments.map(async (a) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
          return {
            id: a.id,
            filename: a.filename,
            content_type: a.content_type,
            url: signed?.signedUrl ?? null,
          };
        }),
      );
      return { ...log, attachments: resolved };
    }),
  );

  return NextResponse.json(withAttachments);
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const workoutId = typeof body.workout_id === "string" ? body.workout_id : "";
  const date = typeof body.date === "string" ? body.date : "";

  if (!workoutId || !date) {
    return NextResponse.json(
      { error: "workout_id and date are required" },
      { status: 400 },
    );
  }

  const durationMinutes =
    typeof body.duration_minutes === "number" ? body.duration_minutes : null;
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
    return NextResponse.json(
      { error: "duration_minutes must be a non-negative integer" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("workout_logs")
    .insert({
      user_id: user.id,
      workout_id: workoutId,
      logged_date: date,
      duration_minutes: durationMinutes,
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .select("id, workout_id, logged_date, duration_minutes, notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...data, attachments: [] }, { status: 201 });
}
