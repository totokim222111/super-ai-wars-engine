/** node tools/layout_check.mjs <capture-record.json> [...] -- actual clipped glyph/hit bounds. */
import{readFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import ts from'typescript';
const source=await readFile(new URL('../src/v2/layout-audit.ts',import.meta.url),'utf8');
const{layoutOverlaps}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64'));
export async function checkLayoutFiles(files){
 const screens=[];
 for(const file of files){const record=JSON.parse(await readFile(file,'utf8'));for(const f of record.frames??[]){if(f.device!=='mobile'||!f.measurement?.layout)continue;const r=layoutOverlaps(f.measurement.layout);screens.push({file,key:f.key,violations:r.violations,allowed:r.allowed});}}
 if(!screens.length)throw Error('No measured mobile screens: supply a capture record with measurement.layout.');
 const violations=screens.flatMap(s=>s.violations.map(v=>({file:s.file,key:s.key,...v})));return{screens:screens.length,exceptionRules:2,allowedPairs:screens.reduce((n,s)=>n+s.allowed.length,0),violations};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await checkLayoutFiles(process.argv.slice(2));console.log(JSON.stringify(report,null,2));if(report.violations.length)process.exitCode=1;}
