import "./account-surfaces.css";
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Tracked } from '../lib/coucou/anim';
import { ROUNDED_CORNER, EXPANDED_CORNER } from '../lib/coucou/layout';
import { greetingPose } from '../lib/coucou/greetingPose';
import slimeCenters from '../lib/coucou/slimeCenters.json';
import { ICONS } from '../lib/coucou/icons';
import { CompanionIsland, COMPACT_COMPANION, companionSize, companionPosition } from '../lib/companionIsland';
import { appStorage } from '../lib/appStorage';
import { savedSlimeColor, slimeAnimations, slimeColors, type SlimeAnimation, type SlimeColor } from '../lib/dowzy';
import { slimeLevel, slimeXp, TEEN_LEVEL, ADULT_LEVEL, SAGE_LEVEL, type SlimeProgress, type SlimeStage } from '../lib/slimeProgress';
import { appUpdates } from '../lib/nativeUpdates';
import blueSheet from '../assets/dowzy/blue.png';
import yellowSheet from '../assets/dowzy/yellow.png';
import redSheet from '../assets/dowzy/red.png';
import greenSheet from '../assets/dowzy/green.png';
import whiteSheet from '../assets/dowzy/white.png';
import blackSheet from '../assets/dowzy/black.png';
import orangeSheet from '../assets/dowzy/orange.png';
import purpleSheet from '../assets/dowzy/purple.png';
const slimeSheets = { blue: blueSheet, yellow: yellowSheet, red: redSheet, green: greenSheet, white: whiteSheet, black: blackSheet, orange: orangeSheet, purple: purpleSheet } satisfies Record<SlimeColor, string>;
const evolutionSheets = import.meta.glob<string>('../assets/dowzy/*/*.png', { eager: true, import: 'default', query: '?url' });
function sheetFor(color: SlimeColor, stage: SlimeStage) {
  if (stage === 'baby') return slimeSheets[color];
  const sheet = evolutionSheets[`../assets/dowzy/${stage}/${color}.png`];
  if (!sheet) throw new Error(`Animation Dowzy absente : ${stage}/${color}`);
  return sheet;
}
const stages = [{id:'baby',label:'Bébé',level:0},{id:'teen',label:'Ado',level:TEEN_LEVEL},{id:'adult',label:'Adulte',level:ADULT_LEVEL},{id:'sage',label:'Grand sage',level:SAGE_LEVEL}] as const;
import './dowzy.css';

export function SlimeSprite({ color = 'green', animation = 'idle', gaze, stage = 'baby', size = 96, active = true, centered = false }: { centered?: boolean; active?: boolean; stage?: SlimeStage; color?: SlimeColor; animation?: SlimeAnimation; gaze?: number; size?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let current = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const durations = slimeAnimations[animation].durations;
    const schedule = () => {
      clearTimeout(timer);
      if (!active || document.hidden || reduced.matches || gaze !== undefined) return;
      timer = setTimeout(() => { current = (current + 1) % durations.length; setFrame(current); schedule(); }, durations[current]);
    };
    setFrame(0); schedule();
    document.addEventListener('visibilitychange', schedule); reduced.addEventListener('change', schedule);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); reduced.removeEventListener('change', schedule); };
  }, [animation, gaze, active]);
  const row = gaze === undefined ? slimeAnimations[animation].row : 9 + Math.floor(gaze / 8);
  const col = gaze === undefined ? frame % slimeAnimations[animation].durations.length : gaze % 8;
  const height = size * 208 / 192;
  const center = (slimeCenters as Record<string, number[]>)[`${stage}/${color}`];
  const style = { width: size, height, backgroundImage: `url(${sheetFor(color, stage)})`, backgroundSize: `${size * 8}px ${height * 11}px`, backgroundPosition: `${-col * size}px ${-row * height}px`, transform: centered ? `translate(${size/2-center[0]*size/192}px,${height/2-center[1]*size/192}px)` : undefined } satisfies CSSProperties;
  return <span className="dowzy-sprite" style={style} aria-hidden="true" />;
}

