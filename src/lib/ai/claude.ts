import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

function buildMediaBlock(data: string, mime: string): Anthropic.ContentBlockParam {
  if (mime === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: IMAGE_TYPES[mime] ?? "image/jpeg", data },
  };
}

/** Один виклик Claude зі структурованою відповіддю за zod-схемою. */
export async function runClaude<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  data: string,
  mime: string,
  maxTokens = 8000,
): Promise<{ parsed: z.infer<S>; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштовано");
  }

  const model = process.env.CLAUDE_MODEL?.trim() || "claude-opus-5";
  const client = new Anthropic();

  const response = await client.messages.parse({
    model,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: "user",
        content: [buildMediaBlock(data, mime), { type: "text", text: user }],
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude повернув відповідь, яку не вдалося розібрати за схемою");
  }

  return { parsed: response.parsed_output as z.infer<S>, model };
}
