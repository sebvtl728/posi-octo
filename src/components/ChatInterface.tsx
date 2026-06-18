import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { chatWithMistral, fetchMistralModels } from '../lib/mistral';
import { Message } from '../types';

type DocumentData = { id: string; [key: string]: unknown };
import { Loader2, Send, Paperclip, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';

function extractFirstName(text: string): string {
  const clean = text.trim();
  const patterns = [
    /je\s+m'appelle\s+([a-zA-Zà-öø-ÿĀ-ſ-]+)/i,
    /moi\s+c'est\s+([a-zA-Zà-öø-ÿĀ-ſ-]+)/i,
    /mon\s+prénom\s+est\s+([a-zA-Zà-öø-ÿĀ-ſ-]+)/i,
    /prénom\s+:\s*([a-zA-Zà-öø-ÿĀ-ſ-]+)/i,
    /c'est\s+([a-zA-Zà-öø-ÿĀ-ſ-]+)/i,
    /je\s+suis\s+([a-zA-Zà-öø-ÿĀ-ſ-]+)/i
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const name = match[1];
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  }

  const firstWord = clean.split(/\s+/)[0] || '';
  const cleanedWord = firstWord.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
  if (cleanedWord) {
    return cleanedWord.charAt(0).toUpperCase() + cleanedWord.slice(1).toLowerCase();
  }
  return clean;
}

function assistantAskedForName(messages: Message[]): boolean {
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return false;
  const content = lastAssistant.content.toLowerCase();
  return content.includes('prénom') || content.includes('prenom') || content.includes("t'appelles") || content.includes('ton nom');
}

interface ChatInterfaceProps {
  sessionId: string;
  onLeave: () => void;
}

export default function ChatInterface({ sessionId, onLeave }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [models, setModels] = useState<string[]>(['mistral-small-latest']);
  const [selectedModel, setSelectedModel] = useState<string>('mistral-small-latest');
  const [userName, setUserName] = useState<string>('');
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMistralModels().then(setModels).catch(console.error);
  }, []);

  useEffect(() => {
    const docRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.userName) {
          setUserName(data.userName);
        }
      }
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    const q = query(
      collection(db, `sessions/${sessionId}/messages`),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    const qDocs = query(
      collection(db, `sessions/${sessionId}/documents`),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeDocs = onSnapshot(qDocs, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentData));
      setDocuments(docs);
    });
    return () => unsubscribeDocs();
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    
    setIsLoading(true);

    let currentUserName = userName;
    if (!userName) {
      const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 0;
      if (isFirstUserMessage || assistantAskedForName(messages)) {
        currentUserName = extractFirstName(text);
        setUserName(currentUserName);
        try {
          await setDoc(doc(db, 'sessions', sessionId), {
            userName: currentUserName
          }, { merge: true });
        } catch (e) {
          console.error("Error saving userName:", e);
        }
      }
    }

    const userMessage: Message = {
      sessionId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, `sessions/${sessionId}/messages`), userMessage);

      // System Prompt
      const systemPrompt = `Tu es un ingénieur pédagogique et d'évaluation. L'utilisateur t'utilise pour réviser (par exemple, pour une soutenance) à l'aide de documents JSON.
      
      Rôle et Déroulement du Questionnaire :
      1. Le fichier JSON fourni te sert de support exclusif pour poser tes questions. Utilise rigoureusement les données structurées et les réponses qu'il contient.
      2. Pour chaque réponse de l'utilisateur, tu dois d'abord analyser l'historique dans ton for intérieur pour identifier la question en cours, la validité de la réponse du candidat par rapport au JSON, et le nombre d'échecs consécutifs sur cette question.
      3. Tu dois impérativement formuler une réflexion/analyse constructive pour chaque réponse donnée par le candidat. S'il y a plusieurs réponses valides possibles dans le JSON, accepte n'importe laquelle d'entre elles.
      4. SI LA RÉPONSE DE L'UTILISATEUR EST INCORRECTE (1ère tentative) :
         - NE passe PAS à la question suivante du JSON.
         - Reste sur le même sujet/concept de question.
         - Propose des questions complémentaires et intermédiaires plus simples pour guider et aider le candidat à cheminer et à trouver la réponse par lui-même.
      5. SI LE CANDIDAT S'EST TROMPE DEUX FOIS CONSÉCUTIVES SUR LA MÊME QUESTION :
         - NE passe PAS à la question suivante tout de suite.
         - En qualité d'ingénieur pédagogique, apporte-lui des explications complètes, claires et didactiques sur le concept pour l'aider à comprendre son erreur.
         - Une fois cette explication didactique terminée, tu peux alors (et seulement à ce moment-là) lui proposer de passer à la question suivante du JSON.
      6. SI LA RÉPONSE DE L'UTILISATEUR EST CORRECTE :
         - Valide et félicite brièvement la réponse du candidat.
         - Passe à la question suivante du JSON.
      7. Si tu poses des questions à choix multiples, formate les options sous forme de liste à puces Markdown, afin qu'elles puissent être cliquées par l'utilisateur.
      8. Sois clair, concis, et utilise le Markdown pour structurer tes réponses.
      9. Tu dois toujours t'assurer de connaître le prénom de l'utilisateur pour personnaliser tes réponses.
      Documentation JSON présente : ${documents.map(d => d.content).join("\n---\n")}`;

      const historyForMistral = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage.content }
      ];

      const aiResponse = await chatWithMistral(historyForMistral, selectedModel);
      
      const assistantMessage: Message = {
        sessionId,
        role: 'assistant',
        content: aiResponse,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, `sessions/${sessionId}/messages`), assistantMessage);

    } catch (error: any) {
      setErrorInfo(error.message || "Erreur de communication avec SV.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const currentInput = input;
    setInput('');
    await sendMessage(currentInput);
  };

  const startWithDocument = async () => {
    if (documents.length === 0 || isLoading) return;
    setIsLoading(true);

    try {
      const systemPrompt = `Tu es un ingénieur pédagogique et d'évaluation. L'utilisateur t'utilise pour réviser (par exemple, pour une soutenance) à l'aide de documents JSON.
      
      Rôle et Déroulement du Questionnaire :
      1. Le fichier JSON fourni te sert de support exclusif pour poser tes questions. Utilise rigoureusement les données structurées et les réponses qu'il contient.
      2. Pour chaque réponse de l'utilisateur, tu dois d'abord analyser l'historique dans ton for intérieur pour identifier la question en cours, la validité de la réponse du candidat par rapport au JSON, et le nombre d'échecs consécutifs sur cette question.
      3. Tu dois impérativement formuler une réflexion/analyse constructive pour chaque réponse donnée par le candidat. S'il y a plusieurs réponses valides possibles dans le JSON, accepte n'importe laquelle d'entre elles.
      4. SI LA RÉPONSE DE L'UTILISATEUR EST INCORRECTE (1ère tentative) :
         - NE passe PAS à la question suivante du JSON.
         - Reste sur le même sujet/concept de question.
         - Propose des questions complémentaires et intermédiaires plus simples pour guider et aider le candidat à cheminer et à trouver la réponse par lui-même.
      5. SI LE CANDIDAT S'EST TROMPE DEUX FOIS CONSÉCUTIVES SUR LA MÊME QUESTION :
         - NE passe PAS à la question suivante tout de suite.
         - En qualité d'ingénieur pédagogique, apporte-lui des explications complètes, claires et didactiques sur le concept pour l'aider à comprendre son erreur.
         - Une fois cette explication didactique terminée, tu peux alors (et seulement à ce moment-là) lui proposer de passer à la question suivante du JSON.
      6. SI LA RÉPONSE DE L'UTILISATEUR EST CORRECTE :
         - Valide et félicite brièvement la réponse du candidat.
         - Passe à la question suivante du JSON.
      7. Si tu poses des questions à choix multiples, formate les options sous forme de liste à puces Markdown, afin qu'elles puissent être cliquées par l'utilisateur.
      8. Sois clair, concis, et utilise le Markdown pour structurer tes réponses.
      Documentation JSON présente : ${documents.map(d => d.content).join("\n---\n")}
      
      Instruction : L'utilisateur vient de lancer la machine. Accueille-le brièvement, et demande-lui obligatoirement son prénom pour personnaliser la suite des échanges. Attends qu'il te donne son prénom avant de poser la première question basée sur les documents JSON.`;

      const aiResponse = await chatWithMistral([{ role: 'system', content: systemPrompt }], selectedModel);
      
      const assistantMessage: Message = {
        sessionId,
        role: 'assistant',
        content: aiResponse,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, `sessions/${sessionId}/messages`), assistantMessage);

    } catch (error: any) {
      setErrorInfo(error.message || "Erreur de communication avec l'SV.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        // Valider que c'est bien du JSON
        if (file.name.endsWith('.json')) {
            JSON.parse(content); 
            await addDoc(collection(db, `sessions/${sessionId}/documents`), {
              sessionId,
              content,
              createdAt: new Date().toISOString()
            });
            alert("Document ajouté avec succès comme contexte.");
        } else {
             alert("Veuillez charger un fichier .json");
        }
      } catch (err) {
        alert("Erreur de lecture ou JSON invalide.");
      }
    };
    reader.readAsText(file);
    if(e.target) e.target.value = '';
  };

  const exportPDF = () => {
    const element = document.getElementById('chat-export-content');
    if(element) {
        // Clone element to manipulate styles for export
        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.padding = '20px';
        clone.style.backgroundColor = 'white';
        // Options
        const opt = {
          margin:       10,
          filename:     `TypBot-Session-${sessionId}.pdf`,
          image:        { type: 'jpeg' as const, quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        };
        html2pdf().set(opt).from(clone).save();
    }
  };

  const exportMD = () => {
    const mdContent = messages.map(m => `### ${m.role === 'user' ? (userName || 'Vous') : 'Posi-octo(SV)'}\n${m.content}\n\n`).join('');
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TypBot-Session-${sessionId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={onLeave} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 -ml-2">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
            <h1 className="font-bold text-lg tracking-tight">TypBot</h1>
          </div>
          <p className="text-xs text-slate-400">SV Analyse de Soutenance</p>
        </div>
        
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Progression Révision</h3>
             <div className="space-y-4">
               <div>
                  <div className="flex justify-between text-xs mb-1">
                     <span className="font-medium">Échanges</span>
                     <span className="text-indigo-600 font-bold">{messages.length}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                     <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${Math.min(100, messages.length * 5)}%` }}></div>
                  </div>
               </div>
             </div>
          </section>

          <section>
             <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Données JSON Chargées</h3>
             <div className="space-y-2 mb-4">
               {documents.length === 0 ? (
                   <p className="text-xs text-slate-400 italic">Aucun document chargé.</p>
               ) : (
                   documents.map((doc, idx) => (
                      <div key={doc.id} className="p-2 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-between gap-2 overflow-hidden">
                          <div className="flex items-center gap-2 overflow-hidden truncate">
                             <div className="text-indigo-500 shrink-0">
                                <Paperclip className="w-4 h-4" />
                             </div>
                             <span className="text-xs font-medium text-indigo-700 truncate">Doc {idx + 1}</span>
                          </div>
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold uppercase">Actif</span>
                      </div>
                   ))
               )}
             </div>
             <label className="flex items-center justify-center w-full bg-slate-50 border border-dashed border-slate-300 text-slate-600 py-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <Paperclip className="w-4 h-4 mr-2" />
                <span className="text-xs font-medium">Importer un JSON</span>
                <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
             </label>
          </section>
        </div>

        {/* Bottom API Status */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
             <span className="text-[10px] font-bold text-slate-400 uppercase">Mistral API</span>
             <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold uppercase">Actif</span>
          </div>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full text-[10px] p-2 rounded border border-slate-200 bg-white outline-none cursor-pointer focus:border-indigo-500 mb-2 truncate"
          >
             {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="password" value="••••••••••••••••" className="w-full text-[10px] p-2 rounded border border-slate-200 bg-white outline-none" readOnly />
        </div>
      </aside>

      {/* Main Chat View */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-800">Session d'entraînement</span>
            <span className="text-[10px] text-emerald-500">● Persistant sur Database Cloud</span>
          </div>
          <div className="flex gap-2">
            <button onClick={exportPDF} className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors">Exporter PDF</button>
            <button onClick={exportMD} className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors bg-white">Markdown</button>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto flex flex-col gap-6" id="chat-export-content">
           {messages.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                     <Send className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-lg text-slate-500 font-medium mb-6">Posez une question pour démarrer...</p>
                  
                  {documents.length > 0 && (
                     <button
                       onClick={startWithDocument}
                       disabled={isLoading}
                       className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:bg-slate-400"
                     >
                        Démarrer l'évaluation JSON
                     </button>
                  )}
               </div>
           ) : (
               <div className="w-full max-w-4xl mx-auto space-y-6">
                 {messages.map((m) => (
                    <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                       <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold text-xs ${m.role === 'user' ? 'bg-slate-300 text-slate-600' : 'bg-indigo-600 text-white'}`}>
                          {m.role === 'user' ? (userName ? userName.charAt(0).toUpperCase() : 'U') : 'SV'}
                       </div>
                       <div className={`p-4 shadow-sm max-w-[80%] ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none'}`}>
                          {m.role === 'user' ? (
                             <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                          ) : (
                             <div className="markdown-body prose prose-slate prose-sm text-sm leading-relaxed max-w-none">
                                <ReactMarkdown components={{ li: ({node, children, ...props}) => { const isLast = m.id === messages[messages.length-1]?.id; if(isLast) { return <li {...props} className="cursor-pointer hover:bg-slate-50 p-3 rounded-xl border border-slate-200 transition-all my-2 -ml-4 list-none shadow-sm font-medium text-slate-700 hover:text-indigo-700 hover:border-indigo-300 hover:shadow-md block bg-white" onClick={(e) => { e.preventDefault(); const t = e.currentTarget.textContent?.trim(); if(t) { setInput(prev => { const options = prev.split(' || ').filter(Boolean); if (options.includes(t)) { return options.filter(o => o !== t).join(' || '); } return [...options, t].join(' || '); }); } }}>{children}</li>; } return <li {...props}>{children}</li>; } }}>{m.content}</ReactMarkdown>
                             </div>
                          )}
                       </div>
                    </div>
                 ))}
                 {isLoading && (
                    <div className="flex gap-4">
                       <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-indigo-600 text-white">
                          SV
                       </div>
                       <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          <span className="text-sm text-slate-500">Posi-octoanalyse...</span>
                       </div>
                    </div>
                 )}
                 <div ref={messagesEndRef} />
               </div>
           )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-slate-200 shrink-0 flex flex-col gap-4">
           {errorInfo && (
              <div className="max-w-4xl mx-auto w-full bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-200 text-sm flex justify-between items-center">
                 <span>{errorInfo}</span>
                 <button type="button" onClick={() => setErrorInfo(null)} className="text-red-400 hover:text-red-700 font-bold">&times;</button>
              </div>
           )}
           <form onSubmit={handleSend} className="relative flex items-center max-w-4xl w-full mx-auto">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Répondez à la question..."
                className="w-full pl-4 pr-32 py-4 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900"
                disabled={isLoading}
              />
              <div className="absolute right-4 flex gap-2">
                 <button 
                   type="submit" 
                   disabled={!input.trim() || isLoading}
                   className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-400 transition-colors shadow-sm"
                 >
                   ENVOYER
                 </button>
              </div>
           </form>
        </div>
      </main>

      {/* Right Sidebar: Access */}
      <aside className="w-72 bg-white border-l border-slate-200 p-6 flex flex-col shrink-0">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Accès Mobile</h3>
        <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center gap-4 mb-auto">
           <div className="w-32 h-32 bg-white border border-slate-200 p-2 flex items-center justify-center shrink-0">
              <QRCodeSVG value={`${window.location.origin}?session=${sessionId}`} size={110} />
           </div>
           <p className="text-[10px] text-center text-slate-500 leading-tight">Scannez pour continuer l'entraînement sur votre téléphone</p>
        </div>
      </aside>
    </div>
  );
}
