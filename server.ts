import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenAI } from '@google/genai';
import puppeteer from 'puppeteer';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes

  app.post('/api/pdf-upload', async (req, res) => {
    const { html, filename } = req.body as { html?: string; filename?: string };
    if (!html || !filename) return res.status(400).json({ error: 'html et filename requis.' });

    const baseUrl = process.env.NEXTCLOUD_URL;
    const user = process.env.NEXTCLOUD_USER;
    const password = process.env.NEXTCLOUD_PASSWORD;
    const folder = (process.env.NEXTCLOUD_FOLDER ?? 'Archives').replace(/\/$/, '');

    if (!baseUrl || !user || !password) {
      return res.status(500).json({ error: 'Nextcloud non configuré (NEXTCLOUD_URL / USER / PASSWORD manquants).' });
    }

    let browser;
    try {
      // — Génération PDF via Puppeteer —
      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 900 });
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        printBackground: true,
      });
      await browser.close();
      browser = null;

      // — Upload WebDAV vers Nextcloud —
      const davRoot = `${baseUrl.replace(/\/$/, '')}/remote.php/dav/files/${user}`;
      const auth = Buffer.from(`${user}:${password}`).toString('base64');
      const authHeaders = { Authorization: `Basic ${auth}` };

      // Crée les dossiers si nécessaire
      let currentPath = '';
      for (const segment of folder.split('/').filter(Boolean)) {
        currentPath += `/${segment}`;
        const r = await fetch(`${davRoot}${currentPath}`, { method: 'MKCOL', headers: authHeaders }).catch(() => null);
        if (r && r.status !== 201 && r.status !== 405) {
          return res.status(500).json({ error: `Impossible de créer le dossier Nextcloud "${currentPath}" (HTTP ${r.status})` });
        }
      }

      const uploadUrl = `${davRoot}/${folder}/${filename}`;
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/pdf' },
        body: pdfBuffer,
      });

      if (!put.ok) {
        const body = await put.text().catch(() => '');
        return res.status(500).json({ error: `Upload Nextcloud ${put.status}${body ? ': ' + body.substring(0, 200) : ''}` });
      }

      res.json({ ok: true });
    } catch (err: unknown) {
      if (browser) await browser.close().catch(() => {});
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur Puppeteer/WebDAV' });
    }
  });

  app.get('/api/models', async (req, res) => {
    const modelIds: string[] = [];

    // Load Mistral models if key is present
    if (process.env.MISTRAL_API_KEY) {
      try {
        const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
        const models = await client.models.list();
        const ids = models.data?.map((m: any) => m.id);
        if (ids) modelIds.push(...ids);
      } catch (error) {
        console.error('Error fetching mistral models:', error);
      }
    }

    // Load Gemini models if key is present
    if (process.env.GEMINI_API_KEY) {
      modelIds.push('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro');
    }

    // Fallbacks if nothing could be loaded
    if (modelIds.length === 0) {
      modelIds.push('mistral-small-latest', 'mistral-large-latest');
      if (process.env.GEMINI_API_KEY) {
        modelIds.push('gemini-2.5-flash', 'gemini-2.5-pro');
      }
    }

    res.json(Array.from(new Set(modelIds)));
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, model } = req.body;
      const selectedModel = model || 'mistral-small-latest';

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages array.' });
      }

      if (selectedModel.startsWith('gemini-')) {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
          return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
        }
        
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        
        const systemMessage = messages.find((m: any) => m.role === 'system');
        const systemInstruction = systemMessage ? systemMessage.content : undefined;
        
        const contents = messages
          .filter((m: any) => m.role !== 'system')
          .map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
          }
        });

        const formattedResponse = {
          choices: [
            {
              message: {
                content: response.text || ''
              }
            }
          ]
        };

        return res.json(formattedResponse);
      }

      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'MISTRAL_API_KEY environment variable is missing.' });
      }

      const client = new Mistral({ apiKey });
      let chatResponse;
      let retries = 0;
      const MAX_RETRIES = 5;
      
      while (retries < MAX_RETRIES) {
        try {
          chatResponse = await client.chat.complete({
            model: selectedModel,
            messages: messages,
          });
          break;
        } catch (err: any) {
          if (err?.message?.includes('429') || err?.message?.includes('Rate limit')) {
            retries++;
            if (retries >= MAX_RETRIES) {
              return res.status(429).json({ error: 'Trop de requêtes vers l\'IA. Veuillez patienter une minute et réessayer (Rate Limit 429).' });
            }
            await new Promise(resolve => setTimeout(resolve, 5000 + (10000 * retries))); 
          } else {
            throw err;
          }
        }
      }

      res.json(chatResponse);
    } catch (error: any) {
      console.error('AI API error:', error);
      res.status(500).json({ error: error.message || 'Error communicating with AI' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
