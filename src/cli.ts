#!/usr/bin/env node
import { CONFIG } from "./config";
import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const apiKey = CONFIG.ANTHROPIC_API_KEY;
const TRANSLATE_ROOT = CONFIG.TRANSLATE_ROOT || "src/configs/translations";
const TARGET_LANGS = CONFIG.TARGET_LANGS || ["en"]; // เพิ่มภาษาเป้าหมายอื่นๆ ได้ที่นี่
const MAX_BATCH_SIZE = CONFIG.MAX_BATCH_SIZE;
const args = process.argv.slice(2);
const FORCE_WRITE = args.includes("--force");

if (!apiKey) throw new Error("❌ Missing ANTHROPIC_API_KEY in environment");

const anthropic = new Anthropic({ apiKey });

// ฟังก์ชันแปลง object เป็น flat format แบบรักษาลำดับ keys
function flatten(obj: any, prefix = ""): [string, string][] {
  let result: [string, string][] = [];

  // ใช้ Object.entries เพื่อเก็บลำดับของ keys ไว้
  Object.entries(obj).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null) {
      // รวม arrays ของ nested objects
      result = result.concat(flatten(value, newKey));
    } else if (value !== undefined) {
      // เพิ่ม key-value pair เข้าไปใน array
      result.push([newKey, String(value)]);
    }
  });

  return result;
}

// แปลง flat format กลับเป็น nested object แบบรักษาลำดับ
function unflatten(flat: [string, string][]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of flat) {
    const parts = key.split(".");
    parts.reduce((acc, part, idx) => {
      if (idx === parts.length - 1) {
        acc[part] = value;
      } else {
        acc[part] = acc[part] || {};
      }
      return acc[part];
    }, result);
  }

  return result;
}

// ฟังก์ชันสำหรับการแปลหลาย key พร้อมกัน
async function batchTranslateWithClaude(
  keysAndTexts: [string, string][],
  targetLang: string
): Promise<Record<string, string>> {
  // สร้าง structure ของข้อความที่จะส่งไป
  const textsToTranslate = keysAndTexts
    .map(([key, text]) => `${key}: "${text}"`)
    .join("\n");

  const prompt = `แปลภาษาจากไฟล์ TH เป็น ${targetLang} ให้แปลตรงๆ ไม่ต้องมีอธิบายหรือตัวเลือกแปร ให้เลือกคำแปรที่เหมาะสมที่สุด สำหรับข้อความต่อไปนี้:\n\n${textsToTranslate}\n\nรูปแบบผลลัพธ์ให้เป็นแบบ key: "คำแปล" เหมือนข้อความข้างต้น`;
  console.log(`🔄 Batch translating ${keysAndTexts.length} keys...`);

  console.log(`========================================================\n`);
  console.log(`📦 Key Different: \n${textsToTranslate}`);
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4000,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`\n📦 Generate: \n ${JSON.stringify(response.content, null, 2)}`);
  console.log(`\n========================================================\n`);

  const content = response.content[0];
  if (!("text" in content)) {
    throw new Error("Unexpected response format from Claude");
  }

  const translatedText = content.text.trim();
  const results: Record<string, string> = {};

  // แยกผลลัพธ์และแปลงกลับเป็น key-value
  const lines = translatedText.split("\n").filter((line) => line.trim() !== "");

  for (const line of lines) {
    // แยก key กับคำแปล
    const match = line.match(/^(.+?):\s*"(.+)"$/);
    if (match && match.length >= 3) {
      const key = match[1].trim();
      const translation = match[2].trim();

      // เก็บผลลัพธ์
      results[key] = translation;
    }
  }

  // ตรวจสอบว่าได้ครบทุก key หรือไม่
  for (const [key, text] of keysAndTexts) {
    if (!(key in results)) {
      console.warn(`⚠️ Missing translation for key: ${key}, using source text`);
      results[key] = text;
    }
  }

  return results;
}

function findAllThJsonFolders(baseDir: string): string[] {
  const results: string[] = [];
  function recurse(currentPath: string) {
    try {
      const items = fs.readdirSync(currentPath, { withFileTypes: true });
      const hasTh = items.some((i) => i.isFile() && i.name === "th.json");
      if (hasTh) {
        results.push(currentPath);
      }
      items
        .filter((i) => i.isDirectory())
        .forEach((dir) => recurse(path.join(currentPath, dir.name)));
    } catch (error) {
      console.error(`Error accessing directory ${currentPath}:`, error);
    }
  }
  recurse(baseDir);
  return results;
}

