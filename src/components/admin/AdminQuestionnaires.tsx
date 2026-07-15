import { useState, useEffect, useRef } from 'react';
import { Paperclip, FolderPlus, X, Trash2, Pencil, Upload, AlertCircle } from 'lucide-react';
import {
  subscribeToQuestionnaires,
  addQuestionnaire,
  validateQuestionnaireJSON,
  updateQuestionnaire,
  deleteQuestionnaire,
} from '../../lib/questionnaire';
import { subscribeToFolders, addFolder, deleteFolder } from '../../lib/folders';
import type { Questionnaire, Folder } from '../../types';

type Category = { name: string; questions: { question: string }[] };

function PreviewModal({
  name,
  categories,
  parseError,
  onClose,
}: {
  name: string;
  categories: Category[];
  parseError: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const cat = categories[activeTab];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-0 shrink-0">
          <h3 className="font-bold text-base mb-3">{name}</h3>
          {parseError ? null : (
            <div className="flex gap-1 overflow-x-auto pb-3 border-b border-slate-100">
              {categories.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => setActiveTab(i)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {parseError ? (
            <p className="text-sm text-red-500">JSON invalide.</p>
          ) : cat ? (
            <>
              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">
                {cat.questions.length} question{cat.questions.length !== 1 ? 's' : ''}
              </div>
              <ul className="space-y-2">
                {cat.questions.map((q, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-600">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {typeof q === 'string' ? q : (q.question || (q as any).title || '')}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="px-6 pb-5 shrink-0">
          <button onClick={onClose} className="text-xs text-slate-400 hover:underline">Fermer</button>
        </div>
      </div>
    </div>
  );
}

function FolderInput({
  placeholder,
  onConfirm,
  onCancel,
}: {
  placeholder: string;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const handleConfirm = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setErr('');
    try {
      await onConfirm(name.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur lors de la création.');
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          ref={ref}
          value={name}
          onChange={e => { setName(e.target.value); setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel(); }}
          placeholder={placeholder}
          className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36"
        />
        <button
          onClick={handleConfirm}
          disabled={!name.trim() || creating}
          className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
        >
          {creating ? '...' : 'OK'}
        </button>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {err && <p className="text-[10px] text-red-500">{err}</p>}
    </div>
  );
}

export default function AdminQuestionnaires() {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState<Questionnaire | null>(null);

  // Editing state variables
  const [editQuestionnaire, setEditQuestionnaire] = useState<Questionnaire | null>(null);
  const [editName, setEditName] = useState('');
  const [editFileContent, setEditFileContent] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Navigation dossiers
  const [folderFilter, setFolderFilter] = useState<string>('all'); // 'all' | 'none' | folderId (root)
  const [subFolderFilter, setSubFolderFilter] = useState<string>('all'); // 'all' | subfolderId

  // Création dossier / sous-dossier
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewSubFolder, setShowNewSubFolder] = useState(false);

  useEffect(() => {
    const unsubQ = subscribeToQuestionnaires(qs =>
      setQuestionnaires([...qs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    );
    const unsubF = subscribeToFolders(fs =>
      setFolders([...fs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    );
    return () => { unsubQ(); unsubF(); };
  }, []);

  // Reset sous-dossier quand on change de dossier parent
  useEffect(() => { setSubFolderFilter('all'); setShowNewSubFolder(false); }, [folderFilter]);

  const rootFolders = folders.filter(f => !f.parentId);
  const subFolders = (id: string) => folders.filter(f => f.parentId === id);
  const activeRootFolder = rootFolders.find(f => f.id === folderFilter);

  const handleFileUpload = async (file: File) => {
    setError('');
    setSuccess('');
    if (!file.name.endsWith('.json')) { setError('Veuillez importer un fichier .json'); return; }
    const content = await file.text();
    try {
      validateQuestionnaireJSON(content);
      await addQuestionnaire(file.name.replace('.json', ''), content);
      setSuccess(`"${file.name.replace('.json', '')}" importé avec succès.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'JSON invalide.');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    const subs = subFolders(id);
    const affectedIds = [id, ...subs.map(s => s.id)];
    const msg = subs.length > 0
      ? `Supprimer ce dossier et ses ${subs.length} sous-dossier(s) ? Les questionnaires seront déplacés dans "Sans dossier".`
      : 'Supprimer ce dossier ? Les questionnaires qu\'il contient seront déplacés dans "Sans dossier".';
    if (!window.confirm(msg)) return;
    await Promise.all(affectedIds.map(fid => deleteFolder(fid)));
    const toUpdate = questionnaires.filter(q => q.folderId && affectedIds.includes(q.folderId));
    await Promise.all(toUpdate.map(q => updateQuestionnaire(q.id, { folderId: undefined })));
    if (folderFilter === id) setFolderFilter('all');
  };

  const handleDeleteSubFolder = async (id: string) => {
    if (!window.confirm('Supprimer ce sous-dossier ? Les questionnaires qu\'il contient seront déplacés dans "Sans dossier".')) return;
    await deleteFolder(id);
    const toUpdate = questionnaires.filter(q => q.folderId === id);
    await Promise.all(toUpdate.map(q => updateQuestionnaire(q.id, { folderId: undefined })));
    if (subFolderFilter === id) setSubFolderFilter('all');
  };

  const handleFolderAssign = async (questionnaireId: string, folderId: string) => {
    await updateQuestionnaire(questionnaireId, { folderId: folderId || undefined });
  };

  const handleToggleActive = async (q: Questionnaire) => {
    const nextState = !q.isActive;
    try {
      if (nextState) {
        // Set all others to false
        await Promise.all(questionnaires.map(item => {
          if (item.id !== q.id && item.isActive) {
            return updateQuestionnaire(item.id, { isActive: false });
          }
          return Promise.resolve();
        }));
      }
      await updateQuestionnaire(q.id, { isActive: nextState });
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la modification de l\'activation.');
    }
  };

  const handleDeleteQuestionnaire = async (q: Questionnaire) => {
    if (!window.confirm(`Supprimer définitivement le questionnaire "${q.name}" ?`)) return;
    try {
      await deleteQuestionnaire(q.id);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la suppression du questionnaire.');
    }
  };

  const openEdit = (q: Questionnaire) => {
    setEditQuestionnaire(q);
    setEditName(q.name);
    setEditFileContent('');
    setEditFileName('');
    setEditError('');
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setEditError('Veuillez sélectionner un fichier .json uniquement.');
      return;
    }

    setEditFileName(file.name);
    setEditError('');

    try {
      const content = await file.text();
      validateQuestionnaireJSON(content);
      setEditFileContent(content);
    } catch (err: any) {
      setEditError(err.message || 'JSON invalide.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editQuestionnaire || !editName.trim()) {
      setEditError('Le nom ne peut pas être vide.');
      return;
    }

    setSaving(true);
    setEditError('');

    try {
      const updates: Partial<Questionnaire> = {
        name: editName.trim(),
      };
      if (editFileContent) {
        updates.content = editFileContent;
        const parsed = validateQuestionnaireJSON(editFileContent);
        updates.categoriesCount = parsed.categories.length;
        updates.questionsCount = parsed.categories.reduce((sum, c) => sum + c.questions.length, 0);
      }
      await updateQuestionnaire(editQuestionnaire.id, updates);
      setEditQuestionnaire(null);
    } catch (err: any) {
      setEditError(err.message || 'Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = questionnaires.filter(q => {
    if (folderFilter === 'none') return !q.folderId;
    if (folderFilter === 'all') return true;
    // Un dossier racine est sélectionné
    if (subFolderFilter !== 'all') return q.folderId === subFolderFilter;
    // Montrer les questionnaires du dossier ET de ses sous-dossiers
    const subIds = subFolders(folderFilter).map(s => s.id);
    return q.folderId === folderFilter || subIds.includes(q.folderId ?? '');
  });

  // Liste hiérarchique pour le sélecteur de dossier sur chaque carte
  const folderOptions = rootFolders.flatMap(f => [
    { id: f.id, label: f.name },
    ...subFolders(f.id).map(s => ({ id: s.id, label: `  └ ${s.name}` })),
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <h2 className="font-semibold text-sm text-slate-800">Soutenances</h2>
        <label className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-indigo-700 transition-colors">
          + Importer un JSON
          <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}
        {success && <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-xl border border-green-100">{success}</div>}

        {/* Ligne 1 — Dossiers racine */}
        <div className="flex items-center gap-1 flex-wrap mb-2">
          <button
            onClick={() => setFolderFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${folderFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Tous
          </button>
          <button
            onClick={() => setFolderFilter('none')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${folderFilter === 'none' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Sans dossier
          </button>
          {rootFolders.map(f => (
            <div key={f.id} className={`flex items-center gap-0.5 rounded-lg text-xs font-medium ${folderFilter === f.id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <button onClick={() => setFolderFilter(f.id)} className="px-3 py-1.5">{f.name}</button>
              <button onClick={() => handleDeleteFolder(f.id)} className="pr-2 pl-0.5 py-1.5 hover:text-red-400 transition-colors" title="Supprimer">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {showNewFolder ? (
            <FolderInput
              placeholder="Nom du dossier"
              onConfirm={async name => { await addFolder(name); setShowNewFolder(false); }}
              onCancel={() => setShowNewFolder(false)}
            />
          ) : (
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-200 transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Nouveau dossier
            </button>
          )}
        </div>

        {/* Ligne 2 — Sous-dossiers (visible quand un dossier racine est sélectionné) */}
        {activeRootFolder && (
          <div className="flex items-center gap-1 flex-wrap mb-5 pl-4 border-l-2 border-slate-200">
            <span className="text-[10px] text-slate-400 font-medium mr-1">Dans {activeRootFolder.name} :</span>
            <button
              onClick={() => setSubFolderFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${subFolderFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Tous
            </button>
            {subFolders(activeRootFolder.id).map(s => (
              <div key={s.id} className={`flex items-center gap-0.5 rounded-lg text-xs font-medium ${subFolderFilter === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <button onClick={() => setSubFolderFilter(s.id)} className="px-2.5 py-1">{s.name}</button>
                <button onClick={() => handleDeleteSubFolder(s.id)} className="pr-2 pl-0.5 py-1 hover:text-red-400 transition-colors" title="Supprimer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {showNewSubFolder ? (
              <FolderInput
                placeholder="Nom du sous-dossier"
                onConfirm={async name => { await addFolder(name, activeRootFolder.id); setShowNewSubFolder(false); }}
                onCancel={() => setShowNewSubFolder(false)}
              />
            ) : (
              <button
                onClick={() => setShowNewSubFolder(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-500 hover:bg-indigo-50 border border-dashed border-indigo-200 transition-colors"
              >
                <FolderPlus className="w-3 h-3" />
                Nouveau sous-dossier
              </button>
            )}
          </div>
        )}

        {!activeRootFolder && <div className="mb-5" />}

        {/* Liste questionnaires */}
        <div className="mb-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-8">
              {questionnaires.length === 0 ? 'Aucun questionnaire importé.' : 'Aucun questionnaire dans cette sélection.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(q => (
                <div key={q.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => handleToggleActive(q)}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${
                          q.isActive
                            ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                        }`}
                        title={q.isActive ? 'Questionnaire actif par défaut' : 'Définir comme questionnaire actif'}
                      >
                        {q.isActive ? '★ Actif' : '☆ Définir actif'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(q)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                          title="Modifier le questionnaire"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestionnaire(q)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          title="Supprimer le questionnaire"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-bold text-sm text-slate-800 mb-1 line-clamp-2" title={q.name}>{q.name}</h3>
                    <p className="text-[10px] text-slate-400 mb-4">
                      Importé le {new Date(q.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                    <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50 mb-4">
                      <div>📁 <span className="font-semibold">{q.categoriesCount}</span> catégories</div>
                      <div>❓ <span className="font-semibold">{q.questionsCount}</span> questions</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                    {/* Folder Selection */}
                    {folderOptions.length > 0 && (
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-400 shrink-0">Dossier :</span>
                        <select
                          value={q.folderId ?? ''}
                          onChange={e => handleFolderAssign(q.id, e.target.value)}
                          className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer w-full text-right"
                        >
                          <option value="">Sans dossier</option>
                          {folderOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Action buttons */}
                    <button
                      onClick={() => setPreview(q)}
                      className="w-full py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors text-center"
                    >
                      Aperçu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zone drag & drop */}
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-10 cursor-pointer hover:bg-slate-50 transition-colors text-slate-400">
          <Paperclip className="w-6 h-6" />
          <span className="text-sm">Glissez un fichier JSON ou cliquez pour importer</span>
          <span className="text-xs">Format requis : title + categories[].name + categories[].questions[]</span>
          <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>

      {/* Modale aperçu */}
      {preview && (() => {
        let categories: Category[] = [];
        let parseError = false;
        try { categories = JSON.parse(preview.content).categories ?? []; } catch { parseError = true; }
        return <PreviewModal name={preview.name} categories={categories} parseError={parseError} onClose={() => setPreview(null)} />;
      })()}

      {/* Edit Modal */}
      {editQuestionnaire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditQuestionnaire(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-sm">Modifier la soutenance</h3>
              <button onClick={() => setEditQuestionnaire(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mb-5">
              Modifiez le nom ou importez un nouveau fichier JSON de questions pour remplacer la soutenance actuelle.
            </p>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Nom de la soutenance</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Ex: Titre de soutenance"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Remplacer les questions (Optionnel)</label>
                <label className="w-full flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-2" />
                  <span className="text-xs text-slate-600 font-medium">
                    {editFileName ? editFileName : 'Choisir un nouveau fichier .json'}
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleEditFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-red-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditQuestionnaire(null)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold">Annuler</button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
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
