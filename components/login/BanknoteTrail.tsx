"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const BILL_IMAGES = Array.from({ length: 12 }, (_, i) => `/money/bill-${i + 1}.png`);

type Note = {
  id: number;
  image: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  rot: number;
  scale: number;
  duration: number;
  size: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function BanknoteTrail({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [notes, setNotes] = useState<Note[]>([]);
  const idRef = useRef(0);
  const lastRef = useRef(0);

  function spawnNote(x: number, y: number) {
    const id = idRef.current++;
    const note: Note = {
      id,
      image: BILL_IMAGES[Math.floor(Math.random() * BILL_IMAGES.length)],
      x,
      y,
      dx: randomBetween(-60, 60),
      dy: randomBetween(120, 210),
      rx: randomBetween(180, 620),
      ry: randomBetween(220, 720),
      rot: randomBetween(-100, 100),
      scale: randomBetween(0.8, 1.25),
      duration: randomBetween(1, 1.6),
      size: randomBetween(72, 108),
    };
    setNotes((prev) => [...prev.slice(-17), note]);
    setTimeout(() => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    }, note.duration * 1000 + 50);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const now = Date.now();
    if (now - lastRef.current < 65) return;
    lastRef.current = now;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnNote(x, y);
    if (Math.random() > 0.45) {
      spawnNote(x + randomBetween(-16, 16), y + randomBetween(-10, 10));
    }
  }

  return (
    <div className={`relative ${className ?? ""}`} onMouseMove={handleMouseMove}>
      {children}
      {notes.map((n) => (
        <div
          key={n.id}
          aria-hidden
          className="pointer-events-none absolute select-none animate-bill-float drop-shadow-lg"
          style={
            {
              left: n.x,
              top: n.y,
              "--dx": `${n.dx}px`,
              "--dy": `${n.dy}px`,
              "--rx": `${n.rx}deg`,
              "--ry": `${n.ry}deg`,
              "--rot": `${n.rot}deg`,
              "--bill-scale": n.scale,
              animationDuration: `${n.duration}s`,
            } as React.CSSProperties
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={n.image} alt="" style={{ width: n.size, height: "auto" }} />
        </div>
      ))}
    </div>
  );
}
