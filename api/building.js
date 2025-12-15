export default async function handler(req, res) {
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

  try {
    // 2. 파라미터 및 환경변수 확인
    const { sigunguCd, bjdongCd, bun, ji } = req.query;
    const apiKey = process.env.GOV_API_KEY;

    // 키가 없는 경우 처리
    if (!apiKey) {
      return res.status(200).json({ 
        error: "Server Config Error", 
        details: "Vercel 환경변수(GOV_API_KEY)가 설정되지 않았습니다." 
      });
    }

    // 3. 건축HUB 신규 API 주소 (대지구분코드 platGbCd=0 필수)
    // 주소: https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo
    const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

    // 4. 데이터 요청 (Node.js 내장 fetch 사용)
    const response = await fetch(apiUrl);
    
    // 5. 텍스트로 먼저 받아서 에러인지(XML) 데이터인지(JSON) 확인
    const text = await response.text();

    // A. XML 에러 체크 (정부 서버가 에러를 보낸 경우)
    if (text.trim().startsWith('<')) {
      console.error("Gov API XML Error:", text);
      
      if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
        return res.status(200).json({ message: "키 승인 대기중" });
      }
      if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS')) {
        return res.status(200).json({ error: "트래픽 초과" });
      }
      return res.status(200).json({ error: "정부 서버 에러(XML)", details: text });
    }

    // B. JSON 파싱
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return res.status(200).json({ error: "JSON 파싱 실패", details: text });
    }

    // 6. 데이터 추출 및 가공
    const item = data.response?.body?.items?.item;

    // 데이터가 없는 경우
    if (!item) {
      return res.status(200).json({ message: "데이터 없음", violation: "N" });
    }

    const info = Array.isArray(item) ? item[0] : item;

    // 주차대수 합산
    const parking = 
      (parseInt(info.indrAutoUtcnt) || 0) + 
      (parseInt(info.indrMechUtcnt) || 0) + 
      (parseInt(info.oudrAutoUtcnt) || 0) + 
      (parseInt(info.oudrMechUtcnt) || 0);

    // 최종 결과 반환
    const result = {
      location: info.platPlc || "-",              // 대지위치
      bunji: `${info.bun}-${info.ji}`,            // 지번
      roadAddr: info.newPlatPlc || "정보없음",     // 도로명주소
      name: info.bldNm || "명칭없음",             // 건물명
      purpose: info.mainPurpsCdNm || "-",         // 주용도
      parking: parking,                           // 주차대수
      violation: info.vnbrYn || "정보없음",       // 위반여부
      structure: info.strctCdNm || "-"            // 구조
    };

    return res.status(200).json(result);

  } catch (error) {
    // 7. Vercel 서버 내부 에러 처리
    console.error("Vercel Logic Error:", error);
    return res.status(500).json({ 
      error: "Vercel 내부 오류", 
      details: error.message 
    });
  }
}
