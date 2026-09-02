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
  const [questionIndex, setQuestionIndex] = useState(0);
  const allQuestions = questionnaire?.categories.flatMap(c => 
    c.questions.map((q: any) => {
      if (typeof q === 'string') {
        return {
          question: q,
          expectedAnswers: [] as string[],
          hint: ''
        };
      }
      return {
        question: q.question || q.title || '',
        expectedAnswers: (q.expectedAnswers || (q.correctAnswer ? [q.correctAnswer] : (q.correctAnswers ? q.correctAnswers : []))) as string[],
        hint: q.hint || ''
      };
    })
  ) ?? [];

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
    const strictRules = `

Règles absolues :
- Pose UNE seule question par message.
- N'avance pas à la question suivante sans réponse explicite de l'utilisateur.
- Ne réponds jamais à la place de l'utilisateur.
- Ne révèle pas les réponses attendues dans tes questions.
- N'utilise le prénom de l'utilisateur qu'occasionnellement, pas dans chaque message.
- Ne commence JAMAIS tes messages par "Merci pour ta réponse" ou une formule similaire. Varie tes feedbacks : commente directement ce qui a été dit, corrige si nécessaire, puis enchaîne naturellement vers la question suivante.`;

    if (session?.type === 'positioning' && allQuestions.length === 0) {
      return `Tu es Emy, une assistante de positionnement Qualiopi. Avant la formation "${questionnaire?.title}", tu conduis un entretien de positionnement individuel avec ${userName} pour évaluer son niveau initial et identifier ses besoins, conformément aux indicateurs I5, I6 et I9 du référentiel Qualiopi 2021.

Explore avec bienveillance, en posant UNE question à la fois :
- Ses acquis et connaissances actuelles dans les domaines abordés (I5)
- Ses attentes et objectifs vis-à-vis de la formation (I5)
- Ses éventuels besoins spécifiques : situation de handicap, contraintes, rythme d'apprentissage (I6)
- Son contexte professionnel et sa motivation

Domaines à explorer : ${JSON.stringify(questionnaire?.categories?.map((c: { name: string }) => c.name))}.

Sois chaleureux, professionnel et rassurant. À la fin, annonce que l'entretien est terminé.${strictRules}`;
    }

    const categoriesForAI = questionnaire?.categories.map(c => ({
      name: c.name,
      questions: c.questions.map((q: any) => {
        if (typeof q === 'string') {
          return {
            question: q,
            expectedAnswers: []
          };
        }
        return {
          question: q.question || q.title || '',
          expectedAnswers: q.expectedAnswers || (q.correctAnswer ? [q.correctAnswer] : (q.correctAnswers ? q.correctAnswers : [])),
          ...(q.hint ? { hint: q.hint } : {})
        };
      }),
    }));

    return `Tu es Emy, une examinatrice pédagogique qui prépare ${userName} à une soutenance orale sur "${questionnaire?.title}".

Voici la liste des questions dans l'ordre exact :
${JSON.stringify(categoriesForAI, null, 2)}

Consignes importantes pour formuler les questions :
- Analyse attentivement chaque énoncé de question :
  * Si l'énoncé est un simple thème, un mot-clé, une abréviation ou une phrase incomplète (ex: "Format papier", "Q DPI ou PPP", "CMJN", "trais de coupe", "Raccourci transformation", "Q DPI ou PPP Q2"), tu dois OBLIGATOIREMENT le transformer en une question orale complète, bien formulée, fluide, claire et compréhensible pour l'élève (ex: pour "Q DPI ou PPP", formule : "Que signifient les sigles DPI ou PPP en design graphique et quelle est leur utilité ?" ; pour "CMJN", formule : "Pouvez-vous m'expliquer ce qu'est le mode colorimétrique CMJN et pourquoi on l'utilise en impression ?").
  * Si l'énoncé est déjà une question rédigée et parfaitement claire (ex: "Quelle est la différence entre un fichier et un dossier ?"), pose-la telle quelle ou en l'adaptant très légèrement pour qu'elle reste fluide à l'oral.
- Les "expectedAnswers" associées à chaque question sont pour ton évaluation uniquement — ne les cite pas dans tes questions et ne les révèle pas à l'apprenant.
- Si un "hint" est présent, utilise-le uniquement comme guide d'évaluation ou indice constructif si l'apprenant rencontre des difficultés.
- Prends impérativement le temps de réfléchir, d'analyser et d'évaluer la réponse de l'apprenant, tout particulièrement lorsqu'il s'agit d'une réponse sous forme de texte libre (open text). Ne valide pas trop vite une réponse si elle est superficielle, incomplète ou à côté du sujet. Sois rigoureuse dans ton évaluation pédagogique, commente ce qui est correct et ce qui manque avec précision.
- Après chaque réponse de l'apprenant, donne un feedback court (2 à 3 phrases maximum), direct, bienveillant et constructif (correct/incomplet/incorrect), puis enchaîne immédiatement en posant la question suivante de la liste.${strictRules}`;
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
      const welcomeContent = session?.type === 'positioning' && allQuestions.length === 0
        ? `L'apprenant s'appelle ${userName}. Présente-toi, explique brièvement le but de cet entretien de positionnement Qualiopi, rassure ${userName} que ce n'est pas un examen, puis commence par explorer son contexte et ses acquis actuels.`
        : `L'utilisateur s'appelle ${userName}. Présente-toi chaleureusement en tant qu'Emy, souhaite-lui la bienvenue pour ce questionnaire sur "${questionnaire?.title}", puis pose la première question de la liste : "${allQuestions[0]?.question}" en appliquant tes consignes de reformulation.`;
      const welcomeMsg = await chatWithMistral([
        ...history,
        { role: 'user', content: welcomeContent },
      ], 'mistral-small-latest');
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

  const currentQuestion = allQuestions[questionIndex];
  const buttonOptions: string[] | null =
    !sending && (currentQuestion?.expectedAnswers?.length ?? 0) > 0
      ? currentQuestion.expectedAnswers
      : null;

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const handleValidate = () => {
    if (selectedOptions.length === 0 || sending) return;
    handleSend(selectedOptions.join(', '));
  };

  const handleSend = async (content: string) => {
    if (!sessionId || !content.trim() || sending || !questionnaire) return;
    setSending(true);
    setSendError('');
    const userContent = content.trim();
    setInput('');
    setSelectedOptions([]);

    const answeredQuestion = allQuestions[questionIndex];
    const nextQuestion = allQuestions[questionIndex + 1];

    setQuestionIndex(prev => Math.min(prev + 1, allQuestions.length - 1));
    try {
      await addMessage(sessionId, 'user', userContent);
      
      let stateInstruction = '';
      if (allQuestions.length > 0) {
        if (nextQuestion) {
          stateInstruction = `\n\n[Instruction système cruciale : L'apprenant vient de répondre à la question : "${answeredQuestion.question}". Analyse sa réponse, évalue si elle est correcte/incomplète/incorrecte par rapport aux attendus "${(answeredQuestion.expectedAnswers ?? []).join(', ')}", fais un retour court et constructif, puis pose la question suivante : "${nextQuestion.question}" en appliquant impérativement tes consignes de reformulation (s'il s'agit d'un mot-clé ou d'une abréviation, transforme-le en une question orale claire, complète et rédigée). Ne pose aucune autre question.]`;
        } else {
          stateInstruction = `\n\n[Instruction système cruciale : L'apprenant vient de répondre à la dernière question : "${answeredQuestion.question}". Analyse sa réponse, évalue-la, fais un retour court et constructif, puis annonce clairement que la soutenance est maintenant terminée. Ne pose plus aucune question.]`;
        }
      }

      const history: Array<{ role: string; content: string }> = [
        { role: 'system', content: buildSystemPrompt(session?.userName ?? '') },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent + stateInstruction },
      ];
      const reply = await chatWithMistral(history, 'mistral-small-latest');
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

        {/* Zone d'interaction — boutons si la question courante a des choix, sinon textarea */}
        {buttonOptions ? (
          <div className="border-t border-slate-200 bg-white pb-safe">
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

        {/* Textarea — visible uniquement si pas de boutons */}
        <div className={`${buttonOptions ? 'hidden' : ''} p-3 border-t border-slate-200 bg-white pb-safe`}>
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
