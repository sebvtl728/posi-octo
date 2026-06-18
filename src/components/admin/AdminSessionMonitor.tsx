import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { subscribeToSession, subscribeToMessages, updateSession, getMessages } from '../../lib/sessions';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { computeScores, computeSynthesis, computePositioningSynthesis, generateExportHTML, generatePositioningHTML, downloadHTML } from '../../lib/export';
import { buildPdfFilename, generatePdfBlob, uploadPdfBlob } from '../../lib/nextcloud';
import type { Session, Message, Questionnaire } from '../../types';

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function AdminSessionMonitor() {
  const { sessionId: id } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backUrl: string = (location.state as { from?: string } | null)?.from ?? '/admin/sessions';
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [exportStep, setExportStep] = useState<'' | 'scores' | 'synthesis' | 'pdf' | 'nextcloud' | 'done'>('');
  const [exportError, setExportError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const unsubSession = subscribeToSession(id, setSession);
    const unsubMessages = subscribeToMessages(id, setMessages);
    return () => { unsubSession(); unsubMessages(); };
  }, [id]);

  const [questionnaireError, setQuestionnaireError] = useState('');

  useEffect(() => {
    if (!session) return;
    if (!session.questionnaireId) {
      setQuestionnaireError(`questionnaireId manquant dans la session. Champs : ${Object.keys(session).join(', ')}`);
      return;
    }
    getQuestionnaireById(session.questionnaireId)
      .then(q => {
        if (!q) setQuestionnaireError(`Questionnaire introuvable (ID: "${session.questionnaireId}")`);
        else setQuestionnaire(q);
      })
      .catch((err: unknown) => {
        setQuestionnaireError(err instanceof Error ? err.message : 'Erreur chargement questionnaire');
      });
  }, [session?.questionnaireId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClose = async () => {
    if (!id || !session) return;
    setClosing(true);
    setCloseError('');
    try {
      await updateSession(id, { status: 'completed', completedAt: new Date().toISOString() });
    } catch (err: unknown) {
      setCloseError(err instanceof Error ? err.message : 'Erreur lors de la clôture.');
    } finally {
      setClosing(false);
    }
  };

  const handleExport = async () => {
    if (exportStep !== '') return;
    setExportStep('scores');
    setExportError('');
    if (!id || !session || !questionnaire) {
      setExportError(!questionnaire ? 'Questionnaire non chargé — ' + (questionnaireError || 'rechargez la page.') : 'Données manquantes.');
      setExportStep('');
      return;
    }
    try {
      const allMessages = await getMessages(id);
      const parsed = JSON.parse(questionnaire.content) as { title: string };
      const scores = await computeScores(allMessages, JSON.parse(questionnaire.content));
      await updateSession(id, { scores });

      setExportStep('synthesis');
      let synthesis: string;
      let html: string;
      const pdfFilename = buildPdfFilename(session.userName || id, session.createdAt, parsed.title);

      if (session.type === 'positioning') {
        synthesis = await computePositioningSynthesis(session, allMessages);
        html = generatePositioningHTML(session, allMessages, scores, synthesis, parsed.title);
        downloadHTML(html, `positionnement-${session.userName || id}-${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.html`);
      } else {
        synthesis = await computeSynthesis(session, allMessages, scores);
        html = generateExportHTML(session, allMessages, scores, synthesis, parsed.title);
        downloadHTML(html, `session-${session.userName || id}-${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.html`);
      }

      setExportStep('pdf');
      const pdfBlob = await generatePdfBlob(session, allMessages, scores, synthesis, parsed.title);

      setExportStep('nextcloud');
      await uploadPdfBlob(pdfBlob, pdfFilename);

      setExportStep('done');
      setTimeout(() => setExportStep(''), 3000);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Erreur lors de l\'export.');
      setExportStep('');
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Chargement de la session...
      </div>
    );
  }

  const duration = session.completedAt
    ? Math.round((new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime()) / 60000)
    : Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60000);

  const statusColors: Record<Session['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const statusLabels: Record<Session['status'], string> = {
    pending: 'En attente',
    active: '● Actif',
    completed: 'Terminé',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-4 px-6 shrink-0">
        <button onClick={() => navigate(backUrl)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          ← Retour
        </button>
        <h2 className="font-semibold text-sm text-slate-800 truncate">
          Session — {session.userName || <span className="text-slate-400 italic">Anonyme</span>}
        </h2>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ml-auto ${statusColors[session.status]}`}>
          {statusLabels[session.status]}
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat transcript */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 && (
              <p className="text-center text-slate-400 italic text-sm mt-8">Aucun message pour l'instant.</p>
            )}
            {messages.map((msg, i) => (
              <ChatBubble key={msg.id ?? i} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="px-6 py-2 border-t border-slate-200 bg-white text-[10px] text-slate-400 text-right">
            {messages.length} message{messages.length !== 1 ? 's' : ''} · Lecture seule
          </div>
        </div>

        {/* Info panel */}
        <aside className="w-64 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto">
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Informations</div>
              {questionnaireError && (
                <div className="text-[10px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mb-2 break-all">
                  {questionnaireError}
                </div>
              )}
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Utilisateur</dt>
                  <dd className="font-medium">{session.userName || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="font-medium">{session.type === 'individual' ? 'Individuel' : 'Collectif'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Durée</dt>
                  <dd className="font-medium">{duration} min</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Messages</dt>
                  <dd className="font-medium">{messages.length}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 shrink-0">Q. ID</dt>
                  <dd className="font-mono text-[9px] text-slate-400 truncate">{session.questionnaireId || '⚠ manquant'}</dd>
                </div>
              </dl>
            </div>

            {questionnaire && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Questionnaire</div>
                <p className="text-xs font-medium text-slate-700">{questionnaire.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {questionnaire.categoriesCount} catégories · {questionnaire.questionsCount} questions
                </p>
              </div>
            )}

            {session.scores && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Scores</div>
                <div className="space-y-1.5">
                  {Object.entries(session.scores).map(([cat, score]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-600 truncate">{cat}</span>
                        <span className="font-bold text-indigo-600">{score}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto p-5 border-t border-slate-100 space-y-2">
            {closeError && (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 break-words">
                {closeError}
              </div>
            )}
            {exportError && (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 break-words">
                {exportError}
              </div>
            )}
            {exportStep === 'done' && (
              <div className="px-3 py-2 bg-green-50 border border-green-100 rounded-xl text-[10px] text-green-700 text-center">
                ✓ PDF archivé dans Nextcloud
              </div>
            )}
            {session.status !== 'completed' && (
              <button
                onClick={handleClose}
                disabled={closing}
                className="w-full px-3 py-2.5 border border-red-200 text-red-600 rounded-xl text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {closing ? 'Clôture...' : 'Clore la session'}
              </button>
            )}
            {session.status === 'completed' && (
              <button
                onClick={handleExport}
                disabled={exportStep !== ''}
                className="w-full px-3 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {exportStep === '' && 'Exporter & archiver'}
                {exportStep === 'scores' && 'Calcul des scores…'}
                {exportStep === 'synthesis' && 'Génération synthèse…'}
                {exportStep === 'pdf' && 'Création PDF…'}
                {exportStep === 'nextcloud' && 'Envoi Nextcloud…'}
                {exportStep === 'done' && '✓ Archivé'}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
