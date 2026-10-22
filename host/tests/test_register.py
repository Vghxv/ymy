import unittest

import register


class RegisterTests(unittest.TestCase):
    def test_extension_id_comes_from_the_manifest_key(self):
        self.assertEqual(register.extension_id(), "daebijkbdhdfckkflkjkofmkhpemjanh")


if __name__ == "__main__":
    unittest.main()
