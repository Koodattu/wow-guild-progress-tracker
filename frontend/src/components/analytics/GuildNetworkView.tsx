"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useGuildNetworkMeta } from "@/lib/queries";
import { getAllClasses, getClassInfoById, getGuildProfileUrl } from "@/lib/utils";
import type {
  AllNetworkLayout,
  BuiltGuildNetwork,
  FlowBlock,
  FlowNetworkLayout,
  GuildNetworkMode,
  NetworkBounds,
  TierNetworkLayout,
  WorkerMessage,
} from "./guild-network-types";

type CanvasSize = {
  width: number;
  height: number;
};

type Viewport = {
  x: number;
  y: number;
  k: number;
};

type NetworkSelection = {
  type: "character" | "guild";
  index: number;
};

type HoverState = NetworkSelection & {
  screenX: number;
  screenY: number;
};

type Point = {
  x: number;
  y: number;
};

type LocatedEntity = NetworkSelection & Point;

type SearchResult = NetworkSelection & {
  label: string;
  detail: string;
  rank: number;
  reports: number;
};

const CLASS_COLORS: Record<number, string> = {
  1: "#c41e3a",
  2: "#ff7c0a",
  3: "#aad372",
  4: "#3fc7eb",
  5: "#00ff98",
  6: "#f48cba",
  7: "#ffffff",
  8: "#fff468",
  9: "#0070dd",
  10: "#8788ee",
  11: "#c69b6d",
  12: "#a330c9",
  13: "#33937f",
};

const MODE_OPTIONS: Array<{ value: GuildNetworkMode; label: string }> = [
  { value: "tier", label: "Raid View" },
  { value: "all", label: "All Raids" },
  { value: "flow", label: "Lineages" },
];

const MIN_REPORT_OPTIONS = [1, 2, 5, 10, 20];
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function classColor(classID: number): string {
  return CLASS_COLORS[classID] || "#9ca3af";
}

function rgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((part) => part + part).join("") : normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function guildFill(hue: number, alpha: number): string {
  return `hsla(${hue}, 72%, 48%, ${alpha})`;
}

function guildStroke(hue: number, alpha: number): string {
  return `hsla(${hue}, 82%, 64%, ${alpha})`;
}

function buttonClass(active = false): string {
  return `inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] ${
    active
      ? "bg-blue-600 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.38),0_10px_30px_rgba(37,99,235,0.24)]"
      : "bg-gray-900/80 text-gray-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-gray-800 hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"
  }`;
}

function getTierLayout(network: BuiltGuildNetwork, tierIndex: number): TierNetworkLayout {
  return network.tierLayouts[Math.max(0, Math.min(tierIndex, network.tierLayouts.length - 1))];
}

function activeBounds(network: BuiltGuildNetwork, mode: GuildNetworkMode, tierIndex: number): NetworkBounds {
  if (mode === "flow") return network.flowLayout.bounds;
  if (mode === "all") return network.allLayout.bounds;
  return getTierLayout(network, tierIndex).bounds;
}

function fitBounds(bounds: NetworkBounds, size: CanvasSize): Viewport {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const padding = size.width < 768 ? 34 : 56;
  const k = Math.max(0.16, Math.min(2.8, Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height)));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: size.width / 2 - centerX * k,
    y: size.height / 2 - centerY * k,
    k,
  };
}

function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.k,
    y: (point.y - viewport.y) / viewport.k,
  };
}

function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.k + viewport.x,
    y: point.y * viewport.k + viewport.y,
  };
}

function entityKey(entity: NetworkSelection | null): string {
  return entity ? `${entity.type}:${entity.index}` : "";
}

