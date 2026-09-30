import { memo, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import "./App.css";

const logoSrc = import.meta.env.DEV ? "/ras-logo.png" : "./ras-logo.png";
const heroBgSrc = import.meta.env.DEV ? "/App theme.jpg" : "./App theme.jpg";

declare global {
  interface Window {
    electronAPI: {
      selectVideo: () => Promise<{ path: string; name: string; url: string } | null>;
      cloudStorageStatus: () => Promise<{ configured: boolean; bucket: string; retentionDays: number }>;
      configureCloudStorage: (data: { accessKeyId: string; secretAccessKey: string }) => Promise<{ success: boolean; bucket?: string; message?: string }>;
      uploadVideoToCloud: (data: { videoPath: string; contentType?: string }) => Promise<{ success: boolean; key?: string; name?: string; size?: number; retentionDays?: number; message?: string }>;
      onCloudUploadProgress: (callback: (progress: { loaded: number; total: number; percent: number; done?: boolean }) => void) => () => void;
      optimiseVideoForPlayback: (data: { videoPath: string }) => Promise<{
        success: boolean;
        path?: string;
        url?: string;
        name?: string;
        message?: string;
      }>;
      generateTestClip: (data: { videoPath: string; start: number; duration: number }) => Promise<{
        success: boolean;
        outputPath?: string;
        message?: string;
      }>;
      generateCompilations: (data: {
        videoPath: string;
        groups: { type: string; clips: { rawStart: number; rawEnd: number; subtitle?: string }[] }[];
        variant: string;
      }) => Promise<{ success: boolean; outputs?: string[]; message?: string }>;
      buildTrainingDataset: (data: {
        videoPath: string;
        videoName: string;
        projectName: string;
        matchName: string;
        opposition: string;
        teamColour: string;
        direction: string;
        camera: string;
        events: EventLog[];
      }) => Promise<{ success: boolean; folder?: string; datasetId?: string; clips?: number; message?: string }>;
      listTrainingDatasets: () => Promise<{ success: boolean; datasets?: TrainingDataset[]; message?: string }>;
      updateTrainingExample: (data: { datasetId: string; exampleId: number; reviewStatus: string; correctedEvent?: string }) => Promise<{ success: boolean; message?: string }>;
      runAIScan: (data: { videoPath: string }) => Promise<{ success: boolean; detections?: Omit<AIReviewEvent, "id">[]; framesScanned?: number; experimental?: boolean; message?: string }>;
      retrainAIModel: () => Promise<{ success: boolean; validationAccuracy?: number; classes?: number; frames?: number; message?: string }>;
      exportCoachPackage: (data: { pdfBase64: string; html: string; videoPaths: string[]; suggestedName: string }) => Promise<{ success: boolean; folder?: string; message?: string }>;
      onUpdateProgress?: (callback: (progress: { percent: number; transferred?: number; total?: number }) => void) => () => void;
      onCompilationProgress?: (callback: (progress: { group?: string; clip?: number; groupClips?: number; completed: number; total: number; percent: number; done?: boolean }) => void) => () => void;
      onTrainingProgress?: (callback: (progress: { event?: string; completed: number; total: number; percent: number; done?: boolean }) => void) => () => void;
      onAIScanProgress?: (callback: (progress: { stage: string; completed?: number; total?: number; percent?: number }) => void) => () => void;
      checkForUpdates?: () => Promise<{ success: boolean; message?: string }>;
      getAppVersion?: () => Promise<string>;
      onUpdateStatus?: (callback: (status: { state: string; message: string; version?: string }) => void) => () => void;
    };
  }
}

type View = "home" | "analysis" | "compilations" | "opposition" | "plays" | "support" | "settings";
type NoticeType = "success" | "warning" | "error" | "info";
type Panel = "attack" | "defence";
type PanelSwitching = "automatic" | "manual";
type EventCategory = "attack" | "set-piece" | "kick" | "defence" | "maul" | "restart";
type GainlineResult = "Won" | "Neutral" | "Lost";
type RuckSpeed = "Quick" | "Average" | "Slow";
type KickType = "Exit" | "Contestable" | "Clearance";
type AttackAction = "phase" | "finish" | "kick";
type KeybindAction = "playPause" | "seekBack" | "seekForward" | "speedUp" | "speedDown" | "undoEvent" | "attackPanel" | "defencePanel" | "gainlineWon" | "gainlineNeutral" | "gainlineLost" | "ruckQuick" | "ruckAverage" | "ruckSlow" | "completePhase" | "undoPhase" | "finishAttack" | "kick" | "backToPhase" | "tackleMade" | "tackleMissed" | "ballWon" | "penaltyWon" | "penaltyConceded" | "oppositionHeldUp" | "tryConceded";
type Keybinds = Record<KeybindAction, string>;
type SettingsTab = "keybinds" | "appearance" | "profile" | "updates";
type AppearanceSettings = { accent: string; accent2: string; motion: "off" | "subtle" | "full"; density: "compact" | "comfortable"; backdrop: number; glass: number };
type AnalystProfile = { name: string; role: string; email: string; phone: string };
type OppositionMode = "attack" | "defence";
type OppositionPattern = "Front Nine" | "Out the Back" | "Edge Shape" | "Kick Threat" | "Custom";
type DefenceResponse = "Press" | "Drift" | "Hold" | "Fold";
type OppositionMoment = {
  id: number;
  title: string;
  seconds: number;
  time: string;
  mode: OppositionMode;
  pattern: OppositionPattern;
  response: DefenceResponse;
  observation: string;
  coachingPlan: string;
};

const defaultAppearance: AppearanceSettings = { accent: "#7ed957", accent2: "#5cb338", motion: "full", density: "comfortable", backdrop: 72, glass: 82 };
const defaultProfile: AnalystProfile = { name: "", role: "Performance Analyst", email: "", phone: "" };
const analystProfiles = [
  { id: "jd", name: "JD Gouws", role: "Owner & Performance Analyst", owner: true },
  { id: "gabrie", name: "Gabrie Gouws", role: "Performance Analyst", owner: false },
] as const;

const defaultKeybinds: Keybinds = {
  playPause: "Space", seekBack: "ArrowLeft", seekForward: "ArrowRight", speedUp: "ArrowUp", speedDown: "ArrowDown", undoEvent: "Ctrl+Z",
  attackPanel: "A", defencePanel: "D", gainlineWon: "1", gainlineNeutral: "2", gainlineLost: "3", ruckQuick: "4", ruckAverage: "5", ruckSlow: "6",
  completePhase: "Enter", undoPhase: "U", finishAttack: "F", kick: "K", backToPhase: "Escape", tackleMade: "1", tackleMissed: "2", ballWon: "3",
  penaltyWon: "4", penaltyConceded: "5", oppositionHeldUp: "6", tryConceded: "7",
};

function shortcutFromEvent(event: KeyboardEvent | React.KeyboardEvent) {
  const base = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const modifiers = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey && base.length > 1 ? "Shift" : ""].filter(Boolean);
  return [...modifiers, base].join("+");
}

type PhasePerformance = {
  gainline: GainlineResult;
  ruckSpeed: RuckSpeed;
  zone?: string;
  seconds?: number;
};

type Notice = {
  title: string;
  message: string;
  type: NoticeType;
};

type EventLog = {
  id: number;
  time: string;
  seconds: number;
  category: EventCategory;
  event: string;
  zone: string;
  attackType?: string;
  launchType?: "Scrum" | "Lineout" | "Maul";
  lineoutLaunch?: "Down and Out" | "Off the Top" | "Maul" | "Normal";
  phases?: number;
  outcome?: string;
  reason?: string;
  note?: string;
  phasePerformance?: PhasePerformance[];
  kickType?: KickType;
  endZone?: string;
  goldZoneEntry?: boolean;
  goldZoneOutcome?: string;
  attackStartSeconds?: number;
  positiveSequence?: boolean;
  coachingMoment?: boolean;
};

type ClipGroup = {
  type: string;
  clips: {
    id: number;
    label: string;
    originalTime: string;
    rawStart: number;
    rawEnd: number;
    subtitle?: string;
  }[];
};

type ClipPaddingPresetId = "quick" | "coach" | "deep";

type EditableEvent = {
  id: number;
  category: EventCategory;
  event: string;
  attackType: string;
  outcome: string;
  reason: string;
  zone: string;
  note: string;
  coachingMoment?: boolean;
};

type AIReviewEvent = EventLog & {
  confidence: number;
  explanation: string;
  reviewStatus: "pending" | "accepted" | "rejected";
};

type TrainingExample = {
  id: number;
  category: string;
  event: string;
  correctedEvent?: string;
  outcome?: string;
  reason?: string;
  zone?: string;
  timestamp: number;
  originalTime: string;
  clipStart: number;
  clipEnd: number;
  clipUrl: string;
  reviewStatus: "trusted" | "pending" | "approved" | "rejected" | "duplicate" | "unclear";
};

type TrainingDataset = {
  id: string;
  status: string;
  createdAt: string;
  team: string;
  opposition: string;
  videoName: string;
  examples: TrainingExample[];
};

type AIComparison = {
  correct: number;
  wrongLabel: number;
  falseDetections: number;
  missed: number;
  meanTimingError: number;
  totalGroundTruth: number;
};

const pitchZones = ["Opp 22", "Opp Half", "Midfield", "Own Half", "Own 22"];
const attackTypes = ["Transition", "Kick Return", "Penalty Tap"];
const successfulAttackOutcomes = ["Penalty Won", "Try Scored", "3 Points Taken", "Held Up – Retain Ball", "Contestable Kick Regained", "Successful Exit", "Positive Clearance"];
const goldZoneSuccessOutcomes = ["Try Scored", "3 Points Taken"];

function isSuccessfulAttackEvent(event: EventLog) {
  return successfulAttackOutcomes.includes(event.outcome || "")
    || ["Maul Retained", "Maul Penalty Won", "Maul Try"].includes(event.outcome || "");
}

const ballLostReasons = [
  "Handling Error",
  "Intercept",
  "Penalty Conceded",
  "Turnover",
  "Kick Lost",
  "Taken Into Touch",
  "Scrum Lost",
  "Lineout Lost",
  "Held Up",
  "Other",
];

const ballWonReasons = [
  "Jackal",
  "Ripped Ball",
  "Opp Kick",
  "Knock-on",
  "Interception",
  "Counter Ruck",
  "Kick Regather",
  "Lineout Steal",
  "Scrum Turnover",
  "Other",
];

const penaltyReasons = [
  "Holding On",
  "Not Rolling Away",
  "Side Entry",
  "Offside",
  "High Tackle",
  "Collapsing Maul",
  "Scrum Penalty",
  "Lineout Penalty",
  "Other",
];

const penaltyConcededReasons = [
  "Holding On",
  "Offside",
  "High Tackle",
  "Not Rolling Away",
  "Side Entry",
  "Hands in Ruck",
  "Collapsing Maul",
  "Scrum Penalty",
  "Lineout Penalty",
  "Other",
];

const clipTypeGroups = [
  { id: "attack", label: "Attack", types: ["Good Attacking Moment", "Bad Attacking Moment", "Quick Rucks", "Average Rucks", "Slow Rucks", "Good Attacking Sequences", "Gold Zone Entries", "Scrum Launch", "Lineout Launch", "Transition Attack", "Kick Return Attack", "Maul Launch", "Penalty Won", "Try Scored", "3 Points Taken", "Ball Lost", "Held Up – Retain Ball"] },
  { id: "set-piece", label: "Set Piece", types: ["Lineout Won", "Lineout Lost", "Scrum Won", "Scrum Lost", "Opponent Lineout Stolen", "Opponent Scrum Stolen"] },
  { id: "kicking", label: "Kicking", types: ["Contestable Kick Regained", "Contestable Kick Lost", "Successful Exit", "Failed Exit", "Positive Clearance", "Poor Clearance"] },
  { id: "defence", label: "Defence", types: ["Good Defensive Moment", "Bad Defensive Moment", "Tackle Made", "Tackle Missed", "Ball Won", "Try Conceded", "Penalty Conceded"] },
  { id: "maul", label: "Maul", types: ["Maul Retained", "Maul Penalty Won", "Maul Try", "Maul Sacked", "Maul Lost"] },
] as const;

const defaultReviewClipTypes = [
  "Good Attacking Moment",
  "Bad Attacking Moment",
  "Good Defensive Moment",
  "Bad Defensive Moment",
  "Good Attacking Sequences",
  "Ball Lost",
  "Try Conceded",
  "Gold Zone Entries",
  "Lineout Lost",
  "Scrum Lost",
  "Tackle Missed",
  "Penalty Conceded",
];

const clipPaddingPresets: {
  id: ClipPaddingPresetId;
  title: string;
  description: string;
  before: number;
  after: number;
}[] = [
  { id: "quick", title: "Quick Review", description: "Shortest clips for rapid event review.", before: 8, after: 3 },
  { id: "coach", title: "Coach Review", description: "Enough build-up for coaching context.", before: 15, after: 3 },
  { id: "deep", title: "Deep Analysis", description: "Longer build-up and follow-up.", before: 30, after: 10 },
];

const RUCK_CLIP_BEFORE_SECONDS = 5;
const RUCK_CLIP_AFTER_SECONDS = 1;
const TRY_CONCEDED_CLIP_BEFORE_SECONDS = 15;
const TRY_CONCEDED_CLIP_AFTER_SECONDS = 3;
const COACHING_MOMENT_CLIP_BEFORE_SECONDS = 10;
const COACHING_MOMENT_CLIP_AFTER_SECONDS = 5;

function ruckSpeedForClipType(type: string): RuckSpeed | null {
  if (type === "Quick Rucks") return "Quick";
  if (type === "Average Rucks") return "Average";
  if (type === "Slow Rucks") return "Slow";
  return null;
}

const attackOutcomeOptions = ["Penalty Won", "Penalty Conceded", "Try Scored", "3 Points Taken", "Ball Lost", "Held Up – Retain Ball"];
const defenceEventOptions = ["Tackle Made", "Tackle Missed", "Ball Won", "Opponent Lineout Stolen", "Opponent Scrum Stolen", "Penalty Won", "Penalty Conceded", "Try Conceded"];
const setPieceEventOptions = ["Lineout Won", "Lineout Lost", "Scrum Won", "Scrum Lost"];
const kickOutcomeOptions = ["Successful Exit", "Failed Exit", "Charged Down", "Contestable Kick Regained", "Contestable Kick Lost", "Penalty Won", "Into Touch", "Positive Clearance", "Neutral Clearance", "Poor Clearance", "Direct Into Touch"];
const kickOutcomesByType: Record<KickType, string[]> = {
  Exit: ["Successful Exit", "Failed Exit", "Charged Down"],
  Contestable: ["Contestable Kick Regained", "Contestable Kick Lost", "Penalty Won", "Into Touch"],
  Clearance: ["Positive Clearance", "Neutral Clearance", "Poor Clearance", "Direct Into Touch"],
};

const maulOutcomeOptions = ["Maul Retained", "Maul Penalty Won", "Maul Try", "Maul Sacked", "Maul Lost"];

function attackTypeFromEvent(event: EventLog) {
  return event.attackType || event.event.replace(" Attack", "") || "Transition";
}

function reasonOptionsForEdit(category: EventCategory, eventName: string, outcome: string) {
  if (category === "attack" && outcome === "Ball Lost") return ballLostReasons;
  if (category === "attack" && outcome === "Penalty Won") return penaltyReasons;
  if (category === "attack" && outcome === "Penalty Conceded") return penaltyConcededReasons;
  if (category === "defence" && eventName === "Ball Won") return ballWonReasons;
  if (category === "defence" && eventName === "Penalty Won") return penaltyReasons;
  if (category === "defence" && eventName === "Penalty Conceded") return penaltyConcededReasons;
  return [];
}

function firstReasonOrBlank(category: EventCategory, eventName: string, outcome: string, currentReason: string) {
  const options = reasonOptionsForEdit(category, eventName, outcome);
  if (!options.length) return "";
  return options.includes(currentReason) ? currentReason : options[0];
}


function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseTimeToSeconds(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function percent(part: number, total: number) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

function average(values: number[]) {
  if (!values.length) return "0.0";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function zoneProgression(event: EventLog) {
  const zones = [event.zone, ...(event.phasePerformance || []).map((phase) => phase.zone || ""), event.endZone || ""].filter(Boolean);
  return zones.filter((zone, index) => index === 0 || zone !== zones[index - 1]).join(" → ") || event.zone;
}

function safeFileName(value: string) {
  return String(value || "rugby-analysis")
    .trim()
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
    .replace(/^([A-Za-z])%3A/, "$1:");
  return `file:///${encoded}`;
}

function clipLabel(event: EventLog) {
  const reason = event.reason ? ` • ${event.reason}` : "";
  if (event.coachingMoment) return `${event.event} • ${event.zone}`;
  if (event.kickType) return `${event.kickType} Kick • ${event.zone}${event.endZone ? ` to ${event.endZone}` : ""} • ${event.outcome}${reason}`;
  if (event.category === "attack") return `${event.positiveSequence ? "Good Attacking Sequence • " : ""}${event.attackType} Attack${event.lineoutLaunch ? ` • ${event.lineoutLaunch} lineout` : ""} • ${event.zone} • ${event.outcome}${reason}`;
  if (event.category === "kick") return `Kick Event • ${event.zone} • ${event.outcome}${reason}`;
  if (event.category === "defence") return `${event.event} • ${event.zone}${reason}`;
  if (event.category === "maul") return `${event.event} • ${event.zone}${reason}`;
  return `${event.event} • ${event.zone}${reason}`;
}

function matchesClipType(event: EventLog, type: string) {
  if (type === "Good Attacking Sequences") return event.category === "attack" && event.positiveSequence === true;
  if (type === "Gold Zone Entries") return event.category === "attack" && (event.goldZoneEntry === true || (event.goldZoneEntry === undefined && event.zone === "Opp 22"));
  if (type === "Scrum Launch") return event.launchType === "Scrum";
  if (type === "Lineout Launch") return event.launchType === "Lineout" || Boolean(event.lineoutLaunch);
  if (type === "Maul Launch") return event.launchType === "Maul" || event.lineoutLaunch === "Maul";
  if (type.endsWith("Attack")) return event.category === "attack" && event.attackType === type.replace(" Attack", "");
  if (["Penalty Won", "Try Scored", "3 Points Taken", "Ball Lost", "Held Up – Retain Ball"].includes(type)) {
    return event.outcome === type;
  }
  if (kickOutcomeOptions.includes(type)) return (event.category === "kick" || Boolean(event.kickType)) && event.outcome === type;
  if (type === "Opponent Lineout Stolen" || type === "Opponent Scrum Stolen") return event.event === type || event.outcome === type;
  return event.event === type || event.outcome === type;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function totalGroupDuration(group: { clips: { rawStart: number; rawEnd: number }[] }) {
  return group.clips.reduce((total, clip) => total + Math.max(0, clip.rawEnd - clip.rawStart), 0);
}

function eventTone(event: EventLog) {
  const outcome = event.outcome || event.event;
  if (["Good Attacking Moment", "Good Defensive Moment"].includes(outcome)) return "positive";
  if (["Bad Attacking Moment", "Bad Defensive Moment"].includes(outcome)) return "negative";
  if (["Penalty Won", "Try Scored", "3 Points Taken", "Contestable Kick Regained", "Successful Exit", "Positive Clearance", "Lineout Won", "Scrum Won", "Ball Won", "Opponent Lineout Stolen", "Opponent Scrum Stolen", "Opposition Held Up", "Tackle Made", "Maul Try", "Maul Penalty Won", "Maul Retained", "Held Up – Retain Ball", "Possession Gained"].includes(outcome)) return "positive";
  if (["Ball Lost", "Contestable Kick Lost", "Failed Exit", "Charged Down", "Poor Clearance", "Direct Into Touch", "Lineout Lost", "Scrum Lost", "Penalty Conceded", "Tackle Missed", "Try Conceded", "Maul Lost", "Maul Sacked", "Possession Lost"].includes(outcome)) return "negative";
  return "neutral";
}

type RgbColour = [number, number, number];

function mixColour(colour: RgbColour, target: RgbColour, targetWeight: number): RgbColour {
  return colour.map((channel, index) => Math.round(channel * (1 - targetWeight) + target[index] * targetWeight)) as RgbColour;
}

function colourDistance(first: RgbColour, second: RgbColour) {
  return Math.sqrt(first.reduce((total, channel, index) => total + Math.pow(channel - second[index], 2), 0));
}

async function paletteFromLogo(dataUrl: string): Promise<{ accent: RgbColour; secondary: RgbColour; dark: RgbColour; panel: RgbColour; scoreText: RgbColour }> {
  const fallback: RgbColour = [126, 217, 87];
  if (!dataUrl) return { accent: fallback, secondary: [196, 205, 201], dark: [18, 32, 23], panel: [29, 49, 34], scoreText: [0, 0, 0] };
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 72;
    canvas.height = 72;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.clearRect(0, 0, 72, 72);
    context.drawImage(image, 0, 0, 72, 72);
    const pixels = context.getImageData(0, 0, 72, 72).data;
    const buckets = new Map<string, { colour: RgbColour; count: number; saturation: number; lightness: number }>();
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] < 100) continue;
      const colour: RgbColour = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const max = Math.max(...colour);
      const min = Math.min(...colour);
      const lightness = (max + min) / 2;
      if (lightness < 18 || lightness > 244) continue;
      const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 255));
      const quantised = colour.map((channel) => Math.min(255, Math.round(channel / 32) * 32)) as RgbColour;
      const key = quantised.join("-");
      const existing = buckets.get(key);
      if (existing) existing.count += 1;
      else buckets.set(key, { colour: quantised, count: 1, saturation, lightness });
    }
    const ranked = [...buckets.values()].sort((first, second) => {
      const firstScore = first.count * (.35 + first.saturation * 2.2) * (.7 + Math.min(first.lightness, 255 - first.lightness) / 128);
      const secondScore = second.count * (.35 + second.saturation * 2.2) * (.7 + Math.min(second.lightness, 255 - second.lightness) / 128);
      return secondScore - firstScore;
    });
    let accent = ranked[0]?.colour || fallback;
    const accentBrightness = accent[0] * .299 + accent[1] * .587 + accent[2] * .114;
    if (accentBrightness < 72) accent = mixColour(accent, [255, 255, 255], .34);
    const secondary = ranked.find((candidate) => colourDistance(candidate.colour, accent) > 105)?.colour || mixColour(accent, [255, 255, 255], .5);
    const dark = mixColour(accent, [0, 0, 0], .76);
    const panel = mixColour(accent, [0, 0, 0], .66);
    const scoreBrightness = accent[0] * .299 + accent[1] * .587 + accent[2] * .114;
    return { accent, secondary, dark, panel, scoreText: scoreBrightness > 145 ? [0, 0, 0] : [255, 255, 255] };
  } catch (_) {
    return { accent: fallback, secondary: [196, 205, 201], dark: [18, 32, 23], panel: [29, 49, 34], scoreText: [0, 0, 0] };
  }
}

