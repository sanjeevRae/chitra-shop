const fs = require('fs');
let c = fs.readFileSync('components/admin/ProductAdmin.tsx', 'utf8');
// Fix missing ); after handleCloudinaryAccount useCallback
const old = '    [],\n\n  const saveProduct';
const newStr = '    [],\n  );\n\n  const saveProduct';
if (c.includes(old)) {
  c = c.replace(old, newStr);
  fs.writeFileSync('components/admin/ProductAdmin.tsx', c, 'utf8');
  console.log('Fixed!');
} else {
  console.log('Pattern not found, checking what is actually there...');
  const idx = c.indexOf('const saveProduct');
  console.log('Context around saveProduct:', JSON.stringify(c.substring(idx-30, idx+10)));
}