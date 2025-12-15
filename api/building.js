export default async function handler(req, res) {
  // 1. CORS 보안 설정
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
  const apiKey = process.env.GOV_API_KEY; 

  // 2. 주소 확인 (건축HUB 신규 API)
  // platGbCd=0 (대지) 파라미터 필수 명시
  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

  try {
    const response = await fetch(url);
    const text = await response.text(); // 무조건 텍스트로 먼저 받음

    // 3. [진단] 정부 서버가 에러(XML)를 보냈는지 확인
    if (text.trim().startsWith('<')) {
        console.error("정부 서버 XML 에러:", text);
        
        // 키 문제인지 확인
        if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
            return res.status(200).json({ error: "키 승인 대기중 (SERVICE_KEY_IS_NOT_REGISTERED)" });
        }
        if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS')) {
            return res.status(200).json({ error: "일일 트래픽 초과" });
        }
        
        // 그 외 XML 에러 내용을 그대로 보여줌
        return res.status(200).json({ error: "정부 서버 에러(XML)", details: text });
    }

    // 4. JSON 파싱 시도
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return res.status(200).json({ error: "JSON 변환 실패", details: text.substring(0, 100) });
    }

    // 5. 정상 데이터 처리
    const item = data.response?.body?.items?.item;
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
    return res.status(200).json({ error: "Vercel 내부 오류", details: error.message });
  }
}
