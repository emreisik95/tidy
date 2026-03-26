import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function langRule(lang: string): string {
  if (lang === "en") return "";
  return `\n\nLANGUAGE RULE: Write everything in ${lang}. Not English.`;
}

const ANTI_SLOP = `
WRITING RULES - follow these strictly:

STYLE:
- Write like a person, not a machine. Read it aloud - if it sounds robotic, rewrite it.
- Short sentences. Plain words. Write for someone scanning on their phone.
- No corporate jargon. Write like you're explaining to a friend who runs a small shop.
- No hedging - say "this works" not "this might help".
- No staccato fragments like "Simple. Clean. Effective."

BANNED WORDS: unlock, empower, seamlessly, leverage, elevate, delve, robust, cutting-edge, game-changing, innovative, transform, revolutionize, harness, foster, tapestry, beacon, realm, pivotal, crucial, elevate, curate, artisan, bespoke, meticulously, thoughtfully, effortlessly, exquisite, premium quality, world-class, state-of-the-art, next-level, must-have, stunning.

BANNED PATTERNS: "It's not just X, it's Y", "In today's fast-paced...", "Gone are the days", "The best part?", "Here's the thing", "Let that sink in", "Whether you're X or Y", "Say goodbye to", "Take your X to the next level", "Designed with X in mind", "Perfect for X and Y alike".

HALLUCINATION RULES - these are critical:
- NEVER invent facts that aren't in the input. This includes:
  - Prices, discounts, or any monetary amounts
  - Exact measurements, weights, or dimensions
  - Specific materials (don't say "cotton" unless the input says cotton)
  - Manufacturing details or origin countries
  - Awards, certifications, or ratings
  - Shipping info, return policies, or guarantees
  - Stock levels or availability ("limited edition", "selling fast")
  - Comparisons to other products or brands
  - Health claims, safety claims, or regulatory statements
  - Number of colors/sizes/variants available
- If the input doesn't mention it, don't write it. Stick to what you can see and what you're told.
- When in doubt, be vague rather than specific: "available in multiple sizes" is better than inventing "S through XXL".

LEGAL SAFETY:
- No health or medical claims ("helps with back pain", "hypoallergenic")
- No absolute safety claims ("100% safe", "non-toxic") unless stated in input
- No false urgency ("limited time", "act now", "selling fast")
- No competitor comparisons ("better than X brand")
- No environmental claims ("eco-friendly", "sustainable") unless stated in input
`;

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
    `You write product descriptions for Shopify stores. Your job is to help merchants sell more by writing clear, honest descriptions that answer the customer's questions.
${ANTI_SLOP}
Think about what a customer actually wants to know:
- What is this product made of?
- What does it look like in person?
- Who is it for?
- What problem does it solve?

Write 2-3 short paragraphs. No bullet points unless asked. Start with the most important detail, not a generic opener.

Return JSON: {"description": "..."}${langRule(lang)}`,
    `Write a product description for this Shopify product:\n\nTitle: ${title}\nType: ${productType}${existingDescription ? `\n\nCurrent description (rewrite and improve - keep any factual details): ${existingDescription}` : "\n\nNo existing description - write from scratch based on the title and type."}`,
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
    `You write SEO meta titles and descriptions for Shopify product pages. These show up in Google search results - they need to make someone click.
${ANTI_SLOP}
SEO title rules:
- 50-60 characters max
- Include the product name and one key detail (material, color, or use case)
- Don't stuff keywords
- Don't start with the store name

SEO description rules:
- 140-160 characters max
- Answer "why should I click this?" in one sentence
- Include one specific detail (price range, material, feature)
- End with something actionable but not cheesy

Return JSON: {"seoTitle": "...", "seoDescription": "..."}${langRule(lang)}`,
    `Write SEO metadata for this Shopify product:\n\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 400)}`,
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
        content: `You write image alt text for Shopify product images. Alt text helps visually impaired shoppers and improves SEO.
${ANTI_SLOP}
Rules:
- 50-125 characters
- Describe what the image actually shows - colors, angles, context
- Don't start with "Image of" or "Photo of" or "Picture of"
- Include the product name naturally
- Mention the most visually obvious detail (color, material, setting)

Return JSON: {"altText": "..."}${langRule(lang)}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Write alt text for this product image.\nProduct: ${productTitle}` },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content || "{}").altText;
}

export async function generateTags(
  title: string,
  description: string,
  productType: string,
  lang = "en",
): Promise<string[]> {
  const raw = await generate(
    `You generate product tags for Shopify stores. Tags help with internal search, collections, and filtering.
${ANTI_SLOP}
Rules:
- 5-10 tags
- All lowercase
- Mix of: material tags (cotton, leather), style tags (casual, formal), use-case tags (gift, everyday), category tags (mens, womens, unisex)
- Include specific details from the product, not generic terms
- No multi-word marketing phrases - keep tags to 1-2 words each

Return JSON: {"tags": ["...", ...]}${langRule(lang)}`,
    `Generate tags for this Shopify product:\n\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 400)}`,
  );
  return JSON.parse(raw).tags;
}

export async function suggestCategoryName(
  title: string,
  description: string,
  productType: string,
): Promise<string> {
  const raw = await generate(
    `You categorize Shopify products into the Shopify Standard Product Taxonomy. Suggest the most specific category path that fits this product. Use real category names from the Shopify taxonomy (e.g. "Apparel & Accessories > Clothing > Pants", "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne"). Be as specific as possible - leaf categories are better than broad ones.

Return JSON: {"category": "Category > Subcategory > Specific"}`,
    `Categorize this product:\nTitle: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 300)}`,
  );
  return JSON.parse(raw).category;
}
