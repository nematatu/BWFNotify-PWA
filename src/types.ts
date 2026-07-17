export type EventType = "scheduled" | "live" | "completed" | "unknown";

export type BwfPlayer = {
	nameDisplay?: string;
	countryCode?: string;
};

export type BwfTeam = {
	countryCode?: string;
	players: BwfPlayer[];
};

export type BwfMatch = {
	id: string;
	tournamentName?: string;
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

export type LiveMatch = {
	id: string;
	tournament: string;
	players: string[];
	status: string;
	round?: string;
	court?: string;
	startTime?: string;
};

export type PublicState = {
	checkedAt: string;
	matches: LiveMatch[];
};

export type StoredSubscription = {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
	createdAt: string;
	userAgent?: string;
};

export type DeliveryResult = {
	sent: number;
	failed: number;
	removed: number;
};
