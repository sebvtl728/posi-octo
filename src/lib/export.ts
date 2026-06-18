import { chatWithMistral } from './mistral';
import type { Session, Message, QuestionnaireData } from '../types';

export async function computeScores(
  messages: Message[],
  questionnaire: QuestionnaireData
): Promise<Record<string, number>> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Candidat' : 'Évaluateur'}: ${m.content}`)
    .join('\n\n');
  const categories = questionnaire.categories.map(c => c.name);
  const emptyResult = Object.fromEntries(categories.map(c => [c, 0]));

  const prompt = `Tu es un évaluateur. Sur la base de la transcription suivante d'une session d'évaluation, donne un score de 0 à 100 pour chaque catégorie ci-dessous. Sois objectif.

Catégories : ${categories.join(', ')}

Transcription :
${transcript}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte ni markdown autour. Format exact (utilise exactement ces noms de catégories) :
{${categories.map(c => `"${c}": 75`).join(', ')}}`;

  try {
    const response = await chatWithMistral([{ role: 'user', content: prompt }], 'mistral-small-latest');
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return emptyResult;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return emptyResult;
  }
}

export async function computeSynthesis(
  session: Session,
  messages: Message[],
  scores: Record<string, number>
): Promise<string> {
  const scoresStr = Object.entries(scores).map(([k, v]) => `${k}: ${v}/100`).join(', ');
  const transcript = messages
    .slice(-20)
    .map(m => `${m.role === 'user' ? session.userName : 'IA'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Génère une synthèse d'évaluation professionnelle en 3-4 phrases pour ${session.userName}. Scores obtenus : ${scoresStr}. Mentionne les points forts et les axes d'amélioration. Sois encourageant mais honnête. Base-toi sur ces échanges : ${transcript}`;

  try {
    return await chatWithMistral([{ role: 'user', content: prompt }], 'mistral-small-latest');
  } catch {
    return `Synthèse non disponible. Scores : ${scoresStr}.`;
  }
}

export function generateExportHTML(
  session: Session,
  messages: Message[],
  scores: Record<string, number>,
  synthesis: string,
  questionnaireTitle: string
): string {
  const categories = Object.keys(scores);
  const values = Object.values(scores);

  const transcriptHTML = messages
    .map(m => {
      const name = m.role === 'user' ? session.userName : 'Posi-octo';
      const cls = m.role === 'user' ? 'user' : 'assistant';
      const escaped = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<div class="msg ${cls}"><div class="msg-label">${name}</div><div class="msg-content">${escaped}</div></div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport — ${session.userName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 48px 24px; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 40px; }
  .section { margin-bottom: 48px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 16px; }
  .synthesis { background: #f8fafc; border-left: 4px solid #6c63ff; padding: 20px 24px; border-radius: 0 10px 10px 0; font-size: 15px; line-height: 1.75; }
  .radar-wrap { max-width: 420px; margin: 0 auto; }
  .score-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 16px; }
  .score-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .score-card .val { font-size: 28px; font-weight: 700; color: #6c63ff; }
  .score-card .lbl { font-size: 12px; color: #64748b; margin-top: 2px; }
  .msg { margin-bottom: 20px; }
  .msg-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
  .msg.user .msg-content { background: #ede9fe; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
  .msg.assistant .msg-content { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
</style>
</head>
<body>
<h1>Rapport — ${session.userName}</h1>
<div class="meta">${questionnaireTitle} &nbsp;·&nbsp; ${new Date(session.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} &nbsp;·&nbsp; Session ${session.id.substring(0, 8)}</div>

<div class="section">
  <h2>Synthèse</h2>
  <div class="synthesis">${synthesis}</div>
</div>

<div class="section">
  <h2>Scores par catégorie</h2>
  <div class="score-grid">
    ${categories.map((c, i) => `<div class="score-card"><div class="val">${values[i]}<span style="font-size:14px;color:#94a3b8">/100</span></div><div class="lbl">${c}</div></div>`).join('')}
  </div>
  <div class="radar-wrap" style="margin-top:32px">
    <canvas id="radar"></canvas>
  </div>
</div>

<div class="section">
  <h2>Transcription complète</h2>
  ${transcriptHTML}
</div>

<script>
new Chart(document.getElementById('radar'), {
  type: 'radar',
  data: {
    labels: ${JSON.stringify(categories)},
    datasets: [{
      label: '${session.userName}',
      data: ${JSON.stringify(values)},
      backgroundColor: 'rgba(108, 99, 255, 0.15)',
      borderColor: 'rgba(108, 99, 255, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(108, 99, 255, 1)',
      pointRadius: 4,
    }]
  },
  options: {
    scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 } } } },
    plugins: { legend: { display: false } }
  }
});
<\/script>
</body>
</html>`;
}

export async function computePositioningSynthesis(
  session: Session,
  messages: Message[],
): Promise<string> {
  const transcript = messages
    .slice(-30)
    .map(m => `${m.role === 'user' ? session.userName : 'TypBot'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Tu es expert Qualiopi. Sur la base de cet entretien de positionnement, rédige une fiche synthétique structurée en 4 points :
1. Niveau initial estimé (débutant / intermédiaire / avancé) avec justification
2. Attentes et objectifs exprimés par l'apprenant
3. Besoins spécifiques détectés (handicap, contraintes, rythme)
4. Recommandations pour adapter la formation

Apprenant : ${session.userName}
Entretien :
${transcript}

Sois précis, professionnel, en français.`;

  try {
    return await chatWithMistral([{ role: 'user', content: prompt }], 'mistral-small-latest');
  } catch {
    return `Synthèse de positionnement non disponible pour ${session.userName}.`;
  }
}

export function generatePositioningHTML(
  session: Session,
  messages: Message[],
  scores: Record<string, number>,
  synthesis: string,
  questionnaireTitle: string
): string {
  const categories = Object.keys(scores);
  const values = Object.values(scores);
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const transcriptHTML = messages
    .map(m => {
      const name = m.role === 'user' ? session.userName : 'TypBot';
      const cls = m.role === 'user' ? 'user' : 'assistant';
      const escaped = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<div class="msg ${cls}"><div class="msg-label">${name}</div><div class="msg-content">${escaped}</div></div>`;
    })
    .join('');

  const synthesisEscaped = synthesis.replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Fiche de positionnement — ${session.userName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 48px 24px; color: #1e293b; line-height: 1.6; }
  .header-band { background: #1e1b4b; color: white; padding: 28px 32px; border-radius: 14px; margin-bottom: 36px; }
  .header-band h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header-band .sub { color: #a5b4fc; font-size: 13px; }
  .badges { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .badge { background: rgba(165,180,252,0.2); border: 1px solid rgba(165,180,252,0.4); color: #c7d2fe; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 36px; }
  .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
  .meta-card .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 4px; }
  .meta-card .value { font-size: 15px; font-weight: 600; color: #1e293b; }
  .section { margin-bottom: 44px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
  .synthesis { background: #f0f4ff; border-left: 4px solid #4f46e5; padding: 20px 24px; border-radius: 0 10px 10px 0; font-size: 14px; line-height: 1.8; }
  .score-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .score-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .score-card .val { font-size: 28px; font-weight: 700; color: #4f46e5; }
  .score-card .lbl { font-size: 12px; color: #64748b; margin-top: 2px; }
  .radar-wrap { max-width: 400px; margin: 24px auto 0; }
  .msg { margin-bottom: 18px; }
  .msg-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 5px; }
  .msg.user .msg-content { background: #ede9fe; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
  .msg.assistant .msg-content { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 12px; font-size: 14px; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header-band">
  <div class="sub">FICHE DE POSITIONNEMENT QUALIOPI</div>
  <h1>${session.userName}</h1>
  <div class="badges">
    <span class="badge">Indicateur I5 — Acquis &amp; attentes</span>
    <span class="badge">Indicateur I6 — Besoins spécifiques</span>
    <span class="badge">Indicateur I9 — Prérequis</span>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-card">
    <div class="label">Apprenant</div>
    <div class="value">${session.userName}</div>
  </div>
  <div class="meta-card">
    <div class="label">Formation</div>
    <div class="value">${questionnaireTitle}</div>
  </div>
  <div class="meta-card">
    <div class="label">Date de positionnement</div>
    <div class="value">${date}</div>
  </div>
</div>

<div class="section">
  <h2>Synthèse de positionnement</h2>
  <div class="synthesis">${synthesisEscaped}</div>
</div>

${categories.length > 0 ? `
<div class="section">
  <h2>Niveaux par domaine</h2>
  <div class="score-grid">
    ${categories.map((c, i) => `<div class="score-card"><div class="val">${values[i]}<span style="font-size:13px;color:#94a3b8">/100</span></div><div class="lbl">${c}</div></div>`).join('')}
  </div>
  <div class="radar-wrap">
    <canvas id="radar"></canvas>
  </div>
</div>
` : ''}

<div class="section">
  <h2>Transcription de l'entretien</h2>
  ${transcriptHTML}
</div>

<div class="footer">
  <span>Posi-octo · Fiche générée le ${new Date().toLocaleDateString('fr-FR')}</span>
  <span>Référence : ${session.id.substring(0, 8)} · Conforme Qualiopi 2021</span>
</div>

${categories.length > 0 ? `
<script>
new Chart(document.getElementById('radar'), {
  type: 'radar',
  data: {
    labels: ${JSON.stringify(categories)},
    datasets: [{
      label: '${session.userName}',
      data: ${JSON.stringify(values)},
      backgroundColor: 'rgba(79, 70, 229, 0.15)',
      borderColor: 'rgba(79, 70, 229, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(79, 70, 229, 1)',
      pointRadius: 4,
    }]
  },
  options: {
    scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 } } } },
    plugins: { legend: { display: false } }
  }
});
<\/script>
` : ''}
</body>
</html>`;
}

export function downloadHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
