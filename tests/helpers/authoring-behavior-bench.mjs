import assert from "node:assert/strict";
import { compileVegetationPlant } from "../../packages/landscape-renderer/dist/vegetation/recipe.js";
import { defaultVegetationAsset, parseVegetationAsset } from "../../packages/landscape-renderer/dist/vegetation/assets.js";

const V=(ideal,deviation=0)=>({ideal,deviation});
const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const source={id:"leafBlade",displayName:"Behavior probe",vertices:points.map(([x,y,z],i)=>({id:String(i),x,y,z,color:"#ffffff"})),faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]].map(vertices=>({vertices,smoothingGroup:"1"})),sharpEdges:[]};
const form=(id="form",extra={})=>({id,label:id,type:"form",primitive:"leafBlade",materialId:"petal",length:V(0.1,0.03),width:V(0.04,0.01),...extra});
const marker=(id="marker")=>form(id,{length:V(0),width:V(0)});
const grow=(extra={})=>({id:"grow",label:"Grow",type:"continue",pathMode:"arc",distance:V(0.4),arcDegrees:V(0),...extra});
const branch=(extra={})=>({id:"branch",label:"Branch",type:"branch",count:V(1),layout:"tip",deviationDegrees:V(0),aroundAxisDegrees:V(0),offshoot:[marker()],...extra});
const fork=(extra={})=>({id:"fork",label:"Fork",type:"fork",layout:"radial",count:V(1),spreadDegrees:V(0),radius:V(0.2),continuation:[marker()],...extra});
const asset=root=>({...structuredClone(defaultVegetationAsset),primitives:[source],species:{...structuredClone(defaultVegetationAsset.species),constructionRecipe:{languageVersion:1,root}}});
const compile=(root,seed=0)=>compileVegetationPlant(asset(root),seed);
const positions=(parts,id)=>parts.filter(p=>p.phraseId===id).map(p=>p.positions);
const near=(actual,expected)=>{assert.equal(actual.length,expected.length);assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<2e-6),`actual ${actual}, expected ${expected}`);};

