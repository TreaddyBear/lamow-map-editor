import assert from "node:assert/strict";
import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { defaultVegetationAsset } from "../../packages/landscape-renderer/dist/vegetation/assets.js";
import { compileVegetationPlant } from "../../packages/landscape-renderer/dist/vegetation/recipe.js";
import { createVegetationSpeciesLayer } from "../../packages/landscape-renderer/dist/vegetation/speciesLayer.js";

const V=(ideal,deviation=0)=>({ideal,deviation});
const wrap=a=>((a%360)+360)%360;
const delta=a=>wrap(a+180)-180;
const heading=(x,z)=>wrap(Math.atan2(z,x)*180/Math.PI);
const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const probe={id:"leafBlade",displayName:"Compass probe",vertices:points.map(([x,y,z],i)=>({id:String(i),x,y,z,color:"#ffffff"})),faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]].map(vertices=>({vertices,smoothingGroup:"1"})),sharpEdges:[]};
const marker={id:"marker",label:"Compass",type:"form",primitive:"leafBlade",materialId:"petal",width:V(0.1),length:V(0.1)};
const growth=direction=>({id:"grow",label:"Grow",type:"continue",pathMode:"arc",distance:V(0.4),arcDegrees:V(60),arcAzimuthDegrees:direction,formAlongPath:"none"});
const asset=root=>({...structuredClone(defaultVegetationAsset),primitives:[probe],species:{...structuredClone(defaultVegetationAsset.species),constructionRecipe:{languageVersion:1,root}}});
function directionAsset(kind,variation) {
  if(kind==="Grow bend direction") return asset([growth(variation),marker]);
  if(kind==="Branch around axis") return asset([{id:"branch",label:"Branch",type:"branch",count:V(1),layout:"tip",deviationDegrees:V(0),aroundAxisDegrees:variation,offshoot:[marker]}]);
  return asset([{id:"steer",label:"Rotate",type:"steer",yawDegrees:variation},marker]);
}
function measuredDirection(definition,kind,seed) {
  const p=compileVegetationPlant(definition,seed)[0].positions;
  // Grow is measured from the root to the actual bent endpoint. Branch/Steer
  // are measured with the asymmetric forward marker, independently of trace values.
  return kind==="Grow bend direction"?heading(p[0],p[2]):wrap(Math.atan2(p[9]-p[0],p[11]-p[2])*180/Math.PI);
}
function statistics(angles) {
  const bins=Array(24).fill(0);angles.forEach(a=>bins[Math.min(23,Math.floor(wrap(a)/15))]++);
  const ordered=angles.map(wrap).sort((a,b)=>a-b),expected=angles.length/bins.length;
  return {angles,bins,chiSquared:bins.reduce((sum,n)=>sum+(n-expected)**2/expected,0),maxGap:Math.max(...ordered.map((a,i)=>i? a-ordered[i-1]:a+360-ordered.at(-1))),meanVector:Math.hypot(angles.reduce((n,a)=>n+Math.cos(a*Math.PI/180),0),angles.reduce((n,a)=>n+Math.sin(a*Math.PI/180),0))/angles.length};
}
export function runAngularBench() {
  const groups=[];
  const group=(name,purpose,cases)=>{
    const g={name,purpose,cases:[],failures:[]};groups.push(g);
    for(const [label,fn] of cases){const row={label,error:0,actual:[],expected:[]};g.cases.push(row);try{fn(row);}catch(error){row.failure=error.message;g.failures.push(`${label}: ${error.message}`);}}
  };
  const kinds=["Grow bend direction","Branch around axis","Imported yaw"];
  for(const kind of kinds) {
    group(`Circular sweep · ${kind}`,"Follow measured headings in 5° steps, unwrap the travel, and verify one full revolution—not just equal endpoints at 0° and 360°.",[1,-1].map(sign=>[`${sign*360}° complete sweep`,row=>{
      const angles=Array.from({length:73},(_,i)=>measuredDirection(directionAsset(kind,V(sign*i*5)),kind,0));
      const increments=angles.slice(1).map((a,i)=>delta(a-angles[i]));
      assert.ok(increments.every(d=>Math.abs(d-sign*5)<0.00002),"direction reverses, stalls or jumps during a turn");
      row.actual=[increments.reduce((a,b)=>a+b,0)];row.expected=[sign*360];row.error=Math.abs(row.actual[0]-row.expected[0]);
      assert.ok(row.error<0.00002);assert.ok(Math.abs(delta(angles.at(-1)-angles[0]))<0.00002);
      row.angular=statistics(angles.slice(0,-1));row.result=`Measured travel ${row.actual[0].toFixed(4)}°; final heading equals start`;
    }]));
    group(`Circular variation · ${kind}`,"A direction's ±180° already covers every heading. Imported larger radii must represent an unbiased full circle, rather than weighting wrapped headings twice.",[0,350].flatMap(ideal=>[180,181,270,360].map(deviation=>[`${ideal}° ± ${deviation}°; 4096 seeds`,row=>{
      const definition=directionAsset(kind,V(ideal,deviation));
      const angles=Array.from({length:4096},(_,seed)=>measuredDirection(definition,kind,seed));
      row.angular=statistics(angles);
      row.result=`24 sectors: ${Math.min(...row.angular.bins)}–${Math.max(...row.angular.bins)} each; largest gap ${row.angular.maxGap.toFixed(2)}°; χ² ${row.angular.chiSquared.toFixed(2)}`;
      assert.ok(row.angular.bins.every(n=>n>0),"unreachable compass sector");
      assert.ok(row.angular.chiSquared<60,`angular bias: χ² ${row.angular.chiSquared.toFixed(2)} (24 sectors; required <60)`);
      assert.ok(row.angular.meanVector<0.06,"population favours a heading");
      assert.ok(row.angular.maxGap<2,"unexplained gap in attainable headings");
    }])));
    group(`Circular boundaries · ${kind}`,"Small random ranges crossing north stay in the intended sector, with balanced clockwise/counterclockwise deviations. Whole turns added to Ideal do not change any seeded heading.",[[-10,20],[350,20],[0,1],[180,90]].map(([ideal,deviation])=>[`${ideal}° ± ${deviation}°; 1024 seeds`,row=>{
      const definition=directionAsset(kind,V(ideal,deviation)),shifted=directionAsset(kind,V(ideal+360,deviation));
      const angles=Array.from({length:1024},(_,seed)=>measuredDirection(definition,kind,seed));
      const deviations=angles.map(a=>delta(a-ideal));
      assert.ok(deviations.every(d=>Math.abs(d)<=deviation+0.00002),"wrap leaked outside requested sector");
      assert.ok(Math.abs(deviations.reduce((a,b)=>a+b,0)/deviations.length)<deviation*0.1,"one-sided deviation");
      angles.forEach((a,seed)=>assert.ok(Math.abs(delta(a-measuredDirection(shifted,kind,seed)))<0.00002,"+360° changed seeded heading"));
      row.angular=statistics(angles);row.result=`Observed offsets ${Math.min(...deviations).toFixed(3)}° to ${Math.max(...deviations).toFixed(3)}°`;
    }]));
  }
  group("Population · actual flower headings","Measure the bent stem endpoint AFTER each real instance matrix. This tests whether 16 reused shapes can still face any direction in the rendered patch.",[360,540,720].map(span=>[`${span}° imported yaw span; 4096 flowers, 16 shapes`,row=>{
    const definition=asset([growth(V(0,180)),marker]);definition.species.instanceRanges.yaw={min:0,max:span*Math.PI/180};
    const engine=new NullEngine(),scene=new Scene(engine),layer=createVegetationSpeciesLayer({scene,asset:definition,groundHeightAt:()=>0});
    try{
      layer.setPlants(Array.from({length:4096},(_,seed)=>({x:seed,z:0,seed,scale:1})));
      assert.equal(layer.meshes.length,16,"keep geometry reuse bounded");
      const angles=[];
      for(const mesh of layer.meshes){const endpoint=Vector3.FromArray(mesh.getVerticesData("position"));for(const matrix of mesh.thinInstanceGetWorldMatrices()){const p=Vector3.TransformCoordinates(endpoint,matrix),origin=matrix.getTranslation();angles.push(heading(p.x-origin.x,p.z-origin.z));}}
      row.angular=statistics(angles);row.result=`${angles.length} measured flowers; ${new Set(angles.map(a=>a.toFixed(4))).size} distinct headings; largest gap ${row.angular.maxGap.toFixed(2)}°`;
      assert.equal(angles.length,4096);assert.ok(row.angular.chiSquared<60,`rendered heading bias: χ² ${row.angular.chiSquared.toFixed(2)}`);assert.ok(row.angular.maxGap<2);assert.ok(new Set(angles.map(a=>a.toFixed(4))).size>4000);
    }finally{layer.dispose();scene.dispose();engine.dispose();}
  }]));
  return groups;
}
