import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Activity, Check, ChevronDown, ChevronLeft, Circle, Code2, Command, File, FileCode2, FilePlus2, Files, Folder, FolderOpen, FolderPlus, GitBranch, HardDrive, Keyboard, PanelRightClose, Plus, Replace, RotateCw, Save, Search, Settings2, X } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { TextBuffer } from "./core/text-buffer";
import { tokenize } from "./core/tokenizer";

type FileEntry = { name: string; path: string; is_dir: boolean };
type Tab = { id: string; path: string | null; title: string; content: string; saved: string; dirty: boolean };
const WELCOME = ["ברוכים הבאים ל־Editor Offline", "", "סביבת פיתוח עצמאית, מקומית וקלה.", "", "פתחו קובץ או תיקייה כדי להתחיל לעבוד.", "זהו שלב הבסיס של סביבת הפיתוח; מנוע העריכה ושירותי השפה מתפתחים בהדרגה."].join("\n");
const FILTERS = [{ name: "קובצי קוד וטקסט", extensions: ["txt","md","js","jsx","ts","tsx","py","rs","json","html","css","toml","yaml","yml","xml","c","h","cpp","hpp","cs","java","dart","go","php","sql","sh","bat","ps1"] }, { name: "כל הקבצים", extensions: ["*"] }];
const id = () => globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
const languageId = (path: string | null) => path?.split(".").pop()?.toLowerCase() ?? "plain";
const language = (path: string | null) => {
  const ext = languageId(path);
  const names: Record<string,string> = { ts:"TypeScript",tsx:"TypeScript React",js:"JavaScript",jsx:"JavaScript React",py:"Python",rs:"Rust",html:"HTML",xml:"XML",css:"CSS",json:"JSON",md:"Markdown",toml:"TOML",yaml:"YAML",yml:"YAML",c:"C",h:"C",cpp:"C++",hpp:"C++",cs:"C#",java:"Java",dart:"Dart",go:"Go",sql:"SQL" };
  return names[ext] ?? "טקסט רגיל";
};

