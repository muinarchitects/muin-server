const https = require('https');

// [수정됨] 호환성이 가장 좋은 CommonJS 방식으로 변경
module.exports = async (req, res) => {
  // 1. CORS 보안 허용 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. 파라미터 및 키 확인
  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  const apiKey = process.env.GOV_API_KEY; 

  if (!apiKey) {
      return res.status(200).json({ error: "환경변수(GOV_API_KEY)가 설정되지 않았습니다." });
  }

  // 3. 건축HUB 신규 API 주소
  [cite_start]// [참고] 제공해주신 가이드 문서에 따라 https 프로토콜 사용 [cite: 81]
  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

  // 4. 데이터 요청 (https 모듈 사용)
  const request = https.get(apiUrl, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        // A. 정부 서버 에러(XML) 체크
        if (data.trim().startsWith('<')) {
            console.error("XML Error:", data);
            
            // 키 관련 에러 메시지 체크
            if (data.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
                return res.status(200).json({ message: "키 승인 대기중" });
            }
            if (data.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS')) {
                return res.status(200).json({ error: "트래픽 초과" });
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

        [cite_start]// C. 주차대수 합산 (가이드 문서 필드명 기준) [cite: 85]
        const parking = 
          (parseInt(info.indrAutoUtcnt) || 0) + 
          (parseInt(info.indrMechUtcnt) || 0) + 
          (parseInt(info.oudrAutoUtcnt) || 0) + 
          (parseInt(info.oudrMechUtcnt) || 0);

        // D. 결과 정리
        const result = {
          location: info.platPlc || "-",
          bunji: `${info.bun}-${info.ji}`,
          roadAddr: info.newPlatPlc || "정보없음",
          name: info.bldNm || "명칭없음",
          purpose: info.mainPurpsCdNm || "-",
          parking: parking,
          violation: info.vnbrYn || "정보없음", // 신규 API는 위반 여부 필드가 없을 수 있음
          structure: info.strctCdNm || "-"
        };

        return res.status(200).json(result);

      } catch (e) {
        return res.status(200).json({ error: "데이터 처리 중 오류", details: e.message });
      }
    });
  });

  request.on('error', (e) => {
    return res.status(200).json({ error: "Vercel 네트워크 오류", details: e.message });
  });
};
