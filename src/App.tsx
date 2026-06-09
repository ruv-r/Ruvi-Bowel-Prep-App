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
  Trash2,
  Lock,
  Compass,
  FileCode,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { askPrepAI } from './lib/gemini';

// --- Types & Data ---

type PrepType = 'Glycoprep O-Kit' | 'Glycoprep Orange' | 'MoviPrep' | 'Picolax' | 'Picoprep Orange' | 'Picosalax' | 'Plenvu' | 'Prepkit Orange';

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
  'Glycoprep O-Kit': [
    { day: 7, title: 'Low Residue Transition', content: 'Cease eating seeds, nuts, whole grains muesli, raw fruit/vegetables, or high-fiber foods to ensure a clean bowel.', type: 'diet' },
    { day: 1, title: 'Approved Clear Liquids Only', content: 'Strictly no solid food, milk, or alcohol. Consume clear water, strained soups/broths, pulp-free juice (apple, pear, white grape), black tea/coffee, clear sports drinks or jelly. Avoid red/purple colors.', type: 'diet' },
    { day: 1, title: 'Step 1: Bisacodyl Tablets (~2:00 PM)', content: 'Take the three (3) Bisacodyl tablets whole with one full glass (approx 250 mL) of water. Continue drinking clear liquids (at least 1 glass per hour). Do not crush or chew.', type: 'medication' },
    { day: 1, title: 'Step 2: Magnesium Citrate (~5:00 PM)', content: 'Slowly dissolve entire Magnesium Citrate sachet in 250 mL of warm water. Stir until fizzing stops, let it cool or chill, and drink it completely. Follow with clear fluids.', type: 'medication' },
    { day: 1, title: 'Step 3: Glycoprep Orange (~7:00 PM)', content: 'Mix Glycoprep sachet in 1L of water. Drink 1 to 2 glasses (250 mL each) every 15-20 minutes until complete. If nauseated, slow down. Stay near a toilet.', type: 'medication' },
    { day: 0, title: 'Fast Completely', content: 'Strictly no food, drink, or water starting 2 hours prior to your scheduled procedure time.', type: 'warning' },
  ],
  'Glycoprep Orange': [
    { day: 7, title: 'Low Residue Diet Shift', content: 'Stop fiber supplements. Avoid fibrous foods, cereals, raw vegetable matter, skin-on fresh fruits, and nuts/seeds.', type: 'diet' },
    { day: 1, title: 'Clear Liquids Only Phase', content: 'No solid food or milk. Drink clear broth, clear water, black tea/coffee, pulp-free juice, clear sports drinks or pale jellies (strictly avoid red or purple dyes).', type: 'diet' },
    { day: 1, title: 'Prepare & Consume Glycoprep', content: 'Dissolve each 70g sachet (total of 210g) in 1L of water each (total 3L). Sip slowly drinking 1-2 glasses (250 mL each) every 15-20 minutes until completed. Keep hydrated.', type: 'medication' },
    { day: 0, title: 'Pre-Procedure Fasting', content: 'Do not eat or drink anything (including water) starting exactly 2 hours prior to your scheduled examination.', type: 'warning' },
  ],
  'MoviPrep': [
    { day: 7, title: 'Low Residue Regime', content: 'Avoid whole grain breads, cereals, nuts, corn, beans, and seeds of any kind.', type: 'diet' },
    { day: 1, title: 'Clear Liquids Only', content: 'Only clear fluids permitted. Drink water, clear broth, black coffee/tea without milk, plain gelatin, and pulp-free juices. Avoid anything colored red or purple.', type: 'diet' },
    { day: 1, title: 'MoviPrep Dose 1 (~6:00 PM)', content: 'Dissolve Sachet A and Sachet B of Dose 1 in 1L of water and stir until dissolved. Drink slowly over 1 hour. Follow with an extra 500 mL of clear fluids.', type: 'medication' },
    { day: 0, title: 'MoviPrep Dose 2 (Morning)', content: 'Exactly 6 hours before check-in: Dissolve Dose 2 Sachet A and Sachet B in 1L of water, drink over 1 hour, and follow with an extra 500 mL of clear fluids.', type: 'medication' },
    { day: 0, title: 'Nil By Mouth Fasting', content: 'You must stop drinking all fluids entirely at least 2 hours before your clinical procedure.', type: 'warning' },
  ],
  'Picolax': [
    { day: 7, title: 'Low Residue Plan', content: 'Cease eating fibrous whole grains, bran, seeds of any kind, and raw vegetables.', type: 'diet' },
    { day: 2, title: 'Low Residue Diet Step-Down', content: 'Switch to a low residue diet: boiled/poached eggs, white bread, cottage cheese, plain low-fat yogurt, steamed white fish, boiled chicken, skinless cooked potato.', type: 'diet' },
    { day: 1, title: 'Approved Clear Fluids Only', content: 'Strictly no solids, milk, or alcohol. Drink water, clear broth, pulp-free juice, light tea/coffee without milk, yellow or orange jelly, clear carbonated drinks.', type: 'diet' },
    { day: 1, title: 'First Picolax Dose (~3:00 PM)', content: 'Slowly dissolve 1 sachet in a large glass of cold water (approx. 250 mL). Stir and drink completely. Follow with a full glass of clear fluid, then 250 mL every hour.', type: 'medication' },
    { day: 1, title: 'Second Picolax Dose (~9:00 PM)', content: 'Add second sachet to 250 mL cold water. Drink completely. Follow with a full glass of clear water. Keep drinking 250 mL of clear fluids every hour until bedtime.', type: 'medication' },
    { day: 0, title: 'Hydration Fast Threshold', content: 'Keep drinking clear fluids (at least 250 mL per hour) until 6 hours prior to the procedure. Do not drink anything for the final 6 hours before procedure.', type: 'warning' },
  ],
  'Picoprep Orange': [
    { day: 7, title: 'Low Fiber Preparation', content: 'Avoid fiber supplements, tomato skin, kiwi, muesli, nuts, and red meats.', type: 'diet' },
    { day: 1, title: 'Clear Fluids Only', content: 'No solid food or milk. Drink clear broths, pale jellies, pulp-free fruit juices, black tea or coffee. Avoid red or purple dyes.', type: 'diet' },
    { day: 1, title: 'First Sachet (~3:00 PM)', content: 'Dissolve one sachet in 250 mL of warm water. Cool or chill. Drink followed by a glass of water, then drink at least 250 mL of clear fluids every hour.', type: 'medication' },
    { day: 1, title: 'Second Sachet (~9:00 PM)', content: 'Mix second sachet in 250 mL of water and drink. Follow with a glass of water. Keep drinking clear fluids (at least 250 mL hourly) until bedtime.', type: 'medication' },
    { day: 0, title: 'Fasting Block', content: 'No food, water, or drink of any kind is permitted starting exactly 2 hours prior to your scheduled examination time.', type: 'warning' },
  ],
  'Picosalax': [
    { day: 7, title: 'Fiber Restriction', content: 'Avoid wholegrains, hard seeds, cereals, nuts, and high-fiber foods.', type: 'diet' },
    { day: 1, title: 'Strict Clear Fluids Only', content: 'Zero solid food or dairy. Sip only clear fluids (soups, clear apple/pear juice, black tea/coffee, clear sports drinks). Avoid red or purple colorings.', type: 'diet' },
    { day: 1, title: 'Dose 1: Picosalax Sachet (Evening)', content: 'Stir one sachet of Picosalax in 150 mL of cold water for 2-3 minutes. Drink and follow with at least four 250 mL cups of clear fluids. Try to drink at least 250 mL every hour.', type: 'medication' },
    { day: 0, title: 'Dose 2: Picosalax Sachet (Morning)', content: 'Exactly 6 hours prior to check-in: Stir second sachet in 150 mL of cold water. Drink and follow with at least four 250 mL cups of clear fluids.', type: 'medication' },
    { day: 0, title: 'Fasting Block', content: 'Stop all clear fluid and water intake completely 2 hours before the scheduled medical registration time.', type: 'warning' },
  ],
  'Plenvu': [
    { day: 7, title: 'Low Fiber Diet', content: 'Stop eating heavy grains, seeds, hulls, and raw vegetable fiber.', type: 'diet' },
    { day: 1, title: 'Clear Liquids Day', content: 'Stop all solid meals. Drink filtered broths, clear gelatin, and pulp-free juices. No milk, dairy products, or red/purple colorings.', type: 'diet' },
    { day: 1, title: 'Plenvu Dose 1 (Evening)', content: 'Dilute Dose 1 Mango sachet in 500 mL water. Stir for 8 minutes. Drink slowly over 60 minutes. Drink an additional 500 mL of clear fluid over the next hour.', type: 'medication' },
    { day: 0, title: 'Plenvu Dose 2 (Morning)', content: 'Exactly 6 hours before check-in: Mix Dose 2 Fruit Punch sachets A and B in 500 mL water. Stir for 8 minutes and drink, followed by 500 mL of clear fluid.', type: 'medication' },
    { day: 0, title: 'Fluids Stop Time', content: 'Stop drinking all fluids completely at least 2 hours prior to your scheduled clinical procedure.', type: 'warning' },
  ],
  'Prepkit Orange': [
    { day: 7, title: 'Low Residue Diet Transition', content: 'Avoid high-fiber breads, raw vegetables, seeds, kiwi, tomatoes, and muesli.', type: 'diet' },
    { day: 1, title: 'Clear Liquids Only Phase', content: 'Strictly no solids, dairy, or alcohol. Drink water, clear broth, pulp-free juice, clear carbonated drinks, black tea/coffee. Avoid red/purple.', type: 'diet' },
    { day: 1, title: 'Step 1: Picoprep Orange (~3:00 PM)', content: 'Slowly mix first Picoprep sachet in 250 mL warm water. Drink followed by a glass of water. Drink at least 250 mL clear fluids every hour.', type: 'medication' },
    { day: 1, title: 'Step 2: Glycoprep Orange (~6:00 PM)', content: 'Mix Glycoprep sachet in 1L of water. Drink slowly over 1 hour. If nauseated, reduce rate of intake. Remain close to a toilet.', type: 'medication' },
    { day: 1, title: 'Step 3: Picoprep Orange (~9:00 PM)', content: 'Mix second Picoprep sachet in 250 mL warm water. Drink followed by a glass of water. Continue clear fluids until bedtime.', type: 'medication' },
    { day: 0, title: 'Pre-Procedure fluid fast', content: 'No food, water, or drink should be taken starting exactly 2 hours prior to your scheduled examination.', type: 'warning' },
  ]
};

