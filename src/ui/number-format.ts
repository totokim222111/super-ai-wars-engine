/** Five or more digits use grouping; resource pairs retain their fixed width. */
export function formatNumericText(value:string|number):string {
  return String(value).split(/(\d[\d,]*\/\d[\d,]*)/).map(part=>{
    if(/^\d[\d,]*\/\d[\d,]*$/.test(part))return part.replaceAll(',','');
    return part.replace(/\d[\d,]*/g,token=>{
      const digits=token.replaceAll(',','');
      return /^[1-9]\d{4,}$/.test(digits)?digits.replace(/\B(?=(\d{3})+(?!\d))/g,','):token;
    });
  }).join('');
}