function guildPositionMap(layout: TierNetworkLayout | AllNetworkLayout): Map<number, Point> {
  const positions = new Map<number, Point>();
  for (let i = 0; i < layout.guildIndex.length; i += 1) {
    positions.set(layout.guildIndex[i], { x: layout.guildX[i], y: layout.guildY[i] });
  }
  return positions;
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function isCharacterVisible(character: BuiltGuildNetwork["characters"][number], reports: number, minReports: number, classFilter: number | null): boolean {
  return reports >= minReports && (classFilter === null || character.classID === classFilter);
}

function isInViewport(point: Point, radius: number, size: CanvasSize): boolean {
  return point.x >= -radius && point.y >= -radius && point.x <= size.width + radius && point.y <= size.height + radius;
}

function drawBackground(context: CanvasRenderingContext2D, size: CanvasSize) {
  const gradient = context.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, "#030712");
  gradient.addColorStop(0.55, "#07111f");
  gradient.addColorStop(1, "#020617");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size.width, size.height);
}

function drawLabel(context: CanvasRenderingContext2D, text: string, point: Point, color = "rgba(229, 231, 235, 0.9)") {
  context.font = "600 11px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(2, 6, 23, 0.72)";
  const width = context.measureText(text).width + 12;
  context.beginPath();
  context.roundRect(point.x - width / 2, point.y - 9, width, 18, 5);
  context.fill();
  context.fillStyle = color;
  context.fillText(text, point.x, point.y);
}

function drawGuildClusters(
  context: CanvasRenderingContext2D,
  network: BuiltGuildNetwork,
  layout: TierNetworkLayout | AllNetworkLayout,
  viewport: Viewport,
  size: CanvasSize,
  hovered: NetworkSelection | null,
  selected: NetworkSelection | null,
) {
  for (let i = 0; i < layout.guildIndex.length; i += 1) {
    const guildIndex = layout.guildIndex[i];
    const guild = network.guilds[guildIndex];
    if (!guild) continue;

    const screen = worldToScreen({ x: layout.guildX[i], y: layout.guildY[i] }, viewport);
    const radius = Math.max(4, layout.guildRadius[i] * viewport.k);
    if (!isInViewport(screen, radius + 80, size)) continue;

    const isHovered = hovered?.type === "guild" && hovered.index === guildIndex;
    const isSelected = selected?.type === "guild" && selected.index === guildIndex;

    context.beginPath();
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    context.fillStyle = guildFill(guild.hue, isSelected ? 0.22 : isHovered ? 0.18 : 0.105);
    context.fill();
    context.lineWidth = isSelected ? 2.2 : isHovered ? 1.7 : 1;
    context.strokeStyle = guildStroke(guild.hue, isSelected ? 0.68 : isHovered ? 0.52 : 0.26);
    context.stroke();

    if (radius > 24 || i < 10) {
      drawLabel(context, guild.name, { x: screen.x, y: screen.y - radius - 12 });
    }
  }
}

function drawCharacterNodes(
  context: CanvasRenderingContext2D,
  network: BuiltGuildNetwork,
  layout: TierNetworkLayout | AllNetworkLayout,
  viewport: Viewport,
  size: CanvasSize,
  minReports: number,
  classFilter: number | null,
  hovered: NetworkSelection | null,
  selected: NetworkSelection | null,
) {
  for (let i = 0; i < layout.nodeCharacterIndex.length; i += 1) {
    const characterIndex = layout.nodeCharacterIndex[i];
    const character = network.characters[characterIndex];
    const reports = layout.nodeReports[i];
    if (!character || !isCharacterVisible(character, reports, minReports, classFilter)) continue;

    const screen = worldToScreen({ x: layout.nodeX[i], y: layout.nodeY[i] }, viewport);
    if (!isInViewport(screen, 10, size)) continue;

    const isHovered = hovered?.type === "character" && hovered.index === characterIndex;
    const isSelected = selected?.type === "character" && selected.index === characterIndex;
    const radius = Math.max(isSelected || isHovered ? 3.8 : 1.55, Math.min(5.6, 1.3 + Math.log2(reports + 1) * 0.42));
    const color = classColor(character.classID);

    context.beginPath();
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    context.fillStyle = rgba(color, isSelected ? 1 : isHovered ? 0.95 : 0.78);
    context.fill();

    if (isSelected || isHovered) {
      context.lineWidth = isSelected ? 2.4 : 1.6;
      context.strokeStyle = isSelected ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.62)";
      context.stroke();
    }
  }
}

