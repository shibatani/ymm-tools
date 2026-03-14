import type { ImageEntry, SectionDefinition, Section, VoiceEntry } from "./types.ts";
import { normalizeSerif } from "./util.ts";

/**
 * Build composite key for matching: characterName::normalizedSerif
 */
function makeKey(characterName: string, serif: string): string {
  return `${characterName}::${normalizeSerif(serif)}`;
}

/**
 * Extract section definitions from CSV entries.
 * A row is a section boundary if it has titleCard or sectionTitle.
 */
export function extractSections(entries: ImageEntry[]): SectionDefinition[] {
  const sections: SectionDefinition[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry.titleCard && !entry.sectionTitle) continue;

    if (!entry.serif) {
      throw new Error(
        `セクション先頭行（行${i + 2}）のセリフが空です。セクション先頭行にはセリフが必要です`,
      );
    }

    sections.push({
      titleCard: entry.titleCard ?? "",
      sectionTitle: entry.sectionTitle ?? "",
      character: entry.character,
      serif: entry.serif,
    });
  }

  if (sections.length === 0) {
    throw new Error(
      "セクション定義が見つかりません。タイトルカードまたはセクションタイトル列を設定してください",
    );
  }

  if (sections.length < 3) {
    throw new Error(
      `セクション数が${sections.length}件です。BGM の3パターン（intro/main/outro）に対応するため、最低3セクション必要です`,
    );
  }

  // Warn about duplicate character+serif in section headers
  const seen = new Map<string, number>();
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const key = makeKey(s.character, s.serif);
    if (seen.has(key)) {
      console.warn(
        `警告: セクション先頭行のキャラ+セリフが重複しています: "${s.character}: ${s.serif}"。意図しないマッチングが発生する可能性があります`,
      );
    }
    seen.set(key, i);
  }

  return sections;
}

/**
 * Match section definitions to VoiceItems and compute frame positions.
 * Returns Section[] sorted by frame ascending.
 */
export function matchSections(
  sectionDefs: SectionDefinition[],
  voiceItems: VoiceEntry[],
): Section[] {
  if (voiceItems.length === 0) {
    throw new Error("VoiceItem が見つかりません");
  }

  // Build voice map (same as matcher.ts pattern)
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

  // Sort candidates by frame ascending
  for (const candidates of voiceMap.values()) {
    candidates.sort((a, b) => a.frame - b.frame);
  }

  // Track consumption index per key
  const consumedIndex = new Map<string, number>();

  // Match each section to a VoiceItem
  const matched: { def: SectionDefinition; frame: number }[] = [];
  const warnings: string[] = [];

  for (const def of sectionDefs) {
    const key = makeKey(def.character, def.serif);
    const candidates = voiceMap.get(key);

    if (!candidates || candidates.length === 0) {
      warnings.push(
        `警告: セクション先頭セリフが VoiceItem にマッチしません: "${def.character}: ${def.serif}"。このセクションをスキップします`,
      );
      continue;
    }

    const idx = consumedIndex.get(key) ?? 0;
    if (idx >= candidates.length) {
      warnings.push(
        `警告: セクション先頭セリフの候補が消費済み: "${def.character}: ${def.serif}"。このセクションをスキップします`,
      );
      continue;
    }

    const voice = candidates[idx]!;
    consumedIndex.set(key, idx + 1);
    matched.push({ def, frame: voice.frame });
  }

  // Print warnings
  for (const w of warnings) {
    console.warn(w);
  }

  if (matched.length < 3) {
    throw new Error(
      `マッチ成功セクション数が${matched.length}件です。最低3セクション必要です`,
    );
  }

  // Sort by frame ascending (VoiceItem order, not CSV order)
  matched.sort((a, b) => a.frame - b.frame);

  // Compute section lengths
  // Find the last VoiceItem end frame for the final section
  const lastVoice = voiceItems.reduce(
    (max, vi) => Math.max(max, vi.frame + vi.length),
    0,
  );

  const sections: Section[] = [];
  for (let i = 0; i < matched.length; i++) {
    const m = matched[i]!;
    const nextFrame = i < matched.length - 1 ? matched[i + 1]!.frame : lastVoice;
    const length = nextFrame - m.frame;

    sections.push({
      titleCard: m.def.titleCard,
      sectionTitle: m.def.sectionTitle,
      frame: m.frame,
      length,
    });
  }

  return sections;
}
