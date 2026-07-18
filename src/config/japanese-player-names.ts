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