function drawAllFibers(
  context: CanvasRenderingContext2D,
  network: BuiltGuildNetwork,
  layout: AllNetworkLayout,
  viewport: Viewport,
  minReports: number,
  classFilter: number | null,
) {
  const positions = guildPositionMap(layout);
  context.lineCap = "round";

  for (let i = 0; i < layout.fiberCharacterIndex.length; i += 1) {
    const character = network.characters[layout.fiberCharacterIndex[i]];
    if (!character || !isCharacterVisible(character, character.totalReports, minReports, classFilter)) continue;

    const from = positions.get(layout.fiberFromGuildIndex[i]);
    const to = positions.get(layout.fiberToGuildIndex[i]);
    if (!from || !to) continue;

    const fromScreen = worldToScreen(from, viewport);
    const toScreen = worldToScreen(to, viewport);
    context.beginPath();
    context.moveTo(fromScreen.x, fromScreen.y);
    context.lineTo(toScreen.x, toScreen.y);
    context.lineWidth = Math.max(0.35, Math.min(1.8, Math.log2(layout.fiberReports[i] + 1) * 0.22));
    context.strokeStyle = rgba(classColor(character.classID), 0.055);
    context.stroke();
  }
}

function drawFlowLayout(
  context: CanvasRenderingContext2D,
  network: BuiltGuildNetwork,
  layout: FlowNetworkLayout,
  viewport: Viewport,
  size: CanvasSize,
  hovered: NetworkSelection | null,
  selected: NetworkSelection | null,
) {
  const blocks = new Map(layout.blocks.map((block) => [block.key, block]));
  const blockWidth = 64;

  for (const ribbon of layout.ribbons) {
    const from = blocks.get(ribbon.fromKey);
    const to = blocks.get(ribbon.toKey);
    if (!from || !to) continue;

    const x1 = from.x + blockWidth / 2;
    const x2 = to.x - blockWidth / 2;
    const curve = Math.max(80, Math.abs(x2 - x1) * 0.48);
    const y1 = ribbon.fromY;
    const y2 = ribbon.toY;
    const half = ribbon.height / 2;
    const top1 = worldToScreen({ x: x1, y: y1 - half }, viewport);
    const bottom1 = worldToScreen({ x: x1, y: y1 + half }, viewport);
    const top2 = worldToScreen({ x: x2, y: y2 - half }, viewport);
    const bottom2 = worldToScreen({ x: x2, y: y2 + half }, viewport);
    if (top1.x > size.width + 80 || top2.x < -80) continue;

    const hue = ribbon.guildIndex !== null ? network.guilds[ribbon.guildIndex]?.hue ?? 210 : 220;
    context.beginPath();
    context.moveTo(top1.x, top1.y);
    context.bezierCurveTo(top1.x + curve * viewport.k, top1.y, top2.x - curve * viewport.k, top2.y, top2.x, top2.y);
    context.lineTo(bottom2.x, bottom2.y);
    context.bezierCurveTo(bottom2.x - curve * viewport.k, bottom2.y, bottom1.x + curve * viewport.k, bottom1.y, bottom1.x, bottom1.y);
    context.closePath();
    context.fillStyle = guildFill(hue, 0.16);
    context.fill();
  }

  for (const block of layout.blocks) {
    const center = worldToScreen({ x: block.x, y: block.y }, viewport);
    const width = Math.max(9, blockWidth * viewport.k);
    const height = Math.max(3, block.height * viewport.k);
    if (!isInViewport(center, Math.max(width, height), size)) continue;

    const guild = block.guildIndex !== null ? network.guilds[block.guildIndex] : null;
    const isHovered = hovered?.type === "guild" && guild && hovered.index === block.guildIndex;
    const isSelected = selected?.type === "guild" && guild && selected.index === block.guildIndex;
    const hue = guild?.hue ?? 220;

    context.beginPath();
    context.roundRect(center.x - width / 2, center.y - height / 2, width, height, Math.min(6, width / 3, height / 2));
    context.fillStyle = guild ? guildFill(hue, isSelected ? 0.72 : isHovered ? 0.62 : 0.48) : "rgba(148, 163, 184, 0.25)";
    context.fill();
    context.lineWidth = isSelected ? 2 : 1;
    context.strokeStyle = guild ? guildStroke(hue, isSelected ? 0.86 : 0.44) : "rgba(203, 213, 225, 0.28)";
    context.stroke();

    if (height > 16 && width > 24) {
      drawLabel(context, guild?.name || "Other", { x: center.x, y: center.y }, "rgba(255,255,255,0.92)");
    }
  }

  context.font = "700 12px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "rgba(156, 163, 175, 0.9)";
  network.tiers.forEach((tier, tierIndex) => {
    const screen = worldToScreen({ x: tierIndex * 270, y: layout.bounds.minY - 34 }, viewport);
    if (screen.x >= -80 && screen.x <= size.width + 80) {
      context.fillText(tier.name, screen.x, Math.max(8, screen.y));
    }
  });
}

