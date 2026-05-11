import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Clock, 
  Droplets, 
  Info, 
  MessageSquare, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Moon,
  Sun,
  Send,
  ArrowLeft,
  Settings,
  Activity,
  Plus,
  FileText,
  Download,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { askPrepAI } from './lib/gemini';

// --- Types & Data ---

type PrepType = 'Suprep' | 'Clenpiq' | 'Miralax/Gatorade' | 'Plenvu';

interface Instruction {
  day: number; // Days before procedure
  title: string;
  content: string;
  type: 'diet' | 'medication' | 'warning';
}

interface SymptomLog {
  id: string;
  type: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  time: string;
  timestamp: number;
}

const PREP_DATA: Record<PrepType, Instruction[]> = {
  'Suprep': [
    { day: 7, title: 'Low Fiber Start', content: 'Stop fiber supplements. Avoid nuts, seeds, and raw veggies.', type: 'diet' },
    { day: 3, title: 'Check Supplies', content: 'Ensure you have picked up your Suprep kit from the pharmacy.', type: 'warning' },
    { day: 1, title: 'Clear Liquids Only', content: 'No solid food. Drink only clear liquids (broth, apple juice, Sprite).', type: 'diet' },
    { day: 1, title: 'First Dose (6:00 PM)', content: 'Pour one 6-ounce bottle into the mixing container. Add water to the line. Drink all, then drink 32oz more water over 1 hour.', type: 'medication' },
    { day: 0, title: 'Second Dose', content: '5 hours before procedure: Repeat the same process as last night.', type: 'medication' },
  ],
  'Clenpiq': [
    { day: 7, title: 'Medication Check', content: 'Stop iron supplements and anti-diarrheal meds.', type: 'warning' },
    { day: 1, title: 'Clear Liquids', content: 'Strict clear liquid diet today. No red or purple dyes.', type: 'diet' },
    { day: 1, title: 'Dose 1', content: 'Drink one bottle of Clenpiq. Follow with five 8oz cups of clear liquid over 5 hours.', type: 'medication' },
    { day: 0, title: 'Dose 2', content: 'Drink second bottle. Follow with at least three 8oz cups of clear liquid.', type: 'medication' },
  ],
  'Miralax/Gatorade': [
    { day: 7, title: 'Dietary Changes', content: 'Begin low-residue diet (no whole grains, seeds, or skins).', type: 'diet' },
    { day: 1, title: 'The Mix', content: 'Mix 238g Miralax with 64oz Gatorade (not red). Chill in fridge.', type: 'medication' },
    { day: 1, title: 'Start Drinking', content: 'At 5 PM, drink 8oz every 15 mins until half the bottle is gone.', type: 'medication' },
    { day: 0, title: 'Finish Mix', content: '6 hours before procedure, finish the remaining half of the mixture.', type: 'medication' },
  ],
  'Plenvu': [
    { day: 7, title: 'Low Residue Diet', content: 'Avoid high fiber foods like nuts, seeds, and whole grains.', type: 'diet' },
    { day: 1, title: 'Clear Liquid Diet', content: 'Breakfast, Lunch, Dinner: Clear liquids only.', type: 'diet' },
    { day: 1, title: 'Dose 1 (6:00 PM)', content: 'Mix Dose 1 with 16oz water. Sip slowly over 30 mins.', type: 'medication' },
    { day: 0, title: 'Dose 2', content: 'Drink Dose 2 (sachet A and B) 6 hours before procedure.', type: 'medication' },
  ]
};

// --- Main Component ---

