export const formatRange = ([min, max]: readonly [number, number]): string => min === max ? String(min) : `${min}~${max}`;
