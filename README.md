# tools.zelric.com (독립 워커)

`worker-v2.js`(blog+tools 통합)에서 **tools 코드만 추출**한 단독 Cloudflare 워커입니다.
blog와 완전 분리 — D1/R2 없음, 설정 인라인, 이미지 처리는 전부 브라우저에서 수행.

## 배포
GitHub `nareumtube-sketch/tools.zelric.com`(main)에 push하면 Cloudflare Workers Build가
자동으로 `npx wrangler deploy` 실행 → `tools-zelric-com` 워커에 배포. (blog·zelric와 동일 방식)

## 구성
- `worker.js` — 추출·조립된 워커 (도구 8종 + 홈 + 정책/소개/문의 + robots/sitemap)
- `wrangler.toml` — 워커 이름 `tools-zelric-com`, 커스텀 도메인은 **검증 후** 부착

## AdSense
`worker.js` 상단 `TOOLS_SETTINGS.adsense_code` 에 애드센스 스니펫을 붙여넣으면 전 페이지에 반영됩니다.

## 안전 배포 & 도메인 이전 순서 (⚠️ DNS 사고 방지)
과거 도메인 이전 시 사이트가 죽은 적이 있어 **순서가 중요**합니다.

1. **workers.dev 검증** (프로덕션 무영향)
   ```
   npx wrangler deploy
   ```
   → `https://tools-zelric-com.<계정>.workers.dev` 접속해 도구·홈 정상 확인.

2. **커스텀 도메인 이전** — `wrangler.toml`의 `routes` 주석 해제 후:
   ```
   npx wrangler deploy
   ```
   커스텀 도메인은 배타적이라 `tools.zelric.com`이 blog 워커에서 이 워커로 자동 이전됩니다.
   (불안하면 Cloudflare 대시보드 → 이 워커 → Custom Domains 에서 수동 추가가 더 안전)

3. **blog 워커에서 tools 제거** — `D:\Claude-Code`(또는 blog 새 위치)의 `wrangler.toml`
   `routes`에서 `tools.zelric.com` 줄을 삭제하고 blog 워커 재배포.
   → 이후 blog 배포가 tools 도메인을 다시 가져가지 않음.

4. **검증**: `https://tools.zelric.com` 와 `https://blog.zelric.com` 둘 다 정상 확인.

## 로컬 미리보기
```
npx wrangler dev
```
