import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
import {findBrowser} from './browser.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const phase='after',engine=process.env.BROWSER_ENGINE??'chromium',out=resolve(process.env.CAPTURE_OUT??'tools/out/mobile-viewport');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:5348';
const server=await createServer({plugins:[{name:'mobile-frame-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/frame.html'){res.setHeader('content-type','text/html');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}header{height:48px;background:#222;color:white}iframe{display:block;border:0;width:100%;height:calc(100dvh - 48px)}footer{height:500px}</style><header>Local artifact host fixture</header><iframe src="/qa.html"></iframe><footer></footer>`);return;}if(req.url!='/qa.html')return next();let html=await readFile('game.html','utf8');html=html.replace(/<link[^>]+https:\/\/fonts[^>]+>/,'');res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml('/game.html',html));});}}],server:{host:'127.0.0.1',port:5348,strictPort:true,hmr:false},logLevel:'error'});await server.listen();
let browser;
const results=[];
try{browser=await (engine==='webkit'?webkit.launch({executablePath:process.env.BROWSER_PATH,headless:true,timeout:20000}):chromium.launch({executablePath:findBrowser(),headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']}));
for(const wrapped of [false,true]){
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});
await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.fulfill({status:200,body:''}));
await context.addInitScript(()=>{window.requestAnimationFrame=()=>1;window.viewportEvents=[];const snap=type=>{const v=visualViewport;window.viewportEvents.push({type,y:scrollY,top:document.scrollingElement?.scrollTop,scale:v?.scale,offsetY:v?.offsetTop,vh:v?.height,inner:innerHeight,focus:document.activeElement?.tagName,height:document.documentElement.scrollHeight});};for(const type of ['scroll','resize','focusin','focusout'])window.addEventListener(type,()=>snap(type),true);for(const type of ['scroll','resize'])visualViewport?.addEventListener(type,()=>snap('visualViewport:'+type));window.viewportSnapshot=snap;});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(origin+(wrapped?'/frame.html':'/qa.html'),{waitUntil:'domcontentloaded',timeout:20000});if(wrapped)await page.frameLocator('iframe').locator('canvas').waitFor();const frame=wrapped?page.frames().find(f=>f.url().endsWith('/qa.html')):page.mainFrame();
await frame.waitForFunction(()=>!!window.v2,null,{timeout:30000,polling:25}).catch(async e=>{console.log('BOOT',errors,await frame.locator('body').innerHTML());throw e;});
await frame.evaluate(()=>{window.advance=(n=30)=>{const a=window.v2;for(let i=0;i<n;i++){a.flow.update(1/60);if(!a.loading)a.top?.update(1/60);}const c=a.surface.begin();let from=a.stack.length-1;while(from>0&&!a.stack[from].opaque)from--;for(let i=Math.max(0,from);i<a.stack.length;i++)a.stack[i].stage.render(c,0);};window.viewportSnapshot('start');});
const step=async(n=30)=>{await frame.evaluate(n=>window.advance(n),n);await page.waitForTimeout(8);};
await step(300);await frame.evaluate(()=>window.v2.top.options.items[0].run());
for(let n=0;n<400;n++){await step();if(await frame.evaluate(()=>!!window.gameFlow&&!window.v2.loading&&!window.v2.changing))break;}
await frame.evaluate(()=>{const f=window.gameFlow;f.model.newGame({name:f.pack.players.name.default,preset:0,line:f.pack.players.lines[0].id});f.show();});
let taps=0,seen=0;const names=new Set();
for(let n=0;n<900;n++){
await step(12);const state=await frame.evaluate(()=>{const a=window.v2,s=a.top,p=s?.playback??window.gameFlow?.playback;return{loading:a.loading,changing:a.changing,kind:s?.constructor.name,mapIdle:!!s?.board&&s?.mode?.kind==='idle'&&!p?.active&&!s.guiding,line:p?.director?.line?.state?.name,choice:p?.choiceList?{x:p.choiceList.x+50,y:p.choiceList.y+10+p.choiceList.pager+p.choiceList.rowHeight/2}:undefined};});names.add(state.kind);if(n%100===0)console.log('OPENING',phase,wrapped,n,state.kind,state.loading);if(state.line)seen++;
if(state.mapIdle)break;if(state.loading||state.changing)continue;
const box=await frame.locator('canvas').boundingBox();if(!box)throw Error('canvas missing');
const local=state.choice??{x:640,y:600};await page.touchscreen.tap(box.x+local.x*box.width/1280,box.y+local.y*box.height/720);await step(2);await page.touchscreen.tap(box.x+local.x*box.width/1280,box.y+local.y*box.height/720);taps+=2;
// Two touches on both letterbox and viewport/frame edges, interleaved with dialogue.
if(n%7===0){const fbox=wrapped?await page.locator('iframe').boundingBox():{x:0,y:0,width:844,height:390};for(const p of [{x:fbox.x+2,y:fbox.y+fbox.height/2},{x:fbox.x+fbox.width-2,y:fbox.y+fbox.height-2}]){await page.touchscreen.tap(p.x,p.y);await page.touchscreen.tap(p.x,p.y);taps+=2;}}
await frame.evaluate(()=>window.viewportSnapshot('tap-pair'));
}
await page.waitForTimeout(400);const touchGuard=await frame.evaluate(()=>{const a=new TouchEvent('touchend',{bubbles:true,cancelable:true}),b=new TouchEvent('touchend',{bubbles:true,cancelable:true});document.body.dispatchEvent(a);document.body.dispatchEvent(b);return b.defaultPrevented;});if(!touchGuard)throw Error('iOS touchend fallback missing');
await frame.evaluate(()=>window.viewportSnapshot('end'));await page.evaluate(()=>window.viewportSnapshot('outer-end'));
const inner=await frame.evaluate(()=>({events:window.viewportEvents,kind:window.v2.top.constructor.name,ready:!!window.v2.top.board&&window.v2.top.mode.kind==='idle',body:document.body.getBoundingClientRect().toJSON(),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),touch: [getComputedStyle(document.documentElement).touchAction,getComputedStyle(document.body).touchAction,getComputedStyle(document.querySelector('canvas')).touchAction],viewport:document.querySelector('meta[name=viewport]').content}));
const outer=await page.evaluate(()=>window.viewportEvents);const all=[...inner.events,...outer],bad=all.filter(e=>e.y!==0||e.top!==0||e.scale!==1||e.offsetY!==0);
await page.screenshot({path:join(out,wrapped?'iframe.png':'direct.png')});results.push({wrapped,touchGuard,taps,dialogueTicks:seen,screens:[...names],errors,bad,inner,outer});await context.close();console.log(JSON.stringify({phase,wrapped,taps,seen,bad:bad.length,kind:inner.kind,errors}));
}await writeFile(join(out,'viewport.json'),JSON.stringify(results,null,2));if(phase==='after'&&results.some(r=>r.bad.length||r.errors.length||!r.inner.ready))throw Error('viewport regression failed');}finally{try{await browser?.close();}finally{await server.close();}}