// --- Main Component ---

export default function App() {
  const [procDate, setProcDate] = useState('');
  const [prepType, setPrepType] = useState<PrepType | ''>('');
  // State to check if user has finished setup
  const [isSetup, setIsSetup] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>(() => {
    try {
      const saved = localStorage.getItem('chatHistory');
      return saved ? JSON.parse(saved) : [
        { role: 'ai', text: 'Hello! I am your clinical protocol assistant. Ask me any question regarding your dietary limits, dosage, or scheduling.' }
      ];
    } catch (e) {
      return [{ role: 'ai', text: 'Hello! I am your clinical protocol assistant. Ask me any question regarding your dietary limits, dosage, or scheduling.' }];
    }
  });
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [timeRemaining, setTimeRemaining] = useState('');

  // Timeline & active-view selection
  const [selectedDayOverride, setSelectedDayOverride] = useState<number | null>(null);

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
        setTimeRemaining('PROCEDURE COMPLETED');
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
    if (procDate) {
      setIsSetup(true);
      setSelectedDayOverride(null); // Reset override on entry setup
    }
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysArray = getDaysArray();

  // Diff in days from procedure date
  const targetDateObj = new Date(procDate);
  targetDateObj.setHours(0, 0, 0, 0);
  const diffTime = targetDateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const currentDayIndex = daysArray.length > 0 ? daysArray.findIndex(d => {
    const dCopy = new Date(d.date);
    dCopy.setHours(0, 0, 0, 0);
    return dCopy.getTime() === today.getTime();
  }) : -1;
  
  // Decide which day's instructions we show
  // If the user manually overrides, use that.
  // Otherwise, default to matching today. If today is out of bounds, default to day -1 (index 6, day before procedure).
  const autoActiveDay = currentDayIndex !== -1 ? daysArray[currentDayIndex] : (daysArray.length > 0 ? daysArray[6] : null);
  const activeDay = selectedDayOverride !== null 
    ? (daysArray.find(d => d.daysOut === selectedDayOverride) || autoActiveDay) 
    : autoActiveDay;

  // Let's compute progress percentage for circular indicator (Inspired by circular stat gauge in image)
  // Day 7 -> 12.5%, Day 6 -> 25%, Day 1 -> 87.5%, Day 0 -> 100%
  const getProgressPercentage = () => {
    if (!activeDay) return 0;
    const daysFromStart = 7 - activeDay.daysOut;
    return Math.min(100, Math.max(0, Math.round((daysFromStart / 7) * 100)));
  };

  return (
    <div className="min-h-screen p-0 flex flex-col font-sans bg-[#f4f8f6] text-[#0f172a]">
      <AnimatePresence mode="wait">
        {!isSetup ? (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex-grow flex items-center justify-center p-6 bg-[#f4f8f6]"
          >
            {/* Elegant Setup Card inspired by Screen 1 of Health UX Kit */}
            <div className="bg-white border border-teal-500/10 rounded-[32px] shadow-[0_20px_50px_rgba(0,162,138,0.06)] w-full max-w-md p-10 relative overflow-hidden flex flex-col items-center">
              
              {/* Patient Friendly Greetings */}
              <h1 className="text-[28px] font-extrabold text-center mb-1 text-slate-900 tracking-tight leading-tight mt-4">Welcome to BowelPreppr</h1>
              <p className="text-center text-slate-500 mb-8 text-sm">Your modern, clear, patiently focused medical schedule tool.</p>

              <form onSubmit={handleStart} className="w-full space-y-5">
                <div className="bg-[#fcfdfd] border border-slate-200/60 hover:border-[#00bfa5]/40 p-4 rounded-2xl transition-all">
                  <label className="block text-[10px] uppercase tracking-widest font-extrabold text-[#00a28a] mb-1.5">Procedure Date</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#00a28a] shrink-0" />
                    <input 
                      type={procDate ? "date" : "text"} 
                      required
                      placeholder="DD/MM/YYYY"
                      value={procDate}
                      onFocus={(e) => { e.currentTarget.type = "date"; }}
                      onBlur={(e) => { if (!e.currentTarget.value) e.currentTarget.type = "text"; }}
                      className={`w-full text-sm font-semibold bg-transparent outline-none date-input-field cursor-pointer ${procDate ? 'text-slate-800' : 'text-slate-400'}`}
                      onChange={(e) => setProcDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-[#fcfdfd] border border-slate-200/60 hover:border-[#00bfa5]/40 p-4 rounded-2xl transition-all">
                  <label className="block text-[10px] uppercase tracking-widest font-extrabold text-[#00a28a] mb-1.5">What bowel preparation kit are you using?</label>
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-[#00a28a] shrink-0" />
                    <select 
                      required
                      className={`w-full text-sm font-bold bg-transparent outline-none appearance-none cursor-pointer ${prepType ? 'text-slate-800' : 'text-slate-400 font-medium'}`}
                      value={prepType}
                      onChange={(e) => setPrepType(e.target.value as PrepType)}
                    >
                      <option value="" disabled className="text-slate-400">Please select</option>
                      {Object.keys(PREP_DATA).map(type => <option key={type} className="bg-white font-semibold py-2 text-slate-800" value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full py-4 text-xs font-bold uppercase tracking-widest text-white transition-all duration-200 health-button active:scale-[0.98] mt-3"
                >
                  Get Started
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-screen overflow-hidden bg-[#f4f8f6]"
          >
            {/* Premium App Bar with signature Plus icon */}
            <header className="bg-white border-b border-teal-500/10 text-slate-900 flex justify-between items-center px-8 py-3 h-16 shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-tr from-[#00bfa5] to-[#00a28a] rounded-xl flex items-center justify-center text-white shadow-[0_4px_10px_rgba(0,162,138,0.2)]">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <div className="font-extrabold text-lg text-slate-900 tracking-tight leading-none">BowelPreppr</div>
                  <div className="text-[10px] font-semibold text-[#00a28a] tracking-wider uppercase mt-0.5">Clinical Protocol Suite</div>
                </div>
              </div>
              
              <div className="flex items-center gap-6 text-[12px] font-semibold text-slate-600">
                <div className="hidden sm:flex gap-1.5 px-3 py-1.5 bg-[#f4f8f6] rounded-full border border-slate-200/30 items-center">
                  <span className="opacity-60 text-[10px]">Medication:</span>
                  <span className="text-[#00a28a] font-bold">{prepType}</span>
                </div>
                <div className="hidden sm:flex gap-1.5 px-3 py-1.5 bg-[#f4f8f6] rounded-full border border-slate-200/30 items-center">
                  <span className="opacity-60 text-[10px]">Procedure:</span>
                  <span className="text-[#00a28a] font-bold">
                    {new Date(procDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <button 
                  onClick={() => setIsSetup(false)} 
                  className="w-8 h-8 rounded-full bg-[#f4f8f6] border border-slate-200/40 flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer text-slate-500 hover:text-[#00bfa5]"
                  title="Configure Schedule Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Timeline navigation - Fully redesigned as active capsules linking steps beautifully */}
            <div className="bg-white border-b border-teal-500/10 flex items-center justify-between px-8 py-3.5 shrink-0 overflow-x-auto no-scrollbar gap-2 shadow-[0_2px_15px_rgba(0,0,0,0.01)]">
              {daysArray.length > 0 ? daysArray.map((day, idx) => {
                const isSelected = activeDay && day.daysOut === activeDay.daysOut;
                const isRealToday = currentDayIndex === idx;
                
                return (
                  <button 
                    key={idx} 
                    onClick={() => setSelectedDayOverride(day.daysOut)}
                    className={`flex items-center gap-2 group px-4 py-2 rounded-full cursor-pointer transition-all shrink-0 ${
                      isSelected 
                        ? 'bg-[#00a28a]/10 border border-[#00a28a]/40 text-[#00a28a] font-bold shadow-sm' 
                        : 'border border-transparent hover:bg-slate-100 text-slate-500'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-110 ${
                      day.daysOut === 0 
                        ? 'bg-[#ef4444]' 
                        : isSelected 
                          ? 'bg-[#00bfa5]' 
                          : 'bg-slate-300 group-hover:bg-slate-400'
                    }`} />
                    <div className="text-[10px] tracking-wider uppercase font-semibold">
                      {day.daysOut === 0 ? 'Procedure' : `Day -${day.daysOut}`}
                    </div>
                  </button>
                );
              }) : (
                <div className="text-[10px] uppercase font-bold text-slate-400 w-full text-center py-1">Initializing Dynamic Schedule...</div>
              )}
            </div>

            {/* Dashboard Workspace */}
            <main className="flex-grow grid grid-cols-1 md:grid-cols-[290px_1fr_340px] gap-0 min-h-0 bg-[#f4f8f6]">
              
              {/* Left Column: Layman-friendly educational panel */}
              <aside className="border-r border-teal-500/10 flex flex-col gap-5 p-6 overflow-y-auto custom-scrollbar bg-white/70 backdrop-blur-md">
                <div className="health-card p-6 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center text-[#00a28a] shrink-0">
                      <Compass className="w-4 h-4" />
                    </div>
                    <div className="text-[11px] uppercase tracking-wider font-extrabold text-[#00a28a]">Understanding</div>
                  </div>
                  <h3 className="font-bold text-md text-slate-800 tracking-tight">What is a colonoscopy?</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A simple medical test where doctors send a thin, flexible camera into your intestines to inspect the walls and check for abnormalities that could develop into cancers.
                  </p>
                </div>

                <div className="health-card p-6 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center text-[#00a28a] shrink-0">
                      <FileCode className="w-4 h-4" />
                    </div>
                    <div className="text-[11px] uppercase tracking-wider font-extrabold text-[#00a28a]">The Strategy</div>
                  </div>
                  <h3 className="font-bold text-md text-slate-800 tracking-tight">The goal of Bowel Prep</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A successful colonoscopy requires your intestines to be completely clear so that the camera can see all of the bowel walls clearly — bowel prep ensures this.
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed bg-[#f4f8f6] p-2.5 rounded-xl border border-teal-500/10 italic">
                    If there is any residual faeces, the camera could obscure any abnormalities and lead to potentially missing big, important problems.
                  </p>
                </div>

                {/* Helpful Contact Banner */}
                <div className="health-card bg-gradient-to-tr from-[#00bfa5]/10 to-[#00a28a]/5 p-5 border border-teal-200/20 flex flex-col gap-1 rounded-2xl">
                  <span className="text-[9px] font-extrabold uppercase text-[#00a28a] tracking-widest">Medical Disclaimer</span>
                  <span className="text-[11px] text-slate-700 leading-relaxed mt-1">If you experience severe pain, bleeding, or extreme dehydration, call your physician's hotline immediately.</span>
                </div>
              </aside>

              {/* Middle Column: Instructions, countdown circular tracker widget */}
              <section className="flex flex-col p-8 gap-6 overflow-y-auto custom-scrollbar min-h-0">
                
                {/* Gauge Row Inspired by Circular Status Tracker from the Image */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 shrink-0">
                  
                  {/* Gauge Card */}
                  <div className="health-card p-6 flex items-center gap-5 justify-between relative overflow-hidden bg-white">
                    <div className="flex flex-col justify-center">
                      <div className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748b] mb-1">Schedule Progress</div>
                      <h4 className="text-2xl font-black text-slate-800 tracking-tight">Active Cleanse</h4>
                      <p className="text-xs text-slate-500 mt-1">Countdown: {timeRemaining || 'T-MIN'}</p>
                    </div>

                    {/* Circular Tracker Vector Graphic Circle */}
                    <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle 
                          cx="40" 
                          cy="40" 
                          r="32" 
                          className="text-slate-100" 
                          strokeWidth="6" 
                          stroke="currentColor" 
                          fill="transparent" 
                        />
                        <circle 
                          cx="40" 
                          cy="40" 
                          r="32" 
                          className="text-[#00bfa5] transition-all duration-1000" 
                          strokeWidth="6" 
                          strokeDasharray={2 * Math.PI * 32}
                          strokeDashoffset={2 * Math.PI * 32 * (1 - getProgressPercentage() / 100)}
                          strokeLinecap="round" 
                          stroke="currentColor" 
                          fill="transparent" 
                        />
                      </svg>
                      {/* Central stat text */}
                      <span className="absolute text-xs font-black text-slate-800">
                        {getProgressPercentage()}%
                      </span>
                    </div>
                  </div>

                  {/* Status Indicator Panel */}
                  <div className="health-card p-6 flex flex-col justify-between bg-white">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748b] mb-1">Status Phase</div>
                      <div className="text-2xl font-black tracking-tight text-[#00a28a] uppercase">
                        {diffDays > 7 && 'Pre-Preparation'}
                        {diffDays < 0 && 'Procedure Complete'}
                        {diffDays >= 0 && diffDays <= 7 && (activeDay?.daysOut === 0 ? 'Clinical Day' : 'Preparation Phase')}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 italic mt-2 block font-medium">
                        {diffDays > 7 && 'Awaiting the 7-day preparation horizon.'}
                        {diffDays < 0 && 'Post-clinical protocol achieved successfully.'}
                        {diffDays >= 0 && diffDays <= 7 && 'Follow protocol with strict physical compliance.'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary Instructions Console */}
                <div className="health-card p-8 flex flex-col min-h-0 bg-white">
                  
                  {diffDays > 7 ? (
                    /* More than 7 days ahead view */
                    <div className="py-12 text-center flex flex-col items-center gap-4 max-w-md mx-auto">
                      <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-[#00a28a] mb-2">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight uppercase">Early Horizon</h2>
                      <p className="text-sm font-semibold text-[#00a28a] bg-[#00a28a]/10 px-4 py-1.5 rounded-full">Pre-preparation phase active</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your input procedure date is still more than 7 days out. <strong>Please return to this protocol application when there are 7 days remaining</strong> to initiate your customized low-residue physical diet preparation.
                      </p>
                    </div>
                  ) : diffDays < 0 ? (
                    /* Dates in the past view */
                    <div className="py-12 text-center flex flex-col items-center gap-4 max-w-md mx-auto">
                      <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-[#00bfa5] mb-2">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-[#00a28a] tracking-tight uppercase">Procedure Completed</h2>
                      <p className="text-sm font-bold text-slate-600">Protocol is now terminated.</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your scheduled colonoscopy date has passed. The clinical preparation phases have been fully executed. Ensure you follow any post-colonoscopy eating parameters advised by your clinical physician.
                      </p>
                    </div>
                  ) : activeDay ? (
                    <>
                      <header className="flex justify-between items-start mb-8 border-b border-slate-100 pb-5">
                        <div>
                          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                            {activeDay.daysOut === 0 ? 'Day of Procedure' : `Clinical Day -${activeDay.daysOut}`}
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">Please adhere with 100% compliance to avoid repeating.</p>
                        </div>
                        {activeDay.daysOut === 0 && (
                          <span className="bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full">
                            Mandatory Fast
                          </span>
                        )}
                      </header>

                      <div className="space-y-5">
                        {activeDay.instructions.length > 0 ? (
                          activeDay.instructions.map((inst, i) => (
                            <div key={i} className="flex gap-4 items-start p-4 hover:bg-slate-50/50 rounded-2xl transition-all border border-slate-200/25">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                                inst.type === 'diet' ? 'bg-[#00a28a]/10 text-[#00a28a]' :
                                inst.type === 'medication' ? 'bg-[#00bfa5]/10 text-[#00bfa5]' :
                                'bg-red-50 text-red-500 border border-red-100'
                              }`}>
                                {inst.type === 'diet' && '🥛'}
                                {inst.type === 'medication' && '💊'}
                                {inst.type === 'warning' && '⚠️'}
                              </div>
                              <div>
                                <div className="font-bold text-sm text-slate-800 tracking-tight">{inst.title}</div>
                                <div className="text-xs text-slate-600 leading-relaxed mt-1">{inst.content}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-3xl">
                            <p className="text-xs uppercase tracking-widest font-black text-[#00a28a]">Hydration Sequence</p>
                            <p className="text-[11px] mt-2 italic">Standard low-residue diet limits. Ensure ongoing hydration fluids.</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-20 text-center uppercase tracking-widest font-black opacity-20">Loading Instructions...</div>
                  )}

                </div>
              </section>

              {/* Right Column: Symptoms Tracker & Protocol chatbot */}
              <aside className="border-l border-teal-500/10 flex flex-col h-full overflow-hidden bg-white">
                
                {/* Symptom Tracker Panel */}
                <div className="p-6 border-b border-teal-500/10 flex flex-col h-[280px]">
                  <header className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-black uppercase text-[12px] text-slate-800">
                      <Activity className="w-4 h-4 text-[#00a28a]" />
                      Symptom log
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowSymptomForm(true)}
                        className="py-1 px-3 bg-gradient-to-r from-[#00bfa5] to-[#00a28a] text-white text-[11px] font-bold uppercase tracking-widest rounded-full shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                      >
                        Add
                      </button>
                      <button 
                        onClick={downloadSymptomLog}
                        disabled={symptoms.length === 0}
                        className="py-1 px-3 border border-slate-200 text-slate-700 text-[11px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                      >
                        Download
                      </button>
                    </div>
                  </header>

                  <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {symptoms.length > 0 ? (
                      symptoms.map(s => (
                        <div key={s.id} className="border border-slate-200/60 p-3 bg-white hover:bg-slate-50/50 rounded-xl flex items-center justify-between group transition-colors">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-[10px] text-slate-800 uppercase tracking-widest">{s.type}</span>
                              <span className={`text-[8px] px-1.5 py-0.5 border font-semibold rounded-full uppercase ${
                                s.severity === 'Mild' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                s.severity === 'Moderate' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                'border-red-200 bg-red-50 text-red-700'
                              }`}>
                                {s.severity}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-400 font-semibold">{s.time}</div>
                          </div>
                          <button 
                            onClick={() => deleteSymptom(s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded-md transition-all cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[10px] uppercase tracking-widest font-bold opacity-40 italic">
                        Empty Log
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Assistant Chat Panel */}
                <div className="p-6 flex-grow flex flex-col min-h-0 bg-[#fbfdfc]">
                  <header className="flex items-center gap-2 font-black uppercase text-[12px] text-slate-800 mb-4">
                    <MessageSquare className="w-4 h-4 text-[#00a28a]" />
                    Protocol Assistant
                  </header>
                  
                  {/* Chat messages box with absolute fixed constraints and scroll limits */}
                  <div className="flex-grow border border-slate-200/50 rounded-2xl p-4 mb-4 overflow-y-auto custom-scrollbar flex flex-col gap-4 bg-white min-h-0 max-h-[300px]">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`conversation-bubble ${
                        msg.role === 'user' 
                          ? 'bubble-user self-end' 
                          : 'bubble-ai self-start'
                      }`}>
                        {msg.text}
                      </div>
                    ))}
                    {loading && (
                      <div className="text-[10px] uppercase tracking-widest text-[#00a28a] animate-pulse font-bold px-1">
                        Consulting clinical knowledge base...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
 
                  <form onSubmit={askAI} className="flex flex-col gap-2 shrink-0">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask me a question"
                      className="w-full border border-slate-200 focus:border-[#00bfa5] rounded-xl p-3 text-xs outline-none bg-white font-medium transition-all"
                    />
                    <button 
                      type="submit"
                      disabled={loading || !chatInput.trim()}
                      className="bg-gradient-to-r from-[#00bfa5] to-[#00a28a] text-white p-3 hover:opacity-95 transition-all text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      Send Message
                    </button>
                  </form>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-[9px] uppercase tracking-wider font-extrabold text-[#00a28a] opacity-65">
                    <CheckCircle2 className="w-3 h-3 text-[#00bfa5]" />
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-white border border-slate-100 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] relative w-full max-w-sm p-10 z-10"
            >
              <h3 className="text-lg font-black mb-6 uppercase tracking-tight text-slate-800">Log Interaction</h3>
              <form onSubmit={logSymptom} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Symptom Type</label>
                  <select 
                    className="w-full p-2.5 border border-slate-200 rounded-xl outline-none bg-white font-bold text-xs text-slate-800 appearance-none cursor-pointer"
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
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Intensity</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                    {['Mild', 'Moderate', 'Severe'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewSymptom(prev => ({ ...prev, severity: s as any }))}
                        className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          newSymptom.severity === s 
                            ? 'bg-[#00a28a] text-white shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-4 flex-col">
                  <button 
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-[#00bfa5] to-[#00a28a] text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Commit Log
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowSymptomForm(false)}
                    className="w-full py-3.5 border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 cursor-pointer"
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
