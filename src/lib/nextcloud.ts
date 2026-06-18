export function buildPdfFilename(userName: string, sessionDate: string, formationTitle: string): string {
  const sanitize = (s: string) =>
    s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_').substring(0, 40).replace(/_+$/, '');

  const d = new Date(sessionDate);
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aa = String(d.getFullYear()).slice(-2);

  return `${sanitize(userName)}_${jj}${mm}${aa}_${sanitize(formationTitle)}.pdf`;
}

export async function generateAndUpload(html: string, filename: string): Promise<void> {
  const res = await fetch('/api/pdf-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  });

  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}
