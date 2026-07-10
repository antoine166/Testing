import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

const BUCKET = "task-attachments";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("task_attachments")
    .select("*")
    .eq("task_id", id)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withUrls = await Promise.all(
    data.map(async (attachment) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...attachment, url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json(withUrls);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only images are supported" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
  }

  const storagePath = `${user.id}/${id}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      user_id: user.id,
      task_id: id,
      storage_path: storagePath,
      filename: file.name,
      content_type: file.type,
      size: file.size,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ ...data, url: signed?.signedUrl ?? null }, { status: 201 });
}
