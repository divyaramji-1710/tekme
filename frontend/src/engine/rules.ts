// Rules generated from the Python engines by ml/export/export_web.py. Do not edit generated/rules.json by hand.
import raw from "./generated/rules.json";
import type { RxSpec } from "./py";

type Dict = Record<string, string>;
export interface BrandInfo { domains: string[]; keywords: string[]; [k: string]: unknown }
export interface Rules {
  patterns: Record<string, RxSpec>;
  normalizer: Record<string, RxSpec> & { ACRONYMS: string[] };
  obfuscation: Record<string, RxSpec> & { INVISIBLE: string[]; INDIC_SAFE: string[]; CONFUSABLES: Dict; LEET: Record<string, string[]> };
  hinglish: Record<string, RxSpec> & { ABBREVIATIONS: Dict; VARIANT_MAP: Dict; GLOSS: Dict; HINGLISH_MARKERS: string[]; REGIONAL_MARKERS: string[] };
  vocabulary: string[];
  shorteners: string[]; suspicious_tlds: string[]; two_level_suffixes: string[];
  tactics: Record<string, RxSpec> & { list: { id: string; label: string; description: string; needs_context: boolean; cues: RxSpec[] }[] };
  benign: Record<string, RxSpec> & { TEMPLATES: Record<string, { description: string; patterns: RxSpec[] }> };
  trust: Record<string, RxSpec>;
  brands: Record<string, BrandInfo>;
  explainer: { TACTIC_PHRASES: Dict; SIGNAL_PHRASES: Dict; FEATURE_LABELS: Dict };
  category_labels: Dict;
  mutations: { TARGET_WORDS: string[]; LEET_MAP: Dict; HOMOGLYPHS: Dict; ABBREV: [RxSpec, string][]; HINGLISH: [RxSpec, string][]; MUTATION_TYPES: Dict };
}

export const RULES = raw as unknown as Rules;
export const VOCAB = new Set(RULES.vocabulary);
export const SETS = {
  invisible: new Set(RULES.obfuscation.INVISIBLE),
  indicSafe: new Set(RULES.obfuscation.INDIC_SAFE),
  acronyms: new Set(RULES.normalizer.ACRONYMS),
  shorteners: new Set(RULES.shorteners),
  suspiciousTlds: new Set(RULES.suspicious_tlds),
  twoLevel: new Set(RULES.two_level_suffixes),
  hinglishMarkers: new Set(RULES.hinglish.HINGLISH_MARKERS),
  regionalMarkers: new Set(RULES.hinglish.REGIONAL_MARKERS),
  officialDomains: new Set(Object.values(RULES.brands).flatMap((b) => b.domains)),
};
const own = (d: object, k: string) => Object.prototype.hasOwnProperty.call(d, k);
export const get = (d: Dict, k: string): string | undefined => (own(d, k) ? d[k] : undefined);
