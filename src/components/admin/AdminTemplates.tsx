import { useState, useEffect } from 'react';
import { subscribeToTemplates, addTemplate, deleteTemplate } from '../../lib/templates';
import type { HTMLTemplate } from '../../types';
import { Upload, Trash2, FileText, Check, Plus, AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<HTMLTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload fields
  const [name, setName] = useState('');
  const [type, setType] = useState<HTMLTemplate['type']>('entry_self_assessment');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    return subscribeToTemplates(
      (ts) => {
        setTemplates(ts);
        setLoading(false);
        setGlobalError('');
      },
      (err) => {
        console.error(err);
        setGlobalError("Permissions insuffisantes ou erreur lors de l'accès aux fiches sur Firestore.");
        setLoading(false);
      }
    );
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html')) {
      setError('Veuillez sélectionner un fichier au format .html uniquement.');
      return;
    }

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFileContent(event.target.result as string);
        if (!name) {
          // Use filename without extension as default template name
          setName(file.name.replace('.html', ''));
        }
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!name.trim() || !fileContent) {
      setError('Veuillez remplir tous les champs et sélectionner un fichier.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      await addTemplate(name.trim(), fileContent, type);
      setShowUploadModal(false);
      setName('');
      setFileContent('');
      setFileName('');
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue lors de l\'envoi.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette fiche ?')) return;
    try {
      await deleteTemplate(id);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="font-semibold text-sm text-slate-800">Bibliothèque de Fiches</h2>
          <p className="text-[10px] text-slate-400">Gérez vos gabarits de fiches HTML personnalisés</p>
        </div>
        <button
          onClick={() => {
            setName('');
            setFileContent('');
            setFileName('');
            setError('');
            setShowUploadModal(true);
          }}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Importer une fiche (.html)
        </button>
      </header>

      {globalError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <div>
            <strong className="block font-bold mb-0.5">Erreur d'accès à la base de données</strong>
            <span>{globalError}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Aucune fiche dans votre bibliothèque</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Importez des fichiers HTML contenant vos fiches d'évaluation pour pouvoir les affecter lors de la création d'une session.
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors"
          >
            + Importer un fichier
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      t.type === 'entry_self_assessment'
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {t.type === 'entry_self_assessment' ? 'Auto-positionnement' : 'Bilan de sortie'}
                    </span>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      title="Supprimer la fiche"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="font-bold text-sm text-slate-800 mb-1">{t.name}</h3>
                  <p className="text-[10px] text-slate-400">
                    Importée le {new Date(t.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-[10px] text-slate-500">
                  <span className="font-mono">{(t.htmlContent.length / 1024).toFixed(1)} KB</span>
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-green-500" /> Prêt à l'usage
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-1">Importer un gabarit HTML</h3>
            <p className="text-[10px] text-slate-400 mb-5">
              Le fichier doit être une page HTML valide contenant les champs de formulaire nécessaires.
            </p>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Nom de la fiche</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Bilan Compétences C1-C6"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Rôle de la fiche</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as HTMLTemplate['type'])}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="entry_self_assessment">Fiche d'Auto-positionnement (Apprenant)</option>
                  <option value="exit_assessment">Bilan de sortie (Formateur)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Sélectionner le fichier</label>
                <label className="w-full flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-2" />
                  <span className="text-xs text-slate-600 font-medium">
                    {fileName ? fileName : 'Choisir un fichier .html'}
                  </span>
                  <input
                    type="file"
                    accept=".html"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-red-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowUploadModal(false)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold">Annuler</button>
              <button
                onClick={handleUpload}
                disabled={uploading || !fileContent}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                {uploading ? 'Importation...' : 'Importer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
