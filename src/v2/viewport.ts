/** The game owns its iframe viewport, never the embedding page. Pointer input is untouched. */
export function lockGameViewport(doc:Document=document):()=>void {
  let lastTouchEnd=-Infinity;
  const view=doc.defaultView,viewport=view?.visualViewport;
  const editable=(target:EventTarget|null):boolean=>typeof Element!=='undefined'&&target instanceof Element&&!!target.closest('input,textarea,[contenteditable="true"]');
  const end=(event:TouchEvent):void=>{
    const now=event.timeStamp;
    // Older iOS may ignore touch-action on the letterbox. Cancel only its second tap's
    // default zoom/click: the game's pointerdown/up have already been delivered.
    if(!editable(event.target)&&now-lastTouchEnd<350&&event.cancelable)event.preventDefault();
    lastTouchEnd=now;
  };
  const move=(event:TouchEvent):void=>{if(!editable(event.target)&&event.cancelable)event.preventDefault();};
  const gesture=(event:Event):void=>{if(event.cancelable)event.preventDefault();};
  // Capture also covers newly attached media/overlays which can stop bubbling.
  const options={passive:false,capture:true};
  doc.addEventListener('touchend',end,options);
  doc.addEventListener('touchmove',move,options);
  for(const type of ['gesturestart','gesturechange','gestureend','dblclick'])doc.addEventListener(type,gesture,options);
  let frame=0;
  const restore=()=>{frame=0;if(editable(doc.activeElement))return;if(view?.scrollX||view?.scrollY)view.scrollTo(0,0);const root=doc.scrollingElement;if(root){root.scrollLeft=0;root.scrollTop=0;}
    // WebKit's visual viewport can pan without moving the fixed layout viewport.
    // Scroll only our iframe, never the host. There is no standards API to force scale=1.
    if(view&&viewport&&(viewport.offsetTop||viewport.offsetLeft))view.scrollTo(0,0);
  };
  const schedule=()=>{if(!frame&&view)frame=view.requestAnimationFrame(restore);};
  viewport?.addEventListener('scroll',schedule);viewport?.addEventListener('resize',schedule);
  view?.addEventListener('scroll',schedule);view?.addEventListener('pageshow',schedule);
  const focus=()=>{if(!editable(doc.activeElement))schedule();};doc.addEventListener('focusin',focus,true);
  restore();
  return()=>{doc.removeEventListener('touchend',end,options);doc.removeEventListener('touchmove',move,options);for(const type of ['gesturestart','gesturechange','gestureend','dblclick'])doc.removeEventListener(type,gesture,options);doc.removeEventListener('focusin',focus,{capture:true});viewport?.removeEventListener('scroll',schedule);viewport?.removeEventListener('resize',schedule);view?.removeEventListener('scroll',schedule);view?.removeEventListener('pageshow',schedule);if(frame)view?.cancelAnimationFrame(frame);};
}
