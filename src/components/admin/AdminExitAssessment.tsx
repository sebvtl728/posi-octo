import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { subscribeToSession, updateSession } from '../../lib/sessions';
import { getTemplateById } from '../../lib/templates';
import type { Session, HTMLTemplate } from '../../types';
import DynamicFormRenderer from '../shared/DynamicFormRenderer';
import { Check, Info, ArrowLeft, RefreshCw, Trash2, FileText, Sparkles, TrendingUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface CompItem {
  id: number;
  num: string;
  title: string;
  sub: string;
  icon: string;
  placeholderAcquis: string;
  placeholderObjectif: string;
}

const COMPETENCIES: CompItem[] = [
  {
    id: 0,
    num: 'C1 · UF1',
    title: 'Utiliser les outils IA générative',
    sub: 'Sélectionner, comparer et justifier les outils selon le contexte professionnel',
    icon: '🔧',
    placeholderAcquis: 'Ex. : Je peux comparer ChatGPT, Mistral et Copilot...',
    placeholderObjectif: 'Ex. : Je dois approfondir les cas d\'usage...'
  },
  {
    id: 1,
    num: 'C2 · UF2',
    title: 'Rédiger des prompts efficaces',
    sub: 'Structurer un prompt selon ROCCO, itérer, adapter selon l\'outil',
    icon: '✍️',
    placeholderAcquis: 'Ex. : Je construis un prompt ROCCO complet...',
    placeholderObjectif: 'Ex. : Préparer 3 cas métiers variés...'
  },
  {
    id: 2,
    num: 'C3 · UF3',
    title: 'Sécuriser l\'usage de l\'IA',
    sub: 'RGPD, IA Act, shadow AI - identifier les risques et adopter les bons réflexes',
    icon: '🛡️',
    placeholderAcquis: 'Ex. : Je sais reformuler les principes RGPD...',
    placeholderObjectif: 'Ex. : Préparer 2 exemples réels...'
  },
  {
    id: 3,
    num: 'C4 · UF4',
    title: 'Concevoir des contenus inclusifs',
    sub: 'WCAG, FALC, spécificités déficiences visuelles et auditives',
    icon: '♿',
    placeholderAcquis: 'Ex. : Je sais animer le brainstorming accessibilité...',
    placeholderObjectif: 'Ex. : Approfondir les spécificités auditives...'
  },
  {
    id: 4,
    num: 'C5 · UF2 & UF4',
    title: 'Optimiser les contenus générés par IA',
    sub: 'Réviser, améliorer et valider un contenu IA selon des critères définis',
    icon: '⚡',
    placeholderAcquis: 'Ex. : Je sais guider un apprenant dans la révision...',
    placeholderObjectif: 'Ex. : Développer une grille de relecture...'
  },
  {
    id: 5,
    num: 'C6 · UF5',
    title: 'Adopter une posture éthique face à l\'IA',
    sub: 'Biais, sobriété, responsabilité - analyser les impacts et faciliter le débat',
    icon: '⚖️',
    placeholderAcquis: 'Ex. : J\'identifie les biais de genre ou d\'origine...',
    placeholderObjectif: 'Ex. : Créer un mini-guide sur l\'impact carbone...'
  }
];

function RadarChart({ labels, autoData, refData }: { labels: string[]; autoData: number[]; refData: number[] }) {
  const size = 500;
  const center = size / 2;
  const rMax = 110;
  const count = labels.length;
  const points = labels.map((label, i) => {
    const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle), label };
  });

  const getPath = (data: number[]) => {
    return data.map((val, i) => {
      const radius = (val / 4) * rMax;
      return `${i === 0 ? 'M' : 'L'} ${(center + points[i].x * radius).toFixed(1)} ${(center + points[i].y * radius).toFixed(1)}`;
    }).join(' ') + ' Z';
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto max-w-[480px]">
      {[1, 2, 3, 4].map((ring) => {
        const radius = (ring / 4) * rMax;
        return (
          <path
            key={ring}
            d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${center + p.x * radius} ${center + p.y * radius}`).join(' ') + ' Z'}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="0.5"
          />
        );
      })}
      {points.map((p, i) => (
        <line key={i} x1={center} y1={center} x2={center + p.x * rMax} y2={center + p.y * rMax} stroke="#e2e8f0" strokeWidth="0.5" />
      ))}
      <path d={getPath(autoData)} fill="rgba(83, 74, 183, 0.12)" stroke="#534ab7" strokeWidth="2" />
      <path d={getPath(refData)} fill="rgba(133, 79, 11, 0.08)" stroke="#854f0b" strokeWidth="2" />
      {points.map((p, i) => {
        const offset = 25;
        let textAnchor: 'end' | 'inherit' | 'middle' | 'start' = 'middle';
        if (p.x > 0.2) textAnchor = 'start';
        if (p.x < -0.2) textAnchor = 'end';
        return (
          <text key={i} x={center + p.x * (rMax + offset)} y={center + p.y * (rMax + offset) + 4} fontSize="8.5" fontWeight="bold" fill="#475569" textAnchor={textAnchor}>
            {p.label}
          </text>
        );
      })}
    </svg>
  );
}

export default function AdminExitAssessment() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [entryTemplate, setEntryTemplate] = useState<HTMLTemplate | null>(null);
  const [exitTemplate, setExitTemplate] = useState<HTMLTemplate | null>(null);
  const tabParam = new URLSearchParams(window.location.search).get('tab') as 'entry' | 'exit' | 'ai' | null;
  const [activeTab, setActiveTab] = useState<'entry' | 'exit' | 'ai'>(tabParam || 'exit');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');

  // Static Form Canvas Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    return subscribeToSession(sessionId, async (s) => {
      setSession(s);
      
      // Fetch entry template if present
      if (s.entryTemplateId) {
        try {
          const t = await getTemplateById(s.entryTemplateId);
          setEntryTemplate(t);
        } catch (e) {
          console.error('Failed to load entry template', e);
        }
      }
      
      // Fetch exit template if present
      if (s.exitTemplateId) {
        try {
          const t = await getTemplateById(s.exitTemplateId);
          setExitTemplate(t);
        } catch (e) {
          console.error('Failed to load exit template', e);
        }
      }
      setLoading(false);
    });
  }, [sessionId]);

  // Load signature if fallback is active
  useEffect(() => {
    if (!exitTemplate && session?.signatureData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = session.signatureData;
      }
    }
  }, [session?.signatureData, exitTemplate, loading]);

  const formatPDFFileName = (userName: string, templateName: string) => {
    const cleanUser = userName.trim().replace(/\s+/g, '-');
    const cleanTemplate = templateName
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const dateStr = new Date().toISOString().split('T')[0];
    return `${cleanUser}_${cleanTemplate}_${dateStr}`;
  };

  const hasPrintedRef = useRef(false);

  // Update page title reactively to set the default PDF filename
  useEffect(() => {
    if (!loading && session) {
      const templateName = activeTab === 'entry'
        ? (entryTemplate?.name || 'autopositionnement')
        : activeTab === 'ai'
        ? 'synthese-radar'
        : (exitTemplate?.name || 'bilan');
      document.title = formatPDFFileName(session.userName, templateName);
    }
  }, [loading, session, activeTab, entryTemplate, exitTemplate]);

  // Trigger automatic print if printMode is active
  useEffect(() => {
    const printMode = new URLSearchParams(window.location.search).get('print') === 'true';
    if (!loading && printMode && session && !hasPrintedRef.current) {
      if (!exitTemplate || activeTab === 'ai') {
        const triggerFallbackPrint = () => {
          if (document.hasFocus()) {
            hasPrintedRef.current = true;
            const timer = setTimeout(() => {
              window.print();
            }, 1000);
            return () => clearTimeout(timer);
          } else {
            const handleFocus = () => {
              window.removeEventListener('focus', handleFocus);
              triggerFallbackPrint();
            };
            window.addEventListener('focus', handleFocus);
          }
        };
        triggerFallbackPrint();
      }
    }
  }, [loading, exitTemplate, session, activeTab]);

  const handleFieldChange = async (name: string, value: any) => {
    if (!session) return;
    setSyncing(true);
    const updatedFormData = {
      ...(session.formData || {}),
      [name]: value
    };
    try {
      await updateSession(session.id, {
        formData: updatedFormData
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Voulez-vous réinitialiser toutes les évaluations du référent ?') || !session) return;
    setSyncing(true);
    const clearedFormData = { ...(session.formData || {}) };
    if (!exitTemplate) {
      COMPETENCIES.forEach((c) => {
        delete clearedFormData[`c${c.id + 1}r`];
        delete clearedFormData[`st${c.id + 1}`];
        delete clearedFormData[`c${c.id + 1}_acquis`];
        delete clearedFormData[`c${c.id + 1}_objectif`];
      });
      delete clearedFormData[`synthesis_points_forts`];
      delete clearedFormData[`synthesis_axes_progres`];
    } else {
      // Clear dynamic template data keys
      Object.keys(clearedFormData).forEach(k => {
        if (k.includes('ref') || k.includes('st') || k.includes('comment') || k.includes('observation')) {
          delete clearedFormData[k];
        }
      });
    }
    try {
      await updateSession(session.id, {
        formData: clearedFormData,
        signatureData: '',
        signatureDate: ''
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };



  // Fallback canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isCompleted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = async () => {
    setIsDrawing(false);
    if (!canvasRef.current || !session) return;
    const signatureData = canvasRef.current.toDataURL('image/png');
    setSyncing(true);
    try {
      await updateSession(session.id, {
        signatureData,
        signatureDate: new Date().toLocaleDateString('fr-FR')
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center bg-slate-50 flex-1">
        <p className="text-sm text-slate-500 font-medium">Bilan introuvable.</p>
      </div>
    );
  }

  const formData = session.formData || {};
  const isCompleted = session.status === 'completed';
  const mapValueToScore = (val: any): number => {
    if (!val) return 0;
    const s = String(val)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (s.includes('inconnu') || s.includes('non acquis') || s === '1' || s === '−') return 1;
    if (s.includes('notion') || s.includes('en cours') || s === '2' || s === '−/+') return 2;
    if (s.includes('connu') || s.includes('acquis') || s === '3' || s === '+') return 3;
    if (s.includes('appliqu') || s.includes('maitris') || s === '4' || s === '++') return 4;
    return 0;
  };

  const parseTemplateSections = (htmlContent: string) => {
    const sections: { title: string; itemCount: number }[] = [];
    const sectionRegex = /title:\s*['"]([^'"]+)['"]\s*,\s*items:\s*\[([\s\S]*?)\]/g;
    let match;
    
    while ((match = sectionRegex.exec(htmlContent)) !== null) {
      const title = match[1];
      const itemsContent = match[2];
      
      const cleanContent = itemsContent.replace(/\\'/g, '').replace(/\\"/g, '');
      let stringRegex = /"([^"]+)"/g;
      if (!/"[^"]+"/.test(cleanContent)) {
        stringRegex = /'([^']+)'/g;
      }
      
      let stringMatch;
      let itemCount = 0;
      while ((stringMatch = stringRegex.exec(cleanContent)) !== null) {
        itemCount++;
      }
      
      if (itemCount > 0) {
        sections.push({ title, itemCount });
      }
    }
    return sections;
  };

  const parsedSections = exitTemplate 
    ? parseTemplateSections(exitTemplate.htmlContent || '')
    : entryTemplate 
    ? parseTemplateSections(entryTemplate.htmlContent || '')
    : [];

  const hasDynamicSections = parsedSections.length > 0;

  let labels = ['C1 Outils', 'C2 Prompt', 'C3 Sécurité', 'C4 Accessibilité', 'C5 Optim.', 'C6 Éthique'];
  let autoData = [0, 0, 0, 0, 0, 0];
  let refData = [0, 0, 0, 0, 0, 0];
  if (hasDynamicSections) {
    labels = parsedSections.map((s, idx) => `${idx + 1}. ${s.title}`);
    
    let currentCriteriaIndex = 0;
    autoData = parsedSections.map(s => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < s.itemCount; i++) {
        currentCriteriaIndex++;
        const key = `critere-${String(currentCriteriaIndex).padStart(2, '0')}`;
        const val = formData[`entry_${key}`] !== undefined ? formData[`entry_${key}`] : formData[key];
        const score = mapValueToScore(val);
        if (score > 0) {
          sum += score;
          count++;
        }
      }
      return count > 0 ? Number((sum / count).toFixed(2)) : 0;
    });

    currentCriteriaIndex = 0;
    refData = parsedSections.map(s => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < s.itemCount; i++) {
        currentCriteriaIndex++;
        const key = `critere-${String(currentCriteriaIndex).padStart(2, '0')}`;
        const val = formData[key];
        const score = mapValueToScore(val);
        if (score > 0) {
          sum += score;
          count++;
        }
      }
      return count > 0 ? Number((sum / count).toFixed(2)) : 0;
    });
  } else {
    autoData = COMPETENCIES.map(c => {
      const val = formData[`entry_s${c.id + 1}a`] !== undefined 
        ? formData[`entry_s${c.id + 1}a`] 
        : formData[`entry_tool_${c.id + 1}_rating`] !== undefined
        ? formData[`entry_tool_${c.id + 1}_rating`]
        : formData[`s${c.id + 1}a`] || formData[`tool_${c.id + 1}_rating`];
      return Number(val || 0);
    });
    refData = COMPETENCIES.map(c => Number(formData[`c${c.id + 1}r`] || 0));
  }

  const handleGenerateAI = async () => {
    if (!session) return;
    setGeneratingAI(true);
    setAiError('');
    try {
      let competenciesText = '';
      
      if (hasDynamicSections) {
        let currentCriteriaIndex = 0;
        competenciesText = parsedSections.map((s, idx) => {
          const items: string[] = [];
          for (let i = 0; i < s.itemCount; i++) {
            currentCriteriaIndex++;
            const key = `critere-${String(currentCriteriaIndex).padStart(2, '0')}`;
            const studentVal = formData[`entry_${key}`] !== undefined ? formData[`entry_${key}`] : formData[key] || 'Non renseigné';
            const trainerVal = formData[key] || 'Non renseigné';
            items.push(`  - Critère ${currentCriteriaIndex} : Évaluation élève : "${studentVal}" | Évaluation formateur : "${trainerVal}"`);
          }
          return `### Section ${idx + 1} : ${s.title}\n${items.join('\n')}`;
        }).join('\n\n');
      } else {
        competenciesText = COMPETENCIES.map((comp) => {
          const studentRating = formData[`entry_s${comp.id + 1}a`] !== undefined 
            ? formData[`entry_s${comp.id + 1}a`] 
            : formData[`entry_tool_${comp.id + 1}_rating`] !== undefined
            ? formData[`entry_tool_${comp.id + 1}_rating`]
            : formData[`s${comp.id + 1}a`] || formData[`tool_${comp.id + 1}_rating`] || '0';
          const trainerRating = formData[`c${comp.id + 1}r`] || 'Non évalué';
          const studentAcquis = formData[`c${comp.id + 1}_acquis`] || 'Non renseigné';
          const studentObjectif = formData[`c${comp.id + 1}_objectif`] || 'Non renseigné';
          
          return `### ${comp.num} - ${comp.title} (${comp.sub})
- Auto-positionnement Élève : ${studentRating}/4
- Note Formateur Référent : ${trainerRating}/4
- Points acquis déclarés par l'élève : "${studentAcquis}"
- Objectifs visés déclarés par l'élève : "${studentObjectif}"`;
        }).join('\n\n');
      }

      const prompt = `Voici les résultats de l'auto-positionnement (Élève) et de l'évaluation du formateur référent pour l'apprenant : ${session.userName}.

Compétences et critères évalués :

${competenciesText}

Veuillez rédiger une analyse de synthèse professionnelle pour le dossier pédagogique (Qualiopi) de cet apprenant.
Votre synthèse doit obligatoirement aborder :
1. **Le Profil du Candidat** : Une analyse globale de sa posture et de son niveau général (ex: profil à l'aise avec la technique mais manquant de théorie, profil très orienté sécurité, etc.).
2. **Les Points Forts Majeurs** : Les compétences clés acquises ou sur lesquelles l'élève et le formateur s'accordent.
3. **Les Points de Vigilance & Axes de Progrès** : Les domaines prioritaires à revoir ou à approfondir en phase 2.

Consignes de formatage :
- Rédigez en français.
- Utilisez un ton professionnel, encourageant, constructif et conforme aux exigences Qualiopi.
- Structurez clairement votre réponse avec des titres et des listes à puces en Markdown.
- Adaptez-vous aux thématiques spécifiques évaluées (outils graphiques, bureautique, technique ou IA selon le cas). Ne parlez pas d'IA générative ou de prompts si le test porte sur un autre sujet comme Illustrator, Photoshop, Excel ou Premiere !
- Restez synthétique (environ 300 à 450 mots).
- Ne mettez pas d'introduction ou de conclusion inutile, allez droit au but.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Vous êtes un conseiller pédagogique expert dans l\'analyse des évaluations de compétences et de positionnement Qualiopi.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Erreur API: ${response.statusText}`);
      }

      const resData = await response.json();
      const content = resData?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Réponse vide de l\'IA.');
      }

      const updatedFormData = {
        ...(session.formData || {}),
        ai_synthesis: content
      };
      
      await updateSession(session.id, {
        formData: updatedFormData
      });
    } catch (e: any) {
      console.error(e);
      setAiError(e.message || 'Impossible de générer la synthèse IA.');
    } finally {
      setGeneratingAI(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-sm text-slate-800">Bilan formateur</h2>
            <p className="text-[10px] text-slate-400">Dyade formateur référent · {session.userName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {syncing ? (
            <span className="text-[10px] text-indigo-500 flex items-center gap-1 font-medium">
              <RefreshCw className="w-3 h-3 animate-spin" /> Enregistrement...
            </span>
          ) : (
            <span className="text-[10px] text-green-500 flex items-center gap-1 font-medium">
              <Check className="w-3 h-3" /> Sauvegardé dans le cloud
            </span>
          )}
          
          {session.status === 'completed' ? (
            <button
              onClick={async () => {
                setSyncing(true);
                try {
                  await updateSession(session.id, { status: 'active' });
                } catch (e) {
                  console.error(e);
                } finally {
                  setSyncing(false);
                }
              }}
              className="px-2.5 py-1.5 bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Bilan Clôturé (Réouvrir)
            </button>
          ) : (
            <button
              onClick={async () => {
                setSyncing(true);
                try {
                  await updateSession(session.id, {
                    status: 'completed',
                    completedAt: new Date().toISOString()
                  });
                } catch (e) {
                  console.error(e);
                } finally {
                  setSyncing(false);
                }
              }}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              Clôturer le Bilan
            </button>
          )}

          <button
            onClick={() => {
              const iframe = document.querySelector('iframe');
              if (iframe instanceof HTMLIFrameElement) {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
              } else {
                window.print();
              }
            }}
            className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Exporter en PDF"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" /> Exporter PDF
          </button>

          <button
            onClick={handleClearAll}
            className="px-2.5 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Réinitialiser
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 px-6 py-2 shrink-0 flex gap-4 text-xs font-semibold print:hidden">
        <button
          onClick={() => setActiveTab('exit')}
          className={`pb-2 border-b-2 transition-colors ${
            activeTab === 'exit'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Bilan de Sortie (Formateur)
        </button>
        {entryTemplate && (
          <button
            onClick={() => setActiveTab('entry')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'entry'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Auto-positionnement (Élève - Lecture seule)
          </button>
        )}
        <button
          onClick={() => setActiveTab('ai')}
          className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'ai'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" /> Synthèse IA & Radar
        </button>
      </div>

      <div className="flex-grow overflow-auto p-6 print:p-0 print:bg-white print:overflow-visible">
        {activeTab === 'entry' && entryTemplate ? (
          <DynamicFormRenderer
            htmlContent={entryTemplate.htmlContent}
            formData={formData}
            onFieldChange={handleFieldChange}
            isReadOnly={true}
            pdfTitle={session ? formatPDFFileName(session.userName, entryTemplate.name || 'autopositionnement') : undefined}
            valuePrefix="entry_"
          />
        ) : activeTab === 'exit' && exitTemplate ? (
          <DynamicFormRenderer
            htmlContent={exitTemplate.htmlContent}
            formData={formData}
            onFieldChange={handleFieldChange}
            isReadOnly={session.status === 'completed'}
            pdfTitle={session ? formatPDFFileName(session.userName, exitTemplate.name || 'bilan') : undefined}
          />
        ) : activeTab === 'ai' ? (
          <div className="space-y-6 max-w-4xl mx-auto print:max-w-full print:mx-0">
            {/* Header section */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:border-slate-100 print:shadow-none">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Rapport Pédagogique Qualiopi</span>
                <h3 className="text-lg font-black text-slate-800 mt-1">Synthèse d'Évaluation & Radar de Compétences</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fiche outil : <strong className="text-slate-700">{exitTemplate?.name || entryTemplate?.name || 'Positionnement'}</strong>
                </p>
              </div>
              <div className="flex gap-2 print:hidden shrink-0">
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {generatingAI ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Synthèse en cours...
                    </>
                  ) : formData.ai_synthesis ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Régénérer la Synthèse IA
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Générer la Synthèse IA
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Info Banner containing Student Name, Date, and Trainer Name */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 print:border-slate-100 print:shadow-none">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Apprenant</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">
                  {formData['nom'] && formData['prenom'] 
                    ? `${formData['prenom']} ${formData['nom']}` 
                    : formData['entry_nom'] && formData['entry_prenom']
                    ? `${formData['entry_prenom']} ${formData['entry_nom']}`
                    : session.userName}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Date de l'évaluation</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">
                  {formData['date-bilan'] || formData['date_bilan'] || formData['date-remplissage'] || formData['entry_date-remplissage'] || (session.completedAt ? new Date(session.completedAt).toLocaleDateString('fr-FR') : new Date(session.createdAt).toLocaleDateString('fr-FR'))}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Formateur Référent</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">
                  {formData['formateur-referent'] || formData['trainer_referent'] || formData['entry_formateur-referent'] || 'Sébastien Veitl'}
                </span>
              </div>
            </div>

            {/* Radar Chart and AI Summary Container */}
            {/* Radar Chart and AI Summary Container */}
            <div className="space-y-6">
              {/* Radar Chart Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between items-center print:break-inside-avoid print:shadow-none print:border-slate-100">
                <div className="text-center w-full">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-indigo-500" /> Comparatif de Compétences
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Dual-Overlay : Autoévaluation vs Référent</p>
                </div>
                
                <div className="h-64 w-full flex items-center justify-center my-4">
                  <RadarChart labels={labels} autoData={autoData} refData={refData} />
                </div>
                
                <div className="flex justify-center gap-4 w-full">
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-600">
                    <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" /> Autoévaluation
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-700">
                    <span className="w-2.5 h-2.5 bg-amber-700 rounded-full" /> Formateur Référent
                  </div>
                </div>
              </div>

              {/* AI Summary Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col print:shadow-none print:border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">Analyse de Profil IA</h4>
                
                {aiError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-xs mb-4">
                    {aiError}
                  </div>
                )}

                {generatingAI ? (
                  <div className="flex-grow flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <div className="relative flex h-8 w-8">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-8 w-8 bg-indigo-500 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white animate-pulse" />
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Analyse IA en cours...</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs">Gemini analyse l'auto-positionnement de l'élève et l'évaluation du formateur pour rédiger la synthèse...</p>
                    </div>
                  </div>
                ) : formData.ai_synthesis ? (
                  <div className="prose prose-slate prose-xs max-w-none text-xs text-slate-600 space-y-4 print:text-slate-800">
                    <ReactMarkdown>{formData.ai_synthesis}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center py-12 gap-3 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <Sparkles className="w-8 h-8 text-indigo-300" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">Aucune synthèse générée</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[240px] mx-auto">Cliquez sur le bouton ci-dessus pour générer l'analyse automatique du profil de l'élève.</p>
                    </div>
                    <button
                      onClick={handleGenerateAI}
                      className="mt-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold transition-colors"
                    >
                      Générer maintenant
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Fallback static C1-C6 Form */
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Fallback Header Banner */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm grid grid-cols-3 gap-6">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Apprenant</span>
                <span className="text-sm font-semibold text-slate-800">{session.userName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Date du bilan</span>
                <input
                  type="text"
                  value={formData[`date_bilan`] || ''}
                  onChange={(e) => handleFieldChange('date_bilan', e.target.value)}
                  placeholder="Ex: Mercredi 4"
                  disabled={isCompleted}
                  className="mt-1 font-semibold text-sm text-slate-800 border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-0.5 disabled:opacity-60"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Formateur référent</span>
                <input
                  type="text"
                  value={formData[`trainer_referent`] || ''}
                  onChange={(e) => handleFieldChange('trainer_referent', e.target.value)}
                  placeholder="Ex: Sébastien Veitl"
                  disabled={isCompleted}
                  className="mt-1 font-semibold text-sm text-slate-800 border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-0.5 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Fallback Radar Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Radar de compétences</h3>
                  <p className="text-[10px] text-slate-400">Autoévaluation (Violet) vs Référent (Ambre)</p>
                </div>
                <div className="h-64 flex items-center justify-center">
                  <RadarChart labels={labels} autoData={autoData} refData={refData} />
                </div>
                <div className="flex justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600">
                    <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" /> Autoévaluation
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700">
                    <span className="w-2.5 h-2.5 bg-amber-700 rounded-full" /> Référent
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Synthèse & Axes de progrès</h3>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Points forts</label>
                  <textarea
                    value={formData['synthesis_points_forts'] || ''}
                    onChange={(e) => handleFieldChange('synthesis_points_forts', e.target.value)}
                    placeholder="Points forts observés..."
                    disabled={isCompleted}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Axes prioritaires de progrès (Phase 2)</label>
                  <textarea
                    value={formData['synthesis_axes_progres'] || ''}
                    onChange={(e) => handleFieldChange('synthesis_axes_progres', e.target.value)}
                    placeholder="Objectifs d'amélioration..."
                    disabled={isCompleted}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* Fallback Competencies list */}
            <div className="space-y-6">
              {COMPETENCIES.map((comp) => {
                const autoVal = formData[`s${comp.id + 1}a`] || formData[`tool_${comp.id + 1}_rating`] || '';
                const refVal = formData[`c${comp.id + 1}r`] || '';
                const statusVal = formData[`st${comp.id + 1}`] || '';
                const acquisVal = formData[`c${comp.id + 1}_acquis`] || '';
                const objectifVal = formData[`c${comp.id + 1}_objectif`] || '';

                return (
                  <div key={comp.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                      <div className="flex gap-3">
                        <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                          {comp.icon}
                        </span>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{comp.num}</div>
                          <h4 className="font-bold text-slate-800 text-sm mt-0.5">{comp.title}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">{comp.sub}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">Auto</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map(n => (
                              <button
                                key={n}
                                onClick={() => handleFieldChange(`s${comp.id + 1}a`, n)}
                                disabled={isCompleted}
                                className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                                  Number(autoVal) === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">Référent</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map(n => (
                              <button
                                key={n}
                                onClick={() => handleFieldChange(`c${comp.id + 1}r`, n)}
                                disabled={isCompleted}
                                className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                                  Number(refVal) === n ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Statut</span>
                        <div className="flex gap-2">
                          {[
                            { val: 'acquise', label: 'Acquise', cls: 'border-green-300 text-green-700 bg-green-50' },
                            { val: 'en_cours', label: 'En cours', cls: 'border-amber-300 text-amber-700 bg-amber-50' },
                            { val: 'a_renforcer', label: 'À renforcer', cls: 'border-red-300 text-red-700 bg-red-50' }
                          ].map(item => (
                            <button
                              key={item.val}
                              onClick={() => handleFieldChange(`st${comp.id + 1}`, item.val)}
                              disabled={isCompleted}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                statusVal === item.val ? item.cls : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ce que je sais faire - exemple concret</label>
                          <textarea
                            value={acquisVal}
                            onChange={(e) => handleFieldChange(`c${comp.id + 1}_acquis`, e.target.value)}
                            placeholder={comp.placeholderAcquis}
                            disabled={isCompleted}
                            className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-3 h-16 resize-none focus:outline-none disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Objectif Phase 2</label>
                          <textarea
                            value={objectifVal}
                            onChange={(e) => handleFieldChange(`c${comp.id + 1}_objectif`, e.target.value)}
                            placeholder={comp.placeholderObjectif}
                            disabled={isCompleted}
                            className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-3 h-16 resize-none focus:outline-none disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fallback signature box */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm max-w-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Signature formateur</h3>
              <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden relative h-32">
                <canvas
                  ref={canvasRef}
                  width={334}
                  height={128}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                {session.signatureDate && (
                  <span className="absolute bottom-2 right-2 text-[9px] bg-slate-800 text-white px-2 py-0.5 rounded">
                    Signé le {session.signatureDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
