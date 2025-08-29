#!/usr/bin/env python3
from pathlib import Path
import sys, os

# --- Konfiguration ---
START_DIR = Path(__file__).parent.parent.resolve()
OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "bundle.txt"

# --- Optionen ---
TREE_ONLY = True  # Wenn True: nur Verzeichnisstruktur schreiben
TREE_OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "tree.txt"
TREE_INCLUDE_ALL_FILES = False  # Alle Dateien listen, nicht nur mit EXTENSIONS

EXTENSIONS = {
    '.cs', '.ts', '.html', '.json', '.yaml', '.yml', '.css',
    '.md', '.svelte', '.js', '.txt', '.scss', '.cjs', '.mjs'
}

EXCLUDE_PATTERNS = [
    "node_modules", "routes/api", "lib/server", ".git", ".venv",
    ".vscode", ".svelte-kit", ".vite", "static", "playwright-report",
    "generated_data", "generate_files", "scaffolding-generated",
    "input_data", "output", "bin", "obj", "Tests",
]

EXCLUDE_FILES = ["package-lock.json", ".gitignore", "package.json", "package-lock.json"]

# --- Hilfsfunktionen ---
def should_skip_dir(rel_dirpath: str) -> bool:
    rel = rel_dirpath.replace("\\", "/")
    for pat in EXCLUDE_PATTERNS:
        if pat in rel and pat != "":
            return True
    return False

def is_excluded_file(filepath_or_name: str) -> bool:
    fname = os.path.basename(filepath_or_name)
    return fname in EXCLUDE_FILES

def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)

# --- NEU: Verzeichnisstruktur ---
def build_tree_lines(start_dir: Path, include_all_files: bool) -> list[str]:
    lines: list[str] = []
    def walk(current_dir: Path, level: int):
        try:
            entries = list(current_dir.iterdir())
        except PermissionError:
            return
        dirs, files = [], []
        rel_dir = os.path.relpath(current_dir, start_dir)
        if rel_dir == ".": rel_dir = ""
        if rel_dir and should_skip_dir(rel_dir): return
        for e in entries:
            rel_path = os.path.relpath(e, start_dir).replace("\\", "/")
            if e.is_dir():
                if should_skip_dir(rel_path): continue
                dirs.append(e)
            else:
                if is_excluded_file(e.name): continue
                if include_all_files or e.suffix.lower() in EXTENSIONS:
                    files.append(e)
        dirs.sort(key=lambda p: p.name.casefold())
        files.sort(key=lambda p: p.name.casefold())
        if current_dir != start_dir:
            lines.append(f"{'  '*level}* {current_dir.name}")
        file_level = level if current_dir == start_dir else level + 1
        for f in files:
            lines.append(f"{'  '*file_level}* {f.name}")
        for d in dirs:
            walk(d, file_level)
    walk(start_dir, 0)
    return lines

def write_tree(start_dir: Path, output_file: Path, include_all_files: bool = False):
    ensure_parent(output_file)
    lines = build_tree_lines(start_dir, include_all_files)
    with open(output_file, "w", encoding="utf-8") as out:
        out.write("\n".join(lines))
        out.write("\n")
    print(f"✔ Verzeichnisstruktur in '{output_file}' geschrieben ({len(lines)} Zeilen).")

# --- Dein bundling bleibt unverändert ---
def bundle_files(start_dir: Path, output_file: Path):
    # (hier dein bisheriger bundling-code unverändert)
    ...

# --- main ---
if __name__ == '__main__':
    print("--- Zusammenfassung ---")
    print(f"Quell-Startverzeichnis: {START_DIR}")
    print(f"Zieldatei (Bundle): {OUTPUT_FILE}")
    print(f"Tree-Ausgabedatei: {TREE_OUTPUT_FILE}")
    print(f"Tree Only: {TREE_ONLY}, Alle Dateien: {TREE_INCLUDE_ALL_FILES}")
    print("-----------------------")

    if TREE_ONLY:
        write_tree(START_DIR, TREE_OUTPUT_FILE, include_all_files=TREE_INCLUDE_ALL_FILES)
    else:
        bundle_files(START_DIR, OUTPUT_FILE)

    print("Fertig.")
