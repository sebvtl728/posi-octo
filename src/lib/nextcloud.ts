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
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;top:0;left:-9999px;width:860px;background:#fff;';
  wrapper.innerHTML = cleanHtml;
  document.body.appendChild(wrapper);

  // Laisse le navigateur calculer le layout
  await new Promise(r => requestAnimationFrame(r));

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
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrapper)
      .outputPdf('blob');
    return blob;
  } finally {
    document.body.removeChild(wrapper);
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
