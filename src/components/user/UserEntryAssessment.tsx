import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { subscribeToSession, updateSession } from '../../lib/sessions';
import { getTemplateById } from '../../lib/templates';
import type { Session, HTMLTemplate } from '../../types';
import DynamicFormRenderer from '../shared/DynamicFormRenderer';
import { Check, Info, RefreshCw } from 'lucide-react';

export default function UserEntryAssessment() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [template, setTemplate] = useState<HTMLTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    return subscribeToSession(sessionId, async (s) => {
      setSession(s);
      if (s.entryTemplateId) {
        try {
          const t = await getTemplateById(s.entryTemplateId);
          setTemplate(t);
        } catch (e) {
          console.error('Failed to load entry template', e);
        }
      }
      setLoading(false);
    });
  }, [sessionId]);

  const handleFieldChange = async (name: string, value: any) => {
    if (!session) return;
    setSyncing(true);
    const updatedFormData = {
      ...(session.formData || {}),
      [name]: value
    };
    try {
      await updateSession(session.id, {
        formData: updatedFormData,
        status: 'active'
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleComplete = async () => {
    if (!session) return;
    setSyncing(true);
    try {
      await updateSession(session.id, {
        status: 'active',
        entryCompleted: true,
        entryCompletedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-sm text-slate-500 font-medium">Chargement de votre auto-positionnement...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-md max-w-md text-center">
          <Info className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Fiche introuvable</h2>
          <p className="text-sm text-slate-500">Le lien semble expiré ou invalide. Veuillez vous rapprocher de votre formateur.</p>
        </div>
      </div>
    );
  }

  const isCompleted = session.entryCompleted || session.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      <style>{`
        #root {
          max-width: 1000px;
          margin: 0 auto;
          width: 100%;
        }
        @keyframes pulse-glowing {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.5; }
        }
        .glow-dot {
          animation: pulse-glowing 2s infinite ease-in-out;
        }
      `}</style>
      <div className="max-w-[1000px] mx-auto px-4 pt-8">
        {/* Unified Premium Sticky Header */}
        <div className="sticky top-4 z-50 bg-white/90 backdrop-blur-md rounded-2xl p-4 border border-slate-200 shadow-lg mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className={`glow-dot absolute inline-flex h-full w-full rounded-full opacity-75 ${syncing ? 'bg-indigo-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${syncing ? 'bg-indigo-500' : 'bg-green-500'}`}></span>
            </div>
            <div>
              <div className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest">
                Fiche d'Auto-positionnement d'Entrée
              </div>
              <div className="text-base font-black text-slate-900 mt-0.5">
                Apprenant : {session.userName}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                {syncing ? 'Sauvegarde automatique...' : 'Toutes les modifications sont enregistrées'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {template && !isCompleted ? (
              <button
                onClick={handleComplete}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                Soumettre mon auto-positionnement
              </button>
            ) : isCompleted ? (
              <span className="w-full sm:w-auto px-4 py-2 bg-green-50 border border-green-200 text-green-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                Validé & Transmis
              </span>
            ) : null}
          </div>
        </div>

        {template ? (
          <DynamicFormRenderer
            htmlContent={template.htmlContent}
            formData={session.formData || {}}
            onFieldChange={handleFieldChange}
            isReadOnly={isCompleted}
            valuePrefix="entry_"
          />
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
            <Info className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Aucun gabarit associé</h3>
            <p className="text-xs text-slate-500 mt-1">Veuillez demander à votre formateur d'associer une fiche d'auto-positionnement à votre session.</p>
          </div>
        )}

        {isCompleted && (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <Check className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-green-800">Fiche soumise avec succès !</h3>
            <p className="text-xs text-green-600 mt-1">Vos réponses ont été validées et sont accessibles par votre formateur référent.</p>
          </div>
        )}
      </div>
    </div>
  );
}
