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
  const sessions=history.map(w=>w.sets.filter(s=>s.exercise===exercise&&(!s.kind||s.kind==="work"))).filter(s=>s.length);
  const recent=sessions[0];
  if (!recent) return null;
  const base=recent[0].kg;
  if (base<=0 || recent.some(s=>s.kg!==base)) return base>0?{kg:base,reason:"Mixed working loads last time; review before increasing."}:null;
  const belowBase=s=>s.length<target.sets||s.slice(0,target.sets).some(x=>x.reps<target.reps);
  const n=target.deloadAfter;
  if (n&&sessions.length>=n&&sessions.slice(0,n).every(s=>s.every(x=>x.kg===base)&&belowBase(s))) {
    return {kg:Math.max(0.01,Math.round(base*90)/100),reps:target.reps,reason:"Repeated misses at this load. Consider a 10% deload."};
  }
  if(target.repCeiling&&!belowBase(recent)){
    const lowest=Math.min(...recent.slice(0,target.sets).map(s=>s.reps));
    if(lowest<target.repCeiling)return {kg:base,reps:lowest+1,reason:"Add a rep at the same load before increasing weight."};
    return {kg:Math.min(1000,Math.round((base+2.5)*100)/100),reps:target.reps,reason:base>=1000?"Logged load is at the app limit.":"Upper rep target reached. Increase load and reset to the base reps."};
  }
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

export function nextSupersetExercise(plan, exercise, sets) {
  const group=plan.targets?.[exercise]?.group;
  if(!group) return null;
  const members=plan.exercises.filter(id=>plan.targets?.[id]?.group===group);
  if(members.length<2) return null;
  const i=members.indexOf(exercise);
  for(let offset=1;offset<members.length;offset++){
    const id=members[(i+offset)%members.length];
    const count=sets.filter(s=>s.exercise===id&&(!s.kind||s.kind==="work")).length;
    if(count<plan.targets[id].sets)return id;
  }
  return null;
}