/** Island shell and motion from Coucou's Linux client (MIT, a7bd575). */
export function DowzyMascot({ accountId, progress, onOpenAssistant }: { accountId: string; progress: SlimeProgress; onOpenAssistant?: () => void }) {
  const [color,setColor]=useState(()=>savedSlimeColor(accountId));
  const [preview,setPreview]=useState<SlimeColor>();
  const selectedLevel=slimeLevel(slimeXp(progress,color));
  const shownColor=preview??color;
  const shownLevel=slimeLevel(slimeXp(progress,shownColor));
  const [island]=useState(()=>new CompanionIsland());
  const [mode,setMode]=useState(island.mode);
  const [view,setView]=useState<'overview'|'wardrobe'|'settings'>('overview');
  const expanded=mode==='home'||mode==='coucou';
  const greeting=mode==='coucou';
  const [animation,setAnimation]=useState<SlimeAnimation>('idle');
  const [gaze,setGaze]=useState<number>();
  const [emote,setEmote]=useState<'love'|'slap'|'dizzy'|null>(null);
  const [evolving,setEvolving]=useState(false);
  const [pinned,setPinned]=useState(false);
  const [closeDelay,setCloseDelay]=useState(()=>{
    const v=Number(appStorage.getItem(`dowze.mascot.${accountId}.close-delay`));return [5,15,30,60].includes(v)?v:15;
  });
  const shell=useRef<HTMLDivElement>(null),pet=useRef<HTMLButtonElement>(null),countdown=useRef<HTMLSpanElement>(null);
  const compactButton=useRef<HTMLButtonElement>(null),homeButton=useRef<HTMLButtonElement>(null);
  const inside=useRef(false),keyboardHeld=useRef(false),pinnedRef=useRef(false);
  const reaction=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),love=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const pokes=useRef({count:0,time:0});
  const previousForm=useRef({color,stage:selectedLevel.stage});
  const geometry=useRef({w:new Tracked(COMPACT_COMPANION.w),h:new Tracked(COMPACT_COMPANION.h),r:new Tracked(ROUNDED_CORNER),x:new Tracked(COMPACT_COMPANION.w/2),y:new Tracked(COMPACT_COMPANION.h/2),d:new Tracked(COMPACT_COMPANION.diameter)});
  const islandId=useId();
  useEffect(()=>{
    island.onChange=next=>{
      setMode(next);setPreview(undefined);
      if(next==='home'&&!inside.current&&!island.held) island.leave();
      if(next==='petit'&&!inside.current) island.leave();
    };
    island.launch();
    return()=>{island.dispose();clearTimeout(reaction.current);clearTimeout(love.current);};
  },[island]);
  useEffect(()=>{island.homeToPetitDelay=closeDelay;},[island,closeDelay]);
  useEffect(()=>{
    const previous=previousForm.current;previousForm.current={color,stage:selectedLevel.stage};
    appStorage.setItem('dowze.mascot.launch-stage',selectedLevel.stage);
    if(previous.color!==color||stages.findIndex(s=>s.id===selectedLevel.stage)<=stages.findIndex(s=>s.id===previous.stage)) return;
    setEvolving(true);setAnimation('jump');island.alert();
    const timer=setTimeout(()=>{setEvolving(false);setAnimation('idle');},1400);return()=>clearTimeout(timer);
  },[color,selectedLevel.stage,island]);
  useEffect(()=>{
    const update=()=>{const phase=appUpdates.snapshot().phase;
      if(phase==='downloading'||phase==='checking') island.reveal();
      if(phase==='error') island.alert();
      setAnimation(phase==='downloading'?'working':phase==='checking'?'review':phase==='error'?'failed':'idle');
    };update();return appUpdates.subscribe(update);
  },[island]);
  // Use upstream spring/close curve for width, height, radius AND shared pet.
  // Run only until geometry settles; no permanent geometry animation loop once settled.
  useEffect(()=>{
    const g=geometry.current;
    const layoutView=greeting?'greeting':view;
    const target=companionSize(expanded,layoutView);
    target.w=Math.min(target.w,Math.max(260,(shell.current?.parentElement?.clientWidth||window.innerWidth)-28));
    const pos=companionPosition(expanded,layoutView,target.h);
    const shrinking=target.h<g.h.value||target.w<g.w.value;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const values={w:target.w,h:target.h,r:expanded?EXPANDED_CORNER:ROUNDED_CORNER,x:pos.cx,y:pos.cy,d:pos.diameter};
    for(const key of Object.keys(values) as (keyof typeof values)[]){
      const v=values[key];if(reduced)g[key].jump(v);else if(shrinking)g[key].curveTowards(v);else g[key].springTo(v);
    }
    let frame=0,last=performance.now();const start=last;
    const draw=(now:number)=>{
      const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
      Object.values(g).forEach(v=>v.step(dt,now));
      let x=g.x.value,y=g.y.value,d=g.d.value,sx=1,sy=1;
      if(greeting){const p=greetingPose(reduced?3.5:(now-start)/1000);x=p.x+(g.w.value-640)/2;y=p.y;d=p.hb;sx=p.sx;sy=p.sy;}
      const el=shell.current;
      if(el){el.style.width=`${g.w.value}px`;el.style.height=`${Math.max(0,g.h.value)}px`;el.style.borderRadius=`0 0 ${g.r.value}px ${g.r.value}px`;}
      if(pet.current){pet.current.style.left=`${x}px`;pet.current.style.top=`${y}px`;pet.current.style.transform=`translate(-50%,-50%) scale(${Math.max(0,d/69)*sx},${Math.max(0,d/69)*sy})`;}
      if(Object.values(g).some(v=>v.animating)||(greeting&&!reduced&&now-start<4600)) frame=requestAnimationFrame(draw);
    };draw(last);return()=>cancelAnimationFrame(frame);
  },[mode,view,expanded,greeting]);
  useEffect(()=>{
    if(!expanded)return;
    const move=(e:PointerEvent)=>{if(e.pointerType==='touch'||emote||greeting)return;const rect=pet.current?.getBoundingClientRect();if(!rect)return;
      const angle=(Math.atan2(e.clientX-rect.left-rect.width/2,-(e.clientY-rect.top-rect.height/2))*180/Math.PI+360)%360;
      const next=Math.round(angle/22.5)%16;setGaze(old=>old===next?old:next);
    };
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setView('overview');setPreview(undefined);keyboardHeld.current=false;island.held=pinnedRef.current;island.collapse();compactButton.current?.focus();}};
    document.addEventListener('pointermove',move);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('keydown',escape);};
  },[expanded,island,emote,greeting]);
  // Only animate the 2px auto-close indicator while a countdown is visible.
  useEffect(()=>{
    if(mode!=='home'||pinned)return;
    const timer=setInterval(()=>{if(countdown.current){const due=island.homeCollapseDueAt;countdown.current.style.width=due===null?'0':`${Math.max(0,Math.min(1,(due-performance.now())/(closeDelay*1000)))*100}%`; }},100);
    return()=>clearInterval(timer);
  },[mode,pinned,island,closeDelay]);
  const choose=(next:SlimeColor)=>{appStorage.setItem(`dowze.mascot.${accountId}.color`,next);appStorage.setItem('dowze.mascot.launch-color',next);setColor(next);setPreview(undefined);setAnimation('jump');clearTimeout(reaction.current);reaction.current=setTimeout(()=>setAnimation('idle'),850);};
  const navigate=(next:typeof view)=>{setPreview(undefined);setView(next);island.forceHome();};
  const collapse=()=>{keyboardHeld.current=false;island.held=pinnedRef.current;setView('overview');setPreview(undefined);island.collapse();};
  const poke=()=>{
    if(!expanded){island.click();return;}
    setGaze(undefined);clearTimeout(reaction.current);clearTimeout(love.current);
    const now=Date.now();pokes.current.count=now-pokes.current.time<1700?pokes.current.count+1:1;pokes.current.time=now;
    const dizzy=pokes.current.count>=3;setEmote(dizzy?'dizzy':'slap');setAnimation(dizzy?'failed':'jump');
    reaction.current=setTimeout(()=>{setEmote(null);setAnimation('idle');pokes.current.count=0;},dizzy?3300:800);
  };
  return <div className="dowzy-island-host">
    <div ref={shell} className={`dowzy-island mode-${mode} view-${greeting?'greeting':view} ${expanded?'is-expanded':''} ${evolving?'is-evolving':''}`} data-state={mode}
      onPointerEnter={()=>{inside.current=true;island.enter();}}
      onPointerLeave={()=>{inside.current=false;keyboardHeld.current=!!shell.current?.querySelector(':focus-visible');island.held=pinnedRef.current||keyboardHeld.current;island.leave();setPreview(undefined);setGaze(undefined);clearTimeout(love.current);setEmote(null);}}
      onFocusCapture={e=>{if(e.target.matches(':focus-visible')){keyboardHeld.current=true;island.held=true;}}}
      onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){keyboardHeld.current=false;island.held=pinnedRef.current;if(!inside.current)island.leave();}}}>
      <div className="dowzy-island-clip">
        <button ref={compactButton} className="dowzy-island-trigger" aria-label={`Afficher Dowzy, niveau ${selectedLevel.level}`} aria-expanded={expanded} aria-controls={islandId} tabIndex={expanded?-1:0} aria-hidden={expanded} onClick={e=>{island.click();if(e.detail===0)requestAnimationFrame(()=>homeButton.current?.focus());}} />
        <div className="dowzy-island-content" id={islandId} inert={!expanded||greeting} aria-hidden={!expanded||greeting}>
          <div className="dowzy-island-header">
            <nav aria-label="Dowzy"><button ref={homeButton} className={view==='overview'?'on':''} aria-label="Accueil de Dowzy" onClick={()=>navigate('overview')}><CoucouIcon name="house"/></button>
              {onOpenAssistant&&<button aria-label="Ouvrir l’assistant" onClick={()=>{onOpenAssistant();collapse();}}><CoucouIcon name="bubble"/></button>}
              <button className={view==='wardrobe'?'on':''} aria-label="Personnaliser Dowzy" aria-pressed={view==='wardrobe'} onClick={()=>navigate('wardrobe')}><CoucouIcon name="plus"/></button></nav>
            <div className="dowzy-header-actions"><button aria-label="Réglages de Dowzy" aria-pressed={view==='settings'} onClick={()=>navigate('settings')}><CoucouIcon name="gear"/></button><button aria-label="Rétracter Dowzy" onClick={collapse}><CoucouIcon name="chevronUp" stroke/></button></div>
          </div>
          <div className="dowzy-island-views">
            <div className={`dowzy-island-view ${view==='overview'?'on':''}`} inert={view!=='overview'} aria-hidden={view!=='overview'}>
              <div className="dowzy-overview-grid"><section className="dowzy-card dowzy-main-card"><div className="dowzy-card-copy"><strong>Dowzy <span>Niveau {selectedLevel.level}</span></strong><span className="dowzy-note">{stages.find(s=>s.id===selectedLevel.stage)!.label} · {slimeColors.find(c=>c.id===color)!.label}</span><progress className="dowzy-xp-bar" max={selectedLevel.required} value={selectedLevel.current} aria-label={`Dowzy niveau ${selectedLevel.level}, ${selectedLevel.current} XP sur ${selectedLevel.required}`}/><small>{selectedLevel.current} / {selectedLevel.required} XP</small></div></section>
