import {afterEach,expect,it,vi} from 'vitest';
import {startBrowserWorkerLoop} from './browserWorkerLoop';
afterEach(()=>vi.useRealTimers());
it('backs off an empty queue and resumes immediately when the WebView becomes visible',async()=>{
 vi.useFakeTimers();const events=new EventTarget();let visible=true;
 const run=vi.fn(async()=>false),stop=startBrowserWorkerLoop({run,visible:()=>visible,online:()=>true,events,onError:vi.fn()});
 await vi.advanceTimersByTimeAsync(0);expect(run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(39_999);expect(run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);
 visible=false;events.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(600_000);expect(run).toHaveBeenCalledTimes(2);
 visible=true;events.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);
 expect(run).toHaveBeenCalledTimes(3);stop();await vi.advanceTimersByTimeAsync(600_000);expect(run).toHaveBeenCalledTimes(3);
});
it('does not overlap an in-flight task or start more work after stop',async()=>{
 vi.useFakeTimers();const events=new EventTarget();let finish!:(v:boolean)=>void;
 const run=vi.fn(()=>new Promise<boolean>(r=>{finish=r;}));
 const stop=startBrowserWorkerLoop({run,visible:()=>true,online:()=>true,events,onError:vi.fn()});
 events.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(600_000);expect(run).toHaveBeenCalledTimes(1);
 stop();finish(true);await vi.advanceTimersByTimeAsync(600_000);expect(run).toHaveBeenCalledTimes(1);
});
it('does not poll offline and bounds retries after transport failure',async()=>{
 vi.useFakeTimers();const events=new EventTarget();let online=false;const onError=vi.fn(),run=vi.fn(async()=>{throw Error('unavailable');});
 const stop=startBrowserWorkerLoop({run,visible:()=>true,online:()=>online,events,onError});
 await vi.advanceTimersByTimeAsync(600_000);expect(run).not.toHaveBeenCalled();
 online=true;events.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);expect(onError).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(59_999);expect(run).toHaveBeenCalledTimes(1);stop();
});