export default function App() {
  const [procDate, setProcDate] = useState(() => {
    try {
      return localStorage.getItem('procDate') || '';
    } catch (e) {
      return '';
    }
  });
  const [prepType, setPrepType] = useState<PrepType>(() => {
    try {
      const saved = localStorage.getItem('prepType') as PrepType;
      return (saved && PREP_DATA[saved]) ? saved : 'Suprep';
    } catch (e) {
      return 'Suprep';
    }
  });
  const [isSetup, setIsSetup] = useState(() => {
    try {
      return localStorage.getItem('isSetup') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>(() => {
    try {
      const saved = localStorage.getItem('chatHistory');
      return saved ? JSON.parse(saved) : [
        { role: 'ai', text: 'Hi! I can answer questions about your prep schedule. Ask me anything!' }
      ];
    } catch (e) {
      return [{ role: 'ai', text: 'Hi! I can answer questions about your prep schedule. Ask me anything!' }];
    }
  });
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [timeRemaining, setTimeRemaining] = useState('');

  // Symptom Tracking State
  const [symptoms, setSymptoms] = useState<SymptomLog[]>(() => {
    try {
      const saved = localStorage.getItem('symptoms');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showSymptomForm, setShowSymptomForm] = useState(false);
  const [newSymptom, setNewSymptom] = useState({ type: 'Nausea', severity: 'Mild' as const });

  useEffect(() => {
    localStorage.setItem('procDate', procDate);
    localStorage.setItem('prepType', prepType);
    localStorage.setItem('isSetup', String(isSetup));
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    localStorage.setItem('symptoms', JSON.stringify(symptoms));
  }, [procDate, prepType, isSetup, chatHistory, symptoms]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (!procDate) return;
    const interval = setInterval(() => {
      const now = new Date();
      const target = new Date(procDate);
      if (isNaN(target.getTime())) {
        setTimeRemaining('T-MINUS CALCULATING');
        return;
      }
      const diff = target.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeRemaining('Procedure Time');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeRemaining(`${days}d ${hours}h ${mins}m`);
    }, 1000);
    return () => clearInterval(interval);
  }, [procDate]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (procDate) setIsSetup(true);
  };

  const askAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || loading) return;

    const userMsg = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setLoading(true);

    const aiResponse = await askPrepAI(userMsg, prepType);
    
    setChatHistory(prev => [...prev, { 
      role: 'ai', 
      text: aiResponse 
    }]);
    setLoading(false);
  };

  const logSymptom = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const entry: SymptomLog = {
      id: Math.random().toString(36).substr(2, 9),
      type: newSymptom.type,
      severity: newSymptom.severity,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime()
    };
    setSymptoms(prev => [entry, ...prev]);
    setShowSymptomForm(false);
  };

  const deleteSymptom = (id: string) => {
    setSymptoms(prev => prev.filter(s => s.id !== id));
  };

  const downloadSymptomLog = () => {
    const header = `BowelPreppr Symptom Log\nPrep Type: ${prepType}\nProcedure Date: ${procDate}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    const body = symptoms.map(s => {
      const date = new Date(s.timestamp).toLocaleDateString();
      return `[${date} ${s.time}] ${s.type} - Severity: ${s.severity}`;
    }).join('\n');
    
    const blob = new Blob([header + body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `symptom_log_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDaysArray = () => {
    const dates = [];
    if (!procDate) return [];
    
    const target = new Date(procDate);
    if (isNaN(target.getTime())) return [];

    for (let i = 7; i >= 0; i--) {
      const d = new Date(target);
      d.setDate(d.getDate() - i);
      dates.push({
        date: d,
        daysOut: i,
        instructions: (PREP_DATA[prepType] || []).filter(item => item.day === i)
      });
    }
    return dates;
  };

  // Find current day based on today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysArray = getDaysArray();
  
  const currentDayIndex = daysArray.length > 0 ? daysArray.findIndex(d => {
    const dCopy = new Date(d.date);
    dCopy.setHours(0, 0, 0, 0);
    return dCopy.getTime() === today.getTime();
  }) : -1;
  
  // Default to Day -1 if today is not in range, or the closest day
  const activeDay = daysArray.length > 0 
    ? (currentDayIndex !== -1 ? daysArray[currentDayIndex] : daysArray[6]) 
    : null;

  return (
    <div className="min-h-screen p-0 flex flex-col font-sans bg-white text-[#1a1a1a]">
      <AnimatePresence mode="wait">
        {!isSetup ? (
          <motion.div 
            key="setup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-grow flex items-center justify-center p-6 bg-[#f9f9f9]"
          >
            <div className="bg-white border border-[#3e2723] w-full max-w-md p-10">
              <div className="flex justify-center mb-8">
                <div className="w-16 h-16 bg-[#3e2723] flex items-center justify-center text-white text-2xl font-bold">
                  B
                </div>
              </div>
              <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">BowelPreppr</h1>
              <p className="text-center text-[#666666] mb-10 text-sm italic">Cleanly prepared. Simply done.</p>
              
              <form onSubmit={handleStart} className="space-y-6">
                <div className="border-l-4 border-[#3e2723] pl-4">
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-[#666666] mb-1">Procedure Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full p-2 border border-black outline-none focus:bg-[#f5f5f5] transition-all"
                    onChange={(e) => setProcDate(e.target.value)}
                  />
                </div>
                <div className="border-l-4 border-[#3e2723] pl-4">
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-[#666666] mb-1">Prep Medication</label>
                  <select 
                    className="w-full p-2 border border-black outline-none focus:bg-[#f5f5f5] transition-all appearance-none bg-white font-medium"
                    value={prepType}
                    onChange={(e) => setPrepType(e.target.value as PrepType)}
                  >
                    {Object.keys(PREP_DATA).map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <button className="w-full bg-[#3e2723] hover:bg-[#2b1b19] text-white font-bold py-4 uppercase tracking-widest text-xs transition-all mt-4">
                  Establish My Schedule
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-screen overflow-hidden"
          >
            {/* Header */}
            <header className="bg-[#3e2723] text-white flex justify-between items-center px-10 py-4 h-16 shrink-0">
              <div className="flex items-center gap-4">
                <div className="font-bold text-xl tracking-tighter uppercase">BowelPreppr</div>
                <div className="h-6 w-[1px] bg-white/20"></div>
                <div className="text-[10px] uppercase tracking-[0.2em] opacity-80 whitespace-nowrap">Clinical Prep Assistant</div>
              </div>
              <div className="flex items-center gap-6 text-[11px] uppercase tracking-widest font-medium">
                <div className="flex gap-2">
                  <span className="opacity-60">Medication:</span>
                  <span>{prepType}</span>
                </div>
                <div className="flex gap-2">
                  <span className="opacity-60">Procedure:</span>
                  <span>{new Date(procDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <button onClick={() => setIsSetup(false)} className="hover:opacity-60 transition-opacity">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Timeline - Moved to top below header */}
            <div className="bg-[#f5f5f5] border-b border-black flex items-center justify-between px-10 py-4 shrink-0">
              {daysArray.length > 0 ? daysArray.map((day, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col items-center gap-1 group cursor-pointer transition-all ${activeDay && day.daysOut === activeDay.daysOut ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
                >
                  <div className={`w-2 h-2 ${
                    day.daysOut === 0 ? 'bg-[var(--highlight)]' : 
                    (activeDay && day.daysOut === activeDay.daysOut) ? 'bg-[#3e2723]' : 
                    'bg-slate-400 group-hover:bg-[#3e2723]'
                  }`}></div>
                  <div className="text-[9px] font-bold uppercase tracking-tighter">
                    {day.daysOut === 0 ? 'Proc' : `Day -${day.daysOut}`}
                  </div>
                </div>
              )) : (
                <div className="text-[10px] uppercase font-bold text-[#666] w-full text-center py-1">Initializing Schedule...</div>
              )}
            </div>

            <main className="flex-grow grid grid-cols-1 md:grid-cols-[280px_1fr_340px] gap-0 min-h-0 bg-white">
              {/* Left Column: Educational Panel */}
              <aside className="border-r border-black flex flex-col divide-y divide-black bg-[#fcfcfc] overflow-y-auto custom-scrollbar">
                <div className="p-8 flex flex-col gap-4">
                  <div className="text-[10px] uppercase tracking-widest font-black text-[var(--highlight)]">Understanding</div>
                  <h3 className="font-bold text-lg leading-tight uppercase tracking-tight">What is a colonoscopy?</h3>
                  <p className="text-sm text-[#444] leading-relaxed">
                    A test where doctors send a thin, flexible camera into your intestines to check for abnormalities that could develop into cancers.
                  </p>
                </div>
                <div className="p-8 flex flex-col gap-4">
                  <div className="text-[10px] uppercase tracking-widest font-black text-[var(--highlight)]">Rationale</div>
                  <h3 className="font-bold text-lg leading-tight uppercase tracking-tight">The goal of Bowel Prep</h3>
                  <p className="text-sm text-[#444] leading-relaxed">
                    A successful colonoscopy requires your intestines to be completely clear so that the camera can see all of the bowel walls clearly — bowel prep ensures this. If there is any residual faeces, it could obscure abnormalities and lead to missing big problems.
                  </p>
                </div>
              </aside>
              {/* Middle Column: Instructions & Status */}
              <section className="flex flex-col p-10 gap-8 overflow-y-auto custom-scrollbar min-h-0">
                <div className="grid grid-cols-2 gap-8">
                  <div className="border border-black p-6 flex flex-col justify-center">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-black text-[#666] mb-2">Countdown</div>
                    <div className="text-3xl font-mono tracking-tighter text-[var(--highlight)]">{timeRemaining || 'T-MINUS CALCULATING'}</div>
                  </div>
                  <div className="border border-black p-6 flex flex-col justify-center">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-black text-[#666] mb-2">Status</div>
                    <div className="text-xl font-bold uppercase tracking-tight text-[var(--highlight)]">
                      {daysArray.length > 0 && today < new Date(new Date(daysArray[0].date).setHours(0,0,0,0)) && 'Pre-preparation phase'}
                      {daysArray.length > 0 && today > new Date(new Date(daysArray[daysArray.length-1].date).setHours(0,0,0,0)) && 'Procedure complete'}
                      {activeDay && today.getTime() === new Date(new Date(activeDay.date).setHours(0,0,0,0)).getTime() && (activeDay.daysOut === 0 ? 'Clinical Execution' : 'Preparation Phase')}
                    </div>
                  </div>
                </div>

                <div className="border border-black p-8 flex flex-col min-h-0">
                  {daysArray.length > 0 && today < new Date(new Date(daysArray[0].date).setHours(0,0,0,0)) ? (
                    <div className="py-20 text-center flex flex-col gap-4">
                      <h2 className="text-3xl font-black uppercase tracking-tighter">Early Horizon</h2>
                      <p className="text-sm uppercase tracking-widest font-bold text-[#666]">You are more than 7 days out from your procedure.</p>
                      <p className="text-xs italic text-slate-500">Please return to this protocol when you are within 7 days of the scheduled date.</p>
                    </div>
                  ) : daysArray.length > 0 && today > new Date(new Date(daysArray[daysArray.length-1].date).setHours(0,0,0,0)) ? (
                    <div className="py-20 text-center flex flex-col gap-4">
                      <h2 className="text-3xl font-black uppercase tracking-tighter">Protocol Terminated</h2>
                      <p className="text-sm uppercase tracking-widest font-bold text-[#666]">Your scheduled colonoscopy has now been completed.</p>
                      <p className="text-xs italic text-[var(--highlight)] font-bold uppercase tracking-widest">Post-Clinical Status: Active</p>
                    </div>
                  ) : activeDay ? (
                    <>
                      <header className="flex justify-between items-start mb-10 border-b border-black pb-6">
                        <div>
                          <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">
                            {activeDay.daysOut === 0 ? 'Day of Procedure' : `Phase: Day -${activeDay.daysOut}`}
                          </h2>
                          <p className="text-sm text-[#666] tracking-tight">Protocol must be followed with 100% adherence.</p>
                        </div>
                        {activeDay.daysOut === 0 && (
                          <div className="bg-[var(--highlight)] text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                            Mandatory Fast
                          </div>
                        )}
                      </header>

                      <div className="space-y-6">
                        {activeDay.instructions.length > 0 ? (
                          activeDay.instructions.map((inst, i) => (
                            <div key={i} className="flex gap-6 items-start">
                              <div className={`w-12 h-12 flex items-center justify-center shrink-0 border border-black text-xl ${
                                inst.type === 'diet' ? 'bg-[#f5f5f5]' :
                                inst.type === 'medication' ? 'bg-[#3e2723] text-white' :
                                'bg-[var(--highlight)] text-white border-[var(--highlight)]'
                              }`}>
                                {inst.type === 'diet' && '01'}
                                {inst.type === 'medication' && '02'}
                                {inst.type === 'warning' && '!!'}
                              </div>
                              <div>
                                <div className={`font-bold text-lg uppercase tracking-tight leading-none mb-2 ${inst.type === 'warning' ? 'text-[var(--highlight)]' : ''}`}>{inst.title}</div>
                                <div className="text-sm text-[#444] leading-relaxed max-w-xl">{inst.content}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-[#666] border border-dashed border-slate-300">
                            <p className="text-sm uppercase tracking-widest font-bold">Standard Maintenance</p>
                            <p className="text-xs mt-2 italic">Low-residue diet. Monitor hydration levels.</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-20 text-center uppercase tracking-widest font-black opacity-20">Loading Instructions...</div>
                  )}
                </div>
              </section>

              {/* Right Column: Symptoms & AI */}
              <aside className="border-l border-black flex flex-col h-full overflow-hidden bg-[#fcfcfc]">
                {/* Symptom Log */}
                <div className="p-8 border-b border-black flex flex-col h-[350px]">
                  <header className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-tighter text-sm">
                      <Activity className="w-4 h-4 text-[#3e2723]" />
                      Symptom Tracker
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setShowSymptomForm(true)}
                        className="p-1 px-2 border border-black hover:bg-black hover:text-white transition-all text-xs font-bold uppercase tracking-widest"
                      >
                        Add
                      </button>
                      <button 
                        onClick={downloadSymptomLog}
                        disabled={symptoms.length === 0}
                        className="p-1 px-2 border border-black hover:bg-black hover:text-white transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
                      >
                        Download
                      </button>
                    </div>
                  </header>

                  <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1">
                    {symptoms.length > 0 ? (
                      symptoms.map(s => (
                        <div key={s.id} className="border border-black p-3 bg-white flex items-center justify-between group">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-[10px] uppercase tracking-widest">{s.type}</span>
                              <span className={`text-[8px] px-1 border font-bold uppercase ${
                                s.severity === 'Mild' ? 'border-green-600 text-green-600' :
                                s.severity === 'Moderate' ? 'border-amber-600 text-amber-600' :
                                'border-red-600 text-red-600'
                              }`}>
                                {s.severity}
                              </span>
                            </div>
                            <div className="text-[9px] text-[#666] uppercase">{s.time}</div>
                          </div>
                          <button 
                            onClick={() => deleteSymptom(s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-red-600 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex items-center justify-center text-[#666] text-[10px] uppercase tracking-widest font-bold opacity-30 italic">
                        Empty Log
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Assistant */}
                <div className="p-8 flex-grow flex flex-col min-h-0">
                  <header className="flex items-center gap-2 font-bold uppercase tracking-tighter text-sm mb-6">
                    <MessageSquare className="w-4 h-4 text-[#3e2723]" />
                    Protocol Assistant
                  </header>
                  
                  <div className="flex-grow border border-black p-4 mb-4 overflow-y-auto custom-scrollbar flex flex-col gap-6 bg-white">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`p-4 text-xs leading-relaxed bubble ${
                        msg.role === 'user' 
                          ? 'bg-[#3e2723] text-white self-end ml-6 bubble-user' 
                          : 'bg-[#f5f5f5] text-[#1a1a1a] self-start mr-6 bubble-ai'
                      }`}>
                        {msg.text}
                      </div>
                    ))}
                    {loading && (
                      <div className="text-[9px] uppercase tracking-widest text-[#3e2723] animate-pulse font-black px-1">
                        Consulting clinical knowledge base...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={askAI} className="flex flex-col gap-2">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask me a question"
                      className="w-full border border-black p-3 text-[10px] uppercase font-bold tracking-widest outline-none focus:bg-[#f5f5f5]"
                    />
                    <button className="bg-[#3e2723] text-white p-3 hover:bg-[#2b1b19] transition-all text-xs font-black uppercase tracking-[0.3em]">
                      Send message
                    </button>
                  </form>
                  <div className="flex items-center justify-center gap-1.5 mt-4 text-[8px] uppercase tracking-widest font-black opacity-30">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified RAG Protocol
                  </div>
                </div>
              </aside>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Symptom Logging Modal */}
      <AnimatePresence>
        {showSymptomForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSymptomForm(false)}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-white border border-[#3e2723] relative w-full max-w-sm p-10"
            >
              <h3 className="text-xl font-bold mb-8 uppercase tracking-tighter">Log Interaction</h3>
              <form onSubmit={logSymptom} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-[#666] mb-2">Symptom Type</label>
                  <select 
                    className="w-full p-2 border border-black outline-none bg-white font-bold uppercase text-xs"
                    value={newSymptom.type}
                    onChange={(e) => setNewSymptom(prev => ({ ...prev, type: e.target.value }))}
                  >
                    <option>Nausea</option>
                    <option>Cramping</option>
                    <option>Dizziness</option>
                    <option>Bloating</option>
                    <option>Headache</option>
                    <option>Chills</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-[#666] mb-2">Intensity</label>
                  <div className="grid grid-cols-3 gap-0 border border-black">
                    {['Mild', 'Moderate', 'Severe'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewSymptom(prev => ({ ...prev, severity: s as any }))}
                        className={`p-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                          newSymptom.severity === s 
                            ? 'bg-[#3e2723] text-white' 
                            : 'bg-white text-black hover:bg-[#f5f5f5]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-0 pt-4 flex-col gap-2">
                  <button 
                    type="submit"
                    className="w-full p-4 bg-[#3e2723] text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-[#2b1b19]"
                  >
                    Commit Log
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowSymptomForm(false)}
                    className="w-full p-4 border border-black text-xs font-black uppercase tracking-[0.3em] hover:bg-[#f5f5f5]"
                  >
                    Dismiss
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
