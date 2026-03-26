import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function langInstruction(lang: string): string {
  if (lang === "en") return "";
  return `\nIMPORTANT: Write ALL content in ${lang}. Do not use English.`;
}

async function generate(
  systemPrompt: string,
  userPrompt: string | Array<OpenAI.Chat.ChatCompletionContentPart>,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  return response.choices[0].message.content || "{}";
}

export async function generateDescription(
  title: string,
  productType: string,
  existingDescription: string,
  lang = "en",
): Promise<string> {
  const raw = await generate(
    `You are a professional e-commerce copywriter. Write compelling, accurate product descriptions. Do not invent features. Return JSON: {"description": "..."}${langInstruction(lang)}`,
    `Write a 100-300 word product description for:\nTitle: ${title}\nType: ${productType}\n${existingDescription ? `Current (improve this): ${existingDescription}` : "No existing description."}`,
  );
  return JSON.parse(raw).description;
}

export async function generateSeo(
  title: string,
  description: string,
  productType: string,
  lang = "en",
): Promise<{ seoTitle: string; seoDescription: string }> {
  const raw = await generate(
    `You are an SEO specialist. Generate meta titles and descriptions that maximize click-through rates. Return JSON: {"seoTitle": "...", "seoDescription": "..."}${langInstruction(lang)}`,
    `Generate SEO metadata for:\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 500)}\n\nRules: seoTitle 50-60 chars, seoDescription 140-160 chars.`,
  );
  return JSON.parse(raw);
}

export async function generateAltText(
  imageUrl: string,
  productTitle: string,
  lang = "en",
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Write concise alt text for product images. Focus on what the image shows. Do not start with 'Image of' or 'Photo of'. Return JSON: {"altText": "..."}${langInstruction(lang)}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Alt text for this product image. Product: ${productTitle}` },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content || "{}").altText;
}

export async function suggestCategoryName(
  title: string,
  description: string,
  productType: string,
): Promise<string> {
  const raw = await generate(
    `You are a product categorization expert. Suggest the most specific product category for the given product. Return a short category path like "Apparel > Men's Clothing > Jeans" or "Health & Beauty > Fragrances > Men's Cologne". Be specific. Return JSON: {"category": "..."}`,
    `Categorize this product:\nTitle: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 300)}`,
  );
  return JSON.parse(raw).category;
}

export async function generateTags(
  title: string,
  description: string,
  productType: string,
  lang = "en",
): Promise<string[]> {
  const raw = await generate(
    `Generate 5-10 relevant product tags for discoverability. Use lowercase. Include material, style, occasion, category. Return JSON: {"tags": ["...", ...]}${langInstruction(lang)}`,
    `Generate tags for:\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 500)}`,
  );
  return JSON.parse(raw).tags;
}
