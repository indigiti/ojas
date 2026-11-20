/** @typedef {{exercise:string,kg:number,reps:number}} Lift */
/** @param {Lift} lift */
export function recordKey(lift) {
  // Reps are capped at 300; keep this a load-only comparison for fractional weights.
  return lift.kg;
}
/** @param {Lift} lift @param {Lift[]} previous */
export function isWeightRecord(lift, previous) {
  return lift.kg > 0 && previous.some(s => s.exercise === lift.exercise) &&
    previous.every(s => s.exercise !== lift.exercise || s.kg < lift.kg);
}
/** @param {Lift[]} sets */
export function volume(sets) { return sets.reduce((total, s) => total + s.kg * s.reps, 0); }

/** @param {Lift} lift */
export function estimatedMax(lift) {
  if (lift.kg<=0 || lift.reps<1 || lift.reps>10) return null;
  return lift.reps===1?lift.kg:lift.kg*(1+lift.reps/30);
}
/** @param {number} total */
export function platesPerSide(total) {
  if (!Number.isFinite(total)||total<20||total>1000) return {label:"Invalid target load"};
  // Integer quarter-kilogram units; smallest supported plate is 1.25 kg.
  let units=Math.floor((total-20)*2+1e-8);
  const parts=[];
  for(const plate of [25,20,15,10,5,2.5,1.25]){
    const count=Math.floor(units/(plate*4));
    if(count){parts.push(count+" × "+plate+" kg");units-=count*plate*4;}
  }
  const actual=20+Math.floor((total-20)*2+1e-8)/2-units/2;
  return {label:(parts.length?parts.join(" + ")+" per side":"empty bar")+(Math.abs(actual-total)>1e-8?" ("+actual+" kg loadable)":"")};
}

// Progression is advisory: never change a plan or logged load automatically.
export function nextLoad(history, exercise, target) {
  if (!target) return null;
  for (const workout of history) {
    const sets=workout.sets.filter(s=>s.exercise===exercise && (!s.kind||s.kind==="work"));
    if (!sets.length) continue;
    const kg=sets[0].kg;
    if (kg<=0) return null;
    if (sets.some(s=>s.kg!==kg)) return {kg,reason:"Mixed working loads last time; review before increasing."};
    if (sets.length<target.sets || sets.some(s=>s.reps<target.reps)) return {kg,reason:"Repeat the load until all prescribed working sets hit the rep target."};
    const next=Math.min(1000,Math.round((kg+2.5)*100)/100);
    return {kg:next,reason:next>kg?"All working sets met the target. Try adding up to 2.5 kg if your equipment allows.":"Logged load is at the app limit."};
  }
  return null;
}

export function weeklyWeightChange(entries) {
  const sorted=[...entries].sort((a,b)=>a.date.localeCompare(b.date));
  if (sorted.length<2) return null;
  const end=Date.parse(sorted.at(-1).date);
  const recent=[], prior=[];
  for (const entry of sorted) {
    const days=(end-Date.parse(entry.date))/86400000;
    if (days<7) recent.push(entry.kg);
    else if(days<14) prior.push(entry.kg);
  }
  if (recent.length<2||prior.length<2) return null;
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  return mean(recent)-mean(prior);
}

export function muscleWorkouts(history, library, since) {
  const result=new Map();
  for(const workout of history){
    const date=Date.parse(workout.finishedAt);
    if(!Number.isFinite(date)||date<since) continue;
    for(const s of workout.sets){
      if(!["work","drop"].includes(s.kind??"work")) continue;
      const primary=library[s.exercise]?.muscles[0];
      if(!primary) continue;
      const row=result.get(primary)??{muscle:primary,sets:0,kgReps:0,last:0};
      row.sets++;
      row.kgReps+=s.kg*s.reps;
      row.last=Math.max(row.last,date);
      result.set(primary,row);
    }
  }
  return [...result.values()].sort((a,b)=>b.sets-a.sets||a.muscle.localeCompare(b.muscle));
}
