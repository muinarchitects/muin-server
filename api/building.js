// [호환성 모드] 최신 문법(import/fetch) 대신 표준 문법(require/https) 사용
const https = require('https');
const url = require('url');

module.exports = async (req, res) => {
  // 1. CORS 보안 설정 (무조건 허용)
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

  // 2. 파라미터 및 환경변수 확인
  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  const apiKey = process.env.GOV_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ error: "환경변수(GOV_API_KEY)가 설정되지 않았습니다." });
  }

  [cite_start]// 3. 건축HUB 신규 API 주소 생성 [cite: 17, 24]
  // (https 모듈 사용을 위해 URL 객체 활용)
  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

  try {
    // 4. 데이터 요청 (fetch 대신 내장 https 모듈 사용)
    const apiResponse = await new Promise((resolve, reject) => {
      https.get(apiUrl, (resp) => {
        let data = '';
        
        // 데이터 조각 받기
        resp.on('data', (chunk) => {
          data += chunk;
        });
        
        // 수신 완료
        resp.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });

    const text = apiResponse.toString();

    // A. XML 에러 체크
    if (text.trim().startsWith('<')) {
      console.error("Gov API Error:", text);
      if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
        return res.status(200).json({ message: "키 승인 대기중" });
      }
      return res.status(200).json({ error: "정부 서버 에러(XML)", details: text });
    }

    // B. JSON 파싱
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(200).json({ error: "JSON 파싱 실패", details: text });
    }

    // 5. 데이터 가공
    const item = data.response?.body?.items?.item;

    if (!item) {
      return res.status(200).json({ message: "데이터 없음", violation: "N" });
    }

    const info = Array.isArray(item) ? item[0] : item;

    [cite_start]// 주차대수 합산 [cite: 21]
    const parking = 
      (parseInt(info.indrAutoUtcnt) || 0) + 
      (parseInt(info.indrMechUtcnt) || 0) + 
      (parseInt(info.oudrAutoUtcnt) || 0) + 
      (parseInt(info.oudrMechUtcnt) || 0);

    // 최종 결과 반환
    const result = {
      location: info.platPlc || "-",
      bunji: `${info.bun}-${info.ji}`,
      roadAddr: info.newPlatPlc || "정보없음",
      name: info.bldNm || "명칭없음",
      purpose: info.mainPurpsCdNm || "-",
      parking: parking,
      violation: info.vnbrYn || "정보없음",
      structure: info.strctCdNm || "-"
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "서버 내부 오류", details: error.message });
  }
};
