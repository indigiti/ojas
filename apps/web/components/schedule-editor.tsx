"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";

export type Schedule = {mode:"manual"|"weekly"|"rotation";slots:(string|null)[];id:string;step:number;revision?:number};
const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export function ScheduleEditor({schedule,plans,disabled,onSave}:{
 schedule:Schedule|null;plans:{id:string;name:string}[];disabled:boolean;
 onSave:(mode:Schedule["mode"],slots:(string|null)[])=>void;
}){
 const [mode,Mode]=useState<Schedule["mode"]>(schedule?.mode??"manual");
 const [weekly,Weekly]=useState<(string|null)[]>(schedule?.mode==="weekly"?schedule.slots:Array(7).fill(null));
 const [rotation,Rotation]=useState<(string|null)[]>(schedule?.mode==="rotation"?schedule.slots:[null]);
 const slots=mode==="weekly"?weekly:mode==="rotation"?rotation:[];
 const update=(i:number,value:string|null)=>(mode==="weekly"?Weekly:Rotation)(slots.map((slot,j)=>i===j?value:slot));
 return <form className="grid gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:col-span-2 sm:p-6" onSubmit={e=>{e.preventDefault();onSave(mode,slots);}}>
  <h2 className="text-xl font-black">Training schedule</h2>
  <label className="grid gap-1">Schedule type<select value={mode} disabled={disabled} onChange={e=>Mode(e.target.value as Schedule["mode"])}>
   <option value="manual">Choose each workout</option><option value="weekly">Weekly schedule</option><option value="rotation">Rolling rotation</option>
  </select></label>
  {mode==="weekly"&&<p className="text-sm text-neutral-400">Today follows your device’s local weekday. Unassigned days are rest days.</p>}
  {mode==="rotation"&&<p className="text-sm text-neutral-400">Complete the scheduled workout to move to the next slot. Changing the rotation resets it to slot 1.</p>}
  <div className="grid gap-3 sm:grid-cols-2">
   {slots.map((slot,i)=><div key={i} className="flex items-end gap-2">
    <label className="grid min-w-0 flex-1 gap-1">{mode==="weekly"?weekdays[i]:"Slot "+(i+1)}
     <select disabled={disabled} required={mode==="rotation"} value={slot??""} onChange={e=>update(i,e.target.value||null)}>
      <option value="">{mode==="weekly"?"Rest":"Choose a routine"}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    {mode==="rotation"&&rotation.length>1&&<Button type="button" variant="ghost" disabled={disabled} aria-label={"Remove slot "+(i+1)} onClick={()=>Rotation(rotation.filter((_,j)=>j!==i))}>Remove</Button>}
   </div>)}
  </div>
  <div className="flex flex-wrap gap-2">{mode==="rotation"&&<Button type="button" variant="outline" disabled={disabled||rotation.length>=12} onClick={()=>Rotation([...rotation,null])}>Add slot</Button>}
   <Button disabled={disabled||(mode==="rotation"&&rotation.some(x=>!x))}>Save schedule</Button></div>
 </form>;
}
