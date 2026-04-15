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
      return (localStorage.getItem('prepType') as PrepType) || 'Suprep';
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
    const header = `PrepGuide Symptom Log\nPrep Type: ${prepType}\nProcedure Date: ${procDate}\nGenerated: ${new Date().toLocaleString()}\n\n`;
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
    const target = new Date(procDate);
    for (let i = 7; i >= 0; i--) {
      const d = new Date(target);
      d.setDate(d.getDate() - i);
      dates.push({
        date: d,
        daysOut: i,
        instructions: PREP_DATA[prepType].filter(item => item.day === i)
      });
    }
    return dates;
  };

  // Find current day based on today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysArray = getDaysArray();
  const currentDayIndex = daysArray.findIndex(d => {
    const dCopy = new Date(d.date);
    dCopy.setHours(0, 0, 0, 0);
    return dCopy.getTime() === today.getTime();
  });
  
  // Default to Day -1 if today is not in range, or the closest day
  const activeDay = currentDayIndex !== -1 ? daysArray[currentDayIndex] : daysArray[6];

  return (
    <div className="min-h-screen p-6 flex flex-col gap-5 max-w-[1200px] mx-auto">
      <AnimatePresence mode="wait">
        {!isSetup ? (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-grow flex items-center justify-center"
          >
            <div className="glass w-full max-w-md p-10 rounded-[32px]">
              <div className="flex justify-center mb-8">
                <div className="w-16 h-16 bg-[#2563eb] rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  P
                </div>
              </div>
              <h1 className="text-3xl font-bold text-center mb-2 text-[#1e293b]">PrepGuide</h1>
              <p className="text-center text-[#64748b] mb-10">Personalized schedule for your procedure.</p>
              
              <form onSubmit={handleStart} className="space-y-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[#64748b] mb-2 ml-1">Procedure Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full p-4 rounded-2xl border border-white/60 bg-white/50 outline-none focus:ring-2 focus:ring-[#2563eb] transition-all"
                    onChange={(e) => setProcDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[#64748b] mb-2 ml-1">Prep Medication</label>
                  <select 
                    className="w-full p-4 rounded-2xl border border-white/60 bg-white/50 outline-none focus:ring-2 focus:ring-[#2563eb] transition-all appearance-none"
                    value={prepType}
                    onChange={(e) => setPrepType(e.target.value as PrepType)}
                  >
                    {Object.keys(PREP_DATA).map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <button className="w-full bg-[#2563eb] hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-[0.98] mt-4">
                  Generate My Schedule
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-grow flex flex-col gap-5"
          >
            {/* Header */}
            <header className="glass flex justify-between items-center px-8 py-5 rounded-[24px]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2563eb] rounded-xl flex items-center justify-center text-white font-bold">P</div>
                <div className="font-bold text-xl text-[#1e293b]">PrepPath</div>
              </div>
              <div className="bg-white/50 px-5 py-2 rounded-full text-sm flex items-center gap-3 border border-white/60">
                <span className="text-[#64748b]">Prep Type:</span>
                <strong className="text-[#1e293b]">{prepType}</strong>
                <span className="w-px h-4 bg-slate-300 mx-1"></span>
                <span className="text-[#64748b]">Date:</span>
                <strong className="text-[#1e293b]">{new Date(procDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                <button onClick={() => setIsSetup(false)} className="ml-2 p-1 hover:bg-white/80 rounded-full transition-colors">
                  <Settings className="w-4 h-4 text-[#64748b]" />
                </button>
              </div>
            </header>

            <div className="flex-grow grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 min-h-0">
              <div className="flex flex-col gap-5 min-h-0">
                <div className="grid grid-cols-2 gap-5 h-[140px]">
                  <div className="glass p-6 flex flex-col justify-center rounded-[24px]">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-[#64748b] mb-1">Time Remaining</div>
                    <div className="text-2xl font-bold text-[#1e293b]">{timeRemaining || 'Calculating...'}</div>
                  </div>
                  <div className="glass p-6 flex flex-col justify-center rounded-[24px]">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-[#64748b] mb-1">Status</div>
                    <div className="text-2xl font-bold text-[#f59e0b]">Active Prep Stage</div>
                  </div>
                </div>

                <div className="glass flex-grow p-8 rounded-[24px] relative overflow-hidden flex flex-col min-h-0">
                  <div className="absolute top-8 right-8 bg-[#ef4444] text-white px-3 py-1 rounded-lg font-bold text-xs uppercase tracking-wider">
                    {activeDay.daysOut === 0 ? 'PROCEDURE DAY' : 'CRITICAL DAY'}
                  </div>
                  
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-1">
                    {activeDay.daysOut === 0 ? 'Procedure Day' : `Day -${activeDay.daysOut}: Preparation Phase`}
                  </h2>
                  <p className="text-[#64748b] text-sm mb-8">Follow these instructions strictly to ensure a clear view for your procedure.</p>

                  <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-4">
                    {activeDay.instructions.length > 0 ? (
                      activeDay.instructions.map((inst, i) => (
                        <div key={i} className="flex gap-4 p-5 bg-white/30 rounded-2xl border border-white/40 shadow-sm">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-xl ${
                            inst.type === 'diet' ? 'bg-[#dcfce7] text-[#166534]' :
                            inst.type === 'medication' ? 'bg-[#dbeafe] text-[#1e40af]' :
                            'bg-[#fef3c7] text-[#92400e]'
                          }`}>
                            {inst.type === 'diet' && '☕'}
                            {inst.type === 'medication' && '🧪'}
                            {inst.type === 'warning' && '⚠️'}
                          </div>
                          <div>
                            <div className="font-bold text-[#1e293b]">{inst.title}</div>
                            <div className="text-sm text-[#1e293b]/80 mt-1 leading-relaxed">{inst.content}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-[#64748b] italic">
                        <Info className="w-12 h-12 mb-3 opacity-20" />
                        <p>Maintain normal low-fiber diet. Stay hydrated.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5 min-h-0">
                {/* Symptom Tracker Card */}
                <div className="glass p-6 rounded-[24px] flex flex-col min-h-0 max-h-[300px]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-bold text-[#1e293b]">
                      <Activity className="w-5 h-5 text-[#ef4444]" />
                      Symptom Log
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowSymptomForm(true)}
                        className="p-1.5 bg-[#2563eb] text-white rounded-lg hover:bg-blue-700 transition-colors"
                        title="Log Symptom"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={downloadSymptomLog}
                        disabled={symptoms.length === 0}
                        className="p-1.5 bg-white/50 text-[#1e293b] border border-white/60 rounded-lg hover:bg-white/80 transition-colors disabled:opacity-50"
                        title="Download Log"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {symptoms.length > 0 ? (
                      symptoms.map(s => (
                        <div key={s.id} className="bg-white/40 p-3 rounded-xl border border-white/50 flex items-center justify-between group">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-[#1e293b]">{s.type}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                s.severity === 'Mild' ? 'bg-emerald-100 text-emerald-700' :
                                s.severity === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {s.severity}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#64748b] mt-0.5">{s.time}</div>
                          </div>
                          <button 
                            onClick={() => deleteSymptom(s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[#ef4444] hover:bg-red-50 rounded-md transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-[#64748b] text-xs italic opacity-60">
                        No symptoms logged
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Assistant Card */}
                <div className="glass p-6 rounded-[24px] flex-grow flex flex-col min-h-0">
                  <div className="flex items-center gap-2 font-bold text-[#1e293b] mb-4">
                    <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse"></div>
                    Prep Assistant
                  </div>
                  
                  <div className="flex-grow bg-white/20 rounded-2xl p-4 mb-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`p-3 px-4 rounded-2xl text-sm max-w-[90%] ${
                        msg.role === 'user' 
                          ? 'bg-[#2563eb] text-white self-end rounded-br-none' 
                          : 'bg-white text-[#1e293b] self-start rounded-bl-none shadow-sm'
                      }`}>
                        {msg.text}
                      </div>
                    ))}
                    {loading && (
                      <div className="text-[10px] text-[#64748b] animate-pulse flex items-center gap-1 ml-1">
                        AI is verifying sources...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={askAI} className="flex gap-2">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about food, meds..."
                      className="flex-grow bg-white/50 border border-white/60 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2563eb] transition-all"
                    />
                    <button className="bg-[#2563eb] text-white p-3 rounded-xl hover:bg-blue-700 transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  
                  <div className="flex items-center justify-center gap-1.5 mt-4 text-[#10b981] font-bold text-[10px] uppercase tracking-widest">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified by Clinical RAG Sources
                  </div>
                </div>
              </div>
            </div>

            <div className="glass h-[100px] rounded-[24px] flex items-center justify-around px-8">
              {daysArray.map((day, idx) => (
                <div key={idx} className={`flex flex-col items-center gap-2 transition-all ${day.daysOut === activeDay.daysOut ? 'opacity-100 scale-110' : 'opacity-40 hover:opacity-60'}`}>
                  <div className={`w-3 h-3 rounded-full ${
                    day.daysOut === 0 ? 'bg-[#ef4444]' : 
                    day.daysOut === activeDay.daysOut ? 'bg-[#2563eb] shadow-[0_0_10px_#2563eb]' : 
                    'bg-[#64748b]'
                  }`}></div>
                  <div className="text-[10px] font-bold uppercase tracking-tighter text-[#1e293b]">
                    {day.daysOut === 0 ? 'Proc' : `Day -${day.daysOut}`}
                  </div>
                </div>
              ))}
            </div>
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
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass relative w-full max-w-sm p-8 rounded-[32px] shadow-2xl"
            >
              <h3 className="text-xl font-bold text-[#1e293b] mb-6 flex items-center gap-2">
                <Activity className="w-6 h-6 text-[#ef4444]" />
                Log Symptom
              </h3>
              <form onSubmit={logSymptom} className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[#64748b] mb-2">Symptom Type</label>
                  <select 
                    className="w-full p-3 rounded-xl border border-white/60 bg-white/50 outline-none focus:ring-2 focus:ring-[#2563eb] transition-all"
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
                  <label className="block text-xs uppercase tracking-widest font-bold text-[#64748b] mb-2">Severity</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Mild', 'Moderate', 'Severe'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewSymptom(prev => ({ ...prev, severity: s as any }))}
                        className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                          newSymptom.severity === s 
                            ? 'bg-[#2563eb] text-white border-[#2563eb]' 
                            : 'bg-white/50 text-[#64748b] border-white/60 hover:bg-white/80'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowSymptomForm(false)}
                    className="flex-1 p-3 rounded-xl font-bold text-[#64748b] hover:bg-white/50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 p-3 rounded-xl font-bold bg-[#2563eb] text-white shadow-lg hover:bg-blue-700 transition-all"
                  >
                    Log Entry
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
