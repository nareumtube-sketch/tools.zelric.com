/**
 * tools.zelric.com — 독립 Cloudflare 워커 (worker-v2.js에서 추출·분리, 2026-07-04)
 * blog.zelric.com과 완전 분리. D1/R2 바인딩 없음(설정 인라인).
 * 이미지 처리는 전부 브라우저(클라이언트)에서 수행 — 서버 저장 없음.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
function html(content, status = 200, extra = {}) {
  return new Response(content, { status, headers: { ...CORS, ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", ...extra } });
}
function text(content, status = 200) {
  return new Response(content, { status, headers: { ...CORS, ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
function xml(content, status = 200) {
  return new Response(content, { status, headers: { ...CORS, ...SECURITY_HEADERS, "Content-Type": "application/xml; charset=utf-8" } });
}

// ── 설정(인라인) — AdSense 스니펫을 adsense_code 에 붙여넣으세요 ──
const TOOLS_SETTINGS = {
  adsense_code: "",   // 예: <script async src="...adsbygoogle.js?client=ca-pub-XXXX" crossorigin="anonymous"></script>
  ad_bottom_html: "", // 하단 광고 커스텀 HTML(선택)
};

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function sanitizeAdHtml(raw) {
  if (!raw) return "";
  let s = String(raw);

  // 1. javascript: / vbscript: / data: URL 차단 (href, src, action 등)
  s = s.replace(/(href|src|action|formaction)\s*=\s*["']?\s*(javascript|vbscript|data):/gi,
    (_, attr) => `${attr}=""`);

  // 2. on* 이벤트 핸들러 속성 제거 (onclick, onerror, onload 등)
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // 3. <script> 태그 내 위험 패턴만 제거 (애드센스 script는 허용해야 하므로)
  //    document.cookie 접근, eval, fetch to 외부, localStorage 조작 차단
  s = s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, code) => {
    // src 있는 외부 스크립트는 그대로 허용 (애드센스, GPT 등)
    if (/src\s*=/i.test(attrs)) return match;
    // 인라인 스크립트에서 위험 패턴 제거
    const dangerous = /document\.cookie|localStorage|sessionStorage|eval\s*\(|Function\s*\(|fetch\s*\(|XMLHttpRequest|\.innerHTML\s*=/i;
    if (dangerous.test(code)) {
      console.warn("[sanitizeAdHtml] 위험한 인라인 스크립트 차단됨");
      return "<!-- ad script blocked -->";
    }
    return match;
  });

  return s;
}

/* ──── 🎨 [수정 가능] 디자인 시스템 테마 레이어 ─────────────────────────────────
   공개 페이지(홈/글/정책/404)에 공통 주입되는 테마 레이어입니다.
   - Pretendard 폰트 / 라이트·다크 모드 / 접근성(focus-visible·reduced-motion)
   - 기존 페이지가 쓰는 CSS 변수(--bg,--bg2,--card,--line,--line2,--muted,--txt,--accent,--theme)를
     다크 모드에서 덮어쓰는 방식 → 라이트 디자인은 그대로 유지하면서 다크 모드만 추가.
   - <style> 블록 끝에 주입되어 소스 순서상 가장 마지막에 적용됩니다.
   ────────────────────────────────────────────────────────────────────────────── */

const THEME_HEAD = `<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();function toggleTheme(){var r=document.documentElement;var cur=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');var n=cur==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('theme',n)}catch(e){}}</script>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#191919" media="(prefers-color-scheme: dark)" />
<meta name="google-site-verification" content="VHKnycnLMJ7pettOa0LEq_b3LCUKvOfQrBQK5G5V9ic" />`;

// "Z." 모노그램 SVG 파비콘 (/favicon.svg, /favicon.ico 에서 서빙)

const DS_CSS = `
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

:root{
  --font-sans:"Pretendard","Noto Sans KR",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --font-mono:"JetBrains Mono","D2Coding",ui-monospace,SFMono-Regular,Menlo,monospace;
  --fs-h1:2rem;--fs-h2:1.5rem;--fs-h3:1.25rem;--fs-body:1.125rem;--fs-small:0.8125rem;
  --lh-heading:1.35;--lh-body:1.75;
  --content-width:720px;--media-width:1320px;
  --space-1:0.5rem;--space-2:1rem;--space-3:1.5rem;--space-4:2rem;--space-6:3rem;
  --radius:10px;--radius-sm:6px;
  --bg:#ffffff;--bg-surface:#f7f7f5;--text:#14161a;--text-secondary:#474c54;--text-tertiary:#6a7079;
  --border:#ebebe8;--border-strong:#d8d8d4;--accent:#2563eb;--accent-hover:#1d4ed8;--accent-soft:#eef2ff;--focus-ring:#2563eb;
}
:root[data-theme="dark"]{
  --bg:#191919;--bg-surface:#242424;--text:#f2f2f0;--text-secondary:#b5b5b2;--text-tertiary:#8a8a87;
  --border:#2e2e2e;--border-strong:#3a3a3a;--accent:#60a5fa;--accent-hover:#93c5fd;--accent-soft:#1e293b;--focus-ring:#60a5fa;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#191919;--bg-surface:#242424;--text:#f2f2f0;--text-secondary:#b5b5b2;--text-tertiary:#8a8a87;
    --border:#2e2e2e;--border-strong:#3a3a3a;--accent:#60a5fa;--accent-hover:#93c5fd;--accent-soft:#1e293b;--focus-ring:#60a5fa;
  }
}

*{box-sizing:border-box}
html{font-size:100%;-webkit-text-size-adjust:100%;scroll-behavior:smooth;scrollbar-gutter:stable;overflow-y:scroll}
body{margin:0;font-family:var(--font-sans);font-size:var(--fs-body);line-height:var(--lh-body);color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;word-break:keep-all;transition:background-color .2s ease,color .2s ease;min-height:100vh;display:flex;flex-direction:column}
:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:var(--radius-sm)}
h1,h2,h3{line-height:var(--lh-heading);font-weight:700;color:var(--text)}
a{color:var(--accent);text-decoration:none}

/* 헤더 */
.header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg-surface) 88%,transparent);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--border)}
.header-in{max-width:var(--media-width);margin:0 auto;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;line-height:1}
.brand{display:inline-flex;align-items:center;min-height:34px;line-height:1;font-weight:700;font-size:1.05rem;letter-spacing:-.02em;color:var(--text);text-decoration:none}
.logo-serif{font-family:"Pretendard","Noto Sans KR",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-weight:700;font-size:1.4rem;letter-spacing:.01em;color:var(--text);line-height:1}
.logo-dot{color:var(--text)}
.logo-img{height:60px;width:auto;display:block}
.nav{display:flex;gap:22px;align-items:center}
.nav a{color:var(--text-secondary);text-decoration:none;font-size:1rem;font-weight:500;transition:color .15s}
.nav a:hover{color:var(--text)}
.nav .pill{padding:6px 14px;border-radius:999px;background:var(--accent);color:#fff;font-weight:600;font-size:.8rem}
.nav .pill:hover{background:var(--accent-hover);color:#fff}
.theme-toggle{background:none;border:1px solid var(--border);border-radius:999px;width:34px;height:34px;cursor:pointer;font-size:1rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;color:var(--text);padding:0}
.theme-toggle:hover{background:var(--bg-surface)}
.menu-toggle{display:none;background:none;border:none;font-size:1.4rem;cursor:pointer;padding:4px 8px;color:var(--text);line-height:1}

/* 태그/칩 */
.tag{display:inline-block;font-size:var(--fs-small);font-weight:500;color:var(--accent);background:var(--accent-soft);padding:3px 10px;border-radius:var(--radius-sm)}

/* 카드 그리드 */
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-2)}
.card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:border-color .15s ease,transform .15s ease;content-visibility:auto;contain-intrinsic-size:auto 360px}
.card:hover{border-color:var(--border-strong);transform:translateY(-2px)}
.card-link{display:block;text-decoration:none;color:inherit}
.card-body{padding:var(--space-2)}

/* 요약 박스(네이티브 광고 면) */
.ad-native{border:1px solid var(--border);border-radius:var(--radius);padding:var(--space-2);margin:var(--space-4) 0}
.ad-native .ad-label{font-size:.6875rem;color:var(--text-tertiary);letter-spacing:.04em;margin:0 0 4px}
.ad-slot{min-height:280px;margin:var(--space-4) 0;display:flex;align-items:center;justify-content:center;background:var(--bg-surface);border-radius:var(--radius)}

/* 버튼 */
.btn{font:inherit;font-weight:500;cursor:pointer;padding:10px 18px;border-radius:var(--radius-sm);border:1px solid var(--accent);background:var(--accent);color:#fff;transition:background .15s ease}
.btn:hover{background:var(--accent-hover)}

/* 푸터 */
.site-footer{border-top:1px solid var(--border);background:transparent;margin-top:auto}
.site-footer .ft-in{max-width:var(--media-width);margin:0 auto;padding:28px 16px;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
.site-footer nav{display:flex;flex-wrap:wrap;gap:18px;font-size:.84rem}
.site-footer a{color:var(--text-secondary);text-decoration:none}
.site-footer a:hover{color:var(--text)}
.site-footer .copy{font-size:.78rem;color:var(--text-tertiary)}

/* 모바일 메뉴 */
.mobile-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99}
.mobile-overlay.open{display:block}
.mobile-menu{position:fixed;top:0;right:-300px;width:300px;height:100%;background:var(--bg);z-index:100;box-shadow:-4px 0 20px rgba(0,0,0,.15);padding:20px;overflow-y:auto;transition:right .25s ease}
.mobile-menu.open{right:0}
.mobile-menu .mm-close{background:none;border:none;font-size:1.3rem;cursor:pointer;float:right;padding:4px 8px;color:var(--text)}
.mobile-menu .mm-section{margin-bottom:20px}
.mobile-menu .mm-label{font-size:.72rem;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.mobile-menu .mm-cat{display:block;padding:8px 10px;font-size:.88rem;color:var(--text);text-decoration:none;border-radius:8px;font-weight:500}
.mobile-menu .mm-cat:hover{background:var(--bg-surface)}
.mobile-menu .mm-search{display:flex;gap:6px;margin-bottom:16px}
.mobile-menu .mm-search input{flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--bg-surface);color:var(--text);outline:none}
.mobile-menu .mm-search button{padding:8px 14px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer}

@media (max-width:768px){
  :root{--fs-body:1.0625rem;--fs-h1:1.625rem;--fs-h2:1.375rem}
  .menu-toggle{display:block}
  .header-in{padding:11px 16px}
}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
`;

