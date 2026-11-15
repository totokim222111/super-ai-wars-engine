const defaults:Record<string,string>={scan:'정찰',scanHint:'한 번 싸우거나 {scan}을 쓰면 정보가 드러납니다',en:'EN',morale:'기력',funds:'자금',parts:'강화 파츠',training:'훈련 포인트',trainingShort:'훈련',resultExperience:'경험치',sp:'SP',quotaEmpty:'사용량 소진',quotaLabel:'사용량 {value}',blank:'없음',player:'플레이어',partnerEnergy:'파트너 {en}이 부족합니다.',exhaust:'전력 방어 · {en}/SP 소진'};
let current={...defaults};
export function configureTerms(terms:Record<string,string>={}):void{current={...defaults,...terms};}
export function term(key:string):string{return(current[key]??key).replace(/\{(\w+)\}/g,(_,k:string)=>current[k]??'{'+k+'}');}
export function displayTerms(text:string):string{return text.replace(/기력/g,term('morale')).replace(/경험치/g,current.experience??'경험치').replace(/자금/g,term('funds')).replace(/개조/g,current.upgrade??'개조').replace(/\bEN\b/g,term('en')).replace(/\bSP\b/g,term('sp'));}
