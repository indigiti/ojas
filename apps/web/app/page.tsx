"use client";
import { useEffect, useState, type FormEvent } from "react";
import { get, set, del } from "idb-keyval";
import { Activity, ArrowRight, CalendarDays, Dumbbell, ListChecks, LogOut, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

type User = {id:string;email:string};
type Session = {user:User|null;csrf:string};
type Plan = {id:string;name:string;exercises:string[]};
type Lift = {exercise:string;kg:number;reps:number};
type Draft = {id:string;plan:Plan;sets:Lift[];restUntil:number;pending:boolean};
type Workout = {id:string;plan:Plan;sets:Lift[];finishedAt:string};
const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/api/v1";
const links = [{label:"Today",icon:CalendarDays},{label:"Workout",icon:Dumbbell},{label:"Plans",icon:ListChecks},{label:"Progress",icon:Activity}] as const;
type Screen = typeof links[number]["label"];
const box = "rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:p-6";
async function api<T>(path:string, method="GET", payload?:unknown, csrf?:string):Promise<T> {
 const res = await fetch(prefix+path,{method,cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000),
  headers:{...(payload!==undefined?{"Content-Type":"application/json"}:{}),...(csrf?{"X-CSRF-Token":csrf}:{})},
  body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await res.json();
 if(!res.ok) throw new Error(data.error || "Request failed");
 return data;
}
const err=(e:unknown)=>e instanceof Error?e.message:"Something went wrong";
const fmt=(x:string)=>new Date(x).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
export default function Page(){
 const [session,S]=useState<Session|null>(null), [screen,screenTo]=useState<Screen>("Today");
 const [catalog,C]=useState<Record<string,string>>({}), [plans,P]=useState<Plan[]>([]), [history,H]=useState<Workout[]>([]);
 const [draft,D]=useState<Draft|null>(null), [selected,Sel]=useState("starter"), [exercise,E]=useState(""), [trend,Trend]=useState("");
 const [edit,Edit]=useState<Plan|null>(null), [busy,B]=useState(false), [notice,N]=useState(""), [online,On]=useState(true), [now,Now]=useState(0);
 const [ready,R]=useState(false), [kg,K]=useState(""), [reps,Reps]=useState(""), [storageOK,Safe]=useState(false);
 const uid=session?.user?.id;
 const key="ojas:draft:"+uid;
 const title=(id:string)=>catalog[id]||id;
 async function refresh(){
  const [c,p,h]=await Promise.all([api<{exercises:Record<string,string>}>("/exercises"),api<{routines:Plan[]}>("/routines"),api<{workouts:Workout[]}>("/progress")]);
  C(c.exercises);P(p.routines);H(h.workouts);Trend(t=>t||Object.keys(c.exercises)[0]||"");
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
  E(id);const last=[...(draft?.sets||[])].reverse().find(s=>s.exercise===id)||history.flatMap(w=>[...w.sets].reverse()).find(s=>s.exercise===id);
  K(last?String(last.kg):"");Reps(last?String(last.reps):"");
 }
 function start(plan:Plan){void action(async()=>{if(draft||!storageOK)return;await persist({id:crypto.randomUUID(),plan,sets:[],restUntil:0,pending:false});pickLift(plan.exercises[0]);screenTo("Workout");});}
 function log(e:FormEvent){e.preventDefault();if(!draft||draft.pending||!draft.plan.exercises.includes(exercise))return;const w=Number(kg),n=Number(reps);
  if(kg===""||!Number.isFinite(w)||w<0||w>1000||!Number.isInteger(n)||n<1||n>300||draft.sets.length>=120){N("Enter 0–1,000 kg and 1–300 reps; maximum 120 sets.");return;}
  void action(async()=>{const t=Date.now();await persist({...draft,sets:[...draft.sets,{exercise,kg:w,reps:n}],restUntil:t+90000});Now(t);});
 }
 function finish(){if(!draft||!draft.sets.length||!session)return;void action(async()=>{
  const pending={...draft,pending:true};await persist(pending);
  if(!navigator.onLine){N("Workout saved on this device. Reconnect and tap Retry save.");return;}
  const saved=await api<{workout:Workout}>("/workouts","POST",{id:pending.id,plan:pending.plan,sets:pending.sets},session.csrf);
  await del(key);D(null);H(h=>[saved.workout,...h.filter(w=>w.id!==saved.workout.id)]);screenTo("Progress");N("Workout saved.");
 });}
 function login(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void action(async()=>{
  const s=session||await api<Session>("/me");S(await api<Session>("/auth/login","POST",{email:f.get("email"),password:f.get("password")},s.csrf));screenTo("Today");
 });}
 function logout(){void action(async()=>{if(!session)return;await api("/auth/logout","POST",undefined,session.csrf);S(null);D(null);P([]);H([]);C({});Edit(null);Sel("starter");Trend("");E("");K("");Reps("");Safe(false);S(await api<Session>("/me"));});}
 function savePlan(e:FormEvent){e.preventDefault();if(!edit||!session)return;void action(async()=>{
  const {routine}=await api<{routine:Plan}>(edit.id?"/routines/"+edit.id:"/routines",edit.id?"PATCH":"POST",edit,session.csrf);
  P(p=>p.some(x=>x.id===routine.id)?p.map(x=>x.id===routine.id?routine:x):[...p,routine]);Sel(routine.id);Edit(null);
 });}
 const plan=plans.find(p=>p.id===selected)||plans[0];
 const rest=Math.max(0,Math.ceil(((draft?.restUntil||0)-now)/1000));
 const points=history.filter(w=>w.sets.some(s=>s.exercise===trend)).slice(0,10).reverse().map(w=>({id:w.id,date:w.finishedAt,top:w.sets.filter(s=>s.exercise===trend).reduce((a,b)=>b.kg>a.kg||(b.kg===a.kg&&b.reps>a.reps)?b:a)}));
 const max=Math.max(1,...points.map(p=>p.top.kg));
 return <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-32 pt-5 sm:px-8 sm:pt-8">
  <header className="mb-8 flex items-center justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-3">
   <span className="grid size-11 place-items-center rounded-xl bg-lime-300 text-neutral-950"><Dumbbell size={24}/></span>
   <div><p className="text-xl font-black tracking-widest">OJAS</p><p className="text-xs text-neutral-400">Strength training log</p></div></div>
   {uid&&<Button variant="ghost" onClick={logout} disabled={busy} aria-label="Sign out"><LogOut size={18}/> <span className="hidden sm:inline">Sign out</span></Button>}
  </header>
  {!online&&<p role="status" className="mb-4 rounded-xl border border-amber-400/40 p-3 text-amber-200">Offline · Active workout changes stay on this device.</p>}
  {notice&&<p role="status" className="mb-4 rounded-xl border border-lime-300/30 p-3">{notice}</p>}
  {!ready?<p role="status">Connecting…</p>:!uid?<section className={box+" mx-auto max-w-md"}><p className="text-sm font-bold text-lime-300">INVITE-ONLY PILOT</p><h1 className="mt-2 text-3xl font-black">Sign in to train</h1>
   <form className="mt-6 grid gap-4" onSubmit={login}><label className="grid gap-1">Email<input name="email" type="email" required autoComplete="username"/></label>
   <label className="grid gap-1">Password<input name="password" type="password" required autoComplete="current-password"/></label>
   <Button disabled={busy||!online}>Sign in <ArrowRight size={17}/></Button></form></section>:<>
  <h1 className="mb-5 text-4xl font-black tracking-tight sm:text-5xl">{screen}</h1>
  {screen==="Today"&&<div className="grid gap-4 sm:grid-cols-2">
   <section className={box+" bg-gradient-to-br from-lime-950 to-neutral-900"}><p className="text-xs font-bold uppercase tracking-widest text-lime-300">Next session</p>
    <h2 className="my-3 text-2xl font-black">{draft?.plan.name||plan?.name||"Choose a plan"}</h2>
    <p className="mb-5 text-neutral-300">{draft?draft.sets.length+" sets logged":plan?.exercises.map(title).join(" · ")||"Pick a routine to get started."}</p>
    {draft?<Button onClick={()=>screenTo("Workout")}>{draft.pending?"Resume saving":"Resume workout"}</Button>:<Button disabled={busy||!storageOK} onClick={()=>plan?start(plan):screenTo("Plans")}>{plan?"Start workout":"Browse plans"}<ArrowRight size={17}/></Button>}
   </section><section className={box}><p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Last session</p><h2 className="my-3 text-2xl font-black">{history[0]?.plan.name||"No workouts yet"}</h2><p className="text-neutral-300">{history[0]?fmt(history[0].finishedAt)+" · "+history[0].sets.length+" sets":"Finish a workout to see it here."}</p></section></div>}
  {screen==="Workout"&&(draft?<section className={box}><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-black">{draft.plan.name}</h2><span className="flex items-center gap-2 rounded-full bg-lime-950 px-3 py-1 text-lime-300"><Timer size={16}/>{rest?Math.floor(rest/60)+":"+String(rest%60).padStart(2,"0"):"Ready"}</span></div>
   {draft.pending?<p className="mb-4 text-amber-200">Completion pending. Retry the same save once connected.</p>:<form className="mb-5 grid gap-3" onSubmit={log}><label className="grid gap-1">Exercise<select value={exercise} onChange={e=>pickLift(e.target.value)}>{draft.plan.exercises.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3"><label className="grid gap-1">Weight (kg)<input inputMode="decimal" type="number" min="0" max="1000" step="any" required value={kg} onChange={e=>K(e.target.value)}/></label><label className="grid gap-1">Reps<input inputMode="numeric" type="number" min="1" max="300" step="1" required value={reps} onChange={e=>Reps(e.target.value)}/></label></div>
    <Button disabled={busy}>Log set</Button></form>}
   <ul className="mb-5 divide-y divide-white/10">{draft.sets.map((s,i)=><li key={i} className="flex justify-between gap-3 py-2"><span>{i+1}. {title(s.exercise)}</span><span>{s.kg} kg × {s.reps}</span></li>)}</ul>
   <div className="flex flex-wrap gap-2"><Button disabled={busy||!draft.sets.length||(draft.pending&&!online)} onClick={finish}>{draft.pending?"Retry save":"Finish workout"}</Button>
   {!draft.pending&&<Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Discard this workout and its unsaved sets?"))void action(async()=>{await del(key);D(null);screenTo("Today");});}}>Discard</Button>}</div>
  </section>:<section className={box}><p className="mb-4">No active workout.</p><Button onClick={()=>screenTo("Today")}>Go to Today</Button></section>)}
  {screen==="Plans"&&<div className="grid gap-4 sm:grid-cols-2">
   <section className={box}><h2 className="mb-3 text-xl font-black">Routines</h2>{plans.map(p=><div key={p.id} className="border-b border-white/10 py-3"><p className="font-bold">{p.name}{plan?.id===p.id?" · Selected":""}</p><p className="mb-2 text-sm text-neutral-400">{p.exercises.map(title).join(" · ")}</p><div className="flex gap-2"><Button variant="outline" onClick={()=>{Sel(p.id);screenTo("Today");}}>Use plan</Button>{p.id!=="starter"&&<Button variant="ghost" onClick={()=>Edit(p)}>Edit</Button>}</div></div>)}
   <Button className="mt-4" onClick={()=>Edit({id:"",name:"",exercises:[]})}>New plan</Button></section>
   {edit&&<form className={box+" grid gap-3"} onSubmit={savePlan}><h2 className="text-xl font-black">{edit.id?"Edit plan":"New plan"}</h2><label className="grid gap-1">Plan name<input required maxLength={100} value={edit.name} onChange={e=>Edit({...edit,name:e.target.value})}/></label>
    <fieldset><legend className="mb-2">Exercises</legend>{Object.entries(catalog).map(([id,name])=><label key={id} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={edit.exercises.includes(id)} onChange={e=>Edit({...edit,exercises:e.target.checked?[...edit.exercises,id]:edit.exercises.filter(x=>x!==id)})}/>{name}</label>)}</fieldset>
    <div className="flex gap-2"><Button disabled={busy||!online||!edit.exercises.length}>Save plan</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>Edit(null)}>Cancel</Button></div></form>}
  </div>}
  {screen==="Progress"&&<div className="grid gap-4 sm:grid-cols-2"><section className={box}><h2 className="mb-4 text-xl font-black">Top set by session</h2><label className="grid gap-1">Exercise<select value={trend} onChange={e=>Trend(e.target.value)}>{Object.entries(catalog).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   {points.length?<ol className="mt-4 grid gap-3">{points.map(p=><li key={p.id}><div className="flex justify-between text-sm"><span>{fmt(p.date)}</span><span>{p.top.kg} kg × {p.top.reps}</span></div><div className="mt-1 h-2 rounded-full bg-neutral-700"><div aria-hidden className="h-2 rounded-full bg-lime-300" style={{width:(p.top.kg/max*100)+"%"}}/></div></li>)}</ol>:<p className="mt-4 text-neutral-400">No logged sets for this exercise.</p>}</section>
   <section className={box}><h2 className="mb-4 text-xl font-black">Workout history</h2>{history.length?history.map(w=><details key={w.id} className="border-b border-white/10 py-3"><summary className="cursor-pointer font-bold">{w.plan.name} · {fmt(w.finishedAt)} · {w.sets.length} sets</summary><ul className="mt-2 text-sm text-neutral-300">{w.sets.map((s,i)=><li key={i}>{title(s.exercise)} · {s.kg} kg × {s.reps}</li>)}</ul></details>):<p className="text-neutral-400">No completed workouts.</p>}</section></div>}
  <nav aria-label="App navigation" className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)]"><div className="mx-auto grid max-w-2xl grid-cols-4">{links.map(({label,icon:Icon})=><button type="button" key={label} aria-current={screen===label?"page":undefined} onClick={()=>screenTo(label)} className={"flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-bold "+(screen===label?"text-lime-300":"text-neutral-400 hover:text-white")}><Icon size={21}/>{label}</button>)}</div></nav>
  </>}
 </main>;
}
