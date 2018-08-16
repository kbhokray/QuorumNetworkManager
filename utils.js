var exec = require('child_process').exec;
var ps = require('ps-node')
var fs = require('fs');
var async = require('async')
var prompt = require('prompt')
prompt.start();

let config = require('./config')
let ports = config.ports
let setup = config.setup

let constellation = require('./constellation')

const {
  FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_KEYSTORE, FILE_BLOCKCHAIN_NODEKEY,
  FOLDER_NODEKEY, FOLDER_BLOCKCHAIN_GETH, FOLDER_KEYSTORE,
  CONSENSUS,
  ISTANBUL_SETUP_OUTPUT, ISTANBUL_SETUP_OUTPUT_VALIDATORS,
  FILE_BLOCKCHAIN_IBFTVALIDATORADDRESS,
  FILE_BLOCKCHAIN_STATICNODES,
  STDOUT_NEWGETHACCOUNT_YOURNEWACCOUNT, STDOUT_NEWGETHACCOUNT_REPEAT,
  STDOUT_NEWGETHACCOUNT_ADDRESS, STDERR_NEWGETHACCOUNT_NODEFAULTACC,
  ISTANBUL_SETUP_OUTPUT_GENESIS, FILE_GENESIS_QUORUM
} = require('./constants');

function killallGethConstellationNode(cb) {
  var cmd = 'killall -9';
  cmd += ' geth';
  cmd += ' constellation-node';
  var child = exec(cmd, function () {
    cb(null, null);
  });
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

let clearDirectories = (result, cb) => {
  var cmd = 'rm -rf';
  for (var i in result.folders) {
    var folder = result.folders[i];
    cmd += ' ' + folder;
  }
  if (result.folders.includes(FOLDER_BLOCKCHAIN) && config.setup.deleteKeys === false
    && fs.existsSync(FOLDER_BLOCKCHAIN_KEYSTORE) && fs.existsSync(FILE_BLOCKCHAIN_NODEKEY)) {
    console.log('[*] Backing up previous keys')
    let backupKeys = `cp -r ${FOLDER_BLOCKCHAIN_KEYSTORE} . && cp ${FILE_BLOCKCHAIN_NODEKEY} . && `
    cmd = backupKeys + cmd
  } else if (result.folders.includes(FOLDER_BLOCKCHAIN)) {
    console.log('[*] Not backing up previous keys')
  }
  var child = exec(cmd, function () {
    cb(null, result);
  });
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

let createDirectories = (result, cb) => {
  var cmd = 'mkdir -p';
  for (var i in result.folders) {
    var folder = result.folders[i];
    cmd += ' ' + folder;
  }
  if (result.folders.includes(FOLDER_BLOCKCHAIN) && config.setup.deleteKeys === false
    && fs.existsSync(FOLDER_BLOCKCHAIN_KEYSTORE) && fs.readdirSync(FOLDER_BLOCKCHAIN_KEYSTORE).length > 0) {
    console.log('[*] Restoring previous keys')
    let backupKeys = ` && mkdir -p ${FOLDER_BLOCKCHAIN_KEYSTORE} && mv ${FOLDER_KEYSTORE}/* ${FOLDER_BLOCKCHAIN_KEYSTORE}/`
    backupKeys += ` && mv ${FOLDER_NODEKEY} ${FOLDER_BLOCKCHAIN_GETH}/ && rm -rf ${FOLDER_KEYSTORE}`
    cmd = cmd + backupKeys
  } else if (result.folders.includes(FOLDER_BLOCKCHAIN)) {
    console.log('[*] Not reusing old keys')
  }
  var child = exec(cmd, function () {
    cb(null, result);
  });
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

function hex2a(hexx) {
  var hex = hexx.toString();//force conversion
  var str = '';
  for (var i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

// TODO: Add failure after a number of retries
function waitForIpcPath(path, cb) {
  if (fs.existsSync(path)) {
    cb()
  } else {
    setTimeout(function () {
      waitForIpcPath(path, cb)
    }, 1000)
  }
}

function createWeb3Ipc(ipcProvider) {
  let Web3IPC = require('web3_ipc');
  let options = {
    host: ipcProvider,
    ipc: true,
    personal: true,
    admin: true,
    debug: false
  };
  let web3Ipc = Web3IPC.create(options);
  let web3IpcConnection = web3Ipc.currentProvider.connection
  return web3Ipc
}

function waitForRpcConnection(web3Rpc, cb) {
  web3Rpc.eth.net.isListening(function (err, isListening) {
    if (isListening === true) {
      console.log('[*] RPC connection established')
      cb()
    } else {
      setTimeout(function () {
        console.log('waiting for RPC connection ...')
        waitForRpcConnection(web3Rpc, cb)
      }, 1000)
    }
  })
}

// TODO: add error handler here for web3 connections so that program doesn't exit on error
function createWeb3Connection(result, cb) {
  let ipcProvider = result.web3IpcHost;
  waitForIpcPath(ipcProvider, function () {
    // Web3 WS RPC
    let web3WsRpc
    if (result.web3WsRpcProvider) {
      let wsProvider = result.web3WsRpcProvider;
      let Web3 = require('web3');
      web3WsRpc = new Web3(wsProvider);
      result.web3WsRpc = web3WsRpc;
    }
    // Web3 http RPC
    let httpProvider = result.web3RpcProvider;
    let Web3HttpRpc = require('web3');
    let web3HttpRpc = new Web3HttpRpc(httpProvider);
    result.web3HttpRpc = web3HttpRpc
    waitForRpcConnection(result.web3HttpRpc, function () {
      result.web3Ipc = createWeb3Ipc(ipcProvider)
      if (result.consensus === CONSENSUS.RAFT) {
        let Web3Raft = require('web3-raft');
        let web3HttpRaft = new Web3Raft(httpProvider);
        result.web3HttpRaft = web3HttpRaft;
      }
      console.log('[*] Node started')
      cb(null, result);
    })
  })
}

function connectToPeer(result, cb) {
  var enode = result.enode;
  result.web3Ipc.admin.addPeer(enode, function (err, res) {
    if (err) { console.log('ERROR:', err); }
    cb(null, result);
  });
}

function getExistingDefaultAccount(result, cb) {
  var options = { encoding: 'utf8', timeout: 10 * 1000 }
  var child = exec('geth --datadir blockchain account list', options)
  child.stdout.on('data', function (data) {
    if (data.indexOf('Account #0') >= 0) {
      var index1 = data.indexOf('{')
      var index2 = data.indexOf('}')
      var address = '0x' + data.substring(index1 + 1, index2)
      if (result.addressList == undefined) {
        result.addressList = []
      }
      result.addressList.push(address);
      cb(null, result)
    }
  })
  child.stderr.on('data', function (error) {
    if (error.indexOf('No etherbase set and no accounts found as default') < 0) {
      console.log('ERROR:', error)
      cb(error, null)
    }
  })
}

function getNewGethAccount(result, cb) {
  if (config.setup.deleteKeys === true || fs.existsSync(`${FOLDER_BLOCKCHAIN_KEYSTORE}/*`) == false) {
    var options = { encoding: 'utf8', timeout: 10 * 1000 }
    var child = exec(`geth --datadir ${FOLDER_BLOCKCHAIN} account new`, options)
    child.stdout.on('data', function (data) {
      if (data.indexOf(STDOUT_NEWGETHACCOUNT_YOURNEWACCOUNT) >= 0) {
        child.stdin.write('\n')
      } else if (data.indexOf(STDOUT_NEWGETHACCOUNT_REPEAT) >= 0) {
        child.stdin.write('\n')
      } else if (data.indexOf(STDOUT_NEWGETHACCOUNT_ADDRESS) == 0) {
        var index = data.indexOf('{')
        var address = '0x' + data.substring(index + 1, data.length - 2)
        if (result.addressList == undefined) {
          result.addressList = []
        }
        result.addressList.push(address);
        cb(null, result)
      }
    })
    child.stderr.on('data', function (error) {
      if (error.indexOf(STDERR_NEWGETHACCOUNT_NODEFAULTACC) < 0) {
        console.log('ERROR:', error)
        cb(error, null)
      }
    })
  } else {
    getExistingDefaultAccount(result, function (accountAddress) {
      cb(null, result)
    })
  }
}

function instanceAlreadyRunningMessage(processName) {
  console.log('\n--- NOTE: There is an instance of ' + processName + ' already running.' +
    ' Please kill this instance by selecting option 5 before continuing\n')
}

function checkPreviousCleanExit(cb) {
  async.parallel({
    geth: function (callback) {
      ps.lookup({
        command: 'geth',
        psargs: 'ef'
      },
        function (err, resultList) {
          callback(err, resultList)
        })
    },
    constellation: function (callback) {
      ps.lookup({
        command: 'constellation-node',
        psargs: 'ef'
      },
        function (err, resultList) {
          callback(err, resultList)
        })
    }
  }, function (err, result) {
    if (result && result.geth && result.geth.length > 0) {
      instanceAlreadyRunningMessage('geth')
    }
    if (result && result.constellation && result.constellation.length > 0) {
      instanceAlreadyRunningMessage('constellation')
    }
    cb(err, true)
  })
}

function createRaftGenesisBlockConfig(result, cb) {
  let genesisTemplate = {
    "alloc": {},
    "coinbase": result.addressList[0],
    "config": {
      "homesteadBlock": 0,
      "byzantiumBlock": 0,
      "chainId": config.chainId,
      "eip155Block": null,
      "eip158Block": null,
      "isQuorum": true
    },
    "difficulty": "0x0",
    "extraData": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "gasLimit": setup.genesisGasLimit,
    "mixhash": "0x00000000000000000000000000000000000000647572616c65787365646c6578",
    "nonce": "0x0",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "timestamp": "0x00"
  }

  for (let key in result.addressList) {
    genesisTemplate.alloc[result.addressList[key]] = {
      "balance": "1000000000000000000000000000"
    }
  }

  let genesisConfig = JSON.stringify(genesisTemplate)

  fs.writeFile(FILE_GENESIS_QUORUM, genesisConfig, 'utf8', function (err, res) {
    result.communicationNetwork.genesisBlockConfigReady = true;
    cb(err, result);
  })
}

function isWeb3RpcConnectionAlive(web3Rpc) {
  let isAlive = false
  try {
    let accounts = web3Rpc.eth.accounts
    if (accounts) {
      isAlive = true;
    }
  } catch (err) { }
  return isAlive
}

function getEnodePubKey(cb) {
  let options = { encoding: 'utf8', timeout: 10 * 1000 };
  let child = exec(`bootnode -nodekey ${FILE_BLOCKCHAIN_NODEKEY} -writeaddress`, options)
  child.stdout.on('data', function (data) {
    data = data.slice(0, -1)
    cb(null, data)
  })
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function generateEnode(result, cb) {
  console.log('Generating node key');
  switch (result.consensus) {
    case CONSENSUS.RAFT:
      let options = { encoding: 'utf8', timeout: 10 * 1000 };
      let child = exec(`bootnode -genkey ${FILE_BLOCKCHAIN_NODEKEY}`, options)
      child.stderr.on('data', function (error) {
        console.log('ERROR:', error)
      })
      child.stdout.on('close', function (error) {
        getEnodePubKey(function (err, pubKey) {
          let enode = 'enode://' + pubKey + '@' + result.localIpAddress + ':' + ports.gethNode +
            '?raftport=' + ports.raftHttp
          result.nodePubKey = pubKey
          result.enodeList = [enode]
          cb(null, result)
        })
      })
      break;
    case CONSENSUS.ISTANBUL:
      runIstanbulTools(function (err, dataString) {
        getIstanbulSetupFromIstanbulTools(dataString,
          (err, validatorsJson, staticNodesJson, genesisJson) => {
            let validatorAddress = validatorsJson[ISTANBUL_SETUP_OUTPUT_VALIDATORS.ADDRESS]
            let enode = validatorsJson[ISTANBUL_SETUP_OUTPUT_VALIDATORS.NODEINFO].replace('0.0.0.0:30303?discport=0', result.localIpAddress + ':' + ports.gethNode)
            let nodePubKey = enode.substring('enode://'.length, enode.indexOf('@'))
            let nodekey = validatorsJson[ISTANBUL_SETUP_OUTPUT_VALIDATORS.NODEKEY]
            console.log('To become a validator, please use the following address:', validatorAddress)
            result.validatorAddress = validatorAddress
            result.nodePubKey = nodePubKey
            result.enodeList = [enode]
            fs.writeFileSync(FILE_BLOCKCHAIN_NODEKEY, nodekey, 'utf8')
            fs.writeFileSync(FILE_BLOCKCHAIN_IBFTVALIDATORADDRESS, validatorAddress, 'utf8')
            cb(null, result)
          })
      })
      break;
    default:
      console.log('ERROR: Invalid consensus choice')
      cb(null, null)
  }
}

function displayEnode(result, cb) {
  let options = { encoding: 'utf8', timeout: 10 * 1000 };
  let child = exec(`bootnode -nodekey ${FILE_BLOCKCHAIN_NODEKEY} -writeaddress`, options)
  child.stdout.on('data', function (data) {
    data = data.slice(0, -1)
    let enode = 'enode://' + data + '@' + result.localIpAddress + ':' + ports.gethNode + '?raftport=' + ports.raftHttp
    console.log('\nenode:', enode + '\n')
    cb(null, result)
  })
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function displayCommunicationEnode(result, cb) {
  if (!result) {
    return cb({ error: 'parameter not defined, could not get ip address' }, null)
  }
  var options = { encoding: 'utf8', timeout: 10 * 1000 };
  var child = exec('bootnode -nodekey CommunicationNode/geth/nodekey -writeaddress', options)
  child.stdout.on('data', function (data) {
    data = data.slice(0, -1)
    let enode = 'enode://' + data + '@' + result.localIpAddress + ':'
      + ports.communicationNode
    console.log('\n', enode + '\n')
    result.nodePubKey = data
    result.enodeList = [enode]
    cb(null, result)
  })
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function handleExistingFiles(result, cb) {
  if (result.keepExistingFiles == false) {
    let seqFunction = async.seq(
      clearDirectories,
      createDirectories
    )
    seqFunction(result, function (err, res) {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

function createStaticNodeFile(enodeList, cb) {
  let options = { encoding: 'utf8', timeout: 100 * 1000 };
  let list = ''
  for (let enode of enodeList) {
    list += '"' + enode + '",'
  }
  list = list.slice(0, -1)
  let staticNodes = '['
    + list
    + ']'

  fs.writeFile(FILE_BLOCKCHAIN_STATICNODES, staticNodes, function (err, res) {
    cb(err, res);
  });
}

function getRaftConfiguration(result, cb) {
  if (setup.automatedSetup) {
    if (setup.enodeList) {
      result.enodeList = result.enodeList.concat(setup.enodeList)
    }
    createStaticNodeFile(result.enodeList, function (err, res) {
      result.communicationNetwork.staticNodesFileReady = true
      cb(err, result)
    })
  } else {
    console.log('Please wait for others to join. Hit any key + enter once done.')
    prompt.get(['done'], function (err, answer) {
      if (result.communicationNetwork && result.communicationNetwork.enodeList) {
        result.enodeList = result.enodeList.concat(result.communicationNetwork.enodeList)
      }
      createStaticNodeFile(result.enodeList, function (err, res) {
        result.communicationNetwork.staticNodesFileReady = true
        cb(err, result)
      })
    })
  }
}

function runIstanbulTools(cb) {
  let cmd = 'istanbul setup --nodes --verbose --num 1 --quorum';
  let child = exec(cmd, function () { })

  let dataString = ''
  child.stdout.on('data', function (chunk) {
    dataString += chunk
  })

  child.stdout.on('end', function () {
    cb(null, dataString)
  })

  child.stderr.on('data', function (error) {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function getIstanbulSetupFromIstanbulTools(dataString, cb) {

  let validatorsName = ISTANBUL_SETUP_OUTPUT.VALIDATORS
  let staticNodesFileName = ISTANBUL_SETUP_OUTPUT.STATICNODES
  let genesisFileName = ISTANBUL_SETUP_OUTPUT.GENESISJSON
  let validatorsIndex = dataString.indexOf(ISTANBUL_SETUP_OUTPUT.VALIDATORS)
  let staticNodesIndex = dataString.indexOf(ISTANBUL_SETUP_OUTPUT.STATICNODES)
  let genesisFileIndex = dataString.indexOf(ISTANBUL_SETUP_OUTPUT.GENESISJSON)

  let validatorsFile = dataString.substring(validatorsName.length, staticNodesIndex)
  let validatorsJson = JSON.parse(validatorsFile)

  let staticNodesJson = JSON.parse(dataString.substring(staticNodesIndex + staticNodesFileName.length, genesisFileIndex))

  let genesisJson = JSON.parse(dataString.substring(genesisFileIndex + genesisFileName.length))
  genesisJson.gasLimit = setup.genesisGasLimit

  cb(null, validatorsJson, staticNodesJson, genesisJson)
}

function getIstanbulConfiguration(result, cb) {
  runIstanbulTools(function (err, dataString) {
    getIstanbulSetupFromIstanbulTools(dataString, function (err, validatorsJSON, staticNodesJSON, genesisJSON) {
      let nodekeyFile = validatorsJSON[ISTANBUL_SETUP_OUTPUT_VALIDATORS.NODEKEY]
      fs.writeFileSync(FILE_BLOCKCHAIN_NODEKEY, nodekeyFile, 'utf8')

      staticNodesJSON[0] = staticNodesJSON[0].replace('0.0.0.0:30303?discport=0', result.localIpAddress + ':' + ports.gethNode)
      fs.writeFileSync(FILE_BLOCKCHAIN_STATICNODES, JSON.stringify(staticNodesJSON), 'utf8')

      genesisJSON[ISTANBUL_SETUP_OUTPUT_GENESIS.CONFIG].chainId = config.chainId
      genesisJSON[ISTANBUL_SETUP_OUTPUT_GENESIS.CONFIG].byzantiumBlock = 1
      for (let key in result.addressList) {
        genesisJSON.alloc[result.addressList[key]] = {
          "balance": "0x446c3b15f9926687d2c40534fdb564000000000000"
        }
      }
      fs.writeFileSync(FILE_GENESIS_QUORUM, JSON.stringify(genesisJSON), 'utf8')

      result.communicationNetwork.genesisBlockConfigReady = true
      result.communicationNetwork.staticNodesFileReady = true
      cb(err, result)
    })
  })
}

function addAddressListToQuorumConfig(result, cb) {
  if (setup.addressList && setup.addressList.length > 0) {
    result.addressList = result.addressList.concat(setup.addressList)
  }
  if (result.communicationNetwork && result.communicationNetwork.addressList) {
    result.addressList = result.addressList.concat(result.communicationNetwork.addressList)
  }
  cb(null, result)
}

function handleNetworkConfiguration(result, cb) {
  if (result.keepExistingFiles == false) {
    let createGenesisBlockConfig = null
    switch (result.consensus) {
      case CONSENSUS.RAFT: {
        let seqFunction = async.seq(
          getRaftConfiguration,
          getNewGethAccount,
          addAddressListToQuorumConfig,
          createRaftGenesisBlockConfig,
          constellation.createNewKeys,
          constellation.createConfig
        )
        seqFunction(result, function (err, res) {
          if (err) { return console.log('ERROR', err) }
          cb(null, res)
        })
      }
        break;
      case CONSENSUS.ISTANBUL: {
        let seqFunction = async.seq(
          getNewGethAccount,
          addAddressListToQuorumConfig,
          getIstanbulConfiguration,
          constellation.createNewKeys,
          constellation.createConfig
        )
        seqFunction(result, function (err, res) {
          if (err) { return console.log('ERROR', err) }
          cb(null, res)
        })
      }
        break
      default:
        console.log('ERROR in handleNetworkConfiguration: Unknown consensus choice')
        cb(null, null)
    }
  } else {
    result.communicationNetwork.genesisBlockConfigReady = true
    result.communicationNetwork.staticNodesFileReady = true
    cb(null, result)
  }
}

exports.hex2a = hex2a
exports.clearDirectories = clearDirectories
exports.createDirectories = createDirectories
exports.createWeb3Connection = createWeb3Connection
exports.connectToPeer = connectToPeer
exports.killallGethConstellationNode = killallGethConstellationNode
exports.getNewGethAccount = getNewGethAccount
exports.checkPreviousCleanExit = checkPreviousCleanExit
exports.CreateRaftGenesisBlockConfig = createRaftGenesisBlockConfig
exports.isWeb3RpcConnectionAlive = isWeb3RpcConnectionAlive
exports.generateEnode = generateEnode
exports.displayEnode = displayEnode
exports.DisplayCommunicationEnode = displayCommunicationEnode
exports.handleExistingFiles = handleExistingFiles
exports.generateEnode = generateEnode
exports.displayEnode = displayEnode
exports.handleNetworkConfiguration = handleNetworkConfiguration
