/** Foreground-only scheduler. A frozen WebView is not an always-on compute node. */
export function startBrowserWorkerLoop(options:{
 run:()=>Promise<boolean>; visible:()=>boolean; online:()=>boolean;
 events:Pick<EventTarget,'addEventListener'|'removeEventListener'>;
 onError:()=>void;
}){
 let stopped=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined,delay=20_000;
 const clear=()=>{if(timer!==undefined){clearTimeout(timer);timer=undefined;}};
 const schedule=()=>{if(!stopped&&options.visible()&&options.online())timer=setTimeout(tick,delay);};
 const tick=async()=>{
  clear();if(stopped||busy||!options.visible()||!options.online())return;
  busy=true;
  try{const completed=await options.run();delay=completed?20_000:Math.min(delay*2,300_000);}
  catch{delay=Math.min(Math.max(delay*2,60_000),300_000);if(!stopped)options.onError();}
  finally{busy=false;schedule();}
 };
 const wake=()=>{clear();if(options.visible()&&options.online()){delay=20_000;void tick();}};
 for(const event of ['visibilitychange','online','offline'])options.events.addEventListener(event,wake);
 void tick();
 return()=>{stopped=true;clear();for(const event of ['visibilitychange','online','offline'])options.events.removeEventListener(event,wake);};
}
