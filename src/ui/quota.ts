import {term} from '../v2/terms';
/** The same monotone rounding is used for remaining quota and command cost.
 * At least ten display steps separate adjacent internal points, so comparing
 * displayed remaining and cost gives the exact internal affordability result.
 */
export function quotaPercent(points: number, max: number): string {
  if(!Number.isSafeInteger(max)||max<=0||!Number.isSafeInteger(points)||points<0)throw new Error('invalid quota');
  const digits=Math.max(2,Math.ceil(Math.log10(max))-1),scale=10n**BigInt(digits),den=BigInt(max);
  const rounded=(BigInt(points)*100n*scale*2n+den)/(den*2n);
  const integer=rounded/scale,fraction=(rounded%scale).toString().padStart(digits,'0').replace(/0+$/,'');
  return `${integer}${fraction?'.'+fraction:''}%`;
}
export const quotaUsed=(current:number,max:number):string=>max===0?'100%':quotaPercent(max-current,max);
export const quotaRemaining=(current:number,max:number):string=>max===0?'0%':quotaPercent(current,max);
export const quotaCost=(cost:number,max:number):string=>max===0?'100%':quotaPercent(cost,max);
export const quotaLabel=(current:number,max:number):string=>current<=0?term('quotaEmpty'):term('quotaLabel').replace('{value}',quotaUsed(current,max));
