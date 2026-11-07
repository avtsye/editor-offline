import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Activity, Check, ChevronDown, ChevronLeft, Circle, Code2, Command, File, FileCode2, FilePlus2, Files, Folder, FolderOpen, FolderPlus, GitBranch, HardDrive, Keyboard, Minus, PanelRightClose, Plus, Replace, RotateCw, Save, Search, Settings2, X } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { TextBuffer } from "./core/text-buffer";

type FileEntry = { name: string; path: string; is_dir: boolean };
type Tab = { id: string; path: string | null; title: string; content: string; saved: string; dirty: boolean };
const WELCOME = ["ברוכים הבאים ל־Editor Offline", "", "סביבת פיתוח עצמאית, מקומית וקלה.", "", "פתחו קובץ או תיקייה כדי להתחיל לעבוד.", "זהו שלב הבסיס של סביבת הפיתוח; מנוע העריכה ושירותי השפה מתפתחים בהדרגה."].join("\n");
const FILTERS = [{ name: "קובצי קוד וטקסט", extensions: ["txt","md","js","jsx","ts","tsx","py","rs","json","html","css","toml","yaml","yml","xml","c","h","cpp","hpp","cs","java","dart","go","php","sql","sh","bat","ps1"] }, { name: "כל הקבצים", extensions: ["*"] }];
const id = () => globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
const language = (path: string | null) => {
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  const names: Record<string,string> = { ts:"TypeScript",tsx:"TypeScript React",js:"JavaScript",jsx:"JavaScript React",py:"Python",rs:"Rust",html:"HTML",css:"CSS",json:"JSON",md:"Markdown",toml:"TOML",yaml:"YAML",yml:"YAML",cpp:"C++",cs:"C#",java:"Java",dart:"Dart",go:"Go",sql:"SQL" };
  return names[ext] ?? "טקסט רגיל";
};

