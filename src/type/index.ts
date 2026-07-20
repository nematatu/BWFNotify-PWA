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
	tournamentHeaderImageUrl?: string;
	tournamentHeaderImageMobileUrl?: string;
	tournamentCategory?: string;
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
	score?: BwfGameScore[];
};

export type BwfGameScore = {
	set: number;
	home: number;
	away: number;
	lastPointWinner?: 1 | 2;
	serve?: 1 | 2;
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

export type MatchGameScore = {
	game: number;
	team1: number;
	team2: number;
	lastPointWinner?: 1 | 2;
	servingTeam?: 1 | 2;
};

export type MatchSummary = {
	id: string;
	tournament: string;
	tournamentLogoUrl?: string;
	tournamentHeaderImageUrl?: string;
	tournamentHeaderImageMobileUrl?: string;
	tournamentCategory?: string;
	players: string[];
	teams: MatchTeamSummary[];
	scores: MatchGameScore[];
	eventType: "live" | "scheduled" | "completed";
	round?: string;
	court?: string;
	startTime?: string;
	tournamentDate?: string;
	h2h?: HeadToHeadSummary;
	completedAt?: string;
};

export type UpcomingTournament = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	grade?: string;
	imageUrl?: string;
	bwfUrl?: string;
	bajUrl?: string;
};

export type PublicState = {
	checkedAt: string | null;
	matches: MatchSummary[];
	recentResults: MatchSummary[];
	calendarCheckedAt: string | null;
	upcomingTournaments: UpcomingTournament[];
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

export type DeliveryCounts = {
	sent: number;
	failed: number;
	removed: number;
};

export type DeliveryResult = DeliveryCounts & {
	byMatch: Record<string, DeliveryCounts>;
};

export type PushSubscriptionInput = {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
};

export type SaveSubscriptionRequest = {
	subscription: PushSubscriptionInput;
};

export type UpdateSubscriptionPreferencesRequest = {
	endpoint: string;
	excludedMatchIds: string[];
};

export type TestNotificationRequest = {
	endpoint: string;
};

export type SubscriptionResponse = {
	ok: true;
	excludedMatchIds: string[];
};
