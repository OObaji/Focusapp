import React, { useState, useEffect, useRef, Fragment } from 'react';
import { CheckCircle2, Plus, Pencil, Trash2, Calendar, Wind, AlertTriangle, Sparkles, BrainCircuit, BarChart, Loader2, LayoutDashboard, List, Timer, Move, X, Sun, Cloud, CloudRain, CloudSnow, Zap, Wind as WindIcon, Target, Flag } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import * as Tone from 'tone';


// --- Firebase Configuration ---
// These global variables are provided by the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// setLogLevel('debug'); // Uncomment for detailed Firestore logs

// --- API Configurations ---
const GEMINI_API_KEY = ""; // Provided by the execution environment
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const WEATHER_API_KEY = "018d8c639c124eac95410622252107"; 


// --- Date Helper Functions ---
const formatDate = (date, options) => new Intl.DateTimeFormat('en-US', options).format(date);

const getCategoryDateHeader = (category, date) => {
  const today = new Date(date);
  switch (category) {
    case 'Today':
      return `Today • ${formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    case 'This Week':
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (startOfWeek.getDay() || 7)); // Adjust for Sunday as start of week
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `This Week • ${formatDate(startOfWeek, { month: 'short', day: 'numeric' })} - ${formatDate(endOfWeek, { day: 'numeric' })}`;
    case 'This Month':
      return `This Month • ${formatDate(today, { month: 'long' })}`;
    default:
      return category;
  }
};

const formatTaskTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `Added: ${formatDate(date, { month: 'short', day: 'numeric' })}`;
};

// --- Default data structure ---
const createInitialTasks = () => ({
  Today: { High: [], Medium: [], Low: [] },
  'This Week': { High: [], Medium: [], Low: [] },
  'This Month': { High: [], Medium: [], Low: [] },
});

const createInitialGoals = () => [];

const TIME_CATEGORIES = ['Today', 'This Week', 'This Month'];
const PRIORITY_LEVELS = ['High', 'Medium', 'Low'];

const PRIORITY_STYLES = {
  High: { bg: 'bg-red-100/50', border: 'border-red-500', text: 'text-red-700', ring: 'ring-red-500', base: 'red' },
  Medium: { bg: 'bg-orange-100/50', border: 'border-orange-500', text: 'text-orange-700', ring: 'ring-orange-500', base: 'orange' },
  Low: { bg: 'bg-green-100/50', border: 'border-green-500', text: 'text-green-700', ring: 'ring-green-500', base: 'green' },
};

// --- Logo Component ---
const Logo = ({ className }) => (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
        <CheckCircle2 className="text-indigo-500" size={32} />
        <span className="text-2xl font-bold text-gray-800 tracking-tight">Priority</span>
    </div>
);


// --- Main App Component ---
export default function App() {
  const [showLanding, setShowLanding] = useState(true);

  const handleEnterApp = () => setShowLanding(false);
  const handleReturnToLanding = () => setShowLanding(true);

  if (showLanding) {
      return <LandingPage onEnter={handleEnterApp} />;
  }
  
  return <PriorityApp onReturnToLanding={handleReturnToLanding} />;
}

// --- Landing Page Component ---
const LandingPage = ({ onEnter }) => (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 text-center">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_800px_at_100%_200px,#d5c5ff,transparent)] -z-1"></div>
        <main className="z-10">
            <Logo className="mb-6" />
            <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight">
                Conquer Your Day, <br /> One Priority at a Time.
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
                Now with Goal Setting, Pomodoro Timer, Dashboard, ✨ AI features, and cloud storage to organize your life.
            </p>
            <button 
                onClick={onEnter}
                className="mt-10 px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-full shadow-lg hover:bg-indigo-700 transform hover:scale-105 transition-all duration-300 ease-in-out"
            >
                Get Started & Sync
            </button>
        </main>
    </div>
);

// --- Main Application Logic ---
const PriorityApp = ({ onReturnToLanding }) => {
  const [tasks, setTasks] = useState(null);
  const [goals, setGoals] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isFirestoreLoaded, setIsFirestoreLoaded] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
  const [currentDate] = useState(new Date());
  const [aiLoading, setAiLoading] = useState({ breakdown: null, suggest: false, review: false });
  const [view, setView] = useState('list');
  const [showPomodoro, setShowPomodoro] = useState(false);

  // --- Authentication Effect ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Authentication failed:", error);
          openModal('error', { message: `Firebase Auth Error: ${error.message}` });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Data Loading and Rollover Effect ---
  useEffect(() => {
    if (!userId) return;

    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'appData');
    
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setGoals(data.goals || createInitialGoals());

            const lastVisitedDate = data.lastVisitedDate;
            const today = new Date();
            const todayStr = today.toDateString();
            let tasksToProcess = data.tasks || createInitialTasks();

            if (lastVisitedDate && lastVisitedDate !== todayStr) {
                let updatedTasks = JSON.parse(JSON.stringify(tasksToProcess));
                
                const incompleteToday = [
                    ...updatedTasks.Today.High, ...updatedTasks.Today.Medium, ...updatedTasks.Today.Low,
                ].filter(t => !t.isCompleted);
                updatedTasks['This Week'].Medium.unshift(...incompleteToday);
                updatedTasks.Today = { High: [], Medium: [], Low: [] };

                if (today.getDay() === 0) { // Sunday
                   const incompleteWeek = [
                     ...updatedTasks['This Week'].High, ...updatedTasks['This Week'].Medium, ...updatedTasks['This Week'].Low,
                   ].filter(t => !t.isCompleted && !incompleteToday.some(it => it.id === t.id));
                   updatedTasks['This Month'].Medium.unshift(...incompleteWeek);
                   updatedTasks['This Week'] = { High: [], Medium: [], Low: [] };
                }
                
                if (today.getDate() === 1) {
                    updatedTasks['This Month'] = { High: [], Medium: [], Low: [] };
                }
                
                setTasks(updatedTasks);
            } else {
                setTasks(tasksToProcess);
            }
        } else {
            console.log("No user data found, creating initial document.");
            setTasks(createInitialTasks());
            setGoals(createInitialGoals());
        }
        setIsFirestoreLoaded(true);
    }, (error) => {
        console.error("Firestore snapshot error:", error);
        openModal('error', { message: `Firestore Error: ${error.message}` });
    });

    return () => unsubscribe();
  }, [userId]);

  // --- Firestore Data Saving Effect ---
  useEffect(() => {
    if (!isFirestoreLoaded || !userId || tasks === null || goals === null) return;
    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'appData');
    const todayStr = new Date().toDateString();
    
    const dataToSave = {
        tasks,
        goals,
        lastVisitedDate: todayStr,
    };

    setDoc(docRef, dataToSave, { merge: true })
        .catch(error => {
            console.error("Error saving data to Firestore:", error);
            openModal('error', { message: `Failed to save data: ${error.message}` });
        });
  }, [tasks, goals, userId, isFirestoreLoaded]);

  // --- Gemini API Call ---
  const callGemini = async (prompt, jsonSchema = null) => {
      const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: jsonSchema ? { responseMimeType: "application/json", responseSchema: jsonSchema } : {},
      };
      try {
          const response = await fetch(GEMINI_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (!response.ok) throw new Error(`API call failed: ${response.status}`);
          const result = await response.json();
          if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
              return result.candidates[0].content.parts[0].text;
          } else {
              throw new Error("Invalid response from AI.");
          }
      } catch (error) {
          console.error("Gemini API error:", error);
          openModal('error', { message: error.message });
          return null;
      }
  };

  // --- AI Feature Handlers ---
  const handleBreakdownTask = async (task, time, priority) => {
      setAiLoading(prev => ({ ...prev, breakdown: task.id }));
      const prompt = `Break down the task: "${task.text}" into smaller sub-tasks.`;
      const schema = { type: "OBJECT", properties: { subtasks: { type: "ARRAY", items: { type: "STRING" } } } };
      const result = await callGemini(prompt, schema);
      if (result) {
          try {
              const parsed = JSON.parse(result);
              if (parsed.subtasks && Array.isArray(parsed.subtasks)) {
                  const newSubTasks = parsed.subtasks.map(subtaskText => ({
                      id: crypto.randomUUID(), text: subtaskText, isCompleted: false, createdAt: new Date().toISOString()
                  }));
                  setTasks(prevTasks => {
                      const newTasks = JSON.parse(JSON.stringify(prevTasks));
                      newTasks[time][priority].push(...newSubTasks);
                      newTasks[time][priority] = newTasks[time][priority].filter(t => t.id !== task.id);
                      return newTasks;
                  });
              }
          } catch (e) { console.error("Error parsing AI response", e); openModal('error', {message: "AI returned invalid data."}) }
      }
      setAiLoading(prev => ({ ...prev, breakdown: null }));
  };

  const handleSuggestGoals = async () => {
      setAiLoading(prev => ({ ...prev, suggest: true }));
      const monthlyHighPriorityTasks = tasks['This Month'].High.map(t => t.text).join(', ');
      if (!monthlyHighPriorityTasks) {
          openModal('info', { message: "Add high-priority tasks to 'This Month' to get suggestions." });
          setAiLoading(prev => ({ ...prev, suggest: false }));
          return;
      }
      const prompt = `Based on monthly goals: "${monthlyHighPriorityTasks}", suggest 3-4 tasks for this week.`;
      const schema = { type: "OBJECT", properties: { weekly_tasks: { type: "ARRAY", items: { type: "STRING" } } } };
      const result = await callGemini(prompt, schema);
      if (result) {
          try {
              const parsed = JSON.parse(result);
              if (parsed.weekly_tasks && Array.isArray(parsed.weekly_tasks)) {
                  const newGoals = parsed.weekly_tasks.map(goalText => ({
                      id: crypto.randomUUID(), text: goalText, isCompleted: false, createdAt: new Date().toISOString()
                  }));
                  setTasks(prev => ({ ...prev, 'This Week': { ...prev['This Week'], Medium: [...prev['This Week'].Medium, ...newGoals] } }));
              }
          } catch (e) { console.error("Error parsing AI response", e); openModal('error', {message: "AI returned invalid data."}) }
      }
      setAiLoading(prev => ({ ...prev, suggest: false }));
  };

  const handleWeeklyReview = async () => {
      setAiLoading(prev => ({ ...prev, review: true }));
      const completedTasks = [...tasks.Today.High, ...tasks.Today.Medium, ...tasks.Today.Low, ...tasks['This Week'].High, ...tasks['This Week'].Medium, ...tasks['This Week'].Low]
          .filter(t => t.isCompleted).map(t => t.text).join('; ');
      if (!completedTasks) {
          openModal('info', { message: "Complete some tasks in 'Today' or 'This Week' to get a review." });
          setAiLoading(prev => ({ ...prev, review: false }));
          return;
      }
      const prompt = `Completed tasks: "${completedTasks}". Write a short, encouraging summary of progress and a motivational quote. Format as: Summary text\nQuote text.`;
      const result = await callGemini(prompt);
      if (result) openModal('ai_review', { content: result });
      setAiLoading(prev => ({ ...prev, review: false }));
  };

  // --- Task & Goal Manipulation Handlers ---
  const handleTaskUpdate = (time, priority, taskId, newText) => {
    setTasks(prevTasks => {
      const newTasks = JSON.parse(JSON.stringify(prevTasks));
      const task = newTasks[time][priority].find(t => t.id === taskId);
      if (task) task.text = newText;
      return newTasks;
    });
  };
  
  const handleTaskAdd = (time, priority, text) => {
    const newTask = { id: crypto.randomUUID(), text, isCompleted: false, createdAt: new Date().toISOString() };
    setTasks(prevTasks => {
      const newTasks = JSON.parse(JSON.stringify(prevTasks));
      newTasks[time][priority].push(newTask);
      return newTasks;
    });
  };

  const handleDeleteTask = (time, priority, taskId) => {
    setTasks(prevTasks => {
      const newTasks = JSON.parse(JSON.stringify(prevTasks));
      newTasks[time][priority] = newTasks[time][priority].filter(t => t.id !== taskId);
      return newTasks;
    });
  };

  const handleToggleComplete = (time, priority, taskId) => {
    setTasks(prevTasks => {
      const newTasks = JSON.parse(JSON.stringify(prevTasks));
      const task = newTasks[time][priority].find(t => t.id === taskId);
      if (task) task.isCompleted = !task.isCompleted;
      return newTasks;
    });
  };

  const handleAddGoal = (goalData) => {
    const newGoal = {
        id: crypto.randomUUID(),
        ...goalData,
        status: 'In Progress',
        milestones: []
    };
    setGoals(prev => [...prev, newGoal]);
  };

  const handleUpdateGoal = (goalId, updatedData) => {
    setGoals(prev => prev.map(g => g.id === goalId ? {...g, ...updatedData} : g));
  };

  const handleDeleteGoal = (goalId) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
  };

  const handleAddMilestone = (goalId, milestoneText) => {
    const newMilestone = { id: crypto.randomUUID(), text: milestoneText, isCompleted: false };
    setGoals(prev => prev.map(g => g.id === goalId ? {...g, milestones: [...g.milestones, newMilestone]} : g));
  };

  const handleToggleMilestone = (goalId, milestoneId) => {
    setGoals(prev => prev.map(g => {
        if (g.id === goalId) {
            const updatedMilestones = g.milestones.map(m => m.id === milestoneId ? {...m, isCompleted: !m.isCompleted} : m);
            return {...g, milestones: updatedMilestones};
        }
        return g;
    }));
  };

  const handleReset = () => {
    setTasks(createInitialTasks());
    setGoals(createInitialGoals());
    setModalState({ isOpen: false, type: null, data: null });
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e, task, time, priority) => {
    setDraggedItem({ task, origin: { time, priority } });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleDragOver = (e, time, priority) => {
    e.preventDefault();
    if (draggedItem && (draggedItem.origin.time !== time || draggedItem.origin.priority !== priority)) {
        setDragOverTarget({ time, priority });
    }
  };

  const handleDragLeave = () => setDragOverTarget(null);

  const handleDrop = (e, targetTime, targetPriority) => {
    e.preventDefault();
    setDragOverTarget(null);
    if (!draggedItem) return;
    const { task, origin } = draggedItem;
    if (origin.time === targetTime && origin.priority === targetPriority) {
      setDraggedItem(null);
      return;
    }
    setTasks(prevTasks => {
      const newTasks = JSON.parse(JSON.stringify(prevTasks));
      newTasks[origin.time][origin.priority] = newTasks[origin.time][origin.priority].filter(t => t.id !== task.id);
      newTasks[targetTime][targetPriority].push(task);
      return newTasks;
    });
    setDraggedItem(null);
  };

  // --- Modal Control ---
  const openModal = (type, data = null) => setModalState({ isOpen: true, type, data });
  const closeModal = () => setModalState({ isOpen: false, type: null, data: null });

  const onModalSubmit = (data) => {
    const { type, data: modalData } = modalState;
    if (type === 'add') handleTaskAdd(modalData.time, modalData.priority, data.text);
    else if (type === 'edit') handleTaskUpdate(modalData.time, modalData.priority, modalData.task.id, data.text);
    else if (type === 'addGoal') handleAddGoal(data);
    else if (type === 'editGoal') handleUpdateGoal(modalData.goal.id, data);
    closeModal();
  };
  
  if (!isFirestoreLoaded || !tasks || !goals) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <Loader2 className="h-12 w-12 text-indigo-500 animate-spin mb-4" />
            <p className="text-xl text-gray-500">Syncing your data from the cloud...</p>
        </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-6">
            <button onClick={onReturnToLanding} className="inline-block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-lg" aria-label="Go to landing page">
                <Logo className="mb-2" />
            </button>
          <div className="flex items-center justify-center gap-4">
            <p className="text-gray-500 mt-1 text-md flex items-center justify-center gap-2">
              <Calendar size={16} />
              {formatDate(currentDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <button onClick={handleWeeklyReview} disabled={aiLoading.review} className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {aiLoading.review ? <Loader2 size={14} className="animate-spin" /> : <BarChart size={14} />}
              Weekly Review
            </button>
          </div>
        </header>

        <div className="flex justify-center mb-6">
            <div className="bg-white p-1.5 rounded-full shadow-sm border flex items-center flex-wrap justify-center">
                <button onClick={() => setView('list')} className={`px-4 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors ${view === 'list' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <List size={16} /> Task List
                </button>
                 <button onClick={() => setView('goals')} className={`px-4 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors ${view === 'goals' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <Target size={16} /> Goals
                </button>
                <button onClick={() => setView('dashboard')} className={`px-4 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <LayoutDashboard size={16} /> Dashboard
                </button>
                 <button onClick={() => setShowPomodoro(s => !s)} className={`px-3 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors ${showPomodoro ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <Timer size={16} />
                </button>
            </div>
        </div>

        <main>
          {view === 'list' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {TIME_CATEGORIES.map(time => (
                <TimeSection key={time} time={time} date={currentDate} onSuggestGoals={time === 'This Week' ? handleSuggestGoals : null} aiLoading={aiLoading.suggest}>
                  {PRIORITY_LEVELS.map(priority => (
                    <PriorityLevel key={priority} time={time} priority={priority} tasks={tasks[time]?.[priority] ?? []} onOpenModal={openModal} onToggleComplete={handleToggleComplete} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} isDragOver={dragOverTarget?.time === time && dragOverTarget?.priority === priority} onBreakdownTask={handleBreakdownTask} aiLoading={aiLoading} />
                  ))}
                </TimeSection>
              ))}
            </div>
          )}
          {view === 'goals' && <GoalsView goals={goals} onOpenModal={openModal} onAddMilestone={handleAddMilestone} onToggleMilestone={handleToggleMilestone} />}
          {view === 'dashboard' && <DashboardView tasks={tasks} />}
        </main>
        
        {showPomodoro && <PomodoroTimer onClose={() => setShowPomodoro(false)} />}

        <footer className="text-center mt-12">
            <button onClick={() => openModal('reset')} className="text-sm text-gray-400 hover:text-red-500 transition-colors flex items-center gap-2 mx-auto">
                <Wind size={14} /> Reset All Data
            </button>
        </footer>
      </div>
      <Modal state={modalState} onClose={closeModal} onSubmit={onModalSubmit} onDeleteTask={handleDeleteTask} onDeleteGoal={handleDeleteGoal} onReset={handleReset} />
    </div>
  );
}

// --- Pomodoro Timer Component ---
const PomodoroTimer = ({ onClose }) => {
    const POMODORO_TIME = 25 * 60;
    const SHORT_BREAK_TIME = 5 * 60;
    const LONG_BREAK_TIME = 15 * 60;

    const [mode, setMode] = useState('pomodoro'); // 'pomodoro', 'shortBreak', 'longBreak'
    const [timeRemaining, setTimeRemaining] = useState(POMODORO_TIME);
    const [isActive, setIsActive] = useState(false);
    const [cycles, setCycles] = useState(0);
    
    const timerRef = useRef(null);
    const dragRef = useRef(null);
    const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    const playSound = () => {
        try {
            const synth = new Tone.Synth().toDestination();
            synth.triggerAttackRelease("C5", "8n", Tone.now());
            synth.triggerAttackRelease("G5", "8n", Tone.now() + 0.2);
        } catch (error) {
            console.error("Tone.js error:", error);
        }
    };

    useEffect(() => {
        if (isActive) {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => prev - 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isActive]);

    useEffect(() => {
        if (timeRemaining < 0) {
            playSound();
            clearInterval(timerRef.current);
            setIsActive(false);
            if (mode === 'pomodoro') {
                const newCycles = cycles + 1;
                setCycles(newCycles);
                if (newCycles % 4 === 0) {
                    setMode('longBreak');
                    setTimeRemaining(LONG_BREAK_TIME);
                } else {
                    setMode('shortBreak');
                    setTimeRemaining(SHORT_BREAK_TIME);
                }
            } else {
                setMode('pomodoro');
                setTimeRemaining(POMODORO_TIME);
            }
        }
    }, [timeRemaining, mode, cycles]);

    const handleStartPause = () => {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }
        setIsActive(!isActive);
    };

    const handleReset = () => {
        setIsActive(false);
        setMode('pomodoro');
        setTimeRemaining(POMODORO_TIME);
        setCycles(0);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const totalDuration = mode === 'pomodoro' ? POMODORO_TIME : mode === 'shortBreak' ? SHORT_BREAK_TIME : LONG_BREAK_TIME;
    const progress = (totalDuration - timeRemaining) / totalDuration;

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragStartPos.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragStartPos.current.x,
                y: e.clientY - dragStartPos.current.y,
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const modeText = { pomodoro: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' };
    const modeColor = { pomodoro: 'bg-red-500', shortBreak: 'bg-green-500', longBreak: 'bg-blue-500' };

    return (
        <div ref={dragRef} style={{ top: `${position.y}px`, left: `${position.x}px` }} className="fixed z-50 w-72 bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-gray-200/80 animate-fade-in">
            <div onMouseDown={handleMouseDown} className="flex items-center justify-between p-2 cursor-grab active:cursor-grabbing bg-gray-100/50 rounded-t-2xl border-b">
                <div className="flex items-center gap-2">
                    <Timer size={16} className="text-gray-600"/>
                    <span className="font-bold text-gray-700">Pomodoro Timer</span>
                </div>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><X size={16} /></button>
            </div>
            <div className="flex flex-col items-center p-6">
                <div className={`px-3 py-1 text-sm font-semibold text-white rounded-full mb-4 ${modeColor[mode]}`}>
                    {modeText[mode]}
                </div>
                <div className="relative w-40 h-40">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle className="text-gray-200" strokeWidth="8" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" />
                        <circle className="text-indigo-500" strokeWidth="8" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={(2 * Math.PI * 45) * (1 - progress)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" transform="rotate(-90 50 50)" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-4xl font-mono font-bold text-gray-800">
                        {formatTime(timeRemaining)}
                    </div>
                </div>
                <div className="flex gap-4 mt-6">
                    <button onClick={handleStartPause} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700 transition-all">
                        {isActive ? 'Pause' : 'Start'}
                    </button>
                    <button onClick={handleReset} className="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-full hover:bg-gray-300 transition-all">
                        Reset
                    </button>
                </div>
                <div className="mt-4 text-sm text-gray-500">
                    Cycles: {cycles}
                </div>
            </div>
        </div>
    );
};

// --- Dashboard Components ---
const DashboardView = ({ tasks }) => {
    const stats = TIME_CATEGORIES.reduce((acc, time) => {
        PRIORITY_LEVELS.forEach(priority => {
            const taskList = tasks[time][priority];
            acc.total += taskList.length;
            acc.completed += taskList.filter(t => t.isCompleted).length;
            acc.byPriority[priority] += taskList.length;
        });
        return acc;
    }, { total: 0, completed: 0, byPriority: { High: 0, Medium: 0, Low: 0 } });

    stats.pending = stats.total - stats.completed;
    stats.completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    const timeStats = TIME_CATEGORIES.map(time => {
        const timeTasks = [...tasks[time].High, ...tasks[time].Medium, ...tasks[time].Low];
        const total = timeTasks.length;
        const completed = timeTasks.filter(t => t.isCompleted).length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { name: time, total, completed, rate };
    });

    return (
        <div className="bg-white/60 backdrop-blur-sm border border-gray-200/80 rounded-2xl shadow-sm p-6 animate-fade-in">
            <DashboardHeader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
                <StatsCard title="Total Tasks" value={stats.total} />
                <StatsCard title="Completed" value={stats.completed} color="text-green-500" />
                <StatsCard title="Pending" value={stats.pending} color="text-orange-500" />
                <StatsCard title="Completion Rate" value={`${stats.completionRate}%`} color="text-indigo-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {timeStats.map(stat => (
                    <ProgressRingCard key={stat.name} title={stat.name} rate={stat.rate} completed={stat.completed} total={stat.total} />
                ))}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Task Priority Breakdown</h3>
                <PriorityBarChart data={stats.byPriority} />
            </div>
        </div>
    );
};

const DashboardHeader = () => {
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    useEffect(() => {
        const fetchWeather = async () => {
            if (!WEATHER_API_KEY || WEATHER_API_KEY === "YOUR_WEATHER_API_KEY") {
                setError("API key not set.");
                setLoading(false);
                return;
            }
            try {
                const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=Liverpool`);
                if (!response.ok) {
                    throw new Error('Weather data not available');
                }
                const data = await response.json();
                setWeather(data.current);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchWeather();
    }, []);

    const getWeatherIcon = (conditionText) => {
        if (!conditionText) return <Cloud size={48} className="text-gray-500" />;
        const text = conditionText.toLowerCase();
        if (text.includes("sunny") || text.includes("clear")) return <Sun size={48} className="text-yellow-500" />;
        if (text.includes("rain") || text.includes("drizzle")) return <CloudRain size={48} className="text-blue-500" />;
        if (text.includes("snow") || text.includes("sleet") || text.includes("ice")) return <CloudSnow size={48} className="text-cyan-400" />;
        if (text.includes("thunder")) return <Zap size={48} className="text-yellow-400" />;
        if (text.includes("wind") || text.includes("gale")) return <WindIcon size={48} className="text-gray-500" />;
        return <Cloud size={48} className="text-gray-500" />;
    };

    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-white rounded-xl shadow-sm border">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
                <p className="text-gray-500">{formatDate(time, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
                <div className="text-right">
                    <p className="text-3xl font-bold text-gray-800">{formatDate(time, { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    <p className="text-gray-500">Liverpool, UK</p>
                </div>
                 <div className="flex items-center gap-3">
                    {loading ? <Loader2 className="animate-spin text-gray-500" size={48}/> : 
                     error ? <div className="text-center text-xs text-red-500 w-24">Could not load weather. <br/> {error}</div> :
                     weather && (
                        <>
                            {getWeatherIcon(weather.condition.text)}
                            <div>
                                <p className="text-2xl font-bold text-gray-800">{Math.round(weather.temp_c)}°C</p>
                                <p className="text-xs text-gray-500">{weather.condition.text}</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};


const StatsCard = ({ title, value, color = 'text-gray-800' }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm text-center">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
);

const ProgressRingCard = ({ title, rate, completed, total }) => {
    const strokeWidth = 10;
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (rate / 100) * circumference;

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center">
            <h4 className="font-semibold text-gray-600 mb-3">{title}</h4>
            <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 120 120">
                    <circle className="text-gray-200" strokeWidth={strokeWidth} stroke="currentColor" fill="transparent" r={radius} cx="60" cy="60" />
                    <circle 
                        className="text-indigo-500"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="60"
                        cy="60"
                        transform="rotate(-90 60 60)"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-indigo-600">{rate}%</span>
                    <span className="text-xs text-gray-500">{completed}/{total} tasks</span>
                </div>
            </div>
        </div>
    );
};

const PriorityBarChart = ({ data }) => {
    const totalTasks = Object.values(data).reduce((sum, count) => sum + count, 0);
    const maxVal = totalTasks === 0 ? 1 : Math.max(...Object.values(data));
    
    return (
        <div className="w-full h-48 flex items-end justify-around gap-4 pt-4">
            {PRIORITY_LEVELS.map(priority => {
                const count = data[priority];
                const height = maxVal > 0 ? `${(count / maxVal) * 100}%` : '0%';
                const color = PRIORITY_STYLES[priority].base;
                return (
                    <div key={priority} className="flex flex-col items-center h-full w-1/4">
                        <div className="w-full flex-grow flex items-end">
                             <div 
                                className={`w-full bg-${color}-400 rounded-t-lg hover:bg-${color}-500 transition-all duration-300`}
                                style={{ height: height }}
                             >
                                <div className="text-center text-white font-bold text-sm relative -top-5">{count}</div>
                             </div>
                        </div>
                        <p className={`text-sm font-semibold mt-2 ${PRIORITY_STYLES[priority].text}`}>{priority}</p>
                    </div>
                );
            })}
        </div>
    );
};


// --- Goals Components ---
const GoalsView = ({ goals, onOpenModal, onAddMilestone, onToggleMilestone }) => {
    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">My Goals</h2>
                <button onClick={() => onOpenModal('addGoal')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700">
                    <Plus size={18} /> New Goal
                </button>
            </div>
            <div className="space-y-6">
                {goals.length > 0 ? goals.map(goal => (
                    <GoalItem key={goal.id} goal={goal} onOpenModal={onOpenModal} onAddMilestone={onAddMilestone} onToggleMilestone={onToggleMilestone} />
                )) : (
                    <div className="text-center py-16 bg-white/60 rounded-2xl border border-dashed">
                        <Target size={48} className="mx-auto text-gray-400" />
                        <h3 className="mt-4 text-lg font-semibold text-gray-700">No goals yet</h3>
                        <p className="mt-1 text-sm text-gray-500">Click "New Goal" to set your first long-term objective.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const GoalItem = ({ goal, onOpenModal, onAddMilestone, onToggleMilestone }) => {
    const [milestoneText, setMilestoneText] = useState('');
    const completedMilestones = goal.milestones.filter(m => m.isCompleted).length;
    const totalMilestones = goal.milestones.length;
    const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    const handleAddMilestoneSubmit = (e) => {
        e.preventDefault();
        if (milestoneText.trim()) {
            onAddMilestone(goal.id, milestoneText.trim());
            setMilestoneText('');
        }
    };

    return (
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-2xl shadow-sm p-6">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">{goal.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{goal.description}</p>
                    <p className="text-xs text-gray-400 mt-2">Target Year: {goal.targetDate}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onOpenModal('editGoal', { goal })} className="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700">
                        <Pencil size={16} />
                    </button>
                    <button onClick={() => onOpenModal('deleteGoal', { goal })} className="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-red-500">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
            <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-indigo-600">Progress</span>
                    <span className="text-sm font-semibold text-gray-500">{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
            <div className="mt-6">
                <h4 className="font-semibold text-gray-700 mb-2">Milestones</h4>
                <div className="space-y-2">
                    {goal.milestones.map(milestone => (
                        <div key={milestone.id} className="flex items-center gap-3 bg-gray-50 p-2 rounded-md">
                            <input type="checkbox" checked={milestone.isCompleted} onChange={() => onToggleMilestone(goal.id, milestone.id)} className="form-checkbox h-5 w-5 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                            <label className={`flex-grow text-sm ${milestone.isCompleted ? 'line-through text-gray-500' : 'text-gray-800'}`}>{milestone.text}</label>
                        </div>
                    ))}
                </div>
                <form onSubmit={handleAddMilestoneSubmit} className="flex gap-2 mt-3">
                    <input type="text" value={milestoneText} onChange={(e) => setMilestoneText(e.target.value)} placeholder="Add a new milestone..." className="flex-grow p-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    <button type="submit" className="px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-semibold rounded-md hover:bg-gray-100"><Plus size={16} /></button>
                </form>
            </div>
        </div>
    );
};

// --- Sub-components ---

const TimeSection = ({ time, date, children, onSuggestGoals, aiLoading }) => (
  <section className="bg-white/60 backdrop-blur-sm border border-gray-200/80 rounded-2xl shadow-sm p-5 flex flex-col gap-5 animate-fade-in">
    <div className="flex justify-between items-center border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-center text-gray-700">
            {getCategoryDateHeader(time, date)}
        </h2>
        {onSuggestGoals && (
            <button onClick={onSuggestGoals} disabled={aiLoading} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 p-1 rounded-md hover:bg-indigo-100/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                Suggest Goals
            </button>
        )}
    </div>
    {children}
  </section>
);

const PriorityLevel = ({ time, priority, tasks, onOpenModal, onToggleComplete, onDragStart, onDragOver, onDragLeave, onDrop, isDragOver, onBreakdownTask, aiLoading }) => {
  const styles = PRIORITY_STYLES[priority];
  const highlightClass = isDragOver ? `bg-blue-100 ring-2 ${styles.ring}` : '';

  return (
    <div
      className={`priority-level ${styles.bg} border-l-4 ${styles.border} rounded-lg p-4 transition-all duration-300 ${highlightClass}`}
      onDragOver={(e) => onDragOver(e, time, priority)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, time, priority)}
    >
      <h3 className={`text-md font-bold ${styles.text} mb-3`}>{priority}</h3>
      <ul className="space-y-2 min-h-[40px]">
        {tasks.map(task => (
          <TaskItem
            key={task.id}
            task={task}
            time={time}
            priority={priority}
            onOpenModal={onOpenModal}
            onToggleComplete={onToggleComplete}
            onDragStart={onDragStart}
            onBreakdownTask={onBreakdownTask}
            isAiLoading={aiLoading.breakdown === task.id}
          />
        ))}
         {tasks.length === 0 && <li className="text-sm text-gray-400 italic px-2">No tasks yet.</li>}
      </ul>
      <button
        onClick={() => onOpenModal('add', { time, priority })}
        className={`w-full mt-4 text-sm font-semibold ${styles.text} bg-white/50 hover:bg-white rounded-md py-2 transition-all duration-200 flex items-center justify-center gap-1`}
      >
        <Plus size={16} /> Add Task
      </button>
    </div>
  );
};

const TaskItem = ({ task, time, priority, onOpenModal, onToggleComplete, onDragStart, onBreakdownTask, isAiLoading }) => (
  <li
    draggable={!isAiLoading}
    onDragStart={(e) => onDragStart(e, task, time, priority)}
    className="group bg-white p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md"
  >
    <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`task-check-${task.id}`}
          checked={task.isCompleted}
          onChange={() => onToggleComplete(time, priority, task.id)}
          className="form-checkbox h-5 w-5 rounded-md text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer mt-0.5"
        />
        <div className="flex-grow">
            <label
              htmlFor={`task-check-${task.id}`}
              className={`text-gray-800 transition-colors ${task.isCompleted ? 'line-through text-gray-500' : ''}`}
            >
              {task.text}
            </label>
            <p className="text-xs text-gray-400 mt-1">{formatTaskTimestamp(task.createdAt)}</p>
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onBreakdownTask(task, time, priority)} disabled={isAiLoading} className="p-1 rounded-full hover:bg-indigo-100 text-indigo-500 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <button onClick={() => onOpenModal('edit', { task, time, priority })} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700">
            <Pencil size={16} />
          </button>
          <button onClick={() => onOpenModal('delete', { task, time, priority })} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 hover:text-red-500">
            <Trash2 size={16} />
          </button>
        </div>
    </div>
  </li>
);

const Modal = ({ state, onClose, onSubmit, onDeleteTask, onDeleteGoal, onReset }) => {
  const { isOpen, type, data } = state;
  const [text, setText] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalDate, setGoalDate] = useState('');

  useEffect(() => {
    if (isOpen) {
        if (type === 'edit' && data?.task) {
            setText(data.task.text);
        } else if (type === 'editGoal' && data?.goal) {
            setGoalTitle(data.goal.title);
            setGoalDesc(data.goal.description);
            setGoalDate(data.goal.targetDate);
        } else if (type === 'addGoal') {
            setText('');
            setGoalTitle('');
            setGoalDesc('');
            setGoalDate(new Date().getFullYear());
        }
    }
  }, [isOpen, type, data]);
  
  if (!isOpen) return null;

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (type === 'add' || type === 'edit') {
        if (text.trim()) onSubmit({ text: text.trim() });
    } else if (type === 'addGoal' || type === 'editGoal') {
        if (goalTitle.trim() && goalDate) {
            onSubmit({ title: goalTitle.trim(), description: goalDesc.trim(), targetDate: goalDate });
        }
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'add':
      case 'edit':
        return (
          <>
            <h3 className="text-lg font-medium leading-6 text-gray-900">{type === 'add' ? 'Add New Task' : 'Edit Task'}</h3>
            <form onSubmit={handleFormSubmit} className="mt-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows="3"
                autoFocus
              ></textarea>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:col-start-2 sm:text-sm">
                  Save
                </button>
                <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </>
        );
      case 'addGoal':
      case 'editGoal':
        return (
            <>
                <h3 className="text-lg font-medium leading-6 text-gray-900">{type === 'addGoal' ? 'Add New Goal' : 'Edit Goal'}</h3>
                <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="goalTitle" className="block text-sm font-medium text-gray-700">Goal Title</label>
                        <input type="text" id="goalTitle" value={goalTitle} onChange={e => setGoalTitle(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoFocus />
                    </div>
                    <div>
                        <label htmlFor="goalDesc" className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea id="goalDesc" value={goalDesc} onChange={e => setGoalDesc(e.target.value)} rows="3" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
                    </div>
                     <div>
                        <label htmlFor="goalDate" className="block text-sm font-medium text-gray-700">Target Year</label>
                        <input type="number" id="goalDate" value={goalDate} onChange={e => setGoalDate(e.target.value)} min={new Date().getFullYear()} max="2100" placeholder="YYYY" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    </div>
                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                        <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:col-start-2 sm:text-sm">
                        Save Goal
                        </button>
                        <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                        Cancel
                        </button>
                    </div>
                </form>
            </>
        );
      case 'delete':
      case 'deleteGoal':
      case 'reset':
      case 'error':
      case 'info':
      case 'ai_review':
        const isReset = type === 'reset';
        const isError = type === 'error';
        const isInfo = type === 'info';
        const isReview = type === 'ai_review';
        const isDeleteGoal = type === 'deleteGoal';
        const title = isReset ? 'Reset All Data' : isError ? 'An Error Occurred' : isInfo ? 'Information' : isReview ? "Your Weekly Review ✨" : isDeleteGoal ? 'Delete Goal' : 'Delete Task';
        const message = isReset ? 'Are you sure? This will erase all your tasks, goals, and calendar link from the cloud.' : 
                 isError ? data.message : 
                 isInfo ? data.message :
                 isReview ? data.content :
                 isDeleteGoal ? 'Are you sure you want to permanently delete this goal and all its milestones?' :
                 `Are you sure you want to delete this task?`;
        return (
          <>
            <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${isError || isReset || isDeleteGoal ? 'bg-red-100' : 'bg-indigo-100'}`}>
                {isError || isReset || isDeleteGoal ? <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" /> : <Sparkles className="h-6 w-6 text-indigo-600" />}
            </div>
            <h3 className="text-lg font-medium text-center mt-3 text-gray-900">{title}</h3>
            <div className="mt-2 text-sm text-center text-gray-500 whitespace-pre-wrap">
                {message}
            </div>
            {(type === 'delete' || type === 'deleteGoal') && <p className="mt-2 text-sm text-gray-800 font-semibold p-2 bg-gray-100 rounded-md text-center">"{data.task?.text || data.goal?.title}"</p>}
            <div className="mt-5 sm:mt-6">
                {(isReset || type === 'delete' || type === 'deleteGoal') ? (
                    <div className="sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                        <button type="button" onClick={() => { 
                            if(isReset) onReset();
                            else if(isDeleteGoal) onDeleteGoal(data.goal.id);
                            else onDeleteTask(data.time, data.priority, data.task.id); 
                            onClose(); 
                        }} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:col-start-2 sm:text-sm">
                          {isReset ? 'Yes, Reset' : 'Delete'}
                        </button>
                        <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm">
                          Cancel
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={onClose} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:text-sm">
                      Close
                    </button>
                )}
              </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
