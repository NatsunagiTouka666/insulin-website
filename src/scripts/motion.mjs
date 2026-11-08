import { Spring } from '../lib/liquid/liquid-motion.mjs';

export const motionEnabled = () => document.documentElement.dataset.motion === 'full';
export function initMotion() {
  const root=document.documentElement, media=matchMedia('(prefers-reduced-motion: reduce)');
  const toggle=document.querySelector('[data-motion-toggle]');
  const labels=toggle?.dataset.lang==='en' ? ['Motion: Auto','Motion: Full','Motion: Reduced'] : ['动效：跟随系统','动效：完整','动效：减少'];
  const modes=['auto','full','reduced'];
  let preference=root.dataset.motionPreference || 'auto';
  const update=() => {
    root.dataset.motion=preference==='reduced'||preference==='auto'&&media.matches?'reduced':'full';
    root.dataset.motionPreference=preference;
    if(toggle) { toggle.textContent=labels[modes.indexOf(preference)]; toggle.setAttribute('aria-label',toggle.textContent); }
    document.dispatchEvent(new Event('insulin:motionchange'));
  };
  toggle?.addEventListener('click',()=>{preference=modes[(modes.indexOf(preference)+1)%3];try{localStorage.setItem('insulin-motion',preference);}catch{}update();});
  media.addEventListener('change',update);
  update();

  const elements=[...document.querySelectorAll('.section-space,.archive-entry,.member-list>li,.featured-photo,.next-section')];
  if(typeof IntersectionObserver==='function') {
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -20px 0px',threshold:.04});
    elements.forEach((element,i)=>{element.dataset.reveal='';element.style.setProperty('--reveal-delay',`${Math.min(i%3*35,70)}ms`);observer.observe(element);});
    root.classList.add('motion-ready');
    document.addEventListener('insulin:motionchange',()=>{if(!motionEnabled())elements.forEach(el=>el.classList.add('is-visible'));});
    addEventListener('pagehide',event=>{if(!event.persisted)observer.disconnect();});
  }

  document.querySelectorAll('.text-link,.language-switch,.to-top,.lightbox button').forEach(element=>{
    const spring=new Spring({value:1,stiffness:600,dampingRatio:.8});
    let frame=0,last=0,active=false;
    const draw=time=>{
      const dt=last?Math.min((time-last)/1000,.064):1/60;last=time;
      spring.step(dt);element.style.scale=String(spring.value);
      if(!spring.settled)frame=requestAnimationFrame(draw);else{frame=0;last=0;if(!active)element.style.scale='';}
    };
    const press=on=>{active=on;spring.retarget(on && motionEnabled() ? .94 : 1);if(!frame)frame=requestAnimationFrame(draw);};
    element.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0)press(true);});
    for(const event of ['pointerup','pointercancel','pointerleave','blur'])element.addEventListener(event,()=>press(false));
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')press(true);});
    element.addEventListener('keyup',()=>press(false));
    document.addEventListener('insulin:motionchange',()=>{if(!motionEnabled()){spring.snap(1);element.style.scale='';}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){active=false;spring.snap(1);cancelAnimationFrame(frame);frame=0;last=0;element.style.scale='';}});
  });
}

let imageAnimation;
export function animateImage(image,opener=null) {
  imageAnimation?.cancel();
  if(!motionEnabled()||!image.animate)return;
  let first={opacity:.35,transform:'translateY(8px) scale(.98)'};
  if(opener) {
    const a=opener.querySelector('img')?.getBoundingClientRect(),b=image.getBoundingClientRect();
    if(a&&a.width&&b.width&&a.bottom>0&&a.top<innerHeight) first={opacity:.65,transformOrigin:'0 0',transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width},${a.height/b.height})`};
  }
  imageAnimation=image.animate([first,{opacity:1,transformOrigin:first.transformOrigin||'50% 50%',transform:'none'}],{duration:opener?540:320,easing:'cubic-bezier(.2,.7,.2,1)'});
}
