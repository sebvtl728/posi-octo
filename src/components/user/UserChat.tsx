import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { subscribeToSession, subscribeToMessages, updateSession, addMessage } from '../../lib/sessions';
import { getQuestionnaireById } from '../../lib/questionnaire';
import { chatWithMistral } from '../../lib/mistral';
import QRCodePanel from '../shared/QRCodePanel';
import type { Session, Message, QuestionnaireData } from '../../types';

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UserChat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submittingName, setSubmittingName] = useState(false);
  const welcomeTriggeredRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    const unsubSession = subscribeToSession(sessionId, setSession);
    const unsubMessages = subscribeToMessages(sessionId, setMessages);
    return () => { unsubSession(); unsubMessages(); };
  }, [sessionId]);

  useEffect(() => {
    if (session?.questionnaireId) {
      getQuestionnaireById(session.questionnaireId).then(q => {
        if (q) setQuestionnaire(JSON.parse(q.content) as QuestionnaireData);
      });
    }
  }, [session?.questionnaireId]);

  // Auto-welcome for collective sessions that are already active
  useEffect(() => {
    if (
      !welcomeTriggeredRef.current &&
      session?.status === 'active' &&
      session?.type === 'collective' &&
      messages.length === 0 &&
      questionnaire
    ) {
      welcomeTriggeredRef.current = true;
      triggerWelcome(session.userName);
    }
  }, [session, messages, questionnaire]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const [welcomeError, setWelcomeError] = useState('');

  const buildSystemPrompt = (userName: string): string => {
    if (session?.type === 'positioning') {
      return `Tu es TypBot, un assistant de positionnement Qualiopi. Avant la formation "${questionnaire?.title}", tu conduis un entretien de positionnement individuel avec ${userName} pour évaluer son niveau initial et identifier ses besoins, conformément aux indicateurs I5, I6 et I9 du référentiel Qualiopi 2021.

Explore avec bienveillance, en posant UNE question à la fois :
- Ses acquis et connaissances actuelles dans les domaines abordés (I5)
- Ses attentes et objectifs vis-à-vis de la formation (I5)
- Ses éventuels besoins spécifiques : situation de handicap, contraintes, rythme d'apprentissage (I6)
- Son contexte professionnel et sa motivation

Domaines à explorer : ${JSON.stringify(questionnaire?.categories?.map((c: { name: string }) => c.name))}.

Sois chaleureux, professionnel et rassurant. À la fin, annonce que l'entretien est terminé et que le formateur recevra un compte-rendu personnalisé.`;
    }
    return `Tu es TypBot, un assistant IA qui guide des utilisateurs à travers un questionnaire interactif. Le questionnaire s'appelle "${questionnaire?.title}". Voici les catégories et questions:\n\n${JSON.stringify(questionnaire?.categories, null, 2)}\n\nSois bienveillant, encourageant et guide l'utilisateur à travers chaque question du questionnaire.`;
  };

  const triggerWelcome = async (userName: string) => {
    if (!sessionId || !questionnaire) return;
    setSending(true);
    setWelcomeError('');
    try {
      const systemPrompt = buildSystemPrompt(userName);
      const history: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      const welcomeContent = session?.type === 'positioning'
        ? `L'apprenant s'appelle ${userName}. Présente-toi, explique brièvement le but de cet entretien de positionnement Qualiopi, rassure ${userName} que ce n'est pas un examen, puis commence par explorer son contexte et ses acquis actuels.`
        : `L'utilisateur s'appelle ${userName}. Lance le questionnaire en te présentant, en souhaitant la bienvenue à ${userName}, puis pose la première question du questionnaire.`;
      const welcomeMsg = await chatWithMistral([
        ...history,
        { role: 'user', content: welcomeContent },
      ]);
      await addMessage(sessionId, 'assistant', welcomeMsg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion à l\'IA.';
      setWelcomeError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleStart = async () => {
    if (!nameInput.trim() || !sessionId) return;
    setSubmittingName(true);
    try {
      await updateSession(sessionId, { userName: nameInput.trim(), status: 'active' });
      await triggerWelcome(nameInput.trim());
    } finally {
      setSubmittingName(false);
    }
  };

  const [sendError, setSendError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  // Extrait les options numérotées du dernier message IA (ex: "1. Oui\n2. Non")
  const quickReplies = (() => {
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (!last) return null;
    const lines = last.content.split('\n')
      .map(l => l.trim())
      .filter(l => /^\d+[.)]\s+\S/.test(l))
      .map(l => l.replace(/^\d+[.)]\s+/, '').trim())
      .filter(l => l.length > 0 && l.length <= 80);
    return lines.length >= 2 && lines.length <= 6 ? lines : null;
  })();

  const handleSend = async (content: string) => {
    if (!sessionId || !content.trim() || sending || !questionnaire) return;
    setSending(true);
    setSendError('');
    const userContent = content.trim();
    setInput('');
    try {
      await addMessage(sessionId, 'user', userContent);
      const history: Array<{ role: string; content: string }> = [
        { role: 'system', content: buildSystemPrompt(session?.userName ?? '') },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
      ];
      const reply = await chatWithMistral(history);
      await addMessage(sessionId, 'assistant', reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion à l\'IA.';
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  // Loading state
  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm">
        Chargement...
      </div>
    );
  }

  // Name entry screen (individual sessions pending)
  if (session.status === 'pending') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mb-5 mx-auto">
            <div className="w-4 h-4 bg-indigo-500 rounded-full" />
          </div>
          <h1 className="text-lg font-bold text-center text-slate-800 mb-1">Bienvenue</h1>
          <p className="text-xs text-slate-400 text-center mb-6">Entrez votre prénom pour commencer</p>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Votre prénom..."
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
            autoFocus
          />
          <button
            onClick={handleStart}
            disabled={submittingName || !nameInput.trim()}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submittingName ? 'Démarrage...' : 'Commencer'}
          </button>
        </div>
      </div>
    );
  }

  // Session completed
  if (session.status === 'completed') {
    const isPositioning = session.type === 'positioning';
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="text-2xl">✓</div>
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">
            {isPositioning ? 'Entretien de positionnement terminé' : 'Session terminée'}
          </h1>
          <p className="text-sm text-slate-500">
            {isPositioning
              ? `Merci ${session.userName}, votre entretien est terminé. Votre formateur recevra un compte-rendu personnalisé.`
              : `Merci ${session.userName}, votre session est terminée.`}
          </p>
        </div>
      </div>
    );
  }

  // Active chat interface
  const sessionUrl = `${window.location.origin}/s/${sessionId}`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shrink-0">
          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">Posi-octo</div>
            <div className="text-[10px] text-slate-400">Bonjour {session.userName} ·  <span className="text-green-500">● En ligne</span></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id ?? i} className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {isUser ? (
                    msg.content
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {sending && <TypingIndicator />}
          {(welcomeError || sendError) && (
            <div className="flex justify-center mb-3">
              <div className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-xl max-w-[80%] text-center">
                {welcomeError || sendError}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Chips de réponse rapide — mobile uniquement, si le dernier message contient des options numérotées */}
        {quickReplies && !sending && (
          <div className="sm:hidden px-4 pb-2 bg-white border-t border-slate-100 flex flex-wrap gap-2 pt-2">
            {quickReplies.map((option, i) => (
              <button
                key={i}
                onClick={() => handleSend(option)}
                className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-medium active:bg-indigo-100 transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-slate-200 bg-white pb-safe">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => { setInput(e.target.value); resizeTextarea(); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                }
              }}
              placeholder="Votre réponse…"
              disabled={sending}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 resize-none leading-snug"
            />
            <button
              onClick={() => {
                handleSend(input);
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
              }}
              disabled={sending || !input.trim()}
              className="px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      {/* Panneau QR — visible uniquement sur desktop */}
      <div className="hidden md:flex w-52 shrink-0 bg-white border-l border-slate-200 flex-col items-center justify-center p-5 gap-3">
        <p className="text-[10px] text-slate-400 text-center font-medium">Reprendre sur mobile</p>
        <QRCodePanel url={sessionUrl} size={120} label="" />
        <p className="text-[10px] text-slate-300 text-center break-all">{sessionUrl}</p>
      </div>
    </div>
  );
}