function pathToIdentifier(fullPath: string): string {
  const relativePath = fullPath.replace(TRANSLATE_ROOT + path.sep, "");
  return relativePath.replace(/\\/g, "_").replace(/\//g, "_");
}

function isPathSelected(fullPath: string): boolean {
  if (args.length === 0) return true;

  const identifier = pathToIdentifier(fullPath);

  return args.some((arg) => {
    const argParts = arg.split("|");
    return argParts.some((part) => {
      if (part === identifier) return true;
      const lastPart = identifier.split("_").pop();
      if (lastPart === part) return true;
      if (identifier.includes(`_${part}_`) || identifier.endsWith(`_${part}`))
        return true;
      return false;
    });
  });
}

// แบ่งข้อมูลออกเป็น batch สำหรับการแปล
function chunkIntoBatches<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

async function processTranslations() {
  console.log(
    `🔍 Starting translation script with TRANSLATE_ROOT: ${TRANSLATE_ROOT}`
  );

  if (!fs.existsSync(TRANSLATE_ROOT)) {
    console.error(`❌ TRANSLATE_ROOT not found: ${TRANSLATE_ROOT}`);
    process.exit(1);
  }

  const folders = findAllThJsonFolders(TRANSLATE_ROOT);
  console.log(`📁 Found ${folders.length} folders with th.json`);

  if (folders.length === 0) {
    console.log(`Folders searched in: ${TRANSLATE_ROOT}`);
    console.log(`Current working directory: ${process.cwd()}`);
    process.exit(1);
  }

  for (const folder of folders) {
    const identifier = pathToIdentifier(folder);

    if (!isPathSelected(folder)) {
      console.log(`⏭️ Skipping ${identifier} - not selected`);
      continue;
    }

    const thPath = path.join(folder, "th.json");
    console.log(`\n🔄 Processing: ${identifier}`);

    try {
      // อ่านไฟล์ต้นฉบับภาษาไทย
      const thJSON = JSON.parse(fs.readFileSync(thPath, "utf-8"));
      const flatTH = flatten(thJSON);
      const thKeys = flatTH.map(([key]) => key);
      console.log(`🇹🇭 Thai source: ${thKeys.length} keys`);

      // แปลไปยังภาษาเป้าหมายทั้งหมด
      for (const lang of TARGET_LANGS) {
        const langPath = path.join(folder, `${lang}.json`);
        let existingFlatEntries: [string, string][] = [];
        let keysToTranslate: string[] = [];
        let keysToDelete: string[] = [];

        // ตรวจสอบว่ามีไฟล์แปลอยู่แล้วหรือไม่
        if (fs.existsSync(langPath)) {
          try {
            const existingJSON = JSON.parse(fs.readFileSync(langPath, "utf-8"));
            existingFlatEntries = flatten(existingJSON);
            const existingKeys = existingFlatEntries.map(([key]) => key);

            // หา key ที่ต้องแปลใหม่ (มีใน th แต่ไม่มีในไฟล์แปล)
            keysToTranslate = thKeys.filter(
              (key) => !existingKeys.includes(key)
            );

            // หา key ที่ต้องลบ (มีในไฟล์แปลแต่ไม่มีใน th)
            keysToDelete = existingKeys.filter((key) => !thKeys.includes(key));

            console.log(
              `🌐 ${lang.toUpperCase()}: Found ${existingKeys.length} keys, ${
                keysToTranslate.length
              } new keys to translate, ${keysToDelete.length} keys to remove`
            );
          } catch (error) {
            console.error(`❌ Error reading ${lang}.json:`, error);
            keysToTranslate = thKeys; // ถ้าอ่านไฟล์ไม่ได้ ให้แปลใหม่ทั้งหมด
            existingFlatEntries = [];
          }
        } else {
          // ถ้าไม่มีไฟล์แปล ให้แปลทุก key
          keysToTranslate = thKeys;
          console.log(
            `🌐 ${lang}: No existing file, will translate all ${thKeys.length} keys`
          );
        }

        // ถ้าไม่มี key ที่ต้องแปลใหม่และไม่มี key ที่ต้องลบ และไม่บังคับเขียนไฟล์
        if (
          keysToTranslate.length === 0 &&
          keysToDelete.length === 0 &&
          !FORCE_WRITE
        ) {
          console.log(`✅ No changes needed for ${lang}`);
          continue;
        }

        // สร้าง map ของ key ที่มีอยู่แล้ว
        const existingTranslations = Object.fromEntries(existingFlatEntries);

        // ลบ key ที่ไม่มีในไฟล์ต้นฉบับออกจาก existingTranslations
        keysToDelete.forEach((key) => {
          delete existingTranslations[key];
        });

        // สร้าง array ของ keys ที่ต้องการแปลพร้อม text
        const keysToTranslateWithText: [string, string][] = [];
        for (const key of keysToTranslate) {
          const thText = flatTH.find(([k]) => k === key)?.[1] || "";
          keysToTranslateWithText.push([key, thText]);
        }

        // แปลเฉพาะ key ที่ต้องการ
        if (keysToTranslateWithText.length > 0) {
          console.log(
            `🔄 Translating ${keysToTranslateWithText.length} keys to ${lang}...`
          );

          // แบ่ง keys ที่ต้องแปลเป็น batch
          const keyBatches = chunkIntoBatches(
            keysToTranslateWithText,
            MAX_BATCH_SIZE
          );
          console.log(`📦 Split into ${keyBatches.length} batches`);

          // ประมวลผลแต่ละ batch
          for (let i = 0; i < keyBatches.length; i++) {
            const batch = keyBatches[i];
            console.log(
              `📦 Processing batch ${i + 1}/${keyBatches.length} with ${
                batch.length
              } keys`
            );

            try {
              // แปลทั้ง batch พร้อมกัน
              const translatedBatch = await batchTranslateWithClaude(
                batch,
                lang
              );

              // เพิ่มผลลัพธ์ที่ได้เข้าไปใน existingTranslations
              Object.entries(translatedBatch).forEach(
                ([key, translatedText]) => {
                  existingTranslations[key] = translatedText;
                }
              );
            } catch (error) {
              console.error(`❌ Error translating batch ${i + 1}:`, error);

              // ถ้าแปลทั้ง batch ไม่สำเร็จ กลับไปแปลทีละ key แทน
              console.log(
                `⚠️ Falling back to individual key translation for batch ${
                  i + 1
                }`
              );
              for (const [key, thText] of batch) {
                try {
                  console.log(
                    `  🔤 Individually translating: ${key.substring(0, 30)}${
                      key.length > 30 ? "..." : ""
                    }`
                  );
                  const prompt = `แปลภาษาจากไฟล์ TH เป็น ${lang} ให้แปลตรงๆ ไม่ต้องมีอธิบายหรือตัวเลือกแปร ให้เลือกคำแปรที่เหมาะสมที่สุด:\n\n"${thText}"`;

                  const response = await anthropic.messages.create({
                    model: "claude-3-haiku-20240307",
                    max_tokens: 1000,
                    temperature: 0.2,
                    messages: [{ role: "user", content: prompt }],
                  });

                  const content = response.content[0];
                  if ("text" in content) {
                    existingTranslations[key] = content.text
                      .trim()
                      .replace(/^"|"$/g, "");
                  } else {
                    existingTranslations[key] = thText;
                  }
                } catch (innerError) {
                  console.error(`❌ Error translating key ${key}:`, innerError);
                  existingTranslations[key] = thText; // ใช้ข้อความเดิมถ้าแปลไม่สำเร็จ
                }
              }
            }
          }
        }

        // สร้าง ordered flat entries ตามลำดับเดียวกับไฟล์ th.json
        const orderedFlatEntries: [string, string][] = [];
        for (const [key] of flatTH) {
          if (key in existingTranslations) {
            orderedFlatEntries.push([key, existingTranslations[key]]);
          }
        }

        // เขียนไฟล์
        try {
          const finalJSON = unflatten(orderedFlatEntries);
          fs.writeFileSync(
            langPath,
            JSON.stringify(finalJSON, null, 2),
            "utf-8"
          );
          console.log(
            `✅ Successfully updated ${lang}.json with ${orderedFlatEntries.length} keys`
          );
        } catch (error) {
          console.error(`❌ Error writing ${lang}.json:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing folder ${folder}:`, error);
    }
  }

  console.log("\n🎉 Translation process completed!");
}

// เริ่มกระบวนการแปลภาษา
processTranslations().catch((error) => {
  console.error("❌ Script failed with error:", error);
  process.exit(1);
});
