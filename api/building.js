const https = require('https');

export default function handler(req, res) {
  // 1. CORS 보안 허용 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  // ★ 환경변수 키가 없으면 에러 메시지 출력
  const apiKey = process.env.GOV_API_KEY; 
  if (!apiKey) {
      return res.status(200).json({ error: "환경변수(GOV_API_KEY)가 설정되지 않았습니다." });
  }

  // 2. 건축HUB 신규 API 주소 (OpenAPI 가이드 참고)
  [cite_start]// [cite: 92] 요청 주소: https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo
  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

  // 3. https 모듈을 사용하여 데이터 요청 (fetch 대신 사용)
  https.get(apiUrl, (apiRes) => {
    let data = '';

    // 데이터 조각 모으기
    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    // 수신 완료 시 처리
    apiRes.on('end', () => {
      try {
        // A. 정부 서버 에러(XML) 체크
        if (data.trim().startsWith('<')) {
            console.error("XML Error:", data);
            if (data.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
                return res.status(200).json({ message: "키 승인 대기중" });
            }
            return res.status(200).json({ error: "정부 서버 에러(XML)", details: data });
        }

        // B. JSON 변환
        const jsonResult = JSON.parse(data);
        const item = jsonResult.response?.body?.items?.item;

        if (!item) {
          return res.status(200).json({ message: "데이터 없음", violation: "N" });
        }

        const info = Array.isArray(item) ? item[0] : item;

        // C. 데이터 추출 (건축HUB 명세서 기준)
        [cite_start]// [cite: 94] 주차대수 합산 (옥내/옥외 + 기계/자주)
        const parking = 
          (parseInt(info.indrAutoUtcnt) || 0) + 
          (parseInt(info.indrMechUtcnt) || 0) + 
          (parseInt(info.oudrAutoUtcnt) || 0) + 
          (parseInt(info.oudrMechUtcnt) || 0);

        const result = {
          location: info.platPlc || [cite_start]"-",              // [cite: 93] 대지위치
          [cite_start]bunji: `${info.bun}-${info.ji}`,            // [cite: 93] 지번
          roadAddr: info.newPlatPlc || [cite_start]"정보없음",     // [cite: 93] 도로명대지위치
          name: info.bldNm || [cite_start]"명칭없음",             // [cite: 93] 건물명
          purpose: info.mainPurpsCdNm || [cite_start]"-",         // [cite: 98] 주용도코드명
          parking: parking,
          violation: info.vnbrYn || "정보없음",       // (명세서 미포함 항목 대비 안전처리)
          structure: info.strctCdNm || [cite_start]"-"            // [cite: 98] 구조코드명
        };

        return res.status(200).json(result);

      } catch (e) {
        return res.status(200).json({ error: "데이터 처리 중 오류", details: e.message });
      }
    });

  }).on('error', (e) => {
    // 네트워크 연결 실패 등
    return res.status(200).json({ error: "Vercel 네트워크 오류", details: e.message });
  });
}