// 공통 헤더 (브랜드 + 내비 + 다크모드 토글 + 모바일 메뉴 버튼)

const TOOLS = [
  { slug:"compress",  name:"이미지 압축",   tagline:"용량은 줄이고 화질은 그대로",   cat:"최적화",
    grad:"linear-gradient(135deg,#3b82f6,#06b6d4)", ready:true,  accept:"image/*",
    icon:'<path d="M9 9 4 4M9 9H5M9 9V5M15 9l5-5M15 9h4M15 9V5M9 15l-5 5M9 15H5M9 15v4M15 15l5 5M15 15h4M15 15v4"/>' },
  { slug:"upscale",   name:"업스케일",      tagline:"AI 초해상도 · 최대 4배 선명하게", cat:"최적화",
    grad:"linear-gradient(135deg,#0ea5e9,#6366f1)", ready:true,  accept:"image/*",
    icon:'<path d="M3 21v-6h6M21 3v-6M21 3v6h-6M21 3l-7 7M3 21l7-7"/>' },
  { slug:"remove-bg", name:"배경 제거",     tagline:"클릭 한 번으로 누끼 따기",      cat:"최적화",
    grad:"linear-gradient(135deg,#d946ef,#ec4899)", ready:true,  accept:"image/*",
    icon:'<path d="M3 3h7v7H3zM14 14h7v7h-7z"/><path d="M14 3h7v7M3 14v7h7"/>' },
  { slug:"resize",    name:"크기 조절",     tagline:"px·% 로 정확하게 리사이즈",     cat:"크기·편집",
    grad:"linear-gradient(135deg,#8b5cf6,#a855f7)", ready:true,  accept:"image/*",
    icon:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>' },
  { slug:"crop",      name:"자르기",        tagline:"원하는 영역만 잘라내기",        cat:"크기·편집",
    grad:"linear-gradient(135deg,#10b981,#14b8a6)", ready:true,  accept:"image/*",
    icon:'<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>' },
  { slug:"rotate",    name:"회전·반전",     tagline:"90°·180°·좌우상하 반전",        cat:"크기·편집",
    grad:"linear-gradient(135deg,#f43f5e,#fb7185)", ready:true,  accept:"image/*",
    icon:'<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>' },
  { slug:"convert",   name:"포맷 변환",     tagline:"JPG · PNG · WebP 상호 변환",     cat:"변환",
    grad:"linear-gradient(135deg,#f59e0b,#f97316)", ready:true,  accept:"image/*",
    icon:'<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>' },
  { slug:"watermark", name:"워터마크",      tagline:"텍스트·로고로 저작권 보호",     cat:"보안",
    grad:"linear-gradient(135deg,#6366f1,#3b82f6)", ready:true,  accept:"image/*",
    icon:'<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 4 12 2C11.5 4 9 6 8 9.5S5 15 5 15a7 7 0 0 0 7 7z"/>' },
];
const TOOLS_BY_SLUG = Object.fromEntries(TOOLS.map(t => [t.slug, t]));
const TOOL_CATS = ["최적화", "크기·편집", "변환", "보안"];
const TOOL_BRAND = "Zelric";
// 도구 사이트 전용 로고 글리프(인라인 SVG) + 파비콘(data URI) — blog 공용 FAVICON_SVG은 미사용
const TOOL_LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#e60023"/><path d="M14 44l11-13 7 8 6-7 12 12z" fill="#fff"/><circle cx="43" cy="22" r="5.5" fill="#fff"/></svg>`;
const TOOL_FAVICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='%23e60023'/%3E%3Cpath%20d='M14%2044l11-13%207%208%206-7%2012%2012z'%20fill='%23fff'/%3E%3Ccircle%20cx='43'%20cy='22'%20r='5.5'%20fill='%23fff'/%3E%3C/svg%3E";

function toolSvg(paths, size) {
  const s = size || 26;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const TOOLS_CSS = `
/* ── Zelric 도구 사이트 · Dribbble풍 플랫 ── */
.tools-page{font-family:"Schibsted Grotesk","Pretendard","Noto Sans KR",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--pink:#e60023;--pink-h:#ad081b;--z1:#e60023;--z2:#e60023;--z3:#ff5a7a;--z-grad:#e60023;--z-glow:230,0,35;--accent:#e60023;--accent-hover:#ad081b;--accent-soft:color-mix(in srgb,#e60023 11%,transparent);flex:1}
.tools-page h1,.tools-page h2,.tools-page h3,.tools-page h4{font-family:"Schibsted Grotesk","Pretendard","Noto Sans KR",sans-serif;letter-spacing:-.02em}
.tools-page .header{background:var(--bg);border-bottom:1px solid var(--border)}
.tools-page .header-in{max-width:100%;padding:10px 28px}
.tools-page .nav a{font-size:.94rem;font-weight:600;color:var(--text)}
.tools-page .nav a:hover{color:var(--pink)}
.tools-page .logo-serif{letter-spacing:-.02em}
.brand-glyph{display:inline-flex;line-height:0;margin-right:8px}
.brand-glyph svg{display:block;border-radius:8px}
.wrap{width:100%;max-width:1180px;margin:0 auto;padding:0 24px}
/* 히어로 — Dribbble풍 스플릿 */
.hero{position:relative;padding:44px 0 60px}
.hero-inner{display:grid;grid-template-columns:1.02fr .98fr;gap:48px;align-items:center;max-width:1180px;margin:0 auto;padding:0 24px}
.hero-copy{text-align:left}
.seg-toggle{display:inline-flex;background:var(--bg-surface);border:1px solid var(--border);border-radius:999px;padding:4px;margin-bottom:26px}
.seg-toggle button{border:none;background:none;cursor:pointer;font:inherit;font-size:.82rem;font-weight:700;letter-spacing:.01em;color:var(--text-secondary);padding:8px 18px;border-radius:999px;transition:.15s}
.seg-toggle button.st-on{background:var(--bg);color:var(--text);box-shadow:0 1px 3px rgba(13,12,34,.14)}
.hero-h1{font-size:clamp(2.3rem,4.6vw,3.6rem);font-weight:800;letter-spacing:-.035em;line-height:1.08;margin:0 0 22px;color:var(--text)}
.hero-h1 .hl{color:var(--pink)}
.hero-list{list-style:none;padding:0;margin:0 0 28px;display:flex;flex-direction:column;gap:13px}
.hero-list li{display:flex;align-items:center;gap:11px;font-size:1rem;color:var(--text);font-weight:500}
.hero-list .ck{flex:none;width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--pink);display:flex;align-items:center;justify-content:center}
.hero-cta{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:14px 26px;border-radius:11px;border:none;cursor:pointer;font:inherit;font-size:.98rem;font-weight:700;color:var(--bg);background:var(--text);transition:background .15s,color .15s;text-decoration:none}
.btn-primary:hover{background:var(--pink);color:#fff}
.btn-soft{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:.95rem;font-weight:600;color:var(--text);background:none;border:none;text-decoration:none;transition:color .15s}
.btn-soft:hover{color:var(--pink)}
/* 제품 목업 */
.hero-visual{position:relative}
.mock{background:var(--bg);border:1px solid var(--border);border-radius:14px;box-shadow:0 30px 60px -30px rgba(13,12,34,.3),0 8px 20px -14px rgba(13,12,34,.14);overflow:hidden}
.mock-top{display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
.mock-top .md{width:10px;height:10px;border-radius:50%}
.mock-top .r{background:#ff5f57}.mock-top .y{background:#febc2e}.mock-top .g{background:#28c840}
.mock-url{margin-left:8px;font-size:.72rem;color:var(--text-tertiary);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:3px 10px}
.mock-main{display:grid;grid-template-columns:1.05fr 1fr;gap:14px;padding:16px}
.mock-preview{border-radius:8px;min-height:158px;background:linear-gradient(135deg,#fda085,#f6d365 34%,#84fab0 68%,#8fd3f4);position:relative;overflow:hidden}
.mock-preview::after{content:"photo.jpg · 2.4MB";position:absolute;left:8px;bottom:8px;font-size:.66rem;color:#fff;background:rgba(0,0,0,.4);padding:2px 8px;border-radius:5px}
.mock-panel{display:flex;flex-direction:column;gap:10px;justify-content:center}
.mp-row{display:flex;justify-content:space-between;align-items:center;font-size:.76rem;color:var(--text-secondary);font-weight:600}
.mp-track{height:6px;border-radius:3px;background:var(--bg-surface);overflow:hidden}
.mp-track span{display:block;height:100%;background:var(--pink)}
.mp-size{font-size:.82rem;color:var(--text);font-weight:700}.mp-size i{color:var(--text-tertiary);font-style:normal;margin:0 4px}.mp-size b{color:var(--pink)}
.mp-badge{align-self:flex-start;font-size:.7rem;font-weight:700;color:var(--text);background:var(--bg-surface);border:1px solid var(--border);padding:3px 9px;border-radius:6px}
.mp-btn{margin-top:3px;text-align:center;padding:9px;border-radius:8px;background:var(--pink);color:#fff;font-size:.82rem;font-weight:700}
.chip-float{position:absolute;z-index:2;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:8px 12px;font-size:.78rem;font-weight:700;color:var(--text);box-shadow:0 12px 28px -14px rgba(13,12,34,.32);display:flex;align-items:center;gap:7px}
.chip-float .ci{width:18px;height:18px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:.62rem}
.chip-float.c1{top:-16px;left:-18px}.chip-float.c1 .ci{background:#16a34a}
.chip-float.c2{bottom:-16px;right:-14px}.chip-float.c2 .ci{background:var(--pink)}
/* 사용법 3단계 */
.sec-head{text-align:center;max-width:580px;margin:0 auto 28px}
.sec-head h2{font-size:clamp(1.4rem,2.6vw,1.9rem);font-weight:800;margin:0 0 8px;color:var(--text)}
.sec-head p{color:var(--text-secondary);margin:0;font-size:.98rem}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:0 0 64px}
.step{padding:24px;background:var(--bg);border:1px solid var(--border);border-radius:14px}
.step .num{width:34px;height:34px;border-radius:9px;background:var(--accent-soft);color:var(--pink);font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.step h4{font-size:1.02rem;font-weight:700;margin:0 0 5px}
.step p{font-size:.88rem;color:var(--text-secondary);margin:0;line-height:1.55}
/* 최종 CTA (플랫 다크 밴드) */
.cta-band{text-align:center;background:#0d0c22;border-radius:18px;padding:52px 28px;margin:0 0 8px}
.cta-band h2{color:#fff;font-size:clamp(1.5rem,3vw,2.1rem);font-weight:800;margin:0 0 10px}
.cta-band p{color:rgba(255,255,255,.72);margin:0 0 24px;font-size:1rem}
.btn-white{display:inline-flex;align-items:center;gap:8px;padding:13px 28px;border-radius:10px;background:var(--pink);color:#fff;font-weight:700;font-size:.98rem;text-decoration:none;transition:background .15s}
.btn-white:hover{background:var(--pink-h);color:#fff}

/* 필터 칩 + 도구 그리드 (Dribbble 샷 스타일) */
.filters{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin:0 0 30px}
.fpill{padding:8px 16px;border-radius:999px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;transition:.15s}
.fpill:hover{border-color:var(--text-tertiary)}
.fpill.on{background:var(--text);color:var(--bg);border-color:transparent}
.tools-band{background:var(--bg-surface)}
.shot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:26px 22px;margin:0 0 60px}
.shot{display:block;text-decoration:none;color:inherit}
.shot-thumb{position:relative;aspect-ratio:4/3;border-radius:12px;border:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:border-color .16s,box-shadow .16s,transform .16s}
.shot-thumb .ti{color:var(--text-secondary);transition:color .16s}
.shot:hover .shot-thumb{transform:translateY(-3px);border-color:var(--text-tertiary);box-shadow:0 10px 22px -14px rgba(13,12,34,.2)}
.shot:hover .ti{color:var(--pink)}
.shot-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 2px 0}
.shot-name{font-size:.96rem;font-weight:700;color:var(--text);margin:0}
.shot-sub{font-size:.8rem;color:var(--text-tertiary);margin:2px 0 0}
.shot-tag{flex:none;font-size:.72rem;font-weight:700;color:var(--text-secondary);background:var(--bg-surface);border:1px solid var(--border);border-radius:999px;padding:3px 10px}
.shot.soon{cursor:default}
.shot.soon .shot-thumb{opacity:.6}
.badge-soon{position:absolute;top:10px;right:10px;font-size:.66rem;font-weight:700;color:var(--text-secondary);background:var(--bg);border:1px solid var(--border);padding:3px 9px;border-radius:999px}

/* 특징 밴드 (플랫) */
.feat-band{border-top:1px solid var(--border);padding:44px 0 0;margin:0 0 60px}
.feat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:26px}
.feat{display:flex;gap:13px;align-items:flex-start}
.feat .fi{flex:none;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--pink)}
.feat b{display:block;font-size:.98rem;margin-bottom:3px;color:var(--text)}
.feat span{font-size:.86rem;color:var(--text-secondary);line-height:1.55}

/* ── 도구 페이지 ── */
.tool-main{max-width:980px;margin:0 auto;padding:40px 20px 72px}
.tool-hd{text-align:center;margin-bottom:30px}
.tool-hd .tool-chip{width:62px;height:62px;border-radius:17px;display:inline-flex;align-items:center;justify-content:center;color:#fff;margin-bottom:14px;box-shadow:0 10px 26px -10px rgba(0,0,0,.45)}
.tool-hd h1{font-size:clamp(1.7rem,4vw,2.4rem);font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
.tool-hd p{color:var(--text-secondary);margin:0;font-size:1.05rem}
.crumb{display:flex;justify-content:center;gap:6px;font-size:.84rem;color:var(--text-tertiary);margin-bottom:24px}
.crumb a{color:var(--text-secondary)}

.dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;min-height:320px;padding:44px;border:2px dashed var(--border-strong);border-radius:24px;background:linear-gradient(180deg,var(--bg-surface),color-mix(in srgb,var(--bg-surface) 55%,transparent));transition:border-color .15s,background .15s}
.dropzone.over{border-color:var(--z2);background:color-mix(in srgb,var(--z2) 9%,var(--bg-surface))}
.dropzone .dz-ico{color:var(--z2)}
.dropzone strong{font-size:1.18rem;font-weight:700;letter-spacing:-.01em}
.dropzone .dz-sub{font-size:.9rem;color:var(--text-secondary)}
.btn-pick{margin-top:6px;padding:13px 30px;border-radius:10px;border:none;cursor:pointer;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--pink);transition:background .15s}
.btn-pick:hover{background:var(--pink-h)}

.work[hidden],.results[hidden]{display:none}
.work-grid{display:grid;grid-template-columns:1fr 290px;gap:24px;align-items:start}
.flist{display:flex;flex-direction:column;gap:12px}
.fitem{display:flex;align-items:center;gap:14px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:14px}
.fitem img{width:60px;height:60px;object-fit:cover;border-radius:9px;flex:none;background:var(--bg-surface)}
.fitem .fi-meta{flex:1;min-width:0}
.fitem .fi-name{font-size:.92rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fitem .fi-size{font-size:.8rem;color:var(--text-tertiary);margin-top:2px}
.fitem .fi-x{flex:none;background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:1.2rem;line-height:1;padding:4px 8px;border-radius:8px}
.fitem .fi-x:hover{background:var(--bg-surface);color:var(--text)}
.fitem .fi-add{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;border:1px dashed var(--border-strong);border-radius:12px;color:var(--text-secondary);cursor:pointer;font-size:.88rem;font-weight:600}

.opts{position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;padding:22px;background:var(--bg);border:1px solid var(--border);border-radius:20px;box-shadow:0 18px 40px -28px rgba(0,0,0,.4)}
.opts h2{font-size:1rem;margin:0 0 2px}
.opt{display:flex;flex-direction:column;gap:7px;font-size:.86rem;font-weight:600;color:var(--text-secondary)}
.opt-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.opt select,.opt input[type=number]{padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);color:var(--text);font:inherit;font-size:.92rem;outline:none}
.opt select:focus,.opt input:focus{border-color:var(--accent)}
.opt input[type=range]{width:100%;accent-color:var(--accent)}
.opt .qv{color:var(--accent);font-weight:700}
.chk{display:flex;align-items:center;gap:9px;font-size:.88rem;font-weight:500;color:var(--text);cursor:pointer}
.chk input{width:17px;height:17px;accent-color:var(--accent)}
.seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.seg-b{padding:9px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);color:var(--text);font:inherit;font-size:.88rem;font-weight:600;cursor:pointer}
.seg-b.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.btn-go{margin-top:4px;padding:14px;border-radius:10px;border:none;cursor:pointer;font:inherit;font-size:1rem;font-weight:700;color:#fff;background:var(--pink);transition:background .15s,opacity .15s}
.btn-go:hover{background:var(--pink-h)}
.btn-go:disabled{opacity:.55;cursor:default;transform:none}
.btn-ghost{padding:11px;border-radius:12px;border:1px solid var(--border);background:none;cursor:pointer;font:inherit;font-size:.92rem;font-weight:600;color:var(--text-secondary)}
.btn-ghost:hover{border-color:var(--border-strong);color:var(--text)}

.results{margin-top:30px;padding-top:26px;border-top:1px solid var(--border)}
.results-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}
.results-hd h2{font-size:1.2rem;margin:0;display:flex;align-items:center;gap:9px}
.results-hd .ok{color:#22c55e}
.rlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.ritem{display:flex;flex-direction:column;gap:10px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:14px}
.ritem img{width:100%;height:130px;object-fit:contain;background:var(--bg-surface);border-radius:9px}
.ritem .ri-name{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ritem .ri-stat{font-size:.78rem;color:var(--text-tertiary)}
.ritem .ri-stat .down{color:#22c55e;font-weight:700}
.ritem a.dl{display:block;text-align:center;padding:9px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-size:.86rem;font-weight:700;text-decoration:none}
.soon-banner{text-align:center;padding:50px 24px;background:var(--bg-surface);border:1px solid var(--border);border-radius:22px;color:var(--text-secondary)}
.soon-banner b{display:block;font-size:1.2rem;color:var(--text);margin-bottom:8px}
.tool-ad{max-width:1000px;margin:0 auto 48px;padding:0 20px;text-align:center;min-height:90px;overflow:hidden}

/* 자르기 인터랙티브 */
.crop-wrap{position:relative;display:inline-block;max-width:100%;line-height:0;touch-action:none;user-select:none}
.crop-wrap canvas{max-width:100%;height:auto;border-radius:12px;display:block}
.crop-shade{position:absolute;inset:0;box-shadow:0 0 0 9999px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.9);cursor:move}
.crop-grid::before,.crop-grid::after{content:"";position:absolute;background:rgba(255,255,255,.4)}
.crop-grid::before{left:33.33%;right:33.33%;top:0;bottom:0;border-left:1px solid rgba(255,255,255,.4);border-right:1px solid rgba(255,255,255,.4)}
.crop-grid::after{top:33.33%;bottom:33.33%;left:0;right:0;border-top:1px solid rgba(255,255,255,.4);border-bottom:1px solid rgba(255,255,255,.4)}
.crop-h{position:absolute;width:14px;height:14px;background:#fff;border:2px solid var(--accent);border-radius:50%;z-index:2}
.crop-h.nw{left:-7px;top:-7px;cursor:nwse-resize}.crop-h.ne{right:-7px;top:-7px;cursor:nesw-resize}
.crop-h.sw{left:-7px;bottom:-7px;cursor:nesw-resize}.crop-h.se{right:-7px;bottom:-7px;cursor:nwse-resize}

/* ── Pinterest풍 구조 ── */
.phero{padding:40px 0 56px}
.phero-in{display:grid;grid-template-columns:1fr 1.05fr;gap:40px;align-items:center;max-width:1180px;margin:0 auto;padding:0 24px}
.phero-h1{font-size:clamp(2rem,4.4vw,3.1rem);font-weight:800;letter-spacing:-.03em;line-height:1.12;margin:0 0 16px;color:var(--text)}
.phero-p{font-size:1.06rem;color:var(--text-secondary);max-width:420px;margin:0 0 24px;line-height:1.55}
.phero-cta{display:flex;gap:10px;flex-wrap:wrap}
.btn-red{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 22px;border-radius:999px;border:none;cursor:pointer;font:inherit;font-size:.96rem;font-weight:700;color:#fff;background:var(--pink);text-decoration:none;transition:background .15s}
.btn-red:hover{background:var(--pink-h);color:#fff}
.btn-red.wide{width:100%;margin-top:4px}
.btn-gray{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;font:inherit;font-size:.96rem;font-weight:700;color:var(--text);background:var(--bg-surface);text-decoration:none;transition:background .15s}
.btn-gray:hover{background:var(--border)}
.phero-art{position:relative;height:360px}
.phero-art .cg{position:absolute;border-radius:18px;box-shadow:0 16px 32px -16px rgba(13,12,34,.32)}
.cg1{width:150px;height:200px;left:34%;top:0;background:linear-gradient(135deg,#ff9a9e,#fecfef);z-index:3}
.cg2{width:120px;height:120px;left:4%;top:60px;background:linear-gradient(135deg,#a1c4fd,#c2e9fb)}
.cg3{width:130px;height:160px;left:62%;top:34px;background:linear-gradient(135deg,#84fab0,#8fd3f4)}
.cg4{width:120px;height:150px;left:16%;top:184px;background:linear-gradient(135deg,#fbc2eb,#a6c1ee)}
.cg5{width:140px;height:128px;left:52%;top:214px;background:linear-gradient(135deg,#fda085,#f6d365)}
.band{background:var(--bg-surface);padding:56px 24px;text-align:center}
.band-in{max-width:620px;margin:0 auto}
.band-in h2{font-size:clamp(1.5rem,3vw,2rem);font-weight:800;margin:0 0 12px;color:var(--text)}
.band-in p{color:var(--text-secondary);margin:0;font-size:1.02rem;line-height:1.6}
.features{max-width:1040px;margin:0 auto;padding:16px 24px 56px}
.fx{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;padding:48px 0}
.fx-flip .fx-media{order:2}
.fx-text h3{font-size:clamp(1.4rem,2.6vw,1.9rem);font-weight:800;margin:0 0 12px;color:var(--text)}
.fx-text p{color:var(--text-secondary);font-size:1.05rem;line-height:1.6;margin:0 0 22px;max-width:380px}
.fx-media{display:flex;align-items:center;justify-content:center}
.fx-card{position:relative;width:100%;max-width:400px;aspect-ratio:4/3;background:var(--bg-surface);border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px}
.fxc-row{display:flex;align-items:center;gap:12px;width:100%;max-width:280px}
.fxc-lab{font-size:.8rem;color:var(--text-secondary);width:34px;font-weight:600;flex:none}
.fxc-bar{height:14px;border-radius:7px;background:var(--border-strong);flex:1}
.fxc-bar.sm{flex:none;width:30%}
.fxc-sz{font-size:.82rem;font-weight:700;color:var(--text);flex:none}
.fxc-sz.red{color:var(--pink)}
.fxc-badge{position:absolute;bottom:22px;right:24px;font-size:.76rem;font-weight:800;color:#fff;background:var(--pink);padding:5px 12px;border-radius:999px}
.fx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-content:center}
.fxg{aspect-ratio:1;background:var(--bg);border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px -5px rgba(13,12,34,.25)}
.fx-bg{overflow:hidden}
.fxb-checker{position:absolute;inset:28px;border-radius:14px;background-image:conic-gradient(#e2e2e6 90deg,#fff 0 180deg,#e2e2e6 0 270deg,#fff 0);background-size:22px 22px}
.fxb-shape{position:relative;width:118px;height:148px;border-radius:14px;background:linear-gradient(135deg,#e60023,#ff7aa0)}
.promo{position:relative;overflow:hidden}
.promo-tiles{position:absolute;inset:0;display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:1fr;gap:10px;padding:10px;z-index:0}
.promo-tiles .pt{border-radius:14px}
.promo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,var(--bg),color-mix(in srgb,var(--bg) 55%,transparent) 46%,transparent 72%)}
.promo-in{position:relative;z-index:2;max-width:1180px;margin:0 auto;padding:88px 24px;display:grid;grid-template-columns:1fr 380px;gap:40px;align-items:center}
.promo-h2{font-size:clamp(2rem,4vw,3rem);font-weight:800;letter-spacing:-.02em;line-height:1.12;margin:0;color:var(--text)}
.promo-card{background:var(--bg);border:1px solid var(--border);border-radius:18px;box-shadow:0 24px 60px -24px rgba(13,12,34,.45);padding:28px}
.promo-card h3{font-size:1.25rem;font-weight:800;margin:0 0 6px;color:var(--text)}
.promo-card p{color:var(--text-secondary);margin:0 0 18px;font-size:.92rem}
.promo-links{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.promo-links a{padding:10px;text-align:center;border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-size:.9rem;font-weight:600;transition:border-color .15s}
.promo-links a:hover{border-color:var(--text-tertiary)}
.tfoot{background:#0d0c22;color:#cfcfda}
.tfoot-in{max-width:1180px;margin:0 auto;padding:48px 24px 28px;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:32px}
.tfoot-brand{display:flex;align-items:center;gap:10px}
.tfoot-name{font-size:1.3rem;font-weight:800;color:#fff;letter-spacing:-.02em}
.tfoot-col h4{font-size:.78rem;font-weight:700;color:#fff;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em}
.tfoot-col a{display:block;color:#cfcfda;text-decoration:none;font-size:.9rem;padding:5px 0;transition:color .15s}
.tfoot-col a:hover{color:#fff}
.tfoot-bottom{max-width:1180px;margin:0 auto;padding:18px 24px 36px;border-top:1px solid rgba(255,255,255,.1);font-size:.82rem;color:#9a9aa8}
@media (max-width:860px){
  .phero-in{grid-template-columns:1fr;gap:24px}
  .phero-art{height:300px;max-width:420px}
  .fx,.fx-flip{grid-template-columns:1fr;gap:24px}
  .fx-flip .fx-media{order:0}
  .promo-in{grid-template-columns:1fr;gap:28px}
  .promo::after{background:linear-gradient(180deg,transparent,var(--bg) 55%)}
  .tfoot-in{grid-template-columns:1fr 1fr}
}
.nav-quick{display:contents}
@media (max-width:900px){
  .hero-inner{grid-template-columns:1fr;gap:40px;text-align:center}
  .hero-copy{text-align:center}
  .hero-p{margin-left:auto;margin-right:auto}
  .hero-cta,.trust{justify-content:center}
  .hero-visual{max-width:460px;margin:0 auto;width:100%}
  .steps{grid-template-columns:1fr}
}
@media (max-width:780px){
  .work-grid{grid-template-columns:1fr}
  .opts{position:static}
  .hero{padding:40px 0 48px}
}
@media (max-width:680px){
  .nav-quick{display:none}
  .tools-page .header .nav{gap:14px}
}
`;

// 도구 사이트 공통 <head>
function toolHead(title, desc, origin, canonical, adsHead) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${THEME_HEAD}
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(origin + canonical)}" />
<link rel="canonical" href="${escapeHtml(origin + canonical)}" />
<link rel="icon" href="${TOOL_FAVICON}" type="image/svg+xml" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap">
${adsHead ? `<link rel="dns-prefetch" href="//pagead2.googlesyndication.com">${adsHead}` : ""}
<style>${DS_CSS}${TOOLS_CSS}</style>`;
}

// 도구 사이트 헤더
function renderToolsHeader() {
  const quick = TOOLS.filter(t => t.ready).slice(0, 4)
    .map(t => `<a href="/${t.slug}">${escapeHtml(t.name)}</a>`).join("");
  return `<header class="header"><div class="header-in">
<a href="/" class="brand" aria-label="${TOOL_BRAND}"><span class="brand-glyph">${TOOL_LOGO_SVG}</span><span class="logo-serif" style="color:var(--text)">${TOOL_BRAND}</span><span style="color:#e60023;font-size:1.4rem;font-weight:800">.</span></a>
<nav class="nav"><span class="nav-quick">${quick}</span><a href="/#tools">전체 도구</a><button class="theme-toggle" onclick="toggleTheme()" aria-label="다크모드 전환" title="다크모드 전환">🌓</button></nav>
</div></header>`;
}

function renderToolsFooter() {
  const links = TOOLS.filter(t => t.ready).map(t => `<a href="/${t.slug}">${escapeHtml(t.name)}</a>`).join("");
  return `<footer class="tfoot"><div class="tfoot-in">
<div class="tfoot-brand"><span class="brand-glyph">${TOOL_LOGO_SVG}</span><span class="tfoot-name">${TOOL_BRAND}</span></div>
<div class="tfoot-col"><h4>도구</h4>${links}</div>
<div class="tfoot-col"><h4>회사</h4><a href="/about">소개</a><a href="/contact">문의</a></div>
<div class="tfoot-col"><h4>정책</h4><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></div>
</div>
<div class="tfoot-bottom">© ${new Date().getFullYear()} ${TOOL_BRAND}. 모든 처리는 브라우저에서 이루어지며 이미지는 서버로 전송되지 않습니다.</div>
</footer>`;
}

// 홈: 히어로 + 카테고리별 도구 그리드
function renderToolsHome(origin, settings) {
  settings = settings || {};
  const adsHead = settings.adsense_code || "";
  const adBottom = sanitizeAdHtml(settings.ad_bottom_html || "");
  const col = (t) => (t.grad.match(/#[0-9a-f]{6}/i) || ["#e60023"])[0];
  const feature = (media, title, desc, btn, href, flip) => `<div class="fx${flip ? ' fx-flip' : ''}"><div class="fx-media">${media}</div><div class="fx-text"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p><a class="btn-red" href="${href}">${escapeHtml(btn)}</a></div></div>`;
  const m1 = `<div class="fx-card"><div class="fxc-row"><span class="fxc-lab">원본</span><span class="fxc-bar"></span><span class="fxc-sz">2.4MB</span></div><div class="fxc-row"><span class="fxc-lab">압축</span><span class="fxc-bar sm"></span><span class="fxc-sz red">670KB</span></div><span class="fxc-badge">−72% 절감</span></div>`;
  const m2 = `<div class="fx-card fx-grid">${TOOLS.slice(0, 6).map(t => `<span class="fxg" style="color:${col(t)}">${toolSvg(t.icon, 24)}</span>`).join("")}</div>`;
  const m3 = `<div class="fx-card fx-bg"><span class="fxb-checker"></span><span class="fxb-shape"></span></div>`;
  const PALETTE = ["#fde2e4","#dfe7fd","#e2ece9","#fff1e6","#cddafd","#fad2e1","#bee1e6","#f0efeb","#e8e8e4","#f9f7f0","#d8e2dc","#ece4db"];
  const tiles = Array.from({ length: 30 }).map((_, i) => `<span class="pt" style="background:${PALETTE[i % PALETTE.length]}"></span>`).join("");
  const card = (t) => {
    const ai = (t.slug === "remove-bg" || t.slug === "upscale") ? ' data-ai="1"' : '';
    const thumb = `<div class="shot-thumb"><span class="ti">${toolSvg(t.icon, 44)}</span>${t.ready ? "" : '<span class="badge-soon">준비 중</span>'}</div>`;
    const foot = `<div class="shot-foot"><div><p class="shot-name">${escapeHtml(t.name)}</p><p class="shot-sub">${escapeHtml(t.tagline)}</p></div><span class="shot-tag">${t.ready ? "무료" : "준비"}</span></div>`;
    if (!t.ready) return `<div class="shot soon" data-cat="${escapeHtml(t.cat)}"${ai}>${thumb}${foot}</div>`;
    return `<a class="shot" href="/${t.slug}" data-cat="${escapeHtml(t.cat)}"${ai}>${thumb}${foot}</a>`;
  };
  const pills = `<div class="filters"><button class="fpill on" data-c="all">전체</button>${TOOL_CATS.map(c => `<button class="fpill" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}</div>`;
  const grid = `<section class="tools-band"><main class="wrap" id="tools" style="padding:40px 24px 56px">${pills}<div class="shot-grid">${TOOLS.map(card).join("")}</div></main></section>`;

  return `<!doctype html>
<html lang="ko">
<head>${toolHead(`${TOOL_BRAND} — 무료 온라인 이미지 도구`, "압축·리사이즈·자르기·포맷 변환·회전·워터마크까지. 설치 없이 브라우저에서 바로 처리하는 무료 이미지 편집 도구.", origin, "/", adsHead)}</head>
<body class="tools-page">
${renderToolsHeader()}
<section class="phero">
<div class="phero-in">
<div class="phero-copy">
<h1 class="phero-h1">이미지를 더 가볍고<br>선명하게</h1>
<p class="phero-p">압축·리사이즈·자르기부터 AI 배경 제거까지. 설치도 회원가입도 없이 브라우저에서 바로.</p>
<div class="phero-cta"><a class="btn-red" href="/compress">무료로 시작하기</a><a class="btn-gray" href="#features">도구 둘러보기</a></div>
</div>
<div class="phero-art" aria-hidden="true">
<span class="cg cg1"></span><span class="cg cg2"></span><span class="cg cg3"></span><span class="cg cg4"></span><span class="cg cg5"></span>
</div>
</div>
</section>
${grid}
<main id="features" class="features">
${feature(m1, "스마트 압축", "화질은 그대로, 용량만 줄이세요. JPG·PNG·WebP를 한 번에 압축합니다.", "지금 시도하기", "/compress", false)}
${feature(m2, "8가지 도구를 한 곳에서", "압축·리사이즈·자르기·회전·변환·워터마크까지, 필요한 편집이 전부 모여 있어요.", "도구 보기", "/resize", true)}
${feature(m3, "AI로 배경 제거·업스케일", "클릭 한 번으로 누끼를 따고 해상도를 키우세요. 전부 브라우저에서 처리됩니다.", "자세히 보기", "/remove-bg", false)}
</main>
${adBottom ? `<div class="tool-ad">${adBottom}</div>` : ""}
${renderToolsFooter()}
<script>(function(){var ps=document.querySelectorAll('.fpill');var cs=document.querySelectorAll('.shot[data-cat]');function apply(c){for(var k=0;k<cs.length;k++){var s=cs[k];var show=c==='all'?true:(c==='ai'?s.getAttribute('data-ai')==='1':s.getAttribute('data-cat')===c);s.style.display=show?'':'none';}}for(var i=0;i<ps.length;i++){ps[i].addEventListener('click',function(){for(var j=0;j<ps.length;j++)ps[j].classList.remove('on');this.classList.add('on');apply(this.getAttribute('data-c'));});}})();</script>
</body></html>`;
}

// 도구별 옵션 패널 HTML
function renderToolOptions(slug) {
  if (slug === "compress") return `
<label class="opt">출력 형식<select id="o-format"><option value="keep">원본 유지</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label>
<label class="opt">품질 <span class="qv" id="o-qv">80%</span><input id="o-quality" type="range" min="40" max="95" value="80" oninput="document.getElementById('o-qv').textContent=this.value+'%'"></label>
<label class="opt">최대 너비 (px, 선택)<input id="o-maxw" type="number" min="0" placeholder="제한 없음"></label>`;
  if (slug === "resize") return `
<div class="opt-row"><label class="opt">너비<input id="o-w" type="number" min="1" placeholder="px"></label><label class="opt">높이<input id="o-h" type="number" min="1" placeholder="px"></label></div>
<label class="chk"><input id="o-aspect" type="checkbox" checked> 비율 유지</label>
<label class="opt">또는 비율(%)<input id="o-pct" type="number" min="1" max="500" placeholder="예: 50"></label>`;
  if (slug === "convert") return `
<label class="opt">변환 형식<select id="o-format"><option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
<label class="opt">품질 <span class="qv" id="o-qv">90%</span><input id="o-quality" type="range" min="40" max="100" value="90" oninput="document.getElementById('o-qv').textContent=this.value+'%'"></label>`;
  if (slug === "rotate") return `
<div class="opt">회전 각도<div class="seg" id="o-seg"><button type="button" class="seg-b on" data-a="90">90°</button><button type="button" class="seg-b" data-a="180">180°</button><button type="button" class="seg-b" data-a="270">270°</button><button type="button" class="seg-b" data-a="0">없음</button></div></div>
<input type="hidden" id="o-angle" value="90">
<label class="chk"><input id="o-fh" type="checkbox"> 좌우 반전</label>
<label class="chk"><input id="o-fv" type="checkbox"> 상하 반전</label>`;
  if (slug === "crop") return `
<div class="opt">비율<div class="seg" id="o-ratio"><button type="button" class="seg-b on" data-r="0">자유</button><button type="button" class="seg-b" data-r="1">1:1</button><button type="button" class="seg-b" data-r="1.3333">4:3</button><button type="button" class="seg-b" data-r="1.5">3:2</button><button type="button" class="seg-b" data-r="1.7778">16:9</button></div></div>
<input type="hidden" id="o-ratio-v" value="0">
<p style="font-size:.82rem;color:var(--text-tertiary);margin:0;line-height:1.5">박스를 끌어 영역을 지정하세요. 모서리로 크기 조절, 안쪽을 끌어 이동합니다.</p>`;
  if (slug === "watermark") return `
<label class="opt">워터마크 텍스트<input id="o-wm-text" type="text" value="© ${escapeHtml(TOOL_BRAND)}" placeholder="텍스트 입력" style="padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);color:var(--text);font:inherit;font-size:.92rem"></label>
<label class="opt">위치<select id="o-wm-pos"><option value="br">오른쪽 아래</option><option value="bl">왼쪽 아래</option><option value="tr">오른쪽 위</option><option value="tl">왼쪽 위</option><option value="c">가운데</option><option value="tile">바둑판(반복)</option></select></label>
<label class="opt">크기 <span class="qv" id="o-wm-sv">5%</span><input id="o-wm-size" type="range" min="2" max="15" value="5" oninput="document.getElementById('o-wm-sv').textContent=this.value+'%'"></label>
<label class="opt">불투명도 <span class="qv" id="o-wm-ov">50%</span><input id="o-wm-opacity" type="range" min="10" max="100" value="50" oninput="document.getElementById('o-wm-ov').textContent=this.value+'%'"></label>
<label class="opt">색상<span class="seg"><label class="chk" style="gap:6px"><input type="radio" name="wmc" value="#ffffff" checked> 흰색</label><label class="chk" style="gap:6px"><input type="radio" name="wmc" value="#000000"> 검정</label></span></label>`;
  if (slug === "upscale") return `
<div class="opt">배율<div class="seg" id="o-scale-seg"><button type="button" class="seg-b on" data-s="2">2×</button><button type="button" class="seg-b" data-s="4">4×</button></div></div>
<input type="hidden" id="o-scale" value="2">
<label class="chk"><input id="o-ai" type="checkbox" checked> AI 초해상도(ESRGAN) 사용</label>
<p style="font-size:.8rem;color:var(--text-tertiary);margin:0;line-height:1.5">AI 모델로 디테일을 복원해 선명하게 키웁니다. 첫 실행 시 모델 로딩으로 수십 초, 큰 이미지는 더 걸릴 수 있어요. 끄면 빠른 고품질 보간으로 처리합니다.</p>`;
  if (slug === "remove-bg") return `
<p style="font-size:.86rem;color:var(--text-secondary);margin:0;line-height:1.6">AI가 피사체를 인식해 배경을 투명하게 제거합니다(PNG).</p>
<p style="font-size:.8rem;color:var(--text-tertiary);margin:0;line-height:1.5">처음 실행 시 AI 모델을 내려받느라 수십 초 걸릴 수 있습니다. 모든 처리는 브라우저에서 진행돼요.</p>`;
  return "";
}

// 도구 페이지
function renderToolPage(tool, origin, settings) {
  settings = settings || {};
  const adsHead = settings.adsense_code || "";
  const adBottom = sanitizeAdHtml(settings.ad_bottom_html || "");
  const adBlock = adBottom ? `<div class="tool-ad">${adBottom}</div>` : "";
  const title = `${tool.name} — ${TOOL_BRAND}`;
  const chip = `<span class="tool-chip" style="background:${tool.grad}">${toolSvg(tool.icon, 32)}</span>`;
  const head = `<head>${toolHead(title, tool.tagline, origin, "/" + tool.slug, adsHead)}</head>`;

  if (!tool.ready) {
    return `<!doctype html>
<html lang="ko">${head}
<body class="tools-page">${renderToolsHeader()}
<main class="tool-main"><div class="crumb"><a href="/">홈</a> / ${escapeHtml(tool.name)}</div>
<div class="tool-hd">${chip}<h1>${escapeHtml(tool.name)}</h1><p>${escapeHtml(tool.tagline)}</p></div>
<div class="soon-banner"><b>곧 제공됩니다</b>이 도구는 준비 중이에요. 먼저 <a href="/compress">압축</a>·<a href="/resize">크기 조절</a>·<a href="/convert">포맷 변환</a>·<a href="/rotate">회전</a>을 사용해 보세요.</div>
</main>${adBlock}${renderToolsFooter()}</body></html>`;
  }

  return `<!doctype html>
<html lang="ko">${head}
<body class="tools-page">${renderToolsHeader()}
<main class="tool-main">
<div class="crumb"><a href="/">홈</a> / ${escapeHtml(tool.name)}</div>
<div class="tool-hd">${chip}<h1>${escapeHtml(tool.name)}</h1><p>${escapeHtml(tool.tagline)}</p></div>
<section class="tool-panel">
<div id="drop" class="dropzone">
<input id="file" type="file" accept="${tool.accept}" multiple hidden>
<span class="dz-ico">${toolSvg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>', 46)}</span>
<strong>이미지를 끌어다 놓으세요</strong>
<span class="dz-sub">또는 붙여넣기(Ctrl+V) · 여러 장 가능</span>
<button type="button" class="btn-pick" id="pick">이미지 선택</button>
</div>
<div id="work" class="work" hidden>
<div class="work-grid">
<div id="flist" class="flist"></div>
<aside class="opts"><h2>옵션</h2>${renderToolOptions(tool.slug)}<button id="go" class="btn-go">처리하기</button><button id="reset" class="btn-ghost">초기화</button></aside>
</div>
<div id="results" class="results" hidden>
<div class="results-hd"><h2><span class="ok">${toolSvg('<path d="M20 6 9 17l-5-5"/>',22)}</span> 처리 완료</h2><button id="dlall" class="btn-go" style="padding:10px 20px">전체 다운로드</button></div>
<div id="rlist" class="rlist"></div>
</div>
</div>
</section>
</main>${adBlock}${renderToolsFooter()}
<script>window.__TOOL__=${JSON.stringify(tool.slug)};</script>
<script>${TOOL_ENGINE_JS}</script>
</body></html>`;
}

// 클라이언트 이미지 처리 엔진 (Canvas) — 평문 JS (템플릿 리터럴/$ 미사용)
const TOOL_ENGINE_JS = `
(function(){
  var TOOL = window.__TOOL__;
  var files = [];
  var drop = document.getElementById('drop');
  var input = document.getElementById('file');
  var work = document.getElementById('work');
  var flist = document.getElementById('flist');
  var results = document.getElementById('results');
  var rlist = document.getElementById('rlist');
  var go = document.getElementById('go');

  function fmtSize(n){ if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(1)+' KB'; return (n/1048576).toFixed(2)+' MB'; }
  function val(id){ var e=document.getElementById(id); return e?e.value:''; }
  function num(id){ var v=parseFloat(val(id)); return isNaN(v)?0:v; }
  function chk(id){ var e=document.getElementById(id); return e?e.checked:false; }
  function mimeExt(m){ return m==='image/jpeg'?'jpg':m==='image/webp'?'webp':m==='image/png'?'png':'img'; }

  function addFiles(fl){
    var arr = Array.prototype.slice.call(fl).filter(function(f){ return f && f.type && f.type.indexOf('image/')===0; });
    if(!arr.length) return;
    if(TOOL==='crop'){
      files.forEach(function(f){ URL.revokeObjectURL(f.url); });
      var f0 = arr[0];
      files = [{ file:f0, name:f0.name||'image', url:URL.createObjectURL(f0), size:f0.size }];
      work.hidden = false; results.hidden = true;
      buildCrop(files[0]);
      return;
    }
    arr.forEach(function(f){ files.push({ file:f, name:f.name||'image', url:URL.createObjectURL(f), size:f.size }); });
    renderList();
    work.hidden = false;
    results.hidden = true;
  }

  // ── 자르기 인터랙티브 ──
  var cropImg = null, cropState = null;
  function buildCrop(it){
    flist.innerHTML = '<div class="crop-wrap" id="cropWrap"><canvas id="cropCanvas"></canvas><div class="crop-shade crop-grid" id="cropBox"><span class="crop-h nw"></span><span class="crop-h ne"></span><span class="crop-h sw"></span><span class="crop-h se"></span></div></div>';
    loadImage(it.file).then(function(img){
      cropImg = img; var natW=img.width, natH=img.height;
      var host = document.getElementById('cropWrap').parentElement;
      var maxW = Math.min(natW, (host && host.clientWidth) || 640, 640);
      var sc = maxW/natW, dw = Math.round(maxW), dh = Math.round(natH*sc);
      var cv = document.getElementById('cropCanvas'); cv.width=dw; cv.height=dh;
      cv.getContext('2d').drawImage(img,0,0,dw,dh);
      cropState = { natW:natW, natH:natH, sc:sc, dw:dw, dh:dh, box:{x:0,y:0,w:dw,h:dh} };
      var bw=Math.round(dw*0.8), bh=Math.round(dh*0.8);
      setBox((dw-bw)/2,(dh-bh)/2,bw,bh,'se');
      attachCropHandlers();
    });
  }
  function setBox(x,y,w,h,mode){
    if(!cropState) return;
    var dw=cropState.dw, dh=cropState.dh, minS=24;
    var ratio = parseFloat((document.getElementById('o-ratio-v')||{}).value)||0;
    if(w<minS) w=minS; if(h<minS) h=minS;
    if(ratio>0 && mode && mode!=='move'){ h=w/ratio; }
    if(w>dw) w=dw; if(h>dh) h=dh;
    if(ratio>0 && mode && mode!=='move'){ if(h>dh){ h=dh; w=h*ratio; } if(w>dw){ w=dw; h=w/ratio; } }
    if(x<0)x=0; if(y<0)y=0; if(x+w>dw)x=dw-w; if(y+h>dh)y=dh-h;
    cropState.box={x:x,y:y,w:w,h:h};
    var box=document.getElementById('cropBox');
    box.style.left=x+'px'; box.style.top=y+'px'; box.style.width=w+'px'; box.style.height=h+'px';
  }
  function attachCropHandlers(){
    var wrap=document.getElementById('cropWrap'), box=document.getElementById('cropBox');
    var mode=null, sx=0, sy=0, orig=null;
    function pt(e){ var r=wrap.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
    wrap.addEventListener('pointerdown', function(e){
      var t=e.target;
      if(t.classList && t.classList.contains('crop-h')) mode=t.classList[1];
      else if(t===box) mode='move'; else return;
      e.preventDefault(); var p=pt(e); sx=p.x; sy=p.y; orig={x:cropState.box.x,y:cropState.box.y,w:cropState.box.w,h:cropState.box.h};
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    });
    wrap.addEventListener('pointermove', function(e){
      if(!mode) return; var p=pt(e); var dx=p.x-sx, dy=p.y-sy; var b={x:orig.x,y:orig.y,w:orig.w,h:orig.h};
      if(mode==='move'){ b.x=orig.x+dx; b.y=orig.y+dy; }
      else if(mode==='se'){ b.w=orig.w+dx; b.h=orig.h+dy; }
      else if(mode==='sw'){ b.x=orig.x+dx; b.w=orig.w-dx; b.h=orig.h+dy; }
      else if(mode==='ne'){ b.y=orig.y+dy; b.w=orig.w+dx; b.h=orig.h-dy; }
      else if(mode==='nw'){ b.x=orig.x+dx; b.y=orig.y+dy; b.w=orig.w-dx; b.h=orig.h-dy; }
      setBox(b.x,b.y,b.w,b.h,mode);
    });
    function end(){ mode=null; }
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  }
  function runCrop(){
    if(!cropState||!cropImg) return;
    var b=cropState.box, sc=cropState.sc;
    var sx=Math.max(0,Math.round(b.x/sc)), sy=Math.max(0,Math.round(b.y/sc));
    var sw=Math.round(b.w/sc), sh=Math.round(b.h/sc);
    var cv=document.createElement('canvas'); cv.width=sw; cv.height=sh;
    var ctx=cv.getContext('2d');
    var it=files[0]; var mime=it.file.type||'image/png';
    if(mime==='image/jpeg'){ ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,sw,sh); }
    ctx.drawImage(cropImg, sx,sy,sw,sh, 0,0,sw,sh);
    var q=(mime==='image/png')?undefined:0.92;
    cv.toBlob(function(blob){
      var base=it.name.replace(/\\.[^.]+$/,'');
      showResults([{ blob:blob, name:base+'-cropped.'+mimeExt(mime), inSize:it.size, url:URL.createObjectURL(blob) }]);
    }, mime, q);
  }

  function renderList(){
    var html='';
    files.forEach(function(it,i){
      html += '<div class="fitem"><img src="'+it.url+'" alt=""><div class="fi-meta"><div class="fi-name">'+escapeText(it.name)+'</div><div class="fi-size">'+fmtSize(it.size)+'</div></div><button class="fi-x" data-i="'+i+'" title="제거">&times;</button></div>';
    });
    html += '<div class="fitem fi-add" id="more">+ 이미지 추가</div>';
    flist.innerHTML = html;
    Array.prototype.forEach.call(flist.querySelectorAll('.fi-x'), function(b){
      b.onclick = function(){ var i=parseInt(b.getAttribute('data-i'),10); URL.revokeObjectURL(files[i].url); files.splice(i,1); if(!files.length){ work.hidden=true; } renderList(); };
    });
    var more = document.getElementById('more'); if(more) more.onclick = function(){ input.click(); };
  }
  function escapeText(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function loadImage(file){
    if(window.createImageBitmap){
      return createImageBitmap(file).catch(function(){ return loadViaTag(file); });
    }
    return loadViaTag(file);
  }
  function loadViaTag(file){
    return new Promise(function(res,rej){ var u=URL.createObjectURL(file); var im=new Image(); im.onload=function(){ res(im); }; im.onerror=function(){ rej(new Error('load')); }; im.src=u; });
  }
  function toBlob(canvas, mime, q){
    return new Promise(function(res){ canvas.toBlob(function(b){ res(b); }, mime, q); });
  }

  function readOpts(){
    var q = num('o-quality');
    var wmc = document.querySelector('input[name=wmc]:checked');
    return {
      format: val('o-format'),
      quality: q? q/100 : 0.9,
      maxW: num('o-maxw'),
      w: num('o-w'), h: num('o-h'), pct: num('o-pct'), aspect: chk('o-aspect'),
      angle: num('o-angle'), flipH: chk('o-fh'), flipV: chk('o-fv'),
      wmText: val('o-wm-text'), wmPos: val('o-wm-pos'), wmSize: num('o-wm-size'),
      wmOpacity: (num('o-wm-opacity')||50)/100, wmColor: (wmc&&wmc.value)||'#ffffff',
      upScale: num('o-scale')||2, upAI: chk('o-ai')
    };
  }

  // ── 업스케일 (AI: UpscalerJS/ESRGAN, 실패 시 보간 폴백) ──
  function finalizeUpscale(srcCanvasOrImg, it, scale){
    var mime=it.file.type||'image/png', q=(mime==='image/png')?undefined:0.95;
    var oc=srcCanvasOrImg;
    return toBlob(oc, mime, q).then(function(blob){
      var base=it.name.replace(/\\.[^.]+$/,'');
      return { blob:blob, name:base+'-'+scale+'x.'+mimeExt(mime), inSize:it.size, url:URL.createObjectURL(blob) };
    });
  }
  // 고품질 보간(단계적 2배)
  function interpCanvas(img, scale){
    var iw=img.width, ih=img.height, targetW=Math.round(iw*scale), targetH=Math.round(ih*scale);
    var cur=document.createElement('canvas'); cur.width=iw; cur.height=ih; cur.getContext('2d').drawImage(img,0,0);
    var cw=iw, chh=ih;
    while(cw < targetW){
      var nw=Math.min(targetW, cw*2), nh=Math.min(targetH, chh*2);
      var nx=document.createElement('canvas'); nx.width=nw; nx.height=nh;
      var c=nx.getContext('2d'); c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high';
      c.drawImage(cur,0,0,nw,nh); cur=nx; cw=nw; chh=nh;
    }
    if(cw!==targetW || chh!==targetH){
      var f=document.createElement('canvas'); f.width=targetW; f.height=targetH;
      var fc=f.getContext('2d'); fc.imageSmoothingEnabled=true; fc.imageSmoothingQuality='high';
      fc.drawImage(cur,0,0,targetW,targetH); cur=f;
    }
    return cur;
  }
  var _upscaler=null;
  function loadUpscaler(){
    if(_upscaler) return _upscaler;
    _upscaler = Promise.all([
      import('https://esm.sh/@tensorflow/tfjs@4.22.0'),
      import('https://esm.sh/upscaler@1.0.0-beta.19?deps=@tensorflow/tfjs@4.22.0')
    ]).then(function(mods){
      var tf=mods[0], Upscaler=mods[1].default||mods[1];
      return tf.ready().then(function(){ return new Upscaler(); });
    });
    return _upscaler;
  }
  function upscaleOne(it){
    var o=readOpts(), scale=o.upScale||2, useAI=(o.upAI!==false);
    return loadImage(it.file).then(function(img){
      if(!useAI){ return finalizeUpscale(interpCanvas(img, scale), it, scale); }
      var c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').drawImage(img,0,0);
      var src=c.toDataURL('image/png');
      return loadUpscaler().then(function(up){
        var passes = scale>=4 ? 2 : 1; // 기본 모델 2배 → 4배는 2회
        function pass(input, n){
          if(n<=0) return Promise.resolve(input);
          return up.upscale(input, { output:'base64', patchSize:64, padding:6 }).then(function(out){ return pass(out, n-1); });
        }
        return pass(src, passes).then(function(b64){
          return new Promise(function(res,rej){ var im=new Image(); im.onload=function(){res(im);}; im.onerror=function(){rej(new Error('decode'));}; im.src=b64; });
        }).then(function(im){
          var tW=Math.round(img.width*scale), tH=Math.round(img.height*scale);
          var oc=document.createElement('canvas'); oc.width=tW; oc.height=tH;
          var octx=oc.getContext('2d'); octx.imageSmoothingEnabled=true; octx.imageSmoothingQuality='high';
          octx.drawImage(im,0,0,tW,tH);
          return finalizeUpscale(oc, it, scale);
        });
      }).catch(function(){ return finalizeUpscale(interpCanvas(img, scale), it, scale); });
    });
  }
  // 순차 처리(AI는 GPU 메모리 보호 위해 한 장씩)
  function runSeq(items, fn, label){
    var res=[];
    return items.reduce(function(p, it, i){
      return p.then(function(){ go.textContent = label+' ('+(i+1)+'/'+items.length+')'; return fn(it).then(function(r){ res.push(r); }); });
    }, Promise.resolve()).then(function(){ return res; });
  }

  // ── 배경 제거: @imgly/background-removal 지연 로드 ──
  var _rmbg=null;
  function loadRmbg(){
    if(_rmbg) return _rmbg;
    _rmbg = import('https://esm.sh/@imgly/background-removal@1.5.5')
      .then(function(m){ return m.removeBackground || (m.default && m.default.removeBackground); });
    return _rmbg;
  }
  function removeBgOne(it){
    return loadRmbg().then(function(removeBackground){
      if(typeof removeBackground !== 'function') throw new Error('모델 로드 실패');
      return removeBackground(it.file);
    }).then(function(blob){
      var base=it.name.replace(/\\.[^.]+$/,'');
      return { blob:blob, name:base+'-nobg.png', inSize:it.size, url:URL.createObjectURL(blob) };
    });
  }

  function drawWatermark(ctx, W, H, o){
    var text = (o.wmText||'').trim(); if(!text) return;
    var fs = Math.max(10, Math.round(Math.min(W,H) * (o.wmSize||5) / 100));
    ctx.font = '700 ' + fs + 'px Pretendard, "Noto Sans KR", sans-serif';
    ctx.fillStyle = o.wmColor; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = fs*0.15;
    var pad = Math.round(fs*0.7);
    var tw = ctx.measureText(text).width;
    if(o.wmPos === 'tile'){
      ctx.globalAlpha = o.wmOpacity*0.7; ctx.textAlign='left';
      ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(-Math.PI/6); ctx.translate(-W/2,-H/2);
      var stepX = tw + fs*3, stepY = fs*4;
      for(var y=-H; y<H*2; y+=stepY){ for(var x=-W; x<W*2; x+=stepX){ ctx.fillText(text,x,y); } }
      ctx.restore();
    } else {
      ctx.globalAlpha = o.wmOpacity; var x,y;
      if(o.wmPos === 'c'){ ctx.textAlign='center'; x=W/2; y=H/2; }
      else { ctx.textAlign='left'; y = (o.wmPos.charAt(0)==='t')? pad+fs/2 : H-pad-fs/2; x = (o.wmPos.charAt(1)==='l')? pad : W-pad-tw; }
      ctx.fillText(text,x,y);
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }

  function targetMime(o, origType){
    if(TOOL==='compress') return o.format==='keep' ? (origType||'image/jpeg') : ('image/'+o.format);
    if(TOOL==='convert') return 'image/'+(o.format||'jpeg');
    return origType || 'image/png';
  }

  function processOne(it){
    return loadImage(it.file).then(function(img){
      var iw=img.width, ih=img.height, o=readOpts();
      var drawW=iw, drawH=ih, rotate=0, fh=false, fv=false;

      if(TOOL==='resize'){
        if(o.pct>0){ drawW=iw*o.pct/100; drawH=ih*o.pct/100; }
        else if(o.w>0 && o.h>0){ if(o.aspect){ var r=Math.min(o.w/iw,o.h/ih); drawW=iw*r; drawH=ih*r; } else { drawW=o.w; drawH=o.h; } }
        else if(o.w>0){ drawW=o.w; drawH=o.aspect? ih*(o.w/iw): ih; }
        else if(o.h>0){ drawH=o.h; drawW=o.aspect? iw*(o.h/ih): iw; }
      } else if(TOOL==='compress'){
        if(o.maxW>0 && iw>o.maxW){ var s=o.maxW/iw; drawW=o.maxW; drawH=ih*s; }
      } else if(TOOL==='rotate'){
        rotate=o.angle||0; fh=o.flipH; fv=o.flipV;
      }

      var swap = (rotate===90||rotate===270);
      var cw = swap? drawH : drawW, chh = swap? drawW : drawH;
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cw)); canvas.height = Math.max(1, Math.round(chh));
      var ctx = canvas.getContext('2d');
      var mime = targetMime(o, it.file.type);
      if(mime==='image/jpeg'){ ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.translate(canvas.width/2, canvas.height/2);
      if(rotate) ctx.rotate(rotate*Math.PI/180);
      ctx.scale(fh?-1:1, fv?-1:1);
      ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);

      if(TOOL==='watermark'){ ctx.setTransform(1,0,0,1,0,0); drawWatermark(ctx, canvas.width, canvas.height, o); }

      var q = (mime==='image/png') ? undefined : o.quality;
      return toBlob(canvas, mime, q).then(function(blob){
        var base = it.name.replace(/\\.[^.]+$/, '');
        var suffix = {compress:'-compressed',resize:'-resized',convert:'',rotate:'-rotated',watermark:'-wm'}[TOOL]||'';
        return { blob:blob, name: base+suffix+'.'+mimeExt(mime), inSize: it.size, url: URL.createObjectURL(blob) };
      });
    });
  }

  function showResults(res){
    rlist.innerHTML = res.map(function(r){
      var diff = r.inSize>0 ? Math.round((1 - r.blob.size/r.inSize)*100) : 0;
      var stat = (TOOL==='compress' || TOOL==='convert')
        ? fmtSize(r.inSize)+' → '+fmtSize(r.blob.size)+(diff>0?' <span class="down">−'+diff+'%</span>':'')
        : fmtSize(r.blob.size);
      return '<div class="ritem"><img src="'+r.url+'" alt=""><div class="ri-name">'+escapeText(r.name)+'</div><div class="ri-stat">'+stat+'</div><a class="dl" href="'+r.url+'" download="'+escapeText(r.name)+'">다운로드</a></div>';
    }).join('');
    results.hidden=false;
    go.disabled=false; go.textContent='처리하기';
    results.scrollIntoView({behavior:'smooth',block:'nearest'});
    window.__RESULTS__ = res;
  }
  function run(){
    if(!files.length) return;
    go.disabled=true; go.textContent='처리 중…';
    function onErr(e){ go.disabled=false; go.textContent='처리하기'; alert('이미지를 처리하지 못했습니다: '+(e&&e.message||e)); }
    if(TOOL==='crop'){ try{ runCrop(); }catch(e){ go.disabled=false; go.textContent='처리하기'; alert('자르기 실패: '+(e&&e.message||e)); } return; }
    if(TOOL==='upscale'){ go.textContent='AI 모델 로딩…'; runSeq(files, upscaleOne, 'AI 업스케일 중…').then(showResults).catch(onErr); return; }
    if(TOOL==='remove-bg'){ go.textContent='AI 모델 로딩…'; runSeq(files, removeBgOne, 'AI 배경 제거 중…').then(showResults).catch(onErr); return; }
    Promise.all(files.map(processOne)).then(showResults).catch(onErr);
  }

  // 회전 세그먼트
  var seg = document.getElementById('o-seg');
  if(seg){ Array.prototype.forEach.call(seg.querySelectorAll('.seg-b'), function(b){ b.onclick=function(){ seg.querySelectorAll('.seg-b').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); document.getElementById('o-angle').value=b.getAttribute('data-a'); }; }); }

  // 업스케일 배율 세그먼트
  var sseg = document.getElementById('o-scale-seg');
  if(sseg){ Array.prototype.forEach.call(sseg.querySelectorAll('.seg-b'), function(b){ b.onclick=function(){ sseg.querySelectorAll('.seg-b').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); document.getElementById('o-scale').value=b.getAttribute('data-s'); }; }); }

  // 자르기 비율 세그먼트
  var rseg = document.getElementById('o-ratio');
  if(rseg){ Array.prototype.forEach.call(rseg.querySelectorAll('.seg-b'), function(b){ b.onclick=function(){ rseg.querySelectorAll('.seg-b').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); document.getElementById('o-ratio-v').value=b.getAttribute('data-r'); if(cropState){ var bx=cropState.box; setBox(bx.x,bx.y,bx.w,bx.h,'se'); } }; }); }

  // 입력/드래그/붙여넣기
  var pick = document.getElementById('pick');
  if(pick) pick.onclick=function(){ input.click(); };
  input.onchange=function(){ addFiles(input.files); input.value=''; };
  drop.addEventListener('click', function(e){ if(e.target===drop || e.target.classList.contains('dz-ico') || e.target.tagName==='STRONG' || e.target.classList.contains('dz-sub')) input.click(); });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); if(ev==='dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function(e){ if(e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  window.addEventListener('paste', function(e){ if(e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) addFiles(e.clipboardData.files); });

  go.onclick=run;
  var reset=document.getElementById('reset');
  if(reset) reset.onclick=function(){ files.forEach(function(f){URL.revokeObjectURL(f.url);}); files=[]; flist.innerHTML=''; work.hidden=true; results.hidden=true; };
  var dlall=document.getElementById('dlall');
  if(dlall) dlall.onclick=function(){ var rs=window.__RESULTS__||[]; rs.forEach(function(r,i){ setTimeout(function(){ var a=document.createElement('a'); a.href=r.url; a.download=r.name; document.body.appendChild(a); a.click(); a.remove(); }, i*220); }); };
})();
`;


/* ──── 🎨 [수정 가능] 홈페이지 ────────────────────────────────────────────────
   CSS 스타일, 카드 레이아웃, 색상, 폰트, 사이드바 등을 자유롭게 변경하세요.
   ⚠️ 함수명 renderHomePage(settings, posts, summary, activeCat, searchQuery) 유지 필수
   ⚠️ settings, posts, summary 데이터 속성명 변경 불가
   사용 가능한 데이터:
     settings: blog_name, blog_description, profile_name, profile_image, categories, theme_color, ...
     posts[]: id, title, slug, excerpt, category, thumbnail, publish_at, created_at, views
     summary: published_posts, total_views
     activeCat: 현재 선택된 카테고리 (문자열 또는 빈값)
     searchQuery: 검색어 (문자열 또는 빈값)
   ────────────────────────────────────────────────────────────────────────────── */

// ── tools 전용 정적 페이지(정책/소개/문의) — blog 크롬 미사용, tools 크롬으로 자체 구성 ──
function toolsDoc(title, desc, canonical, origin, bodyHtml) {
  const s = TOOLS_SETTINGS;
  return `<!doctype html>
<html lang="ko"><head>${toolHead(title, desc, origin, canonical, s.adsense_code || "")}</head>
<body class="tools-page">${renderToolsHeader()}
<main class="wrap" style="max-width:820px;padding:56px 24px;min-height:62vh">${bodyHtml}</main>
${renderToolsFooter()}</body></html>`;
}

function toolsSitemap(origin) {
  const today = new Date().toISOString().slice(0, 10);
  const paths = ["/", "/about", "/contact", "/privacy", "/terms"].concat(TOOLS.filter(t => t.ready).map(t => "/" + t.slug));
  const items = paths.map(p => `  <url><loc>${origin}${p === "/" ? "" : p}</loc><lastmod>${today}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`;
}

const POLICY = {
  privacy: { t: "개인정보처리방침", d: "Zelric 도구 개인정보처리방침", h: `<h1>개인정보처리방침</h1>
<p>Zelric 도구(tools.zelric.com)는 이용자의 개인정보를 소중히 다룹니다. 본 사이트의 모든 이미지 처리는 <strong>이용자의 브라우저 안에서만</strong> 이루어지며, 업로드한 이미지는 서버로 전송·저장되지 않습니다.</p>
<h2>수집 항목</h2><p>본 사이트는 회원가입이나 이미지 업로드를 통한 개인정보를 수집하지 않습니다. 다만 서비스 개선과 광고 게재를 위해 쿠키 및 유사 기술을 통해 접속 기록·기기 정보 등이 수집될 수 있습니다.</p>
<h2>광고 및 쿠키</h2><p>본 사이트는 Google AdSense를 사용할 수 있으며, Google을 포함한 제3자 공급업체는 쿠키를 사용해 이용자의 방문 기록에 기반한 광고를 게재합니다. 이용자는 <a href="https://www.google.com/settings/ads" rel="nofollow">Google 광고 설정</a>에서 맞춤 광고를 해제할 수 있습니다.</p>
<h2>문의</h2><p>개인정보 관련 문의는 <a href="/contact">문의 페이지</a>를 통해 접수해 주세요.</p>` },
  terms: { t: "이용약관", d: "Zelric 도구 이용약관", h: `<h1>이용약관</h1>
<p>본 약관은 Zelric 도구(tools.zelric.com, 이하 “서비스”) 이용에 관한 조건을 규정합니다. 서비스를 이용함으로써 본 약관에 동의한 것으로 간주합니다.</p>
<h2>서비스 내용</h2><p>서비스는 이미지 압축·크기 변경·변환 등 무료 온라인 도구를 제공합니다. 모든 처리는 이용자의 브라우저에서 수행됩니다.</p>
<h2>면책</h2><p>서비스는 “있는 그대로” 제공되며, 처리 결과의 정확성·적합성에 대해 보증하지 않습니다. 이용자는 본인의 책임 하에 서비스를 이용하며, 중요한 파일은 반드시 원본을 별도 보관하시기 바랍니다.</p>
<h2>저작권</h2><p>이용자가 처리하는 이미지의 권리와 책임은 이용자에게 있습니다.</p>` },
  about: { t: "소개", d: "Zelric 도구 소개", h: `<h1>Zelric 도구 소개</h1>
<p>Zelric 도구는 설치 없이 브라우저에서 바로 쓰는 무료 이미지 도구 모음입니다. 이미지 압축, 크기 변경, 포맷 변환 등을 <strong>서버 업로드 없이</strong> 안전하게 처리합니다.</p>
<p>모든 작업은 이용자의 기기 안에서 이루어지므로 빠르고, 사진이 외부로 유출되지 않습니다.</p>
<p><a href="/">전체 도구 보러가기 →</a></p>` },
  contact: { t: "문의", d: "Zelric 도구 문의", h: `<h1>문의</h1>
<p>서비스 이용 중 문의사항이나 개선 제안은 이메일로 보내주세요.</p>
<p style="font-size:1.1rem"><strong>nareumtube@gmail.com</strong></p>
<p>보내주신 의견은 서비스 개선에 소중히 활용하겠습니다.</p>` },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = `${url.protocol}//${url.host}`;
    const s = TOOLS_SETTINGS;
    const CACHE = { "Cache-Control": "public, s-maxage=300, max-age=0, stale-while-revalidate=600" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { ...CORS } });
    }
    // 홈
    if (path === "/") return html(renderToolsHome(origin, s), 200, CACHE);
    // 개별 도구 페이지
    const slug = path.slice(1);
    if (TOOLS_BY_SLUG[slug]) return html(renderToolPage(TOOLS_BY_SLUG[slug], origin, s), 200, CACHE);
    // 정책/소개/문의
    const key = path.replace(/^\//, "");
    if (POLICY[key]) { const p = POLICY[key]; return html(toolsDoc(p.t + " · " + "Zelric", p.d, "/" + key, origin, p.h), 200, CACHE); }
    // SEO
    if (path === "/robots.txt") return text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
    if (path === "/sitemap.xml") return xml(toolsSitemap(origin), 200);
    // 404
    return html(toolsDoc("페이지를 찾을 수 없습니다 · Zelric", "요청하신 페이지가 없습니다.", path, origin, `<h1>404</h1><p>요청하신 페이지를 찾을 수 없습니다. <a href="/">홈으로</a></p>`), 404);
  },
};
