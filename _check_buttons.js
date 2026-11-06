const fs = require('fs');
const c = fs.readFileSync('a:\\chitra ecom\\app\\product\\[id]\\ProductDetail.tsx', 'utf8');
const lines = c.split('\n');
for (let i = 470; i < 492; i++) {
  console.log((i+1) + ': ' + lines[i]);
}