import type { ImageEntry, VoiceEntry, YmmpItem } from "./types.ts";
import { EXPRESSION_MAP } from "./constants.ts";
import { normalizeSerif } from "./util.ts";

function makeKey(characterName: string, serif: string): string {
  return `${characterName}::${normalizeSerif(serif)}`;
}

export interface ExpressionMatch {
  character: string;
  serif: string;
  expression: string;
  voiceFrame: number;
}

export interface ExpressionResult {
  applied: ExpressionMatch[];
  skipped: number; // rows with no expression (通常)
  unmatched: { character: string; serif: string; expression: string }[];
  unknownExpressions: string[];
}

/**
 * Match CSV rows to VoiceItems and apply expressions to ymmp items.
 * Only modifies VoiceItems that have a non-empty expression in CSV.
 */
export function applyExpressions(
  csvEntries: ImageEntry[],
  voiceItems: VoiceEntry[],
  ymmpItems: YmmpItem[],
  dryRun: boolean,
): ExpressionResult {
  // Check if any entries have expressions
  const hasAnyExpression = csvEntries.some((e) => e.expression);
  if (!hasAnyExpression) {
    return { applied: [], skipped: csvEntries.length, unmatched: [], unknownExpressions: [] };
  }

  // Build voice map
  const voiceMap = new Map<string, VoiceEntry[]>();
  for (const vi of voiceItems) {
    const key = makeKey(vi.characterName, vi.serif);
    const existing = voiceMap.get(key);
    if (existing) {
      existing.push(vi);
    } else {
      voiceMap.set(key, [vi]);
    }
  }
  for (const candidates of voiceMap.values()) {
    candidates.sort((a, b) => a.frame - b.frame);
  }

  // Build ymmp VoiceItem lookup by frame for direct mutation
  const ymmpVoiceByFrame = new Map<number, YmmpItem>();
  for (const item of ymmpItems) {
    if (item.$type?.includes("VoiceItem")) {
      ymmpVoiceByFrame.set(item.Frame, item);
    }
  }

  const consumedIndex = new Map<string, number>();
  const applied: ExpressionMatch[] = [];
  const unmatched: ExpressionResult["unmatched"] = [];
  const unknownExpressionsSet = new Set<string>();
  let skipped = 0;

  for (const entry of csvEntries) {
    const key = makeKey(entry.character, entry.serif);
    const candidates = voiceMap.get(key);
    const idx = consumedIndex.get(key) ?? 0;

    if (!candidates || idx >= candidates.length) {
      if (entry.expression) {
        unmatched.push({
          character: entry.character,
          serif: entry.serif,
          expression: entry.expression,
        });
      }
      // Still consume the index for ordering consistency
      if (candidates) consumedIndex.set(key, idx + 1);
      continue;
    }

    const voice = candidates[idx]!;
    consumedIndex.set(key, idx + 1);

    // No expression → skip (keep original)
    if (!entry.expression) {
      skipped++;
      continue;
    }

    // Validate expression name
    const expressionDef = EXPRESSION_MAP[entry.expression];
    if (!expressionDef) {
      unknownExpressionsSet.add(entry.expression);
      skipped++;
      continue;
    }

    applied.push({
      character: entry.character,
      serif: entry.serif,
      expression: entry.expression,
      voiceFrame: voice.frame,
    });

    // Apply to ymmp VoiceItem (skip in dry-run)
    if (!dryRun) {
      const ymmpItem = ymmpVoiceByFrame.get(voice.frame);
      if (!ymmpItem) continue;

      const face = ymmpItem.TachieFaceParameter as Record<string, unknown> | undefined;
      if (!face) continue;

      // Replace only the filename part of each path, preserving the base directory
      if (expressionDef.eyebrow === null) {
        face.Eyebrow = null;
      } else if (typeof face.Eyebrow === "string") {
        face.Eyebrow = face.Eyebrow.replace(/\\眉\\.*$/, `\\眉\\${expressionDef.eyebrow}`);
      }

      if (typeof face.Eye === "string") {
        face.Eye = face.Eye.replace(/\\目\\.*$/, `\\目\\${expressionDef.eye}`);
      }

      if (typeof face.Mouth === "string") {
        face.Mouth = face.Mouth.replace(/\\口\\.*$/, `\\口\\${expressionDef.mouth}`);
      }
    }
  }

  return {
    applied,
    skipped,
    unmatched,
    unknownExpressions: [...unknownExpressionsSet],
  };
}
