"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Award,
  Gauge,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";

type Props = {
  onBack: () => void;
};

type FallingKind = "milk_tea" | "cheese_foam" | "tapioca" | "bomb";

type FallingItem = {
  kind: FallingKind;
  x: number;
  y: number;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
};

type FloatText = {
  x: number;
  y: number;
  value: string;
  color: string;
  life: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  color: string;
};

type LeaderboardItem = {
  id: string;
  name: string;
  score: number;
  createdAt: string | null;
};

const TOPPING_META: Record<
  FallingKind,
  { emoji: string; pts: number; radius: number; color: string; label: string }
> = {
  milk_tea: {
    emoji: "🧋",
    pts: 8,
    radius: 14,
    color: "#8b5e3c",
    label: "Ly trà sữa",
  },
  cheese_foam: {
    emoji: "🧀",
    pts: 30,
    radius: 16,
    color: "#f6c65b",
    label: "Topping phô mai",
  },
  tapioca: {
    emoji: "🟤",
    pts: 16,
    radius: 13,
    color: "#4a2d1f",
    label: "Trân châu",
  },
  bomb: {
    emoji: "💣",
    pts: -1,
    radius: 15,
    color: "#111111",
    label: "Bom",
  },
};

function randomKind(): FallingKind {
  const rand = Math.random();
  if (rand < 0.52) return "milk_tea";
  if (rand < 0.76) return "tapioca";
  if (rand < 0.88) return "cheese_foam";
  return "bomb";
}

function rewardByScore(finalScore: number): string {
  if (finalScore >= 1000) return "1 ly trà sữa full topping";
  if (finalScore >= 700) return "1 voucher giảm 50%";
  if (finalScore >= 500) return "1 phần topping 10k";
  return "Đạt 500+ điểm để nhận phần thưởng";
}

const MAX_SCORE = 1000;
const BASE_SPEED = 3.1;
const MIN_SPAWN_INTERVAL = 22;
const TIGER_CATCHER_SRC = "/tiger-catcher.svg";

