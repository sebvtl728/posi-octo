import { jsPDF } from 'jspdf';
import type { Session, Message } from '../types';

export function buildPdfFilename(userName: string, sessionDate: string, formationTitle: string): string {
  const sanitize = (s: string) =>
    s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_').substring(0, 40).replace(/_+$/, '');

  const d = new Date(sessionDate);
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aa = String(d.getFullYear()).slice(-2);

  return `${sanitize(userName)}_${jj}${mm}${aa}_${sanitize(formationTitle)}.pdf`;
}

export async function generatePdfBlob(
  session: Session,
  messages: Message[],
  scores: Record<string, number>,
  synthesis: string,
  questionnaireTitle: string
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 18;
  const MR = 18;
  const CW = W - ML - MR;
  let y = 0;

  const newPage = () => { doc.addPage(); y = ML; };
  const guard = (need: number) => { if (y + need > H - ML) newPage(); };

  const PURPLE = [108, 99, 255] as const;
  const DARK   = [30, 41, 59]   as const;
  const GRAY   = [100, 116, 139] as const;
  const LIGHT  = [148, 163, 184] as const;

  // ── HEADER BAND ──────────────────────────────────────────────
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, W, 42, 'F');

  const name = session.userName || 'Anonyme';
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`Rapport — ${name}`, ML, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${questionnaireTitle}   ·   ${date}`, ML, 34);

  y = 56;
  doc.setTextColor(...DARK);

  // ── SYNTHÈSE ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT);
  doc.text('SYNTHÈSE', ML, y);
  y += 6;

  const synthLines = doc.splitTextToSize(synthesis, CW - 10);
  const synthH = synthLines.length * 5 + 12;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(ML, y, CW, synthH, 2, 2, 'F');
  doc.setFillColor(...PURPLE);
  doc.rect(ML, y, 3, synthH, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(synthLines, ML + 8, y + 8);
  y += synthH + 18;

  // ── SCORES ───────────────────────────────────────────────────
  guard(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT);
  doc.text('SCORES PAR CATÉGORIE', ML, y);
  y += 8;

  const entries = Object.entries(scores);
  const COLS = Math.min(entries.length, 3);
  const GAP = 4;
  const cardW = (CW - GAP * (COLS - 1)) / COLS;
  const cardH = 24;

  entries.forEach(([cat, score], idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const cx = ML + col * (cardW + GAP);
    const cy = y + row * (cardH + GAP);

    guard(cardH + 4);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...PURPLE);
    doc.text(`${score}`, cx + 5, cy + 14);

    const scoreW = doc.getTextWidth(`${score}`);
    doc.setFontSize(8);
    doc.setTextColor(...LIGHT);
    doc.text('/100', cx + 5 + scoreW + 1, cy + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const catLabel = doc.splitTextToSize(cat, cardW - 10);
    doc.text(catLabel[0], cx + 5, cy + 20);
  });

  const rows = Math.ceil(entries.length / COLS);
  y += rows * (cardH + GAP) + 12;

  // ── TRANSCRIPTION ────────────────────────────────────────────
  guard(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT);
  doc.text('TRANSCRIPTION COMPLÈTE', ML, y);
  y += 10;

  for (const msg of messages) {
    const isUser = msg.role === 'user';
    const label = isUser ? name : 'Posi-octo';
    const lines = doc.splitTextToSize(msg.content, CW - 10);
    const blockH = lines.length * 4.5 + 12;

    guard(blockH + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...LIGHT);
    doc.text(label.toUpperCase(), ML, y);
    y += 5;

    if (isUser) {
      doc.setFillColor(237, 233, 254);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
    }
    doc.roundedRect(ML, y, CW, blockH, 2, 2, isUser ? 'F' : 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(lines, ML + 6, y + 7);

    y += blockH + 8;
  }

  return doc.output('blob');
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
