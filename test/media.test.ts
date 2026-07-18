import { describe, expect, test } from "bun:test";
import { allowedBwfImageUrl } from "../src/api/media";

describe("allowedBwfImageUrl", () => {
	test("accepts BWF Cloudinary image URLs", () => {
		expect(
			allowedBwfImageUrl(
				"https://img.bwfbadminton.com/image/upload/v1/assets/players/1.jpg",
			)?.hostname,
		).toBe("img.bwfbadminton.com");
	});

	test("accepts BWF tournament fallback images", () => {
		expect(
			allowedBwfImageUrl(
				"https://extranet.bwfbadminton.com/images/player-hero-01.jpg",
			)?.hostname,
		).toBe("extranet.bwfbadminton.com");
	});

	test.each([
		"http://img.bwfbadminton.com/image/upload/v1/player.jpg",
		"https://example.com/image/upload/v1/player.jpg",
		"https://img.bwfbadminton.com/other/player.jpg",
		"https://extranet.bwfbadminton.com/docs/private.jpg",
	] as const)("rejects %s", (url) => {
		expect(allowedBwfImageUrl(url)).toBeNull();
	});
});
