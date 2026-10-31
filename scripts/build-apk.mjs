// Builds an APK that works by itself, without the dev server, into production/.
// The dev settings in capacitor.config.json are put back afterwards.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'capacitor.config.json';
const original = readFileSync(CONFIG, 'utf8');
const run = (command, cwd = '.') => execSync(command, { stdio: 'inherit', cwd });

try {
  const config = JSON.parse(original);
  delete config.server;
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  run('npx vite build');
  run('npx cap sync android');
  run(process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug', 'android');
  mkdirSync('production', { recursive: true });
  copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'production/MarbleValley.apk');
  console.log('production/MarbleValley.apk');
} finally {
  writeFileSync(CONFIG, original);
  run('npx cap copy android');
}
