import fs from "fs";
import path from "path";
import { Anthropic } from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const TRANSLATE_ROOT = process.env.TRANSLATE_ROOT || "src/configs/translations";
const TARGET_LANGS = ["en"]; // เพิ่มภาษาเป้าหมายอื่นๆ ได้ที่นี่
const args = process.argv.slice(2);
const FORCE_WRITE = args.includes("--force");
// กำหนดจำนวน keys สูงสุดที่จะส่งไปพร้อมกันในแต่ละครั้ง
const MAX_BATCH_SIZE = 10;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("❌ Missing ANTHROPIC_API_KEY in environment");

const anthropic = new Anthropic({ apiKey });

function flatten(obj: any, prefix = ""): Record<string, string> {
  return Object.entries(obj).reduce(
    (acc: Record<string, string>, [key, value]) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null) {
        Object.assign(acc, flatten(value, newKey));
      } else if (value !== undefined) {
        acc[newKey] = String(value);
      }
      return acc;
    },
    {}
  );
}

function unflatten(flat: Record<string, string>) {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat)) {
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

// ฟังก์ชันใหม่สำหรับการแปลหลาย key พร้อมกัน
async function batchTranslateWithClaude(
  keysToTexts: Record<string, string>,
  targetLang: string
): Promise<Record<string, string>> {
  // สร้าง structure ของข้อความที่จะส่งไป
  const textsToTranslate = Object.entries(keysToTexts)
    .map(([key, text]) => `${key}: "${text}"`)
    .join("\n");

  const prompt = `แปลภาษาจากไฟล์ TH เป็น ${targetLang} ให้แปลตรงๆ ไม่ต้องมีอธิบายหรือตัวเลือกแปร ให้เลือกคำแปรที่เหมาะสมที่สุด สำหรับข้อความต่อไปนี้:\n\n${textsToTranslate}\n\nรูปแบบผลลัพธ์ให้เป็นแบบ key: "คำแปล" เหมือนข้อความข้างต้น`;

  console.log("🚀 ~ prompt:", prompt);
  console.log(
    `🔄 Batch translating ${Object.keys(keysToTexts).length} keys...`
  );

  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4000,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

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

      // ตรวจสอบว่า key มีอยู่ใน input หรือไม่
      if (key in keysToTexts) {
        results[key] = translation;
      }
    }
  }

  // ตรวจสอบว่าได้ครบทุก key หรือไม่ ถ้าไม่ก็ใช้ข้อความต้นฉบับ
  for (const key of Object.keys(keysToTexts)) {
    if (!(key in results)) {
      console.warn(`⚠️ Missing translation for key: ${key}, using source text`);
      results[key] = keysToTexts[key];
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
      const thKeys = Object.keys(flatTH);
      console.log(`🇹🇭 Thai source: ${thKeys.length} keys`);

      // แปลไปยังภาษาเป้าหมายทั้งหมด
      for (const lang of TARGET_LANGS) {
        const langPath = path.join(folder, `${lang}.json`);
        let existingFlat: Record<string, string> = {};
        let keysToTranslate: string[] = [];
        let keysToDelete: string[] = [];
        let fileExists = false;

        // ตรวจสอบว่ามีไฟล์แปลอยู่แล้วหรือไม่
        if (fs.existsSync(langPath)) {
          fileExists = true;
          try {
            const existingJSON = JSON.parse(fs.readFileSync(langPath, "utf-8"));
            existingFlat = flatten(existingJSON);
            const existingKeys = Object.keys(existingFlat);

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

        // แปลเฉพาะ key ที่ต้องการ
        const newFlat = { ...existingFlat };

        // ลบ key ที่ไม่มีในไฟล์ต้นฉบับ
        keysToDelete.forEach((key) => {
          delete newFlat[key];
        });

        // แปลเฉพาะ key ที่ต้องการ
        if (keysToTranslate.length > 0) {
          console.log(
            `🔄 Translating ${keysToTranslate.length} keys to ${lang}...`
          );

          // แบ่ง keys ที่ต้องแปลเป็น batch
          const keyBatches = chunkIntoBatches(keysToTranslate, MAX_BATCH_SIZE);
          console.log(`📦 Split into ${keyBatches.length} batches`);

          // ประมวลผลแต่ละ batch
          for (let i = 0; i < keyBatches.length; i++) {
            const batch = keyBatches[i];
            console.log(
              `📦 Processing batch ${i + 1}/${keyBatches.length} with ${
                batch.length
              } keys`
            );

            // สร้าง map ของ key และข้อความที่ต้องแปล
            const keysToTextsMap: Record<string, string> = {};
            batch.forEach((key) => {
              keysToTextsMap[key] = flatTH[key];
            });

            try {
              // แปลทั้ง batch พร้อมกัน
              const translatedBatch = await batchTranslateWithClaude(
                keysToTextsMap,
                lang
              );

              // นำผลลัพธ์ที่ได้มาใส่ในผลลัพธ์สุดท้าย
              Object.entries(translatedBatch).forEach(
                ([key, translatedText]) => {
                  newFlat[key] = translatedText;
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
              for (const key of batch) {
                try {
                  console.log(
                    `  🔤 Individually translating: ${key.substring(0, 30)}${
                      key.length > 30 ? "..." : ""
                    }`
                  );
                  const thText = flatTH[key];
                  const prompt = `แปลภาษาจากไฟล์ TH เป็น ${lang} ให้แปลตรงๆ ไม่ต้องมีอธิบายหรือตัวเลือกแปร ให้เลือกคำแปรที่เหมาะสมที่สุด:\n\n"${thText}"`;

                  const response = await anthropic.messages.create({
                    model: "claude-3-haiku-20240307",
                    max_tokens: 1000,
                    temperature: 0.2,
                    messages: [{ role: "user", content: prompt }],
                  });

                  const content = response.content[0];
                  if ("text" in content) {
                    newFlat[key] = content.text.trim().replace(/^"|"$/g, "");
                  } else {
                    newFlat[key] = thText;
                  }
                } catch (innerError) {
                  console.error(`❌ Error translating key ${key}:`, innerError);
                  newFlat[key] = flatTH[key]; // ใช้ข้อความเดิมถ้าแปลไม่สำเร็จ
                }
              }
            }
          }
        }

        // เขียนไฟล์
        try {
          const finalJSON = unflatten(newFlat);
          fs.writeFileSync(
            langPath,
            JSON.stringify(finalJSON, null, 2),
            "utf-8"
          );
          console.log(
            `✅ Successfully updated ${lang}.json with ${
              Object.keys(newFlat).length
            } keys`
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
