import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, model } = req.body as { messages: unknown[]; model?: string };
    const selectedModel = model || 'mistral-small-latest';

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array.' });
    }

    if (selectedModel.startsWith('gemini-')) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY manquant.' });

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const systemMessage = messages.find((m: unknown) => (m as { role: string }).role === 'system') as { content: string } | undefined;
      const contents = messages
        .filter((m: unknown) => (m as { role: string }).role !== 'system')
        .map((m: unknown) => {
          const msg = m as { role: string; content: string };
          return { role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] };
        });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: { systemInstruction: systemMessage?.content },
      });

      return res.json({ choices: [{ message: { content: response.text || '' } }] });
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'MISTRAL_API_KEY manquant.' });

    const client = new Mistral({ apiKey });
    let chatResponse;
    let retries = 0;

    while (retries < 5) {
      try {
        chatResponse = await client.chat.complete({ model: selectedModel, messages: messages as Parameters<typeof client.chat.complete>[0]['messages'] });
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('429') || msg.includes('Rate limit')) {
          retries++;
          if (retries >= 5) return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
          await new Promise(r => setTimeout(r, 5000 + 10000 * retries));
        } else throw err;
      }
    }

    res.json(chatResponse);
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur IA' });
  }
}
