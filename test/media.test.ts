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

	test.each([
		"http://img.bwfbadminton.com/image/upload/v1/player.jpg",
		"https://example.com/image/upload/v1/player.jpg",
		"https://img.bwfbadminton.com/other/player.jpg",
	] as const)("rejects %s", (url) => {
		expect(allowedBwfImageUrl(url)).toBeNull();
	});
});
