import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../src/index.js';
import {chartPage} from '../src/chart-page.js';
import {sectorPage,sectorScript} from '../src/sector-page.js';
test('both pages expose the same navigation with distinct active links',async()=>{
 assert.match(chartPage,/<a href="\/" aria-current="page">Tech Chart/);
 assert.match(sectorPage,/<a href="\/sectors" aria-current="page">US Sectors\/Industries/);
 const page=await worker.fetch(new Request('https://example.com/sectors'));
 assert.equal(page.status,200);assert.match(await page.text(),/Load returns/);
 assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);
});
test('table ranks only industry rows per column and renders names as text',async()=>{
 class Node{constructor(){this.children=[];this.textContent='';this.disabled=false;}append(...children){this.children.push(...children);}replaceChildren(){this.children=[];}}
 const nodes=Object.fromEntries(['load-sectors','sector-status','sector-results','source-label','sector-method'].map(k=>[k,new Node()]));
 const returns=n=>Object.fromEntries(['day','five','mtd','fourWeeks','threeMonths','ytd','year'].map(k=>[k,n]));
 const data={sourceLabel:'TEST',methodology:'TEST',status:'TEST',groups:[{name:'One',returns:returns(100),industries:Array.from({length:5},(_,i)=>({name:i===0?'<script>bad</script>':'Industry '+i,returns:returns(i-2)}))},{name:'Two',returns:returns(-100),industries:Array.from({length:5},(_,i)=>({name:'Other '+i,returns:returns(i+3)}))}],benchmark:{name:'S&P 500',returns:returns(1000)}};
 vm.runInNewContext(sectorScript,{document:{getElementById:id=>nodes[id],createElement:()=>new Node()},fetch:async()=>({ok:true,json:async()=>data})});
 await nodes['load-sectors'].onclick();
 const all=n=>n.children.flatMap(c=>[c,...all(c)]),elements=all(nodes['sector-results']);
 assert.equal(nodes['sector-results'].children.length,2);
 assert.equal(elements.filter(n=>n.className==='return-best').length,14);
 assert.equal(elements.filter(n=>n.className==='return-worst').length,14);
 assert.ok(elements.some(n=>n.textContent==='<script>bad</script>'));
 assert.equal(nodes['load-sectors'].disabled,false);
});