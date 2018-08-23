let exec = require('child_process').exec;
let fs = require('fs');
const {
  STDOUT_CONSTELLATIONGENKEY_LOCKKEYPAIR, CONSTELLATION_HELPURL,
  STDOUT_CONSTELLATIONVERSION_010
} = require('../constants')

let checkVersionOfConstellation = (cb) => {
  let helpUrl = CONSTELLATION_HELPURL;
  let cmd = 'constellation-node --version'
  let child = exec(cmd)
  child.stdout.on('data', (data) => {
    if (!data.includes(STDOUT_CONSTELLATIONVERSION_010)) {
      console.log('Incorrect version of constellation installed, please refer to', helpUrl)
      cb(false)
    } else {
      cb(true)
    }
  })
  child.stderr.on('data', (error) => {
    console.log('ERROR:', error)
    console.log('ERROR is likely because an incorrect version of constellation is installed, please refer to', helpUrl)
    cb(false)
  })
}

let createNewConstellationKeys = (result, cb) => {
  checkVersionOfConstellation((correctVersion) => {
    if (correctVersion === true) {
      let counter = result.constellationKeySetup.length;
      let cmd = "";
      for (let i in result.constellationKeySetup) {
        let folderName = result.constellationKeySetup[i].folderName;
        let fileName = result.constellationKeySetup[i].fileName;
        cmd += `cd ${folderName} && constellation-node --generatekeys=${fileName} && cd ../.. && `;
      }
      cmd = cmd.substring(0, cmd.length - 4);
      let child = exec(cmd);
      child.stdout.on('data', (data) => {
        if (data.indexOf(STDOUT_CONSTELLATIONGENKEY_LOCKKEYPAIR) >= 0) {
          child.stdin.write('\n');
          counter--;
          if (counter <= 0) {
            cb(null, result);
          }
        } else {
          console.log('Unexpected data:', data);
          cb(null, result);
        }
      });
      child.stderr.on('data', (error) => {
        console.log('ERROR:', error);
        cb(error, null);
      });
    } else {
      process.exit(1)
    }
  })
}

let createConstellationConfig = (result, cb) => {
  let c = result.constellationConfigSetup
  let config = `url = "http://${c.localIpAddress}:${c.localPort}/"\n`
  config += `port = ${c.localPort}\n`
  config += `socket = "${c.folderName}/socket.ipc"\n`
  config += `othernodes = ["http://${c.remoteIpAddress}:${c.remotePort}/"]\n`
  config += `publickeys = ["${c.folderName}/${c.publicKeyFileName}","${c.folderName}/${c.publicArchKeyFileName}"]\n`
  config += `privatekeys = ["${c.folderName}/${c.privateKeyFileName}","${c.folderName}/${c.privateArchKeyFileName}"]\n`
  config += `storage = "${c.folderName}/data"`
  fs.writeFile(c.configName, config, (err, res) => {
    cb(err, result)
  });
}

exports.createNewKeys = createNewConstellationKeys
exports.createConfig = createConstellationConfig
