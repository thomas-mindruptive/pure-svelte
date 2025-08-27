#!/usr/bin/env python3
from pathlib import Path
import sys, os

# --- Konfiguration ---
START_DIR = Path(__file__).parent.parent.resolve()
OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "bundle.txt"

EXTENSIONS = {
    '.cs', '.ts', '.html', '.json', '.yaml', '.yml', '.css',
    '.md', '.svelte', '.js', '.txt', '.scss', '.cjs', '.mjs'
}

EXCLUDE_PATTERNS = [
    "node_modules",
    "lib/components",
    "lib/stores",
    "lib/utils",
    ".git",
    ".venv",
    ".vscode",
    ".svelte-kit",
    ".vite",
    "static",
    "playwright-report",
    "generated_data",
    "generate_files",
    "input_data",
    "output",
    "bin",
    "obj",
    "Tests",
]

EXCLUDE_FILES = [
    "package-lock.json", ".gitignore", "package.json", "package-lock.json"
]

def should_skip_dir(dirpath: str) -> bool:
    rel = dirpath.replace("\\", "/")
    for pat in EXCLUDE_PATTERNS:
        if pat in rel:
            print(f"✖ Überspringe Ordner: {rel} (wegen '{pat}')")
            return True
    return False

def is_excluded_file(filepath: str) -> bool:
    fname = os.path.basename(filepath)
    if fname in EXCLUDE_FILES:
        print(f"✖ Ausschluss-Datei: {filepath}")
        return True
    return False

def bundle_files(start_dir: Path, output_file: Path):
    print(f"→ Stelle sicher, dass Zielverzeichnis '{output_file.parent}' existiert …")
    output_file.parent.mkdir(parents=True, exist_ok=True)

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
                # hier kein Spam-Log, außer du willst
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

if __name__ == '__main__':
    print("--- Zusammenfassung ---")
    print(f"Quell-Startverzeichnis: {START_DIR}")
    print(f"Zieldatei: {OUTPUT_FILE.name}")
    print(f"Zielverzeichnis: {OUTPUT_FILE.parent.resolve()}")
    print(f"Zu sammelnde Dateiendungen: {sorted(EXTENSIONS)}")
    print(f"Ausgeschlossene Pfade: {EXCLUDE_PATTERNS}")
    print(f"Ausgeschlossene Dateien: {EXCLUDE_FILES}")
    print("-----------------------")

    bundle_files(START_DIR, OUTPUT_FILE)
    print("Fertig.")