function pickFromNodeLayout(
  network: BuiltGuildNetwork,
  layout: TierNetworkLayout | AllNetworkLayout,
  point: Point,
  viewport: Viewport,
  minReports: number,
  classFilter: number | null,
): NetworkSelection | null {
  const world = screenToWorld(point, viewport);
  const hitRadius = Math.max(5, 7 / viewport.k);

  for (let i = layout.nodeCharacterIndex.length - 1; i >= 0; i -= 1) {
    const characterIndex = layout.nodeCharacterIndex[i];
    const character = network.characters[characterIndex];
    if (!character || !isCharacterVisible(character, layout.nodeReports[i], minReports, classFilter)) continue;

    const dx = layout.nodeX[i] - world.x;
    const dy = layout.nodeY[i] - world.y;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return { type: "character", index: characterIndex };
    }
  }

  for (let i = 0; i < layout.guildIndex.length; i += 1) {
    const dx = layout.guildX[i] - world.x;
    const dy = layout.guildY[i] - world.y;
    const radius = layout.guildRadius[i];
    if (dx * dx + dy * dy <= radius * radius) {
      return { type: "guild", index: layout.guildIndex[i] };
    }
  }

  return null;
}

function pickFromFlow(layout: FlowNetworkLayout, point: Point, viewport: Viewport): NetworkSelection | null {
  const world = screenToWorld(point, viewport);
  const blockWidth = 64;

  for (const block of layout.blocks) {
    if (block.guildIndex === null) continue;
    if (Math.abs(world.x - block.x) <= blockWidth / 2 && Math.abs(world.y - block.y) <= block.height / 2) {
      return { type: "guild", index: block.guildIndex };
    }
  }

  return null;
}