</div>
            </div>
            <div className={`dowzy-island-view ${view==='wardrobe'?'on':''}`} inert={view!=='wardrobe'} aria-hidden={view!=='wardrobe'}>
              <section className="dowzy-card dowzy-wardrobe" aria-label="Couleur du slime"><div className="dowzy-wardrobe-body"><div className="dowzy-wardrobe-title"><strong>Couleurs</strong><span>{slimeColors.find(c=>c.id===shownColor)!.label}</span></div>{expanded&&view==='wardrobe'&&<div className="dowzy-color-grid">{slimeColors.map(c=><button key={c.id} title={c.label} aria-label={c.label} aria-pressed={color===c.id} onPointerEnter={()=>setPreview(c.id)} onPointerLeave={()=>setPreview(undefined)} onFocus={()=>setPreview(c.id)} onBlur={()=>setPreview(undefined)} onClick={()=>choose(c.id)}><SlimeSprite color={c.id} stage={slimeLevel(slimeXp(progress,c.id)).stage} size={32} active={false} centered/></button>)}</div>}</div></section>
            </div>
            <div className={`dowzy-island-view ${view==='settings'?'on':''}`} inert={view!=='settings'} aria-hidden={view!=='settings'}>
              <section className="dowzy-card dowzy-settings-card"><div className="dowzy-settings-body"><label>Rétracter après <select aria-label="Délai de rétraction de Dowzy" value={closeDelay} onChange={e=>{const v=Number(e.target.value);setCloseDelay(v);appStorage.setItem(`dowze.mascot.${accountId}.close-delay`,String(v));}}>{[5,15,30,60].map(n=><option key={n} value={n}>{n} secondes</option>)}</select></label><label><input type="checkbox" checked={pinned} onChange={e=>{const v=e.target.checked;pinnedRef.current=v;setPinned(v);island.held=v||keyboardHeld.current;}}/>Garder ouvert</label><small>1 XP/min d’activité · 3 000 XP/jour maximum.<br/>Cours, exercices et objectifs complètent tes gains.</small></div></section>
            </div>
          </div>
        </div>
        <div className="dowzy-greeting-card" aria-hidden="true" />
        <button ref={pet} className={`dowzy-shared-pet ${emote?`emote-${emote}`:''}`} aria-label={expanded?'Saluer Dowzy':`Afficher Dowzy, niveau ${selectedLevel.level}`} tabIndex={expanded&&!greeting?0:-1} aria-hidden={!expanded||greeting}
          onClick={poke} onPointerEnter={()=>{if(!expanded||greeting)return;clearTimeout(love.current);love.current=setTimeout(()=>{setGaze(undefined);setEmote('love');setAnimation('wave');},1900);}} onPointerLeave={()=>{clearTimeout(love.current);setEmote(null);setAnimation('idle');}}
          onContextMenu={e=>{e.preventDefault();navigate(view==='wardrobe'?'overview':'wardrobe');}}>
          <span className="dowzy-pet-emote"><SlimeSprite color={shownColor} stage={shownLevel.stage} animation={greeting?'wave':animation} gaze={greeting||emote?undefined:gaze} size={96} active centered/>{emote==='love'&&<span className="dowzy-hearts" aria-hidden="true">♥</span>}</span>
        </button>
        <span ref={countdown} className="dowzy-countdown" aria-hidden="true" />
        {evolving&&<span className="dowzy-evolution-notice" role="status">Dowzy évolue !</span>}
      </div>
    </div>
  </div>;
}
function CoucouIcon({name,stroke=false}:{name:keyof typeof ICONS;stroke?:boolean}){return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} fill={stroke?'none':'currentColor'} stroke={stroke?'currentColor':'none'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>;}
