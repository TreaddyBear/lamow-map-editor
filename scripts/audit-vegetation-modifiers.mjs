import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { runModifierBench } from "../tests/helpers/modifier-bench.mjs";

const arg = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
const output = resolve(arg("--out") ?? ".tmp/modifier-audit/index.html");
if (!output.endsWith(".html")) throw new Error("Report output must end in .html.");
const result = runModifierBench();
result.commit = execFileSync("git",["rev-parse","--short","HEAD"],{encoding:"utf8"}).trim();
result.workingChanges = Boolean(execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim());
result.generatedAt = new Date().toISOString();
const baselinePath = arg("--baseline");
if (baselinePath) {
  const baseline=JSON.parse(readFileSync(baselinePath,"utf8"));
  result.baseline={cases:baseline.cases,failures:baseline.failures,groups:baseline.groups.filter(g=>g.failures.length).map(g=>({name:g.name,failures:g.failures.length,example:g.failures[0],distribution:g.cases.find(c=>c.distribution)?.distribution}))};
}
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output.replace(/\.html$/,".json"),JSON.stringify(result,null,2));
const data=JSON.stringify(result).replace(/</g,"\\u003c");
writeFileSync(output,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LaMow modifier bench</title>
<style>
:root{color-scheme:dark;font:15px/1.5 system-ui;color:#e6ede8;background:#111b17}*{box-sizing:border-box}body{margin:0 auto;max-width:1400px;padding:32px}h1{font-weight:500;font-size:32px;margin:0}h2{font-size:20px;font-weight:500}p{max-width:90ch;color:#b7c6bd}.muted{color:#92a89a;font-size:13px}header{border-bottom:1px solid #33463a;padding-bottom:20px}.metrics{display:flex;gap:32px;margin:20px 0}.metrics strong{font-size:28px;display:block;font-weight:500}.pass{color:#a6e4b8}.fail{color:#ffa391}main{display:grid;grid-template-columns:330px 1fr;gap:28px;margin-top:24px}nav{max-height:80vh;overflow:auto}input,button{font:inherit;color:inherit;background:#1a2821;border:1px solid #3e5446;border-radius:4px;padding:8px}input{width:100%;margin-bottom:10px}nav button{display:block;text-align:left;width:100%;border:1px solid transparent;margin:3px 0;font-size:13px}nav button[aria-pressed=true]{border-color:#92cfab;background:#24392c}nav small{float:right}section{min-width:0}svg{width:100%;background:#17251d;border:1px solid #33463a;border-radius:4px}table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}th,td{text-align:left;border-bottom:1px solid #33463a;padding:8px;vertical-align:top}th{color:#b7c6bd}.scroll{overflow:auto;max-height:450px}code{overflow-wrap:anywhere;color:#c6dbc9}details{margin-top:16px}summary{cursor:pointer}a{color:#9bd7b0}.legend{display:flex;gap:22px;color:#b7c6bd;font-size:13px}.legend b{color:#a6e4b8}.legend i{color:#ffcd86}@media(max-width:850px){body{padding:16px}main{grid-template-columns:1fr}nav{max-height:240px}}
</style>
<header><div class="muted">LaMow / measurable geometry</div><h1>Modifier bench</h1><p>Known inputs. Measured vertices. Independent expectations. Each sweep checks negative, zero and positive values, plus maximum deviation at both ends of the editing range.</p><div class="metrics"><div><strong id="count"></strong>cases</div><div><strong id="failures"></strong>failures</div><div><strong id="groups"></strong>control groups</div></div><div id="stamp" class="muted"></div></header>
<details id="baseline"><summary>Before these corrections</summary><div id="before"></div></details>
<main><nav aria-label="Control groups"><input id="search" aria-label="Find control" placeholder="Find a control…"><div id="list"></div></nav><section><h2 id="title"></h2><p id="purpose"></p><div id="summary"></div><div id="plot"></div><div class="legend"><span><b>●</b> measured</span><span><i>○</i> expected</span></div><p id="plotnote" class="muted"></p><div class="scroll"><table><thead><tr><th>Input / seed</th><th>Largest error</th><th>Measurement / expected (first 3 coordinates)</th></tr></thead><tbody id="rows"></tbody></table></div></section></main>
<details><summary>Source mesh dimensions</summary><p>Form dimensions multiply these source coordinates. They are not guaranteed final widths in metres.</p><div id="extents"></div></details>
<p class="muted">Scope: recipe geometry and population calibration. This is not a GPU, lighting, LOD-transition or exhaustive nested-recipe proof. Browser tests separately check input wiring and responsiveness. Statistical range checks use fixed samples; every possible seed is not enumerated.</p>
<script type="application/json" id="data">${data}</script><script>
const data=JSON.parse(document.querySelector('#data').textContent),$=id=>document.getElementById(id);
const text=(id,v)=>$(id).textContent=v;
text('count',data.cases.toLocaleString());text('failures',data.failures);$('failures').className=data.failures?'fail':'pass';text('groups',data.groups.length);text('stamp','Generated '+data.generatedAt+' · commit '+data.commit+(data.workingChanges?' + working changes':'')+' · geometry tolerance '+data.tolerance+' m');
function element(tag,value,parent){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;}
if(data.baseline){for(const g of data.baseline.groups){element('h2',g.name,$('before'));element('p',g.failures+' failures. '+g.example,$('before'));if(g.distribution){const v=g.distribution.values;element('p','Observed endpoints: '+Math.min(...v).toFixed(6)+' to '+Math.max(...v).toFixed(6),$('before'));}}}else $('baseline').hidden=true;
const ns='http://www.w3.org/2000/svg';function shape(svg,tag,attrs,label){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(label!==undefined)el.textContent=label;svg.append(el);return el;}
function plot(cases){$('plot').replaceChildren();const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 820 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','Expected and measured values across the sweep');$('plot').append(svg);
 const dist=cases.find(c=>c.distribution)?.distribution;
 const pairs=dist?dist.values.slice(0,4096).map((v,i)=>[i,v,v]):cases.filter(c=>c.actual.length).map((c,i)=>[i,c.actual[0],c.expected[0]]);
 if(!pairs.length){shape(svg,'text',{x:28,y:105,fill:'#b7c6bd'},'Assertions have no coordinate plot. See results below.');return;}
 let lo=dist?dist.min:Math.min(...pairs.flatMap(p=>p.slice(1))),hi=dist?dist.max:Math.max(...pairs.flatMap(p=>p.slice(1)));if(lo===hi){lo-=1;hi+=1;}const x=i=>60+i/Math.max(1,pairs.length-1)*730,y=v=>180-(v-lo)/(hi-lo)*150;
 for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;shape(svg,'line',{x1:60,y1:y(v),x2:790,y2:y(v),stroke:'#33463a'});shape(svg,'text',{x:4,y:y(v)+4,fill:'#b7c6bd','font-size':11},v.toPrecision(3));}
 for(const [i,a,e] of pairs){if(!dist)shape(svg,'circle',{cx:x(i),cy:y(e),r:4,fill:'none',stroke:'#ffcd86'});shape(svg,'circle',{cx:x(i),cy:y(a),r:dist&&pairs.length>100?1.2:2,fill:'#a6e4b8'});}
 shape(svg,'text',{x:60,y:208,fill:'#b7c6bd','font-size':12},dist?'Consecutive seed →':'Sweep case →');text('plotnote',dist?'Measured distance in metres. The vertical axis is the requested random interval.':'First coordinate of the last measurement in each case; every checked coordinate contributes to the largest error. Overlapping markers mean agreement.');
}
let selected=0;function show(index){selected=index;const g=data.groups[index];text('title',g.name);text('purpose',g.purpose);text('summary',g.cases.length+' cases · '+g.failures.length+' failures');$('summary').className=g.failures.length?'fail':'pass';$('rows').replaceChildren();plot(g.cases);document.querySelector('.legend').hidden=g.cases.some(c=>c.distribution);for(const c of g.cases){const tr=element('tr','',$('rows'));element('td',c.label,tr);element('td',c.failure?'FAIL: '+c.failure:c.actual.length?c.error.toExponential(2):'—',tr).className=c.failure?'fail':'';const fmt=v=>v.slice(0,3).map(x=>Number(x.toPrecision(7))).join(', ');element('td',c.result??(c.actual.length?fmt(c.actual)+' / '+fmt(c.expected):'Assertion passed'),tr);}for(const b of $('list').children)b.setAttribute('aria-pressed',Number(b.dataset.index)===index);}
function list(){ $('list').replaceChildren();data.groups.forEach((g,i)=>{if(!g.name.toLowerCase().includes($('search').value.toLowerCase()))return;const b=element('button',g.name,$('list'));b.dataset.index=i;b.setAttribute('aria-pressed',i===selected);b.onclick=()=>show(i);element('small',g.failures.length?'FAIL':'✓',b).className=g.failures.length?'fail':'pass';});}
$('search').oninput=list;list();show(data.groups.findIndex(g=>g.name==='Randomness · actual 16-variant pool'));for(const p of data.primitiveExtents)element('p',p.id+': '+p.axes.map(a=>a.axis+' span '+Number(a.span.toPrecision(5))).join(' · '),$('extents'));
</script></html>`);
console.log(`Modifier bench: ${result.cases} cases; ${result.failures} failures.\n${output}`);
for (const g of result.groups.filter(g=>g.failures.length)) console.error(`${g.name}: ${g.failures.length} failures\n${g.failures[0]}`);
process.exitCode=result.failures?1:0;
