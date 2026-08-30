import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";
import { ReceiptExtractionSchema, normalizeExtraction, type Extraction } from "./schema";

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

export async function extractWithClaude(data: string, mime: string): Promise<Extraction> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштовано");
  }

  const model = process.env.CLAUDE_MODEL?.trim() || "claude-opus-5";
  const client = new Anthropic();

  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [buildMediaBlock(data, mime), { type: "text", text: USER_PROMPT }],
      },
    ],
    output_config: { format: zodOutputFormat(ReceiptExtractionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude повернув відповідь, яку не вдалося розібрати за схемою");
  }

  return normalizeExtraction(response.parsed_output, "claude", model, response.parsed_output);
}
