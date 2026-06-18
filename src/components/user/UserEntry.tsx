import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { createSession } from '../../lib/sessions';
import QRCodePanel from '../shared/QRCodePanel';
import type { QuestionnaireData } from '../../types';

export default function UserEntry() {
  const { questionnaireId } = useParams<{ questionnaireId: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const pageUrl = window.location.href;

  useEffect(() => {
    if (!questionnaireId) return;
    getQuestionnaireById(questionnaireId).then(q => {
      if (!q) {
        setNotFound(true);
        return;
      }
      try {
        const parsed = JSON.parse(q.content) as QuestionnaireData;
        setTitle(parsed.title);
        setDescription(`${parsed.categories.length} catégorie${parsed.categories.length > 1 ? 's' : ''} · ${parsed.categories.reduce((s, c) => s + c.questions.length, 0)} questions`);
      } catch {
        setTitle(q.name);
      }
    });
  }, [questionnaireId]);

  const handleStart = async () => {
    if (!nameInput.trim() || !questionnaireId) return;
    setLoading(true);
    setError('');
    try {
      const sessionId = await createSession(questionnaireId, 'collective', nameInput.trim(), 'active');
      navigate(`/s/${sessionId}`);
    } catch {
      setError('Impossible de créer la session. Vérifiez votre connexion.');
      setLoading(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800 mb-2">Questionnaire introuvable</h1>
          <p className="text-sm text-slate-500">Ce lien n'est plus valide. Contactez l'organisateur.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
        {/* Icon */}
        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <div className="w-5 h-5 bg-indigo-500 rounded-lg" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-center text-slate-800 mb-1">
          {title || 'Chargement...'}
        </h1>
        {description && (
          <p className="text-xs text-slate-400 text-center mb-6">{description}</p>
        )}

        {/* QR Code — masqué sur mobile (on y est déjà) */}
        <div className="hidden sm:flex justify-center mb-6">
          <QRCodePanel url={pageUrl} size={140} label="Partagez ce QR code" />
        </div>

        {/* Name input */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">Votre prénom</label>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Ex : Sophie"
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
            disabled={loading}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleStart}
            disabled={loading || !nameInput.trim()}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Démarrage...' : 'Commencer'}
          </button>
        </div>
      </div>
    </div>
  );
}
