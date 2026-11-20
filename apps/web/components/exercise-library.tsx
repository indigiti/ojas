"use client";
import {useState} from "react";
export type Exercise={name:string;equipment:string;muscles:string[]};
export function ExerciseLibrary({library,selected=[],onToggle}:{library:Record<string,Exercise>;selected?:string[];onToggle?:(id:string)=>void}){
 const [query,Query]=useState(""),[equipment,Equipment]=useState(""),[muscle,Muscle]=useState("");
 const entries=Object.entries(library);
 const equipmentOptions=[...new Set(entries.map(([,x])=>x.equipment))].sort();
 const muscles=[...new Set(entries.flatMap(([,x])=>x.muscles))].sort();
 const visible=entries.filter(([,x])=>(!equipment||x.equipment===equipment)&&(!muscle||x.muscles.includes(muscle))&&[x.name,x.equipment,...x.muscles].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 return <section className={onToggle?"grid gap-3":"grid gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:col-span-2 sm:p-6"}>
  <h2 className="text-xl font-black">{onToggle?"Choose exercises":"Exercise library"}</h2>
  <label className="grid gap-1">Search exercises<input type="search" value={query} onChange={e=>Query(e.target.value)}/></label>
  <div className="grid grid-cols-2 gap-2">
   <label className="grid min-w-0 gap-1">Equipment<select value={equipment} onChange={e=>Equipment(e.target.value)}><option value="">All equipment</option>{equipmentOptions.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="grid min-w-0 gap-1">Muscles<select value={muscle} onChange={e=>Muscle(e.target.value)}><option value="">All muscles</option>{muscles.map(x=><option key={x}>{x}</option>)}</select></label>
  </div>
  <p className="text-sm text-neutral-400" role="status">{visible.length} of {entries.length} exercises{onToggle?" · "+selected.length+" of 12 selected":""}</p>
  {onToggle&&selected.length>0&&<div className="flex flex-wrap gap-2">{selected.map(id=><button key={id} type="button" onClick={()=>onToggle(id)} className="rounded-full border border-white/20 px-3 py-1 text-sm" aria-label={"Remove "+(library[id]?.name??id)}>{library[id]?.name??id} ×</button>)}</div>}
  <ul className="max-h-72 overflow-auto divide-y divide-white/10">
   {visible.map(([id,x])=><li key={id} className="py-2">{onToggle?<label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={selected.includes(id)} disabled={selected.length>=12&&!selected.includes(id)} onChange={()=>onToggle(id)}/><span>{x.name}<small className="block text-neutral-400">{[x.equipment,...x.muscles].join(" · ")}</small></span></label>:<><span>{x.name}</span><small className="block text-neutral-400">{[x.equipment,...x.muscles].join(" · ")}</small></>}</li>)}
  </ul>
 </section>;
}
