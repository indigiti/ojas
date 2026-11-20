"use client";
import {useState} from "react";
const front=[["Chest",42,38,36,18],["Shoulders",30,35,11,19],["Shoulders",79,35,11,19],["Biceps",24,54,11,22],["Biceps",85,54,11,22],["Forearms",18,77,11,24],["Forearms",91,77,11,24],["Core",46,57,28,26],["Quads",40,96,18,39],["Quads",62,96,18,39]] as const;
const back=[["Back",39,38,42,43],["Shoulders",30,35,9,18],["Shoulders",81,35,9,18],["Triceps",24,54,11,22],["Triceps",85,54,11,22],["Forearms",18,77,11,24],["Forearms",91,77,11,24],["Glutes",40,83,40,14],["Hamstrings",40,98,18,37],["Hamstrings",62,98,18,37],["Calves",42,138,15,30],["Calves",63,138,15,30]] as const;
export function MuscleMap({rows,now}:{rows:{muscle:string;sets:number;last:number}[];now:number}){
 const [mode,Mode]=useState<"sets"|"recency">("sets");
 const lookup=new Map(rows.map(r=>[r.muscle,r]));
 function color(muscle:string){
  const row=lookup.get(muscle);
  if(!row)return "#404040";
  if(mode==="recency")return now-row.last<48*3600000?"#fbbf24":"#38bdf8";
  return row.sets>=8?"#bef264":row.sets>=4?"#84cc16":"#4d7c0f";
 }
 return <div className="my-4 grid gap-2">
  <label className="grid gap-1 text-sm">Muscle map view<select value={mode} onChange={e=>Mode(e.target.value==="recency"?"recency":"sets")}><option value="sets">Working sets</option><option value="recency">Last trained</option></select></label>
  <div className="grid grid-cols-2 gap-2">
   {([["Front",front],["Back",back]] as const).map(([side,regions])=><figure key={side} className="text-center">
    <svg viewBox="0 0 120 190" className="mx-auto w-full max-w-32" role="img" aria-label={side+" muscle regions; details are listed below"}>
     <circle cx="60" cy="16" r="11" fill="#525252"/>
     <path d="M52 26h16l13 7 10 5 7 25 7 36-11 6-12-38-2 24 2 41-3 38 5 9H62l-2-63-2 63H36l5-9-3-38 2-41-2-24-12 38-11-6 7-36 7-25 10-5z" fill="#262626" stroke="#737373"/>
     {regions.map(([name,x,y,width,height])=><rect key={name+x+y} x={x} y={y} width={width} height={height} rx="5" fill={color(name)}><title>{name}: {lookup.get(name)?.sets??0} sets</title></rect>)}
    </svg><figcaption className="text-sm">{side}</figcaption></figure>)}
  </div>
  <p className="text-xs text-neutral-400">{mode==="recency"?"Amber: trained in the last 48 hours. Blue: trained earlier this week. This is not a recovery prediction.":"Green: 1–3, 4–7, and 8+ sets from darkest to brightest."} Gray: no qualifying sets in this period.</p>
 </div>;
}
