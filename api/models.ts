import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Mistral } from '@mistralai/mistralai';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const modelIds: string[] = [];

  if (process.env.MISTRAL_API_KEY) {
    try {
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const models = await client.models.list();
      const ids = models.data?.map((m) => (m as { id: string }).id);
      if (ids) modelIds.push(...ids);
    } catch (error) {
      console.error('Error fetching mistral models:', error);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    modelIds.push('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro');
  }

  if (modelIds.length === 0) {
    modelIds.push('mistral-small-latest', 'mistral-large-latest');
    if (process.env.GEMINI_API_KEY) {
      modelIds.push('gemini-2.5-flash', 'gemini-2.5-pro');
    }
  }

  res.json(Array.from(new Set(modelIds)));
}
