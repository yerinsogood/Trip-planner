/* 지도 공유 링크(짧은 주소)를 끝까지 따라가서 최종 주소를 알려준다.
   브라우저는 다른 사이트의 리다이렉트를 직접 못 따라가서 여기서 대신 해준다.
   아무 사이트나 열어주는 통로가 되지 않게, 구글지도·고덕지도 주소만 허용한다. */
const ALLOWED = [
  /^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/,
  /^([a-z0-9-]+\.)*google\.[a-z.]+$/,
  /^([a-z0-9-]+\.)*amap\.com$/,
];
const allowed = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && ALLOWED.some((r) => r.test(x.hostname)); } catch (e) { return false; }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const start = String((req.query && req.query.u) || '').trim();
  if (!allowed(start)) { res.status(400).json({ error: 'not a supported map link' }); return; }
  let url = start;
  try {
    for (let i = 0; i < 6; i++) {
      const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Accept-Language': 'ko,zh-CN;q=0.8,en;q=0.6' } });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, url).toString();
        if (!allowed(next)) break;
        url = next; continue;
      }
      // 리다이렉트가 끝났는데 좌표가 주소에 없으면, 페이지 안의 og 메타 정보를 조금 읽어 본다
      let meta = '';
      if (r.ok && !/!3d-?\d|@-?\d+\.\d+,-?\d+\.\d+/.test(url)) {
        const html = (await r.text()).slice(0, 200000);
        const pick = (re) => { const m = html.match(re); return m ? m[1] : ''; };
        meta = [pick(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i), pick(/<meta[^>]+content="([^"]*)"[^>]+itemprop="name"/i),
          pick(/(https:\/\/[^"'\s]*(?:center|markers)=-?\d+\.\d+%2C-?\d+\.\d+[^"'\s]*)/i)].filter(Boolean).join('\n');
      }
      res.status(200).json({ url, meta });
      return;
    }
    res.status(200).json({ url, meta: '' });
  } catch (e) {
    res.status(502).json({ error: 'could not open link' });
  }
};
