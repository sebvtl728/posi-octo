import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  subscribeToSessions, 
  createSession, 
  updateSession, 
  deleteSession, 
  deleteSessionsWithoutQuestionnaire 
} from '../../lib/sessions';
import { subscribeToQuestionnaires } from '../../lib/questionnaire';
import { subscribeToTemplates } from '../../lib/templates';
import QRCodePanel from '../shared/QRCodePanel';
import { FileText, Archive, Trash2, Search, Plus, X } from 'lucide-react';
import type { Session, Questionnaire, HTMLTemplate } from '../../types';

type FilterStatus = 'all' | Session['status'];
type FilterType = 'all' | Session['type'] | 'conversation';

function StatusBadge({ status }: { status: Session['status'] }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
  };
  const labels = { pending: 'En attente', active: 'En cours', completed: 'Terminé' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${map[status]}`}>{labels[status]}</span>;
}

export default function AdminSessionList() {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [templates, setTemplates] = useState<HTMLTemplate[]>([]);
  
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [learnerName, setLearnerName] = useState('');
  const [creationCategory, setCreationCategory] = useState<'soutenance' | 'positionnement'>('soutenance');
  const [selectedQId, setSelectedQId] = useState('');
  const [selectedTemplateTitle, setSelectedTemplateTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState('');
  const [createdSession, setCreatedSession] = useState<Session | null>(null);

  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editQId, setEditQId] = useState('');
  const [editEntryId, setEditEntryId] = useState('');
  const [editExitId, setEditExitId] = useState('');
  const [saving, setSaving] = useState(false);

  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubSessions = subscribeToSessions(setAllSessions);
    const unsubQ = subscribeToQuestionnaires(qs => {
      setQuestionnaires(qs);
      const active = qs.find(q => q.isActive);
      if (active) setSelectedQId(active.id);
    });
    const unsubT = subscribeToTemplates(ts => {
      setTemplates(ts);
      const uniqueNames = Array.from(new Set(ts.filter(t => t.type === 'entry_self_assessment').map(t => t.name.trim()))).sort((a, b) => a.localeCompare(b));
      if (uniqueNames.length > 0) {
        setSelectedTemplateTitle(uniqueNames[0]);
      }
    });

    // Check if redirecting from dashboard with state to open modal
    if (location.state && (location.state as any).openCreateModal) {
      openCreateModal();
    }

    return () => { unsubSessions(); unsubQ(); unsubT(); };
  }, [location.state, questionnaires.length, templates.length]);

  const openCreateModal = () => {
    setLearnerName('');
    setCreatedLink('');
    setCreatedSession(null);
    setCreationCategory('soutenance');
    // Set default questionnaire
    const activeQ = questionnaires.find(q => q.isActive);
    if (activeQ) setSelectedQId(activeQ.id);
    // Set default templates title
    const uniqueNames = Array.from(new Set(templates.filter(t => t.type === 'entry_self_assessment').map(t => t.name.trim()))).sort((a, b) => a.localeCompare(b));
    if (uniqueNames.length > 0) {
      setSelectedTemplateTitle(uniqueNames[0]);
    } else {
      setSelectedTemplateTitle('');
    }
    
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!learnerName.trim()) return;
    if (creationCategory === 'soutenance' && !selectedQId) return;
    if (creationCategory === 'positionnement' && !selectedTemplateTitle) return;

    setCreating(true);
    try {
      const sType = creationCategory === 'soutenance' ? 'individual' : 'entry_self_assessment';
      const qId = creationCategory === 'soutenance' ? selectedQId : undefined;
      
      let entryId: string | undefined;
      let exitId: string | undefined;
      
      if (creationCategory === 'positionnement' && selectedTemplateTitle) {
        entryId = templates.find(t => t.type === 'entry_self_assessment' && t.name.trim().toLowerCase() === selectedTemplateTitle.toLowerCase())?.id;
        exitId = templates.find(t => t.type === 'exit_assessment' && t.name.trim().toLowerCase() === selectedTemplateTitle.toLowerCase())?.id;
      }
      
      const id = await createSession(
        qId,
        sType,
        learnerName.trim(),
        'pending',
        entryId,
        exitId
      );
      
      let link = '';
      if (sType === 'entry_self_assessment') {
        link = `${window.location.origin}/entry-assessment/${id}`;
      } else {
        link = `${window.location.origin}/s/${id}`;
      }

      setCreatedLink(link);
      setCreatedSession({
        id,
        userName: learnerName.trim(),
        type: sType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        entryTemplateId: entryId,
        exitTemplateId: exitId,
        questionnaireId: qId
      });
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la création de la session');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (s: Session) => {
    setEditSession(s);
    setEditQId(s.questionnaireId ?? '');
    setEditEntryId(s.entryTemplateId ?? '');
    setEditExitId(s.exitTemplateId ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editSession) return;
    setSaving(true);
    try {
      const isConv = ['individual', 'collective', 'positioning'].includes(editSession.type);
      const isEntry = editSession.type === 'entry_self_assessment';
      const isExit = editSession.type === 'exit_assessment';

      await updateSession(editSession.id, {
        questionnaireId: isConv ? (editQId || undefined) : undefined,
        entryTemplateId: isEntry ? (editEntryId || undefined) : undefined,
        exitTemplateId: (isEntry || isExit) ? (editExitId || undefined) : undefined
      });
      setEditSession(null);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la modification');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Session) => {
    if (!window.confirm(`Supprimer définitivement la session de "${s.userName || 'Anonyme'}" ?`)) return;
    try {
      await deleteSession(s.id);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la suppression');
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Supprimer toutes les sessions sans questionnaire ou template associé ?')) return;
    setCleaning(true);
    setCleanMsg('');
    try {
      const count = await deleteSessionsWithoutQuestionnaire();
      setCleanMsg(`${count} session(s) obsolète(s) supprimée(s).`);
      setTimeout(() => setCleanMsg(''), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors du nettoyage.');
    } finally {
      setCleaning(false);
    }
  };

  // Filtered Sessions
  const filtered = allSessions.filter(s => {
    // Archived filter
    const isArchivedMatch = showArchived ? !!s.isArchived : !s.isArchived;
    if (!isArchivedMatch) return false;

    // Status filter
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;

    // Type filter
    if (filterType !== 'all') {
      if (filterType === 'conversation') {
        if (!['individual', 'collective', 'positioning'].includes(s.type)) return false;
      } else if (s.type !== filterType) {
        return false;
      }
    }

    // Search query filter (learner name)
    if (searchQuery.trim() !== '') {
      const name = (s.userName || '').toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }

    return true;
  });

  const typeLabels: Record<Session['type'], string> = {
    positioning: 'Entretien IA (Qualiopi)',
    individual: 'Entretien IA (Individuel)',
    collective: 'Entretien IA (Collectif)',
    entry_self_assessment: "Auto-positionnement d'entrée",
    exit_assessment: 'Bilan de sortie'
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans text-slate-800">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm text-slate-800">Gestion des Sessions ({allSessions.length})</h2>
          {cleanMsg && <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">{cleanMsg}</span>}
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50 underline transition-colors"
          >
            {cleaning ? 'Nettoyage...' : 'Nettoyer sessions obsolètes'}
          </button>
        </div>
        
        <button
          onClick={openCreateModal}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Créer une session
        </button>
      </header>

      {/* Filter and Search Bar */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative max-w-xs w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Rechercher un apprenant..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Status */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', 'active', 'pending', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filterStatus === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {{ all: 'Tous statuts', active: 'En cours', pending: 'En attente', completed: 'Terminés' }[f]}
              </button>
            ))}
          </div>

          {/* Filter Type */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', 'conversation', 'entry_self_assessment', 'exit_assessment'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filterType === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {{ all: 'Tous types', conversation: 'Entretiens IA', entry_self_assessment: 'Entrée (Auto)', exit_assessment: 'Sortie (Bilan)' }[f]}
              </button>
            ))}
          </div>

          {/* Show Archived Toggle */}
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
              showArchived
                ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Voir les Actives' : 'Voir les Archives'}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full bg-slate-50/50">
            <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mb-4 text-indigo-500">
              <Archive className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-700">Aucune session trouvée</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Aucune session ne correspond à vos critères de recherche ou de filtre.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr>
                {['Apprenant', 'Type d\'évaluation', 'Questionnaire / Fiche', 'Statut', 'Créée le', 'Actions'].map(h => (
                  <th key={h} className="text-left px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const qName = questionnaires.find(q => q.id === s.questionnaireId)?.name;
                const eTempName = templates.find(t => t.id === s.entryTemplateId)?.name;
                const exTempName = templates.find(t => t.id === s.exitTemplateId)?.name;

                const isConv = ['individual', 'collective', 'positioning'].includes(s.type);

                return (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-slate-800">{s.userName || <span className="text-slate-400 italic">Anonyme</span>}</td>
                    <td className="px-6 py-3 text-slate-500 font-medium">{typeLabels[s.type]}</td>
                    <td className="px-6 py-3 text-slate-500 truncate max-w-[200px]">
                      {isConv ? (
                        qName ?? <span className="text-slate-300 italic">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {s.entryTemplateId && <span className="text-[10px]">Entrée : {eTempName || s.entryTemplateId}</span>}
                          {s.exitTemplateId && <span className="text-[10px]">Sortie : {exTempName || s.exitTemplateId}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-6 py-3 text-slate-400">
                      {new Date(s.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 flex items-center gap-3">
                      {isConv ? (
                        <button
                          onClick={() => navigate(`/admin/sessions/${s.id}`)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                        >
                          {s.status === 'completed' ? 'Exporter' : 'Suivre'}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/exit-assessment/${s.id}`)}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                          >
                            Bilan & Radar
                          </button>
                          <button
                            onClick={() => {
                              if (s.type === 'entry_self_assessment') {
                                window.open(`/admin/exit-assessment/${s.id}?print=true&tab=entry`, '_blank');
                                window.open(`/admin/exit-assessment/${s.id}?print=true&tab=exit`, '_blank');
                              } else {
                                window.open(`/admin/exit-assessment/${s.id}?print=true&tab=exit`, '_blank');
                              }
                            }}
                            className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                            title="Exporter en PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Links sharing modal trigger */}
                      {s.status !== 'completed' && (
                        <button
                          onClick={() => setQrSession(s)}
                          className="text-[11px] text-indigo-500 hover:text-indigo-700 underline font-medium"
                        >
                          Lien / QR
                        </button>
                      )}

                      {/* Edit (only if pending) */}
                      {s.status === 'pending' && (
                        <button
                          onClick={() => openEdit(s)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                        >
                          Modifier
                        </button>
                      )}

                      {/* Archive toggle */}
                      <button
                        onClick={async () => {
                          const nextState = !s.isArchived;
                          const msg = nextState 
                            ? `Archiver la session de "${s.userName || 'Anonyme'}" ?`
                            : `Restaurer la session de "${s.userName || 'Anonyme'}" ?`;
                          if (confirm(msg)) {
                            await updateSession(s.id, { isArchived: nextState });
                          }
                        }}
                        className="text-slate-400 hover:text-amber-600 transition-colors"
                        title={s.isArchived ? "Désarchiver" : "Archiver"}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(s)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sharing Links modal */}
      {qrSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setQrSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col items-center gap-4 border border-slate-100" onClick={e => e.stopPropagation()}>
            <div className="text-center w-full relative">
              <h3 className="font-bold text-sm text-slate-800 mb-1">Liens de session — {qrSession.userName}</h3>
              <p className="text-[10px] text-slate-400">Partagez les liens avec l'apprenant ou le formateur.</p>
              <button onClick={() => setQrSession(null)} className="absolute right-0 top-0 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`grid gap-6 w-full ${(['entry_self_assessment', 'exit_assessment'].includes(qrSession.type)) ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
              {/* Learner Link */}
              <div className="flex flex-col items-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Lien Apprenant</span>
                <QRCodePanel
                  url={
                    qrSession.type === 'entry_self_assessment'
                      ? `${window.location.origin}/entry-assessment/${qrSession.id}`
                      : `${window.location.origin}/s/${qrSession.id}`
                  }
                  size={120}
                  label="Scanner pour l'évaluation"
                />
                <button
                  onClick={() => {
                    const url = qrSession.type === 'entry_self_assessment'
                      ? `${window.location.origin}/entry-assessment/${qrSession.id}`
                      : `${window.location.origin}/s/${qrSession.id}`;
                    navigator.clipboard.writeText(url);
                    alert('Lien apprenant copié !');
                  }}
                  className="mt-3 text-[10px] px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors w-full"
                >
                  Copier le lien
                </button>
              </div>

              {/* Formateur Link */}
              {['entry_self_assessment', 'exit_assessment'].includes(qrSession.type) && (
                <div className="flex flex-col items-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                  <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-2">Lien Formateur</span>
                  <QRCodePanel
                    url={`${window.location.origin}/admin/exit-assessment/${qrSession.id}`}
                    size={120}
                    label="Scanner pour le bilan"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/admin/exit-assessment/${qrSession.id}`);
                      alert('Lien formateur copié !');
                    }}
                    className="mt-3 text-[10px] px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg transition-colors w-full"
                  >
                    Copier le lien
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100" onClick={e => e.stopPropagation()}>
            {!createdLink ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-sm">Nouvelle session</h3>
                  <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-4 mb-6">
                  {/* Learner name */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Prénom de l'apprenant</label>
                    <input
                      type="text"
                      value={learnerName}
                      onChange={e => setLearnerName(e.target.value)}
                      placeholder="Ex: Marie"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      autoFocus
                    />
                  </div>

                  {/* Category Selection */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Catégorie d'évaluation</label>
                    <select
                      value={creationCategory}
                      onChange={e => setCreationCategory(e.target.value as 'soutenance' | 'positionnement')}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="soutenance">1. Question de soutenance (Entretien IA)</option>
                      <option value="positionnement">2. Positionnement (Fiches Entrée & Sortie)</option>
                    </select>
                  </div>

                  {/* AI Questionnaire Selection for soutenance */}
                  {creationCategory === 'soutenance' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Questionnaire IA</label>
                      <select
                        value={selectedQId}
                        onChange={e => setSelectedQId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">Sélectionner un questionnaire...</option>
                        {questionnaires.map(q => (
                          <option key={q.id} value={q.id}>{q.name}{q.isActive ? ' (actif)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Template Title Selection for positionnement */}
                  {creationCategory === 'positionnement' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Titre des fiches (Auto-positionnement)</label>
                      <select
                        value={selectedTemplateTitle}
                        onChange={e => setSelectedTemplateTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">Sélectionner le titre...</option>
                        {Array.from(new Set(templates.filter(t => t.type === 'entry_self_assessment').map(t => t.name.trim()))).sort((a, b) => a.localeCompare(b)).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowModal(false)} className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50">Annuler</button>
                  <button
                    onClick={handleCreate}
                    disabled={
                      creating || 
                      !learnerName.trim() || 
                      (creationCategory === 'soutenance' && !selectedQId) ||
                      (creationCategory === 'positionnement' && !selectedTemplateTitle)
                    }
                    className="flex-1 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40 shadow-sm active:scale-95"
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="w-10 h-10 bg-green-50 border border-green-100 rounded-full flex items-center justify-center text-green-500 text-lg">✓</div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Session créée</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Partagez ces accès avec l'apprenant.</p>
                </div>
                
                <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center gap-3">
                  <QRCodePanel url={createdLink} size={130} />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdLink);
                      alert('Lien d\'accès copié !');
                    }}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                  >
                    Copier le lien
                  </button>
                </div>
                
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-1">Modifier la session</h3>
            <p className="text-[10px] text-slate-400 mb-5">Apprenant : <strong>{editSession.userName}</strong> · Type : {typeLabels[editSession.type]}</p>
            
            <div className="space-y-4 mb-6">
              {/* Questionnaires Edit */}
              {['individual', 'collective', 'positioning'].includes(editSession.type) && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Questionnaire IA</label>
                  <select
                    value={editQId}
                    onChange={e => setEditQId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Sélectionner...</option>
                    {questionnaires.map(q => (
                      <option key={q.id} value={q.id}>{q.name}{q.isActive ? ' (actif)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Templates Edit */}
              {editSession.type === 'entry_self_assessment' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Gabarit d'Auto-positionnement (Entrée)</label>
                  <select
                    value={editEntryId}
                    onChange={e => setEditEntryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Sélectionner...</option>
                    {templates.filter(t => t.type === 'entry_self_assessment').map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {['entry_self_assessment', 'exit_assessment'].includes(editSession.type) && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Gabarit de Bilan de Sortie (Formateur)</label>
                  <select
                    value={editExitId}
                    onChange={e => setEditExitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Sélectionner...</option>
                    {templates.filter(t => t.type === 'exit_assessment').map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditSession(null)} className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50">Annuler</button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40 shadow-sm active:scale-95"
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