export function runAuthoringBehaviorBench(){
  const groups=[];
  const group=(name,purpose,cases)=>{const g={name,purpose,cases:[],failures:[]};groups.push(g);for(const [label,fn] of cases){const row={label,error:0,expected:[],actual:[]};g.cases.push(row);try{fn(row);}catch(error){row.failure=error.message;g.failures.push(`${label}: ${error.message}`);}}};
  group("Authoring stability · neutral edits","An edit with no geometric meaning must not reroll other properties or unrelated components.",[
    ["Explicit zero Cup/Curl equals omitted fields",()=>{for(let seed=0;seed<32;seed++)assert.deepEqual(compile([form(),form("later")],seed),compile([form("form",{cup:V(0),curl:V(0)}),form("later")],seed));}],
    ["An empty Fork does not reroll a later Form",()=>{for(let seed=0;seed<32;seed++)assert.deepEqual(positions(compile([form("target")],seed),"target"),positions(compile([fork({continuation:[]}),form("target")],seed),"target"));}],
    ["Inserting/reordering independent Forms preserves their seeded shapes",()=>{for(let seed=0;seed<32;seed++){const a=compile([form("target")],seed);for(const root of [[form("other"),form("target")],[form("target"),form("other")]])assert.deepEqual(positions(a,"target"),positions(compile(root,seed),"target"));}}],
    ["Identity Steer does not reroll downstream components",()=>{for(let seed=0;seed<32;seed++)assert.deepEqual(compile([form()],seed),compile([{id:"identity",label:"Identity",type:"steer",yawDegrees:V(0),pitchDegrees:V(0),rollDegrees:V(0),scale:V(1)},form()],seed));}],
    ["Labels, source names and unused meshes are cosmetic",()=>{const a=asset([form()]),b=structuredClone(a);b.species.constructionRecipe.root[0].label="Renamed";b.primitives[0].displayName="Renamed source";b.primitives.push({...source,id:"unused"});assert.deepEqual(compileVegetationPlant(a,4),compileVegetationPlant(b,4));}],
    ["Adding a zero-weight choice does not reroll the selected child",()=>{const choose={id:"choose",label:"Choose",type:"choose",options:[{weight:1,phrase:[form()]}]};const changed={...choose,options:[{weight:0,phrase:[form("unused")]},...choose.options]};for(let seed=0;seed<32;seed++)assert.deepEqual(compile([choose],seed),compile([changed],seed));}],
    ["Editing the first Fork child cannot reroll the other copies",()=>{const base=fork({count:V(3),continuation:[form()]});const changed={...base,continuation:[form("form",{cup:V(0)})]};for(let seed=0;seed<32;seed++)assert.deepEqual(compile([base],seed),compile([changed],seed));}],
  ]);
  group("Composition · attachment scope","Fork and Branch children begin at their own attachment; they cannot accidentally reuse an ancestor's path. A new Grow establishes a new local attachment path.",[
    ["A Branch inside a Fork keeps the Fork radius",()=>{const p=compile([grow(),fork({continuation:[branch()]})]);near(p[0].positions.slice(0,3),[0,0.4,0.2]);}],
    ["Nested Branch stays at its parent's attachment",()=>{const p=compile([grow(),branch({layout:"radial",offshoot:[branch({id:"nested"})]})]);near(p[0].positions.slice(0,3),[0,0.2,0]);}],
    ["A child's own Grow takes precedence over the parent path",()=>{const p=compile([grow(),fork({continuation:[grow({id:"child-grow",distance:V(0.1)}),branch()]})]);near(p[0].positions.slice(0,3),[0,0.5,0.2]);}],
    ["Independent forks do not move the parent continuation",()=>{const p=compile([grow(),fork({continuation:[grow({id:"child",distance:V(2)}),marker("child-tip")]}),marker("parent-tip")]);near(p.at(-1).positions.slice(0,3),[0,0.4,0]);}],
    ["Steer after Grow affects subsequent Branch orientation",()=>{const p=compile([grow(),{id:"turn",label:"Turn",type:"steer",yawDegrees:V(90)},branch({offshoot:[form("form",{length:V(0.1),width:V(0.1)})]})])[0].positions;near(p.slice(9,12),[0.1,0.4,0]);}],
  ]);
  group("Layout · predictable changes","Small changes must produce small changes in continuous controls; full-turn spacing remains distinct and signed.",[
    ["Radial spacing does not jump at the full-turn seam",()=>{const a=compile([fork({count:V(4),spreadDegrees:V(359.9)})]),b=compile([fork({count:V(4),spreadDegrees:V(360)})]);for(let i=0;i<4;i++)assert.ok(Math.hypot(...a[i].positions.slice(0,3).map((v,j)=>v-b[i].positions[j]))<0.001,"0.1° spread change caused a large relocation");}],
    ["Adding a fifth radial copy never duplicates the endpoint",()=>{const p=compile([fork({count:V(5),spreadDegrees:V(360)})]);for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)assert.ok(Math.hypot(...p[i].positions.slice(0,3).map((v,k)=>v-p[j].positions[k]))>0.1);}],
  ]);
  const invalids=[
    ["unknown Fork layout",a=>{a.species.constructionRecipe.root=[fork({layout:"typo"})];}],
    ["unknown Branch layout",a=>{a.species.constructionRecipe.root=[branch({layout:"typo"})];}],
    ["unknown path skin",a=>{a.species.constructionRecipe.root=[grow({formAlongPath:"typo"})];}],
    ["unknown Form primitive",a=>{a.species.constructionRecipe.root=[form("form",{primitive:"typo"})];}],
    ["empty phrase ID",a=>{a.species.constructionRecipe.root[0].id="";}],
    ["missing phrase label",a=>{delete a.species.constructionRecipe.root[0].label;}],
    ["negative slat density",a=>{a.editor.grassLod.density=-1;}],
    ["nonnumeric slat density",a=>{a.editor.grassLod.density="bad";}],
    ["invalid slat color",a=>{a.editor.grassLod.topColorA="bad";}],
    ["invalid far color",a=>{a.species.lod.farColor="bad";}],
    ["nonnumeric far strength",a=>{a.species.lod.farStrength="bad";}],
    ["invalid preview width",a=>{a.editor.preview={groundPatchMeters:-1};}],
    ["invalid preview seed",a=>{a.editor.preview={populationSeed:1.5};}],
  ];
  group("Import · no silent fallbacks","Malformed controls must fail before becoming an editable saved asset; unknown modes cannot silently render as another mode.",invalids.map(([label,mutate])=>[label,()=>{const a=asset([form()]);mutate(a);assert.throws(()=>parseVegetationAsset(JSON.stringify(a)));}]));
  group("Composition · generated recipes","128 combinations of signed curved growth, local steering, material changes, forks, branches and weighted choices must round-trip without mutation and obey uniform scaling.",Array.from({length:128},(_,i)=>[
    `Combined recipe ${i+1}`,()=>{
      const layouts=["radial","spiral","mirrored","cluster","sameAxis"];
      const leaf=form("leaf",{cup:V((i%5-2)/3,0.2),curl:V((i%7-3)/4,0.3)});
      const root=[grow({distance:V((i%2?-1:1)*0.3,0.2),arcDegrees:V(i*17%360-180,90),arcAzimuthDegrees:V(i*31%360,180)}),
        {id:"steer",label:"Steer",type:"steer",yawDegrees:V(i*19%180,30),pitchDegrees:V(-30,20),rollDegrees:V(10,20),scale:V(i%3?-0.8:0.8,0.1)},
        {id:"color",label:"Color",type:"color",materialId:"petal"},
        fork({count:V(1+i%3),layout:layouts[i%5],spreadDegrees:V(i*13%360-180,60),radius:V(-0.1,0.2),continuation:[
          grow({id:"child-grow",distance:V(0.1,0.15),arcDegrees:V(-50,80)}),
          branch({count:V(1+i%3),layout:["alongPath","radial","alternating","tip"][i%4],deviationDegrees:V(0,180),aroundAxisDegrees:V(0,180),offshoot:[
            {id:"choice",label:"Choose",type:"choose",options:[{weight:1,phrase:[leaf]},{weight:2,phrase:[form("other")]}]},
          ]}),
        ]}),form("parent")];
      const a=asset(root),before=JSON.stringify(a),parts=compileVegetationPlant(a,i*65537);
      assert.equal(JSON.stringify(a),before,"compiler mutated input");
      assert.deepEqual(parts,compileVegetationPlant(parseVegetationAsset(before),i*65537),"export/reimport changed geometry");
      const scaled=compile([{id:"global-scale",label:"Scale",type:"steer",scale:V(2)},...root],i*65537);
      assert.equal(scaled.length,parts.length);
      parts.forEach((p,j)=>{assert.ok(p.positions.every(Number.isFinite));assert.ok(p.indices.every(k=>Number.isInteger(k)&&k>=0&&k<p.positions.length/3));near(scaled[j].positions,p.positions.map(v=>v*2));assert.deepEqual(scaled[j].colors,p.colors);});
    },
  ]));
  group("Choices · weighted output","Measure which actual child geometry is emitted, including empty choices.",[
    ["Weights 1:3 produce the intended frequencies across 4096 seeds",()=>{
      const counts={a:0,b:0};const root=[{id:"weighted",label:"Choose",type:"choose",options:[{weight:1,phrase:[form("a")]},{weight:3,phrase:[form("b")]}]}];
      for(let seed=0;seed<4096;seed++)counts[compile(root,seed)[0].phraseId]++;
      assert.ok(Math.abs(counts.a/4096-0.25)<0.025,JSON.stringify(counts));
    }],
    ["All-zero choices emit nothing and leave following geometry intact",()=>{assert.deepEqual(compile([{id:"zero",label:"Choose",type:"choose",options:[{weight:0,phrase:[grow()]}]},form()]),compile([form()]));}],
  ]);
  group("Composition · finite render output","Individually legal scale inputs must not combine into GPU infinities.",[
    ["Repeated large scales fail cleanly before producing invalid vertices",()=>{
      const root=[...Array.from({length:12},(_,i)=>({id:`scale-${i}`,label:"Scale",type:"steer",scale:V(10000)})),form()];
      const valid=parseVegetationAsset(JSON.stringify(asset(root)));
      assert.throws(()=>compileVegetationPlant(valid,0),/renderable coordinates/);
    }],
  ]);
  return groups;
}
