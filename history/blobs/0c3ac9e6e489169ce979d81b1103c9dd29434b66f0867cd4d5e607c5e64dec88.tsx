'use client';

import {useEffect, useState} from 'react';

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
const cycle: {mood: Mood; length: number}[] = [
  {mood: 'idle', length: 48}, {mood: 'happy', length: 18},
  {mood: 'idle', length: 30}, {mood: 'thinking', length: 24},
  {mood: 'working', length: 22}, {mood: 'idle', length: 40},
  {mood: 'surprised', length: 12}, {mood: 'sleepy', length: 26},
  {mood: 'sad', length: 14}, {mood: 'idle', length: 54},
];
const cycleLength = cycle.reduce((sum, item) => sum + item.length, 0);

function Face({eyes}: {eyes: [Eye, Eye]}) {
  return <svg className="luma-pet-face" viewBox="0 0 23 7" shapeRendering="crispEdges" aria-hidden="true">
    {eyes.flatMap((eye, index) => pixels[eye].flatMap((row, y) => [...row].map((pixel, x) => pixel === '#' ? <rect key={`${index}-${x}-${y}`} x={index * 12 + x + 1} y={y + 1} width="1" height="1"/> : null)))}
  </svg>;
}

export function LumaPet() {
  const [frame, setFrame] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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

  // Every expression has its own hand-drawn pixel frames; the loop runs on its own.
  let position = frame % cycleLength;
  let mood: Mood = 'idle';
  for (const scene of cycle) {
    if (position < scene.length) {mood = scene.mood; break;}
    position -= scene.length;
  }
  const index = mood === 'idle' ? position % 44 : position % expressions[mood].length;
  const eyes = mood === 'idle' ? expressions.idle[index < 37 ? 0 : index < 39 ? 3 : index < 41 ? 4 : 5] : expressions[mood][index];

  return <div className={`luma-pet luma-pet-${mood}${keyboardOpen ? ' luma-pet-hidden' : ''}`} role="img" aria-label="Animated blue Luma pet">
    <span className="luma-pet-sprite"><img src="/pet/luma-companion.png" alt="" draggable="false"/><Face eyes={eyes}/></span>
  </div>;
}
