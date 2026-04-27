/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { 
  Upload, 
  Search, 
  Info, 
  ShieldCheck, 
  Clipboard, 
  Check, 
  XCircle,
  Image as ImageIcon,
  Camera,
  Lock,
  KeyRound,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

// Types
type AppraisalStatus = 'idle' | 'analyzing' | 'done' | 'error';

interface AppraisalResult {
  identification: {
    objectType: string;
    title: string;
    authorOrArtist: string;
    publisherOrPrinter: string;
    year: string;
    details: string;
  };
  conservation: {
    grade: string;
    analysis: string;
  };
  marketAnalysis: {
    rarity: string;
    strategicPoints: string[]; // ELENCO PUNTATO RICHIESTO
    estimation: {
      min: string;
      max: string;
    };
    suggestedPrice: string;
  };
  listing: {
    seoTitle: string;
    description: string;
  };
}

const SYSTEM_PROMPT = `Sei un Perito Esperto in Antiquariato Librario e Collezionismo Filatelico/Cartofilo. 
Il tuo compito è analizzare foto di libri e cartoline d'epoca (anche più immagini dello stesso oggetto) per fornire una valutazione commerciale precisa finalizzata alla vendita e-commerce.

Per le immagini caricate, segui RIGOROSAMENTE questo protocollo:
1. IDENTIFICAZIONE VISIVA (Sintetizza i dati da tutte le immagini fornite)
2. ANALISI DELLO STATO DI CONSERVAZIONE (Pristine, Fine, Good, Fair, Poor)
3. RICERCA DI MERCATO (estrapola dai dati in tuo possesso su eBay, AbeBooks, Maremagnum, Delcampe)
4. PUNTI STRATEGICI: Genera un elenco puntato (min 4 punti) con osservazioni chiave sulla valutazione e rarità.
5. VALUTAZIONE ECONOMICA
6. GENERAZIONE INSERZIONE (SEO Title max 80 chars, Elegante Descrizione)

Restituisci i dati ESCLUSIVAMENTE in formato JSON valido con questa struttura:
{
  "identification": {
    "objectType": "string",
    "title": "string",
    "authorOrArtist": "string",
    "publisherOrPrinter": "string",
    "year": "string",
    "details": "string"
  },
  "conservation": {
    "grade": "Pristine | Fine | Good | Fair | Poor",
    "analysis": "string"
  },
  "marketAnalysis": {
    "rarity": "Bassa | Media | Alta",
    "strategicPoints": ["string"],
    "estimation": { "min": "string (€)", "max": "string (€)" },
    "suggestedPrice": "string (€)"
  },
  "listing": {
    "seoTitle": "string",
    "description": "string"
  }
}`;

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '1988') {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 1000);
      setPassword('');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900 font-serif"
    >
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/parchment.png')] pointer-events-none"></div>
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md p-12 bg-natural-bg/95 backdrop-blur-md shadow-2xl border-4 border-stone-800 relative"
      >
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-stone-800 p-4 rounded-full shadow-xl">
          <Lock className="text-amber-100" size={32} />
        </div>

        <div className="text-center mt-6">
          <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-stone-800 mb-2">Antiquarius</h1>
          <p className="text-[10px] font-sans text-stone-500 uppercase tracking-tighter mb-8 italic">Accesso Riservato ai Periti Accreditati</p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input 
                type="password"
                name="access-token-field"
                id="access-token-field"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Inserire Codice di Accesso"
                className={cn(
                  "w-full pl-12 pr-4 py-4 bg-stone-100 border-2 font-sans text-sm focus:outline-none transition-all tracking-[0.5em]",
                  error ? "border-red-500 animate-shake" : "border-stone-800 focus:border-amber-600"
                )}
              />
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-stone-800 text-stone-100 uppercase font-sans font-bold tracking-widest text-xs hover:bg-stone-700 transition flex items-center justify-center gap-3 decoration-amber-500"
            >
              Autentica Credenziali
              <ArrowRight size={14} />
            </button>
          </form>

          <p className="mt-8 text-[9px] font-sans text-stone-400 uppercase leading-relaxed">
            Il sistema monitora ogni accesso. <br />
            L'uso non autorizzato sarà perseguito a norma di legge.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [status, setStatus] = useState<AppraisalStatus>('idle');
  const [images, setImages] = useState<string[]>([]);
  const [result, setResult] = useState<AppraisalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showStrategic, setShowStrategic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inactivity management
  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsUnlocked(false);
    }, IDLE_TIMEOUT);
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      events.forEach(event => document.addEventListener(event, resetTimer));
      resetTimer(); // Start timer on unlock

      return () => {
        events.forEach(event => document.removeEventListener(event, resetTimer));
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [isUnlocked, resetTimer]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        await processImage(files[i]);
      }
    }
  };

  const processImage = (file: File) => {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImages(prev => [...prev, base64String]);
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const startAnalysis = async () => {
    if (images.length === 0) return;
    
    setStatus('analyzing');
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const imageParts = images.map(img => ({
        inlineData: { mimeType: "image/jpeg", data: img.split(',')[1] }
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Analizza queste immagini (pagine/dettagli dello stesso oggetto) e fornisci una perizia professionale come richiesto nel prompt di sistema." },
              ...imageParts
            ]
          }
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }
      });

      const responseText = response.text;
      if (!responseText) throw new Error("Risposta vuota dal modello.");
      
      const parsedResult = JSON.parse(responseText);
      setResult(parsedResult);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError("Si è verificato un errore durante l'analisi coordinata. Verifica la connessione e riprova.");
      setStatus('error');
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col font-serif bg-natural-bg selection:bg-stone-200 uppercase-none">
      <AnimatePresence>
        {!isUnlocked && <LockScreen onUnlock={() => setIsUnlocked(true)} />}
      </AnimatePresence>

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b bg-natural-header border-natural-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-stone-800">Antiquarius</h1>
          <p className="text-[10px] font-sans text-stone-500 uppercase tracking-tighter">Perizia Professionale e Valutazione Antiquaria</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
            <span className={cn("w-2 h-2 rounded-full", status === 'analyzing' ? "bg-amber-500 animate-pulse" : "bg-green-600")}></span>
            <span className="text-[10px] uppercase font-sans font-semibold text-stone-600">
              {status === 'analyzing' ? 'Analisi in corso' : 'Database: Online'}
            </span>
          </div>
          <button 
            onClick={() => { setImages([]); setStatus('idle'); setResult(null); }}
            className="px-4 py-2 bg-stone-800 text-stone-100 rounded text-[10px] uppercase font-sans font-bold hover:bg-stone-700 transition"
          >
            Nuova Analisi
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-[calc(100vh-88px)]">
        {/* Left Column: Upload & Inspection */}
        <section className="lg:col-span-5 p-8 border-r border-natural-border bg-natural-bg flex flex-col overflow-y-auto">
          <div className="flex-1 flex flex-col group min-h-[400px]">
            <div className="flex-1 rounded border border-stone-300 flex items-center justify-center relative overflow-hidden bg-stone-100 shadow-inner group parchment-overlay">
              {images.length > 0 ? (
                <div className="absolute inset-0 z-10 p-4 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-[3/4] bg-white shadow-md border border-stone-200 group/img overflow-hidden">
                        <img src={img} alt={`Pagina ${idx + 1}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => removeImage(idx)}
                          className="absolute top-2 right-2 p-1.5 bg-stone-800/80 text-white rounded-full hover:bg-red-600 transition backdrop-blur-sm opacity-0 group-hover/img:opacity-100 z-20"
                        >
                          <XCircle size={14} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-stone-800/20 text-stone-900 text-[8px] px-2 py-1 font-sans uppercase font-bold backdrop-blur-[1px]">
                          Pagina {idx + 1}
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => status === 'idle' && cameraInputRef.current?.click()}
                      className="aspect-[3/4] border-2 border-dashed border-stone-300 flex flex-col items-center justify-center gap-2 text-stone-400 hover:border-stone-400 hover:text-stone-500 transition"
                    >
                      <Camera size={24} />
                      <span className="text-[10px] uppercase font-sans font-bold">Aggiungi Foto</span>
                    </button>
                  </div>
                  
                  {result && (
                    <div className="sticky bottom-2 left-0 right-0 mt-8 mx-auto bg-amber-50/90 text-amber-900 border border-amber-200 text-[10px] p-4 rounded shadow-lg backdrop-blur-md z-30">
                      <div className="font-bold border-b border-amber-200 mb-2 pb-1 uppercase tracking-tighter">Analisi d'Insieme Coordinata</div>
                      <p className="font-sans italic">{result.conservation.analysis}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="z-10 text-center cursor-pointer group-hover:scale-105 transition-transform duration-500"
                >
                  <div className="w-48 h-64 bg-stone-800 shadow-2xl rounded-sm transform -rotate-1 relative flex items-center justify-center border-4 border-stone-900">
                    <div className="text-stone-300 text-[10px] p-6 text-left border border-stone-700 w-full h-full flex flex-col">
                      <div className="h-4 w-1/2 bg-stone-700 mb-3"></div>
                      <div className="h-2 w-full bg-stone-700/50 mb-1"></div>
                      <div className="h-2 w-full bg-stone-700/50 mb-1"></div>
                      <div className="flex-1 w-full bg-stone-700/20 mt-4 border border-stone-700 flex items-center justify-center">
                        <Upload size={24} className="opacity-20" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-6 text-[10px] font-sans text-stone-400 uppercase tracking-[0.2em]">In attesa di scansioni caricate</p>
                </div>
              )}
              
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />
              <input 
                type="file" 
                ref={cameraInputRef}
                onChange={handleFileChange}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="py-3 px-4 bg-stone-800 text-stone-100 hover:bg-stone-900 transition flex items-center justify-center gap-2 text-[10px] font-sans font-bold uppercase"
                >
                  <ImageIcon size={14} />
                  Sfoglia Archivi
                </button>
                <button 
                  onClick={() => cameraInputRef.current?.click()}
                  className="py-3 px-4 bg-amber-700 text-stone-100 hover:bg-amber-800 transition flex items-center justify-center gap-2 text-[10px] font-sans font-bold uppercase shadow-lg shadow-amber-900/20"
                >
                  <Camera size={14} />
                  Nuovo Scatto
                </button>
              </div>
              
              {images.length > 0 && status === 'idle' && (
                <button 
                  onClick={startAnalysis}
                  className="py-4 bg-green-800 text-white rounded font-sans font-black uppercase text-xs tracking-widest hover:bg-green-700 transition shadow-xl"
                >
                  Esegui Perizia su {images.length} {images.length === 1 ? 'Foto' : 'Foto'}
                </button>
              )}

              <div className="flex items-start gap-3 p-4 bg-stone-50 rounded border border-stone-200">
                <ShieldCheck className="text-stone-400 shrink-0" size={16} />
                <p className="text-[10px] leading-relaxed text-stone-500 font-sans uppercase tracking-tight">
                  I dati sono processati aggregando tutte le immagini fornite per una stima filologica puntuale del reperto.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Result Section */}
        <section className="lg:col-span-7 bg-white p-10 overflow-y-auto flex flex-col shadow-inner">
          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col justify-center items-center text-center opacity-40"
              >
                <Search size={48} className="text-stone-300 mb-6" />
                <h2 className="text-xl font-serif italic text-stone-500">Inizia la Valutazione</h2>
                <p className="text-xs font-sans text-stone-400 uppercase tracking-widest mt-2 max-w-xs">
                  Carica un'immagine per generare la scheda tecnica e la stima di mercato
                </p>
              </motion.div>
            )}

            {status === 'analyzing' && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col justify-center items-center py-20"
              >
                <div className="relative mb-8">
                  <div className="w-16 h-16 border-4 border-stone-100 rounded-full"></div>
                  <div className="w-16 h-16 border-4 border-stone-800 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                </div>
                <h2 className="text-xs font-sans font-bold text-stone-500 uppercase tracking-widest animate-pulse">Analisi spettrale e comparazione cataloghi...</h2>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div 
                key="error"
                className="bg-red-50 p-6 rounded border border-red-100 text-red-800"
              >
                <h2 className="font-sans font-bold uppercase tracking-widest text-[10px] mb-2">Errore Critico Analisi</h2>
                <p className="text-sm italic">{error}</p>
                <button onClick={() => setStatus('idle')} className="mt-4 text-[10px] font-bold uppercase text-red-600 underline">Ricomincia</button>
              </motion.div>
            )}

            {status === 'done' && result && (
              <motion.div 
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-10"
              >
                <div>
                  <h2 className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-[0.2em] mb-6">Scheda Valutazione Articolo</h2>
                  <table className="historical-table">
                    <tbody>
                      <tr>
                        <td>Identificazione</td>
                        <td>{result.identification.title}</td>
                      </tr>
                      <tr>
                        <td>Origine</td>
                        <td className="font-sans not-italic text-xs">
                          {result.identification.authorOrArtist || 'N.D.'} / {result.identification.publisherOrPrinter} ({result.identification.year})
                        </td>
                      </tr>
                      <tr>
                        <td>Stato</td>
                        <td className="flex items-center gap-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded font-sans text-[9px] font-extrabold uppercase",
                            result.conservation.grade === 'Pristine' || result.conservation.grade === 'Fine' ? "bg-green-100 text-green-800" :
                            result.conservation.grade === 'Good' ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                          )}>
                            {result.conservation.grade}
                          </span>
                          <span className="text-[11px] text-stone-500 font-sans">{result.conservation.analysis}</span>
                        </td>
                      </tr>
                      <tr>
                        <td>Rarità</td>
                        <td>
                          <div className="flex items-center gap-2">
                             <div className="flex gap-1">
                              {[1, 2, 3].map((i) => (
                                <div key={i} className={cn(
                                  "h-1.5 w-6 rounded-full transition-colors",
                                  (result.marketAnalysis.rarity === 'Media' && i <= 2) || (result.marketAnalysis.rarity === 'Alta' && i <= 3) || (result.marketAnalysis.rarity === 'Bassa' && i <= 1)
                                  ? "bg-stone-800" : "bg-stone-200"
                                )}></div>
                              ))}
                            </div>
                            <span className="text-[9px] uppercase font-sans text-stone-500 font-bold ml-2">{result.marketAnalysis.rarity}</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>Stima Mercato</td>
                        <td className="font-sans font-bold text-stone-800">
                          {result.marketAnalysis.estimation.min} — {result.marketAnalysis.estimation.max}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="col-span-1">
                    <h3 className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest mb-4">Riferimenti Strategici</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-stone-50 border border-stone-100 rounded">
                        <span className="text-[10px] font-sans text-stone-500 uppercase font-bold">Base d'asta</span>
                        <span className="font-sans font-bold text-stone-800">{result.marketAnalysis.estimation.min}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-stone-50 border border-stone-100 rounded">
                        <span className="text-[10px] font-sans text-stone-500 uppercase font-bold">Massimale Atteso</span>
                        <span className="font-sans font-bold text-stone-800">{result.marketAnalysis.estimation.max}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <h3 className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest mb-4">Strategia E-Commerce</h3>
                    <div className="p-6 rounded border-2 border-dashed border-stone-200 text-center bg-stone-50/50">
                      <div className="text-[10px] uppercase font-sans font-bold mb-2 text-stone-400">Target Buy-It-Now</div>
                      <div className="text-3xl font-sans font-black text-stone-900 tracking-tighter">{result.marketAnalysis.suggestedPrice}</div>
                    </div>
                  </div>
                </div>

                {/* Sezione Elenco Puntato Richiesto */}
                <div className="border-2 border-amber-200 bg-stone-50/30 overflow-hidden rounded">
                  <button 
                    onClick={() => setShowStrategic(!showStrategic)}
                    className="w-full p-6 flex items-center justify-between hover:bg-stone-100 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-full text-amber-700">
                        <Info size={18} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-[10px] font-sans font-black text-stone-600 uppercase tracking-[0.2em] mb-0.5">
                          Valutazioni Strategiche e Note Tecniche
                        </h3>
                        <p className="text-[9px] font-sans text-stone-400 uppercase">Premere per espandere il protocollo di stima</p>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: showStrategic ? 180 : 0 }}
                      className="text-stone-400"
                    >
                      <Upload size={14} className="rotate-180" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {showStrategic && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-amber-100"
                      >
                        <div className="p-8 space-y-6">
                           <div className="flex items-center gap-2 mb-4">
                             <div className="h-[1px] flex-1 bg-amber-200"></div>
                             <span className="text-[9px] font-sans font-bold text-amber-600 uppercase tracking-widest whitespace-nowrap">ELENCO VALUTAZIONI</span>
                             <div className="h-[1px] flex-1 bg-amber-200"></div>
                           </div>
                          
                          <ul className="space-y-4">
                            {result.marketAnalysis.strategicPoints.map((point, i) => (
                              <li key={i} className="flex items-start gap-4 group">
                                <div className="mt-1.5 w-2 h-2 rounded-full border-2 border-amber-600 group-hover:bg-amber-600 transition shrink-0 shadow-[0_0_8px_rgba(217,119,6,0.3)]"></div>
                                <span className="text-[11px] font-sans text-stone-700 italic leading-relaxed">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-stone-50 p-6 rounded border border-stone-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-stone-400">Bozza Inserzione Professionale</span>
                    <button 
                      onClick={() => copyToClipboard(`${result.listing.seoTitle}\n\n${result.listing.description}`)}
                      className={cn(
                        "text-[9px] font-bold uppercase px-2 py-1 rounded transition",
                        copied ? "bg-green-600 text-white" : "text-stone-800 bg-stone-200 hover:bg-stone-300"
                      )}
                    >
                      {copied ? 'Copiato' : 'Copia Testo'}
                    </button>
                  </div>
                  <div className="text-xs font-sans mb-3 font-bold text-stone-800 uppercase tracking-tight line-clamp-1">
                    {result.listing.seoTitle}
                  </div>
                  <div className="text-[11px] leading-relaxed text-stone-600 italic font-serif">
                    <ReactMarkdown>{result.listing.description}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="h-6 bg-stone-800 flex items-center justify-between px-6 text-[8px] text-stone-500 uppercase tracking-[0.4em]">
        <span>Antiquarius System v.2.4 — Restricted Access</span>
        <span>Certificazione AI-Grade Authenticated</span>
      </footer>
    </div>
  );
}
