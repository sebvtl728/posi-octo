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

  useEffect(() => {
    setSelectedOptions([]);
  }, [messages]);

  const [welcomeError, setWelcomeError] = useState('');

  const buildSystemPrompt = (userName: string): string => {
    const strictRules = `

Règles absolues — tu dois les respecter sans exception :
- Pose UNE seule question par message. Jamais deux.
- N'avance JAMAIS vers la question suivante sans avoir reçu une réponse explicite de l'utilisateur dans ce chat.
- Ne réponds JAMAIS à une question à la place de l'utilisateur, même à titre d'exemple ou d'illustration.
- Ne révèle jamais les réponses attendues ou correctes.
- N'inclus aucun indice, suggestion orientée ou exemple de réponse dans tes messages.
- Si l'utilisateur n'a pas encore répondu, attends. Ne continue pas.`;

    if (session?.type === 'positioning') {
      return `Tu es TypBot, un assistant de positionnement Qualiopi. Avant la formation "${questionnaire?.title}", tu conduis un entretien de positionnement individuel avec ${userName} pour évaluer son niveau initial et identifier ses besoins, conformément aux indicateurs I5, I6 et I9 du référentiel Qualiopi 2021.

Explore avec bienveillance, en posant UNE question à la fois :
- Ses acquis et connaissances actuelles dans les domaines abordés (I5)
- Ses attentes et objectifs vis-à-vis de la formation (I5)
- Ses éventuels besoins spécifiques : situation de handicap, contraintes, rythme d'apprentissage (I6)
- Son contexte professionnel et sa motivation

Domaines à explorer : ${JSON.stringify(questionnaire?.categories?.map((c: { name: string }) => c.name))}.

Sois chaleureux, professionnel et rassurant. À la fin, annonce que l'entretien est terminé et que le formateur recevra un compte-rendu personnalisé.${strictRules}`;
    }

    const categoriesForAI = questionnaire?.categories.map(c => ({
      name: c.name,
      questions: c.questions.map((q: { question: string }) => ({ question: q.question })),
    }));

    return `Tu es TypBot, un assistant IA qui guide des utilisateurs à travers un questionnaire interactif. Le questionnaire s'appelle "${questionnaire?.title}". Voici les catégories et questions :\n\n${JSON.stringify(categoriesForAI, null, 2)}\n\nSois bienveillant et encourageant.${strictRules}`;
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
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  // Extrait les options numérotées du dernier message IA (ex: "1. Oui\n2. Non")
  const buttonOptions = (() => {
    if (sending) return null;
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (!last) return null;
    const lines = last.content.split('\n')
      .map(l => l.trim())
      .filter(l => /^\d+[.)]\s+\S/.test(l))
      .map(l => l.replace(/^\d+[.)]\s+/, '').trim())
      .filter(l => l.length > 0 && l.length <= 100);
    return lines.length >= 2 && lines.length <= 8 ? lines : null;
  })();

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const handleValidate = () => {
    if (selectedOptions.length === 0 || sending) return;
    handleSend(selectedOptions.join(', '));
    setSelectedOptions([]);
  };

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
                  className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm break-words min-w-0 ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {isUser ? (
                    msg.content
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 overflow-hidden">
                      <ReactMarkdown
                        components={{
                          input: () => null,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
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

        {/* Zone d'interaction — mobile : boutons si options détectées, sinon textarea */}
        {buttonOptions ? (
          <div className="sm:hidden border-t border-slate-200 bg-white pb-safe">
            <div className={`px-3 pt-3 flex flex-col gap-2 ${buttonOptions.length > 4 ? 'max-h-60 overflow-y-auto' : ''}`}>
              {buttonOptions.map((option, i) => {
                const isSelected = selectedOptions.includes(option);
                return (
                  <button
                    key={i}
                    onClick={() => toggleOption(option)}
                    className={`w-full min-h-[52px] px-4 py-3 rounded-xl text-[15px] text-left font-medium transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-50 border-2 border-indigo-400 text-indigo-800'
                        : 'bg-white border border-slate-200 text-slate-800 active:bg-slate-50'
                    }`}
                  >
                    <span>{option}</span>
                    {isSelected && <span className="text-indigo-600 shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedOptions.length > 0 && (
              <div className="px-3 py-3">
                <button
                  onClick={handleValidate}
                  disabled={sending}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors active:bg-indigo-700"
                >
                  Valider
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* Textarea — desktop toujours visible, mobile visible uniquement si pas de boutons */}
        <div className={`${buttonOptions ? 'hidden sm:block' : ''} p-3 border-t border-slate-200 bg-white pb-safe`}>
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
