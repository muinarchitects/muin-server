export default async function handler(req, res) {
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

  // 2. 요청 파라미터 받기
  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  const apiKey = process.env.GOV_API_KEY; 

  // 3. [수정됨] 건축HUB 신규 API 주소 적용 (BldRgstHubService)
  const url = `http://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&_type=json`;

  try {
    const response = await fetch(url);
    
    // API 키 에러 등 체크
    if (!response.ok) {
        throw new Error(`정부 서버 응답 오류: ${response.status}`);
    }

    const data = await response.json();
    const item = data.response?.body?.items?.item;

    // 데이터가 없는 경우
    if (!item) {
      return res.status(200).json({ message: "데이터 없음", violation: "N" });
    }

    // 결과가 배열이면 첫 번째 데이터 사용
    const info = Array.isArray(item) ? item[0] : item;

    // 4. [수정됨] 신규 API 명세서 기반 주차대수 합산 로직
    // 명세서 상 옥내/옥외/자주/기계 주차대수 필드 합산
    const parking = 
      (parseInt(info.indrAutoUtcnt) || 0) + 
      (parseInt(info.indrMechUtcnt) || 0) + 
      (parseInt(info.oudrAutoUtcnt) || 0) + 
      (parseInt(info.oudrMechUtcnt) || 0);

    // 5. [수정됨] 7가지 항목 데이터 매핑
    const result = {
      location: info.platPlc || "-",                 // 1. 대지위치
      bunji: `${info.bun}-${info.ji}`,               // 2. 지번
      roadAddr: info.newPlatPlc || "정보없음",        // 3. 도로명주소
      name: info.bldNm || "명칭없음",                // 4-1. 건물명
      purpose: info.mainPurpsCdNm || "-",            // 4-2. 주용도 (명세서 항목명: mainPurpsCdNm)
      parking: parking,                              // 5. 주차대수 (합산값)
      
      // 주의: 건축HUB 표제부 API 명세서에는 '위반여부(vnbrYn)' 필드가 명시되어 있지 않습니다.
      // 구버전과 달리 데이터가 없을 수 있으므로, 없으면 '정보없음'으로 처리합니다.
      violation: info.vnbrYn || "확인불가",           // 6. 위반여부
      
      structure: info.strctCdNm || "-"               // 7. 구조 (명세서 항목명: strctCdNm)
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "서버 연결 실패", details: error.message });
  }
}
