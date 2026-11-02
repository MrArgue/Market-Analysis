// Reproducible FICTIONAL input for UI inspection. Never market evidence.
import {writeFile} from 'node:fs/promises';
import {SPEC,VERSION} from '../src/macro-model.js';
const vintages=[],cutoffs=[],calendar=[];
for(let i=0;i<156;i++){
 const period=new Date(Date.UTC(2010,i,1)).toISOString().slice(0,10),vintage=new Date(Date.UTC(2010,i+1,10)).toISOString().slice(0,10);
 for(const [j,series]of [...SPEC.growth,...SPEC.inflation].entries())vintages.push({series,period,vintage,availableAt:new Date(Date.parse(vintage)+86400000).toISOString(),value:100*Math.exp(.002*i+.03*Math.sin(i/(j<3?5:8)+j/10))});
 cutoffs.push(new Date(Date.UTC(2010,i+1,0,23,59,59)).toISOString().replace('.000',''));
}
for(let i=0;i<5113;i++){const d=new Date(Date.UTC(2010,0,i+1));if(![0,6].includes(d.getUTCDay()))calendar.push(d.toISOString().slice(0,10));}
const definitions=[['SPY','strategic','SHV'],['SHV','cash',null],['TLT','strategic','SHV'],['GLD','strategic','SHV'],['XLK','tactical','SPY'],['MTUM','tactical','SPY']];
const assets=definitions.map(([symbol,view,benchmark],j)=>({symbol,view,benchmark,basis:'dividend-split-adjusted',coverageVerified:true,rows:calendar.map((date,i)=>({date,adjClose:100*Math.exp(i*(j===1?.00003:.0002)+.08*Math.sin(i/(50+j*10)))}))}));
const input={version:VERSION,fictional:true,provenance:{reviewed:false,source:'FICTIONAL deterministic UI example; no provider observations or exchange-holiday calendar'},vintages,cutoffs,returns:{asOf:calendar.at(-1),calendar,assets}};
const output=process.argv[2];if(!output)throw Error('Pass an output JSON path.');await writeFile(output,JSON.stringify(input));console.log('Wrote fictional research input.');
