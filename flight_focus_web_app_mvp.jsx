import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Timer, Plus, NotebookPen, Trophy, ArrowUpRight, Pause, Play, Square, Trash2, Lock, Check, Gauge, CalendarDays } from "lucide-react";

// FlightFocus — cockpit-styled focus + mileage tracker
// Single-file MVP with localStorage persistence

const LS_KEY = "flightfocus_v01";

const nowIso = () => new Date().toISOString();

function uid() {
  return Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function msToHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

function minutes(ms) {
  return Math.max(0, Math.round(ms / 60000));
}

const AIRCRAFT = [
  { id: "A220", name: "A220", vibe: "Agile short hop", base: 1.0 },
  { id: "A320", name: "A320", vibe: "Balanced mid-range", base: 1.05 },
  { id: "B737", name: "B737", vibe: "Classic workhorse", base: 1.05 },
  { id: "B787", name: "B787", vibe: "Long-haul stability", base: 1.12 },
  { id: "A350", name: "A350", vibe: "Ultra-smooth cruise", base: 1.14 },
];

const CABIN_CLASSES = [
  { id: "ECO", name: "Economy", mult: 1.0, cost: 0 },
  { id: "PREM", name: "Premium", mult: 1.1, cost: 2500 },
  { id: "BUS", name: "Business", mult: 1.25, cost: 7000 },
  { id: "FST", name: "First", mult: 1.45, cost: 15000 },
];

const STATUS = {
  READY: "READY",
  TAXI: "TAXI",
  CLIMB: "CLIMB",
  CRUISE: "CRUISE",
  DESCENT: "DESCENT",
  LANDED: "LANDED",
  ABORTED: "ABORTED",
};

const FLIGHT_TYPES = [
  { id: "STUDY", name: "Study" },
  { id: "WORK", name: "Work" },
];

// Mileage model (MVP):
// baseRate: 10 miles per focused minute
// aircraft base multiplier
// cabin class multiplier
// grade multiplier
// aborted -> 50% miles
const BASE_RATE = 10;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function withinLastDays(dateIso, days) {
  const t = new Date(dateIso).getTime();
  const since = startOfDay(new Date()).getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  return t >= since;
}

function calc7dMinutes(logs) {
  return logs
    .filter((l) => withinLastDays(l.endedAt || l.createdAt, 7))
    .reduce((sum, l) => sum + minutes(l.focusMs || 0), 0);
}

function gradeFrom7d(mins) {
  // simple thresholds
  if (mins >= 1500) return { id: "BLACK", name: "Black", mult: 1.35 };
  if (mins >= 900) return { id: "PLAT", name: "Platinum", mult: 1.25 };
  if (mins >= 420) return { id: "GOLD", name: "Gold", mult: 1.15 };
  if (mins >= 180) return { id: "SILV", name: "Silver", mult: 1.08 };
  return { id: "MEM", name: "Member", mult: 1.0 };
}

function calcMiles({ focusMs, aborted, aircraftId, cabinId, gradeMult }) {
  const mins = minutes(focusMs);
  const ac = AIRCRAFT.find((a) => a.id === aircraftId) || AIRCRAFT[1];
  const cab = CABIN_CLASSES.find((c) => c.id === cabinId) || CABIN_CLASSES[0];
  const raw = mins * BASE_RATE * ac.base * cab.mult * gradeMult;
  const adjusted = aborted ? raw * 0.5 : raw;
  return Math.round(adjusted);
}

function loadState() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function Chip({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-white/15 bg-white/5 text-white/80",
    good: "border-white/20 bg-white/10 text-white",
    warn: "border-white/15 bg-white/5 text-white/80",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${tones[tone] || tones.neutral}`}>{children}</span>
  );
}

function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, icon: Icon, tone = "primary" }) {
  const tones = {
    primary: "bg-white text-black hover:bg-white/90",
    ghost: "bg-white/10 text-white hover:bg-white/15",
    danger: "bg-white/10 text-white hover:bg-white/15 border border-white/15",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-white/70">{label}</div>
        {hint ? <div className="text-xs text-white/40">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-black">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/25"
    />
  );
}

function TextArea({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={5}
      className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/25"
    />
  );
}

function Meter({ value, max, labelLeft, labelRight }) {
  const pct = max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
        <motion.div
          className="h-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/45">
        <span>{labelLeft}</span>
        <span>{labelRight}</span>
      </div>
    </div>
  );
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function statusLabel(s) {
  switch (s) {
    case STATUS.TAXI:
      return "Taxi";
    case STATUS.CLIMB:
      return "Climb";
    case STATUS.CRUISE:
      return "Cruise";
    case STATUS.DESCENT:
      return "Descent";
    case STATUS.LANDED:
      return "Landed";
    case STATUS.ABORTED:
      return "Aborted";
    default:
      return "Ready";
  }
}

export default function FlightFocusApp() {
  const loaded = useMemo(() => loadState(), []);

  const [miles, setMiles] = useState(loaded?.miles ?? 0);
  const [ownedCabins, setOwnedCabins] = useState(loaded?.ownedCabins ?? ["ECO"]);
  const [selectedCabin, setSelectedCabin] = useState(loaded?.selectedCabin ?? "ECO");

  const [logs, setLogs] = useState(loaded?.logs ?? []);

  const [draft, setDraft] = useState(
    loaded?.draft ?? {
      title: "",
      type: "STUDY",
      plannedMin: 50,
      aircraftId: "A320",
      cabinId: selectedCabin,
    }
  );

  const [notes, setNotes] = useState(loaded?.notes ?? "");

  // Active flight state
  const [active, setActive] = useState(loaded?.active ?? null);
  const [tick, setTick] = useState(0);
  const timerRef = useRef(null);

  const mins7d = useMemo(() => calc7dMinutes(logs), [logs]);
  const grade = useMemo(() => gradeFrom7d(mins7d), [mins7d]);

  // Persist
  useEffect(() => {
    saveState({ miles, ownedCabins, selectedCabin, logs, draft, notes, active });
  }, [miles, ownedCabins, selectedCabin, logs, draft, notes, active]);

  // Tick while active and running
  useEffect(() => {
    if (!active?.running) return;
    timerRef.current = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(timerRef.current);
  }, [active?.running]);

  const activeElapsedMs = useMemo(() => {
    if (!active) return 0;
    const base = active.elapsedMs ?? 0;
    if (!active.running) return base;
    const delta = Date.now() - (active.lastStartTs ?? Date.now());
    return base + delta;
  }, [active, tick]);

  const cockpitPhase = useMemo(() => {
    if (!active) return STATUS.READY;
    const p = active.plannedMs ?? 0;
    const e = activeElapsedMs;
    if (active.status === STATUS.ABORTED || active.status === STATUS.LANDED) return active.status;
    if (e < Math.min(60_000, p * 0.1)) return STATUS.TAXI;
    if (e < p * 0.25) return STATUS.CLIMB;
    if (e < p * 0.85) return STATUS.CRUISE;
    return STATUS.DESCENT;
  }, [active, activeElapsedMs]);

  const plannedMs = useMemo(() => (draft.plannedMin || 0) * 60 * 1000, [draft.plannedMin]);

  const canStart = useMemo(() => {
    const t = (draft.title || "").trim();
    return t.length >= 1 && (draft.plannedMin || 0) >= 5;
  }, [draft.title, draft.plannedMin]);

  const selectedAircraft = useMemo(
    () => AIRCRAFT.find((a) => a.id === (active?.aircraftId ?? draft.aircraftId)) || AIRCRAFT[1],
    [active?.aircraftId, draft.aircraftId]
  );

  const currentCabin = useMemo(() => {
    const id = active?.cabinId ?? draft.cabinId ?? selectedCabin;
    return CABIN_CLASSES.find((c) => c.id === id) || CABIN_CLASSES[0];
  }, [active?.cabinId, draft.cabinId, selectedCabin]);

  function startFlight() {
    if (!canStart) return;
    const cabinId = ownedCabins.includes(draft.cabinId) ? draft.cabinId : selectedCabin;
    const f = {
      id: uid(),
      title: draft.title.trim(),
      type: draft.type,
      aircraftId: draft.aircraftId,
      cabinId,
      plannedMs,
      createdAt: nowIso(),
      status: STATUS.TAXI,
      running: true,
      elapsedMs: 0,
      lastStartTs: Date.now(),
      note: notes || "",
    };
    setActive(f);
  }

  function pauseFlight() {
    if (!active?.running) return;
    setActive((a) => {
      if (!a) return a;
      const delta = Date.now() - (a.lastStartTs ?? Date.now());
      return { ...a, running: false, elapsedMs: (a.elapsedMs ?? 0) + delta };
    });
  }

  function resumeFlight() {
    if (!active || active.running) return;
    setActive((a) => (a ? { ...a, running: true, lastStartTs: Date.now() } : a));
  }

  function landFlight({ aborted = false } = {}) {
    if (!active) return;

    const finalMs = (() => {
      const base = active.elapsedMs ?? 0;
      if (!active.running) return base;
      const delta = Date.now() - (active.lastStartTs ?? Date.now());
      return base + delta;
    })();

    const endedAt = nowIso();
    const entry = {
      id: active.id,
      title: active.title,
      type: active.type,
      aircraftId: active.aircraftId,
      cabinId: active.cabinId,
      plannedMs: active.plannedMs,
      focusMs: finalMs,
      createdAt: active.createdAt,
      endedAt,
      status: aborted ? STATUS.ABORTED : STATUS.LANDED,
      note: active.note || "",
    };

    const earned = calcMiles({
      focusMs: finalMs,
      aborted,
      aircraftId: entry.aircraftId,
      cabinId: entry.cabinId,
      gradeMult: grade.mult,
    });

    setMiles((m) => m + earned);
    setLogs((l) => [entry, ...l].slice(0, 200));
    setActive(null);
    // Keep notes as a scratchpad for the next flight
  }

  function deleteLog(id) {
    setLogs((l) => l.filter((x) => x.id !== id));
  }

  function resetAll() {
    localStorage.removeItem(LS_KEY);
    setMiles(0);
    setOwnedCabins(["ECO"]);
    setSelectedCabin("ECO");
    setLogs([]);
    setDraft({ title: "", type: "STUDY", plannedMin: 50, aircraftId: "A320", cabinId: "ECO" });
    setNotes("");
    setActive(null);
  }

  function buyCabin(cabinId) {
    const cab = CABIN_CLASSES.find((c) => c.id === cabinId);
    if (!cab) return;
    if (ownedCabins.includes(cabinId)) return;
    if (miles < cab.cost) return;
    setMiles((m) => m - cab.cost);
    setOwnedCabins((o) => [...o, cabinId]);
    setSelectedCabin(cabinId);
    setDraft((d) => ({ ...d, cabinId }));
  }

  function selectCabinForDraft(cabinId) {
    setDraft((d) => ({ ...d, cabinId }));
  }

  // Weekly goal (simple): user sets target minutes; reaching it gives bonus miles
  const [weeklyGoalMin, setWeeklyGoalMin] = useState(loaded?.weeklyGoalMin ?? 600);
  useEffect(() => {
    saveState({ miles, ownedCabins, selectedCabin, logs, draft, notes, active, weeklyGoalMin });
  }, [weeklyGoalMin]);

  const weeklyProgressPct = useMemo(() => clamp((mins7d / Math.max(1, weeklyGoalMin)) * 100, 0, 200), [mins7d, weeklyGoalMin]);
  const hasWeeklyBonus = useMemo(() => {
    // one bonus per week: detect by storing the ISO week token and checking
    const key = "flightfocus_week_bonus";
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    const token = `${d.getFullYear()}-W${week}`;
    const saved = localStorage.getItem(key);
    return saved === token;
  }, [mins7d]);

  function claimWeeklyBonus() {
    if (mins7d < weeklyGoalMin) return;
    const key = "flightfocus_week_bonus";
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    const token = `${d.getFullYear()}-W${week}`;
    if (localStorage.getItem(key) === token) return;

    const bonus = Math.round(weeklyGoalMin * 2); // 2 miles per goal minute
    setMiles((m) => m + bonus);
    localStorage.setItem(key, token);
    // tiny confetti-ish pulse via state tick
    setTick((t) => t + 1);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Subtle cockpit grid */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.18]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.10),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.07),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Plane className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold tracking-tight">FlightFocus</div>
                <div className="text-xs text-white/55">Cockpit-grade focus tracking • Miles for mastery</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="good">
                <Trophy className="h-3.5 w-3.5" /> {grade.name}
              </Chip>
              <Chip>
                <Gauge className="h-3.5 w-3.5" /> 7d: {mins7d} min
              </Chip>
              <Chip>
                <Timer className="h-3.5 w-3.5" /> Rate: {BASE_RATE}/min
              </Chip>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <GlassCard className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-white/55">Total Miles</div>
                  <div className="text-lg font-semibold tabular-nums">{miles.toLocaleString()}</div>
                </div>
              </div>
            </GlassCard>
            <PrimaryButton tone="ghost" icon={Trash2} onClick={resetAll}>
              Reset
            </PrimaryButton>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Planner + Notes */}
          <div className="lg:col-span-5 space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <div className="text-sm font-semibold">Flight Plan</div>
                </div>
                <Chip>
                  <Plane className="h-3.5 w-3.5" /> {selectedAircraft.name}
                </Chip>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <Field label="Callsign (Task title)" hint="Required">
                  <TextInput value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="e.g., Eiken Writing / Math II / Report Draft" />
                </Field>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Mission">
                    <Select
                      value={draft.type}
                      onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
                      options={FLIGHT_TYPES.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  </Field>

                  <Field label="Planned time" hint="min">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={draft.plannedMin}
                      onChange={(e) => setDraft((d) => ({ ...d, plannedMin: clamp(Number(e.target.value || 0), 5, 480) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Aircraft">
                    <Select
                      value={draft.aircraftId}
                      onChange={(v) => setDraft((d) => ({ ...d, aircraftId: v }))}
                      options={AIRCRAFT.map((a) => ({ value: a.id, label: `${a.name} — ${a.vibe}` }))}
                    />
                  </Field>

                  <Field label="Cabin Class" hint={ownedCabins.includes(draft.cabinId) ? "Owned" : "Locked"}>
                    <div className="relative">
                      <Select
                        value={draft.cabinId}
                        onChange={selectCabinForDraft}
                        options={CABIN_CLASSES.map((c) => ({
                          value: c.id,
                          label: `${c.name} ×${c.mult}${ownedCabins.includes(c.id) ? "" : ` • ${c.cost.toLocaleString()} mi`}`,
                        }))}
                      />
                      {!ownedCabins.includes(draft.cabinId) ? (
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/40">
                          <Lock className="h-4 w-4" />
                        </div>
                      ) : null}
                    </div>
                  </Field>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/60">Projected miles (if landed)</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {calcMiles({
                        focusMs: plannedMs,
                        aborted: false,
                        aircraftId: draft.aircraftId,
                        cabinId: ownedCabins.includes(draft.cabinId) ? draft.cabinId : selectedCabin,
                        gradeMult: grade.mult,
                      }).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-white/45">
                    Includes: aircraft × cabin × {grade.name} multiplier
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <PrimaryButton
                    icon={Play}
                    onClick={startFlight}
                    disabled={!!active || !canStart}
                  >
                    {active ? "In Flight" : "Board & Depart"}
                  </PrimaryButton>
                  <PrimaryButton
                    tone="ghost"
                    icon={NotebookPen}
                    onClick={() => {
                      // quick focus to notes area
                      const el = document.getElementById("flight-notes");
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    Flight Notes
                  </PrimaryButton>
                </div>

                {!canStart ? (
                  <div className="text-xs text-white/45">Tip: add a title and set at least 5 minutes.</div>
                ) : null}
              </div>
            </GlassCard>

            <GlassCard className="p-4" id="flight-notes">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4" />
                  <div className="text-sm font-semibold">Flight Notes</div>
                </div>
                <Chip>
                  <CalendarDays className="h-3.5 w-3.5" /> Scratchpad
                </Chip>
              </div>
              <div className="mt-3">
                <TextArea value={notes} onChange={setNotes} placeholder="Write quick notes, checkpoints, or what you need to do next…" />
                <div className="mt-2 text-[11px] text-white/45">
                  During an active flight, these notes are copied into the log at landing.
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Center/Right: Cockpit + Cabin Store + Weekly */}
          <div className="lg:col-span-7 space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Cockpit</div>
                  <div className="text-xs text-white/55">Taxi → Climb → Cruise → Descent → Land</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>
                    <Plane className="h-3.5 w-3.5" /> {active ? active.aircraftId : draft.aircraftId}
                  </Chip>
                  <Chip>
                    <ArrowUpRight className="h-3.5 w-3.5" /> {active ? currentCabin.name : (CABIN_CLASSES.find((c) => c.id === draft.cabinId)?.name || "Economy")}
                  </Chip>
                  <Chip tone="good">
                    <Trophy className="h-3.5 w-3.5" /> {grade.name}
                  </Chip>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <div className="text-xs text-white/55">Flight</div>
                  <div className="mt-1 text-base font-semibold">
                    {active ? active.title : (draft.title?.trim() || "—")}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip>
                      <Timer className="h-3.5 w-3.5" /> Planned {msToHMS((active?.plannedMs ?? plannedMs) || 0)}
                    </Chip>
                    <Chip>
                      <Gauge className="h-3.5 w-3.5" /> {active ? active.type : draft.type}
                    </Chip>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-xs text-white/55">Elapsed</div>
                        <div className="text-3xl font-semibold tabular-nums">{msToHMS(activeElapsedMs)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/55">Phase</div>
                        <div className="text-sm font-semibold">{statusLabel(cockpitPhase)}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Meter
                        value={activeElapsedMs}
                        max={active?.plannedMs ?? plannedMs}
                        labelLeft={active ? "On route" : "Planned"}
                        labelRight={`${Math.max(0, (active?.plannedMs ?? plannedMs) - activeElapsedMs) > 0 ? "ETA " + msToHMS((active?.plannedMs ?? plannedMs) - activeElapsedMs) : "At/over target"}`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <PrimaryButton
                      tone="ghost"
                      icon={active?.running ? Pause : Play}
                      onClick={active?.running ? pauseFlight : resumeFlight}
                      disabled={!active}
                    >
                      {active ? (active.running ? "Hold" : "Resume") : "Hold"}
                    </PrimaryButton>

                    <PrimaryButton
                      tone="ghost"
                      icon={Square}
                      onClick={() => landFlight({ aborted: false })}
                      disabled={!active}
                    >
                      Land
                    </PrimaryButton>

                    <PrimaryButton
                      tone="danger"
                      icon={Trash2}
                      onClick={() => landFlight({ aborted: true })}
                      disabled={!active}
                    >
                      Abort (50%)
                    </PrimaryButton>
                  </div>

                  <div className="mt-3 text-[11px] text-white/45">
                    Miles are awarded on landing. Aborting awards 50%.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Cabin Upgrades</div>
                    <Chip>
                      <ArrowUpRight className="h-3.5 w-3.5" /> Spend miles
                    </Chip>
                  </div>

                  <div className="mt-3 space-y-2">
                    {CABIN_CLASSES.map((c) => {
                      const owned = ownedCabins.includes(c.id);
                      const affordable = miles >= c.cost;
                      return (
                        <div key={c.id} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold">{c.name}</div>
                                <Chip>
                                  ×{c.mult}
                                </Chip>
                                {owned ? (
                                  <Chip tone="good">
                                    <Check className="h-3.5 w-3.5" /> Owned
                                  </Chip>
                                ) : (
                                  <Chip>
                                    <Lock className="h-3.5 w-3.5" /> {c.cost.toLocaleString()} mi
                                  </Chip>
                                )}
                              </div>
                              <div className="mt-1 text-[11px] text-white/45">
                                {c.id === "ECO"
                                  ? "Baseline operations."
                                  : c.id === "PREM"
                                  ? "Smoother cruise. Better yield."
                                  : c.id === "BUS"
                                  ? "High-performance routing."
                                  : "Flagship cabin. Max yield."}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {owned ? (
                                <PrimaryButton
                                  tone={selectedCabin === c.id ? "primary" : "ghost"}
                                  onClick={() => {
                                    setSelectedCabin(c.id);
                                    setDraft((d) => ({ ...d, cabinId: c.id }));
                                  }}
                                >
                                  {selectedCabin === c.id ? "Selected" : "Select"}
                                </PrimaryButton>
                              ) : (
                                <PrimaryButton
                                  tone="ghost"
                                  onClick={() => buyCabin(c.id)}
                                  disabled={!affordable || c.cost === 0}
                                >
                                  {affordable ? "Unlock" : "Insufficient"}
                                </PrimaryButton>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 text-[11px] text-white/45">
                    Tip: unlock a cabin once, then select it for future flights.
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Weekly Ops Target</div>
                  <div className="text-xs text-white/55">Hit your 7-day goal to claim a one-time weekly bonus.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>
                    <Timer className="h-3.5 w-3.5" /> Goal {weeklyGoalMin} min
                  </Chip>
                  <input
                    type="number"
                    min={60}
                    max={3000}
                    value={weeklyGoalMin}
                    onChange={(e) => setWeeklyGoalMin(clamp(Number(e.target.value || 0), 60, 3000))}
                    className="w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                  />
                  <PrimaryButton
                    tone="ghost"
                    icon={Trophy}
                    onClick={claimWeeklyBonus}
                    disabled={mins7d < weeklyGoalMin || hasWeeklyBonus}
                  >
                    {hasWeeklyBonus ? "Claimed" : "Claim Bonus"}
                  </PrimaryButton>
                </div>
              </div>

              <div className="mt-3">
                <Meter
                  value={mins7d}
                  max={weeklyGoalMin}
                  labelLeft={`${mins7d} / ${weeklyGoalMin} min`}
                  labelRight={mins7d >= weeklyGoalMin ? "Cleared" : `${Math.max(0, weeklyGoalMin - mins7d)} min remaining`}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Flight Log</div>
                <Chip>
                  <Timer className="h-3.5 w-3.5" /> {logs.length} records
                </Chip>
              </div>

              <div className="mt-3 space-y-2">
                {logs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/55">
                    No flights yet. Create a flight plan and depart.
                  </div>
                ) : null}

                <AnimatePresence>
                  {logs.slice(0, 30).map((l) => {
                    const ac = AIRCRAFT.find((a) => a.id === l.aircraftId);
                    const cab = CABIN_CLASSES.find((c) => c.id === l.cabinId);
                    const aborted = l.status === STATUS.ABORTED;
                    const earned = calcMiles({
                      focusMs: l.focusMs,
                      aborted,
                      aircraftId: l.aircraftId,
                      cabinId: l.cabinId,
                      gradeMult: grade.mult,
                    });
                    return (
                      <motion.div
                        key={l.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="rounded-2xl border border-white/10 bg-black/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold">{l.title}</div>
                              <Chip>
                                <Plane className="h-3.5 w-3.5" /> {ac?.name || l.aircraftId}
                              </Chip>
                              <Chip>
                                {cab?.name || l.cabinId} ×{cab?.mult ?? 1}
                              </Chip>
                              <Chip tone={aborted ? "warn" : "good"}>{aborted ? "Aborted" : "Landed"}</Chip>
                            </div>
                            <div className="text-[11px] text-white/45">
                              {formatDate(l.endedAt || l.createdAt)} • Focus {msToHMS(l.focusMs)} • Planned {msToHMS(l.plannedMs)}
                            </div>
                            {l.note ? (
                              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-white/70">
                                {l.note}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                              <div className="text-xs text-white/55">Miles (est.)</div>
                              <div className="text-base font-semibold tabular-nums">{earned.toLocaleString()}</div>
                            </div>
                            <PrimaryButton tone="ghost" icon={Trash2} onClick={() => deleteLog(l.id)}>
                              Delete
                            </PrimaryButton>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {logs.length > 30 ? (
                  <div className="text-xs text-white/45">Showing latest 30. (Stored up to 200.)</div>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>

        <footer className="mt-8 text-center text-[11px] text-white/35">
          FlightFocus MVP • Local-first (saved in your browser) • Add-ons like voice ATC + map routes can be layered later.
        </footer>
      </div>
    </div>
  );
}
