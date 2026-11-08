import { Spring,TOKENS,selectorScale,clamp,nextTab } from '../lib/liquid/liquid-motion.mjs';
import { OpticsRenderer } from '../lib/liquid/optics.mjs';
import { NavigationTexture } from '../lib/liquid/nav-texture.mjs';
import profile from '../lib/liquid/profile.json';

export function initLiquidNavigation(stage,{motionEnabled}) {
  if(!stage)return;
  const dock=stage.querySelector('nav'),links=[...dock.querySelectorAll('[data-liquid-tab]')];
  const source=stage.querySelector('.liquid-source'),canvas=stage.querySelector('.liquid-optics'),selector=stage.querySelector('.liquid-selector');
  const context=source.getContext('2d',{alpha:false});
  if(!context||!links.length)return;
  let renderer,texture;
  try{renderer=new OpticsRenderer(canvas);texture=new NavigationTexture(stage,dock);}catch{return;}
  const selected=links.findIndex(link=>link.getAttribute('aria-current')==='page');
  const index=new Spring({...TOKENS.springs.index,value:Math.max(0,selected)}),velocity=new Spring(TOKENS.springs.velocity),press=new Spring(TOKENS.springs.press),scaleX=new Spring({...TOKENS.springs.scaleX,value:1}),scaleY=new Spring({...TOKENS.springs.scaleY,value:1});
  const transparency=matchMedia('(prefers-reduced-transparency: reduce)'),contrast=matchMedia('(forced-colors: active)');
  let geometry,revision=0,frame=0,last=0,gesture=null,keyboard=null,releasing=false,suppressUntil=0,focusPreview=false,destroyed=false,dprQuery;
  const opaque=()=>transparency.matches||contrast.matches;
  const request=()=>{if(!frame&&!document.hidden&&!destroyed)frame=requestAnimationFrame(draw);};
  const setPress=on=>{
    press.retarget(on?1:0);scaleX.retarget(on?profile.normal.selectorPressedScale:1);scaleY.retarget(on?profile.normal.selectorPressedScale:1);request();
  };
  const release=()=>{releasing=true;request();};
  const currentIndex=()=>Math.max(0,selected);
  const cancel=()=>{
    const id=gesture?.id;gesture=null;keyboard=null;focusPreview=false;index.retarget(currentIndex());release();
    if(id!==undefined&&dock.hasPointerCapture(id))dock.releasePointerCapture(id);
  };
  function measure() {
    if(gesture)cancel();
    const rect=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,profile.normal.dprCap);
    geometry={width:rect.width,height:rect.height,dpr,tabs:links.map(link=>{const r=link.getBoundingClientRect();return{x:r.left-rect.left,y:r.top-rect.top,w:r.width,h:r.height};})};
    source.width=Math.max(1,Math.round(rect.width*dpr));source.height=Math.max(1,Math.round(rect.height*dpr));
    context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle=getComputedStyle(document.body).backgroundColor;context.fillRect(0,0,rect.width,rect.height);
    revision++;texture.invalidate();request();
  }
  function draw(time) {
    frame=0;if(!geometry||document.hidden||destroyed)return;
    const dt=last?Math.min((time-last)/1000,.064):1/60;last=time;
    const reduced=!motionEnabled();
    if(reduced) {index.snap(index.target);velocity.snap(0);press.snap(press.target);scaleX.snap(1);scaleY.snap(1);}
    else {index.step(dt);velocity.retarget(index.velocity/Math.max(1,links.length-1));velocity.step(dt);press.step(dt);scaleX.step(dt);scaleY.step(dt);}
    if(releasing&&Math.abs(index.value-index.target)<profile.deformation.releaseDistanceFraction){releasing=false;setPress(false);}
    const i=clamp(index.value,0,links.length-1),low=Math.floor(i),high=Math.min(links.length-1,low+1),fraction=i-low,a=geometry.tabs[low],b=geometry.tabs[high];
    const base={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,w:a.w+(b.w-a.w)*fraction,h:a.h+(b.h-a.h)*fraction};
    const scale=reduced?{x:1,y:1}:selectorScale(scaleX.value,scaleY.value,velocity.value);
    const lens={x:base.x-base.w*(scale.x-1)/2,y:base.y-base.h*(scale.y-1)/2,w:base.w*scale.x,h:base.h*scale.y,r:base.h*scale.y/2,pressure:press.value,velocity:velocity.value};
    Object.assign(selector.style,{left:`${lens.x}px`,top:`${lens.y}px`,width:`${lens.w}px`,height:`${lens.h}px`});
    stage.dataset.ready='true';stage.dataset.showSelector=String(selected>=0||!!gesture||!!keyboard||focusPreview||press.value>.002);
    stage.dataset.opaque=String(opaque());
    const active=renderer.available&&!opaque()&&press.value>profile.normal.contentCapturePressureThreshold;
    let rendered=false;
    if(active) {
      const captured=texture.update(source,{dpr:geometry.dpr,revision,selected});
      rendered=renderer.render(captured.canvas,[lens],{dpr:geometry.dpr,refraction:profile.normal.refraction,dispersion:profile.normal.dispersion,blur:profile.normal.backgroundBlurCssPx*profile.normal.navigationBlurMultiplier,content:true,tint:profile.normal.tint,revision:captured.revision,light:[.2,.12]});
    } else renderer.clear();
    stage.dataset.opticsActive=String(active&&rendered);
    stage.dataset.pressure=press.value.toFixed(3);
    stage.dataset.index=index.value.toFixed(3);
    stage.dataset.renderer=renderer.available?'webgl':'fallback';
    if(releasing||![index,velocity,press,scaleX,scaleY].every(spring=>spring.settled))request();else last=0;
  }
  const targetAt=clientX=>{
    const rect=stage.getBoundingClientRect(),a=geometry.tabs[0],b=geometry.tabs.at(-1);
    return clamp((clientX-rect.left-a.x-a.w/2)/Math.max(1,b.x+b.w/2-a.x-a.w/2)*(links.length-1),0,links.length-1);
  };
  const navigate=i=>{const link=links[clamp(Math.round(i),0,links.length-1)];if(new URL(link.href).pathname!==location.pathname)location.assign(link.href);};
  dock.addEventListener('dragstart',event=>event.preventDefault());
  dock.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||gesture||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('[data-liquid-tab]');if(!link)return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};keyboard=null;releasing=false;focusPreview=false;
    index.retarget(links.indexOf(link));setPress(true);dock.setPointerCapture(event.pointerId);
  });
  dock.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragging&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*1.4){cancel();return;}
    if(Math.abs(dx)>6)gesture.dragging=true;
    if(gesture.dragging){index.retarget(targetAt(event.clientX));request();}
  });
  dock.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const destination=Math.round(index.target),id=gesture.id;gesture=null;suppressUntil=performance.now()+450;
    index.retarget(destination);release();if(dock.hasPointerCapture(id))dock.releasePointerCapture(id);navigate(destination);
  });
  for(const event of ['pointercancel','lostpointercapture'])dock.addEventListener(event,()=>{if(gesture)cancel();});
  dock.addEventListener('click',event=>{
    if(event.detail!==0&&performance.now()<suppressUntil){event.preventDefault();event.stopPropagation();}
    else if(event.detail===0){const link=event.target.closest('[data-liquid-tab]');if(link){if(new URL(link.href).pathname===location.pathname)event.preventDefault();index.retarget(links.indexOf(link));request();}}
  },true);
  dock.addEventListener('keydown',event=>{
    const link=event.target.closest('[data-liquid-tab]');if(!link)return;
    const i=links.indexOf(link);
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=nextTab(i,event.key,links.length);links[next].focus();focusPreview=true;index.retarget(next);request();}
    if((event.key==='Enter'||event.key===' ')&&!event.repeat){if(event.key===' ')event.preventDefault();keyboard={key:event.key,index:i};releasing=false;index.retarget(i);setPress(true);}
  });
  dock.addEventListener('keyup',event=>{if(keyboard&&event.key===keyboard.key){const held=keyboard;keyboard=null;release();if(held.key===' '){event.preventDefault();navigate(held.index);}}});
  dock.addEventListener('focusout',event=>{if(!dock.contains(event.relatedTarget)&&!gesture){keyboard=null;focusPreview=false;index.retarget(currentIndex());release();}});
  const resized=new ResizeObserver(measure);resized.observe(stage);
  const theme=new MutationObserver(measure);theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});theme.observe(document.body,{attributes:true,attributeFilter:['class','style']});
  const fonts=()=>{texture.invalidate();request();};document.fonts?.addEventListener('loadingdone',fonts);document.fonts?.ready?.then(fonts);
  const dprChanged=()=>{dprQuery?.removeEventListener('change',dprChanged);dprQuery=matchMedia(`(resolution: ${devicePixelRatio}dppx)`);dprQuery.addEventListener('change',dprChanged);measure();};
  for(const query of [transparency,contrast])query.addEventListener('change',request);
  document.addEventListener('insulin:motionchange',()=>{cancel();request();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();press.snap(0);scaleX.snap(1);scaleY.snap(1);velocity.snap(0);cancelAnimationFrame(frame);frame=0;last=0;stage.dataset.opticsActive='false';}else{last=0;measure();}});
  canvas.addEventListener('webglcontextlost',()=>{stage.dataset.opticsActive='false';stage.dataset.renderer='fallback';});
  canvas.addEventListener('webglcontextrestored',()=>{texture.invalidate();request();});
  addEventListener('pageshow',()=>{gesture=null;keyboard=null;releasing=false;focusPreview=false;index.snap(currentIndex());press.snap(0);scaleX.snap(1);scaleY.snap(1);velocity.snap(0);last=0;stage.dataset.opticsActive='false';measure();});
  addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;last=0;if(!event.persisted){destroyed=true;resized.disconnect();theme.disconnect();dprQuery?.removeEventListener('change',dprChanged);document.fonts?.removeEventListener('loadingdone',fonts);texture.destroy();renderer.destroy();}});
  dprChanged();
}
