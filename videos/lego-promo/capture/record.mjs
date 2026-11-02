// 실제 LeGo 앱을 녹화해 assets/*.mp4로 저장 (dev 서버 localhost:3000 필요)
// PW=<playwright 경로> node capture/record.mjs [data|phone|hook|payoff]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.env.PW);
const BASE = "http://localhost:3000";
const DIR = fileURLToPath(new URL(".", import.meta.url));
const ASSETS = fileURLToPath(new URL("../assets/", import.meta.url));
const which = process.argv[2];

// CDP 스크린캐스트: 실제 시간대로 프레임을 모아 30fps mp4로
async function screencast(page, out, run) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 4000, maxHeight: 4000 });
  await run();
  await cdp.send("Page.stopScreencast");
  const tmp = `${DIR}frames-${out}/`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  let list = "";
  for (let i = 0; i < frames.length; i++) {
    await writeFile(`${tmp}${i}.jpg`, Buffer.from(frames[i].data, "base64"));
    const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1 / 30;
    list += `file '${i}.jpg'\nduration ${d.toFixed(4)}\n`;
  }
  await writeFile(`${tmp}list.txt`, list + `file '${frames.length - 1}.jpg'\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-i", `${tmp}list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", `${ASSETS}${out}.mp4`]);
  await rm(tmp, { recursive: true, force: true });
  console.log(out, frames.length, "frames", (frames.at(-1).t - frames[0].t).toFixed(1), "s");
}

const launch = () => chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });

// 1) 실시간 응답을 한 번 받아 고정 (강남 2호선 내선)
if (which === "data") {
  const t0 = Date.now();
  const arrivals = await (await fetch(`${BASE}/api/arrivals?station=${encodeURIComponent("강남")}`)).json();
  const res = await fetch(`${BASE}/api/timetable?station=${encodeURIComponent("강남")}&subwayId=1002&direction=${encodeURIComponent("내선")}`);
  const timetable = await res.json();
  await writeFile(`${DIR}data.json`, JSON.stringify({ t0, arrivals, timetable }));
  console.log("t0", new Date(t0).toISOString(), arrivals.arrivals.length, "arrivals", timetable.trains?.length, "scheduled");
}

const data = which === "data" ? null : JSON.parse(await readFile(`${DIR}data.json`, "utf8"));
const settings = (s) => `localStorage.setItem("lego-settings", ${JSON.stringify(JSON.stringify({ state: s, version: 3 }))})`;

async function mobilePage(browser, clockAt, state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  await page.route("**/api/arrivals**", (r) => r.fulfill({ json: data.arrivals }));
  await page.route("**/api/timetable**", (r) => r.fulfill({ json: data.timetable }));
  await page.clock.install({ time: clockAt });
  await page.addInitScript(settings(state));
  return page;
}

// 2) 설정 → 메인 카운트다운까지 한 번에 (휴대폰 화면 @3x)
// 스크린캐스트는 CSS 픽셀 크기로만 나와서, 시계·CSS 애니메이션을 1/30초씩 직접 넘기며 스크린샷을 찍는다
const FPS = 30;
const SUBMIT_AT = 6.6; // 설정 완료 버튼을 누르는 초
const COUNTDOWN_AT_SUBMIT = 70; // 메인 화면이 열릴 때 출발까지 남은 초 (60초에 "지금 출발하세요")
const PHONE_SECONDS = SUBMIT_AT + 15.4;

async function stepAnimations(page, dt) {
  await page.evaluate((dt) => {
    const v = (window.__vt ??= new WeakMap());
    for (const a of document.getAnimations()) {
      const t = (v.get(a) ?? -dt) + dt;
      v.set(a, t);
      a.pause();
      a.currentTime = t;
    }
  }, dt);
}

if (which === "phone") {
  const browser = await launch();
  // 먼저 설정 끝난 상태로 열어 탈 열차의 출발까지 남은 초를 읽는다
  const probe = await mobilePage(browser, data.t0, { station: "강남", subwayId: "1002", direction: "내선", leadMinutes: 6, setupDone: true, onboarded: true });
  await probe.goto(BASE);
  const clock = await probe.locator("span.tabular-nums").first().textContent({ timeout: 20000 });
  const [m, s] = clock.replace("−", "-").split(":").map(Number);
  const departAt = data.t0 + (m * 60 + s) * 1000;
  await probe.context().close();

  const startAt = departAt - (COUNTDOWN_AT_SUBMIT + SUBMIT_AT) * 1000;
  const page = await mobilePage(browser, startAt - 5000, { leadMinutes: 4, setupDone: false, onboarded: true });
  await page.goto(BASE);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByPlaceholder("예: 강남").waitFor();
  await page.clock.pauseAt(startAt);

  const wheelTo = (from, to, p) => page.evaluate(([y]) => { document.querySelector("[role=listbox]").scrollTop = y; }, [(from + (to - from) * (1 - (1 - p) ** 3)) * 48]);
  const actions = [
    [0.5, () => page.getByPlaceholder("예: 강남").tap()],
    [0.8, () => page.keyboard.insertText("강")],
    [1.05, () => page.keyboard.insertText("남")],
    [1.8, () => page.locator("button", { hasText: "강남" }).first().tap()],
    [3.1, () => page.locator("button", { hasText: "2호선" }).first().tap()],
    [4.4, () => page.locator("button", { hasText: "내선" }).first().tap()],
    [SUBMIT_AT, () => page.locator("button[type=submit]").tap()],
  ];
  const tmp = `${DIR}frames-phone/`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const total = Math.round(PHONE_SECONDS * FPS);
  for (let f = 0; f < total; f++) {
    const sec = f / FPS;
    for (const a of actions) if (Math.round(a[0] * FPS) === f) await a[1]();
    if (sec >= 5.5 && sec <= 6.1) await wheelTo(4, 6, (sec - 5.5) / 0.6);
    await page.clock.runFor(1000 / FPS);
    await stepAnimations(page, 1000 / FPS);
    await page.screenshot({ path: `${tmp}${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (f % 60 === 0) console.log("frame", f, "/", total);
  }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${tmp}%04d.jpg`, "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", `${ASSETS}phone.mp4`]);
  await rm(tmp, { recursive: true, force: true });
  await browser.close();
}

// 3) 3D 풀프레임: dev-train 씬만 화면 가득. 터널 → 진입 → 정차·문 열림 → 문 닫힘 → 발차 한 바퀴
if (which === "platform") {
  const t = 8;
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev-train?line=1002&station=${encodeURIComponent("강남")}&t=${t}`);
  await page.addStyleTag({
    content: `main{max-width:none!important;padding:0!important}
      main>div:first-child,main>p{display:none!important}
      main>div.overflow-hidden{position:fixed!important;inset:0!important;max-width:none!important;aspect-ratio:auto!important;border-radius:0!important}
      nextjs-portal{display:none!important}`,
  });
  await page.locator("canvas").waitFor();
  await screencast(page, which, () => page.waitForTimeout(34000));
  await browser.close();
}
