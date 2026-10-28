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
test('client advances bounded load steps and shows progress before rendering',async()=>{
 class Node{constructor(){this.children=[];this.textContent='';}append(...n){this.children.push(...n);}replaceChildren(){this.children=[];}}
 const nodes=Object.fromEntries(['load-sectors','sector-status','sector-results','source-label','sector-method'].map(k=>[k,new Node()]));let calls=0;
 const ready={state:'ready',sourceLabel:'Approximate',methodology:'Method',status:'Loaded',groups:[{name:'Sector',returns:{day:1},industries:[]}],benchmark:{name:'S&P 500',returns:{day:2}},coverage:{},issues:[]};
 vm.runInNewContext(sectorScript,{document:{getElementById:id=>nodes[id],createElement:()=>new Node()},fetch:async(url,options)=>{assert.equal(url,'/api/sectors');assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.action,calls?'step':'start');calls++;return{ok:true,json:async()=>calls<3?{state:'loading',id:'job',loaded:(calls-1)*12,total:24}:ready};}});
 await nodes['load-sectors'].onclick();assert.equal(calls,3);assert.equal(nodes['sector-status'].textContent,'Loaded');assert.equal(nodes['load-sectors'].disabled,false);assert.equal(nodes['sector-results'].children.length,1);
});
test('S&P 500 is first in the left table and column split minimizes row imbalance without splitting sectors',async()=>{
 class Node{constructor(){this.children=[];this.textContent='';}append(...n){this.children.push(...n);}replaceChildren(){this.children=[];}}
 const nodes=Object.fromEntries(['load-sectors','sector-status','sector-results','source-label','sector-method'].map(k=>[k,new Node()]));
 const groups=[20,18,14,4,8,4,5,3,12,4,5].map((n,i)=>({name:'Sector '+i,industries:Array.from({length:n},(_,j)=>({name:'Industry '+i+' '+j,returns:{day:j}}))}));
 const data={state:'ready',groups,benchmark:{name:'S&P 500',returns:{day:1}},sourceLabel:'TEST',methodology:'TEST',status:'TEST'};
 vm.runInNewContext(sectorScript,{document:{getElementById:id=>nodes[id],createElement:()=>new Node()},fetch:async()=>({ok:true,json:async()=>data})});await nodes['load-sectors'].onclick();
 const all=n=>n.children.flatMap(c=>[c,...all(c)]),cards=nodes['sector-results'].children;
 const rows=cards.map(c=>all(c).filter(n=>['sector-total','market-total','industry'].includes(n.className)));
 assert.equal(rows[0][0].className,'market-total');assert.equal(rows[0][0].children[0].textContent,'S&P 500');assert.equal(rows[1].filter(n=>n.className==='market-total').length,0);
 const difference=Math.abs(rows[0].length-rows[1].length),total=groups.reduce((n,g)=>n+1+g.industries.length,0);let left=1;
 for(let i=1;i<groups.length;i++){left+=1+groups[i-1].industries.length;assert.ok(difference<=Math.abs(left-(total-left+1)));}
});