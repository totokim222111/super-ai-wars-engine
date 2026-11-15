import defaults from '../../content/rules/default.json';
import type { Rules } from './types';
import { validateRules } from './validate';

/** Full tables only: silently merging partial rules would hide content mistakes. */
export function loadRules(value: unknown = defaults): Rules {
  validateRules(value);
  return structuredClone(value);
}
