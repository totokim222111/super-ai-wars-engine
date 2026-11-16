/** Native text selection/paste is the clipboard fallback in sandboxed iframes. */
export class CodeField {
 private area?:HTMLTextAreaElement;
 private position=()=>{const b=this.canvas.getBoundingClientRect();if(this.area)Object.assign(this.area.style,{left:b.left+180/1280*b.width+'px',top:b.top+218/720*b.height+'px',width:920/1280*b.width+'px',height:256/720*b.height+'px'});};
 constructor(private readonly canvas:HTMLCanvasElement,initial:string,readonly:boolean,onEscape:()=>void){
  if(typeof document==='undefined')return;
  const a=this.area=document.createElement('textarea');a.value=initial;a.readOnly=readonly;a.setAttribute('aria-label',readonly?'복사할 저장 코드':'가져올 저장 코드');a.spellcheck=false;a.autocomplete='off';
  Object.assign(a.style,{position:'fixed',zIndex:'80',resize:'none',font:'16px ui-monospace,monospace',color:'#edf2ff',background:'#111a2d',border:'1px solid #6b839c',padding:'12px',boxSizing:'border-box',touchAction:'manipulation',userSelect:'text'});
  a.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onEscape();}});document.body.append(a);window.addEventListener('resize',this.position);window.visualViewport?.addEventListener('resize',this.position);this.position();a.focus({preventScroll:true});if(readonly)a.select();
 }
 get value():string{return this.area?.value.trim()??'';}
 select():void{this.area?.focus({preventScroll:true});this.area?.select();}
 hide():void{if(this.area){this.area.style.display='none';this.area.blur();}}
 show():void{if(this.area)this.area.style.display='block';}
 dispose():void{this.area?.blur();this.area?.remove();if(typeof window!=='undefined'){window.removeEventListener('resize',this.position);window.visualViewport?.removeEventListener('resize',this.position);window.scrollTo(0,0);}}
}
