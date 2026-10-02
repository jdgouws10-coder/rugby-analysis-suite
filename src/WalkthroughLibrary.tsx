import {useRef,useState} from 'react';
export type LibraryVideo = {id:string; name:string; url:string; path:string};
type Folder = {id:string; name:string; videos:LibraryVideo[]};
export default function WalkthroughLibrary({disabled,onChoose,currentUrl,onClose}:{disabled:boolean;onChoose:(video:LibraryVideo)=>void;currentUrl?:string;onClose:()=>void}) {
  const [folders,setFolders]=useState<Folder[]>(()=>{try{return JSON.parse(localStorage.getItem('ras-walkthrough-library')||'[]');}catch{return [];}});
  const [selected,setSelected]=useState(''),[name,setName]=useState(''),[rename,setRename]=useState(''),[error,setError]=useState(''),[adding,setAdding]=useState(false);
  const lock=useRef(false),folder=folders.find(f=>f.id===selected),blocked=disabled||adding;
  function update(next:Folder[]){try{localStorage.setItem('ras-walkthrough-library',JSON.stringify(next));setFolders(next);setError('');}catch{setError('Could not save the library. Storage may be full.');}}
  async function add(){if(!folder||lock.current)return;lock.current=true;setAdding(true);try{const videos=await window.electronAPI.selectWalkthroughVideos();update(folders.map(f=>f.id===folder.id?{...f,videos:[...f.videos,...videos.filter(v=>!f.videos.some(old=>old.path===v.path)).map(v=>({...v,id:crypto.randomUUID()}))]}:f));}catch(e){setError(String(e));}finally{lock.current=false;setAdding(false);}}
  return <section className="review-library-view" aria-label="Review library">
    <header className="review-library-header"><button autoFocus disabled={adding} onClick={onClose}>← Back to walkthrough</button><div><p className="eyebrow">COACHING ROOM</p><h1>Review library</h1><p>Your folders, playlists and review videos in one place.</p></div></header>
    <div className="review-library-content">
      <form className="library-create" onSubmit={e=>{e.preventDefault();if(blocked||!name.trim())return;update([...folders,{id:crypto.randomUUID(),name:name.trim(),videos:[]}]);setName('');}}><input aria-label="Folder name" placeholder="Name your new folder" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/><button disabled={blocked||!name.trim()}>Create folder</button></form>
      {!folder ? <><h2>All folders ({folders.length})</h2><div className="review-folder-grid">{folders.map(f=><button className="review-folder" key={f.id} disabled={blocked} onClick={()=>{setSelected(f.id);setRename(f.name);}}><span aria-hidden="true">▰</span><strong>{f.name}</strong><small>{f.videos.length} videos →</small></button>)}</div>{!folders.length&&<p className="library-empty">Create your first folder above, then add videos for your next review.</p>}</> : <>
        <div className="library-folder-heading"><button disabled={adding} onClick={()=>setSelected('')}>← All folders</button><h2>{folder.name}</h2><button disabled={blocked} onClick={add}>{adding?'Opening file picker…':'Add videos'}</button></div>
        <div className="playlist-items">{folder.videos.map((v,i)=><div key={v.id} className={v.url===currentUrl?'current':''}><button disabled={blocked} onClick={()=>onChoose(v)} title={v.name}>{i+1}. {v.name}</button><button aria-label={`Move ${v.name} up`} disabled={blocked||i===0} onClick={()=>{const videos=[...folder.videos];[videos[i-1],videos[i]]=[videos[i],videos[i-1]];update(folders.map(f=>f.id===folder.id?{...f,videos}:f));}}>↑</button><button aria-label={`Remove ${v.name} from playlist`} disabled={blocked} onClick={()=>update(folders.map(f=>f.id===folder.id?{...f,videos:f.videos.filter(a=>a.id!==v.id)}:f))}>×</button></div>)}</div>
        {!folder.videos.length&&<p className="library-empty">This folder is empty. Add videos to build your playlist.</p>}
        <form className="library-create library-rename" onSubmit={e=>{e.preventDefault();if(!blocked&&rename.trim())update(folders.map(f=>f.id===folder.id?{...f,name:rename.trim()}:f));}}><input aria-label="Rename folder" value={rename} maxLength={80} onChange={e=>setRename(e.target.value)}/><button disabled={blocked||!rename.trim()}>Rename folder</button>{!folder.videos.length&&<button type="button" disabled={blocked} onClick={()=>{update(folders.filter(f=>f.id!==folder.id));setSelected('');}}>Remove empty folder</button>}</form>
      </>}
      <p className="library-hint">Folders and playlist order are saved on this device. Original video files stay where they are.</p>{error&&<p role="alert">{error}</p>}
    </div>
  </section>;
}
