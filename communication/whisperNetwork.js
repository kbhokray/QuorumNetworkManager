var exec = require('child_process').exec;
var fs = require('fs');
var async = require('async');

var events = require('../eventEmitter.js');
var utils = require('../utils');
var config = require('../config.js')
var ports = require('../config.js').ports
var networkMembership = require('./networkMembership.js');
var istanbulNetworkMembership = require('./istanbulNetworkMembership.js');
var nodeInformation = require('./nodeInformation.js');
var messageString = require('./messageStrings.js');
var request = messageString.Request;
var response = messageString.Response;
var whisperUtils = require('./whisperUtils.js');
const {
  FOLDER_WHISPERNODE, FOLDER_WHISPER_GETH,
  FILE_WHISPER_DEFAULTCOMMNODEKEY, FILE_WHISPER_COMMNODEKEY,
  WHISPER_TOPIC_GENESISCONFIG, WHISPER_TOPIC_STATICNODES,
  WHISPER_TOPIC_ENODE, WHISPER_TOPIC_ETHER,
  FILE_WHISPER_GETHIPC, 
  WHISPERPROVIDER_RPC_LOCALHOST, WHISPERPROVIDER_WS_LOCALHOST,
  FILE_GENESIS_QUORUM, FILE_BLOCKCHAIN_STATICNODES,
  SCRIPT_WHISPER_STARTCOMMNODE
} = require('../constants');

let whisperLog = 'whisperCommunications.log'

// TODO: Maybe check that address is indeed in need of some ether before sending it some
// TODO: Check from which address to send the ether, for now this defaults to eth.accounts[0]
function requestSomeEther(commWeb3WsRpc, address, cb) {
  let shh = commWeb3WsRpc.shh
  let message = messageString.buildDelimitedString(request.ether, address)

  whisperUtils.post(message, shh, WHISPER_TOPIC_ETHER, function (err, res) {
    if (err) { console.log('requestSomeEther ERROR:', err); }
    cb(err, res);
  });
}

// TODO: Maybe check that address is indeed in need of some ether before sending it some
// TODO: Check from which address to send the ether, for now this defaults to eth.accounts[0]
function addEtherResponseHandler(result, cb) {
  var web3HttpRpc = result.web3HttpRpc
  var shh = result.communicationNetwork.web3WsRpc.shh

  function onData(msg) {
    var message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request.ether) >= 0) {
      var address = message.substring(request.ether.length + 2)

      web3HttpRpc.eth.getAccounts(function (err, accounts) {
        if (accounts && accounts.length > 0) {
          web3HttpRpc.eth.getBalance(accounts[0], function (err, balance) {
            if (err) { console.log('addEtherResponseHandler getBalance ERROR:', err) }
            let stringBalance = balance.toString()
            let intBalance = parseInt(stringBalance)
            if (intBalance > 0) {
              var transaction = {
                from: accounts[0],
                to: address,
                value: (web3HttpRpc.utils.toWei('1', 'ether')).toString()
              }
              web3HttpRpc.eth.sendTransaction(transaction, function (err, res) {
                if (err) { console.log('addEtherResponseHandler ERROR:', err) }
              })
            }
          })
        }
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_ETHER], shh, onData)

  cb(null, result)
}

// TODO: Add to and from fields to validate origins & only respond to others requests
// TODO: Add check whether requester has correct permissions
// This will broadcast this node's enode to any 'request|enode' message
function addEnodeResponseHandler(result, cb) {
  let web3Ipc = result.web3Ipc
  let shh = result.communicationNetwork.web3WsRpc.shh

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request.enode) >= 0) {
      web3Ipc.admin.nodeInfo(function (err, nodeInfo) {
        if (err) { console.log('addEnodeResponseHandler nodeInfo ERROR:', err) }
        let enodeResponse = messageString.appendData(response.enode, nodeInfo.enode);
        enodeResponse = enodeResponse.replace('\[\:\:\]', result.localIpAddress)

        whisperUtils.post(enodeResponse, shh, WHISPER_TOPIC_ENODE, function (err, res) {
          if (err) { console.log('addEnodeResponseHandler post ERROR:', err); }
        })
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_ENODE], shh, onData)

  cb(null, result)
}

// TODO: Add to and from fields to validate origins & only respond to others requests
// TODO: Test assumption that we want to connect to all nodes that respond with enodes
// This requests other nodes for their enode and then waits for a response
function addEnodeRequestHandler(result, cb) {
  var comm = result.communicationNetwork;
  var shh = comm.web3WsRpc.shh;

  var message = request.enode;

  whisperUtils.postAtInterval(message, shh, 'Enode', 10 * 1000, function (err, intervalID) {
    if (err) { console.log('addEnodeRequestHandler post ERROR:', err) }
  })

  function onData(msg) {
    var message = null;
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload);
    }
    if (message && message.indexOf(response.enode) >= 0) {
      var enode = message.replace(response.enode, '').substring(1);
      events.emit('newEnode', enode);
    }
  }

  whisperUtils.addBootstrapSubscription(['Enode'], shh, onData)

  cb(null, result);
}

