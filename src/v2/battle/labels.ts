/** 저장·조회에는 id를 쓰고 화면에는 이 이름을 쓴다. */
export const TEMPLATE_LABELS:Record<string,string>={
 'slash-combo':'베기 연타','rapid-fire':'연사','beam':'빔','missile-salvo':'미사일 다발',
 'heavy-shot':'대구경 단발','punch-rush':'주먹 연타','charge-ram':'몸통 돌진','funnel':'원격 비트',
 'artillery':'곡사 포격','spread-shot':'산탄 사격','word-slam':'글자 내리꽂기','finisher':'필살기',
};
export function templateLabel(id:string):string{return TEMPLATE_LABELS[id]??'기타 연출';}
