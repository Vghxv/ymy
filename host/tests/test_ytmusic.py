import unittest

from ytm_host.ytmusic import entry_from, read_playlist

PLAYED = "playedVideo"
ADDED = "addedVideo0"


def row(played, added, title="Song"):
    return {
        "musicResponsiveListItemRenderer": {
            "flexColumns": [
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": title}]}}},
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": "Artist"}]}}},
            ],
            "playlistItemData": {"videoId": played},
            "menu": {"menuRenderer": {"topLevelButtons": [{"likeButtonRenderer": {"target": {"videoId": added}}}]}},
        }
    }


def more(token):
    return {"continuationItemRenderer": {"continuationEndpoint": {"continuationCommand": {"token": token}}}}


def first_page(items, title="Mix"):
    return {
        "contents": {
            "tabs": [{"musicResponsiveHeaderRenderer": {"title": {"runs": [{"text": title}]}}}],
            "secondaryContents": {"musicPlaylistShelfRenderer": {"contents": items}},
        }
    }


def next_page(items):
    return {"onResponseReceivedActions": [{"appendContinuationItemsAction": {"continuationItems": items}}]}


class ReadPlaylistTests(unittest.TestCase):
    def fake_post(self, pages):
        self.requests = []

        def post(body):
            self.requests.append(body)
            return pages.pop(0)

        return post

    def test_title_and_the_video_each_row_plays(self):
        post = self.fake_post([first_page([row("AAAAAAAAAAA", "AAAAAAAAAAA", "One"), row(PLAYED, ADDED, "Two")])])
        self.assertEqual(
            read_playlist("PLabc", post=post),
            {
                "title": "Mix",
                "entries": [
                    {"id": "AAAAAAAAAAA", "added": "AAAAAAAAAAA", "title": "One"},
                    {"id": PLAYED, "added": ADDED, "title": "Two"},
                ],
            },
        )
        self.assertEqual(self.requests, [{"browseId": "VLPLabc"}])

    def test_every_page_is_read(self):
        post = self.fake_post([
            first_page([row("AAAAAAAAAAA", "AAAAAAAAAAA"), more("t1")]),
            next_page([row("BBBBBBBBBBB", "BBBBBBBBBBB"), more("t2")]),
            next_page([row(PLAYED, ADDED)]),
        ])
        entries = read_playlist("PLabc", post=post)["entries"]
        self.assertEqual([entry["id"] for entry in entries], ["AAAAAAAAAAA", "BBBBBBBBBBB", PLAYED])
        self.assertEqual(self.requests[1:], [{"continuation": "t1"}, {"continuation": "t2"}])

    def test_a_playlist_youtube_music_cannot_show_is_none(self):
        post = self.fake_post([{"microformat": {"microformatDataRenderer": {"title": ""}}}])
        self.assertIsNone(read_playlist("PLabc", post=post))

    def test_an_empty_playlist_has_no_entries(self):
        post = self.fake_post([{"contents": {"musicResponsiveHeaderRenderer": {"title": {"runs": [{"text": "Mix"}]}}}}])
        self.assertEqual(read_playlist("PLabc", post=post), {"title": "Mix", "entries": []})

    def test_request_failures_are_raised(self):
        def post(body):
            raise OSError("timed out")

        with self.assertRaises(OSError):
            read_playlist("PLabc", post=post)


class EntryTests(unittest.TestCase):
    def test_a_row_without_its_own_video_plays_the_added_one(self):
        item = row(None, ADDED)["musicResponsiveListItemRenderer"]
        del item["playlistItemData"]
        self.assertEqual(entry_from(item), {"id": ADDED, "added": ADDED, "title": "Song"})

    def test_a_malformed_row_has_no_id(self):
        self.assertEqual(entry_from({}), {"id": None, "added": None, "title": ""})


if __name__ == "__main__":
    unittest.main()
