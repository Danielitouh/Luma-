'use client';

import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Loader2, Moon, Sparkles, Undo2, X} from 'lucide-react';
import {lumaAgent, type SimulatedEmotion} from '@/lib/luma-agent';

type Mood = 'idle' | 'working' | 'thinking' | 'happy' | 'sad' | 'surprised' | 'sleepy';
type Eye = 'wink' | 'line' | 'blink' | 'soft' | 'joy' | 'down' | 'round' | 'dot' | 'cursor';
const pixels: Record<Eye, string[]> = {
  wink: ['#....', '.##..', '...#.', '.##..', '#....'],
  line: ['.....', '.....', '.###.', '.....', '.....'],
  blink: ['.....', '.....', '#####', '.....', '.....'],
  soft: ['.....', '.###.', '.....', '.....', '.....'],
  joy: ['..#..', '.#.#.', '#...#', '.....', '.....'],
  down: ['.....', '.....', '#...#', '.#.#.', '..#..'],
  round: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  dot: ['.....', '..#..', '.###.', '..#..', '.....'],
  cursor: ['.....', '.....', '.###.', '.....', '...#.'],
};
const expressions: Record<Mood, [Eye, Eye][]> = {
  idle: [['wink', 'line'], ['wink', 'line'], ['wink', 'line'], ['soft', 'soft'], ['blink', 'blink'], ['soft', 'soft']],
  working: [['wink', 'line'], ['wink', 'cursor'], ['wink', 'line'], ['soft', 'soft']],
  thinking: [['dot', 'line'], ['dot', 'cursor'], ['dot', 'line'], ['soft', 'soft']],
  happy: [['joy', 'joy'], ['joy', 'line'], ['joy', 'joy']],
  sad: [['down', 'down'], ['soft', 'down'], ['down', 'down']],
  surprised: [['round', 'round'], ['round', 'dot'], ['round', 'round']],
  sleepy: [['line', 'line'], ['soft', 'soft'], ['line', 'line']],
};
const emotionMood: Record<SimulatedEmotion, Mood> = {
  sleepy: 'sleepy', calm: 'idle', focused: 'working', curious: 'thinking',
  happy: 'happy', sad: 'sad', surprised: 'surprised',
};

function Face({eyes}: {eyes: [Eye, Eye]}) {
  return <svg className="luma-pet-face" viewBox="0 0 18 7" shapeRendering="crispEdges" aria-hidden="true">
    {eyes.flatMap((eye, index) => pixels[eye].flatMap((row, y) => [...row].map((pixel, x) => pixel === '#' ? <rect key={`${index}-${x}-${y}`} x={index * 12 + x + 1} y={y + 1} width="1" height="1"/> : null)))}
  </svg>;
}

type PetProps = {
  pageTitle?: string;
  working: boolean;
  note: string;
  error: string;
  canUndo: boolean;
  onFreedom: () => void;
  onPause: () => void;
  onUndo: () => void;
  onOpenSettings: () => void;
};

export function LumaPet({pageTitle, working, note, error, canUndo, onFreedom, onPause, onUndo, onOpenSettings}: PetProps) {
  const [frame, setFrame] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const petRef = useRef<HTMLDivElement>(null);
  const agent = useSyncExternalStore(lumaAgent.subscribe, lumaAgent.getSnapshot, lumaAgent.getSnapshot);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!petRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  useEffect(() => { if (keyboardOpen) setMenuOpen(false); }, [keyboardOpen]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const base = window.innerHeight;
    const update = () => setKeyboardOpen(viewport.height < base - 170);
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setFrame(value => value + 1), 145);
    return () => clearInterval(timer);
  }, []);

  // While the agent sleeps, only its sleepy face animates. No editor or AI events wake it.
  const mood = agent.status === 'asleep' ? 'sleepy' : emotionMood[agent.emotion];
  const index = mood === 'idle' ? frame % 44 : frame % expressions[mood].length;
  const eyes = mood === 'idle' ? expressions.idle[index < 37 ? 0 : index < 39 ? 3 : index < 41 ? 4 : 5] : expressions[mood][index];

  return <div ref={petRef} className={`luma-pet luma-pet-${mood}${keyboardOpen ? ' luma-pet-hidden' : ''}${menuOpen ? ' luma-pet-menu-open' : ''}`}>
    <div className="luma-pet-wander">
      {menuOpen && <div id="codex-thoughts" className="luma-pet-thought" role="dialog" aria-label="Codex's thoughts">
        <div className="luma-pet-thought-head"><span>💭 Codex</span><button type="button" aria-label="Close Codex thoughts" onClick={() => setMenuOpen(false)}><X size={15}/></button></div>
        {pageTitle ? <p>Thinking about <strong>{pageTitle}</strong>.</p> : <p>Open a page and I can help there.</p>}
        <button type="button" className="luma-pet-freedom" disabled={!pageTitle || working} onClick={onFreedom}>
          {working ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>}
          {working ? 'Thinking about this page…' : 'Full freedom on this page'}
        </button>
        <p className="luma-pet-scope">Codex can choose helpful edits here only. It won’t touch other pages.</p>
        {note && !working && <p className="luma-pet-feedback" role="status">{note}</p>}
        {error && !working && <><p className="luma-pet-feedback error" role="alert">{error}</p><button type="button" className="luma-pet-link" onClick={onOpenSettings}>AI settings</button></>}
        {canUndo && !working && <button type="button" className="luma-pet-link" onClick={onUndo}><Undo2 size={14}/> Undo Codex's changes</button>}
        {(working || agent.status === 'awake') && <button type="button" className="luma-pet-link" onClick={onPause}><Moon size={14}/> Put Codex to sleep</button>}
      </div>}
      <button type="button" className="luma-pet-trigger" aria-label={menuOpen ? 'Close Codex thoughts' : 'Open Codex thoughts'} aria-expanded={menuOpen} aria-controls="codex-thoughts" onClick={() => setMenuOpen(open => !open)}>
        <span className="luma-pet-sprite" role="img" aria-label="Animated blue Luma pet"><img src="/pet/luma-companion.png" alt="" draggable="false"/><Face eyes={eyes}/></span>
      </button>
    </div>
  </div>;
}
