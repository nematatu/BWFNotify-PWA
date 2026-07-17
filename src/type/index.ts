export type EventType = "scheduled" | "live" | "completed" | "unknown";

export type BwfPlayer = {
	id?: string;
	nameDisplay?: string;
	countryCode?: string;
	countryFlagUrl?: string;
	photoUrl?: string;
};

export type BwfTeam = {
	countryCode?: string;
	countryFlagUrl?: string;
	players: BwfPlayer[];
};

export type BwfMatch = {
	id: string;
	tournamentName?: string;
	tournamentLogoUrl?: string;
	tournamentLink?: string;
	matchStatus?: string;
	matchStatusValue?: string;
	scoreStatus?: number;
	scoreStatusValue?: string;
	matchTime?: string;
	matchTimeUtc?: string;
	roundName?: string;
	courtName?: string;
	matchTypeValue?: string;
	team1?: BwfTeam;
	team2?: BwfTeam;
};

export type MatchPlayerSummary = {
	id?: string;
	name: string;
	countryCode?: string;
	flagUrl?: string;
	photoUrl?: string;
	isJapanese: boolean;
};

export type MatchTeamSummary = {
	countryCode?: string;
	flagUrl?: string;
	players: MatchPlayerSummary[];
};

export type PreviousMeeting = {
	tournament: string;
	date?: string;
	round?: string;
	winner?: 1 | 2;
	games: Array<{ team1: number; team2: number }>;
};

export type HeadToHeadSummary = {
	team1Wins: number;
	team2Wins: number;
	totalMatches: number;
	previous?: PreviousMeeting;
};

export type MatchSummary = {
	id: string;
	tournament: string;
	tournamentLogoUrl?: string;
	matchUrl?: string;
	players: string[];
	teams: MatchTeamSummary[];
	eventType: "live" | "scheduled";
	status: string;
	round?: string;
	court?: string;
	startTime?: string;
	h2h?: HeadToHeadSummary;
};

export type PublicState = {
	checkedAt: string;
	matches: MatchSummary[];
};

export type StoredSubscription = {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
	createdAt: string;
	userAgent?: string;
	excludedMatchIds?: string[];
};

export type DeliveryResult = {
	sent: number;
	failed: number;
	removed: number;
};
