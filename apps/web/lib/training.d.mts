type Lift={exercise:string;kg:number;reps:number};
export function recordKey(lift:Lift):number;
export function isWeightRecord(lift:Lift,previous:Lift[]):boolean;
export function volume(sets:Lift[]):number;

export function estimatedMax(lift:Lift):number|null;
export function platesPerSide(total:number):{label:string};

export function nextLoad(history:{sets:(Lift & {kind?:string})[]}[],exercise:string,target?:{sets:number;reps:number}):{kg:number;reason:string}|null;
export function weeklyWeightChange(entries:{date:string;kg:number}[]):number|null;

export function muscleWorkouts(history:{finishedAt:string;sets:(Lift & {kind?:string})[]}[],library:Record<string,{muscles:string[]}>,since:number):{muscle:string;sets:number;kgReps:number;last:number}[];
