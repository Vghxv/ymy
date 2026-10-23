import unittest

import register


class RegisterTests(unittest.TestCase):
    def test_extension_id_comes_from_the_manifest_key(self):
        self.assertEqual(register.extension_id(), "daebijkbdhdfckkflkjkofmkhpemjanh")

    def test_launcher_uses_the_project_venv_and_no_absolute_paths(self):
        self.assertIn(r'"%~dp0..\..\.venv\Scripts\python.exe"', register.LAUNCHER)
        self.assertNotIn(register.PROJECT_DIR, register.LAUNCHER)
        self.assertEqual(register.LAUNCHER.count("%"), 2)  # only the two %~dp0


if __name__ == "__main__":
    unittest.main()
