import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSessions, createSession, updateSession } from '../../lib/sessions';
import { subscribeToQuestionnaires } from '../../lib/questionnaire';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session, Questionnaire } from '../../types';

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

export default function AdminPositioning() {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [showModal, setShowModal] = useState(false);
  const [learnerName, setLearnerName] = useState('');
  const [selectedQId, setSelectedQId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editQId, setEditQId] = useState('');
  const [saving, setSaving] = useState(false);

  const [qrSession, setQrSession] = useState<Session | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const unsubSessions = subscribeToSessions(setAllSessions);
    const unsubQ = subscribeToQuestionnaires(qs => {
      setQuestionnaires(qs);
      const active = qs.find(q => q.isActive);
      if (active) setSelectedQId(active.id);
    });
    return () => { unsubSessions(); unsubQ(); };
  }, []);

  const sessions = allSessions.filter(s => s.type === 'positioning');
  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.status === filter);

  const handleCreate = async () => {
    if (!learnerName.trim() || !selectedQId) return;
    setCreating(true);
    try {
      const id = await createSession(selectedQId, 'positioning', learnerName.trim());
      setCreatedLink(`${window.location.origin}/s/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const openModal = () => {
    setLearnerName('');
    setCreatedLink('');
    setShowModal(true);
  };

  const openEdit = (s: Session) => {
    setEditSession(s);
    setEditQId(s.questionnaireId ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editSession || !editQId) return;
    setSaving(true);
    try {
      await updateSession(editSession.id, { questionnaireId: editQId });
      setEditSession(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="font-semibold text-sm text-slate-800">Positionnement Qualiopi</h2>
          <p className="text-[10px] text-slate-400">Indicateurs I5 · I6 · I9</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['all', 'active', 'pending', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {{ all: 'Tous', active: 'Actifs', pending: 'En attente', completed: 'Terminés' }[f]}
              </button>
            ))}
          </div>
          <button
            onClick={openModal}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
          >
            + Nouveau positionnement
          </button>
        </div>
      </header>

      {sessions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <div className="w-6 h-6 bg-indigo-200 rounded-full" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Aucun test de positionnement</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Créez un entretien de positionnement pour évaluer le niveau initial d'un apprenant avant la formation, conformément aux exigences Qualiopi.
            </p>
          </div>
          <button onClick={openModal} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors">
            + Nouveau positionnement
          </button>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                {['Apprenant', 'Formation', 'Statut', 'Créé le', 'Action'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const q = questionnaires.find(q => q.id === s.questionnaireId);
                return (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium">{s.userName || <span className="text-slate-400 italic">—</span>}</td>
                    <td className="px-6 py-3 text-slate-500">{q?.name ?? <span className="text-slate-300 italic">—</span>}</td>
                    <td className="px-6 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-6 py-3 text-slate-400">
                      {new Date(s.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 flex items-center gap-3">
                      <button
                        onClick={() => navigate(`/admin/positioning/${s.id}`, { state: { from: '/admin/positioning' } })}
                        className="text-indigo-500 hover:underline"
                      >
                        {s.status === 'completed' ? 'Fiche Qualiopi' : 'Suivre'}
                      </button>
                      {s.status === 'pending' && (
                        <>
                          <button
                            onClick={() => setQrSession(s)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-600 underline"
                          >
                            QR / Lien
                          </button>
                          <button
                            onClick={() => openEdit(s)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                          >
                            Modifier
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Aucun positionnement pour ce filtre.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            {!createdLink ? (
              <>
                <h3 className="font-bold text-sm mb-1">Nouveau test de positionnement</h3>
                <p className="text-[10px] text-slate-400 mb-5">L'IA conduira un entretien de positionnement Qualiopi (I5, I6, I9) avec l'apprenant.</p>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Prénom de l'apprenant</label>
                    <input
                      type="text"
                      value={learnerName}
                      onChange={e => setLearnerName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      placeholder="Ex: Marie"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Formation concernée</label>
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
                  <button onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium">Annuler</button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !learnerName.trim() || !selectedQId}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <h3 className="font-bold text-sm mb-1">Entretien créé pour {learnerName}</h3>
                  <p className="text-[10px] text-slate-400">Partagez ce lien ou ce QR code à l'apprenant.</p>
                </div>
                <QRCodePanel url={createdLink} size={150} label="Scanner pour démarrer l'entretien" />
                <button onClick={() => setShowModal(false)} className="text-xs text-slate-500 hover:underline">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}

      {qrSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setQrSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="font-bold text-sm mb-1">Lien — {qrSession.userName}</h3>
              <p className="text-[10px] text-slate-400">Partagez ce lien ou ce QR code à l'apprenant.</p>
            </div>
            <QRCodePanel url={`${window.location.origin}/s/${qrSession.id}`} size={160} label="Scanner pour démarrer l'entretien" />
            <button onClick={() => setQrSession(null)} className="text-xs text-slate-500 hover:underline">Fermer</button>
          </div>
        </div>
      )}

      {editSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-1">Modifier le positionnement</h3>
            <p className="text-[10px] text-slate-400 mb-5">Apprenant : <strong>{editSession.userName}</strong></p>
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-600 block mb-1">Formation concernée</label>
              <select
                value={editQId}
                onChange={e => setEditQId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sélectionner...</option>
                {questionnaires.map(q => (
                  <option key={q.id} value={q.id}>{q.name}{q.isActive ? ' (actif)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditSession(null)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium">Annuler</button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editQId}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
