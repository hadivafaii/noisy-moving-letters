"use strict";

const $ = (s) => document.querySelector(s);
const clone = (v) => JSON.parse(JSON.stringify(v));
const get = (obj, path) => path.split(".").reduce((v, k) => v?.[k], obj);
function set(obj, path, value) {
  const keys = path.split("."), last = keys.pop();
  keys.reduce((v, k) => v[k] ??= {}, obj)[last] = value;
}
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((v) => v != null));
  return node;
}
const state = {config: null, seed: 0, object: 0, data: null, comparisons: [], nextComparison: 1, query: "", frame: 0, timeline: 0, playing: true, fields: new Map(), objectFields: new Set(), commonFields: new Set(), fineControls: new Map(), sharedOpen: new Map(), bindings: [], tab: "appearance", objectTab: "shape", advancedTab: "camera", previewBudget: 16777216, exporting: false};
const STORAGE = "nml-explorer/v3";
Object.assign(state,{selectedScene:0,currentScene:null,sceneOrder:[0],sceneToken:0,fonts:[],clipFrames:null,clipRevision:0});
const PIXEL_PRESETS = [32, 64, 96, 128, 192, 256, 384, 512];
const PIXEL_DIMENSIONS = new Set(["video.width", "video.height", "shape.size", "shape.length"]);
const OBJECT_SECTIONS = [
  {id:"shape", tab:"shape", title:"Shape", prefix:"shape.", keys:["motion.angle"]},
  {id:"position", tab:"position", title:"Position", keys:["motion.start_x","motion.start_y"]},
  {id:"movement", tab:"motion", title:"Movement", aliases:"straight line path linear velocity acceleration", keys:["motion.speed","motion.acceleration","motion.direction","motion.bounce"]},
  {id:"rotation", tab:"motion", title:"Rotation", aliases:"angular", keys:["motion.spin","motion.angular_acceleration","motion.wobble","motion.wobble_period","motion.align_heading"]},
  {id:"scale", tab:"motion", title:"Scale", aliases:"dynamic size", keys:["motion.scale","motion.scale_end","noise.texture_scale_compensation"]},
  {id:"speed", tab:"motion", title:"Speed over time", keys:["motion.profile","motion.speed_end","motion.ramp","motion.sine_amp","motion.sine_period"]},
  {id:"visibility", tab:"appearance", title:"Visibility & coherence", keys:["noise.form_contrast","noise.coherence","noise.coherence_mode"]},
  {id:"texture", tab:"appearance", title:"Texture", prefix:"texture."},
  {id:"texture-motion", tab:"appearance", title:"Texture motion & noise", keys:["noise.fresh_noise","noise.coherent_fraction","noise.texture_gain","noise.texture_frame","noise.texture_speed","noise.texture_direction"]},
];
const GROUP_RESETS = {
  movement:{values:{"motion.speed":0,"motion.acceleration":0,"motion.profile":"constant","motion.speed_end":0},help:"Zero linear velocity and acceleration, and restore a constant speed profile."},
  rotation:{values:{"motion.spin":0,"motion.angular_acceleration":0,"motion.wobble":0,"motion.align_heading":false},help:"Zero angular velocity, angular acceleration and wobble, and turn off heading alignment. Keeps the initial rotation set in Shape."},
  scale:{values:{"motion.scale":1,"motion.scale_end":1},help:"Set both Start scale and Final scale to 1. Keeps the texture pixel-size preference."},
  speed:{values:{"motion.profile":"constant","motion.speed_end":0,"motion.ramp":0.25,"motion.sine_amp":0.8,"motion.sine_period":24},help:"Restore the constant speed profile and its default parameters. Keeps linear velocity and acceleration."},
};
const sectionKeys = group => [...(group.prefix ? [...state.objectFields].filter(key=>key.startsWith(group.prefix)) : []), ...(group.keys || [])];
const sectionFor = key => OBJECT_SECTIONS.find(group=>sectionKeys(group).includes(key));
const shareGroups = () => [
  {id:"shape", title:"Shape", keys:sectionKeys(OBJECT_SECTIONS[0])},
  ...["shape","position","motion","appearance"].map(tab=>({id:`all-${tab}`, title:`All ${tab} settings`,
    keys:OBJECT_SECTIONS.filter(group=>group.tab===tab).flatMap(sectionKeys)})),
  ...OBJECT_SECTIONS.slice(1).map(group=>({...group, keys:sectionKeys(group)})),
];
const labels = {
  "shape.font": "Font", "shape.sides": "Polygon sides", "shape.outline": "Outline width",
  "motion.profile": "Speed over time", "motion.speed_end": "Final speed", "motion.ramp": "Acceleration duration",
  "motion.sine_amp": "Speed oscillation", "motion.sine_period": "Speed oscillation period", "motion.radius": "Orbit radius",
  "motion.waypoints": "Path control points", "motion.spin": "Angular velocity", "motion.wobble": "Rotation wobble",
  "motion.acceleration": "Linear acceleration", "motion.angular_acceleration": "Angular acceleration",
  "motion.wobble_period": "Wobble period", "motion.align_heading": "Face direction of travel",
  "motion.scale": "Start scale", "motion.scale_end": "Final scale", "motion.scale_change": "Relative scale change",
  "noise.texture_scale_compensation": "Keep pixel size constant",
  "motion.angle_end": "Final rotation",
  "texture.p_on": "Bright pixel probability", "texture.lo": "Darkest value", "texture.hi": "Brightest value",
  "texture.spread": "Value spread", "texture.levels": "Number of grey levels", "texture.grain": "Noise pixel size",
  "texture.blur": "Texture blur", "texture.dot_density": "Dot density", "texture.dot_size": "Dot diameter",
  "texture.dot_polarity": "Dot colour", "texture.ink": "Shape polarity",
  "noise.coherence_mode": "Texture renewal method", "noise.coherent_fraction": "Dots following the object",
  "noise.texture_gain": "Object texture contrast", "noise.texture_frame": "Texture coordinates",
  "noise.texture_speed": "Extra texture drift", "noise.texture_direction": "Texture drift direction",
  "noise.bg_angle": "Background angle offset", "noise.bg_speed": "Background speed",
  "noise.bg_direction": "Background direction", "noise.ownership": "Shape boundary pixels",
  "view.target": "Follow object number", "view.gain": "Camera follow amount",
  "shape.kind": "Object shape", "shape.chars": "Letter / alphabet", "shape.size": "Object size",
  "shape.thickness": "Stroke thickness", "shape.length": "Bar length", "shape.aspect": "Width / height",
  "motion.speed": "Linear velocity", "motion.direction": "Direction", "motion.path": "Path", "motion.bounce": "Bounce at edges",
  "motion.start_x": "Starting x", "motion.start_y": "Starting y", "motion.angle": "Initial rotation",
  "noise.form_contrast": "Shape visibility", "noise.coherence": "Object coherence", "noise.bg_coherence": "Background persistence",
  "noise.fresh_noise": "Fresh noise", "noise.bg_motion": "Background movement", "texture.marginal": "Pixel values",
  "texture.carrier": "Noise texture", "video.fps": "Playback speed", "video.frames": "Clip length",
  "video.width": "Canvas width", "video.height": "Canvas height", "view.fixate": "Camera",
};
const help = {
  "shape.kind": "Choose a font letter, a letter assembled from strokes, or a geometric shape. Only the controls relevant to your shape are shown.",
  "texture.p_on": "Chance of a bright pixel in the noise texture at zero shape visibility. 0.5 gives equal black and white probabilities.",
  "texture.grain": "Size of each noise cell in pixels. 1 gives independent neighbouring pixels before blur. Larger cells can reveal an outline even in one frame.",
  "texture.blur": "Spatial smoothing within each texture. 0 leaves pixels sharp; larger values introduce correlations and can reveal a seam around the shape.",
  "noise.coherence_mode": "Random refresh redraws each texture cell with probability 1 − coherence. Fixed lifetime renews cells after roughly 1 / (1 − coherence) frames. AR1 gradually mixes old and new values; it applies only to pixel noise.",
  "noise.ownership": "Hard assigns each pixel to the layer covering its centre. Dither randomly chooses a layer near the boundary according to subpixel coverage.",
  "shape.chars": "Type A to keep one letter. Use ABC or upper to choose a letter from that set with each seed.",
  "shape.size": "Size in pixels before scaling: letter cap height, square side, or circle diameter. A diamond’s diagonal is larger than its side.",
  "motion.speed": "Initial velocity along the chosen direction or path, in pixels per frame. Negative values reverse travel. With velocity and acceleration both at 0, the object stays in place. At 2 px/frame and 30 fps, it moves 60 pixels each second.",
  "motion.spin": "Initial angular velocity in degrees per frame. Positive rotates clockwise; negative rotates counterclockwise. Initial rotation is set in Shape. Zero angular velocity and acceleration keep that orientation unless wobble or heading alignment is enabled.",
  "motion.profile": "Optional variation in linear velocity over time. Constant uses the initial velocity directly. Linear ramps to Final speed; the other profiles apply an envelope. Linear acceleration is added to this profile in every case.",
  "motion.scale": "Starting multiplier of the size set in Shape. Scale interpolates from this value to Final scale over the clip. Both default to 1; equal values keep the size unchanged.",
  "motion.scale_end": "Absolute size multiplier at the final frame, interpolated from Start scale. Defaults to 1. Changing the clip length changes how quickly the object reaches this value.",
  "motion.direction": "0° → right · 90° ↓ down · 180° ← left · 270° ↑ up. Motion follows a straight line in this direction.",
  "motion.bounce": "On by default: bounce when the visible shape reaches a canvas wall, accounting for rotation and size. If the object outgrows the canvas, it keeps moving between opposite edge alignments, with the overflow clipped. Works with every speed profile. Off: allow the object to leave the canvas.",
  "noise.form_contrast": "1 = a clearly visible shape. 0 = no luminance-defined shape; only texture motion and persistence can reveal it.",
  "noise.coherence": "1 = the same texture travels with the object. 0 = redraw the object texture every frame. Pause at visibility 0 to compare a single frame with motion.",
  "noise.bg_coherence": "1 = an unchanged background texture. 0 = redraw it each frame. This is independent of object coherence unless you choose “Follow object”.",
  "noise.fresh_noise": "Mix in new noise at every pixel, every frame. 0 adds none; 1 replaces all carried texture. Shape visibility still applies.",
  "noise.bg_motion": "Static keeps the background in place. Drift moves it at a chosen speed. Matched follows object 1 at an offset angle.",
  "view.fixate": "Screen = a stationary camera. Object = follow an object, holding it near the centre while the background passes by.",
  "video.frames": "Number of frames for the current preview and every comparison. Changing this updates all previews together, including downloads. Increasing it extends the paths without changing speed.",
  "video.fps": "Frames played per second, including exports. Changes playback timing without regenerating the stimulus.",
};
const choiceLabels = {glyph:"Font letter", atom:"Stroke letter", bar:"Bar / edge", rect:"Rectangle", ngon:"Polygon", line:"Straight line", static:"Static", pixel:"Pixel noise", dots:"Random dots", screen:"Fixed on screen", object:"Attached to object", world:"World coordinates", binary:"Binary (two values)", uniform:"Uniform (continuous)", gaussian:"Gaussian", laplace:"Laplace", levels:"Discrete grey levels", matched:"Match object speed", drift:"Drift", refresh:"Random refresh", lifetime:"Fixed lifetime", ar1:"Gradual correlation (AR1)"};
const isAppearance = (key) => /^(texture|noise)\./.test(key) && state.objectFields.has(key);
const commonKey = key => key === "noise.bg_coherence" ? "noise.coherence" : key;
const isCommon = key => state.commonFields.has(commonKey(key));
const pathFor = (key, scope = "object", index = state.object) => scope === "shared" ? `shared.overrides.${key}`
  : scope === "common" ? `appearance.overrides.${commonKey(key)}`
  : scope === "scene" && isCommon(key) ? `appearance.background_overrides.${commonKey(key)}`
  : scope === "object" && state.objectFields.has(key) ? `objects.${index}.${isAppearance(key) ? "overrides." : ""}${key}` : key;