export default function App() {
  const [tabs,setTabs] = useState<Tab[]>([{id:"welcome",path:null,title:"ברוכים הבאים",content:WELCOME,saved:WELCOME,dirty:false}]);
  const [activeId,setActiveId] = useState("welcome");
  const [root,setRoot] = useState<string|null>(null);
  const [rootName,setRootName] = useState("ללא תיקייה פתוחה");
  const [cache,setCache] = useState<Record<string,FileEntry[]>>({});
  const [expanded,setExpanded] = useState<Set<string>>(new Set());
  const [findOpen,setFindOpen] = useState(false);
  const [replaceOpen,setReplaceOpen] = useState(false);
  const [query,setQuery] = useState("");
  const [replacement,setReplacement] = useState("");
  const [palette,setPalette] = useState(false);
  const [paletteQuery,setPaletteQuery] = useState("");
  const [sidebar,setSidebar] = useState(true);
  const [toast,setToast] = useState("");
  const [fontSize,setFontSize] = useState(14);
  const [busy,setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const buffer = useRef(new TextBuffer(WELCOME));
  const desktop = isTauri();
  const active = tabs.find(t=>t.id===activeId) ?? tabs[0];
  const text = active?.content ?? "";
  const lines = useMemo(()=>Array.from({length:text.split("\n").length},(_,i)=>i+1),[text]);
  const matches = query ? text.split(query).length-1 : 0;
  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(""),2500); };

  const edit = (value:string) => {
    buffer.current.replaceAll(value);
    setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));
  };
  const openPath = async (path:string) => {
    try {
      const content = await invoke<string>("read_text_file",{path});
      const old = tabs.find(t=>t.path===path);
      if(old){setActiveId(old.id);buffer.current.load(old.content);return;}
      const tab:Tab={id:id(),path,title:path.split(/[\\/]/).pop()||"קובץ",content,saved:content,dirty:false};
      setTabs(old=>[...old,tab]);setActiveId(tab.id);buffer.current.load(content);setFindOpen(false);
    } catch(e){notify("פתיחת הקובץ נכשלה: "+String(e));}
  };
  const openFile = async () => {
    if(!desktop){notify("פתיחת קבצים זמינה ביישום Windows");return;}
    const path=await open({multiple:false,filters:FILTERS});
    if(typeof path==="string") await openPath(path);
  };
  const readDir = async (path:string) => {
    try {
      const entries=await invoke<FileEntry[]>("read_directory",{path});
      entries.sort((a,b)=>Number(b.is_dir)-Number(a.is_dir)||a.name.localeCompare(b.name));
      setCache(old=>({...old,[path]:entries}));
    } catch(e){notify("קריאת התיקייה נכשלה: "+String(e));}
  };
  const openFolder = async () => {
    if(!desktop){notify("פתיחת תיקיות זמינה ביישום Windows");return;}
    const path=await open({directory:true,multiple:false});
    if(typeof path!=="string")return;
    setRoot(path);setRootName(path.split(/[\\/]/).filter(Boolean).pop()||path);
    setCache({});setExpanded(new Set([path]));await readDir(path);setSidebar(true);
  };
  const saveTab = async (tab:Tab) => {
    if(!desktop){notify("שמירה זמינה ביישום Windows");return;}
    let path=tab.path;
    if(!path){const chosen=await save({defaultPath:tab.title,filters:FILTERS});if(typeof chosen!=="string")return;path=chosen;}
    setBusy(true);
    try {
      await invoke("write_text_file",{path,content:tab.content});
      const savedPath=path;
      setTabs(old=>old.map(t=>t.id===tab.id?{...t,path:savedPath,title:savedPath.split(/[\\/]/).pop()||t.title,saved:t.content,dirty:false}:t));
      notify("הקובץ נשמר");
    }catch(e){notify("השמירה נכשלה: "+String(e));}finally{setBusy(false);}
  };
  const saveActive=async()=>{if(active)await saveTab(active);};
  const newFile=()=>{
    const tab:Tab={id:id(),path:null,title:"קובץ חדש",content:"",saved:"",dirty:false};
    setTabs(old=>[...old,tab]);setActiveId(tab.id);buffer.current.load("");
    window.setTimeout(()=>editor.current?.focus(),0);
  };
  const switchTab=(tab:Tab)=>{setActiveId(tab.id);buffer.current.load(tab.content);};
  const closeTab=(tab:Tab)=>{
    if(tab.dirty&&!window.confirm("יש שינויים שלא נשמרו. לסגור בכל זאת?"))return;
    const rest=tabs.filter(t=>t.id!==tab.id);
    if(!rest.length){const welcome:Tab={id:"welcome",path:null,title:"ברוכים הבאים",content:WELCOME,saved:WELCOME,dirty:false};setTabs([welcome]);setActiveId("welcome");buffer.current.load(WELCOME);return;}
    setTabs(rest);
    if(activeId===tab.id){const next=rest[rest.length-1];setActiveId(next.id);buffer.current.load(next.content);}
  };
  const undo=()=>{const value=buffer.current.undo();setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));};
  const redo=()=>{const value=buffer.current.redo();setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));};
  const replaceAll=()=>{if(!query)return;const value=text.split(query).join(replacement);edit(value);notify("ההחלפה הושלמה");};
  const run=(cmd:string)=>{
    setPalette(false);setPaletteQuery("");
    if(cmd==="new")newFile(); if(cmd==="open")void openFile(); if(cmd==="folder")void openFolder(); if(cmd==="save")void saveActive();
    if(cmd==="find"||cmd==="replace"){setFindOpen(true);setReplaceOpen(cmd==="replace");window.setTimeout(()=>findInput.current?.focus(),0);}
    if(cmd==="zoom+")setFontSize(v=>Math.min(22,v+1));if(cmd==="zoom-")setFontSize(v=>Math.max(11,v-1));
  };
  useEffect(()=>{
    const key=(e:globalThis.KeyboardEvent)=>{
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();void saveActive();}
      else if(mod&&e.key.toLowerCase()==="n"){e.preventDefault();newFile();}
      else if(mod&&e.shiftKey&&e.key.toLowerCase()==="o"){e.preventDefault();void openFolder();}
      else if(mod&&e.key.toLowerCase()==="o"){e.preventDefault();void openFile();}
      else if(mod&&e.key.toLowerCase()==="f"){e.preventDefault();setFindOpen(true);setReplaceOpen(false);window.setTimeout(()=>findInput.current?.focus(),0);}
      else if(mod&&e.key.toLowerCase()==="h"){e.preventDefault();setFindOpen(true);setReplaceOpen(true);window.setTimeout(()=>findInput.current?.focus(),0);}
      else if(mod&&e.shiftKey&&e.key.toLowerCase()==="p"){e.preventDefault();setPalette(true);window.setTimeout(()=>paletteInput.current?.focus(),0);}
      else if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();undo();}
      else if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}
      else if(e.key==="Escape"){setPalette(false);setFindOpen(false);}
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  });
  const editorKey=(e:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(e.key!=="Tab")return;e.preventDefault();
    const el=e.currentTarget,start=el.selectionStart,end=el.selectionEnd;
    edit(text.slice(0,start)+"    "+text.slice(end));
    window.setTimeout(()=>{el.focus();el.setSelectionRange(start+4,start+4);},0);
  };
  const toggle=(entry:FileEntry)=>{
    const next=new Set(expanded);
    if(next.has(entry.path))next.delete(entry.path);
    else{next.add(entry.path);if(!cache[entry.path])void readDir(entry.path);}
    setExpanded(next);
  };
  const tree=(entries:FileEntry[],depth=0):ReactNode=>entries.map(entry=>entry.is_dir?
    <div key={entry.path}><button className="tree-row" style={{paddingRight:12+depth*14}} onClick={()=>toggle(entry)}>{expanded.has(entry.path)?<ChevronDown size={14}/>:<ChevronLeft size={14}/>}<Folder size={15} className="folder-icon"/><span>{entry.name}</span></button>{expanded.has(entry.path)&&cache[entry.path]&&tree(cache[entry.path],depth+1)}</div>:
    <button key={entry.path} className={"tree-row"+(active?.path===entry.path?" selected":"")} style={{paddingRight:30+depth*14}} onClick={()=>void openPath(entry.path)}><FileCode2 size={14}/><span>{entry.name}</span></button>
  );
  const commands=[["new","קובץ חדש","Ctrl+N"],["open","פתיחת קובץ","Ctrl+O"],["folder","פתיחת תיקייה","Ctrl+Shift+O"],["save","שמירת קובץ","Ctrl+S"],["find","חיפוש בקובץ","Ctrl+F"],["replace","חיפוש והחלפה","Ctrl+H"],["zoom+","הגדלת גופן",""],["zoom-","הקטנת גופן",""]];
  const filtered=commands.filter(c=>c[1].includes(paletteQuery));

  return <main className="app" dir="rtl">
    <header className="titlebar">
      <div className="brand"><div className="brand-icon"><Code2 size={20}/></div><div><b>Editor Offline</b><small>סביבת פיתוח מקומית</small></div></div>
      <div className="workspace-name">{rootName}<ChevronDown size={13}/></div>
      <div className="top-actions">
        <button title="קובץ חדש · Ctrl+N" onClick={newFile}><FilePlus2/></button><button title="פתיחת קובץ · Ctrl+O" onClick={()=>void openFile()}><File/></button><button title="פתיחת תיקייה · Ctrl+Shift+O" onClick={()=>void openFolder()}><FolderOpen/></button><i/><button title="שמירה · Ctrl+S" disabled={!active?.dirty||busy} onClick={()=>void saveActive()}><Save/></button>
      </div>
    </header>
    <section className="workbench">
      <nav className="activity"><button className="chosen" title="סייר קבצים" onClick={()=>setSidebar(true)}><Files/></button><button title="חיפוש" onClick={()=>{setSidebar(true);setFindOpen(true);}}><Search/></button><div/><button title="הגדלת גופן" onClick={()=>setFontSize(v=>Math.min(22,v+1))}><Settings2/></button><span>EO</span></nav>
      {sidebar&&<aside className="sidebar">
        <div className="side-title">סייר <button title="הסתרת סרגל" onClick={()=>setSidebar(false)}><PanelRightClose size={15}/></button></div>
        <div className="section-title">{rootName}<button title="רענון" onClick={()=>root&&void readDir(root)}><RotateCw size={14}/></button></div>
        <div className="tree">{root?(cache[root]?tree(cache[root]):<p>טוען תיקייה…</p>):<div className="empty"><FolderOpen size={27}/><span>עדיין לא נפתחה תיקיית עבודה</span><button onClick={()=>void openFolder()}>פתיחת תיקייה</button></div>}</div>
        <div className="open-tabs"><div className="section-title">קבצים פתוחים <span>{tabs.length}</span></div>{tabs.map(t=><button key={t.id} className={t.id===activeId?"on":""} onClick={()=>switchTab(t)}><FileCode2 size={14}/>{t.title}{t.dirty&&<Circle size={7} fill="currentColor"/>}</button>)}</div>
      </aside>}
      <section className="editor">
        <div className="tabs">{tabs.map(t=><div key={t.id} className={"tab"+(t.id===activeId?" active":"")} onClick={()=>switchTab(t)}><FileCode2 size={14}/><span>{t.title}</span>{t.dirty?<Circle size={8} fill="currentColor"/>:<button title="סגירה" onClick={e=>{e.stopPropagation();closeTab(t);}}><X size={13}/></button>}</div>)}
          <button className="side-toggle" title="הצגה/הסתרת סרגל" onClick={()=>setSidebar(v=>!v)}><PanelRightClose size={15}/></button>
          <button className="side-toggle" title="לוח פקודות" onClick={()=>setPalette(true)}><Plus size={15}/></button>
        </div>
        {findOpen&&<div className="findbar"><div><Search size={14}/><input ref={findInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="חיפוש"/></div>{replaceOpen&&<div><Replace size={14}/><input value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="החלפה"/></div>}<small>{matches} התאמות</small>{replaceOpen&&<button onClick={replaceAll}>החלף הכול</button>}<button title="סגירה" onClick={()=>setFindOpen(false)}><X size={14}/></button></div>}
        {active?.id==="welcome"?<div className="welcome"><div className="welcome-card"><div className="hero-icon"><Code2 size={34}/></div><small>OFFLINE-FIRST DEVELOPMENT</small><h1>בונים. מריצים. נשארים מקומיים.</h1><p>סביבת פיתוח עצמאית, מהירה ופתוחה — בלי חשבון, בלי ענן ובלי תלות בשירות חיצוני.</p><div className="welcome-buttons"><button className="primary" onClick={newFile}><FilePlus2 size={16}/>קובץ חדש</button><button onClick={()=>void openFile()}><File size={16}/>פתיחת קובץ</button><button onClick={()=>void openFolder()}><FolderOpen size={16}/>פתיחת תיקייה</button></div><div className="features"><div><Keyboard/><b>קיצורי מקלדת</b><span>Ctrl+N קובץ חדש · Ctrl+S שמירה</span></div><div><HardDrive/><b>מקומי כברירת מחדל</b><span>הקבצים נשארים במחשב שלך</span></div><div><Activity/><b>בפיתוח פעיל</b><span>מנוע עריכה ושירותי שפה בדרך</span></div></div></div></div>:
        <div className="editor-body"><div className="crumb">{rootName}　›　{active?.title}</div><div className="codearea" style={{fontSize}}><div className="gutter" ref={gutter}>{lines.map(n=><div key={n}>{n}</div>)}</div><textarea ref={editor} value={text} onChange={e=>edit(e.target.value)} onKeyDown={editorKey} onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop;}} spellCheck={false} autoCapitalize="off" autoCorrect="off" dir="ltr" wrap="off" aria-label="עורך קוד"/></div></div>}
      </section>
    </section>
    <footer className="status"><div><span><GitBranch size={12}/> main</span><span><Circle size={7} fill="currentColor"/> מוכן</span></div><div><span>UTF-8</span><span>CRLF</span><span>{language(active?.path??null)}</span><span><HardDrive size={12}/> Offline</span></div></footer>
    {palette&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setPalette(false);}}><div className="palette"><div className="palette-search"><Command size={17}/><input ref={paletteInput} value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} placeholder="חפש פקודה…"/></div>{filtered.map(c=><button key={c[0]} onClick={()=>run(c[0])}><span>{c[1]}</span><kbd>{c[2]}</kbd></button>)}{!filtered.length&&<p>לא נמצאו פקודות</p>}<small>ESC לסגירה · פקודות זמינות בלבד</small></div></div>}
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </main>;
}
