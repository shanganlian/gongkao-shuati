const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

mammoth.extractRawText({ path: filePath })
  .then(result => {
    const text = result.value;
    console.log('=== DOCUMENT TEXT ===');
    console.log(text.substring(0, 8000));
    console.log('=== END ===');
    console.log('Total length:', text.length);
  })
  .catch(err => {
    console.error('Error:', err.message);
  });
