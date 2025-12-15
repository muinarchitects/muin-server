// 이 코드는 아임웹과 정부 서버 사이를 연결해줍니다.
export default async function handler(req, res) {
  // 1. 아임웹에서 보낸 주소 정보 받기
  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  // 2. 공공데이터포털 API 주소 (건축물대장 표제부)
  const apiKey = process.env.GOV_API_KEY; // 설정에서 넣을 키
  const url = `http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?serviceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&_type=json`;

  try {
    // 3. 정부 서버에 데이터 요청 (fetch 사용)
    const response = await fetch(url);
    const data = await response.json();

    // 4. 결과 확인 및 정리
    const item = data.response?.body?.items?.item;

    if (!item) {
      return res.status(200).json({ 
        message: "데이터 없음", 
        violation: "정보없음" 
      });
    }

    // 결과가 리스트(배열)로 올 경우 첫 번째 것만 사용, 아니면 객체 그대로 사용
    const buildingInfo = Array.isArray(item) ? item[0] : item;

    // 5. 아임웹으로 보낼 최종 데이터
    const result = {
      name: buildingInfo.bldNm || "이름 없는 건물",
      mainPurps: buildingInfo.mainPurpsNm || "용도 미기재",
      violation: buildingInfo.vnbrYn || "N", // 위반 여부 (Y/N)
      area: buildingInfo.totArea || "0"
    };

    // 성공 응답 전송
    return res.status(200).json(result);

  } catch (error) {
    // 에러 발생 시
    return res.status(500).json({ error: "정부 서버 연결 실패", details: error.message });
  }
}
