import type { Location, SourceLine, Token } from './types';
export function error(loc: Location, message: string): never { throw new Error(`${loc.file}:${loc.line}:${loc.column}: ${message}`); }
export function lex(source: string, file = 'events.sai'): SourceLine[] {
  const lines: SourceLine[] = [];
  source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((text, i) => {
    const loc = (column: number): Location => ({ file, line: i + 1, column: column + 1 });
    const indent = text.match(/^ */)![0].length;
    if (!text.trim() || text.trimStart().startsWith('#')) return;
    if (text.includes('\t')) error(loc(text.indexOf('\t')), '탭 대신 공백 2칸으로 들여쓰기 하세요');
    if (indent % 2) error(loc(indent), '들여쓰기는 공백 2칸 단위여야 합니다');
    const tokens: Token[] = []; let p = indent;
    while (p < text.length) {
      if (text[p] === ' ') { p++; continue; }
      if (text[p] === '#') break;
      const start = p;
      if (text[p] === '"') {
        p++; let escaped = false;
        while (p < text.length) { const c = text[p++]; if (c === '"' && !escaped) break; escaped = c === '\\' && !escaped; }
        let value: string;
        try { value = JSON.parse(text.slice(start, p)) as string; } catch { error(loc(start), '큰따옴표 문자열이 닫히지 않았거나 이스케이프가 잘못되었습니다'); }
        tokens.push({ ...loc(start), value: value!, quoted: true });
        if (p < text.length && text[p] !== ' ' && text[p] !== '#') error(loc(p), '문자열 뒤에 공백이 필요합니다');
      } else {
        while (p < text.length && text[p] !== ' ' && text[p] !== '#') p++;
        tokens.push({ ...loc(start), value: text.slice(start, p), quoted: false });
      }
    }
    lines.push({ indent, tokens, loc: loc(indent) });
  });
  return lines;
}
