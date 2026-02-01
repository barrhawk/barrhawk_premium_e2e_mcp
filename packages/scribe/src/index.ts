import { getAIBackend } from '@barrhawk/ai-backend';

export async function generateTutorial(
  planId: string, 
  trace: any, 
  screenshots: string[],
  title: string
): Promise<string> {
  const backend = getAIBackend();
  
  const prompt = `
    You are a Technical Writer.
    I have verified a feature works. Here is the execution trace:
    ${JSON.stringify(trace, null, 2)}
    
    There are ${screenshots.length} screenshots available.
    
    Write a beautiful Markdown tutorial titled "${title}".
    Use the trace to describe the steps.
    Insert placeholders for screenshots like ![Step 1](${screenshots[0]}) where appropriate.
    Explain *why* we are doing each step, not just *what*.
  `;

  const response = await backend.complete(prompt);
  return response;
}
