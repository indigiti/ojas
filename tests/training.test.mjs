import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isWeightRecord,volume,estimatedMax,platesPerSide} from '../apps/web/lib/training.mjs';
const lift=(exercise,kg,reps=8)=>({exercise,kg,reps});
test('a strict weight PR requires an earlier set for the same exercise',()=>{
 const previous=[lift('row',25),lift('bench',60)];
 assert.equal(isWeightRecord(lift('row',25.25),previous),true);
 assert.equal(isWeightRecord(lift('row',25,12),previous),false);
 assert.equal(isWeightRecord(lift('curl',20),previous),false);
 assert.equal(isWeightRecord(lift('row',0),previous),false);
});
test('volume totals load times reps; bodyweight contributes no external load',()=>{
 assert.equal(volume([lift('row',25.5),lift('bench',50,4),lift('pushup',0,15)]),404);
});

test('Epley is bounded and a single rep is the measured load',()=>{
 assert.equal(estimatedMax(lift('bench',60,1)),60);
 assert.equal(estimatedMax(lift('bench',60,5)),70);
 assert.equal(estimatedMax(lift('bench',60,11)),null);
});
test('plate calculator reports the closest lower load for a 20 kg bar',()=>{
 assert.equal(platesPerSide(102.5).label,'1 × 25 kg + 1 × 15 kg + 1 × 1.25 kg per side');
 assert.match(platesPerSide(21).label,/20 kg loadable/);
});

test('progression requires all working sets to hit the prescription',async()=>{
 const {nextLoad}=await import('../apps/web/lib/training.mjs');
 const target={sets:2,reps:8};
 const set=(kg,reps,kind)=>({exercise:'bench',kg,reps,kind});
 assert.equal(nextLoad([{sets:[set(40,8),set(40,8),set(20,6,'warmup')]}],'bench',target).kg,42.5);
 assert.equal(nextLoad([{sets:[set(40,8),set(40,7)]}],'bench',target).kg,40);
 assert.equal(nextLoad([{sets:[set(40,8),set(40,8,'drop')]}],'bench',target).kg,40);
 assert.equal(nextLoad([{sets:[set(40,8),set(42,8)]}],'bench',target).kg,40);
 assert.equal(nextLoad([{sets:[set(0,8),set(0,8)]}],'bench',target),null);
 assert.equal(nextLoad([{sets:[set(1000,8),set(1000,8)]}],'bench',target).kg,1000);
});
test('weight change compares two sampled seven-day windows',async()=>{
 const {weeklyWeightChange}=await import('../apps/web/lib/training.mjs');
 const rows=[{date:'2024-02-01',kg:80},{date:'2024-02-04',kg:82},{date:'2024-02-08',kg:78},{date:'2024-02-14',kg:80}];
 assert.equal(weeklyWeightChange(rows),-2);
 assert.equal(weeklyWeightChange(rows.slice(0,3)),null);
});
