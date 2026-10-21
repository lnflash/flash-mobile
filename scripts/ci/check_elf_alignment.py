#!/usr/bin/env python3
"""Verify the speech runtime's packaged 64-bit libraries support 16 KB pages."""
import argparse
import struct
import zipfile

PAGE = 16384
ABIS = ("arm64-v8a", "x86_64")
LIBRARIES = ("libflashspeech.so", "libonnxruntime.so", "libc++_shared.so")


def check_elf(data):
    if data[:5] != b"\x7fELF\x02" or data[5:6] not in (b"\x01", b"\x02"):
        raise ValueError("Expected a 64-bit ELF library")
    order = "<" if data[5] == 1 else ">"
    offset = struct.unpack_from(order + "Q", data, 32)[0]
    size, count = struct.unpack_from(order + "HH", data, 54)
    if size < 56 or count == 0 or offset + size * count > len(data):
        raise ValueError("Invalid program header table")
    loads = 0
    for index in range(count):
        header = offset + size * index
        if struct.unpack_from(order + "I", data, header)[0] != 1:
            continue
        loads += 1
        file_offset, address = struct.unpack_from(order + "QQ", data, header + 8)
        alignment = struct.unpack_from(order + "Q", data, header + 48)[0]
        if alignment < PAGE or alignment & (alignment - 1) or file_offset % PAGE != address % PAGE:
            raise ValueError(f"LOAD segment is not 16 KB compatible (alignment=0x{alignment:x})")
    if loads == 0:
        raise ValueError("No LOAD segments")


def check_apk(path):
    with zipfile.ZipFile(path) as archive:
        for abi in ABIS:
            for library in LIBRARIES:
                name = f"lib/{abi}/{library}"
                try:
                    check_elf(archive.read(name))
                except (KeyError, ValueError, struct.error) as error:
                    raise ValueError(f"{name}: {error}") from error
                print(f"PASS {name}: 16 KB LOAD segments")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk")
    check_apk(parser.parse_args().apk)
