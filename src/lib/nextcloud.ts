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

export async function generatePdfBlob(html: string): Promise<Blob> {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Extraire les <style> du <head> et les injecter dans le document courant
  const styleContent = [...clean.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1])
    .join('\n');
  const styleEl = document.createElement('style');
  styleEl.textContent = styleContent;
  document.head.appendChild(styleEl);

  // Extraire le contenu du <body> (pas du HTML complet — innerHTML ne supporte pas <html>/<head>)
  const bodyMatch = clean.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : clean;

  // L'élément DOIT être dans le viewport pour que html2canvas le capture.
  // On le place en fixed top:0 left:0 et on le retire dès la capture terminée.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:0;left:0;width:860px;background:#fff;z-index:9999;pointer-events:none;';
  wrapper.innerHTML = bodyContent;
  document.body.appendChild(wrapper);

  // Laisser le navigateur calculer le layout avec les styles injectés
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => requestAnimationFrame(r));

  try {
    const blob: Blob = await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: 'export.pdf',
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 860,
          scrollX: 0,
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

export async function uploadPdfBlob(blob: Blob, filename: string): Promise<void> {
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

export async function generateAndUpload(html: string, filename: string): Promise<void> {
  const blob = await generatePdfBlob(html);
  await uploadPdfBlob(blob, filename);
}
