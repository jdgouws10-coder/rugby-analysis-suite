import { useEffect, useRef, useState } from 'react';
import WalkthroughLibrary from './WalkthroughLibrary';

type Mark = { tool: string; color: string; width: number; points: {x:number; y:number}[] };

export default function VideoWalkthrough({onHome}: {onHome: () => void}) {
  const shell=useRef<HTMLElement>(null);
  const [presenting,setPresenting]=useState(false);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marks = useRef<Mark[]>([]);
  const draft = useRef<Mark | null>(null);
  const spotlight = useRef<{x:number;y:number;color:string;size:number;started:number} | null>(null);
  const [spotlightSize,setSpotlightSize]=useState(1);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const pending = useRef<Blob | null>(null);
  const [clip, setClip] = useState<{name:string; url:string; path?:string} | null>(null);
  const [mediaState,setMediaState]=useState<'empty'|'loading'|'ready'|'error'>('empty');
  const [importing,setImporting]=useState(false);
  const importLock=useRef(false);
  const [clipKey,setClipKey]=useState(0);
  const [tool, setTool] = useState('pointer');
  const [color, setColor] = useState('#ffe146');
  const [width, setWidth] = useState(4);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mic, setMic] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [message, setMessage] = useState('Live review • microphone off');
  const [elapsed, setElapsed] = useState(0);
  useEffect(()=>{const changed=()=>setPresenting(document.fullscreenElement===shell.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  async function present(){try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.current?.requestFullscreen();}catch(e){setMessage(`Could not enter presentation: ${String(e)}`);}}
  function load(file:{name:string;url:string;path?:string}) {video.current?.pause();setClip(file);setClipKey(key=>key+1);setMediaState('loading');marks.current=[];draft.current=null;spotlight.current=null;setTime(0);setDuration(0);setPlaying(false);setMessage(`Loading ${file.name}…`);}

  useEffect(() => {
    let request = 0;
    const paint = () => {
      const surface = canvas.current;
      const footage = video.current;
      const ctx = surface?.getContext('2d');
      if (surface && ctx) {
        const w = surface.width, h = surface.height;
        ctx.fillStyle = '#06100d'; ctx.fillRect(0,0,w,h);
        if (footage && footage.readyState >= 2) {try {ctx.drawImage(footage,0,0,w,h);}catch {/* A frame may be unavailable while switching files. */}}
        const light = spotlight.current;
        if (light) {
          const age = performance.now()-light.started;
          if (age >= 3000) spotlight.current=null;
          else {
            const opacity=Math.min(1,age/180,(3000-age)/550);
            const x=light.x*w, y=light.y*h;
            const radius=w*.035*light.size, base=y;
            const top=Math.max(0,y-h*.4*light.size);
            ctx.save();ctx.globalAlpha=opacity;
            // A soft pool of light keeps the player visible while dimming the surroundings.
            const shade=ctx.createRadialGradient(x,y,radius*.6,x,y,radius*3.5);
            shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.35)');
            ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
            const beam=ctx.createLinearGradient(x,top,x,base);
            beam.addColorStop(0,`${light.color}00`);beam.addColorStop(.45,`${light.color}15`);beam.addColorStop(1,`${light.color}60`);
            ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(x-radius*.16,top);ctx.lineTo(x+radius*.16,top);ctx.lineTo(x+radius,base);ctx.lineTo(x-radius,base);ctx.closePath();ctx.fill();
            ctx.shadowColor=light.color;ctx.shadowBlur=22*light.size;
            ctx.strokeStyle=light.color;ctx.lineWidth=3*w/1280;
            ctx.fillStyle=`${light.color}22`;ctx.beginPath();ctx.ellipse(x,base,radius,radius*.28,0,0,Math.PI*2);ctx.fill();ctx.stroke();
            ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=w/1280;ctx.stroke();ctx.restore();
          }
        }
        for (const mark of [...marks.current, ...(draft.current ? [draft.current] : [])]) {
          const first = mark.points[0], last = mark.points[mark.points.length-1];
          if (!first || !last) continue;
          const x = first.x*w, y = first.y*h, ex = last.x*w, ey = last.y*h;
          ctx.save(); ctx.strokeStyle = mark.color; ctx.fillStyle = mark.color;
          ctx.lineWidth = mark.width * w/1280; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          if (mark.tool === 'box' || mark.tool === 'highlight') {
            if (mark.tool === 'highlight') {ctx.globalAlpha=.25; ctx.fillRect(x,y,ex-x,ey-y); ctx.globalAlpha=1;}
            ctx.strokeRect(x,y,ex-x,ey-y);
          } else if (mark.tool === 'circle') {
            ctx.beginPath(); ctx.ellipse((x+ex)/2,(y+ey)/2,Math.abs(ex-x)/2,Math.abs(ey-y)/2,0,0,Math.PI*2); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.moveTo(x,y);
            if (mark.tool === 'pen') for (const p of mark.points.slice(1)) ctx.lineTo(p.x*w,p.y*h);
            else ctx.lineTo(ex,ey);
            ctx.stroke();
            if (mark.tool === 'arrow') {
              const angle = Math.atan2(ey-y,ex-x), size = 20*w/1280;
              ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex-size*Math.cos(angle-.45),ey-size*Math.sin(angle-.45)); ctx.lineTo(ex-size*Math.cos(angle+.45),ey-size*Math.sin(angle+.45)); ctx.closePath(); ctx.fill();
            }
          }
          ctx.restore();
        }
      }
      request = requestAnimationFrame(paint);
    };
    request = requestAnimationFrame(paint);
    return () => {cancelAnimationFrame(request); if (recorder.current?.state === 'recording') recorder.current.stop(); streams.current.forEach(s => s.getTracks().forEach(t => t.stop()));};
  }, []);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now(); setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now()-started)/1000)), 500);
    return () => clearInterval(timer);
  }, [recording]);

  const clock = (seconds:number) => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {const r=e.currentTarget.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  async function choose() {
    if(importLock.current||busy||recording)return;
    importLock.current=true;
    setImporting(true);
    try {const file=await window.electronAPI.selectWalkthroughVideo(); if (!file) return; load(file);}
    catch(e) {setMessage(String(e));}
    finally {setImporting(false);importLock.current=false;}
  }
  async function repairPlayback() {
    if(!clip?.path || busy)return;
    setBusy(true);setMessage('Preparing a compatible playback copy. Your original video is unchanged.');
    try {const result=await window.electronAPI.optimiseVideoForPlayback({videoPath:clip.path});if(!result.success||!result.url)throw Error(result.message||'Could not prepare playback');load({...clip,url:result.url});}
    catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function save() {
    if (!pending.current) return;
    setBusy(true); setMessage('Exporting MP4…');
    try {
      const result=await window.electronAPI.saveWalkthrough({bytes:await pending.current.arrayBuffer()});
      if (result.success) {pending.current=null; setHasRecording(false); setMessage('Walkthrough saved.');}
      else setMessage(result.message || 'Save cancelled. Your recording is still available to save.');
    } catch(e) {setMessage(`Could not save: ${String(e)}. Your recording is still available.`);}
    finally {setBusy(false);}
  }
  async function start() {
    if (!canvas.current || !clip || pending.current || mediaState!=='ready') return;
    setBusy(true);
    try {
      const combined=canvas.current.captureStream(30); streams.current=[combined];
      if (mic) {const voice=await navigator.mediaDevices.getUserMedia({audio:true}); streams.current.push(voice); voice.getAudioTracks().forEach(t => combined.addTrack(t));}
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('Video recording is unavailable on this device.');
      const active=new MediaRecorder(combined,{mimeType:mime,videoBitsPerSecond:5000000});
      const chunks:BlobPart[]=[];
      active.ondataavailable=e => {if (e.data.size) chunks.push(e.data);};
      active.onstop=() => {streams.current.forEach(s => s.getTracks().forEach(t => t.stop())); streams.current=[]; const output=new Blob(chunks,{type:mime}); pending.current=output.size ? output : null; setHasRecording(output.size>0); setRecording(false); setMessage(output.size ? 'Recording ready. Save your walkthrough below.' : 'No frames were recorded. Keep the walkthrough window visible and try again.');};
      active.onerror=() => {setMessage('Recording interrupted. Save the available recording and try again.'); if(active.state !== 'inactive') active.stop();};
      recorder.current=active; active.start(1000); setRecording(true); setMessage(mic ? 'Recording video, drawings and your microphone.' : 'Recording video and drawings • microphone off');
    } catch(e) {streams.current.forEach(s => s.getTracks().forEach(t => t.stop())); streams.current=[]; setMessage(`Could not start recording: ${String(e)}`);}
    finally {setBusy(false);}
  }

  return <main ref={shell} className={`walkthrough-page ras-shell ${presenting?'presenting':''}`}>
    {presenting && <div className="presentation-toolbar"><button onClick={()=>{if(playing)video.current?.pause();else void video.current?.play().catch(e=>setMessage(String(e)));}}>{playing?'Pause':'Play'}</button>{[['pointer','Pointer'],['arrow','Arrow'],['pen','Pen'],['highlight','Highlight'],['spotlight','Player spotlight'],['circle','Circle'],['box','Box'],['eraser','Eraser']].map(([value,label])=><button key={value} aria-pressed={tool===value} onClick={()=>setTool(value)}>{label}</button>)}<input aria-label="Presentation drawing colour" type="color" value={color} onChange={e=>setColor(e.target.value)}/><button onClick={()=>marks.current.pop()}>Undo</button><button onClick={()=>{marks.current=[];spotlight.current=null;}}>Clear</button>{recording&&<button onClick={()=>recorder.current?.stop()}>Stop recording</button>}<button onClick={present}>Exit presentation</button></div>}
    <header className="walkthrough-header"><button className="secondary-btn" disabled={recording || busy} onClick={() => {if(pending.current){setMessage('Save or discard your recording before leaving.'); return;} onHome();}}>← Home</button><div><p className="eyebrow">COACHING ROOM</p><h1>Video Walkthrough</h1><p>Watch together. Draw the detail. Record when you want.</p></div><button className="primary-btn" disabled={recording || busy || importing} onClick={choose}>{importing ? 'Opening file picker…' : clip ? 'Change video' : 'Open video'}</button></header>
    <div className="walkthrough-sessionbar"><span>{recording ? `● REC ${clock(elapsed)}` : 'LIVE REVIEW'} · {clip?'Video ready':'Import a video to begin'}</span><button disabled={mediaState!=='ready'} onClick={present}>Presentation mode ⛶</button></div>
    <div className="walkthrough-layout"><section className="panel walkthrough-player">
      <h2>{clip?.name || 'Bring your next review to life'}</h2>
      <video key={clipKey} ref={video} src={clip?.url} preload="auto" muted playsInline style={{display:'none'}} onLoadedMetadata={e => {setDuration(e.currentTarget.duration); if(canvas.current) {canvas.current.width=1280; canvas.current.height=Math.round(1280*e.currentTarget.videoHeight/e.currentTarget.videoWidth);}}} onLoadedData={() => {setMediaState('ready');setMessage('Video ready • live review');}} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => {setMediaState('error');setMessage('Could not load this video. Try preparing a compatible copy or choose another file.');}} />
      <div className="walkthrough-video-stage" style={{position:'relative', '--video-aspect': video.current?.videoWidth && video.current?.videoHeight ? video.current.videoWidth / video.current.videoHeight : 16/9} as React.CSSProperties}>
      <canvas ref={canvas} width={1280} height={720} aria-label="Video drawing surface" className={tool==='pointer' ? '' : 'draw-mode'}
        onPointerDown={e => {if(!clip || tool==='pointer') return; e.currentTarget.setPointerCapture(e.pointerId); const p=point(e); if(tool==='spotlight') {spotlight.current={...p,color,size:spotlightSize,started:performance.now()};return;} if(tool==='eraser') {for(let i=marks.current.length-1;i>=0;i--) {const m=marks.current[i]; const xs=m.points.map(a=>a.x),ys=m.points.map(a=>a.y); if(p.x>=Math.min(...xs)-.02 && p.x<=Math.max(...xs)+.02 && p.y>=Math.min(...ys)-.02 && p.y<=Math.max(...ys)+.02){marks.current.splice(i,1);break;}} return;} draft.current={tool,color,width,points:[p,p]};}}
        onPointerMove={e => {if(!draft.current) return; if(draft.current.tool==='pen') draft.current.points.push(point(e)); else draft.current.points[1]=point(e);}}
        onPointerUp={e => {if(draft.current){marks.current.push(draft.current); draft.current=null;} if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={() => {draft.current=null;}} />
      {!clip && <button className="primary-btn" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%, -50%)'}} disabled={busy || importing} onClick={choose}>{importing ? 'Opening file picker…' : 'Import video'}</button>}
      </div>
      {(importing||mediaState==='loading'||mediaState==='error') && <div className="walkthrough-import-status" role="status"><strong>{importing?'Opening file picker…':mediaState==='loading'?'Loading video…':'Video could not load'}</strong><p>{importing?'Choose your video in the file window. One click is enough.':message}</p>{mediaState==='error'&&clip?.path&&<button disabled={busy} onClick={repairPlayback}>{busy?'Preparing video…':'Prepare compatible video'}</button>}</div>}
      {!clip && <p className="walkthrough-empty">Open a match or short clip to start. Live review works without recording.</p>}
      <div className="walkthrough-playback"><button disabled={mediaState!=='ready'} onClick={() => {if(video.current)video.current.currentTime=Math.max(0,video.current.currentTime-5);}}>−5s</button><button disabled={!clip} onClick={() => {if(playing)video.current?.pause();else void video.current?.play().catch(e=>setMessage(String(e)));}}>{playing ? 'Pause' : 'Play'}</button><button disabled={!clip} onClick={() => {if(video.current)video.current.currentTime=Math.min(duration,video.current.currentTime+5);}}>+5s</button><span>{clock(time)} / {clock(duration)}</span><select aria-label="Playback speed" defaultValue="1" onChange={e => {if(video.current)video.current.playbackRate=Number(e.target.value);}}>{[.25,.5,.75,1,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
      <input aria-label="Video position" className="walkthrough-seek" type="range" min="0" max={duration || 1} step=".01" value={time} disabled={mediaState!=='ready'} onChange={e=>{if(video.current){video.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}} />
    </section><aside className="walkthrough-sidebar"><section className="panel"><p className="eyebrow">DRAW & EXPLAIN</p><div className="walkthrough-tools">{[['pointer','Pointer'],['pen','Freehand'],['arrow','Arrow'],['circle','Circle'],['box','Rectangle'],['highlight','Highlight'],['spotlight','Player spotlight'],['eraser','Eraser']].map(([value,label])=><button key={value} aria-pressed={tool===value} onClick={()=>setTool(value)}>{label}</button>)}</div>{tool==='spotlight' && <><small>Click a player’s body for a 3-second spotlight. Pause for a precise position; the light stays where you click.</small><label>Spotlight size <input aria-label="Spotlight size" type="range" min="0.5" max="2.5" step="0.1" value={spotlightSize} onChange={e=>setSpotlightSize(Number(e.target.value))}/></label></>}<label>Colour <input aria-label="Drawing colour" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>Line thickness <input type="range" min="2" max="12" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label><div className="walkthrough-tools"><button onClick={()=>{marks.current.pop();}}>Undo</button><button onClick={()=>{marks.current=[];draft.current=null;spotlight.current=null;}}>Clear drawings</button></div><small>Drawings stay on screen until you clear them. Pause the video for precise annotations.</small></section>
    <section className="panel"><p className="eyebrow">OPTIONAL RECORDING</p><h2>{recording ? `● Recording ${clock(elapsed)}` : 'Save your explanation'}</h2><p>Record the video and drawings. Add your voice if you want.</p><label><input type="checkbox" checked={mic} disabled={recording || busy} onChange={e=>setMic(e.target.checked)}/> Include microphone</label><small>Source video audio is muted. Microphone is used only while recording.</small>{recording ? <button className="primary-btn" onClick={()=>recorder.current?.stop()}>Stop recording</button> : <button className="primary-btn" disabled={mediaState!=='ready' || busy || hasRecording || importing} onClick={start}>{busy ? 'Please wait…' : 'Start recording'}</button>}{hasRecording && <><button className="primary-btn" disabled={busy} onClick={save}>{busy?'Exporting MP4…':'Export MP4'}</button><button disabled={busy} onClick={()=>{pending.current=null;setHasRecording(false);setMessage('Recording discarded. Ready for live review.');}}>Discard recording</button></>}<p role="status">{message}</p></section>
    <button className="secondary-btn" disabled={recording||busy||importing} onClick={()=>{video.current?.pause();setLibraryOpen(true);}}>Review library →</button>
    </aside></div>
    {libraryOpen && <WalkthroughLibrary disabled={recording||busy||importing} currentUrl={clip?.url} onClose={()=>setLibraryOpen(false)} onChoose={file=>{load(file);setLibraryOpen(false);}}/>}
  </main>;
}
