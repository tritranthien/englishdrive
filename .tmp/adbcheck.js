const { execFileSync } = require('child_process');
const ADB = 'C:\\Users\\Admin\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
try {
  const out = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' });
  console.log('SPAWN-PIPE OK:');
  console.log(out);
} catch (e) {
  console.log('SPAWN-PIPE FAIL:', e.code, e.message);
}
