#!/usr/bin/env python3
from pathlib import Path
import sys, os

# --- Konfiguration ---
START_DIR = Path(__file__).parent.parent.resolve()
OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "bundle.txt"

# --- Optionen ---
TREE_ONLY = False  # Wenn True: nur Verzeichnisstruktur schreiben und beenden
TREE_OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "tree.txt"
TREE_INCLUDE_ALL_FILES = (
    False  # Alle Dateien listen (nicht nur EXTENSIONS) beim Struktur-Output
)

EXTENSIONS = {
    ".cs",
    ".ts",
    ".html",
    ".json",
    ".yaml",
    ".yml",
    ".css",
    ".md",
    ".svelte",
    ".js",
    ".txt",
    ".scss",
    ".cjs",
    ".mjs",
}

EXCLUDE_PATTERNS = [
    "routes",
    "tmp",
    "tools",
    "node_modules",
    "lib/server",
    ".git",
    ".venv",
    ".vscode",
    ".svelte-kit",
    ".vite",
    "static",
    "playwright-report",
    "generated_data",
    "generate_files",
    "scaffolding-generated",
    "input_data",
    "output",
    "bin",
    "obj",
    "Tests",
]

EXCLUDE_FILES = ["package-lock.json", ".gitignore", "package.json", "package-lock.json"]


def should_skip_dir(rel_dirpath: str) -> bool:
    rel = rel_dirpath.replace("\\", "/")
    for pat in EXCLUDE_PATTERNS:
        if pat in rel:
            print(f"✖ Überspringe Ordner: {rel} (wegen '{pat}')")
            return True
    return False


def is_excluded_file(filepath_or_name: str) -> bool:
    fname = os.path.basename(filepath_or_name)
    if fname in EXCLUDE_FILES:
        print(f"✖ Ausschluss-Datei: {filepath_or_name}")
        return True
    return False


def ensure_parent(path: Path):
    print(f"→ Stelle sicher, dass Zielverzeichnis '{path.parent}' existiert …")
    path.parent.mkdir(parents=True, exist_ok=True)


# --- Verzeichnisstruktur (NEU) ---
def build_tree_lines(start_dir: Path, include_all_files: bool) -> list[str]:
    """
    Gibt Zeilen im Format:
    * folder
      * file
      * subfolder
        * file
    zurück (2 Leerzeichen Einrückung je Ebene).
    """
    lines: list[str] = []

    def walk(current_dir: Path, level: int):
        try:
            entries = list(current_dir.iterdir())
        except PermissionError:
            return

        dirs, files = [], []

        rel_dir = os.path.relpath(current_dir, start_dir)
        if rel_dir == ".":
            rel_dir = ""

        # aktuellen Ordner ggf. überspringen
        if rel_dir and should_skip_dir(rel_dir):
            return

        for e in entries:
            rel_path = os.path.relpath(e, start_dir).replace("\\", "/")
            if e.is_dir():
                if should_skip_dir(rel_path):
                    continue
                dirs.append(e)
            else:
                if is_excluded_file(e.name):
                    continue
                if include_all_files or e.suffix.lower() in EXTENSIONS:
                    files.append(e)

        dirs.sort(key=lambda p: p.name.casefold())
        files.sort(key=lambda p: p.name.casefold())

        # Nicht den Startordner selbst ausgeben, nur Inhalte
        if current_dir != start_dir:
            lines.append(f"{'  '*level}* {current_dir.name}")

        file_level = level if current_dir == start_dir else level + 1
        for f in files:
            lines.append(f"{'  '*file_level}* {f.name}")

        next_level = level if current_dir == start_dir else level + 1
        for d in dirs:
            walk(d, next_level)

    walk(start_dir, 0)
    return lines


def write_tree(start_dir: Path, output_file: Path, include_all_files: bool = False):
    ensure_parent(output_file)

    if output_file.exists():
        try:
            output_file.unlink()
            print(f"✔ Vorhandene Baum-Ausgabedatei '{output_file}' gelöscht.")
        except Exception as e:
            print(f"⚠ Fehler beim Löschen: {e}", file=sys.stderr)
            sys.exit(1)

    lines = build_tree_lines(start_dir, include_all_files=include_all_files)

    try:
        with open(output_file, "w", encoding="utf-8") as out:
            out.write("\n".join(lines))
            out.write("\n")
    except Exception as e:
        print(f"⚠ Fehler beim Schreiben der Baumdatei: {e}", file=sys.stderr)
        sys.exit(1)

    print(
        f"✔ Verzeichnisstruktur in '{output_file}' geschrieben ({len(lines)} Zeilen)."
    )


# --- Bundling ---
def bundle_files(start_dir: Path, output_file: Path):
    ensure_parent(output_file)

    if output_file.exists():
        try:
            output_file.unlink()
            print(f"✔ Vorhandene Ausgabedatei '{output_file}' gelöscht.")
        except Exception as e:
            print(f"⚠ Fehler beim Löschen: {e}", file=sys.stderr)
            sys.exit(1)

    target_files = []

    for dirpath, dirnames, filenames in os.walk(start_dir):
        rel_dir = os.path.relpath(dirpath, start_dir)
        if rel_dir == ".":
            rel_dir = ""  # root

        # Ordner überspringen?
        if should_skip_dir(rel_dir):
            dirnames[:] = []  # Unterordner nicht mehr betreten
            continue

        for fname in filenames:
            filepath = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(filepath, start_dir).replace("\\", "/")

            if not Path(fname).suffix.lower() in EXTENSIONS:
                continue
            if is_excluded_file(fname):
                continue

            target_files.append(filepath)

    print(f"→ Insgesamt {len(target_files)} Dateien gefunden.")

    try:
        with open(output_file, "w", encoding="utf-8") as out:
            for filepath in sorted(target_files):
                rel_path = os.path.relpath(filepath, start_dir).replace("\\", "/")
                print(f"✔ Verarbeite Datei: {rel_path}")
                out.write(f"// File: {rel_path}\n")
                with open(filepath, encoding="utf-8") as f:
                    content = f.read()
                out.write(content)
                if not content.endswith("\n"):
                    out.write("\n")
                out.write("\n")
    except Exception as e:
        print(f"⚠ Fehler beim Schreiben: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✔ Erfolgreich alle Dateien in '{output_file}' gebündelt.")


# --- main ---
if __name__ == "__main__":
    print("--- Zusammenfassung ---")
    print(f"Quell-Startverzeichnis: {START_DIR}")
    print(f"Zieldatei (Bundle): {OUTPUT_FILE.name}")
    print(f"Zielverzeichnis (Bundle): {OUTPUT_FILE.parent.resolve()}")
    print(f"Tree-Ausgabedatei: {TREE_OUTPUT_FILE}")
    print(f"Zu sammelnde Dateiendungen: {sorted(EXTENSIONS)}")
    print(f"Ausgeschlossene Pfade: {EXCLUDE_PATTERNS}")
    print(f"Ausgeschlossene Dateien: {EXCLUDE_FILES}")
    print(f"TREE_ONLY: {TREE_ONLY} | TREE_INCLUDE_ALL_FILES: {TREE_INCLUDE_ALL_FILES}")
    print("-----------------------")

    if not START_DIR.exists():
        print(f"⚠ Startverzeichnis existiert nicht: {START_DIR}", file=sys.stderr)
        sys.exit(1)

    if TREE_ONLY:
        write_tree(
            START_DIR, TREE_OUTPUT_FILE, include_all_files=TREE_INCLUDE_ALL_FILES
        )
    else:
        bundle_files(START_DIR, OUTPUT_FILE)

    print("Fertig.")

