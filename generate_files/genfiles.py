#!/usr/bin/env python3
from pathlib import Path
import re

# --- Configuration ---
BASE_DIR   = Path(__file__).parent.parent.resolve() / "generate_files" / "generated"
INPUT_FILE = BASE_DIR / "input.txt"
OUTPUT_DIR = BASE_DIR 

# Matches lines like: // File: Core/Models/Enums.cs
FILE_PATTERN = re.compile(r"^\s*//\s*File:\s*(.+)$")

def split_by_marker(input_file: Path, output_base: Path):
    lines = input_file.read_text(encoding="utf-8").splitlines(keepends=True)
    current_path = None
    buffer = []

    for raw in lines:
        # Remove linebreaks for matching
        line = raw.rstrip("\r\n")
        m = FILE_PATTERN.match(line)
        if m:
            # New file block: flush previous
            if current_path and buffer:
                write_block(output_base, current_path, buffer)
            # Extract relative path and reset buffer
            current_path = m.group(1).strip()
            buffer = []
        else:
            # Inside a file block, collect content
            if current_path:
                buffer.append(raw)

    # Flush final block
    if current_path and buffer:
        write_block(output_base, current_path, buffer)


def write_block(output_base: Path, relative_path: str, chunk: list[str]):
    out_path = output_base / relative_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Write the collected lines to the output file
    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(chunk)
    print(f"✔ Wrote {out_path.relative_to(BASE_DIR)}")

if __name__ == "__main__":
    if not INPUT_FILE.is_file():
        print(f"✖ Input file '{INPUT_FILE}' not found.")
        exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    split_by_marker(INPUT_FILE, OUTPUT_DIR)
