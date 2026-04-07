const fs = require('fs');
let content = fs.readFileSync('apps/frontend/src/native/CoursesNative.tsx', 'utf8');

content = content.replace(/type="number"\s*\n\s*min=\{0\}\s*\n\s*step="0\.01"/g, 'type="text"');

// Fix parseNumberSafe
const oldParse = `function parseNumberSafe(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? parsed : undefined;
}`;

const newParse = `function parseNumberSafe(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let str = String(value).trim();
  
  if (str.includes(',')) {
    str = str.replace(/\\./g, '').replace(',', '.');
  } else {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\\./g, '');
    } else if (parts.length === 2 && parts[1].length === 3) {
      str = str.replace(/\\./g, '');
    }
  }

  const parsed = Number(str);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? parsed : undefined;
}`;

content = content.replace(oldParse, newParse);

fs.writeFileSync('apps/frontend/src/native/CoursesNative.tsx', content);
