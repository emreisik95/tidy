import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "Product description, 100-300 words, engaging and SEO-friendly",
    ),
});

const SeoSchema = z.object({
  seoTitle: z
    .string()
    .describe("SEO title, 50-60 characters, includes primary keyword"),
  seoDescription: z
    .string()
    .describe("SEO meta description, 140-160 characters"),
});

const AltTextSchema = z.object({
  altText: z
    .string()
    .describe("Descriptive alt text for the image, 50-125 characters"),
});

const TagsSchema = z.object({
  tags: z
    .array(z.string())
    .describe("5-10 relevant product tags for discoverability"),
});

export async function generateDescription(
  title: string,
  productType: string,
  existingDescription: string,
): Promise<string> {
  const response = await client.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a professional e-commerce copywriter. Write compelling, accurate product descriptions optimized for both customers and search engines. Do not invent features or specifications.",
      },
      {
        role: "user",
        content: `Write a product description for:\nTitle: ${title}\nType: ${productType}\n${existingDescription ? `Current description (improve this): ${existingDescription}` : "No existing description."}`,
      },
    ],
    response_format: zodResponseFormat(DescriptionSchema, "description"),
  });

  return response.choices[0].message.parsed!.description;
}

export async function generateSeo(
  title: string,
  description: string,
  productType: string,
): Promise<{ seoTitle: string; seoDescription: string }> {
  const response = await client.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an SEO specialist. Generate meta titles and descriptions that maximize click-through rates from search results. Be specific and compelling.",
      },
      {
        role: "user",
        content: `Generate SEO metadata for:\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 500)}`,
      },
    ],
    response_format: zodResponseFormat(SeoSchema, "seo"),
  });

  return response.choices[0].message.parsed!;
}

export async function generateAltText(
  imageUrl: string,
  productTitle: string,
): Promise<string> {
  const response = await client.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an accessibility expert. Write concise, descriptive alt text for product images. Focus on what the image shows. Do not start with 'Image of' or 'Photo of'.",
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Write alt text for this product image. Product: ${productTitle}`,
          },
          { type: "image_url" as const, image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: zodResponseFormat(AltTextSchema, "alt_text"),
  });

  return response.choices[0].message.parsed!.altText;
}

export async function generateTags(
  title: string,
  description: string,
  productType: string,
): Promise<string[]> {
  const response = await client.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Generate relevant, specific tags for product discoverability. Use lowercase. Include material, style, occasion, and category tags.",
      },
      {
        role: "user",
        content: `Generate tags for:\nProduct: ${title}\nType: ${productType}\nDescription: ${description.slice(0, 500)}`,
      },
    ],
    response_format: zodResponseFormat(TagsSchema, "tags"),
  });

  return response.choices[0].message.parsed!.tags;
}
