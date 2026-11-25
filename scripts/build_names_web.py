#!/usr/bin/env python3
"""name-game.html → names-web/ (Vercel에 올리는 정적 웹사이트) 생성.

- pdf.js를 CDN 대신 같은 사이트의 names-web/pdfjs/ 에서 불러오도록 경로 변경
- 홈 화면 추가(PWA)용 manifest·아이콘 링크, 오프라인용 service worker 등록 추가

사용: python3 scripts/build_names_web.py
pdfjs/ 파일은 pdfjs-dist@3.11.174 의 build/pdf.min.js, build/pdf.worker.min.js 를 그대로 둔 것.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "name-game.html").read_text(encoding="utf-8")
CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/"


def rep(s, a, b, count=1):
    assert s.count(a) == count, (a, s.count(a))
    return s.replace(a, b)


out = src.replace(CDN, "pdfjs/")
assert CDN not in out and out.count("pdfjs/pdf") >= 2
out = rep(out, '<meta name="viewport" content="width=device-width, initial-scale=1">',
          '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
          '<meta name="theme-color" content="#2f6fde">\n'
          '<meta name="description" content="아이 사진과 이름을 퀴즈·플래시카드·짝맞추기로 외우는 게임. 사진은 이 기기 브라우저에만 저장됩니다.">\n'
          '<link rel="manifest" href="manifest.webmanifest">\n'
          '<link rel="icon" href="icon-192.png">\n'
          '<link rel="apple-touch-icon" href="icon-192.png">\n'
          '<meta name="apple-mobile-web-app-capable" content="yes">\n'
          '<meta name="mobile-web-app-capable" content="yes">')
out = rep(out, "dbAll().then(list => { kids = list; show('home'); });",
          "dbAll().then(list => { kids = list; show('home'); });\n"
          "if ('serviceWorker' in navigator && location.protocol === 'https:') {\n"
          "  navigator.serviceWorker.register('sw.js').catch(() => {});\n"
          "}")
(ROOT / "names-web" / "index.html").write_text(out, encoding="utf-8")
print("wrote names-web/index.html", len(out), "bytes")