const VideoPlayer = memo(function VideoPlayer({
  videoRef,
  rawVideoPath,
  playbackVideoUrl,
  rawVideoUrl,
  rawVideoName,
  isOptimisingVideo,
  playbackRate,
  onLoadVideo,
  onError,
  onSeek,
  onSpeedChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  rawVideoPath: string;
  playbackVideoUrl: string;
  rawVideoUrl: string;
  rawVideoName: string;
  isOptimisingVideo: boolean;
  playbackRate: number;
  onLoadVideo: () => void;
  onError: () => void;
  onSeek: (amount: number) => void;
  onSpeedChange: (rate: number) => void;
}) {
  const stableSource = playbackVideoUrl || rawVideoUrl || (rawVideoPath ? toFileUrl(rawVideoPath) : "");
  const [playerSrc, setPlayerSrc] = useState(stableSource);
  const lastSourceRef = useRef(stableSource);
  const lastKnownTimeRef = useRef(0);

  useEffect(() => {
    if (stableSource && stableSource !== lastSourceRef.current) {
      lastSourceRef.current = stableSource;
      lastKnownTimeRef.current = 0;
      setPlayerSrc(stableSource);
    }
  }, [stableSource]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  function rememberTime() {
    if (videoRef.current) lastKnownTimeRef.current = videoRef.current.currentTime || 0;
  }

  function restoreTime() {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = playbackRate;
    if (lastKnownTimeRef.current > 0.25) {
      videoRef.current.currentTime = lastKnownTimeRef.current;
    }
  }

  return (
    <div className="video-panel panel sticky-panel pro-video-panel">
      <div className="panel-head video-head">
        <div>
          <p className="eyebrow">Match Footage</p>
          <h2>{rawVideoName || "No Video Loaded"}</h2>
        </div>
        <span className="status available">{rawVideoName ? "Ready" : "Required"}</span>
      </div>

      {rawVideoPath ? (
        <>
          <div className="video-frame">
            <video
              ref={videoRef}
              className="match-video"
              src={playerSrc}
              controls
              onError={onError}
              onTimeUpdate={rememberTime}
              onPause={rememberTime}
              onSeeking={rememberTime}
              onLoadedMetadata={restoreTime}
              onLoadedData={restoreTime}
            />
            <div className="video-control-dock">
              <button type="button" onClick={() => onSeek(-10)}>−10s</button>
              <label>
                <span>Speed</span>
                <select value={String(playbackRate)} onChange={(event) => onSpeedChange(Number(event.target.value))}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
                </select>
              </label>
              <button type="button" onClick={() => onSeek(10)}>+10s</button>
            </div>
          </div>
          {isOptimisingVideo && (
            <div className="video-processing">
              Optimising footage for playback...
              <small>This can take a while for large MOV files. Your original file is not changed.</small>
            </div>
          )}
        </>
      ) : (
        <button className="video-empty" onClick={onLoadVideo}>
          <span>🎥</span>
          <strong>Choose Raw Match Footage</strong>
          <small>MOV, MP4, M4V, AVI or MKV</small>
        </button>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.rawVideoPath === next.rawVideoPath &&
    prev.playbackVideoUrl === next.playbackVideoUrl &&
    prev.rawVideoUrl === next.rawVideoUrl &&
    prev.rawVideoName === next.rawVideoName &&
    prev.isOptimisingVideo === next.isOptimisingVideo &&
    prev.playbackRate === next.playbackRate
  );
});

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const [view, setView] = useState<View>("home");
  const [activeAnalystId, setActiveAnalystId] = useState<"jd" | "gabrie">("jd");
  const [profileSelected, setProfileSelected] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeClosing, setNoticeClosing] = useState(false);

  const [matchName, setMatchName] = useState("");
  const [opposition, setOpposition] = useState("");
  const [competition, setCompetition] = useState("");
  const [teamScore, setTeamScore] = useState("");
  const [oppositionScore, setOppositionScore] = useState("");
  const [teamLogoDataUrl, setTeamLogoDataUrl] = useState("");
  const [events, setEvents] = useState<EventLog[]>([]);
  const [selectedZone, setSelectedZone] = useState("Midfield");

  const [activePanel, setActivePanel] = useState<Panel>("attack");
  const [panelSwitching, setPanelSwitching] = useState<PanelSwitching>("automatic");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [keybinds, setKeybinds] = useState<Keybinds>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ras-keybinds-jd") || "{}");
      return { ...defaultKeybinds, ...saved };
    } catch (_) {
      return defaultKeybinds;
    }
  });
  const [listeningKeybind, setListeningKeybind] = useState<KeybindAction | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("keybinds");
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => { try { return { ...defaultAppearance, ...JSON.parse(localStorage.getItem("ras-appearance-jd") || "{}") }; } catch (_) { return defaultAppearance; } });
  const [analystProfile, setAnalystProfile] = useState<AnalystProfile>(() => { try { return { ...defaultProfile, name: "JD Gouws", role: "Owner & Performance Analyst", ...JSON.parse(localStorage.getItem("ras-analyst-profile-jd") || "{}") }; } catch (_) { return { ...defaultProfile, name: "JD Gouws", role: "Owner & Performance Analyst" }; } });
  const [lastSessionSaved, setLastSessionSaved] = useState("");
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [clipStage, setClipStage] = useState(0);
  const [compilationProgress, setCompilationProgress] = useState<{ group?: string; clip?: number; groupClips?: number; completed: number; total: number; percent: number } | null>(null);

  const [attackActive, setAttackActive] = useState(false);
  const [attackStartZone, setAttackStartZone] = useState("");
  const [attackStartSeconds, setAttackStartSeconds] = useState(0);
  const [positiveAttackSequence, setPositiveAttackSequence] = useState(false);
  const [currentAttackType, setCurrentAttackType] = useState("");
  const [currentLaunchType, setCurrentLaunchType] = useState<"Scrum" | "Lineout" | null>(null);
  const [currentLineoutLaunch, setCurrentLineoutLaunch] = useState<"Down and Out" | "Off the Top" | null>(null);
  const [lineoutLaunchPrompt, setLineoutLaunchPrompt] = useState(false);
  const [maulFromLineout, setMaulFromLineout] = useState(false);
  const [phaseCount, setPhaseCount] = useState(0);
  const [phasePerformance, setPhasePerformance] = useState<PhasePerformance[]>([]);
  const [pendingGainline, setPendingGainline] = useState<GainlineResult | null>(null);
  const [pendingRuckSpeed, setPendingRuckSpeed] = useState<RuckSpeed | null>(null);
  const [phaseZoneConfirmed, setPhaseZoneConfirmed] = useState(false);
  const [activeKickType, setActiveKickType] = useState<KickType | null>(null);
  const [activeRestart, setActiveRestart] = useState<string | null>(null);
  const [possessionInGoldZone, setPossessionInGoldZone] = useState(false);
  const [activeGoldZoneEntry, setActiveGoldZoneEntry] = useState(false);
  const [attackAction, setAttackAction] = useState<AttackAction>("phase");
  const [maulActive, setMaulActive] = useState(false);
  const [maulStartZone, setMaulStartZone] = useState("");
  const [maulStartSeconds, setMaulStartSeconds] = useState(0);
  const [maulPhaseCount, setMaulPhaseCount] = useState(0);
  const [ballLostReason, setBallLostReason] = useState("Handling Error");
  const [ballWonReason, setBallWonReason] = useState("Jackal");
  const [penaltyWonReason, setPenaltyWonReason] = useState("Holding On");
  const [penaltyConcededReason, setPenaltyConcededReason] = useState("Offside");
  const [coachingMomentNote, setCoachingMomentNote] = useState("");
  const [oppositionMoments, setOppositionMoments] = useState<OppositionMoment[]>(() => { try { return JSON.parse(localStorage.getItem("ras-opposition-moments") || "[]"); } catch (_) { return []; } });
  const [oppositionMode, setOppositionMode] = useState<OppositionMode>("attack");
  const [oppositionPattern, setOppositionPattern] = useState<OppositionPattern>("Front Nine");
  const [oppositionResponse, setOppositionResponse] = useState<DefenceResponse>("Press");
  const [oppositionTitle, setOppositionTitle] = useState("");
  const [oppositionObservation, setOppositionObservation] = useState("");
  const [oppositionCoachingPlan, setOppositionCoachingPlan] = useState("");
  const [selectedOppositionMomentId, setSelectedOppositionMomentId] = useState<number | null>(null);
  const [tacticalBoardPlaying, setTacticalBoardPlaying] = useState(false);

  const [rawVideoName, setRawVideoName] = useState("");
  const [rawVideoPath, setRawVideoPath] = useState("");
  const [rawVideoUrl, setRawVideoUrl] = useState("");
  const [playbackVideoUrl, setPlaybackVideoUrl] = useState("");
  const [isOptimisingVideo, setIsOptimisingVideo] = useState(false);
  const [optimiseAttempted, setOptimiseAttempted] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [isCloudUploading, setIsCloudUploading] = useState(false);
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [cloudAccessKey, setCloudAccessKey] = useState("");
  const [cloudSecretKey, setCloudSecretKey] = useState("");
  const [cloudObjectKey, setCloudObjectKey] = useState("");

  const [selectedClipTypes, setSelectedClipTypes] = useState<string[]>(defaultReviewClipTypes);
  const [clipPaddingPresetId, setClipPaddingPresetId] = useState<ClipPaddingPresetId>("coach");
  const [generatedClips, setGeneratedClips] = useState<ClipGroup[]>([]);
  const [compilationOutputs, setCompilationOutputs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCompilation, setIsGeneratingCompilation] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [editingEvent, setEditingEvent] = useState<EditableEvent | null>(null);
  const [showExportCheck, setShowExportCheck] = useState(false);
  const [pendingCoachPackage, setPendingCoachPackage] = useState(false);
  const [showMatchCheck, setShowMatchCheck] = useState(false);
  const [showShortcutGuide, setShowShortcutGuide] = useState(false);
  const [recoveryCandidate, setRecoveryCandidate] = useState<any>(null);
  const [appVersion, setAppVersion] = useState("1.4.0");
  const [updateStatus, setUpdateStatus] = useState({ state: "idle", message: "Ready to check for updates." });
  const [aiReviewEvents, setAiReviewEvents] = useState<AIReviewEvent[]>([]);
  const [aiScanStatus, setAiScanStatus] = useState<"ready" | "scanning" | "review">("ready");
  const [aiScanProgress, setAiScanProgress] = useState(0);
  const [aiScanStage, setAiScanStage] = useState("Ready for footage");
  const [aiTeamColour, setAiTeamColour] = useState("");
  const [aiOppositionColour, setAiOppositionColour] = useState("");
  const [aiDirection, setAiDirection] = useState("unknown");
  const [aiCamera, setAiCamera] = useState("single-wide");
  const [aiComparison, setAiComparison] = useState<AIComparison | null>(null);
  const [aiGroundTruth, setAiGroundTruth] = useState<{ name: string; events: EventLog[] } | null>(null);
  const [isLearningGroundTruth, setIsLearningGroundTruth] = useState(false);
  const aiGroundTruthInputRef = useRef<HTMLInputElement | null>(null);
  const [aiTab, setAiTab] = useState<"analyse" | "training">("analyse");
  const [trainingVideo, setTrainingVideo] = useState<{ path: string; name: string; url: string; duration: number } | null>(null);
  const [trainingProject, setTrainingProject] = useState<{ name: string; events: EventLog[]; matchName: string; opposition: string } | null>(null);
  const [trainingTeamColour, setTrainingTeamColour] = useState("");
  const [trainingDirection, setTrainingDirection] = useState("unknown");
  const [trainingCamera, setTrainingCamera] = useState("single-wide");
  const [trainingPermission, setTrainingPermission] = useState(false);
  const [isBuildingTrainingDataset, setIsBuildingTrainingDataset] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<{ event?: string; completed: number; total: number; percent: number } | null>(null);
  const [trainingDatasets, setTrainingDatasets] = useState<TrainingDataset[]>([]);
  const [selectedTrainingDatasetId, setSelectedTrainingDatasetId] = useState("");
  const [trainingLibraryMode, setTrainingLibraryMode] = useState<"import" | "review">("import");
  const [trainingReviewFilter, setTrainingReviewFilter] = useState("all");
  const [trainingEventFilter, setTrainingEventFilter] = useState("all");
  const [trainingCategoryFilter, setTrainingCategoryFilter] = useState("all");
  const [activeTrainingExampleId, setActiveTrainingExampleId] = useState<number | null>(null);
  const [isLoadingTrainingDatasets, setIsLoadingTrainingDatasets] = useState(false);
  const trainingProjectInputRef = useRef<HTMLInputElement | null>(null);

  const attacks = events.filter((event) => event.category === "attack" && !event.coachingMoment);
  const defenceEvents = events.filter((event) => event.category === "defence" && !event.coachingMoment);
  const totalAttacks = attacks.length;
  const successfulAttacks = attacks.filter((event) => successfulAttackOutcomes.includes(event.outcome || "")).length;
  const ballLosses = attacks.filter((event) => event.outcome === "Ball Lost").length;
  const lineoutLaunchEvents = events.filter((event) => event.launchType === "Lineout" || event.lineoutLaunch === "Maul");
  const downAndOutLineoutLaunches = lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Down and Out" || event.lineoutLaunch === "Normal").length;
  const offTopLineoutLaunches = lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Off the Top").length;
  const lineoutMaulLaunches = lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Maul").length;
  const lineoutsWon = events.filter((event) => event.event === "Lineout Won").length;
  const lineoutsLost = events.filter((event) => event.event === "Lineout Lost").length;
  const scrumsWon = events.filter((event) => event.event === "Scrum Won").length;
  const scrumsLost = events.filter((event) => event.event === "Scrum Lost").length;
  const totalLineouts = lineoutsWon + lineoutsLost;
  const totalScrums = scrumsWon + scrumsLost;
  const kickEvents = events.filter((event) => event.category === "kick" || Boolean(event.kickType));
  const contestableKicks = kickEvents.filter((event) => event.kickType === "Contestable" || event.outcome === "Kick Regained" || event.outcome === "Kick Lost");
  const kickRegained = contestableKicks.filter((event) => event.outcome === "Contestable Kick Regained" || event.outcome === "Kick Regained").length;
  const exitKicks = kickEvents.filter((event) => event.kickType === "Exit" || event.outcome === "Good Exit" || event.outcome === "Bad Exit");
  const goodExits = exitKicks.filter((event) => event.outcome === "Successful Exit" || event.outcome === "Good Exit").length;
  const goldZoneEntries = attacks.filter((event) => event.goldZoneEntry === true || (event.goldZoneEntry === undefined && event.zone === "Opp 22"));
  const successfulGoldZoneEntries = goldZoneEntries.filter((event) => goldZoneSuccessOutcomes.includes(event.goldZoneOutcome || event.outcome || ""));
  const goldZonePoints = goldZoneEntries.reduce((total, event) => {
    const outcome = event.goldZoneOutcome || event.outcome;
    if (outcome === "3 Points Taken" || outcome === "3 Points") return total + 3;
    if (outcome === "Try Scored" || outcome === "5 Points" || outcome === "7 Points") return total + 5;
    return total;
  }, 0);
  const tackleMade = defenceEvents.filter((event) => event.event === "Tackle Made").length;
  const tackleMissed = defenceEvents.filter((event) => event.event === "Tackle Missed").length;
  const ballWon = defenceEvents.filter((event) => event.event === "Ball Won" || event.event === "Opponent Lineout Stolen" || event.event === "Opponent Scrum Stolen").length;
  const rippedBalls = defenceEvents.filter((event) => event.reason === "Ripped Ball").length;
  const oppKicks = defenceEvents.filter((event) => event.reason === "Opp Kick").length;
  const opponentLineoutsStolen = defenceEvents.filter((event) => event.event === "Opponent Lineout Stolen" || event.outcome === "Opponent Lineout Stolen").length;
  const opponentScrumsStolen = defenceEvents.filter((event) => event.event === "Opponent Scrum Stolen" || event.outcome === "Opponent Scrum Stolen").length;
  const triesConceded = defenceEvents.filter((event) => event.event === "Try Conceded" || event.outcome === "Try Conceded").length;
  const triesScored = attacks.filter((event) => event.outcome === "Try Scored").length + events.filter((event) => event.category === "maul" && event.outcome === "Maul Try").length;
  const threePointScores = attacks.filter((event) => event.outcome === "3 Points Taken").length;
  const allAttackPhases = attacks.flatMap((event) => event.phasePerformance || []);
  const gainlineWon = allAttackPhases.filter((phase) => phase.gainline === "Won").length;
  const gainlineSuccess = Number(percent(gainlineWon, allAttackPhases.length));
  const quickRucks = allAttackPhases.filter((phase) => phase.ruckSpeed === "Quick").length;
  const quickBallRate = Number(percent(quickRucks, allAttackPhases.length));

  const totalPreviewClips = generatedClips.reduce((total, group) => total + group.clips.length, 0);
  const totalPreviewDuration = generatedClips.reduce((total, group) => total + totalGroupDuration(group), 0);

  const matchTitle = useMemo(() => {
    if (matchName && opposition) return `${matchName} vs ${opposition}`;
    if (matchName) return matchName;
    return "No Match Loaded";
  }, [matchName, opposition]);

  const matchInsights = useMemo(() => {
    const ordered = [...events].sort((a, b) => a.seconds - b.seconds);
    const modeFor = (event: EventLog): Panel => {
      if (event.category === "defence") return "defence";
      if (["Lineout Lost", "Scrum Lost", "Opposition Lineout Won", "Opposition Scrum Won"].includes(event.event)) return "defence";
      if (event.category === "restart" && event.outcome === "Possession Lost") return "defence";
      return "attack";
    };
    const segments: { mode: Panel; start: number; end: number; zone: string; label: string }[] = [];
    ordered.forEach((event, index) => {
      const next = ordered[index + 1];
      const end = next ? next.seconds : event.seconds;
      const mode = modeFor(event);
      const previous = segments[segments.length - 1];
      if (previous && previous.mode === mode && previous.zone === event.zone && Math.abs(previous.end - event.seconds) < 1) previous.end = end;
      else segments.push({ mode, start: event.seconds, end, zone: event.zone, label: clipLabel(event) });
    });
    const attackSeconds = segments.filter((segment) => segment.mode === "attack").reduce((total, segment) => total + Math.max(0, segment.end - segment.start), 0);
    const defenceSeconds = segments.filter((segment) => segment.mode === "defence").reduce((total, segment) => total + Math.max(0, segment.end - segment.start), 0);
    const heat = pitchZones.map((zone) => ({ zone, count: events.filter((event) => event.zone === zone || event.endZone === zone).length }));
    let momentum = 0;
    const points = ordered.map((event) => {
      const tone = eventTone(event);
      momentum += tone === "positive" ? 1 : tone === "negative" ? -1 : 0;
      return { seconds: event.seconds, value: momentum, label: clipLabel(event) };
    });
    return { ordered, segments, attackSeconds, defenceSeconds, heat, points };
  }, [events]);

  const completionChecks = [
    { label: "Team and opposition entered", passed: Boolean(matchName && opposition) },
    { label: "Final score entered", passed: teamScore !== "" && oppositionScore !== "" },
    { label: "Competition entered", passed: Boolean(competition) },
    { label: "Team logo added for the report", passed: Boolean(teamLogoDataUrl) },
    { label: "Match footage linked", passed: Boolean(rawVideoPath) },
    { label: "Events logged", passed: events.length > 0 },
    { label: "Every attack has completed phase data", passed: !attacks.some((event) => !event.phases) },
    { label: "Compilation videos generated", passed: compilationOutputs.length > 0 },
  ];

  const selectedClipPadding = useMemo(() => {
    return clipPaddingPresets.find((preset) => preset.id === clipPaddingPresetId) || clipPaddingPresets[1];
  }, [clipPaddingPresetId]);

  useEffect(() => {
    localStorage.setItem(`ras-keybinds-${activeAnalystId}`, JSON.stringify(keybinds));
  }, [keybinds, activeAnalystId]);

  useEffect(() => {
    localStorage.setItem(`ras-appearance-${activeAnalystId}`, JSON.stringify(appearance));
    document.documentElement.style.setProperty("--green", appearance.accent);
    document.documentElement.style.setProperty("--green2", appearance.accent2);
    document.documentElement.style.setProperty("--hero-opacity", String(appearance.backdrop / 100));
    document.documentElement.style.setProperty("--glass-opacity", String(appearance.glass / 100));
    document.documentElement.dataset.motion = appearance.motion;
    document.documentElement.dataset.density = appearance.density;
  }, [appearance, activeAnalystId]);

  useEffect(() => { localStorage.setItem(`ras-analyst-profile-${activeAnalystId}`, JSON.stringify(analystProfile)); }, [analystProfile, activeAnalystId]);
  useEffect(() => { localStorage.setItem("ras-opposition-moments", JSON.stringify(oppositionMoments)); }, [oppositionMoments]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ras-last-session-jd") || "null");
      if (saved) {
        setMatchName(saved.matchName || ""); setOpposition(saved.opposition || ""); setCompetition(saved.competition || ""); setTeamScore(saved.teamScore ?? ""); setOppositionScore(saved.oppositionScore ?? ""); setTeamLogoDataUrl(saved.teamLogoDataUrl || ""); setEvents(Array.isArray(saved.events) ? saved.events : []);
        setRawVideoName(saved.rawVideoName || ""); setRawVideoPath(saved.rawVideoPath || ""); setRawVideoUrl(saved.rawVideoUrl || ""); setPlaybackVideoUrl(saved.playbackVideoUrl || saved.rawVideoUrl || ""); setLastSessionSaved(saved.savedAt || "");
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!matchName && !opposition && !events.length && !rawVideoName) return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      localStorage.setItem(`ras-last-session-${activeAnalystId}`, JSON.stringify({ matchName, opposition, competition, teamScore, oppositionScore, teamLogoDataUrl, events, rawVideoName, rawVideoPath, rawVideoUrl, playbackVideoUrl, savedAt }));
      setLastSessionSaved(savedAt);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [matchName, opposition, competition, teamScore, oppositionScore, teamLogoDataUrl, events, rawVideoName, rawVideoPath, rawVideoUrl, playbackVideoUrl, activeAnalystId]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateProgress) return;
    return window.electronAPI.onUpdateProgress((progress) => setUpdateProgress(Math.round(progress.percent || 0)));
  }, []);

  useEffect(() => {
    window.electronAPI?.cloudStorageStatus?.().then((status) => setCloudConfigured(status.configured)).catch(() => {});
    return window.electronAPI?.onCloudUploadProgress?.((progress) => setCloudUploadProgress(Math.round(progress.percent || 0)));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onCompilationProgress) return;
    return window.electronAPI.onCompilationProgress((progress) => setCompilationProgress(progress.done ? null : progress));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onTrainingProgress) return;
    return window.electronAPI.onTrainingProgress((progress) => setTrainingProgress(progress.done ? null : progress));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onAIScanProgress) return;
    return window.electronAPI.onAIScanProgress((progress) => {
      setAiScanStage(progress.stage || "Analysing match");
      setAiScanProgress(Math.round(progress.percent || 0));
    });
  }, []);

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(setAppVersion).catch(() => {});
    if (!window.electronAPI?.onUpdateStatus) return;
    return window.electronAPI.onUpdateStatus(setUpdateStatus);
  }, []);

  useEffect(() => {
    if (!isGeneratingCompilation) { setClipStage(0); return; }
    const timer = window.setInterval(() => setClipStage((stage) => Math.min(3, stage + 1)), 2400);
    return () => window.clearInterval(timer);
  }, [isGeneratingCompilation]);

  useEffect(() => {
    if (!notice) return;
    setNoticeClosing(false);
    const closingTimer = window.setTimeout(() => setNoticeClosing(true), 4700);
    const removeTimer = window.setTimeout(() => setNotice(null), 5100);
    return () => { window.clearTimeout(closingTimer); window.clearTimeout(removeTimer); };
  }, [notice]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || editingEvent) return;
      const shortcut = shortcutFromEvent(event);
      if (event.key === "?") { event.preventDefault(); setShowShortcutGuide((visible) => !visible); return; }

      if (shortcut === keybinds.playPause) {
        if (!videoRef.current) return;
        event.preventDefault();
        if (videoRef.current.paused) {
          void videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }

      if (shortcut === keybinds.seekBack) {
        if (!videoRef.current) return;
        event.preventDefault();
        seekVideo(-10);
      }

      if (shortcut === keybinds.seekForward) {
        if (!videoRef.current) return;
        event.preventDefault();
        seekVideo(10);
      }

      if (shortcut === keybinds.speedUp || shortcut === keybinds.speedDown) {
        if (!videoRef.current) return;
        event.preventDefault();
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const currentIndex = Math.max(0, speeds.indexOf(playbackRate));
        const nextIndex = shortcut === keybinds.speedUp ? Math.min(speeds.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
        changePlaybackRate(speeds[nextIndex]);
      }

      if (shortcut === keybinds.undoEvent) {
        event.preventDefault();
        if (events.length) undoLastEvent();
        return;
      }

      if (attackActive) {
        if (shortcut === keybinds.gainlineWon) setPendingGainline("Won");
        if (shortcut === keybinds.gainlineNeutral) setPendingGainline("Neutral");
        if (shortcut === keybinds.gainlineLost) setPendingGainline("Lost");
        if (shortcut === keybinds.ruckQuick) tagRuckSpeed("Quick");
        if (shortcut === keybinds.ruckAverage) tagRuckSpeed("Average");
        if (shortcut === keybinds.ruckSlow) tagRuckSpeed("Slow");
        if (shortcut === keybinds.completePhase && attackAction === "phase" && pendingGainline && pendingRuckSpeed) completePhase();
        if (shortcut === keybinds.undoPhase && phaseCount > 0) undoLastPhase();
        if (shortcut === keybinds.finishAttack) setAttackAction("finish");
        if (shortcut === keybinds.kick) setAttackAction("kick");
        if (shortcut === keybinds.backToPhase) { setActiveKickType(null); setAttackAction("phase"); }
        return;
      }

      if (shortcut === keybinds.attackPanel) switchPanel("attack");
      if (shortcut === keybinds.defencePanel) switchPanel("defence");

      if (activePanel === "defence") {
        if (shortcut === keybinds.tackleMade) addDefenceEvent("Tackle Made");
        if (shortcut === keybinds.tackleMissed) addDefenceEvent("Tackle Missed");
        if (shortcut === keybinds.ballWon) addDefenceEvent("Ball Won", ballWonReason);
        if (shortcut === keybinds.penaltyWon) addDefenceEvent("Penalty Won", penaltyWonReason);
        if (shortcut === keybinds.penaltyConceded) addDefenceEvent("Penalty Conceded", penaltyConcededReason);
        if (shortcut === keybinds.oppositionHeldUp) addDefenceEvent("Opposition Held Up");
        if (shortcut === keybinds.tryConceded) addDefenceEvent("Try Conceded");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingEvent, keybinds, playbackRate, events.length, attackActive, attackAction, pendingGainline, pendingRuckSpeed, phaseCount, activePanel, ballWonReason, penaltyWonReason, penaltyConcededReason]);

  function notify(title: string, message: string, type: NoticeType = "info") {
    setNoticeClosing(false);
    setNotice({ title, message, type });
  }

  function chooseAnalyst(id: "jd" | "gabrie") {
    const base = analystProfiles.find((profile) => profile.id === id)!;
    const read = <T,>(key: string, fallback: T): T => { try { return { ...fallback as object, ...JSON.parse(localStorage.getItem(key) || "{}") } as T; } catch (_) { return fallback; } };
    setActiveAnalystId(id);
    setKeybinds(read(`ras-keybinds-${id}`, defaultKeybinds));
    setAppearance(read(`ras-appearance-${id}`, defaultAppearance));
    setAnalystProfile(read(`ras-analyst-profile-${id}`, { ...defaultProfile, name: base.name, role: base.role }));
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(`ras-last-session-${id}`) || "null"); } catch (_) {}
    setMatchName(""); setOpposition(""); setCompetition(""); setTeamScore(""); setOppositionScore(""); setTeamLogoDataUrl(""); setEvents([]); setRawVideoName(""); setRawVideoPath(""); setRawVideoUrl(""); setPlaybackVideoUrl(""); setLastSessionSaved("");
    setRecoveryCandidate(saved ? { id, saved } : null);
    setGeneratedClips([]); setCompilationOutputs([]); setProfileSelected(true); setView("home");
  }

  function restoreRecoveredSession() {
    const saved = recoveryCandidate?.saved;
    if (!saved) return;
    setMatchName(saved.matchName || ""); setOpposition(saved.opposition || ""); setCompetition(saved.competition || ""); setTeamScore(saved.teamScore ?? ""); setOppositionScore(saved.oppositionScore ?? ""); setTeamLogoDataUrl(saved.teamLogoDataUrl || ""); setEvents(Array.isArray(saved.events) ? saved.events : []);
    setRawVideoName(saved.rawVideoName || ""); setRawVideoPath(saved.rawVideoPath || ""); setRawVideoUrl(saved.rawVideoUrl || ""); setPlaybackVideoUrl(saved.playbackVideoUrl || saved.rawVideoUrl || ""); setLastSessionSaved(saved.savedAt || "");
    setRecoveryCandidate(null); setView("analysis"); notify("Session Restored", `${saved.events?.length || 0} tagged events recovered.`, "success");
  }

  function discardRecoveredSession() {
    if (recoveryCandidate?.id) localStorage.removeItem(`ras-last-session-${recoveryCandidate.id}`);
    setRecoveryCandidate(null);
  }

  function closeNotice() {
    setNoticeClosing(true);
    window.setTimeout(() => setNotice(null), 320);
  }

  function currentSeconds() {
    return videoRef.current ? videoRef.current.currentTime : 0;
  }

  function switchPanel(panel: Panel, reason?: string) {
    setActivePanel(panel);
    if (reason) notify(`Switched to ${panel === "attack" ? "Attack" : "Defence"} Panel`, reason, "info");
  }

  function autoSwitchPanel(panel: Panel, reason: string) {
    if (panelSwitching === "automatic") switchPanel(panel, reason);
  }

  function seekVideo(amount: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + amount);
  }

  function changePlaybackRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  async function chooseMatchFootage() {
    const file = await window.electronAPI.selectVideo();
    if (!file) return;
    setRawVideoName(file.name);
    setRawVideoPath(file.path);
    setRawVideoUrl(file.url);
    setPlaybackVideoUrl(file.url);
    setOptimiseAttempted(false);
    setGeneratedClips([]);
    setCompilationOutputs([]);
    setStatusMessage(`${file.name} loaded.`);
    notify("Match Footage Loaded", file.name, "success");
  }

  async function connectCloudStorage() {
    const result = await window.electronAPI.configureCloudStorage({ accessKeyId: cloudAccessKey, secretAccessKey: cloudSecretKey });
    if (!result.success) {
      notify("Cloud Connection Failed", result.message || "The credentials could not access the private footage bucket.", "error");
      return;
    }
    setCloudConfigured(true);
    setCloudAccessKey("");
    setCloudSecretKey("");
    setShowCloudSetup(false);
    notify("Cloud Storage Connected", "Credentials are encrypted by Windows and kept outside match files.", "success");
  }

  async function uploadCurrentVideoToCloud() {
    if (!rawVideoPath || isCloudUploading) return;
    setIsCloudUploading(true);
    setCloudUploadProgress(0);
    setStatusMessage("Uploading raw footage to private cloud storage...");
    const result = await window.electronAPI.uploadVideoToCloud({ videoPath: rawVideoPath });
    setIsCloudUploading(false);
    if (result.success && result.key) {
      setCloudObjectKey(result.key);
      setStatusMessage(`${rawVideoName} safely stored in Cloudflare R2.`);
      notify("Cloud Upload Complete", `Verified in private storage. Raw footage expires automatically after ${result.retentionDays || 60} days.`, "success");
    } else {
      setStatusMessage("Cloud upload failed; the local footage was not changed.");
      notify("Cloud Upload Failed", result.message || "The footage remains safely on this PC.", "error");
    }
  }

  async function optimiseCurrentVideoForPlayback() {
    if (!rawVideoPath || isOptimisingVideo) return;

    setIsOptimisingVideo(true);
    setOptimiseAttempted(true);
    notify("Optimising Video", "This MOV/codec cannot play directly, so Rugby Analysis Suite is creating an MP4 preview copy. Your original file is not changed.", "info");

    try {
      const result = await window.electronAPI.optimiseVideoForPlayback({ videoPath: rawVideoPath });
      if (result.success && result.url) {
        setPlaybackVideoUrl(result.url);
        setStatusMessage("Playback copy created. The original file will still be used for compilations.");
        notify("Video Ready", "A playable MP4 preview copy was created. You can now analyse this footage normally.", "success");
      } else {
        notify("Optimisation Failed", result.message || "Could not create a playable preview copy.", "error");
      }
    } catch (error) {
      notify("Optimisation Failed", String(error), "error");
    } finally {
      setIsOptimisingVideo(false);
    }
  }

  function handleVideoPlaybackError() {
    if (!rawVideoPath) return;
    if (!optimiseAttempted) {
      void optimiseCurrentVideoForPlayback();
      return;
    }
    notify("Video Playback Issue", "This file still cannot be previewed by Chromium. FFmpeg can still use the original file for compilation videos, but this codec may need manual conversion.", "warning");
  }

  function requireVideo() {
    if (!rawVideoPath) {
      notify("No Match Footage", "Load a raw match video before tagging events.", "warning");
      return false;
    }
    return true;
  }

  function addEvent(event: Omit<EventLog, "id" | "time" | "seconds" | "zone"> & { zone?: string; seconds?: number }) {
    if (!requireVideo()) return;
    const seconds = event.seconds ?? currentSeconds();
    const newEvent: EventLog = {
      ...event,
      id: Date.now() + Math.floor(Math.random() * 1000),
      time: formatTime(seconds),
      seconds,
      zone: event.zone || selectedZone,
    };
    setEvents((prev) => [newEvent, ...prev]);
    setGeneratedClips([]);
    setCompilationOutputs([]);
  }

  function addSetPiece(eventName: string) {
    addEvent({ category: "set-piece", event: eventName });
    if (eventName === "Lineout Lost" || eventName === "Scrum Lost" || eventName === "Opposition Lineout Won" || eventName === "Opposition Scrum Won") {
      autoSwitchPanel("defence", `${eventName} was tagged. Possession is with the opposition.`);
    }
  }

  function addKick(outcome: string, kickType: KickType) {
    if (attackActive) {
      finishAttack(outcome, undefined, kickType);
      return;
    }
    addEvent({ category: "kick", event: `${kickType} Kick`, outcome, kickType, endZone: selectedZone });
    setActiveKickType(null);
    setAttackAction("phase");
    if (outcome !== "Contestable Kick Regained") setPossessionInGoldZone(false);
  }

  function addRestart(outcome: string) {
    if (!activeRestart) return;
    addEvent({ category: "restart", event: activeRestart, outcome });
    setActiveRestart(null);
    setPossessionInGoldZone(false);
    if (outcome === "Possession Gained") autoSwitchPanel("attack", `${activeRestart}: possession gained.`);
    if (outcome === "Possession Lost") autoSwitchPanel("defence", `${activeRestart}: possession lost.`);
  }

  function selectZone(zone: string) {
    setSelectedZone(zone);
    if (attackActive && attackAction === "phase") setPhaseZoneConfirmed(true);
    if (attackActive && zone === "Opp 22" && !possessionInGoldZone) {
      setPossessionInGoldZone(true);
      setActiveGoldZoneEntry(true);
    }
  }

  function startAttack(type: string, launchType: "Scrum" | "Lineout" | null = null, lineoutLaunch: "Down and Out" | "Off the Top" | null = null) {
    if (!requireVideo()) return;
    setAttackActive(true);
    setAttackStartZone(selectedZone);
    setAttackStartSeconds(currentSeconds());
    setPositiveAttackSequence(false);
    setCurrentAttackType(type);
    setCurrentLaunchType(launchType);
    setCurrentLineoutLaunch(lineoutLaunch);
    setLineoutLaunchPrompt(false);
    setPhaseCount(0);
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setPhaseZoneConfirmed(false);
    setActiveKickType(null);
    const isNewGoldZoneEntry = selectedZone === "Opp 22" && !possessionInGoldZone;
    setActiveGoldZoneEntry(isNewGoldZoneEntry);
    if (isNewGoldZoneEntry) setPossessionInGoldZone(true);
  }

  function startScrumLaunch() {
    if (!requireVideo()) return;
    addSetPiece("Scrum Won");
    startAttack("Scrum", "Scrum");
  }

  function chooseLineoutLaunch(style: "Down and Out" | "Off the Top" | "Maul") {
    if (!requireVideo()) return;
    addSetPiece("Lineout Won");
    setLineoutLaunchPrompt(false);
    if (style === "Maul") {
      startMaul(true);
      return;
    }
    startAttack("Lineout", "Lineout", style);
  }

  function completePhase(ruckSpeed: RuckSpeed | null = pendingRuckSpeed) {
    if (!pendingGainline || !ruckSpeed || !phaseZoneConfirmed) return;
    setPhasePerformance((prev) => [...prev, { gainline: pendingGainline, ruckSpeed, zone: selectedZone, seconds: currentSeconds() }]);
    setPhaseCount((prev) => prev + 1);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setPhaseZoneConfirmed(true);
  }

  function tagRuckSpeed(speed: RuckSpeed) {
    setPendingRuckSpeed(speed);
    if (pendingGainline && phaseZoneConfirmed) completePhase(speed);
  }

  function finishAttack(outcome: string, reason?: string, kickType?: KickType) {
    if (!attackActive) return;
    addEvent({
      category: "attack",
      event: `${currentAttackType} Attack`,
      attackType: currentAttackType,
      launchType: currentLaunchType || undefined,
      lineoutLaunch: currentLineoutLaunch || undefined,
      phases: phaseCount,
      outcome,
      reason,
      zone: attackStartZone,
      phasePerformance,
      kickType,
      endZone: selectedZone,
      goldZoneEntry: activeGoldZoneEntry,
      attackStartSeconds,
      positiveSequence: positiveAttackSequence,
    });
    const closesGoldZonePossession = !["Penalty Won", "Held Up – Retain Ball", "Contestable Kick Regained"].includes(outcome);
    if (possessionInGoldZone && closesGoldZonePossession) {
      setEvents((prev) => {
        const entryIndex = prev.findIndex((event) => event.goldZoneEntry && !event.goldZoneOutcome);
        if (entryIndex === -1) return prev;
        return prev.map((event, index) => index === entryIndex ? { ...event, goldZoneOutcome: outcome } : event);
      });
    }
    setAttackActive(false);
    setAttackStartZone("");
    setAttackStartSeconds(0);
    setPositiveAttackSequence(false);
    setCurrentAttackType("");
    setCurrentLaunchType(null);
    setCurrentLineoutLaunch(null);
    setLineoutLaunchPrompt(false);
    setCurrentLaunchType(null);
    setCurrentLineoutLaunch(null);
    setPhaseCount(0);
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setActiveKickType(null);
    setActiveGoldZoneEntry(false);
    setAttackAction("phase");
    const possessionRetained = !closesGoldZonePossession;
    if (!possessionRetained) setPossessionInGoldZone(false);
    if (outcome === "Ball Lost") autoSwitchPanel("defence", "Ball Lost was tagged.");
    if (["Penalty Conceded", "Contestable Kick Lost", "Failed Exit", "Charged Down", "Poor Clearance", "Direct Into Touch"].includes(outcome)) autoSwitchPanel("defence", `${outcome} was tagged.`);
  }

  function addDefenceEvent(eventName: string, reason?: string) {
    addEvent({ category: "defence", event: eventName, outcome: eventName, reason });
    if (eventName === "Ball Won" || eventName === "Penalty Won" || eventName === "Opposition Held Up" || eventName === "Opponent Lineout Stolen" || eventName === "Opponent Scrum Stolen") {
      setPossessionInGoldZone(false);
      autoSwitchPanel("attack", `${eventName} was tagged.`);
    }
  }

  function addCoachingMoment(eventName: string, category: "attack" | "defence") {
    const note = coachingMomentNote.trim();
    addEvent({ category, event: eventName, outcome: eventName, coachingMoment: true, note: note || undefined });
    setCoachingMomentNote("");
    notify("Moment Tagged", `${eventName}: 10 seconds before and 5 seconds after will be included in its clip.`, "success");
  }

  function startMaul(fromLineout = false) {
    if (!requireVideo()) return;
    setMaulFromLineout(fromLineout);
    setMaulActive(true);
    setMaulStartZone(selectedZone);
    setMaulStartSeconds(currentSeconds());
    setMaulPhaseCount(0);
    setAttackActive(false);
    setAttackStartZone("");
    setAttackStartSeconds(0);
    setPositiveAttackSequence(false);
    setCurrentAttackType("");
    setPhaseCount(0);
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setActiveKickType(null);
    setActiveRestart(null);
    setActiveGoldZoneEntry(false);
  }

  function finishMaul(outcome: string) {
    if (!maulActive) return;

    addEvent({
      category: "maul",
      event: "Maul",
      outcome,
      phases: maulPhaseCount,
      zone: maulStartZone,
      launchType: "Maul",
      lineoutLaunch: maulFromLineout ? "Maul" : undefined,
      attackStartSeconds: maulStartSeconds,
    });

    const retainedZone = maulStartZone;
    setMaulActive(false);
    setMaulStartZone("");
    setMaulStartSeconds(0);
    setMaulPhaseCount(0);
    setMaulFromLineout(false);
    setMaulFromLineout(false);

    if (outcome === "Maul Retained") {
      setAttackActive(true);
      setAttackStartZone(retainedZone || selectedZone);
      setAttackStartSeconds(currentSeconds());
      setPositiveAttackSequence(false);
      setCurrentAttackType("Maul");
      setPhaseCount(0);
      switchPanel("attack", "Maul retained. Continue tracking the next attack phases.");
      return;
    }

    if (outcome === "Maul Sacked" || outcome === "Maul Lost") {
      autoSwitchPanel("defence", `${outcome} was tagged.`);
      return;
    }

    if (outcome === "Maul Penalty Won" || outcome === "Maul Try") {
      autoSwitchPanel("attack", `${outcome} was tagged.`);
    }
  }

  function jumpTo(seconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    void videoRef.current.play();
  }

  function undoLastEvent() {
    setEvents((prev) => prev.slice(1));
    setGeneratedClips([]);
    setCompilationOutputs([]);
  }

  function undoLastPhase() {
    setPhasePerformance((prev) => prev.slice(0, -1));
    setPhaseCount((prev) => Math.max(0, prev - 1));
    setPendingGainline(null);
    setPendingRuckSpeed(null);
  }

  function cancelCurrentEvent() {
    setAttackActive(false);
    setAttackStartZone("");
    setAttackStartSeconds(0);
    setPositiveAttackSequence(false);
    setCurrentAttackType("");
    setCurrentLaunchType(null);
    setCurrentLineoutLaunch(null);
    setLineoutLaunchPrompt(false);
    setPhaseCount(0);
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setActiveKickType(null);
    setActiveRestart(null);
    setActiveGoldZoneEntry(false);
    setAttackAction("phase");
    setMaulActive(false);
    setMaulStartZone("");
    setMaulStartSeconds(0);
    setMaulPhaseCount(0);
    setMaulFromLineout(false);
    notify("Returned", "Current logging step cancelled. No event was added.", "info");
  }

  function clearWorkspace() {
    const shouldClear = window.confirm(
      "Clear Match?\n\nThis will remove the loaded video, match details, tagged events and analysis state."
    );
    if (!shouldClear) return;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    setMatchName("");
    setOpposition("");
    setCompetition("");
    setTeamScore("");
    setOppositionScore("");
    setTeamLogoDataUrl("");
    setEvents([]);
    setSelectedZone("Midfield");
    setActivePanel("attack");
    setAttackActive(false);
    setAttackStartZone("");
    setAttackStartSeconds(0);
    setPositiveAttackSequence(false);
    setCurrentAttackType("");
    setCurrentLaunchType(null);
    setCurrentLineoutLaunch(null);
    setLineoutLaunchPrompt(false);
    setPhaseCount(0);
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setActiveKickType(null);
    setActiveRestart(null);
    setPossessionInGoldZone(false);
    setActiveGoldZoneEntry(false);
    setAttackAction("phase");
    setPhasePerformance([]);
    setPendingGainline(null);
    setPendingRuckSpeed(null);
    setMaulActive(false);
    setMaulStartZone("");
    setMaulStartSeconds(0);
    setMaulPhaseCount(0);
    setMaulFromLineout(false);
    setRawVideoName("");
    setRawVideoPath("");
    setRawVideoUrl("");
    setPlaybackVideoUrl("");
    setOptimiseAttempted(false);
    setIsOptimisingVideo(false);
    setPlaybackRate(1);
    setSelectedClipTypes(defaultReviewClipTypes);
    setGeneratedClips([]);
    setCompilationOutputs([]);
    setStatusMessage("Workspace cleared.");
    notify("Match Cleared", "The match, events and loaded footage were cleared.", "info");
  }

  function loadTeamLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Invalid Logo", "Choose a PNG, JPG or WEBP image.", "warning"); return; }
    const reader = new FileReader();
    reader.onload = () => setTeamLogoDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function saveProject() {
    const project = {
      version: "1.4.0",
      matchName,
      opposition,
      competition,
      teamScore,
      oppositionScore,
      teamLogoDataUrl,
      events,
      selectedZone,
      rawVideoName,
      rawVideoPath,
      rawVideoUrl,
      playbackVideoUrl,
      panelSwitching,
      clipPaddingPresetId,
      selectedClipTypes,
      savedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(matchTitle === "No Match Loaded" ? "rugby-analysis-project" : matchTitle)}.ras`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Match Saved", "A .ras project file was created.", "success");
  }

  function openProject(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        setMatchName(data.matchName || "");
        setOpposition(data.opposition || "");
        setCompetition(data.competition || "");
        setTeamScore(data.teamScore ?? "");
        setOppositionScore(data.oppositionScore ?? "");
        setTeamLogoDataUrl(data.teamLogoDataUrl || "");
        setEvents(Array.isArray(data.events) ? data.events : []);
        setSelectedZone(data.selectedZone || "Midfield");
        setMaulActive(false);
        setMaulStartZone("");
        setMaulPhaseCount(0);
        setRawVideoName(data.rawVideoName || "");
        setRawVideoPath(data.rawVideoPath || "");
        setRawVideoUrl(data.rawVideoUrl || "");
        setPlaybackVideoUrl(data.playbackVideoUrl || data.rawVideoUrl || "");
        setPanelSwitching(data.panelSwitching || "automatic");
        setClipPaddingPresetId(data.clipPaddingPresetId || "coach");
        const savedClipTypes = Array.isArray(data.selectedClipTypes) ? data.selectedClipTypes : defaultReviewClipTypes;
        setSelectedClipTypes([...new Set([...savedClipTypes, "Good Attacking Moment", "Bad Attacking Moment", "Good Defensive Moment", "Bad Defensive Moment"])]);
        setGeneratedClips([]);
        setCompilationOutputs([]);
        notify("Project Opened", `${file.name} loaded successfully.`, "success");
      } catch (error) {
        notify("Open Failed", "This .ras file could not be opened.", "error");
      }
    };
    reader.readAsText(file);
  }


  const exportWarnings = [
    !matchName ? "Your team name is missing." : "",
    !opposition ? "Opposition name is missing." : "",
    attacks.some((event) => !event.phases) ? `${attacks.filter((event) => !event.phases).length} attack(s) contain no completed phases.` : "",
    kickEvents.some((event) => !event.outcome) ? "One or more kicks have no outcome." : "",
    allAttackPhases.length < 5 && attacks.length ? "Too few classified phases for reliable gainline and ruck-speed insights." : "",
  ].filter(Boolean);

  async function exportPDFReport(confirmed = false, coachPackage = false) {
    if (!events.length) {
      notify("No Events", "Tag events before exporting a stat report.", "warning");
      return;
    }
    if (!confirmed && exportWarnings.length) {
      setPendingCoachPackage(coachPackage);
      setShowExportCheck(true);
      return;
    }

    const coverPalette = await paletteFromLogo(teamLogoDataUrl);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = 18;
    const title = matchTitle === "No Match Loaded" ? "Match Analysis" : matchTitle;
    const videoReviewLinks = compilationOutputs.map((outputPath) => {
      const fileName = outputPath.split(/[\\/]/).pop() || outputPath;
      const label = fileName
        .replace(/-(?:quick|coach|deep|\d+s-before-\d+s-after)-compilation\.mp4$/i, "")
        .replace(/-compilation\.mp4$/i, "")
        .replace(/-/g, " ");
      const url = coachPackage ? `Video%20Clips/${encodeURIComponent(fileName)}` : encodeURI(`file:///${outputPath.replace(/\\/g, "/")}`);
      return { label: titleCase(label), fileName, url };
    });

    const normaliseReason = (reason?: string) => {
      if (!reason) return "Not specified";
      if (reason === "Into Touch") return "Taken Into Touch";
      return reason;
    };

    const ballLostReasonBreakdown = attacks
      .filter((event) => event.outcome === "Ball Lost")
      .reduce<Record<string, number>>((summary, event) => {
        const reason = normaliseReason(event.reason);
        summary[reason] = (summary[reason] || 0) + 1;
        return summary;
      }, {});

    const possessionSeconds = matchInsights.attackSeconds + matchInsights.defenceSeconds;
    const possessionValue = Number(percent(matchInsights.attackSeconds, possessionSeconds));
    const oppositionPossessionValue = Math.max(0, 100 - possessionValue);
    const territorySeconds = matchInsights.segments.reduce((total, segment) => total + Math.max(0, segment.end - segment.start), 0);
    const attackingTerritorySeconds = matchInsights.segments
      .filter((segment) => segment.zone === "Opp Half" || segment.zone === "Opp 22")
      .reduce((total, segment) => total + Math.max(0, segment.end - segment.start), 0);
    const territoryValue = Number(percent(attackingTerritorySeconds, territorySeconds));
    const ownTerritoryValue = Math.max(0, 100 - territoryValue);
    const penaltyConcededEvents = events.filter((event) =>
      event.event === "Penalty Conceded"
      || event.outcome === "Penalty Conceded"
      || (event.outcome === "Ball Lost" && event.reason === "Penalty Conceded"),
    );
    const zoneEvidence = pitchZones.map((zone) => {
      const zoneEvents = events.filter((event) => event.zone === zone);
      return {
        zone,
        total: zoneEvents.length,
        penaltiesConceded: penaltyConcededEvents.filter((event) => event.zone === zone).length,
      };
    });
    const penaltyByReason = penaltyConcededEvents.reduce<Record<string, number>>((summary, event) => {
      const reason = normaliseReason(event.reason);
      summary[reason] = (summary[reason] || 0) + 1;
      return summary;
    }, {});
    const penaltyHotspot = [...zoneEvidence].sort((a, b) => b.penaltiesConceded - a.penaltiesConceded)[0];
    const eventHotspot = [...zoneEvidence].sort((a, b) => b.total - a.total)[0];

    const attackEfficiencyValue = Number(percent(successfulAttacks, totalAttacks));
    const ballLossRateValue = Number(percent(ballLosses, totalAttacks));
    const goldZoneValue = Number(percent(successfulGoldZoneEntries.length, goldZoneEntries.length));
    const tackleCompletionValue = Number(percent(tackleMade, tackleMade + tackleMissed));
    const lineoutValue = Number(percent(lineoutsWon, totalLineouts));
    const scrumValue = Number(percent(scrumsWon, totalScrums));
    const exitValue = Number(percent(goodExits, exitKicks.length));
    const gainlineValue = gainlineSuccess;
    const quickBallValue = quickBallRate;

    const performanceRankings = [
      { label: "Try Differential", display: `${triesScored} scored / ${triesConceded} conceded`, target: "a level or positive try differential", score: (triesScored - triesConceded) * 10, priority: 100, enough: triesScored + triesConceded > 0 },
      { label: "Attack Efficiency", display: `${attackEfficiencyValue.toFixed(1)}%`, target: "45%", score: attackEfficiencyValue - 45, priority: 95, enough: totalAttacks >= 3 },
      { label: "Gold Zone Conversion", display: `${goldZoneValue.toFixed(1)}% (${successfulGoldZoneEntries.length} from ${goldZoneEntries.length})`, target: "60%", score: goldZoneValue - 60, priority: 90, enough: goldZoneEntries.length >= 2 },
      { label: "Discipline", display: `${penaltyConcededEvents.length} penalties conceded`, target: "10 or fewer", score: 10 - penaltyConcededEvents.length, priority: 88, enough: events.length >= 10 || penaltyConcededEvents.length > 0 },
      { label: "Ball Security", display: `${ballLossRateValue.toFixed(1)}% ball loss rate`, target: "below 18%", score: 18 - ballLossRateValue, priority: 86, enough: totalAttacks >= 3 },
      { label: "Territory Control", display: `${territoryValue.toFixed(1)}% in the opposition half`, target: "50%", score: territoryValue - 50, priority: 82, enough: matchInsights.segments.length >= 4 },
      { label: "Possession Control", display: `${possessionValue.toFixed(1)}% estimated possession`, target: "50%", score: possessionValue - 50, priority: 78, enough: matchInsights.segments.length >= 4 },
      { label: "Tackle Completion", display: `${tackleCompletionValue.toFixed(1)}%`, target: "88%", score: tackleCompletionValue - 88, priority: 76, enough: tackleMade + tackleMissed >= 5 },
      { label: "Gainline Performance", display: `${gainlineValue.toFixed(1)}%`, target: "65%", score: gainlineValue - 65, priority: 70, enough: allAttackPhases.length >= 5 },
      { label: "Ruck Speed", display: `${quickBallValue.toFixed(1)}% quick ball`, target: "55%", score: quickBallValue - 55, priority: 68, enough: allAttackPhases.length >= 5 },
      { label: "Lineout Success", display: `${lineoutValue.toFixed(1)}%`, target: "85%", score: lineoutValue - 85, priority: 64, enough: totalLineouts >= 3 },
      { label: "Scrum Success", display: `${scrumValue.toFixed(1)}%`, target: "90%", score: scrumValue - 90, priority: 62, enough: totalScrums >= 3 },
      { label: "Exit Execution", display: `${exitValue.toFixed(1)}%`, target: "80%", score: exitValue - 80, priority: 55, enough: exitKicks.length >= 2 },
    ].filter((metric) => metric.enough);

    const allMatchStrengths = performanceRankings.filter((metric) => metric.score >= 0).sort((a, b) => b.priority - a.priority);
    const allMatchWorkOns = performanceRankings.filter((metric) => metric.score < 0).sort((a, b) => b.priority - a.priority);
    const summariseCounts = (summary: Record<string, number>, limit = 3) => Object.entries(summary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => `${label} (${count})`)
      .join(", ");
    const goldZoneFailureBreakdown = goldZoneEntries
      .filter((event) => !goldZoneSuccessOutcomes.includes(event.goldZoneOutcome || event.outcome || ""))
      .reduce<Record<string, number>>((summary, event) => {
        const outcome = event.goldZoneOutcome || event.outcome || "No successful outcome logged";
        summary[outcome] = (summary[outcome] || 0) + 1;
        return summary;
      }, {});
    const missedTackleZones = defenceEvents
      .filter((event) => event.event === "Tackle Missed")
      .reduce<Record<string, number>>((summary, event) => {
        summary[event.zone] = (summary[event.zone] || 0) + 1;
        return summary;
      }, {});
    const exitFailureBreakdown = exitKicks
      .filter((event) => !["Successful Exit", "Good Exit"].includes(event.outcome || ""))
      .reduce<Record<string, number>>((summary, event) => {
        const outcome = event.outcome || "Unclassified exit";
        summary[outcome] = (summary[outcome] || 0) + 1;
        return summary;
      }, {});
    const gainlineNeutral = allAttackPhases.filter((phase) => phase.gainline === "Neutral").length;
    const gainlineLost = allAttackPhases.filter((phase) => phase.gainline === "Lost").length;
    const averageRucks = allAttackPhases.filter((phase) => phase.ruckSpeed === "Average").length;
    const slowRucks = allAttackPhases.filter((phase) => phase.ruckSpeed === "Slow").length;

    function contributingFactorExplanation(label: string) {
      if (label === "Attack Efficiency") {
        const reasons = summariseCounts(ballLostReasonBreakdown);
        return `${successfulAttacks} of ${totalAttacks} attacks produced a successful outcome, while ${ballLosses} ended in ball loss.${reasons ? ` The most common logged loss reasons were ${reasons}.` : ""} The evidence therefore points to possession ending before attacks could create a return; review those loss sequences for the decision or execution error immediately before possession changed.`;
      }
      if (label === "Gold Zone Conversion") {
        const failedEntries = Math.max(0, goldZoneEntries.length - successfulGoldZoneEntries.length);
        const endings = summariseCounts(goldZoneFailureBreakdown);
        return `${failedEntries} of ${goldZoneEntries.length} Gold Zone entries failed to produce points.${endings ? ` Their most common logged endings were ${endings}.` : ""} This suggests the main cost occurred after entering the opposition 22, when pressure was not converted; use those entry clips to identify whether possession was lost through handling, breakdown, set-piece or decision-making errors.`;
      }
      if (label === "Discipline") {
        const reasons = summariseCounts(penaltyByReason);
        return `${penaltyConcededEvents.length} penalties were conceded, with ${penaltyHotspot?.penaltiesConceded || 0} occurring in ${penaltyHotspot?.zone || "the main hotspot"}.${reasons ? ` The leading logged causes were ${reasons}.` : ""} The concentration and reason mix identify where repeated pressure was being released; validate whether these came from breakdown technique, spacing or set-piece pressure in the matching clips.`;
      }
      if (label === "Ball Security") {
        const reasons = summariseCounts(ballLostReasonBreakdown);
        return `${ballLosses} of ${totalAttacks} attacks ended in ball loss (${ballLossRateValue.toFixed(1)}%).${reasons ? ` The leading logged causes were ${reasons}.` : ""} Because the losses are classified, the review should focus first on the highest-frequency cause rather than treating every turnover as the same problem.`;
      }
      if (label === "Territory Control") {
        const exitFailures = Math.max(0, exitKicks.length - goodExits);
        const exits = summariseCounts(exitFailureBreakdown);
        return `Only ${territoryValue.toFixed(1)}% of the time-weighted match was played in the opposition half. Exit kicks succeeded ${goodExits} times from ${exitKicks.length}, with ${exitFailures} unsuccessful exits${exits ? ` (${exits})` : ""}, while ${ballLosses} attacks ended in lost possession. The combined evidence suggests territory was being surrendered through exit execution and possession losses before pressure could be sustained.`;
      }
      if (label === "Possession Control") {
        return `Estimated possession was ${possessionValue.toFixed(1)}%. The team recorded ${ballLosses} attacking ball losses, ${lineoutsLost} lost lineouts and ${scrumsLost} lost scrums. These logged possession changes provide the clearest explanation for why the possession share stayed below the reference; review the largest loss category first.`;
      }
      if (label === "Tackle Completion") {
        const zones = summariseCounts(missedTackleZones);
        return `${tackleMissed} of ${tackleMade + tackleMissed} tackle attempts were missed (${tackleCompletionValue.toFixed(1)}% completed).${zones ? ` Misses were concentrated in ${zones}.` : ""} That location pattern should be used to test whether the repeated cause was defensive spacing, connection or individual tackle execution.`;
      }
      if (label === "Gainline Performance") {
        return `${gainlineWon} of ${allAttackPhases.length} classified carries won the gainline; ${gainlineNeutral} were neutral and ${gainlineLost} lost ground. The balance shows how often phase momentum stalled before the next ruck, so the relevant clips should be checked for receiving depth, carrier footwork and support timing.`;
      }
      if (label === "Ruck Speed") {
        return `${quickRucks} of ${allAttackPhases.length} classified rucks produced quick ball, compared with ${averageRucks} average and ${slowRucks} slow rucks. The non-quick ruck volume explains the reduced attacking tempo; review ball presentation and first-arriver support on those phases.`;
      }
      if (label === "Lineout Success") {
        return `${lineoutsLost} of ${totalLineouts} lineouts were lost, leaving ${lineoutsWon} retained (${lineoutValue.toFixed(1)}%). With half of the available launch possession removed in this sample, the lost-lineout clips should be compared for repeat patterns in throw location, timing, movement or lifting pressure.`;
      }
      if (label === "Scrum Success") {
        return `${scrumsLost} of ${totalScrums} scrums were lost and ${scrumsWon} were retained (${scrumValue.toFixed(1)}%). Review the lost outcomes together to determine whether the repeat pattern occurred at engagement, under sustained pressure or during the exit.`;
      }
      if (label === "Exit Execution") {
        const failures = Math.max(0, exitKicks.length - goodExits);
        const exits = summariseCounts(exitFailureBreakdown);
        return `${goodExits} of ${exitKicks.length} exits were successful, leaving ${failures} unsuccessful.${exits ? ` Those failures were logged as ${exits}.` : ""} This points the review toward the kick decision, pressure before contact and chase connection on the failed exits.`;
      }
      if (label === "Try Differential") {
        return `The team scored ${triesScored} tries and conceded ${triesConceded}. Review the scoring and conceded sequences beside the Gold Zone and tackle data to identify whether the differential was driven primarily by conversion of entries or defensive breakdowns.`;
      }
      return `This metric fell below its reference in the logged sample. Review its corresponding events alongside the score and match situation to establish the repeatable cause.`;
    }
    const hasRecordedScore = teamScore !== "" && oppositionScore !== "";
    const teamScoreValue = Number(teamScore);
    const oppositionScoreValue = Number(oppositionScore);
    const resultType = !hasRecordedScore ? "unrecorded" : teamScoreValue > oppositionScoreValue ? "win" : teamScoreValue < oppositionScoreValue ? "loss" : "draw";
    // Keep every statistically supported signal. Result controls the reading order,
    // but never hides positives or development areas from the customer.
    const matchStrengths = allMatchStrengths;
    const matchWorkOns = allMatchWorkOns;

    function ensureSpace(space = 12) {
      if (y + space > pageHeight - 18) {
        addFooter();
        doc.addPage();
        y = 18;
      }
    }

    function addFooter() {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Generated by Rugby Analysis Suite v1.4.0", margin, pageHeight - 8);
      doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    function addSection(titleText: string) {
      y += 8;
      ensureSpace(18);
      doc.setFillColor(6, 17, 10);
      doc.roundedRect(margin, y - 6, pageWidth - margin * 2, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.text(titleText, margin + 4, y + 1);
      y += 12;
      doc.setTextColor(15, 23, 42);
    }

    function addLine(label: string, value: string | number) {
      ensureSpace(8);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(String(value), pageWidth - margin, y, { align: "right" });
      y += 7;
    }

    function clipFor(statType: string) {
      const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!defaultReviewClipTypes.some((type) => normalise(type) === normalise(statType))) return undefined;
      return videoReviewLinks.find((video) => normalise(video.label) === normalise(statType));
    }

    function addLineWithClip(label: string, value: string | number, clipType: string) {
      const clip = clipFor(clipType);
      ensureSpace(9);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(String(value), pageWidth - margin - (clip ? 34 : 0), y, { align: "right" });
      if (clip) {
        const buttonX = pageWidth - margin - 30;
        doc.setFillColor(6, 17, 10);
        doc.setDrawColor(126, 217, 87);
        doc.roundedRect(buttonX, y - 5, 30, 7, 1.7, 1.7, "FD");
        doc.setTextColor(126, 217, 87);
        doc.setFontSize(6.8);
        doc.text("PLAY CLIP", buttonX + 15, y - .4, { align: "center" });
        doc.link(buttonX, y - 5, 30, 7, { url: clip.url });
      }
      y += 7;
    }

    function addParagraph(text: string) {
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - 4);
      ensureSpace(lines.length * 5 + 4);
      doc.setFontSize(9.2);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(lines, margin + 2, y);
      y += lines.length * 5 + 4;
    }

    function addContributingFactor(index: number, label: string, detail: string) {
      const lines = doc.splitTextToSize(detail, pageWidth - margin * 2 - 25);
      const cardHeight = Math.max(19, 12 + lines.length * 4.5);
      ensureSpace(cardHeight + 4);
      doc.setFillColor(255, 247, 245);
      doc.setDrawColor(239, 68, 68);
      doc.roundedRect(margin, y - 5, pageWidth - margin * 2, cardHeight, 3, 3, "FD");
      doc.setFillColor(239, 68, 68);
      doc.circle(margin + 8, y + 5, 4.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(String(index), margin + 8, y + 6.1, { align: "center" });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.5);
      doc.text(`FACTOR ${index} - ${label.toUpperCase()}`, margin + 16, y + 2);
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      doc.text(lines, margin + 16, y + 7);
      y += cardHeight + 4;
    }

    function addShareBar(label: string, primaryLabel: string, primaryValue: number, secondaryLabel: string, secondaryValue: number) {
      ensureSpace(22);
      const width = pageWidth - margin * 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(label, margin, y);
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${primaryLabel} ${primaryValue.toFixed(1)}%`, margin, y + 5);
      doc.text(`${secondaryLabel} ${secondaryValue.toFixed(1)}%`, pageWidth - margin, y + 5, { align: "right" });
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(margin, y + 8, width, 5, 2.5, 2.5, "F");
      if (primaryValue > 0) {
        doc.setFillColor(92, 179, 56);
        doc.roundedRect(margin, y + 8, Math.max(2, width * Math.min(100, primaryValue) / 100), 5, 2.5, 2.5, "F");
      }
      y += 19;
    }

    function addInsightCard(index: number, heading: string, detail: string, tone: "risk" | "positive") {
      const cardHeight = 22;
      ensureSpace(cardHeight + 4);
      const isRisk = tone === "risk";
      doc.setFillColor(isRisk ? 255 : 241, isRisk ? 247 : 253, isRisk ? 237 : 244);
      doc.setDrawColor(isRisk ? 239 : 126, isRisk ? 68 : 217, isRisk ? 68 : 87);
      doc.roundedRect(margin, y - 5, pageWidth - margin * 2, cardHeight, 3, 3, "FD");
      doc.setFillColor(isRisk ? 239 : 126, isRisk ? 68 : 217, isRisk ? 68 : 87);
      doc.circle(margin + 8, y + 5, 4.5, "F");
      doc.setTextColor(isRisk ? 255 : 2, isRisk ? 255 : 7, isRisk ? 255 : 13);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(String(index), margin + 8, y + 6.2, { align: "center" });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10.5);
      doc.text(heading, margin + 16, y + 2);
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const detailLines = doc.splitTextToSize(detail, pageWidth - margin * 2 - 23);
      doc.text(detailLines.slice(0, 2), margin + 16, y + 7);
      y += cardHeight + 4;
    }

    function addVideoButton(label: string, fileName: string, url: string) {
      ensureSpace(18);
      doc.setFillColor(6, 17, 10);
      doc.setDrawColor(126, 217, 87);
      doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 14, 3, 3, "FD");
      doc.setFillColor(126, 217, 87);
      doc.circle(margin + 8, y + 2, 3.2, "F");
      doc.setTextColor(2, 7, 13);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(">", margin + 7, y + 3.2);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`WATCH ${label.toUpperCase()}`, margin + 15, y + 1);
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(fileName, margin + 15, y + 5.2);
      doc.setTextColor(126, 217, 87);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("PLAY CLIP", pageWidth - margin - 5, y + 2, { align: "right" });
      doc.link(margin, y - 5, pageWidth - margin * 2, 14, { url });
      y += 18;
    }

    function addMomentumGraph() {
      ensureSpace(42);
      const x = margin;
      const width = pageWidth - margin * 2;
      const height = 32;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y - 4, width, height + 8, 3, 3, "FD");
      doc.setDrawColor(203, 213, 225);
      doc.line(x + 5, y + height / 2, x + width - 5, y + height / 2);
      if (matchInsights.points.length > 1) {
        const values = matchInsights.points.map((point) => point.value);
        const min = Math.min(-1, ...values);
        const max = Math.max(1, ...values);
        doc.setDrawColor(92, 179, 56);
        doc.setLineWidth(.8);
        matchInsights.points.slice(1).forEach((point, index) => {
          const previous = matchInsights.points[index];
          const x1 = x + 5 + (index / (matchInsights.points.length - 1)) * (width - 10);
          const x2 = x + 5 + ((index + 1) / (matchInsights.points.length - 1)) * (width - 10);
          const y1 = y + height - ((previous.value - min) / (max - min)) * height;
          const y2 = y + height - ((point.value - min) / (max - min)) * height;
          doc.line(x1, y1, x2, y2);
        });
      }
      y += height + 12;
    }

    function addPenaltyHeatmap() {
      ensureSpace(52);
      const mapX = margin;
      const mapWidth = pageWidth - margin * 2;
      const mapHeight = 34;
      const zoneWidth = mapWidth / 5;
      const orderedZones = [...zoneEvidence].reverse();
      const maximum = Math.max(1, ...orderedZones.map((zone) => zone.penaltiesConceded));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text("OWN TRY LINE", mapX, y);
      doc.text("ATTACKING DIRECTION  >", mapX + mapWidth / 2, y, { align: "center" });
      doc.text("OPPOSITION TRY LINE", mapX + mapWidth, y, { align: "right" });
      y += 4;
      doc.setFillColor(29, 77, 49);
      doc.setDrawColor(176, 190, 181);
      doc.roundedRect(mapX, y, mapWidth, mapHeight, 2, 2, "FD");
      orderedZones.forEach((zone, index) => {
        const intensity = zone.penaltiesConceded / maximum;
        const red = Math.round(48 + intensity * 199);
        const green = Math.round(111 - intensity * 55);
        const blue = Math.round(61 - intensity * 34);
        const zoneX = mapX + index * zoneWidth;
        doc.setFillColor(red, green, blue);
        doc.rect(zoneX, y, zoneWidth, mapHeight, "F");
        if (index) {
          doc.setDrawColor(240, 245, 242);
          doc.setLineWidth(.25);
          doc.line(zoneX, y, zoneX, y + mapHeight);
        }
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.2);
        doc.text(zone.zone.toUpperCase(), zoneX + zoneWidth / 2, y + 11, { align: "center" });
        doc.setFontSize(16);
        doc.text(String(zone.penaltiesConceded), zoneX + zoneWidth / 2, y + 23, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.text(zone.penaltiesConceded === 1 ? "PENALTY" : "PENALTIES", zoneX + zoneWidth / 2, y + 29, { align: "center" });
      });
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(.4);
      doc.line(mapX + mapWidth / 2, y, mapX + mapWidth / 2, y + mapHeight);
      y += mapHeight + 8;
    }

    function addEventHeatmap() {
      ensureSpace(52);
      const mapX = margin;
      const mapWidth = pageWidth - margin * 2;
      const mapHeight = 34;
      const zoneWidth = mapWidth / 5;
      const orderedZones = [...zoneEvidence].reverse();
      const maximum = Math.max(1, ...orderedZones.map((zone) => zone.total));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text("OWN TRY LINE", mapX, y);
      doc.text("ATTACKING DIRECTION  >", mapX + mapWidth / 2, y, { align: "center" });
      doc.text("OPPOSITION TRY LINE", mapX + mapWidth, y, { align: "right" });
      y += 4;
      doc.setFillColor(20, 59, 41);
      doc.setDrawColor(176, 190, 181);
      doc.roundedRect(mapX, y, mapWidth, mapHeight, 2, 2, "FD");
      orderedZones.forEach((zone, index) => {
        const intensity = zone.total / maximum;
        const red = Math.round(25 + intensity * 101);
        const green = Math.round(74 + intensity * 143);
        const blue = Math.round(47 + intensity * 40);
        const zoneX = mapX + index * zoneWidth;
        doc.setFillColor(red, green, blue);
        doc.rect(zoneX, y, zoneWidth, mapHeight, "F");
        if (index) {
          doc.setDrawColor(240, 245, 242);
          doc.setLineWidth(.25);
          doc.line(zoneX, y, zoneX, y + mapHeight);
        }
        doc.setTextColor(intensity > .58 ? 5 : 255, intensity > .58 ? 18 : 255, intensity > .58 ? 10 : 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.2);
        doc.text(zone.zone.toUpperCase(), zoneX + zoneWidth / 2, y + 11, { align: "center" });
        doc.setFontSize(16);
        doc.text(String(zone.total), zoneX + zoneWidth / 2, y + 23, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.text(zone.total === 1 ? "EVENT" : "EVENTS", zoneX + zoneWidth / 2, y + 29, { align: "center" });
      });
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(.4);
      doc.line(mapX + mapWidth / 2, y, mapX + mapWidth / 2, y + mapHeight);
      y += mapHeight + 8;
    }

    const logoImage = document.querySelector<HTMLImageElement>(".logo-wrap img");

    // Premium cover page - the uploaded team's logo and palette drive the identity.
    const coverLight = mixColour(coverPalette.dark, [255, 255, 255], .07);
    const coverLine = mixColour(coverPalette.secondary, [255, 255, 255], .18);
    doc.setFillColor(...coverPalette.dark);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setFillColor(...coverLight);
    doc.rect(0, 0, pageWidth, 72, "F");
    doc.setFillColor(...mixColour(coverPalette.panel, coverPalette.dark, .25));
    doc.triangle(0, 67, pageWidth * .62, 0, 0, 0, "F");
    doc.setFillColor(...mixColour(coverPalette.panel, coverPalette.accent, .12));
    doc.triangle(pageWidth, 37, pageWidth, 0, pageWidth * .7, 0, "F");
    doc.setFillColor(...coverPalette.accent);
    doc.rect(0, 0, pageWidth, 3.5, "F");

    doc.setDrawColor(...mixColour(coverLine, coverPalette.dark, .55));
    doc.setLineWidth(.22);
    for (let pitchX = 16; pitchX <= pageWidth - 16; pitchX += (pageWidth - 32) / 6) doc.line(pitchX, 76, pitchX, pageHeight - 16);
    doc.line(16, 76, pageWidth - 16, 76);
    doc.line(16, pageHeight - 16, pageWidth - 16, pageHeight - 16);
    doc.line(pageWidth / 2, 76, pageWidth / 2, pageHeight - 16);
    doc.circle(pageWidth / 2, 188, 23, "S");
    doc.setDrawColor(...coverLine);
    doc.setLineWidth(.45);
    doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 5, 5, "S");

    try { if (logoImage && logoImage.complete && logoImage.naturalWidth > 0) doc.addImage(logoImage, "PNG", pageWidth / 2 - 14, 12, 28, 28, undefined, "FAST"); } catch (_) {}
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text("RUGBY ANALYSIS SUITE", pageWidth / 2, 49, { align: "center" });
    doc.setTextColor(...mixColour(coverPalette.secondary, [255, 255, 255], .34));
    doc.setFontSize(7.5);
    doc.text("PERFORMANCE INTELLIGENCE  /  MATCH REPORTING", pageWidth / 2, 57, { align: "center" });
    doc.setFillColor(...coverPalette.accent);
    doc.roundedRect(pageWidth / 2 - 22, 63, 44, 1.4, .7, .7, "F");

    doc.setFillColor(...mixColour(coverPalette.dark, [0, 0, 0], .35));
    doc.roundedRect(17, 82, pageWidth - 30, 143, 7, 7, "F");
    doc.setFillColor(...mixColour(coverPalette.panel, coverPalette.dark, .3));
    doc.setDrawColor(...mixColour(coverPalette.accent, coverPalette.secondary, .4));
    doc.roundedRect(14, 79, pageWidth - 28, 143, 7, 7, "FD");
    doc.setFillColor(...coverPalette.accent);
    doc.roundedRect(14, 79, 3, 143, 1.5, 1.5, "F");
    doc.roundedRect(pageWidth - 17, 79, 3, 143, 1.5, 1.5, "F");

    doc.setFillColor(247, 249, 248);
    doc.setDrawColor(...coverPalette.accent);
    doc.roundedRect(pageWidth / 2 - 22, 88, 44, 44, 6, 6, "FD");
    if (teamLogoDataUrl) {
      try { doc.addImage(teamLogoDataUrl, teamLogoDataUrl.includes("image/jpeg") ? "JPEG" : "PNG", pageWidth / 2 - 17, 93, 34, 34, undefined, "FAST"); } catch (_) {}
    } else {
      doc.setTextColor(...coverPalette.dark);
      doc.setFontSize(8);
      doc.text("TEAM CREST", pageWidth / 2, 112, { align: "center" });
    }

    doc.setTextColor(...coverPalette.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("STATISTICAL MATCH EVALUATION", pageWidth / 2, 141, { align: "center" });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(23);
    doc.text(matchName || "YOUR TEAM", pageWidth / 2, 156, { align: "center", maxWidth: pageWidth - margin * 2 - 20 });
    doc.setTextColor(...mixColour(coverPalette.secondary, [255, 255, 255], .35));
    doc.setFontSize(8.5);
    doc.text("VERSUS", pageWidth / 2, 167, { align: "center" });
    doc.setTextColor(242, 246, 243);
    doc.setFontSize(17.5);
    doc.text(opposition || "OPPOSITION", pageWidth / 2, 179, { align: "center", maxWidth: pageWidth - margin * 2 - 20 });

    if (teamScore !== "" && oppositionScore !== "") {
      doc.setFillColor(...coverPalette.accent);
      doc.roundedRect(pageWidth / 2 - 36, 188, 72, 22, 5, 5, "F");
      doc.setTextColor(...coverPalette.scoreText);
      doc.setFontSize(26);
      doc.text(`${teamScore}  -  ${oppositionScore}`, pageWidth / 2, 203, { align: "center" });
      doc.setTextColor(...mixColour(coverPalette.secondary, [255, 255, 255], .35));
      doc.setFontSize(6.8);
      doc.text("FINAL SCORE", pageWidth / 2, 216, { align: "center" });
    }

    const metadataY = 234;
    const metadataWidth = (pageWidth - 36) / 3;
    const metadata = [
      ["COMPETITION", (competition || "MATCH REVIEW").toUpperCase()],
      ["DATE", new Date().toLocaleDateString()],
      ["EVENTS", `${events.length} TAGGED`],
    ];
    metadata.forEach(([label, value], index) => {
      const metadataX = 14 + index * (metadataWidth + 4);
      doc.setFillColor(...mixColour(coverPalette.panel, coverPalette.dark, .2));
      doc.setDrawColor(...mixColour(coverPalette.secondary, coverPalette.dark, .35));
      doc.roundedRect(metadataX, metadataY, metadataWidth, 25, 3, 3, "FD");
      doc.setTextColor(...coverPalette.accent);
      doc.setFontSize(6.5);
      doc.text(label, metadataX + metadataWidth / 2, metadataY + 8, { align: "center" });
      doc.setTextColor(245, 248, 246);
      doc.setFontSize(8.2);
      doc.text(value, metadataX + metadataWidth / 2, metadataY + 17, { align: "center", maxWidth: metadataWidth - 6 });
    });

    doc.setTextColor(...mixColour(coverPalette.secondary, [255, 255, 255], .25));
    doc.setFontSize(7.2);
    doc.text("EVIDENCE-LED ANALYSIS  /  COACHING CONTEXT REMAINS ESSENTIAL", pageWidth / 2, pageHeight - 22, { align: "center" });
    doc.setTextColor(...coverPalette.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("PREPARED WITH RUGBY ANALYSIS SUITE", pageWidth / 2, pageHeight - 15, { align: "center" });

    doc.addPage();
    y = 18;

    // Report header
    doc.setFillColor(2, 7, 13);
    doc.rect(0, 0, pageWidth, 38, "F");
    doc.setFillColor(126, 217, 87);
    doc.rect(0, 37, pageWidth, 1.5, "F");

    try {
      if (logoImage && logoImage.complete && logoImage.naturalWidth > 0) {
        doc.addImage(logoImage, "PNG", margin, 7, 22, 22);
      }
    } catch (_) {}

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RUGBY PERFORMANCE REPORT", margin + 28, 15);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    doc.text(title, margin + 28, 25);

    y = 48;
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${competition || "MATCH REVIEW"}  /  ${events.length} EVENTS LOGGED  /  ${rawVideoName || "NO FOOTAGE LINKED"}`.toUpperCase(), margin, y);
    y += 8;

    addSection("KEY STATISTICAL TAKEAWAYS");
    if (hasRecordedScore) {
      const marginValue = Math.abs(teamScoreValue - oppositionScoreValue);
      addParagraph(`${teamScoreValue}-${oppositionScoreValue}${marginValue ? ` • ${marginValue}-point margin` : ""}. Five concise, evidence-led performance pointers for coaches.`);
    } else {
      addParagraph("Five concise, evidence-led performance pointers. Add the final score to provide match context.");
    }
    const orderedTakeaways = resultType === "loss"
      ? [...matchWorkOns.map((metric) => ({ metric, tone: "risk" as const })), ...matchStrengths.map((metric) => ({ metric, tone: "positive" as const }))]
      : resultType === "win"
        ? [...matchStrengths.map((metric) => ({ metric, tone: "positive" as const })), ...matchWorkOns.map((metric) => ({ metric, tone: "risk" as const }))]
        : [...matchStrengths.map((metric) => ({ metric, tone: "positive" as const })), ...matchWorkOns.map((metric) => ({ metric, tone: "risk" as const }))].sort((a, b) => b.metric.priority - a.metric.priority);
    const takeawayItems = orderedTakeaways.slice(0, 5);
    if (takeawayItems.length) {
      takeawayItems.forEach(({ metric, tone }, index) => addInsightCard(
        index + 1,
        `${tone === "positive" ? "POSITIVE" : "COST"}  •  ${metric.label}`,
        `${metric.display}.`,
        tone,
      ));
    } else {
      addInsightCard(1, "INSUFFICIENT SAMPLE", "The available match sample did not contain enough classified events to establish reliable benchmark comparisons.", "risk");
    }
    addSection("ADDITIONAL CONTRIBUTING FACTORS");
    if (matchWorkOns.length) {
      matchWorkOns.forEach((metric, index) => {
        addContributingFactor(
          index + 1,
          metric.label,
          contributingFactorExplanation(metric.label),
        );
      });
    } else {
      addParagraph("No additional statistically material development factors were identified in the logged sample.");
    }

    addSection("SET PIECE");
    addLineWithClip("Lineouts Won", lineoutsWon, "Lineout Won");
    addLineWithClip("Lineouts Lost", lineoutsLost, "Lineout Lost");
    addLine("Lineout Success", `${lineoutValue.toFixed(1)}%`);
    addLineWithClip("Scrums Won", scrumsWon, "Scrum Won");
    addLineWithClip("Scrums Lost", scrumsLost, "Scrum Lost");
    addLine("Scrum Success", `${scrumValue.toFixed(1)}%`);

    addSection("KICKING");
    addLine("Contestable Kicks", contestableKicks.length);
    addLineWithClip("Kick Regained", kickRegained, "Contestable Kick Regained");
    addLine("Contestable Kick Effectiveness", `${percent(kickRegained, contestableKicks.length)}%`);
    addLine("Exit Kicks", exitKicks.length);
    addLineWithClip("Good Exits", goodExits, "Successful Exit");
    addLine("Exit Success", `${exitValue.toFixed(1)}%`);

    addSection("SCORING & ATTACK OUTCOMES");
    addLine("Tries Scored", triesScored);
    addLineWithClip("Tries Conceded", triesConceded, "Try Conceded");
    addLine("Try Differential", triesScored - triesConceded);
    addLine("3-Point Scores Taken", threePointScores);
    addLine("Total Attacks", totalAttacks);
    addLine("Successful Attacks", successfulAttacks);
    addLine("Attack Efficiency", `${attackEfficiencyValue.toFixed(1)}%`);

    addSection("ATTACK TYPE BREAKDOWN");
    const reportAttackTypes = ["Scrum", "Lineout", "Maul", ...attackTypes];
    reportAttackTypes.forEach((type) => {
      const typeAttacks = type === "Scrum"
        ? attacks.filter((event) => event.launchType === "Scrum" || event.attackType === "Scrum")
        : type === "Lineout"
          ? lineoutLaunchEvents
          : type === "Maul"
            ? events.filter((event) => event.category === "maul" || event.launchType === "Maul" || event.attackType === "Maul")
            : attacks.filter((event) => event.attackType === type);
      const typeSuccessful = typeAttacks.filter(isSuccessfulAttackEvent).length;
      addLine(type, `${typeAttacks.length} attempts (${typeSuccessful} successful) - ${percent(typeSuccessful, typeAttacks.length)}%`);
      if (type === "Lineout") {
        const lineoutStyles = [
          { label: "Down and Out", count: downAndOutLineoutLaunches, events: lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Down and Out" || event.lineoutLaunch === "Normal") },
          { label: "Off the Top (OT)", count: offTopLineoutLaunches, events: lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Off the Top") },
          { label: "Maul", count: lineoutMaulLaunches, events: lineoutLaunchEvents.filter((event) => event.lineoutLaunch === "Maul") },
        ];
        lineoutStyles.forEach((style) => addLine(`  ${style.label}`, `${style.count} attempts (${style.events.filter(isSuccessfulAttackEvent).length} successful)`));
      }
    });
    addParagraph("Down and Out, Off the Top (OT), and Maul reconcile to the Lineout total. Lineout mauls are also represented in the overall Maul row so coaches can assess maul productivity separately.");

    addSection("BALL SECURITY & LOSS PROFILE");
    addLineWithClip("Ball Losses", ballLosses, "Ball Lost");
    addLine("Ball Loss Rate", `${ballLossRateValue.toFixed(1)}%`);
    if (Object.keys(ballLostReasonBreakdown).length) {
      Object.entries(ballLostReasonBreakdown).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => addLine(reason, count));
    } else {
      addLine("Ball Loss Reasons", "None logged");
    }

    addSection("PHASE PERFORMANCE");
    addLine("Average Phases Per Attack", average(attacks.map((event) => event.phases || 0)));
    addLine("Gainline Won", `${gainlineWon} / ${allAttackPhases.length}`);
    addLine("Gainline Success", `${gainlineValue.toFixed(1)}%`);
    addLine("Quick Rucks", `${quickRucks} / ${allAttackPhases.length}`);
    addLine("Quick Ball Rate", `${quickBallValue.toFixed(1)}%`);

    addSection("GOLD ZONE CONVERSION");
    addLineWithClip("Entries", goldZoneEntries.length, "Gold Zone Entries");
    addLine("Successful Entries", successfulGoldZoneEntries.length);
    addLine("Gold Zone Efficiency", `${goldZoneValue.toFixed(1)}%`);
    addLine("Points Generated", goldZonePoints);

    addSection("DEFENSIVE OUTCOMES");
    addLineWithClip("Tackles Made", tackleMade, "Tackle Made");
    addLineWithClip("Tackles Missed", tackleMissed, "Tackle Missed");
    addLine("Tackle Completion", `${tackleCompletionValue.toFixed(1)}%`);
    addLineWithClip("Ball Won", ballWon, "Ball Won");
    addLine("Ball Won - Ripped Ball", rippedBalls);
    addLine("Ball Won - Opposition Kick", oppKicks);
    addLineWithClip("Opponent Lineout Stolen", opponentLineoutsStolen, "Opponent Lineout Stolen");
    addLineWithClip("Opponent Scrum Stolen", opponentScrumsStolen, "Opponent Scrum Stolen");

    addSection("DISCIPLINE - PENALTIES CONCEDED");
    addLineWithClip("Total Penalties Conceded", penaltyConcededEvents.length, "Penalty Conceded");
    if (penaltyConcededEvents.length && penaltyHotspot) {
      addParagraph(`The highest concentration was ${penaltyHotspot.zone}: ${penaltyHotspot.penaltiesConceded} of ${penaltyConcededEvents.length} penalties (${percent(penaltyHotspot.penaltiesConceded, penaltyConcededEvents.length)}%).`);
      addPenaltyHeatmap();
      addParagraph("Penalty types recorded");
      Object.entries(penaltyByReason).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => addLine(reason, count));
    } else {
      addParagraph("No penalties conceded were tagged for this match.");
    }

    addSection("POSSESSION & TERRITORY");
    addShareBar("Estimated possession", matchName || "Team", possessionValue, opposition || "Opposition", oppositionPossessionValue);
    addShareBar("Territory", "Opposition half", territoryValue, "Own half / midfield", ownTerritoryValue);
    addParagraph("Possession and territory are time-weighted estimates derived from the intervals between consecutive tagged events. They become more representative when possession changes and pitch zones are tagged consistently throughout the match.");

    addSection("MATCH EVENT HEATMAP - WHERE THE GAME WAS PLAYED");
    addParagraph(`${eventHotspot.zone} contained the highest concentration with ${eventHotspot.total} of ${events.length} tagged events (${percent(eventHotspot.total, events.length)}%). The pitch below shows the complete event distribution from own 22 to opposition 22.`);
    addEventHeatmap();

    addSection("MATCH MOMENTUM");
    addParagraph("This trend reflects the cumulative balance of positive and negative logged outcomes. It highlights periods for contextual video review rather than proving causation.");
    addMomentumGraph();

    addSection("VIDEO REVIEW LIBRARY");
    if (videoReviewLinks.length) {
      addParagraph("The buttons below open every compilation included in the customer package. Matching PLAY CLIP buttons also appear beside relevant statistics throughout the report.");
      videoReviewLinks.forEach((video) => addVideoButton(video.label, video.fileName, video.url));
    } else {
      addParagraph("No videos are linked yet. Generate the required compilations and export this report again to add clickable review buttons.");
    }

    addFooter();
    const totalPages = doc.getNumberOfPages();
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(`PAGE ${pageNumber - 1} OF ${totalPages - 1}`, pageWidth / 2, pageHeight - 8, { align: "center" });
    }
    if (coachPackage) {
      if (!compilationOutputs.length) {
        notify("Videos Required", "Generate the compilation videos before exporting the Coach Package.", "warning");
        return;
      }
      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
      const videos = compilationOutputs.map((path) => path.split(/[\\/]/).pop() || path);
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} Video Library</title><style>*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,rgba(126,217,87,.13),transparent 32%),#02070d;color:#fff;font-family:Arial,sans-serif}header,main{max-width:1100px;margin:auto;padding:34px 24px}header{display:flex;gap:20px;align-items:center;border-bottom:2px solid #7ed957}header img{width:70px;height:70px;object-fit:contain;border-radius:14px}h1{font-size:34px;margin:4px 0}.score{color:#7ed957;font-size:23px;font-weight:900}.intro{margin:0 0 24px;color:#9fb0a7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}.card{background:#07120f;border:1px solid #1f3d2a;border-radius:18px;padding:18px}.card h3{margin:0 0 14px}video{width:100%;border-radius:12px;background:#000}.muted{margin:0;color:#9fb0a7;font-size:12px;letter-spacing:.08em;text-transform:uppercase}</style></head><body><header>${teamLogoDataUrl ? `<img src="${teamLogoDataUrl}" alt="Team logo">` : ""}<div><p class="muted">Rugby Analysis Suite • Video Review Library</p><h1>${escapeHtml(matchName || "Team")} vs ${escapeHtml(opposition || "Opposition")}</h1><div class="score">${escapeHtml(teamScore || "-")} - ${escapeHtml(oppositionScore || "-")}</div></div></header><main><p class="intro">Select a compilation below to review the match footage. The complete statistical evaluation is provided in Match-Report.pdf.</p><div class="grid">${videos.map((file) => `<article class="card"><h3>${escapeHtml(titleCase(file.replace(/-compilation\.mp4$/i, "").replace(/-/g, " ")))}</h3><video controls preload="metadata" src="Video%20Clips/${encodeURIComponent(file)}"></video></article>`).join("")}</div></main></body></html>`;
      const result = await window.electronAPI.exportCoachPackage({ pdfBase64: doc.output("datauristring").split(",")[1], html, videoPaths: compilationOutputs, suggestedName: safeFileName(title) });
      notify(result.success ? "Coach Package Ready" : "Package Export Failed", result.success ? `Report and ${videos.length} video(s) exported together.` : result.message || "The package could not be created.", result.success ? "success" : "error");
    } else {
      doc.save(`${safeFileName(title)}-stat-report.pdf`);
      notify("Stat Report Exported", `${events.length} events exported into the PDF report.`, "success");
    }
  }

  function sendToCompilationVideos() {
    if (!events.length) {
      notify("No Events", "Tag events before sending the analysis to the Compilation Tool.", "warning");
      return;
    }
    if (!rawVideoPath) {
      notify("No Match Footage", "Load the same raw match footage before sending to the Compilation Tool.", "warning");
      return;
    }
    setGeneratedClips([]);
    setStatusMessage(`${events.length} events ready for compilation videos.`);
    setView("compilations");
    notify("Events Sent", `${events.length} events were sent to the Compilation Tool.`, "success");
  }

  function parseAnalysisTextFile(textContent: string, fileName: string) {
    const lines = textContent.split(/\r?\n/);
    const eventLogIndex = lines.findIndex((line) => line.trim().toUpperCase() === "EVENT LOG");
    if (eventLogIndex === -1) {
      notify("Import Failed", "No EVENT LOG section found in this TXT file.", "error");
      return;
    }

    const fileBase = fileName.replace(/\.[^/.]+$/, "");
    let importedMatchName = fileBase;
    let importedOpposition = "";
    if (fileBase.toLowerCase().includes(" vs ")) {
      const [home, away] = fileBase.split(/\s+vs\s+/i);
      importedMatchName = home.trim();
      importedOpposition = away.trim();
    }

    const competitionLine = lines.find((line) => line.startsWith("Competition:"));
    const importedCompetition = competitionLine ? competitionLine.replace("Competition:", "").trim() : "";
    const importedEvents: EventLog[] = [];

    lines.slice(eventLogIndex + 1).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || !/^\d{1,2}:\d{2}/.test(trimmed)) return;
      const parts = trimmed.split("|").map((part) => part.trim());
      const time = parts[0];
      const eventName = parts[1] || "";
      const zone = parts[2] || "Midfield";
      const reasonPart = parts.find((part) => part.startsWith("Reason:"));
      const notePart = parts.find((part) => part.startsWith("Note:"));
      const baseEvent = { id: Date.now() + index, time, seconds: parseTimeToSeconds(time), zone, reason: reasonPart?.replace("Reason:", "").trim(), note: notePart?.replace("Note:", "").trim() };

      if (eventName.endsWith("Attack")) {
        const phasePart = parts.find((part) => part.includes("phases"));
        const outcome = parts.find((part, idx) => idx > 2 && !part.includes("phases") && !part.startsWith("Reason:") && !part.startsWith("Note:"));
        importedEvents.push({ ...baseEvent, category: "attack", event: eventName, attackType: eventName.replace(" Attack", ""), phases: phasePart ? Number(phasePart.match(/\d+/)?.[0] || 0) : 0, outcome: outcome || "Ball Lost" });
        return;
      }
      if (eventName === "Kick Event") {
        importedEvents.push({ ...baseEvent, category: "kick", event: "Kick Event", outcome: parts[3] || "Kick Lost" });
        return;
      }
      importedEvents.push({ ...baseEvent, category: "set-piece", event: eventName });
    });

    if (!importedEvents.length) {
      notify("Import Failed", "No events could be imported from this TXT file.", "error");
      return;
    }

    setMatchName(importedMatchName || "Imported Match");
    setOpposition(importedOpposition);
    setCompetition(importedCompetition === "Not specified" ? "" : importedCompetition);
    setEvents(importedEvents);
    setGeneratedClips([]);
    setCompilationOutputs([]);
    setStatusMessage(`${importedEvents.length} events imported.`);
    notify("Analysis Imported", `${importedEvents.length} events loaded from ${fileName}.`, "success");
  }

  function importAnalysisTXT(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parseAnalysisTextFile(String(reader.result || ""), file.name);
    reader.readAsText(file);
  }

  function toggleClipType(type: string) {
    setSelectedClipTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]));
  }

  function generateClipList() {
    if (!events.length) {
      notify("No Analysis Events", "Analyse the match or import analysis before generating compilations.", "warning");
      return;
    }
    if (!selectedClipTypes.length) {
      notify("No Types Selected", "Choose at least one compilation type.", "warning");
      return;
    }

    const clipGroups = selectedClipTypes
      .map((type) => {
        const ruckSpeed = ruckSpeedForClipType(type);
        const rawClips = ruckSpeed
          ? events.flatMap((event) => (event.phasePerformance || []).flatMap((phase, phaseIndex) => {
              if (phase.ruckSpeed !== ruckSpeed || typeof phase.seconds !== "number") return [];
              const rawStart = Math.max(0, phase.seconds - RUCK_CLIP_BEFORE_SECONDS);
              return [{
                id: event.id + phaseIndex,
                label: `${ruckSpeed} Ruck • ${phase.zone || event.zone} • Phase ${phaseIndex + 1}`,
                originalTime: formatTime(phase.seconds),
                rawStart,
                rawEnd: Math.max(rawStart + 1, phase.seconds + RUCK_CLIP_AFTER_SECONDS),
              }];
            }))
          : events
          .filter((event) => matchesClipType(event, type))
          .slice()
          .reverse()
          .map((event) => {
            const storedAttackStart = event.attackStartSeconds;
            const usesFullAttack = ["Good Attacking Sequences", "Scrum Launch", "Lineout Launch", "Try Scored"].includes(type)
              && typeof storedAttackStart === "number";
            const isCoachingMoment = event.coachingMoment === true;
            const rawStart = usesFullAttack
              ? Math.max(0, storedAttackStart - 2)
              : Math.max(0, event.seconds - (isCoachingMoment ? COACHING_MOMENT_CLIP_BEFORE_SECONDS : type === "Try Conceded" ? TRY_CONCEDED_CLIP_BEFORE_SECONDS : selectedClipPadding.before));
            const rawEnd = Math.max(rawStart + 1, event.seconds + (isCoachingMoment ? COACHING_MOMENT_CLIP_AFTER_SECONDS : type === "Try Conceded" ? TRY_CONCEDED_CLIP_AFTER_SECONDS : selectedClipPadding.after));
            return { id: event.id, label: clipLabel(event), originalTime: event.time, rawStart, rawEnd, subtitle: event.coachingMoment ? event.note : undefined };
          })
          .sort((a, b) => a.rawStart - b.rawStart);
        const clips = type === "Tackle Missed"
          ? rawClips.reduce<typeof rawClips>((merged, clip) => {
              const previous = merged[merged.length - 1];
              if (previous && clip.rawStart - previous.rawStart <= 2) {
                previous.rawEnd = Math.max(previous.rawEnd, clip.rawEnd);
                return merged;
              }
              merged.push({ ...clip });
              return merged;
            }, [])
          : rawClips;
        return { type, clips };
      })
      .filter((group) => group.clips.length > 0);

    if (!clipGroups.length) {
      notify("No Matching Events", "No events match your selected compilation types.", "warning");
      return;
    }

    setGeneratedClips(clipGroups);
    setStatusMessage(`${clipGroups.length} compilation groups previewed.`);
    notify("Compilation Preview Ready", `${clipGroups.reduce((total, group) => total + group.clips.length, 0)} clips found using ${selectedClipPadding.before}s before / ${selectedClipPadding.after}s after.`, "success");
  }

  async function generateTestClip() {
    if (!rawVideoPath) {
      notify("No Match Footage", "Choose match footage before generating clips.", "warning");
      return;
    }
    if (!generatedClips.length || !generatedClips[0].clips.length) {
      notify("No Preview", "Build a compilation preview first.", "warning");
      return;
    }

    const firstClip = generatedClips[0].clips[0];
    setIsGenerating(true);
    setStatusMessage("Generating test clip...");
    const result = await window.electronAPI.generateTestClip({ videoPath: rawVideoPath, start: firstClip.rawStart, duration: Math.max(1, firstClip.rawEnd - firstClip.rawStart) });
    setIsGenerating(false);

    if (result.success) {
      setStatusMessage("Test clip generated successfully.");
      notify("Test Clip Created", result.outputPath || "Test clip saved.", "success");
    } else {
      setStatusMessage("Test clip failed.");
      notify("Test Clip Failed", result.message || "Could not generate test clip.", "error");
    }
  }

  async function generateFullCompilation() {
    if (!rawVideoPath) {
      notify("No Match Footage", "Choose match footage before generating compilations.", "warning");
      return;
    }
    if (!generatedClips.length) {
      notify("No Preview", "Build a compilation preview first.", "warning");
      return;
    }

    const orderedGroups = generatedClips.map((group) => ({ type: group.type, clips: group.clips.map((clip) => ({ rawStart: clip.rawStart, rawEnd: clip.rawEnd, subtitle: clip.subtitle })) }));
    setIsGeneratingCompilation(true);
    setStatusMessage("Generating compilation videos...");

    try {
      const result = await window.electronAPI.generateCompilations({
        videoPath: rawVideoPath,
        groups: orderedGroups,
        variant: `${selectedClipPadding.before}s-before-${selectedClipPadding.after}s-after`,
      });
      if (result.success) {
        setCompilationOutputs((previous) => {
          const outputsByName = new Map(previous.map((outputPath) => [outputPath.split(/[\\/]/).pop() || outputPath, outputPath]));
          (result.outputs || []).forEach((outputPath) => outputsByName.set(outputPath.split(/[\\/]/).pop() || outputPath, outputPath));
          return [...outputsByName.values()];
        });
        setStatusMessage(`${result.outputs?.length || 0} compilation videos generated.`);
        notify("Compilation Videos Created", `${result.outputs?.length || 0} MP4 files exported successfully.`, "success");
      } else {
        setStatusMessage("Compilation generation failed.");
        notify("Generation Failed", result.message || "Compilation failed.", "error");
      }
    } catch (error) {
      setStatusMessage("Compilation generation failed.");
      notify("Generation Failed", String(error), "error");
    }
    setIsGeneratingCompilation(false);
  }

  function openEditEvent(event: EventLog) {
    const attackType = attackTypeFromEvent(event);
    const outcome = event.outcome || "";
    const reason = firstReasonOrBlank(event.category, event.event, outcome, event.reason || "");

    setEditingEvent({
      id: event.id,
      category: event.category,
      event: event.event,
      attackType,
      outcome,
      reason,
      zone: event.zone || selectedZone,
      note: event.note || "",
    });
  }

  function saveEditedEvent() {
    if (!editingEvent) return;

    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== editingEvent.id) return event;

        const baseUpdate = {
          ...event,
          zone: editingEvent.zone || event.zone,
          note: editingEvent.note || undefined,
        };

        if (editingEvent.category === "attack") {
          const attackType = editingEvent.attackType || attackTypeFromEvent(event);
          const outcome = editingEvent.outcome || event.outcome || "Ball Lost";
          const allowedReasons = reasonOptionsForEdit("attack", `${attackType} Attack`, outcome);
          const reason = allowedReasons.length ? firstReasonOrBlank("attack", `${attackType} Attack`, outcome, editingEvent.reason) : "";

          return {
            ...baseUpdate,
            category: "attack",
            event: `${attackType} Attack`,
            attackType,
            outcome,
            reason: reason || undefined,
          };
        }

        if (editingEvent.category === "defence") {
          const eventName = editingEvent.event || event.event || "Ball Won";
          const allowedReasons = reasonOptionsForEdit("defence", eventName, eventName);
          const reason = allowedReasons.length ? firstReasonOrBlank("defence", eventName, eventName, editingEvent.reason) : "";

          return {
            ...baseUpdate,
            category: "defence",
            event: eventName,
            outcome: eventName,
            reason: reason || undefined,
          };
        }

        if (editingEvent.category === "kick") {
          const outcome = editingEvent.outcome || event.outcome || "Kick Regained";
          return {
            ...baseUpdate,
            category: "kick",
            event: "Kick Event",
            outcome,
            reason: undefined,
          };
        }

        if (editingEvent.category === "set-piece") {
          const eventName = editingEvent.event || event.event || "Lineout Won";
          return {
            ...baseUpdate,
            category: "set-piece",
            event: eventName,
            outcome: undefined,
            reason: undefined,
          };
        }

        if (editingEvent.category === "maul") {
          const outcome = editingEvent.outcome || event.outcome || "Maul Retained";
          return {
            ...baseUpdate,
            category: "maul",
            event: "Maul",
            outcome,
            reason: undefined,
          };
        }

        return baseUpdate;
      })
    );

    setEditingEvent(null);
    setGeneratedClips([]);
    setCompilationOutputs([]);
    notify("Event Updated", "The event was updated successfully.", "success");
  }

  function removeEventOutcome() {
    if (!editingEvent) return;
    setEvents((prev) => prev.map((event) => (event.id === editingEvent.id ? { ...event, outcome: undefined, reason: undefined } : event)));
    setEditingEvent(null);
    setGeneratedClips([]);
    setCompilationOutputs([]);
    notify("Outcome Removed", "The event outcome was removed.", "success");
  }

  function deleteEvent(id: number) {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    setGeneratedClips([]);
    setCompilationOutputs([]);
    notify("Event Deleted", "The event was removed from the log.", "info");
  }

  function Topbar({ moduleTitle }: { moduleTitle?: string }) {
    return (
      <header className="ras-topbar">
        <button className="logo-wrap" onClick={() => setView("home")} aria-label="Home">
          <img src={logoSrc} alt="Rugby Analysis Suite" />
        </button>
        <div className="topbar-brand">
          <h1>Rugby Analysis Suite</h1>
          <p>{moduleTitle || "Professional Performance Platform"}</p>
        </div>
        <div className="topbar-actions">
          <button className="support-btn" onClick={() => setShowShortcutGuide(true)}>Shortcuts</button>
          <button className="analyst-chip" onClick={() => setProfileSelected(false)}><span>{analystProfile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{analystProfile.name}</strong><small>{activeAnalystId === "jd" ? "Owner" : "Analyst"}</small></div></button>
          <button className="support-btn" onClick={() => setView("settings")}>Settings</button>
          <button className="support-btn" onClick={() => setView("support")}>Support</button>
          <span className="version-pill">v1.4.0</span>
        </div>
      </header>
    );
  }

  function NoticeToast() {
    if (!notice) return null;
    return (
      <div className={`notice-toast ${notice.type}${noticeClosing ? " closing" : ""}`} role="status" aria-live="polite">
        <button className="notice-close" onClick={closeNotice} aria-label="Dismiss notification">×</button>
        <span className="notice-icon">{notice.type === "success" ? "✓" : notice.type === "warning" ? "!" : notice.type === "error" ? "×" : "i"}</span>
        <div>
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
        </div>
        <div className="notice-progress" aria-hidden="true" />
      </div>
    );
  }

  function Home() {
    return (
      <main className="ras-shell home-shell">
        <div className="home-hero-bg" style={{ backgroundImage: `url("${heroBgSrc}")` }} />
        <div className="home-hero-overlay" />
        <div className="grid-bg" />
        <Topbar />
        <section className="home-layout premium-home-layout">
          <div className="home-copy premium-home-copy">
            <p className="home-kicker">{analystProfile.name ? `Welcome back, ${analystProfile.name}` : "Professional Performance Platform"}</p>
            <h2 className="home-title">Rugby<br /><span>Analysis</span><br />Suite</h2>
            <p className="home-subtitle">Analyse matches, create coaching clips and prepare better rugby reviews from one professional platform.</p>
            {(matchName || opposition || events.length) && <button className="continue-session-card" onClick={() => setView("analysis")}><span>Continue Analysis</span><strong>{matchTitle}</strong><small>{events.length} events tagged{lastSessionSaved ? ` • saved ${new Date(lastSessionSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</small><i>→</i></button>}
            <div className="home-badges">
              <span>Match Review</span>
              <span>Video Workflow</span>
              <span>Coach Reports</span>
            </div>
          </div>
          <div className="module-stack premium-module-stack">
            <ModuleCard number="01" title="Match Analysis" status="Available" description="Tag attack, defence, kicking, set piece and maul events. Export professional coach reports." action="Open Module →" onClick={() => setView("analysis")} />
            <ModuleCard number="02" title="Auto Clip Creator" status="Available" description="Turn tagged moments into organised MP4 coaching compilations from the raw match footage." action="Launch Module →" onClick={() => setView("compilations")} highlight />
            <ModuleCard number="03" title="AI Match Analysis" status="Beta" description="Scan match footage, review AI-detected rugby events and send approved moments into the full analysis workflow." action="Open Beta →" onClick={() => setView("plays")} />
            <ModuleCard number="04" title="Opposition Analysis" status="Available" description="Link opposition clips to animated overhead tactical boards and your coaching response." action="Build Tactical Review →" onClick={() => setView("opposition")} />
          </div>
        </section>
        <NoticeToast />
      </main>
    );
  }

  function ModuleCard(props: { number: string; title: string; status: string; description: string; action: string; onClick: () => void; highlight?: boolean }) {
    return (
      <button className={`module-card ${props.highlight ? "highlight" : ""}`} onClick={props.onClick}>
        <div className="module-card-top">
          <span className="module-number">{props.number}</span>
          <span className={props.status === "Available" ? "status available" : props.status === "Beta" ? "status beta" : "status soon"}>{props.status}</span>
        </div>
        <h3>{props.title}</h3>
        <p>{props.description}</p>
        <strong>{props.action}</strong>
      </button>
    );
  }

  function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
    return (
      <label className="select-field">
        <span>{label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
      </label>
    );
  }

  function AnalysisPage() {
    const possessionTotal = matchInsights.attackSeconds + matchInsights.defenceSeconds;
    const attackPossession = possessionTotal ? Math.round((matchInsights.attackSeconds / possessionTotal) * 100) : 0;
    const defencePossession = possessionTotal ? 100 - attackPossession : 0;
    const maxHeat = Math.max(1, ...matchInsights.heat.map((item) => item.count));
    const totalHeatEvents = matchInsights.heat.reduce((total, item) => total + item.count, 0);
    const hottestZone = matchInsights.heat.reduce((hottest, item) => item.count > hottest.count ? item : hottest, matchInsights.heat[0]);
    const pitchHeat = [...matchInsights.heat].reverse();
    const lastTimelineSecond = Math.max(1, ...(matchInsights.ordered.map((event) => event.seconds)));
    const momentumValues = matchInsights.points.map((point) => point.value);
    const momentumMin = Math.min(-1, ...momentumValues);
    const momentumMax = Math.max(1, ...momentumValues);
    const momentumPath = matchInsights.points.map((point, index) => {
      const x = matchInsights.points.length <= 1 ? 0 : (index / (matchInsights.points.length - 1)) * 100;
      const y = 36 - ((point.value - momentumMin) / (momentumMax - momentumMin)) * 32;
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return (
      <main className="ras-shell analysis-shell">
        <div className="grid-bg" />
        <Topbar moduleTitle="Match Analysis" />

        <section className="analysis-toolbar compact-toolbar workflow-toolbar">
          <button className="home-btn" onClick={() => setView("home")}>← Home</button>
          <button className="secondary-btn" onClick={() => projectInputRef.current?.click()}>Open Match</button>
          <input ref={projectInputRef} type="file" hidden accept=".ras,application/json" onChange={(event) => openProject(event.target.files?.[0])} />
          <button className="primary-btn" onClick={saveProject}>Save Match</button>
          <button className="secondary-btn cloud-upload-btn" disabled={!rawVideoPath || isCloudUploading || Boolean(cloudObjectKey)} onClick={() => cloudConfigured ? uploadCurrentVideoToCloud() : setShowCloudSetup(true)}>
            {cloudObjectKey ? "Cloud Verified" : isCloudUploading ? `Uploading ${cloudUploadProgress}%` : cloudConfigured ? "Store Footage in Cloud" : "Connect Cloud Storage"}
          </button>
          <button className="danger-btn" onClick={clearWorkspace}>Clear Match</button>
          <button className="secondary-btn" onClick={() => exportPDFReport()}>Export PDF</button>
          <button className="secondary-btn" onClick={() => setShowMatchCheck(true)}>Match Check</button>
          <button className="primary-btn" onClick={() => exportPDFReport(false, true)}>Export Coach Package</button>
          <button className="primary-btn wide-action" onClick={sendToCompilationVideos}>Send Events to Compilation Tool</button>
        </section>

        <section className="match-setup">
          <input placeholder="Your Team" value={matchName} onChange={(event) => setMatchName(event.target.value)} />
          <input placeholder="Opposition" value={opposition} onChange={(event) => setOpposition(event.target.value)} />
          <input placeholder="Competition" value={competition} onChange={(event) => setCompetition(event.target.value)} />
          <div className="score-setup">
            <input aria-label="Your team score" type="number" min="0" placeholder="Your score" value={teamScore} onChange={(event) => setTeamScore(event.target.value)} />
            <span>-</span>
            <input aria-label="Opposition score" type="number" min="0" placeholder="Opp score" value={oppositionScore} onChange={(event) => setOppositionScore(event.target.value)} />
          </div>
          <label className="team-logo-input">
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => loadTeamLogo(event.target.files?.[0])} />
            {teamLogoDataUrl ? <img src={teamLogoDataUrl} alt="Team logo preview" /> : <span>+</span>}
            <div><strong>{teamLogoDataUrl ? "Team logo ready" : "Add team logo"}</strong><small>Used on the report cover and customer package</small></div>
            {teamLogoDataUrl && <button type="button" onClick={(event) => { event.preventDefault(); setTeamLogoDataUrl(""); }}>Remove</button>}
          </label>
        </section>

        <section className="analysis-workspace">
          <div className="analysis-left">
            <VideoPlayer
              videoRef={videoRef}
              rawVideoPath={rawVideoPath}
              playbackVideoUrl={playbackVideoUrl}
              rawVideoUrl={rawVideoUrl}
              rawVideoName={rawVideoName}
              isOptimisingVideo={isOptimisingVideo}
              playbackRate={playbackRate}
              onLoadVideo={chooseMatchFootage}
              onError={handleVideoPlaybackError}
              onSeek={seekVideo}
              onSpeedChange={changePlaybackRate}
            />
          </div>

          <div className="analysis-right">
            <section className="panel controls-panel">
              <div className="control-toolbar">
                <SelectField label="Panel Switching" value={panelSwitching} onChange={(value) => setPanelSwitching(value as PanelSwitching)}>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </SelectField>
              </div>

              <div className="quick-zone-card">
                <div>
                  <p className="eyebrow">Quick Zone</p>
                  <h2>{selectedZone}</h2>
                </div>
                <div className="quick-zone-buttons">
                  {pitchZones.map((zone) => (
                    <button key={zone} type="button" className={selectedZone === zone ? "active" : ""} onClick={() => selectZone(zone)}>
                      {zone}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel-tabs">
                <button className={activePanel === "attack" ? "active" : ""} onClick={() => switchPanel("attack")}>Attack</button>
                <button className={activePanel === "defence" ? "active" : ""} onClick={() => switchPanel("defence")}>Defence</button>
              </div>

              {activePanel === "attack" ? <AttackControls /> : <DefenceControls />}
            </section>

          </div>
        </section>

        <section className="match-insights-grid">
          <article className="panel possession-card">
            <div className="section-head"><div><p className="eyebrow">Possession Clock</p><h2>{attackPossession}% Attack</h2></div><span>{defencePossession}% Defence</span></div>
            <div className="possession-bar"><i style={{ width: `${attackPossession}%` }} /><b style={{ width: `${defencePossession}%` }} /></div>
            <div className="possession-times"><span>Attack {formatTime(matchInsights.attackSeconds)}</span><span>Defence {formatTime(matchInsights.defenceSeconds)}</span></div>
          </article>
          <article className="panel territory-heat-card">
            <div className="section-head"><div><p className="eyebrow">Territory Heatmap</p><h2>Where the Match Was Played</h2></div><span>{totalHeatEvents} located events</span></div>
            <div className="heatmap-direction"><span>Own try line</span><b>Attacking direction <i>→</i></b><span>Opp try line</span></div>
            <div className="rugby-territory-map" aria-label="Territory event heatmap from own 22 to opposition 22">
              {pitchHeat.map((item) => {
                const percentage = totalHeatEvents ? Math.round((item.count / totalHeatEvents) * 100) : 0;
                return <div key={item.zone} className={`territory-zone ${hottestZone?.zone === item.zone && item.count ? "hot" : ""}`} style={{ "--heat": item.count / maxHeat } as React.CSSProperties}>
                  <span>{item.zone}</span><strong>{item.count}</strong><small>{percentage}% of events</small>
                </div>;
              })}
            </div>
            <div className="heatmap-summary">
              <span className="heatmap-pulse" />
              {totalHeatEvents ? <p><strong>Highest activity: {hottestZone.zone}</strong><small>{hottestZone.count} events concentrated in this area</small></p> : <p><strong>Waiting for field-position data</strong><small>The pitch will build as zones are logged.</small></p>}
            </div>
          </article>
          <article className="panel momentum-card">
            <div className="section-head"><div><p className="eyebrow">Momentum</p><h2>Match Control Trend</h2></div></div>
            {momentumPath ? <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Match momentum graph"><line x1="0" x2="100" y1="20" y2="20" /><path d={momentumPath} /></svg> : <div className="mini-empty">Log events to build momentum.</div>}
          </article>
          <article className="panel possession-timeline-card">
            <div className="section-head"><div><p className="eyebrow">Possession Timeline</p><h2>How the Match Flowed</h2></div><span>{matchInsights.segments.length} sequences</span></div>
            <div className="possession-timeline">{matchInsights.segments.length ? matchInsights.segments.map((segment, index) => <button key={`${segment.start}-${index}`} className={segment.mode} style={{ left: `${(segment.start / lastTimelineSecond) * 100}%`, width: `${Math.max(1.2, ((segment.end - segment.start) / lastTimelineSecond) * 100)}%` }} title={`${segment.mode} • ${segment.zone} • ${formatTime(segment.start)}`}>{segment.zone}</button>) : <div className="mini-empty">Possession sequences will appear here.</div>}</div>
            <div className="timeline-legend"><span><i className="attack" />Attack</span><span><i className="defence" />Defence</span></div>
          </article>
        </section>

        <section className="panel event-log-panel compact-log live-log analysis-event-log">
          <div className="panel-head log-head">
            <div><p className="eyebrow">Event Log</p><h2>{events.length} Tagged Events</h2></div>
            <button className="secondary-btn small undo-btn" onClick={undoLastEvent} disabled={!events.length}>↶ Undo Last Event</button>
          </div>
          {events.length === 0 ? <div className="empty-state">Load match footage and start tagging events.</div> : <EventLogList />}
        </section>
        {editingEvent && <EditEventModal />}
        {showMatchCheck && <div className="reliability-modal-backdrop"><section className="reliability-modal"><p className="eyebrow">Match Completion Check</p><h2>{completionChecks.filter((item) => item.passed).length} of {completionChecks.length} ready</h2><p>Complete these checks before generating a client-facing report or Coach Package.</p><div className="quality-list completion-list">{completionChecks.map((item) => <div className={item.passed ? "passed" : "pending"} key={item.label}><span>{item.passed ? "✓" : "!"}</span><p>{item.label}</p></div>)}</div><div className="modal-actions"><button className="primary-btn" onClick={() => setShowMatchCheck(false)}>Return to Match</button></div></section></div>}
        <NoticeToast />
      </main>
    );
  }

  function InlineZoneSelector({ label = "Current Zone" }: { label?: string }) {
    return (
      <div className="inline-zone-selector">
        <p className="phase-label">{label}</p>
        <div className="inline-zone-buttons">
          {pitchZones.map((zone) => <button key={zone} className={selectedZone === zone ? "active" : ""} onClick={() => selectZone(zone)}>{zone}</button>)}
        </div>
      </div>
    );
  }

  function AttackControls() {
    return (
      <div className="control-stack">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">Attack Panel</p>
            <h2>{attackActive ? `${currentAttackType} Attack Active` : "Start Attack"}</h2>
          </div>
          {attackActive && <span className="status available">{phaseCount} phases</span>}
        </div>

        <div className="coaching-moment-box">
          <p className="eyebrow">Quick Moment Tags • 10s Before / 5s After</p>
          <label className="coaching-moment-note">Coach subtitle (optional)<input maxLength={120} value={coachingMomentNote} onChange={(event) => setCoachingMomentNote(event.target.value)} placeholder="e.g. No counter-ruck or double action" /></label>
          <div className="button-grid two">
            <button onClick={() => addCoachingMoment("Good Attacking Moment", "attack")}>Good Attacking Moment</button>
            <button className="negative" onClick={() => addCoachingMoment("Bad Attacking Moment", "attack")}>Bad Attacking Moment</button>
          </div>
        </div>

        {attackActive ? (
          <>
            <div className="active-strip">
              <span>Type: {currentAttackType}</span><span>Zone: {attackStartZone}</span><span>Phases: {phaseCount}</span>
            </div>
            <button
              className={`positive-sequence-btn ${positiveAttackSequence ? "selected" : ""}`}
              onClick={() => setPositiveAttackSequence((marked) => !marked)}
            >
              {positiveAttackSequence ? "✓ Good Attacking Sequence Marked" : "☆ Mark as Good Attacking Sequence"}
            </button>
            <div className="active-action-tabs">
              <button className={attackAction === "phase" ? "active" : ""} onClick={() => setAttackAction("phase")}>Log Phase</button>
              <button className={attackAction === "finish" ? "active" : ""} onClick={() => setAttackAction("finish")}>Finish Attack</button>
              <button className={attackAction === "kick" ? "active" : ""} onClick={() => setAttackAction("kick")}>Kick</button>
            </div>

            {attackAction === "phase" && <div className="phase-performance-card">
              <div className="phase-performance-head">
                <div><p className="eyebrow">Phase {phaseCount + 1}</p><h3>Gainline &amp; Ruck Speed</h3></div>
                <span className={phaseZoneConfirmed ? "zone-confirmed" : "zone-unconfirmed"}>{phaseZoneConfirmed ? `${selectedZone} • Confirmed` : "Confirm field position"}</span>
              </div>
              <InlineZoneSelector label="Confirm Phase Zone" />
              <p className="phase-label">Gainline</p>
              <div className="phase-choice-grid gainline-choices">
                {(["Won", "Neutral", "Lost"] as GainlineResult[]).map((result) => { const action: KeybindAction = result === "Won" ? "gainlineWon" : result === "Neutral" ? "gainlineNeutral" : "gainlineLost"; return <button key={result} className={`${result.toLowerCase()} ${pendingGainline === result ? "selected" : ""}`} onClick={() => setPendingGainline(result)}>{result}<kbd>{keybinds[action]}</kbd></button>; })}
              </div>
              <p className="phase-label">Ruck Speed</p>
              <div className="phase-choice-grid ruck-choices">
                {(["Quick", "Average", "Slow"] as RuckSpeed[]).map((speed) => { const action: KeybindAction = speed === "Quick" ? "ruckQuick" : speed === "Average" ? "ruckAverage" : "ruckSlow"; return <button key={speed} className={`${speed.toLowerCase()} ${pendingRuckSpeed === speed ? "selected" : ""}`} onClick={() => tagRuckSpeed(speed)}>{speed}<kbd>{keybinds[action]}</kbd></button>; })}
              </div>
              <div className="phase-action-row">
                <button className="secondary-btn" disabled={!phaseCount} onClick={undoLastPhase}>Undo Last Phase <kbd>{keybinds.undoPhase}</kbd></button>
                <button className="complete-phase-btn" disabled={!pendingGainline || !pendingRuckSpeed || !phaseZoneConfirmed} onClick={() => completePhase()}>{phaseZoneConfirmed ? "Mark Ball Played" : "Confirm Zone First"} <kbd>{keybinds.completePhase}</kbd></button>
              </div>
              <p className="phase-label">Fast workflow: confirm the zone and gainline first, then press Quick, Average or Slow as the ball is played. That speed button records the phase immediately; Enter remains available as a fallback.</p>
            </div>}

            {attackAction === "finish" && <div className="logging-step-card">
              <button className="secondary-btn small back-step-btn" onClick={() => setAttackAction("phase")}>← Back to Phase</button>
              <div className="button-grid two">
                <button onClick={() => finishAttack("Penalty Won")}>Penalty Won</button>
                <button onClick={() => finishAttack("Try Scored")}>Try Scored</button>
                <button onClick={() => finishAttack("3 Points Taken")}>3 Points Taken</button>
                <button onClick={() => finishAttack("Held Up – Retain Ball")}>Held Up – Retain</button>
              </div>
              <div className="reason-row">
                <label>Ball Lost Reason<select value={ballLostReason} onChange={(event) => setBallLostReason(event.target.value)}>{ballLostReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                <button className="danger-btn" onClick={() => finishAttack("Ball Lost", ballLostReason)}>Ball Lost</button>
              </div>
              <div className="reason-row">
                <label>Penalty Conceded Reason<select value={penaltyConcededReason} onChange={(event) => setPenaltyConcededReason(event.target.value)}>{penaltyConcededReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                <button className="danger-btn" onClick={() => finishAttack("Penalty Conceded", penaltyConcededReason)}>Penalty Conceded</button>
              </div>
            </div>}

            {attackAction === "kick" && <div className="logging-step-card">
              <button className="secondary-btn small back-step-btn" onClick={() => { setActiveKickType(null); setAttackAction("phase"); }}>← Back to Phase</button>
              <KickFlowControls />
            </div>}

            <button className="cancel-attack-btn" onClick={cancelCurrentEvent}>Cancel Current Attack</button>
          </>
        ) : (
          <>
            <p className="eyebrow">Attack Launch</p>
            <div className="button-grid two">
              {attackTypes.map((type) => <button key={type} onClick={() => startAttack(type)}>{type}</button>)}
              <button onClick={startScrumLaunch}>Scrum Won</button>
              <button className={lineoutLaunchPrompt ? "selected" : ""} onClick={() => { if (requireVideo()) setLineoutLaunchPrompt(true); }}>Lineout Won</button>
            </div>
            {lineoutLaunchPrompt && <div className="logging-step-card launch-choice-card">
              <button className="secondary-btn small back-step-btn" onClick={() => setLineoutLaunchPrompt(false)}>← Back</button>
              <p className="phase-label">How was the lineout launched?</p>
              <div className="button-grid three">
                <button onClick={() => chooseLineoutLaunch("Down and Out")}>Down and Out</button>
                <button onClick={() => chooseLineoutLaunch("Off the Top")}>Off the Top (OT)</button>
                <button onClick={() => chooseLineoutLaunch("Maul")}>Maul</button>
              </div>
            </div>}
            <div>
              <p className="eyebrow">Set Piece Lost</p>
              <div className="button-grid two">
                <button className="negative-soft" onClick={() => addSetPiece("Lineout Lost")}>Lineout Lost</button>
                <button className="negative-soft" onClick={() => addSetPiece("Scrum Lost")}>Scrum Lost</button>
              </div>
            </div>
            <div className="maul-box">
              <p className="eyebrow">Kickoff / Restart</p>
              <div className="button-grid three">
                {["Kickoff Sent", "Kickoff Received", "22m Dropout Sent", "22m Dropout Received"].map((restart) => <button key={restart} className={activeRestart === restart ? "selected" : ""} onClick={() => setActiveRestart(restart)}>{restart}</button>)}
              </div>
              {activeRestart && <div className="restart-outcome-step"><button className="secondary-btn small back-step-btn" onClick={() => setActiveRestart(null)}>← Back</button><div className="button-grid two"><button onClick={() => addRestart("Possession Gained")}>Possession Gained</button><button className="negative" onClick={() => addRestart("Possession Lost")}>Possession Lost</button></div></div>}
            </div>
              {maulActive && <div className="maul-box">
                <p className="eyebrow">Maul</p>
                  <>
                    <div className="active-strip maul-active-strip">
                      <span>Maul Active</span><span>Zone: {maulStartZone}</span><span>Phases: {maulPhaseCount}</span>
                    </div>
                    <button className="secondary-btn small back-step-btn" onClick={cancelCurrentEvent}>← Back</button>
                    <div className="button-grid three maul-outcomes">
                      <button onClick={() => setMaulPhaseCount((prev) => prev + 1)}>+ Phase</button>
                      <button onClick={() => finishMaul("Maul Retained")}>Maul Retained</button>
                      <button onClick={() => finishMaul("Maul Penalty Won")}>Penalty Won</button>
                      <button onClick={() => finishMaul("Maul Try")}>Maul Try</button>
                      <button className="negative-soft" onClick={() => finishMaul("Maul Sacked")}>Maul Sacked</button>
                      <button className="negative" onClick={() => finishMaul("Maul Lost")}>Maul Lost</button>
                    </div>
                  </>
              </div>}
          </>
        )}
      </div>
    );
  }

  function KickFlowControls() {
    return (
      <div className="kick-flow-card">
        <div className="kick-flow-head"><p className="eyebrow">Kick Type</p>{activeKickType && <button className="secondary-btn small" onClick={() => setActiveKickType(null)}>Change</button>}</div>
        {!activeKickType ? (
          <div className="button-grid three">
            {(["Exit", "Contestable", "Clearance"] as KickType[]).map((type) => <button key={type} onClick={() => setActiveKickType(type)}>{type}</button>)}
          </div>
        ) : (
          <>
            <p className="kick-guidance">{activeKickType} kick • landing/end zone: <strong>{selectedZone}</strong></p>
            <div className="button-grid two">
              {kickOutcomesByType[activeKickType].map((outcome) => <button key={outcome} className={["Failed Exit", "Charged Down", "Contestable Kick Lost", "Poor Clearance", "Direct Into Touch"].includes(outcome) ? "negative" : ""} onClick={() => addKick(outcome, activeKickType)}>{outcome}</button>)}
            </div>
          </>
        )}
      </div>
    );
  }

  function DefenceControls() {
    return (
      <div className="control-stack">
        <div className="panel-head compact">
          <div><p className="eyebrow">Defence Panel</p><h2>Defensive Actions</h2></div>
        </div>
        <div className="coaching-moment-box">
          <p className="eyebrow">Quick Moment Tags • 10s Before / 5s After</p>
          <label className="coaching-moment-note">Coach subtitle (optional)<input maxLength={120} value={coachingMomentNote} onChange={(event) => setCoachingMomentNote(event.target.value)} placeholder="e.g. No counter-ruck or double action" /></label>
          <div className="button-grid two">
            <button onClick={() => addCoachingMoment("Good Defensive Moment", "defence")}>Good Defensive Moment</button>
            <button className="negative" onClick={() => addCoachingMoment("Bad Defensive Moment", "defence")}>Bad Defensive Moment</button>
          </div>
        </div>
        <InlineZoneSelector label="Action Zone" />
        <div className="button-grid two">
          <button onClick={() => addDefenceEvent("Tackle Made")}>Tackle Made <kbd>{keybinds.tackleMade}</kbd></button>
          <button className="negative" onClick={() => addDefenceEvent("Tackle Missed")}>Tackle Missed <kbd>{keybinds.tackleMissed}</kbd></button>
          <button onClick={() => addDefenceEvent("Opponent Lineout Stolen")}>Opponent Lineout Stolen</button>
          <button onClick={() => addDefenceEvent("Opponent Scrum Stolen")}>Opponent Scrum Stolen</button>
          <button onClick={() => addDefenceEvent("Opposition Held Up")}>Opposition Held Up <kbd>{keybinds.oppositionHeldUp}</kbd></button>
          <button className="negative" onClick={() => addDefenceEvent("Try Conceded")}>Try Conceded <kbd>{keybinds.tryConceded}</kbd></button>
        </div>
        <div className="reason-grid">
          <label>Ball Won Reason<select value={ballWonReason} onChange={(event) => setBallWonReason(event.target.value)}>{ballWonReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button onClick={() => addDefenceEvent("Ball Won", ballWonReason)}>Ball Won <kbd>{keybinds.ballWon}</kbd></button>
          <label>Penalty Won Reason<select value={penaltyWonReason} onChange={(event) => setPenaltyWonReason(event.target.value)}>{penaltyReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button onClick={() => addDefenceEvent("Penalty Won", penaltyWonReason)}>Penalty Won <kbd>{keybinds.penaltyWon}</kbd></button>
          <label>Penalty Conceded Reason<select value={penaltyConcededReason} onChange={(event) => setPenaltyConcededReason(event.target.value)}>{penaltyConcededReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button className="negative" onClick={() => addDefenceEvent("Penalty Conceded", penaltyConcededReason)}>Penalty Conceded <kbd>{keybinds.penaltyConceded}</kbd></button>
        </div>
      </div>
    );
  }

  function EventLogList() {
    return (
      <div className="event-list scroll-list">
        {events.map((event) => (
          <div className={`event-row ${eventTone(event)}`} key={event.id}>
            <button onClick={() => jumpTo(event.seconds)}>{event.time}</button>
            <strong>{event.coachingMoment ? event.event : event.category === "attack" ? `${event.attackType} Attack` : event.event}</strong>
            <span title={event.category === "attack" ? zoneProgression(event) : event.zone}>{event.category === "attack" ? zoneProgression(event) : event.zone}</span>
            <span>{event.coachingMoment ? "Coaching clip • 10s before / 5s after" : event.category === "attack" ? `${event.lineoutLaunch ? `${event.lineoutLaunch} lineout • ` : ""}${event.phases || 0} phases • ${event.outcome || "No outcome"}${event.kickType ? ` • ${event.kickType} kick to ${event.endZone || event.zone}` : ""}` : event.outcome || event.category}</span>
            <span>{event.reason || "—"}</span>
            <div className="event-actions">
              {!event.coachingMoment && <button onClick={() => openEditEvent(event)}>Edit</button>}
              <button onClick={() => deleteEvent(event.id)}>Delete</button>
            </div>
            {event.note && <p className="event-note">Note: {event.note}</p>}
          </div>
        ))}
      </div>
    );
  }

  function updateEditingEvent(patch: Partial<EditableEvent>) {
    setEditingEvent((current) => {
      if (!current) return current;

      const next = { ...current, ...patch };

      if (patch.attackType) {
        next.event = `${patch.attackType} Attack`;
      }

      if (patch.event && next.category === "defence") {
        next.outcome = patch.event;
      }

      if (patch.event && next.category === "maul") {
        next.outcome = patch.event;
      }

      const reasonOptions = reasonOptionsForEdit(next.category, next.event, next.outcome);
      if (!reasonOptions.length) {
        next.reason = "";
      } else if (!reasonOptions.includes(next.reason)) {
        next.reason = reasonOptions[0];
      }

      return next;
    });
  }

  function EditEventModal() {
    const draft = editingEvent;
    if (!draft) return null;

    const reasonOptions = reasonOptionsForEdit(draft.category, draft.event, draft.outcome);

    return (
      <div className="modal-backdrop">
        <div className="edit-modal panel">
          <p className="eyebrow">Edit Event</p>
          <h2>Change Event Details</h2>

          <label>
            Zone
            <select value={draft.zone} onChange={(event) => updateEditingEvent({ zone: event.target.value })}>
              {pitchZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>

          {draft.category === "attack" && (
            <>
              <label>
                Attack Type
                <select value={draft.attackType} onChange={(event) => updateEditingEvent({ attackType: event.target.value })}>
                  {attackTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Outcome
                <select value={draft.outcome} onChange={(event) => updateEditingEvent({ outcome: event.target.value })}>
                  {attackOutcomeOptions.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
                </select>
              </label>
            </>
          )}

          {draft.category === "defence" && (
            <label>
              Defence Event
              <select value={draft.event} onChange={(event) => updateEditingEvent({ event: event.target.value })}>
                {defenceEventOptions.map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
              </select>
            </label>
          )}

          {draft.category === "kick" && (
            <label>
              Kick Outcome
              <select value={draft.outcome} onChange={(event) => updateEditingEvent({ outcome: event.target.value })}>
                {kickOutcomeOptions.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
              </select>
            </label>
          )}

          {draft.category === "set-piece" && (
            <label>
              Set Piece Event
              <select value={draft.event} onChange={(event) => updateEditingEvent({ event: event.target.value })}>
                {setPieceEventOptions.map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
              </select>
            </label>
          )}

          {draft.category === "maul" && (
            <label>
              Maul Outcome
              <select value={draft.outcome || "Maul Retained"} onChange={(event) => updateEditingEvent({ event: "Maul", outcome: event.target.value })}>
                {maulOutcomeOptions.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
              </select>
            </label>
          )}

          {reasonOptions.length > 0 && (
            <label>
              Reason
              <select value={draft.reason || reasonOptions[0]} onChange={(event) => updateEditingEvent({ reason: event.target.value })}>
                {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </label>
          )}

          <label>
            Note
            <textarea value={draft.note} onChange={(event) => updateEditingEvent({ note: event.target.value })} rows={4} placeholder="Optional coach note" />
          </label>

          <div className="modal-actions">
            <button className="secondary-btn" onClick={() => setEditingEvent(null)}>Cancel</button>
            <button className="danger-btn" onClick={removeEventOutcome}>Remove Outcome</button>
            <button className="primary-btn" onClick={saveEditedEvent}>Save Event</button>
          </div>
        </div>
      </div>
    );
  }


  function CompilationVideosPage() {
    return (
      <main className="ras-shell compilation-shell">
        <div className="grid-bg" />
        <Topbar moduleTitle="Compilation Videos" />
        <section className="analysis-toolbar">
          <button className="home-btn" onClick={() => setView("home")}>← Home</button>
          <button className="secondary-btn" onClick={() => setView("analysis")}>Open Match Analysis</button>
          <label className="secondary-btn file-label">Import Analysis TXT<input type="file" hidden accept=".txt,text/plain" onChange={(event) => importAnalysisTXT(event.target.files?.[0])} /></label>
          <button className="secondary-btn" onClick={chooseMatchFootage}>Load Match Footage</button>
        </section>

        <section className="compilation-grid">
          <div className="panel"><p className="eyebrow">Analysis Source</p><h2>{matchTitle}</h2><p className="muted">{competition || "Competition not specified"}</p><div className="metric-row"><span>Events Loaded</span><strong>{events.length}</strong></div></div>
          <div className="panel"><p className="eyebrow">Match Footage</p><h2>{rawVideoName || "No Video Loaded"}</h2><p className="muted">Compilation videos are generated from the loaded raw footage.</p><div className="metric-row"><span>Status</span><strong>{rawVideoName ? "Ready" : "Required"}</strong></div></div>
        </section>

        <section className="work-grid">
          <div className="panel selector-card">
            <div className="section-head"><div><p className="eyebrow">Compilation Types</p><h2>Select Outputs</h2></div><span className="pill">{selectedClipTypes.length} selected</span></div>
            <div className="clip-type-picker">
              {clipTypeGroups.map((group) => {
                const groupSelectedCount = group.types.filter((type) => selectedClipTypes.includes(type)).length;
                return (
                  <details className="clip-type-group-dropdown" key={group.id}>
                    <summary><span>{group.label}</span><small>{groupSelectedCount} selected</small><i aria-hidden="true">⌄</i></summary>
                    <div className="options clip-type-options">
                      {group.types.map((type) => <button key={type} onClick={() => toggleClipType(type)} className={selectedClipTypes.includes(type) ? "selected" : ""} aria-pressed={selectedClipTypes.includes(type)}><span className="clip-option-check">{selectedClipTypes.includes(type) ? "✓" : ""}</span>{type}</button>)}
                    </div>
                  </details>
                );
              })}
            </div>
            <div className="padding-card">
              <div className="section-head compact"><div><p className="eyebrow">Clip Padding</p><h2>{selectedClipPadding.before}s before / {selectedClipPadding.after}s after</h2></div></div>
              <div className="padding-presets">
                {clipPaddingPresets.map((preset) => <button key={preset.id} type="button" onClick={() => { setClipPaddingPresetId(preset.id); setGeneratedClips([]); }} className={clipPaddingPresetId === preset.id ? "active" : ""}><strong>{preset.title}</strong><span>{preset.before}s before / {preset.after}s after</span><small>{preset.description}</small></button>)}
              </div>
              <p className="muted">Ruck clips start 5s before the ball is played and finish 1s after it.</p>
              <p className="muted">Try Conceded clips use 15s before and 3s after to show the defensive cause and finish.</p>
            </div>
            <button className="primary-btn full" onClick={generateClipList}>Build Compilation Preview</button>
          </div>

          <div className="panel preview-card">
            <div className="section-head"><div><p className="eyebrow">Compilation Preview</p><h2>Compilation Summary</h2></div><button className="secondary-btn small" onClick={() => setGeneratedClips([])}>Clear Preview</button></div>
            <div className="summary-strip"><span>{generatedClips.length} groups</span><span>{totalPreviewClips} clips</span><span>{formatTime(totalPreviewDuration)} total footage</span><span>Rucks: 5s before / 1s after</span></div>
            {generatedClips.length === 0 ? <div className="empty-state">Analyse a match or import TXT, then build a compilation preview.</div> : (
              <div className="preview-list">
                {generatedClips.map((group) => <div className="clip-group" key={group.type}><div className="group-head"><div><h4>{titleCase(group.type)}</h4><p>{group.clips.length} clips • {formatTime(totalGroupDuration(group))}</p></div></div>{group.clips.map((clip, index) => { const heading = `${group.type}${clip.subtitle ? `: ${clip.subtitle}` : ""}`; return <div className="clip-row" key={`${group.type}-${clip.id}-${index}`}><div><strong>Clip {index + 1}</strong><p>{/[.!?]$/.test(heading) ? heading : `${heading}.`}</p><small>Event: {clip.originalTime}</small></div><h4>{formatTime(clip.rawStart)} → {formatTime(clip.rawEnd)}</h4></div>; })}</div>)}
              </div>
            )}
            <div className="action-stack"><button className="secondary-btn" onClick={generateTestClip} disabled={isGenerating || isGeneratingCompilation}>{isGenerating ? "Generating Test..." : "Generate Test Clip"}</button><button className="primary-btn" onClick={generateFullCompilation} disabled={isGenerating || isGeneratingCompilation}>{isGeneratingCompilation ? "Generating Videos..." : "Generate Compilation Videos"}</button></div>
          </div>
        </section>
        <footer className="status-bar"><span>Status</span><strong>{statusMessage}</strong></footer>
        <NoticeToast />
      </main>
    );
  }

  function saveOppositionMoment() {
    if (!requireVideo()) return;
    const seconds = currentSeconds();
    const moment: OppositionMoment = {
      id: Date.now(),
      title: oppositionTitle.trim() || `${oppositionPattern} ${oppositionMode === "attack" ? "Attack" : "Defence"}`,
      seconds,
      time: formatTime(seconds),
      mode: oppositionMode,
      pattern: oppositionPattern,
      response: oppositionResponse,
      observation: oppositionObservation.trim(),
      coachingPlan: oppositionCoachingPlan.trim(),
    };
    setOppositionMoments((items) => [moment, ...items]);
    setSelectedOppositionMomentId(moment.id);
    setTacticalBoardPlaying(false);
    setOppositionTitle("");
    setOppositionObservation("");
    setOppositionCoachingPlan("");
    notify("Tactical Moment Saved", `${moment.title} was linked to ${moment.time}.`, "success");
  }

  function OppositionTacticalBoard({ moment }: { moment: OppositionMoment }) {
    const patternClass = moment.pattern.toLowerCase().replace(/\s+/g, "-");
    const attack = [[18,50],[29,35],[29,65],[40,50],[51,29],[51,50],[51,71],[65,40],[65,60]];
    const defence = [[29,20],[38,30],[42,42],[44,54],[42,66],[38,78],[29,88]];
    return <div className={`opposition-board ${tacticalBoardPlaying ? "playing" : ""} pattern-${patternClass}`}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`${moment.pattern} overhead tactical board`}>
        <rect x="1" y="1" width="98" height="98" rx="3" className="board-grass" />
        {[20,40,50,60,80].map((x) => <line key={x} x1={x} y1="2" x2={x} y2="98" className={x === 50 ? "halfway" : "field-line"} />)}
        <text x="7" y="9" className="board-label">OPPOSITION ATTACK →</text>
        <g className="attack-shape">{attack.map(([x,y], index) => <g key={index} className={`attack-player p${index + 1}`}><circle cx={x} cy={y} r="3.2" /><text x={x} y={y + 1.2}>{index === 0 ? "9" : index + 1}</text></g>)}</g>
        <g className={`defence-shape response-${moment.response.toLowerCase()}`}>{defence.map(([x,y], index) => <g key={index} className={`defence-player p${index + 1}`}><circle cx={x} cy={y} r="3.2" /><text x={x} y={y + 1.2}>{index + 1}</text></g>)}</g>
        <path className="attack-route primary-route" d={moment.pattern === "Out the Back" ? "M20 50 C36 50 43 70 67 60" : moment.pattern === "Front Nine" ? "M18 50 C29 50 36 37 51 29" : moment.pattern === "Edge Shape" ? "M18 50 C42 48 56 40 76 25" : moment.pattern === "Kick Threat" ? "M18 50 C42 50 62 34 86 15" : "M18 50 C38 50 55 50 76 50"} />
        <path className="defence-route" d={moment.response === "Press" ? "M43 18 L51 18 M47 30 L55 30 M49 42 L57 42 M50 54 L58 54 M49 66 L57 66 M47 78 L55 78" : moment.response === "Drift" ? "M43 22 C51 30 55 42 61 58 M47 36 C55 43 59 54 65 69" : moment.response === "Fold" ? "M42 78 C50 69 53 57 57 45 M38 87 C49 75 54 63 61 52" : "M44 20 L44 86"} />
      </svg>
      <div className="board-legend"><span><i className="opposition-dot" /> Opposition</span><span><i className="defence-dot" /> Your defensive response</span></div>
    </div>;
  }

  function OppositionAnalysisPage() {
    const selected = oppositionMoments.find((moment) => moment.id === selectedOppositionMomentId) || oppositionMoments[0] || null;
    return <main className="ras-shell opposition-shell">
      <div className="grid-bg" />
      <Topbar moduleTitle="Opposition Analysis • Tactical Board" />
      <section className="analysis-toolbar opposition-toolbar">
        <button className="home-btn" onClick={() => setView("home")}>← Home</button>
        <button className="secondary-btn" onClick={() => setView("analysis")}>Open Match Analysis</button>
        <span className="status available">{oppositionMoments.length} tactical moment{oppositionMoments.length === 1 ? "" : "s"}</span>
      </section>
      <section className="opposition-intro">
        <div><p className="eyebrow">Video to tactical review</p><h1>See the pattern.<br /><em>Coach the answer.</em></h1></div>
        <p>Pause on an opposition moment, describe what happened, choose the closest shape and save it. The linked clip and animated overhead board stay together for your team review.</p>
      </section>
      <section className="opposition-workspace">
        <div className="opposition-video-column">
          <VideoPlayer videoRef={videoRef} rawVideoPath={rawVideoPath} playbackVideoUrl={playbackVideoUrl} rawVideoUrl={rawVideoUrl} rawVideoName={rawVideoName} isOptimisingVideo={isOptimisingVideo} playbackRate={playbackRate} onLoadVideo={chooseMatchFootage} onError={handleVideoPlaybackError} onSeek={seekVideo} onSpeedChange={changePlaybackRate} />
          <section className="panel opposition-capture-card">
            <div className="section-head"><div><p className="eyebrow">Capture Tactical Moment</p><h2>Link the current video position</h2></div><span>{formatTime(currentSeconds())}</span></div>
            <div className="opposition-form-grid">
              <label>Moment title<input value={oppositionTitle} onChange={(event) => setOppositionTitle(event.target.value)} placeholder="e.g. Front-nine strike from midfield" /></label>
              <label>Moment type<select value={oppositionMode} onChange={(event) => setOppositionMode(event.target.value as OppositionMode)}><option value="attack">Opposition attack</option><option value="defence">Opposition defence</option></select></label>
              <label>Observed pattern<select value={oppositionPattern} onChange={(event) => setOppositionPattern(event.target.value as OppositionPattern)}>{(["Front Nine","Out the Back","Edge Shape","Kick Threat","Custom"] as OppositionPattern[]).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Your response<select value={oppositionResponse} onChange={(event) => setOppositionResponse(event.target.value as DefenceResponse)}>{(["Press","Drift","Hold","Fold"] as DefenceResponse[]).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="wide">What happened?<textarea value={oppositionObservation} onChange={(event) => setOppositionObservation(event.target.value)} placeholder="They play front nine, with the second receiver out the back of the pod." /></label>
              <label className="wide">What do you want from the team?<textarea value={oppositionCoachingPlan} onChange={(event) => setOppositionCoachingPlan(event.target.value)} placeholder="Nine presses the first receiver, edge stays connected and the backfield holds for the kick." /></label>
            </div>
            <button className="primary-btn full" onClick={saveOppositionMoment}>Capture Moment & Build Board</button>
          </section>
        </div>
        <div className="opposition-board-column">
          <section className="panel tactical-board-card">
            <div className="section-head"><div><p className="eyebrow">Animated Tactical Board</p><h2>{selected?.title || "Select or capture a moment"}</h2></div>{selected && <span>{selected.time}</span>}</div>
            {selected ? <><OppositionTacticalBoard moment={selected} /><div className="tactical-actions"><button className="primary-btn" onClick={() => setTacticalBoardPlaying((playing) => !playing)}>{tacticalBoardPlaying ? "Reset Animation" : "Play Movement"}</button><button className="secondary-btn" onClick={() => jumpTo(selected.seconds)}>Show Original Clip</button></div><div className="tactical-notes"><article><span>What we saw</span><p>{selected.observation || "No observation added."}</p></article><article><span>Our response • {selected.response}</span><p>{selected.coachingPlan || "No coaching response added."}</p></article></div></> : <div className="ai-empty-review"><strong>No tactical moments yet</strong><p>Load footage, pause at the action and capture your first opposition pattern.</p></div>}
          </section>
          <section className="panel opposition-library-card">
            <div className="section-head"><div><p className="eyebrow">Review Library</p><h2>Saved Opposition Moments</h2></div></div>
            <div className="opposition-moment-list">{oppositionMoments.map((moment) => <button key={moment.id} className={selected?.id === moment.id ? "active" : ""} onClick={() => { setSelectedOppositionMomentId(moment.id); setTacticalBoardPlaying(false); }}><span>{moment.time}</span><div><strong>{moment.title}</strong><small>{moment.mode} • {moment.pattern} • {moment.response}</small></div><i onClick={(event) => { event.stopPropagation(); setOppositionMoments((items) => items.filter((item) => item.id !== moment.id)); }}>×</i></button>)}</div>
          </section>
        </div>
      </section>
      <NoticeToast />
    </main>;
  }

  function SettingsPage() {
    const groups: { title: string; description: string; items: { action: KeybindAction; label: string }[] }[] = [
      { title: "Video Playback", description: "Controls available whenever match footage is loaded.", items: [
        { action: "playPause", label: "Play / Pause" }, { action: "seekBack", label: "Back 10 seconds" }, { action: "seekForward", label: "Forward 10 seconds" }, { action: "speedUp", label: "Faster playback" }, { action: "speedDown", label: "Slower playback" }, { action: "undoEvent", label: "Undo last event" },
      ] },
      { title: "Attack Phase", description: "Repeated actions used while an attack is active.", items: [
        { action: "gainlineWon", label: "Gainline won" }, { action: "gainlineNeutral", label: "Gainline neutral" }, { action: "gainlineLost", label: "Gainline lost" }, { action: "ruckQuick", label: "Quick ruck" }, { action: "ruckAverage", label: "Average ruck" }, { action: "ruckSlow", label: "Slow ruck" }, { action: "completePhase", label: "Complete phase" }, { action: "undoPhase", label: "Undo phase" }, { action: "finishAttack", label: "Finish attack menu" }, { action: "kick", label: "Kick menu" }, { action: "backToPhase", label: "Back to phase" },
      ] },
      { title: "Defence", description: "Context-sensitive actions used while the Defence panel is open.", items: [
        { action: "tackleMade", label: "Tackle made" }, { action: "tackleMissed", label: "Tackle missed" }, { action: "ballWon", label: "Ball won" }, { action: "penaltyWon", label: "Penalty won" }, { action: "penaltyConceded", label: "Penalty conceded" }, { action: "oppositionHeldUp", label: "Opposition held up" }, { action: "tryConceded", label: "Try conceded" },
      ] },
      { title: "Navigation", description: "Switch quickly between the main logging panels.", items: [
        { action: "attackPanel", label: "Open Attack panel" }, { action: "defencePanel", label: "Open Defence panel" },
      ] },
    ];

    function updateKeybind(action: KeybindAction, event: React.KeyboardEvent<HTMLInputElement>) {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = shortcutFromEvent(event);
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      setKeybinds((current) => ({ ...current, [action]: shortcut }));
      setListeningKeybind(null);
    }

    return (
      <main className="ras-shell settings-shell">
        <div className="grid-bg" />
        <div className="settings-aurora" aria-hidden="true" />
        <Topbar moduleTitle="Settings" />
        <section className="settings-layout">
          <div className="settings-intro">
            <div><p className="home-kicker">Analyst Control Deck</p><h2>Make the workflow <span>yours.</span></h2><p>Click a shortcut field, then press the key or key combination you want. Changes save automatically on this device.</p><div className="settings-status"><i /><span>{listeningKeybind ? "Listening for your next key…" : "All controls ready"}</span></div></div>
            <div className="settings-actions"><button className="home-btn" onClick={() => setView("home")}>← Home</button><button className="secondary-btn" onClick={() => setKeybinds(defaultKeybinds)}>Reset Defaults</button></div>
          </div>
          <div className="settings-tabs">
            <button className={settingsTab === "keybinds" ? "active" : ""} onClick={() => setSettingsTab("keybinds")}>Keybinds</button>
            <button className={settingsTab === "appearance" ? "active" : ""} onClick={() => setSettingsTab("appearance")}>Appearance</button>
            <button className={settingsTab === "profile" ? "active" : ""} onClick={() => setSettingsTab("profile")}>Analyst Profile</button>
            <button className={settingsTab === "updates" ? "active" : ""} onClick={() => setSettingsTab("updates")}>Updates</button>
          </div>
          {settingsTab === "keybinds" && <div className="settings-groups">
            {groups.map((group) => {
              const duplicateKeys = group.items.map((item) => keybinds[item.action]).filter((key, index, keys) => keys.indexOf(key) !== index);
              return <section className="panel keybind-group" key={group.title}><div><p className="eyebrow">{group.title}</p><h3>{group.description}</h3></div><div className="keybind-list">{group.items.map((item) => {
                const conflict = duplicateKeys.includes(keybinds[item.action]);
                const listening = listeningKeybind === item.action;
                return <label className={`keybind-row${conflict ? " conflict" : ""}${listening ? " listening" : ""}`} key={item.action}><span>{item.label}{conflict && <small>Shortcut conflict</small>}{listening && <small className="listening-copy">Listening for input…</small>}</span><div className="keybind-capture"><i aria-hidden="true" /><input readOnly value={listening ? "Press a key…" : keybinds[item.action]} onKeyDown={(event) => updateKeybind(item.action, event)} onFocus={(event) => { setListeningKeybind(item.action); event.currentTarget.select(); }} onBlur={() => setListeningKeybind((current) => current === item.action ? null : current)} aria-label={`Shortcut for ${item.label}`} /></div></label>;
              })}</div></section>;
            })}
          </div>}
          {settingsTab === "appearance" && <div className="settings-groups appearance-groups">
            <section className="panel keybind-group"><div><p className="eyebrow">Accent Colour</p><h3>Choose the energy of your workspace.</h3></div><div className="accent-presets">{[
              ["RAS Green", "#7ed957", "#5cb338"], ["Electric Blue", "#60a5fa", "#2563eb"], ["Performance Gold", "#f5d76e", "#c99720"], ["Elite Purple", "#a78bfa", "#7c3aed"], ["Match Red", "#fb7185", "#dc2626"],
            ].map(([label, accent, accent2]) => <button key={label} className={appearance.accent === accent ? "active" : ""} onClick={() => setAppearance((current) => ({ ...current, accent, accent2 }))}><i style={{ background: accent }} /><span>{label}</span></button>)}</div></section>
            <section className="panel keybind-group"><div><p className="eyebrow">Motion</p><h3>Control how alive the interface feels.</h3></div><div className="segmented-settings">{(["off", "subtle", "full"] as const).map((motion) => <button key={motion} className={appearance.motion === motion ? "active" : ""} onClick={() => setAppearance((current) => ({ ...current, motion }))}>{titleCase(motion)}</button>)}</div></section>
            <section className="panel keybind-group"><div><p className="eyebrow">Interface Density</p><h3>Compact for speed, comfortable for clarity.</h3></div><div className="segmented-settings">{(["compact", "comfortable"] as const).map((density) => <button key={density} className={appearance.density === density ? "active" : ""} onClick={() => setAppearance((current) => ({ ...current, density }))}>{titleCase(density)}</button>)}</div></section>
            <section className="panel keybind-group range-settings"><label><span>Background intensity <strong>{appearance.backdrop}%</strong></span><input type="range" min="35" max="100" value={appearance.backdrop} onChange={(event) => setAppearance((current) => ({ ...current, backdrop: Number(event.target.value) }))} /></label><label><span>Glass strength <strong>{appearance.glass}%</strong></span><input type="range" min="45" max="100" value={appearance.glass} onChange={(event) => setAppearance((current) => ({ ...current, glass: Number(event.target.value) }))} /></label></section>
          </div>}
          {settingsTab === "profile" && <div className="profile-settings-grid">
            <section className="panel analyst-brand-card"><img src={logoSrc} alt="Rugby Analysis Suite" /><p className="eyebrow">Official Brand</p><h3>Rugby Analysis Suite</h3><p>The company name and logo stay consistent across every analyst and client delivery.</p></section>
            <section className="panel analyst-profile-form"><p className="eyebrow">Your Details • {activeAnalystId === "jd" ? "Owner" : "Analyst"}</p><h3>Personalise your analyst identity.</h3><label>Analyst name<input readOnly value={analystProfile.name} /></label><label>Role<input value={analystProfile.role} onChange={(event) => setAnalystProfile((current) => ({ ...current, role: event.target.value }))} placeholder="Performance Analyst" /></label><label>Email<input value={analystProfile.email} onChange={(event) => setAnalystProfile((current) => ({ ...current, email: event.target.value }))} placeholder="you@email.com" /></label><label>Phone<input value={analystProfile.phone} onChange={(event) => setAnalystProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="Optional" /></label></section>
          </div>}
          {settingsTab === "updates" && <section className="panel update-centre"><div className="update-orb"><span>{appVersion}</span></div><p className="eyebrow">Update Centre</p><h2>Rugby Analysis Suite v{appVersion}</h2><p>{updateStatus.message}</p><div className={`update-state ${updateStatus.state}`}><i /><span>{titleCase(updateStatus.state.replace(/-/g, " "))}</span></div><button className="primary-btn" disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"} onClick={async () => { setUpdateStatus({ state: "checking", message: "Checking GitHub for the latest release…" }); const result = await window.electronAPI?.checkForUpdates?.(); if (result && !result.success) setUpdateStatus({ state: "error", message: result.message || "Update check failed." }); }}>Check for Updates</button><small>Automatic checks still run shortly after the packaged app launches.</small></section>}
        </section>
        <NoticeToast />
      </main>
    );
  }

  function SupportPage() {
    return (
      <main className="ras-shell support-shell">
        <div className="grid-bg" />
        <Topbar moduleTitle="Support Centre" />
        <section className="support-layout">
          <div><p className="home-kicker">Need help?</p><h2 className="support-title">Support<br />Centre</h2><p className="home-subtitle">Submit installation issues, compilation errors or feature requests.</p><button className="home-btn" onClick={() => setView("home")}>← Home</button></div>
          <form action="https://formsubmit.co/jdgouws10@gmail.com" method="POST" className="panel support-form">
            <input type="hidden" name="_subject" value="Rugby Analysis Suite Support Ticket" /><input type="hidden" name="_captcha" value="false" />
            <label>Name<input required name="name" placeholder="Your name" /></label><label>Email<input required type="email" name="email" placeholder="you@email.com" /></label><label>Subject<input required name="subject" placeholder="Issue or request" /></label><label>Issue<textarea required name="message" rows={7} placeholder="Explain what happened." /></label><button className="primary-btn" type="submit">Submit Ticket</button>
          </form>
        </section>
        <NoticeToast />
      </main>
    );
  }

  async function beginAIScan() {
    if (!rawVideoPath) {
      notify("Match Footage Required", "Load a match video before starting AI analysis.", "warning");
      return;
    }
    if (!matchName || !opposition || !aiTeamColour || !aiOppositionColour) {
      notify("Match Context Required", "Enter both teams and both jersey colours before starting the AI scan.", "warning");
      return;
    }
    setAiScanStatus("scanning");
    setAiScanProgress(2);
    setAiScanStage("Starting experimental full-match classifier");
    setAiReviewEvents([]);
    setAiComparison(null);
    setAiGroundTruth(null);
    try {
      const result = await window.electronAPI.runAIScan({ videoPath: rawVideoPath });
      if (!result.success) {
        setAiScanStatus("ready");
        setAiScanProgress(0);
        notify("AI Scan Failed", result.message || "The match could not be analysed.", "error");
        return;
      }
      const startedAt = Date.now();
      setAiReviewEvents((result.detections || []).map((event, index) => ({ ...event, id: startedAt + index })));
      setAiScanStatus("review");
      setAiScanProgress(100);
      setAiScanStage(`${result.framesScanned || 0} frames scanned`);
      notify("Experimental Scan Complete", `${result.detections?.length || 0} possible rugby events found for analyst review.`, "success");
    } catch (error) {
      setAiScanStatus("ready");
      setAiScanProgress(0);
      notify("AI Scan Failed", error instanceof Error ? error.message : "The match could not be analysed.", "error");
    }
  }

  function compareAIGroundTruth(file?: File) {
    if (!file || aiScanStatus !== "review") return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        const truth: EventLog[] = ((Array.isArray(data.events) ? data.events : []) as EventLog[]).filter((event) => event.event && Number.isFinite(Number(event.seconds)));
        if (!truth.length) throw new Error("No valid events");
        const used = new Set<number>();
        let correct = 0;
        let wrongLabel = 0;
        let falseDetections = 0;
        const timingErrors: number[] = [];
        const normaliseLabel = (value: string) => value.trim().toLowerCase();
        for (const prediction of aiReviewEvents) {
          const candidates = truth
            .map((event, index) => ({ event, index, distance: Math.abs(event.seconds - prediction.seconds) }))
            .filter((candidate) => !used.has(candidate.index) && candidate.distance <= 10)
            .sort((a, b) => a.distance - b.distance);
          const exact = candidates.find((candidate) => normaliseLabel(candidate.event.event) === normaliseLabel(prediction.event));
          if (exact) {
            correct += 1;
            timingErrors.push(exact.distance);
            used.add(exact.index);
          } else if (candidates[0]) {
            wrongLabel += 1;
            timingErrors.push(candidates[0].distance);
            used.add(candidates[0].index);
          } else {
            falseDetections += 1;
          }
        }
        setAiComparison({
          correct,
          wrongLabel,
          falseDetections,
          missed: Math.max(0, truth.length - used.size),
          meanTimingError: timingErrors.length ? timingErrors.reduce((sum, value) => sum + value, 0) / timingErrors.length : 0,
          totalGroundTruth: truth.length,
        });
        setAiGroundTruth({ name: file.name, events: truth });
        notify("Blind Test Compared", `${correct} exact event matches found against ${truth.length} manual events.`, "info");
      } catch (_error) {
        notify("Comparison Failed", "Choose the completed .ras file for this exact raw match.", "error");
      }
    };
    reader.readAsText(file);
  }

  async function learnFromAIGroundTruth() {
    if (!aiGroundTruth || !rawVideoPath) return;
    setIsLearningGroundTruth(true);
    try {
      const result = await window.electronAPI.buildTrainingDataset({
        videoPath: rawVideoPath,
        videoName: rawVideoName,
        projectName: aiGroundTruth.name,
        matchName,
        opposition,
        teamColour: aiTeamColour,
        direction: aiDirection,
        camera: aiCamera,
        events: aiGroundTruth.events,
      });
      if (!result.success) {
        notify("Learning Import Failed", result.message || "The ground-truth match could not be imported.", "error");
        return;
      }
      setAiScanStage("Retraining with expanded ground truth");
      const retrained = await window.electronAPI.retrainAIModel();
      notify(retrained.success ? "Model Retrained" : "Examples Saved • Retraining Failed", retrained.success ? `${result.clips || 0} trusted examples were learned. The model now uses ${retrained.frames || 0} training frames across ${retrained.classes || 0} classes.` : retrained.message || "Trusted examples were saved, but the model could not be retrained.", retrained.success ? "success" : "warning");
    } finally {
      setIsLearningGroundTruth(false);
    }
  }

  function reviewAIEvent(id: number, status: "accepted" | "rejected") {
    setAiReviewEvents((current) => current.map((event) => event.id === id ? { ...event, reviewStatus: status } : event));
  }

  function sendApprovedAIEvents() {
    const approved = aiReviewEvents.filter((event) => event.reviewStatus === "accepted");
    if (!approved.length) {
      notify("Nothing Approved", "Accept at least one AI suggestion before sending events to Match Analysis.", "warning");
      return;
    }
    const existingIds = new Set(events.map((event) => event.id));
    const cleanEvents = approved
      .filter((event) => !existingIds.has(event.id))
      .map(({ confidence: _confidence, explanation: _explanation, reviewStatus: _reviewStatus, ...event }) => event);
    setEvents((current) => [...current, ...cleanEvents].sort((a, b) => a.seconds - b.seconds));
    notify("Events Added", `${cleanEvents.length} approved AI event${cleanEvents.length === 1 ? "" : "s"} added to Match Analysis.`, "success");
  }

  async function chooseTrainingVideo() {
    const file = await window.electronAPI.selectVideo();
    if (!file) return;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      setTrainingVideo({ ...file, duration: Number.isFinite(probe.duration) ? probe.duration : 0 });
      probe.removeAttribute("src");
      probe.load();
    };
    probe.onerror = () => {
      setTrainingVideo({ ...file, duration: 0 });
      notify("Video Metadata Unavailable", "The footage was linked, but its duration could not be checked in the preview player.", "warning");
    };
    probe.src = file.url;
  }

  function importTrainingProject(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(data.events)) throw new Error("Missing events");
        const validEvents = data.events.filter((event: EventLog) => Number.isFinite(Number(event.seconds)) && event.event);
        setTrainingProject({
          name: file.name,
          events: validEvents,
          matchName: data.matchName || "",
          opposition: data.opposition || "",
        });
        notify("Analysis Imported", `${validEvents.length} tagged events are ready for training validation.`, "success");
      } catch (_error) {
        setTrainingProject(null);
        notify("Invalid Training File", "Choose a valid Rugby Analysis Suite .ras project.", "error");
      }
    };
    reader.readAsText(file);
  }

  async function buildTrainingDataset() {
    if (!trainingVideo || !trainingProject || !trainingPermission) return;
    setIsBuildingTrainingDataset(true);
    setTrainingProgress({ completed: 0, total: trainingProject.events.length, percent: 0 });
    try {
      const result = await window.electronAPI.buildTrainingDataset({
        videoPath: trainingVideo.path,
        videoName: trainingVideo.name,
        projectName: trainingProject.name,
        matchName: trainingProject.matchName,
        opposition: trainingProject.opposition,
        teamColour: trainingTeamColour,
        direction: trainingDirection,
        camera: trainingCamera,
        events: trainingProject.events,
      });
      notify(result.success ? "Training Dataset Created" : "Dataset Build Failed", result.success ? `${result.clips || 0} labelled clips were saved to the local AI Training Library.` : result.message || "Training clips could not be extracted.", result.success ? "success" : "error");
      if (result.success) await loadTrainingDatasets(true, result.datasetId);
    } catch (error) {
      notify("Dataset Build Failed", error instanceof Error ? error.message : "Training clips could not be extracted.", "error");
    } finally {
      setIsBuildingTrainingDataset(false);
      setTrainingProgress(null);
    }
  }

  async function loadTrainingDatasets(openReview = false, preferredId?: string) {
    if (openReview) setTrainingLibraryMode("review");
    setIsLoadingTrainingDatasets(true);
    try {
      if (!window.electronAPI?.listTrainingDatasets) throw new Error("The desktop app needs to restart before Dataset Review can access saved matches.");
      const result = await window.electronAPI.listTrainingDatasets();
      if (!result.success) throw new Error(result.message || "Training datasets could not be loaded.");
      const datasets = result.datasets || [];
      setTrainingDatasets(datasets);
      const selected = datasets.find((dataset) => dataset.id === preferredId) || datasets.find((dataset) => dataset.id === selectedTrainingDatasetId) || datasets[0];
      if (selected) {
        setSelectedTrainingDatasetId(selected.id);
        setActiveTrainingExampleId(selected.examples[0]?.id ?? null);
      }
      if (!datasets.length) notify("No Saved Datasets", "Complete training extraction before opening Dataset Review.", "info");
    } catch (error) {
      notify("Library Unavailable", error instanceof Error ? error.message : "Training datasets could not be loaded.", "error");
    } finally {
      setIsLoadingTrainingDatasets(false);
    }
  }

  async function updateTrainingReview(datasetId: string, exampleId: number, reviewStatus: TrainingExample["reviewStatus"], correctedEvent?: string) {
    const result = await window.electronAPI.updateTrainingExample({ datasetId, exampleId, reviewStatus, correctedEvent });
    if (!result.success) {
      notify("Review Not Saved", result.message || "This training decision could not be saved.", "error");
      return;
    }
    setTrainingDatasets((datasets) => datasets.map((dataset) => dataset.id !== datasetId ? dataset : {
      ...dataset,
      examples: dataset.examples.map((example) => example.id !== exampleId ? example : { ...example, reviewStatus, ...(correctedEvent?.trim() ? { correctedEvent: correctedEvent.trim() } : {}) }),
    }));
  }

  function TrainingDatasetReview() {
    if (isLoadingTrainingDatasets) return <section className="panel training-summary-card"><div className="ai-empty-review"><strong>Loading saved training matches…</strong><p>Reading dataset manifests and connecting extracted clips.</p></div></section>;
    const selectedDataset = trainingDatasets.find((dataset) => dataset.id === selectedTrainingDatasetId) || trainingDatasets[0];
    if (!selectedDataset) return <section className="panel training-summary-card"><div className="ai-empty-review"><strong>No completed datasets found</strong><p>Import and extract a training match before inspecting training data.</p><button className="primary-btn" onClick={() => setTrainingLibraryMode("import")}>Import Training Match</button></div></section>;
    const categories = Array.from(new Set(selectedDataset.examples.map((example) => example.category || "other"))).sort();
    const eventNames = Array.from(new Set(selectedDataset.examples.map((example) => example.correctedEvent || example.event))).sort();
    const filtered = selectedDataset.examples.filter((example) =>
      (trainingCategoryFilter === "all" || (example.category || "other") === trainingCategoryFilter)
      && (trainingEventFilter === "all" || (example.correctedEvent || example.event) === trainingEventFilter)
      && (trainingReviewFilter === "all" || (trainingReviewFilter === "issues" ? ["rejected", "duplicate", "unclear"].includes(example.reviewStatus) : example.reviewStatus === trainingReviewFilter))
    );
    const active = filtered.find((example) => example.id === activeTrainingExampleId) || filtered[0];
    const trusted = selectedDataset.examples.filter((example) => ["trusted", "approved"].includes(example.reviewStatus)).length;
    const issues = selectedDataset.examples.filter((example) => ["rejected", "duplicate", "unclear"].includes(example.reviewStatus)).length;
    const move = (currentId: number, amount: number) => {
      const index = filtered.findIndex((example) => example.id === currentId);
      setActiveTrainingExampleId(filtered[Math.max(0, Math.min(filtered.length - 1, index + amount))]?.id ?? null);
    };
    const decide = async (status: TrainingExample["reviewStatus"]) => {
      if (!active) return;
      await updateTrainingReview(selectedDataset.id, active.id, status, active.correctedEvent);
      move(active.id, 1);
    };
    const activeIndex = active ? filtered.findIndex((example) => example.id === active.id) : -1;
    return (
      <section className="dataset-review">
        <header className="dataset-inspector-head">
          <div><p className="eyebrow">Training Data Inspector</p><h2>{selectedDataset.team || "Team"} vs {selectedDataset.opposition || "Opposition"}</h2><p>{selectedDataset.videoName} • Manual `.ras` labels are trusted automatically</p></div>
          <label><span>Saved match</span><select value={selectedDataset.id} onChange={(event) => { setSelectedTrainingDatasetId(event.target.value); setActiveTrainingExampleId(null); }} >{trainingDatasets.map((dataset) => <option value={dataset.id} key={dataset.id}>{dataset.team || "Team"} vs {dataset.opposition || "Opposition"}</option>)}</select></label>
          <div className="dataset-review-totals"><strong>{trusted}</strong><span>trusted clips</span><strong>{issues}</strong><span>flagged issues</span></div>
        </header>
        <div className="dataset-filter-flow">
          <div className="dataset-category-pills"><span>1. Category</span><button className={trainingCategoryFilter === "all" ? "active" : ""} onClick={() => { setTrainingCategoryFilter("all"); setActiveTrainingExampleId(null); }}>All</button>{categories.map((category) => <button className={trainingCategoryFilter === category ? "active" : ""} key={category} onClick={() => { setTrainingCategoryFilter(category); setTrainingEventFilter("all"); setActiveTrainingExampleId(null); }}>{titleCase(category)}</button>)}</div>
          <div className="dataset-secondary-filters"><label><span>2. Event</span><select value={trainingEventFilter} onChange={(event) => { setTrainingEventFilter(event.target.value); setActiveTrainingExampleId(null); }}><option value="all">All event labels</option>{eventNames.map((event) => <option value={event} key={event}>{event}</option>)}</select></label><label><span>3. Show</span><select value={trainingReviewFilter} onChange={(event) => { setTrainingReviewFilter(event.target.value); setActiveTrainingExampleId(null); }}><option value="all">All clips</option><option value="trusted">Trusted only</option><option value="issues">Flagged issues</option><option value="duplicate">Duplicates</option><option value="unclear">Unclear</option></select></label><button onClick={() => { setTrainingCategoryFilter("all"); setTrainingEventFilter("all"); setTrainingReviewFilter("all"); setActiveTrainingExampleId(null); }}>Clear filters</button></div>
        </div>
        <div className="dataset-review-layout">
          <aside className="dataset-example-list">
            <div><strong>{filtered.length} clips</strong><small>Select a clip to inspect</small></div>
            {filtered.map((example, index) => <button className={`${example.id === active?.id ? "active" : ""} ${example.reviewStatus}`} key={example.id} onClick={() => setActiveTrainingExampleId(example.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{example.correctedEvent || example.event}</strong><small>{example.originalTime} • {example.zone || "No zone"}</small></div><i>{["trusted", "approved"].includes(example.reviewStatus) ? "✓" : "!"}</i></button>)}
          </aside>
          <section className="panel dataset-review-player">
            {active ? <>
              <div className="dataset-video-frame"><video key={active.clipUrl} src={active.clipUrl} controls autoPlay /></div>
              <div className="dataset-clip-navigation"><button disabled={activeIndex <= 0} onClick={() => move(active.id, -1)}>← Previous</button><span>Clip {activeIndex + 1} of {filtered.length}</span><button disabled={activeIndex >= filtered.length - 1} onClick={() => move(active.id, 1)}>Next →</button></div>
              <div className="dataset-example-meta"><div><p className="eyebrow">Inspecting Training Clip</p><h2>{active.correctedEvent || active.event}</h2><p>{active.originalTime} • {active.zone || "Zone not tagged"} • source timestamp {formatTime(active.timestamp)}</p></div><span className={`review-status ${active.reviewStatus}`}>{["trusted", "approved"].includes(active.reviewStatus) ? "Trusted manual label" : active.reviewStatus}</span></div>
              <label className="dataset-correct-label"><span>Correct event label</span><input key={`${active.id}-${active.correctedEvent || active.event}`} defaultValue={active.correctedEvent || active.event} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== (active.correctedEvent || active.event)) void updateTrainingReview(selectedDataset.id, active.id, active.reviewStatus, value); }} /></label>
              <div className="dataset-decision-actions">
                {!["trusted", "approved"].includes(active.reviewStatus) && <button className="undo-review-btn" onClick={() => void decide("trusted")}>↶ Clear Issue</button>}
                <button onClick={() => void decide("rejected")}>Broken / Wrong Clip</button>
                <button onClick={() => void decide("duplicate")}>Mark Duplicate</button>
                <button onClick={() => void decide("unclear")}>Mark Unclear</button>
                <button className="primary-btn" onClick={() => move(active.id, 1)}>Looks Good • Next</button>
              </div>
            </> : <div className="ai-empty-review"><strong>No examples match these filters</strong><p>Change the event or review-status filter to continue.</p></div>}
          </section>
        </div>
      </section>
    );
  }

  function TrainingLibraryPanel() {
    const importedEvents = trainingProject?.events || [];
    const latestTimestamp = Math.max(0, ...importedEvents.map((event) => Number(event.seconds) || 0));
    const timelineValid = Boolean(trainingVideo?.duration && latestTimestamp <= trainingVideo.duration + 2);
    const eventCounts = importedEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.event] = (counts[event.event] || 0) + 1;
      return counts;
    }, {});
    const groups = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]);
    const ready = Boolean(trainingVideo && trainingProject && timelineValid && trainingPermission);
    const previewClips = importedEvents.slice(0, 12).map((event) => ({
      ...event,
      clipStart: Math.max(0, event.seconds - 7),
      clipEnd: trainingVideo?.duration ? Math.min(trainingVideo.duration, event.seconds + 4) : event.seconds + 4,
    }));
    return (
      <section className="training-library">
        <div className="training-library-switch">
          <button className={trainingLibraryMode === "import" ? "active" : ""} onClick={() => setTrainingLibraryMode("import")}>Import Match</button>
          <button className={trainingLibraryMode === "review" ? "active" : ""} onClick={() => { setTrainingLibraryMode("review"); void loadTrainingDatasets(true); }}>Inspect Training Data</button>
        </div>
        {trainingLibraryMode === "review" ? TrainingDatasetReview() : <>
        <div className="training-import-grid">
          <section className="panel training-source-card">
            <p className="eyebrow">Step 1 • Pair the source files</p>
            <h2>Import an Analysed Match</h2>
            <p className="muted">The original footage stays in its current folder. The library stores its location and builds smaller labelled examples from the matching analysis.</p>
            <div className={`training-file ${trainingVideo ? "ready" : ""}`}>
              <span>{trainingVideo ? "✓" : "1"}</span><div><strong>{trainingVideo?.name || "Original match footage"}</strong><small>{trainingVideo ? `${trainingVideo.duration ? formatTime(trainingVideo.duration) : "Duration unavailable"} • referenced in place` : "MP4, MOV, AVI, MKV or M4V"}</small></div><button onClick={chooseTrainingVideo}>{trainingVideo ? "Change" : "Choose Video"}</button>
            </div>
            <div className={`training-file ${trainingProject ? "ready" : ""}`}>
              <span>{trainingProject ? "✓" : "2"}</span><div><strong>{trainingProject?.name || "Matching .ras analysis"}</strong><small>{trainingProject ? `${trainingProject.events.length} valid tagged events` : "Must have been created from this exact video timeline"}</small></div><button onClick={() => trainingProjectInputRef.current?.click()}>{trainingProject ? "Change" : "Choose .ras"}</button>
              <input ref={trainingProjectInputRef} hidden type="file" accept=".ras,application/json" onChange={(event) => { importTrainingProject(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </div>
            <div className="training-validation">
              <div className={trainingVideo ? "pass" : ""}><span>{trainingVideo ? "✓" : "○"}</span> Footage linked</div>
              <div className={trainingProject ? "pass" : ""}><span>{trainingProject ? "✓" : "○"}</span> Analysis readable</div>
              <div className={timelineValid ? "pass" : trainingVideo && trainingProject ? "fail" : ""}><span>{timelineValid ? "✓" : trainingVideo && trainingProject ? "!" : "○"}</span> Timeline fits footage</div>
            </div>
          </section>

          <section className="panel training-details-card">
            <p className="eyebrow">Step 2 • Match context</p>
            <h2>Describe the Footage</h2>
            <div className="training-fields">
              <label><span>Your team</span><input value={trainingProject?.matchName || ""} readOnly placeholder="Read from .ras" /></label>
              <label><span>Opposition</span><input value={trainingProject?.opposition || ""} readOnly placeholder="Read from .ras" /></label>
              <label><span>Your jersey colour</span><input value={trainingTeamColour} onChange={(event) => setTrainingTeamColour(event.target.value)} placeholder="e.g. Navy blue" /></label>
              <label><span>First-half direction</span><select value={trainingDirection} onChange={(event) => setTrainingDirection(event.target.value)}><option value="unknown">Not confirmed</option><option value="left-right">Left to right</option><option value="right-left">Right to left</option></select></label>
              <label><span>Camera setup</span><select value={trainingCamera} onChange={(event) => setTrainingCamera(event.target.value)}><option value="single-wide">Single wide camera</option><option value="broadcast">Broadcast / multiple cameras</option><option value="phone">Phone or handheld</option><option value="other">Other</option></select></label>
            </div>
            <label className="training-consent"><input type="checkbox" checked={trainingPermission} onChange={(event) => setTrainingPermission(event.target.checked)} /><span><strong>Local AI training/testing permitted</strong><small>I confirm this footage may be processed locally to develop and test the rugby detection system.</small></span></label>
            {isBuildingTrainingDataset && <div className="training-render-progress"><div><span>{trainingProgress?.event || "Preparing dataset"}</span><strong>{Math.round(trainingProgress?.percent || 0)}%</strong></div><i><b style={{ width: `${trainingProgress?.percent || 0}%` }} /></i><small>{trainingProgress?.completed || 0} of {trainingProgress?.total || importedEvents.length} clips extracted</small></div>}
            <button className="primary-btn training-build-btn" disabled={!ready || isBuildingTrainingDataset} onClick={buildTrainingDataset}>{isBuildingTrainingDataset ? "Extracting Training Clips…" : "Add Match to Training Library"}</button>
          </section>
        </div>

        <section className="panel training-summary-card">
          <div className="section-head"><div><p className="eyebrow">Dataset Preview</p><h2>{trainingProject ? `${trainingProject.matchName || "Team"} vs ${trainingProject.opposition || "Opposition"}` : "Waiting for an analysed match"}</h2></div><span>{importedEvents.length} examples</span></div>
          {groups.length ? <div className="training-event-counts">{groups.map(([event, count]) => <div key={event}><strong>{count}</strong><span>{event}</span></div>)}</div> : <div className="ai-empty-review"><strong>No event data imported</strong><p>Select a matching video and .ras file to see exactly what this match can teach the AI.</p></div>}
        </section>

        {previewClips.length > 0 && <section className="panel training-clips-card">
          <div className="section-head"><div><p className="eyebrow">Proposed Training Clips</p><h2>Timestamp Windows</h2></div><span>Showing first {previewClips.length}</span></div>
          <div className="training-clip-list">{previewClips.map((clip) => <button key={clip.id} onClick={() => { if (trainingVideo) { setRawVideoPath(trainingVideo.path); setRawVideoName(trainingVideo.name); setRawVideoUrl(trainingVideo.url); setPlaybackVideoUrl(trainingVideo.url); window.setTimeout(() => seekVideo(clip.seconds), 0); } }}><span>{clip.time}</span><div><strong>{clip.event}</strong><small>{clip.zone || "Zone not tagged"} • {formatTime(clip.clipStart)} to {formatTime(clip.clipEnd)}</small></div><i>Preview →</i></button>)}</div>
        </section>}
        </>}
      </section>
    );
  }

  function PlaysPage() {
    const pending = aiReviewEvents.filter((event) => event.reviewStatus === "pending");
    const accepted = aiReviewEvents.filter((event) => event.reviewStatus === "accepted");
    const detectionGroups = [
      ["Attack", "Possession sequences, phases, gainline, ruck speed and outcomes"],
      ["Set Piece", "Scrums, lineouts, launch types and retained or lost possession"],
      ["Kicking", "Exits, contestables, clearances, outcomes and end zones"],
      ["Defence", "Tackles, missed tackles, turnovers, penalties and tries conceded"],
      ["Maul & Restart", "Maul outcomes, kick-offs, 22 drop-outs and receiving outcomes"],
    ];
    return (
      <main className="ras-shell ai-shell">
        <div className="grid-bg" />
        <Topbar moduleTitle="AI Match Analysis • Beta" />
        <section className="analysis-toolbar ai-toolbar">
          <button className="home-btn" onClick={() => setView("home")}>← Home</button>
          <button className="secondary-btn" onClick={chooseMatchFootage}>{rawVideoPath ? "Change Footage" : "Load Match Footage"}</button>
          <button className="primary-btn" disabled={aiScanStatus === "scanning"} onClick={beginAIScan}>{aiScanStatus === "scanning" ? "Scanning Match…" : "Run AI Match Scan"}</button>
          <button className="secondary-btn" disabled={aiScanStatus !== "review"} onClick={() => aiGroundTruthInputRef.current?.click()}>Compare Hidden .ras</button>
          <input ref={aiGroundTruthInputRef} hidden type="file" accept=".ras,application/json" onChange={(event) => { compareAIGroundTruth(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <button className="secondary-btn" onClick={() => setView("analysis")}>Open Manual Analysis</button>
        </section>

        <section className="ai-beta-banner">
          <div><span className="ai-beta-pill">BETA</span><p className="eyebrow">Human-reviewed rugby intelligence</p><h1>Let AI prepare the match.<br /><em>You make the call.</em></h1></div>
          <p>AI suggestions remain isolated here until you approve them. Manual tags, reports and compilation tools are never changed automatically.</p>
        </section>

        <nav className="ai-module-tabs">
          <button className={aiTab === "analyse" ? "active" : ""} onClick={() => setAiTab("analyse")}><span>01</span><div><strong>Analyse New Match</strong><small>Scan unanalysed footage</small></div></button>
          <button className={aiTab === "training" ? "active" : ""} onClick={() => setAiTab("training")}><span>02</span><div><strong>Training Library</strong><small>Import video + .ras pairs</small></div></button>
        </nav>

        {aiTab === "training" ? TrainingLibraryPanel() : <>
        <section className="match-setup ai-match-setup">
          <input placeholder="Your Team" value={matchName} onChange={(event) => setMatchName(event.target.value)} />
          <input placeholder="Opposition" value={opposition} onChange={(event) => setOpposition(event.target.value)} />
          <input placeholder="Competition" value={competition} onChange={(event) => setCompetition(event.target.value)} />
          <input placeholder="Your jersey colour" value={aiTeamColour} onChange={(event) => setAiTeamColour(event.target.value)} />
          <input placeholder="Opposition jersey colour" value={aiOppositionColour} onChange={(event) => setAiOppositionColour(event.target.value)} />
          <label className="select-field"><span>First-half direction</span><select value={aiDirection} onChange={(event) => setAiDirection(event.target.value)}><option value="unknown">Not confirmed</option><option value="left-right">Left to right</option><option value="right-left">Right to left</option></select></label>
          <label className="select-field"><span>Camera setup</span><select value={aiCamera} onChange={(event) => setAiCamera(event.target.value)}><option value="single-wide">Single wide camera</option><option value="broadcast">Broadcast / multiple cameras</option><option value="phone">Phone or handheld</option></select></label>
        </section>

        <section className="ai-workspace">
          <div className="ai-video-column">
            <VideoPlayer videoRef={videoRef} rawVideoPath={rawVideoPath} playbackVideoUrl={playbackVideoUrl} rawVideoUrl={rawVideoUrl} rawVideoName={rawVideoName} isOptimisingVideo={isOptimisingVideo} playbackRate={playbackRate} onLoadVideo={chooseMatchFootage} onError={handleVideoPlaybackError} onSeek={seekVideo} onSpeedChange={changePlaybackRate} />
            <section className="panel ai-scan-card">
              <div className="section-head"><div><p className="eyebrow">Experimental Full-Match Classifier</p><h2>{aiScanStage}</h2></div><span>{aiScanProgress}%</span></div>
              <div className="ai-progress"><i style={{ width: `${aiScanProgress}%` }} /></div>
              <div className="ai-scan-steps"><span className={aiScanProgress >= 12 ? "active" : ""}>Video preparation</span><span className={aiScanProgress >= 45 ? "active" : ""}>Rugby event detection</span><span className={aiScanProgress >= 75 ? "active" : ""}>Confidence scoring</span><span className={aiScanProgress === 100 ? "active" : ""}>Analyst review</span></div>
              <button className="primary-btn ai-scan-main-btn" disabled={aiScanStatus === "scanning"} onClick={beginAIScan}>{aiScanStatus === "scanning" ? `Scanning Match • ${aiScanProgress}%` : aiScanStatus === "review" ? "Run Full AI Scan Again" : "Start Full AI Match Scan"}</button>
            </section>
          </div>

          <div className="ai-review-column">
            <section className="panel ai-review-card">
              <div className="section-head"><div><p className="eyebrow">Review Queue</p><h2>AI Suggestions</h2></div><span>{pending.length} pending</span></div>
              <div className="ai-review-summary"><div><strong>{aiReviewEvents.length}</strong><span>Detected</span></div><div><strong>{accepted.length}</strong><span>Approved</span></div><div><strong>{pending.length}</strong><span>Needs review</span></div></div>
              {aiReviewEvents.length === 0 ? <div className="ai-empty-review"><strong>No AI suggestions yet</strong><p>Load footage and run a scan. Detected moments will appear here with timestamps, confidence and short video previews.</p></div> :
                <div className="ai-review-list">{aiReviewEvents.map((event) => <article className={`ai-review-event ${event.reviewStatus}`} key={event.id}><div><span>{event.time}</span><strong>{event.event}</strong><small>{event.zone} • {Math.round(event.confidence * 100)}% confidence</small><p>{event.explanation}</p></div><div className="ai-review-actions"><button onClick={() => seekVideo(event.seconds)}>Preview</button><button className="negative" onClick={() => reviewAIEvent(event.id, "rejected")}>Reject</button><button className="positive" onClick={() => reviewAIEvent(event.id, "accepted")}>Accept</button></div></article>)}</div>}
              <button className="primary-btn ai-send-approved" disabled={!accepted.length} onClick={sendApprovedAIEvents}>Send Approved Events to Match Analysis</button>
            </section>
          </div>
        </section>

        {aiComparison && <section className="panel ai-comparison-card">
          <div className="section-head"><div><p className="eyebrow">Blind-Test Comparison</p><h2>AI Predictions vs Manual Ground Truth</h2></div><span>{aiGroundTruth?.name}</span></div>
          <div className="ai-comparison-grid">
            <div className="positive"><strong>{aiComparison.correct}</strong><span>Exact event matches</span></div>
            <div><strong>{aiComparison.wrongLabel}</strong><span>Right time, wrong label</span></div>
            <div className="negative"><strong>{aiComparison.falseDetections}</strong><span>False detections</span></div>
            <div className="negative"><strong>{aiComparison.missed}</strong><span>Manual events missed</span></div>
            <div><strong>{aiComparison.meanTimingError.toFixed(1)}s</strong><span>Average timing error</span></div>
            <div><strong>{aiComparison.totalGroundTruth}</strong><span>Ground-truth events</span></div>
          </div>
          {isLearningGroundTruth && <div className="training-render-progress"><div><span>{trainingProgress?.event || "Building trusted training examples"}</span><strong>{Math.round(trainingProgress?.percent || 0)}%</strong></div><i><b style={{ width: `${trainingProgress?.percent || 0}%` }} /></i></div>}
          <button className="primary-btn" disabled={isLearningGroundTruth} onClick={learnFromAIGroundTruth}>{isLearningGroundTruth ? "Learning From Ground Truth…" : "Add Correct .ras to Training Library"}</button>
        </section>}

        <section className="panel ai-coverage-card">
          <div className="section-head"><div><p className="eyebrow">Manual Analysis Coverage</p><h2>Built Around Your Existing Workflow</h2></div><span>Shared event system</span></div>
          <div className="ai-coverage-grid">{detectionGroups.map(([title, description]) => <article key={title}><span>✓</span><div><strong>{title}</strong><p>{description}</p></div></article>)}</div>
        </section>
        </>}
        <NoticeToast />
      </main>
    );
  }

  function ActivityOverlay() {
    const clipStages = ["Preparing coaching package", "Building title cards", "Rendering compilation videos", "Finalising exported files"];
    const activity = updateProgress !== null && updateProgress < 100
      ? { eyebrow: "App Update", title: "Downloading the latest build", detail: `${updateProgress}% complete`, progress: updateProgress }
      : isGeneratingCompilation
        ? { eyebrow: "Clip Engine", title: compilationProgress?.group ? `Rendering ${compilationProgress.group}` : clipStages[clipStage], detail: compilationProgress ? `Clip ${compilationProgress.clip || 0} of ${compilationProgress.groupClips || 0} • ${compilationProgress.completed} of ${compilationProgress.total} overall` : `${generatedClips.length} compilation groups in the render queue`, progress: compilationProgress ? Math.round(compilationProgress.percent) : null }
        : isGenerating
          ? { eyebrow: "Clip Engine", title: "Generating test clip", detail: "Preparing a short quality-check export", progress: null }
          : isOptimisingVideo
            ? { eyebrow: "Video Engine", title: "Optimising match footage", detail: "Creating a smooth playback copy without changing the original", progress: null }
            : isCloudUploading
              ? { eyebrow: "Private Cloud", title: "Uploading match footage", detail: `${cloudUploadProgress}% complete • safe to retry if interrupted`, progress: cloudUploadProgress }
              : null;
    if (!activity) return null;
    return <div className="activity-backdrop" role="status" aria-live="polite"><div className="activity-card"><div className="activity-rings"><i /><i /><img src={logoSrc} alt="" /></div><p className="eyebrow">{activity.eyebrow}</p><h2>{activity.title}</h2><p>{activity.detail}</p>{activity.progress !== null ? <div className="activity-progress"><span style={{ width: `${activity.progress}%` }} /></div> : <div className="activity-loader"><span /><span /><span /></div>}{isGeneratingCompilation && <div className="activity-steps">{clipStages.map((stage, index) => <span className={index < clipStage ? "done" : index === clipStage ? "active" : ""} key={stage}>{index < clipStage ? "✓" : index === clipStage ? "●" : "○"} {stage}</span>)}</div>}</div></div>;
  }

  function AnalystGate() {
    if (profileSelected) return null;
    return <div className="analyst-gate"><div className="analyst-gate-bg" /><section className="analyst-gate-card"><img src={logoSrc} alt="Rugby Analysis Suite" /><p className="home-kicker">Internal Analyst Workspace</p><h1>Who’s analysing today?</h1><p>Select your profile to load your personal keybinds, appearance, details and recent session.</p><div className="analyst-profile-options">{analystProfiles.map((profile) => <button key={profile.id} onClick={() => chooseAnalyst(profile.id)}><span>{profile.name.split(" ").map((part) => part[0]).join("")}</span><div><strong>{profile.name}</strong><small>{profile.owner ? "Owner & Performance Analyst" : "Performance Analyst"}</small></div><i>→</i></button>)}</div><small className="ras-locked-brand">Rugby Analysis Suite branding remains locked across all profiles.</small></section></div>;
  }

  function ReliabilityModals() {
    return <>
      {showCloudSetup && <div className="reliability-modal-backdrop"><section className="reliability-modal cloud-setup-modal"><button className="notice-close" onClick={() => setShowCloudSetup(false)}>×</button><p className="eyebrow">Private Cloud Storage</p><h2>Connect Rugby Analysis Suite</h2><p>Enter the bucket-scoped Cloudflare credentials once. Windows encrypts them locally; they are never placed in a match file or report.</p><label><span>Access Key ID</span><input autoComplete="off" value={cloudAccessKey} onChange={(event) => setCloudAccessKey(event.target.value)} /></label><label><span>Secret Access Key</span><input type="password" autoComplete="new-password" value={cloudSecretKey} onChange={(event) => setCloudSecretKey(event.target.value)} /></label><div className="cloud-retention-note"><strong>60-day cost control</strong><span>Only raw footage expires automatically. Match data, reports and clips remain untouched.</span></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setShowCloudSetup(false)}>Cancel</button><button className="primary-btn" disabled={!cloudAccessKey.trim() || !cloudSecretKey.trim()} onClick={connectCloudStorage}>Verify & Connect</button></div></section></div>}
      {recoveryCandidate && <div className="reliability-modal-backdrop"><section className="reliability-modal"><p className="eyebrow">Recovered Session</p><h2>{recoveryCandidate.saved.matchName || "Previous match"}{recoveryCandidate.saved.opposition ? ` vs ${recoveryCandidate.saved.opposition}` : ""}</h2><p>We found an autosaved session from {recoveryCandidate.saved.savedAt ? new Date(recoveryCandidate.saved.savedAt).toLocaleString() : "your previous analysis"}.</p><div className="recovery-summary"><strong>{recoveryCandidate.saved.events?.length || 0}</strong><span>events recovered</span><strong>{recoveryCandidate.saved.rawVideoName ? "Ready" : "Not loaded"}</strong><span>match footage</span></div><div className="modal-actions"><button className="secondary-btn" onClick={discardRecoveredSession}>Discard</button><button className="primary-btn" onClick={restoreRecoveredSession}>Restore Session</button></div></section></div>}
      {showExportCheck && <div className="reliability-modal-backdrop"><section className="reliability-modal"><p className="eyebrow">Export Quality Check</p><h2>{exportWarnings.length} item{exportWarnings.length === 1 ? "" : "s"} to review</h2><p>The report can still be exported, but these checks may affect client-facing accuracy.</p><div className="quality-list">{exportWarnings.map((warning) => <div key={warning}><span>!</span><p>{warning}</p></div>)}</div><div className="modal-actions"><button className="secondary-btn" onClick={() => setShowExportCheck(false)}>Return to Analysis</button><button className="primary-btn" onClick={() => { setShowExportCheck(false); exportPDFReport(true, pendingCoachPackage); }}>Export Anyway</button></div></section></div>}
      {showShortcutGuide && <div className="reliability-modal-backdrop" onMouseDown={() => setShowShortcutGuide(false)}><section className="reliability-modal shortcut-guide" onMouseDown={(event) => event.stopPropagation()}><button className="notice-close" onClick={() => setShowShortcutGuide(false)}>×</button><p className="eyebrow">{analystProfile.name}'s Controls</p><h2>Shortcut Cheat Sheet</h2><p>Press <kbd>?</kbd> anywhere to open or close this guide.</p><div className="shortcut-guide-grid">{[
        ["Playback", [["Play / Pause",keybinds.playPause],["Back 10s",keybinds.seekBack],["Forward 10s",keybinds.seekForward],["Faster",keybinds.speedUp],["Slower",keybinds.speedDown]]],
        ["Attack Phase", [["Gainline Won",keybinds.gainlineWon],["Neutral",keybinds.gainlineNeutral],["Lost",keybinds.gainlineLost],["Quick Ruck",keybinds.ruckQuick],["Average Ruck",keybinds.ruckAverage],["Slow Ruck",keybinds.ruckSlow],["Complete Phase",keybinds.completePhase]]],
        ["Defence", [["Tackle Made",keybinds.tackleMade],["Tackle Missed",keybinds.tackleMissed],["Ball Won",keybinds.ballWon],["Penalty Won",keybinds.penaltyWon],["Penalty Conceded",keybinds.penaltyConceded]]],
      ].map(([title, items]) => <div key={title as string}><h3>{title as string}</h3>{(items as string[][]).map(([label,key]) => <p key={label}><span>{label}</span><kbd>{key}</kbd></p>)}</div>)}</div></section></div>}
    </>;
  }

  const page = view === "analysis" ? AnalysisPage()
    : view === "compilations" ? CompilationVideosPage()
      : view === "opposition" ? OppositionAnalysisPage()
      : view === "settings" ? SettingsPage()
        : view === "support" ? SupportPage()
          : view === "plays" ? PlaysPage()
            : Home();
  return <>{page}<ActivityOverlay /><AnalystGate /><ReliabilityModals /></>;
}
