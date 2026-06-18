import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: { bodyParser: false },
};

async function readBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const filename = req.query.filename as string;
  if (!filename) return res.status(400).json({ error: 'Paramètre filename manquant.' });

  const baseUrl = process.env.NEXTCLOUD_URL;
  const user = process.env.NEXTCLOUD_USER;
  const password = process.env.NEXTCLOUD_PASSWORD;
  const folder = (process.env.NEXTCLOUD_FOLDER ?? 'Archives').replace(/\/$/, '');

  if (!baseUrl || !user || !password) {
    return res.status(500).json({ error: 'Nextcloud non configuré (NEXTCLOUD_URL / USER / PASSWORD manquants).' });
  }

  const body = await readBody(req);
  const davRoot = `${baseUrl.replace(/\/$/, '')}/remote.php/dav/files/${user}`;
  const auth = Buffer.from(`${user}:${password}`).toString('base64');
  const authHeaders = { Authorization: `Basic ${auth}` };

  try {
    let currentPath = '';
    for (const segment of folder.split('/').filter(Boolean)) {
      currentPath += `/${segment}`;
      const r = await fetch(`${davRoot}${currentPath}`, { method: 'MKCOL', headers: authHeaders }).catch(() => null);
      if (r && r.status !== 201 && r.status !== 405) {
        return res.status(500).json({ error: `Impossible de créer le dossier "${currentPath}" (HTTP ${r.status})` });
      }
    }

    const uploadUrl = `${davRoot}/${folder}/${filename}`;
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/pdf' },
      body,
    });

    if (!put.ok) {
      const text = await put.text().catch(() => '');
      return res.status(500).json({ error: `Nextcloud ${put.status}${text ? ': ' + text.substring(0, 200) : ''}` });
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur WebDAV' });
  }
}