const isShared = (key) => get(state.config.shared?.overrides, key) !== undefined;
const commonValue = key => get(state.config.appearance?.overrides,commonKey(key)) ?? get(state.config,commonKey(key));
const objectValue = (key, index = state.object) => {
  const own=get(state.config,pathFor(key,isShared(key)?"shared":"object",index));
  return own!==undefined?own:isCommon(key)?commonValue(key):get(state.config,key);
};
const sceneValue = key => {
  const own=get(state.config,pathFor(key,"scene"));
  return own !== undefined ? own : isCommon(key) ? commonValue(key) : get(state.config,key);
};
const usesCommon = (key,scope,index=state.object) => isCommon(key) && scope!=="common" && scope!=="shared"
  && !(scope==="object" && isShared(key)) && get(state.config,pathFor(key,scope,index))===undefined;
function deleteSetting(path) {
  const parts=path.split("."),key=parts.pop(),parent=get(state.config,parts.join("."));
  if(parent) delete parent[key];
}
function initializeAppearance(migrateLegacy=false,config=state.config) {
  if(config.appearance) {
    config.appearance.overrides ??= {};
    config.appearance.background_overrides ??= {};
    for(const key of state.commonFields) if(get(config.appearance.overrides,key)===undefined) {
      const base=get(config,key);
      set(config.appearance.overrides,key,clone(base));
      if(key==="noise.coherence" && config.noise.bg_coherence!==base
        && get(config.appearance.background_overrides,key)===undefined)
        set(config.appearance.background_overrides,key,config.noise.bg_coherence);
    }
    return;
  }
  const appearance={overrides:{},background_overrides:{}};
  for(const key of state.commonFields) {
    const base=get(config,key),background=get(config,key==="noise.coherence"?"noise.bg_coherence":key);
    set(appearance.overrides,key,clone(base));
    if(background!==base) set(appearance.background_overrides,key,clone(background));
    if(migrateLegacy) for(const object of config.objects) {
      // Older explorers eagerly copied every value onto each object. Matching
      // values can now inherit; keep differences and explicit sharing intact.
      if(get(object.overrides,key)===base) {
        const [group,name]=key.split(".");
        delete object.overrides[group][name];
        if(!Object.keys(object.overrides[group]).length) delete object.overrides[group];
      }
    }
  }
  config.appearance=appearance;
}
function toggleCommon(key,scope,index=state.object) {
  const focusId=document.activeElement?.id;
  const path=pathFor(key,scope,index),linked=usesCommon(key,scope,index);
  if(linked) set(state.config,path,clone(scope==="scene"?sceneValue(key):objectValue(key,index)));
  else deleteSetting(path);
  normalizeCarriers();buildControls();schedule();
  announce(`${scope==="scene"?"Background":`Object ${index+1}`}: ${labels[key]} ${linked?"can now be customized.":"uses common appearance."}`);
  (document.getElementById(focusId) || [...document.querySelectorAll(`[data-appearance-action="${path}"]`)].find(node=>node.getClientRects().length))?.focus();
}
const differs = (value, expected) => Array.isArray(value) ? value.some(v=>v!==expected) : value!==expected;
const someValue = (value, predicate) => [value].flat().some(predicate);
function linearMotionActive(read) {
  return differs(read("motion.speed"),0) || differs(read("motion.acceleration"),0)
    || (someValue(read("motion.profile"),value=>value==="linear") && differs(read("motion.speed_end"),0));
}
function objectAtRest(index) {
  const read=key=>objectValue(key,index);
  const scales=[read("motion.scale"),read("motion.scale_end")].flat();
  return !linearMotionActive(read) && ["motion.spin","motion.angular_acceleration","motion.wobble"].every(key=>!differs(read(key),0))
    && scales.every(value=>value===scales[0]);
}
function fieldApplies(key, scope="object", index=state.object) {
  const meta=state.fields.get(key);
  const read=dependency=>scope==="common" ? commonValue(dependency) : scope==="scene" ? sceneValue(dependency) : objectValue(dependency,index);
  if(!Object.entries(meta.show || {}).every(([dependency,allowed])=>{
    const path=dependency.includes(".") ? dependency : key.split(".")[0]+"."+dependency;
    return someValue(read(path),value=>allowed.includes(value));
  })) return false;
  switch(key) {
    case "motion.wobble_period": return differs(read("motion.wobble"),0);
    case "motion.ramp": case "motion.sine_amp": return differs(read("motion.speed"),0);
    case "motion.sine_period": return differs(read("motion.speed"),0) && differs(read("motion.sine_amp"),0);
    case "motion.direction": return linearMotionActive(read) || someValue(read("motion.align_heading"),Boolean);
    case "motion.align_heading": return linearMotionActive(read) || someValue(read(key),Boolean);
    case "noise.texture_direction": return differs(read("noise.texture_speed"),0);
    case "noise.bg_direction": return differs(read("noise.bg_speed"),0);
    case "noise.coherence_mode": {
      const coherence=scope==="scene" ? read("noise.bg_coherence") ?? objectValue("noise.coherence",0) : read("noise.coherence");
      return someValue(coherence,value=>value>0 && value<1);
    }
    case "noise.texture_scale_compensation": return differs(read("motion.scale"),1) || differs(read("motion.scale_end"),1);
    default: return true;
  }
}
function visibleForScope(key,scope,index=state.object) {
  if(scope==="common") {
    const backgroundKey=key==="noise.coherence"?"noise.bg_coherence":key;
    return fieldApplies(key,"common")
      || state.config.objects.some((_,i)=>usesCommon(key,"object",i) && fieldApplies(key,"object",i))
      || (usesCommon(backgroundKey,"scene") && fieldApplies(backgroundKey,"scene"));
  }
  return scope==="shared" ? state.config.objects.some((_,i)=>fieldApplies(key,"object",i))
    : (scope!=="object" || !isShared(key)) && fieldApplies(key,scope,index);
}
function resetControl(group,scope="object",index=state.object,prefix="") {
  const spec=GROUP_RESETS[group?.id];
  if(!spec || scope==="scene") return null;
  const owner=scope==="shared" ? "shared settings" : `Object ${index+1}`;
  const id=`${prefix}reset-${scope}-${index}-${group.id}`;
  const entries=()=>Object.entries(spec.values).filter(([key])=>scope==="shared" ? isShared(key) : !isShared(key));
  const button=el("button",{id,type:"button",class:"group-reset","aria-label":`Reset ${group.title} for ${owner}`,
    title:spec.help+(scope==="shared" ? " Applies to shared values for all objects." : " Applies to this object's individual values; shared values are managed in Shared between objects."),onclick:()=>{
      for(const [key,value] of entries()) set(state.config,pathFor(key,scope,index),value);
      buildControls();schedule();
      announce(`${group.title} reset for ${owner}.`);
      const current=document.getElementById(id);
      if(current?.getClientRects().length) current.focus();
      else if(state.query) focusSearch();
      else {
        const container=scope==="shared" ? document.querySelector(`.shared-group[data-group="${group.id}"] > summary`)
          : document.querySelector(`#object-group-panel-${group.tab} [data-section="${group.id}"] h2`);
        if(container) {container.tabIndex=-1;container.focus({preventScroll:true});}
      }
    }},"Reset");
  state.bindings.push(()=>{
    const owned=entries();
    button.hidden=!owned.some(([key])=>sectionKeys(group).includes(key) && visibleForScope(key,scope,index))
      || !owned.some(([key,value])=>Array.isArray(get(state.config,pathFor(key,scope,index))) || differs(get(state.config,pathFor(key,scope,index)),value));
  });
  return button;
}
function combineValues(a,b,operation) {
  const values=[a].flat().flatMap(x=>[b].flat().map(y=>operation(x,y)));
  return Array.isArray(a)||Array.isArray(b) ? [Math.min(...values),Math.max(...values)] : values[0];
}
function normalizeLegacyMotion() {
  const own=state.config.objects.map(object=>clone(object.motion));
  const shared=clone(state.config.shared.overrides.motion || {});
  const effective=own.map(motion=>({...motion,...shared}));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  // Convert old endpoints, relative scales and Static paths into visible controls.
  // If a shared dependency produces different results, keep the results per object.
  const migrate=(key,derive)=>{
    const local=own.map(derive), resolved=effective.map(derive);
    local.forEach((value,i)=>{state.config.objects[i].motion[key]=value;});
    if(shared[key]!==undefined || resolved.some((value,i)=>!equal(value,local[i]))) {
      if(resolved.every(value=>equal(value,resolved[0]))) set(state.config.shared.overrides,`motion.${key}`,resolved[0]);
      else {
        if(state.config.shared.overrides.motion) delete state.config.shared.overrides.motion[key];
        resolved.forEach((value,i)=>{state.config.objects[i].motion[key]=value;});
      }
    }
  };
  if([...own,...effective].some(motion=>motion.scale_end==null))
    migrate("scale_end",motion=>motion.scale_end ?? combineValues(motion.scale,motion.scale_change,(a,b)=>a*b));
  if([...own,...effective].some(motion=>motion.angle_end!=null)) {
    migrate("spin",motion=>motion.angle_end==null ? motion.spin
      : combineValues(motion.angle_end,motion.angle,(end,start)=>(end-start)/Math.max(1,state.config.video.frames-1)));
    migrate("angular_acceleration",motion=>motion.angle_end==null ? motion.angular_acceleration : 0);
  }
  if([...own,...effective].some(motion=>motion.path==="static")) {
    migrate("speed",motion=>motion.path==="static" ? 0 : motion.speed);
    migrate("acceleration",motion=>motion.path==="static" ? 0 : motion.acceleration);
    migrate("profile",motion=>motion.path==="static" ? "constant" : motion.profile);
    state.config.objects.forEach(object=>{if(object.motion.path==="static") object.motion.path="line";});
    if(shared.path==="static") state.config.shared.overrides.motion.path="line";
  }
  for(const object of state.config.objects) {object.motion.angle_end=null;object.motion.scale_change=1;object.motion.path="line";}
  if(state.config.shared.overrides.motion) {
    delete state.config.shared.overrides.motion.angle_end;
    delete state.config.shared.overrides.motion.scale_change;
    for(const key of ["path","radius","waypoints"]) delete state.config.shared.overrides.motion[key];
    if(!Object.keys(state.config.shared.overrides.motion).length) delete state.config.shared.overrides.motion;
  }
}
function prepareConfig() {
  state.config.shared ??= {};
  state.config.shared.overrides ??= {};
  // Migrate the former bounce-only switch without losing individual choices.
  if (state.config.shared.bounce_enabled) {
    if (!isShared("motion.bounce")) set(state.config.shared.overrides, "motion.bounce", state.config.shared.bounce);
    state.config.shared.bounce_enabled = false;
  }
  normalizeLegacyMotion();
  initializeAppearance();
  for (const object of state.config.objects) {
    object.overrides ??= {};
    for (const key of state.objectFields) if (isAppearance(key) && !isCommon(key) && get(object.overrides, key) === undefined)
      set(object.overrides, key, clone(get(state.config, key)));
  }
}
let infoId = 0;
function infoButton(label, content, id = `info-${++infoId}`) {
  const body = typeof content === "string" ? el("p", {}, content) : content;
  const popup = el("div", {id, class:"info-popover", popover:"auto"}, body);
  const button = el("button", {type:"button", class:"info-button", "aria-label":`About ${label}`, "aria-controls":id,
    "aria-expanded":"false", popovertarget:id}, "?");
  popup.addEventListener("toggle", () => button.setAttribute("aria-expanded", String(popup.matches(":popover-open"))));
  button.addEventListener("click", () => {
    const rect = button.getBoundingClientRect(), width = Math.min(320, window.innerWidth - 32);
    popup.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) + "px";
    popup.style.top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 200)) + "px";
  });
  return el("span", {class:"info"}, button, popup);
}
function removeSharedSettings(keys) {
  const previous = clone(state.config.shared.overrides);
  for (const key of keys.filter(isShared)) {
    const [group, name] = key.split(".");
    delete state.config.shared.overrides[group][name];
    if (!Object.keys(state.config.shared.overrides[group]).length) delete state.config.shared.overrides[group];
  }
  if (state.config.objects.some((_,i)=>objectValue("texture.carrier",i)==="dots" && objectValue("noise.coherence_mode",i)==="ar1")) {
    state.config.shared.overrides = previous;
    showError(new Error("Unsharing these settings would combine dot textures with AR1. Choose Random refresh or Fixed lifetime before unsharing."));
    return false;
  }
  return true;
}
function removeShared(key) {
  if (!removeSharedSettings([key])) return;
  buildControls(); schedule(); announce(`${labels[key]} returned to individual object settings.`);
  document.querySelector(`[data-path="${pathFor(key)}"] .share-handle`)?.focus();
}
function addSharedSettings(keys, index = state.object) {
  for (const key of keys) if (state.objectFields.has(key) && !isShared(key))
    set(state.config, pathFor(key,"shared"), clone(objectValue(key,index)));
  normalizeCarriers();
}
function shareSetting(key, index = state.object) {
  if (!state.objectFields.has(key) || isShared(key)) return;
  addSharedSettings([key],index);
  state.object=index;
  state.sharedOpen.set(sectionFor(key).id,true);
  buildControls(); schedule(); announce(`${labels[key]} is now shared by all objects.`);
  document.querySelector(`[data-path="${pathFor(key,"shared")}"] .unshare-button`)?.focus();
}
function shareGroup(id) {
  const group = shareGroups().find(group=>group.id===id);
  if (!group) return;
  addSharedSettings(group.keys);
  for (const section of OBJECT_SECTIONS) if (sectionKeys(section).some(key=>group.keys.includes(key))) state.sharedOpen.set(section.id,false);
  buildControls(); schedule(); announce(`${group.title} shared using Object ${state.object+1}. Existing shared values were kept.`);
  $("#shareGroup")?.focus();
}
function unshareGroup(group) {
  if (!removeSharedSettings(sectionKeys(group))) return;
  buildControls(); schedule(); announce(`${group.title} returned to individual object settings.`);
  $("#shareGroup")?.focus();
}
function announce(text) { $("#controlStatus").textContent = text; }
function normalizeCarriers() {
  if (commonValue("texture.carrier") === "dots" && commonValue("noise.coherence_mode") === "ar1")
    set(state.config,pathFor("noise.coherence_mode","common"),"refresh");
  if (sceneValue("texture.carrier") === "dots" && sceneValue("noise.coherence_mode") === "ar1")
    set(state.config,pathFor("noise.coherence_mode","scene"),"refresh");
  if (isShared("noise.coherence_mode") && objectValue("noise.coherence_mode") === "ar1" && state.config.objects.some((_, i) => objectValue("texture.carrier", i) === "dots"))
    set(state.config, pathFor("noise.coherence_mode", "shared"), "refresh");
  for (let i = 0; i < state.config.objects.length; i++) if (objectValue("texture.carrier", i) === "dots" && objectValue("noise.coherence_mode", i) === "ar1")
    set(state.config, pathFor("noise.coherence_mode", isShared("noise.coherence_mode") ? "shared" : "object", i), "refresh");
}
const sceneFor = id => id===0 ? state.currentScene : state.comparisons.find(item=>item.id===id);
const orderedScenes = () => state.sceneOrder.map(sceneFor).filter(Boolean);
// FPS changes playback timing, not the generated frames.
const renderSettings = config => ({...config,video:{...config.video,fps:0}});
const sceneMatches = (item,request) => item.seed===request.seed && JSON.stringify(renderSettings(item.config))===JSON.stringify(renderSettings(request.config));
function syncClipLength(frames=state.config.video.frames) {
  const changed=state.clipFrames!==frames;
  state.clipFrames=frames;state.config.video.frames=frames;
  for(const item of orderedScenes()) if(item.config.video.frames!==frames) {
    item.config.video.frames=frames;item.ready=false;item.error=null;
    item.caption.textContent=previewCost(item.config)>state.previewBudget
      ? "Preview paused — above your limit." : "Updating clip length…";
  }
  if(changed) {
    ++state.clipRevision;
    state.frame=Math.min(state.frame,frames-1);state.timeline=state.frame;
  }
  return changed;
}
function stashScene() {
  const item=sceneFor(state.selectedScene);
  if(!item || !state.config) return;
  item.config=clone(state.config);item.seed=state.seed;item.object=state.object;
}
function savedSession() {
  stashScene();
  const serialize=item=>({id:item.id,title:item.title,config:item.config,seed:item.seed,object:item.object || 0});
  return {version:6,config:state.config,seed:state.seed,comparisonSession:{version:1,
    current:serialize(state.currentScene),comparisons:state.comparisons.map(serialize),
    order:state.sceneOrder,selected:state.selectedScene,nextComparison:state.nextComparison}};
}
function remember() {
  if(!state.currentScene) return;
  try { localStorage.setItem(STORAGE, JSON.stringify(savedSession())); } catch (_) { /* storage is optional */ }
}
async function post(path, body) {
  const response = await NMLHosting.request(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...body,revision:state.hosted?.revision})});
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details={};
    try { details=await response.json();message=details.error || message; } catch (_) { /* keep HTTP status */ }
    if(details.code==="update_available") NMLHosting.showUpdate();
    throw Object.assign(new Error(message),{code:details.code,requested:details.requested});
  }
  return response;
}
function showError(error) { $("#error").hidden = !error; $("#error").textContent = error?.message || ""; }
function bytes(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
const queue = new LatestRenderQueue(
  async (request) => (await post("/api/render", request)).json(),
  (data, request, current) => {
    const item=sceneFor(request.sceneId);
    if(!item || item.token!==request.sceneToken) return;
    item.data={...data,frames:bytes(data.frames),mask:bytes(data.mask),config:request.config,seed:request.seed};
    item.ready=sceneMatches(item,request);item.error=null;
    if(item.ready) item.data.config=clone(item.config);
    item.caption.textContent=readout(item.data);
    if(item.id===state.selectedScene) {
      state.data=item.data;
      state.frame=Math.min(state.frame,data.T-1);state.timeline=state.frame;
      $("#status").textContent=item.ready?(data.cached?"Live · ready":`Live · ${Math.round(data.ms)} ms`):"Updating…";
      $("#compare").disabled=!item.ready;$("#scrub").max=data.T-1;showError(null);
    }
    draw();
  },
  (error,request) => {
    const item=sceneFor(request.sceneId);
    if(item?.token!==request.sceneToken) return;
    item.error=error.message;item.caption.textContent=`Unable to render: ${error.message}`;
    if(request.sceneId===state.selectedScene) {$("#status").textContent="Check settings";showError(error);}
  },75,renderWaitingScenes
);
function renderWaitingScenes() {
  if(queue.busy || queue.pending) return;
  const item=orderedScenes().find(item=>!item.ready && !item.error && item.id!==state.selectedScene && previewCost(item.config)<=effectivePreviewBudget());
  if(item) {
    item.caption.textContent="Updating preview…";
    queue.update({sceneId:item.id,sceneToken:item.token,config:clone(item.config),seed:item.seed,preview_budget:state.previewBudget});
  }
}
const previewCost = (cfg = state.config) => cfg.video.width * cfg.video.height * cfg.video.frames * cfg.objects.length;
const effectivePreviewBudget = () => Math.min(state.previewBudget,state.hosted?.max_preview_budget ?? Infinity);
const millions = (n) => (n / 1_000_000).toLocaleString(undefined, {maximumFractionDigits: 2});
function previewAllowance(budget = state.previewBudget,cfg = state.config) {
  return `${Math.floor(budget / (cfg.video.width * cfg.video.height * cfg.objects.length))} frames at ${cfg.video.width} × ${cfg.video.height} with ${cfg.objects.length} object(s)`;
}
function previewLimitTarget() {
  const active={config:state.config,title:sceneFor(state.selectedScene)?.title || "Current preview"};
  return orderedScenes().filter(item=>item.id!==state.selectedScene && !item.ready)
    .reduce((largest,item)=>previewCost(item.config)>previewCost(largest.config)?item:largest,active);
}
function updateLimitNotice() {
  const target=previewLimitTarget(),cost=previewCost(target.config);
  const over = previewCost() > effectivePreviewBudget();
  const hostedLimit = cost>(state.hosted?.max_preview_budget ?? Infinity);
  $("#limitNotice").hidden = cost<=effectivePreviewBudget();
  $("#raiseLimit").hidden = hostedLimit;
  $("#limitNoticeText").textContent = hostedLimit
    ? `${target.title} needs ${millions(cost)} million pixel-frames. This ${state.hosted.mode==='browser'?'browser session':'shared server'} supports ${millions(state.hosted.max_preview_budget)} million. Reduce dimensions, clip length, or object count, or run the explorer locally.`
    : `${target.title} needs ${millions(cost)} million pixel-frames. Your limit is ${millions(state.previewBudget)} million, allowing ${previewAllowance(state.previewBudget,target.config)}.`;
  for (const id of ["mp4", "gif"]) $("#" + id).disabled = over || state.exporting;
  return over;
}
async function changePreviewBudget(budget,reason="") {
  if (!Number.isSafeInteger(budget) || budget <= 0) return false;
  if(state.hosted && budget>state.hosted.max_export_pixels) {
    showError(new Error(`This request exceeds the session limit of ${millions(state.hosted.max_export_pixels)} million output pixel-frames. Reduce the output size or run the explorer locally.`));
    return false;
  }
  if (budget > state.previewBudget) {
    const dialog = $("#limitDialog");
    if (dialog.open) return false;
    $("#limitSummary").textContent = `Increase the preview limit from ${millions(state.previewBudget)} to ${millions(budget)} million pixel-frames? ` + (reason || `This allows up to ${previewAllowance(budget)}.`);
    $("#limitMemory").textContent = state.hosted
      ? `Previews remain limited to ${millions(state.hosted.max_preview_budget)} million pixel-frames; downloads allow up to ${millions(state.hosted.max_export_pixels)} million output pixel-frames.`
      : `At the new limit, geometry and coverage can use ${(20 * budget / 1024 ** 3).toFixed(2)} GiB. Actual peak memory is higher and depends on the stimulus; this is not a RAM cap.`;
    $("#limitWarning").textContent = state.hosted ? "Larger downloads take longer and use more memory. Oversized requests are rejected before rendering." : "Larger clips use more memory and can slow down or freeze the explorer if your computer runs out of memory.";
    dialog.returnValue = "cancel";
    const decision = new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), {once:true}));
    dialog.showModal();
    if (!await decision) { sync(); return false; }
  }
  state.previewBudget = budget;
  sync();
  updateLimitNotice();
  return true;
}
function previewLimitControl(prefix = "") {
  const select = el("select", {id:prefix+"previewBudget", "aria-label":"Preview size limit"});
  const allowance = el("p", {class:"help"});
  select.addEventListener("change", async () => {
    const requested = Number(select.value);
    sync(); // Keep showing the approved value while the confirmation is open.
    if (await changePreviewBudget(requested)) schedule();
  });
  state.bindings.push(() => {
    const budgets = [...new Set([16777216, 33554432, 67108864, 134217728, state.previewBudget])].filter(n=>n<=(state.hosted?.max_export_pixels ?? Infinity)).sort((a,b) => a-b);
    select.replaceChildren(...budgets.map((n) => el("option", {value:n}, `${millions(n)} million pixel-frames`)));
    select.value = state.previewBudget;
    allowance.textContent = `Current preview allowance: ${previewAllowance(effectivePreviewBudget())}.`;
  });
  return el("div", {class:"field"}, el("div", {class:"field-head"}, el("label", {htmlFor:select.id}, "Preview size limit"),
      infoButton("Preview size limit", "Budget = width × height × frames × object count. Increasing it asks for confirmation. Applies until this page reloads.")),
    el("div", {class:"control"}, select), allowance);
}
function schedule() {
  syncClipLength();
  stashScene();
  const item=sceneFor(state.selectedScene);
  if(item) {item.ready=false;item.error=null;}
  $("#compare").disabled = true;
  if (updateLimitNotice()) {
    queue.cancel();
    $("#status").textContent = "Confirmation needed";
    if (!state.data && item) item.caption.textContent = "No preview yet — confirm a higher limit or reduce the clip size.";
    showError(null);
    renderWaitingScenes();
  } else {
    $("#status").textContent = "Updating…";
    queue.update({sceneId:state.selectedScene,sceneToken:item?.token,config:clone(state.config), seed:state.seed, preview_budget:state.previewBudget});
  }
  explain(); remember();updateExportScope();
}
function edit(path, value) {
  set(state.config, path, value);
  const sharedMode = isShared("noise.coherence_mode");
  normalizeCarriers();
  if (path === "video.fps") {
    const item=sceneFor(state.selectedScene);
    if(item?.data) state.data=item.data={...item.data,config:clone(state.config)};
    remember(); explain();
  }
  else schedule();
  if (sharedMode !== isShared("noise.coherence_mode")) buildControls();
  else sync();
}
function sync() { for (const fn of state.bindings) fn(); }
function pixelPresets(path, label, id, control) {
  const value = get(state.config, path);
  // Reveal exact values for imported custom dimensions and sampled ranges.
  if (!state.fineControls.has(path)) state.fineControls.set(path, Array.isArray(value) || !PIXEL_PRESETS.includes(value));
  control.id = id + "-fine";
  const presets = el("div", {class:"pixel-presets", role:"group", "aria-label":`${label} presets`});
  for (const size of PIXEL_PRESETS) {
    const button = el("button", {type:"button", "aria-label":`${size} px`, onclick:()=>{
      edit(path, Array.isArray(get(state.config,path)) ? [size,size] : size);
    }}, String(size));
    state.bindings.push(()=>{
      const v=get(state.config,path), selected=Array.isArray(v) ? v.every(n=>n===size) : v===size;
      button.setAttribute("aria-pressed",String(selected));
    });
    presets.append(button);
  }
  const current = el("output", {class:"pixel-value", "aria-label":`${label} in pixels`});
  const toggle = el("input", {id:id+"-fine-toggle", type:"checkbox", role:"switch", "aria-label":`${label} fine control`, "aria-controls":control.id});
  toggle.addEventListener("change",()=>{state.fineControls.set(path,toggle.checked);sync();});
  state.bindings.push(()=>{
    const v=get(state.config,path);
    current.textContent=(Array.isArray(v) ? v.join("–") : v)+" px";
    toggle.checked=state.fineControls.get(path);
    control.hidden=!toggle.checked;
  });
  return [presets, el("div", {class:"pixel-options"}, current,
    el("label", {class:"fine-toggle", htmlFor:toggle.id}, toggle, "Fine control")), control];
}
function field(key, {scope = "object", index = state.object, prefix = "", label: labelOverride} = {}) {
  const meta = state.fields.get(key), path = pathFor(key, scope, index);
  const readValue=()=>scope==="common" ? commonValue(key) : scope==="scene" ? sceneValue(key)
    : scope==="object" ? objectValue(key,index) : get(state.config,path);
  const value=readValue();
  const id = prefix + "field-" + path.replaceAll(".", "-");
  const label = labelOverride || labels[key] || meta.label || meta.name.replaceAll("_", " ");
  const row = el("div", {class:"field", "data-path":path, "data-key":key});
  const fieldLabel = el("label", {htmlFor:id}, label);
  const heading = el("div", {class:"field-head"}, key === "motion.angle" ? el("h2", {}, fieldLabel) : fieldLabel);
  const actions = el("div", {class:"field-actions"});
  const control = el("div", {class:"control"});
  const common = {id, "aria-label":label};
  const numeric = ["int", "number"].includes(meta.type);
  const linkedValue = () => objectValue("noise.coherence", 0);
  if (meta.sampled && numeric) {
    const mode = el("select", {id:id+"-sampling", class:"mode", "aria-label":label + " sampling"}, el("option", {value:"fixed"}, "Fixed"), el("option", {value:"range"}, "Range"));
    mode.value = Array.isArray(value) ? "range" : "fixed";
    mode.onchange = () => { const v = readValue(); if (mode.value === "range" && PIXEL_DIMENSIONS.has(key)) state.fineControls.set(path,true); edit(path, mode.value === "range" ? [v,v] : (meta.type === "int" ? Math.round((v[0]+v[1])/2) : (v[0]+v[1])/2)); buildControls(); };
    actions.append(mode);
  }
  if (meta.nullable) {
    const mode = el("select", {id:id+"-link", class:"mode", "aria-label":label + " link"}, el("option", {value:"own"}, "Independent"), el("option", {value:"linked"}, "Follow object 1"));
    mode.value = value === null ? "linked" : "own";
    mode.onchange = () => { edit(path, mode.value === "linked" ? null : linkedValue()); buildControls(); };
    actions.append(mode);
  }
  const description = scope === "common" && key === "noise.form_contrast"
    ? "Controls shape visibility and solid-background strength together. 1 gives a solid shape and background; 0 uses their noise textures. Customize either layer to give it a different strength."
    : scope === "common" && key === "noise.coherence"
    ? "Texture persistence for all layers using common appearance. 1 keeps the texture; 0 redraws it each frame. Custom object or background values stay independent."
    : scope === "scene" && key === "noise.form_contrast"
    ? "1 = a solid background. 0 = the background noise texture. Intermediate values mix the solid fill with noise. Object visibility is controlled separately in Objects → Appearance."
    : key === "noise.fresh_noise" ? "Mix fresh noise into this layer each frame. 0 adds none; 1 replaces all carried texture. Shape visibility or solid-background strength still applies."
    : scope === "scene" && key === "texture.ink" ? "Dark shape polarity gives a light background; light shape polarity gives a dark background. The solid-background strength controls how much of this fill is visible."
    : help[key] || meta.help;
  if(key==="video.frames") actions.append(el("span",{class:"section-context"},"All previews"));
  actions.append(infoButton(label, description));
  if (scope === "shared") {
    actions.append(el("button", {class:"unshare-button", title:"Return to individual settings", "aria-label":`Unshare ${label}`, onclick:()=>removeShared(key)}, "×"));
  } else if (scope === "object" && state.objectFields.has(key) && state.config.objects.length > 1) {
    const handle = el("button", {class:"share-handle", draggable:true, title:"Drag to Shared between objects, or click to share", "aria-label":`Share ${label}`, onclick:()=>shareSetting(key,index)},
      el("span", {"aria-hidden":"true"}, "⠿"));
    handle.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-nml-setting", key);
      e.dataTransfer.effectAllowed = "move";
      document.querySelector(".shared-settings")?.classList.add("drag-ready");
    });
    handle.addEventListener("dragend", () => document.querySelector(".shared-settings")?.classList.remove("drag-ready", "drag-over"));
    actions.append(handle);
  }
  heading.append(actions);
  if (Array.isArray(value)) {
    if (numeric && value.length === 2 && value.every(Number.isFinite)) {
      value.forEach((v,i) => {
        const box = el("input", {...common, id:i ? id + "-max" : id, type:"number", step:meta.step, min:meta.min, value:v, "aria-label":`${label} ${i ? "maximum" : "minimum"}`});
        if (meta.max === 1) box.max = 1;
        box.addEventListener("input", () => { if (box.value !== "" && box.validity.valid) { const next = [...readValue()]; next[i] = Number(box.value); edit(path,next); } });
        state.bindings.push(()=>{if (document.activeElement !== box) box.value=readValue()[i];});
        control.append(i ? el("span", {}, "to") : el("span", {}, "From"), box);
      });
    } else {
      const box = el("input", {...common, type:"text", value:JSON.stringify(value)});
      box.addEventListener("change", () => { try { const v=JSON.parse(box.value); if (!Array.isArray(v) || !v.length) throw new Error("Use a nonempty JSON list of choices."); edit(path,v); showError(null); } catch(e) { showError(e); } });
      control.append(box);
    }
  } else if (key === "shape.font") {
    const select=el("select",common,...state.fonts.map(font=>el("option",{value:font.value},font.label)),
      el("option",{value:"$custom"},"Custom font…"));
    const custom=el("input",{id:id+"-custom",type:"text","aria-label":"Custom font family or path",
      "data-text-entry":"",placeholder:"Font family:weight or /path/to/font.ttf"});
    let customMode=!state.fonts.some(font=>font.value===value);
    select.addEventListener("change",()=>{
      customMode=select.value==="$custom";
      custom.hidden=!customMode;
      if(customMode) {custom.value=readValue();custom.focus();custom.select();}
      else edit(path,select.value);
    });
    custom.addEventListener("change",()=>{if(custom.value.trim()) edit(path,custom.value.trim());});
    state.bindings.push(()=>{
      const current=readValue(),known=state.fonts.some(font=>font.value===current);
      select.value=customMode || !known?"$custom":current;
      custom.hidden=select.value!=="$custom";
      if(document.activeElement!==custom) custom.value=current;
    });
    control.classList.add("font-control");control.append(select,custom);
  } else if (meta.type === "choice") {
    const select = el("select", common, ...meta.choices.filter(v=>key!=="motion.path" || v==="line").map((v) => el("option", {value:v}, key === "view.fixate" && v === "object" ? "Follow object" : choiceLabels[v] || v[0].toUpperCase()+v.slice(1))));
    select.value = value;
    select.addEventListener("change", () => edit(path, select.value));
    state.bindings.push(() => {
      select.value=readValue();
      const dots = scope === "shared" ? state.config.objects.some((_,i)=>objectValue("texture.carrier",i)==="dots")
        : scope === "object" ? objectValue("texture.carrier",index)==="dots"
        : scope === "common" ? commonValue("texture.carrier")==="dots" : sceneValue("texture.carrier")==="dots";
      for (const option of select.options) option.disabled = key === "noise.coherence_mode" && option.value === "ar1" && dots;
    });
    control.append(select);
  } else if (meta.type === "bool") {
    const box = el("input", {...common, type:"checkbox", ...(meta.toggle ? {role:"switch"} : {}), checked:value});
    box.addEventListener("change", () => edit(path,box.checked));
    control.append(el("label", {class:"checkbox-label", htmlFor:id}, box, "Enabled"));
    state.bindings.push(() => { box.checked = readValue(); });
  } else if (meta.type === "text") {
    const box = el("input", {...common, type:"text", value});
    box.addEventListener("input", () => { if (box.value.trim()) edit(path,box.value); });
    state.bindings.push(()=>{if (document.activeElement !== box) box.value=readValue();});
    control.append(box);
  } else {
    const slider = el("input", {...common, type:"range", min:meta.min, max:Math.max(meta.max, value || 0), step:meta.step, value:value ?? linkedValue(), disabled:value === null});
    const box = el("input", {id:id+"-value", type:"number", "aria-label":label + " value", step:meta.step, min:meta.min, value:value ?? linkedValue(), disabled:value === null});
    if (meta.max === 1) box.max = 1;
    slider.addEventListener("input", () => { box.value=slider.value; edit(path,Number(slider.value)); });
    box.addEventListener("input", () => { if (box.value !== "" && box.validity.valid) edit(path,Number(box.value)); });
    box.addEventListener("blur", () => { box.value=readValue() ?? linkedValue(); });
    state.bindings.push(() => { const v=readValue() ?? linkedValue(); slider.max=Math.max(meta.max,v); slider.value=v; if (document.activeElement !== box) box.value=v; });
    control.append(slider,box);
    if (meta.unit) control.append(el("span", {class:"unit"}, meta.unit));
  }
  state.bindings.push(() => {
    row.hidden = !visibleForScope(key,scope,index);
    if(isCommon(key) && ["object","scene"].includes(scope)) {
      const inherited=usesCommon(key,scope,index);
      for(const input of control.querySelectorAll("input,select")) input.disabled=inherited || readValue()===null;
      if(meta.nullable) actions.querySelector("select").hidden=inherited;
    }
  });
  const source=isCommon(key) && ["object","scene"].includes(scope) ? appearanceSource(key,scope,index,id) : null;
  row.append(heading,...(source?[source]:[]),...(PIXEL_DIMENSIONS.has(key) ? pixelPresets(path,label,id,control) : [control]));
  return row;
}
function appearanceSource(key,scope,index,id) {
  const status=el("span"),action=el("button",{id:`${id}-appearance-link`,type:"button",class:"appearance-link",
    "data-appearance-action":pathFor(key,scope,index),onclick:()=>toggleCommon(key,scope,index)});
  state.bindings.push(()=>{
    const linked=usesCommon(key,scope,index);
    status.textContent=linked?"Uses common appearance":"Custom";
    action.textContent=linked?"Customize":"Use common";
    const label=scope==="scene"?labels[key].replace(/^Background /,""):labels[key];
    action.setAttribute("aria-label",`${linked?"Customize":"Use common"} ${scope==="scene"?"Background":`Object ${index+1}`} ${label}`);
  });
  return el("div",{class:"appearance-source"},status,action);
}
function appearanceControls() {
  const header=el("section",{class:"appearance-heading"},el("h2",{},"Common appearance"),
    el("div",{class:"appearance-owners"},el("span",{class:"object-theme owner-label"},"All objects"),
      el("span",{"aria-hidden":"true"},"+"),el("span",{class:"background-theme owner-label"},"Background")),
    el("p",{class:"hint"},"Common edits update linked settings. Custom values stay independent."));
  const summary=el("p",{class:"appearance-summary"});header.append(summary);
  state.bindings.push(()=>{
    const count=[...state.commonFields].reduce((n,key)=>n+state.config.objects.filter((_,i)=>!usesCommon(key,"object",i)).length
      +Number(!usesCommon(key,"scene")),0);
    summary.textContent=count?`${count} layer setting${count===1?" uses":"s use"} custom or shared values.`:"All appearance settings use common values.";
  });
  if(state.config.objects.length>1) {
    const select=el("select",{id:"appearanceObject","aria-label":"Object to inspect"},...state.config.objects.map((_,i)=>el("option",{value:String(i)},`Object ${i+1}`)));
    select.value=String(state.object);select.onchange=()=>{state.object=Number(select.value);buildControls();$("#appearanceObject")?.focus();};
    header.append(el("label",{class:"appearance-object-picker",htmlFor:select.id},"Inspect exceptions for",select));
  }
  const card=(key,scope,index)=>{
    const sceneKey=scope==="scene" && key==="noise.coherence"?"noise.bg_coherence":key;
    const owner=scope==="scene"?"Background":`Object ${index+1}`;
    const value=el("span",{class:"appearance-value"});
    const label=sceneKey==="noise.bg_coherence"?"Texture persistence":searchLabel(sceneKey,scope).replace(/^Background /,"");
    const content=field(sceneKey,{scope,index,prefix:"appearance-inspect-",label:`${owner} ${label}`});
    const shared=scope==="object" && isShared(key);
    const open=shared?el("button",{class:"appearance-link",onclick:()=>{
      state.tab="objects";state.sharedOpen.set(sectionFor(key).id,true);buildControls();
      document.querySelector(`.shared-group[data-group="${sectionFor(key).id}"] summary`)?.focus();
    }},"Open shared"):null;
    const box=el("div",{class:`appearance-layer ${scope==="scene"?"background-theme":"object-theme"}`},
      el("div",{class:"appearance-layer-heading"},el("strong",{},owner),value),
      shared?el("div",{class:"appearance-source"},el("span",{},"Shared between objects"),open):content);
    state.bindings.push(()=>{
      const v=scope==="scene"?sceneValue(sceneKey):objectValue(key,index);
      value.textContent=v===null?"Follows object 1":typeof v==="number"?String(Number(v.toFixed(3))):choiceLabels[v]||String(v);
      box.hidden=!fieldApplies(sceneKey,scope,index);
      // Linked controls are represented by their value and Customize action.
      content.querySelector(".field-head").hidden=true;
      content.querySelector(".control").hidden=usesCommon(sceneKey,scope,index);
    });
    return box;
  };
  const groups=[
    ["Visibility & polarity",["noise.form_contrast","texture.ink"]],
    ["Texture",[...state.commonFields].filter(key=>key.startsWith("texture.") && key!=="texture.ink")],
    ["Persistence & noise",["noise.coherence","noise.coherence_mode","noise.fresh_noise","noise.coherent_fraction"]],
  ];
  return tabPanel("settings","appearance",state.tab,header,...groups.map(([title,keys])=>
    el("section",{class:"control-section common-section"},el("div",{class:"section-title"},el("h2",{},title)),...keys.map(key=>{
      const label=key==="noise.form_contrast"?"Shape visibility / solid background":key==="noise.coherence"?"Texture persistence"
        :key==="texture.ink"?"Contrast polarity":key==="noise.coherent_fraction"?"Dots following their layer":labels[key];
      const base=field(key,{scope:"common",label:`Common ${label}`});
      const objectCard=card(key,"object",state.object),backgroundCard=card(key,"scene",state.object);
      const other=el("p",{class:"appearance-other hint"});
      const row=el("div",{class:"appearance-setting","data-common-key":key},base,
        el("div",{class:"appearance-layers"},objectCard,backgroundCard),other);
      state.bindings.push(()=>{
        row.hidden=base.hidden && objectCard.hidden && backgroundCard.hidden;
        const custom=state.config.objects.flatMap((_,i)=>i!==state.object && !usesCommon(key,"object",i)?[i+1]:[]);
        other.hidden=!custom.length;
        other.textContent=`Other exceptions: Object ${custom.join(", Object ")}`;
      });
      return row;
    }))));
}
function section(title, keys, {scope = "object", extra, group} = {}) {
  const index=state.object;
  const shared = el("span",{class:"section-shared",hidden:true},"Shared");
  const panel = el("section", {class:"control-section",...(group ? {"data-section":group.id} : {})},
    el("div", {class:"section-title"},el("h2",{},title),shared,
      group?.id==="movement" ? el("span",{class:"section-context"},"Straight line") : null,resetControl(group,scope,index)), extra,
    ...keys.map(key=>field(key,{scope})));
  state.bindings.push(()=>{
    const active=keys.filter(key=>fieldApplies(key,scope,index));
    const allShared=scope==="object" && active.length>0 && active.every(isShared);
    shared.hidden=!allShared;
    panel.classList.toggle("is-shared",allShared);
    panel.hidden=!active.length && !extra;
  });
  return panel;
}
function tabs(name, entries, selected, select) {
  const bar = el("div", {class:`tabs ${name}-tabs`, role:"tablist", "aria-label":name === "settings" ? "Settings" : name === "object" ? "Objects" : "Settings groups"});
  entries.forEach(([key, title]) => bar.append(el("button", {id:`${name}-tab-${key}`, role:"tab", type:"button", "aria-selected":String(selected === key),
    "aria-controls":`${name}-panel-${key}`, tabIndex:selected === key ? 0 : -1, onclick:()=>{
      select(key); buildControls(); document.getElementById(`${name}-tab-${key}`)?.focus();
    }}, title)));
  bar.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...bar.querySelectorAll('[role="tab"]')], index = buttons.indexOf(document.activeElement);
    buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length-1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length].click();
  });
  return bar;
}
function tabPanel(name, key, selected, ...children) {
  return el("div", {id:`${name}-panel-${key}`, class:"tab-panel", role:"tabpanel", "aria-labelledby":`${name}-tab-${key}`, hidden:key !== selected}, ...children);
}
function sharedControls() {
  const keys = [...state.objectFields].filter(isShared);
  const groupSelect = el("select", {id:"shareGroup", "aria-label":"Settings group to share"},
    el("option", {value:""}, "Choose a settings group…"),
    ...shareGroups().map(group=>{
      const complete=group.keys.every(isShared);
      return el("option", {value:group.id, disabled:complete}, group.title + (complete ? " · all shared" : ""));
    }));
  const share = el("button", {disabled:true, onclick:()=>shareGroup(groupSelect.value)}, "Share group");
  groupSelect.addEventListener("change",()=>{share.disabled=!groupSelect.value;});
  const groups = OBJECT_SECTIONS.flatMap(group=>{
    const sharedKeys=sectionKeys(group).filter(isShared);
    if (!sharedKeys.length) return [];
    const accordion = el("details", {class:"shared-group", "data-group":group.id,
      open:state.sharedOpen.get(group.id) ?? sharedKeys.length <= 3},
      el("summary", {}, el("span",{},group.title), el("span",{class:"group-count"},`${sharedKeys.length} shared`)),
      el("div", {class:"shared-group-body"},
        el("div", {class:"shared-group-tools"}, el("button", {"aria-label":`Unshare ${group.title} group`, onclick:()=>unshareGroup(group)}, "Unshare group"),resetControl(group,"shared")),
        ...sharedKeys.map(key=>field(key,{scope:"shared"}))));
    state.bindings.push(()=>{accordion.hidden=!sharedKeys.some(key=>visibleForScope(key,"shared"));});
    accordion.addEventListener("toggle",()=>{if (accordion.isConnected) state.sharedOpen.set(group.id,accordion.open);});
    return [accordion];
  });
  const panel = el("section", {class:"shared-settings", "aria-label":"Shared between objects"},
    el("div", {class:"shared-heading"}, el("h2", {}, "Shared between objects"), el("span", {class:"count"}, `All ${state.config.objects.length} objects`),
      infoButton("Shared between objects", "Choose a whole group to share using the selected object's values. Already-shared values are kept. Groups include conditional controls, so sharing still applies when you change shape or texture type. You can also drag or click an individual setting's dotted handle. Shared values apply to every object, including new ones. Unshare a group or click × on a field to restore each object's saved values. Shared ranges draw one value for all objects per seed.")),
    el("label", {class:"share-source", htmlFor:"shareGroup"}, `Share settings from Object ${state.object+1}`),
    el("div", {class:"share-group-picker"}, groupSelect, share),
    ...groups,
    el("div", {class:"drop-hint"}, el("span", {"aria-hidden":"true"}, "+"), keys.length ? "Drop another setting here" : "Drag settings here to share"));
  panel.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("application/x-nml-setting")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; panel.classList.add("drag-over");
  });
  panel.addEventListener("dragleave", (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove("drag-over"); });
  panel.addEventListener("drop", (e) => {
    e.preventDefault(); shareSetting(e.dataTransfer.getData("application/x-nml-setting"));
  });
  return panel;
}
function seedField(prefix = "") {
  const seed=el("input",{type:"number",id:prefix+"seed",min:0,max:4294967295,step:1,value:state.seed,"aria-label":"Random seed"});
  seed.addEventListener("input",()=>{if(seed.value!=="" && seed.validity.valid){state.seed=Number(seed.value);sync();schedule();}});
  state.bindings.push(()=>{if(document.activeElement!==seed) seed.value=state.seed;});
  return el("div",{class:"field"},el("div",{class:"field-head"},el("label",{htmlFor:seed.id},"Random seed"),
    infoButton("Random seed","Keeps texture and random choices repeatable. Next seed draws a new sample using the same settings.")),
    el("div",{class:"control"},seed,el("button",{onclick:()=>{state.seed=(state.seed+1)%4294967296;sync();schedule();}},"Next seed")));
}
const searchText = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function searchGroups() {
  const groups=[];
  groups.push({id:"common-appearance",scope:"common",owner:"Common appearance",title:"Objects + background",
    keys:[...state.commonFields],aliases:"appearance texture noise shared linked"});
  const addObjectGroups=(scope,index,owner)=>{
    for(const group of OBJECT_SECTIONS) groups.push({...group,scope,index,owner,
      keys:sectionKeys(group).filter(key=>scope==="shared" ? isShared(key) : !isShared(key))});
  };
  addObjectGroups("shared",0,"Shared · All objects");
  state.config.objects.forEach((_,index)=>addObjectGroups("object",index,`Object ${index+1}`));
  const scene=(id,owner,title,keys,aliases="")=>groups.push({id,scope:"scene",owner,title,keys,aliases});
  scene("background-movement","Background","Movement",["noise.bg_motion","noise.bg_speed","noise.bg_direction","noise.bg_angle"],"position");
  scene("background-noise","Background","Persistence & noise",["noise.bg_coherence","noise.coherence_mode","noise.fresh_noise","noise.coherent_fraction"]);
  scene("background-appearance","Background","Appearance",["noise.form_contrast",...[...state.fields.keys()].filter(key=>key.startsWith("texture."))]);
  scene("canvas","Preview","Canvas & playback",["video.width","video.height","video.frames","video.fps","$seed"]);
  scene("camera","Advanced","Camera & fixation",[...state.fields.keys()].filter(key=>key.startsWith("view.")));
  scene("rendering","Advanced","Rendering",["noise.ownership","$budget"]);
  return groups;
}
function searchLabel(key,scope) {
  if(key==="$seed") return "Random seed";
  if(key==="$budget") return "Preview size limit";
  if(scope==="common" && key==="noise.form_contrast") return "Shape visibility / solid background";
  if(scope==="common" && key==="noise.coherence") return "Texture persistence";
  if(scope==="scene" && key==="noise.form_contrast") return "Solid background";
  if(scope==="scene" && key==="texture.ink") return "Contrast polarity";
  return labels[key] || state.fields.get(key).label;
}
function focusFirstControl(container) {
  const target=[...container.querySelectorAll(".control input,.control select,.pixel-presets button")].find(node=>!node.disabled && node.getClientRects().length);
  target?.focus();
}
function setSearch(query) {
  state.query=query;
  $("#settingsSearch").value=query;
  buildControls();
}
function focusSearch() {
  $(".settings-search").scrollIntoView({block:"start"});
  $("#settingsSearch").focus({preventScroll:true});
}
function openSearchGroup(group) {
  state.query="";$("#settingsSearch").value="";
  if(group.scope==="common") state.tab="appearance";
  else if(group.scope!=="scene") {
    state.tab="objects";state.objectTab=group.tab;
    if(group.scope==="object") state.object=group.index;
    else state.sharedOpen.set(group.id,true);
  } else if(group.id.startsWith("background")) state.tab="background";
  else if(group.id==="canvas") $("#canvasSettings").open=true;
  else {state.tab="advanced";state.advancedTab=group.id;}
  buildControls();
  const container=group.scope==="shared" ? document.querySelector(`.shared-group[data-group="${group.id}"]`)
    : group.scope==="object" ? document.getElementById(`object-group-panel-${group.tab}`)
    : group.id==="canvas" ? $("#canvasControls") : document.getElementById(`settings-panel-${state.tab}`);
  container?.scrollIntoView({block:"nearest"});
  if(container) {
    const special=group.keys[0]==="$seed" ? $("#seed") : group.keys[0]==="$budget" ? $("#previewBudget") : null;
    if(special) {special.focus();return;}
    const row=group.keys.map(key=>container.querySelector(`[data-path="${pathFor(key,group.scope,group.index)}"]`)).find(node=>node && !node.hidden);
    focusFirstControl(row || container);
  }
}
function searchControls() {
  const terms=searchText(state.query).split(" ").filter(Boolean), cards=[];
  const empty=el("p",{class:"search-empty"},`No active settings match “${state.query.trim()}”. Try a setting or group name, such as position, speed, or texture.`);
  for(const group of searchGroups()) {
    const keys=group.keys.filter(key=>{
      const meta=state.fields.get(key);
      const owners=group.scope==="shared" ? state.config.objects.map((_,i)=>`object ${i+1}`).join(" ") : "";
      const text=searchText([group.owner,owners,group.tab,group.title,group.aliases,searchLabel(key,group.scope),meta?.label,key].filter(Boolean).join(" "));
      return terms.length && terms.every(term=>text.includes(term));
    });
    if(!keys.length) continue;
    const name=`${group.owner} · ${group.title}`, id=`search-group-${cards.length}`;
    const fields=keys.map(key=>key==="$seed" ? seedField("search-") : key==="$budget" ? previewLimitControl("search-")
        : field(key,{scope:group.scope,index:group.index,prefix:"search-",label:searchLabel(key,group.scope)}));
    const card=el("section",{class:`search-result ${group.scope==="common"?"common-theme":group.scope!=="scene" ? "object-theme" : ""}`,role:"region","aria-label":name},
      el("div",{class:"search-result-head"},el("div",{},el("span",{class:"search-owner"},group.owner),el("h2",{id},group.title)),
        el("div",{class:"search-result-actions"},resetControl(group,group.scope,group.index,"search-"),
          el("button",{"aria-label":`Open ${group.title} in ${group.owner}`,onclick:()=>openSearchGroup({...group,keys})},"Open panel"))), ...fields);
    cards.push({card,fields});
  }
  state.bindings.push(()=>{
    let count=0,groupCount=0;
    for(const {card,fields} of cards){const visible=fields.filter(field=>!field.hidden).length;card.hidden=!visible;count+=visible;if(visible)groupCount++;}
    empty.hidden=count>0;
    const status=count ? `${count} setting${count===1?"":"s"} in ${groupCount} group${groupCount===1?"":"s"}` : "No matching settings";
    if($("#searchStatus").textContent!==status) $("#searchStatus").textContent=status;
  });
  return el("div",{id:"searchResults",role:"region","aria-label":"Search results"},...cards.map(item=>item.card),empty);
}
function buildControls() {
  const focused=document.activeElement, focusId=focused?.id;
  const selection=[focused?.selectionStart,focused?.selectionEnd];
  const restoreFocus=()=>{
    if(focused?.isConnected || !focusId) return;
    const target=document.getElementById(focusId);
    if(!target || !target.getClientRects().length) return;
    target.focus({preventScroll:true});
    if(selection[0]!=null && target.setSelectionRange) target.setSelectionRange(...selection);
  };
  prepareConfig();
  state.bindings=[];
  $("#clearSearch").hidden=!state.query;
  $("#canvasControls").replaceChildren(...["video.width","video.height","video.frames","video.fps"].map(key=>field(key,{scope:"scene"})),seedField());
  if(state.query.trim()) {
    $("#controls").replaceChildren(searchControls());
    sync();explain();restoreFocus();return;
  }
  $("#searchStatus").textContent="";
  const keysIn = (group) => [...state.fields.keys()].filter(k=>k.startsWith(group+"."));
  const quick=el("div",{class:"quick"});
  for (const [title,a] of [["Clean",1],["Noisy",0.5],["Motion only",0]]) {
    const b=el("button",{onclick:()=>edit(pathFor("noise.form_contrast",isShared("noise.form_contrast")?"shared":"object"),a)},title);
    state.bindings.push(()=>b.classList.toggle("on", objectValue("noise.form_contrast") === a)); quick.append(b);
  }
  state.bindings.push(()=>{quick.hidden=isShared("noise.form_contrast");});
  const objectGroups = [["shape","Shape"],["position","Position"],["motion","Motion"],["appearance","Appearance"]];
  const objectTabs = tabs("object", state.config.objects.map((_,i)=>[String(i),`Object ${i+1}`]), String(state.object), key=>{state.object=Number(key);});
  const objectTools = el("div", {class:"object-tools"},
    el("button", {disabled:state.config.objects.length>=8, onclick:()=>{
      const object = clone(state.defaults.objects[0]);
      object.overrides = {};
      for (const key of state.objectFields) if (isAppearance(key) && !isCommon(key)) set(object.overrides,key,clone(get(state.defaults,key)));
      state.config.objects.push(object); state.object=state.config.objects.length-1;
      object.motion.start_y = 0.7;
      buildControls(); schedule(); announce(`Object ${state.object+1} added.`);
    }}, "+ Add object"),
    el("button", {disabled:state.config.objects.length<=1, onclick:()=>{
      const removed = state.object;
      state.config.objects.splice(removed,1);
      state.object=Math.min(removed,state.config.objects.length-1);
      if (state.config.view.target > removed+1) state.config.view.target--;
      state.config.view.target=Math.min(state.config.view.target,state.config.objects.length);
      buildControls(); schedule(); announce(`Object ${removed+1} removed.`);
    }}, "Remove object"));
  const objects = tabPanel("settings", "objects", state.tab,
    (state.config.objects.length > 1 || [...state.objectFields].some(isShared)) ? sharedControls() : null,
    el("div", {class:"object-navigation"}, objectTabs, objectTools),
    ...state.config.objects.map((_,i)=>tabPanel("object", String(i), String(state.object), ...(i !== state.object ? [] : [
      tabs("object-group", objectGroups, state.objectTab, key=>{state.objectTab=key;}),
      ...objectGroups.map(([tab])=>tabPanel("object-group",tab,state.objectTab,
        ...OBJECT_SECTIONS.filter(group=>group.tab===tab).map(group=>
          section(group.title,sectionKeys(group),{group,extra:group.id === "visibility" ? quick : null}))))
    ]))));
  const background = tabPanel("settings","background",state.tab,
    section("Background movement",["noise.bg_motion","noise.bg_speed","noise.bg_direction","noise.bg_angle"],{scope:"scene"}),
    section("Persistence & noise",["noise.bg_coherence","noise.coherence_mode","noise.fresh_noise","noise.coherent_fraction"],{scope:"scene"}),
    el("section",{class:"control-section"},el("div",{class:"section-title"},el("h2",{},"Background appearance")),
      field("noise.form_contrast",{scope:"scene",label:"Solid background"}),
      ...keysIn("texture").map(key=>field(key,{scope:"scene",label:key==="texture.ink"?"Contrast polarity":undefined}))));
  const advancedGroups=[["camera","Camera"],["rendering","Rendering"]];
  const advanced = tabPanel("settings","advanced",state.tab,
    tabs("advanced",advancedGroups,state.advancedTab,key=>{state.advancedTab=key;}),
    tabPanel("advanced","camera",state.advancedTab,section("Camera & fixation",keysIn("view"),{scope:"scene"})),
    tabPanel("advanced","rendering",state.advancedTab,section("Rendering",["noise.ownership"],{scope:"scene",extra:previewLimitControl()})));
  $("#controls").replaceChildren(tabs("settings",[["objects","Objects"],["background","Background"],["appearance","Appearance"],["advanced","Advanced"]],state.tab,key=>{state.tab=key;}),objects,background,appearanceControls(),advanced);
  sync();
  explain();
  restoreFocus();
}
function readout(d) {
  return `${d.W} × ${d.H} px · ${d.T} frames · seed ${d.seed} · ` + d.objects.map((o)=>`${o.label} ${Math.round(o.width)} × ${Math.round(o.height)} px, ${o.speed} px/frame`).join("; ");
}
function explain() {
  const {view:v,objects}=state.config;
  const n={...state.config.noise}, t={...state.config.texture};
  for(const key of state.commonFields) {const path=key==="noise.coherence"?"noise.bg_coherence":key;set({noise:n,texture:t},path,sceneValue(path));}
  for (const key of state.objectFields) if (isAppearance(key)) (key.startsWith("noise.")?n:t)[key.split(".")[1]]=objectValue(key);
  const a=n.form_contrast;
  let text=`Object ${state.object+1}: ` + (a===1?"The object is visible from its brightness. Lower Shape visibility to reveal its noise texture.":a===0?"The object uses its noise texture. When object and background appearance match, differences across frames reveal the shape.":"The shape has a brightness cue mixed with noise. Lower Shape visibility to rely more on motion.");
  if (n.coherence===0 && n.bg_coherence===1) text+=" The object flickers while the background persists.";
  if (a===0 && n.coherence===0 && (n.bg_coherence===0 || n.bg_coherence===null) && t.carrier==="pixel") text+=" Both textures refresh every frame.";
  if (n.fresh_noise>0) text+=` Fresh noise contributes ${Math.round(n.fresh_noise*100)}% of this object's latent noise variance.`;
  $("#explanation").textContent=text;
  const still=n.bg_motion==="static" && v.fixate==="screen";
  $("#sceneTitle").textContent=still?"Moving object, still background":v.fixate==="object"?"Camera follows the object":"Object & background motion";
  if (objects.every((_,i)=>objectAtRest(i)) && still) $("#sceneTitle").textContent="Stationary object & background";
  $("#motionNote").textContent = (still?"Background position is fixed. ":"Background can move on screen with its texture or the camera. ") + "A stationary background intentionally makes frame differences informative. The Background tab contains movement and persistence controls. With bounce off, the object can leave the canvas.";
}
function drawCanvas(canvas,d) {
  if(!d) return;
  const {W,H,T,frames,mask}=d, hw=W*H, t=state.timeline%T, mode=$("#display").value;
  if(canvas.width!==W || canvas.height!==H){canvas.width=W;canvas.height=H;}
  const zoom=$("#zoom").value;
  canvas.style.width=(zoom==="fit"?512:W*Number(zoom))+"px";
  canvas.style.maxWidth=zoom==="fit"?"100%":"none";
  canvas.style.flexShrink="0";
  const ctx=canvas.getContext("2d"),img=ctx.createImageData(W,H), outline=$("#outline").checked;
  const bit=(i)=>(mask[i>>3]>>(7-(i&7)))&1;
  if(mode==="mean" && !d.mean){ d.mean=new Float32Array(hw);for(let k=0;k<T;k++)for(let i=0;i<hw;i++)d.mean[i]+=frames[k*hw+i]/T; }
  for(let i=0;i<hw;i++){
    const index=t*hw+i, inside=bit(index);
    let value=mode==="mask"?inside*255:mode==="diff"?(t?Math.abs(frames[index]-frames[index-hw]):0):mode==="mean"?d.mean[i]:frames[index];
    const x=i%W,y=Math.floor(i/W);
    const edge=outline && mode!=="mean" && inside && (x===0 || y===0 || x===W-1 || y===H-1 || !bit(index-1)||!bit(index+1)||!bit(index-W)||!bit(index+W));
    img.data[4*i]=edge?238:value;img.data[4*i+1]=edge?91:value;img.data[4*i+2]=edge?68:value;img.data[4*i+3]=255;
  }
  ctx.putImageData(img,0,0);
}
function draw(){
  for(const item of orderedScenes()) drawCanvas(item.canvas,item.data);
  $("#scrub").value=state.frame;$("#frameLabel").textContent=`${state.frame+1} / ${state.data?.T || 48}`;
}
function createScene({id,title,config,seed=0,data=null,object=0}) {
  const canvas=id===0?$("#preview"):el("canvas",{"aria-label":`${title} stimulus`});
  const figure=id===0?$("#livePreview"):el("figure",{id:`comparison-${id}`,class:"comparison"});
  const select=el("button",{type:"button",class:"scene-select",onclick:()=>selectScene(id)});
  const caption=id===0?$("#readout"):el("figcaption",{},data?readout(data):"Preparing preview…");
  const remove=id===0?null:el("button",{"aria-label":`Remove comparison ${id}`,onclick:()=>removeComparison(id)},"Remove");
  const head=el("div",{class:`screen-head ${id===0?"live-head":""}`},
    el("h3",{id:`scene-title-${id}`},select),remove);
  if(id===0) figure.querySelector(".screen-head").replaceWith(head);
  else figure.append(head,el("div",{class:"canvas-wrap"},canvas),caption);
  figure.setAttribute("aria-labelledby",`scene-title-${id}`);
  return {id,token:++state.sceneToken,title,config:clone(config),seed,data,object,canvas,figure,select,caption,remove,ready:Boolean(data),error:null};
}
function updateComparisons() {
  const count=state.comparisons.length,active=sceneFor(state.selectedScene);
  $("#screens").classList.toggle("has-comparisons",count>0);
  $("#comparisonCount").textContent=count ? `${count} saved comparison${count===1?"":"s"}` : "No saved comparisons";
  $("#clearComparisons").hidden=!count;$("#sceneEditor").hidden=!count;$("#sceneActions").hidden=!count;
  if(!count) $("#sceneRenameForm").hidden=true;
  const ordered=orderedScenes();
  for(const item of ordered) {
    const selected=item.id===state.selectedScene;
    item.select.textContent=item.title+(selected?" · Editing":"");
    item.select.setAttribute("aria-label",`Edit ${item.title}`);
    item.select.setAttribute("aria-pressed",String(selected));
    item.canvas.setAttribute("aria-label",`${item.title} stimulus`);
    item.figure.classList.toggle("is-editing",selected);
  }
  // Reorder existing nodes only when necessary so focused controls stay focused.
  ordered.forEach((item,index)=>{const at=$("#screens").children[index];if(at!==item.figure) $("#screens").insertBefore(item.figure,at||null);});
  $("#sceneSelect").replaceChildren(...ordered.map(item=>el("option",{value:item.id},item.title)));
  $("#sceneSelect").value=String(state.selectedScene);
  const index=state.sceneOrder.indexOf(state.selectedScene);
  $("#moveSceneEarlier").disabled=index<=0;$("#moveSceneLater").disabled=index===state.sceneOrder.length-1;
  $("#editingName").textContent=active?`Editing: ${active.title}`:"";
  $("#compare").textContent=state.selectedScene===0?"+ Keep for comparison":"+ Duplicate selected";
  updateLimitNotice();
  updateExportScope();
}
function selectScene(id,{focus=true}={}) {
  const item=sceneFor(id);
  if(!item || id===state.selectedScene) return;
  stashScene();queue.cancel();
  state.selectedScene=id;state.config=clone(item.config);state.seed=item.seed;state.data=item.data;
  state.object=Math.min(item.object||0,state.config.objects.length-1);
  state.fineControls.clear();state.sharedOpen.clear();$("#sceneRenameForm").hidden=true;
  buildControls();updateComparisons();showError(null);
  if(item.data && item.ready && !updateLimitNotice()) {
    state.frame=state.timeline%item.data.T;$("#scrub").max=item.data.T-1;
    $("#status").textContent=`Live · ${Math.round(item.data.ms)} ms`;$("#compare").disabled=false;
    remember();draw();renderWaitingScenes();
  } else {state.frame=0;schedule();draw();}
  if(focus) item.select.focus();
  announce(`Editing ${item.title}. Clip length stays shared across all previews.`);
}
function keepComparison() {
  if(!state.data || $("#compare").disabled) return;
  stashScene();
  const id=state.nextComparison++,title=`Comparison ${id}`;
  const data={...state.data,config:clone(state.config),seed:state.seed};
  const item=createScene({id,title,config:state.config,seed:state.seed,data,object:state.object});
  state.comparisons.push(item);state.sceneOrder.push(id);
  $("#exportScope").value="all";$("#exportStatus").textContent="";
  updateComparisons();remember();draw();
  announce(`${title} saved. Select its title to edit its settings.`);
}
function moveScene(offset) {
  const index=state.sceneOrder.indexOf(state.selectedScene),next=index+offset;
  if(next<0 || next>=state.sceneOrder.length) return;
  [state.sceneOrder[index],state.sceneOrder[next]]=[state.sceneOrder[next],state.sceneOrder[index]];
  state.comparisons=state.sceneOrder.filter(id=>id!==0).map(sceneFor);
  updateComparisons();remember();
  const button=$(offset<0?"#moveSceneEarlier":"#moveSceneLater");
  if(button.disabled) sceneFor(state.selectedScene).select.focus();
  announce(`${sceneFor(state.selectedScene).title} moved to position ${next+1}.`);
}
function removeComparison(id) {
  const index=state.comparisons.findIndex(item=>item.id===id);
  if(index<0) return;
  if(state.selectedScene===id) selectScene(0,{focus:false});
  const [removed]=state.comparisons.splice(index,1);removed.figure.remove();
  state.sceneOrder=state.sceneOrder.filter(value=>value!==id);
  updateComparisons();remember();
  (state.comparisons[Math.min(index,state.comparisons.length-1)]?.remove || ($("#compare").disabled ? $("#play") : $("#compare"))).focus();
  announce(`${removed.title} removed. ${state.comparisons.length} saved comparisons.`);
}
function clearComparisons() {
  if(state.selectedScene!==0) selectScene(0,{focus:false});
  for(const item of state.comparisons) item.figure.remove();
  state.comparisons=[];state.sceneOrder=[0];updateComparisons();remember();
}
async function restoreSession(saved) {
  const session=saved.comparisonSession;
  if(!session) {await applyConfig(saved.config||saved,saved.seed??state.seed);return;}
  if(session.version!==1 || !Array.isArray(session.comparisons) || !session.current || session.current.id!==0)
    throw new Error("Invalid comparison session.");
  const records=[session.current,...session.comparisons],ids=new Set();
  const validated=[];
  for(const record of records) {
    if(!Number.isSafeInteger(record.id) || record.id<0 || ids.has(record.id) || typeof record.title!=="string" || !record.title.trim())
      throw new Error("Invalid comparison name or identifier.");
    ids.add(record.id);
    const result=await (await post("/api/validate",{config:record.config,seed:record.seed??0})).json();
    initializeAppearance(true,result.config);
    result.config.shared.overrides ??= {};
    validated.push({id:record.id,title:record.title.trim().slice(0,60),config:result.config,seed:result.seed,
      object:Math.max(0,Math.min(Number.isInteger(record.object)?record.object:0,result.config.objects.length-1))});
  }
  if(!Array.isArray(session.order) || session.order.length!==ids.size || new Set(session.order).size!==ids.size || session.order.some(id=>!ids.has(id)))
    throw new Error("Invalid preview order.");
  queue.cancel();
  for(const item of state.comparisons) item.figure.remove();
  state.currentScene=createScene(validated[0]);state.comparisons=validated.slice(1).map(createScene);
  state.sceneOrder=[...session.order];state.selectedScene=ids.has(session.selected)?session.selected:0;
  state.nextComparison=Math.max(...ids)+1;
  if(Number.isSafeInteger(session.nextComparison)) state.nextComparison=Math.max(state.nextComparison,session.nextComparison);
  const active=sceneFor(state.selectedScene);
  state.config=clone(active.config);state.seed=active.seed;state.data=null;
  state.object=Math.max(0,Math.min(Number.isInteger(active.object)?active.object:0,state.config.objects.length-1));
  state.frame=0;state.timeline=0;state.fineControls.clear();state.sharedOpen.clear();$("#sceneRenameForm").hidden=true;
  for(const item of orderedScenes()) {item.canvas.getContext("2d").clearRect(0,0,item.canvas.width,item.canvas.height);item.caption.textContent="Preparing preview…";}
  buildControls();updateComparisons();schedule();
}
function play(value){state.playing=value;$("#play").textContent=value?"Pause":"Play";$("#play").setAttribute("aria-label",value?"Pause playback":"Play playback");}
const isSpace = event => event.code === "Space" || event.key === " ";
function playbackKeydown(event) {
  if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="k" && !$("#limitDialog").open) {
    event.preventDefault();focusSearch();$("#settingsSearch").select();return;
  }
  if(event.key==="Escape" && state.query && event.target.closest("#settingsSearch,#searchResults") && !document.querySelector(":popover-open")) {
    event.preventDefault();setSearch("");focusSearch();return;
  }
  // Search needs normal text entry, including spaces between search terms.
  if(event.target.matches("[data-text-entry]")) {
    if(event.key==="Escape" && event.target.id==="sceneName") {event.preventDefault();$("#cancelSceneRename").click();}
    return;
  }
  if(event.target.id==="settingsSearch") {
    if(event.key==="Enter") {event.preventDefault();focusFirstControl($("#controls"));}
    return;
  }
  // Everywhere else, Space controls playback and never activates a focused control.
  if (isSpace(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) play(!state.playing);
    return;
  }
  // Space is reserved for playback; Enter keeps checkboxes and switches operable.
  if(event.key==="Enter" && event.target.matches('input[type="checkbox"]')) {
    event.preventDefault();event.target.click();return;
  }
  if (event.target.closest("input,select,textarea,button,summary,[contenteditable]")) return;
  if (["ArrowLeft","ArrowRight"].includes(event.key) && state.data) {
    event.preventDefault();
    play(false);
    state.frame=(state.frame+(event.key === "ArrowRight" ? 1 : -1)+state.data.T)%state.data.T;
    state.timeline=state.frame;
    draw();
  }
}
let last=0,acc=0;
function tick(now){
  if(state.playing&&state.data){acc+=Math.min(now-last,150);const dt=1000/state.config.video.fps;if(acc>=dt){state.timeline+=Math.floor(acc/dt);state.frame=state.timeline%state.data.T;acc%=dt;draw();}}
  else acc=0;
  last=now;requestAnimationFrame(tick);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=el("a",{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const previewColumns=()=>getComputedStyle($("#screens")).gridTemplateColumns.trim().split(/\s+/).length;
function exportDimensions() {
  if($("#exportScope").value!=="all") return {width:state.config.video.width,height:state.config.video.height};
  const videos=orderedScenes().map(item=>(item.id===state.selectedScene?state.config:item.config).video);
  const columns=Math.min(previewColumns(),videos.length),rows=Math.ceil(videos.length/columns);
  const {gap,title_height}=state.exportOptions;
  return {width:columns*Math.max(...videos.map(v=>v.width))+(columns-1)*gap,
    height:rows*(Math.max(...videos.map(v=>v.height))+title_height)+(rows-1)*gap};
}
function mp4Dimensions(width,height,requestedScale) {
  const [longEdge,shortEdge]=state.exportOptions.mp4_bounds || [3840,2160];
  let limit=Math.min(longEdge/Math.max(width,height),shortEdge/Math.min(width,height));
  if(limit>=1) limit=Math.floor(limit);
  const scale=Math.min(requestedScale,limit);
  const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
  return {width:w+w%2,height:h+h%2,capped:scale<requestedScale};
}
function updateExportScope() {
  const select=$("#exportScope"),all=select.querySelector('[value="all"]');
  all.disabled=!state.comparisons.length;
  if(all.disabled) select.value="active";
  select.disabled=state.exporting;
  const resolution=$("#exportResolution"),{width,height}=exportDimensions();
  const scale=Math.max(1,Math.floor(state.exportOptions.base_size/Math.max(width,height)));
  resolution.disabled=state.exporting;
  for(const option of resolution.options) {
    const factor=Number(option.value),label=factor===1?"Standard":`${factor}×`;
    const mp4=mp4Dimensions(width,height,scale*factor);
    option.textContent=mp4.capped?`${label} · MP4 fits within 4K`:`${label} · ${width*scale*factor} × ${height*scale*factor} px`;
  }
  const w=width*scale*Number(resolution.value),h=height*scale*Number(resolution.value);
  const mp4=mp4Dimensions(width,height,scale*Number(resolution.value));
  $("#exportHint").textContent=select.value==="all"
    ? `All ${state.sceneOrder.length} previews together, in their displayed order and layout.`
    : `Active preview: ${sceneFor(state.selectedScene)?.title || "Current preview"}.`;
  $("#exportHint").textContent+=` MP4: ${mp4.width} × ${mp4.height} px${mp4.capped?" (fits within 4K)":""}. GIF: ${w} × ${h} px.`;
}
async function exportVideo(format){
  if (state.exporting || updateLimitNotice()) return;
  stashScene();
  const all=$("#exportScope").value==="all";
  const selection=all ? {
    scenes:orderedScenes().map(item=>({title:item.title,config:clone(item.config),seed:item.seed})),
    columns:previewColumns(),
    fps:state.config.video.fps,
  } : {config:clone(state.config),seed:state.seed};
  selection.resolution_scale=Number($("#exportResolution").value);
  const title=sceneFor(state.selectedScene).title;
  state.exporting=true;updateLimitNotice();updateExportScope();showError(null);
  $("#exportStatus").textContent=all?"Combining all previews…":`Exporting ${title}…`;
  try {
    const request=()=>post("/api/export",{...selection,format,preview_budget:state.previewBudget});
    let response;
    try {response=await request();}
    catch(error) {
      if(error.code!=="preview_limit" || !Number.isSafeInteger(error.requested) || error.requested<=state.previewBudget) throw error;
      if(!await changePreviewBudget(error.requested,all
        ? "The combined download needs this allowance for all previews at the selected resolution."
        : "The download needs this allowance at the selected resolution.")) {
        $("#exportStatus").textContent="Download cancelled.";return;
      }
      response=await request();
    }
    download(await response.blob(),`${all?"all-previews":"stimulus"}.${format}`);
    $("#exportStatus").textContent=all?"All previews downloaded together.":`Downloaded ${title}.`;
  } catch(e){showError(e);$("#exportStatus").textContent="Export failed.";}
  finally{state.exporting=false;updateLimitNotice();updateExportScope();}
}
async function applyConfig(config,seed=state.seed,{fresh=false}={}){
  const target=sceneFor(state.selectedScene),clipRevision=state.clipRevision;
  const result=await (await post("/api/validate",{config,seed})).json();
  if(sceneFor(target.id)!==target) return;
  initializeAppearance(!fresh,result.config);
  // A later clip-length edit wins over an import still being validated.
  if(clipRevision!==state.clipRevision) result.config.video.frames=state.clipFrames;
  Object.assign(target,{config:result.config,seed:result.seed,object:0,ready:false,error:null});
  if(state.selectedScene!==target.id) {
    if(syncClipLength(target.config.video.frames)) {sync();schedule();}
    else {remember();renderWaitingScenes();}
    return;
  }
  state.config=clone(target.config);state.seed=target.seed;state.object=0;state.frame=0;state.timeline=0;state.fineControls.clear();state.sharedOpen.clear();buildControls();schedule();
}
async function init(){
  $("#searchInfo").append(infoButton("Settings search","Search setting names or groups across every object, shared controls, background, canvas, and advanced settings. Edit results directly, or use Open panel to return to a group. Ctrl / Command K focuses search; Enter goes to the first setting; Escape clears search. Spaces type normally in the search box."));
  $("#comparisonInfo").append(infoButton("Comparisons","Select a preview title or use Editing above the settings to switch scenes. Clip length applies to the current preview and every comparison. Other settings and seeds remain individual. Adding or duplicating a comparison selects All previews for downloads. Choose Active preview to download only the selected scene. Move previews earlier or later, rename them, or duplicate them. Save settings and reloads preserve the whole set and its order. Older sets with different lengths use the selected preview's length for all panels."));
  $("#exportInfo").append(infoButton("Downloads","Adding or duplicating a comparison selects All previews. Active preview downloads only the scene marked Editing. All previews combines the displayed grid, order, names, settings, and seeds. Every panel uses the shared Clip length and the active preview's playback speed. Resolution shows the output dimensions: Standard keeps the usual download size; 2×, 4×, and 8× multiply each dimension with crisp pixel scaling, preserving the noise pattern and settings. Preview titles are drawn at the final resolution to keep the lettering smooth. MP4 uses H.264 and fits within landscape or portrait 4K for easier playback, keeping whole-sized stimulus pixels where possible. GIF retains the exact selected resolution. The output dimensions for each format appear below the buttons. MP4 pads odd dimensions by one pixel. Outline, mask, and difference views are viewing aids. Copy Python always uses the active preview."));
  $("#settingsSearch").addEventListener("input",event=>{if(state.config) setSearch(event.target.value);});
  $("#clearSearch").onclick=()=>{setSearch("");focusSearch();};
  $("#viewHelpInfo").append(infoButton("Display options", el("p",{id:"viewHelp"},"Outline and mask are viewing aids. They are never added to exported stimuli.")));
  $(".view-tools").append($("#viewHelpInfo"));
  $("#explanationInfo").append(infoButton("this preview",el("div",{},el("p",{id:"explanation"}),el("p",{id:"motionNote"}))));
  $("#playbackInfo").append(infoButton("Playback shortcuts","The clip loops back to its starting position. Space plays / pauses, even when a control has focus, except while typing a search, preview name, or custom font. Enter activates focused buttons and panel headings. Arrow keys step through frames when no control has focus."));
  $("#examplesInfo").append(infoButton("Examples","Replaces the selected preview's stimulus settings. Clip length is shared, so the example's length also applies to every comparison. Use “Keep for comparison” first to retain the other settings of your current preview."));
  const response=await NMLHosting.request("/api/schema");if(!response.ok)throw new Error("Cannot load the explorer schema. Refresh to retry.");
  const data=await response.json();state.defaults=data.default;state.config=clone(data.default);state.presets=data.presets;
  state.hosted=data.hosted;NMLHosting.setup(data.hosted,remember);
  state.presetDefaults=data.preset_default || data.default;
  state.fonts=data.fonts || [{value:"DejaVu Sans:bold",label:"DejaVu Sans · Bold"}];
  state.exportOptions=data.export_options || {gap:12,title_height:28,base_size:512};
  state.previewBudget=data.preview_budget ?? 16777216;
  $("#raiseLimit").onclick=async()=>{
    const target=previewLimitTarget();
    if(await changePreviewBudget(previewCost(target.config),`This includes ${target.title} at the shared clip length.`)) schedule();
  };
  for(const group of [...data.schema.groups,...data.schema.object])for(const f of group.fields)state.fields.set(`${group.name}.${f.name}`,f);
  state.objectFields = new Set(data.schema.object_fields);
  state.commonFields = new Set([...state.fields.keys()].filter(key=>data.schema.common_appearance_fields.includes(key)));
  if(globalThis.NMLBrowser) {prepareConfig();NMLBrowser.setDefaultConfig(state.config);}
  state.currentScene=createScene({id:0,title:"Current preview",config:state.config});updateComparisons();
  new ResizeObserver(entries=>document.documentElement.style.setProperty("--settings-search-height",`${entries[0].target.getBoundingClientRect().height}px`)).observe($(".settings-search"));
  new ResizeObserver(()=>updateExportScope()).observe($("#screens"));
  // Preserve saved scenes, including the earlier bounce-only sharing format.
  try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved?.config)await restoreSession(saved);}catch(_){state.config=clone(data.default);state.seed=0;}
  buildControls();schedule();requestAnimationFrame(tick);
  $("#play").onclick=()=>play(!state.playing);
  $("#scrub").oninput=()=>{play(false);state.frame=Number($("#scrub").value);state.timeline=state.frame;draw();};
  for(const id of ["outline","zoom","display"])$("#"+id).onchange=()=>{draw();$("#viewHelp").textContent=$("#display").value==="mean"?"Temporal mean averages the whole clip. The outline is hidden in this view.":$("#display").value==="diff"?"Absolute change from the preceding frame. Frame 1 is black because it has no preceding frame.":"Outline and mask are viewing aids. They are never added to exported stimuli.";};
  $("#compare").onclick=keepComparison;
  $("#sceneSelect").onchange=()=>selectScene(Number($("#sceneSelect").value),{focus:false});
  $("#moveSceneEarlier").onclick=()=>moveScene(-1);$("#moveSceneLater").onclick=()=>moveScene(1);
  $("#renameScene").onclick=()=>{$("#sceneRenameForm").hidden=false;$("#sceneName").value=sceneFor(state.selectedScene).title;$("#sceneName").focus();$("#sceneName").select();};
  $("#cancelSceneRename").onclick=()=>{$("#sceneRenameForm").hidden=true;$("#renameScene").focus();};
  $("#sceneRenameForm").onsubmit=event=>{
    event.preventDefault();const name=$("#sceneName").value.trim();if(!name) return;
    sceneFor(state.selectedScene).title=name;$("#sceneRenameForm").hidden=true;updateComparisons();remember();$("#renameScene").focus();announce(`Preview renamed to ${name}.`);
  };
  $("#clearComparisons").onclick=()=>{clearComparisons();($("#compare").disabled ? $("#play") : $("#compare")).focus();announce("All comparisons removed.");};
  $("#reset").onclick=()=>{$("#exportResolution").value="1";clearComparisons();state.currentScene.title="Current preview";updateComparisons();state.nextComparison=1;state.query="";$("#settingsSearch").value="";state.config=clone(state.defaults);state.seed=0;state.object=0;state.frame=0;state.timeline=0;state.fineControls.clear();state.tab="appearance";state.objectTab="shape";state.advancedTab="camera";state.sharedOpen.clear();$("#canvasSettings").open=false;$("#display").value="video";$("#outline").checked=false;$("#zoom").value="fit";$("#viewHelp").textContent="Outline and mask are viewing aids. They are never added to exported stimuli.";play(true);buildControls();schedule();};
  $("#save").onclick=()=>download(new Blob([JSON.stringify(savedSession(),null,2)],{type:"application/json"}),"stimulus.json");
  $("#load").onclick=()=>$("#importFile").click();
  $("#importFile").onchange=async()=>{try{const file=$("#importFile").files[0];if(!file)return;const parsed=JSON.parse(await file.text());await restoreSession(parsed);}catch(e){showError(e);}finally{$("#importFile").value="";}};
  $("#mp4").onclick=()=>exportVideo("mp4");$("#gif").onclick=()=>exportVideo("gif");
  $("#exportScope").onchange=()=>{updateExportScope();$("#exportStatus").textContent="";};
  $("#exportResolution").onchange=()=>{updateExportScope();$("#exportStatus").textContent="";};
  $("#python").onclick=async()=>{
    const config=JSON.stringify(state.config);
    const source=`import json\nimport nml\nfrom nml import viz\n\ncfg = nml.StimulusCfg.from_dict(json.loads(${JSON.stringify(config)}))\nsample = nml.generate(cfg, seed=${state.seed})\nviz.save_mp4(sample.frames, "stimulus.mp4", fps=cfg.video.fps)\n`;
    try{await navigator.clipboard.writeText(source);$("#exportStatus").textContent="Python copied.";}catch(_){download(new Blob([source],{type:"text/x-python"}),"stimulus.py");}
  };
  for(const name of Object.keys(state.presets))$("#preset").append(el("option",{value:name},name));
  $("#preset").onchange=async()=>{const name=$("#preset").value;if(!name)return;const cfg=clone(state.presetDefaults);for(const [path,value] of Object.entries(state.presets[name]))set(cfg,path,value);try{await applyConfig(cfg,state.seed,{fresh:true});}catch(e){showError(e);}$("#preset").value="";};
  document.addEventListener("keydown",playbackKeydown,{capture:true});
  document.addEventListener("keyup",event=>{
    // Buttons and checkboxes can activate on release; suppress that action too.
    if (isSpace(event) && event.target.id!=="settingsSearch" && !event.target.matches("[data-text-entry]")) { event.preventDefault(); event.stopPropagation(); }
  },{capture:true});
  NMLHosting.ready();
}
init().catch((e)=>{$("#status").textContent="Unable to start";showError(e);});
