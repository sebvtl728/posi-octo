import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSessions, createSession } from '../../lib/sessions';
import { subscribeToQuestionnaires } from '../../lib/questionnaire';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session, Questionnaire } from '../../types';

function StatusBadge({ status }: { status: Session['status'] }) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const labels = { pending: 'En attente', active: '● Actif', completed: 'Terminé' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);

  const [qrSession, setQrSession] = useState<Session | null>(null);

  // Modales
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [individualName, setIndividualName] = useState('');
  const [selectedQId, setSelectedQId] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const unsubSessions = subscribeToSessions(setSessions);
    const unsubQuestionnaires = subscribeToQuestionnaires(setQuestionnaires);
    return () => { unsubSessions(); unsubQuestionnaires(); };
  }, []);

  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const avgScore = (() => {
    const withScores = sessions.filter(s => s.scores);
    if (!withScores.length) return null;
    const avg = withScores.reduce((sum, s) => {
      const vals = Object.values(s.scores!);
      return sum + (vals.reduce((a, b) => a + b, 0) / vals.length);
    }, 0) / withScores.length;
    return Math.round(avg);
  })();

  const handleCreateIndividual = async () => {
    if (!individualName.trim() || !selectedQId) return;
    setCreating(true);
    try {
      const id = await createSession(selectedQId, 'individual', individualName.trim());
      setCreatedLink(`${window.location.origin}/s/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <h2 className="font-semibold text-sm text-slate-800">Tableau de bord</h2>
        <button
          onClick={() => { setShowIndividualModal(true); setCreatedLink(''); }}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
        >
          + Session individuelle
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Sessions actives', value: activeSessions, color: 'text-green-600' },
            { label: 'Sessions terminées', value: completedSessions, color: 'text-slate-700' },
            { label: 'Score moyen', value: avgScore !== null ? `${avgScore}%` : '—', color: 'text-indigo-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Table sessions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-700">Sessions récentes</span>
            <button onClick={() => navigate('/admin/sessions')} className="text-xs text-indigo-500 hover:underline">
              Voir tout →
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Utilisateur', 'Statut', 'Score', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 8).map(s => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.userName || <span className="text-slate-400 italic">—</span>}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.scores ? `${Math.round(Object.values(s.scores).reduce((a, b) => a + b, 0) / Object.values(s.scores).length)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(`/admin/sessions/${s.id}`)} className="text-indigo-500 hover:underline">
                      {s.status === 'completed' ? 'Exporter' : 'Suivre'}
                    </button>
                    {s.status === 'pending' && (
                      <button
                        onClick={() => setQrSession(s)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-600 underline"
                      >
                        QR / Lien
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">Aucune session.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {qrSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setQrSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="font-bold text-sm mb-1">Lien — {qrSession.userName}</h3>
              <p className="text-[10px] text-slate-400">Partagez ce QR code ou ce lien à l'utilisateur.</p>
            </div>
            <QRCodePanel url={`${window.location.origin}/s/${qrSession.id}`} size={160} />
            <button onClick={() => setQrSession(null)} className="text-xs text-slate-500 hover:underline">Fermer</button>
          </div>
        </div>
      )}

      {/* Modale session individuelle */}
      {showIndividualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowIndividualModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-4">Nouvelle session individuelle</h3>
            {!createdLink ? (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Prénom de l'utilisateur</label>
                    <input
                      type="text"
                      value={individualName}
                      onChange={e => setIndividualName(e.target.value)}
                      placeholder="Ex: Sophie"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Questionnaire</label>
                    <select
                      value={selectedQId}
                      onChange={e => setSelectedQId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Sélectionner...</option>
                      {questionnaires.map(q => (
                        <option key={q.id} value={q.id}>{q.name}{q.isActive ? ' (actif)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowIndividualModal(false)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium">Annuler</button>
                  <button
                    onClick={handleCreateIndividual}
                    disabled={creating || !individualName.trim() || !selectedQId}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <p className="text-xs text-slate-500 text-center">Session créée pour <strong>{individualName}</strong>. Partagez ce QR code ou ce lien.</p>
                <QRCodePanel url={createdLink} size={140} />
                <button onClick={() => setShowIndividualModal(false)} className="text-xs text-slate-500 hover:underline">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
