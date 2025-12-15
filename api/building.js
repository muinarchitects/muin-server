export default async function handler(req, res) {
  // 1. CORS 보안 설정 (아임웹 접속 허용)
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

  // 2. 건축HUB 신규 API 주소 (HTTPS 적용 및 대지구분코드 추가)
  // 문서 예시를 참고하여 platGbCd=0 (대지)을 명시적으로 추가함 
  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&platGbCd=0&numOfRows=1&_type=json`;

  try {
    const response = await fetch(url);
    
    // 3. [중요] 무조건 텍스트로 먼저 받아서 내용을 확인합니다. (에러 방지용)
    const text = await response.text();
    
    // 만약 정부 서버가 에러(XML)를 보냈다면, 내용에 '<' 괄호가 포함되어 있을 것입니다.
    if (text.trim().startsWith('<')) {
        console.error("정부 서버 에러 응답:", text);
        // 에러 내용을 분석해서 프론트엔드로 보냅니다.
        if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
            return res.status(200).json({ message: "키 승인 대기중", error: "SERVICE_KEY_IS_NOT_REGISTERED" });
        }
        return res.status(500).json({ error: "정부 API 에러(XML)", details: text });
    }

    // JSON 변환 시도
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return res.status(500).json({ error: "JSON 파싱 실패", details: text });
    }

    // 정상 데이터 처리
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
      purpose: info.mainPurpsCdNm || "-", // 문서에 따른 필드명 [cite: 97]
      parking: parking,
      violation: info.vnbrYn || "확인불가", // 신규 API 위반여부 필드 확인 필요
      structure: info.strctCdNm || "-"    // 문서에 따른 필드명 [cite: 98]
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error("Vercel Server Error:", error);
    return res.status(500).json({ error: "서버 내부 오류", details: error.message });
  }
}
