import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSessions, deleteSessionsWithoutQuestionnaire, updateSession } from '../../lib/sessions';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session } from '../../types';

type Filter = 'all' | Session['status'];

function StatusBadge({ status }: { status: Session['status'] }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const labels = { pending: 'En attente', active: '● Actif', completed: 'Terminé' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${map[status]}`}>{labels[status]}</span>;
}

export default function AdminSessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const navigate = useNavigate();

  const handleCloseSession = async (id: string) => {
    if (!window.confirm('Clore cette session ?')) return;
    setClosingId(id);
    try {
      await updateSession(id, { status: 'completed', completedAt: new Date().toISOString() });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la clôture.');
    } finally {
      setClosingId(null);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Supprimer toutes les sessions sans questionnaire lié ?')) return;
    setCleaning(true);
    setCleanMsg('');
    try {
      const count = await deleteSessionsWithoutQuestionnaire();
      setCleanMsg(`${count} session${count !== 1 ? 's' : ''} supprimée${count !== 1 ? 's' : ''}.`);
    } catch (err: unknown) {
      setCleanMsg(err instanceof Error ? err.message : 'Erreur lors du nettoyage.');
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    return subscribeToSessions(all => setSessions(all.filter(s => s.type === 'individual')));
  }, []);

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.status === filter);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm text-slate-800">Sessions ({sessions.length})</h2>
          {cleanMsg && <span className="text-[10px] text-green-600 font-medium">{cleanMsg}</span>}
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50 underline"
          >
            {cleaning ? 'Nettoyage...' : 'Nettoyer (sans questionnaire)'}
          </button>
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {{ all: 'Toutes', active: 'Actives', pending: 'En attente', completed: 'Terminées' }[f]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white border-b border-slate-100">
            <tr>
              {['Utilisateur', 'Statut', 'Score', 'Créée le', 'Action'].map(h => (
                <th key={h} className="text-left px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3 font-medium">{s.userName || <span className="text-slate-400 italic">—</span>}</td>
                <td className="px-6 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-6 py-3 text-slate-500">
                  {s.scores
                    ? `${Math.round(Object.values(s.scores).reduce((a, b) => a + b, 0) / Object.values(s.scores).length)}%`
                    : '—'}
                </td>
                <td className="px-6 py-3 text-slate-400">
                  {new Date(s.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-6 py-3 flex items-center gap-3">
                  <button onClick={() => navigate(`/admin/sessions/${s.id}`)} className="text-indigo-500 hover:underline">
                    {s.status === 'completed' ? 'Voir / Exporter' : 'Suivre'}
                  </button>
                  {s.status === 'pending' && (
                    <button
                      onClick={() => setQrSession(s)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-600 underline"
                    >
                      QR / Lien
                    </button>
                  )}
                  {s.status !== 'completed' && (
                    <button
                      onClick={() => handleCloseSession(s.id)}
                      disabled={closingId === s.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50 text-[10px] underline"
                    >
                      {closingId === s.id ? '...' : 'Clore'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Aucune session.</td></tr>
            )}
          </tbody>
        </table>
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
    </div>
  );
}
