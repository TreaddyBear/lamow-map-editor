import assert from "node:assert/strict";
import {compileVegetationPlant} from "../../packages/landscape-renderer/dist/vegetation/recipe.js";
import {defaultVegetationAsset} from "../../packages/landscape-renderer/dist/vegetation/assets.js";

const V=(ideal,deviation=0)=>({ideal,deviation});
const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const mesh=(id,vertices=points)=>({id,displayName:"Output probe",vertices:vertices.map(([x,y,z],i)=>({id:String(i),x,y,z,color:"#ffffff"})),faces:(vertices.length===3?[[0,1,2]]:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]]).map(vertices=>({vertices,smoothingGroup:"1"})),sharpEdges:[]});
const form=(extra={})=>({id:"form",label:"Form",type:"form",primitive:"leafBlade",materialId:"petal",width:V(1),length:V(1),...extra});
const marker=()=>form({width:V(0),length:V(0)});
const grow=(extra={})=>({id:"grow",label:"Grow",type:"continue",pathMode:"arc",distance:V(1),arcDegrees:V(0),arcAzimuthDegrees:V(0),formAlongPath:"none",...extra});
const fork=(extra={})=>({id:"fork",label:"Fork",type:"fork",layout:"radial",count:V(1),spreadDegrees:V(0),radius:V(0),continuation:[form()],...extra});
const branch=(extra={})=>({id:"branch",label:"Branch",type:"branch",layout:"tip",count:V(1),deviationDegrees:V(0),aroundAxisDegrees:V(0),offshoot:[form()],...extra});
const angle=(y,x)=>Math.atan2(y,x)*180/Math.PI;

/** Recover each quantity from emitted geometry/counts, never the sample trace. */
export function runDeviationOutputBench(){
  const specs=[
    ["Form Width",0.18,[form({width:V(0,0.18)})],p=>p[0].positions[3]],
    ["Form Length",0.35,[form({length:V(0,0.35)})],p=>p[0].positions[7]],
    ["Form Cup",1,[form({cup:V(0,1)})],p=>p[0].positions[4]],
    ["Form Curl",1,[form({curl:V(0,1)})],p=>p[0].positions[10]/0.42],
    ["Grow Distance",0.8,[grow({distance:V(0,0.8)}),marker()],p=>p[0].positions[1]],
    ["Grow Arc degrees",180,[grow({distance:V(0),arcDegrees:V(0,180)}),form()],p=>angle(p[0].positions[6],p[0].positions[7])],
    ["Grow Arc direction",180,[grow({arcDegrees:V(90),arcAzimuthDegrees:V(0,180)}),marker()],p=>angle(p[0].positions[2],p[0].positions[0])],
    ["Grow Start radius",0.08,[grow({formAlongPath:"stemSkin",radiusStart:V(0,0.08),radiusEnd:V(0.02)})],p=>p[0].positions[0]],
    ["Grow End radius",0.08,[grow({formAlongPath:"stemSkin",radiusStart:V(0.02),radiusEnd:V(0,0.08)})],p=>p[0].positions[3]],
    ["Fork Radius",0.3,[fork({radius:V(0,0.3),continuation:[marker()]})],p=>p[0].positions[2]],
    ["Fork Spread degrees",360,[fork({count:V(2),spreadDegrees:V(0,360)})],p=>2*angle(p[1].positions[9],p[1].positions[11])],
    ["Branch Around axis",180,[branch({aroundAxisDegrees:V(0,180)})],p=>angle(p[0].positions[9],p[0].positions[11])],
    ["Branch Deviation angle",180,[branch({deviationDegrees:V(0,180)})],p=>angle(-p[0].positions[8],p[0].positions[7])],
    ["Fork Count",16,[fork({count:V(32,16),continuation:[marker()]})],p=>p.length-32,true],
    ["Branch Offshoot count",16,[branch({count:V(32,16),offshoot:[marker()]})],p=>p.length-32,true],
  ];
  return specs.map(([label,extent,root,measure,integer])=>{
    const g={name:`Output deviance · ${label}`,purpose:"Recover the requested quantity from generated vertices or emitted copy count across 2,048 seeds; check bounds, span, mean and distribution. No compiler sample trace is used.",cases:[],failures:[]};
    const row={label:`${integer?"32 ±16 copies":`0 ±${extent}`}; 2048 plants`,error:0,expected:[],actual:[]};g.cases.push(row);
    try{
      const a={...structuredClone(defaultVegetationAsset),primitives:[mesh("leafBlade"),mesh("stemSkin",[[0.5,0,0],[0.5,1,0],[0,1,0.5]])]};
      a.species.constructionRecipe={languageVersion:1,root};
      const values=Array.from({length:2048},(_,seed)=>measure(compileVegetationPlant(a,seed)));
      const min=Math.min(...values),max=Math.max(...values),mean=values.reduce((s,v)=>s+v,0)/values.length;
      assert.ok(values.every(v=>Number.isFinite(v)&&v>=-extent-2e-6&&v<=extent+2e-6),`Output outside ±${extent}: ${min}…${max}`);
      const bins=Array(integer?33:16).fill(0);
      for(const v of values)bins[integer?Math.round(v+extent):Math.min(15,Math.floor((v+extent)/(extent*2)*16))]++;
      const expected=bins.map((_,i)=>integer?2048/32*(i===0||i===32?0.5:1):2048/16);
      const chi=bins.reduce((sum,n,i)=>sum+(n-expected[i])**2/expected[i],0);
      row.distribution={min:integer?16:-extent,max:integer?48:extent,values:integer?values.map(v=>v+32):values,bins};
      row.result=`Measured ${integer?min+32:min}…${integer?max+32:max}; span ${((max-min)/(2*extent)*100).toFixed(2)}%; mean ${integer?mean+32:mean}; χ² ${chi.toFixed(2)}. ${integer?"Rounded endpoints have half-width intervals.":"Both signs required."}`;
      assert.ok(max-min>extent*2*0.99,"Deviance does not explore the requested range");
      assert.ok(bins.every(n=>n>0),"Some permitted outputs were never reached");
      assert.ok(Math.abs(mean)<extent*0.06,`Biased centre: ${mean}`);
      assert.ok(chi<(integer?90:60),`Biased distribution: χ² ${chi}, bins ${bins}`);
    }catch(error){row.failure=error.message;g.failures.push(`${label}: ${error.message}`);}
    return g;
  });
}