export default function ToppingCatchGame({ onBack }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tigerImageRef = useRef<HTMLImageElement | null>(null);

  const [mode, setMode] = useState<"start" | "playing" | "over">("start");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [speedDisplay, setSpeedDisplay] = useState(BASE_SPEED);
  const [hiScore, setHiScore] = useState(() => {
    if (typeof window === "undefined") return 0;
    const hi = Number(window.localStorage.getItem("topping_hi_score") ?? "0");
    return Number.isFinite(hi) ? hi : 0;
  });
  const [rewardText, setRewardText] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);

  const worldRef = useRef({
    w: 360,
    h: 600,
    cupX: 180,
    cupTargetX: 180,
    cupY: 520,
    cupW: 126,
    cupH: 102,
    speed: BASE_SPEED,
    spawnTimer: 0,
    spawnInterval: 74,
    comboCount: 0,
    comboActive: false,
    comboTimer: 0,
    items: [] as FallingItem[],
    particles: [] as Particle[],
    floatTexts: [] as FloatText[],
    localScore: 0,
    localLives: 3,
    localLevel: 1,
    touchX: 0,
  });

  const livesText = useMemo(() => "❤️".repeat(Math.max(0, lives)), [lives]);

  useEffect(() => {
    const image = new window.Image();
    image.src = TIGER_CATCHER_SRC;
    tigerImageRef.current = image;

    return () => {
      tigerImageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      if (!root || !canvas) return;

      const rect = root.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(560, Math.floor(rect.height));

      worldRef.current.w = w;
      worldRef.current.h = h;
      worldRef.current.cupY = h - 78;
      worldRef.current.cupX = Math.min(
        w - worldRef.current.cupW / 2,
        Math.max(worldRef.current.cupW / 2, worldRef.current.cupX),
      );
      worldRef.current.cupTargetX = worldRef.current.cupX;

      canvas.width = w;
      canvas.height = h;
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const next = clientX - rect.left;
      const half = worldRef.current.cupW / 2;
      const clamped = Math.max(half, Math.min(worldRef.current.w - half, next));
      worldRef.current.cupTargetX = clamped;
      worldRef.current.cupX = clamped;
    };

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchStart = (e: TouchEvent) => {
      worldRef.current.touchX = e.touches[0]?.clientX ?? 0;
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const delta = touch.clientX - worldRef.current.touchX;
      worldRef.current.touchX = touch.clientX;
      const half = worldRef.current.cupW / 2;
      const clamped = Math.max(
        half,
        Math.min(
          worldRef.current.w - half,
          worldRef.current.cupX + delta * 1.25,
        ),
      );
      worldRef.current.cupTargetX = clamped;
      worldRef.current.cupX = clamped;
      e.preventDefault();
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const fetchLeaderboard = React.useCallback(async () => {
    try {
      const res = await fetch(
        "/api/leaderboard?gameType=topping_catch&limit=5",
        {
          cache: "no-store",
        },
      );
      if (!res.ok) return;
      const payload = await res.json();
      setLeaderboard(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      // no-op for leaderboard network errors
    }
  }, []);

  const submitScore = React.useCallback(
    async (finalScore: number, finalLevel: number, finalLives: number) => {
      try {
        await fetch("/api/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameType: "topping_catch",
            name,
            phone,
            score: finalScore,
            level: finalLevel,
            livesLeft: finalLives,
          }),
        });
      } catch {
        // no-op for score save errors
      }
    },
    [name, phone],
  );

  const stopGame = React.useCallback(
    (finalScore: number, finalLevel: number, finalLives: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setMode("over");
      setRewardText(rewardByScore(finalScore));

      if (finalScore > hiScore) {
        setHiScore(finalScore);
        localStorage.setItem("topping_hi_score", String(finalScore));
      }

      void submitScore(finalScore, finalLevel, finalLives).then(
        fetchLeaderboard,
      );
    },
    [fetchLeaderboard, hiScore, submitScore],
  );

  useEffect(() => {
    if (mode !== "playing") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const world = worldRef.current;
      const { w, h } = world;

      // Passive ramp-up makes 1000 points genuinely hard.
      world.speed = Math.min(11.5, world.speed + 0.0022);

      world.spawnTimer += 1;
      if (world.spawnTimer >= world.spawnInterval) {
        world.spawnTimer = 0;
        const kind = randomKind();
        world.items.push({
          kind,
          x: 30 + Math.random() * (w - 60),
          y: -20,
          speed: world.speed + (Math.random() - 0.5) * 0.8,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.05 + Math.random() * 0.03,
        });
        if (world.spawnInterval > MIN_SPAWN_INTERVAL) {
          world.spawnInterval -= 0.16;
        }
      }

      world.cupX = world.cupTargetX;

      world.items = world.items.filter((item) => {
        item.y += item.speed;
        item.x += Math.sin(item.wobble) * 0.5;
        item.wobble += item.wobbleSpeed;

        const meta = TOPPING_META[item.kind];
        const catchY = world.cupY - world.cupH / 2 + 34;
        const catchW = world.cupW - 32;
        const hit =
          item.x > world.cupX - catchW / 2 - meta.radius &&
          item.x < world.cupX + catchW / 2 + meta.radius &&
          item.y > catchY - 10 &&
          item.y < catchY + 20;

        if (hit) {
          if (item.kind === "bomb") {
            world.localLives -= 1;
            spawnParticles(world, item.x, item.y, "#ff4420", 12);
            world.floatTexts.push({
              x: item.x,
              y: item.y - 10,
              value: "💔 -1 mạng",
              color: "#c82d22",
              life: 1,
            });
            world.comboCount = 0;
            world.comboActive = false;
          } else {
            let pts = meta.pts;
            if (world.comboActive) pts *= 2;
            world.localScore = Math.min(MAX_SCORE, world.localScore + pts);

            if (item.kind === "tapioca") {
              world.comboCount += 1;
              if (world.comboCount >= 5 && !world.comboActive) {
                world.comboActive = true;
                world.comboTimer = 220;
              }
            } else {
              world.comboCount = 0;
            }

            spawnParticles(world, item.x, item.y, meta.color, 10);
            world.floatTexts.push({
              x: item.x,
              y: item.y - 10,
              value: `+${pts}`,
              color: world.comboActive ? "#d42d22" : "#7a3a10",
              life: 1,
            });

            const nextLevel = 1 + Math.floor(world.localScore / 200);
            if (nextLevel > world.localLevel) {
              world.localLevel = nextLevel;
              world.speed = Math.min(
                11.5,
                BASE_SPEED + (world.localLevel - 1) * 0.95,
              );
            }
          }
          return false;
        }

        if (item.y > h + 30) {
          if (item.kind === "tapioca") {
            world.comboCount = 0;
            world.comboActive = false;
          }
          return false;
        }

        return true;
      });

      if (world.comboActive) {
        world.comboTimer -= 1;
        if (world.comboTimer <= 0) world.comboActive = false;
      }

      world.particles = world.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life -= 0.03;
        return p.life > 0;
      });

      world.floatTexts = world.floatTexts.filter((f) => {
        f.y -= 1.2;
        f.life -= 0.025;
        return f.life > 0;
      });

      drawFrame(ctx, world, tigerImageRef.current);

      setScore(world.localScore);
      setLives(world.localLives);
      setLevel(world.localLevel);
      setSpeedDisplay(world.speed);

      if (world.localLives <= 0) {
        stopGame(world.localScore, world.localLevel, world.localLives);
        return;
      }

      if (world.localScore >= MAX_SCORE) {
        stopGame(MAX_SCORE, world.localLevel, world.localLives);
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, stopGame]);

  function startGame() {
    const phoneRegex = /^(0|84)(3|5|7|8|9)([0-9]{8})$/;
    if (!name.trim() || !phone.trim()) {
      setError("Vui lòng nhập họ tên và số điện thoại.");
      return;
    }
    if (!phoneRegex.test(phone.trim())) {
      setError("Số điện thoại chưa hợp lệ.");
      return;
    }

    setError("");
    const world = worldRef.current;
    world.localScore = 0;
    world.localLives = 3;
    world.localLevel = 1;
    world.speed = BASE_SPEED;
    world.spawnTimer = 0;
    world.spawnInterval = 74;
    world.comboCount = 0;
    world.comboActive = false;
    world.comboTimer = 0;
    world.items = [];
    world.particles = [];
    world.floatTexts = [];
    world.cupX = world.w / 2;
    world.cupTargetX = world.w / 2;

    setScore(0);
    setLives(3);
    setLevel(1);
    setSpeedDisplay(BASE_SPEED);
    setRewardText("");
    void fetchLeaderboard();
    setMode("playing");
  }

  const progressToMax = Math.min(100, Math.round((score / MAX_SCORE) * 100));
  const speedPercent = Math.min(100, Math.round((speedDisplay / 11.5) * 100));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,#ffefe3_0%,#ffe9d6_28%,#f7ddc7_56%,#f0cfba_100%)] px-4 py-6">
      <section className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2 text-sm font-bold text-red-700 shadow-lg backdrop-blur"
          >
            <ArrowLeft size={16} />
            Quay lại chọn game
          </button>
          <h1 className="text-lg md:text-2xl font-black text-red-700 tracking-tight">
            Mini Game: Hứng Topping
          </h1>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-red-500">
              Mốc thưởng
            </p>
            <p className="text-sm font-bold text-gray-800">500: Topping 10k</p>
            <p className="text-sm font-bold text-gray-800">700: Voucher 50%</p>
            <p className="text-sm font-bold text-gray-800">
              1000: Trà sữa full topping
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <Award size={16} />
              <p className="text-xs uppercase tracking-wider">Tiến độ tối đa</p>
            </div>
            <div className="h-2 w-full rounded-full bg-amber-100">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-red-500"
                style={{ width: `${progressToMax}%` }}
              />
            </div>
            <p className="mt-1 text-sm font-bold text-gray-700">
              {score}/{MAX_SCORE} điểm
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-red-700">
              <Gauge size={16} />
              <p className="text-xs uppercase tracking-wider">
                Độ khó hiện tại
              </p>
            </div>
            <div className="h-2 w-full rounded-full bg-red-100">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-red-400 to-red-700"
                style={{ width: `${speedPercent}%` }}
              />
            </div>
            <p className="mt-1 text-sm font-bold text-gray-700">
              Tốc độ {speedDisplay.toFixed(1)}
            </p>
          </div>
        </div>

        <div
          ref={rootRef}
          className="relative mx-auto h-[640px] w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#fff4ea_0%,#f8ddc7_52%,#efc6ae_100%)] shadow-2xl"
        >
          <canvas ref={canvasRef} className="h-full w-full touch-none" />

          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/60 to-transparent" />

          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-3">
            <div className="rounded-2xl border border-red-300/50 bg-red-600/90 px-3 py-2 text-white shadow-lg">
              <p className="text-[10px] uppercase tracking-wider opacity-80">
                Điểm
              </p>
              <p className="text-2xl font-black leading-none">{score}</p>
            </div>
            <div className="rounded-2xl border border-red-300/70 bg-white/85 px-3 py-2 text-lg shadow">
              {livesText || "💔"}
            </div>
            <div className="rounded-2xl border border-[#7c4a2a]/40 bg-[#7c4a2a]/90 px-3 py-2 text-white shadow-lg">
              <p className="text-[10px] uppercase tracking-wider opacity-80">
                Kỷ lục
              </p>
              <p className="text-2xl font-black leading-none">
                {Math.max(hiScore, score)}
              </p>
            </div>
          </div>

          {mode === "start" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[linear-gradient(165deg,rgba(255,248,242,0.94),rgba(254,233,214,0.92))] p-6 text-center backdrop-blur-sm">
              <h2 className="text-4xl font-black leading-tight text-red-700 tracking-tight">
                🧋 Boba Catch Rush
              </h2>
              <p className="max-w-xs text-sm text-[#8a5a3a] font-medium">
                Hứng icon ly trà sữa và topping phô mai, né bom, chạm 1000 điểm
                để lấy phần thưởng cao nhất.
              </p>

              <div className="w-full max-w-xs space-y-2 text-left">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Họ và tên"
                  className="w-full rounded-2xl border border-red-200 bg-white/90 px-4 py-2.5 outline-none focus:border-red-400"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Số điện thoại"
                  className="w-full rounded-2xl border border-red-200 bg-white/90 px-4 py-2.5 outline-none focus:border-red-400"
                />
              </div>

              {error && (
                <div className="w-full max-w-xs rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2 text-xs text-[#7a4a28] font-semibold">
                <span className="rounded-full bg-red-100 px-2 py-1">🧋 +8</span>
                <span className="rounded-full bg-red-100 px-2 py-1">
                  🟤 +16
                </span>
                <span className="rounded-full bg-red-100 px-2 py-1">
                  🧀 +30
                </span>
                <span className="rounded-full bg-red-100 px-2 py-1">
                  💣 -1 mạng
                </span>
              </div>

              <button
                onClick={startGame}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-700 to-red-500 px-8 py-3 text-lg font-black text-white shadow-xl"
              >
                <Play size={18} />
                Bắt đầu
              </button>
            </div>
          )}

          {mode === "over" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[linear-gradient(165deg,rgba(255,248,242,0.94),rgba(254,233,214,0.92))] p-6 text-center backdrop-blur-sm">
              <h2 className="text-3xl font-black text-red-700 tracking-tight">
                {score >= MAX_SCORE ? "Bạn chạm mốc tối đa!" : "Hết lượt! 🫗"}
              </h2>
              <div className="rounded-2xl bg-red-100 px-6 py-4 shadow">
                <p className="text-5xl font-black text-red-700">{score}</p>
                <p className="text-xs uppercase tracking-widest text-[#8a5a3a]">
                  Điểm số
                </p>
                <p className="mt-1 text-xs text-[#8a5a3a]">Cấp {level}</p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700 font-semibold">
                <div className="mb-1 inline-flex items-center gap-1 text-red-600">
                  <Sparkles size={14} />
                  Phần thưởng đạt được
                </div>
                {rewardText}
              </div>

              <button
                onClick={startGame}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-700 to-red-500 px-8 py-3 text-lg font-black text-white shadow-xl"
              >
                <RotateCcw size={18} />
                Chơi lại
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto mt-5 max-w-[440px] rounded-3xl border border-white/70 bg-white/80 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-red-700">
            <Trophy size={16} />
            <p className="text-sm font-black uppercase tracking-wider">
              Bảng xếp hạng Hứng Topping
            </p>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có dữ liệu điểm.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {leaderboard.map((item, idx) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-gradient-to-r from-red-50 to-amber-50 px-3 py-2"
                >
                  <span className="font-semibold text-gray-700">
                    #{idx + 1} {item.name}
                  </span>
                  <span className="font-black text-red-700">{item.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function spawnParticles(
  world: {
    particles: Particle[];
  },
  x: number,
  y: number,
  color: string,
  count = 8,
) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 2 + Math.random() * 4;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 3,
      life: 1,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  world: {
    w: number;
    h: number;
    cupX: number;
    cupY: number;
    cupW: number;
    cupH: number;
    items: FallingItem[];
    particles: Particle[];
    floatTexts: FloatText[];
    comboActive: boolean;
    comboTimer: number;
  },
  tigerImage: HTMLImageElement | null,
) {
  const { w, h } = world;
  ctx.clearRect(0, 0, w, h);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#fff4ea");
  g.addColorStop(0.45, "#f8dec8");
  g.addColorStop(1, "#efc4ad");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < w; i += 44) {
    ctx.strokeStyle = "rgba(190,120,80,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }

  for (let i = 0; i < 4; i += 1) {
    const x =
      (((i * w) / 3 + Date.now() * (0.01 + i * 0.003)) % (w + 140)) - 70;
    const y = 36 + i * 18;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 18, y - 8, 14, 0, Math.PI * 2);
    ctx.arc(x + 34, y + 2, 16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
  }

  for (const item of world.items) {
    const meta = TOPPING_META[item.kind];
    const badgeRadius = meta.radius + 5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(item.x, item.y, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle =
      item.kind === "bomb"
        ? "rgba(255, 214, 214, 0.98)"
        : "rgba(255,255,255,0.98)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      item.kind === "bomb" ? "rgba(220,45,45,0.8)" : "rgba(255,255,255,0.95)";
    ctx.stroke();

    ctx.font = `900 ${Math.floor(meta.radius * 1.8)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 2;
    ctx.fillText(meta.emoji, item.x, item.y);
    ctx.restore();
  }

  for (const p of world.particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const f of world.floatTexts) {
    ctx.save();
    ctx.globalAlpha = f.life;
    ctx.fillStyle = f.color;
    ctx.font = "bold 17px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.value, f.x, f.y);
    ctx.restore();
  }

  if (world.comboActive) {
    const progress = Math.max(0, world.comboTimer / 300);
    ctx.save();
    ctx.strokeStyle = `rgba(212,45,34,${progress * 0.6})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.restore();
  }

  if (tigerImage && tigerImage.complete) {
    ctx.save();
    ctx.shadowColor = "rgba(120, 40, 0, 0.25)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(
      tigerImage,
      world.cupX - world.cupW / 2,
      world.cupY - world.cupH / 2,
      world.cupW,
      world.cupH,
    );
    ctx.restore();
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(200,40,30,0.3)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.moveTo(world.cupX - world.cupW / 2 + 8, world.cupY - world.cupH / 2);
    ctx.lineTo(world.cupX + world.cupW / 2 - 8, world.cupY - world.cupH / 2);
    ctx.lineTo(world.cupX + world.cupW / 2 - 4, world.cupY + world.cupH / 2);
    ctx.lineTo(world.cupX - world.cupW / 2 + 4, world.cupY + world.cupH / 2);
    ctx.closePath();
    const cupGradient = ctx.createLinearGradient(
      world.cupX - world.cupW / 2,
      world.cupY,
      world.cupX + world.cupW / 2,
      world.cupY,
    );
    cupGradient.addColorStop(0, "#c82d22");
    cupGradient.addColorStop(0.42, "#ee4b3b");
    cupGradient.addColorStop(1, "#8f1912");
    ctx.fillStyle = cupGradient;
    ctx.fill();
    ctx.restore();
  }
}