function findEntityPosition(network: BuiltGuildNetwork, mode: GuildNetworkMode, tierIndex: number, selection: NetworkSelection): LocatedEntity | null {
  const layout = mode === "all" || selection.type === "character" ? network.allLayout : mode === "tier" ? getTierLayout(network, tierIndex) : null;

  if (selection.type === "character") {
    const nodeLayout = layout || network.allLayout;
    for (let i = 0; i < nodeLayout.nodeCharacterIndex.length; i += 1) {
      if (nodeLayout.nodeCharacterIndex[i] === selection.index) {
        return { ...selection, x: nodeLayout.nodeX[i], y: nodeLayout.nodeY[i] };
      }
    }
    return null;
  }

  if (mode === "flow") {
    const matching = network.flowLayout.blocks.find((block) => block.guildIndex === selection.index);
    if (matching) return { ...selection, x: matching.x, y: matching.y };
  }

  const nodeLayout = layout || network.allLayout;
  for (let i = 0; i < nodeLayout.guildIndex.length; i += 1) {
    if (nodeLayout.guildIndex[i] === selection.index) {
      return { ...selection, x: nodeLayout.guildX[i], y: nodeLayout.guildY[i] };
    }
  }

  return null;
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-gray-950/60 px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

function EntityInspector({ network, selection }: { network: BuiltGuildNetwork | null; selection: NetworkSelection | null }) {
  if (!network || !selection) {
    return (
      <div className="rounded-md bg-gray-950/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
        <div className="text-sm font-semibold text-white">Selection</div>
        <div className="mt-2 text-sm text-gray-500 text-pretty">No character or guild selected.</div>
      </div>
    );
  }

  if (selection.type === "guild") {
    const guild = network.guilds[selection.index];
    if (!guild) return null;

    return (
      <div className="rounded-md bg-gray-950/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Guild</div>
        <h2 className="mt-1 text-lg font-bold text-white text-balance">{guild.name}</h2>
        <div className="text-sm text-gray-400">{guild.realm}</div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatPill label="Raiders" value={formatCount(guild.characterCount)} />
          <StatPill label="Raids" value={formatCount(guild.tierCount)} />
          <StatPill label="Reports" value={formatCount(guild.totalReports)} />
        </div>
        <Link href={getGuildProfileUrl(guild.realm, guild.name)} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-blue-500 active:scale-[0.96]">
          Open guild
        </Link>
      </div>
    );
  }

  const character = network.characters[selection.index];
  if (!character) return null;
  const classInfo = getClassInfoById(character.classID);
  const memberships = [];
  for (let i = 0; i < character.memberships.length; i += 3) {
    const tier = network.tiers[character.memberships[i]];
    const guild = network.guilds[character.memberships[i + 1]];
    const reports = character.memberships[i + 2];
    if (!tier || !guild) continue;
    memberships.push({ tier, guild, reports });
  }
  memberships.sort((a, b) => b.tier.id - a.tier.id || b.reports - a.reports);

  return (
    <div className="rounded-md bg-gray-950/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{classInfo.name}</div>
      <h2 className="mt-1 text-lg font-bold text-white text-balance">{character.name}</h2>
      <div className="text-sm text-gray-400">{character.realm}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatPill label="Reports" value={formatCount(character.totalReports)} />
        <StatPill label="Guilds" value={formatCount(character.guildCount)} />
        <StatPill label="Raids" value={formatCount(character.tierCount)} />
      </div>
      <Link
        href={`/characters/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}`}
        className="mt-4 inline-flex min-h-10 items-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-blue-500 active:scale-[0.96]"
      >
        Open character
      </Link>
      {memberships.length > 0 && (
        <div className="mt-4 max-h-64 overflow-y-auto pr-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Raid history</div>
          <div className="space-y-2">
            {memberships.slice(0, 14).map((membership) => (
              <div key={`${membership.tier.id}:${membership.guild.name}:${membership.guild.realm}`} className="rounded-md bg-gray-900/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-100">{membership.guild.name}</div>
                    <div className="truncate text-xs text-gray-500">{membership.tier.name}</div>
                  </div>
                  <div className="text-sm font-bold text-gray-200 tabular-nums">{membership.reports}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GuildNetworkView() {
  const { data: meta, isLoading: metaLoading, error: metaError } = useGuildNetworkMeta();
  const [network, setNetwork] = useState<BuiltGuildNetwork | null>(null);
  const [workerStatus, setWorkerStatus] = useState("Preparing network");
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [mode, setMode] = useState<GuildNetworkMode>("tier");
  const [tierIndex, setTierIndex] = useState(0);
  const [minReports, setMinReports] = useState(2);
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const [selected, setSelected] = useState<NetworkSelection | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, k: 1 });
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const hoveredRef = useRef<HoverState | null>(null);
  const selectedRef = useRef<NetworkSelection | null>(null);

  const classes = useMemo(() => getAllClasses(), []);
  const latestTierIndex = Math.max(0, (network?.tiers.length || 1) - 1);

  useEffect(() => {
    if (!meta?.etag) return;

    const worker = new Worker(new URL("./guild-network.worker.ts", import.meta.url), { type: "module" });
    setNetwork(null);
    setWorkerError(null);
    setWorkerStatus("Preparing network");

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "status") {
        setWorkerStatus(event.data.message);
        return;
      }
      if (event.data.type === "error") {
        setWorkerError(event.data.error);
        return;
      }
      setNetwork(event.data.network);
      setTierIndex(Math.max(0, event.data.network.tiers.length - 1));
      setWorkerStatus("Ready");
    };

    worker.onerror = () => {
      setWorkerError("Failed to initialize the network worker");
    };

    const separator = api.getGuildNetworkUniverseUrl().includes("?") ? "&" : "?";
    worker.postMessage({
      type: "load",
      universeUrl: `${api.getGuildNetworkUniverseUrl()}${separator}v=${encodeURIComponent(meta.etag)}`,
    });

    return () => {
      worker.terminate();
    };
  }, [meta?.etag]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !network || size.width <= 0 || size.height <= 0) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.floor(size.width * dpr);
    const pixelHeight = Math.floor(size.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    drawBackground(context, size);

    const viewport = viewportRef.current;
    const selectedEntity = selectedRef.current;
    const hoveredEntity = hoveredRef.current;

    if (mode === "flow") {
      drawFlowLayout(context, network, network.flowLayout, viewport, size, hoveredEntity, selectedEntity);
      return;
    }

    const layout = mode === "all" ? network.allLayout : getTierLayout(network, tierIndex);
    if (mode === "all") {
      drawAllFibers(context, network, network.allLayout, viewport, minReports, classFilter);
    }
    drawGuildClusters(context, network, layout, viewport, size, hoveredEntity, selectedEntity);
    drawCharacterNodes(context, network, layout, viewport, size, minReports, classFilter, hoveredEntity, selectedEntity);
  }, [classFilter, minReports, mode, network, size, tierIndex]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!network || size.width <= 0 || size.height <= 0) return;
    viewportRef.current = fitBounds(activeBounds(network, mode, tierIndex), size);
    scheduleDraw();
  }, [mode, network, scheduleDraw, size, tierIndex]);

  useEffect(() => {
    scheduleDraw();
  }, [classFilter, minReports, scheduleDraw, selected, hovered]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!network) return [];
    const normalized = normalizeSearch(query);
    if (normalized.length < 2) return [];

    const results: SearchResult[] = [];
    network.characters.forEach((character, index) => {
      if (!character.searchText.includes(normalized)) return;
      const starts = character.searchText.startsWith(normalized) ? 0 : 1;
      results.push({
        type: "character",
        index,
        label: character.name,
        detail: `${character.realm} · ${getClassInfoById(character.classID).name}`,
        rank: starts,
        reports: character.totalReports,
      });
    });

    network.guilds.forEach((guild, index) => {
      if (!guild.searchText.includes(normalized)) return;
      const starts = guild.searchText.startsWith(normalized) ? 0 : 1;
      results.push({
        type: "guild",
        index,
        label: guild.name,
        detail: guild.realm,
        rank: starts,
        reports: guild.totalReports,
      });
    });

    return results.sort((a, b) => a.rank - b.rank || b.reports - a.reports || a.label.localeCompare(b.label)).slice(0, 10);
  }, [network, query]);

  const focusSelection = useCallback(
    (selection: NetworkSelection, nextMode = mode) => {
      if (!network || size.width <= 0 || size.height <= 0) return;
      const position = findEntityPosition(network, nextMode, tierIndex, selection);
      if (!position) return;
      viewportRef.current = {
        x: size.width / 2 - position.x * viewportRef.current.k,
        y: size.height / 2 - position.y * viewportRef.current.k,
        k: Math.max(viewportRef.current.k, nextMode === "flow" ? 0.78 : 0.95),
      };
      scheduleDraw();
    },
    [mode, network, scheduleDraw, size, tierIndex],
  );

  const selectEntity = useCallback(
    (selection: NetworkSelection | null, focus = false) => {
      selectedRef.current = selection;
      setSelected(selection);
      if (selection && focus) {
        if (selection.type === "character" && mode === "flow") {
          setMode("all");
          requestAnimationFrame(() => focusSelection(selection, "all"));
        } else {
          focusSelection(selection);
        }
      } else {
        scheduleDraw();
      }
    },
    [focusSelection, mode, scheduleDraw],
  );

  const pickEntity = useCallback(
    (point: Point): NetworkSelection | null => {
      if (!network) return null;
      const viewport = viewportRef.current;
      if (mode === "flow") return pickFromFlow(network.flowLayout, point, viewport);
      const layout = mode === "all" ? network.allLayout : getTierLayout(network, tierIndex);
      return pickFromNodeLayout(network, layout, point, viewport, minReports, classFilter);
    },
    [classFilter, minReports, mode, network, tierIndex],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(canvas, event);
    dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = getCanvasPoint(canvas, event);
      const drag = dragRef.current;

      if (drag && drag.pointerId === event.pointerId) {
        const dx = point.x - drag.x;
        const dy = point.y - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        viewportRef.current = {
          ...viewportRef.current,
          x: viewportRef.current.x + dx,
          y: viewportRef.current.y + dy,
        };
        drag.x = point.x;
        drag.y = point.y;
        scheduleDraw();
        return;
      }

      const hit = pickEntity(point);
      const nextHover = hit ? { ...hit, screenX: point.x, screenY: point.y } : null;
      if (entityKey(nextHover) !== entityKey(hoveredRef.current)) {
        hoveredRef.current = nextHover;
        setHovered(nextHover);
      } else if (nextHover && hoveredRef.current) {
        hoveredRef.current = nextHover;
        setHovered(nextHover);
      }
      scheduleDraw();
    },
    [pickEntity, scheduleDraw],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const drag = dragRef.current;
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (drag?.moved) return;

      const point = getCanvasPoint(canvas, event);
      selectEntity(pickEntity(point));
    },
    [pickEntity, selectEntity],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = getCanvasPoint(canvas, event);
      const before = screenToWorld(point, viewportRef.current);
      const factor = Math.exp(-event.deltaY * 0.0011);
      const nextK = Math.max(0.12, Math.min(5.2, viewportRef.current.k * factor));
      viewportRef.current = {
        k: nextK,
        x: point.x - before.x * nextK,
        y: point.y - before.y * nextK,
      };
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const resetView = useCallback(() => {
    if (!network || size.width <= 0 || size.height <= 0) return;
    viewportRef.current = fitBounds(activeBounds(network, mode, tierIndex), size);
    scheduleDraw();
  }, [mode, network, scheduleDraw, size, tierIndex]);

  const hoverLabel = useMemo(() => {
    if (!network || !hovered) return null;
    if (hovered.type === "guild") {
      const guild = network.guilds[hovered.index];
      return guild ? { title: guild.name, detail: `${guild.realm} · ${formatCount(guild.characterCount)} raiders` } : null;
    }
    const character = network.characters[hovered.index];
    return character ? { title: character.name, detail: `${character.realm} · ${formatCount(character.totalReports)} reports` } : null;
  }, [hovered, network]);

  const loading = metaLoading || (!!meta && !network && !workerError);
  const errorText = metaError instanceof Error ? metaError.message : workerError;

  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Network mode">
          {MODE_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={buttonClass(mode === option.value)} onClick={() => setMode(option.value)}>
              {option.label}
            </button>
          ))}
        </div>

        {network && mode === "tier" && (
          <select
            value={tierIndex}
            onChange={(event) => setTierIndex(Number(event.target.value))}
            className="min-h-10 rounded-md bg-gray-900/80 px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Raid"
          >
            {network.tiers.map((tier, index) => (
              <option key={tier.id} value={index}>
                {tier.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={minReports}
          onChange={(event) => setMinReports(Number(event.target.value))}
          className="min-h-10 rounded-md bg-gray-900/80 px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Minimum reports"
        >
          {MIN_REPORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}+ reports
            </option>
          ))}
        </select>

        <select
          value={classFilter ?? "all"}
          onChange={(event) => setClassFilter(event.target.value === "all" ? null : Number(event.target.value))}
          className="min-h-10 rounded-md bg-gray-900/80 px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Class"
        >
          <option value="all">All classes</option>
          {classes.map((classInfo) => (
            <option key={classInfo.id} value={classInfo.id}>
              {classInfo.name}
            </option>
          ))}
        </select>

        <button type="button" className={buttonClass(false)} onClick={resetView}>
          Reset view
        </button>

        {network && mode === "tier" && tierIndex !== latestTierIndex && (
          <button type="button" className={buttonClass(false)} onClick={() => setTierIndex(latestTierIndex)}>
            Latest raid
          </button>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill label="Characters" value={network ? formatCount(network.characters.length) : meta ? formatCount(meta.characterCount) : "-"} />
            <StatPill label="Guilds" value={network ? formatCount(network.guilds.length) : meta ? formatCount(meta.guildCount) : "-"} />
            <StatPill label="Reports" value={network ? formatCount(network.stats.totalReports) : meta ? formatCount(meta.rowCount) : "-"} />
            <StatPill label="Snapshot" value={meta ? `${formatBytes(meta.byteLength)} · ${formatDate(meta.generatedAt)}` : "-"} />
          </div>

          <div ref={wrapperRef} className="relative h-[calc(100vh-18rem)] min-h-[560px] overflow-hidden rounded-md bg-gray-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.35)]">
            <canvas
              ref={canvasRef}
              className="block h-full w-full cursor-crosshair touch-none"
              aria-label="Guild network analytics canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => {
                hoveredRef.current = null;
                setHovered(null);
                scheduleDraw();
              }}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
            />

            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-gray-950/82 backdrop-blur-sm">
                <div className="rounded-md bg-gray-900/90 px-4 py-3 text-sm font-semibold text-gray-100 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
                  {workerStatus}
                </div>
              </div>
            )}

            {errorText && (
              <div className="absolute inset-0 grid place-items-center bg-gray-950/88 px-4">
                <div className="max-w-md rounded-md bg-red-950/55 px-4 py-3 text-sm text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]">{errorText}</div>
              </div>
            )}

            {hovered && hoverLabel && (
              <div
                className="pointer-events-none absolute z-10 max-w-64 rounded-md bg-gray-950/92 px-3 py-2 text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_14px_34px_rgba(0,0,0,0.42)]"
                style={{ left: Math.min(size.width - 260, hovered.screenX + 12), top: Math.max(8, hovered.screenY + 12) }}
              >
                <div className="font-semibold text-white">{hoverLabel.title}</div>
                <div className="mt-0.5 text-xs text-gray-400">{hoverLabel.detail}</div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-md bg-gray-950/55 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
            <label htmlFor="network-search" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Search
            </label>
            <input
              id="network-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Character or guild"
              className="mt-2 min-h-10 w-full rounded-md bg-gray-900 px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.07)] placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {searchResults.map((result) => (
                  <button
                    key={`${result.type}:${result.index}`}
                    type="button"
                    onClick={() => selectEntity(result, true)}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-gray-900 active:scale-[0.96]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-100">{result.label}</span>
                      <span className="block truncate text-xs text-gray-500">{result.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-gray-500 tabular-nums">{formatCount(result.reports)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <EntityInspector network={network} selection={selected} />

          {network && (
            <div className="rounded-md bg-gray-950/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Movement</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatPill label="Multi-guild" value={formatCount(network.stats.multiGuildCharacters)} />
                <StatPill label="Multi-raid" value={formatCount(network.stats.multiTierCharacters)} />
              </div>
              <div className="mt-3 text-xs text-gray-500 text-pretty">Source updated {formatDate(network.sourceUpdatedAt)}.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
