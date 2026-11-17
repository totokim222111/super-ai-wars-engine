/** Canvas dialog with a native, selectable clipboard fallback field. */
import {Screen} from '../screen';
import {Button,label,toast,windowFrame} from '../kit';
import {cover} from '../ui';
import {ConfirmScreen} from '../dialogs';
import {CodeField} from '../../platform/code-field';
export class SaveCodeScreen extends Screen {
 opaque=false;private field?:CodeField;private busy=false;
 constructor(private readonly kind:'copy'|'paste',private readonly initial:string,private readonly accept?:(code:string)=>Promise<void>){super();}
 enter():void {
  this.stage.ui.add(Object.assign(cover('rgba(2,5,12,.92)'),{z:90}));
  this.stage.ui.add(Object.assign(windowFrame(this.kind==='copy'?'저장 코드 복사':'저장 코드 붙여넣기',1040,530),{x:120,y:100,z:91}));
  this.stage.ui.add(Object.assign(label(this.kind==='copy'?'코드 전체를 복사해 따로 보관하세요.':'저장 코드를 붙여넣은 뒤 가져오기를 누르세요.',23,{width:920}),{x:180,y:164,z:92}));
  this.field=new CodeField(this.app.surface?.canvas,this.initial,this.kind==='copy',()=>this.app.pop('none'));
  this.ui.add(Object.assign(new Button(this.kind==='copy'?'코드 선택 / 복사':'가져오기',()=>{if(this.kind==='copy'){this.field?.select();try{void navigator.clipboard.writeText(this.field?.value||this.initial).then(()=>toast(this,'복사했습니다.')).catch(()=>toast(this,'코드 전체를 선택해 복사하세요.'));}catch{toast(this,'코드 전체를 선택해 복사하세요.');}}else this.import();},{w:420,h:84}),{x:180,y:520,z:93}));

  this.ui.setNavigation({kind:'close',bounds:{x:120,y:100,w:1040,h:530},onBack:()=>this.app.pop('none')});
 }
 private import():void {
  const code=this.field?.value;if(!code||this.busy||!this.accept)return;
  this.field!.hide();
  this.app.push(new ConfirmScreen('저장 코드를 가져올까요?\n같은 슬롯의 저장을 덮어씁니다.',()=>{
   this.busy=true;void this.accept!(code).then(()=>{if(this.app.top===this)this.app.pop('none');}).catch(e=>{this.busy=false;toast(this,String(e instanceof Error?e.message:e));});
  }),'none');
 }
 resume():void{this.field?.show();}
 dispose():void{this.field?.dispose();}
}
