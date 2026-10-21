import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, model } = req.body as { messages: unknown[]; model?: string };
    const selectedModel = model || 'gemini-2.5-flash';

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array.' });
    }

    if (selectedModel.startsWith('gemini-')) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY manquant.' });

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const systemMessage = messages.find((m: unknown) => (m as { role: string }).role === 'system') as { content: string } | undefined;
      
      const rawContents = (messages as Array<{ role: string; content?: string }>)
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          text: (m.content || '').toString().trim()
        }))
        .filter(item => item.text.length > 0);

      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      for (const item of rawContents) {
        const last = contents[contents.length - 1];
        if (last && last.role === item.role) {
          last.parts[0].text += `\n\n${item.text}`;
        } else {
          contents.push({
            role: item.role,
            parts: [{ text: item.text }]
          });
        }
      }

      if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Bonjour' }] });
      }

      let response: any;
      let retries = 0;
      const MAX_RETRIES = 3;
      let modelToUse = selectedModel;
      while (retries < MAX_RETRIES) {
        try {
          response = await ai.models.generateContent({
            model: modelToUse,
            contents,
            config: { systemInstruction: systemMessage?.content },
          });
          break;
        } catch (err: unknown) {
          retries++;
          const msg = err instanceof Error ? err.message : '';
          if (retries < MAX_RETRIES && (msg.includes('503') || msg.includes('429') || msg.includes('high demand') || msg.includes('UNAVAILABLE'))) {
            if (modelToUse === 'gemini-2.5-flash') {
              modelToUse = 'gemini-3.5-flash';
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          } else {
            throw err;
          }
        }
      }

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