function copyCommunicationNodeKey(result, cb) {
  var cmd = `cp ${FILE_WHISPER_DEFAULTCOMMNODEKEY} ${FILE_WHISPER_COMMNODEKEY}`;
  var child = exec(cmd, function () {
    cb(null, result);
  });
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

// TODO: Add check whether requester has correct permissions
function genesisConfigHandler(result, cb) {
  let genesisPath = `${process.cwd()}/${FILE_GENESIS_QUORUM}`
  let web3WsRpc = result.web3WsRpc;

  function onData(msg) {
    if (result.genesisBlockConfigReady != true) {
      return
    }
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request.genesisConfig) >= 0) {
      fs.readFile(genesisPath, 'utf8', function (err, data) {
        if (err) { console.log('genesisConfigHandler readFile ERROR:', err); }
        let genesisConfig = messageString.appendData(response.genesisConfig, data);
        whisperUtils.post(genesisConfig, web3WsRpc.shh, WHISPER_TOPIC_GENESISCONFIG, function (err, res) {
          if (err) { console.log('genesisConfigHandler post ERROR:', err); }
        })
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_GENESISCONFIG], web3WsRpc.shh, onData)

  cb(null, result)
}

function staticNodesFileHandler(result, cb) {
  let staticNodesPath = `${process.cwd()}/${FILE_BLOCKCHAIN_STATICNODES}`
  let web3WsRpc = result.web3WsRpc;

  function onData(msg) {
    if (result.staticNodesFileReady != true) {
      return
    }
    var message = null;
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request.staticNodes) >= 0) {
      fs.readFile(staticNodesPath, 'utf8', function (err, data) {
        if (err) { console.log('staticNodesFileHandler readFile ERROR:', err) }
        var staticNodes = messageString.appendData(response.staticNodes, data)
        whisperUtils.post(staticNodes, web3WsRpc.shh, WHISPER_TOPIC_STATICNODES, function (err, res) {
          if (err) { console.log('staticNodesFileHandler post ERROR:', err) }
        })
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_STATICNODES], web3WsRpc.shh, onData)

  cb(null, result)
}

// TODO: Add to and from fields to validate origins
function getGenesisBlockConfig(result, cb) {

  console.log('[*] Requesting genesis block config. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedGenesisConfig = false
  let subscription = null

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(response.genesisConfig) >= 0) {
      console.log('received genesis config')
      if (receivedGenesisConfig == false) {
        receivedGenesisConfig = true
        if (subscription) {
          subscription.unsubscribe(function (err, res) {
            subscription = null
          })
        }
        let genesisConfig = message.replace(response.genesisConfig, '').substring(1)
        genesisConfig = genesisConfig.replace(/\\n/g, '')
        genesisConfig = genesisConfig.replace(/\\/g, '')
        fs.writeFile('quorum-genesis.json', genesisConfig, function (err, res) {
          cb(err, result)
        })
      }
    }
  }

  whisperUtils.addBootstrapSubscription(['GenesisConfig'], shh, onData, function (err, _subscription) {
    subscription = _subscription
  })

  let message = request.genesisConfig;
  whisperUtils.postAtInterval(message, shh, 'GenesisConfig', 5 * 1000, function (err, intervalID) {
    let checkGenesisBlock = setInterval(function () {
      if (receivedGenesisConfig) {
        clearInterval(intervalID)
        clearInterval(checkGenesisBlock)
      }
    }, 1000)
  })
}

// TODO: Add to and from fields to validate origins
function getStaticNodesFile(result, cb) {

  console.log('[*] Requesting static nodes file. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedStaticNodesFile = false
  let subscription = null

  function onData(msg) {
    var message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(response.staticNodes) >= 0) {
      console.log('received static nodes file')
      if (receivedStaticNodesFile == false) {
        receivedStaticNodesFile = true
        if (subscription) {
          subscription.unsubscribe(function (err, res) {
            subscription = null
          })
        }
        var staticNodesFile = message.replace(response.staticNodes, '').substring(1)
        staticNodesFile = staticNodesFile.replace(/\\n/g, '')
        staticNodesFile = staticNodesFile.replace(/\\/g, '')
        fs.writeFile('blockchain/static-nodes.json', staticNodesFile, function (err, res) {
          cb(err, result)
        })
      }
    }
  }

  whisperUtils.addBootstrapSubscription(['StaticNodes'], shh, onData, function (err, _subscription) {
    subscription = _subscription
  })

  let message = request.staticNodes;
  whisperUtils.postAtInterval(message, shh, 'StaticNodes', 5 * 1000, function (err, intervalID) {
    let checkStaticNodes = setInterval(function () {
      if (receivedStaticNodesFile) {
        clearInterval(intervalID)
        clearInterval(checkStaticNodes)
      }
    }, 1000)
  })
}

