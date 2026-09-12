import * as z from "zod/v4";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Схему віддаємо як звичайний JSON Schema, без $schema — його OpenRouter
 * не чекає. Режим strict свідомо не вмикаємо: він вимагає, щоб кожне поле
 * було обов'язковим, а в наших схемах є необов'язкові. Відповідь усе одно
 * перевіряється zod-ом нижче, тож зіпсований JSON далі не пройде.
 */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = json;
  return rest;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/**
 * PDF надсилаємо типом file: OpenRouter сам розбирає його для моделей, які
 * не приймають файли напряму, тож багатосторінковий чек доїжджає цілим.
 * Решта — звичайною картинкою через data-URL.
 */
export function buildMediaPart(data: string, mime: string): ContentPart {
  if (mime === "application/pdf") {
    return {
      type: "file",
      file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${data}` },
    };
  }
  return { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } };
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** Витягує JSON навіть якщо модель обгорнула його у ```json … ```. */
export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body);
}

/** Один виклик OpenRouter зі структурованою відповіддю за тією самою zod-схемою. */
export async function runOpenRouter<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  data: string,
  mime: string,
  maxTokens = 8000,
): Promise<{ parsed: z.infer<S>; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY не налаштовано");
  }

  const model = process.env.OPENROUTER_MODEL?.trim();
  if (!model) {
    throw new Error(
      "OPENROUTER_MODEL не налаштовано — вкажіть модель у вигляді постачальник/модель",
    );
  }

  const content: ContentPart[] = [buildMediaPart(data, mime), { type: "text", text: user }];

  const call = async (withSchema: boolean): Promise<Response> =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Taison",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        ...(withSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: "extraction", strict: false, schema: toJsonSchema(schema) },
              },
            }
          : {}),
      }),
    });

  let response = await call(true);

  /**
   * Не кожна модель на OpenRouter вміє response_format. Якщо саме через нього
   * запит відхилено — повторюємо без нього: підказка все одно просить JSON,
   * а відповідь перевіряє zod. Це дозволяє підставити будь-яку модель, не
   * змінюючи код.
   */
  if (!response.ok) {
    const text = await response.text();
    if (/response_format|json_schema|structured output/i.test(text)) {
      response = await call(false);
    } else {
      throw new Error(`OpenRouter відповів ${response.status}: ${text.slice(0, 300)}`);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter відповів ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as ChatResponse;
  if (body.error?.message) {
    throw new Error(`OpenRouter повернув помилку: ${body.error.message}`);
  }

  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter повернув порожню відповідь");
  }

  let raw: unknown;
  try {
    raw = parseJson(text);
  } catch {
    throw new Error(`Модель повернула не JSON: ${text.slice(0, 200)}`);
  }

  return { parsed: schema.parse(raw) as z.infer<S>, model };
}
