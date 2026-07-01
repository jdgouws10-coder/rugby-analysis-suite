import { memo, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import "./App.css";

const logoSrc = import.meta.env.DEV ? "/ras-logo.png" : "./ras-logo.png";
const heroBgSrc = import.meta.env.DEV ? "/App theme.jpg" : "./App theme.jpg";

declare global {
  interface Window {
    electronAPI: {
      selectVideo: () => Promise<{ path: string; name: string; url: string } | null>;
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
        groups: { type: string; clips: { rawStart: number; rawEnd: number }[] }[];
      }) => Promise<{ success: boolean; outputs?: string[]; message?: string }>;
    };
  }
}

type View = "home" | "analysis" | "compilations" | "plays" | "support";
type NoticeType = "success" | "warning" | "error" | "info";
type Panel = "attack" | "defence";
type PanelSwitching = "automatic" | "manual";
type AnalysisLevel = "basic" | "standard" | "detailed";
type EventCategory = "attack" | "set-piece" | "kick" | "defence" | "maul";

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
  phases?: number;
  outcome?: string;
  reason?: string;
  note?: string;
};

type ClipGroup = {
  type: string;
  clips: {
    id: number;
    label: string;
    originalTime: string;
    rawStart: number;
    rawEnd: number;
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
};

const pitchZones = ["Opp 22", "Opp Half", "Midfield", "Own Half", "Own 22"];
const attackTypes = ["Set Piece", "Transition", "Kick Return", "Maul"];
const successfulAttackOutcomes = ["Penalty Won", "3 Points", "5 Points", "7 Points", "Held Up – Retain Ball"];
const goldZoneSuccessOutcomes = ["3 Points", "5 Points", "7 Points"];

const ballLostReasons = [
  "Knock-on",
  "Forward Pass",
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

const clipTypeOptions = [
  "Gold Zone Entries",
  "Set Piece Attack",
  "Transition Attack",
  "Kick Return Attack",
  "Maul Attack",
  "Penalty Won",
  "3 Points",
  "5 Points",
  "7 Points",
  "Ball Lost",
  "Held Up – Retain Ball",
  "Lineout Won",
  "Lineout Lost",
  "Scrum Won",
  "Scrum Lost",
  "Kick Regained",
  "Kick Lost",
  "Good Exit",
  "Bad Exit",
  "Tackle Made",
  "Tackle Missed",
  "Ball Won",
  "Opponent Lineout Stolen",
  "Opponent Scrum Stolen",
  "Try Conceded",
  "Penalty Conceded",
  "Maul Retained",
  "Maul Penalty Won",
  "Maul Try",
  "Maul Sacked",
  "Maul Lost",
];

const clipPaddingPresets: {
  id: ClipPaddingPresetId;
  title: string;
  description: string;
  before: number;
  after: number;
}[] = [
  { id: "quick", title: "Quick Review", description: "Short clips for fast review.", before: 10, after: 5 },
  { id: "coach", title: "Coach Review", description: "Best default for rugby context.", before: 20, after: 8 },
  { id: "deep", title: "Deep Analysis", description: "Longer build-up and follow-up.", before: 30, after: 10 },
];

const attackOutcomeOptions = ["Penalty Won", "3 Points", "5 Points", "7 Points", "Ball Lost", "Held Up – Retain Ball"];
const defenceEventOptions = ["Tackle Made", "Tackle Missed", "Ball Won", "Opponent Lineout Stolen", "Opponent Scrum Stolen", "Penalty Won", "Penalty Conceded", "Try Conceded"];
const setPieceEventOptions = ["Lineout Won", "Lineout Lost", "Scrum Won", "Scrum Lost"];
const kickOutcomeOptions = ["Good Exit", "Bad Exit", "Kick Regained", "Kick Lost"];

const maulOutcomeOptions = ["Maul Retained", "Maul Penalty Won", "Maul Try", "Maul Sacked", "Maul Lost"];

function attackTypeFromEvent(event: EventLog) {
  return event.attackType || event.event.replace(" Attack", "") || "Transition";
}

function reasonOptionsForEdit(category: EventCategory, eventName: string, outcome: string) {
  if (category === "attack" && outcome === "Ball Lost") return ballLostReasons;
  if (category === "attack" && outcome === "Penalty Won") return penaltyReasons;
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
  if (event.category === "attack") return `${event.attackType} Attack • ${event.zone} • ${event.outcome}${reason}`;
  if (event.category === "kick") return `Kick Event • ${event.zone} • ${event.outcome}${reason}`;
  if (event.category === "defence") return `${event.event} • ${event.zone}${reason}`;
  if (event.category === "maul") return `${event.event} • ${event.zone}${reason}`;
  return `${event.event} • ${event.zone}${reason}`;
}

function matchesClipType(event: EventLog, type: string) {
  if (type === "Gold Zone Entries") return event.category === "attack" && event.zone === "Opp 22";
  if (type.endsWith("Attack")) return event.category === "attack" && event.attackType === type.replace(" Attack", "");
  if (["Penalty Won", "3 Points", "5 Points", "7 Points", "Ball Lost", "Held Up – Retain Ball"].includes(type)) {
    return event.outcome === type;
  }
  if (["Kick Regained", "Kick Lost", "Good Exit", "Bad Exit"].includes(type)) return event.category === "kick" && event.outcome === type;
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
  if (["Penalty Won", "3 Points", "5 Points", "7 Points", "Kick Regained", "Good Exit", "Lineout Won", "Scrum Won", "Ball Won", "Opponent Lineout Stolen", "Opponent Scrum Stolen", "Tackle Made", "Maul Try", "Maul Penalty Won", "Maul Retained", "Held Up – Retain Ball"].includes(outcome)) return "positive";
  if (["Ball Lost", "Kick Lost", "Bad Exit", "Lineout Lost", "Scrum Lost", "Penalty Conceded", "Tackle Missed", "Try Conceded", "Maul Lost", "Maul Sacked"].includes(outcome)) return "negative";
  return "neutral";
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
  const [notice, setNotice] = useState<Notice | null>(null);

  const [matchName, setMatchName] = useState("");
  const [opposition, setOpposition] = useState("");
  const [competition, setCompetition] = useState("");
  const [events, setEvents] = useState<EventLog[]>([]);
  const [selectedZone, setSelectedZone] = useState("Midfield");

  const [activePanel, setActivePanel] = useState<Panel>("attack");
  const [panelSwitching, setPanelSwitching] = useState<PanelSwitching>("automatic");
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>("standard");
  const [playbackRate, setPlaybackRate] = useState(1);

  const [attackActive, setAttackActive] = useState(false);
  const [attackStartZone, setAttackStartZone] = useState("");
  const [currentAttackType, setCurrentAttackType] = useState("");
  const [phaseCount, setPhaseCount] = useState(0);
  const [maulActive, setMaulActive] = useState(false);
  const [maulStartZone, setMaulStartZone] = useState("");
  const [maulPhaseCount, setMaulPhaseCount] = useState(0);
  const [ballLostReason, setBallLostReason] = useState("Knock-on");
  const [ballWonReason, setBallWonReason] = useState("Jackal");
  const [penaltyWonReason, setPenaltyWonReason] = useState("Holding On");
  const [penaltyConcededReason, setPenaltyConcededReason] = useState("Offside");

  const [rawVideoName, setRawVideoName] = useState("");
  const [rawVideoPath, setRawVideoPath] = useState("");
  const [rawVideoUrl, setRawVideoUrl] = useState("");
  const [playbackVideoUrl, setPlaybackVideoUrl] = useState("");
  const [isOptimisingVideo, setIsOptimisingVideo] = useState(false);
  const [optimiseAttempted, setOptimiseAttempted] = useState(false);

  const [selectedClipTypes, setSelectedClipTypes] = useState<string[]>(["Gold Zone Entries"]);
  const [clipPaddingPresetId, setClipPaddingPresetId] = useState<ClipPaddingPresetId>("coach");
  const [generatedClips, setGeneratedClips] = useState<ClipGroup[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCompilation, setIsGeneratingCompilation] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [editingEvent, setEditingEvent] = useState<EditableEvent | null>(null);

  const attacks = events.filter((event) => event.category === "attack");
  const defenceEvents = events.filter((event) => event.category === "defence");
  const totalAttacks = attacks.length;
  const successfulAttacks = attacks.filter((event) => successfulAttackOutcomes.includes(event.outcome || "")).length;
  const ballLosses = attacks.filter((event) => event.outcome === "Ball Lost").length;
  const lineoutsWon = events.filter((event) => event.event === "Lineout Won").length;
  const lineoutsLost = events.filter((event) => event.event === "Lineout Lost").length;
  const scrumsWon = events.filter((event) => event.event === "Scrum Won").length;
  const scrumsLost = events.filter((event) => event.event === "Scrum Lost").length;
  const totalLineouts = lineoutsWon + lineoutsLost;
  const totalScrums = scrumsWon + scrumsLost;
  const kickEvents = events.filter((event) => event.category === "kick");
  const contestableKicks = kickEvents.filter((event) => event.outcome === "Kick Regained" || event.outcome === "Kick Lost");
  const kickRegained = contestableKicks.filter((event) => event.outcome === "Kick Regained").length;
  const exitKicks = kickEvents.filter((event) => event.outcome === "Good Exit" || event.outcome === "Bad Exit");
  const goodExits = exitKicks.filter((event) => event.outcome === "Good Exit").length;
  const goldZoneEntries = attacks.filter((event) => event.zone === "Opp 22");
  const successfulGoldZoneEntries = goldZoneEntries.filter((event) => goldZoneSuccessOutcomes.includes(event.outcome || ""));
  const goldZonePoints = goldZoneEntries.reduce((total, event) => {
    if (event.outcome === "3 Points") return total + 3;
    if (event.outcome === "5 Points") return total + 5;
    if (event.outcome === "7 Points") return total + 7;
    return total;
  }, 0);
  const tackleMade = defenceEvents.filter((event) => event.event === "Tackle Made").length;
  const tackleMissed = defenceEvents.filter((event) => event.event === "Tackle Missed").length;
  const ballWon = defenceEvents.filter((event) => event.event === "Ball Won" || event.event === "Opponent Lineout Stolen" || event.event === "Opponent Scrum Stolen").length;
  const penaltiesConceded = defenceEvents.filter((event) => event.event === "Penalty Conceded" || event.outcome === "Penalty Conceded").length;
  const rippedBalls = defenceEvents.filter((event) => event.reason === "Ripped Ball").length;
  const oppKicks = defenceEvents.filter((event) => event.reason === "Opp Kick").length;
  const opponentLineoutsStolen = defenceEvents.filter((event) => event.event === "Opponent Lineout Stolen" || event.outcome === "Opponent Lineout Stolen").length;
  const opponentScrumsStolen = defenceEvents.filter((event) => event.event === "Opponent Scrum Stolen" || event.outcome === "Opponent Scrum Stolen").length;
  const triesConceded = defenceEvents.filter((event) => event.event === "Try Conceded" || event.outcome === "Try Conceded").length;

  const totalPreviewClips = generatedClips.reduce((total, group) => total + group.clips.length, 0);
  const totalPreviewDuration = generatedClips.reduce((total, group) => total + totalGroupDuration(group), 0);

  const matchTitle = useMemo(() => {
    if (matchName && opposition) return `${matchName} vs ${opposition}`;
    if (matchName) return matchName;
    return "No Match Loaded";
  }, [matchName, opposition]);

  const selectedClipPadding = useMemo(() => {
    return clipPaddingPresets.find((preset) => preset.id === clipPaddingPresetId) || clipPaddingPresets[1];
  }, [clipPaddingPresetId]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || editingEvent) return;
      if (!videoRef.current) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (videoRef.current.paused) {
          void videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekVideo(-10);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekVideo(10);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingEvent]);

  function notify(title: string, message: string, type: NoticeType = "info") {
    setNotice({ title, message, type });
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
    setStatusMessage(`${file.name} loaded.`);
    notify("Match Footage Loaded", file.name, "success");
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
  }

  function addSetPiece(eventName: string) {
    addEvent({ category: "set-piece", event: eventName });
  }

  function addKick(outcome: string) {
    addEvent({ category: "kick", event: "Kick Event", outcome });
  }

  function startAttack(type: string) {
    if (!requireVideo()) return;
    setAttackActive(true);
    setAttackStartZone(selectedZone);
    setCurrentAttackType(type);
    setPhaseCount(0);
  }

  function finishAttack(outcome: string, reason?: string) {
    if (!attackActive) return;
    addEvent({
      category: "attack",
      event: `${currentAttackType} Attack`,
      attackType: currentAttackType,
      phases: phaseCount,
      outcome,
      reason,
      zone: attackStartZone,
    });
    setAttackActive(false);
    setAttackStartZone("");
    setCurrentAttackType("");
    setPhaseCount(0);
    if (outcome === "Ball Lost") autoSwitchPanel("defence", "Ball Lost was tagged.");
  }

  function addDefenceEvent(eventName: string, reason?: string) {
    addEvent({ category: "defence", event: eventName, outcome: eventName, reason });
    if (eventName === "Ball Won" || eventName === "Penalty Won") autoSwitchPanel("attack", `${eventName} was tagged.`);
  }

  function startMaul() {
    if (!requireVideo()) return;
    setMaulActive(true);
    setMaulStartZone(selectedZone);
    setMaulPhaseCount(0);
    setAttackActive(false);
    setAttackStartZone("");
    setCurrentAttackType("");
    setPhaseCount(0);
  }

  function finishMaul(outcome: string) {
    if (!maulActive) return;

    addEvent({
      category: "maul",
      event: "Maul",
      outcome,
      phases: maulPhaseCount,
      zone: maulStartZone,
    });

    const retainedZone = maulStartZone;
    setMaulActive(false);
    setMaulStartZone("");
    setMaulPhaseCount(0);

    if (outcome === "Maul Retained") {
      setAttackActive(true);
      setAttackStartZone(retainedZone || selectedZone);
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
  }

  function cancelCurrentEvent() {
    setAttackActive(false);
    setAttackStartZone("");
    setCurrentAttackType("");
    setPhaseCount(0);
    setMaulActive(false);
    setMaulStartZone("");
    setMaulPhaseCount(0);
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
    setEvents([]);
    setSelectedZone("Midfield");
    setActivePanel("attack");
    setAttackActive(false);
    setAttackStartZone("");
    setCurrentAttackType("");
    setPhaseCount(0);
    setMaulActive(false);
    setMaulStartZone("");
    setMaulPhaseCount(0);
    setRawVideoName("");
    setRawVideoPath("");
    setRawVideoUrl("");
    setPlaybackVideoUrl("");
    setOptimiseAttempted(false);
    setIsOptimisingVideo(false);
    setPlaybackRate(1);
    setGeneratedClips([]);
    setStatusMessage("Workspace cleared.");
    notify("Match Cleared", "The match, events and loaded footage were cleared.", "info");
  }

  function saveProject() {
    const project = {
      version: "1.2.0",
      matchName,
      opposition,
      competition,
      events,
      selectedZone,
      rawVideoName,
      rawVideoPath,
      rawVideoUrl,
      playbackVideoUrl,
      analysisLevel,
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
        setEvents(Array.isArray(data.events) ? data.events : []);
        setSelectedZone(data.selectedZone || "Midfield");
        setMaulActive(false);
        setMaulStartZone("");
        setMaulPhaseCount(0);
        setRawVideoName(data.rawVideoName || "");
        setRawVideoPath(data.rawVideoPath || "");
        setRawVideoUrl(data.rawVideoUrl || "");
        setPlaybackVideoUrl(data.playbackVideoUrl || data.rawVideoUrl || "");
        setAnalysisLevel(data.analysisLevel || "standard");
        setPanelSwitching(data.panelSwitching || "automatic");
        setClipPaddingPresetId(data.clipPaddingPresetId || "coach");
        setSelectedClipTypes(Array.isArray(data.selectedClipTypes) ? data.selectedClipTypes : ["Gold Zone Entries"]);
        setGeneratedClips([]);
        notify("Project Opened", `${file.name} loaded successfully.`, "success");
      } catch (error) {
        notify("Open Failed", "This .ras file could not be opened.", "error");
      }
    };
    reader.readAsText(file);
  }


  function exportPDFReport() {
    if (!events.length) {
      notify("No Events", "Tag events before exporting a stat report.", "warning");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = 18;
    const title = matchTitle === "No Match Loaded" ? "Match Analysis" : matchTitle;

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

    const attackEfficiencyValue = Number(percent(successfulAttacks, totalAttacks));
    const ballLossRateValue = Number(percent(ballLosses, totalAttacks));
    const goldZoneValue = Number(percent(successfulGoldZoneEntries.length, goldZoneEntries.length));
    const tackleCompletionValue = Number(percent(tackleMade, tackleMade + tackleMissed));
    const lineoutValue = Number(percent(lineoutsWon, totalLineouts));
    const scrumValue = Number(percent(scrumsWon, totalScrums));
    const exitValue = Number(percent(goodExits, exitKicks.length));

    const coachTargets = [
      { label: "Attack Efficiency", value: attackEfficiencyValue, display: `${attackEfficiencyValue.toFixed(1)}%`, target: "45%+", meets: attackEfficiencyValue >= 45 || totalAttacks === 0 },
      { label: "Ball Loss Rate", value: ballLossRateValue, display: `${ballLossRateValue.toFixed(1)}%`, target: "Under 18%", meets: ballLossRateValue <= 18 || totalAttacks === 0 },
      { label: "Gold Zone Conversion", value: goldZoneValue, display: `${goldZoneValue.toFixed(1)}%`, target: "60%+", meets: goldZoneValue >= 60 || goldZoneEntries.length === 0 },
      { label: "Tackle Completion", value: tackleCompletionValue, display: `${tackleCompletionValue.toFixed(1)}%`, target: "88%+", meets: tackleCompletionValue >= 88 || (tackleMade + tackleMissed) === 0 },
      { label: "Lineout Success", value: lineoutValue, display: `${lineoutValue.toFixed(1)}%`, target: "85%+", meets: lineoutValue >= 85 || totalLineouts === 0 },
      { label: "Scrum Success", value: scrumValue, display: `${scrumValue.toFixed(1)}%`, target: "90%+", meets: scrumValue >= 90 || totalScrums === 0 },
      { label: "Exit Success", value: exitValue, display: `${exitValue.toFixed(1)}%`, target: "80%+", meets: exitValue >= 80 || exitKicks.length === 0 },
    ];

    const coachSummary: string[] = [];
    const knockOns = ballLostReasonBreakdown["Knock-on"] || 0;
    const intercepts = ballLostReasonBreakdown["Intercept"] || 0;
    const takenIntoTouch = ballLostReasonBreakdown["Taken Into Touch"] || 0;
    const turnovers = ballLostReasonBreakdown["Turnover"] || 0;
    const forwardPasses = ballLostReasonBreakdown["Forward Pass"] || 0;
    const penaltiesLost = ballLostReasonBreakdown["Penalty Conceded"] || 0;

    if (attackEfficiencyValue >= 45 && totalAttacks > 0) coachSummary.push("Attack efficiency met the recommended target. Review clips to identify which shapes created the cleanest outcomes.");
    if (ballLossRateValue <= 18 && totalAttacks > 0) coachSummary.push("Ball security was within the target range. Keep reinforcing support depth and clear decision-making.");
    if (knockOns > 0) coachSummary.push(`${knockOns} knock-on(s): review carry height, contact skill, pass timing and catch quality under pressure.`);
    if (intercepts > 0) coachSummary.push(`${intercepts} intercept(s): check whether the pass was forced, whether the receiver was flat, and whether the defender was fixed before release.`);
    if (takenIntoTouch > 0) coachSummary.push(`${takenIntoTouch} taken into touch: review edge spacing, touchline awareness, support angle and whether the carrier had an inside option.`);
    if (turnovers > 0) coachSummary.push(`${turnovers} turnover(s): review cleanout arrival, support depth and whether the ball carrier became isolated.`);
    if (forwardPasses > 0) coachSummary.push(`${forwardPasses} forward pass(es): review running lines and whether the passer is drifting before release.`);
    if (penaltiesLost > 0) coachSummary.push(`${penaltiesLost} penalty loss(es): review decision-making at the breakdown and whether support players are arriving legally.`);
    if (ballLossRateValue > 18 && totalAttacks > 0) coachSummary.push("Ball loss rate is above the recommended target. Prioritise possession security before adding more attacking complexity.");
    if (goldZoneValue < 60 && goldZoneEntries.length > 0) coachSummary.push("Gold zone conversion is below target. Review shape clarity, patience, and whether the attack is creating two genuine scoring options.");
    if (triesConceded > 0) coachSummary.push(`${triesConceded} try/tries conceded: clip these moments and review defensive connection immediately after possession changes.`);
    if (!coachSummary.length) coachSummary.push("No major red flags from the logged data. Use clips to confirm the tactical picture and validate the statistics.");

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
      doc.text("Generated by Rugby Analysis Suite v1.2.0", margin, pageHeight - 8);
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

    function addParagraph(text: string) {
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - 4);
      ensureSpace(lines.length * 5 + 4);
      doc.setFontSize(9.2);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(lines, margin + 2, y);
      y += lines.length * 5 + 4;
    }

    function addTargetLine(target: typeof coachTargets[number]) {
      ensureSpace(9);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(target.label, margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(target.meets ? 34 : 220, target.meets ? 139 : 38, target.meets ? 34 : 38);
      doc.text(target.display, pageWidth - margin - 38, y, { align: "right" });
      doc.setTextColor(100, 116, 139);
      doc.text(target.target, pageWidth - margin, y, { align: "right" });
      y += 7;
    }

    function addKpiCard(x: number, label: string, value: string, meets: boolean) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, 42, 22, 3, 3, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 3, y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(meets ? 34 : 220, meets ? 139 : 38, meets ? 34 : 38);
      doc.text(value, x + 3, y + 16);
    }

    // Header
    doc.setFillColor(2, 7, 13);
    doc.rect(0, 0, pageWidth, 38, "F");
    doc.setFillColor(126, 217, 87);
    doc.rect(0, 37, pageWidth, 1.5, "F");

    const logoImage = document.querySelector<HTMLImageElement>(".logo-wrap img");
    try {
      if (logoImage && logoImage.complete && logoImage.naturalWidth > 0) {
        doc.addImage(logoImage, "PNG", margin, 7, 22, 22);
      }
    } catch (_) {}

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RUGBY STAT REPORT", margin + 28, 15);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    doc.text(title, margin + 28, 25);

    y = 50;
    if (competition) addLine("Competition", competition);
    addLine("Events Logged", events.length);
    addLine("Match Footage", rawVideoName || "Not loaded");
    addLine("Analysis Level", titleCase(analysisLevel));

    y += 3;
    const kpiY = y;
    addKpiCard(margin, "Attack Eff.", `${attackEfficiencyValue.toFixed(1)}%`, attackEfficiencyValue >= 45 || totalAttacks === 0);
    addKpiCard(margin + 46, "Gold Zone", `${goldZoneValue.toFixed(1)}%`, goldZoneValue >= 60 || goldZoneEntries.length === 0);
    addKpiCard(margin + 92, "Ball Loss", `${ballLossRateValue.toFixed(1)}%`, ballLossRateValue <= 18 || totalAttacks === 0);
    addKpiCard(margin + 138, "Exit", `${exitValue.toFixed(1)}%`, exitValue >= 80 || exitKicks.length === 0);
    y = kpiY + 24;

    addSection("ATTACK");
    addLine("Total Attacks", totalAttacks);
    addLine("Successful Attacks", successfulAttacks);
    addLine("Attack Efficiency", `${attackEfficiencyValue.toFixed(1)}%`);
    addLine("Ball Losses", ballLosses);
    addLine("Ball Loss Rate", `${ballLossRateValue.toFixed(1)}%`);
    addLine("Average Phases Per Attack", average(attacks.map((event) => event.phases || 0)));

    addSection("GOLD ZONE");
    addLine("Entries", goldZoneEntries.length);
    addLine("Successful Entries", successfulGoldZoneEntries.length);
    addLine("Gold Zone Efficiency", `${goldZoneValue.toFixed(1)}%`);
    addLine("Points Generated", goldZonePoints);

    addSection("DEFENCE");
    addLine("Tackle Made", tackleMade);
    addLine("Tackle Missed", tackleMissed);
    addLine("Tackle Completion", `${tackleCompletionValue.toFixed(1)}%`);
    addLine("Ball Won", ballWon);
    addLine("Ball Won - Ripped Ball", rippedBalls);
    addLine("Ball Won - Opp Kick", oppKicks);
    addLine("Opponent Lineout Stolen", opponentLineoutsStolen);
    addLine("Opponent Scrum Stolen", opponentScrumsStolen);
    addLine("Penalties Conceded", penaltiesConceded);
    addLine("Tries Conceded", triesConceded);

    addSection("KICKING");
    addLine("Contestable Kicks", contestableKicks.length);
    addLine("Kick Regained", kickRegained);
    addLine("Contestable Kick Effectiveness", `${percent(kickRegained, contestableKicks.length)}%`);
    addLine("Exit Kicks", exitKicks.length);
    addLine("Good Exits", goodExits);
    addLine("Exit Success", `${exitValue.toFixed(1)}%`);

    addSection("SET PIECE");
    addLine("Lineouts", `${lineoutsWon}W / ${lineoutsLost}L`);
    addLine("Lineout Success", `${lineoutValue.toFixed(1)}%`);
    addLine("Scrums", `${scrumsWon}W / ${scrumsLost}L`);
    addLine("Scrum Success", `${scrumValue.toFixed(1)}%`);

    addSection("BALL LOSS BREAKDOWN");
    if (Object.keys(ballLostReasonBreakdown).length) {
      Object.entries(ballLostReasonBreakdown)
        .sort((a, b) => b[1] - a[1])
        .forEach(([reason, count]) => addLine(reason, count));
    } else {
      addLine("Ball Lost Reasons", "None logged");
    }

    addSection("ATTACK TYPE BREAKDOWN");
    attackTypes.forEach((type) => {
      const typeAttacks = attacks.filter((event) => event.attackType === type);
      const typeSuccessful = typeAttacks.filter((event) => successfulAttackOutcomes.includes(event.outcome || "")).length;
      addLine(type, `${typeAttacks.length} attacks | ${typeSuccessful} successful | ${percent(typeSuccessful, typeAttacks.length)}% | Avg phases ${average(typeAttacks.map((event) => event.phases || 0))}`);
    });

    addSection("COACH TARGETS");
    coachTargets.forEach(addTargetLine);

    addSection("COACH SUMMARY");
    coachSummary.forEach((suggestion) => addParagraph(`• ${suggestion}`));

    addFooter();
    doc.save(`${safeFileName(title)}-stat-report.pdf`);
    notify("Stat Report Exported", `${events.length} events exported into the PDF report.`, "success");
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
        const clips = events
          .filter((event) => matchesClipType(event, type))
          .slice()
          .reverse()
          .map((event) => {
            const rawStart = Math.max(0, event.seconds - selectedClipPadding.before);
            const rawEnd = Math.max(rawStart + 1, event.seconds + selectedClipPadding.after);
            return { id: event.id, label: clipLabel(event), originalTime: event.time, rawStart, rawEnd };
          })
          .sort((a, b) => a.rawStart - b.rawStart);
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

    const orderedGroups = generatedClips.map((group) => ({ type: group.type, clips: group.clips.map((clip) => ({ rawStart: clip.rawStart, rawEnd: clip.rawEnd })) }));
    setIsGeneratingCompilation(true);
    setStatusMessage("Generating compilation videos...");

    try {
      const result = await window.electronAPI.generateCompilations({ videoPath: rawVideoPath, groups: orderedGroups });
      if (result.success) {
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
    notify("Event Updated", "The event was updated successfully.", "success");
  }

  function removeEventOutcome() {
    if (!editingEvent) return;
    setEvents((prev) => prev.map((event) => (event.id === editingEvent.id ? { ...event, outcome: undefined, reason: undefined } : event)));
    setEditingEvent(null);
    setGeneratedClips([]);
    notify("Outcome Removed", "The event outcome was removed.", "success");
  }

  function deleteEvent(id: number) {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    setGeneratedClips([]);
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
          <button className="support-btn" onClick={() => setView("support")}>Support</button>
          <span className="version-pill">v1.2.0</span>
        </div>
      </header>
    );
  }

  function NoticeToast() {
    if (!notice) return null;
    return (
      <div className={`notice-toast ${notice.type}`}>
        <button className="notice-close" onClick={() => setNotice(null)}>×</button>
        <span>{notice.type === "success" ? "✓" : notice.type === "warning" ? "!" : notice.type === "error" ? "×" : "i"}</span>
        <div>
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
        </div>
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
            <p className="home-kicker">Professional Performance Platform</p>
            <h2 className="home-title">Rugby<br /><span>Analysis</span><br />Suite</h2>
            <p className="home-subtitle">Analyse matches, create coaching clips and prepare better rugby reviews from one professional platform.</p>
            <div className="home-badges">
              <span>Match Review</span>
              <span>Video Workflow</span>
              <span>Coach Reports</span>
            </div>
          </div>
          <div className="module-stack premium-module-stack">
            <ModuleCard number="01" title="Match Analysis" status="Available" description="Tag attack, defence, kicking, set piece and maul events. Export professional coach reports." action="Open Module →" onClick={() => setView("analysis")} />
            <ModuleCard number="02" title="Auto Clip Creator" status="Available" description="Turn tagged moments into organised MP4 coaching compilations from the raw match footage." action="Launch Module →" onClick={() => setView("compilations")} highlight />
            <ModuleCard number="03" title="Attack Lab" status="In Development" description="Design, animate and test attacking ideas under the Rugby Analysis Suite brand." action="Preview →" onClick={() => setView("plays")} />
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
          <span className={props.status === "Available" ? "status available" : "status soon"}>{props.status}</span>
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
    return (
      <main className="ras-shell analysis-shell">
        <div className="grid-bg" />
        <Topbar moduleTitle="Match Analysis" />

        <section className="analysis-toolbar compact-toolbar workflow-toolbar">
          <button className="home-btn" onClick={() => setView("home")}>← Home</button>
          <button className="secondary-btn" onClick={() => projectInputRef.current?.click()}>Open Match</button>
          <input ref={projectInputRef} type="file" hidden accept=".ras,application/json" onChange={(event) => openProject(event.target.files?.[0])} />
          <button className="primary-btn" onClick={saveProject}>Save Match</button>
          <button className="danger-btn" onClick={clearWorkspace}>Clear Match</button>
          <button className="secondary-btn" onClick={exportPDFReport}>Export PDF</button>
          <button className="primary-btn wide-action" onClick={sendToCompilationVideos}>Send Events to Compilation Tool</button>
        </section>

        <section className="match-setup">
          <input placeholder="Your Team" value={matchName} onChange={(event) => setMatchName(event.target.value)} />
          <input placeholder="Opposition" value={opposition} onChange={(event) => setOpposition(event.target.value)} />
          <input placeholder="Competition" value={competition} onChange={(event) => setCompetition(event.target.value)} />
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
                <SelectField label="Analysis Level" value={analysisLevel} onChange={(value) => setAnalysisLevel(value as AnalysisLevel)}>
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                </SelectField>
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
                    <button key={zone} type="button" className={selectedZone === zone ? "active" : ""} onClick={() => setSelectedZone(zone)}>
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

            <section className="panel event-log-panel compact-log live-log">
              <div className="panel-head log-head">
                <div><p className="eyebrow">Event Log</p><h2>{events.length} Tagged Events</h2></div>
                <button className="secondary-btn small undo-btn" onClick={undoLastEvent} disabled={!events.length}>↶ Undo Last Event</button>
              </div>
              {events.length === 0 ? <div className="empty-state">Load match footage and start tagging events.</div> : <EventLogList />}
            </section>
          </div>
        </section>
        {editingEvent && <EditEventModal />}
        <NoticeToast />
      </main>
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

        {attackActive ? (
          <>
            <div className="active-strip">
              <span>Type: {currentAttackType}</span><span>Zone: {attackStartZone}</span><span>Phases: {phaseCount}</span>
            </div>
            <button className="secondary-btn small back-step-btn" onClick={cancelCurrentEvent}>← Back</button>
            <div className="button-grid six responsive-six">
              <button onClick={() => setPhaseCount((prev) => prev + 1)}>+ Phase</button>
              <button onClick={() => finishAttack("Penalty Won")}>Penalty Won</button>
              <button onClick={() => finishAttack("3 Points")}>3 Points</button>
              <button onClick={() => finishAttack("5 Points")}>5 Points</button>
              <button onClick={() => finishAttack("7 Points")}>7 Points</button>
              <button onClick={() => finishAttack("Held Up – Retain Ball")}>Held Up – Retain</button>
            </div>
            <div className="reason-row">
              <label>Ball Lost Reason<select value={ballLostReason} onChange={(event) => setBallLostReason(event.target.value)}>{ballLostReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
              <button className="danger-btn" onClick={() => finishAttack("Ball Lost", ballLostReason)}>Ball Lost</button>
            </div>
          </>
        ) : (
          <>
            <div className="button-grid four">
              {attackTypes.map((type) => <button key={type} onClick={() => startAttack(type)}>{type}</button>)}
            </div>
            <div className="sub-control-grid">
              <div>
                <p className="eyebrow">Kicking</p>
                <div className="button-grid two">
                  {selectedZone === "Own 22" ? <><button onClick={() => addKick("Good Exit")}>Good Exit</button><button className="negative" onClick={() => addKick("Bad Exit")}>Bad Exit</button></> : <><button onClick={() => addKick("Kick Regained")}>Regained</button><button className="negative" onClick={() => addKick("Kick Lost")}>Lost</button></>}
                </div>
              </div>
              <div>
                <p className="eyebrow">Set Piece</p>
                <div className="button-grid two">
                  <button onClick={() => addSetPiece("Lineout Won")}>Lineout Won</button>
                  <button className="negative-soft" onClick={() => addSetPiece("Lineout Lost")}>Lineout Lost</button>
                  <button onClick={() => addSetPiece("Scrum Won")}>Scrum Won</button>
                  <button className="negative-soft" onClick={() => addSetPiece("Scrum Lost")}>Scrum Lost</button>
                </div>
              </div>
            </div>
            {analysisLevel !== "basic" && (
              <div className="maul-box">
                <p className="eyebrow">Maul</p>
                {maulActive ? (
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
                ) : (
                  <div className="button-grid one">
                    <button onClick={startMaul}>Maul Started</button>
                  </div>
                )}
              </div>
            )}
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
        <div className="button-grid two">
          <button onClick={() => addDefenceEvent("Tackle Made")}>Tackle Made</button>
          <button className="negative" onClick={() => addDefenceEvent("Tackle Missed")}>Tackle Missed</button>
          <button onClick={() => addDefenceEvent("Opponent Lineout Stolen")}>Opponent Lineout Stolen</button>
          <button onClick={() => addDefenceEvent("Opponent Scrum Stolen")}>Opponent Scrum Stolen</button>
          <button className="negative" onClick={() => addDefenceEvent("Try Conceded")}>Try Conceded</button>
        </div>
        <div className="reason-grid">
          <label>Ball Won Reason<select value={ballWonReason} onChange={(event) => setBallWonReason(event.target.value)}>{ballWonReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button onClick={() => addDefenceEvent("Ball Won", ballWonReason)}>Ball Won</button>
          <label>Penalty Won Reason<select value={penaltyWonReason} onChange={(event) => setPenaltyWonReason(event.target.value)}>{penaltyReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button onClick={() => addDefenceEvent("Penalty Won", penaltyWonReason)}>Penalty Won</button>
          <label>Penalty Conceded Reason<select value={penaltyConcededReason} onChange={(event) => setPenaltyConcededReason(event.target.value)}>{penaltyConcededReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <button className="negative" onClick={() => addDefenceEvent("Penalty Conceded", penaltyConcededReason)}>Penalty Conceded</button>
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
            <strong>{event.category === "attack" ? `${event.attackType} Attack` : event.event}</strong>
            <span>{event.zone}</span>
            <span>{event.category === "attack" ? `${event.phases || 0} phases • ${event.outcome || "No outcome"}` : event.outcome || event.category}</span>
            <span>{event.reason || "—"}</span>
            <div className="event-actions">
              <button onClick={() => openEditEvent(event)}>Edit</button>
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
            <div className="options">
              {clipTypeOptions.map((type) => <button key={type} onClick={() => toggleClipType(type)} className={selectedClipTypes.includes(type) ? "selected" : ""}>{selectedClipTypes.includes(type) ? "✓ " : ""}{type}</button>)}
            </div>
            <div className="padding-card">
              <div className="section-head compact"><div><p className="eyebrow">Clip Padding</p><h2>{selectedClipPadding.before}s before / {selectedClipPadding.after}s after</h2></div></div>
              <div className="padding-presets">
                {clipPaddingPresets.map((preset) => <button key={preset.id} type="button" onClick={() => { setClipPaddingPresetId(preset.id); setGeneratedClips([]); }} className={clipPaddingPresetId === preset.id ? "active" : ""}><strong>{preset.title}</strong><span>{preset.before}s before / {preset.after}s after</span><small>{preset.description}</small></button>)}
              </div>
            </div>
            <button className="primary-btn full" onClick={generateClipList}>Build Compilation Preview</button>
          </div>

          <div className="panel preview-card">
            <div className="section-head"><div><p className="eyebrow">Compilation Preview</p><h2>Compilation Summary</h2></div><button className="secondary-btn small" onClick={() => setGeneratedClips([])}>Clear Preview</button></div>
            <div className="summary-strip"><span>{generatedClips.length} groups</span><span>{totalPreviewClips} clips</span><span>{formatTime(totalPreviewDuration)} total footage</span><span>{selectedClipPadding.before}s / {selectedClipPadding.after}s padding</span></div>
            {generatedClips.length === 0 ? <div className="empty-state">Analyse a match or import TXT, then build a compilation preview.</div> : (
              <div className="preview-list">
                {generatedClips.map((group) => <div className="clip-group" key={group.type}><div className="group-head"><div><h4>{titleCase(group.type)}</h4><p>{group.clips.length} clips • {formatTime(totalGroupDuration(group))}</p></div></div>{group.clips.map((clip, index) => <div className="clip-row" key={`${group.type}-${clip.id}-${index}`}><div><strong>Clip {index + 1}</strong><p>{clip.label}</p><small>Event: {clip.originalTime}</small></div><h4>{formatTime(clip.rawStart)} → {formatTime(clip.rawEnd)}</h4></div>)}</div>)}
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

  function PlaysPage() {
    return (
      <main className="ras-shell center-shell"><div className="grid-bg" /><div className="coming-card"><img src={logoSrc} alt="Rugby Analysis Suite" /><p className="home-kicker">In Development</p><h1>Play Creator</h1><p>Design attacking plays, strike moves and tactical animations. This module is coming soon.</p><button className="primary-btn" onClick={() => setView("home")}>← Back Home</button></div><NoticeToast /></main>
    );
  }

  if (view === "analysis") return AnalysisPage();
  if (view === "compilations") return CompilationVideosPage();
  if (view === "support") return SupportPage();
  if (view === "plays") return PlaysPage();
  return Home();
}
