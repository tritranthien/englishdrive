from pathlib import Path
import hashlib
import tarfile

root = Path(__file__).resolve().parent.parent
roots = ['apps/api', 'packages/shared', 'packages/eslint-config', 'services/transcription', 'deploy']
files = []
for directory in roots:
    for path in (root / directory).rglob('*'):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root)
        if any(part in {'node_modules', 'dist', 'coverage', '__pycache__', '.git'} for part in relative.parts):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.suffix in {'.log', '.pyc', '.tsbuildinfo'} or path.name == 'google-services.json' or 'firebase-adminsdk' in path.name or 'firebase-service-account' in path.name:
            continue
        files.append(relative)
files.extend(Path(name) for name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.dockerignore'])
archive = root / '.tmp' / 'englishdrive-video-chat-audio.tar.gz'
with tarfile.open(archive, 'w:gz') as bundle:
    for relative in sorted(set(files)):
        bundle.add(root / relative, arcname=relative.as_posix(), recursive=False)
(root / '.tmp' / 'video-chat-audio-files.txt').write_text('\n'.join(str(path) for path in sorted(set(files))), encoding='utf-8')
print(f'Packaged {len(set(files))} files, {archive.stat().st_size} bytes')
print(f'SHA256 {hashlib.sha256(archive.read_bytes()).hexdigest()}')
