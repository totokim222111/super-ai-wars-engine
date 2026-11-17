/** Read presentation logs only; never runs combat or changes the authored dialogue. */
import {readFile}from'node:fs/promises';
const path=process.argv[2];if(!path)throw Error('Usage: node tools/battle_lines_check.mjs dialogue-use.json');
const records=JSON.parse(await readFile(path,'utf8')),groups=new Map();
for(const p of records){if(typeof p.speaker!=='string'||typeof p.text!=='string')throw Error('Invalid dialogue usage record');const key=JSON.stringify([p.stage??'',p.speaker,p.text]);groups.set(key,(groups.get(key)??0)+1);}
const warnings=[...groups].filter(([,count])=>count>3).map(([key,count])=>({stage:JSON.parse(key)[0],speaker:JSON.parse(key)[1],text:JSON.parse(key)[2],count}));
console.log(JSON.stringify({warnings,notes:'More than 3 uses per stage is a warning, not an error.'},null,2));
