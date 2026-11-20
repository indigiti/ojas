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
