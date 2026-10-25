import test from 'node:test';import assert from 'node:assert/strict';import {unwrap,meter,transformer,consumption,linkedTransformer} from '../src/normalizers.js';
test('unwraps data envelope',()=>assert.deepEqual(unwrap({data:[{meterId:'J1'}],total:1}),[{meterId:'J1'}]));
test('normalizes observed meter fields',()=>{const m=meter({meterId:'J100050',serialNo:'HP51466',dtCode:'DT-011',installStatus:'Decommissioned'});assert.equal(m.id,'J100050');assert.equal(m.transformerCode,'DT-011');assert.equal(m.status,'Decommissioned')});
test('matches dtCode to transformer code',()=>{const t=transformer({code:'DT-011',name:'Malviya Nagar DT 11'});assert.equal(linkedTransformer({dtCode:'DT-011'},[t]).name,'Malviya Nagar DT 11');assert.equal(linkedTransformer({dtCode:'DT-99'},[t]),null)});
test('preserves energy fields',()=>{const c=consumption({data:[{timestamp:'2026-10-25',kWh:12,kVAh:13,voltR:230}]});assert.equal(c[0].kWh,12);assert.equal(c[0].voltR,230)});
