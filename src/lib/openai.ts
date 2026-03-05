import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_URL } from "../config";
import type { AiDeepDive, ChatMessage, DealContext } from "../types";
import { httpFetch } from "./http.js";

async function callOpenAi(apiKey: string, body: any) {
  const res = await httpFetch(
    OPENAI_RESPONSES_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "OpenAI responses",
  );
  return res.json();
}

function outputText(resp: any) {
  if (resp.output_text) return String(resp.output_text);
  const chunks: string[] = [];
  for (const item of resp.output || []) {
    for (const c of item.content || []) if (c.type === "output_text") chunks.push(c.text);
  }
  return chunks.join("\n");
}

export async function runDeepDive(args: {
  apiKey: string;
  model?: string;
  context: DealContext;
}): Promise<AiDeepDive> {
  const resp = await callOpenAi(args.apiKey, {
    model: args.model || DEFAULT_OPENAI_MODEL,
    max_output_tokens: 1300,
    input: `Analyze this deal context JSON and return JSON with keys: highlights(string[]), risks(string[]), rentJustification(string cites rent comps by address and URL when present), memo(string), nextSteps(string[]).\n\n${JSON.stringify(args.context, null, 2)}`,
    text: {
      format: {
        type: "json_schema",
        name: "deal_memo",
        strict: true,
        schema: {
          type: "object",
          properties: {
            highlights: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
            rentJustification: { type: "string" },
            memo: { type: "string" },
            nextSteps: { type: "array", items: { type: "string" } },
          },
          required: ["highlights", "risks", "rentJustification", "memo", "nextSteps"],
          additionalProperties: false,
        },
      },
    },
  });
  return JSON.parse(outputText(resp)) as AiDeepDive;
}

export async function runDealChat(args: {
  apiKey: string;
  model?: string;
  context: DealContext;
  messages: ChatMessage[];
  question: string;
}) {
  const convo = args.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n");
  const prompt =
    "You are an underwriting assistant. Use ONLY provided context JSON and do not browse. If data missing, state it clearly." +
    `\n\nCONTEXT JSON:\n${JSON.stringify(args.context, null, 2)}\n\nCHAT HISTORY:\n${convo}\nUSER: ${args.question}`;
  const resp = await callOpenAi(args.apiKey, {
    model: args.model || DEFAULT_OPENAI_MODEL,
    max_output_tokens: 500,
    input: prompt,
  });
  return outputText(resp).trim();
}
