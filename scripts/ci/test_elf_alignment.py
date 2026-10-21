import pathlib
import struct
import tempfile
import unittest
import zipfile

from check_elf_alignment import ABIS, LIBRARIES, check_apk, check_elf


def elf(alignment, file_offset=0, address=0):
    data = bytearray(120)
    data[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<Q", data, 32, 64)
    struct.pack_into("<HH", data, 54, 56, 1)
    struct.pack_into("<I", data, 64, 1)
    struct.pack_into("<QQ", data, 72, file_offset, address)
    struct.pack_into("<Q", data, 112, alignment)
    return data


class ElfAlignmentTest(unittest.TestCase):
    def test_accepts_16kb(self):
        check_elf(elf(16384))

    def test_rejects_4kb_and_incongruent_segments(self):
        for data in (elf(4096), elf(16384, file_offset=4096)):
            with self.assertRaises(ValueError):
                check_elf(data)

    def test_rejects_truncated_header(self):
        with self.assertRaises((ValueError, struct.error)):
            check_elf(elf(16384)[:80])

    def test_checks_every_packaged_dependency_and_abi(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "fixture.apk"
            for failing in (None, "lib/x86_64/libonnxruntime.so", "missing"):
                with zipfile.ZipFile(path, "w") as archive:
                    for abi in ABIS:
                        for library in LIBRARIES:
                            name = f"lib/{abi}/{library}"
                            if failing == "missing" and abi == "arm64-v8a":
                                continue
                            archive.writestr(name, elf(4096 if name == failing else 16384))
                if failing is None:
                    check_apk(path)
                else:
                    with self.assertRaises(ValueError):
                        check_apk(path)


if __name__ == "__main__":
    unittest.main()
