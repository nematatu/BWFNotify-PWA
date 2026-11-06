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
