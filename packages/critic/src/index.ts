import { getAIBackend } from '@barrhawk/ai-backend';

/**
 * THE ART CRITIC - AI Visual Review
 */

export interface CritiqueResult {
  score: number; // 0-100
  issues: string[];
  praise: string[];
  verdict: 'approved' | 'rejected' | 'needs_polish';
}

export async function critique_ui(screenshotBase64: string, context?: string): Promise<CritiqueResult> {
  const backend = getAIBackend();
  
  // Note: This assumes the AI backend supports image inputs via standard messages
  // or that we are using a model that accepts them.
  // For this implementation, we assume the backend abstraction handles multimodal.
  
  const prompt = `
    You are a Senior UI/UX Designer and Accessibility Expert (The Art Critic).
    Analyze this screenshot.
    Context: ${context || 'General UI Review'}

    Evaluate based on:
    1. **Visual Hierarchy:** Is the most important action clear?
    2. **Alignment & Spacing:** Does it look janky or polished?
    3. **Contrast & A11y:** Is text readable?
    4. **Tone:** Is the copy professional?

    Return valid JSON:
    {
      "score": number,
      "issues": ["string"],
      "praise": ["string"],
      "verdict": "approved" | "rejected" | "needs_polish"
    }
  `;

  // We pass the image as a separate content block if the backend supports it
  // This depends on the shared/ai-backend implementation specifics
  // For now, we simulate the call structure
  
  try {
    const result = await backend.complete(prompt, {
      images: [screenshotBase64] // Hypothetical interface extension
    } as any);

    // Parse JSON from markdown block
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse Critic JSON');
  } catch (e: any) {
    return {
      score: 0,
      issues: [`Critique failed: ${e.message}`],
      praise: [],
      verdict: 'needs_polish'
    };
  }
}
