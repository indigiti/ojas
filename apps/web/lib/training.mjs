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
