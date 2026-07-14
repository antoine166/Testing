import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { requireUser } from "@/lib/supabase/require-user";
import { MODEL, TOOLS, buildContext, systemPrompt, extractText, executeTool } from "@/lib/coach/shared";

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Coach isn't configured yet — ANTHROPIC_API_KEY is missing." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const messages: MessageParam[] = Array.isArray(body.messages) ? body.messages : [];
  const resolutions: { tool_use_id: string; approved: boolean }[] = Array.isArray(body.resolutions)
    ? body.resolutions
    : [];
  const today = typeof body.today === "string" ? body.today : new Date().toISOString().slice(0, 10);
  const mode = typeof body.mode === "string" ? body.mode : "chat";

  if (messages.length === 0 || resolutions.length === 0) {
    return NextResponse.json({ error: "messages and resolutions are required" }, { status: 400 });
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const toolUseBlocks = Array.isArray(lastAssistant?.content)
    ? lastAssistant.content.filter((b) => b.type === "tool_use")
    : [];

  const toolResults: ToolResultBlockParam[] = [];
  for (const block of toolUseBlocks) {
    if (block.type !== "tool_use") continue;
    const resolution = resolutions.find((r) => r.tool_use_id === block.id);
    if (!resolution) continue;

    if (!resolution.approved) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "The user declined this action.",
      });
      continue;
    }

    const result = await executeTool(
      supabase,
      user.id,
      today,
      block.name,
      block.input as Record<string, unknown>,
    );
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
  }

  messages.push({ role: "user", content: toolResults });

  const context = await buildContext(supabase, today, mode);
  const system = systemPrompt(mode, context);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
    tools: TOOLS,
  });

  if (response.stop_reason !== "tool_use") {
    return NextResponse.json({
      type: "text",
      reply: extractText(response.content),
      assistantContent: response.content,
      toolResults,
    });
  }

  const actions = response.content
    .filter((block) => block.type === "tool_use")
    .map((block) => ({ id: block.id, name: block.name, input: block.input }));

  return NextResponse.json({
    type: "tool_use",
    assistantContent: response.content,
    actions,
    toolResults,
  });
}
