import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_URL } from "../config";
import type {
  AiDeepDive,
  PropertyFacts,
  RentComp,
  RentcastMemoContext,
  SaleComp,
} from "../types";

async function openaiPost(apiKey: string, body: any) {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    lastError = `OpenAI error ${res.status}: ${text || res.statusText}`;
    if (res.status < 500 || attempt === 3) throw new Error(lastError);
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  throw new Error(`OpenAI request failed: ${lastError}`);
}

function extractOutputText(resp: any): string {
  if (typeof resp?.output_text === "string") return resp.output_text;
  const out = resp?.output ?? [];
  const chunks: string[] = [];
  for (const item of out) {
    const content = item?.content ?? [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

export async function extractPropertyFromText(args: {
  apiKey: string;
  model?: string;
  address: string;
  listingText: string;
}): Promise<PropertyFacts> {
  const { apiKey, address, listingText } = args;

  const schema = {
    name: "property_extract",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        normalizedAddress: { type: "string" },
        price: { type: ["number", "null"] },
        bedrooms: { type: ["number", "null"] },
        bathrooms: { type: ["number", "null"] },
        squareFootage: { type: ["number", "null"] },
        lotSize: { type: ["number", "null"] },
        yearBuilt: { type: ["number", "null"] },
        propertyType: { type: ["string", "null"] },
        features: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        photoUrl: { type: ["string", "null"] },
        sourceNotes: { type: "array", items: { type: "string" } },
      },
      required: [
        "normalizedAddress",
        "price",
        "bedrooms",
        "bathrooms",
        "squareFootage",
        "lotSize",
        "yearBuilt",
        "propertyType",
        "features",
        "description",
        "photoUrl",
        "sourceNotes",
      ],
    },
  };

  const resp = await openaiPost(apiKey, {
    model: args.model || DEFAULT_OPENAI_MODEL,
    max_output_tokens: 900,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Extract structured property facts from the listing text.\n` +
              `If a field is not present, return null.\n` +
              `Address user entered: ${address}\n\n` +
              `Listing text:\n${listingText}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  });

  const text = extractOutputText(resp);
  const parsed = JSON.parse(text);

  return {
    address,
    normalizedAddress: parsed.normalizedAddress || address,
    price: parsed.price ?? undefined,
    bedrooms: parsed.bedrooms ?? undefined,
    bathrooms: parsed.bathrooms ?? undefined,
    squareFootage: parsed.squareFootage ?? undefined,
    lotSize: parsed.lotSize ?? undefined,
    yearBuilt: parsed.yearBuilt ?? undefined,
    propertyType: parsed.propertyType ?? undefined,
    features: parsed.features || [],
    description: parsed.description || "",
    photoUrl: parsed.photoUrl ?? undefined,
    sourceNotes: parsed.sourceNotes || ["Extracted from listing text via OpenAI."],
  };
}

export async function runDeepDive(args: {
  apiKey: string;
  model?: string;
  facts: PropertyFacts;
  rentComps: RentComp[];
  rentEstimate?: number;
  salesComps: SaleComp[];
  memoContext?: RentcastMemoContext;
  underwritingSummary: string;
}): Promise<AiDeepDive> {
  const schema = {
    name: "ai_deep_dive",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        highlights: { type: "array", items: { type: "string" } },
        redFlags: { type: "array", items: { type: "string" } },
        rentRationale: { type: "string" },
        memo: { type: "string" },
        overallScore: { type: "number" },
        confidenceScore: { type: "number" },
        buyBoxFit: { type: "string", enum: ["strong", "moderate", "weak"] },
        recommendation: { type: "string", enum: ["buy", "watch", "pass"] },
        keyDrivers: { type: "array", items: { type: "string" } },
        dueDiligence: { type: "array", items: { type: "string" } },
        dealKillers: { type: "array", items: { type: "string" } },
      },
      required: [
        "highlights",
        "redFlags",
        "rentRationale",
        "memo",
        "overallScore",
        "confidenceScore",
        "buyBoxFit",
        "recommendation",
        "keyDrivers",
        "dueDiligence",
        "dealKillers",
      ],
    },
  };

  const compLines = args.rentComps
    .map(
      (c, i) =>
        `Comp ${i + 1}: ${c.address || ""} | rent=${c.rent ?? "?"} | beds=${
          c.bedrooms ?? "?"
        } baths=${c.bathrooms ?? "?"} sqft=${c.squareFootage ?? "?"} | quality=${
          c.score != null ? (c.score * 100).toFixed(0) + "/100" : "n/a"
        } | link=${c.url || "n/a"}`
    )
    .join("\n");

  const salesCompLines = args.salesComps
    .map(
      (c, i) =>
        `Sale comp ${i + 1}: ${c.address || ""} | price=${c.price ?? "?"} | beds=${
          c.bedrooms ?? "?"
        } baths=${c.bathrooms ?? "?"} sqft=${c.squareFootage ?? "?"} | link=${c.url || "n/a"}`
    )
    .join("\n");

  const resp = await openaiPost(args.apiKey, {
    model: args.model || DEFAULT_OPENAI_MODEL,
    max_output_tokens: 1400,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `You are underwriting a real estate investment.\n\n` +
              `Property facts (JSON):\n${JSON.stringify(args.facts, null, 2)}\n\n` +
              `Rent estimate (if available): ${args.rentEstimate ?? "n/a"}\n` +
              `Rental comps (must cite at least 2 comps by address and link in the rent rationale):\n${compLines}\n\n` +
              `Sales comps (for valuation support):\n${salesCompLines || "n/a"}\n\n` +
              `RentCast memo context (JSON, optional):\n${JSON.stringify(args.memoContext || {}, null, 2)}\n\n` +
              `Underwriting summary:\n${args.underwritingSummary}\n\n` +
              `Return:\n` +
              `- highlights: bullet strings\n` +
              `- redFlags: bullet strings\n` +
              `- rentRationale: short paragraph referencing comps shown\n` +
              `- overallScore: number from 0 to 100\n` +
              `- confidenceScore: number from 0 to 100\n` +
              `- buyBoxFit: one of strong/moderate/weak\n` +
              `- recommendation: one of buy/watch/pass\n` +
              `- keyDrivers: list of key metrics driving recommendation\n` +
              `- dueDiligence: list of required follow-up checks before offer\n` +
              `- dealKillers: list of findings that should force a pass\n` +
              `- memo: ~1 page memo with sections: Overview, Assumptions, Scenario Results, Comps Summary, Risks, Next Steps. Include explicit RentCast rent range and value range commentary whenever present in context.`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  });

  const text = extractOutputText(resp);
  return JSON.parse(text) as AiDeepDive;
}