export default function App() {
  const [tabs,setTabs] = useState<Tab[]>([{id:"welcome",path:null,title:"ברוכים הבאים",content:WELCOME,saved:WELCOME,dirty:false}]);
  const [activeId,setActiveId] = useState("welcome");
  const [root,setRoot] = useState<string|null>(null);
  const [activeDirectory,setActiveDirectory] = useState<string|null>(null);
  const [contextMenu,setContextMenu] = useState<{entry:FileEntry;x:number;y:number}|null>(null);
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
  const [cursor,setCursor] = useState({line:1,column:1});
  const [busy,setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const buffers = useRef(new Map<string, TextBuffer>([["welcome", new TextBuffer(WELCOME)]]));
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const desktop = isTauri();
  const active = tabs.find(t=>t.id===activeId) ?? tabs[0];
  const text = active?.content ?? "";
  const activeBuffer = buffers.current.get(activeId) ?? new TextBuffer(text);
  if (!buffers.current.has(activeId)) buffers.current.set(activeId, activeBuffer);
  const lines = useMemo(()=>Array.from({length:activeBuffer.lineCount},(_,i)=>i+1),[text,activeBuffer.lineCount]);
  const syntaxTokens = useMemo(()=>tokenize(text,languageId(active?.path??null)),[text,active?.path]);
  const matches = query ? text.split(query).length-1 : 0;
  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(""),2500); };
  const updateCursor = (offset:number) => setCursor(activeBuffer.positionAt(offset));
  const edit = (value:string, selection?:{start:number;end:number}) => {
    activeBuffer.replaceAll(value);
    setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));
    if (selection) {
      selections.current.set(activeId, selection);
      setCursor(activeBuffer.positionAt(selection.start));
      window.requestAnimationFrame(()=> {
        if (editor.current) {
          editor.current.setSelectionRange(Math.min(selection.start,value.length),Math.min(selection.end,value.length));
        }
      });
    }
  };
  const openPath = async (path:string) => {
    try {
      const content = await invoke<string>("read_text_file",{path});
      const old = tabs.find(t=>t.path===path);
      if(old){
        setActiveId(old.id);
        const model=buffers.current.get(old.id)??new TextBuffer(old.content);
        buffers.current.set(old.id,model);
        const selection=selections.current.get(old.id)??{start:0,end:0};
        setCursor(model.positionAt(selection.start));
        return;
      }
      const tab:Tab={id:id(),path,title:path.split(/[\\/]/).pop()||"קובץ",content,saved:content,dirty:false};
      buffers.current.set(tab.id,new TextBuffer(content));
      selections.current.set(tab.id,{start:0,end:0});
      setTabs(old=>[...old,tab]);setActiveId(tab.id);setCursor({line:1,column:1});setFindOpen(false);
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
    setRoot(path);setActiveDirectory(path);setRootName(path.split(/[\\/]/).filter(Boolean).pop()||path);
    setCache({});setExpanded(new Set([path]));await readDir(path);setSidebar(true);
  };
  const createWorkspaceFile=async()=>{
    if(!desktop||!activeDirectory){notify("יש לפתוח תיקיית עבודה תחילה");return;}
    const name=window.prompt("שם הקובץ החדש");
    if(name===null||!name.trim())return;
    try{
      const path=await invoke<string>("create_file_in_directory",{parent:activeDirectory,name});
      await readDir(activeDirectory);
      await openPath(path);
      notify("הקובץ נוצר");
    }catch(error){notify("יצירת הקובץ נכשלה: "+String(error));}
  };
  const createWorkspaceFolder=async()=>{
    if(!desktop||!activeDirectory){notify("יש לפתוח תיקיית עבודה תחילה");return;}
    const name=window.prompt("שם התיקייה החדשה");
    if(name===null||!name.trim())return;
    try{
      const path=await invoke<string>("create_directory_in_directory",{parent:activeDirectory,name});
      await readDir(activeDirectory);
      setExpanded(old=>new Set(old).add(path));
      setCache(old=>({...old,[path]:[]}));
      setActiveDirectory(path);
      notify("התיקייה נוצרה");
    }catch(error){notify("יצירת התיקייה נכשלה: "+String(error));}
  };
  const pathInside=(candidate:string,base:string)=>{
    const separator=base.includes("\\\\")?"\\\\":"/";
    return candidate===base||candidate.startsWith(base+separator);
  };
  const remapPath=(candidate:string,oldPath:string,newPath:string)=>
    candidate===oldPath?newPath:pathInside(candidate,oldPath)?newPath+candidate.slice(oldPath.length):candidate;
  const renameEntry=async(entry:FileEntry)=>{
    const requested=window.prompt("שם חדש",entry.name);
    if(requested===null||!requested.trim()||requested.trim()===entry.name)return;
    try{
      const nextPath=await invoke<string>("rename_path",{path:entry.path,name:requested.trim()});
      setTabs(old=>old.map(tab=>tab.path&&pathInside(tab.path,entry.path)
        ?{...tab,path:remapPath(tab.path,entry.path,nextPath),title:remapPath(tab.path,entry.path,nextPath).split(/[\\\\/]/).pop()||tab.title}
        :tab));
      setRoot(old=>old&&pathInside(old,entry.path)?remapPath(old,entry.path,nextPath):old);
      setActiveDirectory(old=>old&&pathInside(old,entry.path)?remapPath(old,entry.path,nextPath):old);
      setExpanded(old=>new Set([...old].map(path=>remapPath(path,entry.path,nextPath))));
      setCache(old=>{
        const next:Record<string,FileEntry[]>={};
        for(const [directory,entries] of Object.entries(old)){
          const mappedDirectory=remapPath(directory,entry.path,nextPath);
          next[mappedDirectory]=entries.map(child=>({...child,path:remapPath(child.path,entry.path,nextPath)}));
        }
        return next;
      });
      const parent=entry.path.slice(0,Math.max(entry.path.lastIndexOf("/"),entry.path.lastIndexOf("\\\\")));
      if(parent)await readDir(parent);
      notify("השם עודכן");
    }catch(error){notify("שינוי השם נכשל: "+String(error));}
  };
  const deleteEntry=async(entry:FileEntry)=>{
    const openTabs=entry.is_dir?tabs.filter(tab=>tab.path&&pathInside(tab.path,entry.path)):[];
    const fileTab=tabs.find(tab=>tab.path===entry.path);
    const affected=entry.is_dir?openTabs:fileTab?[fileTab]:[];
    if(affected.some(tab=>tab.dirty)&&!window.confirm("יש קבצים עם שינויים שלא נשמרו. למחוק בכל זאת?"))return;
    if(entry.is_dir&&affected.length){notify("לא ניתן למחוק תיקייה שיש בה קבצים פתוחים");return;}
    if(!window.confirm("למחוק את "+(entry.is_dir?"התיקייה ":"הקובץ ")+entry.name+"?"))return;
    try{
      await invoke("delete_path",{path:entry.path});
      if(fileTab){
        const rest=tabs.filter(tab=>tab.id!==fileTab.id);
        buffers.current.delete(fileTab.id);selections.current.delete(fileTab.id);
        if(!rest.length){
          const welcome:Tab={id:"welcome",path:null,title:"ברוכים הבאים",content:WELCOME,saved:WELCOME,dirty:false};
          buffers.current.set("welcome",new TextBuffer(WELCOME));setTabs([welcome]);setActiveId("welcome");
        }else{
          setTabs(rest);
          if(activeId===fileTab.id){
            const next=rest[rest.length-1];setActiveId(next.id);
            const model=buffers.current.get(next.id)??new TextBuffer(next.content);
            buffers.current.set(next.id,model);
          }
        }
      }
      const parent=entry.path.slice(0,Math.max(entry.path.lastIndexOf("/"),entry.path.lastIndexOf("\\\\")));
      if(parent)await readDir(parent);
      setCache(old=>Object.fromEntries(Object.entries(old).filter(([directory])=>!pathInside(directory,entry.path))));
      setExpanded(old=>new Set([...old].filter(path=>!pathInside(path,entry.path))));
      if(activeDirectory&&pathInside(activeDirectory,entry.path))setActiveDirectory(parent||root);
      notify("הפריט נמחק");
    }catch(error){notify("המחיקה נכשלה: "+String(error));}
  };
  const saveTab = async (tab:Tab) => {
    if(!desktop){notify("שמירה זמינה ביישום Windows");return;}
    let path=tab.path;
    if(!path){const chosen=await save({defaultPath:tab.title,filters:FILTERS});if(typeof chosen!=="string")return;path=chosen;}
    setBusy(true);
    try {
      const contentToWrite=tab.content;
      await invoke("write_text_file",{path,content:contentToWrite});
      const savedPath=path;
      setTabs(old=>old.map(t=>t.id===tab.id?{...t,path:savedPath,title:savedPath.split(/[\\/]/).pop()||t.title,saved:contentToWrite,dirty:t.content!==contentToWrite}:t));
      notify("הקובץ נשמר");
    }catch(e){notify("השמירה נכשלה: "+String(e));}finally{setBusy(false);}
  };
  const saveActive=async()=>{if(active)await saveTab(active);};
  const newFile=()=>{
    const tab:Tab={id:id(),path:null,title:"קובץ חדש",content:"",saved:"",dirty:false};
    buffers.current.set(tab.id,new TextBuffer(""));
    selections.current.set(tab.id,{start:0,end:0});
    setTabs(old=>[...old,tab]);setActiveId(tab.id);setCursor({line:1,column:1});
    window.setTimeout(()=>editor.current?.focus(),0);
  };
  const switchTab=(tab:Tab)=>{
    setActiveId(tab.id);
    const model=buffers.current.get(tab.id)??new TextBuffer(tab.content);
    buffers.current.set(tab.id,model);
    const selection=selections.current.get(tab.id)??{start:0,end:0};
    setCursor(model.positionAt(selection.start));
    window.requestAnimationFrame(()=>editor.current?.setSelectionRange(selection.start,selection.end));
  };
  const closeTab=(tab:Tab)=>{
    if(tab.dirty&&!window.confirm("יש שינויים שלא נשמרו. לסגור בכל זאת?"))return;
    const rest=tabs.filter(t=>t.id!==tab.id);
    buffers.current.delete(tab.id);
    selections.current.delete(tab.id);
    if(!rest.length){
      const welcome:Tab={id:"welcome",path:null,title:"ברוכים הבאים",content:WELCOME,saved:WELCOME,dirty:false};
      buffers.current.set("welcome",new TextBuffer(WELCOME));
      setTabs([welcome]);setActiveId("welcome");return;
    }
    setTabs(rest);
    if(activeId===tab.id){
      const next=rest[rest.length-1];setActiveId(next.id);
      const model=buffers.current.get(next.id)??new TextBuffer(next.content);
      buffers.current.set(next.id,model);
      const selection=selections.current.get(next.id)??{start:0,end:0};
      setCursor(model.positionAt(selection.start));
      window.requestAnimationFrame(()=>editor.current?.setSelectionRange(selection.start,selection.end));
    }
  };
  const undo=()=>{
    const model=buffers.current.get(activeId)??new TextBuffer(text);
    buffers.current.set(activeId,model);
    const value=model.undo();
    setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));
    const selection=selections.current.get(activeId)??{start:0,end:0};
    const next={start:Math.min(selection.start,value.length),end:Math.min(selection.end,value.length)};
    selections.current.set(activeId,next);setCursor(model.positionAt(next.start));
    window.requestAnimationFrame(()=>editor.current?.setSelectionRange(next.start,next.end));
  };
  const redo=()=>{
    const model=buffers.current.get(activeId)??new TextBuffer(text);
    buffers.current.set(activeId,model);
    const value=model.redo();
    setTabs(old=>old.map(t=>t.id===activeId?{...t,content:value,dirty:value!==t.saved}:t));
    const selection=selections.current.get(activeId)??{start:0,end:0};
    const next={start:Math.min(selection.start,value.length),end:Math.min(selection.end,value.length)};
    selections.current.set(activeId,next);setCursor(model.positionAt(next.start));
    window.requestAnimationFrame(()=>editor.current?.setSelectionRange(next.start,next.end));
  };
  const findMatch=(direction:1|-1)=>{
    const input=editor.current;
    if(!query||!input)return;
    const current=direction>0?input.selectionEnd:input.selectionStart;
    let index=direction>0?text.indexOf(query,current):text.lastIndexOf(query,Math.max(0,current-query.length-1));
    if(index<0)index=direction>0?text.indexOf(query):text.lastIndexOf(query);
    if(index<0){notify("לא נמצאו התאמות");return;}
    input.focus();
    input.setSelectionRange(index,index+query.length);
    selections.current.set(activeId,{start:index,end:index+query.length});
    updateCursor(index);
  };
  const replaceCurrent=()=>{
    const input=editor.current;
    if(!query||!input)return;
    const start=input.selectionStart;
    const end=input.selectionEnd;
    if(text.slice(start,end)!==query){findMatch(1);return;}
    const caret=start+replacement.length;
    edit(text.slice(0,start)+replacement+text.slice(end),{start:caret,end:caret});
  };
  const replaceAll=()=>{
    if(!query)return;
    const caret=editor.current?.selectionStart??0;
    const value=text.split(query).join(replacement);
    edit(value,{start:Math.min(caret,value.length),end:Math.min(caret,value.length)});
    notify("ההחלפה הושלמה");
  };
  const goToLine=()=>{
    const requested=window.prompt("מעבר למספר שורה",String(cursor.line));
    if(requested===null)return;
    const line=Number(requested);
    if(!Number.isInteger(line)||line<1){notify("יש להזין מספר שורה חיובי");return;}
    const offset=activeBuffer.getLineStart(line);
    editor.current?.focus();
    editor.current?.setSelectionRange(offset,offset);
    selections.current.set(activeId,{start:offset,end:offset});
    updateCursor(offset);
  };
  const run=(cmd:string)=>{
    setPalette(false);setPaletteQuery("");
    if(cmd==="new")newFile(); if(cmd==="workspace-file")void createWorkspaceFile(); if(cmd==="workspace-folder")void createWorkspaceFolder(); if(cmd==="open")void openFile(); if(cmd==="folder")void openFolder(); if(cmd==="save")void saveActive();
    if(cmd==="find"||cmd==="replace"){setFindOpen(true);setReplaceOpen(cmd==="replace");window.setTimeout(()=>findInput.current?.focus(),0);}
    if(cmd==="goto")goToLine();
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
      else if(mod&&e.key.toLowerCase()==="g"){e.preventDefault();goToLine();}
      else if(mod&&e.shiftKey&&e.key.toLowerCase()==="p"){e.preventDefault();setPalette(true);window.setTimeout(()=>paletteInput.current?.focus(),0);}
      else if(mod&&e.key.toLowerCase()==="z"&&e.target===editor.current){e.preventDefault();if(e.shiftKey)redo();else undo();}
      else if(mod&&e.key.toLowerCase()==="y"&&e.target===editor.current){e.preventDefault();redo();}
      else if(e.key==="F3"&&findOpen){e.preventDefault();findMatch(e.shiftKey?-1:1);}
      else if(e.key==="Escape"){setPalette(false);setFindOpen(false);}
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  });
  const editorKey=(e:KeyboardEvent<HTMLTextAreaElement>)=>{
    const el=e.currentTarget;
    const start=el.selectionStart;
    const end=el.selectionEnd;
    if(e.key==="Tab"){
      e.preventDefault();
      const next=text.slice(0,start)+"    "+text.slice(end);
      edit(next,{start:start+4,end:start+4});
      return;
    }
    if(e.key==="Enter"){
      e.preventDefault();
      const lineStart=start===0?0:text.lastIndexOf("\n",start-1)+1;
      const beforeCursor=text.slice(lineStart,start);
      const indent=beforeCursor.match(/^[\t ]*/)?.[0]??"";
      const opensEmptyBlock=beforeCursor.trimEnd().endsWith("{")&&text.slice(end).startsWith("}");
      const insertion=opensEmptyBlock
        ? "\n"+indent+"    "+"\n"+indent
        : "\n"+indent+(/[{\[(][\t ]*$/.test(beforeCursor)?"    ":"");
      const caret=opensEmptyBlock?start+1+indent.length+4:start+insertion.length;
      edit(text.slice(0,start)+insertion+text.slice(end),{start:caret,end:caret});
      return;
    }
    const pairs:Record<string,string>={"(":")","[":"]","{":"}","\"":"\"","'":"'"}; 
    const closing=pairs[e.key];
    if(closing){
      e.preventDefault();
      const selected=text.slice(start,end);
      const next=text.slice(0,start)+e.key+selected+closing+text.slice(end);
      const selection={start:start+1,end:start+1+selected.length};
      edit(next,selection);
    }
  };
  const toggle=(entry:FileEntry)=>{
    const next=new Set(expanded);
    if(next.has(entry.path))next.delete(entry.path);
    else{next.add(entry.path);if(!cache[entry.path])void readDir(entry.path);}
    setExpanded(next);
  };
  const tree=(entries:FileEntry[],depth=0):ReactNode=>entries.map(entry=>entry.is_dir?
    <div key={entry.path}><button className={"tree-row"+(activeDirectory===entry.path?" selected":"")} style={{paddingRight:12+depth*14}} onContextMenu={event=>{event.preventDefault();setContextMenu({entry,x:event.clientX,y:event.clientY});}} onClick={()=>{setActiveDirectory(entry.path);toggle(entry);}}>{expanded.has(entry.path)?<ChevronDown size={14}/>:<ChevronLeft size={14}/>}<Folder size={15} className="folder-icon"/><span>{entry.name}</span></button>{expanded.has(entry.path)&&cache[entry.path]&&tree(cache[entry.path],depth+1)}</div>:
    <button key={entry.path} className={"tree-row"+(active?.path===entry.path?" selected":"")} style={{paddingRight:30+depth*14}} onContextMenu={event=>{event.preventDefault();setContextMenu({entry,x:event.clientX,y:event.clientY});}} onClick={()=>void openPath(entry.path)}><FileCode2 size={14}/><span>{entry.name}</span></button>
  );
  const commands=[["new","קובץ חדש","Ctrl+N"],["workspace-file","קובץ חדש בתיקייה הנבחרת",""],["workspace-folder","תיקייה חדשה בתיקייה הנבחרת",""],["open","פתיחת קובץ","Ctrl+O"],["folder","פתיחת תיקייה","Ctrl+Shift+O"],["save","שמירת קובץ","Ctrl+S"],["find","חיפוש בקובץ","Ctrl+F"],["replace","חיפוש והחלפה","Ctrl+H"],["goto","מעבר לשורה","Ctrl+G"],["zoom+","הגדלת גופן",""],["zoom-","הקטנת גופן",""]];
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
        <div className="section-title"><span title={activeDirectory??rootName}>{activeDirectory?.split(/[\\/]/).filter(Boolean).pop()??rootName}</span><div className="section-actions"><button title="קובץ חדש בתיקייה הנבחרת" disabled={!activeDirectory} onClick={()=>void createWorkspaceFile()}><FilePlus2 size={14}/></button><button title="תיקייה חדשה בתיקייה הנבחרת" disabled={!activeDirectory} onClick={()=>void createWorkspaceFolder()}><FolderPlus size={14}/></button><button title="רענון תיקייה" disabled={!activeDirectory} onClick={()=>activeDirectory&&void readDir(activeDirectory)}><RotateCw size={14}/></button></div></div>
        <div className="tree">{root?(cache[root]?tree(cache[root]):<p>טוען תיקייה…</p>):<div className="empty"><FolderOpen size={27}/><span>עדיין לא נפתחה תיקיית עבודה</span><button onClick={()=>void openFolder()}>פתיחת תיקייה</button></div>}</div>
        <div className="open-tabs"><div className="section-title">קבצים פתוחים <span>{tabs.length}</span></div>{tabs.map(t=><button key={t.id} className={t.id===activeId?"on":""} onClick={()=>switchTab(t)}><FileCode2 size={14}/>{t.title}{t.dirty&&<Circle size={7} fill="currentColor"/>}</button>)}</div>
      </aside>}
      <section className="editor">
        <div className="tabs">{tabs.map(t=><div key={t.id} className={"tab"+(t.id===activeId?" active":"")} onClick={()=>switchTab(t)}><FileCode2 size={14}/><span>{t.title}</span>{t.dirty&&<Circle size={8} fill="currentColor"/>}<button title="סגירה" onClick={e=>{e.stopPropagation();closeTab(t);}}><X size={13}/></button></div>)}
          <button className="side-toggle" title="הצגה/הסתרת סרגל" onClick={()=>setSidebar(v=>!v)}><PanelRightClose size={15}/></button>
          <button className="side-toggle" title="לוח פקודות" onClick={()=>setPalette(true)}><Plus size={15}/></button>
        </div>
        {findOpen&&<div className="findbar"><div><Search size={14}/><input ref={findInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="חיפוש"/></div>{replaceOpen&&<div><Replace size={14}/><input value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="החלפה"/></div>}<small>{matches} התאמות</small><button onClick={()=>findMatch(-1)}>הקודם</button><button onClick={()=>findMatch(1)}>הבא</button>{replaceOpen&&<><button onClick={replaceCurrent}>החלף</button><button onClick={replaceAll}>החלף הכול</button></>}<button title="סגירה" onClick={()=>setFindOpen(false)}><X size={14}/></button></div>}
        {active?.id==="welcome"?<div className="welcome"><div className="welcome-card"><div className="hero-icon"><Code2 size={34}/></div><small>OFFLINE-FIRST DEVELOPMENT</small><h1>בונים. מריצים. נשארים מקומיים.</h1><p>סביבת פיתוח עצמאית, מהירה ופתוחה — בלי חשבון, בלי ענן ובלי תלות בשירות חיצוני.</p><div className="welcome-buttons"><button className="primary" onClick={newFile}><FilePlus2 size={16}/>קובץ חדש</button><button onClick={()=>void openFile()}><File size={16}/>פתיחת קובץ</button><button onClick={()=>void openFolder()}><FolderOpen size={16}/>פתיחת תיקייה</button></div><div className="features"><div><Keyboard/><b>קיצורי מקלדת</b><span>Ctrl+N קובץ חדש · Ctrl+S שמירה</span></div><div><HardDrive/><b>מקומי כברירת מחדל</b><span>הקבצים נשארים במחשב שלך</span></div><div><Activity/><b>בפיתוח פעיל</b><span>מנוע עריכה ושירותי שפה בדרך</span></div></div></div></div>:
        <div className="editor-body"><div className="crumb">{rootName}　›　{active?.title}</div><div className="codearea" style={{fontSize}}>
          <div className="gutter" ref={gutter}>{lines.map(n=><div key={n}>{n}</div>)}</div>
          <div className="code-input-wrap">
            <pre ref={highlight} className="syntax-layer" aria-hidden="true">{syntaxTokens.map((token,index)=><span key={index} className={"tok-"+token.kind}>{token.value}</span>)}</pre>
            <textarea className="code-input" ref={editor} value={text} onChange={e=>edit(e.currentTarget.value,{start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd})} onSelect={e=>{const target=e.currentTarget;selections.current.set(activeId,{start:target.selectionStart,end:target.selectionEnd});updateCursor(target.selectionStart);}} onClick={e=>updateCursor(e.currentTarget.selectionStart)} onKeyUp={e=>updateCursor(e.currentTarget.selectionStart)} onKeyDown={editorKey} onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop;if(highlight.current){highlight.current.scrollTop=e.currentTarget.scrollTop;highlight.current.scrollLeft=e.currentTarget.scrollLeft;}}} spellCheck={false} autoCapitalize="off" autoCorrect="off" dir="ltr" wrap="off" aria-label="עורך קוד"/>
          </div>
        </div></div>}
      </section>
    </section>
    <footer className="status"><div><span><GitBranch size={12}/> main</span><span><Circle size={7} fill="currentColor"/> מוכן</span></div><div><span>שורה {cursor.line}, עמודה {cursor.column}</span><span>UTF-8</span><span>{text.includes("\r\n")?"CRLF":"LF"}</span><span>{language(active?.path??null)}</span><span><HardDrive size={12}/> Offline</span></div></footer>
    {palette&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setPalette(false);}}><div className="palette"><div className="palette-search"><Command size={17}/><input ref={paletteInput} value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} placeholder="חפש פקודה…"/></div>{filtered.map(c=><button key={c[0]} onClick={()=>run(c[0])}><span>{c[1]}</span><kbd>{c[2]}</kbd></button>)}{!filtered.length&&<p>לא נמצאו פקודות</p>}<small>ESC לסגירה · פקודות זמינות בלבד</small></div></div>}
    {contextMenu&&<div className="context-dismiss" onMouseDown={()=>setContextMenu(null)}>
      <div className="context-menu" style={{left:Math.min(contextMenu.x,window.innerWidth-190),top:Math.min(contextMenu.y,window.innerHeight-105)}} onMouseDown={event=>event.stopPropagation()}>
        <div className="context-heading">{contextMenu.entry.name}</div>
        <button onClick={()=>{const entry=contextMenu.entry;setContextMenu(null);void renameEntry(entry);}}>שינוי שם</button>
        <button className="danger" onClick={()=>{const entry=contextMenu.entry;setContextMenu(null);void deleteEntry(entry);}}>מחיקה</button>
      </div>
    </div>}
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </main>;
}
