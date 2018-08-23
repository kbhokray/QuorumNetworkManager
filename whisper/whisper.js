let exec = require('child_process').exec;
let fs = require('fs');
let async = require('async');

let events = require('../eventEmitter.js');
let utils = require('../utils');
let ports = require('../config.js').ports
let networkMembership = require('./networkMembership.js');
let istanbulNetworkMembership = require('./istanbulMembership');
let nodeInformation = require('./nodeInformation.js');
let messageString = require('./messageStrings.js');
let whisperUtils = require('./utils.js');
let { REQUEST, RESPONSE } = messageString;
const {
  FOLDER_COMMUNICATIONNODE, FOLDER_COMMNODE_GETH,
  FILE_WHISPER_DEFAULTCOMMNODEKEY, FILE_COMMNODE_NODEKEY,
  WHISPER_TOPIC_GENESISCONFIG, WHISPER_TOPIC_STATICNODES,
  WHISPER_TOPIC_ENODE, WHISPER_TOPIC_ETHER,
  FILE_COMMNODE_GETHIPC,
  COMMNODE_RPCPROVIDER_LOCALHOST, COMMNODE_WSPROVIDER_LOCALHOST,
  FILE_BLOCKCHAIN_GENESIS, FILE_BLOCKCHAIN_STATICNODES,
  SCRIPT_WHISPER_STARTCOMMNODE,
  EVENT_PEERHANDLER_NEWENODE
} = require('../constants');


// TODO: Maybe check that address is indeed in need of some ether before sending it some
// TODO: Check from which address to send the ether, for now this defaults to eth.accounts[0]
let requestSomeEther = (commWeb3WsRpc, address, cb) => {
  let shh = commWeb3WsRpc.shh
  let message = messageString.buildDelimitedString(REQUEST.ETHER, address)

  whisperUtils.post(message, shh, WHISPER_TOPIC_ETHER, (err, res) => {
    if (err) { console.log('requestSomeEther ERROR:', err); }
    cb(err, res);
  });
}