function startCommunicationNode(result, cb) {
  var options = { encoding: 'utf8', timeout: 100 * 1000 };
  var cmd = `./${SCRIPT_WHISPER_STARTCOMMNODE}`;
  cmd += ' ' + ports.communicationNodeRpc
  cmd += ' ' + ports.communicationNode
  cmd += ' ' + ports.communicationNodeWsRpc
  var child = exec(cmd, options);
  child.stdout.on('data', function (data) {
    cb(null, result);
  });
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

function startCommunicationNetwork(result, cb) {
  console.log('[*] Starting communication node...')
  let networkSetup = async.seq(
    utils.clearDirectories,
    utils.createDirectories,
    copyCommunicationNodeKey,
    startCommunicationNode,
    utils.createWeb3Connection,
    networkMembership.networkMembershipRequestHandler,
    genesisConfigHandler,
    staticNodesFileHandler
  )

  let config = {
    networkMembership: result.networkMembership,
    folders: [FOLDER_WHISPERNODE, FOLDER_WHISPER_GETH],
    web3IpcHost: FILE_WHISPER_GETHIPC,
    web3RpcProvider: WHISPERPROVIDER_RPC_LOCALHOST + ports.communicationNodeRpc,
    web3WsRpcProvider: WHISPERPROVIDER_WS_LOCALHOST + ports.communicationNodeWsRpc
  }
  networkSetup(config, function (err, commNet) {
    if (err) { console.log('ERROR:', err) }
    result.communicationNetwork = commNet
    cb(err, result)
  })
}

function joinCommunicationNetwork(config, cb) {

  let remoteIpAddress = config.remoteIpAddress
  let remoteEnode = config.remoteEnode
  if (remoteEnode == null) {
    remoteEnode = "enode://9443bd2c5ccc5978831088755491417fe0c3866537b5e9638bcb6ad34cb9bcc58a9338bb492590ff200a54b43a6a03e4a7e33fa111d0a7f6b7192d1ca050f300@"
      + remoteIpAddress
      + ":"
      + ports.remoteCommunicationNode
  }

  console.log('Joining enode:', remoteEnode)

  console.log('[*] Joining communication network...');
  var seqFunction = async.seq(
    utils.clearDirectories,
    utils.createDirectories,
    startCommunicationNode,
    utils.createWeb3Connection,
    utils.connectToPeer
  );

  var result = {
    folders: ['communication_node', 'communication_node/geth'],
    "web3IpcHost": './communication_node/geth.ipc',
    "web3RpcProvider": 'http://localhost:' + ports.communicationNodeRpc,
    "web3WsRpcProvider": 'ws://localhost:' + ports.communicationNodeWsRpc,
    "enode": remoteEnode
  };
  seqFunction(result, function (err, commNet) {
    if (err) { console.log('ERROR:', err) }
    config.communicationNetwork = commNet
    console.log('[*] Communication network joined');
    cb(err, config);
  });
}


exports.startCommunicationNetwork = startCommunicationNetwork
exports.joinCommunicationNetwork = joinCommunicationNetwork
exports.addEtherResponseHandler = addEtherResponseHandler
exports.addEnodeResponseHandler = addEnodeResponseHandler
exports.addEnodeRequestHandler = addEnodeRequestHandler
exports.getGenesisBlockConfig = getGenesisBlockConfig
exports.getStaticNodesFile = getStaticNodesFile
exports.StaticNodesFileHandler = staticNodesFileHandler
exports.requestSomeEther = requestSomeEther

exports.publishNodeInformation = nodeInformation.publishNodeInformation
exports.RequestNetworkMembership = networkMembership.RequestNetworkMembership
exports.requestExistingRaftNetworkMembership = networkMembership.requestExistingRaftNetworkMembership
exports.existingRaftNetworkMembership = networkMembership.existingRaftNetworkMembership
exports.existingIstanbulNetworkMembership = istanbulNetworkMembership.existingIstanbulNetworkMembership
exports.requestExistingIstanbulNetworkMembership = istanbulNetworkMembership.requestExistingIstanbulNetworkMembership
