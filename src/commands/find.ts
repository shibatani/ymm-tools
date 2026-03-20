import { parseArgs } from "node:util";
import { resolve } from "../resolver.ts";

export async function runFind(args: string[]) {
  const { positionals } = parseArgs({
    args,
    options: {},
    strict: false,
    allowPositionals: true,
  });

  const keyword = positionals[0];
  if (!keyword) {
    console.error("使用法: ymm-tools find <動画名キーワード>");
    console.error("例: ymm-tools find 福岡のお金持ち");
    process.exit(1);
  }

  console.log(`=== ファイル検索: "${keyword}" ===\n`);

  const { folders, ymmpFiles, csvFiles, moviesFolders } = await resolve(keyword);

  // Windows ymmp
  if (folders.length === 0) {
    console.log("Windows ymmp: 該当なし");
  } else {
    console.log("Windows ymmp:");
    for (const folder of folders) {
      const files = ymmpFiles.get(folder) ?? [];
      console.log(`  C:\\動画作成\\YMM保存\\${folder}\\`);
      for (const f of files) {
        console.log(`    - ${f}`);
      }
    }
  }

  // Mac CSV
  console.log("");
  if (csvFiles.length === 0) {
    console.log("Mac CSV/xlsx: 該当なし");
  } else {
    console.log("Mac CSV/xlsx:");
    for (const f of csvFiles) {
      console.log(`  ${f}`);
    }
  }

  // Mac Movies (実写/図解フォルダ)
  console.log("");
  if (moviesFolders.length === 0) {
    console.log("Mac Movies (実写フォルダ): 該当なし");
  } else {
    console.log("Mac Movies (実写フォルダ):");
    for (const f of moviesFolders) {
      console.log(`  ~/Movies/${f}/`);
    }
  }

  // Summary
  console.log("\n--- 検出サマリー ---");
  const totalYmmp = [...ymmpFiles.values()].reduce((s, f) => s + f.length, 0);
  console.log(`  Windows ymmpフォルダ: ${folders.length}件 (ymmpファイル: ${totalYmmp}件)`);
  console.log(`  Mac CSV/xlsx: ${csvFiles.length}件`);
  console.log(`  Mac Movies: ${moviesFolders.length}件`);
}
