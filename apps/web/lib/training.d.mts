type Lift={exercise:string;kg:number;reps:number};
export function recordKey(lift:Lift):number;
export function isWeightRecord(lift:Lift,previous:Lift[]):boolean;
export function volume(sets:Lift[]):number;
