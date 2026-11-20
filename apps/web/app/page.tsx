"use client";
import { useEffect, useState, type FormEvent } from "react";
import { get, set, del } from "idb-keyval";
import { Activity, ArrowRight, CalendarDays, Dumbbell, ListChecks, LogOut, Timer } from "lucide-react";
import { recordKey, isWeightRecord, volume, estimatedMax, platesPerSide, nextLoad, weeklyWeightChange, muscleWorkouts, nextSupersetExercise } from "@/lib/training.mjs";
import { ScheduleEditor, type Schedule } from "@/components/schedule-editor";
import { ExerciseLibrary, type Exercise } from "@/components/exercise-library";
import { MuscleMap } from "@/components/muscle-map";
import { ProgressPhotos } from "@/components/progress-photos";
import { Button } from "@/components/ui/button";

type WeighIn={date:string;kg:number};
type User = {id:string;email?:string;demo?:boolean};
type Session = {user:User|null;csrf:string;demoAvailable?:boolean};
type Target = {sets:number;reps:number;restSeconds:number;group?:string;backup?:string;repCeiling?:number;deloadAfter?:number};
type Plan = {id:string;name:string;exercises:string[];targets?:Record<string,Target>};
const defaultTarget:Target={sets:3,reps:8,restSeconds:90};
type Kind="work"|"warmup"|"drop"|"timed"|"cardio";
type Lift = {exercise:string;kg:number;reps:number;kind?:Kind;seconds?:number;km?:number;rpe?:number;rir?:number;restSeconds?:number;group?:string};
const timed=(s:Pick<Lift,"kind">)=>s.kind==="timed"||s.kind==="cardio";
const describe=(s:Lift)=>[timed(s)?s.seconds+" sec"+(s.km?" · "+s.km+" km":""):s.kg+" kg × "+s.reps,s.kind&&s.kind!=="work"?s.kind:null,s.rpe!=null?"RPE "+s.rpe:null,s.rir!=null?"RIR "+s.rir:null,s.group?"Superset "+s.group:null].filter(Boolean).join(" · ");
type Rotation = {id:string;step:number;planId:string};
type Draft = {id:string;plan:Plan;sets:Lift[];restUntil:number;pending:boolean;restSeconds?:number;rotation?:Rotation};
type Workout = {id:string;plan:Plan;sets:Lift[];finishedAt:string;revision?:number};
const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/api/v1";
const links = [{label:"Today",icon:CalendarDays},{label:"Workout",icon:Dumbbell},{label:"Plans",icon:ListChecks},{label:"Progress",icon:Activity}] as const;
type Screen = typeof links[number]["label"];
const box = "rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:p-6";
async function api<T>(path:string, method="GET", payload?:unknown, csrf?:string):Promise<T> {
 const url = process.env.NEXT_PUBLIC_DIGIOPS === "1" ? prefix+"/index.php?route="+encodeURIComponent(path) : prefix+path;
 const res = await fetch(url,{method,cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000),
  headers:{...(payload!==undefined?{"Content-Type":"application/json"}:{}),...(csrf?{"X-CSRF-Token":csrf}:{})},
  body:payload===undefined?undefined:JSON.stringify(payload)});
 let data;
 try { data=await res.json(); } catch { throw new Error("OJAS could not reach its API (HTTP "+res.status+"). Retry, or ask the staging administrator to check API health."); }
 if(!res.ok) throw new Error(data?.error || "Request failed (HTTP "+res.status+").");
 return data;
}
const err=(e:unknown)=>e instanceof Error?e.message:"Something went wrong";
const fmt=(x:string)=>new Date(x).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
export default function Page(){
 const [session,S]=useState<Session|null>(null), [screen,screenTo]=useState<Screen>("Today");
 const [library,Library]=useState<Record<string,Exercise>>({});
 const [catalog,C]=useState<Record<string,string>>({}), [plans,P]=useState<Plan[]>([]), [history,H]=useState<Workout[]>([]);
 const [draft,D]=useState<Draft|null>(null), [selected,Sel]=useState("starter"), [exercise,E]=useState(""), [trend,Trend]=useState("");
 const [edit,Edit]=useState<Plan|null>(null), [busy,B]=useState(false), [notice,N]=useState(""), [online,On]=useState(true), [now,Now]=useState(0);
 const [ready,R]=useState(false), [kg,K]=useState(""), [reps,Reps]=useState(""), [storageOK,Safe]=useState(false);
 const [editingSet,SetEditing]=useState<number|null>(null);
 const [removed,Removed]=useState<{draftId:string;index:number;lift:Lift}|null>(null);
 const [correction,Correct]=useState<Workout|null>(null);
 const [workoutDate,WorkoutDate]=useState("");
 const [schedule,ScheduleState]=useState<Schedule|null>(null);
 const [override,Override]=useState(false);
 const [extras,Extras]=useState<Partial<Lift>>({});
 const [weighIns,WeighIns]=useState<WeighIn[]>([]);
 const [weighDate,WeighDate]=useState("");
 const [weighKg,WeighKg]=useState("");
 const [pair,Pair]=useState<{token:string;expiresAt:string}|null>(null);
 const uid=session?.user?.id;
 const key="ojas:draft:"+uid;
 const title=(id:string)=>catalog[id]||id;
 async function refresh(){
  const [c,p,h,s]=await Promise.all([api<{exercises:Record<string,string>;library:Record<string,Exercise>}>("/exercises"),api<{routines:Plan[]}>("/routines"),api<{workouts:Workout[];bodyweight:WeighIn[]}>("/progress"),api<{schedule:Schedule|null}>("/schedule")]);
  ScheduleState(s.schedule);C(c.exercises);Library(c.library??{});P(p.routines);H(h.workouts);WeighIns(h.bodyweight??[]);Trend(t=>t||Object.keys(c.exercises)[0]||"");
 }
 useEffect(()=>{api<Session>("/me").then(S).catch(e=>N(err(e))).finally(()=>R(true));
  const check=()=>On(navigator.onLine);check();window.addEventListener("online",check);window.addEventListener("offline",check);
  return ()=>{window.removeEventListener("online",check);window.removeEventListener("offline",check);};},[]);
 useEffect(()=>{ if(!uid)return; let current=true;Safe(false);
  get<Draft>(key).then(d=>{if(current){D(d||null);E(d?.plan.exercises[0]||"");Safe(true);}}).catch(()=>{if(current)N("Device storage unavailable. Workouts are disabled to protect your data.");});
  refresh().catch(e=>{if(current)N(err(e));});return()=>{current=false;};},[uid,key]);
 useEffect(()=>{Now(Date.now());const t=setInterval(()=>Now(Date.now()),500);return()=>clearInterval(t);},[]);
 async function action(fn:()=>Promise<void>){B(true);N("");try{await fn();}catch(e){N(err(e));}finally{B(false);}}
 async function persist(d:Draft){await set(key,d);D(d);}
 function pickLift(id:string){
  SetEditing(null);Extras({});E(id);const last=[...(draft?.sets||[])].reverse().find(s=>s.exercise===id)||history.flatMap(w=>[...w.sets].reverse()).find(s=>s.exercise===id);
  K(last?String(last.kg):"");Reps(last?String(last.reps):"");
 }
 function start(plan:Plan,rotation?:Rotation){void action(async()=>{if(draft||!storageOK)return;await persist({id:crypto.randomUUID(),plan,sets:[],restUntil:0,pending:false,rotation});Removed(null);pickLift(plan.exercises[0]);screenTo("Workout");});}
 function log(e:FormEvent){e.preventDefault();if(!draft||draft.pending||!draft.plan.exercises.includes(exercise))return;const clock=timed(extras), w=clock?0:Number(kg),n=clock?0:Number(reps);
  if((clock?!(extras.seconds&&Number.isInteger(extras.seconds)&&extras.seconds<=86400):kg===""||!Number.isFinite(w)||w<0||w>1000||!Number.isInteger(n)||n<1||n>300)||(editingSet===null&&draft.sets.length>=120)){N("Check the set values and the 120-set workout limit.");return;}
  void action(async()=>{
   const lift:Lift={...extras,exercise,kg:w,reps:n,group:extras.group??draft.plan.targets?.[exercise]?.group}, t=Date.now();
   const sets=editingSet===null?[...draft.sets,lift]:draft.sets.map((s,i)=>i===editingSet?lift:s);
   await persist({...draft,sets,restUntil:editingSet===null?t+(lift.restSeconds??draft.restSeconds??draft.plan.targets?.[exercise]?.restSeconds??90)*1000:draft.restUntil});
   SetEditing(null);if(editingSet!==null)Extras({});Now(t);
   const next=editingSet===null&&(!lift.kind||lift.kind==="work")?nextSupersetExercise(draft.plan,exercise,sets):null;
   if(next)pickLift(next);
   if(editingSet===null&&!clock&&lift.kind!=="warmup"&&isWeightRecord(lift,history.flatMap(x=>x.sets).concat(draft.sets).filter(s=>s.kind!=="warmup")))N("New weight best · "+title(exercise));
  });
 }
 function finish(){if(!draft||!draft.sets.length||!session)return;void action(async()=>{
  SetEditing(null);Removed(null);
  const pending={...draft,pending:true};await persist(pending);
  if(!navigator.onLine){N("Workout saved on this device. Reconnect and tap Retry save.");return;}
  const saved=await api<{workout:Workout;schedule:Schedule|null}>("/workouts","POST",{id:pending.id,plan:pending.plan,sets:pending.sets,rotation:pending.rotation},session.csrf);
  await del(key);D(null);ScheduleState(saved.schedule);Override(false);H(h=>[saved.workout,...h.filter(w=>w.id!==saved.workout.id)]);screenTo("Progress");N("Workout saved.");
 });}
 function login(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void action(async()=>{
  const s=session||await api<Session>("/me");S(await api<Session>("/auth/login","POST",{email:f.get("email"),password:f.get("password")},s.csrf));screenTo("Today");
 });}
 function pairDevice(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const token=String(new FormData(e.currentTarget).get("code")??"").trim().toLowerCase();
  void action(async()=>{
   const s=session||await api<Session>("/me");
   S(await api<Session>("/auth/pair/redeem","POST",{token},s.csrf));screenTo("Today");
  });
 }
 function demo(){void action(async()=>{
  const s=await api<Session>("/me");S(await api<Session>("/auth/demo","POST",{},s.csrf));screenTo("Today");
 });}
 function logout(){void action(async()=>{if(!session)return;await api("/auth/logout","POST",undefined,session.csrf);if(session.user?.demo)void del(key).catch(()=>{});S(null);Pair(null);D(null);ScheduleState(null);Override(false);Correct(null);SetEditing(null);Removed(null);P([]);H([]);WeighIns([]);WeighKg("");WeighDate("");C({});Library({});Edit(null);Sel("starter");Trend("");E("");K("");Reps("");Safe(false);S(await api<Session>("/me"));});}
 function savePlan(e:FormEvent){e.preventDefault();if(!edit||!session)return;void action(async()=>{
  const {routine}=await api<{routine:Plan}>(edit.id?"/routines/"+edit.id:"/routines",edit.id?"PATCH":"POST",{...edit,targets:Object.fromEntries(edit.exercises.map(id=>{const target=edit.targets?.[id]??defaultTarget;return [id,{...target,backup:target.backup&&!edit.exercises.includes(target.backup)?target.backup:undefined}];}))},session.csrf);
  P(p=>p.some(x=>x.id===routine.id)?p.map(x=>x.id===routine.id?routine:x):[...p,routine]);Sel(routine.id);Edit(null);
 });}
 const usesSchedule=!override&&schedule!==null&&schedule.mode!=="manual";
 const scheduledId=schedule?.mode==="weekly"?schedule.slots[(new Date(now).getDay()+6)%7]:
  schedule?.mode==="rotation"?schedule.slots[schedule.step%schedule.slots.length]:null;
 const plan=usesSchedule?plans.find(p=>p.id===scheduledId):plans.find(p=>p.id===selected)||plans[0];
 const restDay=usesSchedule&&schedule?.mode==="weekly"&&!scheduledId;
 function saveSchedule(mode:Schedule["mode"],slots:(string|null)[]){
  if(!session)return;
  void action(async()=>{const result=await api<{schedule:Schedule}>("/schedule","PUT",{mode,slots},session.csrf);ScheduleState(result.schedule);Override(false);N("Schedule saved.");});
 }
 function changeSets(sets:Lift[],after?:()=>void){
  if(!draft||draft.pending||busy||sets.length>120)return;
  void action(async()=>{await persist({...draft,sets});SetEditing(null);after?.();});
 }
 function saveCorrection(e:FormEvent){
  e.preventDefault();if(!correction||!session)return;
  void action(async()=>{
   const {workout}=await api<{workout:Workout}>("/workouts/"+correction.id,"PATCH",{date:workoutDate,revision:correction.revision??0,sets:correction.sets},session.csrf);
   H(h=>h.map(w=>w.id===workout.id?workout:w).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)));
   Correct(null);N("Workout updated.");
  });
 }
 const personalBest=history.flatMap(w=>w.sets).filter(s=>s.exercise===trend&&!timed(s)&&s.kind!=="warmup").sort((a,b)=>recordKey(b)-recordKey(a))[0];
 const bestEstimate=Math.max(0,...history.flatMap(w=>w.sets).filter(s=>s.exercise===trend&&s.kind!=="warmup").map(s=>estimatedMax(s)??0));
 const orderedWeights=[...weighIns].sort((a,b)=>b.date.localeCompare(a.date));
 const weightDate=weighDate||(now?new Date(now).toISOString().slice(0,10):"");
 function saveWeight(e:FormEvent){
  e.preventDefault();if(!session)return;
  void action(async()=>{
   const {entry}=await api<{entry:WeighIn}>("/bodyweight","PUT",{date:weightDate,kg:Number(weighKg)},session.csrf);
   WeighIns(entries=>[...entries.filter(x=>x.date!==entry.date),entry]);WeighKg("");N("Weigh-in saved.");
  });
 }
 function importData(file?:File){
  if(!file||!session||session.user?.demo)return;
  void action(async()=>{
   if(file.size>65536)throw new Error("The pilot accepts OJAS JSON files up to 64 KiB.");
   const parsed:unknown=JSON.parse(await file.text());
   const result=await api<{added:number;skipped:number}>("/import","POST",parsed,session.csrf);
   await refresh();N("Import complete: "+result.added+" added, "+result.skipped+" existing entries kept.");
  });
 }
 async function exportData(){
  await action(async()=>{const data=await api("/export");const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
   const link=document.createElement("a");link.href=url;link.download="ojas-training.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
 }
 const muscleSummary=now?muscleWorkouts(history,library,now-7*86400000):[];
 function swapExercise(replacement:string){
  if(!draft||draft.pending||busy||editingSet!==null||!library[replacement]
    ||draft.plan.exercises.includes(replacement)||draft.sets.some(s=>s.exercise===exercise)
    ||removed?.draftId===draft.id&&removed.lift.exercise===exercise)return;
  const targets={...draft.plan.targets};
  if(targets[exercise])targets[replacement]={...targets[exercise],backup:undefined};
  for(const id of Object.keys(targets)) if(targets[id].backup===replacement)targets[id]={...targets[id],backup:undefined};
  delete targets[exercise];
  const plan={...draft.plan,targets,exercises:draft.plan.exercises.map(id=>id===exercise?replacement:id)};
  void action(async()=>{await persist({...draft,plan});pickLift(replacement);N("Exercise swapped for this workout only.");});
 }
 const plannedBackup=draft?.plan.targets?.[exercise]?.backup;
 const swaps=draft&&library[exercise]?Object.entries(library).filter(([id,item])=>(id===plannedBackup||item.muscles[0]===library[exercise].muscles[0])&&!draft.plan.exercises.includes(id)):[];
 const activeTarget=draft?.plan.targets?.[exercise];
 const suggestion=nextLoad(history,exercise,activeTarget);
 const weightChange=weeklyWeightChange(weighIns);
 const rest=Math.max(0,Math.ceil(((draft?.restUntil||0)-now)/1000));
 const points=history.filter(w=>w.sets.some(s=>s.exercise===trend)).slice(0,10).reverse().map(w=>({id:w.id,date:w.finishedAt,top:w.sets.filter(s=>s.exercise===trend).reduce((a,b)=>b.kg>a.kg||(b.kg===a.kg&&b.reps>a.reps)?b:a)}));
 const max=Math.max(1,...points.map(p=>p.top.kg));
 return <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-32 pt-5 sm:px-8 sm:pt-8">
  <header className="mb-8 flex items-center justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-3">
   <span className="grid size-11 place-items-center rounded-xl bg-lime-300 text-neutral-950"><Dumbbell size={24}/></span>
   <div><p className="text-xl font-black tracking-widest">OJAS</p><p className="text-xs text-neutral-400">Strength training log</p></div></div>
   {uid&&<Button variant="ghost" onClick={logout} disabled={busy} aria-label="Sign out"><LogOut size={18}/> <span className="hidden sm:inline">Sign out</span></Button>}
  </header>
  {session?.user?.demo&&<p className="mb-4 rounded-xl border border-lime-300/30 p-3 text-sm">Staging demo · Temporary session. Workouts and plans are not saved to a pilot account.</p>}
  {!online&&<p role="status" className="mb-4 rounded-xl border border-amber-400/40 p-3 text-amber-200">Offline · Active workout changes stay on this device.</p>}
  {notice&&<p role="status" className="mb-4 rounded-xl border border-lime-300/30 p-3">{notice}</p>}
  {!ready?<p role="status">Connecting…</p>:!uid?<section className={box+" mx-auto max-w-md"}><p className="text-sm font-bold text-lime-300">INVITE-ONLY PILOT</p><h1 className="mt-2 text-3xl font-black">Sign in to train</h1>
   <form className="mt-6 grid gap-4" onSubmit={login}><label className="grid gap-1">Email<input name="email" type="email" required autoComplete="username"/></label>
   <label className="grid gap-1">Password<input name="password" type="password" required autoComplete="current-password"/></label>
   <Button disabled={busy||!online}>Sign in <ArrowRight size={17}/></Button></form>
   <details className="mt-4"><summary className="cursor-pointer">Pair from a signed-in device</summary>
   <form className="mt-3 grid gap-3" onSubmit={pairDevice}><label className="grid gap-1">One-time pairing code<input name="code" required maxLength={48} autoComplete="off" spellCheck={false} autoCapitalize="none"/></label><Button variant="outline" disabled={!online||busy}>Pair device</Button></form></details>
   {session?.demoAvailable&&<div className="mt-5 grid gap-2 border-t border-white/10 pt-5"><Button type="button" variant="outline" disabled={busy||!online} onClick={demo}>Try staging demo</Button><p className="text-center text-xs text-neutral-400">No password needed. Demo data expires after 30 minutes or on sign-out.</p></div>}</section>:<>
  <h1 className="mb-5 text-4xl font-black tracking-tight sm:text-5xl">{screen}</h1>
  {screen==="Today"&&session?.user&&!session.user.demo&&<details className="mb-4 rounded-xl border border-white/10 p-3">
   <summary className="cursor-pointer">Pair another device</summary>
   <p className="my-2 text-sm text-neutral-400">Only share this code with your own device. It grants account access and can be used once within five minutes.</p>
   <Button variant="outline" disabled={!online||busy} onClick={()=>void action(async()=>Pair(await api<{token:string;expiresAt:string}>("/auth/pair/create","POST",{},session.csrf)))}>Generate code</Button>
   {pair&&now<Date.parse(pair.expiresAt)&&<output className="mt-2 block select-all break-all font-mono">{pair.token}</output>}
  </details>}
  {screen==="Today"&&<div className="grid gap-4 sm:grid-cols-2">
   <section className={box+" bg-gradient-to-br from-lime-950 to-neutral-900"}><p className="text-xs font-bold uppercase tracking-widest text-lime-300">Next session</p>
    <h2 className="my-3 text-2xl font-black">{draft?.plan.name||plan?.name||(restDay?"Rest day":"Choose a plan")}</h2>
    <p className="mb-5 text-neutral-300">{draft?draft.sets.length+" sets logged":plan?.exercises.map(title).join(" · ")||(restDay?"No routine is scheduled for today.":"Pick a routine to get started.")}</p>
    {draft?<Button onClick={()=>screenTo("Workout")}>{draft.pending?"Resume saving":"Resume workout"}</Button>:<Button disabled={busy||!storageOK} onClick={()=>plan?start(plan,usesSchedule&&schedule?.mode==="rotation"?{id:schedule.id,step:schedule.step,planId:plan.id}:undefined):screenTo("Plans")}>{plan?"Start workout":"Browse plans"}<ArrowRight size={17}/></Button>}
   </section><section className={box}><p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Last session</p><h2 className="my-3 text-2xl font-black">{history[0]?.plan.name||"No workouts yet"}</h2><p className="text-neutral-300">{history[0]?fmt(history[0].finishedAt)+" · "+history[0].sets.length+" sets":"Finish a workout to see it here."}</p></section></div>}
  {screen==="Workout"&&(draft?<section className={box}><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-black">{draft.plan.name}</h2><span className="flex items-center gap-2 rounded-full bg-lime-950 px-3 py-1 text-lime-300"><Timer size={16}/>{rest?Math.floor(rest/60)+":"+String(rest%60).padStart(2,"0"):"Ready"}</span></div>
   {!draft.pending&&<div className="mb-4 flex flex-wrap items-end gap-3">
    <label className="grid gap-1 text-sm">Rest after next set
     <select disabled={busy} value={draft.restSeconds??"plan"} onChange={e=>{const seconds=e.target.value==="plan"?undefined:Number(e.target.value);void action(async()=>persist({...draft,restSeconds:seconds}));}}>
      <option value="plan">Use plan ({activeTarget?.restSeconds??90} sec)</option>
      {[0,30,45,60,90,120,180,300,600,900].map(n=><option key={n} value={n}>{n?n+" sec":"Off"}</option>)}
     </select>
    </label>
    {rest>0&&<Button variant="outline" disabled={busy} onClick={()=>void action(async()=>persist({...draft,restUntil:0}))}>Skip rest</Button>}
    <p className="text-sm text-neutral-400">Session volume: {volume(draft.sets).toLocaleString(undefined,{maximumFractionDigits:2})} kg</p>
   </div>}
   {draft.pending?<p className="mb-4 text-amber-200">Completion pending. Retry the same save once connected.</p>:<form className="mb-5 grid gap-3" onSubmit={log}><label className="grid gap-1">Exercise<select disabled={editingSet!==null} value={exercise} onChange={e=>pickLift(e.target.value)}>{draft.plan.exercises.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label>
    {activeTarget&&<p className="text-sm text-lime-300">Target: {activeTarget.sets} sets × {activeTarget.reps} reps · {draft.sets.filter(s=>s.exercise===exercise&&(!s.kind||s.kind==="work")).length} working sets logged</p>}
    {suggestion&&!timed(extras)&&editingSet===null&&<aside className="rounded-xl border border-white/10 p-3 text-sm">
     <p>Suggested working load: <strong>{suggestion.kg} kg{suggestion.reps!==undefined?" × "+suggestion.reps:""}</strong>. {suggestion.reason}</p>
     <Button type="button" variant="outline" className="mt-2" disabled={busy} onClick={()=>{K(String(suggestion.kg));if(suggestion.reps!==undefined)Reps(String(suggestion.reps));}}>Use suggestion</Button>
    </aside>}
    {editingSet===null&&swaps.length>0&&!draft.sets.some(s=>s.exercise===exercise)&&!(removed?.draftId===draft.id&&removed.lift.exercise===exercise)&&
     <label className="grid gap-1">Swap for this workout<select disabled={busy} value="" onChange={e=>{if(e.target.value)swapExercise(e.target.value);}}>
      <option value="">Choose a planned backup or same-muscle alternative</option>{swaps.map(([id,item])=><option key={id} value={id}>{item.name} · {item.equipment}{id===plannedBackup?" · Planned backup":""}</option>)}
     </select></label>}
    <label className="grid gap-1">Set type<select value={extras.kind??"work"} onChange={e=>Extras({...extras,kind:e.target.value as Kind,seconds:undefined,km:undefined})}>
     <option value="work">Working set</option><option value="warmup">Warm-up</option><option value="drop">Drop set</option><option value="timed">Timed</option><option value="cardio">Cardio</option>
    </select></label>
    {timed(extras)?<div className="grid grid-cols-2 gap-3">
     <label className="grid gap-1">Duration (sec)<input required type="number" min="1" max="86400" value={extras.seconds??""} onChange={e=>Extras({...extras,seconds:e.target.value===""?undefined:e.target.valueAsNumber})}/></label>
     {extras.kind==="cardio"&&<label className="grid gap-1">Distance (km, optional)<input type="number" min="0.001" max="1000" step="any" value={extras.km??""} onChange={e=>Extras({...extras,km:e.target.value===""?undefined:e.target.valueAsNumber})}/></label>}
    </div>:<div className="grid grid-cols-2 gap-3"><label className="grid gap-1">Weight (kg)<input inputMode="decimal" type="number" min="0" max="1000" step="any" required value={kg} onChange={e=>K(e.target.value)}/></label><label className="grid gap-1">Reps<input inputMode="numeric" type="number" min="1" max="300" step="1" required value={reps} onChange={e=>Reps(e.target.value)}/></label></div>}
    <details><summary className="cursor-pointer py-2">Set options · effort, rest, superset</summary>
    <div className="grid grid-cols-2 gap-3">
     {([["rpe","RPE",1,10],["rir","RIR",0,10],["restSeconds","Rest override (sec)",0,900]] as const).map(([field,label,min,max])=><label key={field} className="grid gap-1">{label}<input type="number" min={min} max={max} value={extras[field]??""} onChange={e=>Extras({...extras,...(field==="rpe"?{rir:undefined}:field==="rir"?{rpe:undefined}:{}),[field]:e.target.value===""?undefined:e.target.valueAsNumber})}/></label>)}
     <label className="grid gap-1">Superset letter<input maxLength={1} pattern="[A-Z]" value={extras.group??""} onChange={e=>Extras({...extras,group:e.target.value.toUpperCase()||undefined})}/></label>
    </div></details>
    {!timed(extras)&&Number(kg)>=20&&<p className="text-sm text-neutral-400">20 kg bar · {platesPerSide(Number(kg)).label}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy}>{editingSet===null?"Log set":"Save set changes"}</Button>{editingSet!==null&&<Button type="button" variant="outline" disabled={busy} onClick={()=>pickLift(exercise)}>Cancel edit</Button>}</div></form>}
   <ul className="mb-5 divide-y divide-white/10">{draft.sets.map((s,i)=><li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{i+1}. {title(s.exercise)} · {describe(s)}</span>
    {!draft.pending&&<div className="flex flex-wrap gap-1">
     <Button variant="ghost" disabled={busy} aria-label={"Edit set "+(i+1)} onClick={()=>{SetEditing(i);E(s.exercise);K(String(s.kg));Reps(String(s.reps));Extras(s);}}>Edit</Button>
     <Button variant="ghost" disabled={busy||draft.sets.length>=120} aria-label={"Copy set "+(i+1)} onClick={()=>changeSets([...draft.sets,s])}>Copy</Button>
     <Button variant="ghost" disabled={busy} aria-label={"Remove set "+(i+1)} onClick={()=>changeSets(draft.sets.filter((_,j)=>j!==i),()=>Removed({draftId:draft.id,index:i,lift:s}))}>Remove</Button>
    </div>}</li>)}</ul>
   {removed?.draftId===draft.id&&!draft.pending&&<Button className="mb-4" variant="outline" disabled={busy||draft.sets.length>=120} onClick={()=>{const sets=[...draft.sets];sets.splice(removed.index,0,removed.lift);changeSets(sets,()=>Removed(null));}}>Undo removal</Button>}
   <div className="flex flex-wrap gap-2"><Button disabled={busy||!draft.sets.length||(draft.pending&&!online)} onClick={finish}>{draft.pending?"Retry save":"Finish workout"}</Button>
   {!draft.pending&&<Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Discard this workout and its unsaved sets?"))void action(async()=>{await del(key);D(null);screenTo("Today");});}}>Discard</Button>}</div>
  </section>:<section className={box}><p className="mb-4">No active workout.</p><Button onClick={()=>screenTo("Today")}>Go to Today</Button></section>)}
  {screen==="Plans"&&<div className="grid gap-4 sm:grid-cols-2">
   {!edit&&<ExerciseLibrary library={library}/>}
   <ScheduleEditor key={schedule?.id??"manual"} schedule={schedule} plans={plans} disabled={busy||!online} onSave={saveSchedule}/>
   <section className={box}><h2 className="mb-3 text-xl font-black">Routines</h2>{plans.map(p=><div key={p.id} className="border-b border-white/10 py-3"><p className="font-bold">{p.name}{plan?.id===p.id?" · Selected":""}</p><p className="mb-2 text-sm text-neutral-400">{p.exercises.map(title).join(" · ")}</p><div className="flex gap-2"><Button variant="outline" onClick={()=>{Sel(p.id);Override(true);screenTo("Today");}}>Use plan</Button>{p.id.startsWith("starter")?<Button variant="ghost" onClick={()=>Edit({...p,id:""})}>Customize copy</Button>:<Button variant="ghost" onClick={()=>Edit(p)}>Edit</Button>}</div></div>)}
   <Button className="mt-4" onClick={()=>Edit({id:"",name:"",exercises:[]})}>New plan</Button></section>
   {edit&&<form className={box+" grid gap-3"} onSubmit={savePlan}><h2 className="text-xl font-black">{edit.id?"Edit plan":"New plan"}</h2><label className="grid gap-1">Plan name<input required maxLength={100} value={edit.name} onChange={e=>Edit({...edit,name:e.target.value})}/></label>
    <ExerciseLibrary library={library} selected={edit.exercises} onToggle={id=>{const targets={...edit.targets};const checked=edit.exercises.includes(id);
     if(checked)delete targets[id];else targets[id]={...defaultTarget};
     Edit({...edit,targets,exercises:checked?edit.exercises.filter(x=>x!==id):[...edit.exercises,id]});
    }}/>
    {edit.exercises.map(id=><fieldset key={id} className="grid grid-cols-3 gap-2"><legend className="mb-2 font-bold">{title(id)} targets</legend>
     {([["sets","Sets",1,20],["reps","Reps",1,300],["restSeconds","Rest (sec)",0,900]] as const).map(([field,label,min,max])=><label className="grid gap-1 text-sm" key={field}>{label}<input required type="number" min={min} max={max} step="1" value={Number.isNaN(edit.targets?.[id]?.[field])?"":edit.targets?.[id]?.[field]??defaultTarget[field]} onChange={e=>Edit({...edit,targets:{...edit.targets,[id]:{...(edit.targets?.[id]??defaultTarget),[field]:e.target.valueAsNumber}}})}/></label>)}
     <label className="col-span-3 grid gap-1 text-sm">Double progression: upper reps (optional)<input type="number" min={(edit.targets?.[id]?.reps??defaultTarget.reps)+1} max="300" value={edit.targets?.[id]?.repCeiling??""} onChange={e=>Edit({...edit,targets:{...edit.targets,[id]:{...(edit.targets?.[id]??defaultTarget),repCeiling:e.target.value?e.target.valueAsNumber:undefined}}})}/></label>
     <label className="col-span-3 grid gap-1 text-sm">Suggest deload after missed sessions (optional)<input type="number" min="2" max="6" value={edit.targets?.[id]?.deloadAfter??""} onChange={e=>Edit({...edit,targets:{...edit.targets,[id]:{...(edit.targets?.[id]??defaultTarget),deloadAfter:e.target.value?e.target.valueAsNumber:undefined}}})}/></label>
     <label className="col-span-3 grid gap-1 text-sm">Superset letter (optional)<input maxLength={1} pattern="[A-Z]" value={edit.targets?.[id]?.group??""} onChange={e=>Edit({...edit,targets:{...edit.targets,[id]:{...(edit.targets?.[id]??defaultTarget),group:e.target.value.toUpperCase()||undefined}}})}/></label>
     <label className="col-span-3 grid gap-1 text-sm">Planned backup (optional)<select value={edit.exercises.includes(edit.targets?.[id]?.backup??"")?"":edit.targets?.[id]?.backup??""} onChange={e=>Edit({...edit,targets:{...edit.targets,[id]:{...(edit.targets?.[id]??defaultTarget),backup:e.target.value||undefined}}})}><option value="">None</option>{Object.entries(catalog).filter(([key])=>!edit.exercises.includes(key)).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label>
    </fieldset>)}
    <div className="flex gap-2"><Button disabled={busy||!online||!edit.exercises.length}>Save plan</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>Edit(null)}>Cancel</Button></div></form>}
  </div>}
  {screen==="Progress"&&<div className="grid gap-4 sm:grid-cols-2">{session?.user&&!session.user.demo&&<ProgressPhotos key={session.user.id} request={api} csrf={session.csrf} online={online}/>}<section className={box}><h2 className="mb-4 text-xl font-black">Top set by session</h2><label className="grid gap-1">Exercise<select value={trend} onChange={e=>Trend(e.target.value)}>{Object.entries(catalog).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   {bestEstimate>0&&<p className="mt-3 text-sm">Estimated 1RM: {bestEstimate.toFixed(1)} kg · Epley, 1–10 reps</p>}
   {personalBest&&<p className="mt-3 text-sm text-lime-300">Heaviest logged set: {personalBest.kg} kg × {personalBest.reps}</p>}
   {points.length?<ol className="mt-4 grid gap-3">{points.map(p=><li key={p.id}><div className="flex justify-between text-sm"><span>{fmt(p.date)}</span><span>{p.top.kg} kg × {p.top.reps}</span></div><div className="mt-1 h-2 rounded-full bg-neutral-700"><div aria-hidden className="h-2 rounded-full bg-lime-300" style={{width:(p.top.kg/max*100)+"%"}}/></div></li>)}</ol>:<p className="mt-4 text-neutral-400">No logged sets for this exercise.</p>}</section>
   <section className={box}><h2 className="mb-2 text-xl font-black">Muscle workload · last 7 days</h2>
   <p className="mb-3 text-sm text-neutral-400">Working and drop sets count toward the catalog’s primary muscle only. External load × reps does not include body weight. Last trained is not a recovery estimate.</p>
   <MuscleMap rows={muscleSummary} now={now}/>
   {muscleSummary.length?<ul className="divide-y divide-white/10">{muscleSummary.map(x=><li key={x.muscle} className="py-2"><p className="font-bold">{x.muscle} · {x.sets} sets</p><p className="text-sm text-neutral-400">{x.kgReps.toLocaleString(undefined,{maximumFractionDigits:2})} kg·reps · Last trained {fmt(new Date(x.last).toISOString())}</p></li>)}</ul>:<p className="text-sm text-neutral-400">No qualifying sets in the last seven days.</p>}
   </section>
   <section className={box}><h2 className="mb-4 text-xl font-black">Body weight</h2>
   <form className="grid gap-3" onSubmit={saveWeight}>
    <label className="grid gap-1">Date (UTC)<input type="date" required min="1900-01-01" max={now?new Date(now).toISOString().slice(0,10):undefined} value={weightDate} onChange={e=>WeighDate(e.target.value)}/></label>
    <label className="grid gap-1">Weight (kg)<input type="number" inputMode="decimal" required min="1" max="1000" step="0.01" value={weighKg} onChange={e=>WeighKg(e.target.value)}/></label>
    <p className="text-sm text-neutral-400">Saving the same date replaces that day’s entry.</p>
    <Button disabled={busy||!online}>Save weigh-in</Button>
   </form>
   {weightChange!==null&&<p className="mt-4 text-sm">Change between 7-day averages: {weightChange>0?"+":""}{weightChange.toFixed(2)} kg</p>}
   {orderedWeights.length>0&&<ul className="mt-4 divide-y divide-white/10">{orderedWeights.slice(0,14).map(x=><li className="flex justify-between py-2" key={x.date}><span>{fmt(x.date)}</span><span>{x.kg} kg</span></li>)}</ul>}
   </section>
   <section className={box}><h2 className="mb-4 text-xl font-black">Workout history</h2><Button className="mb-3" variant="outline" disabled={busy||!online} onClick={()=>void exportData()}>Export training JSON</Button>{!session?.user?.demo&&<label className="mb-4 grid gap-1 text-sm">Import OJAS JSON (up to 64 KiB)<input type="file" accept=".json,application/json" disabled={busy||!online} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";importData(file);}}/><span className="text-neutral-400">Adds missing routines, workouts, and weigh-ins. Existing data and your schedule stay unchanged.</span></label>}{history.length?history.map(w=><details key={w.id} className="border-b border-white/10 py-3"><summary className="cursor-pointer font-bold">{w.plan.name} · {fmt(w.finishedAt)} · {w.sets.length} sets</summary><ul className="mt-2 text-sm text-neutral-300">{w.sets.map((s,i)=><li key={i}>{title(s.exercise)} · {describe(s)}</li>)}</ul><Button variant="outline" className="mt-3" disabled={busy} onClick={()=>{Correct(w);WorkoutDate(w.finishedAt.slice(0,10));}}>Correct workout</Button></details>):<p className="text-neutral-400">No completed workouts.</p>}</section>
   {correction&&<form className={box+" grid gap-3 sm:col-span-2"} onSubmit={saveCorrection}>
    <h2 className="text-xl font-black">Correct {correction.plan.name}</h2>
    <label className="grid gap-1">Workout date (UTC)<input required type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={workoutDate} onChange={e=>WorkoutDate(e.target.value)}/></label>
    {correction.sets.map((s,i)=><fieldset className="grid grid-cols-2 gap-3" key={i}><legend>{i+1}. {title(s.exercise)}</legend>
     {timed(s)?<p className="col-span-2">{describe(s)} · Date correction only</p>:<><label className="grid gap-1">Weight (kg)<input required type="number" min="0" max="1000" step="any" value={Number.isNaN(s.kg)?"":s.kg} onChange={e=>{const kg=e.target.valueAsNumber;Correct(c=>c?{...c,sets:c.sets.map((x,j)=>i===j?{...x,kg}:x)}:c);}}/></label>
     <label className="grid gap-1">Reps<input required type="number" min="1" max="300" step="1" value={Number.isNaN(s.reps)?"":s.reps} onChange={e=>{const reps=e.target.valueAsNumber;Correct(c=>c?{...c,sets:c.sets.map((x,j)=>i===j?{...x,reps}:x)}:c);}}/></label></>}
    </fieldset>)}
    <div className="flex flex-wrap gap-2"><Button disabled={busy||!online}>Save correction</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>Correct(null)}>Cancel</Button></div>
   </form>}</div>}
  <nav aria-label="App navigation" className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)]"><div className="mx-auto grid max-w-2xl grid-cols-4">{links.map(({label,icon:Icon})=><button type="button" key={label} aria-current={screen===label?"page":undefined} onClick={()=>screenTo(label)} className={"flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-bold "+(screen===label?"text-lime-300":"text-neutral-400 hover:text-white")}><Icon size={21}/>{label}</button>)}</div></nav>
  </>}
 </main>;
}
