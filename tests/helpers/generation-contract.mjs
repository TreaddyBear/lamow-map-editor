import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defaultVegetationAsset, parseVegetationAsset } from "../../packages/landscape-renderer/dist/vegetation/assets.js";
import { defaultObjPrimitiveLibrary } from "../../packages/landscape-renderer/dist/vegetation/objPrimitives.js";
import { compileVegetationPlant } from "../../packages/landscape-renderer/dist/vegetation/recipe.js";

export function generationContractCases(){
  const flower=structuredClone({...defaultVegetationAsset,generationVersion:1,primitives:defaultObjPrimitiveLibrary()});
  const clover=parseVegetationAsset(readFileSync(new URL("../fixtures/authored-clover.lamow-vegetation.json",import.meta.url),"utf8"));
  const nested=structuredClone(flower);
  nested.species.constructionRecipe.root=[
    {id:"outer",label:"Outer",type:"fork",layout:"radial",count:{ideal:3,deviation:0},radius:{ideal:0.1,deviation:0.03},spreadDegrees:{ideal:240,deviation:80},continuation:[
      ...nested.species.constructionRecipe.root,
      {id:"nested-branch",label:"Nested branch",type:"branch",layout:"alongPath",count:{ideal:2,deviation:1},aroundAxisDegrees:{ideal:0,deviation:180},deviationDegrees:{ideal:-20,deviation:60},offshoot:[
        {id:"nested-leaf",label:"Leaf",type:"form",primitive:"leafBlade",materialId:"stem",width:{ideal:0.08,deviation:0.04},length:{ideal:0.1,deviation:0.15},cup:{ideal:0,deviation:1},curl:{ideal:0,deviation:1}},
      ]},
    ]},
  ];
  return {flower,clover,nested};
}

/** Quantize below the measurement tolerance so platform-level float noise is harmless. */
export function generationFingerprint(asset,seed){
  const parts=compileVegetationPlant(asset,seed);
  const canonical=parts.map(p=>({...p,positions:p.positions.map(v=>Math.round(v*1e7)/1e7)}));
  return {parts:parts.length,vertices:parts.reduce((sum,p)=>sum+p.positions.length/3,0),sha256:createHash("sha256").update(JSON.stringify(canonical)).digest("hex")};
}