// TODO: Maybe check that address is indeed in need of some ether before sending it some
// TODO: Check from which address to send the ether, for now this defaults to eth.accounts[0]
let addEtherResponseHandler = (result, cb) => {
  let web3HttpRpc = result.web3HttpRpc
  let shh = result.communicationNetwork.web3WsRpc.shh

  let onData = (msg) => {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(REQUEST.ETHER) >= 0) {
      let address = message.substring(REQUEST.ETHER.length + 2)

      web3HttpRpc.eth.getAccounts((err, accounts) => {
        if (accounts && accounts.length > 0) {
          web3HttpRpc.eth.getBalance(accounts[0], (err, balance) => {
            if (err) { console.log('addEtherResponseHandler getBalance ERROR:', err) }
            let stringBalance = balance.toString()
            let intBalance = parseInt(stringBalance)
            if (intBalance > 0) {
              let transaction = {
                from: accounts[0],
                to: address,
                value: (web3HttpRpc.utils.toWei('1', 'ether')).toString()
              }
              web3HttpRpc.eth.sendTransaction(transaction, (err, res) => {
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
let addEnodeResponseHandler = (result, cb) => {
  let web3Ipc = result.web3Ipc
  let shh = result.communicationNetwork.web3WsRpc.shh

  let onData = (msg) => {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(REQUEST.ENODE) >= 0) {
      web3Ipc.admin.nodeInfo((err, nodeInfo) => {
        if (err) { console.log('addEnodeResponseHandler nodeInfo ERROR:', err) }
        let enodeResponse = messageString.appendData(RESPONSE.ENODE, nodeInfo.enode);
        enodeResponse = enodeResponse.replace('\[\:\:\]', result.localIpAddress)

        whisperUtils.post(enodeResponse, shh, WHISPER_TOPIC_ENODE, (err, res) => {
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
let addEnodeRequestHandler = (result, cb) => {
  let comm = result.communicationNetwork;
  let shh = comm.web3WsRpc.shh;

  let message = REQUEST.ENODE;

  whisperUtils.postAtInterval(message, shh, WHISPER_TOPIC_ENODE, 10 * 1000, (err, intervalId) => {
    if (err) { console.log('addEnodeRequestHandler post ERROR:', err) }
  })

  let onData = (msg) => {
    let message = null;
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload);
    }
    if (message && message.indexOf(RESPONSE.ENODE) >= 0) {
      let enode = message.replace(RESPONSE.ENODE, '').substring(1);
      events.emit(EVENT_PEERHANDLER_NEWENODE, enode);
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_ENODE], shh, onData)

  cb(null, result);
}

let copyCommunicationNodeKey = (result, cb) => {
  let cmd = `cp ${FILE_WHISPER_DEFAULTCOMMNODEKEY} ${FILE_COMMNODE_NODEKEY}`;
  let child = exec(cmd, () => {
    cb(null, result);
  });
  child.stderr.on('data', (error) => {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

// TODO: Add check whether requester has correct permissions
let genesisConfigHandler = (result, cb) => {
  let genesisPath = `${process.cwd()}/${FILE_BLOCKCHAIN_GENESIS}`
  let web3WsRpc = result.web3WsRpc;

  let onData = (msg) => {
    if (result.genesisBlockConfigReady != true) {
      return
    }
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(REQUEST.GENESISCONFIG) >= 0) {
      fs.readFile(genesisPath, 'utf8', (err, data) => {
        if (err) { console.log('genesisConfigHandler readFile ERROR:', err); }
        let genesisConfig = messageString.appendData(RESPONSE.GENESISCONFIG, data);
        whisperUtils.post(genesisConfig, web3WsRpc.shh, WHISPER_TOPIC_GENESISCONFIG, (err, res) => {
          if (err) { console.log('genesisConfigHandler post ERROR:', err); }
        })
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_GENESISCONFIG], web3WsRpc.shh, onData)

  cb(null, result)
}

let staticNodesFileHandler = (result, cb) => {
  let staticNodesPath = `${process.cwd()}/${FILE_BLOCKCHAIN_STATICNODES}`
  let web3WsRpc = result.web3WsRpc;

  let onData = (msg) => {
    if (result.staticNodesFileReady != true) {
      return
    }
    let message = null;
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(REQUEST.STATICNODES) >= 0) {
      fs.readFile(staticNodesPath, 'utf8', (err, data) => {
        if (err) { console.log('staticNodesFileHandler readFile ERROR:', err) }
        let staticNodes = messageString.appendData(RESPONSE.STATICNODES, data)
        whisperUtils.post(staticNodes, web3WsRpc.shh, WHISPER_TOPIC_STATICNODES, (err, res) => {
          if (err) { console.log('staticNodesFileHandler post ERROR:', err) }
        })
      })
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_STATICNODES], web3WsRpc.shh, onData)

  cb(null, result)
}

// TODO: Add to and from fields to validate origins
let getGenesisBlockConfig = (result, cb) => {

  console.log('[*] Requesting genesis block config. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedGenesisConfig = false
  let subscription = null

  let onData = (msg) => {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(RESPONSE.GENESISCONFIG) >= 0) {
      console.log('Received genesis config')
      if (receivedGenesisConfig === false) {
        receivedGenesisConfig = true
        if (subscription) {
          subscription.unsubscribe((err, res) => {
            subscription = null
          })
        }
        let genesisConfig = message.replace(RESPONSE.GENESISCONFIG, '').substring(1)
        genesisConfig = genesisConfig.replace(/\\n/g, '')
        genesisConfig = genesisConfig.replace(/\\/g, '')
        fs.writeFile(FILE_BLOCKCHAIN_GENESIS, genesisConfig, (err, res) => {
          cb(err, result)
        })
      }
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_GENESISCONFIG], shh, onData, (err, _subscription) => {
    subscription = _subscription
  })

  let message = REQUEST.GENESISCONFIG;
  whisperUtils.postAtInterval(message, shh, WHISPER_TOPIC_GENESISCONFIG, 5 * 1000, (err, intervalId) => {
    let checkGenesisBlock = setInterval(() => {
      if (receivedGenesisConfig) {
        clearInterval(intervalId)
        clearInterval(checkGenesisBlock)
      }
    }, 1000)
  })
}

// TODO: Add to and from fields to validate origins
let getStaticNodesFile = (result, cb) => {

  console.log('[*] Requesting static nodes file. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedStaticNodesFile = false
  let subscription = null

  let onData = (msg) => {
    var message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(RESPONSE.STATICNODES) >= 0) {
      console.log('Received static nodes file')
      if (receivedStaticNodesFile === false) {
        receivedStaticNodesFile = true
        if (subscription) {
          subscription.unsubscribe((err, res) => {
            subscription = null
          })
        }
        var staticNodesFile = message.replace(RESPONSE.STATICNODES, '').substring(1)
        staticNodesFile = staticNodesFile.replace(/\\n/g, '')
        staticNodesFile = staticNodesFile.replace(/\\/g, '')
        fs.writeFile(FILE_BLOCKCHAIN_STATICNODES, staticNodesFile, (err, res) => {
          cb(err, result)
        })
      }
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_STATICNODES], shh, onData, (err, _subscription) => {
    subscription = _subscription
  })

  let message = REQUEST.STATICNODES;
  whisperUtils.postAtInterval(message, shh, WHISPER_TOPIC_STATICNODES, 5 * 1000, (err, intervalId) => {
    let checkStaticNodes = setInterval(() => {
      if (receivedStaticNodesFile) {
        clearInterval(intervalId)
        clearInterval(checkStaticNodes)
      }
    }, 1000)
  })
}

let startCommunicationNode = (result, cb) => {
  let options = { encoding: 'utf8', timeout: 100 * 1000 };
  let cmd = `./${SCRIPT_WHISPER_STARTCOMMNODE}`;
  cmd += ' ' + ports.communicationNodeRpc
  cmd += ' ' + ports.communicationNode
  cmd += ' ' + ports.communicationNodeWsRpc
  let child = exec(cmd, options);
  child.stdout.on('data', (data) => {
    cb(null, result);
  });
  child.stderr.on('data', (error) => {
    console.log('ERROR:', error);
    cb(error, null);
  });
}

let startCommunicationNetwork = (result, cb) => {
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
    folders: [FOLDER_COMMUNICATIONNODE, FOLDER_COMMNODE_GETH],
    web3IpcHost: FILE_COMMNODE_GETHIPC,
    web3RpcProvider: COMMNODE_RPCPROVIDER_LOCALHOST + ports.communicationNodeRpc,
    web3WsRpcProvider: COMMNODE_WSPROVIDER_LOCALHOST + ports.communicationNodeWsRpc
  }

  networkSetup(config, (err, commNet) => {
    if (err) { console.log('ERROR:', err) }
    result.communicationNetwork = commNet
    cb(err, result)
  })
}

let joinCommunicationNetwork = (config, cb) => {

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
  let seqFunction = async.seq(
    utils.clearDirectories,
    utils.createDirectories,
    startCommunicationNode,
    utils.createWeb3Connection,
    utils.connectToPeer
  );

  let result = {
    folders: [FOLDER_COMMUNICATIONNODE, FOLDER_COMMNODE_GETH],
    web3IpcHost: FILE_COMMNODE_GETHIPC,
    web3RpcProvider: COMMNODE_RPCPROVIDER_LOCALHOST + ports.communicationNodeRpc,
    web3WsRpcProvider: COMMNODE_WSPROVIDER_LOCALHOST + ports.communicationNodeWsRpc,
    enode: remoteEnode
  };
  seqFunction(result, (err, commNet) => {
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
exports.staticNodesFileHandler = staticNodesFileHandler
exports.requestSomeEther = requestSomeEther

exports.publishNodeInformation = nodeInformation.publishNodeInformation
exports.requestNetworkMembership = networkMembership.requestNetworkMembership
exports.requestExistingRaftNetworkMembership = networkMembership.requestExistingRaftNetworkMembership
exports.existingRaftNetworkMembership = networkMembership.existingRaftNetworkMembership
exports.existingIstanbulNetworkMembership = istanbulNetworkMembership.existingIstanbulNetworkMembership
exports.requestExistingIstanbulNetworkMembership = istanbulNetworkMembership.requestExistingIstanbulNetworkMembership
