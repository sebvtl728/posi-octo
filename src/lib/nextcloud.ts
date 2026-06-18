import html2pdf from 'html2pdf.js';

export function buildPdfFilename(userName: string, sessionDate: string, formationTitle: string): string {
  const sanitize = (s: string) =>
    s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_').substring(0, 40).replace(/_+$/, '');

  const d = new Date(sessionDate);
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aa = String(d.getFullYear()).slice(-2);

  return `${sanitize(userName)}_${jj}${mm}${aa}_${sanitize(formationTitle)}.pdf`;
}

async function generatePdfBlob(html: string): Promise<Blob> {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Extraire les styles du <head> et les injecter dans le document courant
  const styleContent = [...clean.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1])
    .join('\n');
  const styleEl = document.createElement('style');
  styleEl.textContent = styleContent;
  document.head.appendChild(styleEl);

  // Extraire uniquement le contenu du <body>
  const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/is);
  const bodyContent = bodyMatch?.[1] ?? clean;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;top:0;left:-9999px;width:860px;background:#fff;';
  wrapper.innerHTML = bodyContent;
  document.body.appendChild(wrapper);

  // Deux frames pour que le navigateur calcule le layout avec les styles injectés
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const blob: Blob = await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: 'export.pdf',
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 860,
          scrollY: 0,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrapper)
      .outputPdf('blob');
    return blob;
  } finally {
    document.body.removeChild(wrapper);
    document.head.removeChild(styleEl);
  }
}

export async function generateAndUpload(html: string, filename: string): Promise<void> {
  const blob = await generatePdfBlob(html);

  const res = await fetch(`/api/nextcloud-upload?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: blob,
  });

  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}
