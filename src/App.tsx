import { useState } from "react";
import "./App.css";

declare global {
  interface Window {
    electronAPI: {
      selectVideo: () => Promise<{
        path: string;
        name: string;
      } | null>;
      generateTestClip: (data: {
        videoPath: string;
        start: number;
        duration: number;
      }) => Promise<{
        success: boolean;
        outputPath?: string;
        message?: string;
      }>;
      generateCompilations: (data: {
        videoPath: string;
        groups: {
          type: string;
          clips: {
            rawStart: number;
            rawEnd: number;
          }[];
        }[];
      }) => Promise<{
        success: boolean;
        outputs?: string[];
        message?: string;
      }>;
    };
  }
}

type EventLog = {
  id: number;
  time: string;
  seconds: number;
  category: "attack" | "set-piece" | "kick";
  event: string;
  zone: string;
  attackType?: string;
  phases?: number;
  outcome?: string;
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

const clipTypeOptions = [
  "Gold Zone Entries",
  "Set Piece Attack",
  "Transition Attack",
  "Turnover Attack",
  "Kick Return Attack",
  "Penalty Won",
  "3 Points",
  "5 Points",
  "7 Points",
  "Ball Lost",
  "Lineout Won",
  "Lineout Lost",
  "Scrum Won",
  "Scrum Lost",
  "Kick Regained",
  "Kick Lost",
  "Good Exit",
  "Bad Exit",
];

function parseTimeToSeconds(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function matchesClipType(event: EventLog, type: string) {
  if (type === "Gold Zone Entries") {
    return event.category === "attack" && event.zone === "Opp 22";
  }

  if (type.endsWith("Attack")) {
    return event.category === "attack" && event.attackType === type.replace(" Attack", "");
  }

  if (["Penalty Won", "3 Points", "5 Points", "7 Points", "Ball Lost"].includes(type)) {
    return event.category === "attack" && event.outcome === type;
  }

  if (["Kick Regained", "Kick Lost", "Good Exit", "Bad Exit"].includes(type)) {
    return event.category === "kick" && event.outcome === type;
  }

  return event.event === type;
}

function clipLabel(event: EventLog) {
  if (event.category === "attack") {
    return `${event.attackType} Attack • ${event.zone} • ${event.outcome}`;
  }

  if (event.category === "kick") {
    return `Kick Event • ${event.zone} • ${event.outcome}`;
  }

  return `${event.event} • ${event.zone}`;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function App() {
  const [matchName, setMatchName] = useState("No Match");
  const [opposition, setOpposition] = useState("");
  const [competition, setCompetition] = useState("");
  const [events, setEvents] = useState<EventLog[]>([]);

  const [rawVideoName, setRawVideoName] = useState("");
  const [rawVideoPath, setRawVideoPath] = useState("");

  const [youtubeSyncTime, setYoutubeSyncTime] = useState("00:00");
  const [rawSyncTime, setRawSyncTime] = useState("00:00");
  const [clipBeforeSeconds, setClipBeforeSeconds] = useState(10);
  const [clipAfterSeconds, setClipAfterSeconds] = useState(5);
  const [selectedClipTypes, setSelectedClipTypes] = useState<string[]>(["Gold Zone Entries"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCompilation, setIsGeneratingCompilation] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready to build compilations.");

  const [generatedClips, setGeneratedClips] = useState<ClipGroup[]>([]);

  const offset = parseTimeToSeconds(rawSyncTime) - parseTimeToSeconds(youtubeSyncTime);
  const totalPreviewClips = generatedClips.reduce((total, group) => total + group.clips.length, 0);
  const totalPreviewDuration = generatedClips.reduce((total, group) => total + totalGroupDuration(group), 0);

  function toggleClipType(type: string) {
    setSelectedClipTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  }

  function parseAnalysisTextFile(textContent: string, fileName: string) {
    const lines = textContent.split(/\r?\n/);
    const eventLogIndex = lines.findIndex((line) => line.trim().toUpperCase() === "EVENT LOG");

    if (eventLogIndex === -1) {
      alert("No EVENT LOG section found.");
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
      const notePart = parts.find((part) => part.startsWith("Note:"));
      const note = notePart ? notePart.replace("Note:", "").trim() : undefined;

      const baseEvent = {
        id: Date.now() + index,
        time,
        seconds: parseTimeToSeconds(time),
        zone,
        note,
      };

      if (eventName.endsWith("Attack")) {
        const phasePart = parts.find((part) => part.includes("phases"));
        const outcome = parts.find(
          (part, idx) => idx > 2 && !part.includes("phases") && !part.startsWith("Note:")
        );

        importedEvents.push({
          ...baseEvent,
          category: "attack",
          event: eventName,
          attackType: eventName.replace(" Attack", ""),
          phases: phasePart ? Number(phasePart.match(/\d+/)?.[0] || 0) : 0,
          outcome: outcome || "Ball Lost",
        });
        return;
      }

      if (eventName === "Kick Event") {
        importedEvents.push({
          ...baseEvent,
          category: "kick",
          event: "Kick Event",
          outcome: parts[3] || "Kick Lost",
        });
        return;
      }

      importedEvents.push({
        ...baseEvent,
        category: "set-piece",
        event: eventName,
      });
    });

    setMatchName(importedMatchName || "Imported Match");
    setOpposition(importedOpposition);
    setCompetition(importedCompetition === "Not specified" ? "" : importedCompetition);
    setEvents(importedEvents);
    setGeneratedClips([]);
    setStatusMessage(`${importedEvents.length} events imported from ${fileName}.`);

    alert(`${importedEvents.length} events imported.`);
  }

  function importAnalysisTXT(file?: File) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => parseAnalysisTextFile(String(reader.result || ""), file.name);
    reader.readAsText(file);
  }

  function generateClipList() {
    if (events.length === 0) {
      alert("Import an analysis TXT first.");
      return;
    }

    const clipGroups = selectedClipTypes
      .map((type) => {
        const clips = events
          .filter((event) => matchesClipType(event, type))
          .map((event) => {
            const rawEventTime = Math.max(0, event.seconds + offset);
            const rawStart = Math.max(0, rawEventTime - clipBeforeSeconds);
            const rawEnd = Math.max(rawStart + 1, rawEventTime + clipAfterSeconds);

            return {
              id: event.id,
              label: clipLabel(event),
              originalTime: event.time,
              rawStart,
              rawEnd,
            };
          })
          .sort((a, b) => a.rawStart - b.rawStart);

        return { type, clips };
      })
      .filter((group) => group.clips.length > 0);

    if (clipGroups.length === 0) {
      alert("No matching events found.");
      return;
    }

    setGeneratedClips(clipGroups);
    setStatusMessage(`${clipGroups.length} compilations previewed in chronological order.`);
  }

  function clearData() {
    setMatchName("No Match");
    setOpposition("");
    setCompetition("");
    setEvents([]);
    setGeneratedClips([]);
    setStatusMessage("Data cleared.");
  }

  function totalGroupDuration(group: { clips: { rawStart: number; rawEnd: number }[] }) {
    return group.clips.reduce((total, clip) => total + Math.max(0, clip.rawEnd - clip.rawStart), 0);
  }

  async function generateTestClip() {
    if (!rawVideoPath) {
      alert("Choose your raw MOV/MP4 first.");
      return;
    }

    if (generatedClips.length === 0 || generatedClips[0].clips.length === 0) {
      alert("Preview clip times first.");
      return;
    }

    const firstClip = generatedClips[0].clips[0];
    const duration = Math.max(1, firstClip.rawEnd - firstClip.rawStart);

    setIsGenerating(true);
    setStatusMessage("Generating one test clip...");

    const result = await window.electronAPI.generateTestClip({
      videoPath: rawVideoPath,
      start: firstClip.rawStart,
      duration,
    });

    setIsGenerating(false);

    if (result.success) {
      setStatusMessage("Test clip generated successfully.");
      alert(`Test clip saved:\n${result.outputPath}`);
    } else {
      setStatusMessage("Test clip failed.");
      alert(`Could not generate clip:\n${result.message}`);
    }
  }

  async function generateFullCompilation() {
    if (!rawVideoPath) {
      alert("Choose your raw MOV/MP4 first.");
      return;
    }

    if (generatedClips.length === 0) {
      alert("Preview clip times first.");
      return;
    }

    const orderedGroups = generatedClips.map((group) => ({
      type: group.type,
      clips: [...group.clips]
        .sort((a, b) => a.rawStart - b.rawStart)
        .map((clip) => ({
          rawStart: clip.rawStart,
          rawEnd: clip.rawEnd,
        })),
    }));

    setIsGeneratingCompilation(true);
    setStatusMessage("Generating MP4 compilations with title overlays...");

    try {
      const result = await window.electronAPI.generateCompilations({
        videoPath: rawVideoPath,
        groups: orderedGroups,
      });

      if (result.success) {
        setStatusMessage(`${result.outputs?.length || 0} compilation files generated successfully.`);
        alert(`Compilations generated successfully:\n${result.outputs?.join("\n")}`);
      } else {
        setStatusMessage("Compilation generation failed.");
        alert(result.message || "Compilation failed.");
      }
    } catch (error) {
      setStatusMessage("Compilation generation failed.");
      alert(`Compilation failed: ${error}`);
    }

    setIsGeneratingCompilation(false);
  }

  return (
    <main className="app-shell">
      <div className="app-bg" />

      <header className="topbar pro-card">
        <div className="brand-block">
          <div className="brand-mark">🏉</div>
          <div>
            <p className="eyebrow">Desktop Video Engine</p>
            <h1>Rugby Compilation Engine</h1>
            <p className="subtle">Import analysis data, sync footage, generate professional MP4 compilations.</p>
          </div>
        </div>
        <div className="badge">V1 Desktop</div>
      </header>

      <section className="status-grid">
        <div className="status-card pro-card">
          <span>Events Imported</span>
          <strong>{events.length}</strong>
        </div>
        <div className="status-card pro-card">
          <span>Video Loaded</span>
          <strong>{rawVideoName ? "YES" : "NO"}</strong>
        </div>
        <div className="status-card pro-card">
          <span>Offset</span>
          <strong>{offset}s</strong>
        </div>
        <div className="status-card pro-card">
          <span>Preview Clips</span>
          <strong>{totalPreviewClips}</strong>
        </div>
      </section>

      <section className="setup-grid">
        <div className="pro-card card-large">
          <p className="eyebrow">Match Source</p>
          <h2>
            {matchName}
            {opposition ? ` vs ${opposition}` : ""}
          </h2>
          <p className="muted">{competition || "Competition not specified"}</p>

          <div className="button-row">
            <label className="button red">
              Import Analysis TXT
              <input
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={(e) => importAnalysisTXT(e.target.files?.[0])}
              />
            </label>
            <button className="button secondary" onClick={clearData}>
              Clear Data
            </button>
          </div>
        </div>

        <div className="pro-card card-large">
          <p className="eyebrow">Raw Footage</p>
          <h2>Load MOV / MP4</h2>

          <div
            className="upload"
            onClick={async () => {
              const file = await window.electronAPI.selectVideo();

              if (!file) return;

              setRawVideoName(file.name);
              setRawVideoPath(file.path);
              setStatusMessage(`${file.name} loaded.`);
            }}
          >
            <span className="upload-icon">🎥</span>
            <strong>Choose Match Footage</strong>
            <small>{rawVideoName || "No file selected"}</small>
          </div>
        </div>

        <div className="pro-card card-large">
          <p className="eyebrow">Sync & Padding</p>
          <h2>Timing Setup</h2>

          <div className="two">
            <label>
              YouTube Sync Time
              <input value={youtubeSyncTime} onChange={(e) => setYoutubeSyncTime(e.target.value)} />
            </label>
            <label>
              Raw Sync Time
              <input value={rawSyncTime} onChange={(e) => setRawSyncTime(e.target.value)} />
            </label>
            <label>
              Before Clip
              <input
                type="number"
                value={clipBeforeSeconds}
                onChange={(e) => setClipBeforeSeconds(Number(e.target.value))}
              />
            </label>
            <label>
              After Clip
              <input
                type="number"
                value={clipAfterSeconds}
                onChange={(e) => setClipAfterSeconds(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="work-grid">
        <div className="pro-card selector-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Compilation Types</p>
              <h2>Select Exports</h2>
            </div>
            <span className="pill">{selectedClipTypes.length} selected</span>
          </div>

          <div className="options">
            {clipTypeOptions.map((type) => (
              <button
                key={type}
                onClick={() => toggleClipType(type)}
                className={selectedClipTypes.includes(type) ? "selected" : ""}
              >
                {selectedClipTypes.includes(type) ? "✓ " : ""}
                {type}
              </button>
            ))}
          </div>

          <button className="button red full" onClick={generateClipList}>
            Preview Clip Times
          </button>
        </div>

        <div className="pro-card preview-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Compilation Preview</p>
              <h2>Chronological Clip Windows</h2>
            </div>
            <button className="button secondary small" onClick={() => setGeneratedClips([])}>
              Clear Preview
            </button>
          </div>

          <div className="summary-strip">
            <span>{generatedClips.length} compilations</span>
            <span>{totalPreviewClips} clips</span>
            <span>{formatTime(totalPreviewDuration)} total footage</span>
          </div>

          {generatedClips.length === 0 ? (
            <div className="empty">Import analysis data and preview clip times.</div>
          ) : (
            <div className="preview">
              {generatedClips.map((group) => (
                <div className="group" key={group.type}>
                  <div className="group-head">
                    <div>
                      <h3>{titleCase(group.type)} Compilation</h3>
                      <p>Overlay title: {group.type.toUpperCase()}</p>
                    </div>
                    <div className="group-pills">
                      <span>{group.clips.length} clips</span>
                      <span>{formatTime(totalGroupDuration(group))}</span>
                    </div>
                  </div>

                  {group.clips.map((clip, index) => (
                    <div className="clip" key={`${group.type}-${clip.id}-${index}`}>
                      <div>
                        <strong>Clip {index + 1}</strong>
                        <p>{clip.label}</p>
                        <small>Original event: {clip.originalTime}</small>
                      </div>
                      <h3>
                        {formatTime(clip.rawStart)} → {formatTime(clip.rawEnd)}
                      </h3>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="action-stack">
            <button className="button secondary" onClick={generateTestClip} disabled={isGenerating || isGeneratingCompilation}>
              {isGenerating ? "Generating Test Clip..." : "Generate Test Clip"}
            </button>

            <button className="button red" onClick={generateFullCompilation} disabled={isGenerating || isGeneratingCompilation}>
              {isGeneratingCompilation ? "Generating MP4 Compilations..." : "Generate MP4 Compilations"}
            </button>
          </div>
        </div>
      </section>

      <footer className="status-bar pro-card">
        <span>Status</span>
        <strong>{statusMessage}</strong>
      </footer>
    </main>
  );
}
