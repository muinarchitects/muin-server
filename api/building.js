export default async function handler(req, res) {
  // CORS 보안 허용 설정 (아임웹 연동 필수)
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

  const { sigunguCd, bjdongCd, bun, ji } = req.query;
  const apiKey = process.env.GOV_API_KEY; // Vercel 환경변수에 저장된 키

  // 국토교통부 건축물대장 표제부 조회 API 호출
  const url = `http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&_type=json`;

  try {
    const response = await fetch(url);
    
    // 응답 상태 확인
    if (!response.ok) {
        throw new Error(`API 호출 오류: ${response.status}`);
    }

    const data = await response.json();
    const item = data.response?.body?.items?.item;

    // 데이터가 없는 경우 (아직 등재되지 않은 건물 등)
    if (!item) {
      return res.status(200).json({ message: "데이터 없음", violation: "N" });
    }

    // 결과가 배열로 올 경우 첫 번째 데이터 사용
    const info = Array.isArray(item) ? item[0] : item;

    // 5. 주차대수 합산 계산
    const parking = 
      (parseInt(info.indrAutoUtcnt) || 0) + // 옥내 자주
      (parseInt(info.indrMechUtcnt) || 0) + // 옥내 기계
      (parseInt(info.oudrAutoUtcnt) || 0) + // 옥외 자주
      (parseInt(info.oudrMechUtcnt) || 0);  // 옥외 기계

    // 최종 추출 데이터 (요청하신 7가지 항목)
    const result = {
      location: info.platPlc || "-",                 // 1. 대지위치
      bunji: `${info.bun}-${info.ji}`,               // 2. 지번
      roadAddr: info.newPlatPlc || "도로명주소 없음", // 3. 도로명주소
      name: info.bldNm || "명칭없음",                // 4. 건물명
      purpose: info.mainPurpsNm || "-",              // 4. 주용도 (건축물 현황)
      parking: parking,                              // 5. 주차대수
      violation: info.vnbrYn || "N",                 // 6. 위반여부
      structure: info.strctCdNm || "-"               // 7. 건축물 구조 현황
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "서버 연결 실패", details: error.message });
  }
}
