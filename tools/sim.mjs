/** Generic pack driver. Choice index and player presets come from data. */
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {packSources,readSource,engineRoot} from './pack-sources.ts';
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const sources=await packSources(arg('pack')),source=sources[0],server=await createServer({root:engineRoot,configFile:false,optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
try{
 const modules=await Promise.all(['/src/core/index.ts','/src/v2/pack/load.ts','/src/v2/adapter/campaign.ts','/src/v2/adapter/map.ts','/src/v2/story/events.ts','/src/v2/story/play.ts','/src/v2/adapter/saves.ts','/src/v2/rules/runtime.ts'].map(p=>server.ssrLoadModule(p)));
 const [core,{loadPack,packLookup},{CoreCampaign},{CoreMap},{StoryEvents},{testCondition,storyChoices,storyText},{TrainingSaves},{nextRulesAI,ruleCommand}]=modules;
 const pack=await loadPack(source.root,p=>readSource(sources,p),undefined,{examples:false,gallery:false});if(pack.errors.length)throw Error(JSON.stringify(pack.errors));
 const rows=[],runs=[],seeds=args.includes('--batch')?[1,7,19]:[Number(arg('seed',1))],presets=pack.players.presets.map((p,i)=>({p,i})).filter(({p})=>!arg('preset')||p.id===arg('preset')),lines=pack.players.lines.filter(l=>!arg('line')||l.id===arg('line'));
 if(!presets.length||!lines.length)throw Error('Unknown preset or line');
 for(const seed of seeds)for(const {p:preset,i}of presets)for(const line of lines){
  const bytes=new Map(),storage={read:async k=>bytes.get(k)??null,replace:async(k,v)=>{bytes.set(k,v);}},saves=new TrainingSaves(storage,pack.campaign,pack.rules,pack.training),lookup=packLookup(pack,{});
  const model=new CoreCampaign(pack.campaign,pack.rules,saves,lookup,undefined,[],pack);model.newGame({name:pack.players.name.default,preset:i,line:line.id});model.session.seed=seed;model.advance(false);
  let map,events;const spoken=[],scenes=[],effects=[];
  const effect=c=>{
   if(c.do==='variable')events.state.set(c.name,c.value);
   if(c.do==='recruit')events.state.recruit?.(c.unit);
   if(c.do==='affection')events.state.affection(c.who,c.amount);
   if(c.do==='say')spoken.push(storyText(c.text,events.state));
   if(c.do==='map'){
    effects.push({action:c.action,unit:c.unit,form:c.form,blocked:c.blocked});
    if(c.action==='통행')map.execute(ruleCommand({kind:'passage',rect:c.rect,blocked:!!c.blocked}));
    if(c.action==='배리어')map.execute(ruleCommand({kind:'barrier',id:c.unit,value:c.barrier??0}));
    if(c.action==='폼')map.execute(ruleCommand({kind:'form',id:c.unit,form:c.form}));
    if(c.action==='소진')map.execute(ruleCommand({kind:'exhaust',id:c.unit}));
    if(c.action==='이동')map.execute({type:'system',unitId:'',action:{kind:'move',ids:[c.unit],x:c.cell[0],y:c.cell[1]}});
    if(c.action==='퇴장')map.execute({type:'system',unitId:'',action:{kind:'retreat',ids:[c.unit]}});
    if(c.action==='합류')map.execute({type:'system',unitId:'',action:{kind:'join',ids:[c.unit]}});
    if(c.action==='등장'&&!map.state().units.some(u=>u.id===c.unit)){const s=map.state().stage,u=[...s.units,...(s.definitions??[]),...Object.values(s.waves??{}).flat()].find(u=>u.id===c.unit);if(!u)throw Error('Unknown spawn '+c.unit);map.execute({type:'system',unitId:'',action:{kind:'spawn',units:[{...u,x:c.cell[0],y:c.cell[1]}]}});}
   }
  };
  const play=(episode,start)=>{
   const story=pack.stories[episode];if(!story?.scenes[start])return;
   events.activateScene(start);let scene=start,budget=10000;
   while(budget-->0){scenes.push(episode+':'+scene);let jump,ended=false;
    for(let c of story.scenes[scene]??[]){if(c.do==='typed'){if(c.type!==events.state.type())continue;c=c.cue;}if(c.do==='end'){ended=true;break;}if(c.do==='jump')jump=c.scene;if(c.do==='condition'&&testCondition(c.test,events.state))jump=c.scene;
     if(c.do==='choice'){const choices=storyChoices(c.choices,events.state),chosen=choices[Math.min(Number(arg('choice',0)),choices.length-1)];if(!chosen)throw Error('No matching choice');chosen.effects.forEach(effect);jump=chosen.target;}effect(c);if(jump)break;}
    if(ended||!jump)break;scene=jump;
   }if(budget<=0)throw Error('Story loop');events.finishScene(start);model.setStoryValue('v2:story:'+episode+':'+start,true);
  };
  const pending=episode=>{for(let i=0;i<100;i++){const key='v2:pending:'+episode,q=JSON.parse(String(model.storyValue(key)||'[]'));if(!q.length)return;const scene=q.shift();model.setStoryValue(key,JSON.stringify(q));play(episode,scene);}throw Error('Event queue loop');};
  const retries=new Map();
  for(let episodeIndex=0;episodeIndex<pack.game.episodes.length;episodeIndex++){const ep=pack.game.episodes[episodeIndex];
   const game=model.session.game;if(!game||game.battle.stage.id!==ep.stage)throw Error('Campaign order '+ep.id);
   game.battle.stage.scenario=true;game.battle.options.autoResponse=true;events=new StoryEvents(pack,model,ep.id);const boot=events.process();model.acceptBattle(boot.state,boot.changes);
   map=new CoreMap(game.battle,{...lookup,variable:n=>n.startsWith('affection:')?model.storyAffection(n.slice(10)):model.storyValue(n),afterCommand:c=>events.process(c),onChange:(s,c)=>model.acceptBattle(s,c)});
   play(ep.id,'도입');play(ep.id,'출격');pending(ep.id);let commands=0;
   while(!map.state().outcome&&commands++<4000){const state=map.state();if(state.round>50)throw Error('Turn limit '+ep.id);let command=nextRulesAI(state);if(!command)throw Error('No legal AI command');if(lookup.aiCommand)command=lookup.aiCommand(state,command);map.execute(command);pending(ep.id);}
   const state=map.state();rows.push({episode:ep.id,seed,preset:preset.id,line:line.id,turn:state.round,outcome:state.outcome,commands,rng:state.rng});if(state.outcome==='defeat'&&model.canRetry()){const attempts=(retries.get(ep.id)??0)+1;retries.set(ep.id,attempts);model.finish();await model.retry();if(attempts>Number(arg('max-retries',10)))throw Error('Retry limit '+ep.id);model.advance();episodeIndex--;continue;}if(state.outcome!=='victory')throw Error('Stage not cleared '+ep.id);play(ep.id,'승리');game.mode='outcome';model.finish();model.advance();play(ep.id,'인터미션');if(model.session.screen!=='end')model.advance();
  }
  if(model.session.screen!=='end')throw Error('Campaign did not end');const endingSession=structuredClone(model.session);if(pack.game.ending){events=new StoryEvents(pack,model,pack.game.ending.episode);play(pack.game.ending.episode,pack.game.ending.scene);}
  runs.push({seed,preset:preset.id,line:line.id,ending:!!pack.game.ending,scenes,spoken,effects,endingSession,session:model.session});
 }
 const out=resolve(arg('out','tools/out/sim'));await mkdir(out,{recursive:true});await writeFile(out+'/simulation.json',JSON.stringify({pack:source.id,battles:rows,runs},null,2)+'\n');await writeFile(out+'/end-session.json',JSON.stringify(runs[0].endingSession,null,2)+'\n');
 console.log(JSON.stringify({pack:source.id,battles:rows.length,endings:runs.filter(r=>r.ending).length,results:rows}));
}finally{await server.close();}
