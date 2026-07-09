import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { subscribeToSession, updateSession } from '../../lib/sessions';
import { getTemplateById } from '../../lib/templates';
import type { Session, HTMLTemplate } from '../../types';
import DynamicFormRenderer from '../shared/DynamicFormRenderer';
import { Check, Info, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';

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

function RadarChart({ autoData, refData }: { autoData: number[]; refData: number[] }) {
  const size = 300;
  const center = size / 2;
  const rMax = 100;
  const labels = ['C1 Outils', 'C2 Prompt', 'C3 Sécurité', 'C4 Accessibilité', 'C5 Optim.', 'C6 Éthique'];
  const points = labels.map((_, i) => {
    const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle), label: labels[i] };
  });

  const getPath = (data: number[]) => {
    return data.map((val, i) => {
      const radius = (val / 4) * rMax;
      return `${i === 0 ? 'M' : 'L'} ${(center + points[i].x * radius).toFixed(1)} ${(center + points[i].y * radius).toFixed(1)}`;
    }).join(' ') + ' Z';
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto max-w-[320px]">
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
        const offset = 22;
        let textAnchor: 'end' | 'inherit' | 'middle' | 'start' = 'middle';
        if (p.x > 0.2) textAnchor = 'start';
        if (p.x < -0.2) textAnchor = 'end';
        return (
          <text key={i} x={center + p.x * (rMax + offset)} y={center + p.y * (rMax + offset) + 4} fontSize="9" fontWeight="bold" fill="#475569" textAnchor={textAnchor}>
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
  const [activeTab, setActiveTab] = useState<'entry' | 'exit'>('exit');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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
  const autoData = COMPETENCIES.map(c => Number(formData[`s${c.id + 1}a`] || formData[`tool_${c.id + 1}_rating`] || 0));
  const refData = COMPETENCIES.map(c => Number(formData[`c${c.id + 1}r`] || 0));

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
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
          <button
            onClick={handleClearAll}
            className="px-2.5 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Réinitialiser
          </button>
        </div>
      </header>

      {entryTemplate && (
        <div className="bg-white border-b border-slate-200 px-6 py-2 shrink-0 flex gap-4 text-xs font-semibold">
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
        </div>
      )}

      <div className="flex-grow overflow-auto p-6">
        {activeTab === 'entry' && entryTemplate ? (
          <DynamicFormRenderer
            htmlContent={entryTemplate.htmlContent}
            formData={formData}
            onFieldChange={handleFieldChange}
            isReadOnly={true}
          />
        ) : activeTab === 'exit' && exitTemplate ? (
          <DynamicFormRenderer
            htmlContent={exitTemplate.htmlContent}
            formData={formData}
            onFieldChange={handleFieldChange}
            isReadOnly={false}
          />
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
                  className="mt-1 font-semibold text-sm text-slate-800 border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Formateur référent</span>
                <input
                  type="text"
                  value={formData[`trainer_referent`] || ''}
                  onChange={(e) => handleFieldChange('trainer_referent', e.target.value)}
                  placeholder="Ex: Sébastien Veitl"
                  className="mt-1 font-semibold text-sm text-slate-800 border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-0.5"
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
                  <RadarChart autoData={autoData} refData={refData} />
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
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Axes prioritaires de progrès (Phase 2)</label>
                  <textarea
                    value={formData['synthesis_axes_progres'] || ''}
                    onChange={(e) => handleFieldChange('synthesis_axes_progres', e.target.value)}
                    placeholder="Objectifs d'amélioration..."
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                            className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-3 h-16 resize-none focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Objectif Phase 2</label>
                          <textarea
                            value={objectifVal}
                            onChange={(e) => handleFieldChange(`c${comp.id + 1}_objectif`, e.target.value)}
                            placeholder={comp.placeholderObjectif}
                            className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-3 h-16 resize-none focus:outline-none"
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
