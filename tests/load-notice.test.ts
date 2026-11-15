import {describe,it,expect} from 'vitest';
import {App,Screen} from '../src/v2/screen';
import {Runner} from '../src/v2/flow';
class Blank extends Screen {enter(){}}
describe('load notice handoff',()=>{it('waits for prepared screen and reports once on the new screen',()=>{const app=Object.create(App.prototype) as any,old=new Blank(),current=new Blank();Object.assign(app,{flow:new Runner(),stack:[old],loading:1,changing:false,sound:{play(){}}});old.app=current.app=app;app.notify('개조 비용 1,000 크레딧 환불.');for(let i=0;i<10;i++)app.flow.update(.1);expect(old.stage.ui.nodes).toHaveLength(0);app.stack=[current];app.loading=0;for(let i=0;i<10;i++)app.flow.update(.1);expect(current.stage.ui.nodes.filter((n:any)=>n.state?.text?.includes('환불'))).toHaveLength(1);expect(old.stage.ui.nodes).toHaveLength(0);for(let i=0;i<10;i++)app.flow.update(.1);expect(current.stage.ui.nodes.filter((n:any)=>n.state?.text?.includes('환불'))).toHaveLength(1);});});
