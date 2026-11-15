export interface DialogueRun {text:string;emphasis:boolean}
/** Paired markers only. Unmatched asterisks are ordinary source text. */
export function dialogueRuns(text:string):DialogueRun[] {
  const runs:DialogueRun[]=[];let cursor=0;
  for(const match of text.matchAll(/\*\*([\s\S]+?)\*\*/g)){
    if(match.index!>cursor)runs.push({text:text.slice(cursor,match.index),emphasis:false});
    runs.push({text:match[1],emphasis:true});cursor=match.index!+match[0].length;
  }
  if(cursor<text.length)runs.push({text:text.slice(cursor),emphasis:false});return runs;
}
export const dialoguePlain=(text:string):string=>dialogueRuns(text).map(r=>r.text).join('');
