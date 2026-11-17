/** node tools/ui_density_check.mjs alpha-record.json current-record.json */
import{readFile,writeFile}from'node:fs/promises';
import ts from'typescript';
const source=await readFile(new URL('../src/v2/layout-audit.ts',import.meta.url),'utf8'),{densityRegressions}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64'));
export function densityOf(record){const result={};for(const f of record.frames??[]){const m=f.measurement,blocks={},lists=m.lists??[];if(lists.length){for(const [i,list]of [...lists].sort((a,b)=>a.x-b.x||a.y-b.y).entries())blocks['list-'+i]=list.visible;}if(f.key.startsWith('map-menu')){blocks['list-0']=(blocks['list-0']??0)+(m.extraActions??m.layout.filter(b=>b.kind==='button'&&b.text==='턴 종료').length);}
// The gallery is one logical menu, whether painted as one or two columns.
if(f.key==='gallery'){const entries=lists.reduce((n,list)=>n+list.visible,0);for(const key of Object.keys(blocks))delete blocks[key];blocks.entries=entries;}
if(f.key==='settings')blocks.settings=m.layout.filter(b=>b.kind==='button'&&b.text!=='✕'&&b.text!=='뒤로').length;
if(f.key==='training')blocks.stats=new Set(m.layout.filter(b=>b.kind==='text'&&['격투','사격','명중','회피','방어','추론'].some(n=>b.text===n||b.text.startsWith(n+' '))).map(b=>['격투','사격','명중','회피','방어','추론'].find(n=>b.text===n||b.text.startsWith(n+' ')))).size;
if(f.key==='credits'&&!lists.length)blocks['list-0']=m.layout.filter(b=>b.kind==='text'&&b.x>=76&&b.x<500&&b.y>=140&&b.y<580&&b.fontSize>=20).length;
if(f.key==='log'&&!lists.length)blocks['list-0']=new Set(m.layout.filter(b=>b.kind==='text'&&b.x>=90&&b.x<240&&b.y>=146&&b.y<610).map(b=>Math.round(b.y))).size;
if(m.dossier)Object.assign(blocks,m.dossier);result[f.device+'/'+f.key]=blocks;}return result;}
if(process.argv.length>=4){const alpha=densityOf(JSON.parse(await readFile(process.argv[2],'utf8'))),current=densityOf(JSON.parse(await readFile(process.argv[3],'utf8'))),regressions=densityRegressions(alpha,current);const report={alpha,current,regressions};if(process.argv[4])await writeFile(process.argv[4],JSON.stringify(report,null,2));console.log(JSON.stringify({screens:Object.keys(alpha).length,regressions},null,2));if(regressions.length)process.exitCode=1;}
