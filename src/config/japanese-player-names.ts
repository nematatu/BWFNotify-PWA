// BWF nameDisplay -> Japanese display name. Add only verified spellings.
const JAPANESE_PLAYER_NAMES: Record<string, string> = {
	"ARISA IGARASHI": "五十嵐有紗",
	"AKANE YAMAGUCHI": "山口茜",
	"AKIRA KOGA": "古賀輝",
	"AMPO MUTSUKI": "安保武輝",
	"MUTSUKI AMPO": "安保武輝",
	"AYA TAMAKI": "玉木亜弥",
	"CHIHARU SHIDA": "志田千陽",
	"DAIKI NISHI": "西大輝",
	"DAISUKE SANO": "佐野大輔",
	"HIROKI MIDORIKAWA": "緑川大輝",
	"HINA OSAWA": "大澤陽奈",
	"HIKARU KOGA": "古賀輝",
	"KENTA NISHIMOTO": "西本拳太",
	"KIE NAKANISHI": "中西貴映",
	"KOO TAKAHASHI": "高橋洸士",
	"KODAI NARAOKA": "奈良岡功大",
	"KOKI WATANABE": "渡邉航貴",
	"KAORU SUGIYAMA": "杉山薫",
	"MIKI KANEHIRO": "金廣美希",
	"MANAMI SUIZU": "水津愛美",
	"MAYU MATSUMOTO": "松本麻佑",
	"NAMI MATSUYAMA": "松山奈未",
	"NATSU SAITO": "齋藤夏",
	"NAYU SHIRAKAWA": "白川菜結",
	"NODOKA SUNAKAWA": "砂川温香",
	"RIN IWANAGA": "岩永鈴",
	"RIKO GUNJI": "郡司莉子",
	"RUI HIROKAMI": "廣上瑠依",
	"SAYAKA HOBARA": "保原彩夏",
	"SAKURA MASUKI": "舛木さくら",
	"SHO KUMAGAI": "熊谷翔",
	"TAKUMI NOMURA": "野村拓海",
	"TAKURO HOKI": "保木卓朗",
	"TOMONA HARIMA": "播摩朋奈",
	"TORI AIZAWA": "相澤桃李",
	"TOMOKA MIYAZAKI": "宮崎友花",
	"YUKI FUKUSHIMA": "福島由紀",
	"YUHO IMAI": "今井優歩",
	"YUNA KATO": "加藤佑奈",
	"YUGO KOBAYASHI": "小林優吾",
	"YUICHI SHIMOGAMI": "霜上雄一",
	"YUSHI TANAKA": "田中湧士",
	// 日本バドミントン協会の派遣・参加者名簿（2026年11月）で、種目とペアの組み合わせまで一致を確認
	"HARUKI KAWABE": "川邊悠陽", // 韓国オープン2026 参加者 MD1/XD2
	"KENTA MATSUKAWA": "松川健大", // 韓国オープン2026 参加者 MD1
	"KENYA MITSUHASHI": "三橋健也", // 韓国オープン2026 参加者 MD2
	"KEIICHIRO MATSUI": "松居圭一郎", // 韓国オープン2026 参加者 MD2
	"TSUBASA YOSHIDA": "吉田翼", // 韓国オープン2026 参加者 MD3
	"TAKUTO GOTO": "後藤拓人", // 韓国オープン2026 参加者 MD3
	"SHOGO OGAWA": "小川翔悟", // 韓国オープン2026 参加者 MS1
	"MINORU KOGA": "古賀穂", // 韓国オープン2026 参加者 MS2
	"HINA AKECHI": "明地陽菜", // 韓国オープン2026 参加者 WS1
	"RIRINA HIRAMOTO": "平本梨々菜", // 韓国オープン2026 参加者 WS2/WD1
	"YUTA WATANABE": "渡辺勇大", // 韓国オープン2026 参加者 XD1
	"MAYA TAGUCHI": "田口真彩", // 韓国オープン2026 参加者 XD1
	"KOKONA ISHIKAWA": "石川心菜", // 韓国オープン2026 参加者 XD2
	"RIKI TAKEI": "武井凜生", // 韓国オープン2026 派遣
	"YUDAI OKIMOTO": "沖本優大", // 韓国オープン2026 派遣
	"KAKERU KUMAGAI": "熊谷翔", // 韓国オープン2026 派遣
	"HIROKI NISHI": "西大輝", // 韓国オープン2026 派遣
	"HIROKI OKAMURA": "岡村洋輝", // 韓国オープン2026 派遣
	"KYOHEI YAMASHITA": "山下恭平", // 韓国オープン2026 派遣
	"HINATA SUZUKI": "鈴木陽向", // 韓国オープン2026 派遣
	"NAO YAMAKITA": "山北奈緖", // 韓国オープン2026 派遣
	"NANAKO HARA": "原菜那子", // 韓国オープン2026 派遣
	"RIKO KIYOSE": "清瀬璃子", // 韓国オープン2026 派遣
	"REI MIYASHITA": "宮下怜", // 南安中国IC2026 参加者 MS1
	"MOMOHA NIIMI": "新見桃芭", // 南安中国IC2026 参加者 WD1
	"MIKOTO AISO": "相磯美心", // 南安中国IC2026 参加者 WD1
	// 熊本マスターズジャパン2026 参加者（contestant_20261110151603.pdf）
	"RIKU HATANO": "秦野陸", // MS2
	"YUZUNO WATANABE": "渡邉柚乃", // WS1
	"NOZOMI OKUHARA": "奥原希望", // WS2
	"NATSUKI NIDAIRA": "仁平菜月", // WS3
	"ASUKA TAKAHASHI": "髙橋明日香", // WS5
	"HARUNA KONISHI": "小西春七", // WS7、WD4（石川心菜と組む）
	"NIINA MATSUTA": "松田仁衣菜", // WS9
	"SAYAKA HIROTA": "廣田彩花", // WD2（櫻本絢子と組む）
	"AYAKO SAKURAMOTO": "櫻本絢子", // WD2
	"YUMI TANABE": "田邉裕美", // WD3（五十嵐有紗と組む）
	"AN UESUGI": "上杉杏", // WD6（古根川美桜と組む）
	"MIO KONEGAWA": "古根川美桜", // WD6
	"MAO YAMAKITA": "山北眞緒", // XD2（緑川大輝と組む）
	// 熊本マスターズジャパン2026 派遣（send_out_20261106152258.pdf）。WDで2人が組む
	"MIYU TAKAHASHI": "髙橋美優",
	"SUMIRE NAKADE": "中出すみれ",
	// カオシュンマスターズ2026 参加者（contestant_20261001131919.pdf）
	"KOSUKE MASUMOTO": "増本康祐", // MS4
	"SHUNTARO MEZAKI": "目崎駿太郎", // MD2（奥優汰と組む）
	"YUTA OKU": "奥優汰", // MD2
	"YUDAI NAGAFUCHI": "永渕雄大", // MD3（安保武輝と組む）
	"KOTA OGAWA": "小川航汰", // MD4（川島直也と組む）
	"NAOYA KAWASHIMA": "川島直也", // MD4
	"KEITA YASUDA": "家壽多慶太", // XD1（新見桃芭と組む）
	// アイルランドオープン2026 要項・参加者（guidelines_20261001155724.pdf）
	"NANAMI SOMEYA": "染谷菜々美", // WS1
	"SHIORI EBIHARA": "海老原詩織", // WS2
	"SUZUKI MIZUI": "水井寿々妃", // WS3
	"MIHANE ENDO": "遠藤美羽", // WS5
};

const ROMANIZED_NAMES_BY_JAPANESE = Object.entries(
	JAPANESE_PLAYER_NAMES,
).reduce<Map<string, string[]>>((names, [romanized, japanese]) => {
	const values = names.get(japanese) || [];
	if (!values.includes(romanized)) {
		values.push(romanized);
	}
	names.set(japanese, values);
	return names;
}, new Map());

export function japanesePlayerName(name: string): string | undefined {
	return JAPANESE_PLAYER_NAMES[normalizeName(name)];
}

export function japanesePlayerRomanizedNames(name: string): string[] {
	return ROMANIZED_NAMES_BY_JAPANESE.get(name.trim()) || [];
}

function normalizeName(name: string): string {
	return name.trim().replace(/\s+/g, " ").toUpperCase();
}
