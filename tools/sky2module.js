// Скайбоксы -> data-модуль src/app/05-sky.js (однофайловая сборка, лоадеров нет).
//
// Исходники 4096x2048 PNG по ~1 МБ каждый — в сборку такое не положить.
// Небо гладкое, поэтому JPEG жмёт его в десятки раз без видимых потерь:
// замер 1536x768 q0.78 -> 36 КБ base64 против 1027 КБ PNG.
//
// ⚠️ Номер 05: модуль обязан идти ДО 10-stage, который строит небо
// (build.py склеивает src/app/*.js по алфавиту, а это top-level const).
//
// Запуск: node tools/sky2module.js "3d assets/skyboxes/Skyboxes" src/app/05-sky.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const W = 1536, Q = 0.78;
// Три времени суток. alien/space намеренно НЕ берём — это новизна, не фон.
const WANT = [['morning', 'skybox-morning.png'], ['day', 'skybox-day.png'], ['night', 'skybox-night.png']];

(async () => {
  const [srcDir, outPath] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  const parts = [`// ===== 05-sky: панорамы неба (data-модуль) =====
// Сгенерировано tools/sky2module.js — РУКАМИ НЕ ПРАВИТЬ.
// Равнопромежуточные (equirectangular) панорамы ${W}x${W / 2}, JPEG.
// Оригиналы 4096x2048 PNG по ~1 МБ лежат в «3d assets/skyboxes».`];
  const names = [];
  for (const [key, file] of WANT) {
    const f = path.join(srcDir, file);
    if (!fs.existsSync(f)) { console.log('⚠ НЕТ ФАЙЛА', file); continue; }
    const b64 = fs.readFileSync(f).toString('base64');
    const uri = await p.evaluate(async ([b64, w, q]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = w / 2;
      c.getContext('2d').drawImage(img, 0, 0, w, w / 2);
      return c.toDataURL('image/jpeg', q);
    }, [b64, W, Q]);
    parts.push(`const SKY_${key.toUpperCase()} = '${uri}';`);
    names.push([key, uri.length]);
    console.log(`  ${file.padEnd(22)} -> ${key.padEnd(8)} ${Math.round(uri.length / 1024)} КБ`);
  }
  parts.push(`// Выбор по ЧАСАМ НА МАШИНЕ ИГРОКА (спека владельца 2026-07-21).
// Границы: утро 5-11, день 11-18, ночь 18-5. Ошибиться тут нестрашно —
// это фон, а не геймплей, поэтому никакой синхронизации времени не делаем.
function skyForNow(){
  let h = 12;
  try { h = new Date().getHours(); } catch(e){}
  if (h >= 5 && h < 11) return SKY_MORNING;
  if (h >= 11 && h < 18) return SKY_DAY;
  return SKY_NIGHT;
}`);
  fs.writeFileSync(outPath, parts.join('\n') + '\n');
  console.log(`${outPath}: ${Math.round(fs.statSync(outPath).size / 1024)} КБ, панорам ${names.length}`);
  await b.close();
})();
