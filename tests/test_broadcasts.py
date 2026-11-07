import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from broadcasts import broadcast_names, game_key
from common import make_vevent


class BroadcastTests(unittest.TestCase):
    def test_tv_streaming_and_deduplication_exclude_radio_and_foreign_feeds(self):
        comp = {"broadcasts": [
            {"type": {"shortName": "TV"}, "media": {"shortName": "Fox"}, "region": "us"},
            {"type": {"shortName": "TV"}, "media": {"shortName": "Fox"}, "region": "us"},
            {"type": {"shortName": "Streaming"}, "media": {"shortName": "B1G+"}, "region": "us"},
            {"type": {"shortName": "Radio"}, "media": {"shortName": "Local radio"}},
            {"type": {"shortName": "TV"}, "media": {"shortName": "Foreign TV"}, "region": "gb"},
        ]}
        self.assertEqual(broadcast_names(comp), "Fox / B1G+ (streaming)")

    def test_missing_and_scoreboard_broadcast_shapes(self):
        self.assertEqual(broadcast_names({}), "")
        self.assertEqual(broadcast_names({"broadcasts": [{"names": ["ESPN", "ABC"]}]}), "ESPN / ABC")

    def test_metadata_is_escaped_and_unknown_is_in_description(self):
        args = ("id@open-sports-cal", "A @ B", "20261107T180000Z", "20261107T210000Z", "Arena", "League", "Sport")
        event = make_vevent(*args, broadcast="A, B; C\nD")
        self.assertIn(r"X-BROADCAST:A\, B\; C\nD", event)
        self.assertIn(r"Broadcast: A\, B\; C\nD", event)
        self.assertIn("Broadcast not announced", make_vevent(*args, broadcast=""))
        self.assertNotIn("Broadcast:", make_vevent(*args))

    def test_matching_handles_utc_rollover_and_clippers_alias(self):
        self.assertEqual(game_key("LA Clippers", "Iowa", "2026-11-08T00:30Z"),
                         game_key("Los Angeles Clippers", "Iowa", "2026-11-07"))

    def test_legacy_long_uids_stay_unbroken_for_the_repository_validator(self):
        uid = "nba-2026-27-2026-11-07-oklahoma-city-thunder-vs-minnesota-timberwolves@open-sports-cal"
        event = make_vevent(uid, "A @ B", "20261107T180000Z", "20261107T210000Z", "Arena", "League", "Sport", broadcast="ESPN")
        self.assertIn("UID:" + uid, event.splitlines())


if __name__ == "__main__":
    unittest.main()
