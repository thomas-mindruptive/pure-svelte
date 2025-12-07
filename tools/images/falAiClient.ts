// File: tools/images/falAiClient.ts

/**
 * fal.ai API client wrapper
 *
 * Handles communication with fal.ai for AI image generation
 */

import * as fal from "@fal-ai/serverless-client";
import type { ImageGenerationConfig } from "./generateMissingImages.config.js";
import { log } from "$lib/utils/logger.js";

/**
 * Initialize fal.ai client with API key
 */
export function initializeFalAi(apiKey?: string) {
  const key = apiKey || process.env.FAL_AI_API_KEY;

  if (!key) {
    throw new Error(
      "FAL_AI_API_KEY environment variable is not set. " +
      "Please add it to your .env file: FAL_AI_API_KEY=your_key_here"
    );
  }

  fal.config({
    credentials: key,
  });

  console.log("✓ fal.ai client initialized");
}

/**
 * Generate an image using fal.ai
 *
 * @param prompt - The image generation prompt
 * @param config - Generation settings (model, size, steps)
 * @param negativePrompt - Optional negative prompt (what to avoid)
 * @returns URL of the generated image
 */
export async function generateImage(
  prompt: string,
  config: ImageGenerationConfig['generation'],
  negativePrompt?: string
): Promise<string> {
  console.log(`  ├─ Calling fal.ai (${config.model})...`);
  console.log(`  │  Prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
  if (negativePrompt) {
    console.log(`  │  Negative: "${negativePrompt.substring(0, 60)}${negativePrompt.length > 60 ? '...' : ''}"`);
  }

  try {
    const startTime = Date.now();

    const result = await fal.subscribe(config.model, {
      input: {
        prompt: prompt,
        negative_prompt: negativePrompt,
        image_size: config.image_size,
        num_inference_steps: config.num_inference_steps,
        num_images: 1, // Always generate 1 image per call
      },
      logs: false, // Disable verbose logs
      onQueueUpdate: (update) => {
        // Optional: Show queue status
        if (update.status === "IN_PROGRESS") {
          console.log(`  │  Status: Processing...`);
        }
      },
    }) as { images: Array<{ url: string; width: number; height: number; content_type: string }>; timings?: any; seed?: number; has_nsfw_concepts?: boolean[]; prompt?: string };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // fal.ai returns result with images array
    if (!result.images || result.images.length === 0) {
      log.error(`fal.ai returned no images`, result);
      throw new Error("fal.ai returned no images");
    }

    const imageUrl = result.images[0].url;
    console.log(`  ├─ Image generated in ${elapsed}s`);

    return imageUrl;

  } catch (error: any) {
    console.error(`  ✗ fal.ai error: ${error.message || String(error)}`);

    // Provide helpful error messages
    if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
      throw new Error(
        "fal.ai authentication failed. Check your FAL_AI_API_KEY in .env"
      );
    }

    if (error.message?.includes("quota") || error.message?.includes("limit")) {
      throw new Error(
        "fal.ai quota/rate limit reached. Try again later or upgrade your plan."
      );
    }

    throw error;
  }
}

/**
 * Estimate cost for a given number of images
 *
 * Pricing (approximate, check fal.ai for current rates):
 * - flux/schnell: ~$0.01 per image
 * - flux-pro: ~$0.05 per image
 */
export function estimateCost(
  imageCount: number,
  model: ImageGenerationConfig['generation']['model']
): number {
  const pricePerImage = model === "fal-ai/flux/schnell" ? 0.01 : 0.05;
  return imageCount * pricePerImage;
}
