const fs = require('fs')
const s = fs.readFileSync('node_modules/ai/dist/index.d.ts', 'utf8')
for (const name of ['TextStreamToolInputStartPart', 'TextStreamToolInputDeltaPart', 'TextStreamToolInputEndPart', 'TextStreamTextDeltaPart']) {
  const i = s.indexOf(`type ${name} =`)
  console.log('===', name, '===')
  console.log(s.slice(i, i + 320).replace(/\n/g, ' '))
}
