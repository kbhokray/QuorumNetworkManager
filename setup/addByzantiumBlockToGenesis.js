var fs = require('fs');
var genesis;
var number = 1;
if (process.argv.length >= 3) {
  try {
    number = parseInt(process.argv[2], 10)
  } catch (err) {
    console.log("Invalid input parameter: Expected an integer")
    number = 1;
  }
}
fs.readFile('quorum-genesis.json', 'utf8', function(err, data) {
  if (err) throw err;
  genesis = JSON.parse(data)
  genesis.config.byzantiumBlock = number
  dataOut = JSON.stringify(genesis)
  fs.writeFile('quorum-genesis.json', dataOut, 'utf8', function(){})
});
