import { Color3, Effect, Mesh, RawTexture, ShaderMaterial, Texture, Vector2, Vector3, Vector4, VertexData, type Scene } from "@babylonjs/core";
import { gameGrassSettings as reference } from "./gameReference/settings.js";
import type { GrassBake } from "./grassBake.js";
import type { GrassLodSettings, VegetationSpeciesAssetFile } from "./assets.js";
import { coverageDotRadius } from "./coveragePattern.js";
import { createCoverageNoise, createCoverageMask } from "./coverageNoise.js";
const coverageNoise = createCoverageNoise();

/** Extracted from LaMow c35d779 grassSlats.ts. The shader and baked detail are the game's;
 * the host supplies patch bounds, terrain, masks and tuning instead of game globals. */
export function createVegetationSlatLayer(scene: Scene, bake: GrassBake, mowTexture: Texture, layerMask: number) {
  const mesh = new Mesh("vegetation-slats-" + layerMask, scene);
  mesh.layerMask = layerMask; mesh.isPickable = false;
  if (!Effect.ShadersStore.vegetationSlatsVertexShader) {
    Effect.ShadersStore.vegetationSlatsVertexShader = `
      precision highp float;
      attribute vec3 position;
      attribute vec3 normal;
      attribute vec2 uv;
      attribute float groundY;
      attribute float cover;
      uniform mat4 worldViewProjection;
      uniform sampler2D mowField;
      uniform vec4 bounds;
      uniform float slatHeight;
      uniform float wiggleAmp;
      uniform float wiggleFreq;
      uniform float bendAmp;
      uniform float time;
      uniform float windAmp;
      uniform vec2 windDirection;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vTop;
      varying float vRun;
      varying float vColorPick;
      varying float vCover;

      float mowedAt(vec2 xz) {
        vec2 uvm = vec2((xz.x - bounds.x) / bounds.z, 1.0 - ((xz.y - bounds.y) / bounds.w));
        // Mow state only exists inside the field; outside, treat as uncut (0) so
        // the yard's mowed edge doesn't bleed into the extended far grass.
        if (uvm.x < 0.0 || uvm.x > 1.0 || uvm.y < 0.0 || uvm.y > 1.0) {
          return 0.0;
        }
        return texture2D(mowField, uvm).r;
      }

      float vhash(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = vhash(i);
        float b = vhash(i + vec2(1.0, 0.0));
        float c = vhash(i + vec2(0.0, 1.0));
        float d = vhash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - (2.0 * f));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main(void) {
        float top = position.y > 0.001 ? 1.0 : 0.0;
        float heightFactor = max(position.y, 0.18);
        float run = uv.x;
        bool alongX = abs(normal.z) > 0.5;
        vec2 stripFace = normalize(normal.xz);
        vec2 runDir = alongX ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec2 cell = vec2(position.x, position.z);

        float noiseA = vnoise(cell * 0.7) - 0.5;
        float noiseB = vnoise((cell * 2.1) + 9.3) - 0.5;
        float noiseC = vnoise((cell * 5.4) + 21.7) - 0.5;
        float leanAngle = ((noiseA * 2.2) + noiseB + (0.5 * noiseC)) * 6.28318;
        vec2 staticLeanDir = vec2(cos(leanAngle), sin(leanAngle));
        float staticLean = bendAmp * (0.4 + (1.6 * vnoise((cell * 1.3) + 3.0)));

        vec2 windAcross = vec2(-windDirection.y, windDirection.x);
        float along = dot(cell, windDirection);
        float across = dot(cell, windAcross);
        float gustA = 0.5 + (0.5 * sin((time * 1.7) + (along * 0.45) + (across * 0.12)));
        float gustB = 0.5 + (0.5 * sin((time * 2.6) + (along * 0.8) + (across * 0.3)));
        float gust = 0.35 + (0.45 * gustA) + (0.2 * gustB);
        vec2 windLean = windDirection * windAmp * gust;

        vec2 lean = (staticLeanDir * staticLean) + windLean;
        float curve = top * top;
        float wigglePhase = (run * wiggleFreq) + ((cell.x + cell.y) * 3.0);
        float wiggle = wiggleAmp * sin(wigglePhase);
        float wiggleDerivative = wiggleAmp * (wiggleFreq + 3.0) * cos(wigglePhase);
        vec2 xz = cell + (lean * curve) + (stripFace * wiggle);

        float h = slatHeight * (1.0 - (mowedAt(xz) * 0.92));
        // Sit on the rolling terrain (baked groundY), so far slats follow the
        // ground like the real blades/props instead of floating on the y=0 plane.
        vec3 worldPosition = vec3(xz.x, groundY + (top * h * heightFactor), xz.y);

        vec3 runTangent = normalize(vec3(
          runDir.x + (stripFace.x * wiggleDerivative),
          0.0,
          runDir.y + (stripFace.y * wiggleDerivative)
        ));
        vec3 heightTangent = vec3(2.0 * lean.x * top, max(0.02, h * heightFactor), 2.0 * lean.y * top);
        vec3 geometricNormal = normalize(cross(runTangent, heightTangent));

        if (dot(geometricNormal.xz, stripFace) < 0.0) {
          geometricNormal = -geometricNormal;
        }

        // Per-slat top pick: low-freq noise gives yellower/greener PATCHES across
        // the field, the higher-freq term jitters it blade-to-blade. Drives which
        // of the two top colors this blade leans toward in the fragment.
        vColorPick = clamp((vnoise((cell * 0.9) + 17.0) * 0.65) + (vnoise((cell * 3.7) + 5.0) * 0.35), 0.0, 1.0);

        vWorldPos = worldPosition;
        vNormal = geometricNormal;
        vTop = top;
        vRun = run;
        vCover = cover;
        gl_Position = worldViewProjection * vec4(worldPosition, 1.0);
      }
    `;

    Effect.ShadersStore.vegetationSlatsFragmentShader = `
      precision highp float;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vTop;
      varying float vRun;
      varying float vColorPick;
      varying float vCover;
      uniform vec3 grassTopColorA;
      uniform vec3 grassTopColorB;
      uniform vec3 grassMidColor;
      uniform vec3 grassBottomColor;
      uniform float vegetationCoverage;
      uniform float patternMode;
      uniform float patternScale;
      uniform float dotRadius;
      uniform sampler2D coverageNoise;
      uniform vec3 topColorA;
      uniform vec3 topColorB;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform vec3 skyAmbientColor;
      uniform float skyAmbientIntensity;
      uniform float slatMidPoint;
      uniform vec3 lightDir;
      uniform vec3 cameraPosition;
      uniform sampler2D grassNormal;
      uniform sampler2D grassAlbedo;
      uniform float tileScale;
      uniform float normalStrength;
      uniform float roughness;
      uniform float specIntensity;
      uniform float sheen;
      uniform float cutoff;
      uniform float lodFade;          // 0 = slats everywhere, 1 = distance fade on
      uniform vec2 lodCenter;         // LOD reference point (the mower, not the camera)
      uniform float slatFadeDistance; // radius where slats begin appearing
      uniform float slatFadeBand;     // width of the alpha fade-in
      uniform float slatMaxDistance;  // far render limit — slats fade back out by here

      const vec3 LIGHT_COLOR = vec3(1.0, 0.95, 0.74);
      const float PI = 3.14159265;

      void main(void) {
        // Only where there's grass — baked coverage is 0 on the road and on far
        // dirt (same signal the ground uses), 1 on grass.
        if (vCover < 0.5) {
          discard;
        }
        vec2 detailUv = vec2(vRun, vWorldPos.y) * tileScale;
        vec4 albedoDetail = texture2D(grassAlbedo, detailUv);
        float tipAmount = clamp(vTop, 0.0, 1.0);
        float threshold = mix(cutoff, cutoff + 0.45, tipAmount);

        if (albedoDetail.a < threshold) {
          discard;
        }

        // Distance LOD: slats are the FAR grass, so they fade IN (alpha) the
        // further you are from the mower. Measured from the mower (lodCenter), not
        // the camera, so orbiting the camera doesn't move the LOD ring. Own
        // distance/band, tuned separately from the blade cull. lodFade off => slats
        // fully on everywhere (tuning mode).
        float slatAlpha = 1.0;
        if (lodFade > 0.5) {
          float lodDist = distance(lodCenter, vWorldPos.xz);
          float fadeIn = clamp((lodDist - slatFadeDistance) / max(0.001, slatFadeBand), 0.0, 1.0);
          // Fade back OUT approaching the render limit, so the far edge isn't a hard
          // ring and "render distance" is a smooth, tunable cutoff.
          float fadeOut = clamp((slatMaxDistance - lodDist) / max(0.001, slatFadeBand), 0.0, 1.0);
          slatAlpha = fadeIn * fadeOut;
          if (slatAlpha <= 0.0) {
            discard; // faded out near the mower or past the render limit — skip it
          }
        }

        vec3 baseNormal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
        vec3 tangent = abs(baseNormal.y) > 0.96
          ? vec3(1.0, 0.0, 0.0)
          : normalize(cross(vec3(0.0, 1.0, 0.0), baseNormal));
        vec3 bitangent = normalize(cross(baseNormal, tangent));
        vec3 normalDetail = (texture2D(grassNormal, detailUv).xyz * 2.0) - 1.0;
        vec3 normal = normalize(
          baseNormal
          + (tangent * normalDetail.x * normalStrength)
          + (bitangent * normalDetail.y * normalStrength * 0.35)
        );

        vec3 light = -normalize(lightDir);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfDir = normalize(light + viewDir);
        float normalDotLight = clamp(dot(normal, light), 0.0, 1.0);
        float normalDotView = clamp(dot(normal, viewDir), 0.0, 1.0);
        float normalDotHalf = clamp(dot(normal, halfDir), 0.0, 1.0);
        float viewDotHalf = clamp(dot(viewDir, halfDir), 0.0, 1.0);

        // "Y"-shaped color graph: each blade picks one of two TOP colors
        // (blade-to-blade variation), then the length blends top -> mid -> bottom
        // through a shared knee at slatMidPoint. Two tops converging to one mid
        // and one bottom.
        // Opaque spatial coverage: each fragment belongs to grass OR vegetation.
        // World-space masks remain stable when the camera orbits and cost no draw calls.
        vec2 cell = vWorldPos.xz / max(0.1, patternScale);
        float coverage = vegetationCoverage;
        float pick = patternMode < 0.5
          ? step(fract((cell.x + cell.y) * 0.70710678), coverage)
          : patternMode < 1.5 ? step(length(fract(cell) - 0.5), dotRadius)
          : texture2D(coverageNoise, cell / 16.0).r;
        float vegetation = coverage <= 0.0 ? 0.0 : coverage >= 1.0 ? 1.0 : pick;
        vec3 topMix = mix(mix(grassTopColorA, grassTopColorB, vColorPick), mix(topColorA, topColorB, vColorPick), vegetation);
        vec3 middle = mix(grassMidColor, midColor, vegetation);
        vec3 bottom = mix(grassBottomColor, bottomColor, vegetation);
        float knee = clamp(slatMidPoint, 0.05, 0.95);
        vec3 vert = tipAmount < knee
          ? mix(bottom, middle, tipAmount / knee)
          : mix(middle, topMix, (tipAmount - knee) / (1.0 - knee));
        vec3 base = vert * (0.78 + (0.42 * albedoDetail.g));
        vec3 ambient = base * skyAmbientColor * skyAmbientIntensity * 1.35;
        float diffuse = 0.26 + (0.74 * clamp((dot(normal, light) + 0.18) / 1.18, 0.0, 1.0));

        float rough = clamp(roughness, 0.04, 1.0);
        float alpha = max(0.025, rough * rough);
        float alphaSquared = alpha * alpha;
        float denom = ((normalDotHalf * normalDotHalf) * (alphaSquared - 1.0)) + 1.0;
        float distribution = alphaSquared / max(0.0001, PI * denom * denom);
        float geometryK = ((rough + 1.0) * (rough + 1.0)) * 0.125;
        float geometryView = normalDotView / max(0.0001, (normalDotView * (1.0 - geometryK)) + geometryK);
        float geometryLight = normalDotLight / max(0.0001, (normalDotLight * (1.0 - geometryK)) + geometryK);
        float fresnel = 0.04 + (0.96 * pow(1.0 - viewDotHalf, 5.0));
        float specular = distribution * geometryView * geometryLight * fresnel * specIntensity * normalDotLight;
        specular = min(specular, 0.85);

        float coatRough = 0.06;
        float coatAlpha = max(0.01, coatRough * coatRough);
        float coatAlphaSquared = coatAlpha * coatAlpha;
        float coatDenom = ((normalDotHalf * normalDotHalf) * (coatAlphaSquared - 1.0)) + 1.0;
        float coatDistribution = coatAlphaSquared / max(0.0001, PI * coatDenom * coatDenom);
        float coatFresnel = 0.04 + (0.96 * pow(1.0 - viewDotHalf, 5.0));
        float clearCoat = coatDistribution * coatFresnel * sheen * normalDotLight * 0.18;
        clearCoat = min(clearCoat, 0.55);

        vec3 color = ambient + (base * diffuse) + (LIGHT_COLOR * (specular + clearCoat));
        gl_FragColor = vec4(color, slatAlpha);
      }
    `;
  }


  const material = new ShaderMaterial("vegetation-slats-material-" + layerMask, scene, "vegetationSlats", {
    attributes: ["position", "normal", "uv", "groundY", "cover"],
    uniforms: ["grassTopColorA", "grassTopColorB", "grassMidColor", "grassBottomColor", "vegetationCoverage", "patternMode", "patternScale", "dotRadius", "worldViewProjection", "cameraPosition", "bounds", "slatHeight", "topColorA", "topColorB", "midColor", "bottomColor", "slatMidPoint", "skyAmbientColor", "skyAmbientIntensity", "lightDir", "tileScale", "normalStrength", "roughness", "specIntensity", "sheen", "cutoff", "wiggleAmp", "wiggleFreq", "bendAmp", "time", "windAmp", "windDirection", "lodFade", "lodCenter", "slatFadeDistance", "slatFadeBand", "slatMaxDistance"],
    samplers: ["mowField", "grassNormal", "grassAlbedo", "coverageNoise"], needAlphaTesting: true,
  });
  material.setTexture("mowField", mowTexture); material.setTexture("grassNormal", bake.normalTex); material.setTexture("grassAlbedo", bake.albedoTex);
  const noise = RawTexture.CreateRGBATexture(createCoverageMask(0.5, coverageNoise), 128, 128, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  let maskCoverage = 0.5;
  noise.wrapU = noise.wrapV = Texture.WRAP_ADDRESSMODE;
  material.setTexture("coverageNoise", noise);
  material.setVector4("bounds", new Vector4(-100, -100, 200, 200));
  material.setVector3("lightDir", new Vector3(-0.45, -1, 0.24).normalize());
  material.setVector2("windDirection", new Vector2(1, 0)); material.setVector2("lodCenter", Vector2.Zero());
  for (const [name, value] of Object.entries({ slatHeight: reference.lodSlatHeight, tileScale: reference.lodSlatTileScale, wiggleAmp: reference.lodSlatWiggle, wiggleFreq: reference.lodSlatWiggleFreq, bendAmp: reference.lodSlatBend, windAmp: reference.lodSlatWind, time: 0, normalStrength: 0.85, roughness: 0.62, specIntensity: 2.62, sheen: 2, cutoff: 0.02, skyAmbientIntensity: 0.22, slatMidPoint: 0.4, lodFade: 0, slatFadeDistance: 0, slatFadeBand: 1, slatMaxDistance: 100 })) material.setFloat(name, value);
  material.setColor3("skyAmbientColor", Color3.FromHexString("#94bfff"));
  material.backFaceCulling = false; material.alpha = 1; material.forceDepthWrite = true;
  mesh.material = material;
  let geometryKey = "";
  return {
    mesh,
    update(asset: VegetationSpeciesAssetFile, grass: GrassLodSettings, width: number, coverage: number) {
      if (maskCoverage !== coverage) { noise.update(createCoverageMask(coverage, coverageNoise)); maskCoverage = coverage; }
      material.setFloat("vegetationCoverage", coverage);
      material.setFloat("patternMode", grass.pattern === "stripes" ? 0 : grass.pattern === "dots" ? 1 : 2);
      material.setFloat("patternScale", grass.patternScale ?? 0.8);
      material.setFloat("dotRadius", coverageDotRadius(coverage));
      const strength = asset.species.lod.farStrength ?? 0.5;
      const tint = Color3.FromHexString(asset.species.lod.farColor ?? asset.species.materials[asset.species.parts[0].materialId].baseColor);
      const referenceColors: Record<string, string> = { topColorA: reference.lodSlatTopColorA, topColorB: reference.lodSlatTopColorB, midColor: reference.lodSlatMidColor, bottomColor: reference.lodSlatBottomColor };
      for (const [uniform, hex] of Object.entries({ topColorA: grass.topColorA, topColorB: grass.topColorB, midColor: grass.midColor, bottomColor: grass.bottomColor })) {
        const vegetation = Color3.Lerp(Color3.FromHexString(hex), tint, strength * (uniform === "bottomColor" ? 0.15 : uniform === "midColor" ? 0.5 : 1));
        material.setColor3(uniform, vegetation);
        material.setColor3("grass" + uniform[0].toUpperCase() + uniform.slice(1), Color3.FromHexString(referenceColors[uniform]));
      }
      const density = 1 + (grass.density - 1) * coverage;
      const key = width + ":" + density;
      if (key === geometryKey) return;
      const spacing = 0.5 / Math.sqrt(Math.max(0.05, density));
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
      let state = 713;
      const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      for (const alongX of [true, false]) {
        for (let cross = -width / 2 + spacing / 2; cross < width / 2; cross += spacing) {
          const line = cross + (random() - 0.5) * spacing * 0.85;
          const height = 0.5 + random() * 0.9;
          let previous = -1;
          const steps = Math.ceil(width / spacing);
          for (let n = 0; n <= steps; n++) {
            const run = -width / 2 + n / steps * width;
            const jitter = (random() - 0.5) * spacing * 0.5;
            const x = alongX ? run : line + jitter, z = alongX ? line + jitter : run;
            const index = positions.length / 3;
            positions.push(x, 0, z, x, height, z); normals.push(alongX ? 0 : 1, 0, alongX ? 1 : 0, alongX ? 0 : 1, 0, alongX ? 1 : 0);
            uvs.push(run + width / 2, 0, run + width / 2, height);
            if (previous >= 0) indices.push(previous, index, previous + 1, index, index + 1, previous + 1);
            previous = index;
          }
        }
      }
      const data = new VertexData(); data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices; data.applyToMesh(mesh, true);
      mesh.setVerticesData("groundY", new Float32Array(positions.length / 3), true, 1);
      mesh.setVerticesData("cover", new Float32Array(positions.length / 3).fill(1), true, 1);
      geometryKey = key;
    },
    dispose() { mesh.dispose(); material.dispose(); noise.dispose(); },
  };
}
