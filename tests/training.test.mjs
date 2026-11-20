import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isWeightRecord,volume} from '../apps/web/lib/training.mjs';
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
